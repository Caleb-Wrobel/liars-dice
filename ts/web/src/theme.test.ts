import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_THEME,
  SCENE_STORAGE_KEY,
  SCENES,
  SIGN_STORAGE_KEY,
  SIGNS,
  THEME_STORAGE_KEY,
  THEMES,
  applyScene,
  applyStill,
  isAnimated,
  loadStill,
  MOTION_STORAGE_KEY,
  prefersReducedMotion,
  saveStill,
  applySign,
  applyTheme,
  defaultThemeFor,
  SEASONS,
  isThemeId,
  loadTheme,
  pickScene,
  pickSign,
  saveTheme,
} from "./theme.ts";

const store = (initial: Record<string, string> = {}) => {
  const data = { ...initial };
  return { data, getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
};

describe("themes", () => {
  it("registers saloon first, as the default", () => {
    expect(DEFAULT_THEME).toBe("saloon");
    expect(THEMES.map((t) => t.id)).toEqual(["saloon", "casino", "spooky", "hacker"]);
  });

  it("recognises only registered ids", () => {
    expect(isThemeId("casino")).toBe(true);
    expect(isThemeId("pirate")).toBe(false);
    expect(isThemeId(null)).toBe(false);
  });

  it("loads the saved theme, falling back to the default", () => {
    const june = new Date(2026, 5, 15); // no table is seasonal in June, so the default is plain Saloon
    expect(loadTheme(store(), june)).toBe(DEFAULT_THEME);
    expect(loadTheme(store({ [THEME_STORAGE_KEY]: "casino" }), june)).toBe("casino");
    expect(loadTheme(store({ [THEME_STORAGE_KEY]: "no-such-skin" }), june)).toBe(DEFAULT_THEME);
    expect(loadTheme(null, june)).toBe(DEFAULT_THEME);
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
    expect(loadTheme(broken, new Date(2026, 5, 15))).toBe(DEFAULT_THEME);
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

describe("the Spooky title pick", () => {
  it("picks either tombstone from the dice, and keeps the pick for the visit", () => {
    const kept = store();
    expect(pickSign(kept, () => 0)).toBe("resting");
    expect(kept.data[SIGN_STORAGE_KEY]).toBe("resting");
    expect(pickSign(kept, () => 0.99)).toBe("resting");
    expect(pickSign(store(), () => 0.99)).toBe("perch");
    expect(SIGNS).toEqual(["resting", "perch"]);
  });

  it("is picked separately from the Casino scenery", () => {
    const shared = store();
    expect(pickScene(shared, () => 0.99)).toBe("poker");
    expect(pickSign(shared, () => 0)).toBe("resting");
  });

  it("applies the pick to the page for the stylesheet", () => {
    const root = document.createElement("div");
    applySign("perch", root);
    expect(root.dataset.sign).toBe("perch");
  });
});

describe("the seasonal default table", () => {
  it("opens on Spooky in October and on Saloon in every other month", () => {
    expect(defaultThemeFor(new Date(2026, 9, 1))).toBe("spooky");
    expect(defaultThemeFor(new Date(2026, 9, 31, 23, 59))).toBe("spooky");
    for (const month of [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 11]) expect(defaultThemeFor(new Date(2026, month, 15)), String(month + 1)).toBe("saloon");
  });

  it("uses the date it is given, and today's by default", () => {
    expect(defaultThemeFor()).toBe("saloon"); // the test setup pins the date to June
    vi.setSystemTime(new Date(2026, 9, 3));
    expect(defaultThemeFor()).toBe("spooky");
    expect(loadTheme(store())).toBe("spooky");
  });

  it("never overrides a table the visitor has chosen", () => {
    const october = new Date(2026, 9, 15);
    expect(loadTheme(store({ [THEME_STORAGE_KEY]: "saloon" }), october)).toBe("saloon");
    expect(loadTheme(store({ [THEME_STORAGE_KEY]: "casino" }), october)).toBe("casino");
    expect(loadTheme(store({ [THEME_STORAGE_KEY]: "no-such-skin" }), october)).toBe("spooky"); // junk falls back to the season
  });

  it("only names registered tables, and real months", () => {
    for (const { theme, months } of SEASONS) {
      expect(isThemeId(theme)).toBe(true);
      for (const month of months) expect(month >= 1 && month <= 12 && Number.isInteger(month)).toBe(true);
    }
  });
});

describe("the Still scenery choice", () => {
  it("knows which tables animate", () => {
    expect(THEMES.filter((t) => isAnimated(t.id)).map((t) => t.id)).toEqual(["spooky"]);
  });

  it("loads, saves and applies the choice, treating anything but a saved 1 as moving", () => {
    expect(loadStill(store())).toBe(false);
    expect(loadStill(store({ [MOTION_STORAGE_KEY]: "0" }))).toBe(false);
    expect(loadStill(store({ [MOTION_STORAGE_KEY]: "1" }))).toBe(true);
    const kept = store();
    saveStill(true, kept);
    expect(kept.data[MOTION_STORAGE_KEY]).toBe("1");
    saveStill(false, kept);
    expect(kept.data[MOTION_STORAGE_KEY]).toBe("0");
    const root = document.createElement("div");
    applyStill(true, root);
    expect(root.dataset.motion).toBe("still");
    applyStill(false, root);
    expect(root.dataset.motion).toBeUndefined();
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
    expect(loadStill(broken)).toBe(false);
    expect(() => saveStill(true, broken)).not.toThrow();
    expect(loadStill(null)).toBe(false);
  });

  it("reads the system's reduced-motion setting, and copes with a browser that cannot say", () => {
    const win = (reduce: boolean) => ({ matchMedia: () => ({ matches: reduce }) as MediaQueryList });
    expect(prefersReducedMotion(win(true))).toBe(true);
    expect(prefersReducedMotion(win(false))).toBe(false);
    expect(prefersReducedMotion({} as Pick<Window, "matchMedia">)).toBe(false);
    expect(prefersReducedMotion(undefined)).toBe(false);
  });
});
