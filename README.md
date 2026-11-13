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
- Kick with a swipe: field goals, punts and your kickoffs. The swipe's angle is the aim and its length and speed the
  power: a straight, strong swipe splits the uprights, a soft kickoff stays in play. The timing bar still works.
- With the ball: Sprint, Juke, Spin, Power (truck a tackler in front of you, stiff-arm one beside you) and Hurdle.
- On defense: Switch, Dive, Hit (a hit stick that can jar the ball loose) and Strip.
- Punt returns you play, with fair catches and muffs. Fumbles you can dive on, or scoop up and run back, interceptions, sacks, safeties, overtime, timeouts, two-point tries, onside kicks, and
  four kinds of flag (false start, offside, holding, pass interference) that Settings can switch off. Rain and snow make the ball harder to catch and hold.
- Instant replays of big plays, at half speed from the sideline and then again from the reverse angle (a camera ahead
  of the play looking back at the ball carrier), a flyover before kickoff, three officials who signal, a player of the game.
- A broadcast booth: a play-by-play man and an analyst call the game ("Third and six." ... "He goes deep!" ...
  "Touchdown, Outlaws!" ... "You can't draw it up any better than that."), and sum up scoring drives ("Twelve plays on
  the drive."). The referee announces penalties over the stadium speakers ("Holding, offense. Ten yard penalty.
  Repeat third down."), the stadium announcer welcomes everybody before the opening kick and leads the crowd's
  "FIRST DOWN!", and the calls know who has the ball ("The quarterback keeps it himself!"). 365 recorded lines, every one
  written for this game and spoken by an open speech model; the big calls cut in over the small talk, and the crowd
  sits under them. Settings can turn the commentary off; the referee and the announcer are part of the stadium.
- The two-minute drill: late in a half an offense that needs points goes no-huddle, with less time off the clock
  between plays and the play-call sheet back sooner, marked "No huddle".
- The two-minute warning in the second and fourth quarters (quarters of three minutes or more): the clock stops at
  2:00 and the referee calls it. The referee also announces the coin toss and every timeout ("Timeout, Outlaws.
  That's their second timeout.").
- A 35-second play clock when you have the ball: it shows next to the down from :35 and turns red at :05; let it run
  out and it is a five-yard delay of game, called by the referee.
- Coach's challenge: a spot within half a yard of the line to gain is sometimes given the wrong side of it. Whoever
  the ruling went against may challenge (two a game; a challenge that fails costs a timeout): "Challenge the spot" on
  the next play-call screen. The other coach challenges the bad ones, and so does your coach in a career. The
  referee announces it and the result ("After review, the ruling on the field is reversed.").
- The teams switch ends after the first and third quarters: a crane shot rises over midfield, and the end zones and
  the sun are on the other side when it comes down.
- A career ages: you come into the league at 22, grow a little each of your first seasons, hold in your prime, and
  from 30 lose speed and elusiveness first and skill later. Your rival talks before you play his team, and after.
- Career awards night after every season: MVP, Offensive Player of the Year, Rookie of the Year, All-League at your
  position and your position's statistical title, each with its nominees from around the league. Retire a career
  and it goes to a hall of fame vote; every retired career is kept in the Hall of fame, on the main menu.
- After every scoring drive, its plays, yards and time. Halftime and the final screen (in every mode) show the
  scoring summary, each score with the drive that made it, and each team's passing, rushing and receiving leaders.
- Every voice is recorded, none synthesized: the booth, the referee, the stadium announcer (the draft included), and
  the players on the field: the quarterback's cadence and "Hut!", the defense calling out the formation, whoops,
  "Ball! Ball!" on a fumble.
- A stadium you can hear, the rest of it made in code: pads that crack harder the faster the hit,
  the defense calling out the formation before the quarterback starts and whooping after a sack or a takeaway, a field
  goal that clangs off the upright (in, or out), the ball thudding on the turf,
  a crowd that chants, boos a flag on the home team and builds a wall of noise on third down, the referee's call
  echoing over the speakers, the crowd finishing the announcer's "first down", a band in the stands and a halftime show.
- Players run on feet that stay where they land: the legs are solved each frame so a planted foot neither slides nor
  sinks, forward, backward or in a sideways shuffle, and linemen crouch with their soles flat on the turf. A defender
  with ground to cover turns and runs, looking back at the quarterback. The quarterback winds up as the power bar fills.
- A tackle is two men, not one after the other: the tackler bends to the hit with his shoulder at the runner's hip and
  his arms round him, and they go down together. Defenders who are on top of the play dive on and pile up on the two
  of them, and the pile comes apart from the top. Anyone else close by steps clear instead of standing in it.
- Eleven touchdown celebrations: the scorer jumps, spikes it, struts, takes a knee, roars, bows, shuffles, salutes,
  points both arms to the sky, flexes or leaps; his teammates jump, pump a fist, clap, wave to the crowd or shuffle,
  and about one in three the whole side does it together on the same beat. Teammates within 40 yards run to the
  scorer, gather round him an arm's length apart and celebrate facing him. In a career you can pick your own (the
  hub, under Touchdown celebration). On the other side heads go down and hands go to helmets.
- The officials signal touchdowns, first downs, incomplete passes, timeouts and the two-minute warning.
- Everybody watches something. Helmets turn to the ball in the air, to the man carrying it, to the quarterback; a
  receiver looks back for the ball once he is into his route, a quarterback in the pocket goes through his receivers,
  and the reserves on the bench follow the play up and down the field.
- A block is two men with their hands on each other: the blocker's inside on the chest plate, the defender's on the
  shoulder pads, elbows bent, helmets side by side.
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
replays, penalties, the button side, volume, sound, music, the commentary, vibration and the control tips.

## How it is built

```
index.html              page shell (GitHub Pages serves this from the main branch)
css/game.css            all styles
js/data.js              teams, formations, routes and both playbooks
js/game.js              the engine: plays, AI, rules, controls, menus, the 2D overlay and 2D fallback renderer
js/shaders.js           GLSL: turf, sky dome, crowd, rim light on players, glow and vignette pass
js/render3d.js          three.js renderer: stadium, instanced player models (a far and a near level of detail),
                        shadows, weather, cameras
js/audio.js             the sound engine: synthesized effects, a crowd built from rendered voices, a voice on the
                        stadium speakers, a marching band, music, weather, and the booth that plays the recorded
                        commentators (the device's speech voice is only their stand-in when the clips cannot be had)
js/vo.js                the index of the commentators' clips (written by tools/voice.py)
audio/vo.pack           the clips themselves, end to end in one file (about 3 MB of AAC)
js/league.js            schedule, standings and playoffs shared by Career and Season
js/career.js            Career mode
js/season.js            Season mode
js/camp.js              Training camp: drill scripts, scoring and screens
js/milestones.js        Milestones earned across all modes
docs/ROADMAP.md         what is done, what is next, and a log of how each part was checked
tools/                  local server, test harness, interface audit, formatter, bundler, icon generator, and the
                        booth: commentary.json (the script) and voice.py (records it)
```

Nothing is downloaded at run time except three.js 0.159.0 from cdnjs, the Archivo font from Google Fonts and the
commentators' clips (after the first tap, and only while the commentary is switched on). There are no image or model
files: the field, the crowd, the players and every sound but the two commentators are generated in code.
Without WebGL the game falls back to its 2D canvas renderer.

### The broadcast booth

The commentators are not real people and do not imitate any: no real announcer's voice, name or catchphrase is used,
and every line in `tools/commentary.json` was written for this game. The lines are spoken by
[Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M), an open speech model (Apache 2.0), run on a Mac through
[kokoro-onnx](https://github.com/thewh1teagle/kokoro-onnx) (MIT). `tools/voice.py` records each line, masters it
(trim, a lift in pitch, pace and brightness for the worked-up calls, a compressor, a set loudness), checks it against
its words by counting syllables, encodes it as AAC with macOS's `afconvert`, and writes `audio/vo.pack` and `js/vo.js`.
Neither the model nor its Python environment is in the repository; they live in `.voice/`, which git ignores. To
record again after changing the script or a voice:

```
python3.12 -m venv .voice/venv && .voice/venv/bin/pip install kokoro-onnx==0.6.1
# put kokoro-v1.0.onnx and voices-v1.0.bin (the kokoro-onnx release "model-files-v1.0") in .voice/model/
.voice/venv/bin/python -I tools/voice.py          # records only the lines that changed, then rebuilds the pack
.voice/venv/bin/python -I tools/voice.py --reel   # also writes .voice/booth-sample.m4a, a minute of both voices
```

A voice is a line in the script: a mix of the model's voices, a speed, and two tone settings. Changing it and running
the tool gives the whole booth a new voice in about five minutes.

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
- `PG.dbg.seed(n)` makes any run repeatable.
- `PG.audio.booth` shows the commentators: whether their clips loaded, what is being said, what is waiting, and
  `log`, every line the game has asked for (it fills with the sound off too, so a scripted game shows what they would
  say). `PG.audio.call('td', { pri: 2 })` asks for a line by hand.
- `PG.audio.deaf(true)` keeps the whole mix running but sends nothing to the speakers, so sound can be tested, and
  metered, in silence.
- `await PG.audio.report()` renders every sound off line and gives its peak, loudness and spectrum
  (`PG.audio.measure('vo:td')` does one commentary line through the whole mix);
  `PG.audio.meter` reads the level of what is playing now, and `PG.audio.asked` lists what the game has asked the
  stadium for (a referee's call, a boo, the halftime show), so the hooks can be checked without sound.

`PG.r3d.gait(8)` runs a figure at eight yards a second and measures its feet (how far a planted foot slides, how deep
it sinks, how long it is down); `{ how: 'side' }` makes it a shuffle, `{ who: 'ref' }` an official.
`PG.r3d.strip(8)` returns a picture of one stride from the side (`{ view: 'front' }` from in front).
`PG.r3d.tackle(0)` stages a tackle (the angle it comes from, in radians) and measures it: how far the tackler's hands
are from the runner, whether either body is inside the other or under the turf. `PG.r3d.tackleStrip(0)` draws it.
`PG.r3d.eyes()` puts the ball carrier at a set of angles round a running defender and says how far off his helmet
points (`PG.r3d.eyesStrip()` draws it). `PG.r3d.block(0.8)` locks a guard and a tackle up at the engine's distance and
measures where their hands, chests and helmets are (`PG.r3d.blockStrip()` draws it from four sides).
`PG.r3d.celebStrip()` draws every touchdown celebration. `PG.r3d.besideSweep()` stages 156 tackles with another man beside them and reports how far he is left standing in the
two on the ground. None of these draws a real play, so after any change to the renderer also play a whole game with
`PG.dbg.render()` after every step and watch for errors: the harness alone never draws.

`tools/audit.js` is the interface audit. Load it the same way after the harness, then run
`await A.menus(); A.play('exh'); A.play('career'); A.play('camp'); A.report()` at a phone size such as 320 by 568.
It walks every screen and a scripted game and lists touch areas under 44 pixels, overlapping controls, clipped or cut
text, type under 10 pixels, contrast under 4.5 to 1 (measured against the picture really behind the text) and blocks
of the in-game display that overlap. An empty report is the standard.

`node tools/fmt.js <files>` is the house formatter. `node --expose-internals tools/astcheck.js before.js after.js`
proves a reformat did not change the program.

`python3 tools/bundle.py` writes `pocket-gridiron.html`, the whole game in one file.
