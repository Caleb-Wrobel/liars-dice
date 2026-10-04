import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Setup } from "./Setup.tsx";
import type { Config } from "./session.ts";

const start = async (onStart: (config: Config) => void = () => {}) => {
  render(<Setup onStart={onStart} />);
  return userEvent.setup();
};
const optionsOf = (label: string) =>
  within(screen.getByLabelText(label)).getAllByRole("option").map((o) => Number(o.textContent));

describe("Setup players", () => {
  it("starts with one player, who needs at least one bot, and no extra name fields", async () => {
    await start();
    expect(screen.getByLabelText("Players")).toHaveValue("1");
    expect(optionsOf("Players")).toEqual([1, 2, 3, 4, 5, 6]);
    expect(optionsOf("Bots")).toEqual([1, 2, 3, 4, 5]);
    expect(screen.queryByRole("group", { name: "Other players" })).toBeNull();
  });

  it("asks for a name for every other player, and a bot is optional once two people play", async () => {
    const user = await start();
    await user.selectOptions(screen.getByLabelText("Players"), "3");
    const group = screen.getByRole("group", { name: "Other players" });
    expect(within(group).getByLabelText("Player 2 name")).toBeInTheDocument();
    expect(within(group).getByLabelText("Player 3 name")).toBeInTheDocument();
    expect(within(group).getByText(/seated at random/)).toBeInTheDocument();
    expect(optionsOf("Bots")).toEqual([0, 1, 2, 3]); // a table seats six at most
  });

  it("hands the names to the game, falling back to Player N for a blank one", async () => {
    const onStart = vi.fn();
    const user = await start(onStart);
    await user.selectOptions(screen.getByLabelText("Players"), "3");
    await user.type(screen.getByLabelText("Player 2 name"), "Blake");
    await user.selectOptions(screen.getByLabelText("Bots"), "2");
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ otherHumans: ["Blake", "Player 3"], opponents: 2 }));
  });

  it("leaves a table of six people with no bots", async () => {
    const onStart = vi.fn();
    const user = await start(onStart);
    await user.selectOptions(screen.getByLabelText("Players"), "6");
    expect(optionsOf("Bots")).toEqual([0]);
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(onStart.mock.calls[0]![0].otherHumans).toHaveLength(5);
    expect(onStart.mock.calls[0]![0].opponents).toBe(0);
  });

  it("trims the bots to fit when people are added, and puts one back when you play alone again", async () => {
    const user = await start();
    await user.selectOptions(screen.getByLabelText("Bots"), "5");
    await user.selectOptions(screen.getByLabelText("Players"), "4");
    expect(screen.getByLabelText("Bots")).toHaveValue("2"); // 4 people and 2 bots fill the six seats
    await user.selectOptions(screen.getByLabelText("Bots"), "0");
    await user.selectOptions(screen.getByLabelText("Players"), "1");
    expect(screen.getByLabelText("Bots")).toHaveValue("1");
  });

  it("sends no other humans when you play alone", async () => {
    const onStart = vi.fn();
    const user = await start(onStart);
    await user.click(screen.getByRole("button", { name: "Play" }));
    expect(onStart.mock.calls[0]![0]).not.toHaveProperty("otherHumans");
  });
});
