/* JIZURA pack: exitB — 39 more exits (退場) + 12 more holds (待機中の動き)
   Exits:  p 0 (rest) → 1 (fully gone).   Holds: amt 0..1 × fx.motion, subtle idle motion.
   Motion principles here are new to the engine: paper physics (peel / crumple / tear / shred / flutter), rigid-body
   mechanics (hinge / domino / roll / bounce / rocket), masks with character (scorch edge / flood line / halftone / stripes /
   clock / eraser lanes), path-following (snake / fan / tornado / vacuum) and signal effects (scan / mosaic / RGB split / rain).
   Everything is relative to it.size / the item box and deterministic (it.seed, cut seed, glyph index, env.step). */
(() => {
'use strict';
const E = J.E;
const P = 'exitB';
const DEG = J.DEG, TAU = J.TAU;
const HIDE = Object.freeze({ hide: true });

/* ============================== helpers ============================== */
const isHex = c => typeof c === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c);
const mixC = (a, b, t) => { t = J.clamp(t); if (t <= 0.002) return a; if (t >= 0.998) return b; return isHex(a) && isHex(b) ? J.mix(a, b, t) : (t < 0.5 ? a : b); };
const colOf = it => (isHex(it.color) ? it.color : '#ffffff');
const motionK = env => J.clamp((env.fx && env.fx.motion != null ? env.fx.motion : 0.7) / 0.7, 0, 1.6);
const isSp = ch => ch === ' ' || ch === '　';
const layOf = it => (it._m || (it._m = J.measure(it))).lay;
const box = it => { it._m = J.measure(it); return J.itemBox(it); };       // fresh (sx/sy/size may have changed)
const cutN = env => Math.max(1, J.glyphCount(String(env.cut && env.cut.text || '')));
const cutBit = (env, k) => (J.h(env.cut && env.cut.seed | 0, k, 1991) & 1) === 1;   // same choice for every item of a cut
const cutR = (env, k) => J.r(env.cut && env.cut.seed | 0, k, 1993);
const isSingle = (env, it) => layOf(it).N === 1 && cutN(env) > 1;         // one glyph per item (mixed / scatter layouts)
const win = (p, o, spread) => J.clamp((p - o * spread) / (1 - spread));
const rot2 = (x, y, r) => { const c = Math.cos(r), s = Math.sin(r); return [x * c - y * s, x * s + y * c]; };
const toD = (it, lx, ly) => { const [x, y] = rot2(lx, ly, (it.rot || 0) * DEG); return [it.x + x, it.y + y]; };
const toL = (it, X, Y) => rot2(X - it.x, Y - it.y, -(it.rot || 0) * DEG);
/* design-space directions expressed in item space (so charFn offsets move along screen axes) */
const downI = it => { const r = (it.rot || 0) * DEG; return [Math.sin(r), Math.cos(r)]; };
const rightI = it => { const r = (it.rot || 0) * DEG; return [Math.cos(r), -Math.sin(r)]; };
const dirI = (it, X, Y) => { const [a, b] = rightI(it), [c, d] = downI(it); return [a * X + c * Y, b * X + d * Y]; };
const fadeEnd = (p, a = 0.85) => 1 - J.smooth(a, 1, p);
const easeInPow = (x, k) => Math.pow(J.clamp(x), k);

/* sequential order 0..1 of glyph i; single-glyph items use their mi within the cut */
function orderOf(env, it) {
  const N = cutN(env), mi = +it.mi || 0;
  return (i, n) => (n > 1 ? i / (n - 1) : N > 1 ? J.clamp(mi / (N - 1)) : 0);
}
/* merge per-glyph functions keeping every field drawItem understands */
function merged(fns) {
  return (i, g, n) => {
    let o = null;
    for (let k = 0; k < fns.length; k++) {
      const r = fns[k](i, g, n);
      if (!r) continue;
      if (r.hide) return HIDE;
      if (!o) o = { dx: 0, dy: 0, rot: 0, s: 1, a: 1 };
      if (r.dx) o.dx += r.dx; if (r.dy) o.dy += r.dy; if (r.rot) o.rot += r.rot;
      if (r.s != null) o.s *= r.s; if (r.a != null) o.a *= r.a;
      if (r.sx != null) o.sx = (o.sx == null ? 1 : o.sx) * r.sx;
      if (r.sy != null) o.sy = (o.sy == null ? 1 : o.sy) * r.sy;
      if (r.skew) o.skew = (o.skew || 0) + r.skew;
      if (r.blur) o.blur = (o.blur || 0) + r.blur;
      if (r.outline) o.outline = true;
      if (r.ch) o.ch = r.ch;
      if (r.color) o.color = r.color;
      if (r.clipX) o.clipX = o.clipX ? [Math.max(o.clipX[0], r.clipX[0]), Math.min(o.clipX[1], r.clipX[1])] : r.clipX;
      if (r.clipY) o.clipY = o.clipY ? [Math.max(o.clipY[0], r.clipY[0]), Math.min(o.clipY[1], r.clipY[1])] : r.clipY;
    }
    if (!o) return null;
    if (o.a <= 0.003 || Math.abs(o.s) < 0.004) return HIDE;
    if (o.sx != null && Math.abs(o.sx) < 0.004) return HIDE;
    if (o.sy != null && Math.abs(o.sy) < 0.004) return HIDE;
    if ((o.clipX && o.clipX[1] <= o.clipX[0]) || (o.clipY && o.clipY[1] <= o.clipY[0])) return HIDE;
    return o;
  };
}
function addC(it, fn) {
  if (!it.charFns) it.charFns = [];
  const prev = it.charFns.splice(0); prev.push(fn);
  it.charFns.push(merged(prev));
}
function chainPost(it, fn) { const p0 = it.post; it.post = (env, it2, bb) => { if (p0) p0(env, it2, bb); fn(env, it2, bb); }; }
function chainPre(it, fn) { const p0 = it.pre; it.pre = (env, it2) => { if (p0) p0(env, it2); fn(env, it2); }; }
/* main draw uses mainFn; each copyFn draws an extra copy of the item (after the main one) */
function withCopies(it, mainFn, copyFns, extra) {
  if (!it.charFns) it.charFns = [];
  const prev = it.charFns.slice();
  const cfs = copyFns.map(f => merged(prev.concat([f])));
  addC(it, mainFn);
  chainPost(it, (env, it2) => {
    for (let k = 0; k < cfs.length; k++) {
      const ex = typeof extra === 'function' ? extra(k, env) : extra;
      const c = Object.assign({}, it2, { charFn: cfs[k], pieceFn: null, pre: null, post: null, streak: null, echo: null }, ex || null);
      J.drawItem(env, c);
    }
  });
}
/* a plain copy of a (post-hook) item that J.drawFx can draw with its own clip / bands / transform */
const COPY_RESET = { pre: null, post: null, streak: null, echo: null, wipeBar: null, cursorAt: -1, clip: null, clipY: null, clipFn: null, bands: null, vbands: null, pieceFn: null };
const copyOf = (it2, over) => Object.assign({}, it2, COPY_RESET, over || null);
/* draw in the item's own (rotated) space */
function inItem(env, it, fn) {
  const ctx = env.ctx; ctx.save(); ctx.translate(it.x, it.y); if (it.rot) ctx.rotate(it.rot * DEG);
  try { fn(ctx); } finally { ctx.restore(); }
}
/* per-line (per-column when vertical) extents in item space */
function lineExt(it) {
  const lay = J.layoutText(it), sx = it.sx || 1, sy = it.sy || 1, out = [];
  for (const g of lay) {
    if (isSp(g.ch)) continue;
    const L = out[g.li] || (out[g.li] = { li: g.li, x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9 });
    const hw = (it.vertical ? it.size : g.w) / 2, hh = (it.vertical ? g.h : it.size) / 2;
    L.x0 = Math.min(L.x0, (g.x - hw) * sx); L.x1 = Math.max(L.x1, (g.x + hw) * sx);
    L.y0 = Math.min(L.y0, (g.y - hh) * sy); L.y1 = Math.max(L.y1, (g.y + hh) * sy);
  }
  return out.filter(Boolean);
}
/* item box in item space (relative to it.x/it.y, unrotated) */
function lBox(it, pad = 0) {
  const b = box(it);
  return { x0: b.x0 - it.x - pad, y0: b.y0 - it.y - pad, x1: b.x1 - it.x + pad, y1: b.y1 - it.y + pad, cx: b.cx - it.x, cy: b.cy - it.y, w: b.w + pad * 2, h: b.h + pad * 2 };
}
/* rotated item box → design-space AABB (+pad) */
function dBox(it, pad = 0) {
  const b = box(it);
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [px, py] of [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]]) {
    const [X, Y] = toD(it, px - it.x, py - it.y);
    x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y);
  }
  const sk = Math.abs(Math.tan((it.skew || 0) * DEG)) * b.h * 0.5;
  return { x0: x0 - pad - sk, y0: y0 - pad, x1: x1 + pad + sk, y1: y1 + pad, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, w: x1 - x0 + 2 * pad + 2 * sk, h: y1 - y0 + 2 * pad };
}
function scaleAbout(it, kx, ky, ax, ay) {
  if (ax == null) { const b = box(it); ax = b.cx - it.x; ay = b.cy - it.y; }
  const [dx, dy] = rot2(ax * (1 - kx), ay * (1 - ky), (it.rot || 0) * DEG);
  it.x += dx; it.y += dy; it.sx = (it.sx || 1) * kx; it.sy = (it.sy || 1) * ky; it._m = null;
}
function sizeAbout(it, k) {
  const b = box(it), ax = b.cx - it.x, ay = b.cy - it.y;
  const [dx, dy] = rot2(ax * (1 - k), ay * (1 - k), (it.rot || 0) * DEG);
  it.x += dx; it.y += dy; it.size *= k; it._m = null;
}
/* rotate an item-like {x, y, rot} about a point given in its own item space */
function rotateAbout(it, deg, ax, ay) {
  const r0 = (it.rot || 0) * DEG, r1 = r0 + deg * DEG;
  const [x0, y0] = rot2(ax, ay, r0), [x1, y1] = rot2(ax, ay, r1);
  it.x += x0 - x1; it.y += y0 - y1; it.rot = (it.rot || 0) + deg;
}
/* item-space intervals → per-glyph clip fractions. gx, gy = the glyph's drawn centre (item space, incl. dx/dy),
   kx, ky = extra glyph scale of the same charFn (s·sx, s·sy). xr / yr = [lo, hi] in item space or null. */
function gclip(g, it, gx, gy, kx, ky, xr, yr) {
  const sx = (it.sx || 1) * kx, sy = (it.sy || 1) * ky, o = {};
  if (!g.r90) {
    if (xr) o.clipX = [(xr[0] - gx) / (g.w * sx), (xr[1] - gx) / (g.w * sx)];
    if (yr) o.clipY = [(yr[0] - gy) / (g.h * sy), (yr[1] - gy) / (g.h * sy)];
  } else {        // glyph drawn rotated 90°: local x runs along item +y, local y along item −x
    if (yr) o.clipX = [(yr[0] - gy) / (sx * g.w), (yr[1] - gy) / (sx * g.w)];
    if (xr) o.clipY = [-(xr[1] - gx) / (sy * g.h), -(xr[0] - gx) / (sy * g.h)];
  }
  return o;
}
const gCX = (g, it) => (g.x + g.vx) * (it.sx || 1);       // glyph centre in item space (at rest)
const gCY = (g, it) => (g.y + g.vy) * (it.sy || 1);
/* half-plane {u > s} (sign +1) or {u < s} (sign −1) along unit direction (dx, dy), as a big quad path */
function halfPlane(ctx, dx, dy, s, sign, L = 1e5) {
  const tx = -dy, ty = dx, a = sign > 0 ? s : s - L, b = sign > 0 ? s + L : s;
  ctx.moveTo(dx * a + tx * L, dy * a + ty * L); ctx.lineTo(dx * b + tx * L, dy * b + ty * L);
  ctx.lineTo(dx * b - tx * L, dy * b - ty * L); ctx.lineTo(dx * a - tx * L, dy * a - ty * L); ctx.closePath();
}
/* polygon given in item-local coords, drawn through the item's current transform */
function polyL(ctx, it, pts) {
  for (let k = 0; k < pts.length; k++) { const [X, Y] = toD(it, pts[k][0], pts[k][1]); k ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y); }
  ctx.closePath();
}
/* does any glyph currently get a per-glyph blur (e.g. a focus treatment)? shadows on top of a glyph filter are very costly */
function glyphBlur(it) {
  if (!it.charFns || !it.charFns.length) return false;
  const lay = layOf(it);
  for (const g of lay) for (const f of it.charFns) { const r = f(g.i, g, lay.N); if (r && r.blur > 0.4) return true; }
  return false;
}
/* scale every per-glyph blur of the item by k (folds the earlier fns into one) */
function scaleGlyphBlur(it, k) {
  if (!it.charFns || !it.charFns.length) return;
  const m = merged(it.charFns.splice(0));
  it.charFns.push((i, g, n) => { const r = m(i, g, n); return r && r.blur ? Object.assign({}, r, { blur: r.blur * k }) : r; });
}
const beatLen = (env, fb) => (env.beat && env.beat.len ? env.beat.len : fb);
const beatSince = (env, fb) => (env.beat ? env.beat.since : ((env.ltb % fb) + fb) % fb);
const beatIdx = (env, fb) => (env.beat ? env.beat.index : Math.floor(env.ltb / fb));
const darkBg = env => J.lum(env.sc.bg) < 0.5;
const primary = it => (it.alpha ?? 1) > 0.9 && it.fill !== false;      // decorations only once per cut, not on faded / outline copies


/* ============================== EXITS ============================== */
const X = {};

/* ---------------- paper ---------------- */

/* sticker peel: a fold line crosses the text diagonally; the peeled part is drawn mirrored (the back of the sticker) */
X.peelOff = {
  name: 'ステッカー剥がし', tags: ['pop', 'graphic'], w: 1, ae: 'wipe',
  outDur: dur => J.clamp(dur * 0.36, 0.3, 0.7),
  apply(env, it, p) {
    const q = isSingle(env, it) ? win(p, orderOf(env, it)(0, 1), 0.4) : p;
    if (q <= 0) return;
    const v = (J.h(env.cut.seed | 0, 311) >>> 5) & 3;
    const dx = [0.83, -0.83, 0.83, -0.83][v], dy = [0.56, 0.56, -0.56, -0.56][v];
    const sz = it.size, bb = dBox(it, sz * 0.06);
    const us = [[bb.x0, bb.y0], [bb.x1, bb.y0], [bb.x0, bb.y1], [bb.x1, bb.y1]].map(c => c[0] * dx + c[1] * dy);
    const u0 = Math.min(...us), u1 = Math.max(...us);
    const PE = 0.74, f = J.clamp(q / PE), fly = J.clamp((q - PE) / (1 - PE));
    const s = J.lerp(u0, u1, 0.1 * f + 0.9 * f * f * (3 - 2 * f));
    const a0 = it.alpha ?? 1, c0 = colOf(it), bg = env.sc.bg;
    const back = mixC(mixC(c0, bg, 0.5), env.sc.accent, 0.18);
    if (f < 1) it.clipFn = (ctx) => halfPlane(ctx, dx, dy, s, 1);
    else it.alpha = 0;
    chainPost(it, (env2, it2) => {
      const ctx = env2.ctx;
      const fa = a0 * (1 - E.inQuad(fly));
      if (fa <= 0.01) return;
      const lift = sz * (0.05 + 0.1 * f);
      const flap = copyOf(it2, {
        alpha: fa, color: back, gradient: null, pattern: null, extrude: null, blur: 0, ghost: false,
        shadow: env2.pass === 'main' ? { color: J.rgba('#000000', darkBg(env2) ? 0.5 : 0.28), blur: sz * 0.12, dx: dx * lift, dy: dy * lift + lift } : null,
      });
      ctx.save();
      if (fly <= 0) { ctx.beginPath(); halfPlane(ctx, dx, dy, s, 1); ctx.clip(); }
      else { const m = sz * 2.2 * fly * fly; ctx.translate(dx * m, dy * m - sz * 1.2 * fly); }
      ctx.transform(1 - 2 * dx * dx, -2 * dx * dy, -2 * dx * dy, 1 - 2 * dy * dy, 2 * s * dx, 2 * s * dy);
      J.drawItem(env2, flap);
      ctx.restore();
    });
  },
};

/* crumple into a ball in three quick squeezes, then toss it away */
X.crumpleOut = {
  name: '丸めて捨てる', tags: ['pop', 'emotional'], w: 0.9, ae: 'shrink', minDur: 0.8,
  outDur: dur => J.clamp(dur * 0.42, 0.36, 0.85),
  apply(env, it, p) {
    const seed = it.seed | 0, W = env.W, H = env.H, bg = env.sc.bg, c0 = colOf(it);
    const g1 = E.outBack(J.clamp(p / 0.15), 1.6), g2 = E.outBack(J.clamp((p - 0.17) / 0.15), 1.6), g3 = E.outBack(J.clamp((p - 0.34) / 0.15), 1.6);
    const cr = J.clamp(0.45 * g1 + 0.3 * g2 + 0.25 * g3, 0, 1.08);
    const k = 1 - 0.93 * Math.min(1, cr);
    const v = J.clamp((p - 0.5) / 0.5);
    const dir = cutBit(env, 21) ? 1 : -1;
    const spin = dir * (cr * 25 + 620 * v * v);
    const tx = dir * W * 0.42 * v, ty = -H * 0.8 * v + H * 1.75 * v * v;
    const alpha = fadeEnd(p, 0.88);
    if (isSingle(env, it)) {
      const mi = +it.mi || 0, jx = J.rs(env.cut.seed | 0, mi, 23) * it.size * 0.25, jy = J.rs(env.cut.seed | 0, mi, 24) * it.size * 0.25;
      const [nx, ny] = rot2((it.x - W / 2) * k + jx * cr, (it.y - H / 2) * k + jy * cr, spin * DEG);
      it.x = W / 2 + nx + tx; it.y = H / 2 + ny + ty;
      it.rot = (it.rot || 0) + spin + J.rs(seed, 22) * 150 * cr;
      it.size *= 1 - 0.5 * Math.min(1, cr); it._m = null;
      it.skew = (it.skew || 0) + J.rs(seed, 25) * 22 * cr;
      it.alpha = (it.alpha ?? 1) * alpha;
      return;
    }
    const b = lBox(it), ox = b.cx, oy = b.cy, sz = it.size;
    const [tix, tiy] = dirI(it, tx, ty);
    addC(it, (i, g) => {
      const px = gCX(g, it) - ox, py = gCY(g, it) - oy;
      const jx = J.rs(seed, i, 26) * sz * 0.22, jy = J.rs(seed, i, 27) * sz * 0.22;
      const [nx, ny] = rot2(px * k + jx * cr, py * k + jy * cr, spin * DEG);
      const r1 = J.r(seed, i, 28), r2 = J.r(seed, i, 29);
      return {
        dx: nx - px + tix, dy: ny - py + tiy, rot: spin + J.rs(seed, i, 30) * 170 * cr, s: 1 - 0.55 * Math.min(1, cr),
        sx: 1 - 0.35 * r1 * cr, sy: 1 - 0.35 * r2 * cr, skew: J.rs(seed, i, 31) * 26 * cr,
        color: r1 < 0.45 ? mixC(c0, bg, 0.3 * Math.min(1, cr)) : undefined, a: alpha,
      };
    });
  },
};

/* torn in two along a jagged line; the halves rotate apart and fall away */
X.tearOut = {
  name: '破り捨て', tags: ['emotional', 'graphic'], w: 0.9, ae: 'slice',
  outDur: dur => J.clamp(dur * 0.38, 0.3, 0.75),
  apply(env, it, p) {
    const vert = !!it.vertical, seed = it.seed | 0, sz = it.size;
    let polyA, polyB, piv;
    if (isSingle(env, it) && !vert) {                        // one glyph per item: a single tear through the screen centre
      const cs = env.cut.seed | 0, bb = dBox(it, sz * 0.3), W = env.W;
      const K = J.clamp(Math.ceil((bb.y1 - bb.y0) / (sz * 0.08)), 4, 40), jD = [];
      for (let k = 0; k <= K; k++) {
        const Y = J.lerp(bb.y0, bb.y1, k / K);
        jD.push([W / 2 + J.noise1(Y / (env.H * 0.035), cs + 5) * env.H * 0.02 + J.rs(cs, Math.round(Y / (env.H * 0.008)), 331) * env.H * 0.006, Y]);
      }
      const L = pts => pts.map(([X2, Y2]) => toL(it, X2, Y2));
      polyA = L([[-W, bb.y0], ...jD, [-W, bb.y1]]); polyB = L([[2 * W, bb.y0], ...jD, [2 * W, bb.y1]]);
      piv = toL(it, W / 2, env.H * 0.62);
    } else {
      const b = lBox(it, sz * 0.3);
      const mid = vert ? b.cy : b.cx, a0 = vert ? b.x0 : b.y0, a1 = vert ? b.x1 : b.y1;
      const K = J.clamp(Math.ceil((a1 - a0) / (sz * 0.08)), 6, 48), jag = [];
      for (let k = 0; k <= K; k++) {
        const t = J.lerp(a0, a1, k / K);
        const off = J.rs(seed, k, 331) * sz * 0.05 + J.noise1(k * 0.35, seed + 5) * sz * 0.16;
        jag.push(vert ? [t, mid + off] : [mid + off, t]);
      }
      // half A = left (top when vertical), half B = right (bottom)
      polyA = vert ? [[b.x0, b.y0 - sz], ...jag, [b.x1, b.y0 - sz]] : [[b.x0 - sz, b.y0], ...jag, [b.x0 - sz, b.y1]];
      polyB = vert ? [[b.x0, b.y1 + sz], ...jag, [b.x1, b.y1 + sz]] : [[b.x1 + sz, b.y0], ...jag, [b.x1 + sz, b.y1]];
      piv = jag[jag.length - 1];                             // the tear starts at the far end and opens from the near one
    }
    const o = E.outCubic(J.clamp(p / 0.32)), v = J.clamp((p - 0.26) / 0.74);
    const th = 7 * o + 40 * v * v;
    const fall = env.H * 1.1 * v * v, side = sz * 1.6 * v;
    const place = (h, sgn) => {
      rotateAbout(h, (vert ? -sgn : sgn) * th, piv[0], piv[1]);
      if (vert) { h.x += sgn * side * 0.35 - side * 0.4; h.y += fall + sgn * sz * 0.3 * v; }
      else { h.x += sgn * side; h.y += fall * (sgn < 0 ? 1 : 0.85); }
    };
    const A = { x: it.x, y: it.y, rot: it.rot || 0 }, B = { x: it.x, y: it.y, rot: it.rot || 0 };
    place(A, -1); place(B, 1);
    const alpha = (it.alpha ?? 1) * fadeEnd(p, 0.82);
    it.x = A.x; it.y = A.y; it.rot = A.rot; it.alpha = alpha;
    it.clipFn = (ctx, e2, it3) => polyL(ctx, it3, polyA);
    chainPost(it, (env2, it2) => {
      J.drawFx(env2, copyOf(it2, { x: B.x, y: B.y, rot: B.rot, clipFn: (ctx, e3, it3) => polyL(ctx, it3, polyB) }));
    });
  },
};

/* a burning front with a rough, flickering edge eats across the text: heated band, glowing rim, soot, embers */
X.scorchOut = {
  name: '焦げて消える', tags: ['emotional', 'glitch'], w: 0.8, ae: 'wipe',
  outDur: dur => J.clamp(dur * 0.4, 0.32, 0.8),
  apply(env, it, p) {
    const single = isSingle(env, it), q = p;          // single-glyph items share one screen-wide front
    const vert = !!it.vertical, sz = it.size, t = env.ltb, acc = env.sc.accent, c0 = colOf(it), bg = env.sc.bg;
    const seed = single ? env.cut.seed | 0 : it.seed | 0, U = single ? Math.min(env.W, env.H) * 0.16 : sz;
    const bb = dBox(it, sz * 0.2);
    let d = vert ? [0.22, 1] : [1, 0.22];
    const dl = Math.hypot(d[0], d[1]); d = [d[0] / dl, d[1] / dl];
    if (cutBit(env, 31)) d = [-d[0], -d[1]];
    const tn = [-d[1], d[0]];
    const cs = [[bb.x0, bb.y0], [bb.x1, bb.y0], [bb.x0, bb.y1], [bb.x1, bb.y1]];
    const us = cs.map(c => c[0] * d[0] + c[1] * d[1]), ws = cs.map(c => c[0] * tn[0] + c[1] * tn[1]);
    const w0 = Math.min(...ws), w1 = Math.max(...ws);
    const ux = single ? [[0, 0], [env.W, 0], [0, env.H], [env.W, env.H]].map(c => c[0] * d[0] + c[1] * d[1]) : us;
    const u0 = Math.min(...ux), u1 = Math.max(...ux);
    const rough = U * 0.2, band = U * 0.4;
    const S = x => J.lerp(u0 - rough * 1.3, u1 + rough * 1.3 + band, E.inOutSine(x));
    const s = S(q);
    const K = J.clamp(Math.ceil((w1 - w0) / (U * 0.07)), 6, 60);
    const pt = (u, w) => [d[0] * u + tn[0] * w, d[1] * u + tn[1] * w];
    const edgeU = w => s + rough * (0.75 * J.noise1(w / U * 2.4, seed) + 0.3 * J.noise1(w / U * 8 + t * 6, seed + 3));
    const edge = [];
    for (let k = 0; k <= K; k++) { const w = J.lerp(w0, w1, k / K); edge.push([edgeU(w), w]); }
    const uMax = Math.max(...us);
    if (edge.every(e => e[0] > uMax + rough)) { it.alpha = 0; return; }
    const far = Math.max(u1, uMax) + U * 4;
    const path = (ctx, off0, off1) => {           // region between edge+off0 and edge+off1 (off1 = null → to far side)
      edge.forEach(([u, w], k) => { const P2 = pt(u + off0, w); k ? ctx.lineTo(P2[0], P2[1]) : ctx.moveTo(P2[0], P2[1]); });
      if (off1 == null) { const A2 = pt(far, w1), B2 = pt(far, w0); ctx.lineTo(A2[0], A2[1]); ctx.lineTo(B2[0], B2[1]); }
      else for (let k = edge.length - 1; k >= 0; k--) { const P2 = pt(edge[k][0] + off1, edge[k][1]); ctx.lineTo(P2[0], P2[1]); }
      ctx.closePath();
    };
    it.clipFn = ctx => path(ctx, 0, null);
    const heat = mixC(c0, acc, 0.85), soot = darkBg(env) ? mixC(bg, acc, 0.25) : mixC(bg, '#000000', 0.45);
    const lw = Math.max(1.5, U * 0.03), a0 = it.alpha ?? 1, rimA = a0 * (1 - J.smooth(0.86, 1, q));
    chainPost(it, (env2, it2) => {
      J.drawFx(env2, copyOf(it2, { color: heat, gradient: null, pattern: null, alpha: a0 * 0.9, clipFn: ctx => path(ctx, 0, band) }));
      if (env2.pass !== 'main') return;
      const ep = edge.map(([u, w]) => pt(u, w)), sp = edge.map(([u, w]) => pt(u - lw * 1.6, w));
      env2.line(sp, soot, lw * 2.2, 0.8 * rimA, false);
      env2.line(ep, acc, lw * 4, 0.22 * rimA, false);
      env2.line(ep, acc, lw, rimA, false);
      for (let j = 0; j < (single ? 6 : 22); j++) {                // embers: spawned at the edge, drifting back and up
        const t0 = J.r(seed, j, 341) * 0.85, age = (q - t0) / 0.28;
        if (age <= 0 || age >= 1) continue;
        const w = J.lerp(w0, w1, J.r(seed, j, 342));
        const [X0, Y0] = pt(edgeU(w) - (s - S(t0)) - U * 0.05, w);
        const X1 = X0 - d[0] * U * 0.3 * age + Math.sin(age * 7 + j) * U * 0.06, Y1 = Y0 - d[1] * U * 0.3 * age - U * 0.9 * age;
        env2.circle(X1, Y1, Math.max(0.8, U * 0.028 * (1 - age)), acc, null, 0, a0 * (1 - age), false);
      }
    });
  },
};

/* ---------------- light ---------------- */

/* overexposure: the text blows out to white (bleaches to the paper on light schemes) with a bloom and a lens streak */
X.overexposeOut = {
  name: '白飛び', tags: ['emotional', 'calm', 'pop'], w: 1, ae: 'blur',
  apply(env, it, p) {
    const dark = darkBg(env), c0 = colOf(it), sz = it.size, acc = env.sc.accent;
    const hot = dark ? '#ffffff' : env.sc.bg;
    const glow = dark ? mixC(acc, '#ffffff', 0.45) : acc;
    const a = E.inQuad(J.clamp(p / 0.5)), e = E.outCubic(J.clamp(p / 0.7));
    it.color = mixC(c0, hot, a);
    if (it.gradient) it.gradient = null;
    if (it.pattern) it.pattern = null;
    scaleGlyphBlur(it, 1 - J.smooth(0, 0.12, p));             // focus blur gives way to the bloom (a glyph filter under a shadow is very costly)
    if (p > 0.08) {                                             // the blow-out swallows depth effects (and keeps the bloom cheap);
      it.extrude = null; chainPre(it, (e2, i2) => { i2.extrude = null; });   // treatments may re-apply theirs in a pre hook
    }
    sizeAbout(it, 1 + 0.07 * e);
    it.track = (it.track || 0) + 0.06 * e;
    const fade = 1 - E.inOutSine(J.clamp((p - 0.38) / 0.62));
    if (env.pass === 'main') it.shadow = { color: J.rgba(glow, 0.95), blur: sz * (0.05 + 0.4 * e), dx: 0, dy: 0 };
    it.alpha = (it.alpha ?? 1) * fade;
    if (env.pass === 'main' && e > 0.02 && p > 0.12) {    // second, wider bloom underneath
      const ga = it.alpha;
      chainPre(it, (env2, it2) => J.drawItem(env2, copyOf(it2, { color: glow, gradient: null, pattern: null, extrude: null, stroke: 0, alpha: ga * 0.8, blur: 0, charFn: it2.charFn, shadow: { color: J.rgba(glow, 1), blur: sz * 0.9 * e, dx: 0, dy: 0 } })));
    }
    const st = Math.sin(Math.PI * J.clamp((p - 0.12) / 0.88));
    if (st > 0.02 && primary(it) && (!isSingle(env, it) || Math.round(+it.mi || 0) === 0)) {
      chainPost(it, (env2, it2, bb) => {
        const B = isSingle(env2, it2) ? { cx: env2.W / 2, cy: it2.y } : dBox(it2, 0);
        const w = (isSingle(env2, it2) ? env2.W * 0.5 : B.w) * (0.8 + 0.9 * e), cy = B.cy, cx = B.cx;
        env2.rect(cx - w / 2, cy - sz * 0.09, w, sz * 0.18, glow, 0.14 * st, false);
        env2.rect(cx - w * 0.75, cy - sz * 0.03, w * 1.5, sz * 0.06, glow, 0.35 * st, false);
        env2.rect(cx - w * 0.9, cy - sz * 0.009, w * 1.8, sz * 0.018, glow, 0.95 * st, false);
      });
    }
  },
};

/* ---------------- signal ---------------- */

/* a bright scan line runs down; behind it the raster breaks into interlaced lines that shear sideways and thin out */
X.scanOut = {
  name: '走査線消去', tags: ['glitch', 'graphic'], w: 0.9, ae: 'slice',
  apply(env, it, p) {
    const sz = it.size, seed = it.seed | 0, bb = dBox(it, sz * 0.3), h = bb.y1 - bb.y0;
    let pitch = Math.max(2.5, sz * 0.065); if (h / pitch > 64) pitch = h / 64;
    const n = Math.ceil(h / pitch), ph = h / n, single = isSingle(env, it);
    const L = single ? env.H * 0.14 : Math.max(sz * 0.9, h * 0.3);
    const ys = single ? J.lerp(env.H * 0.2, env.H * 0.8 + L, p) : J.lerp(bb.y0 - sz * 0.02, bb.y1 + L, p);   // singles: one screen-wide scan
    const rects = []; let lastScan = -1;
    for (let j = 0; j < n; j++) {
      const y0 = bb.y0 + j * ph, yc = y0 + ph / 2, a = J.clamp((ys - yc) / L);
      if (a <= 0) break;
      lastScan = j;
      const keep = (j & 1) ? 1 - J.clamp(a / 0.4) : 1 - E.inQuad(a);
      const hh = ph * keep * 0.8;
      if (hh > 0.08) rects.push([yc - hh / 2, hh]);
    }
    const yU = bb.y0 + (lastScan + 1) * ph;      // unscanned region starts here
    if (!rects.length && yU >= bb.y1 - 0.5) { it.alpha = 0; return; }
    it.clipFn = (ctx) => {
      for (const [y, hh] of rects) ctx.rect(bb.x0 - sz * 3, y, bb.w + sz * 6, hh);
      if (yU < bb.y1) ctx.rect(bb.x0 - sz * 3, yU, bb.w + sz * 6, bb.y1 - yU + 1);
    };
    const G = 7, gh = (yU - bb.y0) / G, bands = [];
    if (yU > bb.y0 + 0.5 && env.pass === 'main') {
      for (let k = 0; k < G; k++) {
        const y0 = bb.y0 + k * gh, a = J.clamp((ys - (y0 + gh / 2)) / L);
        bands.push([y0, y0 + gh + 0.3, (k & 1 ? -1 : 1) * sz * (0.04 + 1.1 * a * a) * (0.5 + 0.5 * J.r(seed, k, 351))]);
      }
    }
    if (bands.length) { bands.push([yU, bb.y1, 0]); it.bands = bands; }
    if (ys < bb.y1 + sz * 0.1 && ys > bb.y0 - sz * 0.1) {
      const acc = env.sc.accent, lw = Math.max(1.5, sz * 0.025), a0 = (it.alpha ?? 1) * (1 - J.smooth(0.8, 1, p));
      chainPost(it, (env2) => {
        env2.rect(bb.x0 - sz * 0.2, ys - lw * 3, bb.w + sz * 0.4, lw * 6, acc, 0.18 * a0, false);
        env2.rect(bb.x0 - sz * 0.2, ys - lw / 2, bb.w + sz * 0.4, lw, acc, a0, false);
      });
    }
  },
};

/* ---------------- graphic masks ---------------- */

/* slanted stripes, each wiped along its own length, alternating direction and staggered across the text */
X.stripesOut = {
  name: 'ストライプ消去', tags: ['graphic', 'pop'], w: 0.9, ae: 'wipe',
  apply(env, it, p) {
    const sz = it.size, bb = dBox(it, sz * 0.12), acc = env.sc.accent;
    const ang = (cutBit(env, 41) ? 64 : 116) * DEG;
    const Ld = [Math.cos(ang), Math.sin(ang)], Ad = [-Ld[1], Ld[0]];
    const cs = [[bb.x0, bb.y0], [bb.x1, bb.y0], [bb.x0, bb.y1], [bb.x1, bb.y1]];
    const as = cs.map(c => c[0] * Ad[0] + c[1] * Ad[1]), ls = cs.map(c => c[0] * Ld[0] + c[1] * Ld[1]);
    const a0 = Math.min(...as), a1 = Math.max(...as), l0 = Math.min(...ls), l1 = Math.max(...ls);
    let n = Math.max(2, Math.ceil((a1 - a0) / Math.max(6, sz * 0.38))); if (n > 48) n = 48;
    const sw = (a1 - a0) / n, rem = [], caps = [];
    const rev = cutBit(env, 42);
    for (let k = 0; k < n; k++) {
      const o = (n > 1 ? k / (n - 1) : 0), st = (rev ? 1 - o : o) * 0.42;
      const q = E.inOutCubic(J.clamp((p - st) / 0.58));
      if (q >= 1) continue;
      const fromStart = (k & 1) === 1;
      const la = fromStart ? J.lerp(l0, l1, q) : l0, lb = fromStart ? l1 : J.lerp(l1, l0, q);
      rem.push([a0 + k * sw, a0 + (k + 1) * sw + 0.6, la, lb]);
      if (q > 0) caps.push([a0 + k * sw, a0 + (k + 1) * sw, fromStart ? la : lb, fromStart ? 1 : -1, 1 - J.smooth(0.8, 1, q)]);
    }
    if (!rem.length) { it.alpha = 0; return; }
    const pt = (a, l) => [Ad[0] * a + Ld[0] * l, Ad[1] * a + Ld[1] * l];
    it.clipFn = (ctx) => {
      for (const [aa, ab, la, lb] of rem) {
        const A2 = pt(aa, la), B2 = pt(ab, la), C2 = pt(ab, lb), D2 = pt(aa, lb);
        ctx.moveTo(A2[0], A2[1]); ctx.lineTo(B2[0], B2[1]); ctx.lineTo(C2[0], C2[1]); ctx.lineTo(D2[0], D2[1]); ctx.closePath();
      }
    };
    const th = Math.max(2, sz * 0.045), al = (it.alpha ?? 1);
    const tb = dBox(it, sz * 0.02);
    if (caps.length) chainPost(it, (env2) => {
      if (env2.pass !== 'main') return;
      const ctx = env2.ctx; ctx.save(); ctx.beginPath(); ctx.rect(tb.x0, tb.y0, tb.w, tb.h); ctx.clip();      // ticks only where the text is
      for (const [aa, ab, l, sg, ca] of caps) env2.poly([pt(aa + 0.5, l - sg * th), pt(ab - 0.5, l - sg * th), pt(ab - 0.5, l), pt(aa + 0.5, l)], acc, al * ca, false);
      ctx.restore();
    });
  },
};

/* the fill breaks into a halftone screen whose dots shrink away in a sweep */
X.halftoneOut = {
  name: '網点に消える', tags: ['graphic', 'calm'], w: 0.9, ae: 'shrink',
  apply(env, it, p) {
    const sz = it.size, bb = dBox(it, sz * 0.1), w = bb.x1 - bb.x0, h = bb.y1 - bb.y0, vert = !!it.vertical;
    let c = Math.max(3, sz * 0.15);
    while ((w / c + 2) * (h / (c * 0.866) + 2) > 220) c *= 1.1;
    const rows = Math.ceil(h / (c * 0.866)) + 1, cols = Math.ceil(w / c) + 2, R0 = c * 0.64;
    const rev = cutBit(env, 51), dots = [];
    for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
      const cx = bb.x0 + (q + (r & 1) * 0.5 - 0.5) * c, cy = bb.y0 + r * c * 0.866;
      let pos = vert ? (cy - bb.y0) / h * 0.8 + (cx - bb.x0) / w * 0.2 : (cx - bb.x0) / w * 0.8 + (cy - bb.y0) / h * 0.2;
      if (rev) pos = 1 - pos;
      const k = J.clamp(p * 1.55 - pos * 0.55);
      const rr = R0 * (1 - E.inOutSine(k));
      if (rr > 0.3) dots.push(cx, cy, rr);
    }
    if (!dots.length) { it.alpha = 0; return; }
    it.clipFn = (ctx) => { for (let j = 0; j < dots.length; j += 3) { ctx.moveTo(dots[j] + dots[j + 2], dots[j + 1]); ctx.arc(dots[j], dots[j + 1], dots[j + 2], 0, TAU); } };
    it.color = mixC(colOf(it), env.sc.accent, 0.4 * J.smooth(0.05, 0.5, p));
  },
};

/* blackboard eraser: a felt block zig-zags lane by lane, leaving a faint chalky smear that fades */
X.eraserOut = {
  name: '黒板消し', tags: ['editorial', 'calm'], w: 0.9, ae: 'wipe', minDur: 0.9,
  outDur: dur => J.clamp(dur * 0.42, 0.36, 0.85),
  apply(env, it, p) {
    const sz = it.size, vert = !!it.vertical, single = isSingle(env, it), W = env.W, H = env.H;
    const bb = single ? { x0: W * 0.03, x1: W * 0.97, y0: H * 0.3, y1: H * 0.7 } : dBox(it, sz * 0.12);
    bb.w = bb.x1 - bb.x0; bb.h = bb.y1 - bb.y0;
    const U = single ? H * 0.13 : sz;
    const span = vert ? bb.w : bb.h, len = vert ? bb.h : bb.w;
    const K = single ? 3 : J.clamp(Math.round(span / (U * 0.7)), 2, 10), lh = span / K, ew = U * 0.8;
    const leg = len + ew, pos = J.clamp(p / 0.9) * K * leg;
    const lane = Math.min(K - 1, Math.floor(pos / leg)), along = pos - lane * leg - ew / 2;   // eraser centre from the lane start
    const fwd = j => (j & 1) === 0;
    // lane j rectangle as [a0, a1] (across) and the stroke axis [s0, s1]
    const laneR = (j, s0, s1) => {                // s measured from the lane start in stroke direction
      const a0 = vert ? bb.x1 - (j + 1) * lh : bb.y0 + j * lh;
      const L0 = vert ? bb.y0 : bb.x0;
      const t0 = fwd(j) ? L0 + s0 : L0 + len - s1, t1 = fwd(j) ? L0 + s1 : L0 + len - s0;
      return vert ? [a0, t0, lh, t1 - t0] : [t0, a0, t1 - t0, lh];
    };
    const cut = J.clamp(along + ew * 0.3, 0, len);
    const keep = [], gone = [];
    if (along + ew * 0.3 < len + 0.5) keep.push(laneR(lane, cut, len));
    for (let j = lane + 1; j < K; j++) keep.push(laneR(j, 0, len));
    for (let j = 0; j < lane; j++) gone.push(laneR(j, 0, len));
    if (cut > 0) gone.push(laneR(lane, 0, cut));
    if (!keep.length && p > 0.9) it.alpha = 0;
    const pad = (a, e2) => { for (const r of a) e2.rect(r[0], r[1], r[2] + 0.4, r[3] + 0.4); };
    const a0 = it.alpha ?? 1;
    it.clipFn = ctx => pad(keep, ctx);
    const smear = a0 * 0.26 * (1 - J.smooth(0.35, 0.95, p));
    const eA = 1 - J.smooth(0.9, 1, p), acc = env.sc.accent, felt = mixC(acc, env.sc.bg, 0.45);
    const drawEraser = !single || Math.round(+it.mi || 0) === 0;
    chainPost(it, (env2, it2) => {
      if (smear > 0.01 && gone.length && env2.pass === 'main') {       // chalk smear: blurred, dragged along the stroke
        const sm = copyOf(it2, { alpha: smear, blur: Math.min(sz * 0.1, 28), clipFn: ctx => pad(gone, ctx), gradient: null, pattern: null, shadow: null, extrude: null, color: mixC(colOf(it2), env2.sc.bg, 0.25) });
        if (vert) sm.sy = (sm.sy || 1) * 1.12; else sm.sx = (sm.sx || 1) * 1.1;
        J.drawFx(env2, sm);
      }
      if (!drawEraser || eA <= 0.01) return;
      const c = J.clamp(along, -ew / 2, len + ew / 2), r = laneR(lane, c - ew / 2, c + ew / 2);
      const x = r[0] - (vert ? lh * 0.03 : 0), y = r[1] - (vert ? 0 : lh * 0.03), w = r[2] + (vert ? lh * 0.06 : 0), h = r[3] + (vert ? 0 : lh * 0.06);
      env2.rrect(x, y, w, h, Math.min(w, h) * 0.18, acc, eA, false);
      const k = 0.3;                          // felt strip on the trailing side
      if (vert) { const fy = fwd(lane) ? y : y + h * (1 - k); env2.rrect(x, fy, w, h * k, Math.min(w, h) * 0.12, felt, eA, false); }
      else { const fx = fwd(lane) ? x : x + w * (1 - k); env2.rrect(fx, y, w * k, h, Math.min(w, h) * 0.12, felt, eA, false); }
    });
  },
};

/* sucked into a single point beyond the end of the line, nearest glyph first, stretching as it goes */
X.vacuumOut = {
  name: '一点に吸われる', tags: ['pop', 'graphic'], w: 0.9, ae: 'shrink',
  apply(env, it, p) {
    const vert = !!it.vertical, sz = it.size, acc = env.sc.accent, rev = cutBit(env, 61), seed = it.seed | 0;
    const single = isSingle(env, it);
    const dot = (T, fr, drawIt) => {
      if (!drawIt) return;
      const pulse = 1 + 0.25 * Math.sin(p * 40) * (1 - p), R = sz * (0.05 + 0.09 * fr) * pulse * (1 - J.smooth(0.9, 1, p));
      const ring = J.clamp((p - 0.86) / 0.14);
      chainPost(it, (env2) => {
        if (R > 0.3) env2.circle(T[0], T[1], R, acc, null, 0, 1, true);
        if (ring > 0 && ring < 1) env2.circle(T[0], T[1], sz * (0.15 + 0.5 * E.outCubic(ring)), null, acc, Math.max(1, sz * 0.03 * (1 - ring)), 1 - ring, false);
      });
    };
    if (single) {                                   // whole items travel to one screen point
      const T = [rev ? env.W * 0.08 : env.W * 0.92, env.H / 2];
      const d0 = Math.hypot(T[0] - it.x, T[1] - it.y), dm = env.W * 0.85;
      const q = win(p, J.clamp(d0 / dm), 0.6);
      if (q >= 1) it.alpha = 0;
      else if (q > 0) {
        const e = E.inCubic(q), bend = (J.r(env.cut.seed | 0, +it.mi || 0, 62) - 0.5) * d0 * 0.5;
        const nx = -(T[1] - it.y) / Math.max(1, d0), ny = (T[0] - it.x) / Math.max(1, d0);
        const bx = it.x + (T[0] - it.x) * e + nx * bend * Math.sin(Math.PI * e), by = it.y + (T[1] - it.y) * e + ny * bend * Math.sin(Math.PI * e);
        it.x = bx; it.y = by; it.size *= 1 - 0.85 * e; it.sx = (it.sx || 1) * (1 + 1.3 * q * q); it.sy = (it.sy || 1) * (1 - 0.4 * q * q); it._m = null;
      }
      dot(T, J.clamp(p * 1.2), Math.round(+it.mi || 0) === 0);
      return;
    }
    const b = lBox(it), lay = layOf(it);
    const Tl = vert ? [b.cx, rev ? b.y0 - sz * 0.8 : b.y1 + sz * 0.8] : [rev ? b.x0 - sz * 0.8 : b.x1 + sz * 0.8, b.cy];
    let dm = 1;
    for (const g of lay) dm = Math.max(dm, Math.hypot(Tl[0] - gCX(g, it), Tl[1] - gCY(g, it)));
    const alongX = !vert;
    addC(it, (i, g) => {
      const gx = gCX(g, it), gy = gCY(g, it), vx = Tl[0] - gx, vy = Tl[1] - gy, dd = Math.hypot(vx, vy);
      const q = win(p, J.clamp((dd - sz * 0.8) / Math.max(1, dm - sz * 0.8)), 0.5);
      if (q <= 0) return null;
      if (q >= 0.94) return HIDE;
      const e = Math.min(1, E.inQuad(q / 0.94)), bend = J.rs(seed, i, 63) * dd * 0.1 * Math.sin(Math.PI * e);
      const nx = -vy / Math.max(1, dd), ny = vx / Math.max(1, dd);
      const st = Math.min(1.8, 3 * q * q);
      const along = alongX !== !!g.r90;            // stretch the glyph's local axis that lies along the travel
      return { dx: vx * e + nx * bend, dy: vy * e + ny * bend, s: 1 - 0.8 * e, sx: along ? 1 + st : 1 - 0.3 * st / 1.8, sy: along ? 1 - 0.3 * st / 1.8 : 1 + st };
    });
    let fr = 0; for (const g of lay) { const dd = Math.hypot(Tl[0] - gCX(g, it), Tl[1] - gCY(g, it)); if (win(p, J.clamp((dd - sz * 0.8) / Math.max(1, dm - sz * 0.8)), 0.5) >= 0.94) fr++; }
    dot(toD(it, Tl[0], Tl[1]), fr / Math.max(1, lay.N), true);
  },
};

/* ---------------- particles ---------------- */

/* weathered into sand: grains lift off from the upwind side and stream away on the wind */
X.sandOut = {
  name: '砂になって飛ぶ', tags: ['emotional', 'calm'], w: 1, ae: 'drift',
  outDur: dur => J.clamp(dur * 0.44, 0.36, 0.9), minDur: 0.8,
  apply(env, it, p) {
    const seed = it.seed | 0, sz = it.size, vert = !!it.vertical, W = env.W;
    const dir = cutBit(env, 71) ? 1 : -1;
    const [wx, wy] = dirI(it, dir, 0), [ux, uy] = dirI(it, 0, -1), sdir = Math.atan2(wy, wx) / DEG;
    const b = lBox(it), single = isSingle(env, it), og = orderOf(env, it)(0, 1);
    const posOf = (ox, oy) => {
      let pos = vert ? (oy - b.y0) / Math.max(1, b.h) : (ox - b.x0) / Math.max(1, b.w);
      if (!vert && dir > 0) pos = 1 - pos;
      if (single) pos = 0.8 * (dir > 0 ? 1 - og : og) + 0.2 * pos;
      return J.clamp(pos);
    };
    const D = sz * 3 + W * 0.18;
    const move = (x, k1, k2) => {
      const along = D * x * x, lift = sz * 0.55 * x + Math.sin(x * 5 + k1 * 6) * sz * 0.07 * x;
      return [wx * along + ux * lift, wy * along + uy * lift, k2];
    };
    if (it.gradient || it.fill === false || it.dash != null || it.pattern) {     // no pieces possible: glyph-level fallback
      addC(it, (i, g) => {
        const x = (p - posOf(gCX(g, it), gCY(g, it)) * 0.5) / 0.5;
        if (x <= 0) return null;
        if (x >= 1) return HIDE;
        const [dx, dy] = move(x, J.r(seed, i, 82), 0);
        return { dx, dy, a: 1 - x, s: 1 - 0.4 * x, sx: 1 + x, blur: env.pass === 'main' ? sz * 0.05 * x : 0 };
      });
      return;
    }
    it.shatter = true;
    it.pieceFns.push((ci, pj, pc, ox, oy) => {
      const t0 = posOf(ox, oy) * 0.5 + J.r(seed, ci, pj, 81) * 0.18;
      const x = (p - t0) / 0.32;
      if (x <= 0) return J.PID;
      if (x >= 1) return null;
      const [dx, dy] = move(x, J.r(seed, ci, pj, 82), 0);
      return J.PT(dx, dy, J.rs(seed, ci, pj, 83) * 140 * x, 1 - 0.55 * x, 1 + 2.4 * x, sdir, 1 - x * x);
    });
  },
};

/* fed down into a shredder slot: above it the text is intact, below it comes out as curling strips */
X.shredOut = {
  name: 'シュレッダー', tags: ['graphic', 'pop'], w: 0.8, ae: 'fall', minDur: 0.9,
  outDur: dur => J.clamp(dur * 0.44, 0.38, 0.9),
  apply(env, it, p) {
    const sz = it.size, seed = it.seed | 0, single = isSingle(env, it), H = env.H;
    const bb = dBox(it, sz * 0.06);
    const ySlot = single ? Math.max(bb.y1 + sz * 0.1, H * 0.66) : bb.y1 + sz * 0.12;
    const travel = ySlot - bb.y0 + sz * 0.1;
    const f = J.clamp((p - 0.08) / 0.72), D = travel * (0.2 * f * f + 0.8 * f);
    const v = J.clamp((p - 0.72) / 0.28), drop = H * 0.9 * v * v;
    it.y += D;
    it.clipY = [-1e5, ySlot];
    const n = J.clamp(Math.round(bb.w / (sz * 0.2)), 5, 20), sw = bb.w / n;
    const below = Math.max(0, bb.y1 + D - ySlot);
    const curl = J.clamp(below / (sz * 1.5));
    const ink = env.sc.ink || env.sc.fg, lw = Math.max(2, sz * 0.05);
    const barA = J.smooth(0, 0.1, p) * (1 - J.smooth(0.82, 0.98, p)), a0 = (it.alpha ?? 1) * (1 - J.smooth(0.8, 0.97, p));
    chainPost(it, (env2, it2) => {
      const ctx = env2.ctx;
      if (below > 0.5 && env2.pass === 'main') {
        for (let k = 0; k < n; k++) {
          const xs0 = bb.x0 + k * sw, xs1 = xs0 + sw * 0.74, xc = (xs0 + xs1) / 2;
          const ang = ((k - (n - 1) / 2) / Math.max(1, n) * 0.5 + J.rs(seed, k, 131) * 0.12) * curl + Math.sin(p * 9 + k) * 0.03 * curl;
          const lx0 = xs0 - it2.x - sz * 0.6, lx1 = xs1 - it2.x + sz * 0.6;
          const cf = merged([it2.charFn || (() => null), (i, g) => { const gx = gCX(g, it2); return gx + g.w * (it2.sx || 1) / 2 < lx0 || gx - g.w * (it2.sx || 1) / 2 > lx1 ? HIDE : null; }]);
          ctx.save();
          ctx.translate(xc, ySlot); ctx.rotate(ang); ctx.translate(-xc, -ySlot + drop * (0.7 + 0.6 * J.r(seed, k, 132)));
          ctx.beginPath(); ctx.rect(xs0, ySlot, xs1 - xs0, H * 3); ctx.clip();
          J.drawItem(env2, copyOf(it2, { charFn: cf, alpha: a0 }));
          ctx.restore();
        }
      }
      if (barA > 0.01) {
        const w = (bb.w + sz * 0.5) * E.outCubic(J.smooth(0, 0.12, p));
        env2.rect(bb.cx - w / 2, ySlot - lw / 2, w, lw, ink, barA, false);
      }
    });
  },
};

/* ---------------- mechanics ---------------- */

/* dominoes: each glyph topples over its bottom corner onto the next, in a chain */
X.dominoOut = {
  name: 'ドミノ倒し', tags: ['pop', 'graphic'], w: 0.9, ae: 'fall', minDur: 0.8,
  outDur: (dur, n) => J.clamp(dur * 0.42, 0.36, 0.85),
  apply(env, it, p) {
    const ord0 = orderOf(env, it), rev = cutBit(env, 91), sgn = rev ? -1 : 1, sx0 = it.sx || 1, sy0 = it.sy || 1, sz = it.size;
    const ord = (i, n) => (rev ? 1 - ord0(i, n) : ord0(i, n));
    const fade = 1 - J.smooth(0.74, 0.98, p), sink = sz * 0.9 * E.inQuad(J.clamp((p - 0.7) / 0.3));
    const [dnx, dny] = downI(it);
    addC(it, (i, g, n) => {
      const q = win(p, ord(i, n), 0.55);
      if (q <= 0) return null;
      const tf = 0.62;
      let th;
      if (q < tf) th = 90 * E.inCubic(q / tf);
      else { const u = (q - tf) / (1 - tf); th = 90 - 10 * Math.sin(Math.PI * Math.min(1, u * 1.6)) * (1 - u); }
      const px = sgn * g.w * sx0 / 2, py = sz * sy0 * 0.5;   // bottom corner on the falling side (item space)
      const [rx, ry] = rot2(-px, -py, sgn * th * DEG);
      return { dx: px + rx + dnx * sink, dy: py + ry + dny * sink, rot: sgn * th, a: fade };
    });
  },
};

/* one pin pops: the text swings down on the other one, settles, then drops away */
X.hingeOut = {
  name: '片留めが外れる', tags: ['pop', 'editorial'], w: 0.9, ae: 'fall', minDur: 0.9,
  outDur: dur => J.clamp(dur * 0.46, 0.42, 0.95),
  apply(env, it, p) {
    const single = isSingle(env, it);
    const q = single ? win(p, J.r(env.cut.seed | 0, +it.mi || 0, 101), 0.3) : p;
    if (q <= 0) return;
    const sz = it.size, b = lBox(it, sz * 0.02), vert = !!it.vertical, left = !cutBit(env, 102), H = env.H, acc = env.sc.accent;
    const sg = left ? 1 : -1;
    const ax = (left ? b.x0 : b.x1) + sg * Math.min(sz * 0.14, b.w * 0.2), ay = b.y0 + Math.min(sz * 0.12, b.h * 0.2);
    const reach = Math.max(1, b.w - sz * 0.14);
    const hang = vert ? 24 : Math.min(58, Math.max(14, Math.asin(J.clamp(H * 0.3 / reach, 0, 1)) / DEG));
    const t1 = 0.64, u = J.clamp(q / t1), v = J.clamp((q - t1) / (1 - t1));
    const th = hang * (1 - Math.exp(-u * 4.5) * Math.cos(u * 12)) + 30 * v * v;
    const pin0 = toD(it, ax, ay), bx = left ? b.x1 - sz * 0.14 : b.x0 + sz * 0.14, pin1 = toD(it, bx, ay);
    rotateAbout(it, sg * th, ax, ay);
    it.y += H * 1.25 * v * v; it.x += sg * sz * 0.4 * v;
    it.alpha = (it.alpha ?? 1) * (1 - J.smooth(0.9, 1, q));
    const r = Math.max(2, sz * 0.045), pa = 1 - J.smooth(0.05, 0.25, v), fl = J.clamp(q / 0.16);
    chainPost(it, (env2) => {
      if (pa > 0.01) env2.circle(pin0[0], pin0[1], r, acc, null, 0, pa, false);
      if (fl < 1) env2.circle(pin1[0] + sg * sz * 0.5 * fl, pin1[1] - sz * 0.6 * fl + sz * 1.6 * fl * fl, r, acc, null, 0, 1 - fl, false);
    });
  },
};

/* launch: every glyph squats, shakes, then blasts upward off the screen on an exhaust trail */
X.rocketOff = {
  name: '打ち上げ', tags: ['pop'], w: 0.9, ae: 'drift', minDur: 0.8,
  outDur: dur => J.clamp(dur * 0.44, 0.36, 0.9),
  apply(env, it, p) {
    const seed = it.seed | 0, sz = it.size, acc = env.sc.accent, sub = env.sc.sub, sy0 = it.sy || 1, lay = layOf(it);
    const [dnx, dny] = downI(it), bb = dBox(it, 0), D = bb.y1 + sz * 1.6, step = env.step;
    const Q = i => win(p, J.r(seed, i, 111) * 0.85, 0.55);
    const lift = u => D * Math.pow(u, 2.3);
    addC(it, (i, g) => {
      const q = Q(i);
      if (q <= 0) return null;
      if (q >= 1) return HIDE;
      const hh = g.h * sy0 / 2, r90 = !!g.r90;
      if (q < 0.3) {
        const u = q / 0.3, sq = Math.sin(u * Math.PI / 2), k = 1 - 0.22 * sq, w = 1 + 0.12 * sq;
        const sh = J.rs(seed, i, step, 112) * sz * 0.02 * u;
        return { dx: dnx * (1 - k) * hh + sh, dy: dny * (1 - k) * hh, sx: r90 ? k : w, sy: r90 ? w : k };
      }
      const u = (q - 0.3) / 0.7, L = lift(u), st = 1 + Math.min(0.8, 3 * u * u);
      return { dx: -dnx * L, dy: -dny * L, sx: r90 ? st : 1 - 0.12 * (st - 1), sy: r90 ? 1 - 0.12 * (st - 1) : st };
    });
    chainPost(it, (env2, it2) => {
      if (env2.pass !== 'main') return;
      inItem(env2, it2, () => {
        for (const g of lay) {
          if (isSp(g.ch)) continue;
          const q = Q(g.i);
          if (q < 0.3 || q >= 1) continue;
          const u = (q - 0.3) / 0.7, L = lift(u), hh = g.h * sy0 / 2;
          const gx = gCX(g, it2), gy = gCY(g, it2);
          const bx = gx - dnx * L + dnx * hh, by = gy - dny * L + dny * hh;       // glyph bottom now
          const tl = Math.min(L, sz * 2.6), a = 1 - u * 0.8;
          env2.line([[bx, by], [bx + dnx * tl, by + dny * tl]], acc, Math.max(1.5, sz * 0.2 * (1 - u * 0.5)), 0.28 * a, false);
          env2.line([[bx, by], [bx + dnx * tl * 0.75, by + dny * tl * 0.75]], acc, Math.max(1, sz * 0.08), 0.95 * a, false);
          env2.poly([[bx - dny * sz * 0.1, by + dnx * sz * 0.1], [bx + dny * sz * 0.1, by - dnx * sz * 0.1], [bx + dnx * sz * 0.45, by + dny * sz * 0.45]], acc, a, false);
          const ox = gx + dnx * hh, oy = gy + dny * hh;                          // launch pad smoke
          for (let k = 0; k < 3; k++) env2.circle(ox + (k - 1) * sz * 0.25 * (0.4 + u), oy - sz * 0.05, sz * (0.08 + 0.22 * u) * (1 - Math.abs(k - 1) * 0.3), sub, null, 0, 0.35 * (1 - u), false);
        }
      });
    });
  },
};

/* bouncing out: glyphs hop away sideways in shrinking bounces, squashing on every landing */
function hops(q) {
  const R = 0.64, NH = 4;
  let S = 0; for (let j = 0; j < NH; j++) S += Math.pow(R, j);
  let t = q * S;
  for (let j = 0; j < NH; j++) {
    const d = Math.pow(R, j);
    if (t <= d || j === NH - 1) {
      const u = J.clamp(t / d), hk = d * d;
      return { h: hk * 4 * u * (1 - u), land: Math.max(0, 1 - Math.min(u, 1 - u) / 0.09) * Math.sqrt(hk) };
    }
    t -= d;
  }
  return { h: 0, land: 0 };
}
X.bounceOff = {
  name: '弾んで去る', tags: ['pop'], w: 0.9, ae: 'scatter', minDur: 0.8,
  outDur: dur => J.clamp(dur * 0.45, 0.38, 0.9),
  apply(env, it, p) {
    const dir = cutBit(env, 121) ? 1 : -1, sz = it.size, ord = orderOf(env, it), sy0 = it.sy || 1;
    const [rx, ry] = rightI(it), [dnx, dny] = downI(it);
    addC(it, (i, g, n) => {
      const o = dir > 0 ? 1 - ord(i, n) : ord(i, n);
      const q = win(p, o, 0.42);
      if (q <= 0) return null;
      if (q >= 1) return HIDE;
      const [gxD] = toD(it, gCX(g, it), gCY(g, it));
      const dist = dir > 0 ? env.W - gxD + sz * 1.2 : gxD + sz * 1.2;
      const along = dist * Math.pow(q, 1.25), hp = hops(q), h = hp.h * sz * 1.4;
      const sq = 0.3 * hp.land, hh = g.h * sy0 / 2, r90 = !!g.r90;
      const k = 1 - sq, w = 1 + sq * 0.7;
      return { dx: rx * dir * along - dnx * h + dnx * (1 - k) * hh, dy: ry * dir * along - dny * h + dny * (1 - k) * hh,
        rot: dir * 14 * Math.sin(Math.PI * Math.min(1, hp.h * 4)) , sx: r90 ? k : w, sy: r90 ? w : k };
    });
  },
};

/* balloons: each glyph floats up on a string, swaying like a pendulum below its balloon */
X.balloonOff = {
  name: '風船で飛ぶ', tags: ['emotional', 'calm', 'pop'], w: 0.9, ae: 'drift', minDur: 0.9,
  outDur: dur => J.clamp(dur * 0.48, 0.42, 1.0),
  apply(env, it, p) {
    const seed = it.seed | 0, sz = it.size, sub = env.sc.sub, sy0 = it.sy || 1, lay = layOf(it);
    const bb = dBox(it, 0), D = bb.y1 + sz * 1.8;
    const Q = i => win(p, J.r(seed, i, 141), 0.45);
    const st = (i, q) => {
      const L = D * Math.pow(q, 1.7), ph = J.r(seed, i, 142) * TAU, w = 7 + 3 * J.r(seed, i, 143), amp = Math.min(1, q * 3);
      return { L, sw: Math.sin(q * w + ph) * sz * 0.22 * amp, rot: -Math.cos(q * w + ph) * 11 * amp, inf: 1 + 0.07 * Math.sin(Math.PI * Math.min(1, q * 2.5)) };
    };
    addC(it, (i, g) => {
      const q = Q(i);
      if (q <= 0) return null;
      if (q >= 1) return HIDE;
      const s = st(i, q), [dx, dy] = dirI(it, s.sw, -s.L);
      return { dx, dy, rot: s.rot, s: s.inf };
    });
    chainPost(it, (env2, it2) => {
      if (env2.pass !== 'main') return;
      inItem(env2, it2, () => {
        const [dnx, dny] = downI(it2), [rx, ry] = rightI(it2);
        for (const g of lay) {
          if (isSp(g.ch)) continue;
          const q = Q(g.i);
          if (q <= 0 || q >= 1) continue;
          const s = st(g.i, q), [dx, dy] = dirI(it2, s.sw, -s.L), r = s.rot * DEG, hh = g.h * sy0 / 2 * s.inf;
          const bx = gCX(g, it2) + dx - Math.sin(r) * hh, by = gCY(g, it2) + dy + Math.cos(r) * hh;
          const pts = [];
          for (let k = 0; k <= 6; k++) {                       // the string trails and lags the sway
            const u = k / 6, lag = Math.sin(q * 8 + J.r(seed, g.i, 142) * TAU - u * 1.6) * sz * 0.1 * u;
            pts.push([bx + dnx * sz * 0.95 * u + rx * lag, by + dny * sz * 0.95 * u + ry * lag]);
          }
          env2.line(pts, sub, Math.max(1, sz * 0.014), 0.85 * Math.min(1, q * 8), false);
        }
      });
    });
  },
};

/* a let-go balloon: each glyph puffs up, then zips around erratically while it shrinks to nothing */
X.deflateOut = {
  name: 'しぼんで飛ぶ', tags: ['pop'], w: 0.8, ae: 'scatter',
  outDur: dur => J.clamp(dur * 0.42, 0.36, 0.85),
  apply(env, it, p) {
    const seed = it.seed | 0, sz = it.size;
    addC(it, (i) => {
      const q = win(p, J.r(seed, i, 151) * 0.8, 0.4);
      if (q <= 0) return null;
      if (q >= 0.97) return HIDE;
      if (q < 0.16) {                                       // puff up and strain
        const u = q / 0.16;
        return { s: 1 + 0.16 * E.outCubic(u), sx: 1 + 0.05 * Math.sin(u * 25), sy: 1 - 0.05 * Math.sin(u * 25), rot: J.rs(seed, i, 152) * 4 * u };
      }
      const u = (q - 0.16) / 0.81, th0 = J.r(seed, i, 153) * TAU;
      let x = 0, y = 0, th = th0;
      const NS = 14, uu = u;
      for (let k = 0; k < NS; k++) {                         // integrate an erratic heading
        const t = (k + 0.5) / NS * uu;
        th = th0 + 7 * J.noise1(t * 5, seed + i * 7) + 3 * t;
        const v = sz * 7.5 * (0.5 + t) * (uu / NS);
        x += Math.cos(th) * v; y += Math.sin(th) * v;
      }
      const wob = Math.sin(u * 70) * 0.14 * (1 - u);
      return { dx: x, dy: y, rot: (th - th0) / DEG * 0.5, s: 1.16 * (1 - Math.pow(u, 1.3)), sx: 1 + wob, sy: 1 - wob };
    });
  },
};

/* heat haze: the text wobbles in rippling slices, stretches upward and thins into the air */
X.hazeOut = {
  name: '陽炎に消える', tags: ['emotional', 'calm'], w: 0.9, ae: 'blur',
  apply(env, it, p) {
    const sz = it.size, t = env.ltb, vert = !!it.vertical, e = E.inQuad(p);
    const b0 = box(it);
    scaleAbout(it, 1 - 0.05 * e, 1 + 0.3 * e, b0.cx - it.x, b0.y1 - it.y);
    it.y -= sz * 0.3 * e;
    it.color = mixC(colOf(it), env.sc.accent, 0.3 * J.smooth(0.1, 0.7, p));
    it.alpha = (it.alpha ?? 1) * (1 - J.smooth(0.3, 0.94, p));
    const bb = dBox(it, sz * 0.3), A = sz * (0.02 + 0.26 * E.inOutSine(p));
    if (A < 0.4 || env.pass !== 'main') return;
    if (!vert) {
      const n = J.clamp(Math.ceil(bb.h / (sz * 0.09)), 6, isSingle(env, it) ? 7 : 14), bh = bb.h / n, out = [];
      for (let j = 0; j < n; j++) { const y = bb.y0 + j * bh, c = (y + bh / 2) / sz; out.push([y, y + bh + 0.4, A * Math.sin(c * 6.5 - t * 12) * (0.6 + 0.4 * Math.sin(c * 2.3 + t * 5))]); }
      it.bands = out;
    } else {
      const n = J.clamp(Math.ceil(bb.w / (sz * 0.08)), 6, 16), bw = bb.w / n, out = [];
      for (let j = 0; j < n; j++) { const x = bb.x0 + j * bw, c = (x + bw / 2) / sz; out.push([x, x + bw + 0.4, A * Math.sin(c * 6.5 - t * 12) * (0.6 + 0.4 * Math.sin(c * 2.3 + t * 5))]); }
      it.vbands = out;
    }
  },
};

/* a pane of glass: an impact cracks it radially, then the shards drop away */
X.glassBreak = {
  name: 'ガラス割れ', tags: ['graphic', 'pop', 'glitch'], w: 0.8, ae: 'explode',
  outDur: dur => J.clamp(dur * 0.42, 0.36, 0.85),
  apply(env, it, p) {
    const single = isSingle(env, it);
    const q = single ? win(p, orderOf(env, it)(0, 1), 0.4) : p;
    if (q <= 0) return;
    const sz = it.size, seed = it.seed | 0, H = env.H, b = lBox(it, sz * 0.12);
    const ix = b.cx + J.rs(seed, 151) * b.w * 0.2, iy = b.cy + J.rs(seed, 152) * b.h * 0.12;
    const K = single ? 4 : J.clamp(Math.round(5 + b.w / Math.max(1, b.h) * 0.8), 6, 10);
    const B = [], R = [];
    for (let k = 0; k < K; k++) {
      const a = (k + 0.35 * J.rs(seed, k, 153)) / K * TAU, c = Math.cos(a), s = Math.sin(a);
      const tx = c > 0 ? (b.x1 - ix) / c : c < 0 ? (b.x0 - ix) / c : 1e9, ty = s > 0 ? (b.y1 - iy) / s : s < 0 ? (b.y0 - iy) / s : 1e9;
      const tt = Math.min(tx, ty), f = 0.3 + 0.25 * J.r(seed, k, 154);
      B.push([ix + c * tt, iy + s * tt]); R.push([ix + c * tt * f, iy + s * tt * f]);
    }
    const shards = [];
    for (let k = 0; k < K; k++) {
      const k2 = (k + 1) % K;
      shards.push([[ix, iy], R[k], R[k2]]);
      shards.push([R[k], B[k], B[k2], R[k2]]);
    }
    // corners of the box between two spokes belong to the outer shard
    for (let k = 0; k < K; k++) {
      const k2 = (k + 1) % K, poly = shards[k * 2 + 1];
      const a1 = Math.atan2(B[k][1] - iy, B[k][0] - ix), a2 = Math.atan2(B[k2][1] - iy, B[k2][0] - ix);
      const corners = [[b.x1, b.y1], [b.x0, b.y1], [b.x0, b.y0], [b.x1, b.y0]].filter(([cx, cy]) => {
        let da = Math.atan2(cy - iy, cx - ix) - a1, dd = a2 - a1;
        da = ((da % TAU) + TAU) % TAU; dd = ((dd % TAU) + TAU) % TAU;
        return da > 0 && da < dd;
      }).sort((m, n2) => (((Math.atan2(m[1] - iy, m[0] - ix) - a1) % TAU + TAU) % TAU) - (((Math.atan2(n2[1] - iy, n2[0] - ix) - a1) % TAU + TAU) % TAU));
      if (corners.length) shards[k * 2 + 1] = [R[k], B[k], ...corners, B[k2], R[k2]];
    }
    const crack = J.clamp(q / 0.2), v = J.clamp((q - 0.18) / 0.82);
    const a0 = it.alpha ?? 1, bg = env.sc.bg, lw = Math.max(1.5, sz * 0.032);
    if (v <= 0) {
      chainPost(it, (env2, it2) => {
        if (env2.pass !== 'main') return;
        inItem(env2, it2, () => {
          for (let k = 0; k < K; k++) env2.polyPartial([[ix, iy], B[k]], crack, bg, lw, 1, false);
          if (crack > 0.5) for (let k = 0; k < K; k++) env2.polyPartial([R[k], R[(k + 1) % K]], (crack - 0.5) * 2, bg, lw * 0.8, 1, false);
          env2.circle(ix, iy, sz * (0.06 + 0.2 * crack), env2.sc.accent, null, 0, 0.5 * (1 - crack), false);
        });
      });
      return;
    }
    it.alpha = 0;
    chainPost(it, (env2, it2) => {
      if (env2.pass !== 'main') return;              // shards are drawn once (the chroma ghosts drop out while it breaks)
      shards.forEach((poly, j) => {
        let cx = 0, cy = 0; for (const [x, y] of poly) { cx += x; cy += y; } cx /= poly.length; cy /= poly.length;
        const d = J.r(seed, j, 155) * 0.3 + (j & 1 ? 0 : 0.12), u = J.clamp((v - d) / (1 - d));
        const h = { x: it2.x, y: it2.y, rot: it2.rot || 0 };
        if (u > 0) {
          rotateAbout(h, J.rs(seed, j, 156) * 120 * u * u, cx, cy);
          const ox = (cx - ix) / Math.max(1, b.w) * sz * 1.2 * u, oy = (cy - iy) / Math.max(1, b.h) * sz * 0.5 * u;
          const [Ox, Oy] = rot2(ox, oy, (it2.rot || 0) * DEG);
          h.x += Ox; h.y += Oy + H * 1.1 * u * u;
        }
        let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
        for (const [x, y] of poly) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        const sx2 = it2.sx || 1, sy2 = it2.sy || 1, vt = !!it2.vertical;
        const cf = merged([it2.charFn || (() => null), (i, g) => {           // only the glyphs this shard can show
          const gx = gCX(g, it2), gy = gCY(g, it2), hw = (vt ? it2.size : g.w) * sx2 * 0.6, hh = (vt ? g.h : it2.size) * sy2 * 0.6;
          return gx + hw < x0 || gx - hw > x1 || gy + hh < y0 || gy - hh > y1 ? HIDE : null;
        }]);
        J.drawFx(env2, copyOf(it2, { x: h.x, y: h.y, rot: h.rot, charFn: cf, alpha: a0 * (1 - J.smooth(0.75, 1, u)), clipFn: (ctx, e3, it3) => polyL(ctx, it3, poly) }));
      });
      if (env2.pass === 'main' && v < 0.25) inItem(env2, it2, () => { for (let k = 0; k < K; k++) env2.line([[ix, iy], B[k]], bg, lw * (1 - v * 4), 1, false); });
    });
  },
};

/* zipper: a slider runs along each line; behind it the glyphs are pinched shut onto a line of teeth */
X.zipOut = {
  name: 'ジッパー', tags: ['graphic', 'pop'], w: 0.8, ae: 'wipe',
  apply(env, it, p) {
    const vert = !!it.vertical, sz = it.size, acc = env.sc.accent, rev = cutBit(env, 161), sub = env.sc.sub;
    const single = isSingle(env, it), N = cutN(env);
    const pos = J.lerp(-0.12, 1.12, E.inOutSine(J.clamp(p / 0.8)));
    const lines = lineExt(it), sx0 = it.sx || 1, sy0 = it.sy || 1;
    const band = single ? 1.2 / Math.max(1, N - 1) : 0.22;
    const og = orderOf(env, it)(0, 1);
    const along = (L, g) => { const a0 = vert ? L.y0 : L.x0, a1 = vert ? L.y1 : L.x1, v = vert ? gCY(g, it) : gCX(g, it); const o = (v - a0) / Math.max(1, a1 - a0); return rev ? 1 - o : o; };
    const byLi = {}; for (const L of lines) byLi[L.li] = L;
    addC(it, (i, g) => {
      const L = byLi[g.li]; if (!L) return null;
      const o = single ? (rev ? 1 - og : og) : along(L, g);
      const c = E.inOutSine(J.clamp((pos - o) / band + 0.15));
      if (c <= 0) return null;
      if (c >= 0.99) return HIDE;
      const k = 1 - c, acrossX = vert !== !!g.r90;
      return acrossX ? { sx: k } : { sy: k };
    });
    const fa = (it.alpha ?? 1) * (1 - J.smooth(0.76, 0.96, p));
    chainPost(it, (env2, it2) => {
      if (env2.pass !== 'main' || fa <= 0.01) return;
      inItem(env2, it2, () => {
        for (const L of lines) {
          const a0 = vert ? L.y0 : L.x0, a1 = vert ? L.y1 : L.x1, mid = vert ? (L.x0 + L.x1) / 2 : (L.y0 + L.y1) / 2, len = a1 - a0;
          let sp = single ? a0 + len * ((pos - (rev ? 1 - og : og)) * Math.max(1, N - 1) + 0.5) : a0 + len * pos;
          if (rev) sp = a0 + a1 - sp;
          const z0 = rev ? Math.max(sp, a0 - sz * 0.1) : a0 - sz * 0.1, z1 = rev ? a1 + sz * 0.1 : Math.min(sp, a1 + sz * 0.1);
          const tp = Math.max(3, sz * 0.09), th = sz * 0.05;
          for (let a = z0, k = 0; a < z1; a += tp, k++) {           // teeth
            const o = (k & 1 ? 1 : -1) * th * 0.5;
            if (vert) env2.rect(mid - th * 0.5 + o, a, th, tp * 0.6, sub, fa, false); else env2.rect(a, mid - th * 0.5 + o, tp * 0.6, th, sub, fa, false);
          }
          if (sp > a0 - sz * 0.5 && sp < a1 + sz * 0.5) {           // slider + pull tab
            const w = sz * 0.3, h = sz * 0.46;
            if (vert) { env2.rrect(mid - h / 2, sp - w / 2, h, w, w * 0.3, acc, fa, false); env2.rrect(mid + h / 2 - sz * 0.02, sp - w * 0.2, sz * 0.36, w * 0.4, w * 0.2, acc, fa, false); }
            else { env2.rrect(sp - w / 2, mid - h / 2, w, h, w * 0.3, acc, fa, false); env2.rrect(sp - w * 0.2, mid + h / 2 - sz * 0.02, w * 0.4, sz * 0.36, w * 0.2, acc, fa, false); }
          }
        }
      });
    });
  },
};

/* both halves slam into a seam at the centre and vanish into it, with an impact flash */
X.clapShut = {
  name: '中央で閉じる', tags: ['graphic', 'pop'], w: 0.9, ae: 'wipe',
  apply(env, it, p) {
    const vert = !!it.vertical, sz = it.size, acc = env.sc.accent, W = env.W;
    const e = E.inCubic(J.clamp(p / 0.62)), hit = J.clamp((p - 0.6) / 0.4);
    if (isSingle(env, it)) {
      const left = it.x < W / 2, D = W * 0.47 * e;
      it.x += left ? D : -D;
      it.clipFn = (ctx) => (left ? ctx.rect(-W, -env.H, W * 1.5, env.H * 3) : ctx.rect(W / 2, -env.H, W * 1.5, env.H * 3));
      if (e >= 0.999) it.alpha = 0;
      if (hit > 0 && hit < 1 && Math.round(+it.mi || 0) === 0) {
        const h = env.H * 0.3 * (1 + 0.6 * E.outCubic(hit)), lw = sz * 0.12 * (1 - hit);
        chainPost(it, (env2) => env2.rect(W / 2 - lw / 2, env.H / 2 - h / 2, lw, h, acc, 1 - hit, false));
      }
      return;
    }
    const b = lBox(it, sz * 0.04);
    const seam = vert ? b.cy : b.cx, half = (vert ? b.h : b.w) / 2 + sz * 0.05, D = half * e;
    const side = sgn => (i, g) => {
      const gx = gCX(g, it), gy = gCY(g, it), c = vert ? gy : gx, hw = (vert ? g.h * (it.sy || 1) : g.w * (it.sx || 1)) / 2;
      if (sgn < 0 ? c - hw >= seam : c + hw <= seam) return HIDE;
      const k = 1 - 0.12 * e;
      const nx = vert ? gx : gx - sgn * D, ny = vert ? gy - sgn * D : gy;
      const r = vert ? gclip(g, it, nx, ny, 1, k, null, sgn < 0 ? [-1e5, seam] : [seam, 1e5]) : gclip(g, it, nx, ny, k, 1, sgn < 0 ? [-1e5, seam] : [seam, 1e5], null);
      return Object.assign({ dx: nx - gx, dy: ny - gy }, vert ? (g.r90 ? { sx: k } : { sy: k }) : (g.r90 ? { sy: k } : { sx: k }), r);
    };
    withCopies(it, side(-1), [side(1)]);
    const sa = J.smooth(0, 0.15, p) * (1 - J.smooth(0.6, 0.7, p));
    if (sa > 0.01) chainPost(it, (env2, it2) => {
      if (env2.pass !== 'main') return;
      const lw = Math.max(1.5, sz * 0.025), ext = (vert ? b.w : b.h) * 1.1 * E.outCubic(J.smooth(0, 0.15, p)), mc = vert ? b.cx : b.cy;
      inItem(env2, it2, () => { if (vert) env2.rect(mc - ext / 2, seam - lw / 2, ext, lw, acc, sa, false); else env2.rect(seam - lw / 2, mc - ext / 2, lw, ext, acc, sa, false); });
    });
    if (hit > 0 && hit < 1) {
      const lw = sz * 0.14 * (1 - E.outCubic(hit)), ext = (vert ? b.w : b.h) * (1 + 0.7 * E.outCubic(hit)), fa = 1 - hit;
      chainPost(it, (env2, it2) => {
        if (env2.pass !== 'main') return;
        inItem(env2, it2, () => {
          const mc = vert ? b.cx : b.cy;
          if (vert) env2.rect(mc - ext / 2, seam - lw / 2, ext, lw, acc, fa, false); else env2.rect(seam - lw / 2, mc - ext / 2, lw, ext, acc, fa, false);
          for (let k = 0; k < 4; k++) {                   // impact sparks
            const a = (k + 0.5) / 4 * TAU + 0.3, r0 = sz * (0.2 + 0.6 * hit), r1 = r0 + sz * 0.25 * (1 - hit);
            const cx = vert ? mc : seam, cy = vert ? seam : mc;
            env2.line([[cx + Math.cos(a) * r0, cy + Math.sin(a) * r0], [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1]], acc, Math.max(1, sz * 0.03), fa, false);
          }
        });
      });
    }
  },
};

/* the sign loses power: glyphs flicker on a failing supply and die one by one, leaving dark tubes that fade */
X.lampOff = {
  name: '消灯', tags: ['glitch', 'emotional'], w: 0.8, ae: 'glitch',
  apply(env, it, p) {
    const seed = it.seed | 0, step = env.step, c0 = colOf(it), bg = env.sc.bg, dark = darkBg(env), sz = it.size;
    const dimC = mixC(c0, bg, 0.78), hot = dark ? mixC(c0, '#ffffff', 0.5) : c0;
    const N = layOf(it).N;
    const T = i => J.r(seed, i, 171) * 0.46;
    let lit = 0;
    for (let i = 0; i < N; i++) { const q = (p - T(i)) / 0.36; lit += q <= 0 ? 1 : q < 0.5 ? 0.5 : 0; }
    addC(it, (i) => {
      const q = (p - T(i)) / 0.36;
      if (q <= 0) return null;
      if (q >= 1) return HIDE;
      if (q > 0.55) return { color: dimC, a: 1 - (q - 0.55) / 0.45 };
      const off = J.r(seed, i, step, 172) < 0.3 + 0.7 * (q / 0.55);
      return off ? { color: dimC } : { color: hot };
    });
    if (dark && env.pass === 'main' && !it.shadow) it.shadow = { color: J.rgba(mixC(c0, env.sc.accent, 0.4), 0.85), blur: sz * 0.22 * lit / Math.max(1, N), dx: 0, dy: 0 };
  },
};

/* slot reels: every glyph spins up like a reel, faster and faster, and stops on an empty cell */
X.slotOut = {
  name: 'スロット回転', tags: ['glitch', 'pop'], w: 0.8, ae: 'glitch',
  outDur: dur => J.clamp(dur * 0.38, 0.3, 0.7),
  apply(env, it, p) {
    const seed = it.seed | 0, ord = orderOf(env, it), sy0 = it.sy || 1, acc = env.sc.accent;
    const M = i => 3 + (J.h(seed, i, 182) % 4);
    const chOf = (i, m) => J.pool('reel')[J.h(seed, i, m, 181) % J.pool('reel').length];
    const state = (i, n) => {
      const q = win(p, ord(i, n), 0.35);
      if (q <= 0) return null;
      const ph = (M(i) + 1) * E.inOutCubic(q), m = Math.floor(ph);
      return { q, ph, m, fr: ph - m, sp: Math.min(0.6, 6 * Math.sin(Math.PI * q) * 0.12) };
    };
    const reel = (next) => (i, g, n) => {
      const s = state(i, n);
      if (!s) return next ? HIDE : null;
      const m = s.m + (next ? 1 : 0);
      if (m > M(i)) return HIDE;
      const pitch = g.h * sy0 * 1.12, dy = next ? (1 - s.fr) * pitch : -s.fr * pitch;
      const gx = gCX(g, it), gy = gCY(g, it), hh = g.h * sy0 * 0.55, ky = 1 + s.sp;
      const r = gclip(g, it, gx, gy + dy, 1, ky, null, [gy - hh, gy + hh]);
      const o = Object.assign({ dy }, r, g.r90 ? { sx: ky } : { sy: ky });
      if (m > 0) { o.ch = chOf(i, m); if (J.r(seed, i, m, 183) < 0.3) o.color = acc; }
      return o;
    };
    withCopies(it, reel(false), [reel(true)]);
  },
};

/* clock wipe: every glyph is swept away by its own little clock hand (a square "cooldown" wipe), one after another */
X.clockOut = {
  name: '時計ワイプ', tags: ['graphic', 'editorial'], w: 0.9, ae: 'wipe',
  apply(env, it, p) {
    const sz = it.size, acc = env.sc.accent, cw = !cutBit(env, 191), sg = cw ? 1 : -1, a0 = -Math.PI / 2;
    const ord = orderOf(env, it), lay = layOf(it), vert = !!it.vertical, sx0 = it.sx || 1, sy0 = it.sy || 1;
    const cells = [];
    for (const g of lay) {
      if (isSp(g.ch)) continue;
      const q = win(p, ord(g.i, lay.N), 0.55);
      if (q >= 1) continue;
      const e = E.inOutSine(q);
      cells.push({ cx: gCX(g, it), cy: gCY(g, it), hw: (vert ? sz * sx0 : g.w * sx0) * 0.56, hh: (vert ? g.h * sy0 : sz * sy0) * 0.56, e });
    }
    if (!cells.length) { it.alpha = 0; return; }
    const P2 = (c, a) => { const ca = Math.cos(a), sa = Math.sin(a), t = Math.min(Math.abs(ca) > 1e-6 ? c.hw / Math.abs(ca) : 1e9, Math.abs(sa) > 1e-6 ? c.hh / Math.abs(sa) : 1e9); return [c.cx + ca * t, c.cy + sa * t]; };
    const region = c => {                          // centre → hand → corners (in sweep order) → 12 o'clock
      const ah = a0 + sg * c.e * TAU, span = (1 - c.e) * TAU, pts = [[c.cx, c.cy], P2(c, ah)];
      const cor = [[c.hw, -c.hh], [c.hw, c.hh], [-c.hw, c.hh], [-c.hw, -c.hh]].map(([x, y]) => {
        const rel = (((Math.atan2(y, x) - ah) * sg) % TAU + TAU) % TAU;
        return [rel, c.cx + x, c.cy + y];
      }).filter(k => k[0] > 1e-6 && k[0] < span).sort((m, n2) => m[0] - n2[0]);
      for (const k of cor) pts.push([k[1], k[2]]);
      pts.push([c.cx, c.cy - c.hh]);
      return pts;
    };
    it.clipFn = (ctx, e2, it3) => { for (const c of cells) polyL(ctx, it3, c.e <= 0.001 ? [[c.cx - c.hw, c.cy - c.hh], [c.cx + c.hw, c.cy - c.hh], [c.cx + c.hw, c.cy + c.hh], [c.cx - c.hw, c.cy + c.hh]] : region(c)); };
    const fa = it.alpha ?? 1;
    chainPost(it, (env2, it2) => {
      if (env2.pass !== 'main') return;
      inItem(env2, it2, () => {
        for (const c of cells) {
          if (c.e <= 0.001) continue;
          const ah = a0 + sg * c.e * TAU, glow = [[c.cx, c.cy]], a = fa * Math.min(1, (1 - c.e) * 6);
          for (let k = 0; k <= 5; k++) glow.push(P2(c, ah - sg * Math.min(c.e * TAU, 0.6) * k / 5));
          env2.poly(glow, acc, 0.22 * a, false);
          env2.line([[c.cx, c.cy], P2(c, ah)], acc, Math.max(1.5, sz * 0.03), a, false);
          env2.circle(c.cx, c.cy, Math.max(1.5, sz * 0.04), acc, null, 0, a, false);
        }
      });
    });
  },
};

/* digital rain: glyphs decode into falling columns of characters that pour off the bottom */
X.matrixOut = {
  name: 'デジタル雨', tags: ['glitch'], w: 0.8, ae: 'glitch',
  outDur: dur => J.clamp(dur * 0.42, 0.34, 0.85),
  apply(env, it, p) {
    const seed = it.seed | 0, step = env.step, sz = it.size, sy0 = it.sy || 1, acc = env.sc.accent, c0 = colOf(it);
    const bb = dBox(it, 0), D = env.H - bb.y0 + sz * 1.2, head = darkBg(env) ? mixC(c0, '#ffffff', 0.4) : c0;
    const Q = i => win(p, J.r(seed, i, 201) * 0.9, 0.5);
    const rch = (i, k) => J.pool('half')[J.h(seed, i, k, Math.floor(step / 2), 202) % J.pool('half').length];
    const fall = (i, g) => {
      const q = Q(i);
      if (q <= 0) return null;
      const u = J.clamp((q - 0.22) / 0.78);
      return { q, u, L: D * Math.pow(u, 1.7), pitch: g.h * sy0 * 0.92 };
    };
    const headFn = (i, g) => {
      const f = fall(i, g);
      if (!f) return null;
      if (f.q >= 1) return HIDE;
      const [dx, dy] = dirI(it, 0, f.L);
      if (f.q < 0.22) return J.r(seed, i, step, 203) < f.q / 0.22 + 0.2 ? { ch: rch(i, 0), color: acc } : null;
      return { dx, dy, ch: rch(i, 0), color: head };
    };
    const trail = k => (i, g) => {
      const f = fall(i, g);
      if (!f || f.q < 0.22 || f.q >= 1 || f.L < k * f.pitch * 0.6) return HIDE;
      const [dx, dy] = dirI(it, 0, f.L - k * f.pitch);
      return { dx, dy, ch: rch(i, k), color: acc, a: (1 - k / 6) * (1 - 0.5 * f.u) };
    };
    withCopies(it, headFn, [trail(1), trail(2), trail(3), trail(4), trail(5)]);
  },
};

/* tornado: the glyphs are caught in a vortex, orbiting a vertical axis (front / back depth) while they are lifted away */
X.tornadoOut = {
  name: '竜巻', tags: ['pop'], w: 0.8, ae: 'scatter', minDur: 0.8,
  outDur: dur => J.clamp(dur * 0.45, 0.38, 0.9),
  apply(env, it, p) {
    const seed = it.seed | 0, sz = it.size, dir = cutBit(env, 211) ? 1 : -1, single = isSingle(env, it), W = env.W;
    const bb = dBox(it, 0), up = bb.y1 + sz * 1.8;
    const lay = layOf(it);
    let cx = bb.cx, R0 = 1;
    if (single) { cx = W / 2; R0 = W * 0.45; }
    else for (const g of lay) R0 = Math.max(R0, Math.abs(toD(it, gCX(g, it), gCY(g, it))[0] - cx));
    R0 += sz * 0.3;
    const orbit = (X0, i, q, hx) => {              // X0 = glyph design x → new design x offset, lift, depth; hx = helix step 0..1
      const ox = X0 - cx, th0 = Math.asin(J.clamp(ox / R0, -1, 1)), r = J.r(seed, i, 212);
      const th = th0 + dir * Math.PI * (3.2 + r) * q * q;
      const lift = up * Math.pow(q, 2.2) * (0.8 + 0.3 * r) + sz * 1.4 * hx * E.outCubic(q);
      const R = R0 * (1 - 0.35 * E.outCubic(q)) + lift * 0.25 + sz * 0.6 * q;
      return { dx: R * Math.sin(th) - ox, dy: -lift, z: Math.cos(th), tilt: -Math.sin(th) * 14 * q };
    };
    const alpha = 1 - J.smooth(0.8, 0.98, p);
    if (single) {
      const q = win(p, J.r(env.cut.seed | 0, +it.mi || 0, 213) * 0.5, 0.25);
      if (q <= 0) return;
      const o = orbit(it.x, +it.mi || 0, q, orderOf(env, it)(0, 1));
      it.x += o.dx; it.y += o.dy; it.rot = (it.rot || 0) + o.tilt; it.size *= 0.72 + 0.28 * o.z; it._m = null;
      it.alpha = (it.alpha ?? 1) * (0.3 + 0.7 * (o.z + 1) / 2) * alpha;
      return;
    }
    addC(it, (i, g) => {
      const q = win(p, J.r(seed, i, 214) * 0.5, 0.25);
      if (q <= 0) return null;
      const [X0] = toD(it, gCX(g, it), gCY(g, it)), o = orbit(X0, i, q, lay.N > 1 ? i / (lay.N - 1) : 0), [dx, dy] = dirI(it, o.dx, o.dy);
      return { dx, dy, rot: o.tilt, s: 0.72 + 0.28 * o.z, a: (0.3 + 0.7 * (o.z + 1) / 2) * alpha };
    });
  },
};

/* rolled up like a poster: a paper roll travels along the line, swallowing the text as it goes */
X.rollUpOut = {
  name: '巻き取る', tags: ['graphic', 'editorial'], w: 0.8, ae: 'wipe',
  outDur: dur => J.clamp(dur * 0.4, 0.32, 0.8),
  apply(env, it, p) {
    const sz = it.size, vert = !!it.vertical, rev = cutBit(env, 221), single = isSingle(env, it), c0 = colOf(it), bg = env.sc.bg;
    const b = lBox(it, sz * 0.08), sx0 = it.sx || 1, sy0 = it.sy || 1;
    let a0 = vert ? b.y0 : b.x0, a1 = vert ? b.y1 : b.x1;
    const c0x = vert ? b.x0 : b.y0, c1x = vert ? b.x1 : b.y1;
    let Xr, r0 = sz * 0.26;
    const e = E.inOutSine(J.clamp(p / 0.86));
    if (single) {                                  // one roll across the whole screen
      const X0 = env.W * 0.03 - it.x, X1 = env.W * 0.97 - it.x;
      Xr = rev ? J.lerp(X1, X0, e) : J.lerp(X0, X1, e);
    } else Xr = rev ? J.lerp(a1 + r0, a0 - r0 * 3, e) : J.lerp(a0 - r0, a1 + r0 * 3, e);
    const rolled = rev ? Math.max(0, (single ? env.W * 0.97 - it.x : a1) - Xr) : Math.max(0, Xr - (single ? env.W * 0.03 - it.x : a0));
    const r = r0 * Math.sqrt(1 + rolled / (sz * 2));
    const sg = rev ? -1 : 1;                        // roll moves in +sg along the axis
    const edge = Xr + sg * r;                      // the flat paper starts here
    addC(it, (i, g) => {
      const c = vert ? gCY(g, it) : gCX(g, it), hw = (vert ? g.h * sy0 : g.w * sx0) / 2;
      const d = (c - edge) * sg;                   // distance ahead of the roll
      if (d + hw <= 0) return HIDE;
      const near = J.clamp(1 - (d - hw) / (r * 2.6));
      if (near <= 0) return null;
      const k = 1 - 0.55 * Math.pow(near, 1.6), nc = c - sg * (1 - k) * hw;   // the paper bunches up as it curls onto the roll
      const alongLocalX = vert ? !!g.r90 : !g.r90, kx = alongLocalX ? k : 1, ky = alongLocalX ? 1 : k;
      const o = Object.assign({ color: mixC(c0, bg, 0.45 * near), sx: kx, sy: ky }, vert ? { dy: nc - c } : { dx: nc - c });
      if ((nc - edge) * sg - k * hw < 0) Object.assign(o, vert ? gclip(g, it, gCX(g, it), nc, kx, ky, null, sg > 0 ? [edge, 1e5] : [-1e5, edge]) : gclip(g, it, nc, gCY(g, it), kx, ky, sg > 0 ? [edge, 1e5] : [-1e5, edge], null));
      return o;
    });
    const fa = (it.alpha ?? 1) * (1 - J.smooth(0.82, 0.98, p)), back = mixC(c0, bg, 0.55), hi = mixC(c0, bg, 0.25), lo = mixC(c0, bg, 0.8);
    if (fa <= 0.01) return;
    chainPost(it, (env2, it2) => {
      inItem(env2, it2, () => {
        const lift = E.inCubic(J.clamp((p - 0.8) / 0.18)), cm = (c0x + c1x) / 2;       // finally the roll is lifted away (shrinks to its middle)
        const ext0 = J.lerp(c0x - sz * 0.06, cm, lift), ext1 = J.lerp(c1x + sz * 0.06, cm, lift), x0 = Xr - r * (1 - lift), w = 2 * r * (1 - lift);
        if (w < 0.3 || ext1 - ext0 < 0.3) return;
        const R = (s0, s1, col, a) => (vert ? env2.rect(ext0, x0 + s0 * w, ext1 - ext0, (s1 - s0) * w, col, a, false) : env2.rect(x0 + s0 * w, ext0, (s1 - s0) * w, ext1 - ext0, col, a, false));
        R(0, 1, back, fa); R(0.18, 0.38, hi, fa); R(0.72, 1, lo, fa);
      });
    });
  },
};

/* train: the line runs along itself, bends round a curve and leaves the screen, every glyph following the one before */
X.snakeOut = {
  name: '列になって去る', tags: ['calm', 'pop'], w: 0.9, ae: 'stretch', minDur: 0.8,
  outDur: dur => J.clamp(dur * 0.45, 0.38, 0.9),
  apply(env, it, p) {
    const sz = it.size, rev = cutBit(env, 231), n = cutBit(env, 232) ? 1 : -1, W = env.W, H = env.H;
    const d = (a2, o, aEnd, R) => {                 // path point for along-coordinate a2 and offset o → [a, o, rotDeg]
      if (a2 <= aEnd) return [a2, o, 0];
      const s = a2 - aEnd, arc = R * Math.PI / 2;
      if (s <= arc) { const f = s / R, ca = Math.cos(f), sa = Math.sin(f); return [aEnd + R * sa - n * sa * o, n * R * (1 - ca) + ca * o, n * f / DEG]; }
      return [aEnd + R - n * o, n * (R + s - arc), n * 90];
    };
    const ease = x => 0.35 * x * x + 0.65 * Math.pow(x, 2.4);
    if (isSingle(env, it)) {
      const ux = rev ? -1 : 1, aEnd = rev ? -W * 0.1 : W * 0.9, R = Math.min(W, H) * 0.2;
      const a = it.x * ux, o = (it.y - H / 2) * ux;   // v = rot90(u) = (0, ux)
      const Dt = W * 1.2 + R * 2 + H * 0.8, [na, no, rd] = d(a + Dt * ease(p), o, aEnd, R);
      it.x = na * ux; it.y = H / 2 + no * ux; it.rot = (it.rot || 0) + rd;
      return;
    }
    const vert = !!it.vertical, b = lBox(it);
    let u = vert ? [0, 1] : [1, 0]; if (rev) u = [-u[0], -u[1]];
    const v = [-u[1], u[0]];
    const lay = layOf(it);
    let aMin = 1e9, aMax = -1e9;
    for (const g of lay) { const a = gCX(g, it) * u[0] + gCY(g, it) * u[1]; aMin = Math.min(aMin, a); aMax = Math.max(aMax, a); }
    const aEnd = aMax + sz * 0.5, R = sz * 1.3, oc = b.cx * v[0] + b.cy * v[1];
    const Dt = (aEnd - aMin) + R * 2 + Math.max(W, H) * 0.75;
    const trav = Dt * ease(p);
    addC(it, (i, g) => {
      const gx = gCX(g, it), gy = gCY(g, it), a = gx * u[0] + gy * u[1], o = gx * v[0] + gy * v[1] - oc;
      const [na, no, rd] = d(a + trav, o, aEnd, R);
      const X2 = u[0] * na + v[0] * (no + oc), Y2 = u[1] * na + v[1] * (no + oc);
      return { dx: X2 - gx, dy: Y2 - gy, rot: rd };
    });
    it.alpha = (it.alpha ?? 1) * (1 - J.smooth(0.9, 1, p));
  },
};

/* paper leaves: glyphs detach one by one and flutter down, swaying, tilting and flipping over */
X.flutterOut = {
  name: 'ひらひら落ちる', tags: ['emotional', 'calm'], w: 1, ae: 'fall', minDur: 0.8,
  outDur: dur => J.clamp(dur * 0.48, 0.42, 1.0),
  apply(env, it, p) {
    const seed = it.seed | 0, sz = it.size, bb = dBox(it, 0), D = env.H - bb.y0 + sz * 1.2, c0 = colOf(it), back = mixC(c0, env.sc.bg, 0.45);
    addC(it, (i) => {
      const q = win(p, J.r(seed, i, 241), 0.5);
      if (q <= 0) return null;
      if (q >= 1) return HIDE;
      const ph = J.r(seed, i, 242) * TAU, w = 7 + 4 * J.r(seed, i, 243), amp = Math.min(1, q * 4);
      const sway = Math.sin(q * w + ph) * sz * 0.55 * amp, L = D * (0.25 * q + 0.75 * Math.pow(q, 1.6));
      const flip = Math.cos(q * (9 + 5 * J.r(seed, i, 244)) + ph * 0.5);
      const [dx, dy] = dirI(it, sway, L);
      const shiver = q < 0.08 ? Math.sin(q * 300) * 6 * (1 - q / 0.08) : 0;
      return { dx, dy, rot: Math.cos(q * w + ph) * 28 * amp + shiver, sx: J.lerp(1, flip, amp), color: flip < 0 && amp > 0.5 ? back : undefined };
    });
  },
};

/* rolling boxes: each glyph tips over its corner and rolls away like a die, leading edge first */
X.rollOff = {
  name: '転がって去る', tags: ['pop'], w: 0.8, ae: 'scatter', minDur: 0.8,
  outDur: dur => J.clamp(dur * 0.45, 0.38, 0.9),
  apply(env, it, p) {
    const dir = cutBit(env, 251) ? 1 : -1, sz = it.size, ord = orderOf(env, it), sx0 = it.sx || 1, sy0 = it.sy || 1;
    const [rx, ry] = rightI(it), [dnx, dny] = downI(it);
    addC(it, (i, g, n) => {
      const o = dir > 0 ? 1 - ord(i, n) : ord(i, n);
      const q = win(p, o, 0.45);
      if (q <= 0) return null;
      if (q >= 1) return HIDE;
      const [gxD] = toD(it, gCX(g, it), gCY(g, it));
      const dist = dir > 0 ? env.W - gxD + sz * 1.3 : gxD + sz * 1.3;
      const r = Math.max(g.w * sx0, sz * sy0 * 0.8) / 2;
      const along = dist * Math.pow(q, 1.7), th = along / r;                 // rolling without slipping
      const ph = ((th % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
      const rise = r * (Math.SQRT2 * Math.cos(ph - Math.PI / 4) - 1);        // the centre rides up over each corner
      return { dx: rx * dir * along - dnx * rise, dy: ry * dir * along - dny * rise, rot: dir * th / DEG };
    });
  },
};

/* folding fan: the line bends into an arc round a pivot, then the ribs close onto one edge and the fan shrinks away */
X.fanClose = {
  name: '扇を閉じる', tags: ['graphic', 'editorial', 'emotional'], w: 0.9, ae: 'shrink', minDur: 0.8,
  outDur: dur => J.clamp(dur * 0.44, 0.36, 0.85),
  apply(env, it, p) {
    const sz = it.size, rev = cutBit(env, 261), bend = E.inOutSine(J.clamp(p / 0.3)), close = E.inOutCubic(J.clamp((p - 0.24) / 0.5));
    const fin = J.clamp((p - 0.72) / 0.28), fs = 1 - 0.75 * E.inQuad(fin), alpha = 1 - J.smooth(0.8, 0.99, p);
    const spin = (rev ? 1 : -1) * 0.5 * E.inQuad(fin);
    /* a = along the line from the centre, w = offset towards the pivot (which sits R away on that side) */
    const place = (a, w, R, aLim) => {
      const alT = J.lerp(a / R, aLim, close) + spin, rr = (R - w);
      return [J.lerp(a, Math.sin(alT) * rr, bend), J.lerp(w, R - Math.cos(alT) * rr, bend), alT * bend / DEG];
    };
    if (isSingle(env, it)) {
      const W = env.W, H = env.H, R = W * 0.55, aLim = (rev ? 1 : -1) * W * 0.45 / R;
      const [na, nw, rd] = place(it.x - W / 2, it.y - H / 2, R, aLim);
      const N = cutN(env), lead = Math.round(+it.mi || 0) === (rev ? N - 1 : 0);
      it.x = W / 2 + na; it.y = H / 2 + nw; it.rot = (it.rot || 0) + rd;
      it.size *= fs; it._m = null; it.alpha = (it.alpha ?? 1) * alpha * (lead ? 1 : 1 - J.smooth(0.55, 0.95, close));
      return;
    }
    const vert = !!it.vertical, b = lBox(it), lay = layOf(it);
    const u = vert ? [0, 1] : [1, 0], v = [-u[1], u[0]];          // pivot on the +v side: below horizontal text, left of vertical
    const ac = b.cx * u[0] + b.cy * u[1], oc = b.cx * v[0] + b.cy * v[1];
    let aMin = 1e9, aMax = -1e9;
    for (const g of lay) { const a = gCX(g, it) * u[0] + gCY(g, it) * u[1] - ac; aMin = Math.min(aMin, a); aMax = Math.max(aMax, a); }
    const half = Math.max(sz, (aMax - aMin) / 2), R = Math.max(sz * 2, half * 1.15);
    const aLim = (rev ? aMax : aMin) / R;
    addC(it, (i, g) => {
      const gx = gCX(g, it), gy = gCY(g, it);
      const a = gx * u[0] + gy * u[1] - ac, [na, nw, rd] = place(a, gx * v[0] + gy * v[1] - oc, R, aLim);
      const lead = Math.abs(a / R - aLim) < 1e-3;
      return { dx: u[0] * (na + ac) + v[0] * (nw + oc) - gx, dy: u[1] * (na + ac) + v[1] * (nw + oc) - gy, rot: rd, s: fs, a: alpha * (lead ? 1 : 1 - J.smooth(0.55, 0.95, close)) };
    });
  },
};

/* colour separation: the text splits into its ghost / accent channels which drift apart with a jitter and fade */
X.rgbSplitOut = {
  name: '色分解', tags: ['glitch', 'pop'], w: 0.9, ae: 'glitch',
  apply(env, it, p) {
    const sc = env.sc, sz = it.size, seed = it.seed | 0, step = env.step, dark = darkBg(env);
    const cols = [sc.ghostA || sc.accent, sc.ghostB || sc.fg, sc.accent];
    const e = E.inCubic(p), sp = sz * (0.05 + 1.5 * e);
    const dirs = [[-1, -0.3], [1, 0.25], [0.15, 0.9]];
    const a0 = it.alpha ?? 1, ca = a0 * J.smooth(0, 0.1, p) * (1 - J.smooth(0.55, 0.96, p));
    it.alpha = a0 * (1 - J.smooth(0.05, 0.35, p));
    chainPost(it, (env2, it2) => {
      if (env2.pass !== 'main' || ca <= 0.01) return;
      for (let k = 0; k < 3; k++) {
        const jx = J.rs(seed, step, k, 271) * sz * 0.06 * (0.3 + e), jy = J.rs(seed, step, k, 272) * sz * 0.015;
        const [ox, oy] = [dirs[k][0] * sp + jx, dirs[k][1] * sp * 0.5 + jy];
        J.drawItem(env2, copyOf(it2, { x: it2.x + ox, y: it2.y + oy, size: it2.size * (1 + 0.08 * k * e), _m: null, _lay: null, color: cols[k], gradient: null, pattern: null, shadow: null, extrude: null,
          alpha: ca * (k === 2 ? 0.8 : 0.9), blend: dark ? 'screen' : 'multiply', fill: true }));
      }
    });
  },
};

/* shockwave: an implosion, then a ring bursts outward and every glyph is blown away as the ring passes it */
X.shockOut = {
  name: '衝撃波', tags: ['pop', 'graphic'], w: 0.9, ae: 'explode',
  apply(env, it, p) {
    const sz = it.size, seed = it.seed | 0, acc = env.sc.accent, single = isSingle(env, it);
    const pre = Math.sin(Math.PI * J.clamp(p / 0.16)) * (p < 0.16 ? 1 : 0);
    const push = (dd, i) => {                      // → [radial displacement, scale, alpha, rot]
      const passed = r - dd;
      if (passed <= 0) return [-pre * sz * 0.08, 1 - 0.05 * pre, 1, 0];
      const k = 1 - Math.exp(-passed / (sz * 0.7));
      return [sz * 1.6 * k, 1 + 0.2 * Math.exp(-passed / (sz * 0.25)) - 0.45 * J.smooth(0, sz * 2, passed), 1 - J.smooth(sz * 0.15, sz * 1.5, passed), J.rs(seed, i, 281) * 50 * k];
    };
    let r, Rmax, C;
    if (single) {
      C = [env.W / 2, env.H / 2]; Rmax = Math.hypot(env.W, env.H) * 0.55;
      r = Rmax * E.outCubic(J.clamp((p - 0.12) / 0.88));
      const dx = it.x - C[0], dy = it.y - C[1], dd = Math.hypot(dx, dy) || 1, [m, s, a, rt] = push(dd, +it.mi || 0);
      it.x += dx / dd * m; it.y += dy / dd * m; it.size *= Math.max(0.05, s); it._m = null; it.rot = (it.rot || 0) + rt; it.alpha = (it.alpha ?? 1) * a;
      if (Math.round(+it.mi || 0) !== 0) return;
    } else {
      const b = lBox(it);
      C = toD(it, b.cx, b.cy); Rmax = Math.hypot(b.w, b.h) / 2 + sz * 1.8;
      r = Rmax * E.outCubic(J.clamp((p - 0.12) / 0.88));
      addC(it, (i, g) => {
        const dx = gCX(g, it) - b.cx, dy = gCY(g, it) - b.cy, dd = Math.hypot(dx, dy) || 1, [m, s, a, rt] = push(dd, i);
        return { dx: dx / dd * m, dy: dy / dd * m, s: Math.max(0.05, s), a, rot: rt };
      });
    }
    if (r <= 0.5 || !primary(it)) return;
    const fa = 1 - J.smooth(0.3, 1, p);
    chainPost(it, (env2) => {
      env2.circle(C[0], C[1], r, null, acc, Math.max(1.5, sz * 0.09 * fa), fa, false);
      env2.circle(C[0], C[1], r * 0.82, null, acc, Math.max(1, sz * 0.025 * fa), fa * 0.6, false);
    });
  },
};

/* flood: a wavy water line rises through the text; what is under water wobbles, tints and sinks out of sight */
X.floodOut = {
  name: '水没', tags: ['emotional', 'calm'], w: 0.9, ae: 'wipe',
  outDur: dur => J.clamp(dur * 0.4, 0.32, 0.8),
  apply(env, it, p) {
    const sz = it.size, t = env.ltb, acc = env.sc.accent, c0 = colOf(it), single = isSingle(env, it), H = env.H;
    const bb = dBox(it, sz * 0.15), U = single ? H * 0.12 : sz, A = U * 0.07;
    const e = E.inOutSine(J.clamp(p / 0.9));
    const Y = single ? J.lerp(H * 0.74, H * 0.24, e) : J.lerp(bb.y1 + A * 2, bb.y0 - A * 3, e);
    const K = J.clamp(Math.ceil(bb.w / (U * 0.12)), 8, 80), x0 = bb.x0 - sz * 0.2, x1 = bb.x1 + sz * 0.2;
    const surf = [];
    for (let k = 0; k <= K; k++) { const x = J.lerp(x0, x1, k / K); surf.push([x, Y + A * Math.sin(x / U * 4.2 + t * 5) + A * 0.5 * Math.sin(x / U * 9.5 - t * 7.3)]); }
    if (Y < bb.y0 - A * 2) { it.alpha = 0; }
    const above = ctx => { surf.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.lineTo(x1, -H * 2); ctx.lineTo(x0, -H * 2); ctx.closePath(); };
    const below = ctx => { surf.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.lineTo(x1, H * 3); ctx.lineTo(x0, H * 3); ctx.closePath(); };
    it.clipFn = above;
    const a0 = it.alpha ?? 1, uw = (1 - J.smooth(0.3, 0.95, p)) * 0.5, fa = 1 - J.smooth(0.82, 0.98, p);
    chainPost(it, (env2, it2) => {
      if (uw > 0.01 && env2.pass === 'main') {    // under the surface: refracted, tinted, fading
        const n = 6, h = bb.h + sz, out = [];
        for (let j = 0; j < n; j++) { const y = bb.y0 - sz * 0.5 + j * h / n; out.push([y, y + h / n + 0.4, Math.sin(y / sz * 7 + t * 6) * sz * 0.04]); }
        J.drawFx(env2, copyOf(it2, { y: it2.y + sz * 0.05, alpha: a0 * uw, color: mixC(c0, acc, 0.55), gradient: null, pattern: null, shadow: null, clipFn: below, bands: out }));
      }
      if (env2.pass !== 'main' || fa <= 0.01) return;
      env2.line(surf, acc, Math.max(4, U * 0.1), 0.15 * fa, false);
      env2.line(surf, acc, Math.max(1.5, U * 0.028), fa, false);
      for (let j = 0; j < 7; j++) {                 // bubbles rising to the surface
        const x = J.lerp(x0, x1, J.r(it2.seed | 0, j, 291)), ph = ((p * 2.2 + J.r(it2.seed | 0, j, 292)) % 1);
        const y = Y + A + (1 - ph) * sz * 0.9;
        if (y > bb.y1 + sz * 0.3) continue;
        env2.circle(x + Math.sin(ph * 9 + j) * sz * 0.03, y, Math.max(1, sz * 0.03 * (0.5 + ph)), null, acc, Math.max(1, sz * 0.01), 0.7 * fa * (1 - ph * 0.5), false);
      }
    });
  },
};

/* one clean sword stroke: a flash along the line, a beat, then the upper half slides off along the cut */
X.slashOut = {
  name: '一刀両断', tags: ['graphic', 'emotional', 'pop'], w: 1, ae: 'slice',
  outDur: dur => J.clamp(dur * 0.4, 0.32, 0.8),
  apply(env, it, p) {
    const sz = it.size, vert = !!it.vertical, acc = env.sc.accent, b = lBox(it, sz * 0.2), seed = it.seed | 0;
    const tilt = (cutBit(env, 301) ? 1 : -1) * (vert ? 16 + 8 * cutR(env, 302) : 7 + 5 * cutR(env, 302));
    const th = ((vert ? 90 : 0) + tilt) * DEG, d = [Math.cos(th), Math.sin(th)], n = [-d[1], d[0]];
    const c = [b.cx, b.cy], L = Math.hypot(b.w, b.h) + sz * 4;
    const halfL = sign => { const o = [c[0] + n[0] * sign * L, c[1] + n[1] * sign * L]; return [[c[0] - d[0] * L, c[1] - d[1] * L], [c[0] + d[0] * L, c[1] + d[1] * L], [o[0] + d[0] * L, o[1] + d[1] * L], [o[0] - d[0] * L, o[1] - d[1] * L]]; };
    const lower = halfL(1), upper = halfL(-1);    // +n = the side below the cut for horizontal text
    const down = d[1] > 0 ? d : [-d[0], -d[1]];   // downhill along the cut
    const fl = J.clamp(p / 0.12), gap = J.smooth(0.12, 0.3, p), v = J.clamp((p - 0.3) / 0.7);
    const slide = sz * 0.06 * gap + sz * 2.2 * E.inQuad(v), a0 = it.alpha ?? 1;
    const [ux, uy] = rot2(down[0] * slide - n[0] * sz * 0.05 * gap, down[1] * slide - n[1] * sz * 0.05 * gap, (it.rot || 0) * DEG);
    const [lx, ly] = rot2(-down[0] * sz * 0.35 * E.inQuad(v) + n[0] * sz * 0.03 * gap, -down[1] * sz * 0.35 * E.inQuad(v) + n[1] * (sz * 0.03 * gap + sz * 0.5 * E.inQuad(v)), (it.rot || 0) * DEG);
    const X0 = it.x, Y0 = it.y;
    it.x = X0 + lx; it.y = Y0 + ly;
    it.alpha = a0 * (1 - J.smooth(0.5, 0.95, p));
    it.clipFn = (ctx, e2, it3) => polyL(ctx, it3, lower);
    const ua = a0 * (1 - J.smooth(0.62, 0.98, p));
    chainPost(it, (env2, it2) => {
      J.drawFx(env2, copyOf(it2, { x: X0 + ux, y: Y0 + uy, alpha: ua, clipFn: (ctx, e3, it3) => polyL(ctx, it3, upper) }));
      if (env2.pass !== 'main') return;
      const fa = 1 - J.smooth(0.12, 0.34, p);
      if (fa <= 0.01) return;
      const ext = (vert ? b.h : b.w) / 2 + sz * 0.9, P0 = [c[0] - d[0] * ext, c[1] - d[1] * ext], P1 = [c[0] + d[0] * ext, c[1] + d[1] * ext];
      const st = cutBit(env2, 303), A = st ? P1 : P0, B = st ? P0 : P1, e = E.outExpo(fl);
      const tail = J.smooth(0.08, 0.3, p);
      const S = [J.lerp(A[0], B[0], tail), J.lerp(A[1], B[1], tail)], T = [J.lerp(A[0], B[0], e), J.lerp(A[1], B[1], e)];
      inItem(env2, { x: X0, y: Y0, rot: it2.rot }, () => {
        env2.line([S, T], acc, Math.max(2, sz * 0.09 * fa), 0.35 * fa, false);
        env2.line([S, T], acc, Math.max(1.5, sz * 0.03 * fa), fa, false);
      });
    });
  },
};

/* mosaic: the text is pixelated into ever larger blocks (an off-screen low-res copy scaled up without smoothing) */
let MOS = null;
X.mosaicOut = {
  name: 'モザイク', tags: ['glitch', 'graphic'], w: 0.9, ae: 'glitch',
  apply(env, it, p) {
    const sz = it.size, blk = sz * (0.01 + 0.34 * Math.pow(p, 1.5));
    if (blk * (env.scale || 1) < 1.6) return;
    const a0 = it.alpha ?? 1, fade = 1 - J.smooth(0.55, 0.97, p), bb = dBox(it, sz * 0.15);
    it.alpha = 0;
    chainPost(it, (env2, it2) => {
      if (env2.pass !== 'main' || typeof document === 'undefined') return;      // one off-screen pass per frame; the chroma ghosts drop out
      let b = blk, ow = Math.ceil(bb.w / b), oh = Math.ceil(bb.h / b);
      if (ow > 360 || oh > 360) { b *= Math.max(ow, oh) / 360; ow = Math.ceil(bb.w / b); oh = Math.ceil(bb.h / b); }
      const cv = MOS || (MOS = document.createElement('canvas'));
      if (cv.width < ow + 2 || cv.height < oh + 2) { cv.width = Math.max(cv.width, ow + 2, 64); cv.height = Math.max(cv.height, oh + 2, 64); }
      const c2 = cv.getContext('2d');
      c2.setTransform(1, 0, 0, 1, 0, 0); c2.globalAlpha = 1; c2.globalCompositeOperation = 'source-over'; c2.filter = 'none'; c2.clearRect(0, 0, ow + 2, oh + 2);
      c2.setTransform(1 / b, 0, 0, 1 / b, -bb.x0 / b, -bb.y0 / b);
      J.drawItem(Object.assign({}, env2, { ctx: c2, scale: 1 / b, allowFilter: false }), copyOf(it2, { alpha: a0 * fade, blur: 0, shadow: null, blend: null }));
      const ctx = env2.ctx;
      ctx.save(); ctx.imageSmoothingEnabled = false;
      ctx.drawImage(cv, 0, 0, ow, oh, bb.x0, bb.y0, ow * b, oh * b);
      ctx.restore();
    });
  },
};

/* scribbled out: a thick marker scrawls back and forth over each line, then text and scribble fade together */
X.scribbleOut = {
  name: 'ぐしゃぐしゃ消し', tags: ['editorial', 'emotional', 'pop'], w: 0.8, ae: 'wipe',
  outDur: dur => J.clamp(dur * 0.4, 0.32, 0.8),
  apply(env, it, p) {
    const sz = it.size, seed = it.seed | 0, vert = !!it.vertical, acc = env.sc.accent, lines = lineExt(it);
    if (!lines.length) return;
    const paths = lines.map((L, li) => {
      const a0 = (vert ? L.y0 : L.x0) - sz * 0.15, a1 = (vert ? L.y1 : L.x1) + sz * 0.15, mid = vert ? (L.x0 + L.x1) / 2 : (L.y0 + L.y1) / 2;
      const half = (vert ? L.x1 - L.x0 : L.y1 - L.y0) / 2, len = a1 - a0, pts = [];
      const P = (a, o) => (vert ? [mid + o, a] : [a, mid + o]);
      let a = a0, k = 0;
      while (a < a1 && k < 200) {                  // forward: uneven strokes, the hand drifts up and down
        const drift = Math.sin(a / sz * 1.3 + li) * half * 0.18;
        pts.push(P(a, drift + (k & 1 ? 1 : -1) * half * (0.8 + 0.45 * J.r(seed, li, k, 312))));
        a += sz * (0.14 + 0.2 * J.r(seed, li, k, 311)); k++;
      }
      a = a1;
      while (a > a0 && k < 400) {                   // back again, flatter and faster, filling the gaps
        const drift = Math.sin(a / sz * 2.1 + li * 3) * half * 0.25;
        pts.push(P(a, drift + (k & 1 ? 1 : -1) * half * (0.45 + 0.4 * J.r(seed, li, k, 314))));
        a -= sz * (0.2 + 0.25 * J.r(seed, li, k, 313)); k++;
      }
      return pts;
    });
    const dr = E.inOutSine(J.clamp(p / 0.58));
    const lw = sz * 0.15 * (1 - 0.7 * J.smooth(0.62, 0.95, p)), sa = 1 - J.smooth(0.66, 0.97, p);
    it.alpha = (it.alpha ?? 1) * (1 - J.smooth(0.45, 0.75, p));
    chainPost(it, (env2, it2) => {
      if (env2.pass !== 'main' || sa <= 0.01) return;
      inItem(env2, it2, (ctx) => {
        ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = acc; ctx.lineWidth = Math.max(1, lw); ctx.globalAlpha = sa;
        for (const pts of paths) {
          let tot = 0; const seg = [];
          for (let k = 1; k < pts.length; k++) { const s2 = Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]); seg.push(s2); tot += s2; }
          let rem = tot * dr;
          ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
          for (let k = 1; k < pts.length && rem > 0; k++) {
            const s2 = seg[k - 1];
            if (rem >= s2) ctx.lineTo(pts[k][0], pts[k][1]);
            else { const f = rem / s2; ctx.lineTo(J.lerp(pts[k - 1][0], pts[k][0], f), J.lerp(pts[k - 1][1], pts[k][1], f)); }
            rem -= s2;
          }
          ctx.stroke();
        }
        ctx.restore();
      });
    });
  },
};

/* blown out like candles: a breath travels along the line, each glyph leans, flickers, goes out and leaves a curl of smoke */
X.candleOut = {
  name: '吹き消す', tags: ['emotional', 'calm'], w: 0.9, ae: 'drift',
  outDur: dur => J.clamp(dur * 0.45, 0.38, 0.9),
  apply(env, it, p) {
    const seed = it.seed | 0, sz = it.size, step = env.step, ord0 = orderOf(env, it), dir = cutBit(env, 321) ? 1 : -1;
    const ord = (i, n) => (dir > 0 ? ord0(i, n) : 1 - ord0(i, n));
    const warm = mixC(colOf(it), env.sc.accent, 0.5), sub = env.sc.sub, lay = layOf(it), sy0 = it.sy || 1;
    const U = (i, n) => (p - ord(i, n) * 0.42) / 0.5;
    addC(it, (i, g, n) => {
      const u = U(i, n);
      if (u <= 0) return null;
      if (u >= 0.45) return HIDE;
      const lean = Math.sin(Math.PI * Math.min(1, u / 0.45)), fl = J.r(seed, i, step, 322);
      return { skew: -dir * 22 * lean, dx: dir * sz * 0.06 * lean, color: warm, a: u > 0.3 ? (1 - (u - 0.3) / 0.15) * (fl < 0.5 ? 1 : 0.6) : 0.65 + 0.35 * fl, s: 1 + 0.04 * lean };
    });
    chainPost(it, (env2, it2) => {
      if (env2.pass !== 'main') return;
      inItem(env2, it2, () => {
        const [ux, uy] = dirI(it2, 0, -1), [rx, ry] = dirI(it2, 1, 0);
        for (const g of lay) {
          if (isSp(g.ch)) continue;
          const u = U(g.i, lay.N);
          if (u < 0.36 || u >= 1) continue;
          const age = (u - 0.36) / 0.64, tx = gCX(g, it2) + ux * g.h * sy0 * 0.4, ty = gCY(g, it2) + uy * g.h * sy0 * 0.4, pts = [];
          for (let k = 0; k <= 9; k++) {
            const f = k / 9, h = sz * (0.25 + 1.3 * age) * f, w = Math.sin(f * 5 + age * 7 + g.i) * sz * 0.09 * f + dir * sz * 0.4 * age * f;
            pts.push([tx + ux * h + rx * w, ty + uy * h + ry * w]);
          }
          env2.line(pts, sub, Math.max(1.2, sz * 0.03 * (1 - age * 0.5)), 0.9 * (1 - age), false);
        }
      });
    });
  },
};

/* ============================== registration ============================== */
/* safety net: whatever a recipe leaves at the very end, p≈1 is always fully gone */
for (const k of Object.keys(X)) {
  const f = X[k].apply;
  X[k].apply = (env, it, p, ctx) => { if (p >= 0.998) { it.alpha = 0; return; } f(env, it, p, ctx); };
  J.register('exit', k, X[k], P);
}

/* ============================== HOLDS ============================== */
const H = {};

/* candle glow: a warm halo that breathes and gutters irregularly, with a tiny upward lick of the glyphs */
H.glowFlicker = {
  name: '灯火のゆらぎ', tags: ['calm', 'emotional'], w: 0.5, ae: 'breathe',
  apply(env, it, amt) {
    const k = amt * motionK(env); if (k < 0.01) return;
    const t = env.ltb, seed = it.seed | 0, sz = it.size, kk = Math.min(1, k), sy0 = it.sy || 1;
    const f = 0.6 + 0.28 * J.noise1(t * 3.3, seed) + 0.12 * J.noise1(t * 11, seed + 5);
    const lvl = J.clamp(f * (1 - 0.45 * J.smooth(0.35, 0.8, J.noise1(t * 1.1, seed + 9))));
    const glow = darkBg(env) ? mixC(env.sc.accent, '#ffffff', 0.3) : env.sc.accent;
    if (env.pass === 'main' && !it.shadow && !it.extrude && !glyphBlur(it)) it.shadow = { color: J.rgba(glow, darkBg(env) ? 0.9 : 0.6), blur: sz * (0.06 + 0.3 * lvl) * kk, dx: 0, dy: -sz * 0.02 * lvl * kk };
    it.alpha = (it.alpha ?? 1) * (1 - 0.16 * (1 - lvl) * kk);
    it.color = mixC(colOf(it), env.sc.accent, 0.1 * lvl * kk);
    addC(it, (i, g) => {
      const st = 1 + 0.025 * k * (0.5 + 0.5 * J.noise1(t * 6 + i * 2.3, seed + i));
      return g.r90 ? { sx: st } : { sy: st, dy: -(st - 1) * sz * sy0 * 0.5 };
    });
  },
};

/* gusts: every couple of seconds a gust sweeps along the line, the glyphs lean and are pushed, then spring back */
H.windGust = {
  name: '突風', tags: ['pop', 'emotional'], w: 0.5, ae: 'wave',
  apply(env, it, amt) {
    const k = amt * motionK(env); if (k < 0.01) return;
    const cs = env.cut.seed | 0, sz = it.size, ord = orderOf(env, it);
    let cyc, since;
    if (env.beat && env.beat.len) { const L = env.beat.len, bi = env.beat.index - 1; cyc = Math.floor(bi / 4); since = (((bi % 4) + 4) % 4) * L + env.beat.since; }
    else { const per = 2.2, T = env.ltb - 0.5 - (cs % 5) * 0.06; cyc = Math.floor(T / per); since = T - cyc * per; }   // first gust ~0.5 s into the cut
    const dir = J.r(cs, cyc, 601) < 0.5 ? 1 : -1, str = 0.7 + 0.3 * J.r(cs, cyc, 602);
    addC(it, (i, g, n) => {
      const tau = since - (dir > 0 ? ord(i, n) : 1 - ord(i, n)) * 0.4;
      if (tau <= 0 || tau > 1.7) return null;
      const r = tau < 0.25 ? J.smooth(0, 0.25, tau) : tau < 0.6 ? 1 + 0.08 * Math.sin((tau - 0.25) * 30) : Math.cos((tau - 0.6) * 9) * Math.exp(-(tau - 0.6) * 4);
      return { dx: dir * sz * 0.12 * r * k * str, skew: -dir * 18 * r * k * str, rot: dir * 3 * r * k * str };
    });
  },
};

/* dangling: every glyph hangs from its own top edge and swings like a small pendulum, each at its own tempo */
H.dangle = {
  name: 'ぶら下がり', tags: ['calm', 'emotional'], w: 0.5, ae: 'wave',
  apply(env, it, amt) {
    const k = amt * motionK(env); if (k < 0.01) return;
    const t = env.ltb, seed = it.seed | 0, sz = it.size, sy0 = it.sy || 1, vert = !!it.vertical;
    addC(it, (i, g) => {
      const w = TAU * (0.5 + 0.28 * J.r(seed, i, 611)), ph = J.r(seed, i, 612) * TAU;
      const th = (6.5 * Math.sin(w * t + ph) + 1.6 * Math.sin(w * 2.7 * t + ph * 2)) * k * DEG;
      const hh = (vert ? g.h : sz) * sy0 / 2;      // pivot on the glyph's top edge
      return { dx: -hh * Math.sin(th), dy: hh * (Math.cos(th) - 1), rot: th / DEG };
    });
  },
};

/* equaliser: glyphs stretch up from their baseline like level-meter bars, driven by the song's loudness */
H.eqBounce = {
  name: '音圧で伸びる', tags: ['pop', 'graphic'], w: 0.5, ae: 'breathe',
  apply(env, it, amt) {
    const k = amt * motionK(env); if (k < 0.01) return;
    const t = env.ltb, seed = it.seed | 0, sz = it.size, sy0 = it.sy || 1, acc = env.sc.accent, c0 = colOf(it), vert = !!it.vertical;
    const base = env.energy != null ? J.clamp(env.energy * 1.2) : env.beat ? 0.25 + 0.75 * Math.exp(-env.beat.since * 7) : 0.45 + 0.4 * J.noise1(t * 2.6, seed);
    const mi = +it.mi || 0;
    addC(it, (i, g) => {
      const band = J.clamp(base * (0.3 + 0.7 * (0.5 + 0.5 * J.noise1(t * 6.5 + (i + mi) * 1.9, seed + 3))) * 1.15);
      const st = 1 + 0.32 * band * k, col = band > 0.72 ? mixC(c0, acc, (band - 0.72) / 0.28 * 0.7 * Math.min(1, k)) : undefined;
      if (vert) return g.r90 ? { sy: st, color: col } : { sx: st, color: col };
      return { sy: st, dy: -(st - 1) * sz * sy0 * 0.5, color: col };
    });
  },
};

/* beat flash: on every beat one glyph is punched out in inverse video — an accent block with the glyph knocked out */
H.flashBox = {
  name: '拍で反転', tags: ['pop', 'graphic', 'glitch'], w: 0.4, ae: 'glitchtick',
  apply(env, it, amt) {
    const k = amt * motionK(env); if (k < 0.35) return;
    const len = beatLen(env, 0.62), since = beatSince(env, 0.62), idx = beatIdx(env, 0.62);
    const u = since / (len * 0.6); if (u >= 1) return;
    const N = cutN(env), lay = layOf(it), vis = lay.filter(g => !isSp(g.ch));
    if (!vis.length) return;
    const pick = J.h(env.cut.seed | 0, idx, 621) % N;
    let g;
    if (isSingle(env, it)) { if (Math.round(+it.mi || 0) !== pick) return; g = vis[0]; }
    else g = vis[pick % vis.length];
    const pop = E.outBack(J.clamp(u / 0.18), 2.2), sz = it.size, sx0 = it.sx || 1, sy0 = it.sy || 1, acc = env.sc.accent, vert = !!it.vertical;
    const bg = J.fitContrast ? J.fitContrast(env.sc.bg, acc, 2.5) : env.sc.bg;
    addC(it, (i) => (i === g.i ? { color: bg, s: 1 + 0.05 * (1 - u) } : null));
    chainPre(it, (env2, it2) => {
      if (env2.pass !== 'main') return;
      inItem(env2, it2, () => {
        const w = (vert ? sz * sx0 : g.w * sx0) * 1.06 * pop, h = (vert ? g.h * sy0 : sz * sy0) * 1.06 * pop;
        env2.rect(gCX(g, it2) - w / 2, gCY(g, it2) - h / 2, w, h, acc, 1, false);
      });
    });
  },
};

/* glint: now and then a slanted band of light slides across the letters */
H.glintSweep = {
  name: '光沢', tags: ['graphic', 'calm'], w: 0.5, ae: 'still',
  apply(env, it, amt) {
    const k = amt * motionK(env); if (k < 0.05 || env.pass !== 'main') return;
    const per = 2.4, T = env.ltb - 0.5 - (+it.mi || 0) * 0.04, u = ((T % per) + per) % per / 0.75;   // first sweep ~0.5 s into the cut
    if (u >= 1) return;
    const sz = it.size, bb = dBox(it, sz * 0.2), c0 = colOf(it);
    const gc = J.lum(c0) > 0.72 ? env.sc.accent : mixC(c0, '#ffffff', 0.85);
    const bw = sz * 0.34, sl = bb.h * 0.45, x = J.lerp(bb.x0 - bw - sl, bb.x1 + bw + sl, E.inOutSine(u)), a = Math.min(1, k) * 0.9;
    chainPost(it, (env2, it2) => {
      const ctx = env2.ctx;
      ctx.save(); ctx.beginPath();
      const band = (x0, w) => { ctx.moveTo(x0 + sl, bb.y0); ctx.lineTo(x0 + sl + w, bb.y0); ctx.lineTo(x0 - sl + w, bb.y1); ctx.lineTo(x0 - sl, bb.y1); ctx.closePath(); };
      band(x - bw / 2, bw); band(x + bw * 0.75, bw * 0.28);
      ctx.clip();
      J.drawItem(env2, copyOf(it2, { color: gc, gradient: null, pattern: null, shadow: null, extrude: null, alpha: (it2.alpha ?? 1) * a }));
      ctx.restore();
    });
  },
};

/* flip swap: now and then one glyph flips over like a card, shows a stray katakana on its back, and flips home */
H.flipSwap = {
  name: '時々裏返る', tags: ['glitch', 'pop'], w: 0.4, ae: 'glitchtick',
  apply(env, it, amt) {
    const k = amt * motionK(env); if (k < 0.5) return;
    const cs = env.cut.seed | 0, per = 1.6, T = env.ltb - 0.45, cyc = Math.floor(T / per), u = (T - cyc * per) / 0.95;
    if (u >= 1) return;
    const N = cutN(env), lay = layOf(it), vis = lay.filter(g => !isSp(g.ch));
    if (!vis.length) return;
    const pick = J.h(cs, cyc, 631) % N;
    let gi;
    if (isSingle(env, it)) { if (Math.round(+it.mi || 0) !== pick) return; gi = vis[0].i; }
    else gi = vis[pick % vis.length].i;
    const ch = J.pool('kana')[J.h(cs, cyc, 632) % J.pool('kana').length], acc = env.sc.accent;
    let sx, alt;
    if (u < 0.18) { sx = Math.cos(u / 0.18 * Math.PI / 2); alt = false; }
    else if (u < 0.36) { sx = Math.sin((u - 0.18) / 0.18 * Math.PI / 2); alt = true; }
    else if (u < 0.64) { sx = 1; alt = true; }
    else if (u < 0.82) { sx = Math.cos((u - 0.64) / 0.18 * Math.PI / 2); alt = true; }
    else { sx = Math.sin((u - 0.82) / 0.18 * Math.PI / 2); alt = false; }
    sx = Math.max(0.02, sx);
    addC(it, (i, g) => (i === gi ? Object.assign(g.r90 ? { sy: sx } : { sx }, alt ? { ch, color: acc } : null) : null));
  },
};

/* swaying shadow: a long soft shadow that swings slowly as if the light source were moving */
H.shadowSway = {
  name: '影が揺れる', tags: ['calm', 'emotional'], w: 0.5, ae: 'drift',
  apply(env, it, amt) {
    const k = amt * motionK(env); if (k < 0.01 || it.extrude || env.pass !== 'main') return;
    const t = env.ltb, seed = it.seed | 0, sz = it.size;
    const ang = (60 + 45 * Math.sin(t * TAU / 5.5 + (seed % 10))) * DEG, L = sz * (0.12 + 0.05 * Math.sin(t * TAU / 3.3 + 1)) * Math.min(1.3, k);
    const col = darkBg(env) ? mixC(env.sc.bg, env.sc.accent, 0.42) : mixC(env.sc.bg, colOf(it), 0.3);
    it.extrude = { n: 12, dx: Math.cos(ang) * L, dy: Math.sin(ang) * L, color: col, fade: true, a: 0.9 };
  },
};

/* magnetism: an invisible magnet wanders round the text; nearby glyphs lean and buzz towards it */
H.magnetJiggle = {
  name: '磁力', tags: ['pop', 'glitch'], w: 0.4, ae: 'jitter',
  apply(env, it, amt) {
    const k = amt * motionK(env); if (k < 0.01) return;
    const t = env.ltb, seed = it.seed | 0, sz = it.size, step = env.step;
    let Mx, My, toItem = null;
    if (isSingle(env, it)) {
      const W = env.W, H = env.H;
      const [X2, Y2] = [W / 2 + Math.sin(t * 0.9 + (env.cut.seed % 9)) * W * 0.36, H / 2 + Math.sin(t * 1.7 + 1) * H * 0.12];
      [Mx, My] = toL(it, X2, Y2); toItem = true;
    } else {
      const b = lBox(it);
      Mx = b.cx + Math.sin(t * 0.9 + (seed % 9)) * b.w * 0.5; My = b.cy + Math.sin(t * 1.7 + 1) * b.h * 0.9;
    }
    addC(it, (i, g) => {
      const gx = toItem ? 0 : gCX(g, it), gy = toItem ? 0 : gCY(g, it), vx = Mx - gx, vy = My - gy, d = Math.hypot(vx, vy) || 1;
      const f = 1 / (1 + Math.pow(d / (sz * 1.1), 2)), pull = sz * 0.2 * f * k;
      const buzz = f > 0.35 ? J.rs(seed, step, i, 641) * sz * 0.014 * k * f : 0;
      return { dx: vx / d * pull + buzz, dy: vy / d * pull, rot: (vx / d) * 7 * f * k };
    });
  },
};

/* typewriter: an uneven, hand-struck baseline; on each beat a few keys are struck again — a dip, then a new resting place */
H.typeRattle = {
  name: 'タイプの震え', tags: ['editorial', 'glitch'], w: 0.5, ae: 'jitter',
  apply(env, it, amt) {
    const k = amt * motionK(env); if (k < 0.01) return;
    const idx = beatIdx(env, 0.45), since = beatSince(env, 0.45), seed = it.seed | 0, sz = it.size, kk = Math.min(1, k);
    addC(it, (i) => {
      let ep = -1;
      for (let b = idx; b > idx - 7; b--) if (J.r(seed, b, i, 651) < 0.3) { ep = b; break; }
      const hit = ep === idx && since < 0.1 ? 1 - since / 0.1 : 0;
      return { dy: J.rs(seed, ep, i, 652) * sz * 0.045 * k + hit * sz * 0.04 * k, dx: J.rs(seed, ep, i, 655) * sz * 0.01 * k, rot: J.rs(seed, ep, i, 653) * 3.2 * k, a: 1 - 0.2 * J.r(seed, ep, i, 654) * kk - 0.15 * hit * kk };
    });
  },
};

/* rack focus: a plane of focus drifts along the line; glyphs away from it soften and grow slightly */
H.focusRack = {
  name: 'ピント送り', tags: ['calm', 'emotional'], w: 0.5, ae: 'breathe',
  apply(env, it, amt) {
    const k = amt * motionK(env); if (k < 0.01) return;
    const ord = orderOf(env, it), t = env.ltb, seed = it.seed | 0, sz = it.size, kk = Math.min(1, k);
    const fpos = 0.5 + 0.62 * Math.sin(t * TAU / 4.6 + ((env.cut.seed | 0) % 7));
    const maxB = env.pass === 'main' && env.allowFilter && !it.extrude ? Math.min(sz * 0.065, 18) * kk : 0;   // no per-glyph blur on extruded text (too costly)
    addC(it, (i, g, n) => {
      const df = J.clamp((Math.abs(ord(i, n) - fpos) - 0.1) / 0.5);
      if (df <= 0) return null;
      return { blur: maxB * df * df, a: 1 - 0.28 * df * kk, s: 1 + 0.035 * df * k };
    });
  },
};

/* plucked string: the line vibrates as a standing wave between its ends, plucked again every few beats and ringing down */
H.pluckString = {
  name: '弦の振動', tags: ['pop', 'emotional'], w: 0.4, ae: 'wave',
  apply(env, it, amt) {
    const k = amt * motionK(env); if (k < 0.01) return;
    let tau;
    if (env.beat && env.beat.len) tau = (((env.beat.index % 4) + 4) % 4) * env.beat.len + env.beat.since;
    else { const per = 2.4; tau = (((env.ltb - 0.45) % per) + per) % per; }
    const sz = it.size, A = sz * 0.18 * k * Math.exp(-tau * 1.7) * Math.min(1, tau / 0.04);
    if (A < 0.3) return;
    const vert = !!it.vertical, single = isSingle(env, it), N = cutN(env), mi = +it.mi || 0;
    const w1 = Math.cos(tau * TAU * 3.2), w2 = Math.cos(tau * TAU * 6.6 + 1);
    addC(it, (i, g) => {
      const x = single ? (mi + 1) / (N + 1) : (g.ci + 1) / (g.n + 1);
      const y = A * (Math.sin(Math.PI * x) * w1 + 0.3 * Math.sin(TAU * x) * w2);
      return vert ? { dx: y } : { dy: y };
    });
  },
};

for (const k of Object.keys(H)) J.register('hold', k, H[k], P);
})();

/* JIZURA pack: fxB — more post-processing / accent effects: lens, print, film, glitch and manga-style overlays */
(() => {
'use strict';
const E = J.E;
const PK = 'fxB';
const DEG = J.DEG, TAU = J.TAU, clamp = J.clamp;

/* ================= helpers ================= */
const isDark = c => J.lum(c) < 0.45;
const bell = k => Math.sin(Math.PI * clamp(k));
const evS = ev => J.h(Math.round(ev.t * 1000), 9127);
const ampOf = ev => clamp(ev.amp ?? 1, 0.3, 1.6);
// attack (0..a) → hold → release (b..1)
const ahr = (k, a, b, inE = E.outCubic, outE = E.inCubic) => (k < a ? inE(k / a) : k > b ? 1 - outE((k - b) / Math.max(1e-3, 1 - b)) : 1);
const hueD = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
const lightest = list => list.filter(Boolean).reduce((a, b) => (J.lum(b) > J.lum(a) ? b : a));
const darkest = list => list.filter(Boolean).reduce((a, b) => (J.lum(b) < J.lum(a) ? b : a));
// the most colourful scheme colour (falls back to a cool blue for monochrome schemes)
const vivid = (sc, fb = '#4FB8FF') => {
  let best = null, bv = 0.18;
  for (const c of [sc.accent, sc.accent2, sc.ghostA, sc.ghostB, sc.fg]) {
    if (!c) continue; const [, s, l] = J.toHsl(c), v = s * (1 - Math.abs(l - 0.55) * 1.1);
    if (v > bv) { bv = v; best = c; }
  }
  return best || fb;
};
// two hues for a duotone: the scheme's most colourful hue + a clearly different second one
const huePair = sc => {
  const cs = [sc.accent, sc.accent2, sc.ghostA, sc.ghostB, sc.fg, sc.bg].filter(Boolean)
    .map(c => { const [h, s, l] = J.toHsl(c); return { h, v: s * (1 - Math.abs(l - 0.5) * 1.2) }; }).sort((p, q) => q.v - p.v);
  if (!cs.length || cs[0].v < 0.15) return [330, 195];
  const B = cs.find(p => p.v > 0.15 && hueD(p.h, cs[0].h) > 50);
  return [cs[0].h, B ? B.h : cs[0].h + 170];
};

// module-level offscreen buffers (created once, resized only when the output size changes)
const BUF = [];
const buf = (i, w, h) => {
  w = Math.max(1, w | 0); h = Math.max(1, h | 0);
  let c = BUF[i];
  if (!c) { c = document.createElement('canvas'); BUF[i] = c; }
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  return c;
};
const cx2 = c => { const x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none'; x.imageSmoothingEnabled = true; return x; };
// |frame - bg| as a grey mask: ink bright on black (dark schemes) or ink dark on white (light schemes)
const greyMask = (T, S, sc, w, h, dk) => {
  const x = cx2(T);
  x.globalCompositeOperation = 'copy'; x.drawImage(S, 0, 0, w, h);
  x.globalCompositeOperation = 'difference'; x.fillStyle = sc.bg; x.fillRect(0, 0, w, h);
  x.globalCompositeOperation = 'saturation'; x.fillStyle = '#808080'; x.fillRect(0, 0, w, h);
  if (!dk) { x.globalCompositeOperation = 'difference'; x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h); }
  return T;
};
// the grey mask tinted `col` (add it with 'screen' on dark schemes, 'multiply' on light ones)
const tintMask = (T, M, col, dk) => {
  const x = cx2(T), w = T.width, h = T.height;
  x.globalCompositeOperation = 'copy'; x.drawImage(M, 0, 0);
  x.globalCompositeOperation = dk ? 'multiply' : 'screen'; x.fillStyle = col; x.fillRect(0, 0, w, h);
  return T;
};
// draw `img` scaled by s around (cx, cy)
const drawScaled = (ctx, img, s, cx, cy, cw, ch) => ctx.drawImage(img, 0, 0, img.width, img.height, cx - cx * s, cy - cy * s, cw * s, ch * s);

const fx = (k, d) => J.register('fx', k, Object.assign({}, d, {
  draw(ctx, ev, k2, I) { ctx.save(); try { d.draw(ctx, ev, clamp(k2), I); } finally { ctx.restore(); } },
}), PK);

/* ================= lens / optics ================= */
fx('radialChroma', { name: '放射色収差', tags: ['glitch', 'emotional', 'pop'], w: 0.9, dur: 4, amp: 1, mid: true, scratch: true, ae: 'chroma',
  draw(ctx, ev, k, I) {
    const { cw, ch, S, sc } = I; if (!S) return;
    const dk = isDark(sc.bg), s = evS(ev);
    const d = (0.03 + 0.016 * J.r(s, 1)) * ampOf(ev) * (0.4 + 0.6 * E.outQuad(k)) * (k > 0.8 ? 1 - (k - 0.8) * 2.5 : 1);
    const w = Math.max(2, Math.round(cw / 3)), h = Math.max(2, Math.round(ch / 3));
    const M = greyMask(buf(0, w, h), S, sc, w, h, dk), R = tintMask(buf(1, w, h), M, '#FF3020', dk), C = tintMask(buf(2, w, h), M, '#18E0FF', dk);
    const cx = cw / 2, cy = ch / 2;
    ctx.globalCompositeOperation = dk ? 'screen' : 'multiply';
    ctx.globalAlpha = 0.95; drawScaled(ctx, R, 1 + d, cx, cy, cw, ch); drawScaled(ctx, C, 1 - d * 0.7, cx, cy, cw, ch);
    ctx.globalAlpha = 0.45; drawScaled(ctx, R, 1 + d * 2.2, cx, cy, cw, ch);
  } });

fx('bloomFlash', { name: 'ブルーム', tags: ['pop', 'emotional', 'calm'], w: 1, dur: 6, amp: 1, mid: true, scratch: true, ae: 'flash',
  draw(ctx, ev, k, I) {
    const { cw, ch, S, sc } = I; if (!S) return;
    const a = clamp(ampOf(ev), 0.5, 1.3) * (k < 0.12 ? E.outCubic(k / 0.12) : Math.pow(1 - (k - 0.12) / 0.88, 1.5));
    if (a < 0.02) return;
    const dk = isDark(sc.bg);
    const w1 = Math.max(4, Math.round(cw / 6)), h1 = Math.max(4, Math.round(ch / 6)), w2 = Math.max(2, Math.round(cw / 24)), h2 = Math.max(2, Math.round(ch / 24));
    const T1 = buf(0, w1, h1), x1 = cx2(T1);
    x1.globalCompositeOperation = 'copy'; if (I.allowFilter) x1.filter = `blur(${Math.max(1, w1 / 220).toFixed(1)}px)`; x1.drawImage(S, 0, 0, w1, h1); x1.filter = 'none';
    const T2 = buf(1, w2, h2), x2 = cx2(T2);
    x2.globalCompositeOperation = 'copy'; if (I.allowFilter) x2.filter = 'blur(1.5px)'; x2.drawImage(T1, 0, 0, w2, h2); x2.filter = 'none';
    const cx = cw / 2, cy = ch / 2;
    if (dk) {
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = a; ctx.drawImage(T1, 0, 0, cw, ch);
      ctx.globalAlpha = Math.min(1, a * 1.25); drawScaled(ctx, T2, 1.05, cx, cy, cw, ch);
      ctx.globalAlpha = 1; ctx.fillStyle = J.rgba(sc.fg, (0.1 * a).toFixed(3)); ctx.fillRect(0, 0, cw, ch);
    } else {
      // light schemes: over-exposure — the bright paper blooms over the ink, everything lifts towards white
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.75 * a; ctx.drawImage(T1, 0, 0, cw, ch);
      ctx.globalAlpha = 0.5 * a; drawScaled(ctx, T2, 1.04, cx, cy, cw, ch);
    }
  } });

// separable lens warp: columns then rows, piecewise-linear strips (no seams)
fx('bulge', { name: '魚眼', tags: ['pop', 'graphic', 'glitch'], w: 0.8, dur: 5, amp: 1, mid: true, scratch: true, ae: 'zoom',
  draw(ctx, ev, k, I) {
    const { cw, ch, S } = I; if (!S) return;
    const s = evS(ev), pinch = J.r(s, 1) < 0.25;
    const amt = k < 0.3 ? E.outCubic(k / 0.3) : 1 - E.inOutCubic((k - 0.3) / 0.7);
    const A = clamp((pinch ? -0.26 : 0.27) * clamp(ampOf(ev), 0.5, 1.35) * amt, -0.36, 0.38);
    if (Math.abs(A) < 0.004) return;
    const cx = cw * (0.5 + J.rs(s, 2) * 0.05), cy = ch * (0.5 + J.rs(s, 3) * 0.04);
    const g = u => u * (1 - A * (1 - u * u));
    const map = (u, c, L) => c + u * (u < 0 ? c : L - c);
    const N = 40, T = buf(0, cw, ch), x = cx2(T);
    x.clearRect(0, 0, cw, ch);
    let p = 0, ps = 0;
    for (let i = 1; i <= N; i++) {
      const u = -1 + 2 * i / N, d = i === N ? cw : Math.round(map(u, cx, cw)), sx = i === N ? cw : map(g(u), cx, cw);
      if (d > p && sx > ps) x.drawImage(S, ps, 0, sx - ps, ch, p, 0, d - p, ch);
      p = d; ps = sx;
    }
    ctx.clearRect(0, 0, cw, ch);
    p = 0; ps = 0;
    for (let i = 1; i <= N; i++) {
      const u = -1 + 2 * i / N, d = i === N ? ch : Math.round(map(u, cy, ch)), sy = i === N ? ch : map(g(u), cy, ch);
      if (d > p && sy > ps) ctx.drawImage(T, 0, ps, cw, sy - ps, 0, p, cw, d - p);
      p = d; ps = sy;
    }
  } });

/* ================= glitch ================= */
// vertical "melt": runs of columns whose window is stretched down (or up), coherent via smooth noise
fx('pixelSort', { name: 'ピクセルソート', tags: ['glitch'], w: 0.8, dur: 3, amp: 1, glitchy: true, mid: true, scratch: true, ae: 'slice',
  draw(ctx, ev, k, I) {
    const { cw, ch, S } = I; if (!S) return;
    const a = ampOf(ev), s = evS(ev), st = I.step * 19 + s, up = J.r(s, 1) < 0.3;
    const xa = cw * J.rr(0.02, 0.35, st, 1), xb = Math.min(cw, xa + cw * J.rr(0.4, 0.7, st, 2));
    let x = Math.round(xa), i = 0;
    while (x < xb && i < 200) {
      const wr = Math.max(1, Math.round(cw * J.rr(0.002, 0.009, st, i, 3)));
      const on = J.noise1(x / cw * 9, st + 5) > -0.25 && J.r(st, i, 4) < 0.85;
      if (on) {
        const n1 = J.noise1(x / cw * 7, st + 9) * 0.5 + 0.5, n2 = J.noise1(x / cw * 23, st + 13) * 0.5 + 0.5;
        const win = ch * (0.08 + 0.12 * n1), str = 1 + (0.5 + 2 * n2) * a;
        if (!up) { const y0 = ch * (0.36 + 0.12 * n2), dh = Math.min(ch - y0, win * str); ctx.drawImage(S, x, y0, wr, win, x, y0, wr, dh); }
        else { const y1 = ch * (0.64 - 0.12 * n2), dh = Math.min(y1, win * str); ctx.drawImage(S, x, y1 - win, wr, win, x, y1 - dh, wr, dh); }
      }
      x += wr; i++;
    }
  } });

const ROWS = new Map();
const rowTile = L => {
  let t = ROWS.get(L); if (t) return t;
  t = document.createElement('canvas'); t.width = 1; t.height = 2 * L;
  const x = t.getContext('2d'); x.fillStyle = '#000'; x.fillRect(0, 0, 1, L);
  ROWS.set(L, t); return t;
};
fx('interlace', { name: 'インターレース', tags: ['glitch', 'emotional'], w: 0.7, dur: 3, amp: 1, glitchy: true, mid: true, scratch: true, ae: 'slice',
  draw(ctx, ev, k, I) {
    const { cw, ch, S, sc } = I; if (!S) return;
    const a = ampOf(ev), st = I.step * 7 + evS(ev), L = Math.max(1, Math.round(ch / 200));
    const dx = (J.r(st, 1) < 0.5 ? 1 : -1) * cw * (0.012 + 0.02 * J.r(st, 2)) * a * (1 - 0.45 * k);
    ctx.fillStyle = sc.bg; ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(S, Math.round(-dx * 0.35), 0);
    const T = buf(0, cw, ch), x = cx2(T);
    x.clearRect(0, 0, cw, ch); x.drawImage(S, Math.round(dx), 0);
    x.globalCompositeOperation = 'destination-in';
    const pat = x.createPattern(rowTile(L), 'repeat');
    try { pat.setTransform(new DOMMatrix([1, 0, 0, 1, 0, (I.step % 2) * L])); } catch (e) { /* older engines: no phase */ }
    x.fillStyle = pat; x.fillRect(0, 0, cw, ch);
    ctx.drawImage(T, 0, 0);
  } });

// compression artefacts: grid-aligned blocks go flat, smear down from their top row, quantise or slip
fx('macroBlock', { name: 'ブロックノイズ', tags: ['glitch'], w: 0.8, dur: 3, amp: 1, glitchy: true, mid: true, scratch: true, ae: 'block',
  draw(ctx, ev, k, I) {
    const { cw, ch, S, sc } = I; if (!S) return;
    const a = ampOf(ev), st = I.step * 23 + evS(ev), B = Math.max(6, Math.round(Math.min(cw, ch) / 18));
    const nx = Math.ceil(cw / B), ny = Math.ceil(ch / B), T = buf(3, 3, 3), tx = cx2(T);
    tx.globalCompositeOperation = 'copy';
    const nC = 2 + (J.h(st, 1) % 3);
    for (let c = 0; c < nC; c++) {
      const gw = Math.min(nx, 3 + (J.h(st, c, 2) % 7)), gh = 1 + (J.h(st, c, 3) % 3);
      const i0 = Math.floor(J.r(st, c, 4) * (nx - gw + 1)), j0 = Math.round(ny * (0.38 + 0.24 * J.r(st, c, 5)) - gh / 2);
      for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) {
        const id = i * 16 + j;
        if (J.r(st, c, id, 6) < 0.12) continue;
        const bx = (i0 + i) * B, by = clamp(j0 + j, 0, ny - 1) * B, bw = Math.min(B, cw - bx), bh = Math.min(B, ch - by), m = J.r(st, c, id, 7);
        if (bw < 1 || bh < 1) continue;
        if (m < 0.42) {           // datamosh bleed: the block's top row smeared down 1..3 blocks
          const n = 1 + (J.h(st, c, id, 9) % 3);
          ctx.drawImage(S, bx, by, bw, 1, bx, by, bw, Math.min(ch - by, B * n));
        } else if (m < 0.7) {     // quantised to 3×3 flat cells
          tx.drawImage(S, bx, by, bw, bh, 0, 0, 3, 3);
          ctx.imageSmoothingEnabled = false; ctx.drawImage(T, 0, 0, 3, 3, bx, by, bw, bh); ctx.imageSmoothingEnabled = true;
        } else if (m < 0.9) {     // slipped: copied from a neighbouring block
          const sx = clamp(bx + (J.r(st, c, id, 10) < 0.5 ? -1 : 1) * (1 + (J.h(st, c, id, 12) % 2)) * B, 0, cw - bw);
          ctx.drawImage(S, sx, by, bw, bh, bx, by, bw, bh);
        } else {                  // flat block
          ctx.drawImage(S, Math.min(cw - 1, bx + bw / 2), Math.min(ch - 1, by + bh / 2), 1, 1, bx, by, bw, bh);
        }
        if (m >= 0.42 && J.r(st, c, id, 8) < 0.06 * a) {
          ctx.globalCompositeOperation = 'difference'; ctx.globalAlpha = 0.3;
          ctx.fillStyle = J.r(st, c, id, 11) < 0.5 ? sc.ghostA : sc.ghostB; ctx.fillRect(bx, by, bw, bh);
          ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
        }
      }
    }
  } });

/* ================= print / stylise ================= */
const DOT = new Map();
const dotTile = (c, r) => {
  const key = c + '|' + r; let t = DOT.get(key); if (t) return t;
  t = document.createElement('canvas'); t.width = t.height = c;
  const x = t.getContext('2d'); x.fillStyle = '#000'; x.beginPath();
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { x.moveTo(c / 2 + i * c + r, c / 2 + j * c); x.arc(c / 2 + i * c, c / 2 + j * c, r, 0, TAU); }
  x.fill();
  if (DOT.size > 64) DOT.clear();
  DOT.set(key, t); return t;
};
fx('halftone', { name: '網点', tags: ['pop', 'graphic', 'editorial'], w: 0.9, dur: 5, amp: 1, mid: true, ae: 'mosaic',
  draw(ctx, ev, k, I) {
    const { cw, ch, sc } = I;
    const c = Math.max(5, Math.round(Math.min(cw, ch) / 44)), amt = ahr(k, 0.3, 0.72);
    const r = Math.round(c * J.lerp(0.72, 0.42, amt) * 4) / 4;
    if (r >= c * 0.71) return;
    const pat = ctx.createPattern(dotTile(c, r), 'repeat');
    try { const q = 45 * DEG; pat.setTransform(new DOMMatrix([Math.cos(q), Math.sin(q), -Math.sin(q), Math.cos(q), cw / 2, ch / 2])); } catch (e) { /* unrotated screen */ }
    ctx.globalCompositeOperation = 'destination-in'; ctx.fillStyle = pat; ctx.fillRect(0, 0, cw, ch);
    if (I.opt && I.opt.transparent) return;
    ctx.globalCompositeOperation = 'destination-over'; ctx.fillStyle = J.mix(sc.bg, sc.fg, 0.16); ctx.fillRect(0, 0, cw, ch);
  } });

fx('duotone', { name: 'ダブルトーン', tags: ['pop', 'emotional', 'graphic'], w: 0.8, dur: 4, amp: 1, mid: true, ae: 'chroma',
  draw(ctx, ev, k, I) {
    const { cw, ch, sc } = I, s = evS(ev);
    const a = clamp(ampOf(ev), 0.6, 1) * ahr(k, 0.12, 0.7);
    if (a < 0.02) return;
    let [h1, h2] = huePair(sc); if (J.r(s, 1) < 0.4) [h1, h2] = [h2, h1];
    const dark = J.hsl(h1, 0.8, 0.15), light = J.hsl(h2, 1, 0.76);
    ctx.globalAlpha = a;
    ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = light; ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = dark; ctx.fillRect(0, 0, cw, ch);
  } });

let BAYER = null;
const bayerTile = () => {
  if (BAYER) return BAYER;
  let M = [[0]];
  while (M.length < 8) { const n = M.length, N = []; for (let y = 0; y < 2 * n; y++) { N.push([]); for (let x = 0; x < 2 * n; x++) { const v = 4 * M[y % n][x % n]; N[y].push(v + [[0, 2], [3, 1]][y < n ? 0 : 1][x < n ? 0 : 1]); } } M = N; }
  const c = document.createElement('canvas'); c.width = c.height = 8;
  const x = c.getContext('2d');
  for (let y = 0; y < 8; y++) for (let i = 0; i < 8; i++) { const g = Math.round((M[y][i] + 0.5) / 64 * 127.5); x.fillStyle = `rgb(${g},${g},${g})`; x.fillRect(i, y, 1, 1); }
  BAYER = c; return c;
};
// ordered dither → hard threshold (contrast filter) → mapped to the scheme's darkest / lightest colour
fx('ditherBit', { name: '1bitディザ', tags: ['glitch', 'graphic', 'pop'], w: 0.7, dur: 3, amp: 1, mid: true, scratch: true, ae: 'mosaic',
  draw(ctx, ev, k, I) {
    const { cw, ch, S, sc } = I; if (!S) return;
    const p = Math.max(2, Math.round(ch / 200) * (k < 0.34 ? 2 : 1)), w = Math.ceil(cw / p), h = Math.ceil(ch / p);
    const T = buf(2, w, h), x = cx2(T);
    x.globalCompositeOperation = 'copy'; x.fillStyle = x.createPattern(bayerTile(), 'repeat'); x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'lighter'; x.globalAlpha = 0.5; x.drawImage(S, 0, 0, w, h);
    x.globalAlpha = 1; x.globalCompositeOperation = 'saturation'; x.fillStyle = '#808080'; x.fillRect(0, 0, w, h);
    const T2 = buf(3, w, h), y = cx2(T2);
    y.globalCompositeOperation = 'copy'; if (I.allowFilter) y.filter = 'contrast(60)'; y.drawImage(T, 0, 0); y.filter = 'none';
    const c0 = darkest([sc.bg, sc.fg, sc.ink]), c1 = lightest([sc.bg, sc.fg, sc.ink]);
    y.globalCompositeOperation = 'multiply'; y.fillStyle = c1; y.fillRect(0, 0, w, h);
    y.globalCompositeOperation = 'screen'; y.fillStyle = c0; y.fillRect(0, 0, w, h);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(T2, 0, 0, w, h, 0, 0, w * p, h * p); ctx.imageSmoothingEnabled = true;
  } });

/* ================= frame motion ================= */
fx('rotateSnap', { name: '傾きスナップ', tags: ['pop', 'graphic', 'glitch'], w: 0.9, dur: 5, amp: 1, mid: true, scratch: true, ae: 'shake',
  draw(ctx, ev, k, I) {
    const { cw, ch, S, sc } = I; if (!S) return;
    const s = evS(ev), dir = J.r(s, 1) < 0.5 ? 1 : -1;
    // snaps in on the first frame, then a damped spring back to level
    const e = k < 0.12 ? 1 : Math.exp(-4.5 * (k - 0.12)) * Math.cos((k - 0.12) * Math.PI * 2.4);
    const th = dir * (3 + 2 * J.r(s, 2)) * clamp(ampOf(ev), 0.5, 1.3) * e * DEG;
    if (Math.abs(th) < 0.0006) return;
    const c = Math.abs(Math.cos(th)), sn = Math.abs(Math.sin(th));
    const z = Math.max((cw * c + ch * sn) / cw, (cw * sn + ch * c) / ch) * (1 + 0.025 * Math.abs(e));
    ctx.fillStyle = sc.bg; ctx.fillRect(0, 0, cw, ch);
    ctx.translate(cw / 2, ch / 2); ctx.rotate(th); ctx.scale(z, z);
    ctx.drawImage(S, -cw / 2, -ch / 2);
    if (k < 0.12) { ctx.globalAlpha = 0.35; ctx.rotate(-th * 0.45); ctx.drawImage(S, -cw / 2, -ch / 2); }
  } });

// stepped after-images of the frame ('lighten' on dark schemes / 'darken' on light ones keeps the background untouched)
fx('echoFrames', { name: '残像エコー', tags: ['emotional', 'pop', 'glitch'], w: 0.9, dur: 6, amp: 1, mid: true, scratch: true, ae: 'zoom',
  draw(ctx, ev, k, I) {
    const { cw, ch, S, sc } = I; if (!S) return;
    const s = evS(ev), dk = isDark(sc.bg), a = clamp(ampOf(ev), 0.5, 1.3);
    const ang = J.r(s, 1) < 0.65 ? (J.r(s, 2) < 0.5 ? 0 : Math.PI) : (J.r(s, 3) < 0.5 ? 0.25 : 0.75) * Math.PI + (J.r(s, 2) < 0.5 ? 0 : Math.PI);
    const d = Math.min(cw, ch) * (0.02 + 0.035 * E.outCubic(k)) * a, fade = k < 0.1 ? 1 : 1 - E.inQuad((k - 0.1) / 0.9);
    if (fade < 0.02) return;
    ctx.globalCompositeOperation = dk ? 'lighten' : 'darken';
    for (let i = 4; i >= 1; i--) { ctx.globalAlpha = fade * (0.64 - i * 0.12); ctx.drawImage(S, Math.round(Math.cos(ang) * d * i), Math.round(Math.sin(ang) * d * i)); }
  } });

// n mirrored wedges around the centre (true kaleidoscope, not an axis mirror)
fx('kaleido', { name: '万華鏡', tags: ['pop', 'graphic', 'emotional'], w: 0.6, dur: 4, amp: 1, mid: true, scratch: true, ae: 'block',
  draw(ctx, ev, k, I) {
    const { cw, ch, S } = I; if (!S) return;
    const s = evS(ev), n = J.r(s, 1) < 0.5 ? 6 : 8, th = TAU / n, R = Math.hypot(cw, ch);
    const cx = cw / 2, cy = ch / 2, rot = J.r(s, 2) * TAU + k * 0.5 * (J.r(s, 3) < 0.5 ? 1 : -1), src = J.r(s, 4) < 0.5 ? 0 : Math.PI;
    const z = 1.05 + 0.12 * k;
    ctx.globalAlpha = k > 0.75 ? 1 - (k - 0.75) / 0.25 * 0.5 : 1;
    for (let i = 0; i < n; i++) {
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot + i * th); if (i % 2) ctx.scale(1, -1);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, -th / 2 - 0.006, th / 2 + 0.006); ctx.closePath(); ctx.clip();
      ctx.rotate(-src); ctx.scale(z, z); ctx.drawImage(S, -cx, -cy);
      ctx.restore();
    }
  } });

/* ================= inversion / light ================= */
fx('bandInvert', { name: '帯反転', tags: ['glitch', 'graphic'], w: 0.7, dur: 3, amp: 1, glitchy: true, mid: true, ae: 'invert',
  draw(ctx, ev, k, I) {
    const { cw, ch } = I, s = evS(ev), st = I.step * 13 + s, n = 2 + (J.h(st, 1) % 4), vert = J.r(s, 2) < 0.22;
    const L = vert ? cw : ch, M = vert ? ch : cw, a = clamp(ampOf(ev), 0.6, 1.3);
    ctx.globalCompositeOperation = 'difference'; ctx.fillStyle = '#ffffff';
    for (let i = 0; i < n; i++) {
      const h = Math.max(2, L * J.rr(0.012, 0.12, st, i, 3) * a), y = Math.round(L * J.rr(0.12, 0.88, st, i, 4) - h / 2);
      const part = J.r(st, i, 5) < 0.35, x0 = part ? M * J.rr(0, 0.5, st, i, 6) : 0, w = part ? M * J.rr(0.25, 0.6, st, i, 7) : M;
      if (vert) ctx.fillRect(y, x0, h, w); else ctx.fillRect(x0, y, w, h);
    }
  } });

fx('lightRays', { name: '光芒', tags: ['emotional', 'pop', 'calm'], w: 0.9, dur: 8, amp: 1, mid: true, ae: 'flash',
  draw(ctx, ev, k, I) {
    const { cw, ch, sc } = I, s = evS(ev), dk = isDark(sc.bg);
    const a = clamp(ampOf(ev), 0.5, 1.2) * Math.pow(bell(k), 0.6) * (0.9 + 0.1 * J.r(I.step, 5));
    if (a < 0.02) return;
    const cx = cw * (0.5 + J.rs(s, 1) * 0.12), cy = ch * (0.42 + J.rs(s, 2) * 0.1), M = Math.min(cw, ch);
    const R = Math.hypot(cw, ch) * (0.4 + 0.6 * E.outCubic(k));
    const n = 12 + (J.h(s, 3) % 8), rot = J.r(s, 4) * TAU + k * 0.22 * (J.r(s, 7) < 0.5 ? 1 : -1);
    const col = dk ? J.mix(sc.fg, '#ffffff', 0.3) : J.mix(vivid(sc), '#ffffff', 0.35);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    g.addColorStop(0, J.rgba(col, (0.55 * a).toFixed(3))); g.addColorStop(0.3, J.rgba(col, (0.24 * a).toFixed(3))); g.addColorStop(1, J.rgba(col, 0));
    ctx.globalCompositeOperation = dk ? 'screen' : 'multiply';
    ctx.fillStyle = g; ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const an = rot + i / n * TAU + J.rs(s, i, 5) * 0.12, w = TAU / n * J.rr(0.14, 0.45, s, i, 6);
      ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(an - w / 2) * R, cy + Math.sin(an - w / 2) * R); ctx.lineTo(cx + Math.cos(an + w / 2) * R, cy + Math.sin(an + w / 2) * R); ctx.closePath();
    }
    ctx.fill();
    const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, M * 0.3);
    g2.addColorStop(0, J.rgba(col, (0.4 * a).toFixed(3))); g2.addColorStop(1, J.rgba(col, 0));
    ctx.fillStyle = g2; ctx.fillRect(cx - M * 0.3, cy - M * 0.3, M * 0.6, M * 0.6);
  } });

fx('anamorphic', { name: 'アナモフレア', tags: ['emotional', 'pop', 'calm'], w: 0.8, dur: 7, amp: 1, mid: true, ae: 'flash',
  draw(ctx, ev, k, I) {
    const { cw, ch, sc } = I, s = evS(ev), dk = isDark(sc.bg);
    const a = clamp(ampOf(ev), 0.5, 1.2) * Math.pow(bell(k), 0.5) * (0.88 + 0.12 * J.r(I.step, 7));
    if (a < 0.02) return;
    const col = vivid(sc), M = Math.min(cw, ch), dir = J.r(s, 3) < 0.5 ? 1 : -1;
    const y = ch * (0.5 + J.rs(s, 1) * 0.1), x = cw * (0.5 + J.rs(s, 2) * 0.22) + (k - 0.5) * cw * 0.14 * dir;
    const ell = (sx, sy, stops) => {
      ctx.save(); ctx.translate(x, y); ctx.scale(sx, sy);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1); for (const [o, c] of stops) g.addColorStop(o, c);
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill(); ctx.restore();
    };
    if (dk) {
      ctx.globalCompositeOperation = 'screen';
      ell(cw * 0.8, M * 0.05, [[0, J.rgba(col, (0.55 * a).toFixed(3))], [0.4, J.rgba(col, (0.18 * a).toFixed(3))], [1, J.rgba(col, 0)]]);
      ell(cw * 0.62, M * 0.0065, [[0, `rgba(255,255,255,${(0.95 * a).toFixed(3)})`], [0.5, J.rgba(J.mix(col, '#ffffff', 0.5), (0.6 * a).toFixed(3))], [1, J.rgba(col, 0)]]);
      ell(M * 0.07, M * 0.07, [[0, `rgba(255,255,255,${(0.8 * a).toFixed(3)})`], [1, 'rgba(255,255,255,0)']]);
      // lens ghosts along the line through the frame centre
      for (let j = 0; j < 3; j++) {
        const f = [0.55, 1.1, 1.7][j], gx = cw / 2 + (cw / 2 - x) * f, gy = ch / 2 + (ch / 2 - y) * f, r = M * [0.03, 0.06, 0.02][j];
        ctx.fillStyle = J.rgba(col, (0.14 * a).toFixed(3)); ctx.beginPath(); ctx.arc(gx, gy, r, 0, TAU); ctx.fill();
      }
    } else {
      const c2 = J.mix(col, '#ffffff', 0.2);
      ctx.globalCompositeOperation = 'multiply';
      ell(cw * 0.85, M * 0.06, [[0, J.rgba(c2, (0.7 * a).toFixed(3))], [0.45, J.rgba(c2, (0.25 * a).toFixed(3))], [1, J.rgba(c2, 0)]]);
      ell(cw * 0.65, M * 0.008, [[0, J.rgba(col, a.toFixed(3))], [0.6, J.rgba(col, (0.6 * a).toFixed(3))], [1, J.rgba(col, 0)]]);
      ell(M * 0.05, M * 0.05, [[0, J.rgba(col, (0.5 * a).toFixed(3))], [1, J.rgba(col, 0)]]);
    }
  } });

// double heartbeat: a coloured vignette closes in twice with a slight push
fx('heartbeat', { name: '鼓動', tags: ['emotional', 'calm'], w: 0.8, dur: 10, amp: 1, mid: true, scratch: true, ae: 'zoom',
  draw(ctx, ev, k, I) {
    const { cw, ch, S, sc } = I; if (!S) return;
    const pulse = (x, c, w) => { const u = (x - c) / w; return u < 0 || u > 1 ? 0 : u < 0.22 ? E.outCubic(u / 0.22) : 1 - E.inOutCubic((u - 0.22) / 0.78); };
    const p = Math.max(pulse(k, 0, 0.36), 0.8 * pulse(k, 0.44, 0.56)) * clamp(ampOf(ev), 0.5, 1.2);
    if (p < 0.01) return;
    const dk = isDark(sc.bg), M = Math.min(cw, ch), R = Math.hypot(cw, ch) / 2;
    drawScaled(ctx, S, 1 + 0.03 * p, cw / 2, ch / 2, cw, ch);
    const col = dk ? J.mix(vivid(sc), '#000000', 0.1) : J.mix(vivid(sc), '#000000', 0.25);
    const g = ctx.createRadialGradient(cw / 2, ch / 2, M * (0.52 - 0.2 * p), cw / 2, ch / 2, R);
    const pk = dk ? 0.55 : 0.8;
    g.addColorStop(0, J.rgba(col, 0)); g.addColorStop(0.6, J.rgba(col, (0.4 * pk * p).toFixed(3))); g.addColorStop(1, J.rgba(col, (pk * p).toFixed(3)));
    ctx.globalCompositeOperation = dk ? 'screen' : 'multiply';
    ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
  } });

/* ================= film / TV ================= */
let STATIC = null;
const staticTex = () => {
  if (STATIC) return STATIC;
  const n = 256, c = document.createElement('canvas'); c.width = c.height = n;
  const x = c.getContext('2d'), id = x.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let i = 0; i < n; i++) { const v = Math.pow(J.r(i, y, 77), 1.3) * 255, q = (y * n + i) * 4; id.data[q] = id.data[q + 1] = id.data[q + 2] = v; id.data[q + 3] = 255; }
  x.putImageData(id, 0, 0);
  STATIC = c; return c;
};
fx('tvStatic', { name: '砂嵐', tags: ['glitch', 'emotional'], w: 0.6, dur: 5, pre: 2, amp: 1, glitchy: true, ae: 'block',
  draw(ctx, ev, k, I) {
    const { cw, ch } = I, st = I.step * 3 + evS(ev), b = 0.4;
    const cov = (k < b ? 0.5 + 0.5 * E.outQuad(k / b) : 1 - E.outQuad((k - b) / (1 - b))) * clamp(ampOf(ev), 0.7, 1.1);
    if (cov < 0.02) return;
    const N = staticTex(), sz = Math.max(1, Math.round(ch / 540));
    const pat = ctx.createPattern(N, 'repeat');
    try { pat.setTransform(new DOMMatrix([sz * 2, 0, 0, sz, -Math.floor(J.r(st, 1) * 256) * sz * 2, -Math.floor(J.r(st, 2) * 256) * sz])); } catch (e) { /* static pattern */ }
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = Math.min(1, cov); ctx.fillStyle = pat; ctx.fillRect(0, 0, cw, ch);
    ctx.globalAlpha = 0.3 * cov; ctx.fillStyle = '#000000';
    const by = (J.r(st, 3) * 1.2 - 0.1) * ch; ctx.fillRect(0, by, cw, ch * 0.16);
    ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.5 * cov;
    for (let i = 0; i < 4; i++) ctx.fillRect(0, J.r(st, i, 4) * ch, cw, Math.max(1, ch * 0.003));
  } });

fx('dustScratches', { name: 'フィルム傷', tags: ['emotional', 'calm', 'editorial'], w: 0.8, dur: 8, amp: 1, mid: true,
  draw(ctx, ev, k, I) {
    const { cw, ch, sc } = I, s = evS(ev), st = I.step * 31 + s, dk = isDark(sc.bg);
    const a = ahr(k, 0.08, 0.7) * clamp(ampOf(ev), 0.6, 1.2);
    if (a < 0.02) return;
    const M = Math.min(cw, ch), lw = Math.max(1, M * 0.0017), LT = 'rgba(255,253,245,', DK = 'rgba(24,16,8,';
    ctx.fillStyle = (J.r(st, 1) < 0.5 ? LT : DK) + (0.06 * a * J.r(st, 2)).toFixed(3) + ')'; ctx.fillRect(0, 0, cw, ch);
    ctx.lineCap = 'round';
    const nS = 1 + (J.h(s, 3) % 3);
    for (let i = 0; i < nS; i++) {
      if (J.r(st, i, 4) < 0.18) continue;
      const x = cw * (0.1 + 0.8 * J.r(s, i, 5)) + J.rs(st, i, 6) * M * 0.012;
      const y0 = J.r(s, i, 7) < 0.5 ? -2 : ch * 0.5 * J.r(st, i, 8), y1 = J.r(s, i, 9) < 0.5 ? ch + 2 : y0 + ch * J.rr(0.3, 0.7, st, i, 10);
      ctx.strokeStyle = (dk ? LT : DK) + (0.55 * a).toFixed(3) + ')'; ctx.lineWidth = lw * J.rr(0.7, 1.7, s, i, 11);
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.quadraticCurveTo(x + J.rs(st, i, 12) * M * 0.008, (y0 + y1) / 2, x + J.rs(s, i, 13) * M * 0.006, y1); ctx.stroke();
    }
    const nD = 7 + (J.h(st, 14) % 9);
    for (let i = 0; i < nD; i++) {
      const x = J.r(st, i, 15) * cw, y = J.r(st, i, 16) * ch, r = M * J.rr(0.0018, 0.007, st, i, 17);
      const c = (J.r(st, i, 18) < (dk ? 0.7 : 0.25) ? LT : DK) + (J.rr(0.45, 0.9, st, i, 19) * a).toFixed(3) + ')';
      if (J.r(st, i, 20) < 0.72) { ctx.fillStyle = c; ctx.beginPath(); ctx.ellipse(x, y, r, r * J.rr(0.45, 1, st, i, 21), J.r(st, i, 22) * TAU, 0, TAU); ctx.fill(); }
      else {
        const L = M * J.rr(0.02, 0.06, st, i, 23), an = J.r(st, i, 24) * TAU;
        ctx.strokeStyle = c; ctx.lineWidth = lw * 0.8; ctx.beginPath(); ctx.moveTo(x, y);
        ctx.bezierCurveTo(x + Math.cos(an) * L * 0.4 + J.rs(st, i, 25) * L * 0.4, y + Math.sin(an) * L * 0.4, x + Math.cos(an + 0.8) * L * 0.8, y + Math.sin(an + 0.8) * L * 0.8, x + Math.cos(an + 0.3) * L, y + Math.sin(an + 0.3) * L);
        ctx.stroke();
      }
    }
  } });

/* ================= film strip / 3D / water ================= */
const rrect = (ctx, x, y, w, h, r) => { r = Math.min(r, w / 2, h / 2); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
// the picture shrinks onto a strip of film with sprocket holes and the strip is pulled on by one frame
fx('filmAdvance', { name: 'フィルム送り', tags: ['emotional', 'editorial', 'calm'], w: 0.6, dur: 9, pre: 4, amp: 1, scratch: true, ae: 'slice',
  draw(ctx, ev, k, I) {
    const { cw, ch, S } = I; if (!S) return;
    const s = evS(ev), dir = J.r(s, 1) < 0.7 ? 1 : -1, env = ahr(k, 0.22, 0.78, E.inOutCubic, E.inOutCubic);
    if (env < 0.002) return;
    const z = 1 - 0.17 * env, fw = cw * z, fh = ch * z, x0 = (cw - fw) / 2, gap = Math.max(2, ch * 0.03), pitch = fh + gap;
    const off = E.inOutCubic(clamp((k - 0.2) / 0.6)) * pitch * dir, yc = (ch - fh) / 2 - off;
    ctx.fillStyle = '#0d0b09'; ctx.fillRect(0, 0, cw, ch);
    for (let j = -2; j <= 2; j++) { const y = yc + j * pitch; if (y > ch || y + fh < 0) continue; ctx.drawImage(S, x0, y, fw, fh); }
    if (x0 > 3) {
      const hp = pitch / 4, hw = x0 * 0.42, hh = hp * 0.46;
      ctx.fillStyle = `rgba(236,230,218,${(0.9 * env).toFixed(3)})`; ctx.beginPath();
      for (let y = (((yc % hp) + hp) % hp) - hp; y < ch; y += hp) {
        rrect(ctx, x0 * 0.29, y + (hp - hh) / 2, hw, hh, hw * 0.2);
        rrect(ctx, cw - x0 * 0.29 - hw, y + (hp - hh) / 2, hw, hh, hw * 0.2);
      }
      ctx.fill();
    }
  } });

// the frame swings in 3D around its vertical (or horizontal) axis: projected strips form a perspective trapezoid
fx('perspectiveTilt', { name: 'パース揺れ', tags: ['pop', 'graphic', 'emotional'], w: 0.8, dur: 8, amp: 1, mid: true, scratch: true, ae: 'shake',
  draw(ctx, ev, k, I) {
    const { cw, ch, S, sc } = I; if (!S) return;
    const s = evS(ev), cols = J.r(s, 1) < (cw >= ch ? 0.7 : 0.35), dir = J.r(s, 2) < 0.5 ? 1 : -1;
    const e = k < 0.25 ? E.outCubic(k / 0.25) : Math.cos((k - 0.25) / 0.75 * Math.PI * 1.5) * Math.exp(-2.6 * (k - 0.25) / 0.75);
    const phi = dir * (30 + 10 * J.r(s, 3)) * clamp(ampOf(ev), 0.5, 1.2) * e * DEG;
    if (Math.abs(phi) < 0.002) return;
    const L = cols ? cw : ch, Mx = cols ? ch : cw, hl = L / 2, D = 1.15 * Math.max(cw, ch), co = Math.cos(phi), si = Math.sin(phi);
    ctx.fillStyle = isDark(sc.bg) ? sc.bg : J.mix(sc.bg, sc.fg, 0.1); ctx.fillRect(0, 0, cw, ch);
    const N = 48, sw = L / N;
    let pd = null;
    for (let i = 0; i <= N; i++) {
      const u = -1 + 2 * i / N, p = D / (D + u * hl * si), d = hl + u * hl * co * p;
      if (pd) {
        const h = Mx * (pd[1] + p) / 2, x = pd[0], w = d - pd[0] + 0.7, s0 = (i - 1) * sw;
        if (cols) ctx.drawImage(S, s0, 0, sw, ch, x, (ch - h) / 2, w, h); else ctx.drawImage(S, 0, s0, cw, sw, (cw - h) / 2, x, h, w);
      }
      pd = [d, p];
    }
  } });

// water ripple: annuli around the drop point are each re-drawn slightly scaled (radial displacement)
fx('ripple', { name: '波紋', tags: ['emotional', 'calm', 'pop'], w: 0.8, dur: 10, amp: 1, mid: true, scratch: true, ae: 'zoom',
  draw(ctx, ev, k, I) {
    const { cw, ch, S, sc } = I; if (!S) return;
    const s = evS(ev), cx = cw * (0.5 + J.rs(s, 1) * 0.1), cy = ch * (0.5 + J.rs(s, 2) * 0.08), M = Math.min(cw, ch), dk = isDark(sc.bg);
    const Rmax = Math.hypot(Math.max(cx, cw - cx), Math.max(cy, ch - cy));
    const lam = M * 0.1, front = (0.05 + 0.95 * E.outQuad(k)) * Rmax * 1.05, A = M * 0.022 * clamp(ampOf(ev), 0.5, 1.3) * (1 - 0.7 * k);
    const dr = lam / 5, r0 = Math.max(0, front - 2.6 * lam);
    for (let r = r0, n = 0; r < front + dr && n < 40; r += dr, n++) {
      const rm = r + dr / 2, ph = (front - rm) / lam, env = Math.exp(-ph * 0.8) * clamp(ph * 4 + 1);
      const disp = A * Math.sin(ph * TAU) * env;
      if (Math.abs(disp) < 0.3 || rm < 2) continue;
      const m = clamp(rm / Math.max(1, rm - disp), 0.7, 1.4);
      ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r + dr + 0.6, 0, TAU); ctx.arc(cx, cy, Math.max(0, r - 0.6), 0, TAU, true); ctx.clip();
      ctx.drawImage(S, cx - cx * m, cy - cy * m, cw * m, ch * m); ctx.restore();
    }
    // crest highlights
    ctx.globalCompositeOperation = dk ? 'screen' : 'multiply'; ctx.lineWidth = Math.max(1, dr * 0.9);
    for (let j = 0; j < 3; j++) {
      const rc = front - lam * (j + 0.25); if (rc <= 2) continue;
      const al = 0.16 * Math.exp(-j * 0.9) * (1 - 0.6 * k);
      ctx.strokeStyle = dk ? `rgba(255,255,255,${al.toFixed(3)})` : J.rgba(J.mix(sc.fg, sc.bg, 0.4), al.toFixed(3));
      ctx.beginPath(); ctx.arc(cx, cy, rc, 0, TAU); ctx.stroke();
    }
  } });

/* ================= manga / graphic overlays ================= */
const inkCol = sc => (isDark(sc.bg) ? lightest([sc.fg, sc.ink, '#FFFFFF']) : darkest([sc.fg, sc.ink, '#111111']));
// 集中線: thin wedges converging on the centre, redrawn every frame like hand-drawn animation
fx('focusLines', { name: '集中線', tags: ['pop', 'graphic', 'emotional'], w: 0.9, dur: 6, amp: 1, mid: true, ae: 'zoom',
  draw(ctx, ev, k, I) {
    const { cw, ch, sc } = I, s = evS(ev), st = I.step * 5 + s, a = ahr(k, 0.1, 0.72);
    if (a < 0.02) return;
    const cx = cw / 2 + J.rs(s, 1) * cw * 0.03, cy = ch / 2 + J.rs(s, 2) * ch * 0.03, M = Math.min(cw, ch);
    const rx = cw * (0.4 + 0.06 * (1 - a)), ry = ch * (0.34 + 0.06 * (1 - a)), R = Math.hypot(cw, ch) * 0.75;
    const n = 90 + (J.h(s, 3) % 50);
    ctx.fillStyle = inkCol(sc); ctx.globalAlpha = 0.85 * a; ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const an = (i + J.r(st, i, 4) * 0.8) / n * TAU, w = M * J.rr(0.002, 0.011, st, i, 5), tip = J.rr(1.0, 1.45, st, i, 6);
      const tx = cx + Math.cos(an) * rx * tip, ty = cy + Math.sin(an) * ry * tip, nx = -Math.sin(an), ny = Math.cos(an);
      const ox = cx + Math.cos(an) * R, oy = cy + Math.sin(an) * R;
      ctx.moveTo(tx, ty); ctx.lineTo(ox + nx * w, oy + ny * w); ctx.lineTo(ox - nx * w, oy - ny * w); ctx.closePath();
    }
    ctx.fill();
  } });

// 流線: tapered streaks racing across the frame (clear of the centre band)
fx('speedLines', { name: '流線', tags: ['pop', 'graphic'], w: 0.8, dur: 6, amp: 1, mid: true,
  draw(ctx, ev, k, I) {
    const { cw, ch, sc } = I, s = evS(ev), a = ahr(k, 0.12, 0.7);
    if (a < 0.02) return;
    const vert = cw < ch ? J.r(s, 1) < 0.5 : J.r(s, 1) < 0.15, dir = J.r(s, 2) < 0.5 ? 1 : -1;
    const L = vert ? ch : cw, M = vert ? cw : ch, n = 22 + (J.h(s, 3) % 12), c1 = inkCol(sc), c2 = vivid(sc);
    for (let i = 0; i < n; i++) {
      let q = J.r(s, i, 4);
      if (Math.abs(q - 0.5) < 0.12 && J.r(s, i, 9) < 0.8) q = q < 0.5 ? 0.38 - J.r(s, i, 10) * 0.33 : 0.62 + J.r(s, i, 10) * 0.33;
      const p = q * M, len = L * J.rr(0.15, 0.55, s, i, 5), th = Math.max(1, M * J.rr(0.002, 0.008, s, i, 6)), sp = J.rr(1.3, 2.6, s, i, 7);
      const f = (J.r(s, i, 8) + k * sp) % 1, head = -len * 0.2 + f * (L + len * 1.2), tail = head - len;
      const H = dir > 0 ? head : L - head, Tl = dir > 0 ? tail : L - tail;
      ctx.globalAlpha = a * J.rr(0.4, 0.9, s, i, 11); ctx.fillStyle = J.r(s, i, 12) < 0.22 ? c2 : c1;
      ctx.beginPath();
      if (!vert) { ctx.moveTo(Tl, p); ctx.lineTo(H, p - th / 2); ctx.lineTo(H, p + th / 2); }
      else { ctx.moveTo(p, Tl); ctx.lineTo(p - th / 2, H); ctx.lineTo(p + th / 2, H); }
      ctx.closePath(); ctx.fill();
    }
  } });

// キラッ: 8-point glints popping in sequence around the lyric band
fx('starGlint', { name: 'キラッ', tags: ['pop', 'emotional'], w: 0.8, dur: 9, amp: 1, mid: true, ae: 'flash',
  draw(ctx, ev, k, I) {
    const { cw, ch, sc } = I, s = evS(ev), dk = isDark(sc.bg), M = Math.min(cw, ch), col = vivid(sc), n = 2 + (J.h(s, 1) % 3);
    const port = ch > cw;
    for (let i = 0; i < n; i++) {
      const t0 = i * 0.16 + J.r(s, i, 4) * 0.06, u = (k - t0) / 0.55;
      if (u <= 0 || u >= 1) continue;
      const g = Math.pow(Math.sin(Math.PI * u), 0.8), R = M * (0.1 + 0.07 * J.r(s, i, 5)) * g * clamp(ampOf(ev), 0.6, 1.3);
      const x = cw * (0.5 + J.rs(s, i, 2) * (port ? 0.3 : 0.34)), y = ch * (0.5 + J.rs(s, i, 3) * (port ? 0.14 : 0.1)), rot = (J.rs(s, i, 6) * 12 + u * 30) * DEG;
      if (R < 0.5) continue;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, R * 0.6);
      glow.addColorStop(0, J.rgba(col, (0.55 * g).toFixed(3))); glow.addColorStop(1, J.rgba(col, 0));
      ctx.globalCompositeOperation = dk ? 'screen' : 'source-over'; ctx.fillStyle = glow; ctx.fillRect(x - R, y - R, 2 * R, 2 * R);
      ctx.beginPath();
      for (let j = 0; j < 16; j++) {
        const an = rot + j * Math.PI / 8, rr = j % 2 ? R * 0.07 : (j % 4 === 0 ? R : R * 0.42);
        if (j) ctx.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); else ctx.moveTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr);
      }
      ctx.closePath();
      ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = dk ? '#FFFFFF' : col; ctx.fill();
      ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.arc(x, y, R * 0.08, 0, TAU); ctx.fill();
    }
  } });

// thin scheme-coloured bars sweeping across the frame at different speeds
fx('colorBars', { name: 'カラーバー', tags: ['pop', 'graphic', 'glitch'], w: 0.8, dur: 6, amp: 1, mid: true, ae: 'slice',
  draw(ctx, ev, k, I) {
    const { cw, ch, sc } = I, s = evS(ev), vert = J.r(s, 1) < (cw >= ch ? 0.35 : 0.15), dir = J.r(s, 2) < 0.5 ? 1 : -1;
    let cols = [sc.accent, sc.accent2, sc.ghostA, sc.ghostB, sc.fg].filter(c => c && J.contrast(c, sc.bg) > 1.35);
    if (!cols.length) cols = [inkCol(sc)];
    const L = vert ? cw : ch, M = vert ? ch : cw, n = 4 + (J.h(s, 3) % 4);
    for (let i = 0; i < n; i++) {
      const th = Math.max(2, L * J.rr(0.008, 0.045, s, i, 4)), d = J.r(s, i, 5) * 0.4, sp = J.rr(0.9, 1.5, s, i, 6);
      const u = clamp((k - d) / (1 - d) * sp);
      if (u <= 0 || u >= 1) continue;
      let pos = J.lerp(-th, L + th, u); if (dir < 0) pos = L - pos;
      const part = J.r(s, i, 7) < 0.4, m0 = part ? M * J.rr(0, 0.5, s, i, 8) : 0, mw = part ? M * J.rr(0.3, 0.6, s, i, 9) : M;
      ctx.globalAlpha = 0.92; ctx.fillStyle = cols[(i + (J.h(s, 10) % cols.length)) % cols.length];
      if (vert) ctx.fillRect(pos - th / 2, m0, th, mw); else ctx.fillRect(m0, pos - th / 2, mw, th);
    }
  } });

// three hard zoom steps (ダダダン), each with its own slight focus shift, then snap back
fx('zoomStutter', { name: 'ズーム連打', tags: ['pop', 'graphic', 'glitch'], w: 0.8, dur: 6, amp: 1, mid: true, scratch: true, ae: 'zoom',
  draw(ctx, ev, k, I) {
    const { cw, ch, S } = I; if (!S) return;
    const s = evS(ev), j = Math.min(2, Math.floor(k * 3)), a = clamp(ampOf(ev), 0.5, 1.3);
    const z = 1 + (j + 1) * (0.035 + 0.012 * J.r(s, 1)) * a;
    drawScaled(ctx, S, z, cw * (0.5 + J.rs(s, 2, j) * 0.04), ch * (0.5 + J.rs(s, 3, j) * 0.04), cw, ch);
  } });

/* ================= graphic inversions / stylise ================= */
// an inverted ring (circle or diamond) bursts out from the centre, a thinner echo ring follows
fx('negativeRing', { name: '反転リング', tags: ['graphic', 'pop', 'glitch'], w: 0.8, dur: 6, amp: 1, mid: true, ae: 'invert',
  draw(ctx, ev, k, I) {
    const { cw, ch } = I, s = evS(ev), M = Math.min(cw, ch), dia = J.r(s, 1) < 0.35;
    const cx = cw / 2 + J.rs(s, 2) * cw * 0.05, cy = ch / 2 + J.rs(s, 3) * ch * 0.05, Rm = Math.hypot(cw, ch) * (dia ? 0.75 : 0.56);
    const shape = r => { if (dia) { ctx.moveTo(cx, cy - r); ctx.lineTo(cx + r, cy); ctx.lineTo(cx, cy + r); ctx.lineTo(cx - r, cy); ctx.closePath(); } else { ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, TAU); } };
    const ring = (p, th) => {
      if (p <= 0 || p >= 1) return;
      const r = E.outCubic(p) * Rm, r0 = Math.max(0, r - th * (1 - 0.55 * p));
      ctx.beginPath(); shape(r); if (r0 > 0.5) shape(r0); ctx.fill('evenodd');
    };
    ctx.globalCompositeOperation = 'difference'; ctx.fillStyle = '#ffffff';
    const a = clamp(ampOf(ev), 0.6, 1.3);
    ring(k * 1.05 + 0.04, M * 0.16 * a); ring((k - 0.22) * 1.35, M * 0.05 * a);
  } });

// edge detection: |frame - shifted frame| → neon outlines on dark schemes, ink line drawing on light ones
const invHex = h => { const [r, g, b] = J.hex(h); return J.toHex(255 - r, 255 - g, 255 - b); };
fx('edgeDetect', { name: '輪郭抽出', tags: ['graphic', 'glitch', 'editorial'], w: 0.7, dur: 4, amp: 1, mid: true, scratch: true, ae: 'invert',
  draw(ctx, ev, k, I) {
    const { cw, ch, S, sc } = I; if (!S) return;
    const dk = isDark(sc.bg), a = ahr(k, 0.1, 0.72);
    if (a < 0.02) return;
    const w = Math.max(2, Math.round(cw / 2)), h = Math.max(2, Math.round(ch / 2)), o = Math.max(1, Math.round(h / 320));
    const T = buf(0, w, h), x = cx2(T);
    x.globalCompositeOperation = 'copy'; x.drawImage(S, 0, 0, w, h);
    x.globalCompositeOperation = 'difference'; x.drawImage(S, 0, 0, cw, ch, o, o, w, h);
    x.globalCompositeOperation = 'saturation'; x.fillStyle = '#808080'; x.fillRect(0, 0, w, h);
    const T2 = buf(1, w, h), y = cx2(T2);
    // noise floor: color-burn with a light grey = max(0, (v - 0.07) / 0.93) removes dithered-gradient steps; then gain ×4
    y.globalCompositeOperation = 'copy'; y.drawImage(T, 0, 0);
    y.globalCompositeOperation = 'color-burn'; y.fillStyle = '#EDEDED'; y.fillRect(0, 0, w, h);
    y.globalCompositeOperation = 'lighter'; y.drawImage(T2, 0, 0); y.drawImage(T2, 0, 0);
    const edge = dk ? J.mix(vivid(sc), '#ffffff', 0.45) : darkest([sc.fg, sc.ink, '#111111']);
    // colour the edge map at half resolution, then one upscale: neon lines on a darkened ground / ink lines on the paper colour
    y.globalCompositeOperation = 'multiply'; y.fillStyle = dk ? edge : invHex(edge); y.fillRect(0, 0, w, h);
    if (dk) { y.globalCompositeOperation = 'screen'; y.fillStyle = J.mix(sc.bg, '#000000', 0.6); y.fillRect(0, 0, w, h); }
    else { y.globalCompositeOperation = 'difference'; y.fillStyle = '#ffffff'; y.fillRect(0, 0, w, h); y.globalCompositeOperation = 'multiply'; y.fillStyle = sc.bg; y.fillRect(0, 0, w, h); }
    ctx.globalAlpha = a; ctx.drawImage(T2, 0, 0, w, h, 0, 0, cw, ch);
  } });

// glass shatter: cracks appear on the old frame, the new frame arrives in shards that drift apart and knit back together
fx('shatter', { name: 'ガラス割れ', tags: ['glitch', 'pop', 'emotional'], w: 0.5, dur: 8, pre: 1, amp: 1, scratch: true, ae: 'block',
  draw(ctx, ev, k, I) {
    const { cw, ch, S, sc } = I; if (!S) return;
    const s = evS(ev), M = Math.min(cw, ch), dk = isDark(sc.bg), a = clamp(ampOf(ev), 0.6, 1.3);
    const px = cw * (0.5 + J.rs(s, 1) * 0.15), py = ch * (0.5 + J.rs(s, 2) * 0.12), n = 9 + (J.h(s, 3) % 4);
    const radii = [0, M * J.rr(0.1, 0.17, s, 4), M * J.rr(0.32, 0.45, s, 5), Math.hypot(cw, ch) * 1.1];
    const ang = []; for (let i = 0; i < n; i++) ang.push((i + J.rs(s, i, 6) * 0.35) / n * TAU);
    const V = (i, j) => { if (!j) return [px, py]; const q = ang[i % n] + J.rs(s, i % n, j, 7) * 0.12, r = radii[j] * (j < 3 ? 1 + J.rs(s, i % n, j, 8) * 0.18 : 1); return [px + Math.cos(q) * r, py + Math.sin(q) * r]; };
    const b = 1 / 8, u = (k - b) / (1 - b);
    const sep = u <= 0 ? 0 : u < 0.28 ? E.outCubic(u / 0.28) : 1 - E.inOutCubic((u - 0.28) / 0.72);
    const crack = u <= 0 ? 1 : Math.max(0, 1 - u * 1.4);
    const shards = [];
    for (let i = 0; i < n; i++) for (let j = 0; j < 3; j++) {
      const pts = j ? [V(i, j), V(i + 1, j), V(i + 1, j + 1), V(i, j + 1)] : [V(i, 0), V(i, 1), V(i + 1, 1)];
      const cxm = pts.reduce((t, p) => t + p[0], 0) / pts.length, cym = pts.reduce((t, p) => t + p[1], 0) / pts.length;
      const dx = cxm - px, dy = cym - py, dl = Math.hypot(dx, dy) || 1, d = sep * M * (dk ? 0.04 : 0.028) * a * (0.5 + 0.3 * j + 0.5 * J.r(s, i, j, 9));
      shards.push({ pts, cxm, cym, ox: dx / dl * d, oy: dy / dl * d, rot: sep * J.rs(s, i, j, 10) * 4 * DEG });
    }
    if (sep > 0.002) {
      ctx.fillStyle = dk ? '#000000' : J.mix(sc.bg, '#000000', 0.55); ctx.fillRect(0, 0, cw, ch);
      for (const sh of shards) {
        ctx.save(); ctx.translate(sh.cxm + sh.ox, sh.cym + sh.oy); ctx.rotate(sh.rot); ctx.translate(-sh.cxm, -sh.cym);
        ctx.beginPath(); sh.pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.clip();
        ctx.drawImage(S, 0, 0); ctx.restore();
      }
    }
    const la = Math.max(crack, sep * 0.6);
    if (la > 0.02) {
      ctx.strokeStyle = dk ? `rgba(255,255,255,${(0.75 * la).toFixed(3)})` : J.rgba(darkest([sc.fg, sc.ink]), (0.6 * la).toFixed(3));
      ctx.lineWidth = Math.max(1, M * 0.0022); ctx.lineJoin = 'round'; ctx.beginPath();
      for (const sh of shards) { const c = Math.cos(sh.rot), si = Math.sin(sh.rot); sh.pts.forEach((p, i) => { const X = sh.cxm + sh.ox + (p[0] - sh.cxm) * c - (p[1] - sh.cym) * si, Y = sh.cym + sh.oy + (p[0] - sh.cxm) * si + (p[1] - sh.cym) * c; if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }); ctx.closePath(); }
      ctx.stroke();
    }
    if (k < b * 1.5) {   // impact flash
      const f = 1 - k / (b * 1.5), g = ctx.createRadialGradient(px, py, 0, px, py, M * 0.25);
      g.addColorStop(0, `rgba(255,255,255,${(0.85 * f).toFixed(3)})`); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalCompositeOperation = dk ? 'screen' : 'source-over'; ctx.fillStyle = g; ctx.fillRect(px - M * 0.25, py - M * 0.25, M * 0.5, M * 0.5);
    }
  } });

// rack focus: the picture drops out of focus (peak at the cut) and snaps back
fx('defocus', { name: 'ピンぼけ', tags: ['emotional', 'calm', 'editorial'], w: 0.9, dur: 8, pre: 4, amp: 1, mid: true, scratch: true, ae: 'zoom',
  draw(ctx, ev, k, I) {
    const { cw, ch, S } = I; if (!S) return;
    const amt = (k < 0.5 ? E.inOutCubic(k / 0.5) : 1 - E.inOutCubic((k - 0.5) / 0.5)) * clamp(ampOf(ev), 0.6, 1.2);
    if (amt < 0.01) return;
    const w = Math.max(2, Math.ceil(cw / 4)), h = Math.max(2, Math.ceil(ch / 4)), T = buf(0, w, h), x = cx2(T);
    x.globalCompositeOperation = 'copy';
    if (I.allowFilter) { x.filter = `blur(${(amt * h / 55).toFixed(2)}px)`; x.drawImage(S, 0, 0, w, h); x.filter = 'none'; }
    else {
      const w2 = Math.max(2, Math.ceil(w / (1 + 3 * amt))), h2 = Math.max(2, Math.ceil(h / (1 + 3 * amt))), T2 = buf(1, w2, h2), y = cx2(T2);
      y.globalCompositeOperation = 'copy'; y.drawImage(S, 0, 0, w2, h2); x.drawImage(T2, 0, 0, w, h);
    }
    ctx.globalAlpha = Math.min(1, amt * 1.8);
    drawScaled(ctx, T, 1 + 0.025 * amt, cw / 2, ch / 2, cw, ch);
  } });

// camera shutter: white flash, the frame becomes a tilted instant photo on a dimmed backdrop, then zooms back
fx('snapshot', { name: 'シャッター', tags: ['pop', 'emotional', 'editorial'], w: 0.6, dur: 10, amp: 1, mid: true, scratch: true, ae: 'flash',
  draw(ctx, ev, k, I) {
    const { cw, ch, S, sc } = I; if (!S) return;
    const s = evS(ev), M = Math.min(cw, ch);
    const env = k < 0.16 ? E.outBack(k / 0.16, 1.4) : k > 0.8 ? 1 - E.inOutCubic((k - 0.8) / 0.2) : 1;
    if (env > 0.002) {
      const z = 1 - 0.15 * env, rot = (J.r(s, 1) < 0.5 ? -1 : 1) * (2 + 2.5 * J.r(s, 2)) * env * DEG;
      const bw = M * 0.024 * clamp(env, 0, 1), fw = cw * z, fh = ch * z, bb = bw * 3.2;
      ctx.globalAlpha = clamp(env * 1.2); ctx.fillStyle = J.mix(sc.bg, '#000000', isDark(sc.bg) ? 0.5 : 0.45); ctx.fillRect(0, 0, cw, ch);
      ctx.globalAlpha = 1;
      ctx.translate(cw / 2, ch / 2); ctx.rotate(rot);
      ctx.fillStyle = `rgba(0,0,0,${(0.3 * env).toFixed(3)})`; ctx.fillRect(-fw / 2 - bw + M * 0.012, -fh / 2 - bw + M * 0.02, fw + 2 * bw, fh + bw + bb);
      ctx.fillStyle = '#F7F5F0'; ctx.fillRect(-fw / 2 - bw, -fh / 2 - bw, fw + 2 * bw, fh + bw + bb);
      ctx.drawImage(S, -fw / 2, -fh / 2, fw, fh);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
    if (k < 0.22) { ctx.fillStyle = `rgba(255,255,255,${(0.9 * (1 - k / 0.22)).toFixed(3)})`; ctx.fillRect(0, 0, cw, ch); }
  } });

// elastic squash & stretch of the whole frame (damped spring)
fx('squash', { name: '伸縮', tags: ['pop', 'graphic'], w: 0.8, dur: 6, amp: 1, mid: true, scratch: true, ae: 'zoom',
  draw(ctx, ev, k, I) {
    const { cw, ch, S, sc } = I; if (!S) return;
    const s = evS(ev), hor = J.r(s, 1) < 0.6;
    const e = Math.cos(k * Math.PI * 2.5) * Math.exp(-1.8 * k) * (1 - Math.pow(k, 6)), a = 0.17 * clamp(ampOf(ev), 0.5, 1.3) * e;
    if (Math.abs(a) < 0.002) return;
    const sx = hor ? 1 + a : 1 - a * 0.6, sy = hor ? 1 - a * 0.6 : 1 + a;
    ctx.fillStyle = sc.bg; ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(S, cw / 2 - cw * sx / 2, ch / 2 - ch * sy / 2, cw * sx, ch * sy);
  } });

// scanner: a glowing bar sweeps the frame; what it has not reached yet is dimmed, rows just behind it jitter
fx('scanBar', { name: 'スキャン', tags: ['graphic', 'editorial', 'glitch'], w: 0.7, dur: 8, amp: 1, mid: true, scratch: true, ae: 'flash',
  draw(ctx, ev, k, I) {
    const { cw, ch, S, sc } = I; if (!S) return;
    const s = evS(ev), dk = isDark(sc.bg), down = J.r(s, 1) < 0.7, st = I.step * 3 + s;
    const bh = ch * 0.05, yy = -bh + k * (ch + 2 * bh), y = down ? yy : ch - yy;
    const y0 = down ? Math.max(0, y) : 0, y1 = down ? ch : Math.min(ch, y);
    if (y1 > y0) { ctx.fillStyle = dk ? 'rgba(0,0,0,0.6)' : J.rgba(sc.bg, 0.7); ctx.fillRect(0, y0, cw, y1 - y0); }
    const band = ch * 0.035, sy = clamp(down ? y - band : y, 0, ch - 1), sh = Math.min(band, ch - sy);
    if (sh > 1) for (let i = 0; i < 3; i++) {
      const hh = sh / 3, yy2 = sy + i * hh;
      ctx.drawImage(S, 0, yy2, cw, hh, J.rs(st, i, 2) * cw * 0.012, yy2, cw, hh);
    }
    const col = dk ? J.mix(vivid(sc), '#ffffff', 0.4) : vivid(sc);
    const g = ctx.createLinearGradient(0, y - bh, 0, y + bh);
    g.addColorStop(0, J.rgba(col, 0)); g.addColorStop(0.5, J.rgba(col, dk ? 0.5 : 0.35)); g.addColorStop(1, J.rgba(col, 0));
    ctx.globalCompositeOperation = dk ? 'screen' : 'multiply'; ctx.fillStyle = g; ctx.fillRect(0, y - bh, cw, bh * 2);
    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = dk ? '#FFFFFF' : col; ctx.globalAlpha = 0.9;
    ctx.fillRect(0, y - Math.max(1, ch * 0.0015), cw, Math.max(2, ch * 0.003));
  } });

// the whole frame scrolls one full width (wrapping round) with motion blur — ends exactly where it started
fx('loopScroll', { name: '横ループ', tags: ['pop', 'graphic', 'glitch'], w: 0.7, dur: 6, pre: 3, amp: 1, scratch: true, ae: 'slice',
  draw(ctx, ev, k, I) {
    const { cw, ch, S, sc } = I; if (!S) return;
    const s = evS(ev), vert = cw < ch ? J.r(s, 1) < 0.6 : J.r(s, 1) < 0.2, dir = J.r(s, 2) < 0.5 ? 1 : -1;
    const L = vert ? ch : cw, q = E.inOutCubic(k), o = ((q * L * dir) % L + L) % L;
    const v = k < 0.5 ? 12 * k * k : 12 * (1 - k) * (1 - k);   // d(inOutCubic)/dk, 0..3
    const blur = L * 0.05 * v / 3;
    const wrap = (c, img, off, W, H) => { if (vert) { c.drawImage(img, 0, off - H, W, H); c.drawImage(img, 0, off, W, H); } else { c.drawImage(img, off - W, 0, W, H); c.drawImage(img, off, 0, W, H); } };
    if (blur < 2) { wrap(ctx, S, o, cw, ch); return; }
    const w = Math.max(2, Math.round(cw / 2)), h = Math.max(2, Math.round(ch / 2)), T = buf(0, w, h), x = cx2(T);
    x.globalCompositeOperation = 'copy'; x.fillStyle = sc.bg; x.fillRect(0, 0, w, h); x.globalCompositeOperation = 'source-over';
    wrap(x, S, o / 2, w, h);
    const T2 = buf(1, w, h), y = cx2(T2);
    y.globalCompositeOperation = 'copy'; y.drawImage(T, 0, 0); y.globalCompositeOperation = 'source-over';
    const n = 6;
    for (let i = 1; i < n; i++) {
      const d = (i / (n - 1) - 0.5) * blur / 2 * dir;
      y.globalAlpha = 1 / (i + 1);
      if (vert) { y.drawImage(T, 0, d); y.drawImage(T, 0, d - Math.sign(d || 1) * h); } else { y.drawImage(T, d, 0); y.drawImage(T, d - Math.sign(d || 1) * w, 0); }
    }
    ctx.drawImage(T2, 0, 0, w, h, 0, 0, cw, ch);
  } });

})();

/* JIZURA pack: horror (1/3) — uneasy / found-footage layouts: flashlight, door gap, obsessive wall writing, CCTV, spirit board,
   missing poster, the one wrong glyph, rising from the dark, redacted file, static TV, spirit photo, the wrong shadow */
(() => {
'use strict';
const E = J.E;
const P = 'horror';
const TAGS = ['horror'];
const reg = (key, def) => J.register('layout', key, Object.assign({ set: 'horror' }, def), P);

/* ------------------------------------------------------------------ helpers */
const U = env => Math.min(env.W, env.H);
const isPort = env => env.H > env.W * 1.08;
const strip = t => String(t || '').replace(/\s+/g, '');
const hasLatin = t => /[A-Za-z]/.test(t);
const flat = t => (hasLatin(t) ? String(t || '').trim().replace(/\s+/g, ' ') : strip(t));
const fontsOf = (st, roles) => J.fontsOf(st, roles);
const bodyF = env => (env.st.fonts.body && env.st.fonts.body[0]) || 'gothic_med';
const monoF = env => (env.st.fonts.mono && env.st.fonts.mono[0]) || 'mono';
const handOf = (rng, st) => (J.FONTS.klee && rng.chance(0.75) ? 'klee' : rng.pick(fontsOf(st, ['body', 'serif'])));
const tin = (env, d = 0, len = 0.4, ease = E.outCubic) => ease(J.clamp((env.lt - d) / Math.max(0.01, len)));
const tout = env => 1 - E.inCubic(env.pOut);
const box = (x0, y0, x1, y1) => ({ x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, boxes: [] });
const UB = J.unionBB;
const pad2 = n => String(n).padStart(2, '0');
const miAt = (env, t) => Math.max(0, t) / Math.max(0.005, env.cut.stagger || 0.04);
const isDark = c => J.lum(c) < 0.45;
const lightOf = sc => (J.lum(sc.fg) > J.lum(sc.bg) ? sc.fg : sc.bg);
const darkOf = sc => (J.lum(sc.fg) > J.lum(sc.bg) ? sc.bg : sc.fg);
/* the colour of darkness over this scheme */
const nightC = sc => J.mix(sc.bg, '#000000', isDark(sc.bg) ? 0.72 : 0.9);
/* best readable scheme colour on a plate */
const onCol = (sc, fill) => {
  let best = null, bv = 0;
  for (const c of [sc.bg, sc.fg, sc.ink, sc.sub, sc.accent]) { if (!c || c === fill) continue; const k = J.contrast(c, fill); if (k > bv) { bv = k; best = c; } }
  return bv >= 2.6 ? best : (J.lum(fill) > 0.5 ? '#111111' : '#FFFFFF');
};
const redOn = (sc, fill) => J.fitContrast(sc.accent, fill, 2.4);
/* date / time strings from the cut seed (ASCII only) */
const fakeDate = (seed, sep = '/') => {
  const y = 1987 + (J.h(seed, 1) % 19), m = 1 + (J.h(seed, 2) % 12), d = 1 + (J.h(seed, 3) % 28);
  return `${y}${sep}${pad2(m)}${sep}${pad2(d)}`;
};
const fakeTime = (seed, t) => {
  const s0 = 2 * 3600 + (J.h(seed, 4) % 7200) + Math.floor(Math.max(0, t));
  return `${pad2(Math.floor(s0 / 3600) % 24)}:${pad2(Math.floor(s0 / 60) % 60)}:${pad2(s0 % 60)}`;
};
/* glyph centres of a laid-out text item (spaces left out) */
const slots = (it) => {
  const lay = J.layoutText(it), sx = it.sx || 1, sy = it.sy || 1, out = [];
  for (const g of lay) { if (g.ch === ' ' || g.ch === '　') continue; out.push({ ch: g.ch, x: it.x + g.x * sx, y: it.y + g.y * sy, w: g.w * sx, h: g.h * sy, li: g.li }); }
  return out;
};
/* a full-screen veil with a soft hole: main pass only (it also hides the ghost passes' text) */
const veilHole = (env, cx, cy, R, a, col, inner = 0.35, ry = 1) => {
  if (env.pass !== 'main' || a <= 0.002) return;
  const ctx = env.ctx, W = env.W, H = env.H;
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(1, ry);
  const g = ctx.createRadialGradient(0, 0, Math.max(0.1, R * inner), 0, 0, Math.max(1, R));
  g.addColorStop(0, J.rgba(col, 0)); g.addColorStop(0.55, J.rgba(col, (0.3 * a).toFixed(3))); g.addColorStop(1, J.rgba(col, a.toFixed(3)));
  ctx.fillStyle = g; ctx.fillRect(-W * 2 - cx, -(H * 2 + cy) / ry, W * 5, H * 5 / ry);
  ctx.restore();
};
/* static noise tiles (built once, small, deterministic) */
const NOISE = [];
const noiseCv = (k) => {
  k = ((k % 4) + 4) % 4;
  if (NOISE[k]) return NOISE[k];
  const w = 96, h = 72, c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'), id = x.createImageData(w, h);
  for (let i = 0; i < w * h; i++) { const v = Math.pow(J.r(i, k, 4411), 1.4) * 255; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
  x.putImageData(id, 0, 0);
  NOISE[k] = c; return c;
};
const drawNoise = (env, x, y, w, h, a, step, seed) => {
  if (env.pass !== 'main' || a <= 0.003 || w < 1 || h < 1) return;
  const ctx = env.ctx, N = noiseCv(step + seed);
  ctx.save(); ctx.globalAlpha = a; ctx.imageSmoothingEnabled = false;
  const sx = Math.floor(J.r(seed, step, 1) * 32), sy = Math.floor(J.r(seed, step, 2) * 24);
  ctx.drawImage(N, sx, sy, N.width - sx, N.height - sy, x, y, w, h);
  ctx.restore();
};
/* shaky hand line (stroke) */
const shaky = (env, pts, col, lw, a, seed, amp) => {
  const out = pts.map((p, i) => [p[0] + J.rs(seed, i, 1) * amp, p[1] + J.rs(seed, i, 2) * amp]);
  env.line(out, col, lw, a, false);
};

/* ================================================================== 1. flashlight */
reg('hrFlashlight', {
  name: '懐中電灯', tags: TAGS.concat(['emotional']), w: 1, busy: true, ae: 'circle', fits: n => n >= 1 && n <= 18,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, rng.chance(0.6) ? ['serif', 'display'] : ['display'])), path: rng.pick(['read', 'read', 'search']), rk: rng.range(0.85, 1.1), dark: rng.range(0.9, 0.96), dust: rng.chance(0.7), sx: rng.range(-0.3, 0.3), sy: rng.range(-0.3, 0.3) };
  },
  render(env) {
    const { W, H, sc } = env, cut = env.cut, Pm = cut.params, lt = env.lt, s = cut.seed | 0;
    const text = J.splitLines(flat(cut.text), isPort(env) ? 5 : 10);
    const size = Math.min(J.fitSize(text, Pm.font, W * 0.8, H * 0.42, { track: 0.06, lead: 1.25 }), H * 0.24);
    const it = { text, font: Pm.font, size, x: W / 2, y: H / 2, track: 0.06, lead: 1.25, color: sc.fg };
    const bb = J.mainDraw(env, it);
    // the beam visits the glyphs in reading order, then opens up on the whole line
    const sl = slots(Object.assign({}, it));
    const m = J.measure(it);
    const R0 = Math.max(size * 0.9 * Pm.rk, U(env) * 0.1), Rall = Math.hypot(m.w, m.h) * 0.55 + size * 0.5;
    const dur = cut.dur, t0 = Pm.path === 'search' ? dur * 0.22 : 0.1, t1 = dur * 0.72;
    const u = J.clamp((lt - t0) / Math.max(0.2, t1 - t0));
    let bx, by;
    if (!sl.length) { bx = W / 2; by = H / 2; }
    else {
      const f = u * (sl.length - 1), i = Math.min(sl.length - 2, Math.floor(f)), k = E.inOutSine(f - Math.max(0, i));
      const a = sl[Math.max(0, i)], b = sl[Math.min(sl.length - 1, i + 1)];
      bx = sl.length === 1 ? a.x : J.lerp(a.x, b.x, k); by = sl.length === 1 ? a.y : J.lerp(a.y, b.y, k);
    }
    if (Pm.path === 'search' && lt < t0) {
      // hunting around the dark before it finds the words
      const q = E.inOutSine(J.clamp(lt / t0)), sx = W * (0.5 + Pm.sx) + J.noise1(lt * 1.3, s) * W * 0.25, sy = H * (0.5 + Pm.sy) + J.noise1(lt * 1.1, s + 3) * H * 0.2;
      bx = J.lerp(sx, bx, q * q); by = J.lerp(sy, by, q * q);
    }
    const tr = env.ltb;
    bx += (J.noise1(tr * 2.2, s + 5) * 0.7 + J.noise1(tr * 7, s + 6) * 0.3) * size * 0.18;
    by += (J.noise1(tr * 1.9, s + 7) * 0.7 + J.noise1(tr * 6.3, s + 8) * 0.3) * size * 0.14;
    const open = E.inOutCubic(J.clamp((lt - t1) / 0.7));
    bx = J.lerp(bx, W / 2, open); by = J.lerp(by, H / 2, open);
    let R = J.lerp(R0, Math.max(R0, Rall), open) * (0.3 + 0.7 * tin(env, 0, 0.35));
    // a weak battery: rare dips
    const dip = J.r(s, env.step, 31) < 0.05 ? 0.55 : 1;
    const dark = Pm.dark * tin(env, 0, 0.25) * (1 - E.inCubic(env.pOut) * 0.6);
    veilHole(env, bx, by, R * dip, dark, nightC(sc), 0.32, 0.86);
    if (Pm.dust && env.pass === 'main') {
      for (let k = 0; k < 14; k++) {
        const ph = J.r(s, k, 41) * 10, px = bx + J.noise1(tr * 0.3 + ph, s + k) * R * 0.8, py = by + J.noise1(tr * 0.25 + ph + 4, s + k + 50) * R * 0.7;
        const r = U(env) * J.rr(0.0012, 0.003, s, k, 42);
        env.circle(px, py, r, sc.fg, null, 0, 0.35 * dark * (0.5 + 0.5 * Math.sin(tr * 2 + ph)), false);
      }
    }
    return bb;
  },
});

/* ================================================================== 2. door gap */
reg('hrDoorGap', {
  name: '扉の隙間', tags: TAGS.concat(['editorial']), w: 0.9, busy: true, ae: 'vcols', fits: n => n >= 1 && n <= 16,
  plan(rng, cut, st) {
    const n = J.glyphCount(cut.text);
    return { font: rng.pick(fontsOf(st, ['serif', 'display'])), vert: n <= 7 && !hasLatin(cut.text) && rng.chance(0.75), side: rng.pick([-1, 1]), pause: rng.range(0.16, 0.26), wedge: rng.chance(0.8) };
  },
  render(env) {
    const { W, H, sc } = env, cut = env.cut, Pm = cut.params, lt = env.lt, s = cut.seed | 0, ctx = env.ctx;
    const vert = !!Pm.vert;
    const text = vert ? strip(cut.text) : J.splitLines(flat(cut.text), isPort(env) ? 5 : 11);
    const o = { track: 0.08, lead: 1.2, vertical: vert };
    const size = vert ? Math.min(J.fitSize(text, Pm.font, W * 0.3, H * 0.74, o), W * 0.2, H * 0.2) : Math.min(J.fitSize(text, Pm.font, W * 0.78, H * 0.36, o), H * 0.2);
    const it = Object.assign({ text, font: Pm.font, size, x: W / 2, y: H / 2, color: sc.fg }, o);
    const m = J.measure(it);
    // opening: a first crack, an uneasy pause, then wide enough to read; slams shut on the exit
    const full = (vert ? m.w : m.h) + size * 0.9;
    const d = cut.dur, a1 = J.clamp(lt / 0.5), a2 = J.clamp((lt - Math.max(0.35, d * Pm.pause)) / 0.6);
    let open = 0.18 * E.outCubic(a1) + 0.82 * E.inOutCubic(a2);
    open += J.rs(s, env.step, 11) * 0.015 * (a2 > 0 && a2 < 1 ? 1 : 0);
    open *= 1 - E.inExpo(env.pOut);
    const g = Math.max(0, full * open);
    const bb = J.mainDraw(env, it);
    if (env.pass !== 'main') return bb;
    const dk = nightC(sc), L = lightOf(sc);
    const cx = W / 2, cy = H / 2;
    ctx.save();
    ctx.globalAlpha = 0.97 * tin(env, 0, 0.2);
    ctx.fillStyle = dk; ctx.beginPath();
    ctx.rect(-W, -H, W * 3, H * 3);
    if (vert) { const h = m.h + size * 1.6; ctx.rect(cx - g / 2, cy - h / 2, g, h); }
    else { const w = m.w + size * 1.6; ctx.rect(cx - w / 2, cy - g / 2, w, g); }
    ctx.fill('evenodd');
    ctx.restore();
    if (g > 1) {
      // light rim on the gap edges + light spilling onto the floor
      const rimA = 0.55 * Math.min(1, g / (size * 0.3));
      if (vert) {
        const h = m.h + size * 1.6, y0 = cy - h / 2, y1 = cy + h / 2;
        env.line([[cx - g / 2, y0], [cx - g / 2, y1]], L, Math.max(1, size * 0.02), rimA, false);
        env.line([[cx + g / 2, y0], [cx + g / 2, y1]], L, Math.max(1, size * 0.02), rimA * 0.6, false);
        if (Pm.wedge) env.poly([[cx - g / 2, y1], [cx + g / 2, y1], [cx + g * 2.4 + W * 0.08 * Pm.side, H * 1.05], [cx - g * 1.6 + W * 0.08 * Pm.side, H * 1.05]], L, 0.07 * Math.min(1, g / size), false);
      } else {
        const w = m.w + size * 1.6, x0 = cx - w / 2, x1 = cx + w / 2;
        env.line([[x0, cy - g / 2], [x1, cy - g / 2]], L, Math.max(1, size * 0.02), rimA * 0.6, false);
        env.line([[x0, cy + g / 2], [x1, cy + g / 2]], L, Math.max(1, size * 0.02), rimA, false);
        
      }
    }
    return bb;
  },
});

/* ================================================================== 3. obsessive wall writing */
reg('hrWallScrawl', {
  name: '壁の落書き', tags: TAGS.concat(['glitch']), w: 0.9, busy: true, ae: 'tile', fits: n => n >= 1 && n <= 14,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display', 'serif'])), hand: handOf(rng, st), rows: rng.int(7, 10), mainHand: rng.chance(0.4), red: rng.range(0.06, 0.16), rise: rng.range(0.55, 0.8) };
  },
  render(env) {
    const { W, H, sc } = env, cut = env.cut, Pm = cut.params, s = cut.seed | 0, lt = env.lt;
    const unit = flat(cut.text);
    const mainFont = Pm.mainHand ? Pm.hand : Pm.font;
    const mt = J.splitLines(unit, isPort(env) ? 5 : 10);
    const size = Math.min(J.fitSize(mt, mainFont, W * 0.8, H * 0.3, { track: 0.04, lead: 1.1 }), H * 0.2);
    const mm = J.measure({ text: mt, font: mainFont, size, track: 0.04, lead: 1.1 });
    const clear = { x0: W / 2 - mm.w / 2 - size * 0.4, x1: W / 2 + mm.w / 2 + size * 0.4, y0: H / 2 - mm.h / 2 - size * 0.35, y1: H / 2 + mm.h / 2 + size * 0.35 };
    // copies written line after line, faster and faster
    const rows = Pm.rows, rh = H / rows, fs = rh * 0.58;
    const cw = J.measure({ text: unit, font: Pm.hand, size: fs, track: 0.02 }).w;
    let slotsL = [];
    const gN = Math.max(1, J.glyphCount(unit));
    for (let r = 0; r < rows && slotsL.length < 240; r++) {
      const y = (r + 0.5) * rh + J.rs(s, r, 1) * rh * 0.12;
      let x = W * 0.03 + J.r(s, r, 2) * fs * 2;
      for (let k = 0; k < 16 && x < W * 0.97; k++) {
        const sz = fs * J.rr(0.75, 1.3, s, r, k, 3), w = cw * sz / fs;
        const cxk = x + w / 2;
        if (!(y + sz * 0.6 > clear.y0 && y - sz * 0.6 < clear.y1 && x + w > clear.x0 && x < clear.x1) && x + w < W * 1.02) slotsL.push({ x: cxk, y, sz, r, k });
        x += w + fs * J.rr(0.4, 1.4, s, r, k, 4);
      }
    }
    const lim = Math.max(8, Math.min(64, Math.floor(420 / gN)));
    if (slotsL.length > lim) { const st2 = slotsL.length / lim; slotsL = Array.from({ length: lim }, (_, i) => slotsL[Math.floor(i * st2)]); }
    const K = slotsL.length, T = Math.max(0.6, cut.dur * Pm.rise), out = tout(env);
    let glyphBudget = 420;
    for (let q = 0; q < K; q++) {
      const S = slotsL[q], ta = T * Math.pow(q / Math.max(1, K), 0.62);
      const e = J.clamp((env.ltb - ta) / 0.3);
      if (e <= 0) break;
      if ((glyphBudget -= gN) < 0) break;
      const shown = Math.ceil(e * gN), seed = J.h(s, q, 9);
      const red = J.r(seed, 5) < Pm.red;
      env.draw({ text: unit, font: Pm.hand, size: S.sz, x: S.x, y: S.y, track: 0.02, rot: J.rs(seed, 6) * 5, color: red ? sc.accent : sc.sub, alpha: (red ? 0.7 : 0.42) * out, ghost: false,
        charFn: (i) => (i >= shown ? { hide: true } : { dy: J.rs(seed, i, 7) * S.sz * 0.12, rot: J.rs(seed, i, 8) * 9, s: 1 + J.rs(seed, i, 10) * 0.12 }) });
    }
    return J.mainDraw(env, { text: mt, font: mainFont, size, x: W / 2, y: H / 2, track: 0.04, lead: 1.1, color: sc.fg });
  },
});

/* ================================================================== 4. CCTV monitor */
reg('hrCctv', {
  name: '監視モニター', tags: TAGS.concat(['glitch', 'editorial']), w: 1, busy: true, treat: 'safe', ae: 'type', fits: n => n >= 1 && n <= 18,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display', 'body'])), v: rng.pick(['quad', 'quad', 'single']), act: rng.int(0, 3), cam0: rng.int(1, 12), box: rng.chance(0.7) };
  },
  render(env) {
    const { W, H, sc } = env, cut = env.cut, Pm = cut.params, s = cut.seed | 0, lt = env.lt, st = env.step;
    const mono = monoF(env), port = isPort(env), out = tout(env), inA = tin(env, 0, 0.2);
    const fs = J.clamp(U(env) * 0.022, 11, 28), m = U(env) * 0.03, lw = Math.max(1, U(env) * 0.0016);
    const feedBg = J.mix(darkOf(sc), '#000000', 0.35), LC = lightOf(sc), frameC = J.mix(feedBg, LC, 0.5);
    const date = fakeDate(s), time = fakeTime(s, lt);
    const osd = (x0, y0, x1, y1, n, live, bigFs) => {
      const f = bigFs || fs;
      env.draw({ text: 'CAM ' + pad2(n), font: mono, size: f, align: 'left', x: x0 + f * 0.8, y: y0 + f * 1.2, color: LC, alpha: 0.85 * out * inA, ghost: false, track: 0.1 });
      env.draw({ text: date + ' ' + time, font: mono, size: f * 0.9, align: 'right', x: x1 - f * 0.8, y: y1 - f * 1.1, color: LC, alpha: 0.75 * out * inA, ghost: false, track: 0.06 });
      if (live) {
        if (st % 4 < 2) env.circle(x1 - f * 3.9, y0 + f * 1.2, f * 0.32, J.fitContrast(sc.accent, feedBg, 3), null, 0, out * inA, false);
        env.draw({ text: 'REC', font: mono, size: f, align: 'left', x: x1 - f * 3.3, y: y0 + f * 1.2, color: LC, alpha: 0.85 * out * inA, ghost: false });
      }
    };
    const emptyFeed = (x0, y0, x1, y1, k) => {
      env.rect(x0, y0, x1 - x0, y1 - y0, feedBg, inA, false);
      const cx = (x0 + x1) / 2 + J.rs(s, k, 3) * (x1 - x0) * 0.12, cy = (y0 + y1) / 2 + J.rs(s, k, 4) * (y1 - y0) * 0.08, w = (x1 - x0) * 0.16, h = (y1 - y0) * 0.2;
      // a corridor seen from above a doorway
      const c = J.mix(feedBg, LC, 0.25), a = 0.8 * inA * out;
      env.line([[x0, y0], [cx - w, cy - h]], c, lw, a, false); env.line([[x1, y0], [cx + w, cy - h]], c, lw, a, false);
      env.line([[x0, y1], [cx - w, cy + h]], c, lw, a, false); env.line([[x1, y1], [cx + w, cy + h]], c, lw, a, false);
      env.line([[cx - w, cy - h], [cx + w, cy - h], [cx + w, cy + h], [cx - w, cy + h], [cx - w, cy - h]], c, lw, a, false);
      drawNoise(env, x0, y0, x1 - x0, y1 - y0, 0.07 * inA * out, st, s + k);
      if (J.r(s, k, 5) < 0.35) env.draw({ text: 'NO SIGNAL', font: mono, size: fs * 1.1, x: (x0 + x1) / 2, y: (y0 + y1) / 2, color: J.mix(feedBg, LC, 0.6), alpha: (st % 6 < 4 ? 0.8 : 0.3) * inA * out, ghost: false, track: 0.2 });
    };
    let bb = null, fx0 = m, fy0 = m, fx1 = W - m, fy1 = H - m;
    if (Pm.v === 'quad') {
      const g = lw * 3, cols = 2, rows = 2, cw = (W - m * 2 - g) / cols, chh = (H - m * 2 - g) / rows;
      for (let k = 0; k < 4; k++) {
        const c = k % 2, r = Math.floor(k / 2), x0 = m + c * (cw + g), y0 = m + r * (chh + g);
        if (k === Pm.act % 4) { fx0 = x0; fy0 = y0; fx1 = x0 + cw; fy1 = y0 + chh; env.rect(x0, y0, cw, chh, feedBg, inA, false); continue; }
        emptyFeed(x0, y0, x0 + cw, y0 + chh, k);
        osd(x0, y0, x0 + cw, y0 + chh, Pm.cam0 + k, false, fs * 0.8);
      }
    } else env.rect(fx0, fy0, fx1 - fx0, fy1 - fy0, feedBg, inA, false);
    // the live feed with the lyric
    const fw = fx1 - fx0, fh = fy1 - fy0;
    const text = J.splitLines(flat(cut.text), Pm.v === 'quad' ? (port ? 4 : 7) : (port ? 5 : 11));
    const size = Math.min(J.fitSize(text, Pm.font, fw * 0.82, fh * 0.46, { track: 0.05, lead: 1.2 }), fh * 0.3);
    drawNoise(env, fx0, fy0, fw, fh, 0.05 * inA * out, st, s + 7);
    bb = J.mainDraw(env, { text, font: Pm.font, size, x: fx0 + fw / 2, y: fy0 + fh / 2, track: 0.05, lead: 1.2, color: LC });
    // scanlines over the live feed
    if (env.pass === 'main') {
      const sp = Math.max(3, fh / 90);
      for (let y = fy0; y < fy1; y += sp * 2) env.rect(fx0, y, fw, sp * 0.6, '#000000', 0.12 * inA, false);
      const ry = fy0 + ((env.t * 0.13 + J.r(s, 9)) % 1) * fh;
      env.rect(fx0, ry, fw, fh * 0.05, LC, 0.03 * inA * out, false);
    }
    if (Pm.box && bb) {
      // motion detection box hunting the words
      const e = tin(env, cut.inDur * 0.6, 0.25) * out, jx = J.rs(s, st >> 1, 21) * size * 0.08, jy = J.rs(s, st >> 1, 22) * size * 0.08, pd = size * 0.25;
      if (e > 0) {
        const x0 = bb.x0 - pd + jx, y0 = bb.y0 - pd + jy, x1 = bb.x1 + pd + jx, y1 = bb.y1 + pd + jy, L = size * 0.3;
        const c = J.fitContrast(sc.accent, feedBg, 3), lw2 = Math.max(1.2, lw * 1.4);
        env.line([[x0, y0 + L], [x0, y0], [x0 + L, y0]], c, lw2, e, false); env.line([[x1 - L, y0], [x1, y0], [x1, y0 + L]], c, lw2, e, false);
        env.line([[x0, y1 - L], [x0, y1], [x0 + L, y1]], c, lw2, e, false); env.line([[x1 - L, y1], [x1, y1], [x1, y1 - L]], c, lw2, e, false);
        env.draw({ text: 'MOTION ' + pad2(1 + (J.h(s, 23) % 9)), font: mono, size: fs * 0.75, align: 'left', x: x0, y: y0 - fs * 0.7, color: c, alpha: e * (st % 3 ? 1 : 0.4), ghost: false, track: 0.1 });
      }
    }
    osd(fx0, fy0, fx1, fy1, Pm.cam0 + (Pm.act % 4), true);
    env.line([[fx0, fy0], [fx1, fy0], [fx1, fy1], [fx0, fy1], [fx0, fy0]], Pm.v === 'quad' ? J.fitContrast(sc.accent, feedBg, 3) : frameC, lw * (Pm.v === 'quad' ? 1.6 : 1), (Pm.v === 'quad' ? 0.85 : 0.5) * inA * out, false);
    return bb;
  },
});

/* ================================================================== 5. spirit board */
const KANA = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん';
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
reg('hrOuija', {
  name: '降霊盤', tags: TAGS, w: 0.7, portrait: 0.8, ae: 'type', fits: n => n >= 1 && n <= 14,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['serif', 'display'])), fontB: rng.pick(fontsOf(st, ['serif'])), jit: rng.range(0.45, 0.9), latin: hasLatin(cut.text) };
  },
  render(env) {
    const { W, H, sc } = env, cut = env.cut, Pm = cut.params, s = cut.seed | 0, lt = env.lt, port = isPort(env);
    const out = tout(env), inA = tin(env, 0, 0.35), u = U(env), lw = Math.max(1, u * 0.0018);
    // board
    const bw = Math.min(W * 0.88, H * (port ? 0.62 : 1.2)), bh = bw * (port ? 0.72 : 0.52), bx = W / 2, by = port ? H * 0.34 : H * 0.36;
    const plate = J.mix(sc.bg, sc.fg, isDark(sc.bg) ? 0.07 : 0.06);
    env.rrect(bx - bw / 2, by - bh / 2, bw, bh, bh * 0.14, plate, inA * out, false, J.mix(sc.bg, sc.sub, 0.6), lw);
    const rowsSrc = Pm.latin ? [ABC.slice(0, 13), ABC.slice(13), '1234567890'] : [KANA.slice(0, 16), KANA.slice(16, 32), KANA.slice(32)];
    const cells = [], bf = bh * (Pm.latin ? 0.1 : 0.085);
    rowsSrc.forEach((row, r) => {
      const arr = [...row], n = arr.length, R = bw * (0.64 - r * 0.17), cy = by + bh * (0.52 + r * 0.04), span = (r ? 96 : 112) * (port ? 0.95 : 1);
      if (r === 2) { arr.forEach((ch, i) => cells.push({ ch, x: bx + (i - (n - 1) / 2) * bw * 0.6 / Math.max(1, n - 1), y: by + bh * 0.3, rot: 0 })); return; }
      arr.forEach((ch, i) => {
        const a = (-90 - span / 2 + span * (n > 1 ? i / (n - 1) : 0.5)) * J.DEG;
        const x = bx + Math.cos(a) * R * 0.78, y = cy + Math.sin(a) * R * 0.62;
        cells.push({ ch, x, y, rot: (a / J.DEG + 90) * 0.7 });
      });
    });
    const col = J.mix(plate, sc.fg, 0.55);
    for (const c of cells) env.draw({ text: c.ch, font: Pm.fontB, size: bf, x: c.x, y: c.y, rot: c.rot, color: col, alpha: inA * out, ghost: false });
    const mono = Pm.fontB, cs = bf * 0.9;
    env.draw({ text: 'YES', font: mono, size: cs, x: bx - bw * 0.36, y: by - bh * 0.36, color: col, alpha: inA * out, ghost: false, track: 0.2 });
    env.draw({ text: 'NO', font: mono, size: cs, x: bx + bw * 0.36, y: by - bh * 0.36, color: col, alpha: inA * out, ghost: false, track: 0.2 });
    env.draw({ text: 'GOOD BYE', font: mono, size: cs, x: bx, y: by + bh * 0.42, color: col, alpha: inA * out, ghost: false, track: 0.3 });
    // lyric row + when each glyph is spelled out
    const text = flat(cut.text), chars = [...text].filter(c => c !== ' ');
    const n = chars.length;
    const rowY = port ? H * 0.74 : H * 0.8;
    const lines = n > (port ? 6 : 12) ? J.splitLines(text, Math.ceil(n / 2)) : text;
    const size = Math.min(J.fitSize(lines, Pm.font, W * 0.86, H * (port ? 0.26 : 0.2), { track: 0.18, lead: 1.2 }), H * 0.13);
    const sl = slots({ text: lines, font: Pm.font, size, x: W / 2, y: rowY, track: 0.18, lead: 1.2 });
    const span = cut.dur * 0.5, times = [];
    let acc = 0; const ws = [];
    for (let i = 0; i < n; i++) { const w = 0.35 + Pm.jit * J.r(s, i, 51) * 2; ws.push(w); acc += w; }
    let c0 = 0.25;
    for (let i = 0; i < n; i++) { c0 += ws[i] / acc * (span - 0.25); times.push(c0); }
    const target = (i) => {
      let ch = chars[i] || '';
      if (/[ァ-ヶ]/.test(ch)) ch = String.fromCharCode(ch.charCodeAt(0) - 0x60);
      ch = ch.toUpperCase();
      let c = cells.find(q => q.ch === ch);
      if (!c) c = cells[J.h(s, i, 52) % cells.length];
      return c;
    };
    // planchette position
    let px = bx, py = by + bh * 0.1, cur = -1;
    for (let i = 0; i < n; i++) if (env.ltb >= times[i] - Math.min(0.4, (times[i] - (i ? times[i - 1] : 0)) * 0.75)) cur = i;
    if (cur >= 0) {
      const tA = cur ? times[cur - 1] : 0, tB = times[cur], mv = Math.min(0.4, (tB - tA) * 0.75);
      const A = cur ? target(cur - 1) : { x: px, y: py }, B = target(cur);
      const k = E.inOutCubic(J.clamp((env.ltb - (tB - mv)) / mv));
      px = J.lerp(A.x, B.x, k) + Math.sin(k * Math.PI) * bh * 0.06; py = J.lerp(A.y, B.y, k) + bf * 1.2;
    } else py += bf * 1.2;
    // idle circling
    px += Math.sin(env.ltb * 2.1 + s) * bf * 0.12; py += Math.cos(env.ltb * 1.7 + s) * bf * 0.1;
    const pr = bf * 1.2, pc = sc.fg, pa = inA * out;
    env.poly([[px, py - pr * 2.3], [px + pr * 1.5, py + pr * 0.4], [px + pr * 0.9, py + pr * 1.3], [px - pr * 0.9, py + pr * 1.3], [px - pr * 1.5, py + pr * 0.4]], J.mix(plate, sc.fg, 0.12), pa * 0.85, false);
    env.line([[px, py - pr * 2.3], [px + pr * 1.5, py + pr * 0.4], [px + pr * 0.9, py + pr * 1.3], [px - pr * 0.9, py + pr * 1.3], [px - pr * 1.5, py + pr * 0.4], [px, py - pr * 2.3]], pc, lw * 1.4, pa, false);
    env.circle(px, py - pr * 0.75, pr * 0.62, null, pc, lw * 1.4, pa, false);
    if (cur >= 0) { const B = target(cur); if (Math.hypot(B.x - px, B.y - (py - bf * 1.2)) < bf * 0.8) env.draw({ text: B.ch, font: Pm.fontB, size: bf * 1.25, x: B.x, y: B.y, rot: B.rot, color: sc.accent, alpha: pa, ghost: false }); }
    let bb = null;
    sl.forEach((g, i) => { bb = UB(bb, J.mainDraw(env, { text: g.ch, font: Pm.font, size, x: g.x, y: g.y, color: sc.fg, mi: miAt(env, times[i] || 0) })); });
    return bb || box(W * 0.2, rowY - size, W * 0.8, rowY + size);
  },
});

/* ================================================================== 6. missing poster */
reg('hrMissing', {
  name: '尋ね人', tags: TAGS.concat(['editorial']), w: 0.8, treat: 'safe', ae: 'labels', fits: n => n >= 1 && n <= 16,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display', 'serif'])), fontH: rng.pick(fontsOf(st, ['display'])), ang: rng.range(-3.5, 3.5), off: rng.range(-0.06, 0.06), torn: rng.int(1, 3), stains: rng.int(1, 3) };
  },
  render(env) {
    const { W, H, sc, ctx } = env, cut = env.cut, Pm = cut.params, s = cut.seed | 0, port = isPort(env), u = U(env);
    const out = tout(env), q = E.outBack(J.clamp(env.lt / 0.3), 1.3);
    if (q <= 0) return null;
    const ph = H * 0.9, pw = Math.min(W * (port ? 0.86 : 0.5), ph * 0.72);
    const cx = W / 2 + Pm.off * W * (port ? 0.3 : 1), cy = H / 2;
    const paper = isDark(sc.bg) ? J.mix(lightOf(sc), sc.sub, 0.12) : J.mix(sc.bg, '#FFFFFF', 0.62), ink = onCol(sc, paper), red = redOn(sc, paper);
    const ang = Pm.ang, rad = ang * J.DEG, cs = Math.cos(rad), sn = Math.sin(rad);
    const P2 = (lx, ly) => [cx + lx * cs - ly * sn, cy + lx * sn + ly * cs];
    const sq = 1.06 - 0.06 * q;
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rad); ctx.scale(sq, sq);
    const x0 = -pw / 2, y0 = -ph / 2;
    env.rect(x0 + u * 0.012, y0 + u * 0.016, pw, ph, '#000000', 0.25 * out, false);
    env.rect(x0, y0, pw, ph, paper, out, false);
    // stains
    for (let k = 0; k < Pm.stains; k++) {
      const sx = x0 + pw * J.rr(0.22, 0.78, s, k, 1), sy = y0 + ph * J.rr(0.2, 0.8, s, k, 2), R = pw * J.rr(0.05, 0.12, s, k, 3), pts = [];
      for (let i = 0; i < 12; i++) { const a = i / 12 * J.TAU, r = R * (0.7 + 0.5 * J.r(s, k, i, 4)); pts.push([sx + Math.cos(a) * r, sy + Math.sin(a) * r * 0.8]); }
      env.blob(pts, J.mix(paper, sc.sub, 0.35), 0.35 * out, false);
    }
    const hs = pw * 0.15;
    env.draw({ text: 'MISSING', font: Pm.fontH, size: hs, x: 0, y: y0 + ph * 0.09, track: 0.08, color: red, alpha: out, ghost: false, sx: 0.92 });
    // photo with a faceless head-and-shoulders silhouette
    const fw = pw * 0.52, fh = fw * 1.18, fx = -fw / 2, fy = y0 + ph * 0.17;
    const photo = J.mix(ink, paper, 0.25);
    env.rect(fx, fy, fw, fh, photo, out, false);
    const sil = J.mix(ink, paper, 0.05);
    env.circle(0, fy + fh * 0.42, fw * 0.2, sil, null, 0, out, false);
    env.blob([[-fw * 0.42, fy + fh], [-fw * 0.36, fy + fh * 0.76], [-fw * 0.12, fy + fh * 0.66], [fw * 0.12, fy + fh * 0.66], [fw * 0.36, fy + fh * 0.76], [fw * 0.42, fy + fh]], sil, out, false);
    if (env.pass === 'main') {
      const g = ctx.createLinearGradient(0, fy, 0, fy + fh);
      g.addColorStop(0, J.rgba(paper, 0.28)); g.addColorStop(0.5, J.rgba(paper, 0)); g.addColorStop(1, J.rgba(paper, 0.18));
      ctx.globalAlpha = out; ctx.fillStyle = g; ctx.fillRect(fx, fy, fw, fh); ctx.globalAlpha = 1;
    }
    // tape
    for (const sgn of [-1, 1]) {
      ctx.save(); ctx.translate(sgn * pw * 0.4, y0 + ph * 0.005); ctx.rotate(sgn * 28 * J.DEG);
      env.rect(-pw * 0.1, -pw * 0.03, pw * 0.2, pw * 0.06, J.mix(paper, sc.sub, 0.25), 0.7 * out, false);
      ctx.restore();
    }
    // info lines
    const mono = monoF(env), fs = pw * 0.034, ly = fy + fh + ph * 0.24;
    env.draw({ text: 'LAST SEEN ' + fakeDate(s, '.') + '  ' + fakeTime(s, 0).slice(0, 5), font: mono, size: fs, x: 0, y: ly, color: ink, alpha: out * 0.85, ghost: false, track: 0.06 });
    const sub = flat(cut.lineText || cut.text);
    env.draw({ text: sub.length > 22 ? sub.slice(0, 21) + '…' : sub, font: bodyF(env), size: fs * 1.05, x: 0, y: ly + fs * 1.7, color: ink, alpha: out * 0.7, ghost: false, track: 0.05 });
    // tear-off tabs
    const tabs = 7, tw = pw / tabs, ty = y0 + ph * 0.86, th = ph * 0.14;
    for (let k = 0; k < tabs; k++) {
      if (J.h(s, k, 61) % 7 < Pm.torn) continue;
      const tx = x0 + k * tw;
      env.line([[tx, ty], [tx, ty + th]], J.mix(paper, ink, 0.4), Math.max(1, u * 0.001), out, false);
      ctx.save(); ctx.translate(tx + tw / 2, ty + th / 2); ctx.rotate(-Math.PI / 2);
      env.draw({ text: 'TEL 0' + (J.h(s, 7) % 90 + 10) + '-' + (J.h(s, 8) % 9000 + 1000), font: mono, size: Math.min(tw * 0.42, th * 0.1), x: 0, y: 0, color: ink, alpha: out * 0.8, ghost: false });
      ctx.restore();
    }
    env.line([[x0, ty], [x0 + pw, ty]], J.mix(paper, ink, 0.4), Math.max(1, u * 0.001), out, false);
    ctx.restore();
    // the lyric as the name
    const text = J.splitLines(flat(cut.text), port ? 6 : 7);
    const lyY = fy + fh + ph * 0.1;
    const size = Math.min(J.fitSize(text, Pm.font, pw * 0.86, ph * 0.13, { track: 0.04, lead: 1.1 }), pw * 0.16);
    const [lx, lyy] = P2(0, lyY * sq);
    const bb = J.mainDraw(env, { text, font: Pm.font, size: size * sq, x: lx, y: lyy, rot: ang, track: 0.04, lead: 1.1, color: ink, plain: false });
    return bb || box(cx - pw / 2, cy - ph / 2, cx + pw / 2, cy + ph / 2);
  },
});

/* ================================================================== 7. the one wrong glyph */
reg('hrWrongOne', {
  name: '一字だけ違う', tags: TAGS.concat(['editorial', 'calm']), w: 1, ae: 'mixed', fits: n => n >= 2 && n <= 16,
  plan(rng, cut, st) {
    const cs = [...flat(cut.text)].map((c, i) => [c, i]).filter(([c]) => c !== ' ' && !J.isPunct(c));
    const kan = cs.filter(([c]) => J.isKanji(c) || J.isKata(c) || /[A-Za-z]/.test(c));
    const pool = kan.length ? kan : cs;
    const pick = pool.length ? pool[rng.int(0, pool.length - 1)][1] : 0;
    return { font: rng.pick(fontsOf(st, ['serif', 'display'])), wrong: pick, ang: rng.pick([28, 90, 180, -90, -35]), red: rng.chance(0.35), nums: rng.chance(0.7), sink: rng.range(0.06, 0.2) };
  },
  render(env) {
    const { W, H, sc } = env, cut = env.cut, Pm = cut.params, s = cut.seed | 0, lt = env.lt, port = isPort(env);
    const text = J.splitLines(flat(cut.text), port ? 5 : 9);
    const o = { track: 0.22, lead: 1.5 };
    const size = Math.min(J.fitSize(text, Pm.font, W * 0.82, H * 0.46, o), H * 0.2);
    const all = slots(Object.assign({ text, font: Pm.font, size, x: W / 2, y: H / 2 }, o));
    // index into the flat text (spaces kept) → slot index
    const flatArr = [...flat(cut.text)];
    let wi = 0; for (let i = 0, k = 0; i < flatArr.length; i++) { if (flatArr[i] === ' ') continue; if (i === Pm.wrong) { wi = k; break; } k++; }
    wi = Math.min(wi, all.length - 1);
    const d = cut.dur, turnAt = d * 0.35;
    let bb = null;
    all.forEach((g, i) => {
      const it = { text: g.ch, font: Pm.font, size, x: g.x, y: g.y, color: sc.fg, mi: i };
      if (i === wi) {
        // it turns slowly while the rest never move — with a sudden twitch now and then
        const q = E.inOutSine(J.clamp((lt - turnAt) / Math.max(0.5, d * 0.45)));
        const twitch = J.r(s, env.step >> 1, 71) < 0.07 && lt > turnAt ? J.rs(s, env.step, 72) * 14 : 0;
        it.rot = Pm.ang * q + twitch;
        it.y += size * Pm.sink * q;
        it.x += J.rs(s, env.step >> 2, 73) * size * 0.015 * q;
        if (Pm.red) it.color = J.mix(sc.fg, sc.accent, q);
        it.noHold = true;
      }
      bb = UB(bb, J.mainDraw(env, it));
    });
    if (Pm.nums && all.length) {
      const e = tin(env, cut.inDur * 0.8, 0.3) * tout(env), fs = J.clamp(size * 0.14, 9, 22), mono = monoF(env);
      if (e > 0) all.forEach((g, i) => {
        const wrong = i === wi && lt > turnAt + 0.3;
        env.draw({ text: wrong ? '??' : pad2(i + 1), font: mono, size: fs, x: g.x, y: g.y + size * 0.72, color: wrong ? sc.accent : sc.sub, alpha: e * (wrong ? 1 : 0.7), ghost: false, track: 0.1 });
      });
    }
    return bb;
  },
});

/* ================================================================== 8. rising out of the dark */
reg('hrRisingDark', {
  name: '闇から這い出る', tags: TAGS.concat(['emotional']), w: 0.8, ae: 'wave', fits: n => n >= 1 && n <= 14,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display', 'serif'])), pulls: rng.int(3, 5), span: rng.range(0.45, 0.6), rim: rng.chance(0.8) };
  },
  render(env) {
    const { W, H, sc, ctx } = env, cut = env.cut, Pm = cut.params, s = cut.seed | 0, lt = env.lt, port = isPort(env);
    const text = J.splitLines(flat(cut.text), port ? 5 : 9);
    const o = { track: 0.06, lead: 1.2 };
    const size = Math.min(J.fitSize(text, Pm.font, W * 0.82, H * 0.34, o), H * 0.2);
    const cy = H * 0.44;
    const all = slots(Object.assign({ text, font: Pm.font, size, x: W / 2, y: cy }, o));
    const nl = text.split('\n').length, bottom = cy + (nl * size * 1.2) / 2;
    const surf = bottom + size * 0.3;
    const T = cut.dur * Pm.span;
    let bb = null;
    all.forEach((g, i) => {
      // hand over hand: a few sudden pulls at uneasy moments
      let prog = 0;
      for (let k = 0; k < Pm.pulls; k++) {
        const tk = J.clamp(J.r(s, i, k, 81) * 0.8 + k * 0.2 / Pm.pulls * 1.0) * T * (k + 1) / Pm.pulls;
        prog += E.outCubic(J.clamp((env.ltb - tk) / 0.14)) / Pm.pulls;
      }
      const rest = surf - g.y + size * 0.62, dy = (1 - prog) * rest;
      const shake = prog < 1 ? J.rs(s, i, env.step, 82) * size * 0.02 : 0;
      bb = UB(bb, J.mainDraw(env, { text: g.ch, font: Pm.font, size, x: g.x + shake, y: g.y + dy, rot: (1 - prog) * J.rs(s, i, 83) * 16, color: sc.fg, mi: 0 }));
    });
    // the dark pool (drawn over the glyphs still under it)
    if (env.pass === 'main') {
      const pc = nightC(sc), pts = [], n = 48, a = tout(env), t = env.ltb;
      for (let j = 0; j <= n; j++) { const x = -W * 0.1 + W * 1.2 * j / n; pts.push([x, surf + (J.noise1(j * 0.35 + t * 0.6, s) * 0.6 + Math.sin(j * 0.9 + t * 1.4) * 0.15) * size * 0.12]); }
      ctx.save(); ctx.globalAlpha = a;
      const g = ctx.createLinearGradient(0, surf - size * 0.1, 0, H);
      g.addColorStop(0, J.rgba(pc, 0.96)); g.addColorStop(1, J.rgba(J.mix(pc, '#000000', 0.5), 1));
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-W * 0.2, H * 1.2);
      for (const p of pts) ctx.lineTo(p[0], p[1]);
      ctx.lineTo(W * 1.2, H * 1.2); ctx.closePath(); ctx.fill();
      ctx.restore();
      if (Pm.rim) env.line(pts, sc.sub, Math.max(1, size * 0.012), 0.35 * a, false);
    }
    return bb ? Object.assign(bb, { y1: Math.min(bb.y1, surf) }) : null;
  },
});

/* ================================================================== 9. redacted file */
reg('hrRedacted', {
  name: '黒塗り文書', tags: TAGS.concat(['editorial']), w: 0.8, busy: true, ae: 'type', fits: n => n >= 1 && n <= 20,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['serif', 'body', 'mono'])), row: rng.range(0.42, 0.58), stamp: rng.chance(0.75), stampAng: rng.range(-14, -6), leak: rng.range(0.1, 0.25) };
  },
  render(env) {
    const { W, H, sc, ctx } = env, cut = env.cut, Pm = cut.params, s = cut.seed | 0, lt = env.lt, port = isPort(env), u = U(env);
    const out = tout(env), inA = tin(env, 0, 0.25);
    const mx = W * (port ? 0.08 : 0.12), mw = W - mx * 2, mono = monoF(env);
    const fs = J.clamp(u * 0.028, 12, 34), rh = fs * 2.1;
    const barC = J.mix(sc.fg, sc.bg, 0.08), txtC = sc.sub;
    // header
    env.draw({ text: 'FILE No. ' + (J.h(s, 1) % 9000 + 1000) + '   ' + fakeDate(s, '.'), font: mono, size: fs * 0.8, align: 'left', x: mx, y: H * 0.08, color: txtC, alpha: inA * out, ghost: false, track: 0.08 });
    env.line([[mx, H * 0.08 + fs], [mx + mw * inA, H * 0.08 + fs]], txtC, Math.max(1, u * 0.0012), 0.6 * out, false);
    // the lyric line
    const text = J.splitLines(flat(cut.text), port ? 7 : 16);
    const nl = text.split('\n').length;
    const size = Math.min(J.fitSize(text, Pm.font, mw, H * 0.24, { track: 0.06, lead: 1.3 }), H * 0.1, fs * 3.4);
    const ly = H * Pm.row, lh = nl * size * 1.3;
    // filler rows: body text blacked out
    const body = flat(cut.lineText || cut.text) + '　';
    const rowsN = Math.floor((H * 0.84 - H * 0.14) / rh);
    for (let r = 0; r < rowsN; r++) {
      const y = H * 0.15 + r * rh;
      if (Math.abs(y - ly) < lh / 2 + rh * 0.7) continue;
      const e = J.clamp((env.ltb - r * 0.025) / 0.2) * out; if (e <= 0) continue;
      const len = r % 5 === 4 ? J.rr(0.3, 0.6, s, r, 2) : J.rr(0.85, 1, s, r, 2);
      if (env.pass === 'main') {
        ctx.save(); ctx.beginPath(); ctx.rect(mx, y - rh / 2, mw * len, rh); ctx.clip();
        env.draw({ text: body.repeat(6), font: bodyF(env), size: fs, align: 'left', x: mx, y, color: txtC, alpha: 0.6 * e, ghost: false, track: 0.05 });
        ctx.restore();
      }
      // bars
      let x = mx;
      while (x < mx + mw * len) {
        const w = mw * J.rr(0.08, 0.35, s, r, Math.round(x), 3), gap = fs * J.rr(0.4, 2.4, s, r, Math.round(x), 4);
        if (J.r(s, r, Math.round(x), 5) > Pm.leak) env.rect(x, y - fs * 0.62, Math.min(w, mx + mw * len - x) * e, fs * 1.24, barC, out, false);
        x += w + gap;
      }
    }
    const bb = J.mainDraw(env, { text, font: Pm.font, size, x: mx, y: ly, align: 'left', track: 0.06, lead: 1.3, color: sc.fg });
    // the bar over the lyric slides off, sticks, then goes
    if (env.pass === 'main') {
      const m = J.measure({ text, font: Pm.font, size, align: 'left', track: 0.06, lead: 1.3 });
      const d0 = cut.inDur * 0.3, k1 = E.inOutCubic(J.clamp((lt - d0) / 0.25)) * 0.35, k2 = E.inOutCubic(J.clamp((lt - d0 - 0.25 - cut.dur * 0.08) / 0.3)) * 0.65;
      const k = k1 + k2, bw = (m.w + size * 0.4) * (1 - k);
      if (bw > 0.5) env.rect(mx - size * 0.2 + (m.w + size * 0.4) * k, ly - m.h / 2 - size * 0.12, bw, m.h + size * 0.24, barC, inA, false);
    }
    if (Pm.stamp) {
      const at = cut.dur * 0.45, q = J.clamp((lt - at) / 0.12);
      if (q > 0) {
        const sc2 = 1.6 - 0.6 * E.outCubic(q), a = Math.min(1, q * 2) * out * 0.85, ss = fs * 1.6, word = 'CLASSIFIED';
        const tw = J.measure({ text: word, font: mono, size: ss, track: 0.2 }).w;
        ctx.save(); ctx.translate(W - mx - tw * 0.55, H * 0.8); ctx.rotate(Pm.stampAng * J.DEG); ctx.scale(sc2, sc2);
        env.rrect(-tw / 2 - ss * 0.5, -ss * 0.9, tw + ss, ss * 1.8, ss * 0.2, null, a, false, sc.accent, Math.max(2, ss * 0.1));
        env.draw({ text: word, font: mono, size: ss, x: 0, y: 0, color: sc.accent, alpha: a, ghost: false, track: 0.2 });
        ctx.restore();
      }
    }
    return bb;
  },
});

/* ================================================================== 10. static TV */
reg('hrStaticTv', {
  name: '砂嵐のテレビ', tags: TAGS.concat(['glitch']), w: 0.8, treat: 'safe', ae: 'circle', fits: n => n >= 1 && n <= 14,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display', 'body'])), off: rng.range(-0.06, 0.06), tune: rng.range(0.3, 0.5), ant: rng.range(18, 34) };
  },
  render(env) {
    const { W, H, sc, ctx } = env, cut = env.cut, Pm = cut.params, s = cut.seed | 0, lt = env.lt, port = isPort(env), u = U(env);
    const out = tout(env), inA = tin(env, 0, 0.3);
    const tw = Math.min(W * (port ? 0.86 : 0.62), H * (port ? 0.5 : 0.8) * 1.3), th = tw / 1.3;
    const cx = W / 2 + Pm.off * W, cy = H / 2 + th * 0.06;
    const body = J.mix(sc.bg, sc.fg, isDark(sc.bg) ? 0.13 : 0.22), edge = J.mix(body, sc.fg, 0.3), lw = Math.max(1, u * 0.0018);
    // glow of the screen into the room
    if (env.pass === 'main') {
      const g = ctx.createRadialGradient(cx, cy, th * 0.3, cx, cy, Math.max(W, H) * 0.7);
      g.addColorStop(0, J.rgba(lightOf(sc), (0.1 * inA * out).toFixed(3))); g.addColorStop(1, J.rgba(lightOf(sc), 0));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    // antenna, body, knobs
    const top = cy - th / 2;
    for (const sg of [-1, 1]) {
      const a = (90 + sg * Pm.ant + Math.sin(env.ltb * 0.7 + sg) * 1.5) * J.DEG;
      env.line([[cx, top], [cx - Math.cos(a) * th * 0.45, top - Math.sin(a) * th * 0.45]], edge, lw * 2, inA * out, false);
    }
    env.rrect(cx - tw / 2, top, tw, th, th * 0.08, body, inA * out, false, edge, lw * 1.5);
    const sw = tw * 0.72, sh = th * 0.78, sx0 = cx - tw / 2 + tw * 0.05, sy0 = top + th * 0.11;
    const kx = sx0 + sw + (tw - sw - tw * 0.05) / 2;
    for (let k = 0; k < 2; k++) env.circle(kx, top + th * (0.25 + k * 0.2), tw * 0.035, J.mix(body, sc.bg, 0.4), edge, lw, inA * out, false);
    for (let k = 0; k < 5; k++) env.line([[kx - tw * 0.04, top + th * (0.62 + k * 0.05)], [kx + tw * 0.04, top + th * (0.62 + k * 0.05)]], edge, lw, inA * out * 0.8, false);
    env.rect(cx - tw * 0.36, top + th, tw * 0.05, th * 0.06, body, inA * out, false);
    env.rect(cx + tw * 0.31, top + th, tw * 0.05, th * 0.06, body, inA * out, false);
    // screen: static that slowly gives way to the words
    const scr = J.mix(sc.bg, '#000000', 0.6);
    env.rrect(sx0, sy0, sw, sh, sh * 0.1, scr, inA, false);
    const tune = E.inOutCubic(J.clamp((lt - 0.15) / (cut.dur * Pm.tune)));
    const burst = J.r(s, env.step, 91) < 0.06 ? 0.35 : 0;
    if (env.pass === 'main') {
      ctx.save(); ctx.beginPath(); ctx.rect(sx0 + sh * 0.03, sy0 + sh * 0.03, sw - sh * 0.06, sh - sh * 0.06); ctx.clip();
      drawNoise(env, sx0, sy0, sw, sh, (0.85 - 0.6 * tune + burst) * inA, env.step, s);
      ctx.restore();
    }
    const tc = J.lum(sc.fg) > 0.5 ? sc.fg : '#FFFFFF';
    const text = J.splitLines(flat(cut.text), port ? 5 : 7);
    const size = Math.min(J.fitSize(text, Pm.font, sw * 0.82, sh * 0.6, { track: 0.04, lead: 1.15 }), sh * 0.36);
    const roll = (1 - tune) * sh * 0.08 * Math.sin(env.ltb * 23);
    ctx.save();
    ctx.beginPath(); ctx.rect(sx0, sy0, sw, sh); ctx.clip();
    const bb = J.mainDraw(env, { text, font: Pm.font, size, x: sx0 + sw / 2, y: sy0 + sh / 2 + roll, track: 0.04, lead: 1.15, color: tc, alpha: 0.55 + 0.45 * tune });
    ctx.restore();
    if (env.pass === 'main') {
      // curvature highlight + scanlines
      const sp = Math.max(3, sh / 70);
      for (let y = sy0; y < sy0 + sh; y += sp * 2) env.rect(sx0, y, sw, sp * 0.5, '#000000', 0.18 * inA, false);
      env.rrect(sx0 + sw * 0.06, sy0 + sh * 0.05, sw * 0.4, sh * 0.12, sh * 0.06, J.rgba('#FFFFFF', 0.05), inA * out, false);
    }
    return bb ? bb : box(sx0, sy0, sx0 + sw, sy0 + sh);
  },
});

/* ================================================================== 11. spirit photo */
reg('hrSpiritPhoto', {
  name: '心霊写真', tags: TAGS.concat(['emotional']), w: 0.8, ae: 'gloss', fits: n => n >= 1 && n <= 16,
  plan(rng, cut, st) {
    return { hand: handOf(rng, st), ang: rng.range(-5, 5), spot: [rng.range(0.25, 0.75), rng.range(0.3, 0.6)], win: rng.chance(0.6), side: rng.pick([1, -1]) };
  },
  render(env) {
    const { W, H, sc, ctx } = env, cut = env.cut, Pm = cut.params, s = cut.seed | 0, lt = env.lt, port = isPort(env), u = U(env);
    const out = tout(env), inA = tin(env, 0, 0.3);
    // photo placement: left (landscape) or top (portrait); the note on the other side
    const pw = port ? W * 0.78 : Math.min(W * 0.46, H * 0.86 * 1.25), ph = pw / 1.25;
    const pcx = port ? W / 2 : (Pm.side > 0 ? W * 0.3 : W * 0.7), pcy = port ? H * 0.33 : H * 0.5;
    const rad = Pm.ang * J.DEG, cs = Math.cos(rad), sn = Math.sin(rad);
    const T = (lx, ly) => [pcx + lx * cs - ly * sn, pcy + lx * sn + ly * cs];
    const border = J.mix(lightOf(sc), sc.sub, 0.1), dark = J.mix(darkOf(sc), '#000000', 0.35);
    const develop = E.inOutSine(J.clamp(lt / Math.max(0.6, cut.dur * 0.35)));
    ctx.save(); ctx.translate(pcx, pcy); ctx.rotate(rad);
    const bw = u * 0.018;
    env.rect(-pw / 2 - bw + u * 0.01, -ph / 2 - bw + u * 0.012, pw + bw * 2, ph + bw * 3, '#000000', 0.25 * inA * out, false);
    env.rect(-pw / 2 - bw, -ph / 2 - bw, pw + bw * 2, ph + bw * 3.2, border, inA * out, false);
    env.rect(-pw / 2, -ph / 2, pw, ph, dark, inA * out, false);
    const mid = J.mix(dark, border, 0.22 * develop);
    if (Pm.win) {
      const wx = -pw * 0.3, wy = -ph * 0.32, ww = pw * 0.3, wh = ph * 0.45, lw = Math.max(1, u * 0.004);
      env.rect(wx, wy, ww, wh, J.mix(dark, border, 0.12 * develop), inA * out, false);
      env.line([[wx + ww / 2, wy], [wx + ww / 2, wy + wh]], dark, lw, inA * out, false);
      env.line([[wx, wy + wh / 2], [wx + ww, wy + wh / 2]], dark, lw, inA * out, false);
    }
    env.rect(-pw / 2, ph * 0.18, pw, ph * 0.32, mid, 0.6 * inA * out, false);
    const spx = -pw / 2 + pw * Pm.spot[0], spy = -ph / 2 + ph * Pm.spot[1], sr = pw * 0.09;
    if (env.pass === 'main') {
      const g = ctx.createRadialGradient(spx, spy, 0, spx, spy, sr * 1.6);
      g.addColorStop(0, J.rgba(border, (0.55 * develop).toFixed(3))); g.addColorStop(1, J.rgba(border, 0));
      ctx.globalAlpha = inA * out; ctx.fillStyle = g;
      ctx.save(); ctx.translate(spx, spy); ctx.scale(0.75, 1.25); ctx.translate(-spx, -spy); ctx.fillRect(spx - sr * 2, spy - sr * 2, sr * 4, sr * 4); ctx.restore();
      ctx.globalAlpha = 1;
    }
    env.draw({ text: "'" + fakeDate(s, ' ').slice(2), font: monoF(env), size: ph * 0.055, align: 'right', x: pw / 2 - ph * 0.05, y: ph / 2 - ph * 0.06, color: J.fitContrast(sc.accent, dark, 3), alpha: 0.9 * develop * out, ghost: false, track: 0.1 });
    // red marker ring around the smudge
    const ringE = E.outCubic(J.clamp((lt - cut.dur * 0.3) / 0.5)) * out;
    if (ringE > 0) {
      const pts = [], n = 40, rr = sr * 1.5;
      for (let i = 0; i <= n * 1.15; i++) { const a = i / n * J.TAU - 1.2, w = 1 + 0.12 * J.noise1(i * 0.3, s) + i / n * 0.08; pts.push([spx + Math.cos(a) * rr * w * 0.8, spy + Math.sin(a) * rr * w]); }
      env.polyPartial(pts, ringE, sc.accent, Math.max(2, u * 0.005), 0.95, false);
    }
    ctx.restore();
    // arrow to the note and the note itself (the lyric, handwritten)
    const text = J.splitLines(flat(cut.text), port ? 7 : 6);
    const nx = port ? W / 2 : (Pm.side > 0 ? W * 0.76 : W * 0.24), ny = port ? H * 0.75 : H * 0.5;
    const size = Math.min(J.fitSize(text, Pm.hand, port ? W * 0.84 : W * 0.38, H * (port ? 0.26 : 0.46), { track: 0.02, lead: 1.2 }), H * 0.14);
    const [ax, ay] = T(spx + sr * 1.4 * (port ? 0.3 : Pm.side), spy + sr * (port ? 1.6 : 0.3));
    const nm = J.measure({ text, font: Pm.hand, size, track: 0.02, lead: 1.2 });
    const tx = port ? nx : nx - Pm.side * (nm.w / 2 + size * 0.35), ty = port ? ny - nm.h / 2 - size * 0.35 : ny;
    const ae = E.outCubic(J.clamp((lt - cut.dur * 0.3 - 0.35) / 0.35)) * out;
    if (ae > 0) {
      const mx = (ax + tx) / 2 + (port ? W * 0.1 : 0), my = (ay + ty) / 2 - (port ? 0 : H * 0.1);
      const pts = []; for (let i = 0; i <= 16; i++) { const k = i / 16; pts.push([(1 - k) * (1 - k) * ax + 2 * k * (1 - k) * mx + k * k * tx, (1 - k) * (1 - k) * ay + 2 * k * (1 - k) * my + k * k * ty]); }
      env.polyPartial(pts.slice().reverse(), ae, sc.accent, Math.max(2, u * 0.004), 0.9, false);
      if (ae > 0.95) { const [x1, y1] = pts[0], [x2, y2] = pts[2], an = Math.atan2(y1 - y2, x1 - x2), L = u * 0.03; env.line([[x1 + Math.cos(an + 2.6) * L, y1 + Math.sin(an + 2.6) * L], [x1, y1], [x1 + Math.cos(an - 2.6) * L, y1 + Math.sin(an - 2.6) * L]], sc.accent, Math.max(2, u * 0.004), 0.9, false); }
    }
    return J.mainDraw(env, { text, font: Pm.hand, size, x: nx, y: ny, track: 0.02, lead: 1.2, rot: -Pm.ang * 0.4, color: sc.fg });
  },
});

/* ================================================================== 12. the shadow that does not match */
reg('hrWrongShadow', {
  name: '影が違う', tags: TAGS.concat(['emotional', 'graphic']), w: 0.9, ae: 'stack', fits: n => n >= 1 && n <= 12,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display', 'serif'])), k: rng.range(1.5, 1.9), turn: rng.range(0.45, 0.65), dir: rng.pick([1, -1]), lean: rng.range(4, 9) };
  },
  render(env) {
    const { W, H, sc, ctx } = env, cut = env.cut, Pm = cut.params, s = cut.seed | 0, lt = env.lt, port = isPort(env);
    const text = J.splitLines(flat(cut.text), port ? 4 : 7);
    const o = { track: 0.05, lead: 1.1 };
    const size = Math.min(J.fitSize(text, Pm.font, W * 0.66, H * 0.26, o), H * 0.16);
    const m = J.measure(Object.assign({ text, font: Pm.font, size }, o));
    const cy = H * 0.66 - m.h * 0.2;
    const out = tout(env);
    // the lamp comes on with a stutter
    const on = lt < 0.08 ? 0 : lt < 0.16 ? 1 : lt < 0.24 ? 0.25 : 1;
    const flick = J.r(s, env.step, 101) < 0.04 ? 0.5 : 1;
    const L = on * flick * out;
    const shS = Math.min(size * Pm.k, J.fitSize(text, Pm.font, W * 0.92, H * 0.42, o));
    const shM = J.measure(Object.assign({ text, font: Pm.font, size: shS }, o));
    const sy = Math.max(H * 0.06 + shM.h / 2, cy - m.h * 0.5 - shM.h * 0.42);
    if (env.pass === 'main' && L > 0) {
      const pool = isDark(sc.bg) ? J.mix(sc.bg, sc.fg, 0.16) : J.mix(sc.bg, '#FFFFFF', 0.5);
      const R = Math.max(shM.w, shS * 2.2) * 0.75;
      ctx.save(); ctx.translate(W / 2, sy); ctx.scale(1, 0.72);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
      g.addColorStop(0, J.rgba(pool, L)); g.addColorStop(1, J.rgba(pool, 0));
      ctx.fillStyle = g; ctx.fillRect(-R, -R, R * 2, R * 2); ctx.restore();
      // the shadow: bigger, soft, and it moves on its own
      const t = env.ltb, d = cut.dur;
      const turn = E.inOutCubic(J.clamp((lt - d * Pm.turn) / 0.5));
      const sxk = 1 - 2 * turn;
      const twitch = J.r(s, env.step >> 1, 102) < 0.05 ? J.rs(s, env.step, 103) * 8 : 0;
      const shC = isDark(sc.bg) ? J.mix(sc.bg, '#000000', 0.55) : J.mix(sc.bg, sc.fg, 0.28);
      env.draw({ text, font: Pm.font, size: shS, x: W / 2 + J.noise1(t * 0.35, s) * size * 0.5, y: sy + J.noise1(t * 0.3, s + 2) * size * 0.1, track: 0.05, lead: 1.1,
        sx: Math.abs(sxk) < 0.04 ? 0.04 : sxk, rot: Pm.dir * Pm.lean * J.noise1(t * 0.25 + 3, s + 4) + twitch, skew: J.noise1(t * 0.2, s + 5) * 10,
        color: shC, alpha: 0.85 * L, blur: env.allowFilter ? shS * 0.03 : 0, ghost: false });
    }
    const bb = J.mainDraw(env, Object.assign({ text, font: Pm.font, size, x: W / 2, y: cy, color: sc.fg }, o));
    // floor line
    const fe = tin(env, 0.1, 0.5) * out;
    if (fe > 0) env.line([[W / 2 - m.w * 0.8 * fe, cy + m.h / 2 + size * 0.2], [W / 2 + m.w * 0.8 * fe, cy + m.h / 2 + size * 0.2]], sc.sub, Math.max(1, size * 0.012), 0.5, false);
    return bb;
  },
});
})();

/* JIZURA pack: horror (2/3) — entrances, exits, holds and text treatments with an uneasy, J-horror / found-footage feel */
(() => {
'use strict';
const E = J.E;
const P = 'horror';
const TAGS = ['horror'];
const reg = (g, key, def) => J.register(g, key, Object.assign({ set: 'horror' }, def), P);
const HIDE = Object.freeze({ hide: true });

/* ------------------------------------------------------------------ helpers */
const isHex = c => typeof c === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c);
const colOf = it => (isHex(it.color) ? it.color : '#ffffff');
const mixC = (a, b, t) => (isHex(a) && isHex(b) ? J.mix(a, b, J.clamp(t)) : (t < 0.5 ? a : b));
const motionK = env => J.clamp((env.fx && env.fx.motion != null ? env.fx.motion : 0.7) / 0.7, 0, 1.6);
const layOf = it => (it._m || (it._m = J.measure(it))).lay;
const cutN = env => Math.max(1, J.glyphCount(String((env.cut && env.cut.text) || '')));
const cseed = env => (env.cut && env.cut.seed) | 0;
/* position of glyph i along the whole lyric (0..1): within the item, or by motion index for one-glyph items */
const orderOf = (env, it) => {
  const N = cutN(env), mi = +it.mi || 0;
  return (i, n) => (n > 1 ? i / (n - 1) : N > 1 ? J.clamp(mi / (N - 1)) : 0);
};
/* integer index of glyph i within the whole lyric */
const indexOf = (env, it) => {
  const N = cutN(env), mi = Math.round(+it.mi || 0);
  return (i, n) => (n > 1 ? i : N > 1 ? Math.min(N - 1, mi) : 0);
};
const isDarkBg = env => J.lum(env.sc.bg) < 0.45;
const nightC = sc => J.mix(sc.bg, '#000000', J.lum(sc.bg) < 0.45 ? 0.72 : 0.9);
/* item-space centre of the laid-out text */
const layCenter = it => {
  const lay = layOf(it); let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (const g of lay) { x0 = Math.min(x0, g.x - g.w / 2); x1 = Math.max(x1, g.x + g.w / 2); y0 = Math.min(y0, g.y - g.h / 2); y1 = Math.max(y1, g.y + g.h / 2); }
  return lay.length ? [(x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0] : [0, 0, 0, 0];
};
/* irregular (uneasy) timeline: cumulative random gaps, some long, normalised to 0..span */
const uneasyTimes = (seed, N, span) => {
  const gaps = []; let tot = 0;
  for (let k = 0; k < N; k++) { const r = J.r(seed, k, 901); const g = 0.25 + (r < 0.25 ? 2.2 : r * 1.1); gaps.push(g); tot += g; }
  const out = []; let acc = 0;
  for (let k = 0; k < N; k++) { out.push(acc / tot * span); acc += gaps[k]; }
  return out;
};
const addPre = (it, f) => { const p = it.pre; it.pre = p ? (e, i) => { p(e, i); f(e, i); } : f; };
const addPost = (it, f) => { const p = it.post; it.post = p ? (e, i, b) => { p(e, i, b); f(e, i, b); } : f; };
const bare = (i, extra) => Object.assign({}, i, { pre: null, post: null, echo: null, streak: null, shadow: null, extrude: null, pattern: null, patternBg: null, gradient: null,
  pieceFn: null, strokeDash: null, strokeUnder: false, wipeBar: null, cursorAt: null, bands: null, vbands: null, clip: null, clipY: null, clipFn: null, blend: null, _lay: null }, extra || {});
/* visible glyphs in item space following the per-glyph motion */
const glyphList = (it) => {
  const lay = J.layoutText(it), sx = it.sx || 1, sy = it.sy || 1, out = [];
  for (const g of lay) {
    if (g.ch === ' ' || g.ch === '　') continue;
    const c = it.charFn ? it.charFn(g.i, g, lay.N) : null;
    if (c && c.hide) continue;
    const s = c && c.s != null ? c.s : 1;
    out.push({ g, x: g.x * sx + g.vx * sx + ((c && c.dx) || 0), y: g.y * sy + g.vy * sy + ((c && c.dy) || 0), w: g.w * sx * s, h: g.h * sy * s, a: c && c.a != null ? c.a : 1, rot: (c && c.rot) || 0 });
  }
  return out;
};
/* run fn in item space (translate / rotate / skew of the item) */
const inItem = (env, it, fn) => {
  const ctx = env.ctx; ctx.save(); ctx.translate(it.x, it.y);
  if (it.rot) ctx.rotate(it.rot * J.DEG);
  if (it.skew) ctx.transform(1, 0, Math.tan(it.skew * J.DEG), 1, 0, 0);
  try { fn(); } finally { ctx.restore(); }
};
const alive = (it, amin = 0.9) => it.fill !== false && (it.alpha ?? 1) >= amin && !!it.text && it.size > 1;

/* ================================================================== ENTRANCES */

/* between blinks: every time the screen blinks, the glyphs are closer */
reg('enter', 'hrBlinkCreep', {
  name: '瞬きの間に', tags: TAGS.concat(['emotional']), w: 0.9, ae: 'flicker', minDur: 1,
  inDur: dur => J.clamp(dur * 0.5, 0.6, 1.3),
  apply(env, it, p) {
    const seed = it.seed | 0, sz = it.size, cs = cseed(env), ord = orderOf(env, it);
    const B = [0.26, 0.52, 0.78], bw = 0.05;
    for (const b of B) if (p >= b && p < b + bw) { it.charFns.push(() => HIDE); return; }
    const stage = B.filter(b => p >= b + bw).length;
    const f = stage / B.length;
    it.charFns.push((i, g, n) => {
      const k = J.h(cs, Math.round(ord(i, n) * 97), 11);
      const ang = J.r(k, 1) * J.TAU, dist = sz * (0.9 + J.r(k, 2) * 1.1);
      const r = 1 - f;
      if (r <= 0) return null;
      return { dx: Math.cos(ang) * dist * r, dy: Math.sin(ang) * dist * r * 0.6, s: 1 - 0.45 * r, rot: J.rs(k, 3) * 25 * r, a: 0.3 + 0.7 * (1 - r) };
    });
  },
});

/* jump scare: faint and tiny, then it snaps at you and settles */
reg('enter', 'hrJumpScare', {
  name: '飛び出し', tags: TAGS.concat(['glitch', 'pop']), w: 0.7, ae: 'zoom', minDur: 0.9,
  inDur: dur => J.clamp(dur * 0.42, 0.45, 1),
  apply(env, it, p) {
    const at = 0.62, seed = it.seed | 0;
    if (p < at) {
      const q = p / at;
      it.size *= 0.42 + 0.08 * q;
      it.alpha = (it.alpha ?? 1) * (0.1 + 0.12 * q) * (J.r(seed, env.step, 3) < 0.15 ? 0.3 : 1);
      it.x += J.rs(seed, env.step, 1) * it.size * 0.02; it.y += J.rs(seed, env.step, 2) * it.size * 0.02;
      return;
    }
    const q = (p - at) / (1 - at), e = E.outExpo(q), k = 1 - e;
    it.size *= 1 + 0.95 * k;
    it.x += J.rs(seed, env.step, 4) * it.size * 0.12 * k; it.y += J.rs(seed, env.step, 5) * it.size * 0.12 * k;
    it.rot = (it.rot || 0) + J.rs(seed, env.step, 6) * 7 * k;
  },
});

/* uneasy timing: glyphs arrive one by one after irregular, too-long pauses, each with a twitch */
reg('enter', 'hrUneasy', {
  name: '間の悪い出現', tags: TAGS.concat(['editorial']), w: 1, ae: 'type', minDur: 0.9,
  inDur: (dur, n) => J.clamp(dur * 0.55, 0.5, 1.6),
  apply(env, it, p) {
    const cs = cseed(env), N = cutN(env), idx = indexOf(env, it), times = uneasyTimes(cs, N, 0.86), sz = it.size, acc = env.sc.accent;
    it.charFns.push((i, g, n) => {
      const t0 = times[Math.min(N - 1, idx(i, n))] || 0, q = (p - t0) / 0.1;
      if (q < 0) return HIDE;
      if (q >= 1) return null;
      const k = J.h(cs, idx(i, n), 21);
      return { dx: J.rs(k, 1) * sz * 0.18 * (1 - q), dy: J.rs(k, 2) * sz * 0.1 * (1 - q), rot: J.rs(k, 3) * 18 * (1 - q), color: q < 0.5 ? acc : null };
    });
  },
});

/* vertical hold: the line rolls through the frame like a TV losing sync, then locks */
reg('enter', 'hrVhold', {
  name: '垂直同期', tags: TAGS.concat(['glitch']), w: 0.8, ae: 'slice',
  inDur: dur => J.clamp(dur * 0.4, 0.35, 0.8),
  apply(env, it, p) {
    const bx = J.itemBox(it), pad = it.size * 0.25, y0 = bx.y0 - pad, y1 = bx.y1 + pad, Hh = y1 - y0;
    if (Hh <= 1) return;
    const e = E.outCubic(p), rolls = 2.6, m = (((1 - e) * rolls * Hh) % Hh + Hh) % Hh;
    it.clipY = [y0, y1];
    it.y += m;
    it.echo = { n: 1, dx: 0, dy: -Hh, a: 1, decay: 1 };
    it.x += J.rs(it.seed | 0, env.step, 1) * it.size * 0.05 * (1 - e);
    it.alpha = (it.alpha ?? 1) * Math.min(1, 0.4 + p * 2);
    const bar = J.mix(env.sc.bg, '#000000', 0.6), single = layOf(it).N === 1 && cutN(env) > 1;
    addPost(it, (en) => {
      if (en.pass !== 'main' || m < 1 || single) return;
      const yb = y0 + m, fa = 1 - J.smooth(0.75, 1, p);
      en.rect(bx.x0 - pad * 2, yb - Hh * 0.05, bx.x1 - bx.x0 + pad * 4, Hh * 0.07, bar, 0.85 * fa, false);
      en.rect(bx.x0 - pad * 2, yb + Hh * 0.03, bx.x1 - bx.x0 + pad * 4, Math.max(1, Hh * 0.008), en.sc.fg, 0.35 * fa, false);
    });
  },
});

/* mirror writing: it appears reversed, shudders, and snaps the right way round */
reg('enter', 'hrMirrorSnap', {
  name: '鏡文字', tags: TAGS.concat(['glitch']), w: 0.8, ae: 'flicker', minDur: 0.8,
  inDur: dur => J.clamp(dur * 0.45, 0.5, 1.1),
  apply(env, it, p) {
    const seed = it.seed | 0, [cx] = layCenter(it), sx = it.sx || 1, st = env.step;
    let s = -1;
    if (p >= 0.55 && p < 0.72) s = J.r(seed, st, 7) < 0.5 ? -1 : 0.25;
    else if (p >= 0.72) s = J.lerp(-0.2, 1, E.outBack((p - 0.72) / 0.28, 2.2));
    it.alpha = (it.alpha ?? 1) * Math.min(1, p / 0.18);
    if (p < 0.55) it.rot = (it.rot || 0) + Math.sin(p * 30) * 1.5;
    if (s === 1) return;
    it.charFns.push((i, g) => ({ sx: Math.abs(s) < 0.04 ? 0.04 : s, dx: (cx - g.x) * sx * (1 - s) }));
  },
});

/* manifesting: it wavers in and out, each glyph on its own breath, and finally holds */
reg('enter', 'hrManifest', {
  name: '浮かび上がる', tags: TAGS.concat(['emotional', 'calm']), w: 1, ae: 'blur', minDur: 0.8,
  inDur: dur => J.clamp(dur * 0.5, 0.5, 1.4),
  apply(env, it, p) {
    const cs = cseed(env), idx = indexOf(env, it), sz = it.size, N = cutN(env);
    const fin = J.smooth(0.72, 1, p);
    it.charFns.push((i, g, n) => {
      const k = J.h(cs, idx(i, n), 31), ph = J.r(k, 1) * J.TAU, f = 7 + J.r(k, 2) * 6;
      const wav = J.clamp(p * 1.3) * (0.45 + 0.55 * Math.max(0, Math.sin(p * f + ph)));
      const a = J.lerp(wav, 1, fin);
      if (a >= 0.999) return null;
      return { a, dx: J.noise1(p * 4 + ph, k) * sz * 0.12 * (1 - fin), dy: J.noise1(p * 3 + ph, k + 1) * sz * 0.08 * (1 - fin) };
    });
  },
});

/* claw marks: four slanted tears open across the line and widen until it is all there */
reg('enter', 'hrClawReveal', {
  name: '爪痕から', tags: TAGS.concat(['graphic']), w: 0.8, ae: 'wipe',
  inDur: dur => J.clamp(dur * 0.36, 0.3, 0.7),
  apply(env, it, p) {
    const seed = it.seed | 0, bx = J.itemBox(it), pad = it.size * 0.3;
    const x0 = bx.x0 - pad, x1 = bx.x1 + pad, y0 = bx.y0 - pad, y1 = bx.y1 + pad, W = x1 - x0, Hh = y1 - y0;
    const n = 4, sp = W / n, slope = Math.min(0.55 * Hh, sp * 1.4), dir = (J.h(seed, 3) & 1) ? 1 : -1;
    if (p > 0.97) return;
    it.clipFn = (ctx) => {
      for (let k = -2; k < n + 2; k++) {
        const q = J.clamp((p - J.clamp(k, 0, n - 1) * 0.08) / 0.7) * (k < 0 || k >= n ? J.smooth(0.5, 0.9, p) : 1); if (q <= 0) continue;
        const e = E.inOutCubic(q), cx = x0 + (k + 0.5) * sp, w = sp * 0.08 + sp * 1.1 * e * e;
        // a slanted band, drawn in the swipe from one end to the other
        const reach = E.outCubic(J.clamp(q * 3)), ya = dir > 0 ? y0 : y1, yb = J.lerp(ya, dir > 0 ? y1 : y0, reach);
        const off = (y) => (y - y0) / Hh * slope - slope / 2;
        const j = (a, b) => J.rs(seed, k, a, b) * sp * 0.06;
        ctx.moveTo(cx - w / 2 + off(ya) + j(1, 1), ya); ctx.lineTo(cx + w / 2 + off(ya) + j(1, 2), ya);
        ctx.lineTo(cx + w / 2 + off((ya + yb) / 2) + j(2, 1), (ya + yb) / 2);
        ctx.lineTo(cx + w / 2 * 0.3 + off(yb), yb); ctx.lineTo(cx - w / 2 * 0.3 + off(yb), yb);
        ctx.lineTo(cx - w / 2 + off((ya + yb) / 2) + j(2, 2), (ya + yb) / 2); ctx.closePath();
      }
    };
  },
});

/* ================================================================== EXITS */

/* pulled under: glyphs are yanked down one by one; the last one clings and trembles first */
reg('exit', 'hrPulledDown', {
  name: '引きずり込み', tags: TAGS.concat(['glitch', 'emotional']), w: 1, ae: 'fall',
  outDur: dur => J.clamp(dur * 0.4, 0.4, 0.9),
  apply(env, it, p) {
    const cs = cseed(env), N = cutN(env), idx = indexOf(env, it), H = env.H, sz = it.size, st = env.step;
    const last = J.h(cs, 41) % N;
    it.charFns.push((i, g, n) => {
      const ix = idx(i, n);
      const t0 = ix === last ? 0.7 : J.r(cs, ix, 42) * 0.5;
      const q = (p - t0) / 0.28;
      if (q < 0) {
        const tr = J.clamp(1 + q * 1.5) * (ix === last ? 1.6 : 0.6);
        return tr > 0 ? { dx: J.rs(cs, ix, st, 43) * sz * 0.03 * tr, dy: J.rs(cs, ix, st, 44) * sz * 0.02 * tr, rot: J.rs(cs, ix, st, 45) * 6 * tr } : null;
      }
      if (q >= 1) return HIDE;
      const e = q * q;
      return { dy: e * H * 1.1, sy: 1 + q * 1.8, sx: 1 - q * 0.3, rot: J.rs(cs, ix, 46) * 12 * q, a: 1 - E.inCubic(q) };
    });
  },
});

/* one stays behind: the line vanishes at once except one glyph, which turns to look, then is gone */
reg('exit', 'hrLookBack', {
  name: '一字残る', tags: TAGS.concat(['emotional']), w: 0.9, ae: 'cut', minDur: 1,
  outDur: dur => J.clamp(dur * 0.45, 0.55, 1.2),
  apply(env, it, p) {
    const cs = cseed(env), N = cutN(env), idx = indexOf(env, it), sz = it.size, st = env.step;
    const txt = [...String(env.cut.text || '').replace(/\s+/g, '')];
    let pick = J.h(cs, 51) % N;
    for (let k = 0; k < N; k++) { const j = (pick + k) % N; if (J.isKanji(txt[j] || '') || /[A-Za-z]/.test(txt[j] || '')) { pick = j; break; } }
    const dir = (J.h(cs, 52) & 1) ? 1 : -1, acc = env.sc.accent;
    it.charFns.push((i, g, n) => {
      if (idx(i, n) !== pick) return p < 0.06 ? { a: 0.4 } : HIDE;
      if (p >= 0.86) return HIDE;
      const q = E.inOutSine(J.clamp((p - 0.12) / 0.55));
      const tw = J.r(cs, st, 53) < 0.12 ? J.rs(cs, st, 54) * 6 : 0;
      return { rot: dir * 24 * q + tw, s: 1 + 0.16 * q, dx: J.rs(cs, st, 55) * sz * 0.01 * q, color: q > 0.3 ? acc : null };
    });
  },
});

/* turning away: each glyph turns its back (edge-on, then reversed and darkened) and fades */
reg('exit', 'hrTurnAway', {
  name: '背を向ける', tags: TAGS.concat(['calm', 'emotional']), w: 0.9, ae: 'stretch',
  outDur: dur => J.clamp(dur * 0.4, 0.4, 0.9),
  apply(env, it, p) {
    const ord = orderOf(env, it), c0 = colOf(it), dk = nightC(env.sc), sz = it.size;
    it.charFns.push((i, g, n) => {
      const q = J.clamp((p - ord(i, n) * 0.4) / 0.6);
      if (q <= 0) return null;
      if (q >= 1) return HIDE;
      const sx = Math.cos(q * Math.PI * 0.95);
      return { sx: Math.abs(sx) < 0.04 ? 0.04 : sx, color: q > 0.5 ? mixC(c0, dk, 0.35 + q * 0.5) : null, a: 1 - J.smooth(0.6, 1, q), dy: q * sz * 0.08 };
    });
  },
});

/* shiver: a tremor that keeps growing, and glyphs drop out of existence between frames */
reg('exit', 'hrShiver', {
  name: '震えて消える', tags: TAGS.concat(['glitch']), w: 0.9, ae: 'glitch',
  outDur: dur => J.clamp(dur * 0.35, 0.35, 0.8),
  apply(env, it, p) {
    const cs = cseed(env), idx = indexOf(env, it), sz = it.size, st = env.step;
    it.charFns.push((i, g, n) => {
      const ix = idx(i, n), t0 = 0.3 + J.r(cs, ix, 61) * 0.62;
      if (p >= t0) return HIDE;
      const a = sz * (0.025 + 0.13 * p);
      return { dx: J.rs(cs, ix, st, 62) * a, dy: J.rs(cs, ix, st, 63) * a, rot: J.rs(cs, ix, st, 64) * 14 * p };
    });
  },
});

/* swallowed: a stain of darkness spreads from one point and eats the line */
reg('exit', 'hrSwallow', {
  name: '闇に呑まれる', tags: TAGS.concat(['emotional', 'graphic']), w: 0.9, ae: 'wipe',
  outDur: dur => J.clamp(dur * 0.4, 0.4, 0.9),
  apply(env, it, p) {
    const seed = it.seed | 0, bx = J.itemBox(it), sz = it.size;
    const cx = J.lerp(bx.x0, bx.x1, J.rr(0.15, 0.85, seed, 71)), cy = J.lerp(bx.y0, bx.y1, J.rr(0.3, 0.7, seed, 72));
    const Rmax = Math.hypot(Math.max(cx - bx.x0, bx.x1 - cx), Math.max(cy - bx.y0, bx.y1 - cy)) + sz * 0.2;
    const R = Rmax * E.inCubic(J.clamp(p / 0.75)) * 1.08;
    const pts = [], m = 22;
    for (let k = 0; k < m; k++) { const a = k / m * J.TAU, r = R * (0.72 + 0.4 * J.r(seed, k, 73) + 0.08 * Math.sin(p * 9 + k)); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    it.clipFn = (ctx, en) => {
      ctx.rect(-en.W * 2, -en.H * 2, en.W * 5, en.H * 5);
      if (R > 0.5) { ctx.moveTo(pts[0][0], pts[0][1]); for (let k = m - 1; k >= 0; k--) ctx.lineTo(pts[k][0], pts[k][1]); ctx.closePath(); }
    };
    const dk = nightC(env.sc), fade = 1 - J.smooth(0.62, 0.95, p);
    addPost(it, (en) => { if (en.pass === 'main' && R > 0.5) en.blob(pts, dk, 0.85 * fade, false); });
    if (p > 0.97) it.alpha = 0;
  },
});

/* dying light: the words strobe out, with single frames where they come back wrong */
reg('exit', 'hrFlickerDie', {
  name: '明滅して消える', tags: TAGS.concat(['glitch']), w: 0.9, ae: 'glitch',
  outDur: dur => J.clamp(dur * 0.38, 0.35, 0.8),
  apply(env, it, p) {
    const seed = it.seed | 0, st = env.step, r = J.r(seed, st, 81);
    if (p > 0.92 || r > Math.pow(1 - p, 1.3) * 0.95) { it.charFns.push(() => HIDE); return; }
    if (J.r(seed, st, 82) < 0.22 && p > 0.15) {
      const [cx] = layCenter(it), sx = it.sx || 1, acc = env.sc.accent;
      it.charFns.push((i, g) => ({ sx: -1, dx: (cx - g.x) * sx * 2, color: acc }));
      it.y += J.rs(seed, st, 83) * it.size * 0.1;
    } else it.alpha = (it.alpha ?? 1) * (0.55 + 0.45 * J.r(seed, st, 84));
  },
});

/* draining: the ink level sinks inside each glyph while drips run out of the bottom */
reg('exit', 'hrDrain', {
  name: '滴り落ちる', tags: TAGS.concat(['emotional']), w: 0.8, ae: 'wipe', minDur: 0.8,
  outDur: dur => J.clamp(dur * 0.45, 0.5, 1.1),
  apply(env, it, p) {
    const cs = cseed(env), idx = indexOf(env, it), ord = orderOf(env, it), sz = it.size;
    const lev = (i, n) => E.inOutSine(J.clamp((p - ord(i, n) * 0.25) / 0.72));
    it.charFns.push((i, g, n) => {
      const q = lev(i, n); if (q <= 0) return null; if (q >= 0.995) return HIDE;
      return { clipY: [-0.7 + q * 1.4, 0.7] };
    });
    const c = colOf(it);
    addPost(it, (en) => {
      if (en.pass !== 'main') return;
      inItem(en, it, () => {
        const lay = layOf(it), sx = it.sx || 1, sy = it.sy || 1;
        for (const g of lay) {
          if (g.ch === ' ' || g.ch === '　') continue;
          const q = lev(g.i, lay.N); if (q <= 0.02) continue;
          const k = J.h(cs, idx(g.i, lay.N), 91), nd = 1 + (k % 2);
          for (let d = 0; d < nd; d++) {
            const x = (g.x + J.rs(k, d, 1) * g.w * 0.3) * sx, yb = (g.y + g.h * 0.4) * sy;
            const L = sz * (0.3 + 1.4 * J.r(k, d, 2)) * E.outCubic(q), a = (it.alpha ?? 1) * (1 - J.smooth(0.75, 1, q));
            en.line([[x, yb - sz * 0.05], [x, yb + L]], c, Math.max(1, sz * 0.035), a, false);
            en.circle(x, yb + L, sz * 0.03, c, null, 0, a, false);
          }
        }
      });
    });
  },
});

/* ================================================================== HOLDS */

/* twitch: dead still, then a rare violent jerk of one glyph (or the whole line) */
reg('hold', 'hrTwitch', {
  name: '痙攣', tags: TAGS.concat(['glitch']), w: 1, ae: 'glitchtick',
  apply(env, it, amt) {
    const k = amt * motionK(env); if (k < 0.02) return;
    const cs = cseed(env), st = env.step, idx = indexOf(env, it), N = cutN(env), sz = it.size;
    if (J.r(cs, st, 101) > 0.07 * k) return;
    const whole = J.r(cs, st, 102) < 0.25, target = J.h(cs, st, 103) % N;
    it.charFns.push((i, g, n) => {
      if (!whole && idx(i, n) !== target) return null;
      return { dx: J.rs(cs, st, 104) * sz * 0.22 * k, dy: J.rs(cs, st, 105) * sz * 0.14 * k, rot: J.rs(cs, st, 106) * 28 * k, s: 1 + J.r(cs, st, 107) * 0.12 * k };
    });
  },
});

/* staring: now and then one glyph slowly tilts its head towards you, holds, and snaps back */
reg('hold', 'hrStare', {
  name: '見つめる字', tags: TAGS.concat(['emotional']), w: 0.8, ae: 'drift',
  apply(env, it, amt) {
    const k = amt * motionK(env); if (k < 0.02) return;
    const cs = cseed(env), idx = indexOf(env, it), N = cutN(env), per = 2, t = env.ltb - 0.3;
    if (t <= 0) return;
    const cyc = Math.floor(t / per), u = (t - cyc * per) / per, target = J.h(cs, cyc, 111) % N;
    const q = u < 0.6 ? E.inOutSine(u / 0.6) : u < 0.85 ? 1 : 1 - E.outExpo((u - 0.85) / 0.15);
    const dir = (J.h(cs, cyc, 112) & 1) ? 1 : -1;
    it.charFns.push((i, g, n) => (idx(i, n) === target ? { rot: dir * 22 * q * k, s: 1 + 0.12 * q * k, dy: -g.h * 0.04 * q * k } : null));
  },
});

/* the late one: the line sways together, one glyph follows a moment too late */
reg('hold', 'hrLagOne', {
  name: '遅れる一字', tags: TAGS.concat(['calm']), w: 0.8, ae: 'drift',
  apply(env, it, amt) {
    const k = amt * motionK(env); if (k < 0.02) return;
    const cs = cseed(env), idx = indexOf(env, it), N = cutN(env), sz = it.size, t = env.ltb, late = J.h(cs, 121) % N;
    const sw = (tt) => [J.noise1(tt * 0.9, cs) * sz * 0.1 * k, J.noise1(tt * 0.7 + 5, cs + 1) * sz * 0.06 * k, J.noise1(tt * 0.5 + 9, cs + 2) * 4 * k];
    const a = sw(t), b = sw(t - 0.75);
    it.charFns.push((i, g, n) => { const v = idx(i, n) === late ? b : a; return { dx: v[0], dy: v[1], rot: v[2] }; });
  },
});

/* failing light: the words buzz, dim and drop out for a frame or two */
reg('hold', 'hrFlickerLight', {
  name: '切れかけの灯', tags: TAGS.concat(['glitch', 'emotional']), w: 0.9, ae: 'glitchtick',
  apply(env, it, amt) {
    const k = amt * J.clamp(motionK(env), 0.4, 1.3); if (k < 0.02) return;
    const cs = cseed(env), st = env.step, run = st >> 1;
    let lvl = 0.9 + 0.1 * J.r(cs, st, 131);
    if (J.r(cs, run, 132) < 0.09 * k) lvl = J.r(cs, st, 133) < 0.5 ? 0.08 : 0.35;
    else if (J.r(cs, st, 134) < 0.05 * k) lvl = 0.5;
    const a = 1 - (1 - lvl) * Math.min(1, k);
    it.alpha = (it.alpha ?? 1) * a;
    if (a < 0.6) it.color = mixC(colOf(it), env.sc.bg, 0.3);
  },
});

/* ================================================================== TREATMENTS */

/* ink bleed: a dark halo seeps out of the letters and thin drips run down from some of them */
reg('treat', 'hrInkBleed', {
  name: '滲み垂れ', tags: TAGS.concat(['emotional']), w: 0.8, ae: 'softShadow',
  plan: rng => ({ drips: rng.range(0.25, 0.45), red: rng.chance(0.4) }),
  apply(env, it, P) {
    if (!alive(it)) return;
    const sc = env.sc, c = colOf(it), halo = P.red ? sc.accent : (isDarkBg(env) ? mixC(c, sc.bg, 0.5) : mixC(c, sc.bg, 0.3));
    const sz = it.size;
    const single = layOf(it).N === 1 && cutN(env) > 4;
    if (!it.shadow && !single) it.shadow = { color: J.rgba(isHex(halo) ? halo : '#000000', 0.8), blur: sz * 0.07, dx: 0, dy: sz * 0.02 };
    const cs = cseed(env), rate = P.drips || 0.35;
    addPost(it, (en, i) => {
      if (en.pass !== 'main') return;
      const cut = en.cut, d0 = cut.inDur * 1.1, grow = J.clamp((en.lt - d0) / Math.max(0.8, cut.dur * 0.7));
      if (grow <= 0) return;
      const a = (i.alpha ?? 1) * (1 - en.pOut);
      if (a < 0.05) return;
      const dc = P.red ? sc.accent : c;
      inItem(en, i, () => {
        for (const q of glyphList(i)) {
          const k = J.h(cs, q.g.i, Math.round(i.x), 141);
          if (J.r(k, 1) > rate || J.isPunct(q.g.ch)) continue;
          const x = q.x + J.rs(k, 2) * q.w * 0.25, y = q.y + q.h * 0.36, L = sz * (0.2 + 0.9 * J.r(k, 3)) * E.outCubic(grow);
          const lw = Math.max(1, sz * (0.018 + 0.02 * J.r(k, 4)));
          en.line([[x, y], [x + J.rs(k, 5) * sz * 0.02, y + L]], dc, lw, a * q.a * 0.9, false);
          en.circle(x + J.rs(k, 5) * sz * 0.02, y + L, lw * 0.9, dc, null, 0, a * q.a * 0.9, false);
        }
      });
    });
  },
});

/* eroded: letters worn away with pits and scratches in the background colour */
reg('treat', 'hrEroded', {
  name: '風化', tags: TAGS.concat(['editorial', 'graphic']), w: 0.8, ae: 'halftone',
  plan: rng => ({ dens: rng.range(0.7, 1.2), scr: rng.chance(0.7) }),
  apply(env, it, P) {
    if (!alive(it)) return;
    const cs = cseed(env), bg = env.sc.bg, sz = it.size, dens = P.dens || 1;
    addPost(it, (en, i) => {
      if (en.pass !== 'main' || (i.alpha ?? 1) < 0.3) return;
      inItem(en, i, () => {
        let budget = 420;
        for (const q of glyphList(i)) {
          if (q.a < 0.3) continue;
          const k = J.h(cs, q.g.i, 151), n = Math.round((16 + J.r(k, 1) * 14) * dens);
          for (let j = 0; j < n && budget-- > 0; j++) {
            const r = sz * (0.01 + 0.045 * Math.pow(J.r(k, j, 2), 2));
            en.circle(q.x + J.rs(k, j, 3) * q.w * 0.45, q.y + J.rs(k, j, 4) * q.h * 0.45, r, bg, null, 0, 1, false);
          }
          if (P.scr && J.r(k, 5) < 0.45) {
            const a = J.r(k, 6) * Math.PI, L = q.w * 0.6;
            en.line([[q.x - Math.cos(a) * L / 2, q.y - Math.sin(a) * L / 2], [q.x + Math.cos(a) * L / 2, q.y + Math.sin(a) * L / 2]], bg, Math.max(1.5, sz * 0.022), 1, false);
          }
        }
      });
    });
  },
});

/* redacted: a black bar covers part of the line and is pulled off later, leaving its outline */
reg('treat', 'hrRedact', {
  name: '黒塗り', tags: TAGS.concat(['editorial', 'graphic']), w: 0.7, ae: 'boxed',
  plan: rng => ({ at: rng.range(0.25, 0.5), frac: rng.range(0.3, 0.6), from: rng.range(0, 1) }),
  apply(env, it, P) {
    if (!alive(it)) return;
    const lay = layOf(it), N = lay.N, cs = cseed(env), ord = orderOf(env, it);
    if (N === 1 && cutN(env) > 1) {
      // one-glyph items: cover a run of glyphs of the lyric
      const o = ord(0, 1), a = P.from * (1 - P.frac);
      if (o < a || o > a + P.frac) return;
    }
    const c = colOf(it), sc = env.sc;
    addPost(it, (en, i) => {
      if (en.pass !== 'main') return;
      const cut = en.cut, t0 = cut.inDur + (cut.dur - cut.inDur - cut.outDur) * P.at;
      const k = E.inOutCubic(J.clamp((en.lt - t0) / 0.35));
      const gl = glyphList(i); if (!gl.length) return;
      let s0 = 0, s1 = gl.length - 1;
      if (gl.length > 2) { const m = Math.max(1, Math.round(gl.length * P.frac)); s0 = Math.min(gl.length - m, Math.floor(P.from * (gl.length - m + 1))); s1 = s0 + m - 1; }
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (let j = s0; j <= s1; j++) { const q = gl[j]; x0 = Math.min(x0, q.x - q.w / 2); x1 = Math.max(x1, q.x + q.w / 2); y0 = Math.min(y0, q.y - q.h / 2); y1 = Math.max(y1, q.y + q.h / 2); }
      const pd = i.size * 0.06, a = (i.alpha ?? 1);
      inItem(en, i, () => {
        const w = (x1 - x0 + pd * 2);
        if (k < 1) en.rect(x0 - pd + w * k, y0 - pd * 0.5, w * (1 - k), y1 - y0 + pd, c, a, false);
        if (k > 0) en.line([[x0 - pd, y0 - pd * 0.5], [x1 + pd, y0 - pd * 0.5], [x1 + pd, y1 + pd * 0.5], [x0 - pd, y1 + pd * 0.5], [x0 - pd, y0 - pd * 0.5]], sc.sub, Math.max(1, i.size * 0.01), a * 0.5 * k, false);
      });
    });
  },
});

/* double exposure: a second, fainter take of the line drifts out of register */
reg('treat', 'hrDoubleExp', {
  name: '二重露光', tags: TAGS.concat(['emotional', 'glitch']), w: 0.8, ae: 'echoOutline',
  plan: rng => ({ amp: rng.range(0.18, 0.28), k: rng.range(1.03, 1.08) }),
  apply(env, it, P) {
    if (!alive(it)) return;
    const cs = cseed(env), sc = env.sc;
    const col = [sc.sub, sc.ghostA, sc.fg].find(c => c && c !== it.color && J.contrast(c, sc.bg) > 1.3) || sc.sub;
    addPre(it, (en, i) => {
      if (en.pass !== 'main' || (i.alpha ?? 1) < 0.05) return;
      const t = en.ltb, sz = i.size, amp = P.amp || 0.12;
      const c = bare(i, { x: i.x + J.noise1(t * 0.6, cs + 3) * sz * amp, y: i.y + J.noise1(t * 0.5, cs + 4) * sz * amp * 0.7, size: sz * (P.k || 1.05), color: col, alpha: (i.alpha ?? 1) * 0.4, ghost: false });
      J.drawItem(en, c);
    });
  },
});
})();

/* JIZURA pack: horror (3/3) — decorations, backgrounds, camera moves, screen effects, cut transitions and three styles */
(() => {
'use strict';
const E = J.E;
const P = 'horror';
const TAGS = ['horror'];
const reg = (g, key, def) => J.register(g, key, Object.assign({ set: 'horror' }, def), P);
const clamp = J.clamp, TAU = J.TAU, DEG = J.DEG;

/* ------------------------------------------------------------------ helpers */
const U = env => Math.min(env.W, env.H);
const isDark = c => J.lum(c) < 0.45;
const lightOf = sc => (J.lum(sc.fg) > J.lum(sc.bg) ? sc.fg : sc.bg);
const nightC = sc => J.mix(sc.bg, '#000000', isDark(sc.bg) ? 0.72 : 0.9);
const layC = (sc, k) => J.mix(sc.bg, sc.fg, k);
const center = (env, bb) => bb || { x0: env.W * 0.35, x1: env.W * 0.65, y0: env.H * 0.4, y1: env.H * 0.6, cx: env.W / 2, cy: env.H / 2 };
const inOut = (env, d = 0.35) => E.outCubic(clamp(env.lt / d)) * (1 - E.inCubic(env.pOut));
const wrap = (v, m) => ((v % m) + m) % m;
const overlaps = (bb, x0, y0, x1, y1, pad = 0) => !(x1 < bb.x0 - pad || x0 > bb.x1 + pad || y1 < bb.y0 - pad || y0 > bb.y1 + pad);
/* static noise tiles (built once, deterministic) */
const NOISE = [];
const noiseCv = (k) => {
  k = ((k % 4) + 4) % 4;
  if (NOISE[k]) return NOISE[k];
  const w = 128, h = 96, c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'), id = x.createImageData(w, h);
  for (let i = 0; i < w * h; i++) { const v = Math.pow(J.r(i, k, 5511), 1.3) * 255; id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v; id.data[i * 4 + 3] = 255; }
  x.putImageData(id, 0, 0);
  NOISE[k] = c; return c;
};
/* time since this background started (consecutive cuts with the same bg + seed count as one run) */
const bgRun = new WeakMap();
const bgT = env => {
  const c = env.cut; if (!c) return env.t;
  let s = bgRun.get(c);
  if (s == null) {
    s = c.start;
    const cs = (env.plan && env.plan.cuts) || [], P0 = c.bgP || {};
    for (let i = (c.index | 0) - 1; i >= 0 && i < cs.length; i--) {
      const p = cs[i];
      if (p.bg === c.bg && (p.bgP || {}).seed === P0.seed && Math.abs(p.end - s) < 0.06) s = p.start; else break;
    }
    bgRun.set(c, s);
  }
  return env.t - s;
};
const bgReg = (k, d) => reg('bg', k, Object.assign({}, d, { draw(env, Pm) { const ctx = env.ctx; ctx.save(); try { d.draw(env, Pm || {}, ctx); } finally { ctx.restore(); } } }));
/* failing-light level 0..1 on a ≤24 Hz clock (mostly on, stutters now and then) */
const lamp = (t, seed, rate = 1) => {
  const st = Math.floor(t * 24), run = st >> 2;
  if (J.r(seed, run, 7) < 0.1 * rate) return J.r(seed, st, 8) < 0.5 ? 0.15 : 0.55;
  return 0.88 + 0.12 * J.r(seed, st, 9);
};

/* ================================================================== DECOR */

/* claw scratches: parallel jagged gouges scraped in around the words */
reg('decor', 'hrScratches', {
  name: '引っ掻き傷', tags: TAGS.concat(['glitch']), w: 0.9, layer: 'front', ae: 'slash',
  draw(env, bb0, Pd) {
    if (env.pass !== 'main') return;
    const bb = center(env, bb0), { W, H, sc } = env, s = Pd.seed | 0, u = U(env), out = 1 - E.inCubic(env.pOut);
    const n = Pd.n || 2;
    for (let g = 0; g < n; g++) {
      const e = E.outExpo(clamp((env.lt - 0.08 - g * 0.18) / 0.16)) * out; if (e <= 0) continue;
      const corner = (g + (Pd.v | 0)) % 4, right = corner % 2 === 1, low = corner >= 2;
      const L = u * J.rr(0.28, 0.42, s, g, 1), ang = (right ? -1 : 1) * J.rr(55, 75, s, g, 2) * DEG * (low ? -1 : 1);
      let cx = right ? J.rr(W * 0.72, W * 0.9, s, g, 3) : J.rr(W * 0.1, W * 0.28, s, g, 3);
      let cy = low ? J.rr(H * 0.72, H * 0.88, s, g, 4) : J.rr(H * 0.12, H * 0.28, s, g, 4);
      if (overlaps(bb, cx - L / 2, cy - L / 2, cx + L / 2, cy + L / 2, u * 0.02)) cy = low ? Math.max(cy, bb.y1 + L * 0.6) : Math.min(cy, bb.y0 - L * 0.6);
      const dx = Math.sin(ang), dy = -Math.cos(ang), px = Math.cos(ang), py = Math.sin(ang);
      const col = (g % 2 && J.contrast(sc.accent, sc.bg) > 1.8) ? sc.accent : sc.fg;
      for (let k = 0; k < 4; k++) {
        const off = (k - 1.5) * u * 0.042, len = L * (0.75 + 0.3 * J.r(s, g, k, 5)) * e, st = J.r(s, g, k, 6) * L * 0.1;
        const x0 = cx + px * off - dx * L / 2 + dx * st, y0 = cy + py * off - dy * L / 2 + dy * st;
        const m = 10, pts = [];
        for (let i = 0; i <= m; i++) { const f = i / m, j = J.rs(s, g, k, i) * u * 0.004; pts.push([x0 + dx * len * f + px * j, y0 + dy * len * f + py * j]); }
        // tapered: thick in the middle, thin at the ends
        const lw = u * 0.011;
        for (let i = 0; i < m; i++) env.line([pts[i], pts[i + 1]], col, Math.max(1, lw * Math.sin(Math.PI * (i + 0.5) / m)), 0.85, false);
      }
    }
  },
});

/* sigil: a slow-turning ring of marks and a seven-pointed star drawn in faint lines behind the words */
reg('decor', 'hrSigil', {
  name: '魔法陣', tags: TAGS.concat(['graphic']), w: 0.7, layer: 'back', subtle: true, ae: 'rings',
  draw(env, bb0, Pd) {
    if (env.pass !== 'main') return;
    const bb = center(env, bb0), { W, H, sc } = env, s = Pd.seed | 0, u = U(env);
    const e = E.inOutSine(clamp(env.lt / 1.2)), out = 1 - E.inCubic(env.pOut); if (out <= 0) return;
    const cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2, R = Math.min(u * 0.46, Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0) * 0.62 + u * 0.08);
    const col = isDark(sc.bg) ? layC(sc, 0.3) : layC(sc, 0.28), lw = Math.max(1.2, u * 0.0022), rot = env.ltb * 4 * (Pd.right ? -1 : 1) * DEG;
    const a = out;
    env.arc(cx, cy, R, -90, -90 + 360 * e, col, lw * 1.4, a, false);
    env.arc(cx, cy, R * 0.9, 90, 90 + 360 * e, col, lw, a, false);
    env.arc(cx, cy, R * 0.62, -90, -90 + 360 * e, col, lw, a * 0.8, false);
    // heptagram {7/3}
    const pts = [];
    for (let i = 0; i <= 7; i++) { const an = rot - Math.PI / 2 + (i * 3 % 7) / 7 * TAU; pts.push([cx + Math.cos(an) * R * 0.9, cy + Math.sin(an) * R * 0.9]); }
    env.polyPartial(pts, clamp((env.lt - 0.3) / 1.2), col, lw, a, false);
    // ring of marks between the circles
    const m = 42;
    for (let i = 0; i < m * e; i++) {
      const an = rot * -0.6 + i / m * TAU, t = J.h(s, i, 3) % 4, r0 = R * 0.915, r1 = R * 0.985, c = Math.cos(an), sn = Math.sin(an);
      if (t === 0) env.line([[cx + c * r0, cy + sn * r0], [cx + c * r1, cy + sn * r1]], col, lw, a, false);
      else if (t === 1) env.circle(cx + c * (r0 + r1) / 2, cy + sn * (r0 + r1) / 2, R * 0.012, null, col, lw, a, false);
      else if (t === 2) { const q = (r0 + r1) / 2, d = R * 0.018; env.line([[cx + c * q - sn * d, cy + sn * q + c * d], [cx + c * q + sn * d, cy + sn * q - c * d]], col, lw, a, false); }
    }
  },
});

/* the eye: a simple outline eye in a corner that opens, follows the words and blinks at the wrong moments */
reg('decor', 'hrWatchEye', {
  name: '見ている目', tags: TAGS.concat(['graphic']), w: 0.8, layer: 'front', ae: 'reticle',
  draw(env, bb0, Pd) {
    if (env.pass !== 'main') return;
    const bb = center(env, bb0), { W, H, sc } = env, s = Pd.seed | 0, u = U(env);
    const ew = u * (Pd.big ? 0.22 : 0.16), eh = ew * 0.26;
    let x = Pd.right ? W - u * 0.07 - ew / 2 : u * 0.07 + ew / 2, y = Pd.low ? H - u * 0.08 - eh : u * 0.08 + eh;
    if (overlaps(bb, x - ew / 2, y - eh, x + ew / 2, y + eh, u * 0.02)) y = Pd.low ? Math.max(y, Math.min(H - eh * 1.2, bb.y1 + eh * 1.6)) : Math.min(y, Math.max(eh * 1.2, bb.y0 - eh * 1.6));
    let open = E.outCubic(clamp((env.lt - 0.2) / 0.6)) * (1 - E.inCubic(env.pOut));
    // blinks at irregular moments
    const bt = env.ltb; for (let k = 0; k < 3; k++) { const at = 0.9 + J.r(s, k, 5) * 3 + k * 1.3, d = Math.abs(bt - at); if (d < 0.08) open *= d / 0.08; }
    if (open <= 0.01) { env.line([[x - ew / 2, y], [x + ew / 2, y]], sc.fg, Math.max(1.2, u * 0.003), 0.8 * (1 - E.inCubic(env.pOut)) * clamp(env.lt / 0.2), false); return; }
    const col = sc.fg, lw = Math.max(1.2, u * 0.003), ctx = env.ctx;
    const lid = (sgn) => { const pts = []; for (let i = 0; i <= 16; i++) { const f = i / 16, xx = x - ew / 2 + ew * f; pts.push([xx, y + sgn * Math.sin(Math.PI * f) * eh * open]); } return pts; };
    const top = lid(-1), bot = lid(1);
    // iris + pupil clipped to the eye opening, looking at the words
    const tx = (bb.x0 + bb.x1) / 2, ty = (bb.y0 + bb.y1) / 2, an = Math.atan2(ty - y, tx - x), look = Math.min(1, Math.hypot(tx - x, ty - y) / u);
    const ix = x + Math.cos(an) * ew * 0.18 * look + J.noise1(bt * 0.8, s) * ew * 0.03, iy = y + Math.sin(an) * eh * 0.3 * look;
    ctx.save(); ctx.beginPath(); top.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]); ctx.closePath(); ctx.clip();
    env.circle(ix, iy, eh * 0.78, null, col, lw, 1, false);
    env.circle(ix, iy, eh * 0.34, isDark(sc.bg) ? sc.accent : sc.fg, null, 0, 1, false);
    ctx.restore();
    env.line(top, col, lw * 1.3, 1, false); env.line(bot, col, lw, 1, false);
    for (let k = 0; k < 5; k++) { const f = 0.2 + k * 0.15, p = top[Math.round(f * 16)]; env.line([p, [p[0] + (f - 0.5) * ew * 0.12, p[1] - eh * 0.35 * open]], col, lw * 0.8, 0.8, false); }
  },
});

/* static patches: small rectangles of TV snow flicker at the edges of the frame */
reg('decor', 'hrStaticPatch', {
  name: '砂嵐の欠片', tags: TAGS.concat(['glitch']), w: 0.8, layer: 'front', ae: 'glitchRects',
  draw(env, bb0, Pd) {
    if (env.pass !== 'main') return;
    const bb = center(env, bb0), { W, H } = env, s = Pd.seed | 0, st = env.step, u = U(env), ctx = env.ctx;
    const a0 = inOut(env, 0.2); if (a0 <= 0) return;
    const n = 3 + (Pd.n || 2) * 2;
    ctx.save(); ctx.imageSmoothingEnabled = false;
    for (let k = 0; k < n; k++) {
      if (J.r(s, k, st, 1) < 0.35) continue;
      const w = u * J.rr(0.06, 0.2, s, k, 2), h = u * J.rr(0.02, 0.07, s, k, 3);
      const edge = J.h(s, k, 4) % 4;
      let x = J.r(s, k, 5) * (W - w), y = J.r(s, k, 6) * (H - h);
      if (edge === 0) y = J.rr(0.02, 0.18, s, k, 7) * H; else if (edge === 1) y = H - h - J.rr(0.02, 0.18, s, k, 7) * H;
      else if (edge === 2) x = J.rr(0.01, 0.1, s, k, 7) * W; else x = W - w - J.rr(0.01, 0.1, s, k, 7) * W;
      x += J.rs(s, k, st >> 1, 8) * u * 0.02;
      if (overlaps(bb, x, y, x + w, y + h, u * 0.02)) continue;
      const N = noiseCv(st + k), sx = Math.floor(J.r(s, k, st, 9) * 64), sy = Math.floor(J.r(s, k, st, 10) * 48);
      ctx.globalAlpha = a0 * J.rr(0.45, 0.85, s, k, st, 11);
      ctx.drawImage(N, sx, sy, 48, 24, x, y, w, h);
    }
    ctx.restore();
  },
});

/* light shaft: a slanted beam from a high window with dust hanging in it */
reg('decor', 'hrDustBeam', {
  name: '光の筋と埃', tags: TAGS.concat(['calm', 'emotional']), w: 0.8, layer: 'back', subtle: true, ae: 'sparks',
  draw(env, bb0, Pd) {
    if (env.pass !== 'main') return;
    const { W, H, sc, ctx } = env, s = Pd.seed | 0, u = U(env);
    const a = inOut(env, 0.8); if (a <= 0) return;
    const L = lightOf(sc), right = !!Pd.right, x0 = right ? W * 0.78 : W * 0.22, w0 = W * 0.12, w1 = W * 0.34, sl = (right ? -1 : 1) * W * 0.28;
    const poly = [[x0 - w0 / 2, -2], [x0 + w0 / 2, -2], [x0 + sl + w1 / 2, H + 2], [x0 + sl - w1 / 2, H + 2]];
    const g = ctx.createLinearGradient(0, 0, 0, H);
    const k = isDark(sc.bg) ? 0.1 : 0.22;
    g.addColorStop(0, J.rgba(L, (k * a).toFixed(3))); g.addColorStop(1, J.rgba(L, 0));
    ctx.save();
    if (!isDark(sc.bg)) {
      // on light paper the room around the beam is dimmed instead
      ctx.fillStyle = J.rgba(nightC(sc), (0.12 * a).toFixed(3)); ctx.beginPath(); ctx.rect(-10, -10, W + 20, H + 20);
      poly.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill('evenodd');
    }
    ctx.fillStyle = g; ctx.beginPath(); poly.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.fill(); ctx.clip();
    const dustC = isDark(sc.bg) ? L : sc.sub;
    const t = env.ltb;
    for (let i = 0; i < 46; i++) {
      const fy = wrap(J.r(s, i, 1) + t * J.rr(0.004, 0.02, s, i, 2), 1), y = fy * H, f = J.r(s, i, 3);
      const cx = x0 + sl * fy, ww = w0 + (w1 - w0) * fy, x = cx + (f - 0.5) * ww + Math.sin(t * 0.7 + i) * u * 0.01;
      env.circle(x, y, u * J.rr(0.0012, 0.0035, s, i, 4), dustC, null, 0, a * (0.35 + 0.35 * Math.sin(t * 1.5 + i)) * (1 - fy * 0.6), false);
    }
    ctx.restore();
  },
});

/* drips: dark ink running down from the top edge of the frame, slowly */
reg('decor', 'hrDrips', {
  name: '垂れる墨', tags: TAGS.concat(['emotional']), w: 0.8, layer: 'front', ae: 'blobs',
  draw(env, bb0, Pd) {
    if (env.pass !== 'main') return;
    const bb = center(env, bb0), { W, H, sc } = env, s = Pd.seed | 0, u = U(env);
    const out = 1 - E.inCubic(env.pOut); if (out <= 0) return;
    const col = isDark(sc.bg) ? J.mix(sc.accent, sc.bg, 0.35) : nightC(sc);
    const band = u * 0.03 * E.outCubic(clamp(env.lt / 0.4));
    const pts = [[-4, -4], [W + 4, -4]];
    for (let i = 40; i >= 0; i--) pts.push([W * i / 40, band * (0.6 + 0.6 * J.r(s, i, 1))]);
    env.poly(pts, col, 0.9 * out, false);
    const n = 7 + (Pd.n | 0) * 3, lim = Math.max(band * 2, bb.y0 - u * 0.05);
    for (let k = 0; k < n; k++) {
      const x = W * (0.03 + 0.94 * J.r(s, k, 2)), g = E.outCubic(clamp((env.lt - J.r(s, k, 3) * 0.8) / (2.5 + J.r(s, k, 4) * 3)));
      let L = u * J.rr(0.06, 0.3, s, k, 5) * g;
      if (x > bb.x0 - u * 0.03 && x < bb.x1 + u * 0.03) L = Math.min(L, lim - band);
      if (L <= 1) continue;
      const w = u * J.rr(0.004, 0.012, s, k, 6);
      env.poly([[x - w, band * 0.5], [x + w, band * 0.5], [x + w * 0.7, band + L], [x - w * 0.7, band + L]], col, 0.9 * out, false);
      env.circle(x, band + L, w * 1.35, col, null, 0, 0.9 * out, false);
    }
  },
});

/* cracks: fine fractures creep out of a corner of the frame */
reg('decor', 'hrCracks', {
  name: 'ひび割れ', tags: TAGS.concat(['graphic', 'glitch']), w: 0.7, layer: 'front', ae: 'lineBurst',
  draw(env, bb0, Pd) {
    if (env.pass !== 'main') return;
    const bb = center(env, bb0), { W, H, sc } = env, s = Pd.seed | 0, u = U(env);
    const out = 1 - E.inCubic(env.pOut); if (out <= 0) return;
    const e = E.outCubic(clamp(env.lt / 1.6));
    const ox = Pd.right ? W : 0, oy = Pd.low ? H : 0, col = sc.fg, lw = Math.max(1, u * 0.0018);
    const base = Math.atan2(H / 2 - oy, W / 2 - ox);
    const branch = (x, y, an, len, depth, id) => {
      const pts = [[x, y]]; let cx = x, cy = y;
      const m = 7;
      for (let i = 1; i <= m; i++) { const a = an + J.rs(s, id, i, 1) * 0.5; cx += Math.cos(a) * len / m; cy += Math.sin(a) * len / m; if (overlaps(bb, cx, cy, cx, cy, u * 0.03)) break; pts.push([cx, cy]); }
      env.polyPartial(pts, clamp(e * (1 + depth * 0.2) - depth * 0.25), col, lw * (1.4 - depth * 0.35), 0.75 * out, false);
      if (depth < 2) for (let k = 0; k < 2; k++) { const j = 2 + (J.h(s, id, k, 3) % (pts.length - 1 || 1)); const p = pts[Math.min(j, pts.length - 1)]; branch(p[0], p[1], an + (k ? 0.6 : -0.6) * J.rr(0.6, 1.2, s, id, k, 4), len * 0.5, depth + 1, id * 3 + k + 1); }
    };
    for (let r = 0; r < 3; r++) branch(ox, oy, base + (r - 1) * 0.35 + J.rs(s, r, 9) * 0.15, u * J.rr(0.28, 0.42, s, r, 10), 0, r + 1);
  },
});

/* ================================================================== BACKGROUNDS */

bgReg('hrFailingLamp', {
  ae: 'vignettePulse',
  name: '切れかけの灯', tags: TAGS.concat(['emotional']), w: 0.9, subtle: true,
  plan: rng => ({ seed: rng.int(1, 1e9), x: rng.range(0.35, 0.65), rate: rng.range(0.7, 1.3) }),
  draw(env, Pm, ctx) {
    const { W, H, sc } = env, t = env.t, u = U(env), lv = lamp(t, Pm.seed | 0, Pm.rate || 1), fi = E.outCubic(clamp(bgT(env) / 0.6));
    const L = lightOf(sc), dk = nightC(sc), cx = W * (Pm.x || 0.5), cy = -u * 0.1;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.hypot(W, H) * 0.9);
    g.addColorStop(0, J.rgba(L, ((isDark(sc.bg) ? 0.16 : 0.3) * lv * fi).toFixed(3))); g.addColorStop(0.5, J.rgba(L, ((isDark(sc.bg) ? 0.04 : 0.08) * lv * fi).toFixed(3))); g.addColorStop(1, J.rgba(L, 0));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.6);
    v.addColorStop(0, J.rgba(dk, 0)); v.addColorStop(1, J.rgba(dk, ((0.75 - 0.25 * lv) * fi).toFixed(3)));
    ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
    // the tube itself
    ctx.globalAlpha = (0.25 + 0.5 * lv) * fi; ctx.fillStyle = layC(sc, isDark(sc.bg) ? 0.35 : 0.15);
    ctx.fillRect(cx - u * 0.12, u * 0.012, u * 0.24, Math.max(2, u * 0.006));
  } });

bgReg('hrCorridor', {
  ae: 'squareTunnel',
  name: '暗い廊下', tags: TAGS.concat(['graphic']), w: 0.8,
  plan: rng => ({ seed: rng.int(1, 1e9), vx: rng.range(0.44, 0.56), vy: rng.range(0.44, 0.54), spd: rng.range(0.25, 0.45), doors: rng.chance(0.75) }),
  draw(env, Pm, ctx) {
    const { W, H, sc } = env, t = bgT(env), u = U(env), fi = E.outCubic(clamp(t / 0.6));
    const vx = W * (Pm.vx || 0.5), vy = H * (Pm.vy || 0.5), bw = W * 0.08, bh = H * 0.1;
    const col = layC(sc, isDark(sc.bg) ? 0.28 : 0.22), lw = Math.max(1.2, u * 0.0026);
    // depth map: z in (0,1], 1 = at the screen edge, small = far away
    const at = (z, fx, fy) => [vx + (fx - vx) * z + (bw * (fx < vx ? -1 : 1)) * (1 - z) * 0, vy + (fy - vy) * z];
    const back = [[vx - bw, vy - bh], [vx + bw, vy - bh], [vx + bw, vy + bh], [vx - bw, vy + bh]];
    const corners = [[0, 0], [W, 0], [W, H], [0, H]];
    // the light at the far end (flickers)
    const lv = lamp(env.t, (Pm.seed | 0) + 1, 1);
    const g = ctx.createRadialGradient(vx, vy, 0, vx, vy, Math.max(bw, bh) * 3);
    g.addColorStop(0, J.rgba(lightOf(sc), ((isDark(sc.bg) ? 0.22 : 0.3) * lv * fi).toFixed(3))); g.addColorStop(1, J.rgba(lightOf(sc), 0));
    ctx.fillStyle = g; ctx.fillRect(vx - bw * 4, vy - bh * 4, bw * 8, bh * 8);
    ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.globalAlpha = fi; ctx.beginPath();
    for (let i = 0; i < 4; i++) { ctx.moveTo(corners[i][0], corners[i][1]); ctx.lineTo(back[i][0], back[i][1]); }
    ctx.rect(vx - bw, vy - bh, bw * 2, bh * 2);
    // frames sliding towards the camera
    const n = 7, sp = Pm.spd || 0.35;
    for (let k = 0; k < n; k++) {
      const f = wrap(k / n + t * sp * 0.12, 1), z = Math.pow(f, 2.2);
      const x0 = J.lerp(vx - bw, 0, z), x1 = J.lerp(vx + bw, W, z), y0 = J.lerp(vy - bh, 0, z), y1 = J.lerp(vy + bh, H, z);
      ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.moveTo(x0, y1); ctx.lineTo(x1, y1);
      if (Pm.doors && k % 2 === 0) {
        // a door on each wall: two verticals between the ceiling and floor edges
        const z2 = Math.pow(wrap(f + 0.05, 1), 2.2);
        if (z2 > z) for (const side of [0, 1]) {
          const xa = side ? x1 : x0, xb = side ? J.lerp(vx + bw, W, z2) : J.lerp(vx - bw, 0, z2);
          const ya = J.lerp(y0, y1, 0.25), yb = J.lerp(J.lerp(vy - bh, 0, z2), J.lerp(vy + bh, H, z2), 0.25);
          ctx.moveTo(xa, y1); ctx.lineTo(xa, ya); ctx.lineTo(xb, yb); ctx.lineTo(xb, J.lerp(vy + bh, H, z2));
        }
      }
    }
    ctx.stroke();
    const v = ctx.createRadialGradient(vx, vy, Math.min(W, H) * 0.2, vx, vy, Math.hypot(W, H) * 0.65);
    v.addColorStop(0, J.rgba(nightC(sc), 0)); v.addColorStop(1, J.rgba(nightC(sc), (0.55 * fi).toFixed(3)));
    ctx.globalAlpha = 1; ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
  } });

bgReg('hrMold', {
  ae: 'meshBlobs',
  name: '広がる染み', tags: TAGS.concat(['emotional']), w: 0.7, subtle: true,
  plan: rng => ({ seed: rng.int(1, 1e9), n: rng.int(3, 5), k: rng.range(0.08, 0.14) }),
  draw(env, Pm, ctx) {
    const { W, H, sc } = env, t = bgT(env), u = U(env), s = Pm.seed | 0, k = Pm.k || 0.1;
    const stain = isDark(sc.bg) ? J.mix(sc.bg, J.mix(sc.fg, sc.accent2 || sc.sub, 0.5), k) : J.mix(sc.bg, J.mix(sc.sub, '#000000', 0.3), k * 1.4);
    const rim = isDark(sc.bg) ? J.mix(sc.bg, sc.fg, k * 1.6) : J.mix(sc.bg, '#000000', k * 1.3);
    for (let i = 0; i < (Pm.n || 4); i++) {
      const edge = J.h(s, i, 1) % 4, f = J.r(s, i, 2);
      const cx = edge === 0 ? f * W : edge === 1 ? W : edge === 2 ? f * W : 0, cy = edge === 0 ? 0 : edge === 1 ? f * H : edge === 2 ? H : f * H;
      const R = u * J.rr(0.25, 0.5, s, i, 3) * (0.35 + 0.65 * E.outCubic(clamp(t / J.rr(8, 14, s, i, 4)))) * E.outCubic(clamp(t / 0.8));
      const m = 36, pts = [];
      for (let j = 0; j < m; j++) { const a = j / m * TAU, r = R * (0.7 + 0.45 * J.noise1(j * 0.45, s + i) + 0.04 * Math.sin(t * 0.3 + j)); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
      env.blob(pts, stain, 0.9, false);
      ctx.save(); ctx.strokeStyle = rim; ctx.lineWidth = Math.max(1, u * 0.003); ctx.globalAlpha = 0.6; ctx.beginPath();
      pts.forEach((p, j) => (j ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.closePath(); ctx.stroke(); ctx.restore();
      // speckles around the edge of the stain
      for (let j = 0; j < 14; j++) { const a = J.r(s, i, j, 5) * TAU, r = R * J.rr(1.02, 1.25, s, i, j, 6); env.circle(cx + Math.cos(a) * r, cy + Math.sin(a) * r, u * J.rr(0.002, 0.008, s, i, j, 7), stain, null, 0, 0.9, false); }
    }
  } });

bgReg('hrDeadTrees', {
  ae: 'mountains',
  name: '枯れ木の森', tags: TAGS.concat(['calm', 'emotional']), w: 0.7,
  plan: rng => ({ seed: rng.int(1, 1e9), n: rng.int(5, 8), fog: rng.range(0.1, 0.2) }),
  draw(env, Pm, ctx) {
    const { W, H, sc } = env, t = env.t, u = U(env), s = Pm.seed | 0, fi = E.outCubic(clamp(bgT(env) / 0.8));
    const layers = [[0.07, 0.75, 0.8], [0.13, 1, 1.15]];
    layers.forEach(([k, hk, sk], l) => {
      const col = isDark(sc.bg) ? layC(sc, k * 0.9) : J.mix(sc.bg, '#000000', k * 1.6);
      ctx.strokeStyle = col; ctx.lineCap = 'round'; ctx.globalAlpha = fi;
      const n = (Pm.n || 6) + l * 2;
      for (let i = 0; i < n; i++) {
        const x = W * (i + 0.5 + J.rs(s, l, i, 1) * 0.35) / n, h = H * J.rr(0.7, 1.05, s, l, i, 2) * hk, sw = Math.sin(t * 0.4 + i + l) * 0.012;
        const seg = (x0, y0, an, len, d, id) => {
          const x1 = x0 + Math.cos(an) * len, y1 = y0 + Math.sin(an) * len;
          ctx.lineWidth = Math.max(1, u * 0.02 * sk * Math.pow(0.55, d)); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
          if (d >= 4) return;
          const nb = 2;
          for (let b = 0; b < nb; b++) seg(x1, y1, an + (b ? 1 : -1) * J.rr(0.25, 0.7, s, id, b, 3) + sw * (d + 1), len * J.rr(0.55, 0.78, s, id, b, 4), d + 1, id * 2 + b + 1);
        };
        seg(x, H + 2, -Math.PI / 2 + J.rs(s, l, i, 5) * 0.08, h * 0.42, 0, (l * 50 + i) * 64 + 1);
      }
    });
    const f = ctx.createLinearGradient(0, H * 0.45, 0, H);
    f.addColorStop(0, J.rgba(lightOf(sc), 0)); f.addColorStop(1, J.rgba(isDark(sc.bg) ? layC(sc, 0.5) : sc.bg, ((Pm.fog || 0.15) * fi).toFixed(3)));
    ctx.globalAlpha = 1; ctx.fillStyle = f; ctx.fillRect(0, H * 0.45, W, H * 0.55);
  } });

/* ================================================================== CAMERA */
const KM = env => clamp((env.fx.motion ?? 0.7) * 1.25, 0, 1.25);

reg('cam', 'hrNervous', {
  ae: 'handheld',
  name: '怯えた手持ち', tags: TAGS.concat(['glitch', 'emotional']), w: 0.9,
  plan: rng => ({ f: rng.range(0.9, 1.3), jerk: rng.range(0.6, 1) }),
  get: (env, Pm) => {
    const K = KM(env), f = Pm.f || 1, t = env.lt, sd = env.cut.seed | 0;
    let x = (J.noise1(t * f * 1.7, sd) * 0.6 + J.noise1(t * f * 5.3, sd + 1) * 0.4) * env.W * 0.009 * K;
    let y = (J.noise1(t * f * 1.4, sd + 2) * 0.6 + J.noise1(t * f * 4.7, sd + 3) * 0.4) * env.H * 0.011 * K + Math.sin(t * 2.2) * env.H * 0.004 * K;
    let rot = J.noise1(t * f * 1.1, sd + 4) * 1.2 * K;
    // a sudden flinch now and then, settling fast
    const per = 1.6, cyc = Math.floor(t / per), since = t - cyc * per - J.r(sd, cyc, 5) * per * 0.6;
    if (since > 0 && J.r(sd, cyc, 6) < 0.65 * (Pm.jerk || 0.8)) {
      const d = Math.exp(-since * 9) * K;
      x += J.rs(sd, cyc, 7) * env.W * 0.025 * d; y += J.rs(sd, cyc, 8) * env.H * 0.03 * d; rot += J.rs(sd, cyc, 9) * 3 * d;
    }
    return { x, y, rot, s: 1.03, blur: 0 };
  } });

reg('cam', 'hrDutchSnap', {
  ae: 'dutch',
  name: '不意の傾き', tags: TAGS.concat(['emotional', 'graphic']), w: 0.7, strong: true,
  plan: rng => ({ at: rng.range(0.45, 0.65), a: rng.range(3, 4.8) * rng.pick([1, -1]) }),
  get: (env, Pm) => {
    const K = KM(env), d = env.cut.dur, u = clamp(env.lt / Math.max(0.3, d));
    const q = clamp((env.lt - d * (Pm.at || 0.55)) / 0.1), e = E.outBack(q, 2.5);
    return { s: 1 + 0.045 * K * E.inOutSine(u) + 0.02 * K * e, rot: (Pm.a || 4) * Math.min(1, K) * e, y: -env.H * 0.006 * K * e };
  } });

/* ================================================================== SCREEN EFFECTS */
const evS = ev => J.h(Math.round(ev.t * 1000), 9127);
const fx = (k, d) => reg('fx', k, Object.assign({}, d, { draw(ctx, ev, k2, I) { ctx.save(); try { d.draw(ctx, ev, clamp(k2), I); } finally { ctx.restore(); } } }));

/* one frame of a zoomed, red-stained negative */
fx('hrSubliminal', {
  name: 'サブリミナル', tags: TAGS.concat(['glitch']), w: 0.6, dur: 2, amp: 1, glitchy: true, mid: true, scratch: true, ae: 'invert',
  draw(ctx, ev, k, I) {
    const { cw, ch, S, sc } = I; if (!S) return;
    if (k > 0.55) return;
    const s = evS(ev), z = 1.25 + 0.2 * J.r(s, 1), cx = cw * (0.5 + J.rs(s, 2) * 0.08), cy = ch * (0.5 + J.rs(s, 3) * 0.08);
    ctx.drawImage(S, cx - cx * z, cy - cy * z, cw * z, ch * z);
    ctx.globalCompositeOperation = 'difference'; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = 'multiply'; ctx.fillStyle = J.fitContrast(sc.accent, '#ffffff', 2.5); ctx.fillRect(0, 0, cw, ch);
    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#000000'; ctx.globalAlpha = 0.25; ctx.fillRect(0, 0, cw, ch);
  } });

/* the picture tears, drops to black with a signal-lost caption, and rolls back in */
fx('hrSignalLoss', {
  name: '映像の途切れ', tags: TAGS.concat(['glitch', 'editorial']), w: 0.7, dur: 9, pre: 3, amp: 1, glitchy: true, scratch: true, ae: 'blackFrame',
  draw(ctx, ev, k, I) {
    const { cw, ch, S } = I; if (!S) return;
    const s = evS(ev), st = I.step * 7 + s;
    if (k < 0.3) {
      const q = k / 0.3, n = 10;
      for (let i = 0; i < n; i++) {
        const y = Math.floor(ch * i / n), h = Math.ceil(ch / n);
        if (J.r(st, i, 1) < 0.5 * q) ctx.drawImage(S, 0, y, cw, h, J.rs(st, i, 2) * cw * 0.12 * q, y, cw, h);
      }
      ctx.globalAlpha = 0.5 * q; ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, cw, ch);
      return;
    }
    if (k < 0.78) {
      ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, cw, ch);
      const fs = Math.max(10, Math.round(Math.min(cw, ch) * 0.035));
      ctx.font = J.fontCSS('mono', fs); ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff'; ctx.globalAlpha = (I.step % 4 < 3) ? 0.85 : 0.3;
      ctx.fillText('NO SIGNAL', cw * 0.06, ch * 0.08);
      ctx.globalAlpha = 0.6; ctx.fillText('CH ' + String(3 + (s % 9)).padStart(2, '0'), cw * 0.06, ch * 0.08 + fs * 1.5);
      return;
    }
    const q = (k - 0.78) / 0.22, oy = Math.round((1 - q) * ch * 0.5);
    ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(S, 0, oy); ctx.drawImage(S, 0, oy - ch);
    ctx.fillRect(0, oy - Math.max(3, ch * 0.03), cw, Math.max(3, ch * 0.03));
  } });

/* something tall and dark crosses the frame in a few frames */
fx('hrPassingShadow', {
  name: '横切る影', tags: TAGS.concat(['emotional']), w: 0.5, dur: 5, amp: 1, mid: true, ae: 'flash',
  draw(ctx, ev, k, I) {
    const { cw, ch } = I, s = evS(ev), dir = J.r(s, 1) < 0.5 ? 1 : -1, M = Math.min(cw, ch);
    const x = dir > 0 ? J.lerp(-cw * 0.25, cw * 1.25, k) : J.lerp(cw * 1.25, -cw * 0.25, k);
    const w = M * J.rr(0.22, 0.32, s, 2), h = ch * 1.1, top = ch * J.rr(0.05, 0.2, s, 3);
    // dark on light pictures, a pale figure on dark ones; a wider faint copy stands in for a soft edge
    const dk = isDark(I.sc.bg);
    ctx.fillStyle = dk ? J.mix(I.sc.fg, I.sc.bg, 0.35) : '#000000';
    const fig = (g, a) => {
      ctx.globalAlpha = a;
      ctx.beginPath(); ctx.ellipse(x, top + w * 0.35, w * 0.3 * g, w * 0.38 * g, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(x - w * 0.5 * g, h); ctx.quadraticCurveTo(x - w * 0.55 * g, top + w * 0.75, x, top + w * (0.7 - 0.05 * g)); ctx.quadraticCurveTo(x + w * 0.55 * g, top + w * 0.75, x + w * 0.5 * g, h); ctx.closePath(); ctx.fill();
    };
    fig(1.12, dk ? 0.15 : 0.3); fig(1, dk ? 0.3 : 0.65);
    ctx.filter = 'none';
  } });

/* ================================================================== TRANSITIONS */
const trReg = (k, d) => reg('trans', k, Object.assign({}, d, {
  draw(ctx, A, B, p, I) {
    ctx.save();
    try { if (!(p > 0)) ctx.drawImage(A, 0, 0); else if (p >= 1) ctx.drawImage(B, 0, 0); else d.draw(ctx, A, B, p, I, I.P || {}); }
    finally { ctx.restore(); }
  } }));

/* static cut: the old shot drowns in snow, the new one surfaces out of it */
trReg('hrStaticCut', {
  name: '砂嵐カット', tags: TAGS.concat(['glitch']), w: 0.9, dur: 0.4, ae: 'pixelate',
  plan: rng => ({ roll: rng.chance(0.6) }),
  draw(ctx, A, B, p, I, Pm) {
    const { cw, ch } = I, st = I.step, src = p < 0.5 ? A : B;
    const nz = p < 0.5 ? E.inQuad(p / 0.5) : 1 - E.outQuad((p - 0.5) / 0.5);
    const oy = Pm.roll ? Math.round(Math.sin(p * Math.PI) * ch * 0.08 * (p < 0.5 ? 1 : -1)) : 0;
    ctx.drawImage(src, 0, oy); if (oy) ctx.drawImage(src, 0, oy > 0 ? oy - ch : oy + ch);
    const N = noiseCv(st), pat = ctx.createPattern(N, 'repeat');
    const sz = Math.max(1, Math.round(ch / 400));
    try { pat.setTransform(new DOMMatrix([sz * 2, 0, 0, sz, -Math.floor(J.r(st, 1) * 128) * sz * 2, -Math.floor(J.r(st, 2) * 96) * sz])); } catch (e) { /* plain */ }
    ctx.imageSmoothingEnabled = false; ctx.globalAlpha = Math.min(1, nz * 1.15); ctx.fillStyle = pat; ctx.fillRect(0, 0, cw, ch);
    ctx.globalAlpha = 0.5 * nz; ctx.fillStyle = '#000000'; ctx.fillRect(0, J.r(st, 3) * ch, cw, ch * 0.12);
  } });

/* blink: eyelids close on the old shot and open on the new one */
trReg('hrBlink', {
  name: 'まばたき', tags: TAGS.concat(['emotional']), w: 0.8, dur: 0.45, ae: 'irisOpen',
  plan: rng => ({ half: rng.chance(0.3) }),
  draw(ctx, A, B, p, I, Pm) {
    const { cw, ch } = I, src = p < 0.5 ? A : B;
    const c = p < 0.5 ? E.inCubic(p / 0.5) : 1 - E.outCubic((p - 0.5) / 0.5);
    ctx.drawImage(src, 0, 0);
    if (c <= 0) return;
    const h = ch / 2 * c * 1.02, bow = ch * 0.18 * (1 - c * 0.6);
    ctx.fillStyle = '#000000';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(cw, 0); ctx.lineTo(cw, h - bow); ctx.quadraticCurveTo(cw / 2, h + bow, 0, h - bow); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, ch); ctx.lineTo(cw, ch); ctx.lineTo(cw, ch - h + bow); ctx.quadraticCurveTo(cw / 2, ch - h - bow, 0, ch - h + bow); ctx.closePath(); ctx.fill();
    // a soft edge around the lids
    const g = ctx.createLinearGradient(0, 0, 0, ch);
    g.addColorStop(0, 'rgba(0,0,0,0.6)'); g.addColorStop(0.5, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.globalAlpha = c; ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);
  } });

/* ================================================================== STYLES */
const LAY = { hrFlashlight: 1.6, hrDoorGap: 1.3, hrWallScrawl: 1.2, hrCctv: 1.2, hrOuija: 0.9, hrMissing: 1, hrWrongOne: 1.5, hrRisingDark: 1.3, hrRedacted: 1, hrStaticTv: 1, hrSpiritPhoto: 1, hrWrongShadow: 1.3, center: 1.1, vcols: 1.2, pop: 0.3 };
const ENT = { hrBlinkCreep: 1.3, hrJumpScare: 0.9, hrUneasy: 1.6, hrVhold: 1.1, hrMirrorSnap: 1, hrManifest: 1.6, hrClawReveal: 1, blur: 1.2, flicker: 1.2, pop: 0.2, bounceBig: 0.1, bubbles: 0.1 };
const EXI = { hrPulledDown: 1.4, hrLookBack: 1.3, hrTurnAway: 1.2, hrShiver: 1.2, hrSwallow: 1.3, hrFlickerDie: 1.3, hrDrain: 1.2, blur: 1.1, popOut: 0.1, balloonOff: 0.1 };
const S = {
  hrRuin: {
    name: '廃墟', desc: '褪せた緑灰色・錆の赤・明朝の残響', moods: ['horror'], set: 'horror',
    schemes: [
      { bg: '#161B18', fg: '#D3DACF', sub: '#7D887E', accent: '#B0473A', accent2: '#6E8B6B', ink: '#D3DACF', dim: '#1F2621', ghostA: '#5E7A62', ghostB: '#8A3A30' },
      { bg: '#8C958A', fg: '#141814', sub: '#2E362F', accent: '#6A1A14', accent2: '#E4E8DF', ink: '#141814', dim: '#848D82', ghostA: '#3F4D41', ghostB: '#6A1A14' },
      { bg: '#0C0F0D', fg: '#A9B8A6', sub: '#5D6B5E', accent: '#C24A3A', accent2: '#A9B8A6', ink: '#A9B8A6', dim: '#161B17', ghostA: '#2F4A36', ghostB: '#5E1E18' },
    ],
    fonts: { display: ['mincho_black', 'shippori'], serif: ['mincho', 'mincho_light'], body: ['mincho_light'], mono: ['mono'] },
    texture: { grain: 1, paper: 0.15, scan: 0.1 }, ghost: 0.55,
    bias: { layout: LAY, enter: ENT, exit: EXI,
      treat: { hrEroded: 1.6, hrInkBleed: 1.2, hrDoubleExp: 1.2, hrRedact: 0.6, rainbow: 0.1, sticker: 0.1 },
      bg: { hrFailingLamp: 1.6, hrCorridor: 1.4, hrMold: 1.4, hrDeadTrees: 1.2, polka: 0.1, candy: 0.1 },
      cam: { hrNervous: 1.4, hrDutchSnap: 1.1, handheld: 1.2, bounce: 0.1, jelly: 0.1 },
      fx: { hrPassingShadow: 1.2, hrSubliminal: 1, hrSignalLoss: 0.8, dustScratches: 1.2, starGlint: 0.1 } },
    decor: { hrDustBeam: 1.6, hrCracks: 1.2, hrSigil: 0.8, hrScratches: 1, hrWatchEye: 0.6, hrDrips: 0.8, confetti: 0.05, heartsStars: 0.05 }, hud: false, glow: 0.4,
  },
  hrNightRec: {
    name: '深夜の録画', desc: '真っ黒な画面・監視映像の白と赤・砂嵐', moods: ['horror'], set: 'horror',
    schemes: [
      { bg: '#050505', fg: '#EDEDED', sub: '#8A8A8A', accent: '#E3261E', accent2: '#FFFFFF', ink: '#EDEDED', dim: '#121212', ghostA: '#6E6E6E', ghostB: '#E3261E' },
      { bg: '#0B0E0B', fg: '#D8F0D8', sub: '#6F866F', accent: '#FF3A2A', accent2: '#D8F0D8', ink: '#D8F0D8', dim: '#141A14', ghostA: '#3E6B3E', ghostB: '#FF3A2A' },
      { bg: '#DADADA', fg: '#0A0A0A', sub: '#4A4A4A', accent: '#C8140E', accent2: '#0A0A0A', ink: '#0A0A0A', dim: '#CCCCCC', ghostA: '#8A8A8A', ghostB: '#C8140E' },
    ],
    fonts: { display: ['gothic_bold', 'gothic_black'], serif: ['mincho'], body: ['gothic_med'], mono: ['mono', 'dot'] },
    texture: { grain: 1.2, paper: 0, scan: 0.7 }, ghost: 0.8,
    bias: { layout: Object.assign({}, LAY, { hrCctv: 2.2, hrStaticTv: 1.6, hrRedacted: 1.3, type: 1.2 }), enter: Object.assign({}, ENT, { hrVhold: 1.8, glitchIn: 1 }), exit: Object.assign({}, EXI, { hrFlickerDie: 1.8, glitch: 1 }),
      treat: { hrDoubleExp: 1.4, hrRedact: 1.2, glitchSplit: 1, rainbow: 0.1 },
      bg: { hrFailingLamp: 1.4, hrCorridor: 1.6, vhsBand: 1.4, noiseField: 1, polka: 0.1 },
      cam: { hrNervous: 1.8, hrDutchSnap: 1, handheld: 1.2, jelly: 0.1 },
      fx: { hrSignalLoss: 1.6, hrSubliminal: 1.3, hrPassingShadow: 1, tvStatic: 1.4, trackingNoise: 1.2, vhsRoll: 1.2, starGlint: 0.1 } },
    decor: { hrStaticPatch: 1.6, hrWatchEye: 1, hrCracks: 0.8, hrScratches: 0.8, timecodeBar: 1, hud: 1, confetti: 0.05 }, hud: true, glow: 0.5, glitchBoost: 1.2,
  },
  hrCurse: {
    name: '呪いの手紙', desc: '黄ばんだ便箋・褪せた墨・暗い赤の書き込み', moods: ['horror'], set: 'horror',
    schemes: [
      { bg: '#D8CBA4', fg: '#2A2017', sub: '#6B5B45', accent: '#7E1410', accent2: '#3F3326', ink: '#2A2017', dim: '#CDBF97', ghostA: '#9A2A20', ghostB: '#8A7A5E', paper: true },
      { bg: '#1C140E', fg: '#E3D5B0', sub: '#9A8866', accent: '#B8261C', accent2: '#E3D5B0', ink: '#E3D5B0', dim: '#271D15', ghostA: '#6E1510', ghostB: '#5A4A34', paper: true },
      { bg: '#C4B28A', fg: '#3A0D0A', sub: '#6E4A3A', accent: '#1E1812', accent2: '#7E1410', ink: '#3A0D0A', dim: '#B9A67D', ghostA: '#7E1410', ghostB: '#6E5E44', paper: true },
    ],
    fonts: { display: ['klee', 'brush', 'mincho_black'], serif: ['klee', 'mincho'], body: ['klee', 'mincho'], mono: ['mono'] },
    texture: { grain: 0.7, paper: 1, scan: 0 }, ghost: 0.4,
    bias: { layout: Object.assign({}, LAY, { hrWallScrawl: 2, hrMissing: 1.6, hrSpiritPhoto: 1.5, hrOuija: 1.3, hrCctv: 0.5, letterPaper: 1.2 }), enter: Object.assign({}, ENT, { hrClawReveal: 1.4, inkBleed: 1.4 }), exit: Object.assign({}, EXI, { hrDrain: 1.8, burn: 1 }),
      treat: { hrInkBleed: 1.8, hrEroded: 1.3, hrRedact: 0.8, sticker: 0.1, chrome: 0.1 },
      bg: { hrMold: 1.8, hrFailingLamp: 1, tornPaper: 1, polka: 0.1 },
      cam: { hrNervous: 1, hrDutchSnap: 1.2, driftDiag: 1 },
      fx: { hrSubliminal: 1.2, hrPassingShadow: 1, filmBurn: 1, dustScratches: 1.4, starGlint: 0.1 } },
    decor: { hrDrips: 1.6, hrScratches: 1.2, hrSigil: 1.2, hrCracks: 0.8, crossOut: 1, scribbleCircle: 0.8, confetti: 0.05 }, hud: false, glow: 0.3,
  },
};
for (const [k, v] of Object.entries(S)) {
  if (J.STYLES[k]) continue;
  J.STYLES[k] = v;
  if (!J.STYLE_ORDER.includes(k)) J.STYLE_ORDER.push(k);
}
})();

/* JIZURA pack: kinetic (1) — kinetic typography layouts: word-timed stacks, turns, swaps, dives and flows */
(() => {
'use strict';
const E = J.E;
const P = 'kinetic';
const DEG = J.DEG, TAU = J.TAU, clamp = J.clamp, lerp = J.lerp;
const reg = (key, def) => J.register('layout', key, Object.assign(def, { set: 'kinetic' }), P);

/* ---------------------------------------------------------------- helpers */
const U = env => Math.min(env.W, env.H);
const isPort = env => env.H > env.W * 1.08;
const strip = t => String(t || '').replace(/\s+/g, '');
const hasLatin = t => /[A-Za-z]/.test(String(t || ''));
const flat = t => (hasLatin(t) ? String(t || '').trim().replace(/\s+/g, ' ') : strip(t));
const gcount = t => [...strip(t)].length;
const fontsOf = (st, roles) => J.fontsOf(st, roles);
const bodyF = env => (env.st.fonts.body && env.st.fonts.body[0]) || 'gothic_med';
const monoF = env => (env.st.fonts.mono && env.st.fonts.mono[0]) || 'mono';
const tout = env => 1 - E.inCubic(env.pOut);
const meas = (text, font, size, o) => J.measure(Object.assign({ text, font, size }, o || {}));
const em = (text, font, o) => meas(text, font, 100, o).w / 100;
const box = (x0, y0, x1, y1) => ({ x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, boxes: [] });
const UB = (a, b) => J.unionBB(a, b);
/* motion index that makes J.mainDraw start this item's entrance at local time t */
const miAt = (env, t) => Math.max(0, t) / Math.max(0.005, env.cut.stagger || 0.04);
const rotV = (x, y, a) => { const c = Math.cos(a * DEG), s = Math.sin(a * DEG); return [x * c - y * s, x * s + y * c]; };
// damped spring 1 → 0 (overshoots through 0), t in seconds
const sprg = (t, k = 7, f = 18) => (t <= 0 ? 1 : Math.exp(-k * t) * Math.cos(f * t));
const bellK = k => Math.sin(Math.PI * clamp(k));
/* text colour that reads on a plate colour */
const onCol = (sc, fill) => {
  let best = null, bv = 0;
  for (const c of [sc.bg, sc.fg, sc.ink, sc.accent, sc.sub]) { if (!c || c === fill) continue; const k = J.contrast(c, fill); if (k > bv) { bv = k; best = c; } }
  return bv >= 2.6 ? best : (J.lum(fill) > 0.5 ? '#111111' : '#FFFFFF');
};
// accent that reads on the background (else fg)
const accOn = (sc) => (J.contrast(sc.accent, sc.bg) >= 1.7 ? sc.accent : sc.fg);

/* ---- word units: the cut's word chunks, merged / split to a usable count ---- */
const unitCache = new Map();
function splitUnit(s) {
  const t = String(s).trim();
  if (/\s/.test(t)) {                                   // latin phrase: at the space nearest the middle
    const mid = t.length / 2; let bi = -1, bd = 1e9;
    for (let i = 0; i < t.length; i++) if (t[i] === ' ' && Math.abs(i - mid) < bd) { bd = Math.abs(i - mid); bi = i; }
    return [t.slice(0, bi).trim(), t.slice(bi + 1).trim()];
  }
  const n = [...t].length;
  const parts = J.splitLines(t, Math.ceil(n / 2)).split('\n');
  return parts.length >= 2 ? [parts[0], parts.slice(1).join('')] : [t];
}
function unitsOf(cut, maxU = 6, minU = 1) {
  const text = String(cut.text || '');
  const key = text + '\u0002' + (cut.words || []).join('\u0001') + '\u0002' + maxU + ':' + minU;
  let w = unitCache.get(key);
  if (w) return w;
  const lat = hasLatin(text);
  w = (cut.words && cut.words.length ? cut.words : (J.chunkText ? J.chunkText(text) : text.split(/\s+/))).map(s => String(s).trim()).filter(Boolean);
  if (strip(w.join('')) !== strip(text)) w = J.chunkText ? J.chunkText(text).map(s => String(s).trim()).filter(Boolean) : [text.trim()];
  if (!w.length) w = [text.trim() || '…'];
  while (w.length > maxU) {                             // merge the shortest neighbouring pair
    let bi = 0, bv = 1e9;
    for (let i = 0; i < w.length - 1; i++) { const v = gcount(w[i]) + gcount(w[i + 1]); if (v < bv) { bv = v; bi = i; } }
    w.splice(bi, 2, w[bi] + (lat ? ' ' : '') + w[bi + 1]);
  }
  for (let g = 0; g < 8 && w.length < minU; g++) {      // split the longest splittable unit
    let bi = -1, bv = 1;
    w.forEach((s, i) => { const n = gcount(s), ok = /\s/.test(s) || (!hasLatin(s) && n >= 2); if (ok && n > bv) { bv = n; bi = i; } });
    if (bi < 0) break;
    const parts = splitUnit(w[bi]);
    if (parts.length < 2 || !parts[0] || !parts[1]) break;
    w.splice(bi, 1, parts[0], parts[1]);
  }
  if (unitCache.size > 400) unitCache.clear();
  unitCache.set(key, w);
  return w;
}

/* ---- word clock: onset time of each unit inside the cut (locked to beats when they fall close) ---- */
const clockCache = new WeakMap();
function onsets(env, n, o = {}) {
  const c = env.cut;
  let m = clockCache.get(c);
  if (!m) { m = new Map(); clockCache.set(c, m); }
  const frac = o.frac || 0.5, gap = o.gap || 0.38, t0 = o.t0 || 0;
  const key = n + ':' + frac + ':' + gap + ':' + t0;
  let v = m.get(key);
  if (v) return v;
  const dur = c.dur, last = Math.max(0, Math.min(dur * frac, (n - 1) * gap));
  v = [];
  for (let i = 0; i < n; i++) v.push(t0 + (n > 1 ? last * i / (n - 1) : 0));
  const beats = (env.plan && env.plan.beats) || [];
  if (beats.length && n > 1) {
    const pick = []; let prev = t0;
    for (const b of beats) {
      const r = b - c.start;
      if (r <= t0 + 0.12) continue;
      if (r > dur * 0.72) break;
      if (r - prev >= 0.2) { pick.push(r); prev = r; }
      if (pick.length >= n - 1) break;
    }
    if (pick.length >= n - 1 && pick[n - 2] <= Math.max(last * 1.35, dur * 0.55)) v = [t0].concat(pick);
  }
  m.set(key, v);
  return v;
}
// index of the latest unit whose onset has passed (-1 before the first)
const curIdx = (ts, t) => { let k = -1; for (let i = 0; i < ts.length; i++) if (t >= ts[i]) k = i; return k; };

/* ---- flow units into balanced lines that fit a box; positions are unit centres relative to the box centre ---- */
function partitions(n, L) {
  const out = [];
  const rec = (start, left, acc) => {
    if (left === 1) { out.push(acc.concat([[start, n]])); return; }
    for (let e = start + 1; e <= n - left + 1; e++) rec(e, left - 1, acc.concat([[start, e]]));
  };
  if (L >= 1 && L <= n) rec(0, L, []);
  return out;
}
function flowUnits(units, font, maxW, maxH, o = {}) {
  const lat = units.some(hasLatin), sp = o.sp != null ? o.sp : (lat ? 0.32 : 0.08), lead = o.lead || 1.22, track = o.track || 0;
  const ws = units.map(t => em(t, font, { track }));
  const n = units.length;
  let best = null;
  for (let L = 1; L <= Math.min(n, o.maxLines || 4); L++) {
    let bp = null, bw = 1e9;
    for (const pt of partitions(n, L).slice(0, 80)) {
      const lw = pt.map(([a, b]) => { let w = 0; for (let i = a; i < b; i++) w += ws[i] + (i > a ? sp : 0); return w; });
      const mw = Math.max(...lw);
      if (mw < bw) { bw = mw; bp = { pt, lw }; }
    }
    if (!bp) continue;
    const size = Math.min(maxW / bw, maxH / (L * lead - (lead - 1)), o.maxSize || 1e9);
    if (!best || size > best.size * (o.lineBonus || 1.1)) best = { size, L, pt: bp.pt, lw: bp.lw };
  }
  const size = best.size, pos = new Array(n);
  best.pt.forEach(([a, b], li) => {
    const y = (li - (best.L - 1) / 2) * lead * size;
    let x = -best.lw[li] * size / 2;
    for (let i = a; i < b; i++) { const w = ws[i] * size; pos[i] = { x: x + w / 2, y, w, li }; x += w + sp * size; }
  });
  return { size, pos, L: best.L, w: Math.max(...best.lw) * size, h: (best.L * lead - (lead - 1)) * size, ws };
}

/* ---------------------------------------------------------------- layouts */

/* ================================================================== 1 knSlamStack — 積み上げ */
reg('knSlamStack', {
  name: '積み上げ', tags: ['pop', 'graphic'], w: 1.1, ae: 'justified', fits: n => n >= 2 && n <= 18,
  enterBias: { cut: 3, blur: 0.7, pop: 0.8, slice: 0.3, wipe: 0.4 },
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display'])), align: rng.pick(['center', 'center', 'left', 'right']), from: rng.pick(['scale', 'scale', 'drop', 'side']),
      acc: rng.int(0, 5), tilt: rng.chance(0.35) ? rng.range(2, 4) * rng.pick([1, -1]) : 0, rule: rng.chance(0.55) };
  },
  render(env) {
    const { W, H, sc } = env, c = env.cut, Pm = c.params, lt = env.lt, u = U(env);
    const units = unitsOf(c, isPort(env) ? 6 : 5, 2), n = units.length;
    const ts = onsets(env, n, { frac: 0.42, gap: 0.32 });
    const ms = units.map(t => em(t, Pm.font, { track: 0.02 }));
    const maxW = W * (Pm.tilt ? 0.8 : 0.86), Hb = H * (isPort(env) ? 0.66 : 0.8), cap = Math.min(H * 0.34, W * 0.44), gap = 0.08;
    const lay = k => {
      let w = maxW, sizes = [];
      for (let q = 0; q < 5; q++) {
        sizes = ms.slice(0, k).map(m => Math.min(w / m, cap));
        const lo = Math.min(...sizes) * 2.2;                // keep the size contrast readable
        sizes = sizes.map(s => Math.min(s, lo));
        const S = sizes.reduce((a, b) => a + b, 0) + gap * sizes[0] * (k - 1);
        if (S <= Hb) break;
        w *= Hb / S;
      }
      const g = gap * sizes[0], tot = sizes.reduce((a, b) => a + b, 0) + g * (k - 1);
      let y = -tot / 2; const ys = [];
      sizes.forEach(s => { ys.push(y + s / 2); y += s + g; });
      const sw = Math.max(...sizes.map((s, i) => s * ms[i]));
      return { sizes, ys, sw };
    };
    const k = curIdx(ts, lt) + 1;
    if (k <= 0) return null;
    const A = lay(k), B = k > 1 ? lay(k - 1) : A;
    const e = E.outExpo(clamp((lt - ts[k - 1]) / 0.34));
    const sw = lerp(B.sw, A.sw, e), cx = W / 2, cy = H / 2;
    const al = Pm.align, out = tout(env);
    let bb = null;
    for (let i = 0; i < k; i++) {
      const fresh = i === k - 1;
      let size = fresh ? A.sizes[i] : lerp(B.sizes[i], A.sizes[i], e);
      let y = fresh ? A.ys[i] : lerp(B.ys[i], A.ys[i], e);
      let x = al === 'left' ? -sw / 2 : al === 'right' ? sw / 2 : 0, rot = 0, alpha = 1;
      const q = (lt - ts[i]) / 0.24;
      if (q < 1) {
        const f = 1 - E.outExpo(clamp(q));
        if (Pm.from === 'scale') { size *= 1 + 1.6 * f; alpha = clamp(q * 5); rot = f * 8 * (i % 2 ? 1 : -1); }
        else if (Pm.from === 'drop') { y -= H * 0.7 * Math.pow(1 - clamp(q), 2); }
        else { x += (i % 2 ? 1 : -1) * W * 0.9 * f; }
      }
      // impact: the rest of the stack takes a knock when a new line lands
      const land = lt - ts[k - 1] - 0.12;
      if (!fresh && k > 1 && land > 0) y += A.sizes[k - 1] * 0.07 * sprg(land, 9, 26) * (land < 0.6 ? 1 : 0);
      let px = cx + x, py = cy + y;
      if (Pm.tilt) { const r = rotV(x, y, Pm.tilt); px = cx + r[0]; py = cy + r[1]; rot += Pm.tilt; }
      const it = { text: units[i], font: Pm.font, size, x: px, y: py, align: al === 'left' ? 'left' : al === 'right' ? 'right' : 'center', track: 0.02,
        rot, alpha, color: n > 1 && i === Pm.acc % n ? accOn(sc) : sc.fg, mi: miAt(env, ts[i]) };
      const r = J.mainDraw(env, it);
      bb = UB(bb, r);
      if (Pm.rule && r && !Pm.tilt && i < k - 1) {
        const lw = Math.max(1.5, u * 0.003), gy = py + size * 0.5 + (A.sizes[0] * gap) * 0.5;
        const w0 = al === 'left' ? cx - sw / 2 : al === 'right' ? cx + sw / 2 - sw : cx - sw / 2;
        const re = E.outExpo(clamp((lt - ts[i + 1] - 0.05) / 0.35)) * out;
        if (re > 0) env.line([[w0, gy], [w0 + sw * re, gy]], sc.sub, lw, 0.8, false);
      }
    }
    return bb;
  },
}, P);

/* ================================================================== 2 knQuarterTurn — 直角ターン */
reg('knQuarterTurn', {
  name: '直角ターン', tags: ['pop', 'graphic', 'editorial'], w: 0.9, ae: 'sideways', portrait: 0.9, fits: n => n >= 2 && n <= 16,
  enterBias: { cut: 3, pop: 0.8, blur: 0.8, slice: 0.2, wipe: 0.3 },
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display', 'serif'])), sgn: rng.pick([1, -1]), end: 'all', acc: rng.int(0, 3), joint: rng.chance(0.6) };
  },
  render(env) {
    const { W, H, sc } = env, c = env.cut, Pm = c.params, lt = env.lt, u = U(env);
    const units = unitsOf(c, 4, 2), n = units.length;
    const ts = onsets(env, n, { frac: 0.46, gap: 0.5 });
    // chain in em units: word i runs along direction a_i, turning 90° at each joint (staircase: turns alternate)
    const L = units.map(t => em(t, Pm.font, { track: 0.03 }));
    const lastAdv = units.map(t => { const ch = [...t.trim()].pop() || '字'; return J.metrics.adv(Pm.font, ch); });
    const ch = [];
    let sx0 = 0, sy0 = 0, a = 0;
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        const pd = rotV(1, 0, a), na = a + 90 * Pm.sgn * (i % 2 ? 1 : -1), nd = rotV(1, 0, na);
        const pe = ch[i - 1];
        sx0 = pe.ex - pd[0] * lastAdv[i - 1] * 0.5 + nd[0] * 0.62; sy0 = pe.ey - pd[1] * lastAdv[i - 1] * 0.5 + nd[1] * 0.62;
        a = na;
      }
      const d = rotV(1, 0, a);
      ch.push({ a, cx: sx0 + d[0] * L[i] / 2, cy: sy0 + d[1] * L[i] / 2, ex: sx0 + d[0] * L[i], ey: sy0 + d[1] * L[i] });
    }
    // camera per word: rotate so that the word reads level, centre it, zoom to fit
    const zW = i => Math.min(W * 0.76 / L[i], H * 0.3, W * 0.42);
    const cams = ch.map((g, i) => ({ r: -g.a, x: g.cx, y: g.cy, z: zW(i) }));
    // overview: everything at once, first word level
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    ch.forEach((g, i) => { const hw = L[i] / 2, hh = 0.55, v = Math.abs(g.a % 180) > 45; const w2 = v ? hh : hw, h2 = v ? hw : hh; x0 = Math.min(x0, g.cx - w2); x1 = Math.max(x1, g.cx + w2); y0 = Math.min(y0, g.cy - h2); y1 = Math.max(y1, g.cy + h2); });
    const ov = { r: 0, x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: Math.min(W * 0.84 / (x1 - x0), H * 0.78 / (y1 - y0), H * 0.3) };
    const k = curIdx(ts, lt);
    if (k < 0) return null;
    const tOv = Math.min(ts[n - 1] + 0.62, Math.max(ts[n - 1] + 0.3, c.dur - c.outDur - 0.55)), useOv = Pm.end !== 'last';
    let A = cams[Math.max(0, k - 1)], B = cams[k], e = k > 0 ? E.inOutCubic(clamp((lt - ts[k]) / 0.36)) : 1;
    if (useOv && lt >= tOv) { A = cams[n - 1]; B = ov; e = E.inOutCubic(clamp((lt - tOv) / 0.5)); }
    const dip = 1 - 0.22 * bellK(e) * (A === B ? 0 : 1);
    const cam = { r: lerp(A.r, B.r, e), x: lerp(A.x, B.x, e), y: lerp(A.y, B.y, e), z: Math.exp(lerp(Math.log(A.z), Math.log(B.z), e)) * dip };
    let bb = null;
    const out = tout(env);
    for (let i = 0; i <= k; i++) {
      const g = ch[i];
      const [dx, dy] = rotV(g.cx - cam.x, g.cy - cam.y, cam.r);
      const q = clamp((lt - ts[i]) / 0.22), pop = i === 0 ? 1 : lerp(0.3, 1, E.outBack(q, 2.2));
      const it = { text: units[i], font: Pm.font, size: cam.z * pop, x: W / 2 + dx * cam.z, y: H / 2 + dy * cam.z, rot: g.a + cam.r, track: 0.03,
        color: i === Pm.acc % n ? accOn(sc) : sc.fg, mi: miAt(env, ts[i]), alpha: i === 0 ? 1 : clamp(q * 4) };
      bb = UB(bb, J.mainDraw(env, it));
      // joint marks: a small accent square where the line turns
      if (Pm.joint && i > 0) {
        const pg = ch[i - 1], pd = rotV(1, 0, pg.a);
        const jx = pg.ex + pd[0] * 0.35, jy = pg.ey + pd[1] * 0.35;
        const [ex, ey] = rotV(jx - cam.x, jy - cam.y, cam.r);
        const s = cam.z * 0.16 * E.outBack(clamp(q * 1.3), 2) * out;
        if (s > 0.5) { const ctx = env.ctx; ctx.save(); ctx.translate(W / 2 + ex * cam.z, H / 2 + ey * cam.z); ctx.rotate((cam.r + 45) * DEG); env.rect(-s / 2, -s / 2, s, s, sc.accent, 1, false); ctx.restore(); }
      }
    }
    if (bb && u) return bb;
    return box(W * 0.3, H * 0.4, W * 0.7, H * 0.6);
  },
}, P);

/* ================================================================== 3 knSwapCenter — 入れ替わり */
reg('knSwapCenter', {
  name: '入れ替わり', tags: ['pop', 'graphic', 'glitch'], w: 1, ae: 'slotMachine', fits: n => n >= 2 && n <= 18,
  enterBias: { cut: 3, pop: 0.7, blur: 0.8, slice: 0.3, wipe: 0.3 },
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display'])), fontL: rng.pick(fontsOf(st, ['display', 'serif'])), mode: rng.pick(['roll', 'punch', 'slide', 'roll']), ticks: rng.chance(0.7), acc: rng.chance(0.5) };
  },
  render(env) {
    const { W, H, sc } = env, c = env.cut, Pm = c.params, lt = env.lt, u = U(env), port = isPort(env);
    const units = unitsOf(c, 6, 2), n = units.length;
    const ts = onsets(env, n, { frac: 0.4, gap: 0.36 });
    const big = units.map(t => Math.min(J.fitSize(t, Pm.font, W * 0.8, H * 0.4, { track: 0.02 }), H * 0.34, W * 0.6));
    const F = flowUnits(units, Pm.fontL, W * 0.84, H * (port ? 0.46 : 0.34), { maxSize: H * (port ? 0.13 : 0.2), track: 0.03 });
    let tR = ts[n - 1] + 0.5;
    const lim = c.dur - c.outDur - 0.4;
    if (tR > lim) tR = Math.max(ts[n - 1] + 0.18, lim);
    const k = curIdx(ts, lt);
    if (k < 0) return null;
    const cx = W / 2, cy = H / 2, out = tout(env);
    let bb = null;
    const accC = accOn(sc);
    if (lt < tR) {
      const e = k > 0 ? E.outExpo(clamp((lt - ts[k]) / 0.26)) : 1;
      const draw = (i, q, old) => {
        const s0 = big[i]; let x = cx, y = cy, size = s0, sy = 1, alpha = 1;
        if (Pm.mode === 'roll') { const d = s0 * 1.05 * (old ? -q : (1 - q)); y += d; sy = old ? 1 - q : q; }
        else if (Pm.mode === 'punch') { size = s0 * (old ? lerp(1, 0.45, q) : lerp(1.9, 1, q)); alpha = old ? 1 - q : clamp(q * 3); }
        else { x += (old ? -q : 1 - E.outBack(q, 1.3)) * W * 0.7; alpha = old ? 1 - q * q : 1; }
        if (sy < 0.02 || alpha < 0.01) return;
        const it = { text: units[i], font: Pm.font, size, x, y, sy, track: 0.02, alpha, color: Pm.acc && i % 2 ? accC : sc.fg, mi: miAt(env, ts[i]), noHold: old };
        bb = UB(bb, J.mainDraw(env, it));
      };
      if (k > 0 && e < 1) draw(k - 1, e, true);
      draw(k, e, false);
      if (Pm.ticks && n > 1) {
        const tw = u * 0.035, th = Math.max(3, u * 0.006), gx = tw * 1.5, y = Math.min(H * 0.9, cy + big[k] * 0.5 + u * 0.08);
        for (let i = 0; i < n; i++) {
          const x = cx + (i - (n - 1) / 2) * gx - tw / 2, on = i <= k;
          env.rect(x, y, tw, th, on ? accC : sc.sub, (on ? 1 : 0.4) * out * clamp(lt / 0.2), false);
        }
      }
      return bb;
    }
    // resolve: every word flies to its place in the full line
    for (let i = 0; i < n; i++) {
      const last = i === n - 1, q = E.outExpo(clamp((lt - tR - (last ? 0 : 0.05 + i * 0.035)) / 0.42));
      const p = F.pos[i], size = last ? lerp(big[i], F.size, q) : F.size * lerp(0.3, 1, q);
      const it = { text: units[i], font: last ? (q > 0.5 ? Pm.fontL : Pm.font) : Pm.fontL, size, x: lerp(cx, cx + p.x, q), y: lerp(cy, cy + p.y, q), track: last ? lerp(0.02, 0.03, q) : 0.03,
        alpha: last ? 1 : clamp(q * 2.5), color: Pm.acc && i % 2 ? accC : sc.fg, mi: last ? miAt(env, ts[i]) : miAt(env, tR) };
      bb = UB(bb, J.mainDraw(env, it));
    }
    return bb;
  },
}, P);

/* ================================================================== 4 knZoomDive — 文字へ潜る */
reg('knZoomDive', {
  name: '文字へ潜る', tags: ['pop', 'emotional', 'graphic'], w: 0.9, ae: 'zoomRepeat', fits: n => n >= 2 && n <= 16,
  enterBias: { cut: 3, blur: 0.8, pop: 0.5, slice: 0.2, wipe: 0.2 },
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display', 'serif'])), cap: rng.chance(0.75), acc: rng.chance(0.5) };
  },
  render(env) {
    const { W, H, sc } = env, c = env.cut, Pm = c.params, lt = env.lt, u = U(env);
    const units = unitsOf(c, 5, 2), n = units.length;
    const ts = onsets(env, n, { frac: 0.5, gap: 0.55 });
    const k = curIdx(ts, lt);
    if (k < 0) return null;
    const size = i => Math.min(J.fitSize(units[i], Pm.font, W * 0.78, H * 0.4, { track: 0.02 }), H * 0.34, W * 0.6);
    // focus glyph: the first kanji (else the middle glyph), as an offset from the word centre in em
    const focus = i => {
      const lay = J.layoutText({ text: units[i], font: Pm.font, size: 1, track: 0.02 });
      const gs = lay.filter(g => g.ch.trim());
      const g = gs.find(q => J.isKanji(q.ch)) || gs[Math.floor(gs.length / 2)] || { x: 0, y: 0 };
      return [g.x, g.y];
    };
    const cx = W / 2, cy = H / 2, accC = accOn(sc);
    let bb = null;
    const T = 0.42;
    // the previous word blows up around its focus glyph: the camera dives through the letter
    if (k > 0) {
      const e = clamp((lt - ts[k]) / T);
      if (e < 1) {
        const i = k - 1, s0 = size(i), [fx, fy] = focus(i);
        const px = lerp(cx + fx * s0, cx, E.inOutCubic(e)), py = lerp(cy + fy * s0, cy, E.inOutCubic(e));
        const s = Math.exp(Math.pow(e, 1.6) * Math.log(36));
        const it = { text: units[i], font: Pm.font, size: s0 * s, x: px - fx * s0 * s, y: py - fy * s0 * s, track: 0.02, alpha: 1 - J.smooth(0.55, 1, e), color: Pm.acc && i % 2 ? accC : sc.fg, mi: miAt(env, ts[i]), noHold: true };
        J.mainDraw(env, it);
      }
    }
    const s1 = size(k), q = k > 0 ? E.outExpo(clamp((lt - ts[k] - T * 0.35) / 0.45)) : 1;
    if (q > 0.001) {
      const it = { text: units[k], font: Pm.font, size: s1 * lerp(0.03, 1, q), x: cx, y: cy, track: 0.02, alpha: clamp(q * 3), color: Pm.acc && k % 2 ? accC : sc.fg, mi: miAt(env, ts[k]) };
      bb = J.mainDraw(env, it);
    }
    // the whole line as a caption once the last word has settled
    if (Pm.cap && n > 1 && k === n - 1 && bb) {
      const a = E.outCubic(clamp((lt - ts[k] - 0.55) / 0.35)) * tout(env);
      if (a > 0.01) {
        const t = flat(c.text), fs = Math.min(J.clamp(u * 0.034, 14, 40), J.fitSize(t, bodyF(env), W * 0.8, H * 0.1, { track: 0.18 }));
        env.draw({ text: t, font: bodyF(env), size: fs, track: 0.18, x: cx, y: Math.min(H * 0.92, bb.y1 + fs * 1.6), color: sc.sub, alpha: a, ghost: false });
        const lw = Math.max(1, u * 0.002), w = J.measure({ text: t, font: bodyF(env), size: fs, track: 0.18 }).w * a;
        env.line([[cx - w / 2, Math.min(H * 0.92, bb.y1 + fs * 1.6) - fs * 1.1], [cx + w / 2, Math.min(H * 0.92, bb.y1 + fs * 1.6) - fs * 1.1]], sc.sub, lw, 0.6, false);
      }
    }
    return bb || box(W * 0.3, H * 0.4, W * 0.7, H * 0.6);
  },
}, P);

/* ================================================================== 5 knFlowSnap — 流れて整列 */
reg('knFlowSnap', {
  name: '流れて整列', tags: ['graphic', 'pop', 'editorial'], w: 0.9, ae: 'gridCells', fits: n => n >= 3 && n <= 16,
  enterBias: { cut: 3, blur: 0.6, pop: 0.6, slice: 0.2, wipe: 0.2 },
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display', 'body'])), amp: rng.range(0.1, 0.16), lam: rng.range(0.45, 0.7), grid: rng.pick(['cells', 'cells', 'rules']), acc: rng.int(0, 15) };
  },
  render(env) {
    const { W, H, sc } = env, c = env.cut, Pm = c.params, lt = env.lt, u = U(env), port = isPort(env);
    const lat = hasLatin(c.text), t0 = flat(c.text), chars = [...t0], n = chars.length;
    // final arrangement: a glyph grid (Japanese) or balanced lines (latin)
    let ft, trk;
    if (lat) { ft = J.splitLines(t0, port ? 10 : 18); trk = 0.02; }
    else {
      const m = [...t0].length, c0 = Math.max(2, Math.min(port ? 4 : 6, Math.ceil(Math.sqrt(m * (port ? 0.7 : 1.6))))), cols = Math.ceil(m / Math.ceil(m / c0));
      const rows = []; for (let i = 0; i < m; i += cols) rows.push(chars.slice(i, i + cols).join(''));
      ft = rows.join('\n'); trk = 0.3;
    }
    const lead = lat ? 1.25 : 1.3;
    const fsz = Math.min(J.fitSize(ft, Pm.font, W * 0.8, H * (port ? 0.5 : 0.62), { track: trk, lead }), H * 0.2);
    const lay = J.layoutText({ text: ft, font: Pm.font, size: fsz, track: trk, lead, align: lat ? 'center' : 'left' });
    const mm = { w: lay.W, h: lay.H }, ox = W / 2 - (lat ? 0 : mm.w / 2), oy = H / 2;
    const gl = lay.filter(g => g.ch !== '\n');
    // snap time: about 40% into the cut
    const tS = clamp(c.dur * 0.42, 0.45, 1.5);
    const advs = gl.map((g, i) => J.metrics.adv(Pm.font, g.ch) * 1.08 + (i > 0 && g.li !== gl[i - 1].li ? 0.35 : 0)), totA = advs.reduce((a, b) => a + b, 0);
    const fs = Math.min(H * 0.15, W * 0.95 / Math.max(4, totA)), offs = [];
    advs.reduce((a, b, i) => { offs[i] = (a + b / 2) * fs; return a + b; }, 0);
    // the train rushes in from the right edge, brakes towards the centre, then snaps
    const Xs = W / 2 - totA * fs / 2, X0 = W + fs * 0.8;
    const A = Math.min(H * Pm.amp, W * 0.16), lam = W * Pm.lam * (port ? 1.7 : 1);
    const flowAt = (i, t) => {
      const x = lerp(X0, Xs, E.outCubic(clamp(t / tS))) + (offs[i] || 0), y = cy0(x, t);
      const sl = (cy0(x + 2, t) - cy0(x - 2, t)) / 4;
      return [x, y, Math.atan(sl) / DEG];
    };
    function cy0(x, t) { return H / 2 + A * Math.sin(x / lam * TAU + t * 3.2); }
    const tf = Math.min(lt, tS);
    let bb = null;
    const out = tout(env), accC = accOn(sc);
    gl.forEach((g, i) => {
      if (g.ch === ' ' || g.ch === '　') return;
      const [fx, fy, fr] = flowAt(i, tf);
      const q = E.outExpo(clamp((lt - tS - i * 0.018) / 0.3));
      const x = lerp(fx, ox + g.x, q), y = lerp(fy, oy + g.y, q), rot = fr * (1 - q), size = lerp(fs, fsz * (g.fs || 1), q);
      if (x > W + size && q <= 0) return;
      const it = { text: g.ch, font: Pm.font, size, x, y, rot, color: !lat && i === Pm.acc % n ? accC : sc.fg, mi: i * 0.3 };
      bb = UB(bb, J.mainDraw(env, it));
    });
    // grid lines draw in with the snap
    const ge = E.outExpo(clamp((lt - tS - 0.08) / 0.5)) * out;
    if (ge > 0.01) {
      const lw = Math.max(1, u * 0.0016);
      if (!lat && Pm.grid === 'cells') {
        const cell = fsz * (1 + trk), rows = ft.split('\n').length, cols = Math.max(...ft.split('\n').map(r => [...r].length));
        const gx0 = ox - fsz * trk / 2, gy0 = oy - mm.h / 2 - (cell - fsz) / 2 - (fsz * lead - cell) / 2;
        const rh = fsz * lead;
        for (let r = 0; r <= rows; r++) { const y = gy0 + r * rh; env.line([[gx0, y], [gx0 + cols * cell * ge, y]], sc.sub, lw, 0.55, false); }
        for (let q2 = 0; q2 <= cols; q2++) { const x = gx0 + q2 * cell; env.line([[x, gy0], [x, gy0 + rows * rh * ge]], sc.sub, lw, 0.55, false); }
      } else {
        const lines = ft.split('\n'), rh = fsz * lead;
        lines.forEach((ln, li) => {
          const w = J.measure({ text: ln, font: Pm.font, size: fsz, track: trk }).w, y = oy + (li - (lines.length - 1) / 2) * rh + fsz * 0.62;
          const x0 = lat ? W / 2 - w / 2 : ox;
          env.line([[x0, y], [x0 + w * ge, y]], sc.sub, lw * 1.5, 0.7, false);
        });
      }
    }
    // the path the line flowed along, fading after the snap
    const pa = (1 - clamp((lt - tS) / 0.25)) * clamp(lt / 0.15) * 0.35;
    if (pa > 0.01) {
      const pts = []; for (let x = -20; x <= W + 20; x += W / 48) pts.push([x, cy0(x, tf)]);
      env.line(pts, sc.sub, Math.max(1, u * 0.0015), pa, false);
    }
    return bb;
  },
}, P);

/* ================================================================== 6 knSeesaw — シーソー */
reg('knSeesaw', {
  name: 'シーソー', tags: ['pop', 'graphic'], w: 0.8, ae: 'bounceLine', portrait: 0.4, fits: n => n >= 2 && n <= 14,
  enterBias: { cut: 3, pop: 0.6, blur: 0.5, slice: 0.2, wipe: 0.2 },
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display'])), order: rng.pick(['lr', 'lr', 'out']), acc: rng.chance(0.5), fulc: rng.pick(['tri', 'tri', 'round']) };
  },
  render(env) {
    const { W, H, sc, ctx } = env, c = env.cut, Pm = c.params, lt = env.lt, u = U(env), port = isPort(env);
    const units = unitsOf(c, 6, 2), n = units.length;
    const F = flowUnits(units, Pm.font, W * 0.78, H * 0.2, { maxLines: 1, maxSize: H * 0.17, track: 0.03, sp: hasLatin(c.text) ? 0.4 : 0.22 });
    const size = F.size, th = Math.max(4, size * 0.1), half = F.w / 2 + size * 0.6;
    const px = W / 2, py = H * (port ? 0.55 : 0.6);
    // landing order: left to right, or from the middle outwards
    const ord = units.map((_, i) => i);
    if (Pm.order === 'out') ord.sort((a, b) => Math.abs(F.pos[a].x) - Math.abs(F.pos[b].x));
    const ts0 = onsets(env, n, { frac: 0.45, gap: 0.4 }), fall = 0.24;
    const tl = new Array(n); ord.forEach((i, r) => { tl[i] = ts0[r] + fall; });
    const mass = units.map(t => gcount(t));
    const M = mass.reduce((a, b) => a + b, 0);
    // plank angle: each landing pulls it towards the torque of what has landed; balanced when all are on
    const targ = [0];
    let tq = 0;
    ord.forEach((i, r) => { tq += mass[i] * F.pos[i].x; targ.push(r === n - 1 ? 0 : clamp(tq / (M * half) * 30, -11, 11)); });
    let th0 = 0;
    for (let r = 0; r < n; r++) {
      const t0 = ts0[r] + fall; if (lt < t0) break;
      th0 = targ[r + 1] + (targ[r] - targ[r + 1]) * sprg(lt - t0, 3.6, 10);
    }
    const ang = th0;
    const e = E.outExpo(clamp(lt / 0.35)), out = tout(env);
    const plateC = sc.sub, accC = accOn(sc);
    // fulcrum + plank
    const fh = size * 0.62;
    if (Pm.fulc === 'tri') env.poly([[px, py + th / 2], [px - fh * 0.62 * e, py + th / 2 + fh * e], [px + fh * 0.62 * e, py + th / 2 + fh * e]], accC, out, false);
    else env.circle(px, py + th / 2 + fh * 0.45, fh * 0.45 * e, accC, null, 0, out, false);
    ctx.save(); ctx.translate(px, py); ctx.rotate(ang * DEG);
    env.rect(-half * e, -th / 2, half * 2 * e, th, plateC, 0.9 * out, false);
    ctx.restore();
    let bb = null;
    const cr = Math.cos(ang * DEG), sr = Math.sin(ang * DEG);
    for (let i = 0; i < n; i++) {
      const t0 = tl[i] - fall;
      if (lt < t0) continue;
      const p = F.pos[i], v = -th / 2 - size * 0.54;
      let x = px + p.x * cr - v * sr, y = py + p.x * sr + v * cr, rot = ang, sy = 1, sx = 1;
      const d = lt - tl[i];
      if (d < 0) { const k = -d / fall; y -= H * 0.55 * k * k; rot = ang * (1 - k); }
      else { const q = Math.exp(-d * 11) * 0.22; sy = 1 - q; sx = 1 + q * 0.6; x += sr * size * q * 0.5; y += cr * size * q * 0.5; }
      const it = { text: units[i], font: Pm.font, size, x, y, rot, sx, sy, track: 0.03, color: Pm.acc && mass[i] === Math.max(...mass) ? accC : sc.fg, mi: miAt(env, t0) };
      bb = UB(bb, J.mainDraw(env, it));
    }
    return bb;
  },
}, P);

/* ================================================================== 7 knTypeSlam — タイプ→スラム */
reg('knTypeSlam', {
  name: 'タイプ→スラム', tags: ['pop', 'graphic', 'editorial'], w: 1, ae: 'type', fits: n => n >= 2 && n <= 24,
  enterBias: { cut: 3, blur: 0.5, pop: 0.5, slice: 0.2, wipe: 0.3 },
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display'])), key: rng.pick(['long', 'long', 'last']), side: rng.pick(['below', 'below', 'above']), burst: rng.chance(0.7) };
  },
  render(env) {
    const { W, H, sc, ctx } = env, c = env.cut, Pm = c.params, lt = env.lt, u = U(env), port = isPort(env);
    const t0 = flat(c.text);
    const units = unitsOf(c, 6, 1);
    let ki = units.length - 1;
    if (Pm.key === 'long') { let bv = -1; units.forEach((t, i) => { const v = gcount(t) + (/[一-鿿]/.test(t) ? 0.5 : 0); if (v > bv) { bv = v; ki = i; } }); }
    const key = units[ki];
    const tf = monoF(env);
    const ts = Math.min(J.fitSize(t0, tf, W * 0.86, H * 0.08, { track: 0.06 }), u * 0.065);
    const tm = J.measure({ text: t0, font: tf, size: ts, track: 0.06 });
    const ks = Math.min(J.fitSize(key, Pm.font, W * 0.84, H * (port ? 0.3 : 0.44), { track: 0.01 }), H * 0.34, W * 0.5);
    const above = Pm.side === 'above';
    const ky = H / 2 + (above ? ts * 1.2 : -ts * 1.2), ty = above ? ky - ks * 0.62 - ts * 1.5 : ky + ks * 0.62 + ts * 1.5;
    const nG = [...t0].length;
    const tType = clamp(nG * 0.045, 0.25, Math.min(1.1, c.dur * 0.4)), tS = tType + 0.14;
    const x0 = W / 2 - tm.w / 2;
    // typed line: revealed glyph by glyph (clip), cursor riding at the end
    const k = Math.floor(clamp(lt / tType) * nG + 1e-6);
    const pre = [...t0].slice(0, k).join('');
    const wk = k >= nG ? tm.w + ts : J.measure({ text: pre, font: tf, size: ts, track: 0.06 }).w + (k > 0 ? ts * 0.06 : 0);
    const imp = lt - tS - 0.1;
    const shake = imp > 0 ? Math.exp(-imp * 10) * ts * 0.35 : 0;
    const itT = { text: t0, font: tf, size: ts, x: x0 + J.rs(c.seed, env.step, 3) * shake, y: ty + J.rs(c.seed, env.step, 4) * shake, align: 'left', track: 0.06, color: sc.fg, mi: 0 };
    if (k < nG) itT.clip = [x0 - ts, x0 + wk];
    let bb = J.mainDraw(env, itT);
    const out = tout(env), accC = accOn(sc);
    if (k < nG || env.step % 2 === 0) { if (lt < tS + 0.6) env.rect(x0 + wk + ts * 0.1, ty - ts * 0.5, ts * 0.55, ts, accC, out, false); }
    // key word slams in
    if (lt >= tS) {
      const q = clamp((lt - tS) / 0.16), f = 1 - E.inQuad(q);
      const land = lt - tS - 0.16;
      const sq = land > 0 ? Math.exp(-land * 12) * 0.12 : 0;
      const it = { text: key, font: Pm.font, size: ks * (1 + 2.4 * f), x: W / 2, y: ky, sx: 1 + sq * 0.5, sy: 1 - sq, track: 0.01, alpha: clamp(q * 4), color: sc.fg, mi: miAt(env, tS) };
      bb = UB(bb, J.mainDraw(env, it));
      if (Pm.burst && land > 0 && land < 0.5) {
        const a = 1 - land / 0.5, R0 = ks * 0.9, lw = Math.max(2, u * 0.004);
        const mK = J.measure({ text: key, font: Pm.font, size: ks, track: 0.01 });
        for (let j = 0; j < 10; j++) {
          const an = (j / 10) * TAU + J.r(c.seed, j, 5) * 0.4, r0 = Math.max(mK.w, mK.h) * 0.55 + R0 * 0.15 + land * u * 0.25, r1 = r0 + u * 0.05 * a;
          const sx = 1, syy = mK.h / Math.max(mK.w, mK.h) + 0.35;
          env.line([[W / 2 + Math.cos(an) * r0 * sx, ky + Math.sin(an) * r0 * syy], [W / 2 + Math.cos(an) * r1 * sx, ky + Math.sin(an) * r1 * syy]], accC, lw, a * out, false);
        }
      }
      // mark the key word inside the typed line
      const idx = t0.indexOf(key.trim());
      if (idx >= 0 && land > 0) {
        const a0 = J.measure({ text: t0.slice(0, idx) || ' ', font: tf, size: ts, track: 0.06 }).w * (idx ? 1 : 0) + (idx ? ts * 0.06 : 0);
        const kw = J.measure({ text: key.trim(), font: tf, size: ts, track: 0.06 }).w;
        const e2 = E.outExpo(clamp(land / 0.3)) * out;
        env.rect(x0 + a0, ty + ts * 0.62, kw * e2, Math.max(2, ts * 0.12), accC, 1, false);
      }
    }
    return bb;
  },
}, P);

/* ================================================================== 8 knRhythmCuts — 語のカット割り */
const SHOTS = ['huge', 'vert', 'small', 'crop', 'band', 'tilt'];
reg('knRhythmCuts', {
  name: '語のカット割り', tags: ['pop', 'graphic', 'glitch'], w: 0.9, ae: 'panels', fits: n => n >= 2 && n <= 18,
  enterBias: { cut: 3.5, pop: 0.4, blur: 0.4, slice: 0.2, wipe: 0.2 },
  plan(rng, cut, st) {
    const sh = SHOTS.slice(); for (let i = sh.length - 1; i > 0; i--) { const j = rng.int(0, i); const t = sh[i]; sh[i] = sh[j]; sh[j] = t; }
    return { font: rng.pick(fontsOf(st, ['display'])), fontB: rng.pick(fontsOf(st, ['display', 'serif'])), shots: sh, side: rng.pick([1, -1]), fin: rng.pick(['center', 'center', 'left']) };
  },
  render(env) {
    const { W, H, sc, ctx } = env, c = env.cut, Pm = c.params, lt = env.lt, u = U(env), port = isPort(env);
    const units = unitsOf(c, 5, 2), n = units.length;
    const ts = onsets(env, n, { frac: 0.5, gap: 0.46 });
    let tF = Math.min(ts[n - 1] + 0.55, c.dur - c.outDur - 0.45);
    tF = Math.max(tF, ts[n - 1] + 0.28);
    const k = curIdx(ts, lt);
    if (k < 0) return null;
    const out = tout(env), accC = accOn(sc);
    if (lt < tF) {
      const t = units[k], shot = (Pm.shots || SHOTS)[k % 6], dt = lt - ts[k];
      const punch = 1 + 0.1 * Math.exp(-dt * 14);
      const it = { text: t, font: Pm.font, x: W / 2, y: H / 2, color: sc.fg, track: 0.02, mi: miAt(env, ts[k]) };
      const vtxt = hasLatin(t) ? t : strip(t);
      if (shot === 'huge') it.size = Math.min(J.fitSize(t, Pm.font, W * 0.82, H * 0.6, { track: 0.02 }), H * 0.54);
      else if (shot === 'vert' && !hasLatin(t)) {
        Object.assign(it, { text: vtxt, vertical: true, x: W / 2 + Pm.side * W * (port ? 0.18 : 0.22) });
        it.size = Math.min(J.fitSize(vtxt, Pm.font, W * 0.4, H * 0.8, { vertical: true, track: 0.02 }), W * (port ? 0.34 : 0.26));
      } else if (shot === 'small' || shot === 'vert') {
        it.size = Math.min(J.fitSize(t, Pm.fontB, W * 0.4, H * 0.12, { track: 0.12 }), H * 0.1); it.font = Pm.fontB; it.track = 0.12;
        const m = J.measure(it), pw = m.w / 2 + it.size * 0.8, ph = m.h / 2 + it.size * 0.6, L = it.size * 0.6, lw = Math.max(2, u * 0.003);
        const e = E.outExpo(clamp(dt / 0.2));
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b]) => { const cx = W / 2 + a * pw * (1.3 - 0.3 * e), cy = H / 2 + b * ph * (1.3 - 0.3 * e); env.line([[cx - a * L, cy], [cx, cy], [cx, cy - b * L]], accC, lw, out, false); });
      } else if (shot === 'crop') {
        it.size = Math.min(J.fitSize(t, Pm.font, W * 1.02, H * 0.7, { track: 0.0 }), H * 0.66); it.align = 'left'; it.track = 0;
        const m = J.measure(it); it.x = W * 0.97 - m.w; it.y = H / 2 + H * 0.04;
      } else if (shot === 'band') {
        it.size = Math.min(J.fitSize(t, Pm.font, W * 0.8, H * 0.24, { track: 0.06 }), H * 0.22); it.track = 0.06;
        const bh = it.size * 1.55, e = E.outExpo(clamp(dt / 0.18));
        env.rect(0, H / 2 - bh / 2 * e, W, bh * e, sc.ink, out, false);
        it.color = onCol(sc, sc.ink); it.plain = true;
      } else {
        it.size = Math.min(J.fitSize(t, Pm.font, W * 0.72, H * 0.4, { track: 0.02 }), H * 0.34); it.rot = -8 * Pm.side; it.color = accC;
      }
      it.size *= punch;
      return J.mainDraw(env, it);
    }
    // final shot: the whole line, clean
    const F = flowUnits(units, Pm.fontB, W * 0.84, H * (port ? 0.42 : 0.34), { maxSize: H * 0.16, track: 0.04 });
    const left = Pm.fin === 'left', ox = left ? W * 0.08 + F.w / 2 : W / 2;
    const dt = lt - tF, punch = 1 + 0.06 * Math.exp(-dt * 14);
    let bb = null;
    units.forEach((t, i) => {
      const p = F.pos[i];
      bb = UB(bb, J.mainDraw(env, { text: t, font: Pm.fontB, size: F.size * punch, x: ox + p.x * punch, y: H / 2 + p.y * punch, track: 0.04, color: sc.fg, mi: miAt(env, tF + i * 0.03) }));
    });
    if (bb) {
      const e = E.outExpo(clamp(dt / 0.35)) * out, lw = Math.max(2, u * 0.004);
      env.rect(left ? W * 0.08 : W / 2 - F.w / 2, bb.y1 + F.size * 0.25, F.w * e, lw, accC, 1, false);
    }
    return bb;
  },
}, P);

/* ================================================================== 9 knPathRide — ループ軌道 */
const pathCache = new Map();
function loopPath(W, H, xT, yL, R, side) {
  const key = [W, H, xT | 0, yL | 0, R | 0, side].join(':');
  let P0 = pathCache.get(key);
  if (P0) return P0;
  const pts = [[-W * 0.9, yL], [xT, yL]];
  const N = 72;
  // a full loop tangent to the line at (xT, yL): up and back over the top (side 1) or under it (side -1)
  for (let i = 1; i <= N; i++) { const a = i / N * TAU; pts.push([xT + Math.sin(a) * R, yL - side * (1 - Math.cos(a)) * R]); }
  pts.push([W * 2.2, yL]);
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  P0 = { pts, L, tot: L[L.length - 1], sT: L[1], sL: L[1] + 0 };
  if (pathCache.size > 60) pathCache.clear();
  pathCache.set(key, P0);
  return P0;
}
function pathAt(P0, s) {
  const { pts, L } = P0;
  s = clamp(s, 0, P0.tot - 0.01);
  let lo = 0, hi = L.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L[m] <= s) lo = m; else hi = m; }
  const a = pts[lo], b = pts[hi], k = (s - L[lo]) / Math.max(1e-6, L[hi] - L[lo]);
  return [lerp(a[0], b[0], k), lerp(a[1], b[1], k), Math.atan2(b[1] - a[1], b[0] - a[0]) / DEG];
}
reg('knPathRide', {
  name: 'ループ軌道', tags: ['pop', 'graphic'], w: 0.8, ae: 'wave', portrait: 0.4, fits: n => n >= 2 && n <= 14,
  enterBias: { cut: 3, blur: 0.6, pop: 0.3, slice: 0.2, wipe: 0.2 },
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display'])), side: rng.pick([1, 1, -1]), rail: rng.pick(['dash', 'line', 'dots']), acc: rng.chance(0.5) };
  },
  render(env) {
    const { W, H, sc } = env, c = env.cut, Pm = c.params, lt = env.lt, u = U(env), port = isPort(env);
    const t0 = flat(c.text), chars = [...t0];
    const size = Math.min(J.fitSize(t0, Pm.font, W * (port ? 0.86 : 0.72), H * 0.2, { track: 0.04 }), H * 0.17);
    const adv = chars.map(ch => J.metrics.adv(Pm.font, ch) * size * 1.04), Lt = adv.reduce((a, b) => a + b, 0);
    const offs = []; adv.reduce((a, b, i) => { offs[i] = a + b / 2; return a + b; }, 0);
    const R = clamp(Lt / TAU * 1.15, size * 1.5, Math.min(H * 0.28, W * 0.3)), side = Pm.side;
    const yL = H / 2 + side * R * (port ? 0.5 : 0.6);
    const xT = Math.max(W * 0.06 + R * 0.2, W / 2 - Lt / 2 - size * 0.4);
    const P0 = loopPath(W, H, xT, yL, R, side);
    const sEnd = P0.sT + TAU * R + (W / 2 + Lt / 2 - xT), sStart = P0.sT - (xT + W * 0.05);
    const T = clamp(c.dur * 0.55, 0.7, 1.8);
    const q = clamp(lt / T);
    let sHead = lerp(sStart, sEnd, 1 - Math.pow(1 - q, 2.6));
    sHead += E.inCubic(env.pOut) * W * 1.3;
    const out = tout(env), accC = accOn(sc);
    // the rail
    const ra = E.outCubic(clamp(lt / 0.3)) * out * (1 - 0.6 * J.smooth(T, T + 0.5, lt));
    if (ra > 0.01) {
      const lw = Math.max(1.2, u * 0.0022), pts = P0.pts.filter(p => p[0] > -W * 0.1 && p[0] < W * 1.1);
      if (Pm.rail === 'dots') { for (let i = 0; i < pts.length; i += 3) env.circle(pts[i][0], pts[i][1], lw * 1.3, sc.sub, null, 0, ra * 0.7, false); }
      else {
        const ctx = env.ctx; if (Pm.rail === 'dash') ctx.setLineDash([lw * 5, lw * 4]);
        env.line(pts, sc.sub, lw, ra * 0.85, false); ctx.setLineDash([]);
      }
    }
    let bb = null;
    chars.forEach((ch, i) => {
      if (ch === ' ') return;
      const sg = sHead - (Lt - offs[i]);
      const [x, y, a] = pathAt(P0, sg);
      if (x < -size || x > W + size) return;
      const it = { text: ch, font: Pm.font, size, x, y: y - side * 0, rot: a, color: Pm.acc && i === chars.length - 1 ? accC : sc.fg, mi: i * 0.2 };
      bb = UB(bb, J.mainDraw(env, it));
    });
    return bb || box(W * 0.3, H * 0.4, W * 0.7, H * 0.6);
  },
}, P);

/* ================================================================== 10 knGearWords — 歯車 */
reg('knGearWords', {
  name: '歯車', tags: ['pop', 'graphic'], w: 0.7, ae: 'circleWords', treat: 'safe', fits: n => n >= 2 && n <= 16,
  enterBias: { cut: 3, pop: 0.5, blur: 0.4, slice: 0.1, wipe: 0.1 },
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display'])), dir: rng.pick([1, -1]), fillMode: rng.pick(['alt', 'alt', 'ink', 'ring']) };
  },
  render(env) {
    const { W, H, sc } = env, c = env.cut, Pm = c.params, lt = env.lt, u = U(env), port = isPort(env);
    const units = unitsOf(c, port ? 4 : 5, Math.min(port ? 4 : 5, Math.max(2, Math.ceil(gcount(c.text) / 4)))), n = units.length;
    const ts = onsets(env, n, { frac: 0.45, gap: 0.42 });
    const txt = units.map(t => (!hasLatin(t) && gcount(t) > 3 ? J.splitLines(strip(t), Math.ceil(gcount(t) / 2)) : t));
    const rs0 = txt.map(t => { const m = meas(t, Pm.font, 1, { track: 0.02, lead: 1.05 }); return Math.hypot(m.w, m.h) / 2 * 1.12 + 0.18; });
    const med = rs0.slice().sort((a, b) => a - b)[Math.floor(n / 2)];
    const rs = rs0.map(r => clamp(r, med * 0.75, med * 1.3)), tk = rs0.map((r, i) => Math.min(1, rs[i] / r));
    // gears touch along a row (landscape) or a zigzag column (portrait)
    const gap = 0.1;
    let tot = rs.reduce((a, b) => a + b * 2, 0) + gap * (n - 1);
    const mr = Math.max(...rs);
    const k = port ? Math.min(H * 0.84 / tot, W * 0.62 / (mr * 2)) : Math.min(W * 0.9 / tot, H * 0.6 / (mr * 2), H * 0.22 / 0.7);
    const cs = [];
    let acc = -tot / 2;
    rs.forEach((r, i) => { acc += r; const z = port ? (i % 2 ? 1 : -1) * mr * 0.32 : (i % 2 ? 1 : -1) * mr * 0.12; cs.push(port ? [W / 2 + z * k, H / 2 + acc * k] : [W / 2 + acc * k, H / 2 + z * k]); acc += r + gap; });
    const out = tout(env);
    let bb = null;
    for (let i = 0; i < n; i++) {
      if (lt < ts[i]) continue;
      // every arrival turns the whole train one full turn (neighbours counter-rotate, the new gear rolls in)
      let ang = 0;
      for (let j = i; j < n; j++) { if (lt >= ts[j]) ang += 360 * (1 - E.inOutCubic(clamp((lt - ts[j]) / 0.62))) * (j === i ? 1 : rs[j] / rs[i] * 0.35); }
      ang *= (i % 2 ? -1 : 1) * Pm.dir;
      const pop = E.outBack(clamp((lt - ts[i]) / 0.3), 1.8), r = rs[i] * k * pop * out;
      const [cx, cy] = cs[i];
      const fill = Pm.fillMode === 'ink' ? sc.ink : Pm.fillMode === 'ring' ? null : (i % 2 ? sc.accent : sc.ink);
      const rimC = fill || accOn(sc);
      if (r > 1) {
        const nt = Math.max(10, Math.round(TAU * rs[i] * 6)), th = r * 0.12, pts = [];
        for (let t = 0; t < nt; t++) {
          const a0 = (t / nt * 360 + ang) * DEG, w = TAU / nt;
          pts.push([cx + Math.cos(a0 - w * 0.25) * r, cy + Math.sin(a0 - w * 0.25) * r], [cx + Math.cos(a0 - w * 0.15) * (r + th), cy + Math.sin(a0 - w * 0.15) * (r + th)],
            [cx + Math.cos(a0 + w * 0.15) * (r + th), cy + Math.sin(a0 + w * 0.15) * (r + th)], [cx + Math.cos(a0 + w * 0.25) * r, cy + Math.sin(a0 + w * 0.25) * r]);
        }
        env.poly(pts, rimC, 1, false);
        if (fill) env.circle(cx, cy, r * 0.96, fill, null, 0, 1, false);
        else env.circle(cx, cy, r * 0.93, sc.bg, null, 0, 1, false);
        env.circle(cx, cy, r * 0.86, null, fill ? onCol(sc, fill) : rimC, Math.max(1, r * 0.02), 0.35, false);
      }
      const tc = fill ? onCol(sc, fill) : sc.fg;
      const it = { text: txt[i], font: Pm.font, size: k * pop * tk[i], x: cx, y: cy, rot: ang, lead: 1.05, track: 0.02, color: tc, mi: miAt(env, ts[i]) };
      bb = UB(bb, J.mainDraw(env, it));
    }
    return bb;
  },
}, P);

/* ================================================================== 11 knCollide — 正面衝突 */
reg('knCollide', {
  name: '正面衝突', tags: ['pop', 'graphic', 'glitch'], w: 0.9, ae: 'splitHalves', fits: n => n >= 2 && n <= 16,
  enterBias: { cut: 3.5, pop: 0.3, blur: 0.4, slice: 0.2, wipe: 0.2 },
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display'])), acc: rng.pick(['A', 'B', 'none']), spark: rng.chance(0.8), at: rng.range(0.28, 0.36) };
  },
  render(env) {
    const { W, H, sc } = env, c = env.cut, Pm = c.params, lt = env.lt, u = U(env), port = isPort(env);
    const all = unitsOf(c, 8, 2), lat = hasLatin(c.text);
    // two halves by glyph count
    let best = 1, bd = 1e9, tot = all.reduce((a, t) => a + gcount(t), 0), acc = 0;
    for (let i = 1; i < all.length; i++) { acc += gcount(all[i - 1]); const d = Math.abs(acc - tot / 2); if (d < bd) { bd = d; best = i; } }
    const A = all.slice(0, best).join(lat ? ' ' : ''), B = all.slice(best).join(lat ? ' ' : '');
    const tC = clamp(c.dur * Pm.at * 0.65, 0.25, 0.55), d = lt - tC;
    const accC = accOn(sc), out = tout(env);
    let size, pa, pb, axis;
    if (!port) {
      const g = lat ? 0.35 : 0.14, full = A + (lat ? ' ' : '') + B;
      size = Math.min(J.fitSize(full, Pm.font, W * 0.86, H * 0.3, { track: 0.02 }), H * 0.24);
      const wa = em(A, Pm.font, { track: 0.02 }) * size, wb = em(B, Pm.font, { track: 0.02 }) * size, x0 = W / 2 - (wa + wb + g * size) / 2;
      pa = [x0 + wa / 2, H / 2]; pb = [x0 + wa + g * size + wb / 2, H / 2]; axis = 0;
    } else {
      size = Math.min(J.fitSize(A, Pm.font, W * 0.86, H * 0.2, { track: 0.02 }), J.fitSize(B, Pm.font, W * 0.86, H * 0.2, { track: 0.02 }), W * 0.3);
      pa = [W / 2, H / 2 - size * 0.62]; pb = [W / 2, H / 2 + size * 0.62]; axis = 1;
    }
    // each half starts just outside the frame and accelerates into the other
    const D = axis ? Math.max(pa[1], H - pb[1]) + size * 0.7 : Math.max(pa[0] + em(A, Pm.font, { track: 0.02 }) * size / 2, W - pb[0] + em(B, Pm.font, { track: 0.02 }) * size / 2) + size * 0.2;
    let offA, sqA = 1;
    if (d < 0) { const q = clamp(lt / tC); offA = -D * (1 - Math.pow(q, 1.6)); }
    else { offA = -size * 0.28 * Math.exp(-d * 6) * Math.sin(d * 15); sqA = 1 - 0.22 * Math.exp(-d * 14); }
    const jit = d > 0 ? Math.exp(-d * 9) * size * 0.05 : 0;
    const mk = (t, p, sgn, col) => {
      const o = offA * sgn;
      const it = { text: t, font: Pm.font, size, x: p[0] + (axis ? 0 : o) + J.rs(c.seed, env.step, sgn, 1) * jit, y: p[1] + (axis ? o : 0) + J.rs(c.seed, env.step, sgn, 2) * jit, track: 0.02, color: col, mi: 0 };
      if (axis) it.sy = sqA; else it.sx = sqA;
      return J.mainDraw(env, it);
    };
    let bb = mk(A, pa, 1, Pm.acc === 'A' ? accC : sc.fg);
    bb = UB(bb, mk(B, pb, -1, Pm.acc === 'B' ? accC : sc.fg));
    // speed lines behind both halves while they fly; sparks at the contact point
    const lw = Math.max(1.5, u * 0.0028);
    if (d < 0 && lt > 0.02) {
      const q = clamp(lt / tC), a = 0.7 * q * out;
      for (let j = 0; j < 5; j++) {
        const f = (j - 2) / 2.2 * size * 0.42, len = size * (1.2 + J.r(c.seed, j, 7) * 1.6);
        if (!axis) {
          const xa = pa[0] + offA - em(A, Pm.font) * size / 2 - size * 0.2, xb = pb[0] - offA + em(B, Pm.font) * size / 2 + size * 0.2;
          env.line([[xa - len, pa[1] + f], [xa, pa[1] + f]], sc.sub, lw, a, false); env.line([[xb, pb[1] - f], [xb + len, pb[1] - f]], sc.sub, lw, a, false);
        } else {
          const ya = pa[1] + offA - size * 0.7, yb = pb[1] - offA + size * 0.7;
          env.line([[pa[0] + f * 1.6, ya - len], [pa[0] + f * 1.6, ya]], sc.sub, lw, a, false); env.line([[pb[0] - f * 1.6, yb], [pb[0] - f * 1.6, yb + len]], sc.sub, lw, a, false);
        }
      }
    }
    if (Pm.spark && d > 0 && d < 0.45) {
      const a = (1 - d / 0.45) * out, cx = axis ? W / 2 : (pa[0] + em(A, Pm.font) * size / 2 + pb[0] - em(B, Pm.font) * size / 2) / 2, cy = axis ? H / 2 : H / 2;
      for (let j = 0; j < 12; j++) {
        const an = (j / 12 + J.r(c.seed, j, 9) * 0.05) * TAU, r0 = size * (0.25 + d * 2.2), r1 = r0 + size * 0.5 * a;
        env.line([[cx + Math.cos(an) * r0, cy + Math.sin(an) * r0], [cx + Math.cos(an) * r1, cy + Math.sin(an) * r1]], accC, lw * 1.4, a, false);
      }
    }
    return bb;
  },
}, P);

/* ================================================================== 12 knTumble — 箱転がし */
reg('knTumble', {
  name: '箱転がし', tags: ['pop', 'graphic'], w: 0.8, ae: 'dominoes', fits: n => n >= 2 && n <= 16,
  enterBias: { cut: 3.5, pop: 0.3, blur: 0.4, slice: 0.1, wipe: 0.1 },
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display'])), box: rng.pick(['plate', 'frame', 'none']), acc: rng.int(0, 5), floor: rng.chance(0.7) };
  },
  render(env) {
    const { W, H, sc, ctx } = env, c = env.cut, Pm = c.params, lt = env.lt, u = U(env), port = isPort(env);
    const units = unitsOf(c, 5, 2), n = units.length;
    const F = flowUnits(units, Pm.font, W * 0.82, H * (port ? 0.4 : 0.3), { maxSize: H * 0.2, track: 0.02, sp: hasLatin(c.text) ? 0.5 : 0.3, lead: 1.6 });
    const size = F.size, pad = size * 0.14, h = size + pad * 2;
    const ts = onsets(env, n, { frac: 0.42, gap: 0.36 });
    const T = 0.5, out = tout(env), accC = accOn(sc);
    let bb = null;
    const lw = Math.max(1.5, u * 0.0025);
    for (let i = 0; i < n; i++) {
      const p = F.pos[i], w = p.w + pad * 2, base = H / 2 + p.y + h / 2, xF = W / 2 + p.x - w / 2;
      if (Pm.floor && (i === 0 || F.pos[i - 1].li !== p.li)) {
        const row = F.pos.filter(q => q.li === p.li), x0 = W / 2 + row[0].x - row[0].w / 2 - pad * 3, x1 = W / 2 + row[row.length - 1].x + row[row.length - 1].w / 2 + pad * 3;
        const e = E.outExpo(clamp(lt / 0.4)) * out;
        env.line([[x1 - (x1 - x0) * e, base + lw], [x1, base + lw]], sc.sub, lw, 0.8, false);
      }
      if (lt < ts[i]) continue;
      // rolls in from the right over its bottom-left edge: quarter turns, footprint alternating w / h
      const m = Math.min(3, Math.max(1, Math.ceil((W - xF) / (2 * (w + h))))), steps = 4 * m;
      const Tm = T * (0.7 + 0.3 * m), q = clamp((lt - ts[i]) / Tm) * steps, j = Math.min(steps - 1, Math.floor(q)), f = q >= steps ? 1 : q - j;
      let xL = xF + m * 2 * (w + h);
      for (let s2 = 0; s2 < j; s2++) xL -= s2 % 2 ? w : h;
      const fw = j % 2 ? h : w, fh = j % 2 ? w : h, ph = -90 * E.inOutSine(f);
      const [dx, dy] = rotV(fw / 2, -fh / 2, ph);
      const cx = xL + dx, cy = base + dy, rot = -90 * j + ph;
      const done = q >= steps, land = done ? lt - ts[i] - Tm : -1;
      const sq = land >= 0 ? Math.exp(-land * 14) * 0.1 : 0;
      if (Pm.box !== 'none') {
        ctx.save(); ctx.translate(cx, cy + sq * h * 0.5); ctx.rotate(rot * DEG); ctx.scale(1 + sq * 0.5, 1 - sq);
        if (Pm.box === 'plate') env.rect(-w / 2, -h / 2, w, h, i === Pm.acc % n ? accC : sc.ink, out, false);
        else env.rrect(-w / 2, -h / 2, w, h, 2, null, out, false, sc.fg, lw);
        ctx.restore();
      }
      const plate = Pm.box === 'plate';
      const it = { text: units[i], font: Pm.font, size, x: cx, y: cy + sq * h * 0.5, rot, sx: 1 + sq * 0.5, sy: 1 - sq, track: 0.02,
        color: plate ? onCol(sc, i === Pm.acc % n ? accC : sc.ink) : (i === Pm.acc % n ? accC : sc.fg), plain: plate, mi: miAt(env, ts[i]), noHold: !done };
      bb = UB(bb, J.mainDraw(env, it));
    }
    return bb;
  },
}, P);

/* ================================================================== 13 knReflow — 縦から横へ */
reg('knReflow', {
  name: '縦から横へ', tags: ['editorial', 'graphic', 'emotional'], w: 0.9, ae: 'halfVertical', fits: n => n >= 2 && n <= 16,
  enterBias: { cut: 2.5, blur: 1, pop: 0.4, slice: 0.2, wipe: 0.3 },
  plan(rng, cut, st) {
    const port = cut.H > cut.W * 1.08, lat = /[A-Za-z]/.test(cut.text);
    return { font: rng.pick(fontsOf(st, ['serif', 'display'])), dir: !lat && port && rng.chance(0.5) ? 'h2v' : 'v2h', swirl: rng.pick([1, -1]), at: rng.range(0.36, 0.46) };
  },
  render(env) {
    const { W, H, sc } = env, c = env.cut, Pm = c.params, lt = env.lt, u = U(env), port = isPort(env);
    const lat = hasLatin(c.text), t0 = lat ? flat(c.text) : strip(c.text), chars = [...t0], n = chars.length;
    const vCols = n <= (port ? 7 : 5) ? 1 : n <= 12 ? 2 : 3, per = Math.ceil(n / vCols);
    const vt = []; for (let i = 0; i < n; i += per) vt.push(chars.slice(i, i + per).join(''));
    const vtext = vt.join('\n'), htext = J.splitLines(t0, lat ? (port ? 13 : 20) : (port ? 7 : 14));
    const sv = Math.min(J.fitSize(vtext, Pm.font, W * 0.5, H * 0.8, { vertical: true, lead: 1.3, track: 0.04 }), W * 0.3);
    const sh = Math.min(J.fitSize(htext, Pm.font, W * 0.84, H * 0.4, { lead: 1.25, track: 0.04 }), H * 0.24);
    const LV = J.layoutText({ text: vtext, font: Pm.font, size: sv, vertical: true, lead: 1.3, track: 0.04 }).filter(g => g.ch.trim());
    const LH = J.layoutText({ text: htext, font: Pm.font, size: sh, lead: 1.25, track: 0.04 }).filter(g => g.ch.trim());
    const A = Pm.dir === 'h2v' ? LH : LV, B = Pm.dir === 'h2v' ? LV : LH, sA = Pm.dir === 'h2v' ? sh : sv, sB = Pm.dir === 'h2v' ? sv : sh;
    const tR = clamp(c.dur * Pm.at, 0.5, 1.5), m = Math.min(A.length, B.length);
    let bb = null;
    for (let i = 0; i < m; i++) {
      const a = A[i], b = B[i];
      const q = E.inOutCubic(clamp((lt - tR - i * Math.min(0.05, 0.5 / m)) / 0.5));
      const ax = W / 2 + a.x + a.vx, ay = H / 2 + a.y + a.vy, bx = W / 2 + b.x + b.vx, by = H / 2 + b.y + b.vy;
      // along an arc that bulges sideways: the glyphs swirl from one setting to the other
      const mx = (ax + bx) / 2, my = (ay + by) / 2, dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, k = Pm.swirl * 0.35 * (i % 2 ? 1 : 0.6);
      const cx = mx - dy / L * L * k, cy = my + dx / L * L * k;
      const x = (1 - q) * (1 - q) * ax + 2 * (1 - q) * q * cx + q * q * bx, y = (1 - q) * (1 - q) * ay + 2 * (1 - q) * q * cy + q * q * by;
      const r0 = a.r90 ? 90 : 0, r1 = b.r90 ? 90 : 0;
      const it = { text: a.ch, font: Pm.font, size: lerp(sA * (a.fs || 1), sB * (b.fs || 1), q), x, y, rot: lerp(r0, r1, q) + Pm.swirl * 180 * bellK(q) * 0.25, color: sc.fg, mi: i * 0.4 };
      bb = UB(bb, J.mainDraw(env, it));
    }
    return bb;
  },
}, P);

/* ================================================================== 14 knPadGrid — パッド */
reg('knPadGrid', {
  name: 'パッド', tags: ['pop', 'graphic', 'glitch'], w: 0.8, ae: 'gridCells', fits: n => n >= 2 && n <= 18,
  enterBias: { cut: 3, pop: 0.8, blur: 0.4, slice: 0.2, wipe: 0.2 },
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display'])), round: rng.chance(0.5), flash: rng.pick(['accent', 'accent', 'ink']), beat: rng.chance(0.7) };
  },
  render(env) {
    const { W, H, sc } = env, c = env.cut, Pm = c.params, lt = env.lt, u = U(env), port = isPort(env);
    const units = unitsOf(c, 6, Math.min(6, Math.max(2, Math.ceil(gcount(c.text) / 4)))), n = units.length;
    const cols = port ? (n <= 3 ? 1 : 2) : (n <= 3 ? n : n === 4 ? 2 : 3), rows = Math.ceil(n / cols);
    const gw = W * (port ? 0.84 : 0.86), gh = H * (port ? 0.62 : 0.72), g = u * 0.02;
    const cw = (gw - g * (cols - 1)) / cols, chh = Math.min((gh - g * (rows - 1)) / rows, cw * (port ? 0.8 : 0.75));
    const x0 = W / 2 - gw / 2, y0 = H / 2 - (chh * rows + g * (rows - 1)) / 2;
    const ts = onsets(env, n, { frac: 0.45, gap: 0.34 });
    const out = tout(env), flashC = Pm.flash === 'ink' ? sc.ink : accOn(sc), lw = Math.max(1.5, u * 0.003);
    let bb = null;
    const sizes = units.map(t => Math.min(J.fitSize(t, Pm.font, cw * 0.8, chh * 0.62, { track: 0.02 }), chh * 0.5));
    const sz = Math.min(...sizes) * 1.25;
    for (let i = 0; i < cols * rows; i++) {
      const r = Math.floor(i / cols), q = i % cols;
      const x = x0 + q * (cw + g), y = y0 + r * (chh + g);
      const e = E.outBack(clamp((lt - i * 0.04) / 0.3), 1.4) * out;
      if (e <= 0.01) continue;
      const ix = x + cw / 2 * (1 - e), iy = y + chh / 2 * (1 - e);
      env.rrect(ix, iy, cw * e, chh * e, Pm.round ? chh * 0.12 : 0, null, 1, false, sc.sub, lw);
      if (i >= n || lt < ts[i]) continue;
      // hit: the pad flashes full, then decays to a faint glow; beats re-trigger one pad at a time
      let fl = Math.exp(-(lt - ts[i]) * 6);
      if (Pm.beat && env.beat && lt > ts[n - 1] + 0.4 && env.beat.index % n === i) fl = Math.max(fl, 0.55 * Math.exp(-env.beat.since * 7));
      const pf = 0.1 + 0.9 * fl;
      env.rrect(x + lw, y + lw, cw - lw * 2, chh - lw * 2, Pm.round ? chh * 0.12 : 0, flashC, pf * out, false);
      const tc = pf > 0.5 ? onCol(sc, flashC) : sc.fg;
      const it = { text: units[i], font: Pm.font, size: Math.min(sizes[i], sz) * (1 + 0.12 * Math.exp(-(lt - ts[i]) * 12)), x: x + cw / 2, y: y + chh / 2, track: 0.02, color: tc, mi: miAt(env, ts[i]) };
      bb = UB(bb, J.mainDraw(env, it));
    }
    return bb;
  },
}, P);

})();
