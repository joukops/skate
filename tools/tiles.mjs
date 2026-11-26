// Convert the City of Helsinki's textured LOD2 building tiles (3D Tiles 1.1: glTF + Draco + KTX2)
// for the game area into data/tiles/*.bin (plain meshes in game coordinates) + *.jpg textures.
// Source: kartta.hel.fi/3d, "Rakennukset tekstuureilla (LOD2)", City of Helsinki, CC BY 4.0.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const draco3d = require('draco3d');
const jpeg = require('jpeg-js');

const SRC = 'https://kartta.hel.fi/3d/datasource-data/e5e7158a-52df-45a1-9be0-1be8f2828abd/tileset.json';
const BB = {s: 60.1680, w: 24.9370, n: 60.2085, e: 25.0170};
const LAT0 = 60.1850, LON0 = 24.9760, KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KZ = 110540;
const PJ = (lat, lon) => [(lon - LON0) * KX, -(lat - LAT0) * KZ];
const D2R = Math.PI / 180, R = [BB.w * D2R, BB.s * D2R, BB.e * D2R, BB.n * D2R];
const inPlantBox = (x, z) => x > -360 && x < -190 && z > 40 && z < 210;   // modelled by hand in the game
const OUT = 'data/tiles';
const MAXGE = +(process.env.MAXGE || 5.5);   // stop at ~300 m tiles (finer levels split the area into ~1600 files)
const log = []; const L = (...a) => { const m = a.join(' '); console.log(m); log.push(m) };

// ---------- helpers ----------
const mul = (a, b) => { const o = new Array(16).fill(0); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s } return o };
const I4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const app = (m, x, y, z) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
function ecef2lla(x, y, z) {   // WGS84, Bowring
  const a = 6378137, f = 1 / 298.257223563, b = a * (1 - f), e2 = f * (2 - f), ep2 = (a * a - b * b) / (b * b);
  const p = Math.hypot(x, y), th = Math.atan2(z * a, p * b), lon = Math.atan2(y, x);
  const lat = Math.atan2(z + ep2 * b * Math.sin(th) ** 3, p - e2 * a * Math.cos(th) ** 3);
  const N = a / Math.sqrt(1 - e2 * Math.sin(lat) ** 2), h = p / Math.cos(lat) - N;
  return [lat / D2R, lon / D2R, h] }
const hit = bv => { if (!bv) return true; if (bv.region) { const g = bv.region; return !(g[2] < R[0] || g[0] > R[2] || g[3] < R[1] || g[1] > R[3]) } return true };
async function get(url, type = 'json') { for (let t = 0; t < 4; t++) { try { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); return type === 'json' ? await r.json() : Buffer.from(await r.arrayBuffer()) } catch (e) { if (t === 3) throw e; await new Promise(r => setTimeout(r, 2000 * (t + 1))) } } }

// ---------- 1. walk the tileset ----------
const leaves = [];
async function visit(node, url, T, refine) {
  if (!hit(node.boundingVolume)) return;
  const M = node.transform ? mul(T, node.transform) : T; refine = node.refine || refine;
  const c = node.content && (node.content.uri || node.content.url);
  const kids = node.children || [];
  if (c && /\.json$/.test(c)) { const u = new URL(c, url).href; const sub = await get(u); await visit(sub.root, u, M, refine) }
  else if (c && (refine === 'ADD' || !kids.length || node.geometricError <= MAXGE)) { leaves.push({url: new URL(c, url).href, M, ge: node.geometricError, refine}); if (refine !== 'ADD') return }
  for (const k of kids) await visit(k, url, M, refine);
}

// ---------- 2. decoders ----------
let dm, basis;
async function initDecoders() {
  dm = await draco3d.createDecoderModule({});
  const dir = path.resolve(path.dirname(require.resolve('three')), '..') + '/examples/jsm/libs/basis/';
  const src = fs.readFileSync(dir + 'basis_transcoder.js', 'utf8');
  const BASIS = new Function('module', 'exports', src + '\n;return typeof BASIS!=="undefined"?BASIS:module.exports')({exports: {}}, {});
  basis = await BASIS({wasmBinary: fs.readFileSync(dir + 'basis_transcoder.wasm')});
  basis.initializeBasis();
}
function dracoDecode(buf, ext, jsonAcc) {
  const dec = new dm.Decoder(), db = new dm.DecoderBuffer(); db.Init(new Int8Array(buf.buffer, buf.byteOffset, buf.byteLength), buf.byteLength);
  const mesh = new dm.Mesh(), st = dec.DecodeBufferToMesh(db, mesh); if (!st.ok()) throw new Error('draco: ' + st.error_msg());
  const n = mesh.num_points(), out = {n};
  for (const [name, id] of Object.entries(ext.attributes)) {
    const att = dec.GetAttributeByUniqueId(mesh, id), nc = att.num_components(), arr = new dm.DracoFloat32Array();
    dec.GetAttributeFloatForAllPoints(mesh, att, arr); const f = new Float32Array(n * nc); for (let i = 0; i < n * nc; i++) f[i] = arr.GetValue(i); dm.destroy(arr); out[name] = {a: f, nc};
  }
  const nf = mesh.num_faces(), idx = new Uint32Array(nf * 3), ia = new dm.DracoInt32Array();
  for (let i = 0; i < nf; i++) { dec.GetFaceFromMesh(mesh, i, ia); idx[i * 3] = ia.GetValue(0); idx[i * 3 + 1] = ia.GetValue(1); idx[i * 3 + 2] = ia.GetValue(2) }
  dm.destroy(ia); dm.destroy(mesh); dm.destroy(db); dm.destroy(dec); out.idx = idx; return out }
function ktx2rgba(bytes) {
  const k = new basis.KTX2File(new Uint8Array(bytes)); if (!k.isValid()) { k.close(); k.delete(); throw new Error('bad ktx2') }
  const w = k.getWidth(), h = k.getHeight(); if (!k.startTranscoding()) throw new Error('ktx2 start');
  const fmt = 13 /* RGBA32 */, dst = new Uint8Array(k.getImageTranscodedSizeInBytes(0, 0, 0, fmt));
  if (!k.transcodeImage(dst, 0, 0, 0, fmt, 0, -1, -1)) throw new Error('ktx2 transcode'); k.close(); k.delete(); return {w, h, data: dst} }

// ---------- 3. convert one tile ----------
let totalTris = 0, totalTex = 0;
async function convert(leaf, id) {
  const buf = await get(leaf.url, 'bin');
  let off = 0; if (buf.slice(0, 4).toString() === 'b3dm') { const a = buf.readUInt32LE(12), b = buf.readUInt32LE(16), c = buf.readUInt32LE(20), d = buf.readUInt32LE(24); off = 28 + a + b + c + d }
  if (buf.slice(off, off + 4).toString() !== 'glTF') return null;
  const jl = buf.readUInt32LE(off + 12), gj = JSON.parse(buf.slice(off + 20, off + 20 + jl).toString()), bin = buf.slice(off + 20 + jl + 8);
  const bv = i => { const v = gj.bufferViews[i]; return bin.slice(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength) };
  const prims = []; let sx = 0, sz = 0, sn = 0;
  const nodes = (gj.nodes || []).filter(n => n.mesh !== undefined);
  for (const nd of nodes) {
    const NM = nd.matrix || I4, Y2Z = [1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1], MM = mul(leaf.M, mul(Y2Z, NM));
    for (const pr of gj.meshes[nd.mesh].primitives) {
      const ext = pr.extensions && pr.extensions.KHR_draco_mesh_compression; if (!ext) continue;
      const d = dracoDecode(bv(ext.bufferView), ext); const P = d.POSITION.a, n = d.n;
      const fid = d._FEATURE_ID_0 ? d._FEATURE_ID_0.a : null;
      const xyz = new Float64Array(n * 3);
      for (let i = 0; i < n; i++) { const e = app(MM, P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); const [lat, lon, h] = ecef2lla(e[0], e[1], e[2]); const [x, z] = PJ(lat, lon); xyz[i * 3] = x; xyz[i * 3 + 1] = h; xyz[i * 3 + 2] = z }
      // per building: ground = its lowest vertex; drop the hand-modelled power plant
      const feat = new Map(); for (let i = 0; i < n; i++) { const f = fid ? Math.round(fid[i]) : 0; let o = feat.get(f); if (!o) { o = {min: 1e9, sx: 0, sz: 0, c: 0}; feat.set(f, o) } o.min = Math.min(o.min, xyz[i * 3 + 1]); o.sx += xyz[i * 3]; o.sz += xyz[i * 3 + 2]; o.c++ }
      for (const o of feat.values()) o.drop = inPlantBox(o.sx / o.c, o.sz / o.c);
      for (let i = 0; i < n; i++) { const o = feat.get(fid ? Math.round(fid[i]) : 0); xyz[i * 3 + 1] -= o.min; sx += xyz[i * 3]; sz += xyz[i * 3 + 2]; sn++ }
      const keep = []; for (let t = 0; t < d.idx.length; t += 3) { const a = d.idx[t]; const o = feat.get(fid ? Math.round(fid[a]) : 0); if (!o.drop) keep.push(d.idx[t], d.idx[t + 1], d.idx[t + 2]) }
      let tex = null, color = [200, 196, 188];
      const mat = gj.materials && gj.materials[pr.material];
      if (mat && mat.pbrMetallicRoughness) { const pb = mat.pbrMetallicRoughness; if (pb.baseColorFactor) color = pb.baseColorFactor.slice(0, 3).map(v => Math.round(Math.pow(v, 1 / 2.2) * 255));
        if (pb.baseColorTexture && d.TEXCOORD_0) { const t = gj.textures[pb.baseColorTexture.index]; const src = t.extensions && t.extensions.KHR_texture_basisu ? t.extensions.KHR_texture_basisu.source : t.source; const im = gj.images[src];
          try { const raw = bv(im.bufferView); const img = im.mimeType === 'image/ktx2' ? ktx2rgba(raw) : null; if (img) { tex = {w: img.w, h: img.h, jpg: jpeg.encode({data: Buffer.from(img.data), width: img.w, height: img.h}, 82).data} } } catch (e) { L('  texture error', e.message) } } }
      prims.push({xyz, uv: d.TEXCOORD_0 ? d.TEXCOORD_0.a : null, idx: keep, tex, color, n});
    }
  }
  if (!prims.length || !sn) return null;
  const ox = sx / sn, oz = sz / sn;
  // binary: [u32 headerLen][header json][pad][blobs...]; blobs 4-byte aligned
  const blobs = [], head = {ox, oz, prims: []}; let pos = 0; const push = b => { const o = pos; blobs.push(b); pos += b.byteLength; const pad = (4 - pos % 4) % 4; if (pad) { blobs.push(Buffer.alloc(pad)); pos += pad } return o };
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  prims.forEach((p, k) => {
    if (!p.idx.length) return;
    const P16 = new Int16Array(p.n * 3); for (let i = 0; i < p.n; i++) { const x = p.xyz[i * 3], y = p.xyz[i * 3 + 1], z = p.xyz[i * 3 + 2]; x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
      P16[i * 3] = Math.max(-32768, Math.min(32767, Math.round((x - ox) * 10))); P16[i * 3 + 1] = Math.max(-32768, Math.min(32767, Math.round(y * 10))); P16[i * 3 + 2] = Math.max(-32768, Math.min(32767, Math.round((z - oz) * 10))) }
    const e = {n: p.n, ni: p.idx.length, color: p.color, pos: push(Buffer.from(P16.buffer))};
    if (p.uv && p.tex) { const U = new Uint16Array(p.n * 2); for (let i = 0; i < p.n * 2; i++) U[i] = Math.max(0, Math.min(65535, Math.round(p.uv[i] * 65535))); e.uv = push(Buffer.from(U.buffer)); const tn = id + '_' + k + '.jpg'; fs.writeFileSync(OUT + '/' + tn, p.tex.jpg); e.tex = tn; totalTex += p.tex.jpg.length }
    const big = p.n > 65535, IX = big ? new Uint32Array(p.idx) : new Uint16Array(p.idx); e.i32 = big; e.idx = push(Buffer.from(IX.buffer)); totalTris += p.idx.length / 3; head.prims.push(e) });
  if (!head.prims.length) return null;
  const hj = Buffer.from(JSON.stringify(head)); const hl = Buffer.alloc(4); const hpad = (4 - (4 + hj.length) % 4) % 4; hl.writeUInt32LE(hj.length + hpad);
  const file = id + '.bin'; fs.writeFileSync(OUT + '/' + file, Buffer.concat([hl, hj, Buffer.alloc(hpad, 32), ...blobs]));
  return {id, file, ox, oz, bbox: [x0, z0, x1, z1].map(v => Math.round(v))} }

// ---------- main ----------
fs.rmSync(OUT, {recursive: true, force: true}); fs.mkdirSync(OUT, {recursive: true});
try {
  const root = await get(SRC); L('tileset', JSON.stringify(root.asset), 'root refine', root.root.refine, 'transform', !!root.root.transform);
  await visit(root.root, SRC, I4, root.root.refine || 'REPLACE');
  L('leaf tiles in area', leaves.length, 'refine', [...new Set(leaves.map(l => l.refine))].join(','), 'geometricError', [...new Set(leaves.map(l => Math.round(l.ge)))].join(','));
  await initDecoders();
  const index = []; let k = 0;
  for (const leaf of leaves) { try { const r = await convert(leaf, 't' + (k++)); if (r) index.push(r); L('tile', k, '/', leaves.length, r ? 'ok bbox ' + r.bbox.join(',') : 'empty', leaf.url.split('/').slice(-3).join('/')) } catch (e) { L('tile', k, 'error', e.message) } }
  fs.writeFileSync(OUT + '/index.json', JSON.stringify({generated: new Date().toISOString(), source: 'City of Helsinki 3D city model, textured LOD2 buildings, CC BY 4.0', tiles: index}));
  L('done tiles', index.length, 'triangles', totalTris, 'texture MB', (totalTex / 1e6).toFixed(1));
} catch (e) { L('fatal', e.stack) }
fs.writeFileSync('data/tiles-convert-log.txt', log.join('\n') + '\n');
