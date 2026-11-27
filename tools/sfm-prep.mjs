// COLMAP facades, step 1: download the Mapillary photos around one block, and write
//   work/images/<id>.jpg   photos (1024 px)
//   work/pairs.txt         which photos to match (same sequence neighbours + nearby photos facing a similar way)
//   work/ref.txt           GPS positions in game metres (x east, y north, z up) for COLMAP's model_aligner
//   work/meta.json         per-photo metadata
// Env: MAPILLARY_TOKEN, CENTER="[x,z]" (game metres), RADIUS, MAXIMG.
import fs from 'node:fs';
import zlib from 'node:zlib';

const TOKEN = process.env.MAPILLARY_TOKEN;
const LAT0 = 60.1850, LON0 = 24.9760, KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KZ = 110540;
const PJ = (lat, lon) => [(lon - LON0) * KX, -(lat - LAT0) * KZ], UNPJ = (x, z) => [LAT0 - z / KZ, LON0 + x / KX];
const [CX, CZ] = JSON.parse(process.env.CENTER || '[230,232]'), RAD = +(process.env.RADIUS || 160), MAXIMG = +(process.env.MAXIMG || 450);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TB = zlib.gunzipSync(fs.readFileSync('data/terrain.bin')); const THL = TB.readUInt32LE(0), TH = JSON.parse(TB.slice(4, 4 + THL).toString());
const TA = new Int16Array(TB.buffer.slice(TB.byteOffset + 4 + THL, TB.byteOffset + TB.length));
const T = (x, z) => { const fi = (x - TH.x0) / TH.cs, fj = (z - TH.z0) / TH.cs, i = clamp(Math.floor(fi), 0, TH.nx - 2), j = clamp(Math.floor(fj), 0, TH.nz - 2), u = clamp(fi - i, 0, 1), v = clamp(fj - j, 0, 1), H = (a, b) => TA[b * TH.nx + a] * TH.unit;
  return (H(i, j) * (1 - u) + H(i + 1, j) * u) * (1 - v) + (H(i, j + 1) * (1 - u) + H(i + 1, j + 1) * u) * v };

async function api(url) { for (let k = 0; k < 4; k++) { try { const r = await fetch(url, {headers: {Authorization: 'OAuth ' + TOKEN}}); if (r.status === 429) { await new Promise(q => setTimeout(q, 3000 * (k + 1))); continue } if (!r.ok) throw new Error(r.status + ' ' + (await r.text()).slice(0, 200)); return await r.json() } catch (e) { if (k === 3) throw e; await new Promise(q => setTimeout(q, 1500)) } } }

const F = 'id,computed_geometry,computed_compass_angle,captured_at,camera_type,is_pano,sequence,camera_parameters,width,height';
const [s, w] = UNPJ(CX - RAD, CZ + RAD), [n, e] = UNPJ(CX + RAD, CZ - RAD);
const all = new Map();
for (let la = s; la < n; la += .0012) for (let lo = w; lo < e; lo += .0024) { const j = await api(`https://graph.mapillary.com/images?fields=${F}&bbox=${[lo, la, Math.min(e, lo + .0024), Math.min(n, la + .0012)].join(',')}&limit=2000`);
  for (const m of j.data || []) { if (!m.computed_geometry || m.is_pano || /spherical|equirect/.test(m.camera_type || '') || (m.captured_at || 0) < Date.UTC(2018, 0, 1)) continue;
    const [lon, lat] = m.computed_geometry.coordinates, [x, z] = PJ(lat, lon); if (Math.hypot(x - CX, z - CZ) > RAD) continue; all.set(m.id, {...m, x, z}) } }
console.log('photos in the block', all.size);
/* structure-from-motion needs overlapping consecutive frames: take whole sequences (newest and densest first),
   thinned to one frame per ~2.5 m along each sequence */
const seqs = new Map(); for (const m of all.values()) { if (!seqs.has(m.sequence)) seqs.set(m.sequence, []); seqs.get(m.sequence).push(m) }
const S = [...seqs.values()].map(L => { L.sort((a, b) => a.captured_at - b.captured_at); const K = []; let last = null; for (const m of L) { if (!last || Math.hypot(m.x - last.x, m.z - last.z) > 2.5) { K.push(m); last = m } } return K })
  .filter(L => L.length >= 6).sort((a, b) => (b.length * (1 + (b[0].captured_at - Date.UTC(2018, 0, 1)) / 3e11)) - (a.length * (1 + (a[0].captured_at - Date.UTC(2018, 0, 1)) / 3e11)));
let pick = []; for (const L of S) { if (pick.length + L.length > MAXIMG) continue; pick = pick.concat(L) }
console.log('sequences', S.length, 'used', new Set(pick.map(m => m.sequence)).size);
fs.mkdirSync('work/images', {recursive: true});
let ok = []; const q = pick.slice();
await Promise.all([1, 2, 3, 4, 5, 6].map(async () => { while (q.length) { const m = q.pop(); try { const j = await api(`https://graph.mapillary.com/${m.id}?fields=thumb_2048_url`); const r = await fetch(j.thumb_2048_url); fs.writeFileSync(`work/images/${m.id}.jpg`, Buffer.from(await r.arrayBuffer())); ok.push(m) } catch (e) {} } }));
console.log('downloaded', ok.length);
/* pairs: same sequence within 4 frames, and any two photos within 40 m whose headings differ by < 70 degrees */
const P = new Set(), add = (a, b) => { if (a.id === b.id) return; const k = a.id < b.id ? a.id + ' ' + b.id : b.id + ' ' + a.id; P.add(k) };
const bySeq = new Map(); for (const m of ok) { if (!bySeq.has(m.sequence)) bySeq.set(m.sequence, []); bySeq.get(m.sequence).push(m) }
for (const L of bySeq.values()) { L.sort((a, b) => a.captured_at - b.captured_at); for (let i = 0; i < L.length; i++) for (let k = 1; k <= 8 && i + k < L.length; k++) add(L[i], L[i + k]) }
for (const a of ok) { const nb = ok.filter(b => b !== a && Math.hypot(a.x - b.x, a.z - b.z) < 40 && Math.abs(((a.computed_compass_angle - b.computed_compass_angle + 540) % 360) - 180) < 70).sort((p, q) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(a.x - q.x, a.z - q.z)).slice(0, 25); for (const b of nb) add(a, b) }
fs.writeFileSync('work/pairs.txt', [...P].map(k => k.split(' ').map(id => id + '.jpg').join(' ')).join('\n') + '\n');
fs.writeFileSync('work/ref.txt', ok.map(m => `${m.id}.jpg ${m.x.toFixed(3)} ${(-m.z).toFixed(3)} ${(T(m.x, m.z) + 2).toFixed(3)}`).join('\n') + '\n');
fs.writeFileSync('work/exif.args', ok.map(m => { const f = (m.camera_parameters || [])[0]; return f > .2 && f < 3 ? `-FocalLengthIn35mmFormat=${Math.round(f * 36)}\n-overwrite_original\nwork/images/${m.id}.jpg\n-execute` : '' }).filter(Boolean).join('\n') + '\n');
fs.writeFileSync('work/meta.json', JSON.stringify({center: [CX, CZ], radius: RAD, photos: ok.map(m => ({id: m.id, x: m.x, z: m.z, t: m.captured_at, seq: m.sequence}))}));
console.log('pairs', P.size);
