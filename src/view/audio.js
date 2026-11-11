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
  A.horn = () => { beep(420, 0.45, 0.1, 'sawtooth'); beep(520, 0.45, 0.08, 'sawtooth'); };
  return A;
}
