/**
 * Reading sweep results. Plain JavaScript with no imports, so it runs anywhere Node does, including a
 * machine that cannot run the TypeScript simulation itself.
 *
 *   node sim/summarize.mjs results.json
 */
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/** 95% Wilson score interval for `wins` out of `n`, as fractions. */
export function wilson(wins, n) {
  if (n === 0) return [0, 1];
  const z = 1.96;
  const p = wins / n;
  const denom = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denom;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

/** Whether two result sets are identical, and which jobs differ if not. */
export function compareResults(a, b) {
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
  const differing = keys.filter((key) => JSON.stringify(sorted(a[key])) !== JSON.stringify(sorted(b[key])));
  return { identical: differing.length === 0, differing };
}

function sorted(counts) {
  return counts && Object.fromEntries(Object.entries(counts).sort(([x], [y]) => (x < y ? -1 : 1)));
}

const pct = (x) => (x * 100).toFixed(1).padStart(5);
const band = (wins, n) => {
  const [lo, hi] = wilson(wins, n);
  return `[${pct(lo)}, ${pct(hi)}]`;
};

/** A readable report of a sweep's results, as lines of text. */
export function summaryLines(results) {
  const lines = [];
  const ids = Object.keys(results).sort();

  const duels = ids.filter((id) => id.startsWith("duel|"));
  if (duels.length) {
    lines.push("DUELS: win rate against a plain bot of the same level, 95% interval. 50% means equal strength.");
    for (const id of duels) {
      const [, who, level] = id.split("|");
      const { games = 0, wins = 0 } = results[id];
      lines.push(`  ${who.padEnd(16)} ${level.padEnd(7)} n=${String(games).padStart(7)}  ${pct(wins / games)}%  ${band(wins, games)}`);
    }
  }

  const tables = ids.filter((id) => id.startsWith("tables|"));
  for (const id of tables) {
    const size = Number(id.split("|")[1]);
    const c = results[id];
    lines.push("", `TABLE OF ${size} BOTS: ${c.games} games${c.unfinished ? `, ${c.unfinished} UNFINISHED` : ""}. Fair share is ${pct(1 / size)}%.`);
    const whos = [...new Set(Object.keys(c).filter((k) => k.startsWith("seat|") && !k.includes(":") && !k.slice(5).includes("|")).map((k) => k.slice(5)))].sort();
    for (const who of whos) {
      const seats = c[`seat|${who}`] ?? 0;
      const wins = c[`win|${who}`] ?? 0;
      lines.push(`  ${who.padEnd(16)} seats=${String(seats).padStart(7)}  wins ${pct(wins / seats)}%  ${band(wins, seats)}  edge ${((wins / seats - 1 / size) * 100).toFixed(1).padStart(5)} pp`);
    }
    for (const level of ["easy", "normal", "stabby"]) {
      const seats = c[`seat|level:${level}`] ?? 0;
      const wins = c[`win|level:${level}`] ?? 0;
      if (seats) lines.push(`  (level ${level.padEnd(7)}) seats=${String(seats).padStart(7)}  wins ${pct(wins / seats)}%  ${band(wins, seats)}`);
    }
  }

  const tells = ids.filter((id) => id.startsWith("tells|"));
  if (tells.length) {
    lines.push("", "TELLS: how often a claim was true, by how far it raised the standing claim, as a share of that character's claims.");
    for (const id of tells) {
      const [, who, level] = id.split("|");
      const c = results[id];
      const cells = ["1", "2", "3-4", "5+"].map((b) => `${b.padEnd(3)} ${c[`raise|${b}`] ? pct((c[`raiseTrue|${b}`] ?? 0) / c[`raise|${b}`]) : "  n/a"}% (${String(c[`raise|${b}`] ?? 0).padStart(5)})`);
      const keeps = c.keeps ? `keeps ${pct((c.keepsTrue ?? 0) / c.keeps)}% (${c.keeps})` : "keeps  n/a";
      lines.push(`  ${who.padEnd(16)} ${level.padEnd(7)} raise ${cells.join("  ")}   ${keeps}`);
    }
  }
  return lines;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node sim/summarize.mjs results.json");
    process.exit(2);
  }
  const { meta, results } = JSON.parse(readFileSync(file, "utf8"));
  if (meta) console.log(`sweep ${meta.sweep}, ${meta.games} games per job from seed ${meta.seedStart}, ${meta.arch}, node ${meta.node}\n`);
  console.log(summaryLines(results).join("\n"));
}
