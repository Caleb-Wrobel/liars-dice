/**
 * The skins the game can wear. Each one has a stylesheet in src/themes/ that sets the same tokens, and a cast
 * of characters in src/personas/. `meet` is what its Meet page is called.
 */
export const THEMES = [
  { id: "saloon", label: "Saloon", blurb: "Warm walnut, brass and leather.", meet: "Rogues' Gallery" },
  { id: "casino", label: "Casino", blurb: "Green felt and gold.", meet: "High Rollers" },
  { id: "spooky", label: "Spooky", blurb: "Candlelight, bone and a pumpkin for every life.", meet: "Graveyard Shift" },
  { id: "hacker", label: "Hacker", blurb: "Green phosphor and a command line.", meet: "Process List" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "saloon";

/**
 * Tables that are the default in their season, for a visitor who has not chosen one. Months count from 1, January.
 * In any other month the default is Saloon. A table someone has picked is stored and always wins. Add a line when a
 * seasonally appropriate table exists; index.html carries the same table (a test keeps the two in step).
 */
export const SEASONS: readonly { readonly theme: ThemeId; readonly months: readonly number[] }[] = [
  { theme: "spooky", months: [10] },
];

/** The table to open on when none has been chosen: the one for this month if there is one, otherwise Saloon. */
export function defaultThemeFor(date: Date = new Date()): ThemeId {
  const month = date.getMonth() + 1;
  return SEASONS.find((season) => season.months.includes(month))?.theme ?? DEFAULT_THEME;
}

/** index.html reads this key before the page paints, to avoid a flash of the wrong skin. */
export const THEME_STORAGE_KEY = "liars-dice:theme";

export const isThemeId = (value: unknown): value is ThemeId => THEMES.some((theme) => theme.id === value);

type Store = Pick<Storage, "getItem" | "setItem">;

/** Storage can be missing or throw (private windows, blocked site data), so every use is guarded. */
const browserStore = (): Store | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export function loadTheme(store: Store | null = browserStore(), date: Date = new Date()): ThemeId {
  try {
    const stored = store?.getItem(THEME_STORAGE_KEY);
    return isThemeId(stored) ? stored : defaultThemeFor(date);
  } catch {
    return defaultThemeFor(date);
  }
}

export function saveTheme(id: ThemeId, store: Store | null = browserStore()): void {
  try {
    store?.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // The choice just won't be remembered.
  }
}

export function applyTheme(id: ThemeId, root: HTMLElement = document.documentElement): void {
  root.dataset.theme = id;
}

const sessionStore = (): Store | null => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

/**
 * Picks one of `options` the first time it is asked in a visit and keeps that pick in the store, so a refresh
 * mid-game does not change the room. A stored value that is not one of the options is ignored.
 */
function pickForVisit<T extends string>(options: readonly T[], key: string, store: Store | null, random: () => number): T {
  try {
    const kept = store?.getItem(key);
    const known = options.find((option) => option === kept);
    if (known) return known;
  } catch {
    // Fall through and pick afresh.
  }
  const picked = options[Math.min(options.length - 1, Math.floor(random() * options.length))]!;
  try {
    store?.setItem(key, picked);
  } catch {
    // It just won't be kept for the visit.
  }
  return picked;
}

/**
 * The Casino's left-hand scenery varies a little: the roulette betting layout, or a poker spread. It is applied as
 * data-scene for the stylesheet.
 */
export const SCENES = ["roulette", "poker"] as const;
export type SceneId = (typeof SCENES)[number];

export const SCENE_STORAGE_KEY = "liars-dice:scene";

export const pickScene = (store: Store | null = sessionStore(), random: () => number = Math.random): SceneId =>
  pickForVisit(SCENES, SCENE_STORAGE_KEY, store, random);

export function applyScene(id: SceneId, root: HTMLElement = document.documentElement): void {
  root.dataset.scene = id;
}

/** The Spooky title is one of two tombstones, applied as data-sign for the stylesheet. */
export const SIGNS = ["resting", "perch"] as const;
export type SignId = (typeof SIGNS)[number];

export const SIGN_STORAGE_KEY = "liars-dice:sign";

export const pickSign = (store: Store | null = sessionStore(), random: () => number = Math.random): SignId =>
  pickForVisit(SIGNS, SIGN_STORAGE_KEY, store, random);

export function applySign(id: SignId, root: HTMLElement = document.documentElement): void {
  root.dataset.sign = id;
}
