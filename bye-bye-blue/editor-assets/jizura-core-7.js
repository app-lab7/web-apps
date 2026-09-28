/* JIZURA pack: treattrans — text treatments (neon, chrome, karaoke, reflection, ransom…) + cut-to-cut transitions (カット間のつなぎ) */
(() => {
'use strict';
const E = J.E;
const PK = 'treattrans';
const reg = (g, k, d) => J.register(g, k, d, PK);
const DEG = J.DEG, TAU = J.TAU, clamp = J.clamp;

/* ================= colour helpers ================= */
const ctr = (a, b) => J.contrast(a, b);
const isDark = c => J.lum(c) < 0.45;
const firstOK = (list, test, fb) => { for (const c of list) if (c && test(c)) return c; return fb; };
const best = (list, against) => { let b = list[0], bv = -1; for (const c of list) { if (!c) continue; const v = ctr(c, against); if (v > bv) { bv = v; b = c; } } return b; };
// an accent that differs from colour `col` and still reads on the scheme background
const accentFor = (sc, col, min = 1.6) => firstOK([sc.accent, sc.accent2, sc.ghostA, sc.ghostB], c => ctr(c, col) >= min && ctr(c, sc.bg) >= 1.5, J.fitContrast(sc.accent, col, min + 0.3));
// text colour for glyphs sitting on `box`: keep `pref` when it reads, else the best scheme colour
const textOn = (box, pref, sc) => (ctr(pref, box) >= 3 ? pref : best([sc.bg, sc.fg, sc.ink, '#111111', '#FFFFFF'], box));
// a colour that stands out from the scheme background (for marks drawn next to the text)
const markCol = (sc, col) => firstOK([sc.accent, sc.accent2, col], c => ctr(c, sc.bg) >= 2, col);
const TR = 'rgba(0,0,0,0)';
// text coloured like the background sits on a layout's own plate: colour marks / recolouring would vanish into it
const onPlate = (sc, col) => ctr(col, sc.bg) < 1.5;

/* ================= item helpers ================= */
const alive = (it, amin = 0.9) => it.fill !== false && (it.alpha ?? 1) >= amin && !!it.text && it.size > 1;
const colOf = (env, it) => it.color || env.sc.fg;
const addPre = (it, f) => { const p = it.pre; it.pre = p ? (e, i) => { p(e, i); f(e, i); } : f; };
const addPost = (it, f) => { const p = it.post; it.post = p ? (e, i, b) => { p(e, i, b); f(e, i, b); } : f; };
// size-dependent fields: set now and refresh right before drawing (after enter / hold / exit changed the size)
const sized = (it, env, f) => { f(it, env); addPre(it, (e, i) => f(i, e)); };
const inP = (env, it, d, len) => clamp((env.lt - (it.delay || 0) - d) / len);
const glyphN = t => [...String(t || '')].filter(c => c.trim()).length;
const isSp = ch => ch === ' ' || ch === '　';
// true while a piece-based entrance / exit is moving (gradient / no-fill / copies would fight its pieces)
const inPieces = (env, it) => {
  const c = env.cut, en = J.ENTER[it.enter || c.enter], ex = J.EXIT[it.exit || c.exit];
  if (en && en.pieces && env.lt - (it.delay || 0) < c.inDur * 1.3 + 0.05) return true;
  if (ex && ex.pieces && c.outDur > 0 && env.lt > c.dur - c.outDur - 0.3) return true;
  return false;
};
/* run fn() under the same clip / bands / blur as J.drawFx applies to the text; local=true also moves into item space */
const withFx = (env, it, fn, local = true) => {
  const ctx = env.ctx, W = env.W, H = env.H;
  ctx.save();
  if (it.blur > 0.4 && env.allowFilter) ctx.filter = `blur(${(it.blur * env.scale).toFixed(1)}px)`;
  if (it.clip) { ctx.beginPath(); ctx.rect(it.clip[0], -H, it.clip[1] - it.clip[0], H * 3); ctx.clip(); }
  if (it.clipY) { ctx.beginPath(); ctx.rect(-W, it.clipY[0], W * 3, it.clipY[1] - it.clipY[0]); ctx.clip(); }
  if (it.clipFn) { ctx.beginPath(); it.clipFn(ctx, env, it); ctx.clip(); }
  const run = () => {
    if (!local) { fn(); return; }
    ctx.save(); ctx.translate(it.x, it.y);
    if (it.rot) ctx.rotate(it.rot * DEG);
    if (it.skew) ctx.transform(1, 0, Math.tan(it.skew * DEG), 1, 0, 0);
    fn(); ctx.restore();
  };
  try {
    if (it.vbands && it.vbands.length) {
      for (const [x0, x1, dy] of it.vbands) { ctx.save(); ctx.beginPath(); ctx.rect(x0, -H * 2, x1 - x0, H * 5); ctx.clip(); ctx.translate(0, dy); run(); ctx.restore(); }
    } else if (it.bands && it.bands.length) {
      for (const [y0, y1, dx] of it.bands) { ctx.save(); ctx.beginPath(); ctx.rect(-W * 2, y0, W * 5, y1 - y0); ctx.clip(); ctx.translate(dx, 0); run(); ctx.restore(); }
      const lo = it.bands[0][0], hi = it.bands[it.bands.length - 1][1];
      ctx.save(); ctx.beginPath(); ctx.rect(-W * 2, -H * 3, W * 5, lo + H * 3); ctx.rect(-W * 2, hi, W * 5, H * 4); ctx.clip(); run(); ctx.restore();
    } else run();
  } finally { ctx.restore(); }
};
// per text line (vertical: per column) extents in item space from the static layout; glyphs hidden by charFn are left out
const lineSpans = (it) => {
  const lay = J.layoutText(it), sx = it.sx || 1, sy = it.sy || 1, map = new Map();
  for (const g of lay) {
    if (isSp(g.ch)) continue;
    if (it.charFn) { const c = it.charFn(g.i, g, lay.N); if (c && (c.hide || (c.a != null && c.a < 0.05))) continue; }
    const a0 = it.vertical ? (g.y - g.h / 2) * sy : (g.x - g.w / 2) * sx, a1 = it.vertical ? (g.y + g.h / 2) * sy : (g.x + g.w / 2) * sx;
    const L = map.get(g.li);
    if (!L) map.set(g.li, { li: g.li, a0, a1, c: it.vertical ? g.x * sx : g.y * sy, n: 1 });
    else { L.a0 = Math.min(L.a0, a0); L.a1 = Math.max(L.a1, a1); L.n++; }
  }
  return [...map.values()].sort((a, b) => a.li - b.li);
};
// visible glyphs in item space, following the per-glyph motion (dx/dy/scale/rotation) of enter / hold / exit
const glyphList = (it) => {
  const lay = J.layoutText(it), sx = it.sx || 1, sy = it.sy || 1, out = [];
  for (const g of lay) {
    if (isSp(g.ch)) continue;
    const c = it.charFn ? it.charFn(g.i, g, lay.N) : null;
    if (c && c.hide) continue;
    out.push({ g, x: g.x * sx + g.vx * sx + ((c && c.dx) || 0), y: g.y * sy + g.vy * sy + ((c && c.dy) || 0), w: g.w * sx, h: g.h * sy,
      s: c && c.s != null ? c.s : 1, rot: (c && c.rot) || 0, a: c && c.a != null ? c.a : 1 });
  }
  return out;
};
// a plain copy of an item for extra passes (shadows, rims…): no hooks, no effects of its own
const bare = (i, extra) => Object.assign({}, i, { pre: null, post: null, echo: null, streak: null, shadow: null, extrude: null, pattern: null, patternBg: null, gradient: null,
  pieceFn: null, strokeDash: null, strokeUnder: false, wipeBar: null, cursorAt: null, bands: null, vbands: null, clip: null, clipY: null, clipFn: null, blend: null, _lay: null }, extra || {});
// is the item mid "dash" draw-on (stroke tracing) — copies built from fills would give it away
const tracing = i => i.dash != null && i.dash < 1;

/* ================= TREATMENTS ================= */

/* ---- neon tube: bright thin outline + coloured bloom, no fill, rare flicker ---- */
reg('treat', 'neonOutline', { name: 'ネオン管', tags: ['glitch', 'emotional', 'pop'], w: 0.8,
  plan: rng => ({ k: rng.range(0.024, 0.032), fl: rng.chance(0.75) }),
  apply(env, it, P) {
    if (!alive(it, 0.5) || inPieces(env, it)) return;
    const sc = env.sc, col = colOf(env, it), dk = isDark(sc.bg);
    const gc = dk ? firstOK([sc.accent, sc.accent2, sc.ghostA, sc.ghostB], c => J.lum(c) > J.lum(sc.bg) + 0.15 && ctr(c, col) >= 1.2, col)
      : firstOK([sc.accent, sc.accent2, sc.ghostA, sc.ghostB], c => ctr(c, sc.bg) >= 1.8, col);
    const tube = dk ? J.mix(col, '#FFFFFF', 0.4) : col;
    it.fill = false; it.strokeColor = tube;
    sized(it, env, i => {
      i.stroke = Math.max(1.4, i.size * P.k);
      i.shadow = { color: J.rgba(gc, dk ? 1 : 0.7), blur: i.size * 0.07, dx: 0, dy: 0 };
    });
    addPre(it, (e, i) => {                       // wide soft bloom under the tube (main pass only)
      if (e.pass !== 'main' || tracing(i)) return;
      const s = i.size;
      const c = bare(i, { fill: false, stroke: s * P.k * 4.5, strokeColor: gc, alpha: (i.alpha ?? 1) * (dk ? 0.22 : 0.16), shadow: { color: J.rgba(gc, 0.9), blur: s * 0.16, dx: 0, dy: 0 } });
      withFx(e, i, () => J.drawItem(e, c), false);
    });
    if (P.fl) {
      const s0 = J.h(env.cut.seed, (it.mi | 0) + 3, 41);
      it.charFns.push(gi => { const r = J.r(s0, gi, env.step); return r < 0.03 ? { a: 0.22 } : r < 0.05 ? { a: 0.6 } : null; });
    }
  } });

/* ---- chrome: multi-stop metallic fill with a hard horizon + keyline ---- */
reg('treat', 'chrome', { name: 'クローム', tags: ['pop', 'graphic'], w: 0.7,
  plan: rng => ({ v: rng.pick(['silver', 'silver', 'sunset']), h: rng.range(0.5, 0.56) }),
  apply(env, it, P) {
    if (!alive(it) || inPieces(env, it)) return;
    const sc = env.sc, col = colOf(env, it), light = J.lum(col) > 0.42, h = P.h;
    const acc = accentFor(sc, col, 1.3);
    const top0 = light ? '#FFFFFF' : J.mix(col, '#FFFFFF', 0.55);
    const top1 = light ? J.mix(col, '#000000', 0.42) : col;
    const band = J.mix(col, '#000000', light ? 0.62 : 0.45);
    const low0 = P.v === 'sunset' ? J.mix(acc, '#FFFFFF', 0.5) : J.mix(col, '#FFFFFF', light ? 0.75 : 0.42);
    const low1 = P.v === 'sunset' ? acc : J.mix(col, '#000000', light ? 0.12 : 0.25);
    it.gradient = [[0.08, top0], [h, top1], [h, band], [h + 0.03, band], [h + 0.03, low0], [0.94, low1]];
    it.strokeColor = light ? J.mix(col, '#000000', 0.7) : J.mix(col, '#000000', 0.35);
    sized(it, env, i => { i.stroke = Math.max(1.2, i.size * 0.022); });
  } });

/* ---- rainbow: colours drift across the glyphs through the scheme palette ---- */
reg('treat', 'rainbow', { name: '虹色', tags: ['pop', 'emotional'], w: 0.7,
  plan: rng => ({ v: rng.pick(['drift', 'drift', 'steps']), sp: rng.range(0.28, 0.45), dir: rng.chance(0.5) ? 1 : -1 }),
  apply(env, it, P) {
    if (!alive(it)) return;
    const sc = env.sc, col = colOf(env, it);
    if (onPlate(sc, col)) return;
    const pal = [col];
    for (const c of [sc.accent, sc.accent2, sc.ghostA, sc.ghostB, sc.sub]) if (c && ctr(c, sc.bg) >= 1.8 && pal.every(p => ctr(p, c) >= 1.25)) pal.push(c);
    if (pal.length < 3) pal.push(J.fitContrast(J.mix(sc.accent, sc.accent2 || sc.fg, 0.5), sc.bg, 2));
    const L = pal.length, off = it.mi | 0;
    it.charFns.push(gi => {
      if (P.v === 'steps') { const k = ((gi + off + Math.floor(env.ltb * 2.2) * P.dir) % L + L) % L; return { color: pal[k] }; }
      const u = (gi + off) * P.sp - env.ltb * 0.75 * P.dir, k = ((u % L) + L) % L, a = Math.floor(k), f = J.smooth(0.3, 0.7, k - a);
      return { color: J.mix(pal[a], pal[(a + 1) % L], f) };
    });
  } });

/* ---- colour-plate misregistration: two tinted copies split sideways, jolting on glitch steps ---- */
reg('treat', 'glitchSplit', { name: '色版ズレ', tags: ['glitch', 'pop'], w: 0.8,
  plan: rng => ({ d: rng.range(0.06, 0.08), up: rng.chance(0.3) }),
  apply(env, it, P) {
    if (!alive(it) || inPieces(env, it)) return;
    const sc = env.sc, col = colOf(env, it), dk = isDark(sc.bg);
    const cands = [sc.ghostA, sc.ghostB, sc.accent, sc.accent2].filter(c => c && ctr(c, sc.bg) >= 1.4 && ctr(c, col) >= 1.15);
    const cA = cands[0] || accentFor(sc, col, 1.4), cB = cands.find(c => ctr(c, cA) >= 1.3) || J.mix(cA, sc.bg, 0.4);
    const s0 = J.h(env.cut.seed, (it.mi | 0) + 5, 43);
    addPre(it, (e, i) => {
      const r = J.r(s0, e.step), hit = r < 0.2 && e.lt > e.cut.inDur * 0.5;
      if (hit && !i.bands && !i.vbands && e.pass === 'main') {
        const s = i.size;
        i.bands = J.itemBands(e, i, 4, k => (J.r(s0, e.step, k, 7) < 0.55 ? J.rs(s0, e.step, k, 8) * s * 0.16 : 0));
      }
      if (e.pass !== 'main' || tracing(i)) return;
      const s = i.size, d = s * P.d * (hit ? 1.8 + J.r(s0, e.step, 2) : 1), dy = (P.up ? d * 0.45 : 0) + (hit ? J.rs(s0, e.step, 3) * s * 0.02 : 0);
      const cp = (c, k) => bare(i, { x: i.x + d * k, y: i.y + dy * k, color: c, strokeColor: c, stroke: 0, blend: dk ? 'screen' : 'multiply', alpha: (i.alpha ?? 1) * 0.95 });
      withFx(e, i, () => { J.drawItem(e, cp(cA, -1)); J.drawItem(e, cp(cB, 1)); }, false);
    });
  } });

/* ---- stacked shadows: 3 separated copies in different scheme colours ---- */
reg('treat', 'shadowStack', { name: '多重影', tags: ['pop', 'graphic'], w: 0.8,
  plan: rng => ({ d: rng.range(0.04, 0.055), dir: rng.pick([[1, 1], [1, 1], [-1, 1], [1, 0.5], [0, 1]]), n: rng.pick([3, 3, 4]) }),
  apply(env, it, P) {
    if (!alive(it) || inPieces(env, it)) return;
    const sc = env.sc, col = colOf(env, it);
    const cols = [];
    for (const c of [sc.accent, sc.accent2, sc.ghostB, sc.ghostA, sc.ink, sc.sub, sc.fg]) if (c && ctr(c, sc.bg) >= 1.4 && ctr(c, col) >= 1.12 && cols.every(p => ctr(p, c) >= 1.12)) cols.push(c);
    while (cols.length < P.n) cols.push(J.mix(cols.length ? cols[cols.length - 1] : accentFor(sc, col), sc.bg, 0.35));
    it.strokeColor = sc.bg; it.strokeUnder = true;
    sized(it, env, i => { i.stroke = Math.max(1.5, i.size * 0.028); });
    addPre(it, (e, i) => {
      if (e.pass !== 'main' || tracing(i)) return;
      const s = i.size, d = s * P.d;
      withFx(e, i, () => {
        for (let k = P.n; k >= 1; k--) {
          J.drawItem(e, bare(i, { x: i.x + P.dir[0] * d * k, y: i.y + P.dir[1] * d * k, color: cols[k - 1], stroke: Math.max(1.5, s * 0.028), strokeColor: sc.bg, strokeUnder: true }));
        }
      }, false);
    });
  } });

/* ---- stencil: bridges cut through every glyph (per-glyph clips, so the chromatic ghosts get them too); they open during the entrance ---- */
reg('treat', 'stencilGap', { name: 'ステンシル字', tags: ['graphic', 'editorial', 'glitch'], w: 0.6,
  plan: rng => ({ v: rng.pick(['one', 'one', 'two']), at: rng.range(-0.05, 0.06), g: rng.range(0.034, 0.048) }),
  apply(env, it, P) {
    if (!alive(it) || inPieces(env, it)) return;
    const g = P.g * E.outCubic(inP(env, it, 0.04, 0.4)) * (1 - E.inCubic(env.pOut));
    if (g < 0.003) return;
    const cuts = P.v === 'two' ? [-0.13, 0.13] : [P.at], vert = false;
    const parts = [];
    let lo = -0.8;
    for (const c of cuts) { parts.push([lo, c - g]); lo = c + g; }
    parts.push([lo, 0.8]);
    const fns = parts.map(pr => () => (vert ? { clipX: pr } : { clipY: pr }));
    it.charFns.push(fns[0]);
    addPre(it, (e, i) => {
      if (tracing(i)) return;
      const rest = i.charFns.filter(f => f !== fns[0]);
      withFx(e, i, () => { for (let k = 1; k < fns.length; k++) J.drawItem(e, bare(i, { charFn: J.combineChar(rest.concat([fns[k]])) })); }, false);
    });
  } });

/* ---- water level: outlined glyphs fill up with colour, the surface bobs, drains on exit ---- */
reg('treat', 'waterline', { name: '水位', tags: ['emotional', 'pop', 'calm'], w: 0.6,
  plan: rng => ({ lvl: rng.range(0.46, 0.58), c: rng.int(0, 1), k: rng.range(0.02, 0.026) }),
  apply(env, it, P) {
    if (!alive(it, 0.5) || inPieces(env, it)) return;
    const sc = env.sc, col = colOf(env, it), liq = P.c ? accentFor(sc, col, 1.3) : col;
    const q = E.inOutCubic(inP(env, it, 0.05, 0.8)) * (1 - E.inCubic(env.pOut));
    const L = J.lerp(1.02, P.lvl, q) + Math.sin(env.ltb * 2.6 + (it.mi | 0)) * 0.022 * q;
    const surf = J.mix(liq, '#FFFFFF', isDark(liq) ? 0.35 : 0.5);
    it.gradient = [[0, TR], [clamp(L - 0.001), TR], [clamp(L), surf], [clamp(L + 0.025), surf], [clamp(L + 0.025), liq], [1, liq]];
    it.strokeColor = col;
    sized(it, env, (i, e) => { i.stroke = Math.max(1.3, i.size * P.k); if (e.pass !== 'main') i.fill = false; });
  } });

/* ---- karaoke: a colour wipe runs through the words over the length of the cut ---- */
reg('treat', 'karaoke', { name: 'カラオケ', tags: ['emotional', 'pop', 'editorial'], w: 0.9,
  plan: rng => ({ sp: rng.range(0.7, 0.85), ol: rng.chance(0.55) }),
  apply(env, it, P) {
    if (!alive(it, 0.9)) return;
    const sc = env.sc, col = colOf(env, it), hot = accentFor(sc, col, 1.8), cut = env.cut;
    if (onPlate(sc, col)) return;
    if (P.ol) {
      const oc = best([sc.bg, sc.ink, '#111111', '#FFFFFF'], col);
      it.strokeColor = oc; it.strokeUnder = true;
      sized(it, env, i => { i.stroke = Math.max(1.5, i.size * 0.06); });
    }
    addPost(it, (e, i) => {
      if (e.pass !== 'main' || tracing(i)) return;
      const t0 = cut.inDur * 0.6, T = Math.max(0.3, (cut.dur - cut.outDur - t0) * P.sp);
      const q = E.inOutSine(clamp((e.lt - (i.delay || 0) - t0) / T));
      if (q <= 0) return;
      const spans = lineSpans(i); if (!spans.length) return;
      const s = i.size, sx = i.sx || 1, sy = i.sy || 1, pad = s * 0.12;
      const tot = spans.reduce((a, L) => a + (L.a1 - L.a0), 0);
      let rem = q * tot;
      const c = bare(i, { x: 0, y: 0, rot: 0, skew: 0, color: hot, blur: 0, strokeUnder: i.strokeUnder });
      withFx(e, i, () => {
        const ctx = e.ctx;
        ctx.save(); ctx.beginPath();
        for (const L of spans) {
          if (rem <= 0) break;
          const len = L.a1 - L.a0, take = Math.min(len, rem); rem -= take;
          const a0 = L.a0 - pad, a1 = L.a0 + take + (take >= len - 0.01 ? pad : 0), cr = s * (i.vertical ? sx : sy) * 0.72;
          if (i.vertical) ctx.rect(L.c - cr, a0, cr * 2, a1 - a0); else ctx.rect(a0, L.c - cr, a1 - a0, cr * 2);
        }
        ctx.clip();
        J.drawItem(e, c);
        ctx.restore();
      });
    });
  } });

/* ---- size rhythm: glyph sizes alternate / follow script / ramp away, re-spaced tightly on a shared baseline ---- */
reg('treat', 'sizeWave', { name: '大小リズム', tags: ['pop', 'graphic', 'editorial'], w: 0.7,
  plan: rng => ({ v: rng.pick(['alt', 'kanji', 'kanji', 'ramp', 'wave']), k: rng.range(0.64, 0.74), rev: rng.chance(0.4) }),
  apply(env, it, P) {
    if (!alive(it, 0.5)) return;
    const lay = J.layoutText(it), N = lay.N, off = it.mi | 0;
    if (!N) return;
    const chars = lay.map(g => g.ch).filter(c => c.trim());
    const isK = c => J.isKanji(c) || J.isKata(c) || J.isLatin(c);
    let v = P.v;
    if (v === 'kanji' && !(chars.some(isK) && chars.some(c => !isK(c)))) v = 'alt';
    if ((v === 'ramp' || v === 'wave') && chars.length < 3) v = 'alt';
    const S = new Array(N).fill(1);
    for (const g of lay) {
      const u = g.n > 1 ? g.ci / (g.n - 1) : 0.5;
      let s = 1;
      if (v === 'alt') s = (g.ci + g.li + off) % 2 ? P.k : 1.04;
      else if (v === 'kanji') s = isK(g.ch) ? 1.08 : P.k + 0.04;
      else if (v === 'ramp') s = J.lerp(1.1, P.k, P.rev ? 1 - u : u);
      else s = 0.87 + 0.17 * Math.sin(g.ci * 1.25 + off);
      if (J.isPunct(g.ch)) s = Math.min(s, 0.9);
      S[g.i] = s;
    }
    // re-space along each line so smaller glyphs close up (offsets stored in em units)
    const F = new Array(N).fill(0), size0 = it.size, tr = (it.track || 0) * size0, vert = !!it.vertical;
    const byLine = new Map();
    for (const g of lay) { if (!byLine.has(g.li)) byLine.set(g.li, []); byLine.get(g.li).push(g); }
    for (const gs of byLine.values()) {
      const ext = g => (vert ? g.h : g.w), pos = g => (vert ? g.y : g.x);
      const tot = gs.reduce((a, g) => a + ext(g) * S[g.i], 0) + tr * (gs.length - 1);
      const old0 = pos(gs[0]) - ext(gs[0]) / 2, old1 = pos(gs[gs.length - 1]) + ext(gs[gs.length - 1]) / 2;
      let p = it.align === 'left' ? old0 : it.align === 'right' && !vert ? old1 - tot : (old0 + old1) / 2 - tot / 2;
      for (const g of gs) { const w = ext(g) * S[g.i]; F[g.i] = (p + w / 2 - pos(g)) / size0; p += w + tr; }
    }
    it.charFns.push((gi, g) => {
      const s = S[gi]; if (s == null) return null;
      if (vert) return { s, dy: F[gi] * g.w * (it.sy || 1) };
      return { s, dx: F[gi] * g.h * (it.sx || 1), dy: (1 - s) * 0.4 * g.h * (it.sy || 1) };
    });
  } });

/* ---- alternating tilt: glyphs lean left / right like hand-set type ---- */
reg('treat', 'rotateAlt', { name: '揺れ字', tags: ['pop', 'emotional'], w: 0.7, safe: true,
  plan: rng => ({ a: rng.range(9, 14), v: rng.pick(['alt', 'alt', 'rand']) }),
  apply(env, it, P) {
    if (!alive(it, 0.5)) return;
    const off = it.mi | 0, s0 = J.h(env.cut.seed, off + 9, 47);
    it.charFns.push((gi, g) => {
      if (J.isPunct(g.ch)) return null;
      const sg = (gi + off) % 2 ? 1 : -1, r = P.v === 'rand' ? sg * P.a * J.rr(0.45, 1.25, s0, gi) : sg * P.a;
      return { rot: r, s: 0.94 };
    });
  } });

/* ---- baseline shift: alternate up/down, stairs or an arch ---- */
reg('treat', 'baselineShift', { name: '段違い', tags: ['pop', 'graphic'], w: 0.7, safe: true,
  plan: rng => ({ v: rng.pick(['alt', 'alt', 'stairs', 'arc']), k: rng.range(0.08, 0.11), dir: rng.chance(0.5) ? 1 : -1 }),
  apply(env, it, P) {
    if (!alive(it, 0.5)) return;
    const off = it.mi | 0, vert = !!it.vertical, kk = String(it.text).includes('\n') ? 0.7 : 1;
    it.charFns.push((gi, g) => {
      const u = g.n > 1 ? g.ci / (g.n - 1) : 0.5;
      let o;
      if (P.v === 'stairs') o = (u - 0.5) * P.k * Math.min(3.2, g.n * 0.55) * P.dir;
      else if (P.v === 'arc') o = (Math.sin(Math.PI * u) - 0.6) * P.k * 2.2;
      else o = ((g.ci + off) % 2 ? 1 : -1) * P.k;
      return vert ? { dx: o * kk * g.w * (it.sx || 1) } : { dy: -o * kk * g.h * (it.sy || 1) };
    });
  } });

/* ---- faux bold: same-colour stroke thickens every stem ---- */
reg('treat', 'fauxBold', { name: '極太', tags: ['graphic', 'pop', 'editorial'], w: 0.5, safe: true,
  plan: rng => ({ k: rng.range(0.035, 0.05) }),
  apply(env, it, P) {
    if (!alive(it)) return;
    it.strokeColor = colOf(env, it); it.track = (it.track || 0) + P.k;
    sized(it, env, (i, e) => { i.stroke = inPieces(e, i) ? 0 : Math.max(1, i.size * P.k); });
  } });

/* ---- circled glyphs: each character sits in its own ring (or solid disc) ---- */
reg('treat', 'circled', { name: '丸囲み', tags: ['pop', 'graphic', 'editorial'], w: 0.6,
  plan: rng => ({ v: rng.pick(['ring', 'ring', 'disc']), k: rng.range(0.68, 0.74) }),
  apply(env, it, P) {
    if (!alive(it, 0.9)) return;
    const sc = env.sc, col = colOf(env, it), disc = P.v === 'disc';
    if (onPlate(sc, col)) return;
    const rc = disc ? firstOK([sc.accent, sc.accent2, sc.ink, sc.fg], c => ctr(c, sc.bg) >= 2 && ctr(c, col) >= 1.3, sc.fg) : markCol(sc, col);
    const tc = disc ? textOn(rc, col, sc) : col;
    const qOf = (e, gi) => E.outBack(clamp((e.lt - (it.delay || 0) - gi * 0.04) / 0.26), 1.6) * (1 - E.inCubic(clamp(e.pOut * 1.4 - gi * 0.03)));
    it.charFns.push((gi, g) => (J.isPunct(g.ch) ? null : disc && tc !== col && qOf(env, gi) > 0.55 ? { s: P.k, color: tc } : { s: P.k }));
    addPre(it, (e, i) => withFx(e, i, () => {
      const s = i.size, a = i.alpha ?? 1, m = Math.min(i.sx || 1, i.sy || 1);
      for (const G of glyphList(i)) {
        if (J.isPunct(G.g.ch)) continue;
        const q = qOf(e, G.g.i); if (q <= 0.01) continue;
        const r = s * 0.49 * m * (G.s / P.k) * q;
        if (disc) e.circle(G.x, G.y, r, rc, null, 0, a * G.a, true);
        else e.circle(G.x, G.y, r * 0.97, null, rc, Math.max(1.5, s * 0.045), a * G.a, true);
      }
    }));
  } });

/* ---- 「」 corner quotes drawn around the whole lyric ---- */
const QUOTED = new WeakMap();
reg('treat', 'bracketsQuote', { name: 'かぎ括弧', tags: ['editorial', 'emotional', 'calm'], w: 0.6,
  plan: rng => ({ v: rng.pick(['single', 'single', 'double']), k: rng.range(0.05, 0.065) }),
  apply(env, it, P) {
    if (!alive(it, 0.9)) return;
    const norm = t => String(t || '').replace(/[\s\u3000]/g, ''), whole = norm(env.cut.text), mine = norm(it.text);
    if (!mine || !whole) return;
    let open = whole.startsWith(mine), close = whole.endsWith(mine);
    if (!open && !close) return;
    if (mine === whole) QUOTED.set(env, true);
    else if ([...mine].length === 1) {
      // one-glyph items (mixed, scatter…): only the first / last glyph by motion index — and none once the whole lyric got its pair
      const n = [...whole].length, mi = it.mi;
      if (QUOTED.get(env) || mi == null || mi !== Math.round(mi)) return;
      open = open && mi === 0; close = close && mi === n - 1;
      if (!open && !close) return;
    }
    const sc = env.sc, lc = markCol(sc, colOf(env, it));
    // leave room for the brackets
    const m = J.measure(it), along = it.vertical ? m.h : m.w, room = it.size * 1.1, cap = (it.vertical ? env.H : env.W) * 0.92;
    if (along + room > cap && along < cap * 1.05) it.size *= Math.max(0.72, cap / (along + room));
    addPost(it, (e, i) => withFx(e, i, () => {
      const spans = lineSpans(i); if (!spans.length) return;
      const s = i.size * Math.min(i.sx || 1, i.sy || 1), a = i.alpha ?? 1;
      const q = E.outCubic(inP(e, i, e.cut.inDur * 0.45, 0.35)) * (1 - E.inCubic(e.pOut));
      if (q <= 0.01) return;
      const L0 = spans[0], L1 = spans[spans.length - 1], lw = Math.max(1.5, s * P.k), g = s * 0.3, arm = s * 0.36, leg = s * 0.74;
      const draw = (pts) => e.polyPartial(pts, q, lc, lw, a, false);
      const one = (d) => {
        if (!i.vertical) {
          const xL = L0.a0 - g - d, yT = L0.c - s * 0.52 - d, xR = L1.a1 + g + d, yB = L1.c + s * 0.52 + d;
          if (open) draw([[xL + arm, yT], [xL, yT], [xL, yT + leg]]);
          if (close) draw([[xR - arm, yB], [xR, yB], [xR, yB - leg]]);
        } else {
          const xR = L0.c + s * 0.52 + d, yT = L0.a0 - g - d, xL = L1.c - s * 0.52 - d, yB = L1.a1 + g + d;
          if (open) draw([[xR, yT + arm], [xR, yT], [xR - leg, yT]]);
          if (close) draw([[xL, yB - arm], [xL, yB], [xL + leg, yB]]);
        }
      };
      one(0);
      if (P.v === 'double') one(-lw * 2.2);
    }));
  } });

/* ---- reflection: a flipped, fading copy of the last line on an imaginary floor ---- */
reg('treat', 'reflection', { name: '映り込み', tags: ['emotional', 'calm', 'editorial'], w: 0.6,
  plan: rng => ({ k: rng.range(0.6, 0.78), a: rng.range(0.34, 0.46), gap: rng.range(0.04, 0.09) }),
  apply(env, it, P) {
    if (!alive(it, 0.9)) return;
    const col = colOf(env, it);
    addPre(it, (e, i) => {
      if (e.pass !== 'main' || tracing(i) || inPieces(e, i)) return;
      const m = J.measure(i), s = i.size, sy = i.sy || 1, k = P.k;
      const yb = i.vertical && i.align === 'left' ? m.h : m.h / 2, gap = s * sy * P.gap;
      const cf = i.charFn;
      const c = bare(i, { x: 0, y: yb + gap + yb * k, rot: 0, skew: 0, sy: -sy * k, blur: 0,
        gradient: [[0, TR], [0.42, J.rgba(col, 0.12)], [1, J.rgba(col, 1)]], alpha: (i.alpha ?? 1) * P.a,
        charFn: cf ? (gi, g, n) => { const r = cf(gi, g, n); return r ? Object.assign({}, r, { dy: -(r.dy || 0) * k, rot: -(r.rot || 0), color: null }) : r; } : null });
      withFx(e, i, () => {
        const ctx = e.ctx;
        ctx.save(); ctx.beginPath(); ctx.rect(-e.W * 3, yb + gap * 0.5, e.W * 6, gap * 0.5 + s * sy * k * 1.05); ctx.clip();
        J.drawItem(e, c);
        ctx.restore();
      });
    });
  } });

/* ---- inline (インライン): a hairline in the background colour runs just inside every stroke, like display type ---- */
reg('treat', 'inline', { name: 'インライン', tags: ['editorial', 'pop', 'graphic'], w: 0.6,
  plan: rng => ({ a: rng.range(0.017, 0.022), b: rng.range(0.016, 0.021), c: rng.chance(0.3) }),
  apply(env, it, P) {
    if (!alive(it) || inPieces(env, it)) return;
    const sc = env.sc, col = colOf(env, it);
    const line = P.c ? firstOK([sc.accent, sc.accent2], c => ctr(c, col) >= 2, sc.bg) : sc.bg;
    addPost(it, (e, i) => {
      if (e.pass !== 'main' || tracing(i) || inPieces(e, i)) return;
      const s = i.size;
      const cut = bare(i, { fill: false, stroke: s * (P.a + P.b) * 2, strokeColor: line });
      const rim = bare(i, { fill: false, stroke: s * P.a * 2, strokeColor: col });
      withFx(e, i, () => { J.drawItem(e, cut); J.drawItem(e, rim); }, false);
    });
  } });

/* ---- die-cut sticker: thick white paper border (+ keyline for light text), soft drop shadow, slightly tilted ---- */
reg('treat', 'sticker', { name: 'シール縁', tags: ['pop', 'graphic'], w: 0.8,
  plan: rng => ({ k: rng.range(0.13, 0.17), rot: rng.range(2, 4) * (rng.chance(0.5) ? 1 : -1), sh: rng.range(0.035, 0.05) }),
  apply(env, it, P) {
    if (!alive(it, 0.9)) return;
    const sc = env.sc, col = colOf(env, it), dk = isDark(sc.bg);
    const paper = firstOK([sc.ink, sc.fg, sc.sub], c => J.lum(c) > 0.78, '#FFFFFF');
    const key = ctr(col, paper) < 2.5 ? firstOK([sc.accent, sc.accent2, sc.ghostB, sc.ghostA], c => ctr(c, paper) >= 2.2 && ctr(c, col) >= 1.8, '#111111') : null;
    const edge = J.mix(paper, '#000000', 0.16);
    if (!it.vertical || glyphN(it.text) <= 4) it.rot = (it.rot || 0) + P.rot * (((it.mi | 0) % 2) ? -0.7 : 1);
    addPre(it, (e, i) => {
      if (e.pass !== 'main' || inPieces(e, i)) return;
      const s = i.size;
      const rim = bare(i, { fill: false, stroke: s * (P.k + 0.016), strokeColor: edge, shadow: { color: `rgba(0,0,0,${dk ? 0.6 : 0.32})`, blur: s * 0.05, dx: s * 0.015, dy: s * P.sh } });
      const pap = bare(i, { fill: false, stroke: s * P.k, strokeColor: paper });
      withFx(e, i, () => {
        J.drawItem(e, rim); J.drawItem(e, pap);
        if (key) J.drawItem(e, bare(i, { fill: false, stroke: s * 0.07, strokeColor: key }));
      }, false);
    });
  } });

/* ---- glint sweep / tide: an animated gradient runs through the letters ---- */
reg('treat', 'gradientSweep', { name: '光沢スイープ', tags: ['pop', 'emotional'], w: 0.7,
  plan: rng => ({ v: rng.pick(['glint', 'glint', 'tide']), per: rng.range(1.5, 2.3), ph: rng.range(0, 1) }),
  apply(env, it, P) {
    if (!alive(it) || inPieces(env, it)) return;
    const sc = env.sc, col = colOf(env, it);
    const t = env.ltb / P.per + P.ph;
    if (P.v === 'tide') {
      const c2 = accentFor(sc, col, 1.5), u = 0.52 + 0.3 * Math.sin(t * TAU), line = J.mix(c2, '#FFFFFF', 0.45);
      it.gradient = [[0, col], [u - 0.02, col], [u - 0.02, line], [u + 0.01, line], [u + 0.01, c2], [1, c2]];
      return;
    }
    const hl = J.lum(col) > 0.6 ? firstOK([sc.accent, sc.accent2, sc.ghostA, sc.ghostB], c => J.lum(c) > 0.3 && ctr(c, col) >= 1.3, J.mix(col, sc.bg, 0.45)) : J.mix(col, '#FFFFFF', 0.72);
    const u = (t % 1) * 1.7 - 0.35, w = 0.13;
    it.gradient = [[0, col], [clamp(u - w), col], [clamp(u), hl], [clamp(u + w * 0.35), hl], [clamp(u + w * 1.2), col], [1, col]];
  } });

/* ---- wide tracking: letter-spaced, a size smaller (editorial caption look) ---- */
reg('treat', 'kerningWide', { name: '字間広め', tags: ['editorial', 'calm', 'emotional'], w: 0.6, safe: true,
  plan: rng => ({ t: rng.range(0.32, 0.55), grow: rng.range(1.04, 1.14) }),
  apply(env, it, P) {
    if (!it.text || glyphN(it.text) < 2) return;
    const m0 = J.measure(it), a0 = it.vertical ? m0.h : m0.w;
    it.track = (it.track || 0) + (it.vertical ? P.t * 0.7 : P.t);
    const m1 = J.measure(it), a1 = it.vertical ? m1.h : m1.w, cap = (it.vertical ? env.H : env.W) * 0.9;
    let k = Math.min(1, a0 * P.grow / Math.max(1, a1));
    if (a1 * k > cap && a0 <= cap) k = Math.min(k, cap / a1);
    it.size *= Math.max(0.55, k);
  } });

/* ---- manuscript paper (原稿用紙): glyphs snap into equal square cells of a ruled grid ---- */
reg('treat', 'monoGrid', { name: '原稿用紙風', tags: ['editorial', 'calm', 'emotional'], w: 0.5,
  plan: rng => ({ pitch: rng.range(1.18, 1.26), c: rng.chance(0.65) ? 1 : 0 }),
  apply(env, it, P) {
    if (!alive(it, 0.9)) return;
    const sc = env.sc, col = colOf(env, it), vert = !!it.vertical;
    const lc = P.c ? firstOK([sc.accent, sc.accent2], c => ctr(c, sc.bg) >= 1.5, sc.sub) : sc.sub;
    const lines = String(it.text).split('\n'), nMax = Math.max(1, ...lines.map(l => [...l].length));
    const m0 = J.measure(it), along0 = vert ? m0.h : m0.w, along1 = nMax * P.pitch * it.size * (vert ? (it.sy || 1) : (it.sx || 1));
    if (along1 > along0 * 1.06) it.size *= along0 * 1.06 / along1;
    it.lead = Math.max(it.lead || 1.3, P.pitch + 0.16);
    const tgt = (g, sz) => {
      const p = P.pitch * sz;
      if (it.align === 'left') return (g.ci + 0.5) * p;
      if (it.align === 'right' && !vert) return -(g.n - g.ci - 0.5) * p;
      return (g.ci - (g.n - 1) / 2) * p;
    };
    it.charFns.push((gi, g) => (vert ? { dy: (tgt(g, g.w) - g.y) * (it.sy || 1), s: 0.86 } : { dx: (tgt(g, g.h) - g.x) * (it.sx || 1), s: 0.86 }));
    if (glyphN(it.text) < 2 || onPlate(sc, col)) return;             // one-glyph items (scatter…) / text on a plate: just the snapping
    const tint = J.mix(sc.bg, lc, isDark(sc.bg) ? 0.1 : 0.08);
    addPre(it, (e, i) => withFx(e, i, () => {
      const q = E.outCubic(inP(e, i, 0, 0.45)) * (1 - E.inCubic(e.pOut));
      if (q <= 0.01) return;
      const lay = J.layoutText(i), s = i.size, sx = i.sx || 1, sy = i.sy || 1, a = (i.alpha ?? 1) * q, ctx = e.ctx, main = e.pass === 'main';
      const cell = P.pitch * s, lw = Math.max(1, s * 0.013), gut = cell * 0.24;
      const rows = new Map();
      for (const g of lay) if (!rows.has(g.li)) rows.set(g.li, g);
      // rect in item space: (u0..u1 along the line, v0..v1 across it)
      const R = (u0, u1, v0, v1) => (vert ? [v0 * sx, u0 * sy, (v1 - v0) * sx, (u1 - u0) * sy] : [u0 * sx, v0 * sy, (u1 - u0) * sx, (v1 - v0) * sy]);
      const L = (u0, u1, v) => (vert ? [[v * sx, u0 * sy], [v * sx, u1 * sy]] : [[u0 * sx, v * sy], [u1 * sx, v * sy]]);
      for (const g of rows.values()) {
        const n = g.n; if (!n) continue;
        const c0 = tgt({ ci: 0, n }, s) - cell / 2, len = n * cell * q, cross = vert ? g.x : g.y;
        const v0 = cross - cell / 2, v1 = cross + cell / 2;
        if (main) { const r = R(c0, c0 + len, v0, v1); ctx.globalAlpha = a * 0.9; ctx.fillStyle = tint; ctx.fillRect(r[0], r[1], r[2], r[3]); ctx.globalAlpha = 1; }
        e.line(L(c0, c0 + len, v0), lc, lw, a * 0.85, false);
        e.line(L(c0, c0 + len, v1), lc, lw, a * 0.85, false);
        // ruby gutter: a second rule beside the row (above horizontal rows, right of vertical columns)
        e.line(L(c0 - cell * 0.1, c0 + len + cell * 0.1, vert ? v1 + gut : v0 - gut), lc, lw, a * 0.55, false);
        for (let k = 0; k <= n; k++) { const p = c0 + k * cell; if (p - c0 > len + 0.5) break; e.line(vert ? [[v0 * sx, p * sy], [v1 * sx, p * sy]] : [[p * sx, v0 * sy], [p * sx, v1 * sy]], lc, lw, a * 0.85, false); }
      }
    }));
  } });

/* ---- misregistered print: hollow outline on top, solid colour fill knocked off-register ---- */
reg('treat', 'outlineOffset', { name: '版ズレ袋文字', tags: ['pop', 'graphic', 'editorial'], w: 0.8,
  plan: rng => ({ d: rng.range(0.055, 0.08), dir: rng.pick([[1, 1], [1, 1], [-1, 1], [1, 0.35], [0.4, 1]]), k: rng.range(0.022, 0.03) }),
  apply(env, it, P) {
    if (!alive(it) || inPieces(env, it)) return;
    const sc = env.sc, col = colOf(env, it), fc = accentFor(sc, col, 1.4);
    it.fill = false; it.strokeColor = col;
    sized(it, env, i => { i.stroke = Math.max(1.4, i.size * P.k); });
    addPre(it, (e, i) => {
      if (e.pass !== 'main' || tracing(i)) return;
      const d = i.size * P.d;
      withFx(e, i, () => J.drawItem(e, bare(i, { fill: true, stroke: 0, color: fc, x: i.x + P.dir[0] * d, y: i.y + P.dir[1] * d })), false);
    });
  } });

/* ---- screen-tone shadow: an offset shadow printed as dots / hatching (manga tone) ---- */
reg('treat', 'toneShadow', { name: 'トーン影', tags: ['pop', 'graphic', 'editorial'], w: 0.7,
  plan: rng => ({ v: rng.pick(['dots', 'dots', 'hatch', 'stripes']), d: rng.range(0.09, 0.12), dir: rng.pick([[1, 1], [1, 1], [-1, 1], [1, 0.6]]) }),
  apply(env, it, P) {
    if (!alive(it)) return;
    const sc = env.sc, col = colOf(env, it);
    const tc = firstOK([sc.accent, sc.accent2, sc.fg, sc.ink], c => ctr(c, sc.bg) >= 2.2 && ctr(c, col) >= 1.3, markCol(sc, col));
    addPre(it, (e, i) => {
      if (e.pass !== 'main' || tracing(i) || inPieces(e, i)) return;
      const d = i.size * P.d;
      withFx(e, i, () => J.drawItem(e, bare(i, { x: i.x + P.dir[0] * d, y: i.y + P.dir[1] * d, color: tc, stroke: 0, pattern: P.v, patternColor: tc, patternBg: null })), false);
    });
  } });

/* ---- fade: glyph opacity trails off along the line (or toward both ends) ---- */
reg('treat', 'fadeChars', { name: '余韻', tags: ['emotional', 'calm'], w: 0.5, safe: true,
  plan: rng => ({ v: rng.pick(['tail', 'tail', 'both', 'head']), lo: rng.range(0.3, 0.4) }),
  apply(env, it, P) {
    if (!alive(it, 0.9)) return;
    it.charFns.push((gi, g) => {
      if (g.n < 3) return null;
      const u = g.ci / (g.n - 1);
      const f = P.v === 'both' ? Math.pow(Math.abs(u - 0.5) * 2, 1.4) : P.v === 'head' ? E.inQuad(1 - u) : E.inQuad(u);
      return { a: 1 - (1 - P.lo) * f };
    });
  } });

/* ---- cut & shift: every glyph is sliced through, the lower (vertical: right) half slides off ---- */
reg('treat', 'cutShift', { name: '断ち切り', tags: ['graphic', 'glitch', 'pop'], w: 0.7,
  plan: rng => ({ at: rng.range(-0.08, 0.06), d: rng.range(0.11, 0.16) * (rng.chance(0.5) ? 1 : -1), line: rng.chance(0.6) }),
  apply(env, it, P) {
    if (!alive(it) || inPieces(env, it)) return;
    const sc = env.sc, vert = !!it.vertical, lc = accentFor(sc, colOf(env, it), 1.6);
    const topFn = () => (vert ? { clipX: [-0.75, P.at] } : { clipY: [-0.75, P.at] });
    it.charFns.push(topFn);
    const amt = e => E.outBack(inP(e, it, e.cut.inDur * 0.55, 0.3), 2.2) * (1 - E.inCubic(e.pOut));
    addPre(it, (e, i) => {
      if (tracing(i)) return;
      const q = amt(e), s = i.size, d = s * P.d * q;
      const botFn = (gi, g) => (vert ? { clipX: [P.at, 0.75], dy: d } : { clipY: [P.at, 0.75], dx: d });
      const c = bare(i, { charFn: J.combineChar(i.charFns.filter(f => f !== topFn).concat([botFn])) });
      withFx(e, i, () => J.drawItem(e, c), false);
      if (P.line && e.pass === 'main' && q > 0.02) {
        withFx(e, i, () => {
          const lw = Math.max(1.2, s * 0.012), ex = s * 0.35 * q;
          for (const L of lineSpans(i)) {
            const cp = L.c + P.at * s * (vert ? (i.sx || 1) : (i.sy || 1));
            if (vert) e.line([[cp, L.a0 - ex], [cp, L.a1 + ex + d]], lc, lw, (i.alpha ?? 1) * Math.min(1, q), false);
            else e.line([[L.a0 - ex, cp], [L.a1 + ex + d, cp]], lc, lw, (i.alpha ?? 1) * Math.min(1, q), false);
          }
        });
      }
    });
  } });

/* ---- rack focus: a band of sharpness travels through the line, the rest is soft ---- */
reg('treat', 'focusPull', { name: 'ぼかし送り', tags: ['emotional', 'calm', 'editorial'], w: 0.6,
  plan: rng => ({ b: rng.range(0.035, 0.05), rev: rng.chance(0.3) }),
  apply(env, it, P) {
    if (!alive(it, 0.9)) return;
    const cut = env.cut, lay = J.layoutText(it), N = lay.N, whole = glyphN(cut.text), mi = it.mi;
    // position of each glyph along the lyric (0..1): within the item, or — for one-glyph items — by motion index
    let pos;
    if (N >= 3) pos = gi => gi / (N - 1);
    else if (whole >= 3 && mi != null && mi === Math.round(mi) && mi < whole) pos = () => mi / (whole - 1);
    else return;
    const f0 = clamp((env.lt - cut.inDur * 0.4) / Math.max(0.4, cut.dur - cut.outDur - cut.inDur * 0.4));
    const f = J.lerp(-0.15, 1.15, P.rev ? 1 - f0 : f0);
    it.charFns.push((gi, g) => {
      const d = clamp(Math.abs(pos(gi) - f) * 2.4 - 0.2);
      if (d <= 0.02) return null;
      return { blur: Math.min(g.w, g.h) * P.b * d, a: 1 - 0.35 * d };
    });
  } });

const SPOT = new WeakMap();
/* ---- spotlight glyph: one character (a kanji) is set in an accent disc / square / diamond ---- */
reg('treat', 'spotChar', { name: '一字マーク', tags: ['pop', 'graphic', 'editorial', 'emotional'], w: 0.7,
  plan: rng => ({ v: rng.pick(['disc', 'disc', 'square', 'diamond']), k: rng.range(1.06, 1.14), r: rng.range(0, 1) }),
  apply(env, it, P) {
    if (!alive(it, 0.9)) return;
    if (SPOT.get(env)) return;                                       // one spotlight per lyric
    const lay = J.layoutText(it), gs = lay.filter(g => !isSp(g.ch) && !J.isPunct(g.ch));
    if (!gs.length) return;
    const choose = list => { const k = list.filter(g => J.isKanji(g.ch)), t = list.filter(g => J.isKata(g.ch)), pool = k.length ? k : t.length ? t : list; return pool[Math.floor(P.r * pool.length) % pool.length]; };
    let T;
    if (gs.length === 1) {
      // one-glyph items (mixed / scatter layouts): only the item that holds the chosen glyph of the whole lyric
      const all = [...String(env.cut.text)].filter(c => !isSp(c)).map((ch, i) => ({ ch, i })).filter(g => !J.isPunct(g.ch));
      if (!all.length) return;
      const pick = choose(all);
      if (it.mi !== pick.i || gs[0].ch !== pick.ch) return;
      T = gs[0].i;
    } else T = choose(gs).i;
    SPOT.set(env, true);
    const sc = env.sc, col = colOf(env, it);
    if (onPlate(sc, col)) return;
    const pc = firstOK([sc.accent, sc.accent2, sc.ink, sc.fg], c => ctr(c, sc.bg) >= 2 && ctr(c, col) >= 1.4, accentFor(sc, col, 1.6));
    const tc = textOn(pc, col, sc);
    const qOf = e => E.outBack(inP(e, it, e.cut.inDur * 0.5, 0.3), 1.8) * (1 - E.inCubic(clamp(e.pOut * 1.3)));
    it.charFns.push(gi => (gi !== T ? null : qOf(env) > 0.5 && tc !== col ? { s: P.k, color: tc } : { s: P.k }));
    addPre(it, (e, i) => withFx(e, i, () => {
      const G = glyphList(i).find(x => x.g.i === T); if (!G) return;
      const q = qOf(e); if (q <= 0.01) return;
      const s = i.size * Math.min(i.sx || 1, i.sy || 1) * (G.s / P.k) * P.k, a = (i.alpha ?? 1) * G.a, ctx = e.ctx;
      if (P.v === 'disc') { e.circle(G.x, G.y, s * 0.64 * q, pc, null, 0, a, true); return; }
      ctx.save(); ctx.translate(G.x, G.y); ctx.rotate(((P.v === 'diamond' ? 45 : -6) + G.rot + (1 - q) * 40) * DEG);
      const h = s * (P.v === 'diamond' ? 0.68 : 0.6) * q;
      e.rect(-h, -h, h * 2, h * 2, pc, a, true);
      ctx.restore();
    }));
  } });

/* ---- ransom note (切り抜き文字): every glyph on its own scrap of paper, tilted and resized ---- */
reg('treat', 'ransom', { name: '切り貼り文字', tags: ['pop', 'glitch', 'graphic'], w: 0.6,
  plan: rng => ({ s: rng.int(1, 1e6) }),
  apply(env, it, P) {
    if (!alive(it, 0.9)) return;
    const sc = env.sc, col = colOf(env, it), s0 = J.h(P.s, it.mi | 0, 53);
    if (onPlate(sc, col)) return;
    const plates = [];
    for (const c of [sc.ink, sc.fg, sc.accent, sc.accent2, sc.sub, sc.ghostB]) if (c && ctr(c, sc.bg) >= 1.5 && plates.every(p => ctr(p, c) >= 1.2)) plates.push(c);
    if (!plates.length) plates.push(J.fitContrast(sc.accent, sc.bg, 2));
    const lay = J.layoutText(it), N = lay.N;
    const R = [];
    for (let k = 0; k < N; k++) {
      const pc = plates[J.h(s0, k, 1) % plates.length];
      const alt = best([sc.bg, col, sc.fg, sc.ink, '#111111', '#FFFFFF'].filter(c => c !== pc), pc);
      R.push({ pc, tc: ctr(col, pc) >= 3 && J.r(s0, k, 2) < 0.5 ? col : alt, rot: J.rs(s0, k, 3) * 8, s: J.rr(0.84, 1.02, s0, k, 4), dy: J.rs(s0, k, 5) * 0.05,
        pad: [J.rr(0.06, 0.16, s0, k, 6), J.rr(0.06, 0.16, s0, k, 7), J.rr(0.06, 0.16, s0, k, 8), J.rr(0.06, 0.16, s0, k, 9)], j: [0, 1, 2, 3].map(q => J.rs(s0, k, 10 + q) * 0.06) });
    }
    const qOf = (e, gi) => E.outBack(clamp((e.lt - (it.delay || 0) - gi * 0.03) / 0.22), 1.5) * (1 - E.inCubic(clamp(e.pOut * 1.4 - gi * 0.03)));
    it.charFns.push((gi, g) => { const r = R[gi]; if (!r || isSp(g.ch)) return null; return { rot: r.rot, s: r.s, dy: r.dy * g.h, color: qOf(env, gi) > 0.5 ? r.tc : null }; });
    addPre(it, (e, i) => withFx(e, i, () => {
      const ctx = e.ctx, a = i.alpha ?? 1;
      for (const G of glyphList(i)) {
        const r = R[G.g.i]; if (!r) continue;
        const q = qOf(e, G.g.i); if (q <= 0.01) continue;
        const w = Math.max(G.w, i.size * 0.55 * (i.sx || 1)) / 2, h = i.size * (i.sy || 1) / 2, p = r.pad, jj = r.j, S = i.size;
        ctx.save(); ctx.translate(G.x, G.y); ctx.rotate(G.rot * DEG); ctx.scale(G.s * q, G.s * q);
        e.poly([[-w - p[0] * S, -h - p[1] * S + jj[0] * S], [w + p[2] * S, -h - p[1] * S + jj[1] * S], [w + p[2] * S + jj[2] * S, h + p[3] * S], [-w - p[0] * S + jj[3] * S, h + p[3] * S]], r.pc, a * G.a, true);
        ctx.restore();
      }
    }));
  } });


/* ================= CUT-TO-CUT TRANSITIONS (カット間のつなぎ) =================
   draw(ctx, A, B, p, I): A = previous cut's resting frame, B = this cut's frame, both device-pixel canvases.
   The wrapper guarantees p<=0 → exactly A and p>=1 → exactly B, and a clean ctx state afterwards. */
const bell = k => Math.sin(Math.PI * clamp(k));
const ioQuart = k => (k < 0.5 ? 8 * k * k * k * k : 1 - 8 * Math.pow(1 - k, 4));
const minD = I => Math.min(I.cw, I.ch);
const lwOf = (I, k = 0.006) => Math.max(2, minD(I) * k);
// an accent that reads against both backgrounds
const tAcc = (I, second) => {
  const sc = I.sc, pb = (I.scPrev || sc).bg;
  const list = second ? [sc.accent2, sc.accent, sc.fg] : [sc.accent, sc.accent2, sc.fg];
  return firstOK(list, c => ctr(c, sc.bg) >= 1.8 && ctr(c, pb) >= 1.4, sc.fg);
};
// copy the sub-rectangle (x, y, w, h) of canvas C to the same place (+dx, dy), clamped to the canvas
const part = (ctx, C, x, y, w, h, dx = 0, dy = 0) => {
  let x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(C.width, Math.ceil(x + w)), y1 = Math.min(C.height, Math.ceil(y + h));
  if (x1 - x0 < 1 || y1 - y0 < 1) return;
  ctx.drawImage(C, x0, y0, x1 - x0, y1 - y0, x0 + dx, y0 + dy, x1 - x0, y1 - y0);
};
const scaled = (ctx, C, cw, ch, s, cx = cw / 2, cy = ch / 2) => ctx.drawImage(C, cx - cx * s, cy - cy * s, cw * s, ch * s);
const trReg = (k, d) => reg('trans', k, Object.assign({}, d, {
  draw(ctx, A, B, p, I) {
    ctx.save();
    try {
      if (!(p > 0)) ctx.drawImage(A, 0, 0);
      else if (p >= 1) ctx.drawImage(B, 0, 0);
      else d.draw(ctx, A, B, p, I, I.P || {});
    } finally { ctx.restore(); }
  } }));
const dirPick = (rng, list = ['L', 'R', 'U', 'D'], w) => (w ? rng.wpick(list.map((k, i) => [k, w[i]])) : rng.pick(list));

/* ---- straight wipe with a bright leading edge ---- */
trReg('wipe', { name: 'エッジワイプ', tags: ['graphic', 'editorial', 'pop'], w: 1.2, dur: 0.35,
  plan: rng => ({ dir: dirPick(rng, ['L', 'R', 'U', 'D'], [3, 2, 1.4, 0.8]) }),
  draw(ctx, A, B, p, I, P) {
    const { cw, ch } = I, e = E.inOutCubic(p), lw = lwOf(I, 0.007), ac = tAcc(I);
    ctx.drawImage(A, 0, 0);
    let bar;
    if (P.dir === 'R') { const x = cw * e; part(ctx, B, 0, 0, x, ch); bar = [x - lw / 2, 0, lw, ch, -1]; }
    else if (P.dir === 'U') { const y = ch * (1 - e); part(ctx, B, 0, y, cw, ch - y); bar = [0, y - lw / 2, cw, lw, 1]; }
    else if (P.dir === 'D') { const y = ch * e; part(ctx, B, 0, 0, cw, y); bar = [0, y - lw / 2, cw, lw, -1]; }
    else { const x = cw * (1 - e); part(ctx, B, x, 0, cw - x, ch); bar = [x - lw / 2, 0, lw, ch, 1]; }
    const a = Math.pow(bell(p), 0.6);
    ctx.globalAlpha = a; ctx.fillStyle = ac; ctx.fillRect(bar[0], bar[1], bar[2], bar[3]);
    // a thin trailing hairline on the B side
    const off = lw * 3.2 * bar[4];
    ctx.globalAlpha = a * 0.5;
    if (bar[2] === lw) ctx.fillRect(bar[0] + off, 0, Math.max(1, lw * 0.35), ch); else ctx.fillRect(0, bar[1] + off, cw, Math.max(1, lw * 0.35));
  } });

/* ---- slanted wipe: an accent band runs ahead of the new cut ---- */
trReg('diagonalWipe', { name: '斜め帯ワイプ', tags: ['pop', 'graphic'], w: 1, dur: 0.35,
  plan: rng => ({ k: rng.range(0.3, 0.55) * (rng.chance(0.5) ? 1 : -1), rev: rng.chance(0.4) }),
  draw(ctx, A, B, p, I, P) {
    const { cw, ch } = I, e = E.inOutCubic(p), sl = P.k * ch, band = minD(I) * 0.07 * bell(p);
    const span = cw + Math.abs(sl) + band * 2 + 4;
    let X = -Math.abs(sl) / 2 - band - 2 + span * e;                  // the boundary (B side = left of it)
    const poly = (x0, x1) => { ctx.beginPath(); ctx.moveTo(x0 - sl / 2, 0); ctx.lineTo(x1 - sl / 2, 0); ctx.lineTo(x1 + sl / 2, ch); ctx.lineTo(x0 + sl / 2, ch); ctx.closePath(); };
    ctx.drawImage(A, 0, 0);
    if (P.rev) { ctx.translate(cw, 0); ctx.scale(-1, 1); }            // mirrored geometry (the images are drawn un-mirrored below)
    ctx.save(); poly(-cw * 2, X); ctx.clip();
    if (P.rev) { ctx.translate(cw, 0); ctx.scale(-1, 1); }
    ctx.drawImage(B, 0, 0); ctx.restore();
    if (band > 0.5) {
      ctx.fillStyle = tAcc(I); poly(X, X + band); ctx.fill();
      ctx.fillStyle = tAcc(I, true); ctx.globalAlpha = 0.85; poly(X + band * 1.35, X + band * 1.6); ctx.fill();
    }
  } });

/* ---- clock wipe: a radial sweep from 12 o'clock ---- */
trReg('clockWipe', { name: 'クロックワイプ', tags: ['graphic', 'pop', 'editorial'], w: 0.7, dur: 0.45,
  plan: rng => ({ dir: rng.chance(0.7) ? 1 : -1, a0: rng.pick([-90, -90, 0, 180]) }),
  draw(ctx, A, B, p, I, P) {
    const { cw, ch } = I, e = E.inOutCubic(p), cx = cw / 2, cy = ch / 2, R = Math.hypot(cw, ch) / 2 + 4;
    const a0 = P.a0 * DEG, a1 = a0 + e * TAU * P.dir;
    ctx.drawImage(A, 0, 0);
    ctx.save(); ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, R, a0, a1, P.dir < 0); ctx.closePath(); ctx.clip(); ctx.drawImage(B, 0, 0); ctx.restore();
    const a = Math.pow(bell(p), 0.5), lw = lwOf(I, 0.006);
    ctx.globalAlpha = a; ctx.strokeStyle = tAcc(I); ctx.lineWidth = lw; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R); ctx.stroke();
    ctx.fillStyle = tAcc(I); ctx.beginPath(); ctx.arc(cx, cy, lw * 2.2, 0, TAU); ctx.fill();
  } });

/* ---- iris: a circle opens on the new cut, rimmed with two accent rings ---- */
trReg('irisOpen', { name: 'アイリスイン', tags: ['emotional', 'pop', 'editorial'], w: 0.8, dur: 0.4,
  plan: rng => ({ x: 0.5 + rng.range(-0.12, 0.12), y: 0.5 + rng.range(-0.1, 0.1) }),
  draw(ctx, A, B, p, I, P) {
    const { cw, ch } = I, cx = cw * P.x, cy = ch * P.y, e = E.inOutCubic(p);
    const R = Math.hypot(Math.max(cx, cw - cx), Math.max(cy, ch - cy)) + 4, r = R * e;
    ctx.drawImage(A, 0, 0);
    if (r > 0.5) { ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.clip(); ctx.drawImage(B, 0, 0); ctx.restore(); }
    const a = Math.pow(bell(p), 0.6), lw = lwOf(I, 0.009);
    ctx.globalAlpha = a; ctx.strokeStyle = tAcc(I); ctx.lineWidth = lw;
    ctx.beginPath(); ctx.arc(cx, cy, r + lw / 2, 0, TAU); ctx.stroke();
    ctx.globalAlpha = a * 0.6; ctx.strokeStyle = tAcc(I, true); ctx.lineWidth = lw * 0.4;
    ctx.beginPath(); ctx.arc(cx, cy, r * 1.06 + lw * 2.5, 0, TAU); ctx.stroke();
  } });

/* ---- push: the new cut shoves the old one out ---- */
trReg('pushSlide', { name: 'プッシュ', tags: ['graphic', 'pop', 'editorial'], w: 1, dur: 0.35,
  plan: rng => ({ dir: dirPick(rng, ['L', 'R', 'U', 'D'], [3, 1.6, 1.4, 0.6]) }),
  draw(ctx, A, B, p, I, P) {
    const { cw, ch } = I, e = E.inOutCubic(p), h = P.dir === 'L' || P.dir === 'R';
    const L = h ? cw : ch, sg = P.dir === 'L' || P.dir === 'U' ? -1 : 1, off = Math.round(e * L) * sg;
    if (h) { ctx.drawImage(A, off, 0); ctx.drawImage(B, off - sg * cw, 0); } else { ctx.drawImage(A, 0, off); ctx.drawImage(B, 0, off - sg * ch); }
    const lw = lwOf(I, 0.005), q = h ? (sg < 0 ? cw + off : off) : (sg < 0 ? ch + off : off);
    ctx.globalAlpha = Math.pow(bell(p), 0.6); ctx.fillStyle = tAcc(I);
    if (h) ctx.fillRect(q - lw / 2, 0, lw, ch); else ctx.fillRect(0, q - lw / 2, cw, lw);
  } });

/* ---- cover: the new cut slides in over the old one, which dims and drifts back ---- */
trReg('cover', { name: 'カバー', tags: ['editorial', 'graphic', 'calm'], w: 0.9, dur: 0.35,
  plan: rng => ({ dir: dirPick(rng, ['L', 'R', 'U', 'D'], [2, 2, 1.5, 1]) }),
  draw(ctx, A, B, p, I, P) {
    const { cw, ch } = I, e = E.inOutCubic(p), h = P.dir === 'L' || P.dir === 'R', sg = P.dir === 'L' || P.dir === 'U' ? -1 : 1;
    const L = h ? cw : ch, bo = Math.round((1 - e) * L) * -sg, ao = Math.round(e * L * 0.18) * sg;
    if (h) ctx.drawImage(A, ao, 0); else ctx.drawImage(A, 0, ao);
    ctx.fillStyle = '#000000'; ctx.globalAlpha = 0.45 * e; ctx.fillRect(0, 0, cw, ch); ctx.globalAlpha = 1;
    // soft shadow ahead of the incoming edge
    const sw = minD(I) * 0.06, edge = (h ? (sg > 0 ? cw + bo : bo) : (sg > 0 ? ch + bo : bo));
    const g = h ? ctx.createLinearGradient(edge, 0, edge + sg * sw, 0) : ctx.createLinearGradient(0, edge, 0, edge + sg * sw);
    g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.globalAlpha = bell(p);
    if (h) ctx.fillRect(sg > 0 ? edge : edge - sw, 0, sw, ch); else ctx.fillRect(0, sg > 0 ? edge : edge - sw, cw, sw);
    ctx.globalAlpha = 1;
    if (h) ctx.drawImage(B, bo, 0); else ctx.drawImage(B, 0, bo);
  } });

/* ---- uncover: the old cut slides away and uncovers the new one waiting underneath ---- */
trReg('uncover', { name: 'アンカバー', tags: ['editorial', 'calm', 'emotional'], w: 0.8, dur: 0.35,
  plan: rng => ({ dir: dirPick(rng, ['L', 'R', 'U', 'D'], [2, 2, 1.6, 1]) }),
  draw(ctx, A, B, p, I, P) {
    const { cw, ch } = I, e = E.inOutCubic(p), h = P.dir === 'L' || P.dir === 'R', sg = P.dir === 'L' || P.dir === 'U' ? -1 : 1;
    const s = 1.05 - 0.05 * E.outCubic(p);
    ctx.fillStyle = I.sc.bg; ctx.fillRect(0, 0, cw, ch);
    scaled(ctx, B, cw, ch, s);
    ctx.fillStyle = '#000000'; ctx.globalAlpha = 0.4 * (1 - e); ctx.fillRect(0, 0, cw, ch); ctx.globalAlpha = 1;
    const L = h ? cw : ch, ao = Math.round(e * L) * sg, edge = h ? (sg > 0 ? ao : cw + ao) : (sg > 0 ? ao : ch + ao), sw = minD(I) * 0.07;
    const g = h ? ctx.createLinearGradient(edge, 0, edge - sg * sw, 0) : ctx.createLinearGradient(0, edge, 0, edge - sg * sw);
    g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.globalAlpha = bell(p);
    if (h) ctx.fillRect(sg > 0 ? edge - sw : edge, 0, sw, ch); else ctx.fillRect(0, sg > 0 ? edge - sw : edge, cw, sw);
    ctx.globalAlpha = 1;
    if (h) ctx.drawImage(A, ao, 0); else ctx.drawImage(A, 0, ao);
  } });

/* ---- zoom through: the old cut rushes past the camera while the new one settles in ---- */
trReg('zoomThrough', { name: 'ズームスルー', tags: ['pop', 'emotional', 'glitch'], w: 1, dur: 0.35,
  plan: rng => ({ z: rng.range(1.5, 2.2) }),
  draw(ctx, A, B, p, I, P) {
    const { cw, ch } = I, sa = 1 + (P.z - 1) * Math.pow(p, 1.4), aa = 1 - E.inCubic(clamp(p * 1.12)), sb = 0.86 + 0.14 * E.outCubic(p);
    ctx.fillStyle = I.sc.bg; ctx.fillRect(0, 0, cw, ch);
    scaled(ctx, B, cw, ch, sb);
    if (aa > 0.003) {
      ctx.globalAlpha = aa; scaled(ctx, A, cw, ch, sa);
      if (I.allowFilter && p > 0.08 && aa > 0.15) { ctx.globalAlpha = aa * 0.35; scaled(ctx, A, cw, ch, sa * (1 + 0.08 * p)); }
    }
  } });

/* ---- doors: the old cut splits down the middle and swings open ---- */
trReg('doorsOpen', { name: '観音開き', tags: ['graphic', 'pop', 'emotional'], w: 0.7, dur: 0.4,
  plan: rng => ({ vert: rng.chance(0.3) }),
  draw(ctx, A, B, p, I, P) {
    const { cw, ch } = I, e = E.inOutCubic(p), lw = lwOf(I, 0.005), ac = tAcc(I);
    const sb = 0.93 + 0.07 * E.outCubic(p);
    ctx.fillStyle = I.sc.bg; ctx.fillRect(0, 0, cw, ch);
    scaled(ctx, B, cw, ch, sb);
    ctx.fillStyle = '#000000'; ctx.globalAlpha = 0.35 * (1 - e); ctx.fillRect(0, 0, cw, ch); ctx.globalAlpha = 1;
    const a = Math.pow(bell(p), 0.5);
    if (!P.vert) {
      const hw = Math.floor(cw / 2), off = Math.round(e * (cw - hw + lw * 2));
      part(ctx, A, 0, 0, hw, ch, -off, 0); part(ctx, A, hw, 0, cw - hw, ch, off, 0);
      ctx.globalAlpha = a; ctx.fillStyle = ac; ctx.fillRect(hw - off - lw, 0, lw, ch); ctx.fillRect(hw + off, 0, lw, ch);
    } else {
      const hh = Math.floor(ch / 2), off = Math.round(e * (ch - hh + lw * 2));
      part(ctx, A, 0, 0, cw, hh, 0, -off); part(ctx, A, 0, hh, cw, ch - hh, 0, off);
      ctx.globalAlpha = a; ctx.fillStyle = ac; ctx.fillRect(0, hh - off - lw, cw, lw); ctx.fillRect(0, hh + off, cw, lw);
    }
  } });

/* ---- blinds: slats flip over one after another ---- */
trReg('blinds', { name: 'ブラインド転換', tags: ['graphic', 'editorial', 'calm'], w: 0.7, dur: 0.4,
  plan: rng => ({ n: rng.int(7, 12), vert: rng.chance(0.35), rev: rng.chance(0.4) }),
  draw(ctx, A, B, p, I, P) {
    const { cw, ch } = I, n = P.n, L = P.vert ? cw : ch, lw = Math.max(1, lwOf(I, 0.003)), ac = tAcc(I);
    ctx.drawImage(A, 0, 0);
    ctx.fillStyle = ac;
    for (let i = 0; i < n; i++) {
      const k = P.rev ? n - 1 - i : i;
      const q = E.inOutCubic(clamp(p * 1.55 - k / n * 0.55)), a0 = Math.round(i * L / n), a1 = Math.round((i + 1) * L / n);
      if (q <= 0) continue;
      const len = q >= 1 ? a1 - a0 : (a1 - a0) * q;
      if (P.vert) part(ctx, B, a0, 0, len, ch); else part(ctx, B, 0, a0, cw, len);
      if (q < 1) { ctx.globalAlpha = 1 - q; if (P.vert) ctx.fillRect(a0 + len, 0, lw, ch); else ctx.fillRect(0, a0 + len, cw, lw); ctx.globalAlpha = 1; }
    }
  } });

/* ---- checker: squares open in two chequered waves ---- */
trReg('checker', { name: '市松転換', tags: ['pop', 'graphic'], w: 0.6, dur: 0.45,
  plan: rng => ({ n: rng.int(4, 6), rev: rng.chance(0.5) }),
  draw(ctx, A, B, p, I, P) {
    const { cw, ch } = I, cell = minD(I) / P.n, cols = Math.ceil(cw / cell), rows = Math.ceil(ch / cell);
    ctx.drawImage(A, 0, 0);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const d = ((i + j) % 2) * 0.32 + 0.18 * ((P.rev ? cols - 1 - i : i) + j) / Math.max(1, cols + rows - 2);
      const t = clamp((p - d) / 0.5);
      if (t <= 0) continue;
      const x0 = Math.round(i * cw / cols), x1 = Math.round((i + 1) * cw / cols), y0 = Math.round(j * ch / rows), y1 = Math.round((j + 1) * ch / rows);
      if (t >= 1) { part(ctx, B, x0, y0, x1 - x0, y1 - y0); continue; }
      const q = E.outCubic(t);
      if (q > 0.97) { part(ctx, B, x0, y0, x1 - x0, y1 - y0); continue; }
      const w = (x1 - x0) * q, h = (y1 - y0) * q;
      part(ctx, B, (x0 + x1) / 2 - w / 2, (y0 + y1) / 2 - h / 2, w, h);
    }
  } });

/* ---- block dissolve: random blocks flip to the new cut, each with a short accent flash ---- */
trReg('blockDissolve', { name: 'ブロック崩し', tags: ['glitch', 'graphic'], w: 0.8, dur: 0.4,
  plan: rng => ({ n: rng.int(7, 11), side: rng.pick([0, 0, 1, 2]) }),
  draw(ctx, A, B, p, I, P) {
    const { cw, ch } = I, cell = minD(I) / P.n, cols = Math.ceil(cw / cell), rows = Math.ceil(ch / cell), s0 = I.seed | 0, ac = tAcc(I);
    ctx.drawImage(A, 0, 0);
    ctx.fillStyle = ac;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const bias = P.side === 1 ? i / Math.max(1, cols - 1) : P.side === 2 ? j / Math.max(1, rows - 1) : 0.5;
      const r = 0.02 + 0.84 * (P.side ? 0.55 * J.r(s0, i, j, 5) + 0.45 * bias : J.r(s0, i, j, 5));
      if (p < r) continue;
      const x0 = Math.round(i * cw / cols), x1 = Math.round((i + 1) * cw / cols), y0 = Math.round(j * ch / rows), y1 = Math.round((j + 1) * ch / rows);
      part(ctx, B, x0, y0, x1 - x0, y1 - y0);
      const f = 1 - (p - r) / 0.1;
      if (f > 0) { ctx.globalAlpha = f * 0.75; ctx.fillRect(x0, y0, x1 - x0, y1 - y0); ctx.globalAlpha = 1; }
    }
  } });

/* ---- whip pan: both frames rush sideways, smeared by motion blur ---- */
trReg('whipPan', { name: 'ホイップパン', tags: ['pop', 'emotional', 'glitch'], w: 1, dur: 0.3,
  plan: rng => ({ dir: rng.chance(0.65) ? -1 : 1, vert: rng.chance(0.2) }),
  draw(ctx, A, B, p, I, P) {
    const { cw, ch } = I, e = ioQuart(p), L = P.vert ? ch : cw, off = e * L * P.dir;
    const blur = L * 0.13 * Math.pow(bell(p), 2);
    const put = (x2, C, o, k) => { if (P.vert) x2.drawImage(C, 0, (o) * k, cw * k, ch * k); else x2.drawImage(C, (o) * k, 0, cw * k, ch * k); };
    if (blur < 3) { ctx.fillStyle = I.sc.bg; ctx.fillRect(0, 0, cw, ch); put(ctx, A, off, 1); put(ctx, B, off - L * P.dir, 1); return; }
    const k = 1 / 3, w = Math.max(2, Math.round(cw * k)), h = Math.max(2, Math.round(ch * k)), T = I.tmp(w, h), x = T.getContext('2d');
    x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.filter = 'none';
    x.fillStyle = I.sc.bg; x.fillRect(0, 0, w, h);
    const n = I.allowFilter ? 12 : 6;                                   // fewer taps in the fast preview
    for (let i = 0; i < n; i++) { const o = (i / (n - 1) - 0.5) * blur; x.globalAlpha = 1 / (i + 1); put(x, A, off + o, k); put(x, B, off - L * P.dir + o, k); }
    x.restore();
    ctx.imageSmoothingEnabled = true; ctx.drawImage(T, 0, 0, w, h, 0, 0, cw, ch);
  } });

/* ---- spin out: the old cut spins away into the distance, revealing the new one ---- */
trReg('spinOut', { name: '回転アウト', tags: ['pop', 'glitch'], w: 0.6, dur: 0.45,
  plan: rng => ({ rot: rng.range(100, 200) * (rng.chance(0.5) ? 1 : -1) }),
  draw(ctx, A, B, p, I, P) {
    const { cw, ch } = I, e = E.inCubic(p), s = 1 - e, sb = 1.08 - 0.08 * E.outCubic(p);
    ctx.fillStyle = I.sc.bg; ctx.fillRect(0, 0, cw, ch);
    scaled(ctx, B, cw, ch, sb);
    ctx.fillStyle = '#000000'; ctx.globalAlpha = 0.4 * (1 - E.outCubic(p)); ctx.fillRect(0, 0, cw, ch); ctx.globalAlpha = 1;
    if (s < 0.004) return;
    ctx.translate(cw / 2, ch / 2); ctx.rotate(P.rot * e * DEG); ctx.scale(s, s);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-cw / 2 + minD(I) * 0.02, -ch / 2 + minD(I) * 0.03, cw, ch);
    ctx.drawImage(A, -cw / 2, -ch / 2);
    const lw = lwOf(I, 0.008) / s;
    ctx.globalAlpha = Math.min(1, p * 6); ctx.strokeStyle = tAcc(I); ctx.lineWidth = lw; ctx.strokeRect(-cw / 2 + lw / 2, -ch / 2 + lw / 2, cw - lw, ch - lw);
  } });

/* ---- ink blob: an organic splash spreads from a point, rimmed in accent ink ---- */
const blobPath = (ctx, cx, cy, r, s0, ph, n = 56) => {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU;
    const w = 1 + 0.13 * Math.sin(a * 3 + J.r(s0, 1) * 6 + ph) + 0.08 * Math.sin(a * 5 + J.r(s0, 2) * 6 - ph * 1.3) + 0.05 * Math.sin(a * 9 + J.r(s0, 3) * 6 + ph * 0.7);
    pts.push([cx + Math.cos(a) * r * w, cy + Math.sin(a) * r * w]);
  }
  ctx.beginPath();
  const mid = i => [(pts[i % n][0] + pts[(i + 1) % n][0]) / 2, (pts[i % n][1] + pts[(i + 1) % n][1]) / 2];
  const m0 = mid(0); ctx.moveTo(m0[0], m0[1]);
  for (let i = 1; i <= n; i++) { const q = pts[i % n], m = mid(i); ctx.quadraticCurveTo(q[0], q[1], m[0], m[1]); }
  ctx.closePath();
};
trReg('inkBlob', { name: 'インク', tags: ['emotional', 'calm', 'pop'], w: 0.7, dur: 0.5,
  plan: rng => ({ x: rng.pick([0.5, 0.5, 0.15, 0.85]) + rng.range(-0.08, 0.08), y: rng.pick([0.5, 0.25, 0.8]) + rng.range(-0.06, 0.06) }),
  draw(ctx, A, B, p, I, P) {
    const { cw, ch } = I, cx = cw * P.x, cy = ch * P.y, s0 = I.seed | 0;
    const R = Math.hypot(Math.max(cx, cw - cx), Math.max(cy, ch - cy)) * 1.36, e = E.inOutSine(p), r = R * e, ph = p * 2.4;
    ctx.drawImage(A, 0, 0);
    const rimA = 1 - J.smooth(0.75, 0.98, p), rim = minD(I) * 0.035 * (0.4 + e);
    if (rimA > 0.01) {
      ctx.globalAlpha = rimA; ctx.fillStyle = tAcc(I);
      blobPath(ctx, cx, cy, r + rim, s0, ph); ctx.fill();
      for (let k = 0; k < 6; k++) {                                     // droplets ahead of the splash
        const a = J.r(s0, k, 7) * TAU, d = r * (1.12 + 0.3 * J.r(s0, k, 8)) + rim, rr = minD(I) * (0.008 + 0.02 * J.r(s0, k, 9)) * clamp(p * 4);
        ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, rr, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    if (r > 0.5) { ctx.save(); blobPath(ctx, cx, cy, r, s0, ph); ctx.clip(); ctx.drawImage(B, 0, 0); ctx.restore(); }
  } });

/* ---- shatter: the old cut breaks into tiles that tumble down ---- */
trReg('shatterTiles', { name: 'タイル崩落', tags: ['glitch', 'pop', 'emotional'], w: 0.6, dur: 0.5,
  plan: rng => ({ n: rng.int(6, 9), x: rng.range(0.3, 0.7), y: rng.range(0.3, 0.6) }),
  draw(ctx, A, B, p, I, P) {
    const { cw, ch } = I, cell = Math.max(cw, ch) / P.n, cols = Math.ceil(cw / cell), rows = Math.ceil(ch / cell), s0 = I.seed | 0;
    ctx.drawImage(B, 0, 0);
    ctx.fillStyle = '#000000'; ctx.globalAlpha = 0.3 * (1 - E.outCubic(p)); ctx.fillRect(0, 0, cw, ch); ctx.globalAlpha = 1;
    const cx = cw * P.x, cy = ch * P.y, D = Math.hypot(cw, ch);
    const moving = [];
    ctx.save(); ctx.beginPath(); let any = false;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const x0 = Math.round(i * cw / cols), x1 = Math.round((i + 1) * cw / cols), y0 = Math.round(j * ch / rows), y1 = Math.round((j + 1) * ch / rows);
      const d = 0.5 * Math.hypot((x0 + x1) / 2 - cx, (y0 + y1) / 2 - cy) / D * 1.4 + 0.08 * J.r(s0, i, j, 3);
      const t = clamp((p - Math.min(0.55, d)) / 0.45);
      if (t <= 0) { ctx.rect(x0, y0, x1 - x0, y1 - y0); any = true; } else moving.push({ x0, y0, x1, y1, t, i, j });
    }
    if (any) { ctx.clip(); ctx.drawImage(A, 0, 0); }
    ctx.restore();
    const lw = Math.max(1, lwOf(I, 0.002));
    for (const m of moving) {
      const { x0, y0, x1, y1, t, i, j } = m, w = x1 - x0, h = y1 - y0, a = 1 - J.smooth(0.7, 1, t);
      if (a <= 0.003) continue;
      const dx = J.rs(s0, i, j, 4) * cw * 0.12 * t, dy = (t * t * 1.25 - J.r(s0, i, j, 6) * 0.08 * t) * ch, rot = J.rs(s0, i, j, 5) * 70 * t, s = 1 - 0.25 * t;
      ctx.save(); ctx.globalAlpha = a; ctx.translate(x0 + w / 2 + dx, y0 + h / 2 + dy); ctx.rotate(rot * DEG); ctx.scale(s, s);
      ctx.drawImage(A, x0, y0, w, h, -w / 2, -h / 2, w, h);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = lw; ctx.strokeRect(-w / 2, -h / 2, w, h);
      ctx.restore();
    }
  } });

/* ---- slice shift: horizontal strips slide in alternate directions, trading the old cut for the new ---- */
trReg('sliceShift', { name: '短冊ずらし', tags: ['glitch', 'graphic', 'pop'], w: 0.8, dur: 0.35,
  plan: rng => ({ n: rng.int(5, 9), vert: rng.chance(0.25) }),
  draw(ctx, A, B, p, I, P) {
    const { cw, ch } = I, n = P.n, L = P.vert ? cw : ch, M = P.vert ? ch : cw, lw = Math.max(1, lwOf(I, 0.003)), ac = tAcc(I);
    for (let i = 0; i < n; i++) {
      const a0 = Math.round(i * L / n), a1 = Math.round((i + 1) * L / n), sg = i % 2 ? 1 : -1;
      const t = E.inOutCubic(clamp((p - (i / Math.max(1, n - 1)) * 0.3) / 0.7)), o = Math.round(t * M) * sg;
      if (P.vert) { part(ctx, A, a0, 0, a1 - a0, ch, 0, o); part(ctx, B, a0, 0, a1 - a0, ch, 0, o - sg * ch); }
      else { part(ctx, A, 0, a0, cw, a1 - a0, o, 0); part(ctx, B, 0, a0, cw, a1 - a0, o - sg * cw, 0); }
    }
    ctx.globalAlpha = Math.pow(bell(p), 0.7) * 0.9; ctx.fillStyle = ac;
    for (let i = 1; i < n; i++) { const a = Math.round(i * L / n); if (P.vert) ctx.fillRect(a - lw / 2, 0, lw, ch); else ctx.fillRect(0, a - lw / 2, cw, lw); }
  } });

/* ---- cube turn: faux-3D rotation — the old cut turns away as the next face comes round ---- */
trReg('cubeTurn', { name: 'キューブ', tags: ['graphic', 'pop'], w: 0.6, dur: 0.45,
  plan: rng => ({ dir: rng.chance(0.6) ? 1 : -1 }),
  draw(ctx, A, B, p, I, P) {
    const { cw, ch } = I, phi = E.inOutCubic(p) * Math.PI / 2, D = 3.4, f = D - 1, cs = Math.cos(phi), sn = Math.sin(phi);
    const back = J.mix(J.mix((I.scPrev || I.sc).bg, I.sc.bg, p), '#000000', 0.55);
    ctx.fillStyle = back; ctx.fillRect(0, 0, cw, ch);
    // rotate (x, z) of the cube's vertical edges, project to screen x and half-height
    const prj = (x, z) => { const xr = (x * cs - z * sn) * P.dir, zr = x * sn + z * cs, k = f / (D - zr); return [cw / 2 + xr * k * cw / 2, k * ch / 2]; };
    const face = (C, e0, e1, shade) => {
      const N = I.allowFilter ? 28 : 14, q0 = prj(e0[0], e0[1]), q1 = prj(e1[0], e1[1]);
      if ((q1[0] - q0[0]) * P.dir <= 0.5) return;
      let prev = q0;
      for (let k = 1; k <= N; k++) {
        const u = k / N, q = prj(J.lerp(e0[0], e1[0], u), J.lerp(e0[1], e1[1], u));
        const xa = Math.min(prev[0], q[0]), xb = Math.max(prev[0], q[0]), hh = (prev[1] + q[1]) / 2;
        const su = P.dir > 0 ? (k - 1) / N : 1 - k / N;
        ctx.drawImage(C, su * cw, 0, cw / N, ch, Math.floor(xa), ch / 2 - hh, Math.ceil(xb) - Math.floor(xa) + 1, hh * 2);
        prev = q;
      }
      if (shade > 0.005) {
        ctx.fillStyle = '#000000'; ctx.globalAlpha = shade;
        ctx.beginPath(); ctx.moveTo(q0[0], ch / 2 - q0[1]); ctx.lineTo(q1[0], ch / 2 - q1[1]); ctx.lineTo(q1[0], ch / 2 + q1[1]); ctx.lineTo(q0[0], ch / 2 + q0[1]); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
      }
    };
    // A = front face (edges (-1,1)→(1,1)); B = side face (edges (1,1)→(1,-1)) — mirrored for dir < 0
    face(A, [-1, 1], [1, 1], 0.55 * (1 - cs));
    face(B, [1, 1], [1, -1], 0.55 * (1 - sn));
  } });

/* ---- flash cross: a quick flash of light carries the cut over ---- */
trReg('flashCross', { name: 'フラッシュ転換', tags: ['emotional', 'pop', 'calm'], w: 0.9, dur: 0.3,
  plan: rng => ({ c: rng.chance(0.3) ? 'accent' : 'white' }),
  draw(ctx, A, B, p, I, P) {
    const { cw, ch } = I, pb = (I.scPrev || I.sc).bg, light = J.lum(pb) > 0.62 && J.lum(I.sc.bg) > 0.62;
    const fl = P.c === 'accent' || light ? tAcc(I) : '#FFFFFF';
    const x = J.smooth(0.3, 0.62, p);
    ctx.drawImage(A, 0, 0);
    if (x > 0) { ctx.globalAlpha = x; ctx.drawImage(B, 0, 0); ctx.globalAlpha = 1; }
    const a = p < 0.45 ? E.inQuad(p / 0.45) : 1 - E.outCubic((p - 0.45) / 0.55);
    if (a > 0.003) { ctx.globalAlpha = a * 0.92; ctx.fillStyle = fl; ctx.fillRect(0, 0, cw, ch); }
  } });

/* ---- pixelate: the old cut breaks down into big pixels, the new one resolves out of them ---- */
trReg('pixelate', { name: 'モザイク転換', tags: ['glitch', 'pop'], w: 0.6, dur: 0.4,
  plan: rng => ({ k: rng.range(11, 17) }),
  draw(ctx, A, B, p, I, P) {
    const { cw, ch } = I, maxB = minD(I) / P.k;
    const pix = (C, t, alpha) => {
      const bs = 1 + (maxB - 1) * t;
      if (alpha <= 0.003) return;
      ctx.globalAlpha = alpha;
      if (bs < 1.6) { ctx.drawImage(C, 0, 0); ctx.globalAlpha = 1; return; }
      const w = Math.max(1, Math.ceil(cw / bs)), h = Math.max(1, Math.ceil(ch / bs)), T = I.tmp(w, h), x = T.getContext('2d');
      x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'copy'; x.imageSmoothingEnabled = true;
      x.drawImage(C, 0, 0, w, h); x.globalCompositeOperation = 'source-over';
      ctx.imageSmoothingEnabled = false; ctx.drawImage(T, 0, 0, w, h, 0, 0, w * bs, h * bs); ctx.imageSmoothingEnabled = true;
      ctx.globalAlpha = 1;
    };
    const ta = E.inCubic(clamp(p / 0.55)), tb = E.inCubic(clamp((1 - p) / 0.55)), x = J.smooth(0.4, 0.6, p);
    pix(A, ta, 1);
    pix(B, tb, x);
  } });

})();

/* JIZURA pack: typo (part 1) — 文字PV typography layouts: key glyphs, crossings, rules, grids, scale contrast, crops, annotation */
(() => {
'use strict';
const E = J.E;
const P = 'typo';
const SET = 'typo';
const reg = (key, def) => J.register('layout', key, Object.assign({ set: SET }, def), P);

/* ------------------------------------------------------------------ helpers */
const clean = t => String(t || '').replace(/\s+/g, '');
/* glyph slots keeping single word gaps (latin lyrics) */
const slotsOf = t => [...String(t || '').trim().replace(/[\s　]+/g, ' ')];
const isSp = c => c === ' ' || c === '　';
const fontsOf = (st, roles) => J.fontsOf(st, roles);
const monoF = env => (env.st.fonts.mono && env.st.fonts.mono[0]) || 'mono';
const bodyF = env => (env.st.fonts.body && env.st.fonts.body[0]) || 'gothic_med';
const inE = (env, d = 0.35, delay = 0) => E.outExpo(J.clamp((env.lt - delay) / d));
const outK = env => 1 - E.inCubic(env.pOut);
const pad2 = n => String(n).padStart(2, '0');
const hair = env => Math.max(1, Math.min(env.W, env.H) * 0.0014);
const bbRect = (x0, y0, x1, y1) => ({ x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, boxes: [] });
const U = J.unionBB;
const romaOf = t => { const c = clean(t); if (!/[ぁ-ヿ]/.test(c)) return null; const r = J.romaji(c); return r ? r.toUpperCase() : null; };
/* J.splitLines, but never leave a line of punctuation only */
const splitL = (t, per) => {
  const ls = J.splitLines(t, Math.max(1, per)).split('\n');
  const out = [];
  for (const l of ls) { if (out.length && [...l].every(c => J.isPunct(c) || c === ' ')) out[out.length - 1] += l; else out.push(l); }
  return out.join('\n');
};
/* main-text lines for a width budget: portrait → short lines */
const mainLines = (text, W, H, perL = 11, perP = 5) => {
  const t = String(text || '').trim(), n = J.glyphCount(t);
  const per = W < H ? perP : perL;
  if (n <= per) return t;
  return splitL(t, Math.ceil(n / Math.ceil(n / per)));
};
/* glyph centres of a laid-out text item (design space, before rotation) */
const glyphPts = (it) => {
  const lay = J.layoutText(it), sx = it.sx || 1, sy = it.sy || 1, out = [];
  for (const g of lay) { if (isSp(g.ch)) continue; out.push({ ch: g.ch, x: it.x + g.x * sx, y: it.y + g.y * sy, w: g.w * sx, h: g.h * sy, li: g.li, ci: g.ci, i: out.length }); }
  return out;
};
/* index of the "key" glyph: first kanji of the longest kanji run, else the first plain glyph */
const keyIndex = (arr, mode) => {
  const ok = c => c && !isSp(c) && !J.isPunct(c) && !J.isSmallKana(c);
  if (mode === 'mid') {
    const mid = Math.floor((arr.length - 1) / 2);
    for (let d = 0; d < arr.length; d++) { if (ok(arr[mid + d])) return mid + d; if (ok(arr[mid - d])) return mid - d; }
  }
  let best = -1, bl = 0;
  for (let i = 0; i < arr.length; i++) {
    if (!J.isKanji(arr[i])) continue;
    let j = i; while (j < arr.length && J.isKanji(arr[j])) j++;
    if (j - i > bl) { bl = j - i; best = i; }
    i = j;
  }
  if (best >= 0) return best;
  for (let i = 0; i < arr.length; i++) if (ok(arr[i])) return i;
  return 0;
};
/* best-contrast scheme colour for text on a plate */
const onCol = (sc, fill) => {
  let best = null, bv = 0;
  for (const c of [sc.bg, sc.fg, sc.ink, sc.accent, sc.sub]) { if (!c || c === fill) continue; const k = J.contrast(c, fill); if (k > bv) { bv = k; best = c; } }
  return bv >= 2.4 ? best : (J.lum(fill) > 0.5 ? '#111111' : '#FFFFFF');
};
const plateCol = (sc, pref) => { for (const c of pref) if (c && J.contrast(c, sc.bg) >= 1.6) return c; return sc.fg; };
const accentOn = (sc) => (J.contrast(sc.accent, sc.bg) >= 1.8 ? sc.accent : sc.fg);
/* small annotation label (main pass only) */
const label = (env, text, x, y, o = {}) => env.draw(Object.assign({ text: String(text), font: o.font || monoF(env), size: o.size || J.clamp(Math.min(env.W, env.H) * 0.018, 11, 22), x, y, align: o.align || 'left', track: o.track ?? 0.12, color: o.color || env.sc.sub, alpha: o.alpha ?? 1, ghost: false }, o.extra || {}));
const isLatinT = t => /[A-Za-z]/.test(t) && !/[\u3040-\u30ff\u3400-\u9fff\uff00-\uffef]/.test(t);
const labelSize = env => J.clamp(Math.min(env.W, env.H) * 0.018, 11, 22);

/* ================================================================== 1 tyKeySplit — 大字挟み */
reg('tyKeySplit', {
  name: '大字挟み', tags: ['editorial', 'graphic', 'emotional'], ae: 'mixed', w: 1.1, emph: 1.4, fits: n => n >= 2 && n <= 16,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display', 'serif'])), fs: rng.pick(fontsOf(st, ['serif', 'body', 'display'])), mode: rng.pick(['kanji', 'kanji', 'mid']), big: rng.pick(['fill', 'fill', 'accent', 'outline']), rule: rng.chance(0.75) };
  },
  render(env) {
    const { W, H, sc } = env, cut = env.cut, Pm = cut.params, lt = env.lt, M = Math.min(W, H);
    const port = W < H;
    const arr = slotsOf(cut.text);
    let ki = keyIndex(arr, Pm.mode), key = arr[ki] || '?';
    let before = arr.slice(0, ki).join('').trim(), after = arr.slice(ki + 1).join('').trim();
    if (isLatinT(cut.text)) {             // latin: the longest word is the key
      const ws = String(cut.text).trim().split(/\s+/);
      let wi = 0; ws.forEach((w, i) => { if (w.length > ws[wi].length) wi = i; });
      key = ws[wi]; before = ws.slice(0, wi).join(' '); after = ws.slice(wi + 1).join(' ');
      ki = ws.slice(0, wi).join(' ').length + (wi ? 1 : 0);
    }
    let bigS = port ? Math.min(W * 0.66, H * 0.36) : Math.min(H * 0.64, W * 0.34);
    bigS = Math.min(bigS, J.fitSize(key, Pm.font, port ? W * 0.84 : W * 0.5, 1e6));
    const bw = J.measure({ text: key, font: Pm.font, size: bigS }).w;
    const gap = bigS * 0.12;
    const per = port ? 6 : 5;
    const bt = before ? splitL(before, per) : '', at = after ? splitL(after, per) : '';
    const o = { track: 0.04, lead: 1.2 };
    let ss;
    if (port) {
      const avail = (H * 0.86 - bigS) / 2 - gap;
      ss = Math.min(bt ? J.fitSize(bt, Pm.fs, W * 0.84, avail, o) : 1e9, at ? J.fitSize(at, Pm.fs, W * 0.84, avail, o) : 1e9, bigS * 0.3);
    } else {
      const side = (W * 0.9 - bw - gap * 2) / ((bt ? 1 : 0) + (at ? 1 : 0) || 1);
      ss = Math.min(bt ? J.fitSize(bt, Pm.fs, side, bigS * 0.62, o) : 1e9, at ? J.fitSize(at, Pm.fs, side, bigS * 0.62, o) : 1e9, bigS * 0.3);
    }
    const mB = bt ? J.measure(Object.assign({ text: bt, font: Pm.fs, size: ss }, o)) : { w: 0, h: 0 };
    const mA = at ? J.measure(Object.assign({ text: at, font: Pm.fs, size: ss }, o)) : { w: 0, h: 0 };
    let bx, by, itB = null, itA = null;
    const bigTop = () => by - bigS * 0.46, bigBot = () => by + bigS * 0.46;
    if (!port) {
      const tot = (bt ? mB.w + gap : 0) + bw + (at ? mA.w + gap : 0);
      const x0 = W / 2 - tot / 2;
      bx = x0 + (bt ? mB.w + gap : 0) + bw / 2; by = H / 2;
      if (bt) itB = Object.assign({ text: bt, font: Pm.fs, size: ss, align: 'right', x: bx - bw / 2 - gap, y: bigTop() + mB.h / 2, color: sc.fg, mi: 0 }, o);
      if (at) itA = Object.assign({ text: at, font: Pm.fs, size: ss, align: 'left', x: bx + bw / 2 + gap, y: bigBot() - mA.h / 2, color: sc.fg, mi: 4 }, o);
    } else {
      const tot = (bt ? mB.h + gap : 0) + bigS + (at ? mA.h + gap : 0);
      const y0 = H / 2 - tot / 2;
      bx = W / 2; by = y0 + (bt ? mB.h + gap : 0) + bigS / 2;
      const L = W / 2 - Math.max(bw, mB.w, mA.w) / 2, R = W / 2 + Math.max(bw, mB.w, mA.w) / 2;
      if (bt) itB = Object.assign({ text: bt, font: Pm.fs, size: ss, align: 'left', x: Math.max(W * 0.08, Math.min(L, bx - bw / 2)), y: by - bigS / 2 - gap - mB.h / 2, color: sc.fg, mi: 0 }, o);
      if (at) itA = Object.assign({ text: at, font: Pm.fs, size: ss, align: 'right', x: Math.min(W * 0.92, Math.max(R, bx + bw / 2)), y: by + bigS / 2 + gap + mA.h / 2, color: sc.fg, mi: 4 }, o);
    }
    const out = outK(env), lw = hair(env);
    // hairlines linking the small blocks to the key glyph
    if (Pm.rule) {
      const e = E.outCubic(J.clamp((lt - 0.2) / 0.6)) * out;
      if (e > 0 && itB) {
        const y = port ? itB.y + mB.h / 2 + gap * 0.5 : itB.y + mB.h / 2 + ss * 0.35;
        const xa = port ? itB.x : itB.x - mB.w, xb = port ? itB.x + Math.max(mB.w, bw) : bx + bw * 0.5;
        env.line([[xa, y], [J.lerp(xa, xb, e), y]], sc.sub, lw, 0.7, false);
      }
      if (e > 0 && itA) {
        const y = port ? itA.y - mA.h / 2 - gap * 0.5 : itA.y - mA.h / 2 - ss * 0.35;
        const xb = port ? itA.x : itA.x + mA.w, xa = port ? itA.x - Math.max(mA.w, bw) : bx - bw * 0.5;
        env.line([[xb, y], [J.lerp(xb, xa, e), y]], sc.sub, lw, 0.7, false);
      }
    }
    const big = { text: key, font: Pm.font, size: bigS, x: bx, y: by, color: Pm.big === 'accent' ? accentOn(sc) : sc.fg, mi: 2 };
    if (Pm.big === 'outline') Object.assign(big, { fill: false, stroke: Math.max(1.5, bigS * 0.014), strokeColor: sc.fg });
    let bb = J.mainDraw(env, big);
    if (itB) bb = U(bb, J.mainDraw(env, itB));
    if (itA) bb = U(bb, J.mainDraw(env, itA));
    const la = E.outCubic(J.clamp((lt - 0.3) / 0.3)) * out;
    const nG = arr.filter(c => !isSp(c)).length, kiG = arr.slice(0, ki).filter(c => !isSp(c)).length;
    if (la > 0) label(env, `${pad2(kiG + 1)} / ${pad2(nG)}`, port ? bx - bw / 2 : bx - bw / 2, by + bigS * 0.56, { alpha: la, size: labelSize(env) * 0.9 });
    return bb;
  },
});

/* ================================================================== 2 tyCropGiant — 見切れ大文字 */
reg('tyCropGiant', {
  name: '見切れ大文字', tags: ['graphic', 'editorial', 'pop'], ae: 'huge', w: 1, fits: n => n >= 1 && n <= 14,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display'])), fm: rng.pick(fontsOf(st, ['display', 'serif'])), edge: rng.pick(['a', 'b']), style: rng.pick(['dim', 'dim', 'outline']), dir: rng.pick([1, -1]) };
  },
  render(env) {
    const { W, H, sc } = env, cut = env.cut, Pm = cut.params, lt = env.lt;
    const port = W < H, txt = String(cut.text).trim();
    const u = J.clamp(lt / Math.max(0.5, cut.dur));
    const inG = E.outCubic(J.clamp(lt / 0.8)), outG = E.inCubic(env.pOut);
    const lowEdge = Pm.edge === 'a';        // landscape: bottom edge / portrait: right edge
    // the giant copy, cropped by the frame edge
    const gi = { text: port ? clean(txt) : txt, font: Pm.font, ghost: false, alpha: 1 };
    if (!port) {
      const G = H * 0.66;
      Object.assign(gi, { size: G, x: W / 2 + (0.5 - u) * W * 0.14 * Pm.dir, y: (lowEdge ? H + G * 0.03 : -G * 0.03) + (lowEdge ? 1 : -1) * ((1 - inG) + outG) * G * 0.45 });
    } else {
      const G = W * 0.62;
      Object.assign(gi, { size: G, vertical: true, x: (lowEdge ? W + G * 0.03 : -G * 0.03) + (lowEdge ? 1 : -1) * ((1 - inG) + outG) * G * 0.45, y: H / 2 + (0.5 - u) * H * 0.1 * Pm.dir });
    }
    if (Pm.style === 'outline') Object.assign(gi, { fill: false, stroke: Math.max(1.4, gi.size * 0.006), strokeColor: sc.sub, color: sc.sub, alpha: 0.65 });
    else gi.color = J.mix(sc.bg, sc.fg, 0.16);
    env.draw(gi);
    // the readable lyric on the free side
    const mt = mainLines(txt, W, H, 10, 6);
    const o = { lead: 1.18, track: 0.03 };
    let it;
    if (!port) {
      const size = Math.min(J.fitSize(mt, Pm.fm, W * 0.74, H * 0.34, o), H * 0.19);
      it = Object.assign({ text: mt, font: Pm.fm, size, align: 'left', x: W * 0.08, y: lowEdge ? H * 0.38 : H * 0.62, color: sc.fg }, o);
    } else {
      const size = Math.min(J.fitSize(mt, Pm.fm, W * 0.58, H * 0.5, o), W * 0.2);
      it = Object.assign({ text: mt, font: Pm.fm, size, align: lowEdge ? 'left' : 'right', x: lowEdge ? W * 0.08 : W * 0.92, y: H / 2, color: sc.fg }, o);
    }
    const bb = J.mainDraw(env, it);
    const m = J.measure(it);
    const la = E.outCubic(J.clamp((lt - 0.2) / 0.35)) * outK(env), ls = labelSize(env);
    if (la > 0) {
      const ty = it.y - m.h / 2 - ls * 1.6;
      const x0 = it.align === 'right' ? it.x - m.w : it.x;
      label(env, `No.${pad2((cut.line | 0) + 1)}`, x0, ty, { alpha: la, color: accentOn(sc) });
      env.line([[x0 + ls * 4, ty], [x0 + ls * 4 + Math.min(m.w, W * 0.3) * E.outExpo(J.clamp((lt - 0.25) / 0.5)), ty]], sc.sub, hair(env), 0.7 * la, false);
    }
    return bb;
  },
});

/* ================================================================== 3 tyCross — 十字組 */
reg('tyCross', {
  name: '十字組', tags: ['graphic', 'editorial'], ae: 'vcols', w: 0.9, fits: n => n >= 3 && n <= 11,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display', 'serif'])), mode: rng.pick(['kanji', 'mid', 'mid']), rules: rng.chance(0.8), key: rng.pick(['accent', 'accent', 'fg']) };
  },
  render(env) {
    const { W, H, sc } = env, cut = env.cut, Pm = cut.params, lt = env.lt, M = Math.min(W, H);
    const arr = slotsOf(cut.text), n = arr.length;
    if (!n) return null;
    const ki = keyIndex(arr, Pm.mode), tr = 0.08;
    const A = arr.slice(0, ki).join('').trim(), K = arr[ki], B = arr.slice(ki + 1).join('').trim();
    const w100 = s => (s ? J.measure({ text: s, font: Pm.font, size: 100, track: tr }).w : 0);
    const h100 = s => (s ? J.measure({ text: s, font: Pm.font, size: 100, track: tr, vertical: true }).h : 0);
    const kw = w100(K), g100 = 100 * tr + 6;
    const Lx = (A ? w100(A) + g100 : 0) + kw / 2, Rx = (B ? w100(B) + g100 : 0) + kw / 2;
    const Ty = (A ? h100(A) + g100 : 0) + 50, By = (B ? h100(B) + g100 : 0) + 50;
    const size = Math.min(W * 0.86 / ((Lx + Rx) / 100), H * 0.86 / ((Ty + By) / 100), M * 0.2);
    const k = size / 100;
    const cx = W / 2 - (Rx - Lx) * k / 2, cy = H / 2 - (By - Ty) * k / 2;
    const out = outK(env), lw = hair(env);
    if (Pm.rules) {
      const e = E.outExpo(J.clamp((lt - 0.1) / 0.7)) * out;
      if (e > 0) {
        env.line([[cx - W * e, cy], [cx + W * e, cy]], sc.sub, lw, 0.28, false);
        env.line([[cx, cy - H * e], [cx, cy + H * e]], sc.sub, lw, 0.28, false);
        env.circle(cx, cy, size * 0.78 * (0.6 + 0.4 * e), null, sc.sub, lw, 0.5 * e, false);
      }
    }
    const g = size * tr + 6 * k;
    const base = { font: Pm.font, size, track: tr, color: sc.fg };
    let bb = null;
    if (A) bb = U(bb, J.mainDraw(env, Object.assign({}, base, { text: A, align: 'right', x: cx - kw * k / 2 - g, y: cy, mi: 0 })));
    const kb = J.mainDraw(env, Object.assign({}, base, { text: K, x: cx, y: cy, color: Pm.key === 'accent' ? accentOn(sc) : sc.fg, mi: 1 }));
    bb = U(bb, kb);
    if (B) bb = U(bb, J.mainDraw(env, Object.assign({}, base, { text: B, align: 'left', x: cx + kw * k / 2 + g, y: cy, mi: 2 })));
    if (A) { const h = h100(A) * k; bb = U(bb, J.mainDraw(env, Object.assign({}, base, { text: A, vertical: true, x: cx, y: cy - size / 2 - g - h / 2, mi: 3 }))); }
    if (B) { const h = h100(B) * k; bb = U(bb, J.mainDraw(env, Object.assign({}, base, { text: B, vertical: true, x: cx, y: cy + size / 2 + g + h / 2, mi: 4 }))); }
    const la = E.outCubic(J.clamp((lt - 0.35) / 0.3)) * out;
    if (la > 0) label(env, `${pad2(ki + 1)}×${pad2(ki + 1)}`, cx + size * 0.62, cy - size * 0.62, { alpha: la, size: labelSize(env) * 0.9 });
    return bb;
  },
});

/* ================================================================== 4 tyBandHide — 帯隠れ */
reg('tyBandHide', {
  name: '帯隠れ', tags: ['graphic', 'pop', 'editorial'], ae: 'diag', w: 1, fits: n => n >= 1 && n <= 14,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display'])), band: rng.pick(['ink', 'accent', 'fg']), pos: rng.pick(['low', 'low', 'high']), speed: rng.range(40, 90), dir: rng.pick([1, -1]), k: rng.range(0.3, 0.38) };
  },
  render(env) {
    const { W, H, sc, ctx } = env, cut = env.cut, Pm = cut.params, lt = env.lt;
    const txt = String(cut.text).trim();
    const mt = mainLines(txt, W, H, 10, 5), L = mt.split('\n').length, lead = 1.32;
    const size = Math.min(J.fitSize(mt, Pm.font, W * 0.8, H * 0.66, { lead, track: 0.02 }), H * 0.3);
    const bb = J.mainDraw(env, { text: mt, font: Pm.font, size, x: W / 2, y: H / 2, lead, track: 0.02, color: sc.fg });
    const bandC = plateCol(sc, Pm.band === 'accent' ? [sc.accent, sc.ink, sc.fg] : Pm.band === 'ink' ? [sc.ink, sc.accent, sc.fg] : [sc.fg, sc.accent]);
    const tc = onCol(sc, bandC);
    const unit = String(cut.lineText || txt).replace(/\s+/g, ' ').trim() + '　／　';
    const out = 1 - E.inExpo(env.pOut);
    for (let li = 0; li < L; li++) {
      const e = E.outExpo(J.clamp((lt - 0.12 - li * 0.08) / 0.5)) * out;
      if (e <= 0) continue;
      const yl = H / 2 + (li - (L - 1) / 2) * size * lead;
      const h = size * (Pm.k + 0.08);
      const y0 = Pm.pos === 'low' ? yl + size * (0.5 - Pm.k) : yl - size * 0.58;
      const d = (li % 2 ? -1 : 1) * Pm.dir;
      const bw = (W + 20) * e, x0 = d > 0 ? -10 : W + 10 - bw;
      env.rect(x0, y0, bw, h, bandC, 1, false);
      if (env.pass === 'main') {
        const fs = h * 0.44;
        const per = J.measure({ text: unit, font: bodyF(env), size: fs, track: 0.12 }).w;
        if (per > 1) {
          ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, bw, h); ctx.clip();
          const off = ((env.ltb * Pm.speed * d) % per + per) % per;
          env.draw({ text: unit.repeat(Math.min(40, Math.ceil(W * 2 / per) + 2)), font: bodyF(env), size: fs, track: 0.12, align: 'left', x: -per + off, y: y0 + h / 2, color: tc, ghost: false });
          ctx.restore();
        }
      }
    }
    return bb;
  },
});

/* ================================================================== 5 tyRuby — ルビ振り */
reg('tyRuby', {
  name: 'ルビ振り', tags: ['editorial', 'calm', 'emotional'], ae: 'gloss', w: 1, fits: n => n >= 1 && n <= 14,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['serif', 'display'])), idx: rng.chance(0.7), up: rng.chance(0.5) };
  },
  render(env) {
    const { W, H, sc } = env, cut = env.cut, Pm = cut.params, lt = env.lt;
    const txt = String(cut.text).trim();
    const mt = mainLines(txt, W, H, 9, 5);
    const o = { track: 0.16, lead: 2.0 };
    const size = Math.min(J.fitSize(mt, Pm.font, W * 0.84, H * 0.62, o), H * 0.2, W * 0.24);
    const it = Object.assign({ text: mt, font: Pm.font, size, x: W / 2, y: H / 2 + size * 0.1, color: sc.fg }, o);
    const bb = J.mainDraw(env, it);
    const gl = glyphPts(it), out = outK(env), mono = monoF(env), lw = hair(env);
    const rs = Math.max(10, size * 0.3);
    gl.forEach((g, i) => {
      const a = E.outCubic(J.clamp((lt - 0.18 - i * 0.045) / 0.3)) * out;
      if (a <= 0) return;
      const ry = g.y - size * 0.74;
      let rt = J.isHira(g.ch) || J.isKata(g.ch) ? J.romaji(g.ch) : null;
      if (rt === '') rt = null;
      if (rt) {
        const w0 = J.measure({ text: rt, font: mono, size: rs, track: 0.02 }).w;
        const fs = w0 > g.w * 1.05 ? rs * g.w * 1.05 / w0 : rs;
        env.draw({ text: Pm.up ? rt.toUpperCase() : rt, font: mono, size: fs, track: 0.02, x: g.x, y: ry + (1 - a) * rs * 0.5, color: sc.sub, alpha: a, ghost: false });
      } else if (J.isKanji(g.ch)) {
        const w = g.w * 0.5 * a;
        env.line([[g.x - w, ry + rs * 0.2], [g.x - w, ry - rs * 0.15], [g.x + w, ry - rs * 0.15], [g.x + w, ry + rs * 0.2]], accentOn(sc), Math.max(1.2, lw * 1.2), a, false);
      }
      if (Pm.idx) {
        const iy = g.y + size * 0.72;
        env.line([[g.x, iy - rs * 0.55], [g.x, iy - rs * 0.2]], sc.sub, lw, 0.6 * a, false);
        env.draw({ text: pad2(i + 1), font: mono, size: rs * 0.72, x: g.x, y: iy + rs * 0.12, color: sc.sub, alpha: 0.75 * a, ghost: false });
      }
    });
    return bb;
  },
});

/* ================================================================== 6 tyBaseline — 罫線組 */
reg('tyBaseline', {
  name: '罫線組', tags: ['editorial', 'calm', 'graphic'], ae: 'type', w: 1.1, fits: n => n >= 2 && n <= 18,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['serif', 'display', 'body'])), nl: rng.pick([2, 3, 3]), key: rng.chance(0.8), right: rng.chance(0.5) };
  },
  render(env) {
    const { W, H, sc } = env, cut = env.cut, Pm = cut.params, lt = env.lt;
    const port = W < H, txt = String(cut.text).trim(), nG = J.glyphCount(txt);
    const per = port ? 4 : Math.max(4, Math.ceil(nG / Pm.nl));
    let lines = (nG <= 4 ? txt : splitL(txt, per)).split('\n').slice(0, 6);
    if (isLatinT(txt)) { const ws = txt.split(/\s+/); lines = groupLines(ws.map((w, i) => (i ? ' ' : '') + w), Math.min(ws.length, port ? 4 : Pm.nl)); }
    const L = lines.length, leadK = 1.62;
    let size = Math.min(H * 0.7 / (L * leadK), port ? W * 0.17 : H * 0.16);
    for (const l of lines) size = Math.min(size, J.fitSize(l, Pm.font, port ? W * 0.76 : W * 0.74, 1e6, { track: 0.04 }));
    const x0 = port ? W * 0.16 : W * 0.14, mx = W * 0.06, out = outK(env), lw = hair(env), mono = monoF(env), ls = labelSize(env);
    // key glyph (for the accent mark on its baseline)
    const all = lines.join(''), arr = [...all];
    const ki = keyIndex(arr, 'kanji');
    let kEnd = ki; while (kEnd + 1 < arr.length && J.isKanji(arr[kEnd + 1]) && J.isKanji(arr[ki])) kEnd++;
    let acc = 0, bb = null;
    lines.forEach((ln, li) => {
      const y = H / 2 + (li - (L - 1) / 2) * size * leadK;
      const yb = y + size * 0.6;
      const e = E.outExpo(J.clamp((lt - li * 0.1) / 0.6)) * out;
      if (e > 0) {
        env.line([[mx, yb], [J.lerp(mx, W - mx, e), yb]], sc.sub, lw, 0.55, false);
        label(env, pad2(li + 1), mx, y + size * 0.2, { alpha: e, size: ls * 0.9, font: mono });
        if (Pm.right) label(env, `${J.glyphCount(ln)}`, W - mx, y + size * 0.2, { alpha: e * 0.8, size: ls * 0.9, align: 'right' });
      }
      const it = { text: ln, font: Pm.font, size, align: 'left', x: x0, y, track: 0.04, color: sc.fg, mi: li * 4 };
      bb = U(bb, J.mainDraw(env, it));
      const n = [...ln].length;
      if (Pm.key && ki >= acc && ki < acc + n && e > 0) {
        const gp = glyphPts(it).filter(g => true);
        const idx0 = [...ln].slice(0, ki - acc).filter(c => !isSp(c)).length, idx1 = Math.min(gp.length - 1, idx0 + Math.min(kEnd, acc + n - 1) - ki);
        if (gp[idx0]) {
          const a0 = gp[idx0].x - gp[idx0].w / 2, a1 = gp[idx1].x + gp[idx1].w / 2;
          const q = E.outExpo(J.clamp((lt - 0.35 - li * 0.1) / 0.45)) * out;
          env.rect(a0, yb - Math.max(2, size * 0.035), (a1 - a0) * q, Math.max(3, size * 0.07), accentOn(sc), 1, false);
        }
      }
      acc += n;
    });
    return bb;
  },
});

/* ================================================================== 7 tyScaleSteps — 級数上げ */
reg('tyScaleSteps', {
  name: '級数上げ', tags: ['graphic', 'editorial', 'pop'], ae: 'mixed', w: 1, fits: n => n >= 2 && n <= 16,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display', 'serif'])), dir: rng.pick(['up', 'up', 'down']), labels: rng.chance(0.8), ratio: rng.range(2.0, 2.8) };
  },
  render(env) {
    const { W, H, sc } = env, cut = env.cut, Pm = cut.params, lt = env.lt, M = Math.min(W, H);
    const port = W < H, txt = String(cut.text).trim();
    let units = (cut.words || []).map(w => String(w).trim()).filter(Boolean);
    const chars = slotsOf(txt).filter(c => !isSp(c));
    if (units.length < 2 || units.length > 7) {
      if (chars.length <= 7) units = chars;
      else { const k = Math.min(5, Math.ceil(chars.length / 3)); units = splitL(txt, Math.ceil(chars.length / k)).split('\n'); }
    }
    const k = units.length;
    const f = units.map((u, i) => { const t = k > 1 ? i / (k - 1) : 1; return Math.pow(Pm.ratio, Pm.dir === 'up' ? t : 1 - t); });
    const fmax = Math.max(...f);
    const tr = 0.02, out = outK(env), lw = hair(env), ls = labelSize(env);
    const wOf = (u, s) => J.measure({ text: u, font: Pm.font, size: s, track: tr }).w;
    let bb = null;
    const items = [];
    if (!port) {
      const gapK = 0.16, latin = isLatinT(txt) && units.length > 1 && units.length < chars.length;
      let tot = 0; units.forEach((u, i) => { tot += wOf(u, 100 * f[i]) + (i ? 100 * gapK * f[i] * (latin ? 1.6 : 0.6) : 0); });
      const base = Math.min(W * 0.86 / tot * 100, H * 0.52 / fmax);
      let x = W / 2 - tot * base / 100 / 2;
      const yb = H / 2 + base * fmax * 0.36;
      units.forEach((u, i) => {
        const s = base * f[i];
        if (i) x += s * gapK * (latin ? 1.6 : 0.6);
        items.push({ text: u, font: Pm.font, size: s, align: 'left', x, y: yb - s * 0.46, track: tr, color: sc.fg, mi: i * 2, _w: wOf(u, s), _yb: yb });
        x += wOf(u, s);
      });
      const e = E.outExpo(J.clamp((lt - 0.05) / 0.7)) * out;
      const xa = items[0].x, xb = x;
      if (e > 0) env.line([[xa, yb + base * 0.08], [J.lerp(xa, xb, e), yb + base * 0.08]], sc.sub, lw, 0.6, false);
    } else {
      let tot = 0; units.forEach((u, i) => { tot += 100 * f[i] * 1.12; });
      let base = H * 0.78 / tot * 100;
      units.forEach((u, i) => { base = Math.min(base, W * 0.8 / Math.max(0.01, wOf(u, 100 * f[i]) / 100)); });
      base = Math.min(base, W * 0.5 / fmax);
      let y = H / 2 - tot * base / 100 / 2;
      units.forEach((u, i) => {
        const s = base * f[i];
        items.push({ text: u, font: Pm.font, size: s, align: 'left', x: W * 0.1, y: y + s * 0.56, track: tr, color: sc.fg, mi: i * 2, _w: wOf(u, s), _yb: y + s * 1.06 });
        y += s * 1.12;
      });
    }
    items.forEach((it, i) => {
      const w = it._w, yb = it._yb;
      delete it._w; delete it._yb;
      bb = U(bb, J.mainDraw(env, it));
      if (Pm.labels) {
        const a = E.outCubic(J.clamp((lt - 0.25 - i * 0.07) / 0.3)) * out;
        if (a > 0) {
          const pt = Math.round(it.size / (M / 1080) * 0.75);
          if (!port) label(env, `${pt}pt`, it.x, yb + ls * 1.3, { alpha: a, size: ls * 0.85 });
          else label(env, `${pt}pt`, it.x + w + ls * 0.8, yb - ls * 0.6, { alpha: a, size: ls * 0.85 });
        }
      }
    });
    return bb;
  },
});

/* ================================================================== 8 tyJustify — 幅揃え */
const groupLines = (units, L) => {
  const lens = units.map(u => J.glyphCount(u)), tot = lens.reduce((a, b) => a + b, 0), out = [];
  let cur = '', cl = 0, acc = 0;
  units.forEach((u, i) => {
    cur += u; cl += lens[i]; acc += lens[i];
    const target = tot * (out.length + 1) / L;
    if (out.length < L - 1 && acc >= target - lens[i] * 0.4 && i < units.length - 1) { out.push(cur.trim()); cur = ''; cl = 0; }
  });
  if (cur.trim()) out.push(cur.trim());
  return out;
};
reg('tyJustify', {
  name: '幅揃え', tags: ['graphic', 'pop', 'editorial'], ae: 'stack', w: 1.1, fits: n => n >= 3 && n <= 16,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display'])), rules: rng.chance(0.7), acc: rng.int(0, 3), align: rng.pick(['center', 'left']) };
  },
  render(env) {
    const { W, H, sc } = env, cut = env.cut, Pm = cut.params, lt = env.lt;
    const port = W < H, txt = String(cut.text).trim(), n = J.glyphCount(txt);
    let L = n <= 5 ? 2 : n <= 10 ? 3 : 4;
    let units = (cut.words || []).map(w => String(w)).filter(w => w.trim());
    if (isLatinT(txt)) units = txt.split(/\s+/).map((w, i) => (i ? ' ' : '') + w);
    else {
      if (units.length < 2) units = (J.segments(txt) || []).filter(w => w.trim());
      if (units.length < 2) units = [...txt];
    }
    L = Math.min(L, units.length);
    let lines = groupLines(units, L);
    for (let i = 1; i < lines.length; i++) { while (lines[i] && J.isPunct([...lines[i]][0])) { const c = [...lines[i]][0]; lines[i - 1] += c; lines[i] = lines[i].slice(c.length).trim(); } }
    lines = lines.filter(Boolean);
    if (lines.length < 2 && !isLatinT(txt)) lines = splitL(txt, Math.ceil(n / 2)).split('\n');
    const Wb = port ? W * 0.84 : Math.min(W * 0.62, H * 1.15);
    const tr = 0.01, gapK = 0.1;
    let sizes = lines.map(l => Math.min(J.fitSize(l, Pm.font, Wb, 1e6, { track: tr }), H * 0.36));
    let tot = sizes.reduce((a, s) => a + s * (1 + gapK), 0) - sizes[sizes.length - 1] * gapK;
    const k = Math.min(1, H * 0.84 / tot);
    sizes = sizes.map(s => s * k); tot *= k;
    const x0 = W / 2 - Wb * k / 2, out = outK(env), lw = hair(env);
    let y = H / 2 - tot / 2, bb = null;
    const accI = Pm.acc % lines.length;
    lines.forEach((l, li) => {
      const s = sizes[li];
      const it = { text: l, font: Pm.font, size: s, x: Pm.align === 'left' ? x0 : W / 2, align: Pm.align === 'left' ? 'left' : 'center', y: y + s / 2, track: tr, color: li === accI && lines.length > 2 ? accentOn(sc) : sc.fg, mi: li * 3 };
      bb = U(bb, J.mainDraw(env, it));
      if (Pm.rules && li < lines.length - 1) {
        const e = E.outExpo(J.clamp((lt - 0.15 - li * 0.08) / 0.6)) * out;
        const ry = y + s + s * gapK * k * 0.5;
        if (e > 0) env.line([[W / 2 - Wb * k / 2 * e, ry], [W / 2 + Wb * k / 2 * e, ry]], sc.sub, lw, 0.55, false);
      }
      y += s * (1 + gapK);
    });
    return bb;
  },
});

/* ================================================================== 9 tyIndexTable — 一覧表 */
reg('tyIndexTable', {
  name: '一覧表', tags: ['editorial', 'graphic', 'calm'], ae: 'gloss', w: 0.8, portrait: 1.3, fits: n => n >= 2 && n <= 9,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display', 'serif'])), info: rng.pick(['roma', 'roma', 'code']), head: rng.chance(0.8) };
  },
  render(env) {
    const { W, H, sc, ctx } = env, cut = env.cut, Pm = cut.params, lt = env.lt, M = Math.min(W, H);
    const port = W < H;
    const chars = [...clean(cut.text)], n = chars.length;
    if (!n) return null;
    const rowH = Math.min(H * 0.78 / n, M * 0.2), gs = rowH * 0.86;
    const Wt = port ? W * 0.84 : Math.min(W * 0.56, H * 1.0);
    const x0 = W / 2 - Wt / 2, x1 = W / 2 + Wt / 2, xg = x0 + Wt * 0.24;
    const top = H / 2 - n * rowH / 2;
    const out = outK(env), lw = hair(env), mono = monoF(env);
    const fs = J.clamp(rowH * 0.3, 11, 34);
    const e0 = E.outExpo(J.clamp(lt / 0.6)) * out;
    if (e0 > 0) {
      env.line([[x0, top], [J.lerp(x0, x1, e0), top]], sc.fg, lw * 2, 0.9, false);
      env.line([[x0, top + n * rowH], [J.lerp(x0, x1, e0), top + n * rowH]], sc.fg, lw * 2, 0.9, false);
      if (Pm.head) {
        label(env, 'No.', x0, top - fs * 0.9, { alpha: e0, size: fs * 0.8 });
        label(env, Pm.info === 'code' ? 'CODE' : 'READING', x1, top - fs * 0.9, { alpha: e0, size: fs * 0.8, align: 'right' });
      }
    }
    let bb = null;
    chars.forEach((ch, i) => {
      const y = top + (i + 0.5) * rowH;
      bb = U(bb, J.mainDraw(env, { text: ch, font: Pm.font, size: gs, x: xg, y, color: sc.fg, mi: i }));
      const a = E.outCubic(J.clamp((lt - 0.12 - i * 0.06) / 0.3)) * out;
      if (a <= 0) return;
      label(env, pad2(i + 1), x0, y, { alpha: a, size: fs, color: i === 0 ? accentOn(sc) : sc.sub });
      let info = null;
      if (Pm.info !== 'code' && (J.isHira(ch) || J.isKata(ch))) { const r = J.romaji(ch); if (r) info = r.toUpperCase(); }
      if (!info) info = 'U+' + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
      const iw = J.measure({ text: info, font: mono, size: fs, track: 0.12 }).w;
      label(env, info, x1, y, { alpha: a, size: fs, align: 'right' });
      const la = xg + gs * 0.72, lb = x1 - iw - fs * 0.8;
      if (lb > la && env.pass === 'main') {
        ctx.save(); ctx.setLineDash([Math.max(2, lw * 2), Math.max(5, fs * 0.5)]);
        env.line([[la, y + fs * 0.2], [J.lerp(la, lb, a), y + fs * 0.2]], sc.sub, Math.max(2, lw * 2), a, false);
        ctx.restore();
      }
      if (i < n - 1) env.line([[x0, top + (i + 1) * rowH], [x1, top + (i + 1) * rowH]], sc.sub, lw, 0.22 * a, false);
    });
    return bb;
  },
});

/* ================================================================== 10 tySplitType — 断ち割り */
reg('tySplitType', {
  name: '断ち割り', tags: ['graphic', 'glitch', 'pop'], ae: 'center', w: 1, fits: n => n >= 1 && n <= 14,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display'])), off: rng.range(0.08, 0.15) * rng.pick([1, -1]), cutY: rng.pick([0.02, -0.06, 0.08]), cap: rng.chance(0.75) };
  },
  render(env) {
    const { W, H, sc, ctx } = env, cut = env.cut, Pm = cut.params, lt = env.lt;
    const txt = String(cut.text).trim();
    const mt = mainLines(txt, W, H, 11, 5), L = mt.split('\n').length, lead = 1.16;
    const size = Math.min(J.fitSize(mt, Pm.font, W * 0.76, H * 0.56, { lead, track: 0.03 }), H * 0.3);
    const e = E.outExpo(J.clamp((lt - 0.12) / 0.7));
    const d = size * Pm.off * e, gy = size * 0.05 * e;
    const base = { text: mt, font: Pm.font, size, y: H / 2, lead, track: 0.03, color: sc.fg, mi: 0 };
    const ys = []; for (let li = 0; li < L; li++) ys.push(H / 2 + (li - (L - 1) / 2) * size * lead + size * Pm.cutY);
    const part = (top) => {
      ctx.save(); ctx.beginPath();
      ys.forEach((yc, li) => {
        const a = yc - size * lead / 2, b = yc + size * lead / 2;
        if (top) ctx.rect(-W, li ? a : -H, W * 3, yc - (li ? a : -H)); else ctx.rect(-W, yc, W * 3, (li < L - 1 ? b : H * 2) - yc);
      });
      ctx.clip();
      const r = J.mainDraw(env, Object.assign({}, base, { x: W / 2 + (top ? d : -d), y: H / 2 + (top ? -gy : gy) }));
      ctx.restore();
      return r;
    };
    const bb = U(part(true), part(false));
    const out = outK(env), lw = hair(env);
    if (e * out > 0.01) {
      ys.forEach((yc, li) => {
        const q = E.outExpo(J.clamp((lt - 0.2 - li * 0.08) / 0.6)) * out;
        env.line([[W * 0.04, yc], [J.lerp(W * 0.04, W * 0.96, q), yc]], accentOn(sc), Math.max(1.2, lw * 1.2), 0.9, false);
      });
      if (Pm.cap) {
        const ls = labelSize(env) * 0.85, cap = (romaOf(txt) || String(cut.lineText || txt)).slice(0, 48);
        label(env, cap, W * 0.96, ys[ys.length - 1] + ls * 0.9, { align: 'right', alpha: out * E.outCubic(J.clamp((lt - 0.4) / 0.3)), size: ls, track: 0.2 });
      }
    }
    return bb;
  },
});

/* ================================================================== 11 tyErode — 削り反復 */
reg('tyErode', {
  name: '削り反復', tags: ['emotional', 'editorial', 'calm'], ae: 'stack', w: 0.9, portrait: 0.6, fits: n => n >= 3 && n <= 12,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['serif', 'display'])), mode: rng.pick(['grow', 'grow', 'erode']), idx: rng.chance(0.7) };
  },
  render(env) {
    const { W, H, sc } = env, cut = env.cut, Pm = cut.params, lt = env.lt;
    const arr = slotsOf(cut.text), nS = arr.length;
    const R = Math.min(5, Math.max(2, arr.filter(c => !isSp(c)).length));
    const lens = [];
    for (let r = 0; r < R; r++) { const l = Math.max(1, Math.round(nS * (r + 1) / R)); if (!lens.includes(l)) lens.push(l); }
    if (Pm.mode === 'erode') lens.reverse();
    const rows = lens.map(l => arr.slice(0, l).join('').trim()).filter(Boolean);
    const Rn = rows.length, full = arr.join(''), leadK = 1.34;
    const size = Math.min(J.fitSize(full, Pm.font, W * 0.74, 1e6, { track: 0.04 }), H * 0.8 / (Rn * leadK), H * 0.16);
    const fw = J.measure({ text: full, font: Pm.font, size, track: 0.04 }).w;
    const x0 = W / 2 - fw / 2, out = outK(env), mainR = Pm.mode === 'erode' ? 0 : Rn - 1;
    let bb = null;
    rows.forEach((t, r) => {
      const y = H / 2 + (r - (Rn - 1) / 2) * size * leadK;
      const it = { text: t, font: Pm.font, size, align: 'left', x: x0, y, track: 0.04 };
      const tIn = r * 0.11;
      if (r === mainR) bb = J.mainDraw(env, Object.assign(it, { color: sc.fg, mi: r * 2.5 }));
      else {
        const dist = Math.abs(r - mainR) / Math.max(1, Rn - 1);
        const a = J.clamp((lt - tIn) / 0.12) * out * (0.75 - 0.45 * dist);
        if (a > 0) env.draw(Object.assign(it, { color: sc.sub, alpha: a, ghost: false }));
      }
      if (Pm.idx) {
        const a = J.clamp((lt - tIn) / 0.12) * out;
        if (a > 0) label(env, pad2(J.glyphCount(t)), x0 + fw + size * 0.5, y, { alpha: a * 0.85, size: Math.min(labelSize(env), size * 0.4), color: r === mainR ? accentOn(sc) : sc.sub });
      }
    });
    return bb;
  },
});

/* ================================================================== 12 tyVRuler — 縦目盛り */
reg('tyVRuler', {
  name: '縦目盛り', tags: ['editorial', 'calm', 'graphic'], ae: 'vcols', w: 0.9, portrait: 1.3, fits: n => n >= 1 && n <= 12,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['serif', 'display'])), side: rng.pick([1, -1]), lab: rng.pick(['time', 'time', 'roma']) };
  },
  render(env) {
    const { W, H, sc } = env, cut = env.cut, Pm = cut.params, lt = env.lt;
    const txt = String(cut.text).trim().replace(/[\s　]+/g, '　');
    const tr = 0.14;
    const size = Math.min(J.fitSize(txt, Pm.font, W * 0.3, H * 0.78, { vertical: true, track: tr }), W * 0.2, H * 0.2);
    const cx = W / 2 - Pm.side * size * 0.9;
    const it = { text: txt, font: Pm.font, size, x: cx, y: H / 2, vertical: true, track: tr, color: sc.fg };
    const bb = J.mainDraw(env, it);
    const gl = glyphPts(it);
    if (!gl.length) return bb;
    const out = outK(env), lw = hair(env), mono = monoF(env);
    const rx = cx + Pm.side * size * 0.85;
    const y0 = gl[0].y - size * 0.7, y1 = gl[gl.length - 1].y + size * 0.7;
    const e = E.outExpo(J.clamp(lt / 0.7)) * out;
    if (e <= 0) return bb;
    env.line([[rx, y0], [rx, J.lerp(y0, y1, e)]], sc.sub, lw, 0.8, false);
    const fs = J.clamp(size * 0.2, 10, 24), n = gl.length;
    const rom = Pm.lab === 'roma';
    gl.forEach((g, i) => {
      const a = E.outCubic(J.clamp((lt - 0.1 - i * 0.05) / 0.25)) * out;
      if (a <= 0) return;
      env.line([[rx, g.y], [rx + Pm.side * size * 0.3, g.y]], sc.sub, lw, 0.9 * a, false);
      if (i < n - 1) { const ym = (g.y + gl[i + 1].y) / 2; env.line([[rx, ym], [rx + Pm.side * size * 0.14, ym]], sc.sub, lw, 0.5 * a, false); }
      let t = null;
      if (rom && (J.isHira(g.ch) || J.isKata(g.ch))) t = (J.romaji(g.ch) || '').toUpperCase() || null;
      if (!t) t = J.fmtTime(cut.start + cut.dur * i / n);
      label(env, t, rx + Pm.side * size * 0.45, g.y, { alpha: a, size: fs, align: Pm.side > 0 ? 'left' : 'right' });
    });
    // playhead
    const u = J.clamp(lt / Math.max(0.3, cut.dur * 0.92));
    const py = J.lerp(gl[0].y, gl[n - 1].y, u), ts = fs * 0.7, ac = accentOn(sc);
    env.poly([[rx - Pm.side * 2, py], [rx - Pm.side * (ts * 1.4), py - ts], [rx - Pm.side * (ts * 1.4), py + ts]], ac, e, false);
    return bb;
  },
});

/* ================================================================== 13 tyFullTrack — 全幅字送り */
reg('tyFullTrack', {
  name: '全幅字送り', tags: ['editorial', 'calm', 'graphic'], ae: 'center', w: 1, fits: n => n >= 3 && n <= 14,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display', 'serif', 'body'])), caps: rng.chance(0.8), rule: rng.chance(0.75) };
  },
  render(env) {
    const { W, H, sc } = env, cut = env.cut, Pm = cut.params, lt = env.lt;
    const port = W < H;
    const s = slotsOf(cut.text), k = s.length;
    const m0 = port ? H * 0.08 : W * 0.06;
    const size = port ? Math.min(W * 0.24, ((port ? H : W) - m0 * 2) / k * 0.8, H * 0.11) : Math.min(H * 0.2, (W - m0 * 2) / k * 0.8);
    const m = m0 + size * 0.5;
    const span = (port ? H : W) - m * 2;
    const out = outK(env), lw = hair(env);
    let bb = null, gi = 0;
    s.forEach((ch, i) => {
      if (isSp(ch)) return;
      const u = k > 1 ? i / (k - 1) : 0.5;
      const x = port ? W / 2 : m + span * u, y = port ? m + span * u : H / 2;
      bb = U(bb, J.mainDraw(env, { text: ch, font: Pm.font, size, x, y, color: sc.fg, mi: gi++ }));
    });
    const e = E.outExpo(J.clamp((lt - 0.05) / 0.8)) * out;
    if (e > 0) {
      if (Pm.rule) {
        if (!port) { const y = H / 2 + size * 0.68; env.line([[W / 2 - span / 2 * e, y], [W / 2 + span / 2 * e, y]], sc.sub, lw, 0.6, false); }
        else { const x = W / 2 + size * 0.7; env.line([[x, H / 2 - span / 2 * e], [x, H / 2 + span / 2 * e]], sc.sub, lw, 0.6, false); }
      }
      if (Pm.caps) {
        const ls = labelSize(env);
        const cap = String(cut.lineText || cut.text).replace(/\s+/g, ' ').trim().slice(0, 40);
        if (!port) {
          label(env, cap, m, H / 2 - size * 0.62 - ls, { alpha: e * 0.9, size: ls, font: bodyF(env), track: 0.14 });
          label(env, `No.${pad2((cut.line | 0) + 1)}  ${J.fmtTime(cut.start)}`, W - m, H / 2 - size * 0.62 - ls, { alpha: e * 0.9, size: ls, align: 'right' });
        } else {
          label(env, `No.${pad2((cut.line | 0) + 1)}`, W / 2 - size * 0.7, m - size * 0.9, { alpha: e * 0.9, size: ls, align: 'right' });
          label(env, J.fmtTime(cut.start), W / 2 + size * 0.7, H - m + size * 0.9, { alpha: e * 0.9, size: ls });
        }
      }
    }
    return bb;
  },
});

/* ================================================================== 14 tyStatCount — 字数表示 */
reg('tyStatCount', {
  name: '字数表示', tags: ['editorial', 'graphic'], ae: 'type', w: 0.8, fits: n => n >= 1 && n <= 16,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display', 'serif'])), nf: rng.pick(fontsOf(st, ['display', 'mono'])), acc: rng.chance(0.5) };
  },
  render(env) {
    const { W, H, sc } = env, cut = env.cut, Pm = cut.params, lt = env.lt;
    const port = W < H, txt = String(cut.text).trim(), nG = J.glyphCount(txt);
    const mt = mainLines(txt, W, H, 8, 5), o = { lead: 1.2, track: 0.03 };
    const out = outK(env), lw = hair(env), ls = labelSize(env);
    const latin = !/[^\x00-\x7f]/.test(txt);
    const cnt = Math.round(nG * E.outCubic(J.clamp((lt - 0.1) / 0.9)));
    const e = E.outExpo(J.clamp((lt - 0.05) / 0.7)) * out;
    let it, nx, ny, ns;
    if (!port) {
      const size = Math.min(J.fitSize(mt, Pm.font, W * 0.5, H * 0.54, o), H * 0.2);
      it = Object.assign({ text: mt, font: Pm.font, size, align: 'left', x: W * 0.08, y: H / 2, color: sc.fg }, o);
      const rx = W * 0.65;
      if (e > 0) env.line([[rx, H / 2 - H * 0.22 * e], [rx, H / 2 + H * 0.22 * e]], sc.sub, lw, 0.7, false);
      nx = rx + W * 0.04; ny = H / 2 - H * 0.05; ns = H * 0.26;
    } else {
      const size = Math.min(J.fitSize(mt, Pm.font, W * 0.84, H * 0.42, o), W * 0.18);
      it = Object.assign({ text: mt, font: Pm.font, size, align: 'left', x: W * 0.08, y: H * 0.36, color: sc.fg }, o);
      const ry = H * 0.62;
      if (e > 0) env.line([[W * 0.08, ry], [W * 0.08 + W * 0.84 * e, ry]], sc.sub, lw, 0.7, false);
      nx = W * 0.08; ny = ry + H * 0.1; ns = W * 0.3;
    }
    const bb = J.mainDraw(env, it);
    ns = Math.min(ns, (W * 0.93 - nx) / Math.max(0.3, J.measure({ text: '00', font: Pm.nf, size: 1 }).w));
    if (e > 0) {
      env.draw({ text: pad2(cnt), font: Pm.nf, size: ns, align: 'left', x: nx, y: ny, color: Pm.acc ? accentOn(sc) : sc.fg, alpha: e, ghost: false });
      const y2 = ny + ns * 0.62;
      label(env, latin ? 'CHARACTERS' : '文字 / CHARACTERS', nx, y2, { alpha: e, size: ls, font: latin ? monoF(env) : bodyF(env) });
      label(env, `LINE ${pad2((cut.line | 0) + 1)}  ─  ${J.fmtTime(cut.start)}`, nx, y2 + ls * 1.8, { alpha: e * 0.8, size: ls * 0.85 });
    }
    return bb;
  },
});

/* ================================================================== 15 tyMargin — 余白 */
reg('tyMargin', {
  name: '余白', tags: ['calm', 'editorial', 'emotional'], ae: 'center', w: 0.8, emph: 0.4, fits: n => n >= 1 && n <= 18,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['serif', 'body', 'display'])), pos: rng.pick(['bl', 'bl', 'tr', 'br', 'lc']), mark: rng.chance(0.7) };
  },
  render(env) {
    const { W, H, sc } = env, cut = env.cut, Pm = cut.params, lt = env.lt, M = Math.min(W, H);
    const port = W < H, txt = String(cut.text).trim();
    const mt = J.glyphCount(txt) > (port ? 9 : 14) ? splitL(txt, port ? 8 : 12) : txt;
    const size = Math.min(M * 0.068, J.fitSize(mt, Pm.font, W * 0.66, H * 0.22, { track: 0.1, lead: 1.4 }));
    const right = Pm.pos === 'tr' || Pm.pos === 'br';
    const y = Pm.pos === 'tr' ? H * 0.2 : Pm.pos === 'lc' ? H * 0.5 : H * 0.8;
    const x = right ? W * 0.92 : W * 0.08;
    const it = { text: mt, font: Pm.font, size, x, y, align: right ? 'right' : 'left', track: 0.1, lead: 1.4, color: sc.fg };
    const bb = J.mainDraw(env, it);
    const m = J.measure(it), out = outK(env), lw = hair(env), ls = labelSize(env) * 0.9;
    const e = E.outExpo(J.clamp((lt - 0.2) / 0.9)) * out;
    if (e > 0) {
      const tx0 = right ? x - m.w : x, tx1 = right ? x : x + m.w;
      const ly = y - m.h / 2 - ls * 1.4;
      label(env, `${pad2((cut.line | 0) + 1)}  —  ${J.fmtTime(cut.start)}`, right ? x : x, ly, { alpha: e * 0.9, size: ls, align: right ? 'right' : 'left' });
      const a0 = right ? tx0 - size * 0.8 : tx1 + size * 0.8, a1 = right ? W * 0.08 : W * 0.92;
      if ((a1 - a0) * (right ? -1 : 1) > W * 0.05) {
        const yl = y + (J.glyphCount(mt) > 0 ? 0 : 0);
        env.line([[a0, yl], [J.lerp(a0, a1, e), yl]], sc.sub, lw, 0.6, false);
        if (Pm.mark) { const q = size * 0.16; env.rect(J.lerp(a0, a1, e) - q / 2, yl - q / 2, q, q, accentOn(sc), e, false); }
      }
      const rom = romaOf(txt);
      if (rom) label(env, rom, right ? x : x, y + m.h / 2 + ls * 1.3, { alpha: e * 0.75, size: ls * 0.9, align: right ? 'right' : 'left', track: 0.3 });
    }
    return bb;
  },
});

/* ================================================================== 16 tyRotBlock — 回転ブロック */
reg('tyRotBlock', {
  name: '回転ブロック', tags: ['graphic', 'pop', 'editorial'], ae: 'sideways', w: 1, fits: n => n >= 4 && n <= 16,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display'])), fb: rng.pick(fontsOf(st, ['display', 'serif'])), rot: rng.pick([-90, -90, 90]), accent: rng.chance(0.5), rule: rng.chance(0.8) };
  },
  render(env) {
    const { W, H, sc } = env, cut = env.cut, Pm = cut.params, lt = env.lt;
    const port = W < H;
    const arr = slotsOf(cut.text), n = arr.length;
    const ws = (cut.words || []).map(String);
    let cutAt = Math.max(1, Math.round(n * 0.36));
    if (ws.length >= 2) { const l0 = [...ws[0].trim()].length; if (l0 >= 1 && l0 <= Math.ceil(n * 0.55)) cutAt = l0; }
    while (cutAt < n - 1 && (J.isSmallKana(arr[cutAt]) || J.isPunct(arr[cutAt]))) cutAt++;
    let A = arr.slice(0, cutAt).join('').trim() || arr[0], B = arr.slice(cutAt).join('').trim() || arr[n - 1];
    let labelA = false;
    if (isLatinT(cut.text)) {             // latin: split at a word gap; one word → the rotated block is a small line label
      const t = String(cut.text).trim(), sp = t.indexOf(' ');
      if (sp > 0) { A = t.slice(0, sp); B = t.slice(sp + 1).trim(); }
      else { A = `LINE ${pad2((cut.line | 0) + 1)}`; B = t; labelA = true; }
    }
    const Hb = port ? H * 0.44 : H * 0.62;
    const wA100 = J.measure({ text: A, font: Pm.font, size: 100, track: 0.02 }).w;
    const sizeA = Math.min(Hb / wA100 * 100, port ? W * 0.3 : W * 0.24, labelA ? Math.min(W, H) * 0.06 : 1e9);
    const gap = sizeA * 0.28;
    const Wb = (port ? W * 0.86 : Math.min(W * 0.84, Hb * 2.4)) - sizeA - gap;
    let best = null;
    const nB = J.glyphCount(B);
    for (let Lc = 1; Lc <= 3; Lc++) {
      if (Lc > nB) break;
      let bt = Lc === 1 ? B : splitL(B, Math.ceil(nB / Lc));
      if (Lc > 1 && isLatinT(B)) { const ws = B.split(/\s+/); if (ws.length < Lc) break; bt = groupLines(ws.map((w, i) => (i ? ' ' : '') + w), Lc).join('\n'); }
      const s = Math.min(J.fitSize(bt, Pm.fb, Wb, Hb, { lead: 1.08, track: 0.02 }), Hb * 0.6);
      if (!best || s > best.s * 1.05) best = { bt, s };
    }
    const mB = J.measure({ text: best.bt, font: Pm.fb, size: best.s, lead: 1.08, track: 0.02 });
    const wA = wA100 * sizeA / 100;
    const tot = sizeA + gap + mB.w;
    const xA = W / 2 - tot / 2 + sizeA / 2, xB = xA + sizeA / 2 + gap;
    const out = outK(env), lw = hair(env);
    const bh = Math.max(wA, mB.h);
    if (Pm.rule) {
      const e = E.outExpo(J.clamp((lt - 0.1) / 0.6)) * out;
      if (e > 0) env.line([[xA + sizeA / 2 + gap / 2, H / 2 - bh / 2 * e], [xA + sizeA / 2 + gap / 2, H / 2 + bh / 2 * e]], sc.sub, lw, 0.7, false);
    }
    const itA = { text: A, font: Pm.font, size: sizeA, x: xA, y: H / 2, rot: Pm.rot, track: 0.02, color: Pm.accent ? accentOn(sc) : sc.fg, mi: 0 };
    if (labelA) env.draw(Object.assign(itA, { font: monoF(env), color: sc.sub, alpha: E.outCubic(J.clamp(lt / 0.4)) * out, ghost: false }));
    else J.mainDraw(env, itA);
    J.mainDraw(env, { text: best.bt, font: Pm.fb, size: best.s, x: xB, y: H / 2, align: 'left', lead: 1.08, track: 0.02, color: sc.fg, mi: 3 });
    return bbRect(xA - sizeA / 2, H / 2 - bh / 2, xB + mB.w, H / 2 + bh / 2);
  },
});

/* ================================================================== 17 tySquare — 方形組 */
reg('tySquare', {
  name: '方形組', tags: ['graphic', 'editorial', 'pop'], ae: 'gridCells', w: 1, fits: n => n >= 3 && n <= 16,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display', 'serif'])), order: rng.pick(['yoko', 'yoko', 'tate']), frame: rng.chance(0.75), acc: rng.chance(0.7) };
  },
  render(env) {
    const { W, H, sc } = env, cut = env.cut, Pm = cut.params, lt = env.lt, M = Math.min(W, H);
    const chars = [...clean(cut.text)], n = chars.length;
    if (!n) return null;
    const tate = Pm.order === 'tate';
    const a = Math.ceil(Math.sqrt(n)), b = Math.ceil(n / a);
    const cols = tate ? b : a, rows = tate ? a : b;
    const cell = Math.min(W * 0.78 / cols, H * 0.74 / rows, M * 0.3);
    const x0 = W / 2 - cols * cell / 2, y0 = H / 2 - rows * cell / 2;
    const ki = keyIndex(chars, 'kanji');
    const out = outK(env), lw = hair(env), ls = labelSize(env);
    let bb = null;
    const pos = i => (tate ? [cols - 1 - Math.floor(i / rows), i % rows] : [i % cols, Math.floor(i / cols)]);
    for (let i = 0; i < cols * rows; i++) {
      const [c, r] = pos(i), x = x0 + (c + 0.5) * cell, y = y0 + (r + 0.5) * cell;
      if (i < n) bb = U(bb, J.mainDraw(env, { text: chars[i], font: Pm.font, size: cell * 0.9, x, y, vertical: tate, color: Pm.acc && i === ki ? accentOn(sc) : sc.fg, mi: i }));
      else {
        const q = E.outBack(J.clamp((lt - 0.2 - i * 0.03) / 0.3), 2) * out, s = cell * 0.08;
        if (q > 0) { env.line([[x - s * q, y], [x + s * q, y]], sc.sub, lw, 0.8, false); env.line([[x, y - s * q], [x, y + s * q]], sc.sub, lw, 0.8, false); }
      }
    }
    if (Pm.frame) {
      const e = E.outExpo(J.clamp((lt - 0.05) / 0.7)) * out;
      if (e > 0) {
        const xa = x0, xb = x0 + cols * cell, g = cell * 0.12;
        env.line([[xa, y0 - g], [J.lerp(xa, xb, e), y0 - g]], sc.fg, Math.max(2, lw * 2.4), 0.9, false);
        env.line([[xb, y0 + rows * cell + g], [J.lerp(xb, xa, e), y0 + rows * cell + g]], sc.sub, lw, 0.8, false);
        label(env, `${cols}×${rows}`, xb, y0 + rows * cell + g + ls * 1.1, { align: 'right', alpha: e, size: ls * 0.9 });
        label(env, tate ? '縦組' : 'YOKO', xa, y0 + rows * cell + g + ls * 1.1, { alpha: e * 0.8, size: ls * 0.9, font: tate ? bodyF(env) : monoF(env) });
      }
    }
    return bb;
  },
});

/* ================================================================== 18 tyLineFocus — 行中強調 */
reg('tyLineFocus', {
  name: '行中強調', tags: ['editorial', 'emotional', 'calm'], ae: 'center', w: 1, fits: n => n >= 1 && n <= 16,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['serif', 'display', 'body'])), mark: rng.pick(['bar', 'bar', 'dot', 'box']) };
  },
  render(env) {
    const { W, H, sc } = env, cut = env.cut, Pm = cut.params, lt = env.lt, M = Math.min(W, H);
    const port = W < H;
    const cutT = String(cut.text).trim();
    let line = String(cut.lineText || cutT).trim();
    if (J.glyphCount(line) > 36) line = cutT;
    const nsI = (s, end) => [...s].slice(0, end).filter(c => !/\s/.test(c)).length;
    let s0, s1, same = false;
    const at = line.indexOf(cutT);
    if (at < 0 || line === cutT) {
      line = cutT; same = true;
      const arr = [...line];
      let ki = keyIndex(arr, 'kanji');
      let ke = ki;
      if (J.isKanji(arr[ki])) while (ke + 1 < arr.length && J.isKanji(arr[ke + 1])) ke++;
      else { while (ke + 1 < arr.length && ke - ki < 2 && !isSp(arr[ke + 1]) && !J.isPunct(arr[ke + 1])) ke++; }
      if (isLatinT(line)) {
        const re = /\S+/g; let m, best = null;
        while ((m = re.exec(line))) if (!best || m[0].length > best[0].length) best = m;
        if (best) { ki = [...line.slice(0, best.index)].length; ke = ki + [...best[0]].length - 1; }
      }
      s0 = nsI(line, ki); s1 = nsI(line, ke + 1);
    } else {
      const pre = [...line.slice(0, at)].length;
      s0 = nsI(line, pre); s1 = s0 + J.glyphCount(cutT);
    }
    const nAll = J.glyphCount(line);
    const mt = nAll > (port ? 7 : 12) ? splitL(line, Math.ceil(nAll / Math.ceil(nAll / (port ? 6 : 11)))) : line;
    const o = { lead: 1.7, track: 0.08 };
    const size = Math.min(J.fitSize(mt, Pm.font, W * 0.82, H * 0.56, o), M * 0.12);
    const it = Object.assign({ text: mt, font: Pm.font, size, x: W / 2, y: H / 2 }, o);
    const gl = glyphPts(it), out = outK(env), ac = accentOn(sc);
    const dimA = E.outCubic(J.clamp(lt / 0.3)) * out;
    let bb = null, j = 0;
    const spanBy = new Map();
    gl.forEach((g, i) => {
      if (i >= s0 && i < s1) {
        bb = U(bb, J.mainDraw(env, { text: g.ch, font: Pm.font, size, x: g.x, y: g.y, color: sc.fg, mi: j++ }));
        const L = spanBy.get(g.li) || { a: 1e9, b: -1e9, g: [] }; L.a = Math.min(L.a, g.x - g.w / 2); L.b = Math.max(L.b, g.x + g.w / 2); L.g.push(g); spanBy.set(g.li, L);
      } else if (dimA > 0) env.draw({ text: g.ch, font: Pm.font, size, x: g.x, y: g.y, color: same ? sc.fg : sc.sub, alpha: dimA * (same ? 0.5 : 0.42), ghost: false });
    });
    let k = 0;
    for (const L of spanBy.values()) {
      const q = E.outExpo(J.clamp((lt - 0.25 - k * 0.1) / 0.5)) * out; k++;
      if (q <= 0) continue;
      const y = L.g[0].y;
      if (Pm.mark === 'bar') env.rect(L.a, y + size * 0.62, (L.b - L.a) * q, Math.max(3, size * 0.07), ac, 1, false);
      else if (Pm.mark === 'dot') L.g.forEach(g => env.circle(g.x, g.y - size * 0.72, size * 0.07 * q, ac, null, 0, 1, false));
      else env.rrect(L.a - size * 0.14, y - size * 0.64, (L.b - L.a + size * 0.28), size * 1.28, 0, null, q, false, ac, Math.max(1.5, size * 0.03));
    }
    return bb || bbRect(W * 0.3, H * 0.4, W * 0.7, H * 0.6);
  },
});

})();

/* JIZURA pack: typo (part 2) — typographic entrances, exits and holds: key glyph first, line wipes with rules, ruby, brackets, retyping, indices */
(() => {
'use strict';
const E = J.E;
const P = 'typo';
const SET = 'typo';
const reg = (g, key, def) => J.register(g, key, Object.assign({ set: SET }, def), P);
const HIDE = Object.freeze({ hide: true });
const clamp = J.clamp, lerp = J.lerp, DEG = J.DEG;

/* ------------------------------------------------------------------ helpers */
const isSp = c => c === ' ' || c === '　';
const layOf = it => (it._m || (it._m = J.measure(it))).lay;
const motionK = env => J.clamp((env.fx && env.fx.motion != null ? env.fx.motion : 0.7) / 0.7, 0, 1.6);
const cutN = env => Math.max(1, J.glyphCount(String(env.cut && env.cut.text || '')));
const accentOf = env => { const sc = env.sc; return J.contrast(sc.accent, sc.bg) >= 1.8 ? sc.accent : sc.fg; };
const subOf = env => { const sc = env.sc; return J.contrast(sc.sub, sc.bg) >= 1.5 ? sc.sub : sc.fg; };
function addPost(it, fn) { const prev = it.post; it.post = prev ? (env, x, bb) => { prev(env, x, bb); fn(env, x, bb); } : fn; }
/* reading order 0..1 of every glyph (spaces skipped); single-glyph items use their mi within the cut */
function orders(env, it) {
  const lay = layOf(it), out = new Array(lay.N).fill(0);
  const idx = []; for (const g of lay) if (!isSp(g.ch)) idx.push(g.i);
  const n = idx.length;
  if (n <= 1) { const N = cutN(env); const o = N > 1 ? clamp((+it.mi || 0) / (N - 1)) : 0; idx.forEach(i => { out[i] = o; }); return out; }
  idx.forEach((i, k) => { out[i] = k / (n - 1); });
  return out;
}
/* key glyph (first kanji of the longest kanji run, else first plain glyph) → layout index */
function keyOf(lay) {
  let best = -1, bl = 0;
  for (let i = 0; i < lay.length; i++) {
    if (!J.isKanji(lay[i].ch)) continue;
    let j = i; while (j < lay.length && J.isKanji(lay[j].ch)) j++;
    if (j - i > bl) { bl = j - i; best = i; }
    i = j;
  }
  if (best >= 0) return lay[best].i;
  // latin: first letter of the longest word
  let wb = -1, wl = 0;
  for (let i = 0; i < lay.length; i++) {
    if (!/[A-Za-z0-9]/.test(lay[i].ch)) continue;
    let j = i; while (j < lay.length && /[A-Za-z0-9'’]/.test(lay[j].ch)) j++;
    if (j - i > wl) { wl = j - i; wb = i; }
    i = j;
  }
  if (wb >= 0) return lay[wb].i;
  for (const g of lay) if (!isSp(g.ch) && !J.isPunct(g.ch) && !J.isSmallKana(g.ch)) return g.i;
  return lay.length ? lay[0].i : 0;
}
/* per text line (vertical: per column): extents along the reading axis + cross position, in item-local units (sx/sy applied) */
function lineInfo(it) {
  const lay = layOf(it), sx = it.sx || 1, sy = it.sy || 1, map = new Map();
  for (const g of lay) {
    if (isSp(g.ch)) continue;
    const a0 = it.vertical ? (g.y - g.h / 2) * sy : (g.x - g.w / 2) * sx, a1 = it.vertical ? (g.y + g.h / 2) * sy : (g.x + g.w / 2) * sx;
    const L = map.get(g.li);
    if (!L) map.set(g.li, { li: g.li, a0, a1, c: it.vertical ? g.x * sx : g.y * sy });
    else { L.a0 = Math.min(L.a0, a0); L.a1 = Math.max(L.a1, a1); }
  }
  return [...map.values()].sort((a, b) => a.li - b.li);
}
/* run fn in item-local space (translate + rotation), main pass only */
const inItem = (env, it, fn) => {
  if (env.pass !== 'main') return;
  const ctx = env.ctx; ctx.save(); ctx.translate(it.x, it.y); if (it.rot) ctx.rotate(it.rot * DEG);
  try { fn(); } finally { ctx.restore(); }
};
/* item box in design space (unrotated) */
const boxOf = it => { it._m = J.measure(it); return J.itemBox(it); };

/* ================================================================== ENTRANCES */

/* キー字先行 — the key glyph lands first (big → size), the rest slide out from behind it */
reg('enter', 'tyKeyFirst', {
  name: 'キー字先行', tags: ['pop', 'graphic', 'editorial', 'emotional'], ae: 'pop', w: 1,
  apply(env, it, p) {
    const lay = layOf(it), sx = it.sx || 1, sy = it.sy || 1;
    const plain = lay.filter(g => !isSp(g.ch));
    if (plain.length <= 1) {
      const q = clamp(p / 0.7);
      it.charFns.push(() => (q <= 0 ? HIDE : { s: lerp(1.9, 1, E.outExpo(q)), a: clamp(q * 4) }));
      return;
    }
    const ki = keyOf(lay), gk = lay.find(g => g.i === ki) || plain[0];
    let md = 1; for (const g of plain) md = Math.max(md, Math.abs(g.i - ki));
    const kq = clamp(p / 0.42);
    it.charFns.push((i, g) => {
      if (i === ki) return kq <= 0 ? HIDE : { s: lerp(2.1, 1, E.outExpo(kq)), a: clamp(kq * 4) };
      const d = Math.abs(i - ki) / md, q = clamp((p - 0.3 - d * 0.35) / 0.35);
      if (q <= 0) return HIDE;
      const e = E.outExpo(q);
      return { dx: (gk.x - g.x) * sx * (1 - e), dy: (gk.y - g.y) * sy * (1 - e), s: lerp(0.4, 1, e), a: clamp(q * 2.5) };
    });
  },
});

/* 行送りワイプ — each line is wiped on in turn, an accent rule running ahead under it */
reg('enter', 'tyLineWipe', {
  name: '行送りワイプ', tags: ['editorial', 'graphic', 'calm'], ae: 'wipe', w: 1,
  apply(env, it, p) {
    const lines = lineInfo(it), nL = Math.max(1, lines.length), st = Math.min(0.28, 0.6 / nL);
    const qOf = li => { const k = lines.findIndex(L => L.li === li); return E.inOutCubic(clamp((p - Math.max(0, k) * st) / (1 - (nL - 1) * st))); };
    const qs = new Map(lines.map(L => [L.li, qOf(L.li)]));
    const sx = it.sx || 1, sy = it.sy || 1, V = !!it.vertical;
    it.charFns.push((i, g) => {
      const q = qs.get(g.li) ?? 1; if (q >= 1) return null;
      const L = lines.find(l => l.li === g.li); if (!L) return null;
      const edge = lerp(L.a0, L.a1, q);
      const start = V ? (g.y - g.h / 2) * sy : (g.x - g.w / 2) * sx, len = V ? g.h * sy : g.w * sx;
      const f = (edge - start) / Math.max(1, len);
      if (f <= 0) return HIDE;
      if (f >= 1) return null;
      const lim = -0.6 + 1.2 * f;
      return V ? { clipY: [-0.7, lim] } : { clipX: [-0.7, lim] };
    });
    const ac = accentOf(env), lw = Math.max(2, it.size * 0.05);
    addPost(it, (e, i) => inItem(e, i, () => {
      for (const L of lines) {
        const q = qs.get(L.li); if (q >= 1) continue;
        const a = lerp(L.a0, L.a1, E.inCubic(clamp(q * 1.4 - 0.4))), b = lerp(L.a0, L.a1, q);
        if (b - a < 1) continue;
        const off = L.c + i.size * (V ? sx : sy) * 0.64;
        e.line(V ? [[off, a], [off, b]] : [[a, off], [b, off]], ac, lw, i.alpha ?? 1, false);
      }
    }));
  },
});

/* 一字ずつ拡大 — glyphs are flashed one at a time, large in the middle, then set into their slot */
reg('enter', 'tyZoomOne', {
  name: '一字ずつ拡大', tags: ['pop', 'graphic', 'emotional'], ae: 'zoom', w: 0.8, minDur: 1.0,
  inDur: (dur, n) => J.clamp(0.14 * n + 0.2, 0.4, Math.min(1.5, dur * 0.55)),
  apply(env, it, p) {
    const lay = layOf(it), sx = it.sx || 1, sy = it.sy || 1;
    const plain = lay.filter(g => !isSp(g.ch)), nn = plain.length;
    if (!nn) return;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const g of plain) { x0 = Math.min(x0, g.x - g.w / 2); x1 = Math.max(x1, g.x + g.w / 2); y0 = Math.min(y0, g.y - g.h / 2); y1 = Math.max(y1, g.y + g.h / 2); }
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const big = clamp(Math.min(env.W, env.H) * 0.5 / Math.max(1, it.size * Math.max(sx, sy)), 1.15, 2.6);
    const L = nn > 1 ? Math.min(0.55, 2.2 / (nn + 1)) : 1;
    const rank = new Map(plain.map((g, k) => [g.i, k]));
    const single = nn === 1 && cutN(env) > 1;
    it.charFns.push((i, g) => {
      const k = rank.get(i); if (k == null) return null;
      const s0 = nn > 1 ? k / (nn - 1) * (1 - L) : 0;
      const q = clamp((p - s0) / L);
      if (q <= 0) return HIDE;
      if (single) return { s: lerp(big, 1, E.outExpo(q)), a: clamp(q * 5) };
      const cx = (mx - g.x) * sx, cy = (my - g.y) * sy;
      if (q < 0.38) { const u = E.outCubic(q / 0.38); return { dx: cx, dy: cy, s: lerp(big * 1.25, big, u), a: clamp(q / 0.1) }; }
      const e = E.inOutCubic((q - 0.38) / 0.62);
      return { dx: cx * (1 - e), dy: cy * (1 - e), s: lerp(big, 1, e) };
    });
  },
});

/* 下線から立つ — an underline is drawn, the glyphs grow up out of it, the line then retracts */
reg('enter', 'tyUnderLift', {
  name: '下線から立つ', tags: ['editorial', 'graphic', 'pop'], ae: 'stretch', w: 1,
  apply(env, it, p) {
    const lines = lineInfo(it), ord = orders(env, it), V = !!it.vertical, sx = it.sx || 1, sy = it.sy || 1;
    const multi = layOf(it).filter(g => !isSp(g.ch)).length > 1;
    it.charFns.push((i, g) => {
      const o = multi ? ord[i] : 0, q = clamp((p - 0.22 - o * 0.38) / 0.4);
      if (q <= 0) return HIDE;
      if (q >= 1) return null;
      const e = Math.max(0.02, E.outBack(q, 1.5));
      return V ? { sx: e, dx: -(1 - e) * g.w * sx * 0.45 } : { sy: e, dy: (1 - e) * g.h * sy * 0.45 };
    });
    const qb = E.outExpo(clamp(p / 0.32)), qr = E.inCubic(clamp((p - 0.72) / 0.28)), ac = accentOf(env);
    addPost(it, (e, i) => inItem(e, i, () => {
      const lw = Math.max(2.5, i.size * 0.055);
      for (const L of lines) {
        const a = lerp(L.a0, L.a1, qr), b = lerp(L.a0, L.a1, qb);
        if (b - a < 1) continue;
        const off = V ? L.c - i.size * sx * 0.56 : L.c + i.size * sy * 0.56;
        e.line(V ? [[off, a], [off, b]] : [[a, off], [b, off]], ac, lw, i.alpha ?? 1, false);
      }
    }));
  },
});

/* 点から字 — every glyph starts as a middle dot (・) that pops and turns into the glyph */
reg('enter', 'tyDotGrow', {
  name: '点から字', tags: ['pop', 'calm', 'graphic'], ae: 'pop', w: 0.9,
  apply(env, it, p) {
    const ord = orders(env, it), ac = accentOf(env);
    it.charFns.push((i) => {
      const t0 = ord[i] * 0.5, q1 = clamp((p - t0) / 0.18), q2 = clamp((p - t0 - 0.2) / 0.3);
      if (q1 <= 0) return HIDE;
      if (q2 <= 0) return { ch: '・', s: 1.25 * E.outBack(q1, 2.6), color: ac };
      if (q2 >= 1) return null;
      return { s: lerp(0.3, 1, E.outBack(q2, 1.8)), a: clamp(q2 * 3) };
    });
  },
});

/* 括弧が開く — 「 」 start together in the middle and slide apart, revealing the line between them */
const drawBrackets = (e, V, cx, cy, half, w, h, size, col, a) => {
  if (a <= 0.01) return;
  const g = size * 0.18, L = Math.max(size * 0.28, (V ? w : h) * 0.3), lw = Math.max(2, size * 0.055);
  if (!V) {
    const xl = cx - half - g, xr = cx + half + g, yt = cy - h / 2 - g * 0.5, yb = cy + h / 2 + g * 0.5;
    e.line([[xl, yt + L], [xl, yt], [xl + L, yt]], col, lw, a, false);
    e.line([[xr, yb - L], [xr, yb], [xr - L, yb]], col, lw, a, false);
  } else {
    const yt = cy - half - g, yb = cy + half + g, xr = cx + w / 2 + g * 0.5, xl = cx - w / 2 - g * 0.5;
    e.line([[xr - L, yt], [xr, yt], [xr, yt + L]], col, lw, a, false);
    e.line([[xl + L, yb], [xl, yb], [xl, yb - L]], col, lw, a, false);
  }
};
reg('enter', 'tyBracketOpen', {
  name: '括弧が開く', tags: ['editorial', 'graphic', 'pop'], ae: 'wipe', w: 0.9,
  apply(env, it, p) {
    const b = boxOf(it), V = !!it.vertical, pad = it.size * 0.12;
    const e = E.inOutCubic(clamp((p - 0.08) / 0.62));
    const half = ((V ? b.h : b.w) / 2 + pad) * e;
    if (V) it.clipY = [b.cy - half, b.cy + half]; else it.clip = [b.cx - half, b.cx + half];
    const solo = layOf(it).filter(g => !isSp(g.ch)).length <= 1 && cutN(env) > 1;
    const a = solo ? 0 : clamp(p / 0.08) * (1 - clamp((p - 0.78) / 0.22)), col = accentOf(env);
    addPost(it, (en) => { if (en.pass === 'main') drawBrackets(en, V, b.cx, b.cy, half, b.w, b.h, it.size, col, a); });
  },
});

/* 打ち直し — typed in with a cursor; one glyph is mistyped, deleted and typed again */
reg('enter', 'tyRetype', {
  name: '打ち直し', tags: ['editorial', 'glitch', 'emotional'], ae: 'type', w: 0.8, minDur: 1.0, cursor: true,
  inDur: (dur, n) => J.clamp(0.1 * n + 0.4, 0.45, Math.min(1.5, dur * 0.55)),
  apply(env, it, p) {
    const lay = layOf(it), N = lay.N;
    const plain = lay.filter(g => !isSp(g.ch));
    const seed = it.seed | 0;
    if (plain.length <= 1) { it.charFns.push(() => (p < 0.35 ? HIDE : null)); return; }
    let wi = -1;
    if (plain.length >= 3) wi = plain[1 + (J.h(seed, 31) % (plain.length - 1))].i;
    const S = N + (wi >= 0 ? 2 : 0);
    const k = Math.floor(clamp(p) * (S + 0.999));
    let shown, wrong = false;
    if (wi < 0 || k <= wi) shown = Math.min(N, k);
    else if (k === wi + 1) { shown = wi + 1; wrong = true; }
    else if (k === wi + 2) shown = wi;
    else shown = Math.min(N, k - 2);
    const pool = J.pool('kana') || 'あいうえお';
    const wch = [...pool][J.h(seed, 32) % [...pool].length];
    const ac = accentOf(env);
    it.charFns.push((i) => {
      if (i >= shown) return HIDE;
      if (wrong && i === wi) return { ch: wch === lay[wi].ch ? '＊' : wch, color: ac };
      return null;
    });
    it.cursorAt = p < 1 && !it.vertical && !it.rot ? shown : -1;
  },
});

/* ルビから — each glyph appears small in the ruby position above its slot, then drops and grows into place */
reg('enter', 'tyRubyDrop', {
  name: 'ルビから', tags: ['calm', 'editorial', 'emotional'], ae: 'drop', w: 1,
  apply(env, it, p) {
    const ord = orders(env, it), V = !!it.vertical, sx = it.sx || 1, sy = it.sy || 1, sub = subOf(env);
    it.charFns.push((i, g) => {
      const q = clamp((p - ord[i] * 0.45) / 0.55);
      if (q <= 0) return HIDE;
      if (q >= 1) return null;
      const off = V ? g.w * sx * 0.8 : -g.h * sy * 0.8;
      if (q < 0.4) { const a = clamp(q / 0.4 * 1.6); return V ? { dx: off, s: 0.32, a, color: sub } : { dy: off, s: 0.32, a, color: sub }; }
      const e = E.outCubic((q - 0.4) / 0.6), o = { s: lerp(0.32, 1, e) };
      if (V) o.dx = off * (1 - e); else o.dy = off * (1 - e);
      if (e < 0.55) o.color = sub;
      return o;
    });
  },
});

/* ================================================================== EXITS */

/* 線で消す — a strike line is drawn through each line, the glyphs collapse onto it, then the line retracts */
reg('exit', 'tyStrike', {
  name: '線で消す', tags: ['editorial', 'graphic', 'emotional'], ae: 'wipe', w: 1,
  apply(env, it, p) {
    const lines = lineInfo(it), ord = orders(env, it), V = !!it.vertical;
    it.charFns.push((i) => {
      const q = clamp((p - 0.3 - ord[i] * 0.3) / 0.4);
      if (q <= 0) return null;
      if (q >= 1) return HIDE;
      const e = E.inCubic(q);
      return V ? { sx: 1 - e * 0.95, a: 1 - e * e } : { sy: 1 - e * 0.95, a: 1 - e * e };
    });
    const ql = E.outExpo(clamp(p / 0.38)), qr = E.inCubic(clamp((p - 0.74) / 0.26)), ac = accentOf(env), sx = it.sx || 1, sy = it.sy || 1;
    addPost(it, (e, i) => inItem(e, i, () => {
      const lw = Math.max(2.5, i.size * 0.07);
      for (const L of lines) {
        const pad = i.size * 0.1, a0 = L.a0 - pad, a1 = L.a1 + pad;
        const a = lerp(a0, a1, qr), b = lerp(a0, a1, ql);
        if (b - a < 1) continue;
        const off = L.c + i.size * (V ? sx : sy) * 0.04;
        e.line(V ? [[off, a], [off, b]] : [[a, off], [b, off]], ac, lw, 1, false);
      }
    }));
  },
});

/* 点に戻る — glyphs shrink into middle dots (・), which then wink out */
reg('exit', 'tyToDot', {
  name: '点に戻る', tags: ['calm', 'pop', 'graphic'], ae: 'shrink', w: 0.9,
  apply(env, it, p) {
    const ord = orders(env, it), ac = accentOf(env);
    it.charFns.push((i) => {
      const q = clamp((p - ord[i] * 0.4) / 0.6);
      if (q <= 0) return null;
      if (q >= 1) return HIDE;
      if (q < 0.5) return { s: lerp(1, 0.3, E.inCubic(q / 0.5)) };
      const u = (q - 0.5) / 0.5;
      return { ch: '・', color: ac, s: 1.5 * (1 - E.inCubic(u)), a: 1 - u * u };
    });
  },
});

/* 改行送り — the text line-feeds upward in three steps and leaves through a window */
reg('exit', 'tyLineFeed', {
  name: '改行送り', tags: ['editorial', 'calm', 'graphic'], ae: 'wipe', w: 1,
  apply(env, it, p) {
    const b = boxOf(it), V = !!it.vertical, pad = it.size * 0.12;
    const k = clamp(p) * 3, st = Math.min(3, Math.floor(k)), f = k - st;
    const step = Math.min(1, (st + E.outCubic(clamp(f * 2.6))) / 3);
    const dist = (V ? b.w : b.h) + it.size * 0.3;
    if (V) { it.clip = [b.x0 - pad, b.x1 + pad]; it.x += dist * step; }
    else { it.clipY = [b.y0 - pad, b.y1 + pad]; it.y -= dist * step; }
    if (p >= 0.999) it.alpha = 0;
  },
});

/* 括弧閉じ — 「 」 appear at the ends and close in to the middle, taking the line with them */
reg('exit', 'tyBracketClose', {
  name: '括弧閉じ', tags: ['editorial', 'graphic', 'pop'], ae: 'wipe', w: 0.9,
  apply(env, it, p) {
    const b = boxOf(it), V = !!it.vertical, pad = it.size * 0.12;
    const e = E.inOutCubic(clamp((p - 0.12) / 0.7));
    const half = ((V ? b.h : b.w) / 2 + pad) * (1 - e);
    if (V) it.clipY = [b.cy - half, b.cy + half]; else it.clip = [b.cx - half, b.cx + half];
    if (e >= 1) it.alpha = 0;
    const solo = layOf(it).filter(g => !isSp(g.ch)).length <= 1 && cutN(env) > 1;
    const a = solo ? 0 : clamp(p / 0.12) * (1 - clamp((p - 0.84) / 0.16)), col = accentOf(env);
    addPost(it, (en) => { if (en.pass === 'main') drawBrackets(en, V, b.cx, b.cy, half, b.w, b.h, it.size, col, a); });
  },
});

/* 番号に変わる — each glyph turns into its small index number, then the numbers fade */
reg('exit', 'tyToIndex', {
  name: '番号に変わる', tags: ['editorial', 'glitch', 'graphic'], ae: 'scatter', w: 0.8,
  apply(env, it, p) {
    const lay = layOf(it), ord = orders(env, it), sub = subOf(env), V = !!it.vertical;
    const num = new Map(); let k = 0;
    const plain = lay.filter(g => !isSp(g.ch));
    const base = plain.length <= 1 ? Math.round(+it.mi || 0) : 0;
    for (const g of plain) num.set(g.i, String(base + (++k)).padStart(2, '0'));
    it.charFns.push((i, g) => {
      const q = clamp((p - ord[i] * 0.4) / 0.6);
      if (q <= 0) return null;
      if (q >= 1) return HIDE;
      if (q < 0.3) return { s: lerp(1, 0.55, E.inCubic(q / 0.3)) };
      const u = (q - 0.3) / 0.7;
      const o = { ch: num.get(i) || '00', s: 0.42, color: sub, a: 1 - E.inCubic(u) };
      if (V) o.dx = -g.w * 0.2 * u; else o.dy = -g.h * 0.2 * u;
      return o;
    });
  },
});

/* 一字残し — everything folds into the key glyph, which then swells and fades */
reg('exit', 'tyKeyLast', {
  name: '一字残し', tags: ['emotional', 'pop', 'graphic'], ae: 'shrink', w: 0.9,
  apply(env, it, p) {
    const lay = layOf(it), sx = it.sx || 1, sy = it.sy || 1;
    const plain = lay.filter(g => !isSp(g.ch));
    const ki = plain.length > 1 ? keyOf(lay) : (plain[0] ? plain[0].i : 0);
    const gk = lay.find(g => g.i === ki) || plain[0];
    let md = 1; for (const g of plain) md = Math.max(md, Math.abs(g.i - ki));
    if (plain.length <= 1 && cutN(env) > 1) {
      // per-glyph layouts: only the cut's first kanji stays, the others simply shrink away
      const keep = J.isKanji((plain[0] || {}).ch || '') && (J.h(env.cut.seed | 0, Math.round(+it.mi || 0), 5) % 2 === 0);
      it.charFns.push(() => {
        if (!keep) { const q = clamp(p / 0.5); return q >= 1 ? HIDE : { s: 1 - 0.6 * E.inCubic(q), a: 1 - q }; }
        const q = clamp((p - 0.4) / 0.6); return q >= 1 ? HIDE : { s: 1 + E.inCubic(q) * 1.4, a: 1 - E.inCubic(q) };
      });
      return;
    }
    it.charFns.push((i, g) => {
      if (i === ki) { const q = clamp((p - 0.45) / 0.55); return q >= 1 ? HIDE : { s: 1 + E.inCubic(q) * 1.8, a: 1 - E.inCubic(q) }; }
      const d = Math.abs(i - ki) / md, q = clamp((p - (1 - d) * 0.2) / 0.45);
      if (q <= 0) return null;
      if (q >= 1) return HIDE;
      const e = E.inCubic(q);
      return { dx: (gk.x - g.x) * sx * e, dy: (gk.y - g.y) * sy * e, s: 1 - 0.6 * e, a: 1 - e };
    });
  },
});

/* 下線へ沈む — an underline is drawn, each glyph sinks into it (masked at the line), then the line retracts */
reg('exit', 'tyUnderSink', {
  name: '下線へ沈む', tags: ['editorial', 'calm', 'graphic'], ae: 'fall', w: 1,
  apply(env, it, p) {
    const lines = lineInfo(it), ord = orders(env, it), V = !!it.vertical, sx = it.sx || 1, sy = it.sy || 1;
    it.charFns.push((i, g) => {
      const q = clamp((p - 0.2 - ord[i] * 0.4) / 0.35);
      if (q <= 0) return null;
      if (q >= 1) return HIDE;
      const e = E.inCubic(q), d = e * 1.25;
      return V ? { dx: -g.w * sx * d, clipX: [-0.55 + d, 0.7] } : { dy: g.h * sy * d, clipY: [-0.7, 0.55 - d] };
    });
    const qb = E.outExpo(clamp(p / 0.28)), qr = E.inCubic(clamp((p - 0.78) / 0.22)), ac = accentOf(env);
    addPost(it, (e, i) => inItem(e, i, () => {
      const lw = Math.max(2.5, i.size * 0.05);
      for (const L of lines) {
        const a = lerp(L.a0, L.a1, qr), b = lerp(L.a0, L.a1, qb);
        if (b - a < 1) continue;
        const off = V ? L.c - i.size * sx * 0.56 : L.c + i.size * sy * 0.56;
        e.line(V ? [[off, a], [off, b]] : [[a, off], [b, off]], ac, lw, 1, false);
      }
    }));
  },
});

/* 縦組に折れる — a horizontal line folds down into a vertical column (a column folds into a row), then fades */
reg('exit', 'tyFoldVert', {
  name: '縦組に折れる', tags: ['graphic', 'editorial', 'pop'], ae: 'fall', w: 0.9,
  apply(env, it, p) {
    const lay = layOf(it), V = !!it.vertical, sx = it.sx || 1, sy = it.sy || 1;
    const ln = new Map();
    for (const g of lay) { if (isSp(g.ch)) continue; const L = ln.get(g.li) || { gs: [], c0: 1e9, c1: -1e9 }; L.gs.push(g); L.c0 = Math.min(L.c0, V ? g.y : g.x); L.c1 = Math.max(L.c1, V ? g.y : g.x); ln.set(g.li, L); }
    const e = E.inOutCubic(clamp(p / 0.5)), f = clamp((p - 0.36) / 0.5);
    it.charFns.push((i, g) => {
      if (f >= 1) return HIDE;
      const L = ln.get(g.li); if (!L) return null;
      const k = Math.max(0, L.gs.findIndex(q => q.i === g.i)), n = L.gs.length, mid = (L.c0 + L.c1) / 2;
      const pitch = Math.min(1.02, (V ? env.W : env.H) * 0.82 / Math.max(1, n * (V ? g.w * sx : g.h * sy)));
      const off = (k - (n - 1) / 2) * pitch;
      let dx, dy;
      if (!V) { dx = (mid - g.x) * sx; dy = off * g.h * sy; }
      else { dy = (mid - g.y) * sy; dx = off * g.w * sx; }
      const drift = E.inQuad(f) * it.size * 0.25;
      return { dx: dx * e - (V ? drift : 0), dy: dy * e + (V ? 0 : drift), a: 1 - E.inQuad(f) };
    });
  },
});

/* ================================================================== HOLDS */

/* 一字の鼓動 — only the key glyph pulses (on the beat when there is one) */
reg('hold', 'tyKeyPulse', {
  name: '一字の鼓動', tags: ['emotional', 'pop', 'calm'], ae: 'breathe', w: 1,
  apply(env, it, amt) {
    const lay = layOf(it), plain = lay.filter(g => !isSp(g.ch));
    if (!plain.length) return;
    const b = env.beat;
    const pulse = b ? Math.exp(-b.since / Math.max(0.12, b.len * 0.35)) : Math.pow(0.5 + 0.5 * Math.sin(env.ltb * J.TAU * 0.95), 4);
    const k = 0.1 * amt * motionK(env) * pulse;
    if (k < 0.002) return;
    if (plain.length === 1) {
      if (!J.isKanji(plain[0].ch)) return;
      it.charFns.push(() => ({ s: 1 + k * 0.7 }));
      return;
    }
    const ki = keyOf(lay);
    it.charFns.push((i) => (i === ki ? { s: 1 + k } : null));
  },
});

/* 読み送り — a reading cursor steps along the line: the current glyph lifts a little in the accent colour */
reg('hold', 'tyReadCursor', {
  name: '読み送り', tags: ['calm', 'editorial', 'pop'], ae: 'wave', w: 1,
  apply(env, it, amt) {
    if (amt < 0.3) return;
    const lay = layOf(it), plain = lay.filter(g => !isSp(g.ch)), n = plain.length;
    if (!n) return;
    const ac = accentOf(env), V = !!it.vertical, lift = it.size * 0.07 * Math.min(1, motionK(env));
    const rate = env.beat ? 1 / Math.max(0.2, env.beat.len) : 4;
    const tot = n <= 1 ? cutN(env) : n;
    const pos = Math.floor(env.ltb * rate) % (tot + 2);
    const frac = (env.ltb * rate) % 1, up = E.outCubic(clamp(frac * 4)) * (1 - E.inCubic(clamp((frac - 0.6) / 0.4)));
    if (n <= 1) {
      if (Math.round(+it.mi || 0) % (tot + 2) !== pos) return;
      it.charFns.push(() => (V ? { dx: lift * up, color: ac } : { dy: -lift * up, color: ac }));
      return;
    }
    const gi = pos < n ? plain[pos].i : -1;
    it.charFns.push((i) => (i === gi ? (V ? { dx: lift * up, color: ac } : { dy: -lift * up, color: ac }) : null));
  },
});

/* 白抜き明滅 — now and then one glyph switches to outline only for a moment */
reg('hold', 'tyOutlineBlink', {
  name: '白抜き明滅', tags: ['glitch', 'graphic', 'pop'], ae: 'glitchtick', w: 0.9,
  apply(env, it, amt) {
    const lay = layOf(it), plain = lay.filter(g => !isSp(g.ch));
    if (!plain.length) return;
    const seed = it.seed | 0, st = env.step >> 1;
    if (J.r(seed, st, 41) > 0.28 * amt * (0.5 + 0.5 * motionK(env)) / (plain.length === 1 ? Math.max(1, cutN(env) * 0.5) : 1)) return;
    const pick = plain[J.h(seed, st, 42) % plain.length].i;
    const two = plain.length > 3 && J.r(seed, st, 43) < 0.3 ? plain[J.h(seed, st, 44) % plain.length].i : -1;
    it.charFns.push((i) => (i === pick || i === two ? { outline: true } : null));
  },
});

/* 字間ステップ — letter spacing snaps between a few set values (on the beat), like a typographer trying options */
reg('hold', 'tyTrackStep', {
  name: '字間ステップ', tags: ['graphic', 'editorial', 'pop'], ae: 'breathe', w: 0.8,
  apply(env, it, amt) {
    if (layOf(it).filter(g => !isSp(g.ch)).length < 2) return;
    const len = env.beat ? Math.max(0.25, env.beat.len) : 0.55;
    const t = env.ltb / len, k = Math.floor(t), f = t - k;
    const lv = [0, 1, 2, 1], a = lv[k % 4], b = lv[(k + 1) % 4];
    const v = lerp(a, b, E.outExpo(clamp((f - 0.85) / 0.15)));
    it.track = (it.track || 0) + v * 0.05 * amt * Math.min(1.2, motionK(env));
    it._m = null; it._lay = null;
  },
});

})();

/* JIZURA pack: typo (part 3) — typographic decor (colophon, running head, glyph bodies, text rules, type scale, big quote marks),
   text treatments (hollow key glyph, head / foot rules, large head glyph, glyph indices) and two type-driven transitions */
(() => {
'use strict';
const E = J.E;
const P = 'typo';
const SET = 'typo';
const reg = (g, key, def) => J.register(g, key, Object.assign({ set: SET }, def), P);
const clamp = J.clamp, lerp = J.lerp, DEG = J.DEG;

/* ------------------------------------------------------------------ shared helpers */
const U = env => Math.min(env.W, env.H) / 1080;
const MG = env => Math.round(Math.min(env.W, env.H) * 0.05);
const monoF = env => (env.st.fonts.mono && env.st.fonts.mono[0]) || 'mono';
const bodyF = env => (env.st.fonts.body && env.st.fonts.body[0]) || 'gothic_med';
const outE = env => 1 - E.inCubic(env.pOut);
const inE = (env, d = 0.4, delay = 0) => E.outExpo(clamp((env.lt - delay) / d));
const pad2 = n => String(n).padStart(2, '0');
const FS = env => Math.max(11, 16 * U(env));
const isSp = c => c === ' ' || c === '　';
const accentOf = sc => (J.contrast(sc.accent, sc.bg) >= 1.8 ? sc.accent : sc.fg);
const bw = bb => bb.x1 - bb.x0, bh = bb => bb.y1 - bb.y0;
const hitBB = (x0, y0, x1, y1, bb, pad = 0) => !(x1 < bb.x0 - pad || x0 > bb.x1 + pad || y1 < bb.y0 - pad || y0 > bb.y1 + pad);
/* remember the last real bbox of a cut so decor does not jump while the lyric is hidden */
const BBC = new WeakMap();
const getBB = (env, bb) => {
  if (bb && isFinite(bb.x0 + bb.x1 + bb.y0 + bb.y1) && bb.x1 > bb.x0 && bb.y1 > bb.y0) {
    const b = { x0: Math.max(bb.x0, -env.W * 0.1), x1: Math.min(bb.x1, env.W * 1.1), y0: Math.max(bb.y0, -env.H * 0.1), y1: Math.min(bb.y1, env.H * 1.1), boxes: bb.boxes || [], cx: bb.cx, cy: bb.cy };
    if (env.cut) BBC.set(env.cut, b);
    return b;
  }
  const c = env.cut && BBC.get(env.cut);
  return c || Object.assign({ boxes: [] }, J.centerBB(env, null));
};
/* a screen corner (inside the margin) clear of the lyric; ok=false when none is free */
function cornerSpot(env, bb, w, h, P) {
  const { W, H } = env, m = MG(env);
  const sx0 = P.right ? 1 : -1, sy0 = P.low ? 1 : -1;
  for (const [sx, sy] of [[sx0, sy0], [-sx0, sy0], [sx0, -sy0], [-sx0, -sy0]]) {
    const X = sx > 0 ? W - m - w : m, Y = sy > 0 ? H - m - h : m;
    if (!hitBB(X, Y, X + w, Y + h, bb, 14 * U(env))) return { x: X, y: Y, ok: true, sx, sy };
  }
  return { x: m, y: m, ok: false, sx: -1, sy: -1 };
}
const label = (env, text, x, y, o = {}) => env.draw({ text: String(text), font: o.font || monoF(env), size: o.size || FS(env), x, y, align: o.align || 'left', track: o.track ?? 0.12, color: o.color || env.sc.sub, alpha: o.alpha ?? 1, ghost: false });
const textW = (text, font, size, track = 0.12) => J.measure({ text, font, size, track }).w;
const keyChar = (text) => {
  const arr = [...String(text || '')];
  const k = arr.find(c => J.isKanji(c)) || arr.find(c => !isSp(c) && !J.isPunct(c) && !J.isSmallKana(c)) || arr.find(c => !isSp(c));
  return k || null;
};
/* glyph edge positions of the lyric (x for horizontal lines of text), from the bbox glyph boxes or evenly spread */
const glyphEdges = (env, bb) => {
  const out = [];
  if (bb.boxes && bb.boxes.length && bb.cx != null && bb.boxes.length <= 40) {
    for (const b of bb.boxes) { const x0 = bb.cx + b.x - b.w / 2, x1 = bb.cx + b.x + b.w / 2; if (x0 > bb.x0 - 4 && x1 < bb.x1 + 4) out.push(x0, x1); }
  }
  if (out.length < 2) {
    const n = Math.max(1, Math.min(16, J.glyphCount(String(env.cut.text || ''))));
    for (let i = 0; i <= n; i++) out.push(lerp(bb.x0, bb.x1, i / n));
  }
  out.sort((a, b) => a - b);
  const ded = []; for (const x of out) if (!ded.length || x - ded[ded.length - 1] > 3) ded.push(x);
  return ded.slice(0, 34);
};

/* ================================================================== DECOR */

/* 奥付 — a small colophon block (line, time, glyph count, reading) typed into a free corner, with a hairline */
reg('decor', 'tyColophon', {
  name: '奥付', tags: ['editorial', 'calm', 'graphic'], ae: 'leaders', w: 1, layer: 'front',
  draw(env, bb0, Pd) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { sc } = env, cut = env.cut, u = U(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const fs = FS(env) * 1.1, lead = fs * 1.7;
    const txt = String(cut.text || '').trim(), raw = txt.replace(/\s+/g, '');
    const rj = J.romaji(raw); const rom = rj && /[ぁ-ヿ]/.test(raw) ? rj.toUpperCase() : null;
    const lt = String(cut.lineText || txt).replace(/\s+/g, ' ').trim();
    const lines = [
      [lt.length > 18 ? [...lt].slice(0, 17).join('') + '…' : lt, bodyF(env), sc.fg],
      [`No.${pad2((cut.line | 0) + 1)}  ${J.fmtTime(cut.start)} – ${J.fmtTime(cut.end)}`, monoF(env), sc.sub],
      [`${J.glyphCount(txt)} CHARS${rom ? '  /  ' + (rom.length > 16 ? rom.slice(0, 15) + '…' : rom) : ''}`, monoF(env), sc.sub],
    ];
    let w = 0; for (const [t, f] of lines) w = Math.max(w, textW(t, f, fs));
    const h = lead * lines.length;
    const sp = cornerSpot(env, bb, w + fs * 1.4, h, Object.assign({}, Pd, { low: Pd.low !== false }));
    if (!sp.ok) return;
    const x = sp.x + fs * 1.4, e = inE(env, 0.6) * o;
    env.line([[sp.x, sp.y], [sp.x, sp.y + h * e]], accentOf(sc), Math.max(1.5, 2 * u), o, false);
    lines.forEach(([t, f, c], i) => {
      const arr = [...t], k = Math.floor(arr.length * clamp((env.lt - 0.1 - i * 0.14) / 0.45));
      if (k > 0) label(env, arr.slice(0, k).join(''), x, sp.y + lead * (i + 0.5), { font: f, size: fs, color: c, alpha: o * (i ? 0.85 : 1) });
    });
  },
});

/* 柱とノンブル — a running head (line number + lyric line + hairline) at the top and a folio number at the bottom */
reg('decor', 'tyRunningHead', {
  name: '柱とノンブル', tags: ['editorial', 'calm'], ae: 'timecodeBar', w: 1, layer: 'front',
  draw(env, bb0, Pd) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { W, H, sc } = env, cut = env.cut, u = U(env), m = MG(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const fs = FS(env) * 0.9, e = inE(env, 0.7) * o, lw = Math.max(1, u);
    const yH = m + fs * 0.6;
    if (!hitBB(0, yH - fs, W, yH + fs, bb, 8 * u)) {
      const head = `${pad2((cut.line | 0) + 1)}　${String(cut.lineText || cut.text || '').replace(/\s+/g, ' ').trim()}`;
      const hs = [...head].slice(0, 30).join('');
      const tw = textW(hs, bodyF(env), fs, 0.2);
      const right = !!Pd.right;
      const x0 = right ? W - m - tw : m;
      label(env, hs, x0, yH, { font: bodyF(env), size: fs, color: sc.sub, alpha: e, track: 0.2 });
      const a0 = right ? x0 - fs : x0 + tw + fs, a1 = right ? m : W - m;
      if ((a1 - a0) * (right ? -1 : 1) > 20) env.line([[a0, yH], [lerp(a0, a1, e), yH]], sc.sub, lw, 0.6 * o, false);
    }
    const yF = H - m - fs * 0.2;
    const folio = String((cut.index | 0) + 1).padStart(3, '0');
    const fw = textW(folio, monoF(env), fs * 1.3, 0.2);
    const xF = Pd.right ? m + fw / 2 : W - m - fw / 2;
    if (!hitBB(xF - fw, yF - fs * 1.2, xF + fw, yF + fs, bb, 8 * u)) {
      const a = E.outCubic(clamp((env.lt - 0.2) / 0.4)) * o;
      label(env, folio, xF, yF, { size: fs * 1.3, align: 'center', color: sc.fg, alpha: a, track: 0.2 });
      env.line([[xF - fw * 0.9, yF - fs * 1.1], [xF + fw * 0.9, yF - fs * 1.1]], accentOf(sc), Math.max(1.5, 2 * u), a, false);
    }
  },
});

/* 字割り線 — hairlines at every glyph body edge run from the lyric out to the frame edges, like a type specimen */
reg('decor', 'tyGlyphBody', {
  name: '字割り線', tags: ['editorial', 'graphic', 'calm'], ae: 'guides', w: 0.9, layer: 'front',
  draw(env, bb0, Pd) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { W, H, sc } = env, u = U(env), m = MG(env) * 0.6;
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    if (bh(bb) > bw(bb) * 1.3) return;        // vertical lyrics: nothing to divide horizontally
    const xs = glyphEdges(env, bb), gap = 10 * u + bh(bb) * 0.06, lw = Math.max(1, 0.9 * u);
    const col = sc.sub, a = 0.45 * o;
    xs.forEach((x, i) => {
      const e = E.outExpo(clamp((env.lt - i * 0.015) / 0.7));
      if (e <= 0) return;
      const t0 = bb.y0 - gap, t1 = t0 - (t0 - m) * e, b0 = bb.y1 + gap, b1 = b0 + (H - m - b0) * e;
      if (t0 > m) env.line([[x, t0], [x, t1]], col, lw, a, false);
      if (b0 < H - m) env.line([[x, b0], [x, b1]], col, lw, a, false);
    });
    // body top / bottom lines out to the side margins
    const e = inE(env, 0.8, 0.1) * o, ac = accentOf(sc);
    for (const y of [bb.y0, bb.y1]) {
      env.line([[bb.x0 - gap, y], [bb.x0 - gap - (bb.x0 - gap - m) * e, y]], col, lw, a, false);
      env.line([[bb.x1 + gap, y], [bb.x1 + gap + (W - m - bb.x1 - gap) * e, y]], col, lw, a, false);
    }
    const fs = FS(env) * 0.75;
    if (bb.y0 - gap > m + fs * 2) label(env, `${pad2(J.glyphCount(String(env.cut.text || '')))} / W${Math.round(bw(bb) / u)}`, xs[0] + 4 * u, bb.y0 - gap - fs * 0.8, { size: fs, color: ac, alpha: e });
  },
});

/* 文字罫 — a rule made of tiny repeated lyric text runs along the top and bottom edges, drifting in opposite directions */
reg('decor', 'tyTextRule', {
  name: '文字罫', tags: ['editorial', 'graphic', 'calm'], ae: 'verticalStrip', w: 1, layer: 'front', subtle: true,
  draw(env, bb0, Pd) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { W, H, sc, ctx } = env, cut = env.cut, u = U(env), m = MG(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const fs = FS(env) * 0.72, font = (Pd.v | 0) % 2 ? monoF(env) : bodyF(env);
    const unit = String(cut.lineText || cut.text || '').replace(/\s+/g, ' ').trim() + '　／　';
    const per = textW(unit, font, fs, 0.18);
    if (per < 4) return;
    const rows = Pd.n >= 2 ? [m * 0.75, H - m * 0.75] : [Pd.low ? H - m * 0.75 : m * 0.75];
    rows.forEach((y, k) => {
      if (hitBB(0, y - fs, W, y + fs, bb, 6 * u)) return;
      const e = E.outExpo(clamp((env.lt - k * 0.1) / 0.8));
      const dir = k % 2 ? 1 : -1;
      const off = ((env.ltb * 26 * u * dir) % per + per) % per;
      const L = (W - m * 1.2) * e, x0 = (W - L) / 2;
      ctx.save(); ctx.beginPath(); ctx.rect(x0, y - fs, L, fs * 2); ctx.clip();
      env.draw({ text: unit.repeat(Math.min(30, Math.ceil(W * 1.2 / per) + 2)), font, size: fs, align: 'left', track: 0.18, x: x0 - per + off, y, color: sc.sub, alpha: 0.8 * o, ghost: false });
      ctx.restore();
      const ry = y + (k || Pd.low ? -1 : 1) * fs * 1.05;
      env.line([[x0, ry], [x0 + L, ry]], sc.sub, Math.max(1, 0.8 * u), 0.5 * o, false);
    });
  },
});

/* 級数見本 — the key glyph of the lyric set at five falling sizes on one baseline, each with its size, in a free corner */
reg('decor', 'tyTypeScale', {
  name: '級数見本', tags: ['editorial', 'graphic'], ae: 'indexNum', w: 0.8, layer: 'front',
  draw(env, bb0, Pd) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { sc } = env, u = U(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const ch = keyChar(env.cut.text); if (!ch) return;
    const S0 = Math.min(env.W, env.H) * 0.085, ks = [1, 0.72, 0.52, 0.37, 0.26];
    const font = (Pd.v | 0) % 2 ? (env.st.fonts.serif && env.st.fonts.serif[0]) || 'mincho' : env.st.fonts.display[0];
    const gapK = 0.18;
    let w = 0; ks.forEach(k => { w += S0 * k * (1 + gapK); });
    const fs = FS(env) * 0.7, h = S0 + fs * 2.2;
    const sp = cornerSpot(env, bb, w, h, Pd);
    if (!sp.ok) return;
    const yb = sp.y + S0 * 0.95;
    let x = sp.x;
    ks.forEach((k, i) => {
      const s = S0 * k, a = E.outCubic(clamp((env.lt - 0.1 - i * 0.07) / 0.3)) * o;
      if (a > 0) {
        env.draw({ text: ch, font, size: s, x: x + s / 2, y: yb - s * 0.46, color: i ? sc.sub : sc.fg, alpha: a, ghost: false });
        label(env, String(Math.round(s / u * 0.75)), x + s / 2, yb + fs * 1.1, { size: fs, align: 'center', alpha: a * 0.9, track: 0.05 });
      }
      x += s * (1 + gapK);
    });
    const e = inE(env, 0.6) * o;
    env.line([[sp.x, yb + fs * 0.25], [sp.x + (x - sp.x) * e, yb + fs * 0.25]], accentOf(sc), Math.max(1, u), 0.8 * o, false);
  },
});

/* 大きな約物 — huge dim 「 」 (or 『 』 / “ ”) glyphs set behind the lyric at its opposite corners */
reg('decor', 'tyBigPunct', {
  name: '大きな約物', tags: ['editorial', 'emotional', 'graphic'], ae: 'bracketsJP', w: 0.9, layer: 'front',
  draw(env, bb0, Pd) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { W, H, sc } = env;
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const pairs = [['「', '」'], ['『', '』'], ['“', '”']];
    const [a0, a1] = pairs[(Pd.v | 0) % 3];
    const quote = (Pd.v | 0) % 3 === 2;
    const S = clamp(bh(bb) * (quote ? 1.6 : 2.1), Math.min(W, H) * 0.22, Math.min(W, H) * 0.55), gap = S * 0.04;
    const e = E.outCubic(clamp(env.lt / 0.7)), sl = (1 - e) * S * 0.25;
    const font = (env.st.fonts.serif && env.st.fonts.serif[0]) || 'mincho';
    const col = Pd.accent ? J.mix(sc.bg, sc.accent, 0.42) : J.mix(sc.bg, sc.fg, 0.2);
    // ink boxes: 「 sits in the upper right of its em box, 」 in the lower left, quotes high in the middle
    let xl, yt, xr, yb;
    if (!quote) { xl = bb.x0 - gap - 0.2 * S; yt = bb.y0 - gap + 0.4 * S; xr = bb.x1 + gap + 0.2 * S; yb = bb.y1 + gap - 0.4 * S; }
    else { xl = bb.x0 - gap - 0.22 * S; yt = bb.y0 + 0.42 * S; xr = bb.x1 + gap + 0.22 * S; yb = bb.y1 + 0.12 * S; }
    env.draw({ text: a0, font, size: S, x: xl - sl, y: yt - sl, color: col, alpha: e * o, ghost: false });
    env.draw({ text: a1, font, size: S, x: xr + sl, y: yb + sl, color: col, alpha: e * o, ghost: false });
  },
});

/* ================================================================== TREATMENTS */
const alive = (it, amin = 0.9) => it.fill !== false && (it.alpha ?? 1) >= amin && !!it.text && it.size > 1;
const addPost = (it, f) => { const p = it.post; it.post = p ? (e, i, b) => { p(e, i, b); f(e, i, b); } : f; };
const nonSp = it => [...String(it.text || '')].filter(c => !/\s/.test(c)).length;
/* per text line extents in item space (static layout) */
const lineSpans = (it) => {
  const lay = J.layoutText(it), sx = it.sx || 1, sy = it.sy || 1, map = new Map();
  for (const g of lay) {
    if (isSp(g.ch)) continue;
    if (it.charFn) { const c = it.charFn(g.i, g, lay.N); if (c && (c.hide || (c.a != null && c.a < 0.05))) continue; }
    const a0 = it.vertical ? (g.y - g.h / 2) * sy : (g.x - g.w / 2) * sx, a1 = it.vertical ? (g.y + g.h / 2) * sy : (g.x + g.w / 2) * sx;
    const L = map.get(g.li);
    if (!L) map.set(g.li, { li: g.li, a0, a1, c: it.vertical ? g.x * sx : g.y * sy });
    else { L.a0 = Math.min(L.a0, a0); L.a1 = Math.max(L.a1, a1); }
  }
  return [...map.values()];
};
const itemSpace = (env, it, fn) => {
  const ctx = env.ctx; ctx.save();
  if (it.clip) { ctx.beginPath(); ctx.rect(it.clip[0], -env.H, it.clip[1] - it.clip[0], env.H * 3); ctx.clip(); }
  if (it.clipY) { ctx.beginPath(); ctx.rect(-env.W, it.clipY[0], env.W * 3, it.clipY[1] - it.clipY[0]); ctx.clip(); }
  ctx.translate(it.x, it.y); if (it.rot) ctx.rotate(it.rot * DEG); if (it.skew) ctx.transform(1, 0, Math.tan(it.skew * DEG), 1, 0, 0);
  try { fn(); } finally { ctx.restore(); }
};

/* 一字抜き — the key glyph is set hollow (outline only) among solid glyphs, or the reverse */
reg('treat', 'tyHollowKey', {
  name: '一字抜き', tags: ['graphic', 'editorial', 'pop'], ae: 'spotChar', w: 0.9, safe: true,
  plan: rng => ({ rev: rng.chance(0.35) }),
  apply(env, it, Pt) {
    if (!alive(it, 0.5)) return;
    const lay = J.layoutText(it), plain = lay.filter(g => !isSp(g.ch));
    if (!plain.length) return;
    let ki = -1;
    if (plain.length === 1) {
      const kc = keyChar(env.cut.text);
      if (plain[0].ch !== kc) return;
      if (!Pt.rev) it.charFns.push(() => ({ outline: true }));
      return;
    }
    const kc = keyChar(it.text); const g = plain.find(q => q.ch === kc); ki = g ? g.i : plain[0].i;
    it.charFns.push((i) => ((i === ki) !== !!Pt.rev ? { outline: true } : null));
  },
});

/* 天地罫 — a heavy rule above and a hairline below every line (right / left of a vertical column) */
reg('treat', 'tyHeadRules', {
  name: '天地罫', tags: ['editorial', 'graphic', 'calm'], ae: 'underline', w: 0.8,
  plan: rng => ({ k: rng.range(0.06, 0.09), acc: rng.chance(0.5) }),
  apply(env, it, Pt) {
    if (!alive(it) || nonSp(it) < 2) return;
    const sc = env.sc, col = Pt.acc ? accentOf(sc) : (it.color || sc.fg);
    addPost(it, (e, i) => itemSpace(e, i, () => {
      const s = i.size, a = i.alpha ?? 1, o = E.inCubic(e.pOut), V = !!i.vertical, cross = s * (V ? (i.sx || 1) : (i.sy || 1));
      lineSpans(i).forEach((L, k) => {
        const q = E.outExpo(clamp((e.lt - (i.delay || 0) - 0.05 - k * 0.08) / 0.5));
        if (q <= 0 || o >= 1) return;
        const pad = s * 0.12, a0 = L.a0 - pad, a1 = L.a1 + pad, len = a1 - a0;
        const p0 = a0 + len * o, p1 = a0 + len * q;
        if (p1 - p0 < 1) return;
        const thick = Math.max(3, s * Pt.k), thin = Math.max(1, s * 0.018);
        const top = L.c + (V ? 1 : -1) * cross * 0.66, bot = L.c + (V ? -1 : 1) * cross * 0.66;
        const pt = (u, d) => (V ? [d, u] : [u, d]);
        e.line([pt(p0, top), pt(p1, top)], col, thick, a, false);
        e.line([pt(a1 - (p1 - a0), bot), pt(a1 - (p0 - a0), bot)], col, thin, a, false);
      });
    }));
  },
});

/* 頭字強調 — the first glyph of the line is set larger (baseline kept) in the accent colour, the rest make room */
reg('treat', 'tyHeadBig', {
  name: '頭字強調', tags: ['editorial', 'pop', 'emotional'], ae: 'sizeWave', w: 0.9,
  plan: rng => ({ k: rng.range(1.35, 1.6), acc: rng.chance(0.7) }),
  apply(env, it, Pt) {
    if (!alive(it) || nonSp(it) < 2) return;
    const lay = J.layoutText(it), g0 = lay.find(g => !isSp(g.ch) && !J.isPunct(g.ch));
    if (!g0) return;
    const k = Pt.k, V = !!it.vertical, sx = it.sx || 1, sy = it.sy || 1;
    const ac = Pt.acc && J.contrast(env.sc.accent, env.sc.bg) >= 1.8 ? env.sc.accent : null;
    const extra = (k - 1) * (V ? g0.h * sy : g0.w * sx);
    const center = it.align !== 'left' && it.align !== 'right';
    it.charFns.push((i, g) => {
      if (g.li !== g0.li) return null;
      const sh = center ? -extra / 2 : it.align === 'right' ? -extra : 0;
      if (i === g0.i) {
        const o = { s: k };
        if (V) { o.dy = sh + extra / 2; o.dx = 0; } else { o.dx = sh + extra / 2; o.dy = -(k - 1) * g.h * sy * 0.36; }
        if (ac) o.color = ac;
        return o;
      }
      if (g.ci < g0.ci) return V ? { dy: sh } : { dx: sh };
      return V ? { dy: sh + extra } : { dx: sh + extra };
    });
  },
});

/* 字番号 — a tiny superscript index number beside every glyph */
reg('treat', 'tyIndexSup', {
  name: '字番号', tags: ['editorial', 'graphic'], ae: 'emphasisDots', w: 0.7,
  plan: rng => ({ acc: rng.chance(0.6) }),
  apply(env, it, Pt) {
    if (!alive(it)) return;
    const sc = env.sc, col = Pt.acc ? accentOf(sc) : sc.sub;
    const single = nonSp(it) === 1, base = single ? Math.round(+it.mi || 0) : 0;
    addPost(it, (e, i) => {
      if (e.pass !== 'main') return;
      itemSpace(e, i, () => {
        const lay = J.layoutText(i), sx = i.sx || 1, sy = i.sy || 1, a = (i.alpha ?? 1) * clamp((e.lt - (i.delay || 0) - 0.15) / 0.3) * (1 - E.inCubic(e.pOut));
        if (a <= 0.01) return;
        const fs = Math.max(10, i.size * 0.26), mono = monoF(e);
        let n = base;
        for (const g of lay) {
          if (isSp(g.ch)) continue;
          n++;
          if (n > 40) break;
          const c = i.charFn ? i.charFn(g.i, g, lay.N) : null;
          if (c && c.hide) continue;
          const s = c && c.s != null ? c.s : 1;
          const x = g.x * sx + (c ? c.dx || 0 : 0), y = g.y * sy + (c ? c.dy || 0 : 0);
          const ox = i.vertical ? g.w * sx * 0.55 * s : g.w * sx * 0.52 * s, oy = i.vertical ? -g.h * sy * 0.3 * s : -g.h * sy * 0.42 * s;
          e.draw({ text: String(n), font: mono, size: fs, x: x + ox, y: y + oy, align: 'left', color: col, alpha: a * (c && c.a != null ? c.a : 1), ghost: false });
        }
      });
    });
  },
});

/* ================================================================== TRANSITIONS */
const bell = k => Math.sin(Math.PI * clamp(k));
const part = (ctx, C, x, y, w, h) => {
  const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(C.width, Math.ceil(x + w)), y1 = Math.min(C.height, Math.ceil(y + h));
  if (x1 - x0 < 1 || y1 - y0 < 1) return;
  ctx.drawImage(C, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
};
const tAcc = I => {
  const sc = I.sc, pb = (I.scPrev || sc).bg;
  for (const c of [sc.accent, sc.accent2, sc.fg]) if (c && J.contrast(c, sc.bg) >= 1.8 && J.contrast(c, pb) >= 1.4) return c;
  return sc.fg;
};
const trReg = (k, d) => reg('trans', k, Object.assign({}, d, {
  draw(ctx, A, B, p, I) {
    ctx.save();
    try {
      if (!(p > 0)) ctx.drawImage(A, 0, 0);
      else if (p >= 1) ctx.drawImage(B, 0, 0);
      else d.draw(ctx, A, B, p, I, I.P || {});
    } finally { ctx.restore(); }
  } }));

/* 罫線ワイプ — the frame is ruled into text lines; each line is "typed" across from the left, a cursor bar leading it */
trReg('tyRuleWipe', {
  name: '罫線ワイプ', tags: ['editorial', 'graphic', 'calm'], ae: 'blinds', w: 0.9, dur: 0.45,
  plan: rng => ({ n: rng.int(7, 12), rtl: rng.chance(0.25) }),
  draw(ctx, A, B, p, I, Pt) {
    const { cw, ch } = I, n = Pt.n || 9, bh = ch / n, ac = tAcc(I), lw = Math.max(1, Math.min(cw, ch) * 0.0015);
    ctx.drawImage(A, 0, 0);
    const st = 0.5 / n;
    for (let i = 0; i < n; i++) {
      const q = E.inOutCubic(clamp((p - i * st) / (1 - (n - 1) * st)));
      const y0 = Math.round(i * bh), y1 = Math.round((i + 1) * bh), x = cw * q;
      if (q > 0) { if (Pt.rtl) part(ctx, B, cw - x, y0, x, y1 - y0); else part(ctx, B, 0, y0, x, y1 - y0); }
      if (q > 0 && q < 1) {
        ctx.globalAlpha = 1; ctx.fillStyle = ac;
        const cwid = Math.max(3, bh * 0.14), xc = Pt.rtl ? cw - x - cwid : x;
        ctx.fillRect(xc, y0 + bh * 0.2, cwid, bh * 0.6);
      }
    }
    // ruled lines between the bands, fading in and out
    ctx.globalAlpha = 0.6 * bell(p); ctx.fillStyle = ac;
    for (let i = 1; i < n; i++) ctx.fillRect(0, Math.round(i * bh) - lw / 2, cw, lw);
    ctx.globalAlpha = 1;
  } });

/* 升目送り — a manuscript grid; the new cut fills in cell by cell in vertical reading order (columns right to left) */
trReg('tyGridCells', {
  name: '升目送り', tags: ['editorial', 'graphic'], ae: 'checker', w: 0.8, dur: 0.5,
  plan: rng => ({ rows: rng.int(4, 6), tate: rng.chance(0.7) }),
  draw(ctx, A, B, p, I, Pt) {
    const { cw, ch } = I, rows = Pt.rows || 5, cell = ch / rows, cols = Math.ceil(cw / cell), ox = (cw - cols * cell) / 2;
    const N = rows * cols, ac = tAcc(I), lw = Math.max(1, Math.min(cw, ch) * 0.0016);
    ctx.drawImage(A, 0, 0);
    const k = E.inOutCubic(clamp(p / 0.92)) * N;
    for (let j = 0; j < N; j++) {
      let c, r;
      if (Pt.tate) { c = cols - 1 - Math.floor(j / rows); r = j % rows; } else { r = Math.floor(j / cols); c = j % cols; }
      const x = ox + c * cell, y = r * cell;
      if (j < Math.floor(k)) part(ctx, B, x, y, cell + 1, cell + 1);
      else if (j === Math.floor(k)) { const f = k - j; ctx.save(); ctx.globalAlpha = f; part(ctx, B, x, y, cell + 1, cell + 1); ctx.restore(); ctx.globalAlpha = 1; ctx.strokeStyle = ac; ctx.lineWidth = lw * 3; ctx.strokeRect(x + lw * 1.5, y + lw * 1.5, cell - lw * 3, cell - lw * 3); }
    }
    ctx.globalAlpha = 0.5 * bell(p); ctx.fillStyle = ac;
    for (let c = 0; c <= cols; c++) ctx.fillRect(Math.round(ox + c * cell) - lw / 2, 0, lw, ch);
    for (let r = 1; r < rows; r++) ctx.fillRect(0, Math.round(r * cell) - lw / 2, cw, lw);
    ctx.globalAlpha = 1;
  } });

})();

/* ============================================================
   JIZURA — which entries random picks may use
   1) 追加分 (extra): everything added after the first public
      version (356 parts, 12 styles). Random picks (planner /
      おまかせ / シャッフル) use the first version's set unless
      project.extra === true.
   2) 和風 (wa): entries built around a traditional Japanese object,
      pattern or motif. Applied after (1): with project.wa === false
      they are never picked at random.
   A line can still be set to any entry by hand (per-line override).
   3) Part sets with their own switch (not 追加分): ホラー (horror,
      off by default), 文字PV系 (typo) and キネティック (kinetic),
      both on by default. Entries carry `set: '<name>'` (or come
      from a pack of that name).
   Pack authors: packs not listed in J.BASE_PACKS count as 追加分;
   add Japanese-motif keys to J.WA (or set `wa: true` on the def).
   ============================================================ */
(() => {
'use strict';
J.BASE_PACKS = ['core', undefined, 'layoutsA', 'layoutsB', 'enter', 'exitHold', 'decor', 'looks'];
J.BASE_STYLES = ['noir', 'crimson', 'caution', 'magenta', 'paper', 'hud', 'mint', 'specimen', 'transit', 'blueprint', 'rouge', 'mono'];
J.EXTRA_FONTS = ['reggae', 'rampart', 'potta', 'kiwi', 'klee', 'shippori'];
J.WA = {
  layout: ['ema', 'chochin', 'noren', 'tanzaku', 'omikuji', 'kakejiku', 'shoji', 'karuta', 'origami', 'postcard', 'letterPaper', 'genkou', 'hanko'],
  enter: ['fanOpen', 'brushReveal'],
  exit: ['fanClose'],
  decor: ['seal', 'kamon', 'seigaiha', 'asanoha', 'chochin', 'shimenawa', 'sensu', 'tsukiKumo', 'momiji', 'namiGashira', 'kasumi', 'brushStroke', 'petals'],
  bg: ['seigaiha', 'asanoha'],
  treat: ['monoGrid'],
  style: ['sakura', 'sumi'],
};
J.SETS = { horror: { on: false }, typo: { on: true }, kinetic: { on: true } };   // on = default (UI labels live in 12_ui.js)
J.SET_ORDER = Object.keys(J.SETS);
/* is this part set switched on in the project? (old projects without the flag get the default) */
J.setOn = (project, set) => { const v = project && project[set]; return typeof v === 'boolean' ? v : !!(J.SETS[set] && J.SETS[set].on); };
const def = (g, k) => g === 'style' ? J.STYLES[k] : g === 'font' ? J.FONTS[k] : (J.registry(g) || {})[k];
// mark the part sets, then 追加分 (set entries are not 追加分: they have their own switch)
for (const g of J.GROUP_KEYS) for (const k of J.order(g)) { const d = def(g, k); if (d && !d.set && J.SETS[d.pack]) d.set = d.pack; }
for (const g of J.GROUP_KEYS) for (const k of J.order(g)) { const d = def(g, k); if (d && !d.set && !J.BASE_PACKS.includes(d.pack)) d.extra = true; }
for (const k of J.STYLE_ORDER) if (!J.BASE_STYLES.includes(k) && !J.STYLES[k].set) J.STYLES[k].extra = true;
for (const k of J.EXTRA_FONTS) if (J.FONTS[k]) J.FONTS[k].extra = true;
// mark 和風
for (const [g, keys] of Object.entries(J.WA)) for (const k of keys) { const d = def(g, k); if (d) d.wa = true; }

J.isWa = (g, k) => { const d = def(g, k); return !!(d && d.wa); };
J.isExtra = (g, k) => { const d = def(g, k); return !!(d && d.extra); };
J.setOf = (g, k) => { const d = def(g, k); return (d && d.set) || null; };
/* may random picks use this entry? (g: a group key, 'style' or 'font') — 追加分 first, then 和風 */
J.randomOk = (project, g, k) => {
  const d = def(g, k); if (!d) return false;
  if (d.extra && !(project && project.extra === true)) return false;
  if (d.wa && project && project.wa === false) return false;
  if (d.set && !J.setOn(project, d.set)) return false;
  return true;
};
})();
