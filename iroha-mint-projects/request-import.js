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

export function convertRequest(response) {
  const data = response?.data;
  const id = asText(response?.id).toLowerCase();
  const name = asText(data?.name);
  const received = asText(response?.created_at);
  if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/.test(id) || !name || !received || Number.isNaN(Date.parse(received))) {
    throw new Error('依頼管理画面の「JSONを保存」で保存した回答ファイルを選んでください。');
  }
  const status = asText(response.status);
  const stage = status === '制作中' ? 'working' : ['保留', 'アーカイブ'].includes(status) ? 'hold' : 'inquiry';
  const time = new Date(received).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
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
