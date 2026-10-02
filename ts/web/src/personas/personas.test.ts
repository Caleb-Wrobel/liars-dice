import { ARCHETYPES, ARCHETYPE_IDS } from "@liars-dice/engine";
import { describe, expect, it } from "vitest";
import { THEMES } from "../theme.ts";
import { PERSONAS, initialsOf, personaFor } from "./index.ts";

describe("initialsOf", () => {
  it("takes the first letters of the first and last words", () => {
    expect(initialsOf("Calico Kate")).toBe("CK");
    expect(initialsOf("Straight-Up Sam")).toBe("SS");
    expect(initialsOf("Ice-Cold Ivy")).toBe("II");
  });

  it("copes with a single word, extra spaces and nothing at all", () => {
    expect(initialsOf("Plato")).toBe("P");
    expect(initialsOf("  Ada   Lovelace ")).toBe("AL");
    expect(initialsOf("")).toBe("");
  });
});

describe.each(THEMES.map((theme) => [theme.id] as const))("the %s personas", (themeId) => {
  const cast = PERSONAS[themeId];
  const personas = ARCHETYPE_IDS.map((id) => [id, cast[id]] as const);

  it("dress every archetype, and only archetypes", () => {
    expect(Object.keys(cast).sort()).toEqual([...ARCHETYPE_IDS].sort());
  });

  it("gives each one a name, a title and a bio short enough for a phone card", () => {
    for (const [id, persona] of personas) {
      expect(persona.name.length, id).toBeGreaterThan(0);
      expect(persona.title.startsWith("The "), id).toBe(true);
      expect(persona.bio.length, id).toBeGreaterThan(20);
      expect(persona.bio.length, id).toBeLessThanOrEqual(110);
    }
  });

  it("keeps names, titles and initials distinct, so a table can tell its players apart", () => {
    expect(new Set(personas.map(([, p]) => p.name)).size).toBe(personas.length);
    expect(new Set(personas.map(([, p]) => p.title)).size).toBe(personas.length);
    expect(new Set(personas.map(([, p]) => initialsOf(p.name))).size).toBe(personas.length);
  });

  it("carries nothing but a name, a title and a bio, so a skin can never change how a bot plays", () => {
    for (const [id, persona] of personas) expect(Object.keys(persona).sort(), id).toEqual(["bio", "name", "title"]);
  });
});

describe("personaFor", () => {
  it("looks a persona up by theme and archetype", () => {
    expect(personaFor("saloon", "bluffer").name).toBe("Calico Kate");
    expect(personaFor("casino", "bluffer").name).not.toBe("Calico Kate");
  });

  it("knows every archetype the engine has", () => {
    for (const { id } of ARCHETYPES) expect(personaFor("saloon", id)).toBeDefined();
  });
});
