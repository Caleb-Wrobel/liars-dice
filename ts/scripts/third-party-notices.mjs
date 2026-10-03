// Builds THIRD-PARTY-NOTICES.md from the packages the web game actually ships: everything the web package depends
// on at runtime, and what those depend on, read from node_modules. It never names a path on this machine, so the file
// is safe for a public repo. Run `npm run notices` in ts/ to rewrite it; a test in the web package fails when it is stale.
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OWN_PACKAGES = new Set(["@liars-dice/engine", "@liars-dice/web"]);
const LICENCE_FILE = /^(licen[sc]e|copying)(\.(md|txt))?$/i;

/** The directory of `name`, found the way node would find it from `from`. */
function find(name, from) {
  for (let dir = from; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, "node_modules", name);
    if (existsSync(path.join(candidate, "package.json"))) return candidate;
    if (path.dirname(dir) === dir) throw new Error(`cannot find ${name} from ${from}`);
  }
}

/** Every runtime package the web game ships, sorted by name, each with its licence texts. */
export function collectPackages(tsDir) {
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
  const web = path.join(tsDir, "web");
  const webPkg = JSON.parse(readFileSync(path.join(web, "package.json"), "utf8"));
  for (const dep of Object.keys(webPkg.dependencies ?? {})) visit(dep, web);
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function buildNotices(tsDir) {
  const packages = collectPackages(tsDir);
  const rows = packages.map((p) => `| ${p.name} | ${p.version} | ${p.licence} |`).join("\n");
  const sections = packages
    .map((p) => `## ${p.name} ${p.version}\n\nLicence: ${p.licence}\n\n${p.texts.map((t) => "```text\n" + t + "\n```").join("\n\n")}`)
    .join("\n\n");
  return `<!-- Generated from the installed packages. Do not edit by hand: run \`npm run notices\` in ts/, or \`npm test -- -u\` in ts/web. -->

# Third-party notices

Liar's Dice is released under the MIT licence (see [LICENSE](LICENSE)). The web game includes the third-party software
and fonts below, each under its own licence, reproduced here as those licences ask.

| Package | Version | Licence |
|---|---|---|
${rows}

${sections}
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const tsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  writeFileSync(path.resolve(tsDir, "..", "THIRD-PARTY-NOTICES.md"), buildNotices(tsDir));
  console.log("wrote THIRD-PARTY-NOTICES.md");
}
