import { CATEGORY_LABELS } from "@liars-dice/engine";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RulesDialog } from "./RulesDialog.tsx";
import { RANK_EXAMPLES } from "./rules/content.ts";

describe("RulesDialog", () => {
  it("covers the words, the turn, the modes, pulling, ranks and bluffing", () => {
    render(<RulesDialog onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "How to play" })).toBeInTheDocument();
    for (const heading of [
      "The words",
      "Your turn, in order",
      "Basic and advanced",
      "When someone pulls",
      "Ranks, lowest to highest",
      "Bluffing",
    ]) {
      expect(screen.getByRole("heading", { name: heading })).toBeInTheDocument();
    }
  });

  it("explains the six steps in order", () => {
    render(<RulesDialog onClose={() => {}} />);
    const steps = within(screen.getByRole("heading", { name: "Your turn, in order" }).closest("section")!)
      .getAllByRole("listitem")
      .map((li) => li.textContent);
    expect(steps).toHaveLength(6);
    expect(steps[1]).toMatch(/Pull.*peer/);
    expect(steps[5]).toMatch(/Claim.*strictly higher/);
  });

  it("lists the ranks lowest to highest, as the engine names them", () => {
    render(<RulesDialog onClose={() => {}} />);
    const ladder = screen.getByRole("heading", { name: "Ranks, lowest to highest" }).closest("section")!;
    const names = within(ladder)
      .getAllByRole("listitem")
      .map((li) => li.querySelector(".rank-name")?.textContent);
    expect(names).toEqual(RANK_EXAMPLES.map((e) => CATEGORY_LABELS[e.category]));
    expect(within(ladder).getByText("a pair of 3s and a 6")).toBeInTheDocument();
  });

  it("marks which rules the current game uses", () => {
    const { rerender } = render(<RulesDialog onClose={() => {}} advanced={false} />);
    expect(screen.getByRole("columnheader", { name: "Basic (your game)" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Advanced" })).toBeInTheDocument();
    rerender(<RulesDialog onClose={() => {}} advanced />);
    expect(screen.getByRole("columnheader", { name: "Advanced (your game)" })).toBeInTheDocument();
  });

  it("marks neither mode when it isn't opened from a game", () => {
    render(<RulesDialog onClose={() => {}} />);
    expect(screen.queryByText(/your game/)).toBeNull();
  });

  it("closes from the button, Escape, and the backdrop, but not from inside the dialog", async () => {
    const onClose = vi.fn();
    const { container } = render(<RulesDialog onClose={onClose} />);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
    await userEvent.click(container.querySelector(".backdrop")!);
    expect(onClose).toHaveBeenCalledTimes(3);
    await userEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("puts focus on Close when it opens, and back where it was when it closes", () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();
    const { unmount } = render(<RulesDialog onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
    unmount();
    expect(opener).toHaveFocus();
    opener.remove();
  });
});
