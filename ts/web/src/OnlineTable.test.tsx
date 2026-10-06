import { PROTOCOL_VERSION, nextRank, type ClientMessage, type ServerMessage } from "@liars-dice/engine";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { OnlineTable } from "./OnlineTable.tsx";
import { RemoteTable } from "./remoteTable.ts";
import { server } from "./test-server.ts";

/** The real table over the remote session, fed by the engine's own core standing in for the server. */
function show(seat: number) {
  const s = server(1, ["Ann", "Bo", "Cy"]);
  const table = new RemoteTable(s.started(seat));
  // Ann opens and claims, as the server would tell this seat about it, so Bo is to move.
  table.receive(s.state(s.ok(0, { action: "roll" }), seat));
  table.receive(s.state(s.ok(0, { action: "peek" }), seat));
  table.receive(s.state(s.ok(0, { action: "claim", rank: nextRank(s.game.claim)! }), seat));
  const sent: ClientMessage[] = [];
  const send = vi.fn((message: ClientMessage) => {
    sent.push(message);
    return true;
  });
  const onQuit = vi.fn();
  render(<OnlineTable table={table} send={send} onQuit={onQuit} />);
  return { s, table, sent, send, onQuit, tell: (m: ServerMessage) => act(() => table.receive(m)) };
}

describe("OnlineTable", () => {
  it("has no pace control, because the server sets the pace, and offers leaving, not a new game", () => {
    show(1);
    expect(screen.queryByLabelText("Bot pace")).toBeNull();
    expect(screen.queryByRole("button", { name: "New game" })).toBeNull();
    expect(screen.getByRole("button", { name: "Leave game" })).toBeInTheDocument();
  });

  it("asks before giving up the seat, with Stay as the way in", async () => {
    const { sent, onQuit } = show(1);
    await userEvent.click(screen.getByRole("button", { name: "Leave game" }));
    const dialog = screen.getByRole("dialog", { name: "Leave this game?" });
    expect(within(dialog).getByText(/A bot takes your seat, and you cannot take it back/)).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Stay" })).toHaveFocus();
    expect(sent).toEqual([]);
    expect(onQuit).not.toHaveBeenCalled();
  });

  it("stays, and sends nothing, when told to stay or when Escape is pressed", async () => {
    const { sent, onQuit } = show(1);
    await userEvent.click(screen.getByRole("button", { name: "Leave game" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Stay" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Leave game" }));
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(sent).toEqual([]);
    expect(onQuit).not.toHaveBeenCalled();
  });

  it("gives up the seat before it goes back to the start, once the player has said so", async () => {
    const { sent, send, onQuit } = show(1);
    await userEvent.click(screen.getByRole("button", { name: "Leave game" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Leave game" }));
    expect(sent).toEqual([{ type: "leave" }]);
    expect(onQuit).toHaveBeenCalledTimes(1);
    expect(send.mock.invocationCallOrder[0]!).toBeLessThan(onQuit.mock.invocationCallOrder[0]!);
  });

  it("leaves a finished game from the header without asking, since there is no seat left to give up", async () => {
    const { s, tell, sent, onQuit } = show(2);
    const res = s.ok(1, { action: "pull" });
    tell({ v: PROTOCOL_VERSION, type: "state", view: { ...res.views[2]!, winner: 2 }, kinds: s.seatKinds, events: [] });
    await userEvent.click(screen.getAllByRole("button", { name: "Leave game" })[0]!);
    expect(screen.queryByRole("dialog", { name: "Leave this game?" })).toBeNull();
    expect(sent).toEqual([{ type: "leave" }]);
    expect(onQuit).toHaveBeenCalledTimes(1);
  });

  it("offers the actions on the viewer's own turn, and sends them to the server", async () => {
    const { sent } = show(1);
    await userEvent.click(screen.getByRole("button", { name: "Pull the cup" }));
    expect(sent).toEqual([{ type: "intent", intent: { action: "pull" } }]);
  });

  it("offers no action to someone whose seat is not to move, even when the seat that is, is a person", () => {
    show(2); // Cy watches Bo, who is also a person
    expect(screen.queryByRole("button", { name: "Pull the cup" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Peer at the hidden dice" })).toBeNull();
  });

  it("shows the server's table talk", () => {
    show(1);
    const log = screen.getByRole("list", { name: "Table talk" });
    expect(within(log).getByText("Ann rolls the cup")).toBeInTheDocument();
    expect(within(log).getByText(/^Ann claims /)).toBeInTheDocument();
  });

  it("shows what the server refused", () => {
    const { tell } = show(1);
    tell({ v: PROTOCOL_VERSION, type: "error", code: "illegal", error: "it is not your turn" });
    expect(screen.getByRole("alert")).toHaveTextContent("it is not your turn");
  });

  it("shows a reveal to everyone, and goes on to the next round when it is dismissed", async () => {
    const { s, tell } = show(2);
    tell(s.state(s.ok(1, { action: "pull" }), 2));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Bo lifts the cup/)).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "Next round" }));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("ends a game with the way out and no rematch, which is for a local game", async () => {
    const { s, tell, sent, onQuit } = show(2);
    const res = s.ok(1, { action: "pull" });
    tell({
      v: PROTOCOL_VERSION,
      type: "state",
      view: { ...res.views[2]!, winner: 2 },
      kinds: s.seatKinds,
      events: res.events,
    });
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).queryByRole("button", { name: "Play again" })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: "Change settings" })).toBeNull();
    const leave = within(dialog).getByRole("button", { name: "Leave game" });
    expect(leave).toHaveClass("primary"); // the only button, so it is the main one, and where focus starts
    expect(leave).toHaveFocus();
    await userEvent.click(leave);
    expect(sent).toEqual([{ type: "leave" }]);
    expect(onQuit).toHaveBeenCalledTimes(1);
  });
});
