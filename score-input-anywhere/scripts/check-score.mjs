import ts from 'typescript';
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');sqlite.exec(fs.readFileSync('drizzle/0000_rapid_serpent_society.sql','utf8'));
let identity={userId:'qa-owner',email:'qa@example.invalid'};
function prepared(sql){let args=[];return {bind(...v){args=v;return this},async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return {results:sqlite.prepare(sql).all(...args)}},async run(){const r=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}}}}}
const db={prepare:prepared,async batch(statements){return Promise.all(statements.map(s=>s.all()))}};
function module(path,require){const source=ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;const mod={exports:{}};const context={module:mod,exports:mod.exports,require,Response,Request,URL,crypto,console:{error(){}},Date};vm.runInNewContext(source,context,{filename:path});return mod.exports}
const score=module('lib/score.ts',()=>{throw Error('unexpected dependency')});const api=module('app/api/score/route.ts',name=>name==='../../access-auth'?{getAccessUserId:async()=>identity?.userId||null}:name==='@/db/raw'?{database:()=>db}:name==='@/lib/score'?score:undefined);
async function post(action,d={},status=200,extra={}){const response=await api.POST(new Request('https://score.test/api/score',{method:'POST',headers:{'Content-Type':'application/json',...extra},body:JSON.stringify({action,...d})}));const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));return result}
async function get(id,status=200){const response=await api.GET(new Request('https://score.test/api/score'+(id?'?campus='+id:'')));const result=await response.json();assert.equal(response.status,status,JSON.stringify(result));return result}
identity=null;await get('',401);identity={userId:'qa-owner'};
const a=(await post('createCampus',{name:'どこでも学習塾 東校'})).id,b=(await post('createCampus',{name:'自由な名前の西校'})).id;
await post('renameCampus',{campusId:a,name:'改名した校舎'});assert.equal((await get(a)).campuses[0].name,'改名した校舎');
await post('saveStudent',{campusId:a,name:'架空生徒',grade:'中2',school:'架空中学校',code:'A-01',startYear:2026,status:'在籍'});
await post('saveTest',{campusId:a,year:2026,name:'自由に付けたテスト名'});
let state=await get(a);const student=state.students[0],test=state.tests[0];
await post('saveAverage',{campusId:a,testId:test.id,grade:'中2',school:'架空中学校',values:{数学:'61.5',英語:'50'}});
const payload={campusId:a,studentId:student.id,testId:test.id,scores:{数学:{score:'85',dev:'62'},英語:{score:'70',dev:''}},rank:'12',collect:'回収済',memo:'架空の検証メモ',revision:0};
await post('saveRecord',payload);state=await get(a);assert.equal(state.records.length,1);assert.equal(state.records[0].scores.数学.score,'85');assert.equal(state.records[0].averages.数学,'61.5');assert.equal(state.records[0].rank,12);assert.equal(state.records[0].memo,payload.memo);
assert.equal((await get(b)).students.length,0);assert.equal((await get(b)).records.length,0);
await post('saveRecord',{...payload,campusId:b},400);await post('saveRecord',payload,409);
await post('saveRecord',{...payload,revision:1,scores:{数学:{score:'90'}}});state=await get(a);assert.equal(state.records.length,1);assert.equal(state.records[0].revision,2);assert.equal(state.records[0].scores.数学.score,'90');
await post('saveRecord',{...payload,revision:2,scores:{数学:{score:'101'}}},400);await post('saveRecord',{...payload,revision:2,rank:'0'},400);
identity={userId:'qa-other'};await get(a,403);await post('renameCampus',{campusId:a,name:'不正変更'},403);identity={userId:'qa-owner'};
await post('saveRecord',{...payload,revision:2},403,{origin:'https://other.test'});
await post('deleteRecord',{...payload,revision:1},409);await post('deleteRecord',{...payload,revision:2});assert.equal((await get(a)).records.length,0);
await post('saveStudent',{...student,campusId:a,id:student.id,startYear:2026,status:'退塾'});await post('saveRecord',payload,400);
assert.equal(score.total({数学:{score:'90'},英語:{score:'70'}}),160);assert.equal(score.total({}),null);
console.log('PASS: arbitrary campus names, rename, master creation, averages, persistence/readback, isolated campuses, identity access checks, score update, stale-write rejection, delete checks, retired students, numeric validation, cross-origin rejection.');
