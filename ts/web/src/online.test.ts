import { afterEach, describe, expect, it, vi } from "vitest";
import { joinCodeFromSearch, serverUrl, shareLink } from "./online.ts";

afterEach(() => vi.unstubAllEnvs());

describe("serverUrl", () => {
  it.each(["ws://localhost:8787/ws", "wss://example.org/ws", "wss://example.org", "  ws://127.0.0.1:9000/play  "])(
    "accepts %j",
    (text) => expect(serverUrl(text)).toBe(text.trim()),
  );
  it.each(["", "   ", "http://example.org/ws", "https://example.org", "ws://", "ws:// no", "localhost:8787", "example.org/ws", "//evil.example/ws", "/ws path", "ws"])(
    "refuses %j, so that online play stays hidden",
    (text) => expect(serverUrl(text)).toBeNull(),
  );
  it.each([undefined, null, 8787, {}])("refuses %j, which is not text", (value) => expect(serverUrl(value)).toBeNull());

  describe("a path on the page's own host", () => {
    const secure = { protocol: "https:", host: "game.example.org" };
    const plain = { protocol: "http:", host: "localhost:5173" };
    it("connects to its own origin, securely when the page is", () => {
      expect(serverUrl("/ws", secure)).toBe("wss://game.example.org/ws");
      expect(serverUrl("/ws", plain)).toBe("ws://localhost:5173/ws");
    });
    it("keeps the whole path, and accepts the bare root", () => {
      expect(serverUrl("/play/socket", secure)).toBe("wss://game.example.org/play/socket");
      expect(serverUrl("/", secure)).toBe("wss://game.example.org/");
    });
    it("is trimmed like any other setting", () => {
      expect(serverUrl("  /ws  ", secure)).toBe("wss://game.example.org/ws");
    });
    it("refuses a path that would name another host, or that has spaces in it", () => {
      expect(serverUrl("//evil.example/ws", secure)).toBeNull();
      expect(serverUrl("/ws path", secure)).toBeNull();
    });
    it("is read from the page it is on when no page is given", () => {
      expect(serverUrl("/ws")).toBe(`${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`);
    });
  });

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
