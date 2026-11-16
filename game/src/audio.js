// DUSTLINE — audio: all sound is synthesised with WebAudio (oscillators +
// filtered noise). No external audio files. The context starts on the
// first user gesture; shot mode (screenshots) stays silent.

export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;
  let lastFarShot = 0;

  function ensure() {
    if (ctx) return true;
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.42;
      master.connect(ctx.destination);
      const len = ctx.sampleRate * 0.5;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, dur, type, gain, slideTo) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, filterFreq, gain, type = 'lowpass') {
    if (!ctx) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t); src.stop(t + dur + 0.02);
  }

  function shot(near) {
    if (near) { noise(0.09, 2400, 0.5); blip(170, 0.09, 'square', 0.22, 55); }
    else {
      const now = performance.now();
      if (now - lastFarShot < 70) return;
      lastFarShot = now;
      noise(0.12, 900, 0.16); blip(120, 0.1, 'square', 0.08, 50);
    }
  }

  const handlers = {
    shot: () => shot(true),
    shotFar: () => shot(false),
    hit: () => blip(1250, 0.05, 'sine', 0.25),
    hitFar: () => blip(900, 0.04, 'sine', 0.08),
    kill: () => { blip(1250, 0.05, 'sine', 0.25); setTimeout(() => blip(1600, 0.07, 'sine', 0.25), 70); },
    death: () => { noise(0.3, 500, 0.25); blip(90, 0.3, 'sawtooth', 0.15, 40); },
    reload: () => { noise(0.04, 3000, 0.2, 'highpass'); setTimeout(() => noise(0.04, 3000, 0.2, 'highpass'), 320); },
    step: () => noise(0.05, 420, 0.07),
    throw: () => noise(0.12, 1200, 0.12, 'bandpass'),
    smoke: () => noise(0.8, 700, 0.1),
    flash: () => { blip(2200, 0.35, 'sine', 0.3, 400); noise(0.2, 4000, 0.15, 'highpass'); },
    beep: () => blip(880, 0.09, 'sine', 0.2),
    planted: () => { blip(660, 0.1, 'sine', 0.2); setTimeout(() => blip(660, 0.1, 'sine', 0.2), 140); setTimeout(() => blip(990, 0.16, 'sine', 0.22), 300); },
    explosion: () => { noise(0.8, 2600, 0.6); blip(60, 0.7, 'sine', 0.5, 28); },
    roundStart: () => { blip(440, 0.09, 'square', 0.12); setTimeout(() => blip(660, 0.12, 'square', 0.12), 110); },
    roundWin: () => { [523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 0.14, 'triangle', 0.2), i * 120)); },
    roundLose: () => { [392, 330, 262].forEach((f, i) => setTimeout(() => blip(f, 0.16, 'triangle', 0.18), i * 130)); },
  };

  return {
    resume() { if (ensure() && ctx.state === 'suspended') ctx.resume(); },
    drain(state) {
      if (!ctx) return;
      const q = state.sfx;
      for (let i = 0; i < q.length; i++) {
        const h = handlers[q[i]];
        if (h) h();
      }
      q.length = 0;
    },
  };
}
