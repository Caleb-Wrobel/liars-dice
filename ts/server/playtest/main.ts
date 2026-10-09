/**
 * Plays whole games against a running game server, as simulated people over real sockets, and says whether the server
 * kept its promises. Each player acts on only the views it was sent. Players drop and come back with their token, some
 * from a second connection while the first is still open, and some give up their seat. Built with `npm run build:playtest`.
 *
 *   node dist/playtest.mjs ws://127.0.0.1:8787/ws --rooms 20
 *   node dist/playtest.mjs --spawn --rooms 20          starts dist/server.mjs on a free port of its own
 *   node dist/playtest.mjs --spawn --minutes 180       no new rooms after three hours; games under way are finished
 *
 * Runs with different --seed values play different rooms, so a long job can be split across machines or into chunks.
 *
 * Exits 0 when every room played clean, 1 when any did not, and 2 when it was not told where to look.
 */
import { spawn } from "node:child_process";
import { playtest, type PlaytestOptions } from "./run.ts";

const args = process.argv.slice(2);
const flag = (name: string, fallback: number): number => {
  const at = args.indexOf(`--${name}`);
  if (at < 0) return fallback;
  const value = Number(args[at + 1]);
  if (!Number.isFinite(value)) {
    console.error(`--${name} needs a number`);
    process.exit(2);
  }
  return value;
};
const spawnServer = args.includes("--spawn");
const given = args.find((a, i) => a.startsWith("ws") && args[i - 1]?.startsWith("--") !== true);
if (!spawnServer && given === undefined) {
  console.error("usage: node playtest.mjs <ws://host:port/path> | --spawn  [--rooms N] [--minutes N] [--concurrency N] [--seed N]\n" +
    "       [--min-humans N] [--max-humans N] [--bots N] [--drop P] [--ghost P] [--leave P] [--think MS] [--stall SECONDS]");
  process.exit(2);
}

/** Starts the bundled server on a free port and resolves with its address once it says it is listening. */
function startServer(): Promise<{ url: string; stop: () => void }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["dist/server.mjs"], { env: { ...process.env, PORT: "0", HOST: "127.0.0.1" }, stdio: ["ignore", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (chunk: Buffer) => {
      out += chunk.toString();
      const found = /listening on ([\d.]+):(\d+)(\/\S*)/.exec(out);
      if (found) resolve({ url: `ws://${found[1]}:${found[2]}${found[3]}`, stop: () => child.kill("SIGTERM") });
    });
    child.once("error", reject);
    child.once("exit", (code) => reject(new Error(`the server exited with ${code} before it was ready`)));
  });
}

const server = spawnServer ? await startServer() : undefined;
const opts: PlaytestOptions = {
  url: server?.url ?? given!,
  minutes: flag("minutes", 0),
  // With a time limit and no room count, the time is the limit.
  rooms: flag("rooms", flag("minutes", 0) > 0 ? Number.MAX_SAFE_INTEGER : 12),
  concurrency: flag("concurrency", 4),
  seed: flag("seed", Date.now() % 100000),
  minHumans: flag("min-humans", 2),
  maxHumans: flag("max-humans", 4),
  maxBots: flag("bots", 0),
  drop: flag("drop", 0.08),
  ghost: flag("ghost", 0.3),
  leave: flag("leave", 0.15),
  thinkMs: flag("think", 400),
  stallMs: flag("stall", 30) * 1000,
  log: (line) => console.log(line),
};
const budget = opts.minutes > 0 ? `${opts.minutes} minutes` : `${opts.rooms} rooms`;
console.log(`playtest: ${budget}, ${opts.concurrency} at a time, seed ${opts.seed}`);
const results = await playtest(opts);
server?.stop();
const bad = results.filter((r) => r.problems.length > 0);
const moves = results.reduce((n, r) => n + r.moves, 0);
const drops = results.reduce((n, r) => n + r.drops, 0);
console.log(`${results.length - bad.length} of ${results.length} rooms clean (${moves} moves, ${drops} drops and resumes)`);
process.exit(bad.length === 0 ? 0 : 1);
