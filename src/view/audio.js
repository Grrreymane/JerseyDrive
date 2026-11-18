// 声音：全部用 WebAudio 合成（引擎、转向灯嗒嗒声、提示音）。
export function makeAudio() {
  let ctx = null, eng = null, engGain = null, engFilter = null, lastBlink = false;
  const A = {};
  A.unlock = () => {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      eng = ctx.createOscillator(); eng.type = 'sawtooth'; eng.frequency.value = 45;
      engFilter = ctx.createBiquadFilter(); engFilter.type = 'lowpass'; engFilter.frequency.value = 220;
      engGain = ctx.createGain(); engGain.gain.value = 0;
      eng.connect(engFilter).connect(engGain).connect(ctx.destination); eng.start();
    } catch { ctx = null; }
  };
  const beep = (freq, dur, vol = 0.08, type = 'sine', when = 0) => {
    if (!ctx) return; const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + when;
    o.type = type; o.frequency.value = freq; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + dur + 0.02);
  };
  A.engine = (car) => {
    if (!ctx) return;
    const t = ctx.currentTime;
    if (!car || car.gear === 'P') { engGain.gain.setTargetAtTime(car ? 0.012 : 0, t, 0.2); eng.frequency.setTargetAtTime(42, t, 0.2); return; }
    const sp = Math.abs(car.v);
    eng.frequency.setTargetAtTime(42 + sp * 3.2 + car.throttle * 28, t, 0.12);
    engFilter.frequency.setTargetAtTime(200 + sp * 14 + car.throttle * 260, t, 0.12);
    engGain.gain.setTargetAtTime(0.014 + car.throttle * 0.022 + Math.min(0.012, sp * 0.0007), t, 0.12);
  };
  A.blinker = (on, phase) => { if (on && phase !== lastBlink) beep(phase ? 1500 : 1150, 0.03, 0.05, 'square'); lastBlink = phase; };
  A.click = () => beep(700, 0.05, 0.06, 'square');
  A.bad = () => { beep(330, 0.22, 0.09, 'triangle'); beep(247, 0.32, 0.09, 'triangle', 0.18); };
  A.minor = () => beep(392, 0.2, 0.07, 'triangle');
  A.good = () => { beep(660, 0.12, 0.06); beep(880, 0.2, 0.06, 'sine', 0.1); };
  // 撞击：一声闷响（低频正弦快速下滑）+ 一小段噪声
  A.crash = (hard) => {
    if (!ctx) return; const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(hard ? 140 : 110, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.28); g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.45);
    const n = ctx.createBufferSource(), buf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = hard ? 2400 : 900; const g2 = ctx.createGain(); g2.gain.value = 0.28; n.buffer = buf; n.connect(f).connect(g2).connect(ctx.destination); n.start(t);
  };
  // 警笛：一个方波，音高用慢速的低频振荡在 650–1350 Hz 之间来回（“呜——哇——”），音量按距离
  let sir = null;
  A.siren = (dist) => {
    if (!ctx) return; const vol = dist > 260 ? 0 : 0.045 * Math.min(1, (260 - dist) / 200);
    if (!sir && vol > 0) {
      const o = ctx.createOscillator(), lfo = ctx.createOscillator(), depth = ctx.createGain(), g = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = 'square'; o.frequency.value = 1000; lfo.frequency.value = 0.45; depth.gain.value = 350; lfo.connect(depth).connect(o.frequency);
      f.type = 'lowpass'; f.frequency.value = 2200; g.gain.value = 0; o.connect(f).connect(g).connect(ctx.destination); o.start(); lfo.start(); sir = { o, lfo, g };
    }
    if (sir) sir.g.gain.setTargetAtTime(vol, ctx.currentTime, 0.2);
  };
  // 道口的铃：叮、叮……音量按离道口的距离
  let dingT = 0;
  A.bell = (dist) => { if (!ctx || dist > 180) return; const now = ctx.currentTime; if (now - dingT < 0.5) return; dingT = now; const v = 0.05 * Math.min(1, (180 - dist) / 140); beep(1320, 0.35, v, 'triangle'); beep(2640, 0.2, v * 0.4, 'sine'); };
  // 火车汽笛：两个低音和在一起
  A.trainHorn = (dist, long) => { if (!ctx || dist > 700) return; const v = 0.07 * Math.min(1, (700 - dist) / 500), d = long ? 1.6 : 0.6; for (const f of [311, 370, 466]) { const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime; o.type = 'sawtooth'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.08); g.gain.setValueAtTime(v, t + d - 0.15); g.gain.exponentialRampToValueAtTime(0.0001, t + d); const fl = ctx.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = 1400; o.connect(fl).connect(g).connect(ctx.destination); o.start(t); o.stop(t + d + 0.05); } };
  A.horn = () => { beep(420, 0.45, 0.1, 'sawtooth'); beep(520, 0.45, 0.08, 'sawtooth'); };
  return A;
}
