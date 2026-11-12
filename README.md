# Pocket Gridiron

An 11-on-11 football game for portrait phones. Plain HTML, CSS and JavaScript, no build step and no dependencies.

**Play it:** https://eddyarriaga00.github.io/pocket-gridiron/

## Modes

- **Career** (the main focus). Create one player (QB, RB, WR, LB or CB), pick a build, get drafted, and play only that player's snaps. The coach calls the plays, drives your unit is not on the field for are simulated, and you earn XP from stats and per-game goals to raise your ratings. Seven-week season, four-team playoff, then the next season. Progress saves in the browser.
- **Exhibition.** Pick two teams and control the whole roster: call plays, pass to lettered receivers, switch defenders, kick.

## Controls

| | Touch | Keyboard |
|---|---|---|
| Move | Drag anywhere on the field | Arrows / WASD |
| Snap, ready, kick | Big gold button | Space |
| Pass (as QB) | Tap a lettered receiver or its button | 1–5 |
| Call for the ball (career WR/RB) | Call | C |
| Sprint | Hold Sprint | Shift |
| Juke / spin | Juke, Spin | J / K |
| Switch / dive (defense) | Switch, Dive | Q / E |
| Pause | II | P or Esc |

## Project layout

```
index.html              page shell (GitHub Pages entry)
css/game.css            all styles
js/game.js              engine, rendering, exhibition UI, player-lock controls, drive simulation
js/career.js            career mode: save data, league, XP, hub screens
manifest.webmanifest    install-to-home-screen metadata
icons/                  app icons
tools/icons.py          regenerates the PNG icons
tools/bundle.py         inlines everything into one pocket-gridiron.html
```

## Run locally

```
python3 -m http.server 8000
```

Then open http://localhost:8000. Any static file server works.

## Testing hooks

`PG.dbg` in the browser console exposes the live game state and a `step(dt)` function, and `PG.dbg.auto(true)` makes the computer play both sides, which is how the balance numbers are checked.
