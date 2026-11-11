// 把路网变成 three.js 场景：地面、路面、标线、路缘、建筑、树、停着的车、红绿灯、标志。
import * as THREE from 'three';
import { LANE_W, XWALK_NEAR, XWALK_FAR, STOP_LINE, pointAt, offsetPoint, segY, signalState, hash } from '../sim/map.js';
import { makeSignAtlas, makeNameAtlas } from './signs.js';
import { Geo, ChunkGeo, lin } from './geo.js';
import { carModel, carModelLow, treeModel, treePit, TREE_KINDS, lampPost, hydrant } from './models.js';
import { toonMat } from './toon.js';
import { buildBuildings } from './buildings.js';
export { Geo };


function canvasTex(size, draw, repeat = true) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size; draw(cv.getContext('2d'), size);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const speckle = (base, amp, n) => (c, S) => {
  c.fillStyle = base; c.fillRect(0, 0, S, S);
  for (let i = 0; i < n; i++) { const v = Math.random(); c.fillStyle = `rgba(${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${v > 0.5 ? 255 : 0},${Math.random() * amp})`; const r = 1 + Math.random() * 2.5; c.fillRect(Math.random() * S, Math.random() * S, r, r); }
};

/** 路段在 [sA, sB] 之间的横截面（“肋”）：中心点 + 指向右侧的向量（拐点处做斜接） */
function ribs(seg, sA, sB) {
  const out = [], P = {};
  pointAt(seg, sA, P); out.push({ x: P.x, z: P.z, rx: -P.dz, rz: P.dx });
  for (let i = 1; i < seg.n - 1; i++) {
    const s = seg.cum[i]; if (s <= sA + 0.05 || s >= sB - 0.05) continue;
    const ax = seg.px[i] - seg.px[i - 1], az = seg.pz[i] - seg.pz[i - 1], la = Math.hypot(ax, az) || 1;
    const bx = seg.px[i + 1] - seg.px[i], bz = seg.pz[i + 1] - seg.pz[i], lb = Math.hypot(bx, bz) || 1;
    const r1x = -az / la, r1z = ax / la; let mx = r1x - bz / lb, mz = r1z + bx / lb; const ml = Math.hypot(mx, mz) || 1; mx /= ml; mz /= ml;
    const k = 1 / Math.max(0.5, mx * r1x + mz * r1z);
    out.push({ x: seg.px[i], z: seg.pz[i], rx: mx * k, rz: mz * k });
  }
  pointAt(seg, sB, P); out.push({ x: P.x, z: P.z, rx: -P.dz, rz: P.dx });
  return out;
}
function strip(G, seg, sA, sB, oL, oR, y, col, uvS = 1) {
  if (sB - sA < 0.05) return;
  const r = ribs(seg, sA, sB);
  for (let i = 1; i < r.length; i++) {
    const a = r[i - 1], b = r[i];
    G.flat(a.x + a.rx * oL, a.z + a.rz * oL, a.x + a.rx * oR, a.z + a.rz * oR, b.x + b.rx * oR, b.z + b.rz * oR, b.x + b.rx * oL, b.z + b.rz * oL, y, col, uvS);
  }
}
function dashed(G, seg, sA, sB, o, w, y, col, on = 3, off = 6) {
  for (let s = sA; s < sB; s += on + off) strip(G, seg, s, Math.min(sB, s + on), o - w / 2, o + w / 2, y, col);
}

// 车的颜色按街上常见的比例来：白、银、灰、黑为主，少量彩色
export const CAR_COLORS = ['#eeeae2', '#c9ced6', '#2e3138', '#7d8590', '#27406b', '#b3392f', '#5f8fc0', '#d8c9a8', '#3f6b58', '#e9e6df', '#4a4f5c', '#d98a3a'];

export function buildWorld(map, scene) {
  const world = { group: new THREE.Group(), lamps: [], lampMesh: null };
  scene.add(world.group);
  // 人行道比路面高一个路缘（15 厘米）：建筑、杆子、树都放在这个抬高的组里
  const CH = 0.15, raised = new THREE.Group(); raised.position.y = CH; world.group.add(raised);
  // 分块几何：每块一个网格、各自做视锥剔除；全部登记进 chunks，太远的整块关掉
  const chunks = [];
  const add = (geo, mat, order = 0, cast = false) => {
    if (Array.isArray(geo)) {
      const g = new THREE.Group(); world.group.add(g);
      for (const c of geo) { const m = new THREE.Mesh(c.geo, mat); m.renderOrder = order; m.matrixAutoUpdate = false; m.receiveShadow = true; m.castShadow = cast; g.add(m); chunks.push({ x: c.x, z: c.z, m, on: true }); }
      return g;
    }
    const m = new THREE.Mesh(geo, mat); m.renderOrder = order; m.matrixAutoUpdate = false; m.frustumCulled = false; m.receiveShadow = true; m.castShadow = cast; world.group.add(m); return m; };
  const DS = THREE.DoubleSide;

  // ---------- 地面（人行道 / 街区）：浅色方砖 ----------
  // 人行道：5 英尺见方的混凝土板。板与板之间只有很浅的色差和细缝，再加颗粒、几块水渍和一两条裂纹，避免大片整齐的格子
  const texConcrete = canvasTex(512, (c, S) => {
    let seed = 23; const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const T = S / 4; c.fillStyle = '#c9c4ba'; c.fillRect(0, 0, S, S);
    for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) { const v = 196 + Math.floor(r() * 14) - (r() < 0.12 ? 12 : 0); c.fillStyle = `rgb(${v + 4},${v},${v - 8})`; c.fillRect(i * T, k * T, T, T); }
    for (let i = 0; i < 9000; i++) { const v = r() > 0.5 ? 255 : 60; c.fillStyle = `rgba(${v},${v},${v},${r() * 0.06})`; const d = 1 + r() * 2; c.fillRect(r() * S, r() * S, d, d); }
    for (let i = 0; i < 5; i++) { const x = r() * S, y = r() * S, rad = 30 + r() * 60, g = c.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, 'rgba(70,64,56,0.09)'); g.addColorStop(1, 'rgba(70,64,56,0)'); c.fillStyle = g; c.fillRect(x - rad, y - rad, rad * 2, rad * 2); }
    c.strokeStyle = 'rgba(96,90,82,0.5)'; c.lineWidth = 1.6; for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(i * T, 0); c.lineTo(i * T, S); c.moveTo(0, i * T); c.lineTo(S, i * T); c.stroke(); }
    c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = 1; for (let i = 0; i <= 4; i++) { c.beginPath(); c.moveTo(i * T + 1.6, 0); c.lineTo(i * T + 1.6, S); c.moveTo(0, i * T + 1.6); c.lineTo(S, i * T + 1.6); c.stroke(); }
    c.strokeStyle = 'rgba(80,74,68,0.35)'; c.lineWidth = 1; for (let i = 0; i < 2; i++) { let x = r() * S, y = r() * S; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.3) * 34; y += (r() - 0.5) * 30; c.lineTo(x, y); } c.stroke(); }
  });
  {
    const G = new Geo(), X = map.half.x + 400, Z = map.half.z + 400;
    // 地面是一张 48 米的大格子；隧道引道（路面在地面以下、还没完全进洞的那一段）上方要开洞，那些格子再切成 4 米的小格、挖掉压在引道上的
    const F = 4, N = 12, holes = new Set(), P = {};
    for (const s of map.segs) {
      if (!s.ys) continue;
      for (let u = 0; u <= s.len; u += 2) { const y = segY(s, u); if (y > -0.02 || y < -5.6) continue; pointAt(s, u, P); for (let o = -s.halfW - 1.2; o <= s.halfW + 1.2; o += 2) holes.add(Math.floor((P.x - P.dz * o) / F) + ',' + Math.floor((P.z + P.dx * o) / F)); }
    }
    const big = new Set(); for (const k of holes) { const [a, b] = k.split(',').map(Number); big.add(Math.floor(a / N) + ',' + Math.floor(b / N)); }
    const S = F * N, nx = Math.ceil(X / S), nz = Math.ceil(Z / S);
    for (let i = -nx; i < nx; i++) for (let k = -nz; k < nz; k++) {
      if (!big.has(i + ',' + k)) { G.flat(i * S, k * S, i * S, (k + 1) * S, (i + 1) * S, (k + 1) * S, (i + 1) * S, k * S, CH, [1, 1, 1], 1 / 6); continue; }
      for (let a = i * N; a < (i + 1) * N; a++) for (let b = k * N; b < (k + 1) * N; b++) if (!holes.has(a + ',' + b)) G.flat(a * F, b * F, a * F, (b + 1) * F, (a + 1) * F, (b + 1) * F, (a + 1) * F, b * F, CH, [1, 1, 1], 1 / 6);
    }
    // 地面各层共面，靠 renderOrder 叠：人行道和路面写深度（后处理的接触阴影要读），深度比较一律通过，后画的盖先画的
    add(G.build(), toonMat({ map: texConcrete, side: DS, depthFunc: THREE.AlwaysDepth }), -30);
  }

  // ---------- 水面：地图数据里是一张 6 米一格的栅格，画成一张贴图铺在地面上（贴图线性过滤 + 模糊，岸线不会是锯齿） ----------
  if (map.raw.water) {
    const wt = map.raw.water, cv = document.createElement('canvas'); cv.width = wt.w; cv.height = wt.h; const c = cv.getContext('2d'); c.fillStyle = '#000'; c.fillRect(0, 0, wt.w, wt.h); c.fillStyle = '#fff';
    { let k = 0; for (let j = 0; j < wt.h; j++) { let x = 0, on = 0; while (x < wt.w) { const n = wt.rle[k++]; if (on) c.fillRect(x, j, n, 1); x += n; on ^= 1; } if (on) k++; } }
    const cv2 = document.createElement('canvas'); cv2.width = wt.w; cv2.height = wt.h; const c2 = cv2.getContext('2d'); c2.filter = 'blur(1.1px)'; c2.drawImage(cv, 0, 0);
    const tex = new THREE.CanvasTexture(cv2); tex.anisotropy = 8; world.waterCanvas = cv;
    const x0 = wt.x0, z0 = wt.z0, x1 = x0 + wt.w * wt.cell, z1 = z0 + wt.h * wt.cell, g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([x0, CH, z0, x0, CH, z1, x1, CH, z1, x1, CH, z0], 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 1, 1], 2)); g.setIndex([0, 1, 2, 0, 2, 3]);
    // 地图边上是水的地方（东边的哈德逊河），水面往外再铺 900 米，不然能看到水的尽头露出一条地面
    { const d = c.getImageData(0, 0, wt.w, wt.h).data, on = (i, j) => d[(j * wt.w + i) * 4] > 127, E = new Geo(), OUT = 900;
      const run = (len, test, emit) => { let s0 = -1; for (let k = 0; k <= len; k++) { const w = k < len && test(k); if (w && s0 < 0) s0 = k; if (!w && s0 >= 0) { if (k - s0 > 20) emit(s0 * wt.cell, k * wt.cell); s0 = -1; } } };
      run(wt.h, j => on(wt.w - 2, j), (a, b) => E.flat(x1 - 8, z0 + a, x1 - 8, z0 + b, x1 + OUT, z0 + b, x1 + OUT, z0 + a, CH, [1, 1, 1]));
      run(wt.h, j => on(1, j), (a, b) => E.flat(x0 - OUT, z0 + a, x0 - OUT, z0 + b, x0 + 8, z0 + b, x0 + 8, z0 + a, CH, [1, 1, 1]));
      run(wt.w, i => on(i, wt.h - 2), (a, b) => E.flat(x0 + a, z1 - 8, x0 + a, z1 + OUT, x0 + b, z1 + OUT, x0 + b, z1 - 8, CH, [1, 1, 1]));
      run(wt.w, i => on(i, 1), (a, b) => E.flat(x0 + a, z0 - OUT, x0 + a, z0 + 8, x0 + b, z0 + 8, x0 + b, z0 - OUT, CH, [1, 1, 1]));
      if (E.i.length) add(E.build(), toonMat({ color: new THREE.Color('#4c82ad'), side: DS, depthFunc: THREE.AlwaysDepth, spec: 0.5 }), -29); }
    add(g, toonMat({ color: new THREE.Color('#4c82ad'), alphaMap: tex, alphaTest: 0.5, side: DS, depthFunc: THREE.AlwaysDepth, spec: 0.5 }), -29);
  }

  // ---------- 路面 + 路口 + 公园 ----------
  const texAsphalt = canvasTex(256, speckle('#666c78', 0.08, 5000));      // 偏蓝的灰
  const Groad = new ChunkGeo(), Gpark = new ChunkGeo();
  for (const s of map.segs) {
    if (s.high) continue;      // 高架和匝道另外建（见“高架”一节）
    const v = 0.93 + hash(s.id) * 0.12;
    strip(Groad, s, s.trimA - 0.05, s.len - s.trimB + 0.05, -s.halfW, s.halfW, 0, [v, v, v], 1 / 5);
  }
  for (const j of map.juncs) {
    const p = j.poly; if (j.y > 0.3) continue;
    for (let i = 1; i < p.length - 1; i++) Groad.flat(p[0][0], p[0][1], p[i][0], p[i][1], p[i + 1][0], p[i + 1][1], p[i + 1][0], p[i + 1][1], 0, [0.97, 0.97, 0.97], 1 / 5);
  }
  add(Groad.build(), toonMat({ map: texAsphalt, vertexColors: true, side: DS, depthFunc: THREE.AlwaysDepth }), -20);
  const grass = lin('#7fb35a');
  const parkPolys = [];
  for (const flat of map.raw.parks) {
    const pts = []; for (let i = 0; i < flat.length; i += 2) pts.push(new THREE.Vector2(flat[i], flat[i + 1]));
    parkPolys.push(pts);
    for (const t of THREE.ShapeUtils.triangulateShape(pts, [])) { const a = pts[t[0]], b = pts[t[1]], c = pts[t[2]]; Gpark.flat(a.x, a.y, b.x, b.y, c.x, c.y, c.x, c.y, CH, grass, 1 / 5); }
  }
  add(Gpark.build(), toonMat({ map: canvasTex(128, speckle('#ffffff', 0.12, 1500)), vertexColors: true, side: DS, depthWrite: false, depthFunc: THREE.AlwaysDepth }), -25);

  // ---------- 标线 ----------
  const Gw = new ChunkGeo(), Gy = new ChunkGeo(), W = [0.97, 0.97, 0.97], Y = lin('#ffc61a');
  const ctl = (j) => j && (j.control === 'signal' || j.control === 'stop' || j.control === 'allway');
  for (const s of map.segs) {
    if (s.useLen < 6 || s.high) continue;
    const s0 = s.trimA, s1 = s.len - s.trimB, room = s.useLen > 15;
    const legA = map.legOf(s.ja, s, 'a'), legB = map.legOf(s.jb, s, 'b');
    const xa = ctl(s.ja) && room, xb = ctl(s.jb) && room;
    const a0 = s0 + (xa ? STOP_LINE + 0.6 : 0), b0 = s1 - (xb ? STOP_LINE + 0.6 : 0);
    if (s.lb > 0) { strip(Gy, s, a0, b0, s.cOff - 0.2, s.cOff - 0.07, 0, Y); strip(Gy, s, a0, b0, s.cOff + 0.07, s.cOff + 0.2, 0, Y); }
    for (let k = 1; k < s.lf; k++) { const o = s.cOff + k * LANE_W, m = Math.max(a0, b0 - 24); dashed(Gw, s, a0, m, o, 0.13, 0, W); strip(Gw, s, m, b0, o - 0.07, o + 0.07, 0, W); }
    for (let k = 1; k < s.lb; k++) { const o = s.cOff - k * LANE_W, m = Math.min(b0, a0 + 24); strip(Gw, s, a0, m, o - 0.07, o + 0.07, 0, W); dashed(Gw, s, m, b0, o, 0.13, 0, W); }
    // 停止线
    if (xb && legB.approach && (s.jb.control === 'signal' || legB.stop)) strip(Gw, s, s1 - STOP_LINE - 0.45, s1 - STOP_LINE, s.lb > 0 ? s.cOff + 0.15 : -s.halfW + 0.2, s.halfW - 0.2, 0, W);
    if (xa && legA.approach && (s.ja.control === 'signal' || legA.stop)) strip(Gw, s, s0 + STOP_LINE, s0 + STOP_LINE + 0.45, -s.halfW + 0.2, s.cOff - 0.15, 0, W);
    // 人行横道（斑马线）
    for (const [on, sa, sb] of [[xa, s0 + XWALK_NEAR, s0 + XWALK_FAR], [xb, s1 - XWALK_FAR, s1 - XWALK_NEAR]]) {
      if (!on) continue;
      for (let o = -s.halfW + 0.5; o + 0.55 < s.halfW - 0.3; o += 1.25) strip(Gw, s, sa, sb, o, o + 0.55, 0, W);
    }
  }
  add(Gw.build(), toonMat({ vertexColors: true, side: DS, depthWrite: false, depthFunc: THREE.AlwaysDepth }), -10);      // 用受光材质，标线才会被阴影盖住
  add(Gy.build(), toonMat({ vertexColors: true, side: DS, depthWrite: false, depthFunc: THREE.AlwaysDepth }), -10);

  // ---------- 路缘石：立面略带斜度 + 倒角 + 顶面 ----------
  const Gc = new ChunkGeo(), Gtac = new ChunkGeo(), CURB = lin('#d9d6cf'), CURB_D = lin('#c2bfb8');
  const curbRun = (ax, az, bx, bz, nx, nz) => {    // n 指向人行道一侧
    const P = (x, z, d, y) => [x + nx * d, y, z + nz * d], f = [-nx * 0.98, 0.2, -nz * 0.98], c = [-nx * 0.64, 0.77, -nz * 0.64], u = [0, 1, 0];
    Gc.quadN([P(ax, az, 0, 0), P(bx, bz, 0, 0), P(bx, bz, 0.022, CH - 0.04), P(ax, az, 0.022, CH - 0.04)], [f, f, f, f], CURB_D);
    Gc.quadN([P(ax, az, 0.022, CH - 0.04), P(bx, bz, 0.022, CH - 0.04), P(bx, bz, 0.07, CH), P(ax, az, 0.07, CH)], [c, c, c, c], CURB);
    Gc.quadN([P(ax, az, 0.07, CH), P(bx, bz, 0.07, CH), P(bx, bz, 0.2, CH), P(ax, az, 0.2, CH)], [u, u, u, u], CURB);
  };
  for (const s of map.segs) {
    if (s.useLen < 0.5 || s.high) continue;
    const r = ribs(s, s.trimA, s.len - s.trimB);
    for (const sg of [-1, 1]) for (let i = 1; i < r.length; i++) {
      const a = r[i - 1], b = r[i];
      curbRun(a.x + a.rx * s.halfW * sg, a.z + a.rz * s.halfW * sg, b.x + b.rx * s.halfW * sg, b.z + b.rz * s.halfW * sg, a.rx * sg, a.rz * sg);
    }
  }
  // 人行横道两头的黄色盲道砖
  const TAC = lin('#f5c542');
  for (const s of map.segs) {
    if (s.useLen <= 15 || s.high) continue;
    for (const [on, sa, sb] of [[ctl(s.ja), s.trimA + XWALK_NEAR + 0.3, s.trimA + XWALK_FAR - 0.3], [ctl(s.jb), s.len - s.trimB - XWALK_FAR + 0.3, s.len - s.trimB - XWALK_NEAR - 0.3]]) {
      if (!on) continue;
      strip(Gtac, s, sa, sb, s.halfW + 0.4, s.halfW + 1.0, CH, TAC); strip(Gtac, s, sa, sb, -s.halfW - 1.0, -s.halfW - 0.4, CH, TAC);
    }
  }
  for (const j of map.juncs) {
    if (j.y > 0.3) continue;
    const mouths = j.legs.map(l => [[l.ex - l.oz * l.w, l.ez + l.ox * l.w], [l.ex + l.oz * l.w, l.ez - l.ox * l.w]]);
    const same = (p, q) => Math.abs(p[0] - q[0]) < 0.01 && Math.abs(p[1] - q[1]) < 0.01;
    for (let i = 0; i < j.poly.length; i++) {
      const p = j.poly[i], q = j.poly[(i + 1) % j.poly.length];
      if (mouths.some(m => (same(m[0], p) && same(m[1], q)) || (same(m[1], p) && same(m[0], q)))) continue;
      let nx = q[1] - p[1], nz = -(q[0] - p[0]); const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      if ((p[0] + q[0]) / 2 * nx + (p[1] + q[1]) / 2 * nz - (j.cx * nx + j.cz * nz) < 0) { nx = -nx; nz = -nz; }
      curbRun(p[0], p[1], q[0], q[1], nx, nz);
    }
  }
  add(Gc.build(), toonMat({ vertexColors: true }));
  // 路边的排水沟（一条浅色混凝土带）、雨水篦子、井盖 —— 都是贴在路面上的薄片
  {
    const Gg = new ChunkGeo(), Gd = new ChunkGeo(), GUT = lin('#9a9c9f'), IRON = [0.07, 0.07, 0.08], IRON_L = [0.2, 0.2, 0.22], P = {};
    for (const s of map.segs) {
      if (s.useLen < 2 || s.high) continue; const s0 = s.trimA, s1 = s.len - s.trimB;
      strip(Gg, s, s0, s1, s.halfW - 0.34, s.halfW, 0, GUT); strip(Gg, s, s0, s1, -s.halfW, -s.halfW + 0.34, 0, GUT);
      if (s.useLen < 30) continue;
      for (const sg of [-1, 1]) for (const sa of [s0 + XWALK_FAR + 2.2, s1 - XWALK_FAR - 3.2]) {       // 路口前后各一个雨水篦子
        const o0 = sg * (s.halfW - 0.5), o1 = sg * (s.halfW - 0.04); strip(Gd, s, sa, sa + 0.95, Math.min(o0, o1), Math.max(o0, o1), 0, IRON);
        for (let k = 0; k < 5; k++) strip(Gd, s, sa + 0.09 + k * 0.17, sa + 0.16 + k * 0.17, Math.min(o0, o1) + 0.05, Math.max(o0, o1) - 0.05, 0, IRON_L);
      }
      for (const f of s.useLen > 130 ? [0.3, 0.68] : s.useLen > 55 ? [0.42] : []) {                      // 井盖
        offsetPoint(s, s0 + s.useLen * f, s.cOff + (s.lf > 0 ? 1 : -1) * LANE_W * 0.5 + (hash(s.id * 3 + f * 10) - 0.5) * 1.2, P);
        const N = 16, ring = (r) => { const a = []; for (let k = 0; k < N; k++) { const t = k / N * Math.PI * 2; a.push([P.x + Math.cos(t) * r, P.z + Math.sin(t) * r]); } return a; };
        const fan = (r, col) => { const a = ring(r); for (let k = 0; k < N; k++) { const q = a[(k + 1) % N]; Gd.flat(P.x, P.z, a[k][0], a[k][1], q[0], q[1], q[0], q[1], 0, col); } };
        fan(0.44, GUT); fan(0.38, IRON); fan(0.3, IRON_L); fan(0.26, IRON); fan(0.07, IRON_L);
        for (let k = 0; k < 6; k++) { const t = k / 6 * Math.PI * 2, c = Math.cos(t), sn = Math.sin(t); Gd.flat(P.x + c * 0.1 - sn * 0.02, P.z + sn * 0.1 + c * 0.02, P.x + c * 0.24 - sn * 0.02, P.z + sn * 0.24 + c * 0.02, P.x + c * 0.24 + sn * 0.02, P.z + sn * 0.24 - c * 0.02, P.x + c * 0.1 + sn * 0.02, P.z + sn * 0.1 - c * 0.02, 0, IRON_L); }
      }
    }
    add(Gg.build(), toonMat({ vertexColors: true, side: DS, depthWrite: false, depthFunc: THREE.AlwaysDepth }), -15);
    add(Gd.build(), toonMat({ vertexColors: true, side: DS, depthWrite: false, depthFunc: THREE.AlwaysDepth }), -9);
  }
  add(Gtac.build(), toonMat({ vertexColors: true, side: DS, depthWrite: false, depthFunc: THREE.AlwaysDepth }), -9);

  // ---------- 高架：桥面、两侧护栏、桥底、桥墩、车道线 ----------
  // 高度来自地图数据（seg.ys）：高架段在 7.5 米，匝道按 5.5% 的坡接到地面。用正常的深度测试画，和地面那几层互不干扰
  {
    const Gb = new ChunkGeo(), Gbm = new ChunkGeo(), DECK = lin('#5d626d'), CONC = lin('#b9b6ae'), CONC_D = lin('#9a978f'), WH = [0.97, 0.97, 0.97], YE = lin('#ffc61a'), UPN = [0, 1, 0], DN = [0, -1, 0], LIFT = 0.05, TH = 0.9;
    // 贴近地面的那一段要画在人行道那层（0.15 米）上面，不然匝道口会被地面盖住；往上、往下离开地面后回到真实高度
    const drawY = (y) => y >= 0 ? Math.max(y + LIFT, CH + 0.03) : y + LIFT + 0.13 * Math.max(0, 1 + y / 0.6);
    const fine = (seg, sA, sB) => {      // 比地面路切得密一点：坡道要跟着高度走
      const out = [], P = {}; const n = Math.max(1, Math.ceil((sB - sA) / 8));
      for (let i = 0; i <= n; i++) { const u = sA + (sB - sA) * i / n; pointAt(seg, u, P); out.push({ x: P.x, z: P.z, rx: -P.dz, rz: P.dx, y: drawY(segY(seg, u)), u }); }
      return out;
    };
    const pt = (r, o, dy = 0) => [r.x + r.rx * o, r.y + dy, r.z + r.rz * o];
    const band = (G, a, b, o0, o1, dy, col) => G.quadN([pt(a, o0, dy), pt(a, o1, dy), pt(b, o1, dy), pt(b, o0, dy)], [UPN, UPN, UPN, UPN], col);
    for (const s of map.segs) {
      if (!s.high) continue;
      const r = fine(s, Math.max(0, s.trimA - 0.3), Math.min(s.len, s.len - s.trimB + 0.3)), w = s.halfW;
      for (let i = 1; i < r.length; i++) {
        const a = r[i - 1], b = r[i], hi = Math.min(a.y, b.y);
        band(Gb, a, b, -w, w, 0, DECK);
        if (hi > 0.5) for (const sg of [-1, 1]) {      // 护栏（新泽西护栏的截面：下宽上窄）+ 桥面侧面
          const n = [a.rx * sg, 0, a.rz * sg], ni = [-n[0], 0, -n[2]], o0 = sg * w, o1 = sg * (w + 0.18), o2 = sg * (w + 0.42), bh = Math.min(0.85, hi * 0.6), th = Math.min(TH, hi);
          Gb.quadN([pt(a, o0, 0), pt(b, o0, 0), pt(b, o1, bh), pt(a, o1, bh)], [ni, ni, ni, ni], CONC);
          Gb.quadN([pt(a, o1, bh), pt(b, o1, bh), pt(b, o2, bh), pt(a, o2, bh)], [UPN, UPN, UPN, UPN], CONC);
          Gb.quadN([pt(a, o2, bh), pt(b, o2, bh), pt(b, o2, -th), pt(a, o2, -th)], [n, n, n, n], CONC_D);
        }
        if (Math.max(a.y, b.y) < -0.25) {      // 隧道和引道：两侧的墙一直砌到地面；完全进洞后加一层顶（挡住阳光，洞里是暗的）
          const WALL = lin('#8f8d88'), TILE2 = lin('#c9c6bd'), top = (r) => Math.min(CH, r.y + 5.2) - r.y;
          for (const sg of [-1, 1]) {
            const ni = [-a.rx * sg, 0, -a.rz * sg], o = sg * (w + 0.3);
            Gb.quadN([pt(a, o, 0), pt(b, o, 0), pt(b, o, Math.min(1.4, top(b))), pt(a, o, Math.min(1.4, top(a)))], [ni, ni, ni, ni], TILE2);
            Gb.quadN([pt(a, o, Math.min(1.4, top(a))), pt(b, o, Math.min(1.4, top(b))), pt(b, o, top(b)), pt(a, o, top(a))], [ni, ni, ni, ni], WALL);
          }
          if (hi < -5.3 + LIFT) Gb.quadN([pt(a, -w - 0.3, 5.2), pt(a, w + 0.3, 5.2), pt(b, w + 0.3, 5.2), pt(b, -w - 0.3, 5.2)], [DN, DN, DN, DN], WALL);
        }
        if (hi > 1.2) Gb.quadN([pt(a, -w - 0.42, -TH), pt(a, w + 0.42, -TH), pt(b, w + 0.42, -TH), pt(b, -w - 0.42, -TH)], [DN, DN, DN, DN], CONC_D);
        // 车道线：左边黄实线、右边白实线、车道之间白虚线
        band(Gbm, a, b, -w + 0.35, -w + 0.5, 0.02, YE); band(Gbm, a, b, w - 0.5, w - 0.35, 0.02, WH);
        if (i % 2) for (let k = 1; k < s.lf + s.lb; k++) { const o = -s.driveW / 2 + k * LANE_W; band(Gbm, a, { x: a.x + (b.x - a.x) * 0.45, z: a.z + (b.z - a.z) * 0.45, rx: a.rx, rz: a.rz, y: a.y + (b.y - a.y) * 0.45 }, o - 0.07, o + 0.07, 0.02, WH); }
      }
      // 桥墩：每 26 米一个，落在地面的路上就不放
      for (let u = s.trimA + 13; u < s.len - s.trimB - 6; u += 26) {
        const y = segY(s, u); if (y < 3) continue; const P = {}; pointAt(s, u, P);
        if (map.onRoad(P.x, P.z, 1.5, 0)) continue;
        Gb.box(P.x, (y - TH) / 2, P.z, 1.5, y - TH, Math.min(w * 1.3, 7), Math.atan2(P.dz, P.dx), CONC, CONC);
        Gb.box(P.x, y - TH - 0.5, P.z, 1.9, 1.0, (w + 0.4) * 2, Math.atan2(P.dz, P.dx), CONC_D, CONC_D);      // 盖梁
      }
    }
    for (const j of map.juncs) {      // 高架上的分流 / 合流口
      if (j.y <= 0.3) continue; const p = j.poly, y = j.y + LIFT;
      for (let i = 1; i < p.length - 1; i++) Gb.flat(p[0][0], p[0][1], p[i][0], p[i][1], p[i + 1][0], p[i + 1][1], p[i + 1][0], p[i + 1][1], y, DECK);
      if (j.y > 1.2) for (let i = 1; i < p.length - 1; i++) Gb.quadN([[p[0][0], y - TH, p[0][1]], [p[i][0], y - TH, p[i][1]], [p[i + 1][0], y - TH, p[i + 1][1]], [p[i + 1][0], y - TH, p[i + 1][1]]], [DN, DN, DN, DN], CONC_D);
    }
    add(Gb.build(), toonMat({ vertexColors: true }), 0, true);
    add(Gbm.build(), toonMat({ vertexColors: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  }

  // ---------- 建筑 ----------
  // 人行道上的东西（门前台阶、杆子、树、路灯、消防栓）登记占位，后放的避开先放的
  // 用 8 米的格子存：逐个比的话，东西多了以后是平方级的慢（三区连通的大图要多等二十几秒）
  const occ = new Map(), OC = 8, okey = (x, z) => Math.floor(x / OC) * 100003 + Math.floor(z / OC);
  const occupy = (x, z, r) => { const k = okey(x, z); let a = occ.get(k); if (!a) occ.set(k, a = []); a.push(x, z, r); };
  const isFree = (x, z, r) => { for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) { const a = occ.get(okey(x + dx * OC, z + dz * OC)); if (a) for (let i = 0; i < a.length; i += 3) if (Math.hypot(a[i] - x, a[i + 1] - z) < a[i + 2] + r) return false; } return true; };
  const inPolyV = (pts, x, z) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a.y > z) !== (b.y > z) && x < (b.x - a.x) * (z - a.y) / (b.y - a.y) + a.x) c = !c; } return c; };
  const bld = buildBuildings(map, raised, occupy, (x, z, r) => isFree(x, z, r));

  // ---------- 标志 / 红绿灯 / 路名牌 ----------
  const atlas = makeSignAtlas(256);
  const names = [...new Set(map.segs.map(s => s.name).filter(Boolean))];
  const nameAtlas = makeNameAtlas(names);
  const Gs = new ChunkGeo(), Gn = new ChunkGeo(), Gm = new ChunkGeo(), Ga = new ChunkGeo();
  const METAL = lin('#9aa3ad'), DARK = lin('#2a2d33'), BACK = lin('#b4bac0'), YELLOW = lin('#f2b632');
  // 竖着的牌子：中心 (x,y,z)，正面朝 (fx,fz)
  const board = (G, x, y, z, fx, fz, w, h, uv) => {
    const rx = fz, rz = -fx, hw = w / 2, hh = h / 2, e = 0.012;
    G.quad(x - rx * hw + fx * e, y - hh, z - rz * hw + fz * e, x + rx * hw + fx * e, y - hh, z + rz * hw + fz * e, x + rx * hw + fx * e, y + hh, z + rz * hw + fz * e, x - rx * hw + fx * e, y + hh, z - rz * hw + fz * e, [1, 1, 1], uv);
  };
  const post = (x, z, h, r = 0.35) => { Gm.cyl(x, 0, h, z, 0.04, 0.035, 7, METAL); occupy(x, z, r); };
  const backing = (x, y, z, fx, fz, w, h) => { const rx = fz, rz = -fx, hw = w / 2, hh = h / 2; Gm.quad(x + rx * hw, y - hh, z + rz * hw, x - rx * hw, y - hh, z - rz * hw, x - rx * hw, y + hh, z - rz * hw, x + rx * hw, y + hh, z + rz * hw, BACK, [0, 0, 1, 1]); };

  const lampAt = [];   // {x,y,z,fx,fz,j,group,kind}
  for (const j of map.juncs) {
    if (j.control === 'joint' || j.y > 0.3 || j.legs.some(l => l.segRef.high)) continue;
    for (const l of j.legs) {
      const seg = l.segRef, tx = -l.ox, tz = -l.oz, rtx = l.oz, rtz = -l.ox;      // t = 驶入方向，rt = 驶入方向的右手边
      // STOP
      if (l.stop && l.approach) {
        const x = l.ex + l.ox * (STOP_LINE + 0.4) + rtx * (l.w + 0.9), z = l.ez + l.oz * (STOP_LINE + 0.4) + rtz * (l.w + 0.9);
        post(x, z, 2.75); board(Gs, x, 2.35, z, l.ox, l.oz, 0.8, 0.8, atlas.uv('stop')); backing(x, 2.35, z, l.ox, l.oz, 0.5, 0.5);
        if (j.control === 'allway') board(Gs, x, 1.78, z, l.ox, l.oz, 0.62, 0.62, atlas.uv('allway'));
      }
      // 单行道：ONE WAY 箭头牌（给横向来车看）+ 禁止驶入
      if (seg.oneway) {
        const wx = l.end === 'a' ? l.ox : -l.ox, wz = l.end === 'a' ? l.oz : -l.oz;     // 车流方向
        for (const sg of [-1, 1]) {
          const x = l.ex + l.ox * 0.9 + rtx * (l.w + 0.9) * sg, z = l.ez + l.oz * 0.9 + rtz * (l.w + 0.9) * sg;
          post(x, z, 3.1);
          for (const fs of [-1, 1]) { const fx = rtx * fs, fz = rtz * fs; board(Gs, x - fx * 0.03 * 0, 2.92, z, fx, fz, 0.95, 0.95, atlas.uv((wx * fz - wz * fx) > 0 ? 'oneway_r' : 'oneway_l')); }
          if (!l.exit) { board(Gs, x + l.ox * 0.6, 2.2, z + l.oz * 0.6, -l.ox, -l.oz, 0.76, 0.76, atlas.uv('dne')); backing(x + l.ox * 0.6, 2.2, z + l.oz * 0.6, -l.ox, -l.oz, 0.7, 0.7); post(x + l.ox * 0.6, z + l.oz * 0.6, 2.6); }
        }
      }
      // 红绿灯：悬臂灯头在路口对面，正对驶入方向
      if (j.control === 'signal' && l.approach) {
        let far = 6; for (const p of j.poly) far = Math.max(far, (p[0] - l.ex) * tx + (p[1] - l.ez) * tz);
        const latC = l.end === 'b' ? seg.cOff + seg.lf * LANE_W / 2 : -seg.cOff + seg.lb * LANE_W / 2;
        const bx = l.ex + tx * (far + 2.5), bz = l.ez + tz * (far + 2.5);
        const hx = bx + rtx * latC, hz = bz + rtz * latC;
        let px = bx + rtx * (l.w + 1.3), pz = bz + rtz * (l.w + 1.3);
        if (map.bldDist(px, pz) < 0.5) { px = bx + rtx * (l.w + 0.45); pz = bz + rtz * (l.w + 0.45); }      // 杆子落进楼里了：往路边挪
        occupy(px, pz, 0.8);
        const rot = Math.atan2(rtz, rtx), armL = Math.hypot(px - hx, pz - hz) + 0.4;
        Gm.cyl(px, 0, 0.6, pz, 0.24, 0.17, 12, METAL); Gm.cyl(px, 0.6, 6.35, pz, 0.15, 0.1, 12, METAL, true);
        Gm.tube([px, 6.0, pz], [hx - rtx * 0.45, 6.0, hz - rtz * 0.45], 0.085, 0.055, 9, METAL);
        const head = (x, y, z) => {
          const hr = Math.atan2(l.oz, l.ox);
          Gm.box(x, y, z, 0.3, 1.15, 0.42, hr, DARK); Gm.box(x - l.ox * 0.16, y, z - l.oz * 0.16, 0.03, 1.4, 0.66, hr, YELLOW);      // 灯箱 + 黄边背板
          for (let k = 0; k < 3; k++) Gm.box(x + l.ox * 0.26, y + 0.36 - k * 0.36 + 0.155, z + l.oz * 0.26, 0.22, 0.025, 0.34, hr, DARK);   // 遮光檐
          ['R', 'Y', 'G'].forEach((kind, k) => lampAt.push({ x: x + l.ox * 0.16, y: y + 0.36 - k * 0.36, z: z + l.oz * 0.16, fx: l.ox, fz: l.oz, j, group: l.group, kind }));
        };
        head(hx, 5.35, hz); head(px + l.ox * 0.25 - rtx * 0.3, 3.3, pz + l.oz * 0.25 - rtz * 0.3);
      }
      // 路面转向箭头
      const tl = l.end === 'b' ? seg.turnF : seg.turnB;
      if (l.approach && tl && tl.length && seg.useLen > 24) {
        tl.forEach((m, k) => {
          const id = { left: 'pv_left', right: 'pv_right', through: 'pv_through', 'left;through': 'pv_through_left', 'through;left': 'pv_through_left', 'through;right': 'pv_through_right', 'right;through': 'pv_through_right' }[m];
          if (!id) return;
          const lat = (l.end === 'b' ? seg.cOff : -seg.cOff) + (k + 0.5) * LANE_W;
          for (const back of [STOP_LINE + 5, STOP_LINE + 20]) {
            if (back + 4 > seg.useLen - 6) continue;
            const cx = l.ex + l.ox * back + rtx * lat, cz = l.ez + l.oz * back + rtz * lat, hl = 1.9, hw = 0.85, uv = atlas.uv(id);
            Ga.quad(cx - tx * hl - rtx * hw, 0, cz - tz * hl - rtz * hw, cx - tx * hl + rtx * hw, 0, cz - tz * hl + rtz * hw, cx + tx * hl + rtx * hw, 0, cz + tz * hl + rtz * hw, cx + tx * hl - rtx * hw, 0, cz + tz * hl - rtz * hw, [1, 1, 1], uv);
          }
        });
      }
    }
    // 路名牌
    const l0 = j.legs[0], x = l0.ex + l0.ox * 0.4 + l0.oz * (l0.w + 0.7), z = l0.ez + l0.oz * 0.4 - l0.ox * (l0.w + 0.7);
    const seen = new Set(); let y = 3.42;
    for (const l of j.legs) {
      const nm = l.segRef.name; if (!nm || seen.has(nm) || seen.size >= 2) continue; seen.add(nm);
      for (const fs of [-1, 1]) board(Gn, x + l.ox * 0.0, y, z, l.oz * fs, -l.ox * fs, 1.15, 0.18, nameAtlas.uv(nm));
      y += 0.2;
    }
    if (seen.size) post(x, z, 3.75, 1.7);
  }
  // 限速牌
  const P = {};
  for (const s of map.segs) {
    if (s.useLen < 90 || s.high || ![20, 25, 35].includes(s.speed)) continue;
    const put = (sAt, sg) => { pointAt(s, sAt, P); const x = P.x - P.dz * (s.halfW + 0.9) * sg, z = P.z + P.dx * (s.halfW + 0.9) * sg; post(x, z, 2.7); board(Gs, x, 2.25, z, -P.dx * sg, -P.dz * sg, 0.85, 0.85, atlas.uv('speed' + s.speed)); backing(x, 2.25, z, -P.dx * sg, -P.dz * sg, 0.6, 0.76); };
    put(s.trimA + 30, 1); if (s.lb > 0) put(s.len - s.trimB - 30, -1);
  }
  const texSign = new THREE.CanvasTexture(atlas.canvas); texSign.colorSpace = THREE.SRGBColorSpace; texSign.anisotropy = 8;
  const texName = new THREE.CanvasTexture(nameAtlas.canvas); texName.colorSpace = THREE.SRGBColorSpace; texName.anisotropy = 8;
  raised.add(add(Gs.build(), new THREE.MeshBasicMaterial({ map: texSign, alphaTest: 0.5, side: THREE.FrontSide })));
  raised.add(add(Gn.build(), new THREE.MeshBasicMaterial({ map: texName, side: THREE.FrontSide })));
  add(Ga.build(), new THREE.MeshBasicMaterial({ map: texSign, alphaTest: 0.5, side: DS, depthWrite: false, depthFunc: THREE.AlwaysDepth }), -8);
  raised.add(add(Gm.build(), toonMat({ vertexColors: true, side: DS, smooth: true }), 0, true));

  // 灯泡：一个 InstancedMesh，按相位改颜色
  const lampMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(0.135, 14), new THREE.MeshBasicMaterial({ side: DS, fog: false }), lampAt.length);
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S1 = new THREE.Vector3(1, 1, 1), UP = new THREE.Vector3(0, 1, 0);
  lampAt.forEach((a, i) => { Q.setFromAxisAngle(UP, Math.atan2(a.fx, a.fz)); M.compose(V.set(a.x, a.y, a.z), Q, S1); lampMesh.setMatrixAt(i, M); lampMesh.setColorAt(i, new THREE.Color(0x111111)); });
  lampMesh.frustumCulled = false; raised.add(lampMesh); world.lampMesh = lampMesh; world.lamps = lampAt;
  const ON = { R: new THREE.Color(1, 0.08, 0.06), Y: new THREE.Color(1, 0.72, 0.05), G: new THREE.Color(0.1, 1, 0.45) };
  const OFF = { R: new THREE.Color(0.16, 0.02, 0.02), Y: new THREE.Color(0.15, 0.11, 0.02), G: new THREE.Color(0.02, 0.13, 0.07) };
  world.updateSignals = (t) => {
    for (let i = 0; i < lampAt.length; i++) { const a = lampAt[i]; lampMesh.setColorAt(i, signalState(a.j, a.group, t) === a.kind ? ON[a.kind] : OFF[a.kind]); }
    if (lampMesh.instanceColor) lampMesh.instanceColor.needsUpdate = true;
  };

  // ---------- 分块 + 远近两套模型 ----------
  const CELLSZ = 120; world.lod = [];
  const cellsOf = (items) => { const m = new Map(); for (const it of items) { const k = Math.floor(it.x / CELLSZ) + ',' + Math.floor(it.z / CELLSZ); let a = m.get(k); if (!a) m.set(k, a = []); a.push(it); } return [...m.values()]; };
  const inst = (list, geo, mat, fill, parent = raised) => {
    const m = new THREE.InstancedMesh(geo, mat, list.length); list.forEach((it, i) => fill(m, it, i));
    m.computeBoundingSphere(); m.castShadow = m.receiveShadow = true; parent.add(m); return m;
  };
  // 每块的精模 / 简模放进同一个组：超出 far 就把整组关掉（关掉的组渲染时不用逐个遍历里面的东西）
  const addLod = (list, hi, lo, r = 145, far = 700) => {
    let x = 0, z = 0; for (const it of list) { x += it.x; z += it.z; }
    const g = new THREE.Group(), all = [...hi, ...lo]; if (all.length) { all[0].parent.add(g); for (const m of all) g.add(m); }
    world.lod.push({ x: x / list.length, z: z / list.length, hi, lo, near: null, gone: null, r, far, g });
  };
  let first = true;
  /** 每帧调：按距离分块加载 / 卸载建筑 */
  world.stream = (x, z) => bld.ensure(x, z, 3);
  /** 车被搬到了很远的地方（换出发点、开课）：下一帧把周围的楼一次建齐，不然要等十几秒楼才慢慢长出来 */
  world.jump = () => { first = true; };
  world.updateLod = (x, z) => {
    if (first) { bld.ensure(x, z, 1e9); first = false; }
    for (const c of chunks) { const on = Math.hypot(c.x - x, c.z - z) < (c.on ? 900 : 860); if (on !== c.on) { c.on = on; c.m.visible = on; } }
    for (const c of world.lod) {
      const d = Math.hypot(c.x - x, c.z - z), near = d < (c.near ? c.r + 20 : c.r), gone = d > (c.gone ? c.far - 30 : c.far);
      if (gone !== c.gone) { c.gone = gone; c.g.visible = !gone; }
      if (near !== c.near) { c.near = near; for (const m of c.hi) m.visible = near; for (const m of c.lo) m.visible = !near; }
    }
  };

  // ---------- 停着的车 ----------
  {
    const cols = CAR_COLORS.map(c => new THREE.Color(c));
    const paint = toonMat({ vertexColors: true, spec: 1, rim: 0.5, smooth: true, paint: true, glass: 0.5 });
    const gSedan = carModel('sedan'), gSuv = carModel('suv'), gLow = carModelLow(), R = world.group;
    const put = (m, p, i) => { Q.setFromAxisAngle(UP, -p.h); M.compose(V.set(p.x, 0, p.z), Q, S1.set(p.L / 4.55, 1, 1)); m.setMatrixAt(i, M); m.setColorAt(i, cols[Math.floor(hash(Math.round(p.x * 3) * 31 + Math.round(p.z * 3)) * cols.length)]); };
    const isSuv = (p) => hash(Math.round(p.x * 5) + Math.round(p.z * 5) * 17) < 0.36;
    for (const list of cellsOf(map.parked)) {
      const sed = list.filter(p => !isSuv(p)), suv = list.filter(isSuv), hi = [];
      if (sed.length) hi.push(inst(sed, gSedan, paint, put, R)); if (suv.length) hi.push(inst(suv, gSuv, paint, put, R));
      addLod(list, hi, [inst(list, gLow, paint, put, R)], 120, 620);
    }
    S1.set(1, 1, 1);
  }

  // ---------- 路灯、消防栓 ----------
  {
    const lamps = [], hyd = [];
    for (const s of map.segs) {
      if (s.useLen < 50 || s.high) continue;
      for (let u = s.trimA + 15, k = 0; u < s.len - s.trimB - 10; u += 42, k++) {
        const sg = (k + s.id) % 2 ? 1 : -1; pointAt(s, u, P);
        const x = P.x - P.dz * (s.halfW + 0.8) * sg, z = P.z + P.dx * (s.halfW + 0.8) * sg;
        if (map.bldDist(x, z, -1, 3) < 0.6 || !isFree(x, z, 1.2) || map.onRoad(x, z, 0.3)) continue;
        occupy(x, z, 2.8); lamps.push({ x, z, h: Math.atan2(-sg * P.dx, sg * P.dz) });
      }
      for (let u = s.trimA + 24; u < s.len - s.trimB - 12; u += 95) {
        pointAt(s, u, P); const x = P.x - P.dz * (s.halfW + 0.65), z = P.z + P.dx * (s.halfW + 0.65);
        if (map.bldDist(x, z, -1, 3) < 0.5 || !isFree(x, z, 0.4) || map.onRoad(x, z, 0.2)) continue;
        occupy(x, z, 0.5); hyd.push({ x, z, h: Math.atan2(P.dz, P.dx) });
      }
    }
    const matP = toonMat({ vertexColors: true, smooth: true }), gLamp = lampPost(), gHyd = hydrant();
    const put = (m, p, i) => { Q.setFromAxisAngle(UP, -p.h); M.compose(V.set(p.x, 0, p.z), Q, S1.set(1, 1, 1)); m.setMatrixAt(i, M); };
    for (const list of cellsOf(lamps)) addLod(list, [], [inst(list, gLamp, matP, put)], 0, 520);
    for (const list of cellsOf(hyd)) addLod(list, [inst(list, gHyd, matP, put)], [], 110);
  }
  // ---------- 树 ----------
  {
    // 树种看离楼多远：够宽敞才种圆冠 / 伞形的，贴着楼的种窄冠的，再挤就不种
    const spots = [];
    const pick = (d, seed, big) => {
      const r = hash(seed * 7 + 3), want = r < 0.5 ? 0 : r < 0.78 ? 2 : 1;
      for (const kind of [want, 1]) { const sc = Math.min((big ? 1.0 : 0.82) + hash(seed * 3 + 1) * (big ? 0.5 : 0.36), (d - 0.15) / TREE_KINDS[kind].radius); if (sc >= 0.7) return { kind, sc }; }
      return null;
    };
    for (const s of map.segs) {
      if (s.park < 2 || s.useLen < 40) continue;
      for (const sg of [-1, 1]) for (let u = s.trimA + 9, k = 0; u < s.len - s.trimB - 9; u += 12.5, k++) {
        if (hash(s.id * 17 + k * 2 + (sg > 0 ? 1 : 0)) > 0.62) continue;
        pointAt(s, u, P); const x = P.x - P.dz * (s.halfW + 1.25) * sg, z = P.z + P.dx * (s.halfW + 1.25) * sg, d = map.bldDist(x, z, -1, 6);
        const t = d >= 1.1 && pick(d, s.id * 31 + k * 2 + (sg > 0 ? 1 : 0), false);
        if (!t || !isFree(x, z, 0.8) || map.onRoad(x, z, 0.75)) continue;
        occupy(x, z, 0.8); spots.push({ x, z, ...t, h: Math.atan2(P.dz, P.dx), pit: true });
      }
    }
    parkPolys.forEach((pts, pi) => {
      let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.y); z1 = Math.max(z1, p.y); }
      const want = Math.min(70, (x1 - x0) * (z1 - z0) / 140);
      for (let k = 0, n = 0; k < want * 3 && n < want; k++) {
        const x = x0 + hash(pi * 991 + k * 2) * (x1 - x0), z = z0 + hash(pi * 577 + k * 2 + 1) * (z1 - z0);
        if (!inPolyV(pts, x, z) || map.onRoad(x, z, 3) || !isFree(x, z, 2.4)) continue;
        const t = pick(map.bldDist(x, z, -1, 6), pi * 53 + k, true); if (!t) continue;
        occupy(x, z, 2.4); spots.push({ x, z, ...t, h: hash(k + pi) * 6, pit: false }); n++;
      }
    });
    spots.forEach((t, i) => t.i = i);
    bld.samples.tree = spots.filter(t => t.pit && t.sc > 0.95).map(t => ({ x: t.x, z: t.z, nx: Math.cos(t.h), nz: Math.sin(t.h) }));
    const mat = toonMat({ vertexColors: true, paint: 'tint', rim: 0.7, smooth: true }), gHi = TREE_KINDS.map((_, k) => treeModel(k)), gLo = TREE_KINDS.map((_, k) => treeModel(k, true)), gPit = treePit(), pitMat = toonMat({ vertexColors: true });
    const greens = ['#5f9e48', '#6dab50', '#4f9450', '#83b04c', '#4a8a5a', '#e3a3b2'].map(c => new THREE.Color(c));
    const fill = (m, t, i) => { Q.setFromAxisAngle(UP, hash(t.i) * 6); M.compose(V.set(t.x, 0, t.z), Q, S1.set(t.sc, t.sc * (0.94 + hash(t.i * 3) * 0.16), t.sc)); m.setMatrixAt(i, M); m.setColorAt(i, greens[hash(t.i * 31 + 7) < 0.05 ? 5 : t.i % 5]); };
    const pitFill = (m, t, i) => { Q.setFromAxisAngle(UP, -t.h); M.compose(V.set(t.x, 0, t.z), Q, S1.set(1, 1, 1)); m.setMatrixAt(i, M); };
    for (const list of cellsOf(spots)) {
      const hi = [], lo = [];
      for (let k = 0; k < TREE_KINDS.length; k++) { const sub = list.filter(t => t.kind === k); if (sub.length) { hi.push(inst(sub, gHi[k], mat, fill)); lo.push(inst(sub, gLo[k], mat, fill)); } }
      const pits = list.filter(t => t.pit); if (pits.length) { const m = inst(pits, gPit, pitMat, pitFill); m.castShadow = false; hi.push(m); }
      addLod(list, hi, lo, 125);
    }
    S1.set(1, 1, 1);
  }

  world.samples = bld.samples;
  world.updateLod(0, 0);
  world.stats = () => ({ lamps: lampAt.length, parked: map.parked.length, buildings: map.raw.buildings.length, ...bld.stats() });
  return world;
}
