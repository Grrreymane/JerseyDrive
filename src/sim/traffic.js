// 车流和行人：纯逻辑。别的车沿车道开，会等红灯、在 STOP 前停、让路口里的车和过马路的人；
// 行人沿人行道走，到有斑马线的路口过马路。只在玩家附近生成，走远了回收。
import { LANE_W, STOP_LINE, XWALK_NEAR, XWALK_FAR, CAR, offsetPoint, pointAt, laneCenter, turnType, signalState, obbOverlap, segY } from './map.js';
import { MPH } from './car.js';

const N_CARS = 26, N_PEDS = 30, SPAWN_R = 240, KEEP_R = 320, PED_R = 150, PED_KEEP = 210, WALK = 1.35;
const XW = (XWALK_NEAR + XWALK_FAR) / 2;
const ctl = (j) => j && (j.control === 'signal' || j.control === 'stop' || j.control === 'allway');
const P = {}, Q = {};

export function makeTraffic(map, seed = 12345) {
  let s = seed >>> 0 || 1; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  return { map, rnd, cars: [], peds: [], nextId: 1, tick: 0 };
}

const useLane = (seg, fwd) => fwd ? seg.lf : seg.lb;
const endJ = (seg, fwd) => fwd ? seg.jb : seg.ja;
/** 车在路段上的世界位置：u 是沿行驶方向、从路段可用部分起点量的距离 */
function poseOnSeg(c) {
  const seg = c.seg, sAbs = c.fwd ? seg.trimA + c.u : seg.len - seg.trimB - c.u;
  offsetPoint(seg, sAbs, laneCenter(seg, c.fwd, c.idx), P);
  c.x = P.x; c.z = P.z; c.h = Math.atan2(P.dz, P.dx) + (c.fwd ? 0 : Math.PI); c.y = segY(seg, sAbs);
}
const bez = (a, b, c, t) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;

/** 到路口时选一条出路，算好穿过路口的弧线 */
function planTurn(T, c) {
  const seg = c.seg, j = endJ(seg, c.fwd); c.plan = null;
  if (!j) return;
  const leg = T.map.legOf(j, seg, c.fwd ? 'b' : 'a'); if (!leg) return;
  const n = useLane(seg, c.fwd), opts = [];
  for (const l of j.legs) {
    if (l === leg || !l.exit) continue;
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
    const seg = map.segs[Math.floor(T.rnd() * map.segs.length)]; if (seg.useLen < 34) continue;
    const mx = seg.px[seg.n >> 1], mz = seg.pz[seg.n >> 1], d = Math.hypot(mx - pl.x, mz - pl.z); if (d > SPAWN_R || d < 70) continue;
    const fwd = seg.lb === 0 || T.rnd() < 0.5; if (!useLane(seg, fwd)) continue;
    const c = { id: T.nextId++, kind: 'car', mode: 'seg', seg, fwd, idx: Math.floor(T.rnd() * useLane(seg, fwd)), u: 6 + T.rnd() * (seg.useLen - 24), v: 0, L: 4.5, W: 1.8, col: Math.floor(T.rnd() * 12), suv: T.rnd() < 0.3, wait: 0, stopT: -1, x: 0, z: 0, h: 0, plan: null, w: 0 };
    poseOnSeg(c);
    if (Math.hypot(c.x - pl.x, c.z - pl.z) < 55) continue;
    if (T.cars.some(o => Math.hypot(o.x - c.x, o.z - c.z) < 14)) continue;
    c.v = seg.speed / MPH * 0.6; planTurn(T, c); T.cars.push(c); return;
  }
}

/** 行人：沿 seg 的 side 侧人行道走（dir = ±1 沿 a→b），到路口的斑马线过到对面再往回走 */
function spawnPed(T, pl) {
  const map = T.map;
  for (let tries = 0; tries < 10; tries++) {
    const seg = map.segs[Math.floor(T.rnd() * map.segs.length)]; if (seg.useLen < 30 || seg.speed > 36 || seg.high) continue;
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

  // ---------- 行人 ----------
  for (let i = peds.length - 1; i >= 0; i--) if (peds[i].mode === 'down' && (peds[i].downT += dt) > 9) peds.splice(i, 1);
  for (const p of peds) {
    if (p.mode === 'down') continue;
    const seg = p.seg, sA = seg.trimA + XW, sB = seg.len - seg.trimB - XW;
    if (p.mode === 'walk') {
      p.s += p.dir * p.sp * dt; p.lat = p.side * p.off;
      const atB = p.dir > 0 && p.s >= sB, atA = p.dir < 0 && p.s <= sA;
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
      if (p.lat * p.side <= -p.off) { p.side = -p.side; p.lat = p.side * p.off; p.mode = 'walk'; p.dir = p.end === 'b' ? -1 : 1; }
    }
    offsetPoint(seg, p.s, p.lat, P); p.x = P.x; p.z = P.z; p.onRoad = Math.abs(p.lat) < seg.halfW;
    p.h = p.mode === 'walk' ? Math.atan2(P.dz, P.dx) + (p.dir > 0 ? 0 : Math.PI) : Math.atan2(-p.side * P.dx, p.side * P.dz);
    p.ph += (p.mode === 'wait' ? 0 : p.sp) * dt * 4.6; p.moving = p.mode !== 'wait';
  }

  // ---------- 车 ----------
  for (const c of cars) {
    if (c.hitT > 0) { c.hitT -= dt; c.v = 0; continue; }
    const seg = c.seg; let vmax = seg.speed / MPH * 0.88, gap = 1e9;
    const hx = Math.cos(c.h), hz = Math.sin(c.h);
    // 前面的东西：同车道的车、路口里刚进去的车、玩家
    for (const o of cars) {
      if (o === c) continue;
      const dx = o.x - c.x, dz = o.z - c.z, ahead = dx * hx + dz * hz; if (ahead < 0.5 || ahead > 40 || Math.abs((o.y || 0) - (c.y || 0)) > 3) continue;
      if (Math.abs(-dx * hz + dz * hx) < 1.7 && Math.cos(o.h - c.h) > -0.3) gap = Math.min(gap, ahead - (c.L + o.L) / 2 - 2.2);
    }
    { const dx = pl.x - c.x, dz = pl.z - c.z, ahead = dx * hx + dz * hz, side = Math.abs(-dx * hz + dz * hx); if (Math.abs((pl.y || 0) - (c.y || 0)) < 3 && ahead > 0.5 && ahead < 40 && side < 1.9 + Math.min(1.5, Math.abs(pl.v) * 0.15) * (c.mode === 'junc' ? 1 : 0)) gap = Math.min(gap, ahead - (c.L + CAR.L) / 2 - 2.4); }
    if (c.mode === 'seg') {
      const j = endJ(seg, c.fwd), toEdge = seg.useLen - c.u, dstop = toEdge - STOP_LINE - c.L / 2 - 0.4, pn = c.plan;
      if (j && pn && j.control !== 'joint') {
        const leg = pn.leg; let enter = true;
        // 让行人：自己这条腿的斑马线、要开出去的那条腿的斑马线
        if (pedOnCrosswalk(T, seg, c.fwd ? 'b' : 'a') || pedOnCrosswalk(T, pn.seg, pn.out.end)) enter = false;
        if (j.control === 'signal') {
          const st = signalState(j, leg.group, t);
          if (st === 'R' || (st === 'Y' && dstop > c.v * 1.1)) enter = false;
        } else if (leg.stop) {
          if (dstop < 1.2 && c.v < 0.25) { if (c.stopT < 0) c.stopT = t; c.wait += dt; }
          if (c.wait < 1.0) enter = false;
        }
        if (enter && toEdge < 30) {
          // 路口里有别的方向来的车、或者玩家在路口里：等
          for (const o of cars) if (o !== c && o.mode === 'junc' && o.plan.j === j && o.plan.leg !== leg && !(j.control === 'signal' && o.plan.leg.group === leg.group && o.plan.type !== 'left' && pn.type !== 'left')) { enter = false; break; }
          if (pj === j) enter = false;
          // 左转让对向直行；STOP 让没有 STOP 的方向；全向停车让先到的
          if (enter) for (const o of cars) {
            if (o === c || o.mode !== 'seg' || endJ(o.seg, o.fwd) !== j || !o.plan || o.plan.leg === leg) continue;
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
              if (j.control === 'allway') { if (pl.stopT >= 0 && (c.stopT < 0 || pl.stopT < c.stopT)) enter = false; }
              else if (j.control !== 'signal' && leg.stop && !pleg.stop && soon) enter = false;
            }
          }
        }
        if (!enter) gap = Math.min(gap, dstop);
      } else if (!j || !pn) { if (toEdge < 2) c.dead = true; }
      if (pn && pn.type !== 'through' && toEdge < 22) vmax = Math.min(vmax, 5.2);
    } else {
      vmax = Math.min(vmax, c.plan.type === 'through' ? 9 : 5.2);
      if (pedOnCrosswalk(T, c.plan.seg, c.plan.out.end)) gap = Math.min(gap, c.plan.len - c.w - c.L / 2 - XWALK_FAR - 0.5);
    }
    const target = Math.min(vmax, gap <= 0 ? 0 : Math.sqrt(2 * 2.6 * gap));
    c.v = target > c.v ? Math.min(target, c.v + 1.9 * dt) : Math.max(target, c.v - 5.5 * dt);
    if (gap <= 0.15) c.v = 0;
    const step = c.v * dt; let justIn = false;
    if (c.mode === 'seg') {
      c.u += step;
      if (c.u >= seg.useLen) {
        if (c.plan) { c.mode = 'junc'; c.w = c.u - seg.useLen; c.wait = 0; c.stopT = -1; justIn = true; } else { c.dead = true; continue; }
      } else poseOnSeg(c);
    }
    if (c.mode === 'junc') {
      const p = c.plan; if (!justIn) c.w += step;
      if (c.w >= p.len) { c.mode = 'seg'; c.seg = p.seg; c.fwd = p.fwd; c.idx = p.idx; c.u = c.w - p.len; c.w = 0; planTurn(T, c); poseOnSeg(c); }
      else { const k = c.w / p.len; c.x = bez(p.x0, p.cx, p.x2, k); c.z = bez(p.z0, p.cz, p.z2, k); c.y = p.j.y || 0; c.h = Math.atan2(2 * (1 - k) * (p.cz - p.z0) + 2 * k * (p.z2 - p.cz), 2 * (1 - k) * (p.cx - p.x0) + 2 * k * (p.x2 - p.cx)); }
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
