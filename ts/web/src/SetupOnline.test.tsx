import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { OnlineEntry } from "./online.ts";
import { Setup } from "./Setup.tsx";

function show(over: Partial<OnlineEntry> | null = {}) {
  const onStart = vi.fn();
  const create = vi.fn();
  const join = vi.fn();
  const online = over === null ? undefined : { create, join, ...over };
  render(<Setup onStart={onStart} {...(online ? { online } : {})} />);
  return { onStart, create, join, user: userEvent.setup() };
}
const mode = (name: RegExp) => screen.getByRole("radio", { name });
const asks = (label: string) => screen.queryByLabelText(label);

describe("Setup without a server", () => {
  it("offers only play on this device: no way to choose a room", () => {
    show(null);
    expect(screen.queryByRole("group", { name: "How do you want to play?" })).toBeNull();
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(asks("Bots")).toBeInTheDocument();
  });
});

describe("Setup with a server", () => {
  it("offers three ways to play, starting on Solo with the form as it was", () => {
    show();
    const group = screen.getByRole("group", { name: "How do you want to play?" });
    expect(within(group).getAllByRole("radio")).toHaveLength(3);
    expect(mode(/^Solo/)).toBeChecked();
    for (const label of ["Players", "Bots", "Bot level", "Bot pace", "Lives"]) expect(asks(label)).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Rules" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(asks("Room code")).toBeNull();
    expect(asks("Seats")).toBeNull();
  });

  it("still starts a local game from Solo", async () => {
    const { user, onStart, create, join } = show();
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
    expect(join).not.toHaveBeenCalled();
  });

  describe("Create a room", () => {
    it("asks for seats, lives and rules, and nothing about bots, which are the server's", async () => {
      const { user } = show();
      await user.click(mode(/^Create a room/));
      expect(asks("Seats")).toBeInTheDocument();
      expect(asks("Lives")).toBeInTheDocument();
      expect(screen.getByRole("group", { name: "Rules" })).toBeInTheDocument();
      for (const label of ["Players", "Bots", "Bot level", "Bot pace", "Room code"]) expect(asks(label)).toBeNull();
      expect(screen.queryByRole("group", { name: "Other players" })).toBeNull();
      expect(screen.getByText(/Empty seats are filled with bots/)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Create room" })).toBeInTheDocument();
      expect(within(asks("Seats")!).getAllByRole("option").map((o) => o.textContent)).toEqual(["2", "3", "4", "5", "6"]);
    });

    it("asks the room to be made with what was chosen, and starts no local game", async () => {
      const { user, create, onStart } = show();
      await user.click(mode(/^Create a room/));
      await user.clear(screen.getByLabelText("Your name"));
      await user.type(screen.getByLabelText("Your name"), "Sam");
      await user.selectOptions(screen.getByLabelText("Seats"), "6");
      await user.selectOptions(screen.getByLabelText("Lives"), "5");
      await user.click(screen.getByRole("radio", { name: /Advanced/ }));
      await user.click(screen.getByRole("button", { name: "Create room" }));
      expect(create).toHaveBeenCalledWith({ name: "Sam", seats: 6, lives: 5, advanced: true, theme: expect.any(String) });
      expect(onStart).not.toHaveBeenCalled();
    });

    it("asks for four seats and three lives, with basic rules, unless told otherwise", async () => {
      const { user, create } = show();
      await user.click(mode(/^Create a room/));
      await user.click(screen.getByRole("button", { name: "Create room" }));
      expect(create).toHaveBeenCalledWith({
        name: expect.stringMatching(/\S/),
        seats: 4,
        lives: 3,
        advanced: false,
        theme: expect.any(String),
      });
    });
  });

  describe("Join a room", () => {
    it("asks for the code, and for no rules or counts, which are the host's", async () => {
      const { user } = show();
      await user.click(mode(/^Join a room/));
      expect(asks("Room code")).toBeInTheDocument();
      for (const label of ["Lives", "Seats", "Players", "Bots", "Bot level", "Bot pace"]) expect(asks(label)).toBeNull();
      expect(screen.queryByRole("group", { name: "Rules" })).toBeNull();
      expect(screen.getByRole("button", { name: "Join room" })).toBeInTheDocument();
      expect(screen.getByText(/Four letters, like KTMR/)).toBeInTheDocument();
    });

    it("joins with the code, in capitals, and the name", async () => {
      const { user, join, onStart } = show();
      await user.click(mode(/^Join a room/));
      await user.clear(screen.getByLabelText("Your name"));
      await user.type(screen.getByLabelText("Your name"), "Alex");
      await user.type(screen.getByLabelText("Room code"), "ktmr");
      expect(screen.getByLabelText("Room code")).toHaveValue("KTMR");
      await user.click(screen.getByRole("button", { name: "Join room" }));
      expect(join).toHaveBeenCalledWith({ name: "Alex", code: "KTMR", theme: expect.any(String) });
      expect(onStart).not.toHaveBeenCalled();
    });

    it("will not join without a code", async () => {
      const { user, join } = show();
      await user.click(mode(/^Join a room/));
      await user.click(screen.getByRole("button", { name: "Join room" }));
      expect(join).not.toHaveBeenCalled();
    });

    it("trims the spaces round a code that was pasted", async () => {
      const { user, join } = show();
      await user.click(mode(/^Join a room/));
      await user.type(screen.getByLabelText("Room code"), " bcdf ");
      await user.click(screen.getByRole("button", { name: "Join room" }));
      expect(join.mock.calls[0]![0].code).toBe("BCDF");
    });
  });

  it("opens on Join with the code in place when a link brought one, and does not join by itself", () => {
    const { join } = show({ initialCode: "KTMR" });
    expect(mode(/^Join a room/)).toBeChecked();
    expect(screen.getByLabelText("Room code")).toHaveValue("KTMR");
    expect(join).not.toHaveBeenCalled();
  });

  it("keeps the name and the table style whichever way you play", async () => {
    const { user } = show();
    await user.clear(screen.getByLabelText("Your name"));
    await user.type(screen.getByLabelText("Your name"), "Kit");
    for (const way of [/^Create a room/, /^Join a room/, /^Solo/]) {
      await user.click(mode(way));
      expect(screen.getByLabelText("Your name")).toHaveValue("Kit");
      expect(screen.getByLabelText("Table style")).toBeInTheDocument();
    }
  });
});
