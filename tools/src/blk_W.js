/* =====================================================================
   RENDERER, SKY, CLOUDS, WEATHER
   ===================================================================== */
const renderer=new THREE.WebGLRenderer({canvas:$('c'),antialias:true,powerPreference:'high-performance'});
renderer.outputEncoding=THREE.sRGBEncoding;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.55;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;renderer.setClearColor(0xcfdbe5);
$('c').addEventListener('webglcontextlost',e=>{e.preventDefault();report('graphics memory ran out — choose Fast graphics and reload')});
const maxAniso=renderer.capabilities.getMaxAnisotropy();
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(60,1,.1,16000);
let cw=0,ch=0;
function resize(){const c=$('c');const w=c.clientWidth||innerWidth,h=c.clientHeight||innerHeight;if(!w||!h||(w===cw&&h===ch))return;cw=w;ch=h;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}
const lin=h=>new THREE.Color(h).convertSRGBToLinear();
scene.fog=new THREE.FogExp2(new THREE.Color(1,1.1,1.3),.0003);
let sky=null;
if(THREE.Sky){sky=new THREE.Sky();sky.scale.setScalar(10000);scene.add(sky)}
else{const g=new THREE.SphereGeometry(9000,32,16),p=g.attributes.position,cols=[];const zen=lin('#4f86c6'),hor=new THREE.Color(1,1.1,1.25);for(let i=0;i<p.count;i++){const y=Math.max(0,p.getY(i)/9000);const c=hor.clone().lerp(zen,Math.pow(y,.6));cols.push(c.r,c.g,c.b)}g.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));sky=new THREE.Mesh(g,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.BackSide,fog:false,depthWrite:false}));scene.add(sky)}
const cloudMat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,side:THREE.BackSide,fog:false,toneMapped:false,
  uniforms:{uTime:{value:0},uCover:{value:.3},uDark:{value:0},uSun:{value:new THREE.Vector3(0,1,0)},uSunCol:{value:new THREE.Color(1,.9,.8)},uCol:{value:new THREE.Color(1,1,1)},uShd:{value:new THREE.Color(.7,.75,.8)},uHaze:{value:new THREE.Color(.8,.85,.9)},uHazeA:{value:0}},
  vertexShader:'varying vec3 vDir;void main(){vDir=position;vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);gl_Position=p;gl_Position.z=p.w*.99998;}',
  fragmentShader:`precision highp float;uniform float uTime,uCover,uDark,uHazeA;uniform vec3 uSun,uSunCol,uCol,uShd,uHaze;varying vec3 vDir;
  float hs(vec2 p){p=fract(p*vec2(.1031,.1030));p+=dot(p,p.yx+33.33);return fract((p.x+p.y)*p.x);}
  float ns(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hs(i),hs(i+vec2(1,0)),f.x),mix(hs(i+vec2(0,1)),hs(i+vec2(1,1)),f.x),f.y);}
  float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*ns(p);p=p*2.07+vec2(5.3,1.7);a*=.5;}return s;}
  void main(){vec3 d=normalize(vDir);float hz=1.-smoothstep(0.,.16,abs(d.y));
   if(d.y<0.){gl_FragColor=vec4(uHaze,uHazeA);return;}
   vec2 uv=d.xz/(d.y+.08)*1.25+vec2(uTime*.006,uTime*.0025);
   float n=fbm(uv);float c=smoothstep(.72-uCover*.62,.95-uCover*.45,n);
   float n2=fbm(uv+normalize(uSun.xz+1e-4)*.06);float lit=clamp(.55+(n-n2)*3.,0.,1.);
   vec3 col=mix(uShd,uCol,lit);float sd=max(dot(d,uSun),0.);col+=uSunCol*pow(sd,10.)*.6*(1.-uDark);
   float fade=smoothstep(0.,.1,d.y);float a=c*fade*(.9+.1*uDark);
   col=mix(col,uHaze,hz*.6);a=max(a,hz*uHazeA);gl_FragColor=vec4(col,a);}`});
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
  if(THREE.Sky){const u=sky.material.uniforms;u.turbidity.value=cur.turb;u.rayleigh.value=cur.ray;u.mieCoefficient.value=cur.mie;u.mieDirectionalG.value=cur.mieG;u.sunPosition.value.copy(SUNV)}
  const cu=cloudMat.uniforms;cu.uCover.value=cur.cover;cu.uDark.value=cur.dark;cu.uSun.value.copy(SUNV);cu.uSunCol.value.setRGB(...cur.sunC);cu.uCol.value.setRGB(...cur.col);cu.uShd.value.setRGB(...cur.shd);cu.uHaze.value.setRGB(...cur.haze);cu.uHazeA.value=cur.hazeA;
  scene.fog.color.setRGB(...cur.fog);scene.fog.density=cur.fogD;
  sun.intensity=cur.sunI;sun.color.setRGB(...cur.sunC).convertSRGBToLinear();hemi.intensity=scene.environment?cur.hemiI:cur.hemiI+.9;
  renderer.toneMappingExposure=cur.expo;
  for(const[m,d,w]of WETMATS){m.roughness=lerp(d,w,cur.wet);m.envMapIntensity=1+cur.wet*.8}
  if(water){const wu=water.material.uniforms;wu.sunDirection.value.copy(SUNV);wu.sunColor.value.setRGB(...cur.sunC);wu.waterColor.value.setRGB(...cur.water);wu.distortionScale.value=cur.wave}
  rain.visible=cur.rain>.05;rainMat.opacity=.32*cur.rain;
}
function setWeather(w){if(!WX[w])return;weather=w;envDirty=true;envT=0;try{localStorage.setItem('olp2-w',w)}catch(e){}
  document.querySelectorAll('[data-w]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.w===w))}
function stepWeather(dt){const t=WX[weather],k=Math.min(1,dt*.7);let diff=0;
  for(const key in t){const a=cur[key],b=t[key];if(Array.isArray(b)){for(let i=0;i<b.length;i++){diff+=Math.abs(a[i]-b[i]);a[i]=lerp(a[i],b[i],k)}}else{diff+=Math.abs(a-b)/(Math.abs(b)+.01);cur[key]=lerp(a,b,k)}}
  applyWeather();envT+=dt;if(envDirty&&(diff<.05||envT>1.2)){updateEnv();envT=0;if(diff<.05)envDirty=false}}

