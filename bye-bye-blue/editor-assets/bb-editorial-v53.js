// Based on the actual v44 JIZURA bbEditorial layout (MIT licensed JIZURA core).
const clamp=x=>Math.max(0,Math.min(1,x));
const ease=x=>{x=clamp(x);return x*x*(3-2*x)};
const weight=ch=>/[\u3000-\u9fff\uff00-\uffef]/.test(ch)?1:/\s/.test(ch)?.34:.60;
J.LAYOUTS.bbEditorial={render(env){
 if(env.pass!=='main')return null;
 const {W,H,cut}=env,{mode}=cut.params,lt=env.lt;
 const edits=cut.params.edits||{},dur=Math.max(.01,cut.dur-(edits.effectEnd||0)),et=(lt-(edits.effectStart||0))*(edits.effectSpeed||1);
 const originalDraw=env.draw;
 env.draw=(o)=>originalDraw({...o,x:o.x+(edits.x||0)*W+(edits.align==='left'?-.16*W:edits.align==='right'?.16*W:0),y:(y+(o.y-y)*(edits.lineSpacing||1))+(edits.y||0)*H,size:o.size*(edits.scale||1),rot:(o.rot||0)+(edits.rotation||0),alpha:o.alpha*(edits.opacity??1)*(edits.enterEffect==='fade'?ease(et/.28):1)*(edits.exitEffect==='fade'?ease((dur-et)/.28):1)});
 const weight=ch=>(/[\u3000-\u9fff\uff00-\uffef]/.test(ch)?1:/\s/.test(ch)?.34:.60)+(edits.tracking||0);
 
 const explicitRows=cut.text.includes('\n')?cut.text.split('\n').map(x=>[...x]):null;
 const chars=[...cut.text.replaceAll('\n','')],units=chars.reduce((s,c)=>s+weight(c),0),font=(edits.fontFamily==='serif'?'bb_serif':edits.fontFamily==='sans'?'bb_sans':'bb_ipa')+'_'+(edits.fontWeight||700);
 // Person-facing placements, as in the approved v39 comparison frames.
 const left=[9,15,38,52,53,54,55,56,63,64,65,66,67,70,80].includes(cut.line);
 const right=[7,8,10,11,17,18,19,20,33,34,35,36,39,40,41,48,49,50,51,74].includes(cut.line);
 const side=left||right,cx=left?W*.265:right?W*.735:W*.5;
 const y=cut.line===70?H*.28:H*.48;
 const width=W*(side?.45:.91);
 const rowBreak=(n)=>{ if(explicitRows)return explicitRows;if(/[A-Za-z]/.test(cut.text))return [chars]; if(edits.lineBreak>=1&&edits.lineBreak<n)return [chars.slice(0,edits.lineBreak),chars.slice(edits.lineBreak)];
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
 const fade=clamp((dur-et)/.17);
 const draw=(ch,x,yy,sz,a,color='#fff',rot=0)=>{
  if(!ch.trim()||a<=0)return;
  env.draw({text:ch,font,size:sz,x,y:yy,align:'center',color,rot,alpha:a*fade,
   stroke:0,strokeColor:color,
   shadow:{dx:1.2,dy:1.8,blur:2,color:'rgba(0,0,0,.46)'}});
 };
 // Restored JIZURA split-screen plate. The covered side is chosen per shot.
 const panelSide=edits.panelSide==='off'?null:edits.panelSide||{7:'left',9:'left',11:'right',15:'left',17:'right',19:'right',
  40:'right',42:'left',46:'left',48:'right',50:'right'}[cut.line];
 if(panelSide){
  const arrive=ease((et-(edits.panelStart||0))/(edits.panelEnterSpeed??.12)),leave=ease((et-(dur-.20-(edits.panelEnd||0)))/.20),pw=W*(edits.panelWidth??.49);
  const x0=(panelSide==='left' ? -pw*(1-arrive)-pw*leave : W-pw+pw*(1-arrive)+pw*leave)+(edits.panelPosition||0)*W+(edits.panelMotion||0)*W*(et/dur-.5);
  const tilt=Math.tan((edits.panelAngleDeg||0)*Math.PI/180)*H*.5;env.poly([[x0-tilt,0],[x0+pw-tilt,0],[x0+pw+tilt,H],[x0+tilt,H]],'#fff',fade,false);
  const n=chars.length,split=n>8?Math.ceil(n/2):n;
  const groups=n>8?[chars.slice(0,split),chars.slice(split)]:[chars];
  const maxU=Math.max(...groups.map(g=>g.reduce((v,ch)=>v+weight(ch),0)));
  const ps=Math.min(H*(n>8?.195:.265),pw*.83/Math.max(1,maxU));
  const px=x0+pw/2;
  groups.forEach((group,j)=>{
   const gu=group.reduce((v,ch)=>v+weight(ch),0);let tx=px-gu*ps/2;
   const py=H/2+(groups.length>1?(j?1:-1)*ps*.75:0);
   group.forEach((ch,i)=>{const w=weight(ch)*ps,q=ease((et-.02-(j*group.length+i)*.008)/.075);
    draw(ch,tx+w/2,py+(1-q)*H*.035,ps,q,'#111');tx+=w;
   });
  });
  return null;
 }
 if(mode==='fade'){env.draw({text:cut.text,font,size,x:cx,y,align:'center',color:'#fff',alpha:ease(et/.32)*fade});return null;}
 if(mode==='mask'){const q=ease(et/.34),ctx=env.ctx;chars.forEach((ch,i)=>{const cell=weight(ch)*size;ctx.save();ctx.beginPath();ctx.rect(pos[i]-cell*.65,y-size*.7,cell*1.3,size*1.45);ctx.clip();draw(ch,pos[i],y+(1-q)*size*1.15,size,q);ctx.restore()});return null;}
 if(mode==='simple'){env.draw({text:cut.text,font,size,x:cx,y,align:'center',color:'#fff',alpha:fade});return null;}
 if(mode==='band'){
  // Fast diagonal plate; letters, not the background, do the rhythm work.
  const arrival=ease((et-(edits.bandStart||0))/(edits.bandEnterSpeed??.13)),departure=ease((et-(dur-.2-(edits.bandEnd||0)))/(edits.bandExitSpeed??.2));
  const bandWidth=W*(edits.bandWidth??(side?.42:.96));
  const bandLeft=(side?left?W*.012:W*.56:W*.02)+(edits.bandPosition||0)*W;
  const direction=edits.bandDirection==='left'?-1:1;const offset=direction*(-(1-arrival)+departure)*W*(edits.bandMotion??1.15);
  const h=H*(edits.bandHeight??.19),slant=edits.bandAngleDeg==null?H*(edits.bandAngle??.065):Math.tan(edits.bandAngleDeg*Math.PI/180)*bandWidth*.5,by=y+(edits.bandY||0)*H;
  env.poly([[bandLeft+offset,by-h/2+slant],[bandLeft+bandWidth+offset,by-h/2-slant],
            [bandLeft+bandWidth+offset,by+h/2-slant],[bandLeft+offset,by+h/2+slant]],'#fff',fade,false);
  const letterSpan=edits.letterInterval==null?.065:edits.letterInterval*chars.length;
  const bs=Math.min(H*.18,bandWidth/Math.max(1,units));
  let bp=[],bx=(side&&left?W*.225:cx)-units*bs/2;
  chars.forEach(ch=>{const w=weight(ch)*bs;bp.push(bx+w/2);bx+=w});
  chars.forEach((ch,i)=>{
   const q=ease((et-(edits.letterFirst||0)-.005-i*letterSpan/Math.max(1,chars.length))/.065);
   draw(ch,bp[i]+offset*.08,by+(1-q)*H*.018,bs*(.96+.04*q),q,'#111',-5);
  });
  return null;
 }
 if(mode==='key'&&chars.length>1){
  const first=chars[0],rest=chars.slice(1),q=ease(et/.12),out=ease((et-(dur-.21))/.21);
  const k=Math.min(H*(side?.33:.40),side?W*.20:W*.25);
  const at=Math.ceil(rest.length/2),rr=[rest.slice(0,at),rest.slice(at)];
  const restUnits=Math.max(...rr.map(row=>row.reduce((s,c)=>s+weight(c),0)));
  let s=Math.min(H*.145,(width-k*.70)/Math.max(1,restUnits));
  let x=cx-width/2+k*.49;
  draw(first,x-(1-q)*W*.16,y,k,q);
  const rx=x+k*.64;
  if(side){const room=(left?W*.49:W*.97)-rx;s=Math.min(s,room/Math.max(1,restUnits));}
  rr.forEach((row,j)=>{let xx=rx;row.forEach((ch,i)=>{let w=weight(ch)*s,p=ease((et-.015-(i+j*row.length)*.005)/.075);
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
   let x=cx-u*s/2;const q=ease((et-j*.02)/.11),out=ease((et-(dur-.21))/.21);
   line.forEach((ch,i)=>{let w=weight(ch)*s;draw(ch,x+w/2+(1-q)*(j?W*.16:-W*.16)+out*W*.05,y+(j?1:-1)*H*.072,s,q);x+=w;});
  });
  return null;
 }
 if(mode==='huge'&&rows.length===1){
  const q=ease(et/.13),out=ease((et-(dur-.23))/.23);
  const hs=Math.min(H*.30,width/Math.max(1,units)),dx=(1-q)*W*-.18+out*W*.10;
  let x=cx-units*hs/2;
  chars.forEach((ch,i)=>{let w=weight(ch)*hs;draw(ch,x+w/2+dx,y,hs,q);x+=w;});
  return null;
 }
 // Four JIZURA typography actions: assembled letters, tracking, type reveal,
 // and one directional large slide.  None contain a bounce, punch zoom or shake.
 if(mode==='slide'&&rows.length===1){
  const q=ease(et/.13),out=ease((et-(dur-.22))/.22),dx=(1-q)*W*(left?-.16:.16)+out*W*(left?-.12:.12);
  chars.forEach((ch,i)=>draw(ch,pos[i]+dx,y,size,q));
  return null;
 }
 if(mode==='track'&&rows.length===1){
  const q=ease(et/.13),out=ease((et-(dur-.20))/.20);
  chars.forEach((ch,i)=>{
   const spread=(i-(chars.length-1)/2)*size*.46*(1-q);
   draw(ch,pos[i]+spread+out*W*.06,y,size,q);
  });
  const a=ease(et/.09)*(1-out),from=cx-units*size/2,to=cx+units*size/2;
  env.line([[from,y+size*.72],[from+(to-from)*ease(et/.13),y+size*.72]],'#fff',Math.max(1,W*.0018),a,false);
  return null;
 }
 const totalSpan=.065;
 let serial=0;
 rows.forEach((row,j)=>{
  const u=row.reduce((v,c)=>v+weight(c),0),ry=y+(rows.length>1?(j?1:-1)*H*.145:0);
  let x=cx-u*size/2;
  row.forEach(ch=>{
   const w=weight(ch)*size,delay=(edits.letterFirst||0)+serial*(edits.letterInterval??totalSpan/Math.max(1,chars.length)),q=ease((et-delay)/.07);
   const out=ease((et-(dur-.20))/.20);
   const dx=mode==='assemble'?(1-q)*(serial%2?-1:1)*W*.07:mode==='slide'?(1-q)*-W*.15:mode==='track'?(1-q)*(serial-row.length/2)*size*.27:0;
   const motion=(edits.moveAmount??1),dir=edits.letterDirection||'up';const dy=mode==='type'?(1-q)*H*.033*motion*(dir==='down'?-1:dir==='left'||dir==='right'?0:1):0;const sideways=mode==='type'?(1-q)*H*.033*motion*(dir==='left'?1:dir==='right'?-1:0):0;
   draw(ch,x+w/2+dx+sideways+out*W*.055,ry+dy,size,Math.pow(q,edits.fadeAmount??1));x+=w;serial++;
  });
 });
 return null;
}};
