// COLMAP facades, step 3: read the aligned COLMAP model(s), fit them onto the building walls, and project + fuse
// the photos onto the walls of the block. Output data/facades/ (same format the game loads), data/sfm-log.txt.
import fs from 'node:fs';
import zlib from 'node:zlib';
import path from 'node:path';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const jpeg = require('jpeg-js');

const LAT0 = 60.1850, LON0 = 24.9760, KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KZ = 110540;
const PJ = (lat, lon) => [(lon - LON0) * KX, -(lat - LAT0) * KZ];
const OUT = 'data/facades', PXM = 10, ATLAS = 2048;
const log = []; const L = (...a) => { const m = a.join(' '); console.log(m); log.push(m) };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const meta = JSON.parse(fs.readFileSync('work/meta.json')); const [CX, CZ] = meta.center, RAD = meta.radius;
const TB = zlib.gunzipSync(fs.readFileSync('data/terrain.bin')); const THL = TB.readUInt32LE(0), TH = JSON.parse(TB.slice(4, 4 + THL).toString());
const TA = new Int16Array(TB.buffer.slice(TB.byteOffset + 4 + THL, TB.byteOffset + TB.length));
const T = (x, z) => { const fi = (x - TH.x0) / TH.cs, fj = (z - TH.z0) / TH.cs, i = clamp(Math.floor(fi), 0, TH.nx - 2), j = clamp(Math.floor(fj), 0, TH.nz - 2), u = clamp(fi - i, 0, 1), v = clamp(fj - j, 0, 1), H = (a, b) => TA[b * TH.nx + a] * TH.unit;
  return (H(i, j) * (1 - u) + H(i + 1, j) * u) * (1 - v) + (H(i, j + 1) * (1 - u) + H(i + 1, j + 1) * u) * v };

// ---------- COLMAP text model ----------
const qrot = (w, x, y, z) => [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)], [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)], [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]];
function readModel(dir) {
  const cams = new Map(); for (const l of fs.readFileSync(dir + '/cameras.txt', 'utf8').split('\n')) { if (!l || l[0] === '#') continue; const p = l.trim().split(/\s+/); const pr = p.slice(4).map(Number);
    cams.set(p[0], {model: p[1], W: +p[2], H: +p[3], f: pr[0], cx: pr[1], cy: pr[2], k: p[1] === 'SIMPLE_RADIAL' || p[1] === 'RADIAL' ? pr[3] : 0, k2: p[1] === 'RADIAL' ? pr[4] : 0}) }
  const imgs = []; const lines = fs.readFileSync(dir + '/images.txt', 'utf8').split('\n').filter(l => l && l[0] !== '#');
  for (let i = 0; i < lines.length; i += 2) { const p = lines[i].trim().split(/\s+/); const R = qrot(+p[1], +p[2], +p[3], +p[4]), t = [+p[5], +p[6], +p[7]]; imgs.push({R, t, cam: cams.get(p[8]), name: p[9]}) }
  const pts = []; for (const l of fs.readFileSync(dir + '/points3D.txt', 'utf8').split('\n')) { if (!l || l[0] === '#') continue; const p = l.trim().split(/\s+/); if (+p[7] > 2.5) continue; const tl = (p.length - 8) / 2; if (tl < 3) continue; pts.push([+p[1], +p[2], +p[3]]) }
  return {imgs, pts} }

// ---------- buildings ----------
const d = JSON.parse(zlib.gunzipSync(fs.readFileSync('data/osm-buildings.json.gz'))); const rings = [];
for (const e of d.elements) { if (e.type === 'way' && e.geometry) rings.push(e.geometry.filter(Boolean).map(g => PJ(g.lat, g.lon))); else if (e.type === 'relation' && e.members) for (const m of e.members) if (m.role === 'outer' && m.geometry) rings.push(m.geometry.filter(Boolean).map(g => PJ(g.lat, g.lon))) }
const SEG = []; for (const R of rings) for (let i = 0; i < R.length - 1; i++) { const a = R[i], b = R[i + 1]; if (Math.hypot(a[0] - CX, a[1] - CZ) < RAD + 80) SEG.push([a, b]) }
function nearestSeg(x, z) { let bd = 1e9, bs = null, bt = 0; for (const s of SEG) { const [a, b] = s, vx = b[0] - a[0], vz = b[1] - a[1], l2 = vx * vx + vz * vz; if (l2 < 1e-6) continue; const t = clamp(((x - a[0]) * vx + (z - a[1]) * vz) / l2, 0, 1), dd = Math.hypot(x - a[0] - vx * t, z - a[1] - vz * t); if (dd < bd) { bd = dd; bs = s; bt = t } } return {d: bd, s: bs, t: bt} }

// ---------- fit the model onto the walls (2D rigid: shift + small rotation about the block centre), then height ----------
function fitToWalls(pts) {
  let dx = 0, dz = 0, th = 0; const P = pts.map(([X, Y, Z]) => [X, -Y, Z]);   /* aligned model frame -> game x, z, y */
  for (let it = 0; it < 12; it++) { let A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0], n = 0, res = [];
    const c = Math.cos(th), s = Math.sin(th);
    for (const [x0, z0, y] of P) { const x = CX + c * (x0 - CX) - s * (z0 - CZ) + dx, z = CZ + s * (x0 - CX) + c * (z0 - CZ) + dz; const g = T(x, z); if (y < g + 1.5) continue;
      const r = nearestSeg(x, z); if (r.d > (it < 4 ? 4 : 1.5)) continue; const [a, bb] = r.s, vx = bb[0] - a[0], vz = bb[1] - a[1], l = Math.hypot(vx, vz), nx = -vz / l, nz = vx / l;
      const e = (x - a[0]) * nx + (z - a[1]) * nz, J = [nx, nz, nx * (-(z - CZ)) + nz * (x - CX)], w = 1 / Math.max(.3, Math.abs(e));
      for (let i = 0; i < 3; i++) { b[i] -= w * J[i] * e; for (let j = 0; j < 3; j++) A[i][j] += w * J[i] * J[j] } n++; res.push(Math.abs(e)) }
    if (n < 30) return null; for (let i = 0; i < 3; i++) A[i][i] += 1e-3;
    const det = M3 => M3[0][0] * (M3[1][1] * M3[2][2] - M3[1][2] * M3[2][1]) - M3[0][1] * (M3[1][0] * M3[2][2] - M3[1][2] * M3[2][0]) + M3[0][2] * (M3[1][0] * M3[2][1] - M3[1][1] * M3[2][0]);
    const D = det(A), sol = [0, 1, 2].map(k => det(A.map((row, i) => row.map((v, j) => j === k ? b[i] : v))) / D);
    dx += sol[0]; dz += sol[1]; th += clamp(sol[2], -.05, .05); res.sort((p, q) => p - q); if (it === 11) L('wall fit: points', n, 'median residual', res[res.length >> 1].toFixed(2), 'm; shift', dx.toFixed(2), dz.toFixed(2), 'rotation', (th * 57.3).toFixed(2), 'deg') }
  /* height: low points that are not on walls are ground */
  const c = Math.cos(th), s = Math.sin(th), dy = []; for (const [x0, z0, y] of P) { const x = CX + c * (x0 - CX) - s * (z0 - CZ) + dx, z = CZ + s * (x0 - CX) + c * (z0 - CZ) + dz; if (nearestSeg(x, z).d < 2) continue; const e = y - T(x, z); if (Math.abs(e) < 4) dy.push(e) }
  dy.sort((p, q) => p - q); const off = dy.length > 20 ? dy[Math.floor(dy.length * .2)] : 0; L('height: ground points', dy.length, 'offset', off.toFixed(2));
  return {dx, dz, th, dy: -off} }

// ---------- cameras in game space ----------
function gameCams(model, fit) {
  const c = Math.cos(fit.th), s = Math.sin(fit.th), out = [];
  for (const im of model.imgs) { const R = im.R, t = im.t; /* model: Xc = R Xm + t;  game: xm = rot^-1 (xg - shift) */
    out.push({id: path.basename(im.name, '.jpg'), cam: im.cam, toCam: (gx, gy, gz) => { const x1 = gx - fit.dx - CX, z1 = gz - fit.dz - CZ, xm = c * x1 + s * z1 + CX, zm = -s * x1 + c * z1 + CZ, Xm = [xm, -zm, gy - fit.dy];
      return [R[0][0] * Xm[0] + R[0][1] * Xm[1] + R[0][2] * Xm[2] + t[0], R[1][0] * Xm[0] + R[1][1] * Xm[1] + R[1][2] * Xm[2] + t[1], R[2][0] * Xm[0] + R[2][1] * Xm[1] + R[2][2] * Xm[2] + t[2]] },
      centre: (() => { const C = [0, 1, 2].map(i => -(R[0][i] * t[0] + R[1][i] * t[1] + R[2][i] * t[2])); const xm = C[0], zm = -C[1], x1 = xm - CX, z1 = zm - CZ; return [c * x1 - s * z1 + CX + fit.dx, C[2] + fit.dy, s * x1 + c * z1 + CZ + fit.dz] })()}) }
  return out }
function proj(g, X, Y, Z) { const [x, y, z] = g.toCam(X, Y, Z); if (z < .8) return null; const k = g.cam; let u = x / z, v = y / z; const r2 = u * u + v * v, dd = 1 + k.k * r2 + k.k2 * r2 * r2; u *= dd; v *= dd;
  const px = k.f * u + k.cx, py = k.f * v + k.cy; return px < 0 || py < 0 || px > k.W - 1 || py > k.H - 1 ? null : [px, py] }

// ---------- walls of the block ----------
function tileTops() { const tops = new Map(), key = (i, j) => i * 100003 + j;
  for (const t of JSON.parse(fs.readFileSync('data/tiles/index.json')).tiles) { const b = fs.readFileSync('data/tiles/' + t.file), ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
    const hl = b.readUInt32LE(0), head = JSON.parse(b.slice(4, 4 + hl).toString().replace(/\0/g, '')), base = 4 + hl;
    for (const p of head.prims) { const P = new Int16Array(ab, base + p.pos, p.n * 3); for (let i = 0; i < p.n; i++) { const x = P[i * 3] / 10 + head.ox, z = P[i * 3 + 2] / 10 + head.oz; if (Math.hypot(x - CX, z - CZ) > RAD + 60) continue; const k = key(Math.floor(x / 2), Math.floor(z / 2)); if (!tops.has(k)) tops.set(k, []); tops.get(k).push(P[i * 3 + 1] / 10) } } }
  return (x, z, r) => { const v0 = []; for (let i = Math.floor((x - r) / 2); i <= Math.floor((x + r) / 2); i++) for (let j = Math.floor((z - r) / 2); j <= Math.floor((z + r) / 2); j++) { const v = tops.get(key(i, j)); if (v) v0.push(...v) } if (!v0.length) return null; v0.sort((a, b) => a - b); return v0[Math.floor(v0.length * .7)] } }
function walls() { const top = tileTops(), W = [];
  for (const R of rings) { if (R.length < 4) continue; const cx = R.reduce((s, p) => s + p[0], 0) / R.length, cz = R.reduce((s, p) => s + p[1], 0) / R.length; if (Math.hypot(cx - CX, cz - CZ) > RAD - 20) continue;
    let A = 0; for (let i = 0; i < R.length - 1; i++) A += R[i][0] * R[i + 1][1] - R[i + 1][0] * R[i][1]; const sg = A > 0 ? 1 : -1;
    for (let i = 0; i < R.length - 1; i++) { const a = R[i], b = R[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); if (l < 3) continue; const nx = -dz / l * sg, nz = dx / l * sg;
      const y0 = Math.min(T(a[0] + nx, a[1] + nz), T(b[0] + nx, b[1] + nz)); let y1 = 0, c = 0; for (const s of [.2, .5, .8]) { const t = top(a[0] + dx * s - nx * .8, a[1] + dz * s - nz * .8, 1); if (t !== null) { y1 += t; c++ } } if (!c) continue; y1 /= c; if (y1 - y0 < 3 || y1 - y0 > 90) continue;
      const k = Math.ceil(l / 30); for (let q = 0; q < k; q++) W.push({a: [a[0] + dx * q / k, a[1] + dz * q / k], b: [a[0] + dx * (q + 1) / k, a[1] + dz * (q + 1) / k], n: [nx, nz], l: l / k, y0, y1}) } }
  return W }
const cross = (p, q, a, b) => { const d = (q[0] - p[0]) * (b[1] - a[1]) - (q[1] - p[1]) * (b[0] - a[0]); if (Math.abs(d) < 1e-9) return false; const t = ((a[0] - p[0]) * (b[1] - a[1]) - (a[1] - p[1]) * (b[0] - a[0])) / d, u = ((a[0] - p[0]) * (q[1] - p[1]) - (a[1] - p[1]) * (q[0] - p[0])) / d; return t > .02 && t < .97 && u > 0 && u < 1 };
const blocked = (p, q) => SEG.some(s => cross(p, q, s[0], s[1]));

// ---------- main ----------
try {
  const dirs = fs.readdirSync('work/sparse').filter(n => n.endsWith('-al') && fs.existsSync(`work/sparse/${n}/images.txt`));
  if (!dirs.length) throw new Error('no aligned COLMAP model');
  let G = [];
  for (const dn of dirs) { const m = readModel('work/sparse/' + dn); L('model', dn, 'images', m.imgs.length, 'points', m.pts.length); if (m.imgs.length < 8) continue; const fit = fitToWalls(m.pts); if (!fit) { L('  could not fit onto walls'); continue } G = G.concat(gameCams(m, fit)) }
  L('registered cameras', G.length);
  const imgCache = new Map(); const img = id => { if (!imgCache.has(id)) { try { imgCache.set(id, jpeg.decode(fs.readFileSync(`work/images/${id}.jpg`), {useTArray: true})) } catch (e) { imgCache.set(id, null) } } return imgCache.get(id) };
  const W = walls(); L('walls in the block', W.length);
  fs.rmSync(OUT, {recursive: true, force: true}); fs.mkdirSync(OUT, {recursive: true});
  let atlas = null, ax = 0, ay = 0, rowH = 0, ai = -1; const FAC = []; const stat = {few: 0, disagree: 0, ok: 0};
  const newAtlas = () => { ai++; atlas = {i: ai, d: new Uint8Array(ATLAS * ATLAS * 4).fill(128)}; ax = ay = rowH = 0 };
  const flush = () => { if (!atlas) return; fs.writeFileSync(`${OUT}/a${atlas.i}.jpg`, jpeg.encode({data: atlas.d, width: ATLAS, height: ATLAS}, 82).data); atlas = null };
  newAtlas();
  for (const w of W) { const mx = (w.a[0] + w.b[0]) / 2, mz = (w.a[1] + w.b[1]) / 2;
    const tw = clamp(Math.round(w.l * PXM), 8, 400), th = clamp(Math.round((w.y1 - w.y0) * PXM), 8, 600);
    const views = [];
    for (const g of G) { const [cx, , cz] = g.centre, vx = cx - mx, vz = cz - mz, dist = Math.hypot(vx, vz); if (dist > 70 || dist < 3) continue; if ((vx * w.n[0] + vz * w.n[1]) / dist < .25) continue;
      if (blocked([cx, cz], [mx + w.n[0] * .3, mz + w.n[1] * .3])) continue; const im = img(g.id); if (!im) continue;
      const S = new Uint8Array(tw * th * 3), M = new Uint8Array(tw * th); let n = 0;
      for (let v = 0; v < th; v++) for (let u = 0; u < tw; u++) { const s = (u + .5) / tw, Y = w.y1 - (v + .5) / PXM * (w.y1 - w.y0) / ((th) / PXM), X = w.a[0] + (w.b[0] - w.a[0]) * s, Z = w.a[1] + (w.b[1] - w.a[1]) * s;
        const q = proj(g, X, Y, Z); if (!q) continue; const o = v * tw + u, x0 = q[0] | 0, y0 = q[1] | 0, x1 = Math.min(im.width - 1, x0 + 1), y1 = Math.min(im.height - 1, y0 + 1), du = q[0] - x0, dv = q[1] - y0;
        for (let k = 0; k < 3; k++) { const P = (xx, yy) => im.data[(yy * im.width + xx) * 4 + k]; S[o * 3 + k] = (P(x0, y0) * (1 - du) + P(x1, y0) * du) * (1 - dv) + (P(x0, y1) * (1 - du) + P(x1, y1) * du) * dv } M[o] = 1; n++ }
      if (n > tw * th * .2) views.push({S, M, n, dist}) }
    if (views.length < 2) { stat.few++; continue }
    /* per-pixel median, then drop views that disagree with it and redo */
    const med = (V) => { const O = new Uint8Array(tw * th * 3), H = new Uint8Array(tw * th); for (let o = 0; o < tw * th; o++) { const vs = V.filter(v => v.M[o]); if (!vs.length) continue; H[o] = vs.length; for (let k = 0; k < 3; k++) { const a = vs.map(v => v.S[o * 3 + k]).sort((p, q) => p - q); O[o * 3 + k] = a[a.length >> 1] } } return {O, H} };
    let {O, H} = med(views);
    const agreeing = views.filter(v => { let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0; for (let o = 0; o < tw * th; o++) if (v.M[o] && H[o] > 1) { const a = v.S[o * 3 + 1], b = O[o * 3 + 1]; n++; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b }
      if (n < 100) return false; const va = saa - sa * sa / n, vb = sbb - sb * sb / n; return va > 0 && vb > 0 && (sab - sa * sb / n) / Math.sqrt(va * vb) > .45 });
    if (agreeing.length < 2) { stat.disagree++; continue }
    ({O, H} = med(agreeing));
    let topRow = -1; for (let v = 0; v < th; v++) { let n = 0; for (let u = 0; u < tw; u++) n += H[v * tw + u] ? 1 : 0; if (n > tw * .8) { topRow = v; break } }
    if (topRow < 0 || th - topRow < Math.min(th, 30)) { stat.few++; continue }
    const band = Math.min(th - topRow, 32); for (let v = topRow - 1; v >= 0; v--) { const src = topRow + ((topRow - 1 - v) % band); for (let u = 0; u < tw; u++) { const o = v * tw + u, s = src * tw + u; for (let k = 0; k < 3; k++) O[o * 3 + k] = O[s * 3 + k]; H[o] = H[s] } }
    let mr = 0, mg = 0, mb = 0, mn = 0; for (let o = 0; o < tw * th; o++) if (H[o]) { mr += O[o * 3]; mg += O[o * 3 + 1]; mb += O[o * 3 + 2]; mn++ } mr /= mn; mg /= mn; mb /= mn;
    if (ax + tw > ATLAS) { ax = 0; ay += rowH; rowH = 0 } if (ay + th > ATLAS) { flush(); newAtlas() }
    for (let v = 0; v < th; v++) for (let u = 0; u < tw; u++) { const o = v * tw + u, A = ((ay + v) * ATLAS + ax + u) * 4; if (H[o]) { atlas.d[A] = O[o * 3]; atlas.d[A + 1] = O[o * 3 + 1]; atlas.d[A + 2] = O[o * 3 + 2] } else { atlas.d[A] = mr; atlas.d[A + 1] = mg; atlas.d[A + 2] = mb } }
    FAC.push({a: w.a.map(v => +v.toFixed(2)), b: w.b.map(v => +v.toFixed(2)), n: w.n.map(v => +v.toFixed(3)), y0: +w.y0.toFixed(2), y1: +w.y1.toFixed(2), t: atlas.i, uv: [ax / ATLAS, ay / ATLAS, (ax + tw) / ATLAS, (ay + th) / ATLAS], photos: agreeing.length});
    ax += tw + 2; rowH = Math.max(rowH, th + 2); stat.ok++ }
  flush();
  fs.writeFileSync(`${OUT}/facades.json`, JSON.stringify({generated: new Date().toISOString(), source: 'Mapillary contributors, CC BY-SA 4.0; COLMAP reconstruction', center: [CX, CZ], radius: RAD, atlases: ai + 1, size: ATLAS, facades: FAC}));
  L('facades', JSON.stringify(stat));
} catch (e) { L('fatal', e.stack || e.message) }
fs.writeFileSync('data/sfm-log.txt', log.join('\n') + '\n');
