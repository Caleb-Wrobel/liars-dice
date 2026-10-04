# Working in this repository

A pass-the-cup variant of Liar's Dice: a TypeScript engine, and a React web client that plays it against bots. Read
[RULES.md](RULES.md) for the game. Multiplayer is being designed in [docs/multiplayer.md](docs/multiplayer.md); that
document is the spec for anything touching views, intents, rooms or the protocol.

## Layout

- `ts/engine`: the game, pure TypeScript. No DOM, no network. Randomness always comes through an injected, seedable
  `Rng` (`seededRng`), never `Math.random` directly inside game logic, so games replay exactly in tests. Tests are in
  `ts/engine/test`.
- `ts/web`: the React client (Vite). Tests sit beside the code as `*.test.tsx`. `useSession` in `src/session.ts` owns the
  game, the bot timers and the table talk.
- `docs`: the design document and images. `RULES.md` is the source of truth for the rules.

## Commands

Run these from `ts/`. Use Node 22 and `npm ci` (not `npm install`).

```
npm ci
npm run typecheck        # both packages
npm test                 # both packages
npm run test:coverage
npm run build            # the web client
npm run test:slow        # engine strength sweeps; only when touching bot strength
```

Typecheck and the tests must pass before you commit. When you add a test, break the thing it guards on purpose and
check that the test fails, then restore it.

## Git

- Work on a branch named `feature/<name>`, `fix/<name>`, `chore/<name>` or `docs/<name>`. Never commit to `main`.
- Commit each finished piece on its own. Never force-push. Do not merge pull requests; the maintainer does.
- Subject line in conventional-commit form (`feat:`, `fix:`, `docs:`, `chore:`, `test:`, with an optional scope such as
  `feat(engine):`). The body says what changed and why.
- End the body with a rule and a haiku about the change, then a blank line, then any trailers:

  ```
  ---
  Five syllables here
  seven in the middle line
  five again to end
  ```

  Count the syllables honestly: 5, 7, 5.
- Issues and pull requests live on the maintainer's own tracker, not on this GitHub copy. If you are working in a cloud
  session, push your branch and stop; the maintainer fetches it from there.

## Code and design

- Match the surrounding code: naming, idiom and comment density. Comments say why, not what.
- The engine is the only judge of what is legal. Clients and servers ask it; they never re-implement a rule.
- Never put hidden information where another player could read it. Anything sent to a seat must come from the redacting
  view described in `docs/multiplayer.md`, and any code that builds a view needs property tests over many seeds.
- Accessibility is part of every UI change: real controls with accessible names, state announced to screen readers (the
  "Table talk" list), no information carried by colour alone, and `prefers-reduced-motion` honoured.
- Be inclusive: names and defaults assume nothing about anyone, and a player is never given a gender.
- This repository is public. Do not add secrets, credentials, addresses, or any detail about the machines the game is
  hosted on.
