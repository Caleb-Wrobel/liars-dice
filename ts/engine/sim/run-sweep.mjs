/**
 * Runs simulation sweeps across worker threads and writes the merged counts to a JSON file.
 *
 *   node sim/run-sweep.mjs --sweep tables --games 2000 --workers 3 --out results.json
 *   node sim/run-sweep.mjs --compare a.json b.json
 *   node sim/summarize.mjs results.json
 *
 * Needs a Node that runs TypeScript directly (22.18 or newer, with type stripping on by default).
 * Results are deterministic for a given sweep, seed range and code, whatever the worker count.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { isMainThread, parentPort, Worker } from "node:worker_threads";
import { compareResults } from "./summarize.mjs";
import { jobsFor, merge, runJob } from "./sweeps.ts";

if (!isMainThread) {
  // Worker: take a chunk, count it, report back.
  parentPort.on("message", ({ job, from, to }) => {
    const started = performance.now();
    parentPort.postMessage({ id: job.id, counts: runJob(job, from, to), games: to - from, ms: performance.now() - started });
  });
} else {
  await main();
}

function usage() {
  console.log(`usage:
  node sim/run-sweep.mjs --sweep <duel|tables|tells|all> --out results.json [options]
  node sim/run-sweep.mjs --compare a.json b.json

options:
  --games N        games per job (default 200)
  --seed-start N   first seed (default 0)
  --workers N      worker threads (default: cores minus one, at most 4)
  --chunk N        games per task handed to a worker (default 25)
  --only TEXT      only jobs whose id contains TEXT
  --help`);
}

function parseArgs(argv) {
  const opts = { sweep: "duel", games: 200, seedStart: 0, chunk: 25, only: "", workers: Math.max(1, Math.min(4, availableParallelism() - 1)) };
  const numeric = { "--games": "games", "--seed-start": "seedStart", "--chunk": "chunk", "--workers": "workers" };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--help") opts.help = true;
    else if (flag === "--compare") opts.compare = [argv[++i], argv[++i]];
    else if (flag === "--sweep") opts.sweep = argv[++i];
    else if (flag === "--out") opts.out = argv[++i];
    else if (flag === "--only") opts.only = argv[++i];
    else if (flag in numeric) opts[numeric[flag]] = Number(argv[++i]);
    else throw new Error(`unknown option ${flag}`);
  }
  return opts;
}

const canonical = (counts) => Object.fromEntries(Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : 1)));

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return usage();

  if (opts.compare) {
    const [a, b] = opts.compare.map((file) => JSON.parse(readFileSync(file, "utf8")));
    const { identical, differing } = compareResults(a.results, b.results);
    console.log(identical ? `identical: ${Object.keys(a.results).length} jobs match exactly` : `DIFFERENT in ${differing.length} jobs:\n  ${differing.join("\n  ")}`);
    process.exitCode = identical ? 0 : 1;
    return;
  }

  if (!opts.out) throw new Error("--out is required");
  const jobs = jobsFor(opts.sweep).filter((job) => job.id.includes(opts.only));
  if (jobs.length === 0) throw new Error(`no jobs match sweep "${opts.sweep}" and --only "${opts.only}"`);

  // Cut every job's seed range into chunks. Workers pull the next chunk as they finish one.
  const queue = [];
  for (const job of jobs) {
    for (let from = opts.seedStart; from < opts.seedStart + opts.games; from += opts.chunk) {
      queue.push({ job, from, to: Math.min(from + opts.chunk, opts.seedStart + opts.games) });
    }
  }
  const totalTasks = queue.length;
  const results = Object.fromEntries(jobs.map((job) => [job.id, {}]));
  const started = Date.now();
  let finished = 0;
  console.error(`${jobs.length} jobs, ${opts.games} games each, ${totalTasks} chunks, ${opts.workers} workers`);

  await new Promise((resolve, reject) => {
    const workers = [];
    const feed = (worker) => {
      const task = queue.shift();
      if (task) worker.postMessage(task);
      else if (finished === totalTasks) resolve();
    };
    const progress = setInterval(() => {
      const seconds = (Date.now() - started) / 1000;
      const eta = finished ? Math.round((seconds / finished) * (totalTasks - finished)) : "?";
      console.error(`  ${finished}/${totalTasks} chunks, ${Math.round(seconds)}s elapsed, about ${eta}s to go`);
    }, 5000);
    for (let i = 0; i < Math.min(opts.workers, totalTasks); i++) {
      const worker = new Worker(new URL(import.meta.url));
      workers.push(worker);
      worker.on("message", ({ id, counts }) => {
        results[id] = merge(results[id], counts);
        finished++;
        feed(worker);
      });
      worker.on("error", reject);
      feed(worker);
    }
    // Stop the workers once everything is done.
    const done = setInterval(() => {
      if (finished === totalTasks) {
        clearInterval(done);
        clearInterval(progress);
        workers.forEach((w) => w.terminate());
        resolve();
      }
    }, 100);
  });

  let commit = "unknown";
  try {
    commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    // Not a git checkout, or no git. The commit is only for the record.
  }
  const meta = {
    sweep: opts.sweep, only: opts.only, games: opts.games, seedStart: opts.seedStart, chunk: opts.chunk, workers: opts.workers,
    node: process.version, arch: process.arch, platform: process.platform, commit, elapsedSeconds: Math.round((Date.now() - started) / 100) / 10,
  };
  const sortedResults = Object.fromEntries(Object.keys(results).sort().map((id) => [id, canonical(results[id])]));
  writeFileSync(opts.out, JSON.stringify({ meta, results: sortedResults }, null, 2) + "\n");
  console.error(`wrote ${opts.out} in ${meta.elapsedSeconds}s`);
}
