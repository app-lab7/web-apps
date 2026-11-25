import { convertRequest, parseCopiedRequest } from './request-import.js?v=request-copy';
import { projectStore } from './storage.js';
import { amountFields, fields, formatYen, paymentStatus, plans, safeUrl, stages, totalRevenue } from './model.js?v=project-status';

const $ = selector => document.querySelector(selector);
const form = $('#project-form');
const editor = $('#editor');
const list = $('#list');
const expandedProjects = new Set();
const state = { data: [], view: 'all', loading: true, error: '', editing: null, busy: false };
const stageInfo = new Map(stages.map(([key, label, tone]) => [key, { label, tone }]));
const urlFields = [['preview', '確認用'], ['live', '公開'], ['materials', '資料']];
const dateLabel = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', dateStyle: 'medium' });
const dateKey = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' });

function create(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function makeButton(text, className) {
  const button = create('button', text, className);
  button.type = 'button';
  return button;
}
for (const [key, label] of stages) {
  $('#stage-filter').add(new Option(label, key));
  form.elements.stage.add(new Option(label, key));
}
for (const plan of plans) form.elements.plan.add(new Option(plan, plan));

const filters = {
  all: () => true,
  active: project => !['live', 'hold'].includes(project.stage),
  waiting: project => ['assets', 'review'].includes(project.stage),
  live: project => project.stage === 'live',
};

function shownProjects() {
  const query = $('#search').value.normalize('NFKC').toLocaleLowerCase('ja').trim();
  const stage = $('#stage-filter').value;
  const projects = state.data.filter(project =>
    filters[state.view](project) && (!stage || project.stage === stage) &&
    [project.customer, project.title].some(value => value.normalize('NFKC').toLocaleLowerCase('ja').includes(query)));
  return projects.sort((a, b) => {
    if ($('#sort').value === 'deadline') {
      const byDate = (a.deadline || '9999-12-31').localeCompare(b.deadline || '9999-12-31');
      if (byDate) return byDate;
    }
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

function render() {
  $('.heading .add').disabled = state.loading || Boolean(state.error);
  $('#export').disabled = !state.data.length || state.loading || Boolean(state.error);
  $('#result-count').textContent = '';
  for (const [key, amount] of Object.entries(totalRevenue(state.data))) {
    $('#total-' + key).textContent = state.loading || state.error ? '—' : formatYen(amount);
  }
  for (const [view, filter] of Object.entries(filters)) {
    $('#count-' + view).textContent = state.loading || state.error ? '–' : state.data.filter(filter).length;
    $('[data-view="' + view + '"]').setAttribute('aria-pressed', state.view === view);
  }
  if (state.loading) return;
  list.replaceChildren();
  if (state.error) {
    const message = create('div', undefined, 'empty');
    const retry = makeButton('再読み込み', 'button secondary');
    retry.addEventListener('click', load);
    message.append(create('h3', '案件を読み込めませんでした'), create('p', state.error), retry);
    list.append(message);
    return;
  }
  const projects = shownProjects();
  $('#result-count').textContent = projects.length + '件';
  if (!state.data.length) {
    list.append($('#empty').content.cloneNode(true));
    return;
  }
  if (!projects.length) {
    const message = create('div', undefined, 'empty');
    const reset = makeButton('絞り込みを解除', 'button secondary');
    reset.addEventListener('click', () => {
      state.view = 'all';
      $('#search').value = '';
      $('#stage-filter').value = '';
      render();
      $('#search').focus();
    });
    message.append(create('h3', '条件に一致する案件がありません'), create('p', '検索語や制作段階を変更してください。'), reset);
    list.append(message);
    return;
  }
  const rows = create('div', undefined, 'project-rows');
  for (const project of projects) rows.append(renderProject(project));
  list.append(rows);
}

function renderProject(project) {
  const disclosure = create('details', undefined, 'project-disclosure');
  disclosure.open = expandedProjects.has(project.id);
  disclosure.addEventListener('toggle', () => {
    if (!disclosure.isConnected) return;
    if (disclosure.open) expandedProjects.add(project.id);
    else expandedProjects.delete(project.id);
  });
  const summary = create('summary', undefined, 'project-summary');
  summary.dataset.plan = project.plan;
  summary.title = project.plan;
  const label = create('span', undefined, 'project-summary-label');
  label.append(create('span', project.customer));
  const badges = create('span', undefined, 'project-statuses');
  const [paymentLabel, paymentTone, paymentHint] = paymentStatus(project);
  const payment = create('span', paymentLabel, 'project-status');
  payment.dataset.tone = paymentTone;
  if (paymentHint) payment.title = paymentHint;

  const published = project.stage === 'live';
  const publication = create('span', published ? '公開済' : '未公開', 'project-status');
  publication.dataset.tone = published ? 'complete' : 'pending';
  badges.append(payment, publication);
  label.append(badges);
  summary.append(label);
  disclosure.append(summary);

  const panel = create('div', undefined, 'project-detail');
  const heading = create('div', undefined, 'project-detail-heading');
  const stage = stageInfo.get(project.stage);
  const badge = create('span', stage.label, 'badge');
  badge.dataset.tone = stage.tone;
  const edit = makeButton('編集', 'button secondary edit');
  edit.setAttribute('aria-label', project.title + 'を編集');
  edit.addEventListener('click', () => openEditor(project));
  heading.append(create('h3', project.title), badge, create('span', project.plan, 'project-plan'), edit);
  panel.append(heading);

  const info = create('dl', undefined, 'project-facts');
  function addFact(label, content) {
    const item = create('div');
    const value = create('dd');
    value.append(content);
    item.append(create('dt', label), value);
    info.append(item);
    return value;
  }

  const deadline = project.deadline ? dateLabel.format(new Date(project.deadline)) : '—';
  const due = addFact('公開予定', deadline);
  if (project.deadline && project.deadline < dateKey.format(new Date()) && !['live', 'hold'].includes(project.stage)) {
    due.className = 'overdue';
    due.append(create('small', '予定日超過', 'customer'));
  }
  addFact('次にやること', project.next || '—');
  const rate = project.agreed || project.quoted;
  const fees = addFact('料金・入金', rate ? (project.agreed ? '確定 ' : '見積 ') + formatYen(rate) : '—');
  if (project.received) fees.append(create('small', '入金 ' + formatYen(project.received), 'customer'));

  const links = create('div', undefined, 'links');
  for (const [field, label] of urlFields) {
    const href = safeUrl(project[field]);
    if (!href) continue;
    const link = create('a', label);
    link.href = href;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', project.title + 'の' + label + 'URLを開く');
    links.append(link);
  }
  addFact('URL', links.childElementCount ? links : '—');
  panel.append(info);
  disclosure.append(panel);
  return disclosure;
}

async function load() {
  state.loading = true;
  state.error = '';
  list.replaceChildren(create('p', '案件を読み込み中…', 'loading'));
  render();
  try {
    const data = await projectStore.list();
    if (!Array.isArray(data)) throw new Error('案件データを読み取れませんでした。');
    state.data = data;
  } catch (error) {
    state.error = error.message;
  } finally {
    state.loading = false;
    render();
  }
}
let toastTimer;
function notify(text) {
  clearTimeout(toastTimer);
  $('#toast').textContent = text;
  toastTimer = setTimeout(() => { $('#toast').textContent = ''; }, 2800);
}
function formError(text = '') {
  $('#form-error').textContent = text;
  $('#form-error').hidden = !text;
}
function openEditor(project = null) {
  if (state.loading || state.error || editor.open) return;
  state.editing = project;
  form.reset();
  formError();
  $('#editor-title').textContent = project ? '案件を編集' : '新規案件';
  $('#delete').hidden = !project;
  if (project) {
    for (const field of [...Object.keys(fields), ...Object.keys(amountFields)]) form.elements[field].value = project[field] ?? '';
  }
  editor.showModal();
  form.elements.customer.focus();
}
function setBusy(busy) {
  state.busy = busy;
  for (const button of form.querySelectorAll('button')) button.disabled = busy;
  for (const field of form.querySelectorAll('fieldset')) field.disabled = busy;
}
editor.addEventListener('cancel', event => {
  if (state.busy) event.preventDefault();
});
for (const button of form.querySelectorAll('[data-close]')) button.addEventListener('click', () => editor.close());

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (state.busy) return;
  formError();
  const payload = Object.fromEntries(new FormData(form));
  if (!payload.customer.trim() || !payload.title.trim()) {
    formError('お客様名と案件名を入力してください。');
    return;
  }
  for (const [field, label] of urlFields) {
    if (payload[field] && !safeUrl(payload[field])) {
      formError(label + 'のURLは http:// または https:// から入力してください。');
      return;
    }
  }
  const existing = state.editing;
  if (existing) payload.updatedAt = existing.updatedAt;
  setBusy(true);
  try {
    const saved = await projectStore.save(payload, existing?.id);
    state.data = [saved, ...state.data.filter(item => item.id !== saved.id)];
    if (!existing) {
      state.view = 'all';
      $('#search').value = '';
      $('#stage-filter').value = '';
      $('#sort').value = 'updated';
    }
    editor.close();
    render();
    notify('案件を保存しました');
  } catch (error) {
    formError(error.message);
  } finally {
    setBusy(false);
  }
});
$('#delete').addEventListener('click', async () => {
  const project = state.editing;
  if (!project || state.busy || !confirm('「' + project.title + '」を削除しますか？ この操作は取り消せません。')) return;
  setBusy(true);
  formError();
  try {
    await projectStore.remove(project.id, project.updatedAt);
    expandedProjects.delete(project.id);
    state.data = state.data.filter(item => item.id !== project.id);
    editor.close();
    render();
    notify('案件を削除しました');
  } catch (error) {
    formError(error.message);
  } finally {
    setBusy(false);
  }
});

document.addEventListener('click', event => {
  if (event.target.closest('.add')) openEditor();
  const view = event.target.closest('[data-view]')?.dataset.view;
  if (view) {
    state.view = view;
    $('#stage-filter').value = '';
    render();
  }
});
$('#search').addEventListener('input', render);
$('#stage-filter').addEventListener('change', () => {
  state.view = 'all';
  render();
});
$('#sort').addEventListener('change', render);

$('#export').addEventListener('click', () => {
  const columns = [
    ['customer', 'お客様名'], ['title', '案件名'], ['stage', '制作段階'], ['plan', 'プラン'],
    ['deadline', '公開予定日'], ['next', '次にやること'],
    ...Object.entries(amountFields).map(([key, label]) => [key, label + '（円）']), ['preview', '確認用URL'],
    ['live', '公開URL'], ['materials', '素材・資料URL'], ['notes', 'メモ'], ['updatedAt', '更新日時'],
  ];
  const quote = value => {
    const text = String(value ?? '');
    const cell = /^\s*[=+\-@]|^[\t\r\n]/.test(text) ? "'" + text : text;
    return '"' + cell.replaceAll('"', '""') + '"';
  };
  const rows = [columns.map(([, label]) => label), ...state.data.map(project =>
    columns.map(([key]) => key === 'stage' ? stageInfo.get(project.stage).label : project[key]))];
  const csv = new Blob(['\uFEFF', rows.map(row => row.map(quote).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  download(csv, 'iroha-mint-projects-' + dateKey.format(new Date()) + '.csv');
});

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = create('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

const backup = $('#backup-dialog');
const backupPicker = $('#backup-file');
const backupError = $('#backup-error');
const showBackupError = message => {
  backupError.textContent = message;
  backupError.hidden = !message;
};
$('#backup').addEventListener('click', () => {
  showBackupError('');
  backup.showModal();
});
$('#backup-close').addEventListener('click', () => backup.close());
$('#backup-export').addEventListener('click', async () => {
  try {
    const records = await projectStore.list();
    const blob = new Blob([JSON.stringify({ version: 1, records }, null, 2)], { type: 'application/json' });
    download(blob, 'iroha-mint-backup-' + dateKey.format(new Date()) + '.json');
    showBackupError('');
  } catch (error) {
    showBackupError(error.message);
  }
});
$('#backup-import').addEventListener('click', () => backupPicker.click());
backupPicker.addEventListener('change', async () => {
  const file = backupPicker.files[0];
  backupPicker.value = '';
  if (!file) return;
  if (file.size > 6 * 1024 * 1024) {
    showBackupError('6MB以下のバックアップファイルを選択してください。');
    return;
  }
  try {
    let data;
    try { data = JSON.parse(await file.text()); }
    catch { throw new Error('バックアップのJSONファイルを選択してください。'); }
    const added = await projectStore.restore(data);
    backup.close();
    await load();
    notify(added + '件の案件を追加しました');
  } catch (error) {
    showBackupError(error.message);
  }
});

const requestDialog = $('#request-dialog');
const requestPicker = $('#request-file');
const requestText = $('#request-text');
const requestPreview = $('#request-preview');
const requestConfirm = $('#request-confirm');
let requestRecords = [];
let reading = 0;

function showRequestError(message = '') {
  $('#request-error').textContent = message;
  $('#request-error').hidden = !message;
}

$('#request-import').addEventListener('click', () => {
  requestRecords = [];
  requestPicker.value = '';
  requestText.value = '';
  requestPreview.hidden = true;
  showRequestError();
  requestDialog.showModal();
});
$('#request-close').addEventListener('click', () => requestDialog.close());
requestDialog.addEventListener('close', () => { reading += 1; });

async function previewRequests(readProjects) {
  const readId = ++reading;
  requestRecords = [];
  requestPreview.hidden = true;
  showRequestError();
  try {
    const [projects, current] = await Promise.all([readProjects(), projectStore.list()]);
    if (reading !== readId || !requestDialog.open) return;
    const existing = new Set(current.map(item => item.id));
    const candidates = new Map(projects.filter(item => !existing.has(item.id)).map(item => [item.id, item]));
    requestRecords = [...candidates.values()];
    if (!requestRecords.length) {
      showRequestError('選んだ回答はすでに取り込まれています。');
      return;
    }
    $('#request-summary').textContent = requestRecords.length + '件の回答を追加します。';
    $('#request-names').replaceChildren(...requestRecords.map(project => create('li', project.customer)));
    requestPreview.hidden = false;
  } catch (error) {
    if (reading === readId && requestDialog.open) showRequestError(error.message);
  }
}

requestText.addEventListener('input', () => {
  if (!requestText.value.trim()) {
    reading += 1;
    requestRecords = [];
    requestPreview.hidden = true;
    showRequestError();
    return;
  }
  previewRequests(async () => [parseCopiedRequest(requestText.value)]);
});

requestPicker.addEventListener('change', () => {
  const files = [...requestPicker.files];
  requestPicker.value = '';
  if (!files.length) return;
  requestText.value = '';
  previewRequests(async () => {
    if (files.length > 50 || files.some(file => file.size > 1024 * 1024)) {
      throw new Error('1MB以下の回答ファイルを一度に50件まで選べます。');
    }
    return Promise.all(files.map(async file => {
      let answer;
      try { answer = JSON.parse(await file.text()); }
      catch { throw new Error('依頼管理画面から保存したJSONファイルを選んでください。'); }
      return convertRequest(answer);
    }));
  });
});

requestConfirm.addEventListener('click', async () => {
  if (!requestRecords.length) return;
  requestConfirm.disabled = requestPicker.disabled = requestText.disabled = true;
  $('#request-close').disabled = true;
  showRequestError();
  try {
    const count = await projectStore.restore({ version: 1, records: requestRecords });
    requestDialog.close();
    state.view = 'all';
    $('#search').value = '';
    $('#stage-filter').value = '';
    await load();
    notify(count ? count + '件の案件を追加しました' : '選んだ回答はすでに取り込まれています');
  } catch (error) {
    showRequestError(error.message);
  } finally {
    requestConfirm.disabled = requestPicker.disabled = requestText.disabled = false;
    $('#request-close').disabled = false;
  }
});
requestDialog.addEventListener('cancel', event => {
  if (requestConfirm.disabled) event.preventDefault();
});

load();
