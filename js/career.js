/* Pocket Gridiron: career mode. Create one player, play only their snaps, earn XP, upgrade, and move
   through seasons. The engine (game.js) handles the locked-player controls and simulates the drives
   the player's unit is not on the field for; this file owns the save, the league and the screens. */
(() => {
  'use strict';
  const { TEAMS, BASE, rnd, pick, clamp, load, save, scr, $ } = PG;
  const KEY = 'pg.career.v1';
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => Math.round(n).toLocaleString('en-US');

  /* role: the engine slot the player takes. attrs: [key,label]. w: overall weights. arch: starting builds. */
  const POS = {
    QB: { role: 'QB', base: 'QB', label: 'Quarterback', attrs: [['thr', 'Accuracy'], ['pow', 'Arm power'], ['spd', 'Speed'], ['elu', 'Elusiveness']], w: [.4, .3, .15, .15],
      arch: [['Field General', { thr: 76, pow: 70, spd: 64, elu: 62 }], ['Gunslinger', { thr: 68, pow: 80, spd: 64, elu: 60 }], ['Scrambler', { thr: 66, pow: 68, spd: 78, elu: 74 }]] },
    RB: { role: 'RB', base: 'RB', label: 'Running back', attrs: [['spd', 'Speed'], ['elu', 'Elusiveness'], ['pwr', 'Power'], ['hnd', 'Hands']], w: [.35, .3, .25, .1],
      arch: [['Speed Back', { spd: 80, elu: 72, pwr: 62, hnd: 64 }], ['Power Back', { spd: 70, elu: 64, pwr: 80, hnd: 60 }], ['Receiving Back', { spd: 74, elu: 72, pwr: 62, hnd: 76 }]] },
    WR: { role: 'X', base: 'X', label: 'Wide receiver', attrs: [['spd', 'Speed'], ['rte', 'Route running'], ['hnd', 'Hands'], ['elu', 'Elusiveness']], w: [.3, .3, .3, .1],
      arch: [['Deep Threat', { spd: 82, rte: 66, hnd: 68, elu: 66 }], ['Route Technician', { spd: 72, rte: 80, hnd: 72, elu: 64 }], ['Possession', { spd: 70, rte: 72, hnd: 80, elu: 62 }]] },
    LB: { role: 'MLB', base: 'MLB', label: 'Linebacker', attrs: [['spd', 'Speed'], ['tkl', 'Tackling'], ['shd', 'Block shedding'], ['cov', 'Coverage']], w: [.25, .35, .2, .2],
      arch: [['Thumper', { spd: 68, tkl: 80, shd: 74, cov: 60 }], ['Sideline to Sideline', { spd: 80, tkl: 70, shd: 64, cov: 68 }], ['Cover Backer', { spd: 74, tkl: 68, shd: 62, cov: 78 }]] },
    CB: { role: 'CB1', base: 'CB', label: 'Cornerback', attrs: [['spd', 'Speed'], ['cov', 'Coverage'], ['bsk', 'Ball skills'], ['tkl', 'Tackling']], w: [.3, .35, .25, .1],
      arch: [['Shutdown', { spd: 76, cov: 80, bsk: 66, tkl: 62 }], ['Ball Hawk', { spd: 74, cov: 70, bsk: 80, tkl: 60 }], ['Speedster', { spd: 84, cov: 68, bsk: 66, tkl: 60 }]] } };
  const RANKS = [[0, 'Rookie'], [4000, 'Starter'], [10000, 'Playmaker'], [20000, 'All-Pro'], [35000, 'Franchise player'], [55000, 'Legend']];
  const ZERO = () => ({ g: 0, att: 0, comp: 0, pyd: 0, ptd: 0, pint: 0, car: 0, ryd: 0, rtd: 0, rec: 0, recyd: 0, rectd: 0, tgt: 0, tkl: 0, sack: 0, int: 0, pbu: 0 });
  const GOAL_XP = 250;

  /* Abilities: [name, what it does, rating boosts]. A slot opens at 74, 80 and 87 overall. */
  const PERKS = {
    QB: [['Quick Release', 'The ball comes out faster, with more zip.', { pow: 7, thr: 2 }], ['Pinpoint', 'Tighter throws at every depth.', { thr: 7 }], ['Escape Artist', 'Harder to bring down in the pocket and on the run.', { elu: 14 }], ['Wheels', 'A step faster when the play breaks down.', { spd: 8 }]],
    RB: [['Bruiser', 'Runs through arm tackles.', { pwr: 12 }], ['Ankle Breaker', 'Jukes and spins fool tacklers for longer.', { elu: 14 }], ['Soft Hands', 'A reliable target out of the backfield.', { hnd: 14 }], ['Breakaway', 'Extra top speed in the open field.', { spd: 6 }]],
    WR: [['Sure Hands', 'Holds on through contact.', { hnd: 9 }], ['Route Artist', 'Sharper cuts create separation.', { rte: 12 }], ['Burner', 'Extra top speed.', { spd: 6 }], ['After the Catch', 'Slips the first tackler.', { elu: 14 }]],
    LB: [['Enforcer', 'Tackles that stick.', { tkl: 9 }], ['Block Shedder', 'Gets off blocks sooner.', { shd: 14 }], ['Lurker', 'Reads the quarterback in coverage.', { cov: 12 }], ['Closing Speed', 'Covers ground faster.', { spd: 6 }]],
    CB: [['Lockdown', 'Stays in the receiver\u2019s pocket.', { cov: 9 }], ['Pick Artist', 'Turns tipped balls into interceptions.', { bsk: 14 }], ['Closing Speed', 'Covers ground faster.', { spd: 6 }], ['Sure Tackler', 'Gets the ball carrier down.', { tkl: 14 }]] };
  const SLOT_AT = [74, 80, 87];

  let C = load(KEY, null);
  if (C && (C.v !== 1 || !POS[C.pos])) C = null;
  if (C && C.trust === undefined) C.trust = 70;  // careers from before coach trust existed stay starters
  if (C && !C.pre && !C.rival) setRival();  // and get a rival

  /* Coach trust (0 to 100) decides how much you play: [trust needed, role, share of your unit's drives] */
  const ROLES = [[60, 'Starter', 1], [35, 'Rotation', 0.6], [0, 'Backup', 0.36]];
  const roleOf = tr => ROLES.find(r => (tr === undefined ? C.trust : tr) >= r[0]);
  const share = () => roleOf()[2];
  const PICK_TRUST = [78, 70, 62, 56, 50, 44, 38, 32], PICK_XP = [1500, 1200, 1000, 800, 650, 500, 400, 300];
  const WORK_TARGET = { QB: 300, RB: 220, WR: 220, LB: 140, CB: 130 };
  const NEUTRAL = { QB: 4.6, RB: 4.9, WR: 4.9, LB: 4.0, CB: 3.7 };  // the game grade (in points) at which coach trust stays put
  const DIFFS = ['Rookie', 'Pro', 'All-Pro'];  // drill production that earns a grade of 85
  const persist = () => save(KEY, C);
  const ovrOf = (pos, a) => Math.round(POS[pos].attrs.reduce((s, [k], i) => s + a[k] * POS[pos].w[i], 0));
  const ovr = () => ovrOf(C.pos, C.attrs);
  const cost = v => Math.round((150 + Math.max(0, v - 60) * 22) / 10) * 10;
  const rank = () => {
    const pts = C.xpTotal + C.rings * 4000;
    let r = RANKS[0][1];
    for (const [n, l] of RANKS) if (pts >= n) r = l;
    return r;
  };
  const team = i => TEAMS[i], full = i => `${TEAMS[i].city} ${TEAMS[i].name}`;
  const slots = () => SLOT_AT.filter(v => ovr() >= v).length;

  /* ratings with equipped abilities applied: this is what the engine plays with */
  function effAttrs() {
    const a = { ...C.attrs };
    for (const n of (C.perks || []).slice(0, slots())) {
      const pk = PERKS[C.pos].find(x => x[0] === n);
      if (pk) for (const k in pk[2]) a[k] = Math.min(99, a[k] + pk[2][k]);
    }
    return a;
  }

  /* the player as the engine sees them: an overall, a top speed, and the specific ratings the engine reads */
  function hero() {
    const a = effAttrs(), x = {};
    if (C.pos === 'QB') {
      x.thr = a.thr;
      x.pow = a.pow;
      x.brk = a.elu;
      x.jk = a.elu;
    }
    if (C.pos === 'RB') {
      x.jk = a.elu;
      x.brk = Math.round(a.pwr * 0.7 + a.elu * 0.3);
      x.cat = a.hnd;
    }
    if (C.pos === 'WR') {
      x.cat = a.hnd;
      x.acc = 13 * (1 + (a.rte - 75) * 0.012);
      x.brk = a.elu;
      x.jk = a.elu;
    }
    if (C.pos === 'LB') {
      x.tkl = a.tkl;
      x.shd = a.shd;
      x.cov = a.cov;
      x.bsk = a.cov - 6;
    }
    if (C.pos === 'CB') {
      x.cov = a.cov;
      x.bsk = a.bsk;
      x.tkl = a.tkl;
    }
    return { rt: ovr(), spd: BASE[POS[C.pos].base] * (1 + (a.spd - 80) * 0.004), num: C.num, name: C.name, x };
  }

  /* ---------- league (the shared rules are in league.js) ---------- */
  const LG = PG.league;

  function initSeason() {
    LG.start(C);
    C.stats = ZERO();
    C.log = [];
    setRival();
    pickGoals();
  }

  /* Your rival plays your position for the best team that is not yours. He is always near the top of the leaders,
     beating his team is worth a bonus, and finishing a season ahead of him is a trophy. The name is cosmetic, so it
     comes from Math.random and leaves seeded test runs alone. */
  function setRival() {
    if (C.rival && C.rival.team !== C.team) return;
    const team = TEAMS.map((_, i) => i).filter(i => i !== C.team).sort((a, b) => TEAMS[b].ovr - TEAMS[a].ovr)[0];
    C.rival = { team, name: PG.NAMES[Math.floor(Math.random() * PG.NAMES.length)] };
  }

  const recTxt = i => LG.recTxt(C, i), nextOpp = () => LG.nextOpp(C);

  /* postseason bonus and honors, once the league says the season is over */
  function closeSeason(finish) {
    let bonus = { Champion: 1500, 'Runner-up': 800, Semifinalist: 400 }[finish] || 0;
    const reg = C.log.filter(g => g.pts !== undefined && /^Wk/.test(g.wk)), avg = reg.length ? reg.reduce((t, g) => t + g.pts, 0) / reg.length : 0, aw = [];
    if (avg >= 6.5) {
      aw.push('All-League');
      bonus += 600;
    }
    if (avg >= 7.5 && finish === 'Champion') {
      aw.push('League MVP');
      bonus += 1200;
    }
    const L = leaders(), mine = L.rows.find(r => r.me), his = L.rows.find(r => r.riv);  // the season-long race with your rival
    if (mine && his && mine.v > his.v) {
      C.beatRival = 1;
      bonus += 500;
      C.po.rival = `You finished ahead of ${his.name}.`;
    } else if (his) C.po.rival = `${his.name} finished ahead of you.`;
    C.po.awards = aw;
    C.awards = (C.awards || []).concat(aw.map(n => ({ season: C.season, name: n })));
    /* the season goes into the record book: where you played, how the team did, your line and your average grade */
    C.hist = (C.hist || []).filter(h => h.season !== C.season).concat([{ season: C.season, team: C.team, rec: recTxt(C.team), finish, line: line(C.stats), g: C.stats.g,
      grade: reg.length ? GRADES[Math.min(10, Math.round(avg))] : '', ovr: ovr(), awards: aw }]);
    C.po.bonus = bonus;
    C.xp += bonus;
    C.xpTotal += bonus;
  }

  /* ---------- goals, XP, stat lines ---------- */
  function goalPool(pos, ql) {
    const k = ql / 120, r10 = v => Math.max(10, Math.round(v * k / 10) * 10), n = v => Math.max(1, Math.round(v * k));
    return {
      QB: [{ d: `Throw for ${r10(80)}+ yards`, t: m => m.pyd >= r10(80) }, { d: `Throw ${n(1.2)} touchdown pass${n(1.2)>1?'es':''}`, t: m => m.ptd >= n(1.2) }, { d: 'Throw no interceptions', t: m => m.att >= 4 && m.pint === 0 }, { d: 'Complete 60% of your passes', t: m => m.att >= 5 && m.comp / m.att >= 0.6 }],
      RB: [{ d: `Rush for ${r10(55)}+ yards`, t: m => m.ryd >= r10(55) }, { d: 'Score a rushing touchdown', t: m => m.rtd >= 1 }, { d: 'Average 4+ yards a carry', t: m => m.car >= 4 && m.ryd / m.car >= 4 }, { d: `Catch ${n(2)} passes`, t: m => m.rec >= n(2) }],
      WR: [{ d: `Catch ${n(2.6)} pass${n(2.6)>1?'es':''}`, t: m => m.rec >= n(2.6) }, { d: `Gain ${r10(55)}+ receiving yards`, t: m => m.recyd >= r10(55) }, { d: 'Score a receiving touchdown', t: m => m.rectd >= 1 }],
      LB: [{ d: `Make ${n(2)} tackle${n(2)>1?'s':''}`, t: m => m.tkl >= n(2) }, { d: 'Get a sack', t: m => m.sack >= 1 }, { d: 'Break up or intercept a pass', t: m => m.pbu + m.int >= 1 }],
      CB: [{ d: 'Break up or intercept a pass', t: m => m.pbu + m.int >= 1 }, { d: 'Grab an interception', t: m => m.int >= 1 }, { d: `Make ${n(1.4)} tackle${n(1.4)>1?'s':''}`, t: m => m.tkl >= n(1.4) }] }[pos];
  }

  function pickGoals() {
    const n = goalPool(C.pos, C.ql * share()).length, ix = [...Array(n).keys()];
    while (ix.length > 3) ix.splice(Math.floor(rnd(ix.length)), 1);
    C.goals = ix;
  }

  const goals = () => {
    const pool = goalPool(C.pos, C.ql * share());
    return C.goals.map(i => pool[i]).filter(Boolean);
  };

  function xpFor(m, won) {
    const it = [], add = (l, v) => {
      v = Math.round(v);
      if (v > 0) it.push([l, v]);
    };
    add('Game played', 200);
    if (won) add('Team win', 200);
    if (C.pos === 'QB') {
      add('Passing yards', m.pyd * 2);
      add('Completions', m.comp * 12);
      add('Touchdown passes', m.ptd * 150);
      add('Rushing', Math.max(0, m.ryd) * 2 + m.rtd * 120);
    }
    if (C.pos === 'RB') {
      add('Rushing yards', Math.max(0, m.ryd) * 4);
      add('Rushing touchdowns', m.rtd * 150);
      add('Receiving', m.rec * 25 + Math.max(0, m.recyd) * 3 + m.rectd * 150);
    }
    if (C.pos === 'WR') {
      add('Receptions', m.rec * 40);
      add('Receiving yards', Math.max(0, m.recyd) * 4);
      add('Receiving touchdowns', m.rectd * 160);
    }
    if (C.pos === 'LB') {
      add('Tackles', m.tkl * 45);
      add('Sacks', m.sack * 130);
      add('Interceptions', m.int * 220);
      add('Pass breakups', m.pbu * 70);
      add('Forced fumbles', (m.ff || 0) * 220);
      add('Fumble recoveries', (m.fr || 0) * 160);
    }
    if (C.pos === 'CB') {
      add('Pass breakups', m.pbu * 90);
      add('Forced fumbles', (m.ff || 0) * 220);
      add('Fumble recoveries', (m.fr || 0) * 160);
      add('Interceptions', m.int * 250);
      add('Tackles', m.tkl * 40);
    }
    return it;
  }

  function line(m) {
    if (C.pos === 'QB') return `${m.comp}/${m.att}, ${m.pyd} yds, ${m.ptd} TD, ${m.pint} INT` + (m.car ? ` · ${m.car} car, ${m.ryd} yds` : '');
    if (C.pos === 'RB') return `${m.car} car, ${m.ryd} yds, ${m.rtd} TD` + (m.rec ? ` · ${m.rec} rec, ${m.recyd} yds` : '');
    if (C.pos === 'WR') return `${m.rec} rec, ${m.recyd} yds, ${m.rectd} TD · ${m.tgt} targets`;
    if (C.pos === 'LB') return `${m.tkl} tkl, ${m.sack} sack, ${m.int} INT, ${m.pbu} PBU`;
    return `${m.tkl} tkl, ${m.int} INT, ${m.pbu} PBU`;
  }

  const GRADES = ['F', 'D', 'C', 'C+', 'B', 'B+', 'A-', 'A', 'A', 'A+', 'A+'];

  /* a game grade from goals met, the result and the stat line, scaled so every position can reach an A */
  function gradeOf(m, won, met) {
    const scale = { QB: 1, RB: 0.8, WR: 1, LB: 3.6, CB: 4.4 }[C.pos], k = C.ql / 120 * share();  // a part-time player is judged on part-time numbers
    const stat = xpFor(m, false).filter(([l]) => l !== 'Game played').reduce((t, [, v]) => t + v, 0) * scale / k;
    const pts = met * 2 + (won ? 1 : 0) + (stat >= 650 ? 3 : stat >= 380 ? 2 : stat >= 170 ? 1 : 0);
    return [pts, GRADES[Math.min(10, pts)]];
  }

  function headline(m, won, us, them, opp) {
    const n = C.name, t = TEAMS[C.team].name, o = TEAMS[opp].name;
    let f = '';
    if (C.pos === 'QB') f = m.ptd >= 2 ? `throws ${m.ptd} touchdowns` : m.pyd >= 150 ? `passes for ${m.pyd} yards` : m.ptd === 1 ? 'throws a touchdown' : '';
    if (C.pos === 'RB') f = m.rtd >= 2 ? `scores ${m.rtd} times` : m.ryd >= 70 ? `runs for ${m.ryd} yards` : m.rtd === 1 ? 'finds the end zone' : '';
    if (C.pos === 'WR') f = m.rectd >= 2 ? `catches ${m.rectd} touchdowns` : m.recyd >= 70 ? `has ${m.recyd} receiving yards` : m.rectd === 1 ? 'catches a touchdown' : '';
    if (C.pos === 'LB') f = m.int >= 1 ? 'grabs an interception' : m.sack >= 1 ? `gets ${m.sack>1?m.sack+' sacks':'a sack'}` : m.tkl >= 5 ? `makes ${m.tkl} tackles` : '';
    if (C.pos === 'CB') f = m.int >= 1 ? `picks off ${m.int>1?m.int+' passes':'a pass'}` : m.pbu >= 2 ? `breaks up ${m.pbu} passes` : '';
    const sc = `${Math.max(us,them)}\u2013${Math.min(us,them)}`;
    if (won) return f ? `${n} ${f} as the ${t} beat the ${o} ${sc}` : `${t} get past the ${o} ${sc}`;
    if (us === them) return `${t} and ${o} finish level at ${us}`;
    return f ? `${n} ${f}, but the ${t} fall to the ${o} ${sc}` : `${o} hand the ${t} a ${sc} loss`;
  }

  /* the short line shown under the scorebug during a game */
  function chip(m) {
    if (C.pos === 'QB') return `${m.comp}/${m.att} · ${m.pyd} yds · ${m.ptd} TD`;
    if (C.pos === 'RB') return `${m.car} car · ${m.ryd} yds · ${m.rtd} TD`;
    if (C.pos === 'WR') return `${m.rec} rec · ${m.recyd} yds · ${m.rectd} TD`;
    if (C.pos === 'LB') return `${m.tkl} tkl · ${m.sack} sack · ${m.int} int`;
    return `${m.tkl} tkl · ${m.int} int · ${m.pbu} pbu`;
  }

  /* League leaders: the other seven teams' starters at your position, generated from team strength so the same
     season always shows the same race. [label, stat key (or a function of the stat line), per-game base at 3-minute quarters] */
  const LEAD = { QB: ['Passing yards', 'pyd', 150], RB: ['Rushing yards', 'ryd', 60], WR: ['Receiving yards', 'recyd', 58], LB: ['Tackles', 'tkl', 3.4], CB: ['Passes defended', m => m.pbu + m.int, 0.8] };

  function leaders() {
    const [label, key, base] = LEAD[C.pos], g = C.stats.g, k = C.ql / 180, val = m => typeof key === 'function' ? key(m) : m[key];
    const rows = TEAMS.map((t, i) => {
      if (i === C.team) return { name: C.name, ab: t.ab, v: val(C.stats), me: true };
      let h = (C.season * 131 + i * 977 + C.pos.charCodeAt(0) * 31) >>> 0;
      const r = () => {
        h = (h * 1664525 + 1013904223) >>> 0;
        return h / 4294967296;
      };
      const riv = !!C.rival && C.rival.team === i, per = base * k * (1 + (C.ovrs[i] - 83) * 0.02) * (riv ? 1.2 : 0.8 + r() * 0.45), other = PG.NAMES[Math.floor(r() * PG.NAMES.length)];
      return { name: riv ? C.rival.name : other, ab: t.ab, v: Math.round(per * g * (0.92 + r() * 0.16)), me: false, riv };
    });
    return { label, rows: rows.sort((a, b) => b.v - a.v) };
  }

  /* Trophies: [id, name, how to earn it, test]. Checked after every game, upgrade and season. */
  const TROPHIES = [
    ['top', 'First overall', 'Go first in the draft', () => C.pick === 1],
    ['win', 'First win', 'Win a game', () => C.log.some(g => g.res === 'W') || C.career.g > 0 && C.rings > 0],
    ['td', 'Pay dirt', 'Score or throw your first touchdown', () => C.career.ptd + C.career.rtd + C.career.rectd > 0],
    ['big', 'Monster game', 'Earn an A+ game grade', () => C.log.some(g => g.grade === 'A+')],
    ['goals', 'Checklist', 'Meet all three goals in one game', () => C.log.some(g => g.met === 3)],
    ['ten', 'Regular', 'Play 10 career games', () => C.career.g >= 10],
    ['o80', 'Rising', 'Reach 80 overall', () => ovr() >= 80],
    ['o90', 'Elite', 'Reach 90 overall', () => ovr() >= 90],
    ['perks', 'Fully loaded', 'Equip three abilities', () => (C.perks || []).length >= 3 && slots() >= 3],
    ['po', 'Postseason', 'Make the playoffs', () => !!C.madePO],
    ['honor', 'All-League', 'Earn a season honor', () => (C.awards || []).length > 0],
    ['ring', 'Champion', 'Win the title', () => C.rings > 0],
    ['dyn', 'Dynasty', 'Win three titles', () => C.rings >= 3],
    ['riv', 'Settled', 'Finish a season ahead of your rival', () => !!C.beatRival]];

  function checkTrophies() {
    C.troph = C.troph || {};
    const got = [];
    for (const [id, name,, test] of TROPHIES) if (!C.troph[id] && test()) {
      C.troph[id] = 1;
      got.push(name);
    }
    return got;
  }

  const COLS = {
    QB: [['G', 'g'], ['Comp', 'comp'], ['Att', 'att'], ['Yds', 'pyd'], ['TD', 'ptd'], ['INT', 'pint']],
    RB: [['G', 'g'], ['Car', 'car'], ['Yds', 'ryd'], ['TD', 'rtd'], ['Rec', 'rec']],
    WR: [['G', 'g'], ['Rec', 'rec'], ['Yds', 'recyd'], ['TD', 'rectd'], ['Tgt', 'tgt']],
    LB: [['G', 'g'], ['Tkl', 'tkl'], ['Sack', 'sack'], ['INT', 'int'], ['PBU', 'pbu']],
    CB: [['G', 'g'], ['Tkl', 'tkl'], ['INT', 'int'], ['PBU', 'pbu']] };

  /* ---------- create a player ---------- */
  function showCreate() {
    const st = { name: '', num: '', pos: 'QB', arch: 0, team: -1 };
    const draw = () => {
      const P = POS[st.pos];
      scr.innerHTML = `<div class="menu solid"><button class="back" id="bk">‹ Menu</button><h1 class="sm">New <em>career</em></h1>
   <p class="tag">You play one player. When your unit is off the field, the drive is simulated and you get the result.</p>
   <h2>Player</h2><div class="two"><div><label class="lbl" for="cn">Name</label><input id="cn" maxlength="16" autocomplete="off" placeholder="Last name" value="${esc(st.name)}"></div>
   <div><label class="lbl" for="cj">Number</label><input id="cj" inputmode="numeric" maxlength="2" placeholder="1–99" value="${esc(st.num)}"></div></div>
   <h2>Position</h2><div class="seg" id="cp">${Object.keys(POS).map(k=>`<button data-p="${k}" class="${k===st.pos?'on':''}">${k}</button>`).join('')}</div>
   <h2>${P.label} build</h2><div class="arch" id="ca">${P.arch.map(([n,a],i)=>`<button data-a="${i}" class="${i===st.arch?'on':''}"><b>${n} · ${ovrOf(st.pos,a)} OVR</b><span>${P.attrs.map(([k,l])=>`${l} ${a[k]}`).join(' · ')}</span></button>`).join('')}</div>
   <h2>Into the league</h2><div class="teams" id="ct"><button class="tm ${st.team<0?'on':''}" data-i="-1" style="--c:var(--acc);grid-column:1/3"><i></i><b>Enter the draft</b><span>Work out at the combine first</span><u>›</u></button>
   <p class="note" style="grid-column:1/3;margin:2px 0">Or walk on with a team: no draft, no signing bonus, and you start in the rotation.</p>
   ${TEAMS.map((t,i)=>`<button class="tm ${i===st.team?'on':''}" data-i="${i}" style="--c:${t.c1}"><i></i><b>${t.city}</b><span>${t.name}</span><u>${t.ovr}</u></button>`).join('')}</div>
   <button class="go" id="cgo">Start career</button></div>`;
      const keep = () => {
        st.name = $('#cn').value;
        st.num = $('#cj').value.replace(/\D/g, '');
      };
      $('#cn').oninput = keep;
      $('#cj').oninput = keep;
      $('#bk').onclick = PG.showMenu;
      scr.querySelectorAll('#cp button').forEach(b => b.onclick = () => {
        keep();
        st.pos = b.dataset.p;
        st.arch = 0;
        draw();
      });
      scr.querySelectorAll('#ca button').forEach(b => b.onclick = () => {
        keep();
        st.arch = +b.dataset.a;
        draw();
      });
      scr.querySelectorAll('#ct button').forEach(b => b.onclick = () => {
        keep();
        st.team = +b.dataset.i;
        draw();
      });
      $('#cgo').onclick = () => {
        keep();
        const [an, aa] = POS[st.pos].arch[st.arch], num = clamp(parseInt(st.num, 10) || Math.floor(rnd(1, 99)), 0, 99);
        C = { v: 1, name: st.name.trim() || 'Rookie', num, pos: st.pos, arch: an, attrs: { ...aa }, team: Math.max(0, st.team), xp: 0, xpTotal: 0, season: 1, rings: 0, ql: 180, career: ZERO(), trust: 50 };
        PG.snd('whistle');
        if (st.team < 0) {
          C.pre = {};  // at the combine: nothing is saved until the draft
          return showCombine();
        }
        initSeason();
        C.coach = 'Nobody drafted you, so nobody owes you anything. Show me something in practice.';
        persist();
        showHub('up');
        PG.banner('Signed', `${esc(C.name)} walks on with the ${full(C.team)}`, 2600);
      };
    };
    draw();
  }

  /* ---------- the combine and the draft ----------
     Two workouts set a draft grade. A high pick goes to a weak team with a big bonus and the coach's trust;
     a late pick lands on a strong team and has to earn his snaps. */
  function showCombine() {
    const pre = C.pre, on = (id, f) => {
      const el = $('#' + id);
      if (el) el.onclick = f;
    };
    scr.innerHTML = `<div class="menu solid"><button class="back" id="bk">‹ Menu</button><h1 class="sm">The <em>combine</em></h1>
  <p class="tag">Two workouts in front of every team. The better you do, the earlier you are drafted: a bigger signing bonus, and a coach who trusts you from day one.</p>
  <div class="nx"><small>Workout 1</small><h4>40-yard dash</h4><p>${pre.dash?`${pre.dash.time.toFixed(2)} seconds · grade ${pre.dash.grade}`:'Tap as fast as you can.'}</p>${pre.dash?'':'<button class="go sm" id="d1">Run the dash</button>'}</div>
  <div class="nx"><small>Workout 2</small><h4>${POS[C.pos].label} drills</h4><p>${pre.work?`${line(pre.work.m)} · grade ${pre.work.grade}`:'Five live reps at your position.'}</p>${pre.dash&&!pre.work?'<button class="go sm" id="d2">Start the drills</button>':''}</div>
  ${pre.dash&&pre.work?'<button class="go" id="d3">Go to the draft</button>':'<div class="stack"><button class="btn2" id="skip">Skip the combine</button></div>'}</div>`;
    $('#bk').onclick = PG.showMenu;
    on('d1', showDash);
    on('d2', workout);
    on('d3', () => draft(Math.round(pre.dash.grade * 0.4 + pre.work.grade * 0.6)));
    on('skip', () => draft(Math.round(rnd(58, 78))));
  }

  /* The dash is a tapping race: every tap is a stride, speed bleeds away between taps, and your Speed rating sets the ceiling. */
  function showDash() {
    const vmax = 9.6 + (C.attrs.spd - 60) * 0.06;
    let x = 0, v = 0, t0 = 0, last = 0, timer = 0, done = false;
    scr.innerHTML = `<div class="menu solid"><h1 class="sm">40-yard <em>dash</em></h1><p class="tag">Tap the button as fast as you can. The clock starts on your first tap.</p>
  <div class="dash"><div class="lane"><i id="dr"></i></div><b id="dt">0.00</b><span id="dy">0 of 40 yards</span></div>
  <button class="go" id="tap" data-quiet style="height:112px;font-size:19px">Tap!</button></div>`;
    const finish = time => {
      done = true;
      clearInterval(timer);
      removeEventListener('keydown', onKey);
      const best = 40 / vmax + 0.45, grade = clamp(Math.round(100 - (time - best) * 60), 35, 100);  // graded against the best this player could run
      C.pre.dash = { time, grade };
      if (grade >= 90) C.attrs.spd = Math.min(99, C.attrs.spd + 1);  // a great time is worth a point of speed
      PG.snd('whistle');
      showCombine();
      PG.banner(time.toFixed(2) + ' seconds', grade >= 90 ? 'The scouts are writing. Speed +1' : grade >= 70 ? 'A solid time' : 'A slow one', 2200);
    };
    const tick = () => {
      const now = performance.now(), dt = Math.min(0.25, (now - last) / 1000), t = (now - t0) / 1000;
      last = now;
      v *= Math.exp(-0.9 * dt);
      x += v * dt;
      $('#dr').style.width = Math.min(100, x / 40 * 100) + '%';
      $('#dt').textContent = t.toFixed(2);
      $('#dy').textContent = Math.min(40, Math.floor(x)) + ' of 40 yards';
      if (x >= 40 || t > 12) finish(Math.min(t, 12));
    };
    const tap = () => {
      if (done) return;
      if (!t0) {
        t0 = last = performance.now();
        timer = setInterval(tick, 16);
      }
      v = Math.min(vmax, v + 1.35);
      PG.snd('tick');
    };
    const onKey = e => {
      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        tap();
      }
    };
    $('#tap').addEventListener('pointerdown', e => {
      e.preventDefault();
      tap();
    });
    addEventListener('keydown', onKey);
  }

  /* five live reps with a neutral squad; what you produce is the grade */
  function workout() {
    PG.snd('whistle');
    PG.startGame({ a: C.team, b: (C.team + 3) % TEAMS.length, ql: 180, mode: 'career', lock: POS[C.pos].role, hero: hero(), ovr: [80, 77], diff: 1, drill: 5, env: { time: 'day', weather: 'clear' }, line: chip,
      onEnd: r => {
        const m = r.my, stat = xpFor(m, false).filter(([l]) => l !== 'Game played').reduce((t, [, v]) => t + v, 0);
        C.pre.work = { m: { ...m }, grade: clamp(Math.round(40 + stat / WORK_TARGET[C.pos] * 45), 35, 100) };
        PG.toMenu();
        showCombine();
      },
      onQuit: () => showCombine() });
  }

  function draft(grade) {
    const order = TEAMS.map((_, i) => i).sort((a, b) => TEAMS[a].ovr - TEAMS[b].ovr);  // the weakest team picks first
    const pick = clamp(1 + Math.floor((100 - grade) / 9), 1, 8), tm = order[pick - 1], bonus = PICK_XP[pick - 1], pre = C.pre || {};
    delete C.pre;
    Object.assign(C, { team: tm, trust: PICK_TRUST[pick - 1], pick, xp: C.xp + bonus, xpTotal: C.xpTotal + bonus });
    initSeason();
    C.coach = { Starter: 'Welcome. You start from day one, so do not make me regret the pick.', Rotation: 'Welcome. You will play, but the starting job is not yours yet. Earn it.', Backup: 'Welcome. You are behind some good players here. Practice hard and take your chances.' }[roleOf()[1]];
    checkTrophies();
    persist();
    const others = ['QB', 'RB', 'WR', 'LB', 'CB', 'OT', 'DE', 'S'], any = a => a[Math.floor(Math.random() * a.length)];
    const opens = { Starter: 'you start from day one', Rotation: 'you open in the rotation', Backup: 'you open as a backup' }[roleOf()[1]];
    scr.innerHTML = `<div class="menu solid"><h1 class="sm">The <em>draft</em></h1>
  <p class="tag">${pre.dash?`Dash ${pre.dash.time.toFixed(2)} s, grade ${pre.dash.grade}${pre.work?` · drills grade ${pre.work.grade}`:''} · `:''}Draft grade ${grade}</p>
  <table class="lg">${order.map((ti,n)=>n===pick-1?`<tr class="me"><td>${n+1}. ${full(ti)}</td><td>${esc(C.name)}, ${C.pos}</td></tr>`:`<tr><td>${n+1}. ${full(ti)}</td><td>${any(PG.NAMES)}, ${any(others)}</td></tr>`).join('')}</table>
  <div class="nx"><small>Pick ${pick} of 8</small><h4>${full(tm)}</h4><p>Signing bonus +${fmt(bonus)} XP · Coach trust ${C.trust}: ${opens}.</p></div>
  <button class="go" id="camp">Report to camp</button></div>`;
    $('#camp').onclick = () => showHub('up');
    PG.snd('fanfare');
    if (PG.audio) PG.audio.say(`With pick number ${pick}, the ${full(tm)} select ${C.name}, ${POS[C.pos].label.toLowerCase()}.`, true);
  }

  /* ---------- hub ---------- */
  function nextCard() {
    const t = C.team;
    if (C.phase === 'done') {
      const po = C.po;
      return `<div class="nx"><small>Season ${C.season} complete</small><h4>${po.finish}</h4>
  <p>${full(t)} finished ${recTxt(t)}. ${po.champ===t?'You are the champions.':`Champion: ${full(po.champ)}.`}${po.awards&&po.awards.length?` Honors: ${po.awards.join(', ')}.`:''}${po.rival?` ${esc(po.rival)}`:''}${po.bonus?` Bonus: +${fmt(po.bonus)} XP.`:''}<br>Your season: ${line(C.stats)}.</p>
  <button class="go sm" id="nxs">Start season ${C.season+1}</button><button class="btn2" id="fa" style="margin-top:8px">Free agency · change teams</button></div>`;
    }
    const o = nextOpp(), lab = LG.label(C);
    return `<div class="nx"><small>${lab}${C.rival&&C.rival.team===o?' · rival game':''}</small><h4>vs ${full(o)}</h4><p>${C.ovrs[o]} OVR, ${recTxt(o)} · You are ${recTxt(t)}${C.rival&&C.rival.team===o?`<br>${esc(C.rival.name)} is their ${POS[C.pos].label.toLowerCase()}. Beat them for +300 XP.`:''}</p>
  <ul>${goals().map(g=>`<li>${g.d} <b>+${GOAL_XP} XP</b></li>`).join('')}</ul><button class="go sm" id="play">Play game</button>
  ${C.prac!==pracKey()?'<button class="btn2" id="prac" style="margin-top:8px">Practice first · bonus XP</button>':'<p class="note" style="margin-top:8px">Practice is done for this week.</p>'}</div>
  ${C.news?`<p class="news">${esc(C.news)}</p>`:''}`;
  }

  const pracKey = () => C.season + '-' + C.week + '-' + C.phase;

  /* What the coach says after a game: one line on the performance, one on what comes next. Cosmetic, so Math.random. */
  function coachSays(m, grade, pts, won, met, role0, role1) {
    const any = a => a[Math.floor(Math.random() * a.length)], up = ROLES.findIndex(r => r[1] === role1) < ROLES.findIndex(r => r[1] === role0);
    let weak = '';
    if (C.pos === 'QB') weak = m.pint > 0 ? 'the interceptions' : m.att >= 6 && m.comp / m.att < 0.5 ? 'the misses' : '';
    if (C.pos === 'RB') weak = m.car >= 5 && m.ryd / m.car < 3 ? 'your reads at the line' : '';
    if (C.pos === 'WR') weak = m.tgt >= 3 && m.rec / m.tgt < 0.5 ? 'the drops' : '';
    if (C.pos === 'LB') weak = m.tkl < 2 ? 'getting off blocks' : '';
    if (C.pos === 'CB') weak = m.pbu + m.int === 0 ? 'your eyes in coverage' : '';
    let a;
    if (role1 !== role0) a = up ? any(['You have earned it.', 'I have seen enough.']) + ` You are ${role1 === 'Starter' ? 'my starter' : 'in the rotation'} from now on.`
      : `I am moving you down to ${role1 === 'Backup' ? 'the bench' : 'the rotation'} until I see more.`;
    else if (pts >= 8) a = any(['That is the player we brought here.', 'Best game I have seen from you.', 'Keep stacking games like that one.']);
    else if (pts >= 6) a = won ? any(['Good work. That is winning football.', 'I will take that every week.']) : 'You did your part. The rest of us owe you one.';
    else if (pts >= 4) a = weak ? `Solid. Clean up ${weak} and you are a problem for this league.` : any(['Solid day. There is more in you.', 'Fine. Now do it again.']);
    else a = weak ? `Not good enough. We are working on ${weak} this week.` : any(['Not good enough. See me at practice.', 'I expect more from you than that.']);
    if (met === 3 && role1 === role0) a += ' Three for three on your goals: that is how trust is built.';
    if (C.phase === 'done') return a + ' Enjoy the break. We go again next season.';
    const o = nextOpp(), strong = C.ovrs[o] >= C.ovrs[C.team] + 3, soft = C.ovrs[o] <= C.ovrs[C.team] - 3;
    const b = C.rival && C.rival.team === o ? `${C.rival.name} and the ${TEAMS[o].name} are next. You know what that game means.`
      : C.phase !== 'reg' ? `It is win or go home against the ${TEAMS[o].name} now.`
      : strong ? `The ${TEAMS[o].name} are next, and they are better than us on paper. Prove the paper wrong.`
      : soft ? `The ${TEAMS[o].name} are next. No letting up.` : `The ${TEAMS[o].name} are next.`;
    return a + ' ' + b;
  }

  function trustHtml() {
    const [, role, sh] = roleOf(), up = ROLES[ROLES.findIndex(r => r[1] === role) - 1];
    return (C.coach ? `<p class="coach"><small>Coach</small>${esc(C.coach)}</p>` : '') + `<div class="trust"><span>Coach trust · ${role}</span><b>${C.trust}</b><div class="bar"><i style="width:${C.trust}%"></i></div></div>`
      + (up ? `<p class="note">You play about ${Math.round(sh*10)} of every 10 of your unit's drives. Good games and practice raise the coach's trust; at ${up[0]} you ${up[1]==='Starter'?'become the starter':'join the rotation'}.${C.phase==='reg'&&C.tradeSeason!==C.season?' <button class="lnk" id="trade">Ask for a trade</button>':''}</p>` : '');
  }

  function tabUp() {
    const P = POS[C.pos];
    return P.attrs.map(([k, l]) => {
      const v = C.attrs[k], c = cost(v), max = v >= 99;
      return `<div class="at"><b>${l}</b><u>${v}</u><div class="bar"><i style="width:${Math.max(4,(v-50)/49*100)}%"></i></div><button data-k="${k}" ${max||C.xp<c?'disabled':''}>${max?'Maxed':`+1 · ${fmt(c)} XP`}</button></div>`;
    }).join('')
      + `<p class="note">Play games to earn XP. Each point costs more as the rating climbs.</p>` + tabPerks();
  }

  function tabPerks() {
    const n = slots(), on = (C.perks || []).slice(0, n), nextAt = SLOT_AT[n];
    return `<h2>Abilities · ${on.length} of ${n} slot${n===1?'':'s'} used</h2>`
      + PERKS[C.pos].map(([name, what]) => {
        const eq = on.includes(name), full2 = !eq && on.length >= n;
        return `<div class="pk"><b>${name}</b><span>${what}</span><button data-p="${name}" class="${eq?'on':''}" ${full2?'disabled':''}>${eq?'Equipped':n?'Equip':'Locked'}</button></div>`;
      }).join('')
      + `<p class="note">${nextAt?`Next slot opens at ${nextAt} overall.`:'All three slots are open.'}</p>`;
  }

  function tabSeason() {
    return LG.standingsHtml(C)
      + (C.log.length ? `<h2>Your games</h2><table class="lg">${C.log.map(g=>`<tr><td>${g.wk} · ${g.res} ${g.us}–${g.them} vs ${team(g.opp).ab}</td></tr>`).join('')}</table>` : '');
  }

  function tabStats() {
    const cols = COLS[C.pos], row = (l, m) => `<tr><td>${l}</td>${cols.map(([,k])=>`<td>${m[k]}</td>`).join('')}</tr>`;
    return `<table class="lg"><tr><th></th>${cols.map(([h])=>`<th>${h}</th>`).join('')}</tr>${row('Season',C.stats)}${row('Career',C.career)}</table>
  ${leadersHtml()}${historyHtml()}${trophiesHtml()}
  ${C.log.length?`<h2>Game log</h2><table class="lg">${C.log.map(g=>`<tr><td>${g.wk} vs ${team(g.opp).ab}${g.grade?' · '+g.grade:''}<small>${g.line}</small></td></tr>`).join('')}</table>`:'<p class="note">Your game log shows up here after your first game.</p>'}`;
  }

  /* season by season; a career begun before this table existed only lists the seasons finished since */
  function historyHtml() {
    const h = C.hist || [];
    if (!h.length) return '';
    return `<h2>Season by season</h2><table class="lg">${h.map(x=>`<tr><td>Season ${x.season} · ${team(x.team).name} ${x.rec} · ${x.finish||'Missed the playoffs'}<small>${x.line}${x.grade?' · average grade '+x.grade:''} · ${x.ovr} overall${x.awards&&x.awards.length?' · '+x.awards.join(', '):''}</small></td></tr>`).join('')}</table>`;
  }

  function leadersHtml() {
    if (!C.stats.g) return '';
    const L = leaders();
    return `<h2>League leaders · ${L.label}</h2><table class="lg">${L.rows.slice(0,5).map((r,i)=>`<tr class="${r.me?'me':''}"><td>${i+1}. ${esc(r.name)} <span style="color:var(--mute)">${r.ab}${r.riv?' · your rival':''}</span></td><td>${r.v}</td></tr>`).join('')}
  ${L.rows.findIndex(r=>r.me)>4?`<tr class="me"><td>${L.rows.findIndex(r=>r.me)+1}. ${esc(C.name)}</td><td>${L.rows.find(r=>r.me).v}</td></tr>`:''}</table>`;
  }

  function trophiesHtml() {
    const have = C.troph || {}, n = TROPHIES.filter(t => have[t[0]]).length;
    return `<h2>Trophies · ${n} of ${TROPHIES.length}</h2><div class="tro">${TROPHIES.map(([id,name,how])=>`<div class="${have[id]?'on':''}"><b>${name}</b><span>${how}</span></div>`).join('')}</div>`;
  }

  /* the end of a career: one last look, then a clean slate */
  /* The hall-of-fame case: titles, honors, how much you did (career XP), how good you became and your trophies.
     About 100 is a first-ballot career. */
  function fameCase() {
    const have = Object.keys(C.troph || {}).length, honors = (C.awards || []).length;
    const parts = [['Titles', C.rings * 14], ['Honors', honors * 6], ['Career XP', C.xpTotal / 1500], ['Overall rating', Math.max(0, (ovr() - 75) * 1.2)], ['Trophies', have * 1.5]].map(([l, v]) => [l, Math.round(v)]);
    const score = parts.reduce((t, [, v]) => t + v, 0);
    const verdict = score >= 95 ? 'First-ballot hall of famer' : score >= 70 ? 'Hall of famer' : score >= 48 ? 'Team legend' : score >= 28 ? 'Respected veteran' : score >= 12 ? 'Solid pro' : 'A short stay in the league';
    return { score, verdict, parts };
  }

  function showRetire() {
    const m = C.career, fame = fameCase();
    scr.innerHTML = `<div class="menu solid"><h1 class="sm">Career <em>so far</em></h1>
  <div class="pc" style="--c:${team(C.team).c1};margin-top:14px"><div><h3>${esc(C.name)}</h3><p>#${C.num} · ${POS[C.pos].label}<br>${C.season} season${C.season>1?'s':''} · ${m.g} games · ${rank()}</p></div><div class="ovr">${ovr()}<small>OVR</small></div></div>
  <div class="nx"><small>Career totals</small><h4>${line(m)}</h4><p>${C.rings} title${C.rings===1?'':'s'} · ${(C.awards||[]).length} honor${(C.awards||[]).length===1?'':'s'} · ${fmt(C.xpTotal)} XP earned</p></div>
  <div class="nx"><small>Hall of fame case</small><h4>${fame.verdict}</h4>
  <div class="trust" style="margin:8px 0 6px"><span>Score · 100 is a first-ballot career</span><b>${fame.score}</b><div class="bar"><i style="width:${Math.min(100,fame.score)}%"></i></div></div>
  <p>${fame.parts.map(([l,v])=>`${l} ${v}`).join(' · ')}</p></div>
  ${historyHtml()}${trophiesHtml()}
  <button class="go" id="keep">Keep playing</button><div class="stack"><button class="btn2 warn" id="nc">Erase and start a new career</button></div>
  <p class="note">A new career replaces this one. It cannot be undone.</p></div>`;
    $('#nc').onclick = () => {
      C = null;
      try {
        localStorage.removeItem(KEY);
      } catch (_) {}
      showCreate();
    };
    $('#keep').onclick = () => showHub('up');
  }

  /* free agency: between seasons you can sign anywhere */
  function showFreeAgency() {
    scr.innerHTML = `<div class="menu solid"><button class="back" id="bk">‹ Back</button><h1 class="sm">Free <em>agency</em></h1><p class="tag">Pick where you play next season. Ratings are from the season that just ended.</p>
  <h2>Teams</h2><div class="teams">${TEAMS.map((t,i)=>`<button class="tm ${i===C.team?'on':''}" data-i="${i}" style="--c:${t.c1}"><i></i><b>${t.city}${i===C.team?' · current':''}</b><span>${t.name}</span><u>${C.ovrs[i]}</u></button>`).join('')}</div></div>`;
    $('#bk').onclick = () => showHub('season');
    scr.querySelectorAll('.tm').forEach(b => b.onclick = () => {
      const i = +b.dataset.i, moved = i !== C.team;
      if (moved) C.trust = clamp(Math.round(58 + (ovr() - C.ovrs[i]) * 1.5), 30, 85);  // a new coach: how you rate against his team decides where you start
      C.team = i;
      C.season++;
      initSeason();
      persist();
      showHub('up');
      if (moved) PG.banner('Signed', `${esc(C.name)} joins the ${full(i)}`, 2600);
    });
  }

  /* your player in his team's home uniform, when the 3D renderer is running */
  function kit() {
    const url = PG.r3d && PG.r3d.portrait ? PG.r3d.portrait(TEAMS[C.team], true, C.num) : null;
    return url ? `<img class="kit" src="${url}" alt="">` : '';
  }

  function showHub(tab) {
    tab = tab || 'up';
    const t = team(C.team);
    const draw = () => {
      scr.innerHTML = `<div class="menu solid"><button class="back" id="bk">‹ Menu</button>
  <div class="pc${kit()?' k':''}" style="--c:${t.c1}">${kit()}<div><h3>${esc(C.name)}</h3><p>#${C.num} · ${POS[C.pos].label} · ${esc(C.arch)}<br>${full(C.team)} · Season ${C.season} · ${rank()}${C.rings?` · ${C.rings} title${C.rings>1?'s':''}`:''}${C.awards&&C.awards.length?` · ${C.awards.length} honor${C.awards.length>1?'s':''}`:''}</p></div><div class="ovr">${ovr()}<small>OVR</small></div></div>
  <div class="xp"><span>To spend</span><b>${fmt(C.xp)} XP</b></div>
  ${trustHtml()}
  ${nextCard()}
  <div class="tabs" style="margin-top:16px">${[['up','Upgrade'],['season','Season'],['stats','Stats']].map(([k,l])=>`<button data-t="${k}" class="${k===tab?'on':''}">${l}</button>`).join('')}</div>
  ${tab==='up'?tabUp():tab==='season'?tabSeason():tabStats()}
  <h2>Difficulty</h2><div class="seg" id="hd">${DIFFS.map((d,i)=>`<button data-d="${i}" class="${i===(C.diff??1)?'on':''}">${d}</button>`).join('')}</div>
  <p class="note">How good the other teams are. All-Pro pays 20% more XP.</p>
  <h2>Quarter length</h2><div class="seg" id="hq">${[60,120,180].map(q=>`<button data-q="${q}" class="${q===C.ql?'on':''}">${q/60} min</button>`).join('')}</div>
  <div class="stack"><button class="btn2 warn" id="ret">Retire</button></div></div>`;
      $('#bk').onclick = PG.showMenu;
      scr.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
        tab = b.dataset.t;
        draw();
      });
      scr.querySelectorAll('.at button').forEach(b => b.onclick = () => {
        const k = b.dataset.k, c = cost(C.attrs[k]), s0 = slots();
        if (C.xp < c || C.attrs[k] >= 99) return;
        C.xp -= c;
        C.attrs[k]++;
        persist();
        PG.snd('buy');
        const tr = checkTrophies();
        if (tr.length) persist();
        keepScroll(draw);
        if (slots() > s0) PG.banner('New ability slot', 'Pick one below', 2200);
        else if (tr.length) PG.banner('Trophy', tr[0], 2200);
      });
      scr.querySelectorAll('.pk button').forEach(b => b.onclick = () => {
        const n = b.dataset.p, cur = (C.perks || []).slice(0, slots()), i = cur.indexOf(n);
        if (i >= 0) cur.splice(i, 1);
        else if (cur.length < slots()) cur.push(n);
        else return;
        C.perks = cur;
        const tr = checkTrophies();
        persist();
        keepScroll(draw);
        if (tr.length) PG.banner('Trophy', tr[0], 2200);
      });
      const pr = $('#prac');
      if (pr) pr.onclick = practice;
      scr.querySelectorAll('#hd button').forEach(b => b.onclick = () => {
        C.diff = +b.dataset.d;
        persist();
        keepScroll(draw);
      });
      scr.querySelectorAll('#hq button').forEach(b => b.onclick = () => {
        C.ql = +b.dataset.q;
        pickGoals();
        persist();
        keepScroll(draw);
      });
      const pl = $('#play');
      if (pl) pl.onclick = play;
      const ns = $('#nxs');
      if (ns) ns.onclick = () => {
        C.season++;
        initSeason();
        persist();
        showHub('up');
      };
      const fa = $('#fa');
      if (fa) fa.onclick = showFreeAgency;
      const tr = $('#trade');
      if (tr) tr.onclick = () => {
        // the weakest team in the league always has room for a starter
        const to = TEAMS.map((_, i) => i).filter(i => i !== C.team).sort((a, b) => C.ovrs[a] - C.ovrs[b])[0];
        Object.assign(C, { team: to, trust: 66, tradeSeason: C.season, coach: 'New team, clean slate. You are starting for us: show me why we made the call.' });
        setRival();
        pickGoals();
        persist();
        showHub('up');
        PG.banner('Traded', `${esc(C.name)} goes to the ${full(to)}`, 2600);
      };
      $('#ret').onclick = showRetire;
    };
    draw();
  }

  function keepScroll(draw) {
    const el = scr.querySelector('.menu'), y = el ? el.scrollTop : 0;
    draw();
    const n = scr.querySelector('.menu');
    if (n) n.scrollTop = y;
  }

  /* ---------- playing a game ---------- */
  function play() {
    const opp = nextOpp();
    PG.snd('whistle');
    PG.startGame({ a: C.team, b: opp, ql: C.ql, mode: 'career', lock: POS[C.pos].role, hero: hero(), ovr: [C.ovrs[C.team], C.ovrs[opp]], diff: C.diff ?? 1, share: share(),
      mustWin: C.phase !== 'reg', env: PG.envFor(C.season, C.week + (C.phase === 'reg' ? 0 : C.phase === 'semi' ? 8 : 9), C.phase !== 'reg' || C.week >= 5), line: chip, goals: m => goals().map(g => ({ d: g.d, ok: !!g.t(m) })), onEnd: r => gameEnd(r, opp), onQuit: () => showHub('up') });
  }

  /* weekly practice: six reps with the first team, no clock, XP for what you do with them */
  function practice() {
    const opp = nextOpp();
    PG.snd('whistle');
    PG.startGame({ a: C.team, b: opp, ql: C.ql, mode: 'career', lock: POS[C.pos].role, hero: hero(), ovr: [C.ovrs[C.team], C.ovrs[C.team] - 4], diff: 1, drill: 6, env: { time: 'day', weather: 'clear' }, line: chip,
      onEnd: r => {
        const m = r.my, items = xpFor(m, false).filter(([l]) => l !== 'Game played').map(([l, v]) => [l, Math.round(v * 0.5)]);
        items.unshift(['Practice reps', 80]);
        const xp = items.reduce((t, [, v]) => t + v, 0);
        C.xp += xp;
        C.xpTotal += xp;
        C.trust = clamp(C.trust + 3, 5, 100);  // the coach notices who shows up
        C.prac = pracKey();
        persist();
        scr.innerHTML = `<div class="sheet"><div class="shd"><b>Practice done</b><span>${line(m)}</span></div>
    <ul class="gl">${items.map(([l,v])=>`<li><span>${l}</span><b>+${fmt(v)}</b></li>`).join('')}<li class="tot"><span>XP earned</span><b>+${fmt(xp)}</b></li></ul>
    <p class="note">Coach trust +3 (now ${C.trust}).</p><button class="go" id="rc">Continue</button></div>`;
        $('#rc').onclick = () => {
          PG.toMenu();
          showHub('up');
        }
      },
      onQuit: () => showHub('up') });
  }

  function gameEnd(r, opp) {
    let us = r.score[0], them = r.score[1];
    const m = r.my;
    if (C.phase !== 'reg' && us === them) {
      if (rnd() < 0.5) us += 3;
      else them += 3;
    }  // a playoff game cannot end level
    const won = us > them, res = won ? 'W' : us === them ? 'T' : 'L', gl = goals().map(g => ({ d: g.d, ok: !!g.t(m) }));
    const star = r.potg && r.potg.team === 0 && r.potg.role === POS[C.pos].role;  // you were the player of the game
    const beatRival = won && !!C.rival && C.rival.team === opp;
    const base = xpFor(m, won), hard = (C.diff ?? 1) === 2 ? [['All-Pro bonus', Math.round(base.reduce((t, [, v]) => t + v, 0) * 0.2)]] : [];
    const items = base.concat(hard, star ? [['Player of the game', 300]] : [], beatRival ? [['Beat your rival', 300]] : []), met = gl.filter(g => g.ok).length, xp = items.reduce((t, [, v]) => t + v, 0) + met * GOAL_XP, [pts, grade] = gradeOf(m, won, met);
    for (const k in m) {
      C.stats[k] = (C.stats[k] || 0) + m[k];
      C.career[k] = (C.career[k] || 0) + m[k];
    }
    C.stats.g++;
    C.career.g++;
    C.xp += xp;
    C.xpTotal += xp;
    /* the coach's view of that game: a B is neutral, better earns trust, worse costs it */
    const role0 = roleOf()[1], t0 = C.trust;
    /* NEUTRAL is what a computer-level player at each position averages (measured with scripted seasons), plus a little:
       play like the computer and trust holds or slips slowly, play better and it climbs. */
    C.trust = clamp(Math.round(C.trust + (pts - NEUTRAL[C.pos]) * 3 + (won ? 1 : 0)), 5, 100);
    const role1 = roleOf()[1], dTrust = C.trust - t0;
    const moved = role1 === role0 ? '' : ROLES.findIndex(r => r[1] === role1) < ROLES.findIndex(r => r[1] === role0) ? ` The coach moves you up: ${role1.toLowerCase()}.` : ` The coach moves you down: ${role1.toLowerCase()}.`;
    const wk = LG.short(C);
    C.log.push({ wk, opp, us, them, res, line: line(m), grade, pts, met });
    C.news = headline(m, won, us, them, opp);
    const fin = LG.advance(C, opp, us, them);
    if (C.phase === 'semi' || C.phase === 'final' || (fin && fin !== 'Missed the playoffs')) C.madePO = 1;
    if (fin) {
      if (fin === 'Champion') C.rings++;
      closeSeason(fin);
    } else pickGoals();
    C.coach = coachSays(m, grade, pts, won, met, role0, role1);
    const trophies = checkTrophies();
    persist();
    const show = () => {
      // drawn again after watching the play of the game
      scr.innerHTML = `<div class="sheet" style="max-height:80%"><div class="shd"><b>${won?'Victory':res==='T'?'Tie game':'Final'}</b><span>${wk} · ${us}–${them} vs ${team(opp).ab}</span></div>
  <div class="nx" style="margin-top:0"><small>Your game · grade ${grade}</small><h4>${line(m)}</h4><p style="margin:4px 0 0">${esc(C.news)}</p></div>
  <ul class="gl">${gl.map(g=>`<li class="${g.ok?'ok':'no'}"><span>${g.d}</span><b>${g.ok?'+'+GOAL_XP:'0'}</b></li>`).join('')}
  ${items.map(([l,v])=>`<li><span>${l}</span><b>+${fmt(v)}</b></li>`).join('')}
  <li class="tot"><span>XP earned</span><b>+${fmt(xp)}</b></li></ul>
  ${r.potgHtml || ''}${r.potdHtml || ''}<p class="note">Coach trust ${C.trust} (${dTrust>=0?'+':''}${dTrust}).${moved}</p>${trophies.length?`<p class="note">Trophy earned: ${trophies.join(', ')}.</p>`:''}
  <button class="go" id="rc">Continue</button></div>`;
      $('#rc').onclick = () => {
        PG.toMenu();
        showHub(C.phase === 'done' ? 'season' : 'up');
      };
      if ($('#potd')) $('#potd').onclick = () => PG.watchPotd(show);
    };
    show();
    if (C.phase === 'done' && C.po.finish === 'Champion') PG.banner('Champions!', full(C.team), 3000);
  }

  PG.career = {
    open() {
      PG.toMenu();
      C ? (C.pre ? showCombine() : showHub('up')) : showCreate();
    },
    summary() {
      if (!C || C.pre) return null;
      const ph = C.phase === 'reg' ? `week ${C.week+1}` : C.phase === 'semi' ? 'semifinal' : C.phase === 'final' ? 'championship game' : 'offseason';
      return `Continue: ${esc(C.name)} · ${C.pos} · ${ovr()} OVR · ${TEAMS[C.team].name}, season ${C.season}, ${ph}`;
    },
    /* test hook */
    get data() {
      return C;
    }
  };
})();
