import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The generator is plain JavaScript beside the other scripts, so it is loaded by a computed path and typed here.
const tsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const generator = (await import(/* @vite-ignore */ resolve(tsDir, "scripts/third-party-notices.mjs"))) as {
  buildNotices: (dir: string, workspace: string) => string;
  collectPackages: (dir: string, workspace: string) => { name: string; licence: string; texts: string[] }[];
};

describe("the server's THIRD-PARTY-NOTICES.md", () => {
  it("is up to date with what the server ships", async () => {
    // A stale file fails here. `npm test -- -u` in ts/server (or `npm run notices` in ts/) rewrites it.
    await expect(generator.buildNotices(tsDir, "server")).toMatchFileSnapshot("../THIRD-PARTY-NOTICES.md");
  });

  it("covers ws, which is built into the one file the server ships, with its licence and its text", () => {
    const ws = generator.collectPackages(tsDir, "server").find((p) => p.name === "ws");
    expect(ws).toBeDefined();
    expect(ws!.licence).toBe("MIT");
    expect(ws!.texts.join("")).toMatch(/Permission is hereby granted/);
    expect(ws!.texts.join("")).toMatch(/Copyright/);
  });

  it("is safe for a public repo, and leaves out dev tools and the project's own packages", () => {
    const text = generator.buildNotices(tsDir, "server");
    expect(text).not.toMatch(/\.internal|\/home\/|\/srv\/|localhost/);
    expect(text).not.toMatch(/## (vitest|vite|typescript|rolldown|@liars-dice\/)/);
  });

  it("points at the licence file at the root of the repository, which is there", () => {
    expect(generator.buildNotices(tsDir, "server")).toContain("(see [LICENSE](../../LICENSE))");
    expect(existsSync(resolve(tsDir, "server", "../../LICENSE"))).toBe(true);
  });
});
