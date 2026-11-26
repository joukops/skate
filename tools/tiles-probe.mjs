// Look at the building layers used by the city's 3D map viewer (3D Tiles).
import fs from 'node:fs';
const log=[];const L=(...a)=>{const m=a.join(' ');console.log(m);log.push(m)};
const base='https://kartta.hel.fi/3d/';
const app=await (await fetch(base+'app.config.json')).json();
const mod=await (await fetch(base+app.modules[0])).text();
const cfg=JSON.parse(mod);
const walk=(o,f)=>{if(o&&typeof o==='object'){f(o);for(const k in o)walk(o[k],f)}};
const layers=[];walk(cfg,o=>{if(typeof o.url==='string'&&/tileset\.json|datasource-data/.test(o.url))layers.push({name:o.name||o.title||'',type:o.type||'',url:o.url,props:JSON.stringify(o.properties||{}).slice(0,200)})});
for(const l of layers.filter(l=>/LOD2|puut/.test(l.name)&&!/puretut/.test(l.name))){const u=new URL(l.url.replace(/\/\/datasource/,'/datasource'),base).href;const tu=/tileset\.json$/.test(u)?u:u.replace(/\/?$/,'/tileset.json');
  L('LAYER',l.name,'|',l.type,'|',tu,'|',l.props);
  try{const r=await fetch(tu);const t=await r.text();if(!r.ok){L('  status',r.status);continue}const j=JSON.parse(t);
    L('  asset',JSON.stringify(j.asset),'gE',j.geometricError,'root bv',JSON.stringify(j.root.boundingVolume).slice(0,200),'children',(j.root.children||[]).length,'extUsed',JSON.stringify(j.extensionsUsed||[]),'props',JSON.stringify(j.properties||{}).slice(0,300));
    /* descend through nested tilesets toward Kalasatama (60.185 N, 24.976 E) until binary content */
    const tgt=[24.976*Math.PI/180,60.185*Math.PI/180];const inside=bv=>bv&&bv.region?tgt[0]>=bv.region[0]&&tgt[0]<=bv.region[2]&&tgt[1]>=bv.region[1]&&tgt[1]<=bv.region[3]:true;
    let node=j.root,url=tu,steps=0;
    while(steps++<25){const kids=(node.children||[]).filter(c=>inside(c.boundingVolume));const c=node.content&&(node.content.uri||node.content.url);
      if(c&&/\.json$/.test(c)&&!kids.length){url=new URL(c,url).href;const sub=await (await fetch(url)).json();L('   sub',url.replace(base,''),'gE',(sub.geometricError??(sub.root&&sub.root.geometricError)),'kids',(sub.root.children||[]).length);node=sub.root;continue}
      if(kids.length){node=kids.sort((a,b)=>(a.geometricError||0)-(b.geometricError||0))[0];continue}
      if(c){const cu=new URL(c,url).href;const r=await fetch(cu);const buf=Buffer.from(await r.arrayBuffer());const mg=buf.slice(0,4).toString();L('   LEAF',cu.replace(base,''),'bytes',buf.length,'magic',mg,'gE',node.geometricError,'bv',JSON.stringify(node.boundingVolume).slice(0,120));
        let off=-1;if(mg==='b3dm'){const ftj=buf.readUInt32LE(12),ftb=buf.readUInt32LE(16),btj=buf.readUInt32LE(20),btb=buf.readUInt32LE(24);L('   featureTable',buf.slice(28,28+ftj).toString().slice(0,300));L('   batch',buf.slice(28+ftj+ftb,28+ftj+ftb+btj).toString().slice(0,500));off=28+ftj+ftb+btj+btb}else if(mg==='glTF')off=0;
        if(off>=0){const jl=buf.readUInt32LE(off+12);const gj=JSON.parse(buf.slice(off+20,off+20+jl).toString());L('   gltf extUsed',JSON.stringify(gj.extensionsUsed||[]),'extReq',JSON.stringify(gj.extensionsRequired||[]),'meshes',(gj.meshes||[]).length,'prims',gj.meshes&&gj.meshes[0].primitives.length,'attrs',JSON.stringify(gj.meshes&&gj.meshes[0].primitives[0].attributes),'images',(gj.images||[]).length,JSON.stringify((gj.images||[])[0]||{}),'nodes0',JSON.stringify((gj.nodes||[])[0]||{}).slice(0,200),'accessors',JSON.stringify((gj.accessors||[]).slice(0,2)).slice(0,300))}
        break}
      L('   dead end');break}}
  catch(e){L('  error',e.message)}}
fs.mkdirSync('data',{recursive:true});fs.writeFileSync('data/tiles-log.txt',log.join('\n')+'\n');
