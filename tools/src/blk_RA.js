/* rain */
const RAINN=mobile?2200:3600;const rainPos=new Float32Array(RAINN*6);const rainG=new THREE.BufferGeometry();rainG.setAttribute('position',new THREE.BufferAttribute(rainPos,3));
const rainMat=new THREE.LineBasicMaterial({color:0xcfd8e0,transparent:true,opacity:.3,depthWrite:false});const rain=new THREE.LineSegments(rainG,rainMat);rain.frustumCulled=false;rain.visible=false;scene.add(rain);
const RD2=new Float32Array(RAINN*3);for(let i=0;i<RAINN;i++){RD2[i*3]=rnd(-30,30);RD2[i*3+1]=rnd(-2,28);RD2[i*3+2]=rnd(-30,30)}
function updateRain(dt){if(!rain.visible)return;const cx=camera.position.x,cy=camera.position.y,cz=camera.position.z;
  for(let i=0;i<RAINN;i++){let y=RD2[i*3+1]-dt*16;if(y<-4){y+=32;RD2[i*3]=rnd(-30,30);RD2[i*3+2]=rnd(-30,30)}RD2[i*3+1]=y;const x=cx+RD2[i*3],z=cz+RD2[i*3+2],yy=cy+y,o=i*6;rainPos[o]=x;rainPos[o+1]=yy;rainPos[o+2]=z;rainPos[o+3]=x+.06;rainPos[o+4]=yy-.55;rainPos[o+5]=z+.03}
  rainG.attributes.position.needsUpdate=true}

