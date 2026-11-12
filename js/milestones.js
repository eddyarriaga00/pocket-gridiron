/* Pocket Gridiron: milestones. A short list of things worth doing once, earned in any mode and kept on this device.
   game.js reports every finished game here; Season, Career and the training camp report their own. */
(() => {
  'use strict';
  const PG = window.PG, { load, save, scr, $ } = PG, KEY = 'pg.milestones.v1';
  const S = Object.assign({ got: {}, games: 0 }, load(KEY, {}));

  /* [id, name, how to earn it, test on a finished game (left out when another screen reports it)] */
  const LIST = [
    ['win', 'First win', 'Win a game in any mode', g => g.won],
    ['shut', 'Shutout', 'Win without giving up a point', g => g.won && g.them === 0],
    ['pts', 'Light it up', 'Score 30 or more in a game', g => g.us >= 30],
    ['air', 'Air show', 'Throw for 200 yards in a game', g => g.stats[0].pass >= 200],
    ['gnd', 'Ground and pound', 'Run for 80 yards in a game', g => g.stats[0].rush >= 80],
    ['take', 'Ball hawks', 'Take the ball away twice in a game', g => g.stats[1].to >= 2],
    ['ot', 'Sudden death', 'Win a game in overtime', g => g.won && g.ot],
    ['wx', 'Mudder', 'Win a game in rain or snow', g => g.won && (g.weather === 'rain' || g.weather === 'snow')],
    ['pro', 'Giant killer', 'Win on All-Pro difficulty', g => g.won && g.diff === 2],
    ['ten', 'Season ticket', 'Finish ten games', () => S.games >= 10],
    ['camp', 'Camp graduate', 'Earn a star in all three training drills'],
    ['title', 'Champion', 'Win a title in Season or Career']
  ];

  function earn(ids) {
    const fresh = ids.filter(id => !S.got[id]);
    if (!fresh.length) return;
    for (const id of fresh) S.got[id] = Date.now();
    save(KEY, S);
    PG.snd('chime');
    PG.banner(fresh.length > 1 ? 'Milestones' : 'Milestone', fresh.map(id => LIST.find(m => m[0] === id)[1]).join(' · '), 3200);
  }

  const count = () => LIST.filter(m => S.got[m[0]]).length;

  PG.milestones = {
    /* a finished game, from any mode: { us, them, stats, ot, diff, weather } */
    game(g) {
      S.games++;
      save(KEY, S);
      g.won = g.us > g.them;
      earn(LIST.filter(m => m[3] && m[3](g)).map(m => m[0]));
    },
    earn: id => earn([id]),
    summary: () => `Milestones · ${count()} of ${LIST.length}`,
    open() {
      PG.toMenu();
      scr.innerHTML = `<div class="menu solid"><button class="back" id="bk">‹ Menu</button><h1 class="sm">Milestones</h1>
  <p class="tag">${count()} of ${LIST.length} earned. They count in every mode and are kept on this device.</p>
  <div class="tro" style="margin-top:14px">${LIST.map(([id,name,how])=>`<div class="${S.got[id]?'on':''}"><b>${name}</b><span>${how}</span></div>`).join('')}</div>
  <p class="note">${S.games} game${S.games===1?'':'s'} finished.</p></div>`;
      $('#bk').onclick = PG.showMenu;
    },
    /* test hook */
    get data() {
      return S;
    }
  };
})();
