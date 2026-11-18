// 别的车会不会撞玩家：放一辆“假玩家”（照规矩开；有路权就直接走、偶尔急刹、偶尔变道），别的车只能通过“玩家”那套逻辑看见它（isPlayer），
// 统计别的车撞上它的次数，按场景分类。用法：node tools/test_hits.mjs [map_all.json] [分钟]
import { readFileSync } from 'node:fs';
import { prepareMap, obbOverlap } from '../src/sim/map.js';
import { makeTraffic, stepTraffic, sAbsOf, planTurn } from '../src/sim/traffic.js';
const FILE = process.argv[2] || 'map.json', MIN = +(process.argv[3] || 6);
const map = prepareMap(JSON.parse(readFileSync(new URL('../data/' + FILE, import.meta.url))));
const kinds = {}; let total = 0, lanes = 0, brakes = 0, seconds = 0, dist = 0, near = 0, juncs = 0;
function newGhost(T, x, z) {
  for (let k = 0; k < 400; k++) {
    const seg = map.locate(x + (T.rnd() - 0.5) * 400, z + (T.rnd() - 0.5) * 400, {}).seg; if (!seg || seg.useLen < 60) continue;
    const fwd = seg.lb === 0 || T.rnd() < 0.5, n = fwd ? seg.lf : seg.lb; if (!n) continue;
    const g = { id: -1, isPlayer: true, bold: true, kind: 'car', mode: 'seg', seg, fwd, idx: Math.floor(T.rnd() * n), u: 10, v: 5, L: 4.6, W: 1.9, col: 0, tr: 0, wait: 0, stopT: -1, x: 0, z: 0, h: 0, plan: null, w: 0 }; planTurn(T, g); return g;
  }
}
let carV = 0, carN = 0;
for (const [px, pz] of [[0, 0], [300, -200], [-350, 250], [1500, -800], [-2000, 1200], [800, 2500], [-600, -1500], [2500, 300], [-1200, 3500], [400, 6000]]) {
  const T = makeTraffic(map, 99 + px); let g = newGhost(T, px, pz); if (!g) continue;
  T.cars.push(g); for (let i = 0; i < 60; i++) stepTraffic(T, { x: g.x, z: g.z, h: g.h, v: g.v, y: g.y, cur: null, stopT: -1 }, i / 30, 1 / 30);
  let brakeT = 0, hitCool = new Map(), lc = null;
  for (let i = 0; i < MIN * 60 * 30; i++) {
    const t = 2 + i / 30, dt = 1 / 30;
    if (g.dead || !T.cars.includes(g)) { g = newGhost(T, g.x, g.z); T.cars.push(g); }
    // 偶尔急刹 2–4 秒（真人会这么开：看到黄灯、看错路、找路）
    if (brakeT <= 0 && g.mode === 'seg' && g.v > 6 && T.rnd() < dt / 25) { brakeT = 2 + T.rnd() * 2; brakes++; }
    if (brakeT > 0) { brakeT -= dt; g.v = Math.max(0, g.v - 9 * dt); }
    // 偶尔变道：目标道前后有空当才变，3 秒挪过去（车头跟着斜一点）
    if (lc && (g.mode !== 'seg' || g.seg !== lc.seg)) { lc = null; g.off = 0; }
    const nL = g.mode === 'seg' ? (g.fwd ? g.seg.lf : g.seg.lb) : 0;
    if (!lc && g.mode === 'seg' && nL >= 2 && g.v > 4 && g.seg.useLen - g.u > 60 && T.rnd() < dt / 15) {
      const dir = g.idx === 0 ? 1 : g.idx === nL - 1 ? -1 : (T.rnd() < 0.5 ? 1 : -1), ti = g.idx + dir;
      const free = !T.cars.some(o => o !== g && o.mode === 'seg' && o.seg === g.seg && o.fwd === g.fwd && o.idx === ti && Math.abs(o.u - g.u) < (o.u < g.u ? 15 : 10));
      if (free) { lc = { seg: g.seg, dir, k: 0 }; lanes++; }
    }
    if (lc) { lc.k += dt / 3; g.off = lc.dir * 3.3 * Math.min(1, lc.k); if (lc.k >= 1) { g.idx += lc.dir; g.off = 0; lc = null; } }
    const cur = g.mode === 'seg' ? { seg: g.seg, fwd: g.fwd, s: sAbsOf(g), junc: null } : { seg: g.plan.seg, fwd: g.plan.fwd, s: g.plan.fwd ? g.plan.seg.trimA : g.plan.seg.len - g.plan.seg.trimB, junc: g.plan.j };
    const wasJ = g.mode, off0 = g.off || 0; stepTraffic(T, { x: g.x, z: g.z, h: g.h, v: g.v, y: g.y, cur, stopT: g.stopT }, t, dt);
    if (lc) { g.off = off0; g.h += Math.atan2(lc.dir * 3.3 / 3, Math.max(g.v, 2)); } seconds += dt; dist += g.v * dt; if (wasJ === 'seg' && g.mode === 'junc') juncs++;
    if (i % 3 === 0) for (const o of T.cars) if (o !== g && Math.hypot(o.x - g.x, o.z - g.z) < 9) near++;
    if (i % 3) continue;
    for (const o of T.cars) if (o !== g && o.mode === 'seg' && !o.parked) { carV += o.v / (o.seg.speed / 2.237); carN++; }
    for (const o of T.cars) {
      if (o === g || Math.abs(o.x - g.x) > 8 || Math.abs(o.z - g.z) > 8 || Math.abs((o.y || 0) - (g.y || 0)) > 2.5) continue;
      if (!obbOverlap(g.x, g.z, g.h, g.L / 2 - 0.1, g.W / 2 - 0.1, o.x, o.z, o.h, o.L / 2 - 0.1, o.W / 2 - 0.1)) continue;
      if ((hitCool.get(o.id) || -99) > t - 8) continue; hitCool.set(o.id, t);
      // 谁撞谁：o 的车头朝着 g、o 在动
      const hx = Math.cos(o.h), hz = Math.sin(o.h), ahead = (g.x - o.x) * hx + (g.z - o.z) * hz;
      if (o.v < 0.5 && ahead <= 0) continue;
      const same = Math.cos(o.h - g.h), where = o.mode === 'junc' || g.mode === 'junc' ? '路口' : '路段';
      const how = same > 0.7 ? '追尾' : same < -0.7 ? '对头' : '侧面';
      const key = `${where}·${how}·${o.kind}${o.mode === 'junc' ? '(' + o.plan.type + ')' : ''}${o.parked || o.pulling ? '·开出来' : ''}${o.off ? '·偏移' : ''}`;
      kinds[key] = (kinds[key] || 0) + 1; total++;
      if (process.env.V) console.log(key, 'gv', g.v.toFixed(1), 'ov', o.v.toFixed(1), g.mode, g.mode === 'junc' ? g.plan.j.control + '/' + g.plan.type : g.seg.cls, '@', g.x.toFixed(0), g.z.toFixed(0));
    }
  }
}
console.log(`别的车平均开到限速的 ${(carV / carN * 100).toFixed(0)}%`);
console.log(`路程 ${(dist / 1000).toFixed(1)} km，过路口 ${juncs} 个，身边 9 米内有车 ${near} 帧`);
console.log(`假玩家开了 ${(seconds / 60).toFixed(0)} 分钟，急刹 ${brakes} 次，变道 ${lanes} 次，被别的车撞 ${total} 次（每小时 ${(total / seconds * 3600).toFixed(1)} 次）`);
for (const [k, n] of Object.entries(kinds).sort((a, b) => b[1] - a[1])) console.log('  ' + n + '  ' + k);
