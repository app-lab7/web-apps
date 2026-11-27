import { amountFields, fields, plans, safeUrl, stages } from './model.js';

const database = indexedDB.open('iroha-mint-projects-v1', 1);
const ready = new Promise((resolve, reject) => {
  database.onupgradeneeded = () => database.result.createObjectStore('projects', { keyPath: 'id' });
  database.onsuccess = () => resolve(database.result);
  database.onerror = () => reject(new Error('このブラウザで案件の保存領域を開けませんでした。'));
  database.onblocked = () => reject(new Error('別のタブで管理サイトを閉じてから再読み込みしてください。'));
});
ready.catch(() => {});
const staleText = '別の画面で案件が更新されました。再読み込みしてから操作してください。';

function normalize(input) {
  if (!input || typeof input !== 'object') throw new Error('案件の形式を確認してください。');
  const record = { prototypeReady: input.prototypeReady === true };
  for (const [key, limit] of Object.entries(fields)) {
    const raw = input[key] ?? '';
    if (typeof raw !== 'string' || raw.length > limit) throw new Error('案件の入力内容を確認してください。');
    record[key] = raw.trim();
  }
  for (const [key, label] of Object.entries(amountFields)) {
    const value = input[key] ?? '';
    if (typeof value !== 'string' || (value !== '' && !/^\d{1,12}$/.test(value))) {
      throw new Error(label + 'には12桁以内の整数を入力してください。');
    }
    record[key] = value === '' ? '' : BigInt(value).toString();
  }
  if (!record.customer || !record.title || !stages.some(([stage]) => stage === record.stage) || !plans.includes(record.plan)) {
    throw new Error('お客様名・案件名・制作段階・プランを確認してください。');
  }
  if (record.deadline && (!/^\d{4}-\d{2}-\d{2}$/.test(record.deadline) ||
      Number.isNaN(Date.parse(record.deadline)) ||
      new Date(record.deadline).toISOString().slice(0, 10) !== record.deadline)) {
    throw new Error('公開予定日を確認してください。');
  }
  if (['preview', 'live', 'materials'].some(key => record[key] && !safeUrl(record[key]))) {
    throw new Error('URLは http:// または https:// から入力してください。');
  }
  return record;
}

async function transaction(mode, operation) {
  const db = await ready;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('projects', mode);
    let result;
    let error;
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(error || new Error('案件の読み込み・保存に失敗しました。'));
    operation(tx.objectStore('projects'), value => { result = value; }, failure => {
      error = failure;
      tx.abort();
    });
  });
}

export const projectStore = {
  list() {
    return transaction('readonly', (store, finish) => {
      const request = store.getAll();
      request.onsuccess = () => finish(request.result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    });
  },
  save(input, id) {
    const record = normalize(input);
    const current = { ...record, id: id || crypto.randomUUID(), updatedAt: new Date().toISOString() };
    return transaction('readwrite', (store, finish, abort) => {
      if (!id) {
        store.add(current);
        finish(current);
        return;
      }
      const read = store.get(id);
      read.onsuccess = () => {
        if (read.result?.updatedAt !== input.updatedAt) return abort(new Error(staleText));
        store.put(current);
        finish(current);
      };
    });
  },
  remove(id, updatedAt) {
    return transaction('readwrite', (store, finish, abort) => {
      const read = store.get(id);
      read.onsuccess = () => {
        if (read.result?.updatedAt !== updatedAt) return abort(new Error(staleText));
        store.delete(id);
        finish();
      };
    });
  },
  restore(backup) {
    if (backup?.version !== 1 || !Array.isArray(backup.records)) throw new Error('バックアップの形式が異なります。');
    const records = new Map();
    for (const entry of backup.records) {
      const record = normalize(entry);
      if (typeof entry.id !== 'string' || !/^[a-f0-9-]{36}$/i.test(entry.id) ||
          typeof entry.updatedAt !== 'string' || Number.isNaN(Date.parse(entry.updatedAt))) {
        throw new Error('バックアップ内の案件情報が破損しています。');
      }
      records.set(entry.id, { ...record, id: entry.id, updatedAt: new Date(entry.updatedAt).toISOString() });
    }
    return transaction('readwrite', (store, finish) => {
      const all = store.getAllKeys();
      all.onsuccess = () => {
        const current = new Set(all.result);
        let added = 0;
        for (const [id, record] of records) {
          if (current.has(id)) continue;
          store.add(record);
          added += 1;
        }
        finish(added);
      };
    });
  },
};
