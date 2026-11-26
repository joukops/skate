// Look at the building layers used by the city's 3D map viewer (3D Tiles).
import fs from 'node:fs';
const log=[];const L=(...a)=>{const m=a.join(' ');console.log(m);log.push(m)};
const base='https://kartta.hel.fi/3d/';
const app=await (await fetch(base+'app.config.json')).json();
const mod=await (await fetch(base+app.modules[0])).text();
const cfg=JSON.parse(mod);
const walk=(o,f)=>{if(o&&typeof o==='object'){f(o);for(const k in o)walk(o[k],f)}};
const layers=[];walk(cfg,o=>{if(typeof o.url==='string'&&/tileset\.json|datasource-data/.test(o.url))layers.push({name:o.name||o.title||'',type:o.type||'',url:o.url,props:JSON.stringify(o.properties||{}).slice(0,200)})});
for(const l of layers){const u=new URL(l.url.replace(/\/\/datasource/,'/datasource'),base).href;const tu=/tileset\.json$/.test(u)?u:u.replace(/\/?$/,'/tileset.json');
  L('LAYER',l.name,'|',l.type,'|',tu,'|',l.props);
  try{const r=await fetch(tu);const t=await r.text();if(!r.ok){L('  status',r.status);continue}const j=JSON.parse(t);
    L('  asset',JSON.stringify(j.asset),'gE',j.geometricError,'root bv',JSON.stringify(j.root.boundingVolume).slice(0,200),'children',(j.root.children||[]).length,'extUsed',JSON.stringify(j.extensionsUsed||[]),'props',JSON.stringify(j.properties||{}).slice(0,300));
    let n=j.root,depth=0;while(n.children&&n.children.length&&depth<30){n=n.children[0];depth++}
    const c=n.content&&(n.content.uri||n.content.url);L('  leaf depth',depth,'content',c,'bv',JSON.stringify(n.boundingVolume).slice(0,160));
    if(c){const cu=new URL(c,tu).href;const b=Buffer.from(await (await fetch(cu)).arrayBuffer());L('  content bytes',b.length,'magic',b.slice(0,4).toString());
      if(b.slice(0,4).toString()==='b3dm'||b.slice(0,4).toString()==='glTF'){let off=0;if(b.slice(0,4).toString()==='b3dm'){const ftj=b.readUInt32LE(12),ftb=b.readUInt32LE(16),btj=b.readUInt32LE(20),btb=b.readUInt32LE(24);L('  b3dm batch json',b.slice(28+ftj+ftb,28+ftj+ftb+Math.min(btj,600)).toString());off=28+ftj+ftb+btj+btb}
        const jl=b.readUInt32LE(off+12);const gj=JSON.parse(b.slice(off+20,off+20+jl).toString());L('  gltf extUsed',JSON.stringify(gj.extensionsUsed||[]),'meshes',gj.meshes&&gj.meshes.length,'images',(gj.images||[]).length,'materials',JSON.stringify((gj.materials||[]).slice(0,2)).slice(0,300),'attrs',JSON.stringify(gj.meshes&&gj.meshes[0].primitives[0].attributes))}}}
  catch(e){L('  error',e.message)}}
fs.mkdirSync('data',{recursive:true});fs.writeFileSync('data/tiles-log.txt',log.join('\n')+'\n');
