/**
 * Whether a browser's WebSocket may connect. The `Origin` header names the website that opened the socket, and a
 * browser sets it itself, so a page on another site cannot pretend to be ours. A connection with no `Origin` is not
 * from a browser (a script, a test), which could send any header anyway, so it is let through. With nothing allowed,
 * every browser is turned away: a server nobody has configured fails closed.
 */
export function originAllowed(origin: string | undefined, allowed: readonly string[]): boolean {
  return origin === undefined || origin === "" ? true : allowed.includes(origin);
}
