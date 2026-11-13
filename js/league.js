/* Pocket Gridiron: the league that Career and Season modes share.
   32 teams in two conferences of four divisions (data.js). A ten-week season: the three division rivals twice (weeks
   1-3 and 8-10) and the four teams of another division of the same conference (weeks 4-7, a different one each
   season). The four division winners of each conference make the playoffs, seeded by record: 1 v 4 and 2 v 3 in the
   divisional round, then the conference finals, then the championship.
   A save from before the league grew (eight teams, a seven-week round robin, a four-team playoff) has no L.fmt: it
   finishes its season the old way, and its next season starts in the full league.
   Every function works on a plain save object L that has { team } and gets
   { fmt, ovrs, week, phase, sched, tab, po, around, lg } filled in. phase is 'reg', 'qf', 'semi', 'final' or 'done'. */
(() => {
  'use strict';
  const { TEAMS, rnd, pick, clamp } = PG;
  const { CONF, DIV } = PG.data;
  const full2 = L => L.fmt === 2;
  const ids = L => [...Array(L.tab.length).keys()];  // the teams in this league (eight in a season saved before it grew)
  const divOf = i => TEAMS[i].conf * 4 + TEAMS[i].div;
  const divTeams = (conf, div) => TEAMS.map((_, i) => i).filter(i => TEAMS[i].conf === conf && TEAMS[i].div === div);
  const divName = i => `${CONF[TEAMS[i].conf]} ${DIV[TEAMS[i].div]}`;

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd(i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* the old league: every team meets every other once (the circle method) */
  function roundRobin(n) {
    const t = shuffle([...Array(n).keys()]), rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const week = [];
      for (let i = 0; i < n / 2; i++) week.push([t[i], t[n - 1 - i]]);
      rounds.push(week);
      t.splice(1, 0, t.pop());
    }
    return rounds;
  }

  /* The full league's ten weeks. Every week every team plays, so each week is 16 games. lg counts the seasons: which
     division of its conference a division crosses over with turns over from one season to the next. */
  function schedule(lg) {
    const divs = [];
    for (let c = 0; c < 2; c++) for (let d = 0; d < 4; d++) divs.push(shuffle(divTeams(c, d)));
    const rr = g => [[[g[0], g[1]], [g[2], g[3]]], [[g[0], g[2]], [g[1], g[3]]], [[g[0], g[3]], [g[1], g[2]]]];  // a division's three rounds
    const first = [0, 1, 2].map(r => divs.flatMap(g => rr(g)[r]));
    const second = [2, 0, 1].map(r => divs.flatMap(g => rr(g)[r].map(([a, b]) => [b, a])));  // the return games, the other way round
    const pairs = [[[0, 1], [2, 3]], [[0, 2], [1, 3]], [[0, 3], [1, 2]]][(lg || 0) % 3], cross = [];
    for (let r = 0; r < 4; r++) {
      const week = [];
      for (let c = 0; c < 2; c++) for (const [x, y] of pairs) {
        const X = divs[c * 4 + x], Y = divs[c * 4 + y];
        for (let i = 0; i < 4; i++) week.push(r % 2 ? [Y[(i + r) % 4], X[i]] : [X[i], Y[(i + r) % 4]]);
      }
      cross.push(week);
    }
    return [...first, ...shuffle(cross), ...second];
  }

  /* a save's ratings cover every team, also one made before the league grew */
  function fix(L) {
    if (L.ovrs && L.ovrs.length < TEAMS.length) L.ovrs = L.ovrs.concat(TEAMS.slice(L.ovrs.length).map(t => t.ovr));
  }

  /* a new season: ratings drift a little from the last one */
  function start(L) {
    fix(L);
    L.ovrs = L.ovrs ? L.ovrs.map(o => clamp(o + Math.round(rnd(-3, 3)), 76, 93)) : TEAMS.map(t => t.ovr);
    L.fmt = 2;
    L.lg = (L.lg || 0) + 1;
    L.week = 0;
    L.phase = 'reg';
    L.sched = schedule(L.lg);
    L.tab = TEAMS.map(() => ({ w: 0, l: 0, t: 0, pf: 0, pa: 0 }));
    L.po = null;
    L.around = [];
  }

  function record(L, a, b, sa, sb) {
    const A = L.tab[a], B = L.tab[b];
    A.pf += sa;
    A.pa += sb;
    B.pf += sb;
    B.pa += sa;
    if (sa > sb) {
      A.w++;
      B.l++;
    } else if (sb > sa) {
      B.w++;
      A.l++;
    } else {
      A.t++;
      B.t++;
    }
  }

  /* a simulated final score, on the same scale as played games */
  function simScore(L, a, b) {
    const pa = 1 / (1 + Math.pow(10, -(L.ovrs[a] - L.ovrs[b]) / 10)), aWins = rnd() < pa;
    const w = pick([10, 13, 14, 17, 17, 20, 21, 24, 27, 31]), l = Math.max(0, w - pick([1, 3, 3, 4, 7, 7, 10, 10, 14]));
    return aWins ? [w, l] : [l, w];
  }

  const simWinner = (L, a, b) => {
    const [x, y] = simScore(L, a, b);
    return x > y ? a : b;
  };

  /* better record first, then points for minus points against */
  const better = L => (a, b) => {
    const A = L.tab[a], B = L.tab[b];
    return (B.w + B.t / 2) - (A.w + A.t / 2) || (B.pf - B.pa) - (A.pf - A.pa);
  };
  const seeds = L => ids(L).sort(better(L));
  /* a conference's playoff seeds: its four division winners, best record first */
  const confSeeds = (L, c) => [0, 1, 2, 3].map(d => divTeams(c, d).sort(better(L))[0]).sort(better(L));
  const recTxt = (L, i) => {
    const r = L.tab[i];
    return `${r.w}-${r.l}${r.t ? '-' + r.t : ''}`;
  };
  const label = L => L.phase === 'reg' ? `Week ${L.week + 1} of ${L.sched.length}` : L.phase === 'qf' ? 'Playoffs · Divisional round' : L.phase === 'semi' ? (full2(L) ? 'Playoffs · Conference final' : 'Playoffs · Semifinal') : 'Championship game';
  const short = L => L.phase === 'reg' ? `Wk ${L.week + 1}` : L.phase === 'qf' ? 'Divisional' : L.phase === 'semi' ? (full2(L) ? 'Conf. final' : 'Semifinal') : 'Final';
  /* the week of the year, for the weather and the light: the playoffs come after the last regular week */
  const weekNo = L => L.phase === 'reg' ? L.week : L.sched.length + ({ qf: 0, semi: 1, final: 2 }[L.phase] ?? 2) - (full2(L) ? 0 : 1);
  /* the words for each stage, for the hubs' "continue" lines */
  const stage = L => L.phase === 'reg' ? `week ${L.week + 1}` : L.phase === 'qf' ? 'divisional round' : L.phase === 'semi' ? (full2(L) ? 'conference final' : 'semifinal') : L.phase === 'final' ? 'championship game' : 'offseason';

  function nextOpp(L) {
    if (L.phase !== 'reg') return L.po.opp;
    const m = L.sched[L.week].find(p => p.includes(L.team));
    return m[0] === L.team ? m[1] : m[0];
  }

  /* The user's game is over: record it, simulate the rest, move the season on. Returns how the season ended
     ('Champion', 'Runner-up', 'Lost in the conference final', 'Lost in the divisional round', 'Semifinalist' in the
     old league, 'Missed the playoffs') or null if it goes on. */
  function advance(L, opp, us, them) {
    const won = us > them, end = finish => {
      L.po.finish = finish;
      L.phase = 'done';
      return finish;
    };
    if (L.phase === 'reg') {
      record(L, L.team, opp, us, them);
      L.around = [];
      for (const [a, b] of L.sched[L.week]) {
        if (a === L.team || b === L.team) continue;
        const [sa, sb] = simScore(L, a, b);
        record(L, a, b, sa, sb);
        L.around.push([a, sa, b, sb]);
      }
      L.week++;
      if (L.week < L.sched.length) return null;
      return full2(L) ? bracket2(L, end) : bracket1(L, end);
    }
    return full2(L) ? playoff2(L, won, opp, end) : playoff1(L, won, opp, end);
  }

  /* the full league's playoffs. games: q, the four divisional games (the Union's two, then the Frontier's), c, the two
     conference finals, f, the championship, each as [team, team, winner] with null until it is known */
  function bracket2(L, end) {
    const A = confSeeds(L, 0), B = confSeeds(L, 1);
    const gm = { q: [[A[0], A[3], null], [A[1], A[2], null], [B[0], B[3], null], [B[1], B[2], null]], c: [[null, null, null], [null, null, null]], f: [null, null, null] };
    L.po = { fmt: 2, seeds: [A, B], games: gm };
    const k = gm.q.findIndex(g => g.includes(L.team));
    if (k < 0) {
      simRest(L, 'q');
      return end('Missed the playoffs');
    }
    L.phase = 'qf';
    L.po.opp = gm.q[k][0] === L.team ? gm.q[k][1] : gm.q[k][0];
    return null;
  }

  /* plays out everything from a round on: what is not decided yet is simulated */
  function simRest(L, from) {
    const gm = L.po.games, play = g => {
      if (g[2] == null) g[2] = simWinner(L, g[0], g[1]);
    };
    if (from === 'q') gm.q.forEach(play);
    if (from === 'q' || from === 'c') {
      gm.c = [[gm.q[0][2], gm.q[1][2], gm.c[0][2]], [gm.q[2][2], gm.q[3][2], gm.c[1][2]]];
      gm.c.forEach(play);
    }
    gm.f = [gm.c[0][2], gm.c[1][2], gm.f[2]];
    play(gm.f);
    L.po.champ = gm.f[2];
  }

  function playoff2(L, won, opp, end) {
    const gm = L.po.games, me = L.team, mine = rd => rd.find(g => g.includes(me));
    if (L.phase === 'qf') {
      mine(gm.q)[2] = won ? me : opp;
      gm.q.forEach(g => {
        if (g[2] == null) g[2] = simWinner(L, g[0], g[1]);
      });
      gm.c = [[gm.q[0][2], gm.q[1][2], null], [gm.q[2][2], gm.q[3][2], null]];
      if (!won) {
        simRest(L, 'c');
        return end('Lost in the divisional round');
      }
      const g = mine(gm.c);
      L.phase = 'semi';
      L.po.opp = g[0] === me ? g[1] : g[0];
      return null;
    }
    if (L.phase === 'semi') {
      mine(gm.c)[2] = won ? me : opp;
      gm.c.forEach(g => {
        if (g[2] == null) g[2] = simWinner(L, g[0], g[1]);
      });
      gm.f = [gm.c[0][2], gm.c[1][2], null];
      if (!won) {
        simRest(L, 'f');
        return end('Lost in the conference final');
      }
      L.phase = 'final';
      L.po.opp = gm.f[0] === me ? gm.f[1] : gm.f[0];
      return null;
    }
    L.po.champ = gm.f[2] = won ? me : opp;
    return end(won ? 'Champion' : 'Runner-up');
  }

  /* the old league's playoffs: the top four, 1 v 4 and 2 v 3, then the final */
  function bracket1(L, end) {
    const s = seeds(L).slice(0, 4), i = s.indexOf(L.team);
    L.po = { seeds: s, games: { s1: [s[0], s[3], null], s2: [s[1], s[2], null], f: [null, null, null] } };
    if (i < 0) {
      const w1 = simWinner(L, s[0], s[3]), w2 = simWinner(L, s[1], s[2]);
      L.po.champ = simWinner(L, w1, w2);
      L.po.games.s1[2] = w1;
      L.po.games.s2[2] = w2;
      L.po.games.f = [w1, w2, L.po.champ];
      return end('Missed the playoffs');
    }
    const rest = [0, 1, 2, 3].filter(k => k !== i && k !== 3 - i);
    L.phase = 'semi';
    L.po.opp = s[3 - i];
    L.po.other = [s[rest[0]], s[rest[1]]];
    return null;
  }

  function playoff1(L, won, opp, end) {
    const gm = L.po.games;  // a season saved before the bracket was recorded has none
    if (L.phase === 'semi') {
      const other = simWinner(L, L.po.other[0], L.po.other[1]);
      if (gm) {
        const mine = gm.s1.includes(L.team) ? gm.s1 : gm.s2, theirs = mine === gm.s1 ? gm.s2 : gm.s1;
        mine[2] = won ? L.team : opp;
        theirs[2] = other;
        gm.f = [gm.s1[2], gm.s2[2], null];
      }
      if (won) {
        L.phase = 'final';
        L.po.opp = other;
        return null;
      }
      L.po.champ = simWinner(L, opp, other);
      if (gm) gm.f[2] = L.po.champ;
      return end('Semifinalist');
    }
    L.po.champ = won ? L.team : opp;
    if (gm) gm.f[2] = L.po.champ;
    return end(won ? 'Champion' : 'Runner-up');
  }

  /* the playoff bracket, once the regular season has set it */
  function bracketHtml(L) {
    const gm = L.po && L.po.games;
    if (!gm) return '';
    const seedOf = t => (L.po.fmt === 2 ? L.po.seeds[TEAMS[t].conf].indexOf(t) : L.po.seeds.indexOf(t)) + 1;
    const slot = (t, w) => t == null ? '<span>To be decided</span>'
      : `<span class="${w === t ? 'w' : ''}${t === L.team ? ' me' : ''}">${seedOf(t)} · ${TEAMS[t].name}</span>`;
    const game = g => `<div class="gm">${slot(g[0], g[2])}${slot(g[1], g[2])}</div>`;
    const champ = c => `<div class="gm">${c == null ? '<span>To be decided</span>' : slot(c, c)}</div>`;
    if (L.po.fmt === 2) return `<h2>Playoffs</h2>${[0, 1].map(c => `<h3 class="brh">${CONF[c]} Conference</h3><div class="brk"><div><small>Divisional</small>${game(gm.q[c * 2])}${game(gm.q[c * 2 + 1])}</div><div><small>Conference final</small>${game(gm.c[c])}</div><div><small>To the final</small>${champ(gm.c[c][2])}</div></div>`).join('')}
      <div class="brk brf"><div><small>Championship</small>${game(gm.f)}</div><div></div><div><small>Champion</small>${champ(gm.f[2])}</div></div>`;
    return `<h2>Playoffs</h2><div class="brk"><div><small>Semifinals</small>${game(gm.s1)}${game(gm.s2)}</div><div><small>Final</small>${game(gm.f)}</div>
      <div><small>Champion</small>${champ(gm.f[2])}</div></div>`;
  }

  /* standings and last week's scores, shared by both hubs. In the full league: the eight divisions, yours first, then
     the rest of your conference, then the other one; a division's leader is marked. */
  function standingsHtml(L) {
    const full = i => `${TEAMS[i].city} ${TEAMS[i].name}`, row = (i, n, lead) => `<tr class="${i === L.team ? 'me' : ''}"><td>${n}. ${full(i)}${lead ? ' <span class="lead">leads</span>' : ''}</td><td>${recTxt(L, i)}</td><td>${L.tab[i].pf}</td><td>${L.tab[i].pa}</td></tr>`;
    const around = L.around.length ? `<h2>Around the league</h2><table class="lg">${L.around.map(([a, sa, b, sb]) =>
      `<tr><td>${TEAMS[a].name} ${sa}, ${TEAMS[b].name} ${sb}</td></tr>`).join('')}</table>` : '';
    if (!full2(L)) return `${bracketHtml(L)}${L.po && L.po.games ? '<h2>Final standings</h2>' : ''}<table class="lg"><tr><th>Team</th><th>W-L</th><th>PF</th><th>PA</th></tr>${seeds(L).map((i, n) => row(i, n + 1)).join('')}</table>
      <p class="note">Top four make the playoffs.</p>${around}`;
    const mine = divOf(L.team), order = [mine, ...[0, 1, 2, 3].map(d => TEAMS[L.team].conf * 4 + d), ...[0, 1, 2, 3].map(d => (1 - TEAMS[L.team].conf) * 4 + d)].filter((d, i, a) => a.indexOf(d) === i);
    const played = ids(L).some(i => L.tab[i].w + L.tab[i].l + L.tab[i].t > 0);
    const tables = order.map(d => {
      const ts = divTeams(d >> 2, d & 3).sort(better(L));
      return `<h3 class="dvh">${CONF[d >> 2]} ${DIV[d & 3]}</h3><table class="lg"><tr><th>Team</th><th>W-L</th><th>PF</th><th>PA</th></tr>${ts.map((i, n) => row(i, n + 1, played && n === 0)).join('')}</table>`;
    }).join('');
    return `${bracketHtml(L)}<h2>${L.po && L.po.games ? 'Final standings' : 'Standings'}</h2>${tables}
      <p class="note">The four division winners of each conference make the playoffs.</p>${around}`;
  }

  PG.league = { start, fix, record, simScore, simWinner, seeds, confSeeds, recTxt, label, short, weekNo, stage, nextOpp, advance, standingsHtml, bracketHtml, divTeams, divName, divOf, full: full2, schedule };
})();
