/* =====================================================================
   SKATER — an adult (~1.78 m) built from shaped (lathe/extruded) parts:
   helmet with vents, face, hooded windbreaker, jeans, knee pads, wrist guards,
   and inline skates: hard-shell boot, cuff and buckles, aluminium frame,
   4 x 100 mm wheels each (urethane tyre, spoked hub) that spin with speed.
   ===================================================================== */
function capsule(r,len,seg=14){const p=[],q=6;for(let i=0;i<=q;i++){const a=-Math.PI/2+i/q*Math.PI/2;p.push(new THREE.Vector2(Math.max(1e-3,Math.cos(a)*r),Math.sin(a)*r-len/2))}
  for(let i=1;i<=q;i++){const a=i/q*Math.PI/2;p.push(new THREE.Vector2(Math.max(1e-3,Math.cos(a)*r),Math.sin(a)*r+len/2))}const g=new THREE.LatheGeometry(p,seg);g.translate(0,-len/2,0);return g}
/* tapered limb along -y: radii at fractions of the length, rounded ends */
function taper(len,rs,seg=18){const p=[new THREE.Vector2(.001,0)];const n=rs.length;for(let i=0;i<n;i++){const t=i/(n-1);p.push(new THREE.Vector2(rs[i],-t*len))}p.push(new THREE.Vector2(.001,-len-rs[n-1]*.4));
  const r0=rs[0];p.splice(1,0,new THREE.Vector2(r0*.7,r0*.35));const g=new THREE.LatheGeometry(p,seg);g.computeVertexNormals();return g}
function fabric(base,lines){const c=mk(128,128),g=c.getContext('2d');g.fillStyle=base;g.fillRect(0,0,128,128);speckle(g,128,128,2500,.06,.06);
  if(lines){g.strokeStyle='rgba(0,0,0,.08)';for(let y=0;y<128;y+=3){g.beginPath();g.moveTo(0,y);g.lineTo(128,y+2);g.stroke()}}return c}
const WHEELS=[],SPIN=[],ANK=[],CUFF=[],TV=new THREE.Vector3();const sk=new THREE.Group();scene.add(sk);const UPV=new THREE.Vector3(0,1,0),ZV=new THREE.Vector3(0,0,1),surfN=new THREE.Vector3(0,1,0),tmpN=new THREE.Vector3(),qA=new THREE.Quaternion(),qY=new THREE.Quaternion(),qL=new THREE.Quaternion();
const skin=M({color:lin('#c99476'),roughness:.6}),
  jacket=M({map:tex(fabric('#ffffff',true),2,2),color:lin('#2f6fa8'),roughness:.62}),jacket2=M({color:lin('#1f4f7c'),roughness:.7}),
  pants=M({map:tex(fabric('#ffffff',true),2,2),color:lin('#2b3442'),roughness:.88}),
  helmetM=M({color:lin('#e8e9ea'),roughness:.28,metalness:.05}),helmetV=M({color:lin('#202326'),roughness:.6}),
  padM=M({color:lin('#26292d'),roughness:.55}),hairM=M({color:lin('#6b4426'),roughness:.9}),capM=M({color:lin('#b4552f'),roughness:.85}),capB=M({color:lin('#8e3f22'),roughness:.85}),eyeM=M({color:lin('#1a1a1a'),roughness:.3}),
  shellM=M({color:lin('#1c1f23'),roughness:.32,metalness:.1}),shellA=M({color:lin('#d23a2a'),roughness:.4}),linerM=M({color:lin('#3a3f46'),roughness:.9}),
  frameM=M({color:lin('#b8bec4'),roughness:.25,metalness:.9}),tyreM=M({color:lin('#e7e3d6'),roughness:.55}),hubM=M({color:lin('#1d1f22'),roughness:.4,metalness:.4}),bearM=M({color:lin('#c9ced2'),roughness:.2,metalness:.95}),
  strapM=M({color:lin('#111316'),roughness:.6}),buckleM=M({color:lin('#c0c5ca'),roughness:.25,metalness:.9}),soleM=M({color:lin('#2a2d31'),roughness:.8});
const add=(g,m,p,x=0,y=0,z=0)=>{const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;p.add(o);return o};
const pelvis=new THREE.Group();sk.add(pelvis);
/* hips and seat of the jeans */
add(new THREE.SphereGeometry(.15,22,16),pants,pelvis,0,.03,0).scale.set(1.1,.75,.8);
add(new THREE.SphereGeometry(.1,16,12),pants,pelvis,0,-.02,.05).scale.set(1.35,.75,.75);
const torso=new THREE.Group();pelvis.add(torso);
{/* windbreaker torso: waist -> ribcage -> chest -> shoulders */
 const pr=[[.001,0],[.15,.0],[.158,.06],[.152,.16],[.165,.28],[.185,.40],[.192,.47],[.175,.53],[.12,.585],[.06,.6],[.001,.6]].map(([r,y])=>new THREE.Vector2(r,y));
 add(new THREE.LatheGeometry(pr,28),jacket,torso).scale.set(1,1,.66);
 {const o=add(new THREE.TorusGeometry(.152,.016,8,28),jacket2,torso,0,.01,0);o.rotation.x=Math.PI/2;o.scale.set(1,.66,1)}   /* hem */
 for(const s of [-1,1])add(new THREE.SphereGeometry(.062,14,10),jacket,torso,s*.18,.5,0).scale.set(1,.85,.95);   /* shoulders */
 add(new THREE.CylinderGeometry(.004,.004,.42,4),M({color:lin('#d8dadc'),metalness:.8,roughness:.3}),torso,0,.3,-.128);   /* zip */
 const hood=add(new THREE.SphereGeometry(.11,16,10,0,Math.PI*2,0,Math.PI*.6),jacket2,torso,0,.53,.1);hood.scale.set(1.2,.55,.7);hood.rotation.x=-.9;
 }
const head=new THREE.Group();head.position.y=.6;torso.add(head);
add(taper(.09,[.046,.05,.052],12),skin,head,0,.09,0);   /* neck */
{const sk2=add(new THREE.SphereGeometry(.098,24,18),skin,head,0,.16,-.005);sk2.scale.set(.86,1.08,.98);
 add(new THREE.SphereGeometry(.07,16,12),skin,head,0,.1,-.03).scale.set(1.05,.8,1);   /* jaw */
 add(new THREE.ConeGeometry(.016,.04,8),skin,head,0,.15,-.1).rotation.x=-Math.PI/2;    /* nose */
 for(const s of [-1,1]){add(new THREE.SphereGeometry(.024,10,8),skin,head,s*.085,.155,0).scale.set(.45,1,.75);
   add(new THREE.SphereGeometry(.011,8,6),eyeM,head,s*.033,.175,-.083)}
 add(new THREE.SphereGeometry(.1,18,10,0,Math.PI*2,0,Math.PI*.42),hairM,head,0,.17,.015).scale.set(.9,1,1);
 /* brown hair showing under a burnt-clay cap: tufts over the ears and at the nape */
 for(const[x,y,z,sx,sy,sz]of [[-.075,.13,.03,.5,.9,1],[.075,.13,.03,.5,.9,1],[0,.12,.075,1.05,.75,.6],[-.05,.11,.06,.6,.7,.7],[.05,.11,.06,.6,.7,.7]])add(new THREE.SphereGeometry(.06,12,10),hairM,head,x,y,z).scale.set(sx,sy,sz);
 {const cap=add(new THREE.SphereGeometry(.108,28,14,0,Math.PI*2,0,Math.PI*.5),capM,head,0,.175,.005);cap.scale.set(.93,.82,1.02);
  const br=add(new THREE.CylinderGeometry(.085,.085,.008,24,1,false,Math.PI*.5,Math.PI),capM,head,0,.18,-.06);br.scale.set(1,1,.75);br.rotation.x=.12;   /* brim */
  add(new THREE.TorusGeometry(.099,.005,6,32),capB,head,0,.178,.005).rotation.x=Math.PI/2;add(new THREE.SphereGeometry(.009,8,6),capM,head,0,.264,.005)}}
function limb(par,x,y,l1,l2,r1,r2,m1,m2,arm){const a=new THREE.Group();a.position.set(x,y,0);par.add(a);
  add(taper(l1,arm?[r1*1.15,r1*1.05,r1*.9,r1*.78]:[r1*1.18,r1*1.08,r1*.95,r1*.8,r1*.72]),m1,a);
  const b=new THREE.Group();b.position.y=-l1;a.add(b);
  add(taper(l2,arm?[r2*1.05,r2*1.1,r2*.9,r2*.72]:[r2*1.05,r2*1.2,r2*1.05,r2*.8,r2*.66]),m2,b);return[a,b]}
const [shL,elL]=limb(torso,-.2,.5,.28,.25,.048,.04,jacket,jacket,true),[shR,elR]=limb(torso,.2,.5,.28,.25,.048,.04,jacket,jacket,true);
for(const el of [elL,elR]){add(new THREE.CylinderGeometry(.034,.036,.09,12),padM,el,0,-.19,0);   /* wrist guard */
  const hand=add(new THREE.SphereGeometry(.045,12,10),padM,el,0,-.29,-.005);hand.scale.set(.7,1.15,.9);
  add(capsule(.013,.03,8),padM,el,.03*(el===elL?1:-1),-.27,-.02).rotation.z=.6*(el===elL?1:-1)}
const [hipL,knL]=limb(pelvis,-.088,-.01,.44,.42,.082,.056,pants,pants),[hipR,knR]=limb(pelvis,.088,-.01,.44,.42,.082,.056,pants,pants);
/* inline skate: side profile of the hard-shell boot (u = from heel to toe, y = up from the sole) */
function bootGeo(P){const s=new THREE.Shape();
  s.moveTo(P[0][0],P[0][1]);for(let i=1;i<P.length;i++)s.lineTo(P[i][0],P[i][1]);s.closePath();
  const g=new THREE.ExtrudeGeometry(s,{depth:.07,bevelEnabled:true,bevelThickness:.016,bevelSize:.014,bevelSegments:4,curveSegments:8});g.translate(0,0,-.035);
  /* narrow the toe and the cuff a little */
  const p=g.attributes.position;for(let i=0;i<p.count;i++){const u=p.getX(i),y=p.getY(i),z=p.getZ(i);const k=u>.2?1-(u-.2)*1.6:y>.2?.92:1;p.setZ(i,z*k)}g.computeVertexNormals();return g}
function frameGeo(){const s=new THREE.Shape();s.moveTo(-.035,0);s.lineTo(.335,0);s.lineTo(.335,.022);
  for(let i=3;i>=0;i--){const c=-.012+i*.103;s.lineTo(c+.04,.022);s.quadraticCurveTo(c,-.025,c-.04,.022)}s.lineTo(-.035,.022);s.closePath();
  for(let i=0;i<3;i++){const c=.04+i*.103,h=new THREE.Path();h.moveTo(c-.02,.006);h.lineTo(c+.02,.006);h.lineTo(c+.012,.016);h.lineTo(c-.012,.016);h.closePath();s.holes.push(h)}
  const g=new THREE.ExtrudeGeometry(s,{depth:.006,bevelEnabled:true,bevelThickness:.001,bevelSize:.001,bevelSegments:1});return g}
function wheelGeo(){/* 100 mm urethane tyre, 24 mm wide, rounded profile */const R=.05,w=.012,pts=[];for(let i=0;i<=12;i++){const a=-Math.PI/2+i/12*Math.PI;pts.push(new THREE.Vector2(R-.012+Math.cos(a)*.012,Math.sin(a)*w))}
  pts.unshift(new THREE.Vector2(.022,-w));pts.push(new THREE.Vector2(.022,w));const g=new THREE.LatheGeometry(pts,32);g.rotateZ(Math.PI/2);return g}
/* the shoe stays on the frame; the shaft above the ankle is a separate piece that hinges with the shin */
const BOOT=bootGeo([[0,0],[.285,0],[.3,.02],[.298,.05],[.27,.075],[.2,.1],[.15,.135],[.135,.165],[-.028,.165],[-.025,.1],[-.03,.04],[-.015,.008]]),
  SHAFT=bootGeo([[.075,.02],[.07,.08],[.07,.15],[.055,.18],[-.05,.19],[-.085,.17],[-.09,.08],[-.088,.02]]),FRAME=frameGeo(),WHEEL=wheelGeo(),HUB=new THREE.CylinderGeometry(.022,.022,.026,6).rotateZ(Math.PI/2),BEAR=new THREE.CylinderGeometry(.0095,.0095,.03,12).rotateZ(Math.PI/2),SPOKE=new THREE.BoxGeometry(.024,.004,.03);
const shoeM=M({color:lin('#2c3036'),roughness:.7}),shoeS=M({color:lin('#e9e6df'),roughness:.8});
/* low-top skate shoe: a sculpted upper (heel high, toe box low and round), a cupsole that is wider at the ball, a rubber toe cap */
const SN=(()=>{const L0=-.035,L1=.3,len=L1-L0,wid=u=>{const t=(u-L0)/len;return .036+.018*Math.sin(Math.PI*Math.min(1,t*1.15))+(t>.55?.004:0)},
    top=u=>{const t=(u-L0)/len;return .022+.083*(1-Math.pow(Math.max(0,t-.05)/.95,1.7))*(t<.08?.92+t:1)};
  const g=new THREE.SphereGeometry(1,32,20),p=g.attributes.position;
  for(let i=0;i<p.count;i++){const X=p.getX(i),Y=p.getY(i),Z=p.getZ(i),u=L0+(X+1)/2*len,h=top(u);
    const y=Y>=0?.018+Y*(h-.018):.018+Y*.006;p.setXYZ(i,u,y,Z*wid(u)*(Y>=0?Math.sqrt(1-Y*Y*.35):1))}g.computeVertexNormals();
  const sh=new THREE.Shape(),N=28,pts=[];for(let i=0;i<=N;i++){const u=L0-.004+(len+.008)*i/N;pts.push([u,wid(u)+.005])}
  sh.moveTo(pts[0][0],0);for(const[u,w]of pts)sh.lineTo(u,w);for(let i=pts.length-1;i>=0;i--)sh.lineTo(pts[i][0],-pts[i][1]);sh.closePath();
  const sole=new THREE.ExtrudeGeometry(sh,{depth:.016,bevelEnabled:true,bevelThickness:.004,bevelSize:.004,bevelSegments:2,curveSegments:4});sole.rotateX(Math.PI/2);sole.translate(0,.02,0);
  const toe=new THREE.SphereGeometry(1,16,10,0,Math.PI*2,Math.PI*.35,Math.PI*.4);toe.scale(.05,.035,.05);toe.translate(L1-.04,.022,0);
  return{upper:g,sole,toe,top}})();
for(const kn of [knL,knR]){add(new THREE.SphereGeometry(.068,14,10),padM,kn,0,-.02,-.045).scale.set(1,1.25,.75);   /* knee pad */
  const f=new THREE.Group();f.position.y=-.42;kn.add(f);ANK.push(f);
  /* sneaker: heel at +z, toe at -z; sole 8.5 cm below the ankle */
  const sk3=new THREE.Group();sk3.position.set(0,-.072,.045);sk3.rotation.y=Math.PI/2;sk3.scale.set(.78,1,.95);f.add(sk3);
  add(SN.upper,shoeM,sk3);add(SN.sole,shoeS,sk3);
  for(let i=0;i<5;i++){const u=.115+i*.026,o=add(new THREE.CapsuleGeometry(.0028,.045,2,6),shoeS,sk3,u,SN.top(u)+.002,0);o.rotation.x=Math.PI/2;o.rotation.z=-.35*(1-i*.12)}   /* laces */

  CUFF.push(new THREE.Group())}
/* powered skateboard: 98 cm deck, grip tape, two trucks, four 90 mm wheels, belt drives on the rear truck, battery under the deck */
/* how a skateboard moves: the trucks stay on the ground; leaning tilts the deck (and rider) on the bushings around the kingpins,
   and that tilt steers the two trucks in opposite directions. An ollie pops the tail and pivots the board up around it. */
const olG=new THREE.Group();olG.position.z=.42;sk.add(olG);const olI=new THREE.Group();olI.position.z=-.42;olG.add(olI);
const rollG=new THREE.Group();rollG.position.y=.075;olI.add(rollG);const rollI=new THREE.Group();rollI.position.y=-.075;rollG.add(rollI);rollI.add(pelvis);
const TRK=[-.31,.31].map(z=>{const g=new THREE.Group();g.position.z=z;olI.add(g);return g});
const board=new THREE.Group();rollI.add(board);const DECKY=.128;
{const deckS=new THREE.Shape(),L=.49,W=.125;deckS.moveTo(-W,-L+.1);deckS.quadraticCurveTo(-W,-L,0,-L);deckS.quadraticCurveTo(W,-L,W,-L+.1);deckS.lineTo(W,L-.1);deckS.quadraticCurveTo(W,L,0,L);deckS.quadraticCurveTo(-W,L,-W,L-.1);deckS.closePath();
 const dg=new THREE.ExtrudeGeometry(deckS,{depth:.014,bevelEnabled:true,bevelThickness:.003,bevelSize:.003,bevelSegments:2,curveSegments:10});dg.rotateX(Math.PI/2);
 {const p=dg.attributes.position;for(let i=0;i<p.count;i++){const z=p.getZ(i),k=Math.max(0,Math.abs(z)-.36);p.setY(i,p.getY(i)+k*k*3.2+.0)}dg.computeVertexNormals()}   /* kicktails */
 const woodM=M({color:lin('#c79a5e'),roughness:.6}),gripM=M({color:lin('#1b1c1e'),roughness:.95});
 const deck=add(dg,woodM,board,0,DECKY,0);
 const gg=dg.clone();const grip=add(gg,gripM,board,0,DECKY+.0012,0);grip.scale.set(.985,.2,.99);
 const trM=M({color:lin('#9aa0a6'),roughness:.35,metalness:.85}),bushM=M({color:lin('#e8b321'),roughness:.6}),urM=M({color:lin('#f0ede2'),roughness:.45}),coreM=M({color:lin('#2a2c30'),roughness:.4}),
   batM=M({color:lin('#26282b'),roughness:.5,metalness:.2}),motM=M({color:lin('#3a3d42'),roughness:.3,metalness:.8}),ledM=M({color:lin('#3fb6ff'),emissive:lin('#2a8fff'),emissiveIntensity:2,roughness:.4});
 for(const tz of [-.31,.31]){add(new THREE.BoxGeometry(.065,.012,.09),trM,board,0,DECKY-.02,tz);                    /* baseplate */
   add(new THREE.CylinderGeometry(.018,.018,.03,10),bushM,board,0,DECKY-.04,tz);                                    /* bushing */
   const tg=TRK[tz<0?0:1];add(new THREE.BoxGeometry(.2,.026,.03),trM,tg,0,.052,0);                                 /* hanger */
   add(new THREE.CylinderGeometry(.005,.005,.27,8).rotateZ(Math.PI/2),trM,tg,0,.045,0);                            /* axle */
   for(const sx of [-1,1]){const hub=new THREE.Group();hub.position.set(sx*.118,.045,0);tg.add(hub);
     const wg=new THREE.CylinderGeometry(.045,.045,.05,24).rotateZ(Math.PI/2);add(wg,urM,hub);
     add(new THREE.CylinderGeometry(.024,.024,.052,10).rotateZ(Math.PI/2),coreM,hub);
     for(let k=0;k<3;k++)add(new THREE.BoxGeometry(.054,.006,.03),coreM,hub).rotation.x=k*Math.PI/3;
     WHEELS.push(hub);SPIN.push(hub)}}
 for(const sx of [-1,1]){add(new THREE.CylinderGeometry(.027,.027,.055,14).rotateX(Math.PI/2),motM,TRK[1],sx*.075,.06,.07);   /* motors on the rear truck */
   add(new THREE.BoxGeometry(.012,.07,.1),M({color:lin('#202224'),roughness:.6}),TRK[1],sx*.15,.05,.04)}                     /* belt covers */
 add(new THREE.BoxGeometry(.17,.032,.5),batM,board,0,DECKY-.03,0);                 /* battery enclosure */
 add(new THREE.BoxGeometry(.004,.008,.42),ledM,board,.087,DECKY-.035,0);add(new THREE.BoxGeometry(.004,.008,.42),ledM,board,-.087,DECKY-.035,0)}
/* throttle remote in the back hand */
add(new THREE.BoxGeometry(.035,.09,.03),M({color:lin('#151618'),roughness:.4}),elR,0,-.3,-.02);
pelvis.rotation.y=-Math.PI/2;   /* stands sideways on the board, facing the right-hand side (regular stance: left foot at the nose) */
/* ---- riders on other vehicles: a Wolt courier on a sit-down e-scooter, or you on a rental kick scooter (Voi, Dott, Ryde) ---- */
const WOLT={on:false,wheels:[]},KICK={on:false,wheels:[],brand:null};
const MAT=(c,r=.5,m=0)=>M({color:lin(c),roughness:r,metalness:m});
/* a rounded person: tapered limbs, shoulders, hands, shoes; returns joints to pose */
function person(jacketC,pantsC,helmetC){const g=new THREE.Group(),J={},skinM=MAT('#c99476',.6),jk=MAT(jacketC,.7),pn=MAT(pantsC,.8),sh=MAT('#1d1f22',.6),hm=MAT(helmetC,.3);
  const limb=(r0,r1,l,m)=>{const geo=new THREE.CylinderGeometry(r1,r0,l,12,1);geo.translate(0,-l/2,0);const o=new THREE.Mesh(geo,m);o.castShadow=true;return o},ball=(r,m)=>{const o=new THREE.Mesh(new THREE.SphereGeometry(r,14,10),m);o.castShadow=true;return o};
  J.hip=new THREE.Group();g.add(J.hip);{const p=ball(.17,pn);p.scale.set(1.15,.7,.85);J.hip.add(p)}
  J.chest=new THREE.Group();J.chest.position.y=.05;J.hip.add(J.chest);{const t=limb(.15,.19,.5,jk);t.rotation.x=Math.PI;t.position.y=0;J.chest.add(t);t.scale.set(1.15,1,.78);const sh2=ball(.2,jk);sh2.scale.set(1.25,.55,.8);sh2.position.y=.48;J.chest.add(sh2)}
  J.head=new THREE.Group();J.head.position.y=.6;J.chest.add(J.head);{const n=limb(.05,.055,.1,skinM);n.rotation.x=Math.PI;J.head.add(n);const h=ball(.1,skinM);h.position.y=.17;h.scale.set(.9,1.1,1);J.head.add(h);
    const hl=new THREE.Mesh(new THREE.SphereGeometry(.13,20,14,0,Math.PI*2,0,Math.PI*.58),hm);hl.position.y=.19;hl.scale.set(.95,1,1.08);hl.castShadow=true;J.head.add(hl);
    const vz=new THREE.Mesh(new THREE.SphereGeometry(.125,16,8,Math.PI*.6,Math.PI*.8,Math.PI*.35,Math.PI*.22),MAT('#1b2b38',.08,.6));vz.position.y=.18;J.head.add(vz)}
  for(const sx of [-1,1]){const S=new THREE.Group();S.position.set(sx*.23,.46,0);J.chest.add(S);const u=limb(.06,.05,.29,jk);S.add(u);const E=new THREE.Group();E.position.y=-.29;S.add(E);const f=limb(.05,.04,.27,jk);E.add(f);const hd=ball(.045,sh);hd.position.y=-.3;E.add(hd);
    const H=new THREE.Group();H.position.set(sx*.1,-.05,0);J.hip.add(H);const th=limb(.085,.065,.43,pn);H.add(th);const K=new THREE.Group();K.position.y=-.43;H.add(K);const sn=limb(.06,.045,.42,pn);K.add(sn);
    const ft=new THREE.Mesh(new THREE.CapsuleGeometry(.045,.16,4,8),sh);ft.rotation.x=Math.PI/2;ft.position.set(0,-.45,-.06);ft.castShadow=true;K.add(ft);J[sx<0?'L':'R']={S,E,H,K}}
  return{g,J}}
const wolt=new THREE.Group();wolt.visible=false;sk.add(wolt);
{const body=MAT('#eef0f2',.3,.1),trim=MAT('#2a2d31',.5),tyre=MAT('#141414',.85),rim=MAT('#c4c8cc',.25,.85),blue=MAT('#00c2e8',.45);
 const wheel=(r)=>{const g=new THREE.Group(),t=new THREE.Mesh(new THREE.TorusGeometry(r,.055,12,28),tyre);t.rotation.y=Math.PI/2;g.add(t);const h=new THREE.Mesh(new THREE.CylinderGeometry(r*.68,r*.68,.07,20).rotateZ(Math.PI/2),rim);g.add(h);WOLT.wheels.push(g);return g};
 const rw=wheel(.18);rw.position.set(0,.235,.58);wolt.add(rw);
 WOLT.steer=new THREE.Group();WOLT.steer.position.set(0,0,-.55);WOLT.steer.rotation.x=-.42;wolt.add(WOLT.steer);   /* raked fork */
 const fw=wheel(.18);fw.position.set(0,.235,-.05);wolt.add(fw);WOLT.front=fw;
 /* Vespa-like body: lathe-turned rear cowl, rounded leg shield, floorboard */
 {const pts=[];for(let i=0;i<=16;i++){const t=i/16;pts.push(new THREE.Vector2(.02+.2*Math.sin(Math.PI*Math.min(1,t*1.05))**.7,t*.95))}const g=new THREE.LatheGeometry(pts,24);g.rotateX(Math.PI/2);const c=new THREE.Mesh(g,body);c.scale.set(.95,.55,1);c.position.set(0,.5,-.05);c.castShadow=true;wolt.add(c)}
 {const fb=new THREE.Mesh(new THREE.BoxGeometry(.36,.07,.62),trim);fb.position.set(0,.3,-.05);wolt.add(fb);const sd=new THREE.Mesh(new THREE.CapsuleGeometry(.05,.55,4,8),body);sd.rotation.x=Math.PI/2;sd.position.set(0,.29,-.05);sd.scale.set(3.6,1,1);wolt.add(sd)}
 {const ls=new THREE.Mesh(new THREE.SphereGeometry(.42,24,16,0,Math.PI*2,0,Math.PI*.5),body);ls.scale.set(.45,1.05,.28);ls.rotation.x=-Math.PI/2+.35;ls.position.set(0,.42,-.42);ls.castShadow=true;wolt.add(ls)}
 {const st=new THREE.Mesh(new THREE.CylinderGeometry(.035,.035,.75,10),rim);st.position.set(0,.6,0);WOLT.steer.add(st);const hb=new THREE.Mesh(new THREE.CapsuleGeometry(.022,.6,4,8),trim);hb.rotation.z=Math.PI/2;hb.position.set(0,1.0,0);WOLT.steer.add(hb);
  const hc=new THREE.Mesh(new THREE.SphereGeometry(.12,16,10),body);hc.scale.set(1.2,.7,.9);hc.position.set(0,.98,-.02);WOLT.steer.add(hc);const hl=new THREE.Mesh(new THREE.CircleGeometry(.06,16),MAT('#fff7dd'));hl.material.emissive=lin('#fff2c0');hl.material.emissiveIntensity=1.2;hl.position.set(0,.98,-.13);hl.rotation.y=Math.PI;WOLT.steer.add(hl);
  for(const sx of [-1,1]){const fk=new THREE.Mesh(new THREE.CylinderGeometry(.018,.018,.55,8),rim);fk.position.set(sx*.07,.33,0);WOLT.steer.add(fk)}}
 {const seat=new THREE.Mesh(new THREE.CapsuleGeometry(.13,.42,6,12),MAT('#202225',.7));seat.rotation.x=Math.PI/2;seat.scale.set(1.05,.5,1);seat.position.set(0,.84,.18);seat.castShadow=true;wolt.add(seat)}
 {const tl=new THREE.Mesh(new THREE.BoxGeometry(.1,.04,.03),MAT('#ff2a1a'));tl.material.emissive=lin('#ff1a0a');tl.material.emissiveIntensity=1;tl.position.set(0,.66,.66);wolt.add(tl);const rk=new THREE.Mesh(new THREE.BoxGeometry(.36,.03,.34),rim);rk.position.set(0,.88,.56);wolt.add(rk)}
 /* Wolt box: rounded edges, logo on three faces */
 {const g=new THREE.BoxGeometry(.48,.46,.46,4,4,4),p=g.attributes.position,v=new THREE.Vector3();for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i);const q=v.clone().clampScalar(-.19,.19);const d=v.clone().sub(q);if(d.length()>0)d.setLength(Math.min(d.length(),.04));p.setXYZ(i,q.x+d.x*1.0+Math.sign(v.x)*(Math.abs(v.x)>.19?0:0),q.y+d.y,q.z+d.z)}g.computeVertexNormals();
  const bx=new THREE.Mesh(g,blue);bx.position.set(0,1.13,.6);bx.castShadow=true;wolt.add(bx);
  const c=document.createElement('canvas');c.width=256;c.height=128;const gg=c.getContext('2d');gg.fillStyle='#fff';gg.font="800 92px 'Inter Tight', sans-serif";gg.textAlign='center';gg.textBaseline='middle';gg.fillText('Wolt',128,66);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const lm=new THREE.MeshBasicMaterial({map:t,transparent:true});
  for(const[x,z,ry]of [[.236,.6,Math.PI/2],[-.236,.6,-Math.PI/2],[0,.834,0]]){const pl=new THREE.Mesh(new THREE.PlaneGeometry(.4,.2),lm);pl.position.set(x,1.13,z);pl.rotation.y=ry;wolt.add(pl)}}
 const R=person('#00a7d6','#23262b','#f2f4f6');R.g.position.set(0,.88,.2);wolt.add(R.g);WOLT.rider=R;const J=R.J;
 J.chest.rotation.x=-.28;J.head.rotation.x=.2;for(const s2 of ['L','R']){const j=J[s2],sx=s2==='L'?-1:1;j.H.rotation.x=1.45;j.K.rotation.x=-1.5;j.S.rotation.x=1.05;j.S.rotation.z=-sx*.18;j.E.rotation.x=.45}}
const kick=new THREE.Group();kick.visible=false;sk.add(kick);
const BRANDS={Voi:'#f26961',Dott:'#00a6e0',Ryde:'#79c143'};
function kickModel(brand,withRider){const g=new THREE.Group(),c=MAT(BRANDS[brand],.4,.1),dk=MAT('#1c1e21',.6),al=MAT('#c9cdd1',.3,.85),tyre=MAT('#141414',.85),ws=[];
  const wheel=z=>{const w=new THREE.Group(),t=new THREE.Mesh(new THREE.TorusGeometry(.11,.035,10,22),tyre);t.rotation.y=Math.PI/2;w.add(t);const h=new THREE.Mesh(new THREE.CylinderGeometry(.075,.075,.05,14).rotateZ(Math.PI/2),dk);w.add(h);w.position.set(0,.145,z);g.add(w);ws.push(w);return w};
  wheel(.5);wheel(-.42);
  {const d=new THREE.Mesh(new THREE.CapsuleGeometry(.07,.62,4,10),dk);d.rotation.x=Math.PI/2;d.scale.set(1.25,.55,1);d.position.set(0,.17,.06);g.add(d);const top=new THREE.Mesh(new THREE.BoxGeometry(.15,.012,.6),MAT('#2b2d30',.95));top.position.set(0,.205,.06);g.add(top)}
  {const sm=new THREE.Mesh(new THREE.CylinderGeometry(.03,.034,1.05,12),c);sm.position.set(0,.66,-.48);sm.rotation.x=-.18;g.add(sm);const hb=new THREE.Mesh(new THREE.CapsuleGeometry(.018,.48,4,8),dk);hb.rotation.z=Math.PI/2;hb.position.set(0,1.16,-.57);g.add(hb);
   const disp=new THREE.Mesh(new THREE.BoxGeometry(.09,.03,.06),dk);disp.position.set(0,1.17,-.55);g.add(disp);const fl=new THREE.Mesh(new THREE.BoxGeometry(.05,.03,.02),MAT('#fff7dd'));fl.material.emissive=lin('#fff2c0');fl.position.set(0,.95,-.56);g.add(fl);
   const rf=new THREE.Mesh(new THREE.BoxGeometry(.13,.03,.24),c);rf.position.set(0,.27,.53);rf.rotation.x=-.25;g.add(rf);
   const lb=document.createElement('canvas');lb.width=256;lb.height=64;const q=lb.getContext('2d');q.fillStyle='#fff';q.font="800 50px 'Inter Tight', sans-serif";q.textAlign='center';q.textBaseline='middle';q.fillText(brand.toUpperCase(),128,34);
   const t=new THREE.CanvasTexture(lb);t.colorSpace=THREE.SRGBColorSpace;for(const sx of [-1,1]){const p=new THREE.Mesh(new THREE.PlaneGeometry(.22,.055),new THREE.MeshBasicMaterial({map:t,transparent:true}));p.position.set(sx*.034,.7,-.47);p.rotation.set(-.18,sx*Math.PI/2,0,'YXZ');g.add(p)}}
  g.traverse(o=>{if(o.isMesh)o.castShadow=true});
  let rider=null;if(withRider){rider=person('#2f55b8','#1c2230','#d4461e');rider.g.position.set(0,1.12,.12);g.add(rider.g);const J=rider.J;J.chest.rotation.x=-.12;
    J.L.H.rotation.x=-.1;J.L.K.rotation.x=.15;J.R.H.rotation.x=.25;J.R.K.rotation.x=.1;for(const s2 of ['L','R']){J[s2].S.rotation.x=.95;J[s2].E.rotation.x=.5;J[s2].S.rotation.z=(s2==='L'?1:-1)*.15}}   /* one foot ahead of the other on the deck, hands on the bar */
  return{g,ws,rider}}
/* switch rides; 'board' | 'wolt' | 'kick' */
let RIDE='board';
function setRide(r,brand){RIDE=r;WOLT.on=r==='wolt';KICK.on=r==='kick';wolt.visible=WOLT.on;rollI.visible=r==='board';for(const t of TRK)t.visible=r==='board';
  if(KICK.on){kick.clear();const m=kickModel(brand||'Voi',true);kick.add(m.g);KICK.wheels=m.ws;KICK.rider=m.rider;KICK.brand=brand}kick.visible=KICK.on}
function setWolt(on){setRide(on?'wolt':'board');try{localStorage.setItem('skh-wolt',on?1:0)}catch(e){}}
