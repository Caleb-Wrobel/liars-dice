/**
 * How a bot moves at a table, shared by the browser and the server so a bot feels the same wherever it plays. These
 * numbers were tuned by watching real games: a person is slower than a program. They are parameters; a later change may
 * let a room choose them (see the pace issue on the tracker).
 */
import { Step } from "./game.ts";

/** Pause before each bot action, in milliseconds. */
export const BOT_PACE_MS = { fast: 250, normal: 1600, slow: 3200 } as const;
export type BotPace = keyof typeof BOT_PACE_MS;

/**
 * The pause is this many times longer before a bot's decisions, pulling or peering at the start of its turn and
 * claiming at the end of it, so the moments that matter get a beat, as they would from a person.
 */
export const DECISION_BEAT = 1.5;

/** How long a bot waits before its next action, given where its turn has got to. */
export function botDelayMs(pace: BotPace, step: Step): number {
  const deciding = step === Step.Decide || step === Step.Claim;
  return BOT_PACE_MS[pace] * (deciding ? DECISION_BEAT : 1);
}
