import { PROTOCOL_VERSION } from "@liars-dice/engine";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.tsx";
import { loadSeat, saveSeat } from "./roomStore.ts";
import { saveTheme } from "./theme.ts";
import { server } from "./test-server.ts";
import { FakeSocket } from "./test-socket.ts";

const created: FakeSocket[] = [];

beforeEach(() => {
  created.length = 0;
  vi.stubGlobal(
    "WebSocket",
    class extends FakeSocket {
      constructor(url: string) {
        super(url);
        created.push(this);
      }
    },
  );
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
  window.sessionStorage.clear();
});

const radios = () => screen.queryByRole("group", { name: "How do you want to play?" });

describe("App and the game server", () => {
  it("offers only Solo when no server is configured", () => {
    vi.stubEnv("VITE_SERVER_URL", "");
    render(<App />);
    expect(radios()).toBeNull();
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
  });

  it("offers Create and Join when a server is configured", () => {
    vi.stubEnv("VITE_SERVER_URL", "ws://localhost:8787/ws");
    render(<App />);
    expect(radios()).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^Solo/ })).toBeChecked();
  });

  it("makes a room: connects to the configured server, asks for it, and can be cancelled", async () => {
    vi.stubEnv("VITE_SERVER_URL", "ws://localhost:8787/ws");
    render(<App />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("radio", { name: /^Create a room/ }));
    await user.clear(screen.getByLabelText("Your name"));
    await user.type(screen.getByLabelText("Your name"), "Sam");
    await user.selectOptions(screen.getByLabelText("Seats"), "5");
    await user.selectOptions(screen.getByLabelText("Lives"), "2");
    await user.click(screen.getByRole("radio", { name: /Advanced/ }));
    await user.click(screen.getByRole("button", { name: "Create room" }));
    expect(screen.getByRole("heading", { name: "Connecting…" })).toBeInTheDocument();
    expect(created.at(-1)!.url).toBe("ws://localhost:8787/ws");
    created.at(-1)!.open();
    await vi.waitFor(() =>
      expect(created.at(-1)!.sent).toEqual([
        { v: PROTOCOL_VERSION, type: "create", name: "Sam", seats: 5, lives: 2, advanced: true },
      ]),
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(radios()).toBeInTheDocument(); // back at the start
  });

  it("opens on Join with the code from a share link, and joins only when asked", async () => {
    vi.stubEnv("VITE_SERVER_URL", "ws://localhost:8787/ws");
    window.history.replaceState(null, "", "/?join=bcdf");
    render(<App />);
    expect(screen.getByRole("radio", { name: /^Join a room/ })).toBeChecked();
    expect(screen.getByLabelText("Room code")).toHaveValue("BCDF");
    expect(created).toHaveLength(0); // nothing is opened by the link itself
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Your name"));
    await user.type(screen.getByLabelText("Your name"), "Alex");
    await user.click(screen.getByRole("button", { name: "Join room" }));
    expect(created).toHaveLength(1);
    created[0]!.open();
    await vi.waitFor(() =>
      expect(created[0]!.sent).toEqual([{ v: PROTOCOL_VERSION, type: "join", code: "BCDF", name: "Alex" }]),
    );
    expect(window.location.search).toBe(""); // the link has done its work
  });

  it.each([
    ["spooky", true],
    ["saloon", false],
  ])("carries the table style chosen on the setup page to the online table: %s", async (style, animated) => {
    vi.stubEnv("VITE_SERVER_URL", "ws://localhost:8787/ws");
    render(<App />);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Table style"), style);
    await user.click(screen.getByRole("radio", { name: /^Create a room/ }));
    await user.click(screen.getByRole("button", { name: "Create room" }));
    const socket = created.at(-1)!;
    const s = server(1, ["Sam", "Bo", "Cy"]);
    act(() => {
      socket.open();
      socket.say({
        type: "joined",
        code: "KTMR",
        token: "t",
        you: 1,
        lobby: { code: "KTMR", capacity: 3, host: 1, players: [{ id: 1, name: "Sam" }], bots: 2, lives: 3, advanced: false },
      });
      socket.say(s.started(0) as object);
    });
    // Only some table styles move, and only those offer the control that stills the scenery.
    expect(!!screen.queryByLabelText("Still scenery")).toBe(animated);
  });

  describe("after a reload", () => {
    const lobby = {
      code: "KTMR",
      capacity: 4,
      host: 1,
      players: [{ id: 1, name: "Sam" }, { id: 2, name: "Alex" }],
      bots: 2,
      lives: 3,
      advanced: false,
    };

    it("goes straight back into the room it was in", async () => {
      vi.stubEnv("VITE_SERVER_URL", "ws://localhost:8787/ws");
      saveSeat({ token: "tok", code: "KTMR" });
      render(<App />);
      expect(screen.getByText("Getting back into your room.")).toBeInTheDocument();
      expect(radios()).toBeNull();
      const socket = created.at(-1)!;
      expect(socket.url).toBe("ws://localhost:8787/ws");
      act(() => socket.open());
      expect(socket.sent).toEqual([{ v: PROTOCOL_VERSION, type: "resume", token: "tok" }]);
      act(() => socket.say({ type: "joined", code: "KTMR", token: "tok", you: 2, lobby }));
      expect(screen.getByRole("heading", { name: "Your room" })).toBeInTheDocument();
    });

    it.each([
      ["spooky", true],
      ["saloon", false],
    ] as const)("keeps the table style it had: %s", (style, animated) => {
      vi.stubEnv("VITE_SERVER_URL", "ws://localhost:8787/ws");
      saveTheme(style);
      saveSeat({ token: "tok", code: "KTMR" });
      render(<App />);
      const s = server(1, ["Ann", "Bo", "Cy"]);
      const socket = created.at(-1)!;
      act(() => {
        socket.open();
        socket.say({ type: "joined", code: "KTMR", token: "tok", you: 2, lobby, view: s.core.views()[1], kinds: s.seatKinds });
      });
      // Only some table styles move, and only those offer the control that stills the scenery.
      expect(!!screen.queryByLabelText("Still scenery")).toBe(animated);
    });

    it("does not go back when the page was opened from a link to a room", () => {
      vi.stubEnv("VITE_SERVER_URL", "ws://localhost:8787/ws");
      saveSeat({ token: "tok", code: "KTMR" });
      window.history.replaceState(null, "", "/?join=bcdf");
      render(<App />);
      expect(radios()).toBeInTheDocument();
      expect(screen.getByLabelText("Room code")).toHaveValue("BCDF");
      expect(created).toHaveLength(0);
    });

    it("does not go back when there is no server to go back to", () => {
      vi.stubEnv("VITE_SERVER_URL", "");
      saveSeat({ token: "tok", code: "KTMR" });
      render(<App />);
      expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
      expect(created).toHaveLength(0);
    });

    it("lets the place go when the player gives up waiting to get back", async () => {
      vi.stubEnv("VITE_SERVER_URL", "ws://localhost:8787/ws");
      saveSeat({ token: "tok", code: "KTMR" });
      render(<App />);
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(loadSeat()).toBeNull();
      expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    });

    it("lets the place go when the player leaves the room", async () => {
      vi.stubEnv("VITE_SERVER_URL", "ws://localhost:8787/ws");
      saveSeat({ token: "tok", code: "KTMR" });
      render(<App />);
      const socket = created.at(-1)!;
      act(() => {
        socket.open();
        socket.say({ type: "joined", code: "KTMR", token: "tok", you: 2, lobby });
      });
      expect(loadSeat()).not.toBeNull();
      await userEvent.click(screen.getByRole("button", { name: "Leave room" }));
      expect(loadSeat()).toBeNull();
      expect(socket.sent.at(-1)).toEqual({ v: PROTOCOL_VERSION, type: "leave" });
    });

    it("lets an old place go when a new room is asked for, so it cannot come back if that fails", async () => {
      vi.stubEnv("VITE_SERVER_URL", "ws://localhost:8787/ws");
      saveSeat({ token: "tok", code: "KTMR" });
      window.history.replaceState(null, "", "/?join=bcdf");
      render(<App />);
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: "Join room" }));
      expect(loadSeat()).toBeNull();
    });
  });

  it("still plays a local game from Solo, with no connection made", async () => {
    vi.stubEnv("VITE_SERVER_URL", "ws://localhost:8787/ws");
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByRole("button", { name: "New game" })).toBeInTheDocument();
    expect(created).toHaveLength(0);
  });
});
