import { render, screen, within } from "@testing-library/react";
import { createElement } from "react";
import { describe, expect, it } from "vitest";
import rules from "../../../../RULES.md?raw"; // at the repository root, which vite.config.ts allows
import { RulesDialog } from "../RulesDialog.tsx";

/**
 * RULES.md is the in-depth version of the How to play dialog, and they follow the same order. This keeps them
 * from drifting apart: every dialog section has its counterpart in RULES.md, in the same order, and the words a
 * newcomer needs appear in both.
 */
const HEADINGS = [...rules.matchAll(/^## (.+)$/gm)].map((m) => m[1]!);

/**
 * [dialog heading, the RULES.md heading that goes deeper on it], in the order the dialog presents them. Two dialog
 * sections can share one RULES.md section: winning and losing a life are one section there, with the mechanics of a
 * pull covered later under Pulling.
 */
const COUNTERPARTS = [
  ["The game", "The game"],
  ["How you win", "Winning, and losing lives"],
  ["How you lose a life", "Winning, and losing lives"],
  ["Your turn", "A turn, in detail"],
  ["Basic and advanced", "Basic and advanced"],
  ["Ranks, lowest to highest", "Ranks"],
] as const;

describe("RULES.md and the How to play dialog", () => {
  it("both open with the premise and then the win state", () => {
    expect(HEADINGS.slice(0, 2)).toEqual(["The game", "Winning, and losing lives"]);
    render(createElement(RulesDialog, { onClose: () => {} }));
    const first = within(screen.getByRole("dialog")).getAllByRole("heading", { level: 3 }).slice(0, 2).map((h) => h.textContent);
    expect(first).toEqual(["The game", "How you win"]);
  });

  it("has a RULES.md section for every dialog section, in the same order", () => {
    render(createElement(RulesDialog, { onClose: () => {} }));
    const dialog = within(screen.getByRole("dialog")).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(dialog).toEqual(COUNTERPARTS.map(([name]) => name));
    const positions = COUNTERPARTS.map(([, deeper]) => HEADINGS.indexOf(deeper));
    expect(positions.every((p) => p >= 0), `every counterpart exists in ${HEADINGS.join(" | ")}`).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("keeps the extras for the curious in RULES.md: pulling in detail, the start of a round, tips and terms", () => {
    for (const heading of ["Pulling", "The start of a round", "Tips", "Terms"]) expect(HEADINGS).toContain(heading);
  });

  it("uses the same key words in both", () => {
    render(createElement(RulesDialog, { onClose: () => {} }));
    const dialog = screen.getByRole("dialog").textContent!.toLowerCase();
    const full = rules.toLowerCase();
    for (const word of [
      "visible",
      "hidden",
      "pull",
      "peer",
      "peek",
      "claim",
      "kicker",
      "strictly higher",
      "last player",
      "poker",
      "yahtzee",
      "straights",
      "claims that keep going up",
    ]) {
      expect(dialog, `dialog: ${word}`).toContain(word);
      expect(full, `RULES.md: ${word}`).toContain(word);
    }
  });

  it("says in both that a claim's kicker is not tied to the dice", () => {
    render(createElement(RulesDialog, { onClose: () => {} }));
    expect(screen.getByRole("dialog").textContent).toMatch(/claim any kicker you like/);
    expect(rules).toMatch(/never tied to their dice/);
  });
});
