// 把 Overpass 下载的 OSM 原始数据（tools/raw/osm.json）处理成游戏用的 data/map.json。
// 用法：node tools/build_map.mjs
// 做的事：投影到本地米坐标 → 在路口处切段 → 合并同属性的连续路段 → 合并挨得很近的路口节点（双向分隔路）
//        → 判定每个路口的管制方式（红绿灯 / STOP / 推断的 STOP）→ 建筑、公园。
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/raw/osm.json'), 'utf8'));

const BBOX = { s: 40.7140, w: -74.0520, n: 40.7300, e: -74.0340 };
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

const DRIVE = new Set(['primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'residential', 'unclassified', 'living_street']);
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
  const speed = parseInt(t.maxspeed) || 25;
  const park = (cls === 'residential' || cls === 'unclassified' || cls === 'living_street' || cls === 'tertiary') ? 2.4 : 0.5;
  const tl = (s) => (s ? s.split('|').map(x => x.trim()) : []);
  let turnF = tl(t['turn:lanes:forward'] || (oneway ? t['turn:lanes'] : ''));
  let turnB = tl(t['turn:lanes:backward']);
  if (turnF.length !== lf) turnF = [];
  if (turnB.length !== lb) turnB = [];
  return { name: t.name || '', cls, oneway, lf, lb, speed, speedTagged: !!t.maxspeed, park, turnF, turnB };
}
const keyOf = (a) => [a.name, a.cls, a.oneway, a.lf, a.lb, a.speed, a.turnF.join('/'), a.turnB.join('/')].join('|');

// ---------- 2. 取出可开的路，按范围裁剪，在共用节点处切段 ----------
const runs = [];
for (const w of ways) {
  const t = w.tags || {};
  if (!DRIVE.has(t.highway)) continue;
  if (t.tunnel === 'yes' || t.bridge === 'yes' || (t.layer && t.layer !== '0')) continue;   // 高架、隧道先不做
  if (t.access === 'private' || t.access === 'no') continue;
  const a = attrs(t);
  let ids = w.nodes.slice();
  if (t.oneway === '-1') ids.reverse();
  let cur = [];
  for (const id of ids) {
    const n = nodes.get(id);
    if (n && inBounds(n.p)) cur.push(id);
    else { if (cur.length > 1) runs.push({ a, ids: cur }); cur = []; }
  }
  if (cur.length > 1) runs.push({ a, ids: cur });
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
const RANK = { primary: 4, secondary: 3, tertiary: 2, residential: 1, unclassified: 1, living_street: 1 };
let nSig = 0, nStopTagged = 0, nStopInferred = 0, nJoint = 0;
for (const j of juncs) {
  const app = j.legs.filter(approachable);
  if (!j.real) { j.control = 'joint'; nJoint++; for (const l of j.legs) l.stop = false; continue; }
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
  const pts = []; let last = null;
  for (const id of p.ids) { const q = nodes.get(id).p; if (last && dist(last, q) < 0.3) continue; pts.push(r2(q[0]), r2(q[1])); last = q; }
  const ja = juncOfNode.get(p.ids[0]), jb = juncOfNode.get(p.ids[p.ids.length - 1]);
  return { id: p.sid, name: p.name, cls: p.cls, oneway: p.oneway, lf: p.lf, lb: p.lb, speed: p.speed, speedTagged: p.speedTagged, park: p.park, turnF: p.turnF, turnB: p.turnB, a: ja ? ja.id : -1, b: jb ? jb.id : -1, pts };
});
const juncOut = juncs.map(j => ({
  id: j.id, x: r2(j.x), z: r2(j.z), control: j.control, inferred: !!j.inferred,
  legs: j.legs.map(l => ({ seg: l.p.sid, end: l.end, stop: !!l.stop, group: l.group ?? 0 })),
}));

// 建筑
const hash = (n) => { let x = (n ^ 0x9e3779b9) >>> 0; x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
const polyOf = (w) => { const pts = []; const ids = w.nodes[0] === w.nodes[w.nodes.length - 1] ? w.nodes.slice(0, -1) : w.nodes; for (const id of ids) { const n = nodes.get(id); if (n) pts.push(n.p); } return pts; };
const areaOf = (pts) => { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
const buildings = [], parks = [];
for (const w of ways) {
  const t = w.tags || {};
  if (t.building) {
    const pts = polyOf(w); if (pts.length < 3) continue;
    const A = Math.abs(areaOf(pts)); if (A < 10) continue;
    const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
    if (Math.abs(cx) > HX + MARGIN || Math.abs(cz) > HZ + MARGIN) continue;
    let h = parseFloat(t.height) || (parseFloat(t['building:levels']) ? parseFloat(t['building:levels']) * 3.3 + 1.5 : 0);
    if (!h) { const r = hash(w.id); h = A < 180 ? 9 + r * 5 : A < 700 ? 11 + r * 10 : A < 2500 ? 14 + r * 22 : 18 + r * 40; }
    buildings.push({ h: r2(h), pts: pts.flatMap(p => [r2(p[0]), r2(p[1])]) });
  } else if (t.leisure === 'park') {
    const pts = polyOf(w); if (pts.length >= 3) parks.push(pts.flatMap(p => [r2(p[0]), r2(p[1])]));
  }
}

const out = { version: 1, origin: { lat: LAT0, lon: LON0, kx: KX, kz: KZ }, half: { x: r2(HX), z: r2(HZ) }, segs, juncs: juncOut, buildings, parks };
fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data/map.json'), JSON.stringify(out));
const cc = {}; for (const j of juncOut) cc[j.control] = (cc[j.control] || 0) + 1;
console.log(`segs ${segs.length} (merged ${merged}), juncs ${juncOut.length}`, cc, `tagged-stop ${nStopTagged} inferred-stop ${nStopInferred}`);
console.log(`buildings ${buildings.length}, parks ${parks.length}, size ${(fs.statSync(path.join(ROOT, 'data/map.json')).size / 1024).toFixed(0)} KB`);
console.log('total road km', (segs.reduce((s, g) => { let L = 0; for (let i = 2; i < g.pts.length; i += 2) L += Math.hypot(g.pts[i] - g.pts[i - 2], g.pts[i + 1] - g.pts[i - 1]); return s + L; }, 0) / 1000).toFixed(1));
