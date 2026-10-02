import { CATEGORY_LABELS } from "@liars-dice/engine";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RulesDialog } from "./RulesDialog.tsx";
import { RANK_EXAMPLES } from "./rules/content.ts";

describe("RulesDialog", () => {
  it("opens with the premise and the win state, then covers losing a life, the turn, the modes and the ranks", () => {
    render(<RulesDialog onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: "How to play" })).toBeInTheDocument();
    const headings = within(screen.getByRole("dialog")).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual([
      "The game",
      "How you win",
      "How you lose a life",
      "Your turn",
      "Basic and advanced",
      "Ranks, lowest to highest",
    ]);
  });

  it("states the premise first: a dice-passing game of claims that keep going up, with visible and hidden dice", () => {
    render(<RulesDialog onClose={() => {}} />);
    const premise = screen.getByRole("heading", { name: "The game" }).closest("section")!.textContent!;
    expect(premise).toMatch(/dice-passing game/);
    expect(premise).toMatch(/claims that keep going up/);
    expect(premise).toMatch(/visible/);
    expect(premise).toMatch(/hidden/);
  });

  it("says how you win, and how you lose a life, in plain words", () => {
    render(<RulesDialog onClose={() => {}} />);
    expect(screen.getByRole("heading", { name: "How you win" }).closest("section")!.textContent).toMatch(/last player standing wins/);
    const life = screen.getByRole("heading", { name: "How you lose a life" }).closest("section")!.textContent!;
    expect(life).toMatch(/puller/);
    expect(life).toMatch(/claimer/);
    expect(life).toMatch(/after the puller/);
  });

  it("explains the turn in five steps, starting with the choice to pull or peer", () => {
    render(<RulesDialog onClose={() => {}} />);
    const turn = screen.getByRole("heading", { name: "Your turn" }).closest("section")!;
    expect(turn.textContent).toMatch(/Start with a choice/);
    const steps = within(turn).getAllByRole("listitem").map((li) => li.textContent);
    expect(steps).toHaveLength(5);
    expect(steps[0]).toMatch(/Pull.*peer/);
    expect(steps[4]).toMatch(/Claim.*strictly higher/);
    expect(turn.textContent).toMatch(/never checked/); // bluffing is part of the turn, not a section of its own
  });

  it("defines terms where they first appear, with no separate glossary", () => {
    const { container } = render(<RulesDialog onClose={() => {}} />);
    expect(container.querySelector("dl")).toBeNull();
    expect(screen.queryByRole("heading", { name: "The words" })).toBeNull();
    const strong = [...container.querySelectorAll("strong")].map((el) => el.textContent);
    for (const term of ["visible", "hidden", "pull", "puller", "claimer", "peer", "kicker", "rank"]) {
      expect(strong, term).toContain(term);
    }
  });

  it("ties the ranks to poker dice and Yahtzee, and says there are no straights", () => {
    render(<RulesDialog onClose={() => {}} />);
    const ranks = screen.getByRole("heading", { name: "Ranks, lowest to highest" }).closest("section")!.textContent!;
    expect(ranks).toMatch(/poker dice or Yahtzee/);
    expect(ranks).toMatch(/minus the straights/);
  });

  it("lets a claim carry any kicker, and says the revealed kicker is the highest die left over", () => {
    render(<RulesDialog onClose={() => {}} />);
    const ranks = screen.getByRole("heading", { name: "Ranks, lowest to highest" }).closest("section")!.textContent!;
    expect(ranks).toMatch(/claim any kicker you like/);
    expect(ranks).toMatch(/lower one/);
    expect(ranks).toMatch(/highest die left over/);
    expect(ranks).toMatch(/equal to or higher/);
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
