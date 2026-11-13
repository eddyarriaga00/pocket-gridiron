/* Pocket Gridiron: the media around a career. Classic script, exposes PG.media.
   After every career game the internet reacts (fans of both teams, analysts, reporters, teammates, your rival, a quote
   from your coach), louder the better you played, and then you face three questions at the podium. What you say
   moves the coach's trust in you, your hype and your following, and a callout of the next opponent follows you into
   that game: back it up and it pays, lose and the receipts come out. career.js keeps the state (C.social) and draws
   the screens; this file writes the words. Every person, handle and outlet is invented. Cosmetic choices (which
   line, how many likes) use Math.random; what an answer does to trust is fixed, so a choice always means the same. */
(function () {
  'use strict';
  const { TEAMS } = PG;
  const any = a => a[Math.floor(Math.random() * a.length)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const FIRST = ['Marcus', 'Dre', 'Tyler', 'Jalen', 'Sam', 'Nico', 'Andre', 'Cole', 'Malik', 'Evan', 'Isaiah', 'Theo', 'Darius', 'Owen', 'Rico', 'Jordan', 'Luis', 'Kendall', 'Brandon', 'Zeke'];
  const REPORTERS = [['Dana', 'Whitfield', 'The Gridiron Ledger'], ['Ray', 'Moreno', 'Endzone Daily'], ['Priya', 'Shah', 'Pocket Sports Wire'], ['Glen', 'Hartley', 'Field Pass Radio'], ['Tasha', 'Greene', 'The Sideline Report'], ['Mike', 'Albright', 'Two-Minute Warning Podcast']];
  const ANALYSTS = [['Coach Vic', 'FilmRoomVic', 'former coach · film breakdowns'], ['Lena Ortiz', 'LenaOnTape', 'analyst, Endzone Daily'], ['The Chalkboard', 'ChalkboardFB', 'X’s and O’s'], ['Big Lou Mercer', 'BigLouTalks', 'ex-lineman · radio host']];
  const NEUTRAL = ['gridiron_takes', 'TwoMinuteDrill', 'blitz_happy', 'sundaysofa', 'ThirdAndLongPod', 'fantasy_flex_guy', 'pigskin_prophet', 'redzone_rae', 'hashmark_hank', 'cleats_and_coffee'];

  /* ---------- formatting ---------- */
  const short = n => (n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'K' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'K' : String(Math.round(n)));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lastOf = n => String(n || 'Rookie').trim().split(/\s+/).pop();
  const cap = s => s.replace(/\b[a-z]/g, ch => ch.toUpperCase()).replace(/\b(Til|I|Die)\b/g, w => w.toLowerCase() === 'i' ? 'I' : w.toLowerCase());
  const fill = (s, x) => s.replace(/\{(\w+)\}/g, (_, k) => (x[k] === undefined ? '' : x[k]));

  /* the words the templates use, from a game's context (see career.js gameEnd) */
  function words(c) {
    const T = TEAMS[c.team], O = TEAMS[c.opp], m = c.m, L = lastOf(c.name);
    const S = c.pos === 'QB' ? `${m.comp}/${m.att}, ${m.pyd} yards, ${m.ptd} TD${m.pint ? `, ${m.pint} INT` : ''}` : `${m.rec} catch${m.rec === 1 ? '' : 'es'}, ${m.recyd} yards${m.rectd ? `, ${m.rectd} TD` : ''}`;
    const nx = c.next != null ? TEAMS[c.next] : null, qb = mate(c, 'QB');
    return { N: c.name, L, LU: L.toUpperCase(), T: T.name, C: T.city, AB: T.ab, O: O.name, OC: O.city, OAB: O.ab, S, us: c.us, them: c.them, R: c.rival ? rivalName(c.rival) : '', RL: c.rival ? c.rival.name : '',
      pos: c.pos === 'QB' ? 'quarterback' : 'receiver', NX: nx ? nx.name : '', NXC: nx ? nx.city : '', unit: c.pos === 'QB' ? 'secondary' : 'corners', help: c.pos === 'QB' ? 'the guys up front' : qb ? `${qb.first} ${qb.last}` : 'our quarterback',
      coach: c.coachName || 'Coach', Q: c.quote || '' };
  }

  /* how loud the reaction is, 0 to 10, and which way it leans (-1 to 1) */
  function buzzOf(c) {
    const b = c.pts * 0.8 + (c.star ? 2 : 0) + (c.won ? 0.8 : -0.5) + (c.rivalGame && c.won ? 1.2 : 0) + (c.playoff ? 1 : 0) + (c.callRes ? 1.5 : 0);
    return { b: clamp(b, 0, 10), s: clamp((c.pts - 4.5) / 3.5 + (c.won ? 0.25 : -0.25), -1, 1) };
  }

  /* how the media sees your game: from the grade, a notch lower in a blowout loss (nobody calls a 33-0 loss efficient) */
  function tier(c) {
    const t = c.pts >= 7 || c.star ? 'great' : c.pts >= 5 ? 'good' : c.pts >= 3 ? 'meh' : 'bad';
    return c.them - c.us >= 17 ? { great: 'good', good: 'meh', meh: 'bad', bad: 'bad' }[t] : t;
  }

  /* Lines are dealt like cards: within one week nobody posts a line somebody else already posted. When a pool runs
     out, deal() gives null and that post is not made (see keep). reaction() starts a new week's deck; the quote
     reactions at the podium draw from the same one. */
  let dealt = new Set();

  function deal(arr) {
    const fresh = arr.filter(s => !dealt.has(s));
    if (!fresh.length) return null;
    const s = any(fresh);
    dealt.add(s);
    return s;
  }

  const keep = (list, p) => p && p.text != null && list.push(p);

  /* ---------- who posts ---------- */
  function fan(team) {
    // one of six kinds of account; within a week each account posts once (the deck keeps their handles too)
    const t = TEAMS[team], city = t.city.replace(/\s/g, ''), num = [...t.ab].reduce((a, ch) => a + ch.charCodeAt(0), 0) % 90 + 10, opts = FIRST.slice().sort(() => Math.random() - 0.5).slice(0, 3);
    const kinds = [[`${t.name} Faithful`, `${t.name}Faithful`], [`${t.ab} til I die`, `${t.ab}_til_i_die`], [`${t.city} Sports Talk`, `${city}Sports${num}`], [`${t.name} Nation`, `${t.name}Nation`]]
      .concat(opts.map(n => [`${n} | ${t.name} fan`, `${n.toLowerCase()}_${t.ab.toLowerCase()}`]), opts.map(n => [`${n} bleeds ${t.name}`, `${n}Bleeds${t.name}`])).sort(() => Math.random() - 0.5);
    const [who, at] = kinds.find(([, h]) => !dealt.has('@' + h)) || kinds[0];
    dealt.add('@' + at);
    return { who, at, kind: 'fan', col: t.c1 };
  }

  const neutral = () => {
    const h = any(NEUTRAL);
    return { who: cap(h.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')), at: h, kind: 'fan', col: '#4d5d7a' };
  };
  const analyst = () => {
    const [who, at, bio] = any(ANALYSTS);
    return { who, at, bio, kind: 'analyst', col: '#6d4bc4', ver: true };
  };
  const reporter = () => {
    const [f, l, o] = any(REPORTERS);
    return { who: `${f} ${l}`, at: `${f[0]}${l}`.replace(/\s/g, ''), bio: o, kind: 'press', col: '#2f6fb5', ver: true };
  };

  /* your teammates are the same men all career (career.js keeps them in C.social.mates): the quarterback who throws to
     you, or the receivers you throw to, and the linemen */
  const mate = (c, role) => (c.mates || []).find(m => m.role === role) || null;
  const teammate = (c, role) => {
    const m = mate(c, role) || (c.mates && c.mates[0]) || { first: any(FIRST), last: any(PG.NAMES), num: 10, role };
    return { who: `${m.first} ${m.last}`, at: `${m.first[0].toLowerCase()}${m.last.toLowerCase()}${m.num}`, bio: `${TEAMS[c.team].name} ${m.role}`, kind: 'mate', col: TEAMS[c.team].c1, ver: true };
  };

  /* the rival has a first name too (made from his surname, so it never changes) */
  const rivalName = r => `${FIRST[[...r.name].reduce((t, ch) => t + ch.charCodeAt(0), 0) % FIRST.length]} ${r.name}`;
  const rivalBy = (c, x) => ({ who: rivalName(c.rival), at: c.rival.name.toLowerCase() + '_' + TEAMS[c.rival.team].ab.toLowerCase(), bio: `${TEAMS[c.rival.team].name} ${x.pos}`, kind: 'rival', col: TEAMS[c.rival.team].c1, ver: true });

  function post(by, text, c, k) {
    // k: how much attention this kind of post gets (a reporter's final, a viral fan); no text, no post
    if (text == null) return null;
    const fol = c.fol || 2000, { b } = buzzOf(c), base = fol * 0.01 * (0.3 + (b / 4) * (b / 4)) * k * (0.5 + Math.random() * 1.6);  // a big day reaches far past your own followers
    return { ...by, text, likes: Math.max(1, Math.round(base)), rt: Math.round(base * (0.08 + Math.random() * 0.12)), rep: Math.round(base * (0.03 + Math.random() * 0.06)) };
  }

  /* times: the final is the oldest post on the page; under it the feed runs newest first, a minute or few apart, and
     each reply comes a little after the post it answers */
  const ago = m => (m < 1 ? 'now' : m < 60 ? `${Math.round(m)}m` : `${Math.floor(m / 60)}h`);

  function stamp(list) {
    let m = 0;
    list.forEach((p, i) => {
      if (p.kind === 'trend' || p.kind === 'wk') return;
      if (i === 0) p.ago = '1h';
      else {
        p.ago = ago(m);
        m += 1 + Math.random() * 3;
      }
      let r0 = 54;
      if (p.replies) p.replies.forEach(r => (r.ago = ago(Math.max(1, (r0 -= 3 + Math.random() * 6)))));
    });
    return list;
  }

  /* ---------- the lines ----------
     By tier (great, good, meh, bad: how you played) and, for the losing side's view, by the result. */
  const FAN = {
    great: ['{L} IS HIM. I’ve been saying it for weeks.', 'Somebody check on the {O} {unit} 😭', '{S}. Put some respect on {L}’s name.', 'WHAT A GAME FROM {LU}!!! 🔥🔥🔥', 'Pay {L}. Right now. Whatever it takes.', 'We got a real one in {C}.', '{L} cooked them all day. Not close.', 'I need a {L} jersey by Sunday 💯', 'Best I’ve felt about the {T} in years.', 'My dad just called me about {L}. My dad does not call me.', '{L} went full video game mode on the {O}.', 'The {O} are gonna see {L} in their sleep tonight.', 'Put {L} on the cover. I’m serious.', '{LU} SZN 🐐', 'Rewatched every {L} play twice. Still not tired of it.', 'Whoever drafted {L} deserves a raise.'],
    good: ['Solid day from {L}. Trending the right way.', '{L} keeps showing up. Love to see it.', '{S}. I’ll take that every week.', 'Quietly one of the best in the league. Watch.', '{L} made the plays when it mattered.', 'That’s a grown-up game from {L}.', 'Not flashy. Just good. That’s {L}.', '{L} is earning that spot week by week.'],
    meh: ['{L} was fine. We need more than fine.', 'Not his best, not his worst. Next week.', 'Quiet one for {L}. Let’s see the bounce back.', 'Some good, some bad from {L}. Still believe.', 'We need {L} to take over games, not just play in them.', 'Get {L} the ball more. Simple.'],
    bad: ['Rough one for {L}. It happens.', '{L} has to be better than that. Period.', 'Bench him? No. Fix it? Yes.', 'Still riding with {L}. Bad days happen.', 'That was hard to watch, {L}.', 'I’m not panicking. I’m concerned. There’s a difference.', 'One game doesn’t define {L}. Two might.'],
    goodLoss: ['{L} held up his end. Can’t say that for everyone.', 'Decent game from {L}. Just not enough today.', 'Can’t pin this one on {L}.', '{L} was fine. The rest of us need to catch up.'],
    badWin: ['W is a W, but {L} has to get going.', 'Won without {L} doing much. Can’t count on that every week.', 'Get {L} involved earlier next week.', 'Ugly win. {L} will be better.'],
    wasted: ['{L} did everything he could. The rest of the team didn’t show up.', 'Wasting a day like that from {L} should be illegal.', '{S} in a LOSS. Somebody explain that to me.', 'Not on {L}. Not even a little.', '{L} played winning football. The scoreboard didn’t get the memo.', 'Fix the defense and {L} wins us games like this.'],
  };

  // the other side's fans: their team lost (beaten) or won (won)
  const OPP = {
    beaten: {
      great: ['Refs gave {L} half those yards.', 'Ok {L} is actually good. I hate it here.', 'Our defense owes the whole city of {OC} an apology.', 'Can’t even be mad. {L} was cooking.', 'We made {L} look like a Hall of Famer smh', 'Fire our defensive coordinator. Tonight.', 'Who was supposed to cover {L}?? Anybody??'],
      good: ['{L} got lucky on a couple of those.', 'We’ll see {L} again. Different story next time.', 'Not that impressed with {L} tbh.', 'We beat ourselves today. {L} just showed up.'],
      meh: ['We lost to THAT? Embarrassing.', 'Their whole team beat us, not {L}.', 'Our {unit} actually held {L} in check. The rest of us didn’t.'],
      bad: ['We lost to a team where {L} did nothing?? Unreal.', 'Held {L} to nothing and still lost. Classic {O}.'],
    },
    won: {
      great: ['{L} can keep the yards. We’ll keep the W.', 'Great game from {L}. Shame about the scoreboard 😂', 'Let him have his stats. Scoreboard.'],
      good: ['W. {L} did some stuff, didn’t matter.', 'We’ll take that win. Next.', '{L} had a few. We had the last laugh.'],
      meh: ['{L} who? 😂', 'All that hype for that?', 'Our {unit} did their job on {L}.', 'Easy work. Next.'],
      bad: ['{L} who? 😂', 'Our defense ate {L} alive.', 'Overrated. Said it all week.', 'Thank you {L} for the free win 🙏', 'Hey {C}, you can have {L} back now.', 'Put {L} on the scout team.'],
    },
  };

  // people with no side
  const NEUTRAL_LINES = {
    great: ['{L} is the best story in the league right now.', 'Whatever {L} is doing in practice, keep doing it.', '{S}. Fantasy managers who started {L}: you’re welcome.', 'That’s a statement game from {L}.'],
    good: ['{L} keeps stacking quietly good games.', 'Steady from {L}. The {T} will need more of that.', 'Underrated performance from {L} today.'],
    meh: ['Middle of the road for {L}. On to next week.', 'Not a lot to say about {L} today, honestly.'],
    bad: ['Tough watch if you’re a {T} fan.', '{L} will want this one back.', 'Long week of film coming for {L}.'],
  };
  const THREAD = {
    great: ['This is the game people will remember from this season.', 'Big day. Bigger week coming.'],
    good: ['Fair line. On to next week.', 'Good, not great. Fine by me.'],
    meh: ['Ok, noted.', 'Forgettable. Next.'],
    bad: ['Long week ahead for that guy.', 'Film session is gonna be quiet.'],
  };
  const ANALYST = {
    great: ['{N}: {S}. That’s not a hot streak, that’s a player arriving.', 'Go watch the tape on {L}. The decisions were as good as the numbers.', 'Defensive coordinators around the league just added {L} to the Monday meeting.', 'If you’re still calling {L} a project, you’re not watching.'],
    good: ['Efficient day from {L}. The {T} are a different team when he’s this involved.', '{L} did the little things right today. That’s what keeps you on the field.', '{S}. Steady. Coaches love steady.'],
    meh: ['Middle-of-the-road game for {L}. The tools are there; the consistency isn’t yet.', '{L} left a couple of plays on the field. Fixable.'],
    bad: ['{L} looked rushed all day. Expect teams to copy what the {O} did to him.', 'Hard to win with that line from your {pos}. {L} knows it.', 'This is the week we learn who {L} is. How you bounce back matters more than this game.'],
    goodLoss: ['{L} was efficient. The {T} needed more from everyone else.', 'Quietly solid from {L} in a loss. Nothing to fix there.'],
    wasted: ['{L} did his job today. The {T} lost this one somewhere else.', 'Don’t let the result hide it: {S} is a winning line from {L}.', 'The {T} wasted a really good {L} game. That can’t keep happening.'],
  };
  const MATE = {
    great: ['Told y’all about my guy {L} 💯', 'Different breed. Proud of you {L}.', '{L} said get on my back and we did.', 'That man {L} was locked in all week in practice. This was not an accident.'],
    good: ['Big win. {L} made his plays. On to the next.', 'Love playing with {L}. Dude prepares like crazy.'],
    meh: ['W is a W. Back to work.', 'We all got more in us. Starting tomorrow.'],
    bad: ['We got your back {L}. Next one.', 'Short memory. We go again.', 'One game. That’s all it was. Locked in.'],
    goodLoss: ['Tough one. {L} did his part. We’ll get it back.', 'Proud of how {L} competed. On to the next.'],
    wasted: ['{L} balled out. We owe him one. That’s on the rest of us.', 'My guy {L} did his part. We gotta finish for him.'],
  };

  /* ---------- the reaction to a game ---------- */
  function reaction(c) {
    dealt = new Set();
    const x = words(c), { b } = buzzOf(c), t = tier(c), tie = c.us === c.them, lost = !c.won && !tie, wasted = lost && t === 'great', goodLoss = lost && t === 'good', badWin = c.won && t === 'bad', out = [];
    const F = s => fill(s, x), D = arr => {
      const s = deal(arr);
      return s == null ? null : F(s);
    };
    const myLines = wasted ? FAN.wasted : goodLoss ? FAN.goodLoss : badWin ? FAN.badWin : FAN[t], theirs = OPP[c.won || tie ? 'beaten' : 'won'][t];
    const mateLines = tie ? ['Not the result we wanted. Back to work.', 'We’ll learn from this one. Locked in.'] : wasted ? MATE.wasted : goodLoss ? MATE.goodLoss : badWin ? MATE.meh : MATE[lost ? 'bad' : t];
    const analystLines = wasted ? ANALYST.wasted : goodLoss ? ANALYST.goodLoss : ANALYST[t];
    const myFan = k => post(fan(c.team), D(myLines), c, k), theirFan = k => post(fan(c.opp), D(theirs), c, k);
    // the reporter's final always leads (winner first), with the thread under it
    const [hi, lo] = c.us >= c.them ? [[x.T, c.us], [x.O, c.them]] : [[x.O, c.them], [x.T, c.us]];
    const fin = post(reporter(), `Final: ${hi[0]} ${hi[1]}, ${lo[0]} ${lo[1]}. ${x.N}: ${x.S}.` + (c.star ? ' Player of the game.' : ''), c, 2.2);
    fin.replies = [];
    [myFan(0.4), theirFan(0.3), post(neutral(), D(lost && t !== 'bad' ? ['Tough loss. On to next week.', 'Shame to waste a line like that.', 'Long trip home for the {T}.'] : THREAD[t]), c, 0.2)].forEach(p => keep(fin.replies, p));
    for (let i = 0; i < Math.floor(b / 2.5); i++) keep(fin.replies, Math.random() < 0.65 ? myFan(0.3) : theirFan(0.3));  // the bigger the day, the longer the thread
    fin.rep = Math.max(fin.rep, fin.replies.length);
    out.push(fin);
    if (c.trending) out.push({ kind: 'trend', text: F(any(['#{LU}SZN', '#{T}Rising', '#{L}Effect', '#{AB}vs{OAB}'])), sub: `Trending in football · ${short(Math.round(c.fol * (0.6 + b / 6)))} posts` });
    // how many voices: a quiet day draws a handful, a great one floods the mentions
    const n = Math.round(4 + b * 1.4), pool = [];
    for (let i = 0; i < n; i++) {
      const r = Math.random();
      if (r < 0.42) keep(pool, myFan(1));
      else if (r < 0.64) keep(pool, theirFan(0.7));
      else if (r < 0.78) keep(pool, post(neutral(), D(NEUTRAL_LINES[t]), c, 0.8));
      else if (r < 0.9) keep(pool, post(analyst(), D(analystLines), c, 1.6));
      else keep(pool, post(teammate(c, c.pos === 'QB' ? 'WR' : 'QB'), D(mateLines), c, 1.3));
    }
    // a teammate always speaks up after a great game or a bad one
    if (t === 'great' || t === 'bad' || goodLoss) keep(pool, post(teammate(c, any(['LT', 'C', c.pos === 'QB' ? 'WR' : 'QB'])), D(mateLines), c, 1.4));
    // the coach, through a reporter: what he said about you at his own press conference
    if (c.coachLine) pool.push(post(reporter(), `${x.coach} on ${x.L}: “${c.coachLine}”`, c, 1.5));
    // your rival
    if (c.rival && c.rivalGame && !tie) pool.push(post(rivalBy(c, x), c.won ? any(['Respect. See you in the rematch.', 'Enjoy it. It won’t happen twice.', 'Y’all can have this one.']) : any(['Told you. 🤫', 'Same result every time.', 'He knows. Everybody knows now.']), c, 2));
    // a callout from last week, settled
    if (c.callRes) {
      const q = c.callRes.quote;
      if (c.callRes.backed) {
        pool.push(post(neutral(), F(`He said ‘${q}’ and then went out and did it. RECEIPTS 🧾🔥`), c, 3));
        pool.push(post(analyst(), F('Talking before the game is easy. {L} backed every word of it. That’s how you earn a locker room.'), c, 1.8));
        pool.push(post(fan(c.team), F('{L} SAID IT. {L} DID IT. 🗣️🗣️'), c, 1.6));
      } else {
        pool.push(post(fan(c.opp), F(`Remember when {L} said ‘${q}’? 😂😂😂 We remember.`), c, 3));
        pool.push(post(fan(c.opp), F('Bulletin board material, thank you {L}. Framing it.'), c, 1.5));
        pool.push(post(neutral(), F('Moral of the story: don’t write checks your team can’t cash, {L}.'), c, 1.2));
      }
    }
    pool.sort(() => Math.random() - 0.5);
    // the most liked fan post goes viral on a big day
    if (b >= 7 && pool.length) {
      const top = pool.filter(p => p.kind === 'fan')[0];
      if (top) {
        const v = 4 + b * 2.5;
        top.likes = Math.round(top.likes * v);
        top.rt = Math.round(top.rt * v);
        top.rep = Math.round(top.rep * v * 0.8);
        top.hot = true;
      }
    }
    return out.concat(pool);
  }

  /* ---------- the press conference ----------
     Three questions: how you played (or, if you called someone out last week, whether you backed it up), the team or
     your rival or your role, and the next opponent. Every answer has a tone and its effect: trust is the coach's,
     hype is yours (0 to 100, it grows your following), call marks a callout of the next opponent. */
  const A = (t, tone, trust, hype, call) => ({ t, tone, trust, hype, call: call || null });
  const TONE = { humble: 'Humble', team: 'Team first', confident: 'Confident', trash: 'Trash talk', guarantee: 'Guarantee', own: 'Owning it', blame: 'Pointing fingers', deflect: 'Deflect', respect: 'Respect' };

  function press(c) {
    const x = words(c), F = s => fill(s, x), t = tier(c), lost = !c.won && c.us !== c.them, qs = [];
    x.role = c.role1 === 'Starter' ? 'the starter' : c.role1 === 'Rotation' ? 'the rotation' : 'the bench';
    const ask = (q, answers, about, topic) => {
      // about: the team the question is about; topic: how the post that quotes you introduces it ("on his game")
      const [f, l, o] = REPORTERS[(qs.length * 2 + c.week) % REPORTERS.length];
      qs.push({ by: `${f} ${l}`, outlet: o, q: F(q), about, topic: F(topic), answers: answers.map(a => ({ ...a, t: F(a.t) })) });
    };
    /* Every slot is drawn from the topics that fit this game (what you did, how it ended, where, what is next), each
       with several wordings and its own answers. Topics asked in the last few weeks (c.seen) are passed over while
       anything else fits, so the room does not ask the same three things every week. */
    const seen = c.seen || [], asked = [];
    const draw = pool => {
      const ok = pool.filter(Boolean), fresh = ok.filter(t => !seen.includes(t.id) && !asked.includes(t.id)), t = any(fresh.length ? fresh : ok);
      asked.push(t.id);
      ask(any(t.q), any(t.a), t.about, t.topic);
    };
    const m = c.m, WR = c.pos === 'WR', margin = c.us - c.them, close = Math.abs(margin) <= 3 && margin !== 0, rout = Math.abs(margin) >= 17;
    const pct = m.att ? m.comp / m.att : 0, ret = (m.kry || 0) + (m.pry || 0);
    // 1. you: the callout if there was one, else something about your own day
    if (c.callRes) {
      x.Q = c.callRes.quote;
      if (c.callRes.backed) ask('Last week you said ‘{Q}’ and then you went out and did it. Was that the plan all along?', [
        A('I don’t say things I can’t back up.', 'confident', 0, 6),
        A('That was just talk. The guys did the work today.', 'humble', 1, 2),
        A('Somebody had to tell them. Now they know.', 'trash', -1, 8)], c.opp, 'on backing up last week’s words');
      else ask('Last week you said ‘{Q}’ Do you regret it?', [
        A('Yeah. I wrote a check we didn’t cash, and that’s on me.', 'own', 2, -2),
        A('No regrets. I’d say it again tomorrow.', 'confident', -2, 3),
        A('I’m not talking about last week.', 'deflect', -1, -3)], c.opp, c.callRes.kind === 'guarantee' ? 'on last week’s guarantee' : 'on last week’s callout');
    } else draw([
      t === 'great' && { id: 'great', about: c.opp, topic: 'on his big day', q: ['{S} today. What was clicking for you out there?', 'That might be your best game as a pro. Did it feel different out there?', 'You made that look easy today. Was it?'], a: [[
        A('Credit to {help}. I just made the plays that came to me.', 'team', 2, 1),
        A('Coach had a great plan this week and we executed it.', 'team', 2, 1),
        A('Honestly? I expect this. This is who I am.', 'confident', 0, 5),
        A('They couldn’t guard me. Simple as that.', 'trash', -1, 7)], [
        A('It slowed down for me today. That comes from the work in practice.', 'humble', 2, 1),
        A('Easy? No. The guys around me made it look that way.', 'team', 2, 1),
        A('When I’m right, there’s nobody in this league who can stop it.', 'confident', -1, 6),
        A('Nothing’s easy. Ask me again when we’ve won something.', 'deflect', 1, 0)]] },
      c.star && { id: 'potg', about: c.opp, topic: 'on being player of the game', q: ['Player of the game. Where does this one rank for you?', 'They gave you the game ball in there. Who gets a piece of it?'], a: [[
        A('It goes to the line. Nothing happens without them.', 'team', 2, 1),
        A('It ranks behind the next one. That’s how I think.', 'humble', 1, 2),
        A('Put it with the others. There will be a lot more.', 'confident', 0, 6)]] },
      t === 'bad' && { id: 'bad', about: c.opp, topic: 'on his rough day', q: [c.weak ? `Tough day: ${c.weak}. What happened out there?` : 'Tough day for you. What happened out there?', 'That wasn’t the player we’ve been watching. What was off?', 'Do you throw this one away, or do you study it?'], a: [[
        A('That’s on me. I’ll fix it in practice this week.', 'own', 2, 0),
        A('One bad day. I’ll be fine.', 'confident', 0, 1),
        A('Some of those weren’t on me. Watch the tape.', 'blame', -3, -1),
        A('We’ll look at the film.', 'deflect', 0, -1)], [
        A('You study it. Every snap. Then you never play like that again.', 'own', 2, 1),
        A('I let the guys down today. They deserve better from me.', 'own', 3, -1),
        A('Everybody has one of these. Mine’s out of the way now.', 'confident', 0, 2),
        A('Next question.', 'deflect', -1, -2)]] },
      (t === 'good' || t === 'meh') && { id: 'grade', about: c.opp, topic: 'on his game', q: ['How would you grade your own game today?', 'Solid day, not a loud one. Are you satisfied with it?', 'What’s the one play you want back from today?'], a: [[
        A('Not good enough. I left plays out there.', 'own', 2, 0),
        A('A B. Good, not great. More coming.', 'humble', 1, 1),
        A(t === 'good' ? 'I thought I played great, to be honest.' : 'I played fine. People expect too much.', 'confident', t === 'good' ? 0 : -1, 2),
        A('Ask me at the end of the season.', 'deflect', 0, 0)], [
        A('Satisfied is a dangerous word. There’s a lot to clean up.', 'own', 2, 0),
        A('I did my job. That’s what the team needs from me every week.', 'team', 1, 1),
        A('There’s a couple I want back. I know exactly which ones.', 'humble', 1, 1),
        A('I’m the last guy you need to worry about.', 'confident', -1, 3)]] },
      WR && m.rectd >= 2 && { id: 'wr2td', about: c.opp, topic: 'on his touchdowns', q: [`${m.rectd} touchdowns today. Is the end zone starting to feel like home?`, 'They kept leaving you one on one near the goal line. Were you surprised?'], a: [[
        A('{help} put it where only I could get it. I just held on.', 'team', 2, 1),
        A('Leave me one on one down there and that’s what happens.', 'confident', 0, 6),
        A('I hope they keep doing it. All season.', 'trash', -1, 7)]] },
      WR && m.tgt >= 4 && m.rec / m.tgt < 0.5 && { id: 'drops', about: c.opp, topic: 'on the balls that got away', q: [`${m.rec} catches on ${m.tgt} targets. Were some of those yours to make?`, 'A few got away from you today. Hands, or timing?'], a: [[
        A('Mine. Every one of them. I’ll be on the machine tomorrow.', 'own', 3, 0),
        A('We were a half step off. We’ll fix the timing this week.', 'team', 1, 0),
        A('Go look where those balls were thrown.', 'blame', -3, 0),
        A('It happens. I’m not losing sleep over it.', 'confident', -1, 1)]] },
      WR && ret >= 80 && { id: 'returns', about: c.opp, topic: 'on his returns', q: [`${ret} return yards on top of your day at receiver. Do you want that job for good?`, 'You looked dangerous back there on returns. How much do you like doing it?'], a: [[
        A('I’ll do whatever puts us in better field position.', 'team', 2, 1),
        A('Give me the ball any way you can. Good things happen.', 'confident', 0, 5),
        A('The blocking was there. I just ran where they sent me.', 'humble', 1, 1)]] },
      !WR && m.pint >= 2 && { id: 'ints', about: c.opp, topic: 'on the interceptions', q: [`${m.pint} interceptions today. What did you see on those?`, 'You put the ball in danger more than usual. Forcing it?'], a: [[
        A('Bad decisions, both mine. I can’t give them the ball like that.', 'own', 3, 0),
        A('I was trying to make something happen. I have to live with it.', 'own', 1, 1),
        A('One of those was a route, not a throw. We’ll talk about it.', 'blame', -3, 0),
        A('I’m going to keep throwing it. That’s the job.', 'confident', -1, 2)]] },
      !WR && m.ptd >= 3 && { id: 'qb3td', about: c.opp, topic: 'on his touchdown passes', q: [`${m.ptd} touchdown passes. Was there anything they did that you didn’t have an answer for?`, 'Everything you threw near the goal line was a score. What did you see?'], a: [[
        A('The receivers won. I just got it to them on time.', 'team', 2, 1),
        A('We saw what we expected all week. Credit to the coaches.', 'team', 2, 1),
        A('No. And they knew it by the second quarter.', 'trash', -1, 7),
        A('That’s the standard for me now.', 'confident', 0, 5)]] },
      !WR && m.ryd >= 30 && { id: 'legs', about: c.opp, topic: 'on his running', q: [`${m.ryd} yards on the ground from the quarterback. Is that part of the plan now?`, 'You hurt them with your legs today. Does the coach wince when you take off?'], a: [[
        A('If it’s there I’ll take it. Then I’m getting down.', 'humble', 2, 1),
        A('He winces. Then he sees the first down marker.', 'confident', 0, 4),
        A('They can’t cover everybody and me too.', 'trash', -1, 6)]] },
      !WR && m.att >= 8 && pct >= 0.8 && { id: 'sharp', about: c.opp, topic: 'on his accuracy', q: [`${m.comp} of ${m.att}. Did the ball ever hit the ground when you didn’t want it to?`, 'You barely missed all day. What was the difference this week?'], a: [[
        A('Guys were open. That makes my job simple.', 'team', 2, 1),
        A('I trusted my feet. When my feet are right, it goes where I want.', 'humble', 1, 2),
        A('That’s what I do. This wasn’t a surprise to me.', 'confident', 0, 5)]] },
    ]);
    // 2. the rival or your role when either is the story, else something about the game itself
    if (c.rivalGame && c.rival) ask(c.won ? any(['{R} had a lot to say before this one. Anything for him now?', 'You and {R} met at midfield afterward. What was said?']) : any(['{R} got the better of you today. Your thoughts on him?', '{R} is going to enjoy this one. How long does it stay with you?']), c.won ? [
      A('Tell him I said good game. He’ll need the practice.', 'trash', -1, 8),
      A('He’s a great player. Today was just our day.', 'respect', 1, 1),
      A('The scoreboard says everything I need to say.', 'confident', 0, 5)] : [
        A('Credit to him. He made the plays today.', 'respect', 1, 1),
        A('That fuels me. I’ll see him again.', 'own', 1, 2),
        A('He got lucky. Everybody watching knows it.', 'trash', -2, 4)], c.opp, 'on {R}');
    else if (c.role1 !== c.role0 && c.roleUp) ask(any(['Coach made you {role} today. What does that mean to you?', 'You’re {role} now. Did he tell you himself?']), [
      A('I just want to keep earning it every single week.', 'humble', 2, 1),
      A('It means I owe these guys even more now.', 'team', 1, 1),
      A('About time, honestly.', 'confident', -2, 5)], c.team, 'on his new role');
    else if (c.role1 !== c.role0) ask(any(['You’re moving down to {role}. Is that fair?', 'The coach has you in {role} now. How did you take it?']), [
      A('Coach makes the calls. I’ll earn it back.', 'own', 3, 0),
      A('I disagree, and I’ll show him why on the field.', 'confident', -2, 3),
      A('No comment on that.', 'deflect', -1, -1)], c.team, 'on being moved to {role}');
    else draw([
      lost && { id: 'loss', about: c.team, topic: 'on the locker room', q: ['A loss to the {O}. Is there any concern in that locker room?', 'What was said in there after this one?', 'Where did this game get away from you?'], a: [[
        A('None. This group sticks together. We’ll be fine.', 'team', 1, 1),
        A('We have to stop making excuses, starting with me.', 'own', 2, 1),
        A('Some guys need to take a long look in the mirror.', 'blame', -3, 4)], [
        A('Not much. Nobody needed to say it. We all know.', 'own', 1, 1),
        A('We beat ourselves. That’s fixable.', 'team', 2, 0),
        A('I’ll keep what was said in there in there.', 'deflect', 1, -1),
        A('The better team didn’t win today. I believe that.', 'confident', -1, 4)]] },
      lost && c.streakL >= 2 && { id: 'skid', about: c.team, topic: 'on the losing streak', q: [`That’s ${c.streakL} in a row. How do you stop it?`, `${c.streakL} straight losses. Is the season slipping?`], a: [[
        A('One day at a time. It starts with how we practice Wednesday.', 'team', 2, 0),
        A('It stops with me. I’ll make sure of it.', 'own', 2, 2),
        A('Nobody in there is panicking. You shouldn’t either.', 'confident', 0, 2),
        A('Ask the people who make the decisions.', 'blame', -4, 2)]] },
      lost && close && { id: 'closeL', about: c.team, topic: 'on the close loss', q: [`${c.them}–${c.us}. One play away. Which one is it for you?`, 'That close, and nothing to show for it. Is that harder than a blowout?'], a: [[
        A('There’s one I’ll see when I close my eyes tonight. It was mine.', 'own', 2, 1),
        A('Harder. But a team this close is a team that’s coming.', 'team', 1, 2),
        A('We don’t do moral victories here.', 'confident', 0, 3)]] },
      lost && rout && { id: 'routL', about: c.team, topic: 'on the blowout', q: ['That got out of hand early. What do you say to the fans who stayed?', 'Was that an effort problem, or a talent problem?'], a: [[
        A('I say sorry. They deserved a lot better than that.', 'own', 2, 0),
        A('Neither. It was one bad day and we’ll answer for it.', 'team', 1, 0),
        A('I’ll let you decide that. I know how I played.', 'blame', -3, 2)]] },
      c.won && { id: 'win', about: c.team, topic: 'on the win over the {O}', q: ['The {T} get it done against the {O}. What does this win say about this team?', 'What did you like most about how you won today?', 'Is this the best this team has played?'], a: [[
        A('This locker room believes. You can feel it.', 'team', 1, 2),
        A('We’re the best team in this league. Write it down.', 'confident', 0, 6),
        A('It’s one game. Back to work Monday.', 'humble', 2, 0)], [
        A('We played for each other. That’s what I liked.', 'team', 2, 1),
        A('Not yet. We haven’t played our best. That should scare people.', 'confident', 0, 5),
        A('Ask me after we’ve watched the film. There’s plenty to fix.', 'humble', 2, 0)]] },
      c.won && c.streakW >= 3 && { id: 'streak', about: c.team, topic: 'on the winning streak', q: [`${c.streakW} wins in a row now. Are you thinking about how far this goes?`, `That’s ${c.streakW} straight. What changed?`], a: [[
        A('Nothing changed. We just stopped beating ourselves.', 'team', 2, 1),
        A('I’m thinking about next week. That’s how you get to ' + (c.streakW + 1) + '.', 'humble', 2, 0),
        A('It goes as far as we want it to. Nobody’s stopping this.', 'confident', 0, 6)]] },
      c.won && close && { id: 'closeW', about: c.team, topic: 'on winning a close one', q: [`${c.us}–${c.them}. What was the huddle like at the end?`, 'You won it late. Were you ever worried?'], a: [[
        A('Calm. Nobody blinked. That tells you about this group.', 'team', 2, 1),
        A('Worried? I wanted the ball in my hands.', 'confident', 0, 5),
        A('A little. I’d be lying if I said no.', 'humble', 1, 1)]] },
      c.won && rout && { id: 'routW', about: c.opp, topic: 'on the blowout win', q: ['That was over by halftime. Did you take your foot off?', 'What do you say to the {O} after a day like that?'], a: [[
        A('You never take your foot off. You respect them by playing hard.', 'respect', 2, 0),
        A('Nothing. I’ve been on the other side of one of those.', 'humble', 2, 1),
        A('I’d tell them to get used to it.', 'trash', -2, 7)]] },
      c.won && c.away && { id: 'road', about: c.opp, topic: 'on winning on the road', q: ['That’s a hard place to play. How did you handle the noise?', 'You quieted a full building today. Do you enjoy that?'], a: [[
        A('Silent count, good eyes. The line was great with it.', 'team', 2, 1),
        A('It’s the best sound in football. Sixty thousand people going home early.', 'confident', 0, 6),
        A('It’s loud for both teams. We just handled it better.', 'humble', 1, 0)]] },
      c.prime && { id: 'prime', about: c.team, topic: 'on playing in primetime', q: ['The whole league was watching tonight. Does that change anything for you?', 'Under the lights, national audience. Do you play differently?'], a: c.won ? [[
        A('Same field, same ball. I like that they saw this team.', 'team', 2, 1),
        A('I love it. Big stage, big players.', 'confident', 0, 6),
        A('I didn’t notice until you said it.', 'humble', 1, 0)]] : [[
        A('It stings more. Everybody saw it.', 'own', 2, 0),
        A('No. A loss is a loss at noon or at night.', 'team', 1, 0),
        A('We’ll be back on this stage. Remember I said it.', 'confident', 0, 4)]] },
      c.playoff && { id: 'playoff', about: c.team, topic: 'on the playoffs', q: c.won ? ['You’re still alive. What does this time of year feel like?', 'Win or go home, and you won. How much is left in the tank?'] : ['That’s the season. Where did it get away?'], a: c.won ? [[
        A('It feels like football. This is why you do all of it.', 'team', 2, 2),
        A('Plenty. I’ve been waiting all year for these games.', 'confident', 0, 5),
        A('One more. That’s all I’m counting.', 'humble', 2, 0)]] : [[
        A('It hurts. It should. I’ll carry it into the offseason.', 'own', 2, 1),
        A('We’ll be back here. I promise this city that.', 'confident', 0, 5),
        A('I’m not ready to talk about that yet.', 'deflect', 0, -1)]] },
      c.inj && { id: 'hurt', about: c.team, topic: 'on playing hurt', q: [`You were questionable with ${c.inj.what} and played anyway. How did it feel?`, `Did ${c.inj.what} slow you down today?`], a: [[
        A('It was fine. Everybody’s playing through something by now.', 'humble', 2, 1),
        A('The trainers got me ready. They don’t get enough credit.', 'team', 2, 0),
        A('You saw the game. Did I look hurt?', 'confident', 0, 4)]] },
      c.us === c.them && { id: 'tie', about: c.team, topic: 'on the tie', q: ['A tie with the {O}. How does that sit with you?'], a: [[
        A('Like a loss. We had chances to finish it.', 'own', 2, 0),
        A('We didn’t lose. I’ll take that into next week.', 'team', 1, 0),
        A('Somebody should have won that game, and it should have been us.', 'confident', 0, 3)]] },
    ]);
    // 3. the next opponent (where the callouts live) more often than not, else a wider question; or the season, if it is over
    if (c.next == null) ask(any(['That’s the season. What’s your message to the fans?', 'It’s over until next year. What do you take with you?']), [
      A('Thank you. We’ll be back better, and that starts with me.', 'own', 2, 2),
      A('This is just the beginning of what I’m going to do here.', 'confident', 0, 6),
      A('Thank the guys in that locker room. They carried me.', 'team', 2, 1)], c.team, 'to the fans');
    else {
      const rivalNext = c.rival && c.rival.team === c.next;
      const next = { id: 'next', about: c.next, topic: rivalNext ? 'on {R}' : 'on the {NX}', q: rivalNext ? ['Next up is {R} and the {NX}. Any message for him?', 'It’s {R} week. Has he been in your head already?'] : ['Next up are the {NX}. Any message for them?', 'The {NX} are waiting. What do you know about them?', 'Short week, and then the {NX}. How do you see that one?'], a: [[
        A('Good team. We’ll prepare like it’s the championship.', 'respect', 2, 0),
        A(rivalNext ? 'Tell {RL} to bring a better plan this time. He’ll need it.' : `Tell their ${c.pos === 'QB' ? 'secondary' : 'corners'} to get some sleep this week. They’ll need it.`, 'trash', -1, 7, 'trash'),
        A('We’re winning that game. I guarantee it.', 'guarantee', -2, 9, 'guarantee'),
        A('One game at a time. That’s all I’ve got.', 'deflect', 1, -1)], [
        A('They’re well coached and they play hard. It’ll take our best.', 'respect', 2, 0),
        A(rivalNext ? '{RL} knows what’s coming. So does everybody else.' : 'I’ve seen their tape. I like what I see for us.', 'trash', -1, 6, 'trash'),
        A('Put it on the board: we win by two scores.', 'guarantee', -2, 9, 'guarantee'),
        A('I haven’t watched a snap of them yet. Ask me Wednesday.', 'deflect', 0, -1)]] };
      if (rivalNext || Math.random() < 0.6) draw([next]);
      else draw([
        { id: 'fans', about: c.team, topic: 'on the fans', q: ['The fans here have taken to you fast. Do you hear it?', 'Your jersey is everywhere in this city now. What’s that like?'], a: [[
          A('I hear it. I’m trying to deserve it.', 'humble', 1, 3),
          A('They’re the best in the league. We owe them a winner.', 'team', 2, 2),
          A('They know a star when they see one.', 'confident', -1, 6)]] },
        { id: 'coach', about: c.team, topic: 'on his coach', q: ['What’s your relationship with {coach} like right now?', 'How hard is {coach} on you behind closed doors?'], a: [[
          A('He’s honest with me. That’s all a player can ask.', 'respect', 3, 0),
          A('Hard. I need it. He’s made me better.', 'humble', 2, 1),
          A('We see some things differently. That’s between us.', 'deflect', -2, 2)]] },
        { id: 'work', about: c.team, topic: 'on what he is working on', q: ['What’s the one thing in your game you’re working on right now?', 'If you could fix one thing by next week, what is it?'], a: [[
          A(WR ? 'Getting off the line cleaner. The good corners make you earn it.' : 'My eyes. Getting to the second read faster.', 'own', 2, 1),
          A('Being a better teammate on the days it isn’t going my way.', 'team', 2, 1),
          A('There’s not a lot to fix, to be honest.', 'confident', -1, 3)]] },
        c.season === 1 && { id: 'rookie', about: c.team, topic: 'on his first season', q: ['You’re a rookie. Has the speed of this league surprised you?', 'Do the veterans still treat you like a rookie in there?'], a: [[
          A('Every week. You learn fast or you sit.', 'humble', 2, 1),
          A('They make me carry the pads. I’ve earned worse.', 'team', 1, 2),
          A('I stopped feeling like a rookie a while ago.', 'confident', 0, 5)]] },
        c.left <= 1 && { id: 'deal', about: c.team, topic: 'on his contract', q: ['Your contract is up after this season. Do you want to be here?', 'Has your agent heard from the front office yet?'], a: [[
          A('I love it here. I hope it works out.', 'team', 2, 2),
          A('That’s for after the season. I’m here to win games.', 'deflect', 1, 0),
          A('I know what I’m worth. So does everybody else.', 'confident', -2, 6)]] },
        c.week >= 6 && { id: 'race', about: c.team, topic: 'on the playoff race', q: ['Do you look at the standings this time of year?', 'Every game counts double now. Does the locker room feel it?'], a: [[
          A('I’d be lying if I said no. But it only matters if we win.', 'humble', 1, 1),
          A('We control it. That’s all you can ask for.', 'team', 2, 1),
          A('The standings should be looking at us.', 'confident', 0, 5)]] },
        next,
      ]);
    }
    c.asked = asked;  // for the career to remember
    return qs;
  }

  /* media day, the week of a rival game: one question about him, the same answers as the podium's last question */
  function mediaDay(c) {
    const x = words(c), F = s => fill(s, x), [f, l, o] = REPORTERS[(c.week + 3) % REPORTERS.length];
    const answers = [A('He’s a great player. We’ll handle our business Sunday.', 'respect', 2, 1), A('I don’t think about {RL}. I think about winning.', 'confident', 0, 4),
      A('{RL} talks a lot. Sunday we find out who’s real.', 'trash', -1, 7, 'trash'), A('We’re winning this one. I guarantee it.', 'guarantee', -2, 9, 'guarantee')];
    return { by: `${f} ${l}`, outlet: o, q: F('Media day. All week it’s been you and {R}. Anything to say before Sunday?'), about: c.next, topic: F('at media day, on {R}'), answers: answers.map(a => ({ ...a, t: F(a.t) })) };
  }

  /* what the coach says about your answers, from the trust they moved */
  function coachOnPress(net, tones, great) {
    if (tones.includes('trash') && great) return any(['You can talk like that when you play like that. Don’t make a habit of it.', 'Half of me wants to fine you. The other half watched the tape. Keep it there.']);
    if (net >= 4) return any(['That’s how a pro talks. Proud of you.', 'Good. You made us look good up there today.']);
    if (net >= 1) return any(['Good answers. Keep it about the team.', 'Smart up there. That’s growth.']);
    if (net === 0) return any(['Fine up there. Nothing I need to talk to you about.', 'Not much to say about the podium. Get ready for practice.']);
    if (net >= -3) return any(['Careful. Everything you say ends up on a wall in their locker room.', 'Watch the mouth. Let the tape do the talking.']);
    return any(['Do your talking on the field. I won’t ask again.', 'My office. Now. We don’t do that here.']);
  }

  /* the internet on what you said */
  function quoteReaction(c, pick, about, topic) {
    const x = words(c), q = pick.t, rep = reporter(), out = [], at = about == null ? c.opp : about, D = arr => {
      const s = deal(arr);
      return s == null ? null : fill(s, x);
    };
    keep(out, post(rep, `${x.N}, ${topic || 'after the game'}: “${q}”`, c, pick.tone === 'trash' || pick.tone === 'guarantee' ? 3 : 1.2));
    if (pick.tone === 'guarantee') {
      keep(out, post(fan(c.next), fill('A GUARANTEE?? Oh {L} is gonna regret this. See you Sunday.', x), c, 2));
      keep(out, post(analyst(), fill('Bold. If the {T} win, {L} is a legend this week. If they lose, he never hears the end of it.', x), c, 1.6));
      keep(out, post(fan(c.team), fill('{L} with the GUARANTEE. I’m buying tickets.', x), c, 1.4));
      if (c.rival && at === c.rival.team) keep(out, post(rivalBy(c, x), D(['A guarantee? Cute. See you Sunday.', 'Save that energy. You’re gonna need it.', 'Bold. I’ll remind him after the game.']), c, 2.6));
    } else if (pick.tone === 'trash') {
      keep(out, post(fan(at), D((['Bulletin board. Printed. Laminated.', 'Talk is cheap, {L}.', '{L} with the mouth. We’ll see.'].concat(tier(c) === 'great' ? ['Ok he can play. He still can’t talk.', 'Enjoy the week, {L}. It’s a long season.'] : ['Real confident for a guy with {S} 😂', 'Big talk from a guy who just had THAT game.']))), c, 1.8));
      keep(out, post(fan(c.team), D(['{L} said what we were all thinking 😤', 'I love this energy from {L}.', 'LET HIM COOK 🗣️']), c, 1.2));
      if (c.rival && (at === c.rival.team || c.rivalGame)) keep(out, post(rivalBy(c, x),
        D(['Heard what he said. Talk is cheap.', 'Keep my name out your mouth. See you on the field.', '📸 screenshotted.']), c, 2.4));
    } else if (pick.tone === 'blame') {
      keep(out, post(teammate(c, any(['LT', 'C', c.pos === 'QB' ? 'WR' : 'QB'])), D(['Interesting.', 'We win as a team and we lose as a team. That’s all I’ll say.', '👀']), c, 2.2));
      keep(out, post(neutral(), fill('Throwing teammates under the bus on the podium is a choice, {L}.', x), c, 1.2));
    } else if (pick.tone === 'own' || pick.tone === 'team' || pick.tone === 'humble') {
      keep(out, post(fan(c.team), D(['This is why I love {L}. Takes it on the chin.', 'Leader. {L} gets it.', 'Accountability from {L}. Love to see it.', 'That’s a captain answer from {L}.']), c, 0.9));
    }
    return out;
  }

  /* ---------- drawing ---------- */
  const initials = s => String(s).replace(/[^A-Za-z ]/g, ' ').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '#';

  /* initials in white on a dark color, in near-black on a light one, whichever reads better (WCAG luminance) */
  function inkOn(hex) {
    const v = parseInt(String(hex).replace('#', ''), 16), ch = k => {
      const c = ((v >> k) & 255) / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    }, L = 0.2126 * ch(16) + 0.7152 * ch(8) + 0.0722 * ch(0);
    return isNaN(L) || L < 0.19 ? '#fff' : '#06101f';
  }

  const n = (v, one, many) => `${short(v)} ${v === 1 ? one : many}`;

  function postHtml(p, reply) {
    if (p.kind === 'trend') return `<div class="post trend"><b>${esc(p.text)}</b><small>${esc(p.sub)}</small></div>`;
    return `<div class="post${reply ? ' re' : ''}${p.hot ? ' hot' : ''} k-${p.kind}"><span class="av" style="--c:${esc(p.col)};color:${inkOn(p.col)}${inkOn(p.col) === '#fff' ? '' : ';text-shadow:none'}">${esc(initials(p.who))}</span><div class="pbody">`
      + `<div class="phd"><b>${esc(p.who)}</b>${p.ver ? '<i class="ver" aria-label="verified"></i>' : ''}<span>@${esc(p.at)} · ${esc(p.ago || 'now')}</span></div>${p.bio ? `<div class="bio">${esc(p.bio)}</div>` : ''}`
      + `<p>${esc(p.text)}</p><div class="pmeta"><span>${n(p.rep, 'reply', 'replies')}</span><span>${n(p.rt, 'repost', 'reposts')}</span><span>${n(p.likes, 'like', 'likes')}</span>${p.hot ? '<em>viral</em>' : ''}</div>`
      + (p.replies && !reply ? `<div class="reps">${p.replies.map(r => postHtml(r, true)).join('')}</div>` : '') + '</div></div>';
  }

  PG.media = { reaction, press, mediaDay, quoteReaction, coachOnPress, buzzOf, postHtml, short, stamp, TONE, lastOf, FIRST };
})();
