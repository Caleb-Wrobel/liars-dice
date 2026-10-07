import { PROTOCOL_VERSION, type ClientMessage, type LobbyView } from "@liars-dice/engine";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RETRY_FIRST_MS } from "./connection.ts";
import { OnlineGame } from "./OnlineGame.tsx";
import { loadSeat, saveSeat } from "./roomStore.ts";
import { server } from "./test-server.ts";
import { FakeSocket } from "./test-socket.ts";

const JOIN: ClientMessage = { type: "join", code: "KTMR", name: "Alex" };

const lobbyOf = (people: [number, string][], host = 1): LobbyView => ({
  code: "KTMR",
  capacity: 4,
  host,
  players: people.map(([id, name]) => ({ id, name })),
  bots: 4 - people.length,
  lives: 3,
  advanced: false,
});
const joined = (you: number, lobby: LobbyView, more: object = {}) => ({
  type: "joined",
  code: "KTMR",
  token: "tok",
  you,
  lobby,
  ...more,
});

afterEach(() => window.sessionStorage.clear());

/** The whole visit, through the real hook and the real connection, over a socket the test works by hand. */
function mount(options: { request?: ClientMessage | null; token?: string; strict?: boolean } = {}) {
  const sockets: FakeSocket[] = [];
  const open = (url: string) => {
    const socket = new FakeSocket(url);
    sockets.push(socket);
    return socket;
  };
  const onQuit = vi.fn();
  const game = (
    <OnlineGame
      url="ws://test/ws"
      request={options.request === undefined ? JOIN : options.request}
      {...(options.token === undefined ? {} : { token: options.token })}
      theme="saloon"
      onQuit={onQuit}
      open={open}
    />
  );
  const view = render(options.strict ? <StrictMode>{game}</StrictMode> : game);
  const live = () => sockets[sockets.length - 1]!;
  return {
    ...view,
    sockets,
    onQuit,
    live,
    open: () => act(() => live().open()),
    tell: (message: object) => act(() => live().say(message)),
    drop: (code = 1006) => act(() => live().drop(code)),
  };
}

/** In a lobby of Sam (host) and Alex, as Alex. */
function inLobby(options: Parameters<typeof mount>[0] = {}) {
  const m = mount(options);
  m.open();
  m.tell(joined(2, lobbyOf([[1, "Sam"], [2, "Alex"]])));
  return m;
}

describe("OnlineGame: getting in", () => {
  it("says it is connecting, and lets the player give up waiting", async () => {
    const { onQuit } = mount();
    expect(screen.getByRole("heading", { name: "Connecting…" })).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Reaching the game server");
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onQuit).toHaveBeenCalledTimes(1);
  });

  it("asks for the room once the line opens, with the protocol version", () => {
    const m = mount();
    expect(m.live().url).toBe("ws://test/ws");
    expect(m.live().sent).toEqual([]);
    m.open();
    expect(m.live().sent).toEqual([{ v: PROTOCOL_VERSION, ...JOIN }]);
  });

  it("goes to the lobby when the server says joined, as host or as a guest", () => {
    inLobby();
    expect(screen.getByRole("heading", { name: "Your room" })).toBeInTheDocument();
    expect(screen.getByText("K, T, M, R")).toBeInTheDocument();
    expect(screen.getByText("Waiting for Sam to start the game.")).toBeInTheDocument();
  });

  it("starts the game when the host presses Start", async () => {
    const m = mount({ request: { type: "create", name: "Sam", seats: 4 } });
    m.open();
    m.tell(joined(1, lobbyOf([[1, "Sam"]])));
    await userEvent.click(screen.getByRole("button", { name: "Start game" }));
    expect(m.live().sent.at(-1)).toEqual({ v: PROTOCOL_VERSION, type: "start" });
  });

  it("announces who comes into the lobby", () => {
    const m = inLobby();
    m.tell({ type: "lobby", lobby: lobbyOf([[1, "Sam"], [2, "Alex"], [3, "Kit"]]) });
    expect(within(screen.getByRole("list", { name: "Room news" })).getByText("Kit joined")).toBeInTheDocument();
  });

  it("gives up a place in the lobby and goes back to the start", async () => {
    const m = inLobby();
    await userEvent.click(screen.getByRole("button", { name: "Leave room" }));
    expect(m.live().sent.at(-1)).toEqual({ v: PROTOCOL_VERSION, type: "leave" });
    expect(m.onQuit).toHaveBeenCalledTimes(1);
  });
});

describe("OnlineGame: the game", () => {
  it("shows the table when the game starts, drawn from what this seat was sent", () => {
    const s = server(1, ["Ann", "Bo", "Cy"]);
    const m = inLobby();
    m.tell(s.started(1));
    for (const name of ["Ann", "Bo", "Cy"]) expect(screen.getByText(name)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Leave game" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Your room" })).toBeNull();
  });

  it("sends what the player does, with the protocol version", async () => {
    const s = server(1, ["Ann", "Bo", "Cy"]);
    const m = inLobby();
    m.tell(s.started(0)); // Ann opens, and this seat is Ann's
    await userEvent.click(screen.getByRole("button", { name: /Roll dice/ }));
    expect(m.live().sent.slice(-2)).toEqual([
      { v: PROTOCOL_VERSION, type: "intent", intent: { action: "roll", set: "hidden" } },
      { v: PROTOCOL_VERSION, type: "intent", intent: { action: "peek" } },
    ]);
  });
});

describe("OnlineGame: when it ends", () => {
  it("says why a room refused, in the server's words, and offers the way back", async () => {
    const m = mount();
    m.open();
    m.tell({ type: "error", code: "no_room", error: "there is no room with that code" });
    expect(screen.getByRole("heading", { name: "Could not join" })).toHaveFocus();
    expect(screen.getByText("there is no room with that code")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back to the start" }));
    expect(m.onQuit).toHaveBeenCalledTimes(1);
  });

  it("says when the place was taken by a newer window", () => {
    const m = inLobby();
    m.tell({ type: "replaced" });
    expect(screen.getByRole("heading", { name: "Opened somewhere else" })).toBeInTheDocument();
  });

  it("says when the server and the page no longer speak the same version", () => {
    const m = inLobby();
    act(() => m.live().raw(JSON.stringify({ v: PROTOCOL_VERSION + 1, type: "state" })));
    expect(screen.getByRole("heading", { name: "The game has been updated" })).toBeInTheDocument();
    expect(screen.getByText(/Reload the page/)).toBeInTheDocument();
  });

  it("says when the server could not be reached at all", () => {
    const m = mount();
    m.drop(); // the line dropped before the player had joined anything
    expect(screen.getByRole("heading", { name: "Could not reach the game server" })).toBeInTheDocument();
    expect(screen.getByText(/Check your connection/)).toBeInTheDocument();
  });

  it("says when the player left, when the server confirms it", () => {
    const m = inLobby();
    m.tell({ type: "left" });
    expect(screen.getByRole("heading", { name: "You left the room" })).toBeInTheDocument();
  });
});

describe("OnlineGame: a dropped line", () => {
  it("says the line is being won back, and stops saying so when the place is back", () => {
    vi.useFakeTimers();
    const m = inLobby();
    m.drop();
    expect(screen.getByText("Connection lost. Trying to get back…")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your room" })).toBeInTheDocument(); // the screen stays
    act(() => vi.advanceTimersByTime(RETRY_FIRST_MS));
    m.open();
    expect(m.live().sent).toEqual([{ v: PROTOCOL_VERSION, type: "resume", token: "tok" }]);
    m.tell(joined(2, lobbyOf([[1, "Sam"], [2, "Alex"]])));
    expect(screen.queryByText("Connection lost. Trying to get back…")).toBeNull();
  });

  it("ends, in words, when the place could not be won back", () => {
    vi.useFakeTimers();
    const m = inLobby();
    m.drop();
    act(() => vi.advanceTimersByTime(RETRY_FIRST_MS));
    m.open();
    m.tell({ type: "error", code: "unknown_token", error: "that place is no longer yours" });
    expect(screen.getByRole("heading", { name: "Disconnected" })).toBeInTheDocument();
    expect(screen.getByText(/A bot has taken it/)).toBeInTheDocument();
  });
});

describe("OnlineGame: keeping the place across a reload", () => {
  it("keeps the place in the tab once the server has confirmed it, and not before", () => {
    const m = mount();
    m.open();
    expect(loadSeat()).toBeNull();
    m.tell(joined(2, lobbyOf([[1, "Sam"], [2, "Alex"]])));
    expect(loadSeat()).toEqual({ token: "tok", code: "KTMR" });
  });

  it("keeps it through the game too", () => {
    const s = server(1, ["Ann", "Bo", "Cy"]);
    const m = inLobby();
    m.tell(s.started(1));
    expect(loadSeat()).toEqual({ token: "tok", code: "KTMR" });
  });

  it.each([
    ["the server says it was replaced", (m: ReturnType<typeof inLobby>) => m.tell({ type: "replaced" })],
    ["the server says the player left", (m: ReturnType<typeof inLobby>) => m.tell({ type: "left" })],
    ["the versions no longer match", (m: ReturnType<typeof inLobby>) => act(() => m.live().raw(JSON.stringify({ v: 99, type: "state" })))],
  ])("lets go of the place when %s", (_how, end) => {
    const m = inLobby();
    expect(loadSeat()).not.toBeNull();
    end(m);
    expect(loadSeat()).toBeNull();
  });

  it("lets go of a place from before when the visit it began is refused or cannot start", () => {
    saveSeat({ token: "old", code: "AAAA" });
    const refused = mount();
    refused.open();
    refused.tell({ type: "error", code: "no_room", error: "there is no room with that code" });
    expect(loadSeat()).toBeNull();

    saveSeat({ token: "old", code: "AAAA" });
    const failed = mount();
    failed.drop();
    expect(loadSeat()).toBeNull();
  });

  it("does not let go of a place while it is still being asked for, whether the line is opening or the answer is awaited", () => {
    saveSeat({ token: "old", code: "AAAA" });
    const m = mount();
    expect(loadSeat()).toEqual({ token: "old", code: "AAAA" }); // the line is opening
    m.open();
    expect(screen.getByRole("heading", { name: "Connecting…" })).toBeInTheDocument();
    expect(m.live().sent).toHaveLength(1); // the request is sent, and the answer is awaited
    expect(loadSeat()).toEqual({ token: "old", code: "AAAA" });
  });

  it("claims a place back: sends only the resume, says it is getting back in, and arrives in the lobby", () => {
    const m = mount({ request: null, token: "tok" });
    expect(screen.getByRole("heading", { name: "Connecting…" })).toBeInTheDocument();
    expect(screen.getByText("Getting back into your room.")).toBeInTheDocument();
    m.open();
    expect(m.live().sent).toEqual([{ v: PROTOCOL_VERSION, type: "resume", token: "tok" }]);
    m.tell(joined(2, lobbyOf([[1, "Sam"], [2, "Alex"]])));
    expect(screen.getByRole("heading", { name: "Your room" })).toBeInTheDocument();
  });

  it("claims a place back into a game that is on", () => {
    const s = server(1, ["Ann", "Bo", "Cy"]);
    const m = mount({ request: null, token: "tok" });
    m.open();
    m.tell(joined(2, lobbyOf([[1, "Sam"], [2, "Alex"]]), { view: s.core.views()[1], kinds: s.seatKinds }));
    for (const name of ["Ann", "Bo", "Cy"]) expect(screen.getByText(name)).toBeInTheDocument();
  });

  it("says so, and lets the place go, when the server no longer knows it", () => {
    saveSeat({ token: "tok", code: "KTMR" });
    const m = mount({ request: null, token: "tok" });
    m.open();
    m.tell({ type: "error", code: "unknown_token", error: "that place is no longer yours" });
    expect(screen.getByRole("heading", { name: "Disconnected" })).toBeInTheDocument();
    expect(loadSeat()).toBeNull();
  });
});

describe("OnlineGame: the connection's lifetime", () => {
  it("asks for the room once and keeps one live line, even where React runs effects twice", () => {
    const m = mount({ strict: true });
    expect(m.sockets).toHaveLength(2); // the first was opened and thrown away
    expect(m.sockets[0]!.closedWith).toBe(1000);
    expect(m.sockets[1]!.closedWith).toBeNull();
    act(() => m.sockets[0]!.open()); // a late word from the thrown-away line changes nothing
    expect(m.sockets[0]!.sent).toEqual([]);
    m.open();
    expect(m.sockets[1]!.sent).toEqual([{ v: PROTOCOL_VERSION, ...JOIN }]);
    m.tell(joined(2, lobbyOf([[1, "Sam"], [2, "Alex"]])));
    expect(screen.getByRole("heading", { name: "Your room" })).toBeInTheDocument();
  });

  it("closes the connection when the screen goes away", () => {
    const m = mount();
    m.unmount();
    expect(m.live().closedWith).toBe(1000);
  });
});
