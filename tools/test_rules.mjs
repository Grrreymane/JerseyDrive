// 机器人沿车道开过路口，检查交规判定。用法：npm test
import fs from 'fs';
import { prepareMap, laneCenter, offsetPoint, signalState, CAR, STOP_LINE } from '../src/sim/map.js';
import { makeCar, stepCar } from '../src/sim/car.js';
import { makeRules, stepRules, clearTransient } from '../src/sim/rules.js';

const map = prepareMap(JSON.parse(fs.readFileSync(new URL('../data/map.json', import.meta.url), 'utf8')));
let fail = 0; const ok = (c, m) => { console.log((c ? '  ok  ' : '  FAIL') + ' ' + m); if (!c) fail++; };

// 统计
const trims = map.segs.map(s => s.useLen);
console.log('segs', map.segs.length, 'juncs', map.juncs.length, 'parked', map.parked.length, 'min useLen', Math.min(...trims).toFixed(1), 'short(<10m)', trims.filter(x => x < 10).length);
console.log('max junction r', Math.max(...map.juncs.map(j => j.r)).toFixed(1), 'big (>25m):', map.juncs.filter(j => j.r > 25).map(j => `${j.name}(${j.r.toFixed(0)}m,${j.legs.length}legs)`).join('; '));

// 让车沿 seg 的 fwd 方向从离路口 dist 米处出发，直行穿过路口
function place(seg, fwd, distToEdge) {
  const n = fwd ? seg.lf : seg.lb, s = fwd ? seg.len - seg.trimB - distToEdge : seg.trimA + distToEdge;
  const q = offsetPoint(seg, s, laneCenter(seg, fwd, n - 1), {});
  const car = makeCar(); car.h = Math.atan2(q.dz, q.dx) + (fwd ? 0 : Math.PI);
  car.x = q.x - Math.cos(car.h) * CAR.front; car.z = q.z - Math.sin(car.h) * CAR.front; car.gear = 'D'; return car;
}
function run(car, t0, secs, ctl) {
  const R = makeRules(); const evs = []; let t = t0;
  for (let i = 0; i < secs * 60; i++) {
    const inp = ctl(car, R, t) || { throttle: 0, brake: 0, steer: 0 };
    stepCar(car, { throttle: 0, brake: 0, steer: 0, analog: true, ...inp }, 1 / 60); stepRules(R, car, map, t, 1 / 60); evs.push(...R.events.map(e => e.type));
    if (R.needReset) break; t += 1 / 60;
  }
  return evs;
}
const cruise = (mph) => (car) => ({ throttle: car.v * 2.237 < mph ? 0.5 : 0, brake: 0 });
// 找一个“能直行穿过”的进口：对面有一条方向相近、可以开出去的腿
function findApproach(pred) {
  for (const j of map.juncs) for (const l of j.legs) {
    if (!l.approach || l.segRef.useLen < 60 || !pred(j, l)) continue;
    const o = j.legs.find(m => m !== l && m.exit && (-l.ox * m.ox - l.oz * m.oz) > 0.97 && m.segRef.useLen > 40);
    if (o && l.segRef.park >= 2 && o.segRef.park >= 2) return { j, l };
  }
}
{
  const a = findApproach((j, l) => l.stop);
  console.log('STOP 测试路口:', a.j.name, a.j.control);
  let ev = run(place(a.l.segRef, a.l.end === 'b', 40), 0, 14, cruise(20));
  ok(ev.includes('stop_sign'), '不停直接冲过 STOP → stop_sign  [' + ev + ']');
  ev = run(place(a.l.segRef, a.l.end === 'b', 40), 0, 60, (car, R) => {
    const de = R.A ? R.hint?.d : null;
    if (R.phase === 'seg' && de != null && de < 16 && car.v > 1.2) return { brake: 0.5 };
    return { throttle: car.v < 6 ? 0.4 : 0 };
  });
  ok(ev.includes('rolling_stop'), '减速但没停住 → rolling_stop  [' + ev + ']');
  let held = 0;
  ev = run(place(a.l.segRef, a.l.end === 'b', 40), 0, 60, (car, R) => {
    const d = R.hint?.d;
    if (R.phase === 'seg' && d != null && held < 60) { if (d < 1.2 + car.v * car.v / 7) { if (car.v === 0) held++; return { brake: 0.45 }; } }
    return { throttle: car.v < 6 ? 0.4 : 0 };
  });
  ok(ev[0] === 'good_stop', '停稳再走 → good_stop  [' + ev + ']');
}
{
  const a = findApproach((j, l) => j.control === 'signal');
  console.log('红绿灯测试路口:', a.j.name);
  // 找到该方向刚变红、刚变绿的时刻
  let tRed = 0, tGreen = 0;
  for (let t = 0; t < 200; t += 0.1) { const s0 = signalState(a.j, a.l.group, t), s1 = signalState(a.j, a.l.group, t + 0.1); if (s0 !== 'R' && s1 === 'R' && !tRed) tRed = t + 0.2; if (s0 === 'R' && s1 === 'G' && !tGreen) tGreen = t + 0.2; }
  let ev = run(place(a.l.segRef, a.l.end === 'b', 30), tRed, 10, cruise(20));
  ok(ev.includes('red_light'), '红灯直行 → red_light  [' + ev + ']');
  ev = run(place(a.l.segRef, a.l.end === 'b', 30), tGreen, 10, cruise(20));
  ok(!ev.includes('red_light'), '绿灯直行 → 没有 red_light  [' + ev + ']');
}
{
  // 逆行：找一条单行道，反着开
  const s = map.segs.find(s => s.oneway && s.useLen > 80 && s.lf === 1);
  const q = offsetPoint(s, s.len / 2, 0, {}); const car = makeCar(); car.h = Math.atan2(q.dz, q.dx) + Math.PI; car.x = q.x; car.z = q.z; car.gear = 'D';
  const ev = run(car, 0, 4, cruise(15));
  ok(ev.includes('wrong_way'), '单行道反向开 → wrong_way  [' + ev + ']');
  const car2 = place(s, true, 70); car2.v = 18; const ev2 = run(car2, 0, 3, cruise(40));
  ok(ev2.includes('speeding'), '25 限速开 40 → speeding  [' + ev2 + ']');
}

// ---------- 转弯机器人：沿“进口车道 → 弧线 → 出口车道”的路径开，检查转弯相关的判定 ----------
// dir: 1 右转 / -1 左转。opts: ctl 路口类型, multi 出口多车道, multiIn 进口多车道, laneIn/laneOut 指定车道,
//      noSignal 不打灯, sigAt 多远开始打灯, noStop 不停车, red 到达时是红灯, goRed 红灯停稳后照走, skip 跳过前几个候选
function botTurn(dir, opts = {}) {
  let pick = null, skip = opts.skip || 0;
  for (const j of map.juncs) {
    if (!(opts.ctl || ['allway']).includes(j.control)) continue;
    for (const l of j.legs) {
      if (!l.approach || l.segRef.useLen < 60) continue;
      if (opts.multiIn && (l.end === 'b' ? l.segRef.lf : l.segRef.lb) < 2) continue;
      const r = j.legs.find(m => m !== l && m.exit && (-l.ox * m.oz + l.oz * m.ox) * dir > 0.9 && m.segRef.useLen > 50 && (!opts.multi || (m.end === 'a' ? m.segRef.lf : m.segRef.lb) >= 2));
      if (r && skip-- <= 0) { pick = [j, l, r]; break; }
    }
    if (pick) break;
  }
  if (!pick) return ['(没找到合适的路口)'];
  const [j, l, r] = pick, tx = -l.ox, tz = -l.oz, rtx = l.oz, rtz = -l.ox;
  const inS = l.segRef, inF = l.end === 'b', nIn = inF ? inS.lf : inS.lb, laneIn = opts.laneIn ?? (dir > 0 ? nIn - 1 : 0);
  const latIn = (inF ? inS.cOff : -inS.cOff) + (laneIn + 0.5) * 3.3, P0 = [l.ex + rtx * latIn, l.ez + rtz * latIn];
  const oS = r.segRef, oF = r.end === 'a', nOut = oF ? oS.lf : oS.lb, laneOut = opts.laneOut ?? (dir > 0 ? nOut - 1 : 0);
  const latOut = (oF ? oS.cOff : -oS.cOff) + (laneOut + 0.5) * 3.3, P2 = [r.ex - r.oz * latOut, r.ez + r.ox * latOut];
  const u = ((P2[0] - P0[0]) * r.oz - (P2[1] - P0[1]) * r.ox) / (tx * r.oz - tz * r.ox), P1 = [P0[0] + tx * u, P0[1] + tz * u];
  const path = [];
  for (let s = 40; s > 0; s -= 2) path.push([P0[0] - tx * s, P0[1] - tz * s]);
  for (let k = 0; k <= 20; k++) { const t = k / 20, a = (1 - t) ** 2, b = 2 * t * (1 - t), c = t * t; path.push([a * P0[0] + b * P1[0] + c * P2[0], a * P0[1] + b * P1[1] + c * P2[1]]); }
  for (let s = 2; s < 60; s += 2) path.push([P2[0] + r.ox * s, P2[1] + r.oz * s]);
  const car = makeCar(); car.h = Math.atan2(tz, tx); car.x = P0[0] - tx * 48.7; car.z = P0[1] - tz * 48.7; car.gear = 'D';
  const R = makeRules(); let t = 0;
  if (opts.red) for (let q = 0; q < 200; q += 0.5) { let ok = signalState(j, l.group, q + 5) !== 'R'; for (let k = 6; k <= 26 && ok; k++) if (signalState(j, l.group, q + k) !== 'R') ok = false; if (ok) { t = q; break; } }
  const log = []; let pi = 0, held = 0, stopped = false;
  for (let n = 0; n < 60 * 70; n++) {
    const cx = car.x + Math.cos(car.h) * 1.4, cz = car.z + Math.sin(car.h) * 1.4;
    while (pi < path.length - 1 && Math.hypot(path[pi][0] - cx, path[pi][1] - cz) < 4.5) pi++;
    const T = path[pi], a = Math.atan2(T[1] - car.z, T[0] - car.x) - car.h, al = Math.atan2(Math.sin(a), Math.cos(a)), ld = Math.hypot(T[0] - car.x, T[1] - car.z);
    const inp = { steer: Math.max(-1, Math.min(1, Math.atan(2 * 2.7 * Math.sin(al) / ld) / 0.61)), throttle: car.v < (R.phase === 'junc' ? 3.2 : 6) ? 0.4 : 0, brake: 0, analog: true };
    const d = R.hint ? R.hint.d : null;
    if (!opts.noSignal && d != null && d < (opts.sigAt || 36) && R.phase === 'seg' && !stopped && car.signal !== dir) car.signal = dir;
    if (!stopped && !opts.noStop && d != null && R.phase === 'seg' && (R.hint.kind !== 'signal' || R.hint.state !== 'G') && d < 1.0 + car.v * car.v / 6.5) {
      inp.throttle = 0; inp.brake = 0.5;
      if (car.v === 0 && ++held > 40 && (opts.goRed || R.hint.kind !== 'signal' || R.hint.state === 'G')) stopped = true;
    }
    if (R.phase === 'junc' && car.v > 3.4) { inp.throttle = 0; inp.brake = 0.2; }
    stepCar(car, inp, 1 / 60); stepRules(R, car, map, t, 1 / 60); t += 1 / 60;
    for (const e of R.events) log.push(e.type);
    if (R.needReset) { log.push('RESET'); break; }
    if (pi >= path.length - 10) break;
  }
  return log;
}
const eq = (log, want, msg) => ok(JSON.stringify(log) === JSON.stringify(want), `${msg} → ${want.join(', ')}  [${log}]`);
console.log('转弯：');
eq(botTurn(1), ['good_stop', 'good_turn'], '全向停车路口规范右转');
eq(botTurn(-1), ['good_stop', 'good_turn'], '全向停车路口规范左转');
eq(botTurn(1, { noSignal: true }), ['good_stop', 'no_signal'], '右转不打灯');
eq(botTurn(1, { sigAt: 12 }), ['good_stop', 'late_signal'], '右转打灯太晚');
eq(botTurn(1, { noStop: true }), ['stop_sign'], 'STOP 不停直接右转');
eq(botTurn(-1, { ctl: ['signal'], multi: true }), ['good_turn'], '绿灯左转进最左车道');
eq(botTurn(-1, { ctl: ['signal'], multi: true, laneOut: 1 }), ['wrong_lane_into'], '左转进了外侧车道');
eq(botTurn(1, { ctl: ['signal'], red: true, goRed: true }), ['good_ror', 'good_turn'], '红灯停稳后右转');
eq(botTurn(-1, { ctl: ['signal'], red: true, goRed: true }), ['red_light'], '红灯停稳后左转');
eq(botTurn(1, { ctl: ['signal'], red: true, noStop: true }), ['red_light'], '红灯不停直接右转');
eq(botTurn(1, { ctl: ['signal', 'allway', 'stop'], multiIn: true, laneIn: 0 }), ['wrong_lane_from'], '从左车道右转');

console.log(fail ? `\n${fail} 项失败` : '\n全部通过'); process.exit(fail ? 1 : 0);
