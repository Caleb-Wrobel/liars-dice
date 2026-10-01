import { describe, expect, it } from "vitest";
import html from "../../index.html?raw";
import styles from "../styles.css?raw";

describe("the layout stylesheet", () => {
  it("gives controls their own text colour instead of inheriting one", () => {
    // Inside the saloon's parchment claim card the inherited ink is dark brown, and a dark leather
    // button turned its label invisible. Every control must name its text colour.
    const rule = styles.match(/button,\s*select,\s*input\s*{([^}]*)}/);
    expect(rule, "expected a shared rule for button, select and input").not.toBeNull();
    expect(rule![1]).toMatch(/color:\s*var\(--control-ink\)/);
    expect(rule![1]).not.toMatch(/color:\s*inherit/);
  });

  it("pads the page by the gap Safari's toolbar can cover, so the last control stays reachable", () => {
    expect(styles).toMatch(/padding-bottom:\s*calc\(16px \+ \(100lvh - 100svh\)\)/);
  });

  it("keeps the big headroom above the setup title for wide screens only", () => {
    expect(styles).toMatch(/\.setup \{ padding-top: 16px; \}/);
    expect(styles).toMatch(/@media \(min-width: 640px\) \{ \.setup \{ padding-top: 48px; \} \}/);
  });
});

describe("index.html", () => {
  it("does not run the page under system bars", () => {
    // viewport-fit=cover lets content sit under the notch and the browser's bottom bar, and nothing
    // here is designed for that, so a button could end up hidden.
    expect(html).toMatch(/<meta name="viewport"/);
    expect(html).not.toMatch(/viewport-fit\s*=\s*cover/);
  });
});
