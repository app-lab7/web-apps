'use strict';
const $ = id => document.getElementById(id);
const make = (tag, value, className) => {
  const node = document.createElement(tag);
  if (value) node.textContent = value;
  if (className) node.className = className;
  return node;
};
const fields = {question:'問題', answer:'解答', explanation:'解説'};
const grades = ['小1','小2','小3','小4','小5','小6','中1','中2','中3','高1','高2','高3','その他'];
const edit = $('editForm'), print = $('printForm');
const filters = [['schoolFilter','school'],['gradeFilter','grade'],['yearFilter','year']];
const subjectOrder = ['国語','数学','英語','理科','社会','音楽','美術','保健体育','技術・家庭','技術','家庭'];
const unclassifiedSubject = '科目未分類';
let subjectFilter = '';
let records = [], sharedRecords = [], editing, printing, db, ready = false;
const fail = error => { $('status').textContent = error.message || String(error); };
function transaction(mode, run) {
  return new Promise((resolve,reject) => {
    const tx = db.transaction('tests', mode);
    const request = run(tx.objectStore('tests'));
    tx.oncomplete = () => resolve(request?.result);
    tx.onabort = () => reject(tx.error || new Error('保存処理を完了できませんでした。'));
  });
}
async function refresh() {
  records = await transaction('readonly', store => store.getAll());
  draw();
}
function options(node, values, first, label = value => value) {
  const selected = node.value;
  node.replaceChildren(...(first ? [new Option(first,'')] : []), ...values.map(value => new Option(label(value),value)));
  if (values.includes(selected)) node.value = selected;
}
function button(title, action, css) {
  const node = make('button',title,css);
  node.type = 'button';
  node.onclick = action;
  return node;
}
function displayTestName(record) {
  if (!record.shared) return record.title;
  const year = record.year ? record.year + '年度' : '年度未分類';
  const grade = /^中[1-3]$/.test(record.grade) ? '中学' + record.grade.slice(1) + '年' : record.grade;
  return [year, record.school, grade, record.title].filter(Boolean).join('・');
}
function filterChip(label, remove) {
  const chip = button(label+' ×',()=>{
    remove();
    draw();
    ($('activeFilters').querySelector('button') || $('search')).focus();
  },'active-filter');
  chip.setAttribute('aria-label',label+'の絞り込みを解除');
  return chip;
}
function draw() {
  const allRecords = [...records, ...sharedRecords];
  const keyword = $('search').value.trim();
  const words = keyword.normalize('NFKC').toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const schools = [...new Set(allRecords.map(r=>r.school))].sort((a,b)=>
    Number(a==='学校未分類')-Number(b==='学校未分類') || a.localeCompare(b,'ja'));
  $('schools').replaceChildren(...schools.map(s=>new Option(s,s)));
  const gradeOrder = grade => grades.includes(grade) ? grades.indexOf(grade) : grades.length;
  options($('schoolFilter'),schools,'すべての学校');
  options($('gradeFilter'),[...new Set(allRecords.map(r=>r.grade))].sort((a,b)=>gradeOrder(a)-gradeOrder(b)),'すべての学年');
  options($('yearFilter'),[...new Set(allRecords.map(r=>r.year).filter(Boolean))].sort((a,b)=>b-a),'すべての年度',year=>year+'年度');
  const base = allRecords.filter(r => {
    if (!filters.every(([id,key])=>!$(id).value || $(id).value===r[key])) return false;
    if (!words.length) return true;
    const searchable = [displayTestName(r),r.title,r.school,r.subject,r.grade,r.year,...Object.values(r.files).map(f=>f.name)]
      .join(' ').normalize('NFKC').toLocaleLowerCase();
    return words.every(word=>searchable.includes(word));
  });
  const getSubject = record => record.subject?.trim() || unclassifiedSubject;
  const availableSubjects = new Set(allRecords.map(getSubject));
  if (subjectFilter && !availableSubjects.has(subjectFilter)) subjectFilter = '';
  const counts = new Map();
  for (const r of base) {
    const subject = getSubject(r);
    counts.set(subject,(counts.get(subject)||0)+1);
  }
  const subjects = [...subjectOrder.filter(subject=>availableSubjects.has(subject)),
    ...[...availableSubjects].filter(subject=>!subjectOrder.includes(subject)).sort((a,b)=>a.localeCompare(b,'ja'))]
    .filter(subject=>counts.has(subject) || subject===subjectFilter);
  $('subjectButtons').replaceChildren(...['',...subjects].map(subject=>{
    const choice = button(subject || 'すべての科目',()=>{
      subjectFilter = subject;
      draw();
      const selected = $('subjectButtons').querySelector('[aria-pressed="true"]');
      selected?.focus();
    },'subject-choice');
    choice.setAttribute('aria-pressed',String(subject===subjectFilter));
    choice.append(make('span',String(subject ? counts.get(subject)||0 : base.length),'subject-count'));
    return choice;
  }));
  const active = $('activeFilters');
  active.replaceChildren();
  if (keyword) active.append(filterChip('検索「'+keyword+'」',()=>{$('search').value='';}));
  for (const [id] of filters) {
    const select = $(id);
    if (select.value) active.append(filterChip(select.selectedOptions[0].textContent,()=>{select.value='';}));
  }
  if (subjectFilter) active.append(filterChip(subjectFilter,()=>{subjectFilter='';}));
  active.hidden = !active.children.length;
  $('clear').disabled = active.hidden;
  const visible = subjectFilter ? base.filter(r=>getSubject(r)===subjectFilter) : base;
  $('filterTotal').textContent = allRecords.length ? '全'+allRecords.length+'件のうち '+visible.length+'件を表示' : '';
  visible.sort((a,b)=>schools.indexOf(a.school)-schools.indexOf(b.school)
    || gradeOrder(a.grade)-gradeOrder(b.grade) || b.year-a.year
    || (Number(a.round)||Infinity)-(Number(b.round)||Infinity)
    || b.updated-a.updated || a.title.localeCompare(b.title,'ja'));
  const waitingForDrive = !allRecords.length && new URLSearchParams(location.hash.slice(1)).has('folder');
  $('count').textContent = waitingForDrive ? '共有教材は未表示' : visible.length+'件';
  $('list').replaceChildren();
  if (!visible.length) {
    const empty = make('div',null,'empty');
    empty.append(make('div','▤','icon'),make('strong',allRecords.length?'条件に合うテストがありません':'まだテストが登録されていません'),
      make('p',allRecords.length?'検索語や絞り込み条件を変えてください。':'テストを登録すると、学校・学年・年度ごとに表示されます。'));
    if (waitingForDrive) {
      empty.replaceChildren(make('div','▤','icon'),make('strong','共有教材を開く'),
        make('p','Googleに接続すると、学校・学年・年度で仕分けした教材が表示されます。'),
        button('共有ドライブを開く',()=>$('connectDrive').click(),'primary'));
    } else {
      empty.append(allRecords.length?button('絞り込みを解除',clear):button('＋ テストを登録',()=>openEditor(),'primary'));
    }
    $('list').append(empty);
  }
  let previous;
  for (const r of visible) {
    const group = [(r.year ? r.year+'年度' : '年度未分類'),r.school,r.grade].join(' / ');
    if (group!==previous) $('list').append(make('h3',group,'group'));
    previous = group;
    const row = make('article'), details = make('div'), tags=make('div',null,'tags'), actions=make('div',null,'actions');
    details.append(make('h3',displayTestName(r)));
    if(r.subject && !r.shared) details.append(make('p',r.subject,'meta'));
    for (const label of new Set(Object.entries(r.files).map(([key,file])=>file.label || fields[key]))) {
      tags.append(make('span',label+' PDF','tag'));
    }
    details.append(tags);
    if (r.doc) {
      const link = make('a','Googleドキュメント','button');
      link.href=r.doc; link.target='_blank'; link.rel='noopener noreferrer';
      actions.append(link);
    }
    if (!r.shared) actions.append(button('編集',()=>openEditor(r)));
    if (r.shared) tags.append(make('span','共有ドライブ','tag'));
    if (r.needsReview) tags.append(make('span','テスト回 要確認','tag'));
    if (r.shared && Object.keys(r.files).length) {
      const originals = make('details',null,'original-names');
      originals.append(make('summary','元のファイル名'));
      const names = make('ul');
      for (const asset of Object.values(r.files)) names.append(make('li',asset.name));
      originals.append(names);
      details.append(originals);
    }
    if (r.sourceUrl) {
      const source = make('a','原本を開く','button');
      source.href = r.sourceUrl; source.target = '_blank'; source.rel = 'noopener noreferrer';
      actions.append(source);
    }
    if (Object.keys(r.files).length) actions.append(button('印刷・PDF',()=>openPrint(r),'primary'));
    row.append(details,actions);
    $('list').append(row);
  }
}
function clear() {
  subjectFilter='';
  $('search').value='';
  for (const [id] of filters) $(id).value='';
  draw();
}
function currentYear() {
  const parts = new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'numeric'}).formatToParts(new Date());
  return Number(parts.find(p=>p.type==='year').value)-(Number(parts.find(p=>p.type==='month').value)<4);
}
function openEditor(record) {
  if (!ready) return;
  editing = record;
  edit.reset();
  edit.querySelector('.error').textContent='';
  $('editTitle').textContent=record?'テストを編集':'テストを登録';
  for (const name of ['title','school','grade','year','subject','doc']) {
    edit.elements[name].value=record?.[name] ?? ({year:$('yearFilter').value || currentYear(),grade:grades.includes($('gradeFilter').value) ? $('gradeFilter').value : '中1',school:$('schoolFilter').value}[name] ?? '');
  }
  $('uploads').replaceChildren();
  for (const [key,label] of Object.entries(fields)) {
    const item=make('label',label+' PDF');
    const input=make('input');
    input.type='file';input.accept='.pdf,application/pdf';input.name=key;
    item.append(input);
    $('uploads').append(item);
    if (record?.files[key]) {
      const saved=make('label',null,'existing'), check=make('input');
      check.type='checkbox';check.name='remove_'+key;
      saved.append(check,' 添付を外す（'+record.files[key].name+'）');
      $('uploads').append(saved);
    }
  }
  if(record) $('uploads').append(button('このテストを削除',async()=>{
    if(!confirm('「'+record.title+'」を削除しますか？')) return;
    try {
      await transaction('readwrite',store=>store.delete(record.id));
      $('editor').close();
      await refresh();
      $('status').textContent='テストを削除しました。';
    } catch(error) { edit.querySelector('.error').textContent=error.message; }
  },'danger'));
  $('editor').showModal();
}
function validDoc(value) {
  if(!value) return true;
  try {
    const url=new URL(value);
    return url.origin==='https://docs.google.com' && /^\/document\/(?:u\/\d+\/)?d\/(?:e\/)?[\w-]+(?:\/|$)/.test(url.pathname);
  } catch {return false;}
}
async function openPdf(file) {
  try {
    const doc=await PDFLib.PDFDocument.load(await file.blob.arrayBuffer());
    if(doc.getPageCount()<1) throw new Error();
    return doc;
  } catch {
    throw new Error('「'+file.name+'」を開けません。PDF形式とパスワード保護の有無を確認してください。');
  }
}
edit.onsubmit=async event=>{
  event.preventDefault();
  const submit=event.submitter;
  submit.disabled=true;
  const errorBox=edit.querySelector('.error');
  errorBox.textContent='';
  try {
    const data=new FormData(edit), r={id:editing?.id || crypto.randomUUID(),updated:Date.now(),files:{...editing?.files}};
    for (const key of ['title','school','grade','year','subject','doc']) r[key]=data.get(key).trim();
    if(!r.title || !r.school) throw new Error('テスト名と学校を入力してください。');
    if(!validDoc(r.doc)) throw new Error('Googleドキュメントの共有リンクまたは編集画面のURLを入力してください。');
    for (const key of Object.keys(fields)) {
      const file=data.get(key);
      if(file.name) {
        const saved={name:file.name,blob:new Blob([file],{type:'application/pdf'})};
        await openPdf(saved);
        r.files[key]=saved;
      } else if(data.has('remove_'+key)) delete r.files[key];
    }
    if(!Object.keys(r.files).length && !r.doc) throw new Error('PDFの添付または GoogleドキュメントのURLを入力してください。');
    await transaction('readwrite',store=>store.put(r));
    $('editor').close();
    await refresh();
    $('status').textContent='テストを保存しました。';
  } catch(error) { errorBox.textContent=error.message; }
  finally {submit.disabled=false;}
};
function openPrint(record) {
  printing=record;
  print.reset();
  $('reconnectForPrint').hidden = !record.shared || hasDriveConnection();
  print.querySelector('.error').textContent='';
  $('printTitle').textContent=record.shared ? displayTestName(record) : record.title+' ／ '+record.school+' '+record.grade+' '+record.year+'年度';
  $('parts').replaceChildren();
  for(const [key,asset] of Object.entries(record.files)) {
    const label = asset.label || fields[key];
    const item=make('label'), check=make('input');
    check.type='checkbox';check.name='part';check.value=key;check.checked=true;
    item.append(check,' '+label+'（'+record.files[key].name+'）');
    $('parts').append(item);
    if (asset.driveId) {
      const original = make('a','元ファイルを開く','print-original');
      original.href = 'https://drive.google.com/open?id=' + encodeURIComponent(asset.driveId);
      original.target = '_blank';
      original.rel = 'noopener noreferrer';
      $('parts').append(original);
    }
  }
  printHint();
  $('printer').showModal();
}
function printHint() {
  const booklet=print.elements.layout.value!=='normal';
  $('bindingLine').hidden=!booklet;
  $('printHint').textContent=booklet?'両面印刷・短辺とじ・倍率100%で、PDFと同じ用紙サイズを指定してください。ページ数に応じて末尾に白紙を追加します。':'問題 → 解答 → 解説の順で、選んだPDFを1つにまとめます。';
}
print.elements.layout.onchange=printHint;
function sheetOrder(count,right) {
  const total=Math.ceil(count/4)*4, pairs=[];
  for(let low=0,high=total-1;low<high;low+=2,high-=2) {
    pairs.push([high,low],[low+1,high-1]);
  }
  return right?pairs.map(pair=>pair.reverse()):pairs;
}
async function booklet(out,pages,layout,binding) {
  const [width,height]=layout==='a3'?[1190.55,841.89]:[841.89,595.28];
  const half=width/2, margin=12;
  for(const pair of sheetOrder(pages.length,binding==='right')) {
    const sheet=out.addPage([width,height]);
    for(const [slot,index] of pair.entries()) {
      const page=pages[index];
      if(!page?.node.Contents()) continue;
      const {x,y,width:w,height:h}=page.getCropBox();
      const angle=((page.getRotation().angle%360)+360)%360;
      const turned=angle===90 || angle===270;
      const [viewW,viewH]=turned?[h,w]:[w,h];
      const scale=Math.min((half-2*margin)/viewW,(height-2*margin)/viewH);
      const dw=w*scale, dh=h*scale;
      const left=slot*half+(half-viewW*scale)/2, bottom=(height-viewH*scale)/2;
      const embedded=await out.embedPage(page,{left:x,bottom:y,right:x+w,top:y+h});
      sheet.drawPage(embedded,{width:dw,height:dh,rotate:PDFLib.degrees(-angle),
        x:left+([180,270].includes(angle)?viewW*scale:0),
        y:bottom+([90,180].includes(angle)?viewH*scale:0)});
    }
  }
}
function download(blob,name) {
  const url=URL.createObjectURL(blob), link=make('a');
  link.href=url;link.download=name;
  document.body.append(link);link.click();link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),60000);
}
print.onsubmit=async event=>{
  event.preventDefault();
  const errorBox=print.querySelector('.error');
  errorBox.textContent='';
  const form=new FormData(print), chosen=form.getAll('part');
  if(!chosen.length) {errorBox.textContent='PDFを1つ以上選んでください。';return;}
  const action=event.submitter?.value;
  if (chosen.some(key=>printing.files[key]?.driveId) && !hasDriveConnection()) {
    $('reconnectForPrint').hidden = false;
    openDriveDialog(()=>{
      if ($('printer').open) print.requestSubmit(event.submitter || $('openPrintPreview'));
    });
    return;
  }
  $('reconnectForPrint').hidden = true;
  const submits=[...print.querySelectorAll('[type=submit]')];
  submits.forEach(b=>b.disabled=true);
  const originalLabel = event.submitter?.textContent;
  if (event.submitter) event.submitter.textContent = 'PDFを準備中…';
  try {
    const record=printing, layout=form.get('layout'), out=await PDFLib.PDFDocument.create(), pages=[];
    for(const key of chosen) {
      const asset=record.files[key];
      const doc=await openPdf(asset.driveId ? {...asset,blob:await fetchDrivePdf(asset)} : asset);
      if(layout==='normal') {
        for(const page of await out.copyPages(doc,doc.getPageIndices())) out.addPage(page);
      } else pages.push(...doc.getPages());
    }
    if(layout!=='normal') await booklet(out,pages,layout,form.get('binding'));
    const outputTitle = displayTestName(record);
    out.setTitle(outputTitle);
    const bytes=await out.save();
    if (action==='preview' && $('printer').open) {
      await showPrintPreview(bytes, outputTitle, layout);
    } else if (action==='download') {
      download(new Blob([bytes],{type:'application/pdf'}),outputTitle+(layout==='normal'?'':'_冊子')+'.pdf');
    }
  } catch(error) {
    if (error.code==='drive-reconnect') $('reconnectForPrint').hidden=false;
    errorBox.textContent=error.message || 'PDFの作成に失敗しました。';
  } finally {
    submits.forEach(b=>b.disabled=false);
    if (event.submitter) event.submitter.textContent=originalLabel;
  }
};
function dataUrl(blob) {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
$('backup').onclick=async()=>{
  if(!ready) return;
  try {
    const tests=await transaction('readonly',store=>store.getAll());
    for (const r of tests) {
      for (const file of Object.values(r.files)) {
        file.data=await dataUrl(file.blob);
        delete file.blob;
      }
    }
    download(new Blob([JSON.stringify({version:1,tests})],{type:'application/json'}),'test-print-backup-'+new Date().toISOString().slice(0,10)+'.json');
  } catch(error){fail(error);}
};
$('restore').onchange=async event=>{
  const file=event.target.files[0];
  if(!file || !ready) return;
  try {
    const backup=JSON.parse(await file.text());
    if(backup.version!==1 || !Array.isArray(backup.tests)) throw new Error('このツールのバックアップファイルを選択してください。');
    const imported=[];
    for(const r of backup.tests){
      if(!r || !['title','school','grade','year','subject','doc','id'].every(key=>typeof r[key]==='string') || !r.title.trim() || !r.school.trim()
        || !grades.includes(r.grade) || !/^\d{4}$/.test(r.year) || !validDoc(r.doc) || !r.files || typeof r.files!=='object') throw new Error('バックアップ内のテスト情報を読み込めません。');
      const files={};
      for(const key of Object.keys(fields)) {
        const asset=r.files[key];
        if(!asset) continue;
        if(typeof asset.name!=='string' || typeof asset.data!=='string' || !asset.data.startsWith('data:application/pdf;base64,')) throw new Error('バックアップ内のPDFを読み込めません。');
        const bytes=Uint8Array.from(atob(asset.data.split(',')[1]),c=>c.charCodeAt(0));
        files[key]={name:asset.name,blob:new Blob([bytes],{type:'application/pdf'})};
        await openPdf(files[key]);
      }
      imported.push({id:r.id,title:r.title,school:r.school,grade:r.grade,year:r.year,subject:r.subject,doc:r.doc,updated:Number(r.updated)||Date.now(),files});
    }
    await transaction('readwrite',store=>{
      for(const r of imported){
        const lookup=store.get(r.id);
        lookup.onsuccess=()=>{if(!lookup.result) store.add(r);};
      }
    });
    await refresh();
    $('status').textContent='バックアップを読み込みました。同じ登録データはそのまま残しています。';
  } catch(error){fail(error);}
  finally {event.target.value='';}
};
options(edit.elements.grade,grades);
$('add').onclick=()=>openEditor();
$('reconnectForPrint').onclick=()=>print.requestSubmit($('openPrintPreview'));
$('clear').onclick=clear;
$('search').oninput=draw;
for (const [id] of filters) $(id).onchange=draw;
document.querySelectorAll('[data-close]').forEach(node=>node.onclick=()=>node.closest('dialog').close());
try{
  const request=indexedDB.open('test-print-desk',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('tests',{keyPath:'id'});
  request.onsuccess=async()=>{
    db=request.result;
    try {await refresh();ready=true;} catch(error){fail(error);}
  };
  request.onerror=()=>fail(new Error('ブラウザの保存領域を開けませんでした。'));
}catch(error){fail(error);}
