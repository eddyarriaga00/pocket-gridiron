/* Pocket Gridiron: 3D renderer (three.js).
   Draws the field, stadium, players and ball. game.js keeps its 2D canvas on top as a transparent overlay
   for letters, tags and the joystick, and asks this module to project field points onto the screen.

   Field coordinates are yards: x across, y upfield, z up. In the scene that is (x, z, -y).
   Players are one shared skeleton layout; every body part is an InstancedMesh, so all figures on screen
   cost about a dozen draw calls. Animation is procedural: a pose is 16 joint values, eased toward a target. */
(() => {
  'use strict';
  const T = window.THREE;
  if (!T) return;

  const FW = 53.33, HIP = 1.0, PSCALE = 1.6;
  const SIDELINE = 20, MAXP = 22, CAP = SIDELINE + MAXP;       // sideline figures come first, players after
  const lerp = (a, b, t) => a + (b - a) * t, clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const v3 = new T.Vector3(), v3b = new T.Vector3(), col = new T.Color(), zAxis = new T.Vector3(0, 0, 1);

  let renderer, scene, camera, W = 1, H = 1;
  let fieldTex, fieldCanvas, crowdTex, crowdCanvas, crowdMat, ribbonTex, ribbonCanvas;
  let parts = [], figs = [], shadows, ball, ballShadow, ring, targetRing, losLine, fdLine, sticks;
  let teamsKey = '', lastPs = null, time = 0, cheer = 0, debugCam = null;
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
  const GEO = {
    torso: cap(0.2, 0.28, 0.33).scale(1, 1, 0.78),
    pads: new T.SphereGeometry(0.22, 12, 8).scale(1.5, 0.62, 0.95).translate(0, 0.56, 0),
    hips: cap(0.185, 0.06, 0).scale(1, 1, 0.82),
    helmet: new T.SphereGeometry(0.165, 14, 10).scale(1, 1.03, 1.1),
    stripe: new T.TorusGeometry(0.172, 0.016, 4, 12, Math.PI).rotateY(Math.PI / 2).scale(2.2, 1.03, 1.1),
    visor: new T.SphereGeometry(0.125, 10, 8).scale(1, 0.62, 0.6).translate(0, -0.035, -0.12),
    mask: merge([
      new T.TorusGeometry(0.158, 0.011, 4, 10, Math.PI).rotateX(-Math.PI / 2).translate(0, -0.055, -0.02),
      new T.TorusGeometry(0.15, 0.011, 4, 10, Math.PI).rotateX(-Math.PI / 2).translate(0, -0.115, -0.02),
      new T.CylinderGeometry(0.011, 0.011, 0.1, 5).translate(0, -0.085, -0.172),
    ]),
    upperArm: cap(0.068, 0.19, -0.15),
    foreArm: cap(0.055, 0.17, -0.13),
    hand: new T.SphereGeometry(0.062, 8, 6).translate(0, -0.29, 0),
    thigh: cap(0.09, 0.3, -0.24),
    shin: cap(0.066, 0.3, -0.23),
    foot: new T.BoxGeometry(0.115, 0.075, 0.25).translate(0, -0.465, -0.055),
  };
  /* [name, joints it follows, color key] */
  const PART_DEFS = [
    ['torso', ['chest'], 'jersey'], ['pads', ['chest'], 'jersey'], ['hips', ['pelvis'], 'pants'],
    ['helmet', ['head'], 'helmet'], ['stripe', ['head'], 'stripe'], ['visor', ['head'], 'visor'], ['mask', ['head'], 'mask'],
    ['upperArm', ['shL', 'shR'], 'jersey'], ['foreArm', ['elL', 'elR'], 'skin'], ['hand', ['elL', 'elR'], 'glove'],
    ['thigh', ['hipL', 'hipR'], 'pants'], ['shin', ['kneeL', 'kneeR'], 'sock'], ['foot', ['kneeL', 'kneeR'], 'shoe'],
  ];
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
  function writeFigure(f, i) {
    f.root.updateMatrixWorld(true);
    for (const p of parts) for (let k = 0; k < p.joints.length; k++) p.mesh.setMatrixAt(i * p.joints.length + k, f[p.joints[k]].matrixWorld);
  }
  function colorFigure(i, c) {
    for (const p of parts) for (let k = 0; k < p.joints.length; k++) p.mesh.setColorAt(i * p.joints.length + k, col.set(c[p.color]));
  }
  function teamColors(t, home, skin) {
    return home
      ? { jersey: t.c1, pants: t.c2, helmet: t.c2, stripe: t.c1, sock: '#f1f1f1', number: t.c2, skin, glove: '#f1f1f1', shoe: '#1b1b1f', mask: '#aeb6c2', visor: '#14161c' }
      : { jersey: '#f1f1f1', pants: t.c1, helmet: t.c1, stripe: '#f1f1f1', sock: t.c1, number: t.c1, skin, glove: '#f1f1f1', shoe: '#1b1b1f', mask: '#aeb6c2', visor: '#14161c' };
  }

  /* ---------- animation: fill TG with the pose this player wants ---------- */
  function stanceOf(p, s) {
    if (p.isOL || /^D[ET]/.test(p.role) || p.role === 'TE') return 'line';
    if (p.role === 'QB') return Math.abs(p.y - s.ps.los) < 2.6 ? 'under' : 'two';
    return /^(RB|FB|OLB|MLB)/.test(p.role) ? 'two' : 'wide';
  }
  function poseFor(f, p, s, dt) {
    const tg = TG, ps = s.ps; tg.fill(0);
    const sp = Math.hypot(p.vx, p.vy), run = Math.min(1, sp / 7.5), ph = p.anim * 2.4, sn = Math.sin(ph), cs = Math.cos(ph);
    const carrier = ps.carrier === p && !ps.air, inPocket = carrier && p === ps.qb && ps.mode === 'pass' && !ps.thrown && !ps.open;
    let hx = null, hy = 0, snap = false;
    tg[PELY] = HIP; tg[EL] = 0.25; tg[ER] = 0.25; tg[CHRX] = -0.05;

    if (p.down) {                                             // on the turf
      f.fall = Math.min(1, f.fall + dt / 0.28);
      const e = f.fall * f.fall * (3 - 2 * f.fall);
      tg[PELY] = lerp(HIP, 0.24, e); tg[PELRX] = -1.5 * e * f.fallDir;
      tg[SLX] = 2.5; tg[SRX] = 2.8; tg[SLZ] = -0.5; tg[SRZ] = 0.4; tg[EL] = 0.5; tg[ER] = 0.3;
      tg[HL] = 0.2; tg[KL] = -0.4; tg[HR] = -0.1; tg[KR] = -0.15; tg[HEADRX] = 0.2;
      snap = true;
    } else if (p.dive > 0) {
      tg[PELY] = 0.5; tg[PELRX] = -1.35; tg[SLX] = 2.9; tg[SRX] = 2.9; tg[EL] = 0.1; tg[ER] = 0.1; tg[HL] = 0.1; tg[HR] = -0.1; tg[KL] = -0.1; tg[KR] = -0.2;
      hx = p.vx; hy = p.vy;
    } else if (p.stun > 0) {                                  // lost his footing
      const w = Math.sin(time * 13 + f.seed);
      tg[PELY] = HIP - 0.16; tg[CHRX] = -0.8; tg[SLX] = 0.7 + w * 0.3; tg[SRX] = 0.5 - w * 0.3; tg[SLZ] = -0.8; tg[SRZ] = 0.8;
      tg[HL] = 0.55; tg[KL] = -0.95; tg[HR] = -0.3; tg[KR] = -0.35; tg[HEADRX] = 0.4;
    } else if (s.celeb && s.G.state === 'dead') {
      if (p.team === s.celeb.team) {                          // arms up, bouncing
        const who = p === s.celeb.who ? 1.4 : 1, b = Math.abs(Math.sin(time * 6.5 + f.seed));
        tg[PELY] = HIP + b * 0.2 * who; tg[CHRX] = 0.08; tg[SLX] = 2.95; tg[SRX] = 2.95; tg[SLZ] = -0.3 - b * 0.2; tg[SRZ] = 0.3 + b * 0.2; tg[EL] = 0.2; tg[ER] = 0.2;
        tg[HL] = 0.1; tg[HR] = 0.1; tg[KL] = -0.25 * (1 - b); tg[KR] = -0.25 * (1 - b); tg[HEADRX] = 0.25;
      } else {                                                // heads down
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
      if (sp < 0.5) tg[CHRX] += Math.sin(time * 2 + f.seed) * 0.012;
      if (inPocket) { tg[SLX] = 0.8; tg[SRX] = 0.8; tg[SLZ] = 0.25; tg[SRZ] = -0.25; tg[EL] = 1.75; tg[ER] = 1.75; tg[CHRX] = -0.06; }   // ball in both hands at the chest
      else if (carrier) { tg[SRX] = 0.5; tg[SRZ] = -0.15; tg[ER] = 2.0; }                                       // ball tucked away
      if (ps.air && ps.air.target === p && ps.air.T - ps.air.t < 0.45) { tg[SLX] = 2.7; tg[SRX] = 2.7; tg[SLZ] = -0.15; tg[SRZ] = 0.15; tg[EL] = 0.35; tg[ER] = 0.35; tg[HEADRX] = 0.35; }
      if (p.juke > 0 && !(p.spinT > 0)) tg[PELRZ] = clamp(-p.vx * Math.cos(f.heading) * 0.06, -0.4, 0.4);
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
    const c = crowdCanvas.getContext('2d'), w = crowdCanvas.width, h = crowdCanvas.height;
    const pal = [t0.c1, t0.c1, t0.c2, t1.c1, '#d8dde8', '#8892a6', '#39476b', '#b7455a', '#5f86c9', '#2b3550'];
    c.fillStyle = '#0a101d'; c.fillRect(0, 0, w, h);
    for (let y = 2; y < h - 6; y += 10) {
      c.fillStyle = '#121a2c'; c.fillRect(0, y + 8, w, 2);                                         // the step behind each row
      for (let x = 2; x < w - 6; x += 8) {
        if (x % 64 < 6) continue;                                                                  // aisles
        if (Math.random() < 0.86) {
          c.fillStyle = pal[Math.floor(Math.random() * pal.length)]; c.fillRect(x, y + 3, 6, 5);
          c.fillStyle = Math.random() < 0.5 ? '#b99880' : '#7d6050'; c.fillRect(x + 1.5, y, 3, 3);
        } else { c.fillStyle = '#18213a'; c.fillRect(x, y + 3, 6, 5); }
      }
    }
    c.fillStyle = 'rgba(8,12,24,0.42)'; c.fillRect(0, 0, w, h);                                    // night: pull everything down
    crowdTex.needsUpdate = true;
    /* ribbon board between the decks: team blocks */
    const r = ribbonCanvas.getContext('2d'), rw = ribbonCanvas.width, rh = ribbonCanvas.height;
    r.textAlign = 'center'; r.textBaseline = 'middle'; r.font = '800 22px Archivo, Arial, sans-serif';
    [t0, t1].forEach((t, i) => { r.fillStyle = t.c1; r.fillRect(i * rw / 2, 0, rw / 2, rh); r.fillStyle = 'rgba(255,255,255,0.92)'; r.fillText(t.name.toUpperCase(), i * rw / 2 + rw / 4, rh / 2 + 1); });
    ribbonTex.needsUpdate = true;
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
    const sky = document.createElement('canvas'); sky.width = 4; sky.height = 256;
    const sx = sky.getContext('2d'), grad = sx.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#04070e'); grad.addColorStop(0.55, '#0b1324'); grad.addColorStop(1, '#17223d');
    sx.fillStyle = grad; sx.fillRect(0, 0, 4, 256);
    scene.background = new T.CanvasTexture(sky); scene.background.colorSpace = T.SRGBColorSpace;
    scene.add(new T.HemisphereLight(0xdfe8ff, 0x24402c, 2.4));
    const sun = new T.DirectionalLight(0xffffff, 2.2); sun.position.set(-30, 80, 40); scene.add(sun);

    const ground = new T.Mesh(new T.PlaneGeometry(900, 900), new T.MeshBasicMaterial({ color: 0x0c1220 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(FW / 2, -0.6, -50); scene.add(ground);

    fieldCanvas = document.createElement('canvas'); fieldCanvas.width = TEXW; fieldCanvas.height = TEXH;
    fieldTex = new T.CanvasTexture(fieldCanvas); fieldTex.colorSpace = T.SRGBColorSpace;
    fieldTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const field = new T.Mesh(new T.PlaneGeometry(FW + 2 * PAD_X, Y1 - Y0), new T.MeshBasicMaterial({ map: fieldTex }));
    field.rotation.x = -Math.PI / 2; field.position.set(FW / 2, 0, -(Y0 + Y1) / 2); scene.add(field);

    /* stands: a lower bowl and an upper deck, each four trapezoids around the field */
    ribbonCanvas = document.createElement('canvas'); ribbonCanvas.width = 512; ribbonCanvas.height = 32;
    ribbonTex = new T.CanvasTexture(ribbonCanvas); ribbonTex.colorSpace = T.SRGBColorSpace; ribbonTex.wrapS = T.RepeatWrapping;
    const ribbonMat = new T.MeshBasicMaterial({ map: ribbonTex, side: T.DoubleSide });
    crowdCanvas = document.createElement('canvas'); crowdCanvas.width = 256; crowdCanvas.height = 128;
    crowdTex = new T.CanvasTexture(crowdCanvas); crowdTex.colorSpace = T.SRGBColorSpace; crowdTex.wrapS = crowdTex.wrapT = T.RepeatWrapping;
    crowdMat = new T.MeshBasicMaterial({ map: crowdTex, side: T.DoubleSide });
    const ring4 = (x0, x1, ya, yb, h0, grow, rise, mat, ru, rv) => {     // inner rectangle, how far it steps out, how high it climbs
      const X0 = x0 - grow, X1 = x1 + grow, YA = ya - grow, YB = yb + grow, h1 = h0 + rise, side = ru || 9, end = ru ? ru * 0.55 : 5, v = rv || 2;
      quadMesh([x0, h0, -ya], [x0, h0, -yb], [X0, h1, -YB], [X0, h1, -YA], mat, side, v);          // left
      quadMesh([x1, h0, -yb], [x1, h0, -ya], [X1, h1, -YA], [X1, h1, -YB], mat, side, v);          // right
      quadMesh([x0, h0, -yb], [x1, h0, -yb], [X1, h1, -YB], [X0, h1, -YB], mat, end, v);           // far end
      quadMesh([x1, h0, -ya], [x0, h0, -ya], [X0, h1, -YA], [X1, h1, -YA], mat, end, v);           // near end
    };
    const wallMat = new T.MeshBasicMaterial({ color: 0x0e1628, side: T.DoubleSide });
    ring4(-14, FW + 14, -24, 124, 1.6, 40, 22, crowdMat);
    ring4(-54, FW + 54, -64, 164, 23.6, 0.01, 5, ribbonMat, 3, 1);                                 // ribbon board between the decks
    ring4(-55, FW + 55, -65, 165, 28.6, 34, 24, crowdMat);
    ring4(-14, FW + 14, -24, 124, 0, 0.01, 1.6, wallMat);                                          // the wall at field level
    /* light towers in the four corners */
    const glowC = document.createElement('canvas'); glowC.width = glowC.height = 64;
    const gx = glowC.getContext('2d'), rg = gx.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.25, 'rgba(210,225,255,0.55)'); rg.addColorStop(1, 'rgba(160,190,255,0)');
    gx.fillStyle = rg; gx.fillRect(0, 0, 64, 64);
    const glowTex = new T.CanvasTexture(glowC);
    for (const [x, y] of [[-70, -78], [FW + 70, -78], [-70, 178], [FW + 70, 178]]) {
      box(2.2, 78, 2.2, 0x1a2338, x, 39, -y, true);
      const panel = box(20, 9, 1, 0xf2f6ff, x, 80, -y, true); panel.material.fog = false; panel.lookAt(FW / 2, 0, -50);
      const sp = new T.Sprite(new T.SpriteMaterial({ map: glowTex, blending: T.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
      sp.position.set(x, 80, -y); sp.scale.setScalar(75); scene.add(sp);
    }
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
    shadows = new T.InstancedMesh(new T.CircleGeometry(0.62, 16).rotateX(-Math.PI / 2), blob(), CAP);
    shadows.frustumCulled = false; shadows.count = 0; scene.add(shadows);
    /* body parts */
    parts = PART_DEFS.map(([name, joints, color]) => {
      const mesh = new T.InstancedMesh(GEO[name], new T.MeshLambertMaterial({ color: 0xffffff }), CAP * joints.length);
      mesh.instanceMatrix.setUsage(T.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0;
      for (let i = 0; i < CAP * joints.length; i++) mesh.setColorAt(i, col.set(0xffffff));
      scene.add(mesh);
      return { mesh, joints, color };
    });
    const holder = new T.Group(); scene.add(holder);
    for (let i = 0; i < CAP; i++) { const f = makeFigure(); figs.push(f); holder.add(f.root); f.root.visible = false; }
  }

  /* repaint everything that carries team colors, and stand the reserves along the sidelines */
  function setTeams(t0, t1) {
    paintField(t0, t1); paintCrowd(t0, t1);
    const m4 = new T.Matrix4();
    for (let i = 0; i < SIDELINE; i++) {
      const home = i < SIDELINE / 2, n = i % (SIDELINE / 2), f = figs[i], t = home ? t0 : t1;
      const x = home ? -4.2 - (n % 2) * 1.1 : FW + 4.2 + (n % 2) * 1.1, y = 33 + n * 3.6 + (Math.random() - 0.5);
      f.cur.fill(0); f.cur[PELY] = HIP; f.cur[CHRX] = -0.04;
      if (n % 3 === 0) { f.cur[SLZ] = -0.45; f.cur[SRZ] = 0.45; f.cur[EL] = 1.6; f.cur[ER] = 1.6; f.cur[SLX] = 0.15; f.cur[SRX] = 0.15; }   // hands on hips
      else { f.cur[EL] = 0.3; f.cur[ER] = 0.3; }
      applyPose(f);
      f.root.position.set(x, 0, -y); f.root.rotation.y = home ? -Math.PI / 2 : Math.PI / 2; f.root.visible = true;
      const c = teamColors(t, home, SKIN[Math.floor(Math.random() * SKIN.length)]);
      f.num.material = numberMaterial(Math.floor(Math.random() * 98) + 1, c.number);
      colorFigure(i, c); writeFigure(f, i);
      shadows.setMatrixAt(i, m4.makeTranslation(x, 0.04, -y));
    }
    for (const p of parts) { p.mesh.instanceColor.needsUpdate = true; p.mesh.instanceMatrix.needsUpdate = true; }
    shadows.instanceMatrix.needsUpdate = true;
  }

  /* ---------- public ---------- */
  function init(canvas) {
    renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    camera = new T.PerspectiveCamera(76, 1, 2, 900);
    buildScene();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { teamsKey = ''; numCache.clear(); });
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
  const m4 = new T.Matrix4(), q4 = new T.Quaternion(), dirV = new T.Vector3();
  /* s: { G, P, ps, cam, teams, acc, shake, isCtl } */
  function render(s, dt) {
    time += dt;
    const G = s.G, P = s.P, ps = s.ps, t0 = s.teams[G.tm[0]], t1 = s.teams[G.tm[1]];
    const key = G.tm[0] + '-' + G.tm[1];
    if (key !== teamsKey) { teamsKey = key; setTeams(t0, t1); }

    /* players */
    const fresh = ps !== lastPs; lastPs = ps;
    const st = { G, ps, pre: G.state === 'pre' || G.state === 'kickm', live: G.state === 'live', dir: G.dir || 1, celeb: G.celeb || null };
    let ctl = null;
    for (let i = 0; i < MAXP; i++) {
      const f = figs[SIDELINE + i], p = P[i];
      if (!p || !ps) { f.root.visible = false; continue; }
      if (fresh) {
        const home = p.team === 0, c = teamColors(home ? t0 : t1, home, SKIN[(p.num * 7 + i) % SKIN.length]);
        colorFigure(SIDELINE + i, c); f.num.material = numberMaterial(p.num, c.number);
        f.fall = 0; f.fallDir = Math.random() < 0.75 ? 1 : -1; f.snap = true; f.root.visible = true;
        f.heading = (p.team === ps.offTeam ? st.dir : -st.dir) > 0 ? 0 : Math.PI;
      }
      poseFor(f, p, st, dt);
      writeFigure(f, SIDELINE + i);
      shadows.setMatrixAt(SIDELINE + i, m4.makeTranslation(p.x, 0.04, -p.y));
      if (s.isCtl(p)) ctl = p;
    }
    const active = SIDELINE + (ps ? Math.min(MAXP, P.length) : 0);
    for (const p of parts) { p.mesh.count = active * p.joints.length; p.mesh.instanceMatrix.needsUpdate = true; if (fresh) p.mesh.instanceColor.needsUpdate = true; }
    shadows.count = active; shadows.instanceMatrix.needsUpdate = true;

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
      } else if (c) {
        const f = figs[SIDELINE + P.indexOf(c)];
        if (f) {
          const pocket = c === ps.qb && ps.mode === 'pass' && !ps.thrown && !ps.open && !c.down;
          if (pocket) v3.set(0.06, 0.4, -0.27).applyMatrix4(f.chest.matrixWorld); else v3.set(0.03, -0.24, -0.1).applyMatrix4(f.elR.matrixWorld);
          bx = v3.x; by = -v3.z; bz = v3.y;
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

    /* crowd reacts */
    cheer = Math.max(0, cheer - dt * 0.5);
    crowdTex.offset.y = cheer > 0 ? Math.abs(Math.sin(time * 16)) * 0.012 * Math.min(1, cheer) : 0;
    crowdMat.color.setScalar(1 + 0.35 * Math.min(1, cheer));

    /* camera */
    const cm = s.cam, menu = G.state === 'menu';
    if (menu) {
      const a = time * 0.06;
      v3.set(FW / 2 + Math.sin(a) * 58, 30 + Math.sin(a * 0.7) * 6, -50 + Math.cos(a) * 95); v3b.set(FW / 2, 2, -50);
    } else {
      const up = cm.up, back = up ? 40 : 46, ahead = up ? 10 : 3, tx = lerp(FW / 2, cm.fx, 0.75);
      v3.set(tx, 24, -(cm.fy - back)); v3b.set(tx, 0, -(cm.fy + ahead));
    }
    const k = cm.snap || s.fresh ? 1 : 1 - Math.exp(-dt * 4.2);
    cm.snap = false;
    camPos.lerp(v3, k); camLook.lerp(v3b, k);
    camera.position.copy(camPos);
    if (s.shake > 0) { camera.position.x += (Math.random() - 0.5) * 0.5; camera.position.y += (Math.random() - 0.5) * 0.5; }
    if (debugCam) { camera.position.set(...debugCam.pos); camLook.set(...debugCam.look); }
    camera.lookAt(camLook);
    for (const g of posts) g.visible = Math.abs(-camera.position.z - g.userData.y) > 14;   // not the one the camera sits beside
    renderer.render(scene, camera);
  }

  PG.r3d = {
    init, resize, render, project,
    cheer(v) { cheer = Math.max(cheer, v); },
    get info() { return renderer ? renderer.info.render : null; },
    /* test hook: { pos: [x, height, -y], look: [x, height, -y] } pins the camera for close-ups; null releases it */
    set debugCam(v) { debugCam = v; },
  };
})();
