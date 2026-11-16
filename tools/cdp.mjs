// 用真 Chrome（无头 + 显卡）打开页面：等页面就绪 → 截图 / 取数 / 录像。
// node tools/cdp.mjs <url> [--size 1600x900] [--wait <js 表达式，为真才继续>] [--settle 1500]
//                    [--shot out.png] [--eval <js 表达式，打印结果>] [--video out.webm --secs 20] [--nolimit] [--mem]
// --mem 先强制回收垃圾，再打印 JS 堆大小（看内存占用）；--heapprof 打印还活着的内存是哪几行代码分配的；--cpuprof 打印 eval 期间最占 CPU 的函数
// --nolimit 关掉垂直同步，跑分时用（否则帧率被锁在 60）。
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const argv = process.argv.slice(2), url = argv[0], opt = {};
for (let i = 1; i < argv.length; i++) { const k = argv[i].replace(/^--/, ''); if (['nolimit', 'mem', 'heapprof', 'cpuprof'].includes(k)) opt[k] = true; else opt[k] = argv[++i]; }
const [w, h] = (opt.size || '1600x900').split('x').map(Number);
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const port = 9300 + Math.floor(Math.random() * 500), prof = mkdtempSync(join(tmpdir(), 'cdp-'));
const flags = ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required', `--window-size=${w},${h}`];
if (opt.nolimit) flags.push('--disable-gpu-vsync', '--disable-frame-rate-limit');
const p = spawn(chrome, [...flags, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let ws;
for (let i = 0; i < 60; i++) { try { const t = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); const pg = t.find(x => x.type === 'page'); if (pg) { ws = new WebSocket(pg.webSocketDebuggerUrl); break; } } catch { /* 还没起来 */ } await sleep(200); }
await new Promise(r => ws.onopen = r);
let id = 0; const pend = new Map(), logs = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  else if (m.method === 'Runtime.exceptionThrown') logs.push('EXC ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text));
  else if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning')) logs.push(m.params.type + ' ' + m.params.args.map(a => a.value ?? a.description).join(' '));
};
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval failed'); return r.result.result.value; };
const done = (code) => { for (const l of logs.slice(0, 12)) console.log(l); p.kill(); process.exit(code); };

await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
if (opt.heapprof) { await send('HeapProfiler.enable'); await send('HeapProfiler.startSampling', { samplingInterval: 65536 }); }
await send('Page.navigate', { url });
const waitFor = opt.wait || 'window.__jd && window.__jd.ready';
let ok = false;
for (let i = 0; i < 600; i++) { try { if (await ev(`!!(${waitFor})`)) { ok = true; break; } } catch { /* 页面还在跳转 */ } await sleep(250); }
if (!ok) { console.log('TIMEOUT waiting for', waitFor); done(1); }
await sleep(Number(opt.settle ?? 1500));
if (opt.video) {
  const b64 = await ev(`new Promise((res) => {
    const cv = document.querySelector('canvas'), rec = new MediaRecorder(cv.captureStream(30), { mimeType: 'video/webm;codecs=vp9', videoBitsPerSecond: 6e6 }), parts = [];
    rec.ondataavailable = (e) => parts.push(e.data);
    rec.onstop = () => { const fr = new FileReader(); fr.onload = () => res(fr.result.split(',')[1]); fr.readAsDataURL(new Blob(parts, { type: 'video/webm' })); };
    rec.start(); setTimeout(() => rec.stop(), ${Number(opt.secs || 15) * 1000});
  })`);
  writeFileSync(opt.video, Buffer.from(b64, 'base64')); console.log('saved', opt.video);
}
if (opt.heapprof) {      // 还活着的内存是在哪几行代码分配的（前 25）
  await send('HeapProfiler.collectGarbage'); const r = await send('HeapProfiler.getSamplingProfile'), agg = new Map();
  const walk = (n, stack) => { const f = n.callFrame, here = `${f.functionName || '(匿名)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`; if (n.selfSize) agg.set(here, (agg.get(here) || 0) + n.selfSize); for (const c of n.children) walk(c, stack); };
  walk(r.result.profile.head, []); [...agg].sort((a, b) => b[1] - a[1]).slice(0, 25).forEach(([k, v]) => console.log((v / 1e6).toFixed(1).padStart(7), 'MB ', k));
}
if (opt.cpuprof) { await send('Profiler.enable'); await send('Profiler.setSamplingInterval', { interval: 200 }); await send('Profiler.start'); }
if (opt.eval) console.log(JSON.stringify(await ev(opt.eval)));
if (opt.cpuprof) {      // eval 期间哪些函数最占 CPU（自身时间，前 20）
  const { result: { profile: P } } = await send('Profiler.stop'), self = new Map(), byId = new Map(P.nodes.map(n => [n.id, n])), dt = new Map();
  for (let i = 0; i < P.samples.length; i++) dt.set(P.samples[i], (dt.get(P.samples[i]) || 0) + (P.timeDeltas[i] || 0));
  let tot = 0; for (const [id, t] of dt) { const f = byId.get(id).callFrame, k = `${f.functionName || '(匿名)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + t); tot += t; }
  [...self].sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([k, v]) => console.log((v / tot * 100).toFixed(1).padStart(5), '% ', k));
}
if (opt.mem) { await send('HeapProfiler.enable'); await send('HeapProfiler.collectGarbage'); const m = await ev('performance.memory.usedJSHeapSize'); const u = (await send('Runtime.getHeapUsage')).result; console.log('JS 堆（回收后）', (m / 1e6).toFixed(0), 'MB；其中 V8 对象', (u.usedSize / 1e6).toFixed(0), 'MB，ArrayBuffer 等', ((u.backingStorageSize || 0) / 1e6).toFixed(0), 'MB'); }
if (opt.shot) { const r = await send('Page.captureScreenshot', { format: 'png' }); writeFileSync(opt.shot, Buffer.from(r.result.data, 'base64')); console.log('saved', opt.shot); }
done(0);
