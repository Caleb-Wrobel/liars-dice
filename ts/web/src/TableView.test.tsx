import { Category, Step, basicRules, type SeatView } from "@liars-dice/engine";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { Session } from "./session.ts";
import { TableView } from "./Table.tsx";

/**
 * The table, driven by a hand-made Session with no game or engine behind it. This is what a session that talks to a
 * server will look like to the table, so these tests show the table needs nothing but a view and some actions.
 */
const baseView = (over: Partial<SeatView> = {}): SeatView => ({
  you: 0,
  names: ["Ann", "Bo", "Cy"],
  lives: [3, 2, 3],
  current: 0,
  step: Step.Decide,
  claim: { category: Category.Pair, faces: [4], kicker: 0 },
  claimer: 2,
  rules: basicRules(),
  dice: [null, null, null, null, null],
  visible: [],
  available: ["pull", "peer"],
  winner: null,
  ...over,
});

function fakeSession(view: SeatView, over: Partial<Session> = {}) {
  const session = {
    view,
    seatKinds: ["human", "bot", "bot"],
    isHuman: (seat: number) => seat === 0,
    humanCount: 1,
    viewer: 0,
    handoff: null,
    acceptHandoff: vi.fn(),
    log: ["Ann opens the game"],
    pulled: null,
    error: null,
    visibleSet: new Set(view.visible),
    botSeat: null,
    botTurn: false,
    levelReveal: undefined,
    pace: "normal",
    setPace: vi.fn(),
    setPaused: vi.fn(),
    nextBotStep: vi.fn(),
    pullCup: vi.fn(),
    peer: vi.fn(),
    roll: vi.fn(),
    peek: vi.fn(),
    claim: vi.fn(),
    moveDie: vi.fn(),
    dismissPull: vi.fn(),
    ...over,
  } satisfies Session;
  return session as Session & typeof session;
}

const show = (session: Session) =>
  render(<TableView session={session} theme="saloon" onQuit={() => {}} onRematch={() => {}} />);

describe("TableView over a Session", () => {
  it("never holds a game: the Session has no way to reach one", () => {
    expectTypeOf<Session>().not.toHaveProperty("game");
    expectTypeOf<Session>().toHaveProperty("view");
  });

  it("draws the scoreboard, lives and standing claim from the view", () => {
    show(fakeSession(baseView()));
    for (const name of ["Ann", "Bo", "Cy"]) expect(screen.getByText(name)).toBeInTheDocument();
    expect(screen.getByLabelText("2 lives")).toBeInTheDocument();
    expect(screen.getAllByLabelText("3 lives")).toHaveLength(2);
    expect(screen.getByText("by Cy")).toBeInTheDocument();
    expect(screen.getByText("Ann opens the game")).toBeInTheDocument();
  });

  it("offers the actions the view says are open, and sends them through the session", async () => {
    const session = fakeSession(baseView());
    show(session);
    await userEvent.click(screen.getByRole("button", { name: "Pull the cup" }));
    await userEvent.click(screen.getByRole("button", { name: "Peer at the hidden dice" }));
    expect(session.pullCup).toHaveBeenCalledTimes(1);
    expect(session.peer).toHaveBeenCalledTimes(1);
  });

  it("says you must pull, with no Peer button, when the view does not offer a peer", () => {
    show(fakeSession(baseView({ available: ["pull"] })));
    expect(screen.getByText("Nothing outranks that claim, so you must pull.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Peer at the hidden dice" })).toBeNull();
  });

  it("shows exactly the faces the view gives and leaves every null face unseen", () => {
    const view = baseView({
      step: Step.Claim,
      dice: [null, 3, null, 5, null],
      visible: [1, 3],
      available: ["claim"],
    });
    show(fakeSession(view));
    expect(screen.getAllByLabelText(/unseen/)).toHaveLength(3);
    const visible = screen.getByRole("region", { name: "Visible" });
    expect(within(visible).getAllByRole("button")).toHaveLength(2);
  });

  it("gives another seat's turn no controls, and says so when it is a bot's", () => {
    show(
      fakeSession(baseView({ current: 1, available: [] }), {
        botSeat: 1,
        botTurn: true,
        viewer: 0,
      }),
    );
    expect(screen.queryByRole("button", { name: "Pull the cup" })).toBeNull();
    expect(screen.getByText(/Bo is thinking/)).toBeInTheDocument();
  });

  it("covers the table with the handoff screen when the session asks for one", async () => {
    const session = fakeSession(baseView({ current: 1, available: ["roll"], step: Step.Roll }), {
      handoff: 1,
      humanCount: 2,
      isHuman: (seat: number) => seat < 2,
      seatKinds: ["human", "human", "bot"],
    });
    show(session);
    expect(screen.getByRole("heading", { name: "Pass the device to Bo" })).toBeInTheDocument();
    expect(screen.queryByText("by Cy")).toBeNull(); // nothing of the table is in the page
    await userEvent.click(screen.getByRole("button", { name: "I'm Bo. Show the table" }));
    expect(session.acceptHandoff).toHaveBeenCalledTimes(1);
  });

  it("hands the level reveal and the next steps to the end-of-game dialog", async () => {
    const pulled = {
      puller: 0,
      claimer: 2,
      claim: baseView().claim,
      dice: [1, 2, 3, 4, 5],
      revealed: { category: Category.NoPair, faces: [], kicker: 5 },
      claimTrue: false,
      loser: 2,
      eliminated: true,
    };
    const session = fakeSession(baseView({ winner: 0, lives: [3, 2, 0], available: [] }), {
      pulled,
      levelReveal: [
        { name: "Bo", level: "easy" },
        { name: "Cy", level: "stabby" },
      ],
    });
    show(session);
    expect(screen.getByText("The bots were: Bo was Easy, Cy was Stabby.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Play again/ }));
  });
});
