/* =====================================================================
   SKATER
   ===================================================================== */
function capsule(r,len,seg=14){const p=[],q=6;for(let i=0;i<=q;i++){const a=-Math.PI/2+i/q*Math.PI/2;p.push(new THREE.Vector2(Math.max(1e-3,Math.cos(a)*r),Math.sin(a)*r-len/2))}
  for(let i=1;i<=q;i++){const a=i/q*Math.PI/2;p.push(new THREE.Vector2(Math.max(1e-3,Math.cos(a)*r),Math.sin(a)*r+len/2))}const g=new THREE.LatheGeometry(p,seg);g.translate(0,-len/2,0);return g}
const WHEELS=[],TV=new THREE.Vector3();const sk=new THREE.Group();scene.add(sk);const UPV=new THREE.Vector3(0,1,0),ZV=new THREE.Vector3(0,0,1),surfN=new THREE.Vector3(0,1,0),tmpN=new THREE.Vector3(),qA=new THREE.Quaternion(),qY=new THREE.Quaternion(),qL=new THREE.Quaternion();
const skin=M({color:lin('#d6a17c'),roughness:.65}),jacket=M({color:lin('#5fa8d8'),roughness:.7}),pants=M({color:lin('#1d2b3a'),roughness:.85}),
  helmetM=M({color:lin('#f39200'),roughness:.35}),bootM=M({color:lin('#f2f3f4'),roughness:.45}),wheelM=M({color:lin('#3e9c57'),roughness:.55}),alum=M({color:lin('#b9c0c6'),roughness:.3,metalness:.85});
const add=(g,m,p,x=0,y=0,z=0)=>{const o=new THREE.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;p.add(o);return o};
const pelvis=new THREE.Group();sk.add(pelvis);
add(new THREE.SphereGeometry(.16,16,12),pants,pelvis).scale.set(1.15,.75,.85);
const torso=new THREE.Group();pelvis.add(torso);
{const pr=[[.001,0],[.14,.01],[.155,.1],[.15,.22],[.175,.38],[.19,.48],[.15,.56],[.07,.6],[.001,.6]].map(([r,y])=>new THREE.Vector2(r,y));add(new THREE.LatheGeometry(pr,20),jacket,torso).scale.set(1,1,.68);
 add(new THREE.BoxGeometry(.26,.32,.12),M({color:lin('#2a2f35'),roughness:.8}),torso,0,.36,.13)}
const head=new THREE.Group();head.position.y=.62;torso.add(head);
add(capsule(.05,.06),skin,head,0,.05,0);
add(new THREE.SphereGeometry(.105,20,16),skin,head,0,.13,0).scale.set(.92,1.08,1);
add(new THREE.SphereGeometry(.125,20,12,0,Math.PI*2,0,Math.PI*.55),helmetM,head,0,.15,.01);
add(new THREE.BoxGeometry(.17,.035,.05),dark,head,0,.14,-.09);
function limb(par,x,y,l1,l2,r1,r2,m1,m2){const a=new THREE.Group();a.position.set(x,y,0);par.add(a);add(capsule(r1,l1),m1,a);const b=new THREE.Group();b.position.y=-l1;a.add(b);add(capsule(r2,l2),m2,b);return[a,b]}
const [shL,elL]=limb(torso,-.21,.52,.27,.25,.05,.042,jacket,skin),[shR,elR]=limb(torso,.21,.52,.27,.25,.05,.042,jacket,skin);
const [hipL,knL]=limb(pelvis,-.1,0,.44,.42,.075,.06,pants,pants),[hipR,knR]=limb(pelvis,.1,0,.44,.42,.075,.06,pants,pants);
for(const kn of [knL,knR]){add(new THREE.SphereGeometry(.07,10,8),dark,kn,0,0,-.04).scale.set(1,1.2,.7);
  const f=new THREE.Group();f.position.y=-.42;kn.add(f);
  add(new THREE.BoxGeometry(.12,.2,.27),bootM,f,0,-.04,-.03);add(new THREE.BoxGeometry(.13,.06,.14),dark,f,0,.06,.03);
  add(new THREE.BoxGeometry(.035,.05,.33),alum,f,0,-.165,-.03);
  for(let w=0;w<4;w++){const wh=add(new THREE.CylinderGeometry(.04,.04,.03,16),wheelM,f,0,-.2,-.15+w*.08);wh.rotation.z=Math.PI/2;WHEELS.push(wh)}}

