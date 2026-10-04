# Multiplayer: decisions and protocol

This is the design for playing with other people: first on one shared device, then online in private rooms. It records
what has been decided, so the pieces can be built (and reviewed) against one spec. Status: **design only, nothing here is
built yet.** The work is tracked in the "Multiplayer (epic)" issue; each milestone below names its issue.

[RULES.md](../RULES.md) is the source of truth for the game itself. This document never changes a rule.

## Decisions

| Topic | Decision |
|---|---|
| Order of work | Hot-seat (one device) first, then online. |
| Who plays | Humans and bots can share a table. |
| Table size | 2 to 6 seats in total, humans and bots together. 6 is the cap so the table fits a phone. |
| Identity | Anonymous. A player picks a name; there are no accounts. Names are free text and assume nothing. |
| Joining | A room has a 4-character code, shareable as a link. The code is shared out of band. |
| Host | Whoever creates a room. They set the table size and press Start. Nobody can join after Start. |
| Seating | At Start everyone is shuffled into random seats, and the opener is random. |
| Bots | Empty seats at Start are filled with bots. For now these are generic bots at normal difficulty. |
| Dropped players | A player who stays disconnected for 60 seconds is replaced by a bot for the rest of the game. |
| Authority | The server is authoritative. Clients send intents; each seat is sent only its own view. |
| Chat, timers, rematch | None, for now. |
| Hosting | One host serves the static site and the socket, so the client connects to its own origin. The existing static deploy stays as a fallback, because solo and hot-seat play need no server. |

Deliberately deferred (see the "later" issue): rematch, chat, turn timers, a host action to replace an idle player with a
bot, a returning player regaining their seat after a bot took over, a generic-versus-character bots choice for the host,
spectators, draining the server on deploy, async play, a public lobby, accounts.

## Why the server must be authoritative

One set of five dice is shared and passed round. Part of it is **visible** (everyone sees the faces) and part is
**hidden** (only the holder may look). `Game` (`ts/engine/src/game.ts`) keeps every die in one object, so a client
holding a `Game` holds every secret. Two consequences:

1. The one authoritative `Game` lives where players cannot read its memory: the server. In hot-seat there is no server, so
   the same core runs in the browser and the **pass-the-device screen** is what keeps the secrets, not the code.
2. Nobody is ever sent the full state. Each seat is sent a **view**: the public state plus whatever that seat has
   legitimately seen. Rolls happen inside the core, never on a client, and the RNG seed is never sent.

The engine already helps: it is pure TypeScript with a seedable RNG, it has explicit turn actions, an `available()` query,
a `Step` state machine and `RuleError`, and its bots (`bot.ts`) act through the same actions a person does.

## The core

A transport-agnostic module that wraps a `Game` and knows nothing about sockets or React. The same module backs local
play, hot-seat and the server.

```
apply(seat, intent) -> { events, views }   // or a RuleError-style rejection
view(game, seat)    -> SeatView            // pure, the redacting projection
```

- **Intents** are what a seat may ask for. They mirror the engine: `pull`, `peer`, `rearrange` (with the visible dice
  indices), `roll` (with which set), `peek`, `claim` (with a `Rank`).
- A rejected intent changes nothing: out of turn, out of step, and every `RuleError` case become a rejection with a
  message, never a crash. The engine remains the only judge of legality.
- Bots take their turns through `apply` too, so a server can fill a seat or take over a dropped one with no special case.
- Deterministic with a seeded RNG, so any game replays exactly in tests.

## What a seat may see

The rule for `view(game, seat)`:

- **Public to everyone:** the names, each seat's lives, whose turn it is, the step, the standing claim and who made it, the
  rules in force, which dice are in the visible set and **their faces**, and the winner once there is one.
- **Private to a seat:** the face of a hidden die, and only while that seat is the current player and the die is in
  `game.known`. Every other hidden die is `null` in the view. (`known` is already per-turn in the engine: a hidden roll
  removes those dice from it, and passing the turn resets it to the visible set.)
- **Revealed by a pull:** at the end of a round all five dice are shown to everyone, as at a physical table.
- **Observable actions, not results:** other seats can be told that the current player rearranged, rolled a set or
  peeked (a physical table shows this) but never what the roll or the peek showed.

Sketch of a view (names are indicative; the properties are what matter):

```ts
interface SeatView {
  you: number;                       // this seat
  names: string[];
  lives: number[];
  current: number;
  step: Step;
  claim: Rank; claimer: number | null;
  rules: Rules;
  dice: (number | null)[];           // length 5; null where this seat may not see the face
  visible: number[];                 // indices of the visible set
  available: Action[];               // empty unless it is this seat's turn
  winner: number | null;
}
```

This projection is the one place a bug is a cheating bug, so it gets the heaviest tests (see below).

## Rooms

A room is held in memory only. There is no database; a restart ends the games in progress.

```
Lobby --(host presses Start)--> Playing --(one player has lives left)--> Finished
```

- **Code:** 4 characters, case-insensitive, drawn from consonants with no look-alikes:
  `BCDFGHJKLMNPQRSTVWXZ` (20 letters, 160,000 codes). No vowels means almost no real words, and the generator still rejects
  anything on a short blocklist and tries again. The code is displayed spelled out for screen readers.
- **Create:** the creator becomes the host and picks the table size (2 to 6). They take a seat in the lobby.
- **Join:** with the code (or a link carrying it) and a name. A full or started room refuses the join. Join attempts are
  rate limited per client address, and wrong codes get a small delay.
- **Start:** only the host. Empty seats get bots, everyone is shuffled into random seats, and the opener is random. The
  server tells each player their seat and then their first view.
- **Rooms end** when the game is finished and everyone has left, or when no human has been connected for a while.

### Absence

- **Who is who.** When a player takes a seat the server gives their browser a random token, and the browser keeps it.
  The token, not the room code, is what proves a connection owns a seat. One connection holds one seat; hot-seat inside
  an online room is not supported.
- **A drop.** The table is told ("Sam dropped"), and the seat waits **60 seconds**. If it is that player's turn, the game
  waits too. Coming back in the window, with the token, resumes the seat exactly as it was, including what the player
  had already seen this turn, and the table is told ("Sam is back").
- **A takeover.** When the window ends, a fresh generic normal bot takes the seat for the rest of the game, continuing
  from the exact game state. The table is told ("a bot took Sam's seat"). The seat stays the bot's; letting the player
  return after a takeover is deferred. A lost token (cleared browser data, another device) is simply a drop.
- **Leaving on purpose.** "Leave game" gives the seat to a bot at once, with no window: the player has said they are gone.
- **Two connections, one token.** The newest wins. The older one is sent `replaced` and closed, which is the friendly
  outcome when a reload opens a new connection before the old one has closed.
- **In the lobby** a drop works the same way, so a reload keeps your place; after the window the seat is freed. If the
  host's window ends in the lobby, the next human, in join order, becomes host. After Start the host has no powers, so
  nothing needs to move.
- A player who is connected but idle stalls the table. That is accepted for now; players are in touch out of band.

## Protocol

JSON messages over a WebSocket. Every message has a `v` (protocol version, starting at 1) and a `type`. The server
validates every incoming message against a schema (type, field types, string lengths, array sizes, integer ranges) and
drops the connection on garbage or on anything oversized. Unknown versions are refused with an `error`.

Client to server:

| `type` | Fields | Notes |
|---|---|---|
| `create` | `name`, `seats` | Makes a room, replies `joined`. |
| `join` | `code`, `name` | Replies `joined`, or `error`. |
| `resume` | `token` | Reconnect within the window. |
| `start` | none | Host only, in the lobby. |
| `intent` | `intent` | One of the intents above, while playing. |
| `leave` | none | Gives up the seat at once (a bot takes it). |

Server to client:

| `type` | Fields | Notes |
|---|---|---|
| `joined` | `code`, `token`, `you` | The token is a random secret the client keeps to resume. |
| `lobby` | `code`, `host`, `seats`, `players` | Names and open seats; the lobby also shows how many bots will fill the rest. |
| `state` | `view`, `events` | After every accepted intent, each seat gets its own view and the public events. |
| `error` | `code`, `message` | A rejected intent or request. The game state is unchanged. |
| `replaced` | none | Sent to an older connection when a newer one resumes the same seat; it is then closed. |

**Events** are the public log lines the table-talk list shows: who rearranged, rolled or peeked (never the result), who
claimed what, who pulled and the revealed dice, who lost a life, who was eliminated, who dropped and who was replaced.
They carry no hidden faces. Private results (the dice a `peer` or `peek` showed) reach only the actor, through their view.

Ordering and races: the server handles one room's messages one at a time, in arrival order, so a stale intent is simply
rejected as out of turn or out of step.

## Security

- **No hidden information leaves the core** except through `view`. Events and errors are built from public data only.
- **Origin check** on the WebSocket upgrade, allowing only the site's own origin (plus localhost for development).
- **Limits:** message size, messages per second per connection, joins per address, rooms per address, total rooms.
- **Names** are length-capped and rendered as text, never as markup.
- The room code is not a secret; it only controls who may take an empty seat. The seat token is the secret.
- This repository is public, so it holds no secrets and nothing about the machine the server runs on.

## Accessibility and inclusiveness

- Opponents' moves are announced in the existing live "Table talk" list, so a screen-reader player hears the table.
- Waiting states ("waiting for Sam") are announced too. There are no timers by default, so nobody is rushed.
- The pass-the-device screen hides the table from the accessibility tree as well as from view, and moves focus to its
  button.
- Names and the default player assume nothing about anyone. The room code works read aloud and by link as well as typed.
- The Still scenery setting and reduced motion apply to every new screen. Cues do not rely on colour alone.
- Each UI change runs the screen-reader checklist (issue #19).

## Testing

- **View redaction, as properties** over many seeds and random legal move sequences: for every seat and every moment, no
  hidden, unseen face appears anywhere in that seat's view or in any event. Mutation-check it by leaking a die on
  purpose and confirming the tests fail.
- **Core:** every illegal intent is rejected without changing state; a replayed seeded game gives identical events.
- **Server:** a fake-client harness drives whole games, including bots filling seats; chaos tests drop and resume
  connections around the 60-second window (with a fake clock).
- **Client:** the UI behaves identically on the local transport (existing tests unchanged), and a handful of end-to-end
  runs with two real browsers.

## Milestones

Each is shippable on its own. The numbers are issues on the project's tracker.

| | Piece | Issue |
|---|---|---|
| M0 | This document | #68 |
| M1 | Seats with a kind (human or bot) in the session and setup | #69 |
| M1 | A pass-the-device screen | #70 |
| M1 | Randomize the first player | #67 |
| M2 | The redacting `view(game, seat)` with property tests | #71 |
| M2 | Intents and the transport-agnostic core | #72 |
| M2 | The web client on a local transport behind one session interface | #73 |
| M3 | The server: rooms, codes, seats, start flow | #74 |
| M3 | Remote session, create and join screens, lobby | #75 |
| M3 | Packaging and serving the site and socket from one host | #76 |
| later | Everything deferred above | #77 |

M2 changes nothing for players: the browser game moves onto the same core the server will use, which is what lets the
online game and the local game stay the same game.

## Open questions

- The 60-second window needs the token to resume, so a token exists from the first online version. Whether a player may
  return after a bot has taken over is the deferred part.
- The exact message shapes (and the `SeatView` fields) are settled while building #71 to #74; this document is the
  contract for what they must guarantee, and should be updated with them.
