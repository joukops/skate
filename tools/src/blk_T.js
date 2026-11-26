/* =====================================================================
   TEXTURES
   ===================================================================== */
const mk=(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c};
function tex(c,rx=1,ry=1,srgb=true){const t=new THREE.CanvasTexture(c);if(srgb)t.encoding=THREE.sRGBEncoding;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(rx,ry);t.anisotropy=maxAniso;return t}
function speckle(g,W,H2,n,d=.12,l=.12){for(let i=0;i<n;i++){g.fillStyle=Math.random()<.5?`rgba(255,255,255,${l})`:`rgba(40,35,30,${d})`;g.fillRect(Math.random()*W,Math.random()*H2,1+Math.random()*1.5,1+Math.random()*1.5)}}
function grassCanvas(){const N=512,c=mk(N,N),g=c.getContext('2d');g.fillStyle='#4d6c2b';g.fillRect(0,0,N,N);
  for(let i=0;i<60;i++){g.fillStyle=`rgba(${rnd(60,110)|0},${rnd(90,130)|0},${rnd(30,50)|0},.18)`;const x=rnd(0,N),y=rnd(0,N),r=rnd(20,70);for(const ox of [-N,0,N])for(const oy of [-N,0,N]){g.beginPath();g.arc(x+ox,y+oy,r,0,7);g.fill()}}
  const cols=['rgba(118,148,58,.55)','rgba(56,84,26,.6)','rgba(150,160,78,.33)','rgba(88,118,40,.5)'];
  for(let i=0;i<48000;i++){const x=Math.random()*N,y=Math.random()*N,l=rnd(3,8),a=rnd(-.6,.6);g.strokeStyle=cols[i%4];g.lineWidth=1.1;g.beginPath();g.moveTo(x,y);g.lineTo(x+Math.sin(a)*l,y-Math.cos(a)*l);g.stroke()}
  return c}
function pathCanvas(){const c=mk(128,256),g=c.getContext('2d');g.fillStyle='#9d9b95';g.fillRect(0,0,128,256);speckle(g,128,256,6000,.22,.2);
  for(let i=0;i<6;i++){g.fillStyle='rgba(60,58,52,.08)';g.fillRect(rnd(0,100),rnd(0,230),rnd(10,40),rnd(10,30))}
  g.fillStyle='rgba(70,68,62,.55)';g.fillRect(0,0,5,256);g.fillRect(123,0,5,256);return c}
function paverCanvas(){const c=mk(256,256),g=c.getContext('2d');g.fillStyle='#b7b2a8';g.fillRect(0,0,256,256);
  for(let y=0;y<256;y+=32)for(let x=0;x<256;x+=64){g.fillStyle=`rgb(${rnd(165,200)|0},${rnd(160,192)|0},${rnd(150,182)|0})`;g.fillRect(x+((y/32)%2?32:0)%64+1,y+1,62,30)}
  g.strokeStyle='rgba(60,55,50,.5)';for(let y=0;y<=256;y+=32){g.beginPath();g.moveTo(0,y);g.lineTo(256,y);g.stroke()}speckle(g,256,256,4000,.1,.1);return c}
function concreteCanvas(joints){const c=mk(256,256),g=c.getContext('2d');g.fillStyle='#c9c6bf';g.fillRect(0,0,256,256);speckle(g,256,256,6000,.07,.1);
  for(let i=0;i<18;i++){const gr=g.createRadialGradient(0,0,0,0,0,1);g.save();g.translate(rnd(0,256),rnd(0,256));g.scale(rnd(10,40),rnd(10,40));gr.addColorStop(0,'rgba(80,75,70,.12)');gr.addColorStop(1,'rgba(80,75,70,0)');g.fillStyle=gr;g.beginPath();g.arc(0,0,1,0,7);g.fill();g.restore()}
  if(joints){g.strokeStyle='rgba(50,48,44,.55)';g.lineWidth=2;g.strokeRect(1,1,254,254);g.strokeStyle='rgba(30,30,30,.16)';g.lineWidth=1.5;for(let i=0;i<14;i++){g.beginPath();const x=rnd(0,256),y=rnd(0,256),a=rnd(0,6.28);g.moveTo(x,y);g.lineTo(x+Math.cos(a)*rnd(20,70),y+Math.sin(a)*rnd(20,70));g.stroke()}}
  return c}
function towerCanvas(){const c=mk(256,512),g=c.getContext('2d');g.fillStyle='#c6c2ba';g.fillRect(0,0,256,512);speckle(g,256,512,9000,.07,.1);
  g.strokeStyle='rgba(90,85,78,.16)';for(let x=0;x<256;x+=8){g.beginPath();g.moveTo(x+.5,0);g.lineTo(x+.5,512);g.stroke()}
  g.strokeStyle='rgba(90,85,78,.3)';for(let y=0;y<512;y+=64){g.beginPath();g.moveTo(0,y+.5);g.lineTo(256,y+.5);g.stroke()}
  for(let i=0;i<20;i++){const x=rnd(0,256),gr=g.createLinearGradient(0,0,0,512);gr.addColorStop(0,'rgba(60,58,52,.14)');gr.addColorStop(1,'rgba(60,58,52,0)');g.fillStyle=gr;g.fillRect(x,0,rnd(3,12),512)}return c}
function gridCanvas(){const c=mk(256,256),g=c.getContext('2d');g.fillStyle='#e6ecef';g.fillRect(0,0,256,256);g.strokeStyle='#4b555e';g.lineWidth=2.5;
  for(let i=0;i<=256;i+=32){g.beginPath();g.moveTo(i,0);g.lineTo(i,256);g.moveTo(0,i);g.lineTo(256,i);g.stroke()}g.fillStyle='#3c454d';for(let i=0;i<=256;i+=32)for(let j=0;j<=256;j+=32){g.beginPath();g.arc(i,j,3.5,0,7);g.fill()}return c}
function seatCanvas(){const c=mk(64,256),g=c.getContext('2d');g.fillStyle='#55782f';g.fillRect(0,0,64,64);speckle(g,64,64,700);
  for(let y=64;y<256;y+=6){g.fillStyle='#a7abaf';g.fillRect(0,y,64,2);g.fillStyle=((y/6)|0)%5?'#2f6596':'#3a76aa';g.fillRect(0,y+2,64,4)}return c}
function fieldCanvas(){const c=mk(512,512),g=c.getContext('2d');g.fillStyle='#a9503a';g.fillRect(0,0,512,512);
  g.save();g.beginPath();g.ellipse(256,256,190,222,0,0,7);g.clip();for(let i=0;i<16;i++){g.fillStyle=i%2?'#3d7c33':'#478a3a';g.fillRect(0,34+i*28,512,28)}g.restore();
  g.strokeStyle='rgba(255,255,255,.85)';g.lineWidth=3;g.strokeRect(186,153,140,206);g.beginPath();g.moveTo(186,256);g.lineTo(326,256);g.stroke();g.beginPath();g.arc(256,256,24,0,7);g.stroke();
  g.strokeStyle='rgba(255,255,255,.5)';g.lineWidth=1.3;for(let k=0;k<8;k++){g.beginPath();g.ellipse(256,256,196+k*7,228+k*3,0,0,7);g.stroke()}return c}
function aluCanvas(){const c=mk(128,512),g=c.getContext('2d');const gr=g.createLinearGradient(0,0,128,0);gr.addColorStop(0,'#c9cfd5');gr.addColorStop(.5,'#eef1f4');gr.addColorStop(1,'#c3c9cf');g.fillStyle=gr;g.fillRect(0,0,128,512);
  for(let y=6;y<512;y+=23){g.fillStyle='#3a4955';g.fillRect(0,y,128,11);g.fillStyle='rgba(255,255,255,.18)';g.fillRect(0,y,128,2)}g.fillStyle='rgba(0,0,0,.16)';for(let x=0;x<128;x+=8)g.fillRect(x,0,1,512);return c}
function glassCanvas(){const c=mk(256,128),g=c.getContext('2d');const gr=g.createLinearGradient(0,0,0,128);gr.addColorStop(0,'#5c7180');gr.addColorStop(1,'#26323b');g.fillStyle=gr;g.fillRect(0,0,256,128);
  g.fillStyle='rgba(220,230,235,.08)';for(let i=0;i<6;i++){g.beginPath();const x=rnd(0,256);g.moveTo(x,0);g.lineTo(x+40,0);g.lineTo(x-20,128);g.lineTo(x-60,128);g.fill()}
  g.fillStyle='#1b2025';for(let x=0;x<256;x+=16)g.fillRect(x,0,2,128);for(let y=0;y<128;y+=42)g.fillRect(0,y,256,3);return c}
function barkCanvas(){const c=mk(64,128),g=c.getContext('2d');g.fillStyle='#6a6258';g.fillRect(0,0,64,128);g.strokeStyle='rgba(30,22,16,.55)';for(let i=0;i<40;i++){const x=rnd(0,64);g.beginPath();g.moveTo(x,0);g.lineTo(x+rnd(-4,4),128);g.stroke()}speckle(g,64,128,500);return c}
function tuftCanvas(){const c=mk(64,64),g=c.getContext('2d');for(let i=0;i<26;i++){const x=rnd(6,58),h=rnd(26,60),b=rnd(-10,10);g.strokeStyle=`rgb(${rnd(70,130)|0},${rnd(110,160)|0},${rnd(30,60)|0})`;g.lineWidth=rnd(1.5,3);g.beginPath();g.moveTo(x,64);g.quadraticCurveTo(x+b*.3,64-h*.6,x+b,64-h);g.stroke()}return c}
function waterNormals(){const N=256,c=mk(N,N),g=c.getContext('2d'),img=g.createImageData(N,N),W=[];
  for(let i=0;i<14;i++){let kx=0,ky=0;while(!kx&&!ky){kx=(Math.random()*14|0)-7;ky=(Math.random()*14|0)-7}W.push({kx,ky,a:rnd(.4,1)/(1+i*.25),p:rnd(0,6.28)})}
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){let dx=0,dy=0;for(const w of W){const c2=Math.cos(6.2832*(w.kx*x/N+w.ky*y/N)+w.p)*w.a;dx+=c2*w.kx;dy+=c2*w.ky}
    const nx=-dx*.06,ny=-dy*.06,l=Math.hypot(nx,ny,1);const o=(y*N+x)*4;img.data[o]=(nx/l*.5+.5)*255;img.data[o+1]=(ny/l*.5+.5)*255;img.data[o+2]=(1/l*.5+.5)*255;img.data[o+3]=255}
  g.putImageData(img,0,0);return c}

const M=o=>new THREE.MeshStandardMaterial(Object.assign({roughness:.9,metalness:0},o));
const wet=(m,w)=>{WETMATS.push([m,m.roughness,w]);return m};
function shadowAll(o,cast=true){o.traverse(c=>{if(c.isMesh){c.castShadow=cast;c.receiveShadow=true}});return o}
function cyl(a,b,r1,r2,mat,seg=10){const A=new THREE.Vector3(...a),B=new THREE.Vector3(...b),d=B.clone().sub(A),L=d.length();const m=new THREE.Mesh(new THREE.CylinderGeometry(r2,r1,L,seg),mat);m.position.copy(A).add(B).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return m}

