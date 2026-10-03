// Reused from supplied JIZURA MV Studio src/14_studio_media.js (MIT).
(()=>{
function fadeAlpha(clip, t) {
  const dur = Math.max(0.001, clip.end - clip.start);
  const lt = t - clip.start;
  const fi = clip.fadeIn || 0, fo = clip.fadeOut || 0;
  let a = 1;
  if (fi > 0) a *= J.clamp(lt / fi);
  if (fo > 0) a *= J.clamp((dur - lt) / fo);
  return a;
}

function drawBand(ctx, clip, t, W, H) {
  const p = fadeAlpha(clip, t);
  if (p <= 0) return;
  const arrive = J.clamp((t - clip.start - (clip.delay || 0)) / Math.max(0.001, clip.enterSpeed || 0.15));
  const e = arrive * arrive * (3 - 2 * arrive);
  const leave = clip.end - t < (clip.exitSpeed || 0.2)
    ? 1 - J.clamp((clip.end - t) / (clip.exitSpeed || 0.2)) : 0;
  const w = (clip.w != null ? clip.w : 0.42) * W;
  const h = (clip.h != null ? clip.h : 1) * H;
  const ang = (clip.angle || 0) * Math.PI / 180;
  const motion = (clip.motionAmt || 0) * W * (((t - clip.start) / Math.max(0.001, clip.end - clip.start)) - 0.5);
  let x = (clip.x || 0) * W, y = (clip.y || 0) * H;
  const kind = clip.preset || 'left';
  if (kind === 'left') { x += -w * (1 - e) + motion; }
  else if (kind === 'right') { x = W - w + w * (1 - e) + (clip.x || 0) * W + motion; }
  else if (kind === 'top') { y += -h * (1 - e); }
  else if (kind === 'bottom') { y = H - h + h * (1 - e) + (clip.y || 0) * H; }
  else if (kind === 'diag') { x += -w * (1 - e) + motion; }
  x += leave * (kind === 'right' ? w : -w) * 0.4;
  ctx.save();
  ctx.globalAlpha = (clip.opacity != null ? clip.opacity : 1) * p * e;
  ctx.translate(x + w / 2, y + h / 2);
  ctx.rotate(ang);
  ctx.fillStyle = clip.color || '#ffffff';
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.restore();
}


J.editorDrawBand=drawBand;
})();
