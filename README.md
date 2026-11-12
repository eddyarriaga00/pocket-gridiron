# Pocket Gridiron

An 11-on-11 football game for portrait phones, playable with one hand. It runs in the browser with no install and no
build step: HTML, CSS, JavaScript, and GLSL shaders through three.js. All teams and players are fictional.

**Play it:** https://eddyarriaga00.github.io/pocket-gridiron/

## Modes

- **Career** (the main focus). Create one player (QB, RB, WR, LB or CB) and pick a build. At the combine you run a
  40-yard dash and position drills; your grade sets your draft pick, your signing bonus and how much the coach trusts
  you. Starters play every drive of their unit, the rotation and backups share them, and good games and practice earn
  the job. You play only your own snaps: the coach calls the plays and other drives are simulated. Stats and per-game
  goals earn XP for ratings and abilities. Each week has practice, a game grade and a headline; a season has league
  leaders, honors and playoffs; you can ask for a trade or change teams between seasons. The coach has a word for you
  after every game, and a rival at your position on the best other team is the man to beat. There are 14 trophies.
- **Season.** Take one team through seven weeks and a four-team playoff, calling and playing every snap. Your roster
  keeps its names, numbers and ratings all season, with a stat line for every player and team leaders.
- **Exhibition.** One game between any two teams. You pick the difficulty, quarter length, kickoff time and weather.

## On the field

- Pass plays, run plays, play action, field goals, punts, live kickoffs, kneel and spike. Thirteen offensive plays and
  six defensive calls. Before the snap you can tap a receiver's letter to change his route, call an audible or flip
  the play; on defense you can change the coverage.
- Tap a receiver for a bullet pass, hold for a lob.
- With the ball: Sprint, Juke, Spin, Power (truck a tackler in front of you, stiff-arm one beside you) and Hurdle.
- On defense: Switch, Dive, Hit (a hit stick that can jar the ball loose) and Strip.
- Fumbles you can dive on, interceptions, sacks, safeties, overtime, timeouts, two-point tries, onside kicks, and
  four kinds of flag (false start, offside, holding, pass interference) that Settings can switch off. Rain and snow make the ball harder to catch and hold.
- Instant replays of big plays, a flyover before kickoff, three officials who signal, a player of the game.

## Controls

| | Touch | Keyboard |
|---|---|---|
| Move | Drag anywhere on the field | Arrows / WASD |
| Snap, ready, kick | The large button | Space |
| Pass (as quarterback) | Tap a lettered receiver or its button; hold for a lob | 1–5 |
| Call for the ball (career receiver or back) | Call | C |
| Sprint | Hold Sprint | Space |
| Juke / Spin / Power / Hurdle | The buttons | J / K / L / H |
| Switch / Dive / Hit / Strip (defense) | The buttons | Q / E / F / R |
| Audible / Flip (before the snap) | The buttons | V / X |
| Time out | Time out, right after the whistle or on the play-call sheet | T |
| Pause | The pause button under the scoreboard | P or Esc |

Settings has the accent color, 2D or 3D graphics, sharpness, shadows, the glow pass, replays, sound, music, the
announcer and the control tips.

## How it is built

```
index.html              page shell (GitHub Pages serves this from the main branch)
css/game.css            all styles
js/data.js              teams, formations, routes and both playbooks
js/game.js              the engine: plays, AI, rules, controls, menus, the 2D overlay and 2D fallback renderer
js/shaders.js           GLSL: turf, sky dome, crowd, rim light on players, glow and vignette pass
js/render3d.js          three.js renderer: stadium, instanced player models, shadows, weather, cameras
js/audio.js             synthesized sound: effects, crowd, music, weather, and the announcer (speech synthesis)
js/league.js            schedule, standings and playoffs shared by Career and Season
js/career.js            Career mode
js/season.js            Season mode
docs/ROADMAP.md         what is done, what is next, and a log of how each part was checked
tools/                  local server, test harness, formatter, bundler, icon generator
```

Nothing is downloaded at run time except three.js 0.159.0 from cdnjs and the Archivo font from Google Fonts. There
are no image, model or audio files: the field, the crowd, the players and every sound are generated in code.
Without WebGL the game falls back to its 2D canvas renderer.

## Run locally

```
python3 tools/serve.py 8000
```

Then open http://localhost:8000. The server sends no-cache headers, so edits show up on reload.

## Testing

Load the harness in the browser console:

```js
await fetch('tools/harness.js?' + Date.now()).then(r => r.text()).then(t => (0, eval)(t))
```

- `H.sim(12, 180)` plays computer against computer and reports yards per carry, completion rate and so on.
- `H.exh(2, 120)`, `H.career('QB', 2)`, `H.careerSeasons('WR', 2)` play scripted games in each mode.
- `H.fingerprint()` is a seeded run. After a change that should not alter behaviour it must return the same string.
- `PG.dbg.seed(n)` makes any run repeatable; `PG.audio.spoken` lists what the announcer has said.

`node tools/fmt.js <files>` is the house formatter. `node --expose-internals tools/astcheck.js before.js after.js`
proves a reformat did not change the program.

`python3 tools/bundle.py` writes `pocket-gridiron.html`, the whole game in one file.
