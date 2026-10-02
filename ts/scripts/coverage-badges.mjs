// Writes a coverage badge for each package, as a small SVG in docs/badges, from the summaries that
// `npm run test:coverage` leaves behind. Plain JavaScript, so it runs on any Node. Run it with `npm run badges`.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "..", "docs", "badges");

/** Dark enough behind white text to read, and not only a colour: the number is written on it. */
export const colourFor = (pct) => (pct >= 90 ? "#2e7d32" : pct >= 75 ? "#8a6d00" : "#b3261e");

/** A flat two-part badge, label then value, sized for the text. */
export function badge(label, value, colour) {
  const wide = (text) => Math.round(text.length * 6.6 + 12);
  const lw = wide(label);
  const vw = wide(value);
  const w = lw + vw;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="20" role="img" aria-label="${label}: ${value}">
  <title>${label}: ${value}</title>
  <rect width="${lw}" height="20" rx="3" fill="#555"/>
  <rect x="${lw}" width="${vw}" height="20" rx="3" fill="${colour}"/>
  <rect x="${lw}" width="6" height="20" fill="${colour}"/>
  <g fill="#fff" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11" text-anchor="middle">
    <text x="${lw / 2}" y="14">${label}</text>
    <text x="${lw + vw / 2}" y="14">${value}</text>
  </g>
</svg>
`;
}

const PACKAGES = [
  ["engine", "engine coverage"],
  ["web", "web coverage"],
];

function main() {
  mkdirSync(out, { recursive: true });
  for (const [pkg, label] of PACKAGES) {
    const summary = JSON.parse(readFileSync(join(root, pkg, "coverage", "coverage-summary.json"), "utf8"));
    const pct = summary.total.statements.pct;
    writeFileSync(join(out, `coverage-${pkg}.svg`), badge(label, `${pct}%`, colourFor(pct)));
    console.log(`${label}: ${pct}% of statements`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
