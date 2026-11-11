// 从 Overpass 下载一个区域的 OSM 原始数据到 tools/raw/。用法：node tools/fetch_osm.mjs <区域 id>（区域表在 tools/regions.json）
import fs from 'fs';
const R = JSON.parse(fs.readFileSync(new URL('./regions.json', import.meta.url)))[process.argv[2]];
if (!R) { console.log('没有这个区域'); process.exit(1); }
const b = R.bbox.join(',');
const q = `[out:json][timeout:300][maxsize:1073741824];(
  way["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|residential|unclassified|living_street)$"](${b});
  node["highway"~"^(traffic_signals|stop|crossing|give_way)$"](${b});
  way["building"](${b}); way["leisure"="park"](${b});
);out body; >; out skel qt;`;
const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'User-Agent': 'osm-extract-script/1.0', Accept: '*/*', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
if (!r.ok) { console.log('下载失败', r.status); process.exit(1); }
const t = await r.text(); fs.writeFileSync(new URL('./raw/' + R.raw, import.meta.url), t); console.log('saved', R.raw, (t.length / 1e6).toFixed(1), 'MB');
