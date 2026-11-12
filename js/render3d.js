/* Pocket Gridiron: 3D renderer (three.js).
   Draws the field, stadium, players and ball. game.js keeps its 2D canvas on top as a transparent overlay
   for letters, tags and the joystick, and asks this module to project field points onto the screen.

   Field coordinates are yards: x across, y upfield, z up. In the scene that is (x, z, -y).
   Players are one shared skeleton layout; every body part is an InstancedMesh, so all figures on screen
   cost about a dozen draw calls. Animation is procedural: a pose is 16 joint values, eased toward a target. */
(() => {
  'use strict';
  const T = window.THREE;
  if (!T || !PG.shaders) return;
  const SH = PG.shaders;       // GLSL for the turf, sky, crowd and the players' rim light (shaders.js)

  const FW = 53.33, HIP = 1.0, PSCALE = 1.6;
  const SIDELINE = 20, MAXP = 22, REFS = 3, CAP = SIDELINE + MAXP + REFS;   // sideline figures first, then the players, then the officials
  const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const v3 = new T.Vector3(), v3b = new T.Vector3(), col = new T.Color(), col2 = new T.Color(), zAxis = new T.Vector3(0, 0, 1);

  let renderer, scene, camera, post = null, glowAmount = 0.8, W = 1, H = 1;
  let fieldTex, fieldCanvas, crowdMat, skyMat, skyDome, ribbonTex, ribbonCanvas, boardTex, boardCanvas, boardKey = '';
  let parts = [], figs = [], contact, ball, ballShadow, ring, targetRing, losLine, fdLine, sticks;
  let hemiLight, sunLight, fillLight, fieldMat, groundMat, wallMat, rainPts, snowPts, envKey = '', envSnow = false, crowdBase = 1, celebT = 0;
  const shadowSets = [], towerGlow = [], towerPanels = [], refs = [];
  let teamsKey = '', lastPs = null, time = 0, cheer = 0, debugCam = null, zoom = 1, flashes = null;
  const FLASHES = 48, flashLife = new Float32Array(FLASHES);
  const TOWERS = [[-70, -78], [FW + 70, -78], [-70, 178], [FW + 70, 178]];   // the four light towers, as field [x, y]
  const posts = [];
  const camPos = new T.Vector3(FW / 2, 30, 20), camLook = new T.Vector3(FW / 2, 0, -50);

  /* ---------- pose layout ---------- */
  const PELY = 0, PELRX = 1, PELRZ = 2, CHRX = 3, CHRY = 4, HEADRX = 5, SLX = 6, SLZ = 7, EL = 8, SRX = 9, SRZ = 10, ER = 11, HL = 12, KL = 13, HR = 14, KR = 15, NPOSE = 16;
  const TG = new Float32Array(NPOSE);

  /* ---------- geometry ---------- */
  const cap = (r, len, y) => new T.CapsuleGeometry(r, len, 3, 8).translate(0, y, 0);
  function merge(list) {
    const flat = list.map(g => g.index ? g.toNonIndexed() : g);
    let n = 0; for (const g of flat) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3);
    let o = 0;
    for (const g of flat) { pos.set(g.attributes.position.array, o); nor.set(g.attributes.normal.array, o); o += g.attributes.position.count * 3; }
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.BufferAttribute(nor, 3));
    return out;
  }
  /* every geometry is modelled in the space of the joint it hangs from */
  /* a surface of revolution from [radius, y] pairs: tapered limbs and a chest that narrows to the waist */
  const lathe = (pts, seg) => new T.LatheGeometry(pts.map(([r, y]) => new T.Vector2(r, y)), seg || 12);
  const GEO = {
    torso: lathe([[0.01, -0.05], [0.178, -0.04], [0.188, 0.14], [0.215, 0.32], [0.235, 0.47], [0.2, 0.6], [0.09, 0.67]]).scale(1, 1, 0.74),   // the hem hangs just over the pants
    pads: new T.SphereGeometry(0.22, 14, 8).scale(1.58, 0.6, 0.98).translate(0, 0.565, 0),
    neck: new T.CylinderGeometry(0.068, 0.08, 0.12, 10).translate(0, 0.69, 0),
    hips: lathe([[0.01, -0.24], [0.11, -0.215], [0.166, -0.11], [0.17, -0.02], [0.13, 0.04], [0.01, 0.06]]).scale(1, 1, 0.78),   // a rounded top that stays inside the jersey
    helmet: new T.SphereGeometry(0.17, 16, 12).scale(1, 1.02, 1.12),
    stripe: new T.TorusGeometry(0.177, 0.016, 4, 14, Math.PI).rotateY(Math.PI / 2).scale(2.2, 1.02, 1.12),
    logo: merge([-1, 1].map(side => new T.CylinderGeometry(0.058, 0.058, 0.012, 12).rotateZ(Math.PI / 2).translate(side * 0.168, 0.01, 0.01))),
    visor: new T.SphereGeometry(0.128, 10, 8).scale(1, 0.6, 0.6).translate(0, -0.035, -0.125),
    mask: merge([
      new T.TorusGeometry(0.162, 0.011, 4, 12, Math.PI).rotateX(-Math.PI / 2).translate(0, -0.05, -0.02),
      new T.TorusGeometry(0.158, 0.011, 4, 12, Math.PI).rotateX(-Math.PI / 2).translate(0, -0.1, -0.02),
      new T.TorusGeometry(0.15, 0.011, 4, 12, Math.PI).rotateX(-Math.PI / 2).translate(0, -0.145, -0.01),
      new T.CylinderGeometry(0.011, 0.011, 0.11, 5).translate(0, -0.095, -0.178),
      new T.CylinderGeometry(0.011, 0.011, 0.11, 5).translate(-0.07, -0.095, -0.158),
      new T.CylinderGeometry(0.011, 0.011, 0.11, 5).translate(0.07, -0.095, -0.158),
    ]),
    /* limbs end in a ball at the joint, so the next segment meets a clean round edge instead of a ragged intersection */
    upperArm: merge([lathe([[0.01, 0.03], [0.07, 0], [0.068, -0.15], [0.06, -0.29]], 10), new T.SphereGeometry(0.062, 10, 8).translate(0, -0.3, 0)]),
    sleeveCap: lathe([[0.01, 0.045], [0.084, 0.01], [0.082, -0.13], [0.07, -0.135]], 10),
    sleeve: new T.TorusGeometry(0.08, 0.013, 4, 12).rotateX(Math.PI / 2).translate(0, -0.13, 0),
    foreArm: lathe([[0.01, 0.02], [0.054, 0], [0.056, -0.08], [0.044, -0.25], [0.01, -0.27]], 10),
    wrist: new T.CylinderGeometry(0.053, 0.049, 0.055, 10).translate(0, -0.215, 0),
    hand: new T.SphereGeometry(0.064, 8, 6).scale(1, 1.15, 0.85).translate(0, -0.3, 0),
    /* a stripe down both sides of the thigh, following its taper */
    pantStripe: merge([Math.PI / 2, Math.PI * 1.5].map(a => new T.LatheGeometry([[0.112, -0.03], [0.108, -0.2], [0.09, -0.455]].map(([r, y]) => new T.Vector2(r, y)), 3, a - 0.2, 0.4))),
    thigh: merge([lathe([[0.01, 0.05], [0.108, 0], [0.104, -0.2], [0.086, -0.46]], 12), new T.SphereGeometry(0.09, 12, 8).translate(0, -0.49, 0)]),
    shin: lathe([[0.01, 0.03], [0.07, 0], [0.084, -0.13], [0.062, -0.34], [0.052, -0.46], [0.01, -0.49]], 12),
    foot: new T.CapsuleGeometry(0.058, 0.15, 2, 8).rotateX(Math.PI / 2).scale(1.05, 0.72, 1).translate(0, -0.465, -0.07),
  };
  /* Low-polygon stand-ins, used only to cast shadows: a flattened silhouette does not need the detail, and at night
     every one of these is drawn four times. Open tubes are fine, the ends never show. */
  const SHADOW_GEO = {
    torso: lathe([[0.178, -0.04], [0.215, 0.32], [0.235, 0.47], [0.2, 0.6], [0.09, 0.67]], 6).scale(1, 1, 0.74),
    pads: new T.SphereGeometry(0.22, 6, 4).scale(1.58, 0.6, 0.98).translate(0, 0.565, 0),
    hips: lathe([[0.11, -0.215], [0.166, -0.11], [0.17, -0.02]], 6).scale(1, 1, 0.78),
    helmet: new T.SphereGeometry(0.17, 8, 5).scale(1, 1.02, 1.12),
    upperArm: lathe([[0.07, 0], [0.06, -0.3]], 5),
    foreArm: lathe([[0.054, 0], [0.056, -0.08], [0.058, -0.34]], 5),              // long enough to stand in for the hand
    thigh: lathe([[0.108, 0], [0.086, -0.5]], 6),
    shin: lathe([[0.07, 0], [0.084, -0.13], [0.052, -0.46]], 6),
    foot: new T.BoxGeometry(0.12, 0.08, 0.26).translate(0, -0.465, -0.07),
  };
  /* [name, joints it follows, color key, what body type scales it ('body', 'limb' or nothing), casts a shadow] */
  const PART_DEFS = [
    ['torso', ['chest'], 'jersey', 'body', 1], ['pads', ['chest'], 'jersey', 'body', 1], ['neck', ['chest'], 'skin'],
    ['hips', ['pelvis'], 'pants', 'body', 1],
    ['helmet', ['head'], 'helmet', '', 1], ['stripe', ['head'], 'stripe'], ['logo', ['head'], 'stripe'], ['visor', ['head'], 'visor'], ['mask', ['head'], 'mask'],
    ['upperArm', ['shL', 'shR'], 'skin', 'limb', 1], ['sleeveCap', ['shL', 'shR'], 'jersey', 'limb'], ['sleeve', ['shL', 'shR'], 'trim', 'limb'],
    ['foreArm', ['elL', 'elR'], 'skin', 'limb', 1], ['wrist', ['elL', 'elR'], 'trim', 'limb'], ['hand', ['elL', 'elR'], 'glove'],
    ['thigh', ['hipL', 'hipR'], 'pants', 'limb', 1], ['pantStripe', ['hipL', 'hipR'], 'stripe', 'limb'],
    ['shin', ['kneeL', 'kneeR'], 'sock', 'limb', 1], ['foot', ['kneeL', 'kneeR'], 'shoe', '', 1],
  ];
  /* Body types: [shoulder and hip width, depth, height, limb thickness]. Linemen are wide and deep, receivers and
     defensive backs lean, so the two lines read as big men even from the gameplay camera. */
  const BUILD = {
    line: [1.24, 1.34, 1.03, 1.2], end: [1.13, 1.12, 1.05, 1.1], big: [1.08, 1.07, 1.02, 1.08], qb: [1, 1, 1.03, 1],
    back: [1.04, 1.06, 0.96, 1.07], slim: [0.93, 0.92, 1.02, 0.91], db: [0.94, 0.93, 0.99, 0.93], ref: [0.96, 1.04, 0.97, 0.94],
  };
  function buildOf(role) {
    if (/^(LT|LG|C|RG|RT)$/.test(role) || /^DT/.test(role)) return BUILD.line;
    if (/^DE/.test(role)) return BUILD.end;
    if (/^(TE|FB|OLB|MLB)/.test(role)) return BUILD.big;
    if (role === 'QB') return BUILD.qb;
    if (role === 'RB') return BUILD.back;
    if (/^(CB|FS|SS)/.test(role)) return BUILD.db;
    return BUILD.slim;
  }
  function setBuild(f, b) {
    f.bodyS.set(b[0], 1, b[1]); f.limbS.set(b[3], 1, b[3]);
    f.shL.position.x = -0.31 * b[0]; f.shR.position.x = 0.31 * b[0];
    f.hipL.position.x = -0.11 * (0.5 + 0.5 * b[0]); f.hipR.position.x = 0.11 * (0.5 + 0.5 * b[0]);
    f.num.scale.set(b[0], 1, b[1]);
    f.root.scale.setScalar(PSCALE * b[2]);
  }
  /* officials: white shirt with a striped panel, black trousers and cap; no pads or facemask */
  const REF_COLORS = { jersey: '#f4f4f4', pants: '#15171c', helmet: '#15171c', stripe: '#15171c', trim: '#15171c', sock: '#15171c', number: '#15171c',
    skin: '#d7a078', glove: '#d7a078', shoe: '#0c0c10', mask: '#15171c', visor: '#d7a078' };
  const REF_HIDE = new Set(['pads', 'mask', 'stripe', 'logo', 'sleeve', 'pantStripe', 'wrist']);
  const SKIN = ['#f0c8a4', '#d7a078', '#b3764c', '#8a583a', '#66402e'];

  function numberGeometry() {
    const w = 0.15, y0 = 0.2, y1 = 0.5, zf = -0.17, zb = 0.17;
    const pos = [w, y0, zf, -w, y0, zf, -w, y1, zf, w, y0, zf, -w, y1, zf, w, y1, zf,
      -w, y0, zb, w, y0, zb, w, y1, zb, -w, y0, zb, w, y1, zb, -w, y1, zb];
    const uv = [0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1];
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    return g;
  }
  const numCache = new Map();
  function numberMaterial(num, color) {
    const key = color + '|' + num;
    let m = numCache.get(key);
    if (m) return m;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = color; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '800 44px Archivo, Arial, sans-serif';
    x.fillText(String(num), 32, 35);
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
    m = new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: T.DoubleSide });
    numCache.set(key, m);
    return m;
  }

  function stripeMaterial() {
    let m = numCache.get('ref');
    if (m) return m;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d'); x.fillStyle = '#15171c';
    for (let i = 0; i < 5; i++) x.fillRect(3 + i * 13, 0, 6, 64);
    m = new T.MeshBasicMaterial({ map: new T.CanvasTexture(c), transparent: true, depthWrite: false, side: T.DoubleSide });
    numCache.set('ref', m);
    return m;
  }

  /* ---------- figures ---------- */
  function makeFigure() {
    const g = () => new T.Group();
    const f = { root: g(), pelvis: g(), chest: g(), head: g(), shL: g(), elL: g(), shR: g(), elR: g(), hipL: g(), kneeL: g(), hipR: g(), kneeR: g() };
    f.root.add(f.pelvis); f.pelvis.position.y = HIP;
    f.pelvis.add(f.chest); f.chest.add(f.head); f.head.position.y = 0.83;
    for (const [sh, el, side] of [[f.shL, f.elL, -1], [f.shR, f.elR, 1]]) { sh.position.set(side * 0.31, 0.56, 0); el.position.y = -0.3; sh.add(el); f.chest.add(sh); }
    for (const [hip, knee, side] of [[f.hipL, f.kneeL, -1], [f.hipR, f.kneeR, 1]]) { hip.position.set(side * 0.11, 0, 0); knee.position.y = -0.5; hip.add(knee); f.pelvis.add(hip); }
    f.root.scale.setScalar(PSCALE);
    f.num = new T.Mesh(numberGeometry(), numberMaterial(0, '#ffffff'));
    f.chest.add(f.num);
    f.cur = new Float32Array(NPOSE); f.cur[PELY] = HIP;
    f.bodyS = new T.Vector3(1, 1, 1); f.limbS = new T.Vector3(1, 1, 1); f.hide = null;
    f.heading = 0; f.fall = 0; f.fallDir = 1; f.seed = Math.random() * 6.28; f.snap = true;
    return f;
  }
  function applyPose(f) {
    const c = f.cur;
    f.pelvis.position.y = c[PELY]; f.pelvis.rotation.x = c[PELRX]; f.pelvis.rotation.z = c[PELRZ];
    f.chest.rotation.x = c[CHRX]; f.chest.rotation.y = c[CHRY]; f.head.rotation.x = c[HEADRX];
    f.shL.rotation.x = c[SLX]; f.shL.rotation.z = c[SLZ]; f.elL.rotation.x = c[EL];
    f.shR.rotation.x = c[SRX]; f.shR.rotation.z = c[SRZ]; f.elR.rotation.x = c[ER];
    f.hipL.rotation.x = c[HL]; f.kneeL.rotation.x = c[KL]; f.hipR.rotation.x = c[HR]; f.kneeR.rotation.x = c[KR];
  }
  const ZERO4 = new T.Matrix4().makeScale(0, 0, 0), fit4 = new T.Matrix4();
  function writeFigure(f, i) {
    f.root.updateMatrixWorld(true);
    for (const p of parts) {
      const n = p.joints.length, sc = p.fit === 'body' ? f.bodyS : p.fit === 'limb' ? f.limbS : null, gone = f.hide && f.hide.has(p.name);
      for (let k = 0; k < n; k++) {
        const jm = f[p.joints[k]].matrixWorld;
        p.mesh.setMatrixAt(i * n + k, gone ? ZERO4 : sc ? fit4.copy(jm).scale(sc) : jm);
      }
    }
  }
  function colorFigure(i, c) {
    for (const p of parts) for (let k = 0; k < p.joints.length; k++) p.mesh.setColorAt(i * p.joints.length + k, col.set(c[p.color]));
  }
  function teamColors(t, home, skin) {
    return home
      ? { jersey: t.c1, pants: t.c2, helmet: t.c2, stripe: t.c1, trim: t.c2, sock: '#f1f1f1', number: t.c2, skin, glove: '#f1f1f1', shoe: '#1b1b1f', mask: '#aeb6c2', visor: '#14161c' }
      : { jersey: '#f1f1f1', pants: t.c1, helmet: t.c1, stripe: '#f1f1f1', trim: t.c1, sock: t.c1, number: t.c1, skin, glove: '#f1f1f1', shoe: '#1b1b1f', mask: '#aeb6c2', visor: '#14161c' };
  }

  /* ---------- animation: fill TG with the pose this player wants ---------- */
  function stanceOf(p, s) {
    if (s.ps.mode === 'ko') return 'wide';
    if (p.isOL || /^D[ET]/.test(p.role) || p.role === 'TE') return 'line';
    if (p.role === 'QB') return Math.abs(p.y - s.ps.los) < 2.6 ? 'under' : 'two';
    return /^(RB|FB|OLB|MLB)/.test(p.role) ? 'two' : 'wide';
  }
  /* touchdown: the scorer picks one of three celebrations, his teammates jump or pump a fist */
  function celebrate(f, scorer, tg) {
    const b = Math.abs(Math.sin(time * 6.5 + f.seed)), v = Math.floor(f.seed / 6.2832 * 3);
    if (scorer && v === 1) {                                  // spike the ball, then arms out wide
      if (celebT < 0.45) { tg[SRX] = 3.4; tg[ER] = 0.9; tg[CHRX] = 0.25; tg[SLX] = 0.6; tg[EL] = 0.8; tg[HL] = 0.3; tg[HR] = -0.25; tg[KR] = -0.3; }
      else if (celebT < 0.8) { tg[SRX] = 0.25; tg[ER] = 0.1; tg[CHRX] = -0.5; tg[SLX] = -0.5; tg[EL] = 0.5; tg[PELY] = HIP - 0.1; tg[HL] = 0.5; tg[KL] = -0.6; tg[HR] = -0.2; tg[KR] = -0.3; }
      else { tg[SLX] = 2.6; tg[SRX] = 2.6; tg[SLZ] = -0.8; tg[SRZ] = 0.8; tg[EL] = 0.45; tg[ER] = 0.45; tg[CHRX] = 0.1; tg[HEADRX] = 0.25; tg[PELY] = HIP + b * 0.07; tg[HL] = 0.15; tg[HR] = -0.15; }
      return true;
    }
    if (scorer && v === 2) {                                  // one arm to the sky and a slow strut
      const w = Math.sin(time * 4 + f.seed);
      tg[SRX] = 3.05; tg[ER] = 0.05; tg[SLX] = 0.15; tg[SLZ] = -0.45; tg[EL] = 1.6; tg[CHRX] = 0.12; tg[HEADRX] = 0.35;
      tg[HL] = w * 0.3; tg[HR] = -w * 0.3; tg[KL] = -0.3 * Math.max(0, w); tg[KR] = -0.3 * Math.max(0, -w); tg[PELY] = HIP + Math.abs(w) * 0.03;
      return false;
    }
    if (!scorer && v === 0) {                                 // fist pump
      const w = Math.sin(time * 9 + f.seed) * 0.5 + 0.5;
      tg[SRX] = 1.6 + w * 1.3; tg[ER] = 1.9 - w * 1.5; tg[SLX] = 0.3; tg[EL] = 1.1; tg[CHRX] = 0.05; tg[PELY] = HIP + w * 0.08;
      tg[HL] = 0.1; tg[HR] = 0.1; tg[KL] = -0.2 * (1 - w); tg[KR] = -0.2 * (1 - w);
      return false;
    }
    const who = scorer ? 1.4 : 1;                             // jumping with both arms up
    tg[PELY] = HIP + b * 0.2 * who; tg[CHRX] = 0.08; tg[SLX] = 2.95; tg[SRX] = 2.95; tg[SLZ] = -0.3 - b * 0.2; tg[SRZ] = 0.3 + b * 0.2; tg[EL] = 0.2; tg[ER] = 0.2;
    tg[HL] = 0.1; tg[HR] = 0.1; tg[KL] = -0.25 * (1 - b); tg[KR] = -0.25 * (1 - b); tg[HEADRX] = 0.25;
    return false;
  }
  /* an official: jog to a spot, watch the ball, and signal how the play ended ('td', 'fd' first down, 'inc' incomplete) */
  function poseRef(f, r, sig, bx, by, dt) {
    const tg = TG; tg.fill(0);
    const sp = Math.hypot(r.vx, r.vy), run = Math.min(1, sp / 6), ph = r.anim * 2.4, sn = Math.sin(ph), cs = Math.cos(ph);
    tg[PELY] = HIP - 0.03 * run + Math.abs(cs) * 0.04 * run; tg[CHRX] = -0.05 - 0.15 * run;
    tg[HL] = sn * 0.8 * run; tg[HR] = -sn * 0.8 * run; tg[KL] = -(0.15 + Math.max(0, cs)) * run; tg[KR] = -(0.15 + Math.max(0, -cs)) * run;
    tg[SLX] = -sn * 0.6 * run; tg[SRX] = sn * 0.6 * run; tg[EL] = 0.3 + run; tg[ER] = 0.3 + run;
    let hx = bx - r.x, hy = by - r.y;
    if (sp > 1.2) { hx = r.vx; hy = r.vy; }
    else if (sig === 'td') { tg[SLX] = 3.05; tg[SRX] = 3.05; tg[EL] = 0.05; tg[ER] = 0.05; tg[SLZ] = -0.12; tg[SRZ] = 0.12; }
    else if (sig === 'fd') { tg[SRX] = 1.57; tg[ER] = 0.02; hx = 0; hy = r.fdDir; }             // arm straight out toward the line to gain
    else if (sig === 'inc') { const w = Math.sin(time * 8); tg[SLX] = 1.1; tg[SRX] = 1.1; tg[SLZ] = w * 0.7; tg[SRZ] = -w * 0.7; tg[EL] = 0.1; tg[ER] = 0.1; }
    let d = Math.atan2(-hx, hy) - f.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
    f.heading += f.snap ? d : d * (1 - Math.exp(-dt * 8));
    const k = f.snap ? 1 : 1 - Math.exp(-dt * 16);
    for (let i = 0; i < NPOSE; i++) f.cur[i] += (tg[i] - f.cur[i]) * k;
    f.snap = false;
    applyPose(f);
    f.root.position.set(r.x, 0, -r.y); f.root.rotation.y = f.heading;
  }
  /* a reserve on the sideline: stands and breathes, some with hands on hips or arms folded, and jumps when his team scores */
  function poseBench(f, up, dt) {
    const tg = TG; tg.fill(0);
    tg[PELY] = HIP; tg[CHRX] = -0.04 + Math.sin(time * 1.7 + f.seed) * 0.014; tg[EL] = 0.3; tg[ER] = 0.3;
    if (up) {
      const b = Math.abs(Math.sin(time * 6 + f.seed));
      tg[PELY] = HIP + b * 0.16; tg[SLX] = 2.9; tg[SRX] = 2.9; tg[SLZ] = -0.35; tg[SRZ] = 0.35; tg[EL] = 0.2; tg[ER] = 0.2; tg[KL] = -0.2 * (1 - b); tg[KR] = -0.2 * (1 - b);
    } else if (f.seed > 4.2) { tg[SLZ] = -0.45; tg[SRZ] = 0.45; tg[EL] = 1.6; tg[ER] = 1.6; tg[SLX] = 0.15; tg[SRX] = 0.15; }
    else if (f.seed < 1.2) { tg[SLX] = 0.55; tg[SRX] = 0.55; tg[SLZ] = 0.35; tg[SRZ] = -0.35; tg[EL] = 1.5; tg[ER] = 1.5; }
    const k = f.snap ? 1 : 1 - Math.exp(-dt * 10);
    for (let i = 0; i < NPOSE; i++) f.cur[i] += (tg[i] - f.cur[i]) * k;
    f.snap = false;
    applyPose(f);
  }
  function poseFor(f, p, s, dt) {
    const tg = TG, ps = s.ps; tg.fill(0);
    const sp = Math.hypot(p.vx, p.vy), run = Math.min(1, sp / 7.5), ph = p.anim * 2.4, sn = Math.sin(ph), cs = Math.cos(ph);
    const carrier = ps.carrier === p && !ps.air, inPocket = carrier && p === ps.qb && ps.mode === 'pass' && !ps.thrown && !ps.open;
    let hx = null, hy = 0, snap = false;
    const flat = p.flat > 0 && !p.down && !p.fell;              // run over: on his back for a moment
    if (!(p.down || p.fell || flat)) f.fall = 0;
    tg[PELY] = HIP; tg[EL] = 0.25; tg[ER] = 0.25; tg[CHRX] = -0.05;

    if (p.down || p.fell || flat) {                           // on the turf
      f.fall = Math.min(1, f.fall + dt / 0.28);
      const e = f.fall * f.fall * (3 - 2 * f.fall);
      tg[PELY] = lerp(HIP, 0.24, e); tg[PELRX] = -1.5 * e * (flat ? -1 : f.fallDir);
      tg[SLX] = 2.5; tg[SRX] = 2.8; tg[SLZ] = -0.5; tg[SRZ] = 0.4; tg[EL] = 0.5; tg[ER] = 0.3;
      tg[HL] = 0.2; tg[KL] = -0.4; tg[HR] = -0.1; tg[KR] = -0.15; tg[HEADRX] = 0.2;
      snap = true;
    } else if (p.dive > 0 && p.hit > 0) {                     // hit stick: stays on his feet and drives a shoulder through
      tg[PELY] = HIP - 0.22; tg[PELRX] = -0.75; tg[CHRX] = -0.3; tg[HEADRX] = 0.5; tg[SLX] = 1.7; tg[SRX] = 1.7; tg[SLZ] = 0.35; tg[SRZ] = -0.35; tg[EL] = 0.5; tg[ER] = 0.5;
      tg[HL] = 1.6; tg[KL] = -1.1; tg[HR] = 0.3; tg[KR] = -0.4;
      hx = p.vx; hy = p.vy; snap = true;
    } else if (p.dive > 0) {
      tg[PELY] = 0.5; tg[PELRX] = -1.35; tg[SLX] = 2.9; tg[SRX] = 2.9; tg[EL] = 0.1; tg[ER] = 0.1; tg[HL] = 0.1; tg[HR] = -0.1; tg[KL] = -0.1; tg[KR] = -0.2;
      hx = p.vx; hy = p.vy;
    } else if (p.stun > 0) {                                  // lost his footing
      const w = Math.sin(time * 13 + f.seed);
      tg[PELY] = HIP - 0.16; tg[CHRX] = -0.8; tg[SLX] = 0.7 + w * 0.3; tg[SRX] = 0.5 - w * 0.3; tg[SLZ] = -0.8; tg[SRZ] = 0.8;
      tg[HL] = 0.55; tg[KL] = -0.95; tg[HR] = -0.3; tg[KR] = -0.35; tg[HEADRX] = 0.4;
    } else if (s.celeb && s.G.state === 'dead') {
      if (p.team === s.celeb.team) snap = celebrate(f, p === s.celeb.who, tg);
      else {                                                  // heads down
        tg[CHRX] = -0.18; tg[HEADRX] = -0.4; tg[SLX] = 0.15; tg[SRX] = 0.15; tg[SLZ] = -0.4; tg[SRZ] = 0.4; tg[EL] = 1.5; tg[ER] = 1.5;
      }
    } else if (p.eng || p.block) {                            // locked up in a block
      const o = p.eng || p.block, w = Math.sin(time * 15 + f.seed);
      hx = o.x - p.x; hy = o.y - p.y;
      tg[PELY] = HIP - 0.12; tg[CHRX] = -0.4; tg[HEADRX] = 0.3; tg[SLX] = 1.45; tg[SRX] = 1.45; tg[EL] = 0.25; tg[ER] = 0.25;
      tg[HL] = 0.45 + w * 0.3; tg[HR] = 0.45 - w * 0.3; tg[KL] = -0.75; tg[KR] = -0.75;
    } else if (p.thrT > 0) {                                  // throwing motion: cock, then whip through
      const u = 1 - p.thrT / 0.32;
      if (u < 0.45) { const a = u / 0.45; tg[SRX] = lerp(1.3, 3.5, a); tg[ER] = 1.5; tg[CHRY] = 0.5; }
      else { const a = (u - 0.45) / 0.55; tg[SRX] = lerp(3.5, 1.0, a); tg[ER] = lerp(1.5, 0.15, a); tg[CHRY] = lerp(0.5, -0.4, a); }
      tg[SLX] = 0.8; tg[EL] = 1.0; tg[HL] = 0.4; tg[KL] = -0.3; tg[HR] = -0.3; tg[KR] = -0.2; tg[CHRX] = -0.1;
      snap = true;
    } else if (ps.mode === 'kick' && p === ps.qb && ps.air && ps.air.t < 0.45) {   // the kicker swings through the ball
      const u = ps.air.t / 0.45;
      tg[HR] = lerp(-0.7, 1.7, Math.min(1, u * 2.2)); tg[KR] = u < 0.2 ? -0.9 : -0.05; tg[HL] = -0.15; tg[KL] = -0.1;
      tg[CHRX] = 0.12; tg[SLX] = 0.9; tg[SLZ] = -0.6; tg[SRX] = -0.5; tg[SRZ] = 0.5; tg[PELY] = HIP + 0.04;
      snap = true;
    } else if (s.pre && sp < 0.4) {                           // set before the snap
      const st = stanceOf(p, s);
      if (st === 'line') { tg[PELY] = 0.56; tg[CHRX] = -1.2; tg[HEADRX] = 0.85; tg[HL] = 1.3; tg[KL] = -1.85; tg[HR] = 1.15; tg[KR] = -1.7; tg[SRX] = 1.2; tg[ER] = 0.05; tg[SLX] = 0.7; tg[EL] = 1.1; }
      else if (st === 'under') { tg[PELY] = 0.8; tg[CHRX] = -0.55; tg[HEADRX] = 0.4; tg[HL] = 0.75; tg[KL] = -1.25; tg[HR] = 0.75; tg[KR] = -1.25; tg[SLX] = 0.95; tg[SRX] = 0.95; tg[EL] = 0.3; tg[ER] = 0.3; }
      else if (st === 'two') { tg[PELY] = 0.89; tg[CHRX] = -0.35; tg[HEADRX] = 0.25; tg[HL] = 0.5; tg[KL] = -0.95; tg[HR] = 0.5; tg[KR] = -0.95; tg[SLX] = 0.3; tg[SRX] = 0.3; tg[EL] = 1.0; tg[ER] = 1.0; }
      else { tg[PELY] = 0.95; tg[CHRX] = -0.22; tg[HEADRX] = 0.15; tg[HL] = 0.45; tg[KL] = -0.6; tg[HR] = -0.1; tg[KR] = -0.35; tg[SLX] = 0.3; tg[EL] = 0.9; tg[SRX] = -0.2; tg[ER] = 0.7; }
      hx = 0; hy = p.team === ps.offTeam ? s.dir : -s.dir;
    } else {
      /* on the move, or standing */
      let facing = sp > 1 ? 1 : 0;
      if (sp > 1) { hx = p.vx; hy = p.vy; }
      const cover = s.live && p.team !== ps.offTeam && !ps.open && !ps.air && p.asg !== 'rush' && ps.qb;
      if (inPocket) { hx = 0; hy = s.dir; facing = p.vy * s.dir >= 0 ? 1 : -1; }
      else if (cover) { hx = ps.qb.x - p.x; hy = ps.qb.y - p.y; facing = p.vx * hx + p.vy * hy >= 0 ? 1 : -1; }   // eyes on the quarterback
      const amp = facing < 0 ? 0.6 : 0.95, dirn = facing < 0 ? -1 : 1;
      tg[HL] = sn * amp * run * dirn; tg[HR] = -sn * amp * run * dirn;
      tg[KL] = -(0.2 + 1.2 * Math.max(0, cs * dirn)) * run; tg[KR] = -(0.2 + 1.2 * Math.max(0, -cs * dirn)) * run;
      tg[SLX] = -sn * 0.75 * run * dirn; tg[SRX] = sn * 0.75 * run * dirn; tg[EL] = 0.3 + 1.2 * run; tg[ER] = 0.3 + 1.2 * run;
      tg[CHRX] = facing < 0 ? 0.04 : -(0.08 + 0.26 * run); tg[HEADRX] = -tg[CHRX] * 0.6;
      tg[PELY] = HIP - 0.04 * run + Math.abs(cs) * 0.05 * run;
      if (sp < 0.5) {                                          // standing: breathe, and some rest hands on hips
        tg[CHRX] += Math.sin(time * 2 + f.seed) * 0.012;
        if (!s.live && f.seed > 3.6) { tg[SLZ] = -0.45; tg[SRZ] = 0.45; tg[EL] = 1.6; tg[ER] = 1.6; tg[SLX] = 0.15; tg[SRX] = 0.15; }
      }
      if (inPocket) { tg[SLX] = 0.8; tg[SRX] = 0.8; tg[SLZ] = 0.25; tg[SRZ] = -0.25; tg[EL] = 1.75; tg[ER] = 1.75; tg[CHRX] = -0.06; }   // ball in both hands at the chest
      else if (carrier) { tg[SRX] = 0.5; tg[SRZ] = -0.15; tg[ER] = 2.0; }                                       // ball tucked away
      if (ps.mode === 'run' && s.live && ps.runner && ps.runner !== ps.qb) {                                    // the exchange
        if (p === ps.qb && !ps.handoff) { tg[SLX] = 0.75; tg[SRX] = 0.75; tg[SLZ] = 0.25; tg[SRZ] = -0.25; tg[EL] = 1.6; tg[ER] = 1.6; }        // both hands on the ball
        else if (p === ps.qb && ps.t < 1.7) { tg[SRX] = 1.25; tg[SRZ] = 0.5; tg[ER] = 0.15; tg[CHRY] = -0.35; tg[SLX] = 0.2; tg[EL] = 0.9; }     // arm left out after the give
        else if (p === ps.runner && !ps.handoff) { tg[SLX] = 1.0; tg[EL] = 1.5; tg[SRX] = 0.45; tg[ER] = 1.75; tg[SLZ] = 0.2; tg[SRZ] = -0.2; }  // arms make a pocket
      }
      if (ps.air && ps.air.target === p && ps.air.T - ps.air.t < 0.45) { tg[SLX] = 2.7; tg[SRX] = 2.7; tg[SLZ] = -0.15; tg[SRZ] = 0.15; tg[EL] = 0.35; tg[ER] = 0.35; tg[HEADRX] = 0.35; }
      if (p.juke > 0 && !(p.spinT > 0)) tg[PELRZ] = clamp(-p.vx * Math.cos(f.heading) * 0.06, -0.4, 0.4);
      if (p.truck > 0) {                                       // shoulder down, both arms over the ball
        tg[CHRX] = -0.85; tg[HEADRX] = 0.55; tg[SLX] = 0.9; tg[SRX] = 0.9; tg[SLZ] = 0.3; tg[SRZ] = -0.3; tg[EL] = 1.7; tg[ER] = 1.7; tg[PELY] -= 0.1;
      } else if (p.stiff > 0) { tg[SLX] = 1.45; tg[SLZ] = -0.55; tg[EL] = 0.05; tg[CHRY] = 0.28; }      // free arm locked out
      if (p.strip > 0) { tg[SRX] = 1.4 + Math.sin(time * 28) * 0.45; tg[ER] = 0.4; }                    // swiping at the ball
      if (p.hurdle > 0) {                                      // lead leg up and over, trail leg tucked
        const up = Math.sin(clamp(1 - p.hurdle / 0.5, 0, 1) * Math.PI);
        tg[PELY] = HIP + 0.62 * up; tg[HL] = 1.5; tg[KL] = -0.25; tg[HR] = -0.5; tg[KR] = -1.5; tg[CHRX] = -0.3;
        snap = true;
      }
    }
    /* A forward lean comes partly from the hips: the seat goes back and the jersey stays tucked in,
       instead of the chest folding over a level pelvis. The thighs counter-rotate so the feet stay put. */
    if (tg[PELRX] === 0 && tg[CHRX] < -0.15) {
      const lean = tg[CHRX] * 0.55;
      tg[PELRX] = lean; tg[CHRX] -= lean; tg[HL] -= lean; tg[HR] -= lean;
    }
    /* heading */
    if (hx !== null && (hx || hy)) {
      const want = Math.atan2(-hx, hy);
      let d = want - f.heading; d = Math.atan2(Math.sin(d), Math.cos(d));
      f.heading += f.snap ? d : d * (1 - Math.exp(-dt * 13));
    }
    if (p.spinT > 0) f.heading += dt * Math.PI * 2 / 0.5;
    /* ease the pose */
    const k = f.snap || snap ? (f.snap ? 1 : 1 - Math.exp(-dt * 60)) : 1 - Math.exp(-dt * 28);
    for (let i = 0; i < NPOSE; i++) f.cur[i] += (tg[i] - f.cur[i]) * k;
    f.snap = false;
    applyPose(f);
    f.root.position.set(p.x, 0, -p.y);
    f.root.rotation.y = f.heading;
  }

  /* ---------- textures ---------- */
  const PAD_X = 6, Y0 = -16, Y1 = 116, TEXW = 1280, TEXS = TEXW / (FW + 2 * PAD_X), TEXH = Math.round((Y1 - Y0) * TEXS);
  function paintField(t0, t1) {
    const c = fieldCanvas.getContext('2d'), S = TEXS, X = x => (x + PAD_X) * S, Y = y => (Y1 - y) * S;
    c.fillStyle = '#1b5a30'; c.fillRect(0, 0, TEXW, TEXH);
    c.fillStyle = '#e6ece6'; c.fillRect(X(-2), Y(112), (FW + 4) * S, 124 * S);                    // the white border
    for (let y = -10; y < 110; y += 5) {
      c.fillStyle = y < 0 ? t0.c1 : y >= 100 ? t1.c1 : (Math.floor(y / 5) & 1 ? '#2f8f46' : '#2a8440');
      c.fillRect(X(0), Y(y + 5), FW * S, 5 * S + 1);
    }
    for (let i = 0; i < 16000; i++) {                                                              // grass grain
      c.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
      c.fillRect(Math.random() * TEXW, Math.random() * TEXH, 2, 5 + Math.random() * 6);
    }
    if (envSnow) {                                                                                 // a dusting of snow, thicker in patches
      c.fillStyle = 'rgba(236,243,252,0.46)'; c.fillRect(0, 0, TEXW, TEXH);
      for (let i = 0; i < 900; i++) {
        c.fillStyle = `rgba(244,249,255,${0.05 + Math.random() * 0.12})`;
        c.beginPath(); c.ellipse(Math.random() * TEXW, Math.random() * TEXH, 10 + Math.random() * 46, 6 + Math.random() * 22, Math.random() * 3, 0, 7); c.fill();
      }
    }
    c.fillStyle = '#ffffff';
    for (let y = 0; y <= 100; y += 5) { const h = (y === 0 || y === 100 ? 0.42 : 0.2) * S; c.fillRect(X(0), Y(y) - h / 2, FW * S, h); }
    for (let y = 1; y < 100; y++) {
      if (y % 5 === 0) continue;
      for (const hx of [FW / 2 - 3.1, FW / 2 + 3.1]) c.fillRect(X(hx - 0.33), Y(y) - 0.07 * S, 0.66 * S, 0.14 * S);
      c.fillRect(X(0.3), Y(y) - 0.07 * S, 0.66 * S, 0.14 * S); c.fillRect(X(FW - 0.96), Y(y) - 0.07 * S, 0.66 * S, 0.14 * S);
    }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `800 ${3.3 * S}px Archivo, Arial, sans-serif`; c.fillStyle = 'rgba(255,255,255,0.86)';
    for (let y = 10; y <= 90; y += 10) { const n = String(y <= 50 ? y : 100 - y); c.fillText(n, X(9), Y(y)); c.fillText(n, X(FW - 9), Y(y)); }
    c.font = `800 ${5 * S}px Archivo, Arial, sans-serif`; c.fillStyle = 'rgba(255,255,255,0.88)';
    c.fillText(t0.name.toUpperCase(), X(FW / 2), Y(-5), (FW - 4) * S); c.fillText(t1.name.toUpperCase(), X(FW / 2), Y(105), (FW - 4) * S);
    c.globalAlpha = 0.55; c.fillStyle = t0.c1; c.beginPath(); c.arc(X(FW / 2), Y(50), 5.5 * S, 0, 7); c.fill();
    c.globalAlpha = 1; c.strokeStyle = '#ffffff'; c.lineWidth = 0.18 * S; c.stroke();
    c.font = `800 ${3.6 * S}px Archivo, Arial, sans-serif`; c.fillStyle = 'rgba(255,255,255,0.92)'; c.fillText(t0.ab, X(FW / 2), Y(50) + 0.15 * S);
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 0.14 * S;                                // team areas
    c.strokeRect(X(-5.2), Y(70), 2.6 * S, 40 * S); c.strokeRect(X(FW + 2.6), Y(70), 2.6 * S, 40 * S);
    fieldTex.needsUpdate = true;
  }
  function paintCrowd(t0, t1) {
    const u = crowdMat.uniforms;                               // the seats are drawn by the crowd shader; it only needs the colors
    u.uA1.value.set(t0.c1); u.uA2.value.set(t0.c2); u.uB1.value.set(t1.c1);
    /* ribbon board between the decks: team blocks */
    const r = ribbonCanvas.getContext('2d'), rw = ribbonCanvas.width, rh = ribbonCanvas.height;
    r.textAlign = 'center'; r.textBaseline = 'middle'; r.font = '800 22px Archivo, Arial, sans-serif';
    [t0, t1].forEach((t, i) => { r.fillStyle = t.c1; r.fillRect(i * rw / 2, 0, rw / 2, rh); r.fillStyle = 'rgba(255,255,255,0.92)'; r.fillText(t.name.toUpperCase(), i * rw / 2 + rw / 4, rh / 2 + 1); });
    ribbonTex.needsUpdate = true;
  }

  function paintBoard(G, t0, t1, down) {
    const c = boardCanvas.getContext('2d'), w = 512, h = 160;
    c.fillStyle = '#05080f'; c.fillRect(0, 0, w, h);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    if (!G.ros) {
      c.fillStyle = '#ffffff'; c.font = '800 54px Archivo, Arial, sans-serif'; c.fillText('POCKET GRIDIRON', w / 2, h / 2 + 2, w - 40);
    } else {
      c.fillStyle = t0.c1; c.fillRect(0, 0, 150, 104); c.fillStyle = t1.c1; c.fillRect(w - 150, 0, 150, 104);
      c.fillStyle = '#ffffff'; c.font = '800 30px Archivo, Arial, sans-serif'; c.fillText(t0.ab, 75, 28); c.fillText(t1.ab, w - 75, 28);
      c.font = '800 56px Archivo, Arial, sans-serif'; c.fillText(G.score[0], 75, 72); c.fillText(G.score[1], w - 75, 72);
      const sec = Math.ceil(G.clock || 0);
      c.font = '800 46px Archivo, Arial, sans-serif'; c.fillText(Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0'), w / 2, 44);
      c.font = '700 20px Archivo, Arial, sans-serif'; c.fillStyle = '#9fb0cc';
      c.fillText(G.q > 4 ? 'OVERTIME' : ['1ST', '2ND', '3RD', '4TH'][G.q - 1] + ' QUARTER', w / 2, 84);
      c.fillStyle = '#0e1626'; c.fillRect(0, 106, w, 54);
      c.fillStyle = '#ffffff'; c.font = '800 28px Archivo, Arial, sans-serif';
      c.fillText(G.celeb ? 'TOUCHDOWN ' + (G.celeb.team === 0 ? t0 : t1).name.toUpperCase() : (down || '').toUpperCase(), w / 2, 134, w - 30);
    }
    boardTex.needsUpdate = true;
  }

  /* ---------- scene ---------- */
  function quadMesh(a, b, c, d, mat, ru, rv) {
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
    g.setAttribute('uv', new T.Float32BufferAttribute([0, 0, ru, 0, ru, rv, 0, 0, ru, rv, 0, rv], 2));
    const m = new T.Mesh(g, mat); scene.add(m); return m;
  }
  const box = (w, h, d, color, x, y, z, basic) => {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), basic ? new T.MeshBasicMaterial({ color }) : new T.MeshLambertMaterial({ color }));
    m.position.set(x, y, z); scene.add(m); return m;
  };
  function buildScene() {
    scene = new T.Scene();
    scene.fog = new T.Fog(0x0a1020, 190, 560);
    skyMat = SH.sky();
    skyDome = new T.Mesh(new T.SphereGeometry(800, 32, 16), skyMat);     // follows the camera, drawn first, never hides anything
    skyDome.renderOrder = -10; skyDome.frustumCulled = false; scene.add(skyDome);
    hemiLight = new T.HemisphereLight(0xdfe8ff, 0x24402c, 2.4); scene.add(hemiLight);
    sunLight = new T.DirectionalLight(0xffffff, 2.2); sunLight.position.set(-30, 80, 40); scene.add(sunLight);
    fillLight = new T.DirectionalLight(0xcfe0ff, 0.9); fillLight.position.set(45, 30, -70); scene.add(fillLight);

    groundMat = new T.MeshBasicMaterial({ color: 0x0c1220 });
    const ground = new T.Mesh(new T.PlaneGeometry(900, 900), groundMat);
    ground.rotation.x = -Math.PI / 2; ground.position.set(FW / 2, -0.6, -50); scene.add(ground);

    fieldCanvas = document.createElement('canvas'); fieldCanvas.width = TEXW; fieldCanvas.height = TEXH;
    fieldTex = new T.CanvasTexture(fieldCanvas); fieldTex.colorSpace = T.SRGBColorSpace;
    fieldTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    fieldMat = SH.turf(fieldTex);
    TOWERS.forEach(([x, y], i) => fieldMat.uniforms.uTowers.value[i].set(x, TOWER_H, -y));
    const field = new T.Mesh(new T.PlaneGeometry(FW + 2 * PAD_X, Y1 - Y0), fieldMat);
    field.rotation.x = -Math.PI / 2; field.position.set(FW / 2, 0, -(Y0 + Y1) / 2); scene.add(field);

    /* stands: a lower bowl and an upper deck, each four trapezoids around the field */
    ribbonCanvas = document.createElement('canvas'); ribbonCanvas.width = 512; ribbonCanvas.height = 32;
    ribbonTex = new T.CanvasTexture(ribbonCanvas); ribbonTex.colorSpace = T.SRGBColorSpace; ribbonTex.wrapS = T.RepeatWrapping;
    const ribbonMat = new T.MeshBasicMaterial({ map: ribbonTex, side: T.DoubleSide });
    crowdMat = SH.crowd();
    const ring4 = (x0, x1, ya, yb, h0, grow, rise, mat, ru, rv) => {     // inner rectangle, how far it steps out, how high it climbs
      const X0 = x0 - grow, X1 = x1 + grow, YA = ya - grow, YB = yb + grow, h1 = h0 + rise, side = ru || 9, end = ru ? ru * 0.55 : 5, v = rv || 2;
      quadMesh([x0, h0, -ya], [x0, h0, -yb], [X0, h1, -YB], [X0, h1, -YA], mat, side, v);          // left
      quadMesh([x1, h0, -yb], [x1, h0, -ya], [X1, h1, -YA], [X1, h1, -YB], mat, side, v);          // right
      quadMesh([x0, h0, -yb], [x1, h0, -yb], [X1, h1, -YB], [X0, h1, -YB], mat, end, v);           // far end
      quadMesh([x1, h0, -ya], [x0, h0, -ya], [X0, h1, -YA], [X1, h1, -YA], mat, end, v);           // near end
    };
    wallMat = new T.MeshBasicMaterial({ color: 0x0e1628, side: T.DoubleSide });
    ring4(-14, FW + 14, -24, 124, 1.6, 40, 22, crowdMat);
    ring4(-54, FW + 54, -64, 164, 23.6, 0.01, 5, ribbonMat, 3, 1);                                 // ribbon board between the decks
    ring4(-55, FW + 55, -65, 165, 28.6, 34, 24, crowdMat);
    ring4(-14, FW + 14, -24, 124, 0, 0.01, 1.6, wallMat);                                          // the wall at field level
    /* video boards behind both end zones */
    boardCanvas = document.createElement('canvas'); boardCanvas.width = 512; boardCanvas.height = 160;
    boardTex = new T.CanvasTexture(boardCanvas); boardTex.colorSpace = T.SRGBColorSpace;
    const boardMat = new T.MeshBasicMaterial({ map: boardTex, fog: false });
    for (const [y, ry] of [[128, 0], [-28, Math.PI]]) {
      const m = new T.Mesh(new T.PlaneGeometry(36, 11.25), boardMat); m.position.set(FW / 2, 13, -y); m.rotation.y = ry; scene.add(m);
      box(38, 13.2, 1, 0x05080f, FW / 2, 13, -(y + (ry ? -0.7 : 0.7)), true);
      box(1.2, 8, 1.2, 0x10182a, FW / 2 - 12, 4, -(y + (ry ? -1 : 1)), true); box(1.2, 8, 1.2, 0x10182a, FW / 2 + 12, 4, -(y + (ry ? -1 : 1)), true);
    }
    /* light towers in the four corners */
    const glowC = document.createElement('canvas'); glowC.width = glowC.height = 64;
    const gx = glowC.getContext('2d'), rg = gx.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.25, 'rgba(210,225,255,0.55)'); rg.addColorStop(1, 'rgba(160,190,255,0)');
    gx.fillStyle = rg; gx.fillRect(0, 0, 64, 64);
    const glowTex = new T.CanvasTexture(glowC);
    for (const [x, y] of TOWERS) {
      box(2.2, 78, 2.2, 0x1a2338, x, 39, -y, true);
      const panel = box(20, 9, 1, 0xf2f6ff, x, 80, -y, true); panel.material.fog = false; panel.lookAt(FW / 2, 0, -50);
      const sp = new T.Sprite(new T.SpriteMaterial({ map: glowTex, blending: T.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      sp.position.set(x, 80, -y); sp.scale.setScalar(75); scene.add(sp);
      towerPanels.push(panel); towerGlow.push(sp);
    }
    /* camera flashes in the lower bowl: a few all night, a burst when the crowd erupts */
    const fg = new T.BufferGeometry();
    fg.setAttribute('position', new T.BufferAttribute(new Float32Array(FLASHES * 3).fill(-999), 3));
    flashes = new T.Points(fg, new T.PointsMaterial({ map: glowTex, size: 5, transparent: true, blending: T.AdditiveBlending, depthWrite: false, fog: false }));
    flashes.frustumCulled = false; scene.add(flashes);
    /* goal posts, pylons */
    const postMat = new T.MeshLambertMaterial({ color: 0xe9edf5 });
    const cyl = (r, h, x, y, z, rz) => { const m = new T.Mesh(new T.CylinderGeometry(r, r, h, 8), postMat); m.position.set(x, y, z); if (rz) m.rotation.z = rz; scene.add(m); return m; };
    for (const y of [-10.6, 110.6]) {
      const g = new T.Group(); g.userData.y = y; scene.add(g); posts.push(g);
      g.add(cyl(0.16, 3.33, FW / 2, 1.67, -y), cyl(0.12, 6.4, FW / 2, 3.33, -y, Math.PI / 2),
        cyl(0.1, 11.5, FW / 2 - 3.1, 9.1, -y), cyl(0.1, 11.5, FW / 2 + 3.1, 9.1, -y));
    }
    for (const y of [-10, 0, 100, 110]) for (const x of [0, FW]) box(0.14, 0.5, 0.14, 0xff7a2f, x, 0.25, -y);
    /* benches */
    for (const x of [-7.6, FW + 7.6]) for (const y of [36, 50, 64]) box(0.7, 0.5, 9, 0x8b93a3, x, 0.25, -y);
    /* line of scrimmage, line to gain, first-down marker */
    const near = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
    const strip = color => { const m = new T.Mesh(new T.PlaneGeometry(FW, 0.3), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, ...near })); m.rotation.x = -Math.PI / 2; m.position.set(FW / 2, 0.03, 0); scene.add(m); return m; };
    losLine = strip(0x4dabf7); fdLine = strip(0xff7a2f);
    sticks = new T.Group();
    const pole = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 2.6, 6), new T.MeshLambertMaterial({ color: 0xff7a2f })); pole.position.y = 1.3;
    const disc = new T.Mesh(new T.CylinderGeometry(0.45, 0.45, 0.06, 14), new T.MeshLambertMaterial({ color: 0xff7a2f })); disc.rotation.z = Math.PI / 2; disc.position.y = 2.7;
    sticks.add(pole, disc); scene.add(sticks);
    /* markers under players */
    const ringGeo = new T.RingGeometry(0.85, 1.08, 28).rotateX(-Math.PI / 2);
    ring = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false, ...near })); ring.position.y = 0.05; scene.add(ring);
    targetRing = new T.Mesh(new T.RingGeometry(1.1, 1.3, 28).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, ...near })); targetRing.position.y = 0.05; scene.add(targetRing);
    /* ball */
    ball = new T.Group();
    const leather = new T.Mesh(new T.SphereGeometry(0.2, 12, 10).scale(0.62, 0.62, 1), new T.MeshLambertMaterial({ color: 0x7a4a21 }));
    const band = z => { const m = new T.Mesh(new T.TorusGeometry(0.094, 0.012, 4, 12), new T.MeshBasicMaterial({ color: 0xffffff })); m.position.z = z; return m; };
    const laces = new T.Mesh(new T.BoxGeometry(0.02, 0.012, 0.14), new T.MeshBasicMaterial({ color: 0xffffff })); laces.position.y = 0.125;
    ball.add(leather, band(0.13), band(-0.13), laces); ball.scale.setScalar(1.45); scene.add(ball);
    const blob = () => new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false, ...near });
    ballShadow = new T.Mesh(new T.CircleGeometry(0.3, 12).rotateX(-Math.PI / 2), blob()); ballShadow.position.y = 0.04; scene.add(ballShadow);
    contact = new T.InstancedMesh(new T.CircleGeometry(0.5, 16).rotateX(-Math.PI / 2), blob(), CAP);     // a soft patch right under each player
    contact.frustumCulled = false; contact.count = 0; scene.add(contact);
    /* body parts */
    parts = PART_DEFS.map(([name, joints, color, fit, shadow]) => {
      const mat = SH.rim(name === 'helmet' ? new T.MeshPhongMaterial({ color: 0xffffff, shininess: 120, specular: 0x9aa0aa }) : new T.MeshLambertMaterial({ color: 0xffffff }));
      const mesh = new T.InstancedMesh(GEO[name], mat, CAP * joints.length);
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0;
      for (let i = 0; i < CAP * joints.length; i++) mesh.setColorAt(i, col.set(0xffffff));
      scene.add(mesh);
      return { name, mesh, joints, color, fit, shadow };
    });
    const holder = new T.Group(); scene.add(holder);
    for (let i = 0; i < CAP; i++) { const f = makeFigure(); figs.push(f); holder.add(f.root); f.root.visible = false; }
    for (let i = 0; i < REFS; i++) {
      const f = figs[SIDELINE + MAXP + i];
      f.hide = REF_HIDE; setBuild(f, BUILD.ref); f.num.material = stripeMaterial();
      colorFigure(SIDELINE + MAXP + i, { ...REF_COLORS, skin: SKIN[(i * 2 + 1) % SKIN.length], glove: SKIN[(i * 2 + 1) % SKIN.length], visor: SKIN[(i * 2 + 1) % SKIN.length] });
      refs.push({ x: FW / 2, y: 50, vx: 0, vy: 0, anim: 0, fdDir: 1, placed: false });
    }
    buildShadows();
    buildWeather(glowTex);
    applyEnv({ time: 'night', weather: 'clear' });
  }

  /* ---------- shadows ----------
     Each light gets a flattened copy of the main body parts: the same geometry and the very same per-player
     matrices, pushed through one matrix that projects everything onto the turf away from that light. The stencil
     buffer makes sure a pixel is darkened once per light even where parts overlap. At night that gives every player
     four faint shadows, one from each light tower; by day, one from the sun. */
  const SHADOW_Y = 0.035, LIGHTS = 4, TOWER_H = 80;
  function buildShadows() {
    for (let L = 0; L < LIGHTS; L++) {
      const mat = new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.17, depthWrite: false, side: T.DoubleSide, forceSinglePass: true, fog: false,
        stencilWrite: true, stencilFunc: T.NotEqualStencilFunc, stencilRef: L + 1, stencilZPass: T.ReplaceStencilOp,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const meshes = parts.filter(p => p.shadow).map(p => {
        const m = new T.InstancedMesh(SHADOW_GEO[p.name], mat, 1);
        m.instanceMatrix = p.mesh.instanceMatrix;             // shared with the body part, so it costs no extra work per frame
        m.matrixAutoUpdate = false; m.frustumCulled = false; m.count = 0; m.renderOrder = 2 + L; m.userData.src = p.mesh;
        scene.add(m);
        return m;
      });
      shadowSets.push({ mat, meshes, on: false });
    }
  }
  /* Projects onto the plane y = SHADOW_Y. l is [x, y, z, w] in scene space: w = 1 for a lamp at that point, 0 for the direction to the sun. */
  function shadowMatrix(m, l) {
    const x = l[0], y = l[1], z = l[2], w = l[3], h = SHADOW_Y, d = y - h * w;
    return m.set(d, -x, 0, x * h, 0, -h * w, 0, y * h, 0, -z, d, z * h, 0, -w, 0, y);
  }

  /* ---------- time of day and weather ---------- */
  const TIMES = {
    night: { sky: ['#04070e', '#0b1324', '#17223d'], fog: '#0a1020', hemi: ['#dfe8ff', '#24402c', 2.4], sun: ['#ffffff', 2.2, [-30, 80, 40]], fill: 0.9,
      field: [1, 1, 1], crowd: 1, glow: 1, ground: '#0c1220', wall: '#0e1628', towers: true, shade: 0.17,
      stars: 1, cloud: 0.32, cloudCol: '#1b2438', rim: ['#93a8cc', 0.5] },
    dusk: { sky: ['#232a5c', '#8a4f72', '#f39a5e'], fog: '#5b4257', hemi: ['#ffd9c2', '#2c3a2e', 2.1], sun: ['#ffb27a', 2.8, [-95, 36, -20]], fill: 0.7,
      field: [1.02, 0.94, 0.86], crowd: 1.3, glow: 0.7, ground: '#1c1b2b', wall: '#1a1c30', towers: false, shade: 0.3,
      stars: 0.3, cloud: 0.5, cloudCol: '#d18c8a', rim: ['#ff9a5c', 0.5] },
    day: { sky: ['#2c6fd8', '#73abef', '#d3e6fb'], fog: '#bcd5f1', hemi: ['#ffffff', '#3f6a45', 2.8], sun: ['#fff3dc', 3.0, [-45, 90, 55]], fill: 0.55,
      field: [1.13, 1.13, 1.1], crowd: 1.8, glow: 0, ground: '#5a6676', wall: '#3a4662', towers: false, shade: 0.38,
      stars: 0, cloud: 0.45, cloudCol: '#ffffff', rim: ['#d4e3ff', 0.3] },
  };
  function applyEnv(e) {
    const t = TIMES[e.time] || TIMES.night, wet = e.weather === 'rain', snow = e.weather === 'snow', bad = wet || snow, dim = wet ? 0.72 : snow ? 0.88 : 1;
    const dark = t === TIMES.night;
    const su = skyMat.uniforms, grey = col2.set(dark ? '#161b25' : '#98a1ac');
    [su.uTop, su.uMid, su.uHorizon].forEach((u, i) => { u.value.set(t.sky[i]); if (bad) u.value.lerp(grey, 0.72); });
    su.uSunDir.value.set(t.sun[2][0], t.sun[2][1], t.sun[2][2]).normalize();
    su.uSunCol.value.set(t.sun[0]).multiplyScalar(dark || bad ? 0 : 1);
    su.uStars.value = bad ? 0 : t.stars; su.uCloud.value = bad ? 1 : t.cloud;
    su.uCloudCol.value.set(bad ? (dark ? '#1c212b' : '#8d96a2') : t.cloudCol);
    col.set(t.fog); if (bad) col.lerp(col2.set(dark ? '#161b25' : '#98a1ac'), 0.7);
    scene.fog.color.copy(col); scene.fog.near = wet ? 70 : snow ? 50 : 190; scene.fog.far = wet ? 340 : snow ? 290 : 560;
    hemiLight.color.set(t.hemi[0]); hemiLight.groundColor.set(t.hemi[1]); hemiLight.intensity = t.hemi[2] * dim;
    sunLight.color.set(t.sun[0]); sunLight.intensity = t.sun[1] * (bad ? 0.45 : 1); sunLight.position.set(t.sun[2][0], t.sun[2][1], t.sun[2][2]);
    fillLight.intensity = t.fill;
    crowdBase = t.crowd * dim * 0.62;
    groundMat.color.set(t.ground); wallMat.color.set(t.wall);
    const lamps = bad ? Math.max(t.glow, 0.8) : t.glow;       // the lights come on when the weather closes in
    for (const sp of towerGlow) { sp.visible = lamps > 0; sp.material.opacity = lamps; }
    for (const pn of towerPanels) pn.material.color.set(lamps > 0 ? '#f2f6ff' : '#5d6675');
    const fu = fieldMat.uniforms;
    fu.uTint.value.setRGB(t.field[0] * dim, t.field[1] * dim, t.field[2] * dim);
    fu.uWet.value = wet ? 1 : 0; fu.uSnow.value = snow ? 1 : 0; fu.uLamp.value = lamps; fu.uSky.value.copy(su.uHorizon.value);
    SH.rimColor.value.set(t.rim[0]).multiplyScalar(t.rim[1] * (bad ? 0.6 : 1));
    glowAmount = dark ? 0.75 : t === TIMES.dusk ? 0.6 : 0.3;
    const shade = t.shade * (bad ? 0.5 : 1);
    shadowSets.forEach((set, i) => {
      set.on = t.towers || i === 0; set.mat.opacity = shade;
      shadowMatrix(m4, t.towers ? [TOWERS[i][0], TOWER_H, -TOWERS[i][1], 1] : [t.sun[2][0], t.sun[2][1], t.sun[2][2], 0]);
      for (const m of set.meshes) { m.visible = set.on; m.matrix.copy(m4); m.matrixWorld.copy(m4); }
    });
    contact.material.opacity = t.towers ? 0.26 : 0.18;
    rainPts.visible = wet; snowPts.visible = snow;
    if (snow !== envSnow) { envSnow = snow; teamsKey = ''; }  // repaint the turf with or without its cover of snow
  }
  /* rain and snow: points in a box that follows the camera, wrapped so the box is always full */
  const NDROP = 1300, BOXW = 70, BOXH = 34;
  function buildWeather(dotTex) {
    const mk = (tex, size, opacity) => {
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(new Float32Array(NDROP * 3), 3));
      const pts = new T.Points(g, new T.PointsMaterial({ map: tex, size, transparent: true, opacity, depthWrite: false, fog: false }));
      pts.frustumCulled = false; pts.visible = false; pts.userData.seed = Float32Array.from({ length: NDROP * 3 }, Math.random);
      scene.add(pts);
      return pts;
    };
    const sc = document.createElement('canvas'); sc.width = 32; sc.height = 64;
    const x = sc.getContext('2d'), gr = x.createLinearGradient(0, 0, 0, 64);
    gr.addColorStop(0, 'rgba(214,228,255,0)'); gr.addColorStop(0.5, 'rgba(214,228,255,0.95)'); gr.addColorStop(1, 'rgba(214,228,255,0)');
    x.fillStyle = gr; x.fillRect(15, 0, 2, 64);
    rainPts = mk(new T.CanvasTexture(sc), 1.7, 0.5);
    snowPts = mk(dotTex, 0.5, 0.9);
  }
  const wrap = (v, c, size) => c - size / 2 + ((((v - c + size / 2) % size) + size) % size);
  function updateWeather(pts, fall, wind) {
    const a = pts.geometry.attributes.position, sd = pts.userData.seed, cx = camLook.x, cz = (camPos.z + camLook.z) / 2 - 8, snow = fall < 10;
    for (let i = 0; i < NDROP; i++) {
      const k = i * 3, sway = snow ? Math.sin(time * 1.3 + sd[k] * 40) * 1.1 : 0;
      a.setXYZ(i, wrap(sd[k] * BOXW + wind * time + sway, cx, BOXW), wrap(sd[k + 1] * BOXH - fall * time * (0.8 + sd[k + 2] * 0.4), BOXH / 2, BOXH), wrap(sd[k + 2] * BOXW, cz, BOXW));
    }
    a.needsUpdate = true;
  }
  /* The three officials. The referee stands behind the offense, the other two work the sidelines at the ball. */
  function updateRefs(G, ps, dt) {
    const base = SIDELINE + MAXP, off = ps.offTeam === 0 ? 1 : -1, pre = G.state === 'pre' || G.state === 'kickm', L = ps.los;
    let bx = ps.bx === undefined ? FW / 2 : ps.bx, by = L;
    const a = ps.air, c = ps.carrier;
    if (a) { bx = a.x; by = a.y; } else if (c && !pre) { bx = c.x; by = c.y; }
    const fy = clamp(by, -4, 104), lx = ps.bx === undefined ? FW / 2 : ps.bx;
    const spots = [[clamp(lx + 9, 5, FW - 5), clamp((pre ? L : by) - off * 14, -8, 108)], [-1.7, pre ? L : fy], [FW + 1.7, pre ? L + off * 7 : fy]];
    const sig = G.state === 'dead' ? G.sig : null;
    for (let i = 0; i < REFS; i++) {
      const f = figs[base + i], r = refs[i], tx = spots[i][0], ty = spots[i][1];
      if (!r.placed) { r.x = tx; r.y = ty; r.vx = r.vy = 0; r.placed = true; f.snap = true; }
      const dx = tx - r.x, dy = ty - r.y, d = Math.hypot(dx, dy), want = d > 1.2 ? Math.min(7, d * 1.6) : 0, k = 1 - Math.exp(-dt * 5);
      r.vx += ((d > 0.01 ? dx / d * want : 0) - r.vx) * k; r.vy += ((d > 0.01 ? dy / d * want : 0) - r.vy) * k;
      r.x += r.vx * dt; r.y += r.vy * dt; r.anim += Math.hypot(r.vx, r.vy) * dt * 0.65; r.fdDir = off;
      f.root.visible = true;
      poseRef(f, r, sig === 'fd' && i > 0 ? null : sig, bx, by, dt);
      writeFigure(f, base + i);
      contact.setMatrixAt(base + i, m4.makeTranslation(r.x, 0.04, -r.y));
    }
  }
  function hideFigure(f, i) {
    f.root.visible = false;
    for (const p of parts) for (let k = 0; k < p.joints.length; k++) p.mesh.setMatrixAt(i * p.joints.length + k, ZERO4);
    contact.setMatrixAt(i, ZERO4);
  }

  /* repaint everything that carries team colors, and stand the reserves along the sidelines */
  function setTeams(t0, t1) {
    paintField(t0, t1); paintCrowd(t0, t1);
    const kinds = [BUILD.line, BUILD.big, BUILD.slim, BUILD.back, BUILD.db, BUILD.end, BUILD.qb];
    for (let i = 0; i < SIDELINE; i++) {
      const home = i < SIDELINE / 2, n = i % (SIDELINE / 2), f = figs[i], t = home ? t0 : t1;
      const x = home ? -4.2 - (n % 2) * 1.1 : FW + 4.2 + (n % 2) * 1.1, y = 33 + n * 3.6 + (Math.random() - 0.5);
      setBuild(f, kinds[(i * 5 + n) % kinds.length]);
      f.root.position.set(x, 0, -y); f.root.rotation.y = home ? -Math.PI / 2 : Math.PI / 2; f.root.visible = true; f.snap = true;
      const c = teamColors(t, home, SKIN[Math.floor(Math.random() * SKIN.length)]);
      f.num.material = numberMaterial(Math.floor(Math.random() * 98) + 1, c.number);
      colorFigure(i, c);
    }
    for (const p of parts) p.mesh.instanceColor.needsUpdate = true;
  }

  /* ---------- public ---------- */
  function init(canvas) {
    renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    camera = new T.PerspectiveCamera(76, 1, 2, 900);
    renderer.info.autoReset = false;                    // the finishing pass renders several times a frame; count them all
    post = SH.post(renderer);
    buildScene();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { teamsKey = ''; boardKey = ''; numCache.clear(); });
    return true;
  }
  function resize(w, h, dpr) {
    W = w; H = h;
    renderer.setPixelRatio(Math.min(dpr, 2)); renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  /* field point to screen: { x, y, s } with s = pixels per yard there, or null when it is not in view */
  function project(x, y, z) {
    v3.set(x, z || 0, -y).project(camera);
    if (v3.z > 1 || v3.z < -1) return null;
    const sx = (v3.x + 1) / 2 * W, sy = (1 - v3.y) / 2 * H;
    v3b.set(x + 1, z || 0, -y).project(camera);
    return { x: sx, y: sy, s: Math.abs((v3b.x + 1) / 2 * W - sx) };
  }
  const m4 = new T.Matrix4(), dirV = new T.Vector3(), NIGHT = { time: 'night', weather: 'clear' };
  /* s: { G, P, ps, cam, teams, acc, shake, isCtl } */
  function render(s, dt) {
    time += dt;
    const G = s.G, P = s.P, ps = s.ps, t0 = s.teams[G.tm[0]], t1 = s.teams[G.tm[1]];
    const key = G.tm[0] + '-' + G.tm[1], e = s.env || NIGHT, ek = e.time + '|' + e.weather;
    if (ek !== envKey) { envKey = ek; applyEnv(e); }
    if (key !== teamsKey) { teamsKey = key; boardKey = ''; setTeams(t0, t1); }
    celebT = G.celeb && G.state === 'dead' ? celebT + dt : 0;
    const bk = G.ros ? [G.score, G.q, Math.ceil(G.clock || 0), s.down, !!G.celeb].join('|') : 'menu';
    if (bk !== boardKey) { boardKey = bk; paintBoard(G, t0, t1, s.down); }

    /* players */
    const fresh = ps !== lastPs; lastPs = ps;
    const st = { G, ps, pre: G.state === 'pre' || G.state === 'kickm', live: G.state === 'live' || G.state === 'replay', dir: G.dir || 1, celeb: G.celeb || null };
    let ctl = null;
    for (let i = 0; i < MAXP; i++) {
      const f = figs[SIDELINE + i], p = P[i];
      if (!p || !ps) { hideFigure(f, SIDELINE + i); continue; }
      if (fresh) {
        setBuild(f, buildOf(p.role));
        const home = p.team === 0, c = teamColors(home ? t0 : t1, home, SKIN[(p.num * 7 + i) % SKIN.length]);
        colorFigure(SIDELINE + i, c); f.num.material = numberMaterial(p.num, c.number);
        f.fall = 0; f.fallDir = Math.random() < 0.75 ? 1 : -1; f.snap = true; f.root.visible = true;
        f.heading = (p.team === ps.offTeam ? st.dir : -st.dir) > 0 ? 0 : Math.PI;
      }
      poseFor(f, p, st, dt);
      writeFigure(f, SIDELINE + i);
      contact.setMatrixAt(SIDELINE + i, m4.makeTranslation(p.x, 0.04, -p.y));
      if (s.isCtl(p)) ctl = p;
    }
    /* the benches, then the officials */
    const scored = G.celeb && G.state === 'dead' ? G.celeb.team : -1;
    for (let i = 0; i < SIDELINE; i++) {
      const f = figs[i];
      poseBench(f, (i < SIDELINE / 2 ? 0 : 1) === scored, dt);
      writeFigure(f, i);
      contact.setMatrixAt(i, m4.makeTranslation(f.root.position.x, 0.04, f.root.position.z));
    }
    if (ps && G.state !== 'menu') updateRefs(G, ps, dt);
    else for (const r of refs) r.placed = false;
    const active = ps && G.state !== 'menu' ? CAP : SIDELINE;
    for (const p of parts) { p.mesh.count = active * p.joints.length; p.mesh.instanceMatrix.needsUpdate = true; if (fresh) p.mesh.instanceColor.needsUpdate = true; }
    const cast = s.shadows !== false;
    for (const set of shadowSets) for (const m of set.meshes) { m.visible = set.on && cast; m.count = m.userData.src.count; }
    contact.count = active; contact.instanceMatrix.needsUpdate = true;

    /* ball */
    let bx = null, by = 0, bz = 0;
    ball.visible = !!ps;
    if (ps) {
      const a = ps.air, c = ps.carrier;
      if (a) {
        bx = a.x; by = a.y; bz = a.z;
        const u = Math.min(1, a.t / a.T), vz = a.kick ? a.h * 4 * (1 - 2 * u) / a.T : (-0.6 + a.h * 4 * (1 - 2 * u)) / a.T;
        dirV.set((a.x1 - a.x0) / a.T, vz, -(a.y1 - a.y0) / a.T).normalize();
        ball.quaternion.setFromUnitVectors(zAxis, dirV);
        if (a.kick) ball.rotateX(time * 14); else ball.rotateZ(time * 22);
      } else if (ps.loose) {
        bx = ps.loose.x; by = ps.loose.y; bz = ps.loose.z; ball.rotation.set(time * 9, time * 4, 0);
      } else if (c && G.state !== 'pre' && G.state !== 'kickm') {     // before the snap the ball waits on the turf
        const f = figs[SIDELINE + P.indexOf(c)];
        if (f) {
          const pocket = c === ps.qb && ps.mode === 'pass' && !ps.thrown && !ps.open && !c.down;
          if (pocket) v3.set(0.06, 0.4, -0.27).applyMatrix4(f.chest.matrixWorld); else v3.set(0.03, -0.24, -0.1).applyMatrix4(f.elR.matrixWorld);
          bx = v3.x; by = -v3.z; bz = v3.y;
          if (pocket && G.state === 'live' && ps.t < 0.16) { const u = ps.t / 0.16; bx = lerp(ps.bx, bx, u); by = lerp(ps.los, by, u); bz = lerp(0.18, bz, u) + Math.sin(u * Math.PI) * 0.25; }
          ball.rotation.set(0.35, f.heading, 0);
        }
      } else if (ps.mode !== 'ko' || G.state === 'pre') { bx = ps.bx; by = ps.los; bz = 0.18; ball.rotation.set(0, 0, 0); }
      if (bx === null) ball.visible = false; else ball.position.set(bx, bz, -by);
      ballShadow.visible = !!a; if (a) ballShadow.position.set(a.x, 0.04, -a.y);
      targetRing.visible = !!(a && !a.kick);
      if (targetRing.visible) { const mine = G.lock && a.target && a.target === G.me, pu = 1 + 0.12 * Math.sin(time * 16); targetRing.position.set(a.x1, 0.05, -a.y1); targetRing.scale.setScalar(mine ? pu : 1); targetRing.material.color.set(mine ? s.acc : '#ffffff'); }
    } else { ballShadow.visible = false; targetRing.visible = false; }
    ring.visible = !!ctl;
    if (ctl) { ring.position.set(ctl.x, 0.05, -ctl.y); ring.material.color.set(s.acc); }

    /* down markers */
    const showLines = G.state !== 'menu' && G.state !== 'over' && !(ps && ps.mode === 'ko');
    const L = ps ? ps.los : G.los, FD = ps ? ps.fd : G.fd;
    losLine.visible = showLines; fdLine.visible = showLines && FD > 0.1 && FD < 99.9; sticks.visible = fdLine.visible;
    losLine.position.z = -L; fdLine.position.z = -FD; sticks.position.set(-2.6, 0, -FD);

    /* camera flashes */
    const fp = flashes.geometry.attributes.position, rate = (1.2 + 70 * Math.min(1, cheer)) * dt;
    for (let i = 0; i < FLASHES; i++) {
      if (flashLife[i] > 0) { flashLife[i] -= dt; if (flashLife[i] <= 0) fp.setY(i, -999); continue; }
      if (Math.random() > rate / FLASHES * 3) continue;
      const u = Math.random(), v = 0.08 + Math.random() * 0.85, side = Math.floor(Math.random() * 4), g = 40 * v, h = 1.9 + 22 * v;
      if (side === 0) fp.setXYZ(i, -14 - g, h, -lerp(-24 - g, 124 + g, u));
      else if (side === 1) fp.setXYZ(i, FW + 14 + g, h, -lerp(-24 - g, 124 + g, u));
      else if (side === 2) fp.setXYZ(i, lerp(-14 - g, FW + 14 + g, u), h, -(124 + g));
      else fp.setXYZ(i, lerp(-14 - g, FW + 14 + g, u), h, 24 + g);
      flashLife[i] = 0.07 + Math.random() * 0.08;
    }
    fp.needsUpdate = true;
    /* crowd reacts */
    cheer = Math.max(0, cheer - dt * 0.5);
    const cu = crowdMat.uniforms;
    cu.uTime.value = time; cu.uCheer.value = Math.min(1, cheer); cu.uBase.value = crowdBase;
    skyMat.uniforms.uTime.value = time;

    /* camera */
    const cm = s.cam, menu = G.state === 'menu';
    if (menu) {
      const a = time * 0.06;
      v3.set(FW / 2 + Math.sin(a) * 58, 30 + Math.sin(a * 0.7) * 6, -50 + Math.cos(a) * 95); v3b.set(FW / 2, 2, -50);
    } else if (G.state === 'replay' && ps) {                             // replay: low, from the middle of the field
      const side = cm.fx > FW / 2 ? -1 : 1;
      v3.set(cm.fx + side * 13, 3.4, -(cm.fy - st.dir * 5)); v3b.set(cm.fx, 1.5, -cm.fy);
    } else if (G.celeb && G.state === 'dead' && G.celeb.who) {          // touchdown: circle the scorer
      const w = G.celeb.who, a = time * 0.55;
      v3.set(w.x + Math.sin(a) * 7.5, 2.9, -w.y + Math.cos(a) * 7.5); v3b.set(w.x, 2.1, -w.y);
    } else {
      /* once a ball carrier is in the open field the camera closes in on him */
      const chase = ps && ps.carrier && !ps.air && (ps.open || ps.mode === 'ko') && (G.state === 'live' || G.state === 'dead');
      zoom += ((chase ? 0.68 : 1) - zoom) * (1 - Math.exp(-dt * 2.4));
      const up = cm.up, back = (up ? 40 : 46) * zoom, ahead = (up ? 10 : 3) * zoom + (1 - zoom) * 8, tx = lerp(FW / 2, cm.fx, 0.75 + (1 - zoom) * 0.6);
      v3.set(tx, 24 * zoom, -(cm.fy - back)); v3b.set(tx, 0, -(cm.fy + ahead));
      if (G.state === 'pre' && ps && ps.mode !== 'ko' && !s.plain) {     // start close behind the formation, then pull out
        let e = clamp((G.preT - 0.1) / 1.15, 0, 1); e = e * e * (3 - 2 * e);
        v3.x = lerp(cm.fx + 2.5, v3.x, e); v3.y = lerp(7.5, v3.y, e); v3.z = lerp(-(cm.fy - (up ? 15 : 24)), v3.z, e);
        v3b.y = lerp(1.2, 0, e);
      }
    }
    const pre = G.state === 'pre', k = cm.snap ? 1 : pre ? 1 - Math.exp(-dt * 12) : G.state === 'replay' ? 1 - Math.exp(-dt * 6) : 1 - Math.exp(-dt * 4.2);
    cm.snap = false;
    camPos.lerp(v3, k); camLook.lerp(v3b, k);
    camera.position.copy(camPos);
    if (s.shake > 0) { camera.position.x += (Math.random() - 0.5) * 0.5; camera.position.y += (Math.random() - 0.5) * 0.5; }
    if (debugCam) { camera.position.set(...debugCam.pos); camLook.set(...debugCam.look); }
    camera.lookAt(camLook);
    skyDome.position.copy(camera.position);
    for (const g of posts) g.visible = Math.abs(-camera.position.z - g.userData.y) > 14;   // not the one the camera sits beside
    if (rainPts.visible) updateWeather(rainPts, 36, 6);
    if (snowPts.visible) updateWeather(snowPts, 4.2, 1.8);
    renderer.info.reset();
    if (post && s.fx !== false) { post.glow.value = glowAmount; post.render(scene, camera); }
    else { renderer.setRenderTarget(null); renderer.render(scene, camera); }
  }

  PG.r3d = {
    init, resize, render, project,
    cheer(v) { cheer = Math.max(cheer, v); },
    get info() { return renderer ? renderer.info.render : null; },
    get scene() { return scene; },                       // test hook
    /* test hook: { pos: [x, height, -y], look: [x, height, -y] } pins the camera for close-ups; null releases it */
    set debugCam(v) { debugCam = v; },
  };
})();
