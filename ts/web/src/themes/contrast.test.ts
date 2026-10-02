import { describe, expect, it } from "vitest";
import type { ThemeId } from "../theme.ts";
import casino from "./casino.css?raw";
import saloon from "./saloon.css?raw";
import spooky from "./spooky.css?raw";

/** Every registered theme must have a stylesheet here: adding one to THEMES breaks the build until it does. */
const STYLESHEETS: Record<ThemeId, string> = { saloon, casino, spooky };

/** All `--token: value;` declarations in a stylesheet. */
function tokens(css: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const [, name, value] of css.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    if (!found.has(name!)) found.set(name!, value!.trim());
  }
  return found;
}

type Matrix = readonly (readonly [number, number, number])[];

/**
 * How the three common kinds of colour-vision deficiency see colour. Each matrix acts on linear RGB
 * (Machado, Oliveira and Fernandes, 2009, full severity). Hue differences shrink or vanish under
 * these, so what is left to tell two things apart is mostly brightness.
 */
const VISION: Record<string, Matrix | null> = {
  "normal vision": null,
  protanopia: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deuteranopia: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritanopia: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const clamp = (x: number) => Math.min(1, Math.max(0, x));

/** Relative luminance of a #rrggbb colour, as seen under the given kind of vision. */
function luminance(hex: string, vision: Matrix | null): number {
  const linear = [0, 1, 2].map((i) => toLinear(parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255));
  const seen = vision ? vision.map((row) => clamp(row[0] * linear[0]! + row[1] * linear[1]! + row[2] * linear[2]!)) : linear;
  return 0.2126 * seen[0]! + 0.7152 * seen[1]! + 0.0722 * seen[2]!;
}

function contrast(a: string, b: string, vision: Matrix | null): number {
  const [hi, lo] = [luminance(a, vision), luminance(b, vision)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

/** [foreground, background, minimum ratio]: text, which needs 4.5 (WCAG AA). */
const TEXT: readonly (readonly [string, string, number])[] = [
  ["text", "page", 4.5],
  ["text", "surface", 4.5],
  ["control-ink", "control-bg", 4.5],
  ["muted", "page", 4.5],
  ["muted", "surface", 4.5],
  ["accent", "page", 4.5],
  ["accent-ink", "accent", 4.5],
  ["claim-ink", "claim-bg", 4.5],
  ["claim-muted", "claim-bg", 4.5],
  ["tray-title", "tray-a", 4.5],
  ["tray-title", "tray-b", 4.5],
  ["log-ink", "log-bg", 4.5],
  ["danger", "surface", 4.5],
  ["danger", "page", 4.5],
  ["ok", "surface", 4.5],
  ["die-pip", "die-body", 4.5],
  ["unseen-mark", "unseen-body", 4.5],
];

/**
 * Things that must stand out as shapes, needing 3. A die is seen against its background if either its
 * body or its rim contrasts with it, so a rim can carry a die whose body is close in brightness.
 */
const SHAPES: readonly (readonly [string, readonly string[], string, number])[] = [
  ["a die on the table top", ["die-body", "die-edge"], "tray-a", 3],
  ["a die in the cup", ["die-body", "die-edge"], "tray-b", 3],
  ["a die on a claim strip", ["die-body", "die-edge"], "claim-dice-bg", 3],
  ["an unseen die on the table top", ["unseen-body", "unseen-edge"], "tray-a", 3],
  ["an unseen die in the cup", ["unseen-body", "unseen-edge"], "tray-b", 3],
  ["the kicker outline on a claim strip", ["kicker"], "claim-dice-bg", 3],
];

describe.each(Object.entries(STYLESHEETS))("the %s theme", (_name, css) => {
  const own = tokens(css);
  const solid = (name: string) => {
    const value = own.get(name);
    expect(value, `--${name} must be a solid hex colour`).toMatch(/^#[0-9a-f]{6}$/i);
    return value!;
  };

  it("defines every token the reference theme does", () => {
    const required = [...tokens(saloon).keys()].filter((name) => name !== "display-weight");
    expect(required.filter((name) => !own.has(name))).toEqual([]);
  });

  describe.each(Object.entries(VISION))("as seen with %s", (_vision, matrix) => {
    it.each(TEXT)("%s on %s has contrast of at least %s", (foreground, background, minimum) => {
      expect(contrast(solid(foreground), solid(background), matrix)).toBeGreaterThanOrEqual(minimum);
    });

    it.each(SHAPES)("%s stands out", (_what, foregrounds, background, minimum) => {
      const best = Math.max(...foregrounds.map((fg) => contrast(solid(fg), solid(background), matrix)));
      expect(best).toBeGreaterThanOrEqual(minimum);
    });
  });
});
