// 下载 OSM 的学校（amenity=school），整理成 data/schools.json。游戏载入时把学校旁边的路段划成学校区（sim/school.js）。
// 用法：node tools/fetch_schools.mjs [区域 id，默认 all]（区域带 extra 的，把那几块一起下载）
// 每条：{ name, pts: [[纬度, 经度]…] }：校园轮廓（简化过）；只有一个点的学校 pts 只有一个点
import fs from 'fs';
const id = process.argv[2] || 'all', RG = JSON.parse(fs.readFileSync(new URL('./regions.json', import.meta.url))), R = RG[id];
const els = [];
for (const part of [id, ...(R.extra || [])]) {
  const b = RG[part].bbox.join(',');
  const q = `[out:json][timeout:200];(way["amenity"="school"](${b});node["amenity"="school"](${b}););out geom;relation["amenity"="school"](${b});out center;`;
  let got = null;
  for (let i = 0; i < 6 && !got; i++) {
    const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'User-Agent': 'osm-extract-script/1.0', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
    if (r.ok) got = await r.json(); else { console.log('下载失败', r.status, '重试'); await new Promise(res => setTimeout(res, 6000 * (i + 1))); }
  }
  if (!got) process.exit(1);
  els.push(...got.elements);
}
const seen = new Set(), out = [];
for (const e of els) {
  const k = e.type + e.id; if (seen.has(k)) continue; seen.add(k);
  let pts;
  if (e.type === 'node') pts = [[e.lat, e.lon]];
  else if (e.type === 'way' && e.geometry) { const g = e.geometry, step = Math.max(1, Math.ceil(g.length / 24)); pts = g.filter((_, i) => i % step === 0).map(p => [p.lat, p.lon]); }
  else if (e.center) pts = [[e.center.lat, e.center.lon]];
  else continue;
  out.push({ name: e.tags?.name || '', pts: pts.map(([a, b]) => [+a.toFixed(6), +b.toFixed(6)]) });
}
fs.writeFileSync(new URL('../data/schools.json', import.meta.url), JSON.stringify({ note: 'OSM 学校（amenity=school），tools/fetch_schools.mjs 生成', rows: out }));
console.log('saved', out.length, '所学校');
