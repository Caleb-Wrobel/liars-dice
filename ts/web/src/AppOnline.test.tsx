import { PROTOCOL_VERSION } from "@liars-dice/engine";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.tsx";
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
    await user.click(screen.getByRole("button", { name: "Create room" }));
    expect(screen.getByRole("heading", { name: "Connecting…" })).toBeInTheDocument();
    expect(created.at(-1)!.url).toBe("ws://localhost:8787/ws");
    created.at(-1)!.open();
    await vi.waitFor(() =>
      expect(created.at(-1)!.sent).toEqual([
        { v: PROTOCOL_VERSION, type: "create", name: "Sam", seats: 5, lives: 3, advanced: false },
      ]),
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(radios()).toBeInTheDocument(); // back at the start
  });

  it("opens on Join with the code from a share link, and joins only when asked", async () => {
    vi.stubEnv("VITE_SERVER_URL", "ws://localhost:8787/ws");
    window.history.replaceState(null, "", "/?join=ktmr");
    render(<App />);
    expect(screen.getByRole("radio", { name: /^Join a room/ })).toBeChecked();
    expect(screen.getByLabelText("Room code")).toHaveValue("KTMR");
    expect(created).toHaveLength(0); // nothing is opened by the link itself
    const user = userEvent.setup();
    await user.clear(screen.getByLabelText("Your name"));
    await user.type(screen.getByLabelText("Your name"), "Alex");
    await user.click(screen.getByRole("button", { name: "Join room" }));
    expect(created).toHaveLength(1);
    created[0]!.open();
    await vi.waitFor(() =>
      expect(created[0]!.sent).toEqual([{ v: PROTOCOL_VERSION, type: "join", code: "KTMR", name: "Alex" }]),
    );
    expect(window.location.search).toBe(""); // the link has done its work
  });

  it("still plays a local game from Solo, with no connection made", async () => {
    vi.stubEnv("VITE_SERVER_URL", "ws://localhost:8787/ws");
    render(<App />);
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByRole("button", { name: "New game" })).toBeInTheDocument();
    expect(created).toHaveLength(0);
  });
});
