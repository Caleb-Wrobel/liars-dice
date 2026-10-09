import { describe, expect, it } from "vitest";
import { ConfigError, DEFAULT_HOST, DEFAULT_PATH, DEFAULT_PORT, readConfig } from "../src/config.ts";
import { DEFAULT_PACE } from "../src/match.ts";

describe("readConfig", () => {
  it("falls back to a server that listens only on this machine and lets no browser in", () => {
    expect(readConfig({})).toEqual({ port: DEFAULT_PORT, host: DEFAULT_HOST, path: DEFAULT_PATH, allowedOrigins: [], botPace: DEFAULT_PACE });
    expect(DEFAULT_PACE).toBe("slow");
    expect(DEFAULT_HOST).toBe("127.0.0.1");
  });

  it("takes each setting from the environment", () => {
    expect(
      readConfig({ PORT: "9000", HOST: "0.0.0.0", WS_PATH: "/play", ALLOWED_ORIGINS: "https://example.org", BOT_PACE: "fast" }),
    ).toEqual({ port: 9000, host: "0.0.0.0", path: "/play", allowedOrigins: ["https://example.org"], botPace: "fast" });
  });

  it("treats a setting that is there but empty as not set", () => {
    expect(readConfig({ PORT: "", HOST: "", WS_PATH: "", ALLOWED_ORIGINS: "", BOT_PACE: "" })).toEqual(readConfig({}));
  });

  describe("the port", () => {
    it.each(["0", "80", "65535"])("accepts %s", (port) => {
      expect(readConfig({ PORT: port }).port).toBe(Number(port));
    });
    it.each(["65536", "-1", "abc", "80.5", "1e3", " 80", "080a", "123456"])("refuses %j and says so", (port) => {
      expect(() => readConfig({ PORT: port })).toThrow(ConfigError);
      expect(() => readConfig({ PORT: port })).toThrow(/PORT/);
    });
  });

  describe("the bot pace", () => {
    it.each(["fast", "normal", "slow"])("accepts %s", (pace) => {
      expect(readConfig({ BOT_PACE: pace }).botPace).toBe(pace);
    });
    it.each(["quick", "FAST", " fast", "1", "none"])("refuses %j, and names the choices", (pace) => {
      expect(() => readConfig({ BOT_PACE: pace })).toThrow(ConfigError);
      expect(() => readConfig({ BOT_PACE: pace })).toThrow(/BOT_PACE must be one of fast, normal, slow/);
    });
  });

  describe("the path", () => {
    it("must start with a slash", () => {
      expect(() => readConfig({ WS_PATH: "play" })).toThrow(ConfigError);
      expect(() => readConfig({ WS_PATH: "play" })).toThrow(/WS_PATH/);
    });
  });

  describe("the allowed origins", () => {
    it("reads a comma-separated list, ignoring spaces and empty entries", () => {
      expect(readConfig({ ALLOWED_ORIGINS: " http://localhost:5173 ,, https://example.org ," }).allowedOrigins).toEqual([
        "http://localhost:5173",
        "https://example.org",
      ]);
    });

    it.each([
      ["a trailing slash", "https://example.org/"],
      ["a path", "https://example.org/play"],
      ["a wildcard", "*"],
      ["no scheme", "example.org"],
      ["capital letters, which a browser never sends", "HTTPS://Example.org"],
      ["a default port written out", "https://example.org:443"],
      ["not a URL at all", "not a url"],
    ])("refuses an entry with %s, and names it", (_why, entry) => {
      expect(() => readConfig({ ALLOWED_ORIGINS: `https://fine.example,${entry}` })).toThrow(ConfigError);
      expect(() => readConfig({ ALLOWED_ORIGINS: `https://fine.example,${entry}` })).toThrow(entry);
    });
  });
});
