/* ---------------- m/s Kökar: the Kruunuvuorenranta – Meritullintori ferry ----------------
   36.4 m, built 1967 (Uudenkaupungin telakka). Navy hull with a white band, yellow superstructure: a passenger saloon
   with a blue window band (you can ride inside), open aft deck, foredeck, wheelhouse on the saloon roof, mast, funnel,
   orange rescue boat and white raft canisters. It lies alongside the quay at Meritullintori; board it and sail across. */
const FERRY={on:false,ready:false};
function buildFerry(){try{
  const L=36.4,HB=4.3,quayNear=(x0,z0,R,dir,spr)=>{/* nearest water edge from a land point, searching in one direction, with the edge's normal */let best=null;for(let r=2;r<=R&&!best;r+=2)for(let q=-8;q<=8;q++){const an=dir+q/8*spr,x=x0+Math.cos(an)*r,z=z0+Math.sin(an)*r;if(isWater(x,z)&&isWater(x+Math.cos(an)*8,z+Math.sin(an)*8)){best=[x,z];break}}
      if(!best)return null;let[x,z]=best;const n=waterNormal(x,z,0,1);for(let k=0;k<12&&isWater(x,z);k++){x-=n[0]*.5;z-=n[1]*.5}return{x,z,n}};
  const A=quayNear(-924,1684,160,0,.9),Bq=quayNear(1975,1765,320,Math.PI,.9);if(!A||!Bq)return;
  const deckY=T(A.x-A.n[0]*2,A.z-A.n[1]*2)+.02,hd=deckY-SEA;
  /* the ferry lies alongside: its side 0.4 m off the quay, bow pointing along the edge */
  const dock=(q,side)=>{const tx=-q.n[1]*side,tz=q.n[0]*side;return{x:q.x+q.n[0]*(HB+.4),z:q.z+q.n[1]*(HB+.4),yaw:Math.atan2(-tx,-tz)}};
  const DA=dock(A,1);
  /* Kruunuvuorenranta: a 30 m floating pier out from the shore, the ferry alongside its end */
  const pier0=[Bq.x-Bq.n[0]*3,Bq.z-Bq.n[1]*3],pier1=[Bq.x+Bq.n[0]*26,Bq.z+Bq.n[1]*26],ph0=T(pier0[0],pier0[1])+.05;
  {const P=[],H=[];for(let i=0;i<=14;i++){const t=i/14;P.push([lerp(pier0[0],pier1[0],t),lerp(pier0[1],pier1[1],t)]);const d=t*29;H.push(d<12?lerp(ph0,deckY,d/12):deckY)}addDeck(P,H,4,'Ferry pier');
    const g=new THREE.Group(),wm=M({color:lin('#8a8177'),roughness:.85}),fm=M({color:lin('#d8d3c8'),roughness:.7});
    for(let i=0;i<14;i++){const a=P[i],b=P[i+1],cx=(a[0]+b[0])/2,cz=(a[1]+b[1])/2,l=Math.hypot(b[0]-a[0],b[1]-a[1]),h=(H[i]+H[i+1])/2;
      const m=new THREE.Mesh(new THREE.BoxGeometry(4,.35,l+.05),wm);m.position.set(cx,h-.18,cz);m.rotation.y=Math.atan2(b[0]-a[0],b[1]-a[1]);m.rotation.x=-Math.atan2(H[i+1]-H[i],l);m.receiveShadow=true;g.add(m)}
    const fl=new THREE.Mesh(new THREE.BoxGeometry(5,1.2,20),fm);fl.position.set((P[8][0]+P[14][0])/2,SEA+.25,(P[8][1]+P[14][1])/2);fl.rotation.y=Math.atan2(pier1[0]-pier0[0],pier1[1]-pier0[1]);g.add(fl);   /* pontoon */
    const sh=new THREE.Mesh(new THREE.BoxGeometry(3,2.6,5),M({color:lin('#3b4a57'),roughness:.4,metalness:.4,transparent:true,opacity:.55}));sh.position.set(P[10][0],deckY+1.3,P[10][1]);sh.rotation.y=fl.rotation.y;g.add(sh);   /* wind shelter */
    scene.add(g)}
  const pd=[pier1[0]-pier0[0],pier1[1]-pier0[1]],pl=Math.hypot(...pd),pu=[pd[0]/pl,pd[1]/pl],pnx=-pu[1],pnz=pu[0];
  const DB={x:pier1[0]-pu[0]*9+pnx*(2+HB+.4),z:pier1[1]-pu[1]*9+pnz*(2+HB+.4)};DB.yaw=Math.atan2(-pu[0],-pu[1]);   /* bow out along the pier */
  /* ---- model (local: +x bow, +z port, y up from the waterline) ---- */
  const grp=new THREE.Group();scene.add(grp);const add=(g,m,x,y,z,p=grp)=>{const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;p.add(o);return o};
  const halfW=lx=>{const s=lx+18.2,b=18.2-lx;return HB*Math.min(1,Math.sqrt(Math.max(0,b)/5.5),.82+.18*Math.min(1,s/3))};
  const navy=M({color:lin('#1c2d55'),roughness:.55}),white=M({color:lin('#f1f0ea'),roughness:.5}),yel=M({color:lin('#f2c22a'),roughness:.5}),win=M({color:lin('#16307a'),roughness:.15,metalness:.3}),
    glass=M({color:lin('#151a20'),roughness:.08,metalness:.5}),inner=M({color:lin('#e9e4d8'),roughness:.8}),floorM=M({color:lin('#7b6e60'),roughness:.7}),seat=M({color:lin('#2f4f8f'),roughness:.8}),orange=M({color:lin('#e8642a'),roughness:.5}),grey=M({color:lin('#8c8f92'),roughness:.4,metalness:.5});
  /* hull: plan outline lofted from keel to deck edge, navy below, white band above */
  {const N=40,pts=[];for(let i=0;i<=N;i++){const lx=-18.2+L*i/N;pts.push([lx,halfW(lx)])}const sh=new THREE.Shape();sh.moveTo(pts[0][0],-pts[0][1]);for(const[x,w]of pts)sh.lineTo(x,w);for(let i=N;i>=0;i--)sh.lineTo(pts[i][0],-pts[i][1]);
    const mk2=(y0,y1,m)=>{const g=new THREE.ExtrudeGeometry(sh,{depth:y1-y0,bevelEnabled:false,curveSegments:2});g.rotateX(-Math.PI/2);g.translate(0,y0,0);
      const p=g.attributes.position;for(let i=0;i<p.count;i++){const y=p.getY(i),k=clamp((y+2.2)/(hd+2.2),0,1);p.setZ(i,p.getZ(i)*(.62+.38*Math.sqrt(k)))}g.computeVertexNormals();return add(g,m,0,0,0)};
    mk2(-2.2,hd-1.1,navy);mk2(hd-1.1,hd-.05,white);
    const dg=new THREE.ShapeGeometry(sh);dg.rotateX(-Math.PI/2);add(dg,floorM,0,hd-.04,0).scale.set(.995,1,.98);
    /* bulwark with the boarding gates open on both sides */
    for(let i=0;i<N;i++){const[a,wa]=pts[i],[b,wb]=pts[i+1];for(const sd of [-1,1]){if(a>-13.2&&b<-8.2)continue;const l=Math.hypot(b-a,wb-wa);const o=add(new THREE.BoxGeometry(l+.02,1.05,.1),yel,(a+b)/2,hd+.48,sd*(wa+wb)/2-.05*sd);o.rotation.y=-sd*Math.atan2(wb-wa,b-a)}}
    for(let i=0;i<=4;i++){const z=-HB*.8+i*HB*.4;add(new THREE.BoxGeometry(.1,1.05,HB*.4),yel,-18.15,hd+.48,z)}}
  /* passenger saloon */
  const S0=-6,S1=9,SW=2.9,SH=2.35;const roofG=new THREE.Group();grp.add(roofG);
  for(const sd of [-1,1]){add(new THREE.BoxGeometry(S1-S0,SH,.12),yel,(S0+S1)/2,hd+SH/2,sd*SW);add(new THREE.BoxGeometry(S1-S0-1.2,.85,.02),win,(S0+S1)/2,hd+1.45,sd*(SW+.07));
    add(new THREE.BoxGeometry(S1-S0-.2,SH-.1,.02),inner,(S0+S1)/2,hd+SH/2,sd*(SW-.07))}
  for(const xw of [S0,S1])for(const sd of [-1,1]){add(new THREE.BoxGeometry(.12,SH,SW-.8),yel,xw,hd+SH/2,sd*(.8+(SW-.8)/2))}
  for(const xw of [S0,S1])add(new THREE.BoxGeometry(.12,.35,1.6),yel,xw,hd+SH-.17,0);   /* over the doors */
  add(new THREE.BoxGeometry(S1-S0+.4,.14,SW*2+.4),yel,(S0+S1)/2,hd+SH+.07,0,roofG);add(new THREE.BoxGeometry(S1-S0-.2,.02,SW*2-.2),inner,(S0+S1)/2,hd+SH-.02,0,roofG);
  for(let i=0;i<6;i++)for(const sd of [-1,1]){const x=S0+1.4+i*2.3;add(new THREE.BoxGeometry(1.7,.45,.5),seat,x,hd+.23,sd*(SW-.38));add(new THREE.BoxGeometry(1.7,.55,.1),seat,x,hd+.7,sd*(SW-.12))}   /* benches along the windows */
  {const lamp=M({color:lin('#fffbe8'),emissive:lin('#fff4d0'),emissiveIntensity:1.2,roughness:.5});for(let i=0;i<4;i++)add(new THREE.BoxGeometry(1.2,.04,.25),lamp,S0+2+i*3.4,hd+SH-.05,0,roofG)}
  /* upper deck: wheelhouse, mast, funnel, rescue boat, rafts, railings */
  add(new THREE.BoxGeometry(4.6,2.1,4.4),yel,6.6,hd+SH+1.15,0,roofG);add(new THREE.BoxGeometry(.05,.75,3.8),glass,8.92,hd+SH+1.55,0,roofG);for(const sd of [-1,1])add(new THREE.BoxGeometry(3.6,.7,.03),glass,6.6,hd+SH+1.55,sd*2.21,roofG);
  add(new THREE.BoxGeometry(5,.12,4.9),white,6.6,hd+SH+2.26,0,roofG);
  {const m=add(new THREE.BoxGeometry(.35,7,.35),yel,7.6,hd+SH+5.6,0,roofG);m.rotation.z=-.12;add(new THREE.BoxGeometry(.12,.12,2.6),yel,7.3,hd+SH+7.4,0,roofG);add(new THREE.BoxGeometry(.8,.1,3.2),white,6.3,hd+SH+2.6,0,roofG)}   /* mast, radar */
  {const f=add(new THREE.BoxGeometry(1.6,2.6,1.4),yel,-4.6,hd+SH+1.4,0,roofG);f.rotation.z=.18;const t=add(new THREE.BoxGeometry(1.7,.4,1.5),navy,-4.85,hd+SH+2.7,0,roofG);t.rotation.z=.18}   /* funnel */
  {const b=add(new THREE.CapsuleGeometry(.7,3,4,10),orange,2.6,hd+SH+.9,1.4,roofG);b.rotation.z=Math.PI/2;b.scale.set(1,1,.8)}
  for(const x of [-1.5,.5])for(const sd of [-1,1]){const c=add(new THREE.CapsuleGeometry(.35,1,3,8),white,x,hd+SH+.5,sd*2.2,roofG);c.rotation.z=Math.PI/2}
  for(const sd of [-1,1])for(let i=0;i<3;i++)add(new THREE.BoxGeometry(S1-S0-1,.04,.04),grey,(S0+S1)/2-.5,hd+SH+.4+i*.35,sd*(SW+.1),roofG);
  /* names and logos */
  const label=(txt,w,h,col,bg,font)=>{const c=mk(512,Math.round(512*h/w)),g=c.getContext('2d');if(bg){g.fillStyle=bg;g.fillRect(0,0,c.width,c.height)}g.fillStyle=col;g.font=font;g.textAlign='center';g.textBaseline='middle';g.fillText(txt,c.width/2,c.height/2);
    const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return new THREE.MeshBasicMaterial({map:t,transparent:!bg})};
  for(const sd of [-1,1]){const n=add(new THREE.PlaneGeometry(3.4,.7),label('KÖKAR',3.4,.7,'#1c2d55',null,"800 110px 'Inter Tight', sans-serif"),13.5,hd-.55,sd*(halfW(13.5)+.03));n.rotation.y=sd>0?0:Math.PI;
    const f=add(new THREE.PlaneGeometry(5,1),label('FinFerries',5,1,'#1c2d55',null,"italic 800 120px 'Inter Tight', sans-serif"),-1.5,hd+.6,sd*(SW+.08));f.rotation.y=sd>0?0:Math.PI;
    const k2=add(new THREE.PlaneGeometry(2.4,.6),label('KÖKAR  TURKU',2.4,.6,'#1c2d55',null,"700 90px 'Inter Tight', sans-serif"),-15.5,hd-.55,sd*(halfW(-15.5)+.03));k2.rotation.y=sd>0?0:Math.PI}
  /* ---- route: out from the quay, across the water on a clearance grid, into the pier ---- */
  const C=8,gx0=Math.min(DA.x,DB.x)-900,gz0=Math.min(DA.z,DB.z)-900,GW=Math.ceil((Math.abs(DA.x-DB.x)+1800)/C),GH=Math.ceil((Math.abs(DA.z-DB.z)+1800)/C);
  const free=new Uint8Array(GW*GH);for(let j=0;j<GH;j++)for(let i=0;i<GW;i++){const x=gx0+i*C,z=gz0+j*C;let ok=isWater(x,z);for(let a=0;a<8&&ok;a++)ok=isWater(x+Math.cos(a*.785)*14,z+Math.sin(a*.785)*14);free[j*GW+i]=ok?1:0}
  const cell=(x,z)=>[Math.round((x-gx0)/C),Math.round((z-gz0)/C)];
  const outA=[DA.x+A.n[0]*30,DA.z+A.n[1]*30],outB=[DB.x+pnx*30,DB.z+pnz*30];
  const near=(x,z)=>{const[i0,j0]=cell(x,z);for(let r=0;r<12;r++)for(let dj=-r;dj<=r;dj++)for(let di=-r;di<=r;di++){const i=i0+di,j=j0+dj;if(i>=0&&j>=0&&i<GW&&j<GH&&free[j*GW+i])return j*GW+i}return -1};
  const s0=near(...outA),s1=near(...outB);let path=null;
  if(s0>=0&&s1>=0){const dist=new Float32Array(GW*GH).fill(1e9),from=new Int32Array(GW*GH).fill(-1),open=[[0,s0]];dist[s0]=0;const h=k=>Math.hypot(k%GW-s1%GW,(k/GW|0)-(s1/GW|0));
    while(open.length){let bi=0;for(let q=1;q<open.length;q++)if(open[q][0]<open[bi][0])bi=q;const[,k]=open[bi];open[bi]=open[open.length-1];open.pop();if(k===s1)break;const i=k%GW,j=k/GW|0;
      for(let dj=-1;dj<=1;dj++)for(let di=-1;di<=1;di++){if(!di&&!dj)continue;const ii=i+di,jj=j+dj;if(ii<0||jj<0||ii>=GW||jj>=GH)continue;const kk=jj*GW+ii;if(!free[kk])continue;const nd=dist[k]+Math.hypot(di,dj);if(nd<dist[kk]){dist[kk]=nd;from[kk]=k;open.push([nd+h(kk),kk])}}}
    if(from[s1]>=0){const ks=[];for(let k=s1;k>=0;k=from[k])ks.push(k);ks.reverse();let P=ks.map(k=>[gx0+(k%GW)*C,gz0+(k/GW|0)*C]);
      const los=(a,b)=>{const n=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/4);for(let q=0;q<=n;q++){const[i,j]=cell(lerp(a[0],b[0],q/n),lerp(a[1],b[1],q/n));if(!free[j*GW+i])return false}return true};
      const S=[P[0]];let q=0;while(q<P.length-1){let r=P.length-1;while(r>q+1&&!los(P[q],P[r]))r--;S.push(P[r]);q=r}
      path=[[DA.x,DA.z],outA,...S,outB,[DB.x,DB.z]];for(let it=0;it<3;it++){const Q=[path[0]];for(let k=0;k<path.length-1;k++){const a=path[k],b=path[k+1];Q.push([a[0]*.75+b[0]*.25,a[1]*.75+b[1]*.25],[a[0]*.25+b[0]*.75,a[1]*.25+b[1]*.75])}Q.push(path[path.length-1]);path=Q}}}
  if(!path)path=[[DA.x,DA.z],outA,outB,[DB.x,DB.z]];
  const SL=[0];for(let k=1;k<path.length;k++)SL.push(SL[k-1]+Math.hypot(path[k][0]-path[k-1][0],path[k][1]-path[k-1][1]));
  Object.assign(FERRY,{grp,roofG,deckY,hd,DA,DB,path,SL,len:SL[SL.length-1],s:0,dir:0,v:0,state:'docked',at:'A',x:DA.x,z:DA.z,yaw:DA.yaw,halfW,S0,S1,SW,ready:true,dockSide:1});
  {const F=FERRY;F.gA=Math.sign(ferryLocal(A.x,A.z)[1])||1;F.x=DB.x;F.z=DB.z;F.yaw=DB.yaw;F.gB=Math.sign(ferryLocal(pier1[0]-pu[0]*9,pier1[1]-pu[1]*9)[1])||1;F.x=DA.x;F.z=DA.z;F.yaw=DA.yaw}
  ferryPlace();
  SPOTS.push({id:'ferry',n:'Ferry Kökar',s:'Meritullintori — board and sail to Kruunuvuorenranta',x:DA.x-A.n[0]*8,z:DA.z-A.n[1]*8,r:14})
 }catch(e){console.warn('ferry',e)}}
function ferryPlace(){const F=FERRY;F.grp.position.set(F.x,SEA,F.z);F.grp.rotation.y=F.yaw+Math.PI/2}   /* model +x is the bow; yaw 0 faces -z */
/* local frame: lx toward the bow, lz to port */
function ferryLocal(x,z){const F=FERRY,dx=x-F.x,dz=z-F.z,fx=-Math.sin(F.yaw),fz=-Math.cos(F.yaw);return[dx*fx+dz*fz,-(dx*fz-dz*fx)]}
function ferryWalk(lx,lz){const F=FERRY,a=Math.abs(lz);if(lx<-17.6||lx>16.8||a>F.halfW(lx)-.35)return false;
  if(lx>F.S0-.15&&lx<F.S1+.15){if(a>F.SW-.12&&a<F.SW+.12)return false;if((lx<F.S0+.15||lx>F.S1-.15)&&a>.8)return false;if(a>F.SW-.8&&a<F.SW&&lx>F.S0+.5&&lx<F.S1-.5)return false}   /* walls, doors, benches */
  return true}
function ferryGate(lx,lz){const F=FERRY;if(F.state!=='docked')return false;const side=F.at==='A'?F.gA:F.gB;return lx>-13&&lx<-8.4&&lz*side>0&&Math.abs(lz)<F.halfW(lx)+1.6}
function ferryG(x,z,y){const F=FERRY;if(!F.ready||y<F.deckY-1.5)return null;const[lx,lz]=ferryLocal(x,z);if(ferryWalk(lx,lz)||ferryGate(lx,lz))return F.deckY;return null}
function ferryBlocked(x,z){const F=FERRY;if(!F.ready)return null;const[lx,lz]=ferryLocal(x,z),inBox=lx>-19&&lx<18.5&&Math.abs(lz)<F.halfW(lx)+.6;
  if(ferryGate(lx,lz))return 0;if(inBox)return ferryWalk(lx,lz)&&Math.abs(Pl.y-F.deckY)<1?0:2;if(F.on)return 7;return null}
function ferryUpdate(dt){const F=FERRY;if(!F.ready)return;
  if(F.state==='sailing'){const tgt=F.dir>0?F.len:0,rem=Math.abs(tgt-F.s),vmax=(F.fast?28:11);F.v=Math.min(vmax,F.v+dt*(F.fast?3:.7),Math.sqrt(2*.5*rem)+.3);
    F.s+=F.dir*F.v*dt;if(F.dir>0?F.s>=F.len:F.s<=0){F.s=tgt;F.state='docked';F.at=F.dir>0?'B':'A';F.v=0;F.fast=false;pop(F.at==='B'?'Kruunuvuorenranta':'Meritullintori')}}
  let k=0;while(k<F.SL.length-2&&F.SL[k+1]<F.s)k++;const t=clamp((F.s-F.SL[k])/((F.SL[k+1]-F.SL[k])||1),0,1),a=F.path[k],b=F.path[k+1];
  const nx=lerp(a[0],b[0],t),nz=lerp(a[1],b[1],t);let want=Math.atan2(-(b[0]-a[0]),-(b[1]-a[1]))+(F.dir<0?Math.PI:0);
  const dE=Math.min(F.s,F.len-F.s);if(dE<45)want=F.s<F.len/2?F.DA.yaw:F.DB.yaw;if(F.state==='docked')want=F.at==='A'?F.DA.yaw:F.DB.yaw;
  let dy=want-F.yaw;dy=Math.atan2(Math.sin(dy),Math.cos(dy));const ny=F.yaw+clamp(dy,-dt*.25*(F.fast?3:1),dt*.25*(F.fast?3:1));
  /* carry the skater with the ship */
  if(F.on){const[lx,lz]=ferryLocal(Pl.x,Pl.z);F.x=nx;F.z=nz;F.yaw=ny;const fx=-Math.sin(ny),fz=-Math.cos(ny);Pl.x=nx+fx*lx-fz*lz;Pl.z=nz+fz*lx+fx*lz;Pl.yaw+=ny-(F._y??ny);Pl.camYaw+=ny-(F._y??ny);Pl.y=Math.max(Pl.y,F.deckY);Pl.visY=null}
  else{F.x=nx;F.z=nz;F.yaw=ny}F._y=ny;ferryPlace();
  const[lx,lz]=ferryLocal(Pl.x,Pl.z);F.on=ferryWalk(lx,lz)&&Math.abs(Pl.y-F.deckY)<.6;
  const inside=F.on&&lx>F.S0&&lx<F.S1&&Math.abs(lz)<F.SW;F.roofG.visible=!inside;   /* cut-away roof while you're in the saloon */
  const btn=$('ferryBtn');if(btn){const show=F.on&&state==='play';btn.style.display=show?'block':'none';
    if(show)btn.textContent=F.state==='docked'?(F.at==='A'?'⛴  Sail to Kruunuvuorenranta':'⛴  Sail to Meritullintori'):(F.fast?'Sailing…':'Sailing… tap to speed up ⏩')}}
function ferryGo(){const F=FERRY;if(!F.ready)return;if(F.state==='sailing'){F.fast=true;return}F.dir=F.at==='A'?1:-1;F.state='sailing';F.v=0;pop(F.dir>0?'Departing for Kruunuvuorenranta':'Departing for Meritullintori')}
