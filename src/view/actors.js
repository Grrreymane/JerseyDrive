// 会动的车和行人：实例化网格，每帧按模拟结果摆位置。行人的腿和胳膊是单独的实例，走路时前后摆。
import * as THREE from 'three';
import { carModel, pedParts } from './models.js';
import { toonMat } from './toon.js';
import { CAR_COLORS } from './world.js';

const SHIRTS = ['#c2463b', '#2f6a86', '#e3dccb', '#cf9a3a', '#3d8f8a', '#5b5f6b', '#8a4a7a', '#7fa35a'];

export function buildActors(scene, max = 48) {
  const paint = toonMat({ vertexColors: true, spec: 1, rim: 0.5, smooth: true, paint: true, glass: 0.5 }), cloth = toonMat({ vertexColors: true, paint: 'tint', smooth: true });
  const mk = (geo, mat, n = max) => { const m = new THREE.InstancedMesh(geo, mat, n); m.count = 0; m.frustumCulled = false; m.castShadow = m.receiveShadow = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); return m; };
  const PP = pedParts(), sedan = mk(carModel('sedan'), paint), suv = mk(carModel('suv'), paint), body = mk(PP.body, cloth), leg = mk(PP.leg, cloth, max * 2), arm = mk(PP.arm, cloth, max * 2);
  const cols = CAR_COLORS.map(c => new THREE.Color(c)), shirts = SHIRTS.map(c => new THREE.Color(c)), WHITE = new THREE.Color(1, 1, 1);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), QL = new THREE.Quaternion(), V = new THREE.Vector3(), O = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0), FW = new THREE.Vector3(1, 0, 0), SIDE = new THREE.Vector3(0, 0, 1);
  return {
    update(T, t) {
      let a = 0, b = 0, k = 0;
      for (const c of T.cars) {
        const m = c.suv ? suv : sedan, i = c.suv ? b++ : a++; if (i >= max) continue;
        Q.setFromAxisAngle(UP, -c.h); M.compose(V.set(c.x, c.y || 0, c.z), Q, S); m.setMatrixAt(i, M);
        // 被撞停住的车打双闪：车身颜色一明一暗
        m.setColorAt(i, c.hitT > 0 && (t * 2.6) % 1 < 0.5 ? WHITE.copy(cols[c.col % cols.length]).multiplyScalar(1.6) : cols[c.col % cols.length]);
      }
      for (const p of T.peds) {
        if (k >= max) break;
        const base = p.onRoad ? 0 : 0.15, col = shirts[p.col % shirts.length];
        if (p.mode === 'down') {      // 被撞倒：0.35 秒内向后倒下，躺在地上
          const f = Math.min(1, p.downT / 0.35), ang = f * f * 1.5;
          Q.setFromAxisAngle(UP, -p.h); Q2.setFromAxisAngle(SIDE, ang); Q.multiply(Q2);
          M.compose(V.set(p.x, 0.12 * f, p.z), Q, S); body.setMatrixAt(k, M); body.setColorAt(k, col);
          for (const s of [-1, 1]) {
            O.set(0, PP.hip[0], PP.hip[1] * s).applyQuaternion(Q).add(V); M.compose(O, Q, S); leg.setMatrixAt(k * 2 + (s > 0 ? 1 : 0), M); leg.setColorAt(k * 2 + (s > 0 ? 1 : 0), col);
            O.set(0, PP.shoulder[0], PP.shoulder[1] * s).applyQuaternion(Q).add(V); QL.setFromAxisAngle(SIDE, -1.2 * f * s).premultiply(Q); M.compose(O, QL, S); arm.setMatrixAt(k * 2 + (s > 0 ? 1 : 0), M); arm.setColorAt(k * 2 + (s > 0 ? 1 : 0), col);
          }
          k++; continue;
        }
        // 走路：左右腿一前一后摆，胳膊和同侧的腿反着摆，身体每步轻轻起伏；站着等的时候都垂着
        const sw = p.moving ? Math.sin(p.ph) : 0, bob = p.moving ? Math.abs(Math.cos(p.ph)) * 0.03 : 0;
        Q.setFromAxisAngle(UP, -p.h); V.set(p.x, base + bob, p.z);
        M.compose(V, Q, S); body.setMatrixAt(k, M); body.setColorAt(k, col);
        for (const s of [-1, 1]) {
          const i = k * 2 + (s > 0 ? 1 : 0);
          O.set(0, PP.hip[0], PP.hip[1] * s).applyQuaternion(Q).add(V); QL.setFromAxisAngle(SIDE, sw * 0.5 * s).premultiply(Q); M.compose(O, QL, S); leg.setMatrixAt(i, M); leg.setColorAt(i, col);
          O.set(0, PP.shoulder[0], PP.shoulder[1] * s).applyQuaternion(Q).add(V); QL.setFromAxisAngle(SIDE, -sw * 0.4 * s).premultiply(Q); M.compose(O, QL, S); arm.setMatrixAt(i, M); arm.setColorAt(i, col);
        }
        k++;
      }
      for (const [m, n] of [[sedan, a], [suv, b], [body, k], [leg, k * 2], [arm, k * 2]]) { m.count = Math.min(n, m.instanceMatrix.count); m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    },
  };
}
