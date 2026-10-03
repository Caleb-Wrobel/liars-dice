import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The generator is plain JavaScript beside the other scripts, so it is loaded by a computed path and typed here.
const tsDir = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const generator = (await import(/* @vite-ignore */ resolve(tsDir, "scripts/third-party-notices.mjs"))) as {
  buildNotices: (dir: string) => string;
  collectPackages: (dir: string) => { name: string; version: string; licence: string; texts: string[] }[];
};

describe("THIRD-PARTY-NOTICES.md", () => {
  it("is up to date with the packages the web game ships", async () => {
    // A stale file fails here. `npm test -- -u` (or `npm run notices` in ts/) rewrites it from node_modules.
    await expect(generator.buildNotices(tsDir)).toMatchFileSnapshot("../../../THIRD-PARTY-NOTICES.md");
  });

  it("lists every runtime dependency of the web package, each with a licence and its text", () => {
    const web = JSON.parse(readFileSync(resolve(tsDir, "web/package.json"), "utf8")) as { dependencies: Record<string, string> };
    const listed = generator.collectPackages(tsDir);
    for (const name of Object.keys(web.dependencies).filter((dep) => !dep.startsWith("@liars-dice/"))) {
      const entry = listed.find((p) => p.name === name);
      expect(entry, name).toBeDefined();
      expect(entry!.licence, name).toBeTruthy();
      expect(entry!.texts.length, name).toBeGreaterThan(0);
      expect(entry!.texts.join("").length, name).toBeGreaterThan(100);
    }
  });

  it("covers the bundled fonts, whose licence asks for its text to travel with them", () => {
    const names = generator.collectPackages(tsDir).map((p) => p.name);
    for (const font of ["@fontsource/alegreya", "@fontsource/rye", "@fontsource/limelight"]) expect(names).toContain(font);
  });

  it("is safe for a public repo, and leaves out dev tools and the project's own packages", () => {
    const text = generator.buildNotices(tsDir);
    expect(text).not.toMatch(/\.internal|\/home\/|\/srv\/|localhost/);
    expect(text).not.toMatch(/## (vitest|vite|typescript|@liars-dice\/)/);
  });
});
