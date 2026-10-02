import { ARCHETYPES } from "@liars-dice/engine";
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

  it("does not show how the characters play beyond their bios", () => {
    render(<MeetDialog theme={themeId} onClose={() => {}} />);
    expect(screen.queryByText(/bluffing|withholding|recklessness/i)).not.toBeInTheDocument();
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
