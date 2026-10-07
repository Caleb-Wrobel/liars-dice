import { afterEach, describe, expect, it, vi } from "vitest";
import { clearSeat, loadSeat, saveSeat } from "./roomStore.ts";

const memory = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    data,
  };
};

afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe("roomStore", () => {
  it("keeps the place and gives it back", () => {
    const store = memory();
    saveSeat({ token: "abc123", code: "KTMR" }, store);
    expect(loadSeat(store)).toEqual({ token: "abc123", code: "KTMR" });
  });

  it("has nothing before anything was kept, and nothing after it is let go", () => {
    const store = memory();
    expect(loadSeat(store)).toBeNull();
    saveSeat({ token: "abc123", code: "KTMR" }, store);
    clearSeat(store);
    expect(loadSeat(store)).toBeNull();
    expect(store.data.size).toBe(0);
  });

  it("keeps the most recent place only", () => {
    const store = memory();
    saveSeat({ token: "one", code: "AAAA" }, store);
    saveSeat({ token: "two", code: "BBBB" }, store);
    expect(loadSeat(store)).toEqual({ token: "two", code: "BBBB" });
  });

  it.each([
    ["text that is not JSON", "{not json"],
    ["JSON that is null", "null"],
    ["JSON that is a number", "42"],
    ["no token", '{"code":"KTMR"}'],
    ["no code", '{"token":"abc"}'],
    ["an empty token", '{"token":"","code":"KTMR"}'],
    ["a token that is not text", '{"token":5,"code":"KTMR"}'],
    ["a code that is not text", '{"token":"abc","code":5}'],
    ["a token too long to be one", `{"token":"${"x".repeat(65)}","code":"KTMR"}`],
    ["a code too long to be one", '{"token":"abc","code":"ABCDEFGHI"}'],
  ])("trusts nothing it was handed back: %s", (_what, raw) => {
    expect(loadSeat({ getItem: () => raw })).toBeNull();
  });

  it("copes with storage that throws, saying nothing and keeping nothing", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(loadSeat(broken)).toBeNull();
    expect(() => saveSeat({ token: "abc", code: "KTMR" }, broken)).not.toThrow();
    expect(() => clearSeat(broken)).not.toThrow();
  });

  it("copes with no storage at all", () => {
    expect(loadSeat(null)).toBeNull();
    expect(() => saveSeat({ token: "abc", code: "KTMR" }, null)).not.toThrow();
    expect(() => clearSeat(null)).not.toThrow();
  });

  it("uses the tab's own storage by default, and copes when even getting it throws", () => {
    saveSeat({ token: "abc", code: "KTMR" });
    expect(loadSeat()).toEqual({ token: "abc", code: "KTMR" });
    expect(window.sessionStorage.getItem("liars-dice:seat")).toContain("abc");
    clearSeat();
    expect(loadSeat()).toBeNull();
    const original = Object.getOwnPropertyDescriptor(window, "sessionStorage");
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    try {
      expect(loadSeat()).toBeNull();
      expect(() => saveSeat({ token: "abc", code: "KTMR" })).not.toThrow();
      expect(() => clearSeat()).not.toThrow();
    } finally {
      if (original) Object.defineProperty(window, "sessionStorage", original);
      else Reflect.deleteProperty(window, "sessionStorage");
    }
  });
});
