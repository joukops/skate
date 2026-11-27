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
  padM=M({color:lin('#26292d'),roughness:.55}),hairM=M({color:lin('#3a2a1f'),roughness:.9}),eyeM=M({color:lin('#1a1a1a'),roughness:.3}),
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
 /* helmet: shell with vent slots, rim and chin strap */
 const hm=add(new THREE.SphereGeometry(.122,28,16,0,Math.PI*2,0,Math.PI*.52),helmetM,head,0,.168,.0);hm.scale.set(.93,1,1.08);
 for(let i=-2;i<=2;i++){const v=add(new THREE.BoxGeometry(.016,.012,.09),helmetV,head,i*.04,.288-Math.abs(i)*.012,-.01);v.rotation.z=i*.18}
 {const o=add(new THREE.TorusGeometry(.117,.007,6,30),helmetV,head,0,.17,0);o.rotation.x=Math.PI/2;o.scale.set(.93,1.08,1)}
 for(const s of [-1,1]){const st=add(new THREE.CylinderGeometry(.003,.003,.12,4),strapM,head,s*.07,.1,-.01);st.rotation.z=s*.35}}
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
for(const kn of [knL,knR]){add(new THREE.SphereGeometry(.068,14,10),padM,kn,0,-.02,-.045).scale.set(1,1.25,.75);   /* knee pad */
  const f=new THREE.Group();f.position.y=-.42;kn.add(f);ANK.push(f);
  /* boot: heel at +z, toe at -z (forward); sole 8 cm below the ankle */
  const sk3=new THREE.Group();sk3.position.set(0,-.085,.075);sk3.rotation.y=Math.PI/2;f.add(sk3);
  add(BOOT,shellM,sk3,0,0,0);
  add(new THREE.BoxGeometry(.33,.012,.09),soleM,sk3,.135,-.004,0);
  const cg=new THREE.Group();cg.position.set(.06,.12,0);sk3.add(cg);CUFF.push(cg);   /* the cuff hinges at the ankle and follows the shin */
  add(SHAFT,shellM,cg,0,0,0);
  const cuff=add(new THREE.CylinderGeometry(.062,.066,.12,18,1,true),shellA,cg,0,.12,0);cuff.scale.set(1.12,1,.95);cuff.material.side=THREE.DoubleSide;
  add(new THREE.TorusGeometry(.06,.012,8,20),linerM,cg,-.005,.185,0).rotation.x=Math.PI/2;
  add(new THREE.BoxGeometry(.012,.02,.13),strapM,cg,.055,.13,0).rotation.z=.3;   /* power strap */
  add(new THREE.BoxGeometry(.03,.012,.012),buckleM,cg,.06,.142,-.055);
  add(new THREE.BoxGeometry(.11,.012,.115),strapM,sk3,.17,.115,0).rotation.z=-.55; /* instep buckle */
  add(new THREE.BoxGeometry(.028,.01,.012),buckleM,sk3,.17,.125,-.06);
  for(let i=0;i<4;i++)add(new THREE.BoxGeometry(.004,.003,.07),M({color:lin('#8a8f95'),roughness:.6}),sk3,.215+i*.02,.092-i*.008,0).rotation.z=-.45;   /* laces */
  /* frame: two aluminium rails, mounts under heel and toe */
  for(const zz of [-.022,.016])add(FRAME,frameM,sk3,0,-.05,zz);
  add(new THREE.BoxGeometry(.05,.03,.04),frameM,sk3,.03,-.02,0);add(new THREE.BoxGeometry(.05,.03,.04),frameM,sk3,.24,-.02,0);
  /* four 100 mm wheels; axles 5 cm above the ground */
  for(let w=0;w<4;w++){const hub=new THREE.Group();hub.position.set(-.012+w*.103,-.05-.008,0);sk3.add(hub);
    const t=add(WHEEL,tyreM,hub,0,0,0);t.rotation.y=Math.PI/2;
    const h=add(HUB,hubM,hub,0,0,0);h.rotation.y=Math.PI/2;
    for(let k=0;k<5;k++){const sp=add(SPOKE,hubM,hub,0,0,0);sp.rotation.z=k/5*Math.PI;sp.position.set(0,0,0)}
    add(BEAR,bearM,hub,0,0,0).rotation.y=Math.PI/2;
    WHEELS.push(hub);SPIN.push(hub)}}
