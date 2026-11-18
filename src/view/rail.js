// 铁路道口的样子：铁轨（路面上是水泥板，路外是道砟和枕木）、每个来车方向右边一根柱子（白色叉形牌、两盏轮流闪的红灯、
// 有栏杆的还有红白栏杆）、停止线和地上的 X 标记、前方 80 米左右的黄色圆牌；还有开过去的火车。
// 只给车附近（600 米内）的道口建模型，走远了扔掉。
import * as THREE from 'three';
import { Geo, lin } from './geo.js';
import { toonMat } from './toon.js';
import { drawSign } from './signs.js';
import { trackAt } from '../sim/rail.js';
import { pointAt } from '../sim/map.js';

const NEAR = 600, FAR = 800;
const RAIL = lin('#6b6e72'), TIE = lin('#4a3a2c'), BALLAST = lin('#7d776d'), CONC = lin('#9a9690'), METAL = lin('#8d9096'), BLACK = lin('#1b1c1f'), WHITE = lin('#f2f2ee'), REDW = lin('#c42b25');

function signGeo(cell, w, h) {      // 贴图左半是叉形牌，右半是黄色圆牌
  const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (cell + uv.getX(i)) / 2);
  return g;
}
function trainGeos() {
  const G = {};
  { const g = new Geo(), B = lin('#24384f'), Y = lin('#e0b324'), K = lin('#202124');      // 机车
    g.box(-1.5, 2.5, 0, 17, 2.7, 2.9, 0, B); g.box(7.6, 2.9, 0, 3.6, 3.5, 3.0, 0, B, K); g.box(7.6, 3.6, 0, 3.62, 0.9, 3.02, 0, lin('#2b3440'));
    g.box(0, 1.55, 0, 20.6, 0.3, 3.05, 0, Y); for (const x of [-6.5, 6.5]) g.box(x, 0.65, 0, 4.2, 1.1, 2.6, 0, K); G.loco = g.build(); }
  for (const [k, c] of [['box0', '#7a3b2a'], ['box1', '#3f5a3a'], ['box2', '#5b5f66'], ['box3', '#2f4e74'], ['box4', '#8a6a2a']]) {
    const g = new Geo(), C = lin(c), K = lin('#202124'); g.box(0, 2.5, 0, 15, 2.9, 2.95, 0, C, lin('#77746e')); g.box(0, 2.4, 1.49, 2.6, 2.4, 0.04, 0, K); g.box(0, 2.4, -1.49, 2.6, 2.4, 0.04, 0, K);
    for (const x of [-5.2, 5.2]) g.box(x, 0.6, 0, 2.6, 1.0, 2.5, 0, K); g.box(0, 1.05, 0, 15.3, 0.25, 2.7, 0, K); G[k] = g.build();
  }
  { const g = new Geo(), C = lin('#2c2d31'), K = lin('#202124'); g.tube([-7.2, 2.4, 0], [7.2, 2.4, 0], 1.45, 1.45, 14, C); g.box(0, 1.05, 0, 15.3, 0.3, 2.6, 0, K); for (const x of [-5.2, 5.2]) g.box(x, 0.6, 0, 2.6, 1.0, 2.5, 0, K); G.tank = g.build(); }
  { const g = new Geo(), S = lin('#c9ccd1'), W = lin('#253040'), BL = lin('#2f63b8'), K = lin('#202124');      // 轻轨（两节连在一起）
    g.box(0, 2.1, 0, 26.4, 2.7, 2.65, 0, S, lin('#a6a9ae')); g.box(0, 2.55, 0, 26.0, 0.95, 2.68, 0, W); g.box(0, 1.25, 0, 26.42, 0.32, 2.67, 0, BL);
    for (const s of [-1, 1]) g.box(s * 13.1, 2.45, 0, 0.3, 1.6, 2.2, 0, W); for (const x of [-9, 0, 9]) g.box(x, 0.5, 0, 2.6, 0.8, 2.3, 0, K); g.box(0, 3.55, 0, 6, 0.3, 1.2, 0, lin('#6c7076')); G.lrv = g.build(); }
  return G;
}

export function buildRailView(scene, RL) {
  const solid = toonMat({ vertexColors: true });
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 256; const ctx = cv.getContext('2d');
  drawSign(ctx, 'xbuck', 256); ctx.save(); ctx.translate(256, 0); drawSign(ctx, 'rr', 256); ctx.restore();
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const signMat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide });
  const xbuckGeo = signGeo(0, 1.55, 1.55), rrGeo = signGeo(1, 0.95, 0.95), lampGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.08, 14).rotateX(Math.PI / 2);
  const ON = new THREE.Color(1, 0.12, 0.08), OFF = new THREE.Color(0.18, 0.03, 0.03);
  let TG = null; const built = new Map(), trains = new Map(), P = {}, Q = {};
  const face = (m, fx, fz) => { m.rotation.y = Math.atan2(fx, fz); };      // 平面 / 灯的正面（本地 +z）朝 (fx, fz)

  function build(x) {
    const seg = x.seg, g = new THREE.Group(), G = new Geo(), y = x.y, lamps = [], arms = [];
    // 铁轨：道口前后 45 米。在路面（含人行道）上的部分是水泥板，外面是道砟 + 枕木
    for (const tr of x.tracks) for (let a = tr.at - 45; a <= tr.at + 45; a += 0.65) {
      trackAt(tr, a, P); const ang = Math.atan2(P.dz, P.dx), lat = Math.abs(-(P.x - x.x) * x.dz + (P.z - x.z) * x.dx);
      const onRoad = lat < seg.halfW + 3.2, yb = y + (lat < seg.halfW ? 0.02 : 0.16);
      if (onRoad) G.box(P.x, yb + 0.01, P.z, 0.66, 0.04, 2.8, ang, CONC);
      else { G.box(P.x, y + 0.05, P.z, 0.66, 0.1, 3.4, ang, BALLAST); G.box(P.x, y + 0.13, P.z, 0.24, 0.08, 2.5, ang, TIE); }
      for (const s of [-0.72, 0.72]) G.box(P.x - P.dz * s, (onRoad ? yb + 0.04 : y + 0.22), P.z + P.dx * s, 0.66, onRoad ? 0.05 : 0.12, 0.08, ang, RAIL);
    }
    // 每个有车开过来的方向：右边一根柱子、停止线、地上的 X、远一点的黄色圆牌
    for (const side of [1, -1]) {
      const n = side > 0 ? seg.lf : seg.lb; if (!n) continue;
      const ax = x.dx * side, az = x.dz * side, rx = -az, rz = ax, other = side > 0 ? seg.lb : seg.lf;
      const lo = other ? side * seg.cOff + 0.15 : -seg.halfW + 0.3, hi = seg.halfW - 0.3, mid = (lo + hi) / 2;      // 这个方向的车道从哪到哪（右手方向量）
      const back = x.span + 4.6, sx = x.x - ax * back, sz = x.z - az * back, rot = Math.atan2(rz, rx);
      G.box(sx + rx * mid, y + 0.03, sz + rz * mid, hi - lo, 0.02, 0.45, rot, WHITE);      // 停止线：离最近的铁轨 15 英尺
      if (x.s - side * (x.span + 22) > seg.trimA + 3 && x.s - side * (x.span + 22) < seg.len - seg.trimB - 3) {
        const qx = x.x - ax * (x.span + 20) + rx * mid, qz = x.z - az * (x.span + 20) + rz * mid, ha = Math.atan2(az, ax);
        for (const d of [-0.42, 0.42]) G.box(qx, y + 0.03, qz, 6.5, 0.02, 0.38, ha + d, WHITE);      // 地上的大 X
      }
      const px = x.x - ax * (x.span + 3.2) + rx * (seg.halfW + 0.8), pz = x.z - az * (x.span + 3.2) + rz * (seg.halfW + 0.8);
      G.cyl(px, y, y + 4.2, pz, 0.09, 0.08, 8, METAL, true);
      G.box(px - ax * 0.1, y + 2.75, pz - az * 0.1, 1.5, 0.12, 0.12, rot, BLACK);
      const xb = new THREE.Mesh(xbuckGeo, signMat); xb.position.set(px - ax * 0.12, y + 3.75, pz - az * 0.12); face(xb, -ax, -az); g.add(xb);
      for (const k of [-1, 1]) {
        const bx = px - ax * 0.18 + rx * k * 0.58, bz = pz - az * 0.18 + rz * k * 0.58;
        G.cyl(bx, y + 2.45, y + 3.05, bz, 0.3, 0.3, 12, BLACK);      // 灯后面的黑圆板
        const m = new THREE.Mesh(lampGeo, new THREE.MeshBasicMaterial({ color: OFF })); m.position.set(bx - ax * 0.32, y + 2.75, bz - az * 0.32); face(m, -ax, -az); g.add(m); lamps.push({ m, k });
      }
      if (x.gates) {      // 栏杆：从柱子往路中间伸，竖着抬起、放平挡住这个方向的车道
        const len = Math.max(2.5, Math.min(10, hi - lo + 0.6)), A = new Geo();
        for (let u = 0, i = 0; u < len; u += 0.6, i++) A.box(u + 0.3, 0, 0, 0.6, 0.11, 0.11, 0, i % 2 ? REDW : WHITE);
        A.box(-0.5, 0, 0, 0.9, 0.3, 0.3, 0, BLACK);
        const pivot = new THREE.Group(), tilt = new THREE.Group(), arm = new THREE.Mesh(A.build(), solid);
        pivot.position.set(px - rx * 0.35 - ax * 0.4, y + 1.05, pz - rz * 0.35 - az * 0.4); pivot.rotation.y = -Math.atan2(-rz, -rx);
        tilt.add(arm); pivot.add(tilt); g.add(pivot); arms.push(tilt);
      }
      // 黄色圆牌：道口前 80 米（路段不够长就放在能放的最远处，至少 25 米）
      const dAdv = Math.min(80, side > 0 ? x.s - seg.trimA - 8 : seg.len - seg.trimB - 8 - x.s);
      if (dAdv > 25) {
        pointAt(seg, x.s - side * dAdv, Q); const bx = Q.dx * side, bz = Q.dz * side, qx = Q.x - bz * (seg.halfW + 0.8), qz = Q.z + bx * (seg.halfW + 0.8);
        G.cyl(qx, y, y + 2.7, qz, 0.045, 0.04, 7, METAL);
        const s = new THREE.Mesh(rrGeo, signMat); s.position.set(qx - bx * 0.06, y + 2.45, qz - bz * 0.06); face(s, -bx, -bz); g.add(s);
      }
    }
    const mesh = new THREE.Mesh(G.build(), solid); mesh.receiveShadow = true; g.add(mesh);
    scene.add(g); g.updateMatrixWorld(true);
    return { g, lamps, arms, gate: -1 };
  }
  function drop(o) { o.g.traverse(m => { if (m.geometry && m.geometry !== xbuckGeo && m.geometry !== rrGeo && m.geometry !== lampGeo) m.geometry.dispose(); }); scene.remove(o.g); }

  function trainMesh(T) {
    TG ||= trainGeos(); const g = new THREE.Group(), ms = [];
    for (const c of T.cars) { const m = new THREE.Mesh(c.kind === 'box' ? TG['box' + (c.col || 0)] : TG[c.kind], solid); m.castShadow = true; g.add(m); ms.push(m); }
    scene.add(g); return { g, ms };
  }

  return {
    /** 每帧：车附近的道口建 / 扔模型，闪灯、栏杆、火车摆位置。返回给声音用的东西 */
    update(t, cx, cz) {
      let bell = 1e9; const horns = [];
      for (const x of RL.X) {
        const d = Math.hypot(x.x - cx, x.z - cz); let o = built.get(x.id);
        if (!o && d < NEAR) { o = build(x); built.set(x.id, o); }
        else if (o && d > FAR) { drop(o); built.delete(x.id); o = null; }
        if (x.on) bell = Math.min(bell, d);
        if (o) {
          const ph = (t * 0.95) % 1;      // 两盏灯轮流亮，每盏一秒不到一次
          for (const L of o.lamps) L.m.material.color.copy(x.on && (L.k > 0) === (ph < 0.5) ? ON : OFF);
          if (o.gate !== x.gate) { o.gate = x.gate; for (const a of o.arms) { a.rotation.z = (1 - x.gate) * 1.45; a.updateMatrixWorld(true); } }
        }
        // 火车
        const T = x.train; let tm = trains.get(x.id);
        if (T && !tm && d < FAR + 300) { tm = trainMesh(T); trains.set(x.id, tm); }
        if (tm && (!T || d > FAR + 400)) { scene.remove(tm.g); trains.delete(x.id); tm = null; }
        if (tm) {
          const tr = x.tracks[0]; let off = 0;
          T.cars.forEach((c, i) => {
            const a0 = T.head - T.dir * off, a1 = T.head - T.dir * (off + c.len); off += c.len + 1;
            trackAt(tr, a0, P); const fx = P.x, fz = P.z; trackAt(tr, a1, Q);
            const m = tm.ms[i]; m.position.set((fx + Q.x) / 2, x.y + 0.25, (fz + Q.z) / 2); m.rotation.y = -Math.atan2(fz - Q.z, fx - Q.x);
          });
          tm.g.updateMatrixWorld(true);
          // 鸣笛：长、长、短、长（到道口前十几秒开始）
          const toArr = ((tr.at - T.head) * T.dir) / T.v; trackAt(tr, T.head, P);
          T.hk ||= 0; const HK = [14, 11.5, 9.6, 8.6];
          if (T.hk < HK.length && toArr < HK[T.hk]) { horns.push({ d: Math.hypot(P.x - cx, P.z - cz), long: T.hk !== 2 }); T.hk++; }
        }
      }
      return { bell, horns };
    },
  };
}
