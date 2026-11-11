// 交规判定：每一步看车的位置和状态，产出事件（违规 / 做对了 / 提示）。纯逻辑。
import { STOP_LINE, CAR, LANE_W, laneInfo, turnType, signalState } from './map.js';
import { MPH, carCenter, carFront } from './car.js';
import { threatsAt, playerContacts, pedAhead } from './traffic.js';

export const PENALTY = {
  red_light: 20, stop_sign: 15, rolling_stop: 10, wrong_way: 20, wrong_side: 10, crash: 20, off_road: 10,
  no_yield: 15, no_yield_ped: 15, hit_ped: 30, hit_car: 20,
  speeding: 8, no_signal: 5, late_signal: 2, wrong_lane_from: 5, wrong_lane_into: 5, lane_no_signal: 4, over_line: 3,
};
const SEV = { good_stop: 'good', good_ror: 'good', good_turn: 'good', map_edge: 'info', late_signal: 'minor', over_line: 'minor' };

export function makeRules() {
  return {
    events: [], log: [], score: 100, phase: 'seg', A: null, E: null, sigOdo: -1e9, lastSignal: 0,
    speedT: 0, speedCool: 0, wrongT: 0, wrongActive: false, sideT: 0, sideActive: false,
    lane: null, pendingInto: null, hint: null, preview: null, cur: null, needReset: null, good: 0,
  };
}
export function clearTransient(R) { R.phase = 'seg'; R.A = null; R.E = null; R.lane = null; R.pendingInto = null; R.wrongT = 0; R.sideT = 0; R.wrongActive = false; R.sideActive = false; R.hint = null; R.preview = null; }

function emit(R, type, car, t, street, extra) {
  const sev = SEV[type] || 'bad';
  const ev = { type, sev, t, x: car.x, z: car.z, street: street || '', ...extra };
  R.events.push(ev); R.log.push(ev);
  if (PENALTY[type]) R.score = Math.max(0, R.score - PENALTY[type]);
  if (sev === 'good') R.good++;
  return ev;
}

function allowedFrom(seg, fwd, lane, type) {
  const tl = fwd ? seg.turnF : seg.turnB;
  if (tl && tl.length === lane.n) {
    const m = tl[lane.idx] || '', has = (x) => m.split(';').some(k => k === x || k === 'slight_' + x);
    if (m && m !== 'none') return has(type);
    if (type === 'through') return true;
    if (tl.some(x => x.split(';').includes(type))) return false;      // 有专用转弯道，就不能从别的道转
  } else if (type === 'through') return true;
  return type === 'left' ? lane.idx === 0 : lane.idx === lane.n - 1;
}

const c = {}, f = {}, loc = {};
/** T：车流和行人（可以不传，就是空城） */
export function stepRules(R, car, map, t, dt, T = null) {
  R.events.length = 0;
  carCenter(car, c); carFront(car, f);
  // 记下灯是什么时候开的；灯灭了也记一笔，刚灭不久（25 米内）进路口仍然算打过灯
  if (car.signal !== R.lastSignal) {
    if (car.signal) R.sigOdo = car.odo; else { R.offDir = R.lastSignal; R.offOdo = car.odo; R.offOn = R.sigOdo; }
    R.lastSignal = car.signal;
  }
  map.locate(c.x, c.z, loc);
  const seg = loc.seg;
  if (!seg) { R.needReset = { flip: true }; return; }
  const fwd = Math.cos(car.h) * loc.dx + Math.sin(car.h) * loc.dz >= 0;
  const jf = map.junctionAt(f.x, f.z), jc = map.junctionAt(c.x, c.z);
  const key = seg.id * 2 + (fwd ? 1 : 0);
  const sp = Math.abs(car.v), street = jc ? jc.name : seg.name;
  R.cur = { seg, fwd, s: loc.s, o: loc.o, junc: jc, street };

  // 撞到停着的车 / 开出路面
  if (map.hitParked(c.x, c.z, car.h, CAR.L / 2, CAR.W / 2)) { emit(R, 'crash', car, t, street); R.needReset = {}; return; }
  R.alert = null;
  if (T) {
    const k = playerContacts(T, { x: c.x, z: c.z, h: car.h, v: car.v });
    if (k.ped) { emit(R, 'hit_ped', car, t, street); k.ped.flagged = true; R.needReset = { back: true }; return; }
    if (k.car) { emit(R, 'hit_car', car, t, street); R.needReset = { back: true }; return; }
    if (k.closePed) { k.closePed.flagged = true; emit(R, 'no_yield_ped', car, t, street); }
    if (pedAhead(T, { x: c.x, z: c.z, h: car.h }, 32)) R.alert = 'ped';
  }
  if (!map.onRoad(c.x, c.z, 0.3)) {
    const dead = (loc.s < 1 && !seg.ja) || (loc.s > seg.len - 1 && !seg.jb);
    if (dead) { emit(R, 'map_edge', car, t, street); R.needReset = { flip: true }; }
    else { emit(R, 'off_road', car, t, street); R.needReset = {}; }
    return;
  }

  if (R.phase === 'junc') {
    if (jc || jf) { if (jc && jc !== R.E.j) R.E = { j: jc, leg: null }; }
    else { finishJunction(R, R.E, seg, car, t); R.phase = 'seg'; R.A = null; R.E = null; }
  }
  if (R.phase === 'seg') {
    // ---- 接近路口 ----
    const j = fwd ? seg.jb : seg.ja;
    if (!R.A || R.A.key !== key) {
      const leg = map.legOf(j, seg, fwd ? 'b' : 'a');
      R.A = { key, j, leg, stopped: false, stopT: -1, overLine: false, minV: 99, exits: null };
      if (leg && j.control !== 'joint') R.A.exits = j.legs.filter(l => l !== leg).map(l => ({ type: turnType(-leg.ox, -leg.oz, l.ox, l.oz), name: l.segRef.name, ok: l.exit, oneway: l.segRef.oneway }));
    }
    const A = R.A;
    const sF = loc.s + (fwd ? 1 : -1) * (CAR.front - CAR.center);
    const de = fwd ? (seg.len - seg.trimB) - sF : sF - seg.trimA;     // 车头到路口边缘
    const controlled = A.leg && A.leg.approach && (j.control === 'signal' || A.leg.stop);
    R.hint = null; R.preview = null;
    if (controlled) {
      const dl = de - STOP_LINE;
      if (de < 16) A.minV = Math.min(A.minV, sp);
      if (sp < 0.12 && dl < 11 && de > -0.5) { if (!A.stopped) A.stopT = t; A.stopped = true; if (dl < -0.8) A.overLine = true; }
      if (de < 80) R.hint = j.control === 'signal'
        ? { kind: 'signal', state: signalState(j, A.leg.group, t), d: dl }
        : { kind: j.control === 'allway' ? 'allway' : 'stop', d: dl, stopped: A.stopped, inferred: j.inferred };
    } else if (A.leg && A.leg.approach && j.control === 'stop' && de < 60) R.hint = { kind: 'priority', d: de };
    if (A.exits && A.leg.approach && de < 110) R.preview = { j, exits: A.exits, de };
    // 该不该让：快到路口时看一眼有没有比你有路权的车
    if (T && A.leg && A.leg.approach && j.control !== 'joint' && de < 40 && !R.alert) {
      const th = threatsAt(T, j, A.leg, t, A.stopT);
      if (th.inJ) R.alert = 'inJ'; else if (j.control === 'allway' ? th.first : (A.leg.stop && j.control !== 'signal' && th.cross)) R.alert = 'car'; else if (th.oncoming && car.signal === -1) R.alert = 'oncoming';
    }

    if (jf) {
      // ---- 车头进入路口 ----
      const leg = jf === A.j ? A.leg : null;
      const E = R.E = { j: jf, leg, seg, fwd, t, stopped: A.stopped, overLine: A.overLine, minV: Math.min(A.minV, sp), signal: car.signal || (R.offDir && car.odo - R.offOdo < 25 ? R.offDir : 0), sigDist: car.signal ? car.odo - R.sigOdo : car.odo - (R.offOn ?? car.odo), lane: laneInfo(seg, loc.o, fwd), state: null, redDone: false };
      if (T && leg && leg.approach && jf.control !== 'joint') {
        const th = E.th = threatsAt(T, jf, leg, t, A.stopT);
        if (jf.control === 'allway') { if (th.inJ || th.first) { emit(R, 'no_yield', car, t, jf.name, { why: th.inJ ? 'inJ' : 'first' }); E.viol = true; } }
        else if (jf.control !== 'signal' && leg.stop && (th.inJ || th.cross)) { emit(R, 'no_yield', car, t, jf.name, { why: 'cross' }); E.viol = true; }
      }
      if (leg && leg.approach) {
        if (jf.control === 'signal') {
          E.state = signalState(jf, leg.group, t);
          if (E.state === 'R' && !E.stopped) { emit(R, 'red_light', car, t, jf.name); E.redDone = true; E.viol = true; }
          else if (E.state === 'R' && E.overLine) emit(R, 'over_line', car, t, jf.name);
        } else if (leg.stop) {
          if (!E.stopped) { emit(R, E.minV < 2.3 ? 'rolling_stop' : 'stop_sign', car, t, jf.name, { mph: E.minV * MPH }); E.viol = true; }
          else if (E.overLine) emit(R, 'over_line', car, t, jf.name);
          else emit(R, 'good_stop', car, t, jf.name);
        }
      }
      R.phase = 'junc'; R.hint = null;
    } else {
      // ---- 路段上的持续检查 ----
      const li = laneInfo(seg, loc.o, fwd), moving = car.v > 0.8;
      if (moving && li.side === 'wrongway') { R.wrongT += dt; if (R.wrongT > 0.7 && !R.wrongActive) { emit(R, 'wrong_way', car, t, street); R.wrongActive = true; } }
      else if (li.side !== 'wrongway') { R.wrongT = 0; R.wrongActive = false; }
      if (moving && li.side === 'oncoming' && li.rel < -0.7) { R.sideT += dt; if (R.sideT > 1.2 && !R.sideActive) { emit(R, 'wrong_side', car, t, street); R.sideActive = true; } }
      else if (li.side !== 'oncoming') { R.sideT = 0; R.sideActive = false; }

      const P = R.pendingInto;
      if (P) {
        if (P.key !== key) R.pendingInto = null;
        else if (car.odo - P.odo > 7) {
          if (li.side === 'ok' && li.n >= 2) {
            if (li.idx !== (P.type === 'left' ? 0 : li.n - 1)) emit(R, 'wrong_lane_into', car, t, street, { turn: P.type });
            else if (P.clean) emit(R, 'good_turn', car, t, street, { turn: P.type });
          }
          R.pendingInto = null; R.lane = { key, idx: li.idx };
        }
      } else if (li.side === 'ok' && li.n >= 2) {
        const L = R.lane;
        if (L && L.key === key) {
          const fp = li.rel / LANE_W;
          if (fp > L.idx + 1.12 || fp < L.idx - 0.12) {
            const dir = li.idx > L.idx ? 1 : -1;
            if (moving && car.signal !== dir) emit(R, 'lane_no_signal', car, t, street, { dir });
            L.idx = li.idx;
          }
        } else R.lane = { key, idx: li.idx };
      }
    }
  }
  // 超速（路口里也算）
  const mph = sp * MPH; R.speedCool -= dt;
  if (mph > seg.speed + 3.5) { R.speedT += dt; if (R.speedT > 1.5 && R.speedCool <= 0) { emit(R, 'speeding', car, t, street, { limit: seg.speed, mph }); R.speedCool = 20; } }
  else R.speedT = 0;
}

function finishJunction(R, E, seg, car, t) {
  if (!E || !E.leg || !E.leg.approach || E.j.control === 'joint') return;
  const out = E.j.legs.find(l => l.segRef === seg);
  if (!out || out === E.leg) return;                         // 掉头或倒了回去：不评
  const type = turnType(-E.leg.ox, -E.leg.oz, out.ox, out.oz), name = E.j.name;
  if (E.state === 'R' && E.stopped && !E.redDone) {
    if (type === 'right') emit(R, 'good_ror', car, t, name);
    else { emit(R, 'red_light', car, t, name, { afterStop: true, turn: type }); E.viol = true; }
  }
  if (E.th) {      // 绿灯左转要让对向直行；红灯右转要让横向来车
    if (type === 'left' && E.state !== 'R' && E.th.oncoming) { emit(R, 'no_yield', car, t, name, { why: 'oncoming' }); E.viol = true; }
    else if (type === 'right' && E.state === 'R' && E.th.cross) { emit(R, 'no_yield', car, t, name, { why: 'cross' }); E.viol = true; }
  }
  const laneOk = E.lane.side !== 'ok' || E.lane.n < 2 || allowedFrom(E.seg, E.fwd, E.lane, type);
  if (!laneOk) emit(R, 'wrong_lane_from', car, t, name, { turn: type });
  if (type === 'left' || type === 'right') {
    const need = type === 'left' ? -1 : 1; let clean = laneOk && !E.viol;
    if (E.signal !== need) { emit(R, 'no_signal', car, t, name, { turn: type }); clean = false; }
    else if (E.sigDist < 30) { emit(R, 'late_signal', car, t, name, { turn: type, dist: E.sigDist }); clean = false; }
    const outFwd = out.end === 'a', n = outFwd ? out.segRef.lf : out.segRef.lb;
    if (n >= 2) R.pendingInto = { key: seg.id * 2 + (outFwd ? 1 : 0), odo: car.odo, type, clean };
    else if (clean && n > 0) emit(R, 'good_turn', car, t, name, { turn: type });
  }
}
