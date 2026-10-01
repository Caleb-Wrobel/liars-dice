import { Category, rank, type PullResult } from "@liars-dice/engine";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PullDialog } from "./PullDialog.tsx";

const names = ["Alice", "Bob"];
const result: PullResult = {
  puller: 0,
  claimer: 1,
  claim: rank(Category.Pair, [3]),
  dice: [3, 3, 1, 2, 5],
  revealed: rank(Category.Pair, [3], 5),
  claimTrue: true,
  loser: 0,
  eliminated: false,
};

describe("PullDialog", () => {
  it("reveals every die and says who loses a life", () => {
    render(<PullDialog result={result} names={names} final={false} onContinue={() => {}} onRematch={() => {}} onQuit={() => {}} />);
    expect(screen.getByRole("dialog", { name: "Alice lifts the cup" })).toBeInTheDocument();
    expect(screen.getAllByLabelText(/showing/)).toHaveLength(5);
    expect(screen.getByText("a pair of 3s and a 5")).toBeInTheDocument();
    expect(screen.getByText("true")).toBeInTheDocument();
    expect(screen.getByText("Alice loses a life.")).toBeInTheDocument();
  });

  it("calls a false claim a bluff and moves on to the next round", async () => {
    const onContinue = vi.fn();
    const bluff = { ...result, claimTrue: false, loser: 1 };
    render(<PullDialog result={bluff} names={names} final={false} onContinue={onContinue} onRematch={() => {}} onQuit={() => {}} />);
    expect(screen.getByText("a bluff")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next round" }));
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it("offers a rematch or new settings when the game is over", async () => {
    const onRematch = vi.fn();
    const onQuit = vi.fn();
    const out = { ...result, eliminated: true };
    render(<PullDialog result={out} names={names} final onContinue={() => {}} onRematch={onRematch} onQuit={onQuit} />);
    expect(screen.getByText(/Alice loses a life and is out!/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Next round" })).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Play again" }));
    expect(onRematch).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Change settings" }));
    expect(onQuit).toHaveBeenCalledOnce();
  });
});
