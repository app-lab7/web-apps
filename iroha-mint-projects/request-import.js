import { fields } from './model.js';

const groups = [
  ['連絡先', ['contact']], ['プロフィールURL', ['profile_url']],
  ['公開希望時期', ['deadline', 'deadline_other']], ['活動場所', ['platform', 'platform_other']],
  ['事務所', ['agency']], ['サイトの目的', ['site_goal', 'site_goal_other']],
  ['色・背景・雰囲気', ['colors', 'color_notes', 'ng_color', 'bg', 'bg_notes', 'mood', 'mood_notes']],
  ['モチーフ・文字', ['motif', 'motif_other', 'ng_motif', 'font', 'font_notes']],
  ['ページ構成', ['layout', 'layout_notes']], ['参考', ['reference']],
  ['希望する機能', ['features', 'features_other']], ['公開後に更新したい項目', ['update_items', 'update_other']],
  ['素材', ['assets', 'assets_other']], ['メッセージ', ['message']],
];

function asText(value) {
  if (Array.isArray(value)) return value.filter(item => typeof item === 'string').map(item => item.trim()).filter(Boolean).join('、');
  return typeof value === 'string' ? value.trim() : '';
}

const copyFields = new Map([
  ["HPでいちばん伝えたいこと", "site_goal"],
  ["HPの目的・想い（自由記述）", "site_goal_other"],
  ["自分で更新したいもの", "update_items"],
  ["更新の希望（自由記述）", "update_other"],
  ["希望の伝え方", "input_mode"],
  ["色の希望（自由記述）", "color_notes"],
  ["背景の希望（自由記述）", "bg_notes"],
  ["雰囲気（自由記述）", "mood_notes"],
  ["文字（自由記述）", "font_notes"],
  ["ページ構成（自由記述）", "layout_notes"],
  ["活動場所（自由記述）", "platform_other"],
  ["希望時期（自由記述）", "deadline_other"],
  ["素材（自由記述）", "assets_other"],
  ["活動名", "name"],
  ["連絡先", "contact"],
  ["活動場所", "platform"],
  ["事務所", "agency"],
  ["プロフィールページ", "profile_url"],
  ["色", "colors"],
  ["背景", "bg"],
  ["NGの色", "ng_color"],
  ["雰囲気", "mood"],
  ["モチーフ", "motif"],
  ["ほかのモチーフ", "motif_other"],
  ["NGモチーフ", "ng_motif"],
  ["文字", "font"],
  ["つくり", "layout"],
  ["参考", "reference"],
  ["ほしい機能", "features"],
  ["ほかにほしいもの", "features_other"],
  ["希望時期", "deadline"],
  ["素材", "assets"],
  ["メッセージ", "message"],
  ["個人情報の取り扱いへの同意", "consent"]
]);

export function parseCopiedRequest(text) {
  const invalid = '依頼管理画面で「回答をコピー」を押して、回答全文を貼り付けてください。';
  const lines = text.trim().split(/\r?\n/);
  if (lines.shift() !== '【HP制作 ご希望シート】') throw new Error(invalid);
  const id = lines.shift()?.match(/^受付番号[：:]\s*(.+)$/)?.[1];
  const received = lines.shift()?.match(/^送信日時[：:]\s*(.+)$/)?.[1];
  const status = lines.shift()?.match(/^対応状況[：:]\s*(.*)$/)?.[1];
  if (!id || !received || status === undefined) throw new Error(invalid);

  const sections = new Map();
  let current;
  for (const line of lines) {
    const label = line.startsWith('■') && copyFields.get(line.slice(1).trim());
    if (label) {
      if (sections.has(label)) throw new Error('回答本文に項目名と同じ行があります。「JSONファイルから取り込む」を使ってください。');
      current = [];
      sections.set(label, current);
    } else if (current) {
      current.push(line);
    }
  }
  const data = Object.fromEntries([...sections].map(([key, value]) => [key, value.join('\n').trim()]));
  if (!data.name) throw new Error(invalid);
  return createProject({ id, status, data }, received, invalid);
}

export function convertRequest(response) {
  const received = asText(response?.created_at);
  const time = received && !Number.isNaN(Date.parse(received))
    ? new Date(received).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '';
  return createProject(response, time, '依頼管理画面の「JSONを保存」で保存した回答ファイルを選んでください。');
}

function createProject(response, time, invalid) {
  const data = response?.data;
  const id = asText(response?.id).toLowerCase();
  const name = asText(data?.name);
  if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/.test(id) || !name || !time) throw new Error(invalid);
  const status = asText(response.status);
  const stage = status === '制作中' ? 'working' : ['保留', 'アーカイブ'].includes(status) ? 'hold' : 'inquiry';
  const notes = ['受付番号 ' + id, '受付日時 ' + time];
  if (status) notes.push('依頼の対応状況 ' + status);
  for (const [caption, keys] of groups) {
    const values = keys.map(key => asText(data[key])).filter(Boolean);
    if (values.length) notes.push(caption + '：' + values.join(' / '));
  }
  const summary = notes.join('\n');
  const overflow = '\n続きは依頼管理画面の元の回答を確認してください。';
  return {
    id,
    customer: name.slice(0, fields.customer),
    title: (name + '｜ホームページ制作').slice(0, fields.title),
    stage,
    plan: '未定',
    notes: summary.length > fields.notes ? summary.slice(0, fields.notes - overflow.length) + overflow : summary,
    updatedAt: new Date().toISOString(),
  };
}
