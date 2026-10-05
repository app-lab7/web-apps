const fs=require('fs'),vm=require('vm'),assert=require('assert');
const nodes={};const node=id=>nodes[id]??={value:'',innerHTML:'',textContent:'',className:'',disabled:false,addEventListener(){},classList:{toggle(){}},scrollIntoView(){},showModal(){},close(){}};
const ctx={console,setTimeout,clearTimeout,URL,URLSearchParams,AbortController,location:{search:'?demo=1'},localStorage:{getItem(){return null},setItem(){}},window:{addEventListener(){},print(){}},document:{getElementById:node,querySelectorAll(){return []}},confirm(){return true},fetch(){throw Error('デモが実APIへ通信しました')},FormData:class{}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('score-manager/app.js','utf8'),ctx);
(async()=>{await new Promise(r=>setTimeout(r,0));await vm.runInContext(`(async()=>{
selection={school:'大府西',grade:'中3',year:'2026',test:'第1回'};mode='input';await loadRows();if(rows.length!==2)throw Error('学校絞り込み');
rows[0].draft.scores['国語'].score='0';if(!dirty(rows[0]))throw Error('0点の変更');if(count(rows[0].draft)!==1)throw Error('0点の入力数');
rows[1].draft.scores['数学'].score='101';let refused=false;try{validate(rows[1].draft)}catch(_){refused=true}if(!refused)throw Error('範囲検証');rows[1].draft.scores['数学'].score='';
await saveAll();if(dirty(rows[0])||!rows[0].saved)throw Error('保存状態');
rows[0].draft.scores['数学'].score='80';const live=demoRecords['2026|第1回|DEMO-1'];live.memo='別の人の変更';await saveAll();if(!dirty(rows[0])||rows[0].draft.scores['数学'].score!=='80')throw Error('競合時の入力保持');
metric='dev';mode='scores';rows[0].draft.scores['国語'].dev=0;renderTable();if(!$('listTable').innerHTML.includes('>0<'))throw Error('偏差値0');
if(esc('<script>')!=='&lt;script&gt;')throw Error('エスケープ');
await demoRequest('managerSave',{kind:'school',name:'確認中学'});if(!demoData.schools.includes('確認中学'))throw Error('学校登録');
})()`,ctx);const gs=fs.readFileSync('score-manager/AppsScript.gs','utf8');vm.runInNewContext(gs+`\nif(managerYear_('2026')!=='2026')throw Error('year');let fail=false;try{managerText_('=IMPORTXML()','学校')}catch(_){fail=true}if(!fail)throw Error('formula');managerValidateScores_({scores:{国語:{score:0,dev:50}}});`,{});console.log('PASS: 学校絞込、点数0、入力検証、保存、競合時の下書き保持、偏差値0、デモの実API通信禁止、登録、GAS構文・数式入力拒否');})().catch(e=>{console.error(e);process.exitCode=1});
