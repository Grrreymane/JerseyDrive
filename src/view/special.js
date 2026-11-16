// 特殊的车：校车（黄色，停下时红灯闪、左边伸出 STOP 牌）、救护车 / 警车（顶上红蓝灯闪），
// 还有路边要开出来的车打的左转灯。数量很少（各一两辆），每辆一个 Group，按模拟结果摆位置。
import * as THREE from 'three';
import { Geo, lin } from './geo.js';
import { toonMat } from './toon.js';
import { carModel } from './models.js';

function busModel() {
  const G = new Geo(), Y = lin('#f2b318'), K = lin('#1d1f24'), WIN = lin('#2b3440'), GR = lin('#3a3d44'), W = 2.45, L = 11.4;
  G.box(-0.7, 1.75, 0, L - 1.6, 2.5, W, 0, Y, lin('#f4f1e8'));      // 车厢（顶是白的）
  G.box(L / 2 - 1.15, 1.05, 0, 1.7, 1.25, W - 0.25, 0, Y);           // 前面的发动机舱
  for (const y of [1.25, 1.62]) G.box(-0.7, y, 0, L - 1.58, 0.07, W + 0.02, 0, K);      // 车身上的两道黑条
  G.box(-0.7, 2.28, 0, L - 2.2, 0.62, W + 0.03, 0, WIN);            // 一排窗户
  G.box(L / 2 - 1.62, 2.2, 0, 0.06, 0.9, W - 0.3, 0, WIN);          // 前挡风玻璃
  G.box(L / 2 - 0.27, 0.75, 0, 0.12, 0.35, W - 0.1, 0, K);          // 保险杠
  G.box(-L / 2 + 0.05, 0.62, 0, 0.12, 0.3, W, 0, K);
  for (const x of [L / 2 - 1.3, -L / 2 + 2.2]) for (const z of [-1, 1]) G.box(x, 0.5, z * (W / 2 - 0.12), 1.0, 1.0, 0.36, 0, GR);      // 轮子
  return G.build(true);
}
function ambModel() {
  const G = new Geo(), WH = lin('#f3f2ee'), RED = lin('#c8302b'), WIN = lin('#2b3440'), GR = lin('#3a3d44');
  G.box(1.9, 1.05, 0, 2.2, 1.5, 2.1, 0, WH); G.box(2.55, 1.55, 0, 0.9, 0.6, 2.12, 0, WIN);      // 驾驶室 + 前窗
  G.box(-1.0, 1.55, 0, 4.0, 2.5, 2.25, 0, WH);                                              // 后面的厢
  G.box(-1.0, 1.15, 0, 4.02, 0.28, 2.27, 0, RED); G.box(1.9, 0.75, 0, 2.22, 0.18, 2.12, 0, RED);      // 红条
  for (const x of [2.0, -2.0]) for (const z of [-1, 1]) G.box(x, 0.4, z * 0.95, 0.8, 0.8, 0.3, 0, GR);
  return G.build(true);
}

export function buildSpecial(scene) {
  const solid = toonMat({ vertexColors: true }), geos = { bus: busModel(), amb: ambModel(), police: carModel('sedan', [0.06, 0.07, 0.09]) };
  const lampGeo = new THREE.BoxGeometry(0.22, 0.22, 0.22), barGeo = new THREE.BoxGeometry(0.35, 0.18, 0.78), armGeo = new THREE.CircleGeometry(0.42, 8);
  const RED = new THREE.Color(1, 0.1, 0.08), DIMR = new THREE.Color(0.25, 0.03, 0.03), BLUE = new THREE.Color(0.15, 0.35, 1), DIMB = new THREE.Color(0.03, 0.06, 0.2), AMB = new THREE.Color(1, 0.62, 0.08), DIMA = new THREE.Color(0.25, 0.16, 0.03), WHITE = new THREE.Color(1, 1, 1);
  const pool = new Map();
  const lamp = (g, x, y, z, geo = lampGeo) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0x220000 })); m.position.set(x, y, z); g.add(m); return m; };
  const make = (c) => {
    const g = new THREE.Group(), o = { g, lamps: [], arm: null };
    if (c.kind === 'bus') {
      g.add(Object.assign(new THREE.Mesh(geos.bus, solid), { castShadow: true }));
      for (const x of [4.05, -5.5]) for (const z of [-0.7, 0.7]) o.lamps.push({ m: lamp(g, x, 2.9, z), on: RED, off: DIMR, ph: z > 0 ? 0 : 0.5 });      // 前后各两个红灯，左右交替闪
      const arm = new THREE.Mesh(armGeo, new THREE.MeshBasicMaterial({ color: 0xc1121f, side: THREE.DoubleSide })); arm.position.set(3.3, 1.7, -1.62); arm.rotation.set(0, Math.PI, Math.PI / 8); o.arm = arm; g.add(arm);      // 左边（-z）伸出来的 STOP 牌：红色八角形
    } else if (c.kind === 'ems') {
      g.add(Object.assign(new THREE.Mesh(c.sub === 'amb' ? geos.amb : geos.police, solid), { castShadow: true }));
      const y = c.sub === 'amb' ? 2.92 : 1.62, x = c.sub === 'amb' ? 1.9 : -0.1;
      o.lamps.push({ m: lamp(g, x, y, -0.4, barGeo), on: RED, off: DIMR, ph: 0 }); o.lamps.push({ m: lamp(g, x, y, 0.4, barGeo), on: c.sub === 'amb' ? WHITE : BLUE, off: c.sub === 'amb' ? DIMR : DIMB, ph: 0.5 });
      if (c.sub === 'amb') for (const z of [-0.9, 0.9]) o.lamps.push({ m: lamp(g, -3.05, 2.6, z), on: RED, off: DIMR, ph: z > 0 ? 0.5 : 0 });
    } else {      // 路边要开出来的车：只画左边的转向灯（车本身由 actors 画）
      for (const x of [2.25, -2.3]) o.lamps.push({ m: lamp(g, x, 0.75, -0.85), on: AMB, off: DIMA, ph: 0, slow: true });
    }
    g.traverse(q => { q.layers.set(0); }); scene.add(g); pool.set(c.id, o); return o;
  };
  return {
    update(T, t) {
      const seen = new Set();
      for (const c of T.cars) {
        const want = c.kind === 'bus' || c.kind === 'ems' || c.parked || c.pulling; if (!want) continue;
        seen.add(c.id); const o = pool.get(c.id) || make(c);
        o.g.position.set(c.x, c.y || 0, c.z); o.g.rotation.y = -c.h;
        o.g.updateMatrixWorld(true);      // 场景关了自动刷新矩阵（见 main.js），会动的东西要自己刷
        const flashing = c.kind === 'bus' ? c.flash > 0 : c.kind === 'ems' ? true : c.sig;
        for (const L of o.lamps) { const ph = ((t * (L.slow ? 1.3 : 2.6)) + L.ph) % 1; L.m.material.color.copy(flashing && ph < 0.5 ? L.on : L.off); }
        if (o.arm) o.arm.visible = c.flash > 0;
      }
      for (const [id, o] of pool) if (!seen.has(id)) { scene.remove(o.g); pool.delete(id); }
    },
    /** 离车最近的鸣笛车的距离（给警笛声音用） */
    sirenDist(T, x, z) { let d = 1e9; for (const c of T.cars) if (c.kind === 'ems') d = Math.min(d, Math.hypot(c.x - x, c.z - z)); return d; },
  };
}
