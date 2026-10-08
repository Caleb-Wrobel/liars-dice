import { NUM_DICE, nextRank, type Rank, type Rng, type SeatView } from "@liars-dice/engine";

/** How often a player at the decision pulls the cup rather than peering, so rounds end and games finish. */
export const PULL_CHANCE = 0.45;

/** How many steps up the ladder a claim may jump past the smallest legal one. */
const MAX_JUMP = 3;

/**
 * What a simulated player does next, from its own view alone, or null when it has no move. It is a random walk over
 * the moves the view says are open, not a clever player: the point is to reach every kind of move and every state the
 * server can be in, and the engine is the only judge of whether a move is legal, so a move that is refused is a bug in
 * this file or in the server, and the run reports it.
 */
export function chooseIntent(view: SeatView, rng: Rng): unknown {
  const open = new Set(view.available);
  if (open.size === 0) return null;
  const { rules } = view;

  if (open.has("pull") && (!open.has("peer") || rng() < PULL_CHANCE)) return { action: "pull" };
  if (open.has("peer")) return { action: "peer" };

  if (open.has("rearrange") && rng() < 0.2) {
    // Anything from nothing visible to four dice visible. Basic rules need a die left in the cup to roll.
    const count = Math.floor(rng() * NUM_DICE);
    const dice = [...Array(NUM_DICE).keys()].sort(() => rng() - 0.5).slice(0, count);
    return { action: "rearrange", visible: dice };
  }
  const skipRoll = open.has("peek") && rules.rollOptional && rng() < 0.2;
  if (open.has("roll") && !skipRoll) {
    return rules.rollable.length > 1 ? { action: "roll", set: rules.rollable[Math.floor(rng() * rules.rollable.length)] } : { action: "roll" };
  }
  const skipPeek = open.has("claim") && rules.peekOptional && rng() < 0.2;
  if (open.has("peek") && !skipPeek) return { action: "peek" };
  if (open.has("claim")) return { action: "claim", rank: climb(view.claim, rng) };
  return null;
}

/** A claim a few steps above the standing one, or the first above it. */
function climb(from: Rank, rng: Rng): Rank {
  let rank = nextRank(from)!;
  for (let steps = Math.floor(rng() * (MAX_JUMP + 1)); steps > 0; steps--) rank = nextRank(rank) ?? rank;
  return rank;
}
