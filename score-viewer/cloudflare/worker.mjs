const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const text=x=>String(x??'').trim();
const norm=x=>text(x).replace(/[ 　]/g,'').replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-65248)).replace(/^第/,'').replace(/回目$/,'回');
async function equal(a,b){if(!a||!b)return false;const enc=new TextEncoder();const [x,y]=await Promise.all([a,b].map(v=>crypto.subtle.digest('SHA-256',enc.encode(v))));const u=new Uint8Array(x),v=new Uint8Array(y);let diff=0;for(let i=0;i<u.length;i++)diff|=u[i]^v[i];return diff===0}
function validate(x){return x&&x.schema===1&&Number.isFinite(x.generatedAt)&&Array.isArray(x.tests)&&Array.isArray(x.students)&&Array.isArray(x.records)&&x.students.every(s=>s&&text(s.id))&&x.records.every(r=>r&&text(r.studentId)&&text(r.year)&&text(r.test)&&r.record&&r.record.scores)}
export default {
 async fetch(request,env){
  const origin=request.headers.get('Origin'),allowed=env.ALLOWED_ORIGIN||'https://app-lab7.github.io';
  const cors=response=>{const headers=new Headers(response.headers);if(origin===allowed){headers.set('Access-Control-Allow-Origin',origin);headers.set('Access-Control-Allow-Headers','Authorization,Content-Type');headers.set('Access-Control-Allow-Methods','GET,POST,OPTIONS');headers.set('Vary','Origin')}return new Response(response.body,{status:response.status,headers})};
  if(origin&&origin!==allowed)return json({ok:false,message:'許可されていない接続元です'},403);
  if(request.method==='OPTIONS')return cors(new Response(null,{status:204}));
  const url=new URL(request.url),sync=url.pathname==='/sync';
  if(!env.SYNC_KEY||!env.VIEW_KEY||!env.SCORE_MIRROR)return cors(json({ok:false,message:'配信設定が未完了です'},503));
  const key=request.headers.get('Authorization')?.replace(/^Bearer /,'');
  if(!await equal(key,sync?env.SYNC_KEY:env.VIEW_KEY))return cors(json({ok:false,message:'閲覧キーを確認してください'},401));
  if(sync&&request.method!=='POST'||!sync&&request.method!=='GET')return cors(json({ok:false,message:'未対応の処理です'},405));
  try{return cors(await env.SCORE_MIRROR.get(env.SCORE_MIRROR.idFromName('kyowa')).fetch(request))}catch(_){return cors(json({ok:false,message:'配信データを取得できませんでした'},503))}
 }
};
export class ScoreMirror {
 constructor(state){this.state=state;state.storage.sql.exec('CREATE TABLE IF NOT EXISTS mirror (id INTEGER PRIMARY KEY, payload TEXT NOT NULL)')}
 async fetch(request){
  const url=new URL(request.url);
  if(url.pathname==='/sync'){
   const body=await request.text();if(body.length>4_000_000)return json({ok:false,message:'同期データが大きすぎます'},413);
   let x;try{x=JSON.parse(body)}catch(_){return json({ok:false,message:'同期形式が違います'},400)}
   if(!validate(x)||x.generatedAt>Date.now()+300000)return json({ok:false,message:'同期形式が違います'},400);
   return this.state.storage.transactionSync(()=>{const row=this.state.storage.sql.exec('SELECT payload FROM mirror WHERE id=1').toArray()[0];const old=row?JSON.parse(row.payload):null;if(old&&old.generatedAt>x.generatedAt)return json({ok:true,ignored:true,syncedAt:old.syncedAt});x.syncedAt=Date.now();this.state.storage.sql.exec('INSERT INTO mirror (id,payload) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',JSON.stringify(x));return json({ok:true,syncedAt:x.syncedAt})});
  }
  const row=this.state.storage.sql.exec('SELECT payload FROM mirror WHERE id=1').toArray()[0];const x=row?JSON.parse(row.payload):null;if(!x)return json({ok:false,message:'初回同期がまだ完了していません'},503);
  const action=url.searchParams.get('action');let d={};try{d=JSON.parse(url.searchParams.get('data')||'{}')}catch(_){return json({ok:false,message:'条件の形式が違います'},400)}
  const base={ok:true,syncedAt:x.syncedAt,generatedAt:x.generatedAt};
  if(action==='bootstrap')return json({...base,tests:x.tests,students:x.students,capabilities:{records:true,mirror:true}});
  const test=x.tests.find(t=>text(t.year)===text(d.year)&&norm(t.name)===norm(d.test));if(!test)return json({ok:false,message:'テスト設定にないテストです'},400);
  const latest=new Map();for(const r of x.records)if(text(r.year)===text(d.year)&&norm(r.test)===norm(test.name))latest.set(text(r.studentId),r.record);
  const eligible=s=>s.status==='在籍'&&Number(s.startYear||0)<=Number(d.year);
  if(action==='records'){const students=x.students.filter(s=>eligible(s)&&(!text(d.grade)||s.grade===text(d.grade))&&(!text(d.school)||s.school===text(d.school)));return json({...base,records:students.map(s=>({studentId:s.id,record:latest.get(text(s.id))||null}))})}
  if(action==='record'){const st=x.students.find(s=>text(s.id)===text(d.studentId)&&eligible(s));if(!st)return json({ok:false,message:'対象生徒を確認してください'},400);return json({...base,record:latest.get(text(st.id))||null})}
  return json({ok:false,message:'未対応の処理です'},400);
 }
}
