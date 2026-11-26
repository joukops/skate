// Fetch Helsinki 3D city model buildings (WFS, CityJSON) for the game bounding box and
// write data/city3d.bin. Every attempt is logged to data/city-log.txt.
import fs from 'node:fs';
import earcut from 'earcut';
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
async function main(){
  fs.mkdirSync('data',{recursive:true});
  for(const u of [WFS+'?service=WFS&version=2.0.0&request=GetFeature&typeNames=bldg:Building&count=1',WFS+'?service=WFS&version=2.0.0&request=GetFeature&typeNames=bldg:Building&count=1&outputFormat=application/json',WFS+'?service=WFS&version=2.0.0&request=DescribeFeatureType&typeNames=bldg:Building','http://3d.hel.ninja/data/citygml/','https://3d.hel.ninja/data/citygml/','https://kartta.hel.fi/3d/','https://kartta.hel.fi/avoindata/','https://kartta.hel.fi/ws/geoserver/avoindata/wfs?service=WFS&version=2.0.0&request=GetCapabilities']){
    try{const r=await get(u);L('extra',u,'->',r.status,r.type,r.text.length,'|',r.text.slice(0,900).replace(/\s+/g,' '))}catch(err){L('extra',u,'error',err.message)}}
  // probe which request form the server accepts
  const s=BB.s,n=BB.s+.004,w=BB.w+.02,e=BB.w+.028;const[E0,N0]=toGK(s+.015,w);const[E1,N1]=toGK(s+.019,e);
  const base=WFS+'?service=WFS&version=2.0.0&request=GetFeature&typeNames=bldg:Building&outputFormat=application/json';
  const forms=[
    (a,b,c,d)=>base+'&bbox='+[a,b,c,d].map(v=>v.toFixed(5)).join(',')+',urn:ogc:def:crs:EPSG::4326',
    (a,b,c,d)=>{const[x0,y0]=toGK(a,b),[x1,y1]=toGK(c,d);return base+'&bbox='+[y0,x0,y1,x1].map(v=>v.toFixed(1)).join(',')+',urn:ogc:def:crs:EPSG::3879'},
    (a,b,c,d)=>{const[x0,y0]=toGK(a,b),[x1,y1]=toGK(c,d);return base+'&bbox='+[x0,y0,x1,y1].map(v=>v.toFixed(1)).join(',')+',EPSG:3879'}];
  let form=null;
  for(let i=0;i<forms.length&&!form;i++){const u=forms[i](60.1855,24.9700,60.1875,24.9760);try{const r=await get(u);let j=null;try{j=JSON.parse(r.text)}catch(_){}
      const nObj=j&&j.CityObjects?Object.keys(j.CityObjects).length:-1;L('probe',i,'status',r.status,r.type,'bytes',r.text.length,'objects',nObj,'|',r.text.slice(0,700).replace(/\s+/g,' '));
      if(nObj>0)form=forms[i]}catch(err){L('probe',i,'error',err.message)}}
  if(!form){L('No request form returned buildings.');fs.writeFileSync('data/city-log.txt',log.join('\n')+'\n');return}
  const NX=10,NY=10;let tiles=0;
  for(let a=0;a<NY;a++)for(let b=0;b<NX;b++){const s1=BB.s+(BB.n-BB.s)*a/NY,n1=BB.s+(BB.n-BB.s)*(a+1)/NY,w1=BB.w+(BB.e-BB.w)*b/NX,e1=BB.w+(BB.e-BB.w)*(b+1)/NX;
    for(let tr=0;tr<3;tr++){try{const r=await get(form(s1,w1,n1,e1));const j=JSON.parse(r.text);const k=parse(j);tiles++;L('tile',a,b,'status',r.status,'MB',(r.text.length/1e6).toFixed(1),'new buildings',k,'total',out.length);break}
      catch(err){L('tile',a,b,'try',tr,'error',err.message);await new Promise(r=>setTimeout(r,3000))}}}
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
  L('done: tiles',tiles,'buildings',out.length,'bytes',size);fs.writeFileSync('data/city-log.txt',log.join('\n')+'\n')}
main().catch(e=>{L('fatal',e.stack);fs.writeFileSync('data/city-log.txt',log.join('\n')+'\n')});
