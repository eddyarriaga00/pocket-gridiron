/* Pocket Gridiron: Season mode.
   Take one team through the league and call every snap on both sides of the ball. The league itself
   (schedule, standings, simulated scores, playoffs) is in league.js; this file is the save and the screens. */
(() => {
  'use strict';
  const { TEAMS, load, save, scr, $ } = PG, LG = PG.league, KEY = 'pg.season.v1';
  const DIFF = ['Rookie', 'Pro', 'All-Pro'];
  const ZERO = () => ({ g: 0, pf: 0, pa: 0, pass: 0, rush: 0, to: 0, take: 0 });
  const full = i => `${TEAMS[i].city} ${TEAMS[i].name}`;

  /* the roster: one set of players for the whole season, with what each has done so far */
  const POSN = { QB: 'QB', RB: 'RB', FB: 'FB', TE: 'TE', X: 'WR', Z: 'WR', S: 'WR', S2: 'WR', LT: 'OL', LG: 'OL', C: 'OL', RG: 'OL', RT: 'OL',
    DE1: 'DE', DE2: 'DE', DT1: 'DT', DT2: 'DT', OLB1: 'LB', MLB: 'LB', OLB2: 'LB', CB1: 'CB', CB2: 'CB', FS: 'S', SS: 'S' };
  const STATS = ['att', 'comp', 'pyd', 'ptd', 'pint', 'car', 'ryd', 'rec', 'recyd', 'td', 'tkl', 'sack', 'int', 'ff', 'fr'];

  let S = load(KEY, null);
  if (S && S.v !== 1) S = null;
  if (S && PG.league) PG.league.fix(S);  // a season from the eight-team league: ratings for the new teams too
  const persist = () => save(KEY, S);

  function ensureRoster() {
    if (!S.roster) S.roster = PG.mkRoster(S.team, 0, S.ovrs ? S.ovrs[S.team] : undefined);
    if (!S.ps) S.ps = {};
  }

  /* between seasons every player's rating moves a little, mostly up */
  function ageRoster() {
    ensureRoster();
    for (const role in S.roster) {
      const p = S.roster[role], g = role === 'S2' ? 'S' : role.replace(/\d/, '');
      p.rt = PG.clamp(p.rt + Math.round(PG.rnd(-2, 3)), 58, 99);
      p.spd = PG.BASE[g] * (1 + (p.rt - 80) * 0.004);
    }
    S.ps = {};
  }

  function statLine(role) {
    const m = S.ps[role] || {}, out = [];
    if (m.att) out.push(`${m.comp || 0}/${m.att}, ${m.pyd || 0} yds, ${m.ptd || 0} TD`);
    if (m.car) out.push(`${m.car} car, ${m.ryd || 0} yds`);
    if (m.rec) out.push(`${m.rec} rec, ${m.recyd || 0} yds`);
    if (m.td) out.push(`${m.td} TD`);
    if (m.tkl) out.push(`${m.tkl} tkl`);
    if (m.sack) out.push(`${m.sack} sk`);
    if (m.int) out.push(`${m.int} INT`);
    return out.join(' · ');
  }

  function tabRoster() {
    ensureRoster();
    const top = (label, f, unit) => {
      let best = null;
      for (const role in S.ps) {
        const v = S.ps[role][f] || 0;
        if (v > 0 && (!best || v > best[1])) best = [role, v];
      }
      return best ? `<tr><td>${label}</td><td>${S.roster[best[0]].name} · ${best[1]}${unit}</td></tr>` : '';
    };
    const lead = top('Passing', 'pyd', ' yds') + top('Rushing', 'ryd', ' yds') + top('Receiving', 'recyd', ' yds') + top('Tackles', 'tkl', '') + top('Sacks', 'sack', '') + top('Interceptions', 'int', '');
    const group = (title, roles) => `<h2>${title}</h2><table class="lg">${roles.map(role => {
      const p = S.roster[role], l = statLine(role);
      return `<tr><td>${POSN[role]} · #${p.num} ${p.name}${l ? `<small>${l}</small>` : ''}</td><td>${p.rt}</td></tr>`;
    }).join('')}</table>`;
    return (lead ? `<h2>Team leaders</h2><table class="lg">${lead}</table>` : '<p class="note">Leaders and stat lines fill in as you play.</p>')
      + group('Offense', PG.OFFR) + group('Defense', PG.DEFR);
  }

  function showNew() {
    const st = { team: PG.SET.me || 0, diff: 1, ql: 180 };
    const draw = () => {
      scr.innerHTML = `<div class="menu solid"><button class="back" id="bk">‹ Menu</button><h1 class="sm">New <em>season</em></h1>
        <p class="tag">Ten games: your division twice, and four against another division of your conference. The division winners make an eight-team playoff. You call and play every snap.</p>
        ${PG.kitsHtml([[st.team, true, 'Home'], [st.team, false, 'Away']]).replace('<em>vs</em>', '')}
        <h2>Your team</h2><div class="teams" id="st">${PG.teamGrid(st.team)}</div>
        <h2>Difficulty</h2><div class="seg" id="sd">${DIFF.map((d, i) => `<button data-d="${i}" class="${i === st.diff ? 'on' : ''}">${d}</button>`).join('')}</div>
        <h2>Quarter length</h2><div class="seg" id="sq">${[60, 120, 180, 300].map(q => `<button data-q="${q}" class="${q === st.ql ? 'on' : ''}">${q / 60} min</button>`).join('')}</div>
        <button class="go" id="sgo">Start season</button></div>`;
      $('#bk').onclick = PG.showMenu;
      scr.querySelectorAll('#st button').forEach(b => b.onclick = () => {
        st.team = +b.dataset.i;
        PG.keepScroll(draw);
      });
      scr.querySelectorAll('#sd button').forEach(b => b.onclick = () => {
        st.diff = +b.dataset.d;
        PG.keepScroll(draw);
      });
      scr.querySelectorAll('#sq button').forEach(b => b.onclick = () => {
        st.ql = +b.dataset.q;
        PG.keepScroll(draw);
      });
      $('#sgo').onclick = () => {
        S = { v: 1, team: st.team, diff: st.diff, ql: st.ql, year: 1, titles: 0, log: [], stats: ZERO() };
        LG.start(S);
        ensureRoster();
        persist();
        PG.snd('whistle');
        hub('table');
      };
    };
    draw();
  }

  /* End-of-season honors. The league's best attack and defense come from the standings (the other teams are simulated,
     so they have scores but no players); the most valuable player is yours, from the season's stat lines. */
  function awards() {
    const games = i => Math.max(1, S.tab[i].w + S.tab[i].l + (S.tab[i].t || 0)), ids = S.tab.map((_, i) => i), per = (i, k) => S.tab[i][k] / games(i);
    const off = ids.slice().sort((a, b) => per(b, 'pf') - per(a, 'pf'))[0], def = ids.slice().sort((a, b) => per(a, 'pa') - per(b, 'pa'))[0];
    let mvp = null, top = 0;
    for (const role in S.ps || {}) {
      const m = S.ps[role], n = k => m[k] || 0;
      const v = n('pyd') / 25 + n('ptd') * 4 - n('pint') * 2 + (n('ryd') + n('recyd')) / 10 + n('td') * 6 + n('rec') * 0.5 + n('tkl') + n('sack') * 4 + n('int') * 6 + (n('ff') + n('fr')) * 3;
      if (v > top && S.roster && S.roster[role]) {
        top = v;
        mvp = role;
      }
    }
    return [mvp ? ['Your most valuable player', `${S.roster[mvp].name} · ${POSN[mvp]}`, statLine(mvp)] : null,
      ['Best offense', TEAMS[off].name, per(off, 'pf').toFixed(1) + ' points a game'], ['Best defense', TEAMS[def].name, per(def, 'pa').toFixed(1) + ' allowed a game']].filter(Boolean);
  }

  function nextCard() {
    if (S.phase === 'done') {
      const po = S.po;
      return `<div class="nx"><small>Season ${S.year} complete</small><h4>${po.finish}</h4>
        <p>${full(S.team)} finished ${LG.recTxt(S, S.team)}. ${po.champ === S.team ? 'You are the champions.' : `Champion: ${full(po.champ)}.`}</p>
        <ul class="aw">${awards().map(([l, who, why]) => `<li><span>${l}<small>${why}</small></span><b>${who}</b></li>`).join('')}</ul>
        <button class="go sm" id="nxs">Start season ${S.year + 1}</button></div>`;
    }
    /* the matchup at a glance, as on the career hub: the two badges with record and rating, the home side on the right */
    const o = LG.nextOpp(S), home = LG.home(S), side = i => `<div class="mt${i === S.team ? ' me' : ''}"><i style="--c:${TEAMS[i].c1};color:${PG.inkOn(TEAMS[i].c1)}">${TEAMS[i].ab}</i><b>${LG.recTxt(S, i)}</b><small>${S.ovrs[i]} OVR</small></div>`;
    return `<div class="nx${LG.prime(S) ? ' prime' : ''}"><small>${LG.label(S)}${LG.prime(S) ? ' · Primetime' : ''}</small>
      <div class="mu">${side(home ? o : S.team)}<div class="mv">at</div>${side(home ? S.team : o)}</div><h4>${home ? 'vs' : 'at'} ${full(o)}</h4>
      <button class="go sm" id="play" style="margin-top:8px">Play game</button></div>`;
  }

  function tabSchedule() {
    /* a row a game: a W or L badge and the score for the ones played, the week's number and the opponent's rating for
       the ones to come */
    const rows = S.log.map(g => `<div><i class="gb ${g.us > g.them ? 'w' : g.us < g.them ? 'l' : 't'}">${g.us > g.them ? 'W' : g.us < g.them ? 'L' : 'T'}</i><div><b>${g.wk} · ${g.us}–${g.them} vs ${full(g.opp)}</b></div></div>`);
    if (S.phase === 'reg') for (let w = S.week; w < S.sched.length; w++) {
      const m = S.sched[w].find(p => p.includes(S.team)), o = m[0] === S.team ? m[1] : m[0];
      rows.push(`<div class="tc"><i class="gb">${w + 1}</i><div><b>${m[0] === S.team ? 'vs' : 'at'} ${full(o)}</b><small>${S.ovrs[o]} OVR · ${LG.recTxt(S, o)}</small></div></div>`);
    }
    return `<div class="glog">${rows.join('')}</div>`;
  }

  function tabTeam() {
    const s = S.stats, g = Math.max(1, s.g), per = v => (v / g).toFixed(1);
    const row = (l, v) => `<div><small>${l}</small><b>${v}</b><span>${per(v)} a game</span></div>`;  // a tile each: the total, and the figure per game under it
    return `<div class="stl">${row('Points', s.pf)}${row('Allowed', s.pa)}${row('Giveaways', s.to)}${row('Pass yards', s.pass)}${row('Rush yards', s.rush)}${row('Takeaways', s.take)}</div>
      ${s.g ? '' : '<p class="note">Team numbers show up after your first game.</p>'}`;
  }

  /* a small picture for each of the hub's tabs */
  const TAB_ICON = {
    table: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 13.500v-5h2.600v5zm4.200 0v-11h2.600v11zm4.200 0v-7.500h2.600v7.500z"/></svg>',
    sched: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.500h1.500V3h5V1.500H12V3h2v11H2V3h2zM3.500 6.500v6h9v-6z"/></svg>',
    team: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.500l5.500 2v4.200c0 3.300-2.300 5.600-5.500 6.800-3.200-1.200-5.500-3.500-5.500-6.800V3.500z"/></svg>',
    roster: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="5.500" cy="5" r="2.500"/><circle cx="11.500" cy="5.500" r="2"/><path d="M1 13.500c0-2.800 2-4.500 4.500-4.500s4.500 1.700 4.500 4.500zm9.800 0c0-1.600-.5-2.900-1.400-3.800.6-.3 1.300-.4 2-.4 2.100 0 3.600 1.500 3.600 4.200z"/></svg>',
  };

  function hub(tab) {
    tab = tab || 'table';
    const t = TEAMS[S.team];
    let sure = false;
    const draw = () => {
      scr.innerHTML = `<div class="menu solid"><button class="back" id="bk">‹ Menu</button>
        <div class="pc" style="--c:${t.c1}"><div><h3>${t.name}</h3><p>${t.city} · Season ${S.year} · ${LG.recTxt(S, S.team)}<br>${DIFF[S.diff]} · ${S.ql / 60} min quarters${S.titles ? ` · ${S.titles} title${S.titles > 1 ? 's' : ''}` : ''}</p></div>
          <div class="ovr">${S.ovrs[S.team]}<small>OVR</small></div></div>
        ${nextCard()}
        <div class="tabs itabs" style="margin-top:16px">${[['table', 'Standings'], ['sched', 'Schedule'], ['team', 'Team'], ['roster', 'Roster']].map(([k, l]) =>
          `<button data-t="${k}" class="${k === tab ? 'on' : ''}">${TAB_ICON[k]}<span>${l}</span></button>`).join('')}</div>
        ${tab === 'table' ? LG.standingsHtml(S) : tab === 'sched' ? tabSchedule() : tab === 'roster' ? tabRoster() : tabTeam()}
        <div class="stack"><button class="btn2 warn" id="ret">${sure ? 'Tap again to erase this season' : 'Start over'}</button></div></div>`;
      $('#bk').onclick = PG.showMenu;
      scr.querySelectorAll('.tabs button').forEach(b => b.onclick = () => {
        tab = b.dataset.t;
        sure = false;
        PG.keepScroll(draw);
      });
      const pl = $('#play');
      if (pl) pl.onclick = play;
      const ns = $('#nxs');
      if (ns) ns.onclick = () => {
        S.year++;
        S.log = [];
        S.stats = ZERO();
        LG.start(S);
        ageRoster();
        persist();
        hub('table');
      };
      $('#ret').onclick = () => {
        if (!sure) {
          sure = true;
          PG.keepScroll(draw);
          return;
        }
        S = null;
        try {
          localStorage.removeItem(KEY);
        } catch (_) {}
        showNew();
      };
    };
    draw();
  }

  function play() {
    const opp = LG.nextOpp(S);
    PG.snd('whistle');
    ensureRoster();
    const pt = LG.prime(S), env = PG.envFor(S.year + 50, LG.weekNo(S), S.phase !== 'reg' || S.week >= S.sched.length - 4, LG.home(S) ? S.team : opp);  // the home city's weather
    if (pt) env.time = 'night';  // primetime is a night game
    PG.startGame({ a: S.team, b: opp, ql: S.ql, diff: S.diff, mode: 'season', ros0: S.roster, ovr: [S.ovrs[S.team], S.ovrs[opp]], mustWin: S.phase !== 'reg',
      away: !LG.home(S), prime: pt, around: LG.full(S) ? LG.preWeek(S) : null, env,
      onEnd: r => gameEnd(r, opp), onQuit: () => hub('table') });
  }

  function gameEnd(r, opp) {
    let us = r.score[0], them = r.score[1];
    if (S.phase !== 'reg' && us === them) {
      if (PG.rnd() < 0.5) us += 3;
      else them += 3;
    }  // a playoff game cannot end level
    const won = us > them, res = won ? 'W' : us === them ? 'T' : 'L', wk = LG.short(S), table = PG.finTop(r.ot ? 'Final · OT' : 'Final', 4) + PG.statTable();
    S.log.push({ wk, opp, us, them, res });
    ensureRoster();
    for (const k in (r.box || {})) {
      // every player's line from this game goes on his season
      const b = r.box[k];
      if (b.team !== 0 || !S.roster[b.role]) continue;
      const t = S.ps[b.role] || (S.ps[b.role] = {});
      for (const f of STATS) if (b[f]) t[f] = (t[f] || 0) + b[f];
    }
    const s = S.stats;
    s.g++;
    s.pf += us;
    s.pa += them;
    s.pass += r.stats[0].pass;
    s.rush += r.stats[0].rush;
    s.to += r.stats[0].to;
    s.take += r.stats[1].to;
    const fin = LG.advance(S, opp, us, them);
    if (fin === 'Champion') {
      S.titles++;
      if (PG.milestones) PG.milestones.earn('title');
    }
    persist();
    const show = () => {
      // drawn again after watching the play of the game
      scr.innerHTML = `<div class="sheet fin"><div class="shd"><b>${won ? 'Victory' : res === 'T' ? 'Tie game' : 'Final'}</b><span>${wk} vs ${TEAMS[opp].ab}</span></div>
        ${table}${r.potgHtml || ''}${r.potdHtml || ''}${r.scoringHtml || ''}
        ${fin ? `<p class="note">${fin === 'Champion' ? 'Champions. The title is yours.' : 'Season over: ' + fin.toLowerCase() + '.'}</p>` : ''}
        <button class="go" id="rc">Continue</button></div>`;
      $('#rc').onclick = () => {
        PG.toMenu();
        hub('table');
      };
      if ($('#potd')) $('#potd').onclick = () => PG.watchPotd(show);
    };
    show();
    if (fin === 'Champion') PG.banner('Champions!', full(S.team), 3000);
  }

  PG.season = {
    open() {
      PG.toMenu();
      if (S) hub('table');
      else showNew();
    },
    summary() {
      if (!S) return null;
      const ph = LG.stage(S);
      return `Continue: ${TEAMS[S.team].name} · ${LG.recTxt(S, S.team)} · season ${S.year}, ${ph}`;
    },
    get data() {
      return S;
    },
  };
})();
