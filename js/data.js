/* Pocket Gridiron: the data tables. Teams, formations, routes and both playbooks.
   Loaded before game.js, which reads everything from PG.data. Nothing in here has behaviour. */
(() => {
  'use strict';

  /* The league: a team in each of the 32 cities of American pro football, aligned in two conferences of four divisions
     the way the real league is, by city. The nicknames and colors are this game's own (no real league's names, marks
     or color schemes); anyone can rename a team on their own device (Settings, Teams). c1 is the helmet and jersey
     color, c2 the trim; ovr the starting team rating; conf 0 is the Union Conference, 1 the Frontier Conference; div
     0-3 East, North, South, West; style the offense it runs (STYLES below). vo is the key of its recorded calls in the
     booth's script: the first eight kept theirs when they moved from Austin, Portland, Omaha, Salt Lake, Orlando,
     St. Louis, Honolulu and Brooklyn (the booth only ever said the nickname). Their order is the order saves use, so
     a team keeps its place in the list for good. */
  const T = (city, name, ab, c1, c2, ovr, conf, div, style, vo) => ({ city, name, ab, c1, c2, ovr, conf, div, style, vo: vo || ab });
  const TEAMS = [
    T('Dallas', 'Outlaws', 'DAL', '#b4371f', '#f4e9d0', 88, 1, 0, 0, 'ATX'),
    T('Green Bay', 'Lumberjacks', 'GB', '#1f6b3a', '#f2f2f2', 85, 1, 1, 1, 'PDX'),
    T('Tennessee', 'Thunder', 'TEN', '#4634a8', '#d9d4f7', 83, 0, 2, 2, 'OMA'),
    T('Seattle', 'Summit', 'SEA', '#0e7490', '#ffffff', 86, 1, 3, 3, 'SLC'),
    T('Jacksonville', 'Comets', 'JAX', '#e07a10', '#1b1b3a', 82, 0, 2, 4, 'ORL'),
    T('New Jersey', 'Aviators', 'NJ', '#1e3a8a', '#d1d5db', 90, 0, 0, 5, 'STL'),
    T('Miami', 'Tide', 'MIA', '#0f766e', '#ffb59e', 80, 0, 0, 6, 'HNL'),
    T('New York', 'Knights', 'NYK', '#27272a', '#c3cad6', 87, 1, 0, 7, 'BKN'),
    T('Buffalo', 'Blizzard', 'BUF', '#2563eb', '#e0ecff', 86, 0, 0, 1),
    T('New England', 'Ironsides', 'NE', '#4b5563', '#e5e7eb', 84, 0, 0, 7),
    T('Baltimore', 'Admirals', 'BAL', '#312e81', '#c7d2fe', 88, 0, 1, 2),
    T('Cincinnati', 'Riverboats', 'CIN', '#0369a1', '#e0f2fe', 82, 0, 1, 5),
    T('Cleveland', 'Foundry', 'CLE', '#7f1d1d', '#fca5a5', 79, 0, 1, 1),
    T('Pittsburgh', 'Inclines', 'PIT', '#111827', '#93c5fd', 85, 0, 1, 1),
    T('Houston', 'Wildcatters', 'HOU', '#7c2d12', '#fdba74', 83, 0, 2, 4),
    T('Indianapolis', 'Express', 'IND', '#be123c', '#ffe4e6', 81, 0, 2, 3),
    T('Denver', 'Highlanders', 'DEN', '#14532d', '#bbf7d0', 84, 0, 3, 3),
    T('Kansas City', 'Blaze', 'KC', '#dc2626', '#1f2937', 91, 0, 3, 4),
    T('Las Vegas', 'Neon', 'LV', '#db2777', '#0f172a', 80, 0, 3, 5),
    T('Hollywood', 'Headliners', 'HOL', '#1e1b4b', '#f0abfc', 78, 0, 3, 0),
    T('Philadelphia', 'Founders', 'PHI', '#1d4ed8', '#dbeafe', 89, 1, 0, 2),
    T('Washington', 'Statesmen', 'WAS', '#334155', '#e2e8f0', 79, 1, 0, 7),
    T('Chicago', 'Gales', 'CHI', '#1f3a5f', '#93c5fd', 82, 1, 1, 7),
    T('Detroit', 'Engines', 'DET', '#9a3412', '#e7e5e4', 87, 1, 1, 1),
    T('Minnesota', 'Voyageurs', 'MIN', '#115e59', '#ccfbf1', 84, 1, 1, 3),
    T('Atlanta', 'Firebirds', 'ATL', '#9f1239', '#fecdd3', 81, 1, 2, 4),
    T('Carolina', 'Pines', 'CAR', '#4d7c0f', '#ecfccb', 78, 1, 2, 7),
    T('New Orleans', 'Krewe', 'NO', '#6d28d9', '#ede9fe', 83, 1, 2, 0),
    T('Tampa Bay', 'Manatees', 'TB', '#0ea5e9', '#f0f9ff', 82, 1, 2, 5),
    T('Arizona', 'Scorpions', 'ARI', '#c2410c', '#ffedd5', 80, 1, 3, 0),
    T('Los Angeles', 'Surf', 'LA', '#e11d48', '#fff1f2', 86, 1, 3, 6),
    T('San Francisco', 'Fog', 'SF', '#64748b', '#f1f5f9', 89, 1, 3, 3)];
  const CONF = ['Union', 'Frontier'], DIV = ['East', 'North', 'South', 'West'];
  /* Each city's weather. dome: a roof (domed, retractable or covered), so no rain or snow; snow: a cold-weather city,
     snow likely late in the season; wet: rain more than most, snow now and then late; warm: rain sometimes, never snow. */
  const CLIM = { ATL: 'dome', DET: 'dome', MIN: 'dome', NO: 'dome', IND: 'dome', LV: 'dome', HOU: 'dome', ARI: 'dome', DAL: 'dome', LA: 'dome', HOL: 'dome',
    GB: 'snow', BUF: 'snow', CHI: 'snow', CLE: 'snow', PIT: 'snow', DEN: 'snow', KC: 'snow', NE: 'snow', NJ: 'snow', NYK: 'snow', PHI: 'snow', CIN: 'snow', BAL: 'snow',
    SEA: 'wet', SF: 'wet', WAS: 'wet', TEN: 'wet', CAR: 'wet', MIA: 'warm', TB: 'warm', JAX: 'warm' };
  for (const t of TEAMS) t.clim = CLIM[t.ab] || 'wet';

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
    iform: { QB: [0, -1.6], FB: [0, -4.5], RB: [0, -7], TE: [4.6, -0.6], X: [-14, -0.6], Z: [14, -0.6] },
    /* three receivers to one side, the tight end inline among them, X alone on the other */
    trips: { QB: [0, -5], RB: [-1.9, -5], TE: [4.6, -0.6], S2: [9.5, -1.4], Z: [15, -0.6], X: [-14, -0.6] },
    /* nobody behind the quarterback: the back split out as a fifth receiver */
    empty: { QB: [0, -5], X: [-15, -0.6], S: [-9.5, -1.4], RB: [-4.6, -1.4], S2: [9, -1.4], Z: [15, -0.6] },
    /* the quarterback four yards back, the back straight behind him */
    pistol: { QB: [0, -4], RB: [0, -6.8], TE: [4.6, -0.6], X: [-14, -0.6], Z: [14, -0.6], S: [-8.5, -1.4] },
    /* three receivers stacked tight together, so they cross and rub at the snap */
    bunch: { QB: [0, -5], RB: [-1.9, -5], X: [-14, -0.6], Z: [9.5, -0.6], S: [8, -1.9], S2: [11, -1.9] },
    /* short yardage: two tight ends (the slot man lines up as the second), a fullback, X in tight */
    heavy: { QB: [0, -1.6], FB: [0, -4.3], RB: [0, -6.8], TE: [4.6, -0.6], S: [-4.6, -0.6], X: [-11, -0.6] },
    /* X moves inside to the slot, the slot man goes outside */
    slot: { QB: [0, -5], RB: [1.9, -5], S: [-15, -0.6], X: [-9, -1.4], TE: [4.6, -0.6], Z: [14, -0.6] } };
  const FNAME = { single: 'Singleback', gun: 'Shotgun', iform: 'I-Form', trips: 'Gun Trips', empty: 'Gun Empty', pistol: 'Pistol', bunch: 'Gun Bunch', heavy: 'Jumbo', slot: 'Gun Slot' };

  /* Routes as waypoints [across, upfield] from the receiver's spot. Across is mirrored for the left side unless abs is set;
     stop means the receiver settles at the last point. */
  const ROUTES = {
    go: { p: [[0, 45]] }, slant: { p: [[0, 2.5], [9, 11]] }, out: { p: [[0, 9], [-9, 9.6]] }, in: { p: [[0, 11], [16, 11.6]] },
    post: { p: [[0, 12], [9, 32]] }, corner: { p: [[0, 11], [-8, 26]] }, curl: { p: [[0, 12], [0.8, 10.5]], stop: 1 },
    hitch: { p: [[0, 6], [0.6, 5]], stop: 1 }, drag: { p: [[0, 2], [22, 4.5]] },
    flatL: { p: [[-5, 1], [-12, 3]], abs: 1, stop: 1 }, flatR: { p: [[5, 1], [12, 3]], abs: 1, stop: 1 },
    screenL: { p: [[-3, -1.5], [-9, -0.5]], abs: 1, stop: 1 }, screenR: { p: [[3, -1.5], [9, -0.5]], abs: 1, stop: 1 },
    /* positive across is toward the middle of the field, negative toward his own sideline */
    wheel: { p: [[-3, 1], [-6, 3], [-7.5, 7.5], [-7.5, 32]] }, seam: { p: [[0.6, 4], [0.6, 40]] }, skinny: { p: [[0, 9], [3, 34]] },
    fade: { p: [[-1, 5], [-1.4, 40]] }, comeback: { p: [[0, 12], [-2, 10.2]], stop: 1 }, sail: { p: [[0, 8], [-8, 13], [-10, 13.5]], stop: 1 },
    sluggo: { p: [[0, 2.5], [2.6, 5.5], [2.6, 40]] }, outup: { p: [[0, 5], [-1.5, 6], [-2, 40]] },
    stopgo: { p: [[0, 5.5], [0.5, 6.5], [0.3, 40]] },
    angle: { p: [[-3, 1.5], [3, 4.5]], stop: 1 }, bubble: { p: [[-2, -1.4], [-6, -0.8]], stop: 1 }, arrow: { p: [[-6, 4.5]], stop: 1 },
    spot: { p: [[0, 5], [3, 6]], stop: 1 },
    swingL: { p: [[-6, -1.5], [-12, 0.5]], abs: 1, stop: 1 }, swingR: { p: [[6, -1.5], [12, 0.5]], abs: 1, stop: 1 } };
  const RNAME = { go: 'go', slant: 'slant', out: 'out', in: 'dig', post: 'post', corner: 'corner', curl: 'curl', hitch: 'hitch', drag: 'drag', flatL: 'flat', flatR: 'flat', screenL: 'screen', screenR: 'screen',
    wheel: 'wheel', seam: 'seam', skinny: 'skinny post', fade: 'fade', comeback: 'comeback', sail: 'sail', sluggo: 'slant and go', outup: 'out and up',
    stopgo: 'stop and go', angle: 'angle', bubble: 'bubble', arrow: 'arrow', spot: 'snag', swingL: 'swing', swingR: 'swing' };

  /* The offensive playbook. cat groups plays on the call screen, f is the formation, r the routes by role,
     run the ball carrier's path (fast: he goes at once; toss: the ball is pitched to him early; push: how hard the line drives its men
     back, 0.9 when not given; short: the computer only calls it with two yards or less to go),
     pa a play-action fake, roll how far the quarterback rolls out, quick a play that resolves without a snap.
     rz marks a play that suits a short field (the red zone, a two-point try; 2: only there); gadget a trick play, called now and then. */
  const OFF = [
    { n: 'Inside Zone', cat: 'run', f: 'single', rz: 1, run: { who: 'RB', path: [[0.8, -1], [1, 4]], push: 1.95 } },
    { n: 'Off Tackle', cat: 'run', f: 'iform', run: { who: 'RB', path: [[2.2, -3], [2.7, 3]], push: 2.1 } },
    { n: 'Toss Sweep', cat: 'run', f: 'iform', run: { who: 'RB', path: [[-7, -5.5], [-12, 2]], toss: 1 } },
    { n: 'HB Draw', cat: 'run', f: 'gun', run: { who: 'RB', path: [[0, -3], [-1, 4]], delay: .6 }, r: { X: 'go', Z: 'go', S: 'go', S2: 'go' } },
    { n: 'QB Draw', cat: 'run', f: 'gun', run: { who: 'QB', path: [[0, -6], [1, 4]], push: 2.0 }, r: { X: 'go', Z: 'go' } },
    { n: 'Counter', cat: 'run', f: 'iform', run: { who: 'RB', path: [[1.2, -6], [-2.2, -3], [-2.7, 3]], push: 1.9 } },
    { n: 'QB Sneak', cat: 'run', f: 'single', d: 'Short yardage', short: 1, run: { who: 'QB', path: [[0, 0.5], [0.4, 3]], fast: 1, push: 2.6 } },
    { n: 'Stretch', cat: 'run', f: 'pistol', d: 'Pistol · outside zone', run: { who: 'RB', path: [[3.5, -5.2], [6.5, -2], [7.5, 4]], push: 1.7 } },
    { n: 'Pistol Dive', cat: 'run', f: 'pistol', run: { who: 'RB', path: [[-0.6, -3.6], [-1.2, 4]], push: 1.9 } },
    { n: 'Gun Zone', cat: 'run', f: 'trips', d: 'Gun Trips · run away from trips', run: { who: 'RB', path: [[-0.6, -3.4], [-1.4, -1], [-1.8, 4]], push: 1.95 } },
    { n: 'Power', cat: 'run', f: 'heavy', rz: 1, d: 'Jumbo · off tackle', run: { who: 'RB', path: [[1.2, -4.5], [2.2, -1.2], [2.6, 4]], push: 2.15 } },
    { n: 'Lead Dive', cat: 'run', f: 'heavy', rz: 1, d: 'Short yardage', short: 1, run: { who: 'RB', path: [[0.4, -3], [0.6, 3]], push: 2.5 } },
    { n: 'Zone Read', cat: 'run', f: 'pistol', d: 'Pistol · QB keeps', run: { who: 'QB', path: [[-1.2, -3.8], [-3.5, -1], [-4.5, 4]], push: 2.1 } },
    { n: 'Jet Sweep', cat: 'run', f: 'pistol', gadget: 1, d: 'Pistol · Z on the sweep', run: { who: 'Z', path: [[5, -2.4], [-1, -3], [-8, -1.5], [-13, 4]], delay: 0.7, push: 1.8 } },
    { n: 'End Around', cat: 'run', f: 'single', gadget: 1, d: 'Singleback · X takes it', run: { who: 'X', path: [[-7, -2.4], [0.5, -2.8], [8, -1.5], [13, 4]], delay: 0.8, push: 1.8 } },
    /* run-pass options: the back and the quarterback meet with the ball between them for a second. Throw to a lettered
       receiver in that second, or do nothing and the back takes it. rpo marks them; the computer never calls them. */
    { n: 'RPO Slant', cat: 'rpo', f: 'gun', rpo: 1, d: 'Shotgun · throw or hand off', run: { who: 'RB', path: [[0.8, -3.3], [0.6, -1], [1, 4]], push: 2.1 }, r: { X: 'slant', Z: 'slant' } },
    { n: 'RPO Bubble', cat: 'rpo', f: 'gun', rpo: 1, d: 'Shotgun · throw or hand off', run: { who: 'RB', path: [[-0.8, -3.3], [-0.8, -1], [-1.2, 4]], push: 2.1 }, r: { S2: 'flatR', X: 'slant' } },
    { n: 'RPO Glance', cat: 'rpo', f: 'trips', rpo: 1, d: 'Gun Trips · throw or hand off', run: { who: 'RB', path: [[-0.8, -3.3], [-0.8, -1], [-1.4, 4]], push: 2.1 }, r: { X: 'skinny', Z: 'hitch', S2: 'bubble' } },
    { n: 'RPO Peek', cat: 'rpo', f: 'pistol', rpo: 1, d: 'Pistol · throw or hand off', run: { who: 'RB', path: [[0.9, -4.4], [0.9, -1], [1.3, 4]], push: 2.1 }, r: { X: 'hitch', S: 'arrow', Z: 'slant' } },
    { n: 'Slants', cat: 'short', f: 'gun', rz: 1, r: { X: 'slant', Z: 'slant', S: 'out', S2: 'drag', RB: 'flatR' } },
    { n: 'Curl Flat', cat: 'short', f: 'single', r: { X: 'curl', Z: 'curl', S: 'in', TE: 'out', RB: 'flatL' } },
    { n: 'Mesh', cat: 'short', f: 'gun', rz: 1, r: { S: 'drag', S2: 'drag', X: 'post', Z: 'corner', RB: 'flatR' } },
    { n: 'Stick', cat: 'short', f: 'single', rz: 1, r: { TE: 'hitch', Z: 'go', X: 'slant', S: 'out', RB: 'flatR' } },
    { n: 'HB Screen', cat: 'short', f: 'gun', d: 'Shotgun · screen', r: { RB: 'screenL', X: 'go', Z: 'go', S: 'go', S2: 'drag' } },
    { n: 'Bootleg', cat: 'short', f: 'single', pa: 1, roll: 7, d: 'Singleback · roll out', r: { TE: 'out', Z: 'corner', X: 'drag', S: 'in' } },
    { n: 'Spacing', cat: 'short', f: 'bunch', rz: 1, r: { Z: 'hitch', S: 'arrow', S2: 'curl', X: 'curl', RB: 'flatL' } },
    { n: 'Snag', cat: 'short', f: 'trips', rz: 1, r: { Z: 'corner', S2: 'spot', TE: 'arrow', X: 'slant', RB: 'swingL' } },
    { n: 'Quick Outs', cat: 'short', f: 'empty', rz: 1, r: { X: 'out', S: 'hitch', RB: 'arrow', S2: 'hitch', Z: 'out' } },
    { n: 'Drive', cat: 'short', f: 'single', r: { X: 'drag', TE: 'in', Z: 'go', S: 'curl', RB: 'flatR' } },
    { n: 'Bubble Screen', cat: 'short', f: 'gun', d: 'Shotgun · quick screens', r: { S: 'bubble', S2: 'bubble', X: 'hitch', Z: 'hitch' } },
    { n: 'Texas', cat: 'short', f: 'pistol', rz: 1, r: { RB: 'angle', TE: 'drag', X: 'curl', Z: 'out', S: 'in' } },
    { n: 'Levels', cat: 'short', f: 'slot', r: { X: 'in', S: 'drag', Z: 'go', TE: 'out', RB: 'flatR' } },
    { n: 'Flood', cat: 'short', f: 'pistol', pa: 1, roll: -7, d: 'Pistol · roll left', r: { X: 'go', S: 'sail', TE: 'drag', RB: 'flatL' } },
    { n: 'Hitch Seam', cat: 'short', f: 'empty', r: { X: 'hitch', Z: 'hitch', S: 'seam', S2: 'out', RB: 'arrow' } },
    { n: 'Swing Pass', cat: 'short', f: 'iform', r: { RB: 'swingR', FB: 'flatL', TE: 'curl', X: 'go', Z: 'curl' } },
    { n: 'Jumbo PA', cat: 'short', f: 'heavy', pa: 1, rz: 2, d: 'Jumbo · play action', r: { TE: 'flatR', S: 'flatL', X: 'fade', FB: 'flatL' } },
    { n: 'Four Verticals', cat: 'deep', f: 'gun', r: { X: 'go', Z: 'go', S: 'go', S2: 'go', RB: 'flatL' } },
    { n: 'PA Post', cat: 'deep', f: 'iform', pa: 1, d: 'I-Form · PA', r: { X: 'post', Z: 'go', TE: 'in', FB: 'flatR' } },
    { n: 'Smash', cat: 'deep', f: 'gun', rz: 1, r: { X: 'hitch', S: 'corner', Z: 'hitch', S2: 'corner' } },
    { n: 'Dagger', cat: 'deep', f: 'gun', r: { S: 'go', X: 'in', Z: 'post', S2: 'drag', RB: 'flatR' } },
    { n: 'Post Wheel', cat: 'deep', f: 'gun', r: { S: 'wheel', X: 'post', Z: 'curl', S2: 'in', RB: 'flatR' } },
    { n: 'Sluggo', cat: 'deep', f: 'single', d: 'Singleback · double moves', r: { X: 'sluggo', Z: 'sluggo', S: 'hitch', TE: 'out', RB: 'flatR' } },
    { n: 'Mills', cat: 'deep', f: 'slot', r: { X: 'post', S: 'in', Z: 'curl', TE: 'seam', RB: 'flatR' } },
    { n: 'Trips Verts', cat: 'deep', f: 'trips', r: { X: 'go', Z: 'go', S2: 'seam', TE: 'hitch', RB: 'flatL' } },
    { n: 'PA Corner', cat: 'deep', f: 'iform', pa: 1, d: 'I-Form · PA', r: { X: 'skinny', Z: 'corner', TE: 'drag', FB: 'flatL' } },
    { n: 'Double Moves', cat: 'deep', f: 'empty', r: { X: 'outup', Z: 'stopgo', S: 'hitch', S2: 'hitch', RB: 'arrow' } },
    { n: 'Comebacks', cat: 'deep', f: 'gun', r: { X: 'comeback', Z: 'comeback', S: 'hitch', S2: 'drag', RB: 'flatL' } },
    { n: 'Bunch Fade', cat: 'deep', f: 'bunch', rz: 1, r: { X: 'curl', Z: 'fade', S: 'slant', S2: 'out', RB: 'flatL' } },
    { n: 'Skinny Post', cat: 'deep', f: 'pistol', r: { X: 'skinny', Z: 'curl', TE: 'out', S: 'drag', RB: 'flatR' } },
    { n: 'Field Goal', cat: 'special', f: 'iform', d: '3 points' },
    { n: 'Punt', cat: 'special', f: 'iform', d: 'Flip the field' },
    { n: 'QB Kneel', cat: 'special', f: 'iform', d: 'Burn 40 seconds', quick: 'kneel' },
    { n: 'Spike', cat: 'special', f: 'gun', d: 'Stop the clock', quick: 'spike' }];

  /* The defensive playbook: where each defender lines up, then per call a zone to drop to (Z), 'man' or 'rush'.
     al moves men off their usual spots before the snap, [across, deeper], so the calls look different at the line:
     a safety rolled down into the box, blitzers walked up, a two-deep shell that drops into something else. */
  const DPOS = { DE1: [-4.6, 1], DT1: [-1.5, 1], DT2: [1.5, 1], DE2: [4.6, 1], OLB1: [-5.5, 4.5], MLB: [0, 4.5], OLB2: [5.5, 4.5], CB1: [-14, 6.5], CB2: [14, 6.5], FS: [-6, 13], SS: [6, 12] };
  const Z = (x, y, deep) => ({ z: [x, y], deep });
  const DEF = [
    { n: 'Cover 2', d: 'Zone · rush 4', a: { OLB1: Z(-9, 8), MLB: Z(0, 10), OLB2: Z(9, 8), CB1: Z(-17, 5), CB2: Z(17, 5), FS: Z(-11, 19, 1), SS: Z(11, 19, 1) } },
    { n: 'Cover 3', d: 'Zone · rush 4', al: { SS: [2, -4.5] }, a: { CB1: Z(-17, 19, 1), CB2: Z(17, 19, 1), FS: Z(0, 21, 1), SS: Z(14, 5), OLB1: Z(-14, 5), MLB: Z(-4, 9), OLB2: Z(5, 9) } },
    { n: 'Cover 1 Man', d: 'Man · rush 4', al: { SS: [-1, -5], FS: [6, 2] }, a: { CB1: 'man', CB2: 'man', SS: 'man', OLB1: 'man', OLB2: 'man', MLB: Z(0, 7), FS: Z(0, 20, 1) } },
    { n: 'Man Blitz', d: 'Man · rush 6', al: { MLB: [0.5, -1.2], OLB2: [0.3, -1.2], SS: [-1, -5], FS: [1, -5.5] }, a: { CB1: 'man', CB2: 'man', SS: 'man', OLB1: 'man', FS: 'man', OLB2: 'rush', MLB: 'rush' } },
    { n: 'Zone Blitz', d: 'Zone · rush 5', al: { OLB1: [0.3, -1.2] }, a: { OLB1: 'rush', MLB: Z(0, 8), OLB2: Z(10, 6), SS: Z(-10, 6), CB1: Z(-17, 19, 1), CB2: Z(17, 19, 1), FS: Z(0, 21, 1) } },
    { n: 'Cover 4', d: 'Deep zone · rush 4', al: { FS: [-2, -2], SS: [2, -1] }, a: { CB1: Z(-17, 20, 1), CB2: Z(17, 20, 1), FS: Z(-6, 22, 1), SS: Z(6, 22, 1), OLB1: Z(-10, 7), MLB: Z(0, 8), OLB2: Z(10, 7) } },
    { n: 'Tampa 2', d: 'Zone · the middle linebacker runs deep', a: { OLB1: Z(-9, 8), MLB: Z(0, 15), OLB2: Z(9, 8), CB1: Z(-17, 5), CB2: Z(17, 5), FS: Z(-12, 20, 1), SS: Z(12, 20, 1) } },
    { n: 'Cover 6', d: 'Quarters left, half right · rush 4', al: { SS: [1, -1.5] }, a: { CB1: Z(-17, 18, 1), FS: Z(-6, 21, 1), SS: Z(12, 19, 1), CB2: Z(17, 5), OLB1: Z(-10, 7), MLB: Z(0, 9), OLB2: Z(8, 8) } },
    { n: 'Cover 2 Man', d: 'Man under, two deep · rush 4', a: { CB1: 'man', CB2: 'man', OLB1: 'man', OLB2: 'man', MLB: 'man', FS: Z(-11, 20, 1), SS: Z(11, 20, 1) } },
    { n: 'Fire Zone', d: 'Zone · the safety blitzes', al: { SS: [-1, -4.5] }, a: { SS: 'rush', OLB1: Z(-10, 6), MLB: Z(0, 9), OLB2: Z(10, 6), CB1: Z(-17, 19, 1), CB2: Z(17, 19, 1), FS: Z(0, 21, 1) } },
    { n: 'Overload', d: 'Man · rush 6 from one side', al: { OLB1: [-0.8, -1.4], SS: [-9, -5] }, a: { OLB1: 'rush', SS: 'rush', CB1: 'man', CB2: 'man', MLB: 'man', OLB2: 'man', FS: Z(0, 20, 1) } },
    { n: 'Goal Line', d: 'Run stop · rush 6', a: { OLB1: 'rush', OLB2: 'rush', MLB: Z(0, 3), SS: Z(5, 3), FS: Z(-5, 3), CB1: 'man', CB2: 'man' } },
    { n: 'Prevent', d: 'Deep zone · rush 4', a: { CB1: Z(-16, 25, 1), CB2: Z(16, 25, 1), FS: Z(-5, 28, 1), SS: Z(5, 28, 1), OLB1: Z(-10, 14), MLB: Z(0, 15), OLB2: Z(10, 14) } }];

  /* Each team's offense, by TEAMS index: how much it likes each formation (1 when not named), a nudge to how often it
     runs (run) and goes deep (deep), how much it likes play action (pa) and trick plays (gadget). So a week against
     Austin looks nothing like a week against Portland, and your own coach has a style you learn. */
  const STYLES = [
    { n: 'Air raid', f: { gun: 1.6, empty: 1.5, trips: 1.3, slot: 1.2, single: 0.6, pistol: 0.6, iform: 0.4, heavy: 0.4 }, run: -0.08, deep: 0.08 },
    { n: 'Power run', f: { iform: 1.7, heavy: 1.5, single: 1.3, pistol: 0.8, gun: 0.6, trips: 0.6, slot: 0.6, bunch: 0.6, empty: 0.3 }, run: 0.08, pa: 1.5 },
    { n: 'Pistol option', f: { pistol: 1.9, single: 0.8, iform: 0.6, heavy: 0.7, slot: 0.8, bunch: 0.6, empty: 0.5 }, run: 0.05, gadget: 1.5 },
    { n: 'West coast', f: { single: 1.5, bunch: 1.5, gun: 0.9, trips: 0.9, pistol: 0.8, heavy: 0.7, empty: 0.6 }, deep: -0.08 },
    { n: 'Spread', f: { gun: 1.4, trips: 1.5, slot: 1.4, bunch: 1.1, pistol: 0.9, single: 0.6, iform: 0.4, heavy: 0.5 }, gadget: 2 },
    { n: 'Vertical', f: { iform: 1.2, single: 1.2, gun: 1.1, trips: 1.1, bunch: 0.8, empty: 0.8, heavy: 0.7 }, deep: 0.1, pa: 1.6 },
    { n: 'Run and shoot', f: { empty: 1.6, slot: 1.5, gun: 1.3, bunch: 1.2, trips: 1.2, pistol: 0.7, single: 0.6, iform: 0.4, heavy: 0.4 }, run: -0.06 },
    { n: 'Pro style', f: {} }];
  const SCHEME = TEAMS.map(t => STYLES[t.style]);  // by team, as the play callers look it up

  /* receiver button colors (no yellow, by request) and down names */
  const LCOL = ['#ff6b6b', '#ff9a3d', '#51e08a', '#4dabf7', '#d59bff'];
  const ORD = ['1st', '2nd', '3rd', '4th'];

  window.PG = { data: { TEAMS, CONF, DIV, SUR, OLR, OLX, OFFR, DEFR, BASE, NUM, FORM, FNAME, ROUTES, RNAME, OFF, DPOS, DEF, STYLES, SCHEME, LCOL, ORD } };
})();
