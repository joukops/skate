// Street-level facade textures from Mapillary (CC BY-SA 4.0) for buildings outside the waterfront photo mesh.
// 1. Survey: list Mapillary photos in the game area (position, camera pose, intrinsics).
// 2. Walls: building outlines from OpenStreetMap, wall tops from the city's LOD2 tiles, ground from the terrain.
// 3. For each street-facing wall, pick the photo that sees it best (close, square on, nothing in between, recent).
// 4. Project that photo onto the wall (camera model from Mapillary's structure-from-motion), pack walls into atlases.
// Output: data/mapillary/facades.json + atlas JPEGs, data/mapillary-log.txt.
// Needs MAPILLARY_TOKEN (a Mapillary client token) in the environment.
import fs from 'node:fs';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const jpeg = require('jpeg-js');

const TOKEN = process.env.MAPILLARY_TOKEN;
const LAT0 = 60.1850, LON0 = 24.9760, KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KZ = 110540;
const PJ = (lat, lon) => [(lon - LON0) * KX, -(lat - LAT0) * KZ];
const BB = {s: 60.1610, w: 24.9370, n: 60.1985, e: 25.0450};
const MAXIMG = +(process.env.MAXIMG || 3500), PXM = 10, ATLAS = 2048;
const log = []; const L = (...a) => { const m = a.join(' '); console.log(m); log.push(m) };
const OUT = 'data/mapillary';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- terrain ----------
const TB = zlib.gunzipSync(fs.readFileSync('data/terrain.bin')); const THL = TB.readUInt32LE(0), TH = JSON.parse(TB.slice(4, 4 + THL).toString());
const TA = new Int16Array(TB.buffer.slice(TB.byteOffset + 4 + THL, TB.byteOffset + TB.length));
const T = (x, z) => { const fi = (x - TH.x0) / TH.cs, fj = (z - TH.z0) / TH.cs, i = clamp(Math.floor(fi), 0, TH.nx - 2), j = clamp(Math.floor(fj), 0, TH.nz - 2), u = clamp(fi - i, 0, 1), v = clamp(fj - j, 0, 1), H = (a, b) => TA[b * TH.nx + a] * TH.unit;
  return (H(i, j) * (1 - u) + H(i + 1, j) * u) * (1 - v) + (H(i, j + 1) * (1 - u) + H(i + 1, j + 1) * u) * v };

// ---------- mesh zones (already photo-textured) ----------
let ZONES = [];   /* the aerial mesh is opt-in in the game, so every wall is a candidate */
const inZone = (x, z) => ZONES.some(([a, b, c, d]) => x >= a && x <= c && z >= b && z <= d);

// ---------- 1. survey ----------
async function api(url) { for (let k = 0; k < 4; k++) { try { const r = await fetch(url, {headers: {Authorization: 'OAuth ' + TOKEN}}); if (r.status === 429) { await new Promise(q => setTimeout(q, 3000 * (k + 1))); continue } if (!r.ok) throw new Error(r.status + ' ' + (await r.text()).slice(0, 200)); return await r.json() } catch (e) { if (k === 3) throw e; await new Promise(q => setTimeout(q, 1500)) } } }
async function survey() {
  const F = 'id,computed_geometry,computed_compass_angle,computed_rotation,camera_parameters,camera_type,captured_at,width,height,is_pano';
  const cells = []; for (let la = BB.s; la < BB.n; la += .0015) for (let lo = BB.w; lo < BB.e; lo += .003) cells.push([lo, la, Math.min(BB.e, lo + .003), Math.min(BB.n, la + .0015)]);
  const imgs = new Map(); let done = 0, full = 0;
  const work = async () => { while (cells.length) { const c = cells.pop();
      const j = await api(`https://graph.mapillary.com/images?fields=${F}&bbox=${c.join(',')}&limit=2000`); const d = j.data || []; if (d.length >= 2000) full++;
      for (const m of d) if (m.computed_geometry && !m.is_pano && m.camera_type !== 'spherical' && m.camera_type !== 'equirectangular') imgs.set(m.id, m);
      if (++done % 100 === 0) L('survey cells', done, 'photos', imgs.size) } };
  await Promise.all([1, 2, 3, 4, 5, 6].map(work));
  L('survey done: perspective photos', imgs.size, 'cells at the 2000 limit', full);
  return [...imgs.values()];
}

// ---------- camera model ----------
function rotFromAxisAngle(r) { const th = Math.hypot(r[0], r[1], r[2]); if (th < 1e-12) return [[1, 0, 0], [0, 1, 0], [0, 0, 1]]; const [x, y, z] = r.map(v => v / th), c = Math.cos(th), s = Math.sin(th), C = 1 - c;
  return [[c + x * x * C, x * y * C - z * s, x * z * C + y * s], [y * x * C + z * s, c + y * y * C, y * z * C - x * s], [z * x * C - y * s, z * y * C + x * s, c + z * z * C]] }
function camera(m) {
  const [lon, lat] = m.computed_geometry.coordinates, [cx, cz] = PJ(lat, lon);
  const a = (m.computed_compass_angle ?? 0) * Math.PI / 180;
  const Rc = [[Math.cos(a), -Math.sin(a), 0], [0, 0, -1], [Math.sin(a), Math.cos(a), 0]];   /* world ENU -> camera (x right, y down, z forward), level */
  if (!m.computed_rotation) return null; const R = rotFromAxisAngle(m.computed_rotation), fv = R[2], yaw = Math.atan2(fv[0], fv[1]);
  let d = yaw - a; d = Math.atan2(Math.sin(d), Math.cos(d)); if (Math.abs(d) > .35 || Math.abs(fv[2]) > .45) return null;   /* solved pose must agree with the compass and look roughly level */
  if (R[1][2] > -.85) return null;   /* image 'down' must point down: rejects rotated and upside-down photos */
  if ((m.captured_at || 0) < Date.UTC(2018, 0, 1)) return null;
  const cp = m.camera_parameters || [], f = cp[0] > .2 && cp[0] < 3 ? cp[0] : .85, k1 = cp[1] || 0, k2 = cp[2] || 0;
  return {id: m.id, x: cx, z: cz, y: T(cx, cz) + 2.1, R, f, k1, k2, W: m.width || 2048, H: m.height || 1536, t: m.captured_at || 0,
    fw: [R[2][0], -R[2][1]]};   /* forward in game x/z (z is south) */
}
/* game point -> normalised image coordinates in [0,1], or null */
function project(c, X, Y, Z) { const e = X - c.x, n = -(Z - c.z), u = Y - c.y, R = c.R;
  const xc = R[0][0] * e + R[0][1] * n + R[0][2] * u, yc = R[1][0] * e + R[1][1] * n + R[1][2] * u, zc = R[2][0] * e + R[2][1] * n + R[2][2] * u;
  if (zc < .5) return null; let px = xc / zc, py = yc / zc; const r2 = px * px + py * py, dd = 1 + c.k1 * r2 + c.k2 * r2 * r2; px *= dd; py *= dd;
  const S = Math.max(c.W, c.H); return [(c.W / 2 + c.f * S * px) / c.W, (c.H / 2 + c.f * S * py) / c.H] }

// ---------- 2. walls ----------
function readTiles() { const tops = new Map(); const key = (i, j) => i * 100003 + j; let n = 0;
  if (!fs.existsSync('data/tiles/index.json')) return {top: () => null};
  for (const t of JSON.parse(fs.readFileSync('data/tiles/index.json')).tiles) { const b = fs.readFileSync('data/tiles/' + t.file), ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.length);
    const hl = b.readUInt32LE(0), head = JSON.parse(b.slice(4, 4 + hl).toString().replace(/\0/g, '')), base = 4 + hl;
    for (const p of head.prims) { const P = new Int16Array(ab, base + p.pos, p.n * 3);
      for (let i = 0; i < p.n; i++) { const x = P[i * 3] / 10 + head.ox, y = P[i * 3 + 1] / 10, z = P[i * 3 + 2] / 10 + head.oz, k = key(Math.floor(x / 2), Math.floor(z / 2)); const o = tops.get(k); if (o === undefined || y > o) tops.set(k, y); n++ } } }
  L('tile vertices', n);
  return {top: (x, z, r) => { let m = null; for (let i = Math.floor((x - r) / 2); i <= Math.floor((x + r) / 2); i++) for (let j = Math.floor((z - r) / 2); j <= Math.floor((z + r) / 2); j++) { const v = tops.get(key(i, j)); if (v !== undefined && (m === null || v > m)) m = v } return m }} }
function walls() {
  const d = JSON.parse(zlib.gunzipSync(fs.readFileSync('data/osm-buildings.json.gz'))); const rings = [];
  for (const e of d.elements) { if (e.type === 'way' && e.geometry) rings.push(e.geometry.filter(Boolean).map(g => PJ(g.lat, g.lon)));
    else if (e.type === 'relation' && e.members) for (const m of e.members) if (m.role === 'outer' && m.geometry) rings.push(m.geometry.filter(Boolean).map(g => PJ(g.lat, g.lon))) }
  const tiles = readTiles(); const W = [], SEG = [];
  for (const R of rings) { if (R.length < 4) continue; let A = 0; for (let i = 0; i < R.length - 1; i++) A += R[i][0] * R[i + 1][1] - R[i + 1][0] * R[i][1]; const sg = A > 0 ? 1 : -1;
    for (let i = 0; i < R.length - 1; i++) { const a = R[i], b = R[i + 1], dx = b[0] - a[0], dz = b[1] - a[1], l = Math.hypot(dx, dz); SEG.push([a, b]); if (l < 4) continue;
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2; if (inZone(mx, mz)) continue;
      const nx = -dz / l * sg, nz = dx / l * sg;   /* outward */
      const y0 = Math.min(T(a[0] + nx, a[1] + nz), T(b[0] + nx, b[1] + nz)); let y1 = 0, c = 0;
      for (const s of [.2, .5, .8]) { const t = tiles.top(a[0] + dx * s - nx * 1.5, a[1] + dz * s - nz * 1.5, 1.5); if (t !== null) { y1 += t; c++ } }
      if (!c) continue; y1 /= c; if (y1 - y0 < 2.5 || y1 - y0 > 80) continue;
      W.push({a, b, n: [nx, nz], l, y0, y1}) } }
  L('walls outside the mesh', W.length);
  /* segment grid for occlusion checks */
  const G = new Map(), gk = (i, j) => i * 100003 + j;
  for (const s of SEG) { const [a, b] = s; for (let i = Math.floor(Math.min(a[0], b[0]) / 10); i <= Math.floor(Math.max(a[0], b[0]) / 10); i++) for (let j = Math.floor(Math.min(a[1], b[1]) / 10); j <= Math.floor(Math.max(a[1], b[1]) / 10); j++) { const k = gk(i, j); if (!G.has(k)) G.set(k, []); G.get(k).push(s) } }
  const cross = (p, q, a, b) => { const d = (q[0] - p[0]) * (b[1] - a[1]) - (q[1] - p[1]) * (b[0] - a[0]); if (Math.abs(d) < 1e-9) return false; const t = ((a[0] - p[0]) * (b[1] - a[1]) - (a[1] - p[1]) * (b[0] - a[0])) / d, u = ((a[0] - p[0]) * (q[1] - p[1]) - (a[1] - p[1]) * (q[0] - p[0])) / d; return t > .02 && t < .97 && u > 0 && u < 1 };
  const blocked = (p, q) => { const seen = new Set(); const n = Math.ceil(Math.hypot(q[0] - p[0], q[1] - p[1]) / 5); for (let s = 0; s <= n; s++) { const x = p[0] + (q[0] - p[0]) * s / n, z = p[1] + (q[1] - p[1]) * s / n, L2 = G.get(gk(Math.floor(x / 10), Math.floor(z / 10))); if (!L2) continue; for (const sg of L2) { if (seen.has(sg)) continue; seen.add(sg); if (cross(p, q, sg[0], sg[1])) return true } } return false };
  return {W, blocked};
}

// ---------- 3. choose ----------
function choose(W, cams, blocked) {
  const CG = new Map(), ck = (i, j) => i * 100003 + j; for (const c of cams) { const k = ck(Math.floor(c.x / 40), Math.floor(c.z / 40)); if (!CG.has(k)) CG.set(k, []); CG.get(k).push(c) }
  let tmax = 1; for (const c of cams) if (c.t > tmax) tmax = c.t; const picks = [];
  for (const w of W) { const mx = (w.a[0] + w.b[0]) / 2, mz = (w.a[1] + w.b[1]) / 2; const cand = [];
    for (let i = Math.floor(mx / 40) - 1; i <= Math.floor(mx / 40) + 1; i++) for (let j = Math.floor(mz / 40) - 1; j <= Math.floor(mz / 40) + 1; j++) for (const c of CG.get(ck(i, j)) || []) {
      const vx = c.x - mx, vz = c.z - mz, dist = Math.hypot(vx, vz), side = vx * w.n[0] + vz * w.n[1]; if (side < 4 || dist > 45) continue;
      const face = -(c.fw[0] * w.n[0] + c.fw[1] * w.n[1]); if (face < .55) continue;   /* looking at the wall */
      let inside = 0; const pts = []; for (const s of [0, .5, 1]) for (const h of [0, .5, 1]) { const X = w.a[0] + (w.b[0] - w.a[0]) * s, Z = w.a[1] + (w.b[1] - w.a[1]) * s, Y = w.y0 + (w.y1 - w.y0) * h; const q = project(c, X, Y, Z); if (q && q[0] > 0 && q[0] < 1 && q[1] > 0 && q[1] < 1) inside++ }
      if (inside < 7) continue;
      const head = (vx * w.n[0] + vz * w.n[1]) / dist;   /* camera square on to the wall */
      const sc = inside / 9 * head * face * Math.exp(-Math.abs(dist - 16) / 25) * (.6 + .4 * (c.t / tmax));
      if (head < .5) continue; cand.push([sc, c]) }
    cand.sort((p, q) => q[0] - p[0]); const C = []; for (const [sc, c] of cand) { if (C.length >= 3) break; if (blocked([c.x, c.z], [w.a[0] + (w.b[0] - w.a[0]) * .5 + w.n[0] * .3, w.a[1] + (w.b[1] - w.a[1]) * .5 + w.n[1] * .3])) continue; C.push(c) }
    if (C.length) picks.push({w, C, s: cand[0][0]}) }
  /* cap the number of photos: keep the walls whose photos serve the most wall area */
  picks.sort((p, q) => q.w.l * (q.w.y1 - q.w.y0) * q.s - p.w.l * (p.w.y1 - p.w.y0) * p.s);
  L('walls with candidate photos', picks.length); return picks;
}

// ---------- 4. project + pack ----------
async function render(picks) {
  fs.rmSync(OUT, {recursive: true, force: true}); fs.mkdirSync(OUT, {recursive: true});
  let atlas = null, ax = 0, ay = 0, rowH = 0, ai = -1; const ATL = [], FAC = [];
  const newAtlas = () => { ai++; atlas = {i: ai, d: new Uint8Array(ATLAS * ATLAS * 4).fill(128)}; ax = ay = rowH = 0 };
  const flush = () => { if (!atlas) return; const j = jpeg.encode({data: atlas.d, width: ATLAS, height: ATLAS}, 80); fs.writeFileSync(`${OUT}/a${atlas.i}.jpg`, j.data); atlas = null };
  const cache = new Map(), bad = new Set(); let downloads = 0, rej = {dark: 0, blur: 0, sky: 0, cover: 0};
  const getImg = async id => { if (cache.has(id)) { const v = cache.get(id); cache.delete(id); cache.set(id, v); return v } if (bad.has(id) || downloads >= MAXIMG) return null;
    try { downloads++; const j = await api(`https://graph.mapillary.com/${id}?fields=thumb_2048_url`); const r = await fetch(j.thumb_2048_url); const im = jpeg.decode(Buffer.from(await r.arrayBuffer()), {useTArray: true, maxMemoryUsageInMB: 1024});
      cache.set(id, im); if (cache.size > 30) cache.delete(cache.keys().next().value); return im } catch (e) { bad.add(id); return null } };
  newAtlas(); let n = 0;
  for (const {w, C} of picks) { if (downloads >= MAXIMG && !C.some(c => cache.has(c.id))) continue;
    const tw = clamp(Math.round(w.l * PXM), 16, 640), th = clamp(Math.round((w.y1 - w.y0) * PXM), 16, 512);
    let got = null;
    for (const c of C) { const img = await getImg(c.id); if (!img) continue; c.W = img.width; c.H = img.height;
      let ok = 0; const pix = new Uint8Array(tw * th * 4);
      for (let v = 0; v < th; v++) for (let u = 0; u < tw; u++) { const s2 = (u + .5) / tw, h = 1 - (v + .5) / th; const X = w.a[0] + (w.b[0] - w.a[0]) * s2, Z = w.a[1] + (w.b[1] - w.a[1]) * s2, Y = w.y0 + (w.y1 - w.y0) * h;
        const q = project(c, X, Y, Z), o = (v * tw + u) * 4; if (!q || q[0] < 0 || q[0] > 1 || q[1] < 0 || q[1] > 1) continue;
        const fx = q[0] * (img.width - 1), fy = q[1] * (img.height - 1), x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(img.width - 1, x0 + 1), y1 = Math.min(img.height - 1, y0 + 1), du = fx - x0, dv = fy - y0;
        for (let k = 0; k < 3; k++) { const P = (xx, yy) => img.data[(yy * img.width + xx) * 4 + k]; pix[o + k] = (P(x0, y0) * (1 - du) + P(x1, y0) * du) * (1 - dv) + (P(x0, y1) * (1 - du) + P(x1, y1) * du) * dv } pix[o + 3] = 255; ok++ }
      if (ok < tw * th * .75) { rej.cover++; continue }
      /* quality: daylight brightness, real detail (not motion blur), and no sky where the wall should be */
      let lum = 0, grad = 0, gn = 0, sky = 0; const Y = i => .3 * pix[i] + .59 * pix[i + 1] + .11 * pix[i + 2];
      for (let v = 0; v < th; v++) for (let u = 0; u < tw; u++) { const o = (v * tw + u) * 4; if (!pix[o + 3]) continue; const l = Y(o); lum += l;
        if (u + 1 < tw && pix[o + 7]) { grad += Math.abs(Y(o + 4) - l); gn++ } if (pix[o + 2] > pix[o] + 18 && pix[o + 2] > pix[o + 1] + 4 && l > 120) sky++ }
      lum /= ok; grad /= Math.max(1, gn);
      if (lum < 55 || lum > 225) { rej.dark++; continue } if (grad < 4.5) { rej.blur++; continue } if (sky > ok * .15) { rej.sky++; continue }
      got = {pix, ok, c}; break }
    if (!got) continue; const {pix, ok} = got;
    if (ax + tw > ATLAS) { ax = 0; ay += rowH; rowH = 0 } if (ay + th > ATLAS) { flush(); newAtlas() }
    let r = 0, g = 0, b = 0; for (let i = 0; i < tw * th; i++) if (pix[i * 4 + 3]) { r += pix[i * 4]; g += pix[i * 4 + 1]; b += pix[i * 4 + 2] } r /= ok; g /= ok; b /= ok;
    for (let v = 0; v < th; v++) for (let u = 0; u < tw; u++) { const o = (v * tw + u) * 4, A = ((ay + v) * ATLAS + ax + u) * 4; if (pix[o + 3]) { atlas.d[A] = pix[o]; atlas.d[A + 1] = pix[o + 1]; atlas.d[A + 2] = pix[o + 2] } else { atlas.d[A] = r; atlas.d[A + 1] = g; atlas.d[A + 2] = b } }
    FAC.push({a: w.a.map(v => +v.toFixed(2)), b: w.b.map(v => +v.toFixed(2)), n: w.n.map(v => +v.toFixed(3)), y0: +w.y0.toFixed(2), y1: +w.y1.toFixed(2), t: atlas.i, uv: [ax / ATLAS, ay / ATLAS, (ax + tw) / ATLAS, (ay + th) / ATLAS], img: got.c.id});
    ax += tw + 2; rowH = Math.max(rowH, th + 2);
    if (++n % 200 === 0) L('facades', n, 'downloads', downloads) }
  L('rejected', JSON.stringify(rej), 'downloads', downloads);
  flush();
  fs.writeFileSync(`${OUT}/facades.json`, JSON.stringify({generated: new Date().toISOString(), source: 'Mapillary contributors, CC BY-SA 4.0', atlases: ai + 1, size: ATLAS, facades: FAC}));
  L('facades written', FAC.length, 'atlases', ai + 1);
}

// ---------- main ----------
try {
  if (process.env.DRY) { const {W} = walls(); L('dry run, walls', W.length); throw new Error('dry run') }
  if (!TOKEN) throw new Error('MAPILLARY_TOKEN is not set');
  const raw = await survey(); const cams = raw.map(camera).filter(Boolean); L('photos with a usable pose', cams.length);
  const {W, blocked} = walls(); const picks = choose(W, cams, blocked); await render(picks);
} catch (e) { L('fatal', e.stack || e.message) }
fs.mkdirSync('data', {recursive: true}); fs.writeFileSync('data/mapillary-log.txt', log.join('\n') + '\n');
