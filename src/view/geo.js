// 攒顶点的小工具，所有程序化模型都用它。
import * as THREE from 'three';

export class Geo {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; this.i = []; }
  /** 平面四边形，法线按绕向算（配双面材质用） */
  quad(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, col, uv) {
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = dx - ax, vy = dy - ay, vz = dz - az;
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const k = this.p.length / 3;
    this.p.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
    for (let q = 0; q < 4; q++) { this.n.push(nx, ny, nz); this.c.push(col[0], col[1], col[2]); }
    if (uv) this.uv.push(uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]);
    else this.uv.push(ax, az, bx, bz, cx, cz, dx, dz);       // 默认用世界坐标当 UV
    this.i.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  /** 地面上的四边形（y 固定），UV 用世界坐标 × s */
  flat(ax, az, bx, bz, cx, cz, dx, dz, y, col, s = 1) {
    // 保证从上往下看是逆时针，否则双面材质会把法线翻到朝下，路面发黑
    if ((bz - az) * (cx - ax) - (bx - ax) * (cz - az) < 0) { let t = bx; bx = dx; dx = t; t = bz; bz = dz; dz = t; }
    const k = this.p.length / 3;
    this.p.push(ax, y, az, bx, y, bz, cx, y, cz, dx, y, dz);
    for (let q = 0; q < 4; q++) { this.n.push(0, 1, 0); this.c.push(col[0], col[1], col[2]); }
    this.uv.push(ax * s, az * s, bx * s, bz * s, cx * s, cz * s, dx * s, dz * s);
    this.i.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  /** 盒子绕 y 轴转 rot（本地 x 轴转到 (cos,sin)） */
  box(cx, cy, cz, sx, sy, sz, rot, col, top = col) {
    const c = Math.cos(rot), s = Math.sin(rot), hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const P = (lx, ly, lz) => [cx + lx * c - lz * s, cy + ly, cz + lx * s + lz * c];
    const v = [P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, -hy, hz), P(-hx, -hy, hz), P(-hx, hy, -hz), P(hx, hy, -hz), P(hx, hy, hz), P(-hx, hy, hz)];
    const N = (lx, ly, lz) => [lx * c - lz * s, ly, lx * s + lz * c];
    const f = (a, b, d, e, n, k) => this.quadN([v[a], v[b], v[d], v[e]], [n, n, n, n], k);
    f(0, 1, 5, 4, N(0, 0, -1), col); f(1, 2, 6, 5, N(1, 0, 0), col); f(2, 3, 7, 6, N(0, 0, 1), col); f(3, 0, 4, 7, N(-1, 0, 0), col); f(4, 5, 6, 7, [0, 1, 0], top); f(3, 2, 1, 0, [0, -1, 0], col);
  }
  /** 四个点各带法线的四边形。绕向自动调成和法线一致，所以单面材质也能用 */
  quadN(P, N, col, uv) {
    const [a, b, c, d] = P;
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - a[0], vy = d[1] - a[1], vz = d[2] - a[2];
    let gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
    if (gx === 0 && gy === 0 && gz === 0) { const wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2]; gx = uy * wz - uz * wy; gy = uz * wx - ux * wz; gz = ux * wy - uy * wx; }
    const sx = N[0][0] + N[1][0] + N[2][0] + N[3][0], sy = N[0][1] + N[1][1] + N[2][1] + N[3][1], sz = N[0][2] + N[1][2] + N[2][2] + N[3][2];
    const order = gx * sx + gy * sy + gz * sz < 0 ? [0, 3, 2, 1] : [0, 1, 2, 3];
    const k = this.p.length / 3;
    for (const q of order) { this.p.push(P[q][0], P[q][1], P[q][2]); this.n.push(N[q][0], N[q][1], N[q][2]); this.c.push(col[0], col[1], col[2]); if (uv) this.uv.push(uv[q][0], uv[q][1]); else this.uv.push(0, 0); }
    this.i.push(k, k + 1, k + 2, k, k + 2, k + 3);
  }
  /**
   * 蒙皮：pts[i][k] 是一张点阵，相邻四点连成面，法线按相邻点差分算（平滑着色）。
   * closed: 每一圈首尾相接。orient(p, i, k) 返回“外面”的大致方向，用来定法线朝向。color(i, k) 返回这一格的颜色。
   */
  loft(pts, { closed = false, orient, color }) {
    const I = pts.length, K = pts[0].length, nr = [];
    for (let i = 0; i < I; i++) {
      nr.push([]);
      for (let k = 0; k < K; k++) {
        const a = pts[Math.max(0, i - 1)][k], b = pts[Math.min(I - 1, i + 1)][k];
        const c = pts[i][closed ? (k + K - 1) % K : Math.max(0, k - 1)], d = pts[i][closed ? (k + 1) % K : Math.min(K - 1, k + 1)];
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = d[0] - c[0], vy = d[1] - c[1], vz = d[2] - c[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx, l = Math.hypot(nx, ny, nz);
        const o = orient(pts[i][k], i, k), ol = Math.hypot(o[0], o[1], o[2]) || 1;
        if (l < 1e-9) { nx = o[0] / ol; ny = o[1] / ol; nz = o[2] / ol; }
        else { nx /= l; ny /= l; nz /= l; if (nx * o[0] + ny * o[1] + nz * o[2] < 0) { nx = -nx; ny = -ny; nz = -nz; } }
        nr[i].push([nx, ny, nz]);
      }
    }
    const kEnd = closed ? K : K - 1;
    for (let i = 0; i < I - 1; i++) for (let k = 0; k < kEnd; k++) {
      const k2 = (k + 1) % K;
      this.quadN([pts[i][k], pts[i + 1][k], pts[i + 1][k2], pts[i][k2]], [nr[i][k], nr[i + 1][k], nr[i + 1][k2], nr[i][k2]], color(i, k));
    }
  }
  /** 竖直的圆柱 / 圆台（可带顶盖） */
  cyl(x, y0, y1, z, r0, r1, seg, col, cap = false) {
    const ring = (y, r) => { const a = []; for (let k = 0; k < seg; k++) { const t = k / seg * Math.PI * 2; a.push([x + Math.cos(t) * r, y, z + Math.sin(t) * r]); } return a; };
    this.loft([ring(y0, r0), ring(y1, r1)], { closed: true, orient: (p) => [p[0] - x, 0, p[2] - z], color: () => col });
    if (cap) { const top = ring(y1, r1); for (let k = 1; k < seg - 1; k++) this.quadN([top[0], top[k], top[k + 1], top[k + 1]], [[0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]], col); }
  }
  /** 任意两点之间的圆管（n 边形截面） */
  tube(a, b, r0, r1, seg, col) {
    const d = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
    const s1 = new THREE.Vector3().crossVectors(d, Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)).normalize(), s2 = new THREE.Vector3().crossVectors(d, s1);
    const ring = (p, r) => { const o = []; for (let k = 0; k < seg; k++) { const t = k / seg * Math.PI * 2, c = Math.cos(t) * r, s = Math.sin(t) * r; o.push([p[0] + s1.x * c + s2.x * s, p[1] + s1.y * c + s2.y * s, p[2] + s1.z * c + s2.z * s]); } return o; };
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    this.loft([ring(a, r0), ring(b, r1)], { closed: true, orient: (p, i) => { const q = i ? b : a; return [p[0] - q[0], p[1] - q[1], p[2] - q[2]]; }, color: () => col });
    return mid;
  }
  /** 椭球 */
  ellipsoid(cx, cy, cz, rx, ry, rz, col, su = 8, sv = 10) {
    const pts = [];
    for (let i = 0; i <= su; i++) { const a = -Math.PI / 2 + Math.PI * i / su, row = []; for (let k = 0; k < sv; k++) { const t = k / sv * Math.PI * 2; row.push([cx + Math.sin(a) * rx, cy + Math.cos(a) * Math.cos(t) * ry, cz + Math.cos(a) * Math.sin(t) * rz]); } pts.push(row); }
    this.loft(pts, { closed: true, orient: (p) => [(p[0] - cx) / rx / rx, (p[1] - cy) / ry / ry, (p[2] - cz) / rz / rz], color: () => col });
  }
  /** 轴对齐的盒子，给两个对角 */
  aabb(x0, y0, z0, x1, y1, z1, col, top = col) { this.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), 0, col, top); }
  /**
   * 轮廓挤出：prof 是 (z, y) 平面里的一圈封闭轮廓，沿 x 从 x0 拉到 x1。
   * 窗台、檐口、台阶这类“截面不变的长条”都用它；smooth = 相邻面的法线取平均（圆角用）。
   */
  extrudeX(prof, x0, x1, col, caps = true, smooth = false) {
    const n = prof.length; let area = 0;
    for (let i = 0; i < n; i++) { const p = prof[i], q = prof[(i + 1) % n]; area += p[0] * q[1] - q[0] * p[1]; }
    const sg = area > 0 ? 1 : -1, en = [];
    for (let i = 0; i < n; i++) { const p = prof[i], q = prof[(i + 1) % n], dz = q[0] - p[0], dy = q[1] - p[1], l = Math.hypot(dz, dy) || 1; en.push([0, -dz / l * sg, dy / l * sg]); }
    const avg = (a, b) => { const y = a[1] + b[1], z = a[2] + b[2], l = Math.hypot(y, z) || 1; return [0, y / l, z / l]; };
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, p = prof[i], q = prof[j]; let na = en[i], nb = en[i];
      if (smooth) { na = avg(en[(i + n - 1) % n], en[i]); nb = avg(en[i], en[j]); }
      this.quadN([[x0, p[1], p[0]], [x1, p[1], p[0]], [x1, q[1], q[0]], [x0, q[1], q[0]]], [na, na, nb, nb], col);
    }
    if (caps) {
      const tris = THREE.ShapeUtils.triangulateShape(prof.map(p => new THREE.Vector2(p[0], p[1])), []);
      for (const [x, nx] of [[x0, -1], [x1, 1]]) { const nn = [nx, 0, 0]; for (const t of tris) { const P = t.map(k => [x, prof[k][1], prof[k][0]]); this.quadN([P[0], P[1], P[2], P[2]], [nn, nn, nn, nn], col); } }
    }
  }
  /**
   * 旋转成型：prof 是 [半径, 高度] 的一串点，从下往上写（外表面在右手边），绕竖轴转一圈。
   * 想要硬折边就把那个点写两遍。col 可以是函数 (i, k) => 颜色。
   */
  lathe(prof, cx, cz, seg, col, y0 = 0) {
    const rings = prof.map(([r, y]) => { const a = []; for (let k = 0; k < seg; k++) { const t = k / seg * Math.PI * 2; a.push([cx + Math.cos(t) * r, y0 + y, cz + Math.sin(t) * r]); } return a; });
    const pn = prof.map((p, i) => { const a = prof[Math.max(0, i - 1)], b = prof[Math.min(prof.length - 1, i + 1)]; return [b[1] - a[1], -(b[0] - a[0])]; });
    this.loft(rings, { closed: true, orient: (p, i, k) => { const t = k / seg * Math.PI * 2; return [Math.cos(t) * pn[i][0], pn[i][1], Math.sin(t) * pn[i][0]]; }, color: typeof col === 'function' ? col : () => col });
  }
  /** 沿折线走的圆管（弯头处连续）。r 可以是数，也可以是每个点一个半径 */
  pipe(pts, r, seg, col, cap = false) {
    const n = pts.length, P = pts.map(a => new THREE.Vector3(a[0], a[1], a[2])), rings = [], T = new THREE.Vector3(), B = new THREE.Vector3(), N = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      T.subVectors(P[Math.min(n - 1, i + 1)], P[Math.max(0, i - 1)]).normalize();
      if (i === 0) N.set(0, 1, 0);
      N.addScaledVector(T, -N.dot(T)); if (N.lengthSq() < 1e-6) { N.set(1, 0, 0).addScaledVector(T, -T.x); if (N.lengthSq() < 1e-6) N.set(0, 0, 1); }
      N.normalize(); B.crossVectors(T, N);
      const rr = typeof r === 'number' ? r : r[i], ring = [];
      for (let k = 0; k < seg; k++) { const t = k / seg * Math.PI * 2, c = Math.cos(t) * rr, s = Math.sin(t) * rr; ring.push([P[i].x + N.x * c + B.x * s, P[i].y + N.y * c + B.y * s, P[i].z + N.z * c + B.z * s]); }
      rings.push(ring);
    }
    this.loft(rings, { closed: true, orient: (p, i) => [p[0] - pts[i][0], p[1] - pts[i][1], p[2] - pts[i][2]], color: () => col });
    if (cap) for (const e of [0, n - 1]) {
      T.subVectors(P[e], P[e ? n - 2 : 1]).normalize(); const nn = [T.x, T.y, T.z], R = rings[e];
      for (let k = 1; k < seg - 1; k++) this.quadN([R[0], R[k], R[k + 1], R[k + 1]], [nn, nn, nn, nn], col);
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    return g;
  }
  get tris() { return this.i.length / 3; }
}
export const lin = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
