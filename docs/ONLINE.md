# Going online: what to decide

The owner plans head-to-head play and a global chat. This page is the short list of decisions that only he can
make, and what each one needs from him. Nothing here is signed up for, connected or switched on.

## Where things stand

- `js/online.js` is in the game and does nothing yet. It holds the parts that do not depend on the service: the
  player's online name and id (kept on the device), the rules a chat line has to pass (plain text, 140 characters,
  no links, one line every two and a half seconds), and the shape of the adapter a service plugs into.
- There is no screen for it. The menu gets an Online entry once a service is chosen.
- Careers already have their own ids, so a career could later belong to an account.

## Why a decision is needed

The game is plain files on GitHub Pages. Pages can send those files to a phone, and that is all it can do: it
cannot keep a connection open between two phones, or hold a chat message until the next person reads it. So both
features need something else to carry messages, and that something has an owner, limits and, past a free allowance,
a bill.

## Decision 1: head to head

| Choice | What it is | Needs from you | Trade-offs |
|---|---|---|---|
| Phone to phone (recommended to start) | The two phones talk directly. One shows a short code, the other types it in. A public relay is used only to introduce them. Library: PeerJS 1.5.5, on cdnjs. | Nothing to sign up for to try it. | Free. A share of phone pairs cannot connect directly (some mobile networks block it); fixing that means renting a relay later. No matchmaking with strangers: you need the code. |
| Through a hosted service | Both phones send every play through the service, the same one the chat uses. | An account with that service. | Works on every network, and strangers can be matched. Uses the service's allowance for every game played. |

Either way the game would run on one phone (the host) and send the other what happened, play by play. That is the
simplest design that cannot fall out of step.

## Decision 2: global chat

A global chat cannot be done phone to phone: somebody has to hold the room. The candidates whose libraries are on
cdnjs (the project's rule for libraries):

| Service | Library on cdnjs | Notes |
|---|---|---|
| Firebase Realtime Database | firebase 13.3.0 | Run by Google. Needs a Google account and a project. Has a free plan. |
| Ably | ably 2.30.0 | A messaging service. Needs an account. Has a free plan. |
| Pusher Channels | pusher 8.6.0 | A messaging service. Needs an account. Has a free plan. |

I have not checked today's limits or prices for any of them: look at each one's pricing page before choosing, in
particular how many phones may be connected at once on the free plan and what happens when that is passed.

What you would do: create the account and the project, then give me the public configuration it shows for a web
app. That configuration is meant to be in a web page; a secret or admin key is not, and should never be pasted
into the game or into this conversation.

## Decision 3: who the players are

- **A name only (simplest):** a player types a name and gets a random id on their device. Nothing to log in to.
  Anyone can use any name.
- **Sign-in:** the service's own sign-in (for example with an email). Names are then tied to a person, and bans
  hold. More to build, and you take on holding people's sign-in details with that service.

## Decision 4: keeping the chat fit to read

A room that anyone on the internet can type into will get abuse and spam. Before it opens, pick what applies:

- a word filter and a limit on how fast anyone can post (the limit is already in `js/online.js`);
- mute for each player (hide somebody on your own phone) and a report button;
- who can remove messages or ban, and how they do it;
- whether chat is on by default or has to be switched on in Settings;
- whether younger players are expected, which changes what is acceptable to collect and show.

## A suggested order

1. Head to head, phone to phone. Nothing to sign up for, and it shows whether playing a person is fun before
   anything is paid for.
2. Pick the chat service and the moderation rules together.
3. Chat, with mute and report from the first day.
