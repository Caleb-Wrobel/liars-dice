import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, THEME_STORAGE_KEY, THEMES, applyTheme, isThemeId, loadTheme, saveTheme } from "./theme.ts";

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
