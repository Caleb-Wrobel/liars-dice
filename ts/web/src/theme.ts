/**
 * The skins the game can wear. Each one has a stylesheet in src/themes/ that sets the same tokens, and a cast
 * of characters in src/personas/. `meet` is what its Meet page is called.
 */
export const THEMES = [
  { id: "saloon", label: "Saloon", blurb: "Warm walnut, brass and leather.", meet: "Rogues' Gallery" },
  { id: "casino", label: "Casino", blurb: "Green felt and gold.", meet: "High Rollers" },
  { id: "spooky", label: "Spooky", blurb: "Candlelight, bone and a pumpkin for every life.", meet: "Graveyard Shift" },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

export const DEFAULT_THEME: ThemeId = "saloon";

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

export function loadTheme(store: Store | null = browserStore()): ThemeId {
  try {
    const stored = store?.getItem(THEME_STORAGE_KEY);
    return isThemeId(stored) ? stored : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
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
