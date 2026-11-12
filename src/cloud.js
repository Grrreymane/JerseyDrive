// AIWANNA 云存档：只在平台的 iframe 里接；站外打开照旧存本地。
// 存的是进度（课程星级、无违章最佳），车型、出发点、画风这类偏好仍留在本地。
const GAME = '7bbab7e1-cd35-40f4-bd19-d39f212798d6';
const ORIGIN = 'https://www.aiwanna.games';   // SDK 会自己接受平台的其它官方域名
export const GAME_VERSION = '0.3.0';
export const cloudOn = window.parent !== window;

/** 读云端进度。平台在重试 / 离线 / 冲突让玩家选择时会一直等着，这期间不能开局 */
export function cloudInit({ exportState, importState, summary }) {
  if (!cloudOn) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = ORIGIN + '/sdk/cloud-saves-v1.js';
    s.onload = res; s.onerror = () => rej(new Error('云存档组件加载失败'));
    document.head.appendChild(s);
  }).then(() => window.AIWanna.saves.initialize({
    platformOrigin: ORIGIN, gameId: GAME, schemaVersion: 1, gameVersion: GAME_VERSION,
    exportState, importState, summary,
  }));
}

/** 过课、刷新纪录后存一次。失败只记日志，游戏照常 */
export function cloudSave() {
  if (!cloudOn || !window.AIWanna || !window.AIWanna.saves) return;
  window.AIWanna.saves.save().catch(e => console.warn('云存档没存上：', e && e.code));
}
