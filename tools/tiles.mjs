// Build the game's 3D data from the City of Helsinki 3D map (kartta.hel.fi/3d, CC BY 4.0):
//   1. terrain  -> data/terrain.bin  (4 m height grid, game metres: street level at the shore ~ 0, sea -3)
//   2. buildings (textured LOD2)      -> data/tiles/*.bin + *.jpg   (absolute heights, sitting on the terrain)
//   3. bridges (LOD3)                 -> data/bridges/*.bin (+ *.jpg)
// The Hanasaari B power plant is written to its own files (flag "plant") so the game can choose.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const draco3d = require('draco3d');
const jpeg = require('jpeg-js');

const BASE = 'https://kartta.hel.fi/3d/';
const BB = {s: 60.1610, w: 24.9370, n: 60.1985, e: 25.0450};
const LAT0 = 60.1850, LON0 = 24.9760, KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KZ = 110540;
const PJ = (lat, lon) => [(lon - LON0) * KX, -(lat - LAT0) * KZ];
const [GX0, GZ0] = PJ(BB.n, BB.w), [GX1, GZ1] = PJ(BB.s, BB.e);
const D2R = Math.PI / 180, R = [BB.w * D2R, BB.s * D2R, BB.e * D2R, BB.n * D2R];
const inPlantBox = (x, z) => x > -360 && x < -190 && z > 40 && z < 210;
const MAXGE = +(process.env.MAXGE || 5.5);
const log = []; const L = (...a) => { const m = a.join(' '); console.log(m); log.push(m) };
const saveLog = () => fs.writeFileSync('data/tiles-convert-log.txt', log.join('\n') + '\n');

// ---------- helpers ----------
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s } return o };
const I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const app = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
function ecef2lla(x, y, z) {
  const a = 6378137, f = 1 / 298.257223563, b = a * (1 - f), e2 = f * (2 - f), ep2 = (a * a - b * b) / (b * b);
  const p = Math.hypot(x, y), th = Math.atan2(z * a, p * b), lon = Math.atan2(y, x);
  const lat = Math.atan2(z + ep2 * b * Math.sin(th) ** 3, p - e2 * a * Math.cos(th) ** 3);
  const N = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2), h = p / Math.cos(lat) - N;
  return [lat / D2R, lon / D2R, h] }
const hit = bv => { if (!bv) return true; if (bv.region) { const g = bv.region; return !(g[2] < R[0] || g[0] > R[2] || g[3] < R[1] || g[1] > R[3]) } return true };
async function get(url, type = 'json', headers) { for (let t = 0; t < 4; t++) { try { const r = await fetch(url, {headers}); if (r.status === 404) return null; if (!r.ok) throw new Error('HTTP ' + r.status); return type === 'json' ? await r.json() : Buffer.from(await r.arrayBuffer()) } catch (e) { if (t === 3) throw e; await new Promise(r => setTimeout(r, 1500 * (t + 1))) } } }

// ---------- 0. find the layers in the viewer configuration ----------
async function findLayers() {
  const appc = await get(BASE + 'app.config.json'); const layers = [];
  for (const m of appc.modules || []) { const cfg = await get(new URL(m, BASE).href); const walk = o => { if (o && typeof o === 'object') { if (typeof o.url === 'string' && o.type) layers.push({name: o.name || '', type: o.type, url: new URL(o.url, BASE).href}); for (const k in o) walk(o[k]) } }; walk(cfg) }
  for (const l of layers) L('layer', l.type, l.name, l.url);
  return layers }

// ---------- 1. terrain (Cesium quantized-mesh or heightmap) ----------
const CS = 4, TNX = Math.ceil((GX1 - GX0) / CS) + 1, TNZ = Math.ceil((GZ1 - GZ0) / CS) + 1;
let TH = null;
function zz(v) { return (v >> 1) ^ (-(v & 1)) }
function decodeQM(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const minH = dv.getFloat32(24, true), maxH = dv.getFloat32(28, true); let o = 88;
  const n = dv.getUint32(o, true); o += 4; const U = new Uint16Array(n), V = new Uint16Array(n), Hh = new Uint16Array(n);
  let u = 0, v = 0, h = 0; for (let i = 0; i < n; i++) { u += zz(dv.getUint16(o + i * 2, true)); U[i] = u } o += n * 2;
  for (let i = 0; i < n; i++) { v += zz(dv.getUint16(o + i * 2, true)); V[i] = v } o += n * 2;
  for (let i = 0; i < n; i++) { h += zz(dv.getUint16(o + i * 2, true)); Hh[i] = h } o += n * 2;
  const big = n > 65536; if (big) { if (o % 4) o += 4 - o % 4 } else if (o % 2) o += 1;
  const tc = dv.getUint32(o, true); o += 4; const idx = new Uint32Array(tc * 3); let hi = 0;
  for (let i = 0; i < tc * 3; i++) { const c = big ? dv.getUint32(o + i * 4, true) : dv.getUint16(o + i * 2, true); idx[i] = hi - c; if (c === 0) hi++ }
  const H = new Float32Array(n); for (let i = 0; i < n; i++) H[i] = minH + Hh[i] / 32767 * (maxH - minH);
  return {U, V, H, idx} }
function rasterTri(ax, az, ah, bx, bz, bh, cx, cz, ch) {
  const gx = x => (x - GX0) / CS, gz = z => (z - GZ0) / CS; const x0 = Math.max(0, Math.floor(Math.min(gx(ax), gx(bx), gx(cx)))), x1 = Math.min(TNX - 1, Math.ceil(Math.max(gx(ax), gx(bx), gx(cx))));
  const z0 = Math.max(0, Math.floor(Math.min(gz(az), gz(bz), gz(cz)))), z1 = Math.min(TNZ - 1, Math.ceil(Math.max(gz(az), gz(bz), gz(cz))));
  const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz); if (Math.abs(d) < 1e-9) return;
  for (let j = z0; j <= z1; j++) for (let i = x0; i <= x1; i++) { const x = GX0 + i * CS, z = GZ0 + j * CS;
    const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, l3 = 1 - l1 - l2;
    if (l1 >= -1e-6 && l2 >= -1e-6 && l3 >= -1e-6) TH[j * TNX + i] = l1 * ah + l2 * bh + l3 * ch } }
async function buildTerrain(layer) {
  let base = layer.url.replace(/layer\.json$/, ''); if (!base.endsWith('/')) base += '/';
  const lj = await get(base + 'layer.json'); if (!lj) throw new Error('no layer.json at ' + base);
  L('terrain', 'format', lj.format, 'scheme', lj.scheme, 'projection', lj.projection, 'maxzoom', lj.maxzoom, 'ext', JSON.stringify(lj.extensions || []), 'tiles', JSON.stringify(lj.tiles));
  const avail = lj.available || []; let Z = Math.min(lj.maxzoom || avail.length - 1, 17);
  const tileX = lon => Math.floor((lon + 180) / (360 / 2 ** (Z + 1))), tileY = lat => Math.floor((lat + 90) / (180 / 2 ** Z));
  const has = (z, x, y) => !avail.length || (avail[z] || []).some(r => x >= r.startX && x <= r.endX && y >= r.startY && y <= r.endY);
  while (Z > 10 && !has(Z, tileX((BB.w + BB.e) / 2), tileY((BB.s + BB.n) / 2))) Z--;
  const tx0 = tileX(BB.w), tx1 = tileX(BB.e), ty0 = tileY(BB.s), ty1 = tileY(BB.n); L('terrain zoom', Z, 'tiles', (tx1 - tx0 + 1) * (ty1 - ty0 + 1));
  TH = new Float32Array(TNX * TNZ).fill(NaN);
  const tmpl = lj.tiles[0]; let done = 0, fail = 0;
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const url = new URL(tmpl.replace('{z}', Z).replace('{x}', tx).replace('{y}', ty).replace('{version}', lj.version || '1.0.0'), base).href;
    let buf; try { buf = await get(url, 'bin', {Accept: 'application/vnd.quantized-mesh,application/octet-stream;q=0.9,*/*;q=0.01'}) } catch (e) { fail++; continue }
    if (!buf) { fail++; continue }
    if (buf[0] === 0x1f && buf[1] === 0x8b) buf = zlib.gunzipSync(buf);
    const w = -180 + tx * 360 / 2 ** (Z + 1), e = w + 360 / 2 ** (Z + 1), s = -90 + ty * 180 / 2 ** Z, n = s + 180 / 2 ** Z;
    if ((lj.format || '').startsWith('heightmap')) { for (let j = 0; j < 65; j++) for (let i = 0; i < 65; i++) { const hgt = buf.readUInt16LE((j * 65 + i) * 2) / 5 - 1000; const [x, z] = PJ(n - j / 64 * (n - s), w + i / 64 * (e - w)); const gi = Math.round((x - GX0) / CS), gj = Math.round((z - GZ0) / CS); if (gi >= 0 && gj >= 0 && gi < TNX && gj < TNZ) TH[gj * TNX + gi] = hgt } }
    else { const q = decodeQM(buf); const P = []; for (let i = 0; i < q.U.length; i++) P.push(PJ(s + q.V[i] / 32767 * (n - s), w + q.U[i] / 32767 * (e - w)));
      for (let t = 0; t < q.idx.length; t += 3) { const a = q.idx[t], b = q.idx[t + 1], c = q.idx[t + 2]; rasterTri(P[a][0], P[a][1], q.H[a], P[b][0], P[b][1], q.H[b], P[c][0], P[c][1], q.H[c]) } }
    done++ }
  for (let pass = 0; pass < 80; pass++) { let left = 0; for (let j = 0; j < TNZ; j++) for (let i = 0; i < TNX; i++) { const k = j * TNX + i; if (!isNaN(TH[k])) continue; let s2 = 0, c = 0; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < TNX && jj < TNZ && !isNaN(TH[jj * TNX + ii])) { s2 += TH[jj * TNX + ii]; c++ } } if (c) TH[k] = s2 / c; else left++ } if (!left) break }
  const sorted = Float32Array.from(TH.filter(v => !isNaN(v))).sort(); const pct = p => sorted[Math.floor(p * (sorted.length - 1))];
  L('terrain tiles', done, 'missing', fail, 'heights (source datum) p1', pct(.01).toFixed(2), 'p5', pct(.05).toFixed(2), 'p25', pct(.25).toFixed(2), 'p50', pct(.5).toFixed(2), 'p95', pct(.95).toFixed(2), 'max', pct(1).toFixed(2));
  const lo = sorted.slice(0, Math.floor(sorted.length * .3)); const hist = new Map(); for (const v of lo) { const k = Math.round(v * 5) / 5; hist.set(k, (hist.get(k) || 0) + 1) }
  let sea = pct(.05), best = 0; for (const [k, c] of hist) if (c > best) { best = c; sea = k }
  L('sea surface (source datum)', sea);
  return sea }
const tAt = (x, z) => { const fi = (x - GX0) / CS, fj = (z - GZ0) / CS, i = Math.max(0, Math.min(TNX - 2, Math.floor(fi))), j = Math.max(0, Math.min(TNZ - 2, Math.floor(fj))), a = fi - i, b = fj - j; const H = TH;
  return (H[j * TNX + i] * (1 - a) + H[j * TNX + i + 1] * a) * (1 - b) + (H[(j + 1) * TNX + i] * (1 - a) + H[(j + 1) * TNX + i + 1] * a) * b };

// ---------- 2. 3D tiles (buildings / bridges) ----------
async function walkTileset(src) { const leaves = [];
  async function visit(node, url, T, refine) {
    if (!hit(node.boundingVolume)) return;
    const M = node.transform ? mul(T, node.transform) : T; refine = node.refine || refine;
    const c = node.content && (node.content.uri || node.content.url); const kids = node.children || [];
    if (c && /\.json$/.test(c)) { const u = new URL(c, url).href; const sub = await get(u); if (sub) await visit(sub.root, u, M, refine) }
    else if (c && (refine === 'ADD' || !kids.length || node.geometricError <= MAXGE)) { leaves.push({url: new URL(c, url).href, M, ge: node.geometricError, refine}); if (refine !== 'ADD') return }
    for (const k of kids) await visit(k, url, M, refine) }
  const root = await get(src); await visit(root.root, src, I4, root.root.refine || 'REPLACE'); return leaves }
let dm, basis;
async function initDecoders() {
  dm = await draco3d.createDecoderModule({});
  const dir = path.resolve(path.dirname(require.resolve('three')), '..') + '/examples/jsm/libs/basis/';
  const src = fs.readFileSync(dir + 'basis_transcoder.js', 'utf8'); const mod = {exports: {}};
  const BASIS = new Function('module', 'exports', 'require', '__filename', '__dirname', src + '\n;return typeof BASIS!=="undefined"?BASIS:module.exports')(mod, mod.exports, require, dir + 'basis_transcoder.js', dir);
  basis = await BASIS({wasmBinary: fs.readFileSync(dir + 'basis_transcoder.wasm')}); basis.initializeBasis() }
function dracoDecode(buf, ext) {
  const dec = new dm.Decoder(), db = new dm.DecoderBuffer(); db.Init(new Int8Array(buf.buffer, buf.byteOffset, buf.byteLength), buf.byteLength);
  const mesh = new dm.Mesh(), st = dec.DecodeBufferToMesh(db, mesh); if (!st.ok()) throw new Error('draco: ' + st.error_msg());
  const n = mesh.num_points(), out = {n};
  for (const [name, id] of Object.entries(ext.attributes)) { const att = dec.GetAttributeByUniqueId(mesh, id), nc = att.num_components(), arr = new dm.DracoFloat32Array();
    dec.GetAttributeFloatForAllPoints(mesh, att, arr); const f = new Float32Array(n * nc); for (let i = 0; i < n * nc; i++) f[i] = arr.GetValue(i); dm.destroy(arr); out[name] = {a: f, nc} }
  const nf = mesh.num_faces(), idx = new Uint32Array(nf * 3), ia = new dm.DracoInt32Array();
  for (let i = 0; i < nf; i++) { dec.GetFaceFromMesh(mesh, i, ia); idx[i * 3] = ia.GetValue(0); idx[i * 3 + 1] = ia.GetValue(1); idx[i * 3 + 2] = ia.GetValue(2) }
  dm.destroy(ia); dm.destroy(mesh); dm.destroy(db); dm.destroy(dec); out.idx = idx; return out }
function plainAttr(gj, bin, acc) { const a = gj.accessors[acc], v = gj.bufferViews[a.bufferView], nc = {SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4}[a.type], off = (v.byteOffset || 0) + (a.byteOffset || 0);
  const T = {5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array}[a.componentType]; const stride = v.byteStride ? v.byteStride / T.BYTES_PER_ELEMENT : nc;
  const raw = Buffer.from(bin.subarray(off, off + ((a.count - 1) * stride + nc) * T.BYTES_PER_ELEMENT)); const src = new T(raw.buffer, raw.byteOffset, (a.count - 1) * stride + nc), out = new Float32Array(a.count * nc);
  for (let i = 0; i < a.count; i++) for (let k = 0; k < nc; k++) out[i * nc + k] = src[i * stride + k]; return {a: out, nc} }
function ktx2rgba(bytes) { const k = new basis.KTX2File(new Uint8Array(bytes)); if (!k.isValid()) { k.close(); k.delete(); throw new Error('bad ktx2') }
  const w = k.getWidth(), h = k.getHeight(); if (!k.startTranscoding()) throw new Error('ktx2 start'); const fmt = 13, dst = new Uint8Array(k.getImageTranscodedSizeInBytes(0, 0, 0, fmt));
  if (!k.transcodeImage(dst, 0, 0, 0, fmt, 0, -1, -1)) throw new Error('ktx2 transcode'); k.close(); k.delete(); return {w, h, data: dst} }
async function readTile(leaf) {
  const buf = await get(leaf.url, 'bin'); if (!buf) return [];
  let off = 0; if (buf.slice(0, 4).toString() === 'b3dm') { const a = buf.readUInt32LE(12), b = buf.readUInt32LE(16), c = buf.readUInt32LE(20), d = buf.readUInt32LE(24); off = 28 + a + b + c + d }
  if (buf.slice(off, off + 4).toString() !== 'glTF') return [];
  const jl = buf.readUInt32LE(off + 12), gj = JSON.parse(buf.slice(off + 20, off + 20 + jl).toString()), bin = buf.slice(off + 20 + jl + 8);
  const bv = i => { const v = gj.bufferViews[i]; return bin.slice(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength) };
  const prims = [];
  for (const nd of (gj.nodes || []).filter(n => n.mesh !== undefined)) {
    const MM = mul(leaf.M, mul([1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1], nd.matrix || I4));
    for (const pr of gj.meshes[nd.mesh].primitives) {
      const ext = pr.extensions && pr.extensions.KHR_draco_mesh_compression; let d;
      if (ext) d = dracoDecode(bv(ext.bufferView), ext);
      else { d = {}; for (const [k, a] of Object.entries(pr.attributes)) d[k] = plainAttr(gj, bin, a); d.n = d.POSITION.a.length / 3; d.idx = pr.indices !== undefined ? Uint32Array.from(plainAttr(gj, bin, pr.indices).a) : Uint32Array.from({length: d.n}, (_, i) => i) }
      const P = d.POSITION.a, n = d.n, fid = d._FEATURE_ID_0 ? d._FEATURE_ID_0.a : null, xyz = new Float64Array(n * 3);
      for (let i = 0; i < n; i++) { const e = app(MM, P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); const [lat, lon, h] = ecef2lla(e[0], e[1], e[2]); const [x, z] = PJ(lat, lon); xyz[i * 3] = x; xyz[i * 3 + 1] = h; xyz[i * 3 + 2] = z }
      let tex = null, color = [200, 196, 188]; const mat = gj.materials && gj.materials[pr.material];
      if (mat && mat.pbrMetallicRoughness) { const pb = mat.pbrMetallicRoughness; if (pb.baseColorFactor) color = pb.baseColorFactor.slice(0, 3).map(v => Math.round(Math.pow(v, 1 / 2.2) * 255));
        if (pb.baseColorTexture && d.TEXCOORD_0) { const t = gj.textures[pb.baseColorTexture.index]; const src = t.extensions && t.extensions.KHR_texture_basisu ? t.extensions.KHR_texture_basisu.source : t.source; const im = gj.images[src];
          try { const raw = bv(im.bufferView); if (im.mimeType === 'image/ktx2') { const img = ktx2rgba(raw); tex = jpeg.encode({data: Buffer.from(img.data), width: img.w, height: img.h}, 82).data } else if (im.mimeType === 'image/jpeg') tex = raw } catch (e) { L('  texture error', e.message) } } }
      prims.push({xyz, n, uv: d.TEXCOORD_0 ? d.TEXCOORD_0.a : null, idx: d.idx, fid, tex, color}) } }
  return prims }
function features(p) { const m = new Map(); for (let i = 0; i < p.n; i++) { const f = p.fid ? Math.round(p.fid[i]) : 0; let o = m.get(f); if (!o) { o = {min: 1e9, sx: 0, sz: 0, c: 0, mx: 0, mz: 0}; m.set(f, o) } const y = p.xyz[i * 3 + 1]; if (y < o.min) { o.min = y; o.mx = p.xyz[i * 3]; o.mz = p.xyz[i * 3 + 2] } o.sx += p.xyz[i * 3]; o.sz += p.xyz[i * 3 + 2]; o.c++ } for (const o of m.values()) { o.cx = o.sx / o.c; o.cz = o.sz / o.c } return m }
function writeTile(dir, id, prims, offset, keepTri) {
  const head = {ox: 0, oz: 0, prims: []}; let sx = 0, sz = 0, sn = 0; for (const p of prims) for (let i = 0; i < p.n; i++) { sx += p.xyz[i * 3]; sz += p.xyz[i * 3 + 2]; sn++ } if (!sn) return null; head.ox = sx / sn; head.oz = sz / sn;
  const blobs = []; let pos = 0; const push = b => { const o = pos; blobs.push(b); pos += b.byteLength; const pad = (4 - pos % 4) % 4; if (pad) { blobs.push(Buffer.alloc(pad)); pos += pad } return o };
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, tris = 0;
  prims.forEach((p, k) => { const idx = []; for (let t = 0; t < p.idx.length; t += 3) if (keepTri(p, p.idx[t])) idx.push(p.idx[t], p.idx[t + 1], p.idx[t + 2]); if (!idx.length) return;
    const P16 = new Int16Array(p.n * 3); for (let i = 0; i < p.n; i++) { const x = p.xyz[i * 3], y = p.xyz[i * 3 + 1] - offset, z = p.xyz[i * 3 + 2]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
      P16[i * 3] = Math.max(-32768, Math.min(32767, Math.round((x - head.ox) * 10))); P16[i * 3 + 1] = Math.max(-32768, Math.min(32767, Math.round(y * 10))); P16[i * 3 + 2] = Math.max(-32768, Math.min(32767, Math.round((z - head.oz) * 10))) }
    const e = {n: p.n, ni: idx.length, color: p.color, pos: push(Buffer.from(P16.buffer))};
    if (p.uv && p.tex) { const U = new Uint16Array(p.n * 2); for (let i = 0; i < p.n * 2; i++) U[i] = Math.max(0, Math.min(65535, Math.round(p.uv[i] * 65535))); e.uv = push(Buffer.from(U.buffer)); const tn = id + '_' + k + '.jpg'; fs.writeFileSync(dir + '/' + tn, p.tex); e.tex = tn }
    const big = p.n > 65535, IX = big ? new Uint32Array(idx) : new Uint16Array(idx); e.i32 = big; e.idx = push(Buffer.from(IX.buffer)); tris += idx.length / 3; head.prims.push(e) });
  if (!head.prims.length) return null;
  const hj = Buffer.from(JSON.stringify(head)); const hpad = (4 - (4 + hj.length) % 4) % 4; const hl = Buffer.alloc(4); hl.writeUInt32LE(hj.length + hpad);
  fs.writeFileSync(dir + '/' + id + '.bin', Buffer.concat([hl, hj, Buffer.alloc(hpad, 32), ...blobs]));
  return {id, file: id + '.bin', ox: head.ox, oz: head.oz, bbox: [x0, z0, x1, z1].map(Math.round), tris} }

// ---------- main ----------
fs.mkdirSync('data', {recursive: true});
try {
  const layers = await findLayers();
  const pick = re => layers.find(l => re.test(l.name)) || layers.find(l => re.test(l.url));
  const terr = layers.find(l => /terrain/i.test(l.type)) || pick(/maasto|terrain|korkeus/i);
  const bld = pick(/^Rakennukset_LOD2_tekstuureilla$/) || pick(/Rakennukset.*tekstuur/i);
  const brg = layers.find(l => /sillat|silta|bridge/i.test(l.name) && /lod3/i.test(l.name) && /Tileset/i.test(l.type)) || layers.find(l => /sillat|silta|bridge/i.test(l.name) && /Tileset/i.test(l.type));
  L('using terrain', terr && terr.url, '| buildings', bld && bld.url, '| bridges', brg && brg.name, brg && brg.url);
  const sea = await buildTerrain(terr);
  const GAME = v => v - sea - 3;   // the sea at -3: Helsinki waterfronts are ~3 m above sea level
  { const head = Buffer.from(JSON.stringify({x0: GX0, z0: GZ0, cs: CS, nx: TNX, nz: TNZ, unit: 0.01, source: 'City of Helsinki 3D map terrain, CC BY 4.0', sea}));
    const H16 = new Int16Array(TNX * TNZ); for (let i = 0; i < H16.length; i++) H16[i] = Math.max(-32768, Math.min(32767, Math.round(GAME(TH[i]) * 100)));
    const hl = Buffer.alloc(4); const pad = (4 - (4 + head.length) % 4) % 4; hl.writeUInt32LE(head.length + pad);
    fs.writeFileSync('data/terrain.bin', zlib.gzipSync(Buffer.concat([hl, head, Buffer.alloc(pad, 32), Buffer.from(H16.buffer)]), {level: 9}));
    let lo = 1e9, hi = -1e9; for (const v of H16) { lo = Math.min(lo, v); hi = Math.max(hi, v) } L('terrain written', TNX + 'x' + TNZ, 'game height range', lo / 100, hi / 100) }
  saveLog();
  await initDecoders();
  let bldDatum = null;
  for (const [kind, layer, dir] of [['buildings', bld, 'data/tiles'], ['bridges', brg, 'data/bridges']]) {
    if (!layer) { L(kind, 'layer not found'); continue }
    const leaves = await walkTileset(layer.url); L(kind, 'tiles in area', leaves.length);
    const diffs = [], loaded = [];
    for (const leaf of leaves) { try { const prims = await readTile(leaf); loaded.push(prims); for (const p of prims) for (const o of features(p).values()) if (o.mx > GX0 && o.mx < GX1 && o.mz > GZ0 && o.mz < GZ1) diffs.push(o.min - tAt(o.mx, o.mz)) } catch (e) { L(kind, 'tile error', e.message); loaded.push([]) } }
    diffs.sort((a, b) => a - b); const med = diffs.length ? diffs[Math.floor(diffs.length / 2)] : 0;
    const datum = kind === 'buildings' || bldDatum === null ? med : bldDatum; if (kind === 'buildings') bldDatum = med;
    L(kind, 'height of lowest point above terrain: median', med.toFixed(2), 'p10', (diffs[Math.floor(diffs.length * .1)] || 0).toFixed(2), 'p90', (diffs[Math.floor(diffs.length * .9)] || 0).toFixed(2), 'using', datum.toFixed(2));
    const off = sea + 3 + datum;
    fs.rmSync(dir, {recursive: true, force: true}); fs.mkdirSync(dir, {recursive: true});
    const index = []; let k = 0;
    for (const prims of loaded) { const id = (kind === 'buildings' ? 't' : 'b') + (k++); if (!prims.length) continue;
      const fm = prims.map(features); const isPlant = (p, i) => { if (kind !== 'buildings') return false; const f = fm[prims.indexOf(p)].get(p.fid ? Math.round(p.fid[i]) : 0); return inPlantBox(f.cx, f.cz) };
      const r = writeTile(dir, id, prims, off, (p, i) => !isPlant(p, i)); if (r) index.push(r);
      if (kind === 'buildings') { const rp = writeTile(dir, id + 'p', prims, off, (p, i) => isPlant(p, i)); if (rp) { rp.plant = true; index.push(rp) } } }
    fs.writeFileSync(dir + '/index.json', JSON.stringify({generated: new Date().toISOString(), source: 'City of Helsinki 3D map (' + layer.name + '), CC BY 4.0', tiles: index}));
    L(kind, 'done files', index.length, 'triangles', index.reduce((a, t) => a + t.tris, 0)); saveLog() }
} catch (e) { L('fatal', e.stack) }
saveLog();
