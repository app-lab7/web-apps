// JIZURA lyric overlay.  Reuses the approved cue times and keeps the picture static.
const fs=require('fs'),vm=require('vm');
const {createCanvas,GlobalFonts}=require('@napi-rs/canvas');
global.window=global;
global.document={createElement:w=>w==='canvas'?createCanvas(2,2):{},documentElement:{lang:'ja'}};
if(!GlobalFonts.registerFromPath('fonts/ipaexg.ttf','Noto Sans JP'))throw Error('font missing');
for(const f of fs.readdirSync('jizura_repo/src').filter(x=>x.endsWith('.js')&&x!=='12_ui.js').sort())
 vm.runInThisContext(fs.readFileSync('jizura_repo/src/'+f,'utf8'),{filename:f});
J.fontCSS=(key,px)=>`700 ${px.toFixed(2)}px "Noto Sans JP"`;
const project=JSON.parse(fs.readFileSync('ByeByeBLUE_JIZURA_full_project_v30.jizura.json'));
const plan=J.plan(project,{duration:232.44,beats:[]});
const timing=JSON.parse(fs.readFileSync('revised/timing-v39.json'));
const byLine=new Map(timing.map(x=>[x.line,x]));
// The same phrase position in verses one and two receives the same action.
function section(n){
 if(n<=12)return ['assemble','track','type','assemble','track','type','assemble','type','assemble','assemble','track','type','assemble'][n];
 if(n<=20)return ['slide','type','slide','track','slide','type','slide','track'][n-13];
 if(n<=31)return ['band','key','huge','type','band','phrase','type','huge','band','track','huge'][n-21];
 if(n<=43)return section(n-33);
 if(n<=51)return section(n-31);
 if(n<=58)return section(n-31);
 if(n<=67)return n%2?'band':'phrase';
 if(n>=69)return section(21+(n-69)%11);
 return 'assemble';
}
plan.cuts=plan.cuts.filter(c=>byLine.has(c.line));
for(const c of plan.cuts){const x=byLine.get(c.line);c.start=x.display_start;c.end=x.display_end;c.dur=c.end-c.start;
 c.text=x.text==='Bye Bye Bye'?'BYE BYE BYE':x.text;c.layout='bbEditorial';
 c.params={mode:/^BYE BYE BYE$/.test(c.text)?'band':section(c.line)};
 c.enter='cut';c.hold='still';c.exit='cut';c.treat=null;c.decor=[];c.trans=null;c.morph=null;c.cam='push';c.bg='none';
}
plan.cuts.sort((a,b)=>a.start-b.start);plan.cuts.forEach((c,i)=>c.index=i);
plan.events=[];plan.beats=[];plan.fx.chroma=0;plan.style.ghost=0;plan.hud=false;
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{x=clamp(x);return x*x*(3-2*x)};
const weight=ch=>/[\u3000-\u9fff\uff00-\uffef]/.test(ch)?1:/\s/.test(ch)?.34:.60;
J.LAYOUTS.bbEditorial={render(env){
 if(env.pass!=='main')return null;
 const {W,H,cut}=env,{mode}=cut.params,lt=env.lt,dur=cut.dur;
 const chars=[...cut.text],units=chars.reduce((s,c)=>s+weight(c),0),font='gothic_black';
 // Person-facing placements, as in the approved v39 comparison frames.
 const left=[9,15,38,52,53,54,55,56,63,64,65,66,67,70,80].includes(cut.line);
 const right=[7,8,10,11,17,18,19,20,33,34,35,36,39,40,41,48,49,50,51,74].includes(cut.line);
 const side=left||right,cx=left?W*.265:right?W*.735:W*.5;
 const y=cut.line===70?H*.28:H*.48;
 const width=W*(side?.45:.91);
 const rowBreak=(n)=>{
  const semantic={
   'ボクはきっと':3,'時間がどれだけ':3,'キミはどこにも':3,
   'いつもなんとなく':4,'風に揺れて揺れてた':5,'無かったワケでもなくて':6,
   '「愛を手にする」と':3,'ボクは置いてけぼり':3,'傍には居られないね':3,
   'キミはあいも変わらずで':6,'そんな気になれる笑顔':5,
   'このままでいいかな？':5,'あの日描いたミライの…':6,
   'ヨワイボク＆Yesterday':6,'キミを忘れないから':3
  };
  if(semantic[cut.text]){const at=semantic[cut.text];return [chars.slice(0,at),chars.slice(at)];}
  if(n<8)return [chars];
  let at=Math.ceil(n/2);
  for(const term of ['ミライへ','セカイへ','Yesterday','このまま','あの子も']){
   let p=cut.text.indexOf(term);if(p>=3&&p<=n-3){at=p;break}
  }
  return [chars.slice(0,at),chars.slice(at)];
 };
 const rows=rowBreak(chars.length),maxUnits=Math.max(...rows.map(r=>r.reduce((v,c)=>v+weight(c),0)));
 const size=Math.min(chars.length<=4?H*.34:chars.length<=7?H*.285:H*.245,width/Math.max(1,maxUnits));
 let pos=[],cursor=cx-units*size/2;
 for(const ch of chars){let w=weight(ch)*size;pos.push(cursor+w/2);cursor+=w}
 const fade=clamp((dur-lt)/.17);
 const draw=(ch,x,yy,sz,a,color='#fff',rot=0)=>{
  if(!ch.trim()||a<=0)return;
  env.draw({text:ch,font,size:sz,x,y:yy,align:'center',color,rot,alpha:a*fade,
   stroke:0,strokeColor:color,
   shadow:{dx:1.2,dy:1.8,blur:2,color:'rgba(0,0,0,.46)'}});
 };
 if(mode==='band'){
  // Fast diagonal plate; letters, not the background, do the rhythm work.
  const arrival=ease(lt/.13),departure=ease((lt-(dur-.2))/.2);
  const bandWidth=side?W*.42:W*.96;
  const bandLeft=side?left?W*.012:W*.56:W*.02;
  const offset=-(1-arrival)*W*1.15+departure*W*1.15;
  const h=H*.19,slant=H*.065,by=y;
  env.poly([[bandLeft+offset,by-h/2+slant],[bandLeft+bandWidth+offset,by-h/2-slant],
            [bandLeft+bandWidth+offset,by+h/2-slant],[bandLeft+offset,by+h/2+slant]],'#fff',fade,false);
  const letterSpan=.065;
  const bs=Math.min(H*.18,bandWidth/Math.max(1,units));
  let bp=[],bx=(side&&left?W*.225:cx)-units*bs/2;
  chars.forEach(ch=>{const w=weight(ch)*bs;bp.push(bx+w/2);bx+=w});
  chars.forEach((ch,i)=>{
   const q=ease((lt-.005-i*letterSpan/Math.max(1,chars.length))/.065);
   draw(ch,bp[i]+offset*.08,by+(1-q)*H*.018,bs*(.96+.04*q),q,'#111',-5);
  });
  return null;
 }
 if(mode==='key'&&chars.length>1){
  const first=chars[0],rest=chars.slice(1),q=ease(lt/.12),out=ease((lt-(dur-.21))/.21);
  const k=Math.min(H*(side?.33:.40),side?W*.20:W*.25);
  const at=Math.ceil(rest.length/2),rr=[rest.slice(0,at),rest.slice(at)];
  const restUnits=Math.max(...rr.map(row=>row.reduce((s,c)=>s+weight(c),0)));
  let s=Math.min(H*.145,(width-k*.70)/Math.max(1,restUnits));
  let x=cx-width/2+k*.49;
  draw(first,x-(1-q)*W*.16,y,k,q);
  const rx=x+k*.64;
  if(side){const room=(left?W*.49:W*.97)-rx;s=Math.min(s,room/Math.max(1,restUnits));}
  rr.forEach((row,j)=>{let xx=rx;row.forEach((ch,i)=>{let w=weight(ch)*s,p=ease((lt-.015-(i+j*row.length)*.005)/.075);
   draw(ch,xx+w/2+(1-p)*W*.035+out*W*.04,y+(j?1:-1)*H*.068,s,p);xx+=w;});});
  return null;
 }
 if(mode==='phrase'&&chars.length>=8){
  let split=cut.text.includes('ミライへ')?cut.text.indexOf('ミライへ'):
   cut.text.includes('セカイへ')?cut.text.indexOf('セカイへ'):
   cut.text.includes('Yesterday')?cut.text.indexOf('Yesterday'):
   cut.text.includes('会えたら')?cut.text.indexOf('会えたら'):Math.floor(chars.length*.55);
  const lines=[chars.slice(0,split),chars.slice(split)];
  lines.forEach((line,j)=>{
   const u=line.reduce((a,c)=>a+weight(c),0),s=Math.min(H*.205,width/Math.max(1,u));
   let x=cx-u*s/2;const q=ease((lt-j*.02)/.11),out=ease((lt-(dur-.21))/.21);
   line.forEach((ch,i)=>{let w=weight(ch)*s;draw(ch,x+w/2+(1-q)*(j?W*.16:-W*.16)+out*W*.05,y+(j?1:-1)*H*.072,s,q);x+=w;});
  });
  return null;
 }
 if(mode==='huge'&&rows.length===1){
  const q=ease(lt/.13),out=ease((lt-(dur-.23))/.23);
  const hs=Math.min(H*.30,width/Math.max(1,units)),dx=(1-q)*W*-.18+out*W*.10;
  let x=cx-units*hs/2;
  chars.forEach((ch,i)=>{let w=weight(ch)*hs;draw(ch,x+w/2+dx,y,hs,q);x+=w;});
  return null;
 }
 // Four JIZURA typography actions: assembled letters, tracking, type reveal,
 // and one directional large slide.  None contain a bounce, punch zoom or shake.
 if(mode==='slide'&&rows.length===1){
  const q=ease(lt/.13),out=ease((lt-(dur-.22))/.22),dx=(1-q)*W*(left?-.16:.16)+out*W*(left?-.12:.12);
  chars.forEach((ch,i)=>draw(ch,pos[i]+dx,y,size,q));
  return null;
 }
 if(mode==='track'&&rows.length===1){
  const q=ease(lt/.13),out=ease((lt-(dur-.20))/.20);
  chars.forEach((ch,i)=>{
   const spread=(i-(chars.length-1)/2)*size*.46*(1-q);
   draw(ch,pos[i]+spread+out*W*.06,y,size,q);
  });
  const a=ease(lt/.09)*(1-out),from=cx-units*size/2,to=cx+units*size/2;
  env.line([[from,y+size*.72],[from+(to-from)*ease(lt/.13),y+size*.72]],'#fff',Math.max(1,W*.0018),a,false);
  return null;
 }
 const totalSpan=.065;
 let serial=0;
 rows.forEach((row,j)=>{
  const u=row.reduce((v,c)=>v+weight(c),0),ry=y+(rows.length>1?(j?1:-1)*H*.145:0);
  let x=cx-u*size/2;
  row.forEach(ch=>{
   const w=weight(ch)*size,delay=serial*totalSpan/Math.max(1,chars.length),q=ease((lt-delay)/.07);
   const out=ease((lt-(dur-.20))/.20);
   const dx=mode==='assemble'?(1-q)*(serial%2?-1:1)*W*.07:mode==='slide'?(1-q)*-W*.15:mode==='track'?(1-q)*(serial-row.length/2)*size*.27:0;
   const dy=mode==='type'?(1-q)*H*.033:0;
   draw(ch,x+w/2+dx+out*W*.055,ry+dy,size,q);x+=w;serial++;
  });
 });
 return null;
}};
const renderer=new J.Renderer(),W=Number(process.argv[2]||960),H=Number(process.argv[3]||540),
 start=Number(process.argv[4]||55),end=Number(process.argv[5]||80),fps=30;
const canvas=createCanvas(W,H),ctx=canvas.getContext('2d');let frame=0,last=Math.round((end-start)*fps);
function draw(){let ok=true;while(ok&&frame<last){let t=start+frame/fps;
 renderer.frame(ctx,plan,t,{scale:W/plan.W,transparent:true,noGhost:true,noTrans:true,noPost:true,noHud:true,fast:true});
 ok=process.stdout.write(Buffer.from(ctx.getImageData(0,0,W,H).data));frame++;
 }if(frame<last)process.stdout.once('drain',draw);else process.stdout.end();}draw();
