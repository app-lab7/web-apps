export const SUBJECTS=['国語','数学','英語','理科','社会'] as const;
export const GRADES=['小1','小2','小3','小4','小5','小6','中1','中2','中3','高1','高2','高3','その他'];
export type Campus={id:string;name:string};
export type Student={id:string;campus_id:string;code:string;name:string;grade:string;school:string;status:string;start_year:number};
export type Test={id:string;year:number;name:string;sort_order:number};
export type Score={score:string;dev:string};
export type RecordRow={id:string;student_id:string;test_id:string;grade:string;school:string;scores:Record<string,Score>;averages:Record<string,string>;rank:number|null;collect:string;memo:string;revision:number;updated_at:string};
export type Average={id:string;test_id:string;grade:string;school:string;values:Record<string,string>};
export type Snapshot={campuses:Campus[];students:Student[];tests:Test[];records:RecordRow[];averages:Average[]};
export const emptySnapshot:Snapshot={campuses:[],students:[],tests:[],records:[],averages:[]};
export function text(v:unknown,label:string,max=80):string {if(typeof v!=='string'||!v.trim()||v.trim().length>max||/[\r\n\t]/.test(v))throw Error(label+'を入力してください');return v.trim();}
export function year(v:unknown):number {const n=Number(v);if(!Number.isInteger(n)||n<2000||n>2099)throw Error('年度は2000〜2099で入力してください');return n;}
export function numberText(v:unknown,label:string):string {const s=String(v??'').trim();if(s!==''&&(!/^\d+(\.\d+)?$/.test(s)||Number(s)>100))throw Error(label+'は0〜100で入力してください');return s;}
export function scores(v:unknown):Record<string,Score> {const source=(v&&typeof v==='object'?v:{}) as Record<string,Partial<Score>>;return Object.fromEntries(SUBJECTS.map(s=>[s,{score:numberText(source[s]?.score,s+'の点数'),dev:numberText(source[s]?.dev,s+'の偏差値')}]));}
export function averageValues(v:unknown):Record<string,string> {const source=(v&&typeof v==='object'?v:{}) as Record<string,unknown>;return Object.fromEntries(SUBJECTS.map(s=>[s,numberText(source[s],s+'の学校平均')]));}
export function total(values:Record<string,Score>):number|null {const scored=SUBJECTS.map(s=>values[s]?.score??'').filter(v=>v!=='');return scored.length?scored.reduce((n,v)=>n+Number(v),0):null;}
