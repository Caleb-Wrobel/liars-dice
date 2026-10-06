import {
  Bot,
  Core,
  Game,
  PROTOCOL_VERSION,
  advancedRules,
  basicRules,
  seededRng,
  type Applied,
  type RoomEvent,
  type SeatKind,
  type ServerMessage,
} from "@liars-dice/engine";

/** The engine's own core, standing in for the server: it makes the same views and events a real match would send. */
export function server(
  seed = 1,
  names: readonly string[] = ["Ann", "Bo", "Cy"],
  kinds?: SeatKind[],
  options: { opener?: number; advanced?: boolean } = {},
) {
  const game = new Game(names, options.advanced ? advancedRules(3) : basicRules(3), seededRng(seed), options.opener ?? 0);
  const core = new Core(game);
  const seatKinds: SeatKind[] = kinds ?? names.map(() => "human");
  const bots = names.map((_, i) => new Bot({ rng: seededRng(seed + 1 + i) }));
  const started = (seat: number): Extract<ServerMessage, { type: "started" }> => ({
    v: PROTOCOL_VERSION,
    type: "started",
    view: core.views()[seat]!,
    kinds: seatKinds,
    events: [{ type: "round", opener: game.current }],
  });
  const state = (res: Applied & { ok: true }, seat: number, extra: RoomEvent[] = []): ServerMessage => ({
    v: PROTOCOL_VERSION,
    type: "state",
    view: res.views[seat]!,
    kinds: seatKinds,
    events: [...res.events, ...extra],
  });
  /** A state message carrying exactly these events, with the view the game has at the moment. */
  const message = (seat: number, events: RoomEvent[], kinds: SeatKind[] = seatKinds): ServerMessage => ({
    v: PROTOCOL_VERSION,
    type: "state",
    view: core.views()[seat]!,
    kinds,
    events,
  });
  const ok = (seat: number, intent: Parameters<Core["apply"]>[1]) => {
    const res = core.apply(seat, intent);
    if (!res.ok) throw new Error(res.error);
    return res;
  };
  return { game, core, bots, seatKinds, started, state, message, ok };
}

