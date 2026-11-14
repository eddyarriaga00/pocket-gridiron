/* Pocket Gridiron: engine, rendering, exhibition UI. Classic script, exposes window.PG.
   Coordinates are yards: x 0..53.33 across, y 0..100 between goal lines. Team 0 (the user) attacks +y. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const app = document.getElementById('app');
  app.innerHTML = `<canvas id="gl" hidden></canvas><canvas id="c"></canvas><div id="bcast" aria-live="polite"></div>
<div id="hud" hidden>
  <div class="bug">
    <div class="side" id="sd0"><i></i><b id="a0"></b><em></em><u id="s0">0</u></div>
    <div class="mid"><span id="qt">1st</span><b id="clk">3:00</b></div>
    <div class="side r" id="sd1"><i></i><b id="a1"></b><em></em><u id="s1">0</u></div>
  </div>
  <div class="sub"><button id="pz" aria-label="Pause"><span></span><span></span></button><div id="dn"></div><div id="zm"><button id="zo" aria-label="Zoom out">−</button><button id="zi" aria-label="Zoom in">+</button></div></div>
  <div id="mine" hidden></div>
  <div id="rp" hidden><i></i>Replay · tap to skip</div>
</div>
<div id="banner"></div><div id="toast"></div>
<div id="deck">
  <div id="meter" hidden><p id="mtxt"></p><div class="bar"><i id="ndl"></i></div></div>
  <div id="pw" hidden><span>Power</span><div class="trk"><i id="pwf"></i></div><b id="pwl"></b></div>
  <div id="bl"><div id="tip" hidden></div><div id="brief" hidden></div></div>
  <div id="pad"></div>
  <div id="ptype" hidden><b></b><span></span></div>
</div>
<div id="screen"></div><div id="ov" hidden></div>`;

  /* a phone on its side: the stylesheet shows this instead of a sliver of a game (small touch screens in landscape only) */
  document.body.insertAdjacentHTML('beforeend', '<div id="turn" role="status"><i></i><b>Turn your phone upright</b><span>Pocket Gridiron is played in portrait.</span></div>');
  const cv = $('#c'), ctx = cv.getContext('2d'), pad = $('#pad'), scr = $('#screen');
  const FW = 53.33, PITCH = 48 * Math.PI / 180, CS = Math.cos(PITCH), SN = Math.sin(PITCH), PS = 1.6, CAMH = 19.3;
  let W = 1, H = 1, F = 1, CY = 1, DPR = 1, AUTO = false, QUIET = false, FDT = 0.016, SDT = 0.016, shake = 0;  // FDT: last frame time, SDT: current simulation step
  let R3 = null;  // the 3D renderer (render3d.js) when it is active; null means the 2D canvas draws everything
  const RM = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* Every random decision in the game comes through rand(). PG.dbg.seed(n) makes a run repeatable for tests; seed(0) goes back to Math.random. */
  let SEEDED = false, SEED = 0;
  const rand = () => {
    if (!SEEDED) return Math.random();
    SEED = (SEED + 0x6D2B79F5) | 0;
    let t = Math.imul(SEED ^ SEED >>> 15, 1 | SEED);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  const rnd = (a = 1, b) => b === undefined ? rand() * a : a + rand() * (b - a);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v, hyp = Math.hypot, lerp = (a, b, t) => a + (b - a) * t;
  const dist = (a, b) => hyp(a.x - b.x, a.y - b.y), pick = a => a[Math.floor(rnd(a.length))];

  function load(k, d) {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : d;
    } catch (_) {
      return d;
    }
  }

  function save(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (_) {}
  }

  const SET = Object.assign({ snd: true, mus: true, ql: 180, diff: 1, me: 0, opp: 5, acc: 'blue' }, load('pg.settings', {}));

  /* the one accent color, picked in the menu: CSS reads it as --acc, the canvas as ACC */
  const ACCENTS = { blue: '#4c9aff', red: '#ff5a6b', orange: '#ff8437', teal: '#2fd6c1', violet: '#a58bff', white: '#eef2f8' };
  let ACC = ACCENTS.blue;

  function applyTheme() {
    if (!ACCENTS[SET.acc]) SET.acc = 'blue';
    ACC = ACCENTS[SET.acc];
    document.documentElement.style.setProperty('--acc', ACC);
    app.classList.toggle('lefty', !!SET.left);  // buttons on the left for left-handed play
  }

  applyTheme();

  function resize() {
    const r = app.getBoundingClientRect();
    DPR = Math.min(2.5, window.devicePixelRatio || 1);
    W = r.width || 1;
    H = r.height || 1;
    cv.width = W * DPR;
    cv.height = H * DPR;
    F = W * 0.62;
    CY = H * 0.5;
    if (R3) R3.resize(W, H, SET.px === 'bal' ? Math.min(DPR, 1.5) : DPR);
  }

  addEventListener('resize', resize);

  /* ---------- data (the tables are in data.js) ---------- */
  const { TEAMS, SUR, OLR, OLX, OFFR, DEFR, BASE, NUM, FORM, FNAME, ROUTES, RNAME, OFF, DPOS, DEF, SCHEME, LCOL, ORD } = window.PG.data;

  /* ---------- state ---------- */
  const menuState = tm => ({ state: 'menu', tm: tm || [SET.me, SET.opp], los: 50, fd: 60, bx: FW / 2, poss: 0, score: [0, 0] });
  let G = menuState(), P = [], ps = null;
  const cam = { x: FW / 2, y: 36, fx: FW / 2, fy: 50 };
  const inp = { x: 0, y: 0, manual: false, sprint: false }, stick = { id: null, ox: 0, oy: 0, x: 0, y: 0 }, keys = {};
  const FX = [], CONF = [];

  function mkRoster(ti, delta, ovr) {
    const o = (ovr ?? TEAMS[ti].ovr) + (delta || 0), r = {}, worn = new Set();
    for (const role of [...OFFR, ...DEFR]) {
      const g = role === 'S2' ? 'S' : role.replace(/\d/, ''), rt = Math.round(clamp(o + rnd(-9, 7), 58, 99)), nr = NUM[g] || [60, 79];
      let num = Math.floor(rnd(nr[0], nr[1] + 1));
      for (let i = 0; worn.has(num) && i < 12; i++) num = Math.floor(rnd(nr[0], nr[1] + 1));  // no two players in the same number
      worn.add(num);
      r[role] = { rt, spd: BASE[g] * (1 + (rt - 80) * 0.004), num, name: pick(SUR) };
    }
    return r;
  }

  const hash = x => clamp(x, FW / 2 - 3.1, FW / 2 + 3.1);

  function setBall(t, y, x) {
    y = clamp(y, 1, 99);
    if (t !== G.poss) G.possN = (G.possN || 0) + 1;  // a new possession
    G.poss = t;
    G.los = y;
    G.bx = hash(x);
    G.down = 1;
    const d = t === 0 ? 100 - y : y;
    G.togo = Math.min(10, d);
    G.fd = y + (t === 0 ? 1 : -1) * G.togo;
  }

  /* a career returner's line: kick returns and punt returns, and any return he takes all the way */
  function retStat(yd, td) {
    const m = G.my, k = ps.punt ? 'pr' : 'kr';
    m[k] = (m[k] || 0) + 1;
    m[k + 'y'] = (m[k + 'y'] || 0) + yd;
    if (td) m.krtd = (m.krtd || 0) + 1;
  }

  const kickoff = t => {
    setBall(t, t === 0 ? 25 : 75, FW / 2);
    G.pendKO = t;
  };  // the ball is spotted for a touchback; a live return can move it
  const ab = t => TEAMS[G.tm[t]].ab, tname = t => TEAMS[G.tm[t]].name;
  const vk = i => (TEAMS[i].custom ? '-' : TEAMS[i].vo || TEAMS[i].ab);  // the key of a team's recorded calls; a renamed team has none, so the booth leaves its name out

  function spotTxt(y) {
    y = Math.round(y);
    return y === 50 ? 'the 50' : y < 50 ? ab(0) + ' ' + y : ab(1) + ' ' + (100 - y);
  }

  function downTxt() {
    if (G.try2 != null) return 'Two-point try';
    if (G.patKick != null) return 'Extra point';
    const goal = G.poss === 0 ? G.fd >= 99.9 : G.fd <= 0.1;
    return `${ORD[Math.min(3,G.down-1)]} & ${goal?'Goal':Math.max(1,Math.round(G.togo))} · ${spotTxt(G.los)}`;
  }

  /* Is this player under the user's hands right now? In career (lock) mode only the user's own player is. */
  const userP = p => !AUTO && !!p && p.team === 0 && (!G.lock || p === G.me);

  /* opt: {a,b,ql,diff,mode,lock,hero,ovr,mustWin,onEnd,onQuit} */
  function startGame(o) {
    const lock = o.lock || null, first = o.mode && o.mode !== 'exh' && rnd() < 0.5 ? 1 : 0;  // exhibition always opens with the user receiving
    G = { state: 'dead', mode: o.mode || 'exh', tm: [o.a, o.b], ros: [o.ros0 || mkRoster(o.a, 0, o.ovr && o.ovr[0]), mkRoster(o.b, [-6, 0, 5][o.diff ?? 1], o.ovr && o.ovr[1])],
      score: [0, 0], q: 1, ql: o.ql || 180, diff: o.diff ?? 1, clock: o.ql || 180, stats: [0, 1].map(() => ({ pass: 0, rush: 0, comp: 0, att: 0, to: 0 })), stam: 1, pad: null, deadT: 0, ot: false, final: false,
      sel: null, me: null, preT: 0, meter: 0, lock, lockSide: lock ? (OFFR.includes(lock) ? 'off' : 'def') : null, first, drill: o.drill ? { n: o.drill, left: o.drill, side: o.side || (lock && !OFFR.includes(lock) ? 'def' : 'off'), script: o.script || null, dcall: o.dcall || null, title: o.title || 'Practice', reps: [] } : null, lineFn: o.line || null, goalsFn: o.goals || null, mustWin: !!o.mustWin, home: o.away ? 1 : 0, kr: !!o.kr && !!lock, liveP: null, prime: !!o.prime, around: o.around || null, highs: o.highs || null, onEnd: o.onEnd || null, onQuit: o.onQuit || null, paused: false, last: '', box: {}, scores: [], lastScore: null, drive: null, potd: null, hl: null, rpEnd: null, pat: null, try2: null, introT: 0, to: [3, 3], runoff: 0, share: o.share === undefined ? 1 : o.share, possN: 0, benchN: -1, sit: false, env: o.env || { time: SET.tod || 'night', weather: SET.wx || 'clear' },
      my: { att: 0, comp: 0, pyd: 0, ptd: 0, pint: 0, car: 0, ryd: 0, rtd: 0, rec: 0, recyd: 0, rectd: 0, tgt: 0, tkl: 0, sack: 0, int: 0, pbu: 0 } };
    if (lock && o.hero) {
      G.bench = { ...G.ros[0][lock] };  // the man the roster had there: he plays the drives the coach sits you out for
      if (G.bench.num === o.hero.num) G.bench.num = (o.hero.num % 98) + 1;
      G.ros[0][lock] = o.hero;
    }
    G.callout = o.callout || null;
    bcHide();  // a career player's callout of this opponent ('trash' or 'guarantee'): the booth knows
    G.heroCeleb = o.hero && o.hero.celeb >= 0 ? o.hero.celeb : -1;  // a career player's own touchdown celebration
    /* fum: fumble chance multiplier, cat: catch chance multiplier, kick: how much harder a field goal is */
    G.wx = { rain: { fum: 1.8, cat: 0.94, kick: 0.05 }, snow: { fum: 1.5, cat: 0.96, kick: 0.07 } }[G.env.weather] || { fum: 1, cat: 1, kick: 0 };
    kickoff(first);
    P = [];
    ps = null;
    camUpd(0, true);
    hudKey = '';
    scr.innerHTML = '';
    FX.length = 0;
    CONF.length = 0;
    if (PG.audio) PG.audio.scene('game');
    if (PG.audio && !AUTO && PG.audio.voTeams) PG.audio.voTeams([vk(G.tm[0]), vk(G.tm[1])]);  // the two teams' recorded lines come down now
    $('#hud').hidden = false;
    $('#a0').textContent = ab(0);
    $('#a1').textContent = ab(1);
    $('#sd0').style.setProperty('--c', TEAMS[o.a].c1);
    $('#sd1').style.setProperty('--c', TEAMS[o.b].c1);
    try {
      navigator.wakeLock && navigator.wakeLock.request('screen').catch(() => {});
    } catch (_) {}
    if (G.drill) {
      const t = G.drill.side === 'off' ? 0 : 1;
      setBall(t, t === 0 ? 30 : 70, FW / 2);
      G.pendKO = null;
      banner(G.drill.title, G.drill.n + ' reps', 1500);
    } else if (!AUTO) {
      const intro = () => startIntro(o, G.first);
      G.rivalry = o.rivalry || null;
      G.toss = { mine: !G.lock || G.share >= 0.99, coin: Math.random() < 0.5 ? 'heads' : 'tails', call: null, win: null, choice: null };  // you call it as a captain
      const toss = () => playScene('toss', {}, () => tossDone(intro));  // every game: the captains and the coin at midfield
      if (G.mode === 'career') playScene('walkout', {}, () => (G.rivalry ? playScene('faceoff', {}, toss) : toss()));  // a career game opens in the tunnel; a rival game then at midfield
      else toss();
      return;
    } else banner('Kickoff', tname(first) + ' ball', 1500);
    if (PG.audio && !AUTO) PG.audio.weather(G.env.weather);
    startCall();
  }

  function startIntro(o, first) {
    {
      /* a few seconds over the stadium with the matchup on screen; a tap skips it */
      const e = G.env, t0 = TEAMS[o.a], t1 = TEAMS[o.b], when = e.roof ? 'Indoors' : { day: 'Afternoon', dusk: 'Dusk', night: 'Night' }[e.time] || 'Night', sky = e.roof ? 'Under the roof' : { rain: 'Rain', snow: 'Snow' }[e.weather] || 'Clear';
      G.state = 'intro';
      const sty = i => (SCHEME[i] ? `<i>${SCHEME[i].n} offense</i>` : '');  // each team calls its own kind of game
      scr.innerHTML = `<button class="intro" id="intro"><div class="mu"><div style="--c:${t0.c1}"><b>${t0.ab}</b><span>${t0.name}</span>${sty(o.a)}</div><em>${G.home ? 'at' : 'vs'}</em><div style="--c:${t1.c1}"><b>${t1.ab}</b><span>${t1.name}</span>${sty(o.b)}</div></div>
  ${G.prime ? '<p class="prime">Primetime · the whole league is watching</p>' : ''}<p>${when} · ${sky} · ${G.ql / 60}-minute quarters</p><p class="toss">${G.toss ? `${TEAMS[G.tm[G.toss.win]].name} won the toss · ${G.toss.choice === 'defer' ? 'deferred' : 'will receive'}` : `${TEAMS[G.tm[G.first]].name} won the toss · will receive`}</p><small>Tap to skip</small></button>`;
      $('#intro').onclick = endIntro;
      /* the coin toss was won by the side that receives: the referee says so over the speakers, then the broadcast opens
         with a welcome, who is playing, and a word from the analyst if there is time before the ball is kicked */
      const toss = G.tossSaid ? 0 : G.toss ? tossSay(0.2) : PG.audio && PG.audio.pa ? PG.audio.pa(`The ${t1 === TEAMS[G.tm[G.first]] ? t1.name : t0.name} have won the toss, and will receive.`, { wait: 0.2, clips: ['ref.toss.' + vk(G.tm[G.first])] }) : 0;
      G.introT = -Math.min(2.5, toss);  // the matchup card stays up a little longer for it
      setTimeout(() => {
        vo('intro.' + (e.weather === 'rain' || e.weather === 'snow' ? e.weather : e.time === 'day' || e.time === 'dusk' ? e.time : 'night'), { ttl: 6 });
        vo('intro.away.' + vk(G.home ? o.a : o.b), { ttl: 14 });  // a road game: you are the visitors
        vo('intro.home.' + vk(G.home ? o.b : o.a), { ttl: 16 });
        if (G.home) vo('intro.road', { ttl: 20 });  // a road game: the booth says what kind of place it is
        if (G.callout) {
          vo(G.callout === 'guarantee' ? 'call.guar' : 'call.trash', { keep: true, ttl: 20 });
          vo('a.callout', { pri: 0, keep: true, ttl: 24 });
        } else vo('a.intro', { pri: 0, keep: true, ttl: 16 });
      }, toss ? toss * 1000 + 250 : 0);
      if (PG.audio) PG.audio.weather(e.weather);
    }
  }

  /* ---------- cutscenes ----------
     A cutscene is a short scripted moment in the stadium: a few actors (ordinary players, staged), props render3d.js
     draws for it, a camera path (render3d.js SCENECAM), a caption, the stadium's sound. playScene() puts the game in
     state 'scene', stages the actors as P, and hands back to `then` when the time is up or the screen is tapped.
     Never in simulations or practice, and Settings can turn them off. Every scene is in SCENES: dur, setup(o) for
     the actors and props, update(sc, dt) to move them, and cues: [time, fn] fired once. */
  const SCENE_PS = { mode: 'scene', carrier: null, air: null, loose: null, recs: [], los: 50, bx: FW / 2, offTeam: 0, fd: 60, qb: null, thrown: true };
  const cutsOn = () => !AUTO && !QUIET && !G.drill && SET.cuts !== false && !!R3;  // the 3D view draws them; the flat fallback skips them

  function rosterMan(team, role, k) {
    const r = G.ros[team] && G.ros[team][role];
    return { x: FW / 2, y: 50, vx: 0, vy: 0, team, role, num: r ? r.num : 10 + k, name: r ? r.name : 'Player', act: null };
  }

  function playScene(kind, o, then) {
    const S = SCENES[kind];
    if (!S || !cutsOn()) return then();
    const sc = { kind, t: 0, dur: S.dur, then, cues: (S.cues || []).slice(), o: o || {}, prev: G.state === 'over' ? 'over' : 'dead' };
    G.scene = sc;
    G.state = 'scene';
    P = S.setup(sc) || [];
    ps = Object.assign({}, SCENE_PS);
    cam.snap = true;
    $('#hud').hidden = true;
    scr.innerHTML = `<button class="scene" id="scn"><div class="cap">${sc.cap || ''}</div><small>Tap to skip</small></button>`;
    $('#scn').onclick = () => endScene();
  }

  /* a cutscene away from a game (the draft, the hall of fame): a quiet stadium in the home side's colors, then back to
     the menus. then(true) when it played, then(false) when cutscenes are off. */
  function cinema(kind, o, then) {
    if (!cutsOn() || G.ros) return then(false);
    G = menuState([o.team, o.vs != null ? o.vs : (o.team + 3) % TEAMS.length]);
    G.state = 'dead';
    G.env = o.env || { time: 'night', weather: 'clear' };
    playScene(kind, o, () => {
      G = menuState(G.tm);
      $('#hud').hidden = true;
      then(true);
    });
  }

  function stepScene(dt) {
    const sc = G.scene, S = SCENES[sc.kind];
    if (!sc.hold) sc.t += dt;  // a question on screen (the coin toss call) holds the scene
    while (sc.cues.length && sc.cues[0][0] <= sc.t) sc.cues.shift()[1](sc);
    if (S.update) S.update(sc, dt);
    for (const p of P) {
      // an actor with somewhere to go runs there, eases in and stops; an actor with nowhere to go stands
      if (p.go && sc.t >= (p.at || 0)) {
        if (p.via && p.via.length && hyp(p.via[0][0] - p.x, p.via[0][1] - p.y) < 0.9) p.via.shift();  // a waypoint passed at a run
        const to = p.via && p.via.length ? p.via[0] : p.go, last = to === p.go;
        const dx = to[0] - p.x, dy = to[1] - p.y, d = hyp(dx, dy), sp = !last ? p.spd || 6.5 : d > 0.25 ? Math.min(p.spd || 6.5, d * 2.2) : 0, e = 1 - Math.exp(-dt * 6);
        p.vx += ((d ? dx / d : 0) * sp - p.vx) * e;
        p.vy += ((d ? dy / d : 0) * sp - p.vy) * e;
        if (d <= 0.25 && p.then) {
          p.act = p.then;
          p.then = null;
        }
      } else {
        p.vx *= Math.pow(0.02, dt);
        p.vy *= Math.pow(0.02, dt);
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.anim = (p.anim || 0) + hyp(p.vx, p.vy) * dt;
    }
    if (sc.t >= sc.dur) endScene();
  }

  function endScene() {
    const sc = G.scene;
    if (!sc || G.state !== 'scene') return;
    G.scene = null;
    P = [];
    ps = null;
    G.state = sc.prev;
    scr.innerHTML = '';
    $('#hud').hidden = sc.prev === 'over';
    cam.snap = true;
    sc.then();
  }

  const SCENES = {
    /* Game day: the team runs out of the tunnel behind its starter, you first in a career, through smoke and two
       jets of flame, the announcer calls them in and the place goes up. Then the camera rises behind them. */
    walkout: {
      dur: 7,
      setup(sc) {
        const t = TEAMS[G.tm[0]], roles = ['QB', 'RB', 'X', 'Z', 'S', 'TE', 'LT', 'LG', 'C', 'RG', 'RT'], lead = G.lock && roles.includes(G.lock) ? G.lock : 'QB';
        const order = [lead, ...roles.filter(r => r !== lead)];
        const A = order.map((role, k) => {
          const p = rosterMan(0, role, k), side = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2), row = Math.floor((k + 1) / 2);
          p.x = FW / 2 - 10 + (k ? (k % 2 ? 0.75 : -0.75) : 0);  // two abreast in the tunnel, left of the goal post (render3d.js TUN_X)
          p.y = -5.6 - Math.ceil(k / 2) * 1.5;
          p.go = [FW / 2 + side * 2.3 + (k ? (Math.random() - 0.5) : 0), k === 0 ? 15 : 12.5 - row * 0.9 + Math.random() * 0.8];
          p.via = [[FW / 2 - 10 + side * 0.5, -2.5]];  // straight out of the mouth first, then fan out
          p.at = k === 0 ? 0.5 : 1.1 + k * 0.17;
          p.spd = k === 0 ? 7 : 6.3;
          p.then = 'cheer';
          p.lead = k === 0;
          return p;
        });
        const me = A[0];
        sc.cap = `<small>${esc(t.city)} · game day</small><b>${esc(t.name)} take the field</b>${G.lock ? `<span>#${me.num} ${esc(me.name)} leads them out</span>` : ''}`;
        sc.lead = me;
        return A;
      },
      cues: [
        [0.3, () => {
          // at home the announcer brings you out; on the road nobody here is glad to see you
          if (!G.home && PG.audio && PG.audio.pa) G.welcomed = PG.audio.pa('Ladies and gentlemen, welcome to ' + TEAMS[G.tm[0]].name + ' football!', { announcer: true, wait: 0, clips: ['pa.welcome.' + vk(G.tm[0])] }) > 0;
        }],
        [0.95, () => {
          snd('boom');
          if (PG.audio) G.home ? PG.audio.crowd.boo(0.6) : PG.audio.crowd.cheer(1.25, 4.5);
        }],
        [2.6, () => {
          if (PG.audio) G.home ? PG.audio.crowd.ooh(0.3) : PG.audio.crowd.cheer(0.9, 3);
        }],
      ],
    },
  };

  /* The rival face-off: you and him at midfield, arms folded, face to face. He points at you, you answer with a fist
     to your chest, and his words (and yours, if you called him out) are on the caption. */
  SCENES.faceoff = {
    dur: 6.6,
    setup(sc) {
      const R = G.rivalry, role = G.lock || 'QB', me = rosterMan(0, role, 0), him = rosterMan(1, role, 1);
      me.x = FW / 2 - 0.95;
      him.x = FW / 2 + 0.95;
      me.y = him.y = 50;
      me.face = -Math.PI / 2;  // toward +x, at him
      him.face = Math.PI / 2;
      me.act = him.act = 'fold';
      him.name = R.name;
      sc.me = me;
      sc.him = him;
      const opp = TEAMS[G.tm[1]];
      sc.cap = `<small>Rival game · ${esc(opp.city)} ${esc(opp.name)}</small><b>${esc(me.name)} vs ${esc(R.name)}</b>${R.quote ? `<span>“${esc(R.quote)}” — ${esc(R.name)}</span>` : ''}${R.mine ? `<span>You said: “${esc(R.mine)}”</span>` : ''}`;
      return [me, him];
    },
    cues: [
      [0.2, () => PG.audio && PG.audio.crowd.cheer(0.5, 2)],
      [3.1, sc => {
        sc.him.act = 'point';
        snd('ooh');
      }],
      [4.7, sc => {
        sc.me.act = 'chest';
        if (PG.audio) PG.audio.crowd.cheer(0.9, 2.5);
      }],
    ],
  };

  /* The final whistle: the two leaders (you, in a career, and the man who plays your position for them) walk to
     midfield and shake hands. The winners are behind theirs, celebrating; the losers turn and walk off. Confetti
     when it is your win at home. Every watched game ends with it, before the final screen. */
  SCENES.final = {
    dur: 5.6,
    setup(sc) {
      const role = G.lock && G.ros[1][G.lock] ? G.lock : 'QB', me = rosterMan(0, role, 0), him = rosterMan(1, role, 1), w = G.score[0] === G.score[1] ? -1 : G.score[0] > G.score[1] ? 0 : 1;
      me.x = FW / 2 - 7;
      him.x = FW / 2 + 7;
      me.y = him.y = 50;
      me.go = [FW / 2 - 0.8, 50];
      him.go = [FW / 2 + 0.8, 50];
      me.spd = him.spd = 3.1;
      me.then = him.then = 'shake';
      me.face = -Math.PI / 2;
      him.face = Math.PI / 2;
      const rest = [];
      for (const t of [0, 1]) ['RB', 'X', 'Z', 'TE', 'C', 'MLB'].forEach((r, k) => {
        const p = rosterMan(t, r, k + 2), side = t === 0 ? -1 : 1;
        p.x = FW / 2 + side * (3.4 + (k % 3) * 1.6 + Math.random() * 0.4);  // behind their man and a little upfield of him, where the camera in front can see them
        p.y = 52.6 + Math.floor(k / 3) * 1.9 + Math.random() * 0.5;
        if (t === w) {
          p.act = 'cheer';
          p.lead = k === 0;
          p.face = side > 0 ? Math.PI / 2 : -Math.PI / 2;
        } else if (w >= 0) {
          p.go = [p.x + side * 16, p.y + (Math.random() - 0.5) * 3];  // the long walk to the sideline
          p.spd = 2.2 + Math.random() * 0.5;
          p.at = 0.3 + k * 0.25;
        } else p.act = 'clap';  // a tie: a hand for each other
        rest.push(p);
      });
      sc.me = me;
      sc.him = him;
      sc.win = w;
      sc.cap = `<small>Final${G.ot ? ' · overtime' : ''}</small><b>${ab(0)} ${G.score[0]} · ${ab(1)} ${G.score[1]}</b><span>${w < 0 ? 'All square' : esc(TEAMS[G.tm[w]].city + ' ' + TEAMS[G.tm[w]].name) + ' win'}</span>`;
      return [me, him, ...rest];
    },
    cues: [
      [0.3, sc => {
        if (!PG.audio) return;
        const home = G.home || 0;
        if (sc.win === home) PG.audio.crowd.cheer(1.1, 4.5);
        else if (sc.win >= 0) PG.audio.crowd.aww ? PG.audio.crowd.aww(0.5) : PG.audio.crowd.ooh(0.3);
      }],
      [1.2, sc => {
        if (sc.win === 0 && !G.home) confetti(0);
      }],
      [3.0, () => snd('chime')],
    ],
  };

  /* Halftime: both teams jog off toward their own ends while the band comes on; the score on the caption. */
  SCENES.half = {
    dur: 4.4,
    setup(sc) {
      const A = [];
      for (const t of [0, 1]) ['QB', 'RB', 'X', 'Z', 'TE', 'LT', 'C', 'RG'].forEach((r, k) => {
        const p = rosterMan(t, r, k), end = t === 0 ? -1 : 1;
        p.x = 8 + Math.random() * (FW - 16);
        p.y = 50 + end * (3 + Math.random() * 14);
        p.go = [FW / 2 + (k - 3.5) * 2.2, t === 0 ? -6 : 106];
        p.spd = 5.2 + Math.random() * 1.2;
        p.at = Math.random() * 0.7;
        A.push(p);
      });
      const d = G.score[0] - G.score[1];
      sc.cap = `<small>Halftime</small><b>${ab(0)} ${G.score[0]} · ${ab(1)} ${G.score[1]}</b><span>${d === 0 ? 'Level at the break' : `${tname(d > 0 ? 0 : 1)} lead by ${Math.abs(d)}`}</span>`;
      return A;
    },
    cues: [[0.2, () => PG.audio && PG.audio.crowd.cheer(0.5, 3)]],
  };

  /* The championship: a stage at midfield in team colors, the trophy over your head (render3d.js holds it in your
     hands), your teammates around the stage, confetti and fireworks, the fanfare and the crowd. */
  SCENES.trophy = {
    dur: 8.5,
    setup(sc) {
      const t = TEAMS[G.tm[0]], o = sc.o, role = G.lock || 'QB', me = rosterMan(0, role, 0);
      me.x = FW / 2;
      me.y = 50;
      me.face = Math.PI;  // facing the near sideline and the camera
      me.act = 'trophy';
      me.lift = 0.45;  // on the stage
      if (o.name) me.name = o.name;
      const others = ['RB', 'X', 'Z', 'TE', 'LT', 'C', 'S', 'RG'].map((role, k) => {
        const p = rosterMan(0, role, k + 1), a = Math.PI * (0.06 + 0.88 * (k / 7)), r = 4.2 + (k % 2) * 0.7;
        p.x = FW / 2 + Math.cos(a) * r * 1.45;  // round the back and the ends of the stage, so the camera in front sees you
        p.y = 50 + Math.sin(a) * r * 0.9 + 0.6;
        p.face = Math.atan2(-(me.x - p.x), me.y - p.y);  // turned to you
        p.act = 'cheer';
        return p;
      });
      sc.me = me;
      sc.cap = `<small>Season ${o.season || ''} · champions</small><b>The ${esc(t.name)} win the title</b>${G.lock ? `<span>#${me.num} ${esc(me.name)} lifts the trophy</span>` : ''}`;
      return [me, ...others];
    },
    cues: [
      [0.1, () => {
        snd('fanfare');
        if (PG.audio) PG.audio.crowd.cheer(1.4, 6);
        confetti(0);
      }],
      [2.4, () => {
        snd('boom');
        confetti(0);
      }],
      [4.6, () => {
        snd('boom');
        if (PG.audio) PG.audio.crowd.cheer(1.2, 4);
        confetti(0);
      }],
      [6.6, () => confetti(0)],
    ],
  };

  /* The coin toss: three captains a side face each other across the referee at midfield. He shows the coin, flips it
     (render3d.js flies it up and down), it lands, he points to the side that won (they receive: G.first), the
     announcer says so and the winners celebrate. In a career you are a captain once you are the starter. */
  SCENES.toss = {
    dur: 5.8,
    setup(sc) {
      const t0 = TEAMS[G.tm[0]], t1 = TEAMS[G.tm[1]], mine = G.lock && G.share >= 0.99 ? G.lock : null;
      const roles0 = mine ? [mine, ...['QB', 'C', 'RB'].filter(r => r !== mine)].slice(0, 3) : ['QB', 'C', 'RB'], roles1 = ['QB', 'C', 'RB'];
      const A = [];
      roles0.forEach((role, k) => {
        const p = rosterMan(0, role, k);
        p.x = FW / 2 - 1.9;
        p.y = 50 + (k - 1) * 1.05;
        p.face = -Math.PI / 2;  // toward the referee
        p.act = 'stand';
        A.push(p);
      });
      roles1.forEach((role, k) => {
        const p = rosterMan(1, role, k + 3);
        p.x = FW / 2 + 1.9;
        p.y = 50 + (k - 1) * 1.05;
        p.face = Math.PI / 2;
        p.act = 'stand';
        A.push(p);
      });
      const ref = { x: FW / 2, y: 50.6, vx: 0, vy: 0, team: 0, role: 'REF', num: 12 + Math.floor(Math.random() * 60), name: 'Referee', ref: true, face: Math.PI, act: 'coin' };
      A.push(ref);
      sc.ref = ref;
      if (G.toss && !G.toss.mine) tossResolve();  // somebody else calls it
      sc.cap = `<small>Coin toss · midfield</small><b>${esc(t0.name)} vs ${esc(t1.name)}</b><span>${mine ? `#${A[0].num} ${esc(A[0].name)} is a captain` : 'The captains meet the referee'}</span>`;
      return A;
    },
    cues: [
      [0.6, sc => {
        // your call, before he flips it: the scene waits at midfield
        if (!G.toss || !G.toss.mine || G.toss.call) return;
        sc.hold = true;
        askCall(() => {
          tossResolve();
          sc.hold = false;
        });
      }],
      [1.35, sc => (sc.ref.act = 'flip')],
      [3.0, () => snd('mic')],
      [3.15, sc => {
        if (G.toss) tossResolve();
        const T = G.toss, win = T ? T.win : G.first;
        sc.ref.act = win === 0 ? 'signalL' : 'signalR';
        const w = TEAMS[G.tm[win]], c = $('#scn .cap'), coin = T ? COIN(T.coin) + ' · ' : '';
        const said = () => {
          G.tossSaid = !!(T ? tossSay(0.1) : PG.audio && PG.audio.pa && PG.audio.pa(`The ${w.name} have won the toss, and will receive.`, { wait: 0.1, clips: ['ref.toss.' + vk(G.tm[win])] }));
          if (c) c.innerHTML = `<small>Coin toss · midfield</small><b>${coin}${esc(w.name)} win the toss</b><span>${T && T.choice === 'defer' ? 'They defer to the second half' : 'They will receive'}</span>`;
        };
        for (const p of P) if (!p.ref && p.team === win) p.act = 'cheer';
        if (PG.audio) PG.audio.crowd.cheer(win === (G.home || 0) ? 0.8 : 0.4, 2);  // louder when the home side wins it
        if (T && T.choice == null) {
          // you won it: your choice, while your captains celebrate
          if (c) c.innerHTML = `<small>Coin toss · midfield</small><b>${coin}${esc(w.name)} win the toss</b><span>Your choice</span>`;
          sc.hold = true;
          askChoice(() => {
            said();
            sc.hold = false;
          });
        } else said();
      }],
    ],
  };

  /* The coin toss call: a captain calls heads or tails with the coin in the air, and the winner chooses to receive or
     to defer (and get the ball to start the second half). You make both calls in an exhibition or a season, and in a
     career once you are the starter (a captain); otherwise your captain does. The computer defers seven times in ten,
     as most teams do now. The toss scene waits at midfield while you choose; with cutscenes off the same two questions
     come up over the empty stadium. Simulations keep the old coin. */
  const COIN = c => (c === 'heads' ? 'Heads' : 'Tails');
  const cpuChoice = () => (Math.random() < 0.7 ? 'defer' : 'receive');

  function tossResolve() {
    const T = G.toss;
    if (T.win == null) T.win = T.mine ? (T.call === T.coin ? 0 : 1) : Math.random() < 0.5 ? 0 : 1;
    if (T.choice == null && !(T.win === 0 && T.mine)) T.choice = cpuChoice();  // the other side, or your captain
  }

  function tossApply() {
    const T = G.toss;
    G.first = T.choice === 'receive' ? T.win : 1 - T.win;  // the team that receives now; the other one gets the second half
    kickoff(G.first);
  }

  const tossLine = () => `The ${TEAMS[G.tm[G.toss.win]].name} have won the toss, and ${G.toss.choice === 'defer' ? 'have deferred to the second half' : 'will receive'}.`;
  function tossSay(wait) {
    const T = G.toss;
    return PG.audio && PG.audio.pa ? PG.audio.pa(tossLine(), { wait, clips: [(T.choice === 'defer' ? 'ref.defer.' : 'ref.toss.') + vk(G.tm[T.win])] }) : 0;
  }

  /* a two-button question at the foot of the screen, over a cutscene if one is playing */
  function tossAsk(title, sub, a, b, done) {
    const el = document.createElement('div');
    el.className = 'sheet tsheet';
    el.innerHTML = `<div class="shd"><b>${title}</b><span>${sub}</span></div><div class="cols"><button class="go sm" id="${a[0]}">${a[1]}</button><button class="go sm" id="${b[0]}">${b[1]}</button></div>`;
    scr.appendChild(el);
    const scn = $('#scn');
    if (scn) scn.style.display = 'none';  // over a cutscene: no tap-to-skip under the buttons while the question is up
    const pick = (e, v) => {
      e.stopPropagation();
      el.remove();
      if (scn) scn.style.display = '';
      done(v);
    };
    el.querySelector('#' + a[0]).onclick = e => pick(e, 0);
    el.querySelector('#' + b[0]).onclick = e => pick(e, 1);
  }
  const askCall = done => tossAsk('Coin toss', 'You are the captain · call it', ['tsH', 'Heads'], ['tsT', 'Tails'], v => {
    G.toss.call = v ? 'tails' : 'heads';
    done();
  });
  const askChoice = done => tossAsk(`${COIN(G.toss.coin)} · you won the toss`, 'Your choice', ['tsR', 'Receive'], ['tsD', 'Defer'], v => {
    G.toss.choice = v ? 'defer' : 'receive';
    done();
  });

  /* after the scene (or with none): whatever was not asked yet is asked now, then the kickoff is spotted */
  function tossDone(next) {
    const T = G.toss;
    if (!T) return next();
    G.state = 'toss';
    if (T.mine && !T.call) return askCall(() => tossDone(next));
    tossResolve();
    if (T.choice == null) {
      toast(`${COIN(T.coin)} · you won the toss`);
      return askChoice(() => tossDone(next));
    }
    tossApply();
    G.state = 'dead';
    next();
  }

  /* Draft day: a stage at midfield with the draft board behind it in the new team's colors. You walk up onto it, shake
     the commissioner's hand, then turn to the cameras holding up your new jersey (render3d.js draws it with your name
     and number) while the announcer reads the pick. */
  SCENES.draft = {
    dur: 7.6,
    setup(sc) {
      const o = sc.o, t = TEAMS[o.team], role = o.pos === 'WR' ? 'X' : 'QB';
      const me = { x: FW / 2 - 7.5, y: 47.6, vx: 0, vy: 0, team: 0, role, num: o.num, name: o.name, act: null, spd: 3.2, via: [[FW / 2 - 5.4, 48.8]], go: [FW / 2 - 0.75, 49.6], then: 'shake', face: -Math.PI / 2, at: 0.2 };
      const boss = { x: FW / 2 + 0.75, y: 49.6, vx: 0, vy: 0, team: 1, role: 'BOSS', num: 0, name: '', suit: true, act: 'stand', face: Math.PI / 2, lift: 0.45 };
      sc.me = me;
      sc.boss = boss;
      sc.cap = `<small>The draft · pick ${o.pick} of 8</small><b>The ${esc(t.city)} ${esc(t.name)} select ${esc(o.name)}</b><span>${o.pos === 'WR' ? 'Wide receiver' : 'Quarterback'} · #${o.num}</span>`;
      return [me, boss];
    },
    update(sc) {
      sc.me.lift = sc.me.x > FW / 2 - 4.9 ? 0.45 : 0;  // up the step onto the stage
    },
    cues: [
      [0.4, sc => {
        const o = sc.o;
        if (PG.audio && PG.audio.pa) PG.audio.pa(`With pick number ${o.pick}, the ${TEAMS[o.team].city} ${TEAMS[o.team].name} select ${o.name}.`, { announcer: true, anywhere: true, wait: 0.1,
          clips: ['pa.draft.' + o.pick, 'pa.select.' + vk(o.team)].concat(o.pos === 'QB' ? ['pa.qb'] : o.pos === 'WR' ? ['pa.wr'] : []) });
      }],
      [2.7, sc => (sc.boss.act = 'shake')],
      [4.5, sc => {
        sc.me.act = 'hold';
        sc.me.face = Math.PI;  // to the cameras
        sc.boss.act = 'clap';
        snd('fanfare');
        confetti(0);
      }],
    ],
  };

  /* The podium: before the questions, you behind it in a team hoodie and cap, hands on it, a cluster of microphones
     in front and the team's backdrop behind, cameras flashing. */
  SCENES.podium = {
    dur: 4.2,
    setup(sc) {
      const o = sc.o, t = TEAMS[o.team];
      const me = { x: FW / 2, y: 50.4, vx: 0, vy: 0, team: 0, role: 'QB', num: o.num, name: o.name, act: 'podium', face: Math.PI, hoodie: true };
      sc.me = me;
      sc.cap = `<small>Postgame · ${esc(o.head || '')}</small><b>${esc(o.name)} at the podium</b>`;
      return [me];
    },
    cues: [[0.3, () => snd('tick')], [1.1, () => snd('tick')], [2.4, () => snd('tick')]],
  };

  /* The hall of fame: a stage at midfield under the hall's board, your bust on a pedestal under a cloth in team colors,
     you beside it in a dark jacket. A drum roll, the cloth comes off, you wave to the applause. */
  SCENES.hof = {
    dur: 7.4,
    setup(sc) {
      const o = sc.o;
      const me = { x: FW / 2 - 0.7, y: 49.9, vx: 0, vy: 0, team: 0, role: 'QB', num: o.num, name: o.name, suit: true, act: 'stand', face: Math.PI, lift: 0.45 };
      sc.me = me;
      sc.cap = `<small>Hall of fame · class ${o.cls}</small><b>${esc(o.name)}</b><span>${esc(o.pos)} · ${o.seasons} season${o.seasons === 1 ? '' : 's'}${o.rings ? ` · ${o.rings} title${o.rings > 1 ? 's' : ''}` : ''}</span>`;
      return [me];
    },
    cues: [
      [1.3, () => snd('roll', { dur: 1.3 })],
      [2.7, sc => {
        snd('applause', { level: 0.85, dur: 3.6 });
        snd('fanfare');
        confetti(0);
        const c = $('#scn .cap');
        if (c) c.innerHTML = `<small>Hall of fame · class ${sc.o.cls}</small><b>${esc(sc.o.name)} is inducted</b><span>${esc(sc.o.verdict || '')}</span>`;
      }],
      [3.1, sc => (sc.me.act = 'wave')],
    ],
  };
  const esc = x => String(x).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  function endIntro() {
    if (G.state !== 'intro') return;
    scr.innerHTML = '';
    G.state = 'dead';
    banner('Kickoff', tname(G.first) + ' ball', 1500);
    cam.snap = true;
    if (!G.welcomed) welcome();
    startCall();
  }

  /* the stadium announcer welcomes everybody as the teams line up for the opening kick, and the crowd roars back */
  function welcome() {
    if (AUTO || QUIET || G.drill || !PG.audio || !PG.audio.pa) return;
    const a = PG.audio, home = TEAMS[G.tm[G.home || 0]], len = a.pa('Ladies and gentlemen, welcome to ' + home.name + ' football!', { announcer: true, wait: 0.3, clips: ['pa.welcome.' + vk(G.tm[G.home || 0])] });
    if (len) setTimeout(() => {
      if (G.ros && G.state !== 'menu' && G.state !== 'over') a.crowd.cheer(0.7, 2.5);
    }, Math.max(400, len * 1000 - 350));
  }

  /* ---------- play setup ---------- */
  function mkRoute(p, name, dir) {
    const d = ROUTES[name], s = d.abs ? 1 : (p.x < G.bx - 0.01 ? 1 : -1);
    const pts = d.p.map(([x, y]) => [clamp(p.x + x * s, 1.5, FW - 1.5), clamp(p.y + dir * y, -8.5, 108.5)]);
    const n = pts.length, a = n > 1 ? pts[n - 2] : [p.x, p.y], b = pts[n - 1], l = hyp(b[0] - a[0], b[1] - a[1]) || 1;
    return { pts, stop: !!d.stop, lx: (b[0] - a[0]) / l, ly: (b[1] - a[1]) / l };
  }

  function mkP(team, role, x, y) {
    const r = G.ros[team][role], ol = role in OLX;
    const p = { team, role, x, y, vx: 0, vy: 0, dvx: 0, dvy: 0, spd: r.spd, acc: ol || role[0] === 'D' ? 9 : 13, rt: r.rt, num: r.num, name: r.name,
      eng: null, block: null, shed: 0, immune: 0, beat: 0, stun: 0, down: false, tcd: 0, route: null, wp: 0, juke: 0, jcd: 0, dive: 0, anim: rnd(6), rd: 0, isOL: ol, asg: null, man: null,
      callT: 0, manT: 0, bt: null, rx: rnd(0.2, 0.45), thrT: 0, spinT: 0, fell: 0, jog: 0,
      stiff: 0, truck: 0, hurdle: 0, pcd: 0, hcd: 0, hit: 0, strip: 0, dcd: 0, flat: 0, sl: 0 };  // move timers: power, hurdle, hit stick, strip, knocked flat
    if (r.x) Object.assign(p, r.x);
    p.sx = x;
    p.sy = y;
    P.push(p);
    return p;
  }

  /* Lines both teams up for G.op against G.dp. With shift = true it is a change at the line (an audible or a flip):
     the same snap, so nothing is counted again and the players slide to their new spots instead of breaking a huddle. */
  /* punts are returned live when you run the whole team, or in a career when you are the returner; simulations and
     practice take a simulated return */
  const liveReturn = () => !AUTO && !QUIET && !G.drill && (!G.lock || G.kr);

  /* a career receiver back deep for a punt: the man fielding it is him (his number, name, speed and hands) */
  function asHero(p) {
    const h = G.ros[0][G.lock];
    Object.assign(p, { spd: h.spd, rt: h.rt, num: h.num, name: h.name }, h.x || {});
    p.hero = true;
    return p;
  }

  /* line calls: each rusher (linemen first, outside in, then blitzers) gets the nearest free blocker across from him.
     slide (yards, + toward larger x): the line is sliding that way, so each blocker counts as standing that much
     further over, takes the man to that side, and the far edge is the one left for a back. */
  function lineCalls(off, los, bx, slide) {
    for (const o of P) if (o.isOL) o.bt = null;
    const rush = P.filter(p => p.team !== off && p.asg === 'rush').sort((a, b) => Math.abs(a.y - los) - Math.abs(b.y - los) || Math.abs(b.x - bx) - Math.abs(a.x - bx)), taken = new Set();
    for (const r of rush) {
      let b = null, bd = 1e9;
      for (const o of P) {
        if (!o.isOL || taken.has(o)) continue;
        const q = Math.abs(o.x + slide - r.x);
        if (q < bd) {
          bd = q;
          b = o;
        }
      }
      if (b) {
        taken.add(b);
        b.bt = r;
      }
    }
  }

  function setupPlay(shift) {
    const was = shift ? Object.fromEntries(P.map(p => [p.team + p.role, [p.x, p.y]])) : null, selRole = shift && G.sel ? G.sel.role : null;
    if (!shift) {
      if (!AUTO && !QUIET && G.op.cat !== 'special') healStep();
      G.cadence = false;  // the quarterback has not called it out yet
      G.dcall = false;  // nor the defense
      G.sig = null;  // what the officials signal after the play: 'td', 'fd', 'inc', 'to' (a timeout, or the two-minute warning)
      if (!G.drive || G.drive.team !== G.poss || G.drive.done) G.drive = { team: G.poss, plays: 0, y0: G.los, done: false, q0: G.q, c0: G.clock };  // a new possession
      G.drive.plays++;
      if (G.op.cat !== 'special') {
        // what each side has called this game, for the play callers (they avoid repeating themselves)
        (G.called || (G.called = [[], []]))[G.poss].push(G.op.n);
        (G.dcalled || (G.dcalled = [[], []]))[1 - G.poss].push(G.dp.n);
      }
    }
    const off = G.poss, dir = off === 0 ? 1 : -1, op = G.op, dp = G.dp, bx = G.bx, los = G.los, fl = G.flip ? -1 : 1;
    G.dir = dir;
    P = [];
    const mk = (team, role, dx, dy) => mkP(team, role, clamp(bx + dx, 1, FW - 1), los + dir * dy);
    for (const r of OLR) mk(off, r, OLX[r], -0.6);
    const f = FORM[op.f], o = {};
    for (const r in f) o[r] = mk(off, r, f[r][0] * fl, f[r][1]);  // fl mirrors the formation when the play is flipped
    const kick = op.cat === 'special';
    ps = { t: 0, mode: kick ? 'kick' : op.run ? 'run' : 'pass', rpo: !!op.rpo, offTeam: off, qb: o.QB, carrier: o.QB, thrown: false, air: null, caught: false, handoff: false, open: false, turnover: false,
      think: 0, scr: false, runner: null, recs: [], pa: !!op.pa, los, fd: G.fd, bx, drop: { x: clamp(bx + (op.roll || 0) * fl, 4, FW - 4), y: los - dir * (f && f.QB[1] <= -4 ? 7.5 : 6.5) }, kick: null, passer: null, tgt: null, tackler: null };
    if (kick) {
      o.QB.y = los - dir * (op.n === 'Punt' ? 13 : 7.5);
      o.RB.x = bx - 2.5;
      o.RB.y = los - dir * 2;
      o.FB.x = bx + 2.5;
      o.FB.y = los - dir * 2;
      o.X.x = bx - 6;
      o.Z.x = bx + 7.5;
    }
    if (ps.mode === 'run') {
      const rn = o[op.run.who];
      ps.runner = rn;
      rn.path = op.run.path.map(([x, y]) => [bx + x * fl, los + dir * y]);
      rn.pi = 0;
    }
    if (!kick) for (const r in f) {
      if (r === 'QB') continue;
      let nm = (op.r || {})[r];
      if (G.flip && nm && ROUTES[nm] && ROUTES[nm].abs) nm = nm.replace(/[LR]$/, m => (m === 'L' ? 'R' : 'L'));  // routes that name a side swap sides
      if (nm && ROUTES[nm]) {
        o[r].route = mkRoute(o[r], nm, dir);
        o[r].rn = nm;
        if (ps.mode === 'pass' || ps.rpo) ps.recs.push(o[r]);
      }
    }
    ps.recs.sort((a, b) => a.x - b.x).forEach((p, i) => {
      p.let = (GP.on ? GLET : 'ABCDE')[i];  // with a controller, the button that throws to him
      p.col = LCOL[i];
    });
    const el = P.filter(p => !p.isOL && p !== o.QB), byx = [...el].sort((a, b) => a.x - b.x), d = {};
    for (const r of DEFR) {
      let [dx, dy] = DPOS[r];
      const a = kick ? 'rush' : (dp.a[r] || 'rush'), al = !kick && !G.drill && dp.al && dp.al[r];  // training camp keeps the plain spots it was tuned on
      if (al) {
        // the call's own look before the snap: a safety down in the box, a blitzer walked up
        dx += al[0];
        dy += al[1];
      }
      if (r === 'CB1') {
        dx = byx[0].x - bx;
        if (a === 'man') dy = 3.5;
      }
      if (r === 'CB2') {
        dx = byx[byx.length - 1].x - bx;
        if (a === 'man') dy = 3.5;
      }
      const p = mk(1 - off, r, dx, dy);
      p.asg = typeof a === 'string' ? a : 'zone';
      if (p.asg === 'zone') {
        p.zx = clamp(bx + a.z[0], 3, FW - 3);
        p.zy = los + dir * a.z[1];
        p.deep = !!a.deep;
      }
      d[r] = p;
    }
    /* On a run-pass option each underneath zone defender either steps up at the run fake or sits in his zone: that is
       the read. (Only when such a play is called, which the computer never does, so seeded runs are not disturbed.) */
    if (ps.rpo) for (const r of DEFR) if (d[r].asg === 'zone' && !d[r].deep && /LB/.test(r)) d[r].bite = rnd() < 0.4 ? 0.55 : 0.08;
    const free = new Set(el), take = (p, t) => {
      p.man = t;
      free.delete(t);
    };
    if (d.CB1.asg === 'man') take(d.CB1, byx[0]);
    if (d.CB2.asg === 'man') take(d.CB2, byx[byx.length - 1]);
    for (const r of ['SS', 'OLB1', 'OLB2', 'FS', 'MLB']) {
      const p = d[r];
      if (p.asg !== 'man') continue;
      let b = null, bd = 1e9;
      for (const t of free) {
        const q = dist(p, t) + (t.route ? 0 : 8);
        if (q < bd) {
          bd = q;
          b = t;
        }
      }
      if (b) take(p, b);
      else {
        p.asg = 'zone';
        p.zx = bx;
        p.zy = los + dir * 8;
        p.deep = false;
      }
    }
    lineCalls(off, los, bx, 0);
    ps.third = G.down === 3 && !kick ? off : null;  // counted when it ends: third downs tried and made
    ps.down0 = G.down;
    if (kick && op.n === 'Punt' && liveReturn()) {
      // the free safety drops back to field the punt
      const r = d.FS;
      r.x = FW / 2;
      r.y = clamp(los + dir * 40, 5, 95);
      r.asg = 'ret';
      ps.ret = r;
      if (r.team === 0 && G.lock && G.kr) asHero(r);
    }
    /* captains wear the patch (drawn by render3d.js): each side's quarterback and middle linebacker, and in a career
       you, once you are the starter */
    for (const p of P) p.capt = !kick && !G.drill && (p.role === 'QB' || p.role === 'MLB' || (!!G.lock && p.team === 0 && p.role === G.lock && G.share >= 0.99));
    if (G.lock && G.sit && G.bench && off === 0 && !kick && G.share < 1 && !G.drill) {
      // a drive you sit out: the backup is the one on the field, under his own name and number
      const b = P.find(p => p.team === 0 && p.role === G.lock), h = G.bench;
      if (b) Object.assign(b, { spd: h.spd, rt: h.rt, num: h.num, name: h.name, look: null, capt: false }, h.x || {});  // and he is dressed like the rest of the team, not in your gear
    }
    G.me = G.lock && !kick && !(G.watch && G.wd && G.wd.own) ? (P.find(p => p.team === 0 && p.role === G.lock) || null) : ps.ret && ps.ret.hero ? ps.ret : null;
    G.sel = G.lock ? G.me : off === 1 ? (selRole && d[selRole]) || d.MLB : null;
    for (const p of P) {
      p.sx = p.x;
      p.sy = p.y;
    }
    if (was) {
      for (const p of P) {
        // slide from where each man stood
        const w = was[p.team + p.role];
        if (!w) continue;
        p.x = w[0];
        p.y = w[1];
        const dd = hyp(p.sx - p.x, p.sy - p.y);
        if (dd > 0.15) p.jog = Math.max(3, dd / 0.7);
      }
      return;
    }
    if (!AUTO && !QUIET && !kick) {
      // break the huddle: both sides start bunched up and jog to their spots
      let io = 0, id = 0;
      for (const p of P) {
        const o = p.team === off, n = o ? io++ : id++, a = n / 11 * 6.283, r = o ? 1.9 : 3.2;
        p.x = clamp(bx + Math.cos(a) * r, 1, FW - 1);
        p.y = los + dir * (o ? -8.5 : 6) + Math.sin(a) * r * 0.7;
        p.jog = Math.max(3, hyp(p.sx - p.x, p.sy - p.y) / 1.1);
      }
    }
    camUpd(0, true);
  }

  /* ---------- pre-snap motion ----------
     One man goes in motion before the snap: 'zip' (in toward the formation, then set), 'across' (behind the line to
     the other side, then set), 'jet' (full speed across, the ball snapped as he passes it) or 'orbit' (from the slot in
     front of a shotgun quarterback, round behind him and back toward his own side, snapped as he comes round). He steps
     off the line first, so he is a back while he moves. His route is built again from where he is at the snap, so a man
     who has crossed runs it to his new side. A defender in man coverage runs with him; a zone shifts instead, the
     safeties and linebackers sliding toward where he is going: that is the quarterback's read. On a jet sweep the man
     in motion is the ball carrier: the snap comes as he reaches the quarterback, and he takes it on the run. Only in
     games someone is watching (simulations never use it, so seeded runs are unchanged). */
  function planMotion(kind, who) {
    if (AUTO || QUIET || G.drill || !ps || ps.mot || (ps.mode !== 'pass' && ps.mode !== 'run')) return null;
    const off = ps.offTeam, bx = ps.bx, los = ps.los, dir = G.dir, gun = Math.abs(ps.qb.sy - los) > 3;
    const cand = who ? [who] : P.filter(p => p.team === off && p !== ps.runner && /^(X|Z|S|S2)$/.test(p.role) && Math.abs(p.sx - bx) >= 6);
    if (!cand.length) return null;
    const p = cand[Math.floor(Math.random() * cand.length)], side = Math.sign(p.sx - bx) || 1;
    if (!kind) {
      const r = Math.random();
      kind = r < 0.25 ? 'zip' : r < 0.55 ? 'across' : r < 0.8 ? 'jet' : 'orbit';
    }
    if (kind === 'orbit' && !(gun && /^S/.test(p.role) && Math.abs(p.sx - bx) < 11 && !P.some(q => q.team === off && q.role === 'RB' && Math.abs(q.sx - bx) < 1))) kind = 'across';  // a slot, a shotgun, nobody straight behind
    if (kind === 'jet' && ps.mode === 'pass' && !p.route) kind = 'across';
    const dm = kind === 'zip' ? 1.6 : gun ? 2.2 : 3.2, ty = los - dir * dm, Y = d => los - dir * d;
    let pts;
    if (kind === 'jet') pts = [[clamp(bx - side * 12, 3, FW - 3), ty]];
    else if (kind === 'orbit') pts = [[bx + side * 2.5, Y(2.2)], [bx - side * 2.6, Y(3)], [bx - side * 3.6, Y(6.2)], [bx - side * 1.5, Y(7.8)], [bx + side * 2, Y(7.6)], [bx + side * 6, Y(6.4)]];
    else {
      /* where he sets: the spot on that side farthest from everybody else in the backfield and the slots */
      const others = P.filter(q => q.team === off && q !== p && !q.isOL), at = Math.abs(p.sx - bx);
      let best = -1, tx;
      for (const a of [5.5, 7, 8.5, 10, 11.5]) {
        const x = bx + (kind === 'zip' ? side : -side) * a;
        if (x < 2.5 || x > FW - 2.5 || (kind === 'zip' && a > at - 2)) continue;
        const room = Math.min(...others.map(q => hyp(x - q.sx, ty - q.sy)));
        if (room > best) {
          best = room;
          tx = x;
        }
      }
      if (tx === undefined) return null;
      pts = [[tx, ty]];
    }
    for (const w of pts) w[0] = clamp(w[0], 2, FW - 2);
    const d = P.find(q => q.team !== off && q.asg === 'man' && q.man === p) || null;
    /* a zone slides toward where he is going: the deep men most, the linebackers some, the corners hold */
    const to = -side * (kind === 'zip' ? 0.4 : kind === 'orbit' ? 0.3 : 1);
    const zs = d ? [] : P.filter(q => q.team !== off && q.asg === 'zone').map(q => ({ q, x0: q.x, zx0: q.zx, k: to * (q.deep ? 2.6 : /LB/.test(q.role) ? 1.3 : /^SS|FS$/.test(q.role) ? 1.8 : 0) })).filter(z => z.k);
    ps.mot = { p, kind, side, pts, i: 0, x0: p.sx, v: kind === 'jet' ? Math.min(p.spd * 0.85, 8.5) : kind === 'zip' ? 4.2 : kind === 'orbit' ? 5.8 : 5.4, d, zs, go: false, done: false, ready: false, said: false,
      sweep: ps.mode === 'run' && p === ps.runner };
    return ps.mot;
  }

  function motionStep(dt) {
    const m = ps && ps.mot;
    if (!m || !m.go || m.done) return;
    const p = m.p;
    let st = m.v * dt;
    while (st > 0 && m.i < m.pts.length) {
      const [tx, ty] = m.pts[m.i], dx = tx - p.x, dy = ty - p.y, dd = hyp(dx, dy);
      if (dd <= st) {
        p.x = tx;
        p.y = ty;
        st -= dd;
        m.i++;
      } else {
        p.vx = dx / dd * m.v;
        p.vy = dy / dd * m.v;
        p.x += dx / dd * st;
        p.y += dy / dd * st;
        st = 0;
      }
    }
    p.anim += m.v * dt;
    if (m.i >= m.pts.length) {
      p.vx = p.vy = 0;
      m.done = true;
    }
    if (p.rn && p.route) p.route = mkRoute(p, p.rn, G.dir);  // his route moves with him
    const q = m.d;
    if (q && !q.down) {
      // his man runs with him, staying at his own depth
      const ex = p.x - q.x, mv = Math.min(Math.abs(ex), m.v * 1.1 * dt);
      q.vx = Math.abs(ex) < 0.05 ? 0 : Math.sign(ex) * m.v * 1.1;
      q.vy = 0;
      q.x += Math.sign(ex) * mv;
      q.anim += mv;
    }
    /* the zone's slide follows how far he has gone */
    const last = m.pts[m.pts.length - 1][0], f = clamp(Math.abs(p.x - m.x0) / Math.max(1, Math.abs(last - m.x0)), 0, 1);
    for (const z of m.zs) {
      const nx = clamp(z.x0 + z.k * f, 1, FW - 1), mv = nx - z.q.x;
      z.q.vx = Math.abs(mv) > 0.002 ? mv / dt : 0;
      z.q.x = nx;
      z.q.anim += Math.abs(mv);
      if (z.zx0 !== undefined) z.q.zx = clamp(z.zx0 + z.k * f, 3, FW - 3);
    }
    const crossed = (p.x - ps.bx) * -m.side;
    if (!m.ready) {
      if (m.sweep) m.ready = crossed >= -3.2 || m.done;  // a jet sweep: snapped a few yards before he reaches the quarterback
      else if (m.kind === 'jet') m.ready = crossed >= 1.5 || m.done;
      else if (m.kind === 'orbit') m.ready = m.i >= 4 || m.done;  // coming back round behind the quarterback
      else m.ready = m.done;
    }
    if (!m.said && (m.done || (m.kind !== 'orbit' && crossed > 0.5) || (m.kind === 'orbit' && m.i >= 3))) {
      m.said = true;
      if (userP(ps.qb) && !m.sweep) toast(m.d ? `Man coverage · #${m.d.num} went with him` : m.zs.length ? 'Zone · the safeties slid over' : 'Zone · nobody went with him');  // the read
    }
  }

  /* A shift: the offense lines up in another formation with the same men (or the mirror of this one), then on the
     quarterback's word everybody moves to the called formation at once and sets for a full second before the snap, as
     the rules ask. Nobody moves more than twelve yards. The corners walk out over whoever is outside. Like motion, only
     in games someone is watching. */
  function planShift() {
    if (AUTO || QUIET || G.drill || !ps || ps.mot || ps.sh || (ps.mode !== 'pass' && ps.mode !== 'run')) return null;
    const off = ps.offTeam, bx = ps.bx, los = ps.los, dir = G.dir, B = FORM[G.op.f];
    if (!B) return null;
    const roles = k => Object.keys(FORM[k]).filter(r => r !== 'QB').sort().join(), f0 = G.flip ? -1 : 1;
    /* every way to start: each formation with the same men, either way round, and the mirror of this one */
    const opts = Object.keys(FORM).filter(k => k !== G.op.f && roles(k) === roles(G.op.f)).flatMap(k => [[k, f0], [k, -f0]]).concat([[null, -f0]]);
    const build = ([fk, fl]) => {
      const A = fk ? FORM[fk] : B, men = [];
      for (const p of P) {
        if (p.team !== off || p.isOL || p === ps.qb || !A[p.role]) continue;
        const x = clamp(bx + A[p.role][0] * fl, 1.5, FW - 1.5), y = los + dir * A[p.role][1], d = hyp(x - p.sx, y - p.sy);
        if (d < 1 || d > 12) continue;
        men.push({ p, x, y, bx: p.sx, by: p.sy });
      }
      return { fk, men };
    };
    const ok = opts.map(build).filter(o => o.men.length >= 2);
    if (!ok.length) return null;
    const { fk, men } = ok[Math.floor(Math.random() * ok.length)];
    for (const m of men) {
      m.p.sx = m.x;
      m.p.sy = m.y;
      if (m.p.jog) m.p.jog = Math.max(3, hyp(m.p.x - m.x, m.p.y - m.y) / 1.1);
    }
    ps.sh = { men, ph: 'from', t: 0, from: fk };
    return ps.sh;
  }

  function shiftStep(dt) {
    const s = ps && ps.sh;
    if (!s) return;
    if (s.ph === 'from' && G.cadence && G.preT > 1 && !P.some(p => p.jog)) {
      s.ph = 'move';  // everybody at once
      for (const m of s.men) {
        m.p.sx = m.bx;
        m.p.sy = m.by;
        m.p.jog = clamp(hyp(m.p.x - m.bx, m.p.y - m.by) / 0.9, 3, m.p.spd * 0.7);
      }
    } else if (s.ph === 'move' && !P.some(p => p.jog)) {
      s.ph = 'set';
      s.t = 0;
    } else if (s.ph === 'set' && (s.t += dt) >= 1) s.ph = 'done';  // a full second set
    // the corners walk out over the outside men
    const sk = P.filter(p => p.team === ps.offTeam && !p.isOL && p !== ps.qb);
    if (!sk.length) return;
    const lo = Math.min(...sk.map(p => p.x)), hi = Math.max(...sk.map(p => p.x));
    for (const p of P) if (p.team !== ps.offTeam && (p.role === 'CB1' || p.role === 'CB2')) {
      const ex = (p.role === 'CB1' ? lo : hi) - p.x, mv = Math.min(Math.abs(ex), 6 * dt);
      p.vx = Math.abs(ex) < 0.05 ? 0 : Math.sign(ex) * 6;
      p.vy = 0;
      p.x += Math.sign(ex) * mv;
      p.anim += mv;
      p.sx = p.x;
    }
  }

  /* the user's quarterback sends a receiver in motion: across on a pass, a jet on a run */
  function userMotion() {
    if (G.state !== 'pre' || !ps || ps.mot || (ps.mode !== 'pass' && ps.mode !== 'run') || P.some(p => p.jog) || !userP(ps.qb)) return;
    const m = planMotion(ps.mode === 'run' ? 'jet' : 'across');
    if (!m) return toast('Nobody to send in motion from this formation');
    m.go = true;
    G.pad = null;  // the button goes: one man in motion a play
  }

  function jogIn(dt) {
    for (const p of P) {
      if (!p.jog) continue;
      const dx = p.sx - p.x, dy = p.sy - p.y, d = hyp(dx, dy), st = p.jog * dt;
      if (d <= st) {
        p.x = p.sx;
        p.y = p.sy;
        p.vx = p.vy = 0;
        p.jog = 0;
      } else {
        p.vx = dx / d * p.jog;
        p.vy = dy / d * p.jog;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.anim += p.jog * dt;
      }
    }
  }

  /* ---------- AI ---------- */
  function seek(p, x, y, f = 1, fast) {
    const dx = x - p.x, dy = y - p.y, d = hyp(dx, dy);
    if (d < 0.05) {
      p.dvx = p.dvy = 0;
      return d;
    }
    const s = p.spd * f * (fast ? 1 : Math.min(1, d / 0.9 + 0.12));
    p.dvx = dx / d * s;
    p.dvy = dy / d * s;
    return d;
  }

  function pursue(p, c) {
    const t = Math.min(1.5, dist(p, c) / p.spd) * 0.95;
    seek(p, c.x + c.vx * t, c.y + c.vy * t, 1, true);
  }

  function openField(a, b) {
    if (ps.open) return;
    ps.open = true;
    for (const d of P) if (d.team !== ps.offTeam) d.rd = d === G.me ? 0.05 : rnd(a, b) + (/CB|FS|SS/.test(d.role) ? 0.25 : 0) + (d.asg === 'man' ? 0.3 : 0);
  }

  function release(d) {
    if (d.eng) {
      d.eng.block = null;
      d.eng = null;
    }
  }

  function engage(b, d, pro) {
    d.eng = b;
    b.block = d;
    d.shed = (pro ? rnd(1.5, 3.8) : rnd(1.2, 2.7)) * Math.pow(b.rt / (d.shd ?? d.rt), 2) * (b.isOL ? 1 : 0.45);
  }

  function followRoute(p) {
    const r = p.route;
    if (p.wp < r.pts.length) {
      const w = r.pts[p.wp], nx = r.pts[p.wp + 1], dx = w[0] - p.x, dy = w[1] - p.y, d = hyp(dx, dy) || 1;
      /* A hard break is run under control: he throttles down over the last few yards so he can plant and cut at the
         mark. At full speed he ran two or three yards past it, and a ball thrown to the break (a curl, a hitch, an in)
         came down with nobody there. The sharper the turn, the more he slows; a stop at the end is the sharpest. */
      const ox = nx ? nx[0] - w[0] : r.stop ? -dx : r.lx, oy = nx ? nx[1] - w[1] : r.stop ? -dy : r.ly, ol = hyp(ox, oy) || 1;
      const turn = Math.acos(clamp((dx * ox + dy * oy) / (d * ol), -1, 1)), sharp = clamp((turn - 0.7) / 1.7, 0, 1);
      const f = sharp > 0 && d < 3.5 ? lerp(1 - 0.62 * sharp, 1, d / 3.5) : 1;
      if (seek(p, w[0], w[1], f, true) < 0.7) {
        p.wp++;
        p.cut = sharp;  // how hard that break was, and when: for the next half second he is still coming out of it
        p.cutAt = ps.t;
      }
    } else if (r.stop) {
      p.dvx = p.dvy = 0;
    } else {
      const tx = clamp(p.x + r.lx * 5, 1.5, FW - 1.5), ty = clamp(p.y + r.ly * 5, -8.5, 108.5);
      if (hyp(tx - p.x, ty - p.y) < 1) p.dvx = p.dvy = 0;
      else seek(p, tx, ty, 1, true);
    }
  }

  const passPro = () => ps.mode === 'pass' && !ps.thrown && !ps.open && !ps.turnover;

  /* a lineman keeps his assigned rusher until the play breaks into the open field or he gets beaten */
  const btValid = p => {
    const t = p.bt;
    return !!t && !ps.open && !ps.turnover && p.beat <= 0 && !t.down && t.stun <= 0 && (!t.eng || t.eng === p);
  };

  function blockAI(p, cl) {
    if (p.block) return;
    const prot = ps.carrier || (ps.air ? { x: ps.air.x1, y: ps.air.y1 } : ps.qb), pro = passPro();
    let best = null, bs = 1e9;
    if (btValid(p)) best = p.bt;
    else for (const o of P) {
      const help = pro && p.stayIn && cl.has(o);  // a man kept in to block has no rusher of his own: he helps on one who is still coming free
      if (o.team === p.team || o.down || o.eng || o.stun > 0 || (cl.has(o) && !help)) continue;
      const dc = dist(o, prot);
      if (pro && !(o.asg === 'rush' || dc < 6)) continue;
      let s = dist(p, o) + dc * 0.6 + (help ? 2.5 : 0);
      if (pro && ps.slide && p.isOL) s -= ps.slide * Math.sign(o.x - ps.bx) * 2.2;  // the line is sliding that way: each man looks to that side first
      if (s < bs) {
        bs = s;
        best = o;
      }
    }
    if (best && dist(p, best) < (pro ? 9 : 15)) {
      cl.add(best);
      let ux = prot.x - best.x, uy = prot.y - best.y;
      const l = hyp(ux, uy) || 1;
      if (pro && p.stayIn) {
        /* a back or tight end kept in by Max protect: he does not chase the rusher (who ran past him every time), he
           steps up into the man's path a couple of yards in front of the quarterback and meets him there */
        const gap = Math.min(2.2, l * 0.6);
        seek(p, prot.x - ux / l * gap, prot.y - uy / l * gap, 1, true);
        if (dist(p, best) < 1.7 && best.immune <= 0 && p.beat <= 0 && best.dive <= 0) engage(p, best, pro);
        return;
      }
      seek(p, best.x + ux / l * 0.9, best.y + uy / l * 0.9, 1, true);
      if (dist(p, best) < 1.3 && best.immune <= 0 && p.beat <= 0 && best.dive <= 0) engage(p, best, pro);
    } else if (pro) seek(p, p.sx, p.sy - G.dir * 1.2);
    else {
      const td = p.team === 0 ? 1 : -1;
      seek(p, lerp(p.x, prot.x, 0.3), prot.y + td * 5, 0.9, true);
    }
  }

  function zoneAI(d) {
    const dir = G.dir;
    if (d.fakeT > ps.t && ps.fake && !ps.thrown) {
      seek(d, ps.fake.x, ps.fake.y, 1, true);  // he bit on the pump fake: for a moment he is driving on a throw that never came
      return;
    }
    let tx = d.zx, ty = d.zy, b = null, bs = 1e9;
    for (const r of P) {
      if (r.team === d.team || !r.route) continue;
      if (d.deep) {
        if (Math.abs(r.x - d.zx) > 13) continue;
        const dep = (r.y - ps.los) * dir;
        if (dep < 8) continue;
        if (-dep < bs) {
          bs = -dep;
          b = r;
        }
      } else {
        const s = hyp(r.x - d.zx, r.y - d.zy);
        if (s < 8.5 && s < bs) {
          bs = s;
          b = r;
        }
      }
    }
    if (b) {
      if (d.deep) {
        tx = lerp(d.zx, b.x, 0.75);
        ty = ps.los + dir * Math.max((d.zy - ps.los) * dir, (b.y - ps.los) * dir + 3);
      } else {
        tx = lerp(d.zx, b.x + b.vx * 0.3, 0.8);
        ty = lerp(d.zy, b.y + b.vy * 0.3, 0.8) + dir * 0.5;
      }
    }
    if (ps.rpo && !ps.handoff && !ps.thrown && d.bite) {
      // stepping up to stop the run he thinks he sees
      tx = lerp(tx, ps.bx, d.bite * 0.5);
      ty = lerp(ty, ps.los + dir * 1.2, d.bite);
    }
    seek(d, tx, ty, 1, !!b);
  }

  function defAI(d) {
    const a = ps.air, c = ps.carrier;
    if (a) {
      if (a.t < d.rx) return;
      if (hyp(a.x1 - d.x, a.y1 - d.y) < 9 || d.man === a.target) seek(d, a.x1, a.y1, 1, true);
      else d.dvx = d.dvy = 0;
      return;
    }
    if (!c) {
      d.dvx = d.dvy = 0;
      return;
    }
    if (d.asg === 'rush' || (ps.open && d.rd <= 0)) {
      pursue(d, c);
      return;
    }
    if (d.asg === 'man' && d.man) {
      const m = d.man;
      seek(d, m.x + m.vx * 0.15, m.y + m.vy * 0.15 + G.dir * 0.9, 0.97 * (1 + ((d.cov ?? 80) - 80) * 0.0025), true);
      return;
    }
    zoneAI(d);
  }

  function offAI(p, cl) {
    const a = ps.air;
    if (ps.mode === 'pass' && !ps.open) {
      if (a && a.target === p) {
        seek(p, a.x1, a.y1, 1, true);
      } else if (p.route && !(a && p.wp >= p.route.pts.length)) followRoute(p);
      else blockAI(p, cl);
      return;
    }
    if (p === ps.qb) {
      p.dvx = p.dvy = 0;
      return;
    }
    if (ps.mode === 'run' && !ps.handoff && p === ps.runner) {
      const w = p.path[p.pi];
      if (ps.rpo) seek(p, w[0], w[1], 0.6, true);  // a run-pass option: he rides the mesh beside the quarterback until the ball is his
      else if (w && seek(p, w[0], w[1], 1, true) < 1) p.pi++;
      return;
    }
    if (ps.mode === 'run' && p.route && ps.t < 1.5) {
      followRoute(p);
      return;
    }
    blockAI(p, cl);
  }

  function carrierAI(p) {
    const td = p.team === 0 ? 1 : -1;
    let vx = 0;
    for (const o of P) {
      if (o.team === p.team || o.down || o.stun > 0) continue;
      const dx = p.x - o.x, ay = (o.y - p.y) * td, d = hyp(dx, o.y - p.y);
      if (d > 9 || ay < -1.5) continue;
      vx += (dx >= 0 ? 1 : -1) * (9 - d) / 9 * (o.eng ? 0.4 : 1) * 1.6 * (Math.abs(dx) < 4 ? 1 : 0.4);
      if (d < 1.8 && p.jcd <= 0 && rnd() < 2.5 * SDT) doJuke(p, dx >= 0 ? 1 : -1);  // a rate, so it is the same at any frame rate
      else if (d < 2.2 && ay > 0.5 && p.pcd <= 0 && p.juke <= 0 && rnd() < 1.1 * SDT) doPower(p);
    }
    if (p.x < 5) vx += (5 - p.x) * 0.5;
    if (p.x > FW - 5) vx -= (p.x - (FW - 5)) * 0.5;
    vx = clamp(vx, -1.3, 1.3);
    const m = hyp(vx, 1) / 0.93;
    p.dvx = vx / m * p.spd;
    p.dvy = td / m * p.spd;
  }

  function doJuke(p, s) {
    p.juke = 0.38 * (1 + ((p.jk ?? 75) - 75) * 0.012);
    p.jcd = 1.3;
    p.vx += s * 6;
    snd('juke');
  }

  function doSpin(p) {
    p.juke = 0.5 * (1 + ((p.jk ?? 75) - 75) * 0.012);
    p.jcd = 1.7;
    p.spinT = 0.5;
    p.vx *= 0.85;
    p.vy *= 0.85;
    snd('juke');
  }

  /* Power: lower the shoulder into a tackler who is right in front (truck), otherwise throw out a stiff arm */
  function doPower(p) {
    let near = null, nd = 3.4;
    for (const o of P) if (o.team !== p.team && !o.down && o.stun <= 0) {
      const d = dist(o, p);
      if (d < nd) {
        nd = d;
        near = o;
      }
    }
    const sp = hyp(p.vx, p.vy) || 1, ahead = near ? ((near.x - p.x) * p.vx + (near.y - p.y) * p.vy) / (nd * sp) : 0;
    if (near && nd < 2.5 && ahead > 0.6) p.truck = 0.55;
    else p.stiff = 0.75;
    p.pcd = 1.6;
    snd('juke');
  }

  /* Hurdle: over a diving tackler or a man on the ground; risky if someone is standing there to meet you */
  function doHurdle(p) {
    p.hurdle = 0.5;
    p.hcd = 1.8;
    snd('juke');
  }

  function manual(p) {
    const b = inp.sprint && G.stam > 0.02 ? 1.15 : 1;
    p.dvx = inp.x * p.spd * b;
    p.dvy = inp.y * p.spd * b;
  }

  function lead(r, T) {
    let x = r.x, y = r.y, rem = r.spd * T * 0.93;
    const rt = r.route;
    if (!rt || r.manT > 0) return [clamp(x + r.vx * T, 1.5, FW - 1.5), clamp(y + r.vy * T, -8.5, 108.5)];
    if (r.cut > 0 && ps.t - r.cutAt < 0.7) rem = Math.max(0, rem - r.spd * 0.6 * r.cut * (1 - (ps.t - r.cutAt) / 0.7));  // just out of a break: not yet up to speed on the new line
    let i = r.wp;
    while (rem > 0 && i < rt.pts.length) {
      const w = rt.pts[i], d = hyp(w[0] - x, w[1] - y);
      if (d <= rem) {
        /* a break costs him ground: he slows into it and has to get going again (see followRoute), so the sharper
           the cut, the less far past it he will be */
        const nx = rt.pts[i + 1], ox = nx ? nx[0] - w[0] : rt.lx, oy = nx ? nx[1] - w[1] : rt.ly, ol = hyp(ox, oy) || 1;
        const turn = d > 0.01 && (nx || !rt.stop) ? Math.acos(clamp(((w[0] - x) * ox + (w[1] - y) * oy) / (d * ol), -1, 1)) : 0;
        x = w[0];
        y = w[1];
        rem = Math.max(0, rem - d - r.spd * 0.5 * clamp((turn - 0.7) / 1.7, 0, 1));
        i++;
      } else {
        x += (w[0] - x) / d * rem;
        y += (w[1] - y) / d * rem;
        rem = 0;
      }
    }
    if (rem > 0 && !rt.stop) {
      x += rt.lx * rem;
      y += rt.ly * rem;
    }
    return [clamp(x, 1.5, FW - 1.5), clamp(y, -8.5, 108.5)];
  }

  function pressure(q) {
    for (const o of P) if (o.team !== q.team && !o.down && !o.eng && o.stun <= 0 && dist(o, q) < 3.2) return true;
    return false;
  }

  const armRange = q => 32 + ((q.pow ?? q.rt) - 60) * 0.55;

  /* type: 'bullet' (flat and fast), 'lob' (high and slow), or undefined for the default arc */
  /* Your throw: holding a receiver's letter (on the field, on the pad, or its number key) fills the power bar, and
     letting go throws with that much on the ball. A quick tap floats it; a full bar fires it. */
  const CHARGE = 0.55;  // seconds from an empty bar to a full one
  const RPO_T = 0.7;  // how long the quarterback holds a run-pass option before the back takes the ball

  /* The pump fake: the arm goes through the start of a throw and comes back. For those four tenths of a second he
     cannot throw (the rush keeps coming). It is sold to the shortest route on the field: zone defenders near that
     receiver may drive on him for half a second, and a deep safety over him may step down, which is what springs the
     route behind them. Good coverage men bite less. Once every second and a half; the computer never pumps. */
  function pumpFake() {
    const q = ps.qb;
    if (!canPass() || G.chg || q.pump > 0 || q.pumpCd > ps.t) return;
    q.pump = 0.42;
    q.pumpCd = ps.t + 1.5;
    const dir = G.dir;
    let r = null, best = 1e9;
    for (const x of ps.recs) if (x.route && !x.down) {
      const dep = (x.y - ps.los) * dir;
      if (dep > -1 && dep < best) {
        best = dep;
        r = x;
      }
    }
    if (!r) return;
    ps.fake = { x: r.x + r.vx * 0.3, y: r.y + r.vy * 0.3 };
    let bit = 0;
    for (const d of P) if (d.team !== q.team && d.asg === 'zone' && !d.down && hyp(d.x - r.x, d.y - r.y) < (d.deep ? 16 : 11)) {
      if (Math.random() < clamp((d.deep ? 0.4 : 0.65) - ((d.cov ?? 80) - 75) * 0.012, 0.15, 0.75)) {
        d.fakeT = ps.t + (d.deep ? 0.4 : 0.55);
        bit++;
      }
    }
    snd('tick');
    if (bit) toast(bit > 1 ? 'They bit on the pump' : 'He bit on the pump');
  }

  /* The quarterback's slide: past the line he gives himself up, feet first. The ball is dead where he starts it, and
     nobody may hit him: no fumble, and no chance of being shaken up. */
  function qbSlide() {
    const c = ps.carrier;
    if (AUTO || G.state !== 'live' || !c || c !== ps.qb || !userP(c) || c.down || ps.fum || (c.y - ps.los) * G.dir <= 0) return;
    c.down = true;
    c.slide = true;
    ps.slid = true;
    ps.tackler = null;
    toast('He slides');
    finish('tackle');
  }

  function startCharge(i, pid) {
    if (!canPass() || !ps.recs[i] || ps.recs[i].down || ps.qb.pump > 0) return;
    G.chg = { i, t: 0, pid: pid === undefined ? null : pid };
    G.pwShow = null;
    $('#tip').hidden = true;  // the tip said "hold a letter": it makes way for the power bar
  }

  function endCharge(i) {
    const c = G.chg;
    if (!c || (i !== undefined && i !== c.i)) return;
    G.chg = null;
    if (!canPass() || !ps.recs[c.i]) return;
    const pw = clamp(c.t / CHARGE, 0, 1);
    G.pwShow = { pw, t: 1.1 };  // the bar stays up for a moment, showing what was thrown
    throwTo(ps.recs[c.i], null, pw);
  }

  function throwTo(r, pt, type) {
    const q = ps.carrier;
    if (!q || ps.thrown) return;
    const option = ps.rpo && ps.mode === 'run';
    if (option) ps.mode = 'pass';  // the option is taken: from here it is a pass play
    let tx, ty, T = 0.6, d;
    /* power, 0 to 1: a floated lob at 0 (slow, high), an ordinary pass at a half, a bullet at 1 (fast, flat).
       The computer's quarterbacks throw at a half; yours throws what the power bar says. */
    const pw = typeof type === 'number' ? clamp(type, 0, 1) : type === 'bullet' ? 1 : type === 'lob' ? 0 : 0.5;
    const sf = pw < 0.5 ? lerp(0.84, 1, pw * 2) : lerp(1, 1.22, pw * 2 - 1), hf = pw < 0.5 ? lerp(1.45, 1, pw * 2) : lerp(1, 0.55, pw * 2 - 1);
    if (r) {
      const pf = 1 + ((q.pow ?? q.rt) - 80) * 0.006, range = armRange(q);
      tx = r.x;
      ty = r.y;
      for (let i = 0; i < 3; i++) {
        d = hyp(tx - q.x, ty - q.y);
        T = Math.max(0.3, d / ((d > 25 ? 19 : 22) * pf * sf));
        [tx, ty] = lead(r, T);
      }
      d = hyp(tx - q.x, ty - q.y);
      if (d > range) {
        const k = range / d;
        tx = q.x + (tx - q.x) * k;
        ty = q.y + (ty - q.y) * k;
        d = range;
      }
      const pr = pressure(q), err = d * 0.03 * (1 + (85 - (q.thr ?? q.rt)) * 0.03) * (pr ? 1.9 : 1) * (ps.rpo ? 1.6 : 1);  // an option throw comes out of the mesh, feet not set
      tx = clamp(tx + (rnd() - rnd()) * err, 1, FW - 1);
      ty = clamp(ty + (rnd() - rnd()) * err, -9, 109);
    } else {
      tx = pt.x;
      ty = pt.y;
      d = hyp(tx - q.x, ty - q.y);
      T = d / 20;
    }
    ps.air = { x0: q.x, y0: q.y, x1: tx, y1: ty, t: 0, T, h: (1.2 + d * 0.11) * hf, target: r, x: q.x, y: q.y, z: 1.8, dist: d };
    if (r && watched() && !ps.free && Math.random() < 0.015) ps.dhold = freeSnap();  // a defender had a fistful of jersey downfield
    ps.rel = { q, t: ps.t };  // the release: a rusher who arrives in the next half second may hit him late (see tick)
    if (!r && watched() && Math.abs(q.x - ps.bx) < 4 && (q.y - ps.los) * G.dir < 0 && Math.random() < 0.35) ps.ground = q.y;  // thrown away from inside the pocket, nobody near it: grounding, when the officials see it  // he arrives as the ball leaves, and drives him into the turf
    if (!AUTO && !QUIET && PG.audio && d >= 24 && T >= 0.95) PG.audio.crowd.swell(T, q.team === 0 ? 0.6 : 0.42);  // a long ball: the stadium draws breath until it comes down
    if (d >= 26 && T >= 1.05) vo('deep', { every: 25 });
    if (option && r) {
      /* The read. An underneath defender who did not step up at the run fake and is standing in the throwing lane
         can get a hand on the ball (see resolvePass): throw when he bites, hand off when he sits. */
      const vx = tx - q.x, vy = ty - q.y, len2 = vx * vx + vy * vy || 1;
      let near = 2.6;
      for (const o of P) if (o.team !== q.team && !o.down && !o.eng && !(o.bite > 0.3) && (o.asg === 'zone' ? !o.deep : /LB/.test(o.role) && o.asg !== 'rush')) {
        const s = ((o.x - q.x) * vx + (o.y - q.y) * vy) / len2, off2 = hyp(q.x + vx * s - o.x, q.y + vy * s - o.y);
        if (s > 0.2 && s < 0.92 && off2 < near) {
          near = off2;
          ps.air.lane = o;
        }
      }
    }
    ps.thrown = true;
    ps.carrier = null;
    ps.passer = q;
    ps.tgt = r;
    q.thrT = 0.32;
    q.thrP = pw;  // the follow-through fits the power (drawing only)
    snd('throw');
    if (r && r === G.me && !QUIET) {
      G.my.tgt++;
      toast('Ball is yours!');
    }
    if (ps.offTeam === 1 && !G.lock) {
      let b = null, bd = 1e9;
      for (const o of P) if (o.team === 0 && !o.down) {
        const s = hyp(o.x - tx, o.y - ty);
        if (s < bd) {
          bd = s;
          b = o;
        }
      }
      if (b) G.sel = b;
    }
  }

  function qbAI(q, dt, past) {
    if (past || ps.scr) {
      carrierAI(q);
      return;
    }
    if (ps.t < 1.5) seek(q, ps.drop.x, ps.drop.y);
    else q.dvx = q.dvy = 0;
    const me = !AUTO && G.me && G.me.team === q.team ? G.me : null;
    if (me && me.callT > 0 && ps.t > 0.6 && me.route && !me.down && dist(me, q) < armRange(q)) {
      throwTo(me);
      return;
    }
    ps.think -= dt;
    if (ps.t < 1.4 || ps.think > 0) return;
    ps.think = 0.22;
    let best = null, bo = 0, bsc = -1e9;
    const range = armRange(q) - 2, hot = !AUTO && G.me && G.me.team !== q.team ? G.me.man : null;
    for (const r of ps.recs) {
      if (r.down || (r.wp < 1 && ps.t < 2.3)) continue;
      if (dist(r, q) > range) continue;
      let open = 99;
      for (const o of P) if (o.team !== q.team && !o.down) open = Math.min(open, dist(o, r));
      const sc = Math.min(open, 7) + clamp((r.y - ps.los) * G.dir, -3, 25) * 0.05 + rnd(1.2) + (r === me ? (me.role === 'RB' ? 1.2 : 3.5) : 0) + (hot && r === hot ? 2.2 : 0);
      if (sc > bsc) {
        bsc = sc;
        best = r;
        bo = open;
      }
    }
    const pr = pressure(q);
    if (pr && rnd() < 0.5) return;  // rattled: holds the ball a beat too long
    let need = ps.t > 3.4 ? 1.3 : pr ? 1.2 : 2.7 - (ps.t - 1.5) * 0.35;
    if (best && best === me) need *= 0.65;
    if (best && bo >= need) throwTo(best);
    else if (pr) {
      const k = rnd();
      if (k < 0.2) throwTo(null, { x: q.x < FW / 2 ? -3 : FW + 3, y: q.y + G.dir * 9 });
      else if (k < 0.42) ps.scr = true;
    } else if (ps.t > 4.6) ps.scr = true;
  }

  /* The computer quarterback's read on a run-pass option, made once, half a second in: throw to a lettered receiver who
     has come clear (or who is calling for the ball), otherwise leave it with the back. No dice in it. */
  function rpoRead(q) {
    ps.rpoRead = true;
    const me = !AUTO && G.me && G.me.team === q.team ? G.me : null;
    let best = null, bo = 0;
    for (const r of ps.recs) {
      if (r.down) continue;
      let open = 99;
      for (const o of P) if (o.team !== q.team && !o.down) open = Math.min(open, dist(o, r));
      if (r === me && me.callT > 0) open += 3;
      if (open > bo) {
        bo = open;
        best = r;
      }
    }
    if (best && bo >= 3.4) throwTo(best, null, 0.65);
  }

  function carrierCtl(p, dt) {
    const user = userP(p);
    if (ps.mode === 'run' && !ps.handoff && p === ps.qb && ps.runner !== p) {
      seek(p, ps.runner.x, ps.runner.y, 0.7);
      if (ps.rpo && !user && !ps.rpoRead && ps.t > RPO_T - 0.25) rpoRead(p);
      return;
    }
    if (ps.mode === 'pass' && !ps.thrown && p === ps.qb && !ps.turnover) {
      const past = (p.y - ps.los) * G.dir > 0.3;
      if (past) openField(0.1, 0.4);
      if (!user) {
        qbAI(p, dt, past);
        return;
      }
      if (inp.manual) manual(p);
      else if (past) carrierAI(p);
      else if (ps.t < 1.5) seek(p, ps.drop.x, ps.drop.y);
      else p.dvx = p.dvy = 0;
      return;
    }
    if (user && inp.manual) {
      manual(p);
      return;
    }
    if (p.path && p.pi < p.path.length && !ps.caught && !ps.turnover) {
      const w = p.path[p.pi];
      if (seek(p, w[0], w[1], 1, true) < 1) p.pi++;
      return;
    }
    carrierAI(p);
  }

  const userOnD = () => !AUTO && G.state === 'live' && (!G.lock || !!G.me) && (ps.fum && !ps.fum.scoop ? true : ps.carrier ? ps.carrier.team === 1 : !!(ps.air && ps.offTeam === 1));  // a loose ball is anyone's
  const canPass = () => !AUTO && G.state === 'live' && (ps.mode === 'pass' || (ps.rpo && !ps.handoff)) && !ps.thrown && !ps.turnover && ps.carrier === ps.qb && userP(ps.qb) && (ps.qb.y - ps.los) * G.dir < 0.3;

  function resolvePass() {
    const a = ps.air, r = a.target, off = ps.offTeam, my = G.my, me = QUIET ? null : G.me, pm = !!me && ps.passer === me;
    ps.air = null;
    if (!r) {
      if (pm) my.att++;
      dropBall(a);
      finish('inc', 'Thrown away');
      return;
    }
    if (a.lane && !a.lane.down && rnd() < 0.55) {
      /* a run-pass option thrown past a linebacker who never moved: he bats it down, and one time in four he keeps it */
      const d = a.lane;
      if (pm) my.att++;
      if (rnd() < 0.25) {
        for (const p of P) {
          p.eng = null;
          p.block = null;
        }
        ps.carrier = d;
        ps.turnover = true;
        ps.open = true;
        toast('Intercepted!');
        snd('hit');
        if (pm) my.pint++;
        if (me && d === me) my.int++;
        return;
      }
      a.x1 = d.x;
      a.y1 = d.y;
      dropBall(a);
      finish('inc', 'Batted down');
      return;
    }
    const dr = hyp(r.x - a.x1, r.y - a.y1);
    let nd = null, ndd = 99;
    for (const o of P) if (o.team !== off && !o.down && o.stun <= 0 && !o.eng) {
      const d = hyp(o.x - a.x1, o.y - a.y1);
      if (d < ndd) {
        ndd = d;
        nd = o;
      }
    }
    /* 0.9 was 0.96 until 2026-11-14: receivers used to run two or three yards past every hard break, so balls thrown to
       hitches, curls and in-routes never found them, and the game was balanced with those misses in it. With the routes
       run properly the base chance came down, to keep completions near 58%. */
    let cp = dr > 2.2 ? 0 : (0.9 - clamp((2.6 - ndd) / 2.6, 0, 1) * 0.42) * (0.93 + ((r.cat ?? r.rt) - 70) * 0.005) - (dr > 1.2 ? 0.25 : 0) - Math.max(0, a.dist - 16) * 0.009;
    const ud = nd && nd === G.sel && off === 1 && !AUTO && ndd < 1.8;
    if (ud) cp -= 0.2;
    cp *= G.wx.cat;  // a wet or frozen ball is harder to hold
    let ip = ndd < 1.5 ? 0.38 * (1 + ((nd.bsk ?? nd.rt) - 75) * 0.02) : 0;
    if (dr > 2.2 && ndd < 1.6) ip = 0.4;
    if (ud) ip += 0.2;
    if (rnd() < cp) {
      ps.cp = cp;  // how likely the catch was: the card after an improbable one says so
      ps.carrier = r;
      ps.caught = true;
      G.stats[off].comp++;
      G.stats[off].att++;
      credit(ps.passer, 'att', 1);
      credit(ps.passer, 'comp', 1);
      credit(r, 'rec', 1);
      openField(0.05, 0.3);
      if (ps.rpo) for (const o of P) if (o.team !== off && o.eng && !o.eng.isOL) {
        // an option pass is not a called screen: the receivers were blocking for a run, and the defense comes off those blocks to the ball
        release(o);
        o.immune = 1.5;
      }
      snd('catch', { x: r.x });
      if (pm) {
        my.att++;
        my.comp++;
      }
      if (me && r === me) my.rec++;
    } else if (nd && rnd() < ip) {
      for (const p of P) {
        p.eng = null;
        p.block = null;
      }
      ps.carrier = nd;
      ps.turnover = true;
      ps.open = true;
      toast('Intercepted!');
      snd('hit');
      vo('int', { pri: 2 });
      if (pm) {
        my.att++;
        my.pint++;
      }
      if (me && nd === me) my.int++;
    } else {
      /* pass interference: a defender on the receiver's back when a catchable ball falls incomplete */
      if (flagsOn() && nd && ndd < 2.2 && dr <= 2.2 && (a.y1 - ps.los) * G.dir > 1 && rnd() < 0.15) {
        dropBall(a);
        const ez = off === 0 ? a.y1 >= 99 : a.y1 <= 1;
        return flagAfter('Pass interference', 1 - off, ez ? (off === 0 ? 99 : 1) : a.y1, a.x1, true, 'first down at the spot');
      }
      if (pm) my.att++;
      if (me && nd === me && ndd < 2.2) {
        my.pbu++;
        toast('Pass breakup!');
      }
      dropBall(a);
      finish('inc', ndd < 2 ? 'Pass broken up' : dr > 2.2 ? 'Overthrown' : 'Incomplete');
    }
  }

  function dropBall(a) {
    if (QUIET) return;
    ps.loose = { x: a.x1, y: a.y1, z: 1, vx: (a.x1 - a.x0) / a.T * 0.3 + rnd(-1, 1), vy: (a.y1 - a.y0) / a.T * 0.3 + rnd(-1, 1), vz: 2.2 };
  }

  /* ---------- live tick ---------- */
  function integrate(dt) {
    for (const p of P) {
      if (p.down || p.eng || p.block) continue;
      if (p.stun > 0) {
        p.stun -= dt;
        p.vx *= 0.8;
        p.vy *= 0.8;
      } else if (p.dive <= 0) {
        let ax = p.dvx - p.vx, ay = p.dvy - p.vy;
        const m = hyp(ax, ay), ma = p.acc * dt;
        if (m > ma) {
          ax *= ma / m;
          ay *= ma / m;
        }
        p.vx += ax;
        p.vy += ay;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.anim += hyp(p.vx, p.vy) * dt;
      if (p !== ps.carrier) {
        p.x = clamp(p.x, -2, FW + 2);
        p.y = clamp(p.y, -11, 111);
      }
    }
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) {
      const a = P[i], b = P[j];
      if (a.down || b.down || a.eng === b || b.eng === a) continue;
      const dx = b.x - a.x, dy = b.y - a.y, d = hyp(dx, dy);
      if (d < 0.9 && d > 0.001) {
        const q = (0.9 - d) / 2 / d;
        a.x -= dx * q;
        a.y -= dy * q;
        b.x += dx * q;
        b.y += dy * q;
      }
    }
  }

  function tick(dt) {
    ps.t += dt;
    if (ps.rel && !ps.rel.done && ps.t - ps.rel.t < 0.5) {
      /* roughing the passer: a rusher who gets there just after the ball is gone, now and then hits him late and hard */
      const q = ps.rel.q;
      if (P.some(o => o.team !== q.team && !o.down && hyp(o.x - q.x, o.y - q.y) < 1.0)) {
        ps.rel.done = true;
        if (watched() && !ps.lateFlag && Math.random() < 0.06) ps.lateFlag = 'Roughing the passer';
      }
    }
    if (!G.drill && G.try2 == null) G.clock = Math.max(0, G.clock - dt);  // no clock in practice or on a two-point try
    const off = ps.offTeam;
    if (ps.mode === 'run' && !ps.handoff) {
      const rn = ps.runner, dl = G.op.run.delay || 0;
      /* a run-pass option is handed off a second in, unless a throw is being wound up at that moment (then a little longer) */
      const give = ps.rpo ? ps.t > RPO_T && !(G.chg && ps.t < RPO_T + 0.6)
        : rn === ps.qb ? ps.t > (G.op.run.fast ? 0.1 : 0.45) : ps.mot && ps.mot.sweep ? dist(rn, ps.qb) < 1.8 || ps.t > 0.5  // from jet motion: handed off as he flies past
        : ps.t > dl + 0.3 && (G.op.run.toss || dist(rn, ps.qb) < 1.3 || ps.t > dl + 0.9);
      if (give) {
        // a toss is pitched at once, so the defense sees it sooner
        ps.handoff = true;
        ps.carrier = rn;
        openField(0.24, 0.62);
      }
    }
    const cl = new Set(), c = ps.carrier, uod = userOnD(), me = AUTO ? null : G.me;
    if (c) {
      // the ball carrier's fastest moment, for the top speed card: his speed held over about a third of a second, the
      // way tracking chips report it (a juke or a hit is a jolt of a frame or two, not a speed; unsmoothed it read 27 mph)
      c.sv = (c.sv || 0) + (hyp(c.vx, c.vy) - (c.sv || 0)) * Math.min(1, dt / 0.35);
      c.top = Math.max(c.top || 0, c.sv);
    }
    for (const p of P) if (p.bt && !p.down && btValid(p)) cl.add(p.bt);
    if (uod) {
      if (G.lock) G.sel = G.me;
      else if (!G.sel || G.sel.team !== 0 || G.sel.down) switchDef();
    }
    for (const p of P) {
      if (p.down) continue;
      p.tcd -= dt;
      p.immune -= dt;
      p.beat -= dt;
      p.juke -= dt;
      p.jcd -= dt;
      p.callT -= dt;
      p.manT -= dt;
      p.thrT -= dt;
      if (p.pump > 0) p.pump -= dt;
      p.spinT -= dt;
      p.stiff -= dt;
      p.truck -= dt;
      p.hurdle -= dt;
      p.pcd -= dt;
      p.hcd -= dt;
      p.hit -= dt;
      p.strip -= dt;
      p.dcd -= dt;
      p.flat -= dt;
      if (p.rd > 0 && ps.open) p.rd -= dt;
      if (p.dive > 0) {
        p.dive -= dt;
        if (p.dive <= 0) p.stun = 0.7;
        continue;
      }
      if (p.stun > 0) {
        p.dvx = p.dvy = 0;
        continue;
      }
      if (p.eng || p.block) continue;
      if (ps.fum && !ps.fum.scoop) {
        // a loose ball: everyone close goes for it, and dives when he is near enough
        const b = ps.loose, d = hyp(p.x - b.x, p.y - b.y);
        if (d < 15) {
          seek(p, b.x, b.y, 1, true);
          if (d < 2.3 && ps.fum.t > 0.3 && (AUTO || p !== G.sel) && p.team !== ps.fum.by.team && p.goScoop === undefined) p.goScoop = rnd() < 0.4;  // a defender may stay on his feet and try to pick it up
          if (d < 2.3 && ps.fum.t > 0.3 && (AUTO || p !== G.sel) && !p.goScoop) {
            p.vx = (b.x - p.x) / (d || 1) * p.spd * 1.5;
            p.vy = (b.y - p.y) / (d || 1) * p.spd * 1.5;
            p.dive = 0.26;
          }
        } else p.dvx = p.dvy = 0;
        continue;
      }
      if (p === c) {
        carrierCtl(p, dt);
        continue;
      }
      if (ps.turnover) {
        if (c && p.team === c.team) blockAI(p, cl);
        else if (c) pursue(p, c);
        else p.dvx = p.dvy = 0;
        continue;
      }
      if (p.team === off) offAI(p, cl);
      else defAI(p);
    }
    if (uod) {
      const s = G.sel;
      if (s && !s.down && s.stun <= 0 && !s.eng && s.dive <= 0 && inp.manual) manual(s);
    }
    // career: the locked player away from the ball (routes, blocking)
    if (me && off === 0 && !ps.turnover && me !== ps.carrier && !me.down && me.stun <= 0 && inp.manual && !(ps.mode === 'run' && !ps.handoff && me === ps.runner)) {
      if (me.block) {
        const d = me.block;
        release(d);
        me.beat = 0.5;
        d.immune = 0.4;
      }
      if (!me.eng) {
        manual(me);
        me.manT = 0.6;
        if ((ps.open || ps.mode === 'run' || !me.route) && me.beat <= 0) for (const o of P) if (o.team !== 0 && !o.down && !o.eng && o.stun <= 0 && o.immune <= 0 && o.dive <= 0 && dist(me, o) < 1.3) {
          engage(me, o, passPro());
          break;
        }
      }
    }
    // engaged pairs
    for (const d of P) {
      const b = d.eng;
      if (!b) continue;
      if (b.down || b.stun > 0 || d.down) {
        release(d);
        continue;
      }
      const g = ps.carrier || (ps.air ? { x: ps.air.x1, y: ps.air.y1 } : d);
      let ux = g.x - d.x, uy = g.y - d.y;
      const l = hyp(ux, uy) || 1;
      ux /= l;
      uy /= l;
      const run = ps.open || ps.mode === 'run', bd = b.team === 0 ? 1 : -1, sp = run ? 0.5 : 1.0;
      /* on a run the blocker drives his man downfield; each run play says how hard its line comes off the ball */
      const push = !run ? 0 : ps.mode === 'run' && G.op.run && b.isOL ? G.op.run.push || 0.9 : 0.9;
      d.vx = ux * sp;
      d.vy = uy * sp + bd * push;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      const k = Math.min(1, dt * 12);
      b.x += (d.x + ux * 0.85 - b.x) * k;
      b.y += (d.y + uy * 0.85 - b.y) * k;
      b.vx = d.vx;
      b.vy = d.vy;
      b.anim += dt * 3;
      d.anim += dt * 3;
      d.shed -= dt * (run ? (l < 6 ? 4 : 1) : (l < 3.5 ? 2.5 : 1)) * (d === G.sel && uod ? 1.8 : 1);
      if (d.shed <= 0) {
        release(d);
        d.immune = 1.3;
        b.beat = 1.6;
      }
    }
    integrate(dt);
    // ball
    if (ps.air) {
      const a = ps.air;
      a.t += dt;
      const s = Math.min(1, a.t / a.T);
      a.x = lerp(a.x0, a.x1, s);
      a.y = lerp(a.y0, a.y1, s);
      a.z = 1.8 * (1 - s) + 1.2 * s + a.h * 4 * s * (1 - s);
      if (s >= 1) resolvePass();
    }
    if (ps.fum && !ps.fum.scoop && G.state === 'live' && scramble(dt)) return;
    // tackles
    const c2 = ps.carrier;
    if (c2 && G.state === 'live') {
      for (const o of P) {
        if (o.team === c2.team || o.down || o.stun > 0 || o.tcd > 0) continue;
        const d = dist(o, c2);
        if (d > (o.dive > 0 ? 1.7 : o.eng ? 1.15 : 1.05)) continue;
        o.tcd = 0.8;
        let pr = 0.76 + ((o.tkl ?? o.rt) - 75) * 0.006 - ((c2.brk ?? c2.rt) - 75) * 0.005;
        if (o.eng) pr *= 0.42;
        if (o.dive > 0) pr += 0.2;
        for (const q of P) if (q.team === o.team && q !== o && !q.down && q.stun <= 0 && dist(q, c2) < 2.2) pr += 0.15;
        if (c2.juke > 0) pr *= 0.22;
        if (ps.mode === 'run' && G.op.run && G.op.run.fast && ps.t < 0.8) pr *= 0.3;  // a sneak goes in behind the wedge: hard to stop for the first step or two
        if (c2.hurdle > 0) {
          if (o.dive > 0 && o.hit <= 0) continue;  // sailed over the diving tackler
          pr += 0.18;  // met in the air
        }
        if (c2.truck > 0) pr *= clamp(0.52 - ((c2.brk ?? c2.rt) - 75) * 0.008, 0.3, 0.7);
        else if (c2.stiff > 0) pr *= 0.58;
        if (o.hit > 0) pr += 0.1;
        if (o.strip > 0) pr -= 0.2;
        if (c2 === ps.qb && ps.mode === 'pass' && !ps.thrown && !ps.open) pr = 0.93;
        if (o === G.sel && uod) pr += 0.1;
        if (rnd() < clamp(pr, 0.08, 0.97)) {
          /* does the ball come out? rare on a normal tackle, likely enough on a hit stick or a strip to be worth the risk */
          let fum = 0.016 * G.wx.fum * clamp(1 - ((c2.brk ?? c2.rt) - 75) * 0.015, 0.5, 1.5);
          if (o.hit > 0) fum += 0.085;
          if (o.strip > 0) fum += 0.13;
          if (c2.hurdle > 0) fum *= 2.5;
          let out = false;  // this tackle knocks the ball loose (ps.fum may already be set: a scooped fumble being returned)
          if (rnd() < fum && !(ps.fum && ps.fum.scoop)) {
            out = true;
            ps.fum = { t: 0, by: c2, forced: o };
            ps.loose = { x: c2.x, y: c2.y, z: 1.1, vx: c2.vx * 0.4 + rnd(-3, 3), vy: c2.vy * 0.4 + rnd(-3, 3), vz: 3.2 };
            if (!AUTO && G.me && o === G.me) G.my.ff = (G.my.ff || 0) + 1;
            credit(o, 'ff', 1);
          }
          const pw = clamp(0.45 + hyp(o.vx - c2.vx, o.vy - c2.vy) / 14, 0.5, 1.3);
          /* the pair keeps a little of its momentum and slides to a stop together */
          c2.slx = o.slx = o.vx * 0.45 + c2.vx * 0.3;
          c2.sly = o.sly = o.vy * 0.45 + c2.vy * 0.3;
          c2.sl = o.sl = 0.32;
          c2.down = true;
          o.fell = 1;
          o.vx = o.vy = 0;
          ps.tackler = o;
          ps.userTkl = AUTO || o.team !== 0 || !G.sel ? 0 : o === G.sel ? 2 : G.sel.team === 0 && !G.sel.down && dist(G.sel, c2) < 2.6 ? 1 : 0;
          snd('hit', { power: pw, x: c2.x });
          if (userP(c2) || o === G.sel || pw > 1.05) buzz(Math.round(14 + pw * 22));  // you feel the ones you are in, and the big ones
          if (pw > 1.05 && !QUIET && !AUTO && PG.audio) PG.audio.crowd.ooh(0.6);
          hitFx(c2.x, c2.y);
          if (out) {
            // the whistle waits: the ball is live until somebody falls on it
            ps.carrier = null;
            G.sel = G.lock ? G.me : null;
            for (const p of P) {
              p.eng = null;
              p.block = null;
            }
            if (!AUTO && !QUIET) {
              buzz(45);
              toast('Fumble! Get on it');
              snd('shout', { x: c2.x });
              vo('fumble', { pri: 2 });
              if (PG.audio) PG.audio.crowd.ooh(0.9);
            }
            return;
          }
          finish('tackle');
          return;
        }
        release(o);
        const moved = c2.truck > 0 ? 'truck' : c2.stiff > 0 ? 'stiff' : '';
        o.stun = o.hit > 0 ? 1.3 : moved ? 1.2 : 0.9;  // a missed hit stick takes longer to recover from
        o.dive = 0;
        o.hit = 0;
        if (moved) {
          const dx = o.x - c2.x, dy = o.y - c2.y, m = hyp(dx, dy) || 1;
          o.vx = dx / m * 5;
          o.vy = dy / m * 5;
          if (moved === 'truck') o.flat = 1.2;  // put on his back
        }
        c2.vx *= moved === 'truck' ? 0.6 : 0.7;
        c2.vy *= moved === 'truck' ? 0.6 : 0.7;
        snd('hit', { power: moved === 'truck' ? 0.9 : 0.45, x: c2.x });
        if (userP(c2)) toast(moved === 'truck' ? 'Ran him over!' : moved === 'stiff' ? 'Stiff arm!' : 'Broken tackle!');
      }
      if (c2.team === 0 ? c2.y >= 100 : c2.y <= 0) finish('td');
      else if (c2.x < 0 || c2.x > FW) finish('oob');
      else if (c2.y < -10 || c2.y > 110 || ps.t > 30) finish('tackle');
    }
  }

  /* The box score: one line per player who did something on a played snap (simulated drives have no players).
     It feeds the player of the game. */
  function credit(p, k, v) {
    if (QUIET || !p || !G.box) return;
    const key = p.team + p.role, b = G.box[key] || (G.box[key] = { name: p.name, num: p.num, team: p.team, role: p.role });
    b[k] = (b[k] || 0) + v;
  }

  function playerOfGame() {
    const win = G.score[0] === G.score[1] ? -1 : G.score[0] > G.score[1] ? 0 : 1, n = k => k || 0;
    let best = null, top = 0;
    for (const key in G.box) {
      const b = G.box[key];
      const sc = (n(b.pyd) / 25 + n(b.ptd) * 4 - n(b.pint) * 2 + n(b.ryd) / 10 + n(b.recyd) / 10 + n(b.td) * 6 + n(b.tkl) + n(b.sack) * 2 + n(b.int) * 3 + n(b.ff) * 2 + n(b.fr) * 2) * (b.team === win ? 1.2 : 1);
      if (sc > top) {
        top = sc;
        best = b;
      }
    }
    if (!best || top < 4) return null;
    const b = best, parts = [];
    if (b.att) parts.push(`${n(b.comp)}/${b.att}, ${n(b.pyd)} yds` + (b.ptd ? `, ${b.ptd} TD` : ''));
    if (b.car) parts.push(`${b.car} car, ${n(b.ryd)} yds`);
    if (b.rec) parts.push(`${b.rec} rec, ${n(b.recyd)} yds`);
    if (b.td) parts.push(`${b.td} TD`);
    if (b.tkl) parts.push(`${b.tkl} tkl`);
    if (b.sack) parts.push(`${b.sack} sack${b.sack > 1 ? 's' : ''}`);
    if (b.int) parts.push(`${b.int} INT`);
    if (b.ff) parts.push(`${b.ff} forced fumble${b.ff > 1 ? 's' : ''}`);
    if (b.fr) parts.push(`${b.fr} fumble recover${b.fr > 1 ? 'ies' : 'y'}`);
    return { name: b.name, num: b.num, team: b.team, role: b.role, line: parts.join(' · ') };
  }

  const potdHtml = () => (G.potd ? `<button class="btn2" id="potd" style="margin:8px 0 2px">Watch the play of the game<small style="display:block;font-weight:500;text-transform:none;letter-spacing:0;color:var(--mute);margin-top:2px">${G.potd.text}</small></button>` : '');
  const potgHtml = () => {
    const p = playerOfGame();
    return p ? `<p class="potg"><small>Player of the game</small><b>#${p.num} ${p.name} · ${ab(p.team)}</b><span>${p.line}</span></p>` : '';
  };

  /* a ball on the ground: gravity, a dead bounce or two with a random kick, then it rolls to a stop */
  function bounce(b, dt) {
    b.vz -= 14 * dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    if (b.z < 0.16) {
      b.z = 0.16;
      if (b.vz < -1.2) {
        if (b.vz < -2.2) snd('thud', { x: b.x, power: clamp(-b.vz / 9, 0.25, 1) });  // the first bounces can be heard; the last little hops cannot
        b.vz = -b.vz * 0.45;
        b.vx = b.vx * 0.6 + rnd(-1.6, 1.6);
        b.vy = b.vy * 0.6 + rnd(-1.6, 1.6);
      } else {
        b.vz = 0;
        const fr = Math.pow(0.04, dt);
        b.vx *= fr;
        b.vy *= fr;
      }
    }
  }

  /* The ball is loose. Anyone who reaches it can fall on it; a miss sends it squirting away again. A defender who gets
     to it while it is still bouncing can scoop it up instead and run with it, the scoop-and-score. Out of bounds, or
     three seconds with nobody on it, and it stays with the team that lost it. Returns true when the play is over. */
  function scramble(dt) {
    const b = ps.loose, f = ps.fum;
    f.t += dt;
    bounce(b, dt);
    if (b.x < 0 || b.x > FW || b.y < -10 || b.y > 110) return recover(null);
    if (f.t > 0.35 && b.z < 1.3) for (const p of P) {
      if (p.down || p.fell || p.stun > 0 || p.flat > 0 || (p === f.by && !f.muff) || hyp(p.x - b.x, p.y - b.y) > 1.15) continue;  // a returner may fall on his own muff; a tackled runner cannot
      const mine = !AUTO && p === G.sel && p.team === 0;  // the player you are steering is surer of it
      if (rnd() < (mine ? 0.8 : 0.5)) {
        if (p.team !== f.by.team && !(p.dive > 0) && rnd() < (b.z > 0.35 ? 0.7 : 0.55)) return scoop(p);  // on his feet when he gets to it, cleanly: he is away
        return recover(p);
      }
      b.vx = rnd(-4.5, 4.5);
      b.vy = rnd(-4.5, 4.5);
      b.vz = 2.6;
      p.stun = 0.8;
      p.dive = 0;
      snd('hit', { power: 0.3 });
    }
    if (f.t > 3.2) {
      let best = null, bd = 1e9;
      for (const p of P) if (!p.down && !p.fell) {
        const d = hyp(p.x - b.x, p.y - b.y);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      return recover(best);
    }
    return false;
  }

  /* a defender picks the ball up on the run: the play goes on as a return, like an interception's */
  function scoop(p) {
    const f = ps.fum, b = ps.loose;
    f.scoop = true;
    f.own = false;
    ps.loose = null;
    ps.carrier = p;
    ps.turnover = true;
    ps.open = true;
    p.dive = 0;
    b.z = 1;
    for (const q of P) {
      q.eng = null;
      q.block = null;
      if (q.team !== p.team && hyp(q.x - p.x, q.y - p.y) < 3) q.tcd = Math.max(q.tcd || 0, 0.45);  // the men round the ball have just dived or been knocked off it: a half-second start
    }
    credit(p, 'fr', 1);
    if (!AUTO && G.me && p === G.me) G.my.fr = (G.my.fr || 0) + 1;
    if (!AUTO && !QUIET) {
      toast('Scooped up!');
      vo('scoop', { pri: 2 });
      if (PG.audio) PG.audio.crowd.ooh(1);
      buzz(40);
    }
    return false;
  }

  /* p falls on the ball; null means it went out of bounds and goes back to the team that fumbled */
  function recover(p) {
    const f = ps.fum, b = ps.loose, own = !p || p.team === f.by.team;
    f.own = own;
    if (p) {
      p.fell = 1;
      p.vx = p.vy = 0;
      b.x = p.x;
      b.y = p.y;
      b.z = 0.3;
      b.vx = b.vy = b.vz = 0;
      credit(p, 'fr', 1);
      if (!AUTO && G.me && p === G.me) G.my.fr = (G.my.fr || 0) + 1;
    }
    /* the play is scored from where the ball ended up, by whoever has it */
    ps.carrier = p || Object.assign({}, f.by, { x: clamp(b.x, 0.5, FW - 0.5), y: clamp(b.y, -9.5, 109.5) });
    if (p && (p.team === 0 ? b.y >= 100 : b.y <= 0)) finish('td');  // fallen on in the end zone he is attacking
    else if (own) finish(p ? 'tackle' : 'oob');
    else finish('fumble', { team: p.team });
    return true;
  }

  function addYds(t, g, td, sack) {
    if (ps.caught) G.stats[t].pass += g;
    else G.stats[t].rush += g;
    const who = ps.carrier;
    if (ps.caught) {
      credit(ps.passer, 'pyd', g);
      credit(who, 'recyd', g);
      if (td) credit(ps.passer, 'ptd', 1);
    } else if (!sack) {
      credit(who, 'car', 1);
      credit(who, 'ryd', g);
    }
    const me = QUIET ? null : G.me, my = G.my, c = ps.carrier;
    if (!me) return;
    if (ps.caught) {
      if (ps.passer === me) {
        my.pyd += g;
        if (td) my.ptd++;
      }
      if (c === me) {
        my.recyd += g;
        if (td) my.rectd++;
      }
    } else if (c === me && !sack) {
      my.car++;
      my.ryd += g;
      if (td) my.rtd++;
    }
  }

  /* the usual chart, late in the game: go for two when one point would leave you a score short */
  function wantsTwo(t) {
    if (G.q < 4 || G.clock > G.ql * 0.6) return false;
    return [-2, -5, -10, -13, 1, 5, 12].includes(G.score[t] - G.score[1 - t]);
  }

  /* After your touchdown: kick for one, or play a single snap from the two-yard line for two */
  function showPat() {
    const t = G.pat;
    G.state = 'call';
    P = [];
    ps = null;
    G.celeb = null;
    setBrief('');
    scr.innerHTML = `<div class="sheet"><div class="shd"><b>After the touchdown</b><span>${ab(0)} ${G.score[0]} · ${ab(1)} ${G.score[1]}</span></div>
  <button class="go" id="p1">Kick the extra point</button><button class="btn2" id="p2" style="margin-top:8px">Go for two · one play from the 2-yard line</button></div>`;
    $('#p1').onclick = () => patKick(t);
    $('#p2').onclick = () => {
      G.pat = null;
      G.try2 = t;
      G.pendKO = null;
      setBall(t, t === 0 ? 98 : 2, FW / 2);
      hudKey = '';
      startCall();
    };
  }

  /* The extra point, kicked: the ball at the 15, a 32-yard field goal worth one, kicked with the swipe or the meter
     like any other. It used to be a roll of the dice, good 96 times in 100, with no kick at all. */
  function patKick(t) {
    G.pat = null;
    G.patKick = t;
    G.pendKO = null;
    scr.innerHTML = '';
    setBall(t, t === 0 ? 85 : 15, FW / 2);
    G.op = OFF.find(p => p.n === 'Field Goal');
    G.dp = DEF[0];
    hudKey = '';
    begin();
  }

  /* how the kick ends: one point or none, then the kickoff either way */
  function finishPat(good) {
    const off = G.patKick;
    G.patKick = null;
    if (good) G.score[off]++;
    if (G.lastScore) {
      G.lastScore.score = G.score.slice();
      G.lastScore.text += good ? ' (kick good)' : ' (kick missed)';
    }
    if (G.drive) G.drive.done = true;
    kickoff(1 - off);
    G.last = good ? 'Extra point' : 'No good';
    G.sig = good ? 'td' : 'inc';
    G.rp = false;
    G.runoff = 0;
    ps.after = 0;
    if (good) {
      react(off, 0.6, 1.6);
      if (off === 0) snd('chime');
    } else react(1 - off, 0.6, 1.6);
    snd('whistle');
    G.state = 'dead';
    G.deadT = 1.6;
    banner(good ? 'It’s good' : 'No good', good ? 'Extra point' : 'The extra point is missed', 1500);
    vo(good ? 'xp.good' : 'xp.miss', { pri: 2 });
    voScore(off, G.voS0);
    G.voS0 = null;
    hudKey = '';
    updHud();
  }

  /* how a two-point try ends: in the end zone or not. No yards, no clock, then the kickoff. */
  function finishTry(kind) {
    const off = ps.offTeam, c = ps.carrier, good = kind === 'td' && !!c && c.team === off;
    if (good) G.score[off] += 2;
    if (G.lastScore) {
      G.lastScore.score = G.score.slice();
      G.lastScore.text += good ? ' (two-point try good)' : ' (two-point try failed)';
    }
    G.try2 = null;
    for (const p of P) {
      p.eng = null;
      p.block = null;
    }
    kickoff(1 - off);
    G.last = good ? 'Two points!' : 'No good';
    G.sig = good ? 'td' : 'inc';
    G.rp = false;
    G.runoff = 0;
    ps.after = 0;
    if (good) {
      G.celeb = celebFor(off, c);
      react(off, 1.1, 3);
      if (off === 0) snd('chime');
    } else react(1 - off, 0.8, 2);
    snd('whistle');
    G.state = 'dead';
    G.deadT = 2;
    banner(G.last, good ? `${tname(off)} convert the try` : 'The try fails', 1800);
    vo(good ? 'two.good' : 'two.miss', { pri: 2 });
    voScore(off, G.voS0);
    G.voS0 = null;
    hudKey = '';
    updHud();
  }

  /* down by two scores or less, late in the fourth quarter: the kicking team needs the ball back */
  const lateAndBehind = k => G.q >= 4 && G.clock < Math.min(80, G.ql * 0.27) && G.score[k] < G.score[1 - k] && G.score[1 - k] - G.score[k] <= 16;

  function onside(k) {
    const got = rnd() < 0.13;
    G.pendKO = null;
    setBall(got ? k : 1 - k, k === 0 ? 46 : 54, FW / 2);
    G.clock = Math.max(0, G.clock - 3);
    G.last = 'Onside kick';
    G.rp = false;
    G.runoff = 0;
    P = [];
    ps = null;
    G.state = 'dead';
    G.deadT = 1.9;
    banner('Onside kick', got ? `${tname(k)} recover!` : `${tname(1-k)} fall on it`, 1700);
    if (!AUTO && !QUIET) {
      snd('kick');
      react(got ? k : 1 - k, got ? 1.2 : 0.6, 2.5);
      vo('onside', { pri: 2 });
      vo(got ? 'onside.got' : 'onside.lost', { ttl: 6 });
    }
    hudKey = '';
    updHud();
  }

  function showOnside(k) {
    G.state = 'call';
    const s = Math.ceil(G.clock);
    scr.innerHTML = `<div class="sheet"><div class="shd"><b>Kickoff</b><span>${Math.floor(s/60)}:${String(s%60).padStart(2,'0')} left · down by ${G.score[1-k]-G.score[k]}</span></div>
  <button class="go" id="k1">Kick it deep</button><button class="btn2" id="k2" style="margin-top:8px">Onside kick · about 1 in 8 comes back to you</button></div>`;
    $('#k1').onclick = () => {
      scr.innerHTML = '';
      const t = G.pendKO;
      G.pendKO = null;
      beginKickoff(t);
    };
    $('#k2').onclick = () => {
      scr.innerHTML = '';
      onside(k);
    };
  }

  /* ---------- the scoring log ----------
     Every score, with the drive that made it: kept for the halftime and final screens, the drive summary and the
     booth. Bookkeeping only: it draws nothing from the game's generator. */
  const clockTxt = sec => `${Math.floor(sec / 60)}:${String(Math.round(sec) % 60).padStart(2, '0')}`;

  /* the drive that is on the field now, summed up: plays, yards from where it started to endY, game time used */
  function driveNow(team, endY) {
    const d = G.drive;
    if (!d || d.team !== team || !d.plays) return null;
    const yds = Math.round(team === 0 ? endY - d.y0 : d.y0 - endY), secs = Math.max(0, ((G.q - (d.q0 || G.q)) * G.ql) + (d.c0 === undefined ? G.clock : d.c0) - G.clock);
    return { plays: d.plays, yds, secs };
  }

  function logScore(team, kind, text, drive) {
    if (!G.scores) G.scores = [];
    const e = { q: Math.min(G.q, 5), team, kind, text, drive, score: G.score.slice() };
    G.scores.push(e);
    return e;
  }

  function scoringHtml(list) {
    if (!list || !list.length) return '';
    return `<h4 class="sumh">Scoring</h4><ul class="gl sum">${list.map(e => `<li><span><i>${e.q > 4 ? 'OT' : 'Q' + e.q}</i> ${ab(e.team)} ${e.kind === 'TD' ? 'touchdown' : e.kind === 'FG' ? 'field goal' : 'safety'} · ${e.text}${e.drive ? `<small>${e.drive.plays} play${e.drive.plays === 1 ? '' : 's'}, ${e.drive.yds} yards, ${clockTxt(e.drive.secs)}</small>` : ''}</span><b>${e.score[0]} – ${e.score[1]}</b></li>`).join('')}</ul>`;
  }

  /* the best passer, runner and receiver on each side so far, from the box score of the snaps that were played */
  function leadersHtml() {
    const box = Object.values(G.box || {}), rows = [];
    const best = (t, k, min) => box.filter(b => b.team === t && (b[k] || 0) > min).sort((a, b) => (b[k] || 0) - (a[k] || 0))[0];
    for (const [label, k, f] of [['Passing', 'pyd', b => `${b.comp || 0}/${b.att || 0} · ${b.pyd} yds${b.ptd ? ` · ${b.ptd} TD` : ''}`], ['Rushing', 'ryd', b => `${b.car || 0} car · ${b.ryd} yds`], ['Receiving', 'recyd', b => `${b.rec || 0} rec · ${b.recyd} yds`]]) {
      for (const t of [0, 1]) {
        const b = best(t, k, 0);
        if (b) rows.push(`<li><span><i>${ab(t)}</i> ${label} · ${b.name}</span><b>${f(b)}</b></li>`);
      }
    }
    return rows.length ? `<h4 class="sumh">Leaders</h4><ul class="gl sum">${rows.join('')}</ul>` : '';
  }

  let goalLine = 0;  // test hook: plays ruled a touchdown because the man was brought down already in the end zone


  /* ---------- fouls after the snap (watched games only: simulations keep the old flags) ----------
     A late, hard hit on the quarterback as the ball leaves (roughing the passer) or on a runner already out of bounds
     (unnecessary roughness) costs the defense fifteen yards from where the play ended, and an automatic first down.
     A defender who jumps at the snap does not stop the play: it is a free play, and afterwards the offense chooses to
     take five yards and the down again, or to keep what the play gained. You choose when you call your own offense;
     the computer, or a career receiver's coach, takes the better one. */
  const watched = () => !AUTO && !QUIET && flagsOn();

  function lateFoul(p0, s0) {
    const f = p0.lateFlag, off = p0.offTeam, dir = off === 0 ? 1 : -1;
    if (G.poss !== off || G.score[0] !== s0[0] || G.score[1] !== s0[1] || G.pendKO != null || G.pat != null) return;  // after a score or a turnover it is let go
    const room = off === 0 ? 100 - G.los : G.los, yd = Math.min(15, Math.max(1, Math.floor(room / 2)));
    setBall(off, G.los + dir * yd, G.bx);  // from where the play ended, and a first down
    G.sig = 'fd';
    G.last = f;
    G.deadT = Math.max(G.deadT, 2.4);
    banner('Flag', `${f}, ${tname(1 - off)} · ${yd} yards, automatic first down`, 2100);
    snd('whistle');
    refCall(`${f}, defense. ${yd} yard penalty. Automatic first down.`, 1 - off, 0.75, [REF[f], yd === 15 ? 'ref.fifteen' : yd <= 10 ? 'ref.yd.' + yd : null, 'ref.auto'].filter(Boolean));
    hudKey = '';
    updHud();
  }

  /* the state of the game at a free play's snap, to go back to if the flag is taken */
  function freeSnap() {
    return { los: G.los, bx: G.bx, down: G.down, togo: G.togo, fd: G.fd, poss: G.poss, score: G.score.slice(), stats: JSON.stringify(G.stats), my: JSON.stringify(G.my), box: JSON.stringify(G.box), nScores: (G.scores || []).length, pendKO: G.pendKO, pat: G.pat };
  }

  function freePlay(p0, s0) {
    const S = p0.free, off = p0.offTeam, dir = off === 0 ? 1 : -1;
    const kept = G.poss === off && G.score[1 - off] === s0[1 - off] && G.pendKO == null, td = G.score[off] > s0[off];
    const gain = kept ? Math.round((G.los - S.los) * dir) : -99, first = kept && !td && G.down === 1;
    const yd5 = Math.min(5, Math.max(1, Math.floor((off === 0 ? 100 - S.los : S.los) / 2))), left = S.togo - yd5;
    const acc = left <= 0 ? '5 yards, first down' : `5 yards, ${ORD[S.down - 1]} & ${left}`, g2 = Math.floor((G.los - S.los) * dir), dec = first ? `keep +${gain}, first down` : `keep ${g2 >= 0 ? '+' : ''}${g2}, ${ORD[Math.min(3, G.down - 1)]} & ${Math.max(1, Math.round(G.togo))}`;  // short of the marker: the yards it really gained
    const accept = () => {
      // the play is wiped out: back to the snap, then five yards and the down again
      Object.assign(G, { los: S.los, bx: S.bx, down: S.down, togo: S.togo, fd: S.fd, poss: S.poss, score: S.score, stats: JSON.parse(S.stats), my: JSON.parse(S.my), box: JSON.parse(S.box), pendKO: S.pendKO, pat: S.pat, sig: null });
      if (G.scores) G.scores.length = S.nScores;
      flag('Offside', 1 - off);
      G.last = 'Offside · free play';
    };
    const decline = () => {
      G.state = 'dead';
      G.deadT = 1.8;
      banner('Flag declined', `Offside, ${tname(1 - off)} · the play stands`, 1700);
      if (!AUTO && !QUIET && PG.audio) PG.audio.pa('Offside, defense. The penalty is declined.', { wait: 0.6, clips: ['ref.offside', 'ref.decl'] });
    };
    /* only a real choice is asked: more yards on the next down, or five and the down again */
    if (td) return decline();  // keep the touchdown
    if (!kept || gain <= yd5) return accept();  // a turnover, an incompletion, a loss, a short gain: the flag is better
    if (first) return decline();  // a first down past the five yards: the play is better
    if (off === 0 && (!G.lock || G.me === p0.qb)) {
      // your offense: your call
      G.state = 'decide';
      scr.innerHTML = `<div class="sheet"><div class="shd"><b>Flag · offside, defense</b><span>Free play</span></div><div class="cols"><button class="go sm" id="fpA">Accept<br><small>${acc}</small></button><button class="go sm" id="fpD">Decline<br><small>${dec}</small></button></div></div>`;
      $('#fpA').onclick = () => {
        scr.innerHTML = '';
        accept();
      };
      $('#fpD').onclick = () => {
        scr.innerHTML = '';
        decline();
      };
      return;
    }
    if (gain >= 8) decline();
    else accept();
  }

  /* After the whistle somebody says it with his arms (drawn by render3d.js, never in simulations): a teammate points
     upfield for a first down, a defender waves off a pass he broke up, and a defender flexes after a sack. */
  function gesture(p0) {
    if (AUTO || QUIET || G.state !== 'dead' || !p0 || p0.gest) return;
    const off = p0.offTeam, c = p0.carrier, up = q => !q.down && !q.fell && !(q.flat > 0) && !q.ref;
    if (p0.mode === 'kick') {
      // a field goal or an extra point: the kicker's fist if it is good, his hands on his helmet if it is not
      if (p0.kick && p0.kick.type === 'fg' && p0.qb && P.includes(p0.qb)) p0.gest = { who: p0.qb, kind: p0.kick.arg ? 'pump' : 'aw' };
      return;
    }
    if (p0.mode !== 'pass' && p0.mode !== 'run') return;
    const nearest = (team, x, y, max, not) => {
      let best = null, bd = max;
      for (const q of P) if (q.team === team && q !== not && up(q)) {
        const d = hyp(q.x - x, q.y - y);
        if (d < bd) {
          bd = d;
          best = q;
        }
      }
      return best;
    };
    let who = null, kind = '';
    if (G.last === 'Sack!' && p0.qb) {
      who = nearest(1 - off, p0.qb.x, p0.qb.y, 9, p0.tackler);
      kind = 'flex';
    } else if (G.last === 'First down' && c && c.team === off) {
      who = up(c) ? c : nearest(off, c.x, c.y, 12, c);
      kind = 'point';
    } else if ((G.last === 'Pass broken up' || G.last === 'Batted down') && p0.tgt) {
      who = nearest(1 - off, p0.tgt.x, p0.tgt.y, 6, null);
      kind = 'wave';
    }
    else if ((G.last === 'Overthrown' || G.last === 'Incomplete') && p0.tgt && up(p0.tgt) && (p0.down0 >= 3 || Math.random() < 0.15)) {
      who = p0.tgt;  // the one that got away, most of all on third or fourth down: the receiver's hands go to his helmet
      kind = 'aw';
    } else if (c && c.down && c.team === off && !p0.turnover && p0.tackler && Math.random() < 0.6) {
      who = nearest(off, c.x, c.y, 5, c);  // an ordinary tackle: a teammate comes over to help him up
      kind = 'help';
    }
    if (who) p0.gest = { who, kind, to: kind === 'help' ? c : null };
  }

  function finish(kind, arg) {
    if (G.state !== 'live' && G.state !== 'kicka') return;
    const p0 = ps, s0 = G.score.slice();
    finish0(kind, arg);
    gesture(p0);
    if (kind === 'tackle' && p0 && p0.carrier && !p0.slid && G.state === 'dead' && (p0.mode === 'pass' || p0.mode === 'run') && !AUTO && !QUIET && !G.drill && Math.random() < 0.008) shaken(p0.tackler && P.includes(p0.tackler) && Math.random() < 0.35 ? p0.tackler : p0.carrier);  // about one time in three it is the tackler who stays down
    if (p0 && p0.rk && !p0.flagged && G.state === 'dead') return roughKick(p0, s0);
    if (!p0 || p0.flagged || G.state !== 'dead' || (p0.mode !== 'pass' && p0.mode !== 'run')) return;  // a flag during the play already decided it (holding, interference)
    if (p0.free) freePlay(p0, s0);
    else if (p0.ground !== undefined) grounding(p0, s0);
    else if (p0.dhold) defHold(p0, s0);
    else if (p0.lateFlag) lateFoul(p0, s0);
  }

  /* Shaken up: now and then a ball carrier is slow to get up after the tackle. Play stops while the trainers look at
     him, he comes out, and a substitute (a little slower, six points lower) plays his spot for the next three to six
     snaps; then he is back. Never a career player's own man, and only in games someone is watching. */
  function shaken(c) {
    const H = G.hurt || (G.hurt = []);
    if ((G.lock && c.team === 0 && c.role === G.lock) || H.some(h => h.team === c.team && h.role === c.role) || H.length >= 2) return;
    const orig = G.ros[c.team][c.role];
    if (!orig) return;
    H.push({ team: c.team, role: c.role, orig, left: 3 + Math.floor(Math.random() * 4) });
    G.ros[c.team][c.role] = { ...orig, name: PG.NAMES[Math.floor(Math.random() * PG.NAMES.length)], num: (orig.num * 7 + 13) % 89 + 1, spd: orig.spd * 0.97, rt: orig.rt - 6 };
    c.flat = 4;  // he stays down
    G.deadT += 2.6;
    G.runoff = 0;  // an injury timeout: the clock waits
    setTimeout(() => {
      if (!G.ros || G.state === 'menu' || G.state === 'over') return;
      banner('Injury timeout', `#${orig.num} ${orig.name} is shaken up · ${G.ros[c.team][c.role].name} comes in`, 2300);
      vo('inj.down', { pri: 1 });
      if (PG.audio) PG.audio.crowd.settle();
    }, 1500);
  }

  /* each snap brings a shaken-up player a play closer to coming back */
  function healStep() {
    const H = G.hurt;
    if (!H || !H.length) return;
    for (let i = H.length - 1; i >= 0; i--) {
      const h = H[i];
      if (--h.left > 0) continue;
      G.ros[h.team][h.role] = h.orig;
      H.splice(i, 1);
      toast(`#${h.orig.num} ${h.orig.name} is back in`);
      vo('inj.back', { pri: 0 });
      if (PG.audio) PG.audio.crowd.cheer(h.team === (G.home || 0) ? 0.5 : 0.2, 1.5);
    }
  }

  /* roughing the kicker: fifteen yards from the old spot and a first down for the kicking team, the kick and any
     return wiped out; a field goal that was good stands */
  function roughKick(p0, s0) {
    const S = p0.rk, off = S.poss, dir = off === 0 ? 1 : -1;
    if (G.score[off] > s0[off]) {
      banner('Flag declined', `Roughing the kicker, ${tname(1 - off)} · the kick is good`, 1700);
      G.deadT = Math.max(G.deadT, 1.8);
      if (PG.audio) PG.audio.pa('Roughing the kicker, defense. The penalty is declined.', { wait: 0.6, clips: ['ref.rk', 'ref.decl'] });
      return;
    }
    const room = off === 0 ? 100 - S.los : S.los, yd = Math.min(15, Math.max(1, Math.floor(room / 2)));
    Object.assign(G, { los: S.los, bx: S.bx, down: S.down, togo: S.togo, fd: S.fd, poss: S.poss, score: S.score, stats: JSON.parse(S.stats), my: JSON.parse(S.my), box: JSON.parse(S.box), pendKO: S.pendKO, pat: S.pat });
    if (G.scores) G.scores.length = S.nScores;
    setBall(off, S.los + dir * yd, S.bx);
    G.sig = 'fd';
    G.last = 'Roughing the kicker';
    G.rp = false;
    G.celeb = null;
    G.state = 'dead';
    G.deadT = 2.4;
    banner('Flag', `Roughing the kicker, ${tname(1 - off)} · ${yd} yards, automatic first down`, 2100);
    snd('whistle');
    refCall(`Roughing the kicker, defense. ${yd} yard penalty. Automatic first down.`, 1 - off, 0.75, ['ref.rk', yd === 15 ? 'ref.fifteen' : yd <= 10 ? 'ref.yd.' + yd : null, 'ref.auto'].filter(Boolean));
    hudKey = '';
    updHud();
  }

  /* defensive holding: five yards from the old spot and a first down, unless the play did better (a touchdown, or a
     first down farther on): then the offense declines it */
  function defHold(p0, s0) {
    const S = p0.dhold, off = p0.offTeam, dir = off === 0 ? 1 : -1;
    const kept = G.poss === off && G.score[1 - off] === s0[1 - off] && G.pendKO == null, td = G.score[off] > s0[off];
    const room = off === 0 ? 100 - S.los : S.los, yd = Math.min(5, Math.max(1, Math.floor(room / 2)));
    if (td || (kept && G.down === 1 && (G.los - S.los) * dir >= yd)) {
      banner('Flag declined', `Holding, ${tname(1 - off)} · the play stands`, 1700);
      G.deadT = Math.max(G.deadT, 1.8);
      if (PG.audio) PG.audio.pa('Holding, defense. The penalty is declined.', { wait: 0.6, clips: ['ref.dhold', 'ref.decl'] });
      return;
    }
    Object.assign(G, { los: S.los, bx: S.bx, down: S.down, togo: S.togo, fd: S.fd, poss: S.poss, score: S.score, stats: JSON.parse(S.stats), my: JSON.parse(S.my), box: JSON.parse(S.box), pendKO: S.pendKO, pat: S.pat });
    if (G.scores) G.scores.length = S.nScores;
    setBall(off, S.los + dir * yd, S.bx);
    G.sig = 'fd';
    G.last = 'Holding, defense';
    G.rp = false;
    G.state = 'dead';
    G.deadT = 2.3;
    banner('Flag', `Holding, ${tname(1 - off)} · ${yd} yards, automatic first down`, 2000);
    snd('whistle');
    refCall(`Holding, defense. ${yd} yard penalty. Automatic first down.`, 1 - off, 0.6, ['ref.dhold', 'ref.yd.' + yd, 'ref.auto']);
    hudKey = '';
    updHud();
  }

  /* intentional grounding: the down is lost, and the ball goes back to where he threw it, or ten yards, the farther */
  function grounding(p0, s0) {
    const off = p0.offTeam, dir = off === 0 ? 1 : -1;
    if (G.poss !== off || G.score[0] !== s0[0] || G.score[1] !== s0[1]) return;  // on fourth down the ball went over anyway
    G.los = clamp(off === 0 ? Math.min(p0.los - 10, p0.ground) : Math.max(p0.los + 10, p0.ground), 1, 99);
    G.togo = Math.max(1, Math.round((G.fd - G.los) * dir));
    const yd = Math.round((p0.los - G.los) * dir);
    G.last = 'Intentional grounding';
    G.deadT = Math.max(G.deadT, 2.4);
    banner('Flag', `Intentional grounding, ${tname(off)} · loss of down, ${yd} yards`, 2100);
    snd('whistle');
    refCall('Intentional grounding, offense. Loss of down.', off, 0.6, ['ref.ground', 'ref.lod']);
    hudKey = '';
    updHud();
  }

  function finish0(kind, arg) {
    if (kind === 'fg' && G.patKick != null) return finishPat(!!arg);  // an extra point, not a field goal
    /* Brought down, or out of bounds, already in the end zone he is attacking: that is a touchdown. The tackle check
       runs before the goal-line check in each step, so a catch in the end zone with a defender on the receiver, or a
       runner hit as he crossed, used to be spotted at the one-yard line and called a first down. */
    const cc = ps && ps.carrier;
    if ((kind === 'tackle' || kind === 'oob') && cc && P.includes(cc) && (cc.team === 0 ? cc.y >= 100 : cc.y <= 0)) {
      kind = 'td';
      goalLine++;
    }
    if (G.try2 != null) return finishTry(kind);
    /* holding: now and then a good gain comes back. Ten yards from the old spot and the down is replayed. */
    if (flagsOn() && (kind === 'tackle' || kind === 'oob' || kind === 'td') && ps.mode !== 'ko' && ps.mode !== 'kick' && !ps.turnover && !ps.fum) {
      const who = ps.carrier, o = ps.offTeam, d = o === 0 ? 1 : -1;
      if (who && who.team === o && (who.y - ps.los) * d >= 4 && rnd() < 0.02) {
        const room = o === 0 ? ps.los : 100 - ps.los, yd = Math.min(10, Math.max(1, Math.floor(room / 2)));
        return flagAfter('Holding', o, ps.los - d * yd, ps.bx, false, `${yd} yard${yd === 1 ? '' : 's'}, replay the down`);
      }
    }
    const off = ps.offTeam, dir = G.dir, c = ps.carrier, los = ps.los, me = QUIET ? null : G.me;
    if (kind === 'tackle' && c && c.team === off && !ps.turnover && !ps.lateFlag && ps.tackler && watched() && Math.random() < 0.012) ps.lateFlag = 'Facemask';  // a hand in the bars on the way down
    if (kind === 'oob' && c && c.team === off && !ps.turnover && !ps.lateFlag && watched() && P.some(o => o.team !== off && !o.down && hyp(o.x - c.x, o.y - c.y) < 1.4) && Math.random() < 0.1) ps.lateFlag = 'Unnecessary roughness';  // a shove after he is out
    G.chg = null;  // a throw still being wound up dies with the play
    let big = '', sub = '', stop = false, score = false, rpGain = 0, tryRes = '';
    const s0 = G.score.slice();  // the score before this play, for the booth
    if (kind === 'inc') {
      big = arg || 'Incomplete';
      G.sig = 'inc';
      stop = true;
      G.down++;
      G.stats[off].att++;
      credit(ps.passer, 'att', 1);
      react(1 - off, 0.35, 1.4);
    } else if (kind === 'td') {
      const t = c.team;
      G.score[t] += 6;
      /* the try: when you run the whole team you choose after the celebration; everyone else decides right here */
      let tryTxt = '';
      if (t === 0 && !AUTO && !QUIET && !G.drill && (!G.lock || !wantsTwo(t))) G.pat = t;  // your extra point is kicked by you (a career's coach still decides when to go for two)
      else if (wantsTwo(t)) {
        const ok = rnd() < 0.45;
        if (ok) G.score[t] += 2;
        tryTxt = ok ? ' · two-point try is good' : ' · two-point try fails';
        tryRes = ok ? 'two.good' : 'two.miss';
      } else {
        const xp = rnd() < 0.96;
        if (xp) G.score[t]++;
        tryTxt = xp ? ' · extra point is good' : ' · extra point missed';
        tryRes = xp ? 'xp.good' : 'xp.miss';
      }
      big = 'Touchdown!';
      G.sig = 'td';
      sub = tname(t) + (ps.mode === 'ko' ? (ps.punt ? ' · punt return' : ' · kick return') : '') + tryTxt;
      {
        const gain = Math.round(((t === 0 ? 100 : 0) - los) * dir), nm = c.name || 'him';
        const how = ps.mode === 'ko' ? `${ps.punt ? 'Punt' : 'Kickoff'} return, ${nm}` : t !== off ? `${ps.fum ? 'Fumble' : 'Interception'} return, ${nm}`
          : ps.caught ? `${gain}-yd pass${ps.passer && ps.passer !== c ? ` from ${ps.passer.name}` : ''} to ${nm}` : `${gain}-yd run, ${nm}`;
        G.lastScore = logScore(t, 'TD', how + (tryRes ? ` (${{ 'xp.good': 'kick good', 'xp.miss': 'kick missed', 'two.good': 'two-point try good', 'two.miss': 'two-point try failed' }[tryRes]})` : ''), t === off && ps.mode !== 'ko' ? driveNow(off, t === 0 ? 100 : 0) : null);
      }
      score = true;
      if (ps.mode === 'ko') {
        /* a return: no yards from scrimmage, nobody's turnover */
        if (me && c === me) retStat(Math.round(((t === 0 ? 100 : 0) - ps.land) * dir), true);
      } else if (t === off) addYds(off, Math.round(((t === 0 ? 100 : 0) - los) * dir), true);
      else {
        G.stats[off].to++;
        if (!ps.fum) {
          credit(c, 'int', 1);
          credit(ps.passer, 'pint', 1);
        }
      }
      credit(c, 'td', 1);
      if (t === off && ps.mode !== 'ko' && !AUTO) driveCard('Touchdown drive', G.lastScore.drive);
      G.celeb = celebFor(t, c);
      kickoff(1 - t);
      confetti(t);
      if (t === 0) {
        buzz([40, 60, 40, 60, 90]);
        snd('horn');
        snd('fanfare');
        snd('boom');  // the cannon behind the end zone
      }
      react(t, 1.4, 5.5);
    } else if (kind === 'fumble') {
      const t = arg.team, f = ps.fum.forced, ez = t === 0 ? c.y <= 0 : c.y >= 100;
      stop = true;
      big = ps.fum.muff ? 'Muffed punt!' : 'Fumble!';
      if (ps.mode === 'ko' && G.kr && me && ps.fum.by === me && t !== 0) {
        G.kr = false;  // you put it on the ground: the coach sends somebody else back for the rest of the day
        G.my.krf = (G.my.krf || 0) + 1;
        setTimeout(() => toast('Coach: somebody else returns kicks today'), 2600);
      }
      sub = `${c.name} recovers for the ${tname(t)}` + (f ? ` · forced by ${f.name}` : '');
      G.stats[1 - t].to++;
      react(t, 1.2, 3);
      snd('whoop', { x: c.x, delay: 0.4 });
      setBall(t, ez ? (t === 0 ? 20 : 80) : c.y, c.x);
    } else if (kind === 'tackle' || kind === 'oob') {
      const t = c.team, x = c.x;
      let y = c.y;  // where the officials spot him (see the challenge below)
      if (me && ps.tackler === me) G.my.tkl++;
      credit(ps.tackler, 'tkl', 1);
      if (ps.mode === 'ko') {
        stop = true;
        const ez = t === 0 ? y <= 0 : y >= 100, ry = Math.max(0, Math.round((y - ps.land) * dir));
        big = ez ? 'Touchback' : ps.punt ? 'Punt return' : 'Kick return';
        sub = ez ? tname(t) + ' ball' : `${c.name} · ${ry} yard${ry===1?'':'s'}`;
        setBall(t, ez ? (t === 0 ? 25 : 75) : y, x);
        if (ry >= 30) react(t, 0.8, 2.5);
        if (me && c === me && !ez) retStat(ry, false);
      } else if (t !== off && ps.fum && ps.fum.scoop) {
        stop = true;
        big = 'Fumble!';
        sub = `${c.name} scoops it up · ${tname(t)} ball`;
        G.stats[off].to++;
        react(t, 1.2, 3);
        snd('whoop', { x, delay: 0.4 });
        const ez = t === 0 ? y <= 0 : y >= 100;
        setBall(t, ez ? (t === 0 ? 20 : 80) : y, x);
      } else if (t !== off) {
        stop = true;
        big = 'Interception!';
        sub = tname(t) + ' ball';
        G.stats[off].to++;
        G.stats[off].att++;
        credit(c, 'int', 1);
        credit(ps.passer, 'att', 1);
        credit(ps.passer, 'pint', 1);
        react(t, 1.2, 3);
        snd('whoop', { x, delay: 0.4 });
        const ez = t === 0 ? y <= 0 : y >= 100;
        setBall(t, ez ? (t === 0 ? 20 : 80) : y, x);
      } else if (off === 0 ? y <= 0 : y >= 100) {
        G.score[1 - off] += 2;
        big = 'Safety!';
        sub = tname(1 - off) + ' +2';
        score = true;
        logScore(1 - off, 'SAF', `${c.name || 'Ball carrier'} downed in the end zone`, null);
        react(1 - off, 1.2, 3);
        setBall(1 - off, off === 0 ? 65 : 35, FW / 2);
      } else {
        /* A close spot (within half a yard of the line to gain) can be got wrong: about three in ten are given the
           other side of the line. Whoever the ruling went against may challenge it (see resolveChallenge). The
           officials' mistakes come from Math.random, not the game's generator: seeded runs are not disturbed. */
        G.review = null;
        const near = (c.y - ps.fd) * dir;
        if (!AUTO && !QUIET && !G.drill && Math.abs(near) < 0.6 && ps.fd > 1 && ps.fd < 99) {
          const wrong = Math.random() < 0.3, spot = wrong ? ps.fd - dir * (near >= 0 ? 1 : -1) * (0.12 + Math.random() * 0.3) : c.y, ruledMade = (spot - ps.fd) * dir >= 0;
          y = spot;
          G.review = { trueY: c.y, x: c.x, wrong, made: near >= 0, off, down0: G.down, fd: ps.fd, hurt: ruledMade ? 1 - off : off };
        }
        const g = (y - los) * dir, gi = Math.round(g), sack = c === ps.qb && ps.mode === 'pass' && !ps.thrown && g < 0;
        addYds(off, gi, false, sack);
        stop = kind === 'oob';
        rpGain = gi;
        if (sack && me && ps.tackler === me) G.my.sack++;
        if (sack) credit(ps.tackler, 'sack', 1);
        sub = `${c.name} #${c.num}${ps.caught?' · catch':''}${kind==='oob'?' · out of bounds':''}${ps.slid?' · slide':''}`;
        if (sack) {
          react(1 - off, 0.9, 2.2);
          snd('whoop', { x: c.x, delay: 0.5 });  // and so do the men who got there
        } else if (gi >= 15) react(off, 0.6 + Math.min(0.6, gi / 50), 2.6);
        else if (gi < 0) react(1 - off, 0.4, 1.5);
        const inches = !AUTO && !QUIET && Math.abs((y - ps.fd) * dir) < 0.35 && ps.fd > 1 && ps.fd < 99;  // too close to call by eye: the chains come out
        if ((y - ps.fd) * dir >= 0) {
          const dn = G.down;
          setBall(off, y, x);
          big = 'First down';
          G.sig = 'fd';
          sub = inches ? 'Measurement · the nose of the ball is past the stick' : `${gi}-yard ${ps.caught?'catch':'run'} · ${c.name}`;
          if (off === 0) {
            snd('chime');
            if (gi < 15) react(0, 0.45, 1.8);
            /* the ones that matter (a third or fourth down made, or a good gain) get the stadium announcer, and the crowd
               finishing his sentence; not on the road, where it is the other team's announcer */
            if (!AUTO && !QUIET && !G.drill && PG.audio && !G.home && (dn >= 3 || gi >= 8)) PG.audio.firstDown(TEAMS[G.tm[0]].name, vk(G.tm[0]));
          }
        } else {
          G.down++;
          G.los = clamp(y, 1, 99);
          G.bx = hash(x);
          G.togo = (ps.fd - G.los) * dir;
          big = sack ? 'Sack!' : gi > 0 ? `+${gi} yard${gi>1?'s':''}` : gi === 0 ? 'No gain' : `Loss of ${-gi}`;
          if (inches) sub = `Measurement · short by ${Math.max(1, Math.round((ps.fd - y) * dir * 36))} inches`;
        }
      }
    } else if (kind === 'fg') {
      const d = ps.kick.dist | 0;
      if (arg) {
        G.score[off] += 3;
        big = 'It’s good!';
        G.sig = 'td';
        sub = `${d}-yard field goal` + (ps.kick.post ? ' · in off the upright' : '');
        G.lastScore = logScore(off, 'FG', `${d}-yd field goal${ps.kick.post ? ', off the upright' : ''}`, driveNow(off, los));
        if (!AUTO) driveCard('Field goal drive', G.lastScore.drive);
        score = true;
        kickoff(1 - off);
        if (off === 0) snd('chime');
        react(off, 0.9, 3);
      } else {
        big = 'No good';
        G.sig = 'inc';
        sub = `${d}-yard attempt` + (ps.kick.post ? ' · off the upright' : '');
        stop = true;
        react(1 - off, 0.7, 2);
        setBall(1 - off, off === 0 ? Math.min(los, 80) : Math.max(los, 20), FW / 2);
      }
    } else if (kind === 'kotb') {
      big = 'Touchback';
      sub = tname(off) + ' ball';
      stop = true;
      setBall(off, off === 0 ? 25 : 75, FW / 2);
    } else if (kind === 'punt') {
      big = 'Punt';
      sub = arg.tb ? 'Touchback' : `${arg.fair?'Fair catch':arg.d+' yards'} · ${tname(1-off)} ball at ${spotTxt(arg.y)}`;
      stop = true;
      setBall(1 - off, arg.y, arg.x);
    }
    if (G.poss === off && G.down > 4 && !score) {
      setBall(1 - off, G.los, G.bx);
      sub = 'Turnover on downs';
      stop = true;
      react(1 - off, 0.9, 2.5);
    }
    if ((kind === 'tackle' || kind === 'oob') && ps.fum && !ps.fum.scoop) sub += ps.fum.muff ? ' · muffed, recovered' : ' · fumble, recovered';
    if (G.review && youChallenge() && !AUTO && !QUIET) setTimeout(() => {
      if (G.review && G.state !== 'menu') toast('Close spot · challenge it on the next screen · a timeout if it stands');
    }, 1300);
    G.runoff = !stop && !score && !G.drill ? Math.min(hurry(off) && G.poss === off ? 8 : 13, G.clock) : 0;  // the clock keeps running after an in-bounds tackle (there is no clock in practice); a hurry-up offense gets back to the line sooner
    G.clock -= G.runoff;
    twoMinute();
    cpuTimeout();
    if (G.ot && score) G.final = true;
    G.last = sub === 'Turnover on downs' ? sub : big;
    if (ps.third != null && !ps.thirdDone) {
      ps.thirdDone = true;
      const t3 = G.third || (G.third = [[0, 0], [0, 0]]);
      t3[ps.third][0]++;
      if (big === 'First down' || (kind === 'td' && c && c.team === ps.third)) t3[ps.third][1]++;
    }
    callPlay(kind, kind === 'td' ? tryRes : arg, big, sub, rpGain, c, s0);
    if (!AUTO && !QUIET && !G.drill && G.highs) highCheck();
    if (!AUTO && !QUIET && !G.drill && c && c.team === off && (kind === 'td' || kind === 'tackle' || kind === 'oob')) {
      /* the broadcast's tracking numbers: how unlikely a catch was, and how fast a long run got */
      const gain = kind === 'td' ? Math.round(((off === 0 ? 100 : 0) - los) * dir) : rpGain, caught = !!ps.caught, cp = caught ? ps.cp : null, mph = (c.top || 0) * 2.0455;  // read now: the play is gone when the card goes up
      if (cp != null && cp < 0.32 && gain >= 8) later(() => statCard(c, Math.round(cp * 100) + '%', 'Completion probability', `${gain}-yard catch`), kind === 'td' ? 6000 : 1000);
      else if (gain >= 25 && mph >= 15) later(() => statCard(c, mph.toFixed(1), 'Top speed · mph', `${gain}-yard ${caught ? 'catch' : 'run'}${kind === 'td' ? ' · touchdown' : ''}`), 6000);
    }
    if (!AUTO && !QUIET && !G.drill && c && c.team === off) {
      /* your man's line if he was in it (a career), otherwise the scorer's, or the runner's after 20 yards or more */
      const caught = !!ps.caught, mine = G.me && (c === G.me || (ps.passer === G.me && caught)) ? G.me : null, who = mine || c, gain = rpGain;  // read now: the play is gone by the time the card goes up
      if (kind === 'td') setTimeout(() => playerCard(who, mine && mine !== c ? 'Touchdown pass' : 'Touchdown'), 1600);
      else if ((kind === 'tackle' || kind === 'oob') && gain >= 20 && performance.now() - bcAt > 25000 && (mine || c.team === 0)) setTimeout(() => playerCard(who, `${gain}-yard ${mine && mine !== c ? 'completion' : caught ? 'catch' : 'run'}`), 900);
    }
    if (G.drive && (score || G.poss !== off)) G.drive.done = true;
    if (kind !== 'td') snd('whistle');
    for (const p of P) {
      p.eng = null;
      p.block = null;
    }
    ps.after = 0;
    G.rp = !QUIET && !AUTO && SET.replay !== false && (kind === 'td' || kind === 'fumble' || big === 'Interception!' || rpGain >= 28);
    /* is this the play of the game so far? Scores, takeaways, sacks and long gains count; yours count a little more. */
    if (!AUTO && !QUIET && c && !G.drill) {
      const gain = rpGain || (kind === 'td' && c.team === off && ps.mode !== 'ko' ? Math.round(((off === 0 ? 100 : 0) - los) * dir) : 0);
      const pick6 = big === 'Interception!', sack = big === 'Sack!';
      const sc = (kind === 'td' ? 60 + gain * 0.6 : pick6 ? 55 : kind === 'fumble' ? 50 : sack ? 22 : gain) * (c.team === 0 ? 1.2 : 1);
      if (sc >= 15 && (!G.potd || sc > G.potd.score)) {
        const how = ps.mode === 'ko' ? (ps.punt ? 'punt return' : 'kick return') : c.team !== off ? 'return' : ps.caught ? 'catch' : 'run';
        const text = kind === 'td' ? `${c.name}, ${gain > 0 ? gain + '-yard ' : ''}touchdown ${how}` : pick6 ? `${c.name}, interception` : kind === 'fumble' ? `${c.name}, fumble recovery`
          : sack ? `${ps.tackler ? ps.tackler.name : 'The defense'}, sack` : `${c.name}, ${gain}-yard ${how}`;
        G.hl = { score: sc, text };
      }
    }
    if (G.drill) {
      /* what this rep came to, for whoever scores the drill */
      const own = !!c && c.team === off, td = kind === 'td' && own;
      G.drill.reps.push({ play: G.op.n, big, gain: td ? Math.round(((off === 0 ? 100 : 0) - los) * dir) : rpGain, caught: own && !!ps.caught, td,
        takeaway: big === 'Interception!' || (kind === 'td' && !own) || (kind === 'fumble' && arg.team !== off), tkl: ps.userTkl || 0 });
    }
    G.state = 'dead';
    G.deadT = score ? 2.6 : !AUTO && hurry(G.poss) && G.poss === off ? 1.1 : 1.7;
    banner(big, sub, G.deadT * 1000 - 150);
    updHud();
  }

  /* A timeout gives back the seconds that ran off after the last play. Three per half for each team. */
  function timeout(t) {
    if (!G.to || G.to[t] <= 0 || G.runoff <= 0 || G.drill) return false;
    G.to[t]--;
    G.clock += G.runoff;
    G.runoff = 0;
    G.sig = 'to';  // the officials signal it
    hudKey = '';
    if (!AUTO && !QUIET) {
      snd('whistle');
      toast(`Timeout, ${tname(t)} · ${G.to[t]} left`);
      vo(chance(0.7) ? 'timeout.team.' + tab(t) : 'timeout');
      if (PG.audio) PG.audio.pa(`Timeout, ${tname(t)}.`, { wait: 1.6, clips: ['ref.to.' + tab(t), 'ref.tox' + (3 - G.to[t])] });  // after the booth: "Timeout, Outlaws. That's their second timeout
      updHud();
    }
    return true;
  }

  /* The two-minute warning, as the professional game has it: the first time the clock reaches 2:00 in the second or
     the fourth quarter, it stops there. If it got there running between plays it stops at exactly 2:00 (the seconds
     past it are given back), and since the clock is stopped there is nothing for a timeout to save. It is called on
     the play-call sheet that follows. Quarters of two minutes or less have none: there would be nothing before it. */
  const WARN = 120;

  /* The two-minute drill: late in a half, an offense that needs points goes no-huddle. In the fourth quarter that is a
     side that is behind or level, in the last two minutes (or the last half of a short quarter); before halftime,
     anybody with the ball in the last minute (or quarter). Between plays only 8 seconds run instead of 13, and the
     user's play-call sheet comes up sooner, marked "No huddle". Measured: letting it run for two minutes before
     halftime as well, with more passing, put six more points a game on the board; this is the narrower rule. */
  const hurry = t => !G.drill && G.try2 == null && G.clock > 0 && (G.q === 2 ? G.clock <= Math.min(60, G.ql * 0.25) : G.q >= 4 && G.clock <= Math.min(WARN, G.ql * 0.5) && G.score[t] <= G.score[1 - t]);

  function twoMinute() {
    if (G.drill || G.ot || G.ql <= WARN || !(G.q === 2 || G.q === 4) || G.clock > WARN || G.clock <= 0 || (G.warned && G.warned[G.q])) return;
    G.warned = Object.assign({}, G.warned, { [G.q]: 1 });
    if (G.clock + G.runoff > WARN) G.clock = WARN;  // it ran down to 2:00 between plays: stopped right there
    G.runoff = 0;
    G.warnNow = true;
    if (G.sig !== 'td') G.sig = 'to';  // the officials give the timeout signal
  }

  /* called on the next play-call sheet: the referee, the booth and a banner */
  function warnCall() {
    if (!G.warnNow) return;
    G.warnNow = false;
    if (AUTO || QUIET) return;
    banner('Two-minute warning', `${G.q === 2 ? '2nd' : '4th'} quarter · clock stopped`, 1700);
    snd('whistle');
    if (PG.audio) PG.audio.pa('Two minute warning.', { clips: ['ref.twomin'], wait: 0.4 });
    vo('twomin', { pri: 1, ttl: 6 });
    analyst('a.twomin', 0.5, { big: true, ttl: 9 });
  }

  /* The computer's clock management: late in a half, the side that needs time stops the clock.
     It speaks for team 1 always, and for team 0 when the computer or the career coach runs that team. */
  function cpuTimeout() {
    if (G.runoff <= 0 || G.drill || !(G.q === 2 || G.q >= 4) || G.clock > Math.min(120, G.ql * 0.4)) return;
    for (const t of [0, 1]) {
      if (t === 0 && !AUTO && !G.lock) continue;  // the user decides for their own team
      const lead = G.score[t] - G.score[1 - t], hasBall = G.poss === t, deep = hasBall && (t === 0 ? G.los > 45 : G.los < 55);
      const want = G.q === 2 ? deep : lead < 0 ? lead >= -16 : lead === 0 && deep;
      if (want && timeout(t)) return;
    }
  }

  /* flags can be switched off in Settings; there are none in practice or on a two-point try */
  const flagsOn = () => SET.pen !== false && !G.drill && G.try2 == null;

  /* The referee gives his call to the stadium over the speakers, and the home crowd answers when it has heard which way
     it went: a boo when the flag is on its own team, a cheer when it is on the visitors. The words are spelled out
     ("ten yard penalty"), because the speakers' voice works from spelling. */
  const NUMS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

  const REF = { 'False start': 'ref.false', Offside: 'ref.offside', Holding: 'ref.hold', 'Pass interference': 'ref.pi', 'Roughing the passer': 'ref.rough', 'Unnecessary roughness': 'ref.unr', 'Illegal formation': 'ref.illf', Facemask: 'ref.face' };

  function refCall(text, team, size, clips) {
    if (AUTO || QUIET || !PG.audio) return;
    const a = PG.audio, len = a.pa(text.replace(/\d+/g, n => NUMS[+n] || n), { wait: G.drill ? 0 : 0.9, clips });  // the booth sees the flag first, then the referee has the floor
    vo('flag');
    a.crowd.ooh(0.35);  // a flag is down, and nobody knows on whom yet
    setTimeout(() => {
      if (!G.ros || G.state === 'menu' || G.state === 'over') return;
      if (team === (G.home || 0)) a.crowd.boo(size);  // a flag on the home side is booed, one on the visitors cheered
      else {
        a.crowd.cheer(size, 2);
        if (R3) R3.cheer(size);
      }
      analyst('a.flag', 0.35);
    }, len ? Math.max(500, len * 1000 - 450) : 350);
  }

  /* A flag thrown during the play. The play does not count: the ball goes where the foul puts it, and the down is
     replayed, or it is a first down when the foul gives one. */
  function flagAfter(name, team, y, x, first, text) {
    const off = ps.offTeam, dir = off === 0 ? 1 : -1;
    ps.flagged = true;
    for (const p of P) {
      p.eng = null;
      p.block = null;
    }
    if (first) setBall(off, y, x);
    else {
      G.los = clamp(y, 1, 99);
      G.togo = Math.max(1, (ps.fd - G.los) * dir);
    }
    G.last = name;
    G.sig = first ? 'fd' : null;
    G.rp = false;
    G.runoff = 0;
    ps.after = 0;
    G.state = 'dead';
    G.deadT = 2.1;
    banner('Flag', `${name}, ${tname(team)} · ${text}`, 1900);
    snd('whistle');
    const yd = parseInt(text, 10);
    refCall(`${name}, ${team === off ? 'offense' : 'defense'}. ${first ? 'Automatic first down' : text.replace(',', ' penalty.').replace('yards', 'yard')}.`, team, 0.7,
      [REF[name], first ? 'ref.auto' : 'ref.yd.' + yd, first ? null : 'ref.rep' + G.down].filter(Boolean));
    hudKey = '';
    updHud();
  }

  /* A flag before the snap: five yards, or half the distance to the goal, and the down is played again */
  function flag(name, team) {
    const off = ps.offTeam, dir = off === 0 ? 1 : -1, onOff = team === off;
    const room = onOff ? (off === 0 ? G.los : 100 - G.los) : (off === 0 ? 100 - G.los : G.los);
    const yd = Math.min(5, Math.max(1, Math.floor(room / 2)));
    G.los = clamp(G.los + (onOff ? -dir : dir) * yd, 1, 99);
    G.togo += onOff ? yd : -yd;
    if (G.togo <= 0) setBall(off, G.los, G.bx);  // enough for a first down
    G.last = name;
    G.rp = false;
    G.runoff = 0;
    G.state = 'dead';
    G.deadT = 1.9;
    banner('Flag', `${name}, ${tname(team)} · ${yd} yard${yd === 1 ? '' : 's'}`, 1700);
    snd('whistle');
    const fresh = G.down === 1 && G.togo === 10;
    refCall(`${name}, ${onOff ? 'offense' : 'defense'}. ${yd} yard penalty. ${fresh ? 'First down' : 'Replay the down'}.`, team, 0.55, [REF[name], 'ref.yd.' + yd, fresh ? 'ref.first' : 'ref.rep' + G.down]);
    updHud();
  }

  /* Quarter and game-end bookkeeping. Returns true when the game is over. */
  function advance() {
    if (G.final) return true;
    if (G.drill) return false;
    if (G.clock <= 0) {
      const tie = G.score[0] === G.score[1];
      G.runoff = 0;  // too late for a timeout: the period is over
      if (G.q === 2) {
        G.q = 3;
        G.clock = G.ql;
        G.to = [3, 3];
        kickoff(1 - G.first);
        if (!QUIET && !AUTO) G.half = true;
        else banner('Halftime', tname(1 - G.first) + ' ball', 1600);
      } else if (G.q >= 4) {
        if (tie && (G.q === 4 || (G.mustWin && G.q < 8))) {
          G.q++;
          G.ot = true;
          G.clock = G.ql;
          const otr = rnd() < .5 ? 0 : 1;
          kickoff(otr);
          banner('Overtime', `Next score wins · ${tname(otr)} won the toss`, 1600);
          if (!AUTO && !QUIET && PG.audio) PG.audio.pa(`The ${tname(otr)} have won the toss, and will receive.`, { wait: 2.2, clips: ['ref.toss.' + tab(otr)] });
          vo('ot', { pri: 2 });
        } else {
          G.final = true;
          return true;
        }
      } else {
        G.q++;
        G.clock = G.ql;
        banner(`End of the ${G.q === 2 ? '1st' : '3rd'} quarter`, 'The teams switch ends', 1800);  // render3d.js turns the stadium round
        if (!AUTO && !QUIET) later(() => teamStatsCard(`After ${G.q === 2 ? 'one' : 'three'}`), 1900);
        if (G.around) G.aroundDue = G.q - 1;  // the other games, as far as they have got: shown at your next snap (in a career the quarter often ends in a drive you only hear about)
        vo(G.q === 2 ? 'q.end1' : 'q.end3');
      }
    }
    return false;
  }

  /* The recording of the best play so far is kept whole: the frames, and copies of the 22 players and of the play's
     own state, so it can be shown again from a final screen after the field has been cleared. */
  function keepHighlight() {
    const h = G.hl;
    G.hl = null;
    if (!h || !ps || REC.length < 20) return;
    const at = p => (p ? P.indexOf(p) : -1);
    G.potd = { score: h.score, text: h.text, dir: G.dir, frames: REC.slice(), players: P.map(p => ({ ...p, eng: null, block: null, man: null, bt: null })),
      ps: { ...ps, qb: at(ps.qb), runner: at(ps.runner), tackler: at(ps.tackler), passer: at(ps.passer), carrier: null, air: null, loose: null, recs: [], fum: null, tgt: null } };
  }

  /* shows it; done() puts the final screen back */
  function watchPotd(done) {
    const h = G.potd;
    if (!h || G.state !== 'over') return;
    scr.innerHTML = '';
    P = h.players.map(p => ({ ...p }));
    const at = i => (i >= 0 ? P[i] : null);
    ps = { ...h.ps, qb: at(h.ps.qb), runner: at(h.ps.runner), tackler: at(h.ps.tackler), passer: at(h.ps.passer) };
    G.dir = h.dir;
    REC.length = 0;
    for (const f of h.frames) REC.push(f);
    G.rpEnd = () => {
      P = [];
      ps = null;
      G.state = 'over';
      $('#rp').lastChild.textContent = 'Replay · tap to skip';
      done();
    };
    cam.snap = true;
    G.state = 'replay';
    rpBegin(Math.max(0, REC.length - 270), 'Play of the game');
    G.celeb = null;
    $('#rp').hidden = false;
    $('#banner').classList.remove('on');
  }

  function next() {
    if (!AUTO && !QUIET) clearCards();  // the last play's banner does not hang over the next call
    keepHighlight();
    if (G.rp) {
      G.rp = false;
      if (REC.length > 50 && !(SET.wff && G.watch && !G.me)) return startReplay();  // fast forward goes past the replays too
    }
    if (G.drill) {
      if (--G.drill.left <= 0) return endGame();
      const t = G.drill.side === 'off' ? 0 : 1;
      setBall(t, t === 0 ? 30 : 70, FW / 2);
      G.pendKO = null;
      G.score = [0, 0];
      return startCall();
    }  // practice: same spot every rep
    if (G.pat != null) return G.lock ? patKick(G.pat) : showPat();  // your touchdown: one point or two? (a career's coach has chosen the kick)
    if (advance()) return endGame();
    if (G.half) {
      G.half = false;
      return playScene('half', {}, showHalf);  // the teams jog off first
    }
    startCall();
  }

  /* Instant replay: every live frame is recorded (positions, pose flags, the ball); big plays are shown again
     at half speed from a low sideline camera, and then once more from the reverse angle, the way a broadcast does
     it: a camera ahead of the play, looking back at the ball carrier coming toward it. */
  const REC = [];

  function record() {
    if (AUTO || QUIET || !ps) return;
    const n = P.length, d = new Float32Array(n * 8);
    for (let i = 0; i < n; i++) {
      const p = P[i], o = p.eng || p.block, k = i * 8;
      d[k] = p.x;
      d[k + 1] = p.y;
      d[k + 2] = p.vx;
      d[k + 3] = p.vy;
      d[k + 4] = p.anim;
      d[k + 5] = p.thrT;
      d[k + 6] = (p.down ? 1 : 0) | (p.fell ? 2 : 0) | (p.dive > 0 ? 4 : 0) | (p.stun > 0 ? 8 : 0) | (p.juke > 0 ? 16 : 0) | (p.spinT > 0 ? 32 : 0) | (p.eng ? 64 : 0) | (p.block ? 128 : 0) | (p.stiff > 0 ? 256 : 0) | (p.truck > 0 ? 512 : 0) | (p.hurdle > 0 ? 1024 : 0) | (p.hit > 0 ? 2048 : 0) | (p.flat > 0 ? 4096 : 0);
      d[k + 7] = o ? P.indexOf(o) : -1;
    }
    const a = ps.air;
    REC.push({ d, air: a ? { x0: a.x0, y0: a.y0, x1: a.x1, y1: a.y1, t: a.t, T: a.T, h: a.h, kick: a.kick, x: a.x, y: a.y, z: a.z, ti: a.target ? P.indexOf(a.target) : -1 } : null,
      c: ps.carrier ? P.indexOf(ps.carrier) : -1, thrown: ps.thrown, open: ps.open, t: ps.t, loose: ps.loose ? { ...ps.loose } : null });
    if (REC.length > 480) REC.shift();
  }

  /* where the play went: the way the ball carrier (or the ball) was moving from the start of the replay to the end,
     up the field (1) or down it (-1). The reverse angle stands on that side. */
  function rpFocusY(f) {
    return f.c >= 0 ? f.d[f.c * 8 + 1] : f.air ? f.air.y : f.loose ? f.loose.y : null;
  }

  function rpBegin(from, label) {
    G.rpI = G.rpFrom = from;
    G.rpAngle = 0;
    G.rpLabel = label;
    const y0 = REC[from] ? rpFocusY(REC[from]) : null, y1 = REC.length ? rpFocusY(REC[REC.length - 1]) : null;
    G.rpDir = y0 !== null && y1 !== null && Math.abs(y1 - y0) > 1 ? Math.sign(y1 - y0) : G.dir || 1;
    $('#rp').lastChild.textContent = label + ' · tap to skip';
  }

  function startReplay() {
    cam.snap = true;
    G.state = 'replay';
    rpBegin(Math.max(0, REC.length - 200), 'Replay');
    G.celeb = null;
    $('#rp').hidden = false;
    $('#banner').classList.remove('on');
    snd('throw');
  }

  function endReplay() {
    $('#rp').hidden = true;
    G.rpAngle = 0;
    REC.length = 0;
    if (G.rpEnd) {
      // it was the play of the game, shown from a final screen
      const f = G.rpEnd;
      G.rpEnd = null;
      return f();
    }
    next();
  }

  function replayStep(dt) {
    G.rpI += dt * 60 * (G.rpAngle ? 0.55 : 0.5);
    const i = Math.floor(G.rpI);
    if (i >= REC.length - 1) {
      if (G.rpAngle === 0 && REC.length - G.rpFrom > 60) {
        /* once more, from the reverse angle: the last two and a half seconds of the play, where it was decided */
        G.rpAngle = 1;
        G.rpI = Math.max(G.rpFrom, REC.length - 150);
        cam.snap = true;
        $('#rp').lastChild.textContent = G.rpLabel + ' · reverse angle';
        return;
      }
      return endReplay();
    }
    const f = REC[i], g = REC[i + 1], u = G.rpI - i, n = Math.min(P.length, f.d.length / 8);
    for (let j = 0; j < n; j++) {
      const p = P[j], k = j * 8, fl = f.d[k + 6], o = f.d[k + 7];
      p.x = lerp(f.d[k], g.d[k], u);
      p.y = lerp(f.d[k + 1], g.d[k + 1], u);
      p.vx = f.d[k + 2];
      p.vy = f.d[k + 3];
      p.anim = lerp(f.d[k + 4], g.d[k + 4], u);
      p.thrT = f.d[k + 5];
      p.down = !!(fl & 1);
      p.fell = fl & 2 ? 1 : 0;
      p.dive = fl & 4 ? 0.2 : 0;
      p.stun = fl & 8 ? 0.2 : 0;
      p.juke = fl & 16 ? 0.2 : 0;
      p.spinT = fl & 32 ? 0.2 : 0;
      p.eng = fl & 64 ? P[o] || null : null;
      p.block = fl & 128 ? P[o] || null : null;
      p.stiff = fl & 256 ? 0.2 : 0;
      p.truck = fl & 512 ? 0.2 : 0;
      p.hurdle = fl & 1024 ? 0.25 : 0;
      p.hit = fl & 2048 ? 0.2 : 0;
      p.flat = fl & 4096 ? 0.2 : 0;
      p.jog = 0;
    }
    const a = f.air, b = g.air || a;
    ps.air = a ? Object.assign({}, a, { target: a.ti >= 0 ? P[a.ti] : null, x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), z: lerp(a.z, b.z, u), t: lerp(a.t, b.t, u) }) : null;
    ps.carrier = f.c >= 0 ? P[f.c] : null;
    ps.thrown = f.thrown;
    ps.open = f.open;
    ps.t = f.t;
    ps.loose = f.loose;
  }

  function endGame() {
    G.state = 'over';
    P = [];
    ps = null;
    G.me = null;
    setBrief('');
    setPad('none');
    if (!AUTO && !G.drill) {
      const w = G.score[0] - G.score[1];
      snd('whistle', { long: true });
      if (w > 0) {
        snd('fanfare');
        react(0, 1.2, 5);
      } else if (w < 0) snd('lose');
      vo(w === 0 ? 'final.tie' : chance(0.5) ? 'win.team.' + tab(w > 0 ? 0 : 1) : w > 0 ? 'final.win' : 'final.loss', { pri: 2 });
      if (G.callout && w !== 0) analyst(w > 0 ? 'call.won' : 'call.lost', 1, { big: true, ttl: 12 });
      else analyst('a.final', 0.8, { big: true, ttl: 10 });
    }
    if (!AUTO && !G.drill && PG.milestones) PG.milestones.game({ us: G.score[0], them: G.score[1], stats: G.stats, ot: G.ot, diff: G.diff, weather: G.env && G.env.weather });
    /* the handshake at midfield first (a cutscene: skipped in simulations, practice, and when they are switched off) */
    const done = () => {
      if (G.onEnd) G.onEnd({ score: G.score.slice(), my: G.my, stats: G.stats, ot: G.ot, potg: playerOfGame(), potgHtml: potgHtml(), box: G.box, potdHtml: potdHtml(), scoringHtml: scoringHtml(G.scores), drill: G.drill });
      else showFinal();
    };
    playScene('final', {}, done);
  }

  /* ---------- play calling ----------
     The computer's play caller, and your coach in a career. First the situation (kneel it out when ahead late, fourth
     down, how likely a run is at this down and distance, the two-minute drill), then one play from that bucket,
     weighted by the team's offense (SCHEME: formations it likes, play action, trick plays), the field (short-field
     plays near the goal line) and what this side has already called this game: the last call is all but ruled out,
     anything from the last four is unlikely, and every play gets less likely each time it is used. R is the dice:
     the seeded rnd for the computer, Math.random for a suggestion, so suggesting a play never moves a seeded run. */
  const schemeOf = t => SCHEME[G.tm[t]] || SCHEME[SCHEME.length - 1];

  /* one play of a category for side t. o.star: the career player's role (his coach leans on him); o.who: only runs by
     that role; o.back: only passes with a route for the back; o.not: plays to leave out; o.f: a formation to stay away from */
  function eligibleOff(t, cat, o = {}) {
    const toGoal = t === 0 ? 100 - G.los : G.los;
    let list = OFF.filter(p => p.cat === cat && !p.quick && (!p.short || G.togo <= 2) && (p.rz !== 2 || toGoal <= 25) && !(o.not && o.not.includes(p)));
    if (o.who) {
      const w = list.filter(p => p.run && p.run.who === o.who);
      if (w.length) list = w;
    }
    if (o.back) {
      const w = list.filter(p => p.r && p.r.RB);
      if (w.length) list = w;
    }
    return list;
  }

  function offWeights(list, t, cat, o = {}) {
    const toGoal = t === 0 ? 100 - G.los : G.los, S = schemeOf(t), star = o.star, hist = (G.called && G.called[t]) || [], n = hist.length;
    return list.map(p => {
      let w = S.f[p.f] ?? 1;
      if (p.pa) w *= S.pa || 1;
      if (p.gadget) w *= 0.3 * (S.gadget || 1) * (star === 'X' && p.run.who === 'X' ? 3 : 1);
      if (toGoal <= 20) w *= p.rz ? 1.8 : cat === 'deep' ? 0.5 : 1;
      if (star === 'X') w *= (p.r && p.r.X) || (p.run && p.run.who === 'X') ? 1.4 : 0.6;
      if (o.f && p.f === o.f) w *= 0.25;
      const last = hist.lastIndexOf(p.n), ago = last < 0 ? 99 : n - last;  // 1: it was the last call
      w *= ago === 1 ? 0.03 : ago <= 4 ? 0.15 : ago <= 10 ? 0.5 : 1;
      let used = 0;
      for (const h of hist) if (h === p.n) used++;
      w /= 1 + used * 0.5;
      return w;
    });
  }

  function pickOff(t, cat, R, o = {}) {
    const list = eligibleOff(t, cat, o);
    if (!list.length) return null;
    const ws = offWeights(list, t, cat, o);
    let tot = 0;
    for (const w of ws) tot += w;
    let x = R() * tot;
    for (let i = 0; i < list.length; i++) if ((x -= ws[i]) <= 0) return list[i];
    return list[list.length - 1];
  }

  /* the situation, without dice: a kick or kneel the moment demands (fixed), the chance of a run (pr), of an option
     (rpoQ) and of a deep pass when it is a pass (deep) */
  function callPlan(t) {
    const toGoal = t === 0 ? 100 - G.los : G.los, ld = G.score[t] - G.score[1 - t], S = schemeOf(t), c = { fixed: null };
    if (G.q === 4 && ld > 0 && G.down <= 3 && G.clock <= Math.max(0, 4 - G.down - G.to[1 - t]) * 40) c.fixed = OFF.find(p => p.quick === 'kneel');  // ahead late: run it out
    else if (G.down === 4 && !(G.go4 && t === 0)) {
      const desp = G.q >= 4 && ld < 0 && G.clock < 100;
      if (toGoal + 17 <= 52 && !(desp && ld < -3)) c.fixed = OFF.find(p => p.n === 'Field Goal');
      else if (!(desp || (G.togo <= 1.5 && toGoal < 60))) c.fixed = OFF.find(p => p.n === 'Punt');
    }
    let pr = G.togo > 7 ? 0.3 : G.togo < 3 ? 0.65 : 0.45;
    if (G.down >= 3 && G.togo > 4) pr = 0.12;
    pr = clamp(pr * (1 + (S.run || 0) * 2), 0.03, 0.85);  // a running team runs a little more
    const two = G.clock < 100 && (G.q === 2 || (G.q >= 4 && ld < 0));  // the two-minute drill: throw, and look deep
    if (two) pr = Math.min(pr, 0.15);
    // career: the coach leans on the user's position so they stay involved
    const star = G.lock && t === 0 && !AUTO ? G.lock : null;
    c.star = star;
    c.rpoQ = (star === 'QB' || star === 'X') && G.togo >= 3 && G.togo <= 10 ? 0.12 : 0;  // your coach likes an option now and then (never for a computer-only game)
    if (star === 'RB') pr = Math.max(pr, G.down >= 3 && G.togo > 6 ? 0.3 : 0.5);  // measured: at 0.6 a back's team scored too little to win
    else if (star === 'X') pr *= G.drill ? 0 : 0.5;
    const foe = G.lock && t === 1 && !AUTO ? G.lock : null;  // and the opponent tests a defender
    if (foe === 'MLB') pr = Math.min(0.75, pr + 0.15);
    else if (foe === 'CB1') pr *= 0.75;
    c.pr = pr;
    c.deep = clamp((G.togo > 8 ? 0.5 : 0.3) + (S.deep || 0) + (two && toGoal > 30 ? 0.15 : 0), 0.1, 0.75);
    return c;
  }

  function callOff(t, R) {
    const c = callPlan(t);
    if (c.fixed) return c.fixed;
    if (c.rpoQ && R() < c.rpoQ) return pickOff(t, 'rpo', R, { star: c.star });
    if (R() < c.pr) return pickOff(t, 'run', R, { star: c.star, who: c.star === 'RB' ? 'RB' : null });
    return pickOff(t, R() < c.deep ? 'deep' : 'short', R, { star: c.star, back: c.star === 'RB' });
  }

  /* The coach's ranking for the call sheet: every play he might call here, ordered by how likely the play caller above
     is to call it (the same plan and weights, as chances instead of dice), shaken a little with Math.random so the same
     down and distance does not always put the same three on top. A kick or kneel the moment demands goes first. */
  function rankOff(t) {
    const c = callPlan(t), r = Math.max(c.rpoQ, 0.06), odds = [], by = {};
    const q = { rpo: r, run: (1 - r) * c.pr, deep: (1 - r) * (1 - c.pr) * c.deep, short: (1 - r) * (1 - c.pr) * (1 - c.deep) };
    for (const cat in q) {
      const o = { star: c.star, who: cat === 'run' && c.star === 'RB' ? 'RB' : null, back: cat !== 'run' && c.star === 'RB' }, list = eligibleOff(t, cat, o), ws = offWeights(list, t, cat, o);
      const tot = ws.reduce((a, b) => a + b, 0) || 1;
      by[cat] = list.map((p, i) => [p, q[cat] * ws[i] / tot * (0.7 + 0.6 * Math.random())]).sort((a, b) => b[1] - a[1]);
      odds.push(...by[cat]);
    }
    /* His top three share out between the kinds of play by how likely each kind is (the way seats are shared out by
       votes): third and one gets two runs and a pass, first and ten a run, a short pass and a shot. Ranked by single
       plays instead, the kind with the fewest plays in the book would always fill the top. */
    const top = [], took = { rpo: 0, run: 0, deep: 0, short: 0 };
    for (let k = 0; k < 3; k++) {
      let bc = null, bv = 0;
      for (const cat in q) if (by[cat].length > took[cat] && q[cat] / (1 + took[cat]) > bv) {
        bv = q[cat] / (1 + took[cat]);
        bc = cat;
      }
      if (!bc) break;
      top.push(by[bc][took[bc]++][0]);
    }
    const ranked = [...top, ...odds.sort((a, b) => b[1] - a[1]).map(e => e[0]).filter(p => !top.includes(p))];
    return c.fixed ? [c.fixed, ...ranked] : ranked;
  }

  /* the same for the defense: the calls that fit the down and distance first, then the rest by how often they are called */
  function rankDef() {
    const pool = G.togo <= 1.5 || G.los <= 3 ? ['Goal Line'] : G.down >= 3 ? (G.togo >= 12 ? ['Prevent', 'Cover 4'] : G.togo >= 7 ? ['Cover 4', 'Cover 6', 'Tampa 2', 'Fire Zone'] : ['Cover 1 Man', 'Cover 2 Man', 'Man Blitz', 'Overload'])
      : G.togo >= 10 && G.down === 2 ? ['Cover 3', 'Cover 6', 'Zone Blitz'] : ['Cover 2', 'Cover 3', 'Tampa 2', 'Cover 1 Man', 'Fire Zone'];
    const last = G.dcalled && G.dcalled[0][G.dcalled[0].length - 1], fresh = pool.filter(n => n !== last).sort(() => Math.random() - 0.5);
    const names = [...fresh, ...pool, ...DBASE.map(d => d[0]), ...DEF.map(d => d.n)];
    return [...new Set(names)].map(DEFN);
  }

  /* the computer's call; half its plays are run to the other side (the formation and every route mirrored) */
  function cpuOff(t) {
    const op = callOff(t, rnd);
    G.flipNext = op.cat !== 'special' && !G.drill && rnd() < 0.5;
    return op;
  }

  const DEFN = n => DEF.find(d => d.n === n);
  const drillStep = () => G.drill.script[(G.drill.n - G.drill.left) % G.drill.script.length];

  /* The computer's coverage: goal line when a yard or the goal is at stake, deep shells on long yardage, otherwise one
     of the base calls, weighted (the all-out pressure less often) and steering away from what it called last time. */
  const DBASE = [['Cover 2', 1], ['Cover 3', 1.2], ['Cover 1 Man', 1], ['Man Blitz', 0.6], ['Zone Blitz', 0.8], ['Tampa 2', 0.8], ['Cover 6', 0.8], ['Cover 2 Man', 0.8], ['Fire Zone', 0.7], ['Overload', 0.45]];

  function cpuDef() {
    const toGoal = G.poss === 0 ? 100 - G.los : G.los;
    if ((G.togo <= 1.5 || toGoal <= 3) && rnd() < 0.55) return DEFN('Goal Line');
    if (G.togo > 12 && rnd() < 0.35) return DEFN('Prevent');
    if (G.togo > 10.5 && rnd() < 0.3) return DEFN('Cover 4');
    if (G.drill) return DEF[Math.floor(rnd(5))];  // training camp: the five base calls its star marks were set against
    const hist = (G.dcalled && G.dcalled[1 - G.poss]) || [], recent = hist.slice(-2);
    const ws = DBASE.map(([n, w]) => w * (recent.includes(n) ? 0.25 : 1)), tot = ws.reduce((a, b) => a + b, 0);
    let x = rnd(tot);
    for (let i = 0; i < DBASE.length; i++) if ((x -= ws[i]) <= 0) return DEFN(DBASE[i][0]);
    return DEFN('Cover 2');
  }

  /* ---------- touchdown celebrations ----------
     The scorer's celebration (render3d.js draws them) is picked here, by Math.random so seeded runs are not touched.
     A career player who has chosen his own always does that one. About one in three, the whole side joins in on the
     same beat. */
  const CELEBS = ['Jump', 'Spike', 'Strut', 'Kneel', 'Roar', 'Bow', 'Shuffle', 'Salute', 'To the sky', 'Flex', 'Leap'];

  function celebFor(team, who) {
    const mine = who && who === G.me && G.heroCeleb >= 0;
    return { team, who, style: mine ? G.heroCeleb : Math.floor(Math.random() * CELEBS.length), group: Math.random() < 0.35 ? 1 + (Math.random() < 0.5 ? 1 : 0) : 0 };
  }

  /* ---------- the coach's challenge ----------
     After a close spot (G.review) the side the ruling went against may challenge: two a game, and a timeout is what
     is risked. Wrong on the field: overturned. Right: the ruling stands and the challenger loses a timeout. The
     computer challenges only a spot it can see was wrong, three times in four. */
  const canChallenge = t => !!G.review && G.review.hurt === t && G.to && G.to[t] > 0 && (G.chal ? G.chal[t] : 2) > 0 && !G.drill;
  const youChallenge = () => canChallenge(0) && !G.lock;  // in a career the coach decides, not you

  function resolveChallenge(t) {
    const r = G.review;
    G.review = null;
    if (!r) return;
    G.chal = G.chal || [2, 2];
    G.chal[t]--;
    const dir = r.off === 0 ? 1 : -1;
    if (r.wrong) {
      if (r.made) setBall(r.off, r.trueY, r.x);  // he did get there: first down
      else {
        G.poss = r.off;  // he did not: the first down comes off
        G.los = clamp(r.trueY, 1, 99);
        G.bx = hash(r.x);
        G.down = r.down0 + 1;
        G.fd = r.fd;
        G.togo = (r.fd - G.los) * dir;
        if (G.down > 4) setBall(1 - r.off, G.los, G.bx);  // and that was fourth down
      }
      banner('Overturned', r.made ? `${tname(r.off)} first down` : G.down > 4 || G.poss !== r.off ? 'Turnover on downs' : `${ORD[G.down - 1] || ''} & ${Math.max(1, Math.round(G.togo))}`, 2000);
    } else {
      G.to[t] = Math.max(0, G.to[t] - 1);
      banner('Ruling stands', `${tname(t)} lose a timeout`, 2000);
    }
    if (!AUTO && !QUIET) {
      snd('whistle');
      vo('challenge', { pri: 1, ttl: 4 });
      if (PG.audio) PG.audio.pa(`The ${tname(t)} are challenging the spot. After review, the ruling on the field ` + (r.wrong ? 'is reversed.' : 'stands.'), { wait: 1.6, clips: ['ref.chal.' + tab(t), r.wrong ? 'ref.over' : 'ref.stands'] });
      if (r.wrong) setTimeout(() => {
        if (PG.audio && G.ros) PG.audio.crowd[t === 0 ? 'cheer' : 'boo'](0.6, 2);
      }, 3000);
    }
    hudKey = '';
    updHud();
  }

  /* ---------- the play clock ----------
     When the snap is yours (your offense, or your quarterback in a career) you have 35 seconds from the moment the
     play-call sheet opens to get the ball snapped. The last ten show beside the down and distance; at zero it is delay
     of game: five yards (half the distance near your own goal) and the down again. The computer never runs it out. */
  const PC = 35;
  const pcOn = () => !AUTO && !QUIET && !G.drill && !G.paused && G.ros && G.poss === 0 && G.pendKO == null && G.pat == null && (!G.lock || G.lock === 'QB') &&
    (G.state === 'call' || (G.state === 'pre' && !!ps && (ps.mode === 'pass' || ps.mode === 'run')));

  function delayOfGame() {
    const off = G.poss, dir = off === 0 ? 1 : -1, room = off === 0 ? G.los : 100 - G.los, yd = Math.min(5, Math.max(1, Math.floor(room / 2)));
    G.los = clamp(G.los - dir * yd, 1, 99);
    G.togo += yd;
    G.pc = PC;
    G.last = 'Delay of game';
    G.rp = false;
    G.runoff = 0;
    G.state = 'dead';
    G.deadT = 1.9;
    scr.innerHTML = '';
    banner('Flag', `Delay of game, ${tname(off)} · ${yd} yard${yd === 1 ? '' : 's'}`, 1700);
    snd('whistle');
    refCall(`Delay of game, offense. ${yd} yard penalty. Replay the down.`, off, 0.4, ['ref.delay', 'ref.yd.' + yd, 'ref.rep' + G.down]);
    analyst('a.delay', 0.5, { big: true, ttl: 9 });
    hudKey = '';
    updHud();
  }

  function startCall() {
    if (G.callout && G.q === 4 && G.clock < 150 && G.score[0] < G.score[1] && !G.voCallLate && !AUTO && !QUIET) {
      G.voCallLate = true;  // behind late in the game you talked about all week
      analyst('call.shaky', 1, { big: true, ttl: 10 });
    }
    const rv = G.review;  // a coach on the computer's side (or yours, in a career) throws the flag when he can see it was wrong
    if (rv && rv.wrong && canChallenge(rv.hurt) && (rv.hurt === 1 || G.lock) && Math.random() < 0.75) resolveChallenge(rv.hurt);
    if (G.review && !youChallenge()) G.review = null;
    G.pc = PC;  // the play clock starts again
    P = [];
    ps = null;
    G.me = null;
    G.celeb = null;
    G.watch = G.go4 = false;
    G.state = 'call';
    updHud();
    setBrief('');
    if (PG.audio && PG.audio.half) PG.audio.halftime(false);  // the teams are back: the band leaves the field
    warnCall();
    if (!AUTO && !QUIET && G.pendKO == null && hurry(G.poss) && G.drive && G.drive.team === G.poss && !G.drive.hurry) {
      G.drive.hurry = true;  // once a drive
      toast(`${tname(G.poss)} in the hurry-up · no huddle`);
      vo('hurry', { ttl: 4 });
      analyst('a.hurry', 0.35);
    }
    if (!AUTO && !QUIET && !G.drill && PG.audio && Math.random() < 0.3) PG.audio.band();  // the band fills some of the gaps between plays
    if (G.pendKO != null) {
      const t = G.pendKO, k = 1 - t;  // t receives, k kicks
      if (!G.drill && lateAndBehind(k)) return k === 0 && !AUTO && !G.lock ? showOnside(k) : onside(k);  // your call, or the computer's (it always tries)
      G.pendKO = null;
      if (!AUTO && !G.drill) {
        beginKickoff(t);  // in a career, your team's kickoffs are yours too, and theirs when you return kicks
        if (G.lock && k === 1 && !G.me) G.watch = true;  // otherwise their kickoff is watched like their drives: your returner brings it out
        return;
      }
    }
    if (G.drill && G.drill.script) {
      /* a guided drill: its script names the play for each rep */
      G.op = OFF.find(p => p.n === drillStep().p) || cpuOff(G.poss);
      G.dp = DEFN(G.drill.dcall) || cpuDef();
      G.flipNext = false;
      return begin();
    }
    if (AUTO) {
      G.op = cpuOff(G.poss);
      G.dp = cpuDef();
      return begin();
    }
    if (G.lock) {
      if (G.liveP) {
        const lp = G.liveP;
        G.liveP = null;
        if (G.pendKO == null && G.poss === 1 && G.down === 4) {
          G.op = lp.op;
          G.dp = lp.dp;
          return begin();  // their punt, with you back deep
        }
      }
      const skip = G.skipN === G.possN, res = skip && G.wd && G.wd.n === G.possN ? G.wd : null;  // Skip drive was tapped: the rest of it is worked out unseen
      if ((G.lockSide === 'off') !== (G.poss === 0)) return skip ? simDrives(false, res) : watchPlay(false);
      if (G.share < 1 && !G.drill) {
        // not the starter: the coach decides drive by drive whether you go in
        if (G.benchN !== G.possN) {
          G.benchN = G.possN;
          G.sit = rnd() > G.share;
        }
        if (G.sit) return skip ? simDrives(true, res) : watchPlay(true);
      }
      G.op = cpuOff(G.poss);
      G.dp = cpuDef();
      if (G.down === 4 && G.op.cat === 'special' && G.poss === 0 && G.try2 == null) return ask4th();  // his call is a kick: you may wave it off
      if (G.lock === 'QB' && G.op.cat !== 'special') return showCall('qb');
      return begin();
    }
    if (G.poss === 0) showCall('off');
    else {
      G.op = cpuOff(1);
      if (G.op.cat === 'special') {
        G.dp = DEF[0];
        return begin();
      }
      showCall('def');
    }
  }

  /* kneel and spike resolve on the spot: no players, just the down and the clock */
  function quickPlay() {
    const off = G.poss, dir = off === 0 ? 1 : -1, kneel = G.op.quick === 'kneel';
    P = [];
    ps = null;
    scr.innerHTML = '';
    G.down++;
    if (kneel) {
      G.los = clamp(G.los - dir, 1, 99);
      G.togo += 1;
      G.runoff = Math.min(40, G.clock);
      G.clock -= G.runoff;
      twoMinute();
    } else G.runoff = 0;
    let sub2 = kneel ? '40 seconds run off' : 'Clock stopped';
    if (G.down > 4) {
      setBall(1 - off, G.los, G.bx);
      sub2 = 'Turnover on downs';
    }
    G.last = kneel ? 'Kneel' : 'Spike';
    G.rp = false;
    G.state = 'dead';
    G.deadT = 1.3;
    cpuTimeout();
    banner(G.last, sub2, 1100);
    snd('whistle');
    updHud();
  }

  function begin() {
    if (G.op.quick) return quickPlay();
    scr.innerHTML = '';
    G.flip = !!G.flipNext && G.op.cat !== 'special';  // the computer's calls come mirrored half the time
    G.flipNext = false;
    G.audI = -1;
    G.audList = audibleList(G.op);
    setupPlay();
    if (!AUTO && !QUIET && !G.drill && G.op.run && /^Jet/.test(G.op.n)) planMotion('jet', ps.runner);  // a jet sweep is run from jet motion, for everybody
    if (!AUTO && !QUIET && !G.drill && (G.poss === 1 || (G.lock && G.me !== ps.qb))) {
      const r = Math.random();  // the computer's offense, and a career receiver's coach: a shift on about one snap in eight, motion on a third
      if (!(r < 0.12 && planShift()) && r < 0.45) planMotion();  // a formation that cannot shift sends a man in motion instead
    }  // the computer's offense, and a career receiver's coach, use motion on about a third of snaps
    if (G.aroundDue && !AUTO && !QUIET) {
      const q = G.aroundDue;
      G.aroundDue = 0;
      later(() => aroundCard(q), Math.max(500, 7600 - (performance.now() - bcAt)), () => G.ros && (G.aroundDue = q));  // snapped first: it waits for the next huddle  // after the quarter's team stats card, if that is still up
    }
    if (G.down === 3 && G.op.cat !== 'special' && !G.drill) thirdCard();
    G.preT = 0;
    if (G.op.cat === 'special') {
      const fg = G.op.n === 'Field Goal', d = Math.round(((G.poss === 0 ? 100 : 0) - G.los) * G.dir + 17);
      if (G.poss === 0 && !AUTO) {
        // your team's kicks are yours, in a career too (the owner: "why are field goals still automatic")
        G.state = 'kickm';
        G.meter = rnd(3);
        $('#mtxt').textContent = G.patKick != null ? 'Extra point · swipe up, or stop in the green' : fg ? `${d} yards · swipe up, or stop in the green` : 'Punt · swipe up, or stop in the green';  // one line on the narrowest phone; the tag below names the kick
        voPre();
        return;
      }
      toast(fg ? `${d}-yard field goal attempt` : tname(G.poss) + ' punt');
    }
    G.state = 'pre';
    setBrief(briefTxt());
    if (!AUTO && PG.audio && ps.mode !== 'kick' && !G.drill) {
      const a = PG.audio, redZone = (G.poss === 0 ? 100 - G.los : G.los) < 20;
      if (G.poss !== (G.home || 0) && G.down >= 3) {
        if (G.home && G.poss === 0 && Math.random() < 0.35) analyst('a.loud', 1);  // your third down on the road: the analyst hears it too
        a.crowd.rise(2.2);  // the home crowd makes all the noise it can until the ball is snapped
        Math.random() < 0.5 ? a.crowd.chant(3) : a.crowd.clapBuild(2.4);
      } else if (G.poss === (G.home || 0) && (G.down === 3 || redZone) && Math.random() < 0.45) {
        if (Math.random() < 0.5) a.crowd.letsgo(2);  // "LET'S GO!" and the claps
        else {
          a.play('organ');
          setTimeout(() => {
            if (G.state === 'pre') a.crowd.cheer(0.45, 0.9);  // the crowd answers the riff
          }, 1250);
        }
      }
    }
    voPre();
  }

  function snap() {
    G.pn = (G.pn || 0) + 1;  // a new play: cards still waiting for the last one are dropped
    if (!AUTO && !QUIET) clearCards(true);
    G.review = null;  // too late to challenge
    G.chg = G.pwShow = null;
    setBrief('');
    snd('crash', { x: ps.bx });  // the two lines meet
    if (PG.audio) {
      PG.audio.crowd.stopClaps();
      PG.audio.crowd.settle();  // and the third-down noise falls away as the play starts
    }
    REC.length = 0;
    for (const p of P) if (p.jog) {
      p.x = p.sx;
      p.y = p.sy;
      p.vx = p.vy = 0;
      p.jog = 0;
    }
    if (ps.sh) for (const p of P) if (p.team !== ps.offTeam && (p.role === 'CB1' || p.role === 'CB2')) p.vx = 0;  // the corners' walk ends where they stand
    const mo = ps.mot;
    if (mo && mo.go) {
      // the man in motion keeps his speed; his route starts where he is, and so does the defender who came with him
      for (const q of [mo.p, mo.d]) if (q) {
        q.sx = q.x;
        q.sy = q.y;
      }
      if (mo.p.rn && mo.p.route) mo.p.route = mkRoute(mo.p, mo.p.rn, G.dir);
      if (mo.sweep && mo.p.path) {
        // the sweep's path picks up ahead of him: the points he has already run past are dropped
        let i = 0;
        while (i < mo.p.path.length - 1 && (mo.p.path[i][0] - mo.p.x) * -mo.side < 0.5) i++;
        mo.p.pi = i;
      }
      if (mo.d) mo.d.vx = 0;
      for (const z of mo.zs) z.q.vx = 0;
      mo.done = true;
    }
    if (ps.mode === 'kick') return doKick(rnd(0.55, 1));
    if (flagsOn()) {
      // once in a long while somebody jumps
      const r = rnd(), loud = G.home === 1 && ps.offTeam === 0 ? 0.008 : 0;  // on the road the crowd is at full voice when you snap it
      if (r < 0.011 + loud) return flag('False start', ps.offTeam);
      if (r < 0.02 + loud) return flag('Offside', 1 - ps.offTeam);
      if (watched() && (ps.mode === 'pass' || ps.mode === 'run')) {
        const w = Math.random();
        if (w < 0.004) return flag('Illegal formation', ps.offTeam);  // not enough men on the line
        if (w < 0.016) {
          ps.free = freeSnap();  // he jumped, but the play goes on
          toast('Flag at the snap · free play!');
          vo('flag', { pri: 1 });
        }
      }
    }
    G.state = 'live';
    ps.t = 0;
    snd('snap');
  }

  /* acc: 0 to 1, how well it was struck. aim (from a swipe, radians, + to the right of the kicker): which way a field
     goal misses, and where a punt goes; without it, as before. The game's generator is drawn the same either way. */
  function doKick(acc, aim) {
    const off = G.poss, dir = G.dir, los = ps.los, k = ps.qb;
    if (watched() && G.patKick == null && Math.random() < 0.012) ps.rk = freeSnap();  // a rusher runs into the kicker after the ball is away
    let x1, y1, T, h;
    if (G.op.n === 'Field Goal') {
      const d = ((off === 0 ? 100 : 0) - los) * dir + 17, thr = clamp(0.22 + Math.max(0, d - 22) * 0.019, 0.22, 0.96), good = acc >= thr + G.wx.kick && d <= 63, sg0 = rnd() < .5 ? -1 : 1, sg = aim === undefined || Math.abs(aim) < 0.01 ? sg0 : (aim > 0) === (off === 0) ? 1 : -1;  // a swipe to the kicker's right misses right
      x1 = FW / 2 + sg * (good ? (1 - acc) * 3.5 : 4.4 + rnd(3));
      y1 = (off === 0 ? 110 : -10) + dir * 10;
      T = 1.5 + d * 0.014;
      h = 7 + d * 0.07;
      ps.kick = { type: 'fg', arg: good, dist: d };
      /* Off the upright. A kick made or missed by a hair meets the post on its way: it goes on through, or it comes
         back out. Only where the ball flies changes. Whether the kick is good was settled above, the flight takes as
         long as it always did, and nothing here draws from the game's generator. */
      const py = off === 0 ? 110.6 : -10.6, sp = (py - k.y) / (y1 - k.y);
      if (d <= 63 && Math.abs(acc - thr - G.wx.kick) < 0.03 && sp > 0.3 && sp < 0.95) {
        x1 = k.x + (FW / 2 + sg * 3.1 - k.x) / sp;  // aimed so that it is at the upright as it crosses the goal line's back edge
        ps.kick.post = { s: sp, sg, y: py, hit: false };
      }
    } else {
      const d = 30 + acc * 20 + rnd(-3, 3), y = los + dir * d, xr = rnd(-12, 12), x = clamp(aim === undefined ? ps.bx + xr : ps.bx + dir * aim * 30 + xr * 0.25, 4, FW - 4), tb = off === 0 ? y >= 99 : y <= 1;
      const fy = tb ? (off === 0 ? 80 : 20) : clamp(y - dir * rnd(0, 9), 2, 98);
      x1 = x;
      y1 = tb ? (off === 0 ? 104 : -4) : y;
      T = 2.4 + d * 0.02 + (ps.ret ? HANG : 0);  // a punt you can return hangs longer, so the coverage gets there and a fair catch is a real choice
      h = 13;
      ps.kick = { type: 'punt', arg: { y: fy, x, d: Math.round(d), tb } };
    }
    ps.air = { x0: k.x, y0: k.y, x1, y1, t: 0, T, h, kick: true, x: k.x, y: k.y, z: 0 };
    ps.carrier = null;
    G.state = 'kicka';
    snd('kick');
    if (ps.kick.type === 'punt') vo('punt', { pri: 0 });
  }

  let HANG = 1;  // extra hang time, in seconds, on a punt that will be returned live

  function kickTick(dt) {
    const a = ps.air;
    a.t += dt;
    const s = Math.min(1, a.t / a.T);
    a.x = lerp(a.x0, a.x1, s);
    a.y = lerp(a.y0, a.y1, s);
    a.z = 0.3 + a.h * 4 * s * (1 - s);
    const post = ps.kick && ps.kick.post;
    if (post && s >= post.s) {
      /* it has met the upright: on through and a little inward when the kick is good, back out toward the field and
         wide when it is not, falling as it goes */
      const good = ps.kick.arg, out = a.y1 > a.y0 ? 1 : -1, tau = (s - post.s) * a.T;
      a.rvx = good ? -post.sg * 2.6 : post.sg * 2.2;
      a.rvy = good ? out * 7 : -out * 3.4;
      a.rvz = (good ? 1.5 : 0.6) - 14 * tau;
      a.x = FW / 2 + post.sg * 3.1 + a.rvx * tau;
      a.y = post.y + a.rvy * tau;
      a.z = Math.max(0.2, 0.3 + a.h * 4 * post.s * (1 - post.s) + (good ? 1.5 : 0.6) * tau - 7 * tau * tau);
      if (!post.hit) {
        post.hit = true;
        if (!AUTO && !QUIET) {
          snd('doink', { x: a.x });
          buzz(30);
          toast(good ? 'Off the upright, and in!' : 'Off the upright!');
          if (PG.audio) PG.audio.crowd.ooh(1);  // the whole stadium, whichever side it is on
        }
      }
    }
    const punt = ps.mode === 'kick' && ps.ret && ps.kick && ps.kick.type === 'punt' && !ps.kick.arg.tb;
    if (punt) {
      const recv = 1 - ps.offTeam, dir = recv === 0 ? 1 : -1, r = ps.ret;  // the coverage runs down, the return team drops to block
      let wave = 0;
      for (const p of P) {
        if (p === r) seek(p, a.x1, a.y1, 1);
        else if (p.team === recv) seek(p, lerp(p.sx, a.x1, 0.45), a.y1 + dir * clamp((p.sy - a.y1) * dir * 0.45, 6, 24), 0.8);
        else if (p === ps.qb) seek(p, a.x1, a.y1 + dir * 15, 0.7);  // the punter trails the play as the last man
        else seek(p, lerp(p.sx, a.x1, 0.3), a.y1 + dir * (wave++ % 3 === 2 ? 5 : 0), 0.96, true);  // every third man holds up five yards short: a second wave
      }
      integrate(dt);
      /* how close is the coverage to where the ball comes down? */
      let near = 99;
      for (const p of P) if (p.team !== recv && !p.down) near = Math.min(near, hyp(p.x - a.x1, p.y - a.y1));
      if (recv === 1 && s > 0.75 && !ps.fcSeen) {
        // the computer's returner looks up once, late: if a tackler will be on him as the ball arrives, he waves for a fair catch
        ps.fcSeen = true;
        if (near - 8 * (1 - s) * a.T < 3 && rnd() < 0.8) {
          ps.fair = true;
          r.fc = 1;
          if (!QUIET) toast('Fair catch called');
        }
      }
      if (s >= 1) {
        ps.air = null;
        for (const p of P) {
          p.eng = null;
          p.block = null;
        }
        r.x = a.x1;
        r.y = a.y1;
        /* a punt is easy to drop: more so in rain or snow, and with a tackler in your face. A fair catch is the safe way. */
        const muff = rnd() < (ps.fair ? 0.01 : 0.015 + (near < 2.5 ? 0.035 : 0)) * G.wx.fum * (r.hero && r.cat ? 1.45 - r.cat / 110 : 1);  // a career returner's hands count
        if (ps.fair && !muff) {
          r.fc = 0;
          snd('catch');
          finish('punt', { fair: true, tb: false, d: ps.kick.arg.d, y: clamp(a.y1, 1, 99), x: a.x1 });
          return;
        }
        // caught (or dropped): from here it is a return, played like a kickoff return
        Object.assign(ps, { mode: 'ko', punt: true, offTeam: recv, qb: null, carrier: muff ? null : r, open: true, turnover: true, handoff: true, land: a.y1, t: 0 });
        r.fc = 0;
        G.dir = dir;
        G.sel = null;
        G.state = 'live';
        hudKey = '';
        if (muff) {
          ps.fum = { t: 0, by: r, forced: null, muff: true };
          ps.loose = { x: a.x1, y: a.y1, z: 1.1, vx: rnd(-3, 3), vy: -dir * rnd(1, 4), vz: 3 };
          r.stun = 0.6;
          snd('hit', { power: 0.3 });
          if (!AUTO && !QUIET) {
            buzz(45);
            toast('Muffed! Get on it');
            vo('punt.muff', { pri: 2 });
            if (PG.audio) PG.audio.crowd.ooh(0.9);
          }
        } else {
          snd('catch');
          if (!AUTO && !QUIET) toast(recv === 0 ? 'Punt return: run!' : 'Cover the punt');
        }
      }
      return;
    }
    if (ps.mode === 'ko') {
      const dir = G.dir, r = ps.ret;  // everyone runs under the kick
      for (const p of P) {
        if (p === r) seek(p, a.x1, a.y1, 1);
        else if (p.team === ps.offTeam) seek(p, lerp(p.sx, a.x1, 0.45), a.y1 + dir * clamp((p.sy - a.y1) * dir * 0.45, 6, 24), 0.8);
        else seek(p, lerp(p.sx, a.x1, 0.3), a.y1, 0.96, true);
      }
      integrate(dt);
      if (s >= 1) {
        ps.air = null;
        if (ps.ko.tb) {
          finish('kotb');
          return;
        }
        ps.carrier = r;
        r.x = a.x1;
        r.y = a.y1;
        G.state = 'live';
        ps.t = 0;
        snd('catch');
      }
      return;
    }
    if (s >= 1) {
      const k = ps.kick;
      if (k.post && !AUTO && !QUIET) ps.loose = { x: a.x, y: a.y, z: a.z, vx: a.rvx, vy: a.rvy, vz: a.rvz };  // the ball is still coming down off the post: it lands and bounces while the officials signal
      ps.air = null;
      finish(k.type, k.arg);
    }
  }

  /* Kickoff: the kicking team runs down from its 35, the returner fields it near his goal line. Exhibition only;
     career games and simulations take the touchback spot that kickoff() already set. */
  const KO_COVER = ['DE1', 'DT1', 'OLB1', 'CB1', 'SS', 'MLB', 'FS', 'CB2', 'OLB2', 'DT2', 'DE2'], KO_FRONT = ['LT', 'LG', 'C', 'RG', 'RT'], KO_MID = ['TE', 'FB', 'X', 'S'];

  function beginKickoff(recv) {
    scr.innerHTML = '';
    const kt = 1 - recv, dir = recv === 0 ? 1 : -1, own = recv === 0 ? 0 : 100, ky = own + dir * 65;
    G.dir = dir;
    G.op = { n: 'Kickoff', cat: 'special' };
    G.dp = DEF[0];
    P = [];
    G.me = null;
    G.sel = null;
    KO_COVER.forEach((r, i) => {
      mkP(kt, r, 4 + i * (FW - 8) / 10, ky + dir * (i === 5 ? 4 : 1)).asg = 'rush';
    });
    KO_FRONT.forEach((r, i) => mkP(recv, r, 8 + i * (FW - 16) / 4, own + dir * 52));
    const mine = recv === 0 && G.lock && G.kr;  // a career receiver is the man back deep: he and the other receiver swap places
    KO_MID.forEach((r, i) => mkP(recv, mine && r === 'X' ? 'Z' : r, 10 + i * (FW - 20) / 3, own + dir * 31));
    mkP(recv, 'RB', FW / 2 - 6, own + dir * 14);
    const ret = mkP(recv, mine ? 'X' : 'Z', FW / 2, own + dir * 4);
    if (mine) G.me = G.sel = ret;
    const ly = own + dir * rnd(-2, 10), lx = clamp(FW / 2 + rnd(-12, 12), 6, FW - 6);
    ps = { t: 0, mode: 'ko', offTeam: recv, qb: null, carrier: null, thrown: false, air: null, caught: false, handoff: true, open: true, turnover: true, think: 0, scr: false, runner: null, recs: [], pa: false,
      los: ky, fd: ky, bx: FW / 2, drop: null, kick: null, passer: null, tgt: null, tackler: null, ret, land: ly, ko: { x: lx, y: ly, tb: (ly - own) * dir < 0 } };
    G.state = 'pre';
    G.preT = 0;
    camUpd(0, true);
    toast(mine ? 'Kickoff · you are back deep' : 'Kickoff');
    snd('roll', { dur: 1.42 });  // the drum line builds to the kick, which comes a second and a half after the teams line up
    if (PG.audio && !AUTO && !QUIET) PG.audio.crowd.kickoff();  // and the crowd's long "ohhh" with it
    updHud();
  }

  function kickNow() {
    G.pn = (G.pn || 0) + 1;
    if (!AUTO && !QUIET) clearCards(true);
    const k = ps.ko, d = Math.abs(k.y - ps.los);
    REC.length = 0;
    ps.air = { x0: FW / 2, y0: ps.los, x1: k.x, y1: k.y, t: 0, T: 2.6 + d * 0.016, h: 15, kick: true, x: FW / 2, y: ps.los, z: 0 };
    G.state = 'kicka';
    snd('kick');
    if (PG.audio && !AUTO && !QUIET) PG.audio.crowd.cheer(0.45, 1.6);
    if (G.q === 3 && !G.voHalf) {
      G.voHalf = true;
      vo('half.back', { pri: 0 });
    } else vo('kickoff', { pri: 0 });
  }

  /* Career: play the snaps the user's unit is not on the field for, headless, until their unit is back on. */
  /* Plays out drives nobody is controlling: the other unit's, or (own = true) one drive of your own unit that the
     coach has you watching from the sideline. */
  /* res: a drive that was being watched until Skip drive was tapped (who has it, the score when it began, the plays so
     far), so the result line counts all of it; with a play still running (not 'dead'), that play is finished first. */
  function simDrives(own, res) {
    const was = AUTO, t = res ? res.t : G.poss, s0 = res ? res.s0 : G.score.slice(), n0 = res ? res.n : G.possN;
    let plays = res ? res.plays : 0, over = false, guard = 0, mid = !!res && !!ps && (G.state === 'pre' || G.state === 'live' || G.state === 'kicka');
    AUTO = true;
    QUIET = true;
    G.watch = false;
    while (mid || (!over && guard++ < 300 && (own ? G.possN === n0 : (G.lockSide === 'off') !== (G.poss === 0)))) {
      if (mid) {
        mid = false;
        G.me = G.sel = null;
        if (G.state === 'pre') snap();  // lined up: snapped where they stand
      } else {
        if (G.poss === t) plays++;
        G.op = cpuOff(G.poss);
        G.dp = cpuDef();
        if (G.kr && !own && G.poss === 1 && G.op.n === 'Punt') {
          G.liveP = { op: G.op, dp: G.dp };  // they are punting: you are their returner, so this one is played live
          break;
        }
        if (G.op.quick) quickPlay();
        else {
          G.flip = !!G.flipNext && G.op.cat !== 'special';
          G.flipNext = false;
          setupPlay();
          G.state = 'pre';
          snap();
        }
      }
      let n = 0;
      while (G.state !== 'dead' && n++ < 4000) {
        if (G.state === 'live') tick(0.02);
        else if (G.state === 'kicka') kickTick(0.02);
        else break;
      }
      if (G.state !== 'dead' && ps) {
        G.state = 'live';
        ps.carrier = null;
        ps.air = null;
        finish('inc');
      }
      over = advance();
    }
    AUTO = was;
    QUIET = false;
    P = [];
    ps = null;
    G.me = null;
    const mine = t === 0, pts = G.score[t] - s0[t], other = G.score[1 - t] - s0[1 - t];
    let big, sub;
    if (pts >= 6) {
      big = mine ? 'Touchdown!' : `${ab(t)} touchdown`;
      sub = `${tname(t)} · ${plays}-play drive`;
    } else if (pts === 3) {
      big = mine ? 'Field goal' : `${ab(t)} field goal`;
      sub = `${tname(t)} · ${plays}-play drive`;
    } else if (other > 0) {
      big = mine ? 'Turnover' : 'Defense scores!';
      sub = `${tname(1-t)} +${other}`;
    } else {
      big = mine ? 'Drive stalls' : 'Defense holds';
      sub = G.liveP ? `${ab(1)} punt · get back deep` : G.last || '';
    }
    G.state = 'dead';
    G.deadT = 2.3;
    banner(big, own ? 'You watched this one from the sideline' : sub, 2100);
    updHud();
    /* the booth sums the drive up in a line: it was played out of sight */
    if (pts >= 6) vo('td.team.' + tab(t), { pri: 2 });
    else if (pts === 3) vo('fg.good', { pri: 2 });
    else if (other > 0) vo(other >= 6 ? 'td.return' : 'safety', { pri: 2 });
    else if (chance(0.7)) {
      vo('drive.stop');
      analyst('a.stop', 0.3);
    }
    if (pts || other) voScore(pts ? t : 1 - t, s0);
    if (pts >= 6 && mine) {
      confetti(0);
      snd('fanfare');
      react(0, 1.2, 4);
    } else if (pts >= 6) react(1, 1, 3);
    else if (pts === 0 && !mine) react(0, 0.5, 2);
  }

  /* ---------- a career's other drives, watched ----------
     The snaps your unit is not on the field for (the other team's offense, or a drive of your own the coach has you
     sitting out) are played in front of you, by the computer on both sides, instead of being worked out unseen.
     Two small buttons go with them: Fast forward runs everything at three times the speed until it is tapped again
     (the choice is remembered), and Skip drive works out the rest of this drive unseen, the way every such drive used
     to be, and shows the result. A punt you are back deep for, and your own team's kicks, are still yours. */
  const watching = () => !!G.watch && !G.me && !AUTO && (G.state === 'pre' || G.state === 'live' || G.state === 'kicka' || (G.state === 'dead' && !!G.wd && G.wd.n === G.possN && G.pendKO == null && G.pat == null));  // not once the drive is over

  /* how far the drive being watched has come: " · play 4 · 32 yards" */
  function watchLine() {
    const d = G.drive, yd = d && d.team === G.poss ? Math.round((G.los - d.y0) * (G.poss === 0 ? 1 : -1)) : 0;
    return ` · play ${G.wd ? G.wd.plays : 1}${yd ? ` · ${yd} yard${Math.abs(yd) === 1 ? '' : 's'}` : ''}`;
  }

  function watchPlay(sit) {
    if (!G.wd || G.wd.n !== G.possN) G.wd = { n: G.possN, t: G.poss, s0: G.score.slice(), plays: 0, own: !!sit };
    G.wd.plays++;
    G.watch = true;
    G.op = cpuOff(G.poss);
    G.dp = cpuDef();
    begin();
  }

  function toggleFF() {
    if (!watching()) return;
    SET.wff = !SET.wff;
    save('pg.settings', SET);
    snd('tick');
    toast(SET.wff ? 'Fast forward · 3x' : 'Normal speed');
  }

  function skipDrive() {
    if (!watching()) return;
    if (ps && ps.mode === 'ko') {
      // a kickoff: your offense starts from the touchback spot, where the ball was already put
      G.watch = G.rp = false;
      P = [];
      ps = null;
      clearCards(true);
      G.state = 'dead';
      G.deadT = 0.01;
      return;
    }
    const mid = G.state !== 'dead';
    G.skipN = G.possN;
    G.rp = false;
    clearCards(true);
    setBrief('');
    if (mid) return simDrives(G.wd.own, G.wd);  // the play in front of you is finished unseen, and the rest of the drive after it
    G.deadT = 0;  // between plays: the next call works out the rest
  }

  /* fourth down in a career: the coach sends the kicking unit out, and you may wave it off */
  function ask4th() {
    const fg = G.op.n === 'Field Goal', d = Math.round(100 - G.los + 17), kick = G.op, dp = G.dp;
    G.state = 'call';
    scr.innerHTML = `<div class="sheet"><div class="shd"><b>Coach wants ${fg ? 'the kick' : 'to punt'}</b><span>${downTxt()}</span></div><div class="cols"><button class="go sm" id="g4K">${fg ? 'Kick it' : 'Punt'}<br><small>${fg ? d + '-yard field goal' : 'Pin them deep'}</small></button><button class="go sm" id="g4G">Go for it<br><small>${ORD[3]} & ${G.togo < 1 ? 'inches' : Math.max(1, Math.round(G.togo))}${G.lock === 'QB' ? ' · your call' : ''}</small></button></div></div>`;
    $('#g4K').onclick = () => {
      G.op = kick;
      G.dp = dp;
      begin();
    };
    $('#g4G').onclick = () => {
      G.go4 = true;  // the play caller leaves the kicks out for this snap
      G.op = cpuOff(0);
      G.dp = dp;
      if (!AUTO && !QUIET) {
        toast('The offense stays on the field');
        if (PG.audio) PG.audio.crowd.cheer(G.home === 1 ? 0.3 : 0.7, 1.6);
      }
      if (G.lock === 'QB') showCall('qb');
      else begin();
    };
  }

  function briefTxt() {
    const me = G.me;
    if (G.watch && !me && !AUTO) return ps && ps.mode === 'kick' && G.poss === 0 ? '' : G.wd && G.wd.own ? `<b>On the sideline</b><span>${G.bench ? '#' + G.bench.num + ' ' + G.bench.name : 'The backup'} is in for this drive${watchLine()}</span>` : `<b>Your defense is on</b><span>${ab(G.poss)} drive${watchLine()}</span>`;
    if (G.drill && G.drill.script && !AUTO) {
      const s = drillStep();
      return `<b>${s.h || (G.poss === 0 ? G.op.n : 'Defense')}</b><span>${s.say}</span>`;
    }
    if (!G.lock || !me) return '';
    if (me === ps.ret) return `<b>Punt return</b><span>Field it and run it back, or tap Fair catch if they are closing in.</span>`;  // a career receiver back deep
    let t;
    if (ps.offTeam === 0) {
      if (me === ps.qb) return '';
      if (ps.rpo) t = me.route && ps.recs.includes(me) ? `Run your ${RNAME[me.rn]} route. The quarterback throws it or hands off: tap Call if you are open.` : 'It may be a run: block your man.';
      else if (ps.mode === 'run') t = me === ps.runner ? 'You get the ball. Follow your blocks.' : me.route ? 'Sell the route, then block downfield.' : 'Lead the way and block.';
      else t = me.route ? `Run your ${RNAME[me.rn]} route. Tap Call when you are open.` : 'Stay in and pass block.';
      if (ps.mot && ps.mot.p === me) t = 'You go in motion first. ' + t;
      else if (ps.sh && ps.sh.men.some(m => m.p === me)) t = 'The offense shifts first: you move to your spot. ' + t;  // the coach's call has you moving before the snap
      return `<b>${G.op.n}</b><span>${t}</span>`;
    }
    t = me.asg === 'rush' ? 'Blitz. Get to the quarterback.' : me.asg === 'man' && me.man ? `Man coverage on #${me.man.num} ${me.man.name}.` : me.deep ? 'Deep zone. Keep everything in front of you.' : 'Underneath zone. Break on short throws.';
    return `<b>${G.dp.n}</b><span>${t}</span>`;
  }

  function setBrief(h) {
    const b = $('#brief');
    b.hidden = !h;
    b.innerHTML = h || '';
  }

  /* ---------- user actions ---------- */
  /* hot route: tapping a receiver before the snap steps him through the basic routes */
  const HOT = ['go', 'slant', 'out', 'in', 'curl', 'post'];

  function hotRoute(r) {
    const i = HOT.indexOf(r.rn);
    r.rn = HOT[(i + 1) % HOT.length];
    r.route = mkRoute(r, r.rn, G.dir);
    r.wp = 0;
    toast(r.let + ': ' + RNAME[r.rn]);
    snd('tick');
  }

  function switchDef() {
    if (G.lock) {
      G.sel = G.me;
      return;
    }
    const mine = P.filter(p => p.team === 0 && !p.down);
    if (!mine.length) return;
    if (G.state === 'pre') {
      G.sel = mine[(mine.indexOf(G.sel) + 1) % mine.length];
      return;
    }
    const t = ps.carrier || (ps.fum ? ps.loose : ps.air ? { x: ps.air.x1, y: ps.air.y1 } : null);
    if (!t) return;
    let b = null, bd = 1e9;
    for (const p of mine) {
      if (p === G.sel) continue;
      const d = hyp(p.x - t.x, p.y - t.y) + (p.eng ? 4 : 0);
      if (d < bd) {
        bd = d;
        b = p;
      }
    }
    if (b) G.sel = b;
  }

  function diveDef() {
    const s = G.sel;
    if (!s || s.dive > 0 || s.stun > 0 || s.eng || s.down) return;
    const c = ps.carrier || (ps.fum ? ps.loose : null);  // dive at the ball carrier, or at the ball itself
    let ux = inp.x, uy = inp.y;
    if (c && dist(s, c) < 5) {
      ux = c.x - s.x;
      uy = c.y - s.y;
    }
    let m = hyp(ux, uy);
    if (m < 0.1) {
      ux = s.vx;
      uy = s.vy;
      m = hyp(ux, uy) || 1;
    }
    s.vx = ux / m * s.spd * 1.7;
    s.vy = uy / m * s.spd * 1.7;
    s.dive = 0.32;
  }

  /* The hard count: before the snap the quarterback barks a sudden, loud "Hut!" with no snap behind it, hoping a
     defender jumps. Once a play. In the league's penalty tables defensive offside and neutral zone infractions together
     come to under one a game and false starts to about two and a half, so it works about one time in eight (offside,
     five yards, replay the down) and backfires about one time in twenty-five (your own lineman flinches). */
  /* Pass protection, called before the snap on a pass play (Protect steps through them): Base; Slide left or right
     (each lineman takes the rusher toward that side first, which picks up an overload from there and leaves the other
     edge lighter); Max protect (the backs and the tight end stay in to block instead of running their routes, so
     there are fewer men to throw to). Left and right are as you see them. Simulations and the computer stay on Base. */
  const PROT = ['base', 'left', 'right', 'max'], PROT_TXT = { base: 'Base protection', left: 'Slide left', right: 'Slide right', max: 'Max protect' };

  function setProt(kind) {
    const off = ps.offTeam;
    if (ps.kept) for (const [p, route, rn] of ps.kept) {
      p.route = route;
      p.rn = rn;
      p.stayIn = false;
    }
    ps.kept = null;
    if (ps.dogs) for (const [d, asg, man] of ps.dogs) {
      d.asg = asg;
      d.man = man;
    }
    ps.dogs = null;
    ps.slide = kind === 'left' ? -G.dir : kind === 'right' ? G.dir : 0;
    if (kind === 'max') {
      const stay = P.filter(p => p.team === off && p.route && /^(RB|FB|TE)$/.test(p.role));
      if (!stay.length || P.filter(p => p.team === off && p.route).length - stay.length < 2) {
        lineCalls(off, ps.los, ps.bx, 0);
        return false;  // nobody to keep in, or nobody left to throw to
      }
      ps.kept = stay.map(p => [p, p.route, p.rn]);
      for (const p of stay) {
        p.route = null;
        p.stayIn = true;
      }
      /* the defenders who had those men in man coverage have nobody to cover. One in five comes after the quarterback
         (and are blocked like any rusher); the rest sit in a short zone over the ball, watching him. Before this they
         followed the blocker into the backfield and stood at the quarterback's elbow. */
      ps.dogs = [];
      for (const d of P) if (d.team !== off && d.asg === 'man' && stay.includes(d.man)) {
        ps.dogs.push([d, d.asg, d.man]);
        if (d.num % 5 < 1) d.asg = 'rush';
        else {
          d.asg = 'zone';
          d.deep = false;
          d.zx = clamp(lerp(d.man.x, ps.bx, 0.4), 4, FW - 4);
          d.zy = ps.los + G.dir * 4.5;
        }
        d.man = null;
      }
    }
    lineCalls(off, ps.los, ps.bx, ps.slide * 1.6);
    ps.prot = kind;
    ps.recs = P.filter(p => p.team === off && p.route && p !== ps.qb).sort((a, b) => a.x - b.x);
    ps.recs.forEach((p, i) => {
      p.let = (GP.on ? GLET : 'ABCDE')[i];
      p.col = LCOL[i];
    });
    return true;
  }

  function protect() {
    if (G.state !== 'pre' || !ps || ps.mode !== 'pass' || ps.rpo || P.some(p => p.jog)) return;
    if (!(G.lock ? G.me && G.me === ps.qb : G.poss === 0)) return;
    let i = PROT.indexOf(ps.prot || 'base');
    for (let k = 0; k < PROT.length; k++) {
      i = (i + 1) % PROT.length;
      if (setProt(PROT[i])) break;
    }
    G.pad = null;  // the letters may have changed
    snd('audible');
    toast(PROT_TXT[ps.prot]);
  }

  function hardCount() {
    if (G.state !== 'pre' || !ps || ps.hard || (ps.mode !== 'pass' && ps.mode !== 'run') || P.some(p => p.jog)) return;
    if (!(G.lock ? G.me && G.me === ps.qb : G.poss === 0)) return;
    ps.hard = true;
    G.pad = null;  // the button goes: one try a play
    snd('cadence', { x: ps.bx });
    snd('calls', { x: ps.bx, delay: 0.35 });
    const r = Math.random(), pen = SET.pen !== false && !G.drill, road = G.home === 1 && ps.offTeam === 0;  // on the road the crowd drowns the count out
    if (pen && r < (road ? 0.03 : 0.12)) {
      toast('They jumped!');
      flag('Offside', 1 - ps.offTeam);
    } else if (pen && r < (road ? 0.09 : 0.16)) flag('False start', ps.offTeam);
    else toast(road ? 'Hard count · the crowd drowned it out' : 'Hard count · nobody jumped');
  }

  /* Changes at the line of scrimmage. On offense Audible steps through four standby plays and Flip mirrors the play;
     on defense Audible steps through the coverage calls. The other side does not get to answer. */
  const AUDIBLES = ['Inside Zone', 'Slants', 'Four Verticals', 'HB Draw'];

  /* the standby plays for a call: itself, then a run, a short pass, a deep pass and an option from the same formation (so
     the players only shift a little), topped up from the old four */
  function audibleList(op) {
    if (!op || op.cat === 'special') return AUDIBLES;
    const out = [op.n], same = OFF.filter(p => p.f === op.f && p !== op && !p.quick && p.cat !== 'special' && !p.gadget && (!p.short || G.togo <= 2));
    for (const c of ['run', 'short', 'deep', 'rpo']) {
      const p = same.find(q => q.cat === c && !out.includes(q.n));
      if (p && out.length < 4) out.push(p.n);
    }
    for (const n of AUDIBLES) if (out.length < 4 && !out.includes(n)) out.push(n);
    return out;
  }

  function audible(flipIt) {
    if (G.state !== 'pre' || !ps || ps.mode === 'kick' || ps.mode === 'ko' || P.some(p => p.jog)) return;
    const mine = G.lock ? G.me && G.me === ps.qb : G.poss === 0;
    if (mine) {
      if (flipIt) G.flip = !G.flip;
      else {
        const L = G.audList || AUDIBLES;
        do G.audI = (G.audI + 1) % L.length;
        while (L[G.audI] === G.op.n);
        G.op = OFF.find(p => p.n === L[G.audI]);
        G.flip = false;
      }
      setupPlay(true);
      setBrief(briefTxt());
      toast(flipIt ? 'Flipped: ' + G.op.n : 'Audible: ' + G.op.n);
      snd('audible');
      if (Math.random() < 0.6) snd('calls', { x: ps.bx, delay: 0.45 });  // and the defense checks to it
    } else if (!G.lock && G.poss === 1 && !flipIt) {
      G.dp = DEF[(DEF.indexOf(G.dp) + 1) % DEF.length];
      setupPlay(true);
      toast('Defense: ' + G.dp.n);
    } else return;
    G.pad = null;  // redraw the buttons for the new play
    snd('tick');
  }

  /* Hit stick: a short, hard lunge. More likely to bring him down and to jar the ball loose, slower to recover from a miss. */
  function hitStick() {
    const s = G.sel;
    if (!s || s.dive > 0 || s.stun > 0 || s.eng || s.down || s.dcd > 0) return;
    diveDef();
    if (s.dive > 0) {
      s.dive = 0.24;
      s.hit = 0.24;
      s.dcd = 1.4;
      const m = hyp(s.vx, s.vy) || 1;
      s.vx *= s.spd * 1.5 / m;
      s.vy *= s.spd * 1.5 / m;
    }
  }

  /* Strip: swipe at the ball for the next half second. The tackle is less sure, the fumble far more likely. */
  function stripBall() {
    const s = G.sel;
    if (!s || s.stun > 0 || s.eng || s.down || s.dcd > 0) return;
    s.strip = 0.5;
    s.dcd = 1.2;
  }

  function act(k, n) {
    if (AUTO || G.paused) return;
    if (k === 'ff') return toggleFF();
    if (k === 'skipd') return skipDrive();
    if (k === 'fair' || (k === 'main' && G.state === 'kicka')) {
      // wave for a fair catch: the ball is yours where it lands, and nobody may hit you
      if (G.state === 'kicka' && ps && ps.mode === 'kick' && ps.ret && ps.ret.team === 0 && !ps.fair && ps.air && !ps.kick.arg.tb) {
        ps.fair = true;
        ps.ret.fc = 1;
        toast('Fair catch called');
      }
      return;
    }
    if (k === 'main') {
      if (G.state === 'scene') {
        endScene();
        return;
      }
      if (G.state === 'intro') {
        endIntro();
        return;
      }
      if (G.state === 'replay') {
        endReplay();
        return;
      }
      if (koMine()) {
        // the kickoff on the timing bar, like a field goal: the middle of the green is a deep, straight kick (this used
        // to sit after the 'pre' check below, which returned first, so the Kick button did nothing on a kickoff)
        const pos = 0.5 + 0.5 * Math.sin(G.meter * 4.2), acc = 1 - Math.abs(pos - 0.5) * 2;
        kickoffBy(0.5 + acc * 0.55, (pos - 0.5) * 0.5 * (1 - acc * 0.6));
        toast(acc > 0.8 ? 'Deep kick' : acc > 0.45 ? 'Kick is away' : 'Short kick');
        return;
      }
      if (G.state === 'pre') {
        if (ps.mode !== 'pass' && ps.mode !== 'run' || P.some(p => p.jog)) return;
        if (G.lock) {
          if (G.me === ps.qb) snap();
          else if (G.me) G.preT = 99;
        } else if (G.poss === 0) snap();
      } else if (G.state === 'kickm') {
        const pos = 0.5 + 0.5 * Math.sin(G.meter * 4.2);
        doKick(1 - Math.abs(pos - 0.5) * 2);
      }
      return;
    }
    if (k === 'audible' || k === 'flip') return audible(k === 'flip');
    if (k === 'hard') return hardCount();
    if (k === 'protect') return protect();
    if (k === 'motion') return userMotion();
    if (k === 'timeout') {
      if ((G.state === 'dead' || G.state === 'call') && !G.lock) {
        timeout(0);
        const b = $('#tmo');
        if (b) b.remove();
      }
      return;
    }
    if (k === 'switch' && G.state === 'pre' && G.poss === 1 && !G.lock) return switchDef();
    if (G.state !== 'live') return;
    const c = ps.carrier;
    if (k === 'pump') return pumpFake();
    if (k === 'slide') return qbSlide();
    if (k === 'away') {
      if (canPass() && !(ps.qb.pump > 0)) {
        const q = ps.qb;
        G.chg = null;
        throwTo(null, { x: q.x < FW / 2 ? -3 : FW + 3, y: q.y + G.dir * 9 });
        toast('Thrown away');
      }
      return;
    }
    if (k === 'num') {
      if (canPass()) startCharge(n);
      else if (userOnD()) {
        if (n === 0) switchDef();
        if (n === 1) diveDef();
      }
      return;
    }
    if (k === 'call') {
      const me = G.me;
      if (me && me.route && !ps.thrown && ps.offTeam === 0 && me !== ps.qb) {
        me.callT = 1.2;
        toast('Calling for it');
      }
      return;
    }
    if (c && userP(c) && !canPass()) {
      if (k === 'juke' && c.jcd <= 0) doJuke(c, inp.x >= 0 ? 1 : -1);
      if (k === 'spin' && c.jcd <= 0) doSpin(c);
      if (k === 'power' && c.pcd <= 0 && c.hurdle <= 0) doPower(c);
      if (k === 'hurdle' && c.hcd <= 0 && c.truck <= 0) doHurdle(c);
    }
    if (userOnD()) {
      if (k === 'switch') switchDef();
      if (k === 'dive') diveDef();
      if (k === 'hit') hitStick();
      if (k === 'strip') stripBall();
    }
  }

  function padKind() {
    if (AUTO || G.paused) return 'none';
    /* right after the whistle, while the clock is running: the one moment a timeout is worth calling */
    if (G.state === 'dead' && G.runoff > 0 && !G.lock && !G.drill && G.to && G.to[0] > 0) return 'timeout';
    if (watching() && !(ps && ps.mode === 'kick' && G.poss === 0)) return (ps && ps.mode === 'ko' ? 'watchK' : 'watch') + (SET.wff ? 'F' : '');
    if (!ps) return 'none';
    const lk = G.lock, me = G.me;
    if (G.state === 'pre') {
      if (koMine()) return 'kick';  // your kickoff: swipe, or this button for a standard kick
      if (ps.mode === 'kick' || ps.mode === 'ko') return 'none';
      if (lk) return me && me === ps.qb ? 'snap' : me ? 'ready' : 'none';
      return G.poss === 0 ? 'snap' : 'defpre';
    }
    if (G.state === 'kickm') return 'kick';
    if (G.state === 'kicka') return ps.mode === 'kick' && ps.ret && ps.ret.team === 0 && !ps.fair && ps.air && !ps.kick.arg.tb ? 'fair' : 'none';  // your returner is under a punt
    if (G.state === 'live') {
      const c = ps.carrier;
      if (ps.fum && !ps.fum.scoop) return userOnD() ? 'loose' : 'none';
      if (c && userP(c)) return canPass() ? 'pass' : c === ps.qb && (c.y - ps.los) * G.dir > 0 ? 'carryq' : 'carry';
      if (userOnD()) return lk ? 'deflock' : 'def';
      if (lk && me && ps.offTeam === 0 && !ps.turnover && !me.down && me !== ps.qb) return me.route && (ps.mode === 'pass' || (ps.rpo && !ps.handoff)) && !ps.thrown ? 'route' : 'offball';
    }
    return 'none';
  }

  const TIPS = { snap: 'Tap Snap to start. Tap a receiver\u2019s letter to change his route. Audible changes the play, Flip mirrors it, Motion sends a receiver across: if a defender runs with him, it is man coverage.', pass: 'Hold a letter to build power, let go to throw. A quick tap floats a lob; a full green bar fires a bullet. Away throws it out of bounds when nobody is open; Pump fakes a throw, and a zone defender may bite.', carryq: 'Past the line your quarterback can Slide: the play ends there, and nobody may hit him.', carry: 'Drag to run. Juke or Spin slips a tackle, Power runs through one, Hurdle clears a diver.',
    def: 'Drag to chase the ball. Dive or Hit to tackle, Strip goes for the ball, Switch changes player.', deflock: 'Drag to chase the ball. Dive or Hit to tackle, Strip goes for the ball.', route: 'Follow your route. Tap Call when you are open.',
    offball: 'Drag to block for the ball carrier.', timeout: 'Time out stops the clock: you get back the seconds that just ran off.', fair: 'Fair catch: the ball is yours where it lands, with no return and no hit. Tap it if tacklers are closing in.', loose: 'Loose ball! Run to it and Dive on it.', ready: 'Tap Ready, or wait for the snap.', watch: 'You watch the plays you are not on the field for. Fast fwd runs them at three times the speed; Skip drive goes straight to the result.', watchK: 'Their kickoff, with your returner back deep. Skip starts your offense from the touchback spot.', kick: 'Tap Kick when the marker is in the green.', defpre: 'Switch picks the defender you control. Audible changes the coverage.' };
  let tipT;

  function tip(kind) {
    const el = $('#tip'), t = TIPS[kind] || TIPS[String(kind).replace(/F$/, '')];  // the watch pad's tip is the same with fast forward on
    clearTimeout(tipT);
    /* a tip shows the first two times its buttons come up; in a camp drill it shows once per drill, whatever has been
       seen before, and after that the coaching card has the corner to itself */
    const coached = !!(G.drill && G.drill.script), seen = coached ? G.drill.tips || (G.drill.tips = {}) : SET.tips || (SET.tips = {});
    if (!t || AUTO || (seen[kind] || 0) >= (coached ? 1 : 2)) {
      el.hidden = true;
      return;
    }
    seen[kind] = (seen[kind] || 0) + 1;
    if (!coached) save('pg.settings', SET);
    el.textContent = t;
    el.hidden = false;
    tipT = setTimeout(() => {
      el.hidden = true;
    }, 4500);
  }

  function setPad(kind) {
    if (G.pad === kind) return;
    G.pad = kind;
    pad.innerHTML = '';
    G.sprintBtn = 0;
    tip(kind);
    const B = (label, cls, down, up) => {
      const b = document.createElement('button');
      b.className = 'pb ' + cls;
      b.textContent = label;
      b.addEventListener('pointerdown', e => {
        e.preventDefault();
        down();
      });
      if (up) for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, up);
      pad.appendChild(b);
      return b;
    };
    const spr = () => B('Sprint', 'spr', () => G.sprintBtn = 1, () => G.sprintBtn = 0);
    if (kind === 'snap') {
      const more = ps && ps.mode !== 'kick';
      if (more) B('Audible', '', () => act('audible'));  // the bottom row: Audible, then Snap in the corner under the thumb
      B('SNAP', 'big', () => act('main'));
      if (more) {
        B('Flip', '', () => act('flip'));
        if (!ps.hard) B('Hard count', 'hc', () => act('hard'));
        if (!ps.mot) B('Motion', '', () => act('motion'));
        if (ps.mode === 'pass' && !ps.rpo) B(ps.prot === 'left' ? 'Slide L' : ps.prot === 'right' ? 'Slide R' : ps.prot === 'max' ? 'Max pro' : 'Protect', 'hc', () => act('protect'));
      }
    } else if (kind === 'ready') B('READY', 'big', () => act('main'));
    else if (kind === 'kick') B('KICK', 'big', () => act('main'));
    else if (kind === 'pass') {
      ps.recs.forEach((r, i) => {
        B(r.let, 'rc', () => startCharge(i), () => endCharge(i)).style.background = r.col;  // hold to build power, let go to throw
      });
      B('Away', 'aw', () => act('away'));  // nobody open: throw it out of bounds (from inside the pocket it may be grounding)
      B('Pump', 'aw', () => act('pump'));  // a fake throw: zone defenders may bite
    }
    else if (kind === 'carryq') {
      spr();
      B('Juke', '', () => act('juke'));
      B('Spin', '', () => act('spin'));
      B('Power', '', () => act('power'));
      B('Slide', 'hc', () => act('slide'));  // the quarterback past the line: give yourself up, safely
    } else if (kind === 'carry') {
      spr();
      B('Juke', '', () => act('juke'));
      B('Spin', '', () => act('spin'));
      B('Power', '', () => act('power'));
      B('Hurdle', '', () => act('hurdle'));
    } else if (kind === 'def') {
      spr();
      B('Dive', '', () => act('dive'));
      B('Switch', '', () => act('switch'));
      B('Hit', '', () => act('hit'));
      B('Strip', '', () => act('strip'));
    } else if (kind === 'deflock') {
      spr();
      B('Dive', '', () => act('dive'));
      B('Hit', '', () => act('hit'));
      B('Strip', '', () => act('strip'));
    } else if (kind === 'route') {
      spr();
      B('Call', 'hot', () => act('call'));
    } else if (kind === 'offball') spr();
    else if (kind === 'defpre') {
      B('Switch', '', () => act('switch'));
      B('Audible', '', () => act('audible'));
    } else if (kind === 'timeout') B('Time out', '', () => act('timeout'));
    else if (kind === 'fair') B('Fair catch', '', () => act('fair'));
    else if (/^watch/.test(kind)) {
      const f = /F$/.test(kind);
      B(/K/.test(kind) ? 'Skip' : 'Skip drive', 'wt', () => act('skipd')).id = 'wSkip';
      B(f ? '3x · on' : 'Fast fwd', 'wt' + (f ? ' on' : ''), () => act('ff')).id = 'wFF';
    }
    else if (kind === 'loose') {
      spr();
      B('Dive', '', () => act('dive'));
    }
    fitPad();
  }

  /* The pad takes exactly the width of its widest row of buttons, and the tip box and the play card beside it get
     everything that is left (the grid in the stylesheet does the sharing), so they cannot run under the buttons. */
  function fitPad() {
    pad.style.width = '';
    const bs = [...pad.children];
    if (bs.length) pad.style.width = Math.ceil(Math.max(...bs.map(b => b.offsetLeft + b.offsetWidth)) - Math.min(...bs.map(b => b.offsetLeft))) + 'px';
  }

  addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT') return;
    keys[e.code] = 1;
    if (e.repeat) return;
    if (e.code === 'Space') {
      act('main');
      e.preventDefault();
    }
    const n = '12345'.indexOf(e.key);
    if (n >= 0) act('num', n);
    if (e.code === 'KeyJ') act('juke');
    if (e.code === 'KeyK') act('spin');
    if (e.code === 'KeyQ') act('switch');
    if (e.code === 'KeyE') act('dive');
    if (e.code === 'KeyL') act('power');
    if (e.code === 'KeyH') act('hurdle');
    if (e.code === 'KeyF') act(watching() ? 'ff' : 'hit');
    if (e.code === 'KeyK') act('skipd');
    if (e.code === 'KeyR') act('strip');
    if (e.code === 'KeyT') act('timeout');
    if (e.code === 'KeyV') act('audible');
    if (e.code === 'KeyX') act('flip');
    if (e.code === 'KeyC') act('call');
    if (e.code === 'KeyG') act('hard');
    if (e.code === 'KeyM') act('motion');
    if (e.code === 'KeyO') act('protect');
    if (e.code === 'KeyZ') act('away');
    if (e.code === 'KeyB') act('pump');
    if (e.code === 'KeyN') act('slide');
    if (e.code === 'Minus' || e.code === 'BracketLeft') zoomBy(-1);
    if (e.code === 'Equal' || e.code === 'BracketRight') zoomBy(1);
    if (e.code === 'Escape' || e.code === 'KeyP') G.paused ? closePause() : openPause();
  });
  addEventListener('keyup', e => {
    keys[e.code] = 0;
    const n = '12345'.indexOf(e.key);
    if (n >= 0) endCharge(n);
  });

  /* ---------- the kick swipe ----------
     Your field goals, punts and kickoffs are kicked with a swipe up the screen: its angle is the aim, its length and
     speed the power. The timing meter (Space, or the Kick button) still works. */
  const swipe = { id: null, x: 0, y: 0, t: 0 };
  const swipeKick = () => !AUTO && !G.paused && (G.state === 'kickm' || koMine());
  const koMine = () => G.state === 'pre' && !!ps && ps.mode === 'ko' && ps.offTeam === 1 && !G.drill;  // your team is kicking off (in a career too)

  function kickBySwipe(dx, dy, ms) {
    const H = cv.clientHeight || 600, len = Math.hypot(dx, dy), pw = clamp(0.55 * len / (0.42 * H) + 0.45 * (len / Math.max(60, ms)) / 2.2, 0, 1.15), aim = Math.atan2(dx, -dy);
    if (G.state === 'kickm') {
      const fg = G.op.n === 'Field Goal', d = ((G.poss === 0 ? 100 : 0) - ps.los) * G.dir + 17, need = clamp((d - 12) / 52, 0.15, 1);
      const straight = clamp(1 - Math.abs(aim) / 0.4, 0, 1), leg = clamp(1 - Math.max(0, need - pw) * 3, 0, 1) * (1 - Math.max(0, pw - 1) * 0.6);
      doKick(fg ? straight * leg : clamp(pw, 0, 1) * (1 - Math.min(0.5, Math.abs(aim) * 0.6)), clamp(aim, -0.6, 0.6));
    } else kickoffBy(pw, aim);
    toast(`Power ${Math.round(Math.min(1, pw) * 100)} · ${Math.abs(aim) < 0.03 ? 'straight' : Math.round(Math.abs(aim) * 57.3) + '° ' + (aim > 0 ? 'right' : 'left')}`);
  }

  /* your kickoff: the swipe decides where it comes down. Full power reaches the end zone; less leaves a ball to return. */
  function kickoffBy(pw, aim) {
    const k = ps.ko, own = 100, dir = -1, deep = -6 + (1 - clamp(pw, 0, 1.1)) * 42;
    k.y = clamp(own + dir * deep, 55, 109);
    k.x = clamp(FW / 2 + aim * 40, 6, FW - 6);
    k.tb = (k.y - own) * dir < 0;
    ps.land = k.y;
    kickNow();
  }

  cv.addEventListener('pointerdown', e => {
    if (!swipeKick() || swipe.id !== null) return;
    swipe.id = e.pointerId;
    [swipe.x, swipe.y] = xy(e);
    swipe.t = performance.now();
  }, true);
  for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, e => {
    if (e.pointerId !== swipe.id) return;
    swipe.id = null;
    if (ev === 'pointercancel' || !swipeKick()) return;
    const [x, y] = xy(e), dx = x - swipe.x, dy = y - swipe.y;
    if (dy < -36 && Math.abs(dx) < -dy * 1.4) kickBySwipe(dx, dy, performance.now() - swipe.t);  // up the screen, not a tap or a sideways drag
  });

  /* a finger that came down on a receiver's letter throws wherever it comes up */
  for (const ev of ['pointerup', 'pointercancel']) addEventListener(ev, e => {
    if (G.chg && G.chg.pid !== null && G.chg.pid === e.pointerId) endCharge();
  });
  const xy = e => {
    const r = cv.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  cv.addEventListener('pointerdown', e => {
    const [x, y] = xy(e);
    if (G.state === 'replay') {
      endReplay();
      return;
    }
    if (canPass()) {
      // the nearest letter, not the first one close enough: in a bunch they sit close together
      let best = null, bd = 30;
      for (const r of ps.recs) if (r.hx !== undefined && hyp(x - r.hx, y - r.hy) < bd) {
        bd = hyp(x - r.hx, y - r.hy);
        best = r;
      }
      if (best) {
        startCharge(ps.recs.indexOf(best), e.pointerId);
        return;
      }
    }
    if (G.state === 'pre' && ps.mode === 'pass' && userP(ps.qb) && !P.some(p => p.jog)) for (const r of ps.recs) if (r.hx !== undefined && hyp(x - r.hx, y - r.hy) < 26) {
      hotRoute(r);
      return;
    }
    if (stick.id === null && (G.state === 'live' || G.state === 'pre') && !koMine()) {
      // on your kickoff a finger on the field is a kick swipe, not the stick
      stick.id = e.pointerId;
      stick.ox = x;
      stick.oy = y;
      stick.x = stick.y = 0;
      try {
        cv.setPointerCapture(e.pointerId);
      } catch (_) {}
    }
  });
  cv.addEventListener('pointermove', e => {
    if (e.pointerId !== stick.id) return;
    const [x, y] = xy(e), R = 36;
    let dx = x - stick.ox, dy = y - stick.oy;
    const m = hyp(dx, dy);
    if (m > R) {
      stick.ox += dx * (m - R) / m;
      stick.oy += dy * (m - R) / m;
      dx = x - stick.ox;
      dy = y - stick.oy;
    }
    stick.x = dx / R;
    stick.y = -dy / R;
  });
  const stickUp = e => {
    if (e.pointerId === stick.id) {
      stick.id = null;
      stick.x = stick.y = 0;
    }
  };
  cv.addEventListener('pointerup', stickUp);
  cv.addEventListener('pointercancel', stickUp);

  function readInput() {
    let x = stick.x, y = stick.y;
    const kx = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0), ky = (keys.ArrowUp || keys.KeyW ? 1 : 0) - (keys.ArrowDown || keys.KeyS ? 1 : 0);
    if (kx || ky) {
      const m = hyp(kx, ky);
      x = kx / m;
      y = ky / m;
    }
    if (!kx && !ky && hyp(x, y) < 0.18 && (GP.x || GP.y)) {
      x = GP.x;
      y = GP.y;
    }
    inp.x = x;
    inp.y = y;
    inp.manual = hyp(x, y) > 0.18;
    inp.sprint = !!(G.sprintBtn || keys.ShiftLeft || (keys.Space && G.state === 'live') || GP.sprint);
  }

  /* ---------- controllers ----------
     Any controller the browser sees (Xbox, PlayStation, Switch Pro and most others report the standard layout).
     On the field the left stick or the d-pad moves, RT (R2) sprints, the right stick zooms, Start pauses and View
     (Select) calls a time out; the face buttons do what the buttons beside the field do:
       before the snap  A snap (or Ready), Y hard count, LB audible, RB flip
       passing          A, B, X, Y and RB throw to the receiver wearing that letter (hold to build power, let go to throw)
       running          A power, B juke, X spin, Y hurdle      defense  A dive, B switch, X hit, Y strip
       a receiver       A calls for the ball                   kicks    A kicks, A calls a fair catch
     Off the field the d-pad or stick moves a ring between the buttons on screen, A presses, B goes back, LB and RB
     change tabs, LT and RT jump a page along the play-call row. */
  const GP = { on: false, prev: [], x: 0, y: 0, sprint: false, nav: { dir: '', t: 0 }, zoomT: 0, foc: null, last: null };
  const GB = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, VIEW: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
  const GLET = ['A', 'B', 'X', 'Y', 'RB'];  // the throw buttons, in the order of the receivers across the field
  const GMAP = { snap: { A: 'main', X: 'motion', Y: 'hard', LB: 'audible', RB: 'flip', LT: 'protect' }, ready: { A: 'main' }, kick: { A: 'main' }, fair: { A: 'fair' }, carry: { A: 'power', B: 'juke', X: 'spin', Y: 'hurdle' }, carryq: { A: 'power', B: 'juke', X: 'spin', Y: 'slide' },
    def: { A: 'dive', B: 'switch', X: 'hit', Y: 'strip' }, deflock: { A: 'dive', X: 'hit', Y: 'strip' }, route: { A: 'call' }, watch: { A: 'ff', B: 'skipd' }, watchF: { A: 'ff', B: 'skipd' }, watchK: { A: 'ff', B: 'skipd' }, watchKF: { A: 'ff', B: 'skipd' }, defpre: { B: 'switch', LB: 'audible' }, loose: { A: 'dive' }, timeout: { A: 'timeout' } };
  addEventListener('gamepadconnected', e => toast('Controller connected' + (e.gamepad && e.gamepad.mapping === 'standard' ? '' : ' · buttons may differ')));
  addEventListener('gamepaddisconnected', () => toast('Controller disconnected'));

  const shown = el => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  };

  function pollPad(dt) {
    const all = navigator.getGamepads ? [...navigator.getGamepads()].filter(p => p && p.connected) : [], gp = all.find(p => p.mapping === 'standard') || all[0];
    if (!gp) {
      if (GP.on) {
        GP.on = false;
        GP.x = GP.y = 0;
        GP.sprint = false;
        G.pad = null;
      }
      return;
    }
    const val = i => (gp.buttons[i] ? gp.buttons[i].value || (gp.buttons[i].pressed ? 1 : 0) : 0), now = gp.buttons.map((_, i) => val(i) > 0.5), was = GP.prev;
    GP.prev = now;
    const hit = i => now[i] && !was[i], rel = i => !now[i] && was[i];
    if (!GP.on) {
      if (!now.some(Boolean) && Math.hypot(gp.axes[0] || 0, gp.axes[1] || 0) < 0.5) return;  // it takes over from the first press, so a controller left plugged in changes nothing
      GP.on = true;
      G.pad = null;  // the field buttons are drawn again with the controller's letters
      const ui = uiLayer();
      if (ui) return navUI(ui, 0, 0, () => false, dt);  // on a screen the first press only shows the ring: it does not pick anything yet
    }
    let x = gp.axes[0] || 0, y = -(gp.axes[1] || 0);
    const m = Math.hypot(x, y);
    if (m < 0.2) x = y = 0;
    else if (m > 1) {
      x /= m;
      y /= m;
    }
    if (now[GB.RIGHT] || now[GB.LEFT] || now[GB.UP] || now[GB.DOWN]) {
      x = (now[GB.RIGHT] ? 1 : 0) - (now[GB.LEFT] ? 1 : 0);
      y = (now[GB.UP] ? 1 : 0) - (now[GB.DOWN] ? 1 : 0);
      const k = Math.hypot(x, y) || 1;
      x /= k;
      y /= k;
    }
    if (hit(GB.START)) {
      if (G.paused) closePause();
      else if (G.ros && G.state !== 'over' && G.state !== 'menu') openPause();
    }
    const ui = uiLayer();
    if (ui) {
      GP.x = GP.y = 0;
      GP.sprint = false;
      return navUI(ui, x, y, hit, dt);
    }
    if (GP.foc) GP.foc.classList.remove('gpf');
    GP.foc = null;
    GP.x = x;
    GP.y = y;
    GP.sprint = val(GB.RT) > 0.3;
    const zy = -(gp.axes[3] || 0);
    if (Math.abs(zy) > 0.6) {
      if ((GP.zoomT -= dt) <= 0) {
        zoomBy(zy > 0 ? 1 : -1);
        GP.zoomT = 0.28;
      }
    } else GP.zoomT = 0;
    if (hit(GB.VIEW)) act('timeout');
    if (G.pad === 'pass') {
      [GB.A, GB.B, GB.X, GB.Y, GB.RB].forEach((b, i) => {
        if (hit(b)) act('num', i);
        if (rel(b)) endCharge(i);
      });
      if (hit(GB.LB)) act('away');
      if (hit(GB.LT)) act('pump');
      return;
    }
    const map = GMAP[G.pad] || {};
    for (const k in map) if (hit(GB[k])) act(map[k]);
  }

  /* what a controller is pointing at when it is not playing: a dialog over the game, or the screen's own buttons */
  function uiLayer() {
    const ov = $('#ov');
    if (ov && !ov.hidden && ov.querySelector('button')) return ov;
    if (G.state !== 'pre' && G.state !== 'live' && scr.querySelector('button, input')) return scr;
    return null;
  }

  function gpFocus(el) {
    if (!el) return;
    if (GP.foc && GP.foc !== el) GP.foc.classList.remove('gpf');
    GP.foc = el;
    el.classList.add('gpf');
    if (el.tagName !== 'INPUT') el.focus({ preventScroll: true });
    const row = el.closest('.grid.row');
    if (row && row.pageTo) row.pageTo([...row.children].indexOf(el));
    else el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function gpPress(el) {
    GP.last = { id: el.id, text: el.textContent.trim() };  // so the ring finds its place again when the screen is redrawn
    if (el.tagName === 'INPUT') {
      if (el.id === 'cn' && !el.value) {
        // no keyboard in hand: a name is picked for you (type over it if you have one)
        el.value = pick(SUR);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      el.focus();
      return;
    }
    el.click();
  }

  function navUI(root, x, y, hit, dt) {
    const els = [...root.querySelectorAll('button, input, select, a[href]')].filter(el => !el.disabled && el.getAttribute('aria-disabled') !== 'true' && shown(el));
    if (!els.length) return;
    let cur = GP.foc && els.includes(GP.foc) ? GP.foc : null;
    if (!cur) {
      const L = GP.last, again = L && ((L.id && els.find(el => el.id === L.id)) || els.find(el => el.textContent.trim() === L.text));
      cur = again || els.find(el => el.matches('.card.sug, .go, .mode.main, #intro, #scn, #pr')) || els[0];
      gpFocus(cur);
    }
    const dir = Math.abs(x) > 0.5 || Math.abs(y) > 0.5 ? (Math.abs(x) > Math.abs(y) ? (x > 0 ? 'R' : 'L') : y > 0 ? 'U' : 'D') : '';
    const move = d => {
      if (cur.tagName === 'INPUT' && cur.inputMode === 'numeric' && (d === 'L' || d === 'R')) {
        cur.value = String(clamp((parseInt(cur.value, 10) || 0) + (d === 'R' ? 1 : -1), 1, 99));  // a number box: left and right change it
        cur.dispatchEvent(new Event('input', { bubbles: true }));
        return;
      }
      const a = cur.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
      let best = null, bs = 1e9;
      for (const el of els) {
        if (el === cur) continue;
        const r = el.getBoundingClientRect(), dx = r.left + r.width / 2 - ax, dy = r.top + r.height / 2 - ay;
        const along = d === 'R' ? dx : d === 'L' ? -dx : d === 'D' ? dy : -dy, across = d === 'R' || d === 'L' ? Math.abs(dy) : Math.abs(dx);
        if (along <= 4) continue;
        const sc = along + across * 2.2;
        if (sc < bs) {
          bs = sc;
          best = el;
        }
      }
      if (best) gpFocus((cur = best));
    };
    if (dir !== GP.nav.dir) {
      GP.nav.dir = dir;
      GP.nav.t = 0.38;
      if (dir) move(dir);
    } else if (dir && (GP.nav.t -= dt) <= 0) {
      GP.nav.t = 0.11;
      move(dir);
    }
    if (hit(GB.A)) return gpPress(cur);
    if (hit(GB.B)) {
      if (G.paused) return $('#pk') ? $('#pk').click() : closePause();
      const b = [...root.querySelectorAll('.back, #pk')].find(shown);
      if (b) gpPress(b);
      return;
    }
    if (hit(GB.LB) || hit(GB.RB)) {
      // the tabs on this screen (the group holding the ring, or the first one)
      const groups = [...root.querySelectorAll('.tabs, .seg')].filter(shown), g = groups.find(g => g.contains(cur)) || groups[0];
      if (g) {
        const bs = [...g.querySelectorAll('button')].filter(shown), i = Math.max(0, bs.findIndex(b => b.classList.contains('on'))), nb = bs[clamp(i + (hit(GB.RB) ? 1 : -1), 0, bs.length - 1)];
        if (nb && nb !== bs[i]) gpPress(nb);
      }
      return;
    }
    if (hit(GB.LT) || hit(GB.RT)) {
      // a page along the play-call row
      const cards = [...root.querySelectorAll('.grid.row .card')];
      if (cards.length) {
        const i = Math.max(0, cards.indexOf(cur));
        gpFocus(cards[clamp(i - (i % 3) + (hit(GB.RT) ? 3 : -3), 0, cards.length - 1)]);
      }
    }
  }

  /* ---------- sound and feedback ---------- */
  /* sounds are synthesized in audio.js */
  function snd(type, opts) {
    if (AUTO || QUIET) return;
    const a = PG.audio;
    if (a) a.play(type, opts);
  }

  /* a short buzz on phones that can vibrate (most Android browsers; iPhones cannot from a web page) */
  let touched = false;  // browsers refuse to vibrate before the first tap
  addEventListener('pointerdown', () => {
    touched = true;
  }, { capture: true, once: true });

  function buzz(pattern) {
    if (AUTO || QUIET || !touched || SET.hap === false || !navigator.vibrate) return;
    if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;  // a scripted tap is not a real one: the browser would refuse and log an error
    try {
      navigator.vibrate(pattern);
    } catch (_) {}
  }

  /* ---------- the booth ----------
     What the two commentators say, and when. Their clips, and the rules for who may talk over whom, are in
     js/audio.js; this is the editorial side: which line fits the moment, and how often it is worth saying. All of it
     is cosmetic, so it uses Math.random and never the game's own generator (a seeded test run must not change
     because someone is listening), and none of it happens in simulated games or in practice. */
  const chance = p => Math.random() < p;
  const tab = t => vk(G.tm[t]);  // in the booth's keys
  const voSaid = {};
  let voClock = 0, voAn = -99;  // seconds of football the booth has sat through (step() counts them), and when the analyst last spoke

  /* Ask the booth for a line. o.every: not the same call again within that many seconds; the rest of o is the booth's
     own (see booth.say in js/audio.js). Returns whether it will be said. */
  function vo(call, o) {
    if (AUTO || QUIET || G.drill || !PG.audio || !PG.audio.call) return false;
    if (o && o.every) {
      if (voClock - (voSaid[call] === undefined ? -1e9 : voSaid[call]) < o.every) return false;
      voSaid[call] = voClock;
    }
    return PG.audio.call(call, o);
  }

  /* The analyst: p is how likely he is to speak. He waits for the play-by-play man to finish, and he leaves a few
     seconds between his own remarks unless the moment is a big one (o.big). */
  function analyst(call, p, o) {
    if (AUTO || QUIET || G.drill || !chance(p) || (voClock - voAn < 9 && !(o && o.big))) return;
    voAn = voClock;
    vo(call, Object.assign({ pri: 0, keep: true, ttl: 7 }, o));
  }

  /* after a scoring drive: how long it was, some of the time, and the analyst on why it worked */
  function voDrive(team, colour) {
    const d = G.lastScore && G.lastScore.team === team ? G.lastScore.drive : null;
    if (!d) return analyst(colour, 0.6, { big: true, ttl: 8 });
    const long = d.plays >= 10 || d.secs >= 240, quick = d.plays <= 3;
    if (long && chance(0.6)) vo('drive.long', { ttl: 9 });
    else if (quick && chance(0.6)) vo('drive.quick', { ttl: 9 });
    else if (d.plays <= 16 && chance(0.5)) vo('drive.plays.' + d.plays, { ttl: 9 });
    analyst(long ? 'a.drive' : quick ? 'a.quick' : colour, 0.65, { big: true, ttl: 10 });
  }

  /* after points: what they did to the game. s0 is the score before the play that brought them. */
  function voScore(t, s0) {
    if (!s0) return;
    const m0 = s0[t] - s0[1 - t], m1 = G.score[t] - G.score[1 - t];
    const call = m1 === 0 ? 'score.tie' : m0 <= 0 && m1 > 0 ? 'score.lead' : m0 > 0 ? (chance(0.4) ? 'score.extend' : '') : chance(0.6) ? 'score.cut' : '';
    if (!call) return;
    vo(call, { ttl: 10 });
    if (m0 <= 0) analyst('a.lead', 0.5, { big: true, ttl: 12 });
  }

  /* Before the snap: the down and distance, some of the time ("Third and six."), and what the moment means. A first
     down was already called when it was made, so it is only said to open a drive. */
  function voPre() {
    if (AUTO || QUIET || G.drill || !ps) return;
    const d = G.down, n = Math.max(1, Math.round(G.togo)), toGoal = G.poss === 0 ? 100 - G.los : G.los, goal = toGoal <= G.togo + 0.5, kick = ps.mode === 'kick', dr = G.drive || {};
    if (G.q === 3 && !G.voHalf) {
      G.voHalf = true;  // a career has no kickoff to say it over
      if (vo('half.back', { pri: 0 })) return;
    }
    if (G.q === 4 && G.clock < 60 && Math.abs(G.score[0] - G.score[1]) <= 8 && !G.voLate) {
      G.voLate = true;
      vo('late');
      analyst('a.close', 1, { big: true, ttl: 9 });
      return;
    }
    if (toGoal < 20 && !goal && !kick && dr.plays > 1 && !dr.voRz) {
      dr.voRz = true;  // the first snap inside the twenty on this drive
      if (chance(0.7)) {
        vo('redzone', { pri: 0 });
        analyst('a.redzone', 0.35);
        return;
      }
    }
    const num = k => (n <= 10 && chance(0.6) ? `down.${k}n.${n}` : '');
    let call = '';
    if (kick) call = d === 4 && chance(0.5) ? (goal ? 'down.4g' : num(4) || 'down.4') : '';
    else if (d === 1) call = goal ? 'down.1g' : dr.plays <= 1 && chance(0.45) ? 'down.1' : '';
    else if (d === 2) call = goal ? (chance(0.7) ? 'down.2g' : '') : chance(0.6) ? '' : num(2) || (n <= 3 ? 'down.2s' : n <= 7 ? 'down.2m' : 'down.2l');
    else if (d === 3) call = goal ? 'down.3g' : chance(0.15) ? '' : num(3) || (n <= 2 ? 'down.3s' : n <= 6 ? 'down.3m' : 'down.3l');
    else call = 'down.4go';
    if (!call) return;
    vo(call, { pri: d >= 3 ? 1 : 0, ttl: 2.5 });
    if (d === 3 && !goal) analyst('a.third', 0.22);
    else if (d === 4 && !kick) analyst('a.fourth', 0.5, { big: true });
  }

  /* ---------- broadcast graphics ----------
     Two cards across the top of the picture, the way a broadcast puts them up: a player's line in this game after a
     touchdown or a big play (yours, in a career), and both teams' numbers when they change ends after the first and
     third quarters. Short, in team colors, a plain fade in and out; never in simulations or practice. */
  let bcT = 0, bcAt = -1e9;
  const inkOn = hex => {
    // white on a dark team color, near-black on a light one (WCAG luminance)
    const v = parseInt(String(hex).slice(1), 16), ch = k => {
      const c = ((v >> k) & 255) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * ch(16) + 0.7152 * ch(8) + 0.0722 * ch(0) < 0.19 ? '#fff' : '#06101f';
  };
  const bcEsc = x => String(x).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  const bcLive = () => !AUTO && !QUIET && !G.drill && !!G.ros && !!G.stats && G.state !== 'menu' && G.state !== 'over';  // a card on a timer may find the game gone

  /* A card that comes up a moment after a play belongs to that play: if the next one has been snapped by then (a skipped
     replay, a quick huddle), or the ball is live, it is dropped instead of covering the wrong play. */
  function later(fn, ms, miss) {
    const n = G.pn || 0;
    setTimeout(() => {
      if (!G.ros || (G.pn || 0) !== n || G.state === 'live' || G.state === 'kicka') return miss && miss();
      fn();
    }, ms);
  }

  /* what the last play left on the screen comes down: its banner and the small note over the field (and, at the snap,
     the broadcast card too) */
  function clearCards(all) {
    clearTimeout(bT);
    clearTimeout(tT);
    $('#banner').classList.remove('on');
    $('#toast').classList.remove('on');
    if (all) bcHide();
  }

  function bcShow(html, ms) {
    if (!bcLive()) return;
    const e = $('#bcast');
    if (!e) return;
    e.innerHTML = html;
    e.className = 'on';
    app.classList.add('bcon');  // the career stat line under the scorebug steps aside: the card says the same and more
    bcAt = performance.now();
    clearTimeout(bcT);
    bcT = setTimeout(bcHide, ms);
  }

  function bcHide() {
    clearTimeout(bcT);
    const e = $('#bcast');
    if (e) e.className = '';
    app.classList.remove('bcon');
  }

  const ROLE_NAME = { X: 'WR', Z: 'WR', S: 'WR', S2: 'WR' };  // the formation's letters, as a broadcast names them

  // one man's line in this game, from the box score
  function boxLine(b) {
    const n = k => b[k] || 0, out = [];
    if (b.att) out.push(`${n('comp')}/${b.att}`, `${n('pyd')} YDS`, ...(n('ptd') ? [`${b.ptd} TD`] : []), ...(n('pint') ? [`${b.pint} INT`] : []));
    if (b.rec) out.push(`${b.rec} REC`, `${n('recyd')} YDS`);
    if (b.car && !b.att) out.push(`${b.car} CAR`, `${n('ryd')} YDS`);
    if (n('td') && !b.att) out.push(`${b.td} TD`);
    return out.join(' · ');
  }

  function playerCard(p, tag) {
    if (!bcLive()) return;
    const b = p && G.box && G.box[p.team + p.role], line = b && boxLine(b);
    if (!line) return;
    const t = TEAMS[G.tm[p.team]];
    bcShow(`<div class="bcard" style="--c:${t.c1};--k:${inkOn(t.c1)}"><b>${p.num}</b><div><strong>${bcEsc(p.name)}</strong><span>${bcEsc(t.name)} · ${bcEsc(ROLE_NAME[p.role] || String(p.role).replace(/\d+$/, ''))}${tag ? ' · ' + tag : ''}</span><em>${line}</em></div></div>`, 4200);
  }

  /* one tracking number for a player: big on the left in his team's color, what it is, and the play it came from */
  function statCard(p, big, what, play) {
    if (!bcLive() || !p) return;
    const t = TEAMS[G.tm[p.team]];
    bcShow(`<div class="bcard num" style="--c:${t.c1};--k:${inkOn(t.c1)}"><b>${big}</b><div><strong>${bcEsc(p.name)} #${p.num}</strong><span>${what}</span><em>${bcEsc(play)}</em></div></div>`, 4600);
  }

  /* Around the league at a quarter break: the other games this week, as far as they have got. Their finals were played
     out before kickoff (league.js preWeek), so a score here is a step on the way to the one in the standings later.
     Your division's games first. */
  const STEPS = [0, 3, 6, 7, 10, 13, 14, 16, 17, 20, 21, 23, 24, 27, 28, 30, 31, 34, 35, 37, 38, 41, 42, 44, 45, 48, 49, 52];
  function partial(final, q) {
    const want = final * q / 4;
    let s = 0;
    for (const v of STEPS) if (v <= want + 1.5 && v <= final) s = v;
    return s;
  }

  function aroundCard(q) {
    if (!bcLive() || !G.around || !G.around.length) return;
    const me = TEAMS[G.tm[0]], mine = g => TEAMS[g[0]].conf === me.conf && TEAMS[g[0]].div === me.div ? 0 : 1;
    const games = G.around.slice().sort((a, b) => mine(a) - mine(b)).slice(0, 4), row = ([a, sa, b, sb]) => `<tr><td>${partial(sa, q)}</td><th>${TEAMS[a].ab} · ${TEAMS[b].ab}</th><td>${partial(sb, q)}</td></tr>`;
    bcShow(`<div class="bstats"><div class="bh"><small>Around the league · end of Q${q}</small></div><table>${games.map(row).join('')}</table></div>`, 5200);
  }

  /* a career high, passed during this game: once a stat, and only once the old one was worth beating */
  const HIGHS = { pyd: ['passing yards', 120], ptd: ['touchdown passes', 2], comp: ['completions', 10], recyd: ['receiving yards', 60], rec: ['catches', 4], rectd: ['touchdown catches', 1], ryd: ['rushing yards', 30], kry: ['kick return yards', 40] };
  function highCheck() {
    const h = G.highs, my = G.my, me = G.me;
    if (!h || !my || !me) return;
    for (const k in HIGHS) if ((my[k] || 0) > (h[k] || 0) && (h[k] || 0) >= HIGHS[k][1] && !(G.hiSaid || (G.hiSaid = {}))[k]) {
      G.hiSaid[k] = 1;
      const who = { team: 0, name: me.name, num: me.num }, v = my[k], old = h[k];
      later(() => statCard(who, String(v), 'Career high · ' + HIGHS[k][0], `the old one was ${old}`), 2600);
      return;  // one a play
    }
  }

  /* third down: how often the side with the ball has made it today */
  function thirdCard() {
    const t3 = G.third && G.third[G.poss];
    if (!bcLive() || !t3 || !t3[0] || performance.now() - bcAt < 7000) return;
    const t = TEAMS[G.tm[G.poss]];
    bcShow(`<div class="bcard num" style="--c:${t.c1};--k:${inkOn(t.c1)}"><b>3rd</b><div><strong>Third down · ${t.ab}</strong><span>${t3[1]} of ${t3[0]} today</span><em>${downTxt()}</em></div></div>`, 3600);
  }

  function teamStatsCard(title) {
    if (!bcLive()) return;
    const s = G.stats, t0 = TEAMS[G.tm[0]], t1 = TEAMS[G.tm[1]], row = (l, a, b) => `<tr><td>${a}</td><th>${l}</th><td>${b}</td></tr>`;
    bcShow(`<div class="bstats"><div class="bh"><span style="--c:${t0.c1};--k:${inkOn(t0.c1)}">${t0.ab}</span><small>${title}</small><span style="--c:${t1.c1};--k:${inkOn(t1.c1)}">${t1.ab}</span></div>
  <table>${row('Total yards', s[0].pass + s[0].rush, s[1].pass + s[1].rush)}${row('Passing', s[0].pass, s[1].pass)}${row('Rushing', s[0].rush, s[1].rush)}${row('Completions', `${s[0].comp}/${s[0].att}`, `${s[1].comp}/${s[1].att}`)}${row('Turnovers', s[0].to, s[1].to)}</table></div>`, 5600);
  }

  /* The call of the play that just ended: the play-by-play man says what happened, and the analyst, some of the time,
     says why. `good` is the kick's result, the punt's, or (after a touchdown) how the try went when it was settled on
     the spot; s0 is the score before the play. */
  function callPlay(kind, good, big, sub, gain, c, s0) {
    if (AUTO || QUIET || G.drill || !PG.audio || !PG.audio.call) return;
    const off = ps.offTeam, t = c ? c.team : off, ko = ps.mode === 'ko', down = kind === 'tackle' || kind === 'oob';
    if (kind === 'td') {
      const back = ko || t !== off;  // a return, or the defense's score
      vo(back && chance(0.6) ? 'td.return' : chance(0.45) ? 'td.team.' + tab(t) : 'td', { pri: 2 });
      if (!back) voDrive(off, 'a.td');
      if (G.callout && t === 0 && !G.voCallTd && G.score[0] > G.score[1] && chance(0.75)) {
        G.voCallTd = true;  // the first time your side scores to lead, in the game you talked about all week
        vo('call.td', { ttl: 10 });
      }
      if (good) {
        if (good !== 'xp.good') vo(good, { ttl: 10 });  // the routine extra point goes without saying
        voScore(t, s0);
      } else G.voS0 = s0;  // your try comes after the celebration, and the booth's sums with it
    } else if (kind === 'fumble') {
      vo(ps.fum && ps.fum.muff ? 'ball.team.' + tab(t) : 'fumble.def', { pri: 2 });
      if (!(ps.fum && ps.fum.muff) && chance(0.5)) vo('ball.team.' + tab(t), { ttl: 6 });
      analyst('a.fumble', 0.6, { big: true });
    } else if (ps.fum && ps.fum.scoop && down) {
      if (chance(0.6)) vo('ball.team.' + tab(t), { ttl: 5 });  // "Scooped up!" was called as it happened
      analyst('a.fumble', 0.6, { big: true });
    } else if (ps.fum && down) vo('fumble.off');
    else if (big === 'Interception!') {
      if (chance(0.6)) vo('ball.team.' + tab(t), { ttl: 5 });  // "Intercepted!" was called as it happened
      analyst('a.int', 0.7, { big: true, ttl: 8 });
    } else if (sub === 'Turnover on downs') {
      vo('downs', { pri: 2 });
      analyst('a.downs', 0.6, { big: true });
    } else if (big === 'Sack!') {
      vo('sack', { pri: 2 });
      analyst('a.sack', 0.5, { big: true });
    } else if (big === 'Safety!') {
      vo('safety', { pri: 2 });
      voScore(1 - off, s0);
    } else if (kind === 'fg') {
      const post = ps.kick && ps.kick.post;
      vo(post ? (good ? 'fg.post.good' : 'fg.post.miss') : good ? 'fg.good' : 'fg.miss', { pri: 2 });
      if (good) voDrive(off, 'a.fggood');
      else analyst('a.fgmiss', 0.4, { big: true });
      if (good) voScore(off, s0);
    } else if (kind === 'kotb' || big === 'Touchback') vo('touchback', { pri: 0 });
    else if (kind === 'punt') {
      if (good.tb || good.fair) vo(good.tb ? 'touchback' : 'punt.fair', { pri: 0 });
    } else if (ko && down) {
      if (Math.round((c.y - ps.land) * G.dir) >= (ps.punt ? 15 : 28)) {  // a punt return of fifteen is a good one
        vo(ps.punt ? 'punt.big' : 'kick.big', { pri: 2 });
        if (G.lock && c === G.me) analyst('a.ret.me', 0.7, { big: true });  // a career receiver who returns kicks too
        else analyst('a.return', 0.5, { big: true });
      } else if (chance(0.6)) vo('kick.return', { pri: 0 });
    } else if (down) {
      const first = big === 'First down', pass = ps.caught, short = { pri: first ? 1 : 0 };
      let said = false;
      /* who has it changes the call: the quarterback running, a tight end or a back catching it */
      const role = c ? c.role : '', qbRun = !pass && c === ps.qb && gain >= 2 && gain < 15, catcher = pass && gain >= 2 && gain < 20 ? (role === 'TE' ? 'pass.te' : /^(RB|FB)$/.test(role) ? 'pass.rb' : '') : '';
      if (qbRun && chance(0.75)) said = vo('run.qb', { pri: 1 });
      else if (catcher && chance(catcher === 'pass.rb' ? 0.4 : 0.55)) said = vo(catcher, short);  // backs catch a lot of short balls: not every one is worth naming
      else if (pass) said = gain >= 20 ? vo('pass.big', { pri: 2 }) : gain >= 8 ? chance(0.8) && vo('pass.good') : gain >= 0 && chance(0.35) && vo('pass.short', short);
      else said = gain >= 15 ? vo('run.big', { pri: 2 }) : gain >= 6 ? chance(0.8) && vo('run.good') : gain >= 1 ? chance(0.3) && vo('run.short', short) : chance(gain ? 0.75 : 0.6) && vo(gain ? 'run.loss' : 'run.none');
      if (first && chance(said ? 0.7 : 0.55)) vo('first', { ttl: 5 });
      if (pass && gain >= 20) analyst('a.bigpass', 0.6, { big: true });
      else if (!pass && gain >= 15) analyst('a.bigrun', 0.6, { big: true });
      else if (qbRun && said) analyst('a.qbrun', 0.3);
      else if (first) analyst('a.first', 0.15, { every: 40 });
      else if (G.down === 4) analyst('a.stop', 0.4);  // third down, and they did not get there
      else if (!pass && gain >= 6) analyst('a.run', 0.15);
      else if (gain < 0) analyst('a.stop', 0.2);
    } else if (kind === 'inc') {
      const call = big === 'Thrown away' ? 'pass.away' : big === 'Pass broken up' || big === 'Batted down' ? 'pass.broken' : big === 'Overthrown' ? 'pass.over' : 'pass.inc';
      if (chance(call === 'pass.broken' ? 0.85 : 0.6)) vo(call, { ttl: 2 });
      if (call === 'pass.broken') analyst('a.cover', G.down === 4 ? 0.4 : 0.15);
      else if (call === 'pass.over') analyst('a.miss', G.down === 4 ? 0.4 : 0.15);
      else if (G.down === 4) analyst('a.stop', 0.3);
    }
  }

  /* A scoring drive, summed up on screen a moment after the score: plays, yards, time. */
  function driveCard(title, d) {
    if (!d || G.drill) return;
    setTimeout(() => {
      if (!G.ros || G.state === 'menu' || G.state === 'over') return;
      toast(`${title} · ${d.plays} play${d.plays === 1 ? '' : 's'} · ${d.yds} yards · ${clockTxt(d.secs)}`);
    }, 1700);
  }

  /* the home crowd is on the user's side: it cheers what is good for team 0 and groans at the rest */
  function react(goodFor, size, dur) {
    if (AUTO || QUIET) return;
    const fans = G.home || 0;  // the crowd is the home team's: on the road your big plays get a groan
    if (goodFor === fans && R3) R3.cheer(size);
    const a = PG.audio;
    if (!a) return;
    if (goodFor === fans) a.crowd.cheer(size, dur);
    else if (size >= 0.7) a.crowd.groan(size * 0.9);
    else a.crowd.ooh(size);
  }

  function crowdLevel() {
    if (!G.ros || G.state === 'over') return 0.25;
    let v = 0.3;
    const toGoal = G.poss === 0 ? 100 - G.los : G.los;
    if (toGoal < 20) v += 0.2;
    if (G.down >= 3) v += 0.15;
    if (G.q >= 4 && Math.abs(G.score[0] - G.score[1]) <= 8) v += 0.2;
    if (G.state === 'live') v += 0.15;
    else if (G.poss === 1 && G.state === 'pre') v += 0.1;  // loud when the home defense is out there
    return Math.min(1, v);
  }

  function hitFx(x, y) {
    if (QUIET) return;
    FX.push({ x, y, t: 0 });
    if (!RM) shake = 0.2;
    try {
      if (navigator.vibrate && navigator.userActivation && navigator.userActivation.hasBeenActive) navigator.vibrate(20);
    } catch (_) {}
  }

  function confetti(team) {
    if (QUIET || RM) return;
    const t = TEAMS[G.tm[team]];
    for (let i = 0; i < 80; i++) CONF.push({ x: rnd(W), y: rnd(-H * 0.35, 0), vx: rnd(-30, 30), vy: rnd(140, 340), a: rnd(6.3), c: pick([t.c1, t.c2, ACC, '#ffffff']) });
  }

  /* ---------- UI ---------- */
  let bT, tT;

  function banner(big, sub, ms = 1600) {
    if (QUIET) return;
    const b = $('#banner');
    b.innerHTML = `<b>${big}</b>${sub?`<span>${sub}</span>`:''}`;
    b.classList.add('on');
    clearTimeout(bT);
    bT = setTimeout(() => b.classList.remove('on'), ms);
  }

  function toast(t) {
    if (QUIET || AUTO) return;
    const b = $('#toast');
    b.textContent = t;
    b.classList.add('on');
    clearTimeout(tT);
    tT = setTimeout(() => b.classList.remove('on'), 1300);
  }

  let hudKey = '';

  function updHud() {
    if (!G.ros) return;
    const pcs = pcOn() && G.pc <= 10 ? Math.max(0, Math.ceil(G.pc)) : -1;  // the play clock, in its last ten seconds
    const s = Math.ceil(G.clock), ko = !!ps && ps.mode === 'ko', ln = G.lineFn ? G.lineFn(G.my, G.drill) : '', k = [pcs, G.score, G.q, s, G.poss, G.down, G.togo | 0, G.los | 0, ko, ln, G.drill && G.drill.left, G.drill && G.drill.reps.length, G.to, G.state === 'over' || G.state === 'replay'].join();
    if (k === hudKey) return;
    hudKey = k;
    const mine = $('#mine');
    mine.hidden = !ln || G.state === 'over' || G.state === 'replay';  // the result sheet and the replay badge take its place
    mine.textContent = ln;
    $('#s0').textContent = G.score[0];
    $('#s1').textContent = G.score[1];
    $('#qt').textContent = G.q > 4 ? 'OT' : ORD[G.q - 1];
    $('#clk').textContent = G.drill ? Math.min(G.drill.n, G.drill.n - G.drill.left + 1) + '/' + G.drill.n : Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    if (G.drill) $('#qt').textContent = 'Rep';
    G.dnTxt = ko ? (ps.punt ? 'Punt return' : 'Kickoff') : downTxt();
    $('#dn').textContent = G.dnTxt + (pcs >= 0 ? ` · :${String(pcs).padStart(2, '0')}` : '');
    $('#dn').classList.toggle('pc', pcs >= 0 && pcs <= 5);
    for (const t of [0, 1]) $('#a' + t).dataset.to = G.drill ? '' : '●'.repeat(G.to[t]) + '○'.repeat(3 - G.to[t]);
    $('#sd0').classList.toggle('has', G.poss === 0);
    $('#sd1').classList.toggle('has', G.poss === 1);
  }

  function toMenu() {
    bcHide();
    if (PG.audio) PG.audio.scene('menu');
    clearTimeout(tipT);
    $('#tip').hidden = true;
    G = menuState(G.tm);
    P = [];
    ps = null;
    FX.length = 0;
    $('#hud').hidden = true;
    pad.innerHTML = '';
    pad.style.width = '';
    scr.innerHTML = '';
    setBrief('');
    $('#banner').classList.remove('on');
    $('#meter').hidden = true;
    $('#rp').hidden = true;  // leaving in the middle of a replay used to leave its badge on the menu
    CONF.length = 0;
  }

  function openPause() {
    if (!G.ros || G.state === 'over' || G.paused) return;
    G.paused = true;
    if (PG.audio) PG.audio.muffle(true);  // the stadium goes dull and distant while the game is stopped
    const ov = $('#ov');
    ov.hidden = false;
    const draw = sure => {
      ov.innerHTML = sure
        ? `<div class="dlg"><h3>${G.drill?'Leave drill?':'Leave game?'}</h3><p>${G.drill?'This drill will not count. You can start it again.':G.mode!=='exh'?'This game will not count. You can play it again.':'Your progress in this game will be lost.'}</p><button class="btn2 warn" id="pq2">${G.drill?'Leave drill':'Leave game'}</button><button class="btn2" id="pk">Keep playing</button></div>`
        : `<div class="dlg"><h3>Paused</h3>${G.goalsFn?`<ul class="gl" style="margin:0 0 6px">${G.goalsFn(G.my).map(g=>`<li class="${g.ok?'ok':'no'}"><span>${g.d}</span></li>`).join('')}</ul>`:''}<button class="go sm" id="pr">Resume</button><button class="btn2" id="psn">Sound: ${SET.snd?'on':'off'}</button><button class="btn2" id="pan">Commentary: ${SET.ann!==false?'on':'off'}</button><button class="btn2 warn" id="pq">${G.drill?'Leave drill':'Leave game'}</button></div>`;
      const on = (id, f) => {
        const el = $('#' + id);
        if (el) el.onclick = f;
      };
      on('pr', closePause);
      on('pk', () => draw(false));
      on('pq', () => draw(true));
      on('psn', () => {
        SET.snd = !SET.snd;
        save('pg.settings', SET);
        if (PG.audio) PG.audio.refresh();
        draw(false);
      });
      on('pan', () => {
        SET.ann = SET.ann === false;
        save('pg.settings', SET);
        if (PG.audio) PG.audio.refresh();
        draw(false);
      });
      on('pq2', () => {
        const cb = G.onQuit;
        closePause();
        toMenu();
        cb ? cb() : showMenu();
      });
    };
    draw(false);
  }

  function closePause() {
    $('#ov').hidden = true;
    $('#ov').innerHTML = '';
    G.paused = false;
    if (PG.audio) PG.audio.muffle(false);
  }

  $('#pz').onclick = openPause;

  /* Camera zoom. 1 is the standard view, bigger is closer. Players differ, so it goes from well back to right in: the
     two buttons under the scoreboard, the mouse wheel, or the minus and equals keys. */
  const ZOOMS = [0.6, 0.7, 0.8, 0.9, 1, 1.12, 1.25, 1.4, 1.6, 1.8];
  if (typeof SET.zoom !== 'number') SET.zoom = SET.camv === 'close' ? 1.25 : SET.camv === 'high' ? 0.8 : 1;  // the old three-way camera choice
  const zoomTxt = () => Math.round(SET.zoom * 100) + '%';

  function zoomBy(dir) {
    let i = 0;
    ZOOMS.forEach((v, k) => {
      if (Math.abs(v - SET.zoom) < Math.abs(ZOOMS[i] - SET.zoom)) i = k;
    });
    SET.zoom = ZOOMS[clamp(i + dir, 0, ZOOMS.length - 1)];
    save('pg.settings', SET);
    toast('Zoom ' + zoomTxt());
  }

  $('#zo').onclick = () => zoomBy(-1);
  $('#zi').onclick = () => zoomBy(1);
  let wheelT = 0;
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    if (performance.now() - wheelT < 140 || G.state === 'menu') return;
    wheelT = performance.now();
    zoomBy(e.deltaY > 0 ? -1 : 1);
  }, { passive: false });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.ros && G.state !== 'over' && !AUTO && !window.PG_TEST) openPause();
  });  // PG_TEST: screenshots in the test pane hide the page

  /* the game also stops when the "turn your phone" notice covers it */
  const sideways = window.matchMedia ? matchMedia('(orientation:landscape) and (max-height:480px) and (pointer:coarse)') : null;
  if (sideways && sideways.addEventListener) sideways.addEventListener('change', e => {
    if (e.matches && G.ros && G.state !== 'over' && !AUTO) openPause();
  });

  function drawArt(c, pl, def) {
    const x = c.getContext('2d'), w = c.width = 280, h = c.height = 200, sc = 7, ox = w / 2, oy = def ? h - 26 : h - 62, X = d => ox + d * sc, Y = d => oy - d * sc;
    x.fillStyle = '#1f6e36';
    x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(255,255,255,.16)';
    x.lineWidth = 2;
    for (let y = oy - 140; y < h; y += 35) {
      x.beginPath();
      x.moveTo(0, y);
      x.lineTo(w, y);
      x.stroke();
    }
    x.strokeStyle = 'rgba(255,255,255,.6)';
    x.beginPath();
    x.moveTo(0, oy);
    x.lineTo(w, oy);
    x.stroke();
    x.lineCap = 'round';
    x.lineJoin = 'round';
    const arrow = (pts, col, lw) => {
      x.strokeStyle = x.fillStyle = col;
      x.lineWidth = lw;
      x.beginPath();
      pts.forEach((p, i) => i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]));
      x.stroke();
      const n = pts.length, a = pts[n - 2], b = pts[n - 1], an = Math.atan2(b[1] - a[1], b[0] - a[0]);
      x.beginPath();
      x.moveTo(b[0] + Math.cos(an) * 9, b[1] + Math.sin(an) * 9);
      x.lineTo(b[0] + Math.cos(an + 2.3) * 8, b[1] + Math.sin(an + 2.3) * 8);
      x.lineTo(b[0] + Math.cos(an - 2.3) * 8, b[1] + Math.sin(an - 2.3) * 8);
      x.fill();
    };
    if (def) {
      for (const r of DEFR) {
        const a = pl.a[r] || 'rush', [dx, dy] = DPOS[r];
        if (a === 'rush') arrow([[X(dx), Y(dy)], [X(dx * 0.5), Y(-2)]], '#ff6b6b', 4);
        else if (a === 'man') {
          x.setLineDash([6, 6]);
          arrow([[X(dx), Y(dy)], [X(dx), Y(dy > 5 ? 4 : 0.5)]], '#d59bff', 3);
          x.setLineDash([]);
        } else {
          x.fillStyle = a.deep ? 'rgba(77,171,247,.5)' : 'rgba(255,255,255,.32)';
          x.beginPath();
          x.ellipse(X(clamp(a.z[0], -17, 17)), Y(Math.min(a.z[1], 22)), a.deep ? 38 : 30, a.deep ? 20 : 16, 0, 0, 7);
          x.fill();
        }
        x.fillStyle = '#fff';
        x.font = 'bold 17px sans-serif';
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.fillText('×', X(dx), Y(dy));
      }
      return;
    }
    if (pl.cat === 'special') {
      x.fillStyle = '#fff';
      x.font = '800 36px Archivo,Arial,sans-serif';
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.fillText(pl.quick ? pl.quick.toUpperCase() : pl.n === 'Punt' ? 'PUNT' : 'FG', ox, h / 2);
      return;
    }
    const f = FORM[pl.f];
    for (const r in f) {
      const [dx, dy] = f[r], nm = (pl.r || {})[r];
      if (pl.run && pl.run.who === r) arrow([[X(dx), Y(dy)], ...pl.run.path.map(([a, b]) => [X(a), Y(b)])], '#ff9f43', 5);
      else if (nm && ROUTES[nm]) {
        const d = ROUTES[nm], s = d.abs ? 1 : dx < 0 ? 1 : -1;
        arrow([[X(dx), Y(dy)], ...d.p.map(([a, b]) => [X(dx + a * s), Math.max(8, Y(dy + b))])], pl.cat === 'run' ? 'rgba(255,255,255,.35)' : '#ffffff', pl.cat === 'run' ? 3 : 4);
      }
    }
    x.fillStyle = '#fff';
    for (const r of OLR) x.fillRect(X(OLX[r]) - 5, Y(-0.6) - 5, 10, 10);
    for (const r in f) {
      x.beginPath();
      x.arc(X(f[r][0]), Y(f[r][1]), 6, 0, 7);
      x.fill();
    }
  }

  /* The play-call sheet. side: 'off' (your offense), 'def' (your defense), 'qb' (a career quarterback: the coach sends
     his call). Three plays show at a time, in a row you swipe (or scroll, or page with the arrows) for more: on the
     Coach tab the first three are the coach's three likeliest calls for this down, distance and score, then the rest of
     what he would call, in order. The other tabs hold every play of one kind, best first. */
  function showCall(side) {
    const off = side !== 'def', qbSide = side === 'qb';
    let ranked;
    if (side === 'def') ranked = rankDef();
    else if (!qbSide) ranked = rankOff(0);
    else {
      // the coach's call and two others of a different kind, from other formations where he can
      const cats = G.op.cat === 'run' ? ['short', G.togo > 6 ? 'deep' : 'short'] : G.op.cat === 'deep' ? ['run', 'short'] : ['run', 'deep'];
      if (G.down >= 3 && G.togo > 5) cats[cats.indexOf('run') < 0 ? 0 : cats.indexOf('run')] = 'short';
      if (G.op.cat !== 'rpo' && G.down <= 3 && G.togo >= 3 && G.togo <= 10 && Math.random() < 0.25) cats[1] = 'rpo';
      const picked = [G.op], skip = Math.random() < 0.75 ? OFF.filter(p => p.gadget) : [];  // a trick play is offered now and then, not every series
      for (const c of cats) {
        const p = pickOff(0, c, Math.random, { star: G.lock, not: [...picked, ...skip], f: G.op.f });
        if (p) picked.push(p);
      }
      // his call and two others first, then anything else in the book, in the order he would call it
      ranked = [...picked, ...rankOff(0).filter(p => !picked.includes(p) && p.cat !== 'special')];
    }
    const top = ranked[0], order = new Map(ranked.map((p, i) => [p, i]));
    const cats = off ? [['coach', 'Coach'], ['run', 'Run'], ['rpo', 'RPO'], ['short', 'Short'], ['deep', 'Deep'], ...(qbSide || G.try2 != null ? [] : [['special', 'Special']])] : null;  // no kicks on a two-point try
    let cat = 'coach';
    const tag = (p, i) => cat === 'coach' || !off ? (i < 3 ? `<em>${['Coach’s pick', '2nd pick', '3rd pick'][i]}</em>` : '') : p === top ? '<em>Coach’s pick</em>' : '';
    const draw = () => {
      const list = !off || cat === 'coach' ? ranked : OFF.filter(p => p.cat === cat).sort((a, b) => (order.get(a) ?? 999) - (order.get(b) ?? 999));
      scr.innerHTML = `<div class="sheet call"><div class="shd"><b>${side==='def'?'Set the defense':side==='qb'?'Coach sends in':'Call your play'}</b><span>${side!=='def'&&hurry(G.poss)?'No huddle · ':''}${downTxt()}</span></div>${G.runoff>0&&G.to[0]>0&&!G.lock&&!G.drill?`<button class="btn2" id="tmo" style="margin:0 0 8px">Time out · get ${Math.round(G.runoff)} seconds back · ${G.to[0]} left</button>`:''}${youChallenge()?`<button class="btn2" id="chal" style="margin:0 0 8px">Challenge the spot · ${G.chal?G.chal[0]:2} left</button>`:''}${off?`<div class="tabs">${cats.map(([k,l])=>`<button data-c="${k}" class="${k===cat?'on':''}">${l}</button>`).join('')}</div>`:''}<div class="grid row" id="crow">${list.map((p,i)=>`<button class="card${p===top?' sug':''}">${tag(p,i)}<canvas></canvas><b>${p.n}</b><small>${p.d||FNAME[p.f]||''}</small></button>`).join('')}</div><div class="pgbar"><button class="pgb" id="pgL" aria-label="Previous plays">‹</button><span id="pgN"></span><button class="pgb" id="pgR" aria-label="More plays">›</button></div></div>`;
      pager($('#crow'), list.length);
      scr.querySelectorAll('.card').forEach((el, i) => {
        drawArt(el.querySelector('canvas'), list[i], side === 'def');
        el.onclick = () => {
          if (side === 'off') {
            G.op = list[i];
            G.dp = cpuDef();
          } else if (side === 'qb') G.op = list[i];
          else G.dp = list[i];
          begin();
        }
      });
      scr.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
        cat = b.dataset.c;
        draw();
        const t = scr.querySelector(`.tabs button[data-c="${cat}"]`);
        if (t && document.activeElement !== t && GP.on) gpFocus(t);  // a controller keeps its place on the tabs
      });
      const tmo = $('#tmo');
      if (tmo) tmo.onclick = () => {
        timeout(0);
        draw();
      };
      const ch = $('#chal');
      if (ch) ch.onclick = () => {
        resolveChallenge(0);
        startCall();  // the down, the distance, even the side of the ball may have changed
      };
    };
    draw();
  }

  /* A row of cards three at a time: swipe it, scroll it with a mouse wheel (up and down turn into across), or page it
     with the arrows under it, which also say where you are ("4–6 of 49"). */
  function pager(row, n) {
    const L = $('#pgL'), R = $('#pgR'), N = $('#pgN'), per = 3;
    const step = () => {
      const c = row.querySelector('.card');
      return c ? c.offsetWidth + parseFloat(getComputedStyle(row).columnGap || 8) : row.clientWidth / per;
    };
    const upd = () => {
      const i = Math.round(row.scrollLeft / step()), a = Math.min(n, i + 1), b = Math.min(n, i + per);
      N.textContent = n <= per ? `${n} play${n === 1 ? '' : 's'}` : `${a}–${b} of ${n}`;
      L.setAttribute('aria-disabled', i <= 0 ? 'true' : 'false');
      R.setAttribute('aria-disabled', b >= n ? 'true' : 'false');
    };
    /* a page along, eased over a fifth of a second; the browser's own smooth scroll did not move a snapping row at all */
    const slide = x => {
      x = clamp(x, 0, row.scrollWidth - row.clientWidth);
      const x0 = row.scrollLeft, t0 = performance.now(), me = (row.sl = (row.sl || 0) + 1);
      row.style.scrollSnapType = 'none';
      const end = () => {
        if (row.sl !== me) return;
        row.sl++;
        row.scrollLeft = x;
        row.style.scrollSnapType = '';
        upd();
      };
      const f = now => {
        if (row.sl !== me) return;
        const u = Math.min(1, (now - t0) / 220);
        row.scrollLeft = x0 + (x - x0) * (1 - Math.pow(1 - u, 3));
        if (u < 1) requestAnimationFrame(f);
        else end();
      };
      requestAnimationFrame(f);
      setTimeout(end, 400);  // where frames are not running (a background tab), it still lands
    };
    const go = d => slide((Math.round(row.scrollLeft / step() / per) + d) * per * step());
    L.onclick = () => go(-1);
    R.onclick = () => go(1);
    row.addEventListener('scroll', upd, { passive: true });
    let acc = 0, lock = 0;
    row.addEventListener('wheel', e => {
      // a mouse wheel or a two-finger swipe turns pages: a small nudge on a snapping row would only spring back
      const d = Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.preventDefault();
      else return;  // sideways swipes scroll the row natively
      acc += d;
      if (performance.now() < lock || Math.abs(acc) < 30) return;
      go(acc > 0 ? 1 : -1);
      acc = 0;
      lock = performance.now() + 320;
    }, { passive: false });
    row.pageBy = go;
    row.pageTo = i => {
      // the page holding card i (the controller's ring): scrolling it just into view would snap back to the page before
      const x = Math.floor(i / per) * per * step();
      if (Math.abs(row.scrollLeft - x) > 2) slide(x);
    };
    upd();
  }

  /* every team, grouped by conference and division, for the team pickers */
  const teamGrid = sel => PG.data.CONF.map((c, ci) => `<h3 class="tgh">${c} Conference</h3>` + PG.data.DIV.map((d, di) => `<small class="tgd">${c} ${d}</small>`
    + TEAMS.map((t, i) => [t, i]).filter(([t]) => t.conf === ci && t.div === di).map(([t, i]) => tmBtn(t, i, i === sel)).join('')).join('')).join('');

  const tmBtn = (t, i, on) => `<button class="tm ${on?'on':''}" data-i="${i}" style="--c:${t.c1}"><i></i><b>${t.city}</b><span>${t.name}</span><u>${t.ovr}</u></button>`;

  /* small pictures for the menu: a mode's own picture, or the badge of the team a saved career or season is with */
  const MENU_ICON = {
    career: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7.5" r="4"/><path d="M4 21c0-4.6 3.4-7.5 8-7.5s8 2.9 8 7.5z"/></svg>',
    season: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v5a5 5 0 01-4 4.9V16h3v3H8v-3h3v-3.1A5 5 0 017 8zM3 4.5h3V9a3.5 3.5 0 01-3-3.4zm18 0v1.1A3.5 3.5 0 0118 9V4.5z"/></svg>',
    exh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6l4 12h2.4l4-12h-2.7L8.2 14.6 5.7 6zm11.6 9.4c.5 1.8 2 2.8 4 2.8 2.200 0 3.700-1.200 3.700-3.100 0-1.700-1-2.500-3.200-3.100-1.300-.4-1.700-.6-1.700-1.200 0-.5.500-.9 1.200-.9.800 0 1.300.4 1.500 1.100l2-.7c-.4-1.500-1.700-2.400-3.500-2.400-2 0-3.400 1.200-3.400 3 0 1.600 1 2.400 3 3 1.400.4 1.900.7 1.900 1.300 0 .6-.6 1-1.400 1-1 0-1.700-.5-2-1.500z"/></svg>',
    camp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 3a7 7 0 110 14 7 7 0 010-14zm0 3a4 4 0 100 8 4 4 0 000-8zm0 2.500a1.500 1.500 0 110 3 1.500 1.500 0 010-3z"/></svg>',
    set: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h9v2H4zm13 0h3v2h-3zm-3-2h2v6h-2zM4 16h3v2H4zm7 0h9v2h-9zm-3-2h2v6H8z"/></svg>',
    how: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1 15h2v2h-2zm1.200-11c2.100 0 3.600 1.300 3.600 3.200 0 1.400-.7 2.200-1.900 3-.9.600-1.100.9-1.100 1.800h-2c0-1.600.4-2.300 1.600-3.100.900-.6 1.300-1 1.300-1.700s-.600-1.200-1.500-1.200-1.600.5-1.800 1.500l-2-.5C8.800 7.100 10.200 6 12.200 6z"/></svg>',
    mile: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l2.900 6.300 6.800.7-5.100 4.600 1.500 6.800L12 16.900 5.900 20.400l1.500-6.800L2.300 9l6.800-.7z"/></svg>',
    hall: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l10 5v2H2V7zM4 11h3v7H4zm6.500 0h3v7h-3zM17 11h3v7h-3zM2 20h20v2H2z"/></svg>',
  };
  const menuBadge = (i, kind) => {
    const t = i != null && TEAMS[i];
    return t ? `<u class="mi tb" style="--c:${t.c1};color:${inkOn(t.c1)}">${esc(t.ab)}</u>` : `<u class="mi">${MENU_ICON[kind]}</u>`;
  };

  function showMenu() {
    if (G.state === 'menu') G.env = null;  // the stadium behind the menus is always a clear night
    toMenu();
    const cs = PG.career && PG.career.summary(), camp = PG.camp, offer = !!camp && camp.fresh() && !cs && !(PG.season && PG.season.summary());
    const ss = PG.season && PG.season.summary(), ct = cs && PG.career.data ? PG.career.data.team : null, st = ss && PG.season.data ? PG.season.data.team : null;
    scr.innerHTML = `<div class="menu"><h1>Pocket<br><em>Gridiron</em></h1><p class="tag">Full 11-on-11 football, built for one hand.</p>
  ${offer?'<div class="offer"><b>First time here?</b><span>Training camp teaches passing, running and tackling in three short drills.</span><div class="row2"><button class="go sm" id="oY">Start camp</button><button class="btn2" id="oN">Not now</button></div></div>':''}
  <button class="mode main" id="mC">${menuBadge(ct, 'career')}<b>Career</b><span>${cs||'Create a player, lock in at your position, and build a legacy one season at a time.'}</span><i>›</i></button>
  <button class="mode" id="mSe">${menuBadge(st, 'season')}<b>Season</b><span>${ss||'Take one team through seven games and the playoffs.'}</span><i>›</i></button>
  <button class="mode" id="mE">${menuBadge(null, 'exh')}<b>Exhibition</b><span>Pick two teams and play one game.</span><i>›</i></button>
  ${camp?`<button class="mode" id="mT">${menuBadge(null, 'camp')}<b>Training camp</b><span>${camp.summary()}</span><i>›</i></button>`:''}
  <div class="row2 mrow"><button class="btn2" id="mS">${MENU_ICON.set}Settings</button><button class="btn2" id="mH">${MENU_ICON.how}How to play</button></div>
  <div class="row2 mrow" style="margin-top:8px">${PG.milestones?`<button class="btn2" id="mM">${MENU_ICON.mile}${PG.milestones.summary()}</button>`:''}${PG.career&&PG.career.hall?`<button class="btn2" id="mF">${MENU_ICON.hall}Hall of fame</button>`:''}</div></div>`;
    /* the offer is for the first look at the menu: any choice here answers it */
    const go = f => () => {
      if (camp) camp.seen();
      f();
    };
    $('#mC').onclick = go(() => PG.career ? PG.career.open() : showExh());
    $('#mSe').onclick = go(() => PG.season ? PG.season.open() : showExh());
    $('#mE').onclick = go(showExh);
    if (camp) $('#mT').onclick = go(camp.open);
    if (offer) {
      $('#oY').onclick = go(camp.open);
      $('#oN').onclick = go(showMenu);
    }
    $('#mS').onclick = showSettings;
    $('#mH').onclick = showHow;
    if (PG.milestones) $('#mM').onclick = PG.milestones.open;
    if ($('#mF')) $('#mF').onclick = go(() => PG.career.hall());
  }

  /* ---------- the team editor ----------
     Any team can be renamed on this device: its city, nickname, short name and two colors. The game ships with its own
     names; what you type is kept in this browser only (pg.teams) and goes nowhere else. A team whose nickname you
     change loses its recorded calls (the booth would still say the old one), so the commentators leave its name out. */
  const TEAM0 = TEAMS.map(t => ({ city: t.city, name: t.name, ab: t.ab, c1: t.c1, c2: t.c2 }));

  function applyTeams() {
    const o = load('pg.teams', {}) || {};
    TEAMS.forEach((t, i) => {
      Object.assign(t, TEAM0[i], o[i] || {});
      t.custom = !!o[i] && t.name !== TEAM0[i].name;
    });
  }
  applyTeams();

  function showTeams(sel, back) {
    back = back || showSettings;
    const o = load('pg.teams', {}) || {}, t = TEAMS[sel], clean = (v, n) => String(v || '').replace(/[<>&"]/g, '').trim().slice(0, n);
    scr.innerHTML = `<div class="menu read"><button class="back" id="bk">‹ Settings</button><h1 class="sm">Edit <em>teams</em></h1>
  <p class="tag">Rename any team on this device: what you type stays in this browser, and every mode (your career too) uses it. Pick a team, change it, save.</p>
  <div class="ted" style="--c:${t.c1}"><i></i><div><b>${esc(t.city)} ${esc(t.name)}</b><span>${esc(t.ab)} · ${PG.data.CONF[t.conf]} ${PG.data.DIV[t.div]}${o[sel] ? ' · renamed' : ''}</span></div></div>
  <div class="cols"><div><label class="lbl" for="tc">City</label><input id="tc" maxlength="16" autocomplete="off" value="${esc(t.city)}"></div>
  <div><label class="lbl" for="tn">Nickname</label><input id="tn" maxlength="14" autocomplete="off" value="${esc(t.name)}"></div></div>
  <div class="cols" style="margin-top:8px"><div><label class="lbl" for="ta">Short name</label><input id="ta" maxlength="3" autocomplete="off" value="${esc(t.ab)}"></div>
  <div class="cols"><div><label class="lbl" for="t1">Jersey</label><input id="t1" type="color" value="${t.c1}"></div><div><label class="lbl" for="t2">Trim</label><input id="t2" type="color" value="${t.c2}"></div></div></div>
  <div class="row2"><button class="go sm" id="tsv">Save</button><button class="btn2" id="trs"${o[sel] ? '' : ' disabled'}>Back to ${esc(TEAM0[sel].name)}</button></div>
  <h2>Teams</h2><div class="teams" id="tlist">${teamGrid(sel)}</div>
  ${Object.keys(o).length ? '<button class="btn2 warn" id="tra" style="margin-top:12px">Put every team back</button>' : ''}</div>`;
    $('#bk').onclick = () => back();
    scr.querySelectorAll('#tlist .tm').forEach(b => b.onclick = () => showTeams(+b.dataset.i, back));
    $('#tsv').onclick = () => {
      const v = { city: clean($('#tc').value, 16) || TEAM0[sel].city, name: clean($('#tn').value, 14) || TEAM0[sel].name, ab: clean($('#ta').value, 3).toUpperCase() || TEAM0[sel].ab, c1: $('#t1').value, c2: $('#t2').value };
      const same = Object.keys(v).every(k => v[k] === TEAM0[sel][k]);
      if (same) delete o[sel];
      else o[sel] = v;
      save('pg.teams', o);
      applyTeams();
      toast(same ? 'Back to the original' : 'Saved: ' + v.city + ' ' + v.name);
      showTeams(sel, back);
    };
    $('#trs').onclick = () => {
      delete o[sel];
      save('pg.teams', o);
      applyTeams();
      showTeams(sel, back);
    };
    if ($('#tra')) $('#tra').onclick = () => {
      save('pg.teams', {});
      applyTeams();
      toast('Every team is back to its own name');
      showTeams(sel, back);
    };
  }

  function showSettings() {
    const chip = (id, label, val) => `<div class="opt"><span>${label}</span><button class="chip" id="${id}">${val}</button></div>`;
    const draw = () => {
      scr.innerHTML = `<div class="menu read"><button class="back" id="bk">‹ Menu</button><h1 class="sm">Settings</h1>
  <h2>Look</h2>
  <div class="opt"><span>Accent color</span><div class="sw" id="acc">${Object.entries(ACCENTS).map(([k,c])=>`<button data-a="${k}" class="${k===SET.acc?'on':''}" style="--c:${c}" aria-label="${k} accent"></button>`).join('')}</div></div>
  ${chip('sgf','Graphics',R3?'3D':'Classic 2D')}
  ${R3?chip('spx','Sharpness',SET.px==='bal'?'Balanced':'High')+`<div class="opt"><span>Camera zoom</span><div class="step"><button class="chip" id="szo" aria-label="Zoom out">−</button><b>${zoomTxt()}</b><button class="chip" id="szi" aria-label="Zoom in">+</button></div></div>`+chip('scn','Camera before the snap',SET.cin===false?'Standard':'Cinematic')+chip('scut','Cutscenes',SET.cuts!==false?'On':'Off')+chip('ssh','Player shadows',SET.shad!==false?'On':'Off')+chip('sfx','Glow and color pass',SET.fx!==false?'On':'Off')+chip('sdt','Close-up player models',SET.detail!==false?'Detailed':'Simple'):''}
  ${chip('srp','Instant replays',SET.replay!==false?'On':'Off')}
  ${chip('slh','Buttons',SET.left?'Left side':'Right side')}
  <h2>Sound</h2>
  ${chip('svl','Volume',['Low','Medium','High'][SET.vol??2])}
  ${chip('ssn','Effects and crowd',SET.snd?'On':'Off')}
  ${chip('smu','Music',SET.mus?'On':'Off')}
  ${chip('san','Commentary',SET.ann!==false?'On':'Off')}
  <h2>Rules</h2>
  ${chip('spn','Penalties',SET.pen!==false?'On':'Off')}
  <h2>League</h2>
  <div class="opt"><span>Team names and colors</span><button class="chip" id="steams">Edit teams</button></div>
  <h2>Help</h2>
  ${chip('stp','Control tips',SET.tips&&Object.keys(SET.tips).length?'Show again':'On')}
  ${navigator.vibrate?chip('shp','Vibration',SET.hap!==false?'On':'Off'):''}</div>`;
      const on = (id, f) => {
        const el = $('#' + id);
        if (el) el.onclick = () => {
          f();
          save('pg.settings', SET);
          keepScroll(draw);
        }
      };
      $('#bk').onclick = showMenu;
      $('#steams').onclick = () => showTeams(0);
      scr.querySelectorAll('#acc button').forEach(b => b.onclick = () => {
        SET.acc = b.dataset.a;
        save('pg.settings', SET);
        applyTheme();
        keepScroll(draw);
      });
      on('sgf', () => {
        SET.gfx = R3 ? '2d' : '3d';
        setGfx(SET.gfx !== '2d');
      });
      on('spx', () => {
        SET.px = SET.px === 'bal' ? 'hi' : 'bal';
        resize();
      });
      on('szo', () => zoomBy(-1));
      on('szi', () => zoomBy(1));
      on('slh', () => {
        SET.left = !SET.left;
        applyTheme();
      });
      on('scn', () => {
        SET.cin = SET.cin === false;
      });
      on('scut', () => {
        SET.cuts = SET.cuts === false;
      });
      on('ssh', () => {
        SET.shad = SET.shad === false;
      });
      on('sfx', () => {
        SET.fx = SET.fx === false;
      });
      on('sdt', () => {
        SET.detail = SET.detail === false;
      });
      on('srp', () => {
        SET.replay = SET.replay === false;
      });
      on('svl', () => {
        SET.vol = ((SET.vol ?? 2) + 1) % 3;
        if (PG.audio) {
          PG.audio.refresh();
          PG.audio.play('chime');  // so you hear the new level
        }
      });
      on('ssn', () => {
        SET.snd = !SET.snd;
        if (PG.audio) PG.audio.refresh();
      });
      on('smu', () => {
        SET.mus = !SET.mus;
        if (PG.audio) PG.audio.refresh();
      });
      on('spn', () => {
        SET.pen = SET.pen === false;
      });
      on('san', () => {
        SET.ann = SET.ann === false;
        if (PG.audio) PG.audio.refresh();
      });
      on('shp', () => {
        SET.hap = SET.hap === false;
        if (SET.hap) buzz(30);
      });
      on('stp', () => {
        SET.tips = {};
      });
    };
    draw();
  }

  function showHow() {
    scr.innerHTML = `<div class="menu read"><button class="back" id="bk">‹ Menu</button><h1 class="sm">How to play</h1>
  <h2>Every play</h2><ul class="how"><li>Pick a play card. Routes are drawn on the field before the snap.</li><li>Drag anywhere on the field to move the player with the ring under him.</li><li>The pause button is under the scoreboard, and beside it − and + zoom the camera out and in.</li><li>Training camp on the menu teaches the controls in three short drills.</li></ul>
  <h2>Offense</h2><ul class="how"><li>Tap Snap. As quarterback, hold a lettered receiver or the matching button: a green bar fills with power. Let go to throw. A quick tap floats a lob, a full bar fires a bullet.</li><li>A tag under the field names every play: Run, Pass, Play action, Screen, RPO or Kick.</li><li>RPO plays are run-pass options: for the first second you may throw to a lettered receiver; do nothing and the back takes the ball. Watch the linebackers: if they step up, throw.</li><li>With the ball: hold Sprint, tap Juke or Spin to slip a tackle.</li><li>Power lowers the shoulder into a tackler in front of you, or throws a stiff arm at one beside you. Hurdle jumps a diving tackler, but a standing one can knock the ball loose.</li><li>Before the snap, tap a receiver\u2019s letter to change his route, Audible to step through other plays from the same formation, Flip to mirror the play.</li><li>Every team has its own offense (air raid, power run, pistol option, spread and more) and nine formations to call from, and coaches do not like to repeat themselves: expect a different look most snaps.</li><li>The Special tab has punts, field goals (stop the marker in the green), kneel and spike.</li><li>Hard count, before the snap, barks a fake snap count: now and then a defender jumps offside for five free yards, and once in a while your own lineman flinches instead. One try a play.</li><li>After your touchdown you choose: kick for one point, or one play from the 2-yard line for two. Trailing late, you can try an onside kick.</li><li>Time out (three a half) gives back the seconds that ran off after a play. Tap it right after the whistle or on the play-call sheet.</li></ul>
  <h2>Defense</h2><ul class="how"><li>Before the snap, Audible steps through the coverage calls. Switch jumps to the defender nearest the ball. Dive makes the tackle.</li><li>Hit is a short, hard lunge that can jar the ball loose but leaves you on the ground if you miss. Strip swipes at the ball: less sure as a tackle, more likely to force a fumble.</li><li>On a punt to you, Fair catch takes the ball where it lands with no return and no hit; a dropped punt is a live ball.</li><li>A fumble is a live ball: run to it and Dive on it before the other team does.</li><li>Flags are thrown now and then: false start, offside, holding and pass interference. Settings can turn penalties off.</li><li>Rain and snow make the ball harder to catch and easier to fumble, and field goals harder.</li><li>Stand where a pass will land to break it up or pick it off.</li></ul>
  <h2>Career</h2><ul class="how"><li>You play one player. The coach calls the plays and a card tells you your job.</li><li>Receivers and backs: follow the route on the field and tap Call when you are open.</li><li>Stats and goals earn XP. Spend it on ratings and abilities, and practice each week for a bonus.</li></ul>
  <h2>Keyboard</h2><ul class="how"><li>Arrows or WASD move. Space snaps and sprints. Hold 1–5 to build throw power, let go to throw.</li><li>J juke, K spin, L power, H hurdle, Q switch, E dive, F hit, R strip, T time out, V audible, X flip, G hard count, C call for the ball, P pause. Minus and equals (or the mouse wheel) zoom.</li></ul>
  <h2>Controller</h2><ul class="how"><li>Any controller your browser sees: plug it in or pair it and press a button. Left stick or d-pad moves, RT (R2) sprints, right stick zooms, Start pauses, View (Select) calls time out.</li><li>Before the snap: A snaps, Y is the hard count, LB audibles, RB flips the play.</li><li>Passing: each receiver's letter becomes a button, A, B, X, Y or RB. Hold it to build power and let go to throw.</li><li>Running: A power, B juke, X spin, Y hurdle. Defense: A dive, B switch, X hit, Y strip. As a receiver, A calls for the ball.</li><li>On the menus and the play-call sheet the d-pad moves a ring, A picks, B goes back, LB and RB change tabs, LT and RT page through the plays.</li></ul></div>`;
    $('#bk').onclick = showMenu;
  }

  function showExh() {
    let me = SET.me, opp = SET.opp, ql = SET.ql, diff = SET.diff, tod = SET.tod || 'night', wx = SET.wx || 'clear';
    if (opp === me) opp = (me + 1) % TEAMS.length;
    const draw = () => {
      G.tm = [me, opp];
      G.env = { time: tod, weather: wx };  // the stadium behind the menu shows the choice
      scr.innerHTML = `<div class="menu"><button class="back" id="bk">‹ Menu</button><h1 class="sm">Exhibition</h1>
  ${kitsHtml([[me, true, 'Home'], [opp, false, 'Away']])}
  <h2>Your team</h2><div class="teams" id="tms">${teamGrid(me)}</div>
  <h2>Opponent</h2><div class="row"><button class="nav" id="opl" aria-label="Previous opponent">‹</button>${tmBtn(TEAMS[opp],opp,false)}<button class="nav" id="opr" aria-label="Next opponent">›</button></div>
  <h2>Difficulty</h2><div class="seg" id="dif">${['Rookie','Pro','All-Pro'].map((d,i)=>`<button data-d="${i}" class="${i===diff?'on':''}">${d}</button>`).join('')}</div>
  <h2>Quarter length</h2><div class="seg" id="qls">${[60,120,180,300].map(q=>`<button data-q="${q}" class="${q===ql?'on':''}">${q/60} min</button>`).join('')}</div>
  <h2>Kickoff time</h2><div class="seg" id="tod">${[['day','Day'],['dusk','Dusk'],['night','Night']].map(([k,l])=>`<button data-v="${k}" class="${k===tod?'on':''}">${l}</button>`).join('')}</div>
  <h2>Weather</h2><div class="seg" id="wx">${[['clear','Clear'],['rain','Rain'],['snow','Snow']].map(([k,l])=>`<button data-v="${k}" class="${k===wx?'on':''}">${l}</button>`).join('')}</div>
  <button class="go" id="go">Kick off</button></div>`;
      const stepO = d => {
        do {
          opp = (opp + d + TEAMS.length) % TEAMS.length;
        } while (opp === me);
        keepScroll(draw);
      };
      scr.querySelectorAll('#tms .tm').forEach(b => b.onclick = () => {
        me = +b.dataset.i;
        if (opp === me) opp = (me + 1) % TEAMS.length;
        keepScroll(draw);
      });
      $('#opl').onclick = () => stepO(-1);
      $('#opr').onclick = () => stepO(1);
      $('#bk').onclick = showMenu;
      scr.querySelectorAll('#qls button').forEach(b => b.onclick = () => {
        ql = +b.dataset.q;
        keepScroll(draw);
      });
      scr.querySelectorAll('#dif button').forEach(b => b.onclick = () => {
        diff = +b.dataset.d;
        keepScroll(draw);
      });
      scr.querySelectorAll('#tod button').forEach(b => b.onclick = () => {
        tod = b.dataset.v;
        keepScroll(draw);
      });
      scr.querySelectorAll('#wx button').forEach(b => b.onclick = () => {
        wx = b.dataset.v;
        keepScroll(draw);
      });
      $('#go').onclick = () => {
        Object.assign(SET, { me, opp, ql, diff, tod, wx });
        save('pg.settings', SET);
        snd('whistle');
        startGame({ a: me, b: opp, ql, diff, env: { time: tod, weather: wx } });
      };
    };
    draw();
  }

  /* the teams' uniforms as small 3D portraits: [team index, home kit?, caption] each. Empty when 3D is off. */
  function kitsHtml(list) {
    if (!R3 || !R3.portrait) return '';
    const fig = ([ti, home, cap]) => {
      const url = R3.portrait(TEAMS[ti], home, home ? 12 : 21);
      return url ? `<figure><img src="${url}" alt="${TEAMS[ti].name} ${home?'home':'away'} uniform"><figcaption>${TEAMS[ti].ab} · ${cap}</figcaption></figure>` : '';
    };
    return `<div class="kits">${list.map(fig).join('<em>vs</em>')}</div>`;
  }

  /* Menu screens redraw themselves after every choice. This puts the page back where it was, so a tap half way down a
     long screen (a setting, a tab) does not throw it back to the top. */
  function keepScroll(draw) {
    const el = scr.querySelector('.menu'), y = el ? el.scrollTop : 0;
    draw();
    const n = scr.querySelector('.menu');
    if (n) n.scrollTop = y;
  }

  /* Career and Season pick the conditions for each game from the week, so a given week always looks the same:
     mostly clear nights and afternoons, some rain, snow late in the season and in the playoffs. */
  /* A league game's light and weather: the same for the same season and week (so a replayed game keeps them), and the
     home city's climate decides the weather (data.js CLIM). Under a roof it never rains or snows and the lights are
     always on; a cold city gets snow late in the season, a warm one never does. home: the home team's index. */
  function envFor(season, week, late, home) {
    let h = (season * 7919 + week * 104729 + 12345) >>> 0;
    const r = () => {
      h = (h * 1664525 + 1013904223) >>> 0;
      return h / 4294967296;
    };
    const time = ['night', 'day', 'dusk', 'day', 'night'][Math.floor(r() * 5)], k = r(), clim = home != null && TEAMS[home] ? TEAMS[home].clim : null;
    if (clim === 'dome') return { time: 'night', weather: 'clear', roof: true };
    const weather = clim === 'snow' ? (late ? (k < 0.36 ? 'snow' : k < 0.5 ? 'rain' : 'clear') : (k < 0.15 ? 'rain' : 'clear'))
      : clim === 'wet' ? (late ? (k < 0.32 ? 'rain' : k < 0.38 ? 'snow' : 'clear') : (k < 0.26 ? 'rain' : 'clear'))
      : clim === 'warm' ? (k < (late ? 0.12 : 0.2) ? 'rain' : 'clear')
      : late ? (k < 0.3 ? 'snow' : k < 0.45 ? 'rain' : 'clear') : (k < 0.16 ? 'rain' : k < 0.22 ? 'snow' : 'clear');
    return { time, weather };
  }

  function statTable() {
    const a = G.stats, row = (l, f) => `<tr><td>${f(a[0])}</td><td>${l}</td><td>${f(a[1])}</td></tr>`;
    return `<table class="st"><tr><th>${ab(0)}</th><th></th><th>${ab(1)}</th></tr>${row('Pass yards',x=>x.pass)}${row('Rush yards',x=>x.rush)}${row('Comp / att',x=>x.comp+' / '+x.att)}${row('Turnovers',x=>x.to)}</table>`;
  }

  function showHalf() {
    G.state = 'call';
    P = [];
    ps = null;
    setBrief('');
    snd('whistle', { long: true });
    if (!AUTO && !QUIET && PG.audio) PG.audio.halftime(true);  // the band takes the field
    vo(G.score[0] > G.score[1] ? 'half.lead' : G.score[0] < G.score[1] ? 'half.trail' : 'half.tie', { pri: 2 });
    analyst('a.half', 0.7, { big: true, ttl: 10 });
    const fh = (G.scores || []).filter(e => e.q <= 2);
    scr.innerHTML = `<div class="sheet fin"><div class="shd"><b>Halftime</b><span>${tname(G.poss)} get the ball</span></div><div class="sc">${G.score[0]} – ${G.score[1]}</div>
  ${statTable()}${G.lineFn?`<p class="note">You: ${G.lineFn(G.my)}</p>`:''}${scoringHtml(fh) || '<p class="note">No points in the first half.</p>'}${leadersHtml()}<button class="go" id="h2">Second half</button></div>`;
    $('#h2').onclick = startCall;
  }

  function showFinal() {
    const s = G.score, a = G.stats, won = s[0] > s[1], tie = s[0] === s[1];
    const row = (l, f) => `<tr><td>${f(a[0])}</td><td>${l}</td><td>${f(a[1])}</td></tr>`;
    scr.innerHTML = `<div class="sheet fin"><div class="shd"><b>${tie?'Final · tie':won?'You win':'Final'}</b><span>${G.ot?'Overtime':''}</span></div>
  <div class="sc">${s[0]} – ${s[1]}</div>
  <table class="st"><tr><th>${ab(0)}</th><th></th><th>${ab(1)}</th></tr>${row('Pass yards',x=>x.pass)}${row('Rush yards',x=>x.rush)}${row('Comp / att',x=>x.comp+' / '+x.att)}${row('Turnovers',x=>x.to)}</table>
  ${potgHtml()}${potdHtml()}${scoringHtml(G.scores)}${leadersHtml()}<button class="go" id="again">Back to menu</button></div>`;
    $('#again').onclick = showMenu;
    if ($('#potd')) $('#potd').onclick = () => watchPotd(showFinal);
  }

  /* ---------- rendering ---------- */
  function camUpd(dt, snapNow) {
    let fx = G.bx, fy = G.los, up = G.poss === 0;
    if (ps) {
      up = ps.offTeam === 0;
      fx = ps.bx;
      fy = ps.los;
      if (G.state === 'live' || G.state === 'kicka' || G.state === 'dead' || G.state === 'replay') {
        if (ps.air) {
          fx = ps.air.x;
          fy = ps.air.y;
        } else if (ps.carrier) {
          fx = ps.carrier.x;
          fy = ps.carrier.y;
          up = ps.carrier.team === 0;
        } else if (ps.fum && ps.loose) {
          // stay on the loose ball
          fx = ps.loose.x;
          fy = ps.loose.y;
        } else {
          fx = cam.fx;
          fy = cam.fy;
        }
      }
    }
    if (G.state === 'menu') fy = 50;
    cam.fx = fx;
    cam.fy = fy;
    cam.up = up;
    if (snapNow) cam.snap = true;
    const tx = lerp(FW / 2, fx, 0.8), ty = fy - (up ? 10.5 : 18), k = snapNow ? 1 : Math.min(1, dt * 4.5);
    cam.x += (tx - cam.x) * k;
    cam.y += (ty - cam.y) * k;
  }

  function pj(x, y, z = 0) {
    if (R3) return R3.project(x, y, z);
    const dx = x - cam.x, dy = y - cam.y, dz = z - CAMH, d = dy * CS - dz * SN;
    if (d < 1) return null;
    const s = F * (SET.zoom || 1) / d;
    return { x: W / 2 + dx * s, y: CY - (dy * SN + dz * CS) * s, s };
  }

  function quad(x0, y0, x1, y1, fill) {
    const a = pj(x0, y0), b = pj(x1, y0), c = pj(x1, y1), d = pj(x0, y1);
    if (!a || !b || !c || !d) return;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.lineTo(d.x, d.y);
    ctx.fill();
  }

  function gline(x0, y0, x1, y1, w, col, z0 = 0, z1 = 0) {
    const a = pj(x0, y0, z0), b = pj(x1, y1, z1);
    if (!a || !b) return;
    ctx.strokeStyle = col;
    ctx.lineWidth = Math.max(1, (a.s + b.s) / 2 * w);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  function gtext(t, x, y, size, col) {
    const p = pj(x, y), p2 = pj(x, y + 1);
    if (!p || !p2 || p.s < 2.5) return;
    const k = p.s * size / 40;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(k, k * (p.y - p2.y) / p.s);
    ctx.font = '800 40px Archivo,"Helvetica Neue",Arial,sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = col;
    ctx.fillText(t, 0, 0);
    ctx.restore();
  }

  function gpoly(x, y, rx, ry, fill, stroke, lw) {
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const a = i / 24 * 6.2832, q = pj(x + Math.cos(a) * rx, y + Math.sin(a) * ry);
      if (!q) return;
      i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
    }
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lw || 2;
      ctx.stroke();
    }
  }

  const crowd = Array.from({ length: 520 }, () => ({ x: rnd(), y: rnd(), c: pick(['#39476b', '#56648c', '#8a94b3', '#b7455a', '#5f86c9', '#2f3a5c']) }));

  function post(y) {
    const cx = FW / 2, c = '#e9edf5';
    gline(cx, y, cx, y, 0.22, c, 0, 3.3);
    gline(cx - 3.1, y, cx + 3.1, y, 0.2, c, 3.3, 3.3);
    gline(cx - 3.1, y, cx - 3.1, y, 0.18, c, 3.3, 13);
    gline(cx + 3.1, y, cx + 3.1, y, 0.18, c, 3.3, 13);
  }

  function drawField() {
    const hz = CY - F * Math.tan(PITCH), g = ctx.createLinearGradient(0, 0, 0, hz + 4);
    g.addColorStop(0, '#070b14');
    g.addColorStop(1, '#1c2742');
    ctx.fillStyle = g;
    ctx.fillRect(-8, -8, W + 16, hz + 12);
    const off = (cam.x - FW / 2) * 3;
    for (const d of crowd) {
      ctx.fillStyle = d.c;
      ctx.fillRect(((d.x * W * 1.4 - off) % (W * 1.4) + W * 1.4) % (W * 1.4) - W * 0.2, hz - 78 + d.y * 70, 3, 3);
    }
    ctx.fillStyle = '#16482a';
    ctx.fillRect(-8, hz, W + 16, H - hz + 8);
    const yN = Math.max(-13, cam.y - 16), t0 = TEAMS[G.tm[0]], t1 = TEAMS[G.tm[1]];
    quad(-12, yN, FW + 12, 116, '#1b5a30');
    for (let y = -10; y < 110; y += 5) {
      const a = Math.max(y, yN), b = y + 5;
      if (b <= yN) continue;
      quad(0, a, FW, b, y < 0 ? t0.c1 : y >= 100 ? t1.c1 : (Math.floor(y / 5) & 1 ? '#2f8f46' : '#2a8440'));
    }
    ctx.globalAlpha = 0.5;
    gpoly(FW / 2, 50, 5.5, 5.5, t0.c1, '#fff', 2);
    ctx.globalAlpha = 1;
    gtext(t0.ab, FW / 2, 50, 3.6, 'rgba(255,255,255,.9)');
    ctx.lineCap = 'butt';
    const wh = 'rgba(255,255,255,.92)';
    gline(0, Math.max(-10, yN), 0, 110, 0.25, wh);
    gline(FW, Math.max(-10, yN), FW, 110, 0.25, wh);
    for (let y = -10; y <= 110; y += 5) {
      if (y < yN) continue;
      gline(0, y, FW, y, y === 0 || y === 100 ? 0.3 : 0.14, wh);
    }
    const ya = Math.max(1, Math.ceil(cam.y - 12)), yb = Math.min(99, Math.floor(cam.y + 70));
    for (let y = ya; y <= yb; y++) {
      if (y % 5 === 0) continue;
      for (const hx of [FW / 2 - 3.1, FW / 2 + 3.1]) gline(hx - 0.3, y, hx + 0.3, y, 0.1, wh);
    }
    for (let y = 10; y <= 90; y += 10) {
      const n = String(y <= 50 ? y : 100 - y);
      gtext(n, 8, y, 3.2, 'rgba(255,255,255,.8)');
      gtext(n, FW - 8, y, 3.2, 'rgba(255,255,255,.8)');
    }
    gtext(t0.name.toUpperCase(), FW / 2, -5, 5, 'rgba(255,255,255,.85)');
    gtext(t1.name.toUpperCase(), FW / 2, 105, 5, 'rgba(255,255,255,.85)');
    if (G.state !== 'menu' && G.state !== 'over' && !(ps && ps.mode === 'ko')) {
      const L = ps ? ps.los : G.los, FD = ps ? ps.fd : G.fd;
      gline(0, L, FW, L, 0.22, '#4dabf7');
      if (FD > 0.1 && FD < 99.9) gline(0, FD, FW, FD, 0.22, '#ff7a2f');
    }
    post(110);
  }

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
    ctx.fill();
  }

  function isCtl(p) {
    if (AUTO || !ps) return false;
    if (G.lock) return p === G.me;
    return (ps.carrier === p && p.team === 0 && G.state === 'live') || (G.sel === p && (ps.offTeam === 1 || !!ps.fum) && (G.state === 'pre' || G.state === 'live'));
  }

  function drawPlayer(p) {
    const q = pj(p.x, p.y);
    if (!q || q.y < -40 || q.y > H + 60) return;
    const k = q.s * PS, t = TEAMS[G.tm[p.team]], home = p.team === 0;
    const jer = home ? t.c1 : '#f1f1f1', hel = home ? t.c2 : t.c1, pants = home ? t.c2 : t.c1, x = q.x, y = q.y, ctl = isCtl(p);
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath();
    ctx.ellipse(x, y, k * 0.55, k * 0.24, 0, 0, 7);
    ctx.fill();
    if (ctl) {
      ctx.strokeStyle = ACC;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(x, y, k * 0.8, k * 0.36, 0, 0, 7);
      ctx.stroke();
    }
    if (p.down) {
      ctx.fillStyle = jer;
      rr(x - k * 0.7, y - k * 0.45, k * 1.1, k * 0.5, k * 0.2);
      ctx.fillStyle = hel;
      ctx.beginPath();
      ctx.arc(x + k * 0.6, y - k * 0.22, k * 0.28, 0, 7);
      ctx.fill();
      return;
    }
    const mv = hyp(p.vx, p.vy) > 0.6 ? 1 : 0, sw = Math.sin(p.anim * 2.4) * 0.2 * k * mv, dv = p.dive > 0 ? k * 0.5 : 0;
    ctx.strokeStyle = pants;
    ctx.lineWidth = Math.max(1.5, k * 0.24);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - k * 0.16, y - k * 0.75 + dv);
    ctx.lineTo(x - k * 0.16 + sw, y - k * 0.06);
    ctx.moveTo(x + k * 0.16, y - k * 0.75 + dv);
    ctx.lineTo(x + k * 0.16 - sw, y - k * 0.06);
    ctx.stroke();
    ctx.fillStyle = jer;
    rr(x - k * 0.4, y - k * 1.55 + dv, k * 0.8, k * 0.88, k * 0.14);
    rr(x - k * 0.52, y - k * 1.62 + dv, k * 1.04, k * 0.36, k * 0.14);
    if (k > 13) {
      ctx.fillStyle = home ? t.c2 : t.c1;
      ctx.font = `700 ${k*0.42}px Archivo,Arial,sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.num, x, y - k * 1.08 + dv);
    }
    ctx.fillStyle = hel;
    ctx.beginPath();
    ctx.arc(x, y - k * 1.86 + dv, k * 0.31, 0, 7);
    ctx.fill();
    ctx.strokeStyle = home ? t.c1 : '#f1f1f1';
    ctx.lineWidth = Math.max(1, k * 0.09);
    ctx.beginPath();
    ctx.moveTo(x, y - k * 2.17 + dv);
    ctx.lineTo(x, y - k * 1.6 + dv);
    ctx.stroke();
    if (ps.carrier === p && !ps.air) {
      ctx.fillStyle = '#7a4a21';
      ctx.beginPath();
      ctx.ellipse(x + k * 0.46, y - k * 1.05 + dv, k * 0.2, k * 0.3, 0.4, 0, 7);
      ctx.fill();
    }
    drawTags(p, x, y - k * 2.35, ctl);
  }

  /* what floats over a player's head: the YOU tag or control arrow, and the receiver letters. Letters placed this frame
     are kept in TAGS, so in a bunch (three receivers a yard and a half apart) a letter that would sit on another is
     lifted above it instead, and each stays its own target. */
  const TAGS = [];

  function drawTags(p, x, ty, ctl) {
    if (ctl) {
      if (G.lock) {
        ctx.font = '800 9px Archivo,Arial,sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const w2 = ctx.measureText('YOU').width / 2 + 5;
        ctx.fillStyle = ACC;
        rr(x - w2, ty - 16, w2 * 2, 14, 4);
        ctx.fillStyle = '#06101f';
        ctx.fillText('YOU', x, ty - 8.5);
      } else {
        ctx.fillStyle = ACC;
        ctx.beginPath();
        ctx.moveTo(x, ty);
        ctx.lineTo(x - 5, ty - 9);
        ctx.lineTo(x + 5, ty - 9);
        ctx.fill();
      }
    }
    p.hx = undefined;
    if (p.let && ps.offTeam === 0 && (ps.mode === 'pass' || (ps.rpo && !ps.handoff)) && !ps.thrown && userP(ps.qb) && (G.state === 'pre' || G.state === 'live')) {
      let by = ty - 13;
      for (let n = 0; n < 4; n++) {
        const t = TAGS.find(t => Math.abs(t[0] - x) < 23 && Math.abs(t[1] - by) < 23);
        if (!t) break;
        by = t[1] - 25;
      }
      TAGS.push([x, by]);
      p.hx = x;
      p.hy = by;
      ctx.fillStyle = p.col;
      ctx.strokeStyle = '#0b0f18';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(x, by, 11, 0, 7);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#0b0f18';
      ctx.font = '800 12.5px Archivo,Arial,sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.let, x, by + 0.5);
      if (G.chg && ps.recs[G.chg.i] === p) {
        // the power you are building, as a green ring closing round his letter
        ctx.strokeStyle = '#3ddc84';
        ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.arc(x, by, 15, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(G.chg.t / CHARGE, 0.02, 1));
        ctx.stroke();
      }
    }
  }

  /* play art painted on the turf: the user's routes on offense, their assignment on defense */
  function drawArtField(alpha) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const poly = (pts, col, w) => {
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.globalAlpha = alpha;
      ctx.beginPath();
      let on = false, lastQ = null, prev = null;
      for (const [x, y] of pts) {
        const q = pj(x, y);
        if (!q) continue;
        if (on) ctx.lineTo(q.x, q.y);
        else ctx.moveTo(q.x, q.y);
        on = true;
        prev = lastQ;
        lastQ = q;
      }
      ctx.strokeStyle = 'rgba(4,10,20,.4)';
      ctx.lineWidth = w + 3;
      ctx.stroke();
      ctx.strokeStyle = col;
      ctx.lineWidth = w;
      ctx.stroke();
      if (lastQ && prev) {
        const an = Math.atan2(lastQ.y - prev.y, lastQ.x - prev.x);
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.moveTo(lastQ.x + Math.cos(an) * 8, lastQ.y + Math.sin(an) * 8);
        ctx.lineTo(lastQ.x + Math.cos(an + 2.3) * 8, lastQ.y + Math.sin(an + 2.3) * 8);
        ctx.lineTo(lastQ.x + Math.cos(an - 2.3) * 8, lastQ.y + Math.sin(an - 2.3) * 8);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    const solo = G.lock && G.me !== ps.qb;
    for (const p of P) {
      if (p.team !== 0 || (solo && p !== G.me)) continue;
      if (p.route && (ps.mode === 'pass' || ps.rpo || solo)) poly([[p.sx, p.sy], ...p.route.pts], solo ? ACC : p.col || '#fff', solo ? 4 : 3);
      if (p.path) poly([[p.sx, p.sy], ...p.path], '#ff9f43', 4);
    }
  }

  function drawAssign(me) {
    if (me.asg === 'zone') {
      ctx.globalAlpha = 0.32;
      gpoly(me.zx, me.zy, me.deep ? 8 : 6, me.deep ? 6 : 4.5, me.deep ? '#4dabf7' : '#ffffff');
      ctx.globalAlpha = 1;
    } else if (me.asg === 'man' && me.man) {
      const q = pj(me.man.x, me.man.y);
      gline(me.x, me.y, me.man.x, me.man.y, 0.1, 'rgba(213,155,255,.7)');
      if (q) {
        ctx.strokeStyle = '#d59bff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(q.x, q.y, q.s * PS * 0.85, q.s * PS * 0.38, 0, 0, 7);
        ctx.stroke();
      }
    } else if (me.asg === 'rush') gline(me.x, me.y, ps.qb.x, ps.qb.y, 0.12, 'rgba(255,107,107,.8)');
  }

  function render() {
    const top = scr.firstElementChild;
    if (top && top.classList.contains('solid')) return;  // a full screen is covering the field
    TAGS.length = 0;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (R3) {
      ctx.clearRect(0, 0, W, H);
      R3.render({ G, P, ps, cam, scene: G.state === 'scene' ? G.scene : null, teams: TEAMS, acc: ACC, shake, isCtl, down: G.dnTxt || '', plain: SET.cin === false, env: G.env, shadows: SET.shad !== false, fx: SET.fx !== false, zoom: SET.zoom, detail: SET.detail !== false, charge: G.chg && G.state === 'live' ? clamp(G.chg.t / CHARGE, 0, 1) : -1 }, FDT);
      if (shake > 0) shake -= FDT;
    } else {
      if (shake > 0) {
        shake -= FDT;
        ctx.translate(rnd(-3, 3), rnd(-3, 3));
      }
      drawField();
    }
    if (ps && !AUTO) {
      const me = G.me, lk = G.lock;
      if (ps.offTeam === 0 && (G.state === 'pre' || (G.state === 'live' && lk && me && me !== ps.qb && !ps.thrown && !ps.open))) drawArtField(G.state === 'pre' ? 0.85 : 0.45);
      if (lk && me && ps.offTeam === 1 && (G.state === 'pre' || (G.state === 'live' && !ps.open && !ps.air))) drawAssign(me);
    }
    if (ps && R3) {
      for (const p of P) {
        const q = pj(p.x, p.y, p.down ? 1.2 : 2.95);
        if (q) drawTags(p, q.x, q.y, isCtl(p));
      }
    } else if (ps) {
      const a = ps.air;
      if (a && !a.kick) {
        const q = pj(a.x1, a.y1), mine = G.lock && a.target && a.target === G.me;
        if (q) {
          ctx.strokeStyle = mine ? ACC : '#fff';
          ctx.lineWidth = mine ? 4 : 2;
          const pu = mine ? 1 + 0.15 * Math.sin(a.t * 18) : 1;
          ctx.beginPath();
          ctx.ellipse(q.x, q.y, q.s * 1.3 * pu, q.s * 0.6 * pu, 0, 0, 7);
          ctx.stroke();
        }
      }
      for (const p of [...P].sort((u, v) => v.y - u.y)) drawPlayer(p);
      const lb = ps.loose;
      if (!a && lb) {
        const b = pj(lb.x, lb.y, lb.z);
        if (b) {
          ctx.fillStyle = '#8a5326';
          ctx.beginPath();
          ctx.ellipse(b.x, b.y, Math.max(3, b.s * 0.42), Math.max(4.5, b.s * 0.62), lb.x * 3, 0, 7);
          ctx.fill();
        }
      }
      if (a) {
        const g = pj(a.x, a.y), b = pj(a.x, a.y, a.z);
        if (g && b) {
          ctx.fillStyle = 'rgba(0,0,0,.35)';
          ctx.beginPath();
          ctx.ellipse(g.x, g.y, g.s * 0.5, g.s * 0.22, 0, 0, 7);
          ctx.fill();
          ctx.fillStyle = '#8a5326';
          ctx.strokeStyle = '#fff';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.ellipse(b.x, b.y, Math.max(3, b.s * 0.42), Math.max(4.5, b.s * 0.62), a.t * 9, 0, 7);
          ctx.fill();
          ctx.stroke();
        }
      }
    }
    for (let i = FX.length - 1; i >= 0; i--) {
      const f = FX[i];
      f.t += FDT;
      if (f.t > 0.35) {
        FX.splice(i, 1);
        continue;
      }
      const q = pj(f.x, f.y);
      if (!q) continue;
      const r = 1 + f.t * 9;
      ctx.globalAlpha = 1 - f.t / 0.35;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(q.x, q.y - q.s, q.s * r, q.s * r * 0.45, 0, 0, 7);
      ctx.stroke();
      /* and what the hit kicks up: a few specks of turf (snow, when it is snowing) thrown out and falling back */
      ctx.fillStyle = G.env && G.env.weather === 'snow' ? '#eef4ff' : '#16210f';
      for (let j = 0; j < 7; j++) {
        const a = j * 0.9 + f.x * 3.1, k = 0.5 + (j % 3) * 0.3, u = f.t / 0.35;
        ctx.fillRect(q.x + Math.cos(a) * q.s * (0.3 + u * 1.5 * k) - 1, q.y - q.s * (0.2 + u * 1.9 * k - u * u * 1.5) - 1, 2.5, 2.5);
      }
      ctx.globalAlpha = 1;
    }
    if (!R3) post(-10);
    for (let i = CONF.length - 1; i >= 0; i--) {
      const c = CONF[i];
      c.x += c.vx * FDT;
      c.y += c.vy * FDT;
      c.a += FDT * 7;
      if (c.y > H + 10) {
        CONF.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.a);
      ctx.fillStyle = c.c;
      ctx.fillRect(-4, -2, 8, 4);
      ctx.restore();
    }
    if (stick.id !== null) {
      ctx.strokeStyle = 'rgba(255,255,255,.38)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(stick.ox, stick.oy, 36, 0, 7);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,.42)';
      ctx.beginPath();
      ctx.arc(stick.ox + stick.x * 36, stick.oy - stick.y * 36, 15, 0, 7);
      ctx.fill();
    }
    playTag();
    const pwEl = $('#pw'), pwOn = G.state === 'live' && (G.chg || G.pwShow);
    if (pwEl.hidden === !!pwOn) pwEl.hidden = !pwOn;
    if (pwOn) {
      const v = G.chg ? clamp(G.chg.t / CHARGE, 0, 1) : G.pwShow.pw, key = Math.round(v * 100);
      if (pwEl.dataset.v !== String(key)) {
        pwEl.dataset.v = key;
        $('#pwf').style.width = key + '%';
        $('#pwl').textContent = (v < 1 / 3 ? 'Lob ' : v < 2 / 3 ? 'Touch ' : 'Bullet ') + key;
      }
    }
    const ko = koMine(), m = $('#meter'), km = G.state === 'kickm' || ko;
    if (m.hidden === km) m.hidden = !km;
    if (ko && $('#mtxt').textContent !== 'Kickoff · swipe up, or stop in the green') $('#mtxt').textContent = 'Kickoff · swipe up, or stop in the green';  // the same bar as a field goal
    if (km) $('#ndl').style.left = (50 + 50 * Math.sin(G.meter * 4.2)) + '%';
  }

  /* ---------- what kind of play this is ----------
     A tag under the field for every snap: run, pass, play action, screen, run-pass option or kick, with the play's name.
     On defense it shows your own call before the snap, and a moment after it what the offense turned out to be doing
     (a fake takes longer to see through than a plain run). */
  const KIND = { run: 'Run', pass: 'Pass', pa: 'Play action', screen: 'Screen', rpo: 'RPO', kick: 'Kick', def: 'Defense' };
  const playKind = op => op.cat === 'special' ? 'kick' : op.rpo ? 'rpo' : op.run ? 'run' : op.pa ? 'pa' : Object.values(op.r || {}).some(r => /^screen/.test(r)) ? 'screen' : 'pass';
  let tagKey = '';

  function playTag() {
    const el = $('#ptype'), st = G.state, on = !!ps && !AUTO && (st === 'pre' || st === 'live' || st === 'kickm' || st === 'kicka');
    let k = '', txt = '';
    if (on) {
      if (ps.mode === 'ko') {
        k = 'kick';
        txt = ps.punt ? 'Punt return' : ps.offTeam === 0 && st === 'live' ? 'Kick return' : 'Kickoff';
      } else if (ps.offTeam === 0) {
        k = playKind(G.op);
        txt = k === 'rpo' && st === 'live' ? ps.thrown ? 'Thrown' : ps.handoff ? 'Handed off' : 'Throw or hand off' : G.op.n;  // while the option is live, the choice matters more than the name
      } else {
        const kind = playKind(G.op), seen = st === 'live' || st === 'kicka' ? ps.t > (kind === 'pa' || kind === 'screen' ? 1.1 : kind === 'rpo' ? RPO_T : 0.5) || kind === 'kick' : kind === 'kick';
        k = seen ? kind : 'def';
        txt = seen && kind === 'kick' ? G.op.n : G.dp.n;  // the badge says what they are doing; the words stay your own call
      }
    }
    const key = on ? k + '|' + txt : '';
    if (key === tagKey) return;
    tagKey = key;
    el.hidden = !on;
    if (!on) return;
    el.dataset.k = k;
    el.firstChild.textContent = KIND[k];
    el.lastChild.textContent = txt;
  }

  /* ---------- loop ---------- */
  function step(dt) {
    if (G.paused) return;
    SDT = dt;
    voClock += dt;
    readInput();
    if (pcOn()) {
      G.pc = (G.pc === undefined ? PC : G.pc) - dt;
      if (G.pc <= 0) delayOfGame();
    }
    const st = G.state;
    if (st === 'scene') {
      stepScene(dt);
      return;
    }
    if (st === 'intro') {
      G.introT += dt;
      /* the matchup stays up while the play-by-play man welcomes everybody in; a tap still skips it */
      const b = G.introT > 3.8 && G.introT < 7 && PG.audio && PG.audio.booth;
      if (G.introT > 3.8 && !(b && b.now && /^intro\.(?!away|home)/.test(b.now))) endIntro();
    } else if (st === 'pre') {
      G.preT += dt;
      jogIn(dt);
      if (ps.mot && !ps.mot.go && G.cadence && G.preT > 0.9 && !P.some(p => p.jog)) ps.mot.go = true;
      motionStep(dt);
      shiftStep(dt);
      if (!G.dcall && ps.mode !== 'ko' && G.preT > 0.08 && !P.some(p => p.jog)) {
        // the defense has seen the formation: most snaps, somebody calls it out before the quarterback starts
        G.dcall = true;
        if (Math.random() < 0.7) snd('calls', { x: ps.bx });
      }
      if (!G.cadence && ps.mode !== 'ko' && G.preT > 0.5 && !P.some(p => p.jog)) {
        // everyone is set: the quarterback calls it out ("Ready ... set"), and the "Hut!" comes with the snap
        G.cadence = true;
        snd('cadence', { x: ps.bx });
      }
      if (ps.mode === 'ko') {
        if (koMine() && !AUTO) {
          G.meter += dt;
          if (G.preT > 8) kickoffBy(0.82, 0);  // nobody swiped: a standard kick
        } else if (G.preT > 1.5) kickNow();
      } else {
        /* the computer snaps for itself, and for the user when their player is not the quarterback */
        const auto = AUTO || (G.lock ? G.me !== ps.qb : G.poss === 1), wait = AUTO ? 0.3 : G.drill && G.drill.script ? 5 : G.watch && !G.me ? 1.7 : G.lock && ps.mode !== 'kick' ? 3.4 : 2.2;
        const set = ((!ps.mot || ps.mot.ready) && (!ps.sh || ps.sh.ph === 'done')) || G.preT > wait + 8;  // a man in motion: the snap comes when he gets there (a jet, as he passes the ball); a shift: after the second set
        if ((auto && G.preT > wait && set) || (ps.mot && ps.mot.sweep && ps.mot.ready)) snap();  // a jet sweep is snapped on his timing, whoever is the quarterback
      }
    } else if (st === 'replay') replayStep(dt);
    else if (st === 'live') {
      if (G.chg) {
        // the bar fills while the letter is held; a hold well past full throws anyway, and a sack or a dead receiver cancels it
        const r = ps.recs[G.chg.i];
        if (!canPass() || !r || r.down) G.chg = null;
        else {
          G.chg.t += dt;
          if (G.chg.t > CHARGE + 1) endCharge();
        }
      }
      if (G.pwShow && (G.pwShow.t -= dt) <= 0) G.pwShow = null;
      tick(dt);
      record();
      if (inp.sprint && inp.manual) G.stam = Math.max(0, G.stam - dt / 3.2);
      else G.stam = Math.min(1, G.stam + dt / 6);
    } else if (st === 'kickm') G.meter += dt;
    else if (st === 'kicka') {
      kickTick(dt);
      if (ps && (ps.mode === 'ko' || ps.ret)) record();
    } else if (st === 'dead') {
      coast(dt);
      G.deadT -= dt;
      if (G.deadT <= 0) next();
    }
    if (G.ros && !AUTO && PG.audio) {
      const lv = crowdLevel();
      if (Math.abs(lv - (G.crowdLv || 0)) > 0.04) {
        G.crowdLv = lv;
        PG.audio.crowd.set(lv);
      }
    }
    camUpd(dt);
    if (G.ros) {
      updHud();
      setPad(padKind());
      const s = pad.querySelector('.spr');
      if (s) s.style.setProperty('--st', G.stam);
    }
  }

  /* after the whistle players ease to a stop instead of freezing mid-stride; after a touchdown the scorer's teammates
     who are near enough run to him instead and gather round (cosmetic: never in simulations) */
  function coast(dt) {
    if (!ps) return;
    const k = Math.pow(0.03, dt), b = ps.loose, cel = G.celeb && !AUTO && !QUIET && G.celeb.who && !G.celeb.who.down && ps.after > 0.35 ? G.celeb : null;
    if (b) bounce(b, dt);  // an incomplete pass bounces away
    ps.after = (ps.after || 0) + dt;
    if (ps.after < 0.8) record();
    for (const p of P) {
      if (p.down || p.fell) {
        if (p.sl > 0) {
          // the tackle's last yard
          p.sl -= dt;
          p.x += p.slx * dt;
          p.y += p.sly * dt;
          p.slx *= Math.pow(0.02, dt);
          p.sly *= Math.pow(0.02, dt);
        }
        continue;
      }
      const w = cel && p.team === cel.team && p !== cel.who ? cel.who : null;
      if (w && hyp(w.x - p.x, w.y - p.y) < 40) {
        // a place in a loose ring round him, each man his own (golden-angle spacing), the nearer ones closest
        const i = P.indexOf(p), a = i * 2.39996 + 0.7, r = 1.6 + (i % 3) * 0.7, tx = clamp(w.x + Math.cos(a) * r, 0.6, FW - 0.6), ty = w.y + Math.sin(a) * r;
        const dx = tx - p.x, dy = ty - p.y, d = hyp(dx, dy), spd = d > 0.35 ? Math.min(6.2, d * 1.8) : 0, e = 1 - Math.exp(-dt * 3.5);
        p.vx += ((d ? dx / d : 0) * spd - p.vx) * e;
        p.vy += ((d ? dy / d : 0) * spd - p.vy) * e;
        for (const q of P) {
          // and they keep an arm's length from each other (and from him)
          if (q === p || q.team !== p.team || q.down || q.fell) continue;
          const ox = p.x - q.x, oy = p.y - q.y, o = hyp(ox, oy);
          if (o > 0.01 && o < 1.1) {
            p.vx += ox / o * (1.1 - o) * 6 * dt * 10;
            p.vy += oy / o * (1.1 - o) * 6 * dt * 10;
          }
        }
      } else {
        p.vx *= k;
        p.vy *= k;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.anim += hyp(p.vx, p.vy) * dt;
      p.thrT -= dt;
      p.stun -= dt;
      p.dive -= dt;
      p.juke -= dt;
      p.spinT -= dt;
    }
  }

  /* 3D when the library and WebGL are available, the 2D canvas otherwise */
  function setGfx(on) {
    const gl = $('#gl');
    if (on && PG.r3d) {
      try {
        if (!gl.dataset.ok) {
          PG.r3d.init(gl);
          gl.dataset.ok = '1';
        }
        R3 = PG.r3d;
        gl.hidden = false;
        resize();
      } catch (e) {
        console.warn('3D renderer unavailable, using 2D', e);
        R3 = null;
        gl.hidden = true;
      }
    } else {
      R3 = null;
      gl.hidden = true;
    }
  }

  let last = 0, slow = 0;

  /* Nobody can test every phone, so the game watches its own frame rate. If play stays under about 40 frames a
     second for a few seconds it gives up the most expensive effect that is still on: first the glow pass, then
     the sharpness, then the shadows; a replay that drags gives up the detailed close-up models first. Each step is
     saved, and Settings can turn any of them back on. */
  function watchSpeed(raw) {
    if (!R3 || AUTO || window.PG_TEST || G.paused || document.hidden || raw > 0.25 || (G.state !== 'live' && G.state !== 'pre' && G.state !== 'replay')) return;
    slow = raw > 1 / 40 ? slow + 1 : Math.max(0, slow - 2);
    if (slow < 150) return;
    slow = 0;
    let what = '';
    if (G.state === 'replay' && SET.detail !== false) {
      SET.detail = false;
      what = 'simpler close-ups';
    } else if (SET.fx !== false) {
      SET.fx = false;
      what = 'glow pass off';
    } else if (SET.px !== 'bal') {
      SET.px = 'bal';
      resize();
      what = 'sharpness lowered';
    } else if (SET.shad !== false) {
      SET.shad = false;
      what = 'shadows off';
    }
    if (what) {
      save('pg.settings', SET);
      toast('Smoother play: ' + what);
    }
  }

  function frame(ts) {
    const raw = (ts - last) / 1000 || 0.016, dt = Math.min(0.034, raw);
    last = ts;
    FDT = dt;
    watchSpeed(raw);
    const n = window.FAST || 3;
    try {
      if (!AUTO) pollPad(dt);
      for (let i = 0; i < n; i++) if (i === 0 || window.FAST || (SET.wff && watching())) step(dt);  // fast forward: three steps a frame while you are only watching
      render();
    } catch (e) {
      console.error(e);
    }
    requestAnimationFrame(frame);
  }

  /* What the other files use: career.js, season.js, league.js, render3d.js and audio.js all go through PG. */
  const PG = Object.assign(window.PG, {
    TEAMS, NAMES: SUR, BASE, OFFR, DEFR, SET, CELEBS, rnd, pick, clamp, load, save, scr, $,
    startGame, showMenu, toMenu, banner, toast, snd, playScene, cinema, statTable, envFor, mkRoster, kitsHtml, watchPotd, keepScroll,
    vk, teamGrid, showTeams, inkOn,
    boot() {
      resize();
      setGfx(SET.gfx !== '2d');
      showMenu();
      requestAnimationFrame(frame);
    },
    /* test hooks: tools/harness.js drives the game through these */
    dbg: {
      set hang(v) {
        HANG = v;
      },
      auto(v) {
        AUTO = v;
      },
      seed(n) {
        SEEDED = !!n;
        SEED = n | 0;
      },
      step, render, startCall, resolveChallenge, playScene, endScene, skipDrive, watching,
      pad: dt => pollPad(dt || 0.016),  // one read of the controller (the test page fakes navigator.getGamepads)
      /* The play lab, for balancing the playbook: one offensive play run n times, headless, from first and ten at the
         35 (o.los, o.down, o.togo to change that) against the computer's defense or o.def, every other snap mirrored.
         Returns each snap's yards, the throw, and how it ended. It leaves a finished test game behind. */
      lab(name, n = 40, o = {}) {
        const op = OFF.find(p => p.n === name);
        if (!op) throw new Error('no play ' + name);
        const was = AUTO, out = [];
        AUTO = true;
        startGame({ a: o.a ?? 0, b: o.b ?? 3, ql: 900, env: { time: 'night', weather: o.wx || 'clear' } });  // the weather pinned: rain or snow would decide the numbers
        QUIET = true;
        try {
          for (let i = 0; i < n; i++) {
            Object.assign(G, { poss: 0, los: o.los ?? 35, down: o.down ?? 1, togo: o.togo ?? 10, bx: FW / 2, score: [0, 0], q: 1, clock: 900, try2: null, pendKO: null });
            G.fd = G.los + G.togo;
            G.op = op;
            G.dp = o.def ? DEFN(o.def) : cpuDef();
            G.flip = i % 2 === 1;
            const s0 = { ...G.stats[0] };
            setupPlay();
            if (o.prot) setProt(o.prot);  // a protection call to measure: 'left', 'right' or 'max'
            G.state = 'pre';
            snap();
            let k = 0;
            let held = 0;
            while (G.state === 'live' && k++ < 4000) {
              if (o.hold && ps && !ps.thrown && ps.t < 6) ps.think = 1;  // o.hold: the quarterback keeps the ball, to time how long the protection lasts
              if (ps) held = ps.t;
              if (o.hold && ps) for (const q of P) {
                if (q.eng) (q.wasEng = (q.wasEng || 0) + 1);
                if (q.block) (q.didBlock = (q.didBlock || 0) + 1);
              }
              tick(0.02);
            }
            const s1 = G.stats[0];
            const tg = ps && ps.tgt;
            out.push({ y: s1.rush - s0.rush + s1.pass - s0.pass, comp: s1.comp - s0.comp, att: s1.att - s0.att, last: G.last, def: G.dp.n, to: tg ? tg.role + ':' + tg.rn : null, t: held,
              by: o.hold && ps && ps.tackler ? ps.tackler.role + ':' + ps.tackler.asg + ':' + (ps.tackler.wasEng || 0) : null,
              extra: o.hold ? P.filter(q => q.team === 0 && !q.isOL && !q.route && q !== (ps && ps.qb)).map(q => q.role + ':' + (q.didBlock || 0)).join(' ') : null });
          }
        } finally {
          AUTO = was;
          QUIET = false;
          P = [];
          ps = null;
          G.state = 'over';
        }
        return out;
      },
      get G() {
        return G;
      },
      get ps() {
        return ps;
      },
      get P() {
        return P;
      },
      get goalLine() {
        return goalLine;
      }
    }
  });
})();
