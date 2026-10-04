import { render, renderHook, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PLAYER_NAMES } from "./playerNames.ts";
import { Setup } from "./Setup.tsx";
import { Table } from "./Table.tsx";
import { useSession, type Config } from "./session.ts";

// Alice opens, so these tests can start from her turn. The opener is random otherwise.
const basic: Config = { name: "Alice", lives: 3, advanced: false, seed: 1, opener: 0 };

describe("Table", () => {
  it("opens a new round with five unseen dice and nothing to claim yet", () => {
    render(<Table config={basic} onQuit={() => {}} onRematch={() => {}} />);
    expect(screen.getByText(/New round. Open with any claim./)).toBeInTheDocument();
    expect(screen.getAllByLabelText(/unseen/)).toHaveLength(5);
    expect(screen.getByText(/Roll the dice to see them before you claim/)).toBeInTheDocument();
    expect(screen.queryByText("Make your claim")).toBeNull();
  });

  it("has no Peek button in basic play, because the roll takes the peek", async () => {
    render(<Table config={basic} onQuit={() => {}} onRematch={() => {}} />);
    expect(screen.getByRole("button", { name: "Roll dice" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Peek at hidden dice" })).toBeNull();
    expect(screen.queryByText("Make your claim")).toBeNull(); // locked until the roll
    await userEvent.click(screen.getByRole("button", { name: "Roll dice" }));
    expect(screen.queryByRole("button", { name: "Peek at hidden dice" })).toBeNull();
    expect(screen.queryAllByLabelText(/unseen/)).toHaveLength(0); // already seen
    expect(screen.getByRole("button", { name: /^Smallest raise/ })).toBeInTheDocument(); // and ready to claim
  });

  it("lists the roll buttons in the same order as the trays they roll", () => {
    // If the buttons run the other way from the trays, each one sits across from the tray it rolls and the
    // two look crisscrossed. The test compares the two orders, whichever way round the trays are.
    render(<Table config={{ ...basic, advanced: true }} onQuit={() => {}} onRematch={() => {}} />);
    const follows = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const orderOf = (visible: Element, hidden: Element) => (follows(visible, hidden) ? "visible, hidden" : "hidden, visible");

    const trays = orderOf(screen.getByRole("region", { name: "Visible" }), screen.getByRole("region", { name: "Under the cup" }));
    const rollVisible = screen.getByRole("button", { name: "Roll visible dice" });
    const rollHidden = screen.getByRole("button", { name: "Roll hidden dice" });
    expect(orderOf(rollVisible, rollHidden)).toBe(trays);
    expect(follows(rollVisible, screen.getByRole("button", { name: "Peek at hidden dice" }))).toBe(true);
    expect(follows(rollHidden, screen.getByRole("button", { name: "Peek at hidden dice" }))).toBe(true);
  });

  it("calls the roll button just Roll dice in basic play, where there is only one roll", () => {
    render(<Table config={basic} onQuit={() => {}} onRematch={() => {}} />);
    expect(screen.getByRole("button", { name: "Roll dice" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Roll (hidden|visible) dice/ })).toBeNull();
  });

  it("keeps Roll hidden dice and Roll visible dice apart in advanced play", () => {
    render(<Table config={{ ...basic, advanced: true }} onQuit={() => {}} onRematch={() => {}} />);
    expect(screen.getByRole("button", { name: "Roll hidden dice" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Roll visible dice" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Roll dice" })).toBeNull();
  });

  it("names the dice by number and shows no letters under them", () => {
    // The a to e letters were for the old command-line version, where you type them. Here you move the dice themselves, so a
    // letter names nothing. Screen readers still need to tell the dice apart as they move between trays.
    const { container } = render(<Table config={basic} onQuit={() => {}} onRematch={() => {}} />);
    expect(container.querySelector(".die-letter")).toBeNull();
    const names = screen.getAllByRole("img", { name: /^die / }).map((die) => die.getAttribute("aria-label"));
    expect(names).toEqual(["1", "2", "3", "4", "5"].map((n) => `die ${n}, unseen`));
    for (const die of screen.getAllByRole("button", { name: /^die / })) {
      expect(die.textContent, "no letter under the die").not.toMatch(/[a-e]/i);
    }
  });

  it("offers Peek straight away in advanced play", () => {
    render(<Table config={{ ...basic, advanced: true }} onQuit={() => {}} onRematch={() => {}} />);
    expect(screen.getByRole("button", { name: "Peek at hidden dice" })).toBeInTheDocument();
  });

  it("doesn't let you move dice before the rearrange step", () => {
    render(<Table config={basic} onQuit={() => {}} onRematch={() => {}} />);
    for (const die of screen.getAllByRole("button", { name: /^die [1-5]/ })) {
      expect(die).toBeDisabled();
    }
  });

  it("seats everyone on the scoreboard when there are several opponents", () => {
    render(<Table config={{ ...basic, opponents: 3 }} onQuit={() => {}} onRematch={() => {}} />);
    for (const name of ["Alice", "Bob", "Carol", "Dave"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it("lets you step through a bot's turn one move at a time", async () => {
    render(<Table config={{ ...basic, pace: "step" }} onQuit={() => {}} onRematch={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Roll dice" }));
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
    render(<Table config={{ ...basic, pace: "step" }} onQuit={() => {}} onRematch={() => {}} />);
    expect(screen.queryByRole("group", { name: /Claimed dice/ })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Roll dice" }));
    await userEvent.click(screen.getByRole("button", { name: /^Smallest raise/ })); // none 1
    // Step Bob until he has claimed: at most a handful of moves.
    for (let i = 0; i < 6 && !screen.queryByRole("button", { name: "Pull the cup" }); i++) {
      const next = screen.queryByRole("button", { name: "Next move" });
      if (!next) break;
      await userEvent.click(next);
    }
    expect(screen.getByRole("group", { name: /Claimed dice/ })).toBeInTheDocument();
  });

  it("opens the rules from the table, marking the rules you are playing", async () => {
    const { unmount } = render(<Table config={basic} onQuit={() => {}} onRematch={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Rules" }));
    expect(screen.getByRole("dialog", { name: "How to play" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Basic (your game)" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    unmount();

    render(<Table config={{ ...basic, advanced: true }} onQuit={() => {}} onRematch={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: "Rules" }));
    expect(screen.getByRole("columnheader", { name: "Advanced (your game)" })).toBeInTheDocument();
  });

  it("lets you change the bot pace from the table", async () => {
    render(<Table config={basic} onQuit={() => {}} onRematch={() => {}} />);
    const pace = screen.getByLabelText("Bot pace");
    expect(pace).toHaveValue("normal");
    await userEvent.selectOptions(pace, "slow");
    expect(pace).toHaveValue("slow");
  });

  it("rolls and shows the dice in one click, then lets you claim and hands the table to Bob", async () => {
    render(<Table config={basic} onQuit={() => {}} onRematch={() => {}} />);
    expect(screen.getAllByLabelText(/unseen/)).toHaveLength(5);
    await userEvent.click(screen.getByRole("button", { name: "Roll dice" }));
    expect(screen.queryAllByLabelText(/unseen/)).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: /^Smallest raise/ }));
    expect(await screen.findByText("Bob is thinking…")).toBeInTheDocument();
  });
});

describe("Setup table style", () => {
  afterEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it("switches the skin right away and remembers it", async () => {
    render(<Setup onStart={() => {}} />);
    expect(screen.getByLabelText(/Table style/)).toHaveValue("saloon");
    await userEvent.selectOptions(screen.getByLabelText(/Table style/), "casino");
    expect(document.documentElement.dataset.theme).toBe("casino");
    expect(localStorage.getItem("liars-dice:theme")).toBe("casino");
  });

  it("starts on the skin you picked last time", () => {
    localStorage.setItem("liars-dice:theme", "casino");
    render(<Setup onStart={() => {}} />);
    expect(screen.getByLabelText(/Table style/)).toHaveValue("casino");
  });
});

describe("Setup random level", () => {
  it("offers a random level that is explained and passed to the game", async () => {
    let started: Config | null = null;
    render(<Setup onStart={(config) => (started = config)} />);
    const level = screen.getByLabelText("Bot level");
    expect(within(level).getByRole("option", { name: "Random" })).toBeInTheDocument();
    await userEvent.selectOptions(level, "random");
    expect(level).toHaveAccessibleDescription(/Each bot gets its own level/);
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(started).toMatchObject({ level: "random" });
  });
});

describe("Setup player name", () => {
  // The chosen table style is remembered in storage, so each test starts from a clean slate.
  beforeEach(() => window.localStorage.clear());
  afterEach(() => {
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });
  const field = () => screen.getByLabelText("Your name") as HTMLInputElement;

  it("starts with a name from the table style's pool, not Alice", () => {
    render(<Setup onStart={() => {}} />);
    expect(PLAYER_NAMES.saloon).toContain(field().value);
    expect(field().value).not.toBe("Alice");
  });

  it("picks again from the new pool when the style changes, until the player types their own", async () => {
    render(<Setup onStart={() => {}} />);
    await userEvent.selectOptions(screen.getByLabelText(/Table style/), "casino");
    expect(PLAYER_NAMES.casino).toContain(field().value);
    await userEvent.selectOptions(screen.getByLabelText(/Table style/), "saloon");
    expect(PLAYER_NAMES.saloon).toContain(field().value);

    await userEvent.clear(field());
    await userEvent.type(field(), "Caleb");
    await userEvent.selectOptions(screen.getByLabelText(/Table style/), "casino");
    expect(field().value).toBe("Caleb");
  });

  it("gives a pool name, not a blank or Alice, when the field is left empty", async () => {
    let started: Config | null = null;
    render(<Setup onStart={(config) => (started = config)} />);
    await userEvent.clear(field());
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(PLAYER_NAMES.saloon).toContain((started as Config | null)!.name);
  });
});

describe("Setup characters", () => {
  const box = () => screen.getByRole("checkbox", { name: "Use Characters" });

  it("starts with characters on, and passes the choice and the table style to the game", async () => {
    let started: Config | null = null;
    render(<Setup onStart={(config) => (started = config)} />);
    expect(box()).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(started).toMatchObject({ personas: true, theme: "saloon" });
    await userEvent.click(box());
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(started).toMatchObject({ personas: false });
  });

  it("defaults the pace to slow with characters and to normal without, until the player picks one", async () => {
    render(<Setup onStart={() => {}} />);
    const pace = () => screen.getByLabelText("Bot pace");
    expect(pace()).toHaveValue("slow");
    await userEvent.click(box());
    expect(pace()).toHaveValue("normal");
    await userEvent.click(box());
    expect(pace()).toHaveValue("slow");
    await userEvent.selectOptions(pace(), "fast");
    await userEvent.click(box());
    expect(pace()).toHaveValue("fast");
  });

  it("explains what the box does", async () => {
    render(<Setup onStart={() => {}} />);
    expect(screen.getByText(/characters from this table/)).toBeInTheDocument();
    await userEvent.click(box());
    expect(screen.getByText(/plain bots at the level you pick/)).toBeInTheDocument();
  });

  it("lists only the number of opponents, since the characters are drawn at the start", () => {
    render(<Setup onStart={() => {}} />);
    const options = within(screen.getByLabelText("Bots")).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual(["1", "2", "3", "4", "5"]);
  });
});

describe("Setup layout", () => {
  it("pairs the short fields so the form stays compact on a phone", () => {
    render(<Setup onStart={() => {}} />);
    const rowOf = (label: RegExp) => screen.getByLabelText(label).closest(".field-row");
    expect(rowOf(/^Lives$/)).not.toBeNull();
    expect(rowOf(/^Lives$/)).toBe(rowOf(/^Bots$/));
    expect(rowOf(/^Lives$/)).toBe(rowOf(/^Use Characters$/)); // the checkbox sits in that row, after Bots
    expect(rowOf(/^Bot level$/)).not.toBeNull();
    expect(rowOf(/^Bot level$/)).toBe(rowOf(/^Bot pace$/));
    expect(rowOf(/^Lives$/)).not.toBe(rowOf(/^Bot level$/));
  });

  it("puts the name, lives, bots and characters in one group, which a wide screen lays out as a row", () => {
    render(<Setup onStart={() => {}} />);
    const groupOf = (label: RegExp) => screen.getByLabelText(label).closest(".who-row");
    expect(groupOf(/^Your name$/)).not.toBeNull();
    for (const label of [/^Lives$/, /^Bots$/, /^Use Characters$/]) expect(groupOf(label)).toBe(groupOf(/^Your name$/));
    expect(groupOf(/^Bot level$/)).toBeNull();
  });

  it("keeps the bot level description attached to its field", async () => {
    render(<Setup onStart={() => {}} />);
    const level = screen.getByLabelText("Bot level");
    expect(level).toHaveAccessibleDescription(/balanced opponent/);
    await userEvent.selectOptions(level, "stabby");
    expect(level).toHaveAccessibleDescription(/Patient/);
  });
});

describe("Setup rules link", () => {
  it("opens and closes the rules reference", async () => {
    render(<Setup onStart={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "How to play" }));
    expect(screen.getByRole("dialog", { name: "How to play" })).toBeInTheDocument();
    expect(screen.queryByText(/your game/)).toBeNull(); // no game yet, so neither mode is marked
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("Setup", () => {
  it("starts a game with the chosen options", async () => {
    let started: Config | null = null;
    render(<Setup onStart={(config) => (started = config)} />);
    await userEvent.clear(screen.getByLabelText("Your name"));
    await userEvent.type(screen.getByLabelText("Your name"), "Caleb");
    await userEvent.selectOptions(screen.getByLabelText("Lives"), "5");
    await userEvent.selectOptions(screen.getByLabelText("Bots"), "3");
    expect(screen.getByText(/A balanced opponent/)).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText(/Bot level/), "stabby");
    await userEvent.selectOptions(screen.getByLabelText("Bot pace"), "slow");
    expect(screen.getByText(/Patient\. Hides its strength/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: /Advanced/ }));
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(started).toEqual({
      name: "Caleb",
      lives: 5,
      advanced: true,
      opponents: 3,
      level: "stabby",
      pace: "slow",
      personas: true,
      theme: "saloon",
    });
  });
});

describe("Table with several humans", () => {
  const hotSeat: Config = { ...basic, otherHumans: ["Blake"], opponents: 1, seed: 3 };
  const kinds = renderHook(() => useSession(hotSeat)).result.current.seatKinds;
  const humanSeats = kinds.flatMap((k, i) => (k === "human" ? [i] : []));
  const names = renderHook(() => useSession(hotSeat)).result.current.game.names;
  const mount = (config: Config) => render(<Table config={config} onQuit={() => {}} onRematch={() => {}} />);

  it("lists everyone on the scoreboard, humans and bots", () => {
    mount({ ...hotSeat, opener: kinds.indexOf("bot") }); // a bot opens, so no handoff hides the scoreboard
    expect(screen.getAllByText(/^(Alice|Blake|Bob)$/).map((n) => n.textContent).sort()).toEqual(["Alice", "Blake", "Bob"]);
  });

  it("hides the whole table behind a handoff when a human's turn comes, and shows it to whoever taps", async () => {
    for (const seat of humanSeats) {
      const { unmount } = mount({ ...hotSeat, opener: seat });
      const who = names[seat]!;
      expect(screen.getByRole("heading", { name: `Pass the device to ${who}` })).toBeInTheDocument();
      // Nothing of the table is there to read, in the page or in the accessibility tree.
      expect(screen.queryAllByLabelText(/unseen/)).toHaveLength(0);
      expect(screen.queryByRole("button", { name: "Roll dice" })).toBeNull();
      expect(screen.queryByRole("region", { name: "Visible" })).toBeNull();
      expect(screen.queryByText(/Standing claim|Open with any claim/)).toBeNull();
      expect(screen.getByRole("button", { name: `I'm ${who}. Show the table` })).toHaveFocus();
      await userEvent.click(screen.getByRole("button", { name: `I'm ${who}. Show the table` }));
      expect(screen.queryByRole("heading", { name: /Pass the device/ })).toBeNull();
      expect(screen.getByRole("button", { name: "Roll dice" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: `${who}'s turn` })).toHaveFocus();
      unmount();
    }
  });

  it("lets everyone watch a bot play: no handoff on a bot's turn", () => {
    mount({ ...hotSeat, opener: kinds.indexOf("bot") });
    expect(screen.queryByRole("heading", { name: /Pass the device/ })).toBeNull();
    expect(screen.getByText(/is thinking/)).toBeInTheDocument();
  });

  it("hands over again when the turn reaches the other human after the bot has played", async () => {
    const first = humanSeats.find((h) => kinds[(h + 1) % kinds.length] === "bot")!;
    const other = names[humanSeats.find((h) => h !== first)!]!;
    mount({ ...hotSeat, opener: first, pace: "fast" });
    await userEvent.click(screen.getByRole("button", { name: /^I'm .*\. Show the table$/ }));
    await userEvent.click(screen.getByRole("button", { name: "Roll dice" }));
    await userEvent.click(screen.getByRole("button", { name: /^Smallest raise/ }));
    expect(screen.queryByRole("heading", { name: /Pass the device/ })).toBeNull(); // the bot plays in the open
    expect(
      await screen.findByRole("heading", { name: `Pass the device to ${other}` }, { timeout: 5000 }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Smallest raise/ })).toBeNull();
  }, 15_000); // the bot takes a few paused steps

  it("never interrupts a lone player", () => {
    mount({ ...basic });
    expect(screen.queryByRole("heading", { name: /Pass the device/ })).toBeNull();
    expect(screen.queryByRole("heading", { name: /'s turn/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Roll dice" })).toBeInTheDocument();
  });
});
