// 把 Overpass 下载的 OSM 原始数据（tools/raw/osm.json）处理成游戏用的 data/map.json。
// 用法：node tools/build_map.mjs
// 做的事：投影到本地米坐标 → 在路口处切段 → 合并同属性的连续路段 → 合并挨得很近的路口节点（双向分隔路）
//        → 判定每个路口的管制方式（红绿灯 / STOP / 推断的 STOP）→ 建筑、公园。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 区域：node tools/build_map.mjs [downtown|jsq|newark]，表在 tools/regions.json
const REGION = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/regions.json'), 'utf8'))[process.argv[2] || 'downtown'];
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/raw', REGION.raw), 'utf8'));
const OUT = path.join(ROOT, 'data', REGION.out);

const BBOX = { s: REGION.bbox[0], w: REGION.bbox[1], n: REGION.bbox[2], e: REGION.bbox[3] };
const LAT0 = (BBOX.s + BBOX.n) / 2, LON0 = (BBOX.w + BBOX.e) / 2;
const KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KZ = 110574;
const proj = (lat, lon) => [(lon - LON0) * KX, -(lat - LAT0) * KZ];
const HX = (BBOX.e - LON0) * KX, HZ = (BBOX.n - LAT0) * KZ;   // 半宽、半高（米）
const MARGIN = 30;
const inBounds = (p) => Math.abs(p[0]) <= HX + MARGIN && Math.abs(p[1]) <= HZ + MARGIN;

const nodes = new Map();
const ways = [];
for (const e of raw.elements) {
  if (e.type === 'node') { if (!nodes.has(e.id) || e.tags) nodes.set(e.id, { id: e.id, p: proj(e.lat, e.lon), tags: e.tags || {} }); }   // 同一个节点会出现两次，第二次不带标签
  else if (e.type === 'way') ways.push(e);
}

const DRIVE = new Set(['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'residential', 'unclassified', 'living_street']);
const r2 = (v) => Math.round(v * 100) / 100;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// ---------- 1. 路段属性 ----------
function attrs(t) {
  const cls = t.highway.replace('_link', '');
  const oneway = t.oneway === 'yes' || t.oneway === '1' || t.oneway === '-1' || t.junction === 'roundabout';
  const lanes = parseInt(t.lanes) || 0;
  let lf, lb;
  if (oneway) { lf = lanes || (cls === 'secondary' || cls === 'primary' ? 2 : 1); lb = 0; }
  else {
    lf = parseInt(t['lanes:forward']) || (lanes ? Math.ceil(lanes / 2) : 1);
    lb = parseInt(t['lanes:backward']) || (lanes ? Math.max(1, lanes - lf) : 1);
  }
  lf = Math.min(4, Math.max(1, lf)); lb = Math.min(4, lb);
  const speed = parseInt(t.maxspeed) || (t.highway === 'motorway' ? 50 : t.highway === 'motorway_link' || t.highway === 'trunk_link' ? 35 : 25);
  const park = (cls === 'residential' || cls === 'unclassified' || cls === 'living_street' || cls === 'tertiary') ? 2.4 : 0.5;
  const tl = (s) => (s ? s.split('|').map(x => x.trim()) : []);
  let turnF = tl(t['turn:lanes:forward'] || (oneway ? t['turn:lanes'] : ''));
  let turnB = tl(t['turn:lanes:backward']);
  if (turnF.length !== lf) turnF = [];
  if (turnB.length !== lb) turnB = [];
  return { name: t.name || '', cls, oneway, lf, lb, speed, speedTagged: !!t.maxspeed, park, turnF, turnB };
}
const keyOf = (a) => [a.tun ? 'T' : '', a.name, a.cls, a.oneway, a.lf, a.lb, a.speed, a.turnF.join('/'), a.turnB.join('/')].join('|');

// ---------- 2. 取出可开的路，按范围裁剪，在共用节点处切段 ----------
const runs = [];
for (const w of ways) {
  const t = w.tags || {};
  if (!DRIVE.has(t.highway)) continue;
  // 高架：只收高速 / 快速路的桥（收费公路支线、匝道）；别的桥和所有隧道先不做
  const high = t.bridge && t.bridge !== 'no' && /^(motorway|trunk)/.test(t.highway);
  // 隧道：同样只收高速 / 快速路的（荷兰隧道引道、NJ 139 下层）
  const low = t.tunnel && t.tunnel !== 'no' && /^(motorway|trunk|primary)/.test(t.highway);
  if ((t.tunnel === 'yes' && !low) || (!high && !low && (t.bridge === 'yes' || (t.layer && t.layer !== '0')))) continue;
  if (t.access === 'private' || t.access === 'no') continue;
  const a = attrs(t);
  let ids = w.nodes.slice();
  if (t.oneway === '-1') ids.reverse();
  let cur = [];
  for (const id of ids) {
    const n = nodes.get(id);
    if (n && inBounds(n.p)) cur.push(id);
    else { if (cur.length > 1) runs.push({ a, ids: cur, high, low }); cur = []; }
  }
  if (cur.length > 1) runs.push({ a, ids: cur, high, low });
}
// 节点高度：只属于高架路的节点先定在桥面高度，和地面路共用的节点是 0；再沿路把坡度压到 5.5% 以内，匝道自然就成了斜坡
const DECK = 7.5, GRADE = 0.055, H = new Map();
const DEEP = -6.5;
for (const r of runs) for (const id of r.ids) if (!H.has(id)) H.set(id, r.high ? DECK : r.low ? DEEP : 0);
for (const r of runs) if (!r.high && !r.low) for (const id of r.ids) H.set(id, 0);
// 隧道的坡度约束：|高度差| 不超过 距离 × 坡度（和高架同一个式子，对负的高度一样成立）
for (let pass = 0; pass < 400; pass++) {
  let ch = false;
  for (const r of runs) for (let i = 1; i < r.ids.length; i++) {
    const a = r.ids[i - 1], b = r.ids[i], d = dist(nodes.get(a).p, nodes.get(b).p) * GRADE;
    const ha = H.get(a), hb = H.get(b);
    if (ha > hb + d + 1e-6) { if (ha > 0) H.set(a, hb + d); else H.set(b, ha - d); ch = true; }
    else if (hb > ha + d + 1e-6) { if (hb > 0) H.set(b, ha + d); else H.set(a, hb - d); ch = true; }
  }
  if (!ch) break;
}
const use = new Map();
for (const r of runs) r.ids.forEach((id, i) => use.set(id, (use.get(id) || 0) + ((i === 0 || i === r.ids.length - 1) ? 1 : 2)));
// 端点记 1、中间点记 2：总数 > 2 的节点是真正要切的地方；等于 2 且不是同一条路的中间点时是两条路首尾相接
let pieces = [];
for (const r of runs) {
  let cur = [r.ids[0]];
  for (let i = 1; i < r.ids.length; i++) {
    cur.push(r.ids[i]);
    if (i < r.ids.length - 1 && use.get(r.ids[i]) > 2) { pieces.push({ ...structuredClone(r.a), ids: cur, alive: true }); cur = [r.ids[i]]; }
  }
  pieces.push({ ...structuredClone(r.a), ids: cur, alive: true });
}
{ const lowIds = new Set(); for (const r of runs) if (r.low) for (const id of r.ids) lowIds.add(id); for (const p of pieces) if (p.ids.every(id => lowIds.has(id))) p.tun = true; }
const pieceLen = (p) => { let L = 0; for (let i = 1; i < p.ids.length; i++) L += dist(nodes.get(p.ids[i - 1]).p, nodes.get(p.ids[i]).p); return L; };

// ---------- 3. 合并同属性的首尾相接路段 ----------
function buildEnds() {
  const m = new Map();
  for (const p of pieces) if (p.alive) for (const id of [p.ids[0], p.ids[p.ids.length - 1]]) { if (!m.has(id)) m.set(id, []); m.get(id).push(p); }
  return m;
}
function reversePiece(p) { p.ids.reverse();[p.lf, p.lb] = [p.lb, p.lf];[p.turnF, p.turnB] = [p.turnB, p.turnF]; }
let merged = 0;
for (let pass = 0; pass < 20; pass++) {
  const ends = buildEnds(); let did = false;
  for (const [id, list] of ends) {
    if (list.length !== 2 || list[0] === list[1]) continue;
    let [A, B] = list;
    if (!A.alive || !B.alive) continue;
    if (A.ids[0] === A.ids[A.ids.length - 1] || B.ids[0] === B.ids[B.ids.length - 1]) continue;
    if (A.ids[A.ids.length - 1] !== id) { if (A.ids[0] === id && B.ids[B.ids.length - 1] === id) [A, B] = [B, A]; }
    if (A.ids[A.ids.length - 1] !== id) { if (A.oneway) continue; reversePiece(A); }
    if (B.ids[0] !== id) { if (B.oneway) continue; reversePiece(B); }
    if (keyOf(A) !== keyOf(B)) continue;
    if (A.ids[0] === B.ids[B.ids.length - 1]) continue;   // 会合成环
    A.ids = A.ids.concat(B.ids.slice(1)); B.alive = false; merged++; did = true;
  }
  pieces = pieces.filter(p => p.alive);
  if (!did) break;
}

// ---------- 4. 路口聚类 ----------
let ends = buildEnds();
const deg = (id) => (ends.get(id) || []).length;
// 去掉很短的断头路
pieces = pieces.filter(p => { const L = pieceLen(p), d0 = deg(p.ids[0]), d1 = deg(p.ids[p.ids.length - 1]); return !(L < 22 && (d0 === 1 || d1 === 1)); });
ends = buildEnds();
const parent = new Map();
const find = (x) => { while (parent.has(x) && parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
for (const id of ends.keys()) parent.set(id, id);
const CLUSTER = 25;
for (const p of pieces) {
  const a = p.ids[0], b = p.ids[p.ids.length - 1];
  if (pieceLen(p) < CLUSTER && Math.max(deg(a), deg(b)) >= 3 && Math.min(deg(a), deg(b)) >= 2) { parent.set(find(a), find(b)); p.internal = true; }
}
// 聚类后两端落在同一个路口里的路段去掉
pieces = pieces.filter(p => !p.internal && find(p.ids[0]) !== find(p.ids[p.ids.length - 1]));
ends = buildEnds();

const clusters = new Map();   // root -> {members:Set}
for (const id of parent.keys()) { const r = find(id); if (!clusters.has(r)) clusters.set(r, new Set()); clusters.get(r).add(id); }
const juncs = []; const juncOfNode = new Map();
for (const [r, mem] of clusters) {
  const legs = [];
  for (const id of mem) for (const p of (ends.get(id) || [])) {
    if (p.ids[0] === id) legs.push({ p, end: 'a', node: id });
    if (p.ids[p.ids.length - 1] === id) legs.push({ p, end: 'b', node: id });
  }
  if (legs.length < 2) continue;     // 断头：不算路口
  const j = { id: juncs.length, members: mem, legs, x: 0, z: 0 };
  let sx = 0, sz = 0; for (const id of mem) { const q = nodes.get(id).p; sx += q[0]; sz += q[1]; }
  j.x = sx / mem.size; j.z = sz / mem.size;
  juncs.push(j); for (const id of mem) juncOfNode.set(id, j);
}

// ---------- 5. 管制方式 ----------
const isSig = (id) => nodes.get(id)?.tags.highway === 'traffic_signals';
const isStop = (id) => nodes.get(id)?.tags.highway === 'stop';
const legDir = (leg) => {   // 从路口往外的方向
  const ids = leg.end === 'a' ? leg.p.ids : leg.p.ids.slice().reverse();
  const p0 = nodes.get(ids[0]).p; let p1 = nodes.get(ids[1]).p;
  for (let i = 1; i < ids.length; i++) { p1 = nodes.get(ids[i]).p; if (dist(p0, p1) > 12) break; }
  const L = dist(p0, p1) || 1; return [(p1[0] - p0[0]) / L, (p1[1] - p0[1]) / L];
};
const approachable = (leg) => !leg.p.oneway || leg.end === 'b';   // 车能从这条腿开进路口
for (const j of juncs) { j.sig = false; j.stopAll = false; j.real = j.legs.length >= 3; for (const l of j.legs) { l.stop = false; l.dir = legDir(l); } }
for (const j of juncs) for (const id of j.members) { if (isSig(id)) j.sig = true; if (isStop(id)) j.stopAll = true; }
// 路段中间的信号灯 / STOP 节点：归到最近的那一端
for (const p of pieces) {
  let acc = 0; const L = pieceLen(p);
  for (let i = 1; i < p.ids.length - 1; i++) {
    acc += dist(nodes.get(p.ids[i - 1]).p, nodes.get(p.ids[i]).p);
    const id = p.ids[i]; if (!isSig(id) && !isStop(id)) continue;
    const toA = acc, toB = L - acc; const end = toA < toB ? 'a' : 'b'; const d = Math.min(toA, toB);
    if (d > 45) continue;
    const j = juncOfNode.get(end === 'a' ? p.ids[0] : p.ids[p.ids.length - 1]); if (!j) continue;
    if (isSig(id)) j.sig = true;
    else { const leg = j.legs.find(l => l.p === p && l.end === end); if (leg) leg.stop = true; }
  }
}
// 两腿的“接头”上如果有管制节点，传给相邻的真路口
for (const j of juncs) {
  if (j.real || !(j.sig || j.stopAll)) continue;
  for (const l of j.legs) {
    if (pieceLen(l.p) > 45) continue;
    const farId = l.end === 'a' ? l.p.ids[l.p.ids.length - 1] : l.p.ids[0];
    const fj = juncOfNode.get(farId); if (!fj || !fj.real) continue;
    if (j.sig) fj.sig = true;
    else { const leg = fj.legs.find(x => x.p === l.p && x.end !== l.end); if (leg) leg.stop = true; }
  }
  j.sig = false; j.stopAll = false;
}
const RANK = { motorway: 6, trunk: 5, primary: 4, secondary: 3, tertiary: 2, residential: 1, unclassified: 1, living_street: 1 };
let nSig = 0, nStopTagged = 0, nStopInferred = 0, nJoint = 0;
for (const j of juncs) {
  const app = j.legs.filter(approachable);
  if (!j.real) { j.control = 'joint'; nJoint++; for (const l of j.legs) l.stop = false; continue; }
  // 高速 / 快速路之间的分流、合流，以及高架上的路口：没有灯也没有 STOP
  j.y = [...j.members].reduce((a, id) => a + (H.get(id) || 0), 0) / j.members.size;
  if (Math.abs(j.y) > 1.5 || j.legs.every(l => RANK[l.p.cls] >= 5)) { j.control = 'none'; for (const l of j.legs) l.stop = false; continue; }
  if (j.sig) {
    j.control = 'signal'; nSig++;
    // 按方向分两组相位：以等级最高的那条路为主轴
    const main = j.legs.slice().sort((a, b) => (RANK[b.p.cls] - RANK[a.p.cls]) || (b.p.lf + b.p.lb - a.p.lf - a.p.lb))[0];
    for (const l of j.legs) { const c = Math.abs(l.dir[0] * main.dir[0] + l.dir[1] * main.dir[1]); l.group = c > 0.707 ? 0 : 1; l.stop = false; }
    continue;
  }
  if (j.stopAll) app.forEach(l => l.stop = true);
  if (app.some(l => l.stop)) { nStopTagged++; j.inferred = false; }
  else {
    // OSM 没标：按道路等级推断。低等级让高等级；同级的丁字口让直行；其余按全向停车
    j.inferred = true; nStopInferred++;
    const maxR = Math.max(...j.legs.map(l => RANK[l.p.cls])), minR = Math.min(...j.legs.map(l => RANK[l.p.cls]));
    if (maxR > minR) app.forEach(l => { if (RANK[l.p.cls] < maxR) l.stop = true; });
    else if (j.legs.length === 3) {
      let best = -2, pair = null;
      for (let a = 0; a < 3; a++) for (let b = a + 1; b < 3; b++) { const c = -(j.legs[a].dir[0] * j.legs[b].dir[0] + j.legs[a].dir[1] * j.legs[b].dir[1]); if (c > best) { best = c; pair = [a, b]; } }
      j.legs.forEach((l, i) => { if (!pair.includes(i) && approachable(l)) l.stop = true; });
      if (!j.legs.some(l => l.stop)) app.forEach(l => l.stop = true);
    } else app.forEach(l => l.stop = true);
  }
  j.control = app.length && app.every(l => l.stop) ? 'allway' : (app.some(l => l.stop) ? 'stop' : 'none');
}

// ---------- 6. 输出 ----------
pieces.forEach((p, i) => p.sid = i);
const segs = pieces.map(p => {
  const pts = [], ys = []; let last = null;
  for (const id of p.ids) { const q = nodes.get(id).p; if (last && dist(last, q) < 0.3) continue; pts.push(r2(q[0]), r2(q[1])); ys.push(r2(H.get(id) || 0)); last = q; }
  const ja = juncOfNode.get(p.ids[0]), jb = juncOfNode.get(p.ids[p.ids.length - 1]);
  return { id: p.sid, name: p.name, cls: p.cls, oneway: p.oneway, lf: p.lf, lb: p.lb, speed: p.speed, speedTagged: p.speedTagged, park: p.park, turnF: p.turnF, turnB: p.turnB, a: ja ? ja.id : -1, b: jb ? jb.id : -1, pts, ...(ys.some(v => Math.abs(v) > 0.05) ? { ys } : {}), ...(p.tun ? { tun: 1 } : {}) };
});
const juncOut = juncs.map(j => ({
  id: j.id, x: r2(j.x), z: r2(j.z), y: r2([...j.members].reduce((a, id) => a + (H.get(id) || 0), 0) / j.members.size), control: j.control, inferred: !!j.inferred,
  legs: j.legs.map(l => ({ seg: l.p.sid, end: l.end, stop: !!l.stop, group: l.group ?? 0 })),
}));

// 建筑
const hash = (n) => { let x = (n ^ 0x9e3779b9) >>> 0; x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
const polyOf = (w) => { const pts = []; const ids = w.nodes[0] === w.nodes[w.nodes.length - 1] ? w.nodes.slice(0, -1) : w.nodes; for (const id of ids) { const n = nodes.get(id); if (n) pts.push(n.p); } return pts; };
const areaOf = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
const buildings = [], parks = [];
// ---- 补充数据（tools/fetch_extra.mjs 下载的）：店铺 / 机构的名字、门牌号、用地类型、水面。没有这个文件就全靠猜 ----
const XP = path.join(ROOT, 'tools/raw', REGION.raw.replace('.json', '_x.json')), extra = fs.existsSync(XP) ? JSON.parse(fs.readFileSync(XP, 'utf8')).elements : [];
const inPoly = (pts, x, z) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
const landuse = extra.filter(e => e.type === 'way' && e.tags && e.tags.landuse && e.geometry).map(e => { const pts = e.geometry.map(g => proj(g.lat, g.lon)); return { k: e.tags.landuse, pts, x0: Math.min(...pts.map(p => p[0])), x1: Math.max(...pts.map(p => p[0])), z0: Math.min(...pts.map(p => p[1])), z1: Math.max(...pts.map(p => p[1])) }; });
// Overture Maps 的建筑数据（python -m overturemaps download --bbox=西,南,东,北 -f geojsonseq --type=building -o tools/raw/overture_<id>.geojsonl）：
// 六成的楼有高度（来自激光雷达和微软的建筑数据），OSM 自己只有百分之几。它的每栋楼记着对应的 OSM way 编号，直接按编号对上
const OV = new Map(); { const P = path.join(ROOT, 'tools/raw', `overture_${process.argv[2] || 'downtown'}.geojsonl`); if (fs.existsSync(P)) for (const line of fs.readFileSync(P, 'utf8').split('\n')) { const t = line.replace(/^\x1e/, '').trim(); if (!t) continue; const p = JSON.parse(t).properties, src = (p.sources || []).find(q => q.dataset === 'OpenStreetMap' && /^w\d+/.test(q.record_id || '')); if (src && (p.height || p.num_floors || p.class)) OV.set(+src.record_id.slice(1).split('@')[0], p); } }
const OVKIND = { residential: 'r', house: 'r', apartments: 'r', detached: 'r', terrace: 'r', dormitory: 'r', semidetached_house: 'r', industrial: 'i', warehouse: 'i', garage: 'i', garages: 'i', shed: 'i', parking: 'i', service: 'i', commercial: 's', retail: 's', supermarket: 's', office: 'c', school: 'c', university: 'c', college: 'c', hospital: 'c', church: 'c', civic: 'c', hotel: 'c', public: 'c', government: 'c' };
// 激光雷达算出来的每栋楼的高度和屋顶形状（tools/lidar_fetch.py → tools/lidar_buildings.py，键是轮廓第一个点的坐标）
const LID = (() => { const P = path.join(ROOT, 'tools/raw/lidar', `roofs_${process.argv[2] || 'downtown'}.json`); return fs.existsSync(P) ? JSON.parse(fs.readFileSync(P, 'utf8')) : {}; })();
let nOv = 0, nLid = 0, nGab = 0;
const KIND = {}; for (const [k, list] of Object.entries({
  r: 'house detached terrace residential apartments dormitory semidetached_house bungalow',
  i: 'industrial warehouse storage_tank garage garages shed service roof hangar parking ventilation_shaft bridge construction cabin carport',
  s: 'retail commercial supermarket kiosk',
  c: 'church school university college hospital train_station civic public government hotel office cathedral chapel mosque synagogue temple kindergarten fire_station',
})) for (const t of list.split(' ')) KIND[t] = k;
const SHOPLIKE = new Set('restaurant fast_food cafe bank bar pharmacy pub ice_cream clinic dentist doctors veterinary nightclub cinema theatre car_rental childcare dojo music_school studio arts_centre biergarten events_venue animal_boarding car_wash'.split(' '));
const CIVIC = new Set('school place_of_worship fire_station police library university college courthouse post_office kindergarten townhall community_centre hospital planetarium social_facility'.split(' '));
const cleanName = (s) => String(s).replace(/\s+/g, ' ').trim().slice(0, 34);
for (const w of ways) {
  const t = w.tags || {};
  if (t.building) {
    const pts = polyOf(w); if (pts.length < 3) continue;
    const A = Math.abs(areaOf(pts)); if (A < 10) continue;
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    if (Math.abs(cx) > HX + MARGIN || Math.abs(cz) > HZ + MARGIN) continue;
    let k = KIND[t.building] || '';
    if (!k) { const lu = landuse.find(l => cx >= l.x0 && cx <= l.x1 && cz >= l.z0 && cz <= l.z1 && inPoly(l.pts, cx, cz)); if (lu) k = lu.k === 'residential' ? 'r' : lu.k === 'industrial' ? 'i' : 's'; }
    if (t.amenity && CIVIC.has(t.amenity)) k = 'c';
    const lv = parseFloat(t['building:levels']), ov = OV.get(w.id);
    let real = parseFloat(t.height) || (lv ? lv * 3.3 + 1.5 : 0), rg = null;
    const ovH = ov ? (ov.height >= 2.5 ? ov.height : ov.num_floors ? ov.num_floors * 3.3 + 1.5 : 0) : 0, ld = LID[`${r2(pts[0][0])},${r2(pts[0][1])}`];
    // 高度的优先级：OSM 上有人标的 > 激光雷达实测 > Overture（多是按影像估的）。雷达是 2014 年飞的，Overture 比它高出一大截的当作后来新盖的楼
    if (!real && ld && !(ovH > ld[0] * 1.6 + 6) && !(ld[0] > 30 && A < 250)) {      // 占地很小却很高的读数多半是吊车、烟囱或者高架桥底下的楼，不信
      real = ld[0]; nLid++; if (ld[1] !== null) { rg = [ld[1], ld[2]]; nGab++; } }
    if (!real && ovH) { real = ovH; nOv++; }
    if (!k && ov && OVKIND[ov.class || ov.subtype]) k = OVKIND[ov.class || ov.subtype];
    let h = real;
    if (!h) {      // 没标高度：按类型和占地猜。占地很大又没标的多半是仓库、卖场，不是高楼
      const r = hash(w.id);
      h = t.building === 'shed' || t.building === 'garage' || t.building === 'garages' || t.building === 'roof' || t.building === 'carport' ? 3 + r * 1.2
        : k === 'i' ? 6 + r * 5 : t.building === 'house' || t.building === 'detached' ? 7.5 + r * 2.5
          : A < 60 ? 4 + r * 4 : A < 180 ? 9 + r * 4 : A < 700 ? 10 + r * 7 : A < 2500 ? 10 + r * 9 : 9 + r * 6;
    }
    const b = { h: r2(h), pts: pts.flatMap(p => [r2(p[0]), r2(p[1])]), poly: pts, cx, cz, rr: Math.sqrt(A) };
    if (k) b.k = k;
    if (rg) b.rg = rg;
    if (t['addr:housenumber']) b.no = String(t['addr:housenumber']).slice(0, 8);
    if (t.name) { if (t.shop || SHOPLIKE.has(t.amenity)) b.nm = [cleanName(t.name)]; else b.n = cleanName(t.name); }
    buildings.push(b);
  } else if (t.leisure === 'park') {
    const pts = polyOf(w); if (pts.length >= 3) parks.push(pts.flatMap(p => [r2(p[0]), r2(p[1])]));
  }
}
// 店铺、机构、门牌这些“点”：落在哪栋楼里就归哪栋；不在楼里的归 14 米内最近的楼
{
  const CELL = 80, grid = new Map(), key = (x, z) => Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
  for (const b of buildings) { const k = key(b.cx, b.cz); (grid.get(k) || grid.set(k, []).get(k)).push(b); }
  const distPoly = (pts, x, z) => { let d = 1e9; for (let i = 0; i < pts.length; i++) { const a = pts[i], c = pts[(i + 1) % pts.length], ex = c[0] - a[0], ez = c[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / (ex * ex + ez * ez || 1))); d = Math.min(d, Math.hypot(a[0] + ex * t - x, a[1] + ez * t - z)); } return d; };
  const find = (x, z) => { let best = null, bd = 14; for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) for (const b of grid.get(key(x + i * CELL, z + j * CELL)) || []) { if (Math.hypot(b.cx - x, b.cz - z) > b.rr * 1.6 + 30) continue; const d = inPoly(b.poly, x, z) ? 0 : distPoly(b.poly, x, z); if (d < bd) { bd = d; best = b; } } return best; };
  let nShop = 0, nCivic = 0, nAddr = 0;
  for (const e of extra) {
    if (e.type !== 'node' || !e.tags) continue; const t = e.tags, [x, z] = proj(e.lat, e.lon), b = find(x, z); if (!b) continue;
    if (t['addr:housenumber'] && !b.no) { b.no = String(t['addr:housenumber']).slice(0, 8); nAddr++; }
    if (!t.name) continue;
    if (t.shop || SHOPLIKE.has(t.amenity) || t.craft) { const nm = cleanName(t.name); b.nm = b.nm || []; if (b.nm.length < 5 && !b.nm.includes(nm)) { b.nm.push(nm); nShop++; } }
    else if (CIVIC.has(t.amenity) || t.tourism === 'hotel' || t.tourism === 'museum') { if (!b.n) { b.n = cleanName(t.name); nCivic++; } }
  }
  console.log(`heights from lidar ${nLid} (gabled ${nGab}); heights from Overture ${nOv}; over 38 m: ${buildings.filter(b => b.h > 38).length}`);
  console.log(`extra: shop names ${nShop}, named places ${nCivic}, house numbers from nodes ${nAddr}; buildings with number ${buildings.filter(b => b.no).length}, with kind ${buildings.filter(b => b.k).length}`);
  for (const b of buildings) { delete b.poly; delete b.cx; delete b.cz; delete b.rr; }
}
// ---- 水面：栅格（每格 6 米）。闭合的水面多边形用奇偶填充；海岸线是不闭合的线（水在行进方向右手边），
//      先把线画成“墙”，把剩下的格子分成连通块，再让每段海岸线给左右两边的块投票 ----
let water = null;
{
  const CW = 6, PAD = 60, X0 = -HX - PAD, Z0 = -HZ - PAD, W = Math.ceil((2 * HX + 2 * PAD) / CW), H = Math.ceil((2 * HZ + 2 * PAD) / CW), M = new Uint8Array(W * H);
  const fill = (rings) => {      // 奇偶扫描线
    let z0 = 1e9, z1 = -1e9; for (const r of rings) for (const p of r) { z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
    for (let j = Math.max(0, Math.floor((z0 - Z0) / CW)); j <= Math.min(H - 1, Math.floor((z1 - Z0) / CW)); j++) {
      const z = Z0 + (j + 0.5) * CW, xs = [];
      for (const r of rings) for (let i = 0; i + 1 < r.length; i++) { const a = r[i], b = r[i + 1]; if ((a[1] > z) !== (b[1] > z)) xs.push(a[0] + (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1])); }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) { const i0 = Math.max(0, Math.ceil((xs[k] - X0) / CW - 0.5)), i1 = Math.min(W - 1, Math.floor((xs[k + 1] - X0) / CW - 0.5)); for (let i = i0; i <= i1; i++) M[j * W + i] = 1; }
    }
  };
  const geo = (g) => g.filter(Boolean).map(p => proj(p.lat, p.lon)); let nPoly = 0;
  for (const e of extra) {
    if (!e.tags || e.tags.natural !== 'water') continue;
    if (e.type === 'way' && e.geometry) { const r = geo(e.geometry); r.push(r[0]); fill([r]); nPoly++; }
    else if (e.type === 'relation') { fill(e.members.filter(m => m.geometry).map(m => geo(m.geometry))); nPoly++; }
  }
  const coast = extra.filter(e => e.type === 'way' && e.tags && e.tags.natural === 'coastline' && e.geometry).map(e => geo(e.geometry));
  if (coast.length) {
    const wall = new Uint8Array(W * H), comp = new Int32Array(W * H), cell = (x, z) => { const i = Math.floor((x - X0) / CW), j = Math.floor((z - Z0) / CW); return i < 0 || j < 0 || i >= W || j >= H ? -1 : j * W + i; };
    for (const r of coast) for (let i = 0; i + 1 < r.length; i++) { const a = r[i], b = r[i + 1], n = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (CW * 0.3)) + 1; for (let k = 0; k <= n; k++) { const c = cell(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n); if (c >= 0) wall[c] = 1; } }
    // 上面的画法是 8 连通的线；把斜着相邻的两格之间补一格，4 连通的填充才钻不过去
    for (let j = 0; j + 1 < H; j++) for (let i = 0; i + 1 < W; i++) { const a = j * W + i; if (wall[a] === 1 && wall[a + W + 1] === 1 && !wall[a + 1] && !wall[a + W]) wall[a + 1] = 2; if (wall[a + 1] === 1 && wall[a + W] === 1 && !wall[a] && !wall[a + W + 1]) wall[a] = 2; }
    let nc = 0; const stack = [];
    for (let s = 0; s < W * H; s++) {
      if (wall[s] || comp[s]) continue; nc++; comp[s] = nc; stack.push(s);
      while (stack.length) { const c = stack.pop(), i = c % W; for (const d of [i > 0 ? c - 1 : -1, i < W - 1 ? c + 1 : -1, c - W, c + W]) if (d >= 0 && d < W * H && !wall[d] && !comp[d]) { comp[d] = nc; stack.push(d); } }
    }
    const vote = new Float64Array(nc + 1);
    for (const r of coast) for (let i = 0; i + 1 < r.length; i++) {
      const a = r[i], b = r[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1) continue; const rx = -(b[1] - a[1]) / L, rz = (b[0] - a[0]) / L, mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      for (const [sgn, off] of [[1, 14], [-1, 14], [1, 26], [-1, 26]]) { const c = cell(mx + rx * off * sgn, mz + rz * off * sgn); if (c >= 0 && comp[c]) vote[comp[c]] += sgn * L; }
    }
    for (let c = 0; c < W * H; c++) if (comp[c] && vote[comp[c]] > 0) M[c] = 1;
    // 海岸线那一格本身：邻居是水就算水，岸线才不会留一圈缝
    for (let c = 0; c < W * H; c++) if (wall[c] && !M[c]) { const i = c % W; if ((i > 0 && M[c - 1] === 1) || (i < W - 1 && M[c + 1] === 1) || (c >= W && M[c - W] === 1) || (c + W < W * H && M[c + W] === 1)) M[c] = 3; }
    console.log(`water: ${nPoly} polygons, ${coast.length} coastline ways, ${nc} regions, ${[...vote].filter(v => v > 0).length} of them water`);
  }
  let n = 0; const rle = [];
  for (let j = 0; j < H; j++) { let cur = 0, run = 0; for (let i = 0; i < W; i++) { const v = M[j * W + i] ? 1 : 0; n += v; if (v === cur) run++; else { rle.push(run); cur = v; run = 1; } } rle.push(run); if (cur === 0) rle.push(0); }
  if (n) water = { cell: CW, w: W, h: H, x0: r2(X0), z0: r2(Z0), rle };      // 每行：陆、水、陆、水……的格数，一行的和 = w
  console.log(`water cells ${n} (${(n / W / H * 100).toFixed(1)}%)`);
  if (process.argv.includes('--pgm')) { const buf = Buffer.concat([Buffer.from(`P5\n${W} ${H}\n255\n`), Buffer.from(M.map(v => v ? 255 : 40))]); fs.writeFileSync(path.join(ROOT, 'shots/water.pgm'), buf); }
}

const out = { version: 1, origin: { lat: LAT0, lon: LON0, kx: KX, kz: KZ }, half: { x: r2(HX), z: r2(HZ) }, segs, juncs: juncOut, buildings, parks, water };
fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out));
const cc = {}; for (const j of juncOut) cc[j.control] = (cc[j.control] || 0) + 1;
console.log(`segs ${segs.length} (merged ${merged}), juncs ${juncOut.length}`, cc, `tagged-stop ${nStopTagged} inferred-stop ${nStopInferred}`);
console.log(`buildings ${buildings.length}, parks ${parks.length}, size ${(fs.statSync(OUT).size / 1024).toFixed(0)} KB`);
console.log('total road km', (segs.reduce((s, g) => { let L = 0; for (let i = 2; i < g.pts.length; i += 2) L += Math.hypot(g.pts[i] - g.pts[i - 2], g.pts[i + 1] - g.pts[i - 1]); return s + L; }, 0) / 1000).toFixed(1));
