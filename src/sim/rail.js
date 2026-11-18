// 铁路平交道口。数据是 data/rail.json（tools/fetch_rail.mjs 从 OSM 下载）。纯逻辑。
// 火车不按时刻表跑：玩家开向一个道口时掷一次骰子，来车就先闪红灯、放栏杆，过十几秒火车开过去，再抬杆、灭灯。
// 道口状态：x.on（红灯在闪）、x.gate（0 抬起 … 1 放平）、x.train（{ head: 车头在铁轨上的弧长, dir: ±1, cars: [{ len, kind }] }）
import { pointAt, segY } from './map.js';

const TRACK_GAP = 15;      // 同一条路上相距这么近的几条铁轨算同一个道口

/** 把数据里的道口对到路段上；对不上（不在游戏的路上、在高架上、贴着路口）的扔掉 */
export function makeRail(map, rows) {
  const o = map.origin, found = [], P = {};
  for (const r of rows) {
    const x = (r.at[1] - o.lon) * o.kx, z = -(r.at[0] - o.lat) * o.kz, L = map.locate(x, z, {}, 0), seg = L.seg;
    if (!seg || seg.high || L.d > seg.halfW + 1.5 || Math.abs(segY(seg, L.s)) > 1) continue;
    const pts = r.line.map(([la, lo]) => [(lo - o.lon) * o.kx, -(la - o.lat) * o.kz]);
    const cum = [0]; for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    let at = 0, best = 1e9; for (let i = 0; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - x, pts[i][1] - z); if (d < best) { best = d; at = cum[i]; } }
    found.push({ seg, s: L.s, x, z, kind: r.kind, gates: r.gates, track: { pts, cum, at, len: cum[cum.length - 1] } });
  }
  // 同一段路上挨着的几条铁轨合成一个道口
  const X = [];
  for (const f of found) {
    const g = X.find(x => x.seg === f.seg && Math.abs(x.s0 - f.s) < TRACK_GAP && Math.abs(x.s1 - f.s) < TRACK_GAP);
    if (g) { g.s0 = Math.min(g.s0, f.s); g.s1 = Math.max(g.s1, f.s); g.tracks.push(f.track); g.gates ||= f.gates; if (f.kind === 'rail') g.kind = 'rail'; continue; }
    X.push({ seg: f.seg, s0: f.s, s1: f.s, kind: f.kind, gates: f.gates, tracks: [f.track] });
  }
  const out = [];
  for (const x of X) {
    const seg = x.seg; x.s = (x.s0 + x.s1) / 2; x.span = (x.s1 - x.s0) / 2 + 1.8;      // 从道口中线到最外面那根铁轨外侧
    // 两头都要留出停车的地方（停止线离铁轨 15 英尺，再加一辆车）
    if (x.s - x.span - 12 < seg.trimA || x.s + x.span + 12 > seg.len - seg.trimB) continue;
    pointAt(seg, x.s, P); x.x = P.x; x.z = P.z; x.y = segY(seg, x.s); x.dx = P.dx; x.dz = P.dz;
    x.id = out.length; x.on = false; x.gate = 0; x.train = null; x.tau = -1; x.last = -1e9; x.rolled = -1e9;
    (seg.rail ||= []).push(x); out.push(x);
  }
  return { X: out, first: true };
}

/** 铁轨上弧长 a 处的点和方向（超出数据范围就沿最后一段往外延） */
export function trackAt(tr, a, out = {}) {
  const p = tr.pts, c = tr.cum, n = p.length; let i = 1;
  while (i < n - 1 && c[i] < a) i++;
  const L = c[i] - c[i - 1] || 1, t = (a - c[i - 1]) / L;
  out.dx = (p[i][0] - p[i - 1][0]) / L; out.dz = (p[i][1] - p[i - 1][1]) / L;
  out.x = p[i - 1][0] + (p[i][0] - p[i - 1][0]) * t; out.z = p[i - 1][1] + (p[i][1] - p[i - 1][1]) * t;
  return out;
}

// 时间线（秒，从开始闪灯算）：3–9 秒放栏杆，ARR 秒时车头到道口，车尾过去 1.5 秒后抬杆（5 秒抬完），抬完灭灯
const ARR = { rail: 22, light_rail: 16 }, SPEED = { rail: 11, light_rail: 10 };
function makeTrain(x, rnd) {
  const kind = x.kind === 'rail' ? 'rail' : 'light_rail', cars = [];
  if (kind === 'rail') { cars.push({ len: 21, kind: 'loco' }); const n = 4 + Math.floor(rnd() * 6); for (let i = 0; i < n; i++) cars.push({ len: 15.5, kind: rnd() < 0.5 ? 'box' : 'tank', col: Math.floor(rnd() * 5) }); }
  else cars.push({ len: 27, kind: 'lrv' }, { len: 27, kind: 'lrv' });
  const len = cars.reduce((a, c) => a + c.len + 1, 0), v = SPEED[kind], dir = rnd() < 0.5 ? 1 : -1, tr = x.tracks[0];
  return { cars, len, v, dir, kind, head: tr.at - dir * v * ARR[kind], clearT: ARR[kind] + (len + x.span * 2 + 4) / v };
}

/** 每帧：玩家开过来时决定来不来车；推进来车的道口 */
export function stepRail(RL, pl, t, dt, rnd) {
  const cur = pl.cur;
  if (cur && cur.seg && cur.seg.rail && Math.abs(pl.v) > 3) for (const x of cur.seg.rail) {
    const d = (x.s - cur.s) * (cur.fwd ? 1 : -1);
    if (x.tau < 0 && d > 50 && d < 170 && t - x.last > 60 && t - x.rolled > 40) {
      x.rolled = t;
      if (RL.first || rnd() < 0.5) { RL.first = false; x.tau = 0; x.train = makeTrain(x, rnd); }
    }
  }
  for (const x of RL.X) {
    if (x.tau < 0) continue;
    x.tau += dt; const T = x.train, tau = x.tau;
    T.head += T.dir * T.v * dt;
    x.on = tau < T.clearT + 6.5;
    x.gate = !x.gates ? 0 : tau < 3 ? 0 : tau < 9 ? (tau - 3) / 6 : tau < T.clearT + 1.5 ? 1 : Math.max(0, 1 - (tau - T.clearT - 1.5) / 5);
    // 火车开出 300 米以外、灯也灭了：这一趟结束
    if (!x.on && (T.head - x.tracks[0].at) * T.dir - T.len > 300) { x.tau = -1; x.train = null; x.on = false; x.gate = 0; x.last = t; }
  }
}

/** 火车现在占着道口没有（车身任何一部分在道口中线前后几米内） */
export function trainOnCrossing(x) {
  const T = x.train; if (!T) return false;
  const a = x.tracks[0].at, head = (T.head - a) * T.dir;      // 车头过了道口多少米（负的是还没到）
  return head > -4 && head - T.len < 4;
}
