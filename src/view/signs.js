// 交通标志：用 canvas 画，3D 贴图和图鉴界面共用。
// drawSign(ctx, id, S)：在 (0,0)-(S,S) 的方格里画一个标志，背景透明。
const RED = '#c1121f', YEL = '#f6c700', BLK = '#111', WHT = '#fff', GRN = '#0b6b3a', FYG = '#c8e000';
const FONT = (px, w = 800) => `${w} ${px}px "Arial Narrow", "Helvetica Neue", Arial, sans-serif`;

function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function text(c, s, x, y, px, col = BLK, w = 800) { c.font = FONT(px, w); c.fillStyle = col; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(s, x, y); }
function plate(c, x, y, w, h, fill, edge, lw = 0.02) { rr(c, x, y, w, h, 0.05); c.fillStyle = fill; c.fill(); rr(c, x + lw * 1.4, y + lw * 1.4, w - lw * 2.8, h - lw * 2.8, 0.04); c.lineWidth = lw; c.strokeStyle = edge; c.stroke(); }
function diamond(c, fill = YEL) {
  c.save(); c.translate(0.5, 0.5); c.rotate(Math.PI / 4); rr(c, -0.33, -0.33, 0.66, 0.66, 0.05); c.fillStyle = fill; c.fill();
  rr(c, -0.3, -0.3, 0.6, 0.6, 0.04); c.lineWidth = 0.018; c.strokeStyle = BLK; c.stroke(); c.restore();
}
// 箭头：从 (x0,y0) 画到 (x1,y1)
function arrow(c, x0, y0, x1, y1, w, col = BLK, head = 2.6) {
  const a = Math.atan2(y1 - y0, x1 - x0), L = Math.hypot(x1 - x0, y1 - y0), hl = w * head;
  c.save(); c.translate(x0, y0); c.rotate(a); c.fillStyle = col; c.beginPath();
  c.moveTo(0, -w / 2); c.lineTo(L - hl, -w / 2); c.lineTo(L - hl, -w * 1.5); c.lineTo(L, 0); c.lineTo(L - hl, w * 1.5); c.lineTo(L - hl, w / 2); c.lineTo(0, w / 2); c.closePath(); c.fill(); c.restore();
}
function bentArrow(c, dir, col = BLK, w = 0.07, x = 0.5, y0 = 0.78, y1 = 0.42) {   // 先向上再拐弯
  c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'butt'; c.lineJoin = 'round';
  c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y1); c.stroke();
  arrow(c, x - dir * w / 2, y1, x + dir * 0.24, y1, w, col, 2.2);
}
function prohibit(c) { c.strokeStyle = RED; c.lineWidth = 0.07; c.beginPath(); c.arc(0.5, 0.5, 0.36, 0, 7); c.stroke(); c.beginPath(); c.moveTo(0.245, 0.245); c.lineTo(0.755, 0.755); c.stroke(); }
function octagon(c, cx, cy, r) { c.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; c[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * r, cy + Math.sin(a) * r); } c.closePath(); }
function person(c, x, y, s, col = BLK) {
  c.fillStyle = col; c.strokeStyle = col; c.lineWidth = 0.035 * s; c.lineCap = 'round';
  c.beginPath(); c.arc(x, y - 0.17 * s, 0.035 * s, 0, 7); c.fill();
  c.beginPath(); c.moveTo(x, y - 0.12 * s); c.lineTo(x - 0.01 * s, y + 0.02 * s); c.moveTo(x - 0.01 * s, y + 0.02 * s); c.lineTo(x - 0.08 * s, y + 0.17 * s); c.moveTo(x - 0.01 * s, y + 0.02 * s); c.lineTo(x + 0.07 * s, y + 0.17 * s);
  c.moveTo(x, y - 0.09 * s); c.lineTo(x - 0.08 * s, y - 0.01 * s); c.moveTo(x, y - 0.09 * s); c.lineTo(x + 0.08 * s, y - 0.03 * s); c.stroke();
}

const D = {
  stop(c) { octagon(c, 0.5, 0.5, 0.48); c.fillStyle = WHT; c.fill(); octagon(c, 0.5, 0.5, 0.445); c.fillStyle = RED; c.fill(); text(c, 'STOP', 0.5, 0.515, 0.3, WHT); },
  allway(c) { plate(c, 0.14, 0.36, 0.72, 0.28, RED, WHT); text(c, 'ALL WAY', 0.5, 0.505, 0.16, WHT); },
  yield(c) {
    c.beginPath(); c.moveTo(0.04, 0.1); c.lineTo(0.96, 0.1); c.lineTo(0.5, 0.93); c.closePath(); c.fillStyle = RED; c.fill();
    c.beginPath(); c.moveTo(0.22, 0.2); c.lineTo(0.78, 0.2); c.lineTo(0.5, 0.71); c.closePath(); c.fillStyle = WHT; c.fill(); text(c, 'YIELD', 0.5, 0.31, 0.12, RED);
  },
  oneway_r(c) { plate(c, 0.02, 0.34, 0.96, 0.32, BLK, WHT, 0.015); arrow(c, 0.08, 0.5, 0.92, 0.5, 0.15, WHT, 1.1); text(c, 'ONE WAY', 0.44, 0.508, 0.115, BLK); },
  oneway_l(c) { plate(c, 0.02, 0.34, 0.96, 0.32, BLK, WHT, 0.015); arrow(c, 0.92, 0.5, 0.08, 0.5, 0.15, WHT, 1.1); text(c, 'ONE WAY', 0.56, 0.508, 0.115, BLK); },
  dne(c) {
    plate(c, 0.04, 0.04, 0.92, 0.92, WHT, WHT); c.beginPath(); c.arc(0.5, 0.5, 0.42, 0, 7); c.fillStyle = RED; c.fill();
    c.fillStyle = WHT; c.fillRect(0.16, 0.44, 0.68, 0.12); text(c, 'DO NOT', 0.5, 0.32, 0.13, WHT); text(c, 'ENTER', 0.5, 0.69, 0.13, WHT);
  },
  wrongway(c) { plate(c, 0.06, 0.24, 0.88, 0.52, RED, WHT); text(c, 'WRONG', 0.5, 0.4, 0.19, WHT); text(c, 'WAY', 0.5, 0.61, 0.19, WHT); },
  speed25(c) { speed(c, '25'); }, speed35(c) { speed(c, '35'); }, speed20(c) { speed(c, '20'); },
  noleft(c) { plate(c, 0.04, 0.04, 0.92, 0.92, WHT, BLK); bentArrow(c, -1, BLK, 0.08, 0.58); prohibit(c); },
  noright(c) { plate(c, 0.04, 0.04, 0.92, 0.92, WHT, BLK); bentArrow(c, 1, BLK, 0.08, 0.42); prohibit(c); },
  nouturn(c) {
    plate(c, 0.04, 0.04, 0.92, 0.92, WHT, BLK); c.strokeStyle = BLK; c.lineWidth = 0.08; c.beginPath(); c.moveTo(0.64, 0.76); c.lineTo(0.64, 0.46); c.arc(0.5, 0.46, 0.14, 0, Math.PI, true); c.lineTo(0.36, 0.56); c.stroke();
    arrow(c, 0.36, 0.5, 0.36, 0.72, 0.08, BLK, 1.6); prohibit(c);
  },
  notor(c) { plate(c, 0.14, 0.04, 0.72, 0.92, WHT, BLK); text(c, 'NO', 0.5, 0.17, 0.15); text(c, 'TURN', 0.5, 0.33, 0.15); text(c, 'ON', 0.5, 0.49, 0.15); text(c, 'RED', 0.5, 0.65, 0.15, RED); c.beginPath(); c.arc(0.5, 0.83, 0.07, 0, 7); c.fillStyle = RED; c.fill(); },
  keepright(c) {
    plate(c, 0.14, 0.04, 0.72, 0.92, WHT, BLK); c.fillStyle = BLK; c.beginPath(); c.moveTo(0.36, 0.86); c.lineTo(0.3, 0.6); c.arc(0.36, 0.56, 0.06, Math.PI, 0); c.lineTo(0.42, 0.6); c.closePath(); c.fill();
    c.strokeStyle = BLK; c.lineWidth = 0.07; c.beginPath(); c.moveTo(0.5, 0.88); c.bezierCurveTo(0.5, 0.6, 0.64, 0.6, 0.64, 0.36); c.stroke(); arrow(c, 0.64, 0.4, 0.64, 0.12, 0.07, BLK, 2);
  },
  leftonly(c) { plate(c, 0.14, 0.04, 0.72, 0.92, WHT, BLK); bentArrow(c, -1, BLK, 0.09, 0.58, 0.62, 0.26); text(c, 'ONLY', 0.5, 0.8, 0.19); },
  nopark(c) { plate(c, 0.14, 0.04, 0.72, 0.92, WHT, RED); text(c, 'P', 0.5, 0.36, 0.42, BLK); c.strokeStyle = RED; c.lineWidth = 0.06; c.beginPath(); c.arc(0.5, 0.35, 0.25, 0, 7); c.moveTo(0.32, 0.17); c.lineTo(0.68, 0.53); c.stroke(); text(c, 'ANY', 0.5, 0.7, 0.11, RED); text(c, 'TIME', 0.5, 0.83, 0.11, RED); },
  pedxing(c) { diamond(c); person(c, 0.5, 0.5, 1.25); },
  school(c) {
    c.beginPath(); c.moveTo(0.5, 0.04); c.lineTo(0.94, 0.4); c.lineTo(0.94, 0.94); c.lineTo(0.06, 0.94); c.lineTo(0.06, 0.4); c.closePath(); c.fillStyle = FYG; c.fill(); c.lineWidth = 0.02; c.strokeStyle = BLK; c.stroke();
    person(c, 0.38, 0.62, 1.15); person(c, 0.64, 0.66, 0.85);
  },
  signalahead(c) { diamond(c); c.fillStyle = BLK; rr(c, 0.4, 0.2, 0.2, 0.6, 0.03); c.fill();[['#e02020', 0.31], [YEL, 0.5], ['#19b34a', 0.69]].forEach(([k, y]) => { c.beginPath(); c.arc(0.5, y, 0.07, 0, 7); c.fillStyle = k; c.fill(); }); },
  stopahead(c) { diamond(c); octagon(c, 0.5, 0.6, 0.15); c.fillStyle = RED; c.fill(); arrow(c, 0.5, 0.42, 0.5, 0.18, 0.06, BLK, 2); },
  merge(c) {
    diamond(c); arrow(c, 0.47, 0.78, 0.47, 0.2, 0.08, BLK, 2); c.strokeStyle = BLK; c.lineWidth = 0.07; c.beginPath(); c.moveTo(0.68, 0.78); c.quadraticCurveTo(0.66, 0.56, 0.5, 0.46); c.stroke();
  },
  laneends(c) { diamond(c); c.strokeStyle = BLK; c.lineWidth = 0.045; c.beginPath(); c.moveTo(0.4, 0.78); c.lineTo(0.4, 0.22); c.moveTo(0.62, 0.78); c.lineTo(0.62, 0.56); c.lineTo(0.5, 0.36); c.lineTo(0.5, 0.22); c.stroke(); },
  twoway(c) { diamond(c); arrow(c, 0.4, 0.26, 0.4, 0.76, 0.07, BLK, 2); arrow(c, 0.6, 0.74, 0.6, 0.24, 0.07, BLK, 2); },
  deadend(c) { diamond(c); text(c, 'DEAD', 0.5, 0.43, 0.15); text(c, 'END', 0.5, 0.59, 0.15); },
  rr(c) { c.beginPath(); c.arc(0.5, 0.5, 0.46, 0, 7); c.fillStyle = YEL; c.fill(); c.lineWidth = 0.02; c.strokeStyle = BLK; c.stroke(); c.lineWidth = 0.07; c.beginPath(); c.moveTo(0.18, 0.18); c.lineTo(0.82, 0.82); c.moveTo(0.82, 0.18); c.lineTo(0.18, 0.82); c.stroke(); text(c, 'R', 0.26, 0.5, 0.2); text(c, 'R', 0.74, 0.5, 0.2); },
  stophere(c) { plate(c, 0.14, 0.04, 0.72, 0.92, WHT, BLK); text(c, 'STOP', 0.5, 0.17, 0.15); text(c, 'HERE', 0.5, 0.33, 0.15); text(c, 'ON', 0.5, 0.49, 0.15); text(c, 'RED', 0.5, 0.65, 0.15, RED); arrow(c, 0.62, 0.74, 0.38, 0.9, 0.05, BLK, 2); },
  // 路面箭头（白色，贴在地上）
  pv_left(c) { bentArrow(c, -1, WHT, 0.1, 0.6, 0.95, 0.3); },
  pv_right(c) { bentArrow(c, 1, WHT, 0.1, 0.4, 0.95, 0.3); },
  pv_through(c) { arrow(c, 0.5, 0.95, 0.5, 0.05, 0.1, WHT, 2.4); },
  pv_through_left(c) { arrow(c, 0.56, 0.95, 0.56, 0.05, 0.09, WHT, 2.2); c.strokeStyle = WHT; c.lineWidth = 0.09; c.beginPath(); c.moveTo(0.56, 0.7); c.lineTo(0.56, 0.52); c.stroke(); arrow(c, 0.56, 0.56, 0.2, 0.42, 0.09, WHT, 2); },
  pv_through_right(c) { arrow(c, 0.44, 0.95, 0.44, 0.05, 0.09, WHT, 2.2); arrow(c, 0.44, 0.56, 0.8, 0.42, 0.09, WHT, 2); },
};
function speed(c, n) { plate(c, 0.14, 0.04, 0.72, 0.92, WHT, BLK); text(c, 'SPEED', 0.5, 0.2, 0.15); text(c, 'LIMIT', 0.5, 0.36, 0.15); text(c, n, 0.5, 0.68, 0.42); }

export const SIGN_IDS = Object.keys(D);
export function drawSign(ctx, id, S) { ctx.save(); ctx.scale(S, S); (D[id] || D.stop)(ctx); ctx.restore(); }

/** 所有标志拼成一张图集，返回 { canvas, uv(id) -> [u0,v0,u1,v1] } */
export function makeSignAtlas(cell = 256) {
  const cols = 8, rows = Math.ceil(SIGN_IDS.length / cols);
  const canvas = document.createElement('canvas'); canvas.width = cols * cell; canvas.height = rows * cell;
  const ctx = canvas.getContext('2d'); const uvs = {};
  SIGN_IDS.forEach((id, i) => {
    const cx = i % cols, cy = Math.floor(i / cols);
    ctx.save(); ctx.translate(cx * cell, cy * cell); ctx.beginPath(); ctx.rect(0, 0, cell, cell); ctx.clip(); drawSign(ctx, id, cell); ctx.restore();
    uvs[id] = [cx / cols, 1 - (cy + 1) / rows, (cx + 1) / cols, 1 - cy / rows];
  });
  return { canvas, uv: (id) => uvs[id] };
}
export function signDataURL(id, S = 160) { const c = document.createElement('canvas'); c.width = c.height = S; drawSign(c.getContext('2d'), id, S); return c.toDataURL(); }

export const shortName = (n) => n.replace(/\bStreet\b/, 'St').replace(/\bAvenue\b/, 'Ave').replace(/\bBoulevard\b/, 'Blvd').replace(/\bDrive\b/, 'Dr').replace(/\bPlace\b/, 'Pl').replace(/\bCourt\b/, 'Ct').replace(/\bParkway\b/, 'Pkwy').replace(/\bSaint\b/, 'St.');
/** 路名牌图集（绿底白字） */
export function makeNameAtlas(names) {
  const W = 512, H = 80, cols = 2, rows = Math.ceil(names.length / cols);
  const canvas = document.createElement('canvas'); canvas.width = W * cols; canvas.height = Math.max(H, rows * H);
  const ctx = canvas.getContext('2d'); const uvs = {};
  names.forEach((n, i) => {
    const x = (i % cols) * W, y = Math.floor(i / cols) * H;
    ctx.fillStyle = GRN; ctx.fillRect(x, y, W, H); ctx.strokeStyle = WHT; ctx.lineWidth = 4; ctx.strokeRect(x + 4, y + 4, W - 8, H - 8);
    ctx.font = FONT(48, 700); ctx.fillStyle = WHT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let s = shortName(n); while (ctx.measureText(s).width > W - 36 && s.length > 4) s = s.slice(0, -1);
    ctx.fillText(s, x + W / 2, y + H / 2 + 3);
    uvs[n] = [x / canvas.width, 1 - (y + H) / canvas.height, (x + W) / canvas.width, 1 - y / canvas.height];
  });
  return { canvas, uv: (n) => uvs[n] };
}
