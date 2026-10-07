import type { LobbyView } from "@liars-dice/engine";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Lobby } from "./Lobby.tsx";

const lobbyOf = (people: [number, string][], host: number, capacity = 4): LobbyView => ({
  code: "KTMR",
  capacity,
  host,
  players: people.map(([id, name]) => ({ id, name })),
  bots: capacity - people.length,
  lives: 3,
  advanced: false,
});
const base = {
  code: "KTMR",
  lobby: lobbyOf([[1, "Sam"], [2, "Alex"]], 1),
  you: 2 as number | null,
  host: false,
  news: [] as string[],
  error: null as string | null,
};

function show(over: Partial<typeof base> = {}) {
  const onStart = vi.fn();
  const onLeave = vi.fn();
  render(<Lobby state={{ ...base, ...over }} onStart={onStart} onLeave={onLeave} />);
  return { onStart, onLeave, user: userEvent.setup() };
}

/** Stands in for the clipboard. Call it after `show()`: `userEvent.setup()` puts in a clipboard of its own. */
function clipboard(write: () => Promise<void>) {
  const writeText = vi.fn(async (_text: string) => write());
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  return writeText;
}
afterEach(() => Reflect.deleteProperty(navigator, "clipboard"));

describe("Lobby", () => {
  it("starts at the top of the screen, for a screen reader", () => {
    show();
    expect(screen.getByRole("heading", { name: "Your room" })).toHaveFocus();
  });

  it("shows the room code large, and reads it out letter by letter", () => {
    show();
    const card = screen.getByRole("region", { name: "Room code" });
    expect(within(card).getByText("KTMR")).toHaveAttribute("aria-hidden", "true");
    expect(within(card).getByText("K, T, M, R")).toHaveClass("sr-only");
  });

  it("lists the people, naming who is you and who is the host in words", () => {
    show({ lobby: lobbyOf([[1, "Sam"], [2, "Alex"], [3, "Kit"]], 1), you: 2 });
    const items = within(screen.getByRole("region", { name: /Players/ })).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["Sam (host)", "Alex (you)", "Kit"]);
    expect(screen.getByRole("heading", { name: "Players, 3 of 4 seats" })).toBeInTheDocument();
  });

  it("says when you are both", () => {
    show({ lobby: lobbyOf([[1, "Sam"]], 1), you: 1, host: true });
    expect(screen.getByText("Sam (you, host)")).toBeInTheDocument();
  });

  it.each([
    [0, "The table is full."],
    [1, "A bot will fill the empty seat."],
    [2, "2 bots will fill the empty seats."],
  ])("says what happens to the empty seats: %i bots", (bots, line) => {
    show({ lobby: { ...lobbyOf([[1, "Sam"]], 1), bots } });
    expect(screen.getByText(line)).toBeInTheDocument();
  });

  it("gives the host the Start button, and nothing about waiting", async () => {
    const { user, onStart } = show({ host: true, you: 1 });
    await user.click(screen.getByRole("button", { name: "Start game" }));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/Waiting for/)).toBeNull();
  });

  it("tells everyone else who they are waiting for, and gives them no Start button", () => {
    show();
    expect(screen.getByText("Waiting for Sam to start the game.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start game" })).toBeNull();
  });

  it("lets a player leave", async () => {
    const { user, onLeave } = show();
    await user.click(screen.getByRole("button", { name: "Leave room" }));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("copies the code, and says so", async () => {
    const { user } = show();
    const write = clipboard(() => Promise.resolve());
    await user.click(screen.getByRole("button", { name: "Copy code" }));
    expect(write).toHaveBeenCalledWith("KTMR");
    expect(await screen.findByText("Code copied")).toBeInTheDocument();
  });

  it("copies a link that opens the page ready to join, and says so", async () => {
    const { user } = show();
    const write = clipboard(() => Promise.resolve());
    await user.click(screen.getByRole("button", { name: "Copy link" }));
    expect(write).toHaveBeenCalledTimes(1);
    expect(new URL(write.mock.calls[0]![0]).searchParams.get("join")).toBe("KTMR");
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
  });

  it("says so when it cannot copy, and what to do instead", async () => {
    const { user } = show();
    clipboard(() => Promise.reject(new Error("denied")));
    await user.click(screen.getByRole("button", { name: "Copy code" }));
    expect(await screen.findByText(/Could not copy/)).toBeInTheDocument();
  });

  it("says nothing about copying until something was copied", () => {
    show();
    expect(screen.getByRole("status")).toHaveTextContent("");
  });

  it("announces who came and went in a polite list, the newest few", () => {
    show({ news: ["a joined", "b joined", "c joined", "d joined", "e joined", "f joined", "g left"] });
    const news = screen.getByRole("list", { name: "Room news" });
    expect(news).toHaveAttribute("aria-live", "polite");
    expect(within(news).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      "b joined",
      "c joined",
      "d joined",
      "e joined",
      "f joined",
      "g left",
    ]);
  });

  it("shows what the server refused, as an alert", () => {
    show({ error: "only the host can start the game" });
    expect(screen.getByRole("alert")).toHaveTextContent("only the host can start the game");
  });

  it("shows nothing before there is a room", () => {
    const { container } = render(
      <Lobby state={{ ...base, code: null, lobby: null }} onStart={() => {}} onLeave={() => {}} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
