// 救护车 / 警车鸣笛：玩家停在车道里（右边停满车挪不过去）时，鸣笛的车要能从左边绕过去；
// 让路的 AI 车往右靠时不能压到路边停着的车。用法：node tools/test_ems.mjs [map_all.json]
import { readFileSync } from 'node:fs';
import { prepareMap, offsetPoint, laneCenter, obbOverlap, CAR } from '../src/sim/map.js';
import { makeTraffic, stepTraffic, sAbsOf } from '../src/sim/traffic.js';
const map = prepareMap(JSON.parse(readFileSync(new URL('../data/' + (process.argv[2] || 'map.json'), import.meta.url))));
let fail = 0; const ok = (c, m) => { console.log((c ? '  ok  ' : '  FAIL') + ' ' + m); if (!c) fail++; };

// 窄的双向街（一来一回各一条道）、两边能停车、够长
const streets = map.segs.filter(s => !s.oneway && s.lf === 1 && s.lb === 1 && s.park >= 2 && s.useLen > 220 && !s.high).slice(0, 12);
let passed = 0, tried = 0, overlapParked = 0, overlapPlayer = 0;
for (const seg of streets) {
  const T = makeTraffic(map, seg.id), sP = seg.trimA + seg.useLen * 0.7, P = {};
  offsetPoint(seg, sP, laneCenter(seg, true, 0), P);
  const pl = { x: P.x, z: P.z, h: Math.atan2(P.dz, P.dx), v: 0, y: 0, cur: { seg, fwd: true, s: sP, o: laneCenter(seg, true, 0), junc: null }, stopT: -1 };
  for (let i = 0; i < 90; i++) stepTraffic(T, pl, i / 30, 1 / 30);
  T.emsT = 0; stepTraffic(T, pl, 3, 1 / 30);
  const e = T.cars.find(c => c.kind === 'ems'); if (!e) continue; tried++;
  let gone = false, hitP = false, hitMe = false;
  for (let i = 0; i < 40 * 30 && !gone; i++) {
    stepTraffic(T, pl, 3 + i / 30, 1 / 30);
    if (e.dead || e.mode !== 'seg' || e.seg !== seg || sAbsOf(e) > sP + 10) gone = true;
    for (const c of T.cars) if (c.yieldE && !c.parked && !c.pulling && map.hitParked(c.x, c.z, c.h, c.L / 2 - 0.1, c.W / 2 - 0.1)) hitP = true;
    if (obbOverlap(e.x, e.z, e.h, e.L / 2 - 0.1, e.W / 2 - 0.1, pl.x + Math.cos(pl.h) * CAR.center, pl.z + Math.sin(pl.h) * CAR.center, pl.h, CAR.L / 2 - 0.1, CAR.W / 2 - 0.1)) hitMe = true;
  }
  if (gone) passed++; if (hitP) overlapParked++; if (hitMe) overlapPlayer++;
}
ok(tried >= 5, `找到 ${tried} 条窄街放了鸣笛的车`);
ok(passed === tried, `玩家停在车道里，鸣笛的车绕过去 ${passed}/${tried}`);
ok(overlapParked === 0, `让路的车压到路边停着的车：${overlapParked} 条街`);
ok(overlapPlayer === 0, `鸣笛的车绕的时候蹭到玩家：${overlapPlayer} 条街`);
console.log(fail ? `\n${fail} 项失败` : '\n全部通过'); process.exit(fail ? 1 : 0);
