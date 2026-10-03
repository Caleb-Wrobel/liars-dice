import { describe, expect, it } from "vitest";
import html from "../../index.html?raw";
import styles from "../styles.css?raw";
import saloon from "./saloon.css?raw";
import spooky from "./spooky.css?raw";

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

describe("the Spooky decorations", () => {
  // The corner pictures are decoration only. They must never catch a click or sit in front of the table.
  const rule = (selector: string) => {
    const match = spooky.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*{([^}]*)}`));
    expect(match, `expected a rule for ${selector}`).not.toBeNull();
    return match![1]!;
  };

  it.each([':root[data-theme="spooky"] body::before', ':root[data-theme="spooky"] body::after'])(
    "keeps %s behind the page, inert and out of the way of clicks",
    (selector) => {
      const body = rule(selector);
      expect(body).toMatch(/pointer-events:\s*none/);
      expect(body).toMatch(/z-index:\s*-1/);
      expect(body).toMatch(/position:\s*fixed/);
      expect(body).toMatch(/content:\s*""/); // no text, so nothing for a screen reader to read
    },
  );

  it("drops the skull on a narrow screen, so text stays clear", () => {
    expect(spooky).toMatch(/@media \(max-width: \d+px\) \{[^}]*body::after \{ display: none; \}/);
  });
});

describe("the Saloon decorations", () => {
  const rule = (selector: string) => {
    const match = saloon.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*{([^}]*)}`));
    expect(match, `expected a rule for ${selector}`).not.toBeNull();
    return match![1]!;
  };

  it("keeps the scenery behind the page, inert and without text", () => {
    const body = rule(':root[data-theme="saloon"] body::before');
    expect(body).toMatch(/pointer-events:\s*none/);
    expect(body).toMatch(/z-index:\s*-1/);
    expect(body).toMatch(/position:\s*fixed/);
    expect(body).toMatch(/content:\s*""/);
  });

  it("drops the scenery on a narrow screen, so text stays clear", () => {
    expect(saloon).toMatch(/@media \(max-width: \d+px\) \{[^}]*body::before \{ display: none; \}/);
  });

  it("keeps the chains inert and empty, so the sign is read as the heading it is", () => {
    const chains = rule(':root[data-theme="saloon"] .setup h1::before,\n:root[data-theme="saloon"] .setup h1::after');
    expect(chains).toMatch(/content:\s*""/);
    expect(chains).toMatch(/pointer-events:\s*none/);
  });

  it("can be read: the sign lettering on its plank, and the page text on the table strip", () => {
    const ratio = (a: string, b: string) => {
      const lum = (hex: string) => {
        const lin = [1, 3, 5].map((i) => {
          const c = parseInt(hex.slice(i, i + 2), 16) / 255;
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
      };
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi! + 0.05) / (lo! + 0.05);
    };
    const sign = rule(':root[data-theme="saloon"] .setup h1');
    const lettering = sign.match(/color:\s*(#[0-9a-f]{6})/i)![1]!;
    const plank = [...sign.matchAll(/linear-gradient\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/gi)][0]!.slice(1);
    for (const colour of plank) expect(ratio(lettering, colour)).toBeGreaterThanOrEqual(4.5);
    const strip = saloon.match(/#7a5530 72% 73\.5%, (#[0-9a-f]{6}) 73\.5%/)![1]!;
    expect(ratio("#f3e6c8", strip)).toBeGreaterThanOrEqual(4.5); // --text
    expect(ratio("#c7b08a", strip)).toBeGreaterThanOrEqual(4.5); // --muted
  });
});
