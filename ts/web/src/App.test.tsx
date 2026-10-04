import { Category } from "@liars-dice/engine";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.tsx";
import { PERSONAS } from "./personas/index.ts";

afterEach(() => vi.restoreAllMocks());

describe("App", () => {
  it("plays again with the same settings after a game ends", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // every die is a 1, so claiming five 6s is a bluff

    render(<App />);
    await userEvent.clear(screen.getByLabelText("Your name"));
    await userEvent.type(screen.getByLabelText("Your name"), "Sam");
    await userEvent.selectOptions(screen.getByLabelText("Lives"), "1");
    await userEvent.selectOptions(screen.getByLabelText("Bots"), "1"); // one bot, so one lost bluff ends the game
    await userEvent.click(screen.getByRole("checkbox", { name: "Use Characters" })); // plain bots, named Bob
    await userEvent.selectOptions(screen.getByLabelText("Bot pace"), "fast");
    await userEvent.click(screen.getByRole("radio", { name: /Advanced/ }));
    await userEvent.click(screen.getByRole("button", { name: "Play" }));

    // Change the pace during the game: a rematch should keep the new value.
    await userEvent.selectOptions(screen.getByLabelText("Bot pace"), "normal");

    // Claim the top rank blind. Nothing can beat it, so Bob must pull, and the bluff costs Sam the game.
    await userEvent.selectOptions(screen.getByLabelText("Rank"), String(Category.FiveKind));
    await userEvent.selectOptions(screen.getByLabelText("Face"), "6");
    await userEvent.click(screen.getByRole("button", { name: "Claim five 6s" }));
    expect(await screen.findByRole("dialog", { name: "Bob lifts the cup" }, { timeout: 6000 })).toBeInTheDocument(); // normal pace
    expect(screen.getByText(/Sam loses a life and is out!/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Play again" }));

    // A fresh game: no dialog, a new round, the same name and lives, and the pace as last set.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText(/New round. Open with any claim./)).toBeInTheDocument();
    expect(screen.getByText("Sam")).toBeInTheDocument();
    expect(screen.getAllByLabelText("1 lives")).toHaveLength(2); // Sam and Bob, back to full lives
    expect(screen.getByLabelText("Bot pace")).toHaveValue("normal");
    // The talk starts over, with only the line saying who opens (seat 0, with the dice mocked to 0).
    expect(within(screen.getByRole("list", { name: "Table talk" })).getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Sam opens the game")).toBeInTheDocument();
  }, 15_000); // it types through the whole setup page, which is slow when the machine is busy

  it("reveals which level each bot played once a random game ends", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // every draw picks the first level, easy
    render(<App />);
    await userEvent.selectOptions(screen.getByLabelText("Lives"), "1");
    await userEvent.selectOptions(screen.getByLabelText("Bots"), "1"); // one bot, so one lost bluff ends the game
    await userEvent.click(screen.getByRole("checkbox", { name: "Use Characters" })); // plain bots, named Bob
    await userEvent.selectOptions(screen.getByLabelText("Bot level"), "random");
    await userEvent.selectOptions(screen.getByLabelText("Bot pace"), "fast");
    await userEvent.click(screen.getByRole("radio", { name: /Advanced/ }));
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    await userEvent.selectOptions(screen.getByLabelText("Rank"), String(Category.FiveKind));
    await userEvent.selectOptions(screen.getByLabelText("Face"), "6");
    await userEvent.click(screen.getByRole("button", { name: "Claim five 6s" }));
    expect(await screen.findByRole("dialog", { name: "Bob lifts the cup" })).toBeInTheDocument();
    expect(screen.getByText("The bots were: Bob was Easy.")).toBeInTheDocument();
  });

  it("goes back to setup from the end of a game", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    render(<App />);
    await userEvent.selectOptions(screen.getByLabelText("Lives"), "1");
    await userEvent.selectOptions(screen.getByLabelText("Bots"), "1"); // one bot, so one lost bluff ends the game
    await userEvent.selectOptions(screen.getByLabelText("Bot pace"), "fast");
    await userEvent.click(screen.getByRole("radio", { name: /Advanced/ }));
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    await userEvent.selectOptions(screen.getByLabelText("Rank"), String(Category.FiveKind));
    await userEvent.selectOptions(screen.getByLabelText("Face"), "6");
    await userEvent.click(screen.getByRole("button", { name: "Claim five 6s" }));
    await screen.findByRole("dialog");

    await userEvent.click(screen.getByRole("button", { name: "Change settings" }));
    expect(screen.getByRole("button", { name: "Play" })).toBeInTheDocument();
    expect(screen.getByLabelText("Your name")).toBeInTheDocument();
  });

  it("starts a fresh game with two bots, drawn as two different characters", async () => {
    render(<App />);
    expect(screen.getByLabelText("Bots")).toHaveValue("2");
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    const seated = Object.values(PERSONAS.saloon).filter((persona) => screen.queryByText(persona.name));
    expect(seated).toHaveLength(2); // the player plus two distinct characters
  });

  it("seats characters from the table's cast by default, and plain bots when the box is cleared", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0); // the draw takes the first archetype, the Saloon's Calico Kate
    render(<App />);
    expect(screen.getByRole("checkbox", { name: "Use Characters" })).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(screen.getByText("Calico Kate")).toBeInTheDocument();
    expect(screen.queryByText("Bob")).not.toBeInTheDocument();
  });
});
