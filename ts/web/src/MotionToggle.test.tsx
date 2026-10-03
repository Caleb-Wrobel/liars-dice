import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.tsx";
import { MotionToggle } from "./MotionToggle.tsx";
import { MOTION_STORAGE_KEY, THEMES } from "./theme.ts";

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.motion;
  vi.unstubAllGlobals();
});

const toggle = () => screen.queryByRole("checkbox", { name: "Still scenery" });

describe("the Still scenery control", () => {
  it("is offered only for a table whose scenery moves", () => {
    for (const { id } of THEMES) {
      const { unmount } = render(<MotionToggle theme={id} />);
      expect(toggle() !== null, id).toBe(id === "spooky");
      unmount();
    }
  });

  it("is a real checkbox that starts unticked, so a screen reader announces its name and state", () => {
    render(<MotionToggle theme="spooky" />);
    expect(toggle()).toBeInTheDocument();
    expect(toggle()).not.toBeChecked();
  });

  it("stops the movement when ticked and starts it again when unticked, and remembers the choice", async () => {
    render(<MotionToggle theme="spooky" />);
    await userEvent.click(toggle()!);
    expect(toggle()).toBeChecked();
    expect(document.documentElement.dataset.motion).toBe("still"); // what the stylesheet looks for
    expect(localStorage.getItem(MOTION_STORAGE_KEY)).toBe("1");
    await userEvent.click(toggle()!);
    expect(document.documentElement.dataset.motion).toBeUndefined();
    expect(localStorage.getItem(MOTION_STORAGE_KEY)).toBe("0");
  });

  it("comes back ticked when the visitor chose still scenery before", () => {
    localStorage.setItem(MOTION_STORAGE_KEY, "1");
    render(<MotionToggle theme="spooky" />);
    expect(toggle()).toBeChecked();
  });

  it("can be reached and switched with the keyboard alone", async () => {
    render(<MotionToggle theme="spooky" />);
    await userEvent.tab();
    expect(toggle()).toHaveFocus();
    await userEvent.keyboard(" ");
    expect(toggle()).toBeChecked();
    expect(document.documentElement.dataset.motion).toBe("still");
  });

  it("is not offered to someone whose system already asks for reduced motion, who is given still scenery anyway", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("reduce"), media: query }));
    render(<MotionToggle theme="spooky" />);
    expect(toggle()).toBeNull();
  });

  it("carries on working when the browser blocks storage", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    render(<MotionToggle theme="spooky" />);
    await userEvent.click(toggle()!);
    expect(toggle()).toBeChecked(); // it still stills this visit, it just is not remembered
    expect(document.documentElement.dataset.motion).toBe("still");
    vi.restoreAllMocks();
  });
});

describe("where the control appears", () => {
  it("shows on the setup page once the Table style is Spooky, and not for the other tables", async () => {
    render(<App />);
    expect(toggle()).toBeNull(); // Saloon, with no movement
    await userEvent.selectOptions(screen.getByLabelText("Table style"), "spooky");
    expect(toggle()).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Table style"), "casino");
    expect(toggle()).toBeNull();
  });

  it("also shows in the game's top row, with the other small controls, and keeps its state from the setup page", async () => {
    render(<App />);
    await userEvent.selectOptions(screen.getByLabelText("Table style"), "spooky");
    await userEvent.click(toggle()!);
    await userEvent.click(screen.getByRole("button", { name: "Play" }));
    const controls = document.querySelector(".table-controls") as HTMLElement;
    const inGame = within(controls).getByRole("checkbox", { name: "Still scenery" });
    expect(inGame).toBeChecked();
    await userEvent.click(inGame);
    expect(document.documentElement.dataset.motion).toBeUndefined();
  });
});
