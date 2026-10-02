import { ARCHETYPES, weightsOf } from "@liars-dice/engine";
import { describe, expect, it } from "vitest";
import { THEMES } from "../theme.ts";
import { PERSONAS } from "./index.ts";
import { readmeFor } from "./readme.ts";

describe.each(THEMES.map((t) => [t.id] as const))("the %s table README", (themeId) => {
  // A stale file fails here. `npm test -- -u` rewrites it from the data.
  it("is up to date with the characters and their weights", async () => {
    await expect(readmeFor(themeId)).toMatchFileSnapshot(`../../../../docs/tables/${themeId}.md`);
  });

  it("names every character, archetype and score", () => {
    const text = readmeFor(themeId);
    for (const archetype of ARCHETYPES) {
      const persona = PERSONAS[themeId][archetype.id];
      const w = weightsOf(archetype);
      const row = text.split("\n").find((line) => line.startsWith(`| ${persona.name} |`));
      expect(row, persona.name).toBeDefined();
      expect(row).toContain(`| ${archetype.name} | ${w.bluffing} / 5 | ${w.withholding} / 5 | ${w.recklessness} / 5 |`);
      expect(text).toContain(archetype.brief);
      expect(text).toContain(persona.bio);
    }
  });

  it("is safe for a public repo", () => {
    expect(readmeFor(themeId)).not.toMatch(/\.internal|\/home\/|\/srv\/|localhost/);
  });
});
