/* Pocket Gridiron: the data tables. Teams, formations, routes and both playbooks.
   Loaded before game.js, which reads everything from PG.data. Nothing in here has behaviour. */
(() => {
  'use strict';

  /* The league. c1 is the helmet and jersey color, c2 the trim; ovr is the starting team rating. All fictional. */
  const TEAMS = [
    { city: 'Austin', name: 'Outlaws', ab: 'ATX', c1: '#b4371f', c2: '#f4e9d0', ovr: 88 },
    { city: 'Portland', name: 'Lumberjacks', ab: 'PDX', c1: '#1f6b3a', c2: '#f2f2f2', ovr: 85 },
    { city: 'Omaha', name: 'Thunder', ab: 'OMA', c1: '#4634a8', c2: '#d9d4f7', ovr: 83 },
    { city: 'Salt Lake', name: 'Summit', ab: 'SLC', c1: '#0e7490', c2: '#ffffff', ovr: 86 },
    { city: 'Orlando', name: 'Comets', ab: 'ORL', c1: '#e07a10', c2: '#1b1b3a', ovr: 82 },
    { city: 'St. Louis', name: 'Aviators', ab: 'STL', c1: '#1e3a8a', c2: '#d1d5db', ovr: 90 },
    { city: 'Honolulu', name: 'Tide', ab: 'HNL', c1: '#0f766e', c2: '#ffb59e', ovr: 80 },
    { city: 'Brooklyn', name: 'Knights', ab: 'BKN', c1: '#27272a', c2: '#c3cad6', ovr: 87 }];

  /* surnames for generated players */
  const SUR = ['Carter', 'Reyes', 'Okafor', 'Lindqvist', 'Tran', 'Baptiste', 'Mendez', 'Holloway', 'Park', 'Achebe', 'Sullivan', 'Vega', 'Kowalski', 'Brooks', 'Nakamura', 'Diaz', 'Freeman', 'Petrov', 'Haddad', 'Whitaker', 'Osei', 'Marsh', 'Castillo', 'Rhodes', 'Ibarra', 'Quinn', 'Dalton', 'Singh', 'Moreau', 'Tucker'];

  /* roster slots: the five linemen, then every offensive and defensive role the engine knows */
  const OLR = ['LT', 'LG', 'C', 'RG', 'RT'], OLX = { LT: -3, LG: -1.5, C: 0, RG: 1.5, RT: 3 };
  const OFFR = ['QB', 'RB', 'FB', 'TE', 'X', 'Z', 'S', 'S2', ...OLR];
  const DEFR = ['DE1', 'DT1', 'DT2', 'DE2', 'OLB1', 'MLB', 'OLB2', 'CB1', 'CB2', 'FS', 'SS'];

  /* top speed in yards per second for an 80-rated player at each position, and the jersey number ranges */
  const BASE = { QB: 7.3, RB: 8.7, FB: 7.5, TE: 8.0, X: 9.0, Z: 9.0, S: 8.9, LT: 5.6, LG: 5.6, C: 5.6, RG: 5.6, RT: 5.6, DE: 7.2, DT: 6.3, OLB: 8.1, MLB: 8.0, CB: 9.0, FS: 8.8, SS: 8.7 };
  const NUM = { QB: [1, 19], RB: [20, 39], FB: [40, 49], TE: [80, 89], X: [10, 19], Z: [80, 89], S: [10, 19], DE: [90, 99], DT: [90, 99], OLB: [50, 59], MLB: [50, 59], CB: [20, 39], FS: [20, 39], SS: [20, 39] };

  /* formations: where each role lines up, as [yards right of the ball, yards behind the line] */
  const FORM = {
    single: { QB: [0, -1.6], RB: [0, -6.5], TE: [4.6, -0.6], X: [-14, -0.6], Z: [14, -0.6], S: [-8.5, -1.4] },
    gun: { QB: [0, -5], RB: [1.9, -5], X: [-14, -0.6], Z: [14, -0.6], S: [-8.5, -1.4], S2: [8.5, -1.4] },
    iform: { QB: [0, -1.6], FB: [0, -4.5], RB: [0, -7], TE: [4.6, -0.6], X: [-14, -0.6], Z: [14, -0.6] } };
  const FNAME = { single: 'Singleback', gun: 'Shotgun', iform: 'I-Form' };

  /* Routes as waypoints [across, upfield] from the receiver's spot. Across is mirrored for the left side unless abs is set;
     stop means the receiver settles at the last point. */
  const ROUTES = {
    go: { p: [[0, 45]] }, slant: { p: [[0, 2.5], [9, 11]] }, out: { p: [[0, 9], [-9, 9.6]] }, in: { p: [[0, 11], [16, 11.6]] },
    post: { p: [[0, 12], [9, 32]] }, corner: { p: [[0, 11], [-8, 26]] }, curl: { p: [[0, 12], [0.8, 10.5]], stop: 1 },
    hitch: { p: [[0, 6], [0.6, 5]], stop: 1 }, drag: { p: [[0, 2], [22, 4.5]] },
    flatL: { p: [[-5, 1], [-12, 3]], abs: 1, stop: 1 }, flatR: { p: [[5, 1], [12, 3]], abs: 1, stop: 1 },
    screenL: { p: [[-3, -1.5], [-9, -0.5]], abs: 1, stop: 1 }, screenR: { p: [[3, -1.5], [9, -0.5]], abs: 1, stop: 1 } };
  const RNAME = { go: 'go', slant: 'slant', out: 'out', in: 'dig', post: 'post', corner: 'corner', curl: 'curl', hitch: 'hitch', drag: 'drag', flatL: 'flat', flatR: 'flat', screenL: 'screen', screenR: 'screen' };

  /* The offensive playbook. cat groups plays on the call screen, f is the formation, r the routes by role,
     run the ball carrier's path (fast: he goes at once; toss: the ball is pitched to him early; push: how hard the line drives its men
     back, 0.9 when not given; short: the computer only calls it with two yards or less to go),
     pa a play-action fake, roll how far the quarterback rolls out, quick a play that resolves without a snap. */
  const OFF = [
    { n: 'Inside Zone', cat: 'run', f: 'single', run: { who: 'RB', path: [[0.8, -1], [1, 4]], push: 1.95 } },
    { n: 'Off Tackle', cat: 'run', f: 'iform', run: { who: 'RB', path: [[2.2, -3], [2.7, 3]], push: 2.1 } },
    { n: 'Toss Sweep', cat: 'run', f: 'iform', run: { who: 'RB', path: [[-7, -5.5], [-12, 2]], toss: 1 } },
    { n: 'HB Draw', cat: 'run', f: 'gun', run: { who: 'RB', path: [[0, -3], [-1, 4]], delay: .6 }, r: { X: 'go', Z: 'go', S: 'go', S2: 'go' } },
    { n: 'QB Draw', cat: 'run', f: 'gun', run: { who: 'QB', path: [[0, -6], [1, 4]], push: 2.0 }, r: { X: 'go', Z: 'go' } },
    { n: 'Counter', cat: 'run', f: 'iform', run: { who: 'RB', path: [[1.2, -6], [-2.2, -3], [-2.7, 3]], push: 1.9 } },
    { n: 'QB Sneak', cat: 'run', f: 'single', d: 'Short yardage', short: 1, run: { who: 'QB', path: [[0, 0.5], [0.4, 3]], fast: 1, push: 2.6 } },
    /* run-pass options: the back and the quarterback meet with the ball between them for a second. Throw to a lettered
       receiver in that second, or do nothing and the back takes it. rpo marks them; the computer never calls them. */
    { n: 'RPO Slant', cat: 'rpo', f: 'gun', rpo: 1, d: 'Shotgun · throw or hand off', run: { who: 'RB', path: [[0.8, -3.3], [0.6, -1], [1, 4]], push: 2.1 }, r: { X: 'slant', Z: 'slant' } },
    { n: 'RPO Bubble', cat: 'rpo', f: 'gun', rpo: 1, d: 'Shotgun · throw or hand off', run: { who: 'RB', path: [[-0.8, -3.3], [-0.8, -1], [-1.2, 4]], push: 2.1 }, r: { S2: 'flatR', X: 'slant' } },
    { n: 'Slants', cat: 'short', f: 'gun', r: { X: 'slant', Z: 'slant', S: 'out', S2: 'drag', RB: 'flatR' } },
    { n: 'Curl Flat', cat: 'short', f: 'single', r: { X: 'curl', Z: 'curl', S: 'in', TE: 'out', RB: 'flatL' } },
    { n: 'Mesh', cat: 'short', f: 'gun', r: { S: 'drag', S2: 'drag', X: 'post', Z: 'corner', RB: 'flatR' } },
    { n: 'Stick', cat: 'short', f: 'single', r: { TE: 'hitch', Z: 'go', X: 'slant', S: 'out', RB: 'flatR' } },
    { n: 'HB Screen', cat: 'short', f: 'gun', d: 'Shotgun · screen', r: { RB: 'screenL', X: 'go', Z: 'go', S: 'go', S2: 'drag' } },
    { n: 'Bootleg', cat: 'short', f: 'single', pa: 1, roll: 7, d: 'Singleback · roll out', r: { TE: 'out', Z: 'corner', X: 'drag', S: 'in' } },
    { n: 'Four Verticals', cat: 'deep', f: 'gun', r: { X: 'go', Z: 'go', S: 'go', S2: 'go', RB: 'flatL' } },
    { n: 'PA Post', cat: 'deep', f: 'iform', pa: 1, d: 'I-Form · PA', r: { X: 'post', Z: 'go', TE: 'in', FB: 'flatR' } },
    { n: 'Smash', cat: 'deep', f: 'gun', r: { X: 'hitch', S: 'corner', Z: 'hitch', S2: 'corner' } },
    { n: 'Dagger', cat: 'deep', f: 'gun', r: { S: 'go', X: 'in', Z: 'post', S2: 'drag', RB: 'flatR' } },
    { n: 'Field Goal', cat: 'special', f: 'iform', d: '3 points' },
    { n: 'Punt', cat: 'special', f: 'iform', d: 'Flip the field' },
    { n: 'QB Kneel', cat: 'special', f: 'iform', d: 'Burn 40 seconds', quick: 'kneel' },
    { n: 'Spike', cat: 'special', f: 'gun', d: 'Stop the clock', quick: 'spike' }];

  /* The defensive playbook: where each defender lines up, then per call a zone to drop to (Z), 'man' or 'rush'. */
  const DPOS = { DE1: [-4.6, 1], DT1: [-1.5, 1], DT2: [1.5, 1], DE2: [4.6, 1], OLB1: [-5.5, 4.5], MLB: [0, 4.5], OLB2: [5.5, 4.5], CB1: [-14, 6.5], CB2: [14, 6.5], FS: [-6, 13], SS: [6, 12] };
  const Z = (x, y, deep) => ({ z: [x, y], deep });
  const DEF = [
    { n: 'Cover 2', d: 'Zone · rush 4', a: { OLB1: Z(-9, 8), MLB: Z(0, 10), OLB2: Z(9, 8), CB1: Z(-17, 5), CB2: Z(17, 5), FS: Z(-11, 19, 1), SS: Z(11, 19, 1) } },
    { n: 'Cover 3', d: 'Zone · rush 4', a: { CB1: Z(-17, 19, 1), CB2: Z(17, 19, 1), FS: Z(0, 21, 1), SS: Z(14, 5), OLB1: Z(-14, 5), MLB: Z(-4, 9), OLB2: Z(5, 9) } },
    { n: 'Cover 1 Man', d: 'Man · rush 4', a: { CB1: 'man', CB2: 'man', SS: 'man', OLB1: 'man', OLB2: 'man', MLB: Z(0, 7), FS: Z(0, 20, 1) } },
    { n: 'Man Blitz', d: 'Man · rush 6', a: { CB1: 'man', CB2: 'man', SS: 'man', OLB1: 'man', FS: 'man', OLB2: 'rush', MLB: 'rush' } },
    { n: 'Zone Blitz', d: 'Zone · rush 5', a: { OLB1: 'rush', MLB: Z(0, 8), OLB2: Z(10, 6), SS: Z(-10, 6), CB1: Z(-17, 19, 1), CB2: Z(17, 19, 1), FS: Z(0, 21, 1) } },
    { n: 'Cover 4', d: 'Deep zone · rush 4', a: { CB1: Z(-17, 20, 1), CB2: Z(17, 20, 1), FS: Z(-6, 22, 1), SS: Z(6, 22, 1), OLB1: Z(-10, 7), MLB: Z(0, 8), OLB2: Z(10, 7) } },
    { n: 'Goal Line', d: 'Run stop · rush 6', a: { OLB1: 'rush', OLB2: 'rush', MLB: Z(0, 3), SS: Z(5, 3), FS: Z(-5, 3), CB1: 'man', CB2: 'man' } },
    { n: 'Prevent', d: 'Deep zone · rush 4', a: { CB1: Z(-16, 25, 1), CB2: Z(16, 25, 1), FS: Z(-5, 28, 1), SS: Z(5, 28, 1), OLB1: Z(-10, 14), MLB: Z(0, 15), OLB2: Z(10, 14) } }];

  /* receiver button colors (no yellow, by request) and down names */
  const LCOL = ['#ff6b6b', '#ff9a3d', '#51e08a', '#4dabf7', '#d59bff'];
  const ORD = ['1st', '2nd', '3rd', '4th'];

  window.PG = { data: { TEAMS, SUR, OLR, OLX, OFFR, DEFR, BASE, NUM, FORM, FNAME, ROUTES, RNAME, OFF, DPOS, DEF, LCOL, ORD } };
})();
