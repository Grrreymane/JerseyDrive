// 下载 OSM 的转向限制（禁止左转 / 右转 / 直行 / 掉头，只准左转 / 右转 / 直行），整理成 data/turns.json。
// 用法：node tools/fetch_turns.mjs [区域 id，默认 all]
// 每条：{ k: 限制种类, at: [纬度, 经度] 路口位置, from: [东, 南] 进路口的行驶方向, to: [东, 南] 出路口的行驶方向 }
// 方向是本地平面上的单位向量（x 朝东、z 朝南，和地图一致）。游戏载入时按位置和方向对到路口的进口 / 出口上（sim/map.js 的 markTurnBans）。
import fs from 'fs';
const id = process.argv[2] || 'all', R = JSON.parse(fs.readFileSync(new URL('./regions.json', import.meta.url)))[id];
const b = R.bbox.join(',');
const q = `[out:json][timeout:200];relation["type"="restriction"]["restriction"](${b})->.r;.r out body;way(r.r);out geom;node(r.r);out;`;
let j = null;
for (let i = 0; i < 5 && !j; i++) {
  const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', headers: { 'User-Agent': 'osm-extract-script/1.0', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
  if (r.ok) j = await r.json(); else { console.log('下载失败', r.status, '重试'); await new Promise(res => setTimeout(res, 6000 * (i + 1))); }
}
if (!j) process.exit(1);
const LAT0 = (R.bbox[0] + R.bbox[2]) / 2, KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KZ = 110574;
const P = (lat, lon) => [lon * KX, -lat * KZ];
const ways = new Map(), nodes = new Map();
for (const e of j.elements) { if (e.type === 'way') ways.set(e.id, e); else if (e.type === 'node') nodes.set(e.id, e); }
const unit = (a, b) => { const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1; return [+(dx / L).toFixed(3), +(dz / L).toFixed(3)]; };
const geo = (w) => w.geometry.map(g => ({ id: null, ll: [g.lat, g.lon], p: P(g.lat, g.lon) })).map((g, i) => ({ ...g, id: w.nodes[i] }));
const out = [], skip = {};
const no = (why) => { skip[why] = (skip[why] || 0) + 1; };
for (const r of j.elements) {
  if (r.type !== 'relation') continue;
  const k = r.tags.restriction; if (!/^(no|only)_/.test(k) || k === 'no_entry' || k === 'no_exit') { no('种类 ' + k); continue; }
  const from = r.members.filter(m => m.role === 'from' && m.type === 'way'), to = r.members.filter(m => m.role === 'to' && m.type === 'way'), via = r.members.filter(m => m.role === 'via');
  if (from.length !== 1 || to.length !== 1 || !via.length) { no('成员不全'); continue; }
  const F = ways.get(from[0].ref), T = ways.get(to[0].ref); if (!F || !T || !F.geometry || !T.geometry) { no('缺几何'); continue; }
  const fg = geo(F), tg = geo(T);
  // 交接点：via 是节点就用它；via 是一段路，就用 from 和 via 路相接处进、via 路和 to 相接处出（中间隔着分隔带的掉头这种）
  let inId, outId, at;
  if (via[0].type === 'node') { inId = outId = via[0].ref; const n = nodes.get(inId); if (!n) { no('缺 via'); continue; } at = [n.lat, n.lon]; }
  else {
    const V = via.map(m => ways.get(m.ref)).filter(Boolean); if (V.length !== via.length) { no('缺 via'); continue; }
    const vIds = new Set(V.flatMap(w => w.nodes)); inId = [fg[0].id, fg[fg.length - 1].id].find(x => vIds.has(x)); outId = [tg[0].id, tg[tg.length - 1].id].find(x => vIds.has(x));
    if (!inId || !outId) { no('via 路接不上'); continue; }
    const pts = V.flatMap(w => w.geometry); let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(...P(pts[i].lat, pts[i].lon).map((v, k) => v - P(pts[i - 1].lat, pts[i - 1].lon)[k]));
    if (len > 60) { no('via 路太长'); continue; }
    at = [pts.reduce((a, g) => a + g.lat, 0) / pts.length, pts.reduce((a, g) => a + g.lon, 0) / pts.length];
  }
  // 进来的方向：from 路上紧挨交接点的那个点 → 交接点；出去：交接点 → to 路上紧挨着的点
  const fi = fg.findIndex(g => g.id === inId), ti = tg.findIndex(g => g.id === outId);
  if (fi < 0 || ti < 0) { no('交接点不在路的端点'); continue; }
  if (fi !== 0 && fi !== fg.length - 1) { no('from 路从交接点中间穿过'); continue; }
  if (ti !== 0 && ti !== tg.length - 1) { no('to 路从交接点中间穿过'); continue; }
  const fPrev = fg[fi === 0 ? 1 : fi - 1], tNext = tg[ti === 0 ? 1 : ti - 1];
  out.push({ k, at: at.map(v => +v.toFixed(7)), from: unit(fPrev.p, fg[fi].p), to: unit(tg[ti].p, tNext.p), id: r.id });
}
const cnt = {}; for (const o of out) cnt[o.k] = (cnt[o.k] || 0) + 1;
fs.writeFileSync(new URL('../data/turns.json', import.meta.url), JSON.stringify({ note: 'OSM 转向限制（type=restriction 关系），tools/fetch_turns.mjs 生成', rows: out }));
console.log('saved', out.length, cnt, '跳过', skip);
