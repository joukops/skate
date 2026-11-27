// Photogrammetry mesh of the Helsinki waterfront for the game (City of Helsinki 3D map, "Mesh (2024)", CC BY 4.0).
// Downloads the 2024 reality mesh tiles over the waterfront zones at about MAXGE metres of geometric error,
// drops the mesh's own ground surface (the game keeps its terrain, paths and quays) and the Hanasaari
// construction site, aligns heights to the game terrain, and writes data/mesh/*.bin + *.jpg + index.json.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const draco3d = require('draco3d');
const jpeg = require('jpeg-js');

const SRC = 'https://kartta.hel.fi/3d/mesh/Helsinki_2024/tileset.json';
const LAT0 = 60.1850, LON0 = 24.9760, KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KZ = 110540;
const PJ = (lat, lon) => [(lon - LON0) * KX, -(lat - LAT0) * KZ];
const UNPJ = (x, z) => [LAT0 - z / KZ, LON0 + x / KX];
/* waterfront zones in game metres [x0, z0, x1, z1]: Merihaka-Hakaniemi, Kalasatama-Sompasaari-Hanasaari */
let ZONES = process.env.ZONES ? JSON.parse(process.env.ZONES) : null;   /* default: computed below from the terrain - 100 m cells within 120 m of the water */
const SITE = [[-525,572],[-582,515],[-602,418],[-548,352],[-512,276],[-484,240],[-450,282],[-405,309],[-350,352],[-334,368]];
const inPoly = (x, z, P) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > z) !== (P[j][1] > z) && x < (P[j][0] - P[i][0]) * (z - P[i][1]) / (P[j][1] - P[i][1]) + P[i][0]) c = !c; return c };
const inZone = (x, z) => ZONES.some(([a, b, c, d]) => x >= a && x <= c && z >= b && z <= d);
const MAXGE = +(process.env.MAXGE || 3);
const D2R = Math.PI / 180;
let R; function computeR() { let s = 90, w = 180, n = -90, e = -180; for (const [a, b, c, d] of ZONES) for (const [x, z] of [[a, b], [c, d]]) { const [la, lo] = UNPJ(x, z); s = Math.min(s, la); n = Math.max(n, la); w = Math.min(w, lo); e = Math.max(e, lo) } R = [w * D2R, s * D2R, e * D2R, n * D2R] }

const log = []; const L = (...a) => { const m = a.join(' '); console.log(m); log.push(m) };
const saveLog = () => fs.writeFileSync('data/mesh-convert-log.txt', log.join('\n') + '\n');
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
  let off = 0, rtc = [0, 0, 0]; if (buf.slice(0, 4).toString() === 'b3dm') { const a = buf.readUInt32LE(12), b = buf.readUInt32LE(16), c = buf.readUInt32LE(20), d = buf.readUInt32LE(24); try { const ft = JSON.parse(buf.slice(28, 28 + a).toString()); if (ft.RTC_CENTER) rtc = ft.RTC_CENTER } catch (e) {} off = 28 + a + b + c + d }
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
      for (let i = 0; i < n; i++) { const e = app(MM, P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); const [lat, lon, h] = ecef2lla(e[0] + rtc[0], e[1] + rtc[1], e[2] + rtc[2]); const [x, z] = PJ(lat, lon); xyz[i * 3] = x; xyz[i * 3 + 1] = h; xyz[i * 3 + 2] = z }
      let tex = null, color = [200, 196, 188]; const mat = gj.materials && gj.materials[pr.material];
      if (mat && mat.pbrMetallicRoughness) { const pb = mat.pbrMetallicRoughness; if (pb.baseColorFactor) color = pb.baseColorFactor.slice(0, 3).map(v => Math.round(Math.pow(v, 1 / 2.2) * 255));
        if (pb.baseColorTexture && d.TEXCOORD_0) { const t = gj.textures[pb.baseColorTexture.index]; const src = t.extensions && t.extensions.KHR_texture_basisu ? t.extensions.KHR_texture_basisu.source : t.source; const im = gj.images[src];
          try { const raw = bv(im.bufferView); if (im.mimeType === 'image/ktx2') { const img = ktx2rgba(raw); tex = jpeg.encode({data: Buffer.from(img.data), width: img.w, height: img.h}, 82).data } else if (im.mimeType === 'image/jpeg') tex = raw } catch (e) { L('  texture error', e.message) } } }
      prims.push({xyz, n, uv: d.TEXCOORD_0 ? d.TEXCOORD_0.a : null, idx: d.idx, fid, tex, color}) } }
  return prims }
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


// ---------- terrain (game heights) ----------
const TB = zlib.gunzipSync(fs.readFileSync('data/terrain.bin')); const THL = TB.readUInt32LE(0), TH0 = JSON.parse(TB.slice(4, 4 + THL).toString());
const TA = new Int16Array(TB.buffer.slice(TB.byteOffset + 4 + THL, TB.byteOffset + TB.length));
const T = (x, z) => { const fi = (x - TH0.x0) / TH0.cs, fj = (z - TH0.z0) / TH0.cs, i = Math.max(0, Math.min(TH0.nx - 2, Math.floor(fi))), j = Math.max(0, Math.min(TH0.nz - 2, Math.floor(fj))), u = Math.min(1, Math.max(0, fi - i)), v = Math.min(1, Math.max(0, fj - j)), H = (a, b) => TA[b * TH0.nx + a] * TH0.unit;
  return (H(i, j) * (1 - u) + H(i + 1, j) * u) * (1 - v) + (H(i, j + 1) * (1 - u) + H(i + 1, j + 1) * u) * v };

// ---------- main ----------
fs.mkdirSync('data', {recursive: true});
try {
  if (!ZONES) { ZONES = []; const Q = [-1150, 150, 320, 950], C = 100, isW = (x, z) => T(x, z) < -2.6;
    for (let z = Q[1]; z < Q[3]; z += C) for (let x = Q[0]; x < Q[2]; x += C) { let land = false, near = false;
      for (let a = 10; a < C; a += 20) for (let b = 10; b < C; b += 20) if (!isW(x + a, z + b)) land = true; if (!land) continue;
      for (let a = -120; a <= C + 120 && !near; a += 20) for (let b = -120; b <= C + 120 && !near; b += 20) if (isW(x + a, z + b)) near = true;
      if (near) ZONES.push([x, z, x + C, z + C]) }
    ZONES.push([-380, 40, -150, 260]) }   /* and the whole Hanasaari plant */
  computeR(); L('zones', ZONES.length);
  await initDecoders();
  const leaves = await walkTileset(SRC); L('mesh tiles in zones', leaves.length, 'at geometric error <=', MAXGE);
  const loaded = []; const hist = new Map();
  for (const leaf of leaves) { try { const prims = await readTile(leaf); loaded.push(prims);
      for (const p of prims) for (let t = 0; t < p.idx.length; t += 3) { const a = p.idx[t] * 3, b = p.idx[t + 1] * 3, c = p.idx[t + 2] * 3, X = p.xyz;
        const ux = X[b] - X[a], uy = X[b + 1] - X[a + 1], uz = X[b + 2] - X[a + 2], vx = X[c] - X[a], vy = X[c + 1] - X[a + 1], vz = X[c + 2] - X[a + 2], ny = uz * vx - ux * vz, nl = Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx);
        if (nl < 1e-6 || Math.abs(ny) / nl < .9) continue; const cx = (X[a] + X[b] + X[c]) / 3, cz = (X[a + 2] + X[b + 2] + X[c + 2]) / 3; if (!inZone(cx, cz)) continue;
        const d = Math.round(((X[a + 1] + X[b + 1] + X[c + 1]) / 3 - T(cx, cz)) * 5) / 5; hist.set(d, (hist.get(d) || 0) + nl) } }
    catch (e) { L('tile error', leaf.url, e.message); loaded.push([]) } }
  let datum = 0, best = -1; for (const [d, w] of hist) if (w > best) { best = w; datum = d }   /* the mesh ground is the most common level: that is the terrain */
  L('mesh ground sits', datum.toFixed(2), 'm above the game terrain value; using it as the offset');
  const dir = 'data/mesh'; fs.rmSync(dir, {recursive: true, force: true}); fs.mkdirSync(dir, {recursive: true});
  const index = []; let k = 0, dropped = 0, kept = 0;
  for (const prims of loaded) { const id = 'm' + (k++); if (!prims.length) continue;
    for (const p of prims) { const X = p.xyz, keep = [];
      for (let t = 0; t < p.idx.length; t += 3) { const a = p.idx[t] * 3, b = p.idx[t + 1] * 3, c = p.idx[t + 2] * 3; const cx = (X[a] + X[b] + X[c]) / 3, cz = (X[a + 2] + X[b + 2] + X[c + 2]) / 3;
        if (!inZone(cx, cz) || inPoly(cx, cz, SITE)) { dropped++; continue }
        const ux = X[b] - X[a], uy = X[b + 1] - X[a + 1], uz = X[b + 2] - X[a + 2], vx = X[c] - X[a], vy = X[c + 1] - X[a + 1], vz = X[c + 2] - X[a + 2], ny = uz * vx - ux * vz, nl = Math.hypot(uy * vz - uz * vy, ny, ux * vy - uy * vx);
        const top = Math.max(X[a + 1], X[b + 1], X[c + 1]) - datum - T(cx, cz);
        if (top < .8 && (nl < 1e-9 || Math.abs(ny) / nl > .55)) { dropped++; continue }   /* ground, water and low clutter: the game draws its own */
        if (top < -1.5) { dropped++; continue }
        keep.push(p.idx[t], p.idx[t + 1], p.idx[t + 2]) }
      /* keep only the vertices still used */
      const map = new Int32Array(p.n).fill(-1); let nn = 0; for (const v of keep) if (map[v] < 0) map[v] = nn++;
      const xyz = new Float64Array(nn * 3), uv = p.uv ? new Float32Array(nn * 2) : null;
      for (let i = 0; i < p.n; i++) { const j = map[i]; if (j < 0) continue; xyz[j * 3] = X[i * 3]; xyz[j * 3 + 1] = X[i * 3 + 1]; xyz[j * 3 + 2] = X[i * 3 + 2]; if (uv) { uv[j * 2] = p.uv[i * 2]; uv[j * 2 + 1] = p.uv[i * 2 + 1] } }
      p.xyz = xyz; p.uv = uv; p.n = nn; p.idx = Uint32Array.from(keep, v => map[v]); kept += keep.length / 3;
      if (p.tex && keep.length) { try { const im = jpeg.decode(p.tex, {useTArray: true, maxMemoryUsageInMB: 512}); p.tex = jpeg.encode({data: im.data, width: im.width, height: im.height}, 72).data } catch (e) {} } }
    const r = writeTile(dir, id, prims, datum, () => true); if (r) index.push(r) }
  fs.writeFileSync(dir + '/index.json', JSON.stringify({generated: new Date().toISOString(), source: 'City of Helsinki 3D map, Mesh (2024), CC BY 4.0', zones: ZONES, maxge: MAXGE, datum, tiles: index}));
  let bytes = 0; for (const f of fs.readdirSync(dir)) bytes += fs.statSync(dir + '/' + f).size;
  L('mesh done: files', index.length, 'triangles kept', kept, 'dropped', dropped, 'size MB', (bytes / 1e6).toFixed(1));
} catch (e) { L('fatal', e.stack) }
saveLog();
