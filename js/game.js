/* Pocket Gridiron: engine, rendering, exhibition UI. Classic script, exposes window.PG.
   Coordinates are yards: x 0..53.33 across, y 0..100 between goal lines. Team 0 (the user) attacks +y. */
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  const app = document.getElementById('app');
  app.innerHTML = `<canvas id="gl" hidden></canvas><canvas id="c"></canvas>
<div id="hud" hidden>
  <div class="bug">
    <div class="side" id="sd0"><i></i><b id="a0"></b><em></em><u id="s0">0</u></div>
    <div class="mid"><span id="qt">1st</span><b id="clk">3:00</b></div>
    <div class="side r" id="sd1"><i></i><b id="a1"></b><em></em><u id="s1">0</u></div>
  </div>
  <div class="sub"><button id="pz" aria-label="Pause"><span></span><span></span></button><div id="dn"></div></div>
  <div id="mine" hidden></div>
</div>
<div id="banner"></div><div id="toast"></div>
<div id="meter" hidden><p id="mtxt"></p><div class="bar"><i id="ndl"></i></div></div>
<div id="rp" hidden><i></i>Replay · tap to skip</div>
<div id="bl"><div id="tip" hidden></div><div id="brief" hidden></div></div>
<div id="pad"></div><div id="screen"></div><div id="ov" hidden></div>`;
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
  const { TEAMS, SUR, OLR, OLX, OFFR, DEFR, BASE, NUM, FORM, FNAME, ROUTES, RNAME, OFF, DPOS, DEF, LCOL, ORD } = window.PG.data;

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

  const kickoff = t => {
    setBall(t, t === 0 ? 25 : 75, FW / 2);
    G.pendKO = t;
  };  // the ball is spotted for a touchback; a live return can move it
  const ab = t => TEAMS[G.tm[t]].ab, tname = t => TEAMS[G.tm[t]].name;

  function spotTxt(y) {
    y = Math.round(y);
    return y === 50 ? 'the 50' : y < 50 ? ab(0) + ' ' + y : ab(1) + ' ' + (100 - y);
  }

  function downTxt() {
    if (G.try2 != null) return 'Two-point try';
    const goal = G.poss === 0 ? G.fd >= 99.9 : G.fd <= 0.1;
    return `${ORD[Math.min(3,G.down-1)]} & ${goal?'Goal':Math.max(1,Math.round(G.togo))} · ${spotTxt(G.los)}`;
  }

  /* Is this player under the user's hands right now? In career (lock) mode only the user's own player is. */
  const userP = p => !AUTO && !!p && p.team === 0 && (!G.lock || p === G.me);

  /* opt: {a,b,ql,diff,mode,lock,hero,ovr,mustWin,onEnd,onQuit} */
  function startGame(o) {
    const lock = o.lock || null, first = o.mode && o.mode !== 'exh' && rnd() < 0.5 ? 1 : 0;  // exhibition always opens with the user receiving
    G = { state: 'dead', mode: o.mode || 'exh', tm: [o.a, o.b], ros: [o.ros0 || mkRoster(o.a, 0, o.ovr && o.ovr[0]), mkRoster(o.b, [-6, 0, 5][o.diff ?? 1], o.ovr && o.ovr[1])],
      score: [0, 0], q: 1, ql: o.ql || 180, clock: o.ql || 180, stats: [0, 1].map(() => ({ pass: 0, rush: 0, comp: 0, att: 0, to: 0 })), stam: 1, pad: null, deadT: 0, ot: false, final: false,
      sel: null, me: null, preT: 0, meter: 0, lock, lockSide: lock ? (OFFR.includes(lock) ? 'off' : 'def') : null, first, drill: o.drill ? { n: o.drill, left: o.drill, side: o.side || (lock && !OFFR.includes(lock) ? 'def' : 'off'), script: o.script || null, dcall: o.dcall || null, title: o.title || 'Practice', reps: [] } : null, lineFn: o.line || null, goalsFn: o.goals || null, mustWin: !!o.mustWin, onEnd: o.onEnd || null, onQuit: o.onQuit || null, paused: false, last: '', box: {}, drive: null, potd: null, hl: null, rpEnd: null, pat: null, try2: null, introT: 0, to: [3, 3], runoff: 0, share: o.share === undefined ? 1 : o.share, possN: 0, benchN: -1, sit: false, env: o.env || { time: SET.tod || 'night', weather: SET.wx || 'clear' },
      my: { att: 0, comp: 0, pyd: 0, ptd: 0, pint: 0, car: 0, ryd: 0, rtd: 0, rec: 0, recyd: 0, rectd: 0, tgt: 0, tkl: 0, sack: 0, int: 0, pbu: 0 } };
    if (lock && o.hero) G.ros[0][lock] = o.hero;
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
      /* a few seconds over the stadium with the matchup on screen; a tap skips it */
      const e = G.env, t0 = TEAMS[o.a], t1 = TEAMS[o.b], when = { day: 'Afternoon', dusk: 'Dusk', night: 'Night' }[e.time] || 'Night', sky = { rain: 'Rain', snow: 'Snow' }[e.weather] || 'Clear';
      const line = e.weather === 'rain' ? 'It is raining, so hold on to the ball.' : e.weather === 'snow' ? 'Snow is falling.'
        : e.time === 'day' ? 'A beautiful afternoon for football.' : e.time === 'dusk' ? 'The sun is going down.' : 'A clear night for football.';
      G.state = 'intro';
      scr.innerHTML = `<button class="intro" id="intro"><div class="mu"><div style="--c:${t0.c1}"><b>${t0.ab}</b><span>${t0.name}</span></div><em>vs</em><div style="--c:${t1.c1}"><b>${t1.ab}</b><span>${t1.name}</span></div></div>
  <p>${when} · ${sky} · ${G.ql / 60}-minute quarters</p><small>Tap to skip</small></button>`;
      $('#intro').onclick = endIntro;
      say(`${t1.name} at ${t0.name}. ${line}`);
      if (PG.audio) PG.audio.weather(e.weather);
      return;
    } else banner('Kickoff', tname(first) + ' ball', 1500);
    if (PG.audio && !AUTO) PG.audio.weather(G.env.weather);
    startCall();
  }

  function endIntro() {
    if (G.state !== 'intro') return;
    scr.innerHTML = '';
    G.state = 'dead';
    banner('Kickoff', tname(G.first) + ' ball', 1500);
    cam.snap = true;
    startCall();
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
  /* punts are returned live when you run the whole team; simulations, practice and career games take a simulated return */
  const liveReturn = () => !AUTO && !QUIET && !G.lock && !G.drill;

  function setupPlay(shift) {
    const was = shift ? Object.fromEntries(P.map(p => [p.team + p.role, [p.x, p.y]])) : null, selRole = shift && G.sel ? G.sel.role : null;
    if (!shift) {
      G.sig = null;  // what the officials signal after the play: 'td', 'fd', 'inc'
      if (!G.drive || G.drive.team !== G.poss || G.drive.done) G.drive = { team: G.poss, plays: 0, y0: G.los, done: false };  // a new possession
      G.drive.plays++;
    }
    const off = G.poss, dir = off === 0 ? 1 : -1, op = G.op, dp = G.dp, bx = G.bx, los = G.los, fl = G.flip ? -1 : 1;
    G.dir = dir;
    P = [];
    const mk = (team, role, dx, dy) => mkP(team, role, clamp(bx + dx, 1, FW - 1), los + dir * dy);
    for (const r of OLR) mk(off, r, OLX[r], -0.6);
    const f = FORM[op.f], o = {};
    for (const r in f) o[r] = mk(off, r, f[r][0] * fl, f[r][1]);  // fl mirrors the formation when the play is flipped
    const kick = op.cat === 'special';
    ps = { t: 0, mode: kick ? 'kick' : op.cat === 'run' ? 'run' : 'pass', offTeam: off, qb: o.QB, carrier: o.QB, thrown: false, air: null, caught: false, handoff: false, open: false, turnover: false,
      think: 0, scr: false, runner: null, recs: [], pa: !!op.pa, los, fd: G.fd, bx, drop: { x: clamp(bx + (op.roll || 0) * fl, 4, FW - 4), y: los - dir * (op.f === 'gun' ? 7.5 : 6.5) }, kick: null, passer: null, tgt: null, tackler: null };
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
        if (ps.mode === 'pass') ps.recs.push(o[r]);
      }
    }
    ps.recs.sort((a, b) => a.x - b.x).forEach((p, i) => {
      p.let = 'ABCDE'[i];
      p.col = LCOL[i];
    });
    const el = P.filter(p => !p.isOL && p !== o.QB), byx = [...el].sort((a, b) => a.x - b.x), d = {};
    for (const r of DEFR) {
      let [dx, dy] = DPOS[r];
      const a = kick ? 'rush' : (dp.a[r] || 'rush');
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
    // line calls: each rusher (linemen first, outside in, then blitzers) gets the nearest free blocker across from him
    const rush = P.filter(p => p.team !== off && p.asg === 'rush').sort((a, b) => Math.abs(a.y - los) - Math.abs(b.y - los) || Math.abs(b.x - bx) - Math.abs(a.x - bx)), taken = new Set();
    for (const r of rush) {
      let b = null, bd = 1e9;
      for (const o of P) {
        if (!o.isOL || taken.has(o)) continue;
        const q = Math.abs(o.x - r.x);
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
    if (kick && op.n === 'Punt' && liveReturn()) {
      // the free safety drops back to field the punt
      const r = d.FS;
      r.x = FW / 2;
      r.y = clamp(los + dir * 40, 5, 95);
      r.asg = 'ret';
      ps.ret = r;
    }
    G.me = G.lock && !kick ? (P.find(p => p.team === 0 && p.role === G.lock) || null) : null;
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
      const w = r.pts[p.wp];
      if (seek(p, w[0], w[1], 1, true) < 0.7) p.wp++;
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
      if (o.team === p.team || o.down || o.eng || o.stun > 0 || cl.has(o)) continue;
      const dc = dist(o, prot);
      if (pro && !(o.asg === 'rush' || dc < 6)) continue;
      const s = dist(p, o) + dc * 0.6;
      if (s < bs) {
        bs = s;
        best = o;
      }
    }
    if (best && dist(p, best) < (pro ? 9 : 15)) {
      cl.add(best);
      let ux = prot.x - best.x, uy = prot.y - best.y;
      const l = hyp(ux, uy) || 1;
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
      if (a && a.target === p) seek(p, a.x1, a.y1, 1, true);
      else if (p.route && !(a && p.wp >= p.route.pts.length)) followRoute(p);
      else blockAI(p, cl);
      return;
    }
    if (p === ps.qb) {
      p.dvx = p.dvy = 0;
      return;
    }
    if (ps.mode === 'run' && !ps.handoff && p === ps.runner) {
      const w = p.path[p.pi];
      if (w && seek(p, w[0], w[1], 1, true) < 1) p.pi++;
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
    let i = r.wp;
    while (rem > 0 && i < rt.pts.length) {
      const w = rt.pts[i], d = hyp(w[0] - x, w[1] - y);
      if (d <= rem) {
        x = w[0];
        y = w[1];
        rem -= d;
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
  function throwTo(r, pt, type) {
    const q = ps.carrier;
    if (!q || ps.thrown) return;
    let tx, ty, T = 0.6, d;
    const sf = type === 'bullet' ? 1.22 : type === 'lob' ? 0.84 : 1, hf = type === 'bullet' ? 0.55 : type === 'lob' ? 1.45 : 1;
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
      const pr = pressure(q), err = d * 0.03 * (1 + (85 - (q.thr ?? q.rt)) * 0.03) * (pr ? 1.9 : 1);
      tx = clamp(tx + (rnd() - rnd()) * err, 1, FW - 1);
      ty = clamp(ty + (rnd() - rnd()) * err, -9, 109);
    } else {
      tx = pt.x;
      ty = pt.y;
      d = hyp(tx - q.x, ty - q.y);
      T = d / 20;
    }
    ps.air = { x0: q.x, y0: q.y, x1: tx, y1: ty, t: 0, T, h: (1.2 + d * 0.11) * hf, target: r, x: q.x, y: q.y, z: 1.8, dist: d };
    ps.thrown = true;
    ps.carrier = null;
    ps.passer = q;
    ps.tgt = r;
    q.thrT = 0.32;
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

  function carrierCtl(p, dt) {
    const user = userP(p);
    if (ps.mode === 'run' && !ps.handoff && p === ps.qb && ps.runner !== p) {
      seek(p, ps.runner.x, ps.runner.y, 0.7);
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

  const userOnD = () => !AUTO && G.state === 'live' && (!G.lock || !!G.me) && (ps.fum ? true : ps.carrier ? ps.carrier.team === 1 : !!(ps.air && ps.offTeam === 1));  // a loose ball is anyone's
  const canPass = () => !AUTO && G.state === 'live' && ps.mode === 'pass' && !ps.thrown && !ps.turnover && ps.carrier === ps.qb && userP(ps.qb) && (ps.qb.y - ps.los) * G.dir < 0.3;

  function resolvePass() {
    const a = ps.air, r = a.target, off = ps.offTeam, my = G.my, me = QUIET ? null : G.me, pm = !!me && ps.passer === me;
    ps.air = null;
    if (!r) {
      if (pm) my.att++;
      dropBall(a);
      finish('inc', 'Thrown away');
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
    let cp = dr > 2.2 ? 0 : (0.96 - clamp((2.6 - ndd) / 2.6, 0, 1) * 0.42) * (0.93 + ((r.cat ?? r.rt) - 70) * 0.005) - (dr > 1.2 ? 0.25 : 0) - Math.max(0, a.dist - 16) * 0.009;
    const ud = nd && nd === G.sel && off === 1 && !AUTO && ndd < 1.8;
    if (ud) cp -= 0.2;
    cp *= G.wx.cat;  // a wet or frozen ball is harder to hold
    let ip = ndd < 1.5 ? 0.38 * (1 + ((nd.bsk ?? nd.rt) - 75) * 0.02) : 0;
    if (dr > 2.2 && ndd < 1.6) ip = 0.4;
    if (ud) ip += 0.2;
    if (rnd() < cp) {
      ps.carrier = r;
      ps.caught = true;
      G.stats[off].comp++;
      G.stats[off].att++;
      credit(ps.passer, 'att', 1);
      credit(ps.passer, 'comp', 1);
      credit(r, 'rec', 1);
      openField(0.05, 0.3);
      snd('catch');
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
    if (!G.drill && G.try2 == null) G.clock = Math.max(0, G.clock - dt);  // no clock in practice or on a two-point try
    const off = ps.offTeam;
    if (ps.mode === 'run' && !ps.handoff) {
      const rn = ps.runner, dl = G.op.run.delay || 0;
      if (rn === ps.qb ? ps.t > (G.op.run.fast ? 0.1 : 0.45) : ps.t > dl + 0.3 && (G.op.run.toss || dist(rn, ps.qb) < 1.3 || ps.t > dl + 0.9)) {
        // a toss is pitched at once, so the defense sees it sooner
        ps.handoff = true;
        ps.carrier = rn;
        openField(0.24, 0.62);
      }
    }
    const cl = new Set(), c = ps.carrier, uod = userOnD(), me = AUTO ? null : G.me;
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
      if (ps.fum) {
        // a loose ball: everyone close goes for it, and dives when he is near enough
        const b = ps.loose, d = hyp(p.x - b.x, p.y - b.y);
        if (d < 15) {
          seek(p, b.x, b.y, 1, true);
          if (d < 2.3 && ps.fum.t > 0.3 && (AUTO || p !== G.sel)) {
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
    if (ps.fum && G.state === 'live' && scramble(dt)) return;
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
          if (rnd() < fum) {
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
          snd('hit', { power: pw });
          if (userP(c2) || o === G.sel || pw > 1.05) buzz(Math.round(14 + pw * 22));  // you feel the ones you are in, and the big ones
          if (pw > 1.05 && !QUIET && !AUTO && PG.audio) PG.audio.crowd.ooh(0.6);
          hitFx(c2.x, c2.y);
          if (ps.fum) {
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
              say('Fumble!', true);
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
        snd('hit', { power: moved === 'truck' ? 0.9 : 0.45 });
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

  /* The ball is loose. Anyone who reaches it can fall on it; a miss sends it squirting away again. Out of bounds, or
     three seconds with nobody on it, and it stays with the team that lost it. Returns true when the play is over. */
  function scramble(dt) {
    const b = ps.loose, f = ps.fum;
    f.t += dt;
    bounce(b, dt);
    if (b.x < 0 || b.x > FW || b.y < -10 || b.y > 110) return recover(null);
    if (f.t > 0.35 && b.z < 1.3) for (const p of P) {
      if (p.down || p.fell || p.stun > 0 || p.flat > 0 || (p === f.by && !f.muff) || hyp(p.x - b.x, p.y - b.y) > 1.15) continue;  // a returner may fall on his own muff; a tackled runner cannot
      const mine = !AUTO && p === G.sel && p.team === 0;  // the player you are steering is surer of it
      if (rnd() < (mine ? 0.8 : 0.5)) return recover(p);
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
    $('#p1').onclick = () => {
      G.pat = null;
      scr.innerHTML = '';
      const ok = rnd() < 0.96;
      if (ok) G.score[t]++;
      snd(ok ? 'chime' : 'whistle');
      toast(ok ? 'Extra point is good' : 'Extra point missed');
      say(ok ? 'The extra point is good.' : 'He missed the extra point!');
      hudKey = '';
      updHud();
      next();
    };
    $('#p2').onclick = () => {
      G.pat = null;
      G.try2 = t;
      G.pendKO = null;
      setBall(t, t === 0 ? 98 : 2, FW / 2);
      hudKey = '';
      startCall();
    };
  }

  /* how a two-point try ends: in the end zone or not. No yards, no clock, then the kickoff. */
  function finishTry(kind) {
    const off = ps.offTeam, c = ps.carrier, good = kind === 'td' && !!c && c.team === off;
    if (good) G.score[off] += 2;
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
      G.celeb = { team: off, who: c };
      react(off, 1.1, 3);
      if (off === 0) snd('chime');
    } else react(1 - off, 0.8, 2);
    snd('whistle');
    G.state = 'dead';
    G.deadT = 2;
    banner(G.last, good ? `${tname(off)} convert the try` : 'The try fails', 1800);
    say(good ? 'The two-point try is good!' : 'No good on the try.', true);
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
      say(got ? `Onside kick, and the ${tname(k)} recover it!` : `Onside kick. ${tname(1-k)} recover.`, true);
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

  function finish(kind, arg) {
    if (G.state !== 'live' && G.state !== 'kicka') return;
    if (G.try2 != null) return finishTry(kind);
    /* holding: now and then a good gain comes back. Ten yards from the old spot and the down is replayed. */
    if (flagsOn() && (kind === 'tackle' || kind === 'oob' || kind === 'td') && ps.mode !== 'ko' && ps.mode !== 'kick' && !ps.turnover && !ps.fum) {
      const who = ps.carrier, o = ps.offTeam, d = o === 0 ? 1 : -1;
      if (who && who.team === o && (who.y - ps.los) * d >= 4 && rnd() < 0.02) {
        const room = o === 0 ? ps.los : 100 - ps.los, yd = Math.min(10, Math.max(1, Math.floor(room / 2)));
        return flagAfter('Holding', o, ps.los - d * yd, ps.bx, false, `${yd} yards, replay the down`);
      }
    }
    const off = ps.offTeam, dir = G.dir, c = ps.carrier, los = ps.los, me = QUIET ? null : G.me;
    let big = '', sub = '', stop = false, score = false, rpGain = 0;
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
      if (t === 0 && !AUTO && !QUIET && !G.lock && !G.drill) G.pat = t;
      else if (wantsTwo(t)) {
        const ok = rnd() < 0.45;
        if (ok) G.score[t] += 2;
        tryTxt = ok ? ' · two-point try is good' : ' · two-point try fails';
      } else {
        const xp = rnd() < 0.96;
        if (xp) G.score[t]++;
        tryTxt = xp ? ' · extra point is good' : ' · extra point missed';
      }
      big = 'Touchdown!';
      G.sig = 'td';
      sub = tname(t) + (ps.mode === 'ko' ? (ps.punt ? ' · punt return' : ' · kick return') : '') + tryTxt;
      score = true;
      if (ps.mode === 'ko') {
        /* a return: no yards from scrimmage, nobody's turnover */
      } else if (t === off) addYds(off, Math.round(((t === 0 ? 100 : 0) - los) * dir), true);
      else {
        G.stats[off].to++;
        if (!ps.fum) {
          credit(c, 'int', 1);
          credit(ps.passer, 'pint', 1);
        }
      }
      credit(c, 'td', 1);
      if (t === off && ps.mode !== 'ko' && G.drive && !AUTO) {
        const d = G.drive, yd = Math.round(off === 0 ? 100 - d.y0 : d.y0);
        setTimeout(() => toast(`Drive: ${d.plays} play${d.plays === 1 ? '' : 's'}, ${yd} yards`), 900);
      }
      G.celeb = { team: t, who: c };
      kickoff(1 - t);
      confetti(t);
      if (t === 0) {
        buzz([40, 60, 40, 60, 90]);
        snd('horn');
        snd('fanfare');
      }
      react(t, 1.4, 5.5);
    } else if (kind === 'fumble') {
      const t = arg.team, f = ps.fum.forced, ez = t === 0 ? c.y <= 0 : c.y >= 100;
      stop = true;
      big = ps.fum.muff ? 'Muffed punt!' : 'Fumble!';
      sub = `${c.name} recovers for the ${tname(t)}` + (f ? ` · forced by ${f.name}` : '');
      G.stats[1 - t].to++;
      react(t, 1.2, 3);
      setBall(t, ez ? (t === 0 ? 20 : 80) : c.y, c.x);
    } else if (kind === 'tackle' || kind === 'oob') {
      const t = c.team, y = c.y, x = c.x;
      if (me && ps.tackler === me) G.my.tkl++;
      credit(ps.tackler, 'tkl', 1);
      if (ps.mode === 'ko') {
        stop = true;
        const ez = t === 0 ? y <= 0 : y >= 100, ry = Math.max(0, Math.round((y - ps.land) * dir));
        big = ez ? 'Touchback' : ps.punt ? 'Punt return' : 'Kick return';
        sub = ez ? tname(t) + ' ball' : `${c.name} · ${ry} yard${ry===1?'':'s'}`;
        setBall(t, ez ? (t === 0 ? 25 : 75) : y, x);
        if (ry >= 30) react(t, 0.8, 2.5);
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
        const ez = t === 0 ? y <= 0 : y >= 100;
        setBall(t, ez ? (t === 0 ? 20 : 80) : y, x);
      } else if (off === 0 ? y <= 0 : y >= 100) {
        G.score[1 - off] += 2;
        big = 'Safety!';
        sub = tname(1 - off) + ' +2';
        score = true;
        react(1 - off, 1.2, 3);
        setBall(1 - off, off === 0 ? 65 : 35, FW / 2);
      } else {
        const g = (y - los) * dir, gi = Math.round(g), sack = c === ps.qb && ps.mode === 'pass' && !ps.thrown && g < 0;
        addYds(off, gi, false, sack);
        stop = kind === 'oob';
        rpGain = gi;
        if (sack && me && ps.tackler === me) G.my.sack++;
        if (sack) credit(ps.tackler, 'sack', 1);
        sub = `${c.name} #${c.num}${ps.caught?' · catch':''}${kind==='oob'?' · out of bounds':''}`;
        if (sack) react(1 - off, 0.9, 2.2);
        else if (gi >= 15) react(off, 0.6 + Math.min(0.6, gi / 50), 2.6);
        else if (gi < 0) react(1 - off, 0.4, 1.5);
        if ((y - ps.fd) * dir >= 0) {
          setBall(off, y, x);
          big = 'First down';
          G.sig = 'fd';
          sub = `${gi}-yard ${ps.caught?'catch':'run'} · ${c.name}`;
          if (off === 0) {
            snd('chime');
            if (gi < 15) react(0, 0.45, 1.8);
          }
        } else {
          G.down++;
          G.los = clamp(y, 1, 99);
          G.bx = hash(x);
          G.togo = (ps.fd - G.los) * dir;
          big = sack ? 'Sack!' : gi > 0 ? `+${gi} yard${gi>1?'s':''}` : gi === 0 ? 'No gain' : `Loss of ${-gi}`;
        }
      }
    } else if (kind === 'fg') {
      const d = ps.kick.dist | 0;
      if (arg) {
        G.score[off] += 3;
        big = 'It’s good!';
        G.sig = 'td';
        sub = `${d}-yard field goal`;
        score = true;
        kickoff(1 - off);
        if (off === 0) snd('chime');
        react(off, 0.9, 3);
      } else {
        big = 'No good';
        G.sig = 'inc';
        sub = `${d}-yard attempt`;
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
    if ((kind === 'tackle' || kind === 'oob') && ps.fum) sub += ps.fum.muff ? ' · muffed, recovered' : ' · fumble, recovered';
    G.runoff = !stop && !score && !G.drill ? Math.min(13, G.clock) : 0;  // the clock keeps running after an in-bounds tackle (there is no clock in practice)
    G.clock -= G.runoff;
    cpuTimeout();
    if (G.ot && score) G.final = true;
    G.last = sub === 'Turnover on downs' ? sub : big;
    callPlay(kind, arg, big, sub, rpGain, c);
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
    G.deadT = score ? 2.6 : 1.7;
    banner(big, sub, G.deadT * 1000 - 150);
    updHud();
  }

  /* A timeout gives back the seconds that ran off after the last play. Three per half for each team. */
  function timeout(t) {
    if (!G.to || G.to[t] <= 0 || G.runoff <= 0 || G.drill) return false;
    G.to[t]--;
    G.clock += G.runoff;
    G.runoff = 0;
    hudKey = '';
    if (!AUTO && !QUIET) {
      snd('whistle');
      toast(`Timeout, ${tname(t)} · ${G.to[t]} left`);
      say(`Timeout, ${tname(t)}.`);
      updHud();
    }
    return true;
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

  /* A flag thrown during the play. The play does not count: the ball goes where the foul puts it, and the down is
     replayed, or it is a first down when the foul gives one. */
  function flagAfter(name, team, y, x, first, text) {
    const off = ps.offTeam, dir = off === 0 ? 1 : -1;
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
    react(1 - team, 0.6, 2);
    say(`Flag on the play. ${name}, ${tname(team)}. ${text}.`, true);
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
    react(1 - team, 0.4, 1.5);
    say(`Flag on the play. ${name}, ${tname(team)}. ${yd} yards.`, true);
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
          kickoff(rnd() < .5 ? 0 : 1);
          banner('Overtime', 'Next score wins', 1600);
        } else {
          G.final = true;
          return true;
        }
      } else {
        G.q++;
        G.clock = G.ql;
        banner('End of quarter', '', 1200);
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
    G.rpI = Math.max(0, REC.length - 270);
    G.celeb = null;
    $('#rp').lastChild.textContent = 'Play of the game · tap to skip';
    $('#rp').hidden = false;
    $('#banner').classList.remove('on');
  }

  function next() {
    keepHighlight();
    if (G.rp) {
      G.rp = false;
      if (REC.length > 50) return startReplay();
    }
    if (G.drill) {
      if (--G.drill.left <= 0) return endGame();
      const t = G.drill.side === 'off' ? 0 : 1;
      setBall(t, t === 0 ? 30 : 70, FW / 2);
      G.pendKO = null;
      G.score = [0, 0];
      return startCall();
    }  // practice: same spot every rep
    if (G.pat != null) return showPat();  // your touchdown: one point or two?
    if (advance()) return endGame();
    if (G.half) {
      G.half = false;
      return showHalf();
    }
    startCall();
  }

  /* Instant replay: every live frame is recorded (positions, pose flags, the ball); big plays are shown again
     at half speed from a low sideline camera. */
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

  function startReplay() {
    cam.snap = true;
    G.state = 'replay';
    G.rpI = Math.max(0, REC.length - 200);
    G.celeb = null;
    $('#rp').hidden = false;
    $('#banner').classList.remove('on');
    snd('throw');
  }

  function endReplay() {
    $('#rp').hidden = true;
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
    G.rpI += dt * 60 * 0.5;
    const i = Math.floor(G.rpI);
    if (i >= REC.length - 1) return endReplay();
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
      say(w === 0 ? `It ends in a tie, ${G.score[0]} all.` : `${tname(w > 0 ? 0 : 1)} win it, ${Math.max(G.score[0], G.score[1])} to ${Math.min(G.score[0], G.score[1])}.`, true);
    }
    if (G.onEnd) G.onEnd({ score: G.score.slice(), my: G.my, stats: G.stats, ot: G.ot, potg: playerOfGame(), potgHtml: potgHtml(), box: G.box, potdHtml: potdHtml(), drill: G.drill });
    else showFinal();
  }

  /* ---------- play calling ---------- */
  function cpuOff(t) {
    const toGoal = t === 0 ? 100 - G.los : G.los, ld = G.score[t] - G.score[1 - t];
    if (G.q === 4 && ld > 0 && G.down <= 3 && G.clock <= Math.max(0, 4 - G.down - G.to[1 - t]) * 40) return OFF.find(p => p.quick === 'kneel');  // ahead late: run it out
    if (G.down === 4) {
      const desp = G.q >= 4 && ld < 0 && G.clock < 100;
      if (toGoal + 17 <= 52 && !(desp && ld < -3)) return OFF.find(p => p.n === 'Field Goal');
      if (!(desp || (G.togo <= 1.5 && toGoal < 60))) return OFF.find(p => p.n === 'Punt');
    }
    let pr = G.togo > 7 ? 0.3 : G.togo < 3 ? 0.65 : 0.45;
    if (G.down >= 3 && G.togo > 4) pr = 0.12;
    // career: the coach leans on the user's position so they stay involved
    const star = G.lock && t === 0 && !AUTO ? G.lock : null;
    if (star === 'RB') pr = Math.max(pr, G.down >= 3 && G.togo > 6 ? 0.3 : 0.5);  // measured: at 0.6 a back's team scored too little to win
    else if (star === 'X') pr *= G.drill ? 0 : 0.5;
    const foe = G.lock && t === 1 && !AUTO ? G.lock : null;  // and the opponent tests a defender
    if (foe === 'MLB') pr = Math.min(0.75, pr + 0.15);
    else if (foe === 'CB1') pr *= 0.75;
    if (rnd() < pr) return pick(OFF.filter(p => p.cat === 'run' && (star !== 'RB' || p.run.who === 'RB') && (!p.short || G.togo <= 2)));
    const pc = rnd() < (G.togo > 8 ? 0.5 : 0.3) ? 'deep' : 'short';
    let list = OFF.filter(p => p.cat === pc);
    if (star === 'RB') {
      const withBack = list.filter(p => p.r && p.r.RB);
      if (withBack.length) list = withBack;
    }
    return pick(list);
  }

  const DEFN = n => DEF.find(d => d.n === n);
  const drillStep = () => G.drill.script[(G.drill.n - G.drill.left) % G.drill.script.length];

  /* the computer's coverage: goal line when a yard or the goal is at stake, deep shells on long yardage, otherwise one of the five base calls */
  function cpuDef() {
    const toGoal = G.poss === 0 ? 100 - G.los : G.los;
    if ((G.togo <= 1.5 || toGoal <= 3) && rnd() < 0.55) return DEFN('Goal Line');
    if (G.togo > 12 && rnd() < 0.35) return DEFN('Prevent');
    if (G.togo > 10.5 && rnd() < 0.3) return DEFN('Cover 4');
    return DEF[Math.floor(rnd(5))];
  }

  function startCall() {
    P = [];
    ps = null;
    G.me = null;
    G.celeb = null;
    G.state = 'call';
    updHud();
    setBrief('');
    if (G.pendKO != null) {
      const t = G.pendKO, k = 1 - t;  // t receives, k kicks
      if (!G.drill && lateAndBehind(k)) return k === 0 && !AUTO && !G.lock ? showOnside(k) : onside(k);  // your call, or the computer's (it always tries)
      G.pendKO = null;
      if (!AUTO && !G.lock && !G.drill) return beginKickoff(t);
    }
    if (G.drill && G.drill.script) {
      /* a guided drill: its script names the play for each rep */
      G.op = OFF.find(p => p.n === drillStep().p) || cpuOff(G.poss);
      G.dp = DEFN(G.drill.dcall) || cpuDef();
      return begin();
    }
    if (AUTO) {
      G.op = cpuOff(G.poss);
      G.dp = cpuDef();
      return begin();
    }
    if (G.lock) {
      if ((G.lockSide === 'off') !== (G.poss === 0)) return simDrives();
      if (G.share < 1 && !G.drill) {
        // not the starter: the coach decides drive by drive whether you go in
        if (G.benchN !== G.possN) {
          G.benchN = G.possN;
          G.sit = rnd() > G.share;
        }
        if (G.sit) return simDrives(true);
      }
      G.op = cpuOff(G.poss);
      G.dp = cpuDef();
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
    G.flip = false;
    G.audI = -1;
    setupPlay();
    G.preT = 0;
    if (G.op.cat === 'special') {
      const fg = G.op.n === 'Field Goal', d = Math.round(((G.poss === 0 ? 100 : 0) - G.los) * G.dir + 17);
      if (G.poss === 0 && !AUTO && !G.lock) {
        G.state = 'kickm';
        G.meter = rnd(3);
        $('#mtxt').textContent = fg ? `${d}-yard field goal · stop in the green` : 'Punt · stop in the green';
        return;
      }
      toast(fg ? `${d}-yard field goal attempt` : tname(G.poss) + ' punt');
    }
    G.state = 'pre';
    setBrief(briefTxt());
    if (!AUTO && PG.audio && ps.mode !== 'kick' && !G.drill) {
      const a = PG.audio, redZone = (G.poss === 0 ? 100 - G.los : G.los) < 20;
      if (G.poss === 1 && G.down >= 3) Math.random() < 0.5 ? a.crowd.chant(3) : a.crowd.clapBuild(2.4);
      else if (G.poss === 0 && (G.down === 3 || redZone) && Math.random() < 0.35) {
        a.play('organ');
        setTimeout(() => {
          if (G.state === 'pre') a.crowd.cheer(0.45, 0.9);  // the crowd answers the riff
        }, 1250);
      }
      if (G.down === 3 && Math.random() < 0.5) say(`Third down and ${Math.max(1, Math.round(G.togo))}.`);
      else if (G.down === 4) say('Fourth down.');
    }
  }

  function snap() {
    setBrief('');
    if (PG.audio) PG.audio.crowd.stopClaps();
    REC.length = 0;
    for (const p of P) if (p.jog) {
      p.x = p.sx;
      p.y = p.sy;
      p.vx = p.vy = 0;
      p.jog = 0;
    }
    if (ps.mode === 'kick') return doKick(rnd(0.55, 1));
    if (flagsOn()) {
      // once in a long while somebody jumps
      const r = rnd();
      if (r < 0.011) return flag('False start', ps.offTeam);
      if (r < 0.02) return flag('Offside', 1 - ps.offTeam);
    }
    G.state = 'live';
    ps.t = 0;
    snd('snap');
  }

  function doKick(acc) {
    const off = G.poss, dir = G.dir, los = ps.los, k = ps.qb;
    let x1, y1, T, h;
    if (G.op.n === 'Field Goal') {
      const d = ((off === 0 ? 100 : 0) - los) * dir + 17, thr = clamp(0.22 + Math.max(0, d - 22) * 0.019, 0.22, 0.96), good = acc >= thr + G.wx.kick && d <= 63, sg = rnd() < .5 ? -1 : 1;
      x1 = FW / 2 + sg * (good ? (1 - acc) * 3.5 : 4.4 + rnd(3));
      y1 = (off === 0 ? 110 : -10) + dir * 10;
      T = 1.5 + d * 0.014;
      h = 7 + d * 0.07;
      ps.kick = { type: 'fg', arg: good, dist: d };
    } else {
      const d = 30 + acc * 20 + rnd(-3, 3), y = los + dir * d, x = clamp(ps.bx + rnd(-12, 12), 4, FW - 4), tb = off === 0 ? y >= 99 : y <= 1;
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
  }

  let HANG = 1;  // extra hang time, in seconds, on a punt that will be returned live

  function kickTick(dt) {
    const a = ps.air;
    a.t += dt;
    const s = Math.min(1, a.t / a.T);
    a.x = lerp(a.x0, a.x1, s);
    a.y = lerp(a.y0, a.y1, s);
    a.z = 0.3 + a.h * 4 * s * (1 - s);
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
        const muff = rnd() < (ps.fair ? 0.01 : 0.015 + (near < 2.5 ? 0.035 : 0)) * G.wx.fum;
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
            say('He dropped it!', true);
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
    KO_MID.forEach((r, i) => mkP(recv, r, 10 + i * (FW - 20) / 3, own + dir * 31));
    mkP(recv, 'RB', FW / 2 - 6, own + dir * 14);
    const ret = mkP(recv, 'Z', FW / 2, own + dir * 4);
    const ly = own + dir * rnd(-2, 10), lx = clamp(FW / 2 + rnd(-12, 12), 6, FW - 6);
    ps = { t: 0, mode: 'ko', offTeam: recv, qb: null, carrier: null, thrown: false, air: null, caught: false, handoff: true, open: true, turnover: true, think: 0, scr: false, runner: null, recs: [], pa: false,
      los: ky, fd: ky, bx: FW / 2, drop: null, kick: null, passer: null, tgt: null, tackler: null, ret, land: ly, ko: { x: lx, y: ly, tb: (ly - own) * dir < 0 } };
    G.state = 'pre';
    G.preT = 0;
    camUpd(0, true);
    toast('Kickoff');
    updHud();
  }

  function kickNow() {
    const k = ps.ko, d = Math.abs(k.y - ps.los);
    REC.length = 0;
    ps.air = { x0: FW / 2, y0: ps.los, x1: k.x, y1: k.y, t: 0, T: 2.6 + d * 0.016, h: 15, kick: true, x: FW / 2, y: ps.los, z: 0 };
    G.state = 'kicka';
    snd('kick');
  }

  /* Career: play the snaps the user's unit is not on the field for, headless, until their unit is back on. */
  /* Plays out drives nobody is controlling: the other unit's, or (own = true) one drive of your own unit that the
     coach has you watching from the sideline. */
  function simDrives(own) {
    const was = AUTO, t = G.poss, s0 = G.score.slice(), n0 = G.possN;
    let plays = 0, over = false, guard = 0;
    AUTO = true;
    QUIET = true;
    while (!over && guard++ < 300 && (own ? G.possN === n0 : (G.lockSide === 'off') !== (G.poss === 0))) {
      if (G.poss === t) plays++;
      G.op = cpuOff(G.poss);
      G.dp = cpuDef();
      if (G.op.quick) quickPlay();
      else {
        setupPlay();
        G.state = 'pre';
        snap();
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
      sub = G.last || '';
    }
    G.state = 'dead';
    G.deadT = 2.3;
    banner(big, own ? 'You watched this one from the sideline' : sub, 2100);
    updHud();
    if (pts >= 6 && mine) {
      confetti(0);
      snd('fanfare');
      react(0, 1.2, 4);
    } else if (pts >= 6) react(1, 1, 3);
    else if (pts === 0 && !mine) react(0, 0.5, 2);
  }

  function briefTxt() {
    const me = G.me;
    if (G.drill && G.drill.script && !AUTO) {
      const s = drillStep();
      return `<b>${s.h || (G.poss === 0 ? G.op.n : 'Defense')}</b><span>${s.say}</span>`;
    }
    if (!G.lock || !me) return '';
    let t;
    if (ps.offTeam === 0) {
      if (me === ps.qb) return '';
      if (ps.mode === 'run') t = me === ps.runner ? 'You get the ball. Follow your blocks.' : me.route ? 'Sell the route, then block downfield.' : 'Lead the way and block.';
      else t = me.route ? `Run your ${RNAME[me.rn]} route. Tap Call when you are open.` : 'Stay in and pass block.';
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

  /* Changes at the line of scrimmage. On offense Audible steps through four standby plays and Flip mirrors the play;
     on defense Audible steps through the coverage calls. The other side does not get to answer. */
  const AUDIBLES = ['Inside Zone', 'Slants', 'Four Verticals', 'HB Draw'];

  function audible(flipIt) {
    if (G.state !== 'pre' || !ps || ps.mode === 'kick' || ps.mode === 'ko' || P.some(p => p.jog)) return;
    const mine = G.lock ? G.me && G.me === ps.qb : G.poss === 0;
    if (mine) {
      if (flipIt) G.flip = !G.flip;
      else {
        do G.audI = (G.audI + 1) % AUDIBLES.length;
        while (AUDIBLES[G.audI] === G.op.n);
        G.op = OFF.find(p => p.n === AUDIBLES[G.audI]);
        G.flip = false;
      }
      setupPlay(true);
      setBrief(briefTxt());
      toast(flipIt ? 'Flipped: ' + G.op.n : 'Audible: ' + G.op.n);
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
      if (G.state === 'intro') {
        endIntro();
        return;
      }
      if (G.state === 'replay') {
        endReplay();
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
    if (k === 'num') {
      if (canPass()) {
        if (ps.recs[n]) throwTo(ps.recs[n]);
      } else if (userOnD()) {
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
    if (!ps) return 'none';
    const lk = G.lock, me = G.me;
    if (G.state === 'pre') {
      if (ps.mode === 'kick' || ps.mode === 'ko') return 'none';
      if (lk) return me && me === ps.qb ? 'snap' : me ? 'ready' : 'none';
      return G.poss === 0 ? 'snap' : 'defpre';
    }
    if (G.state === 'kickm') return 'kick';
    if (G.state === 'kicka') return ps.mode === 'kick' && ps.ret && ps.ret.team === 0 && !ps.fair && ps.air && !ps.kick.arg.tb ? 'fair' : 'none';  // your returner is under a punt
    if (G.state === 'live') {
      const c = ps.carrier;
      if (ps.fum) return userOnD() ? 'loose' : 'none';
      if (c && userP(c)) return canPass() ? 'pass' : 'carry';
      if (userOnD()) return lk ? 'deflock' : 'def';
      if (lk && me && ps.offTeam === 0 && !ps.turnover && !me.down && me !== ps.qb) return me.route && ps.mode === 'pass' && !ps.thrown ? 'route' : 'offball';
    }
    return 'none';
  }

  const TIPS = { snap: 'Tap Snap to start. Tap a receiver\u2019s letter to change his route. Audible changes the play, Flip mirrors it.', pass: 'Tap a letter for a bullet pass. Hold it for a lob.', carry: 'Drag to run. Juke or Spin slips a tackle, Power runs through one, Hurdle clears a diver.',
    def: 'Drag to chase the ball. Dive or Hit to tackle, Strip goes for the ball, Switch changes player.', deflock: 'Drag to chase the ball. Dive or Hit to tackle, Strip goes for the ball.', route: 'Follow your route. Tap Call when you are open.',
    offball: 'Drag to block for the ball carrier.', timeout: 'Time out stops the clock: you get back the seconds that just ran off.', fair: 'Fair catch: the ball is yours where it lands, with no return and no hit. Tap it if tacklers are closing in.', loose: 'Loose ball! Run to it and Dive on it.', ready: 'Tap Ready, or wait for the snap.', kick: 'Tap Kick when the marker is in the green.', defpre: 'Switch picks the defender you control. Audible changes the coverage.' };
  let tipT;

  function tip(kind) {
    const el = $('#tip'), t = TIPS[kind];
    clearTimeout(tipT);
    const coached = !!(G.drill && G.drill.script);
    if (!t || AUTO || (!coached && SET.tips && SET.tips[kind] >= 2)) {
      el.hidden = true;
      return;
    }
    if (!coached) {
      SET.tips = SET.tips || {};
      SET.tips[kind] = (SET.tips[kind] || 0) + 1;
      save('pg.settings', SET);
    }
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
      B('SNAP', 'big', () => act('main'));
      if (ps && ps.mode !== 'kick') {
        B('Audible', '', () => act('audible'));
        B('Flip', '', () => act('flip'));
      }
    } else if (kind === 'ready') B('READY', 'big', () => act('main'));
    else if (kind === 'kick') B('KICK', 'big', () => act('main'));
    else if (kind === 'pass') ps.recs.forEach((r, i) => {
      let tm = null;  // a quick tap is a bullet, holding the button floats a lob
      const go = type => {
        if (canPass() && ps.recs[i]) throwTo(ps.recs[i], null, type);
      };
      B(r.let, 'rc', () => {
        tm = setTimeout(() => {
          tm = null;
          go('lob');
        }, 210);
      }, () => {
        if (tm) {
          clearTimeout(tm);
          tm = null;
          go('bullet');
        }
      }).style.background = r.col;
    });
    else if (kind === 'carry') {
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
    else if (kind === 'loose') {
      spr();
      B('Dive', '', () => act('dive'));
    }
    /* three buttons side by side reach further across the screen: the tip box and the play card give them room */
    const bs = [...pad.children];
    app.classList.toggle('pad3', bs.length > 2 && Math.max(...bs.map(b => b.offsetLeft + b.offsetWidth)) - Math.min(...bs.map(b => b.offsetLeft)) > 150);
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
    if (e.code === 'KeyF') act('hit');
    if (e.code === 'KeyR') act('strip');
    if (e.code === 'KeyT') act('timeout');
    if (e.code === 'KeyV') act('audible');
    if (e.code === 'KeyX') act('flip');
    if (e.code === 'KeyC') act('call');
    if (e.code === 'Escape' || e.code === 'KeyP') G.paused ? closePause() : openPause();
  });
  addEventListener('keyup', e => {
    keys[e.code] = 0;
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
    if (canPass()) for (const r of ps.recs) if (r.hx !== undefined && hyp(x - r.hx, y - r.hy) < 30) {
      throwTo(r);
      return;
    }
    if (G.state === 'pre' && ps.mode === 'pass' && userP(ps.qb) && !P.some(p => p.jog)) for (const r of ps.recs) if (r.hx !== undefined && hyp(x - r.hx, y - r.hy) < 26) {
      hotRoute(r);
      return;
    }
    if (stick.id === null && (G.state === 'live' || G.state === 'pre')) {
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
    inp.x = x;
    inp.y = y;
    inp.manual = hyp(x, y) > 0.18;
    inp.sprint = !!(G.sprintBtn || keys.ShiftLeft || (keys.Space && G.state === 'live'));
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
    try {
      navigator.vibrate(pattern);
    } catch (_) {}
  }

  /* the announcer; silent in simulations */
  function say(text, urgent) {
    if (AUTO || QUIET || !PG.audio) return;
    PG.audio.say(text, urgent);
  }

  /* His call for the play that just ended. Which line he picks is cosmetic, so it uses Math.random and never the
     game's own generator: a seeded test run must not change because someone is listening. */
  function callPlay(kind, good, big, sub, gain, c) {
    if (AUTO || QUIET || !PG.audio) return;
    const any = a => a[Math.floor(Math.random() * a.length)], team = c ? TEAMS[G.tm[c.team]] : null, who = c ? c.name : '';
    let line = '', urgent = true;
    if (kind === 'td') line = any([`Touchdown, ${team.name}!`, `${who} scores! Touchdown, ${team.city}!`, `He is in! Touchdown ${team.name}!`]);
    else if (kind === 'fumble') line = any([`${tname(c.team)} ball!`, `${who} falls on it. ${tname(c.team)} ball!`]);
    else if (ps && ps.fum && (kind === 'tackle' || kind === 'oob')) line = any(['They get it back.', `${tname(c.team)} keep the ball.`]);
    else if (big === 'Interception!') line = any(['Intercepted!', `Picked off by ${who}!`, `${team.name} take it away!`]);
    else if (big === 'Sack!') line = any(['Sacked!', 'They get to the quarterback. Sack!']);
    else if (big === 'Safety!') line = 'Safety! Two points.';
    else if (kind === 'fg') line = good ? any(['The kick is good.', 'Right down the middle. Three points.']) : any(['No good!', 'He missed it.']);
    else if (sub === 'Turnover on downs') line = 'They are stopped. Turnover on downs.';
    else if (gain >= 25) line = any([`What a play! ${gain} yards.`, `${who} breaks loose for ${gain}!`]);
    else if (big === 'First down' && gain >= 12) {
      line = any([`${gain} yards and a first down.`, `First down, ${team.name}.`]);
      urgent = false;
    } else if (kind === 'inc' && Math.random() < 0.25) {
      line = any(['Incomplete.', 'Falls incomplete.', 'Nobody home.']);
      urgent = false;
    }
    if (line) PG.audio.say(line, urgent);
  }

  /* the home crowd is on the user's side: it cheers what is good for team 0 and groans at the rest */
  function react(goodFor, size, dur) {
    if (AUTO || QUIET) return;
    if (goodFor === 0 && R3) R3.cheer(size);
    const a = PG.audio;
    if (!a) return;
    if (goodFor === 0) a.crowd.cheer(size, dur);
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
    const s = Math.ceil(G.clock), ko = !!ps && ps.mode === 'ko', ln = G.lineFn ? G.lineFn(G.my, G.drill) : '', k = [G.score, G.q, s, G.poss, G.down, G.togo | 0, G.los | 0, ko, ln, G.drill && G.drill.left, G.drill && G.drill.reps.length, G.to].join();
    if (k === hudKey) return;
    hudKey = k;
    const mine = $('#mine');
    mine.hidden = !ln;
    mine.textContent = ln;
    $('#s0').textContent = G.score[0];
    $('#s1').textContent = G.score[1];
    $('#qt').textContent = G.q > 4 ? 'OT' : ORD[G.q - 1];
    $('#clk').textContent = G.drill ? Math.min(G.drill.n, G.drill.n - G.drill.left + 1) + '/' + G.drill.n : Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
    if (G.drill) $('#qt').textContent = 'Rep';
    G.dnTxt = ko ? (ps.punt ? 'Punt return' : 'Kickoff') : downTxt();
    $('#dn').textContent = G.dnTxt;
    for (const t of [0, 1]) $('#a' + t).dataset.to = G.drill ? '' : '●'.repeat(G.to[t]) + '○'.repeat(3 - G.to[t]);
    $('#sd0').classList.toggle('has', G.poss === 0);
    $('#sd1').classList.toggle('has', G.poss === 1);
  }

  function toMenu() {
    if (PG.audio) PG.audio.scene('menu');
    clearTimeout(tipT);
    $('#tip').hidden = true;
    G = menuState(G.tm);
    P = [];
    ps = null;
    FX.length = 0;
    $('#hud').hidden = true;
    pad.innerHTML = '';
    app.classList.remove('pad3');
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
        : `<div class="dlg"><h3>Paused</h3>${G.goalsFn?`<ul class="gl" style="margin:0 0 6px">${G.goalsFn(G.my).map(g=>`<li class="${g.ok?'ok':'no'}"><span>${g.d}</span></li>`).join('')}</ul>`:''}<button class="go sm" id="pr">Resume</button><button class="btn2" id="psn">Sound: ${SET.snd?'on':'off'}</button><button class="btn2" id="pan">Announcer: ${SET.ann!==false?'on':'off'}</button><button class="btn2 warn" id="pq">${G.drill?'Leave drill':'Leave game'}</button></div>`;
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
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && G.ros && G.state !== 'over' && !AUTO && !window.PG_TEST) openPause();
  });  // PG_TEST: screenshots in the test pane hide the page

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

  /* side: 'off' (exhibition offense), 'def' (exhibition defense), 'qb' (career quarterback: coach sends three plays) */
  function showCall(side) {
    let cat = G.down === 4 ? 'special' : 'run';
    const cats = [['run', 'Run'], ['short', 'Short'], ['deep', 'Deep'], ['special', 'Special']].filter(c => G.try2 == null || c[0] !== 'special');  // no kicks on a two-point try
    let qb = null;
    if (side === 'qb') {
      const rest = OFF.filter(p => p.cat !== 'special' && p !== G.op);
      qb = [G.op, pick(rest.filter(p => p.cat === 'run')), pick(rest.filter(p => p.cat !== 'run'))];
    }
    const draw = () => {
      const list = side === 'off' ? OFF.filter(p => p.cat === cat) : side === 'qb' ? qb : DEF;
      scr.innerHTML = `<div class="sheet"><div class="shd"><b>${side==='def'?'Set the defense':side==='qb'?'Coach sends in':'Call your play'}</b><span>${downTxt()}</span></div>${G.runoff>0&&G.to[0]>0&&!G.lock&&!G.drill?`<button class="btn2" id="tmo" style="margin:0 0 8px">Time out · get ${Math.round(G.runoff)} seconds back · ${G.to[0]} left</button>`:''}${side==='off'?`<div class="tabs">${cats.map(([k,l])=>`<button data-c="${k}" class="${k===cat?'on':''}">${l}</button>`).join('')}</div>`:''}<div class="grid">${list.map((p,i)=>`<button class="card">${side==='qb'&&i===0?'<em>Coach’s pick</em>':''}<canvas></canvas><b>${p.n}</b><small>${p.d||FNAME[p.f]||''}</small></button>`).join('')}</div></div>`;
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
      });
      const tmo = $('#tmo');
      if (tmo) tmo.onclick = () => {
        timeout(0);
        draw();
      };
    };
    draw();
  }

  const tmBtn = (t, i, on) => `<button class="tm ${on?'on':''}" data-i="${i}" style="--c:${t.c1}"><i></i><b>${t.city}</b><span>${t.name}</span><u>${t.ovr}</u></button>`;

  function showMenu() {
    if (G.state === 'menu') G.env = null;  // the stadium behind the menus is always a clear night
    toMenu();
    const cs = PG.career && PG.career.summary(), camp = PG.camp, offer = !!camp && camp.fresh() && !cs && !(PG.season && PG.season.summary());
    scr.innerHTML = `<div class="menu"><h1>Pocket<br><em>Gridiron</em></h1><p class="tag">Full 11-on-11 football, built for one hand.</p>
  ${offer?'<div class="offer"><b>First time here?</b><span>Training camp teaches passing, running and tackling in three short drills.</span><div class="row2"><button class="go sm" id="oY">Start camp</button><button class="btn2" id="oN">Not now</button></div></div>':''}
  <button class="mode main" id="mC"><b>Career</b><span>${cs||'Create a player, lock in at your position, and build a legacy one season at a time.'}</span><i>›</i></button>
  <button class="mode" id="mSe"><b>Season</b><span>${(PG.season&&PG.season.summary())||'Take one team through seven games and the playoffs.'}</span><i>›</i></button>
  <button class="mode" id="mE"><b>Exhibition</b><span>Pick two teams and play one game.</span><i>›</i></button>
  ${camp?`<button class="mode" id="mT"><b>Training camp</b><span>${camp.summary()}</span><i>›</i></button>`:''}
  <div class="row2"><button class="btn2" id="mS">Settings</button><button class="btn2" id="mH">How to play</button></div></div>`;
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
  }

  function showSettings() {
    const chip = (id, label, val) => `<div class="opt"><span>${label}</span><button class="chip" id="${id}">${val}</button></div>`;
    const draw = () => {
      scr.innerHTML = `<div class="menu"><button class="back" id="bk">‹ Menu</button><h1 class="sm">Settings</h1>
  <h2>Look</h2>
  <div class="opt"><span>Accent color</span><div class="sw" id="acc">${Object.entries(ACCENTS).map(([k,c])=>`<button data-a="${k}" class="${k===SET.acc?'on':''}" style="--c:${c}" aria-label="${k} accent"></button>`).join('')}</div></div>
  ${chip('sgf','Graphics',R3?'3D':'Classic 2D')}
  ${R3?chip('spx','Sharpness',SET.px==='bal'?'Balanced':'High')+chip('scv','Camera',SET.camv==='close'?'Close':SET.camv==='high'?'High':'Standard')+chip('scn','Camera before the snap',SET.cin===false?'Standard':'Cinematic')+chip('ssh','Player shadows',SET.shad!==false?'On':'Off')+chip('sfx','Glow and color pass',SET.fx!==false?'On':'Off')+chip('sdt','Close-up player models',SET.detail!==false?'Detailed':'Simple'):''}
  ${chip('srp','Instant replays',SET.replay!==false?'On':'Off')}
  ${chip('slh','Buttons',SET.left?'Left side':'Right side')}
  <h2>Sound</h2>
  ${chip('ssn','Effects and crowd',SET.snd?'On':'Off')}
  ${chip('smu','Music',SET.mus?'On':'Off')}
  ${chip('san','Announcer',SET.ann!==false?'On':'Off')}
  <h2>Rules</h2>
  ${chip('spn','Penalties',SET.pen!==false?'On':'Off')}
  <h2>Help</h2>
  ${chip('stp','Control tips',SET.tips&&Object.keys(SET.tips).length?'Show again':'On')}
  ${navigator.vibrate?chip('shp','Vibration',SET.hap!==false?'On':'Off'):''}</div>`;
      const on = (id, f) => {
        const el = $('#' + id);
        if (el) el.onclick = () => {
          f();
          save('pg.settings', SET);
          draw();
        }
      };
      $('#bk').onclick = showMenu;
      scr.querySelectorAll('#acc button').forEach(b => b.onclick = () => {
        SET.acc = b.dataset.a;
        save('pg.settings', SET);
        applyTheme();
        draw();
      });
      on('sgf', () => {
        SET.gfx = R3 ? '2d' : '3d';
        setGfx(SET.gfx !== '2d');
      });
      on('spx', () => {
        SET.px = SET.px === 'bal' ? 'hi' : 'bal';
        resize();
      });
      on('scv', () => {
        SET.camv = SET.camv === 'close' ? 'high' : SET.camv === 'high' ? 'std' : 'close';
      });
      on('slh', () => {
        SET.left = !SET.left;
        applyTheme();
      });
      on('scn', () => {
        SET.cin = SET.cin === false;
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
    scr.innerHTML = `<div class="menu"><button class="back" id="bk">‹ Menu</button><h1 class="sm">How to play</h1>
  <h2>Every play</h2><ul class="how"><li>Pick a play card. Routes are drawn on the field before the snap.</li><li>Drag anywhere on the field to move the player with the ring under him.</li><li>The pause button is under the scoreboard.</li><li>Training camp on the menu teaches the controls in three short drills.</li></ul>
  <h2>Offense</h2><ul class="how"><li>Tap Snap. As quarterback, tap a lettered receiver or the matching button to throw.</li><li>With the ball: hold Sprint, tap Juke or Spin to slip a tackle.</li><li>Power lowers the shoulder into a tackler in front of you, or throws a stiff arm at one beside you. Hurdle jumps a diving tackler, but a standing one can knock the ball loose.</li><li>Tap a letter for a bullet pass, hold it for a lob. Before the snap, tap a receiver\u2019s letter to change his route, Audible to step through four standby plays, Flip to mirror the play.</li><li>The Special tab has punts, field goals (stop the marker in the green), kneel and spike.</li><li>After your touchdown you choose: kick for one point, or one play from the 2-yard line for two. Trailing late, you can try an onside kick.</li><li>Time out (three a half) gives back the seconds that ran off after a play. Tap it right after the whistle or on the play-call sheet.</li></ul>
  <h2>Defense</h2><ul class="how"><li>Before the snap, Audible steps through the coverage calls. Switch jumps to the defender nearest the ball. Dive makes the tackle.</li><li>Hit is a short, hard lunge that can jar the ball loose but leaves you on the ground if you miss. Strip swipes at the ball: less sure as a tackle, more likely to force a fumble.</li><li>On a punt to you, Fair catch takes the ball where it lands with no return and no hit; a dropped punt is a live ball.</li><li>A fumble is a live ball: run to it and Dive on it before the other team does.</li><li>Flags are thrown now and then: false start, offside, holding and pass interference. Settings can turn penalties off.</li><li>Rain and snow make the ball harder to catch and easier to fumble, and field goals harder.</li><li>Stand where a pass will land to break it up or pick it off.</li></ul>
  <h2>Career</h2><ul class="how"><li>You play one player. The coach calls the plays and a card tells you your job.</li><li>Receivers and backs: follow the route on the field and tap Call when you are open.</li><li>Stats and goals earn XP. Spend it on ratings and abilities, and practice each week for a bonus.</li></ul>
  <h2>Keyboard</h2><ul class="how"><li>Arrows or WASD move. Space snaps and sprints. 1–5 pass.</li><li>J juke, K spin, L power, H hurdle, Q switch, E dive, F hit, R strip, T time out, V audible, X flip, C call for the ball, P pause.</li></ul></div>`;
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
  <h2>Your team</h2><div class="teams" id="tms">${TEAMS.map((t,i)=>tmBtn(t,i,i===me)).join('')}</div>
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
        draw();
      };
      scr.querySelectorAll('#tms .tm').forEach(b => b.onclick = () => {
        me = +b.dataset.i;
        if (opp === me) opp = (me + 1) % TEAMS.length;
        draw();
      });
      $('#opl').onclick = () => stepO(-1);
      $('#opr').onclick = () => stepO(1);
      $('#bk').onclick = showMenu;
      scr.querySelectorAll('#qls button').forEach(b => b.onclick = () => {
        ql = +b.dataset.q;
        draw();
      });
      scr.querySelectorAll('#dif button').forEach(b => b.onclick = () => {
        diff = +b.dataset.d;
        draw();
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

  /* redraw a menu without losing the scroll position */
  function keepScroll(draw) {
    const el = scr.querySelector('.menu'), y = el ? el.scrollTop : 0;
    draw();
    const n = scr.querySelector('.menu');
    if (n) n.scrollTop = y;
  }

  /* Career and Season pick the conditions for each game from the week, so a given week always looks the same:
     mostly clear nights and afternoons, some rain, snow late in the season and in the playoffs. */
  function envFor(season, week, late) {
    let h = (season * 7919 + week * 104729 + 12345) >>> 0;
    const r = () => {
      h = (h * 1664525 + 1013904223) >>> 0;
      return h / 4294967296;
    };
    const time = ['night', 'day', 'dusk', 'day', 'night'][Math.floor(r() * 5)], k = r();
    const weather = late ? (k < 0.3 ? 'snow' : k < 0.45 ? 'rain' : 'clear') : (k < 0.16 ? 'rain' : k < 0.22 ? 'snow' : 'clear');
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
    say(`That is the half. ${tname(0)} ${G.score[0]}, ${tname(1)} ${G.score[1]}.`, true);
    scr.innerHTML = `<div class="sheet fin"><div class="shd"><b>Halftime</b><span>${tname(G.poss)} get the ball</span></div><div class="sc">${G.score[0]} – ${G.score[1]}</div>
  ${statTable()}${G.lineFn?`<p class="note">You: ${G.lineFn(G.my)}</p>`:''}<button class="go" id="h2">Second half</button></div>`;
    $('#h2').onclick = startCall;
  }

  function showFinal() {
    const s = G.score, a = G.stats, won = s[0] > s[1], tie = s[0] === s[1];
    const row = (l, f) => `<tr><td>${f(a[0])}</td><td>${l}</td><td>${f(a[1])}</td></tr>`;
    scr.innerHTML = `<div class="sheet fin"><div class="shd"><b>${tie?'Final · tie':won?'You win':'Final'}</b><span>${G.ot?'Overtime':''}</span></div>
  <div class="sc">${s[0]} – ${s[1]}</div>
  <table class="st"><tr><th>${ab(0)}</th><th></th><th>${ab(1)}</th></tr>${row('Pass yards',x=>x.pass)}${row('Rush yards',x=>x.rush)}${row('Comp / att',x=>x.comp+' / '+x.att)}${row('Turnovers',x=>x.to)}</table>
  ${potgHtml()}${potdHtml()}<button class="go" id="again">Back to menu</button></div>`;
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
    const s = F / d;
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

  /* what floats over a player's head: the YOU tag or control arrow, and the receiver letters */
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
    if (p.let && ps.offTeam === 0 && ps.mode === 'pass' && !ps.thrown && userP(ps.qb) && (G.state === 'pre' || G.state === 'live')) {
      const by = ty - 13;
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
      if (p.route && (ps.mode === 'pass' || solo)) poly([[p.sx, p.sy], ...p.route.pts], solo ? ACC : p.col || '#fff', solo ? 4 : 3);
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
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (R3) {
      ctx.clearRect(0, 0, W, H);
      R3.render({ G, P, ps, cam, teams: TEAMS, acc: ACC, shake, isCtl, down: G.dnTxt || '', plain: SET.cin === false, env: G.env, shadows: SET.shad !== false, fx: SET.fx !== false, camv: SET.camv, detail: SET.detail !== false }, FDT);
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
    const m = $('#meter'), km = G.state === 'kickm';
    if (m.hidden === km) m.hidden = !km;
    if (km) $('#ndl').style.left = (50 + 50 * Math.sin(G.meter * 4.2)) + '%';
  }

  /* ---------- loop ---------- */
  function step(dt) {
    if (G.paused) return;
    SDT = dt;
    readInput();
    const st = G.state;
    if (st === 'intro') {
      G.introT += dt;
      if (G.introT > 3.8) endIntro();
    } else if (st === 'pre') {
      G.preT += dt;
      jogIn(dt);
      if (ps.mode === 'ko') {
        if (G.preT > 1.5) kickNow();
      } else {
        /* the computer snaps for itself, and for the user when their player is not the quarterback */
        const auto = AUTO || (G.lock ? G.me !== ps.qb : G.poss === 1);
        if (auto && G.preT > (AUTO ? 0.3 : G.drill && G.drill.script ? 5 : G.lock && ps.mode !== 'kick' ? 3.4 : 2.2)) snap();
      }
    } else if (st === 'replay') replayStep(dt);
    else if (st === 'live') {
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

  /* after the whistle players ease to a stop instead of freezing mid-stride */
  function coast(dt) {
    if (!ps) return;
    const k = Math.pow(0.03, dt), b = ps.loose;
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
      p.vx *= k;
      p.vy *= k;
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
    const n = window.FAST || 1;
    try {
      for (let i = 0; i < n; i++) step(dt);
      render();
    } catch (e) {
      console.error(e);
    }
    requestAnimationFrame(frame);
  }

  /* What the other files use: career.js, season.js, league.js, render3d.js and audio.js all go through PG. */
  const PG = Object.assign(window.PG, {
    TEAMS, NAMES: SUR, BASE, OFFR, DEFR, SET, rnd, pick, clamp, load, save, scr, $,
    startGame, showMenu, toMenu, banner, toast, snd, statTable, envFor, mkRoster, kitsHtml, watchPotd,
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
      step, render,
      get G() {
        return G;
      },
      get ps() {
        return ps;
      },
      get P() {
        return P;
      }
    }
  });
})();
