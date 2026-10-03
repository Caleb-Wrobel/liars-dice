import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME,
  SCENE_STORAGE_KEY,
  SCENES,
  THEME_STORAGE_KEY,
  THEMES,
  applyScene,
  applyTheme,
  isThemeId,
  loadTheme,
  pickScene,
  saveTheme,
} from "./theme.ts";

const store = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
};

describe("themes", () => {
  it("registers saloon first, as the default", () => {
    expect(DEFAULT_THEME).toBe("saloon");
    expect(THEMES.map((t) => t.id)).toEqual(["saloon", "casino", "spooky"]);
  });

  it("recognises only registered ids", () => {
    expect(isThemeId("casino")).toBe(true);
    expect(isThemeId("pirate")).toBe(false);
    expect(isThemeId(null)).toBe(false);
  });

  it("loads the saved theme, falling back to the default", () => {
    expect(loadTheme(store())).toBe(DEFAULT_THEME);
    expect(loadTheme(store({ [THEME_STORAGE_KEY]: "casino" }))).toBe("casino");
    expect(loadTheme(store({ [THEME_STORAGE_KEY]: "no-such-skin" }))).toBe(DEFAULT_THEME);
    expect(loadTheme(null)).toBe(DEFAULT_THEME);
  });

  it("copes with storage that throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadTheme(broken)).toBe(DEFAULT_THEME);
    expect(() => saveTheme("casino", broken)).not.toThrow();
  });

  it("remembers a choice", () => {
    const s = store();
    saveTheme("casino", s);
    expect(loadTheme(s)).toBe("casino");
  });

  it("applies a theme to the page", () => {
    const root = document.createElement("div");
    applyTheme("casino", root);
    expect(root.dataset.theme).toBe("casino");
  });
});

describe("the Casino scenery pick", () => {
  it("picks either scene from the dice, and keeps the pick for the visit", () => {
    const kept = store();
    expect(pickScene(kept, () => 0)).toBe("roulette");
    expect(kept.data[SCENE_STORAGE_KEY]).toBe("roulette");
    expect(pickScene(kept, () => 0.99)).toBe("roulette"); // already picked, so the dice are ignored
    expect(pickScene(store(), () => 0.99)).toBe("poker");
    expect(SCENES).toEqual(["roulette", "poker"]);
  });

  it("ignores a stored value it does not know", () => {
    expect(pickScene(store({ [SCENE_STORAGE_KEY]: "bingo" }), () => 0.99)).toBe("poker");
  });

  it("never runs off the end of the list, even when the dice return exactly 1", () => {
    expect(pickScene(store(), () => 1)).toBe("poker");
  });

  it("copes with storage that throws or is missing", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(pickScene(broken, () => 0.99)).toBe("poker");
    expect(pickScene(null, () => 0)).toBe("roulette");
  });

  it("applies the pick to the page for the stylesheet", () => {
    const root = document.createElement("div");
    applyScene("poker", root);
    expect(root.dataset.scene).toBe("poker");
  });
});
