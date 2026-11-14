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
