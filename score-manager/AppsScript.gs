const SCORE_SHEET_ID='12cAmmn5mUBg-L7jgVlYB4j7KLLFFJcYWZmcGBlZyBUE';
const SUB=['国語','数学','英語','理科','社会'];
const HEAD=['保存日時','年度','テスト','学年','生徒ID','生徒名','学校','国語','国語 学校平均','国語 偏差値','数学','数学 学校平均','数学 偏差値','英語','英語 学校平均','英語 偏差値','理科','理科 学校平均','理科 偏差値','社会','社会 学校平均','社会 偏差値','5科合計','順位','回収','メモ'];
const BOOT_CACHE_KEY='kyowa-score-input:bootstrap:v5';
function doGet(e){try{const a=e.parameter.action||'',d=e.parameter.data?JSON.parse(e.parameter.data):{};let o={ok:true};if(a==='averages')o={ok:true,averages:avgs_(d.year,test_(d.year,d.test),d.grade,d.school)};if(a==='history')o=Object.assign(o,managerHistory_(d));if(a==='bootstrap')o=bootstrap_();if(a==='record')o=Object.assign(o,read_(d));if(a==='records')o=Object.assign(o,readRecords_(d));return out_(o)}catch(x){return out_({ok:false,message:String(x.message||x)})}}
function doPost(e){try{const q=JSON.parse(e.postData.contents||'{}');if(q.action==='karteSnapshot')return out_(karteSnapshot_(q));if(q.action==='managerSave')return out_(managerSave_(q.data||{}));if(q.action==='school')return out_(updateStudentSchool_(q.data||{}));if(q.action==='save')return out_(save_(q.data||{}));if(q.action==='delete')return out_(delete_(q.data||{}));throw Error('未対応の処理です')}catch(x){return out_({ok:false,message:String(x.message||x)})}}
let SCORE_SPREADSHEET_=null;
function ss_(){return SCORE_SPREADSHEET_||(SCORE_SPREADSHEET_=SpreadsheetApp.openById(SCORE_SHEET_ID))}function sheet_(n){const s=ss_().getSheetByName(n);if(!s)throw Error('「'+n+'」が見つかりません');return s}function out_(x){return ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON)}function c_(x){return String(x==null?'':x).trim()}function norm_(x){return c_(x).replace(/[ 　]/g,'').replace(/[０-９]/g,x=>String.fromCharCode(x.charCodeAt(0)-65248)).replace(/^第/,'').replace(/回目$/,'回')}function map_(h){return h.reduce((o,x,i)=>(o[c_(x)]=i,o),{})}function table_(n){const s=sheet_(n),a=s.getDataRange().getValues(),h=a.shift().map(c_);return {s:s,h:h,i:map_(h),r:a}}
function tests_(){const t=table_('テスト設定'),i=t.i;return t.r.filter(r=>c_(r[i['年度']])&&c_(r[i['テスト名']])&&c_(r[i['使用']])!=='×').map(r=>({year:c_(r[i['年度']]),name:c_(r[i['テスト名']]),order:+r[i['表示順']]||0})).sort((a,b)=>a.year.localeCompare(b.year)||a.order-b.order)}
function students_(){const t=table_('生徒マスター'),i=t.i;return t.r.filter(r=>c_(r[i['生徒ID']])).map(r=>({id:c_(r[i['生徒ID']]),grade:c_(r[i['学年']]),name:c_(r[i['生徒名']]),status:c_(r[i['在籍状況']])||'在籍',startYear:c_(r[i['登録年度']])||'0',school:c_(r[i['学校']])})).sort((a,b)=>a.grade.localeCompare(b.grade)||a.name.localeCompare(b.name))}
function bootstrap_(){const cache=CacheService.getScriptCache(),hit=cache.get(BOOT_CACHE_KEY);if(hit)return JSON.parse(hit);const result={ok:true,tests:tests_(),students:students_(),schools:schools_(),capabilities:{records:true,schoolUpdate:true,schoolMaster:true,manager:true}};cache.put(BOOT_CACHE_KEY,JSON.stringify(result),300);return result}
function test_(year,name){const x=tests_().find(x=>x.year===c_(year)&&norm_(x.name)===norm_(name));if(!x)throw Error('テスト設定にないテストです');return x.name}function student_(id){const x=students_().find(x=>x.id===c_(id));if(!x)throw Error('生徒マスターにない生徒です');if(x.status!=='在籍')throw Error('退塾済みの生徒は入力できません');return x}
function avgs_(year,test,grade,school){const t=table_('学校平均マスター'),i=t.i,r=t.r.find(r=>c_(r[i['年度']])===c_(year)&&norm_(r[i['テスト']])===norm_(test)&&c_(r[i['学年']])===c_(grade)&&c_(r[i['学校']])===c_(school)),o={};SUB.forEach(s=>o[s]={avg:r?c_(r[i[s+'平均']]):''});return o}
function record_(r,i){const scores={};SUB.forEach(s=>scores[s]={score:c_(r[i[s]]),avg:c_(r[i[s+' 学校平均']]),dev:c_(r[i[s+' 偏差値']])});return {scores:scores,rank:c_(r[i['順位']]),collect:c_(r[i['回収']]),memo:c_(r[i['メモ']])}}
function read_(d){const st=student_(d.studentId),test=test_(d.year,d.test),t=table_('成績履歴'),i=t.i;let r=null;for(let x=t.r.length-1;x>=0;x--)if(c_(t.r[x][i['年度']])===c_(d.year)&&norm_(t.r[x][i['テスト']])===norm_(test)&&c_(t.r[x][i['生徒ID']])===st.id){r=t.r[x];break}return r?{record:record_(r,i)}:{record:null,averages:avgs_(d.year,test,st.grade,st.school)}}
// 閲覧画面向け。一度の履歴読み取りで対象生徒全員を返す。
const RECORDS_REVISION_KEY='kyowa-score-records-revision-v1';
function bumpRecordsRevision_(){PropertiesService.getScriptProperties().setProperty(RECORDS_REVISION_KEY,String(Date.now())+'-'+Math.random().toString(36).slice(2))}
function recordsCacheKey_(d){
  const revision=PropertiesService.getScriptProperties().getProperty(RECORDS_REVISION_KEY)||'0';
  const raw=JSON.stringify([revision,c_(d.year),norm_(d.test),c_(d.grade),c_(d.school)]);
  const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.MD5,raw);
  return 'kyowa-records-v1:'+bytes.map(b=>('0'+(b&255).toString(16)).slice(-2)).join('');
}
function readRecords_(d){
  const cache=CacheService.getScriptCache(),key=recordsCacheKey_(d),hit=cache.get(key);
  if(hit)return JSON.parse(hit);
  const boot=bootstrap_(),year=c_(d.year),selected=boot.tests.find(t=>t.year===year&&norm_(t.name)===norm_(d.test));
  if(!selected)throw Error('テスト設定にないテストです');
  const students=boot.students.filter(st=>st.status==='在籍'&&Number(st.startYear||0)<=Number(year)&&(!c_(d.grade)||st.grade===c_(d.grade))&&(!c_(d.school)||st.school===c_(d.school)));
  const table=table_('成績履歴'),i=table.i,latest=Object.create(null);
  table.r.forEach(row=>{if(c_(row[i['年度']])===year&&norm_(row[i['テスト']])===norm_(selected.name)){const id=c_(row[i['生徒ID']]);if(id)latest[id]=row}});
  const result={records:students.map(st=>({studentId:st.id,record:latest[st.id]?record_(latest[st.id],i):null}))};
  try{cache.put(key,JSON.stringify(result),90)}catch(_){}
  return result;
}
function history_(){const s=sheet_('成績履歴'),head=s.getRange(1,1,1,HEAD.length).getDisplayValues()[0].map(c_);if(!HEAD.every((x,i)=>head[i]===x))throw Error('成績履歴の列構成が想定と違います。保存を止めました');return s}
function matchingRows_(rows,index,d,st,test){const found=[];rows.forEach((r,x)=>{if(c_(r[index['年度']])===c_(d.year)&&norm_(r[index['テスト']])===norm_(test)&&c_(r[index['生徒ID']])===st.id)found.push(x+2)});return found}
function save_(d){['year','test','grade','studentId'].forEach(k=>{if(!c_(d[k]))throw Error(k+'を選択してください')});const lock=LockService.getScriptLock();lock.waitLock(30000);try{const st=student_(d.studentId),test=test_(d.year,d.test);if(st.grade!==c_(d.grade))throw Error('生徒マスターの学年と一致しません');const av=avgs_(d.year,test,st.grade,st.school),s=history_(),a=s.getDataRange().getValues(),i=map_(a.shift()),matches=matchingRows_(a,i,d,st,test);if(d.expectedRecord!==undefined){const previous=matches.length?record_(a[matches[matches.length-1]-2],i):null;if(managerFingerprint_(previous)!==d.expectedRecord)throw Error('ほかの人が成績を変更しました。再読み込みして確認してください');}managerValidateScores_(d);const n=matches.length?matches[matches.length-1]:s.getLastRow()+1,row=HEAD.map(x=>''),put=(k,v)=>row[i[k]]=v;put('保存日時',new Date());put('年度',c_(d.year));put('テスト',test);put('学年',st.grade);put('生徒ID',st.id);put('生徒名',st.name);put('学校',st.school);let total=0;SUB.forEach(sub=>{const x=(d.scores||{})[sub]||{},score=c_(x.score);put(sub,score);put(sub+' 学校平均',c_(av[sub].avg));put(sub+' 偏差値',c_(x.dev));if(score!==''&&!isNaN(+score))total+=+score});put('5科合計',total);put('順位',c_(d.rank));put('回収',c_(d.collect)||'○');put('メモ',c_(d.memo));s.getRange(n,1,1,HEAD.length).setValues([row]);const manualSync=syncManualInput_(d,st,test,row,i);SpreadsheetApp.flush();bumpRecordsRevision_();return {ok:true,record:record_(row,i),updatedRow:n,manualSync:manualSync}}finally{lock.releaseLock()}}
function delete_(d){['year','test','studentId'].forEach(k=>{if(!c_(d[k]))throw Error(k+'を選択してください')});const lock=LockService.getScriptLock();lock.waitLock(30000);try{const st=student_(d.studentId),test=test_(d.year,d.test),s=history_(),a=s.getDataRange().getValues(),i=map_(a.shift()),rows=matchingRows_(a,i,d,st,test);if(!rows.length)throw Error('削除する保存済み成績がありません');rows.forEach(n=>s.getRange(n,1,1,HEAD.length).clearContent());const manualSync=syncManualInput_(d,st,test,null,i);SpreadsheetApp.flush();bumpRecordsRevision_();return {ok:true,deleted:rows.length,manualSync:manualSync}}finally{lock.releaseLock()}}

// 数式のある「生徒別点数」は閲覧専用。手入力タブの変更列だけを履歴に反映する。
const EDIT_HISTORY_COLS={4:'国語',5:'数学',6:'英語',7:'理科',8:'社会',9:'国語 偏差値',10:'数学 偏差値',11:'英語 偏差値',12:'理科 偏差値',13:'社会 偏差値',14:'順位',15:'回収',16:'メモ'};
function installScoreEditTrigger(){ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='onScoreSheetEdit').forEach(t=>ScriptApp.deleteTrigger(t));ScriptApp.newTrigger('onScoreSheetEdit').forSpreadsheet(SCORE_SHEET_ID).onEdit().create()}
function onScoreSheetEdit(e){
  if(!e||!e.range||e.range.getSheet().getName()!=='手入力')return;
  const range=e.range,top=Math.max(4,range.getRow()),bottom=range.getLastRow(),left=Math.max(4,range.getColumn()),right=Math.min(16,range.getLastColumn());
  if(bottom<top||right<left)return;
  const sheet=range.getSheet(),lock=LockService.getScriptLock();
  try{
    lock.waitLock(30000);
    const entered=sheet.getRange(top,left,bottom-top+1,right-left+1).getValues();
    const students=students_(),history=history_(),all=history.getDataRange().getValues(),index=map_(all.shift()),keys=sheet.getRange(top,1,bottom-top+1,3).getValues();
    entered.forEach((values,offset)=>{
      const [year,rawTest,id]=keys[offset],st=students.find(s=>s.id===c_(id));if(!st||st.status!=='在籍'||!c_(year)||!c_(rawTest))return;
      const test=test_(year,rawTest);
      const edits=values.map((v,k)=>({column:left+k,value:v})).filter(x=>EDIT_HISTORY_COLS[x.column]);if(!edits.length)return;
      const matches=matchingRows_(all,index,{year:year},st,test),rowNumber=matches.length?matches[matches.length-1]:history.getLastRow()+1;
      const row=matches.length?all[rowNumber-2].slice(0,HEAD.length):HEAD.map(()=>''),put=(key,value)=>row[index[key]]=value;
      put('保存日時',new Date());put('年度',year);put('テスト',test);put('学年',st.grade);put('生徒ID',st.id);put('生徒名',st.name);put('学校',st.school);
      edits.forEach(x=>put(EDIT_HISTORY_COLS[x.column],x.value));
      const averages=avgs_(year,test,st.grade,st.school);SUB.forEach(sub=>put(sub+' 学校平均',averages[sub].avg));
      put('5科合計',SUB.reduce((sum,sub)=>{const v=c_(row[index[sub]]);return sum+(v!==''&&!isNaN(+v)?+v:0)},0));
      history.getRange(rowNumber,1,1,HEAD.length).setValues([row]);all[rowNumber-2]=row;
    });
    SpreadsheetApp.flush();bumpRecordsRevision_();
    sheet.getParent().toast('手入力を成績履歴へ保存しました','Score Input',4);
  }catch(error){sheet.getParent().toast('手入力を保存できませんでした：'+error.message,'Score Input',8);throw error}
  finally{if(lock.hasLock())lock.releaseLock()}
}

// アプリの保存・削除を、同じ年度・テスト・生徒IDの手入力行へ反映。
// A:C、見出し、数式セルは変更しない。手入力のない成績は履歴だけに保存。
function syncManualInput_(d,st,test,row,index){
  try{
    const sheet=ss_().getSheetByName('手入力');
    if(!sheet||sheet.getLastRow()<4)return {ok:true,updated:0};
    const keys=sheet.getRange(4,1,sheet.getLastRow()-3,3).getValues(),targets=[];
    keys.forEach((key,offset)=>{
      if(c_(key[0])===c_(d.year)&&norm_(key[1])===norm_(test)&&c_(key[2])===st.id)targets.push(offset+4);
    });
    // 全対象を検証してから書き込む。数式を見つけた場合は手入力側を変更しない。
    targets.forEach(n=>{
      if(sheet.getRange(n,4,1,13).getFormulas()[0].some(Boolean))throw Error('手入力の対象行に数式があります');
    });
    const values=Array.from({length:13},(_,k)=>row?row[index[EDIT_HISTORY_COLS[k+4]]]: '');
    targets.forEach(n=>sheet.getRange(n,4,1,13).setValues([values]));
    return {ok:true,updated:targets.length};
  }catch(error){
    // 履歴への保存は成功済み。手入力側の失敗で保存を失敗扱いにしない。
    console.error('手入力への反映に失敗: '+error.message);
    return {ok:false,message:String(error.message||error)};
  }
}

// 学校の候補は名簿と学校平均マスターの登録名から作る。
function schools_(){
  const master=ss_().getSheetByName('学校マスター');
  if(master){
    if(c_(master.getRange(1,1).getValue())!=='学校名')throw Error('学校マスターのA1は学校名にしてください');
    return master.getLastRow()<2?[]:[...new Set(master.getRange(2,1,master.getLastRow()-1,1).getValues().map(row=>c_(row[0])).filter(Boolean))].sort();
  }
  const averages=table_('学校平均マスター'),column=averages.i['学校'];
  return [...new Set(students_().map(st=>st.school).concat(averages.r.map(row=>c_(row[column]))).filter(Boolean))].sort();
}
function updateStudentSchool_(d){
  const id=c_(d.studentId),school=c_(d.school);
  if(!id||!school)throw Error('生徒と学校を選択してください');
  if(school.length>80||/^[=+@-]/.test(school)||/[\r\n\t]/.test(school))throw Error('学校名を確認してください');
  const lock=LockService.getScriptLock();lock.waitLock(30000);
  try{
    if(ss_().getSheetByName('学校マスター')&&!schools_().includes(school))throw Error('学校マスターに登録されている学校を選択してください');
    const table=table_('生徒マスター'),i=table.i;
    if(i['学校']===undefined||i['生徒ID']===undefined)throw Error('生徒マスターの学校列がありません');
    const matches=table.r.map((row,n)=>({row:row,n:n})).filter(x=>c_(x.row[i['生徒ID']])===id);
    if(matches.length!==1)throw Error('生徒IDが見つからないか、重複しています');
    const found=matches[0],st=student_(id);
    if(c_(d.previousSchool)!==st.school)throw Error('学校情報がほかの人に変更されています。アプリを再読み込みしてください');
    const test=c_(d.year)&&c_(d.test)?test_(d.year,d.test):null;
    const averages=test?avgs_(d.year,test,st.grade,school):null;
    table.s.getRange(found.n+2,i['学校']+1).setValue(school);
    SpreadsheetApp.flush();bumpRecordsRevision_();CacheService.getScriptCache().remove(BOOT_CACHE_KEY);
    return {ok:true,studentId:id,school:school,averages:averages};
  }finally{lock.releaseLock()}
}

function managerFingerprint_(r){r=r||{scores:{},rank:'',collect:'未',memo:''};return JSON.stringify({scores:SUB.map(s=>[c_((r.scores[s]||{}).score),c_((r.scores[s]||{}).dev)]),rank:c_(r.rank),collect:r.collect||'未',memo:r.memo||''})}
function managerValidateScores_(d){SUB.forEach(s=>['score','dev'].forEach(k=>{const v=c_(((d.scores||{})[s]||{})[k]);if(v&&(!/^\d+(\.\d+)?$/.test(v)||+v<0||+v>100))throw Error(s+'の数値は0〜100で入力してください')}));if(c_(d.rank)&&(!/^\d+$/.test(c_(d.rank))||+d.rank<1))throw Error('順位は1以上の整数で入力してください');if(c_(d.memo).length>2000)throw Error('メモは2000文字以内にしてください')}
function managerText_(value,label){const v=c_(value);if(!v||v.length>80||/^[=+@-]/.test(v)||/[\r\n\t]/.test(v))throw Error(label+'を確認してください');return v}
function managerYear_(v){v=c_(v);if(!/^20\d{2}$/.test(v))throw Error('年度を2000〜2099で入力してください');return v}
function managerAppend_(t,values){Object.keys(values).forEach(k=>{if(t.i[k]===undefined)throw Error(t.s.getName()+'の「'+k+'」列がありません')});const row=t.h.map(h=>values[h]===undefined?'':values[h]);t.s.getRange(t.s.getLastRow()+1,1,1,row.length).setValues([row])}
function managerSave_(d){const lock=LockService.getScriptLock();lock.waitLock(30000);try{let message='';
if(d.kind==='school'){const name=managerText_(d.name,'学校名');if(schools_().some(x=>norm_(x)===norm_(name)))throw Error('同じ学校名が登録されています');const t=table_('学校マスター');managerAppend_(t,{'学校名':name});message='中学校を追加しました';}
else if(d.kind==='student'){const name=managerText_(d.name,'生徒名'),grade=c_(d.grade),school=managerText_(d.school,'学校名'),year=managerYear_(d.year),t=table_('生徒マスター');if(!['中1','中2','中3'].includes(grade)||!schools_().includes(school))throw Error('学年・学校を候補から選択してください');if(t.r.some(r=>norm_(r[t.i['生徒名']])===norm_(name)&&c_(r[t.i['学年']])===grade))throw Error('同じ学年・生徒名が登録されています。名簿を確認してください');const ids=t.r.map(r=>c_(r[t.i['生徒ID']]));let n=ids.reduce((m,id)=>/^KY-\d+$/.test(id)?Math.max(m,+id.slice(3)):m,0)+1;let id='KY-'+String(n).padStart(3,'0');while(ids.includes(id)){n++;id='KY-'+String(n).padStart(3,'0')}managerAppend_(t,{'生徒ID':id,'学年':grade,'生徒名':name,'在籍状況':'在籍','登録年度':year,'学校':school});message='生徒を追加しました（'+id+'）';}
else if(d.kind==='test'){const year=managerYear_(d.year),t=table_('テスト設定'),all=tests_(),source=c_(d.copyYear)?all.filter(x=>x.year===managerYear_(d.copyYear)):[{name:managerText_(d.name,'テスト名')}];if(!source.length)throw Error('コピー元にテストがありません');const fresh=source.filter(x=>!t.r.some(r=>c_(r[t.i['年度']])===year&&norm_(r[t.i['テスト名']])===norm_(x.name)));if(!fresh.length)throw Error('同じ年度・テストが登録されています');let order=all.filter(x=>x.year===year).reduce((m,x)=>Math.max(m,x.order),0);fresh.forEach(x=>managerAppend_(t,{'年度':year,'テスト名':x.name,'表示順':++order,'使用':'○'}));message=fresh.length+'件のテストを追加しました';}
else if(d.kind==='average'){const year=managerYear_(d.year),test=test_(year,d.test),grade=c_(d.grade),school=managerText_(d.school,'学校名'),t=table_('学校平均マスター'),i=t.i;if(!['中1','中2','中3'].includes(grade)||!schools_().includes(school))throw Error('学年・学校を選択してください');const values={'年度':year,'テスト':test,'学年':grade,'学校':school};SUB.forEach(s=>{const v=c_((d.averages||{})[s]);if(v&&(!/^\d+(\.\d+)?$/.test(v)||+v>100))throw Error(s+'平均は0〜100で入力してください');values[s+'平均']=v===''?'':+v});Object.keys(values).forEach(k=>{if(i[k]===undefined)throw Error('学校平均マスターの列が不足しています')});const hits=t.r.map((r,n)=>({r,n})).filter(x=>c_(x.r[i['年度']])===year&&norm_(x.r[i['テスト']])===norm_(test)&&c_(x.r[i['学年']])===grade&&c_(x.r[i['学校']])===school);if(hits.length>1)throw Error('学校平均が重複しています。管理者に確認してください');if(hits.length){const row=hits[0].r.slice();Object.keys(values).forEach(k=>row[i[k]]=values[k]);t.s.getRange(hits[0].n+2,1,1,row.length).setValues([row])}else managerAppend_(t,values);message='学校平均を保存しました';}
else throw Error('未対応の登録です');SpreadsheetApp.flush();bumpRecordsRevision_();CacheService.getScriptCache().remove(BOOT_CACHE_KEY);return {ok:true,message:message};}finally{lock.releaseLock()}}
function managerHistory_(d){const st=student_(d.studentId),t=table_('成績履歴'),i=t.i,latest={};t.r.forEach(r=>{if(c_(r[i['生徒ID']])===st.id)latest[JSON.stringify([c_(r[i['年度']]),norm_(r[i['テスト']])])]=record_(r,i)});return {history:tests_().filter(x=>Number(x.year)>=Number(st.startYear||0)).map(x=>({year:x.year,test:x.name,record:latest[JSON.stringify([x.year,norm_(x.name)])]||null}))}}


// 成績カルテ共和校ページ用。共有トークンはスクリプトプロパティだけに保存。
function karteSnapshot_(request){
  const expected=PropertiesService.getScriptProperties().getProperty('KARTE_SYNC_TOKEN');
  const supplied=String(request&&request.token||'');
  if(!expected||expected.length<32||supplied.length!==expected.length)return {ok:false,message:'認証できません'};
  let mismatch=0;for(let i=0;i<expected.length;i++)mismatch|=expected.charCodeAt(i)^supplied.charCodeAt(i);
  if(mismatch)return {ok:false,message:'認証できません'};
  const students=students_().filter(st=>st.status==='在籍').map(st=>({id:st.id,name:st.name,grade:st.grade,school:st.school,status:st.status}));
  const allowed=new Set(students.map(st=>st.id));
  const tests=tests_().map(t=>({year:t.year,name:t.name}));
  const validTests=new Map(tests.map(t=>[t.year+'|'+norm_(t.name),t.name]));
  const t=table_('成績履歴'),latest=new Map();
  t.r.forEach(row=>{const studentId=c_(row[t.i['生徒ID']]),year=c_(row[t.i['年度']]),test=validTests.get(year+'|'+norm_(row[t.i['テスト']]));if(!allowed.has(studentId)||!test)return;const r=record_(row,t.i);latest.set(year+'|'+test+'|'+studentId,{studentId,year,test,scores:r.scores,rank:r.rank,collect:r.collect})});
  return {ok:true,generatedAt:new Date().toISOString(),students,tests,records:[...latest.values()]};
}
