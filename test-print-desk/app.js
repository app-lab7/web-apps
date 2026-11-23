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
let records = [], editing, printing, db, ready = false;
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
function options(node, values, first) {
  const selected = node.value;
  node.replaceChildren(...(first ? [new Option(first,'')] : []), ...values.map(value => new Option(value,value)));
  if (values.includes(selected)) node.value = selected;
}
function button(title, action, css) {
  const node = make('button',title,css);
  node.type = 'button';
  node.onclick = action;
  return node;
}
function draw() {
  const word = $('search').value.normalize('NFKC').toLocaleLowerCase().trim();
  const schools = [...new Set(records.map(r=>r.school))].sort((a,b)=>a.localeCompare(b,'ja'));
  $('schools').replaceChildren(...schools.map(s=>new Option(s,s)));
  options($('schoolFilter'),schools,'すべての学校');
  options($('gradeFilter'),grades.filter(g=>records.some(r=>r.grade===g)),'すべての学年');
  options($('yearFilter'),[...new Set(records.map(r=>r.year))].sort((a,b)=>b-a),'すべての年度');
  const visible = records.filter(r => filters.every(([id,key])=>!$(id).value || $(id).value===r[key])
    && [r.title,r.school,r.subject,r.grade,r.year].join(' ').normalize('NFKC').toLocaleLowerCase().includes(word));
  visible.sort((a,b)=>a.school.localeCompare(b.school,'ja') || grades.indexOf(a.grade)-grades.indexOf(b.grade) || b.year-a.year || b.updated-a.updated);
  $('count').textContent = visible.length+'件';
  $('list').replaceChildren();
  if (!visible.length) {
    const empty = make('div',null,'empty');
    empty.append(make('div','▤','icon'),make('strong',records.length?'条件に合うテストがありません':'まだテストが登録されていません'),
      make('p',records.length?'検索語や絞り込み条件を変えてください。':'テストを登録すると、学校・学年・年度ごとに表示されます。'));
    empty.append(records.length?button('絞り込みを解除',clear):button('＋ テストを登録',()=>openEditor(),'primary'));
    $('list').append(empty);
  }
  let previous;
  for (const r of visible) {
    const group = [r.school,r.grade,r.year+'年度'].join(' / ');
    if (group!==previous) $('list').append(make('h3',group,'group'));
    previous = group;
    const row = make('article'), details = make('div'), tags=make('div',null,'tags'), actions=make('div',null,'actions');
    details.append(make('h3',r.title));
    if(r.subject) details.append(make('p',r.subject,'meta'));
    for (const [key,label] of Object.entries(fields)) {
      if(r.files[key]) tags.append(make('span',label+' PDF','tag'));
    }
    details.append(tags);
    if (r.doc) {
      const link = make('a','Googleドキュメント','button');
      link.href=r.doc; link.target='_blank'; link.rel='noopener noreferrer';
      actions.append(link);
    }
    actions.append(button('編集',()=>openEditor(r)));
    if (Object.keys(r.files).length) actions.append(button('印刷・PDF',()=>openPrint(r),'primary'));
    row.append(details,actions);
    $('list').append(row);
  }
}
function clear() {
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
    edit.elements[name].value=record?.[name] ?? ({year:$('yearFilter').value || currentYear(),grade:$('gradeFilter').value || '中1',school:$('schoolFilter').value}[name] ?? '');
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
  print.querySelector('.error').textContent='';
  $('printTitle').textContent=record.title+' ／ '+record.school+' '+record.grade+' '+record.year+'年度';
  $('parts').replaceChildren();
  for(const [key,label] of Object.entries(fields)) {
    if(!record.files[key]) continue;
    const item=make('label'), check=make('input');
    check.type='checkbox';check.name='part';check.value=key;check.checked=true;
    item.append(check,' '+label+'（'+record.files[key].name+'）');
    $('parts').append(item);
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
  const tab=action==='open'?window.open('about:blank','_blank'):null;
  if(action==='open' && !tab) {errorBox.textContent='新しいタブを開けません。ポップアップを許可するか「PDFを保存」を使ってください。';return;}
  if(tab) tab.opener=null;
  const submits=[...print.querySelectorAll('[type=submit]')];
  submits.forEach(b=>b.disabled=true);
  try {
    const record=printing, layout=form.get('layout'), out=await PDFLib.PDFDocument.create(), pages=[];
    for(const key of chosen) {
      const doc=await openPdf(record.files[key]);
      if(layout==='normal') {
        for(const page of await out.copyPages(doc,doc.getPageIndices())) out.addPage(page);
      } else pages.push(...doc.getPages());
    }
    if(layout!=='normal') await booklet(out,pages,layout,form.get('binding'));
    out.setTitle(record.title);
    const blob=new Blob([await out.save()],{type:'application/pdf'});
    if(tab) tab.location.href=URL.createObjectURL(blob);
    else download(blob,record.title+(layout==='normal'?'':'_冊子')+'.pdf');
  } catch(error) {
    tab?.close();
    errorBox.textContent=error.message || 'PDFの作成に失敗しました。';
  } finally { submits.forEach(b=>b.disabled=false); }
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
