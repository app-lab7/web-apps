/* JIZURA pack: kinetic (2) — word-by-word entrances, exits and holds */
(() => {
'use strict';
const E = J.E;
const P = 'kinetic';
const DEG = J.DEG, TAU = J.TAU, clamp = J.clamp, lerp = J.lerp;
const HIDE = Object.freeze({ hide: true });
const reg = (g, key, def) => J.register(g, key, Object.assign(def, { set: 'kinetic' }), P);

/* ---------------------------------------------------------------- helpers */
const strip = t => String(t || '').replace(/\s+/g, '');
const hasLatin = t => /[A-Za-z]/.test(String(t || ''));
const isBlank = ch => ch === ' ' || ch === '　';
const bellK = k => Math.sin(Math.PI * clamp(k));
const rotV = (x, y, a) => { const c = Math.cos(a * DEG), s = Math.sin(a * DEG); return [x * c - y * s, x * s + y * c]; };
// damped wobble that starts at 0: 0 → out → back, t in seconds
const kick = (t, k = 9, f = 26) => (t <= 0 ? 0 : Math.exp(-k * t) * Math.sin(f * t));
function bounceE(x) {
  const n1 = 7.5625, d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x -= 1.5 / d1) * x + 0.75;
  if (x < 2.5 / d1) return n1 * (x -= 2.25 / d1) * x + 0.9375;
  return n1 * (x -= 2.625 / d1) * x + 0.984375;
}
// staggered local progress for element k of n (spread = share of the time used for the stagger)
const stg = (p, k, n, spread) => clamp((p - (n > 1 ? k / (n - 1) : 0) * spread) / (1 - spread));
const glyphs = (it, fn) => { (it.charFns || (it.charFns = [])).push(fn); };
const mot = env => (env.fx.motion ?? 0.7);
const beatSince = (env, per) => (env.beat && env.beat.len > 0.15 ? env.beat.since : (((env.ltb ?? env.lt) % per) + per) % per);
const beatIdx = (env, per) => (env.beat && env.beat.len > 0.15 ? env.beat.index : Math.floor((env.ltb ?? env.lt) / per));

/* ---- word geometry of an item: which word each glyph belongs to, word boxes at size 1 ---- */
const geoCache = new Map();
function wordsFor(env, text) {
  const lat = hasLatin(text);
  let ws = (env.cut && env.cut.words ? env.cut.words : []).map(strip).filter(Boolean);
  const flatS = strip(text), all = ws.join('');
  let off = ws.length ? all.indexOf(flatS) : -1;
  if (off < 0) {
    ws = (lat ? String(text).split(/\s+/) : (J.chunkText ? J.chunkText(String(text).replace(/\n/g, '')) : [text])).map(strip).filter(Boolean);
    off = 0;
  }
  return { ws, off };
}
function wgeo(env, it) {
  const text = String(it.text || '');
  const key = [text, it.font, it.track || 0, it.lead || 0, it.vertical ? 1 : 0, it.align || '', it.sx || 1, it.sy || 1, J.TYPESET ? 1 : 0, (env.cut && env.cut.words || []).join('\u0001')].join('\u0002');
  let G = geoCache.get(key);
  if (G) return G;
  const L1 = J.layoutText(Object.assign({}, it, { size: 1, _lay: null, _m: null }));
  const { ws, off } = wordsFor(env, text);
  const bnd = []; let acc = 0;
  ws.forEach(w => { acc += [...w].length; bnd.push(acc); });
  const map = new Array(L1.length).fill(-1), inW = new Array(L1.length).fill(0);
  let k = 0, jmin = 1e9, jmax = -1;
  for (const g of L1) {
    if (isBlank(g.ch)) continue;
    const pos = off + k; let j = bnd.findIndex(b => pos < b); if (j < 0) j = Math.max(0, bnd.length - 1);
    map[g.i] = j; jmin = Math.min(jmin, j); jmax = Math.max(jmax, j); k++;
  }
  if (jmax < 0) { jmin = 0; jmax = 0; }
  const nW = jmax - jmin + 1, sx = it.sx || 1, sy = it.sy || 1;
  const wb = []; for (let j = 0; j < nW; j++) wb.push({ x0: 1e9, x1: -1e9, y0: 1e9, y1: -1e9, n: 0 });
  for (const g of L1) {
    if (map[g.i] < 0) continue;
    const j = map[g.i] - jmin; map[g.i] = j;
    const b = wb[j], x = (g.x + g.vx) * sx, y = (g.y + g.vy) * sy;
    if (!b.n) b.li = g.li;
    inW[g.i] = b.n++;
    b.x0 = Math.min(b.x0, x - g.w * sx / 2); b.x1 = Math.max(b.x1, x + g.w * sx / 2); b.y0 = Math.min(b.y0, y - g.h * sy / 2); b.y1 = Math.max(b.y1, y + g.h * sy / 2);
  }
  wb.forEach(b => { if (!b.n) { b.x0 = b.x1 = b.y0 = b.y1 = 0; } b.cx = (b.x0 + b.x1) / 2; b.cy = (b.y0 + b.y1) / 2; });
  let X0 = 1e9, X1 = -1e9, Y0 = 1e9, Y1 = -1e9;
  wb.forEach(b => { if (!b.n) return; X0 = Math.min(X0, b.x0); X1 = Math.max(X1, b.x1); Y0 = Math.min(Y0, b.y0); Y1 = Math.max(Y1, b.y1); });
  if (X0 > X1) { X0 = X1 = Y0 = Y1 = 0; }
  G = { L1, map, inW, nW, wb, box: { x0: X0, x1: X1, y0: Y0, y1: Y1, cx: (X0 + X1) / 2, cy: (Y0 + Y1) / 2 }, vert: !!it.vertical };
  if (geoCache.size > 300) geoCache.clear();
  geoCache.set(key, G);
  return G;
}
// words grouped by text line, in reading order: [[li, [j…]], …]
const lineWords = G => { if (G._lw) return G._lw; const m = new Map(); for (let j = 0; j < G.nW; j++) { const li = G.wb[j].li | 0; if (!m.has(li)) m.set(li, []); m.get(li).push(j); } return (G._lw = [...m.entries()]); };
// size ratio of the drawn glyph to the size-1 layout, and its offset from a point given in size-1 units
const kOf = (G, g, it) => { const r = G.L1[g.i]; return r && r.w > 1e-6 ? g.w / r.w : it.size; };
const gpos = (g, it) => [(g.x + g.vx) * (it.sx || 1), (g.y + g.vy) * (it.sy || 1)];

/* ================================================================ ENTRANCES */
const WIN = dur => clamp(dur * 0.45, 0.32, 1.0);

reg('enter', 'knWordSlam', {
  // words slam down one after another from a huge scale; the ones already down take a knock at each impact
  name: '語ごとスラム', tags: ['pop', 'graphic', 'glitch'], w: 1.1, ae: 'pop', minDur: 0.5, inDur: WIN,
  apply(env, it, p, ctx) {
    const G = wgeo(env, it), n = G.nW, sp = n > 1 ? 0.62 : 0, secs = ctx.inDur * (1 - sp);
    const land = j => stg(p, j, n, sp);
    glyphs(it, (i, g) => {
      const j = G.map[i]; if (j < 0) return null;
      const q = land(j); if (q <= 0) return HIDE;
      const k = kOf(G, g, it), b = G.wb[j], [gx, gy] = gpos(g, it);
      const e = E.outExpo(clamp(q * 1.35)), s = 1 + 2.1 * (1 - e);
      let dy = 0;
      for (let j2 = n - 1; j2 > j; j2--) { const q2 = land(j2); if (q2 >= 0.74) { dy = it.size * 0.09 * kick((q2 - 0.74) * secs, 11, 30); break; } }
      dy *= clamp((1 - p) * 10);
      return { s, dx: (gx - b.cx * k) * (s - 1), dy: (gy - b.cy * k) * (s - 1) + dy, a: clamp(q * 7), rot: (1 - e) * (j % 2 ? 7 : -7) };
    });
  },
});

reg('enter', 'knTypeToSlam', {
  // each word is typed small at its start, then snaps up to full size
  name: '打鍵→拡大', tags: ['pop', 'editorial', 'graphic'], w: 0.9, ae: 'type', minDur: 0.55, inDur: WIN,
  apply(env, it, p) {
    const G = wgeo(env, it), n = G.nW, sp = n > 1 ? 0.55 : 0;
    glyphs(it, (i, g) => {
      const j = G.map[i]; if (j < 0) return null;
      const q = stg(p, j, n, sp); if (q <= 0) return HIDE;
      const b = G.wb[j], cnt = b.n, k = kOf(G, g, it), [gx, gy] = gpos(g, it);
      const tq = 0.55;
      if (q < tq && G.inW[i] >= Math.floor(q / tq * cnt + 1e-6) + 1) return HIDE;
      const e = q < tq ? 0 : E.outBack(clamp((q - tq) / (1 - tq)), 2.2), s = lerp(0.42, 1, e);
      const ax = G.vert ? b.cx * k : b.x0 * k, ay = G.vert ? b.y0 * k : b.cy * k;
      return { s, dx: (gx - ax) * (s - 1), dy: (gy - ay) * (s - 1), a: q < tq ? 0.85 : 1 };
    });
  },
});

reg('enter', 'knReplaceIn', {
  // the words flash big in the middle one by one, replacing each other, then all fly to their places
  name: '入れ替わり登場', tags: ['pop', 'graphic', 'glitch'], w: 0.9, ae: 'scramble', minDur: 0.7, inDur: dur => clamp(dur * 0.5, 0.45, 1.2),
  apply(env, it, p) {
    const G = wgeo(env, it), n = G.nW, T = n > 1 ? 0.7 : 0.2, B = G.box, bw = Math.max(1e-3, (G.vert ? B.y1 - B.y0 : B.x1 - B.x0));
    const fly = E.outExpo(clamp((p - T) / (1 - T)));
    glyphs(it, (i, g) => {
      const j = G.map[i]; if (j < 0) return null;
      const b = G.wb[j], k = kOf(G, g, it), [gx, gy] = gpos(g, it);
      const ww = Math.max(1e-3, G.vert ? b.y1 - b.y0 : b.x1 - b.x0), big = Math.min(2.4, Math.max(1, bw / ww * 0.8));
      const w0 = j / n * T, w1 = (j + 1) / n * T;
      let s, cx, cy, a = 1;
      if (p < T) {
        if (p < w0 || p >= w1) return HIDE;
        const q = (p - w0) / (w1 - w0);
        s = big * (1 + 0.35 * Math.exp(-q * 9)); cx = B.cx * k; cy = B.cy * k; a = clamp(q * 8);
      } else {
        const last = j === n - 1, s0 = last ? big : 0.3;
        s = lerp(s0, 1, fly); cx = lerp(B.cx, b.cx, fly) * k; cy = lerp(B.cy, b.cy, fly) * k; a = last ? 1 : clamp(fly * 3);
      }
      // glyph offset from its word centre, scaled, placed around (cx, cy)
      return { s, dx: cx + (gx - b.cx * k) * s - gx, dy: cy + (gy - b.cy * k) * s - gy, a };
    });
  },
});

reg('enter', 'knHingeDrop', {
  // each word swings down from upright on a hinge at its bottom-left corner and bounces level
  name: '蝶番おろし', tags: ['pop', 'graphic'], w: 0.9, ae: 'drop', minDur: 0.5, inDur: WIN,
  apply(env, it, p) {
    const G = wgeo(env, it), n = G.nW, sp = n > 1 ? 0.5 : 0, dir = (J.h(env.cut.seed | 0, it.mi | 0, 61) & 1) ? 1 : -1;
    glyphs(it, (i, g) => {
      const j = G.map[i]; if (j < 0) return null;
      const q = stg(p, j, n, sp); if (q <= 0) return HIDE;
      const b = G.wb[j], k = kOf(G, g, it), [gx, gy] = gpos(g, it);
      const th = -88 * dir * (1 - bounceE(q));
      const px = (dir > 0 ? b.x0 : b.x1) * k, py = b.y1 * k;
      const [rx, ry] = rotV(gx - px, gy - py, th);
      return { dx: px + rx - gx, dy: py + ry - gy, rot: th, a: clamp(q * 6) };
    });
  },
});

reg('enter', 'knLoopIn', {
  // every glyph rides the same looping track into its place, one after another like a train
  name: 'ループ入り', tags: ['pop', 'graphic'], w: 0.8, ae: 'spin', minDur: 0.5, inDur: dur => clamp(dur * 0.5, 0.4, 1.1),
  apply(env, it, p) {
    const vert = !!it.vertical, dir = (J.h(env.cut.seed | 0, it.mi | 0, 63) & 1) ? 1 : -1;
    const D = Math.min(env.W, env.H) * 0.55, R = D / TAU * 1.5;
    glyphs(it, (i, g, n) => {
      const q = stg(p, dir > 0 ? i : n - 1 - i, n, 0.5); if (q <= 0) return HIDE;
      const v = 1 - E.outCubic(q), ph = TAU * v;
      const a0 = v * D - R * Math.sin(ph), b0 = -R * (1 - Math.cos(ph));
      const ta = D - TAU * R * Math.cos(ph), tb = -TAU * R * Math.sin(ph);
      const ang = (Math.atan2(tb, ta * dir) / DEG) * Math.min(1, v * 4);
      return vert ? { dx: b0, dy: -a0 * dir, rot: ang, a: clamp(q * 6) } : { dx: a0 * dir, dy: b0, rot: ang, a: clamp(q * 6) };
    });
  },
});

reg('enter', 'knPushIn', {
  // words arrive at the end of the line one by one and push the ones before them into place
  name: '押し込み', tags: ['pop', 'editorial', 'graphic'], w: 1, ae: 'type', minDur: 0.45, inDur: WIN,
  apply(env, it, p) {
    const G = wgeo(env, it), n = G.nW, vert = G.vert;
    const f = p * n, k0 = Math.min(n - 1, Math.floor(f)), e = E.outBack(clamp((f - k0) / 0.75), 1.5);
    // each text line is pushed on its own: its visible words sit against the line's final end
    const S = new Map();
    for (const [li, js] of lineWords(G)) {
      const end = vert ? G.wb[js[js.length - 1]].y1 : G.wb[js[js.length - 1]].x1, far = j => end - (vert ? G.wb[j].y1 : G.wb[j].x1);
      const vis = js.filter(j => j <= k0);
      if (!vis.length) continue;
      const last = vis[vis.length - 1], prev = vis.length > 1 ? vis[vis.length - 2] : -1;
      let v = far(last);
      if (last === k0) v += prev >= 0 ? (far(prev) - far(last)) * (1 - e) : (end - (vert ? G.wb[last].y0 : G.wb[last].x0)) * 0.6 * (1 - e);
      S.set(li, v);
    }
    glyphs(it, (i, g) => {
      const j = G.map[i]; if (j < 0) return null;
      if (j > k0) return HIDE;
      const k = kOf(G, g, it), a = j === k0 ? clamp(e * 3) : 1, v = S.get(G.wb[j].li | 0) || 0;
      return vert ? { dy: v * k, a } : { dx: v * k, a };
    });
  },
});

reg('enter', 'knInertia', {
  // the line brakes into place: the front stops first, the rest bunch up behind it and spring apart
  name: '急ブレーキ', tags: ['pop', 'graphic'], w: 0.9, ae: 'stretch', minDur: 0.45, inDur: dur => clamp(dur * 0.4, 0.3, 0.8),
  apply(env, it, p) {
    const vert = !!it.vertical, dir = (J.h(env.cut.seed | 0, it.mi | 0, 67) & 1) ? 1 : -1;   // 1: comes from the left
    const D = (vert ? env.H : env.W) * 0.6;
    glyphs(it, (i, g, n) => {
      const back = n > 1 ? (dir > 0 ? (n - 1 - i) / (n - 1) : i / (n - 1)) : 0;    // 0 = front of the train
      const q = clamp((p - back * 0.3) / 0.7);
      const e = E.outBack(q, 2.1), v = (E.outBack(Math.min(1, q + 0.02), 2.1) - e) / 0.02;
      const off = -dir * D * (1 - e), st = 1 + Math.min(0.5, Math.abs(v) * 0.08);
      const sq = q > 0.55 ? 1 - 0.18 * back * bellK((q - 0.55) / 0.45) : 1;
      return vert ? { dy: off, sy: st * sq, sx: 1 / st } : { dx: off, sx: st * sq, sy: 1 / st };
    });
  },
});

reg('enter', 'knWordSpin', {
  // each word spins in as one rigid piece, neighbours turning the opposite way
  name: '語ごと回転', tags: ['pop', 'graphic'], w: 0.9, ae: 'spin', inDur: WIN,
  apply(env, it, p) {
    const G = wgeo(env, it), n = G.nW, sp = n > 1 ? 0.5 : 0;
    glyphs(it, (i, g) => {
      const j = G.map[i]; if (j < 0) return null;
      const q = stg(p, j, n, sp); if (q <= 0) return HIDE;
      const b = G.wb[j], k = kOf(G, g, it), [gx, gy] = gpos(g, it);
      const e = E.outBack(q, 1.6), th = (1 - E.outCubic(q)) * 200 * (j % 2 ? -1 : 1), s = lerp(0.15, 1, e);
      const [rx, ry] = rotV((gx - b.cx * k) * s, (gy - b.cy * k) * s, th);
      return { dx: b.cx * k + rx - gx, dy: b.cy * k + ry - gy, rot: th, s, a: clamp(q * 5) };
    });
  },
});

reg('enter', 'knDiveIn', {
  // words fly in from behind the camera one after another, huge and soft, landing sharp
  name: '手前から語', tags: ['pop', 'emotional', 'graphic'], w: 0.9, ae: 'zoom', inDur: WIN,
  apply(env, it, p) {
    const G = wgeo(env, it), n = G.nW, sp = n > 1 ? 0.55 : 0;
    glyphs(it, (i, g) => {
      const j = G.map[i]; if (j < 0) return null;
      const q = stg(p, j, n, sp); if (q <= 0) return HIDE;
      const b = G.wb[j], k = kOf(G, g, it), [gx, gy] = gpos(g, it);
      const e = E.outCubic(q), s = lerp(5.5, 1, e);
      return { s, dx: (gx - b.cx * k) * (s - 1) + (b.cx - G.box.cx) * k * (s - 1) * 0.6, dy: (gy - b.cy * k) * (s - 1), a: clamp(q * 2.2) * lerp(0.35, 1, e) };
    });
  },
});

reg('enter', 'knStretchOut', {
  // each word shoots out from its first letter like a tape measure and snaps back to length
  name: '伸び出し', tags: ['pop', 'graphic'], w: 0.9, ae: 'stretch', inDur: WIN,
  apply(env, it, p) {
    const G = wgeo(env, it), n = G.nW, sp = n > 1 ? 0.55 : 0;
    glyphs(it, (i, g) => {
      const j = G.map[i]; if (j < 0) return null;
      const q = stg(p, j, n, sp); if (q <= 0) return HIDE;
      const b = G.wb[j], k = kOf(G, g, it), [gx, gy] = gpos(g, it);
      const s = q >= 1 ? 1 : Math.max(0.02, E.outElastic(q));
      return G.vert ? { dy: (gy - b.y0 * k) * (s - 1), sy: s, a: clamp(q * 8) } : { dx: (gx - b.x0 * k) * (s - 1), sx: s, a: clamp(q * 8) };
    });
  },
});

/* ================================================================ EXITS */
const WOUT = dur => clamp(dur * 0.32, 0.3, 0.75);

reg('exit', 'knWordKick', {
  // the words are kicked out one after another, up and down in turn, tumbling
  name: '語ごと蹴り出し', tags: ['pop', 'graphic'], w: 1, ae: 'scatter', outDur: WOUT,
  apply(env, it, p) {
    const G = wgeo(env, it), n = G.nW, sp = n > 1 ? 0.4 : 0, H = env.H;
    glyphs(it, (i, g) => {
      const j = G.map[i]; if (j < 0) return null;
      const q = stg(p, j, n, sp); if (q <= 0) return null;
      if (q >= 1) return HIDE;
      const b = G.wb[j], k = kOf(G, g, it), [gx, gy] = gpos(g, it);
      const up = j % 2 ? 1 : -1, e = E.inCubic(q), th = up * 70 * e;
      const [rx, ry] = rotV(gx - b.cx * k, gy - b.cy * k, th);
      return { dx: b.cx * k + rx - gx + up * it.size * 0.6 * e, dy: b.cy * k + ry - gy + up * H * 0.9 * e - up * it.size * 0.25 * bellK(q * 2), rot: th, a: 1 - E.inQuad(clamp((q - 0.45) / 0.55)) };
    });
  },
});

reg('exit', 'knPushOut', {
  // the line is shunted along in word-sized steps; each word fades as it passes the line's start
  name: '押し出し退場', tags: ['editorial', 'graphic', 'pop'], w: 0.9, ae: 'wipe', outDur: WOUT,
  apply(env, it, p) {
    const G = wgeo(env, it), vert = G.vert;
    const st = j => (vert ? G.wb[j].y0 : G.wb[j].x0), en = j => (vert ? G.wb[j].y1 : G.wb[j].x1);
    // every text line is shunted on its own, in steps of its own words
    const S = new Map(), start = new Map();
    for (const [li, js] of lineWords(G)) {
      const m = js.length, s0 = st(js[0]), f = p * m, k0 = Math.min(m - 1, Math.floor(f)), e = E.outBack(clamp((f - k0) / 0.8), 1.6);
      const to = q => (q >= m ? en(js[m - 1]) - s0 + 0.2 : st(js[q]) - s0);
      S.set(li, lerp(to(k0), to(k0 + 1), e)); start.set(li, s0);
    }
    glyphs(it, (i, g) => {
      const j = G.map[i]; if (j < 0) return null;
      const li = G.wb[j].li | 0, sh = S.get(li) || 0, k = kOf(G, g, it), [gx, gy] = gpos(g, it);
      const pos = (vert ? gy / k : gx / k) - sh, over = (start.get(li) || 0) - pos;
      const a = (1 - clamp(over / 0.45)) * (1 - J.smooth(0.72, 1, p));
      if (a <= 0.01) return HIDE;
      return vert ? { dy: -sh * k, a } : { dx: -sh * k, a };
    });
    if (p > 0.97) it.alpha = (it.alpha ?? 1) * (1 - clamp((p - 0.97) / 0.03));
  },
});

reg('exit', 'knDiveGlyph', {
  // the camera dives into one letter: the line blows up around it and the rest flies past
  name: '一字へ突入', tags: ['pop', 'emotional', 'graphic'], w: 0.9, ae: 'shrink', outDur: dur => clamp(dur * 0.3, 0.3, 0.7),
  apply(env, it, p) {
    const lay = J.layoutText(Object.assign({}, it, { size: 1, _lay: null, _m: null })).filter(g => !isBlank(g.ch));
    if (!lay.length) return;
    const f = lay.find(g => J.isKanji(g.ch)) || lay[Math.floor(lay.length / 2)];
    const one = lay.length <= 1, fi = f.i, S = Math.exp(Math.pow(p, 1.7) * Math.log(one ? 3 : 34));
    if (one) { it.alpha = (it.alpha ?? 1) * (1 - J.smooth(0.3, 1, p)); }
    else {
      // the chosen letter drifts to the middle of the frame while the camera dives in
      const e = E.inOutCubic(p), fx0 = (f.x + f.vx) * (it.sx || 1) * it.size, fy0 = (f.y + f.vy) * (it.sy || 1) * it.size;
      if (!it.rot) { it.x += (env.W / 2 - (it.x + fx0)) * e; it.y += (env.H / 2 - (it.y + fy0)) * e; }
    }
    let fx = null, fy = null;
    glyphs(it, (i, g, n) => {
      if (fx == null) { const k = g.w / Math.max(1e-6, (lay.find(q => q.i === g.i) || f).w); fx = (f.x + f.vx) * (it.sx || 1) * k; fy = (f.y + f.vy) * (it.sy || 1) * k; }
      const [gx, gy] = gpos(g, it);
      const a = (i === fi ? 1 - J.smooth(0.6, 1, p) : 1 - J.smooth(0.25, 0.7, p));
      if (a <= 0.01) return HIDE;
      return { s: S, dx: (gx - fx) * (S - 1), dy: (gy - fy) * (S - 1), a };
    });
  },
});

reg('exit', 'knLaunch', {
  // the line pulls away: the front glyph goes first, the rest follow on a stretching chain
  name: '急発進', tags: ['pop', 'graphic'], w: 0.9, ae: 'stretch', outDur: dur => clamp(dur * 0.3, 0.3, 0.65),
  apply(env, it, p) {
    const vert = !!it.vertical, dir = (J.h(env.cut.seed | 0, it.mi | 0, 71) & 1) ? 1 : -1, D = (vert ? env.H : env.W) * 1.25;
    glyphs(it, (i, g, n) => {
      const back = n > 1 ? (dir > 0 ? (n - 1 - i) / (n - 1) : i / (n - 1)) : 0;
      const q = clamp((p - back * 0.35) / 0.65);
      const antic = -0.06 * bellK(clamp(p / 0.18));                     // a small wind-up before the pull
      const e = E.inCubic(q) + antic, v = 3 * q * q;
      const st = 1 + Math.min(1.2, v * 0.35);
      if (q >= 1) return HIDE;
      return vert ? { dy: dir * D * e, sy: st, sx: 1 / Math.sqrt(st) } : { dx: dir * D * e, sx: st, sy: 1 / Math.sqrt(st) };
    });
  },
});

reg('exit', 'knWordBlink', {
  // one word at a time: a punch in the accent colour, then gone — on the beat when there is one
  name: '一語ずつ消灯', tags: ['pop', 'glitch', 'graphic'], w: 0.9, ae: 'cut', outDur: dur => clamp(dur * 0.35, 0.3, 0.8),
  apply(env, it, p) {
    const G = wgeo(env, it), n = G.nW, rev = (J.h(env.cut.seed | 0, 73) & 1) === 1, acc = env.sc.accent;
    glyphs(it, (i, g) => {
      const j0 = G.map[i]; if (j0 < 0) return null;
      const j = rev ? n - 1 - j0 : j0;
      // single-word items (one glyph per item layouts) blink out at their own moment
      const w0 = n > 1 ? j / n : J.r(env.cut.seed | 0, it.mi | 0, 74) * 0.6, w1 = n > 1 ? (j + 1) / n : w0 + 0.4;
      if (p >= w1 || p >= 0.999) return HIDE;
      if (p < w0) return null;
      const q = (p - w0) / (w1 - w0), b = G.wb[j0], k = kOf(G, g, it), [gx, gy] = gpos(g, it), s = 1 + 0.16 * bellK(q * 1.4);
      return { s, dx: (gx - b.cx * k) * (s - 1), dy: (gy - b.cy * k) * (s - 1), color: q > 0.25 ? acc : null, a: q > 0.7 ? 0.35 : 1 };
    });
  },
});

reg('exit', 'knCloseGap', {
  // words drop out one by one and the rest slide together, re-centring, until the last one pops
  name: '詰めて消える', tags: ['editorial', 'graphic', 'pop'], w: 0.9, ae: 'shrink', outDur: dur => clamp(dur * 0.35, 0.35, 0.8),
  apply(env, it, p) {
    const G = wgeo(env, it), n = G.nW, vert = G.vert;
    const lo = j => (vert ? G.wb[j].y0 : G.wb[j].x0), hi = j => (vert ? G.wb[j].y1 : G.wb[j].x1);
    // removal order: alternating ends towards the middle
    const ord = []; for (let a = 0, b = n - 1; a <= b; a++, b--) { ord.push(a); if (b !== a) ord.push(b); }
    const rank = new Array(n); ord.forEach((j, r) => { rank[j] = r; });
    const c = new Array(n);
    for (let j = 0; j < n; j++) c[j] = E.inOutCubic(clamp(p * n - rank[j]));
    // new layout along the reading axis, line by line
    const ctr = new Array(n).fill(0), byLine = new Map();
    for (let j = 0; j < n; j++) { const li = G.wb[j].li | 0; if (!byLine.has(li)) byLine.set(li, []); byLine.get(li).push(j); }
    for (const js of byLine.values()) {
      const m = js.length, wid = js.map(j => hi(j) - lo(j)), gap = js.map((j, q) => (q < m - 1 ? lo(js[q + 1]) - hi(j) : 0));
      const cc = q => (q < m - 1 ? gap[q] * (1 - Math.max(c[js[q]], c[js[q + 1]])) : 0);
      let tot = 0; for (let q = 0; q < m; q++) tot += wid[q] * (1 - c[js[q]]) + cc(q);
      let x = (lo(js[0]) + hi(js[m - 1])) / 2 - tot / 2;
      for (let q = 0; q < m; q++) { const w = wid[q] * (1 - c[js[q]]); ctr[js[q]] = x + w / 2; x += w + cc(q); }
    }
    glyphs(it, (i, g) => {
      const j = G.map[i]; if (j < 0) return null;
      if (c[j] >= 0.999) return HIDE;
      const k = kOf(G, g, it), [gx, gy] = gpos(g, it), s = 1 - c[j], wc = (lo(j) + hi(j)) / 2;
      const along = vert ? gy : gx, cross = vert ? gx : gy, cc = vert ? G.wb[j].cx : G.wb[j].cy;
      const na = ctr[j] * k + (along - wc * k) * s, nc = cc * k + (cross - cc * k) * s;
      return vert ? { dx: nc - gx, dy: na - gy, s: Math.max(0.01, s) } : { dx: na - gx, dy: nc - gy, s: Math.max(0.01, s) };
    });
  },
});

reg('exit', 'knJumpCutOut', {
  // three hard jump cuts (closer, wider, tilted) and the line is gone — no in-betweens
  name: 'ジャンプカット', tags: ['pop', 'glitch', 'graphic'], w: 0.8, ae: 'glitch', outDur: dur => clamp(dur * 0.3, 0.3, 0.6),
  apply(env, it, p) {
    const sd = J.h(env.cut.seed | 0, it.mi | 0, 79), side = sd & 1 ? 1 : -1;
    const st = Math.floor(clamp(p) * 4);
    if (st >= 3) { it.alpha = 0; return; }
    const S = [[1.22, 0.05 * side, -0.02, 0], [0.8, -0.07 * side, 0.03, 0], [1.5, 0.02 * side, 0.0, 3 * side]][st];
    it.size *= S[0]; it.x += S[1] * env.W; it.y += S[2] * env.H; it.rot = (it.rot || 0) + S[3];
    it._lay = null; it._m = null;
  },
});

reg('exit', 'knStackAway', {
  // the words hop into a tower one by one, then the whole tower drops out of frame
  name: '積んで落とす', tags: ['pop', 'graphic'], w: 0.8, ae: 'fall', outDur: dur => clamp(dur * 0.4, 0.45, 0.9), minDur: 0.9,
  apply(env, it, p) {
    const G = wgeo(env, it), n = G.nW, T = 0.62, H = env.H;
    const lh = G.vert ? null : (G.box.y1 - G.box.y0);
    glyphs(it, (i, g) => {
      const j = G.map[i]; if (j < 0) return null;
      const b = G.wb[j], k = kOf(G, g, it), [gx, gy] = gpos(g, it);
      const q = E.inOutCubic(clamp((p * (1 / T) - j / Math.max(1, n) * 0.7) / 0.3 + 0));
      // tower slot: words stacked upwards from the first one, centred on the line
      const h = G.vert ? (b.x1 - b.x0) : Math.max(1e-3, b.y1 - b.y0);
      const tx = G.vert ? G.box.cx - (j - (n - 1) / 2) * h * 1.05 : G.box.cx, ty = G.vert ? G.box.cy : G.box.cy - (j - (n - 1) / 2) * h * 1.05;
      const hop = -bellK(q) * (lh || h) * 0.8;
      let dx = (tx - b.cx) * k * q, dy = (ty - b.cy) * k * q + hop * k;
      const fall = clamp((p - T) / (1 - T));
      dy += E.inQuad(fall) * H * 1.2;
      const rot = fall * (j % 2 ? 8 : -8);
      if (fall >= 1) return HIDE;
      return { dx, dy, rot, a: 1 - J.smooth(0.8, 1, fall) };
    });
  },
});

/* ================================================================ HOLDS */
reg('hold', 'knWordPulse', {
  // one word at a time swells on the beat, cycling through the line
  name: '語ごとの拍', tags: ['pop', 'graphic'], w: 1, ae: 'breathe',
  apply(env, it, amt) {
    const G = wgeo(env, it), n = G.nW;
    if (n < 1) return;
    const per = 0.52, s0 = beatSince(env, per), cur = ((beatIdx(env, per) % n) + n) % n;
    const pulse = Math.exp(-s0 * 4) * 0.14 * amt * (0.4 + mot(env));
    if (pulse < 0.002) return;
    glyphs(it, (i, g) => {
      const j = G.map[i]; if (j !== cur) return null;
      const b = G.wb[j], k = kOf(G, g, it), [gx, gy] = gpos(g, it), s = 1 + pulse;
      return { s, dx: (gx - b.cx * k) * (s - 1), dy: (gy - b.cy * k) * (s - 1) };
    });
  },
});

reg('hold', 'knCounterRock', {
  // neighbouring words rock the opposite way, like meshed gears
  name: '逆回転ゆれ', tags: ['pop', 'calm', 'graphic'], w: 0.9, ae: 'wave',
  apply(env, it, amt) {
    const G = wgeo(env, it), n = G.nW, t = env.ltb ?? env.lt;
    const A = 4 * amt * (0.4 + mot(env)) * Math.sin(t * TAU * 0.55);
    if (Math.abs(A) < 0.05) return;
    glyphs(it, (i, g) => {
      const j = G.map[i]; if (j < 0) return null;
      const th = A * (j % 2 ? -1 : 1) * (n === 1 ? 0.6 : 1);
      const b = G.wb[j], k = kOf(G, g, it), [gx, gy] = gpos(g, it);
      const [rx, ry] = rotV(gx - b.cx * k, gy - b.cy * k, th);
      return { dx: b.cx * k + rx - gx, dy: b.cy * k + ry - gy, rot: th };
    });
  },
});

reg('hold', 'knWordRide', {
  // a slow swell travels along the line; each word rides it as one piece, tilting with the slope
  name: '語の波乗り', tags: ['calm', 'emotional', 'pop'], w: 0.9, ae: 'wave',
  apply(env, it, amt) {
    const G = wgeo(env, it), t = env.ltb ?? env.lt, A = it.size * 0.07 * amt * (0.4 + mot(env));
    if (A < 0.2) return;
    glyphs(it, (i, g) => {
      const j = G.map[i]; if (j < 0) return null;
      const b = G.wb[j], k = kOf(G, g, it), [gx, gy] = gpos(g, it);
      const ph = t * 3.1 - j * 1.25, off = A * Math.sin(ph), th = Math.cos(ph) * 3.5 * amt;
      const [rx, ry] = rotV(gx - b.cx * k, gy - b.cy * k, th);
      return G.vert ? { dx: b.cx * k + rx - gx + off, dy: b.cy * k + ry - gy, rot: th } : { dx: b.cx * k + rx - gx, dy: b.cy * k + ry - gy + off, rot: th };
    });
  },
});

reg('hold', 'knTickShift', {
  // the line ticks sideways on every beat like a second hand: snap, tiny overshoot, hold
  name: '刻みシフト', tags: ['graphic', 'pop', 'editorial'], w: 0.8, ae: 'jitter',
  apply(env, it, amt) {
    const per = 0.5, s0 = beatSince(env, per), idx = beatIdx(env, per);
    const d = it.size * 0.05 * amt * (0.4 + mot(env));
    if (d < 0.2) return;
    const from = idx % 2 ? 1 : -1, e = E.outBack(clamp(s0 / 0.09), 2.6);
    const x = lerp(-from, from, e) * d;
    if (it.vertical) it.y += x; else it.x += x;
  },
});

reg('hold', 'knBeatLean', {
  // on each beat the words lean over, alternately forward and back, and spring upright
  name: '拍で傾く', tags: ['pop', 'glitch', 'graphic'], w: 0.8, ae: 'jitter',
  apply(env, it, amt) {
    const G = wgeo(env, it), s0 = beatSince(env, 0.55), idx = beatIdx(env, 0.55);
    const A = 18 * amt * (0.4 + mot(env)) * Math.exp(-s0 * 4.5) * Math.cos(s0 * 15);
    if (Math.abs(A) < 0.1) return;
    glyphs(it, (i) => {
      const j = G.map[i]; if (j < 0) return null;
      return { skew: A * ((j + idx) % 2 ? 1 : -1) };
    });
  },
});

reg('hold', 'knGapBreath', {
  // the spaces between words breathe in and out; the words themselves keep still
  name: '語間の呼吸', tags: ['calm', 'editorial', 'emotional'], w: 0.9, ae: 'breathe',
  apply(env, it, amt) {
    const G = wgeo(env, it), n = G.nW, t = env.ltb ?? env.lt;
    if (n < 2) return;
    const A = it.size * 0.16 * amt * (0.4 + mot(env)) * (0.5 - 0.5 * Math.cos(t * TAU * 0.4));
    if (A < 0.2) return;
    glyphs(it, (i) => {
      const j = G.map[i]; if (j < 0) return null;
      const o = (j - (n - 1) / 2) * A;
      return G.vert ? { dy: o } : { dx: o };
    });
  },
});

})();

/* JIZURA pack: kinetic (3) — word-timed cameras, transitions, treatments and decor */
(() => {
'use strict';
const E = J.E;
const P = 'kinetic';
const DEG = J.DEG, TAU = J.TAU, clamp = J.clamp, lerp = J.lerp;
const reg = (g, key, def) => J.register(g, key, Object.assign(def, { set: 'kinetic' }), P);

/* ---------------------------------------------------------------- helpers */
const strip = t => String(t || '').replace(/\s+/g, '');
const isBlank = ch => ch === ' ' || ch === '　';
const bellK = k => Math.sin(Math.PI * clamp(k));
const KM = env => clamp((env.fx.motion ?? 0.7) * 1.25, 0, 1.25);
const addPre = (it, f) => { const p = it.pre; it.pre = p ? (e, i) => { p(e, i); f(e, i); } : f; };

/* word clock of a cut (same rule as the kinetic layouts): onsets spread over the first half, locked to beats nearby */
const clockCache = new WeakMap();
function wordTimes(env, nMax = 6) {
  const c = env.cut;
  let v = clockCache.get(c);
  if (v && v.nMax === nMax) return v.t;
  let n = Math.max(1, Math.min(nMax, (c.words || []).length || 1));
  if (n < 2 && c.dur > 1.2) n = 2;
  const dur = c.dur, last = Math.max(0, Math.min(dur * 0.5, (n - 1) * 0.38));
  let t = [];
  for (let i = 0; i < n; i++) t.push(n > 1 ? last * i / (n - 1) : 0);
  const beats = (env.plan && env.plan.beats) || [];
  if (beats.length && n > 1) {
    const pick = []; let prev = 0;
    for (const b of beats) {
      const r = b - c.start;
      if (r <= 0.12) continue;
      if (r > dur * 0.72) break;
      if (r - prev >= 0.2) { pick.push(r); prev = r; }
      if (pick.length >= n - 1) break;
    }
    if (pick.length >= n - 1 && pick[n - 2] <= Math.max(last * 1.35, dur * 0.55)) t = [0].concat(pick);
  }
  clockCache.set(c, { nMax, t });
  return t;
}
const curIdx = (ts, t) => { let k = -1; for (let i = 0; i < ts.length; i++) if (t >= ts[i]) k = i; return k; };

/* ================================================================ CAMERA */
reg('cam', 'knReadPan', {
  // the frame steps along with the reading: one snap per word, then it settles back to centre
  name: '読み追い', tags: ['pop', 'graphic', 'editorial'], w: 0.8, ae: 'snapPan',
  plan: rng => ({ a: rng.range(0.026, 0.036) }),
  get(env, P) {
    const ts = wordTimes(env), n = ts.length, K = KM(env), A = env.W * (P.a || 0.03) * K, lt = env.lt;
    if (n < 2) return { s: 1.03, x: A * (1 - 2 * E.inOutSine(clamp(lt / Math.max(0.4, env.cut.dur)))) * 0.5 };
    const pos = k => A * (1 - 2 * k / (n - 1));
    const k = Math.max(0, curIdx(ts, lt)), e = k > 0 ? E.outBack(clamp((lt - ts[k]) / 0.2), 1.8) : 1;
    let x = k > 0 ? lerp(pos(k - 1), pos(k), e) : pos(0);
    const tb = ts[n - 1] + 0.55, rb = E.inOutCubic(clamp((lt - tb) / 0.5));
    x *= 1 - rb;
    const whip = k > 0 ? bellK(clamp((lt - ts[k]) / 0.14)) : 0;
    return { x, s: 1.035, skx: -Math.sign(A) * 2.5 * whip * K, blur: 3 * whip * K };
  } });

reg('cam', 'knTiltKick', {
  // every new word kicks the frame into a lean, alternating sides, and the last one sets it level
  name: '語で傾く', tags: ['pop', 'graphic', 'emotional'], w: 0.8, ae: 'dutch',
  plan: rng => ({ dir: rng.pick([1, -1]), a: rng.range(2.4, 3.4) }),
  get(env, P) {
    const ts = wordTimes(env), n = ts.length, K = Math.min(1, KM(env)), lt = env.lt, A = (P.a || 3) * K * (P.dir || 1);
    const ang = k => (k >= n - 1 ? 0 : (k % 2 ? -A : A));
    const k = Math.max(0, curIdx(ts, lt)), d = lt - ts[k];
    const from = k > 0 ? ang(k - 1) : 0, to = ang(k);
    const sp = Math.exp(-d * 7) * Math.cos(d * 17);
    const r = to + (from - to) * sp;
    return { rot: clamp(r, -5, 5), s: 1.03 + 0.012 * Math.abs(r) / 3 };
  } });

reg('cam', 'knCardFlip', {
  // the frame flips over like a card to show the cut, and pinches on each new word
  name: 'カード返し', tags: ['pop', 'graphic'], w: 0.7, ae: 'barrelRoll', strong: true,
  plan: rng => ({ vert: rng.chance(0.3), dir: rng.pick([1, -1]) }),
  get(env, P) {
    const ts = wordTimes(env), lt = env.lt, K = Math.min(1, KM(env)), d = P.dir || 1;
    const q = clamp(lt / 0.42), th = 90 * (1 - E.outBack(q, 1.7));
    let f = Math.max(0.04, Math.abs(Math.cos(th * DEG)));
    for (let i = 1; i < ts.length; i++) { const dd = lt - ts[i]; if (dd > 0 && dd < 0.24) f *= 1 - 0.1 * K * bellK(dd / 0.24); }
    const sk = 7 * Math.sin(th * DEG) * d * K;
    return P.vert ? { sy: f, s: 1.01, y: -env.H * 0.02 * Math.sin(th * DEG) } : { sx: f, s: 1.01, skx: sk * 0.4, x: env.W * 0.02 * Math.sin(th * DEG) * d };
  } });

reg('cam', 'knShearKick', {
  // a sideways shear kick on every word (or beat) that springs back upright
  name: 'シアーキック', tags: ['pop', 'glitch', 'graphic'], w: 0.8, ae: 'jelly',
  plan: rng => ({ a: rng.range(5, 8) }),
  get(env, P) {
    const ts = wordTimes(env), lt = env.lt, K = Math.min(1.1, KM(env));
    let since, idx;
    if (env.beat && env.beat.len > 0.2 && lt > ts[ts.length - 1] + 0.3) { since = env.beat.since; idx = env.beat.index; }
    else { idx = Math.max(0, curIdx(ts, lt)); since = lt - ts[idx]; }
    const w = Math.exp(-since * 8) * Math.cos(since * 22), sg = idx % 2 ? 1 : -1;
    return { skx: (P.a || 6.5) * K * w * sg, x: env.W * 0.006 * K * w * sg, s: 1.02 };
  } });

reg('cam', 'knJumpCut', {
  // hard reframes on every word (tighter, wider, off-centre) with no in-betweens, then back to centre
  name: 'ジャンプカット', tags: ['pop', 'glitch', 'editorial'], w: 0.7, ae: 'stepZoom',
  plan: rng => ({ s0: rng.int(0, 99) }),
  get(env, P) {
    const ts = wordTimes(env), n = ts.length, lt = env.lt, K = Math.min(1, KM(env));
    const k = Math.max(0, curIdx(ts, lt));
    if (lt > ts[n - 1] + 0.5 || n < 2) return { s: 1.02 };
    const sd = (env.cut.seed | 0) + (P.s0 | 0);
    const S = [1.0, 1.12, 1.05, 1.14, 1.08, 1.13][(k + (sd % 3)) % 6], sg = k % 2 ? 1 : -1;
    return { s: 1 + (S - 1) * K, x: sg * (0.5 + 0.5 * J.r(sd, k, 1)) * env.W * 0.04 * K * (k ? 1 : 0), y: J.rs(sd, k, 2) * env.H * 0.035 * K };
  } });

reg('cam', 'knRushIn', {
  // the whole frame rushes up from far away, overshoots a touch and locks
  name: '奥から突進', tags: ['pop', 'graphic', 'emotional'], w: 0.7, ae: 'crashZoom', strong: true,
  plan: rng => ({ z: rng.range(0.66, 0.76), r: rng.range(-4, 4) }),
  get(env, P) {
    const K = Math.min(1, KM(env)), q = clamp(env.lt / 0.34);
    if (q >= 1) return { s: 1 + 0.01 * clamp((env.lt - 0.34) / Math.max(0.3, env.cut.dur)) };
    const e = E.outBack(q, 1.9), s = lerp(1 - (1 - (P.z || 0.7)) * K, 1, e);
    return { s, rot: (P.r || 0) * (1 - E.outCubic(q)) * K, blur: 9 * K * (1 - E.outCubic(q)) };
  } });

/* ================================================================ TRANSITIONS */
const minD = I => Math.min(I.cw, I.ch);
const tAcc = I => { const sc = I.sc; return J.contrast(sc.accent, sc.bg) >= 1.6 ? sc.accent : sc.fg; };
const trReg = (k, d) => reg('trans', k, Object.assign({}, d, {
  draw(ctx, A, B, p, I) {
    ctx.save();
    try {
      if (!(p > 0)) ctx.drawImage(A, 0, 0);
      else if (p >= 1) ctx.drawImage(B, 0, 0);
      else d.draw(ctx, A, B, p, I, I.P || {});
    } finally { ctx.restore(); }
  } }));

trReg('knCornerSwing', {
  // the old frame swings away round a corner, the new one swings in behind it — a quarter turn to the next line
  name: 'コーナースイング', tags: ['pop', 'graphic'], w: 0.8, ae: 'spinOut', dur: 0.42,
  plan: rng => ({ c: rng.int(0, 3) }),
  draw(ctx, A, B, p, I, P) {
    const { cw, ch } = I, c = P.c | 0;
    const px = c === 1 || c === 2 ? cw : 0, py = c >= 2 ? 0 : ch, sg = (c === 0 || c === 2) ? 1 : -1;
    const e = E.inOutCubic(p);
    ctx.fillStyle = I.sc.bg; ctx.fillRect(0, 0, cw, ch);
    const put = (C, ang, dark) => {
      ctx.save(); ctx.translate(px, py); ctx.rotate(ang * DEG); ctx.translate(-px, -py);
      ctx.drawImage(C, 0, 0);
      ctx.restore();
    };
    put(B, -90 * sg * (1 - e), 0.35 * (1 - e));
    put(A, 90 * sg * e, 0.25 * e);
    // a thin accent edge along the swinging seam
    const lw = Math.max(2, minD(I) * 0.006);
    ctx.save(); ctx.translate(px, py); ctx.rotate(90 * sg * e * DEG);
    ctx.globalAlpha = bellK(p); ctx.fillStyle = tAcc(I);
    if (c === 0 || c === 3) ctx.fillRect(-lw, -(py ? ch : 0) * 1, lw, ch * 2); else ctx.fillRect(0, -(py ? ch : 0), lw, ch * 2);
    ctx.restore();
  } });

trReg('knStutterCut', {
  // rhythm cut: old and new frames trade places in hard cuts before the new one holds
  name: '刻みカット', tags: ['pop', 'glitch', 'graphic'], w: 0.7, ae: 'flashCross', dur: 0.36,
  plan: rng => ({ z: rng.range(1.05, 1.1), o: rng.range(0.02, 0.035) * rng.pick([1, -1]) }),
  draw(ctx, A, B, p, I, P) {
    const { cw, ch } = I, z = P.z || 1.07, o = (P.o || 0.03) * cw;
    const seq = [[A, 1, 0], [B, z, o], [A, 1 / z, -o * 0.6], [B, z * 1.03, -o], [B, 1, 0]];
    const cuts = [0.18, 0.36, 0.52, 0.7];
    let k = 0; while (k < cuts.length && p >= cuts[k]) k++;
    const [C, s, dx] = seq[k];
    ctx.fillStyle = (C === A ? (I.scPrev || I.sc) : I.sc).bg; ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(C, cw / 2 - cw * s / 2 + dx, ch / 2 - ch * s / 2, cw * s, ch * s);
    // a one-frame accent bar on each cut
    const since = k > 0 ? p - cuts[k - 1] : 1;
    if (since < 0.06) { const h = Math.max(3, ch * 0.012); ctx.globalAlpha = 0.9; ctx.fillStyle = tAcc(I); ctx.fillRect(0, (k % 2 ? 0.3 : 0.68) * ch, cw, h); ctx.globalAlpha = 1; }
  } });

trReg('knStripSlam', {
  // the new frame drops in as tall strips, one after another, each landing with a small bounce
  name: '短冊スラム', tags: ['pop', 'graphic'], w: 0.8, ae: 'sliceShift', dur: 0.45,
  plan: rng => ({ n: rng.int(3, 5), rev: rng.chance(0.5), up: rng.chance(0.25) }),
  draw(ctx, A, B, p, I, P) {
    const { cw, ch } = I, n = P.n || 4;
    ctx.drawImage(A, 0, 0);
    ctx.fillStyle = '#000000'; ctx.globalAlpha = 0.3 * p; ctx.fillRect(0, 0, cw, ch); ctx.globalAlpha = 1;
    for (let i = 0; i < n; i++) {
      const k = P.rev ? n - 1 - i : i, d = k / n * 0.45, q = clamp((p - d) / 0.55);
      if (q <= 0) continue;
      // gravity drop, then a bounce that dies out
      const tl = 0.62;
      let y;
      if (q < tl) { const f = q / tl; y = -ch * (1 - f * f); }
      else { const t = (q - tl) / (1 - tl); y = -ch * 0.06 * Math.abs(Math.sin(t * Math.PI * 2)) * (1 - t); }
      if (P.up) y = -y;
      const x0 = Math.round(i * cw / n), x1 = Math.round((i + 1) * cw / n);
      ctx.drawImage(B, x0, 0, x1 - x0, ch, x0, Math.round(y), x1 - x0, ch);
      if (q < 1) { ctx.fillStyle = tAcc(I); ctx.globalAlpha = 0.8 * (1 - q); ctx.fillRect(x0, P.up ? Math.round(y) - 3 : Math.round(y) + ch - 3, x1 - x0, Math.max(3, ch * 0.008)); ctx.globalAlpha = 1; }
    }
  } });

/* ================================================================ TREATMENTS */
const alive = (it, amin = 0.9) => it.fill !== false && (it.alpha ?? 1) >= amin && !!it.text && it.size > 1;
// word of every glyph (cut's word chunks, else chunks of the item's own text)
const tmCache = new Map();
function treatGeo(env, it) {
  const text = String(it.text || '');
  const key = [text, it.font, it.track || 0, it.lead || 0, it.vertical ? 1 : 0, it.align || '', J.TYPESET ? 1 : 0, (env.cut.words || []).join('\u0001')].join('\u0002');
  let G = tmCache.get(key);
  if (G) return G;
  const L1 = J.layoutText(Object.assign({}, it, { size: 1, sx: 1, sy: 1, _lay: null, _m: null }));
  let ws = (env.cut.words || []).map(strip).filter(Boolean), off = ws.length ? ws.join('').indexOf(strip(text)) : -1;
  if (off < 0) { ws = (/[A-Za-z]/.test(text) ? text.split(/\s+/) : (J.chunkText ? J.chunkText(text.replace(/\n/g, '')) : [text])).map(strip).filter(Boolean); off = 0; }
  const bnd = []; let acc = 0; ws.forEach(w => { acc += [...w].length; bnd.push(acc); });
  const map = new Array(L1.length).fill(-1); let k = 0, jmin = 1e9;
  for (const g of L1) { if (isBlank(g.ch)) continue; let j = bnd.findIndex(b => off + k < b); if (j < 0) j = bnd.length - 1; map[g.i] = j; jmin = Math.min(jmin, j); k++; }
  for (let i = 0; i < map.length; i++) if (map[i] >= 0) map[i] -= jmin;
  const nW = Math.max(0, ...map) + 1;
  G = { L1, map, nW };
  if (tmCache.size > 300) tmCache.clear();
  tmCache.set(key, G);
  return G;
}

reg('treat', 'knWordScale', {
  // one key word is set big, the rest small — the line re-flows around the contrast
  name: '大小語', tags: ['pop', 'graphic', 'editorial'], w: 0.9, ae: 'sizeWave', safe: true,
  plan: rng => ({ big: rng.range(1.28, 1.42), small: rng.range(0.78, 0.86), pick: rng.pick(['long', 'long', 'last', 'first']) }),
  apply(env, it, P) {
    if (!alive(it)) return;
    const G = treatGeo(env, it);
    if (G.nW < 2) return;
    const key = [it.text, it.font, it.track || 0, P.big, P.small, P.pick, G.nW].join('|');
    let R = it._knws && it._knws.key === key ? it._knws : null;
    if (!R) {
      // choose the key word
      const cnt = new Array(G.nW).fill(0), kan = new Array(G.nW).fill(0);
      G.L1.forEach(g => { const j = G.map[g.i]; if (j >= 0) { cnt[j]++; if (J.isKanji(g.ch)) kan[j]++; } });
      let kw = P.pick === 'last' ? G.nW - 1 : P.pick === 'first' ? 0 : cnt.reduce((b, v, j) => (v + kan[j] * 0.5 > cnt[b] + kan[b] * 0.5 ? j : b), 0);
      // key word big, the rest small; the whole set scaled so the line never grows longer
      let tb = 0, ts2 = 0;
      G.L1.forEach(g => { const j = G.map[g.i]; if (j < 0) return; const a = it.vertical ? g.h : g.w; if (j === kw) tb += a; else ts2 += a; });
      const norm = Math.min(1, (tb + ts2) / Math.max(1e-6, tb * P.big + ts2 * P.small));
      const f = j => (j === kw ? P.big : P.small) * norm;
      // new advances along each line, keeping the line's own alignment
      const vert = !!it.vertical, lines = new Map();
      G.L1.forEach(g => { const L = lines.get(g.li) || []; L.push(g); lines.set(g.li, L); });
      const out = new Array(G.L1.length).fill(null);
      for (const L of lines.values()) {
        const a0 = vert ? L[0].y - L[0].h / 2 : L[0].x - L[0].w / 2, last = L[L.length - 1], a1 = vert ? last.y + last.h / 2 : last.x + last.w / 2;
        let pos = 0; const np = [];
        L.forEach(g => { const j = G.map[g.i], k = j >= 0 ? f(j) : P.small, adv = (vert ? g.h : g.w) * k; np.push(pos + adv / 2); pos += adv + (it.track || 0); });
        const len = pos - (it.track || 0), old = a1 - a0;
        const start = it.align === 'left' ? a0 : it.align === 'right' ? a1 - len : a0 + (old - len) / 2;
        L.forEach((g, q) => {
          const j = G.map[g.i], k = j >= 0 ? f(j) : P.small, na = start + np[q], oa = vert ? g.y : g.x;
          out[g.i] = vert ? { dx: 0, dy: na - oa, s: k } : { dx: na - oa, dy: (1 - k) * 0.36, s: k };
        });
      }
      R = it._knws = { key, out };
    }
    const sx = it.sx || 1, sy = it.sy || 1, L1 = G.L1;
    it.charFns.push((i, g) => {
      const o = R.out[i]; if (!o) return null;
      const r = L1[i], k = r && r.w > 1e-6 ? g.w / r.w : it.size;
      return { dx: o.dx * k * sx, dy: o.dy * k * sy, s: o.s };
    });
  } });

reg('treat', 'knWordPlate', {
  // every other word is knocked out of a solid plate that follows the word as it moves
  name: '語ごと反転', tags: ['pop', 'graphic', 'glitch'], w: 0.8, ae: 'boxed',
  plan: rng => ({ first: rng.chance(0.5), pad: rng.range(0.08, 0.14), tilt: rng.chance(0.4) ? rng.range(1.5, 3) : 0 }),
  apply(env, it, P) {
    if (!alive(it)) return;
    const G = treatGeo(env, it);
    if (G.nW < 2) return;
    const sc = env.sc, plate = J.contrast(sc.ink, sc.bg) >= 2 ? sc.ink : sc.fg;
    let tc = null, bv = 0;
    for (const c of [sc.bg, sc.fg, sc.ink, sc.accent]) { if (!c || c === plate) continue; const k = J.contrast(c, plate); if (k > bv) { bv = k; tc = c; } }
    if (bv < 2.6) tc = J.lum(plate) > 0.5 ? '#111111' : '#FFFFFF';
    const on = j => (j % 2 === 0) === !!P.first;
    it.charFns.push((i) => { const j = G.map[i]; return j >= 0 && on(j) ? { color: tc } : null; });
    addPre(it, (e, x) => {
      const lay = J.layoutText(x), sx = x.sx || 1, sy = x.sy || 1, boxes = new Map();
      for (const g of lay) {
        const j = G.map[g.i]; if (j < 0 || !on(j)) continue;
        const c = x.charFn ? x.charFn(g.i, g, lay.N) : null;
        if (c && c.hide) continue;
        const s = c && c.s != null ? c.s : 1, a = c && c.a != null ? c.a : 1;
        const gx = (g.x + g.vx) * sx + ((c && c.dx) || 0), gy = (g.y + g.vy) * sy + ((c && c.dy) || 0), hw = g.w * sx * s / 2, hh = g.h * sy * s / 2;
        const key = j * 100 + g.li;
        const B = boxes.get(key) || { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9, a: 1 };
        B.x0 = Math.min(B.x0, gx - hw); B.x1 = Math.max(B.x1, gx + hw); B.y0 = Math.min(B.y0, gy - hh); B.y1 = Math.max(B.y1, gy + hh); B.a = Math.min(B.a, a);
        boxes.set(key, B);
      }
      if (!boxes.size) return;
      const ctx = e.ctx, pd = x.size * P.pad, A = (x.alpha ?? 1);
      ctx.save(); ctx.translate(x.x, x.y); if (x.rot) ctx.rotate(x.rot * DEG); if (x.skew) ctx.transform(1, 0, Math.tan(x.skew * DEG), 1, 0, 0);
      let q = 0;
      for (const B of boxes.values()) {
        const t = P.tilt ? (q++ % 2 ? P.tilt : -P.tilt) : 0;
        ctx.save(); ctx.translate((B.x0 + B.x1) / 2, (B.y0 + B.y1) / 2); if (t) ctx.rotate(t * DEG);
        const w = B.x1 - B.x0 + pd * 2, h = B.y1 - B.y0 + pd * 1.4;
        e.rect(-w / 2, -h / 2, w, h, plate, A * B.a, true);
        ctx.restore();
      }
      ctx.restore();
    });
  } });

/* ================================================================ DECOR */
const getBB = (env, bb) => J.centerBB(env, bb);

reg('decor', 'knSpeedTrail', {
  // speed lines stream off the back of the lyric and follow it wherever it moves
  name: '追従スピード線', tags: ['pop', 'graphic', 'glitch'], w: 0.8, ae: 'slash', layer: 'front',
  draw(env, bb0, P) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { W, H, sc } = env, u = Math.min(W, H);
    const o = E.outCubic(clamp(env.lt / 0.3)) * (1 - E.inCubic(env.pOut));
    if (o <= 0.01) return;
    const vert = (bb.y1 - bb.y0) > (bb.x1 - bb.x0) * 1.3;
    // trailing side: the one with more room (P.right breaks ties)
    const roomA = vert ? bb.y0 : bb.x0, roomB = vert ? H - bb.y1 : W - bb.x1;
    const side = Math.abs(roomA - roomB) < u * 0.05 ? (P.right ? 1 : -1) : (roomB > roomA ? 1 : -1);
    const N = 8 + (P.n | 0) * 3, t = env.ltb;
    const col = J.contrast(sc.sub, sc.bg) >= 1.4 ? sc.sub : sc.fg;
    const span = vert ? bb.x1 - bb.x0 : bb.y1 - bb.y0, len = vert ? bb.y1 - bb.y0 : bb.x1 - bb.x0;
    for (let i = 0; i < N; i++) {
      const r = k => J.r(P.seed, i, k);
      const f = (i + 0.5) / N, lw = Math.max(1.5, u * (0.003 + r(1) * 0.006));
      const L = u * (0.18 + r(2) * 0.3) * o;
      // start a little inside the text's trailing edge so the streaks read even when there is no room
      const tight = Math.max(roomA, roomB) < u * 0.14;
      const st = tight ? len * (0.2 + r(3) * 0.3) : -u * (0.015 + 0.02 * r(3));
      const ph = ((t * (1.3 + r(4) * 1.5) + r(5)) % 1), s0 = st * -1 + ph * L * 0.6, s1 = s0 + L * (0.35 + 0.65 * (1 - ph));
      const a = (0.35 + 0.35 * r(6)) * o * (1 - ph * 0.5);
      // no room at the back: the streaks run in two bands just outside the text's long edges instead
      const c = tight ? (i % 2 ? (vert ? bb.x1 : bb.y1) + span * (0.05 + 0.3 * f) : (vert ? bb.x0 : bb.y0) - span * (0.05 + 0.3 * f))
        : lerp(vert ? bb.x0 : bb.y0, vert ? bb.x1 : bb.y1, 0.08 + 0.84 * f) + (r(7) - 0.5) * span * 0.04;
      const e0 = side < 0 ? (vert ? bb.y0 : bb.x0) : (vert ? bb.y1 : bb.x1);
      const p0 = e0 + side * s0, p1 = e0 + side * s1;
      env.line(vert ? [[c, p0], [c, p1]] : [[p0, c], [p1, c]], col, lw, a, false);
    }
  } });

reg('decor', 'knWordTicks', {
  // a small segmented bar that fills one segment per word as the words arrive, with a running count
  name: '語カウンター', tags: ['graphic', 'editorial', 'pop'], w: 0.8, ae: 'counter', layer: 'front', subtle: true,
  draw(env, bb0, P) {
    const bb = getBB(env, bb0), { W, H, sc } = env, u = Math.min(W, H);
    const o = E.outCubic(clamp(env.lt / 0.35)) * (1 - E.inCubic(env.pOut));
    if (o <= 0.01) return;
    const ts = wordTimes(env), n = ts.length, k = curIdx(ts, env.lt);
    const segW = u * 0.06, segH = Math.max(4, u * 0.011), g = u * 0.014, tot = n * segW + (n - 1) * g;
    const below = bb.y1 + u * 0.08 < H * 0.93;
    const y = below ? bb.y1 + u * 0.06 : bb.y0 - u * 0.06;
    const cx = clamp((bb.x0 + bb.x1) / 2, tot / 2 + W * 0.06, W * 0.94 - tot / 2);
    const x0 = cx - tot / 2, acc = J.contrast(sc.accent, sc.bg) >= 1.6 ? sc.accent : sc.fg;
    for (let i = 0; i < n; i++) {
      const x = x0 + i * (segW + g), on = i <= k;
      const f = on ? E.outExpo(clamp((env.lt - ts[i]) / 0.18)) : 0;
      env.rect(x, y - segH / 2, segW, segH, sc.sub, 0.35 * o, false);
      if (f > 0) env.rect(x, y - segH / 2 - (i === k ? segH * 0.6 * (1 - f) : 0), segW * f, segH * (i === k ? 1 + 1.2 * (1 - f) : 1), acc, o, false);
    }
    const fs = J.clamp(u * 0.028, 14, 32), mono = (env.st.fonts.mono && env.st.fonts.mono[0]) || 'mono';
    env.draw({ text: String(Math.max(1, k + 1)).padStart(2, '0') + ' / ' + String(n).padStart(2, '0'), font: mono, size: fs, align: 'left', x: x0 + tot + u * 0.02, y, color: sc.sub, alpha: o, ghost: false, plain: true });
  } });

})();

/* JIZURA pack: layoutsA — 28 compositional layouts: telops, editorial typesetting, graphic devices and UI mock-ups */
(() => {
'use strict';
const E = J.E;
const P = 'layoutsA';
const reg = (key, def) => J.register('layout', key, def, P);

/* ---------------------------------------------------------------- helpers */
const U = env => Math.min(env.W, env.H);
const isPort = env => env.H > env.W * 1.08;
const strip = t => String(t || '').replace(/\s+/g, '');
const pad2 = n => String(n).padStart(2, '0');
const lineNo = env => pad2(Math.max(0, env.cut.line | 0) + 1);
const bodyF = env => (env.st.fonts.body && env.st.fonts.body[0]) || 'gothic_med';
const monoF = env => (env.st.fonts.mono && env.st.fonts.mono[0]) || 'mono';
const fontsOf = (st, roles) => J.fontsOf(st, roles);
const tin = (env, d = 0, len = 0.4, ease = E.outExpo) => ease(J.clamp((env.lt - d) / Math.max(0.01, len)));
const tout = env => 1 - E.inCubic(env.pOut);
const meas = (text, font, size, o) => J.measure(Object.assign({ text, font, size }, o || {}));
const box = (x0, y0, x1, y1) => ({ x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, boxes: [] });
const smallSize = env => J.clamp(U(env) * 0.024, 14, 34);
const romajiOf = env => { if (/[A-Za-z]/.test(env.cut.text)) return null; const r = J.romaji(strip(env.cut.text)); return r ? r.toUpperCase() : null; };
const hasLatin = t => /[A-Za-z]/.test(t);
/* text as one run: latin keeps single word spaces, Japanese drops them */
const flat = t => (hasLatin(t) ? String(t || '').trim().replace(/\s+/g, ' ') : strip(t));
/* readable text colour on a plate, preferring the scheme's bg / fg */
const onCol = (sc, plate) => {
  const a = J.contrast(sc.bg, plate), b = J.contrast(sc.fg, plate);
  if (Math.max(a, b) >= 2.4) return a >= b ? sc.bg : sc.fg;
  return J.lum(plate) > 0.5 ? '#111111' : '#FFFFFF';
};
/* secondary line of copy: lineText when it differs, otherwise romaji / note */
const altCopy = env => {
  const c = env.cut;
  if (c.lineText && strip(c.lineText) !== strip(c.text)) return c.lineText;
  return c.note || romajiOf(env) || 'No.' + lineNo(env);
};
const isBad = c => J.isSmallKana(c) || J.isPunct(c) || c === 'ー' || c === ' ';

/* split text into k balanced chunks: word chunks first; long chunks are cut at the most natural boundary */
function segBounds(t) {
  const out = new Set(); let i = 0;
  try { for (const sg of (J.segments ? J.segments(t) : [t])) { i += [...sg].length; out.add(i); } } catch (e) {}
  return out;
}
function split2(word, force) {
  const chars = [...word], n = chars.length, sb = segBounds(word);
  let best = Math.max(1, Math.floor(n / 2)), bs = -1e9;
  for (let c = 1; c < n; c++) {
    const a = chars[c - 1], b = chars[c];
    if (!force && ((c === 1 && !J.isKanji(a)) || (c === n - 1 && !J.isKanji(b)))) continue;   // never leave a lone kana
    let s = -Math.abs(c - n / 2) * 0.9;
    if (a === ' ' || a === '\u3000' || (J.isPunct(a) && a !== '\u30fc')) s += 5;
    if (J.isHira(a) && !J.isHira(b) && !isBad(b)) s += 3;
    if (sb.has(c)) s += 2;
    if (isBad(b)) s -= 6;
    if (J.isKanji(a) && J.isKanji(b)) s -= 2;
    if (J.isKanji(a) && J.isHira(b)) s -= sb.has(c) ? 0.5 : 2.5;
    if (J.isHira(a) && J.isHira(b) && !sb.has(c)) s -= 2.5;
    if (s > bs) { bs = s; best = c; }
  }
  if (!force && bs < -1.5 && !hasLatin(word)) return [word];
  return [chars.slice(0, best).join('').trim(), chars.slice(best).join('').trim()].filter(Boolean);
}
function splitK(text, k, force) {
  const t = String(text || '').trim();
  if (!t) return [''];
  const latin = hasLatin(t);
  let words = latin ? t.split(/\s+/).filter(Boolean) : (J.chunkText ? J.chunkText(t) : [t]).map(w => w.trim()).filter(Boolean);
  if (!words.length) words = [t];
  k = Math.max(1, Math.min(k, J.glyphCount(t)));
  const hard = new Set();
  for (let guard = 0; words.length < k && guard < 16; guard++) {
    let bi = -1, bl = 1;
    words.forEach((w, i) => { const l = J.glyphCount(w); if (l > bl && !hard.has(w)) { bl = l; bi = i; } });
    if (bi < 0) break;
    let parts = latin ? [words[bi]] : split2(words[bi]);
    if (parts.length < 2 && force && words.length < force) parts = split2(words[bi], true);
    if (parts.length < 2) { hard.add(words[bi]); continue; }
    words.splice(bi, 1, ...parts);
  }
  if (k <= 1) return [words.join(latin ? ' ' : '')];
  if (words.length <= k) return words;
  const part = ws => {
    const lens = ws.map(w => J.glyphCount(w) + 0.5);
    const pre = [0]; lens.forEach(l => pre.push(pre[pre.length - 1] + l));
    const n = ws.length, tgt = pre[n] / k;
    let best = null, bestS = Infinity, guard = 0;
    const rec = (start, g, cuts) => {
      if (++guard > 5000) return;
      if (g === k - 1) {
        let s = 0, prev = 0;
        for (const c of [...cuts, n]) { const d = pre[c] - pre[prev] - tgt; s += d * d; prev = c; }
        if (s < bestS) { bestS = s; best = [...cuts, n]; }
        return;
      }
      for (let c = start + 1; c <= n - (k - 1 - g); c++) rec(c, g + 1, [...cuts, c]);
    };
    rec(0, 0, []);
    if (!best) return ws.map(w => [w]);
    const out = []; let prev = 0;
    for (const c of best) { out.push(ws.slice(prev, c)); prev = c; }
    return out;
  };
  let groups = part(words);
  // rebalance: split the longest word of an oversized group and re-partition
  for (let it = 0; it < 3; it++) {
    const gl = groups.map(g => g.reduce((a, w) => a + J.glyphCount(w), 0));
    const mx = Math.max(...gl), mn = Math.min(...gl);
    if (mx <= mn * 1.7 + 1) break;
    const g = groups[gl.indexOf(mx)];
    let bw = null; g.forEach(w => { if (!hard.has(w) && J.glyphCount(w) >= 3 && (!bw || J.glyphCount(w) > J.glyphCount(bw))) bw = w; });
    if (!bw) break;
    const parts = latin ? [bw] : split2(bw);
    if (parts.length < 2) { hard.add(bw); continue; }
    const wi = words.indexOf(bw); words.splice(wi, 1, ...parts);
    groups = part(words);
  }
  return groups.map(g => g.join(latin ? ' ' : ''));
}

/* single glyphs, with small kana / punctuation / ー kept on the preceding glyph */
const charUnits = text => {
  const out = [];
  for (const ch of strip(text)) { if (out.length && isBad(ch)) out[out.length - 1] += ch; else out.push(ch); }
  return out;
};

/* line breaking for display: balanced, at chunk boundaries */
const brk = (text, maxPer) => {
  const t = String(text || '').trim(), n = J.glyphCount(t);
  if (n <= maxPer) return t;
  return splitK(t, Math.ceil(n / maxPer)).join('\n');
};

/* draw several polylines progressively (e 0..1 over their total length) */
function segsPartial(env, segs, e, col, lw, a = 1, ghost = false) {
  if (e <= 0) return;
  const lens = segs.map(s => { let L = 0; for (let i = 1; i < s.length; i++) L += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]); return L; });
  const tot = lens.reduce((x, y) => x + y, 0) || 1;
  let rem = tot * J.clamp(e);
  for (let i = 0; i < segs.length && rem > 0; i++) {
    const k = Math.min(1, rem / Math.max(1e-6, lens[i]));
    env.polyPartial(segs[i], k, col, lw, a, ghost);
    rem -= lens[i];
  }
}
/* dashed straight line (main pass only) */
function dash(env, x0, y0, x1, y1, d, g, col, lw, a = 1) {
  const L = Math.hypot(x1 - x0, y1 - y0); if (L < 1) return;
  const n = Math.min(400, Math.ceil(L / (d + g)));
  const ux = (x1 - x0) / L, uy = (y1 - y0) / L;
  for (let i = 0; i < n; i++) {
    const s = i * (d + g), t = Math.min(L, s + d);
    env.line([[x0 + ux * s, y0 + uy * s], [x0 + ux * t, y0 + uy * t]], col, lw, a, false);
  }
}
const closeLoop = pts => pts.concat([pts[0], pts[1]]);
/* one-call text row for dense secondary copy (main pass only); sp = extra px after each glyph */
function fastRow(env, text, font, size, x, y, sp, color, alpha, align = 'left') {
  if (env.pass !== 'main' || alpha <= 0.01 || !text) return;
  const ctx = env.ctx;
  if (!('letterSpacing' in ctx)) { env.draw({ text, font, size, x, y, align, track: sp / size, color, alpha, ghost: false }); return; }
  ctx.save();
  ctx.font = J.fontCSS(font, size); ctx.letterSpacing = sp.toFixed(2) + 'px';
  ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillStyle = color; ctx.globalAlpha = alpha;
  ctx.fillText(text, x, y);
  ctx.restore();
}
/* per-layout memo for expensive fitting searches (dropped when font metrics are reset after font loading) */
const MEMO = new Map(), SENT = '\u0001layoutsA';
function memo(key, fn) {
  const mm = J.metrics && J.metrics.m;
  if (mm && !mm.has(SENT)) { MEMO.clear(); mm.set(SENT, 1); }
  let v = MEMO.get(key);
  if (v === undefined) { v = fn(); if (MEMO.size > 400) MEMO.clear(); MEMO.set(key, v); }
  return v;
}
let _ic = null;
/* glyph ink bounds in em, relative to the centred / middle anchor drawItem uses */
const inkBox = (font, ch) => memo('ink|' + font + '|' + ch, () => {
  try { if (!_ic) _ic = document.createElement('canvas').getContext('2d'); } catch (e) { _ic = null; }
  if (!_ic || !_ic.measureText) return { l: -0.4, r: 0.4, t: -0.45, b: 0.45 };
  _ic.font = J.fontCSS(font, 100); _ic.textAlign = 'center'; _ic.textBaseline = 'middle';
  const mm = _ic.measureText(ch);
  if (!(mm.actualBoundingBoxRight > -1e6) || !(mm.actualBoundingBoxAscent > -1e6)) return { l: -0.4, r: 0.4, t: -0.45, b: 0.45 };
  return { l: -mm.actualBoundingBoxLeft / 100, r: mm.actualBoundingBoxRight / 100, t: -mm.actualBoundingBoxAscent / 100, b: mm.actualBoundingBoxDescent / 100 };
});
const rowW = (text, font, size) => { let w = 0; for (const ch of text) w += J.metrics.adv(font, ch) * size; return w; };

/* ======================================================================
   1  lowerThird — 下部テロップ
   ====================================================================== */
reg('lowerThird', {
  name: '下部テロップ', tags: ['editorial', 'calm', 'emotional'], w: 1.1, fits: n => n <= 20, portrait: 0.9,
  plan: (rng, cut, st) => ({ font: rng.pick(fontsOf(st, ['display', 'display', 'serif'])), side: rng.pick(['left', 'left', 'right']), bar: rng.pick(['line', 'tab', 'line']), label: rng.pick(['romaji', 'no', 'copy']), lift: rng.range(0, 0.04) }),
  render(env) {
    const { W, H, sc } = env, p = env.cut.params, u = U(env), port = isPort(env);
    const t0 = env.cut.text.trim(), n = J.glyphCount(t0);
    const text = port ? brk(t0, 6) : n > 13 ? brk(t0, Math.ceil(n / 2)) : t0;
    const o = { track: 0.03, lead: 1.14 };
    const size = Math.min(J.fitSize(text, p.font, W * 0.84, H * (port ? 0.24 : 0.3), o), u * (port ? 0.17 : 0.14));
    const m = meas(text, p.font, size, o);
    const left = p.side !== 'right';
    const mx = W * 0.07;
    const barY = H * ((port ? 0.8 : 0.83) - p.lift);
    const th = Math.max(3, size * 0.055);
    const cy = barY - size * 0.24 - m.h / 2;
    const x = left ? mx : W - mx;
    // accent bar from the screen edge to just past the text; retracts to the edge on exit
    const reach = mx + m.w + size * 0.45;
    const L = reach * tin(env, 0, 0.55) * (1 - E.inCubic(env.pOut));
    if (L > 1) {
      env.rect(left ? 0 : W - L, barY, L, th, sc.accent, 1, true);
      const sq = th * 2.6, ex = left ? L : W - L;
      env.rect(ex - sq / 2, barY + th / 2 - sq / 2, sq, sq, sc.accent, 1, true);
    }
    // label above the lyric
    const ls = smallSize(env);
    const la = tin(env, 0.12, 0.4, E.outCubic) * tout(env);
    if (la > 0.01) {
      const ly = cy - m.h / 2 - size * 0.22 - ls * 0.7;
      const sl = (1 - la) * ls * 2 * (left ? -1 : 1);
      const tag = pad2(Math.max(0, env.cut.line | 0) + 1);
      let copy = p.label === 'romaji' ? (romajiOf(env) || altCopy(env)) : p.label === 'no' ? 'LINE ' + tag : altCopy(env);
      if (/^No\./.test(copy)) copy = J.fmtTime(env.cut.start);
      const tm = meas(tag, monoF(env), ls, { track: 0.1 });
      let cx = x + sl;
      if (p.bar === 'tab') {
        const tw = tm.w + ls * 1.1, th2 = ls * 1.6;
        env.rect(left ? cx : cx - tw, ly - th2 / 2, tw, th2, sc.ink, la, false);
        env.draw({ text: tag, font: monoF(env), size: ls, track: 0.1, x: left ? cx + tw / 2 : cx - tw / 2, y: ly, color: onCol(sc, sc.ink), alpha: la, ghost: false });
        cx += (tw + ls * 0.7) * (left ? 1 : -1);
      } else {
        const q = ls * 0.55;
        env.rect(left ? cx : cx - q, ly - q / 2, q, q, sc.accent, la, false);
        cx += (q + ls * 0.6) * (left ? 1 : -1);
        env.draw({ text: tag, font: monoF(env), size: ls, track: 0.1, align: left ? 'left' : 'right', x: cx, y: ly, color: sc.fg, alpha: la, ghost: false });
        cx += (tm.w + ls * 0.8) * (left ? 1 : -1);
      }
      env.draw({ text: copy, font: p.label === 'copy' ? bodyF(env) : monoF(env), size: ls, track: 0.12, align: left ? 'left' : 'right', x: cx, y: ly, color: sc.sub, alpha: la, ghost: false });
    }
    const bb = J.mainDraw(env, { text, font: p.font, size, x, y: cy, align: left ? 'left' : 'right', track: 0.03, lead: 1.14, color: sc.fg });
    return bb || box(left ? x : x - m.w, cy - m.h / 2, left ? x + m.w : x, cy + m.h / 2);
  },
});

/* ======================================================================
   2  corners — 対角配置
   ====================================================================== */
reg('corners', {
  name: '対角配置', tags: ['graphic', 'editorial', 'calm'], w: 1, fits: n => n >= 2 && n <= 18,
  plan: (rng, cut, st) => ({ chunks: splitK(cut.text, 2, 2), font: rng.pick(fontsOf(st, ['display', 'serif'])), diag: rng.pick(['main', 'main', 'anti']), link: rng.pick(['elbow', 'straight', 'elbow']), ratio: rng.pick([1, 1, 0.76]) }),
  render(env) {
    const { W, H, sc } = env, p = env.cut.params, u = U(env), port = isPort(env);
    let ch = p.chunks && p.chunks.length ? p.chunks : splitK(env.cut.text, 2, 2);
    if (ch.length < 2) ch = splitK(env.cut.text, 2, 2);
    const A0 = ch[0], B0 = ch.length > 1 ? ch.slice(1).join(hasLatin(ch[0]) ? ' ' : '') : '';
    const maxPer = port ? 5 : 9;
    const A = brk(A0, maxPer), B = B0 ? brk(B0, maxPer) : '';
    const o = { track: 0.02, lead: 1.1 };
    const bw = W * (port ? 0.84 : 0.58), bh = H * (port ? 0.24 : 0.3);
    const ratio = p.ratio || 1;
    const s = Math.min(J.fitSize(A, p.font, bw, bh, o), B ? J.fitSize(B, p.font, bw, bh, o) / ratio : 1e9, u * 0.22);
    const sA = s, sB = s * ratio;
    const mA = meas(A, p.font, sA, o), mB = B ? meas(B, p.font, sB, o) : { w: 0, h: 0 };
    const mx = W * 0.075, my = H * (port ? 0.15 : 0.13);
    const aL = p.diag !== 'anti';
    const ax = aL ? mx : W - mx, ay = my + mA.h / 2;
    const bx = aL ? W - mx : mx, by = H - my - mB.h / 2;
    const Ab = box(aL ? ax : ax - mA.w, ay - mA.h / 2, aL ? ax + mA.w : ax, ay + mA.h / 2);
    const Bb = box(aL ? bx - mB.w : bx, by - mB.h / 2, aL ? bx : bx + mB.w, by + mB.h / 2);
    // connector
    const g = u * 0.028;
    let pts;
    if (p.link === 'elbow') {
      const xb = aL ? Bb.x0 + sB * 0.5 : Bb.x1 - sB * 0.5;
      const clear = aL ? xb > Ab.x1 + g * 2 : xb < Ab.x0 - g * 2;
      if (clear) pts = [[aL ? Ab.x1 + g : Ab.x0 - g, Ab.cy], [xb, Ab.cy], [xb, Bb.y0 - g]];
      else { const xm = aL ? Math.max(Ab.x0, Bb.x0) + sB * 0.5 : Math.min(Ab.x1, Bb.x1) - sB * 0.5; pts = [[xm, Ab.y1 + g], [xm, Bb.y0 - g]]; }
    } else pts = [[aL ? Ab.x1 : Ab.x0, Ab.y1 + g], [aL ? Bb.x0 : Bb.x1, Bb.y0 - g]];
    const e = tin(env, env.cut.inDur * 0.5, 0.55, E.inOutCubic) * (1 - E.inCubic(env.pOut));
    const lw = Math.max(1.5, u * 0.0022);
    if (e > 0) {
      env.polyPartial(pts, e, sc.sub, lw, 1, false);
      const a0 = pts[0];
      env.circle(a0[0], a0[1], u * 0.007, sc.bg, sc.sub, lw, Math.min(1, e * 4), false);
      if (e > 0.97) { const z = pts[pts.length - 1]; env.circle(z[0], z[1], u * 0.007, sc.accent, null, 0, 1, false); }
      // small caption on the longest segment
      let bi = 0, bl = 0;
      for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); if (l > bl) { bl = l; bi = i; } }
      const q0 = pts[bi - 1], q1 = pts[bi];
      const ls = smallSize(env) * 0.9;
      const horiz = Math.abs(q1[1] - q0[1]) < Math.abs(q1[0] - q0[0]) * 0.3;
      const mxp = (q0[0] + q1[0]) / 2, myp = (q0[1] + q1[1]) / 2;
      const ca = J.clamp((e - 0.5) * 3);
      const cap = 'No.' + lineNo(env) + '  ' + (romajiOf(env) || '');
      if (ca > 0 && bl > ls * 8) {
        if (horiz) env.draw({ text: cap.trim(), font: monoF(env), size: ls, track: 0.1, x: mxp, y: myp - ls * 1.1, color: sc.sub, alpha: ca, ghost: false });
        else env.draw({ text: cap.trim(), font: monoF(env), size: ls, track: 0.1, align: aL ? 'left' : 'right', x: mxp + (aL ? ls * 0.8 : -ls * 0.8) * (p.link === 'straight' ? -1 : 1), y: myp, color: sc.sub, alpha: ca, ghost: false });
      }
    }
    const nA = J.glyphCount(A0);
    let bb = J.mainDraw(env, { text: A, font: p.font, size: sA, x: ax, y: ay, align: aL ? 'left' : 'right', track: 0.02, lead: 1.1, color: sc.fg, mi: 0 });
    if (B) bb = J.unionBB(bb, J.mainDraw(env, { text: B, font: p.font, size: sB, x: bx, y: by, align: aL ? 'right' : 'left', track: 0.02, lead: 1.1, color: sc.fg, mi: Math.min(8, nA + 2) }));
    return bb || box(Math.min(Ab.x0, Bb.x0), Ab.y0, Math.max(Ab.x1, Bb.x1), Bb.y1);
  },
});

/* ======================================================================
   3  staircase — 階段
   ====================================================================== */
reg('staircase', {
  name: '階段', tags: ['graphic', 'pop', 'editorial'], w: 1, fits: n => n >= 2 && n <= 18,
  plan: (rng, cut, st) => {
    const port = cut.H > cut.W * 1.08, n = cut.n;
    const latin = /[A-Za-z]/.test(cut.text);
    const units = latin ? splitK(cut.text, port ? 6 : 4)
      : port ? (n <= 9 ? charUnits(cut.text) : splitK(cut.text, Math.min(6, Math.ceil(n / 2.6))))
      : (n <= 6 ? charUnits(cut.text) : splitK(cut.text, n <= 10 ? 3 : 4));
    return { units, dir: port ? 'down' : rng.pick(['down', 'down', 'up']), flip: !port && rng.chance(0.22), shrink: rng.range(0.82, 0.9), font: rng.pick(fontsOf(st, ['display', 'display', 'serif'])), tread: rng.pick(['line', 'line', 'none']), nums: rng.chance(0.55) };
  },
  render(env) {
    const { W, H, sc } = env, p = env.cut.params, u = U(env), port = isPort(env);
    const units = p.units && p.units.length ? p.units : [strip(env.cut.text)];
    const k = units.length;
    const r = k > 1 ? Math.max(p.shrink || 0.86, Math.pow(0.5, 1 / (k - 1))) : 1;
    const up = p.dir === 'up' && !port;
    const fx = up ? 1 : port ? 0.5 : 0.92;
    const L = [];
    units.forEach((t, i) => {
      const s = 100 * Math.pow(r, i), w = meas(t, p.font, s, { track: 0.02 }).w;
      let x = 0, y = 0;
      if (i > 0) { const q = L[i - 1]; x = q.x + q.w * fx + q.s * 0.14; y = q.y + (q.s + s) / 2 * 1.05 * (up ? -1 : 1); }
      L.push({ t, s, w, x, y });
    });
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const q of L) { x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x + q.w); y0 = Math.min(y0, q.y - q.s / 2); y1 = Math.max(y1, q.y + q.s * 0.62); }
    const k2 = Math.min(W * 0.86 / (x1 - x0), H * 0.78 / (y1 - y0), u * 0.3 / 100);
    const ox = W / 2 - (x0 + x1) / 2 * k2, oy = H / 2 - (y0 + y1) / 2 * k2;
    const X = q => ox + q.x * k2, Y = q => oy + q.y * k2;
    const mirror = xx => (p.flip ? W - xx : xx);
    // tread / riser guide
    if (p.tread !== 'none' || p.nums) {
      const e = tin(env, 0, Math.max(0.5, env.cut.inDur * 1.6), E.inOutCubic) * (1 - E.inCubic(env.pOut));
      const lw = Math.max(2, 100 * k2 * 0.022);
      const pts = [];
      L.forEach((q, i) => {
        const yb = Y(q) + q.s * k2 * 0.58, gap = q.s * k2 * 0.14;
        if (i === 0) pts.push([X(q) - gap, yb]);
        if (i < k - 1) { const nx = L[i + 1], xr = X(nx) - gap / 2; pts.push([xr, yb], [xr, Y(nx) + nx.s * k2 * 0.58]); }
        else pts.push([X(q) + q.w * k2 + gap, yb]);
      });
      if (p.tread !== 'none' && e > 0) env.polyPartial(pts.map(q => [mirror(q[0]), q[1]]), e, sc.accent, lw, 1, false);
      if (p.nums && e > 0) {
        const ls = smallSize(env) * 0.85;
        L.forEach((q, i) => {
          const a = J.clamp((e * k - i) * 1.5);
          if (a <= 0) return;
          const yb = Y(q) + q.s * k2 * 0.58;
          env.draw({ text: pad2(i + 1), font: monoF(env), size: ls, align: p.flip ? 'right' : 'left', x: mirror(X(q)), y: yb + ls * 1.1, color: sc.sub, alpha: a, ghost: false });
        });
      }
    }
    let bb = null;
    L.forEach((q, i) => {
      const s = q.s * k2, xl = X(q);
      const it = { text: q.t, font: p.font, size: s, x: p.flip ? W - xl - q.w * k2 : xl, y: Y(q), align: 'left', track: 0.02, color: i === 0 ? sc.fg : sc.fg, mi: i * 2 };
      bb = J.unionBB(bb, J.mainDraw(env, it));
    });
    return bb || box(W / 2 - (x1 - x0) * k2 / 2, H / 2 - (y1 - y0) * k2 / 2, W / 2 + (x1 - x0) * k2 / 2, H / 2 + (y1 - y0) * k2 / 2);
  },
});

/* ======================================================================
   4  zigzag — ジグザグ
   ====================================================================== */
reg('zigzag', {
  name: 'ジグザグ', tags: ['pop', 'graphic'], w: 0.9, fits: n => n >= 3 && n <= 16,
  plan: (rng, cut, st) => {
    const port = cut.H > cut.W * 1.08;
    return { font: rng.pick(fontsOf(st, ['display'])), orient: port && cut.n > 5 ? 'v' : 'h', amp: rng.range(0.24, 0.34), phase: rng.pick([1, -1]), rails: rng.pick(['under', 'both', 'under', 'over']), tilt: rng.chance(0.35) };
  },
  render(env) {
    const { W, H, sc } = env, p = env.cut.params, u = U(env);
    const chars = hasLatin(env.cut.text) ? [...env.cut.text.trim().replace(/\s+/g, ' ')] : [...strip(env.cut.text)], n = chars.length;
    const v = p.orient === 'v';
    const size = Math.min((v ? H * 0.78 : W * 0.8) / n / 1.08, u * 0.2);
    const step = size * 1.08;
    const A = size * p.amp;
    const pos = i => { const s = (i % 2 ? 1 : -1) * p.phase, k = i - (n - 1) / 2; return v ? [W / 2 + s * A, H / 2 + k * step] : [W / 2 + k * step, H / 2 + s * A]; };
    // zigzag rails riding just outside the glyphs, extended to the frame margins
    const off = size * (0.52 + p.amp * 0.9);
    const e = tin(env, 0, Math.max(0.45, env.cut.inDur * 1.5), E.inOutCubic) * (1 - E.inCubic(env.pOut));
    if (e > 0) {
      const lw = Math.max(2, size * 0.03);
      const lim = v ? H * 0.04 : W * 0.04;
      const ext = Math.ceil(((v ? H : W) / 2 - n * step / 2 - lim) / step);
      const rail = sgn => {
        const pts = [];
        for (let i = -ext; i <= n - 1 + ext; i++) {
          const q = pos(i), pt = v ? [q[0] + sgn * off, q[1]] : [q[0], q[1] + sgn * off];
          const c = v ? pt[1] : pt[0];
          if (c < lim || c > (v ? H : W) - lim) continue;
          pts.push(pt);
        }
        return pts;
      };
      const sides = p.rails === 'both' ? [1, -1] : p.rails === 'over' ? [-1] : [1];
      sides.forEach((sg, k) => {
        const pts = rail(sg);
        if (pts.length < 2) return;
        env.polyPartial(pts, e, k === 0 ? sc.accent : sc.sub, lw, 1, false);
        const tip = Math.min(pts.length - 1, Math.floor(e * (pts.length - 1)));
        env.circle(pts[0][0], pts[0][1], lw * 2.2, k === 0 ? sc.accent : sc.sub, null, 0, 1, false);
        if (e > 0.98) env.circle(pts[tip][0], pts[tip][1], lw * 2.2, k === 0 ? sc.accent : sc.sub, null, 0, 1, false);
      });
    }
    let bb = null;
    chars.forEach((ch, i) => {
      const [x, y] = pos(i);
      if (ch === ' ') return;
      const rot = (p.tilt ? (i % 2 ? 1 : -1) * p.phase * 6 * (v ? -1 : 1) : 0) + (v && (J.VERT_ROTATE.includes(ch) || J.isLatin(ch)) ? 90 : 0);
      bb = J.unionBB(bb, J.mainDraw(env, { text: ch, font: p.font, size, x, y, rot, color: sc.fg, mi: i }));
    });
    return bb || (v ? box(W / 2 - A - size / 2, H / 2 - step * n / 2, W / 2 + A + size / 2, H / 2 + step * n / 2) : box(W / 2 - step * n / 2, H / 2 - A - size / 2, W / 2 + step * n / 2, H / 2 + A + size / 2));
  },
});

/* ======================================================================
   5  arcTop — 虹の弧
   ====================================================================== */
reg('arcTop', {
  name: '虹の弧', tags: ['pop', 'emotional', 'graphic'], w: 0.9, fits: n => n >= 3 && n <= 16,
  plan: (rng, cut, st) => { const port = cut.H > cut.W * 1.08; return { font: rng.pick(fontsOf(st, ['display', 'serif', 'display'])), span: port ? rng.range(150, 190) : rng.range(105, 145), guide: rng.pick(['double', 'ticks', 'double']), under: rng.pick(['copy', 'romaji', 'no']) }; },
  render(env) {
    const { W, H, sc } = env, p = env.cut.params, u = U(env);
    const chars = [...env.cut.text.trim()], n = chars.length;
    const spanDeg = Math.min(p.span, Math.max(50, n * 30));
    const half = spanDeg / 2 * J.DEG, dth = spanDeg * J.DEG / n, k = dth / 1.1;
    const wid = half < Math.PI / 2 ? 2 * Math.sin(half) : 2;
    const hollow = half >= 70 * J.DEG;
    const R = Math.min(W * 0.86 / (wid + k), H * 0.66 / (1 - Math.cos(half) + k * 1.3 + (hollow ? 0 : 0.18)), u * 0.21 / k);
    const size = R * k;
    const ls = smallSize(env);
    // vertical placement: centre the arc + caption block
    const topOff = -(R + size * 0.8);
    const endY = -R * Math.cos(half) + size * 0.55;
    const capY = hollow ? Math.max(0, -R * Math.cos(half) - R * 0.1) : endY + ls * 1.6;
    const botOff = Math.max(endY, capY + ls * 2.2);
    const cx = W / 2, cy = H / 2 - (topOff + botOff) / 2;
    const e = tin(env, 0, 0.7, E.inOutCubic) * (1 - E.inCubic(env.pOut));
    const lw = Math.max(1.2, size * 0.018);
    const a0 = -90 - spanDeg / 2 - 3, a1 = -90 + spanDeg / 2 + 3;
    if (e > 0) {
      const sp = (a1 - a0) / 2 * e;
      if (p.guide === 'double') {
        env.arc(cx, cy, R + size * 0.74, -90 - sp, -90 + sp, sc.sub, lw, 0.9, false);
        env.arc(cx, cy, R - size * 0.72, -90 - sp, -90 + sp, sc.sub, lw, 0.6, false);
      } else {
        env.arc(cx, cy, R - size * 0.72, -90 - sp, -90 + sp, sc.sub, lw, 0.8, false);
        for (let i = 0; i <= n; i++) {
          const th = (-90 + (i - n / 2) * spanDeg / n);
          if (Math.abs(th + 90) > sp + 0.01) continue;
          const c = Math.cos(th * J.DEG), s = Math.sin(th * J.DEG), r0 = R - size * 0.72, r1 = r0 - size * (i % 2 ? 0.12 : 0.22);
          env.line([[cx + c * r0, cy + s * r0], [cx + c * r1, cy + s * r1]], sc.sub, lw, 0.8, false);
        }
      }
      env.circle(cx + Math.cos((-90 - sp) * J.DEG) * (R + size * 0.74), cy + Math.sin((-90 - sp) * J.DEG) * (R + size * 0.74), size * 0.05, sc.accent, null, 0, 1, false);
      env.circle(cx + Math.cos((-90 + sp) * J.DEG) * (R + size * 0.74), cy + Math.sin((-90 + sp) * J.DEG) * (R + size * 0.74), size * 0.05, sc.accent, null, 0, 1, false);
    }
    // caption under the arc
    const ca = tin(env, 0.25, 0.4, E.outCubic) * tout(env);
    if (ca > 0.01) {
      const copy = p.under === 'romaji' ? (romajiOf(env) || altCopy(env)) : p.under === 'no' ? 'No.' + lineNo(env) + '  —  ' + J.fmtTime(env.cut.start) : altCopy(env);
      const maxW = hollow ? 2 * (R - size) * 0.8 : W * 0.7;
      const cs = Math.min(ls * 1.15, J.fitSize(copy, bodyF(env), maxW, ls * 2, { track: 0.12 }));
      env.draw({ text: copy, font: bodyF(env), size: cs, track: 0.12, x: cx, y: cy + capY, color: sc.sub, alpha: ca, ghost: false });
      const rw = Math.min(maxW * 0.5, size * 1.4) * ca;
      env.line([[cx - rw / 2, cy + capY + cs * 1.1], [cx + rw / 2, cy + capY + cs * 1.1]], sc.accent, Math.max(2, lw * 1.4), ca, false);
    }
    let bb = null;
    chars.forEach((ch, i) => {
      if (ch === ' ' || ch === '　') return;
      const th = -90 + (i - (n - 1) / 2) * spanDeg / n;
      const x = cx + Math.cos(th * J.DEG) * R, y = cy + Math.sin(th * J.DEG) * R;
      bb = J.unionBB(bb, J.mainDraw(env, { text: ch, font: p.font, size, x, y, rot: th + 90, color: sc.fg, mi: i }));
    });
    return bb || box(cx - R * wid / 2 - size / 2, cy - R - size / 2, cx + R * wid / 2 + size / 2, cy + endY);
  },
});

/* ======================================================================
   6  spiral — 螺旋
   ====================================================================== */
reg('spiral', {
  name: '螺旋', tags: ['emotional', 'graphic', 'calm'], w: 0.8, fits: n => n >= 2 && n <= 16,
  plan: (rng, cut, st) => ({ font: rng.pick(fontsOf(st, ['display', 'serif'])), dir: rng.pick([1, -1]), speed: rng.range(4, 9), guide: rng.chance(0.7), fill: cut.n <= 7 ? 'repeat' : cut.n <= 11 ? rng.pick(['repeat', 'single']) : 'single' }),
  render(env) {
    const { W, H, sc } = env, p = env.cut.params, u = U(env);
    const chars = hasLatin(env.cut.text) ? [...env.cut.text.trim().replace(/\s+/g, ' ')] : [...strip(env.cut.text)], n = chars.length;
    const seq = chars.map((c, i) => ({ c, main: true, i }));
    if (p.fill === 'repeat') {
      const reps = Math.max(1, Math.ceil(20 / (n + 1)) - 1);
      for (let r = 0; r < reps && seq.length < 40; r++) { seq.push({ c: '・', main: false }); chars.forEach(c => seq.push({ c, main: false })); }
    }
    const N = seq.length;
    const f = p.fill === 'repeat' ? 0.8 : 0.58;
    const c = Math.min(0.42, 0.92 * Math.sqrt(5.82 * f / N));
    const dth = c * 1.08, TH = N * dth;
    const R0 = u * 0.45 / (1 + c * 0.55);
    const rAt = th => R0 * (1 - f * th / TH);
    // the lyric is centred on the top (tops outward, clockwise) or the bottom (tops inward, counter-clockwise) so it reads upright
    const mid = p.dir > 0 ? -90 : 90;
    const base = mid - p.dir * Math.min((n - 1) * dth / 2 / J.DEG, 70);
    const drift = (env.ltb - env.cut.dur / 2) * p.speed * p.dir;
    // centre the glyph cloud (at rest) on screen
    let bx0 = 1e9, bx1 = -1e9, by0 = 1e9, by1 = -1e9;
    seq.forEach((q, j) => {
      const th = j * dth, r = rAt(th), sz = c * r * 0.5, ph = (base + p.dir * th / J.DEG) * J.DEG;
      const x = Math.cos(ph) * r, y = Math.sin(ph) * r;
      bx0 = Math.min(bx0, x - sz); bx1 = Math.max(bx1, x + sz); by0 = Math.min(by0, y - sz); by1 = Math.max(by1, y + sz);
    });
    const cx = W / 2 - (bx0 + bx1) / 2, cy = H / 2 - (by0 + by1) / 2;
    const rot0 = base + drift;
    const out = tout(env);
    if (p.guide) {
      const e = tin(env, 0, 0.9, E.inOutCubic) * out;
      if (e > 0) {
        const pts = [], M = 100;
        for (let k = 0; k <= M; k++) {
          const th = (k / M) * (TH - dth * 0.5), r = rAt(th) * (1 + c * 0.62);
          const ph = (rot0 + p.dir * th / J.DEG) * J.DEG;
          pts.push([cx + Math.cos(ph) * r, cy + Math.sin(ph) * r]);
        }
        env.polyPartial(pts, e, sc.sub, Math.max(1.2, u * 0.0016), 0.55, false);
      }
    }
    const dotE = E.outBack(J.clamp(env.lt / 0.35), 2) * out;
    env.circle(cx, cy, u * 0.008 * dotE, sc.accent, null, 0, 1, false);
    let bb = null;
    seq.forEach((q, j) => {
      const th = j * dth, r = rAt(th), size = c * r;
      const ph = rot0 + p.dir * th / J.DEG;
      const x = cx + Math.cos(ph * J.DEG) * r, y = cy + Math.sin(ph * J.DEG) * r;
      const rot = p.dir > 0 ? ph + 90 : ph - 90;
      if (q.c === ' ') return;
      if (q.main) bb = J.unionBB(bb, J.mainDraw(env, { text: q.c, font: p.font, size, x, y, rot, color: sc.fg, mi: q.i, noHold: true }));
      else {
        const a = J.clamp((env.lt - 0.15 - (j - n) * 0.025) / 0.25) * out * J.lerp(0.22, 0.7, r / R0);
        if (a > 0.01) env.draw({ text: q.c, font: p.font, size, x, y, rot, color: sc.sub, alpha: a, ghost: false });
      }
    });
    return bb || box(cx + bx0, cy + by0, cx + bx1, cy + by1);
  },
});

/* ======================================================================
   7  gridCells — 升目
   ====================================================================== */
reg('gridCells', {
  name: '升目', tags: ['graphic', 'editorial', 'pop'], w: 1, fits: n => n >= 2 && n <= 18, treat: 'safe',
  plan: (rng, cut, st) => ({ font: rng.pick(fontsOf(st, ['display', 'serif'])), gap: rng.pick([0, 0, 0.1, 0.16]), acc: rng.int(0, 99), fill: rng.pick(['outline', 'outline', 'ink']), nums: rng.chance(0.6) }),
  render(env) {
    const { W, H, sc } = env, p = env.cut.params, u = U(env), port = isPort(env);
    const chars = [...strip(env.cut.text)], n = chars.length;
    const maxCols = port ? (n <= 8 ? 4 : 5) : (n <= 10 ? 10 : 8);
    const rows = Math.ceil(n / Math.min(n, maxCols)), cols = Math.ceil(n / rows);
    const g = p.gap || 0;
    const cell = Math.min(W * 0.86 / (cols + (cols - 1) * g), H * 0.72 / (rows + (rows - 1) * g), u * 0.3);
    const stp = cell * (1 + g);
    const gw = cols * cell + (cols - 1) * cell * g, gh = rows * cell + (rows - 1) * cell * g;
    const x0 = W / 2 - gw / 2, y0 = H / 2 - gh / 2;
    const kan = chars.map((ch, i) => (J.isKanji(ch) ? i : -1)).filter(i => i >= 0);
    const ok = chars.map((ch, i) => (!J.isPunct(ch) && !J.isSmallKana(ch) ? i : -1)).filter(i => i >= 0);
    const ai = kan.length ? kan[p.acc % kan.length] : ok.length ? ok[p.acc % ok.length] : p.acc % n;
    const out = tout(env);
    const lw = Math.max(1.5, cell * 0.012);
    const plate = p.fill === 'ink';
    const total = rows * cols;
    for (let i = 0; i < total; i++) {
      const cx = x0 + (i % cols) * stp, cy = y0 + Math.floor(i / cols) * stp;
      const d = i * 0.03;
      const e = tin(env, d, 0.35, E.inOutCubic) * out;
      if (e <= 0) continue;
      const empty = i >= n;
      if (i === ai || (plate && !empty)) {
        const q = E.outBack(J.clamp((env.lt - d - 0.08) / 0.28), 1.6) * out;
        const col = i === ai ? sc.accent : sc.ink;
        if (q > 0) env.rect(cx + cell / 2 * (1 - q), cy + cell / 2 * (1 - q), cell * q, cell * q, col, 1, i === ai);
      }
      const loop = [[cx, cy], [cx + cell, cy], [cx + cell, cy + cell], [cx, cy + cell], [cx, cy]];
      env.polyPartial(loop, e, empty ? sc.sub : sc.fg, lw, empty ? 0.35 : 0.9, false);
      if (p.nums && !empty) {
        const ns = Math.max(10, cell * 0.1);
        env.draw({ text: pad2(i + 1), font: monoF(env), size: ns, align: 'left', x: cx + ns * 0.6, y: cy + ns * 1.1, color: i === ai ? onCol(sc, sc.accent) : plate ? onCol(sc, sc.ink) : sc.sub, alpha: J.clamp(e * 1.5 - 0.5) * 0.85, ghost: false });
      }
    }
    let bb = null;
    chars.forEach((ch, i) => {
      const cx = x0 + (i % cols) * stp + cell / 2, cy = y0 + Math.floor(i / cols) * stp + cell / 2;
      const col = i === ai ? onCol(sc, sc.accent) : plate ? onCol(sc, sc.ink) : sc.fg;
      bb = J.unionBB(bb, J.mainDraw(env, { text: ch, font: p.font, size: cell * 0.64, x: cx, y: cy + cell * 0.02, color: col, mi: i }));
    });
    return bb || box(x0, y0, x0 + gw, y0 + gh);
  },
});

/* ======================================================================
   8  dropCap — 大きな頭文字
   ====================================================================== */
reg('dropCap', {
  name: '大きな頭文字', tags: ['editorial', 'emotional', 'calm'], w: 1, enterBias: { blur: 1.4, wipe: 1.3, type: 1.2 }, fits: n => n >= 3 && n <= 24, portrait: 0.8,
  plan: (rng, cut, st) => ({ capFont: rng.pick(fontsOf(st, ['serif', 'display'])), font: rng.pick(fontsOf(st, ['serif', 'body', 'display'])), cap: rng.pick(['fill', 'accent', 'outline']), rules: rng.chance(0.65), meta: rng.chance(0.7) }),
  render(env) {
    const { W, H, sc } = env, p = env.cut.params, u = U(env), port = isPort(env);
    const arr = [...env.cut.text.trim()];
    const cap = arr[0] || '';
    const rest = arr.slice(1).join('').trim();
    const nR = J.glyphCount(rest);
    const colW = W * (port ? 0.84 : 0.66);
    const lead = 1.3, tr = 0.04;
    const capAdv = J.metrics.adv(p.capFont, cap) || 1;
    // choose line breaks + size analytically: every candidate split gets its largest fitting size
    const L = memo(['dc', rest, W, H, p.font, p.capFont, cap].join('|'), () => {
      const w1 = t => rowW(t, p.font, 1) + Math.max(0, [...t].length - 1) * tr;
      const cands = new Map();
      for (let m = 1; m <= Math.max(1, nR); m++) { const t = J.splitLines(rest, m); cands.set(t, t.split('\n').map(l => l.trim()).filter(Boolean)); }
      const nat = new Set(); let acc = 0;
      for (const c of (J.chunkText ? J.chunkText(rest) : [rest])) { acc += J.glyphCount(c); nat.add(acc); }
      let best = null, bs = -1;
      for (const lines of cands.values()) {
        let q = 1, cum = 0;
        lines.forEach((l, i) => { cum += J.glyphCount(l); if (i < lines.length - 1 && !nat.has(cum) && !hasLatin(l)) q *= 0.82; });
        if (nR >= 4 && lines.length < 2) continue;
        if (nR >= 4 && lines.some(l => J.glyphCount(l) < 2)) continue;
        if (nR <= 3 && lines.length > 1) continue;
        for (const cl of (nR <= 10 ? [2] : [3, 2])) {
          const kc = ((cl - 1) * lead + 1) / 0.86;
          const nl = Math.max(lines.length, cl);
          let sm = Math.min(u * 0.12, H * 0.62 / ((nl - 1) * lead + 1));
          lines.forEach((l, i) => { sm = Math.min(sm, i < cl ? colW / (w1(l) + capAdv * kc + 0.5) : colW / w1(l)); });
          const score = sm * q * (1 - 0.1 * Math.max(0, lines.length - cl));
          if (score > bs) { bs = score; best = { s: sm, cl, lines, capS: sm * kc, gap: sm * 0.5 }; }
        }
      }
      if (!best) best = { s: u * 0.06, cl: 2, lines: [rest], capS: u * 0.06 * 2.67, gap: u * 0.03 };
      best.wOf = t => w1(t) * best.s;
      return best;
    });
    let s;
    s = L.s;
    const capLines = L.cl, capS = L.capS, capW = capAdv * capS;
    const nl = L.lines.length;
    const besideOnly = nl <= capLines;
    let usedW = 0;
    L.lines.forEach((ln, i) => { usedW = Math.max(usedW, (i < capLines ? capW + L.gap : 0) + L.wOf(ln)); });
    usedW = Math.max(usedW, capW + L.gap + s);
    const hBlock = (Math.max(nl, capLines) - 1) * lead * s + s;
    const x0 = W / 2 - usedW / 2;
    const top = H / 2 - hBlock / 2 - (p.meta ? s * 0.3 : 0);
    const capBand = ((capLines - 1) * lead + 1) * s;
    const capCy = top + capBand / 2;
    const lineY = i => besideOnly ? capCy + (i - (nl - 1) / 2) * lead * s * (nl < capLines ? 1.15 : 1) : top + s / 2 + i * lead * s;
    const out = tout(env);
    const yT = top - s * 0.45, yB = top + hBlock + s * 0.45;
    if (p.rules) {
      const e = tin(env, 0.05, 0.6, E.inOutCubic) * out, lw = Math.max(1.5, s * 0.02);
      env.line([[x0, yT], [x0 + usedW * e, yT]], sc.fg, lw, 0.9, false);
      env.line([[x0 + usedW, yB], [x0 + usedW - usedW * e, yB]], sc.fg, lw, 0.9, false);
    }
    if (p.meta) {
      const a = tin(env, 0.3, 0.4, E.outCubic) * out, ls = smallSize(env) * 0.9;
      const yM = yB + ls * 1.3;
      env.draw({ text: 'No.' + lineNo(env), font: monoF(env), size: ls, track: 0.1, align: 'left', x: x0, y: yM, color: sc.accent, alpha: a, ghost: false });
      env.draw({ text: romajiOf(env) || altCopy(env), font: monoF(env), size: ls, track: 0.1, align: 'right', x: x0 + usedW, y: yM, color: sc.sub, alpha: a, ghost: false });
    }
    const capIt = { text: cap, font: p.capFont, size: capS, x: x0 + capW / 2, y: capCy + capS * 0.02, color: p.cap === 'accent' ? sc.accent : sc.fg, mi: 0 };
    if (p.cap === 'outline') Object.assign(capIt, { fill: false, stroke: Math.max(2, capS * 0.014) });
    let bb = J.mainDraw(env, capIt);
    L.lines.forEach((ln, i) => {
      bb = J.unionBB(bb, J.mainDraw(env, { text: ln, font: p.font, size: s, x: i < capLines ? x0 + capW + L.gap : x0, y: lineY(i), align: 'left', track: tr, color: sc.fg, mi: 2 + i * 2 }));
    });
    return bb || box(x0, top, x0 + usedW, top + hBlock);
  },
});

/* ======================================================================
   9  justified — 版面
   ====================================================================== */
reg('justified', {
  name: '版面', tags: ['editorial', 'calm', 'emotional'], w: 0.8, fits: n => n >= 2 && n <= 22, busy: true, treat: 'safe',
  plan: (rng, cut, st) => ({ font: rng.pick(fontsOf(st, ['display', 'serif'])), fillFont: rng.pick(fontsOf(st, ['body', 'serif'])), mark: rng.pick(['band', 'under', 'bracket']), pos: rng.pick([0.28, 0.5, 0.66]), dens: rng.range(0.062, 0.078) }),
  render(env) {
    const { W, H, sc } = env, p = env.cut.params, u = U(env);
    const text = env.cut.text.trim(), n = J.glyphCount(text);
    const bx0 = W * 0.08, bw = W * 0.84, by0 = H * 0.09, bh = H * 0.82;
    const rowsN = Math.max(8, Math.round(bh / (u * (p.dens || 0.07))));
    const rowH = bh / rowsN, fs = rowH * 0.6;
    // lyric: each line set to the full measure
    const capH = rowH * (n <= 5 ? 3.4 : 2.6);
    let lines = [text];
    const fitL = (l, hmax) => Math.min(hmax, J.fitSize(l, p.font, bw, hmax, { track: 0.04 }));
    if (fitL(text, capH) < rowH * 1.6 && n >= 4) lines = splitK(text, 2);
    const two = lines.length > 1;
    const s2 = two ? Math.min(...lines.map(l => fitL(l, rowH * 2.4))) : 0;
    const sizes = two ? lines.map(() => s2) : [fitL(text, capH)];
    const lyH = sizes.reduce((a, b) => a + b, 0) + (lines.length - 1) * rowH * 0.25;
    const span = Math.ceil(lyH / rowH + 0.8);
    const r0 = Math.round(p.pos * (rowsN - span));
    const out = tout(env);
    // filler: the whole line set solid, running on through the rows
    const src = [...(flat(env.cut.lineText || text) + (hasLatin(text) ? ' / ' : '。'))];
    const adv = J.metrics.adv(p.fillFont, 'あ') || 1;
    const cpr = Math.max(4, Math.floor(bw / (fs * adv * 1.06)));
    let off = 0;
    for (let r = 0; r < rowsN; r++) {
      if (r >= r0 && r < r0 + span) continue;
      let row = '';
      for (let j = 0; j < cpr; j++) row += src[(off + j) % src.length];
      off += cpr;
      const a = J.clamp((env.lt - r * 0.018) / 0.2) * out;
      if (a <= 0.01) continue;
      const sp = (bw - rowW(row, p.fillFont, fs)) / Math.max(1, cpr - 1);
      fastRow(env, row, p.fillFont, fs, bx0, by0 + (r + 0.5) * rowH, sp, sc.sub, a * 0.34);
    }
    const yc = by0 + (r0 + span / 2) * rowH;
    const mx = sizes[0];
    const plate = p.mark === 'band';
    const e = tin(env, 0.05, 0.5, E.inOutExpo) * out;
    if (plate && e > 0) env.rect(bx0 - mx * 0.2, yc - lyH / 2 - mx * 0.2, (bw + mx * 0.4) * e, lyH + mx * 0.4, sc.accent, 1, false);
    if (p.mark === 'under' && e > 0) { const lw = Math.max(3, mx * 0.05); env.rect(bx0, yc + lyH / 2 + mx * 0.2, bw * e, lw, sc.accent, 1, true); env.rect(bx0 + bw * (1 - e), yc - lyH / 2 - mx * 0.2 - lw, bw * e, lw, sc.accent, 1, true); }
    if (p.mark === 'bracket' && e > 0) {
      const aL = mx * 0.45 * e, lw = Math.max(2, mx * 0.04), yt = yc - lyH / 2 - mx * 0.16, yb = yc + lyH / 2 + mx * 0.16, g = mx * 0.14;
      env.line([[bx0 - g + aL, yt], [bx0 - g, yt], [bx0 - g, yb], [bx0 - g + aL, yb]], sc.accent, lw, 1, false);
      env.line([[bx0 + bw + g - aL, yt], [bx0 + bw + g, yt], [bx0 + bw + g, yb], [bx0 + bw + g - aL, yb]], sc.accent, lw, 1, false);
    }
    const ms = Math.max(11, rowH * 0.28), fa = tin(env, 0.1, 0.4, E.outCubic) * out;
    env.draw({ text: 'No.' + lineNo(env), font: monoF(env), size: ms, align: 'left', x: bx0, y: by0 - rowH * 0.45, color: sc.sub, alpha: fa, ghost: false });
    env.draw({ text: rowsN + ' × ' + cpr, font: monoF(env), size: ms, align: 'right', x: bx0 + bw, y: by0 + bh + rowH * 0.45, color: sc.sub, alpha: fa, ghost: false });
    let bb = null, y = yc - lyH / 2;
    const col = plate ? onCol(sc, sc.accent) : sc.fg;
    lines.forEach((ln, i) => {
      const ls = sizes[i], nG = [...ln].length;
      y += ls / 2;
      let it;
      if (two) it = { text: ln, font: p.font, size: ls, track: 0.04, align: i === 0 ? 'left' : 'right', x: i === 0 ? bx0 : bx0 + bw, y, color: col, mi: i * 3 };
      else if (nG > 1) { const w0 = meas(ln, p.font, ls).w; it = { text: ln, font: p.font, size: ls, track: (bw - w0) / (ls * (nG - 1)), align: 'left', x: bx0, y, color: col, mi: 0 }; }
      else it = { text: ln, font: p.font, size: ls, x: bx0 + bw / 2, y, color: col, mi: 0 };
      bb = J.unionBB(bb, J.mainDraw(env, it));
      y += ls / 2 + rowH * 0.25;
    });
    return bb || box(bx0, yc - lyH / 2, bx0 + bw, yc + lyH / 2);
  },
});

/* ======================================================================
   10  frameBox — 額縁
   ====================================================================== */
reg('frameBox', {
  name: '額縁', tags: ['editorial', 'calm', 'graphic'], w: 1.1, fits: n => n <= 20,
  plan: (rng, cut, st) => ({ font: rng.pick(fontsOf(st, ['display', 'serif', 'serif'])), style: rng.pick(['full', 'double', 'corners']), caps: rng.pick(['tl-br', 'top-bottom']), shape: rng.pick(['tight', 'wide']) }),
  render(env) {
    const { W, H, sc } = env, p = env.cut.params, u = U(env), port = isPort(env);
    const text = brk(env.cut.text.trim(), port ? 6 : 12);
    const o = { track: 0.04, lead: 1.2 };
    const size = Math.min(J.fitSize(text, p.font, W * (port ? 0.74 : 0.68), H * 0.36, o), u * 0.19);
    const m = meas(text, p.font, size, o);
    let fw = m.w + size * 1.6, fh = m.h + size * 1.4;
    if (p.shape === 'wide') { fw = Math.max(fw, W * (port ? 0.82 : 0.62)); fh = Math.max(fh, fw * (port ? 0.9 : 0.5)); }
    fw = Math.min(fw, W * 0.9); fh = Math.min(fh, H * 0.86);
    const x0 = W / 2 - fw / 2, y0 = H / 2 - fh / 2, x1 = x0 + fw, y1 = y0 + fh;
    const ls = smallSize(env) * 0.9, gp = ls * 0.7;
    const c1 = 'No.' + lineNo(env), c2 = romajiOf(env) || J.fmtTime(env.cut.start);
    const w1 = meas(c1, monoF(env), ls, { track: 0.12 }).w, w2 = meas(c2, monoF(env), ls, { track: 0.12 }).w;
    const tb = p.caps === 'top-bottom';
    const a1 = tb ? W / 2 - w1 / 2 : x0 + ls * 2.2, b2 = tb ? W / 2 + w2 / 2 : x1 - ls * 2.2;
    const e = tin(env, 0, 0.85, E.inOutCubic) * (1 - E.inCubic(env.pOut));
    const lw = Math.max(2, size * 0.02);
    const segsFor = (X0, Y0, X1, Y1, gaps) => gaps
      ? [[[X0, Y0], [a1 - gp, Y0]], [[a1 + w1 + gp, Y0], [X1, Y0], [X1, Y1], [b2 + gp, Y1]], [[b2 - w2 - gp, Y1], [X0, Y1], [X0, Y0]]]
      : [[[X0, Y0], [X1, Y0], [X1, Y1], [X0, Y1], [X0, Y0]]];
    if (e > 0) {
      if (p.style === 'corners') {
        const arm = Math.min(fw, fh) * 0.22 * e;
        [[x0, y0, 1, 1], [x1, y0, -1, 1], [x1, y1, -1, -1], [x0, y1, 1, -1]].forEach(([X, Y, dx, dy]) => env.line([[X + dx * arm, Y], [X, Y], [X, Y + dy * arm]], sc.fg, lw * 1.4, 1, false));
      } else {
        segsPartial(env, segsFor(x0, y0, x1, y1, true), e, sc.fg, lw, 1, false);
        if (p.style === 'double') { const d = size * 0.16; segsPartial(env, segsFor(x0 + d, y0 + d, x1 - d, y1 - d, false), J.clamp(e * 1.15 - 0.15), sc.sub, Math.max(1, lw * 0.5), 0.8, false); }
      }
      const ca = J.clamp(e * 2 - 0.6);
      if (ca > 0) {
        env.draw({ text: c1, font: monoF(env), size: ls, track: 0.12, align: 'left', x: a1, y: y0, color: sc.accent, alpha: ca, ghost: false });
        env.draw({ text: c2, font: monoF(env), size: ls, track: 0.12, align: 'right', x: b2, y: y1, color: sc.sub, alpha: ca, ghost: false });
      }
    }
    const bb = J.mainDraw(env, { text, font: p.font, size, x: W / 2, y: H / 2, track: 0.04, lead: 1.2, color: sc.fg });
    return bb || box(W / 2 - m.w / 2, H / 2 - m.h / 2, W / 2 + m.w / 2, H / 2 + m.h / 2);
  },
});

/* ======================================================================
   11  bubble — 吹き出し
   ====================================================================== */
function bubblePoly(shape, cx, cy, w, h, size, tailSide) {
  const x0 = cx - w / 2, y0 = cy - h / 2, x1 = cx + w / 2, y1 = cy + h / 2;
  const tipX = cx + tailSide * w * 0.36, tipY = y1 + size * 0.75;
  if (shape === 'ellipse') {
    const rx = w / 2, ry = h / 2, M = 56, ta = (tailSide > 0 ? 62 : 118) * J.DEG, dA = 0.16;
    const pts = [];
    for (let i = 0; i < M; i++) {
      const a = i / M * J.TAU;
      if (Math.abs(a - ta) < dA) { if (Math.abs(a - ta) < J.TAU / M / 2 + 1e-6 || (pts.tipDone !== true && a > ta)) { pts.push([tipX, tipY]); pts.tipDone = true; } continue; }
      pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
    }
    if (!pts.tipDone) pts.push([tipX, tipY]);
    return { pts, tip: [tipX, tipY] };
  }
  const r = Math.min(h * 0.42, size * 0.9), seg = 6, pts = [];
  const corner = (ccx, ccy, a0) => { for (let i = 0; i <= seg; i++) { const a = (a0 + 90 * i / seg) * J.DEG; pts.push([ccx + Math.cos(a) * r, ccy + Math.sin(a) * r]); } };
  corner(x1 - r, y0 + r, -90); corner(x1 - r, y1 - r, 0);
  const bw = Math.min(size * 0.55, w * 0.18), bc = cx + tailSide * w * 0.2;
  if (tailSide > 0) { pts.push([bc + bw / 2, y1], [tipX, tipY], [bc - bw / 2, y1]); }
  else { pts.push([bc + bw / 2, y1], [tipX, tipY], [bc - bw / 2, y1]); }
  corner(x0 + r, y1 - r, 90); corner(x0 + r, y0 + r, 180);
  return { pts, tip: [tipX, tipY] };
}
reg('bubble', {
  name: '吹き出し', tags: ['pop', 'emotional'], w: 0.9, enterBias: { pop: 2, drop: 1.4, spin: 0.5 }, fits: n => n <= 20, treat: 'safe',
  plan: (rng, cut, st) => ({ font: rng.pick(fontsOf(st, ['display', 'body'])), shape: rng.pick(['round', 'ellipse', 'thought', 'round']), style: rng.pick(['fill', 'outline', 'fill']), tail: rng.pick([1, -1]), off: rng.range(-0.05, 0.05), tilt: rng.range(-3, 3), burst: rng.chance(0.6) }),
  render(env) {
    const { W, H, sc, ctx } = env, p = env.cut.params, u = U(env), port = isPort(env);
    const ell = p.shape !== 'round';
    const t0 = env.cut.text.trim(), n0 = J.glyphCount(t0);
    const text = ell && n0 >= 5 && !port ? brk(t0, Math.max(3, Math.ceil(n0 / 2))) : brk(t0, port ? 6 : 10);
    const o = { track: 0.02, lead: 1.2 };
    const size = Math.min(J.fitSize(text, p.font, W * (port ? 0.62 : ell ? 0.5 : 0.6), H * 0.32, o), u * 0.15);
    const m = meas(text, p.font, size, o);
    const w = m.w * (ell ? 1.34 : 1) + size * (ell ? 1.1 : 1.2), h = m.h * (ell ? 1.3 : 1) + size * (ell ? 1.0 : 0.95);
    const cx = W / 2 + p.off * W, cy = H / 2 - size * 0.3;
    const fill = p.style === 'fill' || p.shape === 'thought';
    const plate = sc.ink;
    const tcol = fill ? onCol(sc, plate) : sc.fg;
    const q = E.outBack(J.clamp(env.lt / 0.32), 1.7) * (1 - E.inCubic(J.clamp(env.pOut * 1.2)));
    const sh = p.shape === 'thought' ? 'ellipse' : p.shape;
    const B = bubblePoly(sh, cx, cy, w, h, size, p.tail);
    const pivot = p.shape === 'thought' ? [cx, cy] : B.tip;
    ctx.save();
    ctx.translate(pivot[0], pivot[1]); ctx.rotate(p.tilt * J.DEG * (1 - q) * 3); ctx.scale(Math.max(0.001, q), Math.max(0.001, q)); ctx.translate(-pivot[0], -pivot[1]);
    if (q > 0.001) {
      if (p.shape === 'thought') {
        const M = 22, pts = [];
        for (let i = 0; i < M; i++) { const a = i / M * J.TAU, k = i % 2 ? 1.08 : 0.97; pts.push([cx + Math.cos(a) * w / 2 * k, cy + Math.sin(a) * h / 2 * k]); }
        env.blob(pts, plate, 1, false);
        const tx = cx + p.tail * w * 0.34, ty = cy + h / 2;
        [[0.45, 0.2], [0.85, 0.12], [1.15, 0.07]].forEach(([d, r]) => env.circle(tx + p.tail * size * d * 0.8, ty + size * d * 0.75, size * r * 1.4, plate, null, 0, 1, false));
      } else if (fill) env.poly(B.pts, plate, 1, false);
      else env.line(closeLoop(B.pts), sc.fg, Math.max(3, size * 0.05), 1, false);
    }
    const bb = J.mainDraw(env, { text, font: p.font, size, x: cx, y: cy + size * 0.02, track: 0.02, lead: 1.2, color: tcol });
    ctx.restore();
    // emphasis strokes at the top corner
    if (p.burst) {
      const a = J.clamp((env.lt - 0.2) / 0.2) * tout(env);
      if (a > 0) {
        const bx = cx - p.tail * (w / 2 + size * 0.05), by = cy - h / 2 - size * 0.05, L = size * 0.45 * E.outExpo(a);
        [-30, 0, 30].forEach((d, i) => { const ang = (-90 - p.tail * 45 + d * 0.9) * J.DEG, r0 = size * 0.25; env.line([[bx + Math.cos(ang) * r0, by + Math.sin(ang) * r0], [bx + Math.cos(ang) * (r0 + L * (i === 1 ? 1.2 : 0.9)), by + Math.sin(ang) * (r0 + L * (i === 1 ? 1.2 : 0.9))]], sc.accent, Math.max(3, size * 0.05), 1, false); });
      }
    }
    return bb || box(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2);
  },
});

/* ======================================================================
   12  subtitleBar — 字幕帯
   ====================================================================== */
reg('subtitleBar', {
  name: '字幕帯', tags: ['emotional', 'calm', 'editorial'], w: 0.9, fits: n => n <= 26, busy: true, treat: 'safe', portrait: 0.7,
  plan: (rng, cut, st) => ({ font: rng.pick(fontsOf(st, ['body', 'serif'])), bigFont: rng.pick(fontsOf(st, ['display', 'serif'])), big: rng.pick(['dim', 'outline']), bar: rng.range(0.1, 0.13), tc: rng.pick(['rec', 'scene']), place: rng.pick(['bar', 'band']), drift: rng.pick([1, -1]) }),
  render(env) {
    const { W, H, sc } = env, p = env.cut.params, u = U(env), port = isPort(env);
    const text = env.cut.text.trim(), lb = env.ltb;
    const cand = [sc.bg, sc.fg, sc.ink, sc.dim];
    let barC = cand[0]; cand.forEach(c => { if (J.lum(c) < J.lum(barC)) barC = c; });
    const pic = barC === sc.bg && Math.abs(J.lum(sc.dim) - J.lum(sc.bg)) > 0.03;   // dark scheme: lift the picture area instead
    const bh = H * (port ? p.bar * 0.62 : p.bar);
    const e = tin(env, 0, 0.55, E.outExpo) * (1 - E.inCubic(env.pOut));
    const out = tout(env);
    const hh0 = bh * e;
    if (pic && hh0 > 0.5) env.rect(-2, hh0, W + 4, H - hh0 * 2, sc.dim, J.clamp(e * 1.4), false);
    // huge faint copy behind
    const bt = flat(text);
    const bs = Math.min(J.fitSize(bt, p.bigFont, W * 0.94, H * 0.6), H * 0.6);
    const ba = tin(env, 0.05, 0.6, E.outCubic) * out;
    if (ba > 0.01) {
      const bx = W / 2 + (lb / Math.max(1, env.cut.dur) - 0.5) * W * 0.03 * p.drift;
      if (p.big === 'outline') env.draw({ text: bt, font: p.bigFont, size: bs, x: bx, y: H / 2, fill: false, stroke: Math.max(1.2, bs * 0.006), strokeColor: sc.sub, alpha: 0.4 * ba, ghost: false });
      else env.draw({ text: bt, font: p.bigFont, size: bs, x: bx, y: H / 2, color: pic ? sc.bg : sc.dim, alpha: ba * (pic ? 0.7 : 1), ghost: false });
    }
    // letterbox bars
    const hh = bh * e;
    if (hh > 0.5) {
      env.rect(-2, -2, W + 4, hh + 2, barC, 1, false);
      env.rect(-2, H - hh, W + 4, hh + 2, barC, 1, false);
      env.line([[0, hh], [W, hh]], sc.sub, 1.2, 0.35, false);
      env.line([[0, H - hh], [W, H - hh]], sc.sub, 1.2, 0.35, false);
    }
    // timecode in the top bar
    const ls = Math.min(smallSize(env) * 0.9, bh * 0.3);
    const ta = J.clamp((e - 0.6) * 2.5) * out;
    if (ta > 0) {
      const y = hh / 2;
      if (p.tc === 'rec') {
        if (env.step % 2 === 0) env.circle(W * 0.05, y, ls * 0.35, sc.accent, null, 0, ta, false);
        env.draw({ text: 'REC', font: monoF(env), size: ls, track: 0.12, align: 'left', x: W * 0.05 + ls * 0.8, y, color: onCol(sc, barC), alpha: ta, ghost: false });
      } else env.draw({ text: 'SCENE ' + lineNo(env) + '  /  CUT ' + pad2((env.cut.index | 0) + 1), font: monoF(env), size: ls, track: 0.12, align: 'left', x: W * 0.05, y, color: onCol(sc, barC), alpha: ta, ghost: false });
      env.draw({ text: J.fmtTime(env.t, 24), font: monoF(env), size: ls, track: 0.08, align: 'right', x: W * 0.95, y, color: sc.sub, alpha: ta, ghost: false });
    }
    // subtitle
    const o = { track: 0.06, lead: 1.25 };
    let t2 = text, ss;
    const maxH = p.place === 'bar' ? bh * 0.62 : bh * 0.8;
    ss = Math.min(J.fitSize(t2, p.font, W * 0.84, maxH, o), u * 0.058);
    if (ss < u * 0.04 && J.glyphCount(text) > 8) { t2 = brk(text, Math.ceil(J.glyphCount(text) / 2)); ss = Math.min(J.fitSize(t2, p.font, W * 0.84, maxH * 1.5, o), u * 0.05); }
    const m = meas(t2, p.font, ss, o);
    let sy, scol;
    if (p.place === 'bar') { sy = H - bh / 2; scol = onCol(sc, barC); }
    else {
      sy = H - bh - m.h / 2 - ss * 0.9;
      const pa = J.clamp((e - 0.3) * 2) * out;
      if (pa > 0) env.rect(W / 2 - m.w / 2 - ss * 0.8, sy - m.h / 2 - ss * 0.35, m.w + ss * 1.6, m.h + ss * 0.7, barC, 0.72 * pa, false);
      scol = onCol(sc, barC);
    }
    const bb = J.mainDraw(env, { text: t2, font: p.font, size: ss, x: W / 2, y: sy, track: 0.06, lead: 1.25, color: scol });
    return bb || box(W / 2 - m.w / 2, sy - m.h / 2, W / 2 + m.w / 2, sy + m.h / 2);
  },
});

/* ======================================================================
   13  ticker — ティッカー
   ====================================================================== */
reg('ticker', {
  name: 'ティッカー', tags: ['pop', 'glitch', 'graphic'], w: 0.9, enterBias: { wipe: 1.6, slice: 1.4, type: 1.2 }, fits: n => n <= 18,
  plan: (rng, cut, st) => ({ font: rng.pick(fontsOf(st, ['display'])), tag: rng.pick(['LIVE', 'NOW', 'ON AIR', 'LIVE']), speed: rng.range(0.8, 1.3), main: rng.pick(['center', 'left', 'center']), bug: rng.chance(0.6) }),
  render(env) {
    const { W, H, sc, ctx } = env, p = env.cut.params, u = U(env), port = isPort(env);
    const text0 = env.cut.text.trim();
    const bandH = u * 0.075, bandY = H - bandH - H * (port ? 0.12 : 0.085);
    const out = 1 - E.inCubic(env.pOut);
    const eB = tin(env, 0, 0.5, E.outExpo) * out;
    const tagC = sc.accent, bandC = sc.ink === sc.accent ? sc.fg : sc.ink;
    const ts = bandH * 0.42;
    const tagW = meas(p.tag, monoF(env), ts, { track: 0.12 }).w + ts * 2.6;
    const x0 = W * 0.04;
    // band + scrolling copy
    const bw = (W - x0) * eB;
    if (bw > 1) {
      env.rect(x0, bandY, bw, bandH, bandC, 1, false);
      if (env.pass === 'main') {
        const unit = flat(env.cut.lineText || text0) + '　◆　';
        const fs = bandH * 0.46;
        const per = rowW(unit, bodyF(env), fs);
        const reps = Math.min(40, Math.ceil(W * 1.2 / Math.max(1, per)) + 2);
        const off = ((env.ltb * p.speed * u * 0.22) % per + per) % per;
        ctx.save(); ctx.beginPath(); ctx.rect(x0 + tagW, bandY, Math.max(0, bw - tagW), bandH); ctx.clip();
        fastRow(env, unit.repeat(reps), bodyF(env), fs, x0 + tagW + ts * 0.8 - off, bandY + bandH / 2, 0, onCol(sc, bandC), 1);
        ctx.restore();
      }
    }
    // tag
    const tq = E.outBack(J.clamp((env.lt - 0.08) / 0.3), 1.6) * out;
    if (tq > 0.01) {
      const th = bandH * 1.0 * tq;
      env.rect(x0, bandY + bandH / 2 - th / 2 - bandH * 0.12 * tq, tagW, th + bandH * 0.24 * tq, tagC, 1, true);
      const tc = onCol(sc, tagC);
      if (env.step % 3 !== 0) env.circle(x0 + ts * 0.95, bandY + bandH / 2, ts * 0.28 * tq, tc, null, 0, 1, false);
      env.draw({ text: p.tag, font: monoF(env), size: ts * tq, track: 0.12, align: 'left', x: x0 + ts * 1.6, y: bandY + bandH / 2, color: tc, ghost: false });
    }
    // small time box above the band's right end
    const ca = J.clamp((eB - 0.7) * 3.3);
    if (ca > 0) {
      const tt = J.fmtTime(env.t), tsz = ts * 0.9, tw = meas(tt, monoF(env), tsz, { track: 0.08 }).w + tsz * 1.4;
      env.rect(W - W * 0.04 - tw, bandY - tsz * 1.7, tw, tsz * 1.7, sc.fg, ca, false);
      env.draw({ text: tt, font: monoF(env), size: tsz, track: 0.08, x: W - W * 0.04 - tw / 2, y: bandY - tsz * 0.85, color: onCol(sc, sc.fg), alpha: ca, ghost: false });
    }
    if (p.bug) {
      const a = tin(env, 0.2, 0.4, E.outCubic) * out, bs = smallSize(env) * 0.85;
      env.draw({ text: 'CH.' + lineNo(env), font: monoF(env), size: bs, track: 0.2, align: 'right', x: W * 0.95, y: H * 0.07, color: sc.sub, alpha: a, ghost: false });
      env.rect(W * 0.95 - bs * 0.3, H * 0.07 + bs * 0.9, bs * 0.3, bs * 0.3, sc.accent, a, false);
    }
    // headline
    const left = p.main === 'left';
    const text = brk(text0, port ? 6 : 11);
    const o = { track: 0.03, lead: 1.15 };
    const avail = bandY - H * 0.1;
    const size = Math.min(J.fitSize(text, p.font, W * 0.84, avail * 0.7, o), u * 0.2);
    const m = meas(text, p.font, size, o);
    const y = left ? bandY - bandH * 0.55 - m.h / 2 - size * 0.2 : H * 0.1 + avail / 2;
    const x = left ? x0 + size * 0.1 : W / 2;
    if (left) { const le = tin(env, 0.1, 0.5) * out; env.rect(x0, y - m.h / 2 - size * 0.28, Math.max(0, size * 1.2 * le), Math.max(3, size * 0.06), sc.accent, 1, false); }
    const bb = J.mainDraw(env, { text, font: p.font, size, x, y, align: left ? 'left' : 'center', track: 0.03, lead: 1.15, color: sc.fg });
    return bb || box(left ? x : x - m.w / 2, y - m.h / 2, left ? x + m.w : x + m.w / 2, y + m.h / 2);
  },
});

/* ======================================================================
   14  splitScreen — 二分割
   ====================================================================== */
reg('splitScreen', {
  name: '二分割', tags: ['graphic', 'pop', 'editorial'], w: 0.9, emph: 1.6, enterBias: { wipe: 1.5, slice: 1.4, stretch: 1.2 }, fits: n => n <= 14, busy: true, treat: false,
  plan: (rng, cut, st) => { const port = cut.H > cut.W * 1.08; return { font: rng.pick(fontsOf(st, ['display'])), split: port ? rng.pick(['h', 'diag', 'h']) : rng.pick(['v', 'diag', 'v', 'h']), plate: rng.pick(['fg', 'accent', 'fg']), side: rng.pick([1, -1]), tilt: rng.range(12, 22) }; },
  render(env) {
    const { W, H, sc, ctx } = env, p = env.cut.params, u = U(env), port = isPort(env);
    const tOff = J.contrast(sc.fg, sc.bg) > 2 ? sc.fg : onCol(sc, sc.bg);
    let plateC = p.plate === 'accent' ? sc.accent : sc.fg;
    if (onCol(sc, plateC) === tOff || J.contrast(plateC, sc.bg) < 1.6) plateC = sc.fg;     // keep the inversion readable
    const tOn = onCol(sc, plateC);
    const e = tin(env, 0, 0.5, E.outExpo) * (1 - E.inExpo(env.pOut));
    const sd = p.side;
    // plate polygon and its complement (animated: the boundary sweeps in from the plate's outer edge)
    let plate, other;
    if (p.split === 'h') {
      const by = H / 2 + sd * (1 - e) * H * 0.55;
      plate = sd > 0 ? [[-W, by], [2 * W, by], [2 * W, 2 * H], [-W, 2 * H]] : [[-W, -H], [2 * W, -H], [2 * W, by], [-W, by]];
      other = sd > 0 ? [[-W, -H], [2 * W, -H], [2 * W, by], [-W, by]] : [[-W, by], [2 * W, by], [2 * W, 2 * H], [-W, 2 * H]];
    } else {
      const dx = p.split === 'diag' ? Math.tan(p.tilt * J.DEG) * H / 2 : 0;
      const sh = sd * (1 - e) * (W * 0.55 + Math.abs(dx));
      const ta = [W / 2 + dx + sh, -H], tb = [W / 2 - dx * 3 + sh, 2 * H];
      const bx = (y) => W / 2 + dx - (2 * dx) * (y / H) + sh;
      const top = [bx(-H), -H], bot = [bx(2 * H), 2 * H];
      plate = sd > 0 ? [top, [3 * W, -H], [3 * W, 2 * H], bot] : [[-2 * W, -H], top, bot, [-2 * W, 2 * H]];
      other = sd > 0 ? [[-2 * W, -H], top, bot, [-2 * W, 2 * H]] : [top, [3 * W, -H], [3 * W, 2 * H], bot];
    }
    const clipTo = poly => { ctx.beginPath(); poly.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); ctx.clip(); };
    if (e > 0) env.poly(plate, plateC, 1, false);
    const text = brk(env.cut.text.trim(), port ? 5 : 10);
    const o = { track: 0.02, lead: 1.08 };
    const size = Math.min(J.fitSize(text, p.font, W * 0.86, H * (p.split === 'h' ? 0.36 : 0.42), o), u * 0.3);
    const m = meas(text, p.font, size, o);
    const cy = p.split === 'h' ? H / 2 + (m.h > size * 1.5 ? 0 : size * 0.04) : H / 2;
    const it = () => ({ text, font: p.font, size, x: W / 2, y: cy, track: 0.02, lead: 1.08 });
    // labels on each half
    const la = tin(env, 0.25, 0.4, E.outCubic) * tout(env), ls = smallSize(env) * 0.9;
    let bb;
    ctx.save(); clipTo(other);
    bb = J.mainDraw(env, Object.assign(it(), { color: tOff }));
    if (la > 0) env.draw({ text: 'No.' + lineNo(env), font: monoF(env), size: ls, track: 0.15, align: sd > 0 ? 'left' : 'right', x: sd > 0 ? W * 0.05 : W * 0.95, y: sd > 0 || p.split !== 'h' ? H * 0.07 : H * 0.93, color: sc.sub, alpha: la, ghost: false });
    ctx.restore();
    if (env.pass === 'main' && e > 0) {
      ctx.save(); clipTo(plate);
      const b2 = J.mainDraw(env, Object.assign(it(), { color: tOn }));
      bb = J.unionBB(bb, b2);
      if (la > 0) env.draw({ text: romajiOf(env) || J.fmtTime(env.cut.start), font: monoF(env), size: ls, track: 0.15, align: sd > 0 ? 'right' : 'left', x: sd > 0 ? W * 0.95 : W * 0.05, y: sd > 0 || p.split !== 'h' ? H * 0.93 : H * 0.07, color: tOn, alpha: la, ghost: false });
      ctx.restore();
    }
    return bb || box(W / 2 - m.w / 2, cy - m.h / 2, W / 2 + m.w / 2, cy + m.h / 2);
  },
});

/* ======================================================================
   15  mirror — 鏡像
   ====================================================================== */
reg('mirror', {
  name: '鏡像', tags: ['calm', 'emotional', 'graphic'], w: 1, fits: n => n <= 16,
  plan: (rng, cut, st) => ({ font: rng.pick(fontsOf(st, ['display', 'serif'])), strength: rng.range(0.34, 0.5), squash: rng.pick([1, 0.7, 0.85]), ripple: rng.chance(0.5), ticks: rng.chance(0.6) }),
  render(env) {
    const { W, H, sc, ctx } = env, p = env.cut.params, u = U(env), port = isPort(env);
    const text = brk(env.cut.text.trim(), port ? 6 : 12);
    const o = { track: 0.04, lead: 1.15 };
    const size = Math.min(J.fitSize(text, p.font, W * 0.84, H * 0.3, o), u * 0.22);
    const m = meas(text, p.font, size, o);
    const RH = m.h * p.squash + size * 0.1;
    const cy = H / 2 - RH * 0.42;
    const hz = cy + m.h / 2 + size * 0.08;
    const out = tout(env);
    // horizon
    const e = tin(env, 0, 0.7, E.inOutCubic) * out;
    if (e > 0) {
      const hw = W * 0.44 * e;
      env.line([[W / 2 - hw, hz], [W / 2 + hw, hz]], sc.sub, Math.max(1.2, u * 0.0016), 0.85, false);
      if (p.ticks) {
        for (let k = -8; k <= 8; k++) {
          const x = W / 2 + k * W * 0.05;
          if (Math.abs(x - W / 2) > hw) continue;
          env.line([[x, hz - u * 0.006], [x, hz + u * 0.006 * (k % 4 === 0 ? 2 : 1)]], sc.sub, 1.2, 0.6, false);
        }
      }
      env.circle(W / 2 - hw, hz, u * 0.005, sc.accent, null, 0, 1, false);
      env.circle(W / 2 + hw, hz, u * 0.005, sc.accent, null, 0, 1, false);
    }
    const base = { text, font: p.font, size, x: W / 2, y: cy, track: 0.04, lead: 1.15, color: sc.fg };
    // reflection: flipped copies in horizontal strips, fading with depth
    if (env.pass === 'main') {
      const K = 9;
      for (let k = 0; k < K; k++) {
        const y0 = hz + RH * k / K, y1 = hz + RH * (k + 1) / K;
        const a = p.strength * Math.pow(1 - (k + 0.5) / K, 1.5);
        const dx = p.ripple ? Math.sin(env.ltb * 2.4 + k * 0.9) * size * 0.035 * (k + 1) / K : 0;
        ctx.save(); ctx.beginPath(); ctx.rect(-W, y0, W * 3, y1 - y0 + 0.6); ctx.clip();
        ctx.translate(dx, hz); ctx.scale(1, -p.squash); ctx.translate(0, -hz);
        J.mainDraw(env, Object.assign({}, base, { alpha: a, ghost: false, mi: 0 }));
        ctx.restore();
      }
    }
    const bb = J.mainDraw(env, Object.assign({}, base, { mi: 0 }));
    return bb || box(W / 2 - m.w / 2, cy - m.h / 2, W / 2 + m.w / 2, cy + m.h / 2);
  },
});

/* ======================================================================
   16  sideways — 縦倒し
   ====================================================================== */
reg('sideways', {
  name: '縦倒し', tags: ['editorial', 'graphic', 'pop'], w: 1, emph: 1.3, enterBias: { wipe: 1.4, slice: 1.3, stretch: 1.3 }, fits: n => n >= 3 && n <= 16, portrait: 1.3,
  plan: (rng, cut, st) => ({ font: rng.pick(fontsOf(st, ['display', 'display', 'serif'])), side: rng.pick(['left', 'right']), copy: rng.pick(['stack', 'number']), rule: rng.chance(0.75) }),
  render(env) {
    const { W, H, sc, ctx } = env, p = env.cut.params, u = U(env), port = isPort(env);
    const t0 = env.cut.text.trim(), n = J.glyphCount(t0);
    const text = (port ? n > 12 : n > 6) ? brk(t0, Math.ceil(n / 2)) : t0;
    const o = { track: 0.02, lead: 1.02 };
    const L = H * 0.88, T = W * (port ? 0.4 : 0.3);
    const size = Math.min(J.fitSize(text, p.font, L, T, o), u * (port ? 0.34 : 0.3));
    const m = meas(text, p.font, size, o);
    const left = p.side === 'left';
    const mx = W * 0.05;
    const cx = left ? mx + m.h / 2 : W - mx - m.h / 2;
    const rot = left ? -90 : 90;
    const out = tout(env);
    // divider rule
    const rx = left ? cx + m.h / 2 + W * 0.035 : cx - m.h / 2 - W * 0.035;
    if (p.rule) {
      const e = tin(env, 0.05, 0.6, E.inOutCubic) * out;
      env.line([[rx, H * 0.06], [rx, H * 0.06 + H * 0.88 * e]], sc.accent, Math.max(2, u * 0.003), 1, false);
    }
    // horizontal copy block in the free area
    const ax0 = left ? rx + W * 0.04 : W * 0.07, ax1 = left ? W * 0.93 : rx - W * 0.04;
    const aw = ax1 - ax0;
    const ca = tin(env, 0.2, 0.45, E.outCubic) * out;
    if (ca > 0.01 && aw > u * 0.2) {
      const ls = smallSize(env);
      const copy = env.cut.lineText || env.cut.text;
      const cs = Math.min(u * 0.05, J.fitSize(brk(copy, Math.max(4, Math.floor(aw / (u * 0.05)))), bodyF(env), aw, H * 0.3, { lead: 1.5 }));
      const ct = brk(copy, Math.max(4, Math.floor(aw / (cs * 1.02))));
      const cm = meas(ct, bodyF(env), cs, { lead: 1.5 });
      const sl = (1 - ca) * u * 0.03;
      if (p.copy === 'number') {
        const ns = Math.min(aw * 0.5, H * 0.3);
        env.draw({ text: lineNo(env), font: p.font, size: ns, align: 'left', x: ax0 - ns * 0.04, y: H * 0.1 + ns * 0.45 + sl, fill: false, stroke: Math.max(1.5, ns * 0.012), strokeColor: sc.sub, alpha: ca, ghost: false });
      } else {
        env.draw({ text: 'No.' + lineNo(env), font: monoF(env), size: ls, track: 0.15, align: 'left', x: ax0, y: H * 0.1 + sl, color: sc.accent, alpha: ca, ghost: false });
        env.draw({ text: J.fmtTime(env.cut.start), font: monoF(env), size: ls, track: 0.15, align: 'left', x: ax0, y: H * 0.1 + ls * 1.6 + sl, color: sc.sub, alpha: ca, ghost: false });
      }
      const by = H * 0.9 - cm.h / 2;
      env.draw({ text: ct, font: bodyF(env), size: cs, lead: 1.5, align: 'left', x: ax0, y: by - sl, color: sc.fg, alpha: ca * 0.9, ghost: false });
      const rom = romajiOf(env);
      if (rom && rom !== copy) env.draw({ text: rom, font: monoF(env), size: ls * 0.85, track: 0.2, align: 'left', x: ax0, y: by - cm.h / 2 - ls * 1.4 - sl, color: sc.sub, alpha: ca, ghost: false });
    }
    ctx.save(); ctx.translate(cx, H / 2); ctx.rotate(rot * J.DEG);
    const bb = J.mainDraw(env, { text, font: p.font, size, x: 0, y: 0, track: 0.02, lead: 1.02, color: sc.fg });
    ctx.restore();
    const B = box(cx - m.h / 2, H / 2 - m.w / 2, cx + m.h / 2, H / 2 + m.w / 2);
    return bb ? B : null;
  },
});

/* ======================================================================
   17  edgeFrame — 外周
   ====================================================================== */
reg('edgeFrame', {
  name: '外周', tags: ['graphic', 'editorial', 'glitch'], w: 0.9, fits: n => n <= 16, busy: true,
  plan: (rng, cut, st) => ({ font: rng.pick(fontsOf(st, ['display', 'serif'])), edgeFont: rng.pick(['body', 'mono']), sep: rng.pick(['　／　', '　・　', '　—　']), speed: rng.range(0.6, 1.2) * rng.pick([1, -1]), corner: rng.pick(['square', 'cross']), inner: rng.chance(0.6) }),
  render(env) {
    const { W, H, sc, ctx } = env, p = env.cut.params, u = U(env), port = isPort(env);
    const d = u * 0.045, es = u * 0.024, band = es * 1.7;
    const out = tout(env);
    const ef = p.edgeFont === 'mono' ? monoF(env) : bodyF(env);
    const unit = flat(env.cut.lineText || env.cut.text) + p.sep;
    const per = Math.max(1, rowW(unit, ef, es) + [...unit].length * es * 0.08);
    const edges = [[d + band, d, W - 2 * d - 2 * band, 0], [W - d, d + band, H - 2 * d - 2 * band, 90], [W - d - band, H - d, W - 2 * d - 2 * band, 180], [d, H - d - band, H - 2 * d - 2 * band, 270]];
    if (env.pass === 'main') {
      edges.forEach(([x, y, len, ang], k) => {
        const e = tin(env, k * 0.07, 0.5, E.inOutCubic) * out;
        if (e <= 0.001) return;
        const reps = Math.min(60, Math.ceil(len / per) + 2);
        const off = ((env.ltb * p.speed * u * 0.07) % per + per) % per;
        ctx.save(); ctx.translate(x, y); ctx.rotate(ang * J.DEG);
        ctx.beginPath(); ctx.rect(0, -band / 2, len * e, band); ctx.clip();
        fastRow(env, unit.repeat(reps), ef, es, -per + off, 0, es * 0.08, sc.sub, 0.85);
        ctx.restore();
      });
    }
    // corner marks
    const cq = E.outBack(J.clamp((env.lt - 0.1) / 0.3), 2) * out;
    if (cq > 0) {
      [[d, d], [W - d, d], [W - d, H - d], [d, H - d]].forEach(([x, y]) => {
        if (p.corner === 'square') { const q = es * 0.55 * cq; env.rect(x - q / 2, y - q / 2, q, q, sc.accent, 1, false); }
        else { const q = es * 0.6 * cq, lw = Math.max(1.5, es * 0.08); env.line([[x - q, y], [x + q, y]], sc.accent, lw, 1, false); env.line([[x, y - q], [x, y + q]], sc.accent, lw, 1, false); }
      });
    }
    if (p.inner) {
      const e = tin(env, 0.15, 0.8, E.inOutCubic) * out, g = d + band * 0.95;
      env.polyPartial([[g, g], [W - g, g], [W - g, H - g], [g, H - g], [g, g]], e, sc.sub, 1.2, 0.45, false);
    }
    const text = brk(env.cut.text.trim(), port ? 6 : 11);
    const o = { track: 0.04, lead: 1.15 };
    const size = Math.min(J.fitSize(text, p.font, W * 0.72, H * 0.5, o), u * 0.22);
    const bb = J.mainDraw(env, { text, font: p.font, size, x: W / 2, y: H / 2, track: 0.04, lead: 1.15, color: sc.fg });
    return bb || J.centerBB(env, null);
  },
});

/* ======================================================================
   18  perspective — 奥行き
   ====================================================================== */
reg('perspective', {
  name: '奥行き', tags: ['graphic', 'emotional', 'glitch'], w: 0.9, emph: 1.3, enterBias: { zoom: 1.6, stretch: 1.3 }, fits: n => n <= 14,
  plan: (rng, cut, st) => ({ font: rng.pick(fontsOf(st, ['display'])), mode: rng.pick(['floor', 'side', 'floor']), copies: rng.int(4, 6), speed: rng.range(0.25, 0.45), guides: rng.chance(0.7), vx: rng.pick([1, -1]) }),
  render(env) {
    const { W, H, sc } = env, p = env.cut.params, u = U(env), port = isPort(env);
    const text = brk(env.cut.text.trim(), port ? 6 : 12);
    const o = { track: 0.03, lead: 1.1 };
    const side = p.mode === 'side';
    const size = Math.min(J.fitSize(text, p.font, W * (side ? 0.7 : 0.84), H * 0.22, o), u * 0.18);
    const m = meas(text, p.font, size, o);
    const x0 = side ? W / 2 - p.vx * W * 0.12 : W / 2, y0 = H * 0.74 - m.h / 2 + size * 0.5;
    const V = side ? [W / 2 + p.vx * W * 0.36, H * 0.12] : [W / 2, H * 0.1];
    const out = tout(env);
    const K = p.copies;
    const ph = (env.ltb * p.speed) % 1;
    const D = Math.hypot(x0 - V[0], y0 - V[1]) * (Math.abs(y0 - V[1]) / Math.max(1, Math.hypot(x0 - V[0], y0 - V[1])));
    const sy0 = side ? 1 : 0.8;
    const X = 2 * D / (m.h * sy0 * 1.35);
    const r = J.clamp((X - 1) / (X + 1), 0.45, 0.8);
    const at = z => { const k = Math.pow(r, z); return { k, x: V[0] + (x0 - V[0]) * k, y: V[1] + (y0 - V[1]) * k }; };
    // perspective rails from the front copy to the vanishing point
    if (p.guides) {
      const e = tin(env, 0, 0.8, E.inOutCubic) * out;
      if (e > 0) {
        const hw = m.w / 2 + size * 0.3, yb = y0 + m.h / 2 + size * 0.12;
        [[x0 - hw, yb], [x0 + hw, yb]].forEach(q => env.polyPartial([q, V], e, sc.sub, 1.2, 0.4, false));
        env.circle(V[0], V[1], u * 0.005, sc.accent, null, 0, e, false);
      }
    }
    // receding copies (drift slowly back into the distance)
    const ca = tin(env, 0.05, 0.4, E.outCubic) * out;
    for (let j = K; j >= 1; j--) {
      const z = j + ph;
      const q = at(z);
      const a = ca * J.clamp((z - 1) / 0.6) * J.clamp((K + 1 - z) / 1.2) * (0.8 - 0.45 * (z / (K + 1)));
      if (a <= 0.01) continue;
      const sk = side ? -p.vx * 14 * (1 - q.k) : 0;
      env.draw({ text, font: p.font, size: size * q.k, sy: side ? 1 : 0.8, skew: sk, x: q.x, y: q.y, track: 0.03, lead: 1.1, color: sc.sub, alpha: a, ghost: false });
    }
    const bb = J.mainDraw(env, { text, font: p.font, size, x: x0, y: y0, track: 0.03, lead: 1.1, color: sc.fg });
    return bb || box(x0 - m.w / 2, y0 - m.h / 2, x0 + m.w / 2, y0 + m.h / 2);
  },
});

/* ======================================================================
   19  hanko — 落款
   ====================================================================== */
function sealGlyphs(text) {
  const g = [...strip(text)].filter(c => !J.isPunct(c) && !J.isSmallKana(c));
  const kan = g.filter(c => J.isKanji(c));
  if (kan.length >= 2 || (kan.length === 1 && g.length > 4)) return kan.slice(0, 4);
  if (g.length <= 4) return g.length ? g : [...strip(text)].slice(0, 1);
  return g.slice(0, 2);
}
reg('hanko', {
  name: '落款', tags: ['calm', 'emotional', 'editorial'], w: 0.8, emph: 1.3, enterBias: { blur: 1.6, wipe: 1.3, type: 1.2 }, fits: n => n >= 1 && n <= 10, portrait: 1.2,
  plan: (rng, cut, st) => ({ font: rng.pick(fontsOf(st, ['serif'])), sealFont: rng.pick(fontsOf(st, ['serif', 'display'])), vert: cut.H > cut.W * 1.08 ? true : rng.chance(0.6), seal: rng.pick(['haku', 'shu', 'haku']), rot: rng.range(-7, 7) }),
  render(env) {
    const { W, H, sc, ctx } = env, p = env.cut.params, u = U(env), port = isPort(env);
    const text = strip(env.cut.text);
    const n = J.glyphCount(text);
    const out = tout(env);
    let size, bbox, sx, sy, S, it;
    if (p.vert) {
      const cols = n > (port ? 8 : 6) ? 2 : 1;
      const vt = cols > 1 ? brk(text, Math.ceil(n / 2)) : text;
      const per = Math.max(...vt.split('\n').map(l => J.glyphCount(l)));
      size = Math.min(H * 0.7 / Math.max(per, 2.5), u * 0.2, W * 0.3 / cols);
      S = size * (n <= 2 ? 1.35 : 1.5);
      const lead = 1.35, bw = size * (1 + (cols - 1) * lead);
      const colH = per * size;
      const x = W / 2 + S * 0.45 + (cols - 1) * size * lead / 2, top = H / 2 - colH / 2 - S * 0.25;
      it = { text: vt, font: p.font, size, x, y: top, vertical: true, align: 'left', lead, color: sc.fg };
      bbox = box(x - bw / 2, top, x + bw / 2, top + colH);
      const lastLen = J.glyphCount(vt.split('\n').pop());
      sx = x - bw / 2 - S * 0.72; sy = Math.max(top + lastLen * size, top + S * 0.5) + S * 0.1;
    } else {
      size = Math.min(J.fitSize(text, p.font, W * 0.6, H * 0.3), u * 0.17);
      S = size * 1.7;
      const m = meas(text, p.font, size);
      const x = W / 2 - S * 0.5, y = H / 2;
      it = { text, font: p.font, size, x, y, color: sc.fg };
      bbox = box(x - m.w / 2, y - m.h / 2, x + m.w / 2, y + m.h / 2);
      sx = x + m.w / 2 + S * 0.75; sy = y + size * 0.3;
    }
    const bb = J.mainDraw(env, it);
    // the seal thumps in after the lyric has landed
    const t0 = env.cut.inDur * 0.7 + 0.08, x = (env.lt - t0) / 0.2;
    if (x > 0 && out > 0) {
      const sc2 = J.lerp(1.55, 1, E.outBack(J.clamp(x), 1.4));
      const a = J.clamp(x * 3) * out;
      const shake = x > 1 && x < 1.8 ? J.rs(env.step, 91) * S * 0.015 * (1.8 - x) : 0;
      ctx.save(); ctx.translate(sx + shake, sy); ctx.rotate(p.rot * J.DEG); ctx.scale(sc2, sc2);
      const pts = [], M = 11, seed = env.cut.seed | 0;
      const jit = (i, k) => J.rs(seed, i, k, 3) * S * 0.014;
      for (let i = 0; i < M; i++) pts.push([-S / 2 + S * i / M, -S / 2 + jit(i, 1)]);
      for (let i = 0; i < M; i++) pts.push([S / 2 + jit(i, 2), -S / 2 + S * i / M]);
      for (let i = 0; i < M; i++) pts.push([S / 2 - S * i / M, S / 2 + jit(i, 3)]);
      for (let i = 0; i < M; i++) pts.push([-S / 2 + jit(i, 4), S / 2 - S * i / M]);
      const G = sealGlyphs(text), gn = G.length;
      const cols = gn >= 3 ? 2 : 1, rows = Math.ceil(gn / cols);
      const inner = S * (p.seal === 'haku' ? 0.8 : 0.72);
      const cw = inner / cols, chh = inner / rows;
      const gs = Math.min(cw, chh) * 0.92, gsx = J.clamp(cw / chh, 0.8, 1.7);
      const gcol = p.seal === 'haku' ? sc.bg : sc.accent;
      if (p.seal === 'haku') env.poly(pts, sc.accent, a, true);
      else { env.line(closeLoop(pts), sc.accent, S * 0.07, a, true); }
      G.forEach((ch, i) => {
        const col = cols - 1 - Math.floor(i / rows), row = i % rows;   // right column first, top to bottom
        const gx = -inner / 2 + cw * (col + 0.5), gy = -inner / 2 + chh * (row + 0.5);
        env.draw({ text: ch, font: p.sealFont, size: gs, sx: gs * gsx > cw ? cw / gs : gsx, x: gx, y: gy, color: gcol, alpha: a, ghost: false });
      });
      if (p.seal === 'haku') {
        for (let i = 0; i < 12; i++) env.circle(J.rs(seed, i, 5) * S * 0.46, J.rs(seed, i, 6) * S * 0.46, S * J.rr(0.004, 0.012, seed, i, 7), sc.bg, null, 0, a * 0.9, false);
      }
      ctx.restore();
    }
    return bb ? bbox : null;
  },
});

/* ======================================================================
   20  genkou — 原稿用紙
   ====================================================================== */
reg('genkou', {
  name: '原稿用紙', tags: ['calm', 'editorial', 'emotional'], w: 0.8, enterBias: { type: 2.2, blur: 1.4, assemble: 1.3 }, fits: n => n <= 22, portrait: 1.2,
  plan: (rng, cut, st) => ({ font: rng.pick(fontsOf(st, ['serif'])), lineC: rng.pick(['accent', 'sub']), indent: rng.chance(0.5), pad: rng.int(2, 4) }),
  render(env) {
    const { W, H, sc } = env, p = env.cut.params, u = U(env), port = isPort(env);
    const chars = [...strip(env.cut.text)], n = chars.length;
    const ind = p.indent ? 1 : 0;
    const maxR = port ? 14 : 10;
    const used = Math.ceil((n + ind) / maxR);
    const R = Math.max(7, Math.ceil((n + ind) / used) + (used === 1 && n + ind < maxR ? 1 : 0));
    const gapK = 0.3;
    const cell = Math.min(H * 0.78 / R, W * 0.9 / ((used + 2) * (1 + gapK)));
    const colW = cell * (1 + gapK);
    const C = Math.max(used + 2, Math.min(Math.floor(W * 0.92 / colW), used + p.pad * 2));
    const gw = C * colW - cell * gapK, gh = R * cell;
    const gx0 = W / 2 - gw / 2, gy0 = H / 2 - gh / 2;
    const cStart = Math.floor((C - used) / 2);                    // column index counted from the right
    const colX = c => gx0 + gw - cell - c * colW;                 // left edge of column c (from the right)
    const lc = p.lineC === 'accent' ? sc.accent : sc.sub;
    const out = tout(env);
    const lw = Math.max(1.5, cell * 0.02);
    for (let c = 0; c < C; c++) {
      const e = tin(env, c * 0.035, 0.45, E.inOutCubic) * out;
      if (e <= 0) continue;
      const x = colX(c), dist = Math.abs(c - (cStart + (used - 1) / 2)) / Math.max(1, C / 2);
      const a = 0.85 * (1 - dist * 0.6);
      env.line([[x, gy0], [x, gy0 + gh * e]], lc, lw, a, false);
      env.line([[x + cell, gy0], [x + cell, gy0 + gh * e]], lc, lw, a, false);
      for (let r = 0; r <= R; r++) { const y = gy0 + r * cell; if (y > gy0 + gh * e + 0.5) break; env.line([[x, y], [x + cell, y]], lc, lw, a * (r === 0 || r === R ? 1 : 0.8), false); }
    }
    const fa = tin(env, 0.3, 0.4, E.outCubic) * out;
    if (fa > 0) {
      const fs = Math.max(11, cell * 0.14);
      env.draw({ text: '(' + R + '×' + C + ')', font: monoF(env), size: fs, align: 'left', x: gx0, y: gy0 + gh + fs * 1.4, color: lc, alpha: fa * 0.8, ghost: false });
      env.draw({ text: 'No.' + lineNo(env), font: monoF(env), size: fs, align: 'right', x: gx0 + gw, y: gy0 + gh + fs * 1.4, color: lc, alpha: fa * 0.8, ghost: false });
    }
    let bb = null;
    chars.forEach((ch, i) => {
      const k = i + ind, c = cStart + Math.floor(k / R), r = k % R;
      let x = colX(c) + cell / 2, y = gy0 + (r + 0.5) * cell, rot = 0;
      if (J.isSmallKana(ch)) { x += cell * 0.1; y -= cell * 0.1; }
      if ('、。，．'.includes(ch)) { x += cell * 0.28; y -= cell * 0.28; }
      if (J.VERT_ROTATE.includes(ch) || J.isLatin(ch)) rot = 90;
      bb = J.unionBB(bb, J.mainDraw(env, { text: ch, font: p.font, size: cell * 0.8, x, y, rot, color: sc.fg, mi: i }));
    });
    return bb || box(colX(cStart + used - 1), gy0, colX(cStart) + cell, gy0 + gh);
  },
});

/* ======================================================================
   21  panels — コマ割り
   ====================================================================== */
function clipHalf(poly, nx, ny, c) {            // keep the part with nx*x + ny*y <= c
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const da = nx * a[0] + ny * a[1] - c, db = nx * b[0] + ny * b[1] - c;
    if (da <= 0) out.push(a);
    if ((da <= 0) !== (db <= 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}
const pathOf = (ctx, poly) => { ctx.beginPath(); poly.forEach((q, i) => (i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.closePath(); };
reg('panels', {
  name: 'コマ割り', tags: ['pop', 'graphic', 'emotional'], w: 0.9, emph: 1.4, enterBias: { pop: 1.4, zoom: 1.3, slice: 1.2 }, fits: n => n >= 2 && n <= 18, busy: true, treat: 'safe',
  plan: (rng, cut, st) => { const k = cut.n >= 6 ? 3 : 2; return { chunks: splitK(cut.text, k, 2), font: rng.pick(fontsOf(st, ['display', 'serif'])), acc: rng.int(0, 2), fx: rng.pick(['focus', 'tone', 'focus', 'none']), slant: rng.range(5, 11), widths: [rng.range(0.8, 1.25), rng.range(0.8, 1.25), rng.range(0.8, 1.25)] }; },
  render(env) {
    const { W, H, sc, ctx } = env, p = env.cut.params, u = U(env), port = isPort(env);
    let ch = p.chunks && p.chunks.length ? p.chunks : splitK(env.cut.text, 2, 2);
    const k = ch.length;
    const m = u * 0.05, g = u * 0.028, lw = Math.max(3, u * 0.0065);
    const out = tout(env);
    // panel boundaries along the reading axis (landscape: right→left columns, portrait: top→bottom rows)
    const L = port ? H - 2 * m : W - 2 * m, cross = port ? W - 2 * m : H - 2 * m;
    const ws = ch.map((c, i) => Math.sqrt(J.glyphCount(c) + 2) * (p.widths[i % 3] || 1));
    const tot = ws.reduce((a, b) => a + b, 0);
    const sl = Math.min(Math.tan(p.slant * J.DEG) * cross / 2, L / k * 0.18);
    const bounds = [0]; let acc = 0; ws.forEach(w => { acc += w; bounds.push(acc / tot * L); });
    const polys = [];
    for (let i = 0; i < k; i++) {
      const a = bounds[i], b = bounds[i + 1];
      const sa = i === 0 ? 0 : sl * (i % 2 ? 1 : -1), sb = i === k - 1 ? 0 : sl * ((i + 1) % 2 ? 1 : -1);
      const a0 = a + (i === 0 ? 0 : g / 2), b0 = b - (i === k - 1 ? 0 : g / 2);
      // in reading-axis coordinates: (t, c) with c in [0, cross]
      const q = [[a0 + sa, 0], [b0 + sb, 0], [b0 - sb, cross], [a0 - sa, cross]];
      const poly = q.map(([t, c]) => (port ? [m + c, m + t] : [W - m - t, m + c]));
      poly.along = Math.min((b0 + sb) - (a0 + sa), (b0 - sb) - (a0 - sa));
      polys.push(poly);
    }
    const stag = Math.max(0.01, env.cut.stagger || 0.04);
    let bb = null;
    polys.forEach((poly, i) => {
      const d = 0.06 + i * 0.16, e = E.inOutCubic(J.clamp((env.lt - d) / 0.3));
      if (e <= 0) return;
      // wipe along the reading direction
      let rev = poly;
      if (e < 1) {
        const xs = poly.map(q => (port ? q[1] : -q[0])), lo = Math.min(...xs), hi = Math.max(...xs);
        rev = clipHalf(poly, port ? 0 : -1, port ? 1 : 0, lo + (hi - lo) * e);
      }
      if (rev.length < 3) return;
      const accent = i === p.acc % k;
      const cx = poly.reduce((a, q) => a + q[0], 0) / 4, cy = poly.reduce((a, q) => a + q[1], 0) / 4;
      const pw = port ? cross : poly.along, ph = port ? poly.along : cross;
      const iw = pw * 0.8, ih = ph * 0.8;
      const vert = ih > iw * 1.25 && !hasLatin(ch[i]);
      const c0 = vert ? strip(ch[i]) : ch[i], cn = J.glyphCount(c0);
      let txt = c0, size = J.fitSize(c0, p.font, Math.max(10, iw), Math.max(10, ih), { vertical: vert, lead: 1.15 });
      if (cn >= 4) { const t2 = brk(c0, Math.ceil(cn / 2)), s2 = J.fitSize(t2, p.font, Math.max(10, iw), Math.max(10, ih), { vertical: vert, lead: 1.15 }); if (s2 > size * 1.15) { txt = t2; size = s2; } }
      size = Math.min(size, u * 0.24);
      if (accent) env.poly(rev, sc.ink, out, false);
      if (env.pass === 'main' && out > 0) {
        ctx.save(); pathOf(ctx, rev); ctx.clip();
        if (accent && p.fx === 'focus') {
          const R0 = Math.hypot(pw, ph), rin = size * (vert ? 0.9 : 0.75) + Math.max(0, (vert ? J.glyphCount(txt) * size : meas(txt, p.font, size).w) * 0.35);
          for (let j = 0; j < 48; j++) {
            const ang = (j / 48 + J.r(env.cut.seed, j, 61) * 0.01) * J.TAU, r1 = rin * (1 + J.r(env.cut.seed, j, 62) * 0.5);
            env.line([[cx + Math.cos(ang) * R0, cy + Math.sin(ang) * R0], [cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1]], onCol(sc, sc.ink), 1 + J.r(env.cut.seed, j, 63) * 2.5, 0.22 * out, false);
          }
        }
        if (!accent && p.fx === 'tone' && i === (p.acc + 1) % k) {
          ctx.globalAlpha = 0.3 * out; ctx.fillStyle = J.textPattern(ctx, 'dots', sc.sub, null, u * 0.12, env.scale || 1); pathOf(ctx, rev); ctx.fill(); ctx.globalAlpha = 1;
        }
        ctx.restore();
      }
      env.line(closeLoop(rev), sc.fg, lw, out, false);
      ctx.save(); pathOf(ctx, rev); ctx.clip();
      const it = vert ? { text: txt, font: p.font, size, x: cx, y: cy, vertical: true, color: accent ? onCol(sc, sc.ink) : sc.fg, mi: (d + 0.08) / stag }
        : { text: txt, font: p.font, size, x: cx, y: cy, lead: 1.15, color: accent ? onCol(sc, sc.ink) : sc.fg, mi: (d + 0.08) / stag };
      bb = J.unionBB(bb, J.mainDraw(env, it));
      ctx.restore();
    });
    return bb || box(m, m, W - m, H - m);
  },
});

/* ======================================================================
   22  filmstrip — フィルム
   ====================================================================== */
reg('filmstrip', {
  name: 'フィルム', tags: ['emotional', 'calm', 'graphic'], w: 0.8, fits: n => n >= 1 && n <= 18, busy: true, treat: 'safe', portrait: 0.8,
  plan: (rng, cut, st) => ({ chunks: splitK(cut.text, Math.min(3, cut.n), cut.n <= 4 ? 3 : 2), font: rng.pick(fontsOf(st, ['display', 'serif'])), dir: rng.pick([1, -1]), tone: rng.pick(['ink', 'fg']), codes: rng.chance(0.75), tilt: rng.pick([0, 0, -3, 3]) }),
  render(env) {
    const { W, H, sc, ctx } = env, p = env.cut.params, u = U(env), port = isPort(env);
    let ch = p.chunks && p.chunks.length ? p.chunks.slice(0, 3) : [env.cut.text];
    const slots = ch.length === 3 ? ch : ch.length === 2 ? [ch[0], ch[1], null] : [null, ch[0], null];
    const v = port;                                          // vertical strip in portrait
    const A = v ? H : W, Bd = v ? W : H;                      // along / across
    const fw0 = Math.min(A * 0.88 / 3.2, Bd * 0.62 * 1.3);    // frame length along the strip
    const fh = fw0 / 1.3, band = fh / 0.72, gap = fw0 * 0.08, pitch = fw0 + gap;
    const stripC = p.tone === 'fg' ? sc.fg : sc.ink;
    const tcol = onCol(sc, sc.bg) === sc.bg ? sc.fg : onCol(sc, sc.bg);
    const eIn = tin(env, 0, 0.6, E.outExpo), eOut = E.inExpo(env.pOut);
    const off = (1 - eIn) * A * 0.9 * p.dir - eOut * A * 1.4 * p.dir + (env.ltb - env.cut.dur / 2) * u * 0.03 * p.dir;
    const fa = 1 - J.smooth(0.55, 1, env.pOut);
    const P2 = (a, b) => (v ? [W / 2 + b, a] : [a, H / 2 + b]);   // (along, across) → screen
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(p.tilt * J.DEG); ctx.translate(-W / 2, -H / 2);
    // band
    const bandLen = A * 1.6, c0 = A / 2 + off;
    if (v) env.rect(W / 2 - band / 2, c0 - bandLen / 2, band, bandLen, stripC, fa, false);
    else env.rect(c0 - bandLen / 2, H / 2 - band / 2, bandLen, band, stripC, fa, false);
    // sprocket holes
    const hp = band * 0.11, hw = hp * 0.55, hh = hp * 0.72, hm = (band - fh) / 4;
    const nH = Math.min(120, Math.ceil(bandLen / hp));
    for (let i = 0; i < nH; i++) {
      const a = c0 - bandLen / 2 + (i + 0.5) * hp;
      if (a < -hp || a > A + hp) continue;
      [-1, 1].forEach(sd => {
        const q = P2(a, sd * (band / 2 - hm));
        if (v) env.rrect(q[0] - hh / 2, q[1] - hw / 2, hh, hw, hw * 0.25, sc.bg, fa, false);
        else env.rrect(q[0] - hw / 2, q[1] - hh / 2, hw, hh, hw * 0.25, sc.bg, fa, false);
      });
    }
    // edge codes
    if (p.codes) {
      const cs = Math.max(10, hm * 0.9), ca = J.clamp(eIn * 2 - 1) * fa;
      for (let i = -2; i <= 2; i++) {
        const a = c0 + i * pitch - pitch / 2;
        const q = P2(a, (band / 2 - hm * 2.2) * (v ? 1 : -1));
        env.draw({ text: '▸' + (12 + i + (env.cut.index | 0)) + (i % 2 ? 'A' : ''), font: monoF(env), size: cs, x: q[0], y: q[1], rot: v ? 90 : 0, color: sc.accent, alpha: ca * 0.9, ghost: false });
      }
    }
    // frames (one type size for the whole strip)
    const stag = Math.max(0.01, env.cut.stagger || 0.04);
    const fwX0 = v ? fh : fw0, fhY0 = v ? fw0 : fh;
    const fsz = Math.min(u * 0.2, ...slots.filter(Boolean).map(t => J.fitSize(brk(t, v ? 6 : 4), p.font, fwX0 * 0.8, fhY0 * 0.7, { lead: 1.1 })));
    let bb = null;
    slots.forEach((t, i) => {
      const a = c0 + (i - 1) * pitch;
      const q = P2(a, 0), fx0 = v ? q[0] - fh / 2 : q[0] - fw0 / 2, fy0 = v ? q[1] - fw0 / 2 : q[1] - fh / 2, fwX = v ? fh : fw0, fhY = v ? fw0 : fh;
      env.rrect(fx0, fy0, fwX, fhY, fh * 0.04, sc.bg, fa, false);
      ctx.save(); ctx.beginPath(); ctx.rect(fx0, fy0, fwX, fhY); ctx.clip();
      if (t) {
        const tt = brk(t, v ? 6 : 4), size = fsz;
        bb = J.unionBB(bb, J.mainDraw(env, { text: tt, font: p.font, size, x: q[0], y: q[1], lead: 1.1, color: tcol, mi: 0.15 * i / stag }));
      } else {
        const r = Math.min(fwX, fhY) * 0.3, la = J.clamp(eIn * 2 - 1) * fa;
        env.circle(q[0], q[1], r, null, sc.sub, 1.5, 0.5 * la, false);
        env.line([[q[0] - r * 1.4, q[1]], [q[0] + r * 1.4, q[1]]], sc.sub, 1.2, 0.4 * la, false);
        env.line([[q[0], q[1] - r * 1.4], [q[0], q[1] + r * 1.4]], sc.sub, 1.2, 0.4 * la, false);
        env.draw({ text: String(i === 0 ? 3 : 1), font: p.font, size: r * 1.1, x: q[0], y: q[1], color: sc.sub, alpha: 0.6 * la, ghost: false });
      }
      ctx.restore();
    });
    ctx.restore();
    return bb || box(W / 2 - (v ? fh : fw0 * 1.6) / 2, H / 2 - (v ? fw0 * 1.6 : fh) / 2, W / 2 + (v ? fh : fw0 * 1.6) / 2, H / 2 + (v ? fw0 * 1.6 : fh) / 2);
  },
});

/* ======================================================================
   23  quote — 引用
   ====================================================================== */
reg('quote', {
  name: '引用', tags: ['editorial', 'emotional', 'calm'], w: 1, emph: 1.2, enterBias: { blur: 1.4, type: 1.3, wipe: 1.2 }, fits: n => n <= 20,
  plan: (rng, cut, st) => ({ font: rng.pick(fontsOf(st, ['serif', 'display'])), markFont: rng.pick(fontsOf(st, ['serif'])), marks: /[A-Za-z]/.test(cut.text) ? 'latin' : rng.pick(['kagi', 'double', 'kagi']), markC: rng.pick(['accent', 'sub']), attrib: rng.chance(0.75) }),
  render(env) {
    const { W, H, sc } = env, p = env.cut.params, u = U(env), port = isPort(env);
    const text = brk(env.cut.text.trim(), port ? 6 : 11);
    const o = { track: 0.04, lead: 1.25 };
    const size = Math.min(J.fitSize(text, p.font, W * (port ? 0.58 : 0.62), H * 0.4, o), u * 0.16);
    const m = meas(text, p.font, size, o);
    const cy = H / 2 - (p.attrib ? size * 0.25 : 0);
    const bx0 = W / 2 - m.w / 2, bx1 = W / 2 + m.w / 2, by0 = cy - m.h / 2, by1 = cy + m.h / 2;
    const out = tout(env);
    const e = E.outExpo(J.clamp((env.lt - 0.02) / 0.5)) * (1 - E.inCubic(env.pOut));
    const mc = p.markC === 'accent' ? sc.accent : sc.sub;
    const latin = p.marks === 'latin';
    const [o1, c1] = latin ? ['\u201C', '\u201D'] : p.marks === 'double' ? ['\u300E', '\u300F'] : ['\u300C', '\u300D'];
    const ia = inkBox(p.markFont, o1), ib = inkBox(p.markFont, c1);
    const gap = size * 0.2, inkW = Math.max(0.05, ia.r - ia.l, ib.r - ib.l);
    const ms = Math.min(Math.max(size * (latin ? 3.2 : 4), m.h * 1.8), u * 0.5, (W * 0.94 - m.w - gap * 2) / (2 * inkW));
    const far = u * 0.35 * (1 - e);
    if (e > 0.001) {
      const al = J.clamp(e * 1.5);
      const ax = bx0 - gap - ia.r * ms - far, ay = by0 - size * 0.1 - ia.t * ms - far * 0.6;
      const bxx = bx1 + gap - ib.l * ms + far, byy = (latin ? by1 - size * 0.95 - ib.t * ms : by1 + size * 0.1 - ib.b * ms) + far * 0.6;
      env.draw({ text: o1, font: p.markFont, size: ms, x: ax, y: ay, color: mc, alpha: al, ghost: false });
      env.draw({ text: c1, font: p.markFont, size: ms, x: bxx, y: byy, color: mc, alpha: al, ghost: false });
    }
    if (p.attrib) {
      const a = tin(env, 0.35, 0.4, E.outCubic) * out, ls = smallSize(env);
      const at = '— ' + (romajiOf(env) || 'No.' + lineNo(env));
      const aw = Math.min(W * 0.4, meas(at, bodyF(env), ls, { track: 0.12 }).w);
      env.line([[W / 2 - aw / 2 - ls * 2, by1 + size * 0.95], [W / 2 - aw / 2 - ls * 0.8, by1 + size * 0.95]], mc, 1.5, a, false);
      env.draw({ text: at.slice(2), font: bodyF(env), size: ls, track: 0.12, x: W / 2, y: by1 + size * 0.95, color: sc.sub, alpha: a, ghost: false });
    }
    const bb = J.mainDraw(env, { text, font: p.font, size, x: W / 2, y: cy, track: 0.04, lead: 1.25, color: sc.fg });
    return bb || box(bx0, by0, bx1, by1);
  },
});

/* ======================================================================
   24  ruler — 寸法線
   ====================================================================== */
function arrowHead(env, x, y, ang, s, col, a) {
  const c = Math.cos(ang), sn = Math.sin(ang);
  env.poly([[x, y], [x - c * s + sn * s * 0.35, y - sn * s - c * s * 0.35], [x - c * s - sn * s * 0.35, y - sn * s + c * s * 0.35]], col, a, false);
}
reg('ruler', {
  name: '寸法線', tags: ['graphic', 'editorial', 'glitch'], w: 0.8, fits: n => n <= 16,
  plan: (rng, cut, st) => ({ font: rng.pick(fontsOf(st, ['display', 'serif', 'body'])), dims: rng.pick(['topRight', 'bottomLeft']), ticks: rng.chance(0.7), guides: rng.chance(0.8), unit: rng.pick(['px', 'pt', 'px']) }),
  render(env) {
    const { W, H, sc } = env, p = env.cut.params, u = U(env), port = isPort(env);
    const text = brk(env.cut.text.trim(), port ? 6 : 12);
    const o = { track: 0.04, lead: 1.15 };
    const size = Math.min(J.fitSize(text, p.font, W * 0.66, H * 0.34, o), u * 0.19);
    const m = meas(text, p.font, size, o);
    const cx = W / 2, cy = H / 2;
    const x0 = cx - m.w / 2, x1 = cx + m.w / 2, y0 = cy - m.h / 2, y1 = cy + m.h / 2;
    const out = tout(env);
    const e = tin(env, 0.08, 0.75, E.inOutCubic) * out;
    const lw = Math.max(1.2, u * 0.0016), ls = smallSize(env) * 0.9, ah = ls * 0.7;
    const top = p.dims === 'topRight';
    if (e > 0) {
      if (p.guides) {
        const gx = W * 0.47 * e, gy = H * 0.47 * e;
        dash(env, x0, cy - gy, x0, cy + gy, 8, 8, sc.sub, 1, 0.35);
        dash(env, x1, cy - gy, x1, cy + gy, 8, 8, sc.sub, 1, 0.35);
        dash(env, cx - gx, y0, cx + gx, y0, 8, 8, sc.sub, 1, 0.35);
        dash(env, cx - gx, y1, cx + gx, y1, 8, 8, sc.sub, 1, 0.35);
      }
      // horizontal dimension
      const dy = top ? y0 - size * 0.55 : y1 + size * 0.55, ext = top ? -1 : 1;
      const hx = m.w / 2 * e;
      env.line([[x0, top ? y0 - size * 0.08 : y1 + size * 0.08], [x0, dy + ext * ls * 0.6]], sc.sub, lw, 0.8, false);
      env.line([[x1, top ? y0 - size * 0.08 : y1 + size * 0.08], [x1, dy + ext * ls * 0.6]], sc.sub, lw, 0.8, false);
      env.line([[cx - hx, dy], [cx + hx, dy]], sc.sub, lw, 1, false);
      arrowHead(env, cx - hx, dy, Math.PI, ah, sc.sub, 1); arrowHead(env, cx + hx, dy, 0, ah, sc.sub, 1);
      const wv = Math.round(m.w * e);
      env.draw({ text: wv + ' ' + p.unit, font: monoF(env), size: ls, track: 0.08, x: cx, y: dy + ext * ls * 0.95, color: sc.accent, alpha: J.clamp(e * 2 - 0.3), ghost: false });
      // vertical dimension
      const dx = top ? x1 + size * 0.5 : x0 - size * 0.5, ex = top ? 1 : -1;
      const vy = m.h / 2 * e;
      env.line([[top ? x1 + size * 0.08 : x0 - size * 0.08, y0], [dx + ex * ls * 0.6, y0]], sc.sub, lw, 0.8, false);
      env.line([[top ? x1 + size * 0.08 : x0 - size * 0.08, y1], [dx + ex * ls * 0.6, y1]], sc.sub, lw, 0.8, false);
      env.line([[dx, cy - vy], [dx, cy + vy]], sc.sub, lw, 1, false);
      arrowHead(env, dx, cy - vy, -Math.PI / 2, ah, sc.sub, 1); arrowHead(env, dx, cy + vy, Math.PI / 2, ah, sc.sub, 1);
      env.draw({ text: Math.round(m.h * e) + ' ' + p.unit, font: monoF(env), size: ls, track: 0.08, x: dx + ex * ls * 1.1, y: cy, rot: top ? 90 : -90, color: sc.accent, alpha: J.clamp(e * 2 - 0.3), ghost: false });
      // glyph ticks + count
      if (p.ticks) {
        const ty = top ? y1 + size * 0.28 : y0 - size * 0.28, sg = top ? 1 : -1;
        const lay = m.lay, a = J.clamp(e * 1.6 - 0.4), li = top ? lay[lay.length - 1].li : 0;
        const gl = [...lay].filter(g => g.li === li && g.ch !== ' ');
        if (gl.length) {
          const lx0 = cx + Math.min(...gl.map(g => g.x - g.w / 2)), lx1 = cx + Math.max(...gl.map(g => g.x + g.w / 2));
          env.line([[lx0, ty], [lx0 + (lx1 - lx0) * e, ty]], sc.sub, lw, 0.7 * a, false);
          gl.forEach(g => { const gx = cx + g.x - g.w / 2; if (gx <= lx0 + (lx1 - lx0) * e + 0.5) env.line([[gx, ty], [gx, ty + sg * ls * 0.5]], sc.sub, lw, a, false); });
          env.line([[lx1, ty], [lx1, ty + sg * ls * 0.5]], sc.sub, lw, a, false);
          env.draw({ text: 'n=' + J.glyphCount(env.cut.text), font: monoF(env), size: ls, track: 0.08, align: top ? 'left' : 'right', x: top ? lx0 : lx1, y: ty + sg * ls * 1.4, color: sc.sub, alpha: a, ghost: false });
        }
      }
    }
    const bb = J.mainDraw(env, { text, font: p.font, size, x: cx, y: cy, track: 0.04, lead: 1.15, color: sc.fg });
    return bb || box(x0, y0, x1, y1);
  },
});

/* ======================================================================
   25  searchBar — 検索窓
   ====================================================================== */
function magnifier(env, x, y, r, col, lw, a) {
  env.circle(x - r * 0.15, y - r * 0.15, r * 0.62, null, col, lw, a, false);
  env.line([[x + r * 0.3, y + r * 0.3], [x + r * 0.8, y + r * 0.8]], col, lw * 1.2, a, false);
}
reg('searchBar', {
  name: '検索窓', tags: ['pop', 'graphic'], w: 0.6, enterBias: { type: 3, scramble: 1.5, cut: 1.5 }, fits: n => n <= 18, treat: 'safe', portrait: 0.8,
  plan: (rng, cut, st) => ({ font: rng.pick(fontsOf(st, ['body', 'display'])), shape: rng.pick(['pill', 'rect']), fill: rng.pick(['outline', 'filled']), sugg: rng.int(3, 4), pos: rng.pick(['center', 'upper']) }),
  render(env) {
    const { W, H, sc } = env, p = env.cut.params, u = U(env), port = isPort(env);
    const text = env.cut.text.trim();
    const bw = W * (port ? 0.9 : 0.7);
    const ts = Math.min(J.fitSize(text, p.font, bw - u * 0.22, u * 0.11, { track: 0.02 }), u * 0.095);
    const bh = ts * 2.1, r = p.shape === 'pill' ? bh / 2 : bh * 0.16;
    const by = H * (p.pos === 'upper' ? 0.28 : 0.38);
    const out = tout(env);
    const e = tin(env, 0, 0.45, E.outExpo) * out;
    const filled = p.fill === 'filled';
    const plate = sc.ink, tc = filled ? onCol(sc, plate) : sc.fg;
    const w = bw * (0.3 + 0.7 * e);
    const bx0 = W / 2 - w / 2;
    if (e > 0) {
      if (filled) env.rrect(bx0, by - bh / 2, w, bh, r, plate, e, false);
      else env.rrect(bx0, by - bh / 2, w, bh, r, null, e, false, sc.fg, Math.max(2, ts * 0.05));
      magnifier(env, bx0 + bh * 0.5, by, ts * 0.55, tc, Math.max(2, ts * 0.06), e);
      const xr = bx0 + w - bh * 0.45, q = ts * 0.2;
      env.line([[xr - q, by - q], [xr + q, by + q]], tc, Math.max(1.5, ts * 0.04), 0.6 * e, false);
      env.line([[xr - q, by + q], [xr + q, by - q]], tc, Math.max(1.5, ts * 0.04), 0.6 * e, false);
    }
    const tx = W / 2 - bw / 2 + bh * 0.95;
    const bb = J.mainDraw(env, { text, font: p.font, size: ts, x: tx, y: by, align: 'left', track: 0.02, color: tc, enter: env.cut.enter === 'cut' ? 'type' : undefined });
    // caret after typing
    const typed = env.cut.enter === 'cut' || env.cut.enter === 'type' ? env.cut.inDur + 0.05 : env.cut.inDur;
    if (env.lt > typed && out > 0.5 && env.step % 2 === 0) {
      const tw = meas(text, p.font, ts, { track: 0.02 }).w;
      env.rect(tx + tw + ts * 0.12, by - ts * 0.55, Math.max(2, ts * 0.06), ts * 1.1, sc.accent, 1, false);
    }
    // suggestions
    const rom = hasLatin(text) ? null : J.romaji(strip(text));
    const rows = [text + ' lyrics', env.cut.lineText && strip(env.cut.lineText) !== strip(text) ? env.cut.lineText : text + ' meaning', rom ? rom.toLowerCase() : text + ' mv', text + ' cover'].slice(0, p.sugg);
    const rs = ts * 0.52, rh = rs * 2.4, py = by + bh / 2 + rs * 0.8;
    const t0 = Math.max(0.3, typed);
    const pa = tin(env, t0, 0.3, E.outCubic) * out;
    if (pa > 0) {
      const ph = rows.length * rh + rs * 0.6;
      env.rrect(W / 2 - bw / 2, py, bw, ph * pa, bh * 0.16, filled ? plate : null, 0.9 * pa, false, filled ? null : sc.sub, 1.2);
      rows.forEach((rt, i) => {
        const a = J.clamp((env.lt - t0 - 0.05 - i * 0.07) / 0.2) * out;
        if (a <= 0 || (i + 1) * rh > ph * pa) return;
        const y = py + rs * 0.3 + (i + 0.5) * rh;
        magnifier(env, W / 2 - bw / 2 + bh * 0.5, y, rs * 0.7, filled ? onCol(sc, plate) : sc.sub, 1.5, a * 0.7);
        const xt = W / 2 - bw / 2 + bh * 0.95;
        const pre = rt.startsWith(text) ? text : '', rest = rt.slice(pre.length);
        const pw = pre ? meas(pre, p.font, rs, { track: 0.02 }).w : 0;
        if (pre) env.draw({ text: pre, font: p.font, size: rs, track: 0.02, align: 'left', x: xt, y, color: filled ? onCol(sc, plate) : sc.fg, alpha: a, ghost: false });
        env.draw({ text: rest, font: bodyF(env), size: rs, track: 0.02, align: 'left', x: xt + pw, y, color: filled ? onCol(sc, plate) : sc.sub, alpha: a * (filled ? 0.65 : 1), ghost: false });
      });
    }
    return bb || box(W / 2 - bw / 2, by - bh / 2, W / 2 + bw / 2, by + bh / 2);
  },
});

/* ======================================================================
   26  chat — チャット
   ====================================================================== */
reg('chat', {
  name: 'チャット', tags: ['pop', 'emotional'], w: 0.6, enterBias: { pop: 2, cut: 1.5, type: 1.3 }, fits: n => n <= 22, treat: 'safe',
  plan: (rng, cut, st) => { const nw = (J.chunkText ? J.chunkText(cut.text) : [cut.text]).length; return { msgs: cut.n <= 4 ? [cut.text.trim()] : splitK(cut.text, J.clamp(nw, 2, cut.n > 12 ? 4 : 3)), font: rng.pick(fontsOf(st, ['body', 'display'])), side0: rng.pick([1, -1]), alt: rng.chance(0.55) }; },
  render(env) {
    const { W, H, sc, ctx } = env, p = env.cut.params, u = U(env), port = isPort(env);
    const msgs = p.msgs && p.msgs.length ? p.msgs : [env.cut.text.trim()];
    const colW = W * (port ? 0.86 : W / H < 1.5 ? 0.66 : 0.52), maxW = colW * 0.8;
    const sentC = sc.accent, recvC = sc.ink !== sc.accent ? sc.ink : sc.sub;
    const list = [];
    if (msgs.length === 1) list.push({ typing: true, side: -p.side0 });
    msgs.forEach((t, i) => list.push({ t, side: p.alt ? (i % 2 ? -p.side0 : p.side0) : p.side0 }));
    const nL = list.length;
    // size so the whole stack fits
    let fs = Math.min(u * 0.088, H * 0.62 / (nL * 2.2));
    const longest = Math.max(1, ...list.map(q => (q.typing ? 1 : J.glyphCount(q.t))));
    fs = Math.max(Math.min(fs, (maxW - fs * 1.4) / (longest * 1.02)), fs * 0.62);   // prefer single-line messages
    const lines = list.map(q => (q.typing ? '' : brk(q.t, Math.max(3, Math.floor(maxW / (fs * 1.02))))));
    lines.forEach(l => { if (l) fs = Math.min(fs, J.fitSize(l, p.font, maxW - fs * 1.4, H * 0.3, { lead: 1.25 })); });
    const pad = fs * 0.62, sp = fs * 0.45;
    const dims = list.map((q, i) => { if (q.typing) return [fs * 3, fs * 1.9]; const m = meas(lines[i], p.font, fs, { lead: 1.25 }); return [m.w + pad * 2, m.h + pad * 1.45]; });
    const gap = Math.min(0.3, Math.max(0.12, env.cut.dur * 0.45 / nL));
    const tAt = i => (list[0].typing ? (i === 0 ? 0 : 0.35 + (i - 1) * gap) : i * gap);
    const stag = Math.max(0.01, env.cut.stagger || 0.04);
    const bottom = H * (port ? 0.78 : 0.8);
    const out = tout(env);
    let bb = null;
    // y of each bubble: pushed up by every later bubble that has appeared
    const lift = list.map((q, i) => { let y = 0; for (let j = i + 1; j < nL; j++) y += (dims[j][1] + sp) * E.outExpo(J.clamp((env.lt - tAt(j)) / 0.28)); return y; });
    list.forEach((q, i) => {
      const lt = env.lt - tAt(i);
      if (lt < 0) return;
      const pop = E.outBack(J.clamp(lt / 0.25), 1.6) * out;
      const [bw, bh] = dims[i];
      const right = q.side > 0;
      const x0 = right ? W / 2 + colW / 2 - bw : W / 2 - colW / 2;
      const y1 = bottom - lift[i], y0 = y1 - bh;
      const col = right ? sentC : recvC, tc = onCol(sc, col);
      const px = right ? x0 + bw : x0, py = y1;
      ctx.save(); ctx.translate(px, py); ctx.scale(Math.max(0.001, pop), Math.max(0.001, pop)); ctx.translate(-px, -py);
      env.rrect(x0, y0, bw, bh, Math.min(bh / 2, fs * 0.9), col, 1, false);
      env.poly(right ? [[x0 + bw - fs * 0.5, y1 - fs * 0.3], [x0 + bw + fs * 0.28, y1 + fs * 0.05], [x0 + bw - fs * 0.1, y1 - fs * 0.8]] : [[x0 + fs * 0.5, y1 - fs * 0.3], [x0 - fs * 0.28, y1 + fs * 0.05], [x0 + fs * 0.1, y1 - fs * 0.8]], col, 1, false);
      if (q.typing) {
        for (let k = 0; k < 3; k++) { const ph = Math.sin(env.ltb * 9 - k * 0.9) * 0.5 + 0.5; env.circle(x0 + bw / 2 + (k - 1) * fs * 0.62, y0 + bh / 2 - ph * fs * 0.12, fs * 0.16, tc, null, 0, 0.45 + ph * 0.5, false); }
      } else {
        bb = J.unionBB(bb, J.mainDraw(env, { text: lines[i], font: p.font, size: fs, lead: 1.25, x: x0 + bw / 2, y: y0 + bh / 2, color: tc, mi: tAt(i) / stag }));
      }
      ctx.restore();
      if (i === nL - 1 && pop > 0.9) {
        const ms = Math.max(11, fs * 0.36);
        env.draw({ text: (right ? 'Read ' : '') + J.fmtTime(env.cut.start).slice(0, 5), font: monoF(env), size: ms, align: right ? 'right' : 'left', x: right ? x0 + bw : x0, y: y1 + ms * 1.4, color: sc.sub, alpha: out, ghost: false });
      }
    });
    return bb || box(W / 2 - colW / 2, bottom - H * 0.3, W / 2 + colW / 2, bottom);
  },
});

/* ======================================================================
   27  notification — 通知
   ====================================================================== */
function noteIcon(env, x, y, s, col, a) {
  env.circle(x - s * 0.18, y + s * 0.2, s * 0.17, col, null, 0, a, false);
  env.rect(x - s * 0.03, y - s * 0.32, s * 0.07, s * 0.52, col, a, false);
  env.poly([[x + s * 0.04, y - s * 0.32], [x + s * 0.3, y - s * 0.18], [x + s * 0.04, y - s * 0.12]], col, a, false);
}
reg('notification', {
  name: '通知', tags: ['pop', 'emotional', 'calm'], w: 0.5, enterBias: { cut: 1.6, type: 1.3, blur: 1.2 }, fits: n => n <= 24, treat: 'safe',
  plan: (rng, cut, st) => ({ font: rng.pick(fontsOf(st, ['body', 'display'])), pos: rng.pick(['banner', 'lock', 'center']), stack: rng.chance(0.5), app: rng.pick(['MUSIC', 'LYRICS', 'MESSAGE']) }),
  render(env) {
    const { W, H, sc, ctx } = env, p = env.cut.params, u = U(env), port = isPort(env);
    const text = env.cut.text.trim();
    const cw = W * (port ? 0.9 : W / H < 1.5 ? 0.66 : 0.54), pd = cw * 0.05;
    const hs = Math.max(12, cw * 0.032);
    const plate = sc.ink, tc = onCol(sc, plate);
    let mt = text, ms = Math.min(J.fitSize(mt, p.font, cw - pd * 2, u * 0.11, { track: 0.02 }), u * 0.095);
    if (ms < u * 0.07 && J.glyphCount(text) > 5) { mt = brk(text, Math.ceil(J.glyphCount(text) / 2)); ms = Math.min(J.fitSize(mt, p.font, cw - pd * 2, u * 0.2, { track: 0.02, lead: 1.3 }), u * 0.085); }
    const mm = meas(mt, p.font, ms, { track: 0.02, lead: 1.3 });
    const headH = hs * 2.2, titleH = hs * 1.9;
    const ch = pd + headH + titleH + mm.h + pd * 1.1;
    const out = tout(env);
    // lock-screen clock
    const clockY = H * (port ? 0.2 : 0.22);
    if (p.pos === 'lock') {
      const a = tin(env, 0, 0.5, E.outCubic) * out;
      const hh = pad2(Math.floor(env.cut.start / 60) % 24 || 12), mi2 = pad2(Math.floor(env.cut.start) % 60);
      const cs = Math.min(u * 0.2, H * 0.2);
      env.draw({ text: hh + ':' + mi2, font: fontsOf(env.st, ['display'])[0], size: cs, x: W / 2, y: clockY, track: 0.02, color: sc.sub, alpha: a * 0.8, ghost: false });
      env.draw({ text: 'LINE ' + lineNo(env) + '  ·  ' + J.fmtTime(env.cut.start), font: monoF(env), size: hs, track: 0.2, x: W / 2, y: clockY - cs * 0.62, color: sc.sub, alpha: a * 0.8, ghost: false });
    }
    const target = p.pos === 'banner' ? H * 0.06 : p.pos === 'lock' ? clockY + Math.min(u * 0.2, H * 0.2) * 0.75 : H / 2 - ch / 2;
    const eIn = E.outBack(J.clamp(env.lt / 0.45), 1.1), eOut = E.inCubic(env.pOut);
    const y0 = target - (1 - eIn) * (target + ch + 30) - eOut * (target + ch + 30);
    const x0 = W / 2 - cw / 2;
    if (p.stack) {
      const sw = cw * 0.92;
      env.rrect(W / 2 - sw / 2, y0 + ch - pd * 0.4, sw, pd * 1.4, pd * 0.7, plate, 0.45, false);
    }
    env.rrect(x0, y0, cw, ch, pd * 0.9, plate, 0.96, false);
    // header: icon, app, time
    const iy = y0 + pd + headH / 2 - hs * 0.2, isz = hs * 1.7;
    env.rrect(x0 + pd, iy - isz / 2, isz, isz, isz * 0.24, sc.accent, 1, false);
    noteIcon(env, x0 + pd + isz / 2, iy, isz * 0.8, onCol(sc, sc.accent), 1);
    env.draw({ text: p.app, font: monoF(env), size: hs, track: 0.15, align: 'left', x: x0 + pd + isz + hs * 0.7, y: iy, color: tc, alpha: 0.6, ghost: false });
    env.draw({ text: 'now', font: monoF(env), size: hs, track: 0.1, align: 'right', x: x0 + cw - pd, y: iy, color: tc, alpha: 0.5, ghost: false });
    const ty = y0 + pd + headH + titleH / 2;
    env.draw({ text: romajiOf(env) || 'No.' + lineNo(env), font: bodyF(env), size: hs * 1.15, track: 0.06, align: 'left', x: x0 + pd, y: ty, color: tc, alpha: 0.9, ghost: false });
    const my = ty + titleH / 2 + mm.h / 2;
    const bb = J.mainDraw(env, { text: mt, font: p.font, size: ms, x: x0 + pd, y: my, align: 'left', track: 0.02, lead: 1.3, color: tc });
    return bb || box(x0 + pd, my - mm.h / 2, x0 + pd + mm.w, my + mm.h / 2);
  },
});

/* ======================================================================
   28  ticket — チケット
   ====================================================================== */
function ticketParts(x0, y0, w, h, px, nr, r) {
  const seg = 6, x1 = x0 + w, y1 = y0 + h;
  const arc = (cx, cy, rr, a0, a1) => { const o = []; for (let i = 0; i <= seg; i++) { const a = (a0 + (a1 - a0) * i / seg) * J.DEG; o.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); } return o; };
  const main = [...arc(x0 + r, y0 + r, r, 180, 270), [px - nr, y0], ...arc(px, y0, nr, 180, 90), [px, y1 - nr], ...arc(px, y1, nr, 270, 180), ...arc(x0 + r, y1 - r, r, 90, 180)];
  const stub = [[px + nr, y0], ...arc(x1 - r, y0 + r, r, 270, 360), ...arc(x1 - r, y1 - r, r, 0, 90), [px + nr, y1], ...arc(px, y1, nr, 360, 270), [px, y0 + nr], ...arc(px, y0, nr, 90, 0)];
  return { main, stub };
}
reg('ticket', {
  name: 'チケット', tags: ['pop', 'graphic', 'editorial'], w: 0.6, fits: n => n <= 18, treat: 'safe', portrait: 0.6,
  plan: (rng, cut, st) => ({ font: rng.pick(fontsOf(st, ['display', 'serif'])), fill: rng.pick(['accent', 'ink', 'outline']), tilt: rng.range(-5, 5), label: rng.pick(['ADMIT ONE', 'LIVE', 'TICKET']), serial: rng.int(1, 999999) }),
  render(env) {
    const { W, H, sc, ctx } = env, p = env.cut.params, u = U(env), port = isPort(env);
    const tw = Math.min(W * (port ? 0.9 : 0.74), H * 1.9), th = Math.min(tw * (port ? 0.46 : 0.38), H * 0.5);
    const stubW = tw * 0.22, px0 = -tw / 2 + tw - stubW;
    const nr = th * 0.075, r = th * 0.05;
    const outline = p.fill === 'outline';
    const plate = p.fill === 'accent' ? sc.accent : sc.ink;
    const tc = outline ? sc.fg : onCol(sc, plate), lc = outline ? sc.sub : tc;
    const eIn = E.outBack(J.clamp(env.lt / 0.5), 1.2), eOut = E.inCubic(env.pOut);
    const cx = W / 2, cy = H / 2 + (1 - eIn) * H * 0.7;
    const rot = p.tilt * (1 - eOut * 0.5) + (1 - eIn) * 10;
    const T = ticketParts(-tw / 2, -th / 2, tw, th, px0, nr, r);
    const a = J.clamp(eIn * 3) * (1 - eOut);
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot * J.DEG);
    // stub tears away on exit
    const tear = eOut;
    ctx.save(); ctx.translate(tear * tw * 0.12, tear * th * 0.2); ctx.rotate(tear * 12 * J.DEG);
    if (outline) env.line(closeLoop(T.stub), sc.fg, Math.max(2, th * 0.012), a, false); else env.poly(T.stub, plate, a, false);
    const ls = Math.max(11, th * 0.07), sx = px0 + stubW / 2;
    env.draw({ text: p.label, font: monoF(env), size: ls, track: 0.25, x: sx - stubW * 0.22, y: 0, rot: -90, color: tc, alpha: a, ghost: false });
    env.draw({ text: 'No.' + String(p.serial).padStart(6, '0'), font: monoF(env), size: ls * 0.8, track: 0.12, x: sx + stubW * 0.02, y: 0, rot: -90, color: lc, alpha: a * 0.8, ghost: false });
    const bx = sx + stubW * 0.26, bh2 = th * 0.7;
    for (let i = 0, y = -bh2 / 2; i < 40 && y < bh2 / 2; i++) { const hgt = th * (0.006 + 0.014 * J.r(p.serial, i, 3)); env.rect(bx - stubW * 0.08, y, stubW * 0.16, hgt, tc, a * 0.85, false); y += hgt + th * (0.006 + 0.01 * J.r(p.serial, i, 4)); }
    ctx.restore();
    if (outline) env.line(closeLoop(T.main), sc.fg, Math.max(2, th * 0.012), a, false); else env.poly(T.main, plate, a, false);
    // perforation
    for (let y = -th / 2 + nr * 1.6; y < th / 2 - nr * 1.6; y += th * 0.05) env.rect(px0 - 1, y, 2.5, th * 0.025, lc, a * 0.7, false);
    // header / footer furniture
    const mx0 = -tw / 2 + th * 0.12, mx1 = px0 - th * 0.12;
    env.draw({ text: p.label + '  ·  No.' + lineNo(env), font: monoF(env), size: ls, track: 0.2, align: 'left', x: mx0, y: -th / 2 + th * 0.14, color: lc, alpha: a, ghost: false });
    env.line([[mx0, -th / 2 + th * 0.24], [mx1, -th / 2 + th * 0.24]], lc, 1.2, a * 0.6, false);
    env.line([[mx0, th / 2 - th * 0.24], [mx1, th / 2 - th * 0.24]], lc, 1.2, a * 0.6, false);
    env.draw({ text: 'GATE ' + String.fromCharCode(65 + (p.serial % 6)) + '   ROW ' + pad2(1 + p.serial % 30) + '   SEAT ' + pad2(1 + (p.serial >> 3) % 40), font: monoF(env), size: ls * 0.9, track: 0.15, align: 'left', x: mx0, y: th / 2 - th * 0.14, color: lc, alpha: a, ghost: false });
    env.draw({ text: J.fmtTime(env.cut.start), font: monoF(env), size: ls * 0.9, track: 0.1, align: 'right', x: mx1, y: th / 2 - th * 0.14, color: lc, alpha: a, ghost: false });
    // title = lyric
    const t0 = env.cut.text.trim(), n = J.glyphCount(t0);
    const text = brk(t0, port ? 6 : 9);
    const aw = mx1 - mx0, ah = th * 0.44;
    const size = Math.min(J.fitSize(text, p.font, aw, ah, { track: 0.03, lead: 1.1 }), th * 0.3);
    const bb = J.mainDraw(env, { text, font: p.font, size, x: mx0, y: 0, align: 'left', track: 0.03, lead: 1.1, color: tc });
    ctx.restore();
    return bb ? box(cx - tw / 2, cy - th / 2, cx + tw / 2, cy + th / 2) : null;
  },
});

})();

/* JIZURA pack: layoutsB — kinetic / typographic layouts (rain, hanging, orbit, tunnel, word cloud, mechanical reveals …) */
(() => {
'use strict';
const E = J.E;
const P = 'layoutsB';

/* ------------------------------------------------------------------ helpers */
const clean = t => String(t || '').replace(/\s+/g, '');
/* glyph slots keeping single word gaps (latin lyrics): a ' ' slot is left empty */
const slotsOf = t => [...String(t || '').trim().replace(/[\s\u3000]+/g, ' ')];
/* reading in capitals — only for kana text (latin would just be echoed back) */
const romaOf = t => { const c = clean(t); if (!/[\u3041-\u30ff]/.test(c)) return null; const r = J.romaji(c); return r ? r.toUpperCase() : null; };
/* J.splitLines, but never leave a line of punctuation only */
const splitL = (t, per) => {
  const ls = J.splitLines(t, per).split('\n');
  const out = [];
  for (const l of ls) { if (out.length && [...l].every(c => J.isPunct(c) || c === ' ')) out[out.length - 1] += l; else out.push(l); }
  return out.join('\n');
};
const fontsOf = (st, roles) => J.fontsOf(st, roles);
const monoF = env => (env.st.fonts.mono && env.st.fonts.mono[0]) || 'mono';
const inE = (env, d = 0.35, delay = 0) => E.outExpo(J.clamp((env.lt - delay) / d));
const outK = env => 1 - E.inCubic(env.pOut);
/* chromatic ghosts on big plates only while they fly in (never trailing into the next cut) */
const gIn = env => env.lt < 0.6 && env.pOut <= 0;
/* text that sits in its own key / cell / plate only takes holds that keep it in place */
const plateHold = env => !['still', 'jitter', 'breathe', 'glitchtick'].includes(env.cut.hold);
const bbRect = (x0, y0, x1, y1) => ({ x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, boxes: [] });
const U = J.unionBB;
/* motion index that makes J.mainDraw start this item's entrance at local time t */
const miAt = (env, t) => Math.max(0, t) / Math.max(0.005, env.cut.stagger || 0.04);
/* best-contrast scheme colour for text sitting on a plate of colour `fill` */
const _onc = new Map();
const onCol = (sc, fill) => {
  const key = fill + sc.bg + sc.fg + sc.ink + sc.accent;
  let v = _onc.get(key);
  if (v) return v;
  let best = null, bv = 0;
  for (const c of [sc.bg, sc.fg, sc.ink, sc.accent, sc.sub]) { if (!c || c === fill) continue; const k = J.contrast(c, fill); if (k > bv) { bv = k; best = c; } }
  v = bv >= 2.4 ? best : (J.lum(fill) > 0.5 ? '#111111' : '#FFFFFF');
  if (_onc.size > 200) _onc.clear();
  _onc.set(key, v); return v;
};
/* a colour from the scheme that reads against the background (for plates / bars) */
const plateCol = (sc, pref) => {
  for (const c of pref) if (c && J.contrast(c, sc.bg) >= 1.6) return c;
  return sc.fg;
};
/* glyph centres of a laid-out text item (design space, before rotation) */
const glyphPts = (it) => {
  const lay = J.layoutText(it), sx = it.sx || 1, sy = it.sy || 1, out = [];
  for (const g of lay) { if (g.ch === ' ' || g.ch === '　') continue; out.push({ ch: g.ch, x: it.x + g.x * sx, y: it.y + g.y * sy, w: g.w * sx, h: g.h * sy, li: g.li, ci: g.ci, i: out.length }); }
  return out;
};
/* draw a string of glyphs each placed by fn(i) -> {x, y, rot, s, a, color} | null  (one item, main pass only) */
const pathText = (env, chars, font, size, fn, extra) => {
  if (!chars.length || size < 1) return;
  const it = Object.assign({ text: chars.join(''), font, size, x: 0, y: 0, ghost: false }, extra || {});
  it._lay = J.layoutText(it);
  it.charFn = (i, g) => { const r = fn(i, g); if (!r) return { hide: true }; return { dx: r.x - g.x, dy: r.y - g.y, rot: r.rot || 0, s: r.s ?? 1, a: r.a ?? 1, color: r.color }; };
  env.draw(it);
};
/* main-text lines for a width budget: portrait → short lines */
const mainLines = (text, W, H, perL = 11, perP = 5) => {
  const t = String(text || '').trim(), n = J.glyphCount(t);
  const per = W < H ? perP : perL;
  if (n <= per) return t;
  return splitL(t, Math.ceil(n / Math.ceil(n / per)));
};
const _pool = new Map();
const poolOf = (cut) => {
  const key = J.lang + '|' + cut.lineText + '|' + cut.text;
  let p = _pool.get(key);
  if (!p) {
    const own = [...clean((cut.lineText || '') + cut.text)].filter(c => !J.isLatin(c) && !J.isPunct(c) && c !== '・');
    p = own.concat([...J.pool('kana')].filter((c, i) => i % 2 === 0));
    if (_pool.size > 100) _pool.clear();
    _pool.set(key, p);
  }
  return p;
};
/* rounded-rect path on ctx (no draw) */
const rrPath = (ctx, x, y, w, h, r) => {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
};

/* ================================================================== 1 rain — 文字の雨 */
J.register('layout', 'rain', {
  name: '文字の雨', tags: ['glitch', 'graphic', 'emotional'], w: 0.9, busy: true, fits: n => n >= 1 && n <= 16,
  enterBias: { cut: 2.4, flicker: 1.4, scramble: 1.4, blur: 1.1, type: 0.3, wipe: 0.4, slice: 0.4, stretch: 0.5, assemble: 0.5 },
  plan(rng, cut, st) {
    const port = cut.H > cut.W;
    const monos = (st.fonts.mono || []).filter(k => k === 'dot');
    return {
      font: rng.pick(fontsOf(st, ['display', 'serif'])),
      rf: monos.length && rng.chance(0.5) ? 'dot' : rng.pick(fontsOf(st, ['body'])),
      orient: cut.n <= 7 && rng.chance(port ? 0.6 : 0.3) ? 'v' : 'h',
      density: rng.range(0.5, 0.72), speed: rng.range(0.85, 1.25), tint: rng.pick(['sub', 'sub', 'accent']),
      order: rng.pick(['ltr', 'random', 'random']),
    };
  },
  render(env) {
    const { W, H, sc } = env, cut = env.cut, Pm = cut.params, s = cut.seed, M = Math.min(W, H), lt = env.lt;
    const vert = Pm.orient === 'v';
    const mt = vert ? clean(cut.text) : mainLines(cut.text, W, H, 11, 6);
    const base = { text: mt, font: Pm.font, x: W / 2, y: H / 2, track: 0.1, lead: 1.25, vertical: vert };
    base.size = Math.min(J.fitSize(mt, Pm.font, W * (vert ? 0.5 : 0.84), H * (vert ? 0.8 : 0.5), base), vert ? H * 0.15 : H * 0.24);
    const gl = glyphPts(base), n = gl.length;
    const lb = J.itemBox(base);
    const kx0 = lb.x0 - base.size * 0.3, kx1 = lb.x1 + base.size * 0.3, ky0 = lb.y0 - base.size * 0.3, ky1 = lb.y1 + base.size * 0.3;
    // --- background streams: stationary glyph grid, a bright head sweeps down each active column
    const pool = poolOf(cut), NP = pool.length;
    const cell = J.clamp(M * 0.036, 16, 64), cols = Math.floor(W / cell), rows = Math.ceil(H / cell);
    const ox = (W - cols * cell) / 2;
    const bgA = E.outCubic(J.clamp(env.ltb / 0.35)) * outK(env);
    const rs = cell * 0.72, trk = (cell - rs) / rs;
    const tail = Pm.tint === 'accent' ? sc.accent : sc.sub;
    if (bgA > 0.01) {
      for (let c = 0; c < cols; c++) {
        if (J.r(s, c, 1) > Pm.density) continue;
        const v = J.rr(8, 16, s, c, 2) * Pm.speed, Ls = J.rr(6, 15, s, c, 3), per = rows + Ls + J.rr(2, rows * 0.8, s, c, 4);
        const hy = ((env.ltb * v + J.r(s, c, 5) * per) % per) - 1;
        const r0 = Math.max(0, Math.ceil(hy - Ls)), r1 = Math.min(rows - 1, Math.floor(hy));
        if (r1 < r0) continue;
        const x = ox + (c + 0.5) * cell, chs = [];
        for (let r = r0; r <= r1; r++) chs.push(pool[J.h(s, c, r, Math.floor((env.step + (J.h(s, r, c) & 15)) / 14)) % NP]);
        const inK = x > kx0 && x < kx1;
        env.draw({ text: chs.join(''), font: Pm.rf, size: rs, track: trk, vertical: true, align: 'left', x, y: r0 * cell + cell * 0.5 - rs * 0.5, color: sc.sub, ghost: false, alpha: bgA,
          charFn: (i) => {
            const r = r0 + i, d = hy - r;
            let a = d < 1 ? 1 : 0.1 + Math.pow(1 - d / Ls, 1.4) * 0.6;
            const cy = (r + 0.5) * cell;
            if (inK && cy > ky0 && cy < ky1) a *= 0.22;
            return d < 1 ? { a, color: sc.fg } : { a };
          } });
      }
    }
    // --- lyric: each glyph is delivered by its own falling stream and locks in place
    const span = J.clamp(cut.dur * 0.2, 0.1, 0.5), fd = J.clamp(cut.dur * 0.1, 0.14, 0.26);
    const rank = gl.map((g, i) => i);
    if (Pm.order === 'random') rank.sort((a, b) => J.r(s, a, 31) - J.r(s, b, 31));
    const pos = new Array(n); rank.forEach((gi, k) => { pos[gi] = k; });
    let bb = null;
    const trailN = 8, ts = J.clamp(base.size * 0.32, cell * 0.8, cell * 1.5), tsp = ts * 1.12;
    gl.forEach((g, i) => {
      const k = vert ? n - 1 - i : pos[i];
      const ta = 0.05 + fd + (n > 1 ? k / (n - 1) : 0) * span;
      const u = (lt - (ta - fd)) / fd;
      if (u > 0 && u < 2) {
        const e = E.inQuad(Math.min(1, u));
        const yh = J.lerp(-tsp * 2, g.y, e);
        const fade = u < 1 ? 1 : 1 - (u - 1);
        const chs = [];
        for (let j = trailN - 1; j >= 0; j--) chs.push(pool[J.h(s, i, j, env.step >> 1) % NP]);
        const hs = u < 1 ? J.lerp(ts, base.size, Math.pow(u, 3)) : base.size;
        env.draw({ text: chs.join(''), font: Pm.rf, size: ts, track: 0.12, vertical: true, align: 'left', x: g.x, y: yh - hs * 0.5 - trailN * tsp, color: tail, ghost: false, alpha: fade * outK(env),
          charFn: (j) => ({ a: Math.pow((j + 1) / trailN, 1.6) * 0.95 }) });
        if (u < 1) env.draw({ text: g.ch, font: Pm.font, size: hs, x: g.x, y: yh, vertical: vert, color: sc.fg, ghost: false, alpha: 0.6 + 0.4 * u });
      }
      const fl = J.clamp((lt - ta) / 0.45);
      const it = { text: g.ch, font: Pm.font, size: base.size, x: g.x, y: g.y, vertical: vert, color: fl < 1 ? J.mix(sc.accent, sc.fg, E.outCubic(fl)) : sc.fg, mi: miAt(env, ta) };
      bb = U(bb, J.mainDraw(env, it));
    });
    return bb;
  },
}, P);

/* ================================================================== 2 hanging — 吊り下げ */
J.register('layout', 'hanging', {
  name: '吊り下げ', tags: ['pop', 'calm', 'emotional'], w: 0.9, treat: 'safe', portrait: 0.8, fits: n => n >= 2 && n <= 12,
  enterBias: { drop: 1.8, pop: 1.3, cut: 1.5, slice: 0.3, wipe: 0.3, stretch: 0.4 },
  plan(rng, cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['display', 'serif'])), shape: rng.pick(['arc', 'wave', 'random', 'stair']), dir: rng.pick([1, -1]),
      tag: rng.chance(0.35), rail: rng.chance(0.6), amp: rng.range(0.06, 0.11), kick: rng.range(0.16, 0.26), ph: rng.range(0, 6),
    };
  },
  render(env) {
    const { W, H, sc, ctx } = env, cut = env.cut, Pm = cut.params, s = cut.seed, M = Math.min(W, H), lt = env.lt;
    const chars = slotsOf(cut.text), n = chars.length;
    if (!n) return null;
    const rowsN = W < H && n > 5 ? 2 : 1, per = Math.ceil(n / rowsN);
    const sp = W * (rowsN > 1 ? 0.84 / (per + 0.5) : 0.88 / per);
    const size = Math.min(sp * (Pm.tag ? 0.76 : 0.84), M * 0.19);
    const tagW = size * 1.12, tagH = size * 1.36;
    const csize = Pm.tag ? size * 0.8 : size;
    const railY = Pm.rail ? H * 0.075 : -2;
    const out = outK(env), inA = inE(env, 0.45);
    if (Pm.rail) {
      env.line([[W * 0.5 - W * 0.52 * inA, railY], [W * 0.5 + W * 0.52 * inA, railY]], sc.sub, Math.max(1.2, M * 0.0022), 0.8 * out, false);
    }
    const gap = J.clamp(cut.dur * 0.35 / n, 0.03, 0.08);
    let bb = null;
    const strokeW = Math.max(1, M * 0.0016);
    const items = [];
    for (let i = 0; i < n; i++) {
      if (chars[i] === ' ') continue;
      const row = Math.floor(i / per), j = i - row * per, cnt = Math.min(per, n - row * per);
      const u = cnt > 1 ? j / (cnt - 1) : 0.5;
      const amp = rowsN > 1 ? 0.45 : 1;
      let dev;
      if (Pm.shape === 'arc') dev = (Math.sin(Math.PI * u) - 0.55) * H * 0.13 * Pm.dir;
      else if (Pm.shape === 'wave') dev = Math.sin(u * J.TAU * 1.1 + Pm.ph) * H * 0.08;
      else if (Pm.shape === 'stair') dev = (u - 0.5) * H * 0.2 * Pm.dir;
      else dev = J.rs(s, i, 3) * H * 0.08;
      dev = Math.max(-H * 0.14, Math.min(H * 0.14, dev * amp));
      const ax = W / 2 + (j - (cnt - 1) / 2) * sp + (rowsN > 1 ? (row ? 0.25 : -0.25) * sp : 0);
      const cy = rowsN > 1 ? (row ? H * 0.64 : H * 0.4) + dev * 0.5 : H * 0.52 + dev;
      const attach = Pm.tag ? tagH * 0.5 - tagH * 0.1 : size * 0.56;
      const L = Math.max(H * 0.06, cy - attach - railY);
      const T = 1.5 * Math.sqrt(L / (H * 0.45)), w = J.TAU / T;
      const ta = 0.12 + i * gap;
      const tau = lt - ta;
      const ampK = rowsN > 1 && row === 1 ? 0.5 : 1;
      const dk = sp / L / J.DEG;                                   // degrees per 'one char spacing' of sideways travel
      let th = Pm.amp * dk * ampK * Math.sin(w * env.ltb + J.r(s, i, 5) * 6);
      if (tau > 0) th += Pm.kick * dk * ampK * (J.r(s, i, 6) < 0.5 ? 1 : -1) * Math.exp(-tau / 0.7) * Math.sin(w * tau * 1.3);
      const bounce = tau > 0 ? 1 + 0.05 * Math.exp(-tau / 0.18) * Math.cos(tau * 30) : 1;
      const r = th * J.DEG;
      const grow = E.outCubic(J.clamp((lt - (ta - 0.3)) / 0.3));
      const Ls = L * bounce * grow;
      const ex = ax + Math.sin(r) * Ls, ey = railY + Math.cos(r) * Ls;
      if (grow > 0) {
        env.line([[ax, railY], [ex, ey]], sc.sub, strokeW, 0.9 * out, false);
        if (Pm.rail) env.circle(ax, railY, Math.max(2.5, M * 0.004), sc.fg, null, 0, out, false);
      }
      const ccx = ax + Math.sin(r) * (Ls + attach), ccy = railY + Math.cos(r) * (Ls + attach);
      items.push({ i, ccx, ccy, th, ta, tau });
    }
    for (const q of items) {
      if (q.tau < 0) continue;
      if (Pm.tag) {
        const pc = q.i % 2 ? plateCol(sc, [sc.accent, sc.ink]) : plateCol(sc, [sc.ink, sc.fg]);
        const e = E.outBack(J.clamp(q.tau / 0.18), 1.4) * out;
        if (e > 0) {
          ctx.save(); ctx.translate(q.ccx, q.ccy); ctx.rotate(-q.th * J.DEG); ctx.scale(e, e);
          env.rrect(-tagW / 2, -tagH / 2, tagW, tagH, tagW * 0.12, pc, 1, gIn(env));
          env.circle(0, -tagH / 2 + tagH * 0.1, Math.max(2, size * 0.055), sc.bg, null, 0, 1, false);
          ctx.restore();
        }
        bb = U(bb, J.mainDraw(env, { text: chars[q.i], font: Pm.font, size: csize, x: q.ccx + Math.sin(q.th * J.DEG) * tagH * 0.06, y: q.ccy + Math.cos(q.th * J.DEG) * tagH * 0.06, rot: -q.th, color: onCol(sc, pc), plain: true, noHold: plateHold(env), mi: miAt(env, q.ta) }));
      } else {
        bb = U(bb, J.mainDraw(env, { text: chars[q.i], font: Pm.font, size: csize, x: q.ccx, y: q.ccy, rot: -q.th, color: sc.fg, mi: miAt(env, q.ta) }));
      }
    }
    return bb;
  },
}, P);

/* ================================================================== 3 orbit — 周回 */
J.register('layout', 'orbit', {
  name: '周回', tags: ['calm', 'graphic', 'emotional'], w: 1, fits: n => n >= 1 && n <= 14,
  plan(rng, cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['display', 'serif'])), fo: rng.pick(fontsOf(st, ['body', 'serif', 'display'])),
      variant: rng.pick(['ring', 'ring', 'atom', 'wide']), tilt: rng.range(5, 13) * rng.pick([1, -1]),
      speed: rng.range(22, 40) * rng.pick([1, -1]), unit: rng.pick(['line', 'self', 'line']),
    };
  },
  render(env) {
    const { W, H, sc, ctx } = env, cut = env.cut, Pm = cut.params, s = cut.seed, M = Math.min(W, H);
    const mt = mainLines(cut.text, W, H, 10, 5);
    const port = W < H;
    const size = Math.min(J.fitSize(mt, Pm.font, W * (port ? 0.64 : 0.54), H * 0.3, { track: 0.04, lead: 1.15 }), H * 0.19);
    const mm = J.measure({ text: mt, font: Pm.font, size, track: 0.04, lead: 1.15 });
    const cx = W / 2, cy = H / 2;
    const e = inE(env, 0.7), out = outK(env);
    const txt = clean(cut.text), line = clean(cut.lineText || '');
    const rom = romaOf(txt);
    const units = [];
    units.push(Pm.unit === 'line' && line && line !== txt && [...line].length <= 40 ? line + '・' : txt + '・');
    units.push(rom ? rom + ' ・ ' : (cut.words && cut.words.length > 1 ? cut.words.join('・') + '・' : txt + ' ・ '));
    const nR = Pm.variant === 'atom' ? 2 : 1;
    const rings = [];
    for (let k = 0; k < nR; k++) {
      const wide = Pm.variant === 'wide';
      const rx0 = J.clamp(Math.max(mm.w / 2 + size * (wide ? 1.4 : 1.05), M * (wide ? 0.44 : 0.36)), M * 0.2, W * 0.47);
      const ry0 = Math.min(rx0 * 0.62, Math.max(rx0 * (Pm.variant === 'atom' ? 0.36 : wide ? 0.2 : 0.27), mm.h / 2 + size * (k ? 0.75 : 0.5)));
      const grow = (0.7 + 0.3 * e) * (1 + 0.25 * env.pOut), rx = rx0 * grow, ry = ry0 * grow;
      const tilt = (Pm.variant === 'atom' ? (k ? -1 : 1) * (Math.abs(Pm.tilt) * 0.6 + 8) : Pm.tilt) * J.DEG;
      const os = J.clamp(M * (wide ? 0.05 : 0.042), 14, 64) * (k ? 0.82 : 1);
      const unit = [...units[k]];
      const perim = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
      const cnt = Math.max(Math.min(unit.length, 44), Math.min(44, Math.floor(perim / (os * 1.7))));
      rings.push({ rx, ry, tilt, os, unit, cnt, sp: Pm.speed * (k ? -0.8 : 1), font: k ? monoF(env) : Pm.fo });
    }
    const drawRing = (R, front) => {
      const cT = Math.cos(R.tilt), sT = Math.sin(R.tilt);
      const a0 = env.ltb * R.sp * J.DEG + J.r(s, 9) * J.TAU;
      const chars = [];
      for (let j = 0; j < R.cnt; j++) chars.push(R.unit[j % R.unit.length]);
      pathText(env, chars, R.font, R.os, (j) => {
        const a = a0 + j / R.cnt * J.TAU, z = Math.sin(a);
        if ((z >= 0) !== front) return null;
        const lx = Math.cos(a) * R.rx, ly = z * R.ry;
        const d = (z + 1) / 2;
        const ch = chars[j];
        const sep = ch === '・';
        return { x: cx + lx * cT - ly * sT, y: cy + lx * sT + ly * cT, s: 0.55 + 0.62 * d, a: (0.18 + 0.82 * Math.pow(d, 1.3)) * e * out, color: sep ? sc.accent : d > 0.5 ? sc.fg : sc.sub };
      });
    };
    const ellipse = (R, front) => {
      const pts = [], cT = Math.cos(R.tilt), sT = Math.sin(R.tilt);
      for (let j = 0; j <= 40; j++) { const a = front ? j / 40 * Math.PI : Math.PI + j / 40 * Math.PI; const lx = Math.cos(a) * R.rx * 1.0, ly = Math.sin(a) * R.ry; pts.push([cx + lx * cT - ly * sT, cy + lx * sT + ly * cT]); }
      return pts;
    };
    const lw = Math.max(1, M * 0.0016);
    for (const R of rings) { env.line(ellipse(R, false), sc.sub, lw, 0.4 * e * out, false); drawRing(R, false); }
    const bb = J.mainDraw(env, { text: mt, font: Pm.font, size, x: cx, y: cy, track: 0.04, lead: 1.15, color: sc.fg });
    const wb = bb || bbRect(cx - mm.w / 2, cy - mm.h / 2, cx + mm.w / 2, cy + mm.h / 2);
    for (const R of rings) {
      if (env.pass === 'main') {
        ctx.save(); ctx.beginPath(); ctx.rect(-W, -H, W * 3, H * 3); ctx.rect(wb.x0 - size * 0.12, wb.y0 - size * 0.1, wb.x1 - wb.x0 + size * 0.24, wb.y1 - wb.y0 + size * 0.2); ctx.clip('evenodd');
        env.line(ellipse(R, true), sc.sub, lw, 0.65 * e * out, false);
        ctx.restore();
      }
      drawRing(R, true);
    }
    return bb;
  },
}, P);

/* ================================================================== 4 tunnel — トンネル */
J.register('layout', 'tunnel', {
  name: 'トンネル', tags: ['glitch', 'graphic', 'emotional'], w: 0.9, emph: 1.3, busy: true, fits: n => n >= 1 && n <= 14,
  plan(rng, cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['display', 'body'])), fontC: rng.pick(fontsOf(st, ['display', 'serif'])),
      q: rng.range(1.42, 1.62), speed: rng.range(0.22, 0.42) * rng.pick([1, 1, -1]), style: rng.pick(['outline', 'fill', 'alt']),
      unit: rng.pick(['line', 'text', 'line']), persp: rng.chance(0.65),
    };
  },
  render(env) {
    const { W, H, sc } = env, cut = env.cut, Pm = cut.params, s = cut.seed, M = Math.min(W, H);
    const cx = W / 2, cy = H / 2;
    const mt = mainLines(cut.text, W, H, 10, 5);
    const size = Math.min(J.fitSize(mt, Pm.fontC, W * (W < H ? 0.44 : 0.5), H * 0.26, { track: 0.05, lead: 1.15 }), H * 0.16);
    const mm = J.measure({ text: mt, font: Pm.fontC, size, track: 0.05, lead: 1.15 });
    const hw = mm.w / 2 + size * 0.55, hh = mm.h / 2 + size * 0.5;
    // frame proportions: the screen's in landscape; in portrait halfway towards the text block (else the frames never show)
    const ra = W < H ? Math.min(0.95, Math.sqrt((hw / hh) * (W / H))) : W / H;
    const A = W / 2, B = A / ra;
    const s0 = Math.max(hw / A, hh / B, 0.12);
    const q = Pm.q, Lmax = Math.log(Math.max(W * 0.66 / A, H * 0.66 / B) / s0) / Math.log(q);
    const e = inE(env, 0.6), out = outK(env);
    const phase0 = env.ltb * Pm.speed + (1 - e) * 1.2 * Math.sign(Pm.speed || 1);
    const ph = ((phase0 % 1) + 1) % 1;
    const unit = [...((Pm.unit === 'line' && cut.lineText && clean(cut.lineText) !== clean(cut.text) ? cut.lineText : cut.text).replace(/\s+/g, ' ').trim() + '　')];
    const NU = unit.length;
    const lw = Math.max(1, M * 0.0015);
    // perspective rails from the screen corners to the innermost frame
    if (Pm.persp) {
      const a0 = s0 * A, b0 = s0 * B;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) env.line([[cx + sx * W * 0.75, cy + sy * H * 0.75], [cx + sx * a0, cy + sy * b0]], sc.sub, lw, 0.28 * e * out, false);
    }
    const K = Math.ceil(Lmax) + 1;
    for (let k = K; k >= 0; k--) {
      const L = k + ph - 1;
      if (L < 0 || L > Lmax + 0.2) continue;
      const sc1 = s0 * Math.pow(q, L);
      const a = sc1 * A, b = sc1 * B;
      const f = Math.min(sc1 * Math.min(A, B) * 0.15, M * 0.11);
      if (f < 3) continue;
      const alpha = J.smooth(0, 0.9, L) * (0.3 + 0.7 * J.clamp(L / Lmax * 1.4)) * e * out;
      if (alpha < 0.02) continue;
      const outline = Pm.style === 'outline' || (Pm.style === 'alt' && (k + Math.floor(phase0)) % 2 === 0);
      const col = (k + Math.floor(phase0)) % 3 === 0 ? sc.accent : sc.fg;
      const inset = f * 0.62;
      let gi = (k * 7 + Math.floor(phase0) * 3) % NU;
      const edge = (len) => {       // glyphs that fit into len
        const out2 = []; let acc = 0;
        for (let t = 0; t < 80; t++) { const ch = unit[(gi + t) % NU]; const ad = J.metrics.adv(Pm.font, ch) * f * 1.06; if (acc + ad > len) { gi += t; break; } acc += ad; out2.push(ch); }
        return out2.join('');
      };
      const common = { font: Pm.font, size: f, track: 0.06, ghost: false, alpha, color: col };
      if (outline) Object.assign(common, { fill: false, stroke: Math.max(1, f * 0.035), strokeColor: col });
      const hl = 2 * a - inset * 2.4, vl = 2 * b - inset * 2.4;
      env.draw(Object.assign({ text: edge(hl), x: cx, y: cy - b + inset }, common));
      env.draw(Object.assign({ text: edge(vl), x: cx + a - inset, y: cy, rot: 90 }, common));
      env.draw(Object.assign({ text: edge(hl), x: cx, y: cy + b - inset, rot: 180 }, common));
      env.draw(Object.assign({ text: edge(vl), x: cx - a + inset, y: cy, rot: -90 }, common));
      env.rect(cx - a, cy - b, a * 2, lw, sc.sub, alpha * 0.5, false);
      env.rect(cx - a, cy + b - lw, a * 2, lw, sc.sub, alpha * 0.5, false);
    }
    return J.mainDraw(env, { text: mt, font: Pm.fontC, size, x: cx, y: cy, track: 0.05, lead: 1.15, color: sc.fg });
  },
}, P);

/* ================================================================== 5 wordCloud — ワードクラウド */
const _cloud = new Map();
J.register('layout', 'wordCloud', {
  name: 'ワードクラウド', tags: ['pop', 'editorial', 'graphic'], w: 0.9, busy: true, fits: n => n >= 1 && n <= 14,
  plan(rng, cut, st) {
    const pool = fontsOf(st, ['display', 'serif', 'body']);
    return {
      font: rng.pick(fontsOf(st, ['display'])), fonts: [rng.pick(pool), rng.pick(pool), rng.pick(fontsOf(st, ['body', 'serif']))],
      vert: rng.pick([0, 0.3, 0.5]), accentN: rng.int(1, 3), outlineK: rng.pick([0, 0.2, 0.35]), wide: rng.range(1.2, 1.7),
    };
  },
  render(env) {
    const { W, H, sc } = env, cut = env.cut, Pm = cut.params, s = cut.seed, M = Math.min(W, H);
    const mt = mainLines(cut.text, W, H, 9, 5);
    const size = Math.min(J.fitSize(mt, Pm.font, W * (W < H ? 0.7 : 0.52), H * 0.24, { track: 0.03, lead: 1.1 }), H * 0.18);
    const key = s + '|' + W + 'x' + H + '|' + cut.text;
    let lay = _cloud.get(key);
    if (!lay) { lay = buildCloud(env, mt, size); if (_cloud.size > 60) _cloud.clear(); _cloud.set(key, lay); }
    const out = outK(env);
    lay.forEach((w, k) => {
      const q = J.clamp((env.lt - w.delay) / 0.32);
      if (q <= 0) return;
      const sq = E.outBack(q, 1.7) * (1 - 0.25 * E.inCubic(env.pOut));
      const dx = J.noise1(env.ltb * 0.35 + k * 3.1, s) * M * 0.004, dy = J.noise1(env.ltb * 0.3 + k * 5.7, s + 1) * M * 0.004;
      const it = { text: w.text, font: w.font, size: w.size * sq, x: w.x + dx, y: w.y + dy, vertical: w.vertical, track: 0.02, color: w.col === 'a' ? sc.accent : w.col === 'f' ? sc.fg : sc.sub, alpha: Math.min(1, q * 2.5) * out * w.a, ghost: false };
      if (w.outline) Object.assign(it, { fill: false, stroke: Math.max(1, w.size * 0.03), strokeColor: it.color });
      env.draw(it);
    });
    return J.mainDraw(env, { text: mt, font: Pm.font, size, x: W / 2, y: H / 2, track: 0.03, lead: 1.1, color: sc.fg });
  },
}, P);
function buildCloud(env, mt, size) {
  const { W, H } = env, cut = env.cut, Pm = cut.params, s = cut.seed, M = Math.min(W, H);
  const txt = clean(cut.text);
  const pool = [];
  const add = w => { w = String(w || '').trim(); if (w && J.glyphCount(w) <= 14 && !pool.includes(w) && ![...w].every(c => J.isPunct(c))) pool.push(w); };
  (J.chunkText(cut.lineText || cut.text) || []).forEach(add);
  (cut.words || []).forEach(add);
  (J.segments(cut.lineText || cut.text) || []).forEach(g => { g = g.trim(); if (J.glyphCount(g) >= 2 || [...g].some(c => J.isKanji(c))) add(g); });
  const rom = romaOf(txt); if (rom) add(rom);
  if (cut.note) add(cut.note);
  add(txt);
  [...txt].filter(c => J.isKanji(c)).forEach(add);
  if (J.glyphCount(cut.lineText || '') <= 14) add(cut.lineText);
  if (!pool.length) pool.push(txt || '・');
  const mm = J.measure({ text: mt, font: Pm.font, size, track: 0.03, lead: 1.1 });
  const boxes = [[W / 2 - mm.w / 2 - size * 0.25, H / 2 - mm.h / 2 - size * 0.18, W / 2 + mm.w / 2 + size * 0.25, H / 2 + mm.h / 2 + size * 0.18]];
  const out = [];
  const port = W < H;
  const stretchX = port ? 0.75 : Pm.wide, stretchY = port ? 1.3 : 1;
  const maxR = Math.hypot(W, H) * 0.55;
  let acc = 0;
  for (let k = 0; k < 70 && out.length < 44; k++) {
    const word = pool[k % pool.length];
    const latin = /[A-Za-z]/.test(word);
    const vertical = !latin && J.glyphCount(word) <= 6 && J.r(s, k, 3) < Pm.vert;
    const tier = Math.pow(0.95, out.length);
    let fs = Math.max(M * 0.018, Math.min(W * 0.4 / Math.max(1.5, J.glyphCount(word)), size * 0.6, M * 0.125 * tier * (0.65 + 0.7 * J.r(s, k, 4))));
    const font = Pm.fonts[k % Pm.fonts.length];
    const it = { text: word, font, size: fs, track: 0.02, vertical };
    let m = J.measure(it);
    const maxW = W * 0.9, maxH = H * 0.9;
    if (m.w > maxW || m.h > maxH) { const f = Math.min(maxW / m.w, maxH / m.h); fs *= f; it.size = fs; m = J.measure(it); }
    const pad = fs * 0.12;
    const w2 = m.w / 2 + pad, h2 = m.h / 2 + pad;
    const a0 = J.r(s, k, 5) * J.TAU;
    let placed = null;
    for (let t = 0; t < 520; t++) {
      const ang = a0 + t * 0.42, rad = (t / 520) * maxR;
      const x = W / 2 + Math.cos(ang) * rad * stretchX, y = H / 2 + Math.sin(ang) * rad * stretchY * 0.8;
      if (x - w2 < W * 0.035 || x + w2 > W * 0.965 || y - h2 < H * 0.045 || y + h2 > H * 0.955) continue;
      let hit = false;
      for (const b of boxes) if (x - w2 < b[2] && x + w2 > b[0] && y - h2 < b[3] && y + h2 > b[1]) { hit = true; break; }
      if (!hit) { placed = [x, y]; break; }
    }
    if (!placed) { acc++; if (acc > 16) break; continue; }
    boxes.push([placed[0] - w2, placed[1] - h2, placed[0] + w2, placed[1] + h2]);
    const d = Math.hypot((placed[0] - W / 2) / W, (placed[1] - H / 2) / H);
    const idx = out.length;
    out.push({ text: word, font, size: fs, x: placed[0], y: placed[1], vertical, delay: 0.06 + d * 0.9 + idx * 0.012,
      col: [4, 9, 15].indexOf(idx) >= 0 && [4, 9, 15].indexOf(idx) < Pm.accentN ? 'a' : (idx % 2 ? 's' : 'f'), a: idx % 2 ? 0.8 : 0.5 + 0.2 * tier, outline: J.r(s, k, 7) < Pm.outlineK });
  }
  return out;
}

/* ================================================================== 6 bounceLine — 跳ねる */
J.register('layout', 'bounceLine', {
  name: '跳ねる', tags: ['pop'], w: 1, fits: n => n >= 2 && n <= 16,
  enterBias: { drop: 1.8, pop: 1.5, cut: 1.2, slice: 0.4, stretch: 0.5 },
  plan(rng, cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['display'])), mode: rng.pick(['wave', 'wave', 'beat', 'hop']), hop: rng.range(0.38, 0.6),
      tempo: rng.range(0.42, 0.6), shadow: rng.chance(0.7), line: rng.pick(['line', 'line', 'dots', 'none']), tilt: rng.chance(0.5),
    };
  },
  render(env) {
    const { W, H, sc, ctx } = env, cut = env.cut, Pm = cut.params, s = cut.seed, M = Math.min(W, H), lt = env.lt;
    const n0 = J.glyphCount(cut.text);
    const mt = mainLines(cut.text, W, H, 11, 6);
    const nL = mt.split('\n').length;
    const base = { text: mt, font: Pm.font, x: W / 2, y: H / 2 + (nL > 1 ? 0 : H * 0.03), track: 0.1, lead: 2.0 };
    base.size = Math.min(J.fitSize(mt, Pm.font, W * 0.84, H * (nL > 1 ? 0.52 : 0.3), base), H * 0.2);
    const size = base.size;
    const gl = glyphPts(base), n = gl.length;
    const out = outK(env), inA = inE(env, 0.5);
    const hopH = size * Pm.hop, hd = J.clamp(Pm.tempo * 0.62, 0.22, 0.34), sq = 0.13;
    // hop profile: τ = time since take-off
    const prof = (tau) => {
      if (tau < -0.07 || tau > hd + sq) return { h: 0, sx: 1, sy: 1 };
      if (tau < 0) { const k = Math.sin(Math.PI * (tau + 0.07) / 0.07); return { h: 0, sx: 1 + 0.08 * k, sy: 1 - 0.1 * k }; }
      if (tau < hd) { const u = tau / hd; return { h: 4 * u * (1 - u), sx: 0.94, sy: 1.08 }; }
      const k = Math.sin(Math.PI * (tau - hd) / sq); return { h: 0, sx: 1 + 0.2 * k, sy: 1 - 0.24 * k };
    };
    const start = 0.25;
    let bb = null;
    const lines = {};
    gl.forEach((g, i) => {
      let tau = -1;
      const t = lt - start;
      if (t > -0.1) {
        if (Pm.mode === 'wave') {
          const gap = Math.min(0.09, 0.9 / n), P = Math.max(Pm.tempo * 2.2, n * gap + hd + 0.35);
          const tt = t - i * gap; tau = tt < -0.1 ? -1 : ((tt + 0.07) % P) - 0.07;
        } else if (Pm.mode === 'beat') {
          if (env.beat && env.beat.len > 0.2) { tau = env.beat.index % n === i ? env.beat.since : -1; }
          else { const k = Math.floor(t / Pm.tempo); tau = ((k % n) + n) % n === i ? t - k * Pm.tempo : -1; }
        } else {
          const P = J.rr(0.9, 1.7, s, i, 7), ph = J.r(s, i, 8) * P;
          tau = ((t + ph) % P) - 0.07;
          if (t + ph < P - 0.07) tau = -1;
        }
      }
      const pr = prof(tau);
      const yb = g.y + size * 0.5;
      const lk = g.li;
      if (!lines[lk]) lines[lk] = { x0: g.x - g.w / 2, x1: g.x + g.w / 2, y: yb };
      lines[lk].x0 = Math.min(lines[lk].x0, g.x - g.w / 2); lines[lk].x1 = Math.max(lines[lk].x1, g.x + g.w / 2);
      if (Pm.shadow) {
        const k = 1 - pr.h * 0.55;
        ctx.save(); ctx.translate(g.x, yb + size * 0.06); ctx.scale(1, 0.2);
        env.circle(0, 0, size * 0.34 * k * pr.sx, sc.sub, null, 0, 0.28 * k * out * inA, false);
        ctx.restore();
      }
      const it = { text: g.ch, font: Pm.font, size, x: g.x, y: yb - size * 0.5 * pr.sy - pr.h * hopH, sx: pr.sx, sy: pr.sy,
        rot: Pm.tilt && pr.h > 0 ? Math.sin(tau / hd * Math.PI * 2) * 7 * (i % 2 ? 1 : -1) : 0,
        color: Pm.mode === 'beat' && pr.h > 0 ? sc.accent : sc.fg, mi: i };
      bb = U(bb, J.mainDraw(env, it));
    });
    const lw = Math.max(1.5, M * 0.0022);
    for (const k of Object.keys(lines)) {
      const L = lines[k], pad = size * 0.35, x0 = L.x0 - pad, x1 = L.x1 + pad, y = L.y + size * 0.1;
      if (Pm.line === 'line') env.line([[x0, y], [J.lerp(x0, x1, inA), y]], sc.sub, lw, 0.7 * out, false);
      else if (Pm.line === 'dots') { const m = Math.max(4, Math.round((x1 - x0) / (size * 0.25))); for (let j = 0; j <= m; j++) if (j / m <= inA) env.circle(J.lerp(x0, x1, j / m), y, lw * 1.2, sc.sub, null, 0, 0.8 * out, false); }
    }
    return bb;
  },
}, P);

/* ================================================================== 7 elastic — ゴム */
J.register('layout', 'elastic', {
  name: 'ゴム', tags: ['pop', 'graphic'], w: 0.9, portrait: 0.85, fits: n => n >= 2 && n <= 12,
  enterBias: { cut: 1.6, stretch: 0.3, pop: 1.2 },
  plan(rng, cut, st) {
    const port = cut.H > cut.W;
    return {
      font: rng.pick(fontsOf(st, ['display', 'serif'])), orient: port ? (cut.n <= 5 ? rng.pick(['v', 'v', 'h']) : 'v') : rng.pick(['h', 'h', 'diag']),
      ang: rng.range(6, 12) * rng.pick([1, -1]), every: rng.range(1.1, 1.6), amp: rng.range(0.3, 0.45), anchor: rng.pick(['dot', 'ring', 'pin']),
    };
  },
  render(env) {
    const { W, H, sc, ctx } = env, cut = env.cut, Pm = cut.params, s = cut.seed, M = Math.min(W, H), lt = env.lt;
    const vert = Pm.orient === 'v';
    const txt = vert ? clean(cut.text) : String(cut.text).trim();
    const ang = Pm.orient === 'diag' ? Pm.ang : 0;
    const base = { text: txt, font: Pm.font, x: 0, y: 0, track: 0.08, vertical: vert };
    const avail = vert ? H * 0.58 : (W < H ? W * 0.7 : W * 0.62);
    base.size = Math.min(J.fitSize(txt, Pm.font, vert ? W * 0.3 : avail, vert ? avail : H * 0.22, base), H * 0.2);
    const size = base.size;
    const gl = glyphPts(base), n = gl.length;
    if (!n) return null;
    const along = g => (vert ? g.y : g.x);
    const a0 = along(gl[0]) - (vert ? gl[0].h : gl[0].w) / 2, a1 = along(gl[n - 1]) + (vert ? gl[n - 1].h : gl[n - 1].w) / 2;
    const gap = size * 0.85;
    const half = (a1 - a0) / 2 + gap;
    // spring: anchors fly out from the centre and overshoot
    const te = lt - 0.02;
    const spr = te <= 0 ? 0 : 1 - Math.exp(-te / 0.1) * Math.cos(te * 15);
    const k = Math.max(0.04, spr) * (1 + 0.6 * E.inCubic(env.pOut));
    // pluck: standing wave across the band
    let tau = -1, ampK = 1;
    if (env.beat && env.beat.len > 0.2 && lt > 0.5) { tau = env.beat.since; ampK = env.beat.index % 2 ? 0.55 : 1; }
    else if (lt > 0.45) { tau = (lt - 0.45) % Pm.every; }
    const A = size * Pm.amp * ampK * (lt < 0.45 ? 0 : 1);
    const wv = (u) => (tau < 0 ? 0 : A * Math.sin(Math.PI * u) * Math.cos(tau * 22) * Math.exp(-tau / 0.42));
    const cx = W / 2, cy = H / 2, cr = Math.cos(ang * J.DEG), sr = Math.sin(ang * J.DEG);
    const P2 = (a, d) => (vert ? [cx + d, cy + a] : [cx + a * cr - d * sr, cy + a * sr + d * cr]);   // along / across → screen
    const aA = -half * k, aB = half * k;
    const uOf = a => (a - aA) / Math.max(1, aB - aA);
    const out = outK(env), inA = inE(env, 0.3);
    // band segments (anchor → text end)
    const lw = Math.max(1.5, size * 0.03);
    const seg = (from, to) => { const pts = []; for (let j = 0; j <= 12; j++) { const a = J.lerp(from, to, j / 12); pts.push(P2(a, wv(uOf(a)))); } return pts; };
    const tA = a0 * k - size * 0.12, tB = a1 * k + size * 0.12;
    env.line(seg(aA, tA), sc.sub, lw, 0.9 * out * inA, false);
    env.line(seg(tB, aB), sc.sub, lw, 0.9 * out * inA, false);
    let bb = null;
    gl.forEach((g, i) => {
      const a = along(g) * k, u = uOf(a);
      const d = wv(u), slope = (wv(u + 0.01) - wv(u - 0.01)) / (0.02 * Math.max(1, aB - aA));
      const [x, y] = P2(a, d);
      const st = J.clamp(k, 0.15, 1.6);
      const it = { text: g.ch, font: Pm.font, size, x, y, vertical: vert, sx: vert ? 1 / Math.sqrt(st) : st, sy: vert ? st : 1 / Math.sqrt(st),
        rot: (vert ? -Math.atan(slope) : Math.atan(slope)) / J.DEG + ang, color: sc.fg, mi: i * 0.5 };
      bb = U(bb, J.mainDraw(env, it));
    });
    // anchors
    const R = Math.max(5, size * 0.1);
    for (const a of [aA, aB]) {
      const [x, y] = P2(a, 0);
      const q = E.outBack(J.clamp(lt / 0.2), 2) * out;
      if (q <= 0) continue;
      if (Pm.anchor === 'dot') env.circle(x, y, R * q, sc.accent, null, 0, 1, true);
      else if (Pm.anchor === 'ring') { env.circle(x, y, R * 1.3 * q, null, sc.accent, lw * 1.3, 1, true); env.circle(x, y, R * 0.45 * q, sc.fg, null, 0, 1, false); }
      else { const [px, py] = P2(a, -R * 3.2); env.line([[px, py], [x, y]], sc.fg, lw, q, false); env.circle(px, py, R * 0.9 * q, sc.accent, null, 0, 1, true); env.circle(x, y, R * 0.4 * q, sc.fg, null, 0, 1, false); }
    }
    return bb;
  },
}, P);

/* ================================================================== 8 crossBands — 交差帯 */
J.register('layout', 'crossBands', {
  name: '交差帯', tags: ['graphic', 'pop', 'glitch'], w: 1, treat: 'safe', busy: true, fits: n => n >= 1 && n <= 14,
  plan(rng, cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['display'])), fb: rng.pick(fontsOf(st, ['body', 'display'])), ang: rng.range(13, 22),
      plate: rng.pick(['box', 'double', 'shadow']), speed: rng.range(0.7, 1.2), swap: rng.chance(0.5), sep: rng.pick(['／', '・', '　', '×']),
    };
  },
  render(env) {
    const { W, H, sc, ctx } = env, cut = env.cut, Pm = cut.params, M = Math.min(W, H), lt = env.lt;
    const port = W < H;
    const ang = (port ? Pm.ang + 16 : Pm.ang);
    const bh = M * (port ? 0.12 : 0.105);
    const cols = [plateCol(sc, [sc.ink, sc.fg]), plateCol(sc, [sc.accent, sc.accent2, sc.sub])];
    if (Pm.swap) cols.reverse();
    const len = Math.hypot(W, H) * 1.15;
    const unit = (cut.lineText || cut.text).replace(/\s+/g, ' ').trim() + '　' + Pm.sep + '　';
    const fsz = bh * 0.46;
    const per = J.measure({ text: unit, font: Pm.fb, size: fsz, track: 0.08 }).w;
    const reps = Math.min(40, Math.ceil(len * 1.2 / Math.max(1, per)) + 2);
    const outE = E.inCubic(env.pOut);
    [0, 1].forEach(b => {
      const e = E.outExpo(J.clamp((lt - b * 0.08) / 0.5)) * (1 - outE);
      if (e <= 0) return;
      const a = (b ? -ang : ang) * J.DEG, dir = b ? -1 : 1;
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(a);
      const L = len * e, x0 = dir > 0 ? -len / 2 : len / 2 - L;
      env.rect(x0, -bh / 2, L, bh, cols[b], 1, lt < 0.6);
      ctx.beginPath(); ctx.rect(x0, -bh / 2, L, bh); ctx.save(); ctx.clip();
      const off = ((env.ltb * Pm.speed * M * 0.12 * dir) % per + per) % per;
      env.draw({ text: unit.repeat(reps), font: Pm.fb, size: fsz, track: 0.08, align: 'left', x: -len * 0.6 - per + off, y: 0, color: onCol(sc, cols[b]), ghost: false });
      ctx.restore();
      ctx.restore();
    });
    // lyric plate at the crossing
    const mt = mainLines(cut.text, W, H, 9, 5);
    const size = Math.min(J.fitSize(mt, Pm.font, W * (port ? 0.66 : 0.5), H * 0.24, { track: 0.04, lead: 1.12 }), H * 0.17);
    const mm = J.measure({ text: mt, font: Pm.font, size, track: 0.04, lead: 1.12 });
    const pw = mm.w + size * 0.9, ph = mm.h + size * 0.7;
    const q = E.outBack(J.clamp((lt - 0.1) / 0.28), 1.6) * (1 - outE);
    if (q > 0) {
      const lw = Math.max(2, size * 0.035);
      ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(q, q);
      if (Pm.plate === 'shadow') { const o = size * 0.12; env.rect(-pw / 2 + o, -ph / 2 + o, pw, ph, cols[1], 1, false); }
      env.rect(-pw / 2, -ph / 2, pw, ph, sc.bg, 1, false);
      env.rrect(-pw / 2, -ph / 2, pw, ph, 0, null, 1, false, sc.fg, lw);
      if (Pm.plate === 'double') { const o = lw * 2.6; env.rrect(-pw / 2 + o, -ph / 2 + o, pw - o * 2, ph - o * 2, 0, null, 1, false, sc.fg, lw * 0.5); }
      ctx.restore();
    }
    return J.mainDraw(env, { text: mt, font: Pm.font, size, x: W / 2, y: H / 2, track: 0.04, lead: 1.12, color: sc.fg });
  },
}, P);

/* ================================================================== 9 stickerBomb — ステッカー */
const stickerPath = (ctx, shape, w, h, grow, seed) => {
  const x = -w / 2 - grow, y = -h / 2 - grow, W2 = w + grow * 2, H2 = h + grow * 2;
  ctx.beginPath();
  if (shape === 'circle') ctx.arc(0, 0, Math.max(W2, H2) / 2, 0, J.TAU);
  else if (shape === 'burst') {
    const R = Math.max(W2, H2) / 2 * 1.08, m = 16;
    for (let i = 0; i < m * 2; i++) { const a = i / (m * 2) * J.TAU, r = i % 2 ? R * 0.84 : R; i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath();
  } else rrPath(ctx, x, y, W2, H2, shape === 'pill' ? H2 / 2 : Math.min(W2, H2) * 0.2);
};
J.register('layout', 'stickerBomb', {
  name: 'ステッカー', tags: ['pop', 'graphic'], w: 0.9, treat: 'safe', fits: n => n >= 1 && n <= 12,
  enterBias: { cut: 2, pop: 1.2, slice: 0.4, wipe: 0.5, assemble: 0.4 },
  plan(rng, cut, st) {
    const n = cut.n;
    return {
      font: rng.pick(fontsOf(st, ['display'])), fs: rng.pick(fontsOf(st, ['body', 'display'])),
      main: n <= 3 ? rng.pick(['circle', 'burst', 'rrect']) : n <= 5 ? rng.pick(['rrect', 'burst', 'pill']) : rng.pick(['rrect', 'pill']),
      cnt: rng.int(4, 6), rot: rng.range(-5, 5), spin: rng.range(0, 6),
    };
  },
  render(env) {
    const { W, H, sc, ctx } = env, cut = env.cut, Pm = cut.params, s = cut.seed, M = Math.min(W, H), lt = env.lt;
    const port = W < H;
    const mt = mainLines(cut.text, W, H, 8, 5);
    const size = Math.min(J.fitSize(mt, Pm.font, W * (port ? 0.64 : 0.5), H * 0.26, { track: 0.03, lead: 1.1 }), H * (Pm.main === 'circle' || Pm.main === 'burst' ? 0.15 : 0.19));
    const mm = J.measure({ text: mt, font: Pm.font, size, track: 0.03, lead: 1.1 });
    const pw = mm.w + size * 0.8, ph = mm.h + size * 0.6;
    const dark = J.lum(sc.bg) < 0.45;
    const border = dark ? sc.fg : sc.bg;
    const bw = Math.max(4, size * 0.09);
    const out = 1 - E.inCubic(env.pOut), grow = 1 + 0.08 * E.outCubic(env.pOut);
    const slap = (t0) => { const q = J.clamp((lt - t0) / 0.16); if (q <= 0) return null; return { s: 1 + 0.3 * Math.pow(1 - q, 2) - 0.06 * Math.sin(Math.PI * q) * (q < 1 ? 1 : 0), a: Math.min(1, q * 3), r: (1 - E.outCubic(q)) * 14 }; };
    const drawSticker = (x, y, rot, sh, w, h, fill, q, seed) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate((rot + q.r) * J.DEG); ctx.scale(q.s * grow, q.s * grow);
      if (env.pass === 'main') {
        if (!dark) { ctx.save(); ctx.translate(bw * 0.5, bw * 0.7); stickerPath(ctx, sh, w, h, bw, seed); ctx.globalAlpha = 0.22 * q.a * out; ctx.fillStyle = sc.fg; ctx.fill(); ctx.restore(); }
        stickerPath(ctx, sh, w, h, bw, seed); ctx.globalAlpha = q.a * out; ctx.fillStyle = border; ctx.fill();
        stickerPath(ctx, sh, w, h, 0, seed); ctx.fillStyle = fill; ctx.fill(); ctx.globalAlpha = 1;
      } else if (env.passColor && gIn(env)) { stickerPath(ctx, sh, w, h, bw, seed); ctx.globalAlpha = q.a; ctx.fillStyle = env.passColor; ctx.fill(); ctx.globalAlpha = 1; }
      ctx.restore();
    };
    // secondary stickers
    const txt = clean(cut.text);
    const pool = [];
    const add = w => { w = String(w || '').trim(); if (w && w !== txt && J.glyphCount(w) <= 12 && !pool.includes(w)) pool.push(w); };
    (cut.words || []).forEach(add);
    const rom = romaOf(txt); if (rom) add(rom);
    J.chunkText(cut.lineText || '').forEach(add);
    add('No.' + String((cut.line | 0) + 1).padStart(2, '0'));
    add('♡'); add('!!');
    const fills = [sc.accent, sc.ink, sc.accent2, sc.fg].map(c => plateCol(sc, [c]));
    const mainFill = plateCol(sc, [sc.ink, sc.accent]);
    const shapes = ['circle', 'rrect', 'burst', 'pill'];
    const cnt = Pm.cnt;
    const hw = pw / 2, hh = ph / 2;
    const items = [];
    for (let k = 0; k < cnt; k++) {
      const word = pool[k % pool.length];
      const glyphs = J.glyphCount(word);
      const sh = glyphs <= 2 ? (J.r(s, k, 2) < 0.5 ? 'circle' : 'burst') : J.r(s, k, 2) < 0.5 ? 'pill' : 'rrect';
      const fsz = J.clamp(M * J.rr(0.042, 0.06, s, k, 3), 12, 80);
      const m = J.measure({ text: word, font: Pm.fs, size: fsz, track: 0.06 });
      let w = m.w + fsz * 1.0, h = fsz * 1.7;
      if (sh === 'circle' || sh === 'burst') { w = h = Math.max(m.w, fsz) + fsz * 1.2; }
      const a = (k / cnt) * J.TAU + J.rs(s, k, 4) * 0.35 + Pm.spin;
      let x = W / 2 + Math.cos(a) * (hw + w * 0.32), y = H / 2 + Math.sin(a) * (hh + h * 0.4);
      x = J.clamp(x, W * 0.05 + w / 2, W * 0.95 - w / 2); y = J.clamp(y, H * 0.06 + h / 2, H * 0.94 - h / 2);
      items.push({ word, sh, fsz, w, h, x, y, rot: J.rs(s, k, 5) * 18, fill: fills[k % fills.length] === mainFill ? fills[(k + 1) % fills.length] : fills[k % fills.length], t0: 0.14 + k * 0.07 });
    }
    for (const it of items) {
      const q = slap(it.t0); if (!q) continue;
      drawSticker(it.x, it.y, it.rot, it.sh, it.w, it.h, it.fill, q, s);
      ctx.save(); ctx.translate(it.x, it.y); ctx.rotate((it.rot + q.r) * J.DEG); ctx.scale(q.s * grow, q.s * grow);
      env.draw({ text: it.word, font: Pm.fs, size: it.fsz, track: 0.06, x: 0, y: 0, color: onCol(sc, it.fill), alpha: q.a * out, ghost: false });
      ctx.restore();
    }
    // main sticker last (on top)
    const q = slap(0.02);
    if (!q) return null;
    const sh = Pm.main;
    let w = pw, h = ph;
    if (sh === 'circle' || sh === 'burst') w = h = Math.max(pw, ph) * 1.02;
    drawSticker(W / 2, H / 2, Pm.rot, sh, w, h, mainFill, q, s);
    ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate((Pm.rot + q.r) * J.DEG); ctx.scale(q.s, q.s);
    const lb = J.mainDraw(env, { text: mt, font: Pm.font, size, x: 0, y: 0, track: 0.03, lead: 1.1, color: onCol(sc, mainFill), noHold: plateHold(env) });
    ctx.restore();
    return lb ? bbRect(W / 2 - w / 2, H / 2 - h / 2, W / 2 + w / 2, H / 2 + h / 2) : null;
  },
}, P);

/* ================================================================== 10 neon — ネオン */
J.register('layout', 'neon', {
  name: 'ネオン', tags: ['calm', 'emotional'], w: 1, treat: false, fits: n => n >= 1 && n <= 14,
  enterBias: { flicker: 2.6, blur: 1.4, cut: 1.3, assemble: 0.3, slice: 0.5, scramble: 0.6 },
  plan(rng, cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['display', 'body'])), tube: rng.pick(['accent', 'accent', 'accent2', 'fg']),
      frame: rng.pick(['box', 'under', 'bracket', 'none']), flick: rng.chance(0.75), sub: rng.chance(0.5),
    };
  },
  render(env) {
    const { W, H, sc, ctx } = env, cut = env.cut, Pm = cut.params, s = cut.seed, M = Math.min(W, H), lt = env.lt;
    const mt = mainLines(cut.text, W, H, 9, 5);
    const base = { text: mt, font: Pm.font, x: W / 2, y: H / 2, track: 0.08, lead: 1.25 };
    base.size = Math.min(J.fitSize(mt, Pm.font, W * 0.72, H * 0.34, base), H * 0.19);
    const size = base.size;
    const dark = J.lum(sc.bg) < 0.45;
    const cand = Pm.tube === 'accent2' ? [sc.accent2, sc.accent, sc.fg] : Pm.tube === 'fg' ? [sc.fg, sc.accent] : [sc.accent, sc.accent2, sc.fg];
    let tube = cand.find(c => c && J.contrast(c, sc.bg) >= 2.2) || sc.fg;
    const core = dark ? J.mix(tube, '#FFFFFF', 0.72) : J.mix(tube, '#FFFFFF', 0.35);
    const EN = J.ENTER[cut.enter], EX = J.EXIT[cut.exit];
    const solid = (EN && EN.pieces && env.pIn < 1) || (EX && EX.pieces && env.pOut > 0);
    const gl = glyphPts(base);
    const tw = Math.max(1.5, size * (dark ? 0.05 : 0.06)), cw = Math.max(1, size * 0.018);
    const glow = { color: J.rgba(tube, dark ? 0.95 : 0.55), blur: Math.min(60, size * (dark ? 0.24 : 0.14)) };
    let bb = null;
    // ignition + occasional flicker (on the ≤24 Hz step clock)
    const on = (i, t0) => {
      const t = lt - t0;
      if (t < 0) return 0;
      if (t < 0.32) return J.r(s, i, env.step, 3) < 0.25 + t * 2 ? 1 : 0.12;
      if (Pm.flick && J.r(s, i, Math.floor(env.step / 2), 4) < 0.007) return 0.2;
      return 1;
    };
    gl.forEach((g, i) => {
      const t0 = 0.04 + J.r(s, i, 5) * 0.28;
      const k = on(i, t0);
      if (k <= 0) return;
      const common = { text: g.ch, font: Pm.font, size, x: g.x, y: g.y, mi: i * 0.4 };
      if (solid) { bb = U(bb, J.mainDraw(env, Object.assign(common, { color: tube, shadow: glow, alpha: k }))); return; }
      const r = J.mainDraw(env, Object.assign({}, common, { fill: false, stroke: tw, strokeColor: tube, color: tube, shadow: k > 0.5 ? glow : null, alpha: k }));
      J.mainDraw(env, Object.assign({}, common, { fill: false, stroke: cw, strokeColor: core, color: core, alpha: k > 0.5 ? 1 : 0.3, ghost: false }));
      bb = U(bb, r);
    });
    // neon frame
    const fb = bb || bbRect(W / 2 - 10, H / 2 - 10, W / 2 + 10, H / 2 + 10);
    const fk = on(99, 0.22) * (1 - E.inCubic(env.pOut));
    if (Pm.frame !== 'none' && fk > 0 && bb) {
      const px = size * 0.55, py = size * 0.42;
      const x0 = fb.x0 - px, x1 = fb.x1 + px, y0 = fb.y0 - py, y1 = fb.y1 + py;
      const lw = Math.max(1.5, size * 0.035);
      const path = [];
      if (Pm.frame === 'under') path.push([[x0 + px * 0.5, y1], [x1 - px * 0.5, y1]]);
      else if (Pm.frame === 'bracket') { const c = size * 0.5; path.push([[x0, y0 + c], [x0, y0], [x0 + c, y0]], [[x1 - c, y0], [x1, y0], [x1, y0 + c]], [[x1, y1 - c], [x1, y1], [x1 - c, y1]], [[x0 + c, y1], [x0, y1], [x0, y1 - c]]); }
      if (env.pass === 'main') {
        ctx.save(); ctx.shadowColor = glow.color; ctx.shadowBlur = glow.blur * 0.8 * env.scale; ctx.lineCap = 'round';
        if (Pm.frame === 'box') env.rrect(x0, y0, x1 - x0, y1 - y0, size * 0.3, null, fk, false, tube, lw);
        else path.forEach(p => env.line(p, tube, lw, fk, false));
        ctx.restore();
        if (Pm.frame === 'box') env.rrect(x0, y0, x1 - x0, y1 - y0, size * 0.3, null, fk, false, core, lw * 0.35);
        else path.forEach(p => env.line(p, core, lw * 0.35, fk, false));
      } else {
        if (Pm.frame === 'box') env.rrect(x0, y0, x1 - x0, y1 - y0, size * 0.3, null, fk, true, tube, lw);
        else path.forEach(p => env.line(p, tube, lw, fk, true));
      }
      if (Pm.sub && env.pass === 'main') {
        const rom = romaOf(cut.text);
        const st = rom || (cut.lineText !== cut.text ? cut.lineText : null);
        if (st) {
          const fs = J.clamp(size * 0.2, 12, 34);
          const c2 = [sc.accent2, sc.fg, sc.sub].find(c => c && c !== tube && J.contrast(c, sc.bg) >= 2) || sc.sub;
          ctx.save(); ctx.shadowColor = J.rgba(c2, 0.9); ctx.shadowBlur = fs * 0.6 * env.scale;
          env.draw({ text: st, font: monoF(env), size: fs, track: 0.3, x: (x0 + x1) / 2, y: y1 + fs * 1.6, color: c2, alpha: fk * on(98, 0.4), ghost: false });
          ctx.restore();
        }
      }
    }
    return bb;
  },
}, P);

/* rows of equal cells for per-glyph layouts: returns [{i, ch, x, y}] and the cell size */
const cellRows = (chs, W, H, maxPerRow, cellAsp, maxK, gapK = 0.14, stagger = false) => {
  const n = chs.length, rows = Math.ceil(n / maxPerRow), per = Math.ceil(n / rows);
  const wk = per + (per - 1) * gapK + (stagger && rows > 1 ? 0.5 : 0);
  const hk = rows * cellAsp + (rows - 1) * gapK * 1.6;
  const k = Math.min(W * 0.86 / wk, H * 0.7 / hk, maxK);
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / per), j = i - r * per, cnt = Math.min(per, n - r * per);
    const x = W / 2 + (j - (cnt - 1) / 2) * k * (1 + gapK) + (stagger && rows > 1 ? (r % 2 ? 0.25 : -0.25) * k : 0);
    const y = H / 2 + (r - (rows - 1) / 2) * k * (cellAsp + gapK * 1.6);
    out.push({ i, ch: chs[i], x, y, r, j });
  }
  return { cells: out, k, rows };
};

/* ================================================================== 11 keycaps — キーキャップ */
J.register('layout', 'keycaps', {
  name: 'キーキャップ', tags: ['pop', 'graphic'], w: 0.6, treat: 'safe', fits: n => n >= 1 && n <= 10,
  enterBias: { cut: 2.5, pop: 1.2, blur: 0.6, slice: 0.3, wipe: 0.3, stretch: 0.3, assemble: 0.3 },
  plan(rng, cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['display', 'body'])), style: rng.pick(['light', 'light', 'dark']), stagger: rng.chance(0.6),
      accent: rng.int(0, 20), legend: rng.chance(0.7), plate: rng.chance(0.45),
    };
  },
  render(env) {
    const { W, H, sc, ctx } = env, cut = env.cut, Pm = cut.params, s = cut.seed, M = Math.min(W, H), lt = env.lt;
    const chs = slotsOf(cut.text), n = chs.length;
    if (!n) return null;
    const port = W < H;
    const { cells, k, rows } = cellRows(chs, W, H, port ? 4 : (n > 8 ? 5 : 10), 1.06, M * 0.26, 0.16, Pm.stagger);
    const lightC = J.lum(sc.fg) > J.lum(sc.bg) ? sc.fg : sc.bg, darkC = lightC === sc.fg ? sc.bg : sc.fg;
    const d = k * 0.15, rr = k * 0.16;
    const out = outK(env);
    const gap = J.clamp(cut.dur * 0.38 / n, 0.05, 0.13);
    const acc = n > 2 ? Pm.accent % n : -1;
    let bb = null;
    if (Pm.plate) {
      const e = inE(env, 0.35) * out;
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
      for (const c of cells) { x0 = Math.min(x0, c.x - k / 2); x1 = Math.max(x1, c.x + k / 2); y0 = Math.min(y0, c.y - k / 2); y1 = Math.max(y1, c.y + k / 2 + d); }
      const p = k * 0.22;
      env.rrect(x0 - p, y0 - p, x1 - x0 + p * 2, (y1 - y0 + p * 2) * e, rr * 1.4, J.mix(sc.bg, darkC === sc.bg ? lightC : darkC, 0.1), 1, false, sc.sub, 1);
    }
    for (const c of cells) {
      if (c.ch === ' ') continue;
      const ti = 0.14 + c.i * gap;
      const q = E.outBack(J.clamp((lt - c.i * 0.025) / 0.2), 1.6);
      if (q <= 0 || out <= 0) continue;
      const gh = gIn(env);
      // press: first when typed, then an occasional re-press
      let pr = 0;
      const press = (t) => (t < 0 ? 0 : t < 0.05 ? t / 0.05 : t < 0.09 ? 1 : t < 0.22 ? 1 - (t - 0.09) / 0.13 : 0);
      pr = press(lt - ti);
      const re = lt - (0.14 + n * gap + 0.3);
      if (re > 0) {
        if (env.beat && env.beat.len > 0.2) { if (J.h(s, env.beat.index, 3) % n === c.i) pr = Math.max(pr, press(env.beat.since)); }
        else { const P0 = 0.55, kk = Math.floor(re / P0); if (J.h(s, kk, 3) % n === c.i) pr = Math.max(pr, press(re - kk * P0)); }
      }
      const isA = c.i === acc;
      let top, side, leg;
      if (isA) { top = plateCol(sc, [sc.accent, sc.ink]); side = J.mix(top, darkC, 0.4); leg = onCol(sc, top); }
      else if (Pm.style === 'light') { top = lightC; side = J.mix(lightC, darkC, 0.32); leg = darkC; }
      else { top = J.mix(darkC, lightC, 0.16); side = J.mix(darkC, lightC, 0.06); leg = lightC; }
      ctx.save(); ctx.translate(c.x, c.y); ctx.scale(q, q);
      const dy = pr * d * 0.75;
      env.rrect(-k / 2, -k / 2 + d * 0.35, k, k + d * 0.65, rr, side, out, gh);
      const ins = k * 0.09;
      env.rrect(-k / 2 + ins * 0.5, -k / 2 + dy, k - ins, k - ins * 0.9, rr * 0.85, J.mix(top, side, 0.35), out, false);
      env.rrect(-k / 2 + ins, -k / 2 + dy + ins * 0.35, k - ins * 2, k - ins * 2.1, rr * 0.7, top, out, false, Pm.style === 'dark' && !isA ? sc.sub : null, 1);
      if (Pm.legend && lt > ti) {
        const rom = J.romaji(c.ch);
        if (rom) env.draw({ text: rom.toUpperCase(), font: monoF(env), size: k * 0.13, align: 'left', x: -k / 2 + ins * 1.9, y: -k / 2 + dy + ins * 1.7, color: leg, alpha: 0.7 * out, ghost: false });
      }
      ctx.restore();
      const it = { text: c.ch, font: Pm.font, size: k * 0.52, x: c.x, y: c.y - k * 0.03 + dy * q, color: leg, noHold: plateHold(env), mi: miAt(env, ti) };
      if (q < 1) { it.size *= q; it.x = c.x; it.y = c.y + (it.y - c.y) * q; }
      bb = U(bb, J.mainDraw(env, it));
    }
    return bb;
  },
}, P);

/* ================================================================== 12 bubbles — 泡 */
J.register('layout', 'bubbles', {
  name: '泡', tags: ['pop', 'calm'], w: 0.8, treat: 'safe', fits: n => n >= 1 && n <= 12,
  enterBias: { pop: 1.6, cut: 1.5, blur: 1.2, slice: 0.3, wipe: 0.3, stretch: 0.3 },
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display', 'body'])), style: rng.pick(['soap', 'soap', 'solid', 'mixed']), rise: rng.range(0.018, 0.035), wob: rng.range(0.6, 1.2), motes: rng.chance(0.75) };
  },
  render(env) {
    const { W, H, sc, ctx } = env, cut = env.cut, Pm = cut.params, s = cut.seed, M = Math.min(W, H), lt = env.lt;
    const chs = slotsOf(cut.text), n = chs.length;
    if (!n) return null;
    const port = W < H;
    const { cells, k } = cellRows(chs, W, H, port ? 4 : 7, 1.1, M * 0.3, 0.12, true);
    const out = outK(env), popK = 1 + 0.35 * E.outCubic(env.pOut);
    const lift = -H * Pm.rise * env.ltb;
    // background motes rising
    if (Pm.motes) {
      for (let m = 0; m < 14; m++) {
        const sp = J.rr(0.05, 0.12, s, m, 1) * H, per = H * 1.2 / sp;
        const t = (env.ltb + J.r(s, m, 2) * per) % per;
        const y = H * 1.08 - t * sp, x = J.rr(0.04, 0.96, s, m, 3) * W + Math.sin(env.ltb * 1.7 + m) * M * 0.012;
        const r = J.rr(0.006, 0.02, s, m, 4) * M;
        env.circle(x, y, r, null, sc.sub, Math.max(1, r * 0.12), 0.45 * out * inE(env, 0.5), false);
      }
    }
    let bb = null;
    for (const c of cells) {
      if (c.ch === ' ') continue;
      const kind = J.isKanji(c.ch) ? 1 : J.isSmallKana(c.ch) || J.isPunct(c.ch) ? 0.7 : 0.86;
      const R = k * 0.5 * kind * (0.94 + 0.12 * J.r(s, c.i, 5));
      const t0 = 0.04 + c.i * 0.05 + J.r(s, c.i, 6) * 0.08;
      const q0 = J.clamp((lt - t0) / 0.3);
      if (q0 <= 0) continue;
      const q = E.outBack(q0, 2.2);
      const ph = J.r(s, c.i, 7) * J.TAU;
      const x = c.x + Math.sin(env.ltb * 1.6 * Pm.wob + ph) * R * 0.1 + J.rs(s, c.i, 8) * k * 0.1;
      const y = c.y + lift * (0.7 + 0.6 * J.r(s, c.i, 9)) + Math.cos(env.ltb * 1.2 + ph) * R * 0.06 + J.rs(s, c.i, 10) * k * 0.14;
      const solid = Pm.style === 'solid' || (Pm.style === 'mixed' && J.r(s, c.i, 11) < 0.4);
      const Rr = R * q * popK;
      let tc = sc.fg;
      if (solid) {
        const f = c.i % 3 === 1 ? plateCol(sc, [sc.accent, sc.ink]) : plateCol(sc, [sc.ink, sc.accent]);
        env.circle(x, y, Rr, f, null, 0, out, gIn(env));
        tc = onCol(sc, f);
      } else {
        env.circle(x, y, Rr, sc.fg, null, 0, 0.07 * out, false);
        env.circle(x, y, Rr, null, sc.fg, Math.max(1.2, R * 0.035), 0.85 * out, gIn(env));
        env.arc(x, y, Rr * 0.78, 200, 245, sc.fg, Math.max(1.5, R * 0.07), 0.9 * out, false);
        env.circle(x + Rr * 0.52, y - Rr * 0.52, Math.max(1.5, R * 0.05), sc.fg, null, 0, 0.9 * out, false);
      }
      bb = U(bb, J.mainDraw(env, { text: c.ch, font: Pm.font, size: R * 1.05 * Math.min(1, q), x, y, color: tc, noHold: plateHold(env), mi: miAt(env, t0) }));
    }
    return bb;
  },
}, P);

/* ================================================================== 13 slotMachine — スロット */
J.register('layout', 'slotMachine', {
  name: 'スロット', tags: ['pop', 'glitch'], w: 0.6, treat: 'safe', fits: n => n >= 1 && n <= 10,
  enterBias: { cut: 3, flicker: 0.6, blur: 0.5, slice: 0.2, wipe: 0.2, assemble: 0.2, type: 0.2 },
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display'])), style: rng.pick(['cabinet', 'window', 'cabinet']), v: rng.range(13, 18), line: rng.chance(0.7) };
  },
  render(env) {
    const { W, H, sc, ctx } = env, cut = env.cut, Pm = cut.params, s = cut.seed, M = Math.min(W, H), lt = env.lt;
    const chs = slotsOf(cut.text), n = chs.length;
    if (!n) return null;
    const port = W < H;
    const { cells, k } = cellRows(chs, W, H, port ? 5 : 10, 1.34, M * 0.24, 0.1);
    const w = k, h = k * 1.34, step = k * 0.92, gsz = k * 0.7;
    const pool = poolOf(cut), NP = pool.length;
    const out = outK(env), inA = inE(env, 0.25);
    const gap = J.clamp(cut.dur * 0.3 / n, 0.08, 0.2);
    const t1 = J.clamp(cut.dur * 0.16, 0.2, 0.45);
    const cab = Pm.style === 'cabinet';
    const panel = plateCol(sc, [sc.ink, sc.fg]);
    const winC = cab ? onCol(sc, panel) === sc.bg ? sc.bg : J.mix(sc.bg, sc.fg, 0.06) : sc.bg;
    const glyC = J.contrast(sc.fg, winC) > 2.5 ? sc.fg : onCol(sc, winC);
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const c of cells) { x0 = Math.min(x0, c.x - w / 2); x1 = Math.max(x1, c.x + w / 2); y0 = Math.min(y0, c.y - h / 2); y1 = Math.max(y1, c.y + h / 2); }
    if (cab) { const p = k * 0.22; env.rrect(x0 - p, y0 - p, x1 - x0 + p * 2, y1 - y0 + p * 2, p * 1.2, panel, out * inA, gIn(env)); }
    let bb = null;
    for (const c of cells) {
      if (c.ch === ' ') continue;
      const ts = t1 + c.i * gap;
      const tau = ts - lt;
      const FIN = 1000;
      let p = tau > 0 ? FIN - Pm.v * tau : FIN + 0.22 * Math.sin(-tau * 30) * Math.exp(tau / 0.08);
      const wx = c.x - w / 2, wy = c.y - h / 2;
      env.rect(wx, wy, w, h * inA, winC, out, false);
      ctx.save(); ctx.beginPath(); ctx.rect(wx, wy, w, h); ctx.clip();
      const fast = tau > 0.05;
      const j0 = Math.floor(p) - 1, j1 = Math.ceil(p) + 1;
      for (let j = j0; j <= j1; j++) {
        const y = c.y + (j - p) * step;
        if (j === FIN && tau <= 0) continue;
        const ch = j === FIN ? c.ch : pool[J.h(s, c.i, j) % NP];
        if (fast) {                   // cheap motion blur: the same (cached) glyph smeared along the reel
          for (const o of [-0.16, 0.16]) env.draw({ text: ch, font: Pm.font, size: gsz, x: c.x, y: y + o * step, color: glyC, alpha: 0.22 * out, ghost: false });
          env.draw({ text: ch, font: Pm.font, size: gsz, x: c.x, y, color: glyC, alpha: 0.5 * out, ghost: false });
        } else env.draw({ text: ch, font: Pm.font, size: gsz, x: c.x, y, color: glyC, alpha: 0.9 * out, ghost: false });
      }
      if (tau <= 0) bb = U(bb, J.mainDraw(env, { text: c.ch, font: Pm.font, size: gsz, x: c.x, y: c.y + (FIN - p) * step, color: glyC, noHold: plateHold(env), mi: miAt(env, ts) }));
      ctx.restore();
      if (env.pass === 'main') {       // cylinder shading
        const g = ctx.createLinearGradient(0, wy, 0, wy + h);
        g.addColorStop(0, J.rgba(winC, 0.95)); g.addColorStop(0.3, J.rgba(winC, 0)); g.addColorStop(0.7, J.rgba(winC, 0)); g.addColorStop(1, J.rgba(winC, 0.95));
        ctx.save(); ctx.globalAlpha = out; ctx.fillStyle = g; ctx.fillRect(wx, wy, w, h); ctx.restore();
      }
      env.rrect(wx, wy, w, h, k * 0.06, null, out * inA, false, cab ? J.mix(panel, winC, 0.5) : sc.fg, Math.max(1.5, k * 0.02));
    }
    if (Pm.line) {
      const rowsY = [...new Set(cells.map(c => c.y))];
      for (const y of rowsY) {
        const tri = k * 0.1, xa = x0 - k * 0.12, xb = x1 + k * 0.12;
        env.line([[xa, y], [J.lerp(xa, xb, inA), y]], sc.accent, Math.max(1.2, k * 0.012), 0.7 * out, false);
        env.poly([[xa - tri * 1.6, y - tri], [xa, y], [xa - tri * 1.6, y + tri]], sc.accent, out * inA, false);
        env.poly([[xb + tri * 1.6, y - tri], [xb, y], [xb + tri * 1.6, y + tri]], sc.accent, out * inA, false);
      }
    }
    return bb || bbRect(x0, y0, x1, y1);
  },
}, P);

/* ================================================================== 14 flipBoard — パタパタ */
J.register('layout', 'flipBoard', {
  name: 'パタパタ', tags: ['graphic', 'editorial'], w: 0.7, treat: 'safe', fits: n => n >= 1 && n <= 12,
  enterBias: { cut: 3, flicker: 0.5, blur: 0.4, slice: 0.2, wipe: 0.3, assemble: 0.2, type: 0.3 },
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display', 'body'])), header: rng.chance(0.65), flips: rng.int(3, 5), style: rng.pick(['ink', 'ink', 'fg']) };
  },
  render(env) {
    const { W, H, sc, ctx } = env, cut = env.cut, Pm = cut.params, s = cut.seed, M = Math.min(W, H), lt = env.lt;
    const chs = [...String(cut.text).trim()].filter(c => c !== '　'), n = chs.length;
    if (!n) return null;
    const port = W < H;
    const { cells, k, rows } = cellRows(chs, W, H, port ? 5 : 12, 1.32, M * 0.24, 0.08);
    const w = k, h = k * 1.32, gsz = k * 0.78;
    const panel = plateCol(sc, Pm.style === 'fg' ? [sc.fg, sc.ink] : [sc.ink, sc.fg]);
    const flap = J.mix(panel, sc.bg, 0.08), gc = onCol(sc, panel);
    const pool = poolOf(cut), NP = pool.length;
    const fd = 0.065, t0 = 0.06;
    const out = outK(env), inA = inE(env, 0.2);
    const lw = Math.max(1.5, k * 0.018);
    let bb = null;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9;
    for (const c of cells) {
      x0 = Math.min(x0, c.x - w / 2); x1 = Math.max(x1, c.x + w / 2); y0 = Math.min(y0, c.y - h / 2);
      const q = E.outCubic(J.clamp((lt - c.i * 0.02) / 0.18)) * out;
      if (q <= 0) continue;
      const wx = c.x - w / 2, wy = c.y - h / 2;
      env.rrect(wx, wy, w, h, k * 0.07, panel, q, gIn(env));
      const F = Pm.flips + c.i % 3 + Math.floor(c.i * 0.7);
      const settle = t0 + F * fd;
      const space = c.ch === ' ';
      const chAt = (m) => (m <= 0 ? '' : m >= F ? c.ch : pool[J.h(s, c.i, m) % NP]);
      const u = (lt - t0) / fd;
      const g = { font: Pm.font, size: gsz, x: c.x, y: c.y, color: gc, ghost: false, alpha: q };
      const half = (ch, top, sy) => { if (!ch || ch === ' ' || sy <= 0.01) return; env.draw(Object.assign({}, g, { text: ch, charFn: () => ({ clipY: top ? [-0.75, 0] : [0, 0.75], sy }) })); };
      if (lt >= settle) {
        if (!space) bb = U(bb, J.mainDraw(env, { text: c.ch, font: Pm.font, size: gsz, x: c.x, y: c.y, color: gc, alpha: q, noHold: plateHold(env), mi: miAt(env, settle) }));
      } else if (u > 0) {
        const m = Math.floor(u), f = u - m;
        const A = chAt(m), B = chAt(m + 1);
        half(B, true, 1); half(A, false, 1);
        // the falling flap
        const sy = Math.round(Math.abs(Math.cos(f * Math.PI)) * 6) / 6;     // quantised so the squashed glyphs stay cached
        ctx.save();
        if (f < 0.5) { env.rect(wx, c.y - h / 2 * sy, w, h / 2 * sy, flap, q, false); half(A, true, sy); env.rect(wx, c.y - h / 2 * sy, w, h / 2 * sy, sc.bg, q * f * 0.5, false); }
        else { env.rect(wx, c.y, w, h / 2 * sy, flap, q, false); half(B, false, sy); env.rect(wx, c.y, w, h / 2 * sy, sc.bg, q * (1 - f) * 0.5, false); }
        ctx.restore();
      }
      env.rect(wx, c.y - lw / 2, w, lw, sc.bg, q, false);
      env.rect(wx - lw * 0.6, c.y - h * 0.07, lw * 1.2, h * 0.14, J.mix(panel, sc.bg, 0.5), q, false);
      env.rect(wx + w - lw * 0.6, c.y - h * 0.07, lw * 1.2, h * 0.14, J.mix(panel, sc.bg, 0.5), q, false);
    }
    if (Pm.header) {
      const fs = J.clamp(k * 0.2, 12, 30);
      const lab = `LINE ${String((cut.line | 0) + 1).padStart(2, '0')}`, tm = J.fmtTime(cut.start);
      const a = inA * out;
      env.draw({ text: lab, font: monoF(env), size: fs, track: 0.2, align: 'left', x: x0, y: y0 - fs * 1.4, color: sc.sub, alpha: a, ghost: false });
      env.draw({ text: tm, font: monoF(env), size: fs, track: 0.2, align: 'right', x: x1, y: y0 - fs * 1.4, color: sc.accent, alpha: a, ghost: false });
    }
    return bb;
  },
}, P);

/* ================================================================== 15 credits — エンドロール */
J.register('layout', 'credits', {
  name: 'エンドロール', tags: ['calm', 'editorial', 'emotional'], w: 1, fits: n => n >= 1 && n <= 16,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['serif', 'display'])), fc: rng.pick(fontsOf(st, ['serif', 'body'])), variant: rng.pick(['center', 'center', 'side', 'single']), speed: rng.range(0.035, 0.06), off: rng.range(0, 10) };
  },
  render(env) {
    const { W, H, sc } = env, cut = env.cut, Pm = cut.params, s = cut.seed, M = Math.min(W, H);
    const port = W < H;
    const variant = port && Pm.variant === 'side' ? 'center' : Pm.variant;
    const side = variant === 'side';
    const mt = mainLines(cut.text, W, H, side ? 6 : 10, 5);
    const size = Math.min(J.fitSize(mt, Pm.font, side ? W * 0.44 : W * 0.72, H * 0.26, { track: 0.06, lead: 1.2 }), H * 0.16);
    const mx = side ? W * 0.3 : W / 2;
    // credit rows
    const txt = clean(cut.text), rom = romaOf(txt);
    const vals = [], seen = new Set();
    const add = (r, v) => { v = String(v || '').trim(); if (v && !seen.has(v)) { seen.add(v); vals.push([r, v]); } };
    const line = cut.lineText || cut.text;
    add('詞', line);
    J.chunkText(line).forEach((c, i) => add(i === 0 ? '語' : '', c));
    (J.segments(line) || []).forEach(g => { if (J.glyphCount(g) >= 2) add('', g); });
    if (rom) add('READING', rom);
    if (cut.note) add('NOTE', cut.note);
    add('LINE', String((cut.line | 0) + 1).padStart(2, '0'));
    add('TIME', J.fmtTime(cut.start));
    const fs = J.clamp(M * 0.026, 14, 36), rowH = fs * 2.3, block = vals.length * rowH + rowH * 2;
    const scroll = (env.ltb + Pm.off) * Pm.speed * H;
    const a0 = inE(env, 0.6) * outK(env);
    const cx = side ? W * 0.74 : W / 2;
    const bandH = side ? 0 : size * mt.split('\n').length * 1.25 / 2 + fs * 2.2;
    const lw = Math.max(1, M * 0.0012);
    for (let y = H * 1.05 - (scroll % block) - block * Math.ceil(H * 1.1 / block), rep = 0; y < H * 1.05 && rep < 12; y += block, rep++) {
      vals.forEach(([r, v], i) => {
        const yy = y + i * rowH;
        if (yy < -rowH || yy > H + rowH) return;
        const edge = J.smooth(H * 0.02, H * 0.14, yy) * J.smooth(H * 0.98, H * 0.86, yy);
        const band = side ? 1 : J.smooth(bandH, bandH + fs * 2, Math.abs(yy - H / 2));
        const a = a0 * edge * band;
        if (a < 0.01) return;
        if (variant === 'single') {
          if (r) env.draw({ text: r, font: monoF(env), size: fs * 0.62, track: 0.3, x: cx, y: yy - fs * 0.95, color: sc.sub, alpha: a * 0.8, ghost: false });
          env.draw({ text: v, font: Pm.fc, size: fs, track: 0.12, x: cx, y: yy, color: sc.fg, alpha: a * 0.85, ghost: false });
        } else {
          const g = fs * 0.9;
          if (r) env.draw({ text: r, font: /[A-Z]/.test(r) ? monoF(env) : Pm.fc, size: fs * 0.72, track: 0.25, align: 'right', x: cx - g, y: yy, color: sc.sub, alpha: a * 0.85, ghost: false });
          env.draw({ text: v, font: Pm.fc, size: fs, track: 0.1, align: 'left', x: cx + g, y: yy, color: sc.fg, alpha: a * 0.85, ghost: false });
        }
      });
    }
    if (side) env.line([[W * 0.52, H * 0.2], [W * 0.52, H * 0.2 + H * 0.6 * inE(env, 0.8)]], sc.sub, lw, 0.5 * outK(env), false);
    return J.mainDraw(env, { text: mt, font: Pm.font, size, x: mx, y: H / 2, track: 0.06, lead: 1.2, color: sc.fg });
  },
}, P);

/* ================================================================== 16 zoomRepeat — 連続拡大 */
J.register('layout', 'zoomRepeat', {
  name: '連続拡大', tags: ['glitch', 'emotional', 'graphic'], w: 0.9, emph: 1.5, busy: true, fits: n => n >= 1 && n <= 12,
  plan(rng, cut, st) {
    return {
      font: rng.pick(fontsOf(st, ['display', 'serif'])), dir: rng.pick([1, 1, -1]), style: rng.pick(['alt', 'alt', 'outline', 'fill']),
      twist: rng.chance(0.35) ? rng.range(3, 7) * rng.pick([1, -1]) : 0, q: rng.range(1.38, 1.6), speed: rng.range(0.35, 0.6),
    };
  },
  render(env) {
    const { W, H, sc } = env, cut = env.cut, Pm = cut.params, M = Math.min(W, H);
    const mt = mainLines(cut.text, W, H, 9, 5);
    const size = Math.min(J.fitSize(mt, Pm.font, W * 0.64, H * 0.3, { track: 0.03, lead: 1.1 }), H * 0.2);
    const mm = J.measure({ text: mt, font: Pm.font, size, track: 0.03, lead: 1.1 });
    const q = Pm.q, Lmax = Math.log(Math.max(W / mm.w, H / mm.h) * 2.6) / Math.log(q);
    const e = inE(env, 0.5), out = outK(env);
    const ph0 = env.ltb * Pm.speed * Pm.dir + (1 - e) * 1.5 * Pm.dir;
    const ph = ((ph0 % 1) + 1) % 1, base = Math.floor(ph0);
    const K = Math.min(9, Math.ceil(Lmax) + 1);
    for (let k = K; k >= 0; k--) {
      const L = k + ph;
      if (L < 0.3 || L > Lmax) continue;
      const fs = size * Math.pow(q, L);
      const a = J.smooth(0.3, 0.95, L) * (1 - J.smooth(Lmax * 0.35, Lmax, L)) * e * out * 0.7;
      if (a < 0.02) continue;
      const idx = k - base;
      const outline = Pm.style === 'outline' || (Pm.style === 'alt' && ((idx % 2) + 2) % 2 === 0);
      const it = { text: mt, font: Pm.font, size: fs, x: W / 2, y: H / 2, track: 0.03, lead: 1.1, rot: Pm.twist * L, ghost: false };
      if (outline) Object.assign(it, { fill: false, stroke: Math.max(1.2, fs * 0.01), strokeColor: sc.sub, alpha: a * 0.75 });
      else Object.assign(it, { color: J.mix(sc.bg, sc.sub, 0.16), alpha: a });
      env.draw(it);
    }
    J.mainDraw(env, { text: mt, font: Pm.font, size, x: W / 2, y: H / 2, track: 0.03, lead: 1.1, fill: false, stroke: size * 0.2, strokeColor: sc.bg, ghost: false, plain: true });
    return J.mainDraw(env, { text: mt, font: Pm.font, size, x: W / 2, y: H / 2, track: 0.03, lead: 1.1, color: sc.fg });
  },
}, P);

/* ================================================================== 17 splitHalves — 上下割り */
J.register('layout', 'splitHalves', {
  name: '上下割り', tags: ['graphic', 'glitch', 'editorial'], w: 1, emph: 1.2, fits: n => n >= 1 && n <= 14,
  enterBias: { cut: 1.8, slice: 0.3, wipe: 0.6 },
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display', 'serif'])), variant: rng.pick(['slide', 'slide', 'shear', 'duo']), dir: rng.pick([1, -1]), line: rng.pick(['full', 'short']), gap: rng.pick([0.07, 0.1, 0.13]) };
  },
  render(env) {
    const { W, H, sc, ctx } = env, cut = env.cut, Pm = cut.params, M = Math.min(W, H), lt = env.lt;
    const mt = mainLines(cut.text, W, H, 11, 5);
    const lines = mt.split('\n');
    const size = Math.min(J.fitSize(mt, Pm.font, W * 0.84, H * 0.5, { track: 0.04, lead: 1.3 }), H * 0.24);
    const lead = size * 1.3 + (Pm.gap * size);
    const D = W * 0.32;
    const e = E.outExpo(J.clamp((lt - 0.04) / 0.7));
    const ex = E.inExpo(env.pOut);
    const lw = Math.max(1.5, size * 0.016);
    let bb = null;
    lines.forEach((ln, li) => {
      const y = H / 2 + (li - (lines.length - 1) / 2) * lead;
      const m = J.measure({ text: ln, font: Pm.font, size, track: 0.04 });
      const dirL = Pm.dir * (li % 2 ? -1 : 1);
      let off = D * (1 - e) + (Pm.variant === 'shear' ? size * 0.14 * e * (1 + 0.25 * Math.sin(env.ltb * 1.7)) : 0) + W * 0.4 * ex;
      const g = Pm.gap * size / 2;
      [0, 1].forEach(h => {
        const dx = (h ? -1 : 1) * off * dirL;
        ctx.save(); ctx.beginPath();
        if (h === 0) ctx.rect(-W, y - size * 2 - g, W * 3, size * 2); else ctx.rect(-W, y + g, W * 3, size * 2);
        ctx.clip();
        const it = { text: ln, font: Pm.font, size, x: W / 2 + dx, y: y + (h ? g : -g), track: 0.04, color: sc.fg, mi: li * 2 + h };
        if (Pm.variant === 'duo' && h) Object.assign(it, { color: sc.accent });
        const r = J.mainDraw(env, it);
        ctx.restore();
        if (r) bb = U(bb, r);
      });
      // the cut line
      const le = E.outExpo(J.clamp((lt - 0.1) / 0.6)) * (1 - E.inCubic(env.pOut));
      if (le > 0) {
        const half = Pm.line === 'full' ? W * 0.5 : m.w / 2 + size * 0.7;
        env.line([[W / 2 - half * le, y], [W / 2 + half * le, y]], sc.accent, lw, 1, true);
        if (Pm.line === 'short') { env.circle(W / 2 - half * le, y, lw * 1.6, sc.accent, null, 0, 1, false); env.circle(W / 2 + half * le, y, lw * 1.6, sc.accent, null, 0, 1, false); }
      }
    });
    return bb;
  },
}, P);

/* ================================================================== 18 columnsBig — 大小縦組 */
J.register('layout', 'columnsBig', {
  name: '大小縦組', tags: ['editorial', 'calm', 'emotional'], w: 1, portrait: 1.4, fits: n => n >= 1 && n <= 10,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display', 'serif'])), fs: rng.pick(fontsOf(st, ['serif', 'body'])), side: rng.pick(['left', 'left', 'right']), rule: rng.chance(0.7), mark: rng.pick(['bar', 'dot', 'none']), off: rng.range(-0.05, 0.05) };
  },
  render(env) {
    const { W, H, sc } = env, cut = env.cut, Pm = cut.params, M = Math.min(W, H), lt = env.lt;
    const port = W < H;
    const txt = String(cut.text).trim().replace(/[\s\u3000]+/g, ' '), n = J.glyphCount(txt);
    const size = Math.min(J.fitSize(txt, Pm.font, port ? W * 0.44 : W * 0.3, H * 0.84, { vertical: true, track: 0.02 }), H * 0.42);
    const colH = J.measure({ text: txt, font: Pm.font, size, vertical: true, track: 0.02 }).h;
    const left = Pm.side === 'left';           // annotation columns on the left (read after the big column)
    const hx = W * (port ? (left ? 0.62 : 0.38) : (left ? 0.58 : 0.4)) + Pm.off * W;
    const top = H / 2 - colH / 2;
    const bb = J.mainDraw(env, { text: txt, font: Pm.font, size, x: hx, y: H / 2, vertical: true, track: 0.02, color: sc.fg });
    const fs = J.clamp(M * 0.031, 14, 44);
    const perCol = Math.max(4, Math.floor(colH * 0.92 / (fs * 1.08)));
    const line = String(cut.lineText || cut.text).replace(/\s+/g, '');
    const lineT = splitL(line, perCol);
    const rom = romaOf(txt);
    const sub2 = rom ? rom : cut.note ? String(cut.note) : `No.${String((cut.line | 0) + 1).padStart(2, '0')} ${J.fmtTime(cut.start)}`;
    const sgn = left ? -1 : 1;
    const gap = size * 0.5 + fs * 1.9;
    const x1 = hx + sgn * gap;
    const nL = lineT.split('\n').length;
    const x2 = x1 + sgn * (nL * fs * 1.7 + fs * 0.6);
    const reveal = (t0, cnt) => { const k = Math.floor(J.clamp((lt - t0) / 0.7) * (cnt + 0.99)); return (i) => (i >= k ? { hide: true } : null); };
    const out = outK(env);
    const c1 = J.glyphCount(lineT);
    // column block: multi-line vertical text grows right→left from its first column
    env.draw({ text: lineT, font: Pm.fs, size: fs, vertical: true, align: 'left', lead: 1.7, track: 0.06, x: x1 + sgn * (nL - 1) * fs * 0.85, y: top, color: sc.fg, alpha: 0.9 * out, ghost: false, charFn: reveal(0.18, c1) });
    env.draw({ text: sub2, font: rom ? monoF(env) : Pm.fs, size: fs * 0.72, vertical: true, align: 'left', track: 0.18, x: x2, y: top, color: sc.sub, alpha: 0.9 * out, ghost: false, charFn: reveal(0.35, J.glyphCount(sub2) + 2) });
    const lw = Math.max(1, M * 0.0014);
    if (Pm.rule) {
      const rx = hx + sgn * (size * 0.5 + fs * 0.85);
      env.line([[rx, top], [rx, top + colH * E.outCubic(J.clamp((lt - 0.1) / 0.6))]], sc.sub, lw, 0.7 * out, false);
    }
    if (Pm.mark !== 'none') {
      const q = E.outBack(J.clamp((lt - 0.15) / 0.3), 2) * out;
      if (Pm.mark === 'bar') env.rect(hx - size * 0.5, top - size * 0.28, size * q, Math.max(3, size * 0.06), sc.accent, 1, true);
      else env.circle(hx + (size * 0.5 + fs * 0.85) * sgn, top - fs * 0.9, fs * 0.28 * q, sc.accent, null, 0, 1, true);
    }
    return bb;
  },
}, P);

/* ================================================================== 19 circleWords — 同心円 */
J.register('layout', 'circleWords', {
  name: '同心円', tags: ['graphic', 'calm', 'editorial'], w: 1, fits: n => n >= 1 && n <= 14,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display', 'serif'])), fr: rng.pick(fontsOf(st, ['body', 'serif'])), rings: rng.pick([2, 3, 3]), speed: rng.range(7, 13), dir: rng.pick([1, -1]), ticks: rng.chance(0.6), guides: rng.chance(0.7) };
  },
  render(env) {
    const { W, H, sc } = env, cut = env.cut, Pm = cut.params, s = cut.seed, M = Math.min(W, H), lt = env.lt;
    const cx = W / 2, cy = H / 2;
    const Rmax = Math.min(W, H) * 0.46;
    const gapR = M * 0.072;
    const R0 = Rmax - gapR * (Pm.rings - 1);
    const txt = String(cut.text).trim().replace(/[\s\u3000]+/g, ' '), n = J.glyphCount(txt);
    const mt = n <= 4 ? txt : splitL(txt, Math.ceil(n / Math.ceil(n / 5)));
    const size = Math.min(J.fitSize(mt, Pm.font, R0 * 1.45, R0 * 1.05, { track: 0.03, lead: 1.1 }), R0 * 0.55);
    const rom = romaOf(txt);
    const units = [
      String(cut.lineText || cut.text).replace(/\s+/g, ' ').trim() + '　✦　',
      (rom || (cut.words || []).join(' / ') || txt) + '  —  ',
      clean(txt) + '・',
    ];
    const out = outK(env);
    const lw = Math.max(1, M * 0.0014);
    for (let k = 0; k < Pm.rings; k++) {
      const e = E.outExpo(J.clamp((lt - k * 0.08) / 0.7));
      if (e <= 0) continue;
      const R = (R0 + k * gapR) * (0.9 + 0.1 * e);
      const f = J.clamp(gapR * 0.46 * (k === 1 ? 0.8 : 1), 10, 52);
      const font = k === 1 && rom ? monoF(env) : Pm.fr;
      const unit = [...units[k % units.length]];
      let uAdv = 0; for (const ch of unit) uAdv += J.metrics.adv(font, ch) * f * 1.08;
      const reps = Math.max(1, Math.min(12, Math.round(J.TAU * R / Math.max(1, uAdv))));
      const chars = []; for (let r = 0; r < reps; r++) chars.push(...unit);
      if (chars.length > 160) chars.length = 160;
      const tot = chars.reduce((a, ch) => a + J.metrics.adv(font, ch) * f * 1.08, 0);
      const kk = J.TAU * R / Math.max(1, tot);
      const a0 = (env.ltb * Pm.speed * (k % 2 ? -1 : 1) * Pm.dir + J.r(s, k, 3) * 360) * J.DEG;
      let acc = 0;
      const pos = chars.map(ch => { const ad = J.metrics.adv(font, ch) * f * 1.08 * kk; const a = a0 + (acc + ad / 2) / R; acc += ad; return a; });
      const col = k === 0 ? sc.fg : sc.sub;
      pathText(env, chars, font, f, (i) => { const a = pos[i]; return { x: cx + Math.sin(a) * R, y: cy - Math.cos(a) * R, rot: a / J.DEG, a: 0.9 * e * out, color: chars[i] === '✦' ? sc.accent : col }; });
      if (Pm.guides) env.circle(cx, cy, R + gapR * 0.5, null, sc.sub, lw, 0.35 * e * out, false);
      if (k === 0 && Pm.guides) env.circle(cx, cy, R - gapR * 0.5, null, sc.sub, lw, 0.35 * e * out, false);
    }
    if (Pm.ticks) {
      const Rt = R0 + (Pm.rings - 1) * gapR + gapR * 0.5;
      const e = inE(env, 0.9) * out, m = 72;
      for (let i = 0; i < m; i++) {
        if (i / m > e) break;
        const a = (i / m * 360 - env.ltb * Pm.speed * 0.5 * Pm.dir) * J.DEG, L = i % 6 === 0 ? gapR * 0.3 : gapR * 0.14;
        env.line([[cx + Math.sin(a) * Rt, cy - Math.cos(a) * Rt], [cx + Math.sin(a) * (Rt + L), cy - Math.cos(a) * (Rt + L)]], i % 18 === 0 ? sc.accent : sc.sub, lw, 0.6, false);
      }
    }
    return J.mainDraw(env, { text: mt, font: Pm.font, size, x: cx, y: cy, track: 0.03, lead: 1.1, color: sc.fg });
  },
}, P);

/* ================================================================== 20 dotMatrix — ドット表示 */
const _dm = new Map(), _dmGrid = new Map();
let _dmCv = null;
/* the unlit LED grid: one cached dot tile per colour/shape, laid down as a pattern aligned to the grid */
const dotTile = (col, shape) => {
  const key = col + '|' + shape;
  let t = _dmGrid.get(key);
  if (t) return t;
  const T = 64, cv = document.createElement('canvas'); cv.width = cv.height = T;
  const x = cv.getContext('2d'); x.fillStyle = col; x.beginPath();
  const rr = T * (shape === 'round' ? 0.38 : 0.4);
  if (shape === 'round') x.arc(T / 2, T / 2, rr, 0, J.TAU); else x.rect(T / 2 - rr, T / 2 - rr, rr * 2, rr * 2);
  x.fill();
  if (_dmGrid.size > 24) _dmGrid.clear();
  t = { cv, T }; _dmGrid.set(key, t);
  return t;
};
const dotSample = (mt, font, D, lead) => {
  const key = mt + '|' + font + '|' + D + '|' + lead;
  let r = _dm.get(key);
  if (r) return r;
  const SS = 4, fpx = D * SS * 0.94;
  const lay = J.layoutText({ text: mt, font, size: fpx, lead });
  const cols = Math.ceil(lay.W / SS) + 2, rows = Math.ceil(lay.H / SS) + 2;
  const cw = cols * SS, ch = rows * SS;
  if (!_dmCv) _dmCv = document.createElement('canvas');
  const cv = _dmCv; cv.width = cw; cv.height = ch;
  const x = cv.getContext('2d', { willReadFrequently: true });
  x.clearRect(0, 0, cw, ch);
  x.font = J.fontCSS(font, fpx); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#fff';
  for (const g of lay) { if (g.ch !== ' ' && g.ch !== '　') x.fillText(g.ch, cw / 2 + g.x, ch / 2 + g.y); }
  const id = x.getImageData(0, 0, cw, ch).data;
  const lit = [];
  for (let r0 = 0; r0 < rows; r0++) for (let c0 = 0; c0 < cols; c0++) {
    let a = 0;
    for (let yy = 0; yy < SS; yy++) for (let xx = 0; xx < SS; xx++) a += id[((r0 * SS + yy) * cw + c0 * SS + xx) * 4 + 3];
    if (a / (SS * SS * 255) > 0.38) lit.push(c0, r0);
  }
  r = { cols, rows, lit, fscale: 0.94 * D, D };
  if (_dm.size > 40) _dm.clear();
  _dm.set(key, r);
  return r;
};
J.register('layout', 'dotMatrix', {
  name: 'ドット表示', tags: ['graphic', 'glitch', 'pop'], w: 0.7, treat: false, fits: n => n >= 1 && n <= 12,
  enterBias: { cut: 2.5, flicker: 1.6, scramble: 0.2, assemble: 0.2, type: 1.2 },
  plan(rng, cut, st) {
    return { font: rng.pick(['dot', 'gothic_black', 'dot']), reveal: rng.pick(['sweep', 'sweep', 'scroll', 'random']), panel: rng.chance(0.7), col: rng.pick(['accent', 'accent', 'fg']), shape: rng.pick(['round', 'round', 'square']) };
  },
  render(env) {
    const { W, H, sc, ctx } = env, cut = env.cut, Pm = cut.params, s = cut.seed, M = Math.min(W, H), lt = env.lt;
    const mt = mainLines(cut.text, W, H, 8, 4);
    const lines = mt.split('\n'), maxL = Math.max(...lines.map(l => J.glyphCount(l) || 1));
    const D = J.clamp(Math.floor(W * 0.86 / (maxL * M * 0.011)), 10, 16);
    const lead = 1.3;
    const smp = dotSample(mt, Pm.font, D, lead);
    const p = Math.min(W * 0.88 / smp.cols, H * 0.62 / smp.rows);
    const gw = smp.cols * p, gh = smp.rows * p, gx = W / 2 - gw / 2, gy = H / 2 - gh / 2;
    const dark = J.lum(sc.bg) < 0.45;
    const panel = Pm.panel ? (dark ? J.mix(sc.bg, sc.fg, 0.05) : (J.lum(sc.fg) < J.lum(sc.ink) ? sc.fg : sc.ink)) : sc.bg;
    const litC = [Pm.col === 'accent' ? sc.accent : sc.fg, sc.accent, sc.fg, sc.accent2, sc.bg].find(c => c && J.contrast(c, panel) >= 2.5) || onCol(sc, panel);
    const offC = J.mix(panel, litC, 0.13);
    const out = outK(env), inA = inE(env, 0.3);
    const rr = p * (Pm.shape === 'round' ? 0.38 : 0.4);
    const dot = (x, y) => { if (Pm.shape === 'round') { ctx.moveTo(x + rr, y); ctx.arc(x, y, rr, 0, J.TAU); } else ctx.rect(x - rr, y - rr, rr * 2, rr * 2); };
    if (env.pass !== 'main') return null;          // the LED panel carries no chromatic ghosts (and it keeps the clip cheap)
    if (out > 0) {
      if (Pm.panel) { const pd = p * 1.2; env.rrect(gx - pd, gy - pd, gw + pd * 2, gh + pd * 2, p * 1.2, panel, inA * out, false, J.mix(panel, litC, 0.3), Math.max(1, p * 0.12)); }
      const tile = dotTile(offC, Pm.shape), fr = J.clamp(lt / 0.3);
      if (fr > 0) {
        const pat = ctx.createPattern(tile.cv, 'repeat');
        let ok = true;
        try { pat.setTransform(new DOMMatrix().translate(gx, gy).scale(p / tile.T)); } catch (e) { ok = false; }
        if (ok) { ctx.save(); ctx.globalAlpha = inA * out; ctx.fillStyle = pat; ctx.fillRect(gx, gy, gw * fr, gh); ctx.restore(); }
      }
    }
    // lit dots: the lyric drawn through a stencil of its own sampled dot pattern
    const T = J.clamp(cut.dur * 0.3, 0.25, 0.7), t0 = 0.12;
    const u = J.clamp((lt - t0) / T);
    let shift = 0;
    if (Pm.reveal === 'scroll') shift = Math.round((1 - E.outCubic(u)) * smp.cols);
    const front = Pm.reveal === 'sweep' ? u * (smp.cols + 4) - 2 : 1e9;
    const L = smp.lit;
    ctx.save(); ctx.beginPath();
    let any = false;
    for (let k = 0; k < L.length; k += 2) {
      const c = L[k] + shift, r = L[k + 1];
      if (c >= smp.cols || c > front) continue;
      if (Pm.reveal === 'random' && J.r(s, L[k], r, 7) > u * 1.05) continue;
      dot(gx + (c + 0.5) * p, gy + (r + 0.5) * p); any = true;
    }
    if (!any) ctx.rect(-10, -10, 1, 1);
    ctx.clip();
    const fsz = smp.fscale * p;
    const bb = J.mainDraw(env, { text: mt, font: Pm.font, size: fsz, x: W / 2 + shift * p, y: H / 2, lead, color: litC, stroke: p * 0.9, strokeColor: litC, strokeUnder: true, noHold: true, ghost: false, mi: miAt(env, t0) });
    ctx.restore();
    // bright scan column at the sweep front
    if (Pm.reveal === 'sweep' && u > 0 && u < 1) {
      const fc = Math.floor(front);
      ctx.save(); ctx.globalAlpha = 0.9 * out; ctx.fillStyle = sc.fg; ctx.beginPath();
      for (let k = 0; k < L.length; k += 2) if (L[k] === fc) dot(gx + (L[k] + 0.5) * p, gy + (L[k + 1] + 0.5) * p);
      ctx.fill(); ctx.restore();
    }
    return bb ? bbRect(gx, gy, gx + gw, gy + gh) : null;
  },
}, P);

/* ================================================================== 21 depthStack — 奥行き重ね */
J.register('layout', 'depthStack', {
  name: '奥行き重ね', tags: ['graphic', 'emotional', 'glitch'], w: 1, emph: 1.3, fits: n => n >= 1 && n <= 12,
  plan(rng, cut, st) {
    const a = rng.pick([-150, -120, -60, -30, 30, 60, 120, 150, -90, 90]) + rng.range(-12, 12);
    return { font: rng.pick(fontsOf(st, ['display', 'serif'])), ang: a, copies: rng.int(5, 8), dist: rng.range(0.42, 0.62), style: rng.pick(['outline', 'outline', 'dim', 'lines']), sway: rng.chance(0.7) };
  },
  render(env) {
    const { W, H, sc } = env, cut = env.cut, Pm = cut.params, M = Math.min(W, H), lt = env.lt;
    const mt = mainLines(cut.text, W, H, 9, 5);
    const size = Math.min(J.fitSize(mt, Pm.font, W * 0.66, H * 0.3, { track: 0.03, lead: 1.1 }), H * 0.2);
    const a = Pm.ang * J.DEG, dx = Math.cos(a), dy = Math.sin(a);
    const cx = W / 2 - dx * M * 0.05, cy = H / 2 - dy * M * 0.05;
    let vx = cx + dx * M * Pm.dist, vy = cy + dy * M * Pm.dist;
    if (Pm.sway) { vx += Math.sin(env.ltb * 0.7) * M * 0.05; vy += Math.cos(env.ltb * 0.55) * M * 0.035; }
    const N = Pm.copies, e = E.outCubic(J.clamp(lt / 0.7)), out = 1 - E.inCubic(env.pOut);
    const depth = e * out;
    const mm = J.measure({ text: mt, font: Pm.font, size, track: 0.03, lead: 1.1 });
    if (Pm.style === 'lines' && depth > 0.01) {
      const sN = 1 / (1 + N * 0.26 * depth);
      for (const [ox, oy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const x0 = cx + ox * mm.w / 2, y0 = cy + oy * mm.h / 2;
        const x1 = J.lerp(cx, vx, 1 - sN) + ox * mm.w / 2 * sN, y1 = J.lerp(cy, vy, 1 - sN) + oy * mm.h / 2 * sN;
        env.line([[x0, y0], [x1, y1]], sc.sub, Math.max(1, M * 0.0013), 0.5 * out, false);
      }
    }
    for (let k = N; k >= 1; k--) {
      const s1 = 1 / (1 + k * 0.26 * depth);
      if (depth <= 0.001) break;
      const x = J.lerp(cx, vx, 1 - s1), y = J.lerp(cy, vy, 1 - s1);
      const f = k / N;
      const it = { text: mt, font: Pm.font, size: size * s1, x, y, track: 0.03, lead: 1.1, ghost: false };
      if (Pm.style === 'dim') Object.assign(it, { color: J.mix(sc.bg, sc.sub, 0.55 - 0.4 * f), alpha: out });
      else Object.assign(it, { fill: false, stroke: Math.max(1, size * s1 * 0.014), strokeColor: k === 1 ? sc.accent : sc.sub, alpha: (0.85 - 0.6 * f) * out });
      env.draw(it);
    }
    return J.mainDraw(env, { text: mt, font: Pm.font, size, x: cx, y: cy, track: 0.03, lead: 1.1, color: sc.fg });
  },
}, P);

/* ================================================================== 22 typeSpecimen — 書体見本 */
const SPEC_FONTS = ['gothic_black', 'mincho', 'round', 'dot', 'brush', 'pop', 'dela', 'tokumin', 'zenkaku', 'gothic_light', 'mincho_black', 'sansui', 'mincho_light'];
J.register('layout', 'typeSpecimen', {
  name: '書体見本', tags: ['editorial', 'graphic'], w: 0.8, fits: n => n >= 1 && n <= 8,
  plan(rng, cut, st) {
    const main = rng.pick(fontsOf(st, ['display', 'serif']));
    const pool = SPEC_FONTS.filter(k => k !== main && J.FONTS[k]);
    for (let i = pool.length - 1; i > 0; i--) { const j = rng.int(0, i); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const port = cut.H > cut.W;
    return { main, fonts: pool.slice(0, 6), grid: port ? 'list' : rng.pick(['g2', 'g3', 'list']), num: rng.int(1, 30) };
  },
  render(env) {
    const { W, H, sc, ctx } = env, cut = env.cut, Pm = cut.params, M = Math.min(W, H), lt = env.lt;
    const txt = String(cut.text).trim();
    const out = outK(env);
    const lw = Math.max(1, M * 0.0014);
    const cap = J.clamp(M * 0.017, 11, 24);
    const mono = monoF(env);
    const cells = [];                 // {x, y, w, h, font, main}
    const mx = W * 0.07, my = H * 0.1, gw = W - mx * 2, gh = H - my * 2;
    if (Pm.grid === 'g2') {
      const g = M * 0.02, cw = (gw - g) / 2, ch = (gh - g) / 2;
      for (let i = 0; i < 4; i++) cells.push({ x: mx + (i % 2) * (cw + g), y: my + Math.floor(i / 2) * (ch + g), w: cw, h: ch, font: i === 0 ? Pm.main : Pm.fonts[i - 1], main: i === 0 });
    } else if (Pm.grid === 'g3') {
      const g = M * 0.018, cw = (gw - g * 2) / 3, ch = (gh - g * 2) / 3;
      cells.push({ x: mx, y: my, w: cw * 2 + g, h: ch * 2 + g, font: Pm.main, main: true });
      const rest = [[2, 0], [2, 1], [0, 2], [1, 2], [2, 2]];
      rest.forEach(([c, r], i) => cells.push({ x: mx + c * (cw + g), y: my + r * (ch + g), w: cw, h: ch, font: Pm.fonts[i], main: false }));
    } else {
      const rowsN = W < H ? 5 : 4;
      const hs = [2.2]; for (let i = 1; i < rowsN; i++) hs.push(1);
      const tot = hs.reduce((a2, b) => a2 + b, 0);
      let y = my;
      hs.forEach((hh, i) => { const h = gh * hh / tot; cells.push({ x: mx, y, w: gw, h, font: i === 0 ? Pm.main : Pm.fonts[i - 1], main: i === 0 }); y += h; });
    }
    let bb = null;
    cells.forEach((c, i) => {
      const d = 0.06 + i * 0.07;
      const e = E.outCubic(J.clamp((lt - d) / 0.4)) * out;
      if (e <= 0) return;
      // rule on top of each cell + caption
      env.line([[c.x, c.y], [c.x + c.w * E.outExpo(J.clamp((lt - d) / 0.5)), c.y]], c.main ? sc.accent : sc.sub, c.main ? lw * 3 : lw, (c.main ? 1 : 0.6) * out, false);
      const F = (J.FONTS[c.font] && J.faceOf ? J.faceOf(c.font) : J.FONTS[c.font]) || {};   // the face actually drawn (lyric language)
      const label = `${String(Pm.num + i).padStart(2, '0')}  ${(F.name || F.label || c.font).toUpperCase()}  ${F.weight || ''}`;
      env.draw({ text: label, font: mono, size: cap, align: 'left', track: 0.08, x: c.x, y: c.y + cap * 1.1, color: c.main ? sc.accent : sc.sub, alpha: e, ghost: false });
      const list = Pm.grid === 'list';
      const tw = list ? c.w * (c.main ? 1 : 0.8) : c.w * 0.9, th = c.h - cap * (list ? 1.8 : 2.8);
      const fsz = Math.min(J.fitSize(txt, c.font, tw, th * (list ? 0.78 : 0.7), { track: 0.02 }), c.main ? H * 0.3 : H * 0.14);
      const it = { text: txt, font: c.font, size: fsz, track: 0.02, x: list ? c.x : c.x + c.w / 2, y: c.y + cap * (list ? 1.8 : 2.2) + th / 2, align: list ? 'left' : 'center', color: sc.fg };
      if (list && !c.main) { it.x = c.x + c.w * 0.2; it.y = c.y + c.h / 2 + cap * 0.3; }
      if (c.main) bb = J.mainDraw(env, it);
      else env.draw(Object.assign(it, { color: sc.sub, alpha: e * 0.9, y: it.y + (1 - e) * cap * 1.5, ghost: false }));
    });
    return bb;
  },
}, P);

/* ================================================================== 23 kanjiFocus — 一字強調 */
J.register('layout', 'kanjiFocus', {
  name: '一字強調', tags: ['emotional', 'editorial', 'calm'], w: 1, emph: 1.6, fits: n => n >= 2 && n <= 16,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display', 'serif'])), fs: rng.pick(fontsOf(st, ['serif', 'display', 'body'])), mode: rng.pick(['dim', 'outline', 'tint']), pos: rng.pick(['center', 'side', 'side']), low: rng.chance(0.45), dots: rng.chance(0.7), dir: rng.pick([1, -1]) };
  },
  render(env) {
    const { W, H, sc } = env, cut = env.cut, Pm = cut.params, M = Math.min(W, H), lt = env.lt;
    const port = W < H;
    const raw = String(cut.text).trim();
    const chs = [...raw];
    let fi = chs.findIndex(c => J.isKanji(c));
    if (fi < 0) fi = chs.findIndex(c => c.trim() && !J.isPunct(c) && !J.isSmallKana(c));
    if (fi < 0) fi = 0;
    const fch = chs[fi];
    // the huge background glyph
    const big = port ? W * 1.05 : H * 1.02;
    const side = !port && Pm.pos === 'side';
    const bx = side ? W / 2 + Pm.dir * W * 0.2 : W / 2, by = H / 2;
    const u = J.clamp(lt / Math.max(0.5, cut.dur));
    const e = E.outCubic(J.clamp(lt / 0.8)), out = outK(env);
    const sz = big * (1.08 - 0.08 * E.outCubic(u)) * (1 + 0.04 * E.inCubic(env.pOut));
    const bi = { text: fch, font: Pm.font, size: sz, x: bx, y: by, ghost: false, alpha: e * out };
    if (Pm.mode === 'dim') bi.color = J.mix(sc.bg, sc.fg, 0.13);
    else if (Pm.mode === 'tint') bi.color = J.mix(sc.bg, sc.accent, 0.22);
    else Object.assign(bi, { fill: false, stroke: Math.max(1.2, sz * 0.004), strokeColor: sc.sub, alpha: e * out * 0.7 });
    env.draw(bi);
    // the full lyric, small, over it
    const mt = mainLines(raw, W, H, 16, 8);
    const base = { text: mt, font: Pm.fs, x: side ? W / 2 - Pm.dir * W * 0.12 : W / 2, y: Pm.low ? H * 0.74 : H / 2, track: 0.14, lead: 1.5 };
    base.size = Math.min(J.fitSize(mt, Pm.fs, side ? W * 0.44 : W * 0.7, H * 0.2, base), M * 0.075);
    const gl = glyphPts(base);
    let bb = null;
    let k = 0;
    gl.forEach((g, i) => {
      const isF = i === fi - [...raw.slice(0, fi)].filter(c => c === ' ' || c === '　').length;
      bb = U(bb, J.mainDraw(env, { text: g.ch, font: Pm.fs, size: base.size, x: g.x, y: g.y, color: isF ? sc.accent : sc.fg, mi: i * 0.6 }));
      if (isF && Pm.dots) {
        const q = E.outBack(J.clamp((lt - 0.35) / 0.25), 2) * out;
        env.circle(g.x, g.y - base.size * 0.78, base.size * 0.075 * q, sc.accent, null, 0, 1, true);
      }
      k++;
    });
    if (bb) {
      const le = E.outExpo(J.clamp((lt - 0.2) / 0.6)) * out;
      const y = bb.y1 + base.size * 0.7, x0 = bb.x0, x1 = bb.x1;
      env.line([[x0, y], [J.lerp(x0, x1, le), y]], sc.sub, Math.max(1, M * 0.0013), 0.6, false);
    }
    return bb;
  },
}, P);

/* ================================================================== 24 halfVertical — 縦横混植 */
J.register('layout', 'halfVertical', {
  name: '縦横混植', tags: ['editorial', 'graphic'], w: 1, fits: n => n >= 3 && n <= 14,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display', 'serif'])), shape: rng.pick(['rowCol', 'rowCol', 'colRow']), guide: rng.pick(['bracket', 'tick', 'bracket']) };
  },
  render(env) {
    const { W, H, sc } = env, cut = env.cut, Pm = cut.params, M = Math.min(W, H), lt = env.lt;
    const txt = String(cut.text).trim().replace(/[\s\u3000]+/g, ' '), arr = [...txt], n = arr.length;
    const rowCol = Pm.shape === 'rowCol', port = W < H;
    // the arm that runs along the long side of the frame gets more glyphs; break at a natural boundary near that point
    const tgt = n * (port ? (rowCol ? 0.38 : 0.62) : (rowCol ? 0.6 : 0.4));
    const segB = new Set(); let acc = 0;
    for (const g of (J.segments(txt) || [])) { acc += [...g].length; segB.add(acc); }
    let cutAt = Math.max(1, Math.round(tgt)), bs = -1e9;
    for (let k = 1; k < n; k++) {
      const pa = arr[k - 1], pb = arr[k];
      let sc0 = -Math.abs(k - tgt) * 1.2;
      if (segB.has(k)) sc0 += 2;
      if (pa === ' ' || pb === ' ') sc0 += 3;
      if (J.isSmallKana(pb) || J.isPunct(pb) || pb === 'ー') sc0 -= 8;
      if (J.isSmallKana(pa)) sc0 -= 3;
      if (J.isHira(pa) && !J.isHira(pb)) sc0 += 1.5;
      if (sc0 > bs) { bs = sc0; cutAt = k; }
    }
    const A = arr.slice(0, cutAt).join('').trim() || arr[0], B = arr.slice(cutAt).join('').trim() || '';
    const tr = 0.06;
    const mA = J.measure({ text: A, font: Pm.font, size: 100, track: tr, vertical: !rowCol });
    const mB = J.measure({ text: B, font: Pm.font, size: 100, track: tr, vertical: rowCol });
    // extent in 'size' units
    const wU = rowCol ? mA.w / 100 : 1.25 + mB.w / 100;
    const hU = rowCol ? 1.25 + mB.h / 100 : mA.h / 100;
    const size = Math.min(W * 0.82 / wU, H * 0.8 / hU, M * 0.26);
    const x0 = W / 2 - wU * size / 2, y0 = H / 2 - hU * size / 2;
    let bb = null;
    const out = outK(env);
    let corner;
    if (rowCol) {
      const itA = { text: A, font: Pm.font, size, x: x0, y: y0 + size / 2, align: 'left', track: tr, color: sc.fg, mi: 0 };
      const gA = glyphPts(itA), last = gA[gA.length - 1] || { x: x0 + size / 2 };
      bb = U(bb, J.mainDraw(env, itA));
      if (B) bb = U(bb, J.mainDraw(env, { text: B, font: Pm.font, size, x: last.x, y: y0 + size * 1.25, vertical: true, align: 'left', track: tr, color: sc.fg, mi: 3 }));
      corner = [last.x, y0 + size / 2];
    } else {
      const itA = { text: A, font: Pm.font, size, x: x0 + size / 2, y: y0, vertical: true, align: 'left', track: tr, color: sc.fg, mi: 0 };
      const gA = glyphPts(itA), last = gA[gA.length - 1] || { y: y0 + size / 2 };
      bb = U(bb, J.mainDraw(env, itA));
      if (B) bb = U(bb, J.mainDraw(env, { text: B, font: Pm.font, size, x: x0 + size * 1.25, y: last.y, align: 'left', track: tr, color: sc.fg, mi: 3 }));
      corner = [x0 + size / 2, last.y];
    }
    // thin guide hugging the outside of the corner
    const g = size * 0.42, lw = Math.max(1.2, M * 0.0016);
    const le = E.outCubic(J.clamp((lt - 0.15) / 0.7)) * out;
    if (Pm.guide === 'bracket' && le > 0) {
      const pts = rowCol
        ? [[x0 - g * 0.3, y0 - g * 0.55], [corner[0] + size / 2 + g * 0.55, y0 - g * 0.55], [corner[0] + size / 2 + g * 0.55, y0 + hU * size + g * 0.3]]
        : [[x0 - g * 0.55, y0 - g * 0.3], [x0 - g * 0.55, corner[1] + size / 2 + g * 0.55], [x0 + wU * size + g * 0.3, corner[1] + size / 2 + g * 0.55]];
      env.polyPartial(pts, le, sc.sub, lw, 0.8, false);
    }
    const q = E.outBack(J.clamp((lt - 0.3) / 0.25), 2) * out;
    if (q > 0) {
      const cs = size * 0.12;
      const px = rowCol ? corner[0] + size / 2 + g * 0.55 : x0 - g * 0.55, py = rowCol ? y0 - g * 0.55 : corner[1] + size / 2 + g * 0.55;
      env.rect(px - cs / 2 * q, py - cs / 2 * q, cs * q, cs * q, sc.accent, 1, true);
    }
    return bb;
  },
}, P);

/* ================================================================== 25 curtain — 幕 */
J.register('layout', 'curtain', {
  name: '幕', tags: ['emotional', 'pop', 'graphic'], w: 0.9, emph: 1.4, fits: n => n >= 1 && n <= 16,
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display', 'serif'])), variant: rng.pick(['side', 'side', 'shutter', 'rise']), col: rng.pick(['velvet', 'velvet', 'accent', 'ink']), drape: rng.chance(0.7), pleats: rng.chance(0.75) };
  },
  render(env) {
    const { W, H, sc, ctx } = env, cut = env.cut, Pm = cut.params, M = Math.min(W, H), lt = env.lt;
    const mt = mainLines(cut.text, W, H, 10, 5);
    const size = Math.min(J.fitSize(mt, Pm.font, W * (Pm.drape && Pm.variant === 'side' ? 0.7 : 0.8), H * (Pm.variant === 'shutter' ? 0.34 : 0.44), { track: 0.05, lead: 1.15 }), H * 0.2);
    const t0 = 0.02, T = J.clamp(cut.dur * 0.16, 0.22, 0.48);
    const bb = J.mainDraw(env, { text: mt, font: Pm.font, size, x: W / 2, y: H / 2, track: 0.05, lead: 1.15, color: sc.fg, mi: miAt(env, t0 + T * 0.25) });
    const open = E.inOutCubic(J.clamp((lt - t0) / T)) * (1 - E.inOutCubic(env.pOut));
    const dark = J.lum(sc.bg) < 0.45;
    const panel = Pm.col === 'velvet' ? J.mix(sc.bg, sc.accent, dark ? 0.38 : 0.6) : plateCol(sc, Pm.col === 'accent' ? [sc.accent, sc.ink] : [sc.ink, sc.accent]);
    const shade = J.mix(panel, sc.bg, 0.22), lite = J.mix(panel, onCol(sc, panel), 0.12);
    const moving = false;              // big moving panels: no chromatic ghosts
    const lw = Math.max(1, M * 0.002);
    const pleat = (x0, x1, y0, y1, k) => {       // vertical folds, compressing with the panel width
      if (!Pm.pleats || env.pass !== 'main') return;
      const m = 7, w = x1 - x0;
      if (w < 4) return;
      for (let i = 1; i < m; i++) { const x = x0 + w * i / m; env.rect(x - lw * 1.5, y0, lw * 3, y1 - y0, i % 2 ? shade : lite, 0.55 * k, false); }
    };
    if (Pm.variant === 'side') {
      const rest = Pm.drape ? W * 0.075 : -W * 0.02;
      const xl = J.lerp(W / 2, rest, open), xr = J.lerp(W / 2, W - rest, open);
      const bulge = Math.sin(Math.PI * J.clamp(open)) * W * 0.02;
      const L = [[-5, -5], [xl, -5], [xl + bulge, H * 0.5], [xl, H + 5], [-5, H + 5]];
      const R = [[W + 5, -5], [xr, -5], [xr - bulge, H * 0.5], [xr, H + 5], [W + 5, H + 5]];
      env.poly(L, panel, 1, moving); env.poly(R, panel, 1, moving);
      pleat(0, xl, 0, H, 1); pleat(xr, W, 0, H, 1);
      if (Pm.drape && open > 0.5) {         // tie-backs
        const q = J.clamp((open - 0.5) * 2);
        env.rect(xl - W * 0.012, H * 0.62, W * 0.012 + 2, H * 0.018, sc.accent === panel ? sc.fg : sc.accent, q, false);
        env.rect(xr - 2, H * 0.62, W * 0.012 + 2, H * 0.018, sc.accent === panel ? sc.fg : sc.accent, q, false);
      }
    } else if (Pm.variant === 'shutter') {
      const rest = Pm.drape ? H * 0.12 : -H * 0.02;
      const yt = J.lerp(H / 2, rest, open), yb = J.lerp(H / 2, H - rest, open);
      env.rect(-5, -5, W + 10, yt + 5, panel, 1, moving);
      env.rect(-5, yb, W + 10, H - yb + 5, panel, 1, moving);
      if (Pm.drape && open > 0.9) {
        const fs = J.clamp(H * 0.018, 11, 22), a = J.clamp((open - 0.9) * 10);
        env.draw({ text: `${String((cut.line | 0) + 1).padStart(2, '0')} ／ ${J.fmtTime(cut.start)}`, font: monoF(env), size: fs, track: 0.3, align: 'left', x: W * 0.05, y: yt / 2, color: onCol(sc, panel), alpha: a, ghost: false });
      }
    } else {
      // theatre curtain rising, leaving a scalloped valance
      const rest = Pm.drape ? H * 0.1 : -H * 0.05;
      const yb = J.lerp(H + 5, rest, open);
      const m = 9, sw = W / m, dip = Math.min(H * 0.035, Math.max(0, yb) * 0.5);
      const pts = [[-5, -5], [W + 5, -5], [W + 5, yb]];
      for (let i = m; i >= 0; i--) { pts.push([i * sw, yb]); if (i > 0) pts.push([i * sw - sw / 2, yb + dip]); }
      env.blob ? env.poly(pts, panel, 1, moving) : null;
      pleat(0, W, 0, Math.max(0, yb), 1);
    }
    return bb;
  },
}, P);

/* ================================================================== 26 equalizer — イコライザー */
J.register('layout', 'equalizer', {
  name: 'イコライザー', tags: ['pop', 'graphic', 'glitch'], w: 0.8, portrait: 0.9, fits: n => n >= 1 && n <= 12,
  enterBias: { cut: 1.5, pop: 1.3, drop: 1.2, slice: 0.4, wipe: 0.5 },
  plan(rng, cut, st) {
    return { font: rng.pick(fontsOf(st, ['display'])), style: rng.pick(['bars', 'blocks', 'blocks', 'mirror']), thin: rng.pick([0, 2, 3]), peaks: rng.chance(0.7), col: rng.pick(['accent', 'accent', 'duo', 'fg']), tempo: rng.range(0.42, 0.55) };
  },
  render(env) {
    const { W, H, sc } = env, cut = env.cut, Pm = cut.params, s = cut.seed, M = Math.min(W, H), lt = env.lt;
    const chs = slotsOf(cut.text), n = chs.length;
    if (!n) return null;
    const port = W < H;
    const rows = port && n > 6 ? 2 : 1, per = Math.ceil(n / rows);
    const sw = W * 0.86 / per;
    const size = Math.min(sw * 0.78, H * (rows > 1 ? 0.1 : 0.14));
    const bw = Math.min(sw * 0.6, size * 1.15);
    const e = inE(env, 0.45), out = outK(env);
    const colA = plateCol(sc, [sc.accent, sc.fg]), colB = plateCol(sc, [sc.accent2, sc.sub, sc.fg]);
    // level of band x (continuous index) at time t
    const level = (x, t) => {
      let v = 0.5 + 0.5 * J.noise1(t * 3.1 + x * 0.83, s);
      v = 0.25 + 0.6 * v;
      let pulse;
      if (env.beat && env.beat.len > 0.2) pulse = Math.exp(-env.beat.since * 7) * (0.4 + 0.6 * J.r(s, env.beat.index, Math.round(x * 3)));
      else { const k = Math.floor(t / Pm.tempo), ph = t - k * Pm.tempo; pulse = Math.exp(-ph * 7) * (0.3 + 0.7 * J.r(s, k, Math.round(x * 3))); }
      v = v * 0.75 + pulse * 0.45;
      if (env.energy != null) v = v * (0.45 + 0.75 * env.energy);
      return J.clamp(v, 0.06, 1);
    };
    const lw = Math.max(1, M * 0.0016);
    let bb = null;
    for (let r = 0; r < rows; r++) {
      const cnt = Math.min(per, n - r * per);
      const yb = rows > 1 ? (r ? H * 0.84 : H * 0.47) : H * 0.74;
      const hmax = (rows > 1 ? H * 0.26 : H * 0.44) - size * 0.4;
      const x0 = W / 2 - cnt * sw / 2;
      env.line([[x0 - sw * 0.2, yb], [x0 - sw * 0.2 + (cnt * sw + sw * 0.4) * e, yb]], sc.sub, lw, 0.7 * out, false);
      const drawBar = (x, w, h, col, a) => {
        if (h <= 0.5) return;
        if (Pm.style === 'blocks') {
          const seg = Math.max(4, sw * 0.14), gap = seg * 0.28, m = Math.floor(h / seg);
          for (let k = 0; k < m; k++) env.rect(x - w / 2, yb - (k + 1) * seg + gap / 2, w, seg - gap, k > hmax / seg * 0.72 ? colB : col, a, false);
        } else env.rect(x - w / 2, yb - h, w, h, col, a, false);
        if (Pm.style === 'mirror') env.rect(x - w / 2, yb + lw * 2, w, h * 0.35, col, a * 0.22, false);
      };
      // thin spectrum bars between the lettered ones
      if (Pm.thin) for (let j = 0; j <= cnt; j++) for (let q = 1; q <= Pm.thin; q++) {
        if (j === cnt && q > 0) break;
        const xi = j + q / (Pm.thin + 1);
        const x = x0 + xi * sw;
        drawBar(x, sw * 0.06, hmax * 0.8 * level(xi + r * 7 + 0.5, env.ltb) * e * out, sc.sub, 0.55);
      }
      for (let j = 0; j < cnt; j++) {
        const i = r * per + j;
        if (chs[i] === ' ') continue;
        const x = x0 + (j + 0.5) * sw;
        const lv = level(j + 0.5 + r * 7, env.ltb);
        const h = hmax * lv * e * out;
        const col = Pm.col === 'duo' ? (j % 2 ? colB : colA) : Pm.col === 'fg' ? sc.fg : colA;
        drawBar(x, bw, h, col, Pm.col === 'fg' ? 0.35 : 0.9);
        if (Pm.peaks) {
          let pk = 0;
          for (let k = 0; k < 6; k++) { const tau = k * 0.1; pk = Math.max(pk, level(j + 0.5 + r * 7, env.ltb - tau) - tau * 0.55); }
          const ph = hmax * pk * e * out;
          env.rect(x - bw / 2, yb - ph - Math.max(3, sw * 0.05) - sw * 0.04, bw, Math.max(3, sw * 0.05), sc.fg, 0.9 * out * e, false);
        }
        bb = U(bb, J.mainDraw(env, { text: chs[i], font: Pm.font, size, x, y: yb - h - size * 0.62 - (Pm.peaks ? sw * 0.1 : 0), color: sc.fg, mi: i }));
      }
    }
    return bb;
  },
}, P);

/* ================================================================== 27 tape — テープ */
const tapePath = (ctx, L, h, seed, k) => {       // strip from x=0..L with torn ends
  const m = 7, tooth = h * 0.09;
  ctx.beginPath(); ctx.moveTo(0, -h / 2);
  ctx.lineTo(L, -h / 2);
  for (let i = 1; i <= m; i++) ctx.lineTo(L + (i % 2 ? tooth : -tooth * 0.3) * (0.6 + 0.8 * J.r(seed, k, i, 1)), -h / 2 + h * i / m);
  ctx.lineTo(0, h / 2);
  for (let i = m - 1; i >= 1; i--) ctx.lineTo((i % 2 ? -tooth : tooth * 0.3) * (0.6 + 0.8 * J.r(seed, k, i, 2)), -h / 2 + h * i / m);
  ctx.closePath();
};
J.register('layout', 'tape', {
  name: 'テープ', tags: ['pop', 'editorial', 'graphic'], w: 1, treat: 'safe', fits: n => n >= 1 && n <= 16,
  plan(rng, cut, st) {
    const n = cut.n, port = cut.H > cut.W;
    return {
      font: rng.pick(fontsOf(st, ['display', 'body'])), fs: rng.pick(fontsOf(st, ['body', 'serif'])),
      variant: n > 9 || (port && n > 5) ? rng.pick(['stack', 'stack', 'single']) : rng.pick(['single', 'cross', 'stack']),
      ang: rng.range(4, 11) * rng.pick([1, -1]), col: rng.pick(['accent', 'ink', 'accent']), piece: rng.chance(0.75), lines: rng.chance(0.6),
    };
  },
  render(env) {
    const { W, H, sc, ctx } = env, cut = env.cut, Pm = cut.params, s = cut.seed, M = Math.min(W, H), lt = env.lt;
    const port = W < H, out = outK(env);
    const dark = J.lum(sc.bg) < 0.45;
    const tapeC = plateCol(sc, Pm.col === 'accent' ? [sc.accent, sc.ink] : [sc.ink, sc.accent]);
    const tapeC2 = Pm.col === 'accent' ? plateCol(sc, [sc.ink, sc.fg]) : plateCol(sc, [sc.accent, sc.fg]);
    const txtC = onCol(sc, tapeC);
    const strip = (x, y, ang, L, h, col, k, t0, dur, content) => {
      const u = E.outCubic(J.clamp((lt - t0) / dur));
      if (u <= 0) return null;
      const vis = L * u;
      ctx.save(); ctx.translate(x, y); ctx.rotate(ang * J.DEG); ctx.translate(-L / 2, 0);
      if (env.pass === 'main') {
        ctx.save(); ctx.beginPath(); ctx.rect(-h, -h, vis + h * (u >= 1 ? 2 : 0), h * 2); ctx.clip();
        tapePath(ctx, L, h, s, k);
        ctx.globalAlpha = 0.9 * out; ctx.fillStyle = col; ctx.fill();
        if (Pm.lines) { ctx.globalAlpha = 0.07 * out; ctx.fillStyle = onCol(sc, col); for (let j = 1; j < 6; j++) ctx.fillRect(0, -h / 2 + h * j / 6, L, Math.max(1, h * 0.012)); }
        ctx.globalAlpha = 0.12 * out; ctx.fillStyle = dark ? '#000000' : '#FFFFFF'; ctx.fillRect(0, -h / 2, L, h * 0.08); ctx.fillRect(0, h / 2 - h * 0.08, L, h * 0.08);
        ctx.restore();
      }
      let r = null;
      if (content) {
        ctx.save(); ctx.beginPath(); ctx.rect(-h, -h * 2, vis + h * (u >= 1 ? 2 : 0), h * 4); ctx.clip();
        r = content(L / 2, 0);
        ctx.restore();
      }
      ctx.restore();
      return r;
    };
    let bb = null;
    const txt = String(cut.text).trim();
    if (Pm.variant === 'stack') {
      let parts = (cut.words && cut.words.length > 1 ? cut.words : [txt]).map(p => p.trim()).filter(Boolean);
      if (parts.length > 4) { const k = Math.ceil(parts.length / 4); const q = []; for (let i = 0; i < parts.length; i += k) q.push(parts.slice(i, i + k).join('')); parts = q; }
      if (parts.length === 1 && J.glyphCount(txt) > (port ? 5 : 9)) parts = J.splitLines(txt, Math.ceil(J.glyphCount(txt) / 2)).split('\n');
      const np = parts.length;
      const longest = parts.reduce((a, p) => Math.max(a, J.measure({ text: p, font: Pm.font, size: 100, track: 0.05 }).w / 100), 1);
      const size = Math.min(W * 0.72 / longest, H * 0.62 / (np * 1.75), M * 0.17);
      const h = size * 1.5;
      parts.forEach((p, i) => {
        const m = J.measure({ text: p, font: Pm.font, size, track: 0.05 });
        const L = m.w + size * 1.2;
        const y = H / 2 + (i - (np - 1) / 2) * h * 1.12;
        const x = W / 2 + J.rs(s, i, 3) * W * 0.05;
        const ang = (i % 2 ? -1 : 1) * Math.abs(Pm.ang) * 0.45 + J.rs(s, i, 4) * 1.5;
        const r = strip(x, y, ang, L, h, i % 3 === 1 ? tapeC2 : tapeC, i, 0.03 + i * 0.12, 0.3, (cx2, cy2) => J.mainDraw(env, { text: p, font: Pm.font, size, x: cx2, y: cy2, track: 0.05, color: onCol(sc, i % 3 === 1 ? tapeC2 : tapeC), noHold: plateHold(env), mi: miAt(env, 0.05 + i * 0.12) }));
        if (r) bb = U(bb, bbRect(x - L / 2, y - h / 2, x + L / 2, y + h / 2));
      });
      return bb;
    }
    const mt = mainLines(txt, W, H, 11, 6);
    const size = Math.min(J.fitSize(mt, Pm.font, W * 0.7, H * 0.3, { track: 0.05, lead: 1.15 }), H * 0.17);
    const mm = J.measure({ text: mt, font: Pm.font, size, track: 0.05, lead: 1.15 });
    const L = mm.w + size * 1.6, h = mm.h + size * 0.75;
    if (Pm.variant === 'cross') {
      const unit = String(cut.lineText || cut.text).replace(/\s+/g, ' ').trim();
      const fs = h * 0.26;
      const L2 = Math.min(Math.hypot(W, H) * 0.9, J.measure({ text: unit, font: Pm.fs, size: fs, track: 0.1 }).w * 1.3 + fs * 6);
      strip(W / 2 + L * 0.15, H / 2 + h * 0.1, -Pm.ang * 2.4, L2, h * 0.5, tapeC2, 9, 0.0, 0.4, (cx2, cy2) => env.draw({ text: unit, font: Pm.fs, size: fs, track: 0.1, x: cx2, y: cy2, color: onCol(sc, tapeC2), alpha: out, ghost: false }));
    }
    const r = strip(W / 2, H / 2, Pm.ang, L, h, tapeC, 0, 0.06, 0.34, (cx2, cy2) => J.mainDraw(env, { text: mt, font: Pm.font, size, x: cx2, y: cy2, track: 0.05, lead: 1.15, color: txtC, noHold: plateHold(env), mi: miAt(env, 0.1) }));
    if (Pm.piece) {
      const ph = h * 0.42, pl = ph * 2.6;
      const ex = W / 2 + Math.cos(Pm.ang * J.DEG) * L * 0.5, ey = H / 2 + Math.sin(Pm.ang * J.DEG) * L * 0.5;
      const rom = romaOf(txt);
      const lab = rom ? rom.slice(0, 12) : 'No.' + String((cut.line | 0) + 1).padStart(2, '0');
      strip(ex - ph * 0.3, ey - ph * 0.4, Pm.ang - 38 * Math.sign(Pm.ang || 1), pl, ph, tapeC2, 5, 0.32, 0.18, (cx2, cy2) => env.draw({ text: lab, font: monoF(env), size: Math.min(ph * 0.34, pl * 0.7 / Math.max(3, lab.length) * 1.6), track: 0.12, x: cx2, y: cy2, color: onCol(sc, tapeC2), alpha: out, ghost: false }));
    }
    return r ? bbRect(W / 2 - L / 2, H / 2 - h / 2, W / 2 + L / 2, H / 2 + h / 2) : null;
  },
}, P);

})();
