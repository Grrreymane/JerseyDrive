// 程序化模型：汽车（弧面车身）、树冠、路灯、消防栓。都以自身中心为原点，+x 朝前，y 向上。
import * as THREE from 'three';
import { Geo, lin } from './geo.js';

const spow = (v, e) => Math.sign(v) * Math.abs(v) ** e;

// 沿一串关键截面做 Catmull-Rom 插值，得到 n 个更密、更顺的截面
function resample(keys, n) {
  const m = keys.length, out = [], at = (i) => keys[Math.max(0, Math.min(m - 1, i))];
  for (let q = 0; q < n; q++) {
    const u = q / (n - 1) * (m - 1), i = Math.min(m - 2, Math.floor(u)), t = u - i, p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    out.push(p1.map((_, k) => 0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t * t * t)));
  }
  return out;
}

/**
 * 小汽车。type: 'sedan' | 'suv'。长约 4.56 米，中心在原点，轮子着地（y = 0）。
 * 造型顺序：先定车头、引擎盖、前挡、车顶、后窗、车尾的一串截面，放样出车身和座舱；再加轮拱、保险杠、灯组、后视镜。
 * 顶点色：车漆是纯白（实例颜色只染纯白的部分，见 toon.js 的 paint 选项）；玻璃、轮胎、饰条是固定颜色。
 * paint 传颜色时直接把车漆烤进顶点色（给不走实例的那辆自己的车用）。lo = 远处用的简模（同一套截面，采样稀、不带小零件）。
 */
export function carModel(type = 'sedan', paint = null, lo = false) {
  const G = new Geo(), suv = type === 'suv';
  const BODY = paint || [1, 1, 1], TRIM = [0.035, 0.037, 0.045], GLASS = [0.1, 0.17, 0.27], TIRE = [0.022, 0.022, 0.026], HUB = [0.62, 0.64, 0.68], HUB_D = [0.1, 0.105, 0.12], LAMP = [1.6, 1.5, 1.15], TAIL = [1.2, 0.07, 0.05], PLATE = [0.9, 0.9, 0.84], SEAM = [0.08, 0.085, 0.1], CHROME = [0.7, 0.72, 0.76];
  const up = suv ? 0.13 : 0;
  // 车身截面（x，半宽，底，顶）：截面是圆角矩形，上半截往里收（车窗以下的“肩”），下沿也收一点（裙边）
  const keys = [
    [-2.28, 0.56, 0.42, 0.76 + up], [-2.22, 0.8, 0.3, 0.87 + up], [-2.05, 0.87, 0.24, 0.935 + up], [-1.55, 0.905, 0.22, 0.965 + up], [-0.9, 0.915, 0.22, 0.955 + up],
    [0, 0.915, 0.22, 0.945 + up], [0.9, 0.91, 0.22, 0.935 + up], [1.45, 0.895, 0.22, 0.89 + up * 0.8], [1.95, 0.85, 0.24, 0.8 + up * 0.6], [2.2, 0.76, 0.3, 0.7 + up * 0.4], [2.28, 0.5, 0.4, 0.62 + up * 0.3],
  ];
  const st = resample(keys, lo ? 6 : 23), K = lo ? 8 : 26, halfW = (x) => { for (let i = 1; i < st.length; i++) if (st[i][0] >= x) { const t = (x - st[i - 1][0]) / (st[i][0] - st[i - 1][0] || 1); return st[i - 1][1] + (st[i][1] - st[i - 1][1]) * t; } return st[st.length - 1][1]; };
  const body = st.map(([x, w, y0, y1]) => {
    const row = [], yc = (y0 + y1) / 2, hh = (y1 - y0) / 2;
    for (let k = 0; k < K; k++) { const t = (k + 0.5) / K * Math.PI * 2, sn = Math.sin(t), u = Math.max(0, sn), d = Math.max(0, -sn); row.push([x, yc + hh * spow(sn, 0.44), w * spow(Math.cos(t), 0.44) * (1 - 0.055 * u * u - 0.06 * d * d * d)]); }
    return row;
  });
  G.loft(body, { closed: true, orient: (p, i) => [i === 0 ? -0.8 : i === st.length - 1 ? 0.8 : 0, p[1] - 0.6, p[2]], color: (i, k) => Math.sin((k + 1) / K * Math.PI * 2) < -0.6 ? TRIM : BODY });
  for (const e of [0, st.length - 1]) {   // 封住车头车尾
    const r = body[e], c = [st[e][0], (st[e][2] + st[e][3]) / 2, 0], n = [e ? 1 : -1, 0, 0];
    for (let k = 0; k < K; k++) G.quadN([c, r[k], r[(k + 1) % K], r[(k + 1) % K]], [n, n, n, n], e ? TRIM : BODY);
  }
  // 座舱：下宽上窄、顶部圆角。车顶、窗框、A/B/C 柱是车漆色，其余是玻璃
  const yb = 0.9 + up;
  const ck = suv
    ? [[1.04, 0.875, 0.86, yb + 0.01], [0.78, 0.87, 0.78, yb + 0.3], [0.5, 0.865, 0.73, 1.6], [0.2, 0.862, 0.72, 1.665], [-0.6, 0.862, 0.72, 1.675], [-1.45, 0.862, 0.72, 1.66], [-1.85, 0.862, 0.74, 1.58], [-2.06, 0.866, 0.8, yb + 0.3], [-2.17, 0.87, 0.85, yb + 0.01]]
    : [[1.04, 0.875, 0.86, yb + 0.01], [0.72, 0.87, 0.75, yb + 0.26], [0.38, 0.865, 0.67, 1.4], [0.1, 0.86, 0.66, 1.455], [-0.45, 0.86, 0.66, 1.46], [-0.82, 0.86, 0.665, 1.43], [-1.15, 0.862, 0.7, 1.32], [-1.42, 0.868, 0.78, yb + 0.22], [-1.64, 0.875, 0.86, yb + 0.01]];
  const cs = resample(ck, lo ? 6 : 19), K2 = lo ? 7 : 19, roofA = suv ? -1.5 : -0.84, roofB = suv ? 0.46 : 0.34, pilX = suv ? -0.32 : -0.28;
  const cabin = cs.map(([x, wb, wt, yt]) => {
    const row = [];
    for (let k = 0; k < K2; k++) { const t = k / (K2 - 1) * Math.PI, sn = Math.sin(t); row.push([x, yb + (yt - yb) * spow(sn, 0.5), spow(Math.cos(t), 0.45) * (wb * 0.955 + (wt - wb * 0.955) * sn ** 0.7)]); }
    return row;
  });
  G.loft(cabin, {
    orient: (p, i) => [i < 2 ? 0.7 : i > cs.length - 3 ? -0.7 : 0, p[1] - 0.9, p[2] * 0.8],
    color: (i, k) => {
      const x = (cs[i][0] + cs[i + 1][0]) / 2, sn = Math.sin((k + 0.5) / (K2 - 1) * Math.PI), inRoof = x > roofA && x < roofB;
      if (lo) return sn > 0.8 && inRoof ? BODY : sn < 0.25 ? BODY : GLASS;
      if (sn < 0.2 || Math.abs(x - pilX) < 0.075) return BODY;                 // 腰线、B 柱
      if (sn < 0.6) return inRoof || (x > roofB && x < 0.82) || (x < roofA && x > (suv ? -1.95 : -1.38)) ? GLASS : BODY;   // 侧窗
      if (sn < 0.8) return BODY;                                             // 窗框上沿、A/C 柱
      return inRoof ? BODY : GLASS;                                          // 车顶 / 前后挡
    },
  });
  // 轮子：胎面 → 胎肩 → 胎侧 → 轮辋边 → 凹进去的辋盘，辋盘上五根辐条和中心盖
  const wheel = (cx, cz) => {
    const r = 0.335, hw = 0.115, seg = lo ? 6 : 16, sgn = Math.sign(cz), ring = (z, rad) => { const a = []; for (let k = 0; k < seg; k++) { const t = k / seg * Math.PI * 2; a.push([cx + Math.cos(t) * rad, r + Math.sin(t) * rad, z]); } return a; };
    const prof = lo ? [[-hw, r], [hw, r]] : [[-hw, 0], [-hw, r - 0.02], [-hw + 0.02, r], [hw - 0.03, r], [hw - 0.006, r - 0.022], [hw, r - 0.07], [hw - 0.004, 0.228], [hw - 0.012, 0.222], [hw - 0.04, 0.2], [hw - 0.045, 0]];
    const rows = prof.map(([dz, rad]) => ring(cz + sgn * dz, Math.max(rad, 0.0005)));
    const pn = prof.map((p, i) => { const a = prof[Math.max(0, i - 1)], b = prof[Math.min(prof.length - 1, i + 1)]; return [-(b[1] - a[1]), b[0] - a[0]]; });      // 轮廓法线（轴向, 径向）
    G.loft(rows, { closed: true, orient: (p, i, k) => { const t = k / seg * Math.PI * 2; return [Math.cos(t) * pn[i][1], Math.sin(t) * pn[i][1], sgn * pn[i][0]]; }, color: (i) => lo ? (i ? HUB : TIRE) : i < 6 ? TIRE : i === 6 ? HUB : HUB_D });
    if (lo) return;
    const n = [0, 0, sgn], zs = cz + sgn * (hw - 0.014), P = (a, rad) => [cx + Math.cos(a) * rad, r + Math.sin(a) * rad, zs];
    for (let k = 0; k < 5; k++) { const a = k / 5 * Math.PI * 2 + 0.3; G.quadN([P(a - 0.34, 0.05), P(a + 0.34, 0.05), P(a + 0.1, 0.215), P(a - 0.1, 0.215)], [n, n, n, n], HUB); }
    const cap = ring(zs + sgn * 0.006, 0.055); for (let k = 1; k < seg - 1; k++) G.quadN([cap[0], cap[k], cap[k + 1], cap[k + 1]], [n, n, n, n], CHROME);
    // 轮拱：车身侧面一块深色的轮罩 + 一圈鼓出来的轮眉
    const za = sgn * (halfW(cx) * 0.985 + 0.004), c = [cx, r, za], well = ring(za, 0.405);
    for (let k = 0; k < seg / 2; k++) G.quadN([c, well[k], well[k + 1], well[k + 1]], [n, n, n, n], TRIM);
    const arc = []; for (let k = 0; k <= 10; k++) { const a = -0.12 + (Math.PI + 0.24) * k / 10; arc.push([cx + Math.cos(a) * 0.412, r + Math.sin(a) * 0.412, za - sgn * 0.004]); }
    G.pipe(arc, 0.024, 5, BODY);
  };
  for (const cx of [-1.36, 1.36]) for (const cz of [-0.8, 0.8]) wheel(cx, cz);
  if (lo) return G.build();
  // 灯组、保险杠、格栅、车牌、后视镜、门缝、门把手、腰线饰条
  const yh = 0.63 + up * 0.4, yt = 0.74 + up;
  for (const s of [-1, 1]) {
    G.ellipsoid(2.175, yh, 0.555 * s, 0.1, 0.075, 0.2, TRIM, 6, 12); G.ellipsoid(2.2, yh, 0.555 * s, 0.085, 0.048, 0.16, LAMP, 6, 12);        // 大灯：深色灯腔 + 发亮的灯芯
    G.pipe([[-2.262, yt, 0.2 * s], [-2.262, yt, 0.5 * s], [-2.215, yt, 0.72 * s], [-2.09, yt, 0.855 * s]], [0.03, 0.036, 0.036, 0.028], 8, TAIL, true);   // 尾灯：绕过车角的一条
    G.ellipsoid(2.2, 0.4, 0.6 * s, 0.05, 0.035, 0.07, TRIM, 4, 8);                                                                           // 雾灯口
    // 后视镜：支脚 + 镜壳 + 镜面
    G.pipe([[0.98, 0.96 + up, 0.9 * s], [0.93, 0.99 + up, 0.985 * s]], [0.03, 0.022], 6, TRIM);
    G.ellipsoid(0.91, 1.0 + up, 1.01 * s, 0.07, 0.06, 0.085, BODY, 8, 14); G.ellipsoid(0.86, 1.0 + up, 1.01 * s, 0.03, 0.045, 0.065, GLASS, 5, 10);
    for (const x of [0.92, pilX, suv ? -1.25 : -1.1]) G.box(x, 0.59 + up * 0.5, s * (halfW(x) * 0.972 + 0.002), 0.012, 0.42 + up, 0.012, 0, SEAM);
    for (const x of [0.02, suv ? -0.95 : -0.85]) { G.box(x, 0.8 + up, s * (halfW(x) * 0.972 + 0.008), 0.17, 0.03, 0.018, 0, CHROME); }
    const belt = cs.filter(c => c[0] < 0.95 && c[0] > (suv ? -2.0 : -1.5)).map(c => [c[0], yb + 0.035, s * (c[1] * 0.955 + 0.004)]);
    G.pipe(belt, 0.011, 5, CHROME);                                                                                                          // 窗下沿的亮条
    if (suv) G.pipe([[0.25, 1.705, 0.6 * s], [-0.5, 1.72, 0.6 * s], [-1.45, 1.705, 0.6 * s]], 0.017, 6, TRIM, true);                          // 行李架
  }
  const lip = (x0, x1, x2, y) => [[x0, y, -0.875], [x1, y, -0.79], [x2, y, -0.5], [x2 + (x2 > 0 ? 0.015 : -0.015), y, 0], [x2, y, 0.5], [x1, y, 0.79], [x0, y, 0.875]];
  G.pipe(lip(1.85, 2.15, 2.265, 0.27), 0.03, 6, TRIM, true); G.pipe(lip(-1.85, -2.15, -2.265, 0.3), 0.03, 6, TRIM, true);                    // 前唇、后下沿
  G.pipe(lip(1.9, 2.19, 2.285, 0.5 + up * 0.2).slice(1, 6), 0.016, 5, BODY);                                                                 // 保险杠上的一道棱
  G.box(2.283, 0.43 + up * 0.2, 0, 0.012, 0.1, 0.66, 0, TRIM); G.box(2.286, 0.57 + up * 0.3, 0, 0.012, 0.035, 0.4, 0, TRIM);                  // 下格栅、上格栅
  G.box(2.292, 0.43 + up * 0.2, 0, 0.006, 0.07, 0.3, 0, PLATE); G.box(-2.284, 0.6 + up, 0, 0.012, 0.11, 0.32, 0, PLATE);
  for (const s of [-1, 1]) G.pipe([[-2.26, 0.3, 0.42 * s], [-2.32, 0.3, 0.42 * s]], 0.035, 8, CHROME, true);                                  // 排气尾管
  G.ellipsoid(suv ? -1.6 : -0.75, (suv ? 1.68 : 1.455), 0, 0.09, 0.03, 0.022, TRIM, 4, 8);                                                    // 鲨鱼鳍天线
  return G.build();
}

/** 远处用的简模 */
export function carModelLow() { return carModel('sedan', null, true); }

/**
 * 行道树。三个树种，结构规则各不相同：
 *   0 圆冠（枫 / 椴）：主干 3 米处分 4 枝，树冠是大小不一的 9 团；
 *   1 窄冠（豆梨 / 银杏）：枝条往上收，树冠竖着叠 6 团，占地小，种在离楼近的地方；
 *   2 伞形（皂荚）：枝条往外撑开，5 团大的分在四周和顶上，中间留空能透天。
 * 树干底部外扩、往上逐渐变细并略带弯曲；每根主枝伸进它托着的那团树冠里。底在 y = 0，+y 向上。
 * 整棵树是一个网格；lo = 远处用的简模。树冠顶点色是灰度（上亮下暗），会乘上实例颜色；树干带色相，不受实例颜色影响。
 */
export const TREE_KINDS = [
  { radius: 2.3, blobs: [[0, 5.7, 0, 1.45], [1.05, 5.05, 0.4, 1.05], [-0.95, 5.0, 0.55, 1.0], [0.2, 4.95, -1.05, 1.0], [-0.5, 6.4, -0.1, 0.9], [0.7, 6.2, -0.5, 0.8], [-0.3, 4.7, 1.05, 0.85], [1.0, 4.4, -0.65, 0.6], [-1.3, 4.45, -0.35, 0.58]], limbs: 4, fork: 3.0, lean: [0.06, -0.03] },
  { radius: 1.25, blobs: [[0, 4.5, 0, 0.92], [0.12, 5.5, 0.08, 0.95], [-0.08, 6.5, -0.05, 0.8], [0.04, 7.3, 0, 0.55], [0.5, 3.9, -0.3, 0.58], [-0.48, 4.1, 0.38, 0.6]], limbs: 3, fork: 2.7, lean: [-0.03, 0.02] },
  { radius: 2.6, blobs: [[-1.55, 5.0, 0.2, 0.98], [1.5, 5.2, -0.25, 1.02], [0.1, 5.6, 1.4, 0.95], [-0.2, 5.45, -1.45, 0.9], [0, 6.35, 0, 1.05], [0.95, 4.55, 1.0, 0.6], [-1.0, 4.5, -0.95, 0.6]], limbs: 4, fork: 2.9, lean: [0.05, 0.06] },
];
export function treeModel(kind, lo = false) {
  const T = TREE_KINDS[kind], G = new Geo(), BARK = lin('#7d5d47'), BARK_D = lin('#6a4d3b');
  // 树干：底部外扩，往上变细，带一点弯
  const fx = T.lean[0], fz = T.lean[1], F = [fx * 3, T.fork, fz * 3];
  G.pipe([[0, -0.05, 0], [0, 0.12, 0], [fx * 0.6, 0.6, fz * 0.6], [fx * 2.2, 1.7, fz * 2.2], [fx * 2.6, T.fork - 0.4, fz * 2.6], F, ...(lo ? [[F[0], F[1] + 1.2, F[2]]] : [])], [0.3, 0.2, 0.155, 0.135, 0.125, 0.115, 0.09], lo ? 4 : 9, BARK_D);
  // 主枝：从分叉点出来先往外再往上，伸到那团树冠的中心偏下
  for (let k = 0; k < (lo ? 0 : T.limbs); k++) {
    const b = T.blobs[k], e = [b[0] * 0.9, b[1] - b[3] * 0.25, b[2] * 0.9], m = [F[0] + (e[0] - F[0]) * 0.55, F[1] + (e[1] - F[1]) * 0.35, F[2] + (e[2] - F[2]) * 0.55];
    G.pipe([[F[0], F[1] - 0.15, F[2]], [F[0] + (m[0] - F[0]) * 0.4, F[1] + (m[1] - F[1]) * 0.5, F[2] + (m[2] - F[2]) * 0.4], m, e], [0.095, 0.075, 0.055, 0.03], 6, BARK);
  }
  // 树冠：每团是一个表面起伏的球，法线一半朝自己球心外、一半朝整棵树外，卡通明暗才是一整团而不是一堆球
  const pos = [], nrm = [], col = [], v = new THREE.Vector3(), n = new THREE.Vector3(), o = new THREE.Vector3();
  let cy = 0; for (const b of T.blobs) cy += b[1] / T.blobs.length;
  T.blobs.forEach(([x, y, z, r], bi) => {
    if (lo && bi >= 3) return;
    const g = new THREE.IcosahedronGeometry(lo ? 1.12 : 1, lo ? 1 : bi < 5 ? 4 : 2), P = g.attributes.position, s = bi * 2.37 + kind * 5.1, tone = 0.86 + 0.16 * Math.min(1, Math.max(0, (y - cy + 0.8) / 1.6));
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i);
      const d = lo ? 1.06 : 1 + 0.13 * Math.sin(v.x * 4.1 + s) * Math.sin(v.y * 3.7 + s * 1.7) + 0.09 * Math.sin(v.z * 5.3 + s * 0.6) * Math.sin(v.x * 2.9 - s) + 0.05 * Math.sin(v.y * 9 + v.z * 7 + s) + (bi < 5 ? 0.035 * Math.sin(v.x * 15 + s) * Math.sin(v.z * 14 - s) : 0);
      n.copy(v); v.multiplyScalar(r * d); v.y *= 0.88; v.add(o.set(x, y, z));
      n.multiplyScalar(0.55).addScaledVector(o.set(v.x, v.y - cy, v.z).normalize(), 0.45).normalize();
      const c = tone * (0.9 + 0.1 * n.y);
      pos.push(v.x, v.y, v.z); nrm.push(n.x, n.y, n.z); col.push(c, c, c);
    }
  });
  const base = G.p.length / 3;
  for (let i = 0; i < pos.length / 3; i++) { G.p.push(pos[3 * i], pos[3 * i + 1], pos[3 * i + 2]); G.n.push(nrm[3 * i], nrm[3 * i + 1], nrm[3 * i + 2]); G.c.push(col[3 * i], col[3 * i + 1], col[3 * i + 2]); G.uv.push(0, 0); G.i.push(base + i); }
  return G.build();
}
/** 树池：人行道上的一圈石边 + 里面的土 */
export function treePit() {
  const G = new Geo(), ST = lin('#b9b4a8'), SOIL = lin('#5a4636'), S = 0.7, W = 0.1;
  G.aabb(-S, 0, -S, S, 0.045, -S + W, ST); G.aabb(-S, 0, S - W, S, 0.045, S, ST); G.aabb(-S, 0, -S + W, -S + W, 0.045, S - W, ST); G.aabb(S - W, 0, -S + W, S, 0.045, S - W, ST);
  G.quadN([[-S + W, 0.02, -S + W], [S - W, 0.02, -S + W], [S - W, 0.02, S - W], [-S + W, 0.02, S - W]], [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]], SOIL);
  return G.build();
}

/** 路灯：旋转成型的灯座和锥形灯杆 + 一根弯臂 + 眼镜蛇灯头。底在原点，灯臂伸向 +x */
export function lampPost() {
  const G = new Geo(), POLE = lin('#7f8892'), HEAD = lin('#565e69'), GLOW = [1.6, 1.5, 1.15];
  G.lathe([[0.21, 0], [0.21, 0.05], [0.15, 0.09], [0.135, 0.42], [0.1, 0.52], [0.085, 0.6], [0.058, 7.6]], 0, 0, 8, POLE);
  const arm = []; for (let i = 0; i <= 7; i++) { const a = i / 7 * 1.3; arm.push([Math.sin(a) * 2.0, 7.55 + (1 - Math.cos(a)) * 0.95, 0]); }
  G.pipe(arm, arm.map((_, i) => 0.056 - i * 0.002), 6, POLE);
  const e = arm[arm.length - 1];
  G.ellipsoid(e[0] + 0.32, e[1] - 0.01, 0, 0.44, 0.085, 0.17, HEAD, 5, 8); G.ellipsoid(e[0] + 0.36, e[1] - 0.06, 0, 0.3, 0.045, 0.12, GLOW, 4, 8);
  return G.build();
}

/** 消防栓：旋转成型的栓体 + 三个出水口 */
export function hydrant() {
  const G = new Geo(), RED = lin('#c9382c'), CAP = lin('#d9d4c8');
  G.lathe([[0.165, 0], [0.165, 0.045], [0.165, 0.045], [0.118, 0.07], [0.108, 0.44], [0.108, 0.44], [0.135, 0.46], [0.135, 0.52], [0.135, 0.52], [0.105, 0.56], [0.08, 0.64], [0.035, 0.685], [0.035, 0.685], [0.03, 0.73], [0, 0.735]], 0, 0, 12, RED);
  G.pipe([[0, 0.34, 0.09], [0, 0.34, 0.19]], 0.052, 8, RED, true); G.pipe([[0, 0.34, 0.19], [0, 0.34, 0.215]], 0.06, 8, CAP, true);
  G.pipe([[0, 0.34, -0.09], [0, 0.34, -0.19]], 0.052, 8, RED, true); G.pipe([[0, 0.34, -0.19], [0, 0.34, -0.215]], 0.06, 8, CAP, true);
  G.pipe([[0.09, 0.32, 0], [0.2, 0.32, 0]], 0.066, 8, RED, true); G.pipe([[0.2, 0.32, 0], [0.225, 0.32, 0]], 0.074, 8, CAP, true);
  return G.build();
}

/** 行人：腿、躯干、手臂、头。脚底在 y = 0，面朝 +x，高约 1.72 米。上衣是中性灰（乘实例颜色），裤子、皮肤、头发是固定颜色 */
export function pedModel() {
  const G = new Geo(), PANTS = lin('#3a4252'), SKIN = lin('#d9a588'), HAIR = lin('#3a2a22'), SHOE = lin('#26262a'), T = [1, 1, 1];
  for (const s of [-1, 1]) {
    G.pipe([[0.0, 0.88, 0.09 * s], [0.01, 0.48, 0.095 * s], [0.0, 0.07, 0.1 * s]], [0.085, 0.068, 0.055], 7, PANTS);
    G.ellipsoid(0.04, 0.04, 0.1 * s, 0.12, 0.045, 0.055, SHOE, 4, 8);
    G.pipe([[0.0, 1.4, 0.2 * s], [-0.01, 1.14, 0.225 * s], [0.03, 0.9, 0.22 * s]], [0.055, 0.045, 0.04], 6, T);
    G.ellipsoid(0.035, 0.86, 0.22 * s, 0.04, 0.05, 0.035, SKIN, 4, 6);
  }
  G.lathe([[0.15, 0.84], [0.165, 0.95], [0.155, 1.12], [0.185, 1.34], [0.17, 1.43], [0.07, 1.47], [0.05, 1.5]], 0, 0, 10, T);
  G.ellipsoid(0, 1.6, 0, 0.1, 0.12, 0.095, SKIN, 6, 10); G.ellipsoid(-0.02, 1.645, 0, 0.105, 0.09, 0.1, HAIR, 5, 10);
  return G.build();
}
