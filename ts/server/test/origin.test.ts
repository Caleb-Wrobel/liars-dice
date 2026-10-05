import { describe, expect, it } from "vitest";
import { originAllowed } from "../src/origin.ts";

const ours = ["https://game.example"];

describe("which origins may connect", () => {
  it("lets in the listed ones, exactly", () => {
    expect(originAllowed("https://game.example", ours)).toBe(true);
    expect(originAllowed("https://game.example", ["https://other.example", "https://game.example"])).toBe(true);
  });

  it("turns away everything else, however close", () => {
    for (const origin of [
      "http://game.example", // another scheme
      "https://game.example:8443", // another port
      "https://game.example/", // not how a browser writes an origin
      "https://www.game.example", // another host
      "https://game.example.evil.example",
      "https://evil.example",
      "https://GAME.example", // browsers write them lowercase
      "null", // a sandboxed page or a local file
    ]) {
      expect(originAllowed(origin, ours), origin).toBe(false);
    }
  });

  it("lets in a connection that is not from a browser", () => {
    expect(originAllowed(undefined, ours)).toBe(true);
    expect(originAllowed(undefined, [])).toBe(true);
    expect(originAllowed("", ours)).toBe(true);
  });

  it("with nothing configured, turns away every browser", () => {
    expect(originAllowed("https://game.example", [])).toBe(false);
    expect(originAllowed("null", [])).toBe(false);
  });
});
