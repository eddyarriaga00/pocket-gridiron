/* Pocket Gridiron: the league that Career and Season modes share.
   Eight teams play a seven-week round robin, the top four make the playoffs (1 v 4, 2 v 3, then a final).
   Every function works on a plain save object L that has { team } and gets
   { ovrs, week, phase, sched, tab, po, around } filled in. phase is 'reg', 'semi', 'final' or 'done'. */
(() => {
  'use strict';
  const { TEAMS, rnd, pick, clamp } = PG;

  /* circle method: every team meets every other once */
  function schedule() {
    const n = TEAMS.length, ids = [...Array(n).keys()];
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rnd(i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const rounds = [];
    for (let r = 0; r < n - 1; r++) {
      const week = [];
      for (let i = 0; i < n / 2; i++) week.push([ids[i], ids[n - 1 - i]]);
      rounds.push(week);
      ids.splice(1, 0, ids.pop());
    }
    return rounds;
  }

  /* a new season: ratings drift a little from the last one */
  function start(L) {
    L.ovrs = L.ovrs ? L.ovrs.map(o => clamp(o + Math.round(rnd(-3, 3)), 76, 93)) : TEAMS.map(t => t.ovr);
    L.week = 0;
    L.phase = 'reg';
    L.sched = schedule();
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

  const seeds = L => TEAMS.map((_, i) => i).sort((a, b) => {
    const A = L.tab[a], B = L.tab[b];
    return (B.w + B.t / 2) - (A.w + A.t / 2) || (B.pf - B.pa) - (A.pf - A.pa);
  });
  const recTxt = (L, i) => {
    const r = L.tab[i];
    return `${r.w}-${r.l}${r.t ? '-' + r.t : ''}`;
  };
  const label = L => L.phase === 'reg' ? `Week ${L.week + 1} of ${L.sched.length}` : L.phase === 'semi' ? 'Playoffs · Semifinal' : 'Championship game';
  const short = L => L.phase === 'reg' ? `Wk ${L.week + 1}` : L.phase === 'semi' ? 'Semifinal' : 'Final';

  function nextOpp(L) {
    if (L.phase !== 'reg') return L.po.opp;
    const m = L.sched[L.week].find(p => p.includes(L.team));
    return m[0] === L.team ? m[1] : m[0];
  }

  /* The user's game is over: record it, simulate the rest, move the season on.
     Returns how the season ended ('Champion', 'Runner-up', 'Semifinalist', 'Missed the playoffs') or null if it goes on. */
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
      const s = seeds(L).slice(0, 4), i = s.indexOf(L.team);
      /* games: the bracket as [team, team, winner], 1 v 4 and 2 v 3, then the final; null until it is known */
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

  /* the playoff bracket, once the regular season has set it: two semifinals, the final, the champion */
  function bracketHtml(L) {
    const gm = L.po && L.po.games;
    if (!gm) return '';
    const slot = (t, w) => t == null ? '<span>To be decided</span>'
      : `<span class="${w === t ? 'w' : ''}${t === L.team ? ' me' : ''}">${L.po.seeds.indexOf(t) + 1} · ${TEAMS[t].name}</span>`;
    const game = g => `<div class="gm">${slot(g[0], g[2])}${slot(g[1], g[2])}</div>`;
    return `<h2>Playoffs</h2><div class="brk"><div><small>Semifinals</small>${game(gm.s1)}${game(gm.s2)}</div><div><small>Final</small>${game(gm.f)}</div>
      <div><small>Champion</small><div class="gm">${gm.f[2] == null ? '<span>To be decided</span>' : slot(gm.f[2], gm.f[2])}</div></div></div>`;
  }

  /* standings and last week's scores, shared by both hubs */
  function standingsHtml(L) {
    const full = i => `${TEAMS[i].city} ${TEAMS[i].name}`;
    return `${bracketHtml(L)}${L.po && L.po.games ? '<h2>Final standings</h2>' : ''}<table class="lg"><tr><th>Team</th><th>W-L</th><th>PF</th><th>PA</th></tr>${seeds(L).map((i, n) =>
      `<tr class="${i === L.team ? 'me' : ''}"><td>${n + 1}. ${full(i)}</td><td>${recTxt(L, i)}</td><td>${L.tab[i].pf}</td><td>${L.tab[i].pa}</td></tr>`).join('')}</table>
      <p class="note">Top four make the playoffs.</p>
      ${L.around.length ? `<h2>Around the league</h2><table class="lg">${L.around.map(([a, sa, b, sb]) =>
        `<tr><td>${TEAMS[a].name} ${sa}, ${TEAMS[b].name} ${sb}</td></tr>`).join('')}</table>` : ''}`;
  }

  PG.league = { start, record, simScore, simWinner, seeds, recTxt, label, short, nextOpp, advance, standingsHtml, bracketHtml };
})();
