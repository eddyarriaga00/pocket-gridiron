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

  /* New careers are quarterback or wide receiver (the owner's call, 2026-11-12). The other three stay in the table so a
     career begun before then still loads and plays. */
  const PLAYABLE = ['QB', 'WR'];
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
  if (C && PG.league) PG.league.fix(C);  // a career from the eight-team league: ratings for the new teams too
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
  /* Injuries. Now and then you come out of a game nursing something: "questionable" for the next one, which you play
     with one rating a few points down. And most weeks somebody is on the other team's injury report: about one week
     in four it is a starter, and they are a little weaker for it (the same every time you look: it is drawn from
     the season, the week and the team). */
  const INJ = [['a sore ankle', 'spd', 4], ['a tight hamstring', 'spd', 5], ['a bruised shoulder', 'QB:pow WR:hnd', 4], ['a jammed finger', 'QB:thr WR:hnd', 4]];
  function injRoll() {
    C.inj = null;  // whatever it was, it has had its week
    if (Math.random() > 0.07) return '';
    const [what, k, n] = INJ[Math.floor(Math.random() * INJ.length)], key = k.includes(':') ? (k.split(' ').find(s => s.startsWith(C.pos + ':')) || 'x:spd').split(':')[1] : k;
    C.inj = { what, key, n };
    return ` You came out of it with ${what}: questionable for the next game.`;
  }
  function oppInj(o) {
    const r = rng(Math.imul(C.season * 7919 + LG.weekNo(C) * 131 + o * 17 + 5, 2654435761));  // scrambled: the generator's first numbers barely move from one seed to the next
    r();
    r();
    if (r() > 0.25) return null;
    const [pos, lab, pen] = [['QB', 'quarterback', 4], ['WR', 'top receiver', 2], ['RB', 'running back', 2], ['CB', 'top cornerback', 2], ['LB', 'middle linebacker', 2]][Math.floor(r() * 5)];
    return { txt: `Injury report: their ${lab}, ${PG.NAMES[Math.floor(r() * PG.NAMES.length)]}, is out`, pen, pos };
  }

  const attrName = k => (POS[C.pos].attrs.find(x => x[0] === k) || [k, k])[1];

  function hero() {
    const a = effAttrs(), x = {};
    if (C.inj && a[C.inj.key] !== undefined) a[C.inj.key] = Math.max(40, a[C.inj.key] - C.inj.n);  // playing through it
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
    x.look = C.look || null;  // his own gear and skin tone (see LOOKS): drawing only
    return { rt: ovr(), spd: BASE[POS[C.pos].base] * (1 + (a.spd - 80) * 0.004), num: C.num, name: C.name, celeb: C.celeb ?? -1, x };
  }

  /* ---------- league (the shared rules are in league.js) ---------- */
  const LG = PG.league;

  /* ---------- age ----------
     A player comes into the league at 22 and is a year older every season. Young players grow into the game, a
     player in his prime holds, and from 30 the body goes first: speed and elusiveness (and a quarterback's arm), then,
     later and more slowly, the skills. It happens once at the start of each new season and rolls no dice. */
  const PHYSICAL = ['spd', 'elu', 'pow', 'pwr'];
  const age = () => (C.age0 || 22) + C.season - 1;

  function ageOneYear() {
    if (C.season < 2 || C.agedFor === C.season) return;
    C.agedFor = C.season;
    const a = age(), changes = [];
    for (const [k, label] of POS[C.pos].attrs) {
      const body = PHYSICAL.includes(k);
      const d = a <= 25 ? 1 : a < 30 ? 0 : body ? (a <= 31 ? -1 : a <= 33 ? -2 : -3) : a >= 36 ? -2 : a >= 34 ? -1 : 0;
      if (!d) continue;
      const v = clamp(C.attrs[k] + d, 40, 99);
      if (v !== C.attrs[k]) changes.push(`${label} ${v > C.attrs[k] ? '+' : '\u2212'}${Math.abs(v - C.attrs[k])}`);
      C.attrs[k] = v;
    }
    C.ageNote = !changes.length ? `Age ${a}. In your prime: nothing lost, nothing gained over the summer.`
      : a <= 25 ? `Age ${a}. Still growing into the league: ${changes.join(', ')}.`
      : `Age ${a}. ${a >= 34 ? 'The years are catching up' : 'A step slower than last year'}: ${changes.join(', ')}.${a >= 35 ? ' Most players are retired by now.' : ''}`;
  }

  function initSeason() {
    ageOneYear();
    LG.start(C);
    C.stats = ZERO();
    C.log = [];
    setRival();
    pickGoals();
  }

  /* Your rival plays your position for the best team that is not yours. He is always near the top of the leaders,
     beating his team is worth a bonus, and finishing a season ahead of him is a trophy. The name is cosmetic, so it
     comes from Math.random and leaves seeded test runs alone. */
  /* What the rival says before you play his team, and after: chosen from how the two of you stand (your games against
     him this season, and the leaders race), with the week picking the wording. No dice. */
  function rivalSays() {
    const r = C.rival, w = C.week + C.season * 3;
    if (!r) return '';
    const met = C.log.filter(g => g.opp === r.team), L = leaders(), mine = L.rows.findIndex(x => x.me), his = L.rows.findIndex(x => x.riv);
    const say = a => a[w % a.length];
    if (met.length && met[met.length - 1].res === 'W') return say(['Lucky bounce last time. It won\u2019t happen twice.', 'They gave him one. That was the last one.', 'I\u2019ve watched that tape. I know what he does now.']);
    if (met.length && met[met.length - 1].res === 'L') return say(['Same result as last time. Mark it down.', 'He knows how this ends. He was there.', 'I\u2019d be nervous too.']);
    if (C.stats.g && mine >= 0 && his >= 0 && mine < his) return say(['Stats are for people who don\u2019t win.', 'Numbers in garbage time. Come see me in the fourth quarter.']);
    if (C.stats.g && his >= 0 && mine > his) return say(['Check the leaderboard. Then come talk to me.', 'One of us is a starter in this league. The other one is hoping.']);
    return say(['I\u2019ve seen his film. I\u2019m not worried.', 'Nice story. Let\u2019s see it against a real defense.', 'He\u2019s fine. He\u2019s not me.']);
  }

  function setRival() {
    if (C.rival && C.rival.team !== C.team) return;
    const t = TEAMS[C.team], div = TEAMS.map((_, i) => i).filter(i => i !== C.team && TEAMS[i].conf === t.conf && TEAMS[i].div === t.div);
    const team = (div.length ? div : TEAMS.map((_, i) => i).filter(i => i !== C.team)).sort((a, b) => TEAMS[b].ovr - TEAMS[a].ovr)[0];  // the best of your division: you play him twice a season
    const mine = PG.media ? PG.media.lastOf(C.name) : '', names = PG.NAMES.filter(n => n !== mine);
    C.rival = { team, name: names[Math.floor(Math.random() * names.length)] };
  }

  const recTxt = i => LG.recTxt(C, i), nextOpp = () => LG.nextOpp(C);

  /* ---------- contracts ----------
     Money is the scoreboard here, not a currency: a deal says how long you are tied to a team and what a season pays,
     and signing one pays a bonus in XP. A rookie deal comes from the draft slot. When a deal runs out every team makes
     an offer: weak teams pay more and play you more, strong teams pay less and may sit you. Nothing here rolls dice,
     so seeded test careers are unaffected. */
  const PICK_PAY = [6.5, 5.2, 4.2, 3.4, 2.7, 2.1, 1.6, 1.2], PICK_YEARS = [3, 3, 2, 2, 2, 1, 1, 1];
  const money = v => '$' + v.toFixed(1) + 'M', worth = () => clamp((ovr() - 62) * 0.32, 0.8, 12);

  /* a career saved before contracts existed is treated as being in the last year of a deal */
  function deal() {
    if (!C.deal) C.deal = { years: 1, left: 1, pay: Math.round(worth() * 10) / 10 };
    return C.deal;
  }

  function offerFrom(i) {
    const h = C.hist && C.hist[C.hist.length - 1], g = h ? h.grade : '', form = /^A/.test(g) ? 1.15 : /^B/.test(g) ? 1 : g ? 0.88 : 1;
    const pay = Math.max(0.8, Math.round(worth() * form * (1 + (85 - C.ovrs[i]) * 0.012) * (i === C.team ? 1.08 : 1) * 10) / 10);  // last season's form, how badly they need you, and a little loyalty
    const years = clamp((ovr() >= 85 ? 3 : ovr() >= 75 ? 2 : 1) + ((i + C.season) % 3 === 0 ? 1 : 0), 1, 3);
    const trust = i === C.team ? C.trust : clamp(Math.round(58 + (ovr() - C.ovrs[i]) * 1.5), 30, 85);  // a new coach: how you rate against his team decides where you start
    return { years, pay, xp: Math.round(pay * years * 6) * 10, trust, role: ROLES.find(r => trust >= r[0])[1] };
  }

  /* ---------- awards night ----------
     When the season is over the league hands out its awards. You can win them; when you do not, somebody from around
     the league does, and the nominees are named. Who the others are comes from a hash of the season and the award,
     not from the game's generator, so seeded test careers are not disturbed. Each award: [name, XP, your bar (the
     average game grade, in points, that wins it), who may win it]. */
  const AWARDS = [
    ['League MVP', 1200, (avg, fin) => avg >= 8.2 || (avg >= 7.5 && fin && fin !== 'Missed the playoffs'), 'any'],
    ['Offensive Player of the Year', 800, avg => avg >= 7, 'any'],
    ['Rookie of the Year', 700, avg => avg >= 5.6, 'rookie'],
    ['All-League', 600, avg => avg >= 6.5, 'pos']];
  const OTHER_POS = ['QB', 'RB', 'WR', 'TE', 'DE', 'LB', 'CB', 'S'];

  function awardsNight(finish, avg, L) {
    let h = (C.season * 7919 + C.team * 104729 + C.pos.charCodeAt(0) * 131) >>> 0;
    const r = () => {
      h = (h * 1664525 + 1013904223) >>> 0;
      return h / 4294967296;
    };
    const somebody = pos => {
      const t = Math.floor(r() * TEAMS.length);
      return { name: PG.NAMES[Math.floor(r() * PG.NAMES.length)], ab: TEAMS[t === C.team ? (t + 1) % TEAMS.length : t].ab, pos };
    };
    const me = { name: C.name, ab: TEAMS[C.team].ab, pos: C.pos, me: true }, night = [], won = [];
    let xp = 0;
    for (const [name, gain, bar, who] of AWARDS) {
      if (who === 'rookie' && C.season !== 1) continue;
      const wins = bar(avg, finish), close = wins || bar(avg + 1.2, finish), pos = () => who === 'pos' ? C.pos : OTHER_POS[Math.floor(r() * OTHER_POS.length)];
      const others = [somebody(pos()), somebody(pos()), somebody(pos())];
      const winner = wins ? me : others[0], noms = (close ? [me, ...others.slice(0, 2)] : others).filter(n => n !== winner);
      night.push({ a: name + (who === 'pos' ? ' · ' + POS[C.pos].label : ''), w: winner, n: noms.slice(0, 2), xp: wins ? gain : 0 });
      if (wins) {
        won.push(name);
        xp += gain;
      }
    }
    /* the statistical title at your position goes to whoever led the league: the leaders table is the record */
    const top = L.rows[0];
    if (top) {
      const title = L.label.replace(/ yards$/, '') + ' title';
      night.push({ a: title, w: top.me ? me : { name: top.name, ab: top.ab, pos: C.pos, riv: top.riv }, n: L.rows.slice(1, 3).map(x => (x.me ? me : { name: x.name, ab: x.ab, pos: C.pos, riv: x.riv })), xp: top.me ? 500 : 0,
        stat: `${fmt(top.v)} ${L.label.toLowerCase()}` });
      if (top.me) {
        won.push(title);
        xp += 500;
      }
    }
    return { night, won, xp };
  }

  /* postseason bonus and honors, once the league says the season is over */
  function closeSeason(finish) {
    let bonus = { Champion: 1500, 'Runner-up': 800, Semifinalist: 400, 'Lost in the conference final': 400, 'Lost in the divisional round': 200 }[finish] || 0;
    const reg = C.log.filter(g => g.pts !== undefined && /^Wk/.test(g.wk)), avg = reg.length ? reg.reduce((t, g) => t + g.pts, 0) / reg.length : 0;
    const L = leaders(), mine = L.rows.find(r => r.me), his = L.rows.find(r => r.riv);  // the season-long race with your rival
    const night = awardsNight(finish, avg, L), aw = night.won;
    bonus += night.xp;
    C.po.night = night.night;
    C.po.nightSeen = false;
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
    const d = deal();  // the season is paid, and the contract is a year shorter
    C.cash = Math.round(((C.cash || 0) + d.pay) * 10) / 10;
    d.left = Math.max(0, d.left - 1);
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
      add('Returns', (m.kry || 0) * 2 + (m.pry || 0) * 3 + (m.krtd || 0) * 160);
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

  /* The returner's job is its own: on by the hub switch, with its own trust. A return fumble they recover sits you
     down for two games, a run of poor returns (trust under 30) for one. */
  const retNow = () => C.pos === 'WR' && C.kr !== false && !(C.krOut > 0);
  function retAfter(m) {
    if (C.pos !== 'WR' || C.kr === false) return '';
    if (C.rt === undefined) C.rt = 60;
    if (C.krOut > 0) {
      C.krOut--;  // a game watched from the sideline on returns
      C.rt = Math.max(C.rt, C.krOut ? C.rt : 40);  // back deep next week with a clean-ish slate
      return '';
    }
    const n = (m.kr || 0) + (m.pr || 0);
    let d = n ? clamp(Math.round(((m.kry || 0) - 21 * (m.kr || 0)) / 5 + ((m.pry || 0) - 8 * (m.pr || 0)) / 2.5 + (m.krtd || 0) * 10), -12, 15) : 0;
    if (m.krf) d -= 20;
    C.rt = clamp(C.rt + d, 5, 100);
    if (m.krf) {
      C.krOut = 2;
      C.krWhy = 'fumble';
      return ' The coach has somebody else returning kicks for the next two games.';
    }
    if (C.rt < 30) {
      C.krOut = 1;
      C.krWhy = 'slump';
      return ' The coach tries somebody else on returns next week.';
    }
    return '';
  }
  function retHtml() {
    if (C.pos !== 'WR' || C.kr === false) return '';
    const rt = C.rt ?? 60, out = C.krOut > 0;
    return `<div class="trust"><span>Returner trust${out ? ' · sitting' : ''}</span><b>${rt}</b><div class="bar"><i style="width:${rt}%"></i></div></div>
  <p class="note">${out ? `Somebody else returns kicks for ${C.krOut === 1 ? 'the next game' : `the next ${C.krOut} games`}${C.krWhy === 'fumble' ? ', after the fumble' : ''}.` : 'You field their kickoffs and punts and run them back. Long returns raise this, short ones lower it. Fumble one and somebody else goes back for the rest of that game and the next two; under 30 the coach tries somebody else for a week.'}</p>`;
  }

  /* kick and punt returns, for a receiver who is the returner */
  const retLine = m => {
    const n = (m.kr || 0) + (m.pr || 0);
    return n ? ` · ${n} ret, ${(m.kry || 0) + (m.pry || 0)} yds${m.krtd ? `, ${m.krtd} TD` : ''}` : '';
  };

  function line(m) {
    if (C.pos === 'QB') return `${m.comp}/${m.att}, ${m.pyd} yds, ${m.ptd} TD, ${m.pint} INT` + (m.car ? ` · ${m.car} car, ${m.ryd} yds` : '');
    if (C.pos === 'RB') return `${m.car} car, ${m.ryd} yds, ${m.rtd} TD` + (m.rec ? ` · ${m.rec} rec, ${m.recyd} yds` : '');
    if (C.pos === 'WR') return `${m.rec} rec, ${m.recyd} yds, ${m.rectd} TD · ${m.tgt} targets` + (m.car ? ` · ${m.car} car, ${m.ryd} yds` : '') + retLine(m);  // an end around now and then
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

  /* League leaders. Every other team's starter at a position is a line of numbers drawn from that team's strength
     and a seed for the season and the team, so the race is the same every time you look, and all of one man's numbers
     agree with each other (his passer rating comes from his own attempts, yards, touchdowns and interceptions). Per
     game at 3-minute quarters; your rival plays a little above his team. Your own row is your season. */
  const rng = seed => {
    let h = seed >>> 0;
    return () => {
      h = (h * 1664525 + 1013904223) >>> 0;
      return h / 4294967296;
    };
  };

  function starter(i, pos) {
    const g = C.stats.g, k = C.ql / 180, r = rng(C.season * 131 + i * 977 + pos.charCodeAt(0) * 31 + pos.charCodeAt(1) * 7), riv = !!C.rival && C.rival.team === i && pos === C.pos;
    const q = (1 + ((C.ovrs[i] || 83) - 83) * 0.02) * (riv ? 1.2 : 0.8 + r() * 0.45), name = riv ? C.rival.name : PG.NAMES[Math.floor(r() * PG.NAMES.length)];
    const n = x => Math.round(x * g * k * (0.92 + r() * 0.16));
    if (pos === 'QB') {
      const att = n(19 + q * 3), comp = Math.round(att * clamp(0.53 + q * 0.09 + r() * 0.04, 0.5, 0.74)), pyd = Math.round(att * (6 + q * 1.3 + r() * 0.6));
      return { name, att, comp, pyd, ptd: Math.round(att * (0.022 + q * 0.02 + r() * 0.008)), pint: Math.round(att * Math.max(0.008, 0.036 - q * 0.012 + r() * 0.008)), ryd: n(6 + r() * 16) };
    }
    if (pos === 'WR') {
      const tgt = n(5.4 + q * 1.2), rec = Math.round(tgt * clamp(0.55 + q * 0.06 + r() * 0.05, 0.5, 0.76));
      return { name, tgt, rec, recyd: Math.round(rec * (11 + q * 2 + r() * 2)), rectd: Math.round(rec * (0.055 + q * 0.03 + r() * 0.02)) };
    }
    if (pos === 'RB') {
      const car = n(13 + q * 3);
      return { name, car, ryd: Math.round(car * (3.6 + q * 0.7 + r() * 0.5)), rtd: Math.round(car * (0.03 + q * 0.012)) };
    }
    if (pos === 'KR') {
      const kr = n(2.8 + r() * 1.6), pr = n(1.4 + r() * 1.6);  // about as many chances as a career returner gets, and some are a lot better at it
      return { name, kr, kry: Math.round(kr * (17 + q * 3 + r() * 7)), pr, pry: Math.round(pr * (5 + q * 2 + r() * 6)) };
    }
    if (pos === 'DE') return { name, sack: Math.round((0.32 + q * 0.28) * g * k * (0.92 + r() * 0.16) * 2) / 2 };  // sacks are shared, so they come in halves
    if (pos === 'CB') return { name, int: n(0.1 + q * 0.12) };
    return { name, tkl: n(4.6 + q * 1.6) };  // LB
  }

  // passer rating: four per-attempt parts, each held between 0 and 2.375, averaged and put over 100 (top 158.3)
  const rating = m => {
    if (!m.att) return 0;
    const f = x => clamp(x, 0, 2.375), a = f((m.comp / m.att - 0.3) * 5), b = f((m.pyd / m.att - 3) * 0.25), c = f((m.ptd / m.att) * 20), d = f(2.375 - (m.pint / m.att) * 25);
    return ((a + b + c + d) / 6) * 100;
  };

  /* [label, value, shown as, qualifies (rate stats need volume: a backup's two throws do not lead the league)] */
  const CATS = {
    QB: [['Passing yards', m => m.pyd], ['Passing TD', m => m.ptd], ['Passer rating', rating, v => v.toFixed(1), (m, g) => m.att >= 8 * g * C.ql / 180],
      ['Completion %', m => (m.att ? (m.comp / m.att) * 100 : 0), v => v.toFixed(1) + '%', (m, g) => m.att >= 8 * g * C.ql / 180], ['QB rushing yards', m => m.ryd || 0]],
    WR: [['Receiving yards', m => m.recyd], ['Receptions', m => m.rec], ['Receiving TD', m => m.rectd], ['Yards per catch', m => (m.rec ? m.recyd / m.rec : 0), v => v.toFixed(1), (m, g) => m.rec >= 1.5 * g * C.ql / 180],
      ['Targets', m => m.tgt], ['Return yards', m => (m.kry || 0) + (m.pry || 0), null, null, 'KR']],
  };
  const AROUND = [['Rushing yards', 'RB', m => m.ryd], ['Sacks', 'DE', m => m.sack, v => (v % 1 ? v.toFixed(1) : String(v))], ['Interceptions', 'CB', m => m.int], ['Tackles', 'LB', m => m.tkl]];

  /* one board: every team's man, best first; you are in it when it is your position */
  function board(label) {
    const mine = (CATS[C.pos] || []).find(c => c[0] === label), other = AROUND.find(c => c[0] === label), g = C.stats.g;
    const [, val, show, qual, as] = mine || [label, other[2], other[3]], pos = mine ? as || C.pos : other[1];  // 'as': a category from another job (each team's kick returner)
    const rows = TEAMS.map((t, i) => {
      const me = !!mine && i === C.team, m = me ? C.stats : starter(i, pos);
      return { name: me ? C.name : m.name, ab: t.ab, v: val(m), me, riv: !!mine && !me && !!C.rival && C.rival.team === i, ok: !qual || qual(m, g) };
    });
    const ranked = rows.filter(r => r.ok).sort((a, b) => b.v - a.v);
    return { label, show: show || (v => String(Math.round(v))), rows: ranked, me: rows.find(r => r.me), around: !mine };
  }

  /* the race the career cares about (awards, the rival, trophies): your position's first category */
  function leaders() {
    const b = board(CATS[C.pos][0][0]);
    return { label: b.label, rows: b.rows.map(r => ({ ...r, v: Math.round(r.v) })) };
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
   <h2>Position</h2><div class="seg" id="cp">${PLAYABLE.map(k=>`<button data-p="${k}" class="${k===st.pos?'on':''}">${POS[k].label}</button>`).join('')}</div>
   <h2>${P.label} build</h2><div class="arch" id="ca">${P.arch.map(([n,a],i)=>`<button data-a="${i}" class="${i===st.arch?'on':''}"><b>${n} · ${ovrOf(st.pos,a)} OVR</b><span>${P.attrs.map(([k,l])=>`${l} ${a[k]}`).join(' · ')}</span></button>`).join('')}</div>
   <h2>Into the league</h2><button class="btn2" id="cedt" style="margin:0 0 8px">Edit team names and colors</button><div class="teams" id="ct"><button class="tm ${st.team<0?'on':''}" data-i="-1" style="--c:var(--acc);grid-column:1/3"><i></i><b>Enter the draft</b><span>Work out at the combine first</span><u>›</u></button>
   <p class="note" style="grid-column:1/3;margin:2px 0">Or walk on with a team: no draft, no signing bonus, and you start in the rotation.</p>
   ${PG.teamGrid(st.team)}</div>
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
        keepScroll(draw);
      });
      scr.querySelectorAll('#ca button').forEach(b => b.onclick = () => {
        keep();
        st.arch = +b.dataset.a;
        keepScroll(draw);
      });
      scr.querySelectorAll('#ct button').forEach(b => b.onclick = () => {
        keep();
        st.team = +b.dataset.i;
        keepScroll(draw);
      });
      $('#cedt').onclick = () => {
        keep();
        PG.showTeams(Math.max(0, st.team), draw);  // rename teams first, then back here with what you had picked
      };
      $('#cgo').onclick = () => {
        keep();
        const [an, aa] = POS[st.pos].arch[st.arch], num = clamp(parseInt(st.num, 10) || Math.floor(rnd(1, 99)), 0, 99);
        C = { v: 1, name: st.name.trim() || 'Rookie', num, pos: st.pos, arch: an, attrs: { ...aa }, team: Math.max(0, st.team), xp: 0, xpTotal: 0, season: 1, rings: 0, ql: 180, career: ZERO(), trust: 50 };
        PG.snd('whistle');
        if (st.team < 0) {
          C.pre = {};  // at the combine: nothing is saved until the draft
          return showCombine();
        }
        C.deal = { years: 1, left: 1, pay: 0.8 };  // a walk-on plays for the minimum, one year at a time
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
    // a full first round: the grade sets the pick (a top grade goes first, a poor one late), and the pick's eight tiers the contract
    const n = TEAMS.length, pick = clamp(1 + Math.floor((100 - grade) * n / 72), 1, n), tier = Math.min(7, Math.floor((pick - 1) * 8 / n)), tm = order[pick - 1], bonus = PICK_XP[tier], pre = C.pre || {};
    delete C.pre;
    Object.assign(C, { team: tm, trust: PICK_TRUST[tier], pick, xp: C.xp + bonus, xpTotal: C.xpTotal + bonus, deal: { years: PICK_YEARS[tier], left: PICK_YEARS[tier], pay: PICK_PAY[tier] } });
    initSeason();
    C.coach = { Starter: 'Welcome. You start from day one, so do not make me regret the pick.', Rotation: 'Welcome. You will play, but the starting job is not yours yet. Earn it.', Backup: 'Welcome. You are behind some good players here. Practice hard and take your chances.' }[roleOf()[1]];
    checkTrophies();
    persist();
    const others = ['QB', 'RB', 'WR', 'LB', 'CB', 'OT', 'DE', 'S'], any = a => a[Math.floor(Math.random() * a.length)];
    // draft day on a stage first (the announcer reads the pick there), then the board
    if (PG.audio && PG.audio.voTeams) PG.audio.voTeams([PG.vk(tm)]);  // the announcer names the team: its recorded lines come down now
    if (PG.cinema) return PG.cinema('draft', { team: tm, pick, name: C.name, num: C.num, pos: C.pos }, played => draftBoard(grade, order, pick, tm, bonus, pre, others, any, played));
    draftBoard(grade, order, pick, tm, bonus, pre, others, any, false);
  }

  function draftBoard(grade, order, pick, tm, bonus, pre, others, any, played) {
    const opens = { Starter: 'you start from day one', Rotation: 'you open in the rotation', Backup: 'you open as a backup' }[roleOf()[1]];
    scr.innerHTML = `<div class="menu solid"><h1 class="sm">The <em>draft</em></h1>
  <p class="tag">${pre.dash?`Dash ${pre.dash.time.toFixed(2)} s, grade ${pre.dash.grade}${pre.work?` · drills grade ${pre.work.grade}`:''} · `:''}Draft grade ${grade}</p>
  <table class="lg">${order.map((ti,n)=>n===pick-1?`<tr class="me"><td>${n+1}. ${full(ti)}</td><td>${esc(C.name)}, ${C.pos}</td></tr>`:`<tr><td>${n+1}. ${full(ti)}</td><td>${any(PG.NAMES)}, ${any(others)}</td></tr>`).join('')}</table>
  <div class="nx"><small>Pick ${pick} of ${TEAMS.length}</small><h4>${full(tm)}</h4><p>${C.deal.years}-year contract at ${money(C.deal.pay)} a season · Signing bonus +${fmt(bonus)} XP · Coach trust ${C.trust}: ${opens}.</p></div>
  <button class="go" id="camp">Report to camp</button></div>`;
    $('#camp').onclick = () => showHub('up');
    if (played) return;  // the stage had the fanfare and the announcer
    PG.snd('fanfare');
    if (PG.audio && PG.audio.pa) PG.audio.pa(`With pick number ${pick}, the ${full(tm)} select ${C.name}.`, { announcer: true, anywhere: true, wait: 0.6,
      clips: ['pa.draft.' + pick, 'pa.select.' + PG.vk(tm)].concat(C.pos === 'QB' ? ['pa.qb'] : C.pos === 'WR' ? ['pa.wr'] : []) });  // recorded: the stadium announcer
  }

  /* ---------- hub ---------- */
  function nextCard() {
    const t = C.team;
    if (C.phase === 'done') {
      const po = C.po;
      return `<div class="nx"><small>Season ${C.season} complete</small><h4>${po.finish}</h4>
  ${po.night ? '<button class="btn2" id="an" style="margin:0 0 8px">Awards night</button>' : ''}<p>${full(t)} finished ${recTxt(t)}. ${po.champ===t?'You are the champions.':`Champion: ${full(po.champ)}.`}${po.awards&&po.awards.length?` Honors: ${po.awards.join(', ')}.`:''}${po.rival?` ${esc(po.rival)}`:''}${po.bonus?` Bonus: +${fmt(po.bonus)} XP.`:''}<br>Your season: ${line(C.stats)}.</p>
  ${deal().left>0?`<button class="go sm" id="nxs">Start season ${C.season+1}</button><p class="note" style="margin:8px 0 0">Under contract for ${deal().left} more season${deal().left>1?'s':''} at ${money(deal().pay)}.</p>`
    :`<button class="go sm" id="fa">Your contract is up · see the offers</button>`}</div>`;
    }
    const o = nextOpp(), lab = LG.label(C), pt = LG.prime(C);
    return `<div class="nx${pt?' prime':''}"><small>${lab}${pt?' · Primetime':''}${C.rival&&C.rival.team===o?' · rival game':''}</small>${matchupHtml(o)}<h4>${LG.home(C)?'vs':'at'} ${full(o)}</h4><p>${pt?'Under the lights, the whole league watching: XP +25%.<br>':''}${forecast()}${oppInj(o)?`<br>${esc(oppInj(o).txt)}.`:''}${C.inj?`<br>You are questionable with ${C.inj.what}: ${attrName(C.inj.key)} −${C.inj.n} this week.`:''}${C.rival&&C.rival.team===o?`<br>${esc(C.rival.name)} is their ${POS[C.pos].label.toLowerCase()}. Beat them for +300 XP.<br><span class="riv">\u201c${esc(rivalSays())}\u201d</span>`:''}</p>
  ${C.social&&C.social.callout&&C.social.callout.team===o?calloutHtml():''}
  ${C.rival&&C.rival.team===o&&C.phase!=='done'&&!(C.social&&C.social.mday===pracKey())?`<button class="btn2" id="mday" style="margin:0 0 8px">Media day \u00b7 one question about ${esc(C.rival.name)}</button>`:''}
  ${C.social&&C.social.offer?'<p class="note" style="margin:0 0 8px">An endorsement offer is waiting in the Social tab.</p>':''}
  <ul>${goals().map(g=>`<li>${g.d} <b>+${GOAL_XP} XP</b></li>`).join('')}</ul>
  ${C.prac!==pracKey()?'<div class="row2 pg2"><button class="btn2" id="prac">Practice · bonus XP</button><button class="go sm" id="play">Play game</button></div>':'<button class="go sm" id="play">Play game</button><p class="note" style="margin:8px 0 0">Practice is done for this week.</p>'}</div>
  ${C.news?`<p class="news">${esc(C.news)}</p>`:''}`;
  }

  const pracKey = () => C.season + '-' + C.week + '-' + C.phase;

  /* the matchup at a glance: the two teams' badges in their colors with record and rating under each, home side on
     the right as on a scoreboard, and "vs" or "at" between them */
  function matchupHtml(o) {
    const home = LG.home(C), side = i => {
      const tm = team(i);
      return `<div class="mt${i === C.team ? ' me' : ''}"><i style="--c:${tm.c1};color:${PG.inkOn(tm.c1)}">${tm.ab}</i><b>${recTxt(i)}</b><small>${C.ovrs[i]} OVR</small></div>`;
    };
    return `<div class="mu">${side(home ? o : C.team)}<div class="mv">at</div>${side(home ? C.team : o)}</div>`;
  }

  /* the season so far as a strip of chips, one a game: won, lost or tied, and the game still to come outlined. Tap
     one for its score. */
  let schedPick = -1;
  function schedHtml() {
    if (!C.log.length) return '';
    const cur = C.log.filter(g => g.season === undefined || g.season === C.season), list = cur.length ? cur : C.log, pick = schedPick >= 0 && schedPick < list.length ? schedPick : list.length - 1, g = list[pick];
    return `<h2>Your games</h2><div class="schd">${list.map((x, i) => `<button data-sg="${i}" class="${x.us > x.them ? 'w' : x.us < x.them ? 'l' : 't'}${i === pick ? ' on' : ''}" aria-label="${x.wk}: ${x.res} ${x.us} to ${x.them}"><b>${x.us > x.them ? 'W' : x.us < x.them ? 'L' : 'T'}</b><small>${team(x.opp).ab}</small></button>`).join('')}${C.phase !== 'done' ? '<span class="nxt"><b>·</b><small>next</small></span>' : ''}</div>
  <p class="schl"><b>${g.wk}</b> ${g.res} ${g.us}–${g.them} ${g.away ? 'at' : 'vs'} ${team(g.opp).name}${g.grade ? ` · grade ${g.grade}` : ''}<small>${g.line || ''}</small></p>`;
  }

  /* this week's game: the home city's weather, the same every time it is asked (so the forecast on the hub is what you
     get), and a primetime game at night */
  function gameEnv() {
    const env = PG.envFor(C.season, LG.weekNo(C), C.phase !== 'reg' || C.week >= C.sched.length - 4, LG.home(C) ? C.team : nextOpp());  // the home city's weather
    if (LG.prime(C)) env.time = 'night';
    return env;
  }
  const forecast = () => {
    const e = gameEnv();
    return e.roof ? 'Indoors, under the roof' : `${{ day: 'Afternoon', dusk: 'Dusk', night: 'Night' }[e.time] || 'Night'} game · ${{ rain: 'rain in the forecast', snow: 'snow in the forecast' }[e.weather] || 'clear skies'}`;
  };

  /* ---------- the media (words in media.js) ----------
     C.social: followers, hype (0 to 100), the feed (newest first, the last 40 posts), your quotes, an open callout of
     the next opponent, and how many callouts you have backed up or eaten. Made on first use, so older careers get it. */
  const CALL_XP = { trash: 250, guarantee: 400 };

  function social() {
    if (!C.social) C.social = { fol: Math.round(1500 + Math.max(0, ovr() - 60) * 220), hype: 10, feed: [], quotes: [], callout: null, backed: 0, ate: 0,
      coachName: 'Coach ' + PG.NAMES[Math.floor(Math.random() * PG.NAMES.length)] };
    const so = C.social, mine = PG.media.lastOf(C.name);
    if (C.rival && C.rival.name === mine) {
      // a rival sharing your surname (careers begun before this check) takes another
      const names = PG.NAMES.filter(n => n !== mine && !(so.mates || []).some(m => m.last === n));
      C.rival.name = names[Math.floor(Math.random() * names.length)];
    }
    if (!so.mates || so.matesTeam !== C.team) {
      /* the teammates who post: the same men all career on one team (new ones after a trade), none sharing your
         surname or the coach's */
      const taken = new Set([mine, so.coachName.replace('Coach ', ''), C.rival ? C.rival.name : '']), pick = a => a[Math.floor(Math.random() * a.length)];
      const name = () => {
        let l = pick(PG.NAMES), k = 0;
        while (taken.has(l) && k++ < 50) l = pick(PG.NAMES);
        taken.add(l);
        return l;
      };
      const roles = C.pos === 'QB' ? ['WR', 'TE', 'RB', 'LT', 'C'] : ['QB', 'WR', 'RB', 'LT', 'C'];
      so.mates = roles.map(role => ({ role, first: pick(PG.media.FIRST), last: name(), num: { QB: 7, WR: 81, TE: 88, RB: 23, LT: 71, C: 62 }[role] + Math.floor(Math.random() * 5) }));
      so.matesTeam = C.team;
    }
    return so;
  }

  const short = n => PG.media.short(n), signed = n => (n >= 0 ? '+' : '\u2212') + Math.abs(n);

  /* the week's posts go on top of the feed, under a heading for the week */
  function pushFeed(head, posts) {
    const so = social(), weeks = [];
    for (const p of so.feed) {
      if (p.kind === 'wk') weeks.push([p]);
      else if (weeks.length) weeks[weeks.length - 1].push(p);
    }
    so.feed = [{ kind: 'wk', text: head }, ...posts.slice(0, 32)].concat(...weeks.slice(0, 2));  // this week and the two before it, whole
  }

  function feedHtml(list) {
    return `<div class="feedl">${list.map(p => p.kind === 'wk' ? `<h2 class="fwk">${esc(p.text)}</h2>` : PG.media.postHtml(p)).join('')}</div>`;
  }

  function socHead(dFol) {
    const so = social();
    return `<div class="soch"><div><small>Followers</small><h3>${short(so.fol)}</h3>${dFol ? `<span class="${dFol > 0 ? 'up' : 'dn'}">${dFol > 0 ? '+' : '\u2212'}${short(Math.abs(dFol))} this week</span>` : ''}</div>
  <div class="hype"><span>Hype</span><b>${so.hype}</b><div class="bar"><i style="width:${so.hype}%"></i></div></div></div>`;
  }

  function calloutHtml() {
    const so = social(), c = so.callout;
    if (!c) return '';
    return `<p class="callout"><small>${c.kind === 'guarantee' ? 'Your guarantee' : 'Your callout'} \u00b7 ${esc(TEAMS[c.team].name)}</small>\u201c${esc(c.quote)}\u201d<br>${c.kind === 'guarantee' ? 'Win that game' : 'Win and play well (a B or better)'}: +${CALL_XP[c.kind]} XP. Lose and it costs you coach trust and hype.</p>`;
  }

  /* The Social tab, laid out like a profile: who you are and your numbers at the top, anything waiting on you (a
     callout to back up, an offer to answer) under that, then three small tabs. Mentions shows this week open and the
     earlier weeks folded. */
  let socTab = 'feed';

  /* small pictures for the hub's four tabs (drawn in the text color) */
  const TAB_ICON = {
    up: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5l4.5 5h-3v6h-3v-6h-3z"/></svg>',
    season: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5h8v3.2a4 4 0 01-3.2 3.9V11H11v2H5v-2h2.2V9.6A4 4 0 014 5.7zM2 3.5h1.5v2.7A2.2 2.2 0 012 4.3zm12 0v.8a2.2 2.2 0 01-1.5 1.9V3.5z"/></svg>',
    stats: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 13.5v-5h2.6v5zm4.2 0v-11h2.6v11zm4.2 0v-7.5h2.6v7.5z"/></svg>',
    social: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3h11v7.5H8.4L5 13.5v-3H2.5z"/></svg>',
  };

  /* ---------- your look ----------
     What the player wears over the team's kit, and his skin tone. Each row is one piece; 'kit' leaves it as the team
     wears it. Kept in C.look, drawn by render3d.js (lookColors) on the field and on the card at the top of the hub. */
  const SKINS = ['#f0c8a4', '#d7a078', '#b3764c', '#8a583a', '#66402e'];
  const LOOKS = [
    ['glove', 'Gloves', [['kit', 'Kit'], ['white', 'White'], ['black', 'Black'], ['team', 'Team'], ['team2', 'Second'], ['red', 'Red'], ['blue', 'Blue'], ['green', 'Green'], ['orange', 'Orange'], ['pink', 'Pink'], ['purple', 'Purple'], ['bare', 'None']]],
    ['shoe', 'Cleats', [['kit', 'Kit'], ['white', 'White'], ['black', 'Black'], ['team', 'Team'], ['team2', 'Second'], ['red', 'Red'], ['blue', 'Blue'], ['green', 'Green'], ['orange', 'Orange'], ['pink', 'Pink'], ['purple', 'Purple']]],
    ['sock', 'Socks', [['kit', 'Kit'], ['white', 'White'], ['black', 'Black'], ['team', 'Team'], ['team2', 'Second']]],
    ['visor', 'Visor', [['kit', 'Dark'], ['clear', 'Clear'], ['silver', 'Mirror'], ['team', 'Team'], ['red', 'Red'], ['blue', 'Blue'], ['orange', 'Orange'], ['purple', 'Purple']]],
    ['mask', 'Facemask', [['kit', 'Grey'], ['black', 'Black'], ['white', 'White'], ['team', 'Team'], ['team2', 'Second']]],
    ['trim', 'Arm bands', [['kit', 'Kit'], ['white', 'White'], ['black', 'Black'], ['team', 'Team'], ['none', 'None']]],
    ['arm', 'Sleeves', [['kit', 'None'], ['white', 'White'], ['black', 'Black'], ['team', 'Team'], ['team2', 'Second']]],
    ['towel', 'Towel', [['kit', 'None'], ['white', 'White'], ['black', 'Black'], ['team', 'Team'], ['team2', 'Second'], ['red', 'Red'], ['blue', 'Blue'], ['pink', 'Pink']]],
  ];
  const lookOf = k => (C.look && C.look[k]) || 'kit';
  const lookSum = () => {
    const bits = LOOKS.filter(([k]) => lookOf(k) !== 'kit').map(([k, l, o]) => `${l.toLowerCase()} ${(o.find(x => x[0] === lookOf(k)) || ['', ''])[1].toLowerCase()}`);
    return bits.length ? bits.slice(0, 3).join(' · ') + (bits.length > 3 ? ` · +${bits.length - 3}` : '') : 'Team kit';
  };
  const lookHtml = () => `<h2>Skin tone</h2><div class="seg wrap" data-lk="skin">${SKINS.map((c, i) => `<button data-v="${i}" class="${C.look && C.look.skin === i ? 'on' : ''}" aria-label="Skin tone ${i + 1}"><i class="dot" style="--c:${c}"></i>${i + 1}</button>`).join('')}</div>`
    + LOOKS.map(([k, l, o]) => `<h2>${l}</h2><div class="seg wrap" data-lk="${k}">${o.map(([v, n]) => `<button data-v="${v}" class="${lookOf(k) === v ? 'on' : ''}">${n}</button>`).join('')}</div>`).join('')
    + '<p class="note">Your own gear over the team\u2019s kit. It shows on the field and on your card.</p>';

  /* ---------- posting, and messages ----------
     Once a week you may post: thanks to the fans (followers), talking up the next game (hype), or a word for a
     teammate (a little coach trust). The post goes in your mentions with two replies under it. And each week brings
     three direct messages about your last game: from home, from your agent, from a teammate. Flavor, except the post. */
  const anyOf = a => a[Math.floor(Math.random() * a.length)];

  function socialPost(kind) {
    const so = social(), L = PG.media.lastOf(C.name), t = TEAMS[C.team], last = C.log[C.log.length - 1], next = C.phase === 'done' ? null : TEAMS[nextOpp()];
    const mate = anyOf(so.mates), won = last && last.us > last.them;
    const text = kind === 'fans' ? anyOf([`${t.city}, I hear you every single snap. Thank you.`, 'Best fans in the league. Not close.', won ? 'That one was for everybody in the building. See you next week.' : 'We owe you a better one. You will get it.'])
      : kind === 'hype' ? anyOf([next ? `${next.name} week. Circle it.` : 'The work does not stop.', next ? `Cannot wait for ${next.city}. Bring the noise.` : 'Offseason? What offseason.', 'Locked in. That is the post.'])
      : anyOf([`Nobody works like #${mate.num}. ${mate.first} ${mate.last}, that is my guy.`, `Shout out ${mate.first} ${mate.last}. Makes my job easy.`, `${mate.first} ${mate.last} does the dirty work every week. Put some respect on it.`]);
    const up = Math.round(so.fol * (kind === 'fans' ? 0.02 : 0.01)) + (kind === 'fans' ? 40 : 15);
    so.fol += up;
    so.hype = clamp(so.hype + (kind === 'hype' ? 7 : kind === 'fans' ? 2 : 1), 0, 100);
    if (kind === 'mate') C.trust = clamp(C.trust + 1, 5, 100);
    const fan = { who: anyOf(PG.media.FIRST) + ' ' + anyOf(PG.NAMES)[0] + '.', at: t.name.toLowerCase().replace(/[^a-z]/g, '') + 'fan' + (10 + Math.floor(Math.random() * 89)), kind: 'fan', col: t.c1, text: anyOf(kind === 'hype' ? ['LET’S GO', 'Inject this into my veins.', 'Sunday cannot come soon enough.'] : kind === 'fans' ? ['We ride with you.', 'This is why he is my favorite player.', 'Class act.'] : ['Good teammate. Love to see it.', 'The locker room is right.', 'That is leadership.']), likes: Math.round(so.fol * 0.004) + 3, rt: 1, rep: 0, ago: 'now' };
    const reply = { who: `${mate.first} ${mate.last}`, at: mate.last.toLowerCase() + mate.num, kind: 'mate', col: t.c1, ver: true, text: kind === 'mate' ? anyOf(['Right back at you.', 'Appreciate you, brother.', 'Just doing my job.']) : anyOf(['Facts.', 'Say it louder.', 'Let’s work.']), likes: Math.round(so.fol * 0.006) + 5, rt: 2, rep: 1, ago: 'now' };
    const post = { who: C.name, at: L.toLowerCase() + C.num, kind: 'me', col: t.c1, ver: so.fol >= 10000, text, likes: Math.round(so.fol * 0.07) + 20, rt: Math.round(so.fol * 0.012) + 3, rep: Math.round(so.fol * 0.006) + 2, ago: 'now', replies: [fan, reply] };
    if (!so.feed.length) so.feed = [{ kind: 'wk', text: LG.short(C) }];
    so.feed.splice(1, 0, post);
    so.posted = pracKey();
    persist();
    PG.snd('chime');
    PG.toast(`Posted · +${short(up)} followers`);
  }

  function dms() {
    const so = social();
    if (so.dmKey === pracKey()) return so.dms || [];
    const last = C.log[C.log.length - 1], next = C.phase === 'done' ? null : TEAMS[nextOpp()], mate = anyOf(so.mates), wk = LG.short(C), out = [];
    if (last) {
      const won = last.us > last.them, good = 'AB'.includes(String(last.grade)[0]);
      out.push({ from: 'Mom', text: won ? anyOf(['We watched the whole thing. Your father yelled at the TV the entire fourth quarter. So proud of you.', 'A win! Call me when you are home. And eat something.']) : anyOf(['Tough one, honey. You will get them next week. Call your mother.', 'Do not read the comments tonight. We love you.']), wk });
      out.push({ from: 'Your agent', text: good ? anyOf([`A ${last.grade} on the film. Games like that are how the next contract gets written.`, 'Phones are ringing after that one. Keep stacking them.']) : anyOf(['Flush it. One game does not change what teams think of you. Bounce back.', 'Quiet week on my end. Give me something to sell on Sunday.']), wk });
      out.push({ from: `${mate.first} ${mate.last}`, text: won ? anyOf(['Told you we had them. Film at 8, do not be late.', 'That is how it is supposed to look. Same thing next week.']) : anyOf(['We are better than that. Extra work tomorrow, you in?', 'On to the next. I got your back.']), wk });
    } else {
      out.push({ from: 'Mom', text: 'First game this week! We will be watching. Wear your mouthguard.', wk });
      out.push({ from: 'Your agent', text: 'Welcome to the league. Play well and the rest takes care of itself.', wk });
      out.push({ from: `${mate.first} ${mate.last}`, text: 'Rookie. Playbook. Tonight. See you at the facility.', wk });
    }
    if (next && C.rival && C.rival.team === nextOpp()) out.unshift({ from: C.rival.name, text: anyOf(['See you Sunday. Bring your best, you will need it.', 'Hope you are ready. I am.']), wk });
    so.dms = out.concat(so.dms || []).slice(0, 10);
    so.dmKey = pracKey();
    persist();
    return so.dms;
  }

  function tabSocial() {
    const so = social(), t = TEAMS[C.team], L = PG.media.lastOf(C.name), deals = so.deals || [], ver = so.fol >= 10000;
    const weeks = [];
    for (const p of so.feed) {
      if (p.kind === 'wk') weeks.push({ head: p.text, posts: [] });
      else if (weeks.length) weeks[weeks.length - 1].posts.push(p);
    }
    const st = (k, l) => `<button data-st="${k}" class="${socTab === k ? 'on' : ''}">${l}</button>`;
    let body = '';
    if (socTab === 'feed') body = weeks.length ? weeks.map((w, n) => n === 0 ? `<h2 class="fwk">${esc(w.head)}</h2>${feedHtml(w.posts)}`
      : `<details class="fwkd"><summary><span>${esc(w.head)}</span><small>${w.posts.length} posts</small></summary>${feedHtml(w.posts)}</details>`).join('')
      : `<p class="note">${C.log.length ? 'Your mentions start with your next game.' : 'Play a game and the internet will have something to say.'}</p>`;
    else if (socTab === 'rec') body = so.quotes.length ? `<ul class="quotes">${so.quotes.map(q => `<li><span class="tone t-${q.tone}">${PG.media.TONE[q.tone] || q.tone}</span>“${esc(q.q)}”<small>${esc(q.wk)}</small></li>`).join('')}</ul>`
      : '<p class="note">Your answers at the podium and at media day are kept here.</p>';
    else if (socTab === 'dm') body = `<ul class="quotes dml">${dms().map(m => `<li><b>${esc(m.from)}</b>${esc(m.text)}<small>${esc(m.wk)}</small></li>`).join('')}</ul>`;
    else body = (deals.length ? deals.map(x => `<div class="xp deal"><span><i class="dot" style="--c:${x.col}"></i>${esc(x.name)} · ${esc(x.kind)}</span><b>+${fmt(x.pay)} XP a game</b></div>`).join('') : '<p class="note">No partners yet.</p>')
      + '<p class="note">Two games in a row with hype at 55 or more bring an offer. A deal pays every game until your hype falls under 25. Two at most.</p>';
    return `<div class="sprof" style="--c:${t.c1}"><span class="av" style="--c:${t.c1};color:${PG.inkOn(t.c1)}${PG.inkOn(t.c1) === '#fff' ? '' : ';text-shadow:none'}">${esc(L.slice(0, 2).toUpperCase())}</span><div><b>${esc(C.name)}${ver ? '<i class="ver" aria-label="verified"></i>' : ''}</b><span>@${esc(L.toLowerCase())}${C.num} · ${esc(t.name)} ${C.pos} #${C.num}</span></div></div>
  <div class="sstats"><div><b>${short(so.fol)}</b><span>Followers</span></div><div><b>${so.hype}</b><span>Hype</span></div><div><b>${so.backed}–${so.ate}</b><span>Callouts</span></div><div><b>${deals.length}</b><span>Partners</span></div></div>
  <div class="hypebar"><i style="width:${so.hype}%"></i></div>
  ${calloutHtml()}${offerHtml()}
  ${so.posted !== pracKey() ? `<div class="spost"><small>Post something \u00b7 once a week</small><div class="seg wrap"><button data-sp="fans">Thank the fans</button><button data-sp="hype">${C.phase === 'done' ? 'Stay hungry' : 'Hype the next game'}</button><button data-sp="mate">Shout out a teammate</button></div></div>` : ''}
  <div class="seg stab">${st('feed', 'Mentions')}${st('dm', 'Messages')}${st('rec', 'On the record')}${st('deals', 'Partners')}</div>${body}`;
  }

  /* ---------- endorsements ----------
     Two games in a row ending with hype at 55 or more bring an offer from a brand: XP to sign and XP every game while
     the deal lasts, the pay set by your following. At most two deals. An offer left alone is gone after two games,
     and a brand walks away when your hype falls under 25. The brands are invented. */
  const BRANDS = [['Apex Cleats', 'cleats', '#2d6cdf', 'Built for the ones who finish.'], ['Gridline', 'sports drinks', '#16a37a', 'Fuel for four quarters.'],
    ['Northfield Motors', 'trucks', '#8a3b3b', 'Tough enough for the long haul.'], ['Crisp Co.', 'chips', '#c2410c', 'Game day tastes better.'],
    ['Volt Mobile', 'phones', '#7c3aed', 'Never miss a moment.'], ['Ironhouse Gym', 'gyms', '#475569', 'Earned, not given.'],
    ['Ridgeline Watches', 'watches', '#0f766e', 'Every second counts.'], ['Bluepeak Insurance', 'insurance', '#1d4ed8', 'Protection you can count on.']];
  const brandPost = (b, text, k) => {
    const so = social(), v = so.fol * 0.02 * (k || 1);
    return { who: b.name, at: b.name.replace(/[^A-Za-z]/g, ''), bio: `Official partner \u00b7 ${b.kind}`, kind: 'brand', col: b.col, ver: true, text, likes: Math.round(v + 30), rt: Math.round(v * 0.15 + 4), rep: Math.round(v * 0.08 + 2), ago: 'now' };
  };

  /* after each game, once hype has moved: offers come and go, deals end; returns the posts that go with it */
  function endorseWeek() {
    const so = social(), out = [];
    so.deals = so.deals || [];
    so.hot = so.hype >= 55 ? (so.hot || 0) + 1 : 0;
    if (so.offer && ++so.offer.age > 2) so.offer = null;
    if (so.hype < 25 && so.deals.length) {
      const d = so.deals.pop();
      out.push(brandPost(d, `${d.name} and ${C.name} have parted ways. We wish him well.`, 0.6));
    }
    if (!so.offer && so.hot >= 2 && so.deals.length < 2) {
      const have = new Set(so.deals.map(d => d.name)), pool = BRANDS.filter(([n]) => !have.has(n)), [name, kind, col, line] = pool[Math.floor(Math.random() * pool.length)];
      const pay = clamp(Math.round(so.fol / 500) * 10, 80, 500);
      so.offer = { name, kind, col, line, pay, bonus: pay * 4, age: 0 };
      so.hot = 0;  // the next offer takes another two big weeks
    }
    return out;
  }

  function offerHtml() {
    const o = social().offer;
    if (!o) return '';
    return `<div class="offer" style="--c:${o.col}"><small>Endorsement offer</small><b>${esc(o.name)}</b><span>${esc(o.kind)} \u00b7 +${fmt(o.bonus)} XP to sign \u00b7 +${fmt(o.pay)} XP every game</span>
  <div class="ofb"><button class="btn2" data-of="y">Sign</button><button class="btn2" data-of="n">Pass</button></div><p class="note">Keep your hype above 25 or the brand walks away. Two deals at most.</p></div>`;
  }

  /* the posts of the week go in under its heading (sign a deal after the reaction, and it is part of that week) */
  function addToFeed(posts) {
    const so = social();
    if (!so.feed.length) so.feed = [{ kind: 'wk', text: LG.short(C) }];
    so.feed.splice(1, 0, ...posts);
  }

  /* sign or pass; then draw again */
  function answerOffer(yes, redraw) {
    const so = social(), o = so.offer;
    if (!o) return;
    so.offer = null;
    if (yes) {
      so.deals = (so.deals || []).concat({ name: o.name, kind: o.kind, col: o.col, pay: o.pay });
      C.xp += o.bonus;
      C.xpTotal += o.bonus;
      const L = PG.media.lastOf(C.name);
      addToFeed(PG.media.stamp([brandPost(o, `Welcome to the ${o.name} family, ${C.name}. ${o.line}`, 1.4),
        { who: `${TEAMS[C.team].name} Faithful`, at: `${TEAMS[C.team].name}Faithful`, kind: 'fan', col: TEAMS[C.team].c1, text: `${L} with the ${o.name} deal \ud83d\udcb0 Get that bag.`, likes: Math.round(so.fol * 0.01 + 10), rt: Math.round(so.fol * 0.002), rep: Math.round(so.fol * 0.002) }]));
      PG.snd('buy');
      PG.banner('Deal signed', `${o.name} \u00b7 +${fmt(o.bonus)} XP`, 2200);
    }
    persist();
    redraw();
  }

  /* ---------- media day ----------
     The week of a rival game: one question about him, from the hub. What you say counts like an answer at the podium,
     and a callout made here is settled in that game. Once a week. */
  function showMediaDay() {
    const so = social(), o = nextOpp(), wk = LG.short(C);
    const ctx = { name: C.name, pos: C.pos, team: C.team, opp: o, next: o, m: ZERO(), us: 0, them: 0, won: false, pts: 7, star: false, rival: C.rival, rivalGame: true, fol: so.fol, mates: so.mates, coachName: so.coachName, week: C.log.length, wk };
    const q = PG.media.mediaDay(ctx), trust0 = C.trust, hype0 = so.hype, fol0 = so.fol, [f, l] = q.by.split(' ');
    scr.innerHTML = `<div class="menu solid press"><div class="prh"><small>Media day \u00b7 ${esc(wk)} \u00b7 rival week</small><h3>One question</h3></div>
  <div class="pq"><div class="rpt"><span class="av" style="--c:#2f6fb5">${esc(f[0] + l[0])}</span><div><b>${esc(q.by)}</b><span>${esc(q.outlet)}</span></div></div><p>\u201c${esc(q.q)}\u201d</p></div>
  <div class="pa">${q.answers.map((a, k) => `<button class="ans" data-k="${k}"><span class="tone t-${a.tone}">${PG.media.TONE[a.tone]}</span>${esc(a.t)}</button>`).join('')}</div>
  <button class="btn2" id="mdback">Not today</button></div>`;
    $('#mdback').onclick = () => showHub('up');
    scr.querySelectorAll('.ans').forEach(b => b.onclick = () => {
      const a = q.answers[+b.dataset.k];
      C.trust = clamp(C.trust + a.trust, 5, 100);
      so.hype = clamp(so.hype + a.hype, 0, 100);
      if (a.hype > 0) so.fol += Math.round(so.fol * 0.004 * a.hype);
      if (a.call) so.callout = { team: o, quote: a.t, kind: a.call, wk };
      so.quotes.unshift({ wk: wk + ' media day', q: a.t, tone: a.tone });
      so.quotes = so.quotes.slice(0, 20);
      so.mday = pracKey();
      const said = PG.media.stamp(PG.media.quoteReaction(ctx, a, q.about, q.topic));
      pushFeed(`Media day \u00b7 ${wk} \u00b7 rival week vs ${TEAMS[o].name}`, said);
      persist();
      PG.snd('tick');
      scr.innerHTML = `<div class="menu solid press"><div class="prh"><small>Media day \u00b7 ${esc(wk)}</small><h3>On the record</h3></div>
  <ul class="quotes"><li><span class="tone t-${a.tone}">${PG.media.TONE[a.tone]}</span>\u201c${esc(a.t)}\u201d</li></ul>
  <div class="fxs"><span>Coach trust <b>${signed(C.trust - trust0)}</b> (now ${C.trust})</span><span>Hype <b>${signed(so.hype - hype0)}</b></span><span>Followers <b>+${short(so.fol - fol0)}</b></span></div>
  ${calloutHtml()}${feedHtml(said)}<button class="go" id="mddone">Back to the hub</button></div>`;
      $('#mddone').onclick = () => showHub('up');
    });
  }

  /* After the game: three questions at the podium (or walk out), a summary of what your answers did, then the
     reaction online. Each answer takes effect as you give it. */
  function showPress(ctx, posts, dFol0, done) {
    const so = social(), qs = PG.media.press(ctx), picks = [], fol0 = so.fol, trust0 = C.trust, hype0 = so.hype;
    if (ctx.asked) C.pressSeen = (C.pressSeen || []).concat(ctx.asked).slice(-7);  // the topics of the last two or three weeks are not asked again while others fit
    let i = 0, said = [];
    const give = (a, q) => {
      C.trust = clamp(C.trust + a.trust, 5, 100);
      const h = a.hype > 0 && ctx.pts < 5 ? Math.round(a.hype / 2) : a.hype;  // big talk after a poor game draws less of a crowd
      so.hype = clamp(so.hype + h, 0, 100);
      if (h > 0) so.fol += Math.round(so.fol * 0.004 * h);  // a quote people talk about brings people in
      if (a.call && ctx.next != null) so.callout = { team: ctx.next, quote: a.t, kind: a.call, wk: ctx.wk };
      so.quotes.unshift({ wk: ctx.wk, q: a.t, tone: a.tone });
      so.quotes = so.quotes.slice(0, 20);
      picks.push(a);
      said = said.concat(PG.media.quoteReaction(ctx, a, q.about, q.topic));
      persist();
    };
    const summary = walked => {
      const net = C.trust - trust0, tones = picks.map(p => p.tone);
      C.coachPress = walked ? 'You walked past the podium. Next time you face them. That is part of the job.' : PG.media.coachOnPress(net, tones, ctx.pts >= 7);
      persist();
      const lead = posts.filter(p => p.kind === 'trend' || p === posts[0]), all = PG.media.stamp(lead.concat(said, posts.filter(p => !lead.includes(p)))), dFol = so.fol - fol0 + dFol0;  // the game first, then what you said, then everyone else
      scr.innerHTML = `<div class="menu solid press"><div class="prh"><small>Press conference \u00b7 ${esc(ctx.wk)}</small><h3>${walked ? 'No comment' : 'On the record'}</h3></div>
  ${picks.length ? `<ul class="quotes">${picks.map(p => `<li><span class="tone t-${p.tone}">${PG.media.TONE[p.tone]}</span>\u201c${esc(p.t)}\u201d</li>`).join('')}</ul>` : '<p class="note">You walked out without answering a question. The reporters wrote about that instead.</p>'}
  <div class="fxs"><span>Coach trust <b>${signed(net)}</b> (now ${C.trust})</span><span>Hype <b>${signed(so.hype - hype0)}</b></span><span>Followers <b>${dFol >= 0 ? '+' : '\u2212'}${short(Math.abs(dFol))}</b></span></div>
  <p class="coach"><small>${esc(so.coachName)}</small>${esc(C.coachPress)}</p>${calloutHtml()}
  <button class="go" id="prgo">See the reaction</button></div>`;
      $('#prgo').onclick = () => {
        pushFeed(ctx.head, all);
        persist();
        showFeed(all, dFol, ctx, done);
      };
    };
    const draw = () => {
      const q = qs[i], [f, l] = q.by.split(' ');
      scr.innerHTML = `<div class="menu solid press"><div class="prh"><small>Press conference \u00b7 ${esc(ctx.wk)}</small><h3>Question ${i + 1} of ${qs.length}</h3><div class="dots">${qs.map((_, k) => `<i class="${k < i ? 'd' : k === i ? 'on' : ''}"></i>`).join('')}</div></div>
  <div class="pq"><div class="rpt"><span class="av" style="--c:#2f6fb5">${esc(f[0] + l[0])}</span><div><b>${esc(q.by)}</b><span>${esc(q.outlet)}</span></div></div><p>\u201c${esc(q.q)}\u201d</p></div>
  <div class="pa">${q.answers.map((a, k) => `<button class="ans" data-k="${k}"><span class="tone t-${a.tone}">${PG.media.TONE[a.tone]}</span>${esc(a.t)}</button>`).join('')}</div>
  ${i === 0 ? '<button class="btn2" id="nocom">No comment \u00b7 walk out</button><p class="note">Humble and team-first answers build the coach\u2019s trust. Confidence and trash talk build hype, and cost trust unless you play like it. A callout of your next opponent follows you into that game.</p>' : ''}</div>`;
      scr.querySelectorAll('.ans').forEach(b => b.onclick = () => {
        give(q.answers[+b.dataset.k], q);
        PG.snd('tick');
        if (++i < qs.length) draw();
        else summary(false);
      });
      const nc = $('#nocom');
      if (nc) nc.onclick = () => {
        C.trust = clamp(C.trust - 1, 5, 100);
        so.hype = clamp(so.hype - 2, 0, 100);
        said.push({ who: 'Pocket Sports Wire', at: 'PocketSportsWire', kind: 'press', col: '#2f6fb5', ver: true, text: `${C.name} declined to speak to reporters after the game.`, likes: Math.round(so.fol * 0.01), rt: Math.round(so.fol * 0.002), rep: Math.round(so.fol * 0.003), ago: 'now' });
        persist();
        summary(true);
      };
    };
    draw();
  }

  function showFeed(posts, dFol, ctx, done) {
    const fire = ctx.buzz >= 7;
    scr.innerHTML = `<div class="menu solid feed"><div class="prh"><small>The reaction \u00b7 ${esc(ctx.wk)}</small><h3>${fire ? 'Your mentions are on fire' : ctx.buzz >= 4 || ctx.star || ctx.callRes ? 'People are talking' : 'A quiet week online'}</h3></div>
  ${socHead(dFol)}${social().offer && social().offer.age === 0 ? offerHtml() : ''}${feedHtml(posts)}<button class="go" id="fdgo">Continue</button></div>`;
    $('#fdgo').onclick = done;
    scr.querySelectorAll('[data-of]').forEach(b => b.onclick = () => answerOffer(b.dataset.of === 'y', () => {
      const f = scr.querySelector('.offer');
      if (f) f.outerHTML = `<p class="callout ok"><small>${b.dataset.of === 'y' ? 'Deal signed' : 'Offer passed'}</small>${b.dataset.of === 'y' ? 'It is in your Social tab, and it pays every game.' : 'There will be others if the hype holds.'}</p>`;
    }));
  }

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
    return (C.coach || C.coachPress ? `<p class="coach">${C.coach ? `<small>Coach</small>${esc(C.coach)}` : ''}${C.coachPress ? `<small${C.coach ? ' class="c2"' : ''}>${C.coach ? 'On your press conference' : 'Coach, on your press conference'}</small>${esc(C.coachPress)}` : ''}</p>` : '') + `<div class="trust"><span>Coach trust · ${role}</span><b>${C.trust}</b><div class="bar"><i style="width:${C.trust}%"></i></div></div>`
      + (up ? `<details class="inf"><summary>${Math.round(sh*10)} of 10 drives · ${up[1]==='Starter'?'starter':'rotation'} at ${up[0]}</summary><p class="note">You play about ${Math.round(sh*10)} of every 10 of your unit's drives. Good games and practice raise the coach's trust; at ${up[0]} you ${up[1]==='Starter'?'become the starter':'join the rotation'}.</p></details>` : '');
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
      + schedHtml();
  }

  const retTot = m => {
    const n = (m.kr || 0) + (m.pr || 0), y = (m.kry || 0) + (m.pry || 0);
    return n ? `${n} for ${y} yards${m.krtd ? `, ${m.krtd} TD` : ''}` : 'none';
  };

  function tabStats() {
    const cols = COLS[C.pos], row = (l, m) => `<tr><td>${l}</td>${cols.map(([,k])=>`<td>${m[k]}</td>`).join('')}</tr>`;
    return `<table class="lg"><tr><th></th>${cols.map(([h])=>`<th>${h}</th>`).join('')}</tr>${row('Season',C.stats)}${row('Career',C.career)}</table>
  ${C.pos==='WR'&&(C.career.kr||C.career.pr)?`<p class="note">Returns · this season ${retTot(C.stats)} · career ${retTot(C.career)}</p>`:''}
  ${leadersHtml()}${historyHtml()}${trophiesHtml()}
  ${C.log.length?`<h2>Game log</h2><table class="lg">${C.log.map(g=>`<tr><td>${g.wk} vs ${team(g.opp).ab}${g.grade?' · '+g.grade:''}<small>${g.line}</small></td></tr>`).join('')}</table>`:'<p class="note">Your game log shows up here after your first game.</p>'}`;
  }

  /* season by season; a career begun before this table existed only lists the seasons finished since */
  function historyHtml() {
    const h = C.hist || [];
    if (!h.length) return '';
    return `<h2>Season by season</h2><table class="lg">${h.map(x=>`<tr><td>Season ${x.season} · ${team(x.team).name} ${x.rec} · ${x.finish||'Missed the playoffs'}<small>${x.line}${x.grade?' · average grade '+x.grade:''} · ${x.ovr} overall${x.awards&&x.awards.length?' · '+x.awards.join(', '):''}</small></td></tr>`).join('')}</table>`;
  }

  let ldCat = null;  // the leader board on show (kept while the hub is open)

  function leadersHtml() {
    if (!C.stats.g) return '';
    const mine = CATS[C.pos].map(c => c[0]), all = mine.concat(AROUND.map(c => c[0]));
    if (!all.includes(ldCat)) ldCat = mine[0];
    const B = board(ldCat), at = B.rows.findIndex(r => r.me), you = B.me;
    const chip = l => `<button data-ld="${esc(l)}" class="${l === ldCat ? 'on' : ''}">${esc(l)}</button>`;
    return `<h2>League leaders</h2><div class="ldk"><small>${esc(POS[C.pos].label)}s</small><div class="seg wrap ld">${mine.map(chip).join('')}</div>
  <small>Around the league</small><div class="seg wrap ld">${AROUND.map(c => chip(c[0])).join('')}</div></div>
  <table class="lg ldt"><tr><th>${esc(B.label)}</th><th></th></tr>${B.rows.slice(0, 5).map((r, i) => `<tr class="${r.me ? 'me' : ''}"><td><i class="rk">${i + 1}</i>${esc(r.name)} <span style="color:var(--mute)">${r.ab}${r.riv ? ' \u00b7 your rival' : ''}</span></td><td>${B.show(r.v)}</td></tr>`).join('')}
  ${!B.around && at > 4 ? `<tr class="me"><td><i class="rk">${at + 1}</i>${esc(C.name)}</td><td>${B.show(you.v)}</td></tr>` : ''}
  ${!B.around && at < 0 && you ? `<tr class="me"><td><i class="rk">\u2013</i>${esc(C.name)} <span style="color:var(--mute)">not enough ${C.pos === 'QB' ? 'attempts' : 'catches'} yet</span></td><td>${B.show(you.v)}</td></tr>` : ''}</table>`;
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
  <div class="pc" style="--c:${team(C.team).c1};margin-top:14px"><div><h3>${esc(C.name)}</h3><p>#${C.num} · ${POS[C.pos].label} · age ${age()}<br>${C.season} season${C.season>1?'s':''} · ${m.g} games · ${rank()}</p></div><div class="ovr">${ovr()}<small>OVR</small></div></div>
  <div class="nx"><small>Career totals</small><h4>${line(m)}</h4><p>${C.rings} title${C.rings===1?'':'s'} · ${(C.awards||[]).length} honor${(C.awards||[]).length===1?'':'s'} · ${fmt(C.xpTotal)} XP earned · ${money(C.cash || 0)} in salary</p></div>
  <div class="nx"><small>Hall of fame case</small><h4>${fame.verdict}</h4>
  <div class="trust" style="margin:8px 0 6px"><span>Score · 100 is a first-ballot career</span><b>${fame.score}</b><div class="bar"><i style="width:${Math.min(100,fame.score)}%"></i></div></div>
  <p>${fame.parts.map(([l,v])=>`${l} ${v}`).join(' · ')}</p></div>
  ${historyHtml()}${trophiesHtml()}
  <button class="go" id="keep">Keep playing</button><div class="stack"><button class="btn2" id="rt">Retire · put it to the hall of fame vote</button><button class="btn2 warn" id="nc">Erase and start a new career</button></div>
  <p class="note">Either way a new career replaces this one, and it cannot be undone. Retiring keeps this one in the hall of fame; erasing does not.</p></div>`;
    $('#nc').onclick = () => {
      C = null;
      try {
        localStorage.removeItem(KEY);
      } catch (_) {}
      showCreate();
    };
    $('#keep').onclick = () => showHub('up');
    $('#rt').onclick = () => {
      const tm = C.team, e = retireToHall();
      C = null;
      try {
        localStorage.removeItem(KEY);
      } catch (_) {}
      // voted in: the induction on a stage first (your bust unveiled), then the hall
      if (e.inducted && PG.cinema) PG.cinema('hof', { team: tm, name: e.name, num: e.num, pos: e.pos, seasons: e.seasons, rings: e.rings, verdict: e.verdict, cls: e.cls }, () => showHall(e));
      else showHall(e);
    };
  }

  /* the ceremony: every award, who won it and who else was up for it */
  /* Awards night as a ceremony: the honors are read out from the smallest to the biggest (the statistical title
     first, the MVP last). Each card starts sealed with its nominees on it; the stadium announcer introduces the award,
     a drum roll, then the winner's name comes up to applause, louder and with a fanfare when it is you. "Reveal all"
     opens every card at once, and Continue works at any point. With the sound off the cards open on a timer. */
  const AW_CLIP = a => (/^League MVP/.test(a) ? 'mvp' : /^Offensive/.test(a) ? 'opoy' : /^Rookie/.test(a) ? 'roy' : /^All-League/.test(a) ? 'all' : 'title');
  const AW_SAY = { mvp: 'And now, the league’s Most Valuable Player. The winner is...', opoy: 'The Offensive Player of the Year award goes to...', roy: 'This year’s Rookie of the Year is...',
    all: 'Named to this year’s All-League team...', title: 'This season’s statistical champion at the position is...' };

  function showAwards(then) {
    const po = C.po, list = (po.night || []).slice().reverse(), mine = list.filter(x => x.w.me);
    po.nightSeen = true;
    persist();
    const who = x => `${esc(x.name)} <span class="aw-t">${x.ab}${x.me ? ' · you' : x.riv ? ' · your rival' : ''}</span>`;
    const noms = x => [x.w, ...x.n].map(n => esc(n.name) + (n.me ? ' (you)' : '')).sort().join(', ');
    scr.innerHTML = `<div class="menu solid" id="awn"><h1 class="sm">Awards <em>night</em></h1>
  <p class="tag">Season ${C.season} is in the books. The league hands out its awards.</p>
  ${list.map((x, k) => `<div class="nx aw sealed" data-k="${k}"><small>${esc(x.a)}</small><h4 class="aw-w">${who(x.w)}</h4><p class="aw-s">Nominees: ${noms(x)}</p>
  <p class="aw-r">${x.stat ? esc(x.stat) + ' · ' : ''}${x.n.length ? 'Also nominated: ' + x.n.map(who).join(', ') : ''}${x.xp ? `<br><b>+${fmt(x.xp)} XP</b>` : ''}</p></div>`).join('')}
  ${po.rival ? `<p class="note">${esc(po.rival)}</p>` : ''}
  <div class="stack"><button class="btn2" id="awall">Reveal all</button><button class="go" id="awgo" style="margin-top:0">Continue</button></div></div>`;
    const root = $('#awn'), cards = [...scr.querySelectorAll('.nx.aw')], A = PG.audio;
    let i = 0, live = true;
    const here = () => live && document.body.contains(root);
    const open = (k, loud) => {
      const card = cards[k], x = list[k];
      if (!card || !card.classList.contains('sealed')) return;
      card.classList.remove('sealed', 'calling');
      if (x.w.me) card.classList.add('won');
      if (loud) {
        PG.snd('applause', { level: x.w.me ? 0.85 : 0.5, dur: x.w.me ? 3.4 : 2.2 });
        if (x.w.me) PG.snd('fanfare');
      }
    };
    const step = () => {
      if (!here()) return;
      if (i >= list.length) {
        if (A && A.pa) A.pa('Congratulations to all of this year’s winners.', { announcer: true, anywhere: true, wait: 0.6, clips: ['pa.aw.close'] });
        $('#awall').hidden = true;
        return;
      }
      const k = i, key = AW_CLIP(list[k].a), len = A && A.pa ? A.pa(AW_SAY[key], { announcer: true, anywhere: true, wait: 0.1, clips: ['pa.aw.' + key] }) : 0;
      cards[k].classList.add('calling');
      cards[k].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      const roll = len ? len * 1000 + 150 : 900;
      setTimeout(() => {
        if (!here()) return;
        PG.snd('roll', { dur: 0.9 });
        setTimeout(() => {
          if (!here()) return;
          open(k, true);
          i++;
          setTimeout(step, 1500);
        }, 950);
      }, roll);
    };
    const first = A && A.pa ? A.pa('Ladies and gentlemen, welcome to the league’s awards night.', { announcer: true, anywhere: true, wait: 0.3, clips: ['pa.aw.open'] }) : 0;
    setTimeout(step, first ? first * 1000 + 600 : 500);
    $('#awall').onclick = () => {
      live = false;  // the ceremony stops; every card opens, with one round of applause
      cards.forEach((_, k) => open(k, false));
      PG.snd('applause', { level: mine.length ? 0.8 : 0.5, dur: 2.4 });
      if (mine.length) PG.snd('fanfare');
      $('#awall').hidden = true;
    };
    $('#awgo').onclick = () => {
      live = false;
      (then || (() => showHub('season')))();
    };
  }

  /* ---------- the hall of fame ----------
     Every career that is retired (not erased) is put to the vote and kept here for good, on this device. The case is
     fameCase(); 70 gets you in. */
  const HOF = 'pg.hof';

  function retireToHall() {
    const fame = fameCase(), hall = load(HOF, []), t = team(C.team);
    const e = { name: C.name, num: C.num, pos: POS[C.pos].label, team: `${t.city} ${t.name}`, c1: t.c1, seasons: C.season, age: age(), games: C.career.g, line: line(C.career), rings: C.rings,
      honors: (C.awards || []).map(a => a.name), score: fame.score, verdict: fame.verdict, inducted: fame.score >= 70, cls: hall.length + 1 };
    hall.push(e);
    save(HOF, hall);
    return e;
  }

  function showHall(fresh) {
    const hall = load(HOF, []).slice().sort((a, b) => (b.inducted - a.inducted) || b.score - a.score), ins = hall.filter(e => e.inducted).length;
    const honors = e => {
      const n = {};
      for (const h of e.honors || []) n[h] = (n[h] || 0) + 1;
      return Object.entries(n).map(([k, v]) => v > 1 ? `${v}x ${k}` : k).join(', ');
    };
    scr.innerHTML = `<div class="menu solid"><button class="back" id="bk">‹ Back</button><h1 class="sm">Hall of <em>fame</em></h1>
  <p class="tag">${ins} enshrined${hall.length > ins ? ` · ${hall.length - ins} more retired` : ''}. Retire a career to put it to the vote: a case of 70 gets in.</p>
  ${fresh ? `<div class="nx aw${fresh.inducted ? ' won' : ''}"><small>The vote · class of ${fresh.cls}</small><h4>${fresh.inducted ? `${esc(fresh.name)} is a hall of famer` : `${esc(fresh.name)} falls short`}</h4>
  <p>${esc(fresh.verdict)} · case ${fresh.score}${fresh.inducted ? '' : ' of the 70 it takes'}</p></div>` : ''}
  ${hall.length ? hall.map(e => `<div class="pc hof" style="--c:${e.c1}"><div><h3>${esc(e.name)}</h3><p>#${e.num} · ${esc(e.pos)} · ${esc(e.team)}<br>${e.seasons} season${e.seasons === 1 ? '' : 's'}${e.age ? `, retired at ${e.age}` : ''} · ${e.games} games · ${e.rings} title${e.rings === 1 ? '' : 's'}<br>${esc(e.line)}${e.honors && e.honors.length ? `<br>${esc(honors(e))}` : ''}</p></div><div class="ovr">${e.score}<small>${e.inducted ? 'HOF' : 'CASE'}</small></div></div>`).join('')
    : '<p class="note">Nobody yet. A career you retire from its Retire screen is put to the vote here.</p>'}
  ${fresh ? '<button class="go" id="hnew">Start a new career</button>' : ''}</div>`;
    $('#bk').onclick = fresh ? () => showCreate() : () => PG.showMenu();
    if ($('#hnew')) $('#hnew').onclick = showCreate;
    if (fresh && fresh.inducted) PG.snd('fanfare');
  }

  /* free agency: when your contract has run out, every team makes an offer and you choose one */
  function showFreeAgency() {
    const offers = TEAMS.map((_, i) => offerFrom(i)), show = [C.team, ...TEAMS.map((_, i) => i).filter(i => i !== C.team).sort((a, b) => offers[b].pay - offers[a].pay).slice(0, 7)];  // your team and the seven that want you most
    scr.innerHTML = `<div class="menu solid"><button class="back" id="bk">‹ Back</button><h1 class="sm">Contract <em>offers</em></h1>
  <p class="tag">Your contract is up: your team and the seven others that want you most have made offers. Weak teams pay more and will play you; strong teams pay less. Signing pays its bonus in XP at once.</p>
  <h2>Offers</h2><div class="offers">${show.map(i=>{const t=TEAMS[i],o=offers[i];return`<button class="tm of ${i===C.team?'on':''}" data-i="${i}" style="--c:${t.c1}"><i></i><b>${t.city} ${t.name}${i===C.team?' · re-sign':''}</b><span>${o.years} season${o.years>1?'s':''} at ${money(o.pay)} · +${fmt(o.xp)} XP · ${o.role}</span><u>${C.ovrs[i]}</u></button>`}).join('')}</div>
  <p class="note">The number on the right is the team's rating. Starter, Rotation or Backup is where their coach would put you on day one.</p></div>`;
    $('#bk').onclick = () => showHub('season');
    scr.querySelectorAll('.tm').forEach(b => b.onclick = () => {
      const i = +b.dataset.i, o = offers[i], moved = i !== C.team;
      if (moved) C.trust = o.trust;
      C.team = i;
      C.deal = { years: o.years, left: o.years, pay: o.pay };
      C.xp += o.xp;
      C.xpTotal += o.xp;
      C.season++;
      initSeason();
      C.coach = moved ? `Welcome to ${TEAMS[i].city}. ${{ Starter: 'You are my starter. Play like it.', Rotation: 'You will play, and the starting job is there to be won.', Backup: 'You are behind good players here. Practice hard and take your chances.' }[o.role]}`
        : 'Glad you are staying. Same deal as ever: the job is earned every week.';
      persist();
      showHub('up');
      PG.banner(moved ? 'Signed' : 'Re-signed', `${esc(C.name)}, ${o.years} season${o.years>1?'s':''} with the ${full(i)}`, 2600);
    });
  }

  /* your player in his team's home uniform, when the 3D renderer is running */
  function kit() {
    const url = PG.r3d && PG.r3d.portrait ? PG.r3d.portrait(TEAMS[C.team], true, C.num, C.look || null) : null;
    return url ? `<img class="kit" src="${url}" alt="">` : '';
  }

  /* A player who is not starting may ask out once a season: the weakest other team always has room for a starter. */
  const canTrade = () => roleOf()[1] !== 'Starter' && C.phase === 'reg' && C.tradeSeason !== C.season;
  const tradeTo = () => TEAMS.map((_, i) => i).filter(i => i !== C.team).sort((a, b) => C.ovrs[a] - C.ovrs[b])[0];

  function showHub(tab) {
    tab = tab || 'up';
    const t = team(C.team);
    let sure = false;  // the trade button has been tapped once
    let setOpen = false;  // the game settings are folded away until asked for
    let lookOpen = false;  // and so is the player's look
    let moreOpen = false;  // and the rarely used buttons: edit the teams, ask for a trade, retire
    const draw = () => {
      scr.innerHTML = `<div class="menu solid"><button class="back" id="bk">‹ Menu</button>
  <div class="pc${kit()?' k':''}" style="--c:${t.c1}">${kit()}<div><h3>${esc(C.name)}</h3><p>#${C.num} · ${POS[C.pos].label} · age ${age()} · ${esc(C.arch)}<br>${full(C.team)} · Season ${C.season} · ${rank()}${C.rings?` · ${C.rings} title${C.rings>1?'s':''}`:''}${C.awards&&C.awards.length?` · ${C.awards.length} honor${C.awards.length>1?'s':''}`:''}</p></div><div class="ovr">${ovr()}<small>OVR</small></div></div>
  <div class="xp2"><div><span>To spend</span><b>${fmt(C.xp)} XP</b></div><div><span>Contract</span><b class="dl">${deal().left>0?`${money(deal().pay)} · ${deal().left} of ${deal().years} left`:'Up for renewal'}</b></div></div>
  ${trustHtml()}
  ${C.ageNote && C.week === 0 && C.phase === 'reg' ? `<p class="note">${esc(C.ageNote)}</p>` : ''}
  ${nextCard()}
  <div class="tabs itabs" style="margin-top:16px">${[['up','Upgrade'],['season','Season'],['stats','Stats'],['social','Social']].map(([k,l])=>`<button data-t="${k}" class="${k===tab?'on':''}">${TAB_ICON[k]}<span>${l}</span></button>`).join('')}</div>
  ${tab==='up'?tabUp():tab==='season'?tabSeason():tab==='social'?tabSocial():tabStats()}
  <div class="hset${setOpen?' open':''}"><button class="hsum" id="hset" aria-expanded="${setOpen}"><b>Game settings</b><span>${DIFFS[C.diff??1]} · ${C.ql/60}-min quarters${C.pos==='WR'?` · ${C.kr===false?'offense only':'returns kicks'}`:''}</span></button>
  ${setOpen?`  <h2>Difficulty</h2><div class="seg" id="hd">${DIFFS.map((d,i)=>`<button data-d="${i}" class="${i===(C.diff??1)?'on':''}">${d}</button>`).join('')}</div>
  <p class="note">How good the other teams are. All-Pro pays 20% more XP.</p>
  ${C.pos==='WR'?`<h2>Special teams</h2><div class="seg" id="hk">${[[1,'Return kicks'],[0,'Offense only']].map(([v,l])=>`<button data-k="${v}" class="${v===(C.kr===false?0:1)?'on':''}">${l}</button>`).join('')}</div>
  ${retHtml()}`:''}
  <h2>Quarter length</h2><div class="seg" id="hq">${[60,120,180].map(q=>`<button data-q="${q}" class="${q===C.ql?'on':''}">${q/60} min</button>`).join('')}</div>
  <h2>Touchdown celebration</h2><div class="seg wrap" id="hc">${['Mix it up',...PG.CELEBS].map((n,i)=>`<button data-c="${i-1}" class="${i-1===(C.celeb??-1)?'on':''}">${n}</button>`).join('')}</div>`:''}</div>
  <div class="hset${lookOpen?' open':''}"><button class="hsum" id="hlook" aria-expanded="${lookOpen}"><b>Your look</b><span>${lookSum()}</span></button>
  ${lookOpen?lookHtml():''}</div>
  <div class="hset${moreOpen?' open':''}"><button class="hsum" id="hmore" aria-expanded="${moreOpen}"><b>Career options</b><span>Teams${canTrade()?' · trade':''} · retire</span></button>
  ${moreOpen?`<div class="stack"><button class="btn2" id="edt">Edit team names and colors</button>${canTrade()?`<button class="btn2" id="trade">${sure?`Tap again to join the ${full(tradeTo())}`:'Ask for a trade'}</button>`:''}<button class="btn2 warn" id="ret">Retire</button></div>
  ${canTrade()?'<p class="note">A trade sends you to the weakest other team as its starter, once a season.</p>':''}`:''}</div></div>`;
      $('#bk').onclick = PG.showMenu;
      $('#hset').onclick = () => {
        setOpen = !setOpen;  // stays as you left it while the hub is open
        keepScroll(draw);
      };
      scr.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
        tab = b.dataset.t;
        sure = false;
        keepScroll(draw);
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
      scr.querySelectorAll('#hk button').forEach(b => b.onclick = () => {
        C.kr = b.dataset.k === '1';
        persist();
        keepScroll(draw);
      });
      scr.querySelectorAll('#hq button').forEach(b => b.onclick = () => {
        C.ql = +b.dataset.q;
        pickGoals();
        persist();
        keepScroll(draw);
      });
      scr.querySelectorAll('[data-of]').forEach(b => b.onclick = () => answerOffer(b.dataset.of === 'y', () => keepScroll(draw)));
      scr.querySelectorAll('[data-ld]').forEach(b => b.onclick = () => {
        ldCat = b.dataset.ld;
        keepScroll(draw);
      });
      scr.querySelectorAll('[data-sp]').forEach(b => b.onclick = () => {
        socialPost(b.dataset.sp);
        keepScroll(draw);
      });
      const hm = $('#hmore');
      if (hm) hm.onclick = () => {
        moreOpen = !moreOpen;
        keepScroll(draw);
      };
      scr.querySelectorAll('[data-sg]').forEach(b => b.onclick = () => {
        schedPick = +b.dataset.sg;
        PG.snd('tick');
        keepScroll(draw);
      });
      const hl = $('#hlook');
      if (hl) hl.onclick = () => {
        lookOpen = !lookOpen;
        keepScroll(draw);
      };
      scr.querySelectorAll('[data-lk] button').forEach(b => b.onclick = () => {
        const k = b.parentNode.dataset.lk;
        C.look = Object.assign({}, C.look, { [k]: k === 'skin' ? +b.dataset.v : b.dataset.v });
        persist();
        PG.snd('tick');
        keepScroll(draw);
      });
      scr.querySelectorAll('[data-st]').forEach(b => b.onclick = () => {
        socTab = b.dataset.st;
        keepScroll(draw);
      });
      scr.querySelectorAll('.fwkd summary').forEach(b => b.onclick = () => setTimeout(() => PG.snd('tick'), 0));
      const md = $('#mday');
      if (md) md.onclick = showMediaDay;
      scr.querySelectorAll('#hc button').forEach(b => b.onclick = () => {
        C.celeb = +b.dataset.c;
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
      const an = $('#an');
      if (an) an.onclick = () => showAwards();
      const fa = $('#fa');
      if (fa) fa.onclick = showFreeAgency;
      const tr = $('#trade');
      if (tr) tr.onclick = () => {
        if (!sure) {
          sure = true;
          return keepScroll(draw);
        }
        const to = tradeTo();
        Object.assign(C, { team: to, trust: 66, tradeSeason: C.season, coach: 'New team, clean slate. You are starting for us: show me why we made the call.' });
        setRival();
        pickGoals();
        persist();
        showHub('up');
        PG.banner('Traded', `${esc(C.name)} goes to the ${full(to)}`, 2600);
      };
      if ($('#ret')) $('#ret').onclick = showRetire;  // these two are inside the folded Career options card
      if ($('#edt')) $('#edt').onclick = () => PG.showTeams(C.team, () => showHub(tab));
    };
    draw();
  }

  const keepScroll = draw => PG.keepScroll(draw);  // redraw without losing the place on the page

  /* ---------- playing a game ---------- */
  function play() {
    const opp = nextOpp();
    PG.snd('whistle');
    const call = C.social && C.social.callout && C.social.callout.team === opp ? C.social.callout.kind : null;
    /* a rival game opens with the two of you face to face at midfield: his words, and yours if you called him out */
    const rivalry = C.rival && C.rival.team === opp ? { name: C.rival.name, quote: rivalSays(), mine: C.social && C.social.callout && C.social.callout.team === opp ? C.social.callout.quote : '' } : null;
    const pt = LG.prime(C), env = gameEnv();
    PG.startGame({ a: C.team, b: opp, ql: C.ql, mode: 'career', lock: POS[C.pos].role, hero: hero(), ovr: [C.ovrs[C.team], C.ovrs[opp] - (oppInj(opp) ? oppInj(opp).pen : 0)], diff: C.diff ?? 1, share: share(), callout: call, rivalry,
      away: !LG.home(C), kr: retNow(), prime: pt, around: LG.preWeek && LG.full(C) ? LG.preWeek(C) : null, highs: Object.assign({}, C.highs || {}),
      mustWin: C.phase !== 'reg', env, line: chip, goals: m => goals().map(g => ({ d: g.d, ok: !!g.t(m) })), onEnd: r => gameEnd(r, opp), onQuit: () => showHub('up') });
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
    const items = base.concat(hard, star ? [['Player of the game', 300]] : [], beatRival ? [['Beat your rival', 300]] : []), met = gl.filter(g => g.ok).length, [pts, grade] = gradeOf(m, won, met);
    const prime = LG.prime(C), playoff0 = C.phase !== 'reg', away = !LG.home(C);
    const inj0 = C.inj;  // what you played through, for the room to ask about
    const streak = k => {
      let n = 0;
      for (let i = C.log.length - 1; i >= 0 && C.log[i].res === k; i--) n++;
      return n;
    };
    if (away && won) items.push(['Won on the road', 100]);  // a win in their building is worth a little more
    if (prime) items.push(['Primetime game', Math.round(base.reduce((t, [, v]) => t + v, 0) * 0.25)]);
    /* Player of the Week in your conference: a win, and an A+ or (one time in three, other men had big weeks too) an A */
    const potw = !playoff0 && won && (grade === 'A+' || (grade === 'A' && rnd() < 0.35)), confName = PG.data.CONF[TEAMS[C.team].conf];
    if (potw) {
      items.push([`${confName} ${C.pos === 'QB' || C.pos === 'WR' ? 'Offensive' : 'Defensive'} Player of the Week`, 400]);
      C.potw = (C.potw || 0) + 1;
    }
    /* career highs: a single game's best, stat by stat */
    const hi = C.highs || (C.highs = {}), HL = { pyd: 'passing yards', ptd: 'touchdown passes', comp: 'completions', recyd: 'receiving yards', rec: 'catches', rectd: 'touchdown catches', ryd: 'rushing yards', kry: 'kick return yards' }, newHighs = [];
    for (const k in HL) if ((m[k] || 0) > (hi[k] || 0)) {
      if ((hi[k] || 0) > 0) newHighs.push(`${m[k]} ${HL[k]}`);
      hi[k] = m[k];
    }
    /* last week's callout: settled now if this was the team you called out (and dropped if it was not) */
    const so = social(), call = so.callout, callRes = call && call.team === opp ? { ...call, backed: call.kind === 'guarantee' ? won : won && pts >= 5 } : null;
    so.callout = null;
    if (callRes && callRes.backed) items.push([callRes.kind === 'guarantee' ? 'Backed up your guarantee' : 'Backed up your words', CALL_XP[callRes.kind]]);
    const deals = so.deals || [];
    if (deals.length) items.push([deals.length > 1 ? 'Endorsements' : `Endorsement \u00b7 ${deals[0].name}`, deals.reduce((t, d) => t + d.pay, 0)]);
    const xp = items.reduce((t, [, v]) => t + v, 0) + met * GOAL_XP;
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
    if (callRes) {
      // the coach likes a player who backs up his mouth, and hates one who hands the other side a speech
      C.trust = clamp(C.trust + (callRes.backed ? 2 : callRes.kind === 'guarantee' ? -5 : -3), 5, 100);
      if (callRes.backed) so.backed++;
      else so.ate++;
    }
    const retNote = retAfter(m) + injRoll();
    const role1 = roleOf()[1], dTrust = C.trust - t0;
    const moved = role1 === role0 ? '' : ROLES.findIndex(r => r[1] === role1) < ROLES.findIndex(r => r[1] === role0) ? ` The coach moves you up: ${role1.toLowerCase()}.` : ` The coach moves you down: ${role1.toLowerCase()}.`;
    const wk = LG.short(C), playoff = C.phase !== 'reg';
    C.log.push({ wk, opp, us, them, res, line: line(m), grade, pts, met, away });
    C.news = headline(m, won, us, them, opp);
    if (potw) C.news += `. Named the ${confName} Player of the Week`;
    if (C.rival && C.rival.team === opp && us !== them) C.news += won ? `. ${C.rival.name} left without talking to reporters.` : `. ${C.rival.name}, afterward: \u201cTold you.\u201d`;
    const fin = LG.advance(C, opp, us, them);
    if (C.phase === 'qf' || C.phase === 'semi' || C.phase === 'final' || (fin && fin !== 'Missed the playoffs')) C.madePO = 1;
    if (fin) {
      if (fin === 'Champion') {
        C.rings++;
        if (PG.milestones) PG.milestones.earn('title');
      }
      closeSeason(fin);
    } else pickGoals();
    C.coach = coachSays(m, grade, pts, won, met, role0, role1);
    /* the media: how loud the reaction is, what it does to your following, and what the reporters will ask */
    let weak = '';
    if (C.pos === 'QB') weak = m.pint > 1 ? `${m.pint} interceptions` : m.pint === 1 ? 'an interception' : m.att >= 6 && m.comp / m.att < 0.5 ? `${m.comp} of ${m.att} passing` : '';
    if (C.pos === 'WR') weak = m.tgt >= 3 && m.rec / m.tgt < 0.5 ? `${m.rec} catches on ${m.tgt} targets` : m.tgt === 0 ? 'not one target all day' : m.tgt === 1 ? 'one target all day' : '';
    // coachLine: his first sentence, or the first two when the first is only a word or two ("Solid.")
    const ctx = { name: C.name, pos: C.pos, team: C.team, opp, won, us, them, m, pts, star, rival: C.rival, rivalGame: !!C.rival && C.rival.team === opp, playoff, callRes, coachName: so.coachName, away, prime, inj: inj0, season: C.season, left: deal().left, seen: C.pressSeen || [],
      streakW: won ? streak('W') : 0, streakL: !won && us !== them ? streak('L') : 0,
      coachLine: (C.coach.match(/^[^.!?]{12,}[.!?]|^[^.!?]+[.!?][^.!?]+[.!?]/) || [C.coach])[0].trim(), next: C.phase === 'done' ? null : nextOpp(), week: C.log.length, wk, head: `${wk} \u00b7 ${res} ${us}\u2013${them} vs ${TEAMS[opp].name}`, weak, role0, role1, mates: so.mates,
      roleUp: ROLES.findIndex(r => r[1] === role1) < ROLES.findIndex(r => r[1] === role0) };
    const bz = PG.media.buzzOf(ctx), fol0 = so.fol;
    so.hype = clamp(Math.round(so.hype * 0.8 + bz.b * 3 + (callRes ? (callRes.backed ? 12 : -20) : 0)), 0, 100);
    /* followers: a big day brings thousands (more when you are already hyped), a quiet one loses a few, and eating
       your words costs one in twenty-five */
    so.fol = Math.max(300, Math.round(callRes && !callRes.backed ? so.fol * 0.96 : so.fol + (bz.b >= 3 ? so.fol * (0.002 + bz.b * bz.b * 0.0012) * (1 + so.hype / 100) + bz.b * 40 : -so.fol * 0.003)));
    ctx.fol = so.fol;
    ctx.buzz = bz.b;
    ctx.trending = bz.b >= 7.5 || (!!callRes && callRes.backed);
    if (prime) so.hype = clamp(so.hype + 6, 0, 100);  // the nation saw it
    const posts = PG.media.reaction(ctx).concat(endorseWeek()), dFol = so.fol - fol0;
    if (potw) posts.unshift({ who: 'The League', at: 'theleague', bio: 'Official account', kind: 'press', col: '#334155', ver: true, text: `${C.name} is the ${confName} Player of the Week. ${line(m)} against the ${TEAMS[opp].name}.`, rep: 120 + Math.round(so.fol / 400), rt: 300 + Math.round(so.fol / 150), likes: 1800 + Math.round(so.fol / 20) });
    const trophies = checkTrophies();
    persist();
    const show = () => {
      // drawn again after watching the play of the game
      scr.innerHTML = `<div class="sheet" style="max-height:80%"><div class="shd"><b>${won?'Victory':res==='T'?'Tie game':'Final'}</b><span>${wk} · ${us}–${them} vs ${team(opp).ab}</span></div>
  <div class="nx" style="margin-top:0"><small>Your game · grade ${grade}</small><h4>${line(m)}</h4><p style="margin:4px 0 0">${esc(C.news)}</p></div>
  ${callRes?`<p class="callout ${callRes.backed?'ok':'no'}"><small>${callRes.backed?'You backed it up':'You ate your words'}</small>\u201c${esc(callRes.quote)}\u201d</p>`:''}
  <ul class="gl">${gl.map(g=>`<li class="${g.ok?'ok':'no'}"><span>${g.d}</span><b>${g.ok?'+'+GOAL_XP:'0'}</b></li>`).join('')}
  ${items.map(([l,v])=>`<li><span>${l}</span><b>+${fmt(v)}</b></li>`).join('')}
  <li class="tot"><span>XP earned</span><b>+${fmt(xp)}</b></li></ul>
  ${newHighs.length?`<p class="note hi">New career high${newHighs.length>1?'s':''}: ${newHighs.join(', ')}.</p>`:''}
  ${r.potgHtml || ''}${r.potdHtml || ''}${r.scoringHtml || ''}<p class="note">Coach trust ${C.trust} (${dTrust>=0?'+':''}${dTrust}).${moved}${retNote}</p>${trophies.length?`<p class="note">Trophy earned: ${trophies.join(', ')}.</p>`:''}
  <button class="go" id="rc">To the podium</button></div>`;
      $('#rc').onclick = () => {
        PG.toMenu();
        const press = () => showPress(ctx, posts, dFol, () => {
          if (C.phase === 'done' && C.po.night && !C.po.nightSeen) showAwards();
          else showHub(C.phase === 'done' ? 'season' : 'up');
        });
        // first the podium itself, then the questions
        if (PG.cinema) PG.cinema('podium', { team: C.team, name: C.name, num: C.num, head: ctx.head }, press);
        else press();
      };
      if ($('#potd')) $('#potd').onclick = () => PG.watchPotd(show);
    };
    if (C.phase === 'done' && C.po.finish === 'Champion') {
      // the title is won on the field first: the trophy at midfield, then the results
      if (PG.playScene) PG.playScene('trophy', { season: C.season, name: C.name }, () => {
        show();
        PG.banner('Champions!', full(C.team), 3000);
      });
      else show();
    } else show();
  }

  PG.career = {
    hall() {
      PG.toMenu();
      showHall(null);
    },
    get hallSize() {
      return load(HOF, []).length;
    },
    open() {
      PG.toMenu();
      C ? (C.pre ? showCombine() : showHub('up')) : showCreate();
    },
    summary() {
      if (!C || C.pre) return null;
      const ph = LG.stage(C);
      return `Continue: ${esc(C.name)} · ${C.pos} · ${ovr()} OVR · ${TEAMS[C.team].name}, season ${C.season}, ${ph}`;
    },
    /* test hook */
    get data() {
      return C;
    }
  };
})();
