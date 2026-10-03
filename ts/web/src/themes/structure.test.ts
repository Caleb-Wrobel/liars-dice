import { describe, expect, it } from "vitest";
import html from "../../index.html?raw";
import { SEASONS } from "../theme.ts";
import styles from "../styles.css?raw";
import casino from "./casino.css?raw";
import saloon from "./saloon.css?raw";
import spooky from "./spooky.css?raw";
import perch from "./spooky/sign-perch.svg?raw";
import resting from "./spooky/sign-resting.svg?raw";
import cat from "./spooky/cat.svg?raw";
import grass from "./spooky/grass.svg?raw";
import grave from "./spooky/grave.svg?raw";
import sceneLeft from "./spooky/scene-left.svg?raw";
import sceneRight from "./spooky/scene-right.svg?raw";

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

describe("index.html's seasonal default", () => {
  it("carries the same seasons as SEASONS, so the first paint and the app agree", () => {
    const literal = html.match(/var seasons = (\{[^}]*\});/);
    expect(literal, "expected a seasons table in index.html").not.toBeNull();
    const inPage = JSON.parse(literal![1]!) as Record<string, string>;
    const inApp: Record<string, string> = {};
    for (const { theme, months } of SEASONS) for (const month of months) inApp[String(month)] = theme;
    expect(inPage).toEqual(inApp);
  });

  it("falls back to Saloon, and lets a saved choice win over the season", () => {
    expect(html).toMatch(/seasons\[new Date\(\)\.getMonth\(\) \+ 1\] \|\| "saloon"/);
    expect(html).toMatch(/theme = localStorage\.getItem\("liars-dice:theme"\) \|\| theme;/);
  });
});

describe("the setup row", () => {
  it("leaves the phone layout alone, and only lays the name and short fields in a row on a wide screen", () => {
    expect(styles).toMatch(/\.who-row \{ display: contents; \}/); // the wrapper vanishes on a phone
    const wide = styles.match(/@media \(min-width: 640px\) \{\s*\.who-row \{([^}]*)\}/);
    expect(wide, "expected a wide-screen rule for .who-row").not.toBeNull();
    expect(wide![1]).toMatch(/display:\s*flex/);
    expect(wide![1]).toMatch(/flex-wrap:\s*wrap/); // it wraps back to the phone layout when tight
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
  // The pictures are decoration only. They must never catch a click or put text where a screen reader would find it.
  const rule = (selector: string) => {
    const match = spooky.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*{([^}]*)}`));
    expect(match, `expected a rule for ${selector}`).not.toBeNull();
    return match![1]!;
  };

  it("keeps the corner web behind the page, inert and out of the way of clicks", () => {
    const web = rule(':root[data-theme="spooky"] body::before');
    expect(web).toMatch(/pointer-events:\s*none/);
    expect(web).toMatch(/z-index:\s*-1/);
    expect(web).toMatch(/position:\s*fixed/);
    expect(web).toMatch(/content:\s*""/); // no text, so nothing for a screen reader to read
  });

  it("keeps the graveyard scenery inert, text-free, in the page flow and behind the form", () => {
    const scene = rule(':root[data-theme="spooky"] body::after');
    expect(scene).toMatch(/pointer-events:\s*none/);
    expect(scene).toMatch(/content:\s*""/);
    expect(scene).not.toMatch(/position:\s*(fixed|absolute)/); // in the flow, so it can never cover the form
    expect(scene).toMatch(/flex:\s*1 0 240px/); // it takes the height the content leaves, and never less than its own
    expect(scene).toMatch(/z-index:\s*-1/); // behind the form, so the cauldron's vapour rises from behind the Play bar
    expect(spooky).toMatch(/@media \(min-width: 900px\) \{\s*:root\[data-theme="spooky"\] body \{ display: flex; flex-direction: column; \}\s*\}/);
  });

  it("places the dug grave right of centre and the cat lower and left of it, off-balance on purpose", () => {
    const scene = rule(':root[data-theme="spooky"] body::after');
    const at = (file: string) => Number(scene.match(new RegExp(`${file}"\\) (\\d+)% top`))?.[1]);
    expect(at("grave.svg")).toBeGreaterThan(50); // right of centre
    expect(at("cat.svg")).toBeLessThan(50); // left of centre, between the grave and the candle
    expect(at("cat.svg")).toBeLessThan(at("grave.svg"));
  });

  it("pulls the scenery up on the setup page only, so the table screen keeps clear of it", () => {
    expect(rule(':root[data-theme="spooky"] body:has(.setup)::after')).toMatch(/margin-top:\s*-\d+px/);
  });

  it("drops the scenery on a narrow screen, so text stays clear", () => {
    expect(spooky).toMatch(/@media \(max-width: \d+px\) \{[^}]*body::after \{ display: none; \}/);
  });

  it.each([
    ["left", sceneLeft],
    ["right", sceneRight],
    ["grass", grass],
    ["grave", grave],
    ["cat", cat],
  ])("keeps the %s picture free of letters", (_name, picture) => {
    expect(picture).not.toMatch(/<text[\s>]/);
  });
});

/** WCAG contrast ratio of two #rrggbb colours. */
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

describe("the Saloon decorations", () => {
  const rule = (selector: string) => {
    const match = saloon.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*{([^}]*)}`));
    expect(match, `expected a rule for ${selector}`).not.toBeNull();
    return match![1]!;
  };

  it("keeps the scenery inert and without text, in the flow after the page so it can never cover the form", () => {
    const body = rule(':root[data-theme="saloon"] body::before');
    expect(body).toMatch(/pointer-events:\s*none/);
    expect(body).toMatch(/content:\s*""/);
    expect(body).toMatch(/order:\s*2/);
    expect(body).not.toMatch(/position:\s*(fixed|absolute)/);
    // The page grows to fill the screen, so the scenery rests at the foot of a short page and follows a long one.
    expect(saloon).toMatch(/@media \(min-width: 900px\) \{\s*:root\[data-theme="saloon"\] body \{ display: flex; flex-direction: column; \}\s*\}/);
    expect(body).toMatch(/flex:\s*1 0 240px/); // it takes the height the content leaves, and never less than its own
    // Only the setup page, which has a footer line, pulls it up beside the Play bar; the table screen keeps clear of it.
    expect(rule(':root[data-theme="saloon"] body:has(.setup)::before')).toMatch(/margin-top:\s*-\d+px/);
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
    const sign = rule(':root[data-theme="saloon"] .setup h1');
    const lettering = sign.match(/color:\s*(#[0-9a-f]{6})/i)![1]!;
    const plank = [...sign.matchAll(/linear-gradient\((#[0-9a-f]{6}),\s*(#[0-9a-f]{6})\)/gi)][0]!.slice(1);
    for (const colour of plank) expect(ratio(lettering, colour)).toBeGreaterThanOrEqual(4.5);
    const strip = saloon.match(/#7a5530 173px 176px, (#[0-9a-f]{6}) 176px/)![1]!;
    expect(ratio("#f3e6c8", strip)).toBeGreaterThanOrEqual(4.5); // --text
    expect(ratio("#c7b08a", strip)).toBeGreaterThanOrEqual(4.5); // --muted
  });
});

describe("the Casino font", () => {
  it("uses Limelight for headings, with a serif fallback while it loads, and the system face for text", () => {
    expect(casino).toMatch(/--font-display:\s*"Limelight",[^;]*\bserif;/);
    expect(casino).toMatch(/--font-body:\s*system-ui[^;]*sans-serif;/);
    expect(casino).toMatch(/--display-weight:\s*400;/); // Limelight has one weight, so none is faked
  });

  it("keeps the standing claim in the plain body face, so it reads at a glance", () => {
    expect(casino).toMatch(/\.claim-text \{[^}]*font-family:\s*var\(--font-body\)/);
  });
});

describe("the Casino decorations", () => {
  const rule = (selector: string) => {
    const match = casino.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*{([^}]*)}`));
    expect(match, `expected a rule for ${selector}`).not.toBeNull();
    return match![1]!;
  };

  it("keeps the scenery inert and without text, in the flow after the page so it can never cover the form", () => {
    const body = rule(':root[data-theme="casino"] body::before');
    expect(body).toMatch(/pointer-events:\s*none/);
    expect(body).toMatch(/content:\s*""/);
    expect(body).toMatch(/order:\s*2/);
    expect(body).not.toMatch(/position:\s*(fixed|absolute)/);
    // The page grows to fill the screen, so the scenery rests at the foot of a short page and follows a long one.
    expect(casino).toMatch(/@media \(min-width: 900px\) \{\s*:root\[data-theme="casino"\] body \{ display: flex; flex-direction: column; \}\s*\}/);
    expect(body).toMatch(/flex:\s*1 0 240px/); // it takes the height the content leaves, and never less than its own
    // Only the setup page, which has a footer line, pulls it up beside the Play bar; the table screen keeps clear of it.
    expect(rule(':root[data-theme="casino"] body:has(.setup)::before')).toMatch(/margin-top:\s*-\d+px/);
  });

  it("always shows the wheel, and varies only the left side with data-scene", () => {
    const base = rule(':root[data-theme="casino"] body::before');
    const poker = rule(':root[data-theme="casino"][data-scene="poker"] body::before');
    for (const layers of [base, poker]) expect(layers).toContain("roulette-right.svg");
    expect(base).toContain("roulette-left.svg");
    expect(poker).toContain("poker-left.svg");
  });

  it("drops the scenery on a narrow screen, so text stays clear", () => {
    expect(casino).toMatch(/@media \(max-width: \d+px\) \{[^}]*body::before \{ display: none; \}/);
  });

  it("keeps the starburst empty and inert, so the sign is read as the heading it is", () => {
    const burst = rule(':root[data-theme="casino"] .setup h1::before');
    expect(burst).toMatch(/content:\s*""/);
    expect(burst).toMatch(/pointer-events:\s*none/);
  });

  it("can be read: the sign lettering on its face, and the page text on the felt and the rail", () => {
    const sign = rule(':root[data-theme="casino"] .setup h1');
    expect(ratio(sign.match(/color:\s*(#[0-9a-f]{6})/i)![1]!, "#fbf6e6")).toBeGreaterThanOrEqual(4.5); // the sign's face, in sign.svg
    const strip = casino.match(/#8a6a2a 173px 174px, (#[0-9a-f]{6}) 174px 180px, (#[0-9a-f]{6}) 180px/)!;
    for (const surface of [strip[1]!, strip[2]!]) {
      expect(ratio("#f1f4ec", surface)).toBeGreaterThanOrEqual(4.5); // --text
      expect(ratio("#a7bbaf", surface)).toBeGreaterThanOrEqual(4.5); // --muted
    }
  });
});

describe("the Spooky title tombstones", () => {
  const rule = (selector: string) => {
    const match = spooky.match(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*{([^}]*)}`));
    expect(match, `expected a rule for ${selector}`).not.toBeNull();
    return match![1]!;
  };

  it("wears one of two pictures, the second chosen by data-sign", () => {
    expect(rule(':root[data-theme="spooky"] .setup h1')).toContain("sign-resting.svg");
    expect(rule(':root[data-theme="spooky"][data-sign="perch"] .setup h1')).toContain("sign-perch.svg");
  });

  it.each([
    ["resting", resting],
    ["perch", perch],
  ])("keeps the %s picture free of letters, so the heading is the only text", (_name, picture) => {
    expect(picture).not.toMatch(/<text[\s>]/);
  });

  it.each([
    ["resting", resting],
    ["perch", perch],
  ])("reads on the %s stone: the lettering is large, so 3 on its lightest stop and 4.5 at the middle", (_name, picture) => {
    const lettering = rule(':root[data-theme="spooky"] .setup h1').match(/color:\s*(#[0-9a-f]{6})/i)![1]!;
    const stops = [...picture.match(/<linearGradient id="stone"[\s\S]*?<\/linearGradient>/)![0]!.matchAll(/stop-color="(#[0-9a-f]{6})"/g)].map((m) => m[1]!);
    expect(stops).toHaveLength(2);
    const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    const middle = "#" + [0, 1, 2].map((i) => Math.round((channel(stops[0]!, i) + channel(stops[1]!, i)) / 2).toString(16).padStart(2, "0")).join("");
    expect(ratio(lettering, stops[0]!)).toBeGreaterThanOrEqual(3);
    expect(ratio(lettering, middle)).toBeGreaterThanOrEqual(4.5);
  });
});
