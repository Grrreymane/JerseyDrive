// 学校区：真实学校（data/schools.json，tools/fetch_schools.mjs 从 OSM 下载）旁边的路段限速 25 mph。纯逻辑。
// 新泽西 39:4-98：经过学校时，上下学时间、课间、路上看得见孩子时限速 25 mph。游戏里没有钟点，学校区一直按 25 判。
import { pointAt } from './map.js';

export const SCHOOL_MPH = 25;
const NEAR_POLY = 22, NEAR_PT = 60, EXTEND = 45;      // 离校园轮廓多近算挨着学校；只有一个点的学校按半径算；区段往两头各延长多少

function distPoly(x, z, P) {
  if (P.length === 1) return Math.max(0, Math.hypot(x - P[0][0], z - P[0][1]) - (NEAR_PT - NEAR_POLY));
  let inside = false, best = 1e9;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [ax, az] = P[j], [bx, bz] = P[i];
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
    const dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz, u = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)) : 0;
    best = Math.min(best, Math.hypot(x - ax - dx * u, z - az - dz * u));
  }
  return inside ? 0 : best;
}

/** 给挨着学校的路段标上 seg.school = [{ s0, s1, name }]。高速、匝道、高架不算 */
export function markSchools(map, rows) {
  const o = map.origin, S = rows.map(r => {
    const P = r.pts.map(([la, lo]) => [(lo - o.lon) * o.kx, -(la - o.lat) * o.kz]);
    const xs = P.map(p => p[0]), zs = P.map(p => p[1]), m = NEAR_PT + 5;
    return { name: r.name, P, x0: Math.min(...xs) - m, x1: Math.max(...xs) + m, z0: Math.min(...zs) - m, z1: Math.max(...zs) + m };
  });
  const Q = {}; let n = 0;
  for (const seg of map.segs) {
    if (seg.high || /^(motorway|trunk)/.test(seg.cls) || /_link$/.test(seg.cls)) continue;
    let sx0 = 1e9, sx1 = -1e9, sz0 = 1e9, sz1 = -1e9; for (let i = 0; i < seg.px.length; i++) { sx0 = Math.min(sx0, seg.px[i]); sx1 = Math.max(sx1, seg.px[i]); sz0 = Math.min(sz0, seg.pz[i]); sz1 = Math.max(sz1, seg.pz[i]); }
    const near = S.filter(sc => sc.x1 > sx0 && sc.x0 < sx1 && sc.z1 > sz0 && sc.z0 < sz1); if (!near.length) continue;
    const a = seg.trimA, b = seg.len - seg.trimB; if (b - a < 25) continue;
    const zones = [];
    for (const sc of near) {
      let lo = null, hi = null;
      for (let s = a; s <= b; s += 6) { pointAt(seg, s, Q); if (distPoly(Q.x, Q.z, sc.P) < NEAR_POLY + seg.halfW) { if (lo === null) lo = s; hi = s; } }
      if (lo !== null) zones.push({ s0: Math.max(a, lo - EXTEND), s1: Math.min(b, hi + EXTEND), name: sc.name });
    }
    if (!zones.length) continue;
    zones.sort((p, q) => p.s0 - q.s0);
    const merged = [];
    for (const z of zones) { const L = merged[merged.length - 1]; if (L && z.s0 <= L.s1 + 30) { L.s1 = Math.max(L.s1, z.s1); if (!L.name) L.name = z.name; } else merged.push({ ...z }); }
    seg.school = merged; n += merged.length;
  }
  return n;
}

/** 这个位置的学校区（没有就 null） */
export function schoolAt(seg, s) {
  if (!seg.school) return null;
  for (const z of seg.school) if (s >= z.s0 && s <= z.s1) return z;
  return null;
}
/** 这里的限速：学校区里取 25 和路段限速里小的那个 */
export const limitAt = (seg, s) => (seg.school && schoolAt(seg, s) ? Math.min(seg.speed, SCHOOL_MPH) : seg.speed);
