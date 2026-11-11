// 建筑零件库：窗、店面、门、雨棚、招牌、台阶。每个零件都是有厚度的实体，按实例摆到墙上。
// 零件本地坐标：x 沿墙面，y 向上，z 朝外（墙面在 z = 0，负的是墙洞里面）。原点在洞口底边中点。
// 顶点色约定：中性灰（r = g = b）的部分会乘上实例颜色（门窗漆色、雨棚布色）；带色相的是固定材质（石材、金属、暖色室内）。
import { Geo, lin } from './geo.js';

const T = (v) => [v, v, v];
const STONE = lin('#d6cfbf'), STONE_D = lin('#b9b1a0'), CREAM = lin('#efe8d8'), IRON = lin('#2c2b30'), METAL = lin('#8d939b'), BRASS = lin('#d8a848');
const WARM = [0.5, 0.39, 0.28], WARM_D = [0.3, 0.23, 0.17], CEIL = [0.42, 0.37, 0.31], DECK = lin('#8a6a4c'), GLOW = [1.9, 1.6, 1.0], TILE = lin('#a9a294'), DIM = [0.4, 0.3, 0.24];
const N4 = (n) => [n, n, n, n];

/** 尺寸表：洞口的名义宽高，摆放时按实际洞口缩放 */
export const KIT = { winA: [1.2, 1.7], winB: [1.5, 1.6], winC: [1.1, 1.6], shop: [2.8, 2.9], resDoor: [1.1, 2.55], stoopH: 0.6, stoopOut: 1.45, pilW: 0.44 };

const sill = (G, W, out = 0.09, col = STONE) => G.extrudeX([[-0.2, 0], [-0.2, 0.035], [out, 0.008], [out, -0.07], [0, -0.07], [0, 0]], -W - 0.09, W + 0.09, col);

/** 上下推拉窗：窗框、中横档、上扇竖棂、外伸窗台、石过梁 */
export function winA() {
  const G = new Geo(), W = 0.6, H = 1.7, zb = -0.19, zf = -0.11, F = T(1);
  G.aabb(-W, 0.03, zb, -W + 0.07, H, zf, F); G.aabb(W - 0.07, 0.03, zb, W, H, zf, F);
  G.aabb(-W + 0.07, H - 0.07, zb, W - 0.07, H, zf, F); G.aabb(-W + 0.07, 0.03, zb, W - 0.07, 0.11, zf, F);
  G.aabb(-W + 0.07, 0.82, zb, W - 0.07, 0.89, zf + 0.015, F);          // 上下扇搭接处
  G.aabb(-0.014, 0.89, zb, 0.014, H - 0.07, zf - 0.025, F);            // 上扇竖棂
  sill(G, W);
  G.extrudeX([[0, H], [0.04, H + 0.012], [0.04, H + 0.2], [0, H + 0.215]], -W - 0.12, W + 0.12, STONE);
  return G.build();
}
/** 对开窗：四周一圈凸出的石窗套 */
export function winB() {
  const G = new Geo(), W = 0.75, H = 1.6, zb = -0.19, zf = -0.11, F = T(1);
  G.aabb(-W, 0.03, zb, -W + 0.06, H, zf, F); G.aabb(W - 0.06, 0.03, zb, W, H, zf, F);
  G.aabb(-W + 0.06, H - 0.06, zb, W - 0.06, H, zf, F); G.aabb(-W + 0.06, 0.03, zb, W - 0.06, 0.1, zf, F);
  G.aabb(-0.03, 0.1, zb, 0.03, H - 0.06, zf + 0.012, F);
  for (const s of [-1, 1]) G.aabb(s * 0.39 - 0.011, 0.1, zb, s * 0.39 + 0.011, H - 0.06, zf - 0.025, F);
  G.aabb(-W + 0.06, H * 0.68, zb, W - 0.06, H * 0.68 + 0.022, zf - 0.025, F);
  for (const s of [-1, 1]) G.extrudeX([[0, 0], [0.045, 0.0], [0.045, H + 0.12], [0, H + 0.12]], s * (W + 0.055) - 0.055, s * (W + 0.055) + 0.055, STONE);
  G.extrudeX([[0, H], [0.045, H], [0.07, H + 0.1], [0.07, H + 0.15], [0, H + 0.17]], -W - 0.14, W + 0.14, STONE);
  sill(G, W + 0.05, 0.11);
  return G.build();
}
/** 带百叶护窗板的窗（木板房）：窗框固定米白，护窗板跟实例颜色走 */
export function winC() {
  const G = new Geo(), W = 0.55, H = 1.6, zb = -0.19, zf = -0.11, F = CREAM;
  G.aabb(-W, 0.03, zb, -W + 0.07, H, zf, F); G.aabb(W - 0.07, 0.03, zb, W, H, zf, F);
  G.aabb(-W + 0.07, H - 0.07, zb, W - 0.07, H, zf, F); G.aabb(-W + 0.07, 0.03, zb, W - 0.07, 0.11, zf, F);
  G.aabb(-W + 0.07, 0.79, zb, W - 0.07, 0.86, zf + 0.015, F);
  G.aabb(-0.012, 0.11, zb, 0.012, H - 0.07, zf - 0.025, F);
  for (const s of [-1, 1]) {      // 外面一圈平的木窗套 + 护窗板
    G.aabb(s * (W + 0.045) - 0.045, -0.02, 0, s * (W + 0.045) + 0.045, H + 0.02, 0.028, F);
    const x0 = s * (W + 0.09 + 0.2) - 0.2, x1 = x0 + 0.4;
    G.aabb(x0, 0, 0, x1, H, 0.022, T(0.82));
    G.aabb(x0, 0, 0.022, x0 + 0.05, H, 0.04, T(1)); G.aabb(x1 - 0.05, 0, 0.022, x1, H, 0.04, T(1));
    for (const y of [0, H * 0.5 - 0.03, H - 0.06]) G.aabb(x0 + 0.05, y, 0.022, x1 - 0.05, y + 0.06, 0.04, T(1));
    for (let k = 0; k < 9; k++) { const y = 0.1 + k * (H - 0.2) / 9 + (k >= 4.5 ? 0.02 : 0); G.aabb(x0 + 0.06, y, 0.022, x1 - 0.06, y + 0.05, 0.034, T(0.92)); }
  }
  G.aabb(-W - 0.09, H + 0.02, 0, W + 0.09, H + 0.13, 0.04, F); G.aabb(-W - 0.12, H + 0.13, 0, W + 0.12, H + 0.165, 0.065, F);
  sill(G, W, 0.08, CREAM);
  return G.build();
}

const SW = 1.4, SH = 2.9, BK = 0.52;
/** 橱窗：窗下墙（带镶板和压条）、窗框、横档、浅浅的一层店内空间（展台、背板、吊灯、几件货） */
export function shopWin(variant = 0) {
  const G = new Geo(), zf = -0.05, top = BK + 0.055;
  G.aabb(-SW, 0, -0.3, SW, BK, zf, T(0.8));
  for (const s of [-1, 1]) { G.aabb(s * 0.69 - 0.57, 0.09, zf, s * 0.69 + 0.57, BK - 0.09, zf + 0.022, T(0.95)); G.aabb(s * 0.69 - 0.47, 0.17, zf + 0.022, s * 0.69 + 0.47, BK - 0.17, zf + 0.034, T(0.86)); }
  G.extrudeX([[-0.3, BK], [-0.3, top], [-0.025, top], [0, BK + 0.03], [0, BK - 0.02], [zf, BK - 0.02]], -SW, SW, T(1));
  G.aabb(-SW, 0, zf, SW, 0.06, zf + 0.03, STONE_D);                    // 贴地的石踢脚
  const f0 = -0.17, f1 = -0.08;
  G.aabb(-SW, top, f0, -SW + 0.07, SH, f1, T(1)); G.aabb(SW - 0.07, top, f0, SW, SH, f1, T(1));
  G.aabb(-SW + 0.07, SH - 0.07, f0, SW - 0.07, SH, f1, T(1)); G.aabb(-SW + 0.07, 2.2, f0, SW - 0.07, 2.27, f1 + 0.015, T(1));
  if (variant === 0) G.aabb(-0.03, top, f0, 0.03, 2.2, f1, T(1));
  for (const x of variant === 0 ? [-0.7, 0, 0.7] : [-0.93, -0.47, 0, 0.47, 0.93]) G.aabb(x - 0.02, 2.27, f0, x + 0.02, SH - 0.07, f1 - 0.01, T(1));
  // 店内：都朝外，从街上隔着玻璃能看到
  const zi = -1.1, y0 = top;
  G.quadN([[-SW, y0, zi], [SW, y0, zi], [SW, y0, f0], [-SW, y0, f0]], N4([0, 1, 0]), DECK);
  G.quadN([[-SW, y0, zi], [SW, y0, zi], [SW, SH, zi], [-SW, SH, zi]], N4([0, 0, 1]), WARM);
  G.quadN([[-SW, y0, zi], [-SW, y0, f0], [-SW, SH, f0], [-SW, SH, zi]], N4([1, 0, 0]), WARM_D);
  G.quadN([[SW, y0, zi], [SW, y0, f0], [SW, SH, f0], [SW, SH, zi]], N4([-1, 0, 0]), WARM_D);
  G.quadN([[-SW, SH, zi], [SW, SH, zi], [SW, SH, f0], [-SW, SH, f0]], N4([0, -1, 0]), CEIL);
  if (variant === 0) {      // 货架 + 几样货
    G.aabb(-1.2, y0 + 0.75, zi, 1.2, y0 + 0.8, zi + 0.24, DECK); G.aabb(-1.2, y0 + 1.3, zi, 1.2, y0 + 1.35, zi + 0.24, DECK);
    const items = [[-1.0, lin('#c8443a')], [-0.72, lin('#e0a030')], [-0.4, lin('#2f6f8f')], [0.15, lin('#efe8d8')], [0.5, lin('#2e7d5b')], [0.92, lin('#c8443a')]];
    items.forEach(([x, c], i) => { G.aabb(x - 0.1, y0 + 0.8, zi + 0.03, x + 0.1, y0 + 0.98 + (i % 3) * 0.07, zi + 0.2, c); G.aabb(x - 0.07 + 0.2, y0 + 1.35, zi + 0.04, x + 0.09 + 0.2, y0 + 1.55 + (i % 2) * 0.1, zi + 0.19, items[(i + 2) % 6][1]); });
    G.aabb(-0.95, y0, -0.75, -0.45, y0 + 0.42, -0.35, CREAM); G.ellipsoid(-0.7, y0 + 0.6, -0.55, 0.13, 0.19, 0.13, lin('#2f6f8f'), 5, 8);
    G.aabb(0.4, y0, -0.8, 1.05, y0 + 0.26, -0.35, CREAM); G.aabb(0.5, y0 + 0.26, -0.72, 0.78, y0 + 0.5, -0.46, lin('#e0a030')); G.aabb(0.8, y0 + 0.26, -0.7, 0.98, y0 + 0.4, -0.5, lin('#c8443a'));
  } else {                  // 咖啡店：吧台 + 高凳 + 菜单板
    G.aabb(-1.3, y0, zi + 0.02, 0.2, y0 + 0.62, zi + 0.4, DECK, CREAM);
    G.aabb(-1.1, y0 + 1.05, zi, 0.1, y0 + 1.75, zi + 0.04, IRON); for (let k = 0; k < 4; k++) G.aabb(-1.0, y0 + 1.18 + k * 0.14, zi + 0.04, -0.2 + (k % 2) * 0.2, y0 + 1.22 + k * 0.14, zi + 0.045, CREAM);
    for (const x of [0.55, 1.0]) { G.cyl(x, y0, y0 + 0.5, -0.55, 0.02, 0.02, 6, METAL); G.cyl(x, y0 + 0.5, y0 + 0.55, -0.55, 0.13, 0.13, 10, lin('#c8443a'), true); }
    G.ellipsoid(-0.75, y0 + 0.72, zi + 0.22, 0.09, 0.1, 0.09, METAL, 5, 8);
  }
  for (const x of [-0.7, 0.7]) { G.cyl(x, SH - 0.5, SH, -0.6, 0.008, 0.008, 5, IRON); G.ellipsoid(x, SH - 0.56, -0.6, 0.1, 0.07, 0.1, GLOW, 5, 8); }
  return G.build();
}
/** 橱窗玻璃（半透明，单独一个零件） */
export function shopWinGlass() {
  const G = new Geo(), z = -0.125, y0 = BK + 0.055, x = SW - 0.07;
  G.quadN([[-x, y0, z], [x, y0, z], [x, SH - 0.07, z], [-x, SH - 0.07, z]], N4([0, 0, 1]), [1, 1, 1], [[0, 0], [1, 0], [1, 1], [0, 1]]);
  return G.build();
}

const DR = 0.85, DW = 0.55;       // 店门退进去多深、门扇半宽
const doorSides = (fn) => { for (const s of [-1, 1]) { const A = [s * SW, -0.08], B = [s * (DW + 0.09), -DR], l = Math.hypot(A[0] - B[0], A[1] - B[1]); fn(s, A, B, [-s * (A[1] - B[1]) / l, 0, s * (A[0] - B[0]) / l]); } };      // 法线朝门斗里面、朝街
/** 店门：往里退的门斗（两侧是斜的小橱窗）、门框、带玻璃的门扇、拉手、门槛、亮子 */
export function shopDoor() {
  const G = new Geo(), top = BK + 0.055;
  doorSides((s, A, B, n) => {
    const P = (p, y) => [p[0], y, p[1]];
    G.quadN([P(A, 0), P(B, 0), P(B, BK), P(A, BK)], N4(n), T(0.8));
    G.quadN([P(A, BK), P(B, BK), P(B, top), P(A, top)], N4(n), T(1));
    G.quadN([P(A, SH - 0.07), P(B, SH - 0.07), P(B, SH), P(A, SH)], N4(n), T(1));
    G.aabb(A[0] - 0.04, top, A[1] - 0.06, A[0] + 0.04, SH, A[1] + 0.02, T(1));
    // 斜橱窗里面：展台 + 两面背板
    G.quadN([[A[0], top, A[1]], [B[0], top, B[1]], [A[0], top, B[1]], [A[0], top, B[1]]], N4([0, 1, 0]), DECK);
    G.quadN([[A[0], top, A[1]], [A[0], top, B[1]], [A[0], SH, B[1]], [A[0], SH, A[1]]], N4([-s, 0, 0]), WARM_D);
    G.quadN([[B[0], top, B[1]], [A[0], top, B[1]], [A[0], SH, B[1]], [B[0], SH, B[1]]], N4([0, 0, 1]), WARM);
    G.ellipsoid(s * 1.08, top + 0.2, -0.55, 0.1, 0.2, 0.1, s > 0 ? lin('#c8443a') : lin('#e0a030'), 5, 8);
    G.aabb(s * (DW + 0.045) - 0.045, 0, -DR - 0.06, s * (DW + 0.045) + 0.045, SH, -DR + 0.04, T(1));      // 门框立柱
  });
  G.quadN([[-SW, 0.02, -0.08], [SW, 0.02, -0.08], [DW + 0.09, 0.02, -DR], [-DW - 0.09, 0.02, -DR]], N4([0, 1, 0]), TILE);
  G.quadN([[-SW, SH, -0.08], [SW, SH, -0.08], [DW + 0.09, SH, -DR], [-DW - 0.09, SH, -DR]], N4([0, -1, 0]), CEIL);
  G.aabb(-DW, 2.22, -DR - 0.06, DW, 2.3, -DR + 0.04, T(1)); G.aabb(-DW, SH - 0.07, -DR - 0.06, DW, SH, -DR + 0.04, T(1));
  // 门扇：边梃、上下冒头
  const z0 = -DR - 0.03, z1 = -DR + 0.018, L = T(0.72);
  G.aabb(-DW, 0.04, z0, -DW + 0.1, 2.22, z1, L); G.aabb(DW - 0.1, 0.04, z0, DW, 2.22, z1, L);
  G.aabb(-DW + 0.1, 2.1, z0, DW - 0.1, 2.22, z1, L); G.aabb(-DW + 0.1, 0.04, z0, DW - 0.1, 0.32, z1, L);
  G.aabb(-DW + 0.1, 0.1, z1, DW - 0.1, 0.26, z1 + 0.006, METAL);       // 踢脚板
  G.pipe([[DW - 0.16, 0.92, z1], [DW - 0.16, 0.92, z1 + 0.05], [DW - 0.16, 1.36, z1 + 0.05], [DW - 0.16, 1.36, z1]], 0.013, 7, METAL);
  G.aabb(-DW - 0.02, 0, -DR - 0.03, DW + 0.02, 0.04, -DR + 0.08, METAL);
  G.quadN([[-DW, 0, -DR - 0.7], [DW, 0, -DR - 0.7], [DW, SH, -DR - 0.7], [-DW, SH, -DR - 0.7]], N4([0, 0, 1]), DIM);      // 门后面的暗处
  G.quadN([[-DW, 0.03, -DR - 0.7], [DW, 0.03, -DR - 0.7], [DW, 0.03, -DR], [-DW, 0.03, -DR]], N4([0, 1, 0]), DECK);
  for (const s of [-1, 1]) G.quadN([[s * DW, 0, -DR - 0.7], [s * DW, 0, -DR], [s * DW, SH, -DR], [s * DW, SH, -DR - 0.7]], N4([-s, 0, 0]), DIM);
  G.ellipsoid(0, SH - 0.06, -0.45, 0.11, 0.035, 0.11, GLOW, 4, 10);   // 门斗顶上的筒灯
  return G.build();
}
export function shopDoorGlass() {
  const G = new Geo(), top = BK + 0.055, UV = [[0, 0], [1, 0], [1, 1], [0, 1]];
  doorSides((s, A, B, n) => G.quadN([[A[0], top, A[1]], [B[0], top, B[1]], [B[0], SH - 0.07, B[1]], [A[0], SH - 0.07, A[1]]], N4(n), [1, 1, 1], UV));
  G.quadN([[-DW + 0.1, 0.32, -DR - 0.005], [DW - 0.1, 0.32, -DR - 0.005], [DW - 0.1, 2.1, -DR - 0.005], [-DW + 0.1, 2.1, -DR - 0.005]], N4([0, 0, 1]), [1, 1, 1], UV);
  G.quadN([[-DW, 2.3, -DR - 0.01], [DW, 2.3, -DR - 0.01], [DW, SH - 0.07, -DR - 0.01], [-DW, SH - 0.07, -DR - 0.01]], N4([0, 0, 1]), [1, 1, 1], UV);
  return G.build();
}

/** 店面壁柱：柱础、带镶板的柱身、柱头 */
export function pilaster() {
  const G = new Geo(), H = 2.95;
  G.extrudeX([[0, 0], [0.1, 0], [0.1, 0.3], [0.065, 0.38], [0, 0.38]], -0.22, 0.22, STONE_D);
  G.aabb(-0.2, 0.38, 0, 0.2, 2.7, 0.06, T(0.86));
  G.aabb(-0.2, 0.38, 0.06, -0.13, 2.7, 0.078, T(1)); G.aabb(0.13, 0.38, 0.06, 0.2, 2.7, 0.078, T(1));
  G.aabb(-0.13, 0.38, 0.06, 0.13, 0.5, 0.078, T(1)); G.aabb(-0.13, 2.58, 0.06, 0.13, 2.7, 0.078, T(1));
  G.extrudeX([[0, 2.7], [0.075, 2.7], [0.09, 2.77], [0.125, 2.81], [0.125, H], [0, H]], -0.24, 0.24, T(1));
  return G.build();
}

/** 雨棚：有厚度的布面（上下两层）、前垂边、封住的两头、前横杆和两根斜撑。宽 3 米、挑出 1 米 */
export function awning(striped = true) {
  const G = new Geo(), W = 1.5, out = 1.0, drop = 0.5, val = 0.2, NS = 10, nl = Math.hypot(out, drop), nT = [0, out / nl, drop / nl], nB = [0, -out / nl, -drop / nl], WHITE = CREAM;
  for (let k = 0; k < NS; k++) {
    const x0 = -W + 2 * W * k / NS, x1 = x0 + 2 * W / NS, c = striped && k % 2 ? WHITE : T(1), cd = striped && k % 2 ? [WHITE[0] * 0.8, WHITE[1] * 0.8, WHITE[2] * 0.8] : T(0.72);
    G.quadN([[x0, 0, 0.02], [x1, 0, 0.02], [x1, -drop, out], [x0, -drop, out]], N4(nT), c);
    G.quadN([[x0, -0.035, 0.02], [x1, -0.035, 0.02], [x1, -drop - 0.035, out - 0.01], [x0, -drop - 0.035, out - 0.01]], N4(nB), cd);
    G.quadN([[x0, -drop, out], [x1, -drop, out], [x1, -drop - val, out], [x0, -drop - val, out]], N4([0, 0, 1]), c);
    G.quadN([[x0, -drop - 0.03, out - 0.012], [x1, -drop - 0.03, out - 0.012], [x1, -drop - val, out - 0.012], [x0, -drop - val, out - 0.012]], N4([0, 0, -1]), cd);
    G.quadN([[x0, -drop - val, out - 0.012], [x1, -drop - val, out - 0.012], [x1, -drop - val, out], [x0, -drop - val, out]], N4([0, -1, 0]), cd);
  }
  for (const s of [-1, 1]) {
    const x = s * W, pts = [[x, 0, 0.02], [x, -drop, out], [x, -drop - val, out], [x, -drop - val, 0.02]];
    G.quadN(pts, N4([s, 0, 0]), T(0.9)); G.quadN(pts.map(p => [p[0] - s * 0.012, p[1], p[2]]), N4([-s, 0, 0]), T(0.66));
    G.pipe([[s * (W - 0.05), -drop - val - 0.25, 0.01], [s * (W - 0.05), -drop - val + 0.01, out - 0.03]], 0.014, 6, METAL);
    G.aabb(s * (W - 0.05) - 0.03, -drop - val - 0.32, 0, s * (W - 0.05) + 0.03, -drop - val - 0.2, 0.02, METAL);
  }
  G.pipe([[-W + 0.01, -drop - val + 0.012, out - 0.03], [W - 0.01, -drop - val + 0.012, out - 0.03]], 0.016, 6, METAL);
  G.aabb(-W, -0.03, 0, W, 0.04, 0.035, METAL);                         // 靠墙的固定条
  return G.build();
}

/** 招牌底板：有侧面厚度的板 + 一圈凸起的边框 + 两头的安装角码。宽 2.8、高 0.5 */
export function signBoard() {
  const G = new Geo(), W = 1.4, H = 0.5;
  G.aabb(-W, 0, 0.025, W, H, 0.085, T(1));
  G.aabb(-W, 0, 0.085, W, 0.045, 0.11, CREAM); G.aabb(-W, H - 0.045, 0.085, W, H, 0.11, CREAM);
  G.aabb(-W, 0.045, 0.085, -W + 0.045, H - 0.045, 0.11, CREAM); G.aabb(W - 0.045, 0.045, 0.085, W, H - 0.045, 0.11, CREAM);
  for (const s of [-1, 1]) for (const y of [0.08, H - 0.14]) G.aabb(s * (W - 0.35) - 0.04, y, 0, s * (W - 0.35) + 0.04, y + 0.06, 0.025, IRON);
  return G.build();
}
/** 招牌上方的鹅颈灯 */
export function gooseneck() {
  const G = new Geo();
  G.aabb(-0.035, 0.12, 0, 0.035, 0.22, 0.015, IRON);
  G.pipe([[0, 0.17, 0.01], [0, 0.26, 0.1], [0, 0.3, 0.24], [0, 0.25, 0.36], [0, 0.16, 0.4]], 0.012, 6, IRON);
  G.lathe([[0.105, 0.045], [0.1, 0.06], [0.045, 0.12], [0.03, 0.16]], 0, 0.4, 10, IRON);
  G.ellipsoid(0, 0.065, 0.4, 0.085, 0.02, 0.085, GLOW, 4, 10);
  return G.build();
}
/** 挑出墙面的小吊牌 */
export function bladeSign() {
  const G = new Geo();
  G.pipe([[0, 0.66, 0], [0, 0.66, 0.8]], 0.014, 6, IRON, true); G.pipe([[0, 0.36, 0], [0, 0.66, 0.42]], 0.01, 5, IRON);
  G.aabb(-0.04, 0.3, 0, 0.04, 0.72, 0.015, IRON);
  for (const z of [0.24, 0.7]) G.aabb(-0.006, 0.56, z - 0.006, 0.006, 0.66, z + 0.006, IRON);
  G.aabb(-0.022, 0.02, 0.17, 0.022, 0.56, 0.77, T(1));
  for (const s of [-1, 1]) { G.aabb(s * 0.022, 0.05, 0.2, s * 0.028, 0.53, 0.74, T(0.8)); G.ellipsoid(s * 0.027, 0.29, 0.47, 0.008, 0.15, 0.15, CREAM, 4, 14); }
  return G.build();
}

/** 住宅门：门套（两根贴脸 + 带小檐口的门楣）、亮子、四块凸镶板的门扇、门把手、门槛 */
export function resDoor() {
  const G = new Geo(), W = 0.55, H = 2.55, zb = -0.2, zf = -0.14;
  for (const s of [-1, 1]) { G.aabb(s * (W + 0.08) - 0.08, 0, 0, s * (W + 0.08) + 0.08, H, 0.05, CREAM); G.aabb(s * (W + 0.08) - 0.1, 0, 0, s * (W + 0.08) + 0.1, 0.22, 0.07, CREAM); G.aabb(s * W - (s > 0 ? 0.05 : 0), 0.03, zb, s * W + (s > 0 ? 0 : 0.05), H, zf, CREAM); }
  G.aabb(-W - 0.2, H, 0, W + 0.2, H + 0.2, 0.065, CREAM);
  G.extrudeX([[0, H + 0.2], [0.1, H + 0.22], [0.14, H + 0.27], [0.14, H + 0.31], [0, H + 0.34]], -W - 0.26, W + 0.26, CREAM);
  G.aabb(-W + 0.05, 2.06, zb, W - 0.05, 2.13, zf, CREAM); G.aabb(-W + 0.05, H - 0.05, zb, W - 0.05, H, zf, CREAM);
  G.quadN([[-W, 2.13, -0.175], [W, 2.13, -0.175], [W, H, -0.175], [-W, H, -0.175]], N4([0, 0, 1]), [0.1, 0.17, 0.26]);
  G.aabb(-0.012, 2.13, zb, 0.012, H - 0.05, zf - 0.02, CREAM);
  G.aabb(-W + 0.05, 0.03, -0.2, W - 0.05, 2.06, -0.155, T(0.8));
  for (const [x0, x1] of [[-0.41, -0.05], [0.05, 0.41]]) for (const [y0, y1] of [[0.22, 0.92], [1.08, 1.9]]) { G.aabb(x0, y0, -0.155, x1, y1, -0.14, T(1)); G.aabb(x0 + 0.06, y0 + 0.06, -0.14, x1 - 0.06, y1 - 0.06, -0.13, T(0.88)); }
  G.ellipsoid(0.42, 1.0, -0.12, 0.035, 0.035, 0.035, BRASS, 5, 8); G.aabb(0.39, 0.94, -0.155, 0.45, 1.12, -0.148, BRASS);
  G.aabb(-W, 0, -0.2, W, 0.035, 0.03, STONE_D);
  return G.build();
}
/** 门前台阶：三级踏步（带一点挑出的踏面）、两侧的斜顶挡墙、铁栏杆 */
export function stoop() {
  const G = new Geo(), HW = 0.62, C = lin('#c4bcae'), CD = lin('#aaa294');
  G.extrudeX([[0, 0], [0, 0.6], [0.75, 0.6], [0.75, 0.4], [1.05, 0.4], [1.05, 0.2], [1.35, 0.2], [1.35, 0]], -HW, HW, CD);
  for (const [z0, z1, y] of [[0, 0.78, 0.6], [0.75, 1.08, 0.4], [1.05, 1.38, 0.2]]) G.aabb(-HW, y - 0.045, z0, HW, y, z1, C);      // 踏面板，前沿挑出 3 厘米
  for (const s of [-1, 1]) {
    const x0 = s > 0 ? HW : -HW - 0.18, x1 = x0 + 0.18, xm = (x0 + x1) / 2;
    G.extrudeX([[0, 0], [0, 0.92], [0.45, 0.92], [1.45, 0.4], [1.45, 0]], x0, x1, CD);
    G.extrudeX([[0, 0.92], [0, 0.97], [0.47, 0.97], [1.49, 0.44], [1.49, 0.38], [1.45, 0.4], [0.45, 0.92]], x0 - 0.02, x1 + 0.02, C);     // 挡墙压顶
    G.pipe([[xm, 0.97, 0.08], [xm, 1.82, 0.08], [xm, 1.82, 0.45], [xm, 1.3, 1.42], [xm, 0.46, 1.42]], 0.02, 7, IRON);
    for (const [z, yb, yt] of [[0.3, 0.97, 1.82], [0.7, 0.84, 1.69], [1.05, 0.65, 1.5]]) G.pipe([[xm, yb, z], [xm, yt, z]], 0.011, 5, IRON);
  }
  return G.build();
}
