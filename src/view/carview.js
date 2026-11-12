// 自己的车：驾驶舱（仪表台、会动的仪表、方向盘、A 柱、三个后视镜）、车外模型、三种镜头。
// 车的本地坐标：原点 = 后轴中点，+x 车头，+y 上，+z 右。
import * as THREE from 'three';
import { Geo } from './geo.js';
import { carModel } from './models.js';
import { toonMat } from './toon.js';
import { CAR } from '../sim/map.js';
import { MPH } from '../sim/car.js';

const EYE = { x: 1.12, y: 1.2, z: -0.38 };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
// 朝向驾驶员、往后仰 tilt 弧度的平面的朝向：本地 x = 车右，y = 面的上方，z = 指向驾驶员
const facing = (tilt) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(V(0, 0, 1), V(Math.sin(tilt), Math.cos(tilt), 0), V(-Math.cos(tilt), Math.sin(tilt), 0)));

export function buildCarView(scene, renderer, navCanvas) {
  const view0 = {};
  const root = new THREE.Group(); scene.add(root);
  const BODY = [0.16, 0.42, 0.85], DASH_TOP = [0.04, 0.043, 0.052], DASH = [0.21, 0.23, 0.28], DASH_LOW = [0.5, 0.47, 0.42], TRIM = [0.09, 0.1, 0.13], SEAT = [0.36, 0.32, 0.28], LINER = [0.66, 0.64, 0.6], CHROME = [0.7, 0.72, 0.76], BLACK = [0.03, 0.03, 0.04];
  const L1 = (o) => { o.layers.set(1); o.frustumCulled = false; root.add(o); return o; };

  // 车外模型（只在车外镜头里显示）
  const ext = new THREE.Mesh(carModel('sedan', BODY), toonMat({ vertexColors: true, spec: 1, rim: 0.5, smooth: true, glass: 0.5 })), WHITE = [1, 1, 1];
  ext.position.x = CAR.center; ext.scale.set(CAR.L / 4.56, 1, CAR.W / 1.83); ext.layers.set(2); ext.castShadow = true; root.add(ext);

  // ---------- 车漆件：引擎盖 ----------
  const GP = new Geo();
  {
    const xs = [2.4, 2.6, 2.9, 3.2, 3.45, 3.62, 3.72, 3.77], K = 15, rows = xs.map((x, i) => {
      const t = (x - 2.4) / 1.32, base = 0.99 - 0.1 * t * t - (i === xs.length - 1 ? 0.22 : i === xs.length - 2 ? 0.07 : 0), row = [];
      for (let k = 0; k < K; k++) {
        const z = -0.9 + 1.8 * k / (K - 1), a = Math.abs(z), edge = Math.max(0, (a - 0.74) / 0.16);
        row.push([x - 0.05 * a * a * t, base + 0.035 * (1 - (z / 0.92) ** 2) + 0.012 * Math.exp(-((z / 0.22) ** 2)) - 0.1 * edge * edge, z * (1 - 0.06 * t * t)]);
      }
      return row;
    });
    GP.loft(rows, { orient: (p, i) => [i >= xs.length - 2 ? 1 : 0, 1, p[2] * 0.3], color: () => WHITE });
  }
  const hoodPaint = toonMat({ vertexColors: true, spec: 0.35, smooth: true, glass: 0.3, color: new THREE.Color().setRGB(...BODY) });      // 车漆颜色放在材质上，换颜色不用重建      // 引擎盖是贴着看的，高光太强会发白
  L1(new THREE.Mesh(GP.build(), hoodPaint));

  // ---------- 内饰 ----------
  // GS：连续曲面（仪表台、门板、柱子、座椅），不描内部折线；GH：有明确折边的硬件（出风口、面板、饰条）
  const GS = new Geo(), GH = new Geo();
  const ALU = [0.2, 0.21, 0.235], TAN = [0.5, 0.38, 0.27], TAN_D = [0.36, 0.27, 0.2], FACE = [0.075, 0.08, 0.095], GLOSS = [0.05, 0.055, 0.07];
  const lerp = (a, b, t) => a + (b - a) * t, sstep = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
  const hoodW = (z) => 1 - sstep((Math.abs(z - EYE.z) - 0.2) / 0.1);      // 仪表罩的范围：方向盘正前方 ±0.2 米，往两边 0.1 米过渡
  const wrapX = (z) => 0.08 * Math.abs(z / 0.94) ** 3;                    // 仪表台两头往车门方向包过来
  {
    // 仪表台：两条设计截面（普通处 / 仪表罩处），沿车宽逐点过渡成一张连续曲面。
    // 截面从前挡玻璃根部往后：台面 → 前沿 → 立面 → 膝部。仪表罩那条多了挑檐、檐下、往里凹的表盘面和下沿。
    const PB = [[2.52, 0.985], [2.4, 1.005], [2.25, 1.02], [2.1, 1.025], [2.0, 1.02], [1.93, 1.005], [1.895, 0.985], [1.885, 0.96], [1.89, 0.93], [1.9, 0.89], [1.905, 0.85], [1.9, 0.8], [1.89, 0.74], [1.9, 0.66], [1.95, 0.55], [2.05, 0.42]];
    const PH = [[2.52, 0.985], [2.4, 1.005], [2.25, 1.02], [2.1, 1.04], [1.98, 1.046], [1.9, 1.043], [1.868, 1.034], [1.85, 1.018], [1.862, 1.004], [1.95, 0.992], [2.047, 0.978], [2.01, 0.858], [1.93, 0.835], [1.885, 0.79], [1.93, 0.6], [2.05, 0.42]];
    const zs = new Set(); for (let i = 0; i <= 26; i++) zs.add(+(-0.94 + 1.88 * i / 26).toFixed(4));
    for (const s of [-1, 1]) for (let d = 0.18; d <= 0.321; d += 0.02) zs.add(+(EYE.z + s * d).toFixed(4));
    const Z = [...zs].sort((a, b) => a - b), rows = Z.map((z) => { const w = hoodW(z), wr = wrapX(z); return PB.map((p, k) => [lerp(p[0], PH[k][0], w) - wr * Math.min(1, k / 3), lerp(p[1], PH[k][1], w), z]); });
    GS.loft(rows, {
      orient: (p, i, k) => k < 6 ? [-0.2, 1, 0] : k >= 8 && k <= 9 && hoodW(Z[i]) > 0.5 ? [0, -1, 0] : [-1, 0.25, 0],
      color: (i, k) => {
        const z = (Z[i] + Z[i + 1]) / 2, hood = hoodW(z) > 0.5;
        if (k <= 5) return DASH_TOP;
        if (hood) return k <= 7 ? DASH_TOP : k <= 10 ? BLACK : k <= 12 ? DASH_TOP : FACE;
        return k <= 9 ? FACE : k === 10 ? ALU : k <= 12 ? FACE : TAN_D;      // 立面中间一条金属饰条，下半截是棕色
      },
    });
    const faceX = (z) => 1.9 - wrapX(z), NX = [[-1, 0, 0], [-1, 0, 0], [-1, 0, 0], [-1, 0, 0]];
    // 出风口：凸出一点的边框 + 退进去的黑底 + 三片导风叶 + 中间的拨钮
    const vent = (zc, w) => {
      const xf = faceX(zc), y0 = 0.872, y1 = 0.94, z0 = zc - w / 2, z1 = zc + w / 2, x0 = xf - 0.01;
      GH.aabb(x0, y0, z0, xf + 0.01, y0 + 0.008, z1, ALU); GH.aabb(x0, y1 - 0.008, z0, xf + 0.01, y1, z1, ALU); GH.aabb(x0, y0, z0, xf + 0.01, y1, z0 + 0.008, ALU); GH.aabb(x0, y0, z1 - 0.008, xf + 0.01, y1, z1, ALU);
      GH.quadN([[xf - 0.001, y0, z0], [xf - 0.001, y0, z1], [xf - 0.001, y1, z1], [xf - 0.001, y1, z0]], NX, BLACK);
      for (let k = 1; k <= 3; k++) GH.aabb(x0 + 0.002, y0 + (y1 - y0) * k / 4 - 0.002, z0 + 0.008, xf, y0 + (y1 - y0) * k / 4 + 0.003, z1 - 0.008, FACE);
      GH.aabb(x0 - 0.003, y0 + 0.02, zc - 0.006, x0 + 0.004, y1 - 0.02, zc + 0.006, ALU);
    };
    vent(-0.8, 0.15); vent(0.03, 0.15); vent(0.25, 0.15); vent(0.8, 0.15);
    // 空调面板：一块亮黑面板 + 三个旋钮 + 一排按键
    GH.aabb(1.876, 0.735, -0.07, 1.9, 0.822, 0.35, GLOSS);
    for (const z of [0.0, 0.14, 0.28]) { GH.pipe([[1.878, 0.778, z], [1.858, 0.778, z]], 0.021, 14, ALU, true); GH.pipe([[1.86, 0.778, z], [1.853, 0.778, z]], 0.014, 12, GLOSS, true); }
    for (const z of [0.05, 0.075, 0.1, 0.19, 0.215, 0.24]) GH.aabb(1.872, 0.768, z - 0.009, 1.877, 0.79, z + 0.009, FACE);
    GH.aabb(2.33, 1.007, -0.62, 2.375, 1.0135, 0.62, BLACK);              // 前挡除雾出风口
    GH.aabb(1.889, 0.69, 0.42, 1.894, 0.693, 0.88, BLACK);                // 手套箱的分缝
    GH.aabb(1.88, 0.7, 0.62, 1.893, 0.715, 0.7, ALU);                     // 手套箱拉手
    GH.aabb(2.44, 0.995, -0.9, 2.56, 1.012, 0.9, BLACK);                  // 前挡玻璃下沿的黑边
    GH.pipe([[2.5, 1.018, -0.62], [2.47, 1.026, -0.3], [2.455, 1.03, 0.02]], 0.011, 6, BLACK); GH.pipe([[2.5, 1.018, 0.1], [2.47, 1.026, 0.42], [2.455, 1.03, 0.72]], 0.011, 6, BLACK);   // 雨刷

    // 中控台：从仪表台下面一路伸到两个座椅之间，后段鼓起来是扶手箱
    const cons = [[2.02, 0.6, 0.14], [1.85, 0.585, 0.14], [1.65, 0.58, 0.135], [1.42, 0.585, 0.13], [1.25, 0.6, 0.13], [1.14, 0.69, 0.125], [0.95, 0.715, 0.125], [0.7, 0.71, 0.125], [0.62, 0.6, 0.12]];
    const crows = cons.map(([x, top, hw]) => { const row = []; for (let k = 0; k <= 12; k++) { const t = Math.PI * k / 12, c = Math.cos(t), sn = Math.sin(t); row.push([x, 0.3 + (top - 0.3) * Math.abs(sn) ** 0.35, 0.02 - hw * Math.sign(c) * Math.abs(c) ** 0.35]); } return row; });
    GS.loft(crows, { orient: (p) => [0, p[1] - 0.45, (p[2] - 0.02) * 1.5], color: (i, k) => i >= 5 && k >= 4 && k <= 7 ? TAN : FACE });
    GH.aabb(1.34, 0.584, -0.07, 1.62, 0.59, 0.11, GLOSS);                 // 挡位区的亮黑饰板
    GH.lathe([[0.034, 0], [0.03, 0.012], [0.016, 0.03]], 1.5, 0.02, 12, FACE, 0.588); GH.pipe([[1.5, 0.61, 0.02], [1.49, 0.7, 0.02]], 0.009, 8, ALU);
    GH.ellipsoid(1.487, 0.725, 0.02, 0.03, 0.034, 0.026, GLOSS, 6, 10);   // 换挡杆
    for (const z of [-0.035, 0.075]) { GH.lathe([[0.04, 0], [0.04, 0.004], [0.034, 0.004]], 1.24, z, 14, ALU, 0.6); GH.lathe([[0.034, 0.001], [0, 0.001]], 1.24, z, 14, BLACK, 0.6); }   // 杯架
    GH.aabb(0.72, 0.7, -0.1, 1.1, 0.718, -0.097, TAN_D);                  // 扶手箱盖的分缝

    for (const s of [-1, 1]) {
      // 门板：一条截面沿车长拉出来 —— 窗台、内凹的上段、凸出的扶手、下段和储物格
      const prof = [[0.955, 1.01], [0.9, 1.01], [0.885, 0.985], [0.9, 0.9], [0.87, 0.865], [0.82, 0.855], [0.805, 0.83], [0.82, 0.8], [0.9, 0.78], [0.915, 0.62], [0.89, 0.55], [0.9, 0.42], [0.955, 0.42]].map(([z, y]) => [z * s, y]);
      GS.extrudeX(prof, 0.35, 2.36, FACE, false, true);
      GH.aabb(1.0, 0.856, s > 0 ? 0.815 : -0.9, 1.75, 0.861, s > 0 ? 0.9 : -0.815, TAN);                 // 扶手上的皮面
      GH.aabb(1.45, 0.861, s * 0.86 - 0.028, 1.72, 0.866, s * 0.86 + 0.028, GLOSS);                      // 车窗开关面板
      for (let k = 0; k < 3; k++) GH.aabb(1.48 + k * 0.075, 0.866, s * 0.86 - 0.016, 1.53 + k * 0.075, 0.871, s * 0.86 + 0.016, ALU);
      GH.pipe([[1.86, 0.93, s * 0.888], [1.9, 0.935, s * 0.868], [2.0, 0.935, s * 0.868], [2.04, 0.93, s * 0.888]], 0.009, 7, ALU);   // 内拉手
      GH.pipe([[2.4, 1.012, 0.93 * s], [-0.4, 1.012, 0.93 * s]], 0.014, 6, ALU);                         // 窗沿亮条
      // 柱子：扁的椭圆截面，上细下粗
      const pillar = (a, b, w0, w1, t0, t1, col) => {
        const A = V(...a), B = V(...b), d = B.clone().sub(A).normalize(), e1 = V(1, 0, 0).addScaledVector(d, -d.x).normalize(), e2 = d.clone().cross(e1), rows = [];
        for (const [P, w, t] of [[A, w0, t0], [A.clone().lerp(B, 0.5), (w0 + w1) / 2, (t0 + t1) / 2], [B, w1, t1]]) { const row = []; for (let k = 0; k < 12; k++) { const q = k / 12 * Math.PI * 2, c = Math.cos(q), sn = Math.sin(q); row.push([P.x + e1.x * w * c + e2.x * t * sn, P.y + e1.y * w * c + e2.y * t * sn, P.z + e1.z * w * c + e2.z * t * sn]); } rows.push(row); }
        const mid = A.clone().lerp(B, 0.5); GS.loft(rows, { closed: true, orient: (p) => [p[0] - mid.x, 0, p[2] - mid.z], color: () => col });
      };
      pillar([2.5, 0.99, 0.905 * s], [1.72, 1.63, 0.74 * s], 0.075, 0.055, 0.04, 0.035, LINER);           // A 柱
      pillar([0.86, 0.95, 0.93 * s], [0.76, 1.64, 0.78 * s], 0.085, 0.07, 0.035, 0.03, LINER);            // B 柱
      pillar([-0.45, 1.0, 0.9 * s], [-0.05, 1.64, 0.76 * s], 0.12, 0.1, 0.05, 0.04, LINER);               // C 柱
      GS.pipe([[1.75, 1.635, 0.75 * s], [-0.05, 1.64, 0.76 * s]], 0.045, 8, LINER);                       // 车顶边梁
      // 座椅：靠背、头枕、坐垫
      GS.ellipsoid(0.86, 1.03, 0.4 * s, 0.085, 0.36, 0.23, SEAT, 8, 12); GS.ellipsoid(0.82, 1.47, 0.4 * s, 0.065, 0.11, 0.13, SEAT, 6, 10); GS.ellipsoid(1.12, 0.64, 0.4 * s, 0.27, 0.075, 0.235, SEAT, 6, 12);
      for (const dz of [-0.05, 0.05]) GH.pipe([[0.84, 1.36, 0.4 * s + dz], [0.83, 1.42, 0.4 * s + dz]], 0.007, 5, ALU);
      GH.pipe([[2.34, 1.0, 0.93 * s], [2.26, 1.02, 1.0 * s]], [0.035, 0.025], 8, BLACK, true);            // 外后视镜的底座
    }
    GS.pipe([[1.72, 1.63, -0.74], [1.74, 1.645, 0], [1.72, 1.63, 0.74]], 0.055, 8, LINER);                // 前挡上沿
    GS.pipe([[-0.05, 1.64, -0.76], [-0.05, 1.64, 0.76]], 0.055, 8, LINER);
    GH.aabb(-0.1, 1.675, -0.75, 1.8, 1.7, 0.75, LINER);                                                  // 顶棚
    GH.aabb(-0.92, 0.97, -0.85, -0.18, 1.01, 0.85, FACE);                                                // 后窗台
    GS.ellipsoid(0.02, 0.98, 0, 0.1, 0.36, 0.7, SEAT, 8, 14); GS.ellipsoid(0.3, 0.62, 0, 0.27, 0.075, 0.7, SEAT, 6, 14);     // 后排
    GH.pipe([[1.86, 1.6, 0], [1.9, 1.53, 0], [1.94, 1.47, 0]], 0.012, 7, BLACK);
    GH.pipe([[2.74, 0.9, 0.9], [2.76, 1.02, 0.95], [2.76, 1.1, 0.985]], [0.03, 0.022, 0.018], 7, BLACK);      // 右后视镜的支杆                          // 内后视镜的支架
  }
  L1(new THREE.Mesh(GS.build(), toonMat({ vertexColors: true, smooth: true, rim: 0.25 })));
  L1(new THREE.Mesh(GH.build(), toonMat({ vertexColors: true, spec: 0.5 })));
  // 车外的后备箱盖（回头或看内后视镜时能看到一点）
  const GT = new Geo(); GT.box(-0.72, 0.9, 0, 0.4, 0.12, 1.76, 0, WHITE); L1(new THREE.Mesh(GT.build(), hoodPaint));

  // ---------- 仪表：一张实时画的贴图 ----------
  const cc = document.createElement('canvas'); cc.width = 512; cc.height = 160; const cx = cc.getContext('2d');
  const clusterTex = new THREE.CanvasTexture(cc); clusterTex.colorSpace = THREE.SRGBColorSpace;
  const cluster = L1(new THREE.Mesh(new THREE.PlaneGeometry(0.37, 0.1156), new THREE.MeshBasicMaterial({ map: clusterTex, fog: false })));
  cluster.position.set(2.0228, 0.9198, EYE.z); cluster.quaternion.copy(facing(0.3));
  { const ringMat = toonMat({ color: new THREE.Color().setRGB(0.3, 0.31, 0.34), spec: 0.8, smooth: true });
    for (const s of [-1, 1]) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.0495, 0.0045, 8, 40), ringMat); r.position.set(s * 0.1127, -0.0043, 0.004); r.layers.set(1); r.frustumCulled = false; cluster.add(r); } }
  let clusterKey = '';
  const dial = (x, y, r, frac, label, marks) => {
    const a0 = Math.PI * 0.8, a1 = Math.PI * 2.2;
    cx.lineWidth = 5; cx.strokeStyle = '#2b3442'; cx.beginPath(); cx.arc(x, y, r, a0, a1); cx.stroke();
    cx.strokeStyle = '#4da3ff'; cx.beginPath(); cx.arc(x, y, r, a0, a0 + (a1 - a0) * frac); cx.stroke();
    cx.fillStyle = '#c9d3df'; cx.font = '600 13px Arial'; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    marks.forEach((m, i) => { const a = a0 + (a1 - a0) * i / (marks.length - 1); cx.fillText(m, x + Math.cos(a) * (r - 16), y + Math.sin(a) * (r - 16)); });
    const a = a0 + (a1 - a0) * frac; cx.strokeStyle = '#ff5a4f'; cx.lineWidth = 4; cx.lineCap = 'round'; cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x + Math.cos(a) * (r - 8), y + Math.sin(a) * (r - 8)); cx.stroke();
    cx.fillStyle = '#e8edf3'; cx.beginPath(); cx.arc(x, y, 7, 0, 7); cx.fill();
    cx.fillStyle = '#7f8b99'; cx.font = '600 11px Arial'; cx.fillText(label, x, y + r * 0.62);
  };
  const drawCluster = (car, blink) => {
    const mph = Math.abs(car.v) * MPH, key = [Math.round(mph * 2), car.gear, Math.round(car.throttle * 10), car.signal, blink].join();
    if (key === clusterKey) return; clusterKey = key;
    cx.fillStyle = '#0a0d13'; cx.fillRect(0, 0, 512, 160);
    dial(100, 86, 62, Math.min(1, 0.1 + car.throttle * 0.45 + mph / 120), 'x1000 rpm', ['0', '2', '4', '6', '8']);
    dial(412, 86, 62, Math.min(1, mph / 80), 'mph', ['0', '20', '40', '60', '80']);
    cx.fillStyle = '#f2f5f9'; cx.font = '700 46px Arial'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(Math.round(mph), 256, 70);
    cx.font = '600 13px Arial'; cx.fillStyle = '#7f8b99'; cx.fillText('mph', 256, 100);
    ['P', 'R', 'N', 'D'].forEach((g, i) => { cx.font = '700 17px Arial'; cx.fillStyle = g === car.gear ? '#ffffff' : '#465263'; cx.fillText(g, 220 + i * 24, 130); });
    const arrow = (x, d, on) => { cx.fillStyle = on ? '#37e06b' : '#1c2430'; cx.beginPath(); cx.moveTo(x + d * 14, 30); cx.lineTo(x - d * 4, 18); cx.lineTo(x - d * 4, 25); cx.lineTo(x - d * 16, 25); cx.lineTo(x - d * 16, 35); cx.lineTo(x - d * 4, 35); cx.lineTo(x - d * 4, 42); cx.fill(); };
    arrow(206, -1, blink && (car.signal === -1 || car.signal === 2)); arrow(306, 1, blink && (car.signal === 1 || car.signal === 2));
    clusterTex.needsUpdate = true;
  };
  // 中控屏：实时导航（画面是 main.js 里的小地图画布）
  {
    const t = new THREE.CanvasTexture(navCanvas); t.colorSpace = THREE.SRGBColorSpace; view0.navTex = t;
    const q = facing(0.1), W = 0.38, H = 0.225, r = 0.018, sh = new THREE.Shape();
    sh.moveTo(-W / 2 + r, -H / 2); sh.lineTo(W / 2 - r, -H / 2); sh.quadraticCurveTo(W / 2, -H / 2, W / 2, -H / 2 + r); sh.lineTo(W / 2, H / 2 - r); sh.quadraticCurveTo(W / 2, H / 2, W / 2 - r, H / 2);
    sh.lineTo(-W / 2 + r, H / 2); sh.quadraticCurveTo(-W / 2, H / 2, -W / 2, H / 2 - r); sh.lineTo(-W / 2, -H / 2 + r); sh.quadraticCurveTo(-W / 2, -H / 2, -W / 2 + r, -H / 2);
    const bezel = L1(new THREE.Mesh(new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: true, bevelSize: 0.003, bevelThickness: 0.003, bevelSegments: 2, curveSegments: 5 }), toonMat({ color: new THREE.Color().setRGB(0.045, 0.05, 0.06), spec: 0.6, smooth: true })));
    bezel.position.set(1.9, 1.035, 0.18); bezel.quaternion.copy(q);
    const scr = L1(new THREE.Mesh(new THREE.PlaneGeometry(W - 0.022, H - 0.022), new THREE.MeshBasicMaterial({ map: t, fog: false })));
    scr.position.set(1.9, 1.035, 0.18).add(V(0, 0, 0.0158).applyQuaternion(q)); scr.quaternion.copy(q);
    const GF = new Geo(); GF.aabb(1.9, 0.975, 0.11, 1.925, 1.03, 0.25, [0.05, 0.053, 0.062]); L1(new THREE.Mesh(GF.build(), toonMat({ vertexColors: true })));
  }

  // ---------- 方向盘 ----------
  // 本地坐标：x = 车右，y = 盘面的上方，z = 指向驾驶员。轮圈、三根轮辐、中心气囊盖都是放样出来的实体
  const wheelHolder = new THREE.Group(); wheelHolder.position.set(1.74, 0.865, EYE.z); wheelHolder.quaternion.copy(facing(0.42));
  const wheel = new THREE.Group(); wheelHolder.add(wheel); root.add(wheelHolder);
  const wheelMat = toonMat({ vertexColors: true, spec: 0.45, rim: 0.3, smooth: true });
  const latheZ = (Gz, prof, seg, col) => {      // 绕本地 z 轴旋转成型；prof 是 [半径, z]，从中心往外写
    const rows = prof.map(([r, z]) => { const row = []; for (let k = 0; k < seg; k++) { const t = k / seg * Math.PI * 2; row.push([r * Math.cos(t), r * Math.sin(t), z]); } return row; });
    const pn = prof.map((p, i) => { const a = prof[Math.max(0, i - 1)], b = prof[Math.min(prof.length - 1, i + 1)]; return [-(b[1] - a[1]), b[0] - a[0]]; });
    Gz.loft(rows, { closed: true, orient: (p, i, k) => { const t = k / seg * Math.PI * 2; return [Math.cos(t) * pn[i][0], Math.sin(t) * pn[i][0], pn[i][1]]; }, color: () => col });
  };
  {
    const GW = new Geo(), RIM = [0.022, 0.023, 0.028], PAD = [0.05, 0.053, 0.062], BTN = [0.3, 0.31, 0.34], CHR = [0.6, 0.62, 0.66], R = 0.185, sp = (v) => Math.sign(v) * Math.sqrt(Math.abs(v));
    // 轮圈：3 点和 9 点握把处略粗；12 点一小段浅色的回正标记
    const NR = 64, NT = 12, rings = [], cen = [];
    for (let i = 0; i <= NR; i++) {
      const a = i / NR * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), grip = Math.exp(-(((Math.abs(ca) - 0.93) / 0.13) ** 2)), r = 0.0185 + 0.003 * grip, row = [];
      for (let k = 0; k < NT; k++) { const t = k / NT * Math.PI * 2; row.push([(R + r * Math.cos(t)) * ca, (R + r * Math.cos(t)) * sa, r * 1.08 * Math.sin(t)]); }
      rings.push(row); cen.push([R * ca, R * sa, 0]);
    }
    GW.loft(rings, { closed: true, orient: (p, i) => [p[0] - cen[i][0], p[1] - cen[i][1], p[2]], color: (i) => Math.abs(i + 0.5 - NR / 4) < 1.1 ? [0.85, 0.85, 0.82] : RIM });
    // 轮辐：从中心往轮圈由宽变窄、由厚变薄，中心端比轮圈低一点
    const spoke = (ang, w0, w1) => {
      const ca = Math.cos(ang), sa = Math.sin(ang), rows = [], cs = [];
      for (const q of [0, 0.3, 0.65, 1]) {
        const rho = 0.05 + (0.178 - 0.05) * q, w = (w0 + (w1 - w0) * q) / 2, th = (0.026 - 0.008 * q) / 2, zc = -0.016 * (1 - q), c = [rho * ca, rho * sa, zc], row = [];
        for (let k = 0; k < 10; k++) { const t = k / 10 * Math.PI * 2, u = sp(Math.cos(t)) * w, v = sp(Math.sin(t)) * th; row.push([c[0] - sa * u, c[1] + ca * u, zc + v]); }
        rows.push(row); cs.push(c);
      }
      GW.loft(rows, { closed: true, orient: (p, i) => [p[0] - cs[i][0], p[1] - cs[i][1], p[2] - cs[i][2]], color: () => PAD });
    };
    spoke(-0.1, 0.06, 0.034); spoke(Math.PI + 0.1, 0.06, 0.034); spoke(-Math.PI / 2, 0.075, 0.04);
    latheZ(GW, [[0, 0.02], [0.03, 0.019], [0.055, 0.012], [0.07, 0], [0.074, -0.014], [0.07, -0.03], [0.045, -0.05]], 24, PAD);      // 气囊盖
    latheZ(GW, [[0, 0.0225], [0.014, 0.0225], [0.019, 0.0195]], 16, CHR);                                                          // 车标
    for (const s of [-1, 1]) for (const [x, y] of [[0.09, 0.004], [0.123, 0.0]]) GW.aabb(s * x - 0.012, y - 0.02, 0, s * x + 0.012, y - 0.004, 0.0075, BTN);     // 多功能按键
    const wm = new THREE.Mesh(GW.build(), wheelMat); wheel.add(wm);
    // 转向柱护罩 + 两根拨杆（左边的转向灯拨杆打灯时会动）
    const GC = new Geo();
    latheZ(GC, [[0.058, -0.045], [0.066, -0.06], [0.08, -0.2], [0.085, -0.3]], 16, FACE);
    GC.pipe([[0.06, 0, -0.1], [0.2, 0.012, -0.088]], [0.011, 0.009], 8, PAD); GC.ellipsoid(0.205, 0.012, -0.088, 0.016, 0.012, 0.012, PAD, 5, 8);
    wheelHolder.add(new THREE.Mesh(GC.build(), wheelMat));
  }
  const stalk = new THREE.Group(); stalk.position.set(0, 0, -0.1);
  { const GK = new Geo(), PAD = [0.05, 0.053, 0.062]; GK.pipe([[-0.06, 0, 0], [-0.2, 0.012, 0.012]], [0.011, 0.009], 8, PAD); GK.ellipsoid(-0.205, 0.012, 0.012, 0.016, 0.012, 0.012, PAD, 5, 8); stalk.add(new THREE.Mesh(GK.build(), wheelMat)); }
  wheelHolder.add(stalk);
  wheelHolder.traverse(o => { o.layers.set(1); o.frustumCulled = false; });

  // ---------- 后视镜：各自一个朝后的相机渲染到贴图，贴到镜面上（左右翻转）；镜面后面是有厚度的镜壳 ----------
  const mirrors = [];
  const shellDark = toonMat({ color: new THREE.Color().setRGB(0.05, 0.055, 0.07), spec: 0.4, smooth: true }), shellPaint = toonMat({ color: new THREE.Color().setRGB(...BODY), spec: 0.35, smooth: true });
  const addMirror = (w, h, pos, yaw, camPos, camYaw, fov, rw, rh, paint) => {
    const rt = new THREE.WebGLRenderTarget(rw, rh, { samples: 4 });
    const g = new THREE.PlaneGeometry(w, h); const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    const mesh = L1(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: rt.texture, fog: false, toneMapped: false })));
    mesh.position.copy(pos); mesh.rotation.y = yaw;
    const nrm = V(Math.sin(yaw), 0, Math.cos(yaw));
    const frame = L1(new THREE.Mesh(new THREE.PlaneGeometry(w + 0.02, h + 0.02), new THREE.MeshBasicMaterial({ color: 0x08090b })));
    frame.position.copy(pos).addScaledVector(nrm, -0.003); frame.rotation.y = yaw;
    const shell = L1(new THREE.Mesh(new THREE.SphereGeometry(1, 18, 12), paint ? shellPaint : shellDark));
    shell.scale.set(w * 0.57, h * 0.64, paint ? 0.07 : 0.028); shell.position.copy(pos).addScaledVector(nrm, paint ? -0.076 : -0.033); shell.rotation.y = yaw;
    const cam = new THREE.PerspectiveCamera(fov, rw / rh, 0.3, 230); cam.position.copy(camPos); cam.rotation.y = camYaw; root.add(cam);
    mirrors.push({ rt, cam, mesh });
  };
  addMirror(0.28, 0.095, V(1.92, 1.455, 0.0), -(Math.PI / 2 + 0.22), V(-1.0, 1.3, 0), Math.PI / 2, 13, 768, 260, false);
  addMirror(0.23, 0.145, V(2.18, 1.085, -1.06), -1.22, V(2.2, 1.04, -1.08), Math.PI / 2 - 0.13, 17, 384, 240, true);
  // 右镜：真车的位置在正前方视野外（偏右 54°），这里挪到引擎盖右前角上方（像翼子板后视镜），不用转头就能看到
  addMirror(0.26, 0.16, V(2.72, 1.175, 0.97), -2.2, V(2.74, 1.15, 1.02), Math.PI / 2 + 0.13, 17, 384, 240, true);

  const camera = new THREE.PerspectiveCamera(58, 16 / 9, 0.08, 1800);
  scene.add(camera);
  const view = { root, camera, mirrors, mode: 'cockpit', look: 0, frame: 0, navTex: view0.navTex };
  const tgt = new THREE.Vector3();

  /** lookTarget：视线偏转角（弧度，右为正） */
  view.update = (car, lookTarget, dt) => {
    const cy = car.y || 0; root.position.set(car.x, cy, car.z); root.rotation.y = -car.h;
    wheel.rotation.z = -car.steer * 7.3;       // 约 1.2 圈打到底
    stalk.rotation.z += ((car.signal === 1 ? 0.22 : car.signal === -1 ? -0.22 : 0) - stalk.rotation.z) * Math.min(1, dt * 14 + 0.02);
    view.look += (lookTarget - view.look) * Math.min(1, dt * 9);
    const fx = Math.cos(car.h), fz = Math.sin(car.h), rx = -fz, rz = fx;
    const cx0 = car.x + fx * CAR.center, cz0 = car.z + fz * CAR.center;
    camera.up.set(0, 1, 0);
    if (view.mode === 'cockpit') {
      const lean = Math.sin(view.look) * 0.1, a = car.h + view.look;
      camera.position.set(car.x + fx * EYE.x + rx * (EYE.z + lean), cy + EYE.y, car.z + fz * EYE.x + rz * (EYE.z + lean));
      tgt.set(camera.position.x + Math.cos(a), cy + EYE.y - 0.02, camera.position.z + Math.sin(a)); camera.lookAt(tgt);
      camera.layers.set(0); camera.layers.enable(1);
      if ((view.frame & 1) === 0) drawCluster(car, (performance.now() % 760) < 380);
    } else if (view.mode === 'chase') {
      const a = car.h + view.look;
      camera.position.set(cx0 - Math.cos(a) * 8.5, cy + 3.6, cz0 - Math.sin(a) * 8.5); tgt.set(cx0 + fx * 4, cy + 1.0, cz0 + fz * 4); camera.lookAt(tgt);
      camera.layers.set(0); camera.layers.enable(2);
    } else {
      camera.position.set(cx0 + fx * 6, cy + 60, cz0 + fz * 6); camera.up.set(fx, 0, fz); tgt.set(cx0 + fx * 6, cy, cz0 + fz * 6); camera.lookAt(tgt);
      camera.layers.set(0); camera.layers.enable(2);
    }
  };
  view.renderMirrors = () => {
    view.frame++; root.updateMatrixWorld(true); camera.updateMatrixWorld();
    if (view.mode !== 'cockpit') return;
    // 每帧只重画一面镜子：中、左、中、右轮流（镜子里的画面是整场景再画一遍，最费）
    const m = mirrors[[0, 1, 0, 2][view.frame & 3]]; renderer.setRenderTarget(m.rt); renderer.render(scene, m.cam);
    renderer.setRenderTarget(null);
  };
  /** 换车：车型（车外镜头里的样子）+ 车漆颜色（车里能看到的引擎盖、后视镜壳也跟着变） */
  view.setCar = (type, rgb) => { ext.geometry.dispose(); ext.geometry = carModel(type, rgb); hoodPaint.color.setRGB(...rgb); shellPaint.color.setRGB(...rgb); };
  view.resize = (w, h) => { camera.aspect = w / h; camera.fov = w / h > 1.5 ? 58 : 66; camera.updateProjectionMatrix(); };
  return view;
}
