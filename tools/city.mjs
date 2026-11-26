// Fetch Helsinki 3D city model buildings (WFS, CityJSON) for the game bounding box and
// write data/city3d.bin. Every attempt is logged to data/city-log.txt.
import fs from 'node:fs';
import earcut from 'earcut';
import {execSync} from 'node:child_process';
const BB={s:60.1680,w:24.9370,n:60.2085,e:25.0170};
const LAT0=60.1850,LON0=24.9760,KX=111320*Math.cos(LAT0*Math.PI/180),KZ=110540;
const PJ=(lat,lon)=>[(lon-LON0)*KX,-(lat-LAT0)*KZ];
const WFS='https://kartta.hel.fi/3d/citydb-wfs/wfs';
const log=[];const L=(...a)=>{const m=a.join(' ');console.log(m);log.push(m)};
function gk25(E,N){const a=6378137,f=1/298.257222101,k0=1,e2=f*(2-f),ep2=e2/(1-e2),x=E-25500000,M=N/k0,mu=M/(a*(1-e2/4-3*e2*e2/64-5*e2**3/256)),e1=(1-Math.sqrt(1-e2))/(1+Math.sqrt(1-e2));
  const p1=mu+(3*e1/2-27*e1**3/32)*Math.sin(2*mu)+(21*e1*e1/16-55*e1**4/32)*Math.sin(4*mu)+(151*e1**3/96)*Math.sin(6*mu)+(1097*e1**4/512)*Math.sin(8*mu);
  const s1=Math.sin(p1),c1=Math.cos(p1),t1=Math.tan(p1),C1=ep2*c1*c1,T1=t1*t1,N1=a/Math.sqrt(1-e2*s1*s1),R1=a*(1-e2)/Math.pow(1-e2*s1*s1,1.5),D=x/(N1*k0);
  const lat=p1-(N1*t1/R1)*(D*D/2-(5+3*T1+10*C1-4*C1*C1-9*ep2)*D**4/24+(61+90*T1+298*C1+45*T1*T1-252*ep2-3*C1*C1)*D**6/720);
  const lon=25*Math.PI/180+(D-(1+2*T1+C1)*D**3/6+(5-2*C1+28*T1-3*C1*C1+8*ep2+24*T1*T1)*D**5/120)/c1;return[lat*180/Math.PI,lon*180/Math.PI]}
// forward GK25 for request bboxes (Newton on the inverse, good to millimetres)
function toGK(lat,lon){let E=25500000+(lon-25)*KX,N=6672000+(lat-60.1609)*110700;for(let i=0;i<6;i++){const[a,b]=gk25(E,N);N+=(lat-a)*110700;E+=(lon-b)*KX}return[E,N]}
const seen=new Set(),out=[];
function parse(j){const V=j.vertices||[],T=j.transform,sc=T?T.scale:[1,1,1],tr=T?T.translate:[0,0,0];const P=new Float64Array(V.length*3);
  for(let i=0;i<V.length;i++){const a=V[i][0]*sc[0]+tr[0],b=V[i][1]*sc[1]+tr[1],z=V[i][2]*sc[2]+tr[2];let lat,lon;
    if(Math.abs(a)>1e5){const E=a>1.5e7?a:b,N=a>1.5e7?b:a;[lat,lon]=gk25(E,N)}else if(Math.abs(a)>50){lat=a;lon=b}else{lon=a;lat=b}
    const[x,zz]=PJ(lat,lon);P[i*3]=x;P[i*3+1]=z;P[i*3+2]=zz}
  const CO=j.CityObjects||{};let added=0;
  const roots=Object.keys(CO).filter(k=>/^Building/.test(CO[k].type)&&!(CO[k].parents&&CO[k].parents.length&&CO[CO[k].parents[0]]));
  for(const id of roots){if(seen.has(id))continue;seen.add(id);
    const vmap=new Map(),verts=[],W=[],R=[],foot=[],rfoot=[];let attrs={};
    const vid=i=>{if(!vmap.has(i)){vmap.set(i,verts.length/3);verts.push(P[i*3],P[i*3+1],P[i*3+2])}return vmap.get(i)};
    const surf=(rings,cls)=>{const o=rings[0];if(!o||o.length<3)return;let nx=0,ny=0,nz=0;
      for(let i=0;i<o.length;i++){const a=o[i],b=o[(i+1)%o.length];nx+=(P[a*3+1]-P[b*3+1])*(P[a*3+2]+P[b*3+2]);ny+=(P[a*3+2]-P[b*3+2])*(P[a*3]+P[b*3]);nz+=(P[a*3]-P[b*3])*(P[a*3+1]+P[b*3+1])}
      const nl=Math.hypot(nx,ny,nz)||1;nx/=nl;ny/=nl;nz/=nl;
      let k=cls?(/Roof/.test(cls)?'R':/Ground/.test(cls)?'G':'W'):(ny>.3?'R':ny<-.5?'G':'W');
      if(k==='G'){foot.push(o.map(i=>[P[i*3],P[i*3+2]]));return}
      const ax=Math.abs(nx),ay=Math.abs(ny),az=Math.abs(nz),drop=ay>=ax&&ay>=az?1:ax>=az?0:2,u=drop===0?1:0,w=drop===2?1:2;
      const flat=[],holes=[],all=[];rings.forEach((r,ri)=>{if(ri)holes.push(all.length);for(const i of r){flat.push(P[i*3+u],P[i*3+w]);all.push(i)}});
      const tri=earcut(flat,holes.length?holes:null,2),dst=k==='R'?R:W;for(const q of tri)dst.push(vid(all[q]));
      if(k==='R')rfoot.push(o.map(i=>[P[i*3],P[i*3+2]]))};
    const walk=g=>{const B=g.boundaries,S=g.semantics,sv=S&&S.values,ss=S&&S.surfaces,cls=v=>v!=null&&ss&&ss[v]?ss[v].type:null;
      if(g.type==='MultiSurface'||g.type==='CompositeSurface')B.forEach((sf,i)=>surf(sf,cls(sv&&sv[i])));
      else if(g.type==='Solid')B.forEach((sh,i)=>sh.forEach((sf,k)=>surf(sf,cls(sv&&sv[i]&&sv[i][k]))));
      else if(g.type==='MultiSolid'||g.type==='CompositeSolid')B.forEach((so,a)=>so.forEach((sh,i)=>sh.forEach((sf,k)=>surf(sf,cls(sv&&sv[a]&&sv[a][i]&&sv[a][i][k])))))};
    const st=[id];while(st.length){const o=CO[st.pop()];if(!o)continue;attrs=Object.assign(attrs,o.attributes||{});let best=null;for(const g of o.geometry||[]){const l=parseFloat(g.lod)||0;if(!best||l>(parseFloat(best.lod)||0))best=g}if(best)walk(best);for(const c of o.children||[])st.push(c)}
    if(!W.length&&!R.length||verts.length/3>65000)continue;
    const fp=(foot.length?foot:rfoot);if(!fp.length)continue;
    // pick the largest ring as the collision footprint
    let best=fp[0],ba=0;for(const r of fp){let a=0;for(let i=0;i<r.length;i++){const p=r[i],q=r[(i+1)%r.length];a+=p[0]*q[1]-q[0]*p[1]}if(Math.abs(a)>ba){ba=Math.abs(a);best=r}}
    let gz=1e9;for(let i=1;i<verts.length;i+=3)gz=Math.min(gz,verts[i]);
    let yr=0;for(const k in attrs)if(/year|vuosi/i.test(k)){yr=parseInt(attrs[k])||0;break}
    out.push({verts,W,R,foot:best,gz,yr});added++}
  return added}
async function get(url,opt){const r=await fetch(url,opt);const t=await r.text();return{status:r.status,type:r.headers.get('content-type'),text:t}}
// ---- CityGML (Helsinki 3D, EPSG:3879 E N H) ----
function parseGML(xml){const num=t=>t.trim().split(/\s+/).map(Number);let n0=out.length,ext=[1e9,1e9,-1e9,-1e9];
  const chunks=xml.split('<cityObjectMember>');L('cityObjectMember chunks',chunks.length-1);
  for(const ch of chunks){if(ch.indexOf('<bldg:Building')<0)continue;
    const idm=ch.match(/<bldg:Building[^>]*gml:id="([^"]+)"/);const id=idm?idm[1]:'g'+out.length;if(seen.has(id))continue;seen.add(id);
    const vmap=new Map(),verts=[],W=[],R=[],foot=[],rfoot=[];
    const vid=(x,y,z)=>{const k=x.toFixed(2)+','+y.toFixed(2)+','+z.toFixed(2);if(!vmap.has(k)){vmap.set(k,verts.length/3);verts.push(x,y,z)}return vmap.get(k)};
    const ring=t=>{const a=num(t),pts=[];for(let i=0;i+2<a.length;i+=3){const[lat,lon]=gk25(a[i],a[i+1]);const[x,z]=PJ(lat,lon);pts.push([x,a[i+2],z])}if(pts.length>1){const f=pts[0],l=pts[pts.length-1];if(Math.abs(f[0]-l[0])<1e-3&&Math.abs(f[2]-l[2])<1e-3&&Math.abs(f[1]-l[1])<1e-3)pts.pop()}return pts};
    const poly=(pg,cls)=>{const ex=pg.match(/<gml:exterior>[\s\S]*?<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/);if(!ex)return;const rings=[ring(ex[1])];
      for(const m of pg.matchAll(/<gml:interior>[\s\S]*?<gml:posList[^>]*>([\s\S]*?)<\/gml:posList>/g))rings.push(ring(m[1]));const o=rings[0];if(o.length<3)return;
      let nx=0,ny=0,nz=0;for(let i=0;i<o.length;i++){const p=o[i],q=o[(i+1)%o.length];nx+=(p[1]-q[1])*(p[2]+q[2]);ny+=(p[2]-q[2])*(p[0]+q[0]);nz+=(p[0]-q[0])*(p[1]+q[1])}const nl=Math.hypot(nx,ny,nz)||1;nx/=nl;ny/=nl;nz/=nl;
      let k=cls==='RoofSurface'?'R':cls==='GroundSurface'?'G':cls?'W':(ny>.3?'R':ny<-.5?'G':'W');
      for(const p of o){ext[0]=Math.min(ext[0],p[0]);ext[1]=Math.min(ext[1],p[2]);ext[2]=Math.max(ext[2],p[0]);ext[3]=Math.max(ext[3],p[2])}
      if(k==='G'){foot.push(o.map(p=>[p[0],p[2]]));return}
      const ax=Math.abs(nx),ay=Math.abs(ny),az=Math.abs(nz),drop=ay>=ax&&ay>=az?1:ax>=az?0:2,u=drop===0?1:0,w=drop===2?1:2;
      const flat=[],holes=[],ids=[];rings.forEach((r,ri)=>{if(ri)holes.push(ids.length);for(const p of r){flat.push(p[u],p[w]);ids.push(vid(p[0],p[1],p[2]))}});
      const tri=earcut(flat,holes.length?holes:null,2),dst=k==='R'?R:W;for(const q of tri)dst.push(ids[q]);if(k==='R')rfoot.push(o.map(p=>[p[0],p[2]]))};
    let any=false;
    for(const m of ch.matchAll(/<bldg:(RoofSurface|WallSurface|GroundSurface|ClosureSurface|OuterCeilingSurface|OuterFloorSurface)\b[\s\S]*?<\/bldg:\1>/g)){any=true;if(m[1]==='ClosureSurface')continue;for(const pg of m[0].matchAll(/<gml:Polygon\b[\s\S]*?<\/gml:Polygon>/g))poly(pg[0],m[1]==='OuterCeilingSurface'?'RoofSurface':m[1]==='OuterFloorSurface'?'GroundSurface':m[1])}
    if(!any)for(const pg of ch.matchAll(/<gml:Polygon\b[\s\S]*?<\/gml:Polygon>/g))poly(pg[0],null);
    if(!W.length&&!R.length||verts.length/3>65000)continue;const fp=foot.length?foot:rfoot;if(!fp.length)continue;
    let best=fp[0],ba=0;for(const r of fp){let a=0;for(let i=0;i<r.length;i++){const p=r[i],q=r[(i+1)%r.length];a+=p[0]*q[1]-q[0]*p[1]}if(Math.abs(a)>ba){ba=Math.abs(a);best=r}}
    let gz=1e9;for(let i=1;i<verts.length;i+=3)gz=Math.min(gz,verts[i]);
    let yr=0;const ym=ch.match(/<gen:\w+Attribute name="[^"]*(?:vuosi|year|Year|valmistumis)[^"]*">\s*<gen:value>\s*(\d{4})/);if(ym)yr=+ym[1];
    out.push({verts,W,R,foot:best,gz,yr})}
  L('CityGML buildings',out.length-n0,'extent local m',ext.map(v=>v.toFixed(0)).join(','));return out.length-n0}
async function main(){
  fs.mkdirSync('data',{recursive:true});
  // 1) the city's WFS (currently answers "overloaded" for building requests)
  const base=WFS+'?service=WFS&version=2.0.0&request=GetFeature&typeNames=bldg:Building&outputFormat=application/json';
  const form=(a,b,c,d)=>base+'&bbox='+[a,b,c,d].map(v=>v.toFixed(5)).join(',')+',urn:ogc:def:crs:EPSG::4326';
  let wfsOK=false;try{const r=await get(form(60.1855,24.9700,60.1875,24.9760));let j=null;try{j=JSON.parse(r.text)}catch(_){}wfsOK=!!(j&&j.CityObjects&&Object.keys(j.CityObjects).length);L('WFS probe',r.status,wfsOK?'ok':r.text.slice(0,300).replace(/\s+/g,' '))}catch(e){L('WFS probe error',e.message)}
  if(wfsOK){const NX=10,NY=10;for(let a=0;a<NY;a++)for(let b=0;b<NX;b++){const s1=BB.s+(BB.n-BB.s)*a/NY,n1=BB.s+(BB.n-BB.s)*(a+1)/NY,w1=BB.w+(BB.e-BB.w)*b/NX,e1=BB.w+(BB.e-BB.w)*(b+1)/NX;
      for(let tr=0;tr<3;tr++){try{const r=await get(form(s1,w1,n1,e1));const k=parse(JSON.parse(r.text));L('tile',a,b,'new',k,'total',out.length);break}catch(err){L('tile',a,b,'error',err.message);await new Promise(r=>setTimeout(r,3000))}}}}
  // 2) the Kalasatama digital-twin CityGML (2019), which covers a large part of the game area
  if(!out.length){try{execSync('curl -sSL --retry 3 -o /tmp/k.zip http://3d.hel.ninja/data/citygml/Helsinki3D_CityGML_Kalasatama_20190326.zip && mkdir -p /tmp/k && cd /tmp/k && unzip -o -q /tmp/k.zip');
      for(const f of fs.readdirSync('/tmp/k').filter(f=>/\.(gml|xml)$/i.test(f)))parseGML(fs.readFileSync('/tmp/k/'+f,'utf8'))}catch(e){L('CityGML error',e.message)}}
  // 3) note the layers of the city's 3D map viewer for later (whole-city building tiles)
  try{const app=JSON.parse((await get('https://kartta.hel.fi/3d/app.config.json')).text);for(const m of app.modules||[]){const t=(await get('https://kartta.hel.fi/3d/'+m)).text;for(const u of t.matchAll(/"url"\s*:\s*"([^"]+)"/g))L('viewer layer',u[1]);for(const u of t.matchAll(/"name"\s*:\s*"([^"]+)"[^{}]*?"type"\s*:\s*"([^"]+)"/g))L('viewer name',u[1],u[2])}}catch(e){L('viewer cfg error',e.message)}
  // binary: magic, count; per building: f32 ox,oz,gz; u16 nv,nW,nR,nF,yr; i16 verts (dm, rel. to ox/gz/oz); u16 idx; i16 foot
  const parts=[];let size=12;
  for(const b of out){const nv=b.verts.length/3;let ox=0,oz=0;for(let i=0;i<nv;i++){ox+=b.verts[i*3];oz+=b.verts[i*3+2]}ox/=nv;oz/=nv;
    const buf=Buffer.alloc(12+10+nv*6+(b.W.length+b.R.length)*2+b.foot.length*4);let o=0;
    buf.writeFloatLE(ox,o);o+=4;buf.writeFloatLE(oz,o);o+=4;buf.writeFloatLE(b.gz,o);o+=4;
    buf.writeUInt16LE(nv,o);o+=2;buf.writeUInt16LE(b.W.length/3,o);o+=2;buf.writeUInt16LE(b.R.length/3,o);o+=2;buf.writeUInt16LE(b.foot.length,o);o+=2;buf.writeUInt16LE(b.yr,o);o+=2;
    const q=v=>Math.max(-32768,Math.min(32767,Math.round(v*10)));
    for(let i=0;i<nv;i++){buf.writeInt16LE(q(b.verts[i*3]-ox),o);o+=2;buf.writeInt16LE(q(b.verts[i*3+1]-b.gz),o);o+=2;buf.writeInt16LE(q(b.verts[i*3+2]-oz),o);o+=2}
    for(const i of b.W){buf.writeUInt16LE(i,o);o+=2}for(const i of b.R){buf.writeUInt16LE(i,o);o+=2}
    for(const p of b.foot){buf.writeInt16LE(q(p[0]-ox),o);o+=2;buf.writeInt16LE(q(p[1]-oz),o);o+=2}
    parts.push(buf);size+=buf.length}
  const head=Buffer.alloc(12);head.write('HKB1',0);head.writeUInt32LE(out.length,4);head.writeUInt32LE(Math.round(Date.now()/1000),8);
  if(out.length){fs.writeFileSync('data/city3d.bin',Buffer.concat([head,...parts]));}
  L('done: buildings',out.length,'bytes',size);fs.writeFileSync('data/city-log.txt',log.join('\n')+'\n')}
main().catch(e=>{L('fatal',e.stack);fs.writeFileSync('data/city-log.txt',log.join('\n')+'\n')});
