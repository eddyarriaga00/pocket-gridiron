# Pocket Gridiron

An 11-on-11 football game for portrait phones, playable with one hand. It runs in the browser with no install and no
build step: HTML, CSS, JavaScript, and GLSL shaders through three.js. All teams and players are fictional.

**Play it:** https://eddyarriaga00.github.io/pocket-gridiron/

## Modes

- **Career** (the main focus). Create one player, a quarterback or a wide receiver, and pick a build. At the combine you run a
  40-yard dash and position drills; your grade sets your draft pick, your signing bonus and how much the coach trusts
  you. Starters play every drive of their unit, the rotation and backups share them, and good games and practice earn
  the job. You play only your own snaps: the coach calls the plays and other drives are simulated. Stats and per-game
  goals earn XP for ratings and abilities. Each week has practice, a game grade and a headline; a season has league
  leaders, honors and playoffs with a bracket. You sign a contract at the draft, can ask for a trade while it runs,
  and choose among every team's offer when it ends. The coach has a word for you
  after every game, and a rival at your position on the best other team is the man to beat. There are 14 trophies.
- **Season.** Take one team through seven weeks and a four-team playoff, calling and playing every snap. Your roster
  keeps its names, numbers and ratings all season, with a stat line for every player and team leaders.
- **Exhibition.** One game between any two teams. You pick the difficulty, quarter length, kickoff time and weather.
- **Milestones.** Twelve things worth doing once (a shutout, a win in the rain, a title), earned in any mode.
- **Training camp.** Three short guided drills (passing, running, tackling), five plays each. A coaching card before
  every snap says what to try, and each drill is scored with one to three stars. The game offers it the first time
  you open it.

## On the field

- Pass plays, run plays, run-pass options, play action, screens, bootlegs, field goals, punts, live kickoffs, kneel and
  spike. Nineteen offensive plays and eight defensive calls. A tag under the field names the kind of play on every snap. Before the snap you can tap a receiver's letter to change his route, call an audible or flip
  the play; on defense you can change the coverage.
- Hold a receiver's letter to build throw power on a green bar, then let go: a lob, a touch pass or a bullet.
- With the ball: Sprint, Juke, Spin, Power (truck a tackler in front of you, stiff-arm one beside you) and Hurdle.
- On defense: Switch, Dive, Hit (a hit stick that can jar the ball loose) and Strip.
- Punt returns you play, with fair catches and muffs. Fumbles you can dive on, interceptions, sacks, safeties, overtime, timeouts, two-point tries, onside kicks, and
  four kinds of flag (false start, offside, holding, pass interference) that Settings can switch off. Rain and snow make the ball harder to catch and hold.
- Instant replays of big plays, a flyover before kickoff, three officials who signal, a player of the game.
- A stadium you can hear, all of it made in code: the quarterback's cadence, pads that crack harder the faster the hit,
  a crowd that chants, boos a flag on the home team and builds a wall of noise on third down, the referee's call
  echoing over the speakers, the crowd finishing the announcer's "first down", a band in the stands and a halftime show.
- Every control has a touch area of at least 44 by 44 pixels, however small it is drawn, and the layout is checked from
  320-pixel phones up to a desktop window. A phone held sideways is asked to turn upright.

## Controls

| | Touch | Keyboard |
|---|---|---|
| Move | Drag anywhere on the field | Arrows / WASD |
| Snap, ready, kick | The large button | Space |
| Pass (as quarterback) | Hold a lettered receiver or its button: a green bar fills with power. Let go to throw (a quick tap is a lob, a full bar a bullet) | 1–5 |
| Call for the ball (career receiver or back) | Call | C |
| Sprint | Hold Sprint | Space |
| Juke / Spin / Power / Hurdle | The buttons | J / K / L / H |
| Switch / Dive / Hit / Strip (defense) | The buttons | Q / E / F / R |
| Audible / Flip (before the snap) | The buttons | V / X |
| Time out | Time out, right after the whistle or on the play-call sheet | T |
| Fair catch | Fair catch, while a punt to you is in the air | Space |
| Pause | The pause button under the scoreboard | P or Esc |
| Zoom the camera | − and + under the scoreboard | − and =, or the mouse wheel |

Settings has the accent color, 2D or 3D graphics, sharpness, camera zoom, shadows, the glow pass, close-up model detail,
replays, penalties, the button side, volume, sound, music, the announcer, vibration and the control tips.

## How it is built

```
index.html              page shell (GitHub Pages serves this from the main branch)
css/game.css            all styles
js/data.js              teams, formations, routes and both playbooks
js/game.js              the engine: plays, AI, rules, controls, menus, the 2D overlay and 2D fallback renderer
js/shaders.js           GLSL: turf, sky dome, crowd, rim light on players, glow and vignette pass
js/render3d.js          three.js renderer: stadium, instanced player models (a far and a near level of detail),
                        shadows, weather, cameras
js/audio.js             synthesized sound: effects, a crowd built from rendered voices, a voice on the stadium
                        speakers, a marching band, music, weather, and the announcer (speech synthesis)
js/league.js            schedule, standings and playoffs shared by Career and Season
js/career.js            Career mode
js/season.js            Season mode
js/camp.js              Training camp: drill scripts, scoring and screens
js/milestones.js        Milestones earned across all modes
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
- `H.exh(2, 120)`, `H.career('QB', 2)`, `H.careerSeasons('WR', 2)` play scripted games in each mode (careers are QB or WR).
- `H.camp('run', 4)` plays a training-camp drill (`'pass'`, `'run'` or `'tackle'`) with a simple test player.
- `H.fingerprint()` is a seeded run. After a change that should not alter behaviour it must return the same string.
- `PG.dbg.seed(n)` makes any run repeatable; `PG.audio.spoken` lists what the announcer has said.
- `await PG.audio.report()` renders every sound off line and gives its peak, loudness and spectrum;
  `PG.audio.meter` reads the level of what is playing now, and `PG.audio.asked` lists what the game has asked the
  stadium for (a referee's call, a boo, the halftime show), so the hooks can be checked without sound.

`tools/audit.js` is the interface audit. Load it the same way after the harness, then run
`await A.menus(); A.play('exh'); A.play('career'); A.play('camp'); A.report()` at a phone size such as 320 by 568.
It walks every screen and a scripted game and lists touch areas under 44 pixels, overlapping controls, clipped or cut
text, type under 10 pixels, contrast under 4.5 to 1 (measured against the picture really behind the text) and blocks
of the in-game display that overlap. An empty report is the standard.

`node tools/fmt.js <files>` is the house formatter. `node --expose-internals tools/astcheck.js before.js after.js`
proves a reformat did not change the program.

`python3 tools/bundle.py` writes `pocket-gridiron.html`, the whole game in one file.
