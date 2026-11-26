import fs from 'node:fs';import {execSync} from 'node:child_process';
const log=[];const L=(...a)=>{const m=a.join(' ');console.log(m);log.push(m)};
const get=async u=>{try{const r=await fetch(u);const t=await r.text();L('GET',u,r.status,r.headers.get('content-type'),t.length,'|',t.slice(0,1500).replace(/\s+/g,' '));return t}catch(e){L('GET',u,'ERR',e.message);return''}};
fs.mkdirSync('data',{recursive:true});
const idx=await get('https://kartta.hel.fi/3d/');
for(const m of idx.matchAll(/(?:src|href)="([^"]+\.(?:js|json))"/g))L('ref',m[1]);
for(const p of ['config.json','app.config.json','map.config.json','config/config.json','configs/app.config.json','assets/config.json'])await get('https://kartta.hel.fi/3d/'+p);
// look inside the main js bundle for config/tileset urls
for(const m of idx.matchAll(/src="([^"]+\.js)"/g)){const u=new URL(m[1],'https://kartta.hel.fi/3d/').href;try{const t=await (await fetch(u)).text();for(const k of t.matchAll(/["'`]([^"'`]*(?:config|tileset)[^"'`]*\.json)["'`]/g))L('jsref',k[1])}catch(e){}}
// Kalasatama CityGML: list zip entries and peek at structure
try{execSync('curl -sSL -o /tmp/k.zip http://3d.hel.ninja/data/citygml/Helsinki3D_CityGML_Kalasatama_20190326.zip');L(execSync('unzip -l /tmp/k.zip | head -30').toString());
  execSync('mkdir -p /tmp/k && cd /tmp/k && unzip -o -q /tmp/k.zip');const f=execSync("find /tmp/k -name '*.gml' -o -name '*.xml' | head -20").toString();L(f);
  const first=f.split('\n')[0];if(first){const s=fs.readFileSync(first,'utf8');L('size',s.length);L(s.slice(0,3000).replace(/\s+/g,' '));
    const tags={};for(const m of s.matchAll(/<([a-zA-Z]+:[A-Za-z]+)[ >]/g))tags[m[1]]=(tags[m[1]]||0)+1;L(JSON.stringify(Object.entries(tags).sort((a,b)=>b[1]-a[1]).slice(0,60)));
    const env=s.match(/<gml:Envelope[\s\S]*?<\/gml:Envelope>/);L('env',env&&env[0].replace(/\s+/g,' '))}}catch(e){L('zip err',e.message)}
fs.writeFileSync('data/probe-log.txt',log.join('\n')+'\n');
