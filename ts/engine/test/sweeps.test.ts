import { describe, expect, it } from "vitest";
import { ARCHETYPES } from "../src/index.ts";
import { compareResults, summaryLines, wilson } from "../sim/summarize.mjs";
import { jobsFor, merge, runJob, type Job } from "../sim/sweeps.ts";

const job = (id: string): Job => jobsFor("all").find((j) => j.id === id)!;

describe("jobsFor", () => {
  it("lists every archetype and a plain baseline at every level for duels", () => {
    const jobs = jobsFor("duel");
    expect(jobs).toHaveLength((ARCHETYPES.length + 1) * 3);
    expect(jobs.filter((j) => j.who === "plain")).toHaveLength(3);
  });

  it("lists a job per table size, from two bots to five", () => {
    expect(jobsFor("tables").map((j) => j.size)).toEqual([2, 3, 4, 5]);
  });

  it("measures tells for the archetypes only, since a plain bot has no archetype", () => {
    expect(jobsFor("tells")).toHaveLength(ARCHETYPES.length * 3);
    expect(jobsFor("tells").some((j) => j.who === "plain")).toBe(false);
  });

  it("gives every job a unique id, and 'all' is the union of the others", () => {
    const all = jobsFor("all");
    expect(new Set(all.map((j) => j.id)).size).toBe(all.length);
    expect(all).toHaveLength(jobsFor("duel").length + jobsFor("tables").length + jobsFor("tells").length);
  });
});

describe("runJob", () => {
  const jobs = ["duel|bluffer|normal", "tables|3", "tells|gambler|easy"];

  it.each(jobs)("is deterministic for %s", (id) => {
    expect(runJob(job(id), 0, 6)).toEqual(runJob(job(id), 0, 6));
  });

  it.each(jobs)("adds up the same whether run whole or in chunks, for %s", (id) => {
    const whole = runJob(job(id), 0, 12);
    const chunks = [[0, 5], [5, 9], [9, 12]].map(([from, to]) => runJob(job(id), from!, to!));
    expect(chunks.reduce(merge)).toEqual(whole);
  });

  it("counts a duel's games and wins", () => {
    const counts = runJob(job("duel|plain|normal"), 0, 20);
    expect(counts.games).toBe(20);
    expect(counts.wins).toBeGreaterThanOrEqual(0);
    expect(counts.wins).toBeLessThanOrEqual(20);
  });

  it("gives a table exactly one winner per game and a seat per bot", () => {
    const counts = runJob(job("tables|4"), 0, 15);
    expect(counts.games).toBe(15);
    expect(counts.unfinished ?? 0).toBe(0);
    const keys = (prefix: string) => ARCHETYPES.map((p) => counts[`${prefix}|${p.id}`] ?? 0);
    expect(keys("seat").reduce((a, b) => a + b)).toBe(15 * 4);
    expect(keys("win").reduce((a, b) => a + b)).toBe(15);
  });

  it("keeps the table counts for levels consistent with the counts for archetypes", () => {
    const counts = runJob(job("tables|3"), 0, 15);
    const sum = (prefix: string) => ["easy", "normal", "stabby"].reduce((a, l) => a + (counts[`${prefix}|level:${l}`] ?? 0), 0);
    expect(sum("seat")).toBe(15 * 3);
    expect(sum("win")).toBe(15);
  });

  it("records tells that are consistent with each other", () => {
    const c = runJob(job("tells|bluffer|normal"), 0, 30);
    expect(c.games).toBe(30);
    expect(c.claims).toBeGreaterThan(0);
    expect(c.claimsTrue ?? 0).toBeLessThanOrEqual(c.claims!);
    for (const bucket of ["1", "2", "3-4", "5+"]) {
      expect(c[`raiseTrue|${bucket}`] ?? 0).toBeLessThanOrEqual(c[`raise|${bucket}`] ?? 0);
    }
  });
});

describe("summarize", () => {
  it("computes a Wilson interval", () => {
    const [lo, hi] = wilson(50, 100);
    expect(lo).toBeCloseTo(0.404, 2);
    expect(hi).toBeCloseTo(0.596, 2);
    expect(wilson(0, 0)).toEqual([0, 1]);
    expect(wilson(100, 100)[1]).toBeCloseTo(1, 10);
  });

  it("narrows the interval as games are added", () => {
    const width = (n: number) => wilson(n / 2, n)[1] - wilson(n / 2, n)[0];
    expect(width(5000)).toBeLessThan(width(500));
  });

  it("compares result sets exactly, ignoring key order", () => {
    const a = { x: { games: 5, wins: 2 } };
    expect(compareResults(a, { x: { wins: 2, games: 5 } })).toEqual({ identical: true, differing: [] });
    expect(compareResults(a, { x: { games: 5, wins: 3 } })).toEqual({ identical: false, differing: ["x"] });
    expect(compareResults(a, {}).differing).toEqual(["x"]);
  });

  it("turns real results into a readable report", () => {
    const results = {
      "duel|bluffer|normal": runJob(job("duel|bluffer|normal"), 0, 10),
      "tables|3": runJob(job("tables|3"), 0, 10),
      "tells|bluffer|normal": runJob(job("tells|bluffer|normal"), 0, 10),
    };
    const text = summaryLines(results).join("\n");
    expect(text).toContain("DUELS");
    expect(text).toContain("bluffer");
    expect(text).toContain("TABLE OF 3 BOTS");
    expect(text).toContain("TELLS");
  });
});
