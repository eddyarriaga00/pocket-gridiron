/* Pocket Gridiron: sound engine (second version, 2026-11-12).
   Every sound is made in code with the Web Audio API; there are still no audio files.
   
   PG.audio.play(name, opts)   one-shot effects (whistle, hit, catch, horn, ...); opts.x pans by field position
   PG.audio.crowd.*            the stadium: murmur, roar and applause loops that follow the game, oohs, groans, chants
   PG.audio.music.*            the menu theme: drums, bass, pad and a brass section, sixteen bars
   PG.audio.say(text, urgent)  the announcer: the device's own speech synthesizer, with the crowd dipped under it
   PG.audio.weather(kind)      a bed of rain (with thunder) or wind under the crowd
   PG.audio.muffle(on)         everything goes dull and distant while the game is paused
   
   What changed from the first version, and why:
   - The crowd was filtered noise at about -35 dB. It is now made of voices: a few hundred synthesized syllables (a buzzy
   tone through vowel formants) rendered once, off the main thread, into loops of murmur and roar, plus applause built
   from single claps. Reactions (ooh, aww, "DE-FENSE") are rendered the same way.
   - Effects were thin and 10 to 25 dB too quiet. Each is rebuilt in layers and levelled against the others.
   - The mix now ends in a bus compressor and a limiter, so it can be loud without clipping.
   
   Each voice is a function (ctx, out, t, opts), so it can be rendered in an OfflineAudioContext as well as played.
   That is how levels are checked without ears: PG.audio.measure and PG.audio.report. */
(() => {
  'use strict';
  const S = PG.SET;
  if (S.mus === undefined) S.mus = true;
  if (S.ann === undefined) S.ann = true;
  if (S.vol === undefined) S.vol = 2;
  const VOL = [0.45, 0.7, 1], TRIM = 0.8;  // Settings: low, medium, high; and the headroom left above the limiter

  let ctx = null;  // the live AudioContext, created on the first tap
  let bus = null;  // the gain nodes of the live graph: master, sfx, crowd, music, ui, pa
  let stems = null;  // the crowd's rendered loops and reactions, once they are ready
  let stemsBusy = false;
  const noiseCache = new WeakMap(), curves = {};
  const rnd = (a, b) => a + Math.random() * (b - a), pickOf = a => a[Math.floor(Math.random() * a.length)];
  const lerp = (a, b, t) => a + (b - a) * t;

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
      white: make(2, d => {
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }),
      pink: make(5, d => {
        // Paul Kellet's economy pink filter
        let b0 = 0, b1 = 0, b2 = 0;
        for (let i = 0; i < d.length; i++) {
          const w = Math.random() * 2 - 1;
          b0 = 0.99765 * b0 + w * 0.0990460;
          b1 = 0.96300 * b1 + w * 0.2965164;
          b2 = 0.57000 * b2 + w * 1.0526913;
          d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.22;
        }
      }),
      brown: make(4, d => {
        // a leaky integrator: rumble
        let v = 0;
        for (let i = 0; i < d.length; i++) {
          v = (v + (Math.random() * 2 - 1) * 0.02) * 0.998;
          d[i] = v * 6;
        }
      }),
    };
    noiseCache.set(c, b);
    return b;
  }

  const gain = (c, v) => {
    const g = c.createGain();
    g.gain.value = v;
    return g;
  };
  const filter = (c, type, f, q) => {
    const n = c.createBiquadFilter();
    n.type = type;
    n.frequency.value = f;
    if (q !== undefined) n.Q.value = q;
    return n;
  };

  /* left to right, -1 to 1; a plain pass-through where the browser has no panner */
  const pan = (c, v) => {
    if (!c.createStereoPanner) return gain(c, 1);
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, v || 0));
    return p;
  };

  /* soft saturation: rounds off the peaks and adds a little grit, for hits, barks and brass */
  const drive = (c, amount) => {
    const w = c.createWaveShaper(), k = amount || 2;
    if (!curves[k]) {
      const n = 1024, curve = new Float32Array(n);
      for (let i = 0; i < n; i++) curve[i] = Math.tanh((i / (n - 1) * 2 - 1) * k) / Math.tanh(k);
      curves[k] = curve;
    }
    w.curve = curves[k];
    return w;
  };

  function osc(c, type, f, t, dur) {
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  function noise(c, color, t, dur, rate) {
    const s = c.createBufferSource();
    s.buffer = noiseBuffers(c)[color];
    s.loop = true;
    if (rate) s.playbackRate.value = rate;
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
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

  const chain = (...nodes) => {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
    return nodes[nodes.length - 1];
  };
  const hz = semis => 440 * Math.pow(2, semis / 12);  // semitones from A4

  /* ---------- the mix ---------- */

  /* A stadium's echo: a few early slaps off the stands, then a tail that gets darker as it dies. */
  function impulse(c, seconds) {
    const sr = c.sampleRate, n = Math.floor(sr * seconds), buf = c.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        lp += ((Math.random() * 2 - 1) - lp) * (0.18 + 0.75 * Math.exp(-t * 3.2));  // the low-pass closes with time
        d[i] = lp * Math.pow(1 - i / n, 2) * Math.exp(-t * 1.9);
      }
      for (const [ms, g] of [[21, 0.5], [34, 0.42], [53, 0.34], [79, 0.27], [113, 0.2]]) {
        const k = Math.floor(sr * (ms + ch * 5) / 1000);
        if (k < n) d[k] += g * (ch ? -1 : 1);
      }
    }
    return buf;
  }

  function compressor(c, threshold, knee, ratio, attack, release) {
    const k = c.createDynamicsCompressor();
    k.threshold.value = threshold;
    k.knee.value = knee;
    k.ratio.value = ratio;
    k.attack.value = attack;
    k.release.value = release;
    return k;
  }

  /* Buses into a master, a compressor that glues them, a limiter that catches what is left, and the volume setting.
     Each bus also feeds the stadium reverb by its own amount. `pa` is the public-address system: band-limited, with a
     slap coming back off the far stand, for the horn and the organ. */
  function buildGraph(c) {
    const master = gain(c, 1), tone = filter(c, 'lowpass', 20000, 0.5), out = gain(c, TRIM * (VOL[S.vol] === undefined ? 1 : VOL[S.vol]));
    /* Web Audio's compressor adds its own make-up gain (about 5 dB for the first of these, 3 for the second), so
       quiet passages come up and loud ones are held: the second, at 20 to 1, is the ceiling, and TRIM leaves a
       little room above it for the instant it takes to react. */
    chain(master, tone, compressor(c, -18, 12, 2, 0.015, 0.3), compressor(c, -6, 0, 20, 0.003, 0.1), out, c.destination);
    const verb = c.createConvolver();
    verb.buffer = impulse(c, 2.6);
    chain(verb, gain(c, 0.4), master);
    const mk = (level, send) => {
      const g = gain(c, level);
      g.connect(master);
      chain(g, gain(c, send), verb);
      return g;
    };
    const pa = gain(c, 1), band = filter(c, 'bandpass', 1150, 0.45), slap = c.createDelay(0.6), back = gain(c, 0.26);
    slap.delayTime.value = 0.21;
    chain(pa, band, master);
    chain(band, slap, back, slap);
    chain(slap, gain(c, 0.45), master);
    chain(band, gain(c, 0.45), verb);
    /* the band sits in the stands: duller than anything on the field, and with more of the stadium on it */
    const stands = gain(c, 1), dull = filter(c, 'lowpass', 4600, 0.5);
    chain(stands, dull, gain(c, 0.85), master);
    chain(dull, gain(c, 0.4), verb);
    return { master, tone, out, sfx: mk(1, 0.2), crowd: mk(1, 0.14), music: mk(0.9, 0.09), ui: mk(1, 0.03), pa, stands };
  }

  /* ---------- voices ---------- */

  /* The first three formants of each vowel, in hertz, for an adult man speaking. Shouting, and women's and children's
     voices, push them up; callers pass a scale for that. */
  const VOWEL = { a: [730, 1090, 2440], ae: [660, 1720, 2410], e: [530, 1840, 2480], i: [280, 2250, 2900], o: [570, 840, 2410], u: [320, 870, 2240], uh: [640, 1190, 2390] };

  /* A mouth: three band-pass filters on a vowel's formants. Any number of throats can sound through one mouth, and it
     can move from vowel to vowel over time (path: [[seconds, vowel], ...]), which is what makes it sound like speech
     instead of a held note. Returns the node the throats connect to. */
  function mouth(c, dest, path, scale, where) {
    const input = gain(c, 1), mix = gain(c, 1);
    [0, 1, 2].forEach(k => {
      const bp = filter(c, 'bandpass', VOWEL[path[0][1]][k] * scale, [7, 10, 11][k]);
      bp.frequency.setValueAtTime(VOWEL[path[0][1]][k] * scale, 0);
      for (let i = 1; i < path.length; i++) bp.frequency.linearRampToValueAtTime(VOWEL[path[i][1]][k] * scale, path[i][0]);
      chain(input, bp, gain(c, [1, 0.9, 0.6][k]), mix);
    });
    chain(mix, filter(c, 'highpass', 190, 0.7), filter(c, 'lowpass', 4200, 0.5), pan(c, where), dest);  // a voice's weight is above its fundamental
    return input;
  }

  /* One syllable from one throat: a buzzy tone that swells, moves in pitch (f0, then f1 a third of the way in, then f2)
     and dies away. */
  function consonant(c, out, t, amp) {
    const hard = Math.random() < 0.5, len = hard ? rnd(0.015, 0.03) : rnd(0.05, 0.11);  // a "t" or "k", or an "s" or "sh"
    chain(noise(c, 'white', t, len), filter(c, 'bandpass', hard ? rnd(2200, 4200) : rnd(3200, 6200), hard ? 1.2 : 2.2), env(c, t, hard ? 0.002 : 0.02, amp, len), pan(c, rnd(-0.9, 0.9)), out);
  }

  function syllable(c, into, t, dur, f0, f1, f2, amp, attack, release) {
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.linearRampToValueAtTime(f1, t + dur * 0.35);
    o.frequency.linearRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(amp, t + Math.min(attack, dur * 0.5));
    g.gain.setValueAtTime(amp, t + Math.max(Math.min(attack, dur * 0.5), dur - release));
    g.gain.linearRampToValueAtTime(0, t + dur);
    chain(o, g, into);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  /* one man's shout or grunt, played live: the same idea with its own mouth and some breath in it */
  function bark(c, out, t, o) {
    const g = env(c, t, 0.012, o.amp, o.dur), src = osc(c, 'sawtooth', o.f0, t, o.dur + 0.05), air = gain(c, o.breath === undefined ? 0.2 : o.breath);
    src.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
    chain(noise(c, 'white', t, o.dur + 0.05), air);
    VOWEL[o.vowel].forEach((f, k) => {
      const bp = filter(c, 'bandpass', f * (o.scale || 1), [6, 8, 9][k]);
      src.connect(bp);
      air.connect(bp);
      chain(bp, gain(c, [1, 0.6, 0.3][k]), g);
    });
    chain(g, drive(c, 2.5), out);
  }

  /* ---------- the crowd, rendered ----------
     Each stem is built in an OfflineAudioContext (the browser renders it on its own thread) and kept as a buffer.
     Loops are made seamless by rendering a tail past the end and folding it back onto the start: a syllable that
     begins near the end simply finishes at the beginning. */
  const STEMS = {
    /* a crowd between plays: several dozen people talking, none of them to you */
    walla: { len: 7, tail: 2, rms: 0.085, build(c, out, len) {
      const mouths = [];
      for (let m = 0; m < 12; m++) {
        const path = [];
        for (let t = 0; t < len + 2; t += rnd(0.12, 0.34)) path.push([t, pickOf(['a', 'ae', 'e', 'i', 'o', 'u', 'uh'])]);
        mouths.push(mouth(c, out, path, m % 3 === 0 ? 1.17 : 1, rnd(-0.9, 0.9)));
      }
      for (let v = 0; v < 46; v++) {
        const m = mouths[v % mouths.length], base = v % 3 === 0 ? rnd(170, 250) : rnd(88, 150), loud = rnd(0.35, 1);
        let t = rnd(0, 0.6);
        while (t < len) {
          const n = 2 + Math.floor(rnd(0, 7));  // a phrase, falling in pitch as speech does
          for (let k = 0; k < n && t < len; k++) {
            const dur = rnd(0.09, 0.26), f = base * lerp(1.12, 0.86, k / n) * rnd(0.96, 1.04);
            if (Math.random() < 0.45) consonant(c, out, Math.max(0, t - 0.03), loud * 0.05);
            syllable(c, m, t, dur, f, f * rnd(0.97, 1.05), f * rnd(0.9, 1), loud * rnd(0.6, 1), 0.025, 0.06);
            t += dur + rnd(0.01, 0.09);
          }
          t += rnd(0.25, 1.5);
        }
      }
    }
    },
    /* the same crowd on its feet: long open vowels, pitches climbing, a few high whoops */
    roar: { len: 6, tail: 3, rms: 0.13, build(c, out, len) {
      const mouths = [];
      for (let m = 0; m < 10; m++) {
        const path = [];
        for (let t = 0; t < len + 3; t += rnd(0.5, 1.3)) path.push([t, pickOf(m < 8 ? ['a', 'ae', 'a', 'o', 'e'] : ['u', 'o'])]);
        mouths.push(mouth(c, out, path, m % 2 ? 1.2 : 1.08, rnd(-1, 1)));
      }
      for (let v = 0; v < 84; v++) {
        const woo = v % 8 >= 6, m = mouths[woo ? 8 + v % 2 : v % 8], base = woo ? rnd(420, 700) : v % 3 === 0 ? rnd(300, 460) : rnd(150, 290), loud = rnd(0.5, 1);
        let t = rnd(0, 2.4);  // spread out: with the tail folded back over the start, the level then stays even round the loop
        while (t < len) {
          const dur = rnd(0.7, 2.1), up = rnd(1.04, 1.16);
          syllable(c, m, t, dur, base * rnd(0.95, 1.02), base * up, base * up * rnd(0.88, 0.98), loud, rnd(0.07, 0.2), rnd(0.25, 0.5));
          t += dur + rnd(0.12, 0.5);
        }
      }
    }
    },
    /* a big hit, a near miss: everybody at once, up and then down */
    ooh: { len: 1.5, tail: 0, rms: 0.15, build(c, out) {
      const ms = [0, 1, 2, 3, 4, 5].map(k => mouth(c, out, [[0, 'o'], [0.35, 'o'], [1.1, 'u']], k % 2 ? 1.18 : 1.05, rnd(-1, 1)));
      for (let v = 0; v < 72; v++) {
        const base = v % 3 === 0 ? rnd(300, 440) : rnd(140, 260), dur = rnd(0.6, 1.05);
        syllable(c, ms[v % 6], rnd(0, 0.2), dur, base, base * rnd(1.08, 1.2), base * rnd(0.8, 0.92), rnd(0.5, 1), rnd(0.06, 0.14), rnd(0.3, 0.5));
      }
    }
    },
    /* it went against the home team: a long "aww", sinking */
    groan: { len: 2.2, tail: 0, rms: 0.13, build(c, out) {
      const ms = [0, 1, 2, 3, 4, 5].map(k => mouth(c, out, [[0, 'a'], [0.3, 'o'], [1.2, 'o'], [2, 'uh']], k % 2 ? 1.12 : 1, rnd(-1, 1)));
      for (let v = 0; v < 72; v++) {
        const base = v % 3 === 0 ? rnd(230, 330) : rnd(105, 210), dur = rnd(1, 1.7);
        syllable(c, ms[v % 6], rnd(0, 0.3), dur, base, base * rnd(0.9, 0.96), base * rnd(0.7, 0.8), rnd(0.5, 1), rnd(0.12, 0.25), rnd(0.4, 0.7));
      }
    }
    },
    /* the kicker runs up: one long "ohhh" that climbs and swells until his foot meets the ball */
    kickoh: { len: 1.9, tail: 0, rms: 0.13, build(c, out) {
      const ms = [0, 1, 2, 3, 4, 5].map(k => mouth(c, out, [[0, 'o'], [1.2, 'o'], [1.7, 'a']], k % 2 ? 1.18 : 1.05, rnd(-1, 1)));
      for (let v = 0; v < 72; v++) {
        const base = v % 3 === 0 ? rnd(280, 400) : rnd(130, 240), t = rnd(0, 0.25), dur = 1.72 - t + rnd(0, 0.06);
        syllable(c, ms[v % 6], t, dur, base, base * rnd(1.08, 1.14), base * rnd(1.25, 1.4), rnd(0.5, 1), rnd(0.8, 1.2), 0.07);
      }
    }
    },
    /* one shout from everybody: "HEY!", or the crowd's answer to the band's bugle call */
    hey: { len: 0.7, tail: 0, rms: 0.18, build(c, out) {
      const ms = [0, 1, 2, 3].map(k => mouth(c, out, [[0, 'e'], [0.12, 'e'], [0.4, 'i']], k % 2 ? 1.2 : 1.08, rnd(-1, 1)));
      for (let v = 0; v < 72; v++) {
        const base = v % 3 === 0 ? rnd(300, 430) : rnd(160, 270);
        syllable(c, ms[v % 4], 0.02 + rnd(0, 0.05), rnd(0.3, 0.42), base * 1.05, base, base * rnd(0.85, 0.93), rnd(0.5, 1), 0.03, 0.14);
      }
    }
    },
    /* "LET'S GO!": the first half of the oldest chant in sport; the claps that answer it are played live */
    letsgo: { len: 1.05, tail: 0, rms: 0.17, build(c, out) {
      const lets = [0, 1, 2].map(k => mouth(c, out, [[0, 'e']], k ? 1.12 : 1, rnd(-0.8, 0.8))), go = [0, 1, 2].map(k => mouth(c, out, [[0, 'o'], [0.75, 'o'], [1, 'u']], k ? 1.12 : 1, rnd(-0.8, 0.8)));
      for (let v = 0; v < 64; v++) {
        const base = v % 3 === 0 ? rnd(230, 340) : rnd(120, 210), late = rnd(0, 0.05), loud = rnd(0.5, 1);
        syllable(c, lets[v % 3], 0.02 + late, rnd(0.2, 0.26), base, base * 1.02, base, loud * 2, 0.03, 0.07);
        syllable(c, go[v % 3], 0.42 + late, rnd(0.42, 0.52), base * 1.06, base * 1.06, base * 0.94, loud * 1.4, 0.035, 0.14);
      }
      chain(noise(c, 'white', 0.24, 0.1), filter(c, 'highpass', 4500), env(c, 0.24, 0.03, 0.04, 0.07), out);  // the "ts"
    }
    },
    /* "DE-FENSE": two syllables shouted more or less together, each voice on its own note */
    chant: { len: 1.1, tail: 0, rms: 0.17, build(c, out) {
      const dee = [0, 1, 2].map(k => mouth(c, out, [[0, 'i']], k ? 1.12 : 1, rnd(-0.8, 0.8))), fense = [0, 1, 2].map(k => mouth(c, out, [[0, 'e']], k ? 1.12 : 1, rnd(-0.8, 0.8)));
      for (let v = 0; v < 64; v++) {
        const base = v % 3 === 0 ? rnd(230, 340) : rnd(120, 210), late = rnd(0, 0.05), loud = rnd(0.5, 1);
        syllable(c, dee[v % 3], 0.02 + late, rnd(0.22, 0.28), base, base * 1.03, base, loud, 0.03, 0.07);
        syllable(c, fense[v % 3], 0.4 + late, rnd(0.3, 0.38), base * 0.95, base * 0.96, base * 0.88, loud * 2.3, 0.035, 0.1);
      }
      chain(noise(c, 'white', 0.68, 0.24), filter(c, 'highpass', 4500), env(c, 0.68, 0.04, 0.05, 0.2), out);  // the hiss on the end of "fense"
    }
    },
    /* the call went against the home team: a long, low "booo" from everybody who saw it differently */
    boo: { len: 2.7, tail: 0, rms: 0.14, build(c, out) {
      const ms = [0, 1, 2, 3, 4, 5].map(k => mouth(c, out, [[0, 'u'], [1.7, 'u'], [2.6, 'o']], k % 2 ? 1.08 : 0.97, rnd(-1, 1)));
      for (let v = 0; v < 76; v++) {
        const base = v % 4 === 0 ? rnd(190, 260) : rnd(92, 165), t = rnd(0, 0.55), dur = rnd(1.4, 2.05);
        syllable(c, ms[v % 6], t, dur, base * 1.04, base, base * rnd(0.86, 0.94), rnd(0.5, 1), rnd(0.16, 0.32), rnd(0.5, 0.8));
      }
    }
    },
    /* "FIRST DOWN!": the crowd finishing the stadium announcer's sentence, two syllables with the weight on the second */
    firstdown: { len: 1.2, tail: 0, rms: 0.17, build(c, out) {
      const first = [0, 1, 2].map(k => mouth(c, out, [[0, 'uh']], k ? 1.12 : 1, rnd(-0.8, 0.8))), down = [0, 1, 2].map(k => mouth(c, out, [[0, 'a'], [0.62, 'a'], [0.74, 'o'], [0.92, 'u']], k ? 1.12 : 1, rnd(-0.8, 0.8)));
      for (let v = 0; v < 64; v++) {
        const base = v % 3 === 0 ? rnd(230, 340) : rnd(120, 210), late = rnd(0, 0.05), loud = rnd(0.5, 1);
        syllable(c, first[v % 3], 0.07 + late, rnd(0.2, 0.26), base, base * 1.02, base, loud * 1.5, 0.03, 0.06);
        syllable(c, down[v % 3], 0.5 + late, rnd(0.42, 0.55), base * 1.05, base, base * 0.86, loud * 1.7, 0.03, 0.17);
      }
      chain(noise(c, 'white', 0, 0.1), filter(c, 'highpass', 5000), env(c, 0, 0.03, 0.03, 0.07), out);  // the "f"
      chain(noise(c, 'white', 0.31, 0.12), filter(c, 'highpass', 4500), env(c, 0.31, 0.03, 0.05, 0.08), out);  // the "st"
    }
    },
  };

  /* Applause is not voices: it is thousands of single claps, each a few milliseconds of noise ringing at its own pitch.
     Written straight into the buffer, wrapping at the end, so it loops without a seam. */
  function applause(sr, seconds, perSecond) {
    const n = Math.floor(sr * seconds), L = new Float32Array(n), R = new Float32Array(n);
    for (let k = 0; k < perSecond * seconds; k++) {
      const at = Math.floor(Math.random() * n), len = Math.floor(sr * rnd(0.01, 0.028)), amp = rnd(0.3, 1), where = Math.random();
      const r = 0.93, w = 2 * Math.PI * rnd(900, 2700) / sr, a1 = 2 * r * Math.cos(w), a2 = -r * r;
      let y1 = 0, y2 = 0;
      for (let i = 0; i < len * 4; i++) {
        const y = (Math.random() * 2 - 1) * Math.exp(-i / len) + a1 * y1 + a2 * y2;
        y2 = y1;
        y1 = y;
        const s = y * amp * 0.1, j = (at + i) % n;
        L[j] += s * (1 - where);
        R[j] += s * where;
      }
    }
    return [L, R];
  }

  const rmsOf = chans => {
    let sum = 0, n = 0;
    for (const d of chans) for (let i = 0; i < d.length; i++, n++) sum += d[i] * d[i];
    return Math.sqrt(sum / Math.max(1, n));
  };

  /* bring a pair of channels to the wanted loudness, never past full scale */
  function level(chans, rms) {
    let peak = 0;
    for (const d of chans) for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > peak) peak = Math.abs(d[i]);
    const k = Math.min(rms / Math.max(1e-6, rmsOf(chans)), 0.95 / Math.max(1e-6, peak));
    for (const d of chans) for (let i = 0; i < d.length; i++) d[i] *= k;
    return chans;
  }

  const rendered = c => {
    const p = c.startRendering();
    return p && p.then ? p : new Promise(done => {
      c.oncomplete = e => done(e.renderedBuffer);
    });
  };

  /* render every stem at sample rate sr; resolves to { walla, roar, clap, ooh, groan, chant } as [left, right] pairs */
  async function renderStems(sr) {
    const Off = window.OfflineAudioContext || window.webkitOfflineAudioContext, out = {};
    for (const name in STEMS) {
      const s = STEMS[name], n = Math.floor(sr * s.len), c = new Off(2, Math.floor(sr * (s.len + s.tail)) + 1, sr);
      s.build(c, c.destination, s.len);
      const buf = await rendered(c), chans = [0, 1].map(ch => {
        const d = buf.getChannelData(ch), keep = new Float32Array(n);
        keep.set(d.subarray(0, n));
        for (let i = n; i < d.length && i - n < n; i++) keep[i - n] += d[i];  // fold the tail back onto the start
        return keep;
      });
      out[name] = level(chans, s.rms);
    }
    out.clap = level(applause(sr, 5, 240), 0.09);
    return out;
  }

  const toBuffer = (c, chans) => {
    const b = c.createBuffer(2, chans[0].length, c.sampleRate);
    b.getChannelData(0).set(chans[0]);
    b.getChannelData(1).set(chans[1]);
    return b;
  };

  /* start rendering the crowd for the live context; when it lands, a crowd that is already playing switches over to it */
  function wantStems() {
    if (stems || stemsBusy || !ctx || !(window.OfflineAudioContext || window.webkitOfflineAudioContext)) return;
    stemsBusy = true;
    renderStems(ctx.sampleRate).then(raw => {
      stems = {};
      for (const k in raw) stems[k] = toBuffer(ctx, raw[k]);
      stemsBusy = false;
      if (crowd.nodes) {
        crowd.stop(0.5);
        crowd.start();
      }
    }).catch(() => {
      stemsBusy = false;  // the noise crowd stays
    });
  }

  /* ---------- one-shot effects ---------- */

  function brass(c, out, t, f, dur, peak) {
    const lp = filter(c, 'lowpass', 600, 1.5);
    lp.frequency.setValueAtTime(600, t);
    lp.frequency.exponentialRampToValueAtTime(3400, t + 0.045);
    lp.frequency.exponentialRampToValueAtTime(1500, t + Math.max(0.08, dur));
    const g = envHold(c, t, 0.022, peak, Math.max(0.01, dur - 0.1), 0.13);
    chain(lp, g, out);
    /* vibrato arrives late, on notes that are held */
    const vib = osc(c, 'sine', 5.6, t, dur + 0.2), depth = gain(c, 0);
    depth.gain.setValueAtTime(0, t + 0.12);
    depth.gain.linearRampToValueAtTime(f * 0.006, t + 0.4);
    vib.connect(depth);
    for (const cents of [-9, 0, 8]) {
      const o = osc(c, 'sawtooth', f, t, dur + 0.15);
      o.detune.value = cents;
      depth.connect(o.frequency);
      chain(o, gain(c, 0.5), lp);
    }
    chain(osc(c, 'square', f / 2, t, dur + 0.15), gain(c, 0.2), lp);
  }

  /* a struck bar: the note and three partials that die faster the higher they are */
  function bell(c, out, t, f, dur, peak) {
    for (const [mult, a, d] of [[1, 1, 1], [2, 0.4, 0.55], [3.01, 0.18, 0.35], [4.2, 0.09, 0.22]]) chain(osc(c, 'sine', f * mult, t, dur * d), env(c, t, 0.004, peak * a, dur * d), out);
  }

  function timpani(c, out, t, f, peak) {
    const o = osc(c, 'sine', f * 1.12, t, 0.9);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    chain(o, env(c, t, 0.004, peak, 0.8), out);
    chain(osc(c, 'sine', f * 1.5, t, 0.5), env(c, t, 0.004, peak * 0.3, 0.4), out);
    chain(noise(c, 'pink', t, 0.08), filter(c, 'lowpass', 300), env(c, t, 0.002, peak * 0.5, 0.06), out);
  }

  function cymbal(c, out, t, peak, decay) {
    chain(noise(c, 'white', t, decay + 0.1), filter(c, 'highpass', 5200), env(c, t, 0.004, peak, decay), out);
    chain(noise(c, 'white', t, decay * 0.5), filter(c, 'bandpass', 3400, 2.5), env(c, t, 0.004, peak * 0.5, decay * 0.5), out);
  }

  const DRUM = {
    kick(c, out, t, v) {
      const o = osc(c, 'sine', 165, t, 0.3);
      o.frequency.exponentialRampToValueAtTime(46, t + 0.11);
      chain(o, env(c, t, 0.002, 0.85 * v, 0.27), out);
      chain(noise(c, 'white', t, 0.02), filter(c, 'highpass', 2500), env(c, t, 0.001, 0.16 * v, 0.012), out);
    },
    snare(c, out, t, v) {
      chain(noise(c, 'white', t, 0.18), filter(c, 'bandpass', 2400, 0.6), env(c, t, 0.001, 0.48 * v, 0.14), out);
      chain(noise(c, 'white', t, 0.1), filter(c, 'highpass', 6000), env(c, t, 0.001, 0.14 * v, 0.07), out);
      const o = osc(c, 'triangle', 215, t, 0.1);
      o.frequency.exponentialRampToValueAtTime(160, t + 0.07);
      chain(o, env(c, t, 0.001, 0.34 * v, 0.09), out);
    },
    hat(c, out, t, v, open) {
      chain(noise(c, 'white', t, open ? 0.3 : 0.05), filter(c, 'highpass', 7200), env(c, t, 0.001, 0.13 * v, open ? 0.24 : 0.035), out);
    },
    tom(c, out, t, v, f) {
      const o = osc(c, 'sine', f * 1.3, t, 0.3);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
      chain(o, env(c, t, 0.002, 0.55 * v, 0.24), out);
      chain(noise(c, 'pink', t, 0.04), filter(c, 'lowpass', 900), env(c, t, 0.001, 0.2 * v, 0.03), out);
    },
  };

  const power = (o, d) => clamp01(o && o.power !== undefined ? o.power : d);

  const SFX = {
    /* the referee's pea whistle: two close tones, a fast trill in pitch and loudness, breath through it */
    whistle(c, out, t, o) {
      const dur = o && o.long ? 1 : 0.34, body = gain(c, 0.7);
      const trill = osc(c, 'sine', 37, t, dur + 0.1), fm = gain(c, 85), am = gain(c, 0.3);
      trill.connect(fm);
      chain(trill, am, body.gain);
      for (const [f, a] of [[2830, 1], [2975, 0.8], [5700, 0.12]]) {
        const s = osc(c, 'sine', f * 0.985, t, dur + 0.1);
        s.frequency.linearRampToValueAtTime(f, t + 0.05);  // the pitch settles as the pea gets going
        fm.connect(s.frequency);
        chain(s, gain(c, a), body);
      }
      chain(noise(c, 'white', t, dur + 0.1), filter(c, 'bandpass', 3100, 2), gain(c, 0.4), body);
      chain(body, envHold(c, t, 0.014, 0.12, dur, 0.06), out);
    },
    /* pads: a low thump, the body of two men, a plastic crack, shells clacking, and on the big ones a grunt */
    hit(c, out, t, o) {
      const p = power(o, 0.8), k = rnd(0.9, 1.12), mix = gain(c, 1), th = osc(c, 'sine', 150 * k, t, 0.22);
      th.frequency.exponentialRampToValueAtTime(46 * k, t + 0.15);
      chain(th, env(c, t, 0.003, 0.6 * p, 0.2), mix);
      chain(noise(c, 'pink', t, 0.2), filter(c, 'lowpass', 520), env(c, t, 0.003, 0.5 * p, 0.14), mix);
      chain(noise(c, 'white', t, 0.14), filter(c, 'bandpass', 760 * k, 0.9), env(c, t, 0.002, 1.5 * p, 0.09), mix);  // the smack: the part a phone speaker can play
      chain(noise(c, 'white', t, 0.07), filter(c, 'bandpass', 2300 * k, 1.1), env(c, t, 0.001, 0.9 * p, 0.04), mix);
      if (p > 0.55) for (const f of [1180, 1730, 2610]) chain(osc(c, 'sine', f * k, t, 0.05), env(c, t, 0.001, 0.09 * p, 0.03), mix);
      if (p > 0.85) bark(c, mix, t + 0.02, { f0: 125 * k, f1: 88 * k, dur: 0.13, vowel: 'uh', amp: 0.2 * p });
      chain(mix, drive(c, 1.8), gain(c, 0.75), out);
    },
    /* leather into gloves */
    catch (c, out, t) {
      chain(noise(c, 'white', t, 0.07), filter(c, 'bandpass', 1400, 1.2), env(c, t, 0.001, 1.1, 0.045), out);
      chain(noise(c, 'white', t, 0.08), filter(c, 'bandpass', 620, 1), env(c, t, 0.002, 0.9, 0.055), out);
      const o = osc(c, 'sine', 215, t, 0.08);
      o.frequency.exponentialRampToValueAtTime(140, t + 0.06);
      chain(o, env(c, t, 0.002, 0.25, 0.07), out);
    },
    /* the ball leaving the hand */
    throw (c, out, t) {
      const bp = filter(c, 'bandpass', 520, 1.2);
      bp.frequency.setValueAtTime(520, t);
      bp.frequency.exponentialRampToValueAtTime(2500, t + 0.2);
      chain(noise(c, 'white', t, 0.26), bp, env(c, t, 0.04, 0.5, 0.18), out);
    },
    /* "Hut!": the quarterback's bark, a hard stop on the end of it, then the ball hitting his hands */
    snap(c, out, t) {
      bark(c, out, t, { f0: 172, f1: 122, dur: 0.15, vowel: 'uh', amp: 0.85, breath: 0.3 });
      chain(noise(c, 'white', t + 0.13, 0.03), filter(c, 'highpass', 3500), env(c, t + 0.13, 0.001, 0.14, 0.018), out);
      chain(noise(c, 'white', t + 0.1, 0.05), filter(c, 'bandpass', 1000, 0.8), env(c, t + 0.1, 0.002, 0.3, 0.04), out);
    },
    /* a boot through the ball */
    kick(c, out, t) {
      const o = osc(c, 'sine', 190, t, 0.2);
      o.frequency.exponentialRampToValueAtTime(50, t + 0.12);
      chain(o, env(c, t, 0.002, 0.6, 0.2), out);
      chain(noise(c, 'white', t, 0.1), filter(c, 'bandpass', 620, 1.4), env(c, t, 0.001, 1.6, 0.07), out);  // the "pock" of the ball
      chain(noise(c, 'white', t, 0.06), filter(c, 'bandpass', 1150, 1.6), env(c, t, 0.001, 0.9, 0.04), out);
      chain(noise(c, 'white', t, 0.02), filter(c, 'highpass', 3000), env(c, t, 0.001, 0.25, 0.012), out);
    },
    /* cleats cutting in the turf: two short scrapes */
    juke(c, out, t) {
      for (const at of [0, 0.07]) chain(noise(c, 'white', t + at, 0.06), filter(c, 'bandpass', 4300, 0.8), env(c, t + at, 0.006, 0.28, 0.045), out);
    },
    /* interface */
    tick(c, out, t) {
      chain(osc(c, 'sine', 1900, t, 0.04), env(c, t, 0.001, 0.2, 0.03), out);
      chain(noise(c, 'white', t, 0.01), filter(c, 'highpass', 4000), env(c, t, 0.0005, 0.08, 0.004), out);
    },
    ok(c, out, t) {
      bell(c, out, t, hz(7), 0.16, 0.13);
      bell(c, out, t + 0.075, hz(14), 0.26, 0.13);
    },
    buy(c, out, t) {
      [0, 4, 7, 12].forEach((s, i) => bell(c, out, t + i * 0.07, hz(3 + s), 0.3, 0.11));
    },
    chime(c, out, t) {
      bell(c, out, t, hz(10), 0.35, 0.16);
      bell(c, out, t + 0.11, hz(17), 0.55, 0.16);
    },
    /* the touchdown horn: two notes a minor third apart that scoop up to pitch, through the stadium speakers */
    horn(c, out, t) {
      const lp = filter(c, 'lowpass', 2400, 2);
      chain(lp, envHold(c, t, 0.05, 0.22, 1.15, 0.35), out);
      for (const [f, cents, type, a] of [[311, -8, 'sawtooth', 1], [311, 9, 'square', 0.5], [370, -6, 'sawtooth', 1], [370, 7, 'square', 0.5], [155.5, 0, 'sawtooth', 0.5]]) {
        const o = osc(c, type, f * 0.975, t, 1.7);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
        o.detune.value = cents;
        chain(o, gain(c, a * 0.4), lp);
      }
    },
    /* a brass section: six notes up, the last one held in harmony over a drum and a cymbal */
    fanfare(c, out, t) {
      const n = [[-7, 0, 0.15], [-4, 0.15, 0.15], [0, 0.3, 0.15], [5, 0.45, 0.2], [3, 0.68, 0.2], [5, 0.92, 0.9]];
      for (const [s, at, d] of n) {
        brass(c, out, t + at, hz(s), d, 0.13);
        brass(c, out, t + at, hz(s - 12), d, 0.07);
      }
      for (const s of [-4, 0]) brass(c, out, t + 0.92, hz(s), 0.9, 0.075);
      timpani(c, out, t + 0.92, hz(-31), 0.35);
      cymbal(c, out, t + 0.92, 0.12, 1.3);
    },
    /* the sad trombone: four steps down, the last one sagging */
    lose(c, out, t) {
      [[1, 0], [0, 0.3], [-1, 0.6], [-2, 0.9]].forEach(([s, at], i) => {
        const last = i === 3, dur = last ? 0.95 : 0.26, f = hz(s - 12), lp = filter(c, 'lowpass', 1500, 2), o = osc(c, 'sawtooth', f, t + at, dur + 0.1);
        lp.frequency.setValueAtTime(1500, t + at);
        lp.frequency.exponentialRampToValueAtTime(last ? 320 : 700, t + at + dur);
        if (last) o.frequency.exponentialRampToValueAtTime(f * 0.86, t + at + dur);
        chain(o, lp, envHold(c, t + at, 0.03, 0.2, dur - 0.08, 0.1), out);
      });
    },
    /* crowd one-shots, used only until the rendered crowd is ready */
    groan(c, out, t, o) {
      const a = o && o.amount !== undefined ? o.amount : 1, bp = filter(c, 'bandpass', 540, 1.3);
      bp.frequency.setValueAtTime(540, t);
      bp.frequency.exponentialRampToValueAtTime(250, t + 1.1);
      chain(noise(c, 'pink', t, 1.5, 0.8), bp, env(c, t, 0.14, 0.9 * a, 1.25), out);
    },
    ooh(c, out, t, o) {
      const a = o && o.amount !== undefined ? o.amount : 1, bp = filter(c, 'bandpass', 460, 1.5);
      bp.frequency.setValueAtTime(460, t);
      bp.frequency.linearRampToValueAtTime(640, t + 0.18);
      bp.frequency.linearRampToValueAtTime(400, t + 0.7);
      chain(noise(c, 'pink', t, 0.9), bp, env(c, t, 0.08, 0.9 * a, 0.7), out);
    },
    /* a stadium organ riff: a rising run that stops on a held note, leaving room for the crowd to answer */
    organ(c, out, t) {
      const notes = [[-7, 0, 0.13], [-3, 0.14, 0.13], [0, 0.28, 0.13], [5, 0.42, 0.13], [0, 0.56, 0.1], [5, 0.68, 0.55]];  // D4 F#4 A4 D5 A4 D5
      const trem = osc(c, 'sine', 6.3, t, 1.5), wob = gain(c, 0.12), all = gain(c, 0.88);
      chain(trem, wob, all.gain);  // the spinning speaker
      all.connect(out);
      for (const [semi, at, dur] of notes) {
        const g = envHold(c, t + at, 0.01, 0.22, dur, 0.06);
        g.connect(all);
        [[0.5, 0.5], [1, 1], [2, 0.6], [3, 0.35], [4, 0.2], [6, 0.1]].forEach(([h, a]) => {
          const o = osc(c, 'sine', hz(semi) * h, t + at, dur + 0.08);
          o.detune.value = Math.sin(h * 3.1) * 5;
          chain(o, gain(c, a * 0.5), g);
        });
      }
    },
    /* one stomp of a few thousand feet on aluminum */
    stomp(c, out, t, o) {
      const lvl = o && o.level !== undefined ? o.level : 0.5, sw = osc(c, 'sine', 92, t, 0.22);
      sw.frequency.exponentialRampToValueAtTime(44, t + 0.14);
      chain(sw, env(c, t, 0.004, lvl * 0.7, 0.2), out);
      chain(noise(c, 'pink', t, 0.14), filter(c, 'lowpass', 380, 0.6), env(c, t, 0.004, lvl * 0.6, 0.12), out);
      chain(noise(c, 'white', t, 0.12), filter(c, 'bandpass', 560, 1), env(c, t, 0.003, lvl * 1.8, 0.1), out);  // the boards
      chain(noise(c, 'white', t, 0.09), filter(c, 'bandpass', 950, 3), env(c, t, 0.002, lvl * 1.2, 0.07), out);  // the stand rattling
    },
    /* a few hundred pairs of hands, nearly together */
    clap(c, out, t, o) {
      const lvl = o && o.level !== undefined ? o.level : 0.3;
      for (let i = 0; i < 14; i++) {
        const at = t + Math.random() * 0.045;
        chain(noise(c, 'white', at, 0.05), filter(c, 'bandpass', rnd(1100, 2500), 1.2), env(c, at, 0.001, lvl * rnd(0.4, 1), 0.035), pan(c, rnd(-0.8, 0.8)), out);
      }
    },
    /* the quarterback before the snap: "Rea-dy ... SET!" (the "Hut!" is `snap`) */
    cadence(c, out, t) {
      bark(c, out, t, { f0: 152, f1: 140, dur: 0.11, vowel: 'e', amp: 0.16, breath: 0.25 });
      bark(c, out, t + 0.13, { f0: 144, f1: 130, dur: 0.12, vowel: 'i', amp: 0.14, breath: 0.2 });
      chain(noise(c, 'white', t + 0.5, 0.08), filter(c, 'highpass', 4500), env(c, t + 0.5, 0.02, 0.1, 0.05), out);
      bark(c, out, t + 0.57, { f0: 176, f1: 152, dur: 0.13, vowel: 'e', amp: 0.24, breath: 0.3 });
      chain(noise(c, 'white', t + 0.7, 0.03), filter(c, 'highpass', 3500), env(c, t + 0.7, 0.001, 0.12, 0.018), out);
    },
    /* changing the play at the line: two sharp shouts */
    audible(c, out, t) {
      for (const at of [0, 0.19]) {
        chain(noise(c, 'white', t + at, 0.02), filter(c, 'bandpass', 2600, 1.5), env(c, t + at, 0.001, 0.14, 0.012), out);
        bark(c, out, t + at + 0.012, { f0: 196, f1: 170, dur: 0.11, vowel: 'i', amp: 0.4, breath: 0.25, scale: 1.05 });
      }
    },
    /* the snap: ten big men meet ten big men. Several hits within a tenth of a second across the width of the line, and grunts */
    crash(c, out, t) {
      for (let i = 0; i < 5; i++) {
        const p = pan(c, rnd(-0.6, 0.6)), g = gain(c, 0.6);
        chain(p, g, out);
        SFX.hit(c, p, t + 0.1 + rnd(0, 0.09), { power: rnd(0.3, 0.55) });
      }
      for (let i = 0; i < 2; i++) bark(c, out, t + 0.12 + rnd(0, 0.1), { f0: rnd(105, 140), f1: rnd(78, 95), dur: 0.13, vowel: 'uh', amp: 0.1 });
    },
    /* a loose ball: everybody near it shouts at once */
    shout(c, out, t) {
      for (let i = 0; i < 4; i++) bark(c, out, t + i * 0.11 + rnd(0, 0.04), { f0: rnd(170, 240), f1: rnd(150, 200), dur: 0.12, vowel: 'a', amp: 0.2, breath: 0.25, scale: 1.1 });
    },
    /* the home team scores: the cannon behind the end zone, then fireworks crackling out */
    boom(c, out, t) {
      const th = osc(c, 'sine', 72, t, 0.8);
      th.frequency.exponentialRampToValueAtTime(30, t + 0.5);
      chain(th, env(c, t, 0.004, 0.65, 0.7), out);
      chain(noise(c, 'brown', t, 0.7), filter(c, 'lowpass', 240, 0.7), env(c, t, 0.004, 0.35, 0.6), out);
      chain(noise(c, 'white', t, 0.2), filter(c, 'bandpass', 520, 0.7), env(c, t, 0.002, 0.9, 0.16), out);  // the crack of it, for small speakers
      for (let i = 0; i < 16; i++) {
        const at = t + 0.5 + Math.pow(Math.random(), 0.7) * 1.3;
        chain(noise(c, 'white', at, 0.03), filter(c, 'highpass', rnd(2200, 5000)), env(c, at, 0.001, rnd(0.06, 0.16), 0.02), pan(c, rnd(-0.9, 0.9)), out);
      }
    },
    /* the drum line before a kickoff: a snare roll that grows, a boom and a cymbal as the ball is struck */
    roll(c, out, t, o) {
      const dur = o && o.dur || 1.1;
      for (let at = 0; at < dur;) {
        const k = at / dur;
        DRUM.snare(c, out, t + at, 0.14 + 0.4 * k * k);
        at += lerp(0.078, 0.042, k);
      }
      DRUM.kick(c, out, t + dur, 0.6);
      cymbal(c, out, t + dur, 0.12, 1.1);
    },
    /* the referee switches his microphone on: the click, a thump in the speakers, the open channel and a ring of feedback */
    mic(c, out, t) {
      chain(noise(c, 'white', t, 0.03), filter(c, 'bandpass', 1800, 1.2), env(c, t, 0.001, 0.9, 0.02), out);
      chain(osc(c, 'sine', 210, t, 0.1), env(c, t, 0.002, 0.5, 0.08), out);
      chain(noise(c, 'pink', t + 0.03, 0.5), filter(c, 'bandpass', 900, 0.8), envHold(c, t + 0.03, 0.05, 0.09, 0.3, 0.15), out);
      chain(osc(c, 'sine', 2350, t + 0.05, 0.36), env(c, t + 0.05, 0.08, 0.05, 0.28), out);
    },
    /* far-off thunder, for a wet night */
    thunder(c, out, t) {
      chain(noise(c, 'brown', t, 3.4), filter(c, 'lowpass', 170, 0.7), envHold(c, t, 0.18, 0.045, 0.5, 2.6), out);
      chain(noise(c, 'pink', t, 2.4), filter(c, 'bandpass', 320, 0.6), envHold(c, t, 0.15, 0.3, 0.3, 1.8), out);  // the part of it a small speaker can play
      chain(noise(c, 'pink', t + 0.05, 0.4), filter(c, 'bandpass', 700, 0.8), env(c, t + 0.05, 0.03, 0.06, 0.3), out);
    },
  };

  /* where each effect is heard: most on the field, the interface up close and dry, the horn and organ over the speakers */
  const ROUTE = { tick: 'ui', ok: 'ui', buy: 'ui', chime: 'ui', horn: 'pa', organ: 'pa', mic: 'pa', roll: 'stands' };

  function clamp01(v) {
    return v < 0 ? 0 : v > 1.5 ? 1.5 : v;
  }

  /* ---------- a voice on the stadium speakers ----------
     Not a recording, and not the phone's speech voice (that one cannot be given an echo). The words are turned, roughly,
     into the vowels and consonants they are spelled with and spoken through one mouth, then sent down the speakers'
     route: a band of mid-range, a slap of echo off the far stand, the stadium's reverb. From the seats you never quite
     catch a referee's words either. You get their rhythm and their tune, the banner on screen says what was called, and
     the commentator repeats it. */
  const SPELL = [[/^(ou|ow)/, ['a', 'u']], [/^(ai|ay|ey|ei)/, ['e', 'i']], [/^(ee|ea|ie)/, ['i']], [/^(oo|ue|ew)/, ['u']], [/^(oa|oe)/, ['o']], [/^igh/, ['a', 'i']],
    [/^a/, ['ae']], [/^e/, ['e']], [/^i/, ['i']], [/^o/, ['o']], [/^u/, ['uh']], [/^y/, ['i']]];
  const HISS = /^(sh|ch|th|s|f|z|x|h)/, STOP = /^[ptkcqbdgj]/;

  /* text to syllables: [{ v: the vowels the mouth moves through, on: the consonant before ('hiss', 'stop' or ''),
     coda: the one after the word's last vowel, stress: first syllable of its word, gap: the pause that follows }] */
  function paWords(text) {
    const out = [];
    for (const raw of String(text).toLowerCase().split(/\s+/)) {
      const word = raw.replace(/[^a-z]/g, ''), gap = /[.!?]$/.test(raw) ? 0.34 : /[,;:]$/.test(raw) ? 0.17 : 0.04, n0 = out.length;
      let i = 0, onset = '';
      while (i < word.length) {
        const rest = word.slice(i);
        if (rest === 'e' && out.length > n0) break;  // a silent e
        const m = /^[aeiouy]/.test(rest) && !(rest[0] === 'y' && i === 0) && SPELL.find(x => x[0].test(rest));
        if (m) {
          out.push({ v: m[1], on: onset, coda: '', stress: out.length === n0, gap: 0 });
          onset = '';
          i += m[0].exec(rest)[0].length;
        } else {
          const h = HISS.exec(rest);
          onset = h ? 'hiss' : STOP.test(rest) ? 'stop' : onset;
          i += h ? h[0].length : 1;
        }
      }
      if (out.length > n0) {
        out[out.length - 1].gap = gap;
        out[out.length - 1].coda = onset;
      }
    }
    return out;
  }

  /* speak `text` into `out` from time t; returns how long it takes */
  function paVoice(c, out, t, text) {
    const syl = paWords(text), path = [], voiced = [], noises = [];
    if (!syl.length) return 0;
    let at = 0.02, f = 128;
    for (const s of syl) {
      if (s.on) {
        noises.push([s.on, at]);
        at += s.on === 'hiss' ? 0.06 : 0.025;
      }
      const dur = (s.stress ? 0.17 : 0.12) + (s.v.length > 1 ? 0.07 : 0), last = s.gap > 0.3;
      path.push([t + at, s.v[0]], [t + at + dur * (s.v.length > 1 ? 0.4 : 0.8), s.v[0]]);
      if (s.v.length > 1) path.push([t + at + dur * 0.9, s.v[1]]);
      voiced.push([at, dur, f * (s.stress ? 1.07 : 1), last]);
      at += dur;
      if (s.coda) {
        noises.push([s.coda, at + 0.005]);
        at += s.coda === 'hiss' ? 0.075 : 0.03;
      }
      at += s.gap;
      f = last ? 128 : Math.max(98, f - 3.5);  // each sentence starts high and sinks, as speech does
    }
    const m = mouth(c, out, path, 1, 0);
    for (const [a, dur, hz0, last] of voiced) syllable(c, m, t + a, dur, hz0 * 1.02, hz0, hz0 * (last ? 0.8 : 0.96), 1.05, 0.025, 0.05);
    for (const [kind, a] of noises) {
      if (kind === 'hiss') chain(noise(c, 'white', t + a, 0.08), filter(c, 'bandpass', 3000, 0.9), env(c, t + a, 0.015, 0.11, 0.06), out);
      else chain(noise(c, 'white', t + a, 0.03), filter(c, 'bandpass', 1700, 1.2), env(c, t + a, 0.001, 0.2, 0.015), out);
    }
    return at;
  }

  /* ---------- the crowd, live ---------- */

  /* Everything the crowd is made of, wired to gains the game can move: bed (murmur), roar and hiss (cheering),
     clap (applause), air (the room). With no rendered stems yet, bed and roar fall back to bands of noise. */
  function buildCrowd(c, t, seconds, st) {
    const out = gain(c, 0.0001), n = { out, srcs: [], bed: gain(c, 0), roar: gain(c, 0), hiss: gain(c, 0), clap: gain(c, 0), air: gain(c, 0) };
    /* the voices get some presence: a crowd heard in the open is brighter than one man in a room */
    const presence = filter(c, 'highshelf', 1500);
    presence.gain.value = 7;
    presence.connect(out);
    for (const g of [n.bed, n.roar]) g.connect(presence);
    for (const g of [n.hiss, n.clap, n.air]) g.connect(out);
    const src = (color, rate) => {
      const s = noise(c, color, t, seconds, rate);
      n.srcs.push(s);
      return s;
    };
    const loop = (buf, rate, offset, lvl, into) => {
      const s = c.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.playbackRate.value = rate;
      chain(s, gain(c, lvl), into);
      s.start(t, offset % buf.duration);
      s.stop(t + seconds);
      n.srcs.push(s);
    };
    chain(src('pink'), filter(c, 'bandpass', 480, 0.4), gain(c, 1), n.air);
    chain(src('white'), filter(c, 'highpass', 3400), gain(c, 0.05), n.air);
    const far = src('pink', 0.9);  // the thousands too far away to be voices
    chain(far, filter(c, 'bandpass', 850, 0.5), gain(c, 0.9), n.hiss);
    chain(far, filter(c, 'bandpass', 2100, 0.7), gain(c, 0.5), n.hiss);
    if (st) {
      /* each loop twice, at slightly different speeds and out of step, so it never lines up with itself */
      loop(st.walla, 1, 0, 0.75, n.bed);
      loop(st.walla, 0.93, 3.3, 0.65, n.bed);
      loop(st.roar, 1, 0, 0.75, n.roar);
      loop(st.roar, 1.07, 2.2, 0.65, n.roar);
      loop(st.clap, 1, 0, 1, n.clap);
    } else {
      chain(src('pink'), filter(c, 'bandpass', 430, 0.5), gain(c, 0.5), n.bed);
      chain(src('pink', 0.71), filter(c, 'bandpass', 1150, 0.7), gain(c, 0.3), n.bed);
      chain(far, filter(c, 'bandpass', 1300, 0.9), n.roar);
    }
    return n;
  }

  /* how loud a cheer of size a (0 to about 1.4) makes the roar, the far-off hiss and the applause */
  const CHEER = { roar: a => 0.22 + 0.5 * a, hiss: a => 0.18 + 0.5 * a, clap: a => 0.6 * Math.min(1, a) };

  /* gains for an excitement level from 0 (a quiet stadium between plays) to 1 (everyone on their feet) */
  const crowdMix = lv => ({ bed: 0.27 + 0.4 * lv, air: 0.09 + 0.11 * lv, floor: Math.max(0, lv - 0.5) * 0.35 });

  /* what the game asked for, newest last: tests read it (it fills whether or not sound is switched on) */
  const asked = [];
  const note = what => {
    asked.push(what);
    if (asked.length > 60) asked.shift();
  };

  const crowd = {
    nodes: null, level: 0.3, timer: null, clapTimer: null, rising: false,
    start() {
      if (!ctx || !S.snd || this.nodes) return;
      wantStems();
      const c = ctx, t = c.currentTime;
      this.nodes = buildCrowd(c, t, 86400, stems);
      this.nodes.out.connect(bus.crowd);
      this.nodes.out.gain.setTargetAtTime(1, t, 0.5);
      this.set(this.level, 0.5);
      /* small swells and the odd lone voice keep it from sounding like a loop */
      this.timer = setInterval(() => {
        if (!this.nodes || ctx.state !== 'running') return;
        const now = ctx.currentTime, m = crowdMix(this.level);
        this.nodes.bed.gain.setTargetAtTime(m.bed * rnd(0.85, 1.15), now, 0.4);
        const r = Math.random();
        if (r < 0.05) bark(ctx, bus.crowd, now, { f0: rnd(380, 520), f1: rnd(620, 900), dur: 0.3, vowel: 'u', amp: 0.035, breath: 0.1, scale: 1.2 });  // a whoop
        else if (r < 0.08) {
          // a fan's whistle: two rising chirps
          for (const at of [0, 0.16]) {
            const o = osc(ctx, 'sine', 2100, now + at, 0.14);
            o.frequency.exponentialRampToValueAtTime(3200, now + at + 0.1);
            chain(o, env(ctx, now + at, 0.02, 0.02, 0.1), pan(ctx, rnd(-0.9, 0.9)), bus.crowd);
          }
        } else if (r < 0.1) bark(ctx, bus.crowd, now, { f0: rnd(150, 240), f1: rnd(130, 200), dur: 0.22, vowel: pickOf(['e', 'a', 'o']), amp: 0.03, scale: 1.1 });  // somebody shouting something
      }, 650);
    },
    /* 0 = a quiet stadium between plays, 1 = everyone on their feet */
    set(level, time) {
      this.level = Math.max(0, Math.min(1, level));
      const n = this.nodes;
      if (!n) return;
      const t = ctx.currentTime, m = crowdMix(this.level), tc = (time || 1.2) / 3;
      n.bed.gain.setTargetAtTime(m.bed, t, tc);
      n.air.gain.setTargetAtTime(m.air, t, tc);
      if (!(this.busyUntil > t)) {
        n.roar.gain.setTargetAtTime(m.floor, t, tc);
        n.hiss.gain.setTargetAtTime(m.floor * 0.8, t, tc);
      }
    },
    /* the crowd gets up: a roar that swells at once and sinks back, applause arriving a beat later and lasting longer */
    cheer(amount, dur) {
      const n = this.nodes;
      if (!n || !S.snd) return;
      const a = Math.min(1.4, amount === undefined ? 1 : amount), d = dur || 3, t = ctx.currentTime, floor = crowdMix(this.level).floor;
      const swell = (p, peak, rest, delay, hold) => {
        p.cancelScheduledValues(t);
        p.setTargetAtTime(peak, t + delay, 0.09);
        p.setTargetAtTime(rest, t + delay + d * hold, d * 0.28);
      };
      swell(n.roar.gain, CHEER.roar(a), floor, 0, 0.45);
      swell(n.hiss.gain, CHEER.hiss(a), floor * 0.8, 0, 0.45);
      swell(n.clap.gain, CHEER.clap(a), 0, 0.25, 0.7);
      this.busyUntil = t + d;
    },
    /* a rendered reaction, or the noise version while the render is not ready */
    react(name, amount) {
      if (!ctx || !S.snd || ctx.state !== 'running') return;
      const a = amount === undefined ? 1 : amount;
      if (!stems) return play(name, { amount: a });
      const s = ctx.createBufferSource();
      s.buffer = stems[name];
      chain(s, gain(ctx, Math.min(1, 0.3 + 0.55 * a)), bus.crowd);
      s.start();
    },
    groan(amount) {
      this.react('groan', amount);
    },
    ooh(amount) {
      this.react('ooh', amount);
    },
    /* a call against the home team; a groan stands in until the rendered crowd is ready */
    boo(amount) {
      note('boo');
      const a = amount === undefined ? 1 : amount;
      if (!this.stem('boo', Math.min(1, 0.35 + 0.55 * a))) this.groan(a);
    },
    /* The visitors come to the line on a big down: the whole stadium makes all the noise it can, building until the
       ball is snapped. settle() lets it fall away again. */
    rise(seconds) {
      note('rise');
      const n = this.nodes;
      if (!n || !S.snd) return;
      const t = ctx.currentTime, tc = (seconds || 2.2) / 3;
      for (const [p, v] of [[n.roar.gain, 0.44], [n.hiss.gain, 0.38]]) {
        p.cancelScheduledValues(t);
        p.setTargetAtTime(v, t, tc);
      }
      this.busyUntil = t + 9;  // set() leaves the roar alone until the snap
      this.rising = true;
    },
    settle() {
      if (!this.rising) return;
      this.rising = false;
      const n = this.nodes;
      if (!n) return;
      const t = ctx.currentTime, floor = crowdMix(this.level).floor;
      n.roar.gain.cancelScheduledValues(t);
      n.roar.gain.setTargetAtTime(floor, t, 0.45);
      n.hiss.gain.cancelScheduledValues(t);
      n.hiss.gain.setTargetAtTime(floor * 0.8, t, 0.45);
      this.busyUntil = 0;
    },
    /* a long ball is in the air: one rising "ohhh", timed to top out as it comes down */
    swell(seconds, lvl) {
      note('swell');
      this.stem('kickoh', lvl || 0.5, 0, Math.max(0.75, Math.min(1.5, 1.72 / Math.max(0.5, seconds || 1.7))));
    },
    /* claps that speed up toward the snap */
    clapBuild(seconds) {
      this.stopClaps();
      if (!this.nodes || !S.snd) return;
      const t0 = ctx.currentTime, total = seconds || 3;
      const next = () => {
        if (!this.nodes) return;
        const k = Math.min(1, (ctx.currentTime - t0) / total);
        SFX.clap(ctx, bus.crowd, ctx.currentTime + 0.001, { level: 0.16 + 0.22 * k });
        if (k < 1) this.clapTimer = setTimeout(next, 560 - 380 * k);
      };
      next();
    },
    stopClaps() {
      clearTimeout(this.clapTimer);
      this.clapTimer = null;
    },
    /* one rendered stem through the crowd bus at a time and level; false while the render is not ready */
    stem(name, lvl, at, rate) {
      if (!ctx || !S.snd || ctx.state !== 'running' || !stems || !stems[name]) return false;
      const s = ctx.createBufferSource();
      s.buffer = stems[name];
      if (rate) s.playbackRate.value = rate;
      chain(s, gain(ctx, lvl), bus.crowd);
      s.start(at || 0);
      return true;
    },
    /* the kicker's run-up: a long "ohhh" that swells to the kick */
    kickoff() {
      this.stem('kickoh', 0.8);
    },
    /* the home crowd behind its offense: "LET'S GO!", clap, clap, clap-clap-clap */
    letsgo(bars) {
      if (!this.nodes || !S.snd) return;
      const t = ctx.currentTime + 0.05;
      for (let i = 0; i < (bars || 2); i++) {
        const b = t + i * 2.5, lvl = 0.55 + i * 0.12;
        this.stem('letsgo', lvl, b);
        for (const at of [1.1, 1.45, 1.8, 1.975, 2.15]) SFX.clap(ctx, bus.crowd, b + at, { level: 0.24 * lvl });
      }
    },
    /* the home crowd getting behind its defense: "DE-FENSE", stomp, stomp */
    chant(bars) {
      if (!this.nodes || !S.snd) return;
      const t = ctx.currentTime + 0.05, n = bars || 3;
      for (let i = 0; i < n; i++) {
        const b = t + i * 1.72, lvl = 0.5 + i * 0.12;
        if (stems) {
          const s = ctx.createBufferSource();
          s.buffer = stems.chant;
          chain(s, gain(ctx, lvl), bus.crowd);
          s.start(b);
        } else {
          SFX.stomp(ctx, bus.crowd, b, { level: 0.4 });
          SFX.stomp(ctx, bus.crowd, b + 0.4, { level: 0.4 });
        }
        SFX.stomp(ctx, bus.crowd, b + 1.02, { level: 0.45 * lvl });
        SFX.clap(ctx, bus.crowd, b + 1.02, { level: 0.2 * lvl });
        SFX.stomp(ctx, bus.crowd, b + 1.36, { level: 0.45 * lvl });
        SFX.clap(ctx, bus.crowd, b + 1.36, { level: 0.2 * lvl });
      }
    },
    stop(fade) {
      this.stopClaps();
      clearInterval(this.timer);
      this.timer = null;
      this.busyUntil = 0;
      this.rising = false;
      const n = this.nodes;
      this.nodes = null;
      if (n && ctx) {
        n.out.gain.setTargetAtTime(0.0001, ctx.currentTime, fade || 0.2);
        setTimeout(() => {
          try {
            n.out.disconnect();
            for (const s of n.srcs) s.stop();
          } catch (_) {}
        }, 1000 + (fade || 0.2) * 3000);
      }
    },
  };

  /* ---------- music: the menu theme ----------
     D minor at 104 beats a minute, sixteen bars: eight of a theme over Dm, Bb, F, C, then eight that climb through
     Gm, Dm and Bb to the dominant and fall back into the theme. Drums, a bass, a soft pad, brass. */
  const BPM = 104, STEP = 60 / BPM / 4, BARS = 16;
  const KICK = 'x.....x...x.....x.....x.x.x.....';  // two bars of sixteenths
  const SNARE = '....x..g.g..x.gg....x..g.gg.x..g';
  const CHORDS = [[-7, [-7, -4, 0]], [-11, [-11, -7, -4]], [-4, [-4, 0, 3]], [-9, [-9, -5, -2]], [-14, [-14, -11, -7]], [-7, [-7, -4, 0]], [-11, [-11, -7, -4]], [-12, [-12, -8, -5]]];

  /* the tune, one list per two-bar phrase: [step within the phrase, semitones from A4, length in steps] */
  const TUNE = [
    [[0, 5, 3], [3, 5, 1], [4, 8, 4], [8, 12, 6], [14, 10, 2], [16, 8, 6], [24, 5, 6]],
    [[0, 5, 3], [3, 5, 1], [4, 8, 4], [8, 13, 6], [14, 12, 2], [16, 10, 8], [26, 8, 2], [28, 10, 4]],
    [[0, 12, 3], [3, 12, 1], [4, 15, 4], [8, 17, 6], [14, 15, 2], [16, 12, 6], [24, 8, 6]],
    [[0, 10, 3], [3, 10, 1], [4, 12, 4], [8, 15, 6], [14, 12, 2], [16, 10, 4], [20, 7, 4], [24, 10, 8]],
    [[0, 10, 2], [4, 10, 2], [6, 13, 6], [16, 10, 2], [20, 10, 2], [22, 15, 6]],
    [[0, 12, 2], [4, 12, 2], [6, 8, 6], [16, 5, 4], [20, 8, 4], [24, 12, 6]],
    [[0, 13, 2], [4, 13, 2], [6, 17, 6], [16, 13, 2], [20, 13, 2], [22, 20, 8]],
    [[0, 19, 4], [4, 16, 4], [8, 12, 4], [12, 16, 4], [16, 19, 6], [24, 24, 8]],
  ];
  const BASS = { 0: 0, 3: 0, 6: 0, 8: 12, 10: 0, 12: 0, 14: 7 };  // step in the bar: semitones above the root

  /* everything that happens on one sixteenth-note step of the loop */
  function musicStep(c, out, i, t) {
    const s = i % 32, inBar = i % 16, bar = Math.floor(i / 16), phrase = Math.floor(bar / 2) % 8, at = i % 32, fill = bar % 8 === 7;
    const [root, notes] = CHORDS[phrase];
    /* drums */
    if (KICK[s] === 'x' && !(fill && inBar >= 8)) DRUM.kick(c, out, t, 0.8);
    if (fill && inBar >= 8) DRUM.tom(c, out, t, 0.55 + inBar * 0.03, [210, 210, 175, 175, 140, 140, 105, 105][inBar - 8]);  // a run down the toms into the next section
    else if (SNARE[s] === 'x') DRUM.snare(c, out, t, 0.85);
    else if (SNARE[s] === 'g') DRUM.snare(c, out, t, 0.28);
    if (inBar % 2 === 0) DRUM.hat(c, out, t, inBar % 4 === 0 ? 1 : 0.6, inBar === 14 && bar % 2 === 1);
    if (i % 128 === 0) cymbal(c, out, t, 0.11, 1.4);  // a crash where each half begins
    /* bass: root, octave and fifth, tucked under the kick */
    if (BASS[inBar] !== undefined) {
      const f = hz(root - 24 + BASS[inBar]), lp = filter(c, 'lowpass', 420, 2), o = osc(c, 'sawtooth', f, t, 0.24);
      lp.frequency.setValueAtTime(1400, t);
      lp.frequency.exponentialRampToValueAtTime(420, t + 0.2);
      chain(o, lp, env(c, t, 0.005, 0.3, 0.24), out);
      chain(osc(c, 'square', f * 2, t, 0.2), gain(c, 0.3), lp);  // an octave up, so the line is still there on a phone
      chain(osc(c, 'sine', f / 2, t, 0.24), env(c, t, 0.005, 0.2, 0.24), out);
    }
    /* pad: the chord held soft for the two bars */
    if (at === 0) for (const n of notes) {
      const lp = filter(c, 'lowpass', 1100, 0.7), g = envHold(c, t, 0.25, 0.045, STEP * 28, 0.5);
      chain(lp, g, out);
      for (const cents of [-11, 10]) {
        const o = osc(c, 'sawtooth', hz(n), t, STEP * 34);
        o.detune.value = cents;
        o.connect(lp);
      }
    }
    /* brass: a stab on the downbeat and a pickup, the timpani under it, and the tune on top in octaves */
    if (at === 0) {
      for (const n of notes) brass(c, out, t, hz(n - 12), STEP * 3, 0.075);
      timpani(c, out, t, hz(root - 24), 0.2);
    }
    if (at === 22) for (const n of notes) brass(c, out, t, hz(n - 12), STEP * 2, 0.06);
    for (const [st, semi, len] of TUNE[phrase]) if (st === at) {
      brass(c, out, t, hz(semi), STEP * len * 0.92, 0.13);
      brass(c, out, t, hz(semi - 12), STEP * len * 0.92, 0.065);
    }
  }

  /* The band in the stands, between plays: a drum cadence, the "Charge!" bugle call, or a phrase of the fight song (the
     menu theme, as a marching band would play it). Returns how long the piece lasts. */
  function bandPiece(c, out, t, which) {
    if (which === 3) return halftimeShow(c, out, t);
    if (which === 0) {
      const s16 = 0.118;
      [...'x.xxx.x.xxx.xxxxx.xxx.x.xxxxxx..'].forEach((ch, i) => {
        if (ch === 'x') DRUM.snare(c, out, t + i * s16, i % 4 === 0 ? 0.9 : 0.5);
      });
      [...'x...x...x...x.x.x...x...x.x.x...'].forEach((ch, i) => {
        if (ch === 'x') DRUM.kick(c, out, t + i * s16, 0.38);
      });
      cymbal(c, out, t + 30 * s16, 0.1, 0.9);
      return 32 * s16;
    }
    if (which === 1) {
      for (const [semi, at, d] of [[-2, 0, 0.14], [3, 0.15, 0.14], [7, 0.3, 0.14], [10, 0.45, 0.27], [7, 0.75, 0.13], [10, 0.9, 0.75]]) {
        brass(c, out, t + at, hz(semi), d, 0.2);
        brass(c, out, t + at, hz(semi - 12), d, 0.1);
      }
      return 1.75;  // and then the crowd answers
    }
    for (const [st, semi, len] of TUNE[0].concat(TUNE[1].map(n => [n[0] + 32, n[1], n[2]]))) {
      brass(c, out, t + st * STEP, hz(semi), STEP * len * 0.9, 0.16);
      brass(c, out, t + st * STEP, hz(semi - 12), STEP * len * 0.9, 0.08);
    }
    for (let i = 0; i < 64; i += 4) {
      if (i % 8 === 0) DRUM.kick(c, out, t + i * STEP, 0.4);
      else DRUM.snare(c, out, t + i * STEP, 0.6);
    }
    return 64 * STEP;
  }

  /* Halftime: the band takes the field. Two bars from the drum line, then the fight song at a march (the tune in the
     brass with bells on top, tubas and bass drum on the beat, horns and snares off it), and a last chord that says
     "applaud now". About sixteen seconds. */
  function halftimeShow(c, out, t) {
    const st = 60 / 116 / 4, intro = 32;
    [...'x..xx.x.x.xxx.xxx..xx.x.xxxxxxxx'].forEach((ch, i) => {
      if (ch === 'x') DRUM.snare(c, out, t + i * st, i % 8 === 0 ? 0.9 : i >= 24 ? 0.35 + (i - 24) * 0.07 : 0.5);
    });
    [...'x.......x.......x...x...x.x.x.x.'].forEach((ch, i) => {
      if (ch === 'x') DRUM.kick(c, out, t + i * st, 0.36);
    });
    [[20, 190], [22, 160], [28, 190], [29, 160], [30, 130], [31, 105]].forEach(([i, f]) => DRUM.tom(c, out, t + i * st, 0.5, f));
    [0, 1, 7].forEach((ph, k) => {
      const t0 = t + (intro + k * 32) * st, [root, notes] = CHORDS[ph];
      cymbal(c, out, t0, 0.12, 1.2);
      for (const [s, semi, len] of TUNE[ph]) {
        brass(c, out, t0 + s * st, hz(semi), st * len * 0.9, 0.15);
        brass(c, out, t0 + s * st, hz(semi - 12), st * len * 0.9, 0.08);
        bell(c, out, t0 + s * st, hz(semi + 12), Math.min(0.5, st * len), 0.05);
      }
      for (let i = 0; i < 32; i++) {
        const at = t0 + i * st;
        if (i % 8 === 0) {
          brass(c, out, at, hz(root - 12 + (i % 16 ? -5 : 0)), st * 3, 0.1);  // the tubas: root, then the fifth below it
          DRUM.kick(c, out, at, 0.34);
        } else if (i % 8 === 4) for (const n of notes) brass(c, out, at, hz(n - 12), st * 1.6, 0.05);  // the horns answer
        if ('x.xxx.xxx.xxx.xx'[i % 16] === 'x') DRUM.snare(c, out, at, i % 8 === 4 ? 0.75 : 0.36);
      }
    });
    const end = t + (intro + 96) * st;
    for (const semi of [-19, -7, -4, 0, 5]) brass(c, out, end, hz(semi), 0.75, semi < -10 ? 0.12 : 0.1);
    timpani(c, out, end, hz(-19), 0.3);
    DRUM.kick(c, out, end, 0.5);
    cymbal(c, out, end, 0.16, 1.6);
    return (intro + 96) * st + 0.9;
  }

  const music = {
    timer: null, next: 0, step: 0, out: null,
    start() {
      if (!ctx || !S.mus || this.timer) return;
      this.out = gain(ctx, 0.0001);
      this.out.connect(bus.music);
      this.out.gain.setTargetAtTime(1, ctx.currentTime, 0.4);
      this.next = ctx.currentTime + 0.08;
      this.step = 0;
      this.timer = setInterval(() => {
        if (ctx.state !== 'running') return;
        if (this.next < ctx.currentTime) this.next = ctx.currentTime + 0.05;  // came back from a pause
        while (this.next < ctx.currentTime + 0.14) {
          musicStep(ctx, this.out, this.step, this.next);
          this.next += STEP;
          this.step = (this.step + 1) % (BARS * 16);
        }
      }, 30);
    },
    stop() {
      clearInterval(this.timer);
      this.timer = null;
      const o = this.out;
      this.out = null;
      if (o && ctx) {
        o.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.12);
        setTimeout(() => {
          try {
            o.disconnect();
          } catch (_) {}
        }, 900);
      }
    },
  };

  /* ---------- announcer ----------
     Short calls on the big moments. There are no recordings: the words go to the device's speech synthesizer,
     so the voice is whatever the phone or computer has. The crowd dips while he talks. Settings can turn it off. */
  const ann = {
    voice: null, primed: false, log: [],
    /* the best English voice the device has: the newer "natural" voices first, then known good ones, then any */
    pickVoice() {
      const all = (window.speechSynthesis && speechSynthesis.getVoices()) || [], en = all.filter(v => /^en/i.test(v.lang));
      const want = [/Natural.*(Guy|Christopher|Eric|Andrew|Brian)/i, /(Evan|Tom|Nathan|Aaron|Daniel).*(Enhanced|Premium)/i, /Enhanced|Premium|Natural|Neural/i, /Daniel/, /Aaron/, /Alex/, /Google UK English Male/, /Microsoft (Guy|David|Ryan)/,
        /Google US English/, /Samantha/];
      for (const re of want) {
        const v = en.find(x => re.test(x.name));
        if (v) {
          this.voice = v;
          return;
        }
      }
      this.voice = en.find(v => /en-US/i.test(v.lang)) || en[0] || null;
    },
    /* some phones only allow speech after one utterance has been started by a tap */
    prime() {
      if (this.primed || !('speechSynthesis' in window)) return;
      this.primed = true;
      try {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        speechSynthesis.speak(u);
        this.pickVoice();
        speechSynthesis.addEventListener('voiceschanged', () => this.pickVoice());
      } catch (_) {}
    },
    duck(on) {
      if (!ctx || !bus) return;
      bus.crowd.gain.setTargetAtTime(on ? 0.42 : 1, ctx.currentTime, 0.12);
    },
    say(text, urgent) {
      this.log.push(text);
      if (this.log.length > 30) this.log.shift();  // kept so tests can see what was called
      if (!S.ann || !S.snd || !('speechSynthesis' in window) || !ctx || ctx.state !== 'running') return false;
      try {
        if (speechSynthesis.speaking || speechSynthesis.pending) {
          if (!urgent) return false;
          speechSynthesis.cancel();
        }
        const u = new SpeechSynthesisUtterance(text);
        if (!this.voice) this.pickVoice();
        if (this.voice) u.voice = this.voice;
        u.rate = 1.08;
        u.pitch = 0.92;
        u.volume = VOL[S.vol] === undefined ? 1 : Math.min(1, VOL[S.vol] + 0.15);
        u.onstart = () => this.duck(true);
        u.onend = u.onerror = () => this.duck(false);
        speechSynthesis.speak(u);
        return true;
      } catch (_) {
        return false;
      }
    },
    hush() {
      try {
        if ('speechSynthesis' in window) speechSynthesis.cancel();
      } catch (_) {}
      this.duck(false);
    },
  };

  /* ---------- weather ---------- */
  const weatherBed = {
    kind: 'clear', node: null, timer: null,
    set(kind) {
      this.kind = kind || 'clear';
      this.apply();
    },
    apply() {
      const want = ctx && S.snd && !wantMusic ? this.kind : 'clear';
      if (this.node && this.node.kind === want) return;
      clearInterval(this.timer);
      this.timer = null;
      if (this.node) {
        const n = this.node;
        n.out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3);
        setTimeout(() => {
          try {
            n.out.disconnect();
            n.stop();
          } catch (_) {}
        }, 1500);
        this.node = null;
      }
      if (want !== 'rain' && want !== 'snow') return;
      const c = ctx, t = c.currentTime, out = gain(c, 0.0001), srcs = [];
      const src = (color, rate) => {
        const n = noise(c, color, t, 86400, rate);
        srcs.push(n);
        return n;
      };
      if (want === 'rain') {
        // hiss on the seats and the turf, a low wash underneath, and now and then thunder a long way off
        chain(src('white'), filter(c, 'highpass', 2600), gain(c, 0.07), out);
        chain(src('pink', 0.8), filter(c, 'bandpass', 700, 0.4), gain(c, 0.1), out);
        this.timer = setInterval(() => {
          if (ctx.state === 'running' && Math.random() < 0.12) SFX.thunder(ctx, bus.crowd, ctx.currentTime + 0.01);
        }, 4000);
      } else {
        // wind: a band of noise that wanders
        const f = filter(c, 'bandpass', 330, 1.4), lfo = c.createOscillator(), depth = gain(c, 140);
        lfo.frequency.value = 0.13;
        chain(lfo, depth, f.frequency);
        lfo.start(t);
        srcs.push(lfo);
        chain(src('pink', 0.7), f, gain(c, 0.2), out);
      }
      out.connect(bus.crowd);
      out.gain.setTargetAtTime(1, t, 0.8);
      this.node = { kind: want, out, stop() {
        for (const n of srcs) try {
          n.stop();
        } catch (_) {}
      }
      };
    },
  };

  /* ---------- public ---------- */

  function play(name, opts) {
    if (!ctx || !S.snd || ctx.state !== 'running' || !SFX[name]) return;
    try {
      let out = bus[ROUTE[name] || 'sfx'];
      if (opts && opts.x !== undefined) {
        // where on the field it happened, left to right
        const p = pan(ctx, (opts.x / 53.33 * 2 - 1) * 0.7);
        p.connect(out);
        out = p;
      }
      SFX[name](ctx, out, ctx.currentTime + 0.001, opts);
    } catch (_) {}
  }

  let wantMusic = true;  // menus want music, games want the crowd

  function unlock() {
    try {
      if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        bus = buildGraph(ctx);
      }
      if (ctx.state !== 'running') ctx.resume();
      wantStems();
      if (wantMusic) music.start();
      else crowd.start();
      weatherBed.apply();
      ann.prime();
    } catch (_) {}
  }

  for (const ev of ['pointerdown', 'touchend', 'keydown']) addEventListener(ev, unlock, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) {
      ctx.suspend();
      ann.hush();
    } else ctx.resume();
  });

  /* interface clicks: every menu button ticks, primary buttons confirm */
  document.addEventListener('click', e => {
    const b = e.target && e.target.closest && e.target.closest('button');
    if (!b || b.classList.contains('pb') || b.dataset.quiet !== undefined) return;
    play(b.classList.contains('go') ? 'ok' : 'tick');
  }, true);

  /* in-place radix-2 FFT of re/im, length a power of two */
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) {
        [re[i], re[j]] = [re[j], re[i]];
        [im[i], im[j]] = [im[j], im[i]];
      }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = a + len / 2, xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr;
          im[b] = im[a] - xi;
          re[a] += xr;
          im[a] += xi;
          const t = cr * wr - ci * wi;
          ci = cr * wi + ci * wr;
          cr = t;
        }
      }
    }
  }

  /* Peak and loudness of a rendered buffer; how its energy is shared between six bands (under 200 Hz, to 500, 1k, 2k,
     4k, and above); and its loudness with everything under 250 Hz taken away, which is roughly what a phone's own
     speaker gives you. */
  function stats(buf) {
    const chans = [];
    for (let ch = 0; ch < buf.numberOfChannels; ch++) chans.push(buf.getChannelData(ch));
    let peak = 0;
    for (const d of chans) for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > peak) peak = Math.abs(d[i]);
    const db = v => +(20 * Math.log10(Math.max(1e-6, v))).toFixed(1);
    const d = chans[0], sr = buf.sampleRate, N = 8192, edges = [200, 500, 1000, 2000, 4000], sums = new Array(6).fill(0), re = new Float64Array(N), im = new Float64Array(N);
    let above = 0, all = 0;
    for (let at = 0; at + N <= d.length; at += N / 2) {
      for (let i = 0; i < N; i++) {
        re[i] = d[at + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
        im[i] = 0;
      }
      fft(re, im);
      for (let k = 1; k < N / 2; k++) {
        const f = k * sr / N, e = re[k] * re[k] + im[k] * im[k];
        let b = 0;
        while (b < 5 && f >= edges[b]) b++;
        sums[b] += e;
        all += e;
        if (f >= 250) above += e;
      }
    }
    /* the same signal through a 250 Hz high-pass (two poles), for the peak a small speaker would reach */
    const w = 2 * Math.PI * 250 / sr, al = Math.sin(w) / 1.414, a0 = 1 + al, b0 = (1 + Math.cos(w)) / 2 / a0, b1 = -(1 + Math.cos(w)) / a0, a1 = -2 * Math.cos(w) / a0, a2 = (1 - al) / a0;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0, small = 0;
    for (let i = 0; i < d.length; i++) {
      const y = b0 * d[i] + b1 * x1 + b0 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = d[i];
      y2 = y1;
      y1 = y;
      if (Math.abs(y) > small) small = Math.abs(y);
    }
    const rms = rmsOf(chans);
    return { peakDb: db(peak), rmsDb: db(rms), phonePeakDb: db(small), phoneDb: db(rms * Math.sqrt(above / (all || 1))), bands: sums.map(v => Math.round(v / (all || 1) * 100)).join('/') };
  }

  PG.audio = {
    play, crowd, music,
    /* which soundtrack the current screen wants */
    scene(name) {
      wantMusic = name === 'menu';
      if (!ctx) return;
      if (wantMusic) {
        crowd.stop();
        music.start();
        ann.hush();
        this.halftime(false);
      } else {
        music.stop();
        crowd.start();
      }
      weatherBed.apply();
    },
    /* The stadium speakers: the referee giving a call (his microphone clicks on first), or the stadium announcer
       (opts.announcer: his channel is always open). Returns how long it will take, 0 when nothing can be heard. */
    pa(text, opts) {
      note('pa: ' + text);
      if (!ctx || !S.snd || ctx.state !== 'running' || wantMusic) return 0;
      const t = ctx.currentTime + 0.05, lead = opts && opts.announcer ? 0 : 0.3;
      if (lead) SFX.mic(ctx, bus.pa, t);
      return lead + paVoice(ctx, bus.pa, t + lead, text) + 0.05;
    },
    /* a home first down, the way a stadium does it: the announcer starts the sentence and the crowd finishes it */
    firstDown(team) {
      const live = !!ctx && ctx.state === 'running', t = live ? ctx.currentTime : 0;
      if (live && t - (this.fdAt || -99) < 20) return false;  // not every time: it is a treat, not a tic
      this.fdAt = t;
      note('firstdown');
      const len = this.pa('And that is another ' + team, { announcer: true });
      if (len) crowd.stem('firstdown', 0.9, t + len + 0.12);
      return true;
    },
    /* the band's halftime show starts, or stops because the teams are back */
    halftime(on) {
      if (this.half) {
        const g = this.half;
        this.half = null;
        clearTimeout(this.halfT);
        g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.12);
        setTimeout(() => {
          try {
            g.disconnect();
          } catch (_) {}
        }, 20000);
      }
      if (!on) return false;
      note('halftime');
      if (!ctx || !S.snd || ctx.state !== 'running' || wantMusic) return false;
      const t = ctx.currentTime, g = gain(ctx, 1);
      g.connect(bus.stands);
      this.half = g;
      const len = bandPiece(ctx, g, t + 0.7, 3);
      this.bandAt = t + len;  // no other piece over the top of it
      this.halfT = setTimeout(() => {
        if (this.half === g) crowd.cheer(0.5, 3);  // the crowd shows what it thought
      }, (len + 0.6) * 1000);
      return true;
    },
    /* test hook: what the game has asked the stadium for */
    get asked() {
      return asked;
    },
    say(text, urgent) {
      return ann.say(text, urgent);
    },
    /* the band strikes up, unless it played in the last quarter of a minute; `which` picks the piece (for tests) */
    band(which) {
      if (!ctx || !S.snd || ctx.state !== 'running' || wantMusic) return false;
      const t = ctx.currentTime;
      if (which === undefined && t - (this.bandAt || -99) < 16) return false;
      this.bandAt = t;
      const w = which === undefined ? Math.floor(Math.random() * 3) : which, len = bandPiece(ctx, bus.stands, t + 0.05, w);
      if (w === 1) crowd.stem('hey', 0.9, t + 0.05 + len);  // "Charge!"
      return true;
    },
    get spoken() {
      return ann.log;
    },
    weather(kind) {
      weatherBed.set(kind);
    },
    muffle(on) {
      if (!ctx || !bus) return;
      bus.tone.frequency.setTargetAtTime(on ? 650 : 20000, ctx.currentTime, on ? 0.08 : 0.15);
      if (on) ann.hush();
    },
    /* settings changed */
    refresh() {
      if (!ctx) return;
      bus.out.gain.setTargetAtTime(TRIM * (VOL[S.vol] === undefined ? 1 : VOL[S.vol]), ctx.currentTime, 0.05);
      if (!S.snd) {
        crowd.stop();
        ann.hush();
      } else if (!wantMusic) crowd.start();
      if (!S.ann) ann.hush();
      weatherBed.apply();
      if (!S.mus) music.stop();
      else if (wantMusic) music.start();
    },
    /* Render something through the whole mix, off line, and report its level and where its energy sits.
       name: an effect, 'music', or 'crowd' with opts { level, cheer, clap, noStems }. */
    async measure(name, opts, seconds) {
      const sr = 44100, len = seconds || 2.5, Off = window.OfflineAudioContext || window.webkitOfflineAudioContext, c = new Off(2, Math.floor(sr * len), sr), g = buildGraph(c);
      g.out.gain.value = TRIM;
      if (name === 'music') for (let i = 0; i < Math.floor(len / STEP); i++) musicStep(c, g.music, i % (BARS * 16), 0.02 + i * STEP);
      else if (name === 'crowd') {
        const o = opts || {}, raw = o.noStems ? null : await (PG.audio._raw || (PG.audio._raw = renderStems(sr))), st = raw && Object.fromEntries(Object.keys(raw).map(k => [k, toBuffer(c, raw[k])]));
        const n = buildCrowd(c, 0, len, st), m = crowdMix(o.level || 0);
        n.out.gain.value = 1;
        n.out.connect(g.crowd);
        n.bed.gain.value = m.bed;
        n.air.gain.value = m.air;
        n.roar.gain.value = o.cheer ? CHEER.roar(o.cheer) : m.floor;
        n.hiss.gain.value = o.cheer ? CHEER.hiss(o.cheer) : m.floor * 0.8;
        n.clap.gain.value = o.cheer ? CHEER.clap(o.cheer) : 0;
      } else if (name.startsWith('stem:')) {
        const raw = await (PG.audio._raw || (PG.audio._raw = renderStems(sr))), s = c.createBufferSource();
        s.buffer = toBuffer(c, raw[name.slice(5)]);
        s.loop = len > s.buffer.duration;
        s.connect(g.crowd);
        s.start(0);
      } else if (name.startsWith('band:')) bandPiece(c, g.stands, 0.02, +name.slice(5));
      else if (name.startsWith('pa:')) {
        SFX.mic(c, g.pa, 0.02);
        paVoice(c, g.pa, 0.32, name.slice(3));
      } else SFX[name](c, g[ROUTE[name] || 'sfx'], 0.02, opts);
      return stats(await rendered(c));
    },
    /* every effect, the stems, the crowd at three moods and the music: one table of levels */
    async report() {
      const out = {};
      for (const n of Object.keys(SFX)) out[n] = await this.measure(n, n === 'hit' ? { power: 1 } : undefined, n === 'thunder' ? 4 : 2.2);
      for (const n of Object.keys(STEMS)) out['stem ' + n] = await this.measure('stem:' + n, null, STEMS[n].len);
      out['stem clap'] = await this.measure('stem:clap', null, 5);
      for (const w of [0, 1, 2, 3]) out['band ' + w] = await this.measure('band:' + w, null, w === 3 ? 17.5 : w === 2 ? 9.5 : 4);
      out['pa call'] = await this.measure('pa:Holding, offense. Ten yard penalty. Replay the down.', null, 5);
      out['crowd quiet'] = await this.measure('crowd', { level: 0.3 }, 6);
      out['crowd tense'] = await this.measure('crowd', { level: 1 }, 6);
      out['crowd cheering'] = await this.measure('crowd', { level: 0.6, cheer: 1 }, 6);
      out['crowd noise only'] = await this.measure('crowd', { level: 0.3, noStems: true }, 6);
      out.music = await this.measure('music', null, 16 * 16 * STEP);
      return out;
    },
    names: Object.keys(SFX),
    /* test hook: the level leaving the mix right now, read from an analyser on the output (the last 0.17 s) */
    get meter() {
      if (!ctx || !bus) return null;
      if (!bus.meter) {
        bus.meter = ctx.createAnalyser();
        bus.meter.fftSize = 8192;
        bus.out.connect(bus.meter);
      }
      const d = new Float32Array(bus.meter.fftSize);
      bus.meter.getFloatTimeDomainData(d);
      let peak = 0, sum = 0;
      for (let i = 0; i < d.length; i++) {
        peak = Math.max(peak, Math.abs(d[i]));
        sum += d[i] * d[i];
      }
      const db = v => +(20 * Math.log10(Math.max(1e-6, v))).toFixed(1);
      return { peakDb: db(peak), rmsDb: db(Math.sqrt(sum / d.length)) };
    },
    get state() {
      return ctx ? ctx.state : 'none';
    },
    get stemsReady() {
      return !!stems;
    },
  };
})();
