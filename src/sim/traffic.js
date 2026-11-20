// 车流和行人：纯逻辑。别的车沿车道开，会等红灯、在 STOP 前停、让路口里的车和过马路的人；
// 行人沿人行道走，到有斑马线的路口过马路。只在玩家附近生成，走远了回收。
// 特殊的车和事件：校车（停下闪红灯，两个方向都要停）、鸣笛的救护车 / 警车（别的车靠右停下让它）、
// 路边打灯开出来的车、在路中间横穿马路的行人、路边停着闪灯的警车（Move Over）。铁路道口有火车时也停。
import { LANE_W, STOP_LINE, XWALK_NEAR, XWALK_FAR, CAR, offsetPoint, pointAt, laneCenter, turnType, signalState, obbOverlap, segY } from './map.js';
import { MPH } from './car.js';
import { stepRail } from './rail.js';
import { limitAt } from './school.js';

const N_CARS = 26, N_PEDS = 30, SPAWN_R = 240, KEEP_R = 320, PED_R = 150, PED_KEEP = 210, WALK = 1.35;
const XW = (XWALK_NEAR + XWALK_FAR) / 2;
const ctl = (j) => j && (j.control === 'signal' || j.control === 'stop' || j.control === 'allway');
const P = {}, Q = {};

export function makeTraffic(map, seed = 12345) {
  let s = seed >>> 0 || 1; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  return { map, rnd, cars: [], peds: [], nextId: 1, tick: 0, emsT: 240, moT: 100 };
}

const useLane = (seg, fwd) => fwd ? seg.lf : seg.lb;
const endJ = (seg, fwd) => fwd ? seg.jb : seg.ja;
/** 车在路段上的世界位置：u 是沿行驶方向、从路段可用部分起点量的距离 */
function poseOnSeg(c) {
  const seg = c.seg, sAbs = c.fwd ? seg.trimA + c.u : seg.len - seg.trimB - c.u;
  offsetPoint(seg, sAbs, laneCenter(seg, c.fwd, c.idx) + (c.fwd ? 1 : -1) * (c.off || 0), P);      // off：往右偏多少米（靠边让路、停在路边是正的，绕过去是负的）
  c.x = P.x; c.z = P.z; c.h = Math.atan2(P.dz, P.dx) + (c.fwd ? 0 : Math.PI); c.y = segY(seg, sAbs);
}
/** 车在路段上的位置（按路段自己的方向量） */
export const sAbsOf = (c) => c.fwd ? c.seg.trimA + c.u : c.seg.len - c.seg.trimB - c.u;
const bez = (a, b, c, t) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;

/** 到路口时选一条出路，算好穿过路口的弧线 */
export function planTurn(T, c) {
  const seg = c.seg, j = endJ(seg, c.fwd); c.plan = null;
  if (!j) return;
  const leg = T.map.legOf(j, seg, c.fwd ? 'b' : 'a'); if (!leg) return;
  const n = useLane(seg, c.fwd), opts = [];
  for (const l of j.legs) {
    if (l === leg || !l.exit || leg.bans?.has(l)) continue;      // 禁止转弯（OSM 的转向限制）
    const outFwd = l.end === 'a', m = useLane(l.segRef, outFwd); if (!m) continue;
    const type = turnType(-leg.ox, -leg.oz, l.ox, l.oz); if (type === 'uturn') continue;
    if (n >= 2 && ((type === 'left' && c.idx !== 0) || (type === 'right' && c.idx !== n - 1))) continue;
    opts.push({ l, type, outFwd, m, w: type === 'through' ? 3 : 1 });
  }
  if (!opts.length) return;
  let r = T.rnd() * opts.reduce((a, o) => a + o.w, 0), o = opts[0]; for (const k of opts) { r -= k.w; if (r <= 0) { o = k; break; } }
  const idx = o.type === 'left' ? 0 : o.type === 'right' ? o.m - 1 : Math.min(c.idx, o.m - 1), ns = o.l.segRef;
  offsetPoint(seg, c.fwd ? seg.len - seg.trimB : seg.trimA, laneCenter(seg, c.fwd, c.idx), P);
  const d0x = c.fwd ? P.dx : -P.dx, d0z = c.fwd ? P.dz : -P.dz, x0 = P.x, z0 = P.z;
  offsetPoint(ns, o.outFwd ? ns.trimA : ns.len - ns.trimB, laneCenter(ns, o.outFwd, idx), Q);
  const d1x = o.outFwd ? Q.dx : -Q.dx, d1z = o.outFwd ? Q.dz : -Q.dz, x2 = Q.x, z2 = Q.z;
  // 控制点：进、出两条切线的交点；几乎平行时取中点
  const den = d0x * d1z - d0z * d1x; let cx = (x0 + x2) / 2, cz = (z0 + z2) / 2;
  if (Math.abs(den) > 0.15) { const k = ((x2 - x0) * d1z - (z2 - z0) * d1x) / den; if (k > 0 && k < 60) { cx = x0 + d0x * k; cz = z0 + d0z * k; } }
  let len = 0, px = x0, pz = z0; for (let i = 1; i <= 8; i++) { const t = i / 8, x = bez(x0, cx, x2, t), z = bez(z0, cz, z2, t); len += Math.hypot(x - px, z - pz); px = x; pz = z; }
  c.plan = { j, leg, out: o.l, type: o.type, seg: ns, fwd: o.outFwd, idx, x0, z0, cx, cz, x2, z2, len: Math.max(0.5, len) };
}

function spawnCar(T, pl) {
  const map = T.map;
  for (let tries = 0; tries < 12; tries++) {
    // 在玩家周围随机取一个点，找离它最近的路（从全图的路里随机抽的话，图一大就几乎抽不到附近的）
    const a0 = T.rnd() * 6.2832, r0 = 70 + T.rnd() * (SPAWN_R - 70), seg = map.locate(pl.x + Math.cos(a0) * r0, pl.z + Math.sin(a0) * r0, P).seg; if (!seg || seg.useLen < 34) continue;
    const mx = seg.px[seg.n >> 1], mz = seg.pz[seg.n >> 1], d = Math.hypot(mx - pl.x, mz - pl.z); if (d > SPAWN_R + 150) continue;
    const fwd = seg.lb === 0 || T.rnd() < 0.5; if (!useLane(seg, fwd)) continue;
    const c = { id: T.nextId++, kind: 'car', mode: 'seg', seg, fwd, idx: Math.floor(T.rnd() * useLane(seg, fwd)), u: 6 + T.rnd() * (seg.useLen - 24), v: 0, L: 4.5, W: 1.8, col: Math.floor(T.rnd() * 12), tr: T.rnd(), wait: 0, stopT: -1, x: 0, z: 0, h: 0, plan: null, w: 0 };
    const local = /^(residential|tertiary|secondary|unclassified)$/.test(seg.cls), nL = useLane(seg, fwd);
    if (local && T.rnd() < 0.06 && !T.cars.some(o => o.kind === 'bus')) { c.kind = 'bus'; c.L = 11.5; c.W = 2.5; c.idx = nL - 1; c.nextStop = seg.useLen > 110 && c.u < seg.useLen - 75 ? Math.max(45, Math.min(seg.useLen - 45, c.u + 30 + T.rnd() * 120)) : null; }
    else if (local && seg.park >= 2 && T.rnd() < 0.07) {      // 停在路边、一会儿打左灯开出来
      c.kind = 'pullout'; c.parked = true; c.idx = nL - 1; c.off = LANE_W / 2 + seg.park / 2; c.sig = -1; c.leaveT = 8 + T.rnd() * 25;
      poseOnSeg(c); if (map.hitParked(c.x, c.z, c.h, c.L / 2 + 0.6, c.W / 2)) continue;      // 那里已经停着一辆（地图里的静态车）
    }
    poseOnSeg(c);
    if (Math.hypot(c.x - pl.x, c.z - pl.z) < 55) continue;
    if (T.cars.some(o => Math.hypot(o.x - c.x, o.z - c.z) < 14)) continue;
    c.v = c.parked ? 0 : seg.speed / MPH * 0.6; planTurn(T, c); T.cars.push(c); return;
  }
}

/** 行人：沿 seg 的 side 侧人行道走（dir = ±1 沿 a→b），到路口的斑马线过到对面再往回走 */
function spawnPed(T, pl) {
  const map = T.map;
  for (let tries = 0; tries < 10; tries++) {
    const a0 = T.rnd() * 6.2832, r0 = 25 + T.rnd() * (PED_R - 25), seg = map.locate(pl.x + Math.cos(a0) * r0, pl.z + Math.sin(a0) * r0, Q).seg; if (!seg || seg.useLen < 30 || seg.speed > 36 || seg.high || /^(motorway|trunk)/.test(seg.cls)) continue;      // 高速、快速路和它们的匝道上没有行人（匝道默认限速 35，以前会混进来）
    const u = seg.trimA + 6 + T.rnd() * (seg.useLen - 12), side = T.rnd() < 0.5 ? 1 : -1;
    pointAt(seg, u, P); const d = Math.hypot(P.x - pl.x, P.z - pl.z); if (d > PED_R || d < 25) continue;
    const off = seg.halfW + 0.75 + T.rnd() * 0.35;
    T.peds.push({ id: T.nextId++, kind: 'ped', seg, side, dir: T.rnd() < 0.5 ? 1 : -1, s: u, off, lat: side * off, mode: 'walk', wait: 0, x: 0, z: 0, h: 0, ph: T.rnd() * 6, col: Math.floor(T.rnd() * 8), sp: WALK * (0.85 + T.rnd() * 0.3), flagged: false, onRoad: false });
    return;
  }
}

/** 这条腿的斑马线上（或正要踏上来）有没有行人 */
export function pedOnCrosswalk(T, seg, end) {
  for (const p of T.peds) if (p.mode === 'cross' && p.seg === seg && p.end === end) return p;
  return null;
}

/**
 * 玩家进路口那一刻，周围有没有该让的车。me = { j, leg }。
 * 返回 { inJ: 路口里已经有别的车, cross: 横向有路权的车马上到, oncoming: 对向直行的车马上到, first: 全向停车时比你先到的车 }
 */
export function threatsAt(T, j, leg, t, myStopT) {
  const out = { inJ: null, cross: null, oncoming: null, first: null };
  for (const c of T.cars) {
    if (c.mode === 'junc') { if (c.plan && c.plan.j === j && c.plan.leg !== leg && c.w < c.plan.len - 3) out.inJ = c; continue; }
    if (endJ(c.seg, c.fwd) !== j || !c.plan) continue;
    const l = c.plan.leg; if (l === leg) continue;
    const d = c.seg.useLen - c.u - c.L / 2, opp = l.ox * leg.ox + l.oz * leg.oz < -0.6;
    const soon = c.v > 2 && d / Math.max(c.v, 3) < 3.5 && d < 45;
    if (j.control === 'signal') { if (soon && signalState(j, l.group, t) === 'G') { if (opp) { if (c.plan.type !== 'left') out.oncoming = c; } else out.cross = c; } }
    else if (j.control === 'allway') { if (c.stopT >= 0 && myStopT >= 0 && c.stopT < myStopT - 0.4 && d < STOP_LINE + 3) out.first = c; }
    else if (!l.stop && soon) { if (opp) { if (c.plan.type !== 'left') out.oncoming = c; } else out.cross = c; }
  }
  return out;
}

/** pl: { x, z（车身中心）, h, v, cur: 规则引擎的 R.cur, stopT: 玩家在停止线前停住的时刻或 -1 } */
export function stepTraffic(T, pl, t, dt) {
  const map = T.map, cars = T.cars, peds = T.peds; T.tick++;
  // ---------- 生成 / 回收 ----------
  for (let i = cars.length - 1; i >= 0; i--) if (cars[i].dead || Math.hypot(cars[i].x - pl.x, cars[i].z - pl.z) > KEEP_R) cars.splice(i, 1);
  for (let i = peds.length - 1; i >= 0; i--) if (Math.hypot(peds[i].x - pl.x, peds[i].z - pl.z) > PED_KEEP && peds[i].x !== 0) peds.splice(i, 1);
  if (cars.length < N_CARS && T.tick % 6 === 0) spawnCar(T, pl);
  if (peds.length < N_PEDS && T.tick % 4 === 0) spawnPed(T, pl);
  const cur = pl.cur, pj = cur && cur.junc;
  T.emsT -= dt;
  if (T.emsT <= 0) {
    T.emsT = 12;      // 这次放不下（路太短、在路口里），过一会儿再试
    if (cur && cur.seg && !pj && (cur.fwd ? cur.seg.lf : cur.seg.lb) > 0) {
      const sg = cur.seg, back = 110 + T.rnd() * 50, sAt = cur.s - (cur.fwd ? 1 : -1) * back;
      if (sAt > sg.trimA + 4 && sAt < sg.len - sg.trimB - 4 && !cars.some(o => o.kind === 'ems')) {
        const c = { id: T.nextId++, kind: 'ems', sub: T.rnd() < 0.5 ? 'amb' : 'police', mode: 'seg', seg: sg, fwd: cur.fwd, idx: 0, u: cur.fwd ? sAt - sg.trimA : sg.len - sg.trimB - sAt, v: sg.speed / MPH, L: 6.2, W: 2.2, col: 0, tr: 0, wait: 0, stopT: -1, x: 0, z: 0, h: 0, plan: null, w: 0, off: 0 };
        poseOnSeg(c); planTurn(T, c); cars.push(c); T.emsT = 420 + T.rnd() * 300;      // 7–12 分钟一辆
      }
    }
  }
  if (T.rail) stepRail(T.rail, pl, t, dt, T.rnd);
  // Move Over：每隔几分钟，在玩家前面 170 米、最右边那条道的右侧停一辆闪灯的警车（拦下了一辆打着双闪的车）。
  // 地图里的路没有路肩，城里的警察就是这样停在右道上的；至少要两条道，别的车才绕得过去
  T.moT -= dt;
  if (T.moT <= 0) {
    T.moT = 10;
    const sg = cur && !pj && cur.seg, n = sg ? (cur.fwd ? sg.lf : sg.lb) : 0;
    if (n >= 2 && /^(motorway|trunk|primary|secondary)/.test(sg.cls) && !cars.some(o => o.kind === 'mo')) {
      const sAt = cur.s + (cur.fwd ? 1 : -1) * 170;
      if (sAt > sg.trimA + 25 && sAt < sg.len - sg.trimB - 25) {
        const u = cur.fwd ? sAt - sg.trimA : sg.len - sg.trimB - sAt, off = LANE_W / 2 + sg.park - 1.1;      // 车身右边贴着路缘
        const pol = { id: T.nextId++, kind: 'mo', sub: 'police', fixed: true, mode: 'seg', seg: sg, fwd: cur.fwd, idx: n - 1, u, v: 0, L: 4.9, W: 1.95, off, col: 0, tr: 0, wait: 0, stopT: -1, x: 0, z: 0, h: 0, plan: null, w: 0 };
        const stopped = { ...pol, id: T.nextId++, kind: 'car', sub: null, u: u + 8, L: 4.5, W: 1.8, col: Math.floor(T.rnd() * 12), tr: T.rnd(), haz: true };
        poseOnSeg(pol); poseOnSeg(stopped); cars.push(pol, stopped); T.moT = 200 + T.rnd() * 200;
      }
    }
  }
  const mos = cars.filter(o => o.kind === 'mo');
  const buses = cars.filter(o => o.kind === 'bus' && o.flash > 0 && o.mode === 'seg'), emss = cars.filter(o => o.kind === 'ems'), mids = peds.filter(p => p.mode === 'cross' && p.mid);

  // ---------- 行人 ----------
  for (let i = peds.length - 1; i >= 0; i--) if (peds[i].mode === 'down' && (peds[i].downT += dt) > 9) peds.splice(i, 1);
  for (const p of peds) {
    if (p.mode === 'down') continue;
    const seg = p.seg, sA = seg.trimA + XW, sB = seg.len - seg.trimB - XW;
    if (p.mode === 'walk') {
      // 道口红灯在闪：走到铁轨前站住
      let hold = false; if (seg.rail) for (const x of seg.rail) if (x.on) { const d = (x.s - p.s) * p.dir; if (d > 0 && d < x.span + 2.5) hold = true; }
      p.hold = hold; if (!hold) p.s += p.dir * p.sp * dt; p.lat = p.side * p.off;
      const atB = p.dir > 0 && p.s >= sB, atA = p.dir < 0 && p.s <= sA;
      // 偶尔不走斑马线，直接从两个路口中间横穿（窄路、离玩家 40–110 米时才发生，看得见、来得及停）
      if (!p.didMid && seg.lf + seg.lb <= 2 && !seg.high && p.s > sA + 15 && p.s < sB - 15 && T.rnd() < dt * 0.008) {
        const dp = Math.hypot(pl.x - p.x, pl.z - p.z); if (dp > 40 && dp < 110) { p.mode = 'cross'; p.mid = true; p.didMid = true; p.flagged = false; }
      }
      if (atA || atB) {
        p.s = atB ? sB : sA; const j = atB ? seg.jb : seg.ja;
        if (ctl(j) && seg.useLen > 15 && T.rnd() < 0.75) { p.mode = 'wait'; p.end = atB ? 'b' : 'a'; p.wait = 0; p.j = j; } else p.dir = -p.dir;
      }
    } else if (p.mode === 'wait') {
      p.wait += dt; const j = p.j, leg = map.legOf(j, seg, p.end); let go = p.wait > 0.8;
      if (go && j.control === 'signal' && leg) go = signalState(j, leg.group, t) === 'R' || p.wait > 40;      // 这条路的车是红灯时才过
      if (go) for (const c of cars) {       // 有车正快速开过来就再等等
        const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < 16 && c.v > 3.5 && (c.seg === seg || (c.plan && c.mode === 'junc' && c.plan.seg === seg))) { go = false; break; }
      }
      if (go && Math.hypot(pl.x - p.x, pl.z - p.z) < 14 && Math.abs(pl.v) > 4.5 && p.wait < 9) go = false;
      if (go) { p.mode = 'cross'; p.flagged = false; }
    } else {
      p.lat -= p.side * p.sp * dt;
      if (p.lat * p.side <= -p.off) { p.side = -p.side; p.lat = p.side * p.off; p.mode = 'walk'; if (!p.mid) p.dir = p.end === 'b' ? -1 : 1; p.mid = false; }
    }
    offsetPoint(seg, p.s, p.lat, P); p.x = P.x; p.z = P.z; p.onRoad = Math.abs(p.lat) < seg.halfW;
    p.h = p.mode === 'walk' ? Math.atan2(P.dz, P.dx) + (p.dir > 0 ? 0 : Math.PI) : Math.atan2(-p.side * P.dx, p.side * P.dz);
    p.ph += (p.mode === 'wait' || p.hold ? 0 : p.sp) * dt * 4.6; p.moving = p.mode !== 'wait' && !p.hold;
  }

  // ---------- 车 ----------
  // 玩家停在车道里不走、或者在倒车（侧方停车、掉头、等人）：后面的车停远一点（倒车、打右灯、双闪时留 7 米给你倒）；等 3 秒对面没车就从左边绕过去
  const plSlow = Math.abs(pl.v) < 1.2 && !!(cur && cur.seg) && !cur.junc;
  T.plStill = plSlow ? (T.plStill || 0) + dt : 0;
  const plPark = plSlow && (pl.gear === 'R' || pl.sig === 1 || pl.sig === 2);
  for (const c of cars) {
    if (c.hitT > 0) { c.hitT -= dt; c.v = 0; continue; }
    if (c.fixed) { c.v = 0; continue; }      // Move Over 那两辆：一直停着
    const seg = c.seg; let vmax = (seg.school ? limitAt(seg, sAbsOf(c)) : seg.speed) / MPH * 0.88, gap = 1e9, vcap = 1e9;
    const hx = Math.cos(c.h), hz = Math.sin(c.h), look = 40 + c.v * 2.2;
    // 前面有东西：g 是车头到它的空隙（已经减掉安全距离），vl 是它沿我方向的速度。
    // 它在动就跟着它的速度、留大约 1 秒车距；停着就按刹停距离算
    const obst = (g, vl) => {
      if (vl > 0.5 && g > 0) { const e = g - c.v * 1.0; vcap = Math.min(vcap, e <= 0 ? vl * 0.85 : Math.sqrt(vl * vl + 5.2 * e)); }
      else gap = Math.min(gap, g);
    };
    // 停在路边、打着左灯：玩家从后面开过来（25–70 米）或者等够了，就慢慢开出来
    if (c.parked) {
      c.v = 0; c.leaveT -= dt; let go = c.leaveT <= 0;
      if (cur && cur.seg === seg && cur.fwd === c.fwd && c.mode === 'seg') { const d = (sAbsOf(c) - cur.s) * (c.fwd ? 1 : -1); if (d > 30 && d < 75) go = true; if (d > -8 && d < 30) go = false; }
      if (!go) continue;
      c.parked = false; c.pulling = true; c.off0 = c.off;
    }
    if (c.pulling) {
      let hold = false;
      if (cur && cur.seg === seg && cur.fwd === c.fwd) { const d = (sAbsOf(c) - cur.s) * (c.fwd ? 1 : -1); if (d > -8 && d < 32 && Math.abs(pl.v) > 1) hold = true; }
      if (hold && c.off <= c.off0 - 0.5) { c.v = 0; continue; }
      c.off = Math.max(0, c.off - dt * 0.9); vmax = Math.min(vmax, 3.5); if (c.off <= 0) { c.pulling = false; c.sig = 0; }
    }
    // 校车：开到要停的地方停下，闪红灯、伸出 STOP 牌，停 9–13 秒
    if (c.kind === 'bus') {
      vmax *= 0.8;
      if (c.flash > 0) { c.flash -= dt; gap = 0; if (c.flash <= 0) c.nextStop = null; }
      else if (c.mode === 'seg' && c.nextStop != null) { const d = c.nextStop - c.u; if (d < 30) gap = Math.min(gap, d); if (d < 0.6 && c.v < 0.2) c.flash = 9 + T.rnd() * 4; }
    }
    // 鸣笛的车：开得快；前面有让到路边的车或者停下的玩家，就往左偏（压着中线）过去
    if (c.kind === 'ems') vmax = seg.speed / MPH * 1.25 + 3;
    else if (c.mode === 'seg') {
      // 后面 80 米内有鸣笛的车：靠右、停下，等它过去（39:4-92）；对面开过来的也停下靠右。
      // 右边停着车就只往右挪到不碰它为止，挪不动就停在车道里（鸣笛的车从左边绕过去）
      c.yieldE = false;
      for (const e of emss) if (e.mode === 'seg' && e.seg === seg) { const d = (sAbsOf(c) - sAbsOf(e)) * (c.fwd ? 1 : -1); if (e.fwd === c.fwd ? d > 0 && d < 80 : d < 0 && d > -70) c.yieldE = true; }
      if (c.yieldE) {
        vmax = 0;
        if (!c.parked && !c.pulling && c.idx === useLane(seg, c.fwd) - 1 && (c.off || 0) < 1.3) {
          const nOff = Math.min(1.3, (c.off || 0) + dt * 0.8), sA = sAbsOf(c);
          offsetPoint(seg, sA, laneCenter(seg, c.fwd, c.idx) + (c.fwd ? 1 : -1) * nOff, P);
          if (!map.hitParked(P.x, P.z, c.h, c.L / 2 + 0.4, c.W / 2 + 0.25)) c.off = nOff;
        }
      }
      else if (!c.parked && !c.pulling && c.off > 0) c.off = Math.max(0, c.off - dt * (c.off > 1.5 ? 1.1 : 0.6));
      // 停着闪红灯的校车：同一条路上两个方向的车都停在离它 25 英尺（约 8 米）外
      for (const b of buses) if (b !== c && b.seg === seg) { const d = (sAbsOf(b) - sAbsOf(c)) * (c.fwd ? 1 : -1); if (d > 0 && d < 70) gap = Math.min(gap, d - (b.L + c.L) / 2 - 7.6); }
      // 右道上停着闪灯的警车：右道的车找空当并到左边一条道绕过去（没空当就在它后面等）；左边那条道的车减速经过
      for (const m of mos) if (m.seg === seg && m.fwd === c.fwd) {
        const n = useLane(seg, c.fwd), d = (sAbsOf(m) - sAbsOf(c)) * (c.fwd ? 1 : -1);
        if (c.idx === n - 1 && d > 0 && d < 70) {
          const me = sAbsOf(c), ti = n - 2;
          let free = !cars.some(o => o !== c && o.mode === 'seg' && o.seg === seg && o.fwd === c.fwd && o.idx === ti && Math.abs(sAbsOf(o) - me) < 14);
          if (free && cur && cur.seg === seg && cur.fwd === c.fwd && Math.abs(cur.s - me) < 16) { const pi = Math.floor((c.fwd ? cur.o - seg.cOff : seg.cOff - cur.o) / LANE_W); if (pi === ti) free = false; }
          if (free) { c.idx = ti; c.off = (c.off || 0) + LANE_W; }      // 换道：车先留在原地，off 慢慢回到 0 就挪过去了
          else gap = Math.min(gap, d - (c.L + m.L) / 2 - 3);
        }
        if (c.idx === n - 2 && d > -5 && d < 90) vmax = Math.min(vmax, Math.max(4, (seg.speed - 12) / MPH));
      }
      // 路中间横穿的行人
      for (const q of mids) if (q.seg === seg) { const d = (q.s - sAbsOf(c)) * (c.fwd ? 1 : -1); if (d > 0 && d < 35) gap = Math.min(gap, d - c.L / 2 - 2.5); }
    }
    let behindPl = -1e9;
    if (c.mode === 'seg' && c.kind !== 'ems' && c.kind !== 'bus' && !c.parked && !c.pulling) {
      if (cur && cur.seg === seg && cur.fwd === c.fwd && !cur.junc) behindPl = (cur.s - sAbsOf(c)) * (c.fwd ? 1 : -1);
      if (c.passing) { vmax = Math.min(vmax, 5); if (behindPl < -(c.L + 4)) c.passing = false; }
      else if (behindPl > 0 && behindPl < 28 && T.plStill > 3 && c.v < 0.3) {
        c.pwait = (c.pwait || 0) + dt;
        const left = c.idx > 0 ? 'lane' : (c.fwd ? seg.lb : seg.lf) > 0 ? 'opp' : null;      // 左边有同向的道，或者是双向路（借对向车道）
        if (c.pwait > 2.5 && left && seg.useLen - c.u > behindPl + 14) {
          const me = sAbsOf(c), dir = c.fwd ? 1 : -1;
          const busy = cars.some(o => o !== c && o.mode === 'seg' && o.seg === seg && (left === 'lane' ? o.fwd === c.fwd && o.idx === c.idx - 1 && Math.abs(sAbsOf(o) - me) < 30 : o.fwd !== c.fwd && !o.parked && (sAbsOf(o) - me) * dir > -2 && (sAbsOf(o) - me) * dir < behindPl + 20 + o.v * 8));      // 对面来车：绕完这一段（约 8 秒）之前会开到的才算；停在路边的、已经开过去的不算
          // 弯道上不借道（看不见对面来车，车身也会扫到玩家）：从自己到玩家前面 12 米，路的方向变了 20° 以上就接着等
          pointAt(seg, me, P); const h0 = Math.atan2(P.dz, P.dx); pointAt(seg, Math.max(seg.trimA, Math.min(seg.len - seg.trimB, cur.s + dir * 12)), P);
          let dh = Math.atan2(P.dz, P.dx) - h0; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
          if (!busy && Math.abs(dh) < 0.35) { c.passing = true; c.pwait = 0; }
        }
      } else c.pwait = 0;
      const want = c.passing ? -LANE_W : 0;
      if (c.passing || c.off < 0) c.off = (c.off || 0) + Math.sign(want - (c.off || 0)) * Math.min(Math.abs(want - (c.off || 0)), dt * 1.4);
    }
    // 前面的东西：同车道的车、路口里刚进去的车、玩家
    for (const o of cars) {
      if (o === c || o.parked || o.isPlayer || (c.kind === 'ems' && o.yieldE)) continue;      // 停在路边的车不挡路；鸣笛的车绕过让到路边的车
      const dx = o.x - c.x, dz = o.z - c.z, ahead = dx * hx + dz * hz; if (ahead < 0.5 || ahead > look || Math.abs((o.y || 0) - (c.y || 0)) > 3) continue;
      const ch = Math.cos(o.h - c.h); if (Math.abs(-dx * hz + dz * hx) < 1.7 && (ch > (ahead > 40 ? 0.7 : -0.3) || (o.passing && !c.passing && ch < -0.7 && ahead < 40))) obst(ahead - (c.L + o.L) / 2 - 2.2, o.v * ch);      // 对面有车借我这条道绕玩家：我停下等它绕回去（它已经开出去了，不让它停，免得两边干耗）
    }
    // 玩家：按玩家车身实际占的宽度算（斜着变道、没开在车道中间时，车角会伸进这条道）
    {
      const dx = pl.x - c.x, dz = pl.z - c.z, ahead = dx * hx + dz * hz, side = Math.abs(-dx * hz + dz * hx), dh = (pl.h || 0) - c.h;
      const sn = Math.abs(Math.sin(dh)), cs = Math.abs(Math.cos(dh)), ext = sn * CAR.L / 2 + cs * CAR.W / 2, along = cs * CAR.L / 2 + sn * CAR.W / 2;
      const around = c.passing && c.off < -2.4 && Math.abs(pl.v) < 1.2;      // 已经开到左边那条道上绕玩家了：路弯的时候按车头方向量会误判成玩家挡在前面
      if (!around && Math.abs((pl.y || 0) - (c.y || 0)) < 3 && ahead > 0.5 && ahead < look && side - ext < c.W / 2 + ((c.kind === 'ems' || c.passing) && c.mode === 'seg' && Math.abs(pl.v) < 1.2 ? 0.05 : 0.5) + (c.mode === 'junc' ? Math.min(1.5, Math.abs(pl.v) * 0.15) : 0)) obst(ahead - c.L / 2 - along - 2.4 - (plPark && behindPl > 0 && !c.passing ? 7 : 0), pl.v * Math.cos(dh));
    }
    // 铁路道口：闪红灯就停在离铁轨 15 英尺（4.6 米）的地方；没闪灯但道口那边堵着（停下来会停在铁轨上），也先在道口前等
    if (c.mode === 'seg' && seg.rail) for (const x of seg.rail) {
      const d = (x.s - sAbsOf(c)) * (c.fwd ? 1 : -1) - x.span - c.L / 2;
      if (d > 0.3 && d < look + 20 && (x.on || (d < 30 && gap < d + 2 * x.span + c.L + 1))) gap = Math.min(gap, d - 4.6);
    }
    if (c.mode === 'seg') {
      const j = endJ(seg, c.fwd), toEdge = seg.useLen - c.u, dstop = toEdge - STOP_LINE - c.L / 2 - 0.4, pn = c.plan;
      if (j && pn && j.control !== 'joint') {
        const leg = pn.leg; let enter = true;
        if (c.kind === 'ems') { if (toEdge < 30 && cars.some(o => o !== c && o.mode === 'junc' && o.plan.j === j)) gap = Math.min(gap, dstop); }      // 鸣笛的车不等红灯，路口里有车才等
        else {
        // 让行人：自己这条腿的斑马线、要开出去的那条腿的斑马线
        if (pedOnCrosswalk(T, seg, c.fwd ? 'b' : 'a') || pedOnCrosswalk(T, pn.seg, pn.out.end)) enter = false;
        // 别堵路口：要开进去的那条路一进去就堵着（前面的车停在路口边上），先在停止线前等
        // 过路口后车道变少、两条道并进同一条：旁边那条道的车刚开进去，就等它先走
        if (enter && toEdge < 30) for (const o of cars) if (o !== c && o.mode === 'junc' && o.plan.j === j && o.plan.seg === pn.seg && o.plan.fwd === pn.fwd && o.plan.idx === pn.idx && o.plan.len - o.w > 3) { enter = false; break; }
        if (enter && toEdge < 30) for (const o of cars) if (o !== c && o.mode === 'seg' && o.seg === pn.seg && o.fwd === pn.fwd && o.u < o.L / 2 + c.L + 3 && o.v < 1.5) { enter = false; break; }
        if (j.control === 'signal') {
          const st = signalState(j, leg.group, t);
          if (st === 'R' || (st === 'Y' && dstop > c.v * 1.1)) enter = false;
        } else if (leg.stop) {
          if (dstop < 1.2 && c.v < 0.25) { if (c.stopT < 0) c.stopT = t; c.wait += dt; }
          if (c.wait < 1.0) enter = false;
        }
        const meek = !c.bold || pn.type === 'left' || (j.control !== 'signal' && j.control !== 'none');
        if (enter && toEdge < 30) {
          // 路口里有别的方向来的车、或者玩家在路口里：等
          if (meek) for (const o of cars) if (o !== c && o.mode === 'junc' && o.plan.j === j && o.plan.leg !== leg && !(j.control === 'signal' && o.plan.leg.group === leg.group && o.plan.type !== 'left' && pn.type !== 'left')) { enter = false; break; }
          if (pj === j) enter = false;
          // 左转让对向直行；STOP 让没有 STOP 的方向；全向停车让先到的
          if (enter && meek) for (const o of cars) {
            if (o === c || o.isPlayer || o.mode !== 'seg' || endJ(o.seg, o.fwd) !== j || !o.plan || o.plan.leg === leg) continue;
            const d = o.seg.useLen - o.u, soon = o.v > 2 && d / Math.max(o.v, 3) < 4 && d < 45, ol = o.plan.leg, opp = ol.ox * leg.ox + ol.oz * leg.oz < -0.6;
            if (j.control === 'signal') { if (pn.type === 'left' && opp && soon && o.plan.type !== 'left') enter = false; }
            else if (leg.stop && !ol.stop) { if (soon) enter = false; }
            else if (j.control === 'allway' && o.stopT >= 0 && (c.stopT < 0 || o.stopT < c.stopT - 0.01 || (o.stopT === c.stopT && o.id < c.id))) enter = false;
            if (!enter) break;
          }
          // 玩家也算一辆车：玩家有路权且马上到，或者全向停车时玩家先停稳 —— 等玩家（最多等 7 秒，免得两边干耗）
          if (enter && cur && cur.seg && endJ(cur.seg, cur.fwd) === j && c.wait < 7) {
            const pleg = map.legOf(j, cur.seg, cur.fwd ? 'b' : 'a'), pd = cur.fwd ? cur.seg.len - cur.seg.trimB - cur.s : cur.s - cur.seg.trimA;
            if (pleg && pleg !== leg) {
              const soon = Math.abs(pl.v) > 2 && pd / Math.max(Math.abs(pl.v), 3) < 4 && pd < 45;
              const pt = pd / Math.max(Math.abs(pl.v), 3);
              if (j.control === 'allway') { if (pl.stopT >= 0 && (c.stopT < 0 || pl.stopT < c.stopT)) enter = false; }
              else if (j.control === 'signal') { if (pn.type === 'left' && pleg.ox * leg.ox + pleg.oz * leg.oz < -0.6 && pl.sig !== -1 && Math.abs(pl.v) > 2 && pt < 5 && pd < 60 && signalState(j, pleg.group, t) !== 'R') enter = false; }
              else if (leg.stop && !pleg.stop) { if (soon) enter = false; }
              else if (!pleg.stop && soon && pt < toEdge / Math.max(c.v, 2) + 1) enter = false;
            }
          }
        }
        if (!enter) gap = Math.min(gap, dstop);
        }
      } else if (!j || !pn) { if (toEdge < 2) c.dead = true; }
      if (pn && pn.type !== 'through' && toEdge < 22) vmax = Math.min(vmax, 5.2);
    } else {
      vmax = Math.min(vmax, c.plan.type === 'through' ? 9 : 5.2);
      // 路口里要开进同一条道的车：离出口远的那辆跟在后面
      for (const o of cars) if (o !== c && o.mode === 'junc' && o.plan.seg === c.plan.seg && o.plan.fwd === c.plan.fwd && o.plan.idx === c.plan.idx) {
        const mine = c.plan.len - c.w, theirs = o.plan.len - o.w;
        if (theirs < mine || (theirs === mine && o.id < c.id)) gap = Math.min(gap, mine - theirs - (c.L + o.L) / 2 - 1.5);
      }
      if (pedOnCrosswalk(T, c.plan.seg, c.plan.out.end)) gap = Math.min(gap, c.plan.len - c.w - c.L / 2 - XWALK_FAR - 0.5);
    }
    if (c.kind === 'ems') {
      let blocked = false; for (const o of cars) if (o !== c && o.yieldE && o.mode === 'seg' && o.seg === c.seg && o.fwd === c.fwd) { const d = (sAbsOf(o) - sAbsOf(c)) * (c.fwd ? 1 : -1); if (d > -8 && d < 40) blocked = true; }
      if (cur && cur.seg === c.seg && c.mode === 'seg') { const d = (cur.s - sAbsOf(c)) * (c.fwd ? 1 : -1); if (d > -8 && d < 40 && Math.abs(pl.v) < 1) blocked = true; }
      const want = blocked ? -2.4 : 0; c.off = (c.off || 0) + Math.sign(want - (c.off || 0)) * Math.min(Math.abs(want - (c.off || 0)), dt * 1.6);
    }
    const target = Math.min(vmax, vcap, gap <= 0 ? 0 : Math.sqrt(2 * 2.6 * gap));
    c.v = target > c.v ? Math.min(target, c.v + 1.9 * dt) : Math.max(target, c.v - (target < c.v - 4 ? 8 : 5.5) * dt);
    if (gap <= 0.15) c.v = 0;
    // 互相等成了死结（几个挨得很近的路口里各卡一辆）：停了 45 秒以上（比最长的红灯还久）、又不在玩家眼前的，直接撤掉
    c.stuck = c.v < 0.05 ? (c.stuck || 0) + dt : 0;
    if (c.stuck > 45 && Math.hypot(c.x - pl.x, c.z - pl.z) > 45) { c.dead = true; continue; }
    const step = c.v * dt; let justIn = false;
    if (c.mode === 'seg') {
      c.u += step;
      if (c.u >= seg.useLen) {
        if (c.plan) { c.mode = 'junc'; c.w = c.u - seg.useLen; c.wait = 0; c.stopT = -1; justIn = true; } else { c.dead = true; continue; }
      } else poseOnSeg(c);
    }
    if (c.mode === 'junc') {
      const p = c.plan; if (!justIn) c.w += step;
      // 校车拐进新路段：看这一段要不要停（离两头都至少 45 米，从路口拐进来的车还来得及停）
      if (c.w >= p.len) { c.mode = 'seg'; c.seg = p.seg; c.fwd = p.fwd; c.idx = p.idx; c.u = c.w - p.len; c.w = 0; if (c.kind === 'bus') c.nextStop = c.seg.useLen > 110 && T.rnd() < 0.6 ? 45 + T.rnd() * (c.seg.useLen - 90) : null; if (c.kind === 'ems' || c.off < 0) c.off = 0; c.passing = false; planTurn(T, c); poseOnSeg(c); }
      else { const k = c.w / p.len; c.x = bez(p.x0, p.cx, p.x2, k); c.z = bez(p.z0, p.cz, p.z2, k); c.y = p.j.y || 0; c.h = Math.atan2(2 * (1 - k) * (p.cz - p.z0) + 2 * k * (p.z2 - p.cz), 2 * (1 - k) * (p.cx - p.x0) + 2 * k * (p.x2 - p.cx));
        // 鸣笛的车绕着别的车开进路口：偏出去的那段在路口前半段慢慢收回来，不是一下跳回车道中间（会跳到旁边停着的车身上）
        if ((c.kind === 'ems' || c.off < 0) && c.off) { const f = c.off * Math.max(0, 1 - 2 * k); c.x -= Math.sin(c.h) * f; c.z += Math.cos(c.h) * f; } }
    }
  }
}

/** 玩家车身有没有撞到别的车 / 行人；有没有贴着正在过马路的行人开过去。返回 { car, ped, closePed } */
export function playerContacts(T, pl) {
  const out = { car: null, ped: null, closePed: null }, hx = Math.cos(pl.h), hz = Math.sin(pl.h);
  for (const c of T.cars) if (Math.abs(c.x - pl.x) < 6 && Math.abs(c.z - pl.z) < 6 && Math.abs((c.y || 0) - (pl.y || 0)) < 2 && obbOverlap(pl.x, pl.z, pl.h, CAR.L / 2, CAR.W / 2, c.x, c.z, c.h, c.L / 2, c.W / 2)) { out.car = c; break; }
  for (const p of T.peds) {
    if (!p.onRoad || (pl.y || 0) > 2) continue;
    const dx = p.x - pl.x, dz = p.z - pl.z, a = dx * hx + dz * hz, b = -dx * hz + dz * hx;
    if (Math.abs(a) < CAR.L / 2 + 0.25 && Math.abs(b) < CAR.W / 2 + 0.25) { out.ped = p; break; }
    if (!p.flagged && a > CAR.L / 2 - 0.5 && a < CAR.L / 2 + 3.2 && Math.abs(b) < CAR.W / 2 + 1.6 && pl.v > 1.6) out.closePed = p;
  }
  return out;
}
/** 玩家前方要经过的斑马线上有没有人（给教练提示用） */
export function pedAhead(T, pl, range = 30) {
  const hx = Math.cos(pl.h), hz = Math.sin(pl.h);
  for (const p of T.peds) { if (p.mode !== 'cross' && !(p.mode === 'wait' && p.wait > 0.3)) continue; const dx = p.x - pl.x, dz = p.z - pl.z, a = dx * hx + dz * hz; if (a > 1 && a < range && Math.abs(-dx * hz + dz * hx) < 7) return p; }
  return null;
}
export { LANE_W };
