import { formatRank, type ClientMessage, type DiceSet, type Intent, type Rank } from "@liars-dice/engine";
import { useState, useSyncExternalStore } from "react";
import type { RemoteTable } from "./remoteTable.ts";
import { NO_HIDDEN_DIE, arrangementAllowed, type Pace, type Session, type Tray } from "./session.ts";

/** The pace the server runs its bots at. Nothing shows it online, but a Session has one. */
const SERVER_PACE: Pace = "slow";

/**
 * A game that is running on the server, as the table sees it. What the player may see comes from the `RemoteTable`,
 * and what they do goes out through `send` as an intent: the server is the judge, and a refusal comes back as an error
 * the table shows. `send` says whether the message went, so a move made while the line is down is reported, not lost.
 *
 * Only the arrangement of the trays is kept here. Dragging dice about is the player's own business until they act, so
 * it stays on this side and goes to the server as a `rearrange` just before the roll, peek or claim that follows.
 */
export function useRemoteSession(table: RemoteTable, send: (message: ClientMessage) => boolean): Session {
  const { view, kinds, log, pulls, error } = useSyncExternalStore(table.subscribe, table.getState);
  const [draft, setDraft] = useState<{ turn: string; visible: ReadonlySet<number> } | null>(null);

  // An arrangement belongs to the turn it was made on. Keeping it until the turn moves on, and not until the next
  // message, means someone else dropping and coming back does not undo it; and a new round never inherits an old one.
  const turn = `${view.current}|${view.step}|${view.lives.join(",")}|${formatRank(view.claim)}`;
  const arranged = draft !== null && draft.turn === turn ? draft.visible : null;

  const intent = (what: Intent) => {
    table.clearError();
    if (!send({ type: "intent", intent: what })) table.fail("Not connected. Your move was not sent.");
  };
  const commitDraft = () => {
    if (arranged !== null && view.available.includes("rearrange")) intent({ action: "rearrange", visible: [...arranged] });
  };

  const isHuman = (seat: number) => kinds[seat] === "human";
  const botSeat = view.winner === null && kinds[view.current] === "bot" ? view.current : null;

  return {
    local: false,
    view,
    seatKinds: kinds,
    isHuman,
    humanCount: kinds.filter((kind) => kind === "human").length,
    viewer: view.you,
    handoff: null, // everyone has their own screen
    acceptHandoff: () => {},
    log,
    pulled: pulls[0] ?? null,
    error,
    visibleSet: arranged ?? new Set(view.visible),
    botSeat,
    botTurn: botSeat !== null,
    levelReveal: undefined,
    pace: SERVER_PACE,
    setPace: () => {}, // the server sets the pace
    setPaused: () => {}, // and it cannot wait for a player reading the rules
    nextBotStep: () => {},

    pullCup: () => intent({ action: "pull" }),
    peer: () => intent({ action: "peer" }),
    roll: (which: DiceSet) => {
      commitDraft();
      intent({ action: "roll", set: which });
      // Under basic rules the peek is compulsory straight after the roll, so the roll takes it, as in a local game.
      if (!view.rules.peekOptional) intent({ action: "peek" });
    },
    peek: () => {
      commitDraft();
      intent({ action: "peek" });
    },
    claim: (rank: Rank) => {
      commitDraft();
      intent({ action: "claim", rank });
    },
    moveDie: (index: number, to: Tray) => {
      if (view.current !== view.you || !view.available.includes("rearrange")) return;
      const next = new Set(arranged ?? view.visible);
      if (to === "visible") next.add(index);
      else next.delete(index);
      if (!arrangementAllowed(view.rules, next.size)) {
        table.fail(NO_HIDDEN_DIE);
        return;
      }
      table.clearError();
      setDraft({ turn, visible: next });
    },
    dismissPull: () => table.dismissPull(),
  };
}
