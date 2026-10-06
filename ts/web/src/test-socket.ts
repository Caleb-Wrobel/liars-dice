import { PROTOCOL_VERSION } from "@liars-dice/engine";
import type { SocketLike } from "./connection.ts";

/** A socket a test works by hand: it keeps what was sent, and the test opens, speaks and drops it. */
export class FakeSocket implements SocketLike {
  onopen: ((event: Event) => unknown) | null = null;
  onmessage: ((event: MessageEvent) => unknown) | null = null;
  onclose: ((event: CloseEvent) => unknown) | null = null;
  onerror: ((event: Event) => unknown) | null = null;
  sent: unknown[] = [];
  closedWith: number | null = null;
  constructor(readonly url: string) {}
  send(data: string) {
    this.sent.push(JSON.parse(data));
  }
  close(code?: number) {
    this.closedWith = code ?? 1005;
    this.drop(code ?? 1005); // a real socket reports the close it was asked for, which the client must ignore
  }
  /** The line opens. */
  open() {
    this.onopen?.(new Event("open"));
  }
  /** The server says something. */
  say(message: object) {
    this.raw(JSON.stringify({ v: PROTOCOL_VERSION, ...message }));
  }
  /** The server sends exactly this, whatever it is. */
  raw(data: unknown) {
    this.onmessage?.(new MessageEvent("message", { data }));
  }
  /** The line drops, or the server closes it. */
  drop(code = 1006) {
    this.onclose?.(new CloseEvent("close", { code }));
  }
}
