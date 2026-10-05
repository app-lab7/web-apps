// 既存コード.gsに追加。接続先・同期キーはスクリプトプロパティで設定する。
function syncScoreMirror(){
 const props=PropertiesService.getScriptProperties(),url=props.getProperty('SCORE_MIRROR_URL'),key=props.getProperty('SCORE_MIRROR_SYNC_KEY');
 if(!url||!key)throw Error('SCORE_MIRROR_URL と SCORE_MIRROR_SYNC_KEY を設定してください');
 if(!/^https:\/\/[^/]+\.workers\.dev\/?$/.test(url))throw Error('Cloudflare WorkerのURLを確認してください');
 const lock=LockService.getScriptLock();lock.waitLock(30000);
 try{
  const generatedAt=Date.now(),tests=tests_(),students=students_(),table=table_('成績履歴'),i=table.i;
  const records=table.r.filter(r=>c_(r[i['生徒ID']])&&c_(r[i['年度']])&&c_(r[i['テスト']])).map(r=>({year:c_(r[i['年度']]),test:c_(r[i['テスト']]),studentId:c_(r[i['生徒ID']]),record:record_(r,i)}));
  const response=UrlFetchApp.fetch(url.replace(/\/$/,'')+'/sync',{method:'post',contentType:'application/json',headers:{Authorization:'Bearer '+key},payload:JSON.stringify({schema:1,generatedAt:generatedAt,tests:tests,students:students,records:records}),muteHttpExceptions:true});
  if(response.getResponseCode()!==200)throw Error('Cloudflare同期に失敗しました（'+response.getResponseCode()+'）');
  const result=JSON.parse(response.getContentText());if(!result.ok)throw Error('Cloudflare同期に失敗しました');
  props.setProperty('SCORE_MIRROR_LAST_SYNC',String(result.syncedAt));props.deleteProperty('SCORE_MIRROR_LAST_ERROR');return result;
 }finally{lock.releaseLock()}
}
function syncScoreMirrorSafely_(){
 const props=PropertiesService.getScriptProperties();if(!props.getProperty('SCORE_MIRROR_URL'))return {enabled:false};
 try{return syncScoreMirror()}catch(e){props.setProperty('SCORE_MIRROR_LAST_ERROR',String(e.message||e));console.error('Score View同期失敗: '+String(e.message||e));return {ok:false,message:'成績は保存済みですが、閲覧アプリへの同期を再試行してください'}}
}
function installScoreMirrorTrigger(){
 ScriptApp.getProjectTriggers().filter(t=>t.getHandlerFunction()==='syncScoreMirror').forEach(t=>ScriptApp.deleteTrigger(t));
 ScriptApp.newTrigger('syncScoreMirror').timeBased().everyMinutes(5).create();
 syncScoreMirror();
}
