// 建筑立面：墙体按洞口分块（窗洞、门洞是真的开口，带侧壁），洞里摆零件库的实例。
// 近处（约 110 米内）画立体零件；远处洞口盖一张平的贴图卡片，墙体几何不变。
import * as THREE from 'three';
import { pointAt, hash } from '../sim/map.js';
import { Geo, lin } from './geo.js';
import { toonMat } from './toon.js';
import * as K from './kit.js';

const GROUND_H = 3.9, BCELL = 140, REVEAL = 0.2;
const N4 = (n) => [n, n, n, n], UPN = [0, 1, 0];
const mixW = (c, k) => [c[0] + (1 - c[0]) * k, c[1] + (1 - c[1]) * k, c[2] + (1 - c[2]) * k], mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

// 配色：大面积墙体用低饱和的砖红、米色、灰蓝；鲜艳的颜色只给招牌、雨棚和门
const PAL = {
  brick: ['#b06e58', '#a05f4d', '#b98567', '#c7a684', '#96614f', '#b9775d', '#a67c66', '#996b5a'].map(lin),
  siding: ['#d8d2c2', '#b7c2c7', '#c8b999', '#aab7a3', '#d3c0a6', '#92a4b0', '#e0dacc', '#c3a8a0', '#b9b3a3'].map(lin),
  stucco: ['#d6cebd', '#c7c0b1', '#dfd5c0', '#b9b5ac', '#cdbfa9', '#c4c9c6'].map(lin),
  glass: ['#8fb2cc', '#a3c2d6', '#7fa3c2', '#b4ccd9'].map(lin),
};
const TRIMS = ['#efe8d8', '#e3dccb', '#f4f0e6', '#4a3f38', '#3a3d42'].map(lin);
const ACCENTS = ['#b8483e', '#2f6a86', '#2f7257', '#cf9a3a', '#754163', '#2a476b', '#c06a36', '#34363c', '#3f8780', '#9e3f52'].map(lin);
const DOORS = ['#8f2f2a', '#27466f', '#2e5f48', '#2f2f33', '#3d7f86', '#6b4a32', '#b98a2e'].map(lin);
const ROOF = ['#8d949e', '#9a9fa6', '#84898f'].map(lin), STONE = lin('#d6cfbf'), STONE_D = lin('#b3ab9b'), UNIT = lin('#b9bfc6');
const NAMES = ['CAFE', 'DELI', 'PIZZA', 'BOOKS', 'BAKERY', 'BARBER', 'BODEGA', 'LAUNDRY', 'FLOWERS', 'PHARMACY', 'HARDWARE', 'RECORDS', 'TACOS', 'MARKET', 'BAGELS', 'NOODLES'];

const canvasTex = (w, h, draw) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
// 真实的店名、楼名、门牌号：每个建筑分块建的时候现画一张小贴图（分块卸掉时一起释放）
const FONT = (px) => `800 ${px}px "Arial Black", Arial, sans-serif`, meas = document.createElement('canvas').getContext('2d'), TI = new Map();
const textInfo = (str) => { let t = TI.get(str); if (!t) { meas.font = FONT(44); const w = meas.measureText(str).width, k = Math.min(1, 488 / w); TI.set(str, t = { str, px: 44 * k, w: w * k + 14, hp: Math.max(22, 44 * k * 1.35) }); } return t; };
const MAJOR = new Set(['primary', 'secondary', 'tertiary', 'trunk']);
const rnd = (seed) => () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };

// ---------- 墙面贴图（都接近白色，乘上顶点色才是墙的颜色） ----------
function wallTextures() {
  const brick = canvasTex(256, 256, (c, S) => {      // 1.6 米见方：每行 4 块砖，12 皮
    const r = rnd(11), bw = S / 4, bh = S / 12; c.fillStyle = '#fbf6ee'; c.fillRect(0, 0, S, S);
    for (let row = 0; row < 12; row++) for (let k = -1; k < 4; k++) {
      const v = 196 + Math.floor(r() * 44) - (r() < 0.12 ? 26 : 0), x = k * bw + (row % 2 ? bw / 2 : 0);
      c.fillStyle = `rgb(${v + 6},${v},${v - 4})`; c.fillRect(x + 1.5, row * bh + 1.5, bw - 3, bh - 3);
    }
  });
  const siding = canvasTex(64, 256, (c, W, H) => {   // 1.6 米高：8 条搭接木板，每条下沿一道阴影
    const bh = H / 8;
    for (let k = 0; k < 8; k++) { const g = c.createLinearGradient(0, k * bh, 0, (k + 1) * bh); g.addColorStop(0, '#ffffff'); g.addColorStop(0.8, '#ebe9e6'); g.addColorStop(0.86, '#a9a6a2'); g.addColorStop(1, '#8a8784'); c.fillStyle = g; c.fillRect(0, k * bh, W, bh); }
  });
  const stucco = canvasTex(256, 256, (c, S) => {     // 3.2 米见方：细颗粒 + 很淡的分缝
    const r = rnd(5); c.fillStyle = '#f1efec'; c.fillRect(0, 0, S, S);
    for (let i = 0; i < 2600; i++) { const v = r() > 0.5 ? 255 : 120; c.fillStyle = `rgba(${v},${v},${v},${r() * 0.07})`; const d = 1 + r() * 3; c.fillRect(r() * S, r() * S, d, d); }
    c.fillStyle = 'rgba(90,84,76,0.16)'; for (let k = 0; k < 4; k++) c.fillRect(0, k * S / 4, S, 1.5);
  });
  const curtain = canvasTex(256, 256, (c, S) => {    // 幕墙：一格 = 一层楼高 × 一个柱距，里面两扇玻璃 + 层间板
    const g = c.createLinearGradient(0, 0, 0, S); g.addColorStop(0, '#f4f9fc'); g.addColorStop(0.7, '#b9d2e2'); c.fillStyle = g; c.fillRect(0, 0, S, S);
    c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.moveTo(S * 0.15, S * 0.74); c.lineTo(S * 0.5, 0); c.lineTo(S * 0.72, 0); c.lineTo(S * 0.37, S * 0.74); c.fill();
    c.fillStyle = '#7e8a96'; c.fillRect(0, S * 0.74, S, S * 0.26); c.fillStyle = '#5d6772'; c.fillRect(0, S * 0.74, S, 4);
    c.fillStyle = '#e9edf0'; c.fillRect(0, 0, 7, S); c.fillRect(S - 7, 0, 7, S); c.fillRect(S / 2 - 3, 0, 6, S * 0.74); c.fillRect(0, S - 6, S, 6);
  });
  return { brick, siding, stucco, curtain };
}
const TEX_M = { brick: [1.6, 1.6], siding: [1.6, 1.6], stucco: [3.2, 3.2], glass: [3.4, 3.3] };

// ---------- 图集：窗玻璃（近）、整窗卡片（远）、店面卡片（远）、店名 ----------
function atlasTexture() {
  const S = 1024, T = 256, cv = document.createElement('canvas'); cv.width = cv.height = S; const c = cv.getContext('2d');
  // far = 远景卡片：把天空的反光直接画进去；近处的玻璃只画窗后的暗室内和窗帘，反光由材质按视角实时算
  const glass = (x, y, w, h, kind, far) => {
    const g = c.createLinearGradient(0, y, 0, y + h);
    if (far) { g.addColorStop(0, '#8fb4cf'); g.addColorStop(1, '#4d7394'); } else if (kind === 2) { g.addColorStop(0, '#1c2a39'); g.addColorStop(1, '#121c28'); } else { g.addColorStop(0, '#31465c'); g.addColorStop(1, '#1d2b3b'); }
    c.fillStyle = g; c.fillRect(x, y, w, h);
    if (kind === 1) { c.fillStyle = '#efe4cc'; c.fillRect(x, y, w * 0.3, h); c.fillRect(x + w * 0.7, y, w * 0.3, h); c.fillStyle = 'rgba(120,100,70,0.25)'; for (let k = 1; k < 4; k++) { c.fillRect(x + w * 0.3 * k / 4, y, 2, h); c.fillRect(x + w * 0.7 + w * 0.3 * k / 4, y, 2, h); } }
    if (kind === 3) { c.fillStyle = '#e9e2d2'; c.fillRect(x, y, w, h * 0.62); c.fillStyle = 'rgba(90,80,60,0.3)'; for (let k = 1; k < 12; k++) c.fillRect(x, y + h * 0.62 * k / 12, w, 2); }
    c.fillStyle = 'rgba(15,30,50,0.4)'; c.fillRect(x, y, w, h * 0.07);                    // 洞口上沿投下来的影子
  };
  for (let k = 0; k < 4; k++) {
    glass(k * T, 0, T, T, k);
    // 远景整窗：框 + 中横档 + 窗台，颜色留白，靠顶点色染
    const x = k * T, y = T; c.fillStyle = '#ffffff'; c.fillRect(x, y, T, T); glass(x + 16, y + 12, T - 32, T - 38, k, true);
    c.fillStyle = '#ffffff'; c.fillRect(x + 16, y + T * 0.48, T - 32, 9); c.fillRect(x + T / 2 - 3, y + 12, 6, T * 0.44);
    c.fillStyle = '#d8d2c6'; c.fillRect(x, y + T - 22, T, 22); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x, y + T - 26, T, 4);
  }
  // 店面橱窗、店门、住宅门（远景）
  const warm = (x, y, w, h) => { const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#6e86a0'); g.addColorStop(0.5, '#b89a78'); g.addColorStop(1, '#8a7260'); c.fillStyle = g; c.fillRect(x, y, w, h); c.fillStyle = 'rgba(255,255,255,0.22)'; c.beginPath(); c.moveTo(x + w * 0.2, y + h); c.lineTo(x + w * 0.5, y); c.lineTo(x + w * 0.68, y); c.lineTo(x + w * 0.38, y + h); c.fill(); };
  { const x = 0, y = 2 * T; c.fillStyle = '#ffffff'; c.fillRect(x, y, T, T); warm(x + 8, y + 8, T - 16, T * 0.8 - 8); c.fillStyle = '#ffffff'; c.fillRect(x + 8, y + T * 0.22, T - 16, 6); c.fillStyle = '#d0d0d0'; c.fillRect(x, y + T * 0.82, T, T * 0.18); }
  { const x = T, y = 2 * T; c.fillStyle = '#ffffff'; c.fillRect(x, y, T, T); warm(x + 8, y + 8, T - 16, T * 0.8 - 8); c.fillStyle = '#4a4038'; c.fillRect(x + T * 0.3, y + T * 0.24, T * 0.4, T * 0.76); c.fillStyle = '#b8b8b8'; c.fillRect(x + T * 0.33, y + T * 0.27, T * 0.34, T * 0.7); warm(x + T * 0.37, y + T * 0.31, T * 0.26, T * 0.5); c.fillStyle = '#d0d0d0'; c.fillRect(x, y + T * 0.82, T * 0.3, T * 0.18); c.fillRect(x + T * 0.7, y + T * 0.82, T * 0.3, T * 0.18); }
  { const x = 2 * T, y = 2 * T; c.fillStyle = '#e8e2d4'; c.fillRect(x, y, T, T); c.fillStyle = '#1c2c3e'; c.fillRect(x + 22, y + 10, T - 44, 36); c.fillStyle = '#cfcfcf'; c.fillRect(x + 22, y + 52, T - 44, T - 52); c.fillStyle = '#ffffff'; for (const [a, b] of [[0.16, 0.26], [0.54, 0.26], [0.16, 0.62], [0.54, 0.62]]) c.fillRect(x + T * a, y + T * b, T * 0.3, T * 0.3); }
  // 店名：白字，底是透明的
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fffaf0';
  NAMES.forEach((nm, i) => { const x = (i % 4) * T, y = 3 * T + Math.floor(i / 4) * 64; c.clearRect(x, y, T, 64); let px = 46; do { c.font = `800 ${px}px "Arial Black", Arial, sans-serif`; px -= 2; } while (c.measureText(nm).width > T - 22 && px > 18); c.fillText(nm, x + T / 2, y + 34); });
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const tile = (px, py, w, h, pad = 1.5) => { const u0 = (px + pad) / S, u1 = (px + w - pad) / S, v0 = 1 - (py + h - pad) / S, v1 = 1 - (py + pad) / S; return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]; };
  return { tex: t, glass: [0, 1, 2, 3].map(k => tile(k * T, 0, T, T, 3)), card: [0, 1, 2, 3].map(k => tile(k * T, T, T, T)), shopWin: tile(0, 2 * T, T, T), shopDoor: tile(T, 2 * T, T, T), resDoor: tile(2 * T, 2 * T, T, T), name: NAMES.map((_, i) => tile((i % 4) * T, 3 * T + Math.floor(i / 4) * 64, T, 64, 0.5)) };
}
function shopGlassTex() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 256; const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, 256); g.addColorStop(0, 'rgba(150,195,225,0.5)'); g.addColorStop(0.4, 'rgba(110,155,195,0.14)'); g.addColorStop(1, 'rgba(80,120,160,0.1)'); c.fillStyle = g; c.fillRect(0, 0, 256, 256);
  c.fillStyle = 'rgba(255,255,255,0.2)'; for (const [a, w] of [[40, 34], [96, 12]]) { c.beginPath(); c.moveTo(a, 256); c.lineTo(a + 110, 0); c.lineTo(a + 110 + w, 0); c.lineTo(a + w, 256); c.fill(); }
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/**
 * 生成所有建筑。返回 { lod: [{box, hi, lo}] }，由 world.updateLod 切换远近。
 * occupy(x, z, r)：登记人行道上被占掉的位置（门前台阶），后面种树、立杆时会避开。
 */
export function buildBuildings(map, group, occupy, isFree) {
  const texW = wallTextures(), A = atlasTexture(), bcells = new Map();
  const newGeos = () => ({ brick: new Geo(), siding: new Geo(), stucco: new Geo(), glass: new Geo(), trim: new Geo(), core: new Geo(), flat: new Geo(), card: new Geo(), pane: new Geo(), I: {}, lab: [] });
  const inPolyV = (pts, x, z) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a.y > z) !== (b.y > z) && x < (b.x - a.x) * (z - a.y) / (b.y - a.y) + a.x) c = !c; } return c; };
  const LOC = {}, PT = {}; let nWin = 0, nShop = 0, nNum = 0, nName = 0;
  const samples = { shop: [], stoop: [], win: [], num: [], name: [] };      // 出样板截图用：几种立面各记一些位置

  // 一栋楼的全部几何，写进它所在分块 C 的各个 Geo 里
  const genBuilding = (b, bi, C) => {
    const n = b.pts.length / 2, h = b.h, tall = h > 38, R = (k) => hash(bi * 7 + k);
    const pts = []; let area = 0, cx = 0, cz = 0;
    for (let i = 0; i < n; i++) { pts.push(new THREE.Vector2(b.pts[2 * i], b.pts[2 * i + 1])); cx += b.pts[2 * i] / n; cz += b.pts[2 * i + 1] / n; }
    for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; area += p.x * q.y - q.x * p.y; }
    if (area > 0) pts.reverse();                 // 统一绕向，墙面法线朝外
    const fa = Math.abs(area) / 2, gh = Math.min(GROUND_H, h * 0.6), small = fa < 170 && h < 15;
    // ---- 这栋楼的样式（全部由楼的编号决定，每次打开都一样） ----
    const plain = b.k === 'i', names = b.nm || null; let ni = 0, numDone = !b.no, nameDone = !b.n;
    const type = tall ? 'glass' : plain ? (R(1) < 0.6 ? 'stucco' : 'siding') : small ? (R(1) < 0.42 ? 'siding' : R(1) < 0.9 ? 'brick' : 'stucco') : (R(1) < 0.58 ? 'brick' : R(1) < 0.9 ? 'stucco' : 'siding');
    const col = PAL[type][Math.floor(R(2) * PAL[type].length)], G = C[type], [TW, TH] = TEX_M[type];
    const trim = type === 'siding' ? TRIMS[Math.floor(R(3) * 3)] : TRIMS[Math.floor(R(3) * TRIMS.length)];
    const wk = type === 'siding' ? (R(4) < 0.65 ? 'C' : 'A') : type === 'brick' ? (R(4) < 0.65 ? 'A' : 'B') : (R(4) < 0.6 ? 'B' : 'A');
    const [nomW, nomH] = K.KIT['win' + wk], bayW = (wk === 'B' ? 3.3 : wk === 'C' ? 3.1 : 2.7) + R(5) * 0.6, wwS = nomW * (0.95 + R(6) * 0.15);
    const winCol = wk === 'C' ? DOORS[Math.floor(R(7) * DOORS.length)] : trim, doorCol = DOORS[Math.floor(R(8) * DOORS.length)];
    // 哪面墙是店面：这栋楼里真有店（地图数据里有店名）或标了商业用途的一定是；没有任何信息的楼，只有临主干道的才可能是店，住宅街上基本都是住家
    const hs0 = hash(bi * 13 + 5), sy = gh / GROUND_H, shopWall = (I) => gh >= 3.3 && (names || b.k === 's' || (tall && b.k !== 'r') || (!b.k && (I.major ? hs0 < 0.5 : hs0 < 0.03)));
    const fl = h - gh >= 2.4 ? Math.max(1, Math.round((h - gh) / 3.25)) : 0, fh = fl ? (h - gh) / fl : 0;
    const en = pts.map((a, i) => { const c = pts[(i + 1) % n], L = a.distanceTo(c) || 1; return [-(c.y - a.y) / L, (c.x - a.x) / L]; });
    // 每面墙：open = 墙外不是别的楼；sw = 临街时到路缘的距离（不临街为 -1）；det = 离路近，值得开真窗洞
    const info = pts.map((a, i) => {
      const c = pts[(i + 1) % n], mx = (a.x + c.x) / 2, mz = (a.y + c.y) / 2, nx = en[i][0], nz = en[i][1];
      const open = map.bldDist(mx + nx * 1.0, mz + nz * 1.0, bi, 3) > 0.7; let sw = -1, det = false, major = false;
      if (open) { const l = map.locate(mx, mz, LOC); if (l.seg) { pointAt(l.seg, l.s, PT); if ((PT.x - mx) * nx + (PT.z - mz) * nz > 0.5) { const d = l.d - l.seg.halfW; if (d < 10) { sw = d; major = MAJOR.has(l.seg.cls); } det = d < 45; } } }
      return { open, sw, det, major };
    });
    // 拐角斜接用的单位偏移：mit 总是斜接；off 只沿露在外面的墙往外挑（贴着邻居的一侧齐平）
    const mit = pts.map((a, i) => { const n0 = en[(i + n - 1) % n], n1 = en[i]; let mx = n0[0] + n1[0], mz = n0[1] + n1[1]; const l = Math.hypot(mx, mz); if (l < 0.3) return [n1[0], n1[1]]; mx /= l; mz /= l; const k = 1 / Math.max(0.55, mx * n1[0] + mz * n1[1]); return [mx * k, mz * k]; });
    const off = pts.map((a, i) => { const i0 = (i + n - 1) % n, o0 = info[i0].open, o1 = info[i].open; return o0 && o1 ? mit[i] : o1 ? en[i] : o0 ? en[i0] : [0, 0]; });
    /** 沿楼的外轮廓扫一圈截面（檐口、腰线、女儿墙）。prof: [[往外挑多少, 高度], ...]，从墙面低处写到高处 */
    const sweep = (Gs, prof, c, want) => {
      const P = (k, d, y) => { const m = d > 0 ? off[k] : mit[k]; return [pts[k].x + m[0] * d, y, pts[k].y + m[1] * d]; };
      for (let i = 0; i < n; i++) {
        if (!want(i)) continue; const j = (i + 1) % n, e = en[i], tx = e[1], tz = -e[0];
        for (let q = 0; q < prof.length - 1; q++) {
          const [d0, y0] = prof[q], [d1, y1] = prof[q + 1]; let nd = y1 - y0, ny = -(d1 - d0); const l = Math.hypot(nd, ny) || 1; nd /= l; ny /= l;
          Gs.quadN([P(i, d0, y0), P(j, d0, y0), P(j, d1, y1), P(i, d1, y1)], N4([e[0] * nd, ny, e[1] * nd]), c);
        }
        for (const [k, other, s] of [[i, (i + n - 1) % n, -1], [j, j, 1]]) {      // 断头处封口
          if (want(other)) continue; const nn = [tx * s, 0, tz * s], p0 = P(k, prof[0][0], prof[0][1]);
          for (let q = 1; q < prof.length - 1; q++) Gs.quadN([p0, P(k, prof[q][0], prof[q][1]), P(k, prof[q + 1][0], prof[q + 1][1]), P(k, prof[q + 1][0], prof[q + 1][1])], N4(nn), c);
        }
      }
    };

    let u = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, a = pts[i], c = pts[j], L = a.distanceTo(c), nx = en[i][0], nz = en[i][1], ax = (c.x - a.x) / (L || 1), az = (c.y - a.y) / (L || 1), I = info[i], street = I.sw >= 0 && L > 3;
      const NO = N4([nx, 0, nz]), u0 = u; u += L;
      const Wp = (x, y, z = 0) => [a.x + ax * x + nx * z, y, a.y + az * x + nz * z];
      const rect = (Gq, x0, x1, y0, y1, z, cc, uv) => Gq.quadN([Wp(x0, y0, z), Wp(x1, y0, z), Wp(x1, y1, z), Wp(x0, y1, z)], NO, cc, uv);
      const wq = (x0, x1, y0, y1, Gw = G, cc = col, tw = TW, th = TH) => { if (x1 - x0 < 0.004 || y1 - y0 < 0.004) return; rect(Gw, x0, x1, y0, y1, 0, cc, [[(u0 + x0) / tw, y0 / th], [(u0 + x1) / tw, y0 / th], [(u0 + x1) / tw, y1 / th], [(u0 + x0) / tw, y1 / th]]); };
      const put = (name, x, y, sx, sy2, sz, cc, z = 0) => { const Q = C.I[name] || (C.I[name] = { m: [], c: [] }), p = Wp(x, y, z); Q.m.push(ax * sx, 0, az * sx, 0, 0, sy2, 0, 0, nx * sz, 0, nz * sz, 0, p[0], p[1], p[2], 1); Q.c.push(cc[0], cc[1], cc[2]); };
      // 一条水平的墙带，里面开若干个洞（洞口四周带侧壁）
      // 分块用的是整面墙统一的竖线（所有洞口的左右边）× 每条墙带自己的横线，相邻两块的顶点完全重合；
      // 要是各切各的，边上会出现 T 形接缝，远看是一条条漏光的细线。
      const bands = [], band = (y0, y1, ops, Gw = G, cc = col, tw = TW, th = TH) => { if (y1 - y0 >= 0.02) bands.push({ y0, y1, ops, Gw, cc, tw, th }); };
      const uniq = (a) => { a.sort((p, q) => p - q); const out = []; for (const v of a) if (!out.length || v - out[out.length - 1] > 0.004) out.push(v); return out; };
      const flush = () => {
        const xs = uniq([0, L, ...bands.flatMap(b => b.ops.flatMap(o => [o.x0, o.x1]))]);
        for (const b of bands) {
          const ys = uniq([b.y0, b.y1, ...b.ops.flatMap(o => [Math.max(b.y0, o.y0), Math.min(b.y1, o.y1)])]);
          if (!b.ops.length && xs.length === 2) { wq(0, L, b.y0, b.y1, b.Gw, b.cc, b.tw, b.th); continue; }
          for (let p = 0; p < xs.length - 1; p++) for (let q = 0; q < ys.length - 1; q++) {
            const mx = (xs[p] + xs[p + 1]) / 2, my = (ys[q] + ys[q + 1]) / 2;
            if (!b.ops.some(o => mx > o.x0 && mx < o.x1 && my > o.y0 && my < o.y1)) wq(xs[p], xs[p + 1], ys[q], ys[q + 1], b.Gw, b.cc, b.tw, b.th);
          }
          sides(b.ops, b.Gw, b.cc, b.tw, b.th);
        }
        bands.length = 0;
      };
      const sides = (ops, Gw, cc, tw, th) => {
        for (const o of ops) {
          const d = o.d, uv = (p, q, v0, v1) => [[(u0 + p) / tw, v0 / th], [(u0 + q) / tw, v0 / th], [(u0 + q) / tw, v1 / th], [(u0 + p) / tw, v1 / th]];
          Gw.quadN([Wp(o.x0, o.y0, 0), Wp(o.x0, o.y0, -d), Wp(o.x0, o.y1, -d), Wp(o.x0, o.y1, 0)], N4([ax, 0, az]), cc, uv(o.x0, o.x0 + d, o.y0, o.y1));
          Gw.quadN([Wp(o.x1, o.y0, 0), Wp(o.x1, o.y0, -d), Wp(o.x1, o.y1, -d), Wp(o.x1, o.y1, 0)], N4([-ax, 0, -az]), cc, uv(o.x1, o.x1 + d, o.y0, o.y1));
          Gw.quadN([Wp(o.x0, o.y1, 0), Wp(o.x1, o.y1, 0), Wp(o.x1, o.y1, -d), Wp(o.x0, o.y1, -d)], N4([0, -1, 0]), cc, uv(o.x0, o.x1, o.y1, o.y1 + d));
          if (o.y0 > 0.3) Gw.quadN([Wp(o.x0, o.y0, 0), Wp(o.x1, o.y0, 0), Wp(o.x1, o.y0, -d), Wp(o.x0, o.y0, -d)], N4(UPN), cc, uv(o.x0, o.x1, o.y0, o.y0 + d));
        }
      };
      /** 一行字：中心 (xc, yc)，最宽 maxW、最高 maxH，贴在墙面外 z 处 */
      const text = (str, xc, yc, maxW, maxH, z, cc = [1, 1, 1]) => { const t = textInfo(str), asp = t.w / t.hp, th = Math.min(maxH, maxW / asp), tw = th * asp; C.lab.push({ t, p: [Wp(xc - tw / 2, yc - th / 2, z), Wp(xc + tw / 2, yc - th / 2, z), Wp(xc + tw / 2, yc + th / 2, z), Wp(xc - tw / 2, yc + th / 2, z)], n: [nx, 0, nz], c: cc }); return tw; };
      if (!I.open || L < 2.2 || plain) { wq(0, L, 0, h); continue; }
      // 有名字的楼（学校、教堂、写字楼……）：临街最先碰到的一面够宽的墙上挂一块深色铭牌
      if (!nameDone && street && L > 5 && !shopWall(I)) { nameDone = true; { const p = Wp(L / 2, 0, 0); samples.name.push({ x: p[0], z: p[2], nx, nz }); } const t = textInfo(b.n), ph = Math.min(0.62, gh * 0.16), pw2 = Math.min(L - 0.8, ph * 0.7 * t.w / t.hp + 0.5), y0 = tall ? gh - ph - 0.25 : gh + 0.14; rect(C.trim, L / 2 - pw2 / 2, L / 2 + pw2 / 2, y0, y0 + ph, 0.06, lin('#2b2f36')); text(b.n, L / 2, y0 + ph / 2, pw2 - 0.3, ph * 0.7, 0.075); }
      const nb = Math.max(1, Math.floor((L - 0.7) / bayW)), bw = (L - 0.7) / nb, ww = Math.min(wwS, bw - 0.75), bx = (k) => 0.35 + k * bw;
      const winAt = (xc, ys, wh, k) => {      // 一扇窗：近处立体窗 + 退进去的玻璃，远处一张卡片
        const v = Math.floor(hash(bi * 131 + i * 17 + k) * 4);
        if (I.det) { put('win' + wk, xc, ys, ww / nomW, wh / nomH, 1, winCol); rect(C.pane, xc - ww / 2, xc + ww / 2, ys, ys + wh, -0.165, [1, 1, 1], A.glass[v]); rect(C.card, xc - ww / 2, xc + ww / 2, ys - 0.06, ys + wh, 0.004, mixW(trim, 0.2), A.card[v]); nWin++; }
        else rect(C.flat, xc - ww / 2, xc + ww / 2, ys - 0.06, ys + wh, 0.004, mixW(trim, 0.2), A.card[v]);
        return { x0: xc - ww / 2, x1: xc + ww / 2, y0: ys, y1: ys + wh, d: REVEAL };
      };
      const hole = (o) => I.det ? o : null;      // 不值得开洞的墙：整面平墙 + 卡片
      // ---- 楼上 ----
      if (tall) { const nu = Math.max(1, Math.round(L / 3.4)), nv = Math.max(1, Math.round((h - gh) / 3.3)); rect(C.glass, 0, L, gh, h, 0, col, [[0, 0], [nu, 0], [nu, nv], [0, nv]]); }
      else {
        for (let f = 0; f < fl; f++) {
          const y0 = gh + f * fh, wh = Math.min(nomH * 1.12, fh - 1.3), ys = y0 + Math.min(0.95, fh - wh - 0.4), ops = [];
          if (ww > 0.6 && wh > 0.8) for (let k = 0; k < nb; k++) { const o = hole(winAt(bx(k) + bw / 2, ys, wh, f * 40 + k)); if (o) ops.push(o); }
          band(y0, y0 + fh, ops);
        }
        if (!fl) band(gh, h, []);
      }
      // ---- 底层：店面 ----
      if (street && shopWall(I)) {
        const sb = Math.max(1, Math.round(L / 3.6)), sw2 = L / sb, pw = K.KIT.pilW / 2, oh = K.KIT.shop[1] * sy, ops = [], ng = names ? Math.max(1, Math.min(Math.round(sb / 2), names.length)) : Math.max(1, Math.round(sb / 2));
        const pilCol = tall ? lin('#3a3d42') : mixW(trim, 0.1), gW = tall ? C.stucco : G, gC = tall ? lin('#c9ccce') : col, [gtw, gth] = tall ? TEX_M.stucco : [TW, TH];
        for (let g = 0; g < ng; g++) {
          const k0 = Math.floor(g * sb / ng), k1 = Math.floor((g + 1) * sb / ng), x0 = k0 * sw2, x1 = k1 * sw2, gw = x1 - x0, hs = hash(bi * 53 + i * 7 + g * 3);
          if (!tall && gw > 5) { const p = Wp((x0 + x1) / 2, 0, 0); samples.shop.push({ x: p[0], z: p[2], nx, nz }); }
          const acc = tall ? lin('#34363c') : ACCENTS[Math.floor(hs * ACCENTS.length)], doorK = k0 + Math.floor(hash(bi * 59 + i + g) * (k1 - k0)), cafe = hash(bi * 61 + g) < 0.4 ? 1 : 0;
          for (let k = k0; k < k1; k++) {
            const o = { x0: k ? k * sw2 + pw : 2 * pw, x1: k < sb - 1 ? (k + 1) * sw2 - pw : L - 2 * pw, y0: 0, y1: oh, d: 0.14 }, xc = (o.x0 + o.x1) / 2, sx = (o.x1 - o.x0) / K.KIT.shop[0], door = k === doorK;
            ops.push(o); nShop++;
            put(door ? 'shopDoor' : 'shopWin' + cafe, xc, 0, sx, sy, 1, acc); put(door ? 'shopDoorGlass' : 'shopWinGlass', xc, 0, sx, sy, 1, [1, 1, 1]);
            rect(C.card, o.x0, o.x1, 0, oh, 0.004, mixW(acc, 0.15), door ? A.shopDoor : A.shopWin);
          }
          // 招牌：远处是一条色带，近处是有厚度的板 + 鹅颈灯；店名贴在板面上
          const s0 = x0 + pw + 0.12, s1 = x1 - pw - 0.12, sY = 3.07 * sy, sH = 0.5 * sy, nm = Math.floor(hash(bi * 67 + i * 31 + g * 7) * NAMES.length);
          rect(C.trim, s0, s1, sY, sY + sH, 0.012, acc);
          put('signBoard', (s0 + s1) / 2, sY, (s1 - s0) / 2.8, sy, 1, acc);
          const tw2 = Math.min(s1 - s0 - 0.3, sH * 0.74 * 4), th2 = tw2 / 4;
          if (names) nName++; if (names) text(names[ni++ % names.length], (s0 + s1) / 2, sY + sH / 2, s1 - s0 - 0.3, sH * 0.74, 0.118);
          else rect(C.flat, (s0 + s1) / 2 - tw2 / 2, (s0 + s1) / 2 + tw2 / 2, sY + sH / 2 - th2 / 2, sY + sH / 2 + th2 / 2, 0.118, [1, 1, 1], A.name[nm]);
          const nl = Math.max(1, Math.round((s1 - s0) / 1.7)); for (let q = 0; q < nl; q++) put('gooseneck', s0 + (s1 - s0) * (q + 0.5) / nl, sY + sH - 0.02, 1, 1, 1, [1, 1, 1]);
          // 雨棚：挑出多少看人行道有多宽，要给路灯和树留位置
          const out = Math.min(1.15, I.sw - 1.5);
          if (!tall && out >= 0.5 && hs * 7 % 1 < 0.62) put(hs * 13 % 1 < 0.55 ? 'awningS' : 'awningP', (x0 + x1) / 2, 2.94 * sy, (gw - 0.3) / 3, 1, out, acc);
          else if (I.sw > 2.2 && hs * 11 % 1 < 0.6) put('bladeSign', x0 + (g === 0 ? pw : 0), 2.5 * sy, 1, 1, 1, acc, 0.08);
        }
        for (let k = 0; k <= sb; k++) put('pilaster', Math.min(L - pw, Math.max(pw, k * sw2)), 0, 1, sy, 1, pilCol);
        band(0, gh, ops, gW, gC, gtw, gth); flush();
        continue;
      }
      // ---- 底层：住宅（门 + 台阶 + 窗），不临街的墙只有窗 ----
      if (tall) { const nu = Math.max(1, Math.round(L / 3.4)); rect(C.glass, 0, L, 0, gh, 0, col, [[0, 0], [nu, 0], [nu, 1], [0, 1]]); flush(); continue; }
      const canDoor = street && L > 4.2 && bw > 1.9 && gh >= 3.0, stoopOk = (xc) => { const p = Wp(xc, 0, 0.9); return isFree(p[0], p[2], 1.0); }, st0 = canDoor && I.sw > 2.7 && gh >= 3.5 ? K.KIT.stoopH : 0.06;
      let st = st0; if (st > 0.3) for (let k = 0; k < nb; k++) if (!stoopOk(bx(k) + bw / 2)) { st = 0.06; break; }      // 门口被树或杆子占了：这面墙的门都落地，不做台阶
      const step = Math.max(2, Math.round(9 / bw)), d0 = Math.min(nb - 1, Math.floor(step / 2)), sillY = st > 0.3 ? 1.5 : 1.0, whG = Math.min(nomH * 1.05, gh - sillY - 0.55), ops = [], solid = [];
      for (let k = 0; k < nb; k++) {
        const xc = bx(k) + bw / 2;
        if (canDoor && k >= d0 && (k - d0) % step === 0) {
          const o = { x0: xc - 0.55, x1: xc + 0.55, y0: st, y1: st + K.KIT.resDoor[1], d: REVEAL }; ops.push(o); solid.push([o.x0 - 0.18, o.x1 + 0.18]);
          put('resDoor', xc, st, 1, 1, 1, doorCol); rect(C.card, o.x0, o.x1, st, o.y1, 0.004, mixW(doorCol, 0.1), A.resDoor);
          if (!numDone) { numDone = true; nNum++; { const p = Wp(xc, 0, 0.75); samples.num.push({ x: p[0], z: p[2], nx, nz }); } text(b.no, xc, o.y1 - 0.31, 0.9, 0.27, 0.03, lin('#ffe9a8')); }      // 门牌号：写在门上方的亮子上
          if (st > 0.3) { put('stoop', xc, 0, 1, 1, 1, [1, 1, 1]); const p = Wp(xc, 0, 0.75); samples.stoop.push({ x: p[0], z: p[2], nx, nz }); }
        } else if (ww > 0.6 && whG > 0.9 && gh >= 2.6) { const o = hole(winAt(xc, sillY, whG, 900 + k)); if (o) ops.push(o); }
      }
      band(0, gh, ops); flush();
      // 墙脚：一圈略微凸出的勒脚，门口断开
      if (I.det && gh >= 2.6) {
        const PH2 = Math.min(0.5, sillY - 0.3), cc = type === 'siding' ? STONE_D : mul(col, 0.72); let x = 0;
        for (const [s0, s1] of [...solid, [L, L]]) {
          if (s0 - x > 0.1) {
            rect(C.trim, x, s0, 0, PH2 - 0.05, 0.045, cc);
            C.trim.quadN([Wp(x, PH2 - 0.05, 0.045), Wp(s0, PH2 - 0.05, 0.045), Wp(s0, PH2, 0), Wp(x, PH2, 0)], N4([nx * 0.7, 0.7, nz * 0.7]), cc);
            for (const [xe, s] of [[x, -1], [s0, 1]]) C.trim.quadN([Wp(xe, 0, 0), Wp(xe, 0, 0.045), Wp(xe, PH2 - 0.05, 0.045), Wp(xe, PH2, 0)], N4([ax * s, 0, az * s]), cc);
          }
          x = s1;
        }
      }
    }
    // ---- 腰线、檐口、女儿墙、屋顶 ----
    const capCol = type === 'brick' ? (R(9) < 0.5 ? mixW(col, 0.55) : trim) : type === 'siding' ? trim : mixW(col, 0.35), PH = tall ? 1.1 : type === 'siding' ? 0.14 : 0.7;
    const openE = (i) => info[i].open, detE = (i) => info[i].det && pts[i].distanceTo(pts[(i + 1) % n]) >= 2.2;
    if (fl && !tall) sweep(C.trim, type === 'siding' ? [[0, gh - 0.1], [0.035, gh - 0.1], [0.035, gh + 0.06], [0, gh + 0.09]] : [[0, gh - 0.22], [0.06, gh - 0.22], [0.1, gh - 0.06], [0.1, gh + 0.03], [0, gh + 0.07]], type === 'siding' ? trim : capCol, detE);
    const crown = tall ? [[0, h], [0, h + PH], [-0.3, h + PH], [-0.3, h]]
      : type === 'brick' ? [[0, h - 0.78], [0.06, h - 0.78], [0.06, h - 0.62], [0.13, h - 0.52], [0.13, h - 0.4], [0.3, h - 0.2], [0.36, h - 0.2], [0.36, h], [0.42, h + 0.06], [0.42, h + 0.16], [0.1, h + 0.16], [0.1, h + PH], [-0.3, h + PH], [-0.3, h]]
        : type === 'siding' ? [[0, h - 0.34], [0.05, h - 0.34], [0.05, h - 0.2], [0.3, h - 0.16], [0.33, h - 0.02], [0.33, h + PH], [-0.3, h + PH], [-0.3, h]]
          : [[0, h - 0.2], [0.07, h - 0.2], [0.07, h + PH - 0.08], [0.1, h + PH - 0.08], [0.1, h + PH], [-0.3, h + PH], [-0.3, h]];
    sweep(C.trim, crown, capCol, openE);
    sweep(C.trim, [[0, h], [0, h + PH], [-0.3, h + PH], [-0.3, h]], capCol, (i) => !info[i].open);
    // 只进阴影图的实心“楼芯”：墙是单面的又开了洞，没有它阳光会从窗洞穿过整栋楼
    for (let i = 0; i < n; i++) { const j = (i + 1) % n, p = [pts[i].x - mit[i][0] * 0.3, pts[i].y - mit[i][1] * 0.3], q = [pts[j].x - mit[j][0] * 0.3, pts[j].y - mit[j][1] * 0.3]; C.core.quadN([[p[0], 0, p[1]], [q[0], 0, q[1]], [q[0], h - 0.05, q[1]], [p[0], h - 0.05, p[1]]], N4([en[i][0], 0, en[i][1]]), [1, 1, 1]); }
    for (const t of THREE.ShapeUtils.triangulateShape(pts, [])) { const p = pts[t[0]], q = pts[t[1]], r = pts[t[2]]; C.core.flat(p.x, p.y, q.x, q.y, r.x, r.y, r.x, r.y, h - 0.05, [1, 1, 1]); }
    const rc = ROOF[bi % ROOF.length];
    for (const t of THREE.ShapeUtils.triangulateShape(pts, [])) { const p = pts[t[0]], q = pts[t[1]], r = pts[t[2]]; C.trim.flat(p.x, p.y, q.x, q.y, r.x, r.y, r.x, r.y, h, rc); }
    if (fa > 130) {      // 屋顶设备：四个角都落在屋顶里面才放
      const k = tall ? 2.2 : 1, sx = (2.6 + hash(bi * 3) * 2.4) * k, sz = (2.4 + hash(bi * 5) * 1.6) * k, sy3 = (2 + hash(bi * 9) * 1.4) * k;
      let best = 0, rot = 0; for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n], L = p.distanceTo(q); if (L > best) { best = L; rot = Math.atan2(q.y - p.y, q.x - p.x); } }
      const cr = Math.cos(rot), sr = Math.sin(rot), m = 0.8;
      if ([[1, 1], [1, -1], [-1, 1], [-1, -1]].every(([p, q]) => inPolyV(pts, cx + (sx / 2 + m) * p * cr - (sz / 2 + m) * q * sr, cz + (sx / 2 + m) * p * sr + (sz / 2 + m) * q * cr))) C.trim.box(cx, h + sy3 / 2, cz, sx, sy3, sz, rot, UNIT, mixW(UNIT, 0.4));
    }
  };

  // ---------- 建网格 ----------
  const mats = {
    brick: toonMat({ map: texW.brick, vertexColors: true }), siding: toonMat({ map: texW.siding, vertexColors: true }), stucco: toonMat({ map: texW.stucco, vertexColors: true }), glass: toonMat({ map: texW.curtain, vertexColors: true, spec: 0.6 }),
    trim: toonMat({ vertexColors: true }), atlas: toonMat({ map: A.tex, vertexColors: true, alphaTest: 0.5 }), kit: toonMat({ vertexColors: true, paint: 'tint' }),
    core: new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }),
    pane: toonMat({ map: A.tex, vertexColors: true, glass: 0.95 }),
    shopGlass: toonMat({ color: new THREE.Color().setRGB(0.32, 0.38, 0.44), transparent: true, depthWrite: false, glass: 1, glassAlpha: 0.18 }),
  };
  const geos = { winA: K.winA(), winB: K.winB(), winC: K.winC(), shopWin0: K.shopWin(0), shopWin1: K.shopWin(1), shopWinGlass: K.shopWinGlass(), shopDoor: K.shopDoor(), shopDoorGlass: K.shopDoorGlass(), pilaster: K.pilaster(), awningS: K.awning(true), awningP: K.awning(false), signBoard: K.signBoard(), gooseneck: K.gooseneck(), bladeSign: K.bladeSign(), resDoor: K.resDoor(), stoop: K.stoop() };
  const ALWAYS = new Set(['awningS', 'awningP']), CAST = new Set(['awningS', 'awningP', 'stoop', 'pilaster', 'signBoard', 'bladeSign']);
  // ---------- 分块：只建玩家周围的，走远了卸掉。整张地图一次建完要好几个 G 内存 ----------
  for (let bi = 0; bi < map.raw.buildings.length; bi++) {
    if (map.buildings[bi].skip) continue;
    const B = map.buildings[bi], cx = (B.x0 + B.x1) / 2, cz = (B.z0 + B.z1) / 2, k = Math.floor(cx / BCELL) + ',' + Math.floor(cz / BCELL);
    let c = bcells.get(k); if (!c) bcells.set(k, c = { list: [], box: [1e9, 1e9, -1e9, -1e9], built: false, near: null, g: null, hi: null, lo: null });
    c.list.push(bi); c.box[0] = Math.min(c.box[0], B.x0); c.box[1] = Math.min(c.box[1], B.z0); c.box[2] = Math.max(c.box[2], B.x1); c.box[3] = Math.max(c.box[3], B.z1);
  }
  const cells = [...bcells.values()];
  // 一块分几帧建：每次只生成几栋楼，全部生成完再合成网格，免得开着开着顿一下
  const buildCell = (c, n) => {
    if (!c.pend) c.pend = { C: newGeos(), i: 0 };
    const C = c.pend.C; let done = 0;
    while (c.pend.i < c.list.length && done < n) { const bi = c.list[c.pend.i++]; genBuilding(map.raw.buildings[bi], bi, C); done++; }
    if (c.pend.i < c.list.length) return done;
    const g = new THREE.Group(), hi = [], lo = []; c.pend = null;
    const mesh = (k, mat, cast = true) => { if (!C[k].i.length) return null; const m = new THREE.Mesh(C[k].build(), mat); m.matrixAutoUpdate = false; m.castShadow = cast; m.receiveShadow = true; g.add(m); return m; };
    for (const k of ['brick', 'siding', 'stucco', 'glass', 'trim']) mesh(k, mats[k]);
    mesh('flat', mats.atlas, false);
    { const m = mesh('core', mats.core); if (m) m.receiveShadow = false; }
    const card = mesh('card', mats.atlas, false), pane = mesh('pane', mats.pane, false);
    if (card) lo.push(card); if (pane) hi.push(pane);
    for (const [name, Q] of Object.entries(C.I)) {
      const glass = name.endsWith('Glass'), m = new THREE.InstancedMesh(geos[name], glass ? mats.shopGlass : mats.kit, Q.c.length / 3);
      m.instanceMatrix.array.set(Q.m); m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Q.c), 3);
      m.computeBoundingSphere(); m.matrixAutoUpdate = false; m.castShadow = CAST.has(name); m.receiveShadow = !glass; g.add(m);
      if (!ALWAYS.has(name)) hi.push(m);
    }
    if (C.lab.length) {      // 这一块里所有的字画到一张贴图上：每行 64 像素，一列最多 32 行
      const strs = [...new Set(C.lab.map(l => l.t.str))], cols = Math.min(8, Math.ceil(strs.length / 32)), rows = Math.ceil(strs.length / cols), cv = document.createElement('canvas'), pos = new Map();
      cv.width = 512 * cols; cv.height = 64 * rows; const x2 = cv.getContext('2d'); x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.fillStyle = '#fffaf0';
      strs.forEach((s, i) => { const x = (i % cols) * 512, y = Math.floor(i / cols) * 64; x2.font = FONT(textInfo(s).px); x2.fillText(s, x + 256, y + 34); pos.set(s, [x, y]); });
      const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      const G = new Geo(); for (const l of C.lab) { const [x, y] = pos.get(l.t.str), u0 = (x + 256 - l.t.w / 2) / cv.width, u1 = (x + 256 + l.t.w / 2) / cv.width, v0 = 1 - (y + 33 + l.t.hp / 2) / cv.height, v1 = 1 - (y + 33 - l.t.hp / 2) / cv.height; G.quadN(l.p, N4(l.n), l.c, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]); }
      const m = new THREE.Mesh(G.build(), toonMat({ map: tex, vertexColors: true, alphaTest: 0.5 })); m.matrixAutoUpdate = false; m.receiveShadow = true; g.add(m); c.tex = tex; c.texMat = m.material;
    }
    for (const m of hi) m.visible = false;
    group.add(g); g.updateMatrixWorld(true); c.g = g; c.hi = hi; c.lo = lo; c.built = true; c.near = false;
    return done + 4;
  };
  const dropCell = (c) => {
    group.remove(c.g); c.g.traverse(o => { if (o.isInstancedMesh) o.dispose(); else if (o.isMesh) o.geometry.dispose(); });
    if (c.tex) { c.tex.dispose(); c.texMat.dispose(); c.tex = c.texMat = null; }
    c.g = c.hi = c.lo = null; c.built = false;
  };
  const distTo = (c, x, z) => Math.hypot(Math.max(c.box[0] - x, 0, x - c.box[2]), Math.max(c.box[1] - z, 0, z - c.box[3]));
  /** 每帧调一次。budget = 这一帧最多生成几栋楼（开局传大数，一次建齐眼前的） */
  let cur = null;
  const ensure = (x, z, budget = 3) => {
    let best = null, bd = 1e9;
    for (const c of cells) {
      const d = distTo(c, x, z);
      if (!c.built) { if (d < 720 && d < bd) { bd = d; best = c; } continue; }
      if (d > 860) { dropCell(c); continue; }
      const near = d < (c.near ? 125 : 110);
      if (near !== c.near) { c.near = near; for (const m of c.hi) m.visible = near; for (const m of c.lo) m.visible = !near; }
    }
    if (cur && (cur.built || distTo(cur, x, z) > 800)) { if (!cur.built) cur.pend = null; cur = null; }
    while (budget > 0) {
      if (!cur) { cur = best; best = null; if (!cur) break; }
      budget -= buildCell(cur, budget);
      if (cur.built) { cur = null; if (budget > 0) { bd = 1e9; for (const c of cells) if (!c.built) { const d = distTo(c, x, z); if (d < 720 && d < bd) { bd = d; best = c; } } } }
    }
  };
  return { lod: [], ensure, samples, stats: () => ({ windows: nWin, shopBays: nShop, numbers: nNum, realNames: nName, cells: cells.length, built: cells.filter(c => c.built).length }) };
}
