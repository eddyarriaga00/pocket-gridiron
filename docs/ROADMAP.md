# Pocket Gridiron roadmap

Working plan for the overnight build session that started 2026-11-12 around 02:45 EST. The owner asked for
continuous work while asleep: much better player models, really good sound, animation, optimization, cleaner
formatting, and a full, interactive game experience. This file is the source of truth for what is done and
what is next. Update it after every item.

## Ground rules

- **Branch:** commit on `main` and push `main`. The owner wrote "always push to main" on 2026-11-12 at about
  07:10 (until then the work sat on `ui-refresh`, which is now merged and no longer used). Every push redeploys
  the live GitHub Pages site, so run the regression in "How to test" before pushing.
- **Technology:** the owner also wrote "use more complex languages and change code and anything if needed".
  Shaders (GLSL), modules and rewrites are welcome where they buy visible quality. The site is still static
  hosting, so everything must end up as files a browser loads directly.
- **After each item:** test, `python3 tools/bundle.py`, commit, `git push origin main`, republish
  `pocket-gridiron.html` to the existing artifact (https://claude.ai/artifact/6N1EjYsyKa7uDekXEQTQey),
  then tick the item below and add a line to the log.
- **No questions during automatic runs.** Decide, note the decision in the log, keep going.
- **What the automatic loop is for** (the owner, 14:10 on 2026-11-12: "yes automatic improvement loop yes but make
  major improvements or if not just work on improving ui more and more"): each run takes the biggest improvement it
  can finish and verify from "Next ideas" at the bottom of this file; when none fits, it refines the interface and
  runs the interface audit. Sound should keep moving toward "sounds like football" (the owner's words).
- **Taste (stated by the owner):** no yellow or gold anywhere; no condensed italic display type (Archivo,
  upright, is the display face); small controls (54px actions, 70px snap, 50px receiver buttons).
- **Original game.** No real league, team, player or video game names, logos or likenesses.
- **Assets:** procedural only, with one exception the owner chose on 2026-11-12 at about 17:58 ("of course option
  1", the free speech model on his Mac): the two commentators' lines are recorded by `tools/voice.py` with Kokoro-82M
  (open weights, Apache 2.0) and committed as `audio/vo.pack`. The model, its Python environment and the single clips
  live in `.voice/`, which git ignores. Nothing else is to be downloaded (audio, models, textures, fonts, tools, or a
  different speech model) without his say-so, and no credits are to be spent on the voice service connected to the
  session. Libraries only from cdnjs, pinned to an exact version (three.js 0.159.0 is confirmed available at
  `https://cdnjs.cloudflare.com/ajax/libs/three.js/0.159.0/three.min.js`).
- **The booth is original.** Every line is written for this game. Never a real commentator's voice, name or
  catchphrase, and no league or team marks.
- **Always shippable.** Keep the 2D renderer working as a fallback. New systems go in behind a setting until
  they are verified, then become the default.

## How to test

1. Preview server: `.claude/launch.json` has a config named `game` that runs `python3 tools/serve.py 48231`
   (a no-cache server: plain `http.server` let the browser serve stale scripts after edits). The file is
   gitignored; recreate it if missing. Start it with the preview tool, open
   `http://localhost:48231/index.html`, set the mobile viewport (375x812).
2. Load the harness in the page (the query string defeats the cache):
   `await fetch('tools/harness.js?'+Date.now()).then(r=>r.text()).then(t=>(0,eval)(t))`
3. Run:
   - `H.sim(12,180)` computer vs computer. Healthy ranges: about 4 yards per carry, completions 53-62%,
     interceptions 1-3%, about 25-35 points per game combined, `errs` empty.
   - `H.exh(2,120)` scripted user in exhibition (exercises play calling, kicks, kickoffs). `errs` empty.
   - `H.career('QB',2)` and `H.career('WR',2)` (a new career is a quarterback or a receiver). `errs` empty, stats non-zero.
   - `H.fingerprint()` must equal `localStorage['pg.fingerprint']` after any change that should not alter play. It pins
     the weather and the penalty switch itself, so what is saved in Settings cannot disturb it.
   - `H.camp('pass',4)`, and 'run', 'tackle': a training-camp drill played by a simple test player. `errs` empty.
   - `await H.fps(3)` with the pane visible, during a live play. Target 55+ in the pane.
4. Screenshot the menu, a pre-snap view, a live play, the career hub. Synchronous stepping does not repaint,
   so wait a second before a screenshot.
5. Console: no errors.
6. Interface audit, after any change to the stylesheet or to a screen. Load `tools/audit.js` the same way as the
   harness, then at 320x568 and 390x844 at least (the first is the tightest phone):
   `await A.menus(); A.play('exh'); A.play('season'); A.play('career'); A.play('camp'); A.report()`.
   The report must be empty. It lists touch areas under 44 pixels, overlapping or covered controls, clipped or cut
   text, type under 10 pixels, contrast under 4.5 to 1 (measured against the picture really behind the text, read back
   from the canvases) and blocks of the in-game display that overlap. `A.menus()` replaces the test season and career.
7. Motion, after any change to the poses: `PG.r3d.gait(8)` (and 2, 5, `{ how: 'back' }`, `{ how: 'side' }` at 3,
   `{ how: 'diag' }`, `{ who: 'ref' }` and `{ who: 'crew' }`) should report a slide of about 2 cm or less and a sink
   of under half a centimetre; `PG.r3d.tackle(0)` (and 1.57, 3.14) should report hands within 10 cm of the runner,
   nothing inside him and nothing under the turf, and `PG.r3d.tackleStrip(0)` draws that tackle as a row of frames;
   `PG.r3d.poseOf(i)` gives the pose player i is drawn in, for checking that a state reaches the figure; `PG.r3d.strip(8)` returns an image of one stride from the side
   (put it in an `<img>` and look at it). `PG.r3d.eyes()` should report the helmet within about 5 degrees of the ball
   carrier out to 90 degrees off his line, short of him beyond that, and not turned at all when he is behind;
   `PG.r3d.block(0.8)` hands within about 10 cm of the other man's chest, elbows bent, chests and helmets apart (no
   negative numbers); `PG.r3d.besideSweep()` a man beside a tackle no more than a few centimetres inside the men on
   the ground in most stagings and moved less than a yard (`eyesStrip()` and `blockStrip()` draw the first two).
   These hooks pose staged figures and never draw a real play, and the harness does not draw at all. So after any
   change to `js/render3d.js` also play a whole game drawn: `H.bot(); PG.dbg.step(0.02); PG.dbg.render()` in a loop
   until the game is over, inside a try, checking `PG.r3d.poseOf(i)` for numbers that are not finite. Run 5 deleted
   the pre-snap stance helper by accident and every staged hook still passed; only the drawn game caught it.
8. Commentary, after any change to the script, the voices or the booth. `tools/voice.py` prints, for every clip it
   records, its length and pitch, and flags any whose sound has far fewer syllables than its words (a swallowed
   line). In the page: `PG.audio.deaf(true)` first (the mix runs but the speakers get nothing; the test pane plays
   through the owner's speakers otherwise), then a real click so the sound engine starts and `PG.audio.booth.state`
   becomes `'ready'`. `PG.audio.booth.log` after `H.exh(3, 120)` and `H.career('QB', 2)` lists every line the game
   asked for: every one must exist in `PG.VO.clips`, and the drills must ask for none. Levels:
   `await PG.audio.measure('vo:td')`, `'vo:a.first'` and so on against `measure('crowd', { level: 0.6, cheer: 1 })`:
   a line should peak near -3 dB and sit about -16 dB RMS, a few dB above a full roar once the roar is dipped under
   it. Timing needs real time, which the synchronous harness does not give: step the game from a timer
   (`setInterval(() => { H.bot(); PG.dbg.step(0.02); }, 20)`) and watch `PG.audio.booth.now` and `.waiting`. The
   hidden pane only runs while a tool call is waiting on it, so wait inside the call.

## Architecture

- `index.html` page shell. `pocket-gridiron.html` is the same game inlined by `tools/bundle.py` (gitignored).
- `css/game.css` all styles. Tokens on `:root`; `--acc` is set from settings.
- `js/data.js` teams, formations, routes, playbooks (`PG.data`). Loaded first.
- `js/game.js` engine (plays, AI, rules), 2D renderer, HUD, menus, exhibition, player-lock controls,
  drive simulation. Exposes `window.PG`. `PG.dbg` has `auto(v)`, `seed(n)`, `step(dt)`, `render()`, `G`, `ps`, `P`.
- `js/league.js` schedule, standings, playoffs. `js/season.js` Season mode.
- `js/career.js` career mode: save (`localStorage` key `pg.career.v1`), league, XP, hub screens.
- `js/camp.js` training camp: drill scripts, star marks, screens (`pg.camp.v1` keeps the best result of each drill).
- Coordinates are yards. x 0..53.33 across, y 0..100 between goal lines, end zones to -10 and 110.
  Team 0 is the user and attacks +y. `G` is game state, `ps` the current play, `P` the 22 players.
- `js/audio.js` sound engine (`PG.audio`). `js/render3d.js` three.js renderer (`PG.r3d`); the 2D canvas stays on top as a
  transparent overlay for markers, letters and the joystick.
- Formatting: `node tools/fmt.js <files>` then `node --expose-internals tools/astcheck.js before.js after.js`.
  After any change that should not alter behaviour, `H.fingerprint()` must return the same string as before.

## Stages

### 1. Foundations
- [x] Auto-resume job (cron, every 10 minutes when idle, self-cancels after noon)
- [x] This roadmap
- [x] `tools/harness.js`

### 2. Sound
- [x] `js/audio.js`: master, sfx, crowd and music buses with a reverb send; unlock on first tap; Sound and Music settings
- [x] Crowd bed that follows the game: level from situation, roar on big plays, groan on turnovers, clap build on third down
- [x] Effects: whistle, pads collision (power from closing speed), kick, catch, snap bark, throw, UI ticks, horn, fanfare
- [x] Menu music: procedural 8-bar drumline with bass and brass (100 BPM)
- [x] Round 2 (see below): announcer, chant, organ riff, rain and wind. Not done: quarterback cadence, footsteps

### 3. 3D renderer
- [x] three.js scene (`js/render3d.js`) behind a Graphics setting, automatic fallback to 2D when WebGL or the library is unavailable
- [x] Field texture (stripes, lines, hashes, numbers, end zones, midfield logo), goal posts, pylons, first-down marker
- [x] Stadium: two decks of crowd, ribbon boards with team names, light towers with glow, benches, sideline figures
- [x] Camera matched to the portrait framing (fov 76, 24 yd high, 40 back); overlay canvas projects through the 3D camera
- [x] Polish: the crowd is a shader now (no moire), video boards show the score. The menu camera path is unchanged

### 4. Player models and animation
- [x] Procedural low-poly rig: helmet with stripe, visor and facemask, pads, jersey numbers front and back, arms, legs, shoes.
      Every body part is an InstancedMesh (13 draw calls for all figures). Ball model with stripes and laces.
- [x] Poses: line, under-center, two-point and wide stances; run cycle; backpedal with eyes on the quarterback; pocket carry;
      tucked carry; throw; catch reach; block; dive; stumble; fall; celebration and heads-down
- [x] Blob shadows, user ring, pass target ring in 3D
- [x] Looked at up close: the fall after a tackle. The kicker's leg swing has still not been viewed

### 5. Game feel
- [x] Break-the-huddle jog to formation; the ball travels from the turf to the quarterback on the snap
- [x] Incomplete passes bounce and roll (`ps.loose`)
- [x] Instant replay of touchdowns, interceptions and 28+ yard plays: half speed, low camera, tap to skip, setting to turn off
- [x] Stadium video boards with score, clock, down and distance, "TOUCHDOWN" on scores
- [x] Cinematic cameras: push-out before the snap, orbit around the scorer
- [x] Referee signals, handoff motion, celebration variety

### 6. Gameplay
- [x] Live kickoffs and returns in exhibition (touchbacks when the kick reaches the end zone); career and simulations use the 25
- [x] Computer tuning after the 3D pass: `H.sim(14,180)` gives 4.1 ypc, 62% completions, 2% sacks, 0.9% INT, 28 pts/game
- [x] Lob and bullet passes (hold vs tap)
- [x] Timeouts (three a half, the computer manages its own late in a half) and two pre-snap flags (false start, offside)

### 7. Career depth
- [x] Abilities: slots open at 74, 80 and 87 overall; four per position; they boost the ratings the engine plays with
- [x] Weekly practice: six reps, no clock, XP at half rate plus 80 (`startGame({drill:6})`)
- [x] Game grades (F to A+), a headline after each game, season honors (All-League, League MVP) with XP bonuses
- [x] Live stat chip under the scorebug; goals with check marks in the pause menu
- [x] The computer quarterback tests the receiver a user cornerback is covering more often
- [x] Combine (a tapping 40-yard dash and five position reps), a draft whose pick sets team, bonus and coach trust; roles
      (starter, rotation, backup) that decide how many drives you play; trust moves with game grades and practice; trade requests.
      Contracts are not modelled

### 8. UX
- [x] First-time tips for each control context (shown twice each, reset in Settings)
- [x] Settings screen: accent, graphics, sharpness, pre-snap camera, replays, sound, music, tips. How-to-play screen.
- [x] Auto-pause when the app is hidden (the test pane triggers this; the harness bot resumes)
- [x] Halftime report with team stats and the career stat line
- [x] Final presentation: player of the game, drive summary after touchdowns

### 9. Optimization
- [x] Measured: simulation 0.013 ms per step, render 0.5 ms of CPU per frame, 68 draw calls, 151k triangles, about 1 KB of garbage per frame. Pixel ratio is capped (Sharpness setting). Body parts are instanced.
- [x] The one per-frame coin flip (computer juke) is now a rate, so the game plays the same at 30, 60 and 120 Hz. A fixed timestep was judged unnecessary after that.
- [x] Lazy work: the field is not rendered while a full-screen menu covers it

### 10. Code quality
- [x] `game.js`, `career.js` and the harness reformatted with `tools/fmt.js` (one statement per line); data tables moved to `js/data.js`.
      The engine itself is still one file with section headers: its parts share too much state to split cheaply.
- [x] README update (controls, modes, layout, libraries)

### Round 2 (added during the night)
- [x] Model detail: tapered chest and limbs, short sleeves, joints, helmet decal; fill light
- [x] Follow camera in the open field; camera flashes in the stands
- [x] Bullet (tap) and lob (hold) passes; pre-snap hot routes by tapping a receiver's letter; QB Kneel and Spike
- [x] Season mode (`js/season.js`): one team, seven weeks, playoffs, standings, schedule, team stats
- [x] `js/league.js`: schedule, standings, simulated scores and playoffs shared by Career and Season
- [x] Career extras: league leaders at your position, 12 trophies, free agency between seasons, a retirement screen
- [x] Seedable RNG (`PG.dbg.seed(n)`), reformat with a syntax-tree check (`tools/astcheck.js`) and a same-seed check (`H.fingerprint()`)
- [x] README refresh

### Stretch
- [x] Offline play: `sw.js` is network first with the cache as a fallback, so a new push is never hidden by an old copy.
      Registered only on https. Not tested offline on a phone.
- [x] The game watches its own frame rate and drops the glow pass, then sharpness, then shadows if a device cannot keep up

## Log

- 02:45 Session start. State: `ui-refresh` has the UI refresh (fdf47ef), `main` is the live site with the
  older look. Auto-resume job created. Roadmap and harness written.

- 02:54 Sound engine done. Levels checked offline with `PG.audio.measure(name)` (peak / RMS dBFS): whistle -13/-26,
  hit -8/-30, horn -8/-22, fanfare -9/-24, music -4/-22, crowd bed -35 (quiet) to -29 (loud), big cheer -19.
  Nobody has listened to it yet: levels are verified, taste is not.

- 03:07 3D renderer and player models in. 95 draw calls, 131k triangles, 0.9 ms CPU per frame on the dev machine.
  `PG.r3d.debugCam = {pos:[x,h,-y], look:[x,h,-y]}` pins the camera for close-up screenshots; `PG.dbg.render()` forces a frame.
  `H.sim(6,120)`: 4.7 ypc, 59% completions, 2.1% INT, 24 pts/game, no errors.

- 03:16 Kickoffs, replays, video boards, jog-in, loose ball. Regression clean. Note: the pane's `zoom` action can return a
  stale capture; use `screenshot` after `PG.dbg.render()`.

- 03:19 Career depth pass. All five positions: practice, game, grade, headline, ability equip verified by script.

- 03:22 UX pass done: settings and help screens, tips, auto-pause, halftime report.

- 03:32 Round 2 so far: model detail, follow camera, flashes, bullet/lob, hot routes, kneel/spike, Season mode.
  Found and fixed a testing pitfall: `python -m http.server` let the browser reuse stale scripts; use `tools/serve.py`.

- 03:37 Career extras in. `H.careerSeasons(pos,n)` plays whole seasons: all five positions finish a season with no errors,
  a three-season WR run earned six trophies, free agency moves the player and starts the next season.
  League-leader baselines per game at 3-minute quarters: QB 150 yds, RB 60, WR 58, LB 3.4 tackles, CB 0.8 passes defended
  (a scripted bot gets about 143, 67, 60, 2.6 and 0.25, so a real player should be in the race).

- 03:49 Code clean-up. Wrote a small formatter (no formatter was installed and installing one needs the owner's say-so).
  Proof of no behaviour change: identical syntax trees, and `H.fingerprint()` (seeded simulations plus a traced game)
  returns the same string before and after. Data tables moved to `js/data.js`.

### Round 3 (planned at 03:49; the owner's top request is better models and animation, so that goes first)
- [x] Models: body types by position, pant stripes, wristbands, glossy helmets; real body-shaped shadows on the turf
- [x] Reviewed by eye: day, dusk, rain and snow all look right
- [x] Looked at up close: handoff, truck, hit stick, a celebration, the hurdle, an official's touchdown signal.
      Not viewed: the stiff arm and the strip swipe
- [x] Shader pass (GLSL, `js/shaders.js`): turf with blade detail, view-dependent mowing stripes and wet reflections; sky dome with
      sun, stars and clouds; a crowd drawn seat by seat that hops when it cheers; rim light on players; a finishing pass with glow,
      vignette and color (Settings can turn it off)
- [x] Animation: handoff exchange, three touchdown celebrations, officials who jog and signal, reserves that react,
      truck, stiff arm, hurdle, hit stick and strip poses (the run cycle itself is unchanged)
- [x] Weather and time of day: day, dusk, night, rain, snow
- [x] Moves: Power (truck a tackler in front, stiff-arm one beside), Hurdle, Hit (hit stick), Strip; fumbles (lost or recovered);
      rain and snow make catches, fumbles and field goals harder
- [x] Sound round 2: announcer calls through the device's speech synthesizer (Settings and the pause menu can turn it off),
      a stomp-stomp-clap chant, an organ riff the crowd answers, rain and wind beds, a muffled mix while paused
- [x] Presentation: a flyover with a matchup card before kickoff (tap to skip), a drive summary after touchdowns, a box score
      that names a player of the game on every final screen (worth 300 XP when it is your career player)
- [x] README refresh, final regression, morning summary

- 04:01 Round 3, first part, committed in a working but only partly checked state (the usage limit arrived here).
  In: body types by position, pant stripes, wristbands, glossy helmets, body-shaped shadows (four from the light towers at
  night, one from the sun by day; `SHADOW_GEO` keeps them cheap; Settings has a switch), time of day (day, dusk, night) and
  weather (rain, snow) chosen in Exhibition and picked per week in Career and Season, three officials who signal
  touchdowns, first downs and incompletions, reserves that jump when their team scores, more celebrations, a handoff
  pose, the ball on the turf before the snap. 228k triangles, 133 to 157 draw calls.
  Checked: night view by screenshot; day, dusk-rain and night-snow run with no errors; exhibition and career bot games
  finish; `H.fingerprint()` unchanged. NOT yet looked at: screenshots of day, dusk, rain and snow; the celebrations, the
  handoff pose and the officials' signals up close; weather has no effect on play yet. Do that first on resuming.

- 07:19 The owner checked in: "always push to main" and "use more complex languages and change code and anything if needed".
  Merged to `main` and pushed (live). Shader pass added in GLSL (`js/shaders.js`): turf, sky dome, crowd, rim light and a
  finishing pass that renders the scene off screen with 4x anti-aliasing, blooms the brightest pixels and adds a vignette.
  134 draw calls and 229k triangles with everything on. Checked by screenshot in day, night, rain; regression clean
  (`H.fingerprint()` unchanged, `H.sim(6,120)` 4.6 ypc, 63% completions, no errors). Not measured on a phone: if it is slow
  there, Settings has switches for shadows and for the finishing pass, and Sharpness lowers the pixel ratio.

- 07:24 Moves and fumbles. Carry pad: Sprint, Juke, Spin, Power, Hurdle. Defense pad: Sprint, Dive, Switch, Hit, Strip (keys L, H, F, R).
  A tackle knocks the ball loose 1.6% of the time, 10% on a hit stick, 15% on a strip; who recovers depends on who is nearby.
  `H.sim(12,180)`: 4.5 ypc, 57% completions, 1.6% INT, 31 pts/game, no errors. `H.fingerprint()` re-baselined (the fumble roll
  changes the random sequence on purpose). Hurdle pose checked by screenshot; truck, stiff arm, hit and strip checked by
  script only (timers and odds), not yet by eye.

- 07:27 Sound round 2. `PG.audio.spoken` keeps the announcer's last lines, so a scripted game can show what he would say:
  kickoff welcome with the weather, third and fourth downs, touchdowns with the scorer's name, turnovers, sacks, field goals,
  the half and the final score. The test pane has no speech voices, so the calls were checked as text only; nobody has heard
  them. Levels (peak / RMS dBFS): organ -11/-22, stomp -19/-40. The announcer's word choice uses `Math.random`, never the game's
  seeded generator, so `H.fingerprint()` is unchanged.

- 07:30 Presentation. New game state `intro` (3.8 s, tap or Space to skip; skipped in simulations). `G.box` is the box score,
  `playerOfGame()` picks from it; simulated career drives have no players, so only played snaps count. Regression clean:
  `H.fingerprint()` unchanged, exhibition, a season game and all five career positions finish without errors.

- 07:37 Timeouts and flags. `G.runoff` is the time that ran off after the last play; a timeout hands it back. The user gets a
  Time out button for the moment after the whistle and another on the play-call sheet (key T). Scoreboard shows three pips a team.
  Seeded computer games: 3.4 timeouts used a game, a flag on 2% of snaps. `H.sim(16,180)`: 4.5 ypc, 57% completions, 33 pts,
  no errors. `H.fingerprint()` re-baselined (the flag roll changes the random sequence on purpose).

- 07:43 Career opening and coach trust. New career flow: create, combine, draft, hub (or walk on with a team and skip the draft).
  `C.trust` 0 to 100: 60 starts, 35 rotates (about 6 drives in 10), below that backup (about 4 in 10). The engine takes
  `share` and sits the player for whole drives (`simDrives(true)`). Goals and grades scale with the share so a part-timer is
  judged fairly. Checked: a scripted rookie went dash, drills, draft (pick 4, trust 56, rotation) and into the hub; two-game
  bot careers at all five positions and a two-season run finish with no errors; `H.fingerprint()` unchanged.
  Not checked by a person: how the dash feels to tap, and whether trust rises at a fair pace for a real player.

- 07:50 Fumble scramble. Forcing a fumble on 292 computer plays: 53% lost, 46% kept, one returned for a touchdown, none stuck,
  1.4 seconds on average. Natural rate in seeded computer games: 0.36 fumbles a game, 0.14 lost. `H.fingerprint()` re-baselined.
  Noticed while testing: the scripted exhibition user (who only ever calls the first play and kicks on every fourth down) now
  loses by about 27 points a game; with fumbles switched off it is the same, so it is not the scramble. Computer against
  computer is steady at about 32 points a game combined. A smarter test bot is needed before reading anything into that.

- 07:52 Audibles. `setupPlay(true)` re-aligns for the same snap; `G.flip` mirrors formation, run path and the two sided routes.
  Checked by script (a toss sweep's path flips from left to right, two audibles in a row, the drive still counts one play,
  the snap works afterwards, the defense steps from Cover 2 to Cover 3) and by a screenshot of the three-button pad.
  `H.fingerprint()` unchanged.

- 07:56 Two-point tries and onside kicks. `G.pat` holds a pending choice, `G.try2` marks the try play (no clock, no flags, no kicks
  on the call sheet), `finishTry` scores it. Scripted: touchdown, choice sheet, try from the 2, "Two points!", 8-0, kickoff;
  and an onside kick when down 12 with 25 seconds left. Three 16-game simulations: 32 to 34 points a game (one sample of 40),
  no errors. The computer tries an onside kick in about two games out of three: its trailing teams score late often, and
  after such a score an onside kick is the right call. The window is the last 27% of the fourth quarter.
  `H.fingerprint()` unchanged.

- 07:59 Run cycle and tackles. The renderer now keeps its own stride phase per figure (`f.ph`), advanced by ground covered over
  a step length of 0.8 to 2.5 yards. Checked by two close-up screenshots (a back at full stride, a tackler lying across the
  carrier). Motion itself cannot be judged from stills. In `H.fingerprint()` only the position trace changed (downed players
  now slide a little after the whistle); scores, stats and step counts are identical. Re-baselined.

- 08:01 Coach and rival. `coachSays()` builds the note; `C.rival` is the man to beat. A scripted RB season ended ahead of the
  rival (657 yards to 604) and earned the trophy; the hub shows the coach's card. Word choices use `Math.random`, so
  `H.fingerprint()` is unchanged.

- 08:03 Season roster. `startGame({ros0})` plays with a saved roster; `onEnd` now carries the box score. Two bot games: the
  Roster tab shows leaders (rushing 334 yards, 8 tackles) and lines per player. `mkRoster` re-rolls duplicate numbers, which
  changes the seeded sequence, so `H.fingerprint()` was re-baselined. `H.sim(12,180)`: 32 points a game, no errors.

- 08:07 More flags. 20 seeded computer games: 11 holding, 7 false starts, 8 offsides, 1.3 flags a game; none with the switch off.
  Pass interference never came up by itself in computer games: their quarterbacks only throw to open receivers, so a catchable
  ball almost never falls incomplete with a defender close (measured: 0 of 52 incompletions). It needs a defender within
  2.2 yards, so it will mostly follow a user's throw into coverage. Its code path was exercised by forcing it for six games
  (2.8 a game, every one a first down at the spot, no errors), then the real numbers were restored.
  Also learned from that measurement: most computer incompletions are inaccurate throws to wide-open backs behind the line.
  `H.fingerprint()` re-baselined.

- 08:10 Menu shots and portraits. `PG.r3d.portrait(team, home, number)` renders one figure in its own small scene to an off-screen
  target and returns a PNG data URL (cached per team, kit and number). Checked by screenshot on the Exhibition screen (home and
  away kits) and the Career card. With 3D switched off the portraits are simply absent. The four menu shots were not
  watched in motion. `H.fingerprint()` unchanged.

- 08:14 Career difficulty, measured with the bot (which plays your player the way the computer would; a scripted QB also throws
  worse than a person). 21 games per position on teams rated 85, 82 and 80.
  Before: average game grade in points was QB 4.9, RB 6.3, WR 6.2, LB 3.1, CB 3.1 against a neutral point of 4.5 for coach
  trust, so backs and receivers became starters just by showing up and defenders sank to the bench (trust 5) while winning.
  A running back's team won 5 of 21 because the coach called runs 60% of the time.
  Changes: harder goals and a lower stat scale for RB and WR, a higher stat scale for LB and CB, a neutral point per position
  (`NEUTRAL`), run calls for a back cut to 50%, and a difficulty choice in the Career hub (All-Pro pays 20% more XP).
  After: grades RB 5.4, WR 5.1, LB 2.8 to 3.6, CB 3.2 to 4.1; trust ends both above and below its start at every position;
  wins RB 8/21, WR 13/21, LB 10/21, CB 6/21. Samples are small and noisy. `H.fingerprint()` unchanged.

- 08:16 Name plates (a quad above the number, text squeezed to fit) checked by a close-up of the quarterback. Vibration uses
  `navigator.vibrate`, which iPhones do not offer to web pages and which no test here can feel; it waits for the first tap.

- 08:18 Play of the game. `G.potd` holds the frames plus copies of the 22 players and the play state; `watchPotd(done)` replays
  it and hands the final screen back. Scripted: a forced 51-yard run became the play of the game, the button showed it from the
  low camera, and both the natural end and a tap to skip returned to the final sheet. `H.fingerprint()` unchanged.

- 08:23 Playbook and run game. Measuring yards per play by play name (16 seeded computer games) showed what the overall 4.5 yards
  a carry had been hiding: Toss Sweep 12.1, Inside Zone 2.4, Off Tackle 1.6, QB Draw 1.6, and the new Counter at -1.6.
  Changes: the toss is pitched at once so the defense reacts sooner; each run play has a `push` (how hard the line drives its
  men back); Off Tackle and Counter aim at the B gap; a sneak is hard to stop for its first step. After, on three seeds:
  overall 3.9 to 4.5; Inside Zone 3.8 to 4.5, Off Tackle 3.2 to 5.3, Counter 3.0 to 4.3, QB Draw 2.4 to 2.9, HB Draw 2.2 to 6.9,
  Toss Sweep 5.4 to 7.0, QB Sneak 0.5 to 1.6 on short yardage. Points 29 to 36 a game. A longer hold on run blocks was tried
  and rejected (it sent HB Draw to 16.8). All four new plays ran in a scripted user game. `H.fingerprint()` re-baselined.
  The same measurement for passes: Smash 12.6 and Stick 11.5 yards a play are the strongest; not changed.

- 08:26 Punt returns. A punt with a returner (`ps.ret`) becomes a 'ko' play at the catch (`ps.punt`). 24 scripted punts each way:
  the computer returning averages 9.7 yards, the user's returner (run by the computer in the test) 13.4; no touchdowns in the
  sample, though one turned up in an earlier single try. Career games, practice and simulations keep the simulated return.
  `H.fingerprint()` unchanged.

- 08:27 Camera choice (`SET.camv` scales the gameplay camera's height and distance by 0.8 or 1.25), left-handed layout (a `lefty`
  class on the app) and the hall-of-fame card. One screenshot with both settings on shows the button bottom left and the
  closer view; a two-season bot career scores 8, "A short stay in the league". `H.fingerprint()` unchanged.

- 08:44 Training camp (`js/camp.js`). The engine side is small: a drill can now be scripted (`PG.startGame({ drill, side,
  script, dcall })`), each rep is logged in `G.drill.reps`, and `ps.userTkl` records whether the player you steer made the
  tackle (2) or was within 2.6 yards of it (1). Control tips always show in a guided drill and do not use up the two showings
  a real game gets. The star marks came from test players (`H.camp(id, n)`, a bot that throws to the most open man, runs
  upfield around the nearest defender and jukes, or chases the ball and dives):
  passing, completions out of 5: the computer's own quarterback 3.1 (1 to 5, 16 drills), marks 2 / 3 / 4;
  running, yards on 5 carries: nobody touching the screen (the computer runs for you) median 31 to 35, the bot median 90,
  marks 20 / 45 / 75; tackling, tackles you are in on out of 5: the bot 3.0 (2 to 4), nobody steering 0.8, marks 2 / 3 / 4.
  The first version of the running drill used Cover 3 every rep and gave up 10.5 yards a carry, so it now faces the computer's
  normal mix of calls. No person has played the drills yet, so the marks may be off for real hands.
  Also fixed on the way: the rep counter read 6/5 on a drill's final screen, the stadium clock ran during practice, and the
  tip box ran under the receiver buttons. Regression: `H.fingerprint()` unchanged; sims, exhibition, career (QB, LB, WR, with
  practice) and a season game finish with no errors.

- 09:00 Models. `PG.r3d.info` now reports `nearModel` and `camDist`. The inside-out bug: three.js faces a lathe outward only
  when its profile climbs, and the limb profiles ran top-down, so the signed volume of the upper arm, sleeve, forearm,
  thigh, pants stripe and shin came out negative (measured in the page). You were looking at the far wall of each limb.
  `lathe()` now turns such a profile round. Before and after close-ups: the pants stripes, never visible before, appear.
  Near model: 45 figures at about 10,500 triangles each against 3,900 (478k triangles in a close-up, 194k in play; the
  swap happens under 20 yards from camera to subject and back above 24). Measured over a scripted game: play, pre-snap and
  dead-ball views sit at 25 to 55 yards (far model in every sample), replays at 14 (near model in every sample),
  celebrations 8 to 38. Frame rate with the near model was not measured: the test pane was hidden, which throttles it.
  Seams fixed after looking at close-ups: the name plate sank into the pads (a flat chord across a curved surface; it now
  has three rows), ankles poked through the shoes of thick-legged players (shoes now scale with the leg), and the pants
  grazed the jersey hem and the socks (the hem flares, the sock steps in under the knee).
  Also: leaving a game in the middle of a replay left the replay badge on the menu. `H.fingerprint()` unchanged.

- 09:02 Career history. `closeSeason` adds one row to `C.hist`. Two scripted quarterback seasons and one running-back season
  produced the right rows on both screens; `H.fingerprint()` unchanged.

- 09:07 Punt returns, second pass. A returnable punt now hangs one second longer (`HANG`; simulated punts are untouched, so
  `H.fingerprint()` is unchanged), every third coverage man holds up five yards short as a second wave, and the punter trails
  as the last man. Before, the nearest coverage man was 14 to 19 yards away at the catch and nobody had a reason to fair
  catch. After (scripted, 50 punts by the user's team and 40 by the computer): the computer fair-catches 34%, returns
  average 5.1 and 5.4 yards, 3 touchdowns in 90 (5 in 66 before the second wave). Muff chance is 1.5%, 5% with a tackler
  within 2.5 yards, 1% on a fair catch, times the weather; forced in a test, both a recovery by the receiving team
  ("muffed, recovered") and by the kicking team ("Muffed punt!", a turnover) score correctly. The fair-catch wave was
  checked in a close-up. Not tried by hand: whether the button is easy to find in the second or so you have.

- 09:09 Milestones. `endGame` reports every finished game that is not a drill or a computer-only run. A rigged All-Pro win in
  the rain (38-7 with the stat totals set by hand) earned seven at once and the banner listed them; the seeded
  `H.fingerprint()` run counts no games and is unchanged. Title and camp milestones are reported by their own screens and
  were not triggered in a test.

- 09:14 Catch and get-up poses (render only; `H.fingerprint()` unchanged). The session's usage limit was reached here: the
  next three Round 7 items are untouched.

- 12:16 Chain crew. Three more figures (`CREW`), so 48 instances per body part; a night frame is 255k triangles. Checked from
  a sideline camera: on 2nd and 9 the back stick and the "2" box stand at the line of scrimmage and the front stick at the
  line to gain. The standard gameplay camera rarely shows that sideline, so this is mostly for replays and wide plays.
  `H.fingerprint()` unchanged; exhibition, career and camp bots clean. The scheduled autopilot ended at noon (job cancelled
  at 12:12); work after that was at the owner's request.

- 12:18 Bracket and awards. `league.js` records `po.games` ({s1, s2, f} as [team, team, winner]) with the same simulated
  games in the same order as before, so seeded results should not move (`H.fingerprint()` unchanged; scripted careers are
  not a check of this, because the test player's throw timing is not seeded). Checked two scripted seasons: one with the score rigged to win it all (the
  bracket filled in after each round, the title milestone fired) and one played straight that missed the playoffs (the
  whole bracket appears at once). A season saved before today has no bracket until its next playoffs.

- 12:21 Contracts. `C.deal = { years, left, pay }`, `C.cash` for the total. Offers are a pure function of your overall, last
  season's average grade and each team's rating (no dice, so `H.fingerprint()` is unchanged). Scripted: a drafted receiver
  (pick 3: two seasons at $4.2M), a walk-on quarterback through three seasons (re-signed after the first, total $5.8M, then
  signed with another team from the offers screen), and a save with the contract fields deleted (treated as one year left).
  Free agency used to be open every offseason; now it opens only when the deal is up. Round 7 is complete.

- 13:24 Positions and throw power. `throwTo(r, pt, power)` takes 0 to 1 (the computer's quarterbacks throw at a half, as
  before, so `H.fingerprint()` is unchanged). The bar fills in 0.55 s of game time; a hold a second past full throws anyway.
  Scripted checks: a two-step tap on the pad gave "Lob 7" (0.97 s in the air over 19 yards), a full bar from an on-field
  letter gave a bullet (0.77 s), moving to another letter mid-hold moved the charge, and a sack mid-hold cancels it. The
  test player now holds its key for 0.3 s; the first version of that deadlocked a quarterback career (a stale charge
  after a sack stopped it snapping), which is why `finish()` clears the charge.

- 13:42 Audio, second version. Nobody at this end can hear, so it was checked by measurement: `PG.audio.report()` renders
  every sound through the whole mix off line and gives peak, loudness, the loudness and peak with everything under
  250 Hz removed (about what a phone speaker plays) and the share of energy in six bands; `PG.audio.meter` reads the live
  output. Before: crowd bed -35 dB RMS, tick -26 dB peak, catch -17, throw -20, whistle -13. After (dB, peak / RMS):
  crowd quiet -8 / -22, tense -4 / -17, cheering -3 / -14; music -3 / -17; whistle -8, hit -8 (phone peak -9, it was
  nearly all under 200 Hz at first), kick -8 (phone -12), catch -11, horn -5, fanfare -4, tick -20. Nothing reaches
  full scale: the limiter holds sustained sound near -4.5 dB. The loops have no click at the seam (the jump there is no
  bigger than between any two samples) and hold their level round the loop to within about 2 dB after the roar's
  voices were spread over its first two seconds. A live run in the pane with a real click (music, crowd at three
  moods, cheer, ooh, groan, chant, claps, whistle, hit, roll, touchdown, rain and thunder, pause muffle) matched
  the off-line levels and raised no errors. What measurement cannot say: whether the voices sound like people or
  like a choir of synthesizers, and whether the theme is any good. `H.fingerprint()` unchanged.

- 13:47 Camera zoom. `SET.zoom` (1 is standard, bigger is closer) scales the gameplay camera's height and distance and the
  2D view's focal length; the old `camv` choice is carried over. Looked at 60%, 100% and 180%. At 60% with the ball
  on your own 2 the camera had backed out behind the end-zone video board, whose black back filled half the screen: the
  camera now stops 44 yards behind the goal line and climbs instead, the near board is hidden while the camera is behind
  it, and the near goal post is hidden during play when the camera is behind it (its uprights used to stand in front
  of your quarterback on your own goal line at any zoom). `H.fingerprint()` unchanged.

- 13:50 Suggested plays. `suggestOff()` and `suggestDef()` are plain rules with no dice. Seen in a scripted game: 1st and 10
  Off Tackle, 2nd and 9 Stick, 3rd and 5 Slants, 3rd and 15 Dagger, 3rd and 2 Inside Zone, 4th and 1 QB Sneak; on defense
  Cover 2, Cover 3 on 2nd and long, Cover 4 on 3rd and 7. The test player now takes the suggestion, and its exhibition
  scores went from losing by about twenty to 7-0, 7-14, 6-7 and 3-14. `H.fingerprint()` unchanged.

- 14:04 Play tag and run-pass options. `playKind(op)` names the play; `ps.rpo` marks an option. Balance, by scripted
  players over three games each (yards a play): Inside Zone 3.6; RPO handed off every time 2.2 (it was -0.1 with a
  one-second mesh four yards deep, so the mesh is 0.7 s and nearer the line); RPO thrown every time 16.0 with 71%
  complete and 7% turned over (it was 21.3 and 90% before the lane rule); ordinary Slants thrown by the same player
  13.7, 74% and 6%. So an option thrown blind is about an ordinary pass, and the hand-off is the safe floor. The test
  player's own "read" did not match the engine's lane check, so a well-read option is not measured.
  `H.fingerprint()` unchanged: the computer never calls an option, and the only dice are rolled when one is called.

- 14:09 Football sounds. Measured the same way (dB peak, and the peak a phone speaker would reach): cadence -6, "Hut!"
  about -8, line crash -4 (it plays on every snap, so it was pulled down from six hits to five quieter ones), audible -8,
  cannon -4 (phone -14), band pieces -3 to -4 with the snares brought up and the bass drums down after the first
  render came out 91% below 200 Hz. A live run played every one of them without an error; with the horn, the fanfare,
  the cannon and a full cheer at once the output peaked at -3 dB. The band rests at least 16 seconds between pieces.

- 14:42 Bug test and interface pass. Looked up the numbers first: Apple's guidelines ask for 44 by 44 point touch
  areas, Material for 48 dp, WCAG 2.2 sets a 24 pixel floor (AA) and 44 as the enhanced level; text contrast 4.5 to 1
  (3 to 1 for large type); safe-area insets need `viewport-fit=cover` (already set). `tools/audit.js` measures all of
  that on the live page. Found by it, on a 320x568 phone: the play tag and the coaching card ran under the thumb
  buttons; "Punt return" was cut off; the kick caption was white on snow (1.1 to 1); the tagline and the how-to-play
  text sat over the moon at 1.6 to 2.9 to 1; locked trophies were at 2.1 to 1; nine kinds of control were under 44
  pixels (the trade link was 17 high); eleven labels were under 10 pixels. Found by hand while testing: Settings and the
  Career and Season hubs jumped back to the top on every tap (measured: scroll 465 to 0; now 190 to 190), and How to
  play still said "tap a letter for a bullet pass", which the power bar replaced. `H.fingerprint()` unchanged;
  exhibition, quarterback and receiver careers, a full receiver season and all three drills ran clean; no console
  errors. One trap for later runs: the seeded run used to read the weather from Settings, so a test that leaves snow
  switched on made it look like a regression. It pins the weather itself now.

- 15:12 Stadium sound (automatic run 1). `paVoice()` speaks any text down the speakers' route: the spelling becomes
  vowels and consonants through one formant mouth, with the echo and reverb the horn already had. A referee's call
  measures -6.6 dB peak and -23.5 RMS, 61% of it between 500 Hz and 1 kHz, so it sits under the commentator; his
  microphone click is -11.6. New crowd stems: `boo` (-3.4 peak, -15.5 RMS, 81% between 200 and 500 Hz, which is where
  a "booo" lives) and `firstdown` (-3.3, -16.5). `crowd.rise()` holds about -14.6 dB RMS against -17 for a tense crowd
  and -13.8 for a full cheer, and `settle()` drops it at the snap. `crowd.swell()` is the kickoff "ohhh" played at the
  speed that makes it top out as a long pass comes down. The halftime piece is 16.5 seconds, -2.8 peak, -18.8 RMS; its
  first render had 38% of its energy under 200 Hz, so the tubas went up an octave and the bass drum down (28%).
  In ten scripted games the game asked for the halftime show 10 times, the third-down noise 22, the deep-ball swell 5,
  and referee's calls for a false start, an offside and a hold. A 15-second live run at low volume played every one
  with no error. `H.fingerprint()` unchanged (every hook is outside simulations and rolls no dice); exhibition, both
  careers and the three drills clean; the interface audit empty at 320x568 and 390x844.
  Not built: the crowd counting down the play clock. The computer snaps about two seconds after it lines up, so there
  is nothing to count; the third-down noise does that job. Hits already grew with closing speed (`pw` in the tackle).
  `PG.audio.asked` lists what the game has asked the stadium for, so a test can check the hooks without sound.

- 15:46 Motion (automatic run 2). Measured the old run first, with the formulas copied into a script: the foot was within
  2 cm of its lowest point for 5 to 11% of the stride, was moving backward over the turf at 1.5 to 7 yards a second
  while it was there, and sank 2.6 to 6.7 cm into the field. The rig now has ankle joints (two more pose values) and
  the legs of anyone on the move are solved, two bones in the plane the leg swings in, to put each foot where the
  stride says: planted for 66% of the cycle at a walk down to 30% flat out, then swung through on an arc.
  `PG.r3d.gait(speed)` runs the real figure code and measures it. From 1 to 9.5 yards a second the planted toe now
  slides 0.9 to 1.5 cm at most (0.2 cm backpedalling), sinks 0 to 0.2 cm, lifts 21 to 63 cm, and the knee over the
  planted foot bends 33 to 51 degrees. `PG.r3d.strip(speed)` draws one stride as a row of side views; looked at for
  2.2, 5 and 9.5 yards a second and a backpedal. Set stances are stood on the turf by `plant()`: soles flat, hips
  moved until the lower foot rests on the ground (the shoe used to be one piece with the shin, so a crouch buried the
  toes 10 to 16 cm). The quarterback winds up as the power bar fills, faces the man he is throwing to, skips the
  cocking part of the throw if he is wound up already, and finishes low and across for a bullet, high for a lob.
  Drawing only: `H.fingerprint()` unchanged; exhibition, both careers and the drills clean; audit empty at both
  phone sizes; no console errors. Not solved: a sideways shuffle. The legs only swing forward and back, so a defender
  sliding across still steps in place while he moves (measured: 120 cm of slide a step).

- 17:20 Motion, the sideways half (automatic run 3; the 16:02 run stopped at the owner's usage limit before any change).
  The hips now open sideways and the ankle turns on all three axes, so the leg solve reaches a foot placed anywhere
  on the turf and the shoe still lies flat pointing where he faces. The stride takes the direction of travel in the
  figure's own frame: forward, backward, sideways or between. A shuffle takes short quick steps (0.5 yard plus 0.06
  per yard a second), keeps the feet 0.22 of a leg wider than the hips so they never cross, and rides 7% lower.
  `PG.r3d.gait(3, { how: 'side' })` went from 120 cm of slide a step to 1.7 at most (0.9 on average); a diagonal is
  0.9, a backward diagonal 2.2; forward and backward are unchanged (1 to 1.5, 0.2). The first version left 3.3 cm,
  because the ankle only undid the leg's pitch and roll and the shoe swung a little about the ankle: the exact
  inverse of hip, hip and knee fixed that. A covering defender no longer shuffles at a sprint: above 4.6 yards a
  second across the field (6.4 straight back) he turns and runs, chest and helmet turned back to the quarterback
  (looked at in a close-up: a safety at 8.6 yards a second). The officials and the chain crew are on the same stride
  (1.0 and 1.4 cm) through `stridePhase()`, `strideLegs()` and `easePose()`, which all three kinds of figure share.
  Drawing only: `H.fingerprint()` unchanged; exhibition, both careers and the drills clean; audit empty at both phone
  sizes; no console errors.

- 17:44 Two-player tackles (automatic run 4). Measured first, with a staged tackle (`PG.r3d.tackle(angle)`: a runner
  at six yards a second met from the front, the side or behind, then moved exactly as the engine moves the pair).
  As it was: the tackler's hands ended 23 to 28 cm from the runner, his trunk 19 to 35 cm inside the runner's body,
  and parts of both men up to 46 cm under the turf; the two fell side by side like dominoes. Now the tackler bends to
  the hit inside a tenth of a second with his shoulder at the runner's hip, his arms are solved (`armIK()`, the leg
  solve turned round for an elbow) to a hand on each side of the runner's hips, he is drawn at 0.96 yard from the
  runner so the shoulder really is there, and he rides him down to lie across his legs with his head turned aside
  (the head has its own turn now). `settle()` tries each fallen pose on the figure before it is used: hips up until
  nothing is under the grass and the tackler's trunk is on the runner and not in him, hands pushed out to the
  runner's surface, feet let down to the turf. Measured at six approach angles once they are down: hands 8 to 9 cm
  from the runner's surface (the hand's own radius, so touching), trunk inside the runner 0, under the turf 0 for
  both. The runner keeps the ball tucked on his back or side and holds it out in front when he lands on his face.
  `PG.r3d.tackleStrip(angle)` draws the fall as a row of frames; looked at for the three directions, and one real
  tackle in a game from above.
  A correction to the 15:46 entry: the quarterback's wind-up was not reaching the game. The power-bar value was
  passed to the renderer but not on to the pose code, and the still I took showed his ordinary pocket pose, which I
  misread. It is passed through now and checked by reading the pose the game draws (`PG.r3d.poseOf(i)`): right
  shoulder 0.80 in the pocket, 3.05 with the bar at 87%, 3.33 at the release, 1.25 late in the follow-through.
  Drawing only: `H.fingerprint()` unchanged; exhibition, both careers and the drills clean; audit empty at both phone
  sizes; no console errors.

- 17:51 The owner's first verdict by ear: the spoken commentary sounds "too ai" and should be "like the nfl
  commentators". Nothing changed in the game for it yet. Looked at what could record real-sounding lines: the voice
  service connected to this session (Eleven v4 and others; a two-voice sample of 230 characters priced at 1.15
  credits, one short line at 0.5; the account holds 5 credits), and this Mac (M1, Python 3.14, no speech model, no
  ffmpeg; only compact system voices installed). Asked the owner which way to go; see "Next ideas".

- 18:32 The booth (Round 10). The owner chose the free model on his Mac. Downloaded, with that say-so and nothing
  else: `kokoro-v1.0.onnx` (326 MB) and `voices-v1.0.bin` (28 MB) from the kokoro-onnx project's GitHub release
  "model-files-v1.0", and the `kokoro-onnx` 0.6.1 package with its dependencies from PyPI into a Python 3.12
  environment (155 MB); all of it in `.voice/`, outside the repository. Auditioned twelve of the model's male voices
  on one line and measured pitch and range: play-by-play is `am_fenrir` (the second-widest range of the twelve, at a middle pitch:
  4.8 semitones between the 10th and 90th percentile) at 1.05 speed; the analyst is a deeper blend, 65% `am_michael`
  and 35% `am_onyx`, at 0.98, so the two cannot be mistaken for each other (median pitch 155 Hz against 110).
  `tools/voice.py`: records each line, trims it, lifts the worked-up calls (up to 7% faster and higher, 3.5 dB more
  top, 3 dB louder), cuts rumble, compresses, sets loudness (calm lines -20 dB RMS while speaking, the biggest calls
  -17.8), holds peaks under -2 dB, and encodes 40 kbit/s AAC. One- and two-word shouts are spoken at 0.78 speed
  first: "Touchdown!" came out at 0.59 s, a real call holds the word. Each clip is checked by counting the syllable
  peaks in its sound against the syllables in its words: none came out short (the worst is 4 heard of 6, two vowels
  running together). The .m4a files carried 3.4 kB of padding and tags each, a third of a short clip, so the tool
  strips them and moves the sound pointers: the pack went from 3.2 MB to 2.4 MB. 273 clips, 6.5 minutes of speech.
  In the game (`js/audio.js`): the pack is fetched after the first tap, kept compressed, and a clip is decoded when
  wanted (the last 36 stay decoded; all of them decoded at once would be about 120 MB). The booth has its own route:
  dry, a little presence, its own compressor. Priorities: colour is dropped when anyone is talking, a call waits its
  turn and is dropped when its moment has passed, a big call cuts in with a 25 ms fade. Measured through the whole
  mix: a play-by-play line peaks at -3 dB and sits at -16 to -17.8 dB RMS, the analyst (trimmed to 0.84, his rumble
  cut at 115 Hz and his top lifted 3 dB after he measured 50% of his energy under 200 Hz) at -14 to -15; a full roar
  is -13.7 and is dipped 7.5 dB under them, so they sit 5 dB over a roar and 8 over an ordinary crowd. Raising the
  booth further only pushed it into the limiter, so the dip does the work.
  In the game (`js/game.js`): the editorial side, on the game's own clock so tests can count it. Three scripted
  exhibition games asked for 171 lines (57 a game, 29 of them the analyst's), every one of which exists; the drills
  asked for none. In real time with the speakers muted (`PG.audio.deaf`), a game's opening ran: welcome (the matchup
  card now stays up until he has finished it), "The Aviators are in town.", "And the Outlaws are ready to defend
  their home field.", the analyst, then the return; a touchdown ran call, analyst, missed extra point, "And they take
  the lead.", analyst, in that order over nine seconds; an interception cut in over the analyst; a line asked for
  behind a five-second line with 1.5 s to live was not said. Peaks stayed at -2.8 dB over a minute of play.
  The referee now waits 0.9 s before his call so the booth's "Flag down." is not under it. The one-file build
  carries the pack as base64 (3.8 MB in all) and plays it. Commentary only, and none of it touches the game's
  generator: `H.fingerprint()` unchanged; exhibition, both careers and the drills clean; audit empty at 320x568 and
  390x844 (the switch is now labelled "Commentary"); no console errors. Nobody has heard any of it in the game.

- 19:00 Eyes, hands and standing room (automatic run 5). The first two ideas wait on the owner (his verdict on the
  booth; my question about the referee's voice), and the stadium-sound idea is mostly that same voice, so this run
  took the motion idea.
  Eyes: `watching()` gives each man a spot to look at and the pose code turns the helmet to it, eased over about a
  tenth of a second, up to 69 degrees at the neck with the shoulders coming round up to 23 more, and tips it up to
  31 degrees at a ball in the air. Measured on a defender running at five yards a second (`PG.r3d.eyes()`): the helmet
  is 0 to 4 degrees off the ball carrier out to 90 degrees from his line, 34 short at 120 (as far as he can turn),
  and not turned for a man behind him. In two drawn games the helmet was turned more than 11 degrees in 38% of
  player-frames during live play. The bench turns its helmets to the ball.
  Blocks: the engine holds a locked-up pair 0.79 yards apart (median over 2,063 samples), and at the size the
  figures are drawn that is chest inside chest. Each man is now drawn back from the other, about a quarter of a yard
  for linemen, both hands are solved onto the other man's trunk on the side facing him, and both lean the same way
  so the helmets pass. `PG.r3d.block(0.8)`: blocker's hands 5 and 7 cm from the chest surface, the defender's 5 and
  9 from the pads, elbows bent 72 to 113 degrees, chests 11 cm apart, helmets 12 cm apart (before: chests
  overlapping, arms through the other man). Looked at as a strip from four sides and in a real pass play from
  beside and behind the line.
  Standing room: a man still on his feet beside a tackle is moved clear of the lines of the two men on the ground
  (pelvis to helmet, pelvis to feet), by at most 0.8 yards, and the move is fed to his stride so he steps there.
  `PG.r3d.besideSweep()`, 156 stagings (a tackler from four sides, another man from thirteen angles at three
  distances), 0.9 s after the hit: at worst 14 cm inside the runner and 26 inside the tackler where the limit binds,
  0 to 7 cm in the stagings looked at one by one; before, up to 43 cm inside the tackler's trunk alone, his helmet
  not counted. A man standing still now stands on the turf (he was a centimetre in it).
  Tried and taken out: a second defender bending in to put his hands on the runner. Every angle put him in the first
  tackler; "Next ideas" says what a pile needs instead.
  A mistake caught late: cutting that code out also cut the pre-snap stance helper, and every staged hook still
  passed, because none of them reaches a stance. A whole game played with drawing on threw at once. Restored it,
  checked that every name the three edited files declared before is still declared, and added the drawn game to
  "How to test". Then: two drawn games, 9,319 frames, no errors and no number that is not finite; the gait and
  tackle hooks unchanged (slide 1.0 cm at eight yards a second, tackle hands 9 cm, nothing under the turf).
  Drawing only: `H.fingerprint()` unchanged; `H.sim` in range; exhibition, both careers and the drills clean; audit
  empty at 320x568 and 390x844. The console showed "The AudioContext encountered an error from the audio device"
  three times during long test loops in the hidden pane, which freezes the page between tool calls; no game code
  was in the trace, and it did not happen in the timed runs. Worth a look if a player ever reports sound stopping.

- 19:13 Field sound (automatic run 6). A field goal whose accuracy lands within 0.03 of the line between good and no
  good (about one kick in fifteen near it) is flown at the upright and leaves it inward or back out. Whether it is
  good was already decided and the flight time is unchanged, so play is untouched. Forced four kicks in a game (good
  and missed, at each post): each met its post exactly (23.57 and 29.77 across the field, the posts' own positions)
  above the crossbar, scored or not as decided, put "off the upright" in the banner, and asked for the clang. Levels
  through the whole mix (peak / RMS / the part a phone plays): clang -4.1 / -22.4 / -22.4 (first version -30 on a
  phone, 88% of it under 200 Hz; raised to a 340 Hz tube); the defense's calls peak -11.7 and the whoop -11, level
  with the quarterback's cadence at -10.1 (first version 6 dB under it); a hard bounce -13.3. 59 of these were asked
  for over the scripted games. Drawing and sound only: `H.fingerprint()` unchanged, `H.sim` in range, exhibition,
  both careers, the drills and a drawn game (3,412 frames) clean, audit empty at 320x568 and 390x844, no console
  errors.

- 19:35 Round 11, from the owner's message at 19:15.
  The bug: he threw for what should have been a touchdown and got a first down. In each step the game checks the
  tacklers before it checks the goal line, so a receiver who caught the ball in the end zone with a defender on him,
  or a runner hit as he crossed, was ruled down at his spot, which `setBall` clamps to the one-yard line, and the
  chains moved: "First down" on the one. `finish()` now rules a carrier down in the end zone he attacks a
  touchdown. Staged six times (a receiver half a yard into the end zone, a defender on him): six touchdowns, five
  of which were tackles before. In simulated play it happens about once every seven games (3 in 20). It changes
  play, but the seeded fingerprint game never reaches it, so `H.fingerprint()` is unchanged; `H.sim` in range.
  Voices: measured the pitch movement of twelve candidates on excited and on analyst lines. Play-by-play is now 70%
  `am_fenrir` and 30% `am_eric` (12.4 semitones of movement, was 10.2); the analyst 70% `am_echo` and 30% `am_onyx`
  (10.5, was 7.8, still the deep voice at about 100 Hz). New: the referee (`am_adam`, the most even delivery, 0.94
  speed) and the stadium announcer (`am_puck`, the most theatrical, 0.86). 346 clips (was 273), 3.0 MB, none
  flagged by the syllable check. The referee's call is three recorded sentences, chosen by the game ("False start,
  offense." / "Five yard penalty." / "Repeat third down."); the announcer's "And that is another... Outlaws..." for
  each team, with the crowd's "FIRST DOWN!" after it. Both go down the stadium-speaker route after the microphone
  click, at -19 to -20 dB RMS (the synthesized voice was -23.5). The pack now loads whenever sound is on, not only
  with the commentary, since the referee and the announcer are part of the stadium.
  Drives: each drive keeps its quarter and clock at its first snap; every score goes into a log with the drive
  (plays, yards to the goal line or the kick's spot, game time). The booth follows a scoring drive with its length,
  "a long, patient march" (ten plays or four minutes) or "quick strike" (three plays or fewer), and the analyst
  on why. A toast shows the drive a moment after the score. Halftime and every final screen (exhibition, season,
  career) list the scores with their drives, and each team's passing, rushing and receiving leaders from the box
  score. Looked at on a 390x844 screen.
  Checked: every one of 450 lines asked for in three exhibitions and two careers exists; `H.fingerprint()`
  unchanged; exhibition, both careers, a career season, the drills and a drawn game clean; audit empty at 320x568
  and 390x844. The console again showed "The AudioContext encountered an error from the audio device" during long
  frozen loops in the hidden pane; the context was still running afterwards.

- 19:39 The booth knows who has the ball (automatic run 7). 19 new clips (365 in all, 3.1 MB), recorded with the
  same voices, none flagged: three quarterback-run calls, three tight-end catches, three to a running back, two
  analyst lines, and the stadium announcer's welcome for each team (-18.2 dB RMS through the speakers' route, like
  the referee). Three exhibitions and five career games asked for 495 lines, every one recorded; quarterback runs
  and catches by the backs were called, a tight-end catch never came up (the test player rarely throws to him).
  The welcome plays as the intro hands over to the opening kick, and the intro card waits for the booth's welcome
  as before (7 s in all). Commentary only: `H.fingerprint()` unchanged; exhibition, both careers, the drills and a
  drawn game clean; audit empty at 320x568 and 390x844.

- 19:48 Round 12, from the owner's message at 19:42.
  Two-minute warning (`twoMinute()` and `warnCall()` in `js/game.js`). It changes play, so it was checked: in two
  scripted exhibitions with three-minute quarters the clock stopped at 2:00.00 in the second and fourth quarters
  three times and at 1:59.96 once (the clock crossed 2:00 during a live play, which is how the rule works), with
  no time left to give back for a timeout. The seeded fingerprint game uses two-minute quarters, so
  `H.fingerprint()` is unchanged; `H.sim(10, 180)` with three-minute quarters stayed in range (3.8 yards a carry,
  58% completions, 32 points a game).
  Awards night (`awardsNight()` and `showAwards()` in `js/career.js`): MVP, Offensive Player of the Year, Rookie of
  the Year (first season only), All-League at your position, and your position's statistical title from the
  leaders table. You win on your average game grade (MVP 8.2, or 7.5 with a playoff team; OPOY 7.0; All-League 6.5,
  as before; Rookie 5.6); otherwise a player from around the league wins, and the nominees are named. Their names
  come from a hash of the season, not the game's generator. The ceremony opens after the season's last game and can
  be seen again from the hub. Won awards count as honors in the hall-of-fame case, as All-League and MVP did.
  Hall of fame (`retireToHall()` and `showHall()`): a "Retire" button beside the erase puts the career to a vote
  (`fameCase()`, 70 to get in) and keeps it in `localStorage['pg.hof']`; the Hall of fame opens from the main menu.
  The test harness erases careers with the erase button, so test careers never reach the hall.
  24 new clips (389 in all, 3.4 MB): the two-minute warning for the booth and the referee, the coin toss for each
  team, "Timeout, (team)." and "That's their first / second / third and final timeout." In a game with the sound
  running (output muted) the toss, the welcome, the first-down call and the two-minute warning all played from
  their clips. The audit now walks a playoff season, the awards night, the retire screen and the hall: at 320 wide
  the bracket's names ran 2 px off the screen and the page scrolled sideways (older; never reached before). The
  bracket's columns may now shrink and its names wrap. Audit empty at 320x568 and 390x844; exhibition, both
  careers, two career seasons, the drills and a drawn game (7,850 frames) clean.

- 20:03 The reverse angle (automatic run 8). The idea list's first two items wait on the owner, so this took the
  presentation idea. `rpBegin()` works out which way the play went (the ball carrier's, or the ball's, position at
  the start of the replay and at the end) and `replayStep()`, at the end of the sideline pass, plays the last 150
  recorded frames again at 0.55 speed with `G.rpAngle = 1`; the renderer then puts the camera 16 yards ahead of the
  play that way, 7 high, a quarter of the way to the middle of the field, looking back at the carrier (first tried
  at 4.2 high and 15 ahead: a defender in front filled the picture). The badge says "Replay · reverse angle". In a
  drawn game all three replays switched over (the first after 6.6 s); looked at on an interception return coming
  down the sideline at the camera. Drawing only: `H.fingerprint()` unchanged; exhibition, both careers, the drills
  and a drawn game (8,976 frames) clean; audit empty at 320x568 and 390x844.

- 20:34 Age and the rival (automatic run 9). `ageOneYear()` runs once at the start of each new season from
  `initSeason()` (re-signing and free agency both go through it); no dice. Checked: a quarterback went from
  76/70/64/62 to 77/71/65/63 in his second season (age 23, "still growing"); the same player set to 31 and moved
  into his third season (age 33) lost 2 arm power, 2 speed and 2 elusiveness and kept his accuracy. Careers saved
  before this have no age stored: they are treated as having started at 22. The rival's line showed before his
  game ("I've seen his film. I'm not worried." early; "Check the leaderboard. Then come talk to me." once he led the
  race) and his reaction went into the headline. Career only, from the second season: `H.fingerprint()` unchanged;
  exhibition, both careers, two career seasons and the drills clean; audit empty at 320x568 and 390x844 including a
  35-year-old's hub, the rival game card and the retire screen.

- 21:06 The two-minute drill (automatic run 10). This changes play, so it was measured against the version before
  it, four seeds of 20 simulated games with three-minute quarters each: before, 31.4 points a game and 71.9 plays; the
  first version (hurry for two minutes before halftime too, 6 seconds between plays, the computer throwing more)
  38.0 points on 76.7 plays, outside the healthy 25 to 35; the narrower rule shipped (fourth quarter only when not
  ahead, the last minute before halftime, 8 seconds, no change to play calling) 32.9 points on 74.8 plays, with
  completions 59 to 60%, 3.9 to 4.7 yards a carry and interceptions 1.0 to 1.7%. Two-minute quarters: 25.8 points.
  The seeded fingerprint changed (it runs in two-minute quarters, where the window is open); checked repeatable and
  stored as the new `localStorage['pg.fingerprint']`. 5 new clips (394). In a game: "No huddle · 4th & 12 · ATX 32"
  on the sheet, "Outlaws in the hurry-up · no huddle" as a toast, once a drive. Exhibition, both careers, a career
  season, the drills and a drawn game clean; audit empty at 320x568 (with the no-huddle sheet) and 390x844.

- 21:45 Round 13, from the owner's message at 21:25.
  Robotic voices. Listed every voice made in code and replaced or removed each: the quarterback's "Ready... set" and
  "Hut!", his audible, the defense's calls, whoops and "Ball!" are now 26 recorded clips in three new voices
  (`am_liam` for the quarterback; `am_michael`, and a blend of `am_onyx` and `am_fenrir`, for defenders), played out
  on the field, panned, dulled above 4.8 kHz, with the stadium's echo, under the booth. The draft is the stadium
  announcer joining three recorded sentences (pick, team, position; the player's own name cannot be recorded, so it
  is left out). Removed outright: the device's speech voice (the draft used it, and the booth fell back on it), the
  synthesized stadium voice (`paVoice`, the stand-in before the clips load), the synthesized shouts and grunts
  (`bark`), and the crowd's lone synthesized shouts. 438 clips, 3.8 MB. In a minute of muted play the field clips
  decoded and played with no errors.
  The pile (`pileOf()` and the pile branch of `poseFor()` in `js/render3d.js`). When the runner is first seen down, the
  two nearest defenders within two yards (not the tackler) dive on. `settle()` now keeps a man out of a list of
  bodies (up to four; helmets and his legs count for a man on top) instead of one, with up to six passes. The top
  man lies flat with his legs trailing, gets off first (from 0.45 s: he slides back two yards away from the middle of
  the pile, then stands); the tackler gets up from 0.85 s and the runner from 1.05 s. Measured over 104 piles staged
  from every angle: while lying on it, 3.3 cm inside the men below at the median and 7 cm at worst; from 0.95 s, at
  most 9 cm. Short of perfect in two places, noted in "Next ideas". The first versions failed in ways worth knowing:
  the fall timer was reset every frame for anyone not on the ground (so he never fell), the step-clear offset was
  applied after solving, his feet were pulled to the turf through the men under him, and three passes were not
  enough. In two drawn games a pile formed on 11 of 24 tackles; looked at in one.
  Officials: a timeout signal (arms straight up, crossing at the wrists) for timeouts and the two-minute warning.
  Drawing and sound only: `H.fingerprint()` unchanged; exhibition, both careers, a career season, the drills and a
  drawn game clean; gait and tackle hooks unchanged; audit empty at 320x568 and 390x844.

- 21:48 The propped runner (automatic run 11). The staging test now names a downed runner's lowest joints: rolled onto
  his left side (hit from his right) his lowest points were his left hand and elbow at 8 and 10 cm, the arm he holds
  out "to break the fall" folded under him, and the ground solver lifted his hips to 0.57 to keep it above the turf
  (0.35 on the other side, where the tucked ball arm lies along his body). On that side the arm now goes out past his
  head. Both sides now lie at the same height (chest 57 cm), the tackler on him at 106 against 101, and the tackle
  hooks are unchanged. Piles came down with it: the highest a pile man lies went from about 2 m to 1.72 m, and while
  he slides off, 4 of 104 staged piles have a leg in someone (was 6 to 9). The solver's pass-by-pass record is now
  kept only while the staging test runs. Drawing only: `H.fingerprint()` unchanged; exhibition, both careers, the
  drills and a drawn game clean; audit empty at 320x568 and 390x844.

- 22:04 Celebrations (automatic run 12). The scorer's celebration now comes from six (it was three), picked by his
  figure's seed as before: jump, spike, strut, and new, a knee with the head bowed that turns into both arms to the
  sky after 1.3 s, a flexed roar with the head thrown back, and a bow repeated every 2.2 s with the hips folding back
  so he does not tip. Teammates: jump, fist pump, and a clap. The side that was scored on: heads down, or for about
  four in ten, hands on their helmets. `PG.r3d.celebStrip()` draws all eleven; looked at at 0.9 s and 1.8 s. The first
  roar (fists at the belly) read as standing still and was redone with the arms out wide. Drawing only:
  `H.fingerprint()` unchanged; exhibition, both careers, the drills and a drawn game clean; audit empty at 320x568
  and 390x844.

## Morning hand-off

- Going live is settled: the owner said to always push to `main`. Done at 07:12 on 2026-11-12.
- List what changed, what was verified and how, and what is still rough.

### Round 4 (queued at 07:45; work through these in order)
- [x] Loose-ball scramble: a fumble is a live ball. Players near it dive, a miss squirts it away, the user steers the nearest
      teammate (Sprint and Dive). Out of bounds or three seconds untouched and it stays with the team that lost it
- [x] Audibles at the line: on offense Audible steps through four standby plays and Flip mirrors the play; on defense
      Audible steps through the coverage calls. Players slide to their new spots (keys V and X)
- [x] Two-point tries (you choose after your own touchdown and play one snap from the 2; the computer follows the usual chart)
      and onside kicks in the last minute when trailing by 16 or less (about 1 in 8 is recovered)
- [x] Run cycle: stride length follows speed so feet no longer skate, the thigh drives forward further than back, arms pump
      from hip to chin, shoulders counter-rotate, the body leans into cuts. Tackles: the ball carrier falls away from the hit
      (back, front or side), the tackler lands on him with his arms wrapped, and the pair slides to a stop
- [x] Career: the coach says something after every game (the performance, a weakness to fix, the next opponent, role changes),
      and a rival at your position on the best other team: marked on the leaders board, +300 XP for beating his team,
      a trophy for finishing a season ahead of him
- [x] Season mode: one roster for the whole season (names, numbers, ratings that move between seasons), every player's stat
      line from the box score, and team leaders, on a new Roster tab. Jersey numbers no longer repeat within a team
- [x] Holding (2% of gains of four yards or more: ten yards back, replay the down) and defensive pass interference
      (a first down at the spot); Settings has a Penalties switch that turns every flag off
- [x] Menu: four slow camera shots behind the menus (high orbit, sideline, behind the posts, a crane onto midfield), and 3D
      uniform portraits on the Exhibition and Season team pickers and on the Career player card
- [x] Career difficulty: measured with scripted seasons and rebalanced (grades, goals, coach trust per position, less
      run-heavy play-calling for a running back), and Career now has a Rookie / Pro / All-Pro choice. Whether an average
      *person* wins about half is still unknown: the script only plays like the computer

### Round 5 (queued at 08:15; work through these in order)
- [x] Names on the backs of jerseys; a short vibration on tackles you are in, big hits, fumbles and your touchdowns
      (Android browsers only; Settings has a switch where the device supports it)
- [x] Play of the game: the best play (scores, takeaways, sacks, long gains; yours weigh a little more) is kept whole and
      can be watched again from the final screen in Exhibition, Season and Career
- [x] Playbook: HB Screen, QB Sneak, Counter and Bootleg (17 offensive plays), Cover 4 and Goal Line (8 defenses); the computer
      calls goal line on short yardage and deep shells on long yardage. The run game was rebalanced play by play
- [x] Live punt returns in Exhibition and Season: the free safety drops back, the coverage runs down, and the catch turns
      the play into a return you play (or cover) like a kickoff return. No fair catches or muffs
- [x] Camera choice in Settings (standard, close, high)
- [x] Training camp: three guided drills (passing, running, tackling), five plays each, with a coaching card before every
      snap and one to three stars per drill (stars in the accent color rather than gold medals: the owner dislikes yellow).
      On the menu, and offered in a card the first time the game is opened with no saves
- [x] Left-handed layout: Settings moves the buttons to the left and the play notes to the right
- [x] A hall-of-fame score and verdict on the retirement screen (titles, honors, career XP, overall, trophies; about 100 is first ballot)

### Round 6 (queued at 08:50; work through these in order)
- [x] Player models, pass 4. First a bug: every arm and leg had been drawn inside-out (see the log), which is fixed for
      both models. Then a near model for close views (replays, celebrations, portraits): shaped thighs and calves, a knee
      pad, hands with fingers and a thumb, cleats, caps on the shoulder pads, a collar; numbers and names now wrap over the
      chest instead of floating as flat cards; soft contact shading is baked into the vertices of both models. The far
      model still draws during play. Settings has "Close-up player models", and a replay that drags switches it off
- [x] Touchdown celebrations: already there (three for the scorer, two for teammates); struck from this round
- [x] Career history: a season-by-season table (team, record, finish, stat line, average grade, overall, honors) on the
      Stats tab and the retirement screen. Seasons finished before this existed are not listed
- [x] Fair catches and muffed punts on live punt returns: a Fair catch button (or Space) while the punt is in the air; the
      computer's returner waves when a tackler will be on him as the ball arrives; a dropped punt is a live ball
- [x] Milestones: twelve, earned in any mode and kept on the device (`js/milestones.js`, key `pg.milestones.v1`), with a
      button on the menu that shows the count

### Round 7 (queued at 09:09; work through these in order)
- [x] Animation: at the catch the chest turns to the ball and both hands go out to it (up and back for a ball over the
      shoulder), a defender at the catch point gets a hand up, and after the whistle fallen players rise to a knee and stand.
      A pass is now drawn at the height of the figures' hands. Checked in three close-up stills, not in motion
- [x] Stadium life: a chain crew on the home sideline (two sticks ten yards apart with a chain, a down box that shows the
      down, three men in orange who walk to the next marks after the whistle); the pylons, which were already there, are
      larger so they show beside the oversized players
- [x] A playoff bracket on the Standings tab of Season and Career (semifinals, final, champion; it fills in as the games
      are played), and Season awards on the season-complete card: your most valuable player, the league's best offense and
      best defense. The other teams are simulated, so only your roster has players to honor
- [x] Career contracts: a rookie deal from the draft slot (one to three seasons, $1.2M to $6.5M a season; a walk-on gets one
      year at the minimum), shown on the hub. While it runs you stay put (a trade request still works). When it ends every
      team makes an offer of years, salary, a signing bonus in XP and a role, and you choose. Salary is a scoreboard, not a
      currency: it totals up on the retirement screen

### Round 8 (the owner's requests at 13:15 on 2026-11-12: "improve audio drastically, improve ui a little ... i want it so u
### can only be wr and qb ... add a bar that has a green bar for power when u click a letter to throw to ... keep improving")
- [x] Career: a new player is a quarterback or a wide receiver. The other three positions stay in the code so an older
      career still loads
- [x] Throw power: hold a receiver's letter (on the field, on the pad, or its number key) and a green bar fills; let go to
      throw with that much on the ball. A quick tap floats a lob, a full bar fires a bullet, and the bar and a ring round
      the receiver's letter show the level. This replaces "tap for a bullet, hold for a lob"
- [x] Audio, rebuilt (asked for twice). `js/audio.js` is a second version:
      the crowd is now voices (several hundred synthesized syllables rendered into murmur and roar loops, applause from
      single claps, and rendered "ooh", "aww" and "DE-FENSE" reactions) instead of filtered noise; every effect is
      rebuilt in layers with energy a phone speaker can play; the menu has a new sixteen-bar theme; the mix ends in a bus
      compressor and a limiter; a drum roll leads into kickoffs, hits and catches are placed left to right, rain has
      thunder; Settings has a Volume choice. Still no audio files
- [x] Camera zoom (asked for at 13:44: "make it so u can zoom in more or out of view ... different players have diff
      preferences"): ten steps from 60% to 180%, on − and + buttons under the scoreboard, the mouse wheel, the minus and
      equals keys, and a stepper in Settings. It replaces the three-way camera choice
- [x] Interface, a little: the play-call sheet marks one card "Suggested" for the down and distance (offense and defense)
      and opens on its tab; the scoreboard row carries the zoom buttons; Settings gained Volume and the zoom stepper; the
      throw power bar and the ring on the receiver's letter are new
- [ ] Still open from before: a person plays it on a phone; contract years could matter more; animation checked in motion

### Round 9 (the owner's requests at 13:52 and 14:10 on 2026-11-12: "for any plays, underneath the game pls let me know if
### it's a run play throw play etc rfo"; "after all this bug test, research and just optimize the ui to be perfect";
### "audio is decent, but need it to sound like football"; "yes automatic improvement loop ... make major improvements or
### if not just work on improving ui more and more")
- [x] A tag under the field for every snap: Run, Pass, Play action, Screen, RPO or Kick, with the play's name. On defense
      it shows your call, and its badge turns to what the offense is doing a moment after the snap (later for a fake)
- [x] Run-pass option plays (read as what "rfo" meant): RPO Slant and RPO Bubble, on their own tab. For 0.7 s the
      quarterback and the back share the ball: throw to a lettered receiver in that time, or do nothing and the back takes
      it. Linebackers in underneath zones either step up at the fake or sit; one who sits in the throwing lane bats the
      ball down more often than not. The computer never calls them, but your coach does now and then in Career
- [x] Sound that is more unmistakably football (the owner's verdict on the rebuild was "decent, but need it to sound like
      football"): the quarterback's cadence before every snap ("Ready ... set", then "Hut!" with the snap), the two lines
      crashing together, a shout on audibles, shouts on a loose ball, a crowd "ohhh" that swells with the drum roll into
      every kickoff, a band in the stands between plays (a drum cadence, the "Charge!" bugle call with the crowd's
      answer, a phrase of the fight song), a "LET'S GO!" chant with its claps, and a cannon with fireworks on home
      touchdowns. Still to be judged by ear
- [x] Bug test every screen and mode; research interface guidelines; fix what turns up. `tools/audit.js` now walks
      every menu screen and a scripted game in each mode and measures them (see "How to test", step 6). The first run
      on the smallest phone listed 65 problems; after the fixes it lists none at 320, 360, 390, 430, 768 and 1280
      wide, in both graphics modes, left-handed, and in day snow. What changed:
      the bottom of the game screen is one grid (kick meter or power bar, tips beside the thumb pad, the play tag
      along the bottom edge), so nothing there can overlap; every control has a touch area of at least 44 by 44
      pixels without being drawn any bigger; no type under 10 pixels; the menu scrim is thin only behind the title and
      heavier on reading screens; locked trophies and milestones are readable; redrawing a screen keeps its scroll
      position (changing a setting or a hub tab used to throw the page back to the top); the trade request is a button
      with a second tap to confirm; a phone held sideways gets a "turn your phone upright" notice and the game pauses
- [x] The automatic loop back on, briefed with "major improvements, otherwise the interface"

### Automatic runs (from 15:01 on 2026-11-12; one item a run)
- [x] Run 1, stadium sound. The referee gives every penalty to the stadium over the speakers (a microphone click, then
      his call with the echo of a big bowl) and the home crowd answers: a boo when the flag is on its own team, a cheer
      when it is on the visitors. A home first down that matters (third or fourth down made, or eight yards and more)
      gets the stadium announcer starting the sentence and the crowd finishing it: "FIRST DOWN!". With the visitors on
      third or fourth down the whole stadium builds a wall of noise until the snap. A long pass draws a rising "ohhh"
      that tops out as the ball comes down. At halftime the band plays a sixteen-second show (drum line, the fight song
      at a march with bells and tubas, a last chord) and the crowd applauds it. Still to be judged by ear

- [x] Run 2, motion. Feet that stay where they are put: an ankle joint, and legs solved so a planted foot does not
      slide or sink (see the log for the numbers). Stances stand on the turf with flat soles. The quarterback winds up
      while the power bar fills and his follow-through fits the power. Still to be judged in motion by a person

- [x] Run 3, motion sideways. Hips that open, so a shuffle plants its feet too (120 cm of slide a step down to under
      2); a defender who has ground to cover turns and runs looking back instead of shuffling at a sprint; officials
      and the chain crew on the players' stride. Still to be judged in motion by a person

- [x] Run 4, two-player tackles. The tackler bends to the hit with his shoulder at the runner's hip and his arms
      round him, and the two go down together, the tackler across the runner's legs; nothing ends up under the turf
      or inside the other man. The quarterback's wind-up from run 2 now really shows (it was not reaching the game).
      Still to be judged in motion by a person

- [x] Run 5, eyes, hands and standing room. Helmets turn to what each man is watching (the ball in the air, the man
      with it, the quarterback; a receiver looks back once he is into his route, the quarterback goes through his
      receivers, the bench follows the play). A block is drawn with room for arms: hands on the other man's chest
      and shoulder pads, elbows bent, helmets side by side. A man left standing beside a tackle steps clear of the
      two on the ground. Not built: a second man joining the tackle (measured, there is no room for him; see the
      log and "Next ideas"). Still to be judged in motion by a person

- [x] Run 6, field sound. A field goal made or missed by a hair goes off the upright: it clangs (a ringing tube,
      pitched where a phone can play it), goes on through or bounces back out, and the banner says so. The defense
      calls out the formation before most snaps and answers an audible; the men who made a sack, an interception or
      a fumble recovery whoop; the ball thuds on the turf when it bounces. Still to be judged by ear

### Round 10 (the owner at 17:48 on 2026-11-12: "the voice over is too ai, it needs to be like the nfl commentators";
### then, offered four ways to do it, at about 17:58: "of course option 1", the free speech model on his Mac)
- [x] A recorded broadcast booth in place of the phone's speech voice: a play-by-play man and an analyst, 273 clips
      of an original script (`tools/commentary.json`), recorded with Kokoro-82M on the owner's Mac by `tools/voice.py`
      and shipped as one 2.4 MB file. The play-by-play man opens the broadcast and names both teams, calls the down
      and distance before some snaps ("Third and six."), calls a long ball while it is in the air, an interception as
      it happens, every result worth a call, the first down, the score and what it did to the game ("And they take
      the lead."), the quarters, the half and the final. The analyst follows the big moments with a reason and stays
      quiet otherwise. One of them talks at a time, a big call cuts in over small talk, and the crowd dips under them.
      A career's simulated drives get one line each. Practice has no commentary. Settings and the pause menu call the
      switch "Commentary". Still to be judged by ear: nobody has listened to it in the game. What measurement already
      says: the model does not shout, so the big calls are lifted by processing (a little faster and higher, brighter,
      louder) and will still be calmer than a real announcer's.

### Round 11 (the owner at 19:15 on 2026-11-12: "one thing was that i threw for a first down in red zone /
### touchdown area and i guess it didn't register, work on improving the voices yes you can go do not hold it no
### more, add drive summaries and half time things, work hard")
- [x] The touchdown that was not: a ball carrier brought down, or pushed out, already in the end zone he attacks is
      now a touchdown. Before, the tackle check ran first and spotted him at the one-yard line as a first down.
- [x] The referee and the stadium announcer recorded like the booth (a third and a fourth voice), sentence by
      sentence, down the stadium-speaker route; the synthesized voice is only their stand-in before the clips load.
- [x] Livelier commentators: new voice blends chosen by measured pitch movement, more takes for the common calls,
      lines for a kick off the upright and for scoring drives.
- [x] Drive summaries after every scoring drive; halftime and final screens with the scoring summary and leaders,
      in exhibition, season and career.
      Still to be judged by ear and on a phone

### Automatic runs, continued
- [x] Run 7, the booth knows who has the ball: "The quarterback keeps it himself!" on a quarterback run, calls for a
      catch by the tight end or a running back, an analyst line after a quarterback run; and the stadium announcer's
      "Ladies and gentlemen... welcome... to Outlaws football!" as the teams line up for the opening kick, the crowd
      roaring back. Still to be judged by ear
- [x] Run 8, the reverse angle: an instant replay (and the play of the game) is shown at half speed from the
      sideline as before, then the last two and a half seconds again from ahead of the play, high enough to see over
      the men between, looking back at the ball carrier. A tap still skips it all. Still to be judged by eye
- [x] Run 9, a career that ages and a rival who talks. You come in at 22; each new season the summer changes your
      ratings: +1 to everything up to 25, nothing from 26 to 29, then the body first (speed, elusiveness, arm power:
      -1 a year at 30 and 31, -2 at 32 and 33, -3 from 34) and the skills later (-1 from 34, -2 from 36), never below
      40. The hub says what changed; the age is on the player card, the retire screen and the hall of fame. The
      rival has a line before his game (from how you stand: your last game against him, the leaders race) and the
      headline after it. Still to be judged over a long career
- [x] Run 10, the two-minute drill. In the last two minutes of the fourth quarter (half of a short quarter) a side
      that is behind or level goes no-huddle, and anybody with the ball does in the last minute before halftime
      (a quarter of a short quarter): 8 seconds run between plays instead of 13, the next sheet comes up sooner and
      says "No huddle", and the booth notices. Changes play: new fingerprint baseline. Still to be judged in play

### Round 12 (the owner at 19:42 on 2026-11-12: "add awards night, hall of fame, 2 minute warnings for quarter or
### such like nfl games, small details from football / nfl")
- [x] Two-minute warning: the first time the clock reaches 2:00 in the second or fourth quarter it stops there (if it
      ran there between plays it stops at exactly 2:00), and the next play-call sheet opens with the referee's
      call, the booth and a banner. Quarters of two minutes or less have none.
- [x] Awards night after every career season, and a hall of fame: retiring a career (a new button beside the erase)
      puts it to a vote and keeps it for good; the Hall of fame is on the main menu.
- [x] Small details: the referee announces the coin toss before the game and in overtime, and every timeout with
      how many the team has used; the toss is on the matchup card. The playoff bracket no longer pushes the career
      hub off the side of a 320-pixel screen (found by the audit now that it reaches a playoff season).
      Still to be judged by ear and in a long career

### Round 13 (the owner at 21:25 on 2026-11-12: "keep going, voices are good for now, remove anything robotic tho,
### phone is good rn and feels good just improve anything if u do notice something off or such, focus on pile after
### tackles and small details listed after that")
- [x] Nothing robotic left: the players' voices recorded (three new voices: the quarterback and two defenders), the draft
      announced by the recorded stadium announcer, and every synthesized voice and fallback removed (the device's
      speech voice, the synthesized stadium voice, the synthesized shouts, grunts and lone crowd voices). Where a
      clip is missing, nobody speaks.
- [x] The pile: the two nearest defenders within two yards dive onto the runner and the tackler and lie on top of them;
      the top comes off first. Not perfect: see the log.
- [x] The officials' timeout signal, for timeouts and the two-minute warning.
      Still to be judged by ear and in motion
- [x] Run 11, the propped runner: rolled onto his free-arm side he lay on that arm, and the ground solver propped his
      whole body on the hand. That arm now goes out past his head along the turf. Still to be judged in motion
- [x] Run 12, celebrations: three more for the scorer (a knee, then both arms to the sky; a flexed roar; a bow to the
      crowd, again and again), a clap for teammates, hands on helmets for some of the side that was scored on.
      `PG.r3d.celebStrip()` draws them all. Still to be judged in motion

### Next ideas (nothing here is started; the automatic loop works from the top)
Major improvements, biggest first:
- The voices, after the owner has listened to Round 11's (he said at 19:15 "work on improving the voices"; how they
  sound now is still unjudged). If they are still too calm, the next step is a more expressive open speech model with
  an excitement control: a multi-gigabyte download, which needs his say-so first. Voices are lines in
  `tools/commentary.json`; the whole booth re-records in about six minutes.
- More booth lines: the score read out at the half and the end. Not done in run 7 on purpose: the natural way, "The
  Outlaws fourteen, the Aviators seven", is a clip for every team and score (about 370 more clips, 3 MB), and
  joining single numbers sounds like a machine. Worth it only if the owner wants it.
- The pile, the rest: for about a tenth of a second while the top man slides off, about 4% of piles have a leg through
  someone (`PG.r3d.beside()` at 0.8 s); and the top man lies a little stiff and flat.
- Motion, the rest: reserves on the bench who walk about; a ball carrier who looks at the man about to hit him;
  teammates who run to the scorer.
- A real loose-ball scramble instead of an instant recovery.
- Career: the awards night could have a booth or
  stadium voice reading the winners (one clip per award and per name is too many; per award is not).
- More NFL details: a play clock with delay of game, teams changing ends between quarters, a challenge flag.
Interface, when no major item fits in a run:
- Run `tools/audit.js` after every change and keep its report empty.
- A person on a real phone still has to judge touch feel, the frame rate with close-up models, and the sound.
- The on-field receiver letters and the drag ring are drawn on the canvas, so the audit cannot see them: check their
  size and contrast by hand in day, dusk, night, rain and snow.
- Settings could show what each graphics option costs; the play-call sheet could remember the last tab per down.
