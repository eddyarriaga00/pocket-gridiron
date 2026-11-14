/* A rougher test player for Pocket Gridiron, for the rare endings. Load after tools/harness.js:
   await fetch('tools/chaos.js?'+Date.now()).then(r=>r.text()).then(t=>(0,eval)(t))
   X.exh(n)            n exhibition games on random teams, time and weather
   X.career('QB', n)   a new career on a random team, n games
   Unlike H.bot it goes for it on fourth down, tries for two, kicks onside, challenges, calls time out, declines
   free plays, picks random cards from every tab, and ties the score late in the fourth quarter so overtime is
   played. After every step it checks that the numbers the game runs on are still numbers. Turn sound off first. */
window.X = (() => {
  const q = s => document.querySelector(s), qa = s => [...document.querySelectorAll(s)], d = () => PG.dbg;
  const seen = {}, bad = [];
  const hit = k => seen[k] = (seen[k] || 0) + 1;
  const maybe = (sel, p, k) => {
    const b = q(sel);
    if (b && Math.random() < p) {
      b.click();
      hit(k);
      return true;
    }
    return false;
  };
  const fin = (v, what) => {
    if (!Number.isFinite(v)) bad.push(what + ' = ' + v + ' in ' + d().G.state + ' q' + d().G.q);
  };

  function step() {
    const G = d().G;
    if (maybe('#g4G', 0.6, 'go for it') || maybe('#p2', 0.5, 'two-point try') || maybe('#k2', 0.6, 'onside kick') || maybe('#chal', 0.5, 'challenge') ||
      maybe('#tmo', 0.3, 'time out') || maybe('#fpD', 0.5, 'free play declined')) return;
    if (G.state === 'call' && q('#screen .tabs') && Math.random() < 0.4) {
      const tabs = qa('#screen .tabs button');
      tabs[Math.random() * tabs.length | 0].click();
      const cards = qa('#screen .card');
      if (cards.length) {
        cards[Math.random() * cards.length | 0].click();
        hit('random card');
        return;
      }
    }
    if (G.q === 4 && G.clock < 20 && G.clock > 0.5 && !G.final && G.score[0] !== G.score[1] && !G.xTied && G.mode !== 'camp') {
      G.score[0] = G.score[1] = Math.max(G.score[0], G.score[1]);  // a tie late, so overtime is played
      G.xTied = true;
      hit('tied late');
    }
    H.bot();
  }

  function run(label) {
    const g = d();
    let n = 0, ot = false;
    const over = () => g.G.state === 'over' || g.G.state === 'menu' || q('#again') || q('#rc');
    while (!over() && n++ < 900000) {
      step();
      g.step(0.02);
      const G = g.G;
      fin(G.los, 'los');
      fin(G.clock, 'clock');
      fin(G.togo, 'togo');
      fin(G.score[0] + G.score[1], 'score');
      if (n % 40 === 0) for (const p of g.P || []) if (!Number.isFinite(p.x + p.y)) {
        bad.push('player off the map: ' + p.pos + ' in ' + G.state);
        break;
      }
      if (G.ot && !ot) {
        ot = true;
        hit('overtime');
      }
    }
    if (!over()) bad.push(label + ': never ended (state ' + g.G.state + ', pad ' + g.G.pad + ', q' + g.G.q + ')');
    return g.G.score.join('-') + (ot ? ' OT' : '');
  }

  const pick = l => l[Math.random() * l.length | 0];
  return {
    seen, bad,
    exh(games = 1, ql = 60) {
      const out = [];
      for (let i = 0; i < games; i++) {
        try {
          const n = PG.TEAMS.length, me = Math.random() * n | 0;
          Object.assign(PG.SET, { me, opp: (me + 1 + (Math.random() * (n - 1) | 0)) % n, ql, diff: Math.random() * 3 | 0, tod: pick(['day', 'dusk', 'night']), wx: pick(['clear', 'rain', 'snow']) });
          PG.showMenu();
          q('#mE').click();
          q('#go').click();
          out.push(run('exh'));
          if (q('#again')) q('#again').click();
        } catch (e) {
          bad.push(String(e.stack).slice(0, 300));
        }
      }
      return { out, seen, bad };
    },
    /* whole seasons of Season mode on a random team. rig: 'win' gives your side three touchdowns late in every game
       (so the playoffs are reached and won), 'tie' ties every game late (playoff games must then go to overtime
       until somebody scores), anything else plays it straight. After every game the league table has to add up. */
    season(seasons = 1, rig = '') {
      const out = [], T = PG.TEAMS;
      try {
        PG.season.open();
        if (q('#ret') && !q('#sgo')) {
          q('#ret').click();
          q('#ret').click();
        }
        pick(qa('#st button')).click();
        q('#sq [data-q="60"]').click();
        q('#sgo').click();
        let done = 0, guard = 0;
        while (done < seasons && guard++ < 80) {
          const S = PG.season.data;
          if (q('#nxs')) {
            const po = S.po, gm = po.games;
            if (!po.finish) bad.push('season done with no finish');
            if (po.champ == null) bad.push('season done with no champion');
            if (gm && gm.f && gm.f[2] !== po.champ) bad.push('champion ' + po.champ + ' is not the winner of the final ' + gm.f[2]);
            if (gm) for (const g of [].concat(gm.q || [], gm.c || [], [gm.f])) if (g[0] == null || g[1] == null || (g[2] !== g[0] && g[2] !== g[1])) bad.push('bracket game not settled: ' + g);
            out.push(T[S.team].ab + ' ' + PG.league.recTxt(S, S.team) + ' · ' + po.finish + ' · champion ' + T[po.champ].ab);
            hit('season finished: ' + po.finish);
            done++;
            q('#nxs').click();
            continue;
          }
          const stage = PG.league.stage(S);
          q('.tabs [data-t=table]').click();
          q('#play').click();
          const g = d();
          let n = 0, did = false;
          while (!q('#rc') && n++ < 900000) {
            const G = g.G;
            G.xTied = true;  // this sweep rigs the ending itself, or not at all
            if (rig && !did && G.q === 4 && G.clock < 20 && G.clock > 0.5 && !G.final) {
              did = true;
              if (rig === 'win' || (rig === 'potie' && stage.indexOf('week') >= 0)) G.score[0] = G.score[1] + 21;  // 'potie': win the regular season, tie every playoff game late
              else G.score[0] = G.score[1] = Math.max(G.score[0], G.score[1]);
            }
            step();
            g.step(0.02);
            fin(G.los, 'los');
            fin(G.clock, 'clock');
            if (G.q > 4 && !G.xOt) {
              G.xOt = true;
              hit(stage.indexOf('week') < 0 ? 'playoff overtime' : 'overtime');
            }
          }
          if (!q('#rc')) {
            bad.push('season game never ended: ' + stage + ' state ' + g.G.state);
            break;
          }
          const last = PG.season.data.log[PG.season.data.log.length - 1], top = qa('.ftp .mt b').map(b => +b.textContent);
          if (stage.indexOf('week') < 0 && last.us === last.them) bad.push('playoff game recorded level: ' + stage + ' ' + last.us);
          if (top[0] !== last.us || top[1] !== last.them) bad.push('final sheet shows ' + top + ' but ' + last.us + ',' + last.them + ' was recorded (' + stage + ')');
          if (g.G.score[0] === g.G.score[1] && stage.indexOf('week') < 0) hit('playoff settled off the field');
          q('#rc').click();
          const tab = PG.season.data.tab, sum = k => tab.reduce((t, r) => t + (r[k] || 0), 0);
          if (sum('w') !== sum('l')) bad.push('wins ' + sum('w') + ' and losses ' + sum('l') + ' differ after ' + stage);
          if (sum('pf') !== sum('pa')) bad.push('points for ' + sum('pf') + ' and against ' + sum('pa') + ' differ after ' + stage);
          hit('season game');
        }
        if (done < seasons) bad.push('season sweep stopped early at ' + PG.league.stage(PG.season.data));
      } catch (e) {
        bad.push(String(e.stack).slice(0, 300));
      }
      return { out, seen, bad };
    },
    career(pos, games = 1) {
      const out = [];
      try {
        H.newCareer(pos, String(Math.random() * PG.TEAMS.length | 0));
        for (let i = 0; i < games; i++) {
          q('#play').click();
          out.push(run('career ' + pos));
          if (!q('#rc')) throw new Error('no results screen');
          q('#rc').click();
          if (q('#scn')) q('#scn').click();
          let k = 0;
          while (q('.ans') && k++ < 6) pick(qa('.ans')).click();
          for (const id of ['#prgo', '#fdgo', '#awgo']) if (q(id)) q(id).click();
        }
      } catch (e) {
        bad.push(String(e.stack).slice(0, 300));
      }
      return { out, seen, bad };
    }
  };
})();
