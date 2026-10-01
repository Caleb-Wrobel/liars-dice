import { Category, NIL, rank } from "@liars-dice/engine";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ClaimDice } from "./ClaimDice.tsx";

describe("ClaimDice", () => {
  it("draws a pair with a kicker as three dice", () => {
    render(<ClaimDice rank={rank(Category.Pair, [3], 5)} />);
    expect(screen.getByRole("group", { name: "Claimed dice: 3, 3, 5" })).toBeInTheDocument();
    expect(screen.getAllByLabelText(/showing/).map((d) => d.getAttribute("aria-label"))).toEqual([
      "die claimed, showing 3",
      "die claimed, showing 3",
      "die claimed, showing 5",
    ]);
  });

  it("marks only the kicker die", () => {
    const { container } = render(<ClaimDice rank={rank(Category.TwoPair, [5, 2], 4)} />);
    const dice = [...container.querySelectorAll("svg")];
    expect(dice).toHaveLength(5);
    expect(dice.filter((d) => d.classList.contains("die-kicker"))).toHaveLength(1);
    expect(dice[4]!.classList.contains("die-kicker")).toBe(true);
  });

  it("draws every die of a full house and none of the kicker", () => {
    const { container } = render(<ClaimDice rank={rank(Category.FullHouse, [4, 3])} />);
    expect(container.querySelectorAll("svg")).toHaveLength(5);
    expect(container.querySelectorAll(".die-kicker")).toHaveLength(0);
  });

  it("draws 'no pair and a 5' as a single kicker die", () => {
    const { container } = render(<ClaimDice rank={rank(Category.NoPair, [], 5)} />);
    expect(container.querySelectorAll("svg")).toHaveLength(1);
    expect(container.querySelectorAll(".die-kicker")).toHaveLength(1);
  });

  it("draws nothing for the nil claim", () => {
    const { container } = render(<ClaimDice rank={NIL} />);
    expect(container).toBeEmptyDOMElement();
  });
});
