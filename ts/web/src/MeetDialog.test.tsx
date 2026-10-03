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
      // Compared as raw text, since a bio can run over several lines.
      expect(within(card).getByText((_, el) => el?.tagName === "P" && el.textContent === persona.bio)).toBeInTheDocument();
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
  it("shows each archetype's weights as its bio, in words and numbers, one to a line", () => {
    render(<MeetDialog theme="hacker" onClose={() => {}} />);
    const bios = screen.getAllByRole("listitem").map((item) => item.querySelector("p:last-child")!.textContent);
    for (const archetype of ARCHETYPES) {
      const w = weightsOf(archetype);
      expect(bios).toContain(`Bluffing ${w.bluffing} of 5\nWithholding ${w.withholding} of 5\nGambling ${w.gambling} of 5`);
    }
  });
});
