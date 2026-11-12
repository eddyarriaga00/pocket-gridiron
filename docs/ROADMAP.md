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
- **No questions.** The owner is asleep. Decide, note the decision in the log, keep going.
- **Taste (stated by the owner):** no yellow or gold anywhere; no condensed italic display type (Archivo,
  upright, is the display face); small controls (54px actions, 70px snap, 50px receiver buttons).
- **Original game.** No real league, team, player or video game names, logos or likenesses.
- **Assets:** procedural only. Do not download audio, models, textures or fonts. Libraries only from
  cdnjs, pinned to an exact version (three.js 0.159.0 is confirmed available at
  `https://cdnjs.cloudflare.com/ajax/libs/three.js/0.159.0/three.min.js`).
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
   - `H.career('QB',2)`, and RB, WR, LB, CB. `errs` empty, stats non-zero.
   - `H.camp('pass',4)`, and 'run', 'tackle': a training-camp drill played by a simple test player. `errs` empty.
   - `await H.fps(3)` with the pane visible, during a live play. Target 55+ in the pane.
4. Screenshot the menu, a pre-snap view, a live play, the career hub. Synchronous stepping does not repaint,
   so wait a second before a screenshot.
5. Console: no errors.

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

### Next ideas (nothing here is started)
- Listen to the sound on a real device and tune it: nobody has heard the mix or the announcer yet.
- Play on a real phone: touch feel, frame rate with shadows and the glow pass on, button reach with five buttons on the pad.
- More penalties (holding, pass interference); a real loose-ball scramble instead of an instant recovery.
- Career: contracts and salary, rivalries, a coach who talks to you between games.
- Run cycle with foot planting; tackle animations that involve both players.
- Achievements outside Career.
