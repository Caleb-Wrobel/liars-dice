import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION } from "@liars-dice/engine";
import { parseClientMessage } from "../src/protocol.ts";

const msg = (extra: Record<string, unknown>) => ({ v: PROTOCOL_VERSION, ...extra });

describe("parseClientMessage", () => {
  it("accepts each message with the fields it needs", () => {
    expect(parseClientMessage(msg({ type: "create", name: "Sam", seats: 4 }))).toEqual({
      ok: true,
      message: { type: "create", name: "Sam", seats: 4 },
    });
    expect(parseClientMessage(msg({ type: "join", code: "KTMR", name: "Sam" }))).toEqual({
      ok: true,
      message: { type: "join", code: "KTMR", name: "Sam" },
    });
    expect(parseClientMessage(msg({ type: "resume", token: "abc" }))).toEqual({ ok: true, message: { type: "resume", token: "abc" } });
    expect(parseClientMessage(msg({ type: "start" }))).toEqual({ ok: true, message: { type: "start" } });
    expect(parseClientMessage(msg({ type: "leave" }))).toEqual({ ok: true, message: { type: "leave" } });
    expect(parseClientMessage(msg({ type: "intent", intent: { action: "pull" } }))).toEqual({
      ok: true,
      message: { type: "intent", intent: { action: "pull" } },
    });
  });

  it("accepts the optional lives and rules on create, and refuses them when they are the wrong type", () => {
    expect(parseClientMessage(msg({ type: "create", name: "Sam", seats: 4, lives: 5, advanced: true }))).toEqual({
      ok: true,
      message: { type: "create", name: "Sam", seats: 4, lives: 5, advanced: true },
    });
    expect(parseClientMessage(msg({ type: "create", name: "Sam", seats: 4, lives: 2 }))).toEqual({
      ok: true,
      message: { type: "create", name: "Sam", seats: 4, lives: 2 },
    });
    for (const extra of [{ lives: "3" }, { lives: 2.5 }, { advanced: "yes" }, { advanced: 1 }, { lives: null }, { advanced: null }]) {
      expect(parseClientMessage(msg({ type: "create", name: "Sam", seats: 4, ...extra }))).toMatchObject({ ok: false, code: "malformed" });
    }
  });

  it("passes an intent on untouched, even a bad one: the engine's core judges it", () => {
    for (const intent of [null, 5, "pull", { action: "hack" }, []]) {
      expect(parseClientMessage(msg({ type: "intent", intent }))).toEqual({ ok: true, message: { type: "intent", intent } });
    }
  });

  it("refuses another protocol version with a message that says to reload", () => {
    for (const v of [undefined, 0, 2, "1", null]) {
      const res = parseClientMessage({ v, type: "start" });
      expect(res).toMatchObject({ ok: false, code: "version" });
      expect((res as { error: string }).error).toMatch(/reload/);
    }
  });

  it("refuses anything that is not shaped like a message, without throwing", () => {
    const junk: unknown[] = [
      null, undefined, 5, "start", true, [], [1, 2], {}, { v: 1 }, msg({}), msg({ type: 7 }), msg({ type: "hack" }),
      msg({ type: "create" }), msg({ type: "create", name: "Sam" }), msg({ type: "create", seats: 4 }),
      msg({ type: "create", name: 5, seats: 4 }), msg({ type: "create", name: "Sam", seats: "4" }),
      msg({ type: "create", name: "Sam", seats: 4.5 }), msg({ type: "create", name: "Sam", seats: NaN }),
      msg({ type: "create", name: "x".repeat(1000), seats: 4 }),
      msg({ type: "join" }), msg({ type: "join", code: "KTMR" }), msg({ type: "join", name: "Sam" }),
      msg({ type: "join", code: 5, name: "Sam" }), msg({ type: "join", code: "K".repeat(1000), name: "Sam" }),
      msg({ type: "resume" }), msg({ type: "resume", token: 5 }), msg({ type: "resume", token: "t".repeat(1000) }),
      msg({ type: "intent" }),
    ];
    for (const raw of junk) {
      const res = parseClientMessage(raw);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(["malformed", "version"]).toContain(res.code);
    }
  });

  it("ignores fields it does not know, so a newer client's extras cannot hurt", () => {
    expect(parseClientMessage(msg({ type: "start", sneaky: { deep: [1, 2, 3] }, __proto__: { x: 1 } }))).toEqual({
      ok: true,
      message: { type: "start" },
    });
  });
});
