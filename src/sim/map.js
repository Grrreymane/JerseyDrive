// 路网：纯逻辑，不碰 three / DOM，Node 里也能跑。
// 坐标：x 向东、z 向南（米）。路段方向 a→b；横向偏移 o 以行进方向右手边为正。
export const LANE_W = 3.3;
export const XWALK_NEAR = 0.6, XWALK_FAR = 3.6, STOP_LINE = 4.3;   // 距路口边缘（往回量）的距离
export const CAR = { L: 4.6, W: 1.85, wheelbase: 2.7, rearOver: 0.9, center: 1.4, front: 3.7 };   // 参考点是后轴中点
const CELL = 50;
const hash = (n) => { let x = (n ^ 0x9e3779b9) >>> 0; x = Math.imul(x ^ (x >>> 16), 0x85ebca6b); x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
export { hash };

export const CYCLE = { g0: 22, g1: 18, y: 3.5, ar: 1.5 };
CYCLE.total = CYCLE.g0 + CYCLE.g1 + 2 * (CYCLE.y + CYCLE.ar);
/** 某个路口、某组相位在 t 秒时的灯色：'G' | 'Y' | 'R' */
export function signalState(j, group, t) {
  const C = CYCLE; let u = (t + j.offset) % C.total; if (u < 0) u += C.total;
  const s0 = u < C.g0 ? 'G' : u < C.g0 + C.y ? 'Y' : 'R';
  const v = u - (C.g0 + C.y + C.ar);
  const s1 = v < 0 ? 'R' : v < C.g1 ? 'G' : v < C.g1 + C.y ? 'Y' : 'R';
  return group === 0 ? s0 : s1;
}

/** 路段上弧长 s 处的点和切线（a→b 方向） */
export function pointAt(seg, s, out = {}) {
  const n = seg.n; let i = 1;
  s = Math.max(0, Math.min(seg.len, s));
  while (i < n - 1 && seg.cum[i] < s) i++;
  const L = seg.cum[i] - seg.cum[i - 1] || 1, t = (s - seg.cum[i - 1]) / L;
  out.x = seg.px[i - 1] + (seg.px[i] - seg.px[i - 1]) * t; out.z = seg.pz[i - 1] + (seg.pz[i] - seg.pz[i - 1]) * t;
  out.dx = (seg.px[i] - seg.px[i - 1]) / L; out.dz = (seg.pz[i] - seg.pz[i - 1]) / L;
  return out;
}
/** 路段上弧长 s 处的路面高度（高架和匝道才有，地面路是 0） */
export function segY(seg, s) {
  const ys = seg.ys; if (!ys) return 0;
  const n = seg.n; let i = 1; s = Math.max(0, Math.min(seg.len, s));
  while (i < n - 1 && seg.cum[i] < s) i++;
  const L = seg.cum[i] - seg.cum[i - 1] || 1, t = (s - seg.cum[i - 1]) / L;
  return ys[i - 1] + (ys[i] - ys[i - 1]) * t;
}
/** 路段上 (s, o) 处的世界坐标 */
export function offsetPoint(seg, s, o, out = {}) {
  pointAt(seg, s, out); out.x += -out.dz * o; out.z += out.dx * o; return out;
}

/** 车在某条路上、朝某个方向时所处的车道。idx 从行进方向的最左车道数起 */
export function laneInfo(seg, o, fwd) {
  const n = fwd ? seg.lf : seg.lb;
  const rel = fwd ? o - seg.cOff : seg.cOff - o;
  if (n === 0) return { side: 'wrongway', idx: 0, n: 0, rel };
  if (rel < 0) return { side: (fwd ? seg.lb : seg.lf) > 0 ? 'oncoming' : 'park', idx: 0, n, rel };
  const idx = Math.floor(rel / LANE_W);
  if (idx >= n) return { side: 'park', idx: n - 1, n, rel };
  return { side: 'ok', idx, n, rel };
}
export const laneCenter = (seg, fwd, idx) => fwd ? seg.cOff + (idx + 0.5) * LANE_W : seg.cOff - (idx + 0.5) * LANE_W;

/** 从 din 方向开进、dout 方向开出，算转弯类型 */
export function turnType(dinx, dinz, doutx, doutz) {
  const ang = Math.atan2(dinx * doutz - dinz * doutx, dinx * doutx + dinz * doutz) * 180 / Math.PI;
  if (Math.abs(ang) < 32) return 'through';
  if (Math.abs(ang) > 150) return 'uturn';
  return ang > 0 ? 'right' : 'left';
}

function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  lo.pop(); up.pop(); return lo.concat(up);
}
function inConvex(poly, x, z) {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const c = (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]);
    if (c !== 0) { if (sign === 0) sign = c > 0 ? 1 : -1; else if ((c > 0 ? 1 : -1) !== sign) return false; }
  }
  return true;
}

export function prepareMap(raw) {
  const segs = raw.segs.map(s => {
    const n = s.pts.length / 2, px = new Float64Array(n), pz = new Float64Array(n), cum = new Float64Array(n);
    for (let i = 0; i < n; i++) { px[i] = s.pts[2 * i]; pz[i] = s.pts[2 * i + 1]; if (i) cum[i] = cum[i - 1] + Math.hypot(px[i] - px[i - 1], pz[i] - pz[i - 1]); }
    const driveW = (s.lf + s.lb) * LANE_W;
    return { ...s, n, px, pz, cum, high: !!s.ys, len: cum[n - 1], driveW, halfW: driveW / 2 + s.park, cOff: -driveW / 2 + s.lb * LANE_W, trimA: 0, trimB: 0, ja: null, jb: null };
  });
  // ---------- 建筑索引：点到最近一栋楼外墙的距离（在楼里面为负） ----------
  const B = (raw.buildings || []).map((b, i) => {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; const n = b.pts.length / 2;
    for (let k = 0; k < n; k++) { x0 = Math.min(x0, b.pts[2 * k]); x1 = Math.max(x1, b.pts[2 * k]); z0 = Math.min(z0, b.pts[2 * k + 1]); z1 = Math.max(z1, b.pts[2 * k + 1]); }
    return { i, n, pts: b.pts, x0, x1, z0, z1, skip: false };
  });
  const BC = 40, bGrid = new Map(), bkey = (cx, cz) => cx * 73856093 ^ cz * 19349663, BMAX = 14;
  for (const b of B) for (let cx = Math.floor((b.x0 - BMAX) / BC); cx <= Math.floor((b.x1 + BMAX) / BC); cx++) for (let cz = Math.floor((b.z0 - BMAX) / BC); cz <= Math.floor((b.z1 + BMAX) / BC); cz++) {
    const k = bkey(cx, cz); let a = bGrid.get(k); if (!a) bGrid.set(k, a = []); a.push(b);
  }
  const bldDist = (x, z, ignore = -1, maxR = BMAX) => {
    const list = bGrid.get(bkey(Math.floor(x / BC), Math.floor(z / BC))); let best = maxR; bldDist.last = -1;
    if (!list) return best;
    for (const b of list) {
      if (b.i === ignore || b.skip || x < b.x0 - best || x > b.x1 + best || z < b.z0 - best || z > b.z1 + best) continue;
      let inside = false, dm = 1e9; const p = b.pts;
      for (let k = 0, j = b.n - 1; k < b.n; j = k++) {
        const ax = p[2 * k], az = p[2 * k + 1], bx = p[2 * j], bz = p[2 * j + 1];
        if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
        const ex = bx - ax, ez = bz - az, L2 = ex * ex + ez * ez || 1; let t = ((x - ax) * ex + (z - az) * ez) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
        const d = Math.hypot(x - ax - ex * t, z - az - ez * t); if (d < dm) dm = d;
      }
      if (inside) dm = -dm;
      if (dm < best) { best = dm; bldDist.last = b.i; }
    }
    return best;
  };
  // 路宽是按车道数估的，可能比实际宽。沿路量一下两侧的楼离得多近：
  //   楼压到行车道上 → 这栋楼不画；只是离得近 → 把路边停车带收窄，至少留出 1.6 米人行道
  const P0 = {};
  for (const s of segs) {
    let clear = 1e9;
    for (let pass = 0; pass < 6; pass++) {
      clear = 1e9; let again = false;
      for (let u = 0; u <= s.len; u += 6) {
        pointAt(s, u, P0); const d = bldDist(P0.x, P0.z, -1, BMAX);
        if (d < s.driveW / 2 + 0.5) { if (bldDist.last >= 0) { B[bldDist.last].skip = true; again = true; } } else if (d < clear) clear = d;
      }
      if (!again) break;
    }
    if (clear < s.halfW + 1.6) { s.park = Math.max(0.3, Math.min(s.park, clear - 1.6 - s.driveW / 2)); s.halfW = s.driveW / 2 + s.park; }
  }

  const tmp = {}, tmp2 = {};
  // 沿路段从某一端往里走 d 米处的点；ox,oz 是“离开路口”的方向
  const fromEnd = (seg, end, d, out) => {
    pointAt(seg, end === 'a' ? d : seg.len - d, out);
    if (end === 'a') { out.ox = out.dx; out.oz = out.dz; } else { out.ox = -out.dx; out.oz = -out.dz; }
    return out;
  };

  const juncs = raw.juncs.map(j => ({ y: 0, ...j, legs: j.legs.map(l => ({ ...l })), offset: hash(j.id * 7 + 3) * CYCLE.total }));
  for (const j of juncs) {
    for (const l of j.legs) {
      const seg = segs[l.seg]; l.segRef = seg;
      if (l.end === 'a') seg.ja = j; else seg.jb = j;
      const e = fromEnd(seg, l.end, 0, tmp), f = fromEnd(seg, l.end, Math.min(10, seg.len), tmp2);
      const L = Math.hypot(f.x - e.x, f.z - e.z) || 1;
      l.px = e.x; l.pz = e.z; l.dx = (f.x - e.x) / L; l.dz = (f.z - e.z) / L; l.w = seg.halfW;
      l.approach = !seg.oneway || l.end === 'b';   // 车可以从这条腿开进路口
      l.exit = !seg.oneway || l.end === 'a';       // 车可以从这条腿开出路口
    }
    // 每条腿往回退多少，路面才不会和别的路重叠
    const joint = j.control === 'joint';
    for (const l of j.legs) {
      const seg = l.segRef, cap = Math.max(0.5, Math.min(35, seg.len * 0.45));
      let s = joint ? 0.5 : 2;
      for (; s < cap; s += 0.5) {
        const q = fromEnd(seg, l.end, s, tmp); let clear = true;
        for (const sgn of [-1, 1]) {
          const cx = q.x - q.oz * l.w * sgn, cz = q.z + q.ox * l.w * sgn;
          for (const m of j.legs) {
            if (m === l) continue;
            const rx = cx - m.px, rz = cz - m.pz, t = rx * m.dx + rz * m.dz, u = Math.abs(rx * m.dz - rz * m.dx);
            if (t > -1 && t < 60 && u < m.w + 0.2) { clear = false; break; }
          }
          if (!clear) break;
        }
        if (clear) break;
      }
      l.trim = Math.min(cap, s + (joint ? 0 : 0.5));
      if (l.end === 'a') seg.trimA = l.trim; else seg.trimB = l.trim;
    }
    const corners = [];
    for (const l of j.legs) {
      const q = fromEnd(l.segRef, l.end, l.trim, tmp);
      l.ex = q.x; l.ez = q.z; l.ox = q.ox; l.oz = q.oz;      // 路口边缘中点、往外的方向
      corners.push([q.x - q.oz * l.w, q.z + q.ox * l.w], [q.x + q.oz * l.w, q.z - q.ox * l.w]);
    }
    j.poly = convexHull(corners);
    let cx = 0, cz = 0; for (const p of j.poly) { cx += p[0]; cz += p[1]; } j.cx = cx / j.poly.length; j.cz = cz / j.poly.length;
    j.r = Math.max(...j.poly.map(p => Math.hypot(p[0] - j.cx, p[1] - j.cz)));
    j.name = [...new Set(j.legs.map(l => l.segRef.name).filter(Boolean))].slice(0, 2).join(' & ');
  }
  for (const s of segs) { s.useLen = s.len - s.trimA - s.trimB; }

  // 空间网格
  const key = (cx, cz) => cx * 73856093 ^ cz * 19349663;
  const segGrid = new Map(), juncGrid = new Map();
  const put = (g, x0, z0, x1, z1, v) => {
    for (let cx = Math.floor(x0 / CELL); cx <= Math.floor(x1 / CELL); cx++) for (let cz = Math.floor(z0 / CELL); cz <= Math.floor(z1 / CELL); cz++) {
      const k = key(cx, cz); let a = g.get(k); if (!a) g.set(k, a = []); a.push(v);
    }
  };
  for (const s of segs) for (let i = 1; i < s.n; i++) {
    const m = s.halfW + 3;
    put(segGrid, Math.min(s.px[i - 1], s.px[i]) - m, Math.min(s.pz[i - 1], s.pz[i]) - m, Math.max(s.px[i - 1], s.px[i]) + m, Math.max(s.pz[i - 1], s.pz[i]) + m, [s, i]);
  }
  for (const j of juncs) put(juncGrid, j.cx - j.r, j.cz - j.r, j.cx + j.r, j.cz + j.r, j);

  const map = { raw, segs, juncs, half: raw.half, origin: raw.origin, bldDist, buildings: B };

  /** 最近的路段：返回 {seg, s, o, d, dx, dz, y}，d 是到中心线的距离。传了 y 就只在那一层找（高架和它下面的路在平面上是叠着的） */
  map.locate = (x, z, out = {}, y) => {
    const list = segGrid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    out.seg = null; let best = 1e9;
    if (!list) return out;
    for (const [s, i] of list) {
      const ax = s.px[i - 1], az = s.pz[i - 1], ex = s.px[i] - ax, ez = s.pz[i] - az, L2 = ex * ex + ez * ez || 1;
      let t = ((x - ax) * ex + (z - az) * ez) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + ex * t, qz = az + ez * t, d = Math.hypot(x - qx, z - qz);
      const sy = s.ys ? s.ys[i - 1] + (s.ys[i] - s.ys[i - 1]) * t : 0;
      if (y !== undefined && Math.abs(sy - y) > 3) continue;
      if (d < best) {
        out.y = sy;
        best = d; const L = Math.sqrt(L2);
        out.seg = s; out.s = s.cum[i - 1] + L * t; out.dx = ex / L; out.dz = ez / L;
        out.o = (x - ax) * (-ez / L) + (z - az) * (ex / L); out.d = d;
      }
    }
    return out;
  };
  map.junctionAt = (x, z, y) => {
    const list = juncGrid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    if (list) for (const j of list) if ((y === undefined || Math.abs(j.y - y) < 3) && Math.hypot(x - j.cx, z - j.cz) <= j.r + 0.01 && inConvex(j.poly, x, z)) return j;
    return null;
  };
  const L0 = {};
  map.onRoad = (x, z, margin = 0, y) => {
    if (map.junctionAt(x, z, y)) return true;
    const l = map.locate(x, z, L0, y); if (!l.seg) return false;
    return Math.abs(l.o) <= l.seg.halfW + margin && l.s >= l.seg.trimA - 0.5 && l.s <= l.seg.len - l.seg.trimB + 0.5 && l.d <= l.seg.halfW + margin;
  };
  map.legOf = (j, seg, end) => j ? j.legs.find(l => l.segRef === seg && l.end === end) : null;

  // ---------- 路边停的车（确定性生成），顺便建碰撞网格 ----------
  const parked = [], parkGrid = new Map();
  for (const s of segs) {
    if (s.park < 2 || s.useLen < 34) continue;
    const pad = (j) => (j && j.control !== 'joint') ? STOP_LINE + 8 : 2;       // 人行横道前 25 英尺内不能停车
    const s0 = s.trimA + pad(s.ja), s1 = s.len - s.trimB - pad(s.jb);
    for (const side of [1, -1]) {
      let k = 0;
      for (let u = s0 + 3; u + 3 < s1; u += 6.1, k++) {
        const r = hash(s.id * 131 + k * 2 + (side > 0 ? 0 : 1));
        if (r > 0.72) continue;
        const q = offsetPoint(s, u, side * (s.halfW - 1.15) + (hash(k + s.id) - 0.5) * 0.16, {});
        const faceFwd = side > 0 || s.oneway;
        const car = { x: q.x, z: q.z, h: Math.atan2(q.dz, q.dx) + (faceFwd ? 0 : Math.PI), L: 4.3 + hash(k * 3 + s.id) * 0.5, W: 1.8, c: Math.floor(hash(k * 5 + s.id * 3) * 8), seg: s.id };
        parked.push(car); put(parkGrid, car.x - 3, car.z - 3, car.x + 3, car.z + 3, car);
      }
    }
  }
  map.parked = parked;
  /** 车身矩形（中心 cx,cz、朝向 h、半长 hl、半宽 hw）有没有撞到停着的车 */
  map.hitParked = (cx, cz, h, hl, hw) => {
    const list = parkGrid.get(key(Math.floor(cx / CELL), Math.floor(cz / CELL))); if (!list) return null;
    for (const p of list) {
      if (Math.abs(p.x - cx) > 6 || Math.abs(p.z - cz) > 6) continue;
      if (obbOverlap(cx, cz, h, hl, hw, p.x, p.z, p.h, p.L / 2, p.W / 2)) return p;
    }
    return null;
  };

  /** 把车摆回最近的车道中央。返回 {x,z,h}（后轴位置） */
  map.snapToLane = (x, z, h, y) => {
    const l = map.locate(x, z, {}, y); if (!l.seg) return null;
    const seg = l.seg; let fwd = Math.cos(h) * l.dx + Math.sin(h) * l.dz >= 0;
    if (!fwd && seg.lb === 0) fwd = true;
    const n = fwd ? seg.lf : seg.lb;
    const s = Math.max(seg.trimA + 8, Math.min(seg.len - seg.trimB - 8, l.s));
    const q = offsetPoint(seg, s, laneCenter(seg, fwd, n - 1), {});
    const hh = Math.atan2(q.dz, q.dx) + (fwd ? 0 : Math.PI);
    return { x: q.x - Math.cos(hh) * CAR.center, z: q.z - Math.sin(hh) * CAR.center, h: hh, y: segY(seg, s) };
  };
  return map;
}

export function obbOverlap(ax, az, ah, al, aw, bx, bz, bh, bl, bw) {
  const axes = [[Math.cos(ah), Math.sin(ah)], [-Math.sin(ah), Math.cos(ah)], [Math.cos(bh), Math.sin(bh)], [-Math.sin(bh), Math.cos(bh)]];
  const dx = bx - ax, dz = bz - az;
  for (const [ux, uz] of axes) {
    const ra = al * Math.abs(ux * axes[0][0] + uz * axes[0][1]) + aw * Math.abs(ux * axes[1][0] + uz * axes[1][1]);
    const rb = bl * Math.abs(ux * axes[2][0] + uz * axes[2][1]) + bw * Math.abs(ux * axes[3][0] + uz * axes[3][1]);
    if (Math.abs(dx * ux + dz * uz) > ra + rb) return false;
  }
  return true;
}
