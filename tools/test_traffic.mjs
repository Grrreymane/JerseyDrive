// 车流自检：玩家停在原地，让别的车和行人跑 3 分钟，看有没有算出 NaN、车有没有互相穿过去、路口有没有堵死。
import { readFileSync } from 'node:fs';
import { prepareMap, obbOverlap } from '../src/sim/map.js';
import { makeTraffic, stepTraffic } from '../src/sim/traffic.js';
const map = prepareMap(JSON.parse(readFileSync(new URL('../data/map.json', import.meta.url))));
let fail = 0;
for (const [px, pz] of [[0, 0], [300, -200], [-350, 250]]) {
  const T = makeTraffic(map, 777 + px), pl = { x: px, z: pz, h: 0, v: 0, cur: null, stopT: -1 };
  let overlaps = 0, nan = 0, moved = 0, stuck = 0, crossed = 0;
  for (let i = 0; i < 180 * 30; i++) {
    stepTraffic(T, pl, i / 30, 1 / 30);
    for (const c of T.cars) { if (!Number.isFinite(c.x + c.z + c.h + c.v)) nan++; if (c.v > 1) moved++; c.still = c.v < 0.05 ? (c.still || 0) + 1 : 0; }
    for (const p of T.peds) { if (!Number.isFinite(p.x + p.z)) nan++; if (p.mode === 'cross') crossed++; }
    if (i % 15 === 0) for (let a = 0; a < T.cars.length; a++) for (let b = a + 1; b < T.cars.length; b++) { const A = T.cars[a], B = T.cars[b]; if (Math.abs(A.x - B.x) < 6 && Math.abs(A.z - B.z) < 6 && obbOverlap(A.x, A.z, A.h, A.L / 2 - 0.3, A.W / 2 - 0.2, B.x, B.z, B.h, B.L / 2 - 0.3, B.W / 2 - 0.2)) overlaps++; }
  }
  stuck = T.cars.filter(c => c.still > 30 * 70).length;
  const ok = !nan && overlaps < 12 && moved > 1000 && stuck <= 2 && crossed > 0;
  console.log((ok ? '  ok  ' : ' FAIL ') + ` 车流 @(${px},${pz})：车 ${T.cars.length} 人 ${T.peds.length}，重叠采样 ${overlaps}，久停 ${stuck}，过马路帧 ${crossed}，NaN ${nan}`);
  if (!ok) fail++;
}
if (fail) { console.log('车流自检没过'); process.exit(1); } else console.log('车流自检通过');
