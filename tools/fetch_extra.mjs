// 下载“让街景更像真的”用的补充数据：店铺 / 机构的名字、门牌号、用地类型、水面。存到 tools/raw/osm_<id>_x.json
// 用法：node tools/fetch_extra.mjs <区域 id>
import fs from 'fs';
const id = process.argv[2], R = JSON.parse(fs.readFileSync(new URL('./regions.json', import.meta.url)))[id];
if (!R) { console.log('没有这个区域'); process.exit(1); }
const b = R.bbox.join(',');
const q = `[out:json][timeout:300][maxsize:1073741824];(
  node["name"]["shop"](${b}); node["name"]["amenity"](${b}); node["name"]["tourism"](${b}); node["name"]["office"](${b}); node["name"]["craft"](${b}); node["name"]["leisure"](${b});
  node["addr:housenumber"](${b});
  way["landuse"~"^(residential|commercial|retail|industrial)$"](${b});
  way["natural"="water"](${b}); relation["natural"="water"](${b}); way["natural"="coastline"](${b});
);out geom;`;
const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'User-Agent': 'osm-extract-script/1.0', Accept: '*/*', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
if (!r.ok) { console.log('下载失败', r.status, (await r.text()).slice(0, 300)); process.exit(1); }
const t = await r.text(), out = `osm_${id}_x.json`; fs.writeFileSync(new URL('./raw/' + out, import.meta.url), t); console.log('saved', out, (t.length / 1e6).toFixed(1), 'MB');
