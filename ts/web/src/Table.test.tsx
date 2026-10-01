import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Setup } from "./Setup.tsx";
import { Table } from "./Table.tsx";
import type { Config } from "./session.ts";

const basic: Config = { name: "Alice", lives: 3, advanced: false, seed: 1 };

describe("Table", () => {
  it("opens a new round with five unseen dice and nothing to claim yet", () => {
    render(<Table config={basic} onQuit={() => {}} />);
    expect(screen.getByText(/New round. Open with any claim./)).toBeInTheDocument();
    expect(screen.getAllByLabelText(/unseen/)).toHaveLength(5);
    expect(screen.getByText(/Roll the hidden dice, then peek/)).toBeInTheDocument();
    expect(screen.queryByText("Make your claim")).toBeNull();
  });

  it("doesn't let you move dice before the rearrange step", () => {
    render(<Table config={basic} onQuit={() => {}} />);
    for (const die of screen.getAllByRole("button", { name: /^die [a-e]/ })) {
      expect(die).toBeDisabled();
    }
  });

  it("seats everyone on the scoreboard when there are several opponents", () => {
    render(<Table config={{ ...basic, opponents: 3 }} onQuit={() => {}} />);
    for (const name of ["Alice", "Bob", "Carol", "Dave"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it("lets you step through a bot's turn one move at a time", async () => {
    render(<Table config={{ ...basic, pace: "step" }} onQuit={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Roll hidden dice" }));
    await userEvent.click(screen.getByRole("button", { name: "Peek at hidden dice" }));
    await userEvent.click(screen.getByRole("button", { name: /^Smallest raise/ }));
    const talk = () =>
      within(screen.getByRole("list", { name: "Table talk" }))
        .queryAllByRole("listitem")
        .filter((li) => li.textContent?.startsWith("Bob "));
    expect(screen.getByText(/Bob is waiting for you/)).toBeInTheDocument();
    expect(talk()).toHaveLength(0); // no moves yet
    await userEvent.click(screen.getByRole("button", { name: "Next move" }));
    expect(talk()).toHaveLength(1); // exactly one move
    await userEvent.click(screen.getByRole("button", { name: "Next move" }));
    expect(talk()).toHaveLength(2);
  });

  it("shows the standing claim as dice once a bot has claimed", async () => {
    render(<Table config={{ ...basic, pace: "step" }} onQuit={() => {}} />);
    expect(screen.queryByRole("group", { name: /Claimed dice/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Roll hidden dice" }));
    await userEvent.click(screen.getByRole("button", { name: "Peek at hidden dice" }));
    await userEvent.click(screen.getByRole("button", { name: /^Smallest raise/ })); // none 1
    // Step Bob until he has claimed: at most a handful of moves.
    for (let i = 0; i < 6 && !screen.queryByRole("button", { name: "Pull the cup" }); i++) {
      const next = screen.queryByRole("button", { name: "Next move" });
      if (!next) break;
      await userEvent.click(next);
    }
    expect(screen.getByRole("group", { name: /Claimed dice/ })).toBeInTheDocument();
  });

  it("lets you change the bot pace from the table", async () => {
    render(<Table config={basic} onQuit={() => {}} />);
    const pace = screen.getByLabelText("Bot pace");
    expect(pace).toHaveValue("normal");
    await userEvent.selectOptions(pace, "slow");
    expect(pace).toHaveValue("slow");
  });

  it("rolls, peeks, then lets you claim and hands the table to Bob", async () => {
    render(<Table config={basic} onQuit={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Roll hidden dice" }));
    expect(screen.getAllByLabelText(/unseen/)).toHaveLength(5); // rolled, but not yet seen
    await userEvent.click(screen.getByRole("button", { name: "Peek at hidden dice" }));
    expect(screen.queryAllByLabelText(/unseen/)).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: /^Smallest raise/ }));
    expect(await screen.findByText("Bob is thinking…")).toBeInTheDocument();
  });
});

describe("Setup", () => {
  it("starts a game with the chosen options", async () => {
    let started: Config | null = null;
    render(<Setup onStart={(config) => (started = config)} />);
    await userEvent.clear(screen.getByLabelText("Your name"));
    await userEvent.type(screen.getByLabelText("Your name"), "Caleb");
    await userEvent.selectOptions(screen.getByLabelText("Lives"), "5");
    await userEvent.selectOptions(screen.getByLabelText("Opponents"), "3");
    expect(screen.getByText(/A balanced opponent/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText(/Bot level/), "stabby");
    await userEvent.selectOptions(screen.getByLabelText("Bot pace"), "slow");
    expect(screen.getByText(/Patient\. Hides its strength/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: /Advanced/ }));
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(started).toEqual({ name: "Caleb", lives: 5, advanced: true, opponents: 3, level: "stabby", pace: "slow" });
  });
});
