// AIWANNA 排行榜「无违章里程」：一段连续不违章的行驶 = 一局（run）。
// 段开始时开局，违章 / 重开 / 离开页面时结算。只在平台的 iframe 里生效；站外打开照常玩，只是不上榜。
// 平台每位玩家只留最好的一次，所以没超过已知最佳的段就不结算（省请求）。失败一律静默，不打断游戏。
const BOARD = '91e72097-8ca4-4157-b128-97d6d84ecb06';
const ORIGINS = ['https://www.aiwanna.games', 'https://aiwanna.games', 'https://www.ai-made.games', 'https://ai-made.games', 'https://1gp-game-platform.vercel.app'];
const MIN_MS = 10000, MAX_SCORE = 100000, RUN_MAX_MS = 110 * 60 * 1000;   // 平台要求开局两小时内结算，留 10 分钟余量

const embedded = window.parent !== window;
let api = null, token = null, hs = null, pb = 0;
const uuid = () => crypto.randomUUID();
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function handshake() {
  if (!embedded) return Promise.resolve(false);
  if (hs) return hs;
  hs = new Promise((res) => {
    const id = uuid();
    const done = (ok) => { removeEventListener('message', on); clearTimeout(tm); if (!ok) hs = null; res(ok); };
    const on = (e) => {
      const d = e.data;
      if (e.source !== window.parent || !ORIGINS.includes(e.origin) || !d || d.source !== 'aimadegames-platform' || d.type !== 'leaderboard-session' || d.requestId !== id) return;
      if (d.session && d.session.token && d.apiOrigin === e.origin) { api = e.origin; token = d.session.token; done(true); } else done(false);
    };
    addEventListener('message', on);
    const tm = setTimeout(() => done(false), 15000);
    for (const o of ORIGINS) { try { window.parent.postMessage({ source: 'aimadegames', type: 'leaderboard-session', requestId: id }, o); } catch { /* 外层不是这个域名 */ } }
  });
  return hs;
}

/** 带令牌请求；401 重新握手、429 按 Retry-After 等，最多试几次。同一个请求的重试复用同一个 Idempotency-Key */
async function call(path, body, key, keepalive) {
  for (let i = 0; i < 4; i++) {
    if (!token && !(await handshake())) return null;
    let r;
    try {
      r = await fetch(api + path, { method: 'POST', credentials: 'omit', keepalive: !!keepalive, headers: { Authorization: 'Bearer ' + token, 'Idempotency-Key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    } catch { if (keepalive) return null; await sleep(2000 * (i + 1)); continue; }
    if (r.ok) return r.json().catch(() => ({}));
    if (r.status === 401) { token = null; hs = null; continue; }
    if (r.status === 429 && !keepalive) { await sleep(Math.min(60, +r.headers.get('Retry-After') || 5) * 1000); continue; }
    if (r.status >= 500 && !keepalive) { await sleep(2000 * (i + 1)); continue; }
    return null;
  }
  return null;
}

let run = null;     // 当前这段：{ t0, id: Promise<runId|null>, settleKey }
function open() {
  const r = { t0: Date.now(), settleKey: uuid(), id: null };
  r.id = embedded ? call(`/api/v1/leaderboards/${BOARD}/runs`, null, uuid()).then(x => x && x.runId || null) : Promise.resolve(null);
  return r;
}
async function settle(r, meters, keepalive) {
  const score = Math.floor(meters);
  if (!embedded || score < 1 || score > MAX_SCORE || score <= pb || Date.now() - r.t0 < MIN_MS) return;
  const id = await r.id; if (!id) return;
  const res = await call(`/api/v1/runs/${id}/score`, { score }, r.settleKey, keepalive);
  if (res && res.personalBest != null) pb = Math.max(pb, +res.personalBest || 0); else if (res && res.accepted) pb = Math.max(pb, score);
}

/** 新的一段开始（还没开出距离也行） */
export function boardStart() { run = open(); }
/** 这一段结束（违章、重开、换课），meters 是这段的长度 */
export function boardEnd(meters) { const r = run; run = null; if (r) settle(r, meters); }
/** 每帧调用：一段开得太久（快到平台的两小时上限）就先结算一次，再开一局接着记同一段 */
export function boardTick(meters) { if (run && Date.now() - run.t0 > RUN_MAX_MS) { const r = run; run = open(); settle(r, meters); } }
/** 离开页面：用 keepalive 把当前这段交上去 */
export function boardLeave(meters) { const r = run; if (r) { settle(r, meters, true); run = null; } }
export const boardActive = () => !!run;
export const boardOn = embedded;
