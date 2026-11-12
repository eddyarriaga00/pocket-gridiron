/* Pocket Gridiron: training camp. Three short guided drills (passing, running, tackling), five plays each, scored
   with one to three stars. The engine runs them as scripted practice reps (PG.startGame with drill, side, script):
   this file holds the scripts, the scoring and the screens. */
(() => {
  'use strict';
  const PG = window.PG, { TEAMS, SET, load, save, scr, $ } = PG, KEY = 'pg.camp.v1';
  const S = Object.assign({ best: {}, seen: false }, load(KEY, {}));
  const persist = () => save(KEY, S);
  const yds = n => `${n} yard${n === 1 ? '' : 's'}`;
  const gainTxt = g => g > 0 ? yds(g) : g === 0 ? 'no gain' : 'loss of ' + -g;
  const count = (r, f) => r.filter(f).length, sum = (r, f) => r.reduce((t, x) => t + f(x), 0);
  const starsHtml = n => `<i class="stars" role="img" aria-label="${n} of 3 stars"><u>${'★'.repeat(n)}</u>${'☆'.repeat(3 - n)}</i>`;

  /* script: one entry per rep. p is the offensive play, say is the coaching card shown before the snap, h its heading.
     dcall: the defense for every rep (left out, the computer picks as it would in a game).
     marks: the score needed for one, two and three stars. rep(): [went well, what to print] for one rep.
     The marks were set from test players (tools/harness.js, H.camp): a player who never touches the screen is run by
     the computer and lands around one star, one who plays the drill as taught lands on two or three. */
  const DRILLS = [
    { id: 'pass', name: 'Passing', side: 'off', dcall: 'Cover 3', what: 'Find the open receiver and get him the ball.',
      how: ['Tap Snap. Each receiver has a letter over his head.', 'Hold a letter, or its button: the green bar fills with power. Let go to throw.', 'A quick tap floats a lob over a defender. A full bar fires a bullet.', 'After the catch you are the receiver: drag to run.'],
      script: [{ p: 'Slants', say: 'Quick throws. As a receiver cuts inside, hold his letter until the bar is nearly full, then let go.' }, { p: 'Curl Flat', say: 'The outside receivers stop and turn back to you. Throw when one turns.' },
        { p: 'Stick', say: 'Three short routes. Pick the receiver with no defender close to him.' }, { p: 'Smash', say: 'A corner route goes deep behind a short one. A quick tap floats the ball over the defender.' },
        { p: 'Four Verticals', say: 'Everybody goes deep. Tap for a lob over the top, or hold for a bullet into a gap.' }],
      marks: [2, 3, 4], markTxt: n => `${n} completions`, score: r => count(r, x => x.caught),
      total: r => `${count(r, x => x.caught)} of ${r.length} complete · ${yds(sum(r, x => x.caught ? x.gain : 0))}`, chip: (r, n) => `Complete ${count(r, x => x.caught)} / ${n}`,
      rep: x => x.caught ? [true, (x.td ? 'Touchdown · ' : 'Complete · ') + gainTxt(x.gain)] : [false, x.big.replace(/!$/, '')] },
    { id: 'run', name: 'Running', side: 'off', what: 'Take the handoff and gain all the ground you can.',
      how: ['Tap Snap. The handoff is automatic, then you are the runner.', 'Drag to steer and hold Sprint once you are in the open.', 'Juke or Spin slips a tackler. Power runs through one in front of you.', 'Hurdle jumps a defender who dives at your legs.'],
      script: [{ p: 'Inside Zone', say: 'Straight ahead. Find the gap between your blockers and hit it.' }, { p: 'Off Tackle', say: 'Run just outside your tackle. Juke when a defender squares up to you.' },
        { p: 'Toss Sweep', say: 'A pitch to the outside. Get around the corner, then turn upfield and Sprint.' }, { p: 'Counter', say: 'Start one way, then cut back behind your blockers. Power runs through a tackler.' },
        { p: 'HB Draw', say: 'It looks like a pass at first. Take the late handoff and run up the middle.' }],
      marks: [20, 45, 75], markTxt: n => `${n} yards`, score: r => sum(r, x => x.gain), total: r => `${yds(sum(r, x => x.gain))} on ${r.length} carries`, chip: r => `Yards ${sum(r, x => x.gain)}`,
      rep: x => [x.gain >= 4, (x.td ? 'Touchdown · ' : '') + gainTxt(x.gain)] },
    { id: 'tackle', name: 'Tackling', side: 'def', dcall: 'Cover 3', what: 'Get to the ball carrier and bring him down.',
      how: ['You start as the middle linebacker, the player with the ring.', 'Drag to chase the ball. Tap Dive when you are a step or two away.', 'Switch jumps to your defender nearest the ball.', 'Hit is a harder lunge and Strip goes for the ball. Both miss more often.'],
      script: [{ p: 'Inside Zone', h: 'Run up the middle', say: 'Drag toward the runner and tap Dive when you are a step or two away.' }, { p: 'Toss Sweep', h: 'Run to the outside', say: 'He is going wide. Cut him off instead of chasing from behind.' },
        { p: 'Off Tackle', h: 'Switch', say: 'If the play runs away from you, tap Switch to take the defender nearest the ball.' }, { p: 'Counter', h: 'Hit', say: 'Try Hit: a short, hard lunge that can knock the ball loose. Miss and you are on the ground.' },
        { p: 'HB Draw', h: 'Strip', say: 'Try Strip: a swipe at the ball. A weaker tackle, a better chance of a fumble.' }],
      marks: [2, 3, 4], markTxt: n => `In on ${n} tackles`, score: r => count(r, x => x.tkl), total: r => `In on ${count(r, x => x.tkl)} of ${r.length} tackles · ${yds(sum(r, x => x.gain))} allowed`,
      chip: (r, n) => `Tackles ${count(r, x => x.tkl)} / ${n}`,
      rep: x => [x.tkl > 0, (x.tkl === 2 ? 'Your tackle' : x.tkl === 1 ? 'In on the tackle' : x.takeaway ? 'Takeaway' : x.td ? 'Touchdown' : 'A teammate got there first') + ' · ' + gainTxt(x.gain)] }
  ];
  const starsFor = (d, score) => count(d.marks, m => score >= m);
  const bestStars = d => S.best[d.id] ? S.best[d.id].stars : 0;
  const totalStars = () => sum(DRILLS, bestStars);

  function open() {
    PG.toMenu();
    const n = totalStars();
    scr.innerHTML = `<div class="menu read"><button class="back" id="bk">‹ Menu</button><h1 class="sm">Training camp</h1>
  <p class="tag">Three short drills, five plays each. Earn up to three stars in every one.</p>
  ${DRILLS.map(d=>`<button class="mode" data-d="${d.id}"><b>${d.name}</b><span>${d.what}</span>${starsHtml(bestStars(d))}</button>`).join('')}
  <p class="note">${n===9?'Nine stars out of nine. You are ready for anything.':n?`${n} of 9 stars so far.`:'Nothing here counts against you. Repeat a drill as often as you like.'}</p></div>`;
    $('#bk').onclick = PG.showMenu;
    for (const b of scr.querySelectorAll('[data-d]')) b.onclick = () => card(DRILLS.find(d => d.id === b.dataset.d));
  }

  /* what the drill asks for, before it starts */
  function card(d) {
    const b = S.best[d.id];
    scr.innerHTML = `<div class="menu read"><button class="back" id="bk">‹ Training camp</button><h1 class="sm">${d.name}</h1><p class="tag">${d.what}</p>
  <h2>How</h2><ul class="how">${d.how.map(t=>`<li>${t}</li>`).join('')}</ul>
  <h2>Stars</h2><ul class="gl">${d.marks.map((m,i)=>`<li><span>${starsHtml(i+1)}</span><b>${d.markTxt(m)}</b></li>`).join('')}</ul>
  ${b?`<p class="note">Your best: ${b.text}.</p>`:''}<button class="go" id="go">Start drill</button></div>`;
    $('#bk').onclick = open;
    $('#go').onclick = () => start(d);
  }

  function start(d) {
    S.seen = true;
    persist();
    const me = SET.me || 0;
    PG.snd('whistle');
    PG.startGame({ a: me, b: (me + 3) % TEAMS.length, mode: 'camp', diff: 0, drill: d.script.length, side: d.side, script: d.script, dcall: d.dcall, title: d.name + ' drill', env: { time: 'day', weather: 'clear' },
      line: (my, dr) => dr ? d.chip(dr.reps, dr.n) : '', onEnd: r => done(d, r.drill.reps), onQuit: open });
  }

  function done(d, reps) {
    const score = d.score(reps), stars = starsFor(d, score), text = d.total(reps), was = S.best[d.id], best = !was || score > was.score, nextMark = d.marks[stars], nx = DRILLS[DRILLS.indexOf(d) + 1];
    if (best) S.best[d.id] = { score, stars, text };
    persist();
    if (PG.milestones && DRILLS.every(x => bestStars(x) > 0)) PG.milestones.earn('camp');
    if (stars) PG.snd(stars === 3 ? 'fanfare' : 'chime');
    scr.innerHTML = `<div class="sheet"><div class="shd"><b>${d.name} drill</b><span>${text}</span></div>
  <div class="campst">${starsHtml(stars)}<span>${stars===3?'Three stars. Nothing left to prove here.':stars?`${d.markTxt(nextMark)} for the next star.`:`${d.markTxt(nextMark)} earns the first star.`}${best&&was?' A new best.':''}</span></div>
  <ul class="gl">${reps.map(x=>{const[ok,t]=d.rep(x);return`<li class="${ok?'ok':'no'}"><span>${x.play}</span><b>${t}</b></li>`}).join('')}</ul>
  <button class="go" id="nx">${nx?'Next: '+nx.name:'Back to camp'}</button><div class="row2"><button class="btn2" id="ag">Try again</button><button class="btn2" id="cm">${nx?'Camp':'Menu'}</button></div></div>`;
    $('#nx').onclick = () => nx ? start(nx) : open();
    $('#ag').onclick = () => start(d);
    $('#cm').onclick = () => {
      if (nx) return open();
      PG.toMenu();
      PG.showMenu();
    };
  }

  PG.camp = {
    open, start: id => start(DRILLS.find(d => d.id === id)),
    /* true until the player has answered the first-launch offer or opened the camp */
    fresh: () => !S.seen,
    seen() {
      if (S.seen) return;
      S.seen = true;
      persist();
    },
    summary() {
      const n = totalStars();
      return 'Three short drills: passing, running and tackling.' + (n ? ` ${n} of 9 stars.` : '');
    },
    /* test hooks */
    DRILLS,
    get data() {
      return S;
    }
  };
})();
