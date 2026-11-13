/* Test harness for Pocket Gridiron. Load it in the browser console or the preview pane:
   await fetch('tools/harness.js?'+Date.now()).then(r=>r.text()).then(t=>(0,eval)(t))
   Then:  H.sim(12,180)   computer vs computer balance numbers
   H.exh(2,120)    exhibition with a scripted "user" (exercises kickoffs, play calling, passing)
   H.career('WR',2) new test career at a position, n games; returns stat lines
   H.careerSeasons('QB',2)  whole seasons, with trophies
   H.camp('run',4) one training-camp drill ('pass', 'run', 'tackle') played n times by a simple test player
   H.fingerprint() a repeatable seeded run, for checking that a refactor changed nothing
   H.fps(3)        average frames per second over n seconds (needs the pane visible)
   Everything steps the game synchronously through PG.dbg, so nothing here waits on real time. */
window.PG_TEST = true;  // stops the game pausing itself when the test pane hides the page
window.H = (() => {
  const q = s => document.querySelector(s), d = () => PG.dbg;
  const key = (code, k) => {
    dispatchEvent(new KeyboardEvent('keydown', { code, key: k }));
    dispatchEvent(new KeyboardEvent('keyup', { code, key: k }));
  };

  /* one scripted-user step: pick the first card, snap, throw to the most open receiver */
  let throwKey = null;  // the number key the test player is holding down to build throw power

  function bot() {
    const G = d().G, ps = d().ps;
    if (throwKey) {
      if (!G.chg || G.chg.t >= 0.3 || G.state !== 'live') {
        // also let go when the play dies under him, or the key would be held for ever
        dispatchEvent(new KeyboardEvent('keyup', { code: 'Digit1', key: throwKey }));
        throwKey = null;
      }
      return;
    }
    if (G.paused) {
      const r = q('#pr');
      if (r) r.click();
    }  // the game pauses itself when the page is hidden, which the test pane often is
    {
      const t = q('#tsH') || q('#tsR') || q('#fpA');  // the coin toss call, then the choice: heads, and receive; a free play's flag: accept
      if (t) return t.click();
    }
    if (G.state === 'call') {
      const c = q('.card.sug') || q('.card') || q('#h2') || q('#p1') || q('#k1');  // the suggested play (or the first card), the second-half button, the extra point, a deep kickoff
      if (c) c.click();
      else throw new Error('call state without cards');
    } else if (G.state === 'pre' && (G.pad === 'snap' || G.pad === 'ready')) key('Space', ' ');
    else if (G.state === 'kickm') key('Space', ' ');
    else if (G.state === 'live' && G.pad === 'pass' && ps.t > 1.6 + Math.random()) {
      let b = 0, bo = -1;
      ps.recs.forEach((r, i) => {
        let o = 99;
        for (const p of d().P) if (p.team !== r.team) o = Math.min(o, Math.hypot(p.x - r.x, p.y - r.y));
        if (o > bo) {
          bo = o;
          b = i;
        }
      });
      throwKey = String(b + 1);
      dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', key: throwKey }));  // released by a later step, when the bar is a little past half
    }
  }

  /* plays until the game is over, or until it has gone back to the menu (the combine workout does that by itself) */
  function run(max) {
    const going = () => d().G.state !== 'over' && d().G.state !== 'menu';
    let n = 0;
    while (going() && n++ < (max || 400000)) {
      bot();
      d().step(0.02);
    }
    if (going()) throw new Error('game did not finish');
  }

  /* held keys for the camp bot: arrows toward a target, Space to sprint */
  const held = {};
  const hold = (code, on) => {
    if (!!held[code] === !!on) return;
    held[code] = on;
    dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code, key: code }));
  };
  const steer = (p, tx, ty) => {
    hold('ArrowRight', tx - p.x > 0.5);
    hold('ArrowLeft', tx - p.x < -0.5);
    hold('ArrowUp', ty - p.y > 0.5);
    hold('ArrowDown', ty - p.y < -0.5);
  };
  const letGo = () => ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'Space'].forEach(c => hold(c, false));

  /* A plain, attentive player for the training-camp drills: throws to the most open receiver, runs upfield and
     away from the nearest defender, and on defense chases the ball and dives when close. `skill` 0 stands still
     after the snap (what a player who does nothing gets), 1 plays as described. */
  function campBot(skill = 1) {
    const D = d(), G = D.G, ps = D.ps;
    bot();
    if (G.state !== 'live' || !ps || !skill) return letGo();
    const c = ps.carrier;
    if (G.pad === 'carry' && c) {
      let near = null, nd = 7;
      for (const p of D.P) if (p.team !== c.team && !p.down && p.y > c.y - 1) {
        const dd = Math.hypot(p.x - c.x, p.y - c.y);
        if (dd < nd) {
          nd = dd;
          near = p;
        }
      }
      steer(c, c.x + (near ? (near.x > c.x ? -4 : 4) : 0), c.y + 6);
      hold('Space', true);
      if (near && nd < 2.2) key('KeyJ', 'j');
    } else if ((G.pad === 'def' || G.pad === 'deflock') && G.sel && c) {
      const s = G.sel;
      steer(s, c.x + c.vx * 0.35, c.y + c.vy * 0.35);
      hold('Space', true);
      if (Math.hypot(s.x - c.x, s.y - c.y) < 2.1) key('KeyE', 'e');
    } else letGo();
  }

  return {
    bot, run, campBot,
    /* one training-camp drill ('pass', 'run' or 'tackle') played n times by the camp bot */
    camp(id, n = 4, skill = 1) {
      const D = d(), out = [], errs = [], dr = PG.camp.DRILLS.find(x => x.id === id);
      for (let i = 0; i < n; i++) {
        try {
          PG.camp.start(id);
          const going = () => D.G.state !== 'over' && D.G.state !== 'menu';
          let k = 0;
          while (going() && k++ < 200000) {
            campBot(skill);
            D.step(0.02);
          }
          letGo();
          if (going()) throw new Error('drill did not finish');
          if (!q('#nx')) throw new Error('no result sheet');
          const reps = D.G.drill.reps, score = dr.score(reps);
          out.push({ score, stars: dr.marks.filter(m => score >= m).length, reps: reps.map(r => dr.rep(r)[1]) });
        } catch (e) {
          errs.push(String(e.stack).slice(0, 300));
        }
      }
      PG.toMenu();
      PG.showMenu();
      return { out, errs };
    },
    sim(games = 8, ql = 180) {
      const D = d();
      D.auto(true);
      const S = { run: { n: 0, yds: 0, big: 0 }, pass: { n: 0, comp: 0, yds: 0, sack: 0, int: 0 }, pts: 0 }, errs = [];
      for (let g = 0; g < games; g++) {
        PG.startGame({ a: g % 8, b: (g + 3) % 8, ql });
        let n = 0, last = '', before = null;
        try {
          while (D.G.state !== 'over' && n++ < 400000) {
            const G = D.G;
            if (G.state === 'live' && last !== 'live') before = { st: JSON.stringify(G.stats), cat: G.op.cat, off: G.poss };
            if (G.state === 'dead' && last === 'live' && before && before.cat !== 'special') {
              const b = JSON.parse(before.st)[before.off], a = G.stats[before.off];
              if (before.cat === 'run') {
                S.run.n++;
                const y = a.rush - b.rush;
                S.run.yds += y;
                if (y >= 20) S.run.big++;
              } else {
                S.pass.n++;
                if (a.comp > b.comp) {
                  S.pass.comp++;
                  S.pass.yds += a.pass - b.pass;
                }
                if (G.last === 'Sack!') S.pass.sack++;
                if (G.last === 'Interception!') S.pass.int++;
              }
            }
            last = G.state;
            D.step(0.02);
          }
        } catch (e) {
          errs.push(String(e.stack).slice(0, 300));
        }
        S.pts += D.G.score[0] + D.G.score[1];
      }
      D.auto(false);
      PG.showMenu();
      return { ypc: +(S.run.yds / S.run.n).toFixed(1), runs: S.run.n, bigRuns: S.run.big, passPlays: S.pass.n, compPct: Math.round(S.pass.comp / S.pass.n * 100),
        ydsPerComp: +(S.pass.yds / S.pass.comp).toFixed(1), sackPct: +(S.pass.sack / S.pass.n * 100).toFixed(1), intPct: +(S.pass.int / S.pass.n * 100).toFixed(1), ptsPerGame: +(S.pts / games).toFixed(1), errs };
    },
    exh(games = 2, ql = 120) {
      const out = [], errs = [];
      for (let g = 0; g < games; g++) {
        try {
          PG.showMenu();
          q('#mE').click();
          q('#go').click();
          run();
          out.push(d().G.score.join('-'));
          const b = q('#again');
          if (b) b.click();
        } catch (e) {
          errs.push(String(e.stack).slice(0, 400));
        }
      }
      return { out, errs };
    },
    newCareer(pos, team = '2') {
      PG.career.open();
      if (q('#ret')) {
        q('#ret').click();
        q('#nc').click();
      }
      q('#cn').value = 'Test';
      q('#cn').dispatchEvent(new Event('input'));
      q('#cj').value = '9';
      q('#cj').dispatchEvent(new Event('input'));
      [...document.querySelectorAll('#cp button')].find(b => b.dataset.p === pos).click();
      [...document.querySelectorAll('#ct button')].find(b => b.dataset.i === team).click();
      q('#cgo').click();
    },
    playCareerGame() {
      q('#play').click();
      run();
      const my = { ...d().G.my }, score = [...d().G.score];
      if (!q('#rc')) throw new Error('no results screen');
      q('#rc').click();
      if (q('#scn')) q('#scn').click();  // the podium cutscene
      // the press conference: answer each question (a different answer each game, so every tone gets used), then the reaction
      let k = 0;
      while (q('.ans') && k++ < 6) {
        const all = document.querySelectorAll('.ans');
        all[(this.pressN = (this.pressN || 0) + 1) % all.length].click();
      }
      if (q('#prgo')) q('#prgo').click();
      if (q('#fdgo')) q('#fdgo').click();
      if (q('#awgo')) q('#awgo').click();  // the season is over: awards night comes first
      return { my, score };
    },
    career(pos, games = 2) {
      const out = [], errs = [];
      try {
        this.newCareer(pos);
        for (let i = 0; i < games; i++) {
          const r = this.playCareerGame();
          out.push(r.score.join('-') + ' ' + Object.entries(r.my).filter(([, v]) => v).map(([k, v]) => k + v).join(' '));
        }
      } catch (e) {
        errs.push(String(e.stack).slice(0, 400));
      }
      return { out, errs, xp: PG.career.data && PG.career.data.xp };
    },
    /* whole seasons: plays until `seasons` have finished, then reports each finish and the trophies earned */
    careerSeasons(pos, seasons = 1) {
      const out = [], errs = [];
      try {
        this.newCareer(pos);
        const C = () => PG.career.data;
        let guard = 0;
        while (out.length < seasons && guard++ < 60) {
          if (C().phase === 'done') {
            out.push(C().po.finish + ' ' + C().tab[C().team].w + '-' + C().tab[C().team].l);
            if (out.length < seasons) {
              if (q('#nxs')) q('#nxs').click();
              else {
                // the contract is up: take the current team's offer
                q('#fa').click();
                q('.tm.on').click();
              }
            }
          } else this.playCareerGame();
        }
      } catch (e) {
        errs.push(String(e.stack).slice(0, 400));
      }
      const c = PG.career.data;
      return { out, errs, troph: Object.keys(c.troph || {}), ovr: c.attrs, xp: c.xp, career: c.career };
    },
    /* A repeatable run: seeded simulations and one traced game. The string must be identical before and after any
       change that is not supposed to alter behaviour (formatting, moving code between files). It erases the test career. */
    fingerprint() {
      /* the weather and the penalty switch saved in Settings change how a game plays, so the run pins them and puts them back */
      const keep = { tod: PG.SET.tod, wx: PG.SET.wx, pen: PG.SET.pen };
      Object.assign(PG.SET, { tod: 'night', wx: 'clear', pen: true });
      try {
        return this.fingerprint0();
      } finally {
        Object.assign(PG.SET, keep);
      }
    },
    fingerprint0() {
      PG.dbg.seed(20261112);
      const sim = this.sim(4, 120);
      PG.dbg.seed(777);
      this.newCareer('QB');
      const sched = JSON.stringify(PG.career.data.sched);
      PG.dbg.seed(4242);
      const D = d();
      D.auto(true);
      PG.startGame({ a: 1, b: 6, ql: 120 });
      let n = 0, trace = 0;
      while (D.G.state !== 'over' && n++ < 400000) {
        D.step(0.02);
        if (n % 500 === 0) for (const p of D.P) trace = (trace * 31 + Math.round(p.x * 100) + Math.round(p.y * 100) * 7) | 0;
      }
      D.auto(false);
      const r = { sim, score: D.G.score, stats: D.G.stats, steps: n, trace, sched };
      PG.dbg.seed(0);
      PG.showMenu();
      return JSON.stringify(r);
    },
    fps(sec = 3) {
      return new Promise(res => {
        let n = 0;
        const t0 = performance.now();
        const f = () => {
          n++;
          if (performance.now() - t0 < sec * 1000) requestAnimationFrame(f);
          else res(+(n / sec).toFixed(1));
        };
        requestAnimationFrame(f);
      });
    }
  };
})();
