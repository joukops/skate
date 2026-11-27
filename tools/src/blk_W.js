/* =====================================================================
   RENDERER, SKY, CLOUDS, WEATHER
   ===================================================================== */
const renderer=new THREE.WebGPURenderer({canvas:$('c'),antialias:true,logarithmicDepthBuffer:true,powerPreference:'high-performance',forceWebGL:/[#&?]gl=webgl/.test(location.href)});
await renderer.init();
const BACKEND=renderer.backend.isWebGPUBackend?'WebGPU':'WebGL 2';
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.55;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.setClearColor(0xcfdbe5);
$('c').addEventListener('webglcontextlost',e=>{e.preventDefault();report('graphics memory ran out — choose Fast graphics and reload')});
const maxAniso=renderer.getMaxAnisotropy?renderer.getMaxAnisotropy():8;
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(60,1,.1,16000);
let cw=0,ch=0;
function resize(){const c=$('c');const w=c.clientWidth||innerWidth,h=c.clientHeight||innerHeight;if(!w||!h||(w===cw&&h===ch))return;cw=w;ch=h;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}
const lin=h=>new THREE.Color(h).convertSRGBToLinear();
scene.fog=new THREE.FogExp2(new THREE.Color(1,1.1,1.3),.0003);
let sky=null;
const FOGC=uniform(new THREE.Color(1,1.1,1.3)),FOGD=uniform(.0003);   /* fog for the water, which draws its own colour */
if(THREE.Sky){sky=new THREE.Sky();sky.scale.setScalar(10000);scene.add(sky)}
else{const g=new THREE.SphereGeometry(9000,32,16),p=g.attributes.position,cols=[];const zen=lin('#4f86c6'),hor=new THREE.Color(1,1.1,1.25);for(let i=0;i<p.count;i++){const y=Math.max(0,p.getY(i)/9000);const c=hor.clone().lerp(zen,Math.pow(y,.6));cols.push(c.r,c.g,c.b)}g.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));sky=new THREE.Mesh(g,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.BackSide,fog:false,depthWrite:false}));scene.add(sky)}
const CU={uTime:uniform(0),uCover:uniform(.3),uDark:uniform(0),uSun:uniform(new THREE.Vector3(0,1,0)),uSunCol:uniform(new THREE.Color(1,.9,.8)),uCol:uniform(new THREE.Color(1,1,1)),uShd:uniform(new THREE.Color(.7,.75,.8)),uHaze:uniform(new THREE.Color(.8,.85,.9)),uHazeA:uniform(0)};
const cloudMat=new THREE.MeshBasicMaterial({transparent:true,depthWrite:false,side:THREE.BackSide,fog:false,toneMapped:false});cloudMat.uniforms=CU;
{const{fract,floor,dot,normalize,max,pow,clamp,abs,select,Loop}=TSL;
 const hs=Fn(([q])=>{const p=fract(q.mul(vec2(.1031,.1030))).toVar();p.addAssign(dot(p,p.yx.add(33.33)));return fract(p.x.add(p.y).mul(p.x))});
 const ns=Fn(([p])=>{const i=floor(p),f=fract(p),u=f.mul(f).mul(f.mul(-2).add(3));return mix(mix(hs(i),hs(i.add(vec2(1,0))),u.x),mix(hs(i.add(vec2(0,1))),hs(i.add(vec2(1,1))),u.x),u.y)});
 const fbm=Fn(([q])=>{const p=vec2(q).toVar(),s=float(0).toVar(),a=float(.5).toVar();Loop(5,()=>{s.addAssign(a.mul(ns(p)));p.assign(p.mul(2.07).add(vec2(5.3,1.7)));a.mulAssign(.5)});return s});
 cloudMat.colorNode=Fn(()=>{const d=normalize(positionLocal),hz=float(1).sub(smoothstep(0,.16,abs(d.y)));
   const q=d.xz.div(max(d.y,0).add(.08)).mul(1.25).add(vec2(CU.uTime.mul(.006),CU.uTime.mul(.0025)));
   const n=fbm(q),c=smoothstep(float(.72).sub(CU.uCover.mul(.62)),float(.95).sub(CU.uCover.mul(.45)),n);
   const n2=fbm(q.add(normalize(CU.uSun.xz.add(1e-4)).mul(.06))),lit=clamp(float(.55).add(n.sub(n2).mul(3)),0,1);
   const col=mix(CU.uShd,CU.uCol,lit).add(CU.uSunCol.mul(pow(max(dot(d,CU.uSun),0),10)).mul(.6).mul(float(1).sub(CU.uDark)));
   const a=max(c.mul(smoothstep(0,.1,d.y)).mul(float(.9).add(CU.uDark.mul(.1))),hz.mul(CU.uHazeA));
   return select(d.y.lessThan(0),vec4(CU.uHaze,CU.uHazeA),vec4(mix(col,CU.uHaze,hz.mul(.6)),a))})()}
const clouds=new THREE.Mesh(new THREE.SphereGeometry(9000,48,24),cloudMat);clouds.renderOrder=-1;scene.add(clouds);
const envClouds=new THREE.Mesh(new THREE.SphereGeometry(50,32,16),cloudMat);
const envSkyG=new THREE.SphereGeometry(80,32,16);envSkyG.setAttribute('color',new THREE.Float32BufferAttribute(new Float32Array(envSkyG.attributes.position.count*3),3));
const envSky=new THREE.Mesh(envSkyG,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.BackSide,fog:false,depthWrite:false,toneMapped:false}));
function paintEnvSky(){const p=envSkyG.attributes.position,c=envSkyG.attributes.color;for(let i=0;i<p.count;i++){const y=p.getY(i)/80;let r,g,b;
  if(y>=0){const t=Math.pow(y,.55);r=lerp(cur.envH[0],cur.envZ[0],t);g=lerp(cur.envH[1],cur.envZ[1],t);b=lerp(cur.envH[2],cur.envZ[2],t)}else{const t=Math.min(1,-y*3);r=lerp(cur.envH[0],cur.envG[0],t);g=lerp(cur.envH[1],cur.envG[1],t);b=lerp(cur.envH[2],cur.envG[2],t)}
  c.setXYZ(i,r,g,b)}c.needsUpdate=true}
const hemi=new THREE.HemisphereLight(lin('#cfe2ff'),lin('#6b7a45'),.3);scene.add(hemi);
const sun=new THREE.DirectionalLight(0xffffff,3);
sun.shadow.mapSize.set(mobile?1024:2048,mobile?1024:2048);
Object.assign(sun.shadow.camera,{left:-55,right:55,top:55,bottom:-55,near:1,far:500});
sun.shadow.bias=-.0004;sun.shadow.normalBias=.04;scene.add(sun,sun.target);
const pmrem=new THREE.PMREMGenerator(renderer);let envRT=null;
scene.environmentIntensity=2.2;   /* the old engine scaled sky light by pi internally; physical lighting does not */
function updateEnv(){try{paintEnvSky();const es=new THREE.Scene();es.add(envSky);const rt=pmrem.fromScene(es,0,.1,1000);scene.environment=rt.texture;if(envRT)envRT.dispose();envRT=rt}catch(e){report('sky lighting: '+e.message)}}

const WX={
  sunny:{el:46,az:210,turb:3.5,ray:1.1,mie:.004,mieG:.8,cover:.28,dark:0,fogD:.00028,sunI:3.3,hemiI:.25,expo:.5,rain:0,wet:0,wave:1.6,fog:[1.1,1.25,1.5],sunC:[1,.95,.88],col:[.97,.97,.98],shd:[.72,.76,.83],haze:[.8,.86,.94],hazeA:0,water:[.11,.29,.35],envZ:[.22,.42,.8],envH:[.7,.8,.95],envG:[.22,.25,.17]},
  golden:{el:7,az:262,turb:7,ray:2.6,mie:.006,mieG:.86,cover:.32,dark:0,fogD:.00042,sunI:2.6,hemiI:.3,expo:.75,rain:0,wet:0,wave:1.4,fog:[1.25,1.0,.82],sunC:[1,.68,.38],col:[1,.84,.66],shd:[.56,.46,.52],haze:[.96,.8,.66],hazeA:0,water:[.14,.26,.3],envZ:[.22,.28,.55],envH:[.95,.62,.4],envG:[.22,.17,.12]},
  cloudy:{el:38,az:200,turb:16,ray:.4,mie:.02,mieG:.7,cover:.9,dark:.35,fogD:.0009,sunI:.65,hemiI:.9,expo:.9,rain:0,wet:.15,wave:2.2,fog:[.62,.66,.72],sunC:[.9,.93,.96],col:[.83,.85,.88],shd:[.55,.58,.62],haze:[.72,.75,.79],hazeA:.9,water:[.17,.28,.31],envZ:[.5,.53,.57],envH:[.6,.63,.67],envG:[.2,.22,.18]},
  rain:{el:35,az:200,turb:20,ray:.3,mie:.03,mieG:.7,cover:1,dark:1,fogD:.0017,sunI:.28,hemiI:.85,expo:1,rain:1,wet:1,wave:3.6,fog:[.32,.35,.39],sunC:[.8,.85,.9],col:[.6,.62,.66],shd:[.36,.38,.42],haze:[.52,.55,.59],hazeA:1,water:[.13,.2,.23],envZ:[.27,.29,.32],envH:[.34,.36,.39],envG:[.13,.14,.12]}};
const cur=JSON.parse(JSON.stringify(WX[weather]||WX.sunny));let envDirty=true,envT=0;
const WETMATS=[];
const SUNV=new THREE.Vector3();
function applyWeather(){
  const el=cur.el*Math.PI/180,az=cur.az*Math.PI/180;SUNV.set(Math.sin(az)*Math.cos(el),Math.sin(el),-Math.cos(az)*Math.cos(el)).normalize();
  if(THREE.Sky){sky.turbidity.value=cur.turb;sky.rayleigh.value=cur.ray;sky.mieCoefficient.value=cur.mie;sky.mieDirectionalG.value=cur.mieG;sky.sunPosition.value.copy(SUNV)}
  const cu=cloudMat.uniforms;cu.uCover.value=cur.cover;cu.uDark.value=cur.dark;cu.uSun.value.copy(SUNV);cu.uSunCol.value.setRGB(...cur.sunC);cu.uCol.value.setRGB(...cur.col);cu.uShd.value.setRGB(...cur.shd);cu.uHaze.value.setRGB(...cur.haze);cu.uHazeA.value=cur.hazeA;
  scene.fog.color.setRGB(...cur.fog);scene.fog.density=cur.fogD;FOGC.value.setRGB(...cur.fog);FOGD.value=cur.fogD;
  sun.intensity=cur.sunI*2.4;sun.color.setRGB(...cur.sunC).convertSRGBToLinear();hemi.intensity=(scene.environment?cur.hemiI:cur.hemiI+.9)*Math.PI*3.5;
  renderer.toneMappingExposure=cur.expo;
  for(const[m,d,w]of WETMATS){m.roughness=lerp(d,w,cur.wet);m.envMapIntensity=1+cur.wet*.8}
  if(water){water.sunDirection.value.copy(SUNV);water.sunColor.value.setRGB(...cur.sunC);water.waterColor.value.setRGB(...cur.water);water.distortionScale.value=cur.wave}
  rain.visible=cur.rain>.05;rainMat.opacity=.32*cur.rain;
}
function setWeather(w){if(!WX[w])return;weather=w;envDirty=true;envT=0;try{localStorage.setItem('olp2-w',w)}catch(e){}
  document.querySelectorAll('[data-w]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.w===w))}
function stepWeather(dt){const t=WX[weather],k=Math.min(1,dt*.7);let diff=0;
  for(const key in t){const a=cur[key],b=t[key];if(Array.isArray(b)){for(let i=0;i<b.length;i++){diff+=Math.abs(a[i]-b[i]);a[i]=lerp(a[i],b[i],k)}}else{diff+=Math.abs(a-b)/(Math.abs(b)+.01);cur[key]=lerp(a,b,k)}}
  applyWeather();envT+=dt;if(envDirty&&(diff<.05||envT>1.2)){updateEnv();envT=0;if(diff<.05)envDirty=false}}

