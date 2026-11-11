// 地标：照着公开照片手工搭的几个本地标志物，画风和别的东西一致（平涂色块 + 少量贴图）。
// Colgate 大钟、Pulaski Skyway 过河段的钢桁架、Journal Square 的 Loew's 剧院立面、Grove St 的 PATH 站入口。
// 位置用经纬度定，摆之前会避开路和楼。返回 [{ x, z, far, g }]，由 world 按距离开关。
import * as THREE from 'three';
import { pointAt, segY } from '../sim/map.js';
import { Geo, lin } from './geo.js';
import { toonMat } from './toon.js';

const UP = [0, 1, 0];
const canvasTex = (w, h, draw) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };

export function buildLandmarks(map, parent, occupy) {
  const o = map.raw.origin, at = (lat, lon) => [(lon - o.lon) * o.kx, -(lat - o.lat) * o.kz], out = [];
  const inMap = (x, z) => Math.abs(x) < map.half.x - 30 && Math.abs(z) < map.half.z - 30;
  // 水面栅格（地图数据里是按行的游程编码）
  const wt = map.raw.water, wm = wt ? new Uint8Array(wt.w * wt.h) : null;
  if (wt) { let k = 0; for (let j = 0; j < wt.h; j++) { let x = 0, on = 0; while (x < wt.w) { const n = wt.rle[k++]; if (on) wm.fill(1, j * wt.w + x, j * wt.w + x + n); x += n; on ^= 1; } if (on) k++; } }
  const isWater = (x, z) => { if (!wt) return false; const i = Math.floor((x - wt.x0) / wt.cell), j = Math.floor((z - wt.z0) / wt.cell); return i >= 0 && j >= 0 && i < wt.w && j < wt.h && wm[j * wt.w + i] === 1; };
  const LOC = {};
  /** (x, z) 附近找一块空地：离路边、离楼都至少 clear 米，不在水里 */
  const freeSpot = (x, z, clear, reach = 70) => {
    for (let r = 0; r <= reach; r += 4) for (let a = 0; a < (r ? 12 : 1); a++) {
      const px = x + Math.cos(a * Math.PI / 6) * r, pz = z + Math.sin(a * Math.PI / 6) * r, l = map.locate(px, pz, LOC);
      if (isWater(px, pz) || (l.seg && l.d - l.seg.halfW < clear) || map.bldDist(px, pz, -1, clear + 2) < clear) continue;
      return [px, pz];
    }
    return null;
  };
  const solid = toonMat({ vertexColors: true });
  const finish = (x, z, far, G, extras = []) => {
    const g = new THREE.Group(), m = new THREE.Mesh(G.build(), solid); m.castShadow = true; m.receiveShadow = true; g.add(m);
    for (const e of extras) g.add(e);
    g.traverse(q => { q.matrixAutoUpdate = false; }); parent.add(g); g.updateMatrixWorld(true); out.push({ x, z, far, g });
  };
  /** 一张贴图的竖直面板：中心 c，宽 w、高 h，朝 (nx, nz)。横向按“面对着它看时从左到右”排，字不会反 */
  const panel = (tex, c, w, h, nx, nz, opt = {}) => {
    const ux = nz, uz = -nx, G = new Geo(), a = [c[0] - ux * w / 2, c[1] - h / 2, c[2] - uz * w / 2], b = [c[0] + ux * w / 2, c[1] - h / 2, c[2] + uz * w / 2];
    G.quadN([a, b, [b[0], b[1] + h, b[2]], [a[0], a[1] + h, a[2]]], [[nx, 0, nz], [nx, 0, nz], [nx, 0, nz], [nx, 0, nz]], [1, 1, 1], [[0, 0], [1, 0], [1, 1], [0, 1]]);
    const m = new THREE.Mesh(G.build(), toonMat({ map: tex, vertexColors: true, alphaTest: 0.5, ...opt })); m.receiveShadow = true; return m;
  };

  // ---------- Colgate 大钟：八角形钟面朝东对着哈德逊河，下面一块红色招牌，钢架立在地上 ----------
  {
    const [x0, z0] = at(40.712, -74.0338), spot = inMap(x0, z0) && freeSpot(x0, z0, 9);
    if (spot) {
      const [x, z] = spot, G = new Geo(), STEEL = lin('#6f7780'), DARK = lin('#3d434b'), R = 7.6, CY = 14.6, D = 1.1;
      // 钢架：四根立柱 + 斜撑 + 钟背后的格构
      for (const k of [-6.2, -2.1, 2.1, 6.2]) { G.box(x - 0.9, 3.4, z + k, 0.45, 6.8, 0.45, 0, STEEL); G.tube([x - 3.6, 0, z + k], [x - 1.1, 6.6, z + k], 0.16, 0.16, 4, STEEL); }
      for (const y of [2.2, 6.6]) G.box(x - 0.9, y, z, 0.35, 0.35, 12.8, 0, STEEL);
      for (const k of [-4.5, 0, 4.5]) G.tube([x - 0.9, 6.8, z + k], [x - 0.9, CY + R * 0.7, z + k], 0.2, 0.2, 4, STEEL);
      for (const y of [CY - 4, CY, CY + 4]) G.box(x - 0.9, y, z, 0.3, 0.3, 11, 0, STEEL);
      // 钟的八角形侧边（有厚度）和背面
      const oct = []; for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; oct.push([Math.sin(a) * R, Math.cos(a) * R]); }
      for (let i = 0; i < 8; i++) { const p = oct[i], q = oct[(i + 1) % 8], ny = (p[1] + q[1]) / 2, nz = (p[0] + q[0]) / 2, l = Math.hypot(ny, nz), n = [0, ny / l, nz / l]; G.quadN([[x, CY + p[1], z + p[0]], [x, CY + q[1], z + q[0]], [x - D, CY + q[1], z + q[0]], [x - D, CY + p[1], z + p[0]]], [n, n, n, n], DARK); }
      for (let i = 1; i < 7; i++) G.quadN([[x - D, CY + oct[0][1], z + oct[0][0]], [x - D, CY + oct[i][1], z + oct[i][0]], [x - D, CY + oct[i + 1][1], z + oct[i + 1][0]], [x - D, CY + oct[i + 1][1], z + oct[i + 1][0]]], [[-1, 0, 0], [-1, 0, 0], [-1, 0, 0], [-1, 0, 0]], DARK);
      G.box(x - 0.45, 4.6, z, 0.5, 3.8, 16.4, 0, DARK);      // 招牌的底板
      const face = canvasTex(512, 512, (c, S) => {
        c.translate(S / 2, S / 2); c.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; c[i ? 'lineTo' : 'moveTo'](Math.sin(a) * 250, -Math.cos(a) * 250); } c.closePath();
        c.fillStyle = '#2f343b'; c.fill(); c.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; c[i ? 'lineTo' : 'moveTo'](Math.sin(a) * 232, -Math.cos(a) * 232); } c.closePath(); c.fillStyle = '#f6f4ee'; c.fill();
        c.fillStyle = '#c8202c'; for (let i = 0; i < 12; i++) { c.save(); c.rotate(i * Math.PI / 6); c.fillRect(-9, -212, 18, i % 3 ? 44 : 62); c.restore(); }
        c.fillStyle = '#20242a'; c.save(); c.rotate(-Math.PI / 3 + 0.07); c.fillRect(-9, -128, 18, 150); c.restore(); c.save(); c.rotate(Math.PI / 3 - 0.2); c.fillRect(-6, -196, 12, 226); c.restore();      // 十点十分左右
        c.beginPath(); c.arc(0, 0, 16, 0, 7); c.fill();
      });
      const sign = canvasTex(1024, 256, (c, W, H) => { c.fillStyle = '#d3202d'; c.fillRect(0, 0, W, H); c.fillStyle = '#ffffff'; c.font = 'italic 800 190px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('Colgate', W / 2, H / 2 + 8); });
      finish(x, z, 760, G, [panel(face, [x + 0.02, CY, z], R * 2, R * 2, 1, 0), panel(sign, [x - 0.18, 4.6, z], 16, 3.6, 1, 0)]);
      occupy(x, z, 9);
    }
  }

  // ---------- Grove St 的 PATH 站入口：广场上的玻璃亭子，蓝色的站名带 ----------
  {
    const [x0, z0] = at(40.71965, -74.04315), spot = inMap(x0, z0) && freeSpot(x0, z0, 5.5, 50);
    if (spot) {
      const [x, z] = spot, l = map.locate(x, z, LOC), P = {}; pointAt(l.seg, l.s, P);
      const h = Math.atan2(P.dz, P.dx), c = Math.cos(h), s = Math.sin(h), G = new Geo(), FR = lin('#aeb6bf'), ROOF = lin('#e9edf0'), BLUE = lin('#1f4f9c'), W = 7.2, Dp = 3.6, HT = 3.3;
      const L = (lx, ly, lz) => [x + lx * c - lz * s, ly, z + lx * s + lz * c];
      for (const lx of [-W / 2, 0, W / 2]) for (const lz of [-Dp / 2, Dp / 2]) { const p = L(lx, HT / 2, lz); G.box(p[0], p[1], p[2], 0.16, HT, 0.16, h, FR); }
      { const p = L(0, HT + 0.14, 0); G.box(p[0], p[1], p[2], W + 1.6, 0.28, Dp + 1.6, h, ROOF, ROOF); const q = L(0, HT - 0.32, 0); G.box(q[0], q[1], q[2], W + 0.3, 0.62, Dp + 0.3, h, BLUE, BLUE); const b = L(0, 0.1, 0); G.box(b[0], b[1], b[2], W + 0.2, 0.2, Dp + 0.2, h, lin('#8d939b')); }
      // 楼梯口的栏板和扶手
      { const p = L(-0.6, 0.55, 0); G.box(p[0], p[1], p[2], W - 2.2, 1.1, 0.12, h, FR); }
      const gG = new Geo(); for (const lz of [-Dp / 2, Dp / 2]) { const a = L(-W / 2, 0.2, lz), b = L(W / 2, 0.2, lz), n = [-s * Math.sign(lz), 0, c * Math.sign(lz)]; gG.quadN([a, b, [b[0], HT - 0.6, b[2]], [a[0], HT - 0.6, a[2]]], [n, n, n, n], [1, 1, 1]); }
      { const a = L(-W / 2, 0.2, -Dp / 2), b = L(-W / 2, 0.2, Dp / 2), n = [-c, 0, -s]; gG.quadN([a, b, [b[0], HT - 0.6, b[2]], [a[0], HT - 0.6, a[2]]], [n, n, n, n], [1, 1, 1]); }
      const glass = new THREE.Mesh(gG.build(), toonMat({ color: new THREE.Color().setRGB(0.42, 0.55, 0.66), transparent: true, depthWrite: false, glass: 1, glassAlpha: 0.22, side: THREE.DoubleSide }));
      const tex = canvasTex(1024, 96, (cx, W2, H2) => { cx.fillStyle = '#1f4f9c'; cx.fillRect(0, 0, W2, H2); cx.fillStyle = '#fff'; cx.textBaseline = 'middle'; cx.font = '800 64px Arial, sans-serif'; cx.textAlign = 'left'; cx.fillText('PATH', 40, H2 / 2 + 3); cx.font = '600 50px Arial, sans-serif'; cx.textAlign = 'right'; cx.fillText('Grove Street', W2 - 40, H2 / 2 + 3); });
      const ex = [glass]; for (const sg of [-1, 1]) { const p = L(0, HT - 0.32, sg * (Dp / 2 + 0.16)); ex.push(panel(tex, p, W, 0.6, -s * sg, c * sg)); }
      finish(x, z, 420, G, ex); occupy(x, z, 5);
    }
  }

  // ---------- Loew's Jersey 剧院：Journal Square 朝 JFK Blvd 的那面米色陶砖立面，顶上有钟，下面是雨棚和灯箱 ----------
  {
    const [x0, z0] = at(40.7319, -74.0633);
    let best = null;
    if (inMap(x0, z0)) map.raw.buildings.forEach((b, bi) => { const B = map.buildings[bi]; if (!B || B.skip) return; const d = Math.hypot((B.x0 + B.x1) / 2 - x0, (B.z0 + B.z1) / 2 - z0) - (/Loew/i.test(b.n || '') ? 300 : 0); if (d < 90 && (!best || d < best.d)) best = { d, b, B }; });
    if (best) {
      // 找朝着大街、最长的那面墙
      const pts = best.b.pts, n = pts.length / 2; let area = 0; for (let i = 0; i < n; i++) { const j = (i + 1) % n; area += pts[2 * i] * pts[2 * j + 1] - pts[2 * j] * pts[2 * i + 1]; }
      let wall = null;
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, ax = pts[2 * i], az = pts[2 * i + 1], bx = pts[2 * j], bz = pts[2 * j + 1], L = Math.hypot(bx - ax, bz - az); if (L < 9) continue;
        let nx = -(bz - az) / L, nz = (bx - ax) / L; if (area > 0) { nx = -nx; nz = -nz; }
        const mx = (ax + bx) / 2, mz = (az + bz) / 2, l = map.locate(mx + nx * 6, mz + nz * 6, LOC); if (!l.seg) continue;
        const dd = l.d - l.seg.halfW, score = L - dd * 3 + (/Kennedy/i.test(l.seg.name || '') ? 40 : 0);
        if (dd < 14 && map.bldDist(mx + nx * 1.5, mz + nz * 1.5, best.B.i, 3) > 1 && (!wall || score > wall.score)) wall = { score, mx, mz, nx, nz, L, ux: (bx - ax) / L, uz: (bz - az) / L };
      }
      if (wall) {
        const { mx, mz, nx, nz, ux, uz } = wall, W = Math.min(wall.L - 0.4, 30), HT = Math.max(best.b.h + 5, 27), HS = HT * 0.74, h = Math.atan2(nz, nx), G = new Geo();
        const TC = lin('#d9c6a0'), TC_D = lin('#bfa983'), TC_L = lin('#e8dabb'), DK = lin('#2a2622'), GOLD = lin('#e2b63a');
        const Lc = (u, y, d) => [mx + ux * u + nx * d, y, mz + uz * u + nz * d];      // u 沿墙，d 往街上
        const block = (u, y0, y1, w, d0, d1, col, top = col) => { const p = Lc(u, (y0 + y1) / 2, (d0 + d1) / 2); G.box(p[0], p[1], p[2], d1 - d0, y1 - y0, w, h, col, top); };
        block(0, 0, HS, W, 0.05, 0.9, TC);                                   // 两翼
        block(0, 0, HT, W * 0.44, 0.05, 1.5, TC_L);                          // 中间高起的一跨
        for (const y of [HS * 0.34, HS * 0.62, HS - 0.5]) block(0, y, y + 0.45, W + 0.3, 0.05, 1.15, TC_D);      // 腰线
        block(0, HT - 0.7, HT, W * 0.44 + 0.5, 0.05, 1.8, TC_D);
        for (const sg of [-1, 1]) {                                           // 两侧的小塔楼 + 尖顶
          const u = sg * W * 0.36; block(u, 0, HS + 4.2, W * 0.13, 0.05, 1.7, TC_L); block(u, HS + 4.2, HS + 4.8, W * 0.13 + 0.5, 0.05, 1.95, TC_D);
          const p = Lc(u, 0, 0.9); G.cyl(p[0], HS + 4.8, HS + 8.4, p[2], W * 0.045, 0.12, 6, TC_D, true);
          block(u, HS * 0.4, HS * 0.6, W * 0.05, 1.7, 1.74, DK);              // 塔楼上的窄窗
        }
        block(0, HS * 0.36, HS * 0.86, W * 0.2, 1.5, 1.54, DK);              // 中间的大花窗
        block(0, HS * 0.86, HS * 0.9, W * 0.24, 1.5, 1.7, TC_D);
        block(0, HT - 6.6, HT - 1.2, W * 0.17, 1.5, 1.54, lin('#5a4a3a'));  // 钟所在的拱形壁龛
        { const p = Lc(0, HT + 0.9, 0.8); G.cyl(p[0], HT, HT + 2.6, p[2], W * 0.05, 0.1, 6, TC_D, true); }
        // 雨棚：挑出街面的黑色大盒子，前沿一圈灯箱，两头是黄底的竖牌
        const MW = W * 0.86, MO = 4.2; block(0, 4.3, 5.9, MW, 0.9, MO, DK); block(0, 4.15, 4.3, MW + 0.3, 0.9, MO + 0.15, GOLD);
        for (let k = -3; k <= 3; k++) block(k * MW / 7.4, 0, 3.4, MW / 9.5, 0.9, 0.95, DK);      // 一排门
        const clock = canvasTex(256, 256, (c, S) => { c.translate(S / 2, S / 2); c.beginPath(); c.arc(0, 0, 122, 0, 7); c.fillStyle = '#8a6a2c'; c.fill(); c.beginPath(); c.arc(0, 0, 108, 0, 7); c.fillStyle = '#f7f2e4'; c.fill(); c.fillStyle = '#2a2622'; for (let i = 0; i < 12; i++) { c.save(); c.rotate(i * Math.PI / 6); c.fillRect(-4, -100, 8, 22); c.restore(); } c.save(); c.rotate(-1.0); c.fillRect(-5, -60, 10, 72); c.restore(); c.save(); c.rotate(0.8); c.fillRect(-3.5, -92, 7, 106); c.restore(); });
        const mq = canvasTex(1024, 256, (c, W2, H2) => { c.fillStyle = '#f4f1e6'; c.fillRect(0, 0, W2, H2); c.strokeStyle = '#2a2622'; c.lineWidth = 10; c.strokeRect(5, 5, W2 - 10, H2 - 10); c.fillStyle = '#2a2622'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '800 96px Arial, sans-serif'; c.fillText("LOEW'S JERSEY", W2 / 2, 92); c.font = '700 56px Arial, sans-serif'; c.fillText('JOURNAL SQUARE', W2 / 2, 190); });
        const side = canvasTex(256, 256, (c, S) => { c.fillStyle = '#e9b82c'; c.fillRect(0, 0, S, S); c.fillStyle = '#7a1414'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = 'italic 800 86px Georgia, serif'; c.fillText("Loew's", S / 2, 84); c.fillText('Jersey', S / 2, 178); });
        const ex = [panel(clock, Lc(0, HT - 3.9, 1.6), 3.6, 3.6, nx, nz), panel(mq, Lc(0, 5.1, MO + 0.03), MW - 6.4, 1.5, nx, nz)];
        for (const sg of [-1, 1]) { ex.push(panel(side, Lc(sg * (MW / 2 - 1.5), 5.1, MO + 0.03), 2.6, 1.5, nx, nz)); ex.push(panel(side, Lc(sg * (MW / 2 + 0.03), 5.1, 0.9 + (MO - 0.9) / 2), 2.6, 1.5, ux * sg, uz * sg)); }
        finish(mx, mz, 620, G, ex);
      }
    }
  }

  // ---------- Pulaski Skyway 过河的两段：黑色的悬臂钢桁架，车从桁架中间穿过去，桥墩处最高 ----------
  {
    const segs = map.segs.filter(s => s.high && /Pulaski Skyway/i.test(s.name || '')), st = [], P = {};
    for (const s of segs) for (let u = s.trimA; u <= s.len - s.trimB; u += 4) { pointAt(s, u, P); st.push({ x: P.x, z: P.z, dx: P.dx, dz: P.dz, y: segY(s, u), hw: s.halfW, w: isWater(P.x, P.z) }); }
    const clusters = [];
    for (const q of st) { if (!q.w) continue; let c = clusters.find(c => Math.hypot(c[0].x - q.x, c[0].z - q.z) < 520); if (!c) clusters.push(c = []); c.push(q); }
    const STEEL = lin('#2c3836'), PAN = 9;
    for (const cl of clusters) {
      if (cl.length < 8) continue;
      let cx = 0, cz = 0, dx = 0, dz = 0; for (const q of cl) { cx += q.x / cl.length; cz += q.z / cl.length; const sg = q.dx * cl[0].dx + q.dz * cl[0].dz < 0 ? -1 : 1; dx += q.dx * sg; dz += q.dz * sg; }
      const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
      let t0 = 1e9, t1 = -1e9; for (const q of cl) { const t = (q.x - cx) * dx + (q.z - cz) * dz; t0 = Math.min(t0, t); t1 = Math.max(t1, t); }
      const mid = (t0 + t1) / 2, half = (t1 - t0) / 2 + 110; cx += dx * mid; cz += dz * mid;
      const near = st.map(q => ({ t: (q.x - cx) * dx + (q.z - cz) * dz, l: (q.x - cx) * -dz + (q.z - cz) * dx, hw: q.hw, y: q.y })).filter(q => Math.abs(q.t) < half + 6 && Math.abs(q.l) < 45);
      const G = new Geo(), nodes = [];
      for (let t = -half; t <= half + 0.01; t += PAN) {
        let lo = 1e9, hi = -1e9, y = 0, n = 0; for (const q of near) if (Math.abs(q.t - t) < 4.5) { lo = Math.min(lo, q.l - q.hw); hi = Math.max(hi, q.l + q.hw); y += q.y; n++; }
        if (!n || hi - lo > 40) { nodes.push(null); continue; }
        y /= n; const u = Math.abs(t) / half, H = 7.5 + 14 * Math.exp(-(((u - 0.5) / 0.2) ** 2)), pt = (l, yy) => [cx + dx * t - dz * l, yy, cz + dz * t + dx * l];
        nodes.push({ Lb: pt(lo - 0.9, y + 0.2), Rb: pt(hi + 0.9, y + 0.2), Lt: pt(lo - 0.9, y + H), Rt: pt(hi + 0.9, y + H) });
      }
      const bar = (a, b, r = 0.26) => G.tube(a, b, r, r, 4, STEEL);
      nodes.forEach((a, k) => {
        if (!a) return; const b = nodes[k + 1];
        bar(a.Lb, a.Lt); bar(a.Rb, a.Rt); bar(a.Lt, a.Rt, 0.22);
        if (!b) return;
        bar(a.Lt, b.Lt, 0.36); bar(a.Rt, b.Rt, 0.36); bar(a.Lb, b.Lb, 0.36); bar(a.Rb, b.Rb, 0.36);
        if (k % 2) { bar(a.Lb, b.Lt); bar(a.Rb, b.Rt); bar(a.Lt, b.Rt, 0.18); } else { bar(a.Lt, b.Lb); bar(a.Rt, b.Rb); bar(a.Rt, b.Lt, 0.18); }
      });
      if (G.i.length) finish(cx, cz, half + 760, G);
    }
  }
  return out;
}
