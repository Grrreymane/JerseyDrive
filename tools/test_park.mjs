// 侧方停车 / 倒车时后面来车：玩家停在车道里挂 R、打右灯，后面的车要停在 7 米以外等；
// 双向路上等一会儿、对面没车就从左边绕过去；单行道一条道的就一直等着，不能贴上来。用法：node tools/test_park.mjs [map_all.json]
import { readFileSync } from 'node:fs';
import { prepareMap, offsetPoint, laneCenter, obbOverlap, CAR, pointAt } from '../src/sim/map.js';
import { makeTraffic, stepTraffic, sAbsOf } from '../src/sim/traffic.js';
const map = prepareMap(JSON.parse(readFileSync(new URL('../data/' + (process.argv[2] || 'map.json'), import.meta.url))));
let fail = 0; const ok = (c, m) => { console.log((c ? '  ok  ' : '  FAIL') + ' ' + m); if (!c) fail++; };

function run(seg) {
  const T = makeTraffic(map, seg.id), sP = seg.trimA + seg.useLen * 0.65, P = {};
  offsetPoint(seg, sP, laneCenter(seg, true, seg.lf - 1), P);
  const pl = { x: P.x, z: P.z, h: Math.atan2(P.dz, P.dx), v: 0, y: 0, gear: 'R', sig: 1, cur: { seg, fwd: true, s: sP, o: laneCenter(seg, true, seg.lf - 1), junc: null }, stopT: -1 };
  T.cars.length = 0;
  const c = { id: 999, kind: 'car', mode: 'seg', seg, fwd: true, idx: seg.lf - 1, u: sP - seg.trimA - 45, v: 6, L: 4.5, W: 1.8, col: 0, tr: 0, wait: 0, stopT: -1, x: 0, z: 0, h: 0, plan: null, w: 0 };
  { const Q = offsetPoint(seg, seg.trimA + c.u, laneCenter(seg, true, c.idx), {}); c.x = Q.x; c.z = Q.z; c.h = Math.atan2(Q.dz, Q.dx); }
  T.cars.push(c);
  let minGap = 1e9, passed = false, hit = false;
  for (let i = 0; i < 50 * 30 && !passed; i++) {
    stepTraffic(T, pl, i / 30, 1 / 30);
    if (c.dead || !T.cars.includes(c)) break;
    const behind = sP - sAbsOf(c);
    if (!c.passing && behind > 0 && Math.abs(c.off || 0) < 0.5) minGap = Math.min(minGap, behind - c.L / 2 - CAR.L / 2);
    if (behind < -8) passed = true;
    if (obbOverlap(c.x, c.z, c.h, c.L / 2 - 0.1, c.W / 2 - 0.1, pl.x + Math.cos(pl.h) * CAR.center, pl.z + Math.sin(pl.h) * CAR.center, pl.h, CAR.L / 2 - 0.1, CAR.W / 2 - 0.1)) hit = true;
  }
  return { minGap, passed, hit };
}
// 直路（弯道上后车不借道，只等着）
const straight = (s) => { const P = {}, sP = s.trimA + s.useLen * 0.65; pointAt(s, sP - 45, P); const a = Math.atan2(P.dz, P.dx); pointAt(s, sP + 12, P); let d = Math.atan2(P.dz, P.dx) - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d) < 0.25; };
const two = map.segs.filter(s => !s.oneway && s.lf === 1 && s.lb === 1 && s.useLen > 160 && !s.high && s.speed <= 30 && straight(s)).slice(0, 10);
const one = map.segs.filter(s => s.oneway && s.lf === 1 && s.useLen > 160 && !s.high && s.speed <= 30).slice(0, 6);
let tp = 0, tHit = 0, tGap = 1e9, oGap = 1e9, oHit = 0, oPass = 0;
for (const s of two) { const r = run(s); if (r.passed) tp++; if (r.hit) tHit++; tGap = Math.min(tGap, r.minGap); }
for (const s of one) { const r = run(s); if (r.passed) oPass++; if (r.hit) oHit++; oGap = Math.min(oGap, r.minGap); }
ok(two.length >= 5, `双向窄街 ${two.length} 条，单行道 ${one.length} 条`);
ok(tp === two.length, `双向路：后车绕过去 ${tp}/${two.length}`);
ok(tGap >= 6.5, `双向路：绕之前离玩家最近 ${tGap.toFixed(1)} 米（要 ≥ 6.5）`);
ok(oGap >= 6.5 && oPass === 0, `单行道：一直在后面等，最近 ${oGap.toFixed(1)} 米，绕过去 ${oPass} 次`);
ok(tHit + oHit === 0, `蹭到玩家：${tHit + oHit} 次`);
console.log(fail ? `\n${fail} 项失败` : '\n全部通过'); process.exit(fail ? 1 : 0);
