// 下载 OSM 的铁路平交道口（railway=level_crossing）和经过它的铁轨，整理成 data/rail.json。
// 用法：node tools/fetch_rail.mjs [区域 id，默认 all]（区域带 extra 的，把那几块一起下载）
// 每条：{ at: [纬度, 经度], kind: rail / light_rail / tram, gates: 有没有栏杆, line: [[纬度, 经度]…] 道口前后各约 400 米的铁轨 }
// 游戏载入时按位置对到路段上（sim/rail.js 的 makeRail）。
import fs from 'fs';
const id = process.argv[2] || 'all', RG = JSON.parse(fs.readFileSync(new URL('./regions.json', import.meta.url))), R = RG[id];
const els = [];
for (const part of [id, ...(R.extra || [])]) {
  const b = RG[part].bbox.join(',');
  const q = `[out:json][timeout:200];node["railway"="level_crossing"](${b})->.x;.x out;way(bn.x)["railway"~"^(rail|light_rail|tram)$"];out geom;`;
  let got = null;
  for (let i = 0; i < 6 && !got; i++) {
    const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'User-Agent': 'osm-extract-script/1.0', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
    if (r.ok) got = await r.json(); else { console.log('下载失败', r.status, '重试'); await new Promise(res => setTimeout(res, 6000 * (i + 1))); }
  }
  if (!got) process.exit(1);
  els.push(...got.elements);
}
const LAT0 = (R.bbox[0] + R.bbox[2]) / 2, KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KZ = 110574;
const dist = (a, b) => Math.hypot((a.lon - b.lon) * KX, (a.lat - b.lat) * KZ);
const nodes = new Map(), ways = new Map();
for (const e of els) { if (e.type === 'node') nodes.set(e.id, e); else if (e.type === 'way') ways.set(e.id, e); }
// 每个道口：找经过它的铁轨，从道口往两头各取约 400 米；同一处多条轨道只取一条（火车沿它开）
const out = [], seen = new Set();
for (const n of nodes.values()) {
  if (seen.has(n.id)) continue; seen.add(n.id);
  const w = [...ways.values()].find(w => w.nodes.includes(n.id)); if (!w || !w.geometry) continue;
  const i = w.nodes.indexOf(n.id), g = w.geometry;
  const walk = (step) => { const pts = []; let d = 0; for (let k = i + step; k >= 0 && k < g.length && d < 400; k += step) { d += dist(g[k], g[k - step]); pts.push(g[k]); } return pts; };
  const back = walk(-1).reverse(), fwd = walk(1);
  if (back.length + fwd.length < 1) continue;
  const line = [...back, g[i], ...fwd].map(p => [+p.lat.toFixed(7), +p.lon.toFixed(7)]);
  const bar = n.tags?.['crossing:barrier'], gates = bar ? bar !== 'no' : w.tags.railway === 'rail';
  out.push({ at: [n.lat, n.lon], kind: w.tags.railway, gates, name: w.tags.name || '', line });
}
const cnt = {}; for (const o of out) cnt[o.kind] = (cnt[o.kind] || 0) + 1;
fs.writeFileSync(new URL('../data/rail.json', import.meta.url), JSON.stringify({ note: 'OSM 铁路平交道口，tools/fetch_rail.mjs 生成', rows: out }));
console.log('saved', out.length, cnt);
