'use strict';
const driveForm = $('driveForm');
const driveDialog = $('driveDialog');
const driveError = driveForm.querySelector('.error');
const settingKey = 'test-print-drive-settings';
const catalogueKey = 'test-print-drive-tab-catalogue-v1';
const folderFromLink = new URLSearchParams(location.hash.slice(1)).get('folder');
const folderId = url => url.match(/^https:\/\/drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([\w-]+)(?:[/?#]|$)/)?.[1];
const driveStatus = message => { $('status').textContent = message; };
let rememberedFolder = '';
try {
  rememberedFolder = JSON.parse(localStorage.getItem(settingKey) || '{}').folder || '';
} catch {}
const requestedFolder = /^[\w-]+$/.test(folderFromLink || '')
  ? 'https://drive.google.com/drive/folders/' + folderFromLink : rememberedFolder;
try {
  const cached = JSON.parse(sessionStorage.getItem(catalogueKey) || 'null');
  if (folderId(requestedFolder) && cached?.id === folderId(requestedFolder) && Array.isArray(cached.records)) {
    sharedRecords = cached.records;
    draw();
    driveStatus('共有教材の一覧を復元しました。印刷するときは「共有ドライブを開く」からGoogleに再接続してください。');
  }
} catch {}
if (requestedFolder && !sharedRecords.length) {
  driveStatus('共有教材を表示するには「共有ドライブを開く」からGoogleに接続してください。');
}
const googleClientId = '739406071935-l7b4nq88frf82fou9drf5jke44n456i6.apps.googleusercontent.com';
let accessToken, driveRequest = 0;

function loadGoogleIdentity() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.onload = resolve;
    script.onerror = () => reject(new Error('Googleログインを読み込めませんでした。'));
    document.head.append(script);
  });
}
async function driveApi(path, params, token = accessToken) {
  if (!token) throw new Error('一覧は表示されています。印刷するには「共有ドライブを開く」からGoogleに再接続してください。');
  const url = new URL('https://www.googleapis.com/drive/v3/' + path);
  url.search = new URLSearchParams(params).toString();
  const response = await fetch(url, {headers:{Authorization:'Bearer ' + token}});
  if (response.status === 401) throw new Error('Googleの接続が切れました。「共有ドライブを開く」から再接続してください。');
  if (!response.ok) throw new Error('Googleドライブを読み込めませんでした。閲覧・ダウンロード権限とDrive APIの設定を確認してください。');
  return response;
}
async function fetchDrivePdf(asset) {
  const path = 'files/' + encodeURIComponent(asset.driveId);
  const response = asset.native
    ? await driveApi(path + '/export',{mimeType:'application/pdf'})
    : await driveApi(path,{alt:'media',supportsAllDrives:'true'});
  return response.blob();
}
async function listDriveTree(root, token, requestId) {
  await driveApi('files/' + root,{fields:'id',supportsAllDrives:'true'},token);
  const queue = [{id:root,path:[]}], files = [];
  while (queue.length && requestId === driveRequest) {
    await Promise.all(queue.splice(0,6).map(async folder => {
      let pageToken;
      do {
        const params = {q:"'" + folder.id + "' in parents and trashed = false",fields:'nextPageToken,incompleteSearch,files(id,name,mimeType,webViewLink)',pageSize:'1000',supportsAllDrives:'true',includeItemsFromAllDrives:'true'};
        if (pageToken) params.pageToken = pageToken;
        const result = await (await driveApi('files',params,token)).json();
        if (result.incompleteSearch) throw new Error('Googleドライブから一部のファイルを取得できませんでした。');
        for (const file of result.files || []) {
          if (file.mimeType === 'application/vnd.google-apps.folder') {
            queue.push({id:file.id,path:[...folder.path,file.name]});
          } else files.push({file,path:folder.path});
        }
        pageToken = result.nextPageToken;
      } while (pageToken && requestId === driveRequest);
    }));
  }
  return files;
}
function classifyDrive(files) {
  const schools = [['大高中',/大高(?:中)?/],['大府中',/大府(?:中)?|大中/],['有松中',/有松(?:中)?/],['北部中',/北部(?:中)?/],['南中',/南中|南[①②③④⑤]/],['西中',/西中/],['北中',/北中/]];
  const subjects = [['技術・家庭',/技術\s*[・･・\/\-&と]?\s*家庭/],['保健体育',/保健体育|保体|体育|保健/],['国語',/国語/],['数学',/数学/],['英語',/英語/],['理科',/理科/],['社会',/社会/],['音楽',/音楽/],['美術',/美術/],['家庭',/家庭/],['技術',/技術/]];
  const grouped = new Map();
  for (const {file,path} of files) {
    if (file.mimeType === 'application/x-ms-shortcut' || /\.lnk$/i.test(file.name)) continue;
    const native = file.mimeType === 'application/vnd.google-apps.document';
    const printable = native || file.mimeType === 'application/pdf';
    const name = file.name.normalize('NFKC').replace(/\.pdf$/i,'');
    const info = [...path,file.name].join(' ').normalize('NFKC');
    const yearMark = path[0]?.normalize('NFKC').match(/^(?:R|令和)\s*(\d+)/i);
    const year = yearMark ? String(2018+Number(yearMark[1])) : '';
    const gradeMark = path[1]?.normalize('NFKC').match(/^(?:中)?\s*([123])(?:年)?$/);
    const grade = gradeMark ? '中'+gradeMark[1] : '学年未分類';
    const schoolMatches = schools.filter(([,pattern])=>pattern.test(info));
    const school = schoolMatches.length === 1 ? schoolMatches[0][0] : '学校未分類';
    const subject = subjects.find(([,pattern])=>pattern.test(name))?.[0] || '';
    const round = value => {
      const marked = value.match(/[①②③④⑤]/)?.[0];
      if (marked) return String('①②③④⑤'.indexOf(marked)+1);
      const explicit = value.normalize('NFKC').match(/(?:第\s*)?([1-5一二三四五])\s*回/)?.[1];
      return explicit && '一二三四五'.includes(explicit) ? String('一二三四五'.indexOf(explicit)+1) : explicit;
    };
    const namedRound = round(file.name);
    const folderRounds = new Set(path.slice(2).map(round).filter(Boolean));
    // Conflicting folder and filename labels need a teacher's review.
    const roundConflict = folderRounds.size > 1 || (namedRound && folderRounds.size && !folderRounds.has(namedRound));
    const number = roundConflict ? '' : namedRound || [...folderRounds][0];
    const label = /範囲/.test(name)?'テスト範囲':/解答\s*(?:付|付き|あり)|解有/.test(name)?'問題・解答':/解説/.test(name)?'解説':/解答|答え/.test(name)?'解答':'問題';
    const canGroup = printable && year && gradeMark && schoolMatches.length===1 && number && subject && label!=='テスト範囲';
    const key = canGroup ? [year,grade,school,number,subject].join('/') : file.id;
    const fallback = 'https://drive.google.com/open?id='+encodeURIComponent(file.id);
    let record = grouped.get(key);
    if (!record) {
      record = {id:'drive:'+key,year,grade,school,subject,round:number || '',needsReview:!!roundConflict,title:canGroup?'第'+number+'回 '+subject:name,shared:true,files:{},updated:0};
      grouped.set(key,record);
    }
    if (printable) {
      record.files[file.id] = {driveId:file.id,name:file.name,label,native};
    } else record.sourceUrl = file.webViewLink || fallback;
    if (native) record.doc = 'https://docs.google.com/document/d/'+encodeURIComponent(file.id)+'/edit';
  }
  const order = ['問題','問題・解答','解答','解説','テスト範囲'];
  for (const r of grouped.values()) {
    r.files = Object.fromEntries(Object.entries(r.files).sort(([,a],[,b])=>order.indexOf(a.label)-order.indexOf(b.label) || a.name.localeCompare(b.name,'ja')));
  }
  return [...grouped.values()];
}
$('connectDrive').onclick = async () => {
  driveError.textContent = '';
  driveForm.elements.folder.value = requestedFolder || rememberedFolder;
  $('closeDrive').hidden = !accessToken && !sharedRecords.length;
  driveDialog.showModal();
  const submit = driveForm.querySelector('[type=submit]');
  submit.disabled = true;
  try { await loadGoogleIdentity(); }
  catch (error) { driveError.textContent = error.message; }
  finally { submit.disabled = false; }
};
driveForm.onsubmit = event => {
  event.preventDefault();
  driveError.textContent = '';
  const folder = driveForm.elements.folder.value.trim();
  const id = folderId(folder);
  if (!id) {
    driveError.textContent = 'Googleドライブの共有フォルダURLを確認してください。'; return;
  }
  if (!window.google?.accounts?.oauth2) {driveError.textContent = 'Googleログインを読み込めませんでした。';return;}
  const idOfRequest = ++driveRequest;
  const auth = google.accounts.oauth2.initTokenClient({
    client_id:googleClientId,scope:'https://www.googleapis.com/auth/drive.readonly',
    error_callback:()=>{driveError.textContent='Googleログインを完了できませんでした。';},
    callback:async response=>{
      if (driveRequest!==idOfRequest) return;
      if (!response.access_token) {driveError.textContent='Googleドライブの読み取りを許可してください。';return;}
      try {
        $('status').textContent='共有フォルダを読み込んでいます…';
        driveDialog.close();
        const files = await listDriveTree(id,response.access_token,idOfRequest);
        if (driveRequest!==idOfRequest) return;
        accessToken = response.access_token;
        sharedRecords = classifyDrive(files);
        rememberedFolder = folder;
        try { sessionStorage.setItem(catalogueKey,JSON.stringify({id,records:sharedRecords})); } catch {}
        try { localStorage.setItem(settingKey,JSON.stringify({folder})); } catch {}
        draw();
        $('status').textContent='共有ドライブから '+files.length+' ファイルを読み込みました。';
      } catch(error) { if (driveRequest===idOfRequest) fail(error); }
    }
  });
  auth.requestAccessToken({prompt:'select_account'});
};
$('closeDrive').onclick = () => {
  ++driveRequest;
  accessToken = null;
  sharedRecords = [];
  try { sessionStorage.removeItem(catalogueKey); } catch {}
  draw();
  driveDialog.close();
  $('status').textContent = '共有ドライブとの接続を解除しました。';
};
