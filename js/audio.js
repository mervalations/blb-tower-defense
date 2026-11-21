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

  return {
    clip,
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
