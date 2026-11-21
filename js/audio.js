// Synthesised sound effects (no audio files needed): layered voices, a small room reverb,
// and a short musical sting for each looter crew.
window.PTD = window.PTD || {};

PTD.Audio = (function () {
  let ctx = null, master = null, muted = false;
  const last = {};

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.35;
    // gentle limiter so big moments (boss + coins + explosions) don't clip
    const lim = ctx.createDynamicsCompressor(); lim.threshold.value = -10; lim.knee.value = 8; lim.ratio.value = 6; lim.attack.value = 0.004; lim.release.value = 0.2;
    master.connect(lim); lim.connect(ctx.destination);
    return true;
  }

  // Rate-limit noisy sounds so a big wave doesn't turn into static.
  function throttle(key, ms) {
    const now = performance.now();
    if (last[key] && now - last[key] < ms) return false;
    last[key] = now; return true;
  }

  // ---------------------------------------------------------------- richer sfx voices
  // Layered sounds: a transient (filtered noise), a pitched body with a filter envelope, and a
  // send into a small procedural room reverb. Every play nudges pitch/volume a little so
  // repeated sounds don't feel machine-gunned.
  let verb = null, noiseBuf = null;
  function bus() {
    if (verb || !ensure()) return verb;
    const len = Math.floor(ctx.sampleRate * 1.4), ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    const conv = ctx.createConvolver(); conv.buffer = ir;
    verb = ctx.createGain(); verb.gain.value = 0.28;
    verb.connect(conv); conv.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    return verb;
  }
  const vary = (x, amt) => x * (1 + (Math.random() - 0.5) * 2 * (amt == null ? 0.04 : amt));
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  // o: { f, f1 (end pitch), type, dur, vol, at (attack), delay, cut (filter Hz), cut1, q, wet, vib, vibRate, detune, pan }
  function synth(o) {
    if (muted || !bus()) return;
    if (place.vol !== 1 || place.pan) o = Object.assign({}, o, { vol: (o.vol || 0.2) * place.vol, pan: o.pan || place.pan });
    const t0 = ctx.currentTime + (o.delay || 0), dur = o.dur || 0.2;
    const out = ctx.createGain(); out.gain.value = 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t0 + (o.at || 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = g;
    if (o.cut) {
      const f = ctx.createBiquadFilter(); f.type = o.ftype || 'lowpass'; f.Q.value = o.q || 0.8;
      f.frequency.setValueAtTime(o.cut, t0);
      if (o.cut1) f.frequency.exponentialRampToValueAtTime(o.cut1, t0 + dur);
      g.connect(f); node = f;
    }
    if (o.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; node.connect(p); node = p; }
    node.connect(out); out.connect(master);
    if (o.wet) { const s = ctx.createGain(); s.gain.value = o.wet; out.connect(s); s.connect(verb); }
    const oscs = o.detune ? [-o.detune, o.detune] : [0];
    for (const dt of oscs) {
      const osc = ctx.createOscillator(); osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(o.f, t0);
      if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t0 + (o.glide || dur));
      osc.detune.value = dt;
      if (o.vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = o.vibRate || 6; lg.gain.value = o.f * o.vib; l.connect(lg); lg.connect(osc.frequency); l.start(t0); l.stop(t0 + dur + 0.05); }
      osc.connect(g); osc.start(t0); osc.stop(t0 + dur + 0.05);
    }
  }
  // o: { dur, vol, f (filter Hz), f1, q, type ('bandpass' | 'lowpass' | 'highpass'), delay, wet, at }
  function hiss(o) {
    if (muted || !bus()) return;
    if (place.vol !== 1 || place.pan) o = Object.assign({}, o, { vol: (o.vol || 0.2) * place.vol, pan: o.pan || place.pan });
    const t0 = ctx.currentTime + (o.delay || 0), dur = o.dur || 0.1;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = o.type || 'bandpass'; f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.f || 2000, t0);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.2, t0 + (o.at || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g);
    if (o.pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = o.pan; g.connect(p); p.connect(master); } else g.connect(master);
    if (o.wet) { const w = ctx.createGain(); w.gain.value = o.wet; g.connect(w); w.connect(verb); }
    s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.05);
  }

  // A few instruments for the crew stings: (semitone note, start beat, length beats)
  const INST = {
    squeeze: (f, d, at, v) => synth({ f, dur: d, delay: at, vol: v * 0.5, type: 'sawtooth', detune: 9, cut: 1700, vib: 0.006, vibRate: 7, at: 0.03, wet: 0.25 }),
    pluck: (f, d, at, v) => synth({ f, dur: Math.min(d, 0.6), delay: at, vol: v, type: 'triangle', cut: 4000, cut1: 600, wet: 0.35 }),
    organ: (f, d, at, v) => { synth({ f, dur: d, delay: at, vol: v * 0.35, type: 'square', cut: 1400, at: 0.04, wet: 0.5 }); synth({ f: f * 2, dur: d, delay: at, vol: v * 0.2, type: 'sine', at: 0.04, wet: 0.5 }); },
    theremin: (f, d, at, v) => synth({ f, f1: f * 1.06, glide: d, dur: d, delay: at, vol: v * 0.6, type: 'sine', vib: 0.02, vibRate: 5.5, at: 0.08, wet: 0.5 }),
    tom: (f, d, at, v) => { synth({ f: f * 0.5, f1: f * 0.3, dur: 0.25, delay: at, vol: v * 1.3, type: 'sine' }); hiss({ dur: 0.05, vol: v * 0.3, f: 1200, delay: at }); },
    bleep: (f, d, at, v) => synth({ f, dur: Math.min(d, 0.14), delay: at, vol: v * 0.35, type: 'square', cut: 3000 }),
    harp: (f, d, at, v) => synth({ f, dur: 0.7, delay: at, vol: v * 0.7, type: 'triangle', wet: 0.6 }),
    twang: (f, d, at, v) => synth({ f: f * 1.02, f1: f, glide: 0.05, dur: Math.min(d, 0.5), delay: at, vol: v * 0.7, type: 'sawtooth', cut: 2600, cut1: 500, wet: 0.2 }),
    reed: (f, d, at, v) => synth({ f, dur: d, delay: at, vol: v * 0.4, type: 'square', cut: 1500, vib: 0.012, vibRate: 6, at: 0.03, wet: 0.3 }),
    kazoo: (f, d, at, v) => synth({ f, dur: d, delay: at, vol: v * 0.45, type: 'sawtooth', cut: 2200, q: 4, vib: 0.02, vibRate: 9, at: 0.02 }),
    horn: (f, d, at, v) => synth({ f, dur: d, delay: at, vol: v * 0.55, type: 'sawtooth', detune: 6, cut: 500, cut1: 1600, at: 0.12, wet: 0.45 }),
    ooh: (f, d, at, v) => synth({ f, f1: f * 0.9, dur: d, delay: at, vol: v * 0.5, type: 'sine', vib: 0.03, vibRate: 4, at: 0.15, wet: 0.8 }),
    brass: (f, d, at, v) => synth({ f, dur: d, delay: at, vol: v * 0.45, type: 'sawtooth', detune: 5, cut: 900, cut1: 2600, at: 0.03, wet: 0.35 }),
    pad: (f, d, at, v) => synth({ f, dur: d, delay: at, vol: v * 0.35, type: 'sawtooth', detune: 12, cut: 400, cut1: 3000, at: 0.25, wet: 0.6 }),
    xylo: (f, d, at, v) => { synth({ f, dur: 0.3, delay: at, vol: v * 0.7, type: 'sine', wet: 0.3 }); synth({ f: f * 4, dur: 0.06, delay: at, vol: v * 0.2, type: 'sine' }); },
    mandolin: (f, d, at, v) => { for (let k = 0; k < Math.max(1, Math.round(d / 0.06)); k++) synth({ f, dur: 0.08, delay: at + k * 0.06, vol: v * 0.35, type: 'triangle', cut: 3500 }); },
    bubble: (f, d, at, v) => synth({ f: f * 0.6, f1: f * 1.6, dur: 0.09, delay: at, vol: v * 0.5, type: 'sine' }),
    kick: (f, d, at, v) => synth({ f: 150, f1: 45, dur: 0.22, delay: at, vol: v * 1.4, type: 'sine' }),
    hat: (f, d, at, v) => hiss({ dur: 0.05, vol: v * 0.25, f: 9000, type: 'highpass', delay: at }),
    roar: (f, d, at, v) => { hiss({ dur: d, vol: v * 0.5, f: 300, f1: 900, type: 'lowpass', q: 3, delay: at, at: 0.08 }); synth({ f: f * 0.5, f1: f * 0.35, dur: d, delay: at, vol: v * 0.5, type: 'sawtooth', cut: 600, vib: 0.05, vibRate: 11, at: 0.08 }); },
    wind: (f, d, at, v) => hiss({ dur: d, vol: v * 0.25, f: 500, f1: 1500, q: 6, delay: at, at: 0.3, wet: 0.5 }),
    zap: (f, d, at, v) => synth({ f: f * 4, f1: f, dur: 0.18, delay: at, vol: v * 0.3, type: 'sawtooth', cut: 5000, vib: 0.3, vibRate: 40 }),
    whistle: (f, d, at, v) => synth({ f: f * 2, f1: f * 2.5, glide: d * 0.6, dur: d, delay: at, vol: v * 0.3, type: 'sine', vib: 0.01, vibRate: 12 }),
  };
  // Crew stings: [instrument, root midi note, beat seconds, [[semitone, beat, beats], ...], volume]
  const STINGS = {
    pirates: [['squeeze', 62, 0.16, [[0, 0, 1], [5, 1, 1], [5, 2, 1], [5, 3, 2], [7, 5, 1], [9, 6, 3]], 0.5], ['tom', 50, 0.16, [[0, 0], [0, 3], [0, 6]], 0.4]],
    ninjas: [['pluck', 69, 0.12, [[0, 0, 1], [3, 1, 1], [5, 2, 1], [7, 3, 1], [10, 4, 2], [12, 6, 3]], 0.45], ['wind', 60, 0.12, [[0, 0, 4]], 0.4]],
    zombies: [['organ', 50, 0.22, [[0, 0, 2], [-1, 2, 2], [-2, 4, 2], [-6, 6, 4]], 0.5], ['ooh', 45, 0.22, [[0, 0, 8]], 0.35]],
    aliens: [['theremin', 72, 0.25, [[0, 0, 2], [7, 2, 1], [6, 3, 1], [12, 4, 4]], 0.5], ['bleep', 84, 0.06, [[0, 0], [5, 1], [3, 2], [10, 3], [7, 5]], 0.3]],
    cavemen: [['tom', 52, 0.18, [[0, 0], [0, 1], [7, 2], [0, 3], [5, 4], [0, 6]], 0.6], ['horn', 45, 0.18, [[0, 4, 4]], 0.35]],
    robots: [['bleep', 76, 0.09, [[0, 0], [12, 1], [7, 2], [3, 3], [0, 4], [12, 5], [15, 6], [19, 8]], 0.45], ['zap', 50, 0.09, [[0, 8]], 0.4]],
    wizards: [['harp', 72, 0.07, [[0, 0], [4, 1], [7, 2], [11, 3], [12, 4], [16, 5], [19, 6], [23, 7], [24, 8]], 0.4], ['pad', 48, 0.07, [[0, 0, 14]], 0.4]],
    cowboys: [['twang', 52, 0.15, [[0, 0, 1], [7, 1, 1], [12, 2, 1], [10, 3, 1], [7, 4, 2], [0, 6, 3]], 0.5], ['whistle', 76, 0.15, [[0, 2, 4]], 0.3]],
    mummies: [['reed', 62, 0.14, [[0, 0, 1], [1, 1, 1], [4, 2, 1], [5, 3, 1], [7, 4, 1], [5, 5, 1], [4, 6, 1], [1, 7, 3]], 0.5]],
    clowns: [['kazoo', 67, 0.13, [[0, 0, 1], [4, 1, 1], [7, 2, 1], [12, 3, 1], [11, 4, 1], [12, 5, 3]], 0.5], ['tom', 60, 0.13, [[0, 0], [7, 2], [0, 4]], 0.3]],
    vikings: [['horn', 45, 0.2, [[0, 0, 3], [7, 3, 2], [5, 5, 4]], 0.6], ['tom', 45, 0.2, [[0, 0], [0, 1.5], [0, 3], [0, 5]], 0.5]],
    ghosts: [['ooh', 64, 0.26, [[0, 0, 3], [-2, 3, 2], [3, 5, 4]], 0.55], ['wind', 60, 0.26, [[0, 0, 9]], 0.4]],
    dinos: [['roar', 50, 0.2, [[0, 0, 5]], 0.7], ['tom', 40, 0.2, [[0, 0], [0, 2], [0, 4]], 0.6]],
    knights: [['brass', 60, 0.13, [[0, 0, 1], [0, 1, 1], [0, 2, 1], [5, 3, 3], [9, 6, 1], [12, 7, 4]], 0.5]],
    astronauts: [['pad', 48, 0.3, [[0, 0, 6]], 0.5], ['bleep', 84, 0.15, [[0, 0], [7, 2], [12, 4], [19, 6]], 0.3], ['theremin', 79, 0.3, [[0, 2, 4]], 0.25]],
    gnomes: [['xylo', 72, 0.1, [[0, 0], [4, 1], [7, 2], [4, 3], [9, 4], [7, 5], [12, 6]], 0.5], ['tom', 60, 0.1, [[0, 0], [0, 4]], 0.3]],
    luchadores: [['brass', 65, 0.13, [[0, 0, 1], [4, 1, 1], [7, 2, 2], [9, 4, 1], [7, 5, 3]], 0.45], ['brass', 61, 0.13, [[0, 0, 1], [3, 1, 1], [4, 2, 2], [5, 4, 1], [4, 5, 3]], 0.35]],
    vampires: [['organ', 57, 0.16, [[0, 0, 1], [-2, 1, 1], [0, 2, 4], [-5, 6, 1], [-7, 7, 1], [-8, 8, 1], [-12, 9, 4]], 0.55]],
    yetis: [['roar', 45, 0.25, [[0, 0, 4]], 0.6], ['wind', 60, 0.25, [[0, 0, 10]], 0.5], ['tom', 38, 0.25, [[0, 1], [0, 3]], 0.6]],
    chefs: [['mandolin', 67, 0.14, [[0, 0, 2], [4, 2, 1], [7, 3, 1], [12, 4, 2], [7, 6, 2]], 0.5]],
    divers: [['bubble', 72, 0.07, [[0, 0], [5, 1], [2, 2], [9, 3], [7, 5], [14, 6], [12, 8]], 0.5], ['ooh', 55, 0.07, [[0, 0, 12]], 0.3]],
    scientists: [['theremin', 67, 0.18, [[0, 0, 1], [6, 1, 1], [3, 2, 1], [9, 3, 3]], 0.45], ['zap', 60, 0.18, [[0, 2], [0, 4.5]], 0.4]],
    gladiators: [['brass', 55, 0.18, [[0, 0, 2], [7, 2, 1], [5, 3, 1], [7, 4, 4]], 0.5], ['tom', 43, 0.18, [[0, 0], [0, 1], [0, 2], [0, 4]], 0.6]],
    explorers: [['tom', 57, 0.13, [[0, 0], [5, 1], [0, 1.5], [7, 2], [0, 3], [5, 3.5], [0, 4]], 0.5], ['whistle', 79, 0.13, [[0, 1, 2], [5, 4, 2]], 0.3]],
    disco: [['kick', 0, 0.22, [[0, 0], [0, 1], [0, 2], [0, 3]], 0.6], ['hat', 0, 0.22, [[0, 0.5], [0, 1.5], [0, 2.5], [0, 3.5]], 0.6],
      ['twang', 40, 0.22, [[0, 0, 0.5], [12, 0.5, 0.5], [0, 1, 0.5], [12, 1.5, 0.5], [3, 2, 0.5], [15, 2.5, 0.5], [5, 3, 0.5], [17, 3.5, 0.5]], 0.45]],
  };
  function sting(theme) {
    const s = STINGS[theme];
    if (!s) { synth({ f: 392, dur: 0.15, type: 'triangle', vol: 0.2 }); synth({ f: 523, dur: 0.25, type: 'triangle', vol: 0.2, delay: 0.15 }); return; }
    for (const [inst, root, beat, notes, vol] of s) {
      for (const n of notes) INST[inst](midi(root + n[0]), (n[2] || 1) * beat, n[1] * beat, vol);
    }
  }

  // ---------------------------------------------------------------- tower weapons
  // Every tower type has its own firing sound and an impact sound when the shot lands.
  // `place` positions them: stereo pan from where the tower sits on screen, quieter for
  // towers that aren't yours or are off at the edge of the view.
  const place = { vol: 1, pan: 0 };
  let shotBudget = 0, shotBudgetT = 0;
  function budget() {                       // at most ~16 weapon sounds per quarter second
    const now = performance.now();
    if (now - shotBudgetT > 250) { shotBudgetT = now; shotBudget = 0; }
    return ++shotBudget <= 16;
  }
  function spatial(o, fn) {
    place.vol = o && o.vol != null ? o.vol : 1; place.pan = o && o.pan ? Math.max(-0.85, Math.min(0.85, o.pan)) : 0;
    try { fn(); } finally { place.vol = 1; place.pan = 0; }
  }
  const SHOTS = {
    // card / pair towers: a springy card flick
    arrow: () => { synth({ f: vary(1250, 0.08), f1: 520, dur: 0.07, vol: 0.13, type: 'triangle', cut: 5000 }); hiss({ dur: 0.11, vol: 0.13, f: vary(3800, 0.1), f1: 1400, q: 1.4 }); synth({ f: vary(190, 0.06), f1: 120, dur: 0.06, vol: 0.09, type: 'sine' }); },
    // lightning: crackling electric zap
    chain: () => {
      for (let i = 0; i < 4; i++) synth({ f: vary(900 + i * 500, 0.25), f1: 180, dur: 0.06, vol: 0.07, type: 'sawtooth', cut: 7000, vib: 0.6, vibRate: 70, delay: i * 0.025 });
      hiss({ dur: 0.22, vol: 0.14, f: 5500, type: 'highpass', q: 0.7 }); synth({ f: 70, f1: 40, dur: 0.18, vol: 0.12, type: 'sine', delay: 0.02, wet: 0.3 });
    },
    // fireball: whoosh of flame
    fire: () => { hiss({ dur: 0.3, vol: 0.2, f: 400, f1: 2600, type: 'lowpass', q: 3, at: 0.03, wet: 0.2 }); synth({ f: vary(160, 0.08), f1: 90, dur: 0.25, vol: 0.09, type: 'sawtooth', cut: 700, vib: 0.08, vibRate: 25 }); },
    // heavy shell: cannon thump
    shell: () => { synth({ f: vary(150, 0.06), f1: 48, dur: 0.22, vol: 0.28, type: 'sine' }); hiss({ dur: 0.09, vol: 0.2, f: 1800, q: 0.8 }); hiss({ dur: 0.35, vol: 0.08, f: 500, type: 'lowpass', delay: 0.03, wet: 0.5 }); },
    // magic orb: bright "pew"
    orb: () => { synth({ f: vary(1700, 0.06), f1: 420, dur: 0.14, vol: 0.12, type: 'square', cut: 3500 }); synth({ f: vary(2600, 0.06), f1: 900, dur: 0.1, vol: 0.06, type: 'sine', delay: 0.01, wet: 0.3 }); },
    // poison: bubbling blorp
    poison: () => { synth({ f: vary(260, 0.1), f1: 760, dur: 0.1, vol: 0.13, type: 'sine' }); synth({ f: vary(380, 0.1), f1: 980, dur: 0.09, vol: 0.1, type: 'sine', delay: 0.06 }); hiss({ dur: 0.12, vol: 0.06, f: 900, q: 5 }); },
    // frost: icy chime and a cold breath
    frost: () => { synth({ f: vary(2637, 0.03), dur: 0.35, vol: 0.07, type: 'sine', wet: 0.6 }); synth({ f: vary(3951, 0.03), dur: 0.25, vol: 0.05, type: 'sine', delay: 0.03, wet: 0.6 }); hiss({ dur: 0.25, vol: 0.12, f: 6000, f1: 2500, type: 'bandpass', q: 2, at: 0.03 }); },
    // bash: a big wind-up swing
    bash: () => { hiss({ dur: 0.2, vol: 0.16, f: 500, f1: 1800, q: 2, at: 0.06 }); synth({ f: vary(120, 0.06), f1: 70, dur: 0.15, vol: 0.14, type: 'triangle', delay: 0.05 }); },
    // royal: a gilded fanfare chime
    royal: () => { [1047, 1319, 1568].forEach((f, i) => synth({ f: vary(f, 0.01), dur: 0.3, vol: 0.07, type: 'triangle', delay: i * 0.03, wet: 0.5 })); hiss({ dur: 0.15, vol: 0.1, f: 4200, f1: 1800, q: 1.5 }); },
    mortar: () => { synth({ f: vary(90), f1: 40, dur: 0.3, vol: 0.18, type: 'sine' }); hiss({ dur: 0.15, vol: 0.1, f: 400, type: 'lowpass' }); },
  };
  const IMPACTS = {
    arrow: () => { hiss({ dur: 0.05, vol: 0.12, f: vary(1500, 0.15), q: 1.2 }); synth({ f: vary(220, 0.1), f1: 110, dur: 0.06, vol: 0.12, type: 'sine' }); },
    fire: () => { hiss({ dur: 0.35, vol: 0.18, f: 1800, f1: 300, type: 'lowpass', q: 1.5 }); synth({ f: 110, f1: 50, dur: 0.18, vol: 0.14, type: 'sine' }); hiss({ dur: 0.4, vol: 0.05, f: 7000, type: 'highpass', delay: 0.05 }); },
    shell: () => { synth({ f: 120, f1: 35, dur: 0.35, vol: 0.3, type: 'sine' }); hiss({ dur: 0.3, vol: 0.2, f: 1400, f1: 200, type: 'lowpass', wet: 0.35 }); },
    orb: () => { synth({ f: vary(1900, 0.08), f1: 2900, dur: 0.08, vol: 0.08, type: 'sine' }); hiss({ dur: 0.06, vol: 0.07, f: 5000 }); },
    poison: () => { hiss({ dur: 0.18, vol: 0.14, f: 700, f1: 250, type: 'lowpass', q: 5 }); synth({ f: vary(180, 0.1), f1: 80, dur: 0.12, vol: 0.1, type: 'sine', vib: 0.2, vibRate: 30 }); },
    frost: () => { for (let i = 0; i < 4; i++) hiss({ dur: 0.05, vol: 0.09, f: vary(6500, 0.2), q: 4, delay: i * 0.03 }); synth({ f: vary(1760, 0.05), dur: 0.2, vol: 0.05, type: 'sine', wet: 0.5 }); },
    bash: () => { [523, 761, 1117].forEach(f => synth({ f: vary(f, 0.02), dur: 0.4, vol: 0.06, type: 'sine', wet: 0.35 })); synth({ f: 140, f1: 55, dur: 0.2, vol: 0.22, type: 'sine' }); hiss({ dur: 0.07, vol: 0.18, f: 2500, q: 0.8 }); },
    royal: () => { synth({ f: vary(2093, 0.02), dur: 0.25, vol: 0.08, type: 'triangle', wet: 0.4 }); hiss({ dur: 0.05, vol: 0.1, f: 3000 }); synth({ f: 200, f1: 100, dur: 0.08, vol: 0.12, type: 'sine' }); },
  };

  const sfx = {
    deal() { hiss({ dur: 0.07, vol: 0.18, f: vary(3200, 0.1), q: 1.5 }); synth({ f: vary(950), f1: 1300, dur: 0.05, vol: 0.06, type: 'triangle', delay: 0.02 }); },
    select() { synth({ f: vary(700, 0.02), dur: 0.06, vol: 0.1, type: 'triangle' }); hiss({ dur: 0.02, vol: 0.05, f: 4000 }); },
    combine() {
      [523, 659, 784, 1047, 1319].forEach((f, i) => { synth({ f, dur: 0.35, vol: 0.13, type: 'triangle', delay: i * 0.06, wet: 0.5 }); synth({ f: f * 2, dur: 0.2, vol: 0.04, type: 'sine', delay: i * 0.06 + 0.01 }); });
      hiss({ dur: 0.5, vol: 0.06, f: 7000, type: 'highpass', delay: 0.1, at: 0.1, wet: 0.6 });
    },
    swap() { hiss({ dur: 0.2, vol: 0.15, f: 1500, f1: 4000, q: 1.2 }); synth({ f: 500, f1: 900, dur: 0.14, vol: 0.07, type: 'sine' }); },
    coin() { if (!throttle('coin', 55)) return; const p = vary(1, 0.05); synth({ f: 1320 * p, dur: 0.1, vol: 0.06, type: 'square', cut: 5000 }); synth({ f: 1760 * p, dur: 0.18, vol: 0.06, type: 'square', cut: 5000, delay: 0.05, wet: 0.2 }); },
    leak() { if (!throttle('leak', 120)) return; synth({ f: 330, f1: 150, dur: 0.45, vol: 0.12, type: 'sawtooth', cut: 1200, cut1: 300, vib: 0.03, vibRate: 7 }); synth({ f: 80, f1: 45, dur: 0.2, vol: 0.2, type: 'sine' }); },
    error() { synth({ f: 220, dur: 0.1, vol: 0.1, type: 'square', cut: 1500 }); synth({ f: 165, dur: 0.16, vol: 0.1, type: 'square', cut: 1500, delay: 0.1 }); },
    tick() { synth({ f: 1100, dur: 0.05, vol: 0.12, type: 'sine' }); hiss({ dur: 0.02, vol: 0.06, f: 5000 }); },
    wave() { sting(); },
    sting(theme) { sting(theme); },
    boss() { [55, 55, 41, 55].forEach((f, i) => { synth({ f: f * 2, dur: 0.4, vol: 0.18, type: 'sawtooth', detune: 8, cut: 700, delay: i * 0.22, wet: 0.4 }); INST.tom(f * 2, 0.3, i * 0.22, 0.6); }); hiss({ dur: 0.8, vol: 0.12, f: 250, type: 'lowpass', delay: 0.66, wet: 0.5 }); },
    win() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => { synth({ f, dur: 0.3, vol: 0.13, type: 'triangle', delay: i * 0.11, wet: 0.4 }); synth({ f: f / 2, dur: 0.3, vol: 0.06, type: 'sawtooth', cut: 1200, delay: i * 0.11 }); }); },
    lose() { [392, 330, 262, 196].forEach((f, i) => synth({ f, f1: f * 0.97, dur: 0.4, vol: 0.12, type: 'sawtooth', cut: 1100, delay: i * 0.22, vib: 0.02, vibRate: 5, wet: 0.4 })); },
    hand() { hiss({ dur: 0.04, vol: 0.12, f: 2500, q: 3 }); hiss({ dur: 0.04, vol: 0.1, f: 3200, q: 3, delay: 0.06 }); synth({ f: 784, dur: 0.12, vol: 0.08, type: 'triangle', delay: 0.05 }); synth({ f: 1175, dur: 0.22, vol: 0.08, type: 'triangle', delay: 0.13, wet: 0.3 }); },
    boom() { synth({ f: 120, f1: 30, dur: 0.6, vol: 0.35, type: 'sine' }); hiss({ dur: 0.6, vol: 0.3, f: 900, f1: 150, type: 'lowpass', wet: 0.4 }); hiss({ dur: 0.3, vol: 0.12, f: 3000, delay: 0.05 }); },
    tip() { synth({ f: 1500, dur: 0.08, vol: 0.05, type: 'square', cut: 4000 }); synth({ f: 2000, dur: 0.14, vol: 0.05, type: 'square', cut: 4000, delay: 0.07, wet: 0.3 }); },
    // o: { vol, pan } from the UI; fx picks the weapon
    shot(o) { o = typeof o === 'string' ? { fx: o } : (o || {}); if (!throttle('shot' + o.fx, 55) || !budget()) return; spatial(o, SHOTS[o.fx] || SHOTS.arrow); },
    impact(o) { const f = IMPACTS[o && o.fx]; if (!f || !throttle('imp' + o.fx, 50) || !budget()) return; spatial(o, f); },
    // ---- new event sounds
    hit() { if (!throttle('hit', 45)) return; hiss({ dur: 0.05, vol: 0.07, f: vary(1800, 0.2), q: 1.5 }); synth({ f: vary(160, 0.1), f1: 90, dur: 0.07, vol: 0.06, type: 'sine' }); },
    pop(kind) {
      if (!throttle('pop', 40)) return;
      const k = kind == null ? Math.floor(Math.random() * 3) : kind;
      if (k === 0) synth({ f: vary(420, 0.08), f1: 1100, dur: 0.12, vol: 0.12, type: 'sine', wet: 0.2 });
      else if (k === 1) { synth({ f: vary(600, 0.08), f1: 300, dur: 0.1, vol: 0.1, type: 'triangle' }); hiss({ dur: 0.08, vol: 0.08, f: 2500, q: 2 }); }
      else { synth({ f: vary(300, 0.08), f1: 900, dur: 0.08, vol: 0.1, type: 'sine' }); synth({ f: vary(900, 0.08), f1: 1500, dur: 0.07, vol: 0.06, type: 'sine', delay: 0.05 }); }
      hiss({ dur: 0.12, vol: 0.05, f: 1200, type: 'lowpass', delay: 0.02 });
    },
    leaderPop() { [659, 784, 988, 1319].forEach((f, i) => synth({ f, dur: 0.22, vol: 0.1, type: 'triangle', delay: i * 0.05, wet: 0.45 })); synth({ f: 200, f1: 60, dur: 0.3, vol: 0.18, type: 'sine' }); hiss({ dur: 0.3, vol: 0.08, f: 6000, type: 'highpass', delay: 0.1, wet: 0.5 }); },
    cleared() {
      [523, 659, 784, 1047].forEach((f, i) => { synth({ f, dur: 0.3, vol: 0.12, type: 'triangle', delay: i * 0.08, wet: 0.45 }); synth({ f: f * 1.5, dur: 0.25, vol: 0.05, type: 'sine', delay: i * 0.08 + 0.02 }); });
      for (let i = 0; i < 6; i++) synth({ f: vary(1700, 0.15), dur: 0.12, vol: 0.04, type: 'square', cut: 5000, delay: 0.3 + i * 0.05 });
    },
    land() { synth({ f: 90, f1: 28, dur: 0.8, vol: 0.4, type: 'sine' }); hiss({ dur: 0.7, vol: 0.3, f: 700, f1: 120, type: 'lowpass', wet: 0.5 }); hiss({ dur: 0.15, vol: 0.15, f: 2500, delay: 0.02 }); },
    slam() { synth({ f: 140, f1: 50, dur: 0.4, vol: 0.35, type: 'sine' }); hiss({ dur: 0.12, vol: 0.25, f: 1600, q: 0.8 }); hiss({ dur: 0.5, vol: 0.1, f: 400, type: 'lowpass', delay: 0.05, wet: 0.6 }); },
    thud() { synth({ f: 110, f1: 45, dur: 0.3, vol: 0.3, type: 'sine' }); hiss({ dur: 0.2, vol: 0.12, f: 500, type: 'lowpass' }); synth({ f: 700, f1: 350, dur: 0.25, vol: 0.05, type: 'triangle', delay: 0.15, vib: 0.05, vibRate: 12 }); },
    splat() { hiss({ dur: 0.25, vol: 0.18, f: 900, f1: 300, type: 'lowpass', q: 4 }); synth({ f: 240, f1: 90, dur: 0.18, vol: 0.12, type: 'sine', vib: 0.2, vibRate: 30 }); },
    click() { if (!throttle('click', 40)) return; synth({ f: 1800, dur: 0.03, vol: 0.06, type: 'triangle' }); hiss({ dur: 0.015, vol: 0.05, f: 5000 }); },
    hover() { if (!throttle('hover', 60)) return; synth({ f: 2400, dur: 0.025, vol: 0.02, type: 'sine' }); },
  };


  // ---------------------------------------------------------------- music
  // A small generative jazz band: electric piano chords, walking bass, brushed drums
  // and the odd vibraphone lick. Three moods share one tempo and switch on bar lines:
  //   lounge (playing a hand), action (looters on the board), boss (boss levels).
  const Synth = (function () {
    const BPM = 96, BEAT = 60 / BPM;
    const MOODS = {
      lounge: { prog: [[50, 53, 57, 60, 64], [43, 53, 57, 59, 64], [48, 52, 55, 59, 62], [45, 52, 55, 58, 61]], drums: 'brush', bassOct: 0, lead: 0.35 },
      action: { prog: [[50, 53, 57, 60, 64], [46, 53, 57, 60, 62], [43, 50, 53, 58, 62], [45, 52, 55, 61, 64]], drums: 'groove', bassOct: 0, lead: 0.2 },
      boss: { prog: [[38, 50, 53, 57], [34, 50, 53, 58], [31, 50, 55, 58], [33, 49, 52, 57]], drums: 'heavy', bassOct: -12, lead: 0 },
    };
    let gain = null, on = true, mood = 'lounge', want = 'lounge', timer = null, nextBeat = 0, beat = 0, playing = false;
    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

    function out() {
      if (!gain) { gain = ctx.createGain(); gain.gain.value = 0.0001; gain.connect(master); }
      return gain;
    }
    function voice(freq, t, dur, type, vol, opts) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.setValueAtTime(freq, t);
      if (opts && opts.detune) o.detune.value = opts.detune;
      let node = o;
      if (opts && opts.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opts.lp; o.connect(f); node = f; }
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + (opts && opts.atk || 0.01));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      node.connect(g); g.connect(out());
      o.start(t); o.stop(t + dur + 0.05);
    }
    function hit(t, dur, vol, type, freq) {
      const len = Math.floor(ctx.sampleRate * dur);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
      const s = ctx.createBufferSource(); s.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = 0.8;
      const g = ctx.createGain(); g.gain.value = vol;
      s.connect(f); f.connect(g); g.connect(out()); s.start(t);
    }
    function kick(t, vol) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g); g.connect(out()); o.start(t); o.stop(t + 0.35);
    }

    function scheduleBeat(t, b) {
      const m = MOODS[mood];
      const bar = Math.floor(b / 4) % m.prog.length, pos = b % 4;
      const chord = m.prog[bar];
      const swing = BEAT * 0.62;          // swung eighth: long-short
      // chords: comp on beat 1 and the "and" of 2
      if (pos === 0 || (pos === 1 && mood !== 'boss')) {
        const tt = pos === 0 ? t : t + swing;
        const len = mood === 'boss' ? BEAT * 3.8 : BEAT * 1.4;
        chord.slice(1).forEach((n, i) => {
          voice(hz(n), tt + i * 0.008, len, 'sine', 0.05, { atk: 0.02 });
          voice(hz(n), tt + i * 0.008, len * 0.6, 'triangle', 0.018, { detune: 6 });
        });
      }
      // walking bass: root, then chord tones / approach note into the next bar
      const root = chord[0] + m.bassOct;
      const next = m.prog[(bar + 1) % m.prog.length][0] + m.bassOct;
      const walk = [root, root + (mood === 'boss' ? 0 : 7), root + (mood === 'boss' ? 0 : 3 + (b % 8 < 4 ? 0 : 2)), next + (next > root ? -1 : 1)];
      voice(hz(walk[pos] - 12), t, BEAT * 0.9, mood === 'boss' ? 'sawtooth' : 'triangle', mood === 'boss' ? 0.07 : 0.13, { lp: mood === 'boss' ? 420 : 900 });
      // drums
      if (m.drums === 'brush') {
        hit(t, 0.18, 0.05, 'highpass', 6000); hit(t + swing, 0.1, 0.03, 'highpass', 7000);
        if (pos === 1 || pos === 3) hit(t, 0.22, 0.05, 'bandpass', 2200);
        if (pos === 0) kick(t, 0.25);
      } else if (m.drums === 'groove') {
        hit(t, 0.12, 0.05, 'highpass', 7000); hit(t + swing, 0.08, 0.04, 'highpass', 8000);
        if (pos === 0 || pos === 2) kick(t, 0.45);
        if (pos === 2 && b % 8 >= 4) kick(t + swing, 0.3);
        if (pos === 1 || pos === 3) hit(t, 0.16, 0.12, 'bandpass', 1800);
      } else {
        kick(t, 0.6);
        if (pos === 1 || pos === 3) { hit(t, 0.3, 0.16, 'bandpass', 900); hit(t, 0.12, 0.08, 'highpass', 4000); }
        hit(t + BEAT / 2, 0.06, 0.04, 'highpass', 9000);
        if (pos === 3 && b % 16 === 15) { kick(t + BEAT * 0.25, 0.5); kick(t + BEAT * 0.5, 0.5); kick(t + BEAT * 0.75, 0.5); }
      }
      // vibraphone licks from the chord's upper notes
      if (m.lead && Math.random() < m.lead) {
        const n = chord[1 + Math.floor(Math.random() * (chord.length - 1))] + 12;
        voice(hz(n), t + (Math.random() < 0.5 ? 0 : swing), BEAT * 1.6, 'sine', 0.045, { atk: 0.005 });
        voice(hz(n * 1 + 24), t, BEAT * 0.5, 'sine', 0.008);
      }
    }

    function tick() {
      while (nextBeat < ctx.currentTime + 0.25) {
        if (beat % 4 === 0 && mood !== want) mood = want;   // change mood on the bar line
        scheduleBeat(nextBeat, beat);
        nextBeat += BEAT; beat++;
      }
    }

    function start() {
      if (playing || !on || !ensure()) return;
      playing = true;
      out().gain.cancelScheduledValues(ctx.currentTime);
      out().gain.setTargetAtTime(0.3, ctx.currentTime, 0.8);
      nextBeat = ctx.currentTime + 0.1; beat = 0; mood = want;
      timer = setInterval(tick, 50);
    }
    function stop() {
      if (!playing) return;
      playing = false;
      clearInterval(timer);
      out().gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3);
    }
    return {
      setMood(m) { want = m; },
      enable(v) { on = v; if (v) start(); else stop(); },
      start, stop,
      get on() { return on; },
    };
  })();

  // Soundtrack: the files in assets/music play back to back on a loop. If they can't load
  // (missing files, blocked autoplay), the generated Synth band plays instead.
  // Tracks in assets/music/local/ are git-ignored: they play when you run the game from
  // your own folder but are never uploaded to the public site.
  const PUBLIC_TRACKS = ['assets/music/td2.mp3', 'assets/music/td3.m4a', 'assets/music/td4.m4a',
    'assets/music/td5.m4a', 'assets/music/td6.m4a', 'assets/music/td7.m4a'];
  const LOCAL_TRACKS = ['assets/music/local/td.mp3'];
  const TRACKS = location.protocol === 'file:' ? LOCAL_TRACKS.concat(PUBLIC_TRACKS) : PUBLIC_TRACKS;
  // Background level for the soundtrack (0..1) and an "ambient" treatment: softened highs
  // plus a gentle hall reverb. The effect chain needs the page to be served over http(s);
  // from a double-clicked file the music still plays, just without the reverb.
  const MUSIC_VOL = 0.2;
  function ambience(el) {
    if (location.protocol === 'file:' || !ensure()) return;
    try {
      const src = ctx.createMediaElementSource(el);
      const tone = ctx.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 2600; tone.Q.value = 0.4;
      const dry = ctx.createGain(); dry.gain.value = 0.75;
      const wet = ctx.createGain(); wet.gain.value = 0.4;
      const verb = ctx.createConvolver();
      const len = Math.floor(ctx.sampleRate * 3.2), ir = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6); }
      verb.buffer = ir;
      src.connect(tone); tone.connect(dry); tone.connect(verb); verb.connect(wet);
      dry.connect(ctx.destination); wet.connect(ctx.destination);
    } catch (e) { /* plain playback is fine */ }
  }

  const Music = (function () {
    let el = null, idx = 0, on = true, failed = false, playing = false;
    function load() {
      if (el) return el;
      el = new Audio();
      el.preload = 'auto';
      el.volume = MUSIC_VOL;
      el.addEventListener('ended', () => { idx = (idx + 1) % TRACKS.length; el.src = TRACKS[idx]; if (playing) el.play().catch(() => {}); });
      let errors = 0;
      el.addEventListener('playing', () => { errors = 0; });
      el.addEventListener('error', () => {
        if (++errors < TRACKS.length) { idx = (idx + 1) % TRACKS.length; el.src = TRACKS[idx]; if (playing) el.play().catch(() => {}); return; }
        failed = true; if (playing) { playing = false; Synth.enable(true); }
      });
      el.src = TRACKS[idx];
      ambience(el);
      return el;
    }
    function start() {
      if (!on || playing) return;
      if (failed) { Synth.enable(true); return; }
      playing = true;
      load().play().catch(() => { playing = false; });   // needs a user gesture; unlock() retries
    }
    function stop() { playing = false; if (el) el.pause(); Synth.enable(false); }
    return {
      setMood(m) { Synth.setMood(m); },
      enable(v) { on = v; if (v) start(); else stop(); },
      duck(v) { if (el) el.volume = v ? MUSIC_VOL * 0.3 : MUSIC_VOL; },
      next() { if (!el) return; idx = (idx + 1) % TRACKS.length; el.src = TRACKS[idx]; if (playing) el.play().catch(() => {}); },
      start, stop,
      get on() { return on; },
    };
  })();

  const clips = {};
  let voice = null, duckTimer = 0;
  // One voice clip at a time; a new one interrupts the old.
  function clip(name) {
    if (muted || !name) return;
    // names without an extension are .mp3; others (e.g. 'smooth.m4a') are used as given
    if (!clips[name]) { clips[name] = new Audio('assets/sfx/' + name + (name.indexOf('.') >= 0 ? '' : '.mp3')); clips[name].preload = 'auto'; }
    if (voice && voice !== clips[name]) voice.pause();
    voice = clips[name];
    voice.currentTime = 0;
    voice.volume = 0.95;
    Music.duck(true);
    clearTimeout(duckTimer);
    voice.onended = () => { duckTimer = setTimeout(() => Music.duck(false), 300); };
    voice.play().catch(() => Music.duck(false));
  }

  // true while a voice clip is still playing
  function busy() { return !!(voice && !voice.paused && !voice.ended); }

  return {
    clip, busy,
    play(name, arg) { try { sfx[name] && sfx[name](arg); } catch (e) { /* audio is optional */ } },
    unlock() { if (ensure() && ctx.state === 'suspended') ctx.resume(); if (!muted) Music.start(); },
    // Sound button cycles: everything on -> music off -> all off.
    cycle() {
      if (!muted && Music.on) Music.enable(false);
      else if (!muted) { muted = true; master && master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05); }
      else { muted = false; if (master) master.gain.setTargetAtTime(0.35, ctx.currentTime, 0.05); Music.enable(true); }
      return this.state;
    },
    get state() { return muted ? 'off' : Music.on ? 'all' : 'sfx'; },
    setState(st) { muted = st === 'off'; Music.enable(st === 'all'); if (master) master.gain.value = muted ? 0.0001 : 0.35; },
    music: Music,
    get muted() { return muted; },
  };
})();
