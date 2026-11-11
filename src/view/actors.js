// 会动的车和行人：各用一个实例化网格，每帧按模拟结果摆位置。
import * as THREE from 'three';
import { carModel, pedModel } from './models.js';
import { toonMat } from './toon.js';
import { CAR_COLORS } from './world.js';

const SHIRTS = ['#c2463b', '#2f6a86', '#e3dccb', '#cf9a3a', '#3d8f8a', '#5b5f6b', '#8a4a7a', '#7fa35a'];

export function buildActors(scene, max = 48) {
  const paint = toonMat({ vertexColors: true, spec: 1, rim: 0.5, smooth: true, paint: true, glass: 0.5 });
  const mk = (geo, mat) => { const m = new THREE.InstancedMesh(geo, mat, max); m.count = 0; m.frustumCulled = false; m.castShadow = m.receiveShadow = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(m); return m; };
  const sedan = mk(carModel('sedan'), paint), suv = mk(carModel('suv'), paint), ped = mk(pedModel(), toonMat({ vertexColors: true, paint: 'tint', smooth: true }));
  const cols = CAR_COLORS.map(c => new THREE.Color(c)), shirts = SHIRTS.map(c => new THREE.Color(c));
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Q2 = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0), FW = new THREE.Vector3(0, 0, 1);
  return {
    update(T) {
      let a = 0, b = 0, k = 0;
      for (const c of T.cars) {
        const m = c.suv ? suv : sedan, i = c.suv ? b++ : a++; if (i >= max) continue;
        Q.setFromAxisAngle(UP, -c.h); M.compose(V.set(c.x, 0, c.z), Q, S); m.setMatrixAt(i, M); m.setColorAt(i, cols[c.col % cols.length]);
      }
      for (const p of T.peds) {
        if (k >= max) break;
        // 走路：身体一步一颠、左右轻轻晃；站着等的时候不动
        Q.setFromAxisAngle(UP, -p.h); Q2.setFromAxisAngle(FW, Math.sin(p.ph) * 0.05); Q.multiply(Q2);
        M.compose(V.set(p.x, (p.onRoad ? 0 : 0.15) + Math.abs(Math.sin(p.ph)) * 0.035, p.z), Q, S); ped.setMatrixAt(k, M); ped.setColorAt(k, shirts[p.col % shirts.length]); k++;
      }
      for (const [m, n] of [[sedan, a], [suv, b], [ped, k]]) { m.count = Math.min(n, max); m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    },
  };
}
