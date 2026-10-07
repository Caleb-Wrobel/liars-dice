/**
 * The player's place in a room, kept across a reload so the page can claim it back. It lives in `sessionStorage`, which
 * belongs to one tab: a reload keeps it, a second tab starts with none and is a different player, and closing the tab
 * lets it go, which the server counts as a drop. Storage can be missing or throw (private windows, blocked site data),
 * so every use is guarded, and the page works without it, only without resuming.
 */

const KEY = "liars-dice:seat";

export interface SavedSeat {
  /** The secret that proves the place is theirs. */
  readonly token: string;
  readonly code: string;
}

function tabStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function loadSeat(store: Pick<Storage, "getItem"> | null = tabStore()): SavedSeat | null {
  try {
    const raw = store?.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<SavedSeat> | null;
    const { token, code } = value ?? {};
    // What was stored is trusted no further than its shape: it goes to the server as a secret, so it must look like one.
    return typeof token === "string" && token !== "" && token.length <= 64 && typeof code === "string" && code.length <= 8
      ? { token, code }
      : null;
  } catch {
    return null;
  }
}

export function saveSeat(seat: SavedSeat, store: Pick<Storage, "setItem"> | null = tabStore()): void {
  try {
    store?.setItem(KEY, JSON.stringify(seat));
  } catch {
    // nowhere to keep it: the place is simply not resumed after a reload
  }
}

export function clearSeat(store: Pick<Storage, "removeItem"> | null = tabStore()): void {
  try {
    store?.removeItem(KEY);
  } catch {
    // as above
  }
}
