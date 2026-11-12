/* Pocket Gridiron: sound engine.
   Every sound is synthesized with the Web Audio API; there are no audio files.

     PG.audio.play(name, opts)   one-shot effects (whistle, hit, catch, horn, ...)
     PG.audio.crowd.*            the stadium: a bed that follows the game, cheers, groans, clap builds
     PG.audio.music.*            the menu loop: a synthesized drumline with brass
     PG.audio.say(text, urgent)  the announcer: the device's own speech synthesizer, with the crowd dipped under it
     PG.audio.weather(kind)      a bed of rain or wind under the crowd
     PG.audio.muffle(on)         everything goes dull and distant while the game is paused

   Each voice is a function (ctx, out, t, opts) so it can also be rendered in an OfflineAudioContext,
   which is how levels are checked (PG.audio.measure). */
(() => {
  'use strict';
  const S = PG.SET;
  if (S.mus === undefined) S.mus = true;
  if (S.ann === undefined) S.ann = true;

  let ctx = null;        // the live AudioContext, created on the first tap
  let bus = null;        // { master, sfx, crowd, music } gain nodes of the live graph
  const noiseCache = new WeakMap();

  /* ---------- building blocks ---------- */

  function noiseBuffers(c) {
    let b = noiseCache.get(c);
    if (b) return b;
    const make = (seconds, fill) => {
      const buf = c.createBuffer(1, Math.floor(c.sampleRate * seconds), c.sampleRate);
      fill(buf.getChannelData(0));
      return buf;
    };
    b = {
      white: make(2, d => { for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }),
      pink: make(5, d => {             // Paul Kellet's economy pink filter
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < d.length; i++) {
          const w = Math.random() * 2 - 1;
          b0 = 0.99765 * b0 + w * 0.0990460;
          b1 = 0.96300 * b1 + w * 0.2965164;
          b2 = 0.57000 * b2 + w * 1.0526913;
          d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;
        }
      }),
    };
    noiseCache.set(c, b);
    return b;
  }

  const gain = (c, v) => { const g = c.createGain(); g.gain.value = v; return g; };
  const filter = (c, type, f, q) => {
    const n = c.createBiquadFilter();
    n.type = type; n.frequency.value = f; if (q !== undefined) n.Q.value = q;
    return n;
  };
  function osc(c, type, f, t, dur) {
    const o = c.createOscillator();
    o.type = type; o.frequency.setValueAtTime(f, t);
    o.start(t); o.stop(t + dur + 0.05);
    return o;
  }
  function noise(c, color, t, dur, rate) {
    const s = c.createBufferSource();
    s.buffer = noiseBuffers(c)[color]; s.loop = true;
    if (rate) s.playbackRate.value = rate;
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
    return s;
  }
  /* attack to `peak`, then an exponential fall to silence over `decay` */
  function env(c, t, attack, peak, decay) {
    const g = gain(c, 0.0001);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }
  /* attack, hold, release: for sustained voices */
  function envHold(c, t, attack, peak, hold, release) {
    const g = gain(c, 0.0001);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
    g.gain.setValueAtTime(peak, t + attack + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + hold + release);
    return g;
  }
  const chain = (...nodes) => { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; };
  const hz = semis => 440 * Math.pow(2, semis / 12);   // semitones from A4

  /* master chain with a little stadium reverb on a send */
  function buildGraph(c) {
    const master = gain(c, 0.9), tone = filter(c, 'lowpass', 20000, 0.5);
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 14; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.22;
    chain(master, tone, comp, c.destination);
    const verb = c.createConvolver();
    const len = Math.floor(c.sampleRate * 1.9), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    verb.buffer = ir;
    const wet = gain(c, 0.5);
    chain(verb, wet, master);
    const mk = (level, send) => { const g = gain(c, level); g.connect(master); const s = gain(c, send); chain(g, s, verb); return g; };
    return { master, tone, sfx: mk(1, 0.3), crowd: mk(1, 0.12), music: mk(0.8, 0.14) };
  }

  /* ---------- one-shot effects ---------- */

  function brass(c, out, t, f, dur, peak) {
    const lp = filter(c, 'lowpass', 500, 1.2);
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.exponentialRampToValueAtTime(2600, t + 0.05);
    lp.frequency.exponentialRampToValueAtTime(1300, t + dur);
    const g = envHold(c, t, 0.025, peak, Math.max(0.01, dur - 0.1), 0.12);
    chain(lp, g, out);
    for (const cents of [-7, 6]) { const o = osc(c, 'sawtooth', f, t, dur + 0.15); o.detune.value = cents; o.connect(lp); }
    const sub = osc(c, 'square', f / 2, t, dur + 0.15), sg = gain(c, 0.25);
    chain(sub, sg, lp);
  }
  function bell(c, out, t, f, dur, peak) {
    const g = env(c, t, 0.005, peak, dur);
    g.connect(out);
    osc(c, 'sine', f, t, dur).connect(g);
    const o2 = osc(c, 'triangle', f * 2, t, dur), g2 = gain(c, 0.25);
    chain(o2, g2, g);
  }

  const SFX = {
    /* pea whistle: two close sines with a fast trill, plus breath */
    whistle(c, out, t, o) {
      const dur = o && o.long ? 0.95 : 0.36;
      const g = envHold(c, t, 0.012, 0.07, dur, 0.07);
      g.connect(out);
      const lfo = osc(c, 'sine', 30, t, dur + 0.1), depth = gain(c, 140);
      lfo.connect(depth);
      for (const f of [2740, 2905]) { const s = osc(c, 'sine', f, t, dur + 0.1); depth.connect(s.frequency); s.connect(g); }
      const breath = gain(c, 0.35);
      chain(noise(c, 'white', t, dur + 0.1), filter(c, 'bandpass', 3000, 1.5), breath, g);
    },
    /* pads: a low thump, a plastic crack and a short body of noise */
    hit(c, out, t, o) {
      const p = clamp01(o && o.power !== undefined ? o.power : 0.8);
      const th = osc(c, 'sine', 125, t, 0.2);
      th.frequency.exponentialRampToValueAtTime(42, t + 0.16);
      chain(th, env(c, t, 0.004, 0.8 * p, 0.2), out);
      chain(noise(c, 'white', t, 0.08), filter(c, 'bandpass', 1900, 0.9), env(c, t, 0.002, 0.4 * p, 0.06), out);
      chain(noise(c, 'pink', t, 0.18), filter(c, 'lowpass', 420), env(c, t, 0.004, 0.9 * p, 0.15), out);
    },
    catch(c, out, t) {
      chain(noise(c, 'white', t, 0.07), filter(c, 'bandpass', 950, 0.8), env(c, t, 0.002, 0.5, 0.055), out);
      const o = osc(c, 'sine', 270, t, 0.07);
      o.frequency.exponentialRampToValueAtTime(175, t + 0.06);
      chain(o, env(c, t, 0.002, 0.22, 0.06), out);
    },
    throw(c, out, t) {
      const bp = filter(c, 'bandpass', 700, 1.3);
      bp.frequency.setValueAtTime(700, t);
      bp.frequency.exponentialRampToValueAtTime(2600, t + 0.18);
      chain(noise(c, 'white', t, 0.24), bp, env(c, t, 0.035, 0.28, 0.17), out);
    },
    /* the quarterback's bark: a saw through two vowel formants, then the ball hitting hands */
    snap(c, out, t) {
      const g = env(c, t, 0.008, 0.8, 0.13);
      g.connect(out);
      const src = osc(c, 'sawtooth', 158, t, 0.16);
      src.frequency.exponentialRampToValueAtTime(118, t + 0.13);
      const air = gain(c, 0.25);
      chain(noise(c, 'white', t, 0.16), air);
      for (const [f, q, lvl] of [[640, 5, 1], [1180, 6, 0.6]]) {
        const bp = filter(c, 'bandpass', f, q), l = gain(c, lvl);
        src.connect(bp); air.connect(bp); chain(bp, l, g);
      }
      chain(noise(c, 'white', t + 0.09, 0.05), filter(c, 'bandpass', 1000, 0.8), env(c, t + 0.09, 0.002, 0.14, 0.04), out);
    },
    kick(c, out, t) {
      const o = osc(c, 'sine', 165, t, 0.2);
      o.frequency.exponentialRampToValueAtTime(46, t + 0.14);
      chain(o, env(c, t, 0.003, 0.9, 0.2), out);
      chain(noise(c, 'white', t, 0.03), filter(c, 'highpass', 2200), env(c, t, 0.001, 0.2, 0.025), out);
    },
    juke(c, out, t) {
      chain(noise(c, 'white', t, 0.09), filter(c, 'highpass', 3200), env(c, t, 0.004, 0.15, 0.07), out);
    },
    /* interface */
    tick(c, out, t) { chain(osc(c, 'triangle', 1250, t, 0.04), env(c, t, 0.002, 0.1, 0.03), out); },
    ok(c, out, t) { bell(c, out, t, hz(7), 0.12, 0.09); bell(c, out, t + 0.07, hz(14), 0.18, 0.09); },
    buy(c, out, t) { [0, 4, 7, 12].forEach((s, i) => bell(c, out, t + i * 0.07, hz(3 + s), 0.22, 0.09)); },
    chime(c, out, t) { bell(c, out, t, hz(10), 0.3, 0.1); bell(c, out, t + 0.11, hz(17), 0.45, 0.1); },
    /* touchdown: air horn under a short rising brass figure */
    horn(c, out, t) {
      const lp = filter(c, 'lowpass', 1700, 0.7), g = envHold(c, t, 0.04, 0.085, 1.0, 0.3);
      chain(lp, g, out);
      for (const [f, cents] of [[233.08, -9], [233.08, 8], [311.13, -6], [311.13, 7]]) {
        const o = osc(c, 'sawtooth', f, t, 1.5); o.detune.value = cents; o.connect(lp);
      }
    },
    fanfare(c, out, t) {
      const n = [[-7, 0, 0.15], [-4, 0.15, 0.15], [0, 0.3, 0.15], [5, 0.45, 0.2], [3, 0.68, 0.2], [5, 0.92, 0.8]];
      for (const [s, at, d] of n) brass(c, out, t + at, hz(s), d, 0.075);
      for (const s of [-4, 0]) brass(c, out, t + 0.92, hz(s), 0.8, 0.045);   // harmony under the last note
    },
    lose(c, out, t) { [[0, 0], [-2, 0.26], [-5, 0.52]].forEach(([s, at]) => brass(c, out, t + at, hz(s - 12), 0.3 + (at > 0.5 ? 0.5 : 0), 0.06)); },
    /* crowd one-shots (the bed lives in `crowd` below) */
    groan(c, out, t, o) {
      const a = o && o.amount !== undefined ? o.amount : 1;
      const bp = filter(c, 'bandpass', 540, 1.3);
      bp.frequency.setValueAtTime(540, t);
      bp.frequency.exponentialRampToValueAtTime(250, t + 1.1);
      chain(noise(c, 'pink', t, 1.5, 0.8), bp, env(c, t, 0.14, 0.5 * a, 1.25), out);
    },
    ooh(c, out, t, o) {
      const a = o && o.amount !== undefined ? o.amount : 1;
      const bp = filter(c, 'bandpass', 460, 1.5);
      bp.frequency.setValueAtTime(460, t);
      bp.frequency.linearRampToValueAtTime(640, t + 0.18);
      bp.frequency.linearRampToValueAtTime(400, t + 0.7);
      chain(noise(c, 'pink', t, 0.9), bp, env(c, t, 0.08, 0.45 * a, 0.7), out);
    },
    /* a stadium organ riff: a rising run that stops on a held note, leaving room for the crowd to answer */
    organ(c, out, t) {
      const notes = [[-7, 0, 0.13], [-3, 0.14, 0.13], [0, 0.28, 0.13], [5, 0.42, 0.13], [0, 0.56, 0.1], [5, 0.68, 0.5]];   // D4 F#4 A4 D5 A4 D5
      for (const [semi, at, dur] of notes) {
        const g = envHold(c, t + at, 0.012, 0.085, dur, 0.06);
        g.connect(out);
        [[1, 1], [2, 0.5], [3, 0.3], [4, 0.16], [6, 0.08]].forEach(([h, a]) => {      // drawbars
          const o = osc(c, 'sine', hz(semi) * h, t + at, dur + 0.08), og = gain(c, a);
          o.detune.value = Math.sin(h * 3.1) * 4;
          chain(o, og, g);
        });
      }
    },
    /* one stomp of a few thousand feet on aluminum */
    stomp(c, out, t, o) {
      const lvl = o && o.level !== undefined ? o.level : 0.2, sw = osc(c, 'sine', 95, t, 0.2);
      sw.frequency.exponentialRampToValueAtTime(46, t + 0.14);
      chain(sw, env(c, t, 0.004, lvl, 0.2), out);
      chain(noise(c, 'pink', t, 0.12), filter(c, 'lowpass', 420, 0.6), env(c, t, 0.004, lvl * 0.9, 0.11), out);
    },
    clap(c, out, t, o) {
      const lvl = o && o.level !== undefined ? o.level * 1.5 : 0.15;
      for (let i = 0; i < 4; i++) {   // a handful of hands, slightly apart
        const at = t + Math.random() * 0.03;
        chain(noise(c, 'white', at, 0.05), filter(c, 'bandpass', 1300 + Math.random() * 700, 0.9), env(c, at, 0.002, lvl, 0.04), out);
      }
    },
  };
  function clamp01(v) { return v < 0 ? 0 : v > 1.5 ? 1.5 : v; }

  /* ---------- crowd ---------- */

  /* the bed is two bands of pink noise plus air; the roar is a second, brighter pair that cheers open up */
  function buildCrowd(c, t, seconds) {
    const out = gain(c, 0.0001), bed = gain(c, 0.0), roar = gain(c, 0.0);
    chain(noise(c, 'pink', t, seconds), filter(c, 'bandpass', 430, 0.5), gain(c, 1.0), bed);
    chain(noise(c, 'pink', t, seconds, 0.71), filter(c, 'bandpass', 1150, 0.7), gain(c, 0.55), bed);
    chain(noise(c, 'white', t, seconds), filter(c, 'highpass', 3600), gain(c, 0.035), bed);
    bed.connect(out);
    const roarF = filter(c, 'bandpass', 800, 0.9), roarF2 = filter(c, 'bandpass', 1450, 1.2), rs = noise(c, 'pink', t, seconds, 0.9);
    rs.connect(roarF); rs.connect(roarF2);
    roarF.connect(roar); chain(roarF2, gain(c, 0.5), roar);
    roar.connect(out);
    return { out, bed, roar, roarF };
  }

  const crowd = {
    nodes: null, level: 0.3, timer: null, clapTimer: null,
    start() {
      if (!ctx || !S.snd || this.nodes) return;
      const c = ctx, t = c.currentTime;
      this.nodes = buildCrowd(c, t, 86400);
      this.nodes.out.connect(bus.crowd);
      this.nodes.out.gain.setTargetAtTime(1, t, 0.6);
      this.set(this.level, 0.5);
      /* small random swells and the odd distant whoop keep the bed from sounding like a loop */
      this.timer = setInterval(() => {
        if (!this.nodes || ctx.state !== 'running') return;
        const now = ctx.currentTime, base = this.bedGain();
        this.nodes.bed.gain.setTargetAtTime(base * (0.85 + Math.random() * 0.3), now, 0.35);
        if (Math.random() < 0.07) {
          const o = osc(ctx, 'sine', 620 + Math.random() * 300, now, 0.3);
          o.frequency.exponentialRampToValueAtTime(900 + Math.random() * 400, now + 0.22);
          chain(o, env(ctx, now, 0.05, 0.012, 0.25), bus.crowd);
        }
      }, 650);
    },
    bedGain() { return 0.04 + 0.08 * this.level; },
    /* 0 = a quiet stadium between plays, 1 = everyone on their feet */
    set(level, time) {
      this.level = Math.max(0, Math.min(1, level));
      if (this.nodes) this.nodes.bed.gain.setTargetAtTime(this.bedGain(), ctx.currentTime, (time || 1.2) / 3);
    },
    cheer(amount, dur) {
      if (!this.nodes || !S.snd) return;
      const a = amount === undefined ? 1 : amount, d = dur || 3, t = ctx.currentTime, n = this.nodes;
      n.roar.gain.cancelScheduledValues(t);
      n.roar.gain.setTargetAtTime(0.3 * a, t, 0.1);
      n.roar.gain.setTargetAtTime(0.0, t + d * 0.45, d * 0.3);
      n.roarF.frequency.cancelScheduledValues(t);
      n.roarF.frequency.setTargetAtTime(1050, t, 0.15);
      n.roarF.frequency.setTargetAtTime(800, t + d * 0.5, 0.6);
    },
    groan(amount) { play('groan', { amount }); },
    ooh(amount) { play('ooh', { amount }); },
    /* claps that speed up toward the snap */
    clapBuild(seconds) {
      this.stopClaps();
      if (!this.nodes || !S.snd) return;
      const t0 = ctx.currentTime, total = seconds || 3;
      const next = () => {
        if (!this.nodes) return;
        const k = Math.min(1, (ctx.currentTime - t0) / total);
        play('clap', { level: 0.05 + 0.08 * k });
        if (k < 1) this.clapTimer = setTimeout(next, 560 - 380 * k);
      };
      next();
    },
    stopClaps() { clearTimeout(this.clapTimer); this.clapTimer = null; },
    /* stomp, stomp, clap: the home crowd getting behind its defense */
    chant(bars) {
      if (!this.nodes || !S.snd) return;
      const t = ctx.currentTime + 0.05, beat = 0.36;
      for (let i = 0; i < (bars || 3); i++) {
        const b = t + i * beat * 4, lvl = 0.14 + i * 0.03;
        SFX.stomp(ctx, bus.crowd, b, { level: lvl }); SFX.stomp(ctx, bus.crowd, b + beat, { level: lvl });
        SFX.clap(ctx, bus.crowd, b + beat * 2, { level: lvl * 0.55 });
      }
    },
    stop() {
      this.stopClaps();
      clearInterval(this.timer); this.timer = null;
      const n = this.nodes; this.nodes = null;
      if (n && ctx) { n.out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2); setTimeout(() => { try { n.out.disconnect(); } catch (_) {} }, 1200); }
    },
  };

  /* ---------- music: a drumline with brass, 8 bars ---------- */

  const BPM = 100, STEP = 60 / BPM / 4;
  const KICK = 'x.....x...x.....x.....x.x.x.....';             // two bars of sixteenths
  const SNARE = '....x..g.g..x.gg....x..g.gg.x.xx';
  const RIM = 'x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.x.';
  const CHORDS = [[-7, [-7, -4, 0]], [-11, [-11, -7, -4]], [-4, [-4, 0, 3]], [-9, [-9, -5, -2]]];   // Dm, Bb, F, C around A4
  const LEAD = { 64: 5, 67: 8, 70: 12, 72: 10, 76: 8, 80: 5, 84: 3, 88: 5, 96: 8, 99: 12, 102: 15, 104: 12, 108: 10, 112: 8, 116: 10, 120: 12 };

  const DRUM = {
    kick(c, out, t, v) {
      const o = osc(c, 'sine', 150, t, 0.25);
      o.frequency.exponentialRampToValueAtTime(44, t + 0.12);
      chain(o, env(c, t, 0.003, 0.6 * v, 0.24), out);
    },
    snare(c, out, t, v) {
      chain(noise(c, 'white', t, 0.16), filter(c, 'bandpass', 2100, 0.7), env(c, t, 0.002, 0.42 * v, 0.13), out);
      const o = osc(c, 'triangle', 205, t, 0.1);
      o.frequency.exponentialRampToValueAtTime(150, t + 0.08);
      chain(o, env(c, t, 0.002, 0.3 * v, 0.09), out);
    },
    rim(c, out, t, v) {
      chain(noise(c, 'white', t, 0.03), filter(c, 'highpass', 6500), env(c, t, 0.001, 0.07 * v, 0.025), out);
    },
  };
  /* everything that happens on one sixteenth-note step of the 8-bar loop */
  function musicStep(c, out, i, t) {
    const s = i % 32, bar = Math.floor(i / 16), fill = bar === 7;
    if (KICK[s] === 'x') DRUM.kick(c, out, t, 1);
    const sn = fill && i % 16 >= 8 ? 'x' : SNARE[s];
    if (sn === 'x') DRUM.snare(c, out, t, fill ? 0.55 + (i % 16) * 0.04 : 1);
    else if (sn === 'g') DRUM.snare(c, out, t, 0.3);
    if (RIM[s] === 'x') DRUM.rim(c, out, t, i % 4 === 0 ? 1 : 0.6);
    const [root, notes] = CHORDS[Math.floor(bar / 2) % 4];
    if (i % 16 === 0 || i % 16 === 6 || i % 16 === 10) {            // bass
      const lp = filter(c, 'lowpass', 520, 1), o = osc(c, 'sawtooth', hz(root - 24), t, 0.3);
      chain(o, lp, env(c, t, 0.006, 0.27, 0.3), out);
    }
    if (i % 32 === 0) for (const n of notes) brass(c, out, t, hz(n - 12), STEP * 14, 0.05);      // pad stab every two bars
    if (i % 32 === 22) for (const n of notes) brass(c, out, t, hz(n - 12), STEP * 5, 0.042);
    if (LEAD[i] !== undefined) brass(c, out, t, hz(LEAD[i]), STEP * (LEAD[i + 3] !== undefined || LEAD[i + 2] !== undefined ? 2 : 4), 0.062);
  }
  const music = {
    timer: null, next: 0, step: 0, out: null,
    start() {
      if (!ctx || !S.mus || this.timer) return;
      this.out = gain(ctx, 0.0001);
      this.out.connect(bus.music);
      this.out.gain.setTargetAtTime(1, ctx.currentTime, 0.4);
      this.next = ctx.currentTime + 0.08; this.step = 0;
      this.timer = setInterval(() => {
        if (ctx.state !== 'running') return;
        if (this.next < ctx.currentTime) this.next = ctx.currentTime + 0.05;   // came back from a pause
        while (this.next < ctx.currentTime + 0.14) { musicStep(ctx, this.out, this.step, this.next); this.next += STEP; this.step = (this.step + 1) % 128; }
      }, 30);
    },
    stop() {
      clearInterval(this.timer); this.timer = null;
      const o = this.out; this.out = null;
      if (o && ctx) { o.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.12); setTimeout(() => { try { o.disconnect(); } catch (_) {} }, 900); }
    },
  };

  /* ---------- announcer ----------
     Short calls on the big moments. There are no recordings: the words go to the device's speech synthesizer,
     so the voice is whatever the phone or computer has. The crowd dips while he talks. Settings can turn it off. */
  const ann = {
    voice: null, primed: false, log: [],
    pickVoice() {
      const all = (window.speechSynthesis && speechSynthesis.getVoices()) || [], en = all.filter(v => /^en/i.test(v.lang));
      const want = [/Daniel/, /Aaron/, /Alex/, /Google UK English Male/, /Microsoft (Guy|David|Ryan)/, /Google US English/, /Samantha/];
      for (const re of want) { const v = en.find(x => re.test(x.name)); if (v) { this.voice = v; return; } }
      this.voice = en.find(v => /en-US/i.test(v.lang)) || en[0] || null;
    },
    /* some phones only allow speech after one utterance has been started by a tap */
    prime() {
      if (this.primed || !('speechSynthesis' in window)) return;
      this.primed = true;
      try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); this.pickVoice(); speechSynthesis.addEventListener('voiceschanged', () => this.pickVoice()); } catch (_) {}
    },
    duck(on) {
      if (!ctx || !bus) return;
      bus.crowd.gain.setTargetAtTime(on ? 0.5 : 1, ctx.currentTime, 0.12);
    },
    say(text, urgent) {
      this.log.push(text); if (this.log.length > 30) this.log.shift();          // kept so tests can see what was called
      if (!S.ann || !S.snd || !('speechSynthesis' in window) || !ctx || ctx.state !== 'running') return false;
      try {
        if (speechSynthesis.speaking || speechSynthesis.pending) { if (!urgent) return false; speechSynthesis.cancel(); }
        const u = new SpeechSynthesisUtterance(text);
        if (!this.voice) this.pickVoice();
        if (this.voice) u.voice = this.voice;
        u.rate = 1.1; u.pitch = 0.9; u.volume = 0.95;
        u.onstart = () => this.duck(true); u.onend = u.onerror = () => this.duck(false);
        speechSynthesis.speak(u);
        return true;
      } catch (_) { return false; }
    },
    hush() { try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch (_) {} this.duck(false); },
  };

  /* ---------- weather ---------- */
  const weatherBed = {
    kind: 'clear', node: null,
    set(kind) { this.kind = kind || 'clear'; this.apply(); },
    apply() {
      const want = ctx && S.snd && !wantMusic ? this.kind : 'clear';
      if (this.node && this.node.kind === want) return;
      if (this.node) { const n = this.node; n.out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3); setTimeout(() => { try { n.out.disconnect(); n.stop(); } catch (_) {} }, 1500); this.node = null; }
      if (want !== 'rain' && want !== 'snow') return;
      const c = ctx, t = c.currentTime, out = gain(c, 0.0001), srcs = [];
      const src = (color, rate) => { const n = noise(c, color, t, 86400, rate); srcs.push(n); return n; };
      if (want === 'rain') {                      // hiss on the seats and the turf, and a low wash underneath
        chain(src('white'), filter(c, 'highpass', 2600), gain(c, 0.035), out);
        chain(src('pink', 0.8), filter(c, 'bandpass', 700, 0.4), gain(c, 0.05), out);
      } else {                                    // wind: a band of noise that wanders
        const f = filter(c, 'bandpass', 330, 1.4), lfo = c.createOscillator(), depth = gain(c, 140);
        lfo.frequency.value = 0.13; chain(lfo, depth, f.frequency); lfo.start(t); srcs.push(lfo);
        chain(src('pink', 0.7), f, gain(c, 0.11), out);
      }
      out.connect(bus.crowd);
      out.gain.setTargetAtTime(1, t, 0.8);
      this.node = { kind: want, out, stop() { for (const n of srcs) try { n.stop(); } catch (_) {} } };
    },
  };

  /* ---------- public ---------- */

  function play(name, opts) {
    if (!ctx || !S.snd || ctx.state !== 'running' || !SFX[name]) return;
    try { SFX[name](ctx, bus.sfx, ctx.currentTime + 0.001, opts); } catch (_) {}
  }
  let wantMusic = true;      // menus want music, games want the crowd
  function unlock() {
    try {
      if (!ctx) { ctx = new (window.AudioContext || window.webkitAudioContext)(); bus = buildGraph(ctx); }
      if (ctx.state !== 'running') ctx.resume();
      if (wantMusic) music.start(); else crowd.start();
      weatherBed.apply();
      ann.prime();
    } catch (_) {}
  }
  for (const ev of ['pointerdown', 'touchend', 'keydown']) addEventListener(ev, unlock, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) { ctx.suspend(); ann.hush(); } else ctx.resume();
  });
  /* interface clicks: every menu button ticks, primary buttons confirm */
  document.addEventListener('click', e => {
    const b = e.target && e.target.closest && e.target.closest('button');
    if (!b || b.classList.contains('pb')) return;
    play(b.classList.contains('go') ? 'ok' : 'tick');
  }, true);

  PG.audio = {
    play, crowd, music,
    /* which soundtrack the current screen wants */
    scene(name) {
      wantMusic = name === 'menu';
      if (!ctx) return;
      if (wantMusic) { crowd.stop(); music.start(); ann.hush(); } else { music.stop(); crowd.start(); }
      weatherBed.apply();
    },
    say(text, urgent) { return ann.say(text, urgent); },
    get spoken() { return ann.log; },
    weather(kind) { weatherBed.set(kind); },
    muffle(on) {
      if (!ctx || !bus) return;
      bus.tone.frequency.setTargetAtTime(on ? 650 : 20000, ctx.currentTime, on ? 0.08 : 0.15);
      if (on) ann.hush();
    },
    /* settings changed */
    refresh() {
      if (!ctx) return;
      if (!S.snd) { crowd.stop(); ann.hush(); } else if (!wantMusic) crowd.start();
      if (!S.ann) ann.hush();
      weatherBed.apply();
      if (!S.mus) music.stop(); else if (wantMusic) music.start();
    },
    /* render a voice offline and report its level: used to balance the mix */
    async measure(name, opts, seconds) {
      const sr = 44100, len = seconds || 2.5, c = new OfflineAudioContext(1, sr * len, sr), g = buildGraph(c);
      if (name === 'music') for (let i = 0; i < Math.floor(len / STEP); i++) musicStep(c, g.music, i % 128, 0.02 + i * STEP);
      else if (name === 'crowd') {
        const n = buildCrowd(c, 0, len);
        n.out.gain.value = 1; n.out.connect(g.crowd);
        n.bed.gain.value = 0.04 + 0.08 * (opts && opts.level || 0); n.roar.gain.value = opts && opts.roar || 0;
      } else SFX[name](c, g.sfx, 0.02, opts);
      const d = (await c.startRendering()).getChannelData(0);
      let peak = 0, sum = 0;
      for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > peak) peak = a; sum += d[i] * d[i]; }
      const db = v => +(20 * Math.log10(Math.max(1e-6, v))).toFixed(1);
      return { peakDb: db(peak), rmsDb: db(Math.sqrt(sum / d.length)) };
    },
    names: Object.keys(SFX),
    get state() { return ctx ? ctx.state : 'none'; },
  };
})();
