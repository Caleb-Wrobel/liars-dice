// Builds the third-party notices from the packages that are actually shipped: for the web game, everything the web
// package depends on at runtime, and for the game server, the same for the server package; and what those depend on,
// read from node_modules. It never names a path on this machine, so the files are safe for a public repo. Run
// `npm run notices` in ts/ to rewrite them; a test in each package fails when its file is stale.
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OWN_PACKAGES = new Set(["@liars-dice/engine", "@liars-dice/server", "@liars-dice/web"]);

/** What each shipped package's notices say and where they live, relative to ts/. */
const WORKSPACES = {
  web: {
    file: "../THIRD-PARTY-NOTICES.md",
    what: "The web game includes the third-party software\nand fonts below",
    licenceLink: "LICENSE",
  },
  server: {
    file: "server/THIRD-PARTY-NOTICES.md",
    what: "The game server includes the third-party software\nbelow",
    licenceLink: "../../LICENSE",
  },
};
const LICENCE_FILE = /^(licen[sc]e|copying)(\.(md|txt))?$/i;

/** The directory of `name`, found the way node would find it from `from`. */
function find(name, from) {
  for (let dir = from; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, "node_modules", name);
    if (existsSync(path.join(candidate, "package.json"))) return candidate;
    if (path.dirname(dir) === dir) throw new Error(`cannot find ${name} from ${from}`);
  }
}

/** Every runtime package a workspace ships, sorted by name, each with its licence texts. */
export function collectPackages(tsDir, workspace = "web") {
  const found = new Map();
  const visit = (name, from) => {
    if (OWN_PACKAGES.has(name)) return;
    const dir = find(name, from);
    const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
    const key = `${pkg.name}@${pkg.version}`;
    if (found.has(key)) return;
    const texts = readdirSync(dir)
      .filter((file) => LICENCE_FILE.test(file))
      .sort()
      .map((file) => readFileSync(path.join(dir, file), "utf8").trim());
    found.set(key, { name: pkg.name, version: pkg.version, licence: pkg.license, texts });
    for (const dep of Object.keys(pkg.dependencies ?? {})) visit(dep, dir);
  };
  const dir = path.join(tsDir, workspace);
  const pkg = JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8"));
  for (const dep of Object.keys(pkg.dependencies ?? {})) visit(dep, dir);
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function buildNotices(tsDir, workspace = "web") {
  const { what, licenceLink } = WORKSPACES[workspace];
  const packages = collectPackages(tsDir, workspace);
  const rows = packages.map((p) => `| ${p.name} | ${p.version} | ${p.licence} |`).join("\n");
  const sections = packages
    .map((p) => `## ${p.name} ${p.version}\n\nLicence: ${p.licence}\n\n${p.texts.map((t) => "```text\n" + t + "\n```").join("\n\n")}`)
    .join("\n\n");
  return `<!-- Generated from the installed packages. Do not edit by hand: run \`npm run notices\` in ts/, or \`npm test -- -u\` in ts/${workspace}. -->

# Third-party notices

Liar's Dice is released under the MIT licence (see [LICENSE](${licenceLink})). ${what}, each under its own licence, reproduced here as those licences ask.

| Package | Version | Licence |
|---|---|---|
${rows}

${sections}
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  for (const [workspace, { file }] of Object.entries(WORKSPACES)) {
    writeFileSync(path.resolve(tsDir, file), buildNotices(tsDir, workspace));
    console.log(`wrote ${path.normalize(file)}`);
  }
}
