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
- [ ] Career: a coach who reacts to your last game in the hub, and a rival player at your position to chase on the leaders board
- [ ] Season mode: roster screen with names and ratings, and stat leaders
- [ ] Holding and pass interference, with a Settings switch for penalties
- [ ] Menu: a slow camera path around the stadium and a 3D preview of your team's uniform on the team picker
- [ ] Career difficulty: measure with scripted seasons and tune so an average player wins about half

### Next ideas (nothing here is started)
- Listen to the sound on a real device and tune it: nobody has heard the mix or the announcer yet.
- Play on a real phone: touch feel, frame rate with shadows and the glow pass on, button reach with five buttons on the pad.
- More penalties (holding, pass interference); a real loose-ball scramble instead of an instant recovery.
- Career: contracts and salary, rivalries, a coach who talks to you between games.
- Run cycle with foot planting; tackle animations that involve both players.
- Achievements outside Career.
