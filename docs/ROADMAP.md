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
   - `H.sim(12,180)` computer vs computer. Healthy ranges: 4 to 5 yards per carry, completions 53-62%,
     interceptions 1-3%, about 40-46 points per game combined (measured 2026-11-14), `errs` empty.
   - `H.exh(2,120)` scripted user in exhibition (exercises play calling, kicks, kickoffs). `errs` empty.
   - `H.career('QB',2)` and `H.career('WR',2)` (a new career is a quarterback or a receiver). `errs` empty, stats non-zero.
   - `H.fingerprint()` must equal `localStorage['pg.fingerprint']` after any change that should not alter play. It pins
     the weather and the penalty switch itself, so what is saved in Settings cannot disturb it.
   - `H.camp('pass',4)`, and 'run', 'tackle': a training-camp drill played by a simple test player. `errs` empty.
   - After a change to the playbook: `PG.dbg.lab(name, 40)` per play, with `PG.dbg.seed(s)` before each so every play
     meets the same rosters (rosters are rolled per game, and a weak arm decides a batch). Compare each new play with the
     old ones of its kind (runs about 4-5 yards a snap, short passes about 8, deep about 10), then `H.sim(12,180)` on a
     few seeds against the numbers above.
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
   `PG.r3d.catchTest('leap')` (and `'stretch'`) measures a staged catch at the moment of the ball (the leap: hips up
   about half a hip height, feet off the turf, arms near straight up; the stretch: arms forward, a lean of about 30
   degrees) and `PG.r3d.catchStrip('leap')` draws it from the side;
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
- `js/media.js` the words of the career's media: the reaction feed, the press questions and what answers do (state in `C.social`).
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

- 22:16 The scoop-and-score (automatic run 13; the owner said "keep improving"). The scramble was already there (the
  ball bounces, everyone near chases it, a man who gets there falls on it half the time or knocks it loose again);
  what it lacked was the pickup. Now about four in ten defenders who close on a loose ball stay on their feet instead
  of diving, and one who gets there upright scoops it (55%, 70% off a bounce) and the play goes on as a return. The men
  round the ball cannot tackle him for 0.45 s (they have just dived or been knocked off it). A scooped fumble is
  scored and called as a fumble, not an interception; the booth has three new lines for it. A bug found on the way:
  the tackle code took "a fumble exists" to mean "this tackle knocked the ball out", which after a scoop would have
  turned every tackle of the scooper into a new fumble with no ball; it now asks about this tackle only, with the dice
  rolled in the same order. Measured over 80 simulated games: 59 fumbles, 8 scoops, returns of 52 (a touchdown), 11,
  9, 4, 2, 1, 1 and 0 yards. Balance: 33.6 points a game with three-minute quarters (32.9 before; the seeds vary by
  more than that), 23.8 with two-minute; completions, yards a carry and interceptions in range. The seeded
  fingerprint did not change (its games have no loose ball a defender reaches). Exhibition, both careers, the drills
  and a drawn game clean; audit empty at 320x568 and 390x844.

- 22:24 The kick swipe (Round 14, part 1). On your field goal or punt (the timing bar's screen) and on your kickoff, a
  finger swiped up the field kicks. Its angle is the aim and its power comes from length (55%) and speed (45%). A field
  goal needs a straight swipe (accuracy falls to nothing at 23 degrees) and enough leg for its distance; that becomes
  the same 0-to-1 strike the bar gives, so the make-or-miss rule is unchanged, and the swipe's side decides which way
  a miss goes. A punt's power is its distance and its angle where it lands. Your kickoff waits for the swipe (or the
  Kick button, or 8 s) and comes down by power: a full swipe deep in the end zone, a soft one around the 15. The bar,
  Space and the button still work; computer kicks and simulations are untouched, and the generator is drawn the same
  way either way. Checked with synthetic swipes on a 45-yarder: straight and strong good, 4 degrees left good, 12
  right wide right, a weak one short; kickoffs: full to the back of the end zone, soft and left to the 17 near the
  left sideline, none after 8 s to the goal line. A test swipe also grabbed the movement stick; the stick is off
  during your kickoff now. `H.fingerprint()` unchanged; exhibition, both careers and the drills clean; audit empty at
  320x568 (with the kickoff screen) and 390x844.
- 22:42 The rest of Round 14. Play clock: 35 seconds from the play-call screen while you have the ball (not in
  simulations, drills or your own kicks), shown beside the down and red from :05; at zero a five-yard delay of game
  with the referee's call (new clips ref.delay, a.delay). Coach's challenge: a spot within 0.6 yd of the line to gain
  is given the wrong side about three times in ten (Math.random, so seeded runs are untouched); the side it hurt may
  challenge, two a game, a failed one costing a timeout. Overturned restores the true spot (first down, or the right
  down and distance, or a turnover on downs on fourth). The computer challenges a wrong call three times in four, and
  so does your coach in a career; you get a button on the next sheet. New clips ref.chal.{team}, ref.over,
  ref.stands, booth "challenge". Celebrations: five more for the scorer (shuffle, salute, to the sky, flex, leap) and
  two for teammates (wave, shuffle), picked in game.js by Math.random; group celebrations (whole side jumping or
  shuffling on one beat) about one in three; a career player can choose his own in the hub. Switching ends: the
  engine still has team 0 going up the field, so render3d.js turns the stadium instead in the 2nd and 4th quarters
  (the end zones repainted the other way round, the sun mirrored), under a 2.6 s crane shot over midfield; rotating
  the turf mesh was tried first and turned every yard number upside down. Checked: challenge overturned (first down
  and short), stands (timeout lost), computer rate 0.8 of 40, a bot game with one natural close spot; celebrations as
  a picture strip and staged in an end zone; ends turning in a bot game at Q2, Q3, Q4. `H.fingerprint()` unchanged;
  exhibition, both careers and the drills clean; audit empty at 320x568 and 390x844 (the celebration picker first
  overlapped its own touch areas; rows are now 14 px apart), and the sheet with the challenge button checked at both.
- 22:45 Teammates run to the scorer (automatic run 14, from "Motion, the rest"). After a touchdown, coast() in game.js
  steers every teammate within 40 yards of the scorer to his own place in a loose ring round him (golden-angle
  spacing, 1.6 to 3 yards out) at up to 6.2 yd/s, and keeps them about an arm's length (1.1 yd) apart; render3d.js
  draws a man still running with his running stride and starts his celebration when he gets there, facing the
  scorer. Cosmetic only: never in simulations, so `H.fingerprint()` is unchanged. Measured over 11 bot touchdowns:
  from 0 or 1 teammates within 4 yards at the whistle to 2 to 9 two seconds later; the closest pairs (0.3 to 0.8 yd)
  are men still running past, standing men keep their spacing. A screenshot shows the group round the scorer in the
  end zone. Exhibition, both careers and the drills clean; audit empty at 320x568 and 390x844; no console errors.
- 23:04 The ball carrier's eyes and the bench (automatic run 15, the last of "Motion, the rest"). watching() in
  render3d.js now gives a ball carrier (not a quarterback in the pocket) the defender closing on him soonest, inside
  4 yards and under 0.9 s to contact; the neck limit means he sees only one coming from in front or the side. Over
  2,053 drawn live frames, in 331 of the 400 with such a defender off to one side the carrier's helmet was turned his
  way (the rest are the turn catching up). The bench: about three in ten reserves (by figure seed) walk a yard or two
  from their place at up to 1.05 yd/s with a walking stride, turn to face the way they go, stop five to thirteen
  seconds, and stop for a celebration; over 60 s, 7 of 20 walked, none more than 1.5 yd from his place, no two
  closer than 1.85 yd. New test hook `PG.r3d.bench()`. `H.fingerprint()` unchanged (drawing only); exhibition, both
  careers and the drills clean; audit empty at 320x568 and 390x844; no console errors. At phone size the far bench
  is a few pixels tall, so the walk is judged by numbers, not by eye.
- 23:18 The career's media (Round 15). New `js/media.js` writes the words; `career.js` keeps `C.social` (followers,
  hype 0 to 100, the last 40 posts, your quotes, an open callout, backed/eaten counts, the coach's name) and draws three
  screens after every career game: the press conference (three questions chosen from the game: performance or last
  week's callout; rival, role change, loss or win; next opponent or the season), its summary (your quotes, net trust,
  hype and followers, the coach's verdict, any new callout), and the reaction feed. Answers have fixed effects (trust
  -3 to +3, hype -3 to +9; big talk after a poor game earns half the hype). Buzz 0 to 10 from the grade, player of the
  game, the result, a rival win, the playoffs and a settled callout sets how many posts (about 4 to 25), how far they
  reach (likes scale with the square of buzz) and whether one goes viral and the game trends. Follower growth goes with
  the square of buzz and with hype; eating your words costs 4% of followers, 20 hype and 3 (5 for a guarantee) trust;
  backing them up pays 250 (400) XP and 2 trust. Measured: a staged monster game drew 37 posts with 7 replies on the
  final, trending and a viral post, followers +31%; a bot season of 7 games kept the feed at 40 and no errors. A clash
  with the play buttons' `.pb` class first drew the posts in capitals with rings; renamed. Cosmetic choices use
  Math.random, so `H.fingerprint()` is unchanged; the harness and the audit now answer the podium; exhibition, careers
  (QB and WR, three games each, one QB season), drills clean; audit empty at 320x568 and 390x844; no console errors.
- 23:30 The feed audited after test games (the owner: "audit the feed after a test game and bug fix / improve"). Two
  careers (WR and QB, six games each) dumped post by post. Fixed: lines repeated up to five times a week (lines and
  fan accounts are now dealt like cards: an exhausted pool means one post fewer); reply authors and lines were drawn
  apart, so opposing fans posted home fans' lines; neutral accounts spoke as partisans (they have their own lines);
  a new random teammate per post (three different starting QBs in a week, one with your surname; teammates are now
  five fixed men per team in `C.social.mates`, never sharing a surname with you, the coach or the rival, and a rival
  who shares yours is renamed); opposing fans ignored the result (separate lines for their win and their loss);
  win-flavoured analyst and teammate lines after losses; "wasted day" lines for an ordinary loss (now only a great
  game in a loss; a good game in a loss and a bad game in a win have their own lines); a blowout loss of 17+ takes
  a notch off how the media sees the game; the final listed the loser first; quotes had no context ("No regrets"
  about what?): every question now carries a topic ("on last week's guarantee"); the coach quoted as "Solid." (now
  his first two sentences when the first is a word); times were random (now the final is oldest, the feed newest
  first, replies in order); the feed's 40-post cap cut weeks in half (now the last three weeks, whole, each headed
  with its result); "one target all day" for none; a player-of-the-game day headed "A quiet week online"; a long
  hyphenated name pushed posts 17 px off a 320 px screen (the feed's grid columns are now pinned to the screen). A
  comment swallowing half a line during the work broke the podium for one test run and was caught by the harness.
  After: 0 repeated lines in 11 weeks, no broken text, no name clashes; fingerprint unchanged; careers, a WR season,
  drills clean; audit empty at 320x568 and 390x844.
- 23:38 The media, more (automatic run 16, the first of "Next ideas"). Media day: the hub's next-game card offers one
  question about your rival the week you play him (`PG.media.mediaDay`), once a week; its answer counts like the
  podium's and can set the callout. The booth: `G.callout` comes from the career (`startGame({callout})`); new calls
  call.guar / call.trash at the open (instead of a.intro), a.callout, call.td the first time your side scores to lead
  (three in four), call.shaky from the play-call screen when behind in the last 2:30 of the fourth (it first sat in
  voPre, which only runs when a drive opens, and never fired), call.won / call.lost at the final whistle in place of
  a.final: 7 calls, 14 clips, recorded with the local model (471 clips, 4.3 MB). Endorsements: two games in a row at
  hype 55+ bring an offer (pay a game = followers / 50, 80 to 500 XP; four times that to sign), shown on the reaction
  screen and the Social tab, signable from either; an unanswered offer expires after two games; two deals at most;
  a deal ends when hype drops under 25, with the brand's post. Also: a rival answers a guarantee aimed at him; a
  loss has its own thread lines under the final; avatar initials turn near-black on a light team color (the Comets'
  orange failed contrast at 3.0:1). Checked: an offer after two hot games, signing (+1,040 XP, +260 a game in the next
  result), a brand leaving at hype 5, media day setting a guarantee that the next game settled (+400), every booth
  line logged in place across five games. Fingerprint unchanged; careers, a QB season, drills clean; audit empty at
  320x568 (with a Comets career) and 390x844, including the hub, Social tab with an offer, and media day. (This entry
  went up in a second commit: the first one's log script failed on a brace.)
- 23:44 Sizing on the phone (the owner, with a screenshot of the career hub's Social tab from his iPhone: "sizing is a
  little off on mobile"). The app frame stopped at the bottom safe area (`#app{bottom:env(safe-area-inset-bottom)}`),
  so on a phone with a home indicator every scrolling page ended above a dead band and the last button (Retire) was
  cut off there. Now the frame runs to the bottom of the screen and what sits at the bottom keeps clear of the strip
  with `--sb` (the inset): the controls (`#deck`), the play-call and result sheets, the end of every menu, the
  feed's sticky Continue; `html` is painted the app's dark so nothing shows black. The sheets count their padding
  inside their height limit now (`box-sizing:border-box`; with the inset, the career result sheet otherwise covered
  the pause and zoom buttons at 320x568). The celebration picker was words floating in a tall box (its buttons had
  no fill and 14 px gaps); now 36 px buttons with a fill, 8 px apart, the same 44 px touch pitch. Long fan names
  and handles wrap instead of being cut. A career begun before the media existed said "Play a game..." after games;
  now "Your mentions start with your next game." The pane cannot show a real safe area, so every audit was run twice
  more with `--sb` set to 34 px (an iPhone's strip): empty at 320x568 and 390x844 both ways, as were exhibition,
  season, career and camp; fingerprint unchanged. On the phone itself it is still to be seen.
- 00:05 Round 17 (the owner: "organize social better, add more visuals to the game, add more league leaders stats, make
  it more realistic models wise keep improving things, research too and work smarter not harder"). Researched first
  (four web searches): the parts of a football helmet (shell, jaw pads below the ears, ear holes, facemask on the
  shell), the official passer rating formula, broadcast lower-third practice (legible, team colors, simple fades,
  sparing), and social profile layouts (identity and stats header over a small tab bar). Built:
  Social tab as a profile: avatar, handle, a four-stat row (followers, hype, callouts, partners), hype bar, waiting
  items, then Mentions (this week open, earlier weeks in <details>), On the record, Partners.
  League leaders: one generator per team and position (`starter()`, seeded by season and team) so every number one
  man has agrees with the rest (his rating from his own attempts, yards, touchdowns and interceptions); five
  categories for your position, four around the league; rate stats qualify on volume; `leaders()` (awards, rival,
  trophies) now reads the same generator. Measured: other quarterbacks rate 90 to 102 after three games.
  Broadcast cards (`#bcast`): `playerCard` after a touchdown (always) or a 20+ yard play (at most one per 25 s), your
  man in a career; `teamStatsCard` at the change of ends; the career stat line fades while a card is up; role letters
  shown as a broadcast names them (X, Z, S as WR); a card on a timer checks the game still exists (a fast test found
  one firing into the menu).
  Models: the helmet is now a shell (`helmetShell`): longer than wide, sides and back down past the ears into jaw pads,
  the face open below the brow behind the mask, a slight brow ridge; ear holes; a skin-colored face under the mask
  with a thin dark eye band in place of the dark ball that filled the front; the far model's shoulder pads get the
  caps the near model had. New test hook `PG.r3d.headStrip(team)` draws the helmet from four sides. About +20k
  triangles a frame in a game (+10%).
  Checked: fingerprint unchanged; exhibition, careers (QB and WR, three games each), a WR season, drills clean; a drawn
  game with every pose finite; cards seen in real career games; audit empty at 320x568 and 390x844, with and
  without a simulated 34 px bottom strip, including every Social sub-tab, an opened week and four leader boards.
- 00:12 Awards night as a ceremony (automatic run 18, the last of the career items in "Next ideas"; the voices and the
  read-out scores wait on the owner, the pile was measured and left, see its item). The cards start sealed with their
  nominees and are read from the stat title up to the MVP: the stadium announcer introduces each (new clips
  pa.aw.open/title/all/roy/opoy/mvp/close, 7 clips, recorded locally: 478 in the pack), the drum roll (`roll`, 0.9 s),
  then the winner comes up to applause, with the fanfare when it is you; Reveal all opens every card at once and
  Continue works throughout; with the sound off the cards open on a timer (about 5 s an award, 24 s in all). New
  synthesized `applause`: single claps, about one every hundredth of a second at first and thinning, each a band of
  noise between 1 and 3.4 kHz at its own pan, over a quiet murmur. Measured: the first version put its energy in the
  murmur (bands 9/36/30/15/7/3) and sat 13 dB under the voice; now 1/5/7/20/41/27, the big round -28 dB RMS on a phone
  (the voice -20, the fanfare -20 over it), the polite round -32. Checked: the ceremony stepped through five awards in
  order in a real end of season; fingerprint unchanged; exhibition, careers, a WR and a QB season, drills clean;
  audit empty at 320x568 (sealed, mid-ceremony and opened, and with the 34 px strip) and 390x844; no console errors.
- 00:33 Cutscenes, 1 of 7: the walkout (Round 19). A cutscene system in game.js: `playScene(kind, o, then)` puts the game
  in state 'scene', stages actors as P (ordinary player objects, from the roster), a stub play state so render3d can
  pose them, a caption with Tap to skip; SCENES[kind] has dur, setup, update and timed cues; actors run to `go` by
  way of `via` points and take an `act` when they arrive. render3d.js: SCENECAM[kind] for the camera, `actPose` for
  staged poses (in front of every other branch of poseFor, only in a scene), props built once (`buildProps`) and
  shown per scene, officials and the chain crew left out, an actor with `ref` in stripes. Settings: Cutscenes on/off.
  The walkout: the tunnel 10 yd left of the posts (centered, it stood on the goal post's base); the first try had the
  team start wider than the tunnel and run diagonally through its wall (now two abreast inside, straight out of the
  mouth, then fanning out), and a tunnel washed out by the team's light second color (now its first). 7 s: into the
  tunnel, the team pouring out of the mouth, then up in front of them. The caption first failed contrast over the
  smoke (1.2:1; now on a dark panel). Checked: skipping goes to the matchup card, the whole scene hands over to it on
  its own, careers play through it with no errors (the harness steps through it), fingerprint unchanged (never in
  simulations); audit empty at 320x568 and 390x844, at three moments of the scene, with and without the 34 px strip.
  (The roadmap went up in a second commit; the first one's log script missed its anchor.)
- 00:38 Cutscenes, 2 of 7: the rival face-off. Before a rival game, after the walkout: you and the rival at midfield,
  fists drawn up to the chest, face to face; the caption carries his line from the week (`rivalSays`) and your
  callout if you made one (the career passes `rivalry` to startGame). Shots: side on and pushing in, over your
  shoulder as he points at you, over his as you answer with a fist to the chest, then up and away; an "ooh" from the
  crowd at the point, a cheer at the answer. Fixed on the way: "arms folded" first read as hands to the face, then as
  reaching for each other (now upper arms down, elbows tight, fists at the chest); the kickoff ball was left lying at
  midfield (no ball in any cutscene now); the over-the-shoulder shots hid him behind your helmet (now wider); "Tap to
  skip" failed contrast over a white jersey (now on a dark pill). Checked: a QB season with its rival game, careers,
  exhibition, drills clean; fingerprint unchanged; audit empty at 320x568 and 390x844 at the walkout and three moments
  of the face-off, with and without the 34 px strip.
- 00:43 Cutscenes, 3 of 7: the championship. After the final, when the career wins it (`gameEnd` plays it from the
  game's 'over' state and the scene now hands back whatever state it found, then the results and awards night): a
  stage at midfield (a dark deck on a skirt in team colors), a silver cup with handles and a football on the lid held
  over your head (it follows your helmet each frame), eight teammates round the back and ends of the stage cheering,
  confetti in four bursts, six fireworks over the stands in team colors (points flying out and falling), the fanfare,
  booms and the crowd; 8.5 s: circling close, in on the cup, then up over the field. Silver, not gold (the owner's
  rule). Fixed on the way: teammates first stood between the camera and you (now behind the stage); the fireworks were
  out of frame and took the flame texture's orange (now lower, behind the stage, on a white spark). Checked: a whole
  season won game by game to the title, the trophy scene seen in it and the results and awards after it; a scene
  from the 'over' state returns to it with the scorebug hidden; seasons, careers, drills clean; fingerprint unchanged;
  audit empty at 320x568 and 390x844 at three moments, with and without the 34 px strip.
- 00:46 Cutscenes, 4 of 7: the coin toss, in every game that is not a simulation (after the walkout and face-off in a
  career): three captains a side facing each other, the referee between them facing the camera; he shows the coin,
  flips it (a silver coin flies up about 3 yd spinning and lands flat in front of him), the microphone clicks, his
  arm goes out to the side that won (G.first, who receive), the announcer reads the toss (`ref.toss.{team}`, and the
  intro then does not say it again), the winners pump their fists and the caption turns to the result. In a career
  you are a captain once you are the starter (`G.share` 1). Fixed on the way: a duplicate else left by the edit
  broke the page until removed (caught by the parse check, before anything shipped); the staged referee first wore a
  helmet and a number (now dressed as the officials: `REF_HIDE`, the striped shirt, a cap; ear holes added to the
  list); the captains were cut off at the edges (now closer in, the camera further back); the camera looked up at the
  coin into empty sky (now less). Checked: exhibition, careers, drills clean; fingerprint unchanged; audit empty at
  320x568 and 390x844 at three moments of the toss, with and without the 34 px strip.
- 00:51 Cutscenes, 5 of 7: draft day. `cinema(kind, o, then)` plays a cutscene away from a game: a quiet stadium in the
  home side's colors (a menu state given the teams and a night sky), then back to the menus; the draft calls it
  before the board, and the board skips its fanfare and announcement when the scene had them. The scene: the stage
  at midfield with a draft board behind it (canvas: "THE DRAFT · ROUND 1 · PICK n", the team's name and city in its
  colors), you walking up the step onto it, the commissioner (a figure in a dark suit, no pads, no number) shaking
  your hand, then you turning to the cameras with your jersey held up (canvas: your name across the shoulders and
  your number in the team's colors), confetti, the fanfare, the announcer reading the pick. Fixed on the way: the
  jersey first covered your face (now at chest height). A page load in the pane once lost render3d.js to the test
  server's connection resets (no renderer, so no cutscenes): not the code; later runs check that the renderer
  loaded. The audit's menu walk now passes through the scene (it skips it, after scanning it). Checked: careers,
  exhibition, drills clean; fingerprint unchanged; audit empty at 320x568 and 390x844 at three moments of the scene
  and through the whole create-combine-draft path, with and without the 34 px strip.
- 00:55 Cutscenes, 6 of 7: the podium. "To the podium" now opens on you behind a podium (a dark lectern with a team
  plate, four microphones on stalks), the team's backdrop behind (its name and abbreviation in rows over its color),
  camera flashes from the room, shutter ticks; 4.2 s pushing in, then the questions. You are dressed for it: a team
  hoodie and cap, no pads. The first try showed the helmet shell for the cap, shiny, like a helmet with the mask off;
  now there are three optional head parts, hidden on every figure unless it asks for them (`f.extra`): a skull, hair
  or a cap's crown, and a brim. The commissioner gets the skull and hair too (no more cap). The harness and the audit
  skip the scene after scanning it. Checked: careers (the podium after every game), a QB season, exhibition, drills
  clean; fingerprint unchanged; audit empty at 320x568 and 390x844, with and without the 34 px strip.
- 01:00 Cutscenes, 7 of 7: the hall of fame. Retiring with enough to be voted in now plays the induction before the
  hall screen (`PG.cinema('hof', ...)` from the retire button, only when `e.inducted`): the draft's stage at midfield
  with its skirt in your team's color, the draft board redrawn as "HALL OF FAME" with the class and your name, your bust
  on a dark pedestal (a stone head and shoulders) under a cloth cone in team colors, you beside it in a dark jacket.
  A drum roll at 1.3 s, the cloth lifted off and shrinking away at 2.6-3.4 s, applause, the fanfare and confetti, the
  caption turning to "... is inducted" with the hall's verdict, and you waving (a new `wave` act: right arm high, the
  hand going side to side). The plaque on the pedestal (canvas) carries your name, position and number, team and
  class. Three shots in 7.4 s: the stage and the covered bust, close on the bust as the cloth comes off, then the two
  of you with the hall behind. The board is shared with the draft, so the draft redraws its own next time. Checked:
  the real retire path (a 6-ring career: induction, then the hall, back at the menu with the HUD hidden), careers, a
  QB season, exhibition, drills clean; fingerprint unchanged; audit empty at 320x568 and 390x844 at three moments of
  the scene, with and without the 34 px strip. That finishes the seven cutscenes; each can be skipped with a tap and
  all of them turned off with the Cutscenes chip in settings.
- 01:30 The playbook, after the owner wrote "it feels like i play the same plays over and over a lot". Measured
  first: in two QB career games the coach called 18 different plays in 42 snaps from a book of 19 (Stick, Four
  Verticals 5 times each), half of them from the Shotgun; a WR career saw 17 in 66, one play 8 times, three repeated
  back to back. The book now has 49 plays (15 runs, 4 options, 17 short, 13 deep) in nine formations (new: Gun Trips,
  Gun Empty, Pistol, Gun Bunch, Jumbo, Gun Slot, the last with X in the slot), 15 new routes (wheel, seam, skinny post,
  fade, comeback, sail, slant and go, out and up, stop and go, angle, bubble, arrow, snag, swings) and trick plays (a
  jet sweep, an end around that gives a WR career the ball). Defense: five new calls (Tampa 2, Cover 6, Cover 2 Man,
  Fire Zone, Overload) and pre-snap looks (`al` in data.js). Play calling (`callOff`/`pickOff` in game.js): the old
  situation rules, then a play weighted by the team's offense (`SCHEME`: each of the eight teams has one, shown on the
  matchup card), the red zone (`rz`), and what that side has called this game (the last call x0.03, the last four
  x0.15, the last ten x0.5, and /(1 + 0.5 per use)); the computer mirrors half its calls. The Suggested card uses the
  same caller with Math.random and is put first on its tab; the QB's "Coach sends in" offers two other kinds of play
  from other formations; Audible steps through the same formation's plays. After: 29 different plays in 33 QB snaps
  (most-used twice), 30 in 40 WR snaps, nothing back to back, all nine formations used.
  Balance, with a new play lab (`PG.dbg.lab`): the first version scored 46 points a game against 38. Causes found:
  a seam route bending into the gap between deep zones averaged 38 yards a throw and a fade 40 (now both a go with a
  release), routes that turn back sharply (whip, stop and go) were overthrown because a throw leads the receiver along
  his route at full speed (whip gone, the double moves smoothed), a deep crosser was intercepted one throw in eight
  (Yankee became PA Corner), and blitzers walked right up got home three times as often (now a step). The lab also
  showed rosters, not plays, deciding a batch (one draw's quarterback could not reach the deep routes), so plays are
  compared on the same three rosters. After: 36 seeded games average 4.1 yards a carry, 57.7% completions, 15.4 per
  completion, 1.4% interceptions, 38.5 points (before: 3.9, 58%, 15.0, 1.5%, 38.3); sacks 3.6% (2.2%). Training camp
  keeps the old five calls and plain spots, so its stars are unchanged (the test player: run drill 3,3,1,3,2,3). In a
  bunch the receiver letters sat on each other: a letter that would cover another is now lifted above it, and a tap
  takes the nearest letter. `H.fingerprint()` changes on purpose (the play calling is new); the new one is saved and
  repeats. Checked: careers QB and WR, a QB season, exhibition (the scripted user scored 36 points in 8 games against
  17 before), the drills, a drawn game, the WR end around (his carry, his line), audit empty at 320x568 and 390x844
  with and without the 34 px strip, no console errors.
- 01:57 Round 20. The play-call sheet shows three plays at a time in a row that swipes, takes a mouse wheel (a page a
  notch: a nudge on a snapping row only springs back) and pages with small arrows that say where you are ("4-6 of 46").
  The Coach tab opens it: `rankOff` ranks every play by the play caller's own chances (`callPlan`, split out of
  `callOff` with the dice in the same order, so the fingerprint did not change), shaken with Math.random, and shares the
  top three between the kinds of play by how likely each is, the way seats go by votes (first and ten: a shot, a short
  pass and a run; third and one: two runs and a pass). A career quarterback gets the same sheet with the coach's call
  first. Two traps on the way: grid percentage tracks collapsed to 2 px cards in a scrolling row (now flex), and the
  browser's smooth scroll never moved a snapping row (now a 220 ms slide of our own, landing by timer where frames are
  not running). The audit now skips text scrolled away in a sideways row and still checks what shows.
  Controllers (`pollPad` in game.js, the standard Gamepad layout): on the field the stick and d-pad move, RT sprints,
  the face buttons do the pad's buttons (receivers wear A, B, X, Y and RB); on screens a ring moves with the d-pad
  (nearest button in that direction), A presses, B goes back, LB and RB change tabs, LT and RT page the play row; the
  first press only shows the ring. Tested with a fake controller (`PG.dbg.pad`): menus to kickoff, the sheet, hard
  count, snap, a held-and-released throw, pause and resume.
  Research (Madden's team books run about 550 to 630 offensive plays in some 40 formations; the league's penalty tables:
  under one defensive offside or neutral zone infraction a game, about 2.5 false starts; Next Gen Stats: top speed and
  completion probability) turned into: the hard count (Y, G or a button; works about one time in eight, backfires one
  in twenty-five), a top speed card after a run or catch of 25 yards or more (yards a second times 2.0455), a completion
  probability card after a catch the game gave under 32 percent, a third-down line ("2 of 5 today") before third downs,
  and a measurement when the spot is within a third of a yard of the line to gain. The icon is new (a night game: light
  banks, the field in perspective, a spiral with its trail; rendered with the system's qlmanage, no download). Checked:
  fingerprint unchanged, careers, a QB season, exhibition, drills, audit empty at 320x568 and 390x844 with and without
  the 34 px strip, no console errors.
- 02:06 Automatic run, animations (Round 21, item 3, in part): the catch. Taken ahead of the old "Next ideas" because
  those three wait on the owner (the voice model download, the score lines) or were judged too big for a run (the pile
  solver), and the owner named animations and models as what he wants next. In `poseFor` (render3d.js only, so play
  and the fingerprint are untouched): a receiver whose ball comes down with a defender within 1.8 yards of the spot
  goes up for it in its last 0.42 s, both arms high and knees drawn up, takes it at the top and lands over 0.3 s
  (`f.leap`); the defender beside the spot goes up with him; a ball coming down 0.9 to 2.6 yards off his line with
  nobody near gets a stretch, the chest turned and out over the front foot, arms long, the hips a little lower. The
  first try never left the ground: on a deep ball the pass comes from behind, the old catch code calls that over the
  shoulder, and the leap had been kept to the other kind; a contested ball is fought for either way, so now it leaps.
  New test hooks `PG.r3d.catchTest(kind)` and `catchStrip(kind)` stage it: at the catch the leap has the hips up 0.5 of
  a hip height, the lower foot 89 cm off the turf (field scale) and the arms at 172 degrees; the stretch has the arms
  at 98 degrees and a 30 degree lean; both land back at standing height. In two drawn computer games, 4 of 109 passes
  came down as a leap and 4 as a stretch (before widening the contest from 1.6 to 1.8 yards). Checked: fingerprint
  unchanged, gait slide 1 cm at 5 and 8 yd/s with no sinking, a whole drawn game with every pose finite, careers,
  exhibition, drills, audit empty at 320x568 and 390x844, no console errors.
- 02:30 Round 23, the owner at 02:10 on 2026-11-13: "i want 30 nfl teams in this game, and bruh if u really can't have
  the normal teams from the nfl due to copyright, can u have similar names to represent them or nah / why are field
  goals still automatic".
  Kicks: a career's own team kicked nothing (field goals and punts went in by themselves when `G.lock`), and the extra
  point was a roll of the dice in every mode (96 in 100, no kick at all). Now your team's field goals, punts and
  kickoffs are yours in a career too, and the extra point is a real kick from the 15 (`patKick`, `finishPat`: a
  32-yard field goal worth one, with the swipe or the meter; a career's coach still decides when to go for two).
  The league: 32 teams, one in every city of American pro football, two conferences (Union, Frontier) of four
  divisions aligned by city the way the real league is. Real names are trademarks, and names made to sound like them
  were left out on purpose (the answer to "similar names"); the nicknames and colors are original, and a new team
  editor (Settings, Edit teams; `pg.teams` in this browser) renames any team on the owner's own device. The first
  eight keep their nicknames, colors, offenses and index (so saves keep their team) and moved city: Austin to Dallas,
  Portland to Green Bay, Omaha to Tennessee, Salt Lake to Seattle, Orlando to Jacksonville, St. Louis to New Jersey,
  Honolulu to Miami, Brooklyn to New York; their recorded calls stay valid (`vo` keys: the booth only ever said the
  nickname). League (league.js rewritten): ten weeks, the division twice (weeks 1-3 and 8-10) and four games against
  another division of the conference, rotating each season (`schedule(lg)`, checked: every week all 32 play, every
  team 10 games, 6 in the division, all in the conference); the four division winners of each conference make an
  eight-team playoff (divisional round, conference finals, championship; phases 'qf', 'semi', 'final'); standings by
  division, yours first, leaders marked; the bracket by conference. A save from the eight-team league (no `L.fmt`)
  finishes its season the old way and starts the next in the full league (`LG.fix` extends its ratings; tested with
  a staged old save: loaded at week 4, finished, free agency, then 32 teams and 10 weeks). Career: the rival is the
  best team in your division (you play him twice), free agency shows your team and the seven best offers, the draft
  is a full first round of 32 (eight contract tiers). Team pickers grouped by conference and division. The booth: 24
  new nicknames and draft picks to 32, recorded on the local Kokoro model (790 clips, 7.4 MB; Krewe is spoken
  "Crew", Voyageurs "Voyagers"); the checker flags "The Iron Sides select..." (4 syllables heard of 7, 1.33 s, the
  same line passes for the other 31; kept). New clips measure as the old ones (Touchdown, Blizzard! -3.2 dB peak,
  -17.2 RMS; Touchdown, Outlaws! -3.4, -17.5). Checked: play unchanged (the fingerprint's games, stats and trace are
  identical; only the career schedule in it went from 7 weeks to 10, new baseline stored), careers, a full WR season
  through the playoffs, exhibition, drills, the booth asks for nothing missing, the editor (rename, reload, reset),
  audit empty at 320x568 and 390x844 with and without the 34 px strip, no console errors.
- 02:40 Round 24, before the owner went to sleep. For a career (and season mode): three primetime games a season
  (`L.prime`, never the opener; the conference final and the championship always), at night, XP +25% and a hype bump,
  marked on the next-game card and the matchup card; Player of the Week in your conference (a win with an A+, or an A
  one time in three: +400 XP, a post from the league, in the headline; the first try gave it on two of three games,
  losses included); career highs per stat (`C.highs`), listed on the results when beaten and announced on the
  broadcast during the game once the old one was worth beating (`highCheck`); scores around the league at the end of
  the first and third quarters, your division first: the week's other games are now played out at kickoff (`preWeek`,
  `L.pend`) and the standings use those same results, and the card waits for your next snap because in a career the
  quarter often ends in a drive you only hear about; the team editor from the career hub and the new-career screen.
  Top speed is now held over a third of a second: unsmoothed, a juke read 27 mph; four computer games now top out at
  21.2 (median 16.5). New team colors broke two contrasts (the social avatar on Tampa Bay's sky blue, the matchup
  card's small text over a day game): the avatar takes its ink from the color, the card is a little darker. Checked:
  fingerprint unchanged, careers, a full QB season (3 primetime games at night, one Player of the Week), exhibition,
  drills, audit empty at 320x568 and 390x844 with and without the 34 px strip, no console errors. The NFL and Madden
  list for the loop is in "Next ideas", career first.
- 02:49 Automatic run: weather by city. Every team has a climate (data.js CLIM): dome for the eleven roofed stadiums
  (never rain or snow, always the lights), snow for the thirteen cold-weather cities, wet for five, warm for Miami,
  Tampa Bay and Jacksonville. `envFor(season, week, late, home)` reads it (a career or season game is at the
  player's home city, the only kind there is until home and away lands); the matchup card says "Indoors" and "Under the
  roof". Over 40 seasons of 13 weeks: domes 0% rain and snow; snow cities 15% rain early, 37% snow late; wet 26% rain
  early, 33% rain and 6% snow late; warm 19% then 12% rain, never snow. The career hub's next-game card gives the
  forecast ("Night game · snow in the forecast", "Indoors, under the roof"), from the same function the game uses
  (`gameEnv`), so it is what you get. Left: a roof drawn over those stadiums (in "Next ideas"). Checked: fingerprint
  unchanged, careers, exhibition, drills, audit empty at 320x568 and 390x844 with and without the 34 px strip.
- 03:23 Automatic run: home and away. `G.home` says which side is at home (team 0, yours, unless `startGame({away})`); the
  league decides (`LG.home`: each schedule pair is [home, visitor], five home games each, the middle round of each
  division leg turned round so nobody opens with three at home; in the playoffs the better seed hosts, the
  championship the better record; the old eight-team league plays at home). On the road: midfield and the crowd's
  colors are the home team's, the visitors wear white (render3d `setTeams(t0, t1, hs)`, the uniforms' kit from
  `p.team === G.home`), the crowd cheers the home side and groans at yours (`react`), roars on your third downs,
  boos your walkout (no welcome from their announcer), cheers a flag on you; a false start comes a little easier for
  you there (+0.8 in 100 a snap) and the hard count rarely works (3 in 100 instead of 12); "at" on the cards and the
  matchup card; the weather is the home city's; a road win +100 XP. Computer-only games are all at home, so play is
  unchanged (the fingerprint's games, stats and trace identical; only its schedule changed, new baseline stored).
  Measured: in a home game the third-down roar came on the other side's third downs only (5, none on yours), on the
  road on yours (3 of 3); a road walkout drew a boo and no cheer. Checked: careers, a full QB season (five at home,
  five away), exhibition, drills, a drawn road game with every pose finite, gait slide 1 cm and no sinking, audit
  empty at 320x568 and 390x844 with and without the 34 px strip, no console errors.
- 03:49 Automatic run: home and away, the rest. In a career or season game both end zones carry the home team's name
  and color (render3d `paintField(..., both)`; exhibition keeps one each); new booth lines recorded on the local
  Kokoro model: `intro.road` (three takes, said at the start of a road game) and `a.loud` (the analyst, about one
  road third down in three: "They'll need a silent count"). Six clips; the voice tool flagged none of them (the one it
  still flags is "The Iron Sides select...", see 02:30). Measured: intro.road peaks -3.3 dB at -14.7 RMS, a.loud -3.6
  at -13.4, a.hurry beside them -3.1 at -15.6; a road game asked for 85 lines, a.loud among them, none missing.
  Checked: fingerprint unchanged, careers, exhibition, drills, a drawn road game with every pose finite, gait slide
  1 cm, audit empty at 320x568 and 390x844 with and without the 34 px strip.
- 04:27 Automatic run: kick and punt returns for a receiver's career. A receiver is the returner (hub switch "Special
  teams": Return kicks / Offense only, on by default; `C.kr`, passed as `kr` to `startGame`). Their kickoffs are now
  played live in a career when you return (`startCall`), with you as the deep man (`beginKickoff` swaps you and the
  other receiver, so you keep your number, ratings and look) and the "YOU" marker on you. Their punts: the simulated
  drive stops when the computer calls a punt (`simDrives` keeps it as `G.liveP`), the banner says "JAX punt · get
  back deep", and the punt is played live with you fielding it (`asHero` dresses the free safety as you; your hands
  lower the muff chance; Fair catch works as in exhibition; the brief says "Punt return"). Returns are counted
  (`retStat`: kr, kry, pr, pry, krtd), shown on the game line ("6 ret, 97 yds") and in the stats tab, and pay XP
  (2 a kick return yard, 3 a punt return yard, 160 a return touchdown). A fumble on a return that they recover takes
  you off returns for the rest of that game. The play tag reads "Kick return" while one is live. Measured, test bot
  (no steering): 4-6 returns a game, kickoffs about 16 yards a return, punts about 7. Checked: fingerprint
  unchanged, careers (QB and WR), exhibition, drills, a drawn career game with every pose finite, the switch on the
  hub, audit empty at 320x568 and 390x844, no console errors after a reload.
- 05:52 Automatic run: the returner, the rest. Returner trust on the hub under Special teams (`C.rt`, starts at 60;
  after a game `retAfter` adds (kick return yards - 21 a return) / 5 + (punt return yards - 8 a return) / 2.5 + 10 a
  return touchdown, held to -12..+15). A return fumble they recover (`G.my.krf`) costs 20 and sits you down for two
  games (`C.krOut`), trust under 30 for one; back at 40 at least. The results card says so, the hub shows "sitting" and
  how long. League leaders: "Return yards" for a receiver (`CATS.WR` takes a fifth field, the job whose numbers it
  shows; `starter(i, 'KR')` gives every team a returner with about the chances a career returner gets: 2.8-4.4 kick
  returns and 1.4-3 punt returns a game at 3-minute quarters). Career high: kick return yards (`HIGHS.kry`, called
  from 40). Booth: `punt.big` (play-by-play, two takes, for a punt return of 15 or more) and `a.ret.me` (the analyst,
  two takes, after a long return by the career player), recorded on the local Kokoro model; the voice tool flagged
  none. Measured: punt.big peaks -2.6 dB at -14.5 RMS, a.ret.me -3.5 at -15.2, kick.big beside them -3.2 at -16.1; two
  receiver games asked for 131 lines, a.ret.me twice, none missing. Forced test: a return fumble in game 1 took trust
  60 to 36 and sat the receiver for games 2 and 3 (no returns), back in game 4 at 40 and up to 54. Checked:
  fingerprint unchanged, careers (QB and WR), exhibition, drills, audit empty at 320x568 and 390x844, no console errors.
- 06:23 Automatic run: pre-snap motion, the first part. `planMotion(kind)` picks a receiver (X, Z or a slot, six yards or
  more outside the ball, never the ball carrier) and a kind: 'zip' (in toward the formation, sets 1.6 yd off the
  line), 'across' (behind the line to the other side, at the spot with the most room) or 'jet' (85% of his speed, at
  most 8.5 yd/s). He steps back off the line first and passes behind a quarterback under center (3.2 yd deep) or in
  front of one in the shotgun (2.2). `motionStep` moves him in the 'pre' state like `jogIn` does (speed, stride),
  rebuilds his route every frame from where he is (`mkRoute` picks the side from his x, so a man who crossed runs it
  to his new side) and moves the defender who has him in man coverage along with him at his own depth; in a zone
  nobody follows, and a quarterback the user controls gets the read as a toast ("Man coverage · #24 went with him" /
  "Zone · nobody went with him"). At the snap his route is built once more, he keeps his speed, and his alignment
  and his defender's become where they are. The computer's offense and a career receiver's coach use it on 33% of
  snaps (`Math.random`, only when !AUTO, so the fingerprint is identical); the automatic snap waits for him (set, or
  a jet 1.5 yd past the ball; 7 s at most). The user's quarterback has a Motion button (M, controller X), across on a
  pass and a jet on a run, once a play; a career receiver sent in motion reads "You go in motion first" in the brief.
  Measured: in an exhibition the computer moved a man on 5 of 16 snaps (3 zip, 1 across, 1 jet), the man defender
  ended 0.0 yd from him, the jet was snapped 1.5 yd past the ball, snaps came 2.2-4.6 s after the break; a receiver
  career's coach used it on 4 of 10 snaps, twice on the user; every route point finite; a drawn game posed the moving
  man in a stride with every pose finite. Checked: fingerprint unchanged, careers (QB and WR), exhibition, drills,
  audit empty at 320x568 and 390x844 (the snap pad holds five buttons in two rows), no console errors.
- 06:51 Automatic run: pre-snap motion, the second part. Motion is now a path of points (`pts`, `i`), so 'orbit' fits:
  a slot in a shotgun formation with nobody straight behind the quarterback runs in front of him, round behind him at
  about eight yards and back toward his own side; the snap comes as he comes round (point 4 of 6). A zone now slides
  instead of standing still: with no man defender on him, the deep zone players move 2.6 yd toward where he is going,
  the safeties 1.8, the linebackers 1.3, the corners hold (less for a zip or an orbit), zone centres included, in step
  with how far he has gone; the quarterback's read says "Zone · the safeties slid over". The Jet Sweep is run from jet
  motion in every watched game, the user's included: the runner is in motion when the play starts, the snap comes 3.2
  yd before he reaches the quarterback (automatic, whoever is the quarterback), the sweep path drops the points he has
  run past, and the handoff comes as he flies by (within 1.8 yd, or 0.5 s). Measured: 24 user jet sweeps by the test
  bot (no steering) gained 9.9 a carry, the same play simulated without motion about the same (`lab`); in a 10-minute
  exhibition the computer moved a man on 39 of 134 snaps (16 across, 9 zip, 11 jet, 3 orbit), every orbit snapped at
  7.8 yd deep behind the quarterback, the zone slid on every motion without a man defender, the man defender followed
  on 6, every position finite. Checked: fingerprint unchanged, careers (QB and WR), exhibition, drills, audit empty at
  320x568 and 390x844, no console errors.
- 07:20 Automatic run: the formation shift, which finishes pre-snap motion. `planShift` lines the offense up in another
  formation with the same men (single, pistol and slot share theirs; gun, empty and bunch theirs), either way round,
  or in the mirror of the called one, keeping only the men who move 1 to 12 yards (two at least; it tries every
  option and picks one at random). `shiftStep`: once the quarterback has called it and everybody has stopped, they all
  move at once (jog speed held to 3 yd/s and 70% of each man's speed), then set for a full second ('from', 'move',
  'set', 'done'); the corners walk out over whoever is outermost the whole time, at up to 6 yd/s. The computer's
  offense and a career receiver's coach shift on 12% of snaps (a formation that cannot shift sends a man in motion
  instead), and the automatic snap waits for the second set. A career receiver who moves reads "The offense shifts
  first" in the brief. The End Around stays a true end around (the receiver starts after the snap): it is not a
  motion play. Measured, a 10-minute exhibition: 11 shifts on 120 computer snaps (slot to single 3, slot to pistol 3,
  mirrored heavy and trips, bunch or empty to gun, bunch to empty), 2 to 4 men each, set for 1.0 s every time, the
  corners 0.0 yd from the outside men at the snap, every man at his spot; motion on 40 more. Checked: fingerprint
  unchanged, careers (QB and WR), exhibition, drills, audit empty at 320x568 and 390x844, no console errors.
- 07:54 Automatic run: the coin toss call. `G.toss` (`mine`: you are a captain, so every exhibition and season game and a
  career once you start; `coin`, `call`, `win`, `choice`). The toss scene now waits at midfield (`sc.hold`, which stops
  the scene clock) for "Heads / Tails" before the referee flips it, and again after the coin lands if you won it, for
  "Receive / Defer"; the question hides the scene's tap-to-skip layer under it (the audit flagged the two overlapping).
  A scene skipped early, or cutscenes turned off, ask the same questions in a 'toss' state (`tossDone`). The computer,
  and your own captain when you are not one, defer 70% of the time. `tossApply` sets `G.first` (who receives now; the
  second half already kicks to the other side) and respots the kickoff; the matchup card says "won the toss ·
  deferred" or "will receive". The referee's line has a new form, `ref.defer` ("The {team} have won the toss, and have
  deferred to the second half."), recorded for all 32 teams on the local Kokoro model (3.2-3.7 s each, none flagged;
  the pack is 8.2 MB, 832 clips). Measured: ref.defer.ATX peaks -2.8 dB at -18.3 RMS, ref.toss.ATX beside it -3.3 at
  -17.9. Exhibition no longer always opens with you receiving. The test bot calls heads and receives (`H.bot` clicks
  `#tsH` and `#tsR`). Checked: the three outcomes (lost the call: they chose; won and deferred: they receive first;
  won and received), a skip before the call, fingerprint unchanged (simulations keep the old coin), careers (QB and
  WR), exhibition, drills, audit empty at 320x568 and 390x844 including both questions; the console showed only the
  test pane's "AudioContext encountered an error from the audio device" after long runs, as two earlier runs in this
  log noted.
- 08:34 Automatic run: more penalties, the first part. Watched games only (`watched()`: not in simulations, so seeded runs
  are unchanged; `Math.random`, never the game's generator). `finish` is now a wrapper round the old one (`finish0`):
  after the play is settled it enforces a foul the play carried, unless a flag during the play already decided it
  (`ps.flagged`, set by `flagAfter`). Roughing the passer: a rusher within a yard of the quarterback in the half second
  after the release (`ps.rel`, checked in `tick`), 6% of those. Unnecessary roughness: a defender within 1.4 yd of a
  runner who went out of bounds, 10%. Both: fifteen yards (or half the distance) from where the play ended and an
  automatic first down, let go after a score or a turnover (`lateFoul`). Intentional grounding: the computer's
  throw-away from inside the tackle box, 35% (the officials do not always see it): loss of down, back to where he
  threw it or ten yards, the farther (`grounding`). Illegal formation at the snap: 0.4%, five yards on the offense.
  The free play: 1.2% of snaps a defender jumps and the play goes on ("Flag at the snap · free play!"); the state at
  the snap is kept (`freeSnap`: spot, down, score, team stats, your line, the box score, the score log) and afterwards
  the offense chooses: keep a touchdown, take the flag after a turnover or a short gain, keep a first down past the
  five yards; only the real trade-off (more yards and the next down, or five and the down again) is asked, of you
  when you call your offense (a 'decide' state with Accept and Decline, each saying what it gives), and the computer
  keeps a gain of eight or more. Accepting wipes the play from every stat. Seven new referee lines recorded on the
  local Kokoro model (roughing, unnecessary roughness, illegal formation, intentional grounding, "Fifteen yard
  penalty.", "The penalty is declined.", "Loss of down."), none flagged; the pack is 8.3 MB. Measured: ref.rough peaks
  -2.9 dB at -20.0 RMS, ref.fifteen -3.3/-20.3, ref.decl -3.7/-20.1, ref.ground -2.7/-19.6, ref.hold beside them
  -3.0/-21.6. In a game of 15-minute quarters (336 snaps) at the first settings: 4 roughing calls (too many, so 15% became
  6%), 2 free plays, 1 illegal formation; each roughing call moved the ball fifteen past where the play ended with a
  first down. The first version of the roughing check (a defender within 1.3 yd at the release) never fired in 162
  throws, so it moved to the half second after. A staged free play: a 10-yard completion on second down, accepted,
  left first and five, five yards up, with the completion gone from the team stats. Checked: fingerprint unchanged,
  careers (QB and WR), exhibition, drills, audit empty at 320x568 and 390x844 and on the staged question, no console
  errors. A test that forced Math.random to a constant hung the page (a booth take picker loops until it draws a
  different take): never stub Math.random to a constant in this game.
- 08:38 By hand (the owner, awake: "keep working hard"): the rest of the penalties. Facemask: 1.2% of tackles on an
  offensive ball carrier, enforced like roughing (`lateFoul`). Defensive holding: 1.5% of throws to a receiver
  (`ps.dhold`, the state kept at the throw): five yards from the old spot and an automatic first down with the play
  wiped from the stats, or declined when the play was a touchdown or a first down farther on (`defHold`). A
  throw-away for the user's quarterback: an Away button on the pass pad (Z, controller LB) throws it out of bounds;
  from inside the tackle box it can be flagged for grounding like the computer's. Two referee lines recorded
  ("Facemask, defense.", "Holding, defense."), none flagged. Measured in three quarters of 15 minutes: facemask 2,
  defensive holding 1, roughing 2, grounding 1 (the test's own throw-away from the pocket), illegal formation 1, a
  free play 1. Checked: fingerprint unchanged, careers (QB and WR), exhibition, drills, audit empty at 320x568 and
  390x844 with the pane in front (run in a background tab its timers stall and a fading banner is reported on every
  screen), a drawn game with every pose finite; the console showed one three.js "getUniforms" error during the
  audit's viewport switch (a lost graphics context in the test pane; none in a drawn game after a reload).
- 08:50 Automatic run: roughing the kicker, and injuries for a career. Roughing the kicker: 1.2% of punts and field goals
  in watched games (`ps.rk`, the state kept at the kick); the kick and any return are wiped, the kicking team gets
  fifteen yards from the old spot and a first down (`roughKick`); a field goal that was good stands (declined). One
  referee line recorded. Staged: a punt from the 58 became first and ten at the 73 for the punting team. Injuries
  (career.js): after a game 7% of the time you are questionable for the next one (`C.inj`: a sore ankle or tight
  hamstring takes 4 or 5 off speed, a bruised shoulder or jammed finger 4 off arm power, accuracy or hands; `hero()`
  applies it, the next-game card says so, and it clears after that game). The opponent's injury report (`oppInj`,
  drawn from the season, week and team so it reads the same every time): one week in four a starter is out
  (quarterback 4 overall, anyone else 2), shown on the card and taken off their rating for that game. The first seed
  never produced one: this generator's first numbers barely move between neighbouring seeds, so the seed is now
  multiplied through and three numbers are thrown away. Checked: fingerprint unchanged, careers (QB and WR, one game
  played questionable), exhibition, drills, audit empty at 320x568 and 390x844 and on a hub showing both lines.
- 09:19 Automatic run: shaken-up players. After a tackle in a watched game (0.8%, never a career player's own man, two at
  most at once) the ball carrier stays down (`shaken`): the dead ball lasts 2.6 s longer, the clock waits, the banner
  reads "Injury timeout · #29 Nakamura is shaken up · Petrov comes in", and the roster slot is played by a
  substitute (another name and number, 97% of his speed, six points lower) for the next three to six scrimmage snaps
  (`G.hurt`, counted down by `healStep` in `setupPlay`); then the starter is back with a toast and a cheer. Four booth
  lines recorded (`inj.down`, `inj.back`, two takes each), none flagged. Measured: at the first rate (1.2%) a game of
  15-minute quarters had four (a running back twice, a quarterback, another back), each replaced on the field by the
  named substitute and each back within the quarter or two; the rate came down to 0.8%. inj.down peaks -3.3 dB at
  -14.4 RMS, inj.back -3.0 at -16.0. Checked: fingerprint unchanged, careers (QB and WR), exhibition, drills, audit
  empty at 320x568 and 390x844.
- 09:47 Automatic run, the last of the night (a short one): the tackler can be the man shaken up (35% of the time,
  `p0.tackler`), so defenders are replaced too. A game of 15-minute quarters had three: a quarterback and both outside
  linebackers. No screen changed, so the interface audit was not rerun (it was empty at 09:19). Checked: fingerprint
  unchanged, careers (QB and WR), exhibition, drills.
- 17:10 By hand (the owner: "no more additions but focus on improving ui with no regressions"): an interface pass. The
  career hub repeated its settings (difficulty, special teams, quarter length, celebration) under every tab; they are
  now one "Game settings" card that says the current choices and opens on a tap (rendered only when open: a folded
  `<details>` still gave the audit buttons under the ones below it). The hub is about 600 px shorter. The Away button
  on the pass pad is smaller, dashed and set apart from the receiver letters. Checked: fingerprint unchanged, careers
  (QB and WR), exhibition, drills, audit empty at 320x568 and 390x844 including the open settings card, no console
  errors. Until the owner says otherwise: interface work only, no new features.
- 17:23 By hand (the owner: stale cards, "especially if u skip make it work", and the kickoff "more like the normal 3
  point kicks"). Cards: every snap and kickoff has a number (`G.pn`); a card scheduled after a play (`later`: top
  speed, completion probability, a career high, the quarter's team stats, the scores around the league) is dropped if
  the next play has been snapped or the ball is live when its time comes (the league scores wait for the next huddle
  instead). `clearCards` takes the last play's banner and note down when the game moves on (`next`, so also after a
  skipped replay) and everything, the broadcast card too, at the snap. Kickoff: the same timing bar as a field goal
  ("swipe up, or stop in the green"); the green's middle is a deep straight kick, the edges short and wide. The Kick
  button had never worked on a kickoff (the 'pre' check returned before its branch), only the swipe or the 8 second
  timeout did. Measured: stopped in the green the ball came down 8 yards deep in the end zone (touchback), at the
  edge on the 14 and 10 yards off centre; a banner up at the whistle was down by the next snap, with a card forced on
  too. Checked: fingerprint unchanged, careers, exhibition, drills, audit empty at 320x568 and 390x844 and on the
  kickoff bar, no console errors.
- 17:39 By hand (the owner: the press conference "is the same 3 questions and answers every time", and "improve
  character models and field"). Press conference (media.js `press`): each of the three slots now draws from the
  topics that fit the game, each with two or three wordings and one or two answer sets: your day (great, player of
  the game, bad, a grade, two touchdown catches, drops, return yards, interceptions, three touchdown passes, your
  running, accuracy), the game (a loss, a skid, a close one, a blowout, a win, a streak, a road win, primetime, the
  playoffs, playing hurt, a tie; the rival and a role change still come first), and what is next (the next opponent
  six times in ten, where the callouts live, else the fans, the coach, what you are working on, being a rookie, the
  contract, the race). The career passes the facts (`away`, `prime`, `inj`, `streakW`/`streakL`, `season`, `left`)
  and remembers the last seven topics (`C.pressSeen`) so they are passed over while others fit. Five test games
  asked fifteen different questions. Field (render3d `paintField`): the texture is 1792 wide (was 1280), bands mown
  both ways with a light across each, mower lines and more grain, arrows beside the yard numbers, end zones with a
  diagonal weave and edged lettering, the midfield disc inside a second-color ring with edged letters. Figures: the
  number texture is twice the size with a stitched edge, and the shoulder pads carry small numbers (`f.tv`, which
  wear whatever the big number wears). Measured: 60.7 frames a second in the pane, a drawn game with every pose
  finite, gait slide 1 cm and sink 0.2 cm as before. Checked: fingerprint unchanged, careers, exhibition, drills,
  audit empty at 320x568 and 390x844, no console errors. Not done: the body shapes themselves (the skinned body is
  still its own project).
- 18:14 By hand (the owner: "keep going on the body shapes"). The limbs are one recipe each at two finenesses (`mkThigh`,
  `mkShin`, `mkUpperArm`, `mkForeArm`, `mkHips`, `mkNeck`, `cleat(seg)`), so the gameplay model has the close model's
  muscle instead of plain tubes: quadriceps and hamstring on a thicker thigh (0.116 to 0.124 at the top, was 0.108),
  a calf that swells 2.4 cm behind the shin, biceps and triceps, a seat on the hips, real cleats with a toe and heel.
  Both models: the torso tapers harder (waist 0.176, chest 0.247, more chest and back), the neck is thicker, the
  sleeves a little wider for the arm. Joints did not move, so every pose is as it was. Measured: gait slide 1 cm and
  sink 0.2 cm at 8 yd/s (1.5 and 0 at 2), tackle hands 9 cm from the runner with nothing inside him or under the
  turf, block hands 3.5 to 10.5 cm with chests 11 cm apart, the leap as before, a drawn game with every pose finite,
  60.3 frames a second three times (one reading of 44 came straight after a long synchronous test). Checked:
  fingerprint unchanged, careers, exhibition, drills, audit empty at 320x568 and 390x844, no console errors. Still a
  jointed body, not a skinned one: elbows and knees are balls between rigid parts.

- 2026-11-13 20:20. The owner: "allow u to go for it on 4th down instead of field goal, also don't skip over
  opponents plays, show it and allow u to fast forward or skip it". Both are career changes (an exhibition already
  lets you call anything on fourth down, and you play its defense). game.js: `startCall` no longer hands the other
  unit's drives (or a drive you sit out) to `simDrives`; `watchPlay` plays each snap live with nobody under your
  control (`G.watch`, `G.wd` keeps the drive's start for the result line), the snap comes after 1.7 seconds, and their
  kickoffs to a team whose returner is not you are played too. The pad shows Skip drive and Fast fwd (`watching()`,
  pad kinds watch/watchF/watchK/watchKF; keys F and K; controller A and B). Fast forward is three steps a frame and
  no replays, saved as `SET.wff`. `skipDrive` finishes the play in flight unseen and hands the rest to
  `simDrives(own, res)`, which sums the whole drive up as before; on a kickoff it takes the touchback spot. Fourth
  down: when the coach's call is a kick, `ask4th` offers Kick it / Go for it (`G.go4` makes `callPlan` leave the
  kicks out; a quarterback then gets the usual sheet, a receiver gets the coach's play). The test player skips
  watched drives unless `window.H_WATCH` is set, and kicks on fourth down. Checked: fingerprint unchanged; careers
  with every drive watched and with every drive skipped, exhibition, drills, no errors; audit empty at 320x568 and
  390x844 including the new pad and sheet. Ten-game samples put the opponents' scoring in the same range watched or
  skipped (13 to 25 a game). Not judged by eye at real speed: the test pane was hidden and drew a frame now and then.

- 2026-11-13 21:10. Bug test asked for by the owner ("bug test with different careers and such"); no game bug found,
  nothing in the game changed. A random test player ran 4 games for every one of the 32 teams (quarterbacks on the
  odd ones, receivers on the even), watching drives, tapping Skip drive at random moments (before the snap, in flight,
  between plays, on kickoffs), toggling fast forward, and going for it on fourth down between 20% and 100% of the
  time, with every fifth career skipping everything as before. Each step checked the ball spot, down, clock, score
  and every player's position for a bad number, and for a state that stops moving: none. Also clean: games drawn
  every 25 steps (no render errors), one whole season each for a quarterback and a receiver with every drive watched
  (one reached the conference final), two seasons with drives skipped, the play clock running out on the fourth-down
  question (delay of game, then it asks again), and the fingerprint. One thing about the tests themselves: with sound
  on, a page that plays more than about 80 stepped games in a row freezes or crashes, because thousands of sounds are
  started within seconds of real time and never get to finish. It did not happen with `PG.SET.snd = false` and
  `PG.SET.ann = false` (48 games), or in short runs with sound on. Long stepped runs should turn sound off first.

- 2026-11-14 00:30. The owner: "keep improving". Three things on the watched drives, nothing new elsewhere.
  (1) On a drive the coach sat you out for, the man on the field still carried your name and number, in the booth's
  calls and the box score too: `startGame` now keeps the roster's own player at your position as `G.bench`, and
  `setupPlay` puts him in for those drives. (2) The card beside the watch buttons counts the drive (`watchLine`):
  whose it is, the play number and the yards so far; on the sideline it names the backup. (3) The watch pad has its
  two first-time tips (the drive buttons, and the kickoff's Skip), shown with fast forward on as well. Checked:
  fingerprint unchanged; six watched career games with no error and never your name on the field while sitting;
  careers, exhibition, drills; audit empty at 320x568, 375x812 and 390x844.

- 2026-11-14 01:00. The owner: "yes tidy up things now layout and ui". Interface only. (1) Before the snap, Snap is
  now the corner button under the thumb with Audible beside it (it used to sit left of Audible); Flip, Hard count and
  Motion stay in the row above. (2) Career hub: XP to spend and the contract share one row (`.xp2`), the coach's note
  and his word on your press conference are one card, and Practice and Play game sit side by side (`.pg2`), so Play
  game is about 90 pixels higher on the page. Checked: fingerprint unchanged, careers and exhibition clean, audit
  empty at 320x568 and 390x844 (the contract text does not clip at 320).

- 2026-11-14 02:10. The owner: "focus on speed and loading with no regressions". Measured first, then three changes.
  (1) Voices: half of the 8.5 MB pack was the 32 teams' own lines, and a game uses two teams. `tools/voice.py` now
  writes `audio/vo.pack` (the lines every game uses, 4.2 MB) and `audio/vo/TEAM.pack` (about 140 kB each; a clip's
  fifth index entry names its pack). `audio.js`: `booth.loadPack`, `has`, `teams`; `startGame` and draft day ask for
  the teams they need (`PG.audio.voTeams`); a line whose pack has not arrived is left unsaid and the pack asked for;
  a pack that cannot be fetched is retried after twenty seconds and never switches the booth off. A game now
  downloads about 4.5 MB of voices instead of 8.5. The packs were split from the existing recordings byte for byte
  (nothing re-recorded); the one-file build carries all 33 inside it as before. The clips' words left `js/vo.js`
  (nothing read them): 87 kB to 44 kB. (2) Drawing: about 280 of a frame's 400 draws were jersey lettering, one draw
  for each number, name and shoulder number on 48 figures, and the two-sided numbers were drawn twice. Numbers now
  draw in one pass (`forceSinglePass`), and lettering under a pixel and a half tall on screen is left out
  (`writeFigure`, only while the game's own camera draws; `PG.r3d.lodTest(false)` turns it off to compare). From the
  quarterback's view: 400 draws to about 140, and the frame's drawing time on this Mac from about 3.0 ms to 1.0 ms.
  The players' chest numbers stay; what goes is under two pixels. Cutscenes keep every letter (44 of 44 shown).
  (3) `index.html` opens its connections to the font and library hosts early. Checked: fingerprint unchanged;
  careers, exhibition, drills; a watched game drawn every 20 steps with no error; audit empty at 320x568 and 390x844;
  a common line, a team line and a referee line measured at their old levels from both builds; every pack's size and
  three clips from each decoded (99 of 99); a missing pack leaves the booth ready. Not measured: a real phone, where
  the saving in draws should matter more than it does here.

- 2026-11-14 03:20. The owner: "work on proper animations". Two from the Round 21 list, drawing only (`render3d.js`,
  `poseFor`). (1) The quarterback's drop and set. Going back he is turned about sixty degrees to his throwing side
  with the ball up at his back shoulder and his eyes downfield, in crossover steps (`gait.base` cut so the feet
  cross); the steps are counted: the distance to his spot is shared out as three steps from the shotgun, five from
  under center, seven on play action (`f.dropStep`, passed to `stridePhase`; this playbook's quarterbacks all line up
  four to eight yards deep, so in practice it is the three-step drop). When he stops he sets: a throwing base by
  `legIK` (front foot at the target, back foot behind, knees bent, a little bounce), body a quarter open, the ball
  nearer the throwing shoulder. Scrambling forward and the wind-up are as they were. (2) The stiff arm goes to the
  man: the nearest defender on his feet within 2.4 yards who is not behind him. The chest turns part of the way and
  the hand is solved onto his shoulder pad with `armIK`; a man on the right gets the right hand and the ball goes
  under the left arm; with nobody there, or the man behind, it is the old locked-out arm. Measured with everything
  frozen and a defender placed round the runner (`PG.r3d.handOf`): the hand ends 0.4 to 0.6 yards from his chest
  centre at the side and in front (the figures are drawn 1.6 times life size, so that is on his pads), where the
  old arm pointed the same way whoever was there. Something learned: a positive chest turn (`CHRY`) is to his LEFT.
  Checked: fingerprint unchanged (drawing only); gait 1 cm slide and 0.2 cm sink, tackle hands 9 cm, block and
  leaping catch as before; two watched career games drawn every 15 steps (5,743 frames) with no bad pose and no
  error; careers, exhibition, drills. Seen as frame strips from the side and from above, not in motion. Next on the
  list: the toe tap at the sideline, the form tackle as a paired animation, then the skinned body.

- 2026-11-14 04:00. The owner: "keep improving things add more small details". Four, all drawn only and never in
  simulations. After the whistle somebody says it with his arms (`gesture()` in game.js picks the man and stores
  `ps.gest`; `poseFor` draws it from 0.25 to 1.65 seconds after the whistle): a first down, and the nearest teammate
  on his feet (or the runner, if he stayed up) points upfield; a pass broken up, and the nearest defender waves it
  off with both arms; a sack, and a defender beside it flexes. And the quarterback, set in the pocket, pats the ball
  about once a second. In three watched games: 18 points, 5 flexes, 1 wave. Checked: fingerprint unchanged; gait,
  tackle, block and leaping catch as before; two watched career games drawn every 12 steps (6,130 frames) with no bad
  pose and no error; careers, exhibition, drills; audit empty on the career and exhibition games at 390x844. Seen as
  three small stills, not in motion.

- 2026-11-14 05:00. The owner: "research what madden has and add more things from it". Read up on the current
  game's feature list and controls (its career mode's short-term goals, relationships and trade requests; on the
  field: pump fake, quarterback slide, pass protection slides and max protect, hot routes, fake snap). Already here
  under our own names: hot routes, the hard count, motion, the throw-away, trade requests, coach trust, game goals.
  Built now, as plain football and with no names or marks taken: (1) the pump fake (`pumpFake`, Pump on the pass
  pad, B on the keyboard, LT on a controller): 0.42 seconds in which he cannot throw; it is sold to the shortest
  route, and zone defenders near that receiver may drive on him for about half a second (`d.fakeT`, `ps.fake`,
  `zoneAI`), good coverage men less often; once every second and a half; the computer never pumps. (2) the
  quarterback's slide (`qbSlide`, pad kind `carryq` with Slide where Hurdle was, N, controller Y): past the line he
  gives himself up, the ball is dead there, with no fumble and no chance of being shaken up. Drawn in `poseFor` (the
  arm cocks and comes back; he goes down on his back). In a staged test eight pumps drew six bites, a throw was
  refused during the pump and allowed after, and a slide four yards past the line ended the play there. Checked:
  fingerprint unchanged; careers, exhibition, drills; audit empty at 320x568 and 390x844 with the new buttons.
  Not built from the list: pass protection calls (slide left or right, max protect), which need the line's blocking
  assignments reworked; relationships with teammates and fans.

- 2026-11-14 06:30. The owner: "Yes keep working" (pass protection calls). Two things, and the second CHANGES PLAY.
  (1) Pass protection, before the snap on a pass (`protect`, `setProt`, Protect on the pad, O, controller LT): Base,
  Slide left, Slide right, Max protect. A slide re-makes the line calls with every lineman counted 1.6 yards over
  (`lineCalls`, now its own function) and biases free blockers that way; Max protect takes the routes off the backs
  and the tight end so they block, and re-letters the receivers. `PG.dbg.lab(play, n, { prot })` measures a call.
  Seeded, 300 snaps each: a slide changes who comes free (Curl Flat against Man Blitz, sacks 144 base, 133 left,
  125 right; Skinny Post against Man Blitz, 0 base but 121 and 152 with a slide: the wrong slide costs you), and Max
  protect lifts completions against zone (67% to 85% against Cover 3) but can backfire against a man blitz, because
  the men covering the backs come too. The computer and simulations stay on Base.
  (2) Found while measuring: receivers ran two or three yards past every hard break, so a ball thrown to the break
  was "overthrown" every time. In 160 seeded snaps of eight plays the computer completed 1 of 116 hitches, 0 of 42
  in-routes and half its outs; the same throws from a person missed the same way. Fixed in three places:
  `followRoute` throttles down into a sharp turn (and records it as `p.cut`), `lead` charges a break for the ground
  it costs, during it and for 0.7 seconds after. Now hitches 76 of 82, ins 23 of 38, outs 100 of 138. That lifted
  completions in `H.sim` from 57% to 67%, so the base catch chance in `resolvePass` came down from 0.96 to 0.9:
  24 games now give 59% completions, 2.1% interceptions, 16.0 yards a completion, 41.9 points a game (before: 57%,
  1.8%, 15.8, 45.4). An attempt to also pace the receiver to arrive with the ball was dropped: it took completions to
  87%. The fingerprint changed, as it must, was checked to repeat, and was re-pinned (the old one is kept as
  `pg.fingerprint.before-routes` in the test browser). Checked: careers (4 games each), exhibition, drills with the
  usual star counts, audit empty at 320x568 and 390x844 with the sixth pre-snap button.

- 2026-11-14 07:30. The owner: "improve". Max protect did not protect, so it was made to. Timed properly this time:
  `PG.dbg.lab(play, n, { prot, hold: true })` has the quarterback keep the ball and reports how long the protection
  lasted (`t`), who got him (`by`) and whether the extra blockers ever blocked (`extra`). Before: the back kept in
  stood idle on 40 snaps of 40 (every rusher was already "claimed" by a lineman, so he had no man, and when he had
  one he chased him and was run past), and the defenders who had the backs in man coverage followed them into the
  backfield. Now a man kept in (`p.stayIn`) helps on a rusher who is still coming free and meets him two yards in
  front of the quarterback (`blockAI`); of the defenders left with nobody to cover, one in five rushes and the rest
  sit in a short zone (`ps.dogs`, undone when the call changes). Over three plays and six defenses, 80 seeded snaps
  each, protection lasted 2.95 seconds on Base and 3.26 on Max protect; against the Overload blitz 1.8 became 3.2 to
  3.3. The extra blockers blocked on about 95% of snaps. Base protection, the computer and the simulations are
  untouched: fingerprint unchanged. Slides still mostly decide WHICH rusher comes free, not how soon. Also looked
  into white rings seen on the field in test stills: they are the tackle effect, which only expires on drawn frames,
  piling up when a test steps the game without drawing. Not a game bug. Checked: a career game calling Max protect
  and slides on every pass (4 and 9 snaps) with no error; careers, exhibition, drills; audit empty at 390x844.

- 2026-11-14 09:00. The owner: "add more customization of character colors and such, add more to social".
  (1) Your look, a folded card on the career hub (`LOOKS`, `lookHtml`, `C.look`): skin tone (five), gloves (twelve,
  or none), cleats (eleven), socks, visor (dark, clear, mirror, team and four colors), facemask, arm bands (or none).
  No yellow in the lists. `hero()` carries it as `x.look`; render3d.js `lookColors` lays it over the team's kit on
  the field and on the card's portrait (`portrait(team, home, num, look)`); the backup who plays your sat-out drives
  wears the team's kit. Drawing only. (2) Social: a weekly post (`socialPost`: thank the fans for followers, hype
  the next game for hype, shout out a teammate for a point of coach trust; your post lands in Mentions with two
  replies), and a Messages tab (`dms`): each week three direct messages about your last game from home, your agent
  and a teammate, and one from your rival in the week you play him. Messages are flavor; the post is the only part
  that changes numbers. Checked: fingerprint unchanged; a look chosen in the hub seen on the field in a close still;
  a whole receiver season with every drive watched; careers, exhibition, drills; audit empty at 320x568 and 390x844
  with the look card open, the composer, and the four Social tabs.

- 2026-11-14 10:00. The owner: "improve more things add more details". Two, drawn only. (1) A towel: a new optional
  body part (`towel` in `PART_DEFS` and `GEO`, on the pelvis, shown through `f.extra` like the caps and hair) and a
  Towel row in Your look (none, white, black, the team's colors, red, blue, pink). The first version sat inside the
  hips and showed as a sliver; it was moved out. Seen on the hub card and on the field. (2) The toe tap: a pass
  coming down within 2.2 yards of a sideline has the receiver get both feet down together on the field side, up on
  his toes with the heels lifted, leaning out over the line (`f.tap`, set in the catch and blended over his stride
  for a third of a second; `PG.r3d.tapOf(i)` reads it). One in a watched game, seen in a still. Also confirmed, with
  nothing to change: the look already follows the player into the walkout scene, since the actor is made from the
  same roster entry. Checked: fingerprint unchanged; gait, tackle, block and both staged catches as before; careers,
  exhibition, drills; audit empty at 320x568 and 390x844 with the longer look card.

- 2026-11-14 11:00. The owner: "add more small details". Five, drawn only. After the whistle (`gesture`, `ps.gest`):
  a made field goal or extra point and the kicker pumps his fist, a miss and his hands go to his helmet ('pump',
  'aw'); an incompletion that was not broken up and the receiver's hands go to his helmet, always on third or fourth
  down and otherwise about one time in seven (`ps.down0`); an ordinary tackle and, six times in ten, the nearest
  teammate turns to the runner, bends and holds a hand down to him ('help', `ge.to`). Before the snap (`poseFor`, the
  stance block): a shotgun quarterback points out a defender as his cadence starts, to a different spot each play,
  and on two snaps in three the middle linebacker spreads his arms to set his front. In four watched games before
  the receiver's share was cut: 45 helping hands, 36 hands on helmets, 7 fist pumps. Checked: fingerprint unchanged;
  gait, tackle, block and the leaping catch as before; a watched game drawn every 10 steps (3,812 frames) with no
  bad pose and no error; careers, exhibition, drills; audit empty at 390x844. Seen as four small stills.

- 2026-11-14 12:00. The owner: "add more small details". Three on the field, drawn only (`render3d.js`). (1) A
  kicking net: two poles and a net 3.6 yards behind each set of uprights (`g.userData.net`), run up only while a
  field goal or extra point is being tried at that end and gone again for the next play. (2) A kickoff tee: an orange
  tee at the kickoff spot with the ball stood up on it, leaning back toward the kicker, instead of lying on the turf.
  (3) A stiff arm with the right hand now has the ball under the left arm (`f.ballL`): it used to be drawn in the
  hand that was fending the man off. The pass already spiralled and a kick already tumbled, so those were left.
  Checked: the net is up for a staged field goal at the right end only and down after it; fingerprint unchanged;
  gait and tackle as before; a watched career game drawn every 10 steps with no error; careers, exhibition, drills;
  audit empty at 390x844 (a first run reported every button "blocked": that was the test's own overlay canvas).

- 2026-11-14 13:00. The owner: "small details add more in places, add cool cut scenes if possible". Two cutscenes
  in every watched game (`SCENES.half`, `SCENES.final` in game.js; cameras in render3d.js `SCENECAM`), skipped like
  the others in simulations, practice and with cutscenes off. Halftime: both teams jog off toward their own ends,
  seen from high in a corner pulling back, the score and who leads on the caption; then the halftime sheet as
  before (`next()` plays it before `showHalf`). The final whistle: the two leaders (you, in a career, and their man
  at your position) walk to midfield and shake hands while the camera comes in from wide; the winners celebrate
  behind their man, the losers turn and walk off, a tie gets applause from both sides; the home crowd cheers a home
  win, and there is confetti when the win at home is yours; then the final screen (`endGame` plays it before
  `G.onEnd` or `showFinal`). Halftime only shows when the half ends on a play you watch: a half that ends inside a
  skipped drive goes straight to the sheet, as before. Checked: both seen in stills (the first handshake still had
  the teammates out of frame, so they were moved in behind their man); fingerprint unchanged; careers, a whole
  quarterback season, exhibition, season mode, drills; audit empty at 390x844 through all four game types. The test
  tab crashed once after that whole batch had finished and reported; a reload ran clean.

- 2026-11-14 14:00. The owner: "apart from cut scenes, what other small details can u add, and apply them". Five,
  drawn only. (1) Long sleeves in the snow: the arms have their own color key now (`arm`, bare skin unless set), and
  in a snow game about three players in five wear white or black sleeves under the jersey. (2) A Sleeves row in Your
  look (none, white, black, the team's colors). (3) Every quarterback wears a play-call wristband on his left forearm
  (`playband`, an optional part like the towel; `gearOf(p)` picks a player's optional gear). (4) The stadium board's
  bottom line now names the big ones while the play is dead (first down, sack, interception, a kick good or no good,
  fumble, safety, turnover on downs, touchback, pass broken up), not only touchdowns. (5) A hit kicks up a few specks
  of turf with the white ring (snow, when it is snowing). Considered and left: eye black (too small behind the
  facemask to place blind), an official's flag on the turf (the owner's no-yellow rule), breath in the cold.
  Checked: sleeves, the wristband and the linebacker's signal seen in a snow-game still; seven kinds of board message
  came up in one watched game; fingerprint unchanged; gait, tackle and block as before; careers, exhibition, drills;
  audit empty at 320x568 with the longer look card.

- 2026-11-14 15:30. The owner: "add a captains patch ... things do feel a bit cluttered and very text like, though i
  don't want it removed i want more interactive ui with more visuals". Read up on hub design first; the advice that
  kept coming back is progressive disclosure: show what matters now, put the rest one tap away, a card a topic.
  Nothing was removed. (1) Captain's patch: a "C" over a star on the right chest (`f.patch`, `patchMaterial`, hidden
  with the shoulder numbers when too small), worn by each side's quarterback and middle linebacker and by you once
  you start (`p.capt` in `setupPlay`). (2) Career hub, next game: the two teams as badges in their colors with record
  and rating under each (`matchupHtml`), replacing the line of text that carried the same numbers; goals have a
  bullet each. (3) The four tabs have a small picture each (`TAB_ICON`, `.itabs`). (4) Standings (league.js
  `standingsHtml`, so Season mode too): your division is open, the rest of your conference and the other conference
  are folded cards, and last week's other scores are a folded grid of score chips with the winner marked. The Season
  tab went from about 3,300 pixels tall to under 900. (5) Your games is a strip of W/L chips; tap one for its score,
  grade and stat line (`schedHtml`). (6) The trust explanation is a folded line with an (i) (`details.inf`), and
  Edit teams, Ask for a trade and Retire are in a folded Career options card (`#hmore`), like Game settings and
  Your look. The test tools open that card before looking for Retire. Checked with every card opened: the three
  career options, four settings groups, nine look rows, eight division tables, fifteen scores and the game chips are
  all still there. Audit: the first run found the chips 40 wide (now 44), 9 and 9.5 pixel labels (now 10), and the
  longer Snap tip touching the play card in camp at 320 (the sentence added for Protect was taken back out); empty
  at 320x568 and 390x844 after. Fingerprint unchanged; careers, a quarterback season, exhibition, season mode, drills.

- 2026-11-14 17:00. The owner, on doing Stats and Social next: "Yes but improve organization don't automatically
  just hide it with a section thing". So this pass lays things out instead of folding them, and three of the folds
  from 15:30 were taken back out. Stats (`tabStats`): this season's numbers are tiles with the career figure under
  each (`.stl`); the games are a chart of grades, wins in the accent color, over a row a game with the grade as a
  badge (`gamesHtml`); every name on the leader board has a bar as a share of the leader (`ldBar`); the trophies have
  a progress bar and the earned ones come first. Social: messages are a conversation with a round avatar a sender
  (`.chat`), the hype bar has its two thresholds marked under it (25 partners stay, 55 offers come), and followers
  are a line over the last weeks (`folTrend`, from `so.hist`, kept from now on, so it appears after two more games).
  Un-folded: the other seven divisions are small cards two across with record and points for and against (`.dvg`),
  last week's scores are an open grid, the trust explanation is two fact chips and a line, and Edit teams, Ask for a
  trade and Retire are a row of three buttons under a Career heading (the trade still asks twice). Still folded,
  as before today: Game settings and Your look. Checked with counts: 8 divisions, 15 scores, 14 trophies, 10 leader
  categories, every game in the log, and the buttons #edt #ret #trade #hset #hlook #play #prac. Audit: one label
  cut at 320 ("Touchdowns" in a tile; the tiles now say TDs, INTs, Completed), empty after at 320x568 and 390x844
  through every tab and Social sub-tab for both positions. Fingerprint unchanged; careers, a receiver season,
  exhibition, season mode, drills.

### Daytime loop, 2026-11-14 (cron job 735d3840, every 30 minutes until 17:30; the owner is at work 9:30 to 5)
The owner at 02:20: "now work on the game non stop ... every like 5 changes check where u are and what needs to be
worked on, dont add new features or such be faithful to madden and nfl and football, just make it better and more
visually better and such, bug test too and make sure good for mobile". No new features or modes. Each change is
numbered below; after every fifth, a stock-take line says what looks weakest and what the next five are.
Queue (first five): 1 a bug-test sweep after the day's hub work (random players, all four game types, both sizes);
2 the main menu, more visual and better organized; 3 the Upgrade tab's abilities as cards with their state shown;
4 Season mode's hub to match the career's (badges, chips, tiles); 5 a mobile check of load size and draw cost.

- Change 1 (02:40), bug sweep: a random test player played 18 career games on six teams (quarterback and receiver),
  choosing looks at random, tapping every hub tab and Social sub-tab, posting, picking schedule chips, pumping,
  sliding, going for it on fourth down and skipping drives at random, drawn every 40 steps, with the ball spot,
  clock, score and every position checked each step. No error, bad number or stuck state. Nothing to fix.
- Change 2 (02:50), the main menu: each mode has a round picture on the left, and a saved career or season shows the
  badge of the team it is with instead; the four small buttons have an icon each (`MENU_ICON`, `menuBadge`). Nothing
  moved or removed. Audit empty at 320x568 and 390x844; fingerprint unchanged.

- Change 3 (03:05), the Upgrade tab's abilities: the three slots are drawn as slots (what is in each, which are open,
  and the overall rating that opens a locked one), and the abilities are cards two across with the equipped ones
  outlined (`tabPerks`, `.slts`, `.pkg`). Equip and unequip work as before. Audit: a slot's name was cut at 320 (it
  wraps now); empty after at 320x568 with all three slots filled for both positions. Fingerprint unchanged.
  Next: 4 Season mode's hub to match the career's; 5 a mobile check of load size and draw cost; then the stock-take.

- 02:45, asked for by the owner, outside the loop's no-new-features rule: "allow multiple careers / saves and
  eventually we will add multiplayer and a global chat". Careers: up to eight on a device (`career.js`: `SLOTS`,
  `stash`, `switchTo`, `dropSave`, `showSaves`). The career being played stays under `pg.career.v1` as before; the
  others wait whole under `pg.career.slot.<id>` with a list of summaries in `pg.career.slots`, so nothing that reads
  or writes the career had to change. The hub's Career row has a Careers button; the screen lists each one (team
  badge, player, rating, where the season stands) with Play or Continue and a two-tap Delete, and New career, which
  puts the current one away instead of replacing it. The new-career screen links back to the list, and the menu's
  Career opens the list when nothing is being played but careers are saved. Erasing or retiring removes that
  career's slot only. Checked: two and three careers made, switched (the first came back with its XP and game log
  intact), one deleted, one erased; the test tools start a new career through the list; fingerprint unchanged;
  careers and exhibition clean; audit empty at 320x568 and 390x844.
  NOT started, for the owner to decide: multiplayer and a global chat. Both need a server that every player's phone
  talks to (the site is static files on GitHub Pages and cannot hold a connection or a message), so they mean
  choosing and paying for a hosted service, accounts or at least names, and for chat, moderation of what strangers
  type. Head to head could instead be two phones linked directly with no server beyond a free relay for the
  handshake. These are his calls; nothing is to be signed up for or connected without him.

- 03:00, the owner on multiplayer and chat: "i'll do that tmr just set it up for that". Set up, not switched on:
  `js/online.js` (loaded last; `PG.online`) holds what does not depend on the service: an online name and id kept on
  the device, the rules for a chat line (plain text, 140 characters, links removed, one every 2.5 seconds), and the
  adapter a service plugs into (`use`, `connect`, `chat.send/on`, `match.host/join/send/on`). It makes no network
  call and has no screen; with no adapter `ready()` is false and sends are refused. Tested with a fake adapter.
  `docs/ONLINE.md` is the decision sheet for him: phone-to-phone head to head (PeerJS 1.5.5 is on cdnjs) against a
  hosted service, the chat services whose libraries are on cdnjs (firebase 13.3.0, ably 2.30.0, pusher 8.6.0; their
  limits and prices were NOT checked), names against sign-in, and moderation. Nothing was signed up for.

- Change 4 (03:20), Season mode's hub, to match the career's: the next game as two team badges with record and
  rating; pictures on the four tabs; the schedule as a row a game (a W or L badge and the score for the ones played,
  the week's number, opponent's rating and record for the ones to come); the team's totals as six tiles with the
  per-game figure under each. Roster and Start over as before. Audit: "Points against" was cut in a tile (the tiles
  say Points, Allowed, Pass yards, Rush yards); empty after at 320x568 and 390x844. Fingerprint unchanged.
  Next: 5 a mobile check of load size and draw cost; then the first stock-take.

- Change 5 (03:30), a mobile check, measured, nothing changed. Load: the page's own files are 1,004 kB, 318 kB
  compressed (game.js 103, render3d.js 69, career.js 42, audio.js 27), plus the library from cdnjs and, after the
  page is up, the 4.2 MB common voice pack. Drawing at 390x844 on this Mac: 117 to 151 draws and about 339,000
  triangles in play (0.7 to 2.2 ms a frame); cutscenes and the kickoff swap in the close-up model and reach 537,000
  triangles at 105 to 178 draws. Triangles at that level are within what current phones draw; the draws were the
  cost and they came down on 2026-11-14. No change made. Not measurable here: a real phone.
- STOCK-TAKE after five (03:35). Done: a clean bug sweep; the main menu, the abilities, and Season mode's hub made
  visual; load and draw cost measured. Also today outside the loop: multiple careers, the online groundwork.
  Weakest now, by eye: (a) the halftime and final sheets are tables of numbers; (b) the play-call sheet and the
  pause and settings screens have not had the visual pass; (c) Exhibition and Season have had no random bug sweep
  since the new cutscenes and the watched kickoffs; (d) the field and stadium have not been looked at in day, dusk,
  rain and snow since the repaint; (e) the close-up model draws all 48 figures in full detail in a cutscene that
  shows six.
  Next five: 6 the halftime and final sheets as side-by-side team bars; 7 a random bug sweep of Exhibition and
  Season (kicks, onside, two-point tries, overtime, cutscenes on and off); 8 Settings and the pause sheet organized
  visually; 9 a look at the field and stadium in each time of day and weather, fixing what looks off; 10 in a
  cutscene, the bench figures drawn with the plain model or not at all.

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
- [x] Run 13, the scoop-and-score: a defender who gets to a loose ball on his feet can pick it up and run it back.
      Still to be judged in play

### Round 14 (the owner at 22:20 on 2026-11-12: "play clock with dekay of game, switching sides and coaches
### challenge, and different celebrations for tocuhdowns, also add a kicking swipe so u can interact when there is
### kicks, so they arent automatic yk")
- [x] The kick swipe: field goals, punts and your kickoffs (which used to go by themselves).
- [x] Play clock with delay of game.
- [x] Coach's challenge.
- [x] More touchdown celebrations.
- [x] Teams switch ends between quarters.

### Round 15 (the owner at 23:05 on 2026-11-12: "add a social media aspect to this, so if u have a good game comments go
### crazy and etc, but a major thing for me is reporters and post media questions and like having good games and trash
### talking other teams, proving to the coah u are good and good compliments etc, be detailed and such")
- [x] Postgame press conference: three situational questions, eight answer tones with fixed effects on coach trust,
  hype and followers, a walk-out option, the coach's verdict on your answers.
- [x] Callouts and guarantees of the next opponent, settled in that game (XP, trust, hype, followers, receipts).
- [x] The reaction feed: fans of both teams, analysts, reporters, teammates, rival, the coach quoted; volume, likes,
  replies, trending and a viral post scale with the game.
- [x] The Social tab in the hub; the callout on the next-game card; the coach's word on your podium answers.
- [x] Media day before a rival game; endorsements as hype pays off; the booth bringing up a callout (automatic run 16).

### Round 19 (the owner at 00:20 on 2026-11-13, after asking where cutscenes could go and being given seven places:
### "everything u gave work one at a time in order")
- [x] Game-day walkout (career).
- [x] Rival face-off before rival games.
- [x] Championship trophy.
- [x] Coin toss at midfield.
- [x] Draft day stage.
- [x] Press conference podium opener.
- [x] Hall of fame induction.

### Round 20 (the owner at 01:05 on 2026-11-13: "show 3 plays at a time and allow easy scrolling for more plays, obv top
### 3 plays are most suggested by coach, make the game icon a lot better, add a better description on github, research a
### lot on football and games for it and see what small details to add ... i really want to work on making the
### animations and models better after all this as well, i want full controller support too and more things to work on
### for the game i want big major additions and such")
- [x] The play-call sheet three at a time, the coach's top three first, swipe, wheel or arrows for more.
- [x] A new game icon (and PNG sizes), the GitHub description and topics, a new README opening.
- [x] Small details from research: the hard count, top speed and completion probability cards, the third-down line,
  the measurement.
- [x] Full controller support (the Gamepad API): the field, the menus, the play-call sheet, the pause dialog.
- [ ] Animations and models: the owner's next priority (see the plan below).
- [ ] The big additions below, in the order the owner picks.

### The plan for animations and models (Round 21, the owner's priority "after all this")
Today a player is about thirty instanced parts (rounded boxes and capsules) posed joint by joint in `render3d.js`.
Ordered by what a phone would notice most:
1. One skinned body per player instead of separate parts: a procedural mesh (torso, arms, legs as one surface) bound to
   a skeleton, so elbows, knees and shoulders bend without seams. three.js `SkinnedMesh` with 18 bones, built in code
   (no downloaded model), and the existing pose vectors drive the bones. Instancing goes; measure the frame rate on a
   phone at 22 players before keeping it.
2. Gait blends by speed: walk, jog, run, sprint and backpedal mixed by velocity, with foot planting (the feet stop
   sliding at any speed, not only the eight sampled ones `PG.r3d.gait` measures).
3. Football-specific motions: three, five and seven step drops, a throwing motion with follow-through, a catch reaching
   for the ball (high point, diving, a toe tap at the sideline), stances for linemen and receivers, a form tackle as a
   paired animation (tackler and runner keyed to each other), a stiff arm that reaches. Done (02:06 on 2026-11-13): the
   high point (a leap for a contested ball, the defender going up too) and the stretch for a ball off his line.
4. Equipment detail: facemask bars, helmet decals and numbers, visors, sleeves, gloves, towels, cleats; jersey cloth
   shading (a normal map made in a shader), grass stains as a game goes on.
5. Faces and hair under the helmet in close-ups and cutscenes (the cutscenes already show hair and a cap).

### Big additions to choose from (Round 22 and on)
- Pre-snap motion: jet and orbit motion and shifts, routes built from where the man is at the snap.
- Franchise mode: run a whole team (roster, contracts, the draft, free agency, the depth chart) for seasons.
- Two players on one device (or two phones over a peer-to-peer connection), head to head.
- Create a play: draw routes on the card art, keep your own book.
- Practice mode open to players: pick a play and a coverage, run it as often as you like (the play lab, with a field).
- A living league: every player progresses and ages, injuries, weekly awards, a scores ticker, a halftime show.
- Stadiums with their own look per team (roof, end zone art, colors), weather by city.
- Difficulty sliders (pass coverage, AI accuracy, fatigue) and remappable controller buttons.

### Round 24 (the owner at 02:35 on 2026-11-13, going to sleep: "i need it to be in career mode as well since that's the
### main mode here / loop and keep improving and adding more and optimizing and more small details until 10am, keep going
### even if usage finishes / before i go to sleep though, please add as much as u can from the nfl and madden if possible")
Career mode is the main mode: every item below is built for a career first. Original names only (no league, team or
game marks; "primetime", "Player of the Week" and the like are plain words, not marks).
- [x] Primetime games, Player of the Week, career highs on the broadcast, scores around the league at quarter breaks,
  the team editor from the career hub and the new-career screen (02:40, by hand before the loop).
- [ ] The rest is in "Next ideas", NFL and Madden first.

### Next ideas (nothing here is started; the automatic loop works from the top)
NFL and Madden, for a career first (Round 24), biggest that fits a run first:
- Injuries, the rest (the career side and shaken-up ball carriers are done, 09:19): the trainers drawn running out and
  the man walked off (a short cutscene), the cart for the worst, and a career player's own
  in-game knock (sit a series).
- An all-star game after the season for the best players of each conference (you, when you are one): a playable
  exhibition with its own presentation.
- A record book: league single-game and season records; the booth and a card when one falls.
- A roof drawn over the eleven roofed stadiums (data.js `clim: 'dome'`, `env.roof`): the sky and the light towers give
  way to a dome and a ring of lights. The weather side is done (02:55).
- Optimization, the rest (the voice packs and the lettering draws are done, 2026-11-14): the common voice pack is
  still one 4.2 MB fetch (the analyst's lines are 1 MB of it and could come second); the 48 figures' lettering could
  be one instanced draw from an atlas; measure on a real phone.
Animations and models, the owner's priority (the Round 21 plan above), one piece a run:
- Done 2026-11-14: the quarterback's counted drop and set, and a stiff arm that reaches. Next the toe tap at the
  sideline, the form tackle as a paired animation, facemask bars and helmet numbers; the skinned body last, as its own project.
  Each piece is checked with a staged test hook and a strip, like `catchTest` and `catchStrip`.
- The voices, after the owner has listened to Round 11's (he said at 19:15 "work on improving the voices"; how they
  sound now is still unjudged). If they are still too calm, the next step is a more expressive open speech model with
  an excitement control: a multi-gigabyte download, which needs his say-so first. Voices are lines in
  `tools/commentary.json`; the whole booth re-records in about six minutes.
- More booth lines: the score read out at the half and the end. Not done in run 7 on purpose: the natural way, "The
  Outlaws fourteen, the Aviators seven", is a clip for every team and score (about 370 more clips, 3 MB), and
  joining single numbers sounds like a machine. Worth it only if the owner wants it.
- The pile, the rest (measured again in run 18 with `PG.r3d.beside(a, b, {off, at})` over the 156 stagings): while
  defenders dive on (0.6 s) 14 of 156 have more than 10 cm of one man inside another, 7 at 0.8 s, none at 1.0 s; and
  as the runner gets up (1.15 to 1.5 s) a few men standing 2.3 yd off end up inside him, up to 33 cm (the clearance
  stops once a body's fall drops under 0.3, so a standing man is no longer pushed). The top man also lies a little
  stiff and flat. Not taken in run 18: the fix is inside the pile solver and could not be finished and checked in one
  run.
Interface, when no major item fits in a run:
- Run `tools/audit.js` after every change and keep its report empty.
- A person on a real phone still has to judge touch feel, the frame rate with close-up models, and the sound.
- The on-field receiver letters and the drag ring are drawn on the canvas, so the audit cannot see them: check their
  size and contrast by hand in day, dusk, night, rain and snow.
- Settings could show what each graphics option costs; the play-call sheet could remember the last tab per down.
