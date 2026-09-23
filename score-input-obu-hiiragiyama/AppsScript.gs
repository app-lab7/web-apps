const SCORE_SHEET_ID='1o0Al1xa1XreWnz2J8sJ7uuP7-cgzGDkp9l8Y_pMo3Dc';
const SUB=['国語','数学','英語','理科','社会'];
const HEAD=['保存日時','年度','テスト','学年','生徒名','国語','国語 学校平均','国語 偏差値','数学','数学 学校平均','数学 偏差値','英語','英語 学校平均','英語 偏差値','理科','理科 学校平均','理科 偏差値','社会','社会 学校平均','社会 偏差値','5科合計','順位','回収','メモ','生徒ID','学校'];
const BOOT_CACHE_KEY='obu-hiiragiyama-score-input:bootstrap:v1';
function doGet(e){try{const a=e.parameter.action||'',d=e.parameter.data?JSON.parse(e.parameter.data):{};let o={ok:true};if(a==='bootstrap')o=bootstrap_();if(a==='record')o=Object.assign(o,read_(d));return out_(o)}catch(x){return out_({ok:false,message:String(x.message||x)})}}
function doPost(e){try{const q=JSON.parse(e.postData.contents||'{}');if(q.action==='save')return out_(save_(q.data||{}));if(q.action==='delete')return out_(delete_(q.data||{}));throw Error('未対応の処理です')}catch(x){return out_({ok:false,message:String(x.message||x)})}}
function ss_(){return SpreadsheetApp.openById(SCORE_SHEET_ID)}
function sheet_(n){const s=ss_().getSheetByName(n);if(!s)throw Error('「'+n+'」が見つかりません');return s}
function out_(x){return ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON)}
function c_(x){return String(x==null?'':x).trim()}
function norm_(x){return c_(x).replace(/[ 　]/g,'').replace(/[０-９]/g,x=>String.fromCharCode(x.charCodeAt(0)-65248)).replace(/^第/,'').replace(/回目$/,'回')}
function map_(h){return h.reduce((o,x,i)=>(o[c_(x)]=i,o),{})}
function table_(n){const s=sheet_(n),a=s.getDataRange().getValues(),h=a.shift().map(c_);return {s:s,h:h,i:map_(h),r:a}}
function bootstrap_(){const c=CacheService.getScriptCache(),hit=c.get(BOOT_CACHE_KEY);if(hit)return JSON.parse(hit);const data={ok:true,tests:tests_(),students:students_()};c.put(BOOT_CACHE_KEY,JSON.stringify(data),300);return data}
function tests_(){const t=table_('テスト設定'),i=t.i;return t.r.filter(r=>c_(r[i['年度']])&&c_(r[i['テスト名']])&&c_(r[i['使用']])!=='×').map(r=>({year:c_(r[i['年度']]),name:c_(r[i['テスト名']]),order:+r[i['表示順']]||0})).sort((a,b)=>a.year.localeCompare(b.year)||a.order-b.order)}
function students_(){const t=table_('生徒マスター'),i=t.i;return t.r.filter(r=>c_(r[i['生徒ID']])).map(r=>({id:c_(r[i['生徒ID']]),grade:c_(r[i['学年']]),name:c_(r[i['生徒名']]),status:c_(r[i['在籍状況']])||'在籍',startYear:c_(r[i['登録年度']])||'0',school:c_(r[i['学校']])})).sort((a,b)=>a.grade.localeCompare(b.grade)||a.name.localeCompare(b.name))}
function test_(year,name){const x=tests_().find(x=>x.year===c_(year)&&norm_(x.name)===norm_(name));if(!x)throw Error('テスト設定にないテストです');return x.name}
function student_(id){const x=students_().find(x=>x.id===c_(id));if(!x)throw Error('生徒マスターにない生徒です');if(x.status!=='在籍')throw Error('退塾済みの生徒は入力できません');return x}
function avgs_(year,test,grade,school){const t=table_('学校平均マスター'),i=t.i,r=t.r.find(r=>c_(r[i['年度']])===c_(year)&&norm_(r[i['テスト']])===norm_(test)&&c_(r[i['学年']])===c_(grade)&&c_(r[i['学校']])===c_(school)),o={};SUB.forEach(s=>o[s]={avg:r?c_(r[i[s+'平均']]):''});return o}
function record_(r,i){const scores={};SUB.forEach(s=>scores[s]={score:c_(r[i[s]]),avg:c_(r[i[s+' 学校平均']]),dev:c_(r[i[s+' 偏差値']])});return {scores:scores,rank:c_(r[i['順位']]),collect:c_(r[i['回収']]),memo:c_(r[i['メモ']])}}
function read_(d){const st=student_(d.studentId),test=test_(d.year,d.test),t=table_('成績履歴'),i=t.i;let r=null;for(let x=t.r.length-1;x>=0;x--)if(c_(t.r[x][i['年度']])===c_(d.year)&&norm_(t.r[x][i['テスト']])===norm_(test)&&match_(t.r[x],i,d.year,test,st)){r=t.r[x];break}return r?{record:record_(r,i)}:{record:null,averages:avgs_(d.year,test,st.grade,st.school)}}
function history_(){
  const s=sheet_('成績履歴'),first=s.getRange(1,1,1,24).getDisplayValues()[0].map(c_);
  if(!HEAD.slice(0,24).every((x,i)=>first[i]===x))throw Error('成績履歴の既存24列が想定と違います。保存を止めました');
  const tail=s.getRange(1,25,1,2).getDisplayValues()[0].map(c_);
  if(tail.some((v,i)=>v&&v!==HEAD[24+i]))throw Error('成績履歴のY・Z列を確認してください');
  if(tail[0]!==HEAD[24]||tail[1]!==HEAD[25])s.getRange(1,25,1,2).setValues([HEAD.slice(24)]);
  return s;
}
function match_(r,i,year,test,st){
  if(c_(r[i['年度']])!==c_(year)||norm_(r[i['テスト']])!==norm_(test))return false;
  const id=c_(r[i['生徒ID']]);
  return id?id===st.id:c_(r[i['生徒名']])===st.name&&c_(r[i['学年']])===st.grade;
}
function save_(d){['year','test','grade','studentId'].forEach(k=>{if(!c_(d[k]))throw Error(k+'を選択してください')});const lock=LockService.getScriptLock();lock.waitLock(30000);try{const st=student_(d.studentId),test=test_(d.year,d.test);if(st.grade!==c_(d.grade))throw Error('生徒マスターの学年と一致しません');const av=avgs_(d.year,test,st.grade,st.school),s=history_(),a=s.getDataRange().getValues(),i=map_(a.shift());let found=-1;for(let x=a.length-1;x>=0;x--)if(c_(a[x][i['年度']])===c_(d.year)&&norm_(a[x][i['テスト']])===norm_(test)&&match_(a[x],i,d.year,test,st)){found=x;break}const n=found<0?s.getLastRow()+1:found+2,row=HEAD.map(x=>''),put=(k,v)=>row[i[k]]=v;put('保存日時',new Date());put('年度',c_(d.year));put('テスト',test);put('学年',st.grade);put('生徒ID',st.id);put('生徒名',st.name);put('学校',st.school);let total=0;SUB.forEach(sub=>{const x=(d.scores||{})[sub]||{},score=c_(x.score);put(sub,score);put(sub+' 学校平均',c_(av[sub].avg));put(sub+' 偏差値',c_(x.dev));if(score!==''&&!isNaN(+score))total+=+score});put('5科合計',total);put('順位',c_(d.rank));put('回収',c_(d.collect)||'○');put('メモ',c_(d.memo));s.getRange(n,1,1,HEAD.length).setValues([row]);SpreadsheetApp.flush();return {ok:true,record:record_(row,i),updatedRow:n}}finally{lock.releaseLock()}}
function delete_(d){['year','test','studentId'].forEach(k=>{if(!c_(d[k]))throw Error(k+'を選択してください')});const lock=LockService.getScriptLock();lock.waitLock(30000);try{const st=student_(d.studentId),test=test_(d.year,d.test),s=history_(),a=s.getDataRange().getValues(),i=map_(a.shift()),rows=[];a.forEach((r,x)=>{if(c_(r[i['年度']])===c_(d.year)&&norm_(r[i['テスト']])===norm_(test)&&match_(r,i,d.year,test,st))rows.push(x+2)});if(!rows.length)throw Error('削除する保存済み成績がありません');rows.forEach(n=>s.getRange(n,1,1,HEAD.length).clearContent());SpreadsheetApp.flush();return {ok:true,deleted:rows.length}}finally{lock.releaseLock()}}
