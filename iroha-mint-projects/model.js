export const stages = [
  ['inquiry', 'ご相談・見積もり', 'slate'],
  ['assets', '素材・情報待ち', 'amber'],
  ['working', '制作中', 'mint'],
  ['review', 'お客様確認中', 'violet'],
  ['revision', '修正中', 'blue'],
  ['ready', '公開準備', 'cyan'],
  ['live', '公開済み', 'green'],
  ['hold', '保留', 'slate'],
];

export const plans = ['未定', 'ライト', 'スタンダード', 'プレミアム', 'その他'];

export const fields = {
  customer: 100,
  title: 120,
  stage: 20,
  plan: 20,
  deadline: 10,
  next: 200,
  preview: 2000,
  live: 2000,
  materials: 2000,
  notes: 4000,
};

export const amountFields = {
  quoted: '見積額',
  agreed: '確定額',
  received: '入金額',
};

export function totalRevenue(projects) {
  const totals = { forecast: 0n, agreed: 0n, received: 0n, balance: 0n };
  for (const project of projects) {
    const agreed = BigInt(project.agreed || '0');
    const received = BigInt(project.received || '0');
    const hasAgreement = Boolean(project.agreed);
    const activeEstimate = !hasAgreement && !['hold', 'live'].includes(project.stage);
    totals.forecast += activeEstimate ? BigInt(project.quoted || '0') : agreed;
    totals.agreed += agreed;
    totals.received += received;
    if (agreed > received) totals.balance += agreed - received;
  }
  return totals;
}

const yen = new Intl.NumberFormat('ja-JP');

export function formatYen(amount) {
  return yen.format(BigInt(amount)) + '円';
}

export function safeUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : '';
  } catch {
    return '';
  }
}
