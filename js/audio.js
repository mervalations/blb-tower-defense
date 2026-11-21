// Synthesised sound effects (no audio files needed).
window.PTD = window.PTD || {};

PTD.Audio = (function () {
  let ctx = null, master = null, muted = false;
  const last = {};

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination);
    return true;
  }

  function tone(freq, dur, type, vol, slide, delay) {
    if (muted || !ensure()) return;
    const t0 = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(master);
    o.start(t0); o.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, hp, delay) {
    if (muted || !ensure()) return;
    const t0 = ctx.currentTime + (delay || 0);
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = ctx.createBufferSource(); s.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 1000;
    const g = ctx.createGain(); g.gain.value = vol || 0.2;
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t0);
  }

  // Rate-limit noisy sounds so a big wave doesn't turn into static.
  function throttle(key, ms) {
    const now = performance.now();
    if (last[key] && now - last[key] < ms) return false;
    last[key] = now; return true;
  }

  const sfx = {
    deal() { noise(0.08, 0.25, 2500); tone(900, 0.06, 'triangle', 0.08, 1.4, 0.02); },
    select() { tone(660, 0.05, 'triangle', 0.12); },
    combine() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, 'triangle', 0.18, 1, i * 0.07)); },
    swap() { noise(0.15, 0.2, 1800); tone(500, 0.12, 'sine', 0.1, 1.6); },
    coin() { if (!throttle('coin', 60)) return; tone(1320, 0.06, 'square', 0.05); tone(1760, 0.1, 'square', 0.05, 1, 0.05); },
    leak() { if (!throttle('leak', 120)) return; tone(180, 0.3, 'sawtooth', 0.15, 0.6); },
    error() { tone(200, 0.12, 'square', 0.12); tone(150, 0.15, 'square', 0.12, 1, 0.1); },
    tick() { tone(1000, 0.04, 'sine', 0.12); },
    wave() { tone(392, 0.15, 'triangle', 0.2); tone(523, 0.25, 'triangle', 0.2, 1, 0.15); },
    boss() { [110, 110, 82, 110].forEach((f, i) => tone(f, 0.35, 'sawtooth', 0.22, 0.9, i * 0.22)); noise(0.6, 0.15, 200, 0.6); },
    win() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.2, 1, i * 0.12)); },
    lose() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.15, 1, i * 0.2)); },
    hand() { tone(784, 0.1, 'triangle', 0.15); tone(1175, 0.2, 'triangle', 0.15, 1, 0.1); },
    boom() { noise(0.5, 0.35, 120); tone(90, 0.4, 'sine', 0.3, 0.5); },
    tip() { tone(1500, 0.08, 'square', 0.06); tone(2000, 0.1, 'square', 0.06, 1, 0.07); },
    shot(fx) {
      if (!throttle('shot' + fx, 70)) return;
      switch (fx) {
        case 'chain': noise(0.07, 0.08, 4000); break;
        case 'fire': tone(300, 0.1, 'sawtooth', 0.04, 0.6); break;
        case 'shell': tone(140, 0.12, 'square', 0.05, 0.6); break;
        case 'royal': tone(1200, 0.12, 'triangle', 0.06, 0.5); break;
        default: tone(700, 0.04, 'triangle', 0.03, 0.7);
      }
    },
  };

  return {
    play(name, arg) { try { sfx[name] && sfx[name](arg); } catch (e) { /* audio is optional */ } },
    unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); },
    toggle() { muted = !muted; return muted; },
    get muted() { return muted; },
  };
})();
