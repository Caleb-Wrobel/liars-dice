import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import licence from "../../../LICENSE?raw"; // at the repository root, which vite.config.ts allows
import { COPYRIGHT, FEEDBACK_URL, LICENSE_URL, NOTICES_URL, REPO_URL } from "./links.ts";
import { Setup } from "./Setup.tsx";

const setup = () => render(<Setup onStart={() => {}} />);

describe("the links under the title", () => {
  it("groups How to play, Feedback and Source on GitHub in a navigation landmark, in that order", () => {
    setup();
    const nav = screen.getByRole("navigation", { name: "Help and links" });
    const items = [...nav.querySelectorAll("a, button")].map((el) => el.textContent?.replace(/\s*\(opens in a new tab\)/, ""));
    expect(items).toEqual(["How to play", "Feedback", "Source on GitHub"]);
  });

  it("points Feedback and Source at the public GitHub copy", () => {
    setup();
    const nav = within(screen.getByRole("navigation", { name: "Help and links" }));
    expect(nav.getByRole("link", { name: /^Feedback/ })).toHaveAttribute("href", FEEDBACK_URL);
    expect(nav.getByRole("link", { name: /^Source on GitHub/ })).toHaveAttribute("href", REPO_URL);
    expect(FEEDBACK_URL.startsWith(`${REPO_URL}/`)).toBe(true);
  });

  it("opens other sites in a new tab, safely, and says so to a screen reader", () => {
    setup();
    for (const name of [/^Feedback/, /^Source on GitHub/, /^MIT licence/, /^Third-party notices/]) {
      const link = screen.getByRole("link", { name });
      expect(link).toHaveAttribute("target", "_blank");
      expect(link.getAttribute("rel")).toMatch(/noopener/);
      expect(link.getAttribute("rel")).toMatch(/noreferrer/);
      expect(link, String(name)).toHaveAccessibleName(/\(opens in a new tab\)/);
    }
  });

  it("only links to the public GitHub copy, and names nothing internal", () => {
    for (const url of [REPO_URL, FEEDBACK_URL, LICENSE_URL, NOTICES_URL]) {
      expect(url, url).toMatch(/^https:\/\/github\.com\/Caleb-Wrobel\/liars-dice/);
      expect(url, url).not.toMatch(/internal|localhost|192\.168/);
    }
  });

  it("still opens the How to play page from the same stack", async () => {
    setup();
    await userEvent.click(screen.getByRole("button", { name: "How to play" }));
    expect(screen.getByRole("dialog", { name: "How to play" })).toBeInTheDocument();
  });
});

describe("the copyright and licence line", () => {
  it("is a footer with the copyright line and a link to the licence", () => {
    setup();
    const footer = document.querySelector("footer.setup-footer") as HTMLElement;
    expect(footer).not.toBeNull();
    expect(footer.textContent).toContain(COPYRIGHT);
    expect(within(footer).getByRole("link", { name: /^MIT licence/ })).toHaveAttribute("href", LICENSE_URL);
  });

  it("also links to the third-party notices, after the licence", () => {
    setup();
    const footer = within(document.querySelector("footer.setup-footer") as HTMLElement);
    const links = footer.getAllByRole("link");
    expect(links.map((link) => link.textContent?.replace(/\s*\(opens in a new tab\)/, ""))).toEqual(["MIT licence", "Third-party notices"]);
    expect(links[1]).toHaveAttribute("href", NOTICES_URL);
    expect(NOTICES_URL.endsWith("/THIRD-PARTY-NOTICES.md")).toBe(true);
  });

  it("matches the LICENSE file: the same holder and year, and it really is the MIT licence", () => {
    expect(licence).toMatch(/^MIT License/);
    expect(licence).toContain(COPYRIGHT.replace("©", "Copyright (c)"));
  });

  it("comes after the form, so the footer never sits between a person and Play", () => {
    setup();
    const form = document.querySelector("form")!;
    const footer = document.querySelector("footer.setup-footer")!;
    expect(Boolean(form.compareDocumentPosition(footer) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
  });
});
