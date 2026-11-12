# Pocket Gridiron roadmap

Working plan for the overnight build session that started 2026-11-12 around 02:45 EST. The owner asked for
continuous work while asleep: much better player models, really good sound, animation, optimization, cleaner
formatting, and a full, interactive game experience. This file is the source of truth for what is done and
what is next. Update it after every item.

## Ground rules

- **Branch:** all work goes on `ui-refresh`. Never merge into `main`, never push `main`, never change the
  live GitHub Pages site. Going live is the owner's decision (pending; ask again in the morning summary).
- **After each item:** test, `python3 tools/bundle.py`, commit, `git push origin ui-refresh`, republish
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

1. Preview server: `.claude/launch.json` has a config named `game` (python http.server on 48231). It is
   gitignored; recreate it if missing. Start it with the preview tool, open
   `http://localhost:48231/index.html`, set the mobile viewport (375x812).
2. Load the harness in the page: `await fetch('tools/harness.js').then(r=>r.text()).then(t=>(0,eval)(t))`
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
- `js/game.js` engine (plays, AI, rules), 2D renderer, HUD, menus, exhibition, player-lock controls,
  drive simulation. Exposes `window.PG`. `PG.dbg` has `auto(v)`, `step(dt)`, `G`, `ps`, `P`.
- `js/career.js` career mode: save (`localStorage` key `pg.career.v1`), league, XP, hub screens.
- Coordinates are yards. x 0..53.33 across, y 0..100 between goal lines, end zones to -10 and 110.
  Team 0 is the user and attacks +y. `G` is game state, `ps` the current play, `P` the 22 players.
- Planned: `js/audio.js` (sound engine, `PG.audio`), `js/render3d.js` (three.js renderer, `PG.r3d`), with
  the existing canvas kept on top as a transparent overlay for markers, letters and the joystick.

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
- [ ] Later: between-play cadence, ball bounce, footsteps, announcer voice

### 3. 3D renderer
- [x] three.js scene (`js/render3d.js`) behind a Graphics setting, automatic fallback to 2D when WebGL or the library is unavailable
- [x] Field texture (stripes, lines, hashes, numbers, end zones, midfield logo), goal posts, pylons, first-down marker
- [x] Stadium: two decks of crowd, ribbon boards with team names, light towers with glow, benches, sideline figures
- [x] Camera matched to the portrait framing (fov 76, 24 yd high, 40 back); overlay canvas projects through the 3D camera
- [ ] Polish: calmer crowd texture (moire at distance), scoreboard, menu camera path

### 4. Player models and animation
- [x] Procedural low-poly rig: helmet with stripe, visor and facemask, pads, jersey numbers front and back, arms, legs, shoes.
      Every body part is an InstancedMesh (13 draw calls for all figures). Ball model with stripes and laces.
- [x] Poses: line, under-center, two-point and wide stances; run cycle; backpedal with eyes on the quarterback; pocket carry;
      tucked carry; throw; catch reach; block; dive; stumble; fall; celebration and heads-down
- [x] Blob shadows, user ring, pass target ring in 3D
- [ ] Verify fall and celebration close up; kicker leg swing; jog to the line; referee

### 5. Game feel
- [ ] Break-the-huddle jog to formation, snap and handoff motion
- [ ] Ball bounces on incompletions; spiral in flight
- [ ] Instant replay of touchdowns from a second camera
- [ ] Referee signals, scoreboard in the stadium

### 6. Gameplay
- [ ] Live kickoffs and returns (exhibition), touchbacks
- [ ] Lob and bullet passes (hold vs tap)
- [ ] Computer quarterback tuning: more completions, some sacks
- [ ] Penalties and fumbles (rare), timeouts

### 7. Career depth
- [ ] Abilities: unlock slots at 74, 80, 87 overall; pick from four per position
- [ ] Weekly practice drill for bonus XP
- [ ] Game grades, headlines, season awards
- [ ] In-game stat chip and goals in the pause menu
- [ ] More action for defenders

### 8. UX
- [ ] First-time tips for each control context
- [ ] Settings screen: graphics, camera, sound, music, accent
- [ ] Auto-pause when the app is hidden
- [ ] Halftime and final presentation

### 9. Optimization
- [ ] Measure FPS; cap pixel ratio; merge or instance meshes if draw calls are the limit
- [ ] Fixed-timestep simulation; remove per-frame allocations
- [ ] Lazy work: skip rendering hidden screens

### 10. Code quality
- [ ] Split `game.js` into readable modules with normal formatting
- [ ] README update (controls, modes, layout, libraries)

### Stretch
- [ ] Weather and time of day, announcer voice, achievements, offline install

## Log

- 02:45 Session start. State: `ui-refresh` has the UI refresh (fdf47ef), `main` is the live site with the
  older look. Auto-resume job created. Roadmap and harness written.

- 03:15 Sound engine done. Levels checked offline with `PG.audio.measure(name)` (peak / RMS dBFS): whistle -13/-26,
  hit -8/-30, horn -8/-22, fanfare -9/-24, music -4/-22, crowd bed -35 (quiet) to -29 (loud), big cheer -19.
  Nobody has listened to it yet: levels are verified, taste is not.

- 03:50 3D renderer and player models in. 95 draw calls, 131k triangles, 0.9 ms CPU per frame on the dev machine.
  `PG.r3d.debugCam = {pos:[x,h,-y], look:[x,h,-y]}` pins the camera for close-up screenshots; `PG.dbg.render()` forces a frame.
  `H.sim(6,120)`: 4.7 ypc, 59% completions, 2.1% INT, 24 pts/game, no errors.

## Morning hand-off

- Ask the owner whether to merge `ui-refresh` into `main` and deploy.
- List what changed, what was verified and how, and what is still rough.
