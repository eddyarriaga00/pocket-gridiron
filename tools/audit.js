/* Interface audit for Pocket Gridiron. Load tools/harness.js first, then:
   await fetch('tools/audit.js?'+Date.now()).then(r=>r.text()).then(t=>(0,eval)(t))
   A.check('label')    inspect what is on screen now; findings are added to the log
   await A.menus()     walk the menu screens and inspect each (it starts a new test season and a new test career)
   A.play('exh')       a scripted game ('exh', 'season', 'career', 'camp') that inspects every new layout it passes through
   A.report()          the findings, grouped, with the screens each was seen on
   A.clear()           empty the log
   Run it at several window sizes (320 by 568 is the tightest phone). What it measures:
   target    a control whose touch area (its box plus any invisible ::before/::after extension) is under 44 by 44 CSS pixels,
   .         the size Apple's guidelines and the WCAG enhanced criterion ask for; under 24 is the WCAG 2.2 AA floor
   overlap   two controls whose touch areas overlap
   blocked   a control that something else covers at its centre
   clip      text that runs outside the box that clips it, or outside the game column
   cut       text shortened with an ellipsis
   tiny      type under 10 CSS pixels
   contrast  text under 4.5 to 1 against what is really behind it (3 to 1 for large type). Where the text sits over the
   .         field or the stadium, the picture is read back from the canvases as drawn at that moment.
   collide   two blocks of the in-game display that overlap
   scroll    a screen that scrolls sideways */
window.A = (() => {
  const q = s => document.querySelector(s), qa = (s, r) => [...(r || document).querySelectorAll(s)];
  const app = () => q('#app'), D = () => PG.dbg;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const MIN = 44, FLOOR = 24, TYPE_MIN = 10;
  let log = new Map(), shots = 0;

  const note = (type, what, detail, where, sev) => {
    const k = type + '|' + what;
    let e = log.get(k);
    if (!e) log.set(k, e = { type, what, detail, sev: sev || 0, where: new Set() });
    if ((sev || 0) > e.sev) {
      e.sev = sev;
      e.detail = detail;
    }
    e.where.add(where);
  };

  const STATE = /^(on|hot|sug|me|ok|no|has|k|w)$/;
  const kind = el => {
    let s = el.tagName.toLowerCase();
    const cl = typeof el.className === 'string' ? el.className.trim().split(/\s+/).filter(c => c && !STATE.test(c)) : [];
    if (cl.length) s += '.' + cl.join('.');
    else if (el.id) s += '#' + el.id;
    return s;
  };
  const path = el => {
    const out = [];
    for (let e = el, n = 0; e && e.id !== 'app' && n < 3; e = e.parentElement, n++) {
      out.unshift(e.id && n ? '#' + e.id : kind(e));
      if (e.id && n) break;
    }
    return out.join(' > ');
  };
  const words = el => (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40);

  const shown = el => {
    const r = el.getBoundingClientRect();
    if (r.width < 0.5 || r.height < 0.5) return false;
    for (let e = el; e && e.nodeType === 1; e = e.parentElement) {
      if (e.hidden) return false;
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false;
      if (e.id === 'app') break;
    }
    return true;
  };

  /* the touch area: the element's box, grown by any absolutely placed pseudo-element */
  const px = v => parseFloat(v) || 0;
  const hit = el => {
    const r = el.getBoundingClientRect(), es = getComputedStyle(el);
    let l = r.left, t = r.top, rt = r.right, b = r.bottom;
    if (es.position !== 'static') for (const p of ['::before', '::after']) {
      const cs = getComputedStyle(el, p);
      if (cs.content === 'none' || cs.content === 'normal' || cs.position !== 'absolute' || cs.pointerEvents === 'none') continue;
      l = Math.min(l, r.left + px(es.borderLeftWidth) + px(cs.left));
      t = Math.min(t, r.top + px(es.borderTopWidth) + px(cs.top));
      rt = Math.max(rt, r.right - px(es.borderRightWidth) - px(cs.right));
      b = Math.max(b, r.bottom - px(es.borderBottomWidth) - px(cs.bottom));
    }
    return { left: l, top: t, right: rt, bottom: b, width: rt - l, height: b - t };
  };

  /* ---- colour ---- */
  const rgba = s => {
    const m = /rgba?\(([^)]+)\)/.exec(s || '');
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const lum = c => {
    const f = v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const ratio = (a, b) => {
    const x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  const hex = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');

  /* a top-to-bottom gradient of rgba stops, `y` pixels down a box `total` pixels high: [r, g, b, a], or null for any other kind of image */
  function gradAt(str, y, total) {
    const m = /^linear-gradient\((.*)\)$/s.exec(str);
    if (!m || !/^rgba?\(/.test(m[1].trim())) return null;
    const st = [...m[1].matchAll(/rgba?\(([^)]+)\)\s*(?:([\d.]+)(%|px))?/g)].map(s => ({ c: rgba('rgba(' + s[1] + ')'), p: s[2] == null ? null : s[3] === '%' ? parseFloat(s[2]) / 100 * total : parseFloat(s[2]) }));
    if (st.length < 2) return null;
    if (st[0].p == null) st[0].p = 0;
    if (st[st.length - 1].p == null) st[st.length - 1].p = total;
    for (let i = 1; i < st.length - 1; i++) if (st[i].p == null) st[i].p = st[i - 1].p + (st[st.length - 1].p - st[i - 1].p) / (st.length - i);
    y = clamp(y, 0, total);
    for (let i = 1; i < st.length; i++) if (y <= st[i].p) {
      const a = st[i - 1], b = st[i], t = b.p > a.p ? clamp((y - a.p) / (b.p - a.p), 0, 1) : 0;
      return [0, 1, 2, 3].map(k => a.c[k] + (b.c[k] - a.c[k]) * t);
    }
    return st[st.length - 1].c;
  }

  /* what the two canvases show right now, read back so text over the field can be measured against it */
  let shot = null;

  function snap() {
    const r = app().getBoundingClientRect(), cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.round(r.width));
    cv.height = Math.max(1, Math.round(r.height));
    const x = cv.getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#0c1322';
    x.fillRect(0, 0, cv.width, cv.height);
    try {
      D().render();
      for (const s of [q('#gl'), q('#c')]) if (s && s.width && getComputedStyle(s).display !== 'none') x.drawImage(s, 0, 0, cv.width, cv.height);
    } catch (e) {}
    shot = { d: x.getImageData(0, 0, cv.width, cv.height).data, r, w: cv.width, h: cv.height };
    shots++;
  }

  const under = (vx, vy) => {
    const X = clamp(Math.round(vx - shot.r.left), 0, shot.w - 1), Y = clamp(Math.round(vy - shot.r.top), 0, shot.h - 1), i = (Y * shot.w + X) * 4;
    return [shot.d[i], shot.d[i + 1], shot.d[i + 2]];
  };

  /* How a colour painted inside `el` ends up on screen at a point, and the surface it sits on: [text, surface].
     Follows backgrounds and group opacity up to the game column; null when a background cannot be resolved. */
  function resolve(el, col, vx, vy) {
    const chain = [];
    for (let e = el; e && e.id !== 'app'; e = e.parentElement) chain.push(e);
    let cur = under(vx, vy);
    const lay = [];
    for (let i = chain.length - 1; i >= 0; i--) {
      const e = chain[i], cs = getComputedStyle(e), below = cur;
      const c = rgba(cs.backgroundColor) || [0, 0, 0, 0];
      cur = mix(cur, c, c[3]);
      if (cs.backgroundImage !== 'none') {
        /* a background with attachment "local" is laid over the whole scrolling content and moves with it */
        const r = e.getBoundingClientRect(), loc = cs.backgroundAttachment === 'local';
        let g = gradAt(cs.backgroundImage, vy - r.top + (loc ? e.scrollTop : 0), loc ? e.scrollHeight : r.height || 1);
        if (!g) {
          /* some other gradient (the Sprint button's stamina fill): take whichever of its colours is hardest on this text */
          const stops = [...cs.backgroundImage.matchAll(/rgba?\([^)]+\)/g)].map(m => rgba(m[0])).filter(Boolean);
          if (!stops.length) return null;
          g = stops.reduce((w, c) => (ratio(mix(cur, c, c[3]), col) < ratio(mix(cur, w, w[3]), col) ? c : w));
        }
        cur = mix(cur, g, g[3]);
      }
      lay[i] = { below, o: +cs.opacity };
    }
    let S = cur, T = mix(S, col, col[3]);
    for (let i = 0; i < chain.length; i++) if (lay[i].o < 1) {
      S = mix(lay[i].below, S, lay[i].o);
      T = mix(lay[i].below, T, lay[i].o);
    }
    return [T, S];
  }

  const SKIP_CONTRAST = /#banner > b/;  // big chalk lettering over the field: it carries its own dark edge
  const HUD = ['.bug', '.sub', '#mine', '#rp', '#toast', '#banner b', '#banner span', '#tip', '#brief', '#ptype', '#meter', '#pw', '#pad .pb', '.sheet', '.intro', '.dlg'];

  function check(where) {
    const A = app().getBoundingClientRect(), found = [], add = (type, what, detail, sev) => {
      note(type, what, detail, where, sev);
      found.push(type + ' ' + what + ' ' + detail);
    };
    snap();
    /* a dialog covers everything else: while one is up, only what is inside it counts */
    const ov = q('#ov'), root = ov && shown(ov) ? ov : app();

    /* sideways scrolling */
    for (const el of qa('.menu,.sheet,.dlg', root)) if (shown(el) && el.scrollWidth > el.clientWidth + 1) add('scroll', path(el), `${el.scrollWidth} wide in ${el.clientWidth}`, 2);

    /* controls */
    const ctl = qa('button,input,a[href],[role=button]', root).filter(el => shown(el) && !el.disabled).map(el => ({ el, h: hit(el) }));
    for (const { el, h } of ctl) {
      const w = Math.round(h.width * 10) / 10, ht = Math.round(h.height * 10) / 10, r = el.getBoundingClientRect();
      if (w < MIN - 0.5 || ht < MIN - 0.5) add('target', path(el), `${Math.round(r.width)}×${Math.round(r.height)} drawn, ${w}×${ht} to touch`, w < FLOOR || ht < FLOOR ? 3 : Math.min(w, ht) < 32 ? 2 : 1);
      const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
      if (cx > A.left && cx < A.right && cy > Math.max(0, A.top) && cy < Math.min(innerHeight, A.bottom)) {
        const top = document.elementFromPoint(cx, cy);
        if (top && top !== el && !el.contains(top) && !top.contains(el)) add('blocked', path(el), 'covered by ' + path(top), 3);
      }
    }
    for (let i = 0; i < ctl.length; i++) for (let j = i + 1; j < ctl.length; j++) {
      const a = ctl[i], b = ctl[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const w = Math.min(a.h.right, b.h.right) - Math.max(a.h.left, b.h.left), h = Math.min(a.h.bottom, b.h.bottom) - Math.max(a.h.top, b.h.top);
      if (w > 1 && h > 1) add('overlap', path(a.el) + ' and ' + path(b.el), `${Math.round(w)}×${Math.round(h)} shared`, 3);
    }

    /* text */
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), rg = document.createRange();
    for (let n = tw.nextNode(); n; n = tw.nextNode()) {
      if (!n.nodeValue.trim()) continue;
      const el = n.parentElement;
      if (!el || /^(SCRIPT|STYLE|CANVAS)$/.test(el.tagName) || !shown(el)) continue;
      const cs = getComputedStyle(el), fs = parseFloat(cs.fontSize);
      if (fs < TYPE_MIN - 0.01) add('tiny', path(el), `${fs}px "${words(el)}"`, fs < 9 ? 2 : 1);
      rg.selectNodeContents(n);
      const rects = [...rg.getClientRects()].filter(r => r.width > 0.5);
      if (!rects.length) continue;
      let clipped = false;
      for (const r of rects) {
        if (r.left < A.left - 1 || r.right > A.right + 1) {
          add('clip', path(el), `runs ${Math.round(Math.max(A.left - r.left, r.right - A.right))}px off the side: "${words(el)}"`, 3);
          clipped = true;
        }
        for (let e = el; e && e.id !== 'app' && !clipped; e = e.parentElement) {
          const s = getComputedStyle(e);
          if (s.overflowX === 'visible' && s.overflowY === 'visible') continue;
          const b = e.getBoundingClientRect();
          if (s.overflowX !== 'visible' && (r.left < b.left - 1 || r.right > b.right + 1)) {
            add(s.textOverflow === 'ellipsis' ? 'cut' : 'clip', path(el), `${Math.round(Math.max(b.left - r.left, r.right - b.right))}px too wide for ${kind(e)}: "${words(el)}"`, s.textOverflow === 'ellipsis' ? 1 : 3);
            clipped = true;
          } else if ((s.overflowY === 'hidden' || s.overflowY === 'clip') && (r.top < b.top - 1 || r.bottom > b.bottom + 1)) {
            add('clip', path(el), `${Math.round(Math.max(b.top - r.top, r.bottom - b.bottom))}px too tall for ${kind(e)}: "${words(el)}"`, 3);
            clipped = true;
          }
        }
      }
      /* contrast, only for text that is on screen now */
      const r0 = rects[0];
      if (clipped || r0.bottom < Math.max(0, A.top) || r0.top > Math.min(innerHeight, A.bottom) || SKIP_CONTRAST.test(path(el))) continue;
      const col = rgba(cs.color);
      if (!col) continue;
      const big = fs >= 24 || (fs >= 18.66 && +cs.fontWeight >= 700), need = big ? 3 : 4.5;
      let worst = 99, at = null;
      for (const fx of [0.1, 0.5, 0.9]) {
        const res = resolve(el, col, r0.left + r0.width * fx, r0.top + r0.height / 2);
        if (!res) {
          worst = -1;
          break;
        }
        const c = ratio(res[0], res[1]);
        if (c < worst) {
          worst = c;
          at = res;
        }
      }
      if (worst === -1) add('contrast?', path(el), 'background not resolved', 0);
      else if (worst < need - 0.05) add('contrast', path(el), `${worst.toFixed(2)} to 1 (needs ${need}): ${hex(at[0])} on ${hex(at[1])} "${words(el)}"`, worst < 3 ? 3 : 2);
    }

    /* blocks of the in-game display on top of each other */
    const blocks = [];
    for (const s of HUD) for (const el of qa(s, root)) if (shown(el)) blocks.push({ s, el, r: el.getBoundingClientRect() });
    for (let i = 0; i < blocks.length; i++) for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i], b = blocks[j];
      if (a.s === b.s && a.s !== '#pad .pb') continue;
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left), h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (w > 1 && h > 1) add('collide', a.s + ' and ' + b.s, `${Math.round(w)}×${Math.round(h)} shared`, 2);
    }
    for (const b of blocks) if (b.r.left < A.left - 1 || b.r.right > A.right + 1 || b.r.top < A.top - 1 || b.r.bottom > A.bottom + 1) add('clip', b.s, `block runs off the game column by ${Math.round(Math.max(A.left - b.r.left, b.r.right - A.right, A.top - b.r.top, b.r.bottom - A.bottom))}px`, 3);
    return found;
  }

  /* ---- walking the menus ---- */
  const click = s => {
    const e = typeof s === 'string' ? q(s) : s;
    if (!e) throw new Error('nothing to click: ' + s);
    e.click();
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  /* look at a scrolling screen at the top, the middle and the bottom: what is under the thin part of the menu's scrim changes */
  const scan = label => {
    check(label);
    const m = q('#screen .menu');
    if (!m || m.scrollHeight <= m.clientHeight + 4) return;
    m.scrollTop = (m.scrollHeight - m.clientHeight) / 2;
    check(label + ' (middle)');
    m.scrollTop = m.scrollHeight;
    check(label + ' (bottom)');
    m.scrollTop = 0;
  };

  async function menus() {
    const errs = [], step = async(label, f) => {
      try {
        await f();
      } catch (e) {
        errs.push(label + ': ' + String(e.message || e).slice(0, 160));
      }
    };
    await step('menu', () => {
      PG.showMenu();
      scan('menu');
    });
    await step('settings', () => {
      click('#mS');
      scan('settings');
      click('#bk');
    });
    await step('how', () => {
      click('#mH');
      scan('how to play');
      click('#bk');
    });
    await step('exhibition', () => {
      click('#mE');
      scan('exhibition setup');
      click('#bk');
    });
    await step('milestones', () => {
      click('#mM');
      scan('milestones');
      click('#bk');
    });
    await step('camp', () => {
      click('#mT');
      scan('camp');
      click('.mode[data-d]');
      scan('camp drill card');
      click('#bk');
      click('#bk');
    });
    await step('season', () => {
      PG.season.open();
      if (q('#ret') && !q('#sgo')) {
        click('#ret');
        click('#ret');
      }
      scan('season new');
      click('#sgo');
      for (const t of ['table', 'sched', 'team', 'roster']) {
        click(`.tabs [data-t=${t}]`);
        scan('season hub ' + t);
      }
      click('#ret');
      scan('season hub start over');
      click('.tabs [data-t=table]');
      PG.showMenu();
      scan('menu with a season');
    });
    await step('career create', async() => {
      PG.career.open();
      if (q('#ret')) {
        click('#ret');
        scan('career so far');
        click('#nc');
      } else if (!q('#cgo')) {
        PG.showMenu();
        throw new Error('career is in the combine: finish or skip it first');
      }
      scan('career create');
      click('#cp [data-p=WR]');
      scan('career create receiver');
      q('#cn').value = 'Montgomery-Okafor';
      q('#cn').dispatchEvent(new Event('input'));
      q('#cj').value = '88';
      q('#cj').dispatchEvent(new Event('input'));
      click('#cgo');
      scan('combine');
      click('#d1');
      scan('dash');
      const tap = q('#tap');
      for (let i = 0; i < 400 && q('#tap'); i++) {
        tap.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
        await sleep(25);
      }
      scan('combine after the dash');
      click('#skip');
      scan('draft');
      click('#camp');
      for (const t of ['up', 'season', 'stats']) {
        click(`.tabs [data-t=${t}]`);
        scan('career hub ' + t);
      }
      PG.showMenu();
      scan('menu with a career');
    });
    return { errs, screens: shots };
  }

  /* ---- scripted games: every new arrangement of the display gets one inspection ---- */
  const sig = () => {
    const G = D().G, sh = q('#screen .shd b'), on = s => {
      const e = q(s);
      return e && shown(e) ? s : '';
    };
    return [G.state, G.pad || '', sh ? sh.textContent : '', q('#intro') ? 'intro' : '', q('#pad').children.length, on('#tip'), on('#brief'), on('#mine'), on('#meter'), on('#pw'), on('#rp'), on('#toast'), on('#banner'), on('#ptype') && q('#ptype').dataset.k, app().className, G.poss, q('#screen .tabs .on') ? q('#screen .tabs .on').textContent : ''].join('|');
  };

  function watch(label, steps) {
    const seen = new Set(), g = D();
    const going = () => g.G.state !== 'over' && g.G.state !== 'menu';
    let n = 0, quick = '', paused = 0;
    const look = () => {
      g.render();
      const s = sig();
      if (seen.has(s)) return;
      seen.add(s);
      const G = g.G;
      check(`${label}: ${G.state}${G.pad ? ' ' + G.pad : ''}${q('#screen .shd b') ? ' "' + q('#screen .shd b').textContent + '"' : ''}`);
    };
    while (going() && n++ < (steps || 400000)) {
      const G = g.G, k = G.state + '|' + (G.pad || '') + '|' + !!G.chg + '|' + q('#pad').children.length + '|' + !!q('#screen').firstChild;
      /* the play-call sheet: look at every tab before the test player picks */
      if (G.state === 'call' && k !== quick && q('#screen .tabs')) {
        const first = q('#screen .tabs .on').dataset.c;
        for (const b of qa('#screen .tabs button')) {
          click(`#screen .tabs [data-c=${b.dataset.c}]`);
          look();
        }
        click(`#screen .tabs [data-c=${first}]`);  // back to the tab the sheet opened on, so the test player's pick is the usual one
        if (!paused++) dialogs(label);
      }
      if (k !== quick || n % 25 === 0 || G.chg) look();
      quick = k;
      H.bot();
      g.step(0.02);
    }
    look();
    return seen.size;
  }

  function play(mode, opts = {}) {
    const errs = [];
    let layouts = 0;
    try {
      if (mode === 'exh') {
        PG.showMenu();
        click('#mE');
        if (opts.wx) click(`#wx [data-v=${opts.wx}]`);
        if (opts.tod) click(`#tod [data-v=${opts.tod}]`);
        click('#qls [data-q="60"]');
        click('#go');
        layouts = watch('exhibition');
        check('exhibition: final');
        click('#again');
      } else if (mode === 'season') {
        PG.season.open();
        click('#play');
        layouts = watch('season game');
        check('season: result');
        click('#rc');
        scanHub('season hub after a game');
      } else if (mode === 'career') {
        PG.career.open();
        if (q('#prac')) {
          click('#prac');
          layouts = watch('career practice');
          check('career: practice done');
          click('#rc');
        }
        click('#play');
        layouts += watch('career game');
        check('career: result');
        click('#rc');
        for (const t of ['up', 'season', 'stats']) {
          click(`.tabs [data-t=${t}]`);
          scanHub('career hub after a game ' + t);
        }
      } else if (mode === 'camp') {
        for (const d of PG.camp.DRILLS) {
          PG.camp.start(d.id);
          const g = D(), going = () => g.G.state !== 'over' && g.G.state !== 'menu', seen = new Set();
          let n = 0, quick = '';
          while (going() && n++ < 200000) {
            const G = g.G, k = G.state + '|' + (G.pad || '') + '|' + !!G.chg + '|' + q('#pad').children.length;
            if (k !== quick || n % 25 === 0 || G.chg) {
              g.render();
              const s = sig();
              if (!seen.has(s)) {
                seen.add(s);
                check(`camp ${d.id}: ${G.state}${G.pad ? ' ' + G.pad : ''}`);
              }
            }
            quick = k;
            H.campBot(1);
            g.step(0.02);
          }
          layouts += seen.size;
          check(`camp ${d.id}: result`);
        }
        PG.toMenu();
        PG.showMenu();
      }
    } catch (e) {
      errs.push(String(e.stack || e).slice(0, 400));
    }
    return { layouts, errs };
  }

  const scanHub = label => {
    check(label);
    const m = q('#screen .menu');
    if (m && m.scrollHeight > m.clientHeight + 4) {
      m.scrollTop = m.scrollHeight;
      check(label + ' (bottom)');
      m.scrollTop = 0;
    }
  };

  /* the pause and leave dialogs, on top of whatever game is running */
  function dialogs(label) {
    click('#pz');
    check(label + ': paused');
    click('#pq');
    check(label + ': leave?');
    click('#pk');
    click('#pr');
  }

  const report = (minSev = 0) => [...log.values()].filter(e => e.sev >= minSev).sort((a, b) => b.sev - a.sev || a.type.localeCompare(b.type))
    .map(e => `${'!'.repeat(e.sev) || '·'} ${e.type}: ${e.what} — ${e.detail} [${[...e.where].slice(0, 3).join('; ')}${e.where.size > 3 ? '; +' + (e.where.size - 3) : ''}]`);

  return {
    check, menus, play, dialogs, report, watch, sig, hit,
    clear() {
      log = new Map();
      shots = 0;
    },
    get log() {
      return log;
    },
    get screens() {
      return shots;
    }
  };
})();
