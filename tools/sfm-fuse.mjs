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
const OUT = 'data/facades', PXM = 20, ATLAS = 4096;
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

// ---------- GPS alignment: similarity (scale, rotation, shift) from camera centres to their GPS positions, RANSAC ----------
function horn(A, B) {   /* best rotation + scale + translation taking points A onto B (Horn's quaternion method) */
  const n = A.length, ca = [0, 0, 0], cb = [0, 0, 0]; for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { ca[k] += A[i][k] / n; cb[k] += B[i][k] / n }
  const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]]; let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { const a = A[i].map((v, k) => v - ca[k]), b = B[i].map((v, k) => v - cb[k]); sa += a[0] ** 2 + a[1] ** 2 + a[2] ** 2; sb += b[0] ** 2 + b[1] ** 2 + b[2] ** 2; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) S[r][c] += a[r] * b[c] }
  const [[xx, xy, xz], [yx, yy, yz], [zx, zy, zz]] = S;
  const N = [[xx + yy + zz, yz - zy, zx - xz, xy - yx], [yz - zy, xx - yy - zz, xy + yx, zx + xz], [zx - xz, xy + yx, -xx + yy - zz, yz + zy], [xy - yx, zx + xz, yz + zy, -xx - yy + zz]];
  /* largest eigenvector by power iteration on a shifted matrix */
  let q = [1, .01, .01, .01]; const sh = Math.abs(xx) + Math.abs(yy) + Math.abs(zz) + 1e-9 + sb + sa;
  for (let it = 0; it < 200; it++) { const r = [0, 1, 2, 3].map(i => N[i].reduce((s2, v, j) => s2 + v * q[j], 0) + sh * q[i]); const l = Math.hypot(...r); q = r.map(v => v / l) }
  const [w, x, y, z] = q, R = qrot(w, x, y, z), sc = Math.sqrt(sb / Math.max(1e-9, sa));
  const t = [0, 1, 2].map(k => cb[k] - sc * (R[k][0] * ca[0] + R[k][1] * ca[1] + R[k][2] * ca[2])); return {R, s: sc, t} }
const apply = (T3, p) => [0, 1, 2].map(k => T3.s * (T3.R[k][0] * p[0] + T3.R[k][1] * p[1] + T3.R[k][2] * p[2]) + T3.t[k]);
function alignGPS(model, ref) {
  /* 1. level the model: in street photos the image's 'down' axis points at the ground; average it over all cameras */
  let d = [0, 0, 0]; for (const im of model.imgs) for (let k = 0; k < 3; k++) d[k] += im.R[1][k];
  const dl = Math.hypot(...d); if (dl < 1e-9) return null; const up = d.map(v => -v / dl);
  const ax = [up[1], -up[0], 0], sn = Math.hypot(ax[0], ax[1]), cs = up[2];   /* rotation taking 'up' to +Z */
  let Q = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]; if (sn > 1e-9) { const [x, y] = [ax[0] / sn, ax[1] / sn], th = Math.atan2(sn, cs), c = Math.cos(th), s2 = Math.sin(th), C = 1 - c;
    Q = [[c + x * x * C, x * y * C, y * s2], [x * y * C, c + y * y * C, -x * s2], [-y * s2, x * s2, c]] }
  const mul = (A, v) => [0, 1, 2].map(r => A[r][0] * v[0] + A[r][1] * v[1] + A[r][2] * v[2]);
  const centre = im => [0, 1, 2].map(i => -(im.R[0][i] * im.t[0] + im.R[1][i] * im.t[1] + im.R[2][i] * im.t[2]));
  /* 2. heading + scale + shift (4 degrees of freedom) from levelled camera centres to GPS, RANSAC on pairs */
  const A = [], B = []; for (const im of model.imgs) { const g = ref.get(path.basename(im.name)); if (!g) continue; A.push(mul(Q, centre(im))); B.push(g) }
  if (A.length < 6) return null;
  const fit = I => { let ax0 = 0, az0 = 0, bx0 = 0, bz0 = 0; for (const i of I) { ax0 += A[i][0]; az0 += A[i][1]; bx0 += B[i][0]; bz0 += B[i][1] } const n = I.length; ax0 /= n; az0 /= n; bx0 /= n; bz0 /= n;
    let re = 0, im2 = 0, nn = 0; for (const i of I) { const p = [A[i][0] - ax0, A[i][1] - az0], q = [B[i][0] - bx0, B[i][1] - bz0]; re += p[0] * q[0] + p[1] * q[1]; im2 += p[0] * q[1] - p[1] * q[0]; nn += p[0] * p[0] + p[1] * p[1] }
    if (nn < 1e-9) return null; const sc = Math.hypot(re, im2) / nn, th = Math.atan2(im2, re); let tz = 0; for (const i of I) tz += B[i][2] - sc * A[i][2]; tz /= n;
    const c = Math.cos(th), s2 = Math.sin(th); return {sc, c, s2, tx: bx0 - sc * (c * ax0 - s2 * az0), ty: bz0 - sc * (s2 * ax0 + c * az0), tz} };
  const ap = (F, p) => [F.sc * (F.c * p[0] - F.s2 * p[1]) + F.tx, F.sc * (F.s2 * p[0] + F.c * p[1]) + F.ty, F.sc * p[2] + F.tz];
  let best = null, bi = 0; for (let it = 0; it < 500; it++) { const i = Math.floor(Math.random() * A.length), j = Math.floor(Math.random() * A.length); if (i === j || Math.hypot(A[i][0] - A[j][0], A[i][1] - A[j][1]) < 1e-6) continue;
    const F = fit([i, j]); if (!F || !(F.sc > 0)) continue; let n = 0; for (let k = 0; k < A.length; k++) { const p = ap(F, A[k]); if (Math.hypot(p[0] - B[k][0], p[1] - B[k][1]) < 6) n++ } if (n > bi) { bi = n; best = F } }
  if (!best || bi < 5) return null; const I = []; for (let k = 0; k < A.length; k++) { const p = ap(best, A[k]); if (Math.hypot(p[0] - B[k][0], p[1] - B[k][1]) < 6) I.push(k) }
  const F = fit(I); let e = 0; for (const k of I) { const p = ap(F, A[k]); e += Math.hypot(p[0] - B[k][0], p[1] - B[k][1]) }
  const tilt = Math.acos(clamp(cs, -1, 1)) * 57.3; L('  levelled by', tilt.toFixed(1), 'deg; GPS fit: inliers', I.length, '/', A.length, 'mean error', (e / I.length).toFixed(2), 'm, scale', F.sc.toFixed(3));
  /* 3. move the model into the GPS frame: X' = S Q X + t with S = scale*yaw */
  const Ry = [[F.c, -F.s2, 0], [F.s2, F.c, 0], [0, 0, 1]], M = [0, 1, 2].map(r => [0, 1, 2].map(c => Ry[r][0] * Q[0][c] + Ry[r][1] * Q[1][c] + Ry[r][2] * Q[2][c])), T0 = [F.tx, F.ty, F.tz];
  const fwd = p => { const v = mul(M, p); return [F.sc * v[0] + T0[0], F.sc * v[1] + T0[1], F.sc * v[2] + T0[2]] };
  model.pts = model.pts.map(fwd); model.fwd = fwd;
  model.imgs = model.imgs.map(im => { const MT = [[M[0][0], M[1][0], M[2][0]], [M[0][1], M[1][1], M[2][1]], [M[0][2], M[1][2], M[2][2]]];
    const R2 = [0, 1, 2].map(r => [0, 1, 2].map(c => im.R[r][0] * MT[0][c] + im.R[r][1] * MT[1][c] + im.R[r][2] * MT[2][c])), t2 = [0, 1, 2].map(k => F.sc * im.t[k] - (R2[k][0] * T0[0] + R2[k][1] * T0[1] + R2[k][2] * T0[2]));
    return {...im, R: R2, t: t2} });
  return model }

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
function proj(g, X, Y, Z) { const [x, y, z] = g.toCam(X, Y, Z); if (z < .8) return null; const k = g.cam; let u = x / z, v = y / z; if (Math.abs(u * k.f) > k.W * .55 || Math.abs(v * k.f) > k.H * .55) return null; const r2 = u * u + v * v, dd = 1 + k.k * r2 + k.k2 * r2 * r2; u *= dd; v *= dd;
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
    const inR = (x, z) => { let c = false; for (let i = 0, j = R.length - 1; i < R.length; j = i++) if ((R[i][1] > z) !== (R[j][1] > z) && x < (R[j][0] - R[i][0]) * (z - R[i][1]) / (R[j][1] - R[i][1]) + R[i][0]) c = !c; return c };
    for (let i = 0; i < R.length - 1; i++) { const a = R[i], b = R[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); if (l < 3) continue; let nx = -dz / l, nz = dx / l;
      if (inR((a[0] + b[0]) / 2 + nx * .5, (a[1] + b[1]) / 2 + nz * .5)) { nx = -nx; nz = -nz }   /* outward: the side that is outside the footprint */
      const y0 = Math.min(T(a[0] + nx, a[1] + nz), T(b[0] + nx, b[1] + nz)); let y1 = 0, c = 0; for (const s of [.2, .5, .8]) { const t = top(a[0] + dx * s - nx * .8, a[1] + dz * s - nz * .8, 1); if (t !== null) { y1 += t; c++ } } if (!c) continue; y1 /= c; if (y1 - y0 < 3 || y1 - y0 > 90) continue;
      const k = Math.ceil(l / 30); for (let q = 0; q < k; q++) W.push({a: [a[0] + dx * q / k, a[1] + dz * q / k], b: [a[0] + dx * (q + 1) / k, a[1] + dz * (q + 1) / k], n: [nx, nz], l: l / k, y0, y1}) } }
  return W }
const cross = (p, q, a, b) => { const d = (q[0] - p[0]) * (b[1] - a[1]) - (q[1] - p[1]) * (b[0] - a[0]); if (Math.abs(d) < 1e-9) return false; const t = ((a[0] - p[0]) * (b[1] - a[1]) - (a[1] - p[1]) * (b[0] - a[0])) / d, u = ((a[0] - p[0]) * (q[1] - p[1]) - (a[1] - p[1]) * (q[0] - p[0])) / d; return t > .02 && t < .97 && u > 0 && u < 1 };
const blocked = (p, q) => SEG.some(s => cross(p, q, s[0], s[1]));

// ---------- ground: street photos projected straight down onto the streets and paths ----------
function png(w, h, rgba) { const crcT = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crcT[n] = c >>> 0 }
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 };
  const chunk = (t, d) => { const L4 = Buffer.alloc(4); L4.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const C = Buffer.alloc(4); C.writeUInt32BE(crc(td)); return Buffer.concat([L4, td, C]) };
  const raw = Buffer.alloc((w * 4 + 1) * h); for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1) }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, {level: 9})), chunk('IEND', Buffer.alloc(0))]) }
function groundHeight(GP) {   /* street surface height from the reconstructed points: low quantile per 2 m cell, gaps filled from the terrain plus the local offset */
  const C = 2, M = new Map(), k = (i, j) => i * 100003 + j; for (const [x, y, z] of GP) { const kk = k(Math.floor(x / C), Math.floor(z / C)); if (!M.has(kk)) M.set(kk, []); M.get(kk).push(y) }
  const H = new Map(); for (const [kk, a] of M) { if (a.length < 3) continue; a.sort((p, q) => p - q); H.set(kk, a[Math.floor(a.length * .25)]) }
  L('ground height cells', H.size);
  return (x, z) => { const i = Math.floor(x / C), j = Math.floor(z / C); let sw = 0, so = 0; for (let a = -3; a <= 3; a++) for (let b = -3; b <= 3; b++) { const h = H.get(k(i + a, j + b)); if (h === undefined) continue; const cx = (i + a + .5) * C, cz = (j + b + .5) * C, w = 1 / (1 + (cx - x) ** 2 + (cz - z) ** 2); sw += w; so += w * (h - T(cx, cz)) }
    return T(x, z) + (sw > 0 ? so / sw : 0) } }
function ground(G, img, GH) {
  const GPX = 20, TS = 512, TM = TS / GPX, GO = 'data/ground';   /* 5 cm pixels, 25.6 m tiles */
  fs.rmSync(GO, {recursive: true, force: true}); fs.mkdirSync(GO, {recursive: true});
  /* paved mask from OSM streets and paths */
  const wd = JSON.parse(zlib.gunzipSync(fs.readFileSync('data/osm-ways.json.gz'))); const HW = {motorway: 5, trunk: 5, primary: 4.5, secondary: 4, tertiary: 3.8, unclassified: 3, residential: 3, service: 2.5, living_street: 3, pedestrian: 3, cycleway: 1.6, footway: 1.5, path: 1.3, track: 1.5, steps: 0};
  const PS = []; for (const e of wd.elements) { const t = e.tags || {}; if (e.type !== 'way' || !e.geometry || !HW[t.highway] || t.tunnel || (t.bridge && t.bridge !== 'no')) continue; const hw = t.width && parseFloat(t.width) > 0 && !/footway|cycleway|path/.test(t.highway) ? parseFloat(t.width) / 2 : HW[t.highway];
    const P = e.geometry.filter(Boolean).map(g => PJ(g.lat, g.lon)); for (let i = 0; i < P.length - 1; i++) { const a = P[i], b = P[i + 1]; if (Math.hypot(a[0] - CX, a[1] - CZ) < RAD + 40) PS.push([a, b, hw + .3]) } }
  const inSegs = (segs, x, z) => { for (const [a, b, r] of segs) { const vx = b[0] - a[0], vz = b[1] - a[1], l2 = vx * vx + vz * vz; if (l2 < 1e-6) continue; const t = clamp(((x - a[0]) * vx + (z - a[1]) * vz) / l2, 0, 1); if (Math.hypot(x - a[0] - vx * t, z - a[1] - vz * t) < r) return true } return false };
  /* every photo's view of one ground point: colour, weight, which photo */
  const looks = (cams, x, z) => { const y = GH(x, z), S = [];
    for (const g of cams) { const hd = Math.hypot(g.centre[0] - x, g.centre[2] - z); if (hd > 20 || hd < 2.6) continue; const el = (g.centre[1] - y) / hd; if (el < .1) continue;
      const q = proj(g, x, y, z); if (!q || q[1] > g.cam.H * .92) continue; const im = img(g.id); if (!im) continue; const x0i = q[0] | 0, y0i = q[1] | 0, x1i = Math.min(im.width - 1, x0i + 1), y1i = Math.min(im.height - 1, y0i + 1), du = q[0] - x0i, dv = q[1] - y0i;
      const c = [0, 1, 2].map(k => { const P2 = (xx, yy) => im.data[(yy * im.width + xx) * 4 + k]; return (P2(x0i, y0i) * (1 - du) + P2(x1i, y0i) * du) * (1 - dv) + (P2(x0i, y1i) * (1 - du) + P2(x1i, y1i) * du) * dv });
      S.push({c, w: el * el / (1 + hd * .08), id: g.id}) } return S };
  const med = (S, k) => { const a = S.map(s2 => s2.c[k]).sort((p, q) => p - q); return a[a.length >> 1] };
  const lum = c => .3 * c[0] + .59 * c[1] + .11 * c[2];
  /* tiles worth making */
  const TL = [];
  for (let tz = Math.floor((CZ - RAD) / TM); tz <= Math.floor((CZ + RAD) / TM); tz++) for (let tx = Math.floor((CX - RAD) / TM); tx <= Math.floor((CX + RAD) / TM); tx++) {
    const x0 = tx * TM, z0 = tz * TM, mx = x0 + TM / 2, mz = z0 + TM / 2; if (Math.hypot(mx - CX, mz - CZ) > RAD) continue; if (process.env.ONLY && !process.env.ONLY.split(',').includes(tx + '_' + tz)) continue;
    const segs = PS.filter(([a, b, r]) => { const vx = b[0] - a[0], vz = b[1] - a[1], l2 = vx * vx + vz * vz || 1, t = clamp(((mx - a[0]) * vx + (mz - a[1]) * vz) / l2, 0, 1); return Math.hypot(mx - a[0] - vx * t, mz - a[1] - vz * t) < TM * .75 + r });
    if (!segs.length) continue; const cams = G.filter(g => Math.hypot(g.centre[0] - mx, g.centre[2] - mz) < TM * .75 + 26); if (cams.length < 2) continue; TL.push({tx, tz, x0, z0, segs, cams}) }
  /* 1. exposure: each photo gets an RGB gain that makes it agree with the others where they overlap (two rounds) */
  const gain = new Map(); const gn = id => gain.get(id) || [1, 1, 1];
  for (let round = 0; round < 3; round++) { const acc = new Map();
    for (const t of TL) for (let v = 4; v < TS; v += 24) for (let u = 4; u < TS; u += 24) { const x = t.x0 + u / GPX, z = t.z0 + v / GPX; if (!inSegs(t.segs, x, z) || blockedPt(x, z)) continue;
      const S = looks(t.cams, x, z); if (S.length < 3) continue; for (const s2 of S) { const g2 = gn(s2.id); s2.c = s2.c.map((c, k) => c * g2[k]) } const m = [0, 1, 2].map(k => med(S, k)), ml = lum(m);
      for (const s2 of S) { const l = lum(s2.c); if (l < 8 || Math.abs(l - ml) > ml * .35) continue; const a = acc.get(s2.id) || [0, 0, 0, 0]; for (let k = 0; k < 3; k++) a[k] += Math.log((m[k] + 4) / (s2.c[k] + 4)); a[3]++; acc.set(s2.id, a) } }
    for (const [id, a] of acc) if (a[3] >= 6) { const g2 = gn(id); gain.set(id, g2.map((g3, k) => clamp(g3 * Math.exp(a[k] / a[3] * .8), .5, 2))) } }
  L('ground exposure gains', gain.size);
  /* 2. the tiles: gained colours, shadows and odd ones out dropped, weighted mean of the rest, small holes filled */
  const tiles = []; let px = 0;
  for (const t of TL) { const rgba = new Uint8Array(TS * TS * 4), M = new Uint8Array(TS * TS); let n = 0;
    for (let v = 0; v < TS; v++) for (let u = 0; u < TS; u++) { const x = t.x0 + (u + .5) / GPX, z = t.z0 + (v + .5) / GPX; if (!inSegs(t.segs, x, z)) continue; M[v * TS + u] = 1; if (blockedPt(x, z)) continue;
      const S = looks(t.cams, x, z); if (S.length < 2) continue; for (const s2 of S) { const g2 = gn(s2.id); s2.c = s2.c.map((c, k) => Math.min(255, c * g2[k])) }
      const m = [0, 1, 2].map(k => med(S, k)), ml = lum(m); let keep = S.filter(s2 => { const l = lum(s2.c); return l > ml * .78 && l < ml * 1.3 && Math.abs(s2.c[0] - m[0]) + Math.abs(s2.c[1] - m[1]) + Math.abs(s2.c[2] - m[2]) < 50 });   /* shadows (the photographer's own) are darker, cars and glare odd */
      if (S.length === 2 && keep.length < 2) continue; if (!keep.length) continue; let sw = 0; const acc = [0, 0, 0]; for (const s2 of keep) { sw += s2.w; for (let k = 0; k < 3; k++) acc[k] += s2.w * s2.c[k] }
      const o = (v * TS + u) * 4; for (let k = 0; k < 3; k++) rgba[o + k] = acc[k] / sw; rgba[o + 3] = 255; n++ }
    if (n < TS * TS * .03) continue;
    for (let it = 0; it < 8; it++) { let f = 0; const nxt = []; for (let v = 1; v < TS - 1; v++) for (let u = 1; u < TS - 1; u++) { const i = v * TS + u; if (rgba[i * 4 + 3] || !M[i]) continue; let c = [0, 0, 0], k2 = 0;
        for (const d of [-1, 1, -TS, TS, -TS - 1, -TS + 1, TS - 1, TS + 1]) if (rgba[(i + d) * 4 + 3] === 255) { for (let k = 0; k < 3; k++) c[k] += rgba[(i + d) * 4 + k]; k2++ } if (k2 >= 3) nxt.push([i, c.map(x => x / k2)]) }
      for (const [i, c] of nxt) { for (let k = 0; k < 3; k++) rgba[i * 4 + k] = c[k]; rgba[i * 4 + 3] = 255; f++ } if (!f) break }   /* fill pinholes from their neighbours */
    const A = new Uint8Array(TS * TS); for (let i = 0; i < TS * TS; i++) A[i] = rgba[i * 4 + 3]; for (let v = 1; v < TS - 1; v++) for (let u = 1; u < TS - 1; u++) { const i = v * TS + u; if (A[i] && (!A[i - 1] || !A[i + 1] || !A[i - TS] || !A[i + TS])) rgba[i * 4 + 3] = 140 }
    const f = `g${t.tx}_${t.tz}.png`; fs.writeFileSync(`${GO}/${f}`, png(TS, TS, rgba)); tiles.push({f, x0: t.x0, z0: t.z0, size: TM}); px += n }
  fs.writeFileSync(`${GO}/index.json`, JSON.stringify({generated: new Date().toISOString(), source: 'Mapillary contributors, CC BY-SA 4.0; COLMAP reconstruction', tiles}));
  L('ground tiles', tiles.length, 'pixels', px, 'area m2', (px / GPX / GPX).toFixed(0)) }
/* a camera rolled by a degree or two makes window rows lean: find the dominant tilt of the near-horizontal and near-vertical
   edges in one view's projection (they lean by the same angle under a roll) and rotate the view back */
function tiltOf(S, M, tw, th, u0 = 1, u1 = tw - 1, hOnly = false) {
  const NB = 201, H = new Float64Array(NB), lim = 25 / 57.3; const g = (u, v) => S[(v * tw + u) * 3 + 1];
  for (let v = 1; v < th - 1; v++) for (let u = Math.max(1, u0); u < Math.min(tw - 1, u1); u++) { const o = v * tw + u; if (!M[o] || !M[o - 1] || !M[o + 1] || !M[o - tw] || !M[o + tw]) continue;
    const gx = (g(u + 1, v) - g(u - 1, v)) / 2, gy = (g(u, v + 1) - g(u, v - 1)) / 2, m2 = gx * gx + gy * gy; if (m2 < 100) continue; let a;
    if (Math.abs(gy) > 1.8 * Math.abs(gx)) a = Math.atan(-gx / gy); else if (!hOnly && Math.abs(gx) > 1.8 * Math.abs(gy)) a = Math.atan(gy / gx); else continue;
    if (Math.abs(a) >= lim) continue; const b = (a + lim) / (2 * lim) * (NB - 1); const i = Math.floor(b), f = b - i; H[i] += m2 * (1 - f); if (i + 1 < NB) H[i + 1] += m2 * f }
  const Hs = H.map((_, i) => { let t = 0; for (let k = -2; k <= 2; k++) t += (H[i + k] || 0) * (3 - Math.abs(k)); return t }); let bi = 100; for (let i = 0; i < NB; i++) if (Hs[i] > Hs[bi]) bi = i;
  let tot = 0; for (const x of H) tot += x; if (tot <= 0) return null; if (Hs[bi] < 1.3 * Hs[100]) return 0;   /* no clear tilt */
  return (bi / (NB - 1) * 2 - 1) * lim }
function deskew(S, M, Wt, tw, th) {
  const r = tiltOf(S, M, tw, th); if (!r || Math.abs(r) < .4 / 57.3 || Math.abs(r) > 8 / 57.3) return 0;
  const S2 = new Uint8Array(S), M2 = new Uint8Array(M.length), W2 = new Float32Array(Wt.length), c = Math.cos(r), sn = Math.sin(r), cu = tw / 2, cv = th / 2;
  for (let v = 0; v < th; v++) for (let u = 0; u < tw; u++) { const du = u - cu, dv = v - cv, su = Math.round(cu + c * du - sn * dv), sv = Math.round(cv + sn * du + c * dv), o = v * tw + u;
    if (su < 0 || sv < 0 || su >= tw || sv >= th) continue; const q = sv * tw + su; if (!M[q]) continue; M2[o] = 1; W2[o] = Wt[q]; for (let k = 0; k < 3; k++) S2[o * 3 + k] = S[q * 3 + k] }
  S.set(S2); M.set(M2); Wt.set(W2); return r }
/* all fitted COLMAP models in one frame (game x, -z, y up), as a COLMAP text model, for dense reconstruction of the whole block at once */
function exportMerged(ACC) {
  const OD = 'work/merged'; fs.mkdirSync(OD, {recursive: true}); const C = [], I = [], P = []; let oc = 0, oi = 0, op = 0;
  const quat = R => { const t = R[0][0] + R[1][1] + R[2][2]; let w, x, y, z; if (t > 0) { const S = Math.sqrt(t + 1) * 2; w = S / 4; x = (R[2][1] - R[1][2]) / S; y = (R[0][2] - R[2][0]) / S; z = (R[1][0] - R[0][1]) / S }
    else if (R[0][0] > R[1][1] && R[0][0] > R[2][2]) { const S = Math.sqrt(1 + R[0][0] - R[1][1] - R[2][2]) * 2; w = (R[2][1] - R[1][2]) / S; x = S / 4; y = (R[0][1] + R[1][0]) / S; z = (R[0][2] + R[2][0]) / S }
    else if (R[1][1] > R[2][2]) { const S = Math.sqrt(1 + R[1][1] - R[0][0] - R[2][2]) * 2; w = (R[0][2] - R[2][0]) / S; x = (R[0][1] + R[1][0]) / S; y = S / 4; z = (R[1][2] + R[2][1]) / S }
    else { const S = Math.sqrt(1 + R[2][2] - R[0][0] - R[1][1]) * 2; w = (R[1][0] - R[0][1]) / S; x = (R[0][2] + R[2][0]) / S; y = (R[1][2] + R[2][1]) / S; z = S / 4 } return [w, x, y, z] };
  for (const {dn, m, fit} of ACC) { const dir = 'work/sparse/' + dn, c = Math.cos(fit.th), s = Math.sin(fit.th);
    const A = [[c, -s, 0], [s, c, 0], [0, 0, 1]], b = [c * (-fit.dx - CX) + s * (-fit.dz - CZ) + CX, s * (-fit.dx - CX) - c * (-fit.dz - CZ) - CZ, -fit.dy];
    const lines = f => fs.readFileSync(`${dir}/${f}`, 'utf8').split('\n').filter(l => l && l[0] !== '#');
    let mc = 0, mi = 0, mp = 0;
    for (const l of lines('cameras.txt')) { const p = l.split(' '); mc = Math.max(mc, +p[0]); p[0] = String(+p[0] + oc); C.push(p.join(' ')) }
    const IL = lines('images.txt').length ? fs.readFileSync(`${dir}/images.txt`, 'utf8').split('\n').filter(l => l[0] !== '#') : [];
    for (let k = 0, n = 0; k + 1 < IL.length; k += 2, n++) { const p = IL[k].trim().split(/\s+/); if (p.length < 10) { k--; continue } const im = m.imgs[n]; mi = Math.max(mi, +p[0]);
      const R2 = [0, 1, 2].map(r => [0, 1, 2].map(cc => im.R[r][0] * A[0][cc] + im.R[r][1] * A[1][cc] + im.R[r][2] * A[2][cc])), t2 = [0, 1, 2].map(r => im.R[r][0] * b[0] + im.R[r][1] * b[1] + im.R[r][2] * b[2] + im.t[r]);
      I.push([+p[0] + oi, ...quat(R2).map(v => v.toFixed(9)), ...t2.map(v => v.toFixed(6)), +p[8] + oc, p[9]].join(' '));
      I.push(IL[k + 1].trim().split(/\s+/).map((v, j) => j % 3 === 2 && v !== '-1' ? String(+v + op) : v).join(' ')) }
    for (const l of lines('points3D.txt')) { const p = l.trim().split(/\s+/); mp = Math.max(mp, +p[0]); const X = m.fwd([+p[1], +p[2], +p[3]]).map((v, k) => v - b[k]), F = [0, 1, 2].map(k => A[0][k] * X[0] + A[1][k] * X[1] + A[2][k] * X[2]);
      P.push([+p[0] + op, ...F.map(v => v.toFixed(4)), p[4], p[5], p[6], p[7], ...p.slice(8).map((v, j) => j % 2 === 0 ? String(+v + oi) : v)].join(' ')) }
    oc += mc + 1; oi += mi + 1; op += mp + 1 }
  fs.writeFileSync(`${OD}/cameras.txt`, C.join('\n') + '\n'); fs.writeFileSync(`${OD}/images.txt`, I.join('\n') + '\n'); fs.writeFileSync(`${OD}/points3D.txt`, P.join('\n') + '\n');
  L('merged model', ACC.length, 'models', I.length / 2, 'images', P.length, 'points') }
/* ground tiles from the OpenMVS textured mesh: a top-down render of its upward-facing, ground-level triangles */
function pngRead(buf) { let o = 8, w = 0, h = 0, ct = 0; const ID = [];
  while (o < buf.length) { const len = buf.readUInt32BE(o), ty = buf.toString('ascii', o + 4, o + 8), d = buf.subarray(o + 8, o + 8 + len); if (ty === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); ct = d[9]; if (d[8] !== 8 || d[12]) throw new Error('png: 8-bit non-interlaced only') } else if (ty === 'IDAT') ID.push(d); else if (ty === 'IEND') break; o += 12 + len }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : ct === 0 ? 1 : 0; if (!bpp) throw new Error('png colour type ' + ct); const raw = zlib.inflateSync(Buffer.concat(ID)), st = w * bpp, out = new Uint8Array(w * h * 4), prev = new Uint8Array(st), cur = new Uint8Array(st);
  for (let y = 0; y < h; y++) { const f = raw[y * (st + 1)], row = raw.subarray(y * (st + 1) + 1, (y + 1) * (st + 1));
    for (let i = 0; i < st; i++) { const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0; let v = row[i];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1; else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c } cur[i] = v & 255 }
    for (let x = 0; x < w; x++) { const q = (y * w + x) * 4; if (bpp === 1) out[q] = out[q + 1] = out[q + 2] = cur[x]; else for (let k = 0; k < 3; k++) out[q + k] = cur[x * bpp + k]; out[q + 3] = bpp === 4 ? cur[x * 4 + 3] : 255 } prev.set(cur) }
  return {width: w, height: h, data: out} }
function meshGround(dir) {
  const objF = fs.readdirSync(dir).find(f => f.endsWith('.obj')); if (!objF) { L('mesh ground: no obj'); return }
  const V = [], VT = [], F = [], mats = new Map(); let mat = null, mtl = null;
  for (const l of fs.readFileSync(`${dir}/${objF}`, 'utf8').split('\n')) { const p = l.trim().split(/\s+/);
    if (p[0] === 'v') V.push([+p[1], +p[2], +p[3]]); else if (p[0] === 'vt') VT.push([+p[1], +p[2]]); else if (p[0] === 'usemtl') mat = p[1]; else if (p[0] === 'mtllib') mtl = p[1];
    else if (p[0] === 'f') { const q = p.slice(1).map(t => t.split('/').map(Number)); for (let k = 1; k + 1 < q.length; k++) F.push([q[0], q[k], q[k + 1], mat]) } }
  if (mtl) { let cur = null; for (const l of fs.readFileSync(`${dir}/${mtl}`, 'utf8').split('\n')) { const p = l.trim().split(/\s+/); if (p[0] === 'newmtl') cur = p[1]; else if (p[0] === 'map_Kd' && cur) mats.set(cur, p.slice(1).join(' ')) } }
  const tex = new Map(); const getTex = m => { if (!tex.has(m)) { const f = mats.get(m); let im = null; try { const b = fs.readFileSync(`${dir}/${f}`); im = /\.png$/i.test(f) ? pngRead(b) : jpeg.decode(b, {useTArray: true}) } catch (e) { L('texture', f, e.message) } tex.set(m, im) } return tex.get(m) };
  L('mesh ground: vertices', V.length, 'faces', F.length, 'textures', mats.size);
  /* the mesh is in the merged frame: (x, -z, y up) of the game */
  const G3 = V.map(v => [v[0], v[2], -v[1]]);
  const GPX = 20, TS = 512, TM = TS / GPX, GO = 'data/ground'; fs.rmSync(GO, {recursive: true, force: true}); fs.mkdirSync(GO, {recursive: true});
  const tiles = new Map(); const tileOf = (tx, tz) => { const k = tx + '_' + tz; if (!tiles.has(k)) tiles.set(k, {tx, tz, c: new Uint8Array(TS * TS * 4), zb: new Float32Array(TS * TS).fill(1e9)}); return tiles.get(k) };
  let used = 0;
  for (const [a, b, c, m] of F) { const A = G3[a[0] - 1], B = G3[b[0] - 1], C = G3[c[0] - 1];
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2], ny = uz * vx - ux * vz, nl = Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx); if (nl < 1e-9 || Math.abs(ny) / nl < .75) continue;   /* faces up (either winding) */
    const cx = (A[0] + B[0] + C[0]) / 3, cz = (A[2] + B[2] + C[2]) / 3, cy = (A[1] + B[1] + C[1]) / 3, t0 = T(cx, cz); if (cy < t0 - 1.6 || cy > t0 + .9) continue;   /* at street level, not a car roof or a canopy */
    const im = getTex(m); if (!im || !a[1] || !b[1] || !c[1]) continue; const ta = VT[a[1] - 1], tb = VT[b[1] - 1], tc = VT[c[1] - 1]; used++;
    const x0 = Math.min(A[0], B[0], C[0]), x1 = Math.max(A[0], B[0], C[0]), z0 = Math.min(A[2], B[2], C[2]), z1 = Math.max(A[2], B[2], C[2]); if (x1 - x0 > 6 || z1 - z0 > 6) continue;
    const den = (B[2] - C[2]) * (A[0] - C[0]) + (C[0] - B[0]) * (A[2] - C[2]); if (Math.abs(den) < 1e-12) continue;
    for (let gz = Math.floor(z0 * GPX); gz <= Math.ceil(z1 * GPX); gz++) for (let gx = Math.floor(x0 * GPX); gx <= Math.ceil(x1 * GPX); gx++) { const x = (gx + .5) / GPX, z = (gz + .5) / GPX;
      const l1 = ((B[2] - C[2]) * (x - C[0]) + (C[0] - B[0]) * (z - C[2])) / den, l2 = ((C[2] - A[2]) * (x - C[0]) + (A[0] - C[0]) * (z - C[2])) / den, l3 = 1 - l1 - l2; if (l1 < -1e-4 || l2 < -1e-4 || l3 < -1e-4) continue;
      const y = l1 * A[1] + l2 * B[1] + l3 * C[1], tx = Math.floor(gx / TS), tz = Math.floor(gz / TS), t = tileOf(tx, tz), o = (gz - tz * TS) * TS + (gx - tx * TS); if (y >= t.zb[o]) continue; t.zb[o] = y;
      const u = (l1 * ta[0] + l2 * tb[0] + l3 * tc[0]) * (im.width - 1), v = (1 - (l1 * ta[1] + l2 * tb[1] + l3 * tc[1])) * (im.height - 1), iu = clamp(Math.floor(u), 0, im.width - 2), iv = clamp(Math.floor(v), 0, im.height - 2), fu = u - iu, fv = v - iv;
      for (let k = 0; k < 3; k++) { const P2 = (xx, yy) => im.data[(yy * im.width + xx) * 4 + k]; t.c[o * 4 + k] = (P2(iu, iv) * (1 - fu) + P2(iu + 1, iv) * fu) * (1 - fv) + (P2(iu, iv + 1) * (1 - fu) + P2(iu + 1, iv + 1) * fu) * fv } t.c[o * 4 + 3] = 255 } }
  const out = []; let px = 0;
  for (const t of tiles.values()) { let n = 0; for (let i = 0; i < TS * TS; i++) if (t.c[i * 4 + 3]) n++; if (n < TS * TS * .02) continue;
    const A = new Uint8Array(TS * TS); for (let i = 0; i < TS * TS; i++) A[i] = t.c[i * 4 + 3]; for (let v = 1; v < TS - 1; v++) for (let u = 1; u < TS - 1; u++) { const i = v * TS + u; if (A[i] && (!A[i - 1] || !A[i + 1] || !A[i - TS] || !A[i + TS])) t.c[i * 4 + 3] = 140 }
    const f = `g${t.tx}_${t.tz}.png`; fs.writeFileSync(`${GO}/${f}`, png(TS, TS, t.c)); out.push({f, x0: t.tx * TM, z0: t.tz * TM, size: TM}); px += n }
  fs.writeFileSync(`${GO}/index.json`, JSON.stringify({generated: new Date().toISOString(), source: 'Mapillary contributors, CC BY-SA 4.0; COLMAP + OpenMVS reconstruction', tiles: out}));
  L('mesh ground: faces used', used, 'tiles', out.length, 'area m2', (px / GPX / GPX).toFixed(0)) }
let blockedPt = () => false;

// ---------- main ----------
try {
  if (process.env.MESHGROUND) { meshGround(process.env.MESHGROUND); throw new Error('done (mesh ground only)') }
  const dirs = fs.readdirSync('work/sparse').filter(n => n.endsWith('-txt') && fs.existsSync(`work/sparse/${n}/images.txt`));
  if (!dirs.length) throw new Error('no COLMAP model');
  const ref = new Map(); for (const l of fs.readFileSync('work/ref.txt', 'utf8').split('\n')) { const p = l.trim().split(/\s+/); if (p.length === 4) ref.set(p[0], [+p[1], +p[2], +p[3]]) }
  let G = []; const GP = [], ACC = [];
  for (const dn of dirs) { let m = readModel('work/sparse/' + dn); L('model', dn, 'images', m.imgs.length, 'points', m.pts.length); if (m.imgs.length < 8) continue; m = alignGPS(m, ref); if (!m) { L('  could not align to GPS'); continue } const fit = fitToWalls(m.pts); if (!fit) { L('  could not fit onto walls'); continue } if (Math.hypot(fit.dx, fit.dz) > 12 || Math.abs(fit.th) > .12) { L('  wall fit too far from GPS: dropped'); continue }
    const inside = (x, z) => rings.some(R => { let c = false; for (let i = 0, j = R.length - 1; i < R.length; j = i++) if ((R[i][1] > z) !== (R[j][1] > z) && x < (R[j][0] - R[i][0]) * (z - R[i][1]) / (R[j][1] - R[i][1]) + R[i][0]) c = !c; return c });
    ACC.push({dn, m, fit});
    const gc = gameCams(m, fit).filter(g => !inside(g.centre[0], g.centre[2])); L('  cameras kept', gc.length); G = G.concat(gc);
    { const c = Math.cos(fit.th), s2 = Math.sin(fit.th); for (const [X, Y, Z] of m.pts) { const x0 = X, z0 = -Y, x = CX + c * (x0 - CX) - s2 * (z0 - CZ) + fit.dx, z = CZ + s2 * (x0 - CX) + c * (z0 - CZ) + fit.dz, y = Z + fit.dy; if (Math.abs(y - T(x, z)) < 3) GP.push([x, y, z]) } } }
  L('registered cameras', G.length);
  const imgCache = new Map(); const img = id => { if (!imgCache.has(id)) { try { imgCache.set(id, jpeg.decode(fs.readFileSync(`work/images/${id}.jpg`), {useTArray: true})) } catch (e) { imgCache.set(id, null) } } return imgCache.get(id) };
  const W = process.env.NOFAC ? [] : walls(); L('walls in the block', W.length);
  if (!process.env.NOFAC) { fs.rmSync(OUT, {recursive: true, force: true}); fs.mkdirSync(OUT, {recursive: true}) }
  let atlas = null, ax = 0, ay = 0, rowH = 0, ai = -1; const FAC = []; const stat = {few: 0, disagree: 0, ok: 0};
  const newAtlas = () => { ai++; atlas = {i: ai, d: new Uint8Array(ATLAS * ATLAS * 4).fill(128)}; ax = ay = rowH = 0 };
  const flush = () => { if (!atlas || process.env.NOFAC) return; fs.writeFileSync(`${OUT}/a${atlas.i}.jpg`, jpeg.encode({data: atlas.d, width: ATLAS, height: ATLAS}, 82).data); atlas = null };
  newAtlas();
  for (const w of W) { const mx = (w.a[0] + w.b[0]) / 2, mz = (w.a[1] + w.b[1]) / 2;
    const tw = clamp(Math.round(w.l * PXM), 8, 1200), th = clamp(Math.round((w.y1 - w.y0) * PXM), 8, 1400);
    const views = [];
    for (const g of G) { const [cx, , cz] = g.centre, vx = cx - mx, vz = cz - mz, dist = Math.hypot(vx, vz); if (dist > 70 || dist < 3) continue; if ((vx * w.n[0] + vz * w.n[1]) / dist < .25) continue;
      if (blocked([cx, cz], [mx + w.n[0] * .3, mz + w.n[1] * .3])) continue; const im = img(g.id); if (!im) continue;
      const S = new Uint8Array(tw * th * 3), M = new Uint8Array(tw * th), Wt = new Float32Array(tw * th); let n = 0;
      for (let v = 0; v < th; v++) for (let u = 0; u < tw; u++) { const s = (u + .5) / tw, Y = w.y1 - (v + .5) / PXM * (w.y1 - w.y0) / ((th) / PXM), X = w.a[0] + (w.b[0] - w.a[0]) * s, Z = w.a[1] + (w.b[1] - w.a[1]) * s;
        const ex = cx - X, ez = cz - Z, eh = Math.hypot(ex, ez), cosA = (ex * w.n[0] + ez * w.n[1]) / eh; if (cosA < .5 || eh > 45) continue;   /* only reasonably square-on, not too far */
        const q = proj(g, X, Y, Z); if (!q) continue; const o = v * tw + u; Wt[o] = cosA * cosA / Math.max(6, Math.hypot(eh, Y - g.centre[1])); const x0 = q[0] | 0, y0 = q[1] | 0, x1 = Math.min(im.width - 1, x0 + 1), y1 = Math.min(im.height - 1, y0 + 1), du = q[0] - x0, dv = q[1] - y0;
        for (let k = 0; k < 3; k++) { const P = (xx, yy) => im.data[(yy * im.width + xx) * 4 + k]; S[o * 3 + k] = (P(x0, y0) * (1 - du) + P(x1, y0) * du) * (1 - dv) + (P(x0, y1) * (1 - du) + P(x1, y1) * du) * dv } M[o] = 1; n++ }
      if (n > tw * th * .1) { const r = deskew(S, M, Wt, tw, th); stat.roll = (stat.roll || []); if (Math.abs(r) > 1e-4) stat.roll.push(+(r * 57.3).toFixed(1)); views.push({S, M, Wt, n, dist}) } }
    if (views.length < 2) { stat.few++; continue }
    /* per-pixel median, then drop views that disagree with it and redo */
    const med = (V) => { const O = new Uint8Array(tw * th * 3), H = new Uint8Array(tw * th); for (let o = 0; o < tw * th; o++) { const vs = V.filter(v => v.M[o]); if (!vs.length) continue; H[o] = vs.length; for (let k = 0; k < 3; k++) { const a = vs.map(v => v.S[o * 3 + k]).sort((p, q) => p - q); O[o * 3 + k] = a[a.length >> 1] } } return {O, H} };
    let {O, H} = med(views);
    const agreeing = views.filter(v => { let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0; for (let o = 0; o < tw * th; o++) if (v.M[o] && H[o] > 1) { const a = v.S[o * 3 + 1], b = O[o * 3 + 1]; n++; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b }
      if (n < 100) return false; const va = saa - sa * sa / n, vb = sbb - sb * sb / n; return va > 0 && vb > 0 && (sab - sa * sb / n) / Math.sqrt(va * vb) > .35 });
    if (agreeing.length < 2) { stat.disagree++; continue }
    ({O, H} = med(agreeing));
    { const O2 = new Uint8Array(O.length); for (let o = 0; o < tw * th; o++) { if (!H[o]) continue; let sw = 0; const acc = [0, 0, 0];
        for (const v of agreeing) { if (!v.M[o]) continue; let dd = 0; for (let k = 0; k < 3; k++) dd += Math.abs(v.S[o * 3 + k] - O[o * 3 + k]); if (H[o] > 2 && dd > 90) continue; const ww = (v.Wt[o] * v.Wt[o]) ** 2; sw += ww; for (let k = 0; k < 3; k++) acc[k] += ww * v.S[o * 3 + k] }
        for (let k = 0; k < 3; k++) O2[o * 3 + k] = sw > 0 ? acc[k] / sw : O[o * 3 + k] } O = O2 }   /* sharpest, most square-on view wins where photos agree */
    let topRow = -1; for (let v = 0; v < th; v++) { let n = 0; for (let u = 0; u < tw; u++) n += H[v * tw + u] ? 1 : 0; if (n > tw * .8) { topRow = v; break } }
    if (topRow < 0 || th - topRow < Math.min(th, 30)) { stat.few++; continue }
    const band = Math.min(th - topRow, 32); for (let v = topRow - 1; v >= 0; v--) { const src = topRow + ((topRow - 1 - v) % band); for (let u = 0; u < tw; u++) { const o = v * tw + u, s = src * tw + u; for (let k = 0; k < 3; k++) O[o * 3 + k] = O[s * 3 + k]; H[o] = H[s] } }
    { let sky = 0, seen = 0; for (let o = 0; o < tw * th; o++) { if (!H[o]) continue; seen++; const r = O[o * 3], g = O[o * 3 + 1], b = O[o * 3 + 2]; if (b > r + 15 && b > g && .3 * r + .59 * g + .11 * b > 120) sky++ }
      if (sky > seen * .12) { stat.sky = (stat.sky || 0) + 1; continue } }
    { const MM = H.map(v => v ? 1 : 0), a = tiltOf(O, MM, tw, th, 1, tw >> 1, true), b = tiltOf(O, MM, tw, th, tw >> 1, tw - 1, true), lim = 1.5 / 57.3;
      if (a !== null && b !== null && (Math.abs(a) > lim || Math.abs(b) > lim || Math.abs(a - b) > lim)) { stat.lean = (stat.lean || 0) + 1; continue } }   /* rows still lean or converge: the wall was misplaced */   /* sky on the wall: misplaced */
    let mr = 0, mg = 0, mb = 0, mn = 0; for (let o = 0; o < tw * th; o++) if (H[o]) { mr += O[o * 3]; mg += O[o * 3 + 1]; mb += O[o * 3 + 2]; mn++ } mr /= mn; mg /= mn; mb /= mn;
    if (ax + tw > ATLAS) { ax = 0; ay += rowH; rowH = 0 } if (ay + th > ATLAS) { flush(); newAtlas() }
    for (let v = 0; v < th; v++) for (let u = 0; u < tw; u++) { const o = v * tw + u, A = ((ay + v) * ATLAS + ax + u) * 4; if (H[o]) { atlas.d[A] = O[o * 3]; atlas.d[A + 1] = O[o * 3 + 1]; atlas.d[A + 2] = O[o * 3 + 2] } else { atlas.d[A] = mr; atlas.d[A + 1] = mg; atlas.d[A + 2] = mb } }
    FAC.push({a: w.a.map(v => +v.toFixed(2)), b: w.b.map(v => +v.toFixed(2)), n: w.n.map(v => +v.toFixed(3)), y0: +w.y0.toFixed(2), y1: +w.y1.toFixed(2), t: atlas.i, uv: [ax / ATLAS, ay / ATLAS, (ax + tw) / ATLAS, (ay + th) / ATLAS], photos: agreeing.length});
    ax += tw + 2; rowH = Math.max(rowH, th + 2); stat.ok++ }
  flush();
  if (!process.env.NOFAC) fs.writeFileSync(`${OUT}/facades.json`, JSON.stringify({generated: new Date().toISOString(), source: 'Mapillary contributors, CC BY-SA 4.0; COLMAP reconstruction', center: [CX, CZ], radius: RAD, atlases: ai + 1, size: ATLAS, facades: FAC}));
  { const R = stat.roll || []; delete stat.roll; L('facades', JSON.stringify(stat), 'views rotated', R.length, 'median roll deg', R.length ? R.map(Math.abs).sort((a, b) => a - b)[R.length >> 1] : 0) }
  { const inside = (x, z) => rings.some(R => { if (Math.abs(R[0][0] - x) > 150 || Math.abs(R[0][1] - z) > 150) return false; let c = false; for (let i = 0, j = R.length - 1; i < R.length; j = i++) if ((R[i][1] > z) !== (R[j][1] > z) && x < (R[j][0] - R[i][0]) * (z - R[i][1]) / (R[j][1] - R[i][1]) + R[i][0]) c = !c; return c }); blockedPt = inside }
  if (process.env.EXPORT_MERGED) exportMerged(ACC);
  if (process.env.GROUND) ground(G, img, groundHeight(GP));   // experimental, off by default
} catch (e) { L('fatal', e.stack || e.message) }
fs.writeFileSync('data/sfm-log.txt', log.join('\n') + '\n');
