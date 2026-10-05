import { describe, expect, it } from "vitest";
import { TokenBucket } from "../src/ratelimit.ts";

describe("a token bucket", () => {
  const taken = (b: TokenBucket, n: number) => Array.from({ length: n }, () => b.take());

  it("allows a burst, then refuses until tokens come back", () => {
    let now = 0;
    const b = new TokenBucket(3, 2, () => now);
    expect(taken(b, 4)).toEqual([true, true, true, false]);
    now = 499; // 0.998 of a token
    expect(b.take()).toBe(false);
    now = 500;
    expect(b.take()).toBe(true);
    expect(b.take()).toBe(false);
  });

  it("never holds more than the burst, however long it rests", () => {
    let now = 0;
    const b = new TokenBucket(3, 2, () => now);
    now = 3_600_000;
    expect(taken(b, 4)).toEqual([true, true, true, false]);
  });

  it("keeps a steady sender at the refill rate going indefinitely", () => {
    let now = 0;
    const b = new TokenBucket(5, 4, () => now);
    for (let i = 0; i < 200; i++) {
      now += 250; // four a second, exactly the rate
      expect(b.take()).toBe(true);
    }
  });

  it("starts counting from when it was made, not from time zero", () => {
    let now = 1_000_000;
    const b = new TokenBucket(2, 1, () => now);
    expect(taken(b, 3)).toEqual([true, true, false]);
  });
});
