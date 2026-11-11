import * as THREE from 'three';
import { prepareMap, signalState, laneCenter, laneInfo, offsetPoint, pointAt, segY, CAR } from './sim/map.js';
import { makeCar, stepCar, setSignal, shift, carCenter, MPH, GEARS } from './sim/car.js';
import { makeTraffic, stepTraffic } from './sim/traffic.js';
import { buildActors } from './view/actors.js';
import { makeRules, stepRules, clearTransient, PENALTY } from './sim/rules.js';
import { buildWorld } from './view/world.js';
import { buildSky } from './view/sky.js';
import { buildPost } from './view/post.js';
import { STYLES, setRamp, toonU } from './view/toon.js';
import { buildCarView } from './view/carview.js';
import { signDataURL, shortName } from './view/signs.js';
import { EVENT_TEXT, EVENT_SHORT, hintText, ALERT_TEXT, SIGN_BOOK, SHIFT_MSG } from './rulebook.js';
import { makeAudio } from './view/audio.js';
import { boardStart, boardEnd, boardTick, boardLeave, boardActive } from './board.js';
import { LESSONS, lessonState } from './lessons.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const DT = 1 / 60;

// ---------- 场景 ----------
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: params.has('rec') });
// 内部渲染分辨率封顶：高度不超过约 1200 像素（4K / 高分屏按原始分辨率画，显卡要多干好几倍的活，画面却看不出多少差别）
let prScale = 1;
// 画面固定 16:9：窗口不是这个比例时上下或左右留黑边。这样无论什么屏幕，看到的范围（仪表、后视镜、路口两侧）都一样
const stage = () => { const w = Math.min(innerWidth, innerHeight * 16 / 9), h = w * 9 / 16; return { w: Math.round(w), h: Math.round(h), x: Math.round((innerWidth - w) / 2), y: Math.round((innerHeight - h) / 2) }; };
const pickPR = () => Math.min(devicePixelRatio, 2, 1200 / Math.max(600, stage().h)) * prScale;
renderer.setPixelRatio(pickPR());
const scene = new THREE.Scene();
const sky = buildSky(scene, renderer);
const post = buildPost(renderer);
post.outline = params.get('line') === '1';
// 画风：按 V 轮换，地址加 ?style=cel|soft|comic|dusk|flat 指定
let styleIdx = 0;
function applyStyle(i, announce) {
  styleIdx = (i + STYLES.length) % STYLES.length; const st = STYLES[styleIdx];
  setRamp(st.ramp, st.soft); toonU.spec.value = st.spec; toonU.rim.value = st.rim; toonU.rimColor.value.setRGB(...st.rimColor);
  toonU.skyTop.value.set(st.sky[0]); toonU.skyHor.value.set(st.sky[1]); toonU.city.value.set(st.sky[2]).multiplyScalar(0.34);      // 玻璃和车漆反射的天空颜色跟着画风走
  sky.setStyle(st); post.setStyle(st);
  try { localStorage.setItem('jdStyle2', st.id); } catch { /* 隐私模式下存不了，不影响 */ }
  if (announce) toast({ sev: 'info' }, `画风 ${styleIdx + 1} / ${STYLES.length}：${st.name}`, st.desc, 3500);
}
{ let saved = null; try { saved = localStorage.getItem('jdStyle2'); } catch { /* 同上 */ } applyStyle(Math.max(0, STYLES.findIndex(x => x.id === (params.get('style') || saved)))); }

// 区域：三张独立的地图，开始界面上选（换区域 = 带着 ?map= 重新打开页面）
const REGIONS = { downtown: ['Jersey City 市中心', 'data/map.json'], jsq: ['Journal Square', 'data/map_jsq.json'], newark: ['Newark 市中心', 'data/map_newark.json'] };
let region = params.get('map'); try { region = region || localStorage.getItem('jdRegion'); } catch { /* 存不了就用默认 */ }
if (!REGIONS[region]) region = 'downtown';
$('regionList').innerHTML = Object.entries(REGIONS).map(([id, r]) => `<button class="${id === region ? '' : 'ghost'}" data-id="${id}">${r[0]}</button>`).join('');
for (const b of $('regionList').children) b.onclick = () => { if (b.dataset.id === region) return; try { localStorage.setItem('jdRegion', b.dataset.id); } catch { /* 同上 */ } const u = new URL(location.href); u.searchParams.set('map', b.dataset.id); location.href = u.href; };
let lesson = null, stars = {};
try { stars = JSON.parse(localStorage.getItem('jdLessons') || '{}'); } catch { /* 存不了就不记 */ }
// 区域和课程表在地图加载之前就显示出来；加载时点了课程先记下，加载完自动开始
let ready = false, wantLesson = -1;
function buildLessonList() {
  $('lessonList').innerHTML = LESSONS.map((l, i) => `<button class="ghost" data-i="${i}"><b>${i + 1}. ${l.title}</b><span>${wantLesson === i ? '加载中…' : '★'.repeat(stars[i] || 0)}</span></button>`).join('');
  for (const b of $('lessonList').children) b.onclick = () => { if (!ready) { wantLesson = +b.dataset.i; buildLessonList(); return; } audio.unlock(); startLesson(+b.dataset.i); };
}
buildLessonList();
$('btnStart').textContent = REGIONS[region][0] + ' 加载中…';
await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));      // 先让浏览器把界面画出来，再开始加载（建场景那几秒主线程是占满的）
const raw = await (await fetch(REGIONS[region][1])).json();
const map = prepareMap(raw);
const world = buildWorld(map, scene);
// 导航画面：一张画布，既贴在车里的中控屏上，也给车外视角的圆形小地图用
const nav = document.createElement('canvas'); nav.width = 640; nav.height = 380;
const view = buildCarView(scene, renderer, nav);
const actors = buildActors(scene);
// 车流和行人（地址加 ?empty 关掉，空城练习）
const trafficOn = !params.has('empty') && !(params.has('spot') && !params.has('traffic')) && !params.has('bench');
let T = makeTraffic(map);
const audio = makeAudio();

// ---------- 状态 ----------
const S = { car: makeCar(), R: makeRules(), t: 0, running: false, paused: true, coach: true, driveTime: 0, startOdo: 0, clean: 0 };
const startPose = (() => {
  const want = params.get('seg');
  const seg = (want && map.segs[+want]) || map.segs.filter(s => s.cls === 'residential' && s.oneway && s.useLen > 110 && s.lf === 1 && Math.abs(s.px[0]) < 350 && Math.abs(s.pz[0]) < 350)
    .sort((a, b) => Math.hypot(a.px[0], a.pz[0]) - Math.hypot(b.px[0], b.pz[0]))[0] || map.segs.find(s => s.useLen > 80);
  const q = offsetPoint(seg, seg.trimA + 18, laneCenter(seg, true, seg.lf - 1), {});
  const h = Math.atan2(q.dz, q.dx);
  return { x: q.x - Math.cos(h) * CAR.center, z: q.z - Math.sin(h) * CAR.center, h };
})();
function placeCar(p) { Object.assign(S.car, { x: p.x, z: p.z, h: p.h, y: p.y || 0, v: 0, steer: 0 }); clearTransient(S.R); S.R.needReset = null; }
// 无违章里程：往前开一米记一米，扣分的违规清零。最长的一段存本地，平台里还会上排行榜
let bestClean = 0; try { bestClean = +localStorage.getItem('jdBestClean') || 0; } catch { /* 存不了就不记 */ }
function endClean() {
  const m = S.clean; S.clean = 0; if (!(m > 0)) return;
  boardEnd(m);
  if (m > bestClean) { bestClean = Math.floor(m); try { localStorage.setItem('jdBestClean', bestClean); } catch { /* 同上 */ } }
  return m;
}
function cleanStep() {
  if (S.R.events.some(e => PENALTY[e.type])) {
    const m = endClean(), best = Math.floor(m) >= bestClean;
    if (m >= 100) toast({ sev: 'info' }, `这段无违章开了 ${Math.floor(m)} 米`, best ? '新纪录！' : `最好的一段是 ${bestClean} 米`, 4500);
    return;
  }
  if (S.car.v > 0.3) { S.clean += S.car.v * DT; if (!boardActive()) boardStart(); }
  boardTick(S.clean);
}
addEventListener('pagehide', () => boardLeave(S.clean));
function restart() { endClean(); S.crash = null; $('hit').classList.remove('on'); S.car = makeCar(); S.R = makeRules(); S.t = 0; S.driveTime = 0; T = makeTraffic(map); placeCar(startPose); $('toasts').innerHTML = ''; }
restart();

// ---------- 输入 ----------
let lookHold = 0;
const keys = new Set(); const inp = { throttle: 0, brake: 0, steer: 0, analog: false }; let padPrev = [];
const GEAR_KEY = { Digit1: 'P', Digit2: 'R', Digit3: 'N', Digit4: 'D' };
addEventListener('keydown', (e) => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab'].includes(e.code)) e.preventDefault();
  if (e.repeat) return; keys.add(e.code); audio.unlock();
  if (e.code === 'KeyM' && S.running) return toggleBig();
  if (bigOpen) { if (e.code === 'Escape') toggleBig(); return; }
  if (e.code === 'Escape') return toggleMenu();
  if (!S.running || S.paused) { if (e.code === 'Enter' && !S.running && !$('btnStart').disabled) start(); return; }
  if (e.code === 'KeyQ') setSignal(S.car, -1);
  else if (e.code === 'KeyE') setSignal(S.car, 1);
  else if (e.code === 'KeyF') setSignal(S.car, 2);
  else if (GEAR_KEY[e.code]) tryShift(GEAR_KEY[e.code]);
  else if (e.code === 'KeyC') view.mode = { cockpit: 'chase', chase: 'top', top: 'cockpit' }[view.mode];
  else if (e.code === 'KeyT') { S.coach = !S.coach; toast({ sev: 'info' }, S.coach ? '教练提示：开' : '教练提示：关', '', 1800); }
  else if (e.code === 'KeyG') openBook();
  else if (e.code === 'KeyO') { post.outline = !post.outline; post.setStyle(STYLES[styleIdx]); toast({ sev: 'info' }, post.outline ? '描边：开' : '描边：关', '', 1800); }
  else if (e.code === 'Backspace') S.R.needReset = {};
  else if (e.code === 'KeyH') audio.horn();
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
function tryShift(g) { const why = shift(S.car, g); if (why) toast({ sev: 'info' }, SHIFT_MSG[why], '', 2600); else audio.click(); }

function readInput(dt) {
  const k = (...c) => c.some(x => keys.has(x));
  let thrT = k('KeyW', 'ArrowUp') ? (k('ShiftLeft', 'ShiftRight') ? 1 : 0.55) : 0;
  let brkT = k('Space') ? 1 : k('KeyS', 'ArrowDown') ? 0.6 : 0;
  let steer = (k('KeyD', 'ArrowRight') ? 1 : 0) - (k('KeyA', 'ArrowLeft') ? 1 : 0), analog = false;
  const pad = navigator.getGamepads ? [...navigator.getGamepads()].find(p => p && p.connected) : null;
  if (pad) {
    const ax = pad.axes[0] || 0, b = (i) => pad.buttons[i] ? pad.buttons[i].value : 0;
    if (Math.abs(ax) > 0.06 || b(7) > 0.03 || b(6) > 0.03) S.padActive = true;
    if (S.padActive && steer === 0 && thrT === 0 && brkT === 0) { steer = Math.abs(ax) > 0.06 ? Math.sign(ax) * (Math.abs(ax) - 0.06) / 0.94 : 0; analog = true; thrT = b(7); brkT = b(6); }
    else if (steer || thrT || brkT) S.padActive = false;
    const edge = (i) => b(i) > 0.5 && !(padPrev[i] > 0.5);
    if (S.running && !S.paused) {
      if (edge(4)) setSignal(S.car, -1); if (edge(5)) setSignal(S.car, 1); if (edge(3)) view.mode = { cockpit: 'chase', chase: 'top', top: 'cockpit' }[view.mode];
      if (edge(0)) tryShift(GEARS[Math.min(3, GEARS.indexOf(S.car.gear) + 1)]); if (edge(1)) tryShift(GEARS[Math.max(0, GEARS.indexOf(S.car.gear) - 1)]);
    }
    padPrev = pad.buttons.map(x => x.value);
  }
  if (analog) { inp.throttle = thrT; inp.brake = brkT; }
  else {
    inp.throttle += Math.max(-4 * dt, Math.min(1.5 * dt, thrT - inp.throttle));
    inp.brake += Math.max(-6 * dt, Math.min(3.2 * dt, brkT - inp.brake));
  }
  inp.steer = steer; inp.analog = analog;
  // 右后视镜在正前方视野外面：按 X 先转到正对右镜（约 54°），按住超过半秒再继续转成回头看右后方盲区
  const L = k('KeyZ'), Rr = k('KeyX'); lookHold = Rr && !L ? lookHold + dt : 0;
  return L && Rr ? Math.PI : L ? -1.3 : Rr ? (lookHold > 0.55 ? 1.5 : 0.94) : 0;
}

// ---------- 界面 ----------
const el = { speed: $('speed'), street: $('streetName'), info: $('streetInfo'), score: $('scoreNum'), limit: $('limitNum'), sigL: $('sigL'), sigR: $('sigR'), coach: $('coach'), cIcon: $('coachIcon'), cText: $('coachText'), cSub: $('coachSub'), preview: $('preview'), gas: $('pGas'), brake: $('pBrake'), clean: $('cleanNum'), cleanBest: $('cleanBest') };
const gearEls = [...document.querySelectorAll('#gears span')];
const last = {};
const set = (key, v, fn) => { if (last[key] !== v) { last[key] = v; fn(v); } };

function toast(ev, title, body, ms) {
  const d = document.createElement('div'); d.className = 'toast ' + (ev.sev || 'bad');
  const pen = PENALTY[ev.type] ? `<span class="pen">−${PENALTY[ev.type]}</span>` : '';
  d.innerHTML = `${pen}<h4>${title}</h4>${body ? `<p>${body}</p>` : ''}`;
  const box = $('toasts'); box.prepend(d); while (box.children.length > 3) box.lastChild.remove();
  setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 500); }, ms || (ev.sev === 'good' ? 2800 : ev.sev === 'info' ? 3200 : 9000));
}
function showEvents() {
  for (const ev of S.R.events) {
    const t = EVENT_TEXT[ev.type]?.(ev); if (!t) continue;
    if (ev.sev === 'good' && !S.coach) continue;
    toast(ev, t.title, t.body);
    if (ev.sev === 'bad') audio.bad(); else if (ev.sev === 'good') audio.good(); else if (ev.sev === 'minor') audio.minor();
  }
}
const ARROW = { left: '↰', right: '↱', through: '↑', uturn: '↶' }, ORDER = { left: 0, through: 1, right: 2, uturn: 3 };
function updateHud() {
  const car = S.car, R = S.R, cur = R.cur, mph = Math.abs(car.v) * MPH;
  set('speed', Math.round(mph), (v) => el.speed.textContent = v);
  const lim = cur?.seg.speed || 25;
  set('limit', lim, (v) => el.limit.textContent = v);
  set('over', mph > lim + 3.5, (v) => el.speed.classList.toggle('over', v));
  set('street', cur ? shortName(cur.street || '（无名路）') : '—', (v) => el.street.textContent = v);
  set('info', cur && !cur.junc ? (cur.seg.oneway ? '单行道' : '双向') + ' · ' + (cur.fwd ? cur.seg.lf : cur.seg.lb || cur.seg.lf) + ' 车道' : cur?.junc ? '路口内' : '', (v) => el.info.textContent = v);
  set('score', R.score, (v) => el.score.textContent = v);
  set('clean', Math.floor(S.clean), (v) => el.clean.textContent = v);
  set('cleanBest', Math.max(bestClean, Math.floor(S.clean)), (v) => el.cleanBest.textContent = v ? '最佳 ' + v : '');
  set('gear', car.gear, (g) => gearEls.forEach(e => e.classList.toggle('on', e.dataset.g === g)));
  const blink = (performance.now() % 760) < 380;
  set('sigL', (car.signal === -1 || car.signal === 2) && blink, (v) => el.sigL.classList.toggle('on', v));
  set('sigR', (car.signal === 1 || car.signal === 2) && blink, (v) => el.sigR.classList.toggle('on', v));
  set('gas', Math.round(car.throttle * 20), (v) => el.gas.style.setProperty('--v', v * 5 + '%'));
  set('brk', Math.round(car.brake * 20), (v) => el.brake.style.setProperty('--v', v * 5 + '%'));
  audio.blinker(car.signal !== 0 && S.running && !S.paused, blink);

  // 教练提示
  let h = S.coach ? (R.alert && Math.abs(car.v) + 1 > 0 ? ALERT_TEXT[R.alert] : null) || hintText(R.hint) : null;
  if (S.coach && !h && car.gear === 'P' && S.driveTime < 600) h = { icon: 'info', text: '踩住刹车（S），按 4 挂 D 挡，再慢慢松开刹车', sub: '自动挡松开刹车就会自己往前走（蠕行），先感受一下车速' };
  set('coachOn', !!h, (v) => el.coach.classList.toggle('hidden', !v));
  if (h) {
    set('cIcon', h.icon, (v) => { el.cIcon.className = v; el.cIcon.textContent = v === 'stop' ? 'STOP' : v === 'info' ? 'i' : ''; });
    set('cText', h.text, (v) => el.cText.textContent = v); set('cSub', h.sub || '', (v) => el.cSub.textContent = v);
  }
  // 路口预告：每个出口能不能走
  const pv = S.coach ? R.preview : null, key = pv ? pv.j.id + ':' + R.A.key : '';
  set('pv', key, () => {
    el.preview.classList.toggle('hidden', !pv); if (!pv) return;
    el.preview.innerHTML = pv.exits.slice().sort((a, b) => ORDER[a.type] - ORDER[b.type]).filter(e => e.type !== 'uturn').map(e =>
      `<div class="ex ${e.ok ? '' : 'no'}"><b>${ARROW[e.type]}</b>${shortName(e.name || '无名路')}<small>${e.ok ? (e.oneway ? '单行，可进' : '双向') : '✕ 单行道，不能进'}</small></div>`).join('');
  });
}

// 小地图（车头朝上）
const mini = $('mini'), miniC = mini.getContext('2d'), mc = nav.getContext('2d');
function drawMini() {
  const car = S.car, W = nav.width, H = nav.height, sc = 1.15, range = W / 2 / sc + 40, CX = W / 2, CY = H * 0.7;
  mc.setTransform(1, 0, 0, 1, 0, 0); mc.fillStyle = '#141b26'; mc.fillRect(0, 0, W, H);
  mc.translate(CX, CY); mc.rotate(-Math.PI / 2 - car.h); mc.scale(sc, sc); mc.translate(-car.x, -car.z);
  mc.lineCap = 'round'; mc.lineJoin = 'round';
  for (const s of map.segs) {
    const mx = (s.px[0] + s.px[s.n - 1]) / 2, mz = (s.pz[0] + s.pz[s.n - 1]) / 2;
    if (Math.hypot(mx - car.x, mz - car.z) > range + s.len / 2) continue;
    mc.strokeStyle = S.R.cur?.seg === s ? '#9aa3b2' : s.cls === 'motorway' ? '#6a7f9e' : '#566070'; mc.lineWidth = Math.max(5, s.halfW * 2);
    mc.beginPath(); mc.moveTo(s.px[0], s.pz[0]); for (let i = 1; i < s.n; i++) mc.lineTo(s.px[i], s.pz[i]); mc.stroke();
    if (s.oneway && s.len > 30) {   // 单行道方向箭头
      const q = offsetPoint(s, s.len / 2, 0, {}), a = Math.atan2(q.dz, q.dx);
      mc.save(); mc.translate(q.x, q.z); mc.rotate(a); mc.fillStyle = '#e8eaee'; mc.beginPath(); mc.moveTo(5, 0); mc.lineTo(-4, -4); mc.lineTo(-4, 4); mc.fill(); mc.restore();
    }
  }
  for (const j of map.juncs) {
    if (j.control === 'joint' || j.control === 'none' || Math.hypot(j.cx - car.x, j.cz - car.z) > range) continue;
    if (j.control === 'signal') {
      const st = signalState(j, S.R.A && S.R.A.j === j && S.R.A.leg ? S.R.A.leg.group : 0, S.t);
      mc.fillStyle = '#16181c'; mc.fillRect(j.cx - 5, j.cz - 5, 10, 10); mc.fillStyle = st === 'G' ? '#2ee06a' : st === 'Y' ? '#ffc21a' : '#ff3b30'; mc.beginPath(); mc.arc(j.cx, j.cz, 3.6, 0, 7); mc.fill();
    } else { mc.fillStyle = '#d0121f'; mc.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; mc[i ? 'lineTo' : 'moveTo'](j.cx + Math.cos(a) * 5, j.cz + Math.sin(a) * 5); } mc.fill(); }
  }
  if (trafficOn) {      // 别的车（黄点）和正在过马路的人（白点）
    mc.fillStyle = '#ffd24a'; for (const o of T.cars) { mc.beginPath(); mc.arc(o.x, o.z, 2.6, 0, 7); mc.fill(); }
    mc.fillStyle = '#ffffff'; for (const o of T.peds) if (o.onRoad) { mc.beginPath(); mc.arc(o.x, o.z, 1.8, 0, 7); mc.fill(); }
  }
  mc.setTransform(1, 0, 0, 1, CX, CY); mc.fillStyle = '#4da3ff'; mc.strokeStyle = '#fff'; mc.lineWidth = 3;
  mc.beginPath(); mc.moveTo(0, -16); mc.lineTo(11, 13); mc.lineTo(0, 6); mc.lineTo(-11, 13); mc.closePath(); mc.fill(); mc.stroke();
  // 屏幕顶上一条：路名 + 限速
  mc.setTransform(1, 0, 0, 1, 0, 0); mc.fillStyle = 'rgba(10,14,20,0.82)'; mc.fillRect(0, 0, W, 46);
  mc.fillStyle = '#e8edf3'; mc.font = '600 24px Arial, sans-serif'; mc.textBaseline = 'middle'; mc.textAlign = 'left'; mc.fillText(S.R.cur ? shortName(S.R.cur.street || '') : '', 16, 24, W - 210);
  mc.textAlign = 'right'; mc.fillStyle = '#9fb0c4'; mc.fillText('限速 ' + (S.R.cur?.seg.speed || 25) + ' mph', W - 16, 24);
  view.navTex.needsUpdate = true;
  // 车外视角没有中控屏：把同一张图裁成圆形小地图显示在右下角
  const show = view.mode !== 'cockpit'; if (mini.style.display !== (show ? '' : 'none')) mini.style.display = show ? '' : 'none';
  if (show) { miniC.clearRect(0, 0, mini.width, mini.height); miniC.drawImage(nav, CX - 150, CY - 190, 300, 300, 0, 0, mini.width, mini.height); }
}

// ---------- 菜单 / 复盘 / 图鉴 ----------
const show = (id, on) => $(id).classList.toggle('hidden', !on);
function setPaused(p) { S.paused = p; if (p) { keys.clear(); inp.throttle = 0; } }
function toggleMenu() {
  if (!S.running) return;
  if (!$('report').classList.contains('hidden') || !$('book').classList.contains('hidden')) { show('report', false); show('book', false); show('pause', true); return; }
  const open = $('pause').classList.contains('hidden'); show('pause', open); setPaused(open);
}
function start() { show('start', false); show('hud', true); S.running = true; setPaused(false); audio.unlock(); }
$('btnStart').onclick = start;
$('btnResume').onclick = () => { show('pause', false); setPaused(false); };
$('btnReset').onclick = () => { S.R.needReset = {}; show('pause', false); setPaused(false); };
$('btnRestart').onclick = () => { if (lesson) startLesson(lesson.i); else { restart(); show('pause', false); setPaused(false); } };
$('btnReport').onclick = () => { openReport(); };
$('btnBook').onclick = () => openBook();
$('btnReportClose').onclick = () => { show('report', false); show('pause', true); };
$('btnBookClose').onclick = () => { show('book', false); if (S.running) show('pause', true); };

function openReport() {
  const R = S.R, by = {};
  for (const e of R.log) { if (e.sev === 'info') continue; (by[e.type] ||= { n: 0, ev: e, where: new Set() }).n++; if (e.street) by[e.type].where.add(shortName(e.street)); }
  const rows = Object.entries(by).sort((a, b) => (PENALTY[b[0]] || 0) * b[1].n - (PENALTY[a[0]] || 0) * a[1].n);
  const bad = rows.filter(([, v]) => v.ev.sev !== 'good'), good = rows.filter(([, v]) => v.ev.sev === 'good');
  const mi = (S.car.odo / 1609.34).toFixed(2), mm = Math.floor(S.driveTime / 60), ss = String(Math.floor(S.driveTime % 60)).padStart(2, '0');
  const row = ([type, v]) => { const t = EVENT_TEXT[type](v.ev); return `<div class="rrow ${v.ev.sev}"><h4>${EVENT_SHORT[type] || t.title} × ${v.n}<em>${PENALTY[type] ? '每次 −' + PENALTY[type] : ''}</em></h4>${t.body ? `<p>${t.body}</p>` : ''}<div class="where">${[...v.where].slice(0, 4).join('　')}</div></div>`; };
  $('reportBody').innerHTML = `<div class="stats"><div class="stat"><b>${R.score}</b><span>得分</span></div><div class="stat"><b>${mm}:${ss}</b><span>驾驶时间</span></div><div class="stat"><b>${mi}</b><span>英里</span></div><div class="stat"><b>${R.good}</b><span>做对的动作</span></div></div>`
    + (bad.length ? '<div class="cat">需要改的地方（按扣分多少排）</div>' + bad.map(row).join('') : '<div class="rrow good"><h4>这次没有违规</h4></div>')
    + (good.length ? '<div class="cat">做对的</div>' + good.map(row).join('') : '');
  show('pause', false); show('report', true);
}
let bookBuilt = false;
function openBook() {
  if (!bookBuilt) {
    let html = '', open = false;
    for (const s of SIGN_BOOK) {
      if (s.cat) { html += (open ? '</div>' : '') + `<div class="cat">${s.cat}</div><div class="signs">`; open = true; continue; }
      html += `<div class="sign ${s.dark ? 'dark' : ''}"><img src="${signDataURL(s.id)}" alt="${s.en}"><div><b>${s.zh}</b><em>${s.en}</em><p>${s.tip}</p></div></div>`;
    }
    $('bookBody').innerHTML = html + '</div>'; bookBuilt = true;
  }
  show('pause', false); show('book', true); if (S.running) setPaused(true);
}

// ---------- 主循环 ----------
function resize() {
  const st = stage(); for (const id of ['gl', 'hud']) { const e = $(id).style; e.left = st.x + 'px'; e.top = st.y + 'px'; e.width = st.w + 'px'; e.height = st.h + 'px'; e.right = e.bottom = 'auto'; }
  renderer.setPixelRatio(pickPR()); const w = st.w, h = st.h, pr = renderer.getPixelRatio(); renderer.setSize(w, h, false); view.resize(w, h); post.setSize(Math.round(w * pr), Math.round(h * pr)); post.setStyle(STYLES[styleIdx]); }
addEventListener('resize', resize); resize();

const PC = {};
function stepActors(dt) { const c = S.car, A = S.R.A; carCenter(c, PC); stepTraffic(T, { x: PC.x, z: PC.z, y: c.y || 0, h: c.h, v: c.v, cur: S.R.cur, stopT: A && A.stopped ? A.stopT : -1 }, S.t, dt); }
function simStep(lookT) {
  stepCar(S.car, inp, DT);
  if (trafficOn) stepActors(DT);
  stepRules(S.R, S.car, map, S.t, DT, trafficOn ? T : null); S.t += DT; S.driveTime += DT;
  showEvents();
  cleanStep();
  lessonSim();
  if (S.R.needReset) {
    // 撞了：先停在原地 1.7 秒（泛红、闷响、被撞的人倒地、被撞的车打双闪），再退回去
    const hit = S.R.events.find(e => e.type === 'crash' || e.type === 'hit_car' || e.type === 'hit_ped');
    if (hit) {
      S.crash = { t: 1.7, reset: S.R.needReset }; S.R.needReset = null; S.car.v = 0; audio.crash(hit.type !== 'hit_ped');
      $('hitMsg').textContent = hit.type === 'hit_ped' ? '撞到行人' : hit.type === 'hit_car' ? '撞车了' : '碰到停着的车'; $('hit').classList.add('on');
      return;
    }
    doReset();
  }
}
function doReset() {
  {
    const flip = S.R.needReset.flip, c = S.car, back = S.R.needReset.back ? 9 : 0;      // 撞了车或人：退回去 9 米，并把贴得太近的车清掉
    const p = map.snapToLane(c.x + Math.cos(c.h) * (CAR.center - back), c.z + Math.sin(c.h) * (CAR.center - back), c.h + (flip ? Math.PI : 0), c.y || 0) || startPose;
    if (back) T.cars = T.cars.filter(o => Math.hypot(o.x - p.x, o.z - p.z) > 16);
    placeCar(p); const f = $('flash'); f.classList.add('on'); requestAnimationFrame(() => requestAnimationFrame(() => f.classList.remove('on')));
  }
}
let prev = performance.now(), acc = 0, frame = 0, lookT = 0;
// 固定路线飞行（跑分 / 录像用）：车按固定速度沿折线走，不跑物理和规则
function flyStep(dt) {
  const F = S.fly, c = S.car; F.d = Math.min(F.len, F.d + F.v * dt); S.t += dt; if (trafficOn) { S.R.cur = null; stepActors(Math.min(dt, 0.05)); }
  let i = 1; while (i < F.pts.length - 1 && F.pts[i].d < F.d) i++;
  const a = F.pts[i - 1], b = F.pts[i], t = (F.d - a.d) / (b.d - a.d || 1), h = Math.atan2(b.z - a.z, b.x - a.x);
  let dh = h - c.h; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI; c.h += dh * Math.min(1, dt * 4 + 0.02);
  c.x = a.x + (b.x - a.x) * t - Math.cos(c.h) * CAR.center; c.z = a.z + (b.z - a.z) * t - Math.sin(c.h) * CAR.center; c.v = F.v;
  if (F.ft && F.d > 12 && F.d < F.len) { F.ft.push(dt * 1000); const r = renderer.info.render; F.calls = Math.max(F.calls, r.calls); F.tris = Math.max(F.tris, r.triangles); }
  renderer.info.reset();
  if (F.d >= F.len && F.ft && !window.__bench) {
    const f = F.ft.slice().sort((x, y) => x - y), avg = f.reduce((x, y) => x + y, 0) / f.length;
    window.__bench = { frames: f.length, avgMs: +avg.toFixed(2), fps: +(1000 / avg).toFixed(1), p95Ms: +f[Math.floor(f.length * 0.95)].toFixed(2), maxMs: +f[f.length - 1].toFixed(2), calls: F.calls, tris: F.tris, size: innerWidth + 'x' + innerHeight, style: STYLES[styleIdx].id };
  }
}
// 自动画质：连续两秒平均帧时间超过 24 ms 就降一档（1 = 降分辨率，2 = 再关阴影）。地址加 ?q=0 固定最高画质
let quality = 0, ftSum = 0, ftN = 0; const qualityLocked = params.has('q');
function lowerQuality() { quality++; if (quality >= 1) prScale = 0.75; if (quality >= 2) sky.setShadows(false); resize(); }
// 限帧：最多 60 帧（高刷屏上不限的话会按 144 / 240 帧全速跑，风扇狂转）；暂停、菜单、开着大地图时降到 15 帧
const uncapped = params.has('bench') || params.has('nocap'); let lastDraw = 0;
function tick(now) {
  if (!uncapped) { const idle = !S.fly && (!S.running || S.paused), gap = idle ? 1000 / 15 : 1000 / 60; if (now - lastDraw < gap - 1.5) { requestAnimationFrame(tick); return; } lastDraw = now; }
  const dt = Math.max(0, Math.min(0.1, (now - prev) / 1000)); prev = now;
  if (window.__jd.freeze) { window.__jd.freeze(); requestAnimationFrame(tick); return; }      // 调试：停住画面，手动摆镜头截图
  if (S.fly) flyStep(dt);
  else if (S.running && !S.paused && S.crash) {
    S.crash.t -= dt; S.t += dt; if (trafficOn) stepActors(dt);
    if (S.crash.t <= 0) { S.R.needReset = S.crash.reset; S.crash = null; $('hit').classList.remove('on'); doReset(); }
  } else if (S.running && !S.paused) {
    if (!qualityLocked && quality < 2 && dt < 0.1) { ftSum += dt; if (++ftN >= 120) { if (ftSum / ftN > 0.024) lowerQuality(); ftSum = ftN = 0; } }
    lookT = readInput(dt); acc += dt;
    while (acc >= DT) { simStep(); acc -= DT; }
  } else S.t += dt * (S.running ? 0 : 1);       // 开始界面上红绿灯照常走
  if (frame % 4 === 0) world.updateSignals(S.t);
  view.update(S.car, lookT, dt);
  audio.engine(S.running && !S.paused ? S.car : null);
  if (S.running) { updateHud(); if (frame % 3 === 0) drawMini(); if (frame % 10 === 0) lessonTick(); }
  if (frame % 6 === 0) world.updateLod(S.car.x, S.car.z);
  world.stream(S.car.x, S.car.z);
  sky.update(view.camera, S.car.x, S.car.z, (frame & 1) === 0);
  if (trafficOn) actors.update(T, S.t);
  view.renderMirrors(); post.render(scene, view.camera);
  frame++; requestAnimationFrame(tick);
}
if (params.has('cam')) view.mode = params.get('cam');
// 白模：所有东西换成同一种中性灰材质，只看模型本身的轮廓、厚度和层次（?clay）
if (params.has('clay')) {
  // 中性材质诊断：所有模型换成同一种普通漫反射灰，不分段、不描边、不加接触阴影；玻璃、贴图牌子、天空不画。只进阴影图的楼芯保持原样
  const clay = new THREE.MeshLambertMaterial({ color: 0xcfccc6 }); post.setStyle({ ...STYLES[styleIdx], ao: 0, sat: 1, contrast: 1 });
  scene.traverse(o => {
    if (!o.isMesh || o.material.colorWrite === false) return;
    if (o.material.transparent || o.material.isMeshBasicMaterial) { o.layers.set(7); return; }
    if (o.isInstancedMesh) o.instanceColor = null;
    o.material = clay;
  });
}
world.updateLod(S.car.x, S.car.z); view.update(S.car, 0, 0); sky.update(view.camera, S.car.x, S.car.z); post.render(scene, view.camera);
// 场景里几千个物体绝大多数不动：关掉每次渲染前的全场景矩阵刷新，会动的（自己的车、镜头、太阳）各自手动刷新
scene.updateMatrixWorld(true); scene.matrixWorldAutoUpdate = false;
$('btnStart').disabled = false; $('btnStart').textContent = '开始练车（Enter）';
if (params.has('autostart')) start();
requestAnimationFrame(tick);

// 调试钩子
window.__jd = {
  S, map, view, world, scene, renderer, inp, keys, sky, post, applyStyle, STYLES,
  teleport(x, z, h) { placeCar({ x, z, h: h ?? S.car.h }); },
  step(n = 1, input) { if (input) Object.assign(inp, input); for (let i = 0; i < n; i++) simStep(); },
  /** 调试：把车摆到第 n 个满足条件的路口进口前 dist 米 */
  approach(pred, dist = 25, n = 0) {
    const list = []; for (const j of map.juncs) for (const l of j.legs) if (l.approach && l.segRef.useLen > dist + 10 && pred(j, l)) list.push([j, l]);
    const [j, l] = list[n % list.length], h = Math.atan2(-l.oz, -l.ox);
    placeCar(map.snapToLane(l.ex + l.ox * (dist + 2.3), l.ez + l.oz * (dist + 2.3), h)); S.car.gear = 'D'; return j.name + ' / ' + l.segRef.name + ' / ' + j.control + ' (' + list.length + ' 个)';
  },
  /** 调试：从正上方看一片区域 */
  overview(x = 0, z = 0, height = 500) {
    $('hud').style.display = 'none'; const c = view.camera; scene.fog.far = 1e5; scene.fog.near = 1e5 - 1;
    window.__jd.freeze = () => { c.position.set(x, height, z); c.up.set(0, 0, -1); c.lookAt(x, 0, z); c.layers.set(0); world.updateLod(x, z); world.updateSignals(S.t); sky.update(c, x, z); post.render(scene, c); };
  },
  /** 固定路线：从车现在的位置沿车道直行 total 米，路口挑最直的出口 */
  route(total = 300) {
    const P = {}, pts = []; const l = map.locate(S.car.x, S.car.z, {}); let seg = l.seg, s = l.s, d = 0; pointAt(seg, s, P);
    let fwd = Math.cos(S.car.h) * P.dx + Math.sin(S.car.h) * P.dz > 0;
    const push = (x, z) => { const q = pts[pts.length - 1]; if (q) d += Math.hypot(x - q.x, z - q.z); pts.push({ x, z, d }); };
    for (let g = 0; g < 60 && d < total; g++) {
      const end = fwd ? seg.len - seg.trimB : seg.trimA, lat = laneCenter(seg, fwd, (fwd ? seg.lf : seg.lb) - 1);
      for (; fwd ? s < end : s > end; s += fwd ? 2 : -2) { offsetPoint(seg, s, lat, P); push(P.x, P.z); if (d >= total) break; }
      offsetPoint(seg, end, lat, P); push(P.x, P.z);
      const j = fwd ? seg.jb : seg.ja, tx = fwd ? P.dx : -P.dx, tz = fwd ? P.dz : -P.dz; if (!j) break;
      let best = null, bd = -2; for (const k of j.legs) { if (!k.exit || k.segRef === seg) continue; const dd = k.ox * tx + k.oz * tz; if (dd > bd) { bd = dd; best = k; } }
      if (!best) break; seg = best.segRef; fwd = best.end === 'a'; s = fwd ? seg.trimA : seg.len - seg.trimB;
    }
    return { pts, len: d };
  },
  fly(v = 9, total = 300, bench = false) { const r = window.__jd.route(total); renderer.info.autoReset = false; S.fly = { ...r, d: 0, v, ft: bench ? [] : null, calls: 0, tris: 0 }; },
  render() { world.updateLod(S.car.x, S.car.z); world.updateSignals(S.t); view.update(S.car, lookT, 0.016); updateHud(); drawMini(); sky.update(view.camera, S.car.x, S.car.z); view.renderMirrors(); post.render(scene, view.camera); },
  /** 调试：把镜头固定在一个位置看向一个点 */
  lookFrom(px, py, pz, tx, ty, tz) {
    $('hud').style.display = 'none'; const c = view.camera;
    window.__jd.freeze = () => { c.up.set(0, 1, 0); c.position.set(px, py, pz); c.lookAt(tx, ty, tz); c.layers.set(0); c.layers.enable(2); view.root.position.set(S.car.x, 0, S.car.z); view.root.rotation.y = -S.car.h; world.updateLod(tx, tz); world.updateSignals(S.t); sky.update(c, tx, tz); post.render(scene, c); };
  },
};
// 出小样用：?spot=cockpit|chase|street|aerial 直接摆到固定机位（配合 ?style=）
if (params.has('spot')) {
  const spot = params.get('spot'); start();
  window.__jd.approach((j, l) => j.control === 'allway' && l.stop && l.segRef.oneway, 30, +(params.get('at') || 7));
  const c = S.car, fx = Math.cos(c.h), fz = Math.sin(c.h), rx = -fz, rz = fx;
  if (spot === 'chase') view.mode = 'chase';
  else if (spot === 'street') window.__jd.lookFrom(c.x - fx * 7 + rx * 6.5, 1.9, c.z - fz * 7 + rz * 6.5, c.x + fx * 16 - rx * 1, 1.6, c.z + fz * 16 - rz * 1);
  else if (spot === 'aerial') window.__jd.lookFrom(c.x - fx * 38 + rx * 26, 30, c.z - fz * 38 + rz * 26, c.x + fx * 24, 3, c.z + fz * 24);
  else if (world.samples[spot]) {      // 样板：离这个位置最近的第 n 个店面 / 台阶，镜头在正前方偏一点，d 米远
    const s = world.samples[spot].slice().sort((p, q) => Math.hypot(p.x - c.x, p.z - c.z) - Math.hypot(q.x - c.x, q.z - c.z))[+(params.get('n') || 0)], d = +(params.get('d') || 6.5), side = +(params.get('side') || 2.2);
    window.__jd.lookFrom(s.x + s.nx * d + s.nz * side, +(params.get('eye') || 1.65), s.z + s.nz * d - s.nx * side, s.x, +(params.get('ty') || 1.9), s.z);
  }
  else if (spot === 'cover') { const k = +(params.get('k') || 0); window.__jd.lookFrom(c.x - fx * (6.2 + k) - rx * 2.6, 1.55, c.z - fz * (6.2 + k) - rz * 2.6, c.x + fx * 14 + rx * 1.2, 1.5, c.z + fz * 14 + rz * 1.2); }
  else if (spot === 'car') window.__jd.lookFrom(c.x + fx * 6.6 - rx * 1.5, 1.25, c.z + fz * 6.6 - rz * 1.5, c.x + fx * 1.6, 0.7, c.z + fz * 1.6);
}
// 跑分 / 录像：?fly（沿固定路线匀速开）、?bench（同上并记录帧时间，结果在 window.__bench）
if (params.has('fly') || params.has('bench')) {
  if (!params.has('spot')) { start(); window.__jd.approach((j, l) => j.control === 'allway' && l.stop && l.segRef.oneway, 30, +(params.get('at') || 7)); }
  window.__jd.fly(+(params.get('v') || 9), +(params.get('len') || 300), params.has('bench'));
}
window.__jd.ready = true;

// ---------- 课程 ----------
/** 出发点：离地图中心最近、符合这节课要求的地方 */
// 侧方停车的目标车位：绿色的框
const marker = new THREE.Mesh(new THREE.PlaneGeometry(5.6, 2.2), new THREE.MeshBasicMaterial({ color: 0x35e07a, transparent: true, opacity: 0.45, depthWrite: false })); marker.visible = false; marker.renderOrder = 5; scene.add(marker);
let parkSpot = null; const PC2 = {};
/** 每一步：这节课里靠位置 / 动作判断的进度（限速路段里程、倒车距离、掉头、停进车位） */
function lessonSim() {
  const L = lesson, c = S.car, cur = S.R.cur; if (!L || !cur || L.over) return;
  const mph = Math.abs(c.v) * MPH, min = L.def.fastMin || 35;
  if (cur.seg.speed >= min && mph >= cur.seg.speed * 0.62 && mph <= cur.seg.speed + 3.5) L.fast += Math.abs(c.v) * DT;
  if (c.gear === 'R' && c.v < -0.3 && !cur.junc) L.x.rev = (L.x.rev || 0) - c.v * DT;
  if (L.kt && cur.seg === L.kt.seg && cur.fwd !== L.kt.fwd && !cur.junc && laneInfo(cur.seg, cur.o, cur.fwd).side === 'ok') L.x.kturn = 1;
  if (L.spot) { carCenter(c, PC2); let dh = c.h - L.spot.h; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI; if (Math.hypot(PC2.x - L.spot.x, PC2.z - L.spot.z) < 1.25 && Math.abs(dh) < 0.2 && c.gear === 'P') L.x.park = 1; }
}
const laneStart = (g, u, fwd = true) => { const q = offsetPoint(g, u, laneCenter(g, fwd, (fwd ? g.lf : g.lb) - 1), {}), h = Math.atan2(q.dz, q.dx) + (fwd ? 0 : Math.PI); return { x: q.x - Math.cos(h) * CAR.center, z: q.z - Math.sin(h) * CAR.center, h, y: segY(g, u) }; };
const nearest = (pred) => { let best = null, bd = 1e9; for (const g of map.segs) { if (!pred(g)) continue; const d = Math.hypot(g.px[0], g.pz[0]); if (d < bd) { bd = d; best = g; } } return best; };
function findStart(kind) {
  if (kind === 'default') return startPose;
  if (kind === 'multi') { const g = nearest(g => g.lf >= 2 && g.useLen > 220 && g.speed <= 35 && !g.high); return g ? laneStart(g, g.trimA + 15) : startPose; }
  if (kind === 'twoway') { const g = nearest(g => g.lb === 1 && g.lf === 1 && g.cls === 'residential' && g.useLen > 90 && !g.high); return g ? laneStart(g, g.trimA + 30) : startPose; }
  if (kind === 'highway') {
    const g = nearest(g => g.high && g.ys[0] < 0.5 && Math.max(...g.ys) > 6 && g.len > 80) || map.segs.filter(g => g.high && g.speed >= 45).sort((a, b) => b.len - a.len)[0];
    if (g) return laneStart(g, g.trimA + 8); kind = 'fast';
  }
  if (kind === 'park') {
    // 找一个真的空车位：路右边相邻两辆停着的车之间正好空出一辆车的位置
    if (!parkSpot) {
      const by = new Map(), L = {}; for (const p of map.parked) { let a = by.get(p.seg); if (!a) by.set(p.seg, a = []); a.push(p); }
      let bd = 1e9;
      for (const [id, list] of by) {
        const g = map.segs[id]; if (!g || g.speed > 25 || g.useLen < 70) continue;
        const ss = []; for (const p of list) { map.locate(p.x, p.z, L); if (L.seg === g && L.o > 0) ss.push(L.s); } ss.sort((a, b) => a - b);
        for (let i = 1; i < ss.length; i++) { const gap = ss[i] - ss[i - 1]; if (gap < 11.5 || gap > 13.5 || ss[i - 1] - g.trimA < 26) continue; const u = (ss[i] + ss[i - 1]) / 2, q = offsetPoint(g, u, g.halfW - 1.15, {}), d = Math.hypot(q.x, q.z); if (d < bd) { bd = d; parkSpot = { x: q.x, z: q.z, h: Math.atan2(q.dz, q.dx), g, u }; } }
      }
    }
    return parkSpot ? laneStart(parkSpot.g, parkSpot.u - 16) : startPose;
  }
  let best = null, bd = 1e9;
  if (kind === 'fast') {
    for (const s of map.segs) { if (s.speed < 35 || s.useLen < 220) continue; const d = Math.hypot(s.px[0], s.pz[0]); if (d < bd) { bd = d; best = s; } }
    if (!best) return startPose;
    const q = offsetPoint(best, best.trimA + 20, laneCenter(best, true, best.lf - 1), {}), h = Math.atan2(q.dz, q.dx);
    return { x: q.x - Math.cos(h) * CAR.center, z: q.z - Math.sin(h) * CAR.center, h, y: segY(best, best.trimA + 20) };
  }
  for (const j of map.juncs) {
    if (kind === 'allway' ? j.control !== 'allway' : j.control !== 'signal') continue;
    for (const l of j.legs) {
      if (!l.approach || l.segRef.useLen < 90 || l.segRef.speed > 30 || (kind === 'allway' && !l.stop)) continue;
      const d = Math.hypot(j.cx, j.cz); if (d < bd) { bd = d; best = l; }
    }
  }
  if (!best) return startPose;
  return map.snapToLane(best.ex + best.ox * 70, best.ez + best.oz * 70, Math.atan2(-best.oz, -best.ox)) || startPose;
}
function startLesson(i) {
  const def = LESSONS[i]; restart(); placeCar(findStart(def.start));
  lesson = { i, def, log0: 0, odo0: 0, fast: 0, over: false, x: {}, kt: null, spot: null };
  const cur0 = map.locate(S.car.x, S.car.z, {}, S.car.y || 0); if (def.start === 'twoway' && cur0.seg) lesson.kt = { seg: cur0.seg, fwd: Math.cos(S.car.h) * cur0.dx + Math.sin(S.car.h) * cur0.dz >= 0 };
  marker.visible = false;
  if (def.start === 'park' && parkSpot) { lesson.spot = parkSpot; marker.position.set(parkSpot.x, 0.04, parkSpot.z); marker.rotation.set(-Math.PI / 2, 0, -parkSpot.h); marker.visible = true; marker.updateMatrixWorld(true); }
  for (const id of ['start', 'pause', 'lessonDone']) show(id, false); start(); lessonTick();
  toast({ sev: 'info' }, `第 ${i + 1} 课：${def.title}`, def.brief, 12000);
}
function endLesson() { lesson = null; marker.visible = false; show('lessonBox', false); }
let lessonKey = '';
function lessonTick() {
  if (!lesson) { show('lessonBox', false); return; }
  const st = lessonState(lesson, S.R, S.car), key = st.rows.map(r => r.cur).join() + st.failed;
  if (key !== lessonKey) {
    lessonKey = key; show('lessonBox', true);
    $('lessonBox').innerHTML = `<b>第 ${lesson.i + 1} 课　${lesson.def.title}</b>` + st.rows.map(r => `<div class="${r.done ? 'ok' : ''}"><span>${r.done ? '✓' : '○'} ${r.text}</span><span>${r.k === 'score' ? r.cur : r.cur + ' / ' + r.n}</span></div>`).join('');
  }
  if (lesson.over || S.crash) return;
  const forbidHit = st.failed && st.failed !== 'score';
  if (!st.done && !forbidHit && st.failed !== 'score') return;
  lesson.over = true; setPaused(true);
  const ok = st.done && !st.failed, n = !ok ? 0 : st.penalty === 0 ? 3 : st.penalty <= 10 ? 2 : 1;
  if (ok) { stars[lesson.i] = Math.max(stars[lesson.i] || 0, n); try { localStorage.setItem('jdLessons', JSON.stringify(stars)); } catch { /* 同上 */ } }
  $('ldTitle').textContent = ok ? `第 ${lesson.i + 1} 课 通过` : '这一课没过';
  $('ldStars').textContent = ok ? '★'.repeat(n) + '☆'.repeat(3 - n) : '';
  $('ldText').textContent = ok ? (st.penalty ? `过程中扣了 ${st.penalty} 分。扣分项在“复盘”里能看到，零扣分是三星。` : '全程零扣分。')
    : st.failed === 'score' ? `目标都完成了，但得分只有 ${100 - st.penalty}，要 80 以上。看一下复盘里扣分的地方再来。` : `这节课不能出现：${EVENT_SHORT[st.failed] || st.failed}。再来一次。`;
  $('btnLdNext').style.display = ok && lesson.i < LESSONS.length - 1 ? '' : 'none';
  show('lessonDone', true); if (ok) audio.good(); else audio.bad();
}
ready = true; if (wantLesson >= 0) { const w = wantLesson; wantLesson = -1; startLesson(w); }
$('btnLdNext').onclick = () => startLesson(lesson.i + 1);
$('btnLdRetry').onclick = () => startLesson(lesson.i);
$('btnLdFree').onclick = () => { endLesson(); show('lessonDone', false); setPaused(false); };
const toMenu = () => { endClean(); endLesson(); buildLessonList(); for (const id of ['lessonDone', 'pause', 'hud']) show(id, false); show('start', true); S.running = false; setPaused(true); };
$('btnLdMenu').onclick = toMenu; $('btnLessons').onclick = toMenu;
if (params.has('lesson')) startLesson(Math.max(0, Math.min(LESSONS.length - 1, +params.get('lesson') - 1)));

// ---------- 大地图（M）：上北下南，拖动平移，滚轮缩放 ----------
let bigOpen = false; const bm = { x: 0, z: 0, s: 1 }, bigCv = $('bigCanvas'), bg = bigCv.getContext('2d');
function toggleBig() {
  bigOpen = !bigOpen; $('bigmap').classList.toggle('hidden', !bigOpen);
  if (bigOpen) { bm.x = S.car.x; bm.z = S.car.z; bm.s = 0.9; setPaused(true); drawBig(); } else if ($('pause').classList.contains('hidden') && $('lessonDone').classList.contains('hidden')) setPaused(false);
}
function drawBig() {
  const pr = Math.min(devicePixelRatio, 2), W = innerWidth, H = innerHeight; if (bigCv.width !== W * pr) { bigCv.width = W * pr; bigCv.height = H * pr; }
  const s = bm.s, c = bg, X = (x) => (x - bm.x) * s + W / 2, Z = (z) => (z - bm.z) * s + H / 2, vis = (x, z, m) => X(x) > -m && X(x) < W + m && Z(z) > -m && Z(z) < H + m;
  c.setTransform(pr, 0, 0, pr, 0, 0); c.fillStyle = '#e8eaed'; c.fillRect(0, 0, W, H); c.lineCap = 'round'; c.lineJoin = 'round';
  c.fillStyle = '#c3e6c1'; for (const f of map.raw.parks) { c.beginPath(); for (let i = 0; i < f.length; i += 2) c[i ? 'lineTo' : 'moveTo'](X(f[i]), Z(f[i + 1])); c.fill(); }
  if (s > 0.8) { c.fillStyle = '#d8dade'; for (const b of map.buildings) { if (b.skip || !vis((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2, 60)) continue; c.beginPath(); for (let i = 0; i < b.n; i++) c[i ? 'lineTo' : 'moveTo'](X(b.pts[2 * i]), Z(b.pts[2 * i + 1])); c.fill(); } }
  const big = (g) => g.cls === 'motorway' || g.cls === 'trunk' || g.cls === 'primary', mid = (g) => g.cls === 'secondary';
  for (const pass of [0, 1]) for (const g of map.segs) {      // 先画一圈深色的边，再画路面：主干道黄色，其余白色
    if (!vis(g.px[g.n >> 1], g.pz[g.n >> 1], g.len * s + 40)) continue;
    const w = Math.max(big(g) ? 3.4 : mid(g) ? 2.6 : 1.8, g.halfW * 2 * s);
    c.lineWidth = pass ? w : w + 2; c.strokeStyle = pass ? (big(g) ? '#fbd56b' : mid(g) ? '#fdeeb5' : '#ffffff') : (big(g) ? '#e0a52a' : '#c4c7cc');
    c.beginPath(); c.moveTo(X(g.px[0]), Z(g.pz[0])); for (let i = 1; i < g.n; i++) c.lineTo(X(g.px[i]), Z(g.pz[i])); c.stroke();
  }
  if (s > 1.1) { c.fillStyle = '#8a8f98'; for (const g of map.segs) {      // 单行道箭头
    if (!g.oneway || g.len < 40 || !vis(g.px[g.n >> 1], g.pz[g.n >> 1], 20)) continue;
    const q = offsetPoint(g, g.len / 2, 0, {}); c.save(); c.translate(X(q.x), Z(q.z)); c.rotate(Math.atan2(q.dz, q.dx)); c.beginPath(); c.moveTo(6, 0); c.lineTo(-4, -4); c.lineTo(-4, 4); c.fill(); c.restore();
  } }
  if (s > 0.7) for (const j of map.juncs) {      // 红绿灯、STOP
    if (j.control === 'joint' || j.control === 'none' || !vis(j.cx, j.cz, 10)) continue; const x = X(j.cx), z = Z(j.cz);
    if (j.control === 'signal') { c.fillStyle = '#202124'; c.fillRect(x - 3.5, z - 7, 7, 14); for (const [k, col] of [[-4, '#ff4b3e'], [0, '#ffc21a'], [4, '#2ee06a']]) { c.fillStyle = col; c.beginPath(); c.arc(x, z + k, 1.7, 0, 7); c.fill(); } }
    else { c.fillStyle = '#d0121f'; c.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * 5, z + Math.sin(a) * 5); } c.fill(); }
  }
  // 路名：沿路写，同名的隔一段才再写一次
  c.font = '600 12px Arial, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineWidth = 3; const used = new Set();
  for (const g of map.segs) {
    if (!g.name || g.len * s < 110 || !vis(g.px[g.n >> 1], g.pz[g.n >> 1], 0)) continue;
    const q = offsetPoint(g, g.len / 2, 0, {}), k = g.name + Math.round(X(q.x) / 260) + ',' + Math.round(Z(q.z) / 260); if (used.has(k)) continue; used.add(k);
    let a = Math.atan2(q.dz, q.dx); if (a > Math.PI / 2 || a < -Math.PI / 2) a += Math.PI;
    c.save(); c.translate(X(q.x), Z(q.z)); c.rotate(a); c.strokeStyle = 'rgba(255,255,255,0.9)'; c.strokeText(shortName(g.name), 0, 0); c.fillStyle = '#3c4043'; c.fillText(shortName(g.name), 0, 0); c.restore();
  }
  // 自己的车
  c.save(); c.translate(X(S.car.x), Z(S.car.z)); c.rotate(S.car.h + Math.PI / 2); c.fillStyle = 'rgba(66,133,244,0.22)'; c.beginPath(); c.arc(0, 0, 20, 0, 7); c.fill();
  c.fillStyle = '#4285f4'; c.strokeStyle = '#fff'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(0, -12); c.lineTo(8, 9); c.lineTo(0, 5); c.lineTo(-8, 9); c.closePath(); c.fill(); c.stroke(); c.restore();
  // 比例尺
  const m = [50, 100, 200, 500, 1000].find(v => v * s > 70) || 1000; c.fillStyle = '#3c4043'; c.fillRect(20, H - 30, m * s, 3); c.textAlign = 'left'; c.font = '600 12px Arial'; c.fillText(m + ' 米', 20, H - 40);
}
{
  let drag = null; const el = $('bigmap');
  el.addEventListener('pointerdown', (e) => { drag = [e.clientX, e.clientY]; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', (e) => { if (!drag) return; bm.x -= (e.clientX - drag[0]) / bm.s; bm.z -= (e.clientY - drag[1]) / bm.s; drag = [e.clientX, e.clientY]; drawBig(); });
  el.addEventListener('pointerup', () => { drag = null; });
  el.addEventListener('wheel', (e) => { e.preventDefault(); const k = Math.exp(-e.deltaY * 0.0015), s1 = Math.max(0.12, Math.min(6, bm.s * k)), dx = e.clientX - innerWidth / 2, dz = e.clientY - innerHeight / 2; bm.x += dx / bm.s - dx / s1; bm.z += dz / bm.s - dz / s1; bm.s = s1; drawBig(); }, { passive: false });
  addEventListener('resize', () => { if (bigOpen) drawBig(); });
}
window.__jd.toggleBig = toggleBig; window.__jd.startLesson = startLesson;
window.__jd.traffic = () => T;
// 调试 / 截图：把车放到最长的一段高架中间（?spot=highway）
window.__jd.toTunnel = (k = 0.5) => { const g = map.segs.filter(x => x.ys && Math.min(...x.ys) < -6 && Math.max(...x.ys) > -0.5).sort((a, b) => b.len - a.len)[0]; if (!g) return null; const down = g.ys[0] > g.ys[g.ys.length - 1], zero = g.cum[g.ys.findIndex(v => v < -0.2)] || 0, u = down ? Math.max(2, zero - 25 + k * 60) : g.len * 0.3, q = offsetPoint(g, u, laneCenter(g, true, g.lf - 1), {}), h = Math.atan2(q.dz, q.dx); placeCar({ x: q.x - Math.cos(h) * CAR.center, z: q.z - Math.sin(h) * CAR.center, h, y: segY(g, u) }); S.car.gear = 'D'; return g.name + ' ' + u.toFixed(0) + '/' + g.len.toFixed(0) + ' y=' + segY(g, u).toFixed(1); };
window.__jd.toHighway = (ramp) => {
  const g = ramp ? map.segs.filter(x => x.high && Math.min(...x.ys) < 0.3 && Math.max(...x.ys) > 6 && x.len > 120).sort((a, b) => a.len - b.len)[0] : map.segs.filter(x => x.high && x.ys.every(v => v > 7)).sort((a, b) => b.len - a.len)[0]; if (!g) return null;
  const u = ramp ? (g.ys[0] < 1 ? 30 : g.len - 110) : g.len * 0.4, q = offsetPoint(g, u, laneCenter(g, true, g.lf - 1), {}), h = Math.atan2(q.dz, q.dx);
  placeCar({ x: q.x - Math.cos(h) * CAR.center, z: q.z - Math.sin(h) * CAR.center, h, y: segY(g, u) }); S.car.gear = 'D'; return g.name;
};
if (params.get('spot') === 'tunnel') { window.__jd.freeze = null; window.__jd.toTunnel(+(params.get('k') || 0)); $('hud').style.display = ''; }
if (params.get('spot') === 'highway') { window.__jd.freeze = null; window.__jd.toHighway(params.has('ramp')); $('hud').style.display = ''; }
if (params.has('nohud')) $('hud').style.visibility = 'hidden';
