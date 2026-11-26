// Fetch the game's OpenStreetMap data with the Overpass API and store it gzipped in data/,
// so the game loads it from GitHub Pages instead of a busy public server.
import fs from 'node:fs';import zlib from 'node:zlib';
const BB={s:60.1680,w:24.9370,n:60.2085,e:25.0170};
const BBS=`${BB.s},${BB.w},${BB.n},${BB.e}`;
const QUERIES={
  ways:`[out:json][timeout:180];(way["highway"](${BBS});way["railway"~"^(rail|subway|tram|light_rail)$"](${BBS});way["man_made"~"^(bridge|pier)$"](${BBS}););out geom qt;`,
  buildings:`[out:json][timeout:180];(way["building"](${BBS});relation["building"]["type"="multipolygon"](${BBS});way["building:part"]["height"](${BBS});way["building:part"]["building:levels"](${BBS}););out geom qt;`,
  land:`[out:json][timeout:180];(way["natural"~"^(coastline|water|wood|scrub|grassland|heath|bare_rock|beach|sand|wetland)$"](${BBS});relation["natural"="water"](${BBS});way["water"](${BBS});way["landuse"](${BBS});way["leisure"~"^(park|pitch|playground|garden|dog_park|track|common|recreation_ground|nature_reserve)$"](${BBS});way["amenity"~"^(parking|school)$"](${BBS});way["place"="square"](${BBS});way["area:highway"](${BBS});node["natural"="tree"](${BBS}););out geom qt;`
};
const EP=['https://overpass-api.de/api/interpreter','https://overpass.kumi.systems/api/interpreter','https://overpass.private.coffee/api/interpreter','https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
fs.mkdirSync('data',{recursive:true});const log=[];
for(const [name,query] of Object.entries(QUERIES)){let ok=false;
  for(let round=0;round<3&&!ok;round++)for(const url of EP){try{const r=await fetch(url,{method:'POST',body:'data='+encodeURIComponent(query),headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'skate-helsinki (github.com/joukops/skate)'}});
      const txt=await r.text();if(!r.ok)throw new Error('HTTP '+r.status);const j=JSON.parse(txt);if(!j.elements||!j.elements.length)throw new Error('empty');if(j.remark&&/runtime error|timed out/i.test(j.remark))throw new Error(j.remark.slice(0,80));
      fs.writeFileSync('data/osm-'+name+'.json.gz',zlib.gzipSync(JSON.stringify({elements:j.elements,osm3s:j.osm3s}),{level:9}));log.push(name+' ok '+j.elements.length+' elements from '+url);ok=true;break}
    catch(e){log.push(name+' '+url+' '+e.message);await new Promise(r=>setTimeout(r,5000))}}
  if(!ok)log.push(name+' FAILED')}
fs.writeFileSync('data/osm-log.txt',log.join('\n')+'\n');console.log(log.join('\n'));
