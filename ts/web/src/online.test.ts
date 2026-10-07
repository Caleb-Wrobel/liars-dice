import { afterEach, describe, expect, it, vi } from "vitest";
import { joinCodeFromSearch, serverUrl, shareLink } from "./online.ts";

afterEach(() => vi.unstubAllEnvs());

describe("serverUrl", () => {
  it.each(["ws://localhost:8787/ws", "wss://example.org/ws", "wss://example.org", "  ws://127.0.0.1:9000/play  "])(
    "accepts %j",
    (text) => expect(serverUrl(text)).toBe(text.trim()),
  );
  it.each(["", "   ", "http://example.org/ws", "https://example.org", "ws://", "ws:// no", "localhost:8787", "example.org/ws"])(
    "refuses %j, so that online play stays hidden",
    (text) => expect(serverUrl(text)).toBeNull(),
  );
  it.each([undefined, null, 8787, {}])("refuses %j, which is not text", (value) => expect(serverUrl(value)).toBeNull());

  it("reads the build's VITE_SERVER_URL when it is given nothing", () => {
    vi.stubEnv("VITE_SERVER_URL", "wss://example.org/ws");
    expect(serverUrl()).toBe("wss://example.org/ws");
    vi.stubEnv("VITE_SERVER_URL", "");
    expect(serverUrl()).toBeNull();
  });
});

describe("joinCodeFromSearch", () => {
  it("reads the code in capital letters", () => expect(joinCodeFromSearch("?join=ktmr")).toBe("KTMR"));
  it("drops anything that is not a letter, and anything past four", () => {
    expect(joinCodeFromSearch("?join=K-T%20M.R")).toBe("KTMR");
    expect(joinCodeFromSearch("?join=KTMRXYZ")).toBe("KTMR");
  });
  it.each(["", "?", "?join=", "?join=1234", "?other=KTMR"])("finds no code in %j", (search) => {
    expect(joinCodeFromSearch(search)).toBeNull();
  });
  it("finds the code among other parameters", () => expect(joinCodeFromSearch("?a=1&join=bcdf&b=2")).toBe("BCDF"));
});

describe("shareLink", () => {
  it("is this page with the code, and nothing else of the old address", () => {
    expect(shareLink("http://localhost:5173/?join=OLD&x=1#top", "KTMR")).toBe("http://localhost:5173/?join=KTMR");
  });
  it("keeps the path the site is served from", () => {
    expect(shareLink("https://example.org/liars-dice/", "BCDF")).toBe("https://example.org/liars-dice/?join=BCDF");
  });
});
