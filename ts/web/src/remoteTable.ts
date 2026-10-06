import {
  formatRank,
  rollPhrase,
  type PullResult,
  type RoomEvent,
  type SeatKind,
  type SeatView,
  type ServerMessage,
} from "@liars-dice/engine";

/**
 * What the browser knows of a game that is running on the server, and nothing more. Each `state` message the server
 * sends is a snapshot (this seat's redacted view) with the events since the last one, so this class keeps the latest
 * snapshot and turns the events into the table's talk and its queue of reveals. There is no game in here to ask: a
 * seat can only ever hold what it was sent.
 *
 * It is plain TypeScript with no React in it. `getState` and `subscribe` have the shape React's `useSyncExternalStore`
 * wants, so the remote session can sit on top of it in a hook.
 */

/** How many lines of table talk are kept, as in a local game. */
export const LOG_LINES = 20;

export interface TableState {
  /** What this seat may see of the game, exactly as the server last sent it. */
  readonly view: SeatView;
  /** Who holds each seat now, in seat order. */
  readonly kinds: readonly SeatKind[];
  /** The table talk, oldest first. */
  readonly log: readonly string[];
  /**
   * Reveals not yet dismissed, oldest first; the first is the one on screen. The server does not wait for anyone to
   * read a reveal, so they can arrive faster than they are dismissed, and each is kept until it has been seen.
   */
  readonly pulls: readonly PullResult[];
  /** The server's last refusal, or a failure to reach it, until the next message arrives. */
  readonly error: string | null;
}

type Started = Extract<ServerMessage, { type: "started" }>;

/**
 * An event as a line or two of table talk. The names come from the view that arrived with the event. Nothing hidden
 * can appear: the public events carry none, apart from a pull, which turns every die face up for the whole table.
 */
export function eventLines(
  event: RoomEvent,
  view: Pick<SeatView, "names" | "rules">,
  firstRound: boolean,
): readonly string[] {
  const name = (seat: number) => view.names[seat] ?? "A player";
  switch (event.type) {
    case "round":
      return [`${name(event.opener)} opens the ${firstRound ? "game" : "round"}`];
    case "rearranged":
      return [`${name(event.seat)} rearranges the sets`];
    case "rolled":
      return [`${name(event.seat)} rolls ${rollPhrase(view.rules, event.set)}`];
    case "peered":
      return [`${name(event.seat)} peers at the hidden dice`];
    case "peeked":
      return []; // the result is private, and the roll just before it already said what happened
    case "claimed":
      return [`${name(event.seat)} claims ${formatRank(event.rank)}`];
    case "pulled":
      return [
        `${name(event.puller)} pulls the cup`,
        event.eliminated ? `${name(event.loser)} is out of the game` : `${name(event.loser)} loses a life`,
      ];
    case "won":
      return [`${name(event.seat)} wins the game`];
    case "dropped":
      return [`${name(event.seat)} lost the connection`];
    case "back":
      return [`${name(event.seat)} is back`];
    case "botTook":
      return [`${name(event.seat)} is now played by a bot`];
  }
}

export class RemoteTable {
  private state: TableState;
  private readonly listeners = new Set<() => void>();

  /** The game has just started: the server's first message to this seat. */
  constructor(first: Started) {
    this.state = { view: first.view, kinds: first.kinds, log: [], pulls: [], error: null };
    this.state = this.absorbed(first.events, first.view, true, this.state);
  }

  /** The current state. It is the same object until something changes. */
  getState = (): TableState => this.state;

  /** Calls `listener` after every change, and returns the way to stop. */
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /** Takes in whatever the server sent. Messages that are not about a running game (lobby, left, replaced) are ignored. */
  receive(message: ServerMessage): void {
    switch (message.type) {
      case "state":
      case "started": {
        const next: TableState = { ...this.state, view: message.view, kinds: message.kinds, error: null };
        this.set(this.absorbed(message.events, message.view, message.type === "started", next));
        return;
      }
      case "joined":
        // Resuming into a game that is on: this seat's view as it stands. The events it missed are not sent.
        if (message.view !== undefined && message.kinds !== undefined) {
          this.set({ ...this.state, view: message.view, kinds: message.kinds, error: null });
        }
        return;
      case "error":
        this.set({ ...this.state, error: message.error });
        return;
      default:
        return;
    }
  }

  /** The player has read the reveal on screen. */
  dismissPull(): void {
    if (this.state.pulls.length > 0) this.set({ ...this.state, pulls: this.state.pulls.slice(1) });
  }

  /** Something went wrong on this side, such as a move that could not be sent. */
  fail(text: string): void {
    this.set({ ...this.state, error: text });
  }

  private absorbed(events: readonly RoomEvent[], view: SeatView, firstRound: boolean, from: TableState): TableState {
    const lines = events.flatMap((event) => eventLines(event, view, firstRound));
    const pulls = events.flatMap((event): PullResult[] =>
      event.type === "pulled"
        ? [
            {
              puller: event.puller,
              claimer: event.claimer,
              claim: event.claim,
              dice: event.dice,
              revealed: event.revealed,
              claimTrue: event.claimTrue,
              loser: event.loser,
              eliminated: event.eliminated,
            },
          ]
        : [],
    );
    return {
      ...from,
      log: [...from.log, ...lines].slice(-LOG_LINES),
      pulls: pulls.length === 0 ? from.pulls : [...from.pulls, ...pulls],
    };
  }

  private set(next: TableState): void {
    this.state = next;
    for (const listener of [...this.listeners]) listener();
  }
}
