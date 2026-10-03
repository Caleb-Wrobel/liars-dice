import { ARCHETYPES, seededRng, weightsOf, type ArchetypeId } from "@liars-dice/engine";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { MeetDialog } from "./MeetDialog.tsx";
import { PERSONAS, initialsOf } from "./personas/index.ts";
import { Setup } from "./Setup.tsx";
import { THEMES } from "./theme.ts";

afterEach(() => {
  document.documentElement.removeAttribute("data-theme");
  window.localStorage.clear();
});

describe.each(THEMES.map((t) => [t.id, t.meet] as const))("the %s Meet page", (themeId, meet) => {
  it("is called what the theme calls it", () => {
    render(<MeetDialog theme={themeId} onClose={() => {}} />);
    expect(screen.getByRole("dialog", { name: meet })).toBeInTheDocument();
  });

  it("introduces every character with a name, a title, a bio and initials", () => {
    render(<MeetDialog theme={themeId} onClose={() => {}} />);
    const cards = screen.getAllByRole("listitem");
    expect(cards).toHaveLength(ARCHETYPES.length);
    for (const { id } of ARCHETYPES) {
      const persona = PERSONAS[themeId][id];
      const card = cards.find((c) => within(c).queryByRole("heading", { name: persona.name }))!;
      expect(card, persona.name).toBeDefined();
      expect(within(card).getByText(persona.title)).toBeInTheDocument();
      expect(within(card).getByText(persona.bio)).toBeInTheDocument();
      expect(within(card).getByText(initialsOf(persona.name))).toHaveAttribute("aria-hidden", "true");
    }
  });

  // The Hacker table is the one exception: its bios are the weights, an opt-in spoiler, covered below.
  it.skipIf(themeId === "hacker")("does not show how the characters play beyond their bios", () => {
    render(<MeetDialog theme={themeId} onClose={() => {}} />);
    expect(screen.queryByText(/bluffing|withholding|gambling/i)).not.toBeInTheDocument();
  });
});

describe("the hacker Meet page", () => {
  it("shows each archetype's weights as its bio, in words and numbers", () => {
    render(<MeetDialog theme="hacker" onClose={() => {}} />);
    for (const archetype of ARCHETYPES) {
      const w = weightsOf(archetype);
      expect(
        screen.getByText(`Bluffing ${w.bluffing} of 5, withholding ${w.withholding} of 5, gambling ${w.gambling} of 5.`),
      ).toBeInTheDocument();
    }
  });
});

describe("the order of the Meet page", () => {
  /** The archetypes in the order a theme's cards appear, found by matching each card's name to its persona. */
  const shownOrder = (theme: "saloon" | "casino" | "spooky" | "hacker", rng: () => number): ArchetypeId[] => {
    const { unmount } = render(<MeetDialog theme={theme} onClose={() => {}} rng={rng} />);
    const names = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    unmount();
    return names.map((name) => ARCHETYPES.find(({ id }) => PERSONAS[theme][id].name === name)!.id);
  };

  it("shows every character exactly once, whatever the order", () => {
    for (let seed = 0; seed < 10; seed++) {
      const order = shownOrder("saloon", seededRng(seed));
      expect([...order].sort()).toEqual(ARCHETYPES.map((a) => a.id).sort());
    }
  });

  it("is not the archetypes' fixed order, so a card's position does not give its archetype away", () => {
    const fixed = ARCHETYPES.map((a) => a.id).join();
    const orders = Array.from({ length: 30 }, (_, seed) => shownOrder("saloon", seededRng(seed)).join());
    expect(orders.some((o) => o !== fixed)).toBe(true);
    expect(new Set(orders).size).toBeGreaterThan(10);
  });

  it("does not always lead with the same archetype, in any table style", () => {
    // 12 opens per style is plenty to tell a shuffle from a fixed order, and keeps the test quick: each open renders the
    // whole dialog, which is slow enough under coverage instrumentation to hit the default timeout with more.
    for (const theme of ["saloon", "casino", "spooky", "hacker"] as const) {
      const firsts = new Set(Array.from({ length: 12 }, (_, seed) => shownOrder(theme, seededRng(seed))[0]));
      expect(firsts.size, theme).toBeGreaterThan(2);
    }
  }, 20_000);

  it("keeps the order steady while the page stays open, and may change the next time it opens", () => {
    const rng = seededRng(3);
    const { rerender } = render(<MeetDialog theme="saloon" onClose={() => {}} rng={rng} />);
    const read = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    const first = read();
    rerender(<MeetDialog theme="saloon" onClose={() => {}} rng={rng} />);
    expect(read()).toEqual(first);
  });

  it("shuffles by default, without being given a random source", () => {
    render(<MeetDialog theme="saloon" onClose={() => {}} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(ARCHETYPES.length);
  });
});

describe("the Meet dialog", () => {
  it("closes on the Close button, on Escape and on a click outside", async () => {
    let closed = 0;
    const { container } = render(<MeetDialog theme="saloon" onClose={() => closed++} />);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    await userEvent.keyboard("{Escape}");
    await userEvent.click(container.querySelector(".backdrop")!);
    expect(closed).toBe(3);
  });

  it("moves focus to Close when it opens", () => {
    render(<MeetDialog theme="saloon" onClose={() => {}} />);
    expect(screen.getByRole("button", { name: "Close" })).toHaveFocus();
  });
});

describe("the Meet link on the setup form", () => {
  it("is named after the table style and follows it when the style changes", async () => {
    render(<Setup onStart={() => {}} />);
    expect(screen.getByRole("button", { name: "Meet the Rogues' Gallery" })).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText(/^Table style/), "casino");
    expect(screen.getByRole("button", { name: "Meet the High Rollers" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Meet the Rogues' Gallery" })).not.toBeInTheDocument();
  });

  it("sits on the same row as the Table style control", () => {
    render(<Setup onStart={() => {}} />);
    const row = screen.getByLabelText(/^Table style/).closest(".field-row");
    expect(row).not.toBeNull();
    expect(row).toBe(screen.getByRole("button", { name: /^Meet the/ }).closest(".field-row"));
  });

  it("opens the current style's characters and returns focus to the link when closed", async () => {
    render(<Setup onStart={() => {}} />);
    await userEvent.selectOptions(screen.getByLabelText(/^Table style/), "casino");
    const link = screen.getByRole("button", { name: "Meet the High Rollers" });
    await userEvent.click(link);
    const dialog = screen.getByRole("dialog", { name: "High Rollers" });
    expect(within(dialog).getByRole("heading", { name: PERSONAS.casino.bluffer.name })).toBeInTheDocument();
    expect(within(dialog).queryByRole("heading", { name: PERSONAS.saloon.bluffer.name })).not.toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(link).toHaveFocus();
  });
});
