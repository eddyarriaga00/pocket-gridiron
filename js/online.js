/* Pocket Gridiron: the online layer, set up but not switched on.
   The owner plans head-to-head play and a global chat (2026-11-14). Both need something outside this site to carry
   messages between phones, and which service that is has not been chosen (docs/ONLINE.md lists the choices). So this
   file holds everything that does not depend on the choice: who the player is online (a name and an id kept on this
   device), what a message looks like, the rules a chat line must pass, and the shape an adapter has to have. Nothing
   here talks to a network. With no adapter set, ready() is false and every send is refused.

   An adapter is an object with:
     connect(profile)            -> Promise, resolves when it is live
     close()
     chatSend(msg)               msg: { id, name, text, at }
     onChat(fn)                  fn(msg) for every line, the player's own included
     matchHost()                 -> Promise<code>     a short code the other phone types in
     matchJoin(code)             -> Promise
     matchSend(data)             any JSON: inputs, a play call, a snapshot
     onMatch(fn)                 fn(data) from the other phone
     onState(fn)                 fn('connecting' | 'live' | 'closed', detail) */
(function () {
  const PG = window.PG, KEY = 'pg.profile', NAME_MAX = 16, TEXT_MAX = 140, EVERY = 2500;  // one line every two and a half seconds
  let adapter = null, state = 'off', lastSent = 0;
  const chatFns = [], matchFns = [], stateFns = [];

  const newId = () => Date.now().toString(36) + Math.floor(Math.random() * 1679616).toString(36);
  /* names and lines are plain text: no markup, no control characters, no links, runs of spaces closed up */
  const plain = (s, max) => String(s == null ? '' : s).replace(/[\u0000-\u001f\u007f<>]/g, '').replace(/\b(?:https?:\/\/|www\.)\S+/gi, '').replace(/\s+/g, ' ').trim().slice(0, max);

  function profile() {
    let p = PG.load(KEY, null);
    if (!p || !p.id) {
      p = { id: newId(), name: '' };
      PG.save(KEY, p);
    }
    return p;
  }

  function setName(name) {
    const p = profile();
    p.name = plain(name, NAME_MAX);
    PG.save(KEY, p);
    return p.name;
  }

  function setState(s, detail) {
    state = s;
    for (const f of stateFns) f(s, detail);
  }

  PG.online = {
    profile, setName, plain,
    /* is there a service to talk to? Until an adapter is set: no */
    ready: () => !!adapter,
    get state() {
      return state;
    },
    /* give it the adapter for the chosen service (see the top of this file) */
    use(a) {
      adapter = a || null;
      if (!adapter) return setState('off');
      if (adapter.onChat) adapter.onChat(m => {
        const msg = { id: String(m.id || ''), name: plain(m.name, NAME_MAX) || 'Player', text: plain(m.text, TEXT_MAX), at: +m.at || Date.now() };
        if (msg.text) for (const f of chatFns) f(msg);
      });
      if (adapter.onMatch) adapter.onMatch(d => {
        for (const f of matchFns) f(d);
      });
      if (adapter.onState) adapter.onState(setState);
    },
    connect() {
      if (!adapter) return Promise.reject(new Error('online play is not set up'));
      setState('connecting');
      return adapter.connect(profile()).then(() => setState('live'));
    },
    close() {
      if (adapter && adapter.close) adapter.close();
      setState(adapter ? 'closed' : 'off');
    },
    onState: f => stateFns.push(f),
    chat: {
      on: f => chatFns.push(f),
      /* returns '' when it went, or why it did not */
      send(text) {
        const t = plain(text, TEXT_MAX), p = profile(), now = Date.now();
        if (!adapter || state !== 'live') return 'Not connected';
        if (!p.name) return 'Pick a name first';
        if (!t) return 'Nothing to send';
        if (now - lastSent < EVERY) return 'One at a time';
        lastSent = now;
        adapter.chatSend({ id: p.id, name: p.name, text: t, at: now });
        return '';
      },
    },
    match: {
      on: f => matchFns.push(f),
      host: () => (adapter && state === 'live' ? adapter.matchHost() : Promise.reject(new Error('not connected'))),
      join: code => (adapter && state === 'live' ? adapter.matchJoin(plain(code, 12).toUpperCase()) : Promise.reject(new Error('not connected'))),
      send(data) {
        if (adapter && state === 'live') adapter.matchSend(data);
      },
    },
  };
})();
