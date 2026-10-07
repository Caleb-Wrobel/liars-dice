import type { ThemeId } from "./theme.ts";

/** What the page needs to offer a room: a way to create one or join one, and a code to start with if a link carried one. */
export interface OnlineEntry {
  create(request: CreateRequest): void;
  join(request: JoinRequest): void;
  /** From a share link, to put in the Join form. */
  initialCode?: string;
}

export interface CreateRequest {
  readonly name: string;
  /** Seats at the table, people and bots together. */
  readonly seats: number;
  readonly lives: number;
  readonly advanced: boolean;
  readonly theme: ThemeId;
}

export interface JoinRequest {
  readonly name: string;
  readonly code: string;
  readonly theme: ThemeId;
}

/**
 * The address of the game server, from the build's `VITE_SERVER_URL`, or null when there is none or it is neither of
 * the two forms below. Without one the page offers only play on this device, which is also what a copy of the site
 * with no server behind it should do.
 *
 * - A WebSocket address, such as `ws://localhost:8787/ws`, for a server on a host of its own, as in development.
 * - A path, such as `/ws`, for a server on the same host as the page: the page connects to its own origin, whatever
 *   that is. A deployment that serves the site and the socket together needs no hostname in its build or in the
 *   repository, and the same build works wherever it is served. A path that starts with two slashes is refused: it
 *   would name another host.
 */
export function serverUrl(
  raw: unknown = import.meta.env.VITE_SERVER_URL,
  here: Pick<Location, "protocol" | "host"> = window.location,
): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (/^wss?:\/\/[^\s/]+(\/\S*)?$/.test(text)) return text;
  if (/^\/(?!\/)\S*$/.test(text)) return `${here.protocol === "https:" ? "wss:" : "ws:"}//${here.host}${text}`;
  return null;
}

/**
 * The room code a share link carries, as `?join=KTMR`, tidied to capital letters, or null if it carries none. The link
 * only fills in the Join form: the player still gives a name and presses the button.
 */
export function joinCodeFromSearch(search: string): string | null {
  const letters = (new URLSearchParams(search).get("join") ?? "").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 4);
  return letters === "" ? null : letters;
}

/** The link that opens the page ready to join this room. */
export function shareLink(base: string, code: string): string {
  const url = new URL(base);
  url.search = "";
  url.hash = "";
  url.searchParams.set("join", code);
  return url.toString();
}
