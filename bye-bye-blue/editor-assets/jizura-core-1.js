/* JIZURA pack: bgcamB — background graphics (gradients, wa / textile patterns, scenes, textures) + camera moves */
(() => {
'use strict';
const E = J.E;
const PK = 'bgcamB';
const reg = (g, k, d) => J.register(g, k, d, PK);
const DEG = J.DEG, TAU = J.TAU, clamp = J.clamp, lerp = J.lerp;

/* ================= shared helpers ================= */
const isDark = c => J.lum(c) < 0.45;
const layC = (sc, k) => J.mix(sc.bg, sc.fg, k);          // faint layer tone (k ≈ 0.04..0.15)
const tintC = (sc, k) => J.mix(sc.bg, sc.accent, k);     // faint accent tone
const Umin = env => Math.min(env.W, env.H);
const bs = rng => rng.int(1, 1e9);
const wrap = (v, m) => ((v % m) + m) % m;
const fract = v => v - Math.floor(v);
// colourful scheme colours that stand apart from the background (accent first, no duplicates)
const hues = sc => {
  const out = [];
  for (const c of [sc.accent, sc.accent2, sc.ghostA, sc.ghostB, sc.fg]) {
    if (!c || J.contrast(c, sc.bg) < 1.25) continue;
    const k = c.toLowerCase();
    if (!out.some(o => o.toLowerCase() === k)) out.push(c);
  }
  return out.length ? out : [sc.fg];
};
// a colour clearly lighter than a dark background (for light / glow effects)
const glowOf = sc => { const L = J.lum(sc.bg); for (const c of [sc.accent, sc.accent2, sc.ghostA, sc.ghostB, sc.fg]) if (c && J.lum(c) > L + 0.25) return c; return sc.fg; };
// light that still shows on light backgrounds: white on mid-light (yellow / pink), a tint on near-white paper
const lightOn = sc => (isDark(sc.bg) ? glowOf(sc) : J.lum(sc.bg) < 0.78 ? '#FFFFFF' : J.mix(sc.accent, '#FFFFFF', 0.2));

// time since this background started (consecutive cuts that share the same bg + seed count as one run)
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
const fadeIn = (env, d = 0.6) => E.outCubic(clamp(bgT(env) / d));
const bgReg = (k, d) => reg('bg', k, Object.assign({}, d, { draw(env, P) { const ctx = env.ctx; ctx.save(); try { d.draw(env, P || {}, ctx); } finally { ctx.restore(); } } }));

/* pre-render cache (tiles, sprites, textures) — small LRU, keyed by params + size + colour */
const CV = new Map();
const mkCv = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };
const cached = (key, make) => {
  let c = CV.get(key);
  if (c) { CV.delete(key); CV.set(key, c); return c; }
  while (CV.size >= 40) CV.delete(CV.keys().next().value);
  c = make(); CV.set(key, c); return c;
};
const resQ = env => Math.min(2, Math.max(0.1, env.scale || 1));
// a periodic tile (period pw × ph design px) rendered at output resolution
const tileCv = (key, env, pw, ph, paint) => {
  const q = resQ(env), w = Math.max(2, Math.round(pw * q)), h = Math.max(2, Math.round(ph * q));
  return cached(`${key}|${w}x${h}`, () => { const c = mkCv(w, h), x = c.getContext('2d'); x.scale(w / pw, h / ph); paint(x, pw, ph); return c; });
};
// fill rect (x0, y0, w, h) of the current space with the tile, pattern origin shifted by (ox, oy)
const fillTile = (ctx, cv, pw, ph, x0, y0, w, h, ox = 0, oy = 0) => {
  const pat = ctx.createPattern(cv, 'repeat'); if (!pat) return;
  const m = ctx.getTransform(), kx = m.a * pw / cv.width, ky = m.d * ph / cv.height;
  ctx.save(); ctx.fillStyle = pat;
  if (!m.b && !m.c && Math.abs(kx - 1) < 0.05 && Math.abs(ky - 1) < 0.05) {
    // tile pixels map ~1:1 to device pixels: fill in device space so every repeat lands on whole pixels (no resampling seams)
    const ex = Math.round(m.e + ox * m.a), fy = Math.round(m.f + oy * m.d);
    ctx.setTransform(1, 0, 0, 1, ex, fy);
    ctx.fillRect(m.e + x0 * m.a - ex, m.f + y0 * m.d - fy, w * m.a, h * m.d);
  } else {
    const sx = pw / cv.width, sy = ph / cv.height;
    ctx.translate(ox, oy); ctx.scale(sx, sy); ctx.fillRect((x0 - ox) / sx, (y0 - oy) / sy, w / sx, h / sy);
  }
  ctx.restore();
};
// fast 2D value noise (0..1) for pre-renders and per-frame fields
const hash2 = (x, y, s) => { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 144665)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
const noise2 = (x, y, s) => {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, s), b = hash2(ix + 1, iy, s), c = hash2(ix, iy + 1, s), d = hash2(ix + 1, iy + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
const fbm2 = (x, y, s, oct = 3) => { let v = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < oct; i++) { v += noise2(x * f, y * f, s + i * 101) * a; n += a; a *= 0.5; f *= 2.03; } return v / n; };
const fbm1 = (x, s, oct = 3) => { let v = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < oct; i++) { v += J.noise1(x * f, s + i * 53) * a; n += a; a *= 0.5; f *= 2.1; } return v / n; };   // -1..1
const conic = (ctx, a, x, y) => (ctx.createConicGradient ? ctx.createConicGradient(a, x, y) : null);
const pathPoly = (ctx, pts) => { ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); };

/* frame-size plates: expensive fills (tiled patterns, ring sets, textures) are rendered ONCE at output resolution with one
   scroll period of margin, then blitted every frame at whole device pixels — the cheapest canvas path */
const PL = new Map();
const plate = (key, env, mx, my, paint) => {
  const q = resQ(env), w = Math.ceil((env.W + mx) * q) + 2, h = Math.ceil((env.H + my) * q) + 2, k = `${key}|${w}x${h}`;
  let c = PL.get(k);
  if (c) { PL.delete(k); PL.set(k, c); return c; }
  let px = w * h; for (const v of PL.values()) px += v.width * v.height;
  const budget = Math.max(30e6, w * h * 3.2);            // ≈120 MB, but always room for the 3 plates one background may use
  while (PL.size && (PL.size >= 12 || px > budget)) { const k0 = PL.keys().next().value, v = PL.get(k0); px -= v.width * v.height; PL.delete(k0); }
  c = mkCv(w, h); const x = c.getContext('2d'); x.scale(q, q); paint(x, w / q, h / q); PL.set(k, c); return c;
};
// draw a plate so that its point (ox, oy) (design px) lands on the frame's top-left corner, snapped to device pixels
const blit = (ctx, env, cv, ox, oy) => {
  const m = ctx.getTransform(), s = m.a / resQ(env);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, m.e, m.f);
  const dx = -Math.round(ox * m.a), dy = -Math.round(oy * m.a);
  if (Math.abs(s - 1) < 1e-3) ctx.drawImage(cv, dx, dy); else ctx.drawImage(cv, dx, dy, cv.width * s, cv.height * s);
  ctx.restore();
};
// soft, large-area effects (gradients, glows) are drawn into a reused low-resolution canvas and scaled up once
const LOWC = new Map();
const drawLow = (ctx, env, div, fn) => {
  const q = env.scale || 1, w = Math.max(8, Math.ceil(env.W * q / div)), h = Math.max(8, Math.ceil(env.H * q / div)), k = w + 'x' + h;
  let c = LOWC.get(k);
  if (!c) { if (LOWC.size > 3) LOWC.clear(); c = mkCv(w, h); LOWC.set(k, c); }
  const x = c.getContext('2d');
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, w, h);
  x.setTransform(w / env.W, 0, 0, h / env.H, 0, 0);
  fn(x, w / env.W);
  x.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.drawImage(c, 0, 0, env.W, env.H);
};

/* ================= GRADIENT ================= */
// one vertical curtain strip per colour: transparent top → bright lower edge
const auroraStrip = col => cached('aurS|' + col, () => {
  const c = mkCv(4, 256), x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, J.rgba(col, 0)); g.addColorStop(0.5, J.rgba(col, 0.22)); g.addColorStop(0.88, J.rgba(col, 0.85)); g.addColorStop(0.94, J.rgba(col, 1)); g.addColorStop(1, J.rgba(col, 0));
  x.fillStyle = g; x.fillRect(0, 0, 4, 256); return c;
});
bgReg('auroraRibbons', { name: 'オーロラ', tags: ['emotional', 'calm'], w: 0.9,
  plan: rng => ({ seed: bs(rng), n: rng.int(2, 3), y: rng.range(0.36, 0.48), k: rng.range(0.2, 0.28), c0: rng.int(0, 3) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, s = P.seed || 1, t = env.t, dk = isDark(sc.bg), cols = hues(sc), e = fadeIn(env, 1.2);
    const N = clamp(Math.round(W / 18), 50, 120), cw = W / N, k = (P.k || 0.24) * e * (dk ? 1.25 : 0.8);
    const lite = cols.filter(c => J.lum(c) > J.lum(sc.bg) + 0.12), lc = dk ? (lite.length ? lite : [lightOn(sc)]) : [lightOn(sc), sc.accent];
    drawLow(ctx, env, 4, (x, q) => {
      x.imageSmoothingEnabled = true;
      for (let r = 0; r < (P.n || 2); r++) {
        const col = lc[((P.c0 || 0) + r) % lc.length], strip = auroraStrip(col);
        const base = H * ((P.y || 0.42) + r * 0.1 - 0.05), dir = r % 2 ? -1 : 1, ph = (s % 97) * 0.13 + r * 2.1;
        for (let i = 0; i <= N; i++) {
          const u = i / N, xx = i * cw - cw / 2;
          const y = base + H * 0.07 * Math.sin(u * TAU * 0.75 + t * 0.3 * dir + ph) + H * 0.045 * J.noise1(u * 3.5 + t * 0.22 * dir, s + r * 7);
          const h = Math.max(W, H) * (0.24 + 0.12 * J.noise1(u * 2.6 - t * 0.15, s + r * 13 + 5)) * (1 - 0.3 * r / 3) * (0.8 + 0.2 * e);
          const ray = Math.pow(0.5 + 0.5 * J.noise1(u * 34 + t * 0.9 * dir, s + r * 31), 1.4) * (0.7 + 0.3 * J.noise1(u * 13 - t * 0.4, s + r * 3));
          const a = k * (0.2 + 1.1 * ray) * J.smooth(0, 0.18, u) * J.smooth(1, 0.82, u) * (0.75 + 0.25 * J.noise1(u * 1.5 + t * 0.1, s + r));
          if (a <= 0.004) continue;
          // columns snapped to (low-res) pixels so neighbouring strips meet without seams
          const x0 = Math.round(xx * q) / q, x1 = Math.round((xx + cw) * q) / q;
          if (x1 <= x0) continue;
          x.globalAlpha = a;
          x.drawImage(strip, 0, 0, 4, 256, x0, y - h, x1 - x0, h * 1.07);
        }
      }
    });
  } });

bgReg('meshBlobs', { name: 'メッシュグラデ', tags: ['calm', 'emotional', 'pop'], w: 1, subtle: true,
  plan: rng => ({ seed: bs(rng), n: rng.int(3, 4), k: rng.range(0.2, 0.3) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, s = P.seed || 1, t = env.t, cols = hues(sc), dk = isDark(sc.bg), e = fadeIn(env, 1);
    const R0 = Math.max(W, H) * 0.5, n = P.n || 3;
    drawLow(ctx, env, 6, x => {
      for (let i = 0; i < n; i++) {
        const w1 = J.rr(0.16, 0.3, s, i, 1), w2 = J.rr(0.14, 0.26, s, i, 2);
        const cx = W * (0.5 + 0.42 * Math.sin(t * w1 + J.r(s, i, 3) * TAU)), cy = H * (0.5 + 0.4 * Math.cos(t * w2 + J.r(s, i, 4) * TAU));
        const R = R0 * J.rr(0.75, 1.1, s, i, 5) * (1 + 0.08 * Math.sin(t * 0.45 + i * 1.7));
        const c = J.mix(sc.bg, cols[i % cols.length], (P.k || 0.25) * (dk ? 1 : 0.75));
        const g = x.createRadialGradient(cx, cy, 0, cx, cy, R);
        g.addColorStop(0, J.rgba(c, 0.95 * e)); g.addColorStop(0.45, J.rgba(c, 0.5 * e)); g.addColorStop(1, J.rgba(c, 0));
        x.fillStyle = g;
        const x0 = Math.max(0, cx - R), y0 = Math.max(0, cy - R), x1 = Math.min(W, cx + R), y1 = Math.min(H, cy + R);
        if (x1 > x0 && y1 > y0) x.fillRect(x0, y0, x1 - x0, y1 - y0);
      }
    });
  } });

bgReg('duotoneSweep', { name: '二色スイープ', tags: ['calm', 'pop', 'graphic', 'emotional'], w: 0.9, subtle: true,
  plan: rng => ({ seed: bs(rng), pos: rng.pick([[0.5, 1.2], [-0.15, 1.1], [1.15, 1.1], [0.5, -0.2], [-0.1, -0.1]]), spd: rng.range(0.08, 0.14) * rng.pick([1, -1]), k: rng.range(0.14, 0.2), a0: rng.range(0, 6.28) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, cols = hues(sc), e = fadeIn(env, 0.8), k = P.k || 0.16;
    const cA = J.mix(sc.bg, cols[0], k), cB = J.mix(sc.bg, cols[1] || sc.fg, k);
    const pos = P.pos || [0.5, 1.2], cx = W * pos[0], cy = H * pos[1], a = (P.a0 || 0) + env.t * (P.spd || 0.1);
    drawLow(ctx, env, 6, x => {
      let g = conic(x, a, cx, cy);
      if (g) { g.addColorStop(0, cA); g.addColorStop(0.25, cB); g.addColorStop(0.5, cA); g.addColorStop(0.75, cB); g.addColorStop(1, cA); }
      else { g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, cA); g.addColorStop(1, cB); }
      x.globalAlpha = 0.9 * e; x.fillStyle = g; x.fillRect(0, 0, W, H);
      // soft sheen travelling around with the sweep
      const g2 = conic(x, a * 1.6 + 1, cx, cy);
      if (g2) {
        const hl = J.rgba(lightOn(sc), 0.07 * e), z = 'rgba(0,0,0,0)';
        g2.addColorStop(0, z); g2.addColorStop(0.06, hl); g2.addColorStop(0.12, z); g2.addColorStop(0.56, z); g2.addColorStop(0.62, hl); g2.addColorStop(0.68, z); g2.addColorStop(1, z);
        x.globalAlpha = 1; x.fillStyle = g2; x.fillRect(0, 0, W, H);
      }
    });
  } });

bgReg('horizonGlow', { name: '惑星の縁', tags: ['emotional', 'calm', 'editorial'], w: 0.8,
  plan: rng => ({ seed: bs(rng), cx: rng.range(0.3, 0.7), R: rng.range(1.3, 2.1), top: rng.range(0.7, 0.8), k: rng.range(0.28, 0.4) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.t, dk = isDark(sc.bg), e = fadeIn(env, 1.1), U = Umin(env);
    const R = Math.max(W, H) * (P.R || 1.6), cx = W * (P.cx || 0.5) + W * 0.03 * Math.sin(t * 0.08 + ((P.seed || 1) % 9));
    const cy = H * (P.top || 0.75) + R + (1 - e) * H * 0.25 + H * 0.008 * Math.sin(t * 0.25);
    const gc = dk ? glowOf(sc) : tintC(sc, 0.8), k = (P.k || 0.32) * (dk ? 1 : 0.55);
    ctx.fillStyle = dk ? J.mix(sc.bg, '#000000', 0.42) : J.mix(sc.bg, sc.fg, 0.05);
    ctx.globalAlpha = e; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    const breathe = 0.85 + 0.15 * Math.sin(t * 0.7), top = Math.max(0, cy - R * 1.22);
    if (top < H) {
      const g = ctx.createRadialGradient(cx, cy, R * 0.97, cx, cy, R * 1.22);
      g.addColorStop(0, J.rgba(gc, 0)); g.addColorStop(0.1, J.rgba(gc, k * 0.25 * breathe)); g.addColorStop(0.123, J.rgba(gc, k * breathe));
      g.addColorStop(0.2, J.rgba(gc, k * 0.45 * breathe)); g.addColorStop(0.5, J.rgba(gc, k * 0.12)); g.addColorStop(1, J.rgba(gc, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.rect(0, top, W, H - top); ctx.arc(cx, cy, R * 0.97, 0, TAU); ctx.fill('evenodd');
    }
    ctx.strokeStyle = J.rgba(gc, Math.min(0.8, k * 1.6)); ctx.lineWidth = Math.max(1, U * 0.0022);
    ctx.beginPath(); ctx.arc(cx, cy, R, Math.PI, TAU); ctx.stroke();
    // a bright flare sliding slowly along the limb
    const fa = -Math.PI / 2 + 0.22 * Math.sin(t * 0.12 + ((P.seed || 1) % 13)), fx = cx + Math.cos(fa) * R, fy = cy + Math.sin(fa) * R, fr = U * 0.3;
    const g2 = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr);
    g2.addColorStop(0, J.rgba(dk ? gc : lightOn(sc), k * 0.9 * breathe)); g2.addColorStop(0.3, J.rgba(gc, k * 0.25)); g2.addColorStop(1, J.rgba(gc, 0));
    ctx.fillStyle = g2; ctx.fillRect(fx - fr, fy - fr, fr * 2, fr * 2);
  } });

/* ================= PATTERN ================= */
bgReg('seigaiha', { name: '青海波', tags: ['calm', 'editorial', 'graphic'], w: 0.8,
  plan: rng => ({ seed: bs(rng), R: rng.range(0.07, 0.1), rings: rng.int(3, 4), k: rng.range(0.075, 0.1), dir: rng.pick([1, -1]), acc: rng.chance(0.3) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.t, R = Umin(env) * (P.R || 0.08), rings = P.rings || 4, e = fadeIn(env, 0.7);
    const col = P.acc ? tintC(sc, (P.k || 0.09) * 1.6) : layC(sc, P.k || 0.09), fillCol = layC(sc, (P.k || 0.09) * 0.35), key = `sgh|${col}|${rings}|${R.toFixed(2)}`;
    const pl = plate(key, env, 2 * R, R, (x, w, h) => {
      const tile = tileCv(key, env, 2 * R, R, (y) => {
        const lw = R * 0.075;
        for (let j = -3; j <= 4; j++) for (let i = -1; i <= 2; i++) {
          const cx = i * 2 * R + (j & 1 ? R : 0), cy = j * R / 2;
          y.globalCompositeOperation = 'destination-out'; y.fillStyle = '#000'; y.beginPath(); y.arc(cx, cy, R, 0, TAU); y.fill();
          y.globalCompositeOperation = 'source-over';
          y.fillStyle = fillCol; y.beginPath(); y.arc(cx, cy, R / rings * 0.62, 0, TAU); y.fill();
          y.strokeStyle = col; y.lineWidth = lw; y.beginPath();
          for (let m = 0; m < rings; m++) { const r = R * (1 - m / rings) - lw * 0.6; if (r > lw) { y.moveTo(cx + r, cy); y.arc(cx, cy, r, 0, TAU); } }
          y.stroke();
        }
      });
      fillTile(x, tile, 2 * R, R, 0, 0, w, h);
    });
    ctx.globalAlpha = e;
    blit(ctx, env, pl, wrap(t * R * 0.22 * (P.dir || 1), 2 * R), wrap(R * 0.5 + Math.sin(t * 0.5) * R * 0.08 - (1 - e) * R * 0.5, R));
  } });

bgReg('asanoha', { name: '麻の葉', tags: ['calm', 'editorial', 'graphic', 'emotional'], w: 0.8,
  plan: rng => ({ seed: bs(rng), a: rng.range(0.1, 0.14), k: rng.range(0.09, 0.12), dx: rng.pick([1, -1]), sweep: rng.range(0.07, 0.12) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.t, a = Umin(env) * (P.a || 0.12), h = a * Math.sqrt(3) / 2, e = fadeIn(env, 0.8);
    const col = layC(sc, P.k || 0.09), key = `asa|${col}|${a.toFixed(2)}`;
    const pl = plate(key, env, a, 2 * h, (x, w, hh) => {
      const tile = tileCv(key, env, a, 2 * h, (y) => {
        const pt = (r, i) => [i * a + (r & 1 ? a / 2 : 0), r * h];
        y.strokeStyle = col; y.lineWidth = Math.max(0.8, a * 0.018); y.lineCap = 'round'; y.beginPath();
        const tri = (A, B, C) => {
          const gx = (A[0] + B[0] + C[0]) / 3, gy = (A[1] + B[1] + C[1]) / 3;
          y.moveTo(A[0], A[1]); y.lineTo(B[0], B[1]); y.lineTo(C[0], C[1]); y.closePath();
          for (const Q of [A, B, C]) { y.moveTo(gx, gy); y.lineTo(Q[0], Q[1]); }
        };
        for (let r = -2; r <= 3; r++) for (let i = -2; i <= 2; i++) {
          if (!(r & 1)) { tri(pt(r, i), pt(r, i + 1), pt(r + 1, i)); tri(pt(r + 1, i), pt(r + 1, i + 1), pt(r, i + 1)); }
          else { tri(pt(r, i), pt(r, i + 1), pt(r + 1, i + 1)); tri(pt(r + 1, i), pt(r + 1, i + 1), pt(r, i)); }
        }
        y.stroke();
      });
      fillTile(x, tile, a, 2 * h, 0, 0, w, hh);
    });
    const ox = wrap(t * a * 0.08 * (P.dx || 1), a), oy = wrap(t * h * 0.05 + (1 - e) * h, 2 * h);
    ctx.globalAlpha = e; blit(ctx, env, pl, ox, oy);
    // a slow diagonal band of light re-draws the pattern brighter (nested bands → soft edges)
    const D = W + H, c = (wrap(bgT(env) * (P.sweep || 0.09) + 0.4, 1.5) - 0.25) * D, bw = Umin(env) * 0.22;
    for (const [f, al] of [[1, 0.4], [0.6, 0.4], [0.3, 0.45]]) {
      ctx.save(); ctx.beginPath();
      ctx.moveTo(c - bw * f, 0); ctx.lineTo(c + bw * f, 0); ctx.lineTo(c + bw * f - H, H); ctx.lineTo(c - bw * f - H, H); ctx.closePath(); ctx.clip();
      ctx.globalAlpha = e * al; blit(ctx, env, pl, ox, oy); ctx.restore();
    }
  } });

bgReg('houndstooth', { name: '千鳥格子', tags: ['graphic', 'editorial', 'pop'], w: 0.6,
  plan: rng => ({ seed: bs(rng), c: rng.range(0.04, 0.055), k: rng.range(0.055, 0.075), dx: rng.pick([1, -1]), acc: rng.chance(0.25) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.t, c = Umin(env) * (P.c || 0.045), e = fadeIn(env, 0.6);
    const col = P.acc ? tintC(sc, (P.k || 0.065) * 1.7) : layC(sc, P.k || 0.065), key = `hnd|${col}|${c.toFixed(2)}`;
    const pl = plate(key, env, 2 * c, 2 * c, (x, w, h) => {
      const tile = tileCv(key, env, 2 * c, 2 * c, (y) => {
        y.fillStyle = col; y.beginPath();
        for (const [ox, oy] of [[0, 0], [2 * c, 0], [0, 2 * c], [2 * c, 2 * c], [-2 * c, 0], [0, -2 * c]]) {
          y.rect(ox, oy, c, c);
          for (const [bx, by] of [[ox + c, oy], [ox, oy + c]]) {
            pathPoly(y, [[bx, by], [bx + c / 2, by], [bx, by + c / 2]]);
            pathPoly(y, [[bx + c, by], [bx + c, by + c / 2], [bx + c / 2, by + c], [bx, by + c]]);
          }
        }
        y.fill();
      });
      fillTile(x, tile, 2 * c, 2 * c, 0, 0, w, h);
    });
    const d = t * c * 0.35;
    ctx.globalAlpha = e; blit(ctx, env, pl, wrap(d * (P.dx || 1), 2 * c), wrap(d * 0.6, 2 * c));
  } });

bgReg('herringbone', { name: 'ヘリンボーン', tags: ['editorial', 'calm', 'graphic'], w: 0.6,
  plan: rng => ({ seed: bs(rng), u: rng.range(0.032, 0.045), k: rng.range(0.07, 0.1), dir: rng.pick([1, -1]), rot: rng.pick([45, 45, -45]) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.t, u = Umin(env) * (P.u || 0.038), e = fadeIn(env, 0.7), k = P.k || 0.08, rot = P.rot || 45;
    const cA = layC(sc, k), cB = layC(sc, k * 0.45), key = `hrb|${cA}|${cB}|${u.toFixed(2)}`, Pd = 4 * u * Math.SQRT2;   // screen-space period of the 45° weave
    const pl = plate(key + '|' + rot, env, Pd, Pd, (x, w, h) => {
      const tile = tileCv(key, env, 4 * u, 4 * u, (y) => {
        const g = u * 0.1;
        const brick = (x0, y0, bw, bh, c) => { y.fillStyle = c; y.fillRect(x0 * u + g, y0 * u + g, bw * u - 2 * g, bh * u - 2 * g); };
        for (let kk = -8; kk <= 8; kk++) for (let m = -4; m <= 4; m++) {
          const bx = kk + 2 * m, by = kk - 2 * m;
          if (bx > 6 || bx < -3 || by > 6 || by < -3) continue;
          brick(bx, by, 2, 1, cA); brick(bx + 2, by - 1, 1, 2, cB);
        }
      });
      const D = Math.hypot(w, h) / 2 + 4 * u;
      x.translate(w / 2, h / 2); x.rotate(rot * DEG); fillTile(x, tile, 4 * u, 4 * u, -D, -D, 2 * D, 2 * D);
    });
    const sp = t * u * 0.6 * (P.dir || 1);          // travel along the zig-zag columns
    ctx.globalAlpha = e; blit(ctx, env, pl, rot > 0 ? Pd / 2 : wrap(sp, Pd), rot > 0 ? wrap(sp, Pd) : Pd / 2);
    // slow sheen band across the weave
    const L = W + H, bx = (wrap(t * 0.1, 1.6) - 0.3) * L, bw = Umin(env) * 0.35, hc = lightOn(sc);
    const gl = ctx.createLinearGradient(bx - bw, 0, bx + bw, 0);
    gl.addColorStop(0, J.rgba(hc, 0)); gl.addColorStop(0.5, J.rgba(hc, isDark(sc.bg) ? 0.035 : 0.08)); gl.addColorStop(1, J.rgba(hc, 0));
    ctx.globalAlpha = e; ctx.fillStyle = gl; ctx.save(); ctx.transform(1, 0, -0.6, 1, 0, 0); ctx.fillRect(bx - bw, 0, bw * 2, H); ctx.restore();
  } });

bgReg('argyle', { name: 'アーガイル', tags: ['pop', 'graphic', 'editorial'], w: 0.6,
  plan: rng => ({ seed: bs(rng), dw: rng.range(0.16, 0.22), asp: rng.range(1.3, 1.5), k: rng.range(0.06, 0.085), up: rng.pick([1, -1]) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.t, dw = Umin(env) * (P.dw || 0.18), dh = dw * (P.asp || 1.4), k = P.k || 0.07, e = fadeIn(env, 0.6);
    const cA = layC(sc, k), cB = tintC(sc, k * 1.6), cL = layC(sc, k * 3), kd = `arg|${cA}|${cB}|${dw.toFixed(2)}|${dh.toFixed(2)}`, kl = `argL|${cL}|${dw.toFixed(2)}|${dh.toFixed(2)}`;
    const dia = plate(kd, env, 2 * dw, 2 * dh, (x, w, h) => fillTile(x, tileCv(kd, env, 2 * dw, 2 * dh, (y) => {
      for (let j = -1; j <= 2; j++) for (let i = -1; i <= 2; i++) {
        y.fillStyle = (i + j) & 1 ? cB : cA; y.beginPath();
        const cx = i * dw, cy = j * dh;
        pathPoly(y, [[cx, cy - dh / 2], [cx + dw / 2, cy], [cx, cy + dh / 2], [cx - dw / 2, cy]]); y.fill();
      }
    }), 2 * dw, 2 * dh, 0, 0, w, h));
    const lines = plate(kl, env, dw, dh, (x, w, h) => fillTile(x, tileCv(kl, env, dw, dh, (y) => {
      const L = Math.hypot(dw, dh); y.strokeStyle = cL; y.lineWidth = Math.max(0.8, dw * 0.012); y.setLineDash([L / 12, L / 12]);
      for (const [ox, oy] of [[0, 0], [dw, 0], [0, dh], [-dw, 0], [0, -dh]]) {
        y.beginPath(); y.moveTo(ox - dw / 2, oy); y.lineTo(ox + dw / 2, oy + dh); y.stroke();
        y.beginPath(); y.moveTo(ox + dw / 2, oy); y.lineTo(ox - dw / 2, oy + dh); y.stroke();
      }
    }), dw, dh, 0, 0, w, h));
    const d = t * dh * 0.1 * (P.up || 1);
    ctx.globalAlpha = e; blit(ctx, env, dia, wrap(dw - W / 2, 2 * dw), wrap(d - (1 - e) * dh * 0.3, 2 * dh));
    ctx.globalAlpha = e * 0.9; blit(ctx, env, lines, wrap(dw / 2 - W / 2 - d * 0.6, dw), wrap(-d, dh));
  } });

bgReg('tartan', { name: 'タータン', tags: ['pop', 'calm', 'editorial'], w: 0.6,
  plan: rng => ({ seed: bs(rng), S: rng.range(0.34, 0.5), w1: rng.range(0.18, 0.28), w2: rng.range(0.08, 0.13), k: rng.range(0.085, 0.115), acc: rng.chance(0.6) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.t, S = Umin(env) * (P.S || 0.42), k = P.k || 0.1, e = fadeIn(env, 0.8);
    const cA = layC(sc, k), cB = P.acc ? tintC(sc, k * 1.5) : layC(sc, k * 0.6), cL = layC(sc, k * 1.6), cT = tintC(sc, k * 2.4);
    const w1 = P.w1 || 0.22, w2 = P.w2 || 0.1, key = `tart|${cA}|${cB}|${cL}|${cT}|${w1.toFixed(3)}|${w2.toFixed(3)}|${S.toFixed(1)}`;
    // one sett of stripes, mirrored: wide band / thin line / mid band / hairline
    const sett = [[0, w1, cA, 0.6], [w1 + 0.04, 0.012, cL, 0.9], [w1 + 0.1, w2, cB, 0.55], [0.72, 0.008, cT, 0.9], [0.84, 0.02, cL, 0.7]];
    const stripe = (x, len, span) => { for (const [p, w, c, a] of sett) { x.globalAlpha = a; x.fillStyle = c; for (let o = 0; o < len + S; o += S) { x.fillRect(o + p * S, 0, w * S, span); x.fillRect(o + S - (p + w) * S, 0, w * S, span); } } x.globalAlpha = 1; };
    const vert = plate(key + '|v', env, S, 0, (x, w, h) => stripe(x, w, h));
    const hor = plate(key + '|h', env, 0, S, (x, w, h) => { x.transform(0, 1, 1, 0, 0, 0); stripe(x, h, w); });
    ctx.globalAlpha = e; blit(ctx, env, vert, wrap(-t * S * 0.035, S), 0);
    blit(ctx, env, hor, 0, wrap(t * S * 0.025 + S * 0.37, S));
  } });

bgReg('chevron', { name: '山形', tags: ['pop', 'graphic'], w: 0.6,
  plan: rng => ({ seed: bs(rng), p: rng.range(0.13, 0.19), amp: rng.range(0.28, 0.42), k: rng.range(0.055, 0.075), dir: rng.pick([1, -1]), acc: rng.chance(0.3) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.t, p = Umin(env) * (P.p || 0.16), D = p * 0.5, A = p * (P.amp || 0.35), e = fadeIn(env, 0.6);
    const col = P.acc ? tintC(sc, (P.k || 0.065) * 1.7) : layC(sc, P.k || 0.065), key = `chev|${col}|${p.toFixed(2)}|${A.toFixed(2)}`;
    const pl = plate(key, env, p, D, (x, w, h) => fillTile(x, tileCv(key, env, p, D, (y) => {
      y.fillStyle = col; y.beginPath();
      for (let j = -2; j <= 3; j++) {
        const y0 = j * D + A / 2;
        pathPoly(y, [[-1, y0], [p / 2, y0 - A], [p + 1, y0], [p + 1, y0 + D / 2], [p / 2, y0 - A + D / 2], [-1, y0 + D / 2]]);
      }
      y.fill();
    }), p, D, 0, 0, w, h));
    ctx.globalAlpha = e;
    blit(ctx, env, pl, wrap(p / 2 - W / 2 + Math.sin(t * 0.3) * p * 0.1, p), wrap(-t * D * 0.4 * (P.dir || 1) + (1 - e) * D, D));
  } });

bgReg('isoCubes', { name: '立方体', tags: ['graphic', 'pop', 'calm'], w: 0.6,
  plan: rng => ({ seed: bs(rng), s: rng.range(0.055, 0.075), k: rng.range(0.08, 0.11), spd: rng.range(0.2, 0.35) * rng.pick([1, -1]), l0: rng.range(0, 6.28) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.t, s = Umin(env) * (P.s || 0.065), r3 = Math.sqrt(3), pw = r3 * s, ph = 3 * s, e = fadeIn(env, 0.6);
    const col = layC(sc, P.k || 0.09);
    const faces = ['top', 'left', 'right'].map((f, fi) => { const key = `iso|${f}|${col}|${s.toFixed(2)}`; return plate(key, env, pw, ph, (x, w, h) => fillTile(x, tileCv(key, env, pw, ph, (y) => {
      y.fillStyle = col; y.beginPath();
      for (let n2 = -2; n2 <= 3; n2++) for (let n1 = -3; n1 <= 3; n1++) {
        const cx = n1 * pw + n2 * pw / 2, cy = n2 * 1.5 * s;
        const T = [cx, cy - s], UR = [cx + pw / 2, cy - s / 2], LR = [cx + pw / 2, cy + s / 2], B = [cx, cy + s], LL = [cx - pw / 2, cy + s / 2], UL = [cx - pw / 2, cy - s / 2], C = [cx, cy];
        pathPoly(y, fi === 0 ? [T, UR, C, UL] : fi === 1 ? [UL, C, B, LL] : [UR, LR, B, C]);
      }
      y.fill();
    }), pw, ph, 0, 0, w, h)); });
    // the light direction turns slowly, so the three face sets trade brightness
    const L = (P.l0 || 0) + t * (P.spd || 0.25), dirs = [-Math.PI / 2, Math.PI * 5 / 6, Math.PI / 6];
    const ox = wrap(t * s * 0.25, pw), oy = wrap(t * s * 0.25 / r3 * 1.5, ph);
    faces.forEach((cv, fi) => { ctx.globalAlpha = e * (0.25 + 0.75 * (0.5 + 0.5 * Math.cos(L - dirs[fi]))); blit(ctx, env, cv, ox, oy); });
  } });

bgReg('hexGrid', { name: '六角格子', tags: ['graphic', 'glitch', 'calm'], w: 0.8,
  plan: rng => ({ seed: bs(rng), s: rng.range(0.05, 0.07), k: rng.range(0.09, 0.12), mode: rng.pick(['ring', 'ring', 'sparkle']) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.t, sd = P.seed || 1, U = Umin(env), s = U * (P.s || 0.06), r3 = Math.sqrt(3), e = fadeIn(env, 0.7);
    const cols = Math.ceil(W / (r3 * s)) + 2, rows = Math.ceil(H / (1.5 * s)) + 2, rr = s * 0.9, cx0 = W / 2, cy0 = H / 2;
    const lines = new Path2D(), lit = [new Path2D(), new Path2D(), new Path2D()], R = Math.hypot(W, H) / 2;
    const hex = (p, x, y, r) => { for (let m = 0; m < 6; m++) { const a = (m * 60 - 30) * DEG, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (m) p.lineTo(px, py); else p.moveTo(px, py); } p.closePath(); };
    const tw = Math.floor(t * 3);
    for (let j = -1; j < rows; j++) for (let i = -1; i < cols; i++) {
      const x = (i + (j & 1 ? 0.5 : 0)) * r3 * s, y = j * 1.5 * s, d = Math.hypot(x - cx0, y - cy0) / R;
      if (d > e * 1.2) continue;
      hex(lines, x, y, rr);
      let v;
      if (P.mode === 'sparkle') v = J.r(sd, i, j, tw) < 0.05 ? 1 - fract(t * 3) * 0.6 : 0;
      else v = Math.pow(0.5 + 0.5 * Math.cos((d * 3.2 - t * 0.55) * TAU), 6) * (0.6 + 0.4 * J.r(sd, i, j));
      if (v > 0.2) hex(lit[v > 0.75 ? 2 : v > 0.45 ? 1 : 0], x, y, rr * 0.86);
    }
    const k = P.k || 0.1;
    ctx.strokeStyle = layC(sc, k); ctx.lineWidth = Math.max(1, U * 0.0022); ctx.stroke(lines);
    [0.5, 1, 1.6].forEach((m, l) => { ctx.fillStyle = tintC(sc, k * m); ctx.fill(lit[l]); });
  } });

bgReg('triTess', { name: '三角モザイク', tags: ['graphic', 'calm', 'emotional'], w: 0.7,
  plan: rng => ({ seed: bs(rng), a: rng.range(0.1, 0.15), k: rng.range(0.07, 0.1), acc: rng.chance(0.35) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.t, sd = P.seed || 1, U = Umin(env), a = U * (P.a || 0.12), h = a * Math.sqrt(3) / 2, e = fadeIn(env, 0.8);
    const paths = [new Path2D(), new Path2D(), new Path2D(), new Path2D()], cols = Math.ceil(W / a) + 2, rows = Math.ceil(H / h) + 1;
    const sweep = (wrap(t * 0.07, 1.6) - 0.3) * (W + H);
    for (let r = 0; r < rows; r++) for (let i = -1; i < cols; i++) {
      const y0 = r * h, y1 = y0 + h, off = r & 1 ? a / 2 : 0;
      for (let up = 0; up < 2; up++) {
        const x0 = i * a + off + (up ? a / 2 : 0);
        const tri = up ? [[x0, y1], [x0 + a, y1], [x0 + a / 2, y0]] : [[x0, y0], [x0 + a, y0], [x0 + a / 2, y1]];
        const gx = x0 + a / 2, gy = up ? y0 + h * 0.66 : y0 + h * 0.33;
        let v = fbm2(gx / U * 1.6 + t * 0.12, gy / U * 1.6 - t * 0.07, sd, 2);
        v += 0.35 * Math.exp(-Math.pow((gx + gy - sweep) / (U * 0.35), 2));
        v = v * e + (J.r(sd, r, i, up) - 0.5) * 0.12;
        const lv = v > 0.78 ? 3 : v > 0.62 ? 2 : v > 0.46 ? 1 : v > 0.3 ? 0 : -1;
        if (lv < 0) continue;
        const p = paths[lv]; p.moveTo(tri[0][0], tri[0][1]); p.lineTo(tri[1][0], tri[1][1]); p.lineTo(tri[2][0], tri[2][1]); p.closePath();
      }
    }
    const k = P.k || 0.085, cf = P.acc ? tintC : layC;
    [0.35, 0.65, 1, 1.45].forEach((m, l) => { ctx.fillStyle = l === 3 && P.acc ? tintC(sc, k * m * 1.4) : cf(sc, k * m); ctx.fill(paths[l]); });
  } });

bgReg('moire', { name: 'モアレ', tags: ['glitch', 'graphic', 'calm'], w: 0.6,
  plan: rng => ({ seed: bs(rng), gap: rng.range(0.016, 0.022), k: rng.range(0.08, 0.11), amp: rng.range(0.05, 0.09) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.t, U = Umin(env), gap = U * (P.gap || 0.018), amp = U * (P.amp || 0.07), e = fadeIn(env, 0.8), s = (P.seed || 1) % 17;
    const col = layC(sc, P.k || 0.1), M = amp * 2.2;
    // one ring set, rendered once with a margin; the two interfering copies are blits of the same plate
    const pl = plate(`moi|${col}|${gap.toFixed(2)}|${M.toFixed(1)}`, env, M * 2, M * 2, (x, w, h) => {
      const cx = w / 2, cy = h / 2, Rm = Math.hypot(w, h) / 2;
      x.lineWidth = gap * 0.42; x.strokeStyle = col; x.beginPath();
      for (let r = gap; r < Rm; r += gap) { x.moveTo(cx + r, cy); x.arc(cx, cy, r, 0, TAU); }
      x.stroke();
    });
    const cs = [[amp * Math.sin(t * 0.33 + s), amp * 0.7 * Math.cos(t * 0.27 + s)], [-amp * Math.sin(t * 0.29 + s + 1), -amp * 0.7 * Math.cos(t * 0.37 + s + 2)]];
    ctx.globalAlpha = e;
    for (const [dx, dy] of cs) blit(ctx, env, pl, M - dx, M - dy);
  } });

bgReg('squareTunnel', { name: '四角トンネル', tags: ['glitch', 'graphic', 'pop'], w: 0.6,
  plan: rng => ({ seed: bs(rng), r: rng.range(1.22, 1.32), twist: rng.range(3, 7) * rng.pick([1, -1]), spd: rng.range(0.35, 0.6), k: rng.range(0.05, 0.07) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.t, U = Umin(env), r = P.r || 1.26, lr = Math.log(r), e = fadeIn(env, 0.5);
    const z = t * (P.spd || 0.45) + (1 - e) * 1.5, S0 = U * 0.08, maxS = Math.hypot(W, H) * 1.05;
    // square n has half-size S0 * r^(z - n): it grows as z advances (flying forward)
    let nLo = Math.floor(z - Math.log(maxS / S0) / lr) - 2; nLo -= ((nLo % 2) + 2) % 2;    // keep the parity of the outermost square fixed
    const nHi = Math.ceil(z - Math.log((U * 0.035) / S0) / lr);
    ctx.translate(W / 2, H / 2); ctx.beginPath();
    for (let n = nLo; n <= nHi && n - nLo < 60; n++) {
      const hs = S0 * Math.pow(r, z - n), a = ((z - n) * (P.twist || 5) + t * 4) * DEG, c = Math.cos(a) * hs, s = Math.sin(a) * hs;
      ctx.moveTo(c - s, s + c); ctx.lineTo(-c - s, -s + c); ctx.lineTo(-c + s, -s - c); ctx.lineTo(c + s, s - c); ctx.closePath();
    }
    ctx.fillStyle = layC(sc, P.k || 0.06); ctx.fill('evenodd');
  } });

bgReg('spiralArms', { name: '渦巻き', tags: ['glitch', 'pop', 'graphic'], w: 0.6,
  plan: rng => ({ seed: bs(rng), n: rng.int(3, 6), b: rng.range(0.26, 0.38), spd: rng.range(0.14, 0.24) * rng.pick([1, -1]), k: rng.range(0.055, 0.075), cy: rng.pick([0.5, 0.5, 0.56]) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.t, U = Umin(env), n = P.n || 4, b = P.b || 0.32, e = fadeIn(env, 0.7);
    const cx = W / 2, cy = H * (P.cy || 0.5), r0 = U * 0.09, Rm = Math.hypot(W, H) * 0.62, thMax = Math.log(Rm / r0) / b, w = Math.PI / n, steps = 72;
    const rot = t * (P.spd || 0.18) + (1 - e) * 1.2 * Math.sign(P.spd || 1);
    ctx.fillStyle = layC(sc, P.k || 0.065); ctx.beginPath();
    for (let k = 0; k < n; k++) {
      const base = rot + k * TAU / n;
      for (let i = 0; i <= steps; i++) { const th = thMax * i / steps, r = r0 * Math.exp(b * th) * (0.4 + 0.6 * e), a = base + th; i ? ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r) : ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      for (let i = steps; i >= 0; i--) { const th = thMax * i / steps, r = r0 * Math.exp(b * th) * (0.4 + 0.6 * e), a = base + th + w; ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      ctx.closePath();
    }
    ctx.fill();
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, U * 0.42);
    g.addColorStop(0, J.rgba(sc.bg, 0.8)); g.addColorStop(1, J.rgba(sc.bg, 0));
    ctx.fillStyle = g; ctx.fillRect(cx - U * 0.42, cy - U * 0.42, U * 0.84, U * 0.84);
  } });

// marching squares: segment end points for each of the 16 corner cases (edges: 0 top, 1 right, 2 bottom, 3 left)
const MS = [[], [[3, 2]], [[2, 1]], [[3, 1]], [[0, 1]], [[0, 1], [3, 2]], [[0, 2]], [[3, 0]], [[3, 0]], [[0, 2]], [[3, 0], [2, 1]], [[0, 1]], [[3, 1]], [[2, 1]], [[3, 2]], []];
bgReg('topoLines', { name: '等高線', tags: ['calm', 'editorial', 'graphic'], w: 0.8,
  plan: rng => ({ seed: bs(rng), n: rng.int(10, 14), fs: rng.range(1.2, 1.7), k: rng.range(0.11, 0.15), acc: rng.chance(0.3) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.t, sd = P.seed || 1, U = Umin(env), cell = U / 24, e = fadeIn(env, 0.9);
    const nx = Math.ceil(W / cell) + 1, ny = Math.ceil(H / cell) + 1, fs = (P.fs || 1.4) / U, f = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const X = i * cell * fs, Y = j * cell * fs, rx = X * 0.8 - Y * 0.6, ry = X * 0.6 + Y * 0.8;
      const v = fbm2(rx + t * 0.035 + 0.35 * noise2(ry * 0.7, rx * 0.7, sd + 5), ry - t * 0.025, sd, 3);
      f[j * nx + i] = clamp((v - 0.5) * 2.1 + 0.5, -0.2, 1.2);
    }
    const n = P.n || 12, d = 1 / n, z = t * 0.06 + (1 - e) * 2, lines = new Path2D(), major = new Path2D();
    for (let m = -1; m <= n + 1; m++) {
      const L = (m + fract(z)) * d, g = m - Math.floor(z), p = ((g % 4) + 4) % 4 === 0 ? major : lines;
      for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
        const a = f[j * nx + i], b = f[j * nx + i + 1], c = f[(j + 1) * nx + i + 1], dd = f[(j + 1) * nx + i];
        const idx = (a > L ? 8 : 0) | (b > L ? 4 : 0) | (c > L ? 2 : 0) | (dd > L ? 1 : 0);
        if (idx === 0 || idx === 15) continue;
        const pt = ed => (ed === 0 ? [i + (L - a) / (b - a), j] : ed === 1 ? [i + 1, j + (L - b) / (c - b)] : ed === 2 ? [i + (L - dd) / (c - dd), j + 1] : [i, j + (L - a) / (dd - a)]);
        for (const [e0, e1] of MS[idx]) { const p0 = pt(e0), p1 = pt(e1); p.moveTo(p0[0] * cell, p0[1] * cell); p.lineTo(p1[0] * cell, p1[1] * cell); }
      }
    }
    const k = P.k || 0.13;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalAlpha = e;
    ctx.strokeStyle = layC(sc, k); ctx.lineWidth = Math.max(1, U * 0.0018); ctx.stroke(lines);
    ctx.strokeStyle = P.acc ? tintC(sc, k * 2.2) : layC(sc, k * 1.6); ctx.lineWidth = Math.max(1.5, U * 0.0036); ctx.stroke(major);
  } });

bgReg('ridgePlot', { name: '稜線グラフ', tags: ['editorial', 'emotional', 'calm'], w: 0.7,
  plan: rng => ({ seed: bs(rng), n: rng.int(18, 26), k: rng.range(0.15, 0.2), amp: rng.range(0.07, 0.1), mode: rng.pick(['center', 'center', 'wide']), spd: rng.range(0.18, 0.3) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.t, sd = P.seed || 1, U = Umin(env), n = P.n || 22, e = fadeIn(env, 1);
    const x0 = W * 0.06, x1 = W * 0.94, y0 = H * 0.2, y1 = H * 0.94, gap = (y1 - y0) / (n - 1), m = clamp(Math.round((x1 - x0) / (U * 0.012)), 60, 170);
    const amp = H * (P.amp || 0.085) * (W < H ? 0.6 : 1), lc = layC(sc, P.k || 0.17), fillC = J.rgba(sc.bg, sc.paper || (env.st.texture && env.st.texture.paper > 0.5) ? 0.72 : 0.9);
    ctx.lineWidth = Math.max(1, U * 0.0022); ctx.lineJoin = 'round'; ctx.strokeStyle = lc;
    for (let i = 0; i < n; i++) {
      const base = y0 + i * gap, grow = E.outCubic(clamp(e * 1.6 - i / n * 0.6)), pts = [];
      for (let j = 0; j <= m; j++) {
        const u = j / m, x = lerp(x0, x1, u);
        const env1 = P.mode === 'wide' ? 0.3 + 0.7 * Math.pow(Math.sin(Math.PI * u), 2) : 0.08 + 0.92 * Math.exp(-Math.pow((u - 0.5) / 0.16, 2));
        const v = Math.pow(0.5 + 0.5 * fbm1(u * 7 + t * (P.spd || 0.24) + i * 0.41, sd + i * 7, 3), 2.4);
        pts.push([x, base - amp * env1 * v * 2.2 * grow - H * 0.002 * J.noise1(u * 40 + i, sd)]);
      }
      ctx.fillStyle = fillC; ctx.beginPath(); ctx.moveTo(x0, base + 1);
      for (const p of pts) ctx.lineTo(p[0], p[1]);
      ctx.lineTo(x1, base + 1); ctx.closePath(); ctx.fill();
      ctx.beginPath(); pts.forEach((p, q) => (q ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
    }
  } });

/* ================= SCENE ================= */
bgReg('starfield', { name: '星空', tags: ['emotional', 'calm'], w: 0.9,
  plan: rng => ({ seed: bs(rng), ang: rng.range(-0.3, 0.3) + (rng.chance(0.5) ? Math.PI : 0), spd: rng.range(0.8, 1.3), shoot: rng.chance(0.75) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.t, sd = P.seed || 1, U = Umin(env), dk = isDark(sc.bg), e = fadeIn(env, 0.9);
    const col = dk ? J.mix(sc.bg, sc.fg, 0.92) : J.lum(sc.bg) < 0.78 ? '#FFFFFF' : layC(sc, 0.5), area = Math.sqrt(W * H / (1920 * 1080));
    const vx = Math.cos(P.ang || 0), vy = Math.sin(P.ang || 0), spd = P.spd || 1;
    const layers = [[90, 0.0013, 0.006, 0.45], [46, 0.002, 0.018, 0.65], [18, 0.0032, 0.045, 0.85]];
    ctx.fillStyle = col;
    layers.forEach(([cnt, rad, sp, aB], l) => {
      const n = Math.round(cnt * area), v = U * sp * spd;
      for (let i = 0; i < n; i++) {
        const x = wrap(J.r(sd, l, i, 1) * W * 1.1 + t * v * vx, W * 1.1) - W * 0.05, y = wrap(J.r(sd, l, i, 2) * H * 1.1 + t * v * vy, H * 1.1) - H * 0.05;
        const r = U * rad * (0.6 + 0.8 * J.r(sd, l, i, 3)), tw = 0.5 + 0.5 * Math.sin(t * (1.1 + 2.6 * J.r(sd, l, i, 4)) + i * 1.7);
        const a = aB * (0.45 + 0.55 * tw) * e * (dk ? 1 : 0.65);
        ctx.globalAlpha = a;
        if (l < 2) ctx.fillRect(x - r, y - r, r * 2, r * 2);
        else {
          ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
          if (J.r(sd, l, i, 5) < 0.5) { ctx.globalAlpha = a * 0.5; const L = r * (4 + 3 * tw), th = Math.max(0.6, r * 0.25); ctx.fillRect(x - L, y - th / 2, L * 2, th); ctx.fillRect(x - th / 2, y - L, th, L * 2); }
        }
      }
    });
    if (P.shoot !== false) {
      const per = 3.4, idx = Math.floor(t / per), age = t - idx * per - J.r(sd, idx, 8) * 1.5;
      if (age > 0 && age < 0.75 && J.r(sd, idx, 9) < 0.85) {
        const q = age / 0.75, sx = W * J.rr(0.15, 0.7, sd, idx, 1), sy = H * J.rr(0.05, 0.35, sd, idx, 2), ang = J.rr(20, 38, sd, idx, 3) * DEG * (J.r(sd, idx, 4) < 0.5 ? 1 : -1);
        const dx = Math.cos(ang) * (ang < 0 ? -1 : 1), dy = Math.abs(Math.sin(ang)), L = U * 0.55;
        const hx = sx + dx * L * E.outQuad(q), hy = sy + dy * L * E.outQuad(q), tl = U * 0.16 * Math.sin(Math.PI * q);
        const g = ctx.createLinearGradient(hx, hy, hx - dx * tl, hy - dy * tl);
        g.addColorStop(0, J.rgba(col, 0.8 * e * (1 - q * 0.6))); g.addColorStop(1, J.rgba(col, 0));
        ctx.globalAlpha = 1; ctx.strokeStyle = g; ctx.lineWidth = Math.max(1, U * 0.002); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - dx * tl, hy - dy * tl); ctx.stroke();
      }
    }
  } });

bgReg('nightMoon', { name: '月夜', tags: ['emotional', 'calm', 'editorial'], w: 0.8,
  plan: rng => ({ seed: bs(rng), side: rng.pick([1, -1]), R: rng.range(0.11, 0.15), phase: rng.pick(['full', 'crescent', 'crescent']), k: rng.range(0.18, 0.26) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.t, sd = P.seed || 1, U = Umin(env), dk = isDark(sc.bg), e = fadeIn(env, 1.2), side = P.side || 1, port = H > W;
    const R = U * (P.R || 0.13), mx = W * (0.5 + side * (port ? 0.2 : 0.3)), my = H * (port ? 0.2 : 0.27) + (1 - e) * H * 0.06;
    const moonC = dk ? J.mix(sc.bg, glowOf(sc) === sc.fg ? sc.fg : J.mix(sc.fg, glowOf(sc), 0.3), P.k || 0.22) : J.mix(sc.bg, '#FFFFFF', 0.55);
    const haloC = dk ? moonC : J.mix(sc.bg, '#FFFFFF', 0.7);
    // stars (sparse, twinkling)
    const nS = Math.round(28 * Math.sqrt(W * H / (1920 * 1080)));
    ctx.fillStyle = dk ? layC(sc, 0.55) : layC(sc, 0.2);
    for (let i = 0; i < nS; i++) {
      const x = J.r(sd, i, 1) * W, y = J.r(sd, i, 2) * H * 0.62, r = U * J.rr(0.001, 0.0024, sd, i, 3);
      if (Math.hypot(x - mx, y - my) < R * 2.2) continue;
      ctx.globalAlpha = e * (0.2 + 0.4 * (0.5 + 0.5 * Math.sin(t * J.rr(0.8, 2.4, sd, i, 4) + i))); ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = e;
    const br = 0.9 + 0.1 * Math.sin(t * 0.7), g = ctx.createRadialGradient(mx, my, R * 0.9, mx, my, R * 3.4);
    g.addColorStop(0, J.rgba(haloC, (dk ? 0.35 : 0.5) * br)); g.addColorStop(0.3, J.rgba(haloC, (dk ? 0.1 : 0.18) * br)); g.addColorStop(1, J.rgba(haloC, 0));
    ctx.fillStyle = g; ctx.fillRect(mx - R * 3.4, my - R * 3.4, R * 6.8, R * 6.8);
    ctx.save();
    if (P.phase === 'crescent') { ctx.beginPath(); ctx.rect(mx - R * 2, my - R * 2, R * 4, R * 4); ctx.arc(mx + side * R * 0.42, my - R * 0.22, R * 0.9, 0, TAU); ctx.clip('evenodd'); }
    ctx.fillStyle = moonC; ctx.beginPath(); ctx.arc(mx, my, R, 0, TAU); ctx.fill();
    if (P.phase !== 'crescent') {
      ctx.fillStyle = J.mix(moonC, sc.bg, 0.22); ctx.beginPath();
      for (let i = 0; i < 6; i++) { const a = J.r(sd, i, 11) * TAU, d = R * Math.sqrt(J.r(sd, i, 12)) * 0.7, cr = R * J.rr(0.08, 0.2, sd, i, 13); ctx.moveTo(mx + Math.cos(a) * d + cr, my + Math.sin(a) * d); ctx.arc(mx + Math.cos(a) * d, my + Math.sin(a) * d, cr, 0, TAU); }
      ctx.fill();
    }
    ctx.restore();
    // thin cloud streaks drifting across the moon
    const cloudC = dk ? J.mix(sc.bg, sc.fg, 0.07) : J.mix(sc.bg, sc.fg, 0.05);
    const cap = (x, y, w, h) => { ctx.moveTo(x + h / 2, y); ctx.lineTo(x + w - h / 2, y); ctx.arc(x + w - h / 2, y + h / 2, h / 2, -Math.PI / 2, Math.PI / 2); ctx.lineTo(x + h / 2, y + h); ctx.arc(x + h / 2, y + h / 2, h / 2, Math.PI / 2, Math.PI * 1.5); ctx.closePath(); };
    ctx.fillStyle = cloudC;
    for (let i = 0; i < 3; i++) {
      const w = U * J.rr(0.4, 0.7, sd, i, 21), h = U * J.rr(0.02, 0.03, sd, i, 22), L = W + w * 2;
      const x = wrap((i + J.r(sd, i, 23) * 0.5) / 3 * L + t * U * J.rr(0.025, 0.045, sd, i, 24), L) - w, y = my + R * (i - 1) * 0.8 + R * J.rr(-0.2, 0.3, sd, i, 25);
      ctx.globalAlpha = e * 0.7; ctx.beginPath();
      cap(x, y, w, h); cap(x + w * J.rr(0.15, 0.4, sd, i, 26), y - h * 0.75, w * 0.45, h * 0.9); cap(x + w * J.rr(0.35, 0.6, sd, i, 27), y + h * 0.7, w * 0.5, h * 0.8);
      ctx.fill();
    }
  } });

bgReg('skyline', { name: '街並み', tags: ['emotional', 'editorial', 'pop'], w: 0.8,
  plan: rng => ({ seed: bs(rng), k: rng.range(0.08, 0.11), dir: rng.pick([1, -1]), win: rng.range(0.22, 0.34) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.t, sd = P.seed || 1, U = Umin(env), dk = isDark(sc.bg), e = fadeIn(env, 0.9), k = P.k || 0.09;
    const Lp = Math.max(W, H) * 1.5, rise = (1 - e) * H * 0.25;
    // horizon glow behind the city
    const gc = dk ? glowOf(sc) : sc.accent, g = ctx.createLinearGradient(0, H * 0.5, 0, H);
    g.addColorStop(0, J.rgba(gc, 0)); g.addColorStop(1, J.rgba(gc, (dk ? 0.1 : 0.08) * e));
    ctx.fillStyle = g; ctx.fillRect(0, H * 0.5, W, H * 0.5);
    const winLit = dk ? J.mix(sc.bg, glowOf(sc), 0.4) : J.mix(layC(sc, k * 1.1), '#FFFFFF', 0.55);
    [[0.6, 0.12, 0.34, 0.012], [1.1, 0.06, 0.2, 0.03]].forEach(([km, h0, h1, v], l) => {
      const col = layC(sc, k * km), off = wrap(t * U * v * (P.dir || 1), Lp), body = new Path2D(), wins = new Path2D();
      let x = 0, b = 0;
      while (x < Lp && b < 80) {
        const w = U * J.rr(0.05, 0.12, sd, l, b, 1), gapW = U * J.rr(0, 0.012, sd, l, b, 2);
        const h = H * J.rr(h0, h1, sd, l, b, 3) * (W < H ? 0.75 : 1), tier = J.r(sd, l, b, 4) < 0.35, ant = J.r(sd, l, b, 5) < 0.25;
        for (const X0 of [x - off, x - off + Lp]) {
          if (X0 > W || X0 + w < 0) continue;
          const top = H - h + rise;
          body.rect(X0, top, w, h + 2);
          if (tier) body.rect(X0 + w * 0.2, top - h * 0.12, w * 0.6, h * 0.12 + 1);
          if (ant) body.rect(X0 + w * 0.5 - 1, top - h * (tier ? 0.32 : 0.2), Math.max(1.5, U * 0.002), h * 0.2);
          const cw = U * 0.022, ch = U * 0.03, nx = Math.floor((w - cw * 0.4) / cw), ny = Math.floor((h - ch) / ch);
          for (let wy = 0; wy < ny && wy < 30; wy++) for (let wx = 0; wx < nx; wx++) {
            const ph = Math.floor(t * 0.25 + J.r(sd, l, b, wx, wy) * 7);
            if (J.r(sd + ph, l * 97 + b, wx, wy) > (P.win || 0.28)) continue;
            wins.rect(X0 + (w - nx * cw) / 2 + wx * cw + cw * 0.3, top + ch * 0.7 + wy * ch, cw * 0.4, ch * 0.45);
          }
        }
        x += w + gapW; b++;
      }
      ctx.globalAlpha = 1; ctx.fillStyle = col; ctx.fill(body);
      ctx.globalAlpha = l ? 0.8 : 0.5; ctx.fillStyle = winLit; ctx.fill(wins);
    });
  } });

bgReg('sunsetSun', { name: '夕日', tags: ['emotional', 'calm', 'pop'], w: 0.8,
  plan: rng => ({ seed: bs(rng), hz: rng.range(0.7, 0.76), R: rng.range(0.12, 0.16), cx: rng.pick([rng.range(0.22, 0.34), rng.range(0.66, 0.78)]), k: rng.range(0.28, 0.36) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.t, sd = P.seed || 1, U = Umin(env), dk = isDark(sc.bg), e = fadeIn(env, 1.2), k = P.k || 0.35;
    const hz = H * (P.hz || 0.72) * (W < H ? 0.97 : 1), R = U * (P.R || 0.14), cx = W * (W < H ? 0.5 + ((P.cx || 0.3) - 0.5) * 0.6 : (P.cx || 0.3)), bt = bgT(env);
    const cy = hz - R * 0.5 + R * 0.35 * clamp(bt / 14) + (1 - e) * R * 0.9;
    const sunBase = dk ? glowOf(sc) : sc.accent, sunC = J.mix(sc.bg, sunBase, k * (dk ? 1 : 0.7));
    const sky = ctx.createLinearGradient(0, hz - H * 0.5, 0, hz);
    sky.addColorStop(0, J.rgba(sunBase, 0)); sky.addColorStop(1, J.rgba(sunBase, (dk ? 0.12 : 0.1) * e));
    ctx.fillStyle = sky; ctx.fillRect(0, hz - H * 0.5, W, H * 0.5);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, hz); ctx.clip();
    const halo = ctx.createRadialGradient(cx, cy, R, cx, cy, R * 3);
    halo.addColorStop(0, J.rgba(sunC, 0.45 * e)); halo.addColorStop(1, J.rgba(sunC, 0));
    ctx.fillStyle = halo; ctx.fillRect(cx - R * 3, cy - R * 3, R * 6, R * 6);
    ctx.globalAlpha = e; ctx.fillStyle = sunC; ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.globalAlpha = e; ctx.fillStyle = layC(sc, 0.14); ctx.fillRect(0, hz - 0.5, W, Math.max(1, U * 0.0016));
    // water: shimmering reflection strokes under the sun + faint swell lines
    ctx.fillStyle = sunC;
    for (let j = 0; j < 18; j++) {
      const y = hz + U * 0.012 * Math.pow(j + 1, 1.3); if (y > H) break;
      const q = j / 18, hh = Math.max(1.2, U * 0.0035 * (1 + j * 0.1));
      const wv = R * (1.25 - q * 0.6) * (0.55 + 0.45 * J.noise1(t * 1.3 + j * 1.9, sd)), xo = R * 0.18 * J.noise1(t * 0.9 + j * 2.7, sd + 3);
      ctx.globalAlpha = e * 0.75 * (1 - q) * (0.6 + 0.4 * J.noise1(t * 2 + j, sd + 5));
      const split = 0.2 + 0.15 * J.noise1(t * 1.7 + j * 3.3, sd + 9);
      ctx.fillRect(cx + xo - wv, y, wv * (1 - split), hh); ctx.fillRect(cx + xo - wv + wv * (1 + split) , y, wv * (1 - split), hh);
    }
    ctx.fillStyle = layC(sc, 0.08);
    for (let j = 0; j < 7; j++) {
      const y = hz + (H - hz) * (0.12 + j * 0.13), x = wrap(t * U * 0.03 * (j % 2 ? 1 : -1) + J.r(sd, j, 31) * W, W * 1.4) - W * 0.2;
      ctx.globalAlpha = e * 0.8; ctx.fillRect(x, y, U * J.rr(0.15, 0.4, sd, j, 32), Math.max(1, U * 0.0018));
    }
  } });

bgReg('oceanWaves', { name: '海の波', tags: ['calm', 'emotional', 'editorial'], w: 0.8,
  plan: rng => ({ seed: bs(rng), n: rng.int(9, 13), hz: rng.range(0.48, 0.58), k: rng.range(0.12, 0.17), dir: rng.pick([1, -1]) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.t, sd = P.seed || 1, U = Umin(env), n = P.n || 11, hz = P.hz || 0.52, e = fadeIn(env, 0.9), dir = P.dir || 1;
    const m = clamp(Math.round(W / (U * 0.012)), 60, 200);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
      const q = (i + 1) / n, y0 = H * (hz + (1 - hz) * Math.pow(q, 1.55)) + (1 - e) * H * 0.15 * q;
      const A = U * (0.004 + 0.028 * Math.pow(q, 1.4)), lam = W * (0.07 + 0.3 * q), w = 0.9 + 0.5 * J.r(sd, i, 1), ph = J.r(sd, i, 2) * TAU;
      ctx.beginPath();
      for (let j = 0; j <= m; j++) {
        const x = W * j / m, u = x / lam * TAU;
        const y = y0 + A * (Math.sin(u - t * w * dir + ph) + 0.35 * Math.sin(u * 2.3 + t * w * 1.3 * dir + ph * 2) + 0.2 * J.noise1(x / U * 3 + t * 0.4, sd + i));
        j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.globalAlpha = e; ctx.strokeStyle = layC(sc, (P.k || 0.14) * (0.45 + 0.75 * q)); ctx.lineWidth = Math.max(1, U * (0.0014 + 0.0035 * q)); ctx.stroke();
    }
  } });

bgReg('rainWindow', { name: '雨の窓', tags: ['emotional', 'calm', 'editorial'], w: 0.8,
  plan: rng => ({ seed: bs(rng), ang: rng.range(4, 13) * rng.pick([1, -1]), n: rng.int(100, 140), k: rng.range(0.15, 0.2), drops: rng.int(16, 24) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.t, sd = P.seed || 1, U = Umin(env), e = fadeIn(env, 0.6), k = P.k || 0.15, dk = isDark(sc.bg);
    const area = Math.sqrt(W * H / (1920 * 1080)), n = Math.round((P.n || 70) * area), tn = Math.tan((P.ang || 8) * DEG), span = W + H * Math.abs(tn);
    ctx.strokeStyle = layC(sc, k); ctx.lineWidth = Math.max(1, U * 0.0016); ctx.lineCap = 'round'; ctx.globalAlpha = e * 0.85; ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const v = H * J.rr(1.3, 2.1, sd, i, 1), L = H * J.rr(0.03, 0.09, sd, i, 2);
      const y = wrap(J.r(sd, i, 4) * (H + L) + t * v, H + L) - L, x = J.r(sd, i, 3) * span - (tn > 0 ? H * tn : 0) + y * tn;
      ctx.moveTo(x, y); ctx.lineTo(x + L * tn, y + L);
    }
    ctx.stroke();
    const fog = ctx.createLinearGradient(0, H * 0.62, 0, H);
    fog.addColorStop(0, J.rgba(sc.fg, 0)); fog.addColorStop(1, J.rgba(sc.fg, 0.05 * e));
    ctx.globalAlpha = 1; ctx.fillStyle = fog; ctx.fillRect(0, H * 0.62, W, H * 0.38);
    // drops on the glass: sit, grow, then slide down leaving a trail
    const dc = layC(sc, k * 1.5), hc = dk ? layC(sc, k * 3.5) : J.mix(sc.bg, '#FFFFFF', 0.7);
    for (let i = 0; i < (P.drops || 12); i++) {
      const per = J.rr(3.5, 6.5, sd, i, 11), u = wrap(t + J.r(sd, i, 12) * per, per) / per, u0 = 0.6;
      const cyc = Math.floor((t + J.r(sd, i, 12) * per) / per), x0 = J.rr(0.03, 0.97, sd, i, cyc, 13) * W, y0 = J.rr(0.04, 0.7, sd, i, cyc, 14) * H;
      let r = U * J.rr(0.008, 0.019, sd, i, 15), x = x0, y = y0, a = e * clamp(u / 0.08);
      if (u < u0) r *= 0.65 + 0.35 * u / u0;
      else {
        const q = (u - u0) / (1 - u0);
        y = y0 + E.inQuad(q) * H * 1.15; x = x0 + U * 0.006 * Math.sin(q * 18 + i);
        ctx.globalAlpha = e * 0.55 * (1 - q * 0.5); ctx.strokeStyle = dc; ctx.lineWidth = r * 0.45;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(x0 + U * 0.004 * Math.sin(i), (y0 + y) / 2, x, y - r * 0.8); ctx.stroke();
      }
      if (y - r > H) continue;
      ctx.globalAlpha = a * 0.9; ctx.fillStyle = dc; ctx.beginPath(); ctx.ellipse(x, y, r * 0.9, r, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = a * 0.7; ctx.fillStyle = hc; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.28, 0, TAU); ctx.fill();
    }
  } });

const softDot = col => cached('dot|' + col, () => {
  const c = mkCv(64, 64), x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, J.rgba(col, 1)); g.addColorStop(0.45, J.rgba(col, 0.75)); g.addColorStop(1, J.rgba(col, 0));
  x.fillStyle = g; x.fillRect(0, 0, 64, 64); return c;
});
bgReg('snowLayers', { name: '雪', tags: ['calm', 'emotional'], w: 0.9,
  plan: rng => ({ seed: bs(rng), wind: rng.range(-0.45, 0.45), dens: rng.range(0.85, 1.2) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.t, sd = P.seed || 1, U = Umin(env), e = fadeIn(env, 1);
    const col = J.lum(sc.bg) < 0.88 ? J.mix(sc.bg, '#FFFFFF', 0.92) : layC(sc, 0.35), spr = softDot(col), area = Math.sqrt(W * H / (1920 * 1080)) * (P.dens || 1);
    const layers = [[70, 0.0045, 0.05, 0.012, 0.5], [36, 0.009, 0.09, 0.02, 0.6], [11, 0.02, 0.16, 0.035, 0.32]];
    layers.forEach(([cnt, sz, v, sw, aB], l) => {
      const n = Math.round(cnt * area), vy = H * v, vx = vy * (P.wind || 0);
      for (let i = 0; i < n; i++) {
        const s = U * sz * (0.7 + 0.6 * J.r(sd, l, i, 1)), f = J.rr(0.5, 1.3, sd, l, i, 2);
        const y = wrap(J.r(sd, l, i, 3) * H * 1.2 + t * vy * (0.8 + 0.4 * J.r(sd, l, i, 4)), H * 1.2) - H * 0.1;
        const x = wrap(J.r(sd, l, i, 5) * W * 1.1 + t * vx + Math.sin(t * f + i) * U * sw, W * 1.1) - W * 0.05;
        ctx.globalAlpha = aB * e * (0.6 + 0.4 * J.r(sd, l, i, 6));
        ctx.drawImage(spr, x - s, y - s, s * 2, s * 2);
      }
    });
  } });

bgReg('fireworks', { name: '花火', tags: ['pop', 'emotional'], w: 0.7,
  plan: rng => ({ seed: bs(rng), per: rng.range(0.55, 0.8), k: rng.range(0.42, 0.55) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.t, sd = P.seed || 1, U = Umin(env), dk = isDark(sc.bg), e = fadeIn(env, 0.3), cols = hues(sc);
    const per = P.per || 0.65, idx = Math.floor(t / per), launch = 0.45, life = 2, K = (P.k || 0.48) * e * (dk ? 1 : 0.6), g = U * 0.11;
    if (dk) ctx.globalCompositeOperation = 'screen';
    ctx.lineCap = 'round';
    for (let b = idx - 5; b <= idx; b++) {
      const t0 = b * per + J.r(sd, b, 1) * per * 0.5, age = t - t0;
      if (age < 0 || age > launch + life) continue;
      const ox = W * J.rr(0.1, 0.9, sd, b, 2), oy = H * J.rr(0.1, 0.48, sd, b, 3), base = cols[J.h(sd, b, 4) % cols.length], c = dk ? base : J.mix(base, sc.bg, 0.2);
      if (age < launch) {
        const q = E.outQuad(age / launch), y = lerp(H * 1.02, oy, q), y2 = lerp(H * 1.02, oy, E.outQuad(Math.max(0, age - 0.12) / launch));
        ctx.globalAlpha = K * 0.6; ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, U * 0.0022);
        ctx.beginPath(); ctx.moveTo(ox + Math.sin(age * 30) * U * 0.002, y); ctx.lineTo(ox, y2); ctx.stroke();
        continue;
      }
      const a = age - launch, n0 = 28 + (J.h(sd, b, 5) % 14), n = n0 * 2, V = U * J.rr(0.7, 1.05, sd, b, 6), fade = Math.pow(1 - a / life, 1.6);
      const pos = (j, tt, sp, th) => { const d = sp * (1 - Math.exp(-2.6 * tt)) / 2.6; return [ox + Math.cos(th) * d, oy + Math.sin(th) * d + 0.5 * g * tt * tt]; };
      ctx.strokeStyle = c; ctx.lineWidth = Math.max(1, U * 0.0024); ctx.globalAlpha = K * fade; ctx.beginPath();
      const heads = [];
      for (let j = 0; j < n; j++) {
        const ring = j >= n0, th = (j % n0) / n0 * TAU + (ring ? Math.PI / n0 : 0) + J.rs(sd, b, j) * 0.1, sp = V * (ring ? 0.55 : 1) * (0.85 + 0.15 * J.r(sd, b, j, 7));
        const p1 = pos(j, a, sp, th), p0 = pos(j, Math.max(0, a - 0.16), sp, th);
        ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); heads.push(p1);
      }
      ctx.stroke();
      ctx.fillStyle = dk ? J.mix(c, '#FFFFFF', 0.5) : c;
      for (let j = 0; j < heads.length; j++) {
        if (a > 0.9 && J.r(sd, b, j, env.step) < 0.35) continue;         // crackle at the end
        ctx.globalAlpha = K * fade; const r = U * 0.0028; ctx.fillRect(heads[j][0] - r, heads[j][1] - r, r * 2, r * 2);
      }
      if (a < 0.25) {
        const fr = U * 0.12, gg = ctx.createRadialGradient(ox, oy, 0, ox, oy, fr);
        gg.addColorStop(0, J.rgba(c, K * 0.6 * (1 - a / 0.25))); gg.addColorStop(1, J.rgba(c, 0));
        ctx.globalAlpha = 1; ctx.fillStyle = gg; ctx.fillRect(ox - fr, oy - fr, fr * 2, fr * 2);
      }
    }
  } });

bgReg('cloudLayers', { name: '雲', tags: ['calm', 'emotional', 'pop'], w: 0.8,
  plan: rng => ({ seed: bs(rng), dir: rng.pick([1, -1]), k: rng.range(0.06, 0.09) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.t, sd = P.seed || 1, U = Umin(env), e = fadeIn(env, 1), k = P.k || 0.075, dir = P.dir || 1;
    const layers = [[0.1, 0.3, 0.55, 0.012, 0.55], [0.3, 0.55, 0.8, 0.026, 0.8], [0.72, 0.98, 1.15, 0.05, 1.1]];
    layers.forEach(([ya, yb, scl, v, km], l) => {
      const cw0 = U * 0.5 * scl, Lp = W + cw0 * 2.4, path = new Path2D();
      for (let c = 0; c < 4; c++) {
        const cw = cw0 * J.rr(0.75, 1.2, sd, l, c, 1), x = wrap((c + J.r(sd, l, c, 2) * 0.6) / 4 * Lp + t * U * v * dir, Lp) - cw * 1.2;
        const y = H * J.rr(ya, yb, sd, l, c, 3) + (1 - e) * H * 0.05 * (l + 1), np = 5 + (J.h(sd, l, c) % 3);
        let rmin = 1e9;
        for (let p = 0; p < np; p++) {
          const f = (p + 0.5) / np, pr = cw / np * (0.75 + 1.05 * Math.sin(Math.PI * f)) * (0.85 + 0.3 * J.r(sd, l, c, p, 4)) * (1 + 0.04 * Math.sin(t * 0.6 + p + c));
          const px = x + cw * f + J.rs(sd, l, c, p, 5) * cw * 0.03;
          path.moveTo(px + pr, y - pr); path.arc(px, y - pr, pr, 0, TAU); rmin = Math.min(rmin, pr);
        }
        path.rect(x + cw * 0.5 / np, y - rmin, cw * (1 - 1 / np), rmin);
      }
      ctx.globalAlpha = 1; ctx.fillStyle = layC(sc, k * km); ctx.fill(path);
    });
  } });

bgReg('mountains', { name: '山並み', tags: ['calm', 'emotional', 'editorial'], w: 0.8,
  plan: rng => ({ seed: bs(rng), n: rng.int(3, 4), k: rng.range(0.07, 0.1), dir: rng.pick([1, -1]), mist: rng.chance(0.7) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.t, sd = P.seed || 1, U = Umin(env), e = fadeIn(env, 1.1), n = P.n || 3, k = P.k || 0.085;
    const m = clamp(Math.round(W / (U * 0.01)), 60, 220), port = H > W;
    for (let l = 0; l < n; l++) {
      const q = n > 1 ? l / (n - 1) : 1, base = H * ((port ? 0.68 : 0.64) + 0.14 * q) + (1 - e) * H * 0.3 * (1 - q * 0.4), A = H * (port ? 0.17 : 0.3) * (1 - 0.35 * q);
      const off = t * 0.012 * (l + 1) * (P.dir || 1) + l * 7.3, sc2 = U * (0.42 + 0.2 * (1 - q));
      ctx.beginPath(); ctx.moveTo(-2, H + 2);
      for (let j = 0; j <= m; j++) {
        const x = W * j / m, X = x / sc2 + off;
        let v = 0, amp = 1, f = 1, nrm = 0;
        for (let o = 0; o < 4; o++) { v += (1 - Math.abs(J.noise1(X * f, sd + l * 31 + o * 7))) * amp; nrm += amp; amp *= 0.48; f *= 2.2; }
        v = clamp((v / nrm - 0.4) * 1.8);
        ctx.lineTo(x, base - A * Math.pow(v, 2));
      }
      ctx.lineTo(W + 2, H + 2); ctx.closePath();
      ctx.fillStyle = layC(sc, k * (0.45 + 0.75 * q)); ctx.globalAlpha = 1; ctx.fill();
      if (P.mist !== false && l < n - 1) {
        const g = ctx.createLinearGradient(0, base - A * 0.25, 0, base + H * 0.06);
        g.addColorStop(0, J.rgba(sc.bg, 0)); g.addColorStop(1, J.rgba(sc.bg, 0.55));
        ctx.fillStyle = g; ctx.fillRect(0, base - A * 0.25, W, A * 0.25 + H * 0.06);
        ctx.fillStyle = J.rgba(sc.bg, 0.55); ctx.fillRect(0, base + H * 0.06, W, H);
      }
    }
  } });

/* ================= TEXTURE / EFFECT ================= */
bgReg('filmStrip', { name: 'フィルム', tags: ['editorial', 'emotional', 'glitch'], w: 0.7,
  plan: rng => ({ seed: bs(rng), dir: rng.pick([1, -1]), spd: rng.range(0.6, 1.2), scratch: rng.chance(0.7) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.t, sd = P.seed || 1, U = Umin(env), dk = isDark(sc.bg), e = E.outExpo(clamp(bgT(env) / 0.55)), vert = H > W;
    const b = U * 0.085, L = vert ? H : W, slide = (1 - e) * b * 1.3;
    const band = dk ? layC(sc, 0.05) : layC(sc, 0.13), hole = dk ? layC(sc, 0.17) : J.mix(sc.bg, '#FFFFFF', 0.55), edge = dk ? layC(sc, 0.12) : layC(sc, 0.22);
    const p = b * 0.62, hw = b * 0.3, hh = b * 0.38, off = wrap(t * p * (P.spd || 0.9) * (P.dir || 1), p);
    const R = (a, c, w, h) => (vert ? ctx.rect(c, a, h, w) : ctx.rect(a, c, w, h));     // a: along, c: across
    for (const side of [0, 1]) {
      const c0 = side ? (vert ? W : H) - b + slide : -slide;
      ctx.fillStyle = band; ctx.beginPath(); R(0, c0, L, b); ctx.fill();
      ctx.fillStyle = edge; ctx.beginPath(); R(0, side ? c0 : c0 + b - Math.max(1, U * 0.002), L, Math.max(1, U * 0.002)); ctx.fill();
      ctx.fillStyle = hole; ctx.beginPath();
      for (let a = off - p; a < L + p; a += p) {
        const x = a + (p - hw) / 2, y = c0 + (b - hh) / 2 + (side ? b * 0.12 : -b * 0.12), r = b * 0.06;
        if (vert) ctx.roundRect ? ctx.roundRect(y, x, hh, hw, r) : ctx.rect(y, x, hh, hw); else ctx.roundRect ? ctx.roundRect(x, y, hw, hh, r) : ctx.rect(x, y, hw, hh);
      }
      ctx.fill();
      // frame dividers every 4 perforations
      ctx.fillStyle = edge; ctx.beginPath();
      for (let a = wrap(off, p * 4) - p * 4; a < L + p; a += p * 4) R(a, c0 + b * (side ? 0.72 : 0.08), Math.max(1, U * 0.002), b * 0.2);
      ctx.fill();
    }
    if (P.scratch !== false) {        // flickering scratches + dust (change on the drawing clock)
      const st = env.step;
      ctx.fillStyle = dk ? layC(sc, 0.35) : layC(sc, 0.3);
      for (let i = 0; i < 3; i++) {
        if (J.r(sd, st, i, 1) > 0.55) continue;
        const x = J.r(sd, st >> 2, i, 2) * (vert ? H : W) + J.rs(sd, st, i, 3) * U * 0.004, w = Math.max(1, U * J.rr(0.0008, 0.002, sd, st, i, 4));
        ctx.globalAlpha = e * J.rr(0.1, 0.22, sd, st, i, 5);
        if (vert) ctx.fillRect(0, x, W, w); else ctx.fillRect(x, 0, w, H);
      }
      for (let i = 0; i < 6; i++) {
        if (J.r(sd, st, i, 6) > 0.5) continue;
        const r = U * J.rr(0.001, 0.003, sd, st, i, 7);
        ctx.globalAlpha = e * 0.25; ctx.fillRect(J.r(sd, st, i, 8) * W, J.r(sd, st, i, 9) * H, r * 2, r * 1.4);
      }
    }
  } });

// VHS speckle noise, pre-rendered once per colour / size (3 variants swapped on the drawing clock)
const vhsNoise = (col, w, h, v) => cached(`vhs|${col}|${w}x${h}|${v}`, () => {
  const c = mkCv(w, h), x = c.getContext('2d'), id = x.createImageData(w, h), d = id.data, [r, g, b] = J.hex(col);
  for (let y = 0; y < h; y++) {
    const row = 0.35 + 0.65 * hash2(3, y, v * 13 + 1);
    for (let i = 0; i < w; i++) {
      let n = hash2(i >> 1, y, v * 7 + 2); n = n * n * n;
      if (hash2(i >> 4, y, v * 5 + 3) > 0.94) n = Math.max(n, 0.55 + 0.45 * hash2(i, y, v + 9));
      const o = (y * w + i) * 4; d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = Math.round(255 * clamp(n * row));
    }
  }
  x.putImageData(id, 0, 0); return c;
});
bgReg('vhsBand', { name: 'VHSノイズ', tags: ['glitch', 'emotional'], w: 0.6,
  plan: rng => ({ seed: bs(rng), h: rng.range(0.07, 0.12), spd: rng.range(0.08, 0.16) * rng.pick([1, -1]), k: rng.range(0.22, 0.32) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.t, sd = P.seed || 1, U = Umin(env), dk = isDark(sc.bg), e = fadeIn(env, 0.3), st = env.step;
    const q = Math.min(1, env.scale || 1) * 0.5, nw = Math.max(64, Math.ceil(W * q)), nh = Math.max(32, Math.ceil(H * 0.2 * q));
    const col = dk ? sc.fg : J.mix(sc.fg, sc.bg, 0.2), k = (P.k || 0.26) * e * (dk ? 1 : 0.75), nz = vhsNoise(col, nw, nh, ((st % 3) + 3) % 3);
    const bh = H * (P.h || 0.09), y = wrap(t * H * (P.spd || 0.12) + J.r(sd, 1) * H, H * 1.3) - H * 0.15;
    ctx.imageSmoothingEnabled = false;
    // rolling band: noise, soft smear and a couple of tracking lines
    const sh = Math.min(nh, Math.ceil(bh * q)), sy = Math.floor(J.r(sd, st, 2) * Math.max(1, nh - sh));
    ctx.globalAlpha = k; ctx.drawImage(nz, 0, sy, nw, sh, J.rs(sd, st, 3) * U * 0.01, y, W, bh);
    const g = ctx.createLinearGradient(0, y - bh * 0.6, 0, y + bh * 1.4), lc = lightOn(sc);
    g.addColorStop(0, J.rgba(lc, 0)); g.addColorStop(0.4, J.rgba(lc, dk ? 0.05 : 0.1)); g.addColorStop(1, J.rgba(lc, 0));
    ctx.globalAlpha = e; ctx.fillStyle = g; ctx.fillRect(0, y - bh * 0.6, W, bh * 2);
    ctx.fillStyle = layC(sc, dk ? 0.3 : 0.2);
    for (let i = 0; i < 3; i++) {
      const ly = y + bh * J.r(sd, st >> 1, i, 4), lx = J.r(sd, st, i, 5) * W * 0.6;
      ctx.globalAlpha = e * 0.5; ctx.fillRect(lx, ly, W * J.rr(0.2, 0.6, sd, st, i, 6), Math.max(1, U * 0.0016));
    }
    // head-switching strip at the bottom: torn, horizontally displaced noise
    const hb = H * 0.028, rows = 4;
    for (let r = 0; r < rows; r++) {
      const ry = H - hb + hb * r / rows, dx = J.rs(sd, st, r, 7) * U * 0.03 + U * 0.02 * (rows - r) / rows;
      ctx.globalAlpha = k * 0.9; ctx.drawImage(nz, 0, (sy + r * 3) % Math.max(1, nh - 2), nw, 2, dx, ry, W, hb / rows + 0.5);
    }
  } });

bgReg('tornPaper', { name: '破れ紙', tags: ['editorial', 'emotional', 'pop'], w: 0.7,
  plan: rng => ({ seed: bs(rng), v: rng.pick(['tb', 'tb', 'diag', 'side']), k: rng.range(0.05, 0.08) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.t, sd = P.seed || 1, U = Umin(env), dk = isDark(sc.bg), bt = bgT(env), k = P.k || 0.065;
    let v = P.v || 'tb'; if (v === 'side' && H > W) v = 'tb';
    // [A, B, n] = edge from A to B, the sheet covers the side of the normal n
    const S = v === 'diag' ? [[[-W * 0.05, H * 0.58], [W * 0.5, H * 1.05], [-0.7, 0.7]], [[W * 0.55, -H * 0.05], [W * 1.05, H * 0.48], [0.7, -0.7]]]
      : v === 'side' ? [[[W * 0.13, -H * 0.05], [W * 0.1, H * 1.05], [-1, 0]], [[W * 0.9, -H * 0.05], [W * 0.87, H * 1.05], [1, 0]]]
        : [[[-W * 0.05, H * 0.83], [W * 1.05, H * 0.79], [0, 1]], [[-W * 0.05, H * 0.13], [W * 1.05, H * 0.17], [0, -1]]];
    const tones = dk ? [layC(sc, k), J.mix(sc.bg, sc.accent, k * 1.6)] : [J.mix(sc.bg, '#FFFFFF', 0.5), layC(sc, k)];
    S.forEach(([A, B, nrm], i) => {
      const inP = E.outCubic(clamp((bt - i * 0.12) / 0.6)), push = (1 - inP) * U * 0.35 + Math.sin(t * 0.5 + i * 2) * U * 0.004;
      const ox = nrm[0] * push, oy = nrm[1] * push, len = Math.hypot(B[0] - A[0], B[1] - A[1]), N = Math.min(260, Math.ceil(len / (U * 0.009)));
      const tx = (B[0] - A[0]) / len, ty = (B[1] - A[1]) / len, pts = [];
      for (let j = 0; j <= N; j++) {
        const u = j / N, o = U * (0.018 * J.noise1(u * 9, sd + i * 17) + 0.007 * J.noise1(u * 45, sd + i * 5) + 0.0035 * J.rs(sd, i, j));
        pts.push([A[0] + (B[0] - A[0]) * u + nrm[0] * o + ox, A[1] + (B[1] - A[1]) * u + nrm[1] * o + oy]);
      }
      const far = Math.hypot(W, H);
      const poly = pts.concat([[B[0] + nrm[0] * far + ox + tx * far * 0.2, B[1] + nrm[1] * far + oy + ty * far * 0.2], [A[0] + nrm[0] * far + ox - tx * far * 0.2, A[1] + nrm[1] * far + oy - ty * far * 0.2]]);
      const sd2 = U * 0.008;
      ctx.save(); ctx.translate(-nrm[0] * sd2 * 0.5, -nrm[1] * sd2 * 0.5 + sd2 * 0.6);
      ctx.fillStyle = `rgba(0,0,0,${dk ? 0.35 : 0.1})`; ctx.beginPath(); pathPoly(ctx, poly); ctx.fill(); ctx.restore();
      ctx.fillStyle = tones[i % 2]; ctx.beginPath(); pathPoly(ctx, poly); ctx.fill();
      // fibrous torn rim (the paper core shows lighter along the tear)
      ctx.strokeStyle = dk ? layC(sc, k * 2.4) : J.mix(tones[i % 2], '#FFFFFF', 0.75); ctx.lineWidth = Math.max(1, U * 0.004); ctx.lineJoin = 'round';
      ctx.beginPath(); pts.forEach((p, q) => (q ? ctx.lineTo(p[0] - nrm[0] * U * 0.002, p[1] - nrm[1] * U * 0.002) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
    });
  } });

bgReg('godRays', { name: '光芒', tags: ['emotional', 'calm', 'editorial'], w: 0.8,
  plan: rng => ({ seed: bs(rng), x: rng.pick([rng.range(0.12, 0.35), rng.range(0.65, 0.88), 0.5]), n: rng.int(7, 11), spread: rng.range(45, 75), k: rng.range(0.11, 0.16), dust: rng.chance(0.75) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.t, sd = P.seed || 1, U = Umin(env), dk = isDark(sc.bg), e = fadeIn(env, 1);
    const rc = dk ? lightOn(sc) : J.lum(sc.bg) < 0.8 ? '#FFFFFF' : J.mix(sc.accent, sc.bg, 0.3), k = (P.k || 0.13) * e * (dk ? 1.35 : 1.4);
    const sx = W * (P.x ?? 0.5) + W * 0.04 * Math.sin(t * 0.1 + (sd % 7)), sy = -H * 0.12, L = Math.hypot(W, H) * 1.25, n = P.n || 9;
    const base = Math.atan2(H * 0.55 - sy, W * 0.5 - sx);
    drawLow(ctx, env, 4, x => {
      const paths = [new Path2D(), new Path2D(), new Path2D()];
      for (let i = 0; i < n; i++) {
        const a = base + ((P.spread || 60) * (i / (n - 1) - 0.5) + J.rs(sd, i, 1) * 4 + 3 * J.noise1(t * 0.15 + i * 1.3, sd)) * DEG;
        const w = (1.2 + 3.6 * J.r(sd, i, 2)) * DEG * (0.75 + 0.25 * J.noise1(t * 0.4 + i, sd + 7));
        const lv = 0.5 + 0.5 * J.noise1(t * 0.35 + i * 2.1, sd + 3), dim = lv > 0.66 ? 0 : lv > 0.33 ? 1 : 2;
        [0.45, 1, 1.8].forEach((f, q) => {          // nested wedges → soft falloff across the beam
          const p = paths[Math.min(2, q + dim)], ww = w * f;
          p.moveTo(sx, sy); p.lineTo(sx + Math.cos(a - ww / 2) * L, sy + Math.sin(a - ww / 2) * L); p.lineTo(sx + Math.cos(a + ww / 2) * L, sy + Math.sin(a + ww / 2) * L); p.closePath();
        });
      }
      const g = x.createRadialGradient(sx, sy, 0, sx, sy, L);
      g.addColorStop(0, J.rgba(rc, Math.min(1, k * 1.3))); g.addColorStop(0.3, J.rgba(rc, k * 0.6)); g.addColorStop(0.7, J.rgba(rc, k * 0.12)); g.addColorStop(1, J.rgba(rc, 0));
      x.fillStyle = g;
      [0.55, 0.3, 0.16].forEach((m, l) => { x.globalAlpha = m; x.fill(paths[l]); });
    });
    if (P.dust !== false) {        // dust motes drifting through the light
      ctx.fillStyle = rc;
      for (let i = 0; i < 26; i++) {
        const x = wrap(J.r(sd, i, 11) * W + t * U * J.rs(sd, i, 12) * 0.02 + Math.sin(t * 0.5 + i) * U * 0.01, W), y = wrap(J.r(sd, i, 13) * H + t * U * J.rr(-0.02, 0.01, sd, i, 14), H);
        const r = U * J.rr(0.0012, 0.003, sd, i, 15), near = clamp(1 - Math.hypot(x - sx, y - sy) / L);
        ctx.globalAlpha = e * (0.15 + 0.35 * near) * (0.5 + 0.5 * Math.sin(t * J.rr(0.8, 2, sd, i, 16) + i)); ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
  } });

bgReg('vignettePulse', { name: '色の周辺光', tags: ['emotional', 'calm', 'pop'], w: 0.9, subtle: true,
  plan: rng => ({ seed: bs(rng), k: rng.range(0.3, 0.42), two: rng.chance(0.6), rate: rng.range(0.35, 0.55) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.t, U = Umin(env), dk = isDark(sc.bg), e = fadeIn(env, 0.8), cols = hues(sc);
    const pulse = env.beat ? 0.62 + 0.38 * Math.exp(-env.beat.since * 4) : 0.75 + 0.25 * Math.sin(t * TAU * (P.rate || 0.45));
    const k = (P.k || 0.35) * e * pulse * (dk ? 1 : 0.8), cA = J.mix(sc.bg, cols[0], 0.7), cB = J.mix(sc.bg, cols[1] || cols[0], 0.7), R = Math.hypot(W, H) / 2;
    drawLow(ctx, env, 6, x => {
      if (P.two !== false) {
        for (const [cx, cy, c, ph] of [[0, 0, cA, 0], [W, H, cB, 1.7]]) {
          const rr = R * (1.25 + 0.08 * Math.sin(t * 0.6 + ph)), g = x.createRadialGradient(cx, cy, 0, cx, cy, rr);
          g.addColorStop(0, J.rgba(c, k)); g.addColorStop(0.45, J.rgba(c, k * 0.35)); g.addColorStop(1, J.rgba(c, 0));
          x.fillStyle = g; x.fillRect(0, 0, W, H);
        }
      } else {
        const g = x.createRadialGradient(W / 2, H / 2, U * 0.32 * (1.08 - 0.12 * pulse), W / 2, H / 2, R * 1.05);
        g.addColorStop(0, J.rgba(cA, 0)); g.addColorStop(0.6, J.rgba(cA, k * 0.45)); g.addColorStop(1, J.rgba(cA, k * 1.1));
        x.fillStyle = g; x.fillRect(0, 0, W, H);
      }
    });
  } });

bgReg('kaleidoscope', { name: '万華鏡', tags: ['pop', 'glitch', 'emotional'], w: 0.6,
  plan: rng => ({ seed: bs(rng), n: rng.pick([6, 8, 8, 10]), m: rng.int(6, 9), k: rng.range(0.075, 0.1), spd: rng.range(0.05, 0.1) * rng.pick([1, -1]) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.t, sd = P.seed || 1, U = Umin(env), e = fadeIn(env, 0.8), n = P.n || 8, m = P.m || 7, k = P.k || 0.085;
    const cx = W / 2, cy = H / 2, R = Math.hypot(W, H) * 0.58, seg = Math.PI / n, r0 = U * 0.13, rot = t * (P.spd || 0.07);
    const fillP = new Path2D(), lineP = new Path2D();
    const put = (p, type, x, y, s, a, flip) => {
      const c = Math.cos(a), si = Math.sin(a), T = (px, py) => [x + px * c - py * flip * si, y + px * si + py * flip * c];
      if (type === 2) { p.moveTo(x + s * 0.55, y); p.arc(x, y, s * 0.55, 0, TAU); return; }
      const pts = type === 0 ? [[s, 0], [-s / 2, s * 0.8], [-s / 2, -s * 0.3]] : [[s, 0], [0, s * 0.42], [-s * 0.7, 0], [0, -s * 0.42]];
      const q = pts.map(([u, v]) => T(u, v)); p.moveTo(q[0][0], q[0][1]); for (let i = 1; i < q.length; i++) p.lineTo(q[i][0], q[i][1]); p.closePath();
    };
    for (let j = 0; j < m; j++) {
      const type = J.h(sd, j) % 3, v = 0.6 + 0.8 * J.r(sd, j, 2);
      const r = r0 + wrap(J.r(sd, j, 1) * (R - r0) + t * U * 0.05 * v, R - r0), fade = clamp((r - r0) / (U * 0.15)) * clamp((R - r) / (U * 0.2)) * e;
      if (fade <= 0.02) continue;
      const phi = seg * (0.15 + 0.7 * (0.5 + 0.5 * Math.sin(t * 0.35 * v + j * 1.9))), s = r * (0.09 + 0.1 * J.r(sd, j, 3)) * fade, own = t * J.rs(sd, j, 4) * 1.2 + j;
      const p = J.r(sd, j, 5) < 0.35 ? lineP : fillP;
      for (let q = 0; q < n; q++) {
        const b = rot + q * 2 * seg;
        put(p, type, cx + Math.cos(b + phi) * r, cy + Math.sin(b + phi) * r, s, b + phi + own, 1);
        put(p, type, cx + Math.cos(b - phi) * r, cy + Math.sin(b - phi) * r, s, b - phi - own, -1);
      }
    }
    ctx.fillStyle = layC(sc, k); ctx.fill(fillP);
    ctx.strokeStyle = tintC(sc, k * 2.4); ctx.lineWidth = Math.max(1, U * 0.0028); ctx.stroke(lineP);
    // faint polygon rings anchoring the symmetry
    ctx.strokeStyle = layC(sc, k * 0.9); ctx.lineWidth = Math.max(1, U * 0.002); ctx.globalAlpha = e; ctx.beginPath();
    for (const [rr, dir] of [[U * 0.46, -1], [U * 0.82, 1]]) for (let q = 0; q <= 2 * n; q++) { const a = -rot * dir * 1.5 + q * seg, x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr; q ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
  } });

// marble veins: computed once per seed / size / colour at low resolution, then slowly turned
const marbleCv = (P, px, c1, c2) => cached(`marb|${P.seed}|${px}|${c1}|${c2}|${P.acc ? 1 : 0}`, () => {
  const c = mkCv(px, px), x = c.getContext('2d'), id = x.createImageData(px, px), d = id.data, sd = P.seed || 1;
  const a = P.ang || 0.7, ca = Math.cos(a), sa = Math.sin(a), cb = Math.cos(a + 1.1), sb = Math.sin(a + 1.1), fq = (P.freq || 3) * TAU, tb = P.turb || 5;
  const A = J.hex(c1), B = J.hex(c2);
  for (let j = 0; j < px; j++) for (let i = 0; i < px; i++) {
    const u = i / px, v = j / px, X = u * 3, Y = v * 3;
    const s1 = Math.sin((u * ca + v * sa) * fq + fbm2(X, Y, sd, 4) * tb), w1 = 1 - Math.abs(s1);
    const cloud = clamp((fbm2(X * 0.9 + 11, Y * 0.9, sd + 21, 2) - 0.42) * 1.6);
    let a1 = Math.pow(w1, 14) * (0.45 + 0.55 * noise2(X * 2.2 + 3, Y * 2.2, sd + 3)) + Math.pow(w1, 4) * 0.08 + cloud * 0.22, a2 = 0;
    if (P.acc) { const s2 = Math.sin((u * cb + v * sb) * fq * 1.6 + fbm2(X * 1.4 + 5, Y * 1.4, sd + 9, 3) * tb * 1.3); a2 = Math.pow(1 - Math.abs(s2), 12) * 0.5; }
    const al = a1 + a2 * (1 - a1), o = (j * px + i) * 4;
    if (al <= 0.003) { d[o + 3] = 0; continue; }
    const f = a2 * (1 - a1) / al;
    d[o] = A[0] + (B[0] - A[0]) * f; d[o + 1] = A[1] + (B[1] - A[1]) * f; d[o + 2] = A[2] + (B[2] - A[2]) * f; d[o + 3] = Math.round(255 * clamp(al));
  }
  x.putImageData(id, 0, 0); return c;
});
bgReg('marble', { name: '大理石', tags: ['calm', 'editorial', 'emotional'], w: 0.7,
  plan: rng => ({ seed: bs(rng), ang: rng.range(0, 3.14), freq: rng.range(1.4, 2.2), turb: rng.range(7, 10), k: rng.range(0.17, 0.22), acc: rng.chance(0.5), dir: rng.pick([1, -1]) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.t, e = fadeIn(env, 1), U = Umin(env), M = U * 0.12, s = (P.seed || 1) % 13;
    const c2 = J.contrast(sc.accent, sc.bg) > 1.3 ? sc.accent : sc.accent2 || sc.fg;
    // low-res vein texture → upscaled once into a frame plate with drift margin → whole-pixel blits per frame
    const key = `marbP|${P.seed}|${(P.ang || 0).toFixed(3)}|${(P.freq || 0).toFixed(3)}|${(P.turb || 0).toFixed(3)}|${P.acc ? 1 : 0}|${sc.fg}|${c2}`;
    const pl = plate(key, env, M * 2, M * 2, (x, w, h) => {
      const D = Math.max(w, h), px = clamp(Math.round(D * Math.min(0.2, resQ(env) * 0.28)), 96, 440);
      x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
      x.drawImage(marbleCv(P, px, sc.fg, c2), (w - D) / 2, (h - D) / 2, D, D);
    });
    ctx.globalAlpha = (P.k || 0.23) * e * (isDark(sc.bg) ? 1 : 0.8);
    blit(ctx, env, pl, M + M * 0.9 * Math.sin(t * 0.06 * (P.dir || 1) + s), M + M * 0.9 * Math.cos(t * 0.045 + s * 2));
  } });

bgReg('paperCut', { name: '切り絵', tags: ['pop', 'emotional', 'calm'], w: 0.7,
  plan: rng => ({ seed: bs(rng), L: rng.int(3, 4), lobes: rng.int(5, 9), k: rng.range(0.06, 0.09), acc: rng.chance(0.5), p: rng.range(2.4, 3.2) }),
  draw(env, P, ctx) {
    const { W, H, sc } = env, t = env.t, sd = P.seed || 1, U = Umin(env), dk = isDark(sc.bg), bt = bgT(env), L = P.L || 3, k = P.k || 0.075, pe = 2 / (P.p || 2.8);
    const cx = W / 2, cy = H / 2, N = 144, lobes = P.lobes || 6;
    for (let i = 0; i < L; i++) {
      const d = L > 1 ? (L - 1 - i) / (L - 1) : 0;                   // 1 = back layer (smallest opening)
      const inP = E.outCubic(clamp((bt - i * 0.1) / 0.8)), grow = 1 + (1 - inP) * 0.7;
      const rx = W * (0.41 + 0.17 * (1 - d)) * grow, ry = H * (0.38 + 0.17 * (1 - d)) * grow, ph = J.r(sd, i, 1) * TAU, sw = t * 0.25 * (i % 2 ? 1 : -1);
      const ox = Math.sin(t * 0.35 + i) * U * 0.006 * (i + 1), oy = Math.cos(t * 0.3 + i) * U * 0.004 * (i + 1);
      const path = new Path2D(); path.rect(-W, -H, W * 3, H * 3);
      for (let j = 0; j < N; j++) {
        const th = j / N * TAU, c = Math.cos(th), s = Math.sin(th);
        const wv = 1 + 0.035 * Math.sin((lobes + i) * th + ph + sw) + 0.014 * Math.sin((lobes * 2 + 3) * th - ph * 1.3 - sw * 0.7);
        const x = cx + ox + rx * Math.sign(c) * Math.pow(Math.abs(c), pe) * wv, y = cy + oy + ry * Math.sign(s) * Math.pow(Math.abs(s), pe) * wv;
        j ? path.lineTo(x, y) : path.moveTo(x, y);
      }
      path.closePath();
      const sh = U * 0.009;
      ctx.save(); ctx.translate(sh * 0.4, sh); ctx.fillStyle = `rgba(0,0,0,${dk ? 0.32 : 0.12})`; ctx.fill(path, 'evenodd'); ctx.restore();
      const hue = P.acc && i % 2 ? sc.accent : sc.fg;
      ctx.fillStyle = dk ? J.mix(sc.bg, hue, k * (0.5 + 0.7 * (i + 1) / L)) : J.mix(sc.bg, i % 2 ? hue : '#FFFFFF', (i % 2 ? k : 0.35) * (0.6 + 0.5 * (i + 1) / L));
      ctx.fill(path, 'evenodd');
    }
  } });

/* ================= CAMERA ================= */
const KM = env => clamp((env.fx.motion ?? 0.7) * 1.25, 0, 1.25);
const cuOf = env => clamp(env.lt / Math.max(0.3, env.cut.dur));
const lagOf = env => Math.max(0, (env.ltb ?? env.lt) - env.lt);
const seedOf = env => (env.cut.seed | 0);
// time since the last beat for this (time-lagged) pass; without beats a fixed period on the cut clock
const beatSince = (env, per) => {
  if (env.beat && env.beat.len > 0.15) { let s = env.beat.since - lagOf(env); if (s < 0) s += env.beat.len; return s; }
  return wrap(env.lt, per);
};

reg('cam', 'orbitDrift', { name: '周回', tags: ['calm', 'emotional', 'graphic'], w: 0.8,
  plan: rng => ({ dir: rng.pick([1, -1]), a0: rng.range(0, 6.28), sp: rng.range(1.1, 1.6) }),
  get: (env, P) => {
    const K = KM(env), d = P.dir || 1, th = (P.a0 || 0) + d * env.lt * (P.sp || 1.3), r = E.outCubic(clamp(env.lt / 0.7));
    return { x: Math.cos(th) * env.W * 0.016 * K * r, y: Math.sin(th) * env.H * 0.02 * K * r, rot: Math.sin(th) * 0.9 * K * r * d, s: 1.02 };
  } });

reg('cam', 'barrelRoll', { name: 'バレルロール', tags: ['pop', 'glitch', 'graphic'], w: 0.5, strong: true,
  plan: rng => ({ dir: rng.pick([1, -1]), a: rng.range(70, 110), d: rng.range(0.42, 0.55) }),
  get: (env, P) => {
    const K = Math.min(1, KM(env)), q = clamp(env.lt / (P.d || 0.5));
    if (q >= 1) return {};
    const r = 1 - E.outBack(q, 1.3);            // quick roll that overshoots a touch and settles level
    return { rot: (P.dir || 1) * (P.a || 90) * K * r, s: 1 - 0.12 * K * Math.sin(Math.PI * Math.min(1, q * 1.25)), blur: 9 * K * clamp(1 - q * 2.2) };
  } });

reg('cam', 'pendulumSway', { name: '振り子', tags: ['emotional', 'pop', 'calm'], w: 0.7,
  plan: rng => ({ a: rng.range(1.8, 2.6), per: rng.range(2, 3), side: rng.pick([1, -1]) }),
  get: (env, P) => {
    // the frame hangs from a pivot above the screen: rotation and sideways travel are coupled
    const K = KM(env), damp = 0.75 + 0.25 * Math.exp(-env.lt * 0.6), L = env.W * 0.62;   // sideways travel ≈ 3% of the width in any aspect
    const phi = (P.a || 2.2) * K * (P.side || 1) * Math.cos(env.lt / (P.per || 2.4) * TAU) * damp * DEG;
    return { x: -L * Math.sin(phi), y: -L * (1 - Math.cos(phi)), rot: phi / DEG, s: 1.02 };
  } });

reg('cam', 'focusIn', { name: 'ピント合わせ', tags: ['emotional', 'calm', 'editorial'], w: 0.9,
  plan: rng => ({ d: rng.range(0.5, 0.8), b: rng.range(10, 15) }),
  get: (env, P) => {
    const K = KM(env), q = E.outCubic(clamp(env.lt / (P.d || 0.65)));
    return { blur: (1 - q) * (P.b || 12) * Math.min(1, K), s: 1 + 0.03 * (1 - q) + 0.012 * K * cuOf(env) };     // lens breathing while focusing
  } });

reg('cam', 'rackFocus', { name: 'ピンぼけ', tags: ['emotional', 'calm', 'editorial'], w: 0.6,
  plan: rng => ({ b: rng.range(5, 8), at: rng.range(0.6, 0.7) }),
  get: (env, P) => {
    const K = KM(env), dur = env.cut.dur, st = Math.max(dur * (P.at || 0.65), dur - 0.9), q = E.inOutSine(clamp((env.lt - st) / Math.max(0.2, dur - st)));
    return { blur: q * (P.b || 6.5) * Math.min(1, K), s: 1.01 - 0.02 * q * K, y: env.H * 0.004 * q };
  } });

reg('cam', 'earthquake', { name: '地震', tags: ['glitch', 'pop', 'emotional'], w: 0.5, strong: true,
  plan: rng => ({ per: rng.range(0.55, 0.8), a: rng.range(0.85, 1.1) }),
  get: (env, P) => {
    // a low rumble all the time, a jolt on every beat (vertical-heavy, on the ≤24 Hz random clock)
    const K = KM(env) * (P.a || 1), hit = Math.exp(-beatSince(env, P.per || 0.65) * 7), amp = K * (0.14 + hit), sd = seedOf(env), st = env.step;
    return { x: J.rs(sd, st, 11) * env.W * 0.005 * amp, y: J.rs(sd, st, 12) * env.H * 0.014 * amp, rot: J.rs(sd, st, 13) * 0.45 * amp, s: 1.02 + 0.012 * hit * K, blur: 1.5 * hit * K };
  } });

reg('cam', 'floatNoise', { name: '浮遊', tags: ['calm', 'emotional'], w: 0.9,
  plan: rng => ({ f: rng.range(0.8, 1.2) }),
  get: (env, P) => {
    const K = KM(env), t = env.lt * (P.f || 1), sd = seedOf(env) + 7;
    return { x: J.noise1(t * 0.6, sd) * env.W * 0.02 * K, y: (J.noise1(t * 0.5 + 5, sd + 1) * 0.7 + 0.3 * Math.sin(t * 1.3)) * env.H * 0.024 * K,
      rot: J.noise1(t * 0.3 + 9, sd + 2) * 1.3 * K, s: 1.025 + 0.012 * Math.sin(t * 0.8) };
  } });

reg('cam', 'vertigo', { name: 'めまい', tags: ['emotional', 'glitch'], w: 0.6,
  plan: rng => ({ dir: rng.pick([1, -1]), a: rng.range(0.05, 0.07) }),
  get: (env, P) => {
    // a creeping dolly-in whose perspective keeps warping: stretch / shear waver grows with the zoom
    const K = KM(env), z = E.inOutSine(cuOf(env)), w = Math.sin(env.lt * 2.3), d = P.dir || 1;
    return { s: 1 + (P.a || 0.06) * K * z, sx: 1 + 0.03 * K * z * w, sy: 1 - 0.026 * K * z * w, skx: 2.2 * K * z * Math.sin(env.lt * 1.7) * d, rot: 0.8 * K * z * Math.sin(env.lt * 1.1 + 1) * d };
  } });

reg('cam', 'tiltDown', { name: 'ティルトダウン', tags: ['calm', 'editorial', 'emotional'], w: 0.8,
  plan: rng => ({ a: rng.range(0.024, 0.032) }),
  get: (env, P) => {
    // camera tilts down onto the line: it rises into frame from below and settles, easing out of a slight zoom
    const K = KM(env), q = E.outCubic(cuOf(env)), a = env.H * (P.a || 0.028) * K;
    return { y: a * (1.2 - 1.6 * q), s: 1.035 - 0.02 * q };
  } });

reg('cam', 'spiralIn', { name: '渦ズーム', tags: ['pop', 'graphic', 'emotional'], w: 0.6,
  plan: rng => ({ dir: rng.pick([1, -1]), a0: rng.range(0, 6.28), d: rng.range(0.9, 1.3) }),
  get: (env, P) => {
    const K = KM(env), d = P.dir || 1, e = E.outCubic(clamp(env.lt / (P.d || 1.1))), r = 1 - e, th = (P.a0 || 0) + d * e * TAU * 0.8;
    return { x: Math.cos(th) * env.W * 0.03 * K * r, y: Math.sin(th) * env.H * 0.035 * K * r, rot: -d * 7 * K * r, s: 1 - 0.08 * K * r + 0.015 * K * cuOf(env) };
  } });

const snapCache = new WeakMap();
const snapTime = (env, at) => {
  const c = env.cut; let v = snapCache.get(c);
  if (v != null) return v;
  v = c.dur * at;
  for (const b of (env.plan && env.plan.beats) || []) { const r = b - c.start; if (r >= c.dur * 0.38 && r <= c.dur * 0.72) { v = r; break; } }
  snapCache.set(c, v); return v;
};
reg('cam', 'snapPan', { name: 'スナップパン', tags: ['pop', 'glitch', 'graphic'], w: 0.7,
  plan: rng => ({ dir: rng.pick([1, -1]), a: rng.range(0.024, 0.032), at: rng.range(0.45, 0.6) }),
  get: (env, P) => {
    // holds one framing, then whips to the opposite framing mid-cut (on a beat when there is one) and holds again
    const K = KM(env), dur = env.cut.dur, d = P.dir || 1, A = env.W * (P.a || 0.028) * K * d, drift = env.W * 0.005 * K * d * (cuOf(env) - 0.5);
    if (dur < 1.1) return { x: A * 0.5 * (1 - 2 * cuOf(env)), s: 1.02 };
    const dt = env.lt - snapTime(env, P.at || 0.5), q = E.inOutCubic(clamp(dt / 0.16)), bell = dt > 0 && dt < 0.16 ? Math.sin(Math.PI * dt / 0.16) : 0;
    return { x: A * (1 - 2 * q) - drift, s: 1.02 + 0.015 * bell, skx: -d * 5 * K * bell, blur: 14 * K * bell };
  } });

reg('cam', 'jelly', { name: 'ぷるん', tags: ['pop', 'graphic'], w: 0.7,
  plan: rng => ({ a: rng.range(0.045, 0.065), f: rng.range(18, 24) }),
  get: (env, P) => {
    // squash-and-stretch wobble: lands squashed at the cut start, re-wobbles on beats
    const K = KM(env), t = env.lt, f = P.f || 21;
    let w = Math.exp(-t * 5) * Math.cos(t * f);
    if (env.beat && env.beat.len > 0.2 && t > 0.6) { const s = beatSince(env, 0.6); w += 0.45 * Math.exp(-s * 7) * Math.cos(s * f); }
    const A = (P.a || 0.055) * K;
    return { sx: 1 + A * w, sy: 1 - A * w * 0.9, y: env.H * 0.008 * K * w, s: 1.01 };
  } });
})();

/* JIZURA pack: decor — 45 refined graphic accents: HUD / measuring marks, geometry, particles & light, hand-drawn marks, type ornaments */
(() => {
'use strict';
const E = J.E;
const PK = 'decor';
const DEG = J.DEG, TAU = J.TAU;

/* ============================================================
   shared helpers
   ============================================================ */
const U = env => Math.min(env.W, env.H) / 1080;                    // 1 at 1080p short side
const MG = env => Math.round(Math.min(env.W, env.H) * 0.05);        // safe margin
const monoF = env => (env.st.fonts.mono && env.st.fonts.mono[0]) || 'mono';
const bodyF = env => (env.st.fonts.body && env.st.fonts.body[0]) || 'gothic_med';
const serifF = env => (env.st.fonts.serif && env.st.fonts.serif[0]) || 'mincho';
const dark = env => J.lum(env.sc.bg) < 0.5;
const inE = (env, d = 0.4, delay = 0, ease = E.outExpo) => ease(J.clamp((env.lt - delay) / d));
const outE = env => 1 - E.inCubic(env.pOut);
const L2 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const colOf = (env, c, g) => (env.pass === 'main' ? c : g ? env.passColor : null);
const FS = env => Math.max(12, 16 * U(env));                         // small label size

/* lyric bbox: remember the last real one per cut so decor never jumps to the centre while the text is hidden */
const BBC = new WeakMap();
const getBB = (env, bb) => {
  if (bb && isFinite(bb.x0 + bb.x1 + bb.y0 + bb.y1) && bb.x1 > bb.x0 && bb.y1 > bb.y0) {
    const b = { x0: Math.max(bb.x0, -env.W * 0.1), x1: Math.min(bb.x1, env.W * 1.1), y0: Math.max(bb.y0, -env.H * 0.1), y1: Math.min(bb.y1, env.H * 1.1), boxes: bb.boxes || [], cx: bb.cx, cy: bb.cy };
    if (b.x1 <= b.x0) { b.x0 = bb.x0; b.x1 = bb.x1; }
    if (b.y1 <= b.y0) { b.y0 = bb.y0; b.y1 = bb.y1; }
    if (env.cut) BBC.set(env.cut, b);
    return b;
  }
  const c = env.cut && BBC.get(env.cut);
  return c || Object.assign({ boxes: [] }, J.centerBB(env, null));
};
const bw = bb => bb.x1 - bb.x0, bh = bb => bb.y1 - bb.y0;
const hitBB = (x0, y0, x1, y1, bb, pad = 0) => !(x1 < bb.x0 - pad || x0 > bb.x1 + pad || y1 < bb.y0 - pad || y0 > bb.y1 + pad);

/* place a w×h box next to the lyric (outside it, inside the safe margin). returns {x, y, cx, cy, ok, sx, sy} (top-left + centre) */
function nearBB(env, bb, w, h, P, gap) {
  const { W, H } = env, m = MG(env) * 0.8;
  const sx0 = P.right ? 1 : -1, sy0 = P.low ? 1 : -1;
  const order = P.corner ? [[sx0, sy0], [-sx0, sy0], [sx0, -sy0], [-sx0, -sy0]] : [[sx0, sy0], [sx0, -sy0], [-sx0, sy0], [-sx0, -sy0]];
  const tries = [];
  for (const [sx, sy] of order) {
    const ax = sx > 0 ? bb.x1 - w : bb.x0, ox = sx > 0 ? bb.x1 + gap : bb.x0 - gap - w;
    const ay = sy > 0 ? bb.y1 + gap : bb.y0 - gap - h, iy = sy > 0 ? bb.y1 - h : bb.y0;
    if ((P.v | 0) % 2) tries.push([ox, iy, sx, sy], [ax, ay, sx, sy], [ox, ay, sx, sy]);
    else tries.push([ax, ay, sx, sy], [ox, iy, sx, sy], [ox, ay, sx, sy]);
  }
  for (const [x, y, sx, sy] of tries) {
    const X = J.clamp(x, m, Math.max(m, W - m - w)), Y = J.clamp(y, m, Math.max(m, H - m - h));
    if (!hitBB(X, Y, X + w, Y + h, bb, gap * 0.4)) return { x: X, y: Y, cx: X + w / 2, cy: Y + h / 2, ok: true, sx, sy };
  }
  return cornerSpot(env, bb, w, h, P);
}
/* a screen corner (inside the margin) that keeps clear of the lyric */
function cornerSpot(env, bb, w, h, P, mk = 1) {
  const { W, H } = env, m = MG(env) * mk;
  const sx0 = P.right ? 1 : -1, sy0 = P.low ? 1 : -1;
  const order = [[sx0, sy0], [-sx0, sy0], [sx0, -sy0], [-sx0, -sy0]];
  let best = null, bestA = 1e18;
  for (const [sx, sy] of order) {
    const X = sx > 0 ? W - m - w : m, Y = sy > 0 ? H - m - h : m;
    if (!hitBB(X, Y, X + w, Y + h, bb, 8)) return { x: X, y: Y, cx: X + w / 2, cy: Y + h / 2, ok: true, sx, sy };
    const ov = Math.max(0, Math.min(X + w, bb.x1) - Math.max(X, bb.x0)) * Math.max(0, Math.min(Y + h, bb.y1) - Math.max(Y, bb.y0));
    if (ov < bestA) { bestA = ov; best = { x: X, y: Y, cx: X + w / 2, cy: Y + h / 2, ok: false, sx, sy }; }
  }
  return best;
}

/* stroke a polyline (round caps optional); ghost=false → main pass only */
function stroke(env, pts, c, lw, a = 1, g = false, o) {
  const k = colOf(env, c, g); if (!k || a <= 0.003 || !pts || pts.length < 2) return;
  const ctx = env.ctx;
  ctx.globalAlpha = Math.min(1, a); ctx.strokeStyle = k; ctx.lineWidth = lw;
  ctx.lineCap = (o && o.cap) || 'butt'; ctx.lineJoin = (o && o.join) || 'miter';
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (o && o.close) ctx.closePath();
  ctx.stroke(); ctx.globalAlpha = 1; ctx.lineCap = 'butt'; ctx.lineJoin = 'miter';
}
/* many straight segments [[x0,y0,x1,y1],…] in one path */
function segs(env, list, c, lw, a = 1, g = false, cap) {
  const k = colOf(env, c, g); if (!k || a <= 0.003 || !list.length) return;
  const ctx = env.ctx;
  ctx.globalAlpha = Math.min(1, a); ctx.strokeStyle = k; ctx.lineWidth = lw; ctx.lineCap = cap || 'butt';
  ctx.beginPath();
  for (const s of list) { ctx.moveTo(s[0], s[1]); ctx.lineTo(s[2], s[3]); }
  ctx.stroke(); ctx.globalAlpha = 1; ctx.lineCap = 'butt';
}
/* many filled circles [[x,y,r],…] in one path */
function dots(env, list, c, a = 1, g = false) {
  const k = colOf(env, c, g); if (!k || a <= 0.003 || !list.length) return;
  const ctx = env.ctx;
  ctx.globalAlpha = Math.min(1, a); ctx.fillStyle = k; ctx.beginPath();
  for (const d of list) { if (d[2] <= 0.05) continue; ctx.moveTo(d[0] + d[2], d[1]); ctx.arc(d[0], d[1], d[2], 0, TAU); }
  ctx.fill(); ctx.globalAlpha = 1;
}
/* many filled rects [[x,y,w,h],…] */
function rects(env, list, c, a = 1, g = false) {
  const k = colOf(env, c, g); if (!k || a <= 0.003 || !list.length) return;
  const ctx = env.ctx;
  ctx.globalAlpha = Math.min(1, a); ctx.fillStyle = k; ctx.beginPath();
  for (const r of list) if (r[2] > 0 && r[3] > 0) ctx.rect(r[0], r[1], r[2], r[3]);
  ctx.fill(); ctx.globalAlpha = 1;
}
/* filled polygons [[pts],…] in one path */
function polys(env, list, c, a = 1, g = false) {
  const k = colOf(env, c, g); if (!k || a <= 0.003 || !list.length) return;
  const ctx = env.ctx;
  ctx.globalAlpha = Math.min(1, a); ctx.fillStyle = k; ctx.beginPath();
  for (const pts of list) { if (pts.length < 3) continue; ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.closePath(); }
  ctx.fill(); ctx.globalAlpha = 1;
}
/* dashed straight line (main pass only) */
function dash(env, x0, y0, x1, y1, on, off, c, lw, a = 1, phase = 0) {
  if (env.pass !== 'main' || a <= 0.003) return;
  const L = Math.hypot(x1 - x0, y1 - y0); if (L < 1) return;
  const dx = (x1 - x0) / L, dy = (y1 - y0) / L, per = on + off, list = [];
  let s = -(((phase % per) + per) % per);
  for (let i = 0; i < 600 && s < L; i++, s += per) {
    const a0 = Math.max(0, s), a1 = Math.min(L, s + on);
    if (a1 > a0) list.push([x0 + dx * a0, y0 + dy * a0, x0 + dx * a1, y0 + dy * a1]);
  }
  segs(env, list, c, lw, a, false);
}
/* sub-polyline between length fractions e0..e1 */
function part(pts, e0, e1) {
  e0 = J.clamp(e0); e1 = J.clamp(e1);
  if (e1 <= e0 || pts.length < 2) return [];
  const d = [0];
  for (let i = 1; i < pts.length; i++) d.push(d[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const L = d[d.length - 1]; if (L <= 0) return [];
  const A = e0 * L, B = e1 * L;
  const at = s => { let i = 1; while (i < d.length - 1 && d[i] < s) i++; const k = (s - d[i - 1]) / Math.max(1e-6, d[i] - d[i - 1]); return L2(pts[i - 1], pts[i], J.clamp(k)); };
  const out = [at(A)];
  for (let i = 1; i < pts.length - 1; i++) if (d[i] > A && d[i] < B) out.push(pts[i]);
  out.push(at(B));
  return out;
}
/* small secondary text (never ghosted) */
const label = (env, text, x, y, o) => env.draw(Object.assign({ text: String(text), font: monoF(env), size: FS(env), x, y, color: env.sc.sub, align: 'left', track: 0.08, ghost: false }, o || {}));
const textW = (text, font, size, track = 0.08) => J.measure({ text: String(text), font, size, track }).w;
const pad2 = (n, k = 2) => String(Math.max(0, Math.floor(n))).padStart(k, '0');
/* a character from the lyric: prefer kanji, then kana */
function lyricChar(env, salt) {
  const arr = [...String(env.cut.text || env.cut.lineText || '')].filter(c => c.trim() && !J.isPunct(c));
  if (!arr.length) return '';
  const kan = arr.filter(c => J.isKanji(c));
  const pool = kan.length ? kan : arr.filter(c => J.isKata(c) || J.isHira(c) || J.isLatin(c));
  const p = pool.length ? pool : arr;
  return p[J.h(env.cut.seed, salt | 0, 5) % p.length];
}
const star5 = (cx, cy, R, r, rot = -90) => { const o = []; for (let i = 0; i < 10; i++) { const a = (rot + i * 36) * DEG, q = i % 2 ? r : R; o.push([cx + Math.cos(a) * q, cy + Math.sin(a) * q]); } return o; };
const glint = (cx, cy, R, w, rot = 0) => {        // 4-point concave star
  const o = []; const n = 4;
  for (let i = 0; i < n * 2; i++) { const a = rot * DEG + i * Math.PI / n, q = i % 2 ? w : R; o.push([cx + Math.cos(a) * q, cy + Math.sin(a) * q]); }
  // add concave in-between control points
  const out = [];                                   // pull each edge midpoint inward → concave sides
  for (let i = 0; i < o.length; i++) { out.push(o[i]); out.push(L2(L2(o[i], o[(i + 1) % o.length], 0.5), [cx, cy], 0.35)); }
  return out;
};
const heart = (cx, cy, s) => {
  const o = [];
  for (let i = 0; i < 28; i++) { const t = i / 28 * TAU; const x = 16 * Math.pow(Math.sin(t), 3), y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t); o.push([cx + x * s / 17, cy - y * s / 17]); }
  return o;
};

const DEF = {};

/* ============================================================
   HUD / technical
   ============================================================ */

/* 照準線 — hairlines through the lyric centre, broken around it, graduated near the gap */
DEF.crosshair = {
  name: '照準線', tags: ['graphic', 'editorial', 'glitch'], w: 1, layer: 'front',
  draw(env, bb0, P) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { W, H, sc } = env, u = U(env), m = MG(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
    const gx = 26 * u + bw(bb) * 0.02, gy = 22 * u + bh(bb) * 0.1;
    const v = (P.v | 0) % 3, lw = Math.max(1, 1.3 * u);
    // vertical arms always; horizontal arms only where there is room beside the lyric
    const arms = [[[cx, bb.y0 - gy], [cx, m * 0.5]], [[cx, bb.y1 + gy], [cx, H - m * 0.5]], [[bb.x0 - gx, cy], [m * 0.5, cy]], [[bb.x1 + gx, cy], [W - m * 0.5, cy]]];
    const pOut = E.inCubic(env.pOut);
    arms.forEach(([a, b], i) => {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]); if (len < 40 * u) return;
      const ee = E.outExpo(J.clamp((env.lt - i * 0.06) / 0.6));
      if (ee <= pOut) return;
      stroke(env, [L2(a, b, pOut), L2(a, b, ee)], sc.sub, lw, 0.75);
      const dx = (b[0] - a[0]) / len, dy = (b[1] - a[1]) / len, nx = -dy, ny = dx;
      if (v !== 2 || i < 2) {        // graduation near the gap
        const st = 10 * u, nt = Math.min(20, Math.floor(len * 0.5 / st)), list = [];
        for (let t = 1; t <= nt; t++) {
          const d = t * st; if (d > len * ee || d < len * pOut) continue;
          const tl = (t % 5 === 0 ? 8 : 3.5) * u * J.clamp((ee * len - d) / (40 * u));
          list.push([a[0] + dx * d - nx * tl, a[1] + dy * d - ny * tl, a[0] + dx * d + nx * tl, a[1] + dy * d + ny * tl]);
        }
        segs(env, list, sc.fg, lw, 0.8 * o);
      }
      const cap = 9 * u * ee;          // accent cap at the inner end
      if (pOut < 0.02) stroke(env, [[a[0] - nx * cap, a[1] - ny * cap], [a[0] + nx * cap, a[1] + ny * cap]], i < 2 || P.accent ? sc.accent : sc.fg, 2.4 * u, ee * o);
      if (v === 1) env.circle(b[0], b[1], 3 * u * ee, null, sc.fg, lw, o * ee, false);
    });
    if (v !== 2) {
      const e = inE(env, 0.3, 0.35) * o, fs = FS(env) * 0.85;
      label(env, `Y ${pad2(bb.y0, 4)}`, cx + 12 * u, bb.y0 - gy - fs * 0.9, { size: fs, alpha: e });
      label(env, `Y ${pad2(bb.y1, 4)}`, cx + 12 * u, bb.y1 + gy + fs * 0.9, { size: fs, alpha: e });
      label(env, `X ${pad2(cx, 4)}`, cx - 12 * u, H - m * 0.5 - fs * 0.6, { size: fs, align: 'right', alpha: e, color: sc.fg });
    }
  },
};

/* トンボ — printer's crop / registration marks around the lyric */
DEF.cropMarks = {
  name: 'トンボ', tags: ['editorial', 'graphic', 'calm'], w: 1.1, layer: 'front',
  draw(env, bb0, P) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { sc } = env, u = U(env);
    const o = outE(env); if (o <= 0.003) return;
    const pad = 14 * u + Math.min(bw(bb), bh(bb)) * 0.08 + P.r * 10 * u;
    const cm = 12 * u;
    const X0 = Math.max(cm, bb.x0 - pad), X1 = Math.min(env.W - cm, bb.x1 + pad), Y0 = Math.max(cm, bb.y0 - pad), Y1 = Math.min(env.H - cm, bb.y1 + pad);
    const g = 8 * u, Lm = 26 * u + Math.min(bw(bb), bh(bb)) * 0.05, b = 9 * u, lw = Math.max(1, 1 * u);
    const col = sc.fg;
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy], k) => {
      const e = E.outExpo(J.clamp((env.lt - k * 0.05) / 0.45)); if (e <= 0) return;
      const X = sx < 0 ? X0 : X1, Y = sy < 0 ? Y0 : Y1;
      const hl = (y) => [[X + sx * g, y], [X + sx * (g + Lm * e), y]];
      const vl = (x) => [[x, Y + sy * g], [x, Y + sy * (g + Lm * e)]];
      segs(env, [[...hl(Y)[0], ...hl(Y)[1]], [...vl(X)[0], ...vl(X)[1]]], col, lw, 0.9 * o);
      segs(env, [[...hl(Y + sy * b)[0], ...hl(Y + sy * b)[1]], [...vl(X + sx * b)[0], ...vl(X + sx * b)[1]]], col, lw, 0.55 * o);
    });
    // centre marks (十) + register circles
    const e2 = inE(env, 0.45, 0.15); if (e2 <= 0) return;
    const cx = (X0 + X1) / 2, cy = (Y0 + Y1) / 2, cl = 20 * u * e2, rr = 6 * u;
    const rc = P.accent ? sc.accent : sc.fg;
    const marks = [[cx, Y0 - g, 0, -1], [cx, Y1 + g, 0, 1]];
    if (P.big || bh(bb) > bw(bb)) marks.push([X0 - g, cy, -1, 0], [X1 + g, cy, 1, 0]);
    for (const [x, y, dx, dy] of marks) {
      const ex = x + dx * cl, ey = y + dy * cl, mx = x + dx * cl * 0.55, my = y + dy * cl * 0.55;
      segs(env, [[x, y, ex, ey], [mx - dy * cl * 0.45, my - dx * cl * 0.45, mx + dy * cl * 0.45, my + dx * cl * 0.45]], rc, lw, 0.85 * o);
      if (P.big) env.circle(mx, my, rr * e2, null, rc, lw, 0.85 * o, false);
    }
  },
};

/* ロックオン — a targeting reticle that shrinks, spins and locks beside the lyric */
DEF.reticle = {
  name: 'ロックオン', tags: ['glitch', 'graphic'], w: 0.9, layer: 'front',
  draw(env, bb0, P) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { sc } = env, u = U(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const R = J.clamp(Math.min(bw(bb), bh(bb)) * 0.3, 40 * u, 72 * u), LW = FS(env) * 3.6;
    const sp = nearBB(env, bb, R * 2.8 + LW, R * 2.6, P, 18 * u);
    const lLeft = sp.cx > env.W / 2, cx = lLeft ? sp.x + LW + R * 1.4 : sp.x + R * 1.4, cy = sp.cy;
    const lock = E.outExpo(J.clamp(env.lt / 0.6)), r = R * (2.1 - 1.1 * lock) * (1 + 0.25 * E.inCubic(env.pOut));
    const rot = (1 - lock) * 140 + env.ltb * 16 + P.r * 90, lw = Math.max(1.2, 1.6 * u), a = Math.min(1, env.lt / 0.12) * o;
    const on = lock > 0.97 || env.step % 2 === 0;
    for (let k = 0; k < 4; k++) env.arc(cx, cy, r, rot + k * 90 - 28, rot + k * 90 + 28, sc.fg, lw, a * (on ? 1 : 0.5), false);
    env.arc(cx, cy, r * 0.62, -90, -90 + 360 * lock, sc.sub, Math.max(1, u), a * 0.6, false);
    const tk = [];
    for (let k = 0; k < 4; k++) { const an = k * 90 * DEG; tk.push([cx + Math.cos(an) * r * 0.74, cy + Math.sin(an) * r * 0.74, cx + Math.cos(an) * r * 1.16, cy + Math.sin(an) * r * 1.16]); }
    segs(env, tk, sc.fg, Math.max(1, u), a * 0.9);
    const tri = [], r2 = r * 1.32;
    for (let k = 0; k < 3; k++) {
      const an = (-env.ltb * 30 + k * 120 + P.r * 60) * DEG, px = cx + Math.cos(an) * r2, py = cy + Math.sin(an) * r2, s = 5 * u;
      const ix = -Math.cos(an), iy = -Math.sin(an), nx = -iy, ny = ix;
      tri.push([[px + ix * s, py + iy * s], [px - ix * s * 0.6 + nx * s * 0.8, py - iy * s * 0.6 + ny * s * 0.8], [px - ix * s * 0.6 - nx * s * 0.8, py - iy * s * 0.6 - ny * s * 0.8]]);
    }
    polys(env, tri, sc.accent, a);
    env.circle(cx, cy, 2.6 * u, sc.accent, null, 0, a * (lock > 0.97 ? 1 : (env.step % 2 ? 1 : 0.2)), false);
    const fs = FS(env) * 0.9, lx = lLeft ? cx - R * 1.5 : cx + R * 1.5, al = lLeft ? 'right' : 'left';
    label(env, lock > 0.97 ? 'LOCK' : 'SCAN', lx, cy - R * 0.9, { size: fs, align: al, color: lock > 0.97 ? sc.accent : sc.sub, alpha: a });
    label(env, (lock * 100).toFixed(1).padStart(5, '0'), lx, cy - R * 0.9 + fs * 1.3, { size: fs, align: al, alpha: a * 0.8 });
  },
};

/* レーダー — a small scope with a sweeping beam and blips in a free corner */
DEF.radar = {
  name: 'レーダー', tags: ['glitch', 'graphic'], w: 0.7, layer: 'front',
  draw(env, bb0, P) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { sc } = env, u = U(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const R = J.clamp(Math.min(env.W, env.H) * 0.07, 40 * u, 96 * u), fs = FS(env) * 0.85;
    const sp = cornerSpot(env, bb, R * 2 + 8 * u, R * 2 + fs * 2.2, P);
    const cx = sp.cx, cy = sp.y + R + 4 * u;
    const e = E.outExpo(J.clamp(env.lt / 0.5)), s = e * (1 - 0.15 * E.inCubic(env.pOut)), rr = R * s, lw = Math.max(1, u);
    const a = o * (sp.ok ? 1 : 0.35);
    [1, 0.66, 0.33].forEach((k, i) => env.arc(cx, cy, rr * k, -90, -90 + 360 * J.clamp(e * 1.4 - i * 0.15), sc.sub, lw, 0.55 * a, false));
    segs(env, [[cx - rr, cy, cx + rr, cy], [cx, cy - rr, cx, cy + rr]], sc.sub, lw, 0.3 * a);
    const tk = [];
    for (let i = 0; i < 36; i++) { const an = i * 10 * DEG, l = i % 3 === 0 ? 5 * u : 2.5 * u; tk.push([cx + Math.cos(an) * rr, cy + Math.sin(an) * rr, cx + Math.cos(an) * (rr + l), cy + Math.sin(an) * (rr + l)]); }
    segs(env, tk, sc.fg, lw, 0.6 * a);
    const sw = (env.ltb * 150 + P.r * 360) % 360;
    for (let k = 14; k >= 0; k--) {
      const an = (sw - k * 3.2) * DEG;
      stroke(env, [[cx, cy], [cx + Math.cos(an) * rr, cy + Math.sin(an) * rr]], sc.accent, k ? lw : 1.6 * lw, a * (k ? 0.3 * (1 - k / 15) : 0.95));
    }
    const bl = [];
    for (let i = 0; i < 3 + (P.n | 0); i++) {
      const ang = J.r(P.seed, i, 1) * 360, rad = J.rr(0.2, 0.9, P.seed, i, 2);
      const since = (((sw - ang) % 360) + 360) % 360, glow = Math.exp(-since / 70);
      if (glow > 0.03) bl.push([cx + Math.cos(ang * DEG) * rr * rad, cy + Math.sin(ang * DEG) * rr * rad, (2 + 2.2 * glow) * u, glow]);
    }
    for (const b of bl) env.circle(b[0], b[1], b[2], sc.fg, null, 0, a * b[3], false);
    const ea = inE(env, 0.3, 0.3) * a;
    label(env, `RDR-${pad2((env.cut.line | 0) + 1)}`, cx - R, sp.y + R * 2 + fs * 1.4, { size: fs, alpha: ea });
    label(env, `${pad2(sw, 3)}°`, cx + R, sp.y + R * 2 + fs * 1.4, { size: fs, align: 'right', alpha: ea, color: sc.fg });
  },
};

/* 進行リング — a thin gauge that fills with the cut's progress */
DEF.progressRing = {
  name: '進行リング', tags: ['graphic', 'editorial', 'calm'], w: 0.9, layer: 'front',
  draw(env, bb0, P) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { sc } = env, u = U(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const R = J.clamp(Math.min(env.W, env.H) * 0.05, 34 * u, 64 * u);
    const sp = nearBB(env, bb, R * 2 + 24 * u, R * 2 + 24 * u, P, 22 * u);
    const cx = sp.cx, cy = sp.cy, lw = Math.max(1, u);
    const e = E.outExpo(J.clamp(env.lt / 0.5)), a = o * (sp.ok ? 1 : 0.4);
    const prog = J.clamp(env.lt / Math.max(0.1, env.cut.dur));
    const tk = [], nT = 60;
    for (let i = 0; i < nT * e; i++) { const an = (-90 + i * 6) * DEG, l = i % 5 === 0 ? 6 * u : 3 * u, r0 = R + 6 * u; tk.push([cx + Math.cos(an) * r0, cy + Math.sin(an) * r0, cx + Math.cos(an) * (r0 + l), cy + Math.sin(an) * (r0 + l)]); }
    segs(env, tk, sc.sub, lw, 0.55 * a);
    if ((P.v | 0) % 2) {
      const nS = 24;
      for (let i = 0; i < nS; i++) {
        const a0 = -90 + i * 360 / nS + 2, a1 = a0 + 360 / nS - 4, lit = (i + 1) / nS <= prog + 1e-3;
        if (i / nS > e) break;
        env.arc(cx, cy, R, a0, a1, lit ? sc.accent : sc.sub, lit ? 3 * u : lw, a * (lit ? 1 : 0.35), false);
      }
    } else {
      env.arc(cx, cy, R, -90, -90 + 360 * e, sc.sub, lw, 0.35 * a, false);
      env.arc(cx, cy, R, -90, -90 + 360 * prog * e, sc.accent, 2.6 * u, a, false);
      const ha = (-90 + 360 * prog * e) * DEG;
      env.circle(cx + Math.cos(ha) * R, cy + Math.sin(ha) * R, 3.2 * u, sc.accent, null, 0, a, false);
    }
    const fs = R * 0.52;
    label(env, pad2(prog * 100), cx - fs * 0.12, cy, { size: fs, align: 'center', color: sc.fg, alpha: a * e, track: 0.02 });
    label(env, '%', cx + fs * 0.72, cy + fs * 0.12, { size: fs * 0.42, align: 'left', alpha: a * e });
  },
};

/* タイムコード — rolling SMPTE readout + a mini scrub bar with in/out points */
DEF.timecodeBar = {
  name: 'タイムコード', tags: ['editorial', 'glitch', 'graphic'], w: 0.9, layer: 'front',
  draw(env, bb0, P) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { W, H, sc } = env, u = U(env), m = MG(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const fs = FS(env), w = Math.min(W * 0.38, 460 * u), h = fs * 3.4;
    let low = !!P.low, x0 = P.right ? W - m - w : m;
    let y0 = low ? H - m - h : m;
    if (hitBB(x0, y0, x0 + w, y0 + h, bb, 10 * u)) { low = !low; y0 = low ? H - m - h : m; }
    const a = o * (hitBB(x0, y0, x0 + w, y0 + h, bb, 0) ? 0.3 : 1);
    const e = E.outExpo(J.clamp(env.lt / 0.5));
    const t = Math.max(0, env.t || 0), fr = Math.floor(t * 24);
    const tc = `${pad2(t / 3600)}:${pad2((t / 60) % 60)}:${pad2(t % 60)}:${pad2(fr % 24)}`;
    const n = Math.ceil(tc.length * J.clamp(env.lt / 0.35));
    const ty = y0 + fs * 0.8;
    const tcW = textW('TC ', monoF(env), fs * 0.8, 0.1);
    label(env, 'TC', x0, ty + fs * 0.12, { size: fs * 0.8, color: sc.accent, alpha: a });
    label(env, tc.slice(0, n), x0 + tcW, ty, { size: fs * 1.25, color: sc.fg, alpha: a, track: 0.06 });
    label(env, `F ${pad2(Math.floor(env.lt * 24), 4)}`, x0 + w, ty + fs * 0.12, { size: fs * 0.8, align: 'right', alpha: a * e });
    // scrub bar
    const by = y0 + h - fs * 0.6, lw = Math.max(1, u), prog = J.clamp(env.lt / Math.max(0.1, env.cut.dur));
    stroke(env, [[x0, by], [x0 + w * e, by]], sc.sub, lw, 0.6 * a);
    const tk = [];
    for (let i = 0; i <= 48; i++) { const x = x0 + w * i / 48; if (x > x0 + w * e) break; const l = i % 12 === 0 ? 7 * u : i % 4 === 0 ? 4 * u : 2 * u; tk.push([x, by, x, by - l]); }
    segs(env, tk, sc.sub, lw, 0.6 * a);
    const px = x0 + w * prog * e;
    stroke(env, [[x0, by], [px, by]], sc.fg, 2.2 * u, a);
    polys(env, [[[px - 5 * u, by - 12 * u], [px + 5 * u, by - 12 * u], [px, by - 4 * u]]], sc.accent, a);
    const ib = [[x0, by + 4 * u, x0, by + 10 * u], [x0 + w * e, by + 4 * u, x0 + w * e, by + 10 * u]];
    segs(env, ib, sc.fg, lw, a * e);
    label(env, 'IN', x0 + 4 * u, by + 9 * u + fs * 0.35, { size: fs * 0.6, alpha: a * e * 0.8 });
    label(env, 'OUT', x0 + w * e - 4 * u, by + 9 * u + fs * 0.35, { size: fs * 0.6, align: 'right', alpha: a * e * 0.8 });
  },
};

/* 端の定規 — a graduated ruler on one screen edge whose markers track the lyric */
DEF.rulerEdge = {
  name: '端の定規', tags: ['editorial', 'graphic', 'calm'], w: 1, layer: 'front',
  draw(env, bb0, P) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { W, H, sc } = env, u = U(env), m = MG(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const vert = P.corner ? true : false, fs = FS(env) * 0.72, lw = Math.max(1, u);
    const st = 10 * u, e = E.outCubic(J.clamp(env.lt / 0.55));
    const len = vert ? H : W, a0 = m, a1 = len - m;
    const side = vert ? (P.right ? 1 : -1) : (P.low ? 1 : -1);
    const base = vert ? (side > 0 ? W - m * 0.55 : m * 0.55) : (side > 0 ? H - m * 0.55 : m * 0.55);
    const inward = -side;
    const P2 = (along, off) => (vert ? [base + inward * off, along] : [along, base + inward * off]);
    const n = Math.floor((a1 - a0) / st), list = [];
    const head = a0 + (a1 - a0) * e;
    for (let i = 0; i <= n; i++) {
      const s = a0 + i * st; if (s > head) break;
      const l = (i % 10 === 0 ? 14 : i % 5 === 0 ? 9 : 4.5) * u * J.clamp((head - s) / (60 * u));
      const p = P2(s, 0), q = P2(s, l);
      list.push([p[0], p[1], q[0], q[1]]);
    }
    const a = o;
    segs(env, list, sc.sub, lw, 0.7 * a);
    const bl0 = P2(a0, 0), bl1 = P2(head, 0);
    stroke(env, [bl0, bl1], sc.sub, lw, 0.5 * a);
    for (let i = 0; i <= n; i += 10) {
      const s = a0 + i * st; if (s > head - 20 * u) break;
      const q = P2(s + (vert ? 0 : 3 * u), 20 * u + fs * 0.4);
      label(env, pad2(i, 3), vert ? q[0] : q[0], vert ? q[1] + 0 : q[1], { size: fs, align: vert ? (inward > 0 ? 'left' : 'right') : 'left', alpha: 0.7 * a });
    }
    // lyric markers
    const em = inE(env, 0.5, 0.2, E.outCubic) * o;
    if (em <= 0) return;
    const lo = vert ? bb.y0 : bb.x0, hi = vert ? bb.y1 : bb.x1, mid = (lo + hi) / 2;
    const from = vert ? H / 2 : W / 2;
    const Lo = J.lerp(from, J.clamp(lo, a0, a1), em), Hi = J.lerp(from, J.clamp(hi, a0, a1), em), Mid = J.lerp(from, J.clamp(mid, a0, a1), em);
    const off = 26 * u;
    stroke(env, [P2(Lo, off), P2(Hi, off)], sc.accent, 2 * u, 0.9 * em);
    segs(env, [[...P2(Lo, off - 5 * u), ...P2(Lo, off + 5 * u)], [...P2(Hi, off - 5 * u), ...P2(Hi, off + 5 * u)]], sc.accent, 2 * u, 0.9 * em);
    const tp = P2(Mid, 3 * u), s5 = 5 * u;
    const tri = vert ? [[tp[0], tp[1]], [tp[0] + inward * s5 * 1.6, tp[1] - s5], [tp[0] + inward * s5 * 1.6, tp[1] + s5]] : [[tp[0], tp[1]], [tp[0] - s5, tp[1] + inward * s5 * 1.6], [tp[0] + s5, tp[1] + inward * s5 * 1.6]];
    polys(env, [tri], sc.fg, em);
    const lp = P2(Mid, off + 8 * u + fs);
    label(env, `${pad2(hi - lo, 4)}`, lp[0] + (vert ? 0 : 6 * u), lp[1], { size: fs, color: sc.fg, align: vert ? (inward > 0 ? 'left' : 'right') : 'left', alpha: em });
  },
};

/* 寸法線 — drafting dimension lines measuring the lyric (width / height) */
DEF.dimension = {
  name: '寸法線', tags: ['editorial', 'graphic'], w: 1, layer: 'front',
  draw(env, bb0, P) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { W, H, sc } = env, u = U(env), m = MG(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const lw = Math.max(1, u), fs = FS(env) * 0.85, arch = (P.v | 0) % 2 === 1;
    const gap = 20 * u + bh(bb) * 0.1;
    let below = !!P.low;
    let y = below ? bb.y1 + gap : bb.y0 - gap;
    if (y < m * 0.6 || y > H - m * 0.6) { below = !below; y = below ? bb.y1 + gap : bb.y0 - gap; }
    const e = E.outExpo(J.clamp(env.lt / 0.55)), e2 = inE(env, 0.35, 0.05);
    const x0 = bb.x0, x1 = bb.x1, cx = (x0 + x1) / 2, sy = below ? 1 : -1;
    const lab = `${Math.round(x1 - x0)}`;
    const lwid = textW(lab, monoF(env), fs, 0.08) + 14 * u;
    const X0 = J.lerp(cx, x0, e), X1 = J.lerp(cx, x1, e);
    // extension lines
    const ext = [[x0, (below ? bb.y1 : bb.y0) + sy * 6 * u, x0, y + sy * 8 * u], [x1, (below ? bb.y1 : bb.y0) + sy * 6 * u, x1, y + sy * 8 * u]];
    segs(env, ext.map(s => [s[0], s[1], s[2], J.lerp(s[1], s[3], e2)]), sc.sub, lw, 0.7 * o);
    // dimension line with a gap for the value
    if (X1 - X0 > lwid) {
      segs(env, [[X0, y, cx - lwid / 2, y], [cx + lwid / 2, y, X1, y]], sc.fg, lw, 0.9 * o);
    }
    const ea = J.clamp((e - 0.7) / 0.3) * o;
    if (arch) segs(env, [[x0 - 5 * u, y + 5 * u, x0 + 5 * u, y - 5 * u], [x1 - 5 * u, y + 5 * u, x1 + 5 * u, y - 5 * u]], sc.fg, 1.6 * u, ea);
    else polys(env, [[[x0, y], [x0 + 10 * u, y - 3.5 * u], [x0 + 10 * u, y + 3.5 * u]], [[x1, y], [x1 - 10 * u, y - 3.5 * u], [x1 - 10 * u, y + 3.5 * u]]], sc.fg, ea);
    label(env, lab, cx, y, { size: fs, align: 'center', color: P.accent ? sc.accent : sc.fg, alpha: e2 * o });
    // height dimension on one side
    if (P.big || (P.v | 0) % 3 === 0) {
      const gx = 20 * u + bw(bb) * 0.02;
      let right = !!P.right, x = right ? bb.x1 + gx : bb.x0 - gx;
      if (x < m || x > W - m) { right = !right; x = right ? bb.x1 + gx : bb.x0 - gx; }
      const sx = right ? 1 : -1, cy = (bb.y0 + bb.y1) / 2;
      const Y0 = J.lerp(cy, bb.y0, e), Y1 = J.lerp(cy, bb.y1, e);
      const labH = `${Math.round(bh(bb))}`, lh = textW(labH, monoF(env), fs, 0.08) + 14 * u;
      const ex2 = [[(right ? bb.x1 : bb.x0) + sx * 6 * u, bb.y0, x + sx * 8 * u, bb.y0], [(right ? bb.x1 : bb.x0) + sx * 6 * u, bb.y1, x + sx * 8 * u, bb.y1]];
      segs(env, ex2.map(s => [s[0], s[1], J.lerp(s[0], s[2], e2), s[3]]), sc.sub, lw, 0.7 * o);
      if (Y1 - Y0 > lh) segs(env, [[x, Y0, x, cy - lh / 2], [x, cy + lh / 2, x, Y1]], sc.fg, lw, 0.9 * o);
      if (arch) segs(env, [[x - 5 * u, bb.y0 + 5 * u, x + 5 * u, bb.y0 - 5 * u], [x - 5 * u, bb.y1 + 5 * u, x + 5 * u, bb.y1 - 5 * u]], sc.fg, 1.6 * u, ea);
      else polys(env, [[[x, bb.y0], [x - 3.5 * u, bb.y0 + 10 * u], [x + 3.5 * u, bb.y0 + 10 * u]], [[x, bb.y1], [x - 3.5 * u, bb.y1 - 10 * u], [x + 3.5 * u, bb.y1 - 10 * u]]], sc.fg, ea);
      label(env, labH, x, cy, { size: fs, align: 'center', rot: -90, color: sc.fg, alpha: e2 * o });
    }
  },
};

/* 通し番号 — a thin numeral "03 / 12" with rolling digits in a free corner */
DEF.indexNum = {
  name: '通し番号', tags: ['editorial', 'graphic', 'calm'], w: 1, layer: 'front',
  draw(env, bb0, P) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { sc } = env, u = U(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const lines = env.plan && env.plan.lines ? env.plan.lines.length : 0;
    const idx = env.cut.line >= 0 ? (env.cut.line | 0) + 1 : (env.cut.index | 0) + 1;
    const num = pad2(idx), tot = '/' + pad2(Math.max(lines, idx));
    const font = (P.v | 0) % 2 ? 'mincho_light' : 'gothic_light';
    const S = J.clamp(Math.min(env.W, env.H) * 0.1, 64 * u, 132 * u), ts = S * 0.3;
    const nw = textW(num, font, S, 0.02), tw = textW(tot, font, ts, 0.06);
    const w = nw + tw + S * 0.12, h = S * 1.25;
    const sp = cornerSpot(env, bb, w, h, P, 1.1);
    const a = o * (sp.ok ? 1 : 0.35) * E.outCubic(J.clamp(env.lt / 0.2)), x0 = sp.x, base = sp.y + S * 0.8;
    const ctx = env.ctx, digits = [...num];
    let x = x0;
    // rolling digits (clipped window, main pass only)
    if (env.pass === 'main') {
      digits.forEach((d, i) => {
        const dw = textW(d, font, S, 0.02);
        const p = E.outExpo(J.clamp((env.lt - 0.04 - i * 0.08) / 0.55));
        const steps = P.mode === 'count' ? 6 + i * 3 : 3;
        const off = (1 - p) * steps;                   // how many digits still to roll
        ctx.save(); ctx.beginPath(); ctx.rect(x - 2, base - S * 0.5, dw + 4, S * 0.98); ctx.clip();
        const fl = Math.floor(off), frac = off - fl;
        for (let k = 0; k <= (frac > 0.001 ? 1 : 0); k++) {
          const val = ((+d - (fl + k)) % 10 + 10) % 10, dy = (k - frac) * S * 1.25;
          env.draw({ text: String(val), font, size: S, x: x + dw / 2, y: base + dy, color: sc.fg, align: 'center', track: 0.02, alpha: a * (1 - Math.abs(k - frac) * 0.6), ghost: false });
        }
        ctx.restore();
        x += dw;
      });
    } else x += nw;
    const e2 = inE(env, 0.4, 0.25);
    label(env, tot, x + S * 0.1, base + S * 0.26, { font, size: ts, color: sc.sub, alpha: a * e2, track: 0.06 });
    const ry = base + S * 0.52;
    stroke(env, [[x0, ry], [x0 + w * E.outExpo(J.clamp((env.lt - 0.1) / 0.5)), ry]], sc.sub, Math.max(1, u), 0.8 * a);
    env.rect(x0, ry - 1.5 * u, S * 0.22 * e2, 3 * u, sc.accent, a, false);
    label(env, env.cut.line >= 0 ? 'LYRIC' : 'INTRO', x0, ry + FS(env) * 0.9, { size: FS(env) * 0.72, alpha: a * e2, track: 0.3 });
  },
};

/* 日付写真 — orange seven-segment date imprint like an old film camera */
const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg' };
function segDigit(x, y, dw, dh, t, d, sk) {
  const out = [], h2 = dh / 2, k = t / 2;
  const hs = (x0, x1, yy) => [[x0 + k, yy], [x0 + 2 * k, yy - k], [x1 - 2 * k, yy - k], [x1 - k, yy], [x1 - 2 * k, yy + k], [x0 + 2 * k, yy + k]];
  const vs = (xx, y0, y1) => [[xx, y0 + k], [xx + k, y0 + 2 * k], [xx + k, y1 - 2 * k], [xx, y1 - k], [xx - k, y1 - 2 * k], [xx - k, y0 + 2 * k]];
  const S2 = { a: hs(x, x + dw, y), g: hs(x, x + dw, y + h2), d: hs(x, x + dw, y + dh), f: vs(x, y, y + h2), b: vs(x + dw, y, y + h2), e: vs(x, y + h2, y + dh), c: vs(x + dw, y + h2, y + dh) };
  for (const s of SEG[d] || '') out.push([s, S2[s].map(p => [p[0] + (y + dh / 2 - p[1]) * sk, p[1]])]);
  return out;
}
DEF.dateStamp = {
  name: '日付写真', tags: ['emotional', 'pop', 'calm'], w: 0.7, layer: 'front',
  draw(env, bb0, P) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { sc } = env, u = U(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const yy = J.h(P.seed, 1) % 2 ? 90 + J.h(P.seed, 2) % 10 : J.h(P.seed, 3) % 27, mm = 1 + J.h(P.seed, 4) % 12, dd = 1 + J.h(P.seed, 5) % 28;
    const groups = [pad2(yy), String(mm), pad2(dd)];
    const dh = J.clamp(Math.min(env.W, env.H) * 0.034, 24 * u, 46 * u), dw = dh * 0.52, t = dh * 0.12, gapD = dw * 0.42, gapG = dw * 1.35;
    const width = groups.reduce((s, g) => s + g.length * (dw + gapD), 0) + gapG * 2 + dw * 0.5;
    const sp = cornerSpot(env, bb, width, dh * 1.4, { right: (P.v | 0) % 3 === 2 ? !P.right : true, low: true }, 1.2);
    let x = sp.x + dw * 0.5; const y = sp.y + dh * 0.2;
    const pieces = [];
    pieces.push(['q', [[x - dw * 0.1, y - t * 0.2], [x + t * 0.9, y - t * 0.2], [x + t * 0.2, y + dh * 0.32], [x - dw * 0.1 - t * 0.6, y + dh * 0.32]]]);
    x += dw * 0.35;
    groups.forEach(g => { for (const ch of g) { segDigit(x, y, dw, dh, t, +ch, 0.1).forEach(s => pieces.push(s)); x += dw + gapD; } x += gapG - gapD; });
    const ctx = env.ctx, col = sc.accent;
    if (env.pass !== 'main') return;
    const on = [];
    pieces.forEach((pc, i) => {
      const t0 = 0.05 + J.r(P.seed, i, 7) * 0.35;
      if (env.lt < t0) return;
      const fl = env.lt - t0 < 0.12 ? (J.r(P.seed, i, env.step) < 0.5 ? 0.3 : 1) : 1;
      on.push([pc[1], fl]);
    });
    ctx.save();
    if (env.allowFilter) { ctx.shadowColor = J.rgba(col, 0.8); ctx.shadowBlur = 10 * u * (env.scale || 1); }
    polys(env, on.filter(p => p[1] === 1).map(p => p[0]), col, 0.92 * o * (sp.ok ? 1 : 0.4));
    polys(env, on.filter(p => p[1] !== 1).map(p => p[0]), col, 0.3 * o);
    ctx.restore();
  },
};

/* QR風 — a QR-like module block that scans in, with finder squares */
DEF.qrBlock = {
  name: 'QR風ブロック', tags: ['graphic', 'glitch', 'pop'], w: 0.7, layer: 'front',
  draw(env, bb0, P) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { sc } = env, u = U(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const N = 21, S = J.clamp(Math.min(env.W, env.H) * 0.1, 76 * u, 140 * u), c = S / N, fs = FS(env) * 0.72;
    const sp = cornerSpot(env, bb, S, S + fs * 2, P, 1.1);
    const x0 = sp.x, y0 = sp.y, a = o * (sp.ok ? 1 : 0.35);
    const e = J.clamp(env.lt / 0.55), pOut = env.pOut;
    const fg = [], acc = [];
    const finder = (i, j) => { for (const [fi, fj] of [[0, 0], [N - 7, 0], [0, N - 7]]) { const di = i - fi, dj = j - fj; if (di >= 0 && di < 7 && dj >= 0 && dj < 7) { const r = Math.max(Math.abs(di - 3), Math.abs(dj - 3)); return r === 3 || r <= 1 ? (r <= 1 ? 2 : 1) : 0; } } return -1; };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      let f = finder(i, j);
      if (f === -1) {
        if ((i === 7 || j === 7) && (i < 8 && j < 8 || i > N - 9 && j < 8 || i < 8 && j > N - 9)) f = 0;
        else if (i === 6 || j === 6) f = (i + j) % 2 === 0 ? 1 : 0;
        else f = J.r(P.seed, i, j, 3) < 0.48 ? 1 : 0;
      }
      if (!f) continue;
      const d = (i + j) / (2 * N - 2);
      if (d > e * 1.25 - 0.1 + (J.r(P.seed, i, j, 9) - 0.5) * 0.1) continue;
      if (pOut > 0 && J.r(P.seed, i, j, 11) < pOut * 1.1) continue;
      (f === 2 && P.accent ? acc : fg).push([x0 + i * c, y0 + j * c, c + 0.35, c + 0.35]);
    }
    rects(env, fg, sc.fg, a);
    rects(env, acc, sc.accent, a);
    // scan line during the build
    if (e < 1) { const sy = y0 + S * e * 1.1; if (sy < y0 + S) stroke(env, [[x0 - 6 * u, sy], [x0 + S + 6 * u, sy]], sc.accent, 1.5 * u, a); }
    label(env, `ID ${(J.h(P.seed, 12) % 0xffffff).toString(16).toUpperCase().padStart(6, '0')}`, x0, y0 + S + fs * 1.2, { size: fs, alpha: a * inE(env, 0.3, 0.4), track: 0.14 });
  },
};

/* グリッチ片 — flickering data slivers and hollow frames hugging the lyric's sides */
DEF.glitchRects = {
  name: 'グリッチ片', tags: ['glitch'], w: 0.9, layer: 'front',
  draw(env, bb0, P) {
    const bb = getBB(env, bb0), { W, H, sc } = env, u = U(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const burst = Math.max(1 - J.clamp(env.lt / 0.45), env.pOut > 0 ? 1 - env.pOut * 0.6 : 0);
    const st = env.step, idle = (J.h(P.seed, st, 1) % 5) === 0;
    const n = Math.round((burst > 0 ? 7 + 6 * burst : idle ? 3 : 1) * (0.7 + 0.2 * (P.n | 0)));
    const gap = 10 * u + bh(bb) * 0.06;
    const cols = [sc.fg, sc.accent, sc.ghostA || sc.accent, sc.ghostB || sc.sub];
    const solid = [[], [], [], []], hollow = [];
    for (let i = 0; i < n; i++) {
      const r = k => J.r(P.seed, st, i, k);
      const right = r(1) < 0.5, h = (1.5 + r(3) * 9) * u, room = right ? W - bb.x1 - gap : bb.x0 - gap;
      let w = (18 + r(4) * r(4) * 220) * u, x, y;
      if (room > 60 * u && r(8) < 0.75) {
        y = J.lerp(bb.y0, bb.y1, r(2)); w = Math.min(w, room - 8 * u);
        x = right ? bb.x1 + gap + r(5) * Math.max(0, room - w - 8 * u) * 0.5 : bb.x0 - gap - w - r(5) * Math.max(0, room - w - 8 * u) * 0.5;
      } else {                                   // cramped sides: hug the top / bottom edge instead
        const top = r(9) < 0.5; y = top ? bb.y0 - gap - r(2) * 40 * u : bb.y1 + gap + r(2) * 40 * u;
        x = J.lerp(bb.x0, bb.x1 - w, r(5));
      }
      x = J.clamp(x, 4 * u, W - w - 4 * u);
      if (hitBB(x, y, x + w, y + h, bb, 2)) continue;
      if (r(6) < 0.25) hollow.push([x, y - h * 1.5, w * 0.7, h * 3.5]);
      else solid[Math.floor(r(7) * 4)].push([x, y, w, h]);
    }
    solid.forEach((l, k) => rects(env, l, cols[k], 0.9 * o, k < 2));
    for (const hr of hollow) stroke(env, [[hr[0], hr[1]], [hr[0] + hr[2], hr[1]], [hr[0] + hr[2], hr[1] + hr[3]], [hr[0], hr[1] + hr[3]]], sc.fg, Math.max(1, u), 0.8 * o, false, { close: true });
    if (burst > 0.2 || idle) {
      const r = k => J.r(P.seed, st, 99, k), right = r(1) < 0.5;
      const x = right ? bb.x1 + gap : bb.x0 - gap, y = J.lerp(bb.y0, bb.y1, r(2));
      label(env, `0x${(J.h(P.seed, st, 5) % 0xffff).toString(16).toUpperCase().padStart(4, '0')}`, x, y - 10 * u, { size: FS(env) * 0.75, align: right ? 'left' : 'right', color: sc.accent, alpha: o });
    }
  },
};

/* ============================================================
   geometry
   ============================================================ */

/* 同心四角 — nested hairline squares: a slow twist or an endless tunnel */
DEF.concentricSquares = {
  name: '同心四角', tags: ['graphic', 'calm', 'editorial'], w: 1, layer: 'front',
  draw(env, bb0, P) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { sc } = env, u = U(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const S = J.clamp(Math.min(env.W, env.H) * 0.17, 100 * u, 220 * u);
    const sp = P.corner ? cornerSpot(env, bb, S * 1.2, S * 1.2, P) : nearBB(env, bb, S * 1.2, S * 1.2, P, 24 * u);
    const cx = sp.cx, cy = sp.cy, n = 5 + (P.n | 0), lw = Math.max(1, 1.2 * u), tunnel = (P.v | 0) % 2 === 1;
    const a = o * (sp.ok ? 1 : 0.35);
    for (let i = 0; i < n; i++) {
      let s, rot, al = 1;
      if (tunnel) { const f = ((i / n + env.ltb * 0.18) % 1); s = S * 0.5 * (0.08 + 0.92 * f); rot = 45 * (P.r > 0.5 ? 1 : 0); al = Math.sin(Math.PI * f); }
      else { s = S * 0.5 * (1 - i / n * 0.86); rot = i * (6 + P.r * 8) + env.ltb * 7 * (P.right ? 1 : -1); }
      const e = E.outExpo(J.clamp((env.lt - i * 0.045) / 0.5));
      if (e <= 0) continue;
      const pts = [];
      for (let k = 0; k <= 4; k++) { const an = (rot + 45 + k * 90) * DEG; pts.push([cx + Math.cos(an) * s * Math.SQRT2, cy + Math.sin(an) * s * Math.SQRT2]); }
      stroke(env, part(pts, 0, e), i === (P.n | 0) ? sc.accent : sc.fg, i === (P.n | 0) ? lw * 1.6 : lw, a * al * (0.45 + 0.55 * (1 - i / n)));
    }
    env.circle(cx, cy, 2.4 * u, sc.accent, null, 0, a * inE(env, 0.3, 0.3), false);
  },
};

/* 回転三角 — a huge hairline triangle whose edges circle clear of the lyric, or a counter-rotating pair with an orbiting solid */
DEF.triangleSpin = {
  name: '回転三角', tags: ['graphic', 'pop', 'glitch'], w: 0.9, layer: 'front',
  draw(env, bb0, P) {
    const bb = getBB(env, bb0), { W, H, sc } = env, u = U(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const e = E.outExpo(J.clamp(env.lt / 0.6)), lw = Math.max(1, 1.4 * u);
    const tri = (cx, cy, R, rot) => { const p = []; for (let k = 0; k <= 3; k++) { const an = (rot - 90 + k * 120) * DEG; p.push([cx + Math.cos(an) * R, cy + Math.sin(an) * R]); } return p; };
    const dir = P.right ? 1 : -1;
    const rin = Math.hypot(bw(bb) / 2, bh(bb) / 2) + 18 * u;
    if (P.big && rin * 2 < Math.max(W, H) * 0.62) {          // one big triangle whose edges stay clear of the lyric
      const cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2, R = rin * 2 * (1 + 0.08 * E.inCubic(env.pOut));
      const rot = dir * ((1 - e) * -70 + env.ltb * 5) + P.r * 120;
      if (env.pass !== 'main') return;
      stroke(env, part(tri(cx, cy, R, rot), 0, e), sc.fg, lw, 0.75 * o);
      stroke(env, part(tri(cx, cy, R * 1.07, -rot * 0.6 + 60), 0, E.outExpo(J.clamp((env.lt - 0.12) / 0.6))), P.accent ? sc.accent : sc.sub, lw, 0.45 * o);
      return;
    }
    // counter-rotating concentric pair + a small solid triangle orbiting them
    const S = J.clamp(Math.min(W, H) * 0.19, 110 * u, 230 * u);
    const sp = P.corner ? cornerSpot(env, bb, S, S, P) : nearBB(env, bb, S, S, P, 24 * u), a = o * (sp.ok ? 1 : 0.35);
    const cx = sp.cx, cy = sp.cy + S * 0.06, R = S * 0.42;
    const r1 = dir * (env.ltb * 16 + (1 - e) * -90) + P.r * 120, r2 = -dir * (env.ltb * 24 + (1 - e) * -140) + 60;
    stroke(env, part(tri(cx, cy, R, r1), 0, e), sc.fg, lw * 1.1, a);
    stroke(env, part(tri(cx, cy, R * 0.62, r2), 0, E.outExpo(J.clamp((env.lt - 0.1) / 0.6))), sc.sub, lw, 0.8 * a);
    const q = E.outBack(J.clamp((env.lt - 0.25) / 0.35), 1.8);
    if (q > 0) {
      const an = (env.ltb * 50 * dir + P.r * 360) * DEG, rr = R * 1.18;
      polys(env, [tri(cx + Math.cos(an) * rr, cy + Math.sin(an) * rr, R * 0.13 * q, env.ltb * 90 * dir)], sc.accent, a, true);
    }
    env.circle(cx, cy, 2.2 * u, sc.accent, null, 0, a * e, false);
  },
};

/* 放射線 — short emphasis dashes radiating from the lyric's outline */
const superR = (a, b, p, th) => { const c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th)); return 1 / Math.pow(Math.pow(c / a, p) + Math.pow(s / b, p), 1 / p); };
DEF.lineBurst = {
  name: '放射線', tags: ['pop', 'graphic', 'emotional'], w: 1.1, layer: 'front',
  draw(env, bb0, P) {
    const bb = getBB(env, bb0), { sc } = env, u = U(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0 || env.pass !== 'main') return;
    const cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2, pad = 18 * u + bh(bb) * 0.14;
    const A = bw(bb) / 2 * 1.08 + pad, B = bh(bb) / 2 * 1.12 + pad;
    // sample the outline and space the dashes evenly along its length
    const M = 180, pts = [], cum = [0];
    for (let i = 0; i <= M; i++) { const th = i / M * TAU, r = superR(A, B, 4, th); pts.push([cx + Math.cos(th) * r, cy + Math.sin(th) * r]); if (i) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); }
    const L = cum[M], N = Math.round(J.clamp(L / (34 * u), 24, 76) * (0.8 + 0.1 * (P.n | 0)));
    const beat = env.beat ? Math.exp(-env.beat.since * 7) : 0.5 + 0.5 * Math.sin(env.ltb * 5);
    const main = [], acc = [], pOut = E.inCubic(env.pOut);
    let j = 1;
    for (let i = 0; i < N; i++) {
      const s = ((i + 0.5 + J.rs(P.seed, i, 1) * 0.3) / N) * L;
      while (j < M && cum[j] < s) j++;
      const k = (s - cum[j - 1]) / Math.max(1e-6, cum[j] - cum[j - 1]), p = L2(pts[j - 1], pts[j], k);
      let tx = pts[j][0] - pts[j - 1][0], ty = pts[j][1] - pts[j - 1][1]; const tl = Math.hypot(tx, ty) || 1; tx /= tl; ty /= tl;
      let nx = ty, ny = -tx; if (nx * (p[0] - cx) + ny * (p[1] - cy) < 0) { nx = -nx; ny = -ny; }
      const len = J.rr(10, 30, P.seed, i, 3) * u * (P.big ? 1.5 : 1) * (1 + 0.2 * beat * J.r(P.seed, i, 4));
      const sE = E.outExpo(J.clamp((env.lt - J.r(P.seed, i, 5) * 0.18) / 0.35));
      if (sE <= 0) continue;
      const d0 = J.r(P.seed, i, 2) * 8 * u + pOut * 60 * u, d1 = d0 + len * sE;
      (i % 6 === 0 ? acc : main).push([p[0] + nx * d0, p[1] + ny * d0, p[0] + nx * d1, p[1] + ny * d1]);
    }
    segs(env, main, sc.fg, 1.6 * u, 0.85 * o, false, 'round');
    segs(env, acc, sc.accent, 2.4 * u, o, false, 'round');
  },
};

/* プラス格子 — a precise grid of + marks with a scanning highlight */
DEF.plusGrid = {
  name: 'プラス格子', tags: ['graphic', 'editorial', 'calm'], w: 1, layer: 'front',
  draw(env, bb0, P) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { sc } = env, u = U(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const cols = 4 + (P.n | 0) + ((P.v | 0) % 3), rows = 2 + ((P.v | 0) % 2) + (P.big ? 1 : 0);
    const s = J.clamp(Math.min(env.W, env.H) * 0.034, 24 * u, 44 * u), ps = s * 0.22;
    const w = (cols - 1) * s + ps * 2, h = (rows - 1) * s + ps * 2;
    const sp = P.corner ? cornerSpot(env, bb, w, h, P) : nearBB(env, bb, w, h, P, 26 * u);
    const a = o * (sp.ok ? 1 : 0.35), list = [], hl = Math.floor(env.ltb * 7 + P.r * 50) % (cols * rows);
    let hx = 0, hy = 0;
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const q = E.outBack(J.clamp((env.lt - (i + j) * 0.03) / 0.3), 2);
      if (q <= 0) continue;
      const x = sp.x + ps + i * s, y = sp.y + ps + j * s, k = ps * q;
      if (j * cols + i === hl && env.lt > 0.5) { hx = x; hy = y; continue; }
      list.push([x - k, y, x + k, y], [x, y - k, x, y + k]);
    }
    segs(env, list, sc.sub, Math.max(1, 1.3 * u), a);
    if (hx) { const k = ps * 1.5; segs(env, [[hx - k, hy - k, hx + k, hy + k], [hx - k, hy + k, hx + k, hy - k]], sc.accent, 1.8 * u, a); }
  },
};

/* ガイド線 — dashed layout guides along the lyric's edges, with handles and readouts */
DEF.guides = {
  name: 'ガイド線', tags: ['editorial', 'graphic', 'calm'], w: 1, layer: 'front',
  draw(env, bb0, P) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { W, H, sc } = env, u = U(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const pad = 10 * u + bh(bb) * 0.05, e = E.outExpo(J.clamp(env.lt / 0.6)), lw = Math.max(1, 1.1 * u);
    const X0 = bb.x0 - pad, X1 = bb.x1 + pad, Y0 = bb.y0 - pad, Y1 = bb.y1 + pad, cx = (X0 + X1) / 2, cy = (Y0 + Y1) / 2;
    const col = P.accent ? sc.accent : (sc.accent2 && J.contrast(sc.accent2, sc.bg) > 2 ? sc.accent2 : sc.accent);
    const hw = W * 0.55 * e, hh = H * 0.55 * e, a = 0.75 * o;
    const vert = P.big || (P.v | 0) % 2 === 1 || bh(bb) > bw(bb);
    for (const y of [Y0, Y1]) if (y > 0 && y < H) dash(env, cx - hw, y, cx + hw, y, 7 * u, 5 * u, col, lw, a);
    if (vert) for (const x of [X0, X1]) if (x > 0 && x < W) dash(env, x, cy - hh, x, cy + hh, 7 * u, 5 * u, col, lw, a);
    const ea = inE(env, 0.3, 0.3) * o, hs = 3.5 * u;
    for (const [x, y] of [[X0, Y0], [X1, Y0], [X0, Y1], [X1, Y1]]) {
      stroke(env, [[x - hs, y - hs], [x + hs, y - hs], [x + hs, y + hs], [x - hs, y + hs]], sc.fg, lw, ea, false, { close: true });
    }
    const fs = FS(env) * 0.75, m = MG(env) * 0.5;
    label(env, `Y ${pad2(Y0, 4)}`, m, Y0 - fs * 0.8, { size: fs, color: col, alpha: ea });
    label(env, `Y ${pad2(Y1, 4)}`, m, Y1 + fs * 0.9, { size: fs, color: col, alpha: ea });
    if (vert) label(env, `X ${pad2(X1, 4)}`, X1 + 6 * u, m + fs * 0.6, { size: fs, color: col, alpha: ea });
  },
};

/* 波線 — a long, precise sine hairline pair drifting across the free band */
function freeBand(env, bb, low) {
  const { H } = env, m = MG(env);
  const above = bb.y0 - m * 0.5, below = H - m * 0.5 - bb.y1;
  let lo = low;
  if ((lo ? below : above) < 60 * U(env) && (lo ? above : below) > (lo ? below : above)) lo = !lo;
  const room = lo ? below : above;
  const d = Math.min(room * 0.5, 40 * U(env) + room * 0.22);
  return { low: lo, room, y: lo ? bb.y1 + d : bb.y0 - d };
}
DEF.waveLine = {
  name: '波線', tags: ['calm', 'emotional', 'graphic'], w: 1, layer: 'front',
  draw(env, bb0, P) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { W, sc } = env, u = U(env), m = MG(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const fb = freeBand(env, bb, !!P.low); if (fb.room < 30 * u) return;
    const A = J.clamp(fb.room * 0.1, 5 * u, 14 * u), lam = J.clamp(Math.min(W, env.H) * 0.07, 44 * u, 96 * u);
    const dir = P.right ? 1 : -1, ph = env.ltb * 2.4 * dir, x0 = m, x1 = W - m;
    const e = E.inOutCubic(J.clamp(env.lt / 0.7)), pOut = E.inCubic(env.pOut);
    const mk = (amp, off) => { const p = []; for (let x = x0; x <= x1 + 0.1; x += 6 * u) { const env2 = Math.min(1, (x - x0) / (lam * 1.5), (x1 - x) / (lam * 1.5)); p.push([x, fb.y + Math.sin((x - x0) / lam * TAU + ph + off) * amp * env2]); } return p; };
    if ((P.v | 0) % 3 === 2) {
      const pts = mk(A, 0), d = [];
      for (let i = 0; i < pts.length; i += 2) { const f = i / pts.length; if (f <= e && f >= pOut) d.push([pts[i][0], pts[i][1], 1.8 * u]); }
      dots(env, d, sc.fg, 0.85 * o);
    } else {
      stroke(env, part(mk(A, 0), pOut, e), sc.fg, 1.4 * u, 0.85 * o);
      stroke(env, part(mk(A * 0.55, Math.PI * 0.6), pOut, E.inOutCubic(J.clamp((env.lt - 0.12) / 0.7))), P.accent ? sc.accent : sc.sub, Math.max(1, u), 0.6 * o);
    }
  },
};

/* 渦巻き — an Archimedean or square spiral drawn on from its centre */
DEF.spiralLine = {
  name: '渦巻き', tags: ['graphic', 'pop', 'calm'], w: 0.8, layer: 'front',
  draw(env, bb0, P) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { sc } = env, u = U(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const R = J.clamp(Math.min(env.W, env.H) * 0.085, 54 * u, 104 * u);
    const sp = nearBB(env, bb, R * 2.3, R * 2.3, P, 20 * u), cx = sp.cx, cy = sp.cy, a = o * (sp.ok ? 1 : 0.35);
    const turns = 3 + (P.n | 0) * 0.5, pts = [], sq = (P.v | 0) % 2 === 1;
    const rot = env.ltb * 18 * (P.right ? 1 : -1) * DEG + P.r * TAU;
    if (sq) {
      const n = Math.round(turns * 4), d = R / (n / 2);
      let x = 0, y = 0; pts.push([0, 0]);
      for (let k = 0; k < n; k++) { const L = d * (Math.floor(k / 2) + 1), dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]][k % 4]; x += dirs[0] * L; y += dirs[1] * L; pts.push([x, y]); }
    } else {
      const M = Math.round(turns * 40);
      for (let k = 0; k <= M; k++) { const th = k / M * turns * TAU, r = R * k / M; pts.push([Math.cos(th) * r, Math.sin(th) * r]); }
    }
    const tp = pts.map(([x, y]) => [cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
    const e = E.inOutCubic(J.clamp(env.lt / 0.7)), pOut = E.inCubic(env.pOut);
    const seg = part(tp, pOut, e);
    stroke(env, seg, sc.fg, 1.4 * u, 0.85 * a, false, { cap: 'round', join: 'round' });
    if (seg.length) { const q = seg[seg.length - 1]; env.circle(q[0], q[1], 3.2 * u, sc.accent, null, 0, a, false); }
  },
};

/* 網点 — a halftone (dot or line screen) gradient bleeding from a screen corner, under the lyric */
DEF.halftonePatch = {
  name: '網点', tags: ['graphic', 'pop', 'editorial'], w: 1, layer: 'back', subtle: true,
  draw(env, bb, P) {
    const { W, H, sc } = env, u = U(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0 || env.pass !== 'main') return;
    const sx = P.right ? 1 : -1, sy = P.low ? 1 : -1, ox = sx > 0 ? W : 0, oy = sy > 0 ? H : 0;
    const pw = W * J.rr(0.38, 0.58, P.seed, 1), ph = H * J.rr(0.38, 0.6, P.seed, 2);
    let g = J.clamp(Math.min(W, H) * 0.018, 12 * u, 22 * u);
    while ((pw / g) * (ph / g) > 1100) g *= 1.15;
    const col = P.accent ? sc.accent : sc.sub, al = (P.accent ? 0.3 : 0.2) * (dark(env) ? 1 : 0.8) * o;
    const lines = (P.v | 0) % 2 === 1;
    const grow = J.clamp(env.lt / 0.7) * 1.3;
    const f = (x, y) => { const d = Math.hypot((x - ox) / pw, (y - oy) / ph); return J.clamp(1 - d) * J.clamp((grow - d) * 3); };
    if (lines) {
      const list = [];
      for (let y = oy - sy * g * 0.5; Math.abs(y - oy) < ph; y -= sy * g) {
        const top = [], bot = [];
        for (let x = ox; Math.abs(x - ox) <= pw; x -= sx * g * 0.5) { const t = g * 0.46 * Math.pow(f(x, y), 1.1); top.push([x, y - t]); bot.push([x, y + t]); }
        list.push(top.concat(bot.reverse()));
      }
      polys(env, list, col, al);
    } else {
      const list = []; let row = 0;
      for (let y = oy - sy * g * 0.5; Math.abs(y - oy) < ph; y -= sy * g, row++) {
        for (let x = ox - sx * (row % 2 ? g : g * 0.5); Math.abs(x - ox) <= pw; x -= sx * g) { const r = g * 0.5 * Math.pow(f(x, y), 1.2); if (r > 0.4) list.push([x, y, r]); }
      }
      dots(env, list, col, al);
    }
  },
};

/* 市松 — a small checkerboard band that wipes open and scrolls */
DEF.checkerStrip = {
  name: '市松の帯', tags: ['pop', 'graphic'], w: 0.8, layer: 'front',
  draw(env, bb0, P) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { W, sc } = env, u = U(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const v = (P.v | 0) % 3, rows = v === 1 ? 3 : v === 2 ? 1 : 2;
    const c = J.clamp(Math.min(W, env.H) * 0.016, 10 * u, 18 * u), L = Math.min(W * 0.32, 400 * u), h = rows * c;
    const sp = cornerSpot(env, bb, L, h + (v === 2 ? 10 * u : 0), P, 1);
    const a = o * (sp.ok ? 1 : 0.35), x0 = sp.x, y0 = sp.y + (v === 2 ? 5 * u : 0);
    const e = E.outExpo(J.clamp(env.lt / 0.55)), vis = L * e, off = (env.ltb * c * 1.6 * (P.right ? -1 : 1)) % (2 * c);
    const list = [];
    for (let j = 0; j < rows; j++) for (let i = -2; i * c < L + 2 * c; i++) {
      if ((i + j) % 2 !== 0) continue;
      let x = x0 + i * c + off, w = c;
      const k = v === 1 ? J.clamp(1 - (i * c) / L * 0.95) : 1;
      const cw = w * k, ch = c * k, cx0 = x + (w - cw) / 2;
      const xa = Math.max(cx0, x0), xb = Math.min(cx0 + cw, x0 + vis);
      if (xb <= xa) continue;
      list.push([xa, y0 + j * c + (c - ch) / 2, xb - xa, ch]);
    }
    rects(env, list, P.accent ? sc.accent : sc.fg, 0.9 * a);
    if (v === 2) { const lw = Math.max(1, u); segs(env, [[x0, y0 - 5 * u, x0 + vis, y0 - 5 * u], [x0, y0 + h + 5 * u, x0 + vis, y0 + h + 5 * u]], sc.fg, lw, 0.8 * a); }
  },
};

/* 拍の輪 — thin rings that ripple outward from the centre on every beat (under the lyric) */
DEF.beatRing = {
  name: '拍の輪', tags: ['pop', 'emotional', 'calm'], w: 1, layer: 'back', subtle: true,
  draw(env, bb, P) {
    if (env.pass !== 'main') return;
    const { W, H, sc } = env, u = U(env);
    const o = outE(env) * inE(env, 0.4, 0, E.outCubic); if (o <= 0.003 || env.lt < 0) return;
    let since, len;
    if (env.beat) { since = env.beat.since; len = env.beat.len; } else { len = 0.5; since = ((env.ltb % len) + len) % len; }
    const cx = W / 2, cy = H / 2, r0 = Math.min(W, H) * 0.2, r1 = Math.hypot(W, H) * 0.55;
    const col = P.accent ? sc.accent : sc.sub, base = (P.accent ? 0.45 : 0.4) * o, dashed = (P.v | 0) % 2 === 1;
    for (let k = 0; k < 3; k++) {
      const p = (since + k * len) / (len * 3); if (p >= 1) continue;
      const r = J.lerp(r0, r1, E.outCubic(p)), al = base * Math.pow(1 - p, 1.6);
      if (dashed) { for (let s = 0; s < 48; s++) env.arc(cx, cy, r, s * 7.5, s * 7.5 + 4, col, 1.4 * u, al, false); }
      else env.circle(cx, cy, r, null, col, (1 + 1.5 * (1 - p)) * u, al, false);
    }
    const pulse = Math.exp(-since * 9);
    env.circle(cx, cy, r0 * (1 + 0.03 * pulse), null, col, (1 + 2.2 * pulse) * u, base * 0.6, false);
  },
};

/* 周回する点 — a tilted orbit around the lyric; dots and trails pass "behind" the text */
DEF.orbitDots = {
  name: '周回する点', tags: ['calm', 'emotional', 'graphic'], w: 1, layer: 'front',
  draw(env, bb0, P) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { W, sc } = env, u = U(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
    const tall = bh(bb) > bw(bb) * 1.2;
    const rx = tall ? Math.max(bw(bb) * 0.9, 50 * u) : Math.min(bw(bb) / 2 + 50 * u + bw(bb) * 0.08, W * 0.47);
    const ry = tall ? Math.min(bh(bb) / 2 + 50 * u + bh(bb) * 0.08, env.H * 0.47) : Math.max(bh(bb) * 0.9, 50 * u);
    const tilt = (P.r - 0.5) * 22 * DEG, ct = Math.cos(tilt), st = Math.sin(tilt);
    const pt = th => { const x = Math.cos(th) * rx, y = Math.sin(th) * ry; return [cx + x * ct - y * st, cy + x * st + y * ct]; };
    const pad = 8 * u, inside = p => p[0] > bb.x0 - pad && p[0] < bb.x1 + pad && p[1] > bb.y0 - pad && p[1] < bb.y1 + pad;
    const e = E.inOutCubic(J.clamp(env.lt / 0.7)), th0 = P.r * TAU;
    // orbit path, skipping the parts hidden by the lyric
    const M = 160, segsL = [];
    let prev = null;
    for (let k = 0; k <= M * e; k++) { const p = pt(th0 + k / M * TAU); if (prev && !inside(p) && !inside(prev)) segsL.push([prev[0], prev[1], p[0], p[1]]); prev = p; }
    segs(env, segsL, sc.sub, Math.max(1, u), 0.55 * o);
    const nd = 2 + (P.n | 0) % 3, dir = P.right ? 1 : -1;
    for (let d = 0; d < nd; d++) {
      const w = (0.35 + d * 0.22) * dir * (1 + 2 * E.inCubic(env.pOut));
      const th = th0 + d * TAU / nd + env.ltb * w, sz = (d === 0 ? 5 : 3.2) * u;
      const trail = [];
      for (let k = 0; k < 10; k++) { const a1 = th - k * 0.045 * Math.sign(w), a2 = th - (k + 1) * 0.045 * Math.sign(w); const p1 = pt(a1), p2 = pt(a2); if (!inside(p1) && !inside(p2)) trail.push([p1, p2, 1 - k / 10]); }
      for (const [p1, p2, f] of trail) stroke(env, [p1, p2], d === 0 ? sc.accent : sc.fg, sz * 0.8 * f, 0.6 * f * o * e);
      const p = pt(th);
      if (!inside(p)) env.circle(p[0], p[1], sz * e, d === 0 ? sc.accent : sc.fg, null, 0, o, false);
    }
  },
};

/* 星座 — a small constellation: stars joined by hairlines, drawn in sequence */
DEF.constellation = {
  name: '星座', tags: ['calm', 'emotional', 'editorial'], w: 0.9, layer: 'front',
  draw(env, bb0, P) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { sc } = env, u = U(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const w = J.clamp(Math.min(env.W, env.H) * 0.3, 190 * u, 340 * u), h = w * 0.62;
    const sp = P.corner ? cornerSpot(env, bb, w, h, P) : nearBB(env, bb, w, h, P, 30 * u), a = o * (sp.ok ? 1 : 0.35);
    const n = 5 + (P.n | 0), cells = [];
    for (let i = 0; i < 12; i++) cells.push([i % 4, Math.floor(i / 4), J.r(P.seed, i, 1)]);
    cells.sort((a, b) => a[2] - b[2]);
    const raw = cells.slice(0, n).map(([cx, cy], i) => [sp.x + w * (cx + 0.5 + J.rs(P.seed, i, 2) * 0.35) / 4, sp.y + h * (cy + 0.5 + J.rs(P.seed, i, 3) * 0.35) / 3]);
    raw.sort((a, b) => a[0] - b[0]);
    const pts = [raw.shift()];
    while (raw.length) { const q = pts[pts.length - 1]; let bi = 0, bd = 1e18; raw.forEach((r, i) => { const d = (r[0] - q[0]) ** 2 + (r[1] - q[1]) ** 2; if (d < bd) { bd = d; bi = i; } }); pts.push(raw.splice(bi, 1)[0]); }
    const path = pts.slice();
    const branch = [pts[Math.floor(n / 2)], [sp.x + w * J.rr(0.3, 0.7, P.seed, 9), sp.y + h * (pts[Math.floor(n / 2)][1] - sp.y > h / 2 ? 0.08 : 0.92)]];
    const e = E.inOutCubic(J.clamp((env.lt - 0.1) / 0.8));
    stroke(env, part(path, 0, e), sc.sub, Math.max(1, u), 0.7 * a);
    stroke(env, part(branch, 0, J.clamp((env.lt - 0.6) / 0.4)), sc.sub, Math.max(1, u), 0.7 * a);
    const all = pts.concat([branch[1]]), stars = [], big = [];
    all.forEach((p, i) => {
      const q = E.outBack(J.clamp((env.lt - i * 0.06) / 0.3), 2);
      if (q <= 0) return;
      const tw = 0.65 + 0.35 * J.noise1(env.ltb * 2.5 + i * 3, P.seed);
      const r = (J.r(P.seed, i, 4) < 0.3 ? 3.6 : 2.2) * u * q;
      stars.push([p[0], p[1], r]);
      if (r > 3 * u * q && i % 2 === 0) big.push([p, tw]);
    });
    dots(env, stars, sc.fg, a);
    for (const [p, tw] of big) { const L = 11 * u * tw; segs(env, [[p[0] - L, p[1], p[0] + L, p[1]], [p[0], p[1] - L, p[0], p[1] + L]], sc.accent, Math.max(1, u), a * tw); }
    label(env, `C-${pad2((env.cut.line | 0) + 1)}`, all[0][0] + 8 * u, all[0][1] - 12 * u, { size: FS(env) * 0.72, alpha: a * inE(env, 0.3, 0.5) });
  },
};

/* ============================================================
   organic / atmosphere
   ============================================================ */
/* alpha that fades a particle out near the lyric (front particles never cover it) */
const clearOf = (bb, x, y, pad, soft) => { const dx = Math.max(bb.x0 - pad - x, 0, x - bb.x1 - pad), dy = Math.max(bb.y0 - pad - y, 0, y - bb.y1 - pad); return J.clamp(Math.hypot(dx, dy) / soft); };
const wrap = (v, lo, span) => lo + (((v - lo) % span) + span) % span;

/* 紙吹雪 — tumbling confetti drifting down around (never over) the lyric */
DEF.confetti = {
  name: '紙吹雪', tags: ['pop', 'emotional'], w: 0.9, layer: 'front',
  draw(env, bb0, P) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { W, H, sc } = env, u = U(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const N = Math.min(56, 26 + (P.n | 0) * 9), cols = [sc.accent, sc.accent2 || sc.fg, sc.fg, sc.sub], buckets = [[], [], [], []];
    const pad = 10 * u, soft = 24 * u;
    for (let i = 0; i < N; i++) {
      const r = k => J.r(P.seed, i, k);
      const q = E.outBack(J.clamp((env.lt - r(1) * 0.35) / 0.3), 1.8);
      if (q <= 0) continue;
      const vy = (70 + r(2) * 110) * u * (1 + E.inCubic(env.pOut)), span = H + 80 * u;
      const y = wrap(r(3) * H + vy * env.ltb, -40 * u, span);
      const x = r(4) * W + Math.sin(env.ltb * (1 + r(5) * 1.8) + r(6) * 6) * (10 + r(7) * 30) * u;
      const al = clearOf(bb, x, y, pad, soft); if (al <= 0.02) continue;
      const w = (11 + r(8) * 11) * u * q, h = w * (0.4 + r(9) * 0.3), rot = r(10) * TAU + env.ltb * (r(11) - 0.5) * 8;
      const flip = Math.max(0.15, Math.abs(Math.cos(env.ltb * (2 + r(12) * 4) + r(13) * 6)));
      const c = Math.cos(rot), s = Math.sin(rot), hw = w / 2 * flip, hh = h / 2;
      const pts = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([px, py]) => [x + px * c - py * s, y + px * s + py * c]);
      if (al < 1) { if (al > 0.5) buckets[i % 4].push(pts); }
      else buckets[i % 4].push(pts);
    }
    buckets.forEach((l, k) => polys(env, l, cols[k], 0.95 * o));
  },
};

/* 花びら — cherry petals tumbling diagonally on the wind, clear of the lyric */
const PETAL = (() => { const h = [[0, -0.5], [0.16, -0.38], [0.3, -0.18], [0.36, 0.04], [0.32, 0.24], [0.22, 0.42], [0.1, 0.5], [0, 0.4]]; return h.concat(h.slice(1, -1).reverse().map(([x, y]) => [-x, y])); })();
DEF.petals = {
  name: '花びら', tags: ['emotional', 'calm', 'pop'], w: 0.9, layer: 'front',
  draw(env, bb0, P) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { W, H, sc } = env, u = U(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const N = Math.min(26, 10 + (P.n | 0) * 5), dir = P.right ? 1 : -1;
    const cA = [], cB = [];
    for (let i = 0; i < N; i++) {
      const r = k => J.r(P.seed, i, k);
      const q = E.outCubic(J.clamp((env.lt - r(1) * 0.4) / 0.35));
      if (q <= 0) continue;
      const vy = (40 + r(2) * 60) * u, vx = dir * (30 + r(3) * 50) * u;
      const x = wrap(r(4) * W + vx * env.ltb + Math.sin(env.ltb * (0.8 + r(5)) + r(6) * 6) * 30 * u, -60 * u, W + 120 * u);
      const y = wrap(r(7) * H + vy * env.ltb, -60 * u, H + 120 * u);
      const al = clearOf(bb, x, y, 12 * u, 28 * u); if (al <= 0.5) continue;
      const L = (24 + r(8) * 20) * u * q, rot = r(9) * TAU + env.ltb * (r(10) - 0.5) * 3;
      const fx = Math.max(0.2, Math.abs(Math.cos(env.ltb * (1.2 + r(11) * 2) + r(12) * 6)));
      const c = Math.cos(rot), s = Math.sin(rot);
      const pts = PETAL.map(([px, py]) => { const X = px * L * fx, Y = py * L; return [x + X * c - Y * s, y + X * s + Y * c]; });
      (r(13) < 0.7 ? cA : cB).push(pts);
    }
    polys(env, cA, sc.accent, 0.9 * o);
    polys(env, cB, dark(env) ? sc.fg : sc.sub, 0.85 * o);
  },
};

/* 雨の筋 — fine slanted rain streaks falling behind the lyric */
DEF.rainStreaks = {
  name: '雨の筋', tags: ['emotional', 'calm', 'glitch'], w: 0.9, layer: 'back', subtle: true,
  draw(env, bb, P) {
    const { W, H, sc } = env, u = U(env);
    const o = outE(env) * inE(env, 0.45, 0, E.outCubic); if (o <= 0.003 || env.lt < 0 || env.pass !== 'main') return;
    const N = Math.min(110, 60 + (P.n | 0) * 16), sl = (P.right ? 1 : -1) * (8 + P.r * 10) * DEG, tn = Math.tan(sl);
    const b = [[], [], []];
    for (let i = 0; i < N; i++) {
      const r = k => J.r(P.seed, i, k), z = r(1);
      const v = (1200 + z * 1300) * u, len = (36 + z * 80) * u, span = H + len + 80 * u;
      const y = wrap(r(2) * span + v * env.ltb, -len - 40 * u, span);
      const x = r(3) * (W + H * Math.abs(tn)) - (tn > 0 ? H * tn : 0) + y * tn;
      b[z < 0.4 ? 0 : z < 0.8 ? 1 : 2].push([x, y, x + len * tn, y + len]);
    }
    const col = dark(env) ? sc.sub : sc.fg;
    const k = dark(env) ? 1 : 0.75;
    segs(env, b[0], col, Math.max(1, 0.9 * u), 0.18 * o * k);
    segs(env, b[1], col, Math.max(1, 1.2 * u), 0.3 * o * k);
    segs(env, b[2], col, 1.6 * u, 0.46 * o * k);
  },
};

/* 雪 — soft snow in three depth layers, gently swaying (under the lyric) */
DEF.snow = {
  name: '雪', tags: ['calm', 'emotional'], w: 0.8, layer: 'back', subtle: true,
  draw(env, bb, P) {
    const { W, H, sc } = env, u = U(env);
    const o = outE(env) * inE(env, 0.5, 0, E.outCubic); if (o <= 0.003 || env.lt < 0 || env.pass !== 'main') return;
    const N = Math.min(90, 46 + (P.n | 0) * 14), L = [[], [], []], halo = [];
    for (let i = 0; i < N; i++) {
      const r = k => J.r(P.seed, i, k), z = r(1), lay = z < 0.5 ? 0 : z < 0.85 ? 1 : 2;
      const rad = [2, 3.4, 5.6][lay] * u * (0.8 + r(2) * 0.4), vy = (22 + lay * 22 + r(3) * 14) * u;
      const y = wrap(r(4) * H + vy * env.ltb, -10 * u, H + 20 * u);
      const x = wrap(r(5) * W + Math.sin(env.ltb * (0.6 + r(6)) + r(7) * 6) * (8 + lay * 10) * u + (P.right ? 1 : -1) * env.ltb * 8 * u, -10 * u, W + 20 * u);
      L[lay].push([x, y, rad]);
      if (lay) halo.push([x, y, rad * 2.2]);
    }
    const col = dark(env) ? sc.fg : sc.sub, k = dark(env) ? 1 : 0.55;
    dots(env, halo, col, 0.08 * o * k);
    dots(env, L[0], col, 0.35 * o * k);
    dots(env, L[1], col, 0.55 * o * k);
    dots(env, L[2], col, 0.75 * o * k);
  },
};

/* 光漏れ — a soft warm light leak breathing in from a screen edge (main pass only) */
DEF.lightLeak = {
  name: '光漏れ', tags: ['emotional', 'calm', 'pop'], w: 1, layer: 'back', subtle: true,
  draw(env, bb, P) {
    const { W, H, sc, ctx } = env;
    if (env.pass !== 'main' || env.lt < 0) return;
    const o = outE(env) * inE(env, 0.6, 0, E.outCubic); if (o <= 0.003) return;
    const dk = dark(env), pick = c => c && (dk ? J.lum(c) > 0.2 : J.lum(c) < 0.85) ? c : null;
    const c1 = pick(sc.accent) || pick(sc.accent2) || sc.sub, c2 = pick(sc.accent2) || c1;
    const breathe = 0.85 + 0.15 * Math.sin(env.ltb * 1.4 + P.r * 6);
    const sx = P.right ? 1 : -1, sy = P.low ? 1 : -1;
    const blob = (x, y, R, c, a) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, R);
      g.addColorStop(0, J.rgba(c, a)); g.addColorStop(0.35, J.rgba(c, a * 0.5)); g.addColorStop(1, J.rgba(c, 0));
      ctx.fillStyle = g; ctx.fillRect(x - R, y - R, R * 2, R * 2);
    };
    ctx.save();
    ctx.globalCompositeOperation = dk ? 'screen' : 'multiply';
    const A = (dk ? 0.5 : 0.28) * o * breathe, M = Math.max(W, H);
    const drift = env.ltb * 18 * (P.corner ? 1 : -1);
    blob((sx > 0 ? W : 0) + sx * M * 0.05, (sy > 0 ? H : 0) * 0.9 + H * 0.05 + drift, M * J.rr(0.42, 0.6, P.seed, 1), c1, A);
    blob((sx > 0 ? W : 0) - sx * M * 0.02, H * J.rr(0.3, 0.7, P.seed, 2) - drift, M * J.rr(0.22, 0.32, P.seed, 3), c2, A * 0.8);
    if ((P.v | 0) % 2) {
      ctx.translate(sx > 0 ? W * 0.82 : W * 0.18, H / 2); ctx.rotate(sx * 14 * DEG);
      const w = W * 0.12, g = ctx.createLinearGradient(-w, 0, w, 0);
      g.addColorStop(0, J.rgba(c1, 0)); g.addColorStop(0.5, J.rgba(c1, A * 0.5)); g.addColorStop(1, J.rgba(c1, 0));
      ctx.fillStyle = g; ctx.fillRect(-w + drift * 0.5, -H, w * 2, H * 2);
    }
    ctx.restore();
  },
};

/* ボケ玉 — out-of-focus light discs (or aperture hexagons) that pull into focus */
DEF.bokeh = {
  name: 'ボケ玉', tags: ['emotional', 'calm', 'pop'], w: 1, layer: 'back', subtle: true,
  draw(env, bb, P) {
    const { W, H, sc } = env, u = U(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0 || env.pass !== 'main') return;
    const N = Math.min(18, 8 + (P.n | 0) * 3), hex = (P.v | 0) % 2 === 1, M = Math.min(W, H);
    const cols = [sc.accent, sc.accent2 || sc.fg, sc.fg];
    const dk = dark(env);
    for (let i = 0; i < N; i++) {
      const r = k => J.r(P.seed, i, k);
      const f = E.outCubic(J.clamp((env.lt - r(1) * 0.4) / 0.6));
      if (f <= 0) continue;
      const R0 = M * (0.025 + r(2) * r(2) * 0.075), R = R0 * (1.5 - 0.5 * f);
      const x = r(3) * W + Math.sin(env.ltb * 0.5 + r(4) * 6) * 14 * u, y = wrap(r(5) * H - env.ltb * (6 + r(6) * 12) * u, -R0, H + R0 * 2);
      const c = cols[i % 3], al = (dk ? 0.06 + r(7) * 0.1 : 0.05 + r(7) * 0.07) * f * o;
      if (hex) {
        const pts = []; for (let k = 0; k < 6; k++) { const an = (k * 60 + 15) * DEG; pts.push([x + Math.cos(an) * R, y + Math.sin(an) * R]); }
        polys(env, [pts], c, al);
        stroke(env, pts, c, 1.4 * u, al * 1.4, false, { close: true });
      } else {
        env.circle(x, y, R, c, null, 0, al, false);
        env.circle(x, y, R * 0.97, null, c, 1.6 * u, al * 1.3, false);
      }
    }
  },
};

/* 集中線 — manga speed lines rushing in from the edges, stopping short of the lyric */
DEF.speedCorner = {
  name: '集中線', tags: ['pop', 'emotional', 'glitch'], w: 0.9, layer: 'front',
  draw(env, bb0, P) {
    const bb = getBB(env, bb0), { W, H, sc } = env, u = U(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0 || env.pass !== 'main') return;
    const cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2, pad = 30 * u + bh(bb) * 0.2;
    const A = bw(bb) / 2 * 1.1 + pad, B = bh(bb) / 2 * 1.15 + pad;
    const N = Math.min(150, 80 + (P.n | 0) * 22), corners = !!P.corner;
    const pOut = E.inCubic(env.pOut), list = [];
    for (let i = 0; i < N; i++) {
      const r = k => J.r(P.seed, i, k);
      let th = r(1) * TAU;
      if (corners) { const q = Math.floor(r(2) * 4), base = Math.atan2((q < 2 ? -1 : 1) * H, (q % 2 ? 1 : -1) * W); th = base + (r(3) - 0.5) * 0.7; }
      const c = Math.cos(th), s = Math.sin(th);
      const tx = c > 0 ? (W + 4 - cx) / c : c < 0 ? (-4 - cx) / c : 1e9, ty = s > 0 ? (H + 4 - cy) / s : s < 0 ? (-4 - cy) / s : 1e9;
      const dEdge = Math.min(tx, ty), dIn = superR(A, B, 4, th) + (20 + r(4) * 0.35 * Math.max(0, dEdge - superR(A, B, 4, th))) * u / u;
      if (dEdge - dIn < 30 * u) continue;
      const jit = 0.85 + 0.15 * J.r(P.seed, i, env.step);
      const e = E.outExpo(J.clamp((env.lt - r(5) * 0.15) / 0.3));
      const tip = J.lerp(dEdge, J.lerp(dEdge, dIn, jit), e) , tipO = J.lerp(tip, dEdge, pOut);
      if (dEdge - tipO < 4 * u) continue;
      const wd = (1.2 + r(6) * 4.5) * u, nx = -s * wd, ny = c * wd;
      const ex = cx + c * dEdge, ey = cy + s * dEdge;
      list.push([[ex + nx, ey + ny], [ex - nx, ey - ny], [cx + c * tipO, cy + s * tipO]]);
    }
    polys(env, list, dark(env) ? sc.fg : sc.ink || sc.fg, 0.8 * o);
  },
};

/* 立ち上る粒 — small embers / light motes rising and fading (under the lyric) */
DEF.risingParticles = {
  name: '立ち上る粒', tags: ['emotional', 'calm', 'glitch'], w: 0.9, layer: 'back', subtle: true,
  draw(env, bb, P) {
    const { W, H, sc } = env, u = U(env);
    const o = outE(env) * inE(env, 0.45, 0, E.outCubic); if (o <= 0.003 || env.lt < 0 || env.pass !== 'main') return;
    const N = Math.min(54, 24 + (P.n | 0) * 10), shape = (P.v | 0) % 3;
    const col = P.accent || shape === 1 ? sc.accent : (dark(env) ? sc.fg : sc.sub);
    const heads = [[], [], []], trails = [[], [], []], glow = [];
    for (let i = 0; i < N; i++) {
      const r = k => J.r(P.seed, i, k);
      const vy = (40 + r(1) * 90) * u, span = H + 120 * u;
      const y = H + 60 * u - wrap(r(2) * span + vy * env.ltb, 0, span);
      const p = J.clamp(1 - y / H), fade = Math.pow(Math.sin(Math.PI * J.clamp(p)), 0.7);
      if (fade <= 0.05) continue;
      const ph = r(5) * 6, f = 0.7 + r(4), sw = 14 * u;
      const x = r(3) * W + Math.sin(env.ltb * f + ph) * sw, dx = Math.cos(env.ltb * f + ph) * f * sw;   // dx: sway velocity
      const s = (1.6 + r(6) * 2.6) * u, b = fade > 0.66 ? 2 : fade > 0.33 ? 1 : 0, tl = vy * 0.28;
      if (shape === 2) heads[b].push([[x, y - s * 1.6], [x + s, y], [x, y + s * 1.6], [x - s, y]]);
      else heads[b].push([x, y, s]);
      trails[b].push([x, y + s * 1.5, x - dx * tl / vy, y + s * 1.5 + tl]);
      if (s > 3 * u) glow.push([x, y, s * 3.2]);
    }
    dots(env, glow, col, 0.06 * o);
    const lw = Math.max(1, u);
    for (let b = 0; b < 3; b++) {
      segs(env, trails[b], col, lw, [0.08, 0.16, 0.26][b] * o, false, 'round');
      (shape === 2 ? polys : dots)(env, heads[b], col, [0.25, 0.5, 0.85][b] * o);
    }
  },
};

/* きらめき — four-point glints twinkling just outside the lyric's corners */
DEF.twinkle = {
  name: 'きらめき', tags: ['pop', 'emotional', 'calm'], w: 1, layer: 'front',
  draw(env, bb0, P) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { W, H, sc } = env, u = U(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const K = Math.min(7, 3 + (P.n | 0) + (P.big ? 1 : 0)), pad = 16 * u + bh(bb) * 0.12;
    const X0 = bb.x0 - pad, X1 = bb.x1 + pad, Y0 = bb.y0 - pad, Y1 = bb.y1 + pad, per = 2 * (X1 - X0 + Y1 - Y0);
    const fills = [[], []], lines = [];
    for (let i = 0; i < K; i++) {
      const r = k => J.r(P.seed, i, k);
      let t = (i + r(1) * 0.6) / K * per, x, y;
      if (t < X1 - X0) { x = X0 + t; y = Y0; } else if ((t -= X1 - X0) < Y1 - Y0) { x = X1; y = Y0 + t; } else if ((t -= Y1 - Y0) < X1 - X0) { x = X1 - t; y = Y1; } else { t -= X1 - X0; x = X0; y = Y1 - t; }
      x += J.rs(P.seed, i, 2) * 14 * u; y += J.rs(P.seed, i, 3) * 14 * u;
      x = J.clamp(x, 16 * u, W - 16 * u); y = J.clamp(y, 16 * u, H - 16 * u);
      if (clearOf(bb, x, y, 4 * u, 1) < 1) continue;
      const R = (i === 0 ? 30 : 13 + r(4) * 12) * u;
      const cyc = 1.3 + r(5) * 0.8, ph = ((env.ltb - r(6) * 0.3) / cyc + r(7)) % 1;
      const intro = E.outBack(J.clamp((env.lt - r(6) * 0.3) / 0.3), 2);
      const s = Math.min(intro, env.lt > 0.6 ? 0.25 + 0.75 * Math.pow(Math.sin(Math.PI * ph), 2) : intro) * o;
      if (s <= 0.02) continue;
      fills[i % 3 === 0 ? 1 : 0].push(glint(x, y, R * s, R * s * 0.2, 0));
      const L = R * 1.9 * s; lines.push([x - L, y, x + L, y], [x, y - L, x, y + L]);
    }
    segs(env, lines, sc.fg, Math.max(1, 0.9 * u), 0.5 * o);
    polys(env, fills[0], sc.fg, o);
    polys(env, fills[1], sc.accent, o);
  },
};

/* ============================================================
   hand-drawn
   ============================================================ */

/* 筆の払い — a dry-brush sweep with bristle streaks and a tapering flick (under the lyric) */
DEF.brushStroke = {
  name: '筆の払い', tags: ['emotional', 'editorial', 'pop'], w: 1, layer: 'back',
  draw(env, bb, P) {
    const { W, H, sc, ctx } = env, u = U(env);
    if (env.pass !== 'main' || env.lt < 0) return;
    const o = outE(env); if (o <= 0.003) return;
    const v = (P.v | 0) % 3;
    // colour + opacity chosen so the lyric (sc.fg) keeps >= 3:1 contrast on top of the stroke
    const cands = v === 1 ? [sc.dim, sc.accent2, sc.sub] : [sc.accent, sc.accent2, sc.ghostA, sc.ghostB, sc.sub, sc.dim];
    let col = null, al = 0;
    for (const c of cands.filter(Boolean)) {
      if (J.contrast(c, sc.bg) < 1.15) continue;
      for (let a = v === 1 ? 0.9 : 0.55; a >= 0.2; a -= 0.07) if (J.contrast(J.mix(sc.bg, c, a), sc.fg) >= 3) { col = c; al = a; break; }
      if (col) break;
    }
    if (!col) return;
    al *= o;
    const T = Math.min(W, H) * J.rr(0.11, 0.16, P.seed, 1);
    const yc = H * 0.5 + (P.low ? 1 : -1) * H * J.rr(0.0, 0.05, P.seed, 2) + (W < H ? 0 : T * 0.1);
    const ltr = !!P.right, xa = W * J.rr(0.06, 0.16, P.seed, 3), xb = W * J.rr(0.84, 0.95, P.seed, 4);
    const tilt = J.rs(P.seed, 5) * T * 0.35, bow = J.rs(P.seed, 6) * T * 0.25;
    const head = E.outCubic(J.clamp(env.lt / 0.5)), K = 22, S = 26;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalAlpha = al; ctx.strokeStyle = col;
    // bristles: all in one path per width band, so overlaps never darken (no alpha build-up)
    const bands = [[], []];
    for (let j = 0; j < K; j++) {
      const f = j / (K - 1) - 0.5, r = k => J.r(P.seed, j, k);
      const edge = Math.abs(f) * 2;
      const t0 = r(1) * 0.05 + edge * edge * 0.06, t1 = 1 - edge * J.rr(0.12, 0.4, P.seed, j, 2) - r(3) * 0.06;
      const te = Math.min(t1, head);
      if (te <= t0) continue;
      const gapAt = r(4) < 0.45 ? J.rr(0.55, 0.9, P.seed, j, 5) : 2, gapL = 0.03 + r(6) * 0.05;
      const pl = []; let cur = null;
      for (let k = 0; k <= S; k++) {
        const t = t0 + (te - t0) * k / S;
        if (t > gapAt && t < gapAt + gapL) { cur = null; continue; }
        const tt = ltr ? t : 1 - t, x = J.lerp(xa, xb, tt);
        const taper = 1 - Math.pow(t, 3) * 0.55;
        const y = yc + tilt * (tt - 0.5) + bow * Math.sin(tt * Math.PI) + f * T * taper + J.rs(P.seed, j, k, 8) * 0.8 * u;
        if (!cur) { cur = []; pl.push(cur); }
        cur.push([x, y]);
      }
      bands[edge > 0.6 || r(7) < 0.3 ? 1 : 0].push(...pl);
    }
    bands.forEach((list, bi) => {
      ctx.lineWidth = T / K * (bi ? 1.3 : 2.2);
      ctx.beginPath();
      for (const pts of list) { if (pts.length < 2) continue; ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); }
      ctx.stroke();
    });
    ctx.restore();
  },
};

/* マスキングテープ — translucent tape pieces pinning the lyric's corners */
DEF.tapePieces = {
  name: 'マスキングテープ', tags: ['pop', 'emotional', 'editorial'], w: 0.9, layer: 'front',
  draw(env, bb0, P) {
    const bb = getBB(env, bb0), { sc, ctx } = env, u = U(env);
    if (env.pass !== 'main' || env.lt < 0) return;
    const o = outE(env); if (o <= 0.003) return;
    const Lt = J.clamp(Math.min(env.W, env.H) * 0.115, 90 * u, 150 * u) * (0.9 + P.r * 0.2), Ht = Lt * 0.4, v = (P.v | 0) % 3;
    const cs = P.big ? [[-1, -1], [1, -1], [1, 1], [-1, 1]] : P.right ? [[1, -1], [-1, 1]] : [[-1, -1], [1, 1]];
    const col = [sc.accent2 && J.contrast(sc.accent2, sc.bg) > 1.6 ? sc.accent2 : sc.sub, sc.accent, sc.sub][v];
    cs.forEach(([sx, sy], k) => {
      const q = J.clamp((env.lt - 0.08 - k * 0.1) / 0.25); if (q <= 0) return;
      const eq = E.outCubic(q), X = sx < 0 ? bb.x0 : bb.x1, Y = sy < 0 ? bb.y0 : bb.y1;
      const cx = X + sx * Ht * 0.55, cy = Y + sy * Ht * 0.55;
      const ang = (-sx * sy * 40 + J.rs(P.seed, k, 1) * 10 + (1 - eq) * 10 * sx) * DEG, s = 1 + 0.2 * (1 - eq);
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang); ctx.scale(s, s);
      const hl = Lt / 2, hh = Ht / 2, teeth = 5, pts = [];
      for (let i = 0; i <= teeth; i++) pts.push([-hl + (i % 2 ? 3 : 0) * u + J.rs(P.seed, k, i, 2) * 2 * u, -hh + i / teeth * Ht]);
      for (let i = teeth; i >= 0; i--) pts.push([hl - (i % 2 ? 3 : 0) * u + J.rs(P.seed, k, i, 3) * 2 * u, -hh + i / teeth * Ht]);
      polys(env, [pts], col, 0.62 * eq * o);
      if (v !== 1) {                                     // printed stripes on the tape
        ctx.save(); ctx.beginPath(); ctx.rect(-hl + 3 * u, -hh, Lt - 6 * u, Ht); ctx.clip();
        const list = []; for (let x = -hl - Ht; x < hl + Ht; x += 9 * u) list.push([x, hh, x + Ht, -hh]);
        segs(env, list, dark(env) ? sc.bg : sc.fg, 2 * u, 0.14 * eq * o);
        ctx.restore();
      }
      ctx.restore();
    });
  },
};

/* 手描きの囲み — a loose hand-drawn loop around the lyric */
function handLoop(env, bb, P, turns) {
  const u = U(env), { W, H } = env, pad = 14 * u + Math.min(bw(bb), bh(bb)) * 0.08;
  const hw = bw(bb) / 2, hh = bh(bb) / 2, cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
  const lx = Math.max(hw * 0.9, Math.min(cx, W - cx) - 10 * u), ly = Math.max(hh * 0.9, Math.min(cy, H - cy) - 10 * u);
  let A = Math.min(hw * 1.22 + pad, lx), B = Math.min(hh * 1.22 + pad, ly);
  // keep the lyric's corners inside the loop (a loose ring may graze them when the screen is tight)
  if ((hw / A) ** 2 + (hh / B) ** 2 > 1) {
    if (A < hw * 1.22 + pad) B = Math.min(ly, hh / Math.sqrt(Math.max(0.06, 1 - (hw / A) ** 2)) * 0.96 + pad * 0.3);
    else A = Math.min(lx, hw / Math.sqrt(Math.max(0.06, 1 - (hh / B) ** 2)) * 0.96 + pad * 0.3);
  }
  const th0 = (P.right ? -0.3 : 0.3) * Math.PI - Math.PI / 2, dir = P.right ? 1 : -1, M = 140, pts = [], tilt = J.rs(P.seed, 1) * 2 * DEG;
  for (let i = 0; i <= M; i++) {
    const t = i / M, th = th0 + dir * t * turns * TAU;
    const k = 1 + 0.03 * J.noise1(t * 6 + (P.seed % 97), P.seed) + 0.05 * Math.max(0, t * turns - 0.85);
    const x = Math.cos(th) * A * k, y = Math.sin(th) * B * k;
    pts.push([cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)]);
  }
  return pts;
}
DEF.scribbleCircle = {
  name: '手描きの囲み', tags: ['pop', 'emotional', 'editorial'], w: 1, layer: 'front',
  draw(env, bb0, P) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { sc } = env, u = U(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const pts = handLoop(env, bb, P, (P.v | 0) % 2 ? 1.85 : 1.12);
    const e = E.inOutCubic(J.clamp((env.lt - 0.05) / 0.6));
    stroke(env, part(pts, 0, e), P.accent || !dark(env) ? sc.accent : sc.fg, 3 * u, 0.95 * o, false, { cap: 'round', join: 'round' });
  },
};

/* 手描き下線 — a hand-drawn underline: a double swipe, a wavy line or a zig-zag scribble */
DEF.scribbleUnder = {
  name: '手描き下線', tags: ['pop', 'emotional', 'editorial'], w: 1.1, layer: 'front',
  draw(env, bb0, P) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { sc } = env, u = U(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const vert = bh(bb) > bw(bb) * 1.3, v = (P.v | 0) % 3;
    const L0 = vert ? bb.y0 : bb.x0, L1 = vert ? bb.y1 : bb.x1, len = L1 - L0;
    const base = vert ? bb.x1 + 14 * u + bw(bb) * 0.1 : bb.y1 + 14 * u + bh(bb) * 0.14;
    const map = ([a, c]) => (vert ? [base + c, a] : [a, base + c]);
    const n = (t, k) => J.noise1(t * 3 + k * 7, P.seed) * 3 * u;
    const strokes = [];
    if (v === 0) {
      const s1 = [], s2 = [];
      for (let i = 0; i <= 24; i++) { const t = i / 24; s1.push([L0 - 8 * u + (len + 16 * u) * t, Math.sin(t * Math.PI) * 5 * u + n(t, 1) - t * 4 * u]); }
      for (let i = 0; i <= 16; i++) { const t = i / 16; s2.push([L0 + len * 0.18 + len * 0.78 * t, 11 * u + Math.sin(t * Math.PI) * 4 * u + n(t, 2)]); }
      strokes.push(s1, s2);
    } else if (v === 1) {
      const s = [], lam = J.clamp(len / 22, 30 * u, 64 * u);
      for (let x = 0; x <= len + 0.1; x += 5 * u) s.push([L0 + x, Math.sin(x / lam * TAU) * 5 * u + n(x / len, 3)]);
      strokes.push(s);
    } else {
      const s = [], passes = 5;
      for (let i = 0; i <= passes; i++) { const t = i / passes; s.push([L0 + (i % 2 ? len * 0.96 : len * 0.04) + J.rs(P.seed, i, 4) * 8 * u, t * 14 * u + n(t, 5)]); }
      strokes.push(s);
    }
    const col = P.accent || !dark(env) ? sc.accent : sc.fg;
    strokes.forEach((s, k) => {
      const e = E.inOutCubic(J.clamp((env.lt - 0.05 - k * 0.28) / (v === 2 ? 0.55 : 0.35)));
      stroke(env, part(s.map(map), 0, e), col, (k ? 2.6 : 3.4) * u, 0.95 * o, false, { cap: 'round', join: 'round' });
    });
  },
};

/* 取り消し線 — a small "draft" word beside the lyric, struck out by hand */
DEF.crossOut = {
  name: '推敲の走り書き', tags: ['editorial', 'emotional'], w: 0.4, layer: 'front',
  draw(env, bb0, P) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { sc } = env, u = U(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const txt = String(env.cut.text || '').replace(/\s+/g, '');
    const arr = [...txt]; if (arr.length < 1) return;
    const w0 = ((env.cut.words && env.cut.words[0]) || '').replace(/\s+/g, '');
    const word = [...w0].length >= 2 && [...w0].length <= 4 ? w0 : arr.slice(0, Math.min(arr.length, 2 + (P.v | 0) % 3)).join('');
    const font = serifF(env), fs = J.clamp(bh(bb) * 0.3, 22 * u, 46 * u);
    const tw = textW(word, font, fs, 0.1);
    const sp = nearBB(env, bb, tw + 24 * u, fs * 1.8, Object.assign({}, P, { low: false }), 16 * u);
    const cx = sp.cx, cy = sp.cy, a = o * (sp.ok ? 1 : 0.4);
    label(env, word, cx, cy, { font, size: fs, align: 'center', color: sc.sub, alpha: a * inE(env, 0.2), track: 0.1 });
    const col = sc.accent, x0 = cx - tw / 2 - 6 * u, x1 = cx + tw / 2 + 6 * u;
    const strikes = (P.v | 0) % 2 ? [[[x0, cy - fs * 0.05], [x1, cy - fs * 0.12]], [[x0 + 4 * u, cy + fs * 0.1], [x1 - 2 * u, cy + fs * 0.02]]]
      : [(() => { const s = []; for (let i = 0; i <= 6; i++) s.push([J.lerp(x0, x1, i / 6), cy + (i % 2 ? -1 : 1) * fs * 0.28]); return s; })()];
    strikes.forEach((s, k) => stroke(env, part(s, 0, E.inOutCubic(J.clamp((env.lt - 0.3 - k * 0.14) / 0.25))), col, 2.4 * u, 0.95 * a, false, { cap: 'round', join: 'round' }));
    // a little hand-drawn arrow to the nearest edge of the lyric
    const e3 = E.outCubic(J.clamp((env.lt - 0.6) / 0.3)); if (e3 <= 0) return;
    let c1, c3;
    if (cy + fs * 0.6 < bb.y0) { c1 = [cx + tw * 0.25, cy + fs * 0.75]; c3 = [J.clamp(cx + tw * 0.35, bb.x0 + 10 * u, bb.x1 - 10 * u), bb.y0 - 6 * u]; }
    else if (cy - fs * 0.6 > bb.y1) { c1 = [cx + tw * 0.25, cy - fs * 0.75]; c3 = [J.clamp(cx + tw * 0.35, bb.x0 + 10 * u, bb.x1 - 10 * u), bb.y1 + 6 * u]; }
    else if (cx < bb.x0) { c1 = [cx + tw / 2 + 8 * u, cy + fs * 0.3]; c3 = [bb.x0 - 6 * u, J.clamp(cy + fs, bb.y0 + 10 * u, bb.y1 - 10 * u)]; }
    else { c1 = [cx - tw / 2 - 8 * u, cy + fs * 0.3]; c3 = [bb.x1 + 6 * u, J.clamp(cy + fs, bb.y0 + 10 * u, bb.y1 - 10 * u)]; }
    const dd = Math.hypot(c3[0] - c1[0], c3[1] - c1[1]);
    if (dd > 14 * u && dd < 260 * u) {
      const nx = -(c3[1] - c1[1]) / dd, ny = (c3[0] - c1[0]) / dd, bend = dd * 0.25;
      const c2 = [(c1[0] + c3[0]) / 2 + nx * bend, (c1[1] + c3[1]) / 2 + ny * bend];
      const pts = []; for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push([(1 - t) * (1 - t) * c1[0] + 2 * t * (1 - t) * c2[0] + t * t * c3[0], (1 - t) * (1 - t) * c1[1] + 2 * t * (1 - t) * c2[1] + t * t * c3[1]]); }
      stroke(env, part(pts, 0, e3), col, 2 * u, 0.9 * a, false, { cap: 'round', join: 'round' });
      if (e3 > 0.95) { const p = pts[pts.length - 1], q = pts[pts.length - 3], an = Math.atan2(p[1] - q[1], p[0] - q[0]), L = 9 * u; stroke(env, [[p[0] - Math.cos(an - 0.5) * L, p[1] - Math.sin(an - 0.5) * L], p, [p[0] - Math.cos(an + 0.5) * L, p[1] - Math.sin(an + 0.5) * L]], col, 2 * u, 0.9 * a, false, { cap: 'round', join: 'round' }); }
    }
  },
};

/* 蛍光マーカー — a highlighter swipe under the lower half of each lyric line (screen / multiply, so glyphs stay crisp) */
DEF.highlightMark = {
  name: '蛍光マーカー', tags: ['pop', 'editorial', 'emotional'], w: 1, layer: 'front',
  draw(env, bb0, P) {
    const bb = getBB(env, bb0), { sc, ctx } = env, u = U(env);
    if (env.pass !== 'main' || env.lt < 0) return;
    const o = outE(env); if (o <= 0.003) return;
    const dk = dark(env);
    // marker colour: visible on the background AND clearly different from the text colour
    const cands = [sc.accent, sc.accent2, sc.ghostA, sc.ghostB, sc.sub].filter(Boolean);
    // light text → screen a lighter colour; dark text → multiply a darker one (the glyphs themselves stay untouched)
    const lighten = J.lum(sc.fg) > J.lum(sc.bg), lb = J.lum(sc.bg);
    const side = c => (lighten ? J.lum(c) > lb + 0.06 : J.lum(c) < lb - 0.06);
    const pool = cands.filter(side);
    let col = pool.find(c => J.contrast(c, sc.fg) >= 1.6), weak = 1;
    if (!col) { if (!pool.length) return; col = pool.sort((x, y) => J.contrast(y, sc.fg) - J.contrast(x, sc.fg))[0]; weak = 0.7; }
    const vert = bh(bb) > bw(bb) * 1.25;
    // group glyph boxes into lines (or columns)
    let lines = [];
    if (bb.boxes && bb.boxes.length && bb.cx != null) {
      const bx = bb.boxes.map(b => ({ x0: bb.cx + b.x - b.w / 2, x1: bb.cx + b.x + b.w / 2, y0: bb.cy + b.y - b.h / 2, y1: bb.cy + b.y + b.h / 2 }));
      for (const b of bx) {
        const key = vert ? (b.x0 + b.x1) / 2 : (b.y0 + b.y1) / 2, sz = vert ? b.x1 - b.x0 : b.y1 - b.y0;
        let L = lines.find(l => Math.abs(l.k - key) < sz * 0.4);
        if (!L) { L = { k: key, x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1 }; lines.push(L); }
        else { L.x0 = Math.min(L.x0, b.x0); L.x1 = Math.max(L.x1, b.x1); L.y0 = Math.min(L.y0, b.y0); L.y1 = Math.max(L.y1, b.y1); }
      }
      lines.sort((a, b) => (vert ? b.k - a.k : a.k - b.k));
    }
    if (!lines.length) lines = [{ x0: bb.x0, x1: bb.x1, y0: bb.y0, y1: bb.y1 }];
    ctx.save();
    ctx.globalCompositeOperation = lighten ? 'screen' : 'multiply';
    lines.slice(0, 4).forEach((L, k) => {
      const e = E.inOutCubic(J.clamp((env.lt - 0.1 - k * 0.22) / 0.4)); if (e <= 0) return;
      const pts = [], s = vert ? L.x1 - L.x0 : L.y1 - L.y0, M = 14;
      const a0 = (vert ? L.y0 : L.x0) - s * 0.12, a1 = (vert ? L.y1 : L.x1) + s * 0.12, aE = J.lerp(a0, a1, e);
      const c0 = vert ? L.x0 + s * 0.52 : L.y0 + s * 0.46, c1 = vert ? L.x1 + s * 0.06 : L.y1 + s * 0.06;
      const sl = s * 0.18;
      for (let i = 0; i <= M; i++) { const t = i / M, a = J.lerp(a0 + sl, aE, t); pts.push(vert ? [c1 + J.noise1(t * 4, P.seed) * 1.5 * u, a] : [a, c0 + J.noise1(t * 4, P.seed) * 1.5 * u]); }
      for (let i = M; i >= 0; i--) { const t = i / M, a = J.lerp(a0, aE - (e < 1 ? 0 : sl), t); pts.push(vert ? [c0 + J.noise1(t * 4 + 9, P.seed) * 1.5 * u, a] : [a, c1 + J.noise1(t * 4 + 9, P.seed) * 1.5 * u]); }
      polys(env, [pts], col, (dk ? 0.6 : 0.62) * o * weak);
    });
    ctx.restore();
  },
};

/* ハートと星 — little hearts / stars popping around the lyric */
DEF.heartsStars = {
  name: 'ハートと星', tags: ['pop', 'emotional'], w: 0.9, layer: 'front',
  draw(env, bb0, P) {
    const bb = getBB(env, bb0), { W, H, sc } = env, u = U(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const K = Math.min(7, 3 + (P.n | 0) + (P.big ? 1 : 0)), v = (P.v | 0) % 3, pad = 26 * u + bh(bb) * 0.15;
    const X0 = bb.x0 - pad, X1 = bb.x1 + pad, Y0 = bb.y0 - pad, Y1 = bb.y1 + pad, per = 2 * (X1 - X0 + Y1 - Y0);
    const cols = [sc.accent, sc.fg, sc.accent2 && J.contrast(sc.accent2, sc.bg) > 1.8 ? sc.accent2 : sc.accent];
    for (let i = 0; i < K; i++) {
      const r = k => J.r(P.seed, i, k);
      let t = ((i + 0.3 + r(1) * 0.4) / K) * per, x, y;
      if (t < X1 - X0) { x = X0 + t; y = Y0; } else if ((t -= X1 - X0) < Y1 - Y0) { x = X1; y = Y0 + t; } else if ((t -= Y1 - Y0) < X1 - X0) { x = X1 - t; y = Y1; } else { t -= X1 - X0; x = X0; y = Y1 - t; }
      x = J.clamp(x, 24 * u, W - 24 * u); y = J.clamp(y, 24 * u, H - 24 * u);
      if (clearOf(bb, x, y, 6 * u, 1) < 1) continue;
      const q = E.outBack(J.clamp((env.lt - 0.05 - i * 0.07) / 0.3), 2.4) * (1 - E.inCubic(env.pOut));
      if (q <= 0.01) continue;
      const s = (i === 0 ? 36 : 18 + r(2) * 14) * u * q;
      const yy = y + Math.sin(env.ltb * 3 + i * 1.7) * 3 * u, rot = Math.sin(env.ltb * 2 + i) * 10 + J.rs(P.seed, i, 3) * 15;
      const isHeart = v === 0 || (v === 2 && i % 2 === 0);
      let pts = isHeart ? heart(0, 0, s) : star5(0, 0, s, s * 0.45);
      const c = Math.cos(rot * DEG), sn = Math.sin(rot * DEG);
      pts = pts.map(([px, py]) => [x + px * c - py * sn, yy + px * sn + py * c]);
      const col = cols[i % 3];
      if (r(4) < 0.35) stroke(env, pts, col, 2.2 * u, o, false, { close: true, join: 'round' });
      else polys(env, [pts], col, o, true);
    }
  },
};

/* ============================================================
   type ornaments
   ============================================================ */

/* 透かし大漢字 — one character of the lyric, huge and dim, cropped by the screen edge */
DEF.watermarkKanji = {
  name: '透かし大漢字', tags: ['editorial', 'emotional', 'calm'], w: 1, layer: 'back',
  draw(env, bb, P) {
    if (env.pass !== 'main') return;
    const { W, H, sc } = env, u = U(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const ch = lyricChar(env, P.v); if (!ch) return;
    const e = E.outCubic(J.clamp(env.lt / 0.6));
    const S = Math.min(H * 0.86, W * 0.92) * (1.06 - 0.06 * e);
    const x = P.right ? W - S * 0.3 : S * 0.3, y = H * 0.5 + (P.low ? 1 : -1) * H * 0.06 - env.ltb * 5 * u;
    const outline = (P.v | 0) % 2 === 1;
    const font = (P.v | 0) % 3 === 0 ? env.st.fonts.display[0] : serifF(env);
    if (outline) env.draw({ text: ch, font, size: S, x, y, color: sc.sub, fill: false, stroke: 1.6 * u, alpha: 0.32 * e * o, ghost: false });
    else env.draw({ text: ch, font, size: S, x, y, color: sc.dim, alpha: e * o, ghost: false });
  },
};

/* 縦書き帯 — the whole lyric line set small and vertical at a screen edge, with a hairline rule */
DEF.verticalStrip = {
  name: '縦書き帯', tags: ['editorial', 'calm', 'emotional'], w: 1, layer: 'front',
  draw(env, bb0, P) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { W, H, sc } = env, u = U(env), m = MG(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const all = [...String(env.cut.lineText || env.cut.text || '').replace(/\s+/g, '　')].slice(0, 26);
    if (!all.join('').trim()) return;
    const fs = J.clamp(Math.min(W, H) * 0.022, 15 * u, 24 * u), track = 0.28, step = fs * (1 + track), clear = 44 * u;
    const font = (P.v | 0) % 2 ? serifF(env) : bodyF(env);
    // pick the edge / end with the most room (the strip never approaches the lyric)
    let best = null;
    for (const right of [!!P.right, !P.right]) for (const top of [!P.low, !!P.low]) {
      const x = right ? W - m * 0.95 : m * 0.95, hClear = x + fs * 1.8 < bb.x0 - clear || x - fs * 1.8 > bb.x1 + clear;
      const y0 = top ? m * 1.6 + fs : null, yEnd = top ? null : H - m * 1.3;
      const avail = hClear ? H - m * 2.9 - fs : top ? bb.y0 - clear - y0 : yEnd - (bb.y1 + clear);
      const n = Math.min(all.length, Math.floor(avail / step));
      if (n >= 4 && (!best || n > best.n + 1)) best = { right, top, x, y0, yEnd, n };
    }
    if (!best) return;
    const chars = all.slice(0, best.n), text = chars.join(''), th = best.n * step - fs * track;
    const y0 = best.top ? best.y0 : best.yEnd - th, x = best.x;
    const shown = Math.ceil(best.n * J.clamp((env.lt - 0.08) / 0.55));
    if (shown > 0) env.draw({ text: chars.slice(0, shown).join(''), font, size: fs, x, y: y0, vertical: true, align: 'left', track, color: sc.fg, alpha: 0.9 * o, ghost: false });
    const rx = x + (best.right ? -1 : 1) * fs * 1.1, e = E.outExpo(J.clamp(env.lt / 0.6));
    stroke(env, [[rx, y0 - fs * 0.2], [rx, y0 - fs * 0.2 + (th + fs * 0.4) * e]], sc.sub, Math.max(1, u), 0.7 * o);
    env.rect(rx - 2 * u, y0 - fs * 0.2 - 12 * u, 4 * u, 8 * u, sc.accent, o * e, false);
    label(env, pad2((env.cut.line | 0) + 1), x, y0 - fs * 1.6, { size: FS(env) * 0.75, align: 'center', alpha: o * e });
  },
};

/* ローマ字 — a thin, widely-tracked latin line under the lyric that decodes letter by letter */
const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
DEF.romajiLine = {
  name: 'ローマ字', tags: ['editorial', 'calm', 'graphic'], w: 1, layer: 'front',
  draw(env, bb0, P) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { W, H, sc } = env, u = U(env), m = MG(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const raw = String(env.cut.text || '').replace(/\s+/g, ' ').trim(); if (!raw) return;
    let str = env.cut.note ? String(env.cut.note) : null;
    if (!str) { const rj = J.romaji(raw.replace(/[、。！？!?,.・「」]/g, ' ')); str = rj ? rj.toUpperCase().replace(/\s+/g, ' ').trim() : [...raw].filter(c => c.trim()).slice(0, 6).map(c => 'U+' + c.codePointAt(0).toString(16).toUpperCase()).join(' '); }
    const font = (P.v | 0) % 2 ? bodyF(env) : monoF(env), track = 0.34;
    let fs = J.clamp(Math.min(W, H) * 0.018, 12 * u, 20 * u);
    const maxW = Math.min(W - m * 2.4, Math.max(bw(bb) * 1.15, W * 0.4));
    let tw = textW(str, font, fs, track);
    if (tw > maxW) { fs = Math.max(10 * u, fs * maxW / tw); tw = textW(str, font, fs, track); }
    while (tw > maxW && str.length > 4) { str = str.slice(0, -2); tw = textW(str + '...', font, fs, track); if (tw <= maxW) { str += '...'; break; } }
    const gap = 18 * u + bh(bb) * 0.1;
    let below = !!P.low, y = below ? bb.y1 + gap + fs * 0.5 : bb.y0 - gap - fs * 0.5;
    if (y < m * 0.6 || y > H - m * 0.6) { below = !below; y = below ? bb.y1 + gap + fs * 0.5 : bb.y0 - gap - fs * 0.5; }
    const cx = J.clamp((bb.x0 + bb.x1) / 2, m + tw / 2, W - m - tw / 2);
    const chars = [...str], n = chars.length;
    const out = chars.map((c, i) => {
      if (c === ' ') return ' ';
      const ti = 0.06 + i / Math.max(1, n) * 0.5;
      if (env.lt >= ti) return c;
      if (env.lt < ti - 0.22) return ' ';
      return AZ[J.h(P.seed, i, env.step) % 26];
    }).join('');
    // keep glyph positions stable: draw with left alignment from the final string's start
    label(env, out, cx - tw / 2, y, { font, size: fs, color: sc.sub, alpha: o * E.outCubic(J.clamp(env.lt / 0.2)), track });
    const e = E.outExpo(J.clamp((env.lt - 0.1) / 0.5)), hl = 36 * u * e, g = 14 * u;
    segs(env, [[cx - tw / 2 - g - hl, y, cx - tw / 2 - g, y], [cx + tw / 2 + g, y, cx + tw / 2 + g + hl, y]], P.accent ? sc.accent : sc.sub, Math.max(1, u), 0.8 * o);
  },
};

/* 隅付き括弧 — bold 【 】 lenticular brackets clasping the lyric (︻ ︼ for vertical text) */
function lentil(xo, yT, yB, aw, tb, side) {           // xo = outer straight edge; side -1 = 【 (tips to the right), 1 = 】
  const pts = [[xo, yT], [xo - side * aw, yT]], M = 16, h = yB - yT;
  for (let i = 1; i < M; i++) { const t = i / M, b = Math.pow(Math.sin(t * Math.PI), 0.7); pts.push([xo - side * (aw - (aw - tb) * b), yT + h * t]); }
  pts.push([xo - side * aw, yB], [xo, yB]);
  return pts;
}
DEF.bracketsJP = {
  name: '隅付き括弧', tags: ['pop', 'graphic', 'editorial'], w: 1, layer: 'front',
  draw(env, bb0, P) {
    const bb = getBB(env, bb0), { W, H, sc } = env, u = U(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0) return;
    const e = E.outExpo(J.clamp(env.lt / 0.45)), pOut = E.inCubic(env.pOut), sl = (1 - e + pOut * 0.6) * 60 * u;
    const vert = bh(bb) > bw(bb) * 1.25, col = P.accent ? sc.accent : sc.fg, a = o * J.clamp(env.lt / 0.12);
    if (!vert) {
      const h = J.clamp(bh(bb) * 1.08 + 16 * u, 40 * u, H * 0.6) * (0.5 + 0.5 * e), aw = Math.min(h * 0.24, 26 * u + Math.min(W, H) * 0.028), tb = aw * 0.3, gap = 12 * u + bh(bb) * 0.05;
      const yc = (bb.y0 + bb.y1) / 2;
      const xl = Math.max(bb.x0 - gap, aw + 6 * u), xr = Math.min(bb.x1 + gap, W - aw - 6 * u);
      polys(env, [lentil(xl - aw - sl, yc - h / 2, yc + h / 2, aw, tb, -1), lentil(xr + aw + sl, yc - h / 2, yc + h / 2, aw, tb, 1)], col, a, true);
    } else {
      const wv = J.clamp(bw(bb) * 1.05 + 16 * u, 40 * u, W * 0.6) * (0.5 + 0.5 * e), aw = Math.min(wv * 0.24, 26 * u + Math.min(W, H) * 0.028), tb = aw * 0.3, gap = 12 * u + bw(bb) * 0.05;
      const xc = (bb.x0 + bb.x1) / 2, xL = xc - wv / 2, M = 16;
      const yt = Math.max(bb.y0 - gap, aw + 6 * u) - sl, yb = Math.min(bb.y1 + gap, H - aw - 6 * u) + sl;
      const mk = (yi, dir) => { const p = [[xL, yi + dir * aw], [xL, yi]]; for (let i = 1; i < M; i++) { const t = i / M, b = Math.pow(Math.sin(t * Math.PI), 0.7); p.push([xL + wv * t, yi + dir * (aw - tb) * b]); } p.push([xL + wv, yi], [xL + wv, yi + dir * aw]); return p; };
      polys(env, [mk(yt, -1), mk(yb, 1)], col, a, true);
    }
  },
};

/* 落款 — a red seal stamp with one character of the lyric, pressed beside it */
DEF.seal = {
  name: '落款', tags: ['editorial', 'emotional', 'calm'], w: 0.9, layer: 'front',
  draw(env, bb0, P) {
    if (env.pass !== 'main') return;
    const bb = getBB(env, bb0), { sc, ctx } = env, u = U(env);
    const o = outE(env); if (o <= 0.003 || env.lt < 0.08) return;
    const ch = lyricChar(env, 3 + (P.v | 0)); if (!ch) return;
    const S = J.clamp(Math.min(env.W, env.H) * 0.074, 48 * u, 92 * u);
    const sp = nearBB(env, bb, S * 1.3, S * 1.3, Object.assign({}, P, { right: P.v % 3 !== 2, low: true }), 14 * u);
    const p = J.clamp((env.lt - 0.08) / 0.3), q = E.outCubic(p), a = J.clamp(p * 4) * o * (sp.ok ? 1 : 0.4);
    const s = J.lerp(1.5, 1, q), rot = (J.rs(P.seed, 1) * 5 - (1 - q) * 12) * DEG, round = (P.v | 0) % 2 === 1;
    ctx.save(); ctx.translate(sp.cx, sp.cy); ctx.rotate(rot); ctx.scale(s, s);
    const h = S / 2, pts = [];
    if (round) { for (let i = 0; i < 28; i++) { const an = i / 28 * TAU, r = h * (1 + J.rs(P.seed, i, 2) * 0.025); pts.push([Math.cos(an) * r, Math.sin(an) * r]); } }
    else { const c = [[-h, -h], [h, -h], [h, h], [-h, h]]; for (let k = 0; k < 4; k++) { const p0 = c[k], p1 = c[(k + 1) % 4]; for (let i = 0; i < 4; i++) { const t = i / 4, j = J.rs(P.seed, k, i, 3) * 1.3 * u; pts.push([J.lerp(p0[0], p1[0], t) + (k % 2 ? j : 0), J.lerp(p0[1], p1[1], t) + (k % 2 ? 0 : j)]); } } }
    polys(env, [pts], sc.accent, a * 0.95, false);
    if (env.pass === 'main') {
      const inner = (P.v | 0) % 3 === 2;
      if (inner) { if (round) env.circle(0, 0, h * 0.84, null, sc.bg, 1.6 * u, a, false); else stroke(env, [[-h * 0.84, -h * 0.84], [h * 0.84, -h * 0.84], [h * 0.84, h * 0.84], [-h * 0.84, h * 0.84]], sc.bg, 1.6 * u, a, false, { close: true }); }
      env.draw({ text: ch, font: serifF(env) === 'mincho_light' ? 'mincho_bold' : serifF(env), size: S * 0.62, x: 0, y: S * 0.02, color: sc.bg, alpha: a, ghost: false });
      const sp2 = []; for (let i = 0; i < 9; i++) sp2.push([J.rs(P.seed, i, 5) * h * 0.9, J.rs(P.seed, i, 6) * h * 0.9, (0.6 + J.r(P.seed, i, 7) * 1.6) * u]);
      dots(env, sp2, sc.bg, a * 0.7);
    }
    ctx.restore();
  },
};

/* ============================================================ registration */
for (const k of Object.keys(DEF)) J.register('decor', k, DEF[k], PK);
})();
