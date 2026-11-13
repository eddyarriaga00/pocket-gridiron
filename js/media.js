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
    const S = c.pos === 'QB' ? `${m.comp}/${m.att}, ${m.pyd} yards, ${m.ptd} TD${m.pint ? `, ${m.pint} INT` : ''}` : `${m.rec} catches, ${m.recyd} yards${m.rectd ? `, ${m.rectd} TD` : ''}`;
    const nx = c.next != null ? TEAMS[c.next] : null;
    return { N: c.name, L, LU: L.toUpperCase(), T: T.name, C: T.city, AB: T.ab, O: O.name, OC: O.city, OAB: O.ab, S, us: c.us, them: c.them, R: c.rival ? c.rival.name : '', pos: c.pos === 'QB' ? 'quarterback' : 'receiver',
      NX: nx ? nx.name : '', NXC: nx ? nx.city : '', unit: c.pos === 'QB' ? 'secondary' : 'corners', help: c.pos === 'QB' ? 'the line' : 'our quarterback', coach: c.coachName || 'Coach', Q: c.quote || '' };
  }

  /* how loud the reaction is, 0 to 10, and which way it leans (-1 to 1) */
  function buzzOf(c) {
    const b = c.pts * 0.8 + (c.star ? 2 : 0) + (c.won ? 0.8 : -0.5) + (c.rivalGame && c.won ? 1.2 : 0) + (c.playoff ? 1 : 0) + (c.callRes ? 1.5 : 0);
    return { b: clamp(b, 0, 10), s: clamp((c.pts - 4.5) / 3.5 + (c.won ? 0.25 : -0.25), -1, 1) };
  }

  const tier = c => (c.pts >= 7 || c.star ? 'great' : c.pts >= 5 ? 'good' : c.pts >= 3 ? 'meh' : 'bad');

  /* ---------- who posts ---------- */
  function fan(team) {
    const t = TEAMS[team], n = any(FIRST);
    const handle = any([`${t.name}Faithful`, `${t.ab}_til_i_die`, `${t.city.replace(/\s/g, '')}Sports${Math.floor(Math.random() * 90 + 10)}`, `${n.toLowerCase()}_${t.ab.toLowerCase()}`, `${t.name}Nation`, `${n}Bleeds${t.name}`]);
    return { who: cap(handle.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2')), at: handle, kind: 'fan', col: t.c1 };
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
  const teammate = (c, role) => {
    const l = any(PG.NAMES), f = any(FIRST);
    return { who: `${f} ${l}`, at: `${l.toLowerCase()}${Math.floor(Math.random() * 89 + 10)}`, bio: `${TEAMS[c.team].name} ${role}`, kind: 'mate', col: TEAMS[c.team].c1, ver: true };
  };

  function post(by, text, c, k) {
    // k: how much attention this kind of post gets (a reporter's final, a viral fan)
    const fol = c.fol || 2000, { b } = buzzOf(c), base = fol * 0.01 * (0.3 + (b / 4) * (b / 4)) * k * (0.5 + Math.random() * 1.6);  // a big day reaches far past your own followers
    return { ...by, text, likes: Math.max(1, Math.round(base)), rt: Math.round(base * (0.08 + Math.random() * 0.12)), rep: Math.round(base * (0.03 + Math.random() * 0.06)), ago: any(['now', '1m', '2m', '4m', '9m', '14m', '22m', '38m', '1h']) };
  }

  /* ---------- the lines ---------- */
  const FAN = {
    great: ['{L} IS HIM. I’ve been saying it for weeks.', 'Somebody check on the {O} {unit} 😭', '{S}. Put some respect on {L}’s name.', 'WHAT A GAME FROM {LU}!!! 🔥🔥🔥', 'Pay {L}. Right now. Whatever it takes.', 'We got a real one in {C}.', '{L} cooked them all day. Not close.', 'I need a {L} jersey by Sunday 💯', 'Best I’ve felt about the {T} in years.', 'My dad just called me about {L}. My dad does not call me.', '{L} went full video game mode on the {O}.', 'The {O} are gonna see {L} in their sleep tonight.', 'Put {L} on the cover. I’m serious.', '{LU} SZN 🐐'],
    good: ['Solid day from {L}. Trending the right way.', '{L} keeps showing up. Love to see it.', '{S}. I’ll take that every week.', 'Quietly one of the best in the league. Watch.', '{L} made the plays when it mattered.', 'That’s a grown-up game from {L}.'],
    meh: ['{L} was fine. We need more than fine.', 'Not his best, not his worst. Next week.', 'Quiet one for {L}. Let’s see the bounce back.', 'Some good, some bad from {L}. Still believe.', 'We need {L} to take over games, not just play in them.'],
    bad: ['Rough one for {L}. It happens.', '{L} has to be better than that. Period.', 'Bench him? No. Fix it? Yes.', 'Still riding with {L}. Bad days happen.', 'That was hard to watch, {L}.', 'I’m not panicking. I’m concerned. There’s a difference.'],
    wasted: ['{L} did everything he could. The rest of the team didn’t show up.', 'Wasting a day like that from {L} should be illegal.', '{S} in a LOSS. Somebody explain that to me.'],
  };
  const OPP = {
    great: ['Refs gave {L} half those yards.', 'Ok {L} is actually good. I hate it here.', 'Our defense owes the whole city of {OC} an apology.', 'Can’t even be mad. {L} was cooking.', 'We made {L} look like a Hall of Famer smh', 'Fire our defensive coordinator. Tonight.'],
    good: ['{L} got lucky on a couple of those.', 'We’ll see {L} again. Different story next time.', 'Not that impressed with {L} tbh.'],
    meh: ['{L} who? 😂', 'All that hype for that?', 'Our {unit} did their job on {L}.'],
    bad: ['{L} who? 😂', 'Our defense ate {L} alive.', 'Overrated. Said it all week.', 'Thank you {L} for the free win 🙏', 'Hey {C}, you can have {L} back now.'],
  };
  const ANALYST = {
    great: ['{N}: {S}. That’s not a hot streak, that’s a player arriving.', 'Go watch the tape on {L}. The decisions were as good as the numbers.', 'Defensive coordinators around the league just added {L} to the Monday meeting.', 'If you’re still calling {L} a project, you’re not watching.'],
    good: ['Efficient day from {L}. The {T} are a different team when he’s this involved.', '{L} did the little things right today. That’s what keeps you on the field.', '{S}. Steady. Coaches love steady.'],
    meh: ['Middle-of-the-road game for {L}. The tools are there; the consistency isn’t yet.', '{L} left a couple of plays on the field. Fixable.'],
    bad: ['{L} looked rushed all day. Expect teams to copy what the {O} did to him.', 'Hard to win with that line from your {pos}. {L} knows it.', 'This is the week we learn who {L} is. How you bounce back matters more than this game.'],
  };
  const MATE = {
    great: ['Told y’all about my guy {L} 💯', 'Different breed. Proud of you {L}.', '{L} said get on my back and we did.', 'That man {L} was locked in all week in practice. This was not an accident.'],
    good: ['Big win. {L} made his plays. On to the next.', 'Love playing with {L}. Dude prepares like crazy.'],
    meh: ['W is a W. Back to work.', 'We all got more in us. Starting tomorrow.'],
    bad: ['We got your back {L}. Next one.', 'Short memory. We go again.', 'One game. That’s all it was. Locked in.'],
  };

  /* ---------- the reaction to a game ---------- */
  function reaction(c) {
    const x = words(c), { b, s } = buzzOf(c), t = tier(c), lost = !c.won && c.us !== c.them, out = [];
    const F = s => fill(s, x);
    // the reporter's final always leads, with the replies under it
    const fin = post(reporter(), F(`Final: {T} {us}, {O} {them}. {N}: {S}.`) + (c.star ? ' Player of the game.' : ''), c, 2.2);
    const myLines = lost && (t === 'great' || t === 'good') ? FAN.wasted : FAN[t];
    fin.replies = [post(fan(c.team), F(any(myLines)), c, 0.4), post(fan(c.opp), F(any(OPP[t])), c, 0.3), post(neutral(), F(any(t === 'great' ? ['This is the game people will remember from this season.', 'Big day. Bigger week coming.'] : t === 'bad' ? ['Long week ahead for that guy.', 'Film session is gonna be quiet.'] : ['Fair line. On to next week.', 'Ok, noted.'])), c, 0.2)];
    for (let i = 3; i < 3 + Math.floor(b / 2.5); i++) fin.replies.push(post(Math.random() < 0.65 ? fan(c.team) : fan(c.opp), F(any(Math.random() < 0.65 ? myLines : OPP[t])), c, 0.3));  // the bigger the day, the longer the thread
    out.push(fin);
    if (c.trending) out.push({ kind: 'trend', text: F(any(['#{LU}SZN', '#{T}Rising', '#{L}Effect', '#{AB}vs{OAB}'])), sub: `Trending in football · ${short(Math.round(c.fol * (0.6 + b / 6)))} posts` });
    // how many voices: a quiet day draws a handful, a great one floods the mentions
    const n = Math.round(4 + b * 1.4);
    const pool = [];
    for (let i = 0; i < n; i++) {
      const r = Math.random();
      if (r < 0.42) pool.push(post(fan(c.team), F(any(myLines)), c, 1));
      else if (r < 0.64) pool.push(post(fan(c.opp), F(any(OPP[t])), c, 0.7));
      else if (r < 0.78) pool.push(post(neutral(), F(any(s > 0 ? FAN[t === 'bad' ? 'meh' : t] : OPP[t === 'great' ? 'good' : t])), c, 0.8));
      else if (r < 0.9) pool.push(post(analyst(), F(any(ANALYST[t])), c, 1.6));
      else pool.push(post(teammate(c, c.pos === 'QB' ? 'WR' : 'QB'), F(any(MATE[lost && t !== 'great' ? 'bad' : t])), c, 1.3));
    }
    // a teammate always speaks up after a great game or a bad one
    if (t === 'great' || t === 'bad') pool.push(post(teammate(c, any(['LT', 'C', 'RB', 'TE', c.pos === 'QB' ? 'WR' : 'QB'])), F(any(MATE[t])), c, 1.4));
    // the coach, through a reporter: what he said about you at his own press conference
    if (c.coachLine) pool.push(post(reporter(), `${x.coach} on ${x.L}: “${c.coachLine}”`, c, 1.5));
    // your rival
    if (c.rival && c.rivalGame && !(c.us === c.them)) pool.push(post({ who: c.rival.name, at: lastOf(c.rival.name).toLowerCase() + '_' + TEAMS[c.rival.team].ab.toLowerCase(), bio: `${TEAMS[c.rival.team].name} ${x.pos}`, kind: 'rival', col: TEAMS[c.rival.team].c1, ver: true },
      c.won ? any(['Respect. See you in the rematch.', 'Enjoy it. It won’t happen twice.', 'Y’all can have this one.']) : any(['Told you. 🤫', 'Same result every time.', 'He knows. Everybody knows now.']), c, 2));
    // a callout from last week, settled
    if (c.callRes) {
      const q = c.callRes.quote;
      if (c.callRes.backed) {
        pool.push(post(neutral(), F(`He said “${q}” and then went out and did it. RECEIPTS 🧾🔥`), c, 3));
        pool.push(post(analyst(), F('Talking before the game is easy. {L} backed every word of it. That’s how you earn a locker room.'), c, 1.8));
      } else {
        pool.push(post(fan(c.opp), F(`Remember when {L} said “${q}”? 😂😂😂 We remember.`), c, 3));
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
    const ask = (q, answers, about) => {
      // about: the team the question is about, for the posts that quote you
      const [f, l, o] = REPORTERS[(qs.length * 2 + c.week) % REPORTERS.length];
      qs.push({ by: `${f} ${l}`, outlet: o, q: F(q), about, answers: answers.map(a => ({ ...a, t: F(a.t) })) });
    };
    // 1. you, or the callout
    if (c.callRes) {
      x.Q = c.callRes.quote;
      if (c.callRes.backed) ask('Last week you said ‘{Q}’ and then you went out and did it. Was that the plan all along?', [
        A('I don’t say things I can’t back up.', 'confident', 0, 6),
        A('That was just talk. The guys did the work today.', 'humble', 1, 2),
        A('Somebody had to tell them. Now they know.', 'trash', -1, 8)], c.opp);
      else ask('Last week you said ‘{Q}’ Do you regret it?', [
        A('Yeah. I wrote a check we didn’t cash, and that’s on me.', 'own', 2, -2),
        A('No regrets. I’d say it again tomorrow.', 'confident', -2, 3),
        A('I’m not talking about last week.', 'deflect', -1, -3)], c.opp);
    } else if (t === 'great') ask('{S} today. What was clicking for you out there?', [
      A('Credit to {help}. I just made the plays that came to me.', 'team', 2, 1),
      A('Coach had a great plan this week and we executed it.', 'team', 2, 1),
      A('Honestly? I expect this. This is who I am.', 'confident', 0, 5),
      A('They couldn’t guard me. Simple as that.', 'trash', -1, 7)], c.opp);
    else if (t === 'bad') ask(c.weak ? `Tough day: ${c.weak}. What happened out there?` : 'Tough day for you. What happened out there?', [
      A('That’s on me. I’ll fix it in practice this week.', 'own', 2, 0),
      A('One bad day. I’ll be fine.', 'confident', 0, 1),
      A('Some of those weren’t on me. Watch the tape.', 'blame', -3, -1),
      A('We’ll look at the film.', 'deflect', 0, -1)], c.opp);
    else ask('How would you grade your own game today?', [
      A('Not good enough. I left plays out there.', 'own', 2, 0),
      A('A B. Good, not great. More coming.', 'humble', 1, 1),
      A(t === 'good' ? 'I thought I played great, to be honest.' : 'I played fine. People expect too much.', 'confident', t === 'good' ? 0 : -1, 2),
      A('Ask me at the end of the season.', 'deflect', 0, 0)], c.opp);
    // 2. the rival, your role, or the team
    if (c.rivalGame && c.rival) ask(c.won ? '{R} had a lot to say before this one. Anything for him now?' : '{R} got the better of you today. Your thoughts on him?', c.won ? [
      A('Tell him I said good game. He’ll need the practice.', 'trash', -1, 8),
      A('He’s a great player. Today was just our day.', 'respect', 1, 1),
      A('The scoreboard says everything I need to say.', 'confident', 0, 5)] : [
        A('Credit to him. He made the plays today.', 'respect', 1, 1),
        A('That fuels me. I’ll see him again.', 'own', 1, 2),
        A('He got lucky. Everybody watching knows it.', 'trash', -2, 4)], c.opp);
    else if (c.role1 !== c.role0 && c.roleUp) ask('Coach made you {role} today. What does that mean to you?', [
      A('I just want to keep earning it every single week.', 'humble', 2, 1),
      A('It means I owe these guys even more now.', 'team', 1, 1),
      A('About time, honestly.', 'confident', -2, 5)], c.team);
    else if (c.role1 !== c.role0) ask('You’re moving down to {role}. Is that fair?', [
      A('Coach makes the calls. I’ll earn it back.', 'own', 3, 0),
      A('I disagree, and I’ll show him why on the field.', 'confident', -2, 3),
      A('No comment on that.', 'deflect', -1, -1)], c.team);
    else if (lost) ask('A loss to the {O}. Is there any concern in that locker room?', [
      A('None. This group sticks together. We’ll be fine.', 'team', 1, 1),
      A('We have to stop making excuses, starting with me.', 'own', 2, 1),
      A('Some guys need to take a long look in the mirror.', 'blame', -3, 4)], c.team);
    else ask(c.us === c.them ? 'A tie with the {O}. How does that sit with you?' : 'The {T} get it done against the {O}. What does this win say about this team?', [
      A('This locker room believes. You can feel it.', 'team', 1, 2),
      A('We’re the best team in this league. Write it down.', 'confident', 0, 6),
      A('It’s one game. Back to work Monday.', 'humble', 2, 0)], c.team);
    // 3. the next opponent (or the season, if it is over)
    if (c.next == null) ask('That’s the season. What’s your message to the fans?', [
      A('Thank you. We’ll be back better, and that starts with me.', 'own', 2, 2),
      A('This is just the beginning of what I’m going to do here.', 'confident', 0, 6),
      A('Thank the guys in that locker room. They carried me.', 'team', 2, 1)], c.team);
    else {
      const rivalNext = c.rival && c.rival.team === c.next;
      ask(rivalNext ? 'Next up is {R} and the {NX}. Any message for him?' : 'Next up are the {NX}. Any message for them?', [
        A('Good team. We’ll prepare like it’s the championship.', 'respect', 2, 0),
        A(rivalNext ? 'Tell {R} to bring a better plan this time. He’ll need it.' : `Tell their ${c.pos === 'QB' ? 'secondary' : 'corners'} to get some sleep this week. They’ll need it.`, 'trash', -1, 7, 'trash'),
        A('We’re winning that game. I guarantee it.', 'guarantee', -2, 9, 'guarantee'),
        A('One game at a time. That’s all I’ve got.', 'deflect', 1, -1)], c.next);
    }
    return qs;
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
  function quoteReaction(c, pick, about) {
    const x = words(c), q = pick.t, rep = reporter(), out = [], at = about == null ? c.opp : about;
    const lead = pick.call || pick.tone === 'trash' || pick.tone === 'respect' ? `${x.N} on the ${TEAMS[at].name}` : `${x.N}, after the ${c.won ? 'win' : c.us === c.them ? 'tie' : 'loss'}`;
    out.push(post(rep, `${lead}: “${q}”`, c, pick.tone === 'trash' || pick.tone === 'guarantee' ? 3 : 1.2));
    if (pick.tone === 'guarantee') {
      out.push(post(fan(c.next), fill('A GUARANTEE?? Oh {L} is gonna regret this. See you Sunday.', x), c, 2));
      out.push(post(analyst(), fill('Bold. If the {T} win, {L} is a legend this week. If they lose, he never hears the end of it.', x), c, 1.6));
      out.push(post(fan(c.team), fill('{L} with the GUARANTEE. I’m buying tickets.', x), c, 1.4));
    } else if (pick.tone === 'trash') {
      out.push(post(fan(at), fill(any(['Bulletin board. Printed. Laminated.', 'Talk is cheap, {L}.', '{L} with the mouth. We’ll see.'].concat(tier(c) === 'great' ? ['Ok he can play. He still can’t talk.', 'Enjoy the week, {L}. It’s a long season.'] : ['Real confident for a guy with {S} 😂', 'Big talk from a guy who just had THAT game.'])), x), c, 1.8));
      out.push(post(fan(c.team), fill(any(['{L} said what we were all thinking 😤', 'I love this energy from {L}.', 'LET HIM COOK 🗣️']), x), c, 1.2));
      if (c.rival && (c.rivalGame || (c.next != null && c.rival.team === c.next))) out.push(post({ who: c.rival.name, at: lastOf(c.rival.name).toLowerCase() + '_' + TEAMS[c.rival.team].ab.toLowerCase(), bio: `${TEAMS[c.rival.team].name} ${x.pos}`, kind: 'rival', col: TEAMS[c.rival.team].c1, ver: true },
        any(['Heard what he said. Talk is cheap.', 'Keep my name out your mouth. See you on the field.', '📸 screenshotted.']), c, 2.4));
    } else if (pick.tone === 'blame') {
      out.push(post(teammate(c, any(['LT', 'RG', 'C', c.pos === 'QB' ? 'WR' : 'QB'])), any(['Interesting.', 'We win as a team and we lose as a team. That’s all I’ll say.', '👀']), c, 2.2));
      out.push(post(neutral(), fill('Throwing teammates under the bus on the podium is a choice, {L}.', x), c, 1.2));
    } else if (pick.tone === 'own' || pick.tone === 'team' || pick.tone === 'humble') {
      out.push(post(fan(c.team), fill(any(['This is why I love {L}. Takes it on the chin.', 'Leader. {L} gets it.', 'Accountability from {L}. Love to see it.']), x), c, 0.9));
    }
    return out;
  }

  /* ---------- drawing ---------- */
  const initials = s => String(s).replace(/[^A-Za-z ]/g, ' ').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '#';

  const n = (v, one, many) => `${short(v)} ${v === 1 ? one : many}`;

  function postHtml(p, reply) {
    if (p.kind === 'trend') return `<div class="post trend"><b>${esc(p.text)}</b><small>${esc(p.sub)}</small></div>`;
    return `<div class="post${reply ? ' re' : ''}${p.hot ? ' hot' : ''} k-${p.kind}"><span class="av" style="--c:${esc(p.col)}">${esc(initials(p.who))}</span><div class="pbody">`
      + `<div class="phd"><b>${esc(p.who)}</b>${p.ver ? '<i class="ver" aria-label="verified"></i>' : ''}<span>@${esc(p.at)} · ${esc(p.ago || 'now')}</span></div>${p.bio ? `<div class="bio">${esc(p.bio)}</div>` : ''}`
      + `<p>${esc(p.text)}</p><div class="pmeta"><span>${n(p.rep, 'reply', 'replies')}</span><span>${n(p.rt, 'repost', 'reposts')}</span><span>${n(p.likes, 'like', 'likes')}</span>${p.hot ? '<em>viral</em>' : ''}</div>`
      + (p.replies && !reply ? `<div class="reps">${p.replies.map(r => postHtml(r, true)).join('')}</div>` : '') + '</div></div>';
  }

  PG.media = { reaction, press, quoteReaction, coachOnPress, buzzOf, postHtml, short, TONE, lastOf };
})();
