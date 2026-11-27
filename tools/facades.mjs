// Multi-photo facade textures from Mapillary (CC BY-SA 4.0), for the Hanasaari-Kalasatama shoreline buildings.
//  1. Walls: OSM building outlines within 120 m of the water in the zone; wall tops from the city's LOD2 tiles.
//  2. For each wall, up to 10 street photos that see it.
//  3. Registration: Mapillary camera positions are GPS-accurate only (metres off). For each photo, search over
//     corrections to position, heading and height so that the projected wall is "straight" (edges horizontal or
//     vertical), sky sits just above the roofline and not on the wall.
//  4. Consensus: the other photos are aligned to the best one by pixel correlation; a wall is kept only when at
//     least two photos agree.
//  5. Fusion: per-pixel median of the aligned photos (removes cars, people, reflections); upper floors the street
//     cannot see repeat the highest well-seen floor band.
// Output: data/facades/facades.json + atlas JPEGs; log data/facades-log.txt. Needs MAPILLARY_TOKEN.
import fs from 'node:fs';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const jpeg = require('jpeg-js');

const TOKEN = process.env.MAPILLARY_TOKEN;
const LAT0 = 60.1850, LON0 = 24.9760, KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KZ = 110540;
const PJ = (lat, lon) => [(lon - LON0) * KX, -(lat - LAT0) * KZ];
const UNPJ = (x, z) => [LAT0 - z / KZ, LON0 + x / KX];
const ZONE = JSON.parse(process.env.ZONE || '[-700,100,330,820]');   /* game metres: Hanasaari, Sompasaari, Kalasatama */
const OUT = 'data/facades', PXM = 10, LPX = 4, ATLAS = 2048, MAXDL = +(process.env.MAXDL || 4000);
const log = []; const L = (...a) => { const m = a.join(' '); console.log(m); log.push(m) };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- terrain ----------
const TB = zlib.gunzipSync(fs.readFileSync('data/terrain.bin')); const THL = TB.readUInt32LE(0), TH = JSON.parse(TB.slice(4, 4 + THL).toString());
const TA = new Int16Array(TB.buffer.slice(TB.byteOffset + 4 + THL, TB.byteOffset + TB.length));
const T = (x, z) => { const fi = (x - TH.x0) / TH.cs, fj = (z - TH.z0) / TH.cs, i = clamp(Math.floor(fi), 0, TH.nx - 2), j = clamp(Math.floor(fj), 0, TH.nz - 2), u = clamp(fi - i, 0, 1), v = clamp(fj - j, 0, 1), H = (a, b) => TA[b * TH.nx + a] * TH.unit;
  return (H(i, j) * (1 - u) + H(i + 1, j) * u) * (1 - v) + (H(i, j + 1) * (1 - u) + H(i + 1, j + 1) * u) * v };
const isW = (x, z) => T(x, z) < -2.6;

// ---------- Mapillary ----------
async function api(url) { for (let k = 0; k < 4; k++) { try { const r = await fetch(url, {headers: {Authorization: 'OAuth ' + TOKEN}}); if (r.status === 429) { await new Promise(q => setTimeout(q, 3000 * (k + 1))); continue } if (!r.ok) throw new Error(r.status + ' ' + (await r.text()).slice(0, 200)); return await r.json() } catch (e) { if (k === 3) throw e; await new Promise(q => setTimeout(q, 1500)) } } }
async function survey() {
  const F = 'id,computed_geometry,computed_compass_angle,computed_rotation,camera_parameters,camera_type,captured_at,width,height,is_pano';
  const [s, w] = UNPJ(ZONE[0] - 80, ZONE[3] + 80), [n, e] = UNPJ(ZONE[2] + 80, ZONE[1] - 80);
  const cells = []; for (let la = s; la < n; la += .0012) for (let lo = w; lo < e; lo += .0024) cells.push([lo, la, Math.min(e, lo + .0024), Math.min(n, la + .0012)]);
  const imgs = new Map();
  const work = async () => { while (cells.length) { const c = cells.pop(); const j = await api(`https://graph.mapillary.com/images?fields=${F}&bbox=${c.join(',')}&limit=2000`);
      for (const m of j.data || []) if (m.computed_geometry && !m.is_pano && m.camera_type !== 'spherical' && m.camera_type !== 'equirectangular') imgs.set(m.id, m) } };
  await Promise.all([1, 2, 3, 4, 5, 6].map(work)); L('photos in the zone', imgs.size); return [...imgs.values()];
}
function rotAA(r) { const th = Math.hypot(r[0], r[1], r[2]); if (th < 1e-12) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]]; const [x, y, z] = r.map(v => v / th), c = Math.cos(th), s = Math.sin(th), C = 1 - c;
  return [[c + x * x * C, x * y * C - z * s, x * z * C + y * s], [y * x * C + z * s, c + y * y * C, y * z * C - x * s], [z * x * C - y * s, z * y * C + x * s, c + z * z * C]] }
function camera(m) {
  if (!m.computed_rotation || (m.captured_at || 0) < Date.UTC(2018, 0, 1)) return null;
  const R = rotAA(m.computed_rotation), fv = R[2], a = (m.computed_compass_angle ?? 0) * Math.PI / 180; let d = Math.atan2(fv[0], fv[1]) - a; d = Math.atan2(Math.sin(d), Math.cos(d));
  if (Math.abs(d) > .4 || Math.abs(fv[2]) > .45 || R[1][2] > -.85) return null;
  const [lon, lat] = m.computed_geometry.coordinates, [cx, cz] = PJ(lat, lon), cp = m.camera_parameters || [];
  return {id: m.id, x: cx, z: cz, y: T(cx, cz) + 2.1, R, f: cp[0] > .2 && cp[0] < 3 ? cp[0] : .85, k1: cp[1] || 0, k2: cp[2] || 0, t: m.captured_at, fw: [fv[0], -fv[1]], W: 1, H: 1};
}
/* projection with a pose correction p = {dx, dz, dy, dyaw}: game point -> pixel in an image of size W x H */
function proj(c, p, X, Y, Z, W, H) {
  let e = X - (c.x + p.dx), n = -(Z - (c.z + p.dz)); const u = Y - (c.y + p.dy);
  if (p.dyaw) { const cs = Math.cos(p.dyaw), sn = Math.sin(p.dyaw), e2 = cs * e - sn * n; n = sn * e + cs * n; e = e2 }
  const R = c.R, xc = R[0][0] * e + R[0][1] * n + R[0][2] * u, yc = R[1][0] * e + R[1][1] * n + R[1][2] * u, zc = R[2][0] * e + R[2][1] * n + R[2][2] * u;
  if (zc < .8) return null; let px = xc / zc, py = yc / zc; const r2 = px * px + py * py, dd = 1 + c.k1 * r2 + c.k2 * r2 * r2; px *= dd; py *= dd;
  const S = Math.max(W, H); const ix = W / 2 + c.f * S * px, iy = H / 2 + c.f * S * py; return ix < 0 || iy < 0 || ix > W - 1 || iy > H - 1 ? null : [ix, iy] }

// ---------- walls ----------
function tileTops() { const tops = new Map(), key = (i, j) => i * 100003 + j;
  for (const t of JSON.parse(fs.readFileSync('data/tiles/index.json')).tiles) { const b = fs.readFileSync('data/tiles/' + t.file), ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
    const hl = b.readUInt32LE(0), head = JSON.parse(b.slice(4, 4 + hl).toString().replace(/\0/g, '')), base = 4 + hl;
    for (const p of head.prims) { const P = new Int16Array(ab, base + p.pos, p.n * 3); for (let i = 0; i < p.n; i++) { const x = P[i * 3] / 10 + head.ox, z = P[i * 3 + 2] / 10 + head.oz; if (x < ZONE[0] - 50 || x > ZONE[2] + 50 || z < ZONE[1] - 50 || z > ZONE[3] + 50) continue; const k = key(Math.floor(x / 2), Math.floor(z / 2)); if (!tops.has(k)) tops.set(k, []); tops.get(k).push(P[i * 3 + 1] / 10) } } }
  return (x, z, r) => { const v0 = []; for (let i = Math.floor((x - r) / 2); i <= Math.floor((x + r) / 2); i++) for (let j = Math.floor((z - r) / 2); j <= Math.floor((z + r) / 2); j++) { const v = tops.get(key(i, j)); if (v) v0.push(...v) } if (!v0.length) return null; v0.sort((a, b) => a - b); return v0[Math.floor(v0.length * .7)] } }
function walls() {
  const d = JSON.parse(zlib.gunzipSync(fs.readFileSync('data/osm-buildings.json.gz'))); const rings = [];
  for (const e of d.elements) { if (e.type === 'way' && e.geometry) rings.push(e.geometry.filter(Boolean).map(g => PJ(g.lat, g.lon)));
    else if (e.type === 'relation' && e.members) for (const m of e.members) if (m.role === 'outer' && m.geometry) rings.push(m.geometry.filter(Boolean).map(g => PJ(g.lat, g.lon))) }
  const top = tileTops(), W = [], SEG = [];
  for (const R of rings) { if (R.length < 4) continue; let A = 0; for (let i = 0; i < R.length - 1; i++) A += R[i][0] * R[i + 1][1] - R[i + 1][0] * R[i][1]; const sg = A > 0 ? 1 : -1;
    const cx = R.reduce((s, p) => s + p[0], 0) / R.length, cz = R.reduce((s, p) => s + p[1], 0) / R.length; const inZ = cx > ZONE[0] && cx < ZONE[2] && cz > ZONE[1] && cz < ZONE[3];
    let nearWater = false; if (inZ) for (let a = 0; a < 16 && !nearWater; a++) for (const r of [40, 80, 120]) if (isW(cx + Math.cos(a * .39) * r, cz + Math.sin(a * .39) * r)) { nearWater = true; break }
    for (let i = 0; i < R.length - 1; i++) { const a = R[i], b = R[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); SEG.push([a, b]); if (!inZ || !nearWater || l < 5) continue;
      const nx = -dz / l * sg, nz = dx / l * sg, y0 = Math.min(T(a[0] + nx, a[1] + nz), T(b[0] + nx, b[1] + nz)); let y1 = 0, c = 0;
      for (const s of [.2, .5, .8]) { const t = top(a[0] + dx * s - nx * .8, a[1] + dz * s - nz * .8, 1); if (t !== null) { y1 += t; c++ } }
      if (!c) continue; y1 /= c; if (y1 - y0 < 3 || y1 - y0 > 90) continue;
      const k = Math.ceil(l / 22); for (let q = 0; q < k; q++) W.push({a: [a[0] + dx * q / k, a[1] + dz * q / k], b: [a[0] + dx * (q + 1) / k, a[1] + dz * (q + 1) / k], n: [nx, nz], l: l / k, y0, y1}) } }
  L('shoreline walls', W.length);
  const G = new Map(), gk = (i, j) => i * 100003 + j;
  for (const s of SEG) { const [a, b] = s; for (let i = Math.floor(Math.min(a[0], b[0]) / 10); i <= Math.floor(Math.max(a[0], b[0]) / 10); i++) for (let j = Math.floor(Math.min(a[1], b[1]) / 10); j <= Math.floor(Math.max(a[1], b[1]) / 10); j++) { const k = gk(i, j); if (!G.has(k)) G.set(k, []); G.get(k).push(s) } }
  const cross = (p, q, a, b) => { const d = (q[0] - p[0]) * (b[1] - a[1]) - (q[1] - p[1]) * (b[0] - a[0]); if (Math.abs(d) < 1e-9) return false; const t = ((a[0] - p[0]) * (b[1] - a[1]) - (a[1] - p[1]) * (b[0] - a[0])) / d, u = ((a[0] - p[0]) * (q[1] - p[1]) - (a[1] - p[1]) * (q[0] - p[0])) / d; return t > .02 && t < .95 && u > 0 && u < 1 };
  const blocked = (p, q) => { const seen = new Set(), n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 5); for (let s = 0; s <= n; s++) { const x = p[0] + (q[0] - p[0]) * s / n, z = p[1] + (q[1] - p[1]) * s / n, L2 = G.get(gk(Math.floor(x / 10), Math.floor(z / 10))); if (!L2) continue; for (const sg of L2) { if (seen.has(sg)) continue; seen.add(sg); if (cross(p, q, sg[0], sg[1])) return true } } return false };
  return {W, blocked};
}

// ---------- images ----------
const cache = new Map(); let downloads = 0;
async function getImg(id) { if (cache.has(id)) { const v = cache.get(id); cache.delete(id); cache.set(id, v); return v } if (downloads >= MAXDL) return null;
  try { downloads++; const j = await api(`https://graph.mapillary.com/${id}?fields=thumb_1024_url`); const r = await fetch(j.thumb_1024_url); const im = jpeg.decode(Buffer.from(await r.arrayBuffer()), {useTArray: true});
    const Y = new Float32Array(im.width * im.height); for (let i = 0; i < Y.length; i++) Y[i] = .3 * im.data[i * 4] + .59 * im.data[i * 4 + 1] + .11 * im.data[i * 4 + 2]; im.Y = Y;
    cache.set(id, im); if (cache.size > 60) cache.delete(cache.keys().next().value); return im } catch (e) { cache.set(id, null); return null } }

/* render a wall (plus a band 2 m above it) from one photo at px per metre */
function render(c, p, w, img, px, rgb) {
  const tw = Math.max(8, Math.round(w.l * px)), hh = w.y1 - w.y0, th = Math.max(8, Math.round(hh * px)), tb = Math.round(2 * px), N = tw * (th + tb);
  const Yv = new Float32Array(N), M = new Uint8Array(N), C = rgb ? new Uint8Array(N * 3) : null;
  for (let v = 0; v < th + tb; v++) for (let u = 0; u < tw; u++) { const s = (u + .5) / tw, Y = w.y1 + 2 - (v + .5) / px, X = w.a[0] + (w.b[0] - w.a[0]) * s, Z = w.a[1] + (w.b[1] - w.a[1]) * s;
    const q = proj(c, p, X, Y, Z, img.width, img.height); if (!q) continue; const i = v * tw + u, x0 = q[0] | 0, y0 = q[1] | 0, du = q[0] - x0, dv = q[1] - y0, x1 = Math.min(img.width - 1, x0 + 1), y1 = Math.min(img.height - 1, y0 + 1), W = img.width;
    Yv[i] = (img.Y[y0 * W + x0] * (1 - du) + img.Y[y0 * W + x1] * du) * (1 - dv) + (img.Y[y1 * W + x0] * (1 - du) + img.Y[y1 * W + x1] * du) * dv; M[i] = 1;
    if (C) for (let k = 0; k < 3; k++) { const P = (xx, yy) => img.data[(yy * W + xx) * 4 + k]; C[i * 3 + k] = (P(x0, y0) * (1 - du) + P(x1, y0) * du) * (1 - dv) + (P(x0, y1) * (1 - du) + P(x1, y1) * du) * dv } }
  return {tw, th, tb, Y: Yv, M, C};
}
/* how much a rendering looks like a correctly placed facade */
function straight(R, img, c, p, w) {
  const {tw, th, tb, Y, M} = R; let ax = 0, all = 0, cov = 0;
  for (let v = tb + 1; v < tb + th - 1; v++) for (let u = 1; u < tw - 1; u++) { const i = v * tw + u; if (!M[i]) continue; cov++; if (!M[i - 1] || !M[i + 1] || !M[i - tw] || !M[i + tw]) continue;
    const gx = Y[i + 1] - Y[i - 1], gy = Y[i + tw] - Y[i - tw], m = Math.hypot(gx, gy); if (m < 25) continue; all += m; const an = Math.abs(Math.atan2(gy, gx)) % (Math.PI / 2); if (an < .15 || an > Math.PI / 2 - .15) ax += m }
  cov /= (tw - 2) * (th - 2); if (cov < .3 || all === 0) return -1;
  /* the roofline: a strong horizontal edge at the top of the wall */
  let edge = 0, rows = 0; for (const dv of [-1, 0, 1]) { const v = tb + dv; if (v < 1 || v >= tb + th - 1) continue; let s = 0, n = 0; for (let u = 0; u < tw; u++) { const i = v * tw + u; if (M[i] && M[i - tw] && M[i + tw]) { s += Math.abs(Y[i + tw] - Y[i - tw]); n++ } } if (n) { edge = Math.max(edge, s / n); rows++ } }
  return ax / all + Math.min(.5, edge / 120) * .8 + cov * .3 }
function ncc(A, B) { let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0; const lo = A.tb * A.tw;
  for (let i = lo; i < A.Y.length; i++) if (A.M[i] && B.M[i]) { const a = A.Y[i], b = B.Y[i]; n++; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b }
  if (n < 200) return -1; const va = saa - sa * sa / n, vb = sbb - sb * sb / n; return va > 0 && vb > 0 ? (sab - sa * sb / n) / Math.sqrt(va * vb) : -1 }
/* pose search along the wall's own axes (t along the wall, n toward the street) */
function search(c, w, img, score, coarse) {
  const tx = (w.b[0] - w.a[0]) / w.l, tz = (w.b[1] - w.a[1]) / w.l, mk = (dt, dn, dy, dyaw) => ({dx: tx * dt + w.n[0] * dn, dz: tz * dt + w.n[1] * dn, dy, dyaw, dt, dn});
  let best = null, bs = -9;
  const G1 = coarse ? {t: [-6, -3, 0, 3, 6], n: [-6, -3, 0, 3, 6], y: [0], a: [-.07, 0, .07]} : {t: [-2, 0, 2], n: [-2, 0, 2], y: [0], a: [-.03, 0, .03]};
  const base = coarse ? {dt: 0, dn: 0, dy: 0, dyaw: 0} : coarse;
  for (const dt of G1.t) for (const dn of G1.n) for (const dy of G1.y) for (const da of G1.a) { const p = mk(dt, dn, dy, da), s = score(render(c, p, w, img, LPX), p); if (s > bs) { bs = s; best = p } }
  if (!best) return null;
  for (const st of [1.5, .75]) { const b0 = best; for (const dt of [-st, 0, st]) for (const dn of [-st, 0, st]) for (const dy of [-st / 2, 0, st / 2]) for (const da of [-.02, 0, .02]) { if (!dt && !dn && !dy && !da) continue; const p = mk(b0.dt + dt, b0.dn + dn, b0.dy + dy, b0.dyaw + da), s = score(render(c, p, w, img, LPX), p); if (s > bs) { bs = s; best = p } } }
  return {p: best, s: bs} }

// ---------- main ----------
async function main() {
  const cams = (await survey()).map(camera).filter(Boolean); L('photos with a usable pose', cams.length);
  const {W, blocked} = walls(); fs.rmSync(OUT, {recursive: true, force: true}); fs.mkdirSync(OUT, {recursive: true});
  let atlas = null, ax = 0, ay = 0, rowH = 0, ai = -1; const FAC = [], stat = {noCand: 0, noReg: 0, noAgree: 0, ok: 0};
  const newAtlas = () => { ai++; atlas = {i: ai, d: new Uint8Array(ATLAS * ATLAS * 4).fill(128)}; ax = ay = rowH = 0 };
  const flush = () => { if (!atlas) return; fs.writeFileSync(`${OUT}/a${atlas.i}.jpg`, jpeg.encode({data: atlas.d, width: ATLAS, height: ATLAS}, 82).data); atlas = null };
  newAtlas(); let k = 0;
  for (const w of W) { k++; if (k % 25 === 0) L('walls', k, '/', W.length, JSON.stringify(stat), 'downloads', downloads);
    const mx = (w.a[0] + w.b[0]) / 2, mz = (w.a[1] + w.b[1]) / 2, cand = [];
    for (const c of cams) { const vx = c.x - mx, vz = c.z - mz, dist = Math.hypot(vx, vz); if (dist > 60 || dist < 6) continue; const side = (vx * w.n[0] + vz * w.n[1]) / dist; if (side < .35) continue;
      const face = -(c.fw[0] * w.n[0] + c.fw[1] * w.n[1]); if (face < .3) continue; cand.push([side * face * Math.exp(-Math.abs(dist - 20) / 25), c]) }
    cand.sort((a, b) => b[0] - a[0]); const C = []; for (const [, c] of cand) { if (C.length >= 10) break; if (!blocked([c.x, c.z], [mx + w.n[0] * .3, mz + w.n[1] * .3])) C.push(c) }
    if (C.length < 2) { stat.noCand++; continue }
    /* register each photo on its own */
    const reg = []; for (const c of C) { const img = await getImg(c.id); if (!img) continue; const r = search(c, w, img, R => straight(R), true); if (r && r.s > .9) reg.push({c, img, ...r}) }
    if (reg.length < 2) { stat.noReg++; continue }
    reg.sort((a, b) => b.s - a.s); const ref = reg[0], RR = render(ref.c, ref.p, w, ref.img, LPX);
    /* align the others to it and keep those that agree */
    const agree = [ref]; for (const r of reg.slice(1)) { const q = search(r.c, w, r.img, R => { const v = ncc(RR, R); return v < -.5 ? -9 : v + .2 * Math.max(0, straight(R)) }, true); if (q && q.s > .55) agree.push({...r, p: q.p}) }
    if (agree.length < 2) { stat.noAgree++; continue }
    /* fuse: per-pixel median at full resolution */
    const F = agree.slice(0, 6).map(r => render(r.c, r.p, w, r.img, PXM, true)); const {tw, th, tb} = F[0];
    const out = new Uint8Array(tw * th * 3), have = new Uint8Array(tw * th);
    for (let v = 0; v < th; v++) for (let u = 0; u < tw; u++) { const i = (v + tb) * tw + u, o = v * tw + u; const S = []; for (const f of F) if (f.M[i]) S.push(i);
      const vals = F.filter(f => f.M[i]); if (!vals.length) continue; for (let ch = 0; ch < 3; ch++) { const a = vals.map(f => f.C[i * 3 + ch]).sort((p, q) => p - q); out[o * 3 + ch] = a[a.length >> 1] } have[o] = 1 }
    /* upper floors the street cannot see: repeat the highest band of ~3.2 m that is fully seen */
    let topRow = -1; for (let v = 0; v < th; v++) { let n = 0; for (let u = 0; u < tw; u++) n += have[v * tw + u]; if (n > tw * .85) { topRow = v; break } }
    if (topRow < 0 || th - topRow < Math.min(th, 4 * PXM)) { stat.noAgree++; continue }
    const band = Math.min(th - topRow, Math.round(3.2 * PXM)); for (let v = topRow - 1; v >= 0; v--) { const src = topRow + ((topRow - 1 - v) % band); for (let u = 0; u < tw; u++) { const o = v * tw + u, s = src * tw + u; for (let ch = 0; ch < 3; ch++) out[o * 3 + ch] = out[s * 3 + ch]; have[o] = have[s] } }
    let mr = 0, mg = 0, mb = 0, mn = 0; for (let o = 0; o < tw * th; o++) if (have[o]) { mr += out[o * 3]; mg += out[o * 3 + 1]; mb += out[o * 3 + 2]; mn++ } mr /= mn; mg /= mn; mb /= mn;
    if (ax + tw > ATLAS) { ax = 0; ay += rowH; rowH = 0 } if (ay + th > ATLAS) { flush(); newAtlas() }
    const tw2 = Math.min(tw, ATLAS), th2 = Math.min(th, ATLAS);
    for (let v = 0; v < th2; v++) for (let u = 0; u < tw2; u++) { const o = v * tw + u, A = ((ay + v) * ATLAS + ax + u) * 4; if (have[o]) { atlas.d[A] = out[o * 3]; atlas.d[A + 1] = out[o * 3 + 1]; atlas.d[A + 2] = out[o * 3 + 2] } else { atlas.d[A] = mr; atlas.d[A + 1] = mg; atlas.d[A + 2] = mb } }
    FAC.push({a: w.a.map(v => +v.toFixed(2)), b: w.b.map(v => +v.toFixed(2)), n: w.n.map(v => +v.toFixed(3)), y0: +w.y0.toFixed(2), y1: +w.y1.toFixed(2), t: atlas.i, uv: [ax / ATLAS, ay / ATLAS, (ax + tw2) / ATLAS, (ay + th2) / ATLAS], photos: agree.length});
    ax += tw2 + 2; rowH = Math.max(rowH, th2 + 2); stat.ok++ }
  flush();
  fs.writeFileSync(`${OUT}/facades.json`, JSON.stringify({generated: new Date().toISOString(), source: 'Mapillary contributors, CC BY-SA 4.0', zone: ZONE, atlases: ai + 1, size: ATLAS, facades: FAC}));
  L('done', JSON.stringify(stat), 'downloads', downloads, 'facades', FAC.length, 'atlases', ai + 1);
}
try { if (!TOKEN) throw new Error('MAPILLARY_TOKEN is not set'); await main() } catch (e) { L('fatal', e.stack || e.message) }
fs.mkdirSync('data', {recursive: true}); fs.writeFileSync('data/facades-log.txt', log.join('\n') + '\n');
