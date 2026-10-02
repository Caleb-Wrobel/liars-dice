/**
 * Simulation sweeps: batches of bot-versus-bot games whose results are counts that can be added
 * together. Every job is deterministic from its seed range, so a sweep can be split into chunks, run
 * on any number of threads or machines, and merged to the same totals.
 */
import {
  BOT_LEVEL_NAMES,
  Bot,
  CAST,
  Game,
  LADDER,
  advancedRules,
  basicRules,
  compareRanks,
  drawCast,
  evaluate,
  randomBotLevel,
  sameRank,
  seededRng,
  type BotLevel,
  type Personality,
} from "../src/index.ts";

/** A bag of counters. Adding two bags adds the matching counters. */
export type Counts = Record<string, number>;

export type SweepName = "duel" | "tables" | "tells" | "all";

export interface Job {
  /** Unique, and the key its results are stored under. */
  readonly id: string;
  readonly kind: "duel" | "tables" | "tells";
  readonly level?: BotLevel;
  /** A character's id, or "plain" for a bot with no personality. */
  readonly who?: string;
  /** Bots at the table, for table jobs. */
  readonly size?: number;
}

const WHOS = ["plain", ...CAST.map((p) => p.id)];
const TABLE_SIZES = [2, 3, 4, 5]; // the cast has five characters, so a table seats at most five bots

/** Every job in a sweep. */
export function jobsFor(sweep: SweepName): Job[] {
  const duels = (kind: "duel" | "tells"): Job[] =>
    WHOS.filter((who) => kind === "duel" || who !== "plain").flatMap((who) =>
      BOT_LEVEL_NAMES.map((level) => ({ id: `${kind}|${who}|${level}`, kind, who, level })),
    );
  const tables: Job[] = TABLE_SIZES.map((size) => ({ id: `tables|${size}`, kind: "tables", size }));
  switch (sweep) {
    case "duel":
      return duels("duel");
    case "tells":
      return duels("tells");
    case "tables":
      return tables;
    case "all":
      return [...duels("duel"), ...tables, ...duels("tells")];
  }
}

export const merge = (a: Counts, b: Counts): Counts => {
  const sum: Counts = { ...a };
  for (const [key, value] of Object.entries(b)) sum[key] = (sum[key] ?? 0) + value;
  return sum;
};

const personalityOf = (who: string | undefined): Personality | undefined => CAST.find((p) => p.id === who);

const ladderIndex = (rank: Parameters<typeof sameRank>[0]) => LADDER.findIndex((r) => sameRank(r, rank));

/** What one turn of the bot under study looked like, for the tells sweep. */
interface Turn {
  readonly lines: readonly string[];
  /** Ladder index of the claim it faced, -1 when opening. */
  readonly standing: number;
  /** Ladder index of the claim it made, or null if it pulled the cup. */
  readonly claim: number | null;
  /** Whether that claim was true of the dice at the moment it was made. */
  readonly truthful: boolean;
}

/**
 * One two-player game: the bot under study (with `personality`, or plain) against a plain bot of the same
 * level. Seats, who opens and the rule set all vary with the seed, so no side has an edge.
 * Returns whether the bot under study won.
 */
function duel(seed: number, level: BotLevel, personality: Personality | undefined, observe?: (turn: Turn) => void): boolean {
  const studySeat = seed % 2;
  const opener = (seed >> 1) % 2;
  const rules = (seed >> 2) % 2 === 1 ? advancedRules() : basicRules();
  const game = new Game(["A", "B"], rules, seededRng(seed), opener);
  const study = new Bot({ rng: seededRng(1000 + seed * 2), level, personality });
  const plain = new Bot({ rng: seededRng(2000 + seed * 2), level });
  const bots = studySeat === 0 ? [study, plain] : [plain, study];
  for (let turn = 0; turn < 6000 && game.winner === null; turn++) {
    const mine = game.current === studySeat;
    const standing = ladderIndex(game.claim);
    const lines: string[] = [];
    const pulled = bots[game.current]!.play(game, (line) => lines.push(line));
    if (mine && observe) {
      observe({
        lines,
        standing,
        claim: pulled ? null : ladderIndex(game.claim),
        truthful: !pulled && compareRanks(evaluate(game.dice), game.claim) >= 0,
      });
    }
  }
  return game.winner === studySeat;
}

const raiseBucket = (rungs: number) => (rungs <= 1 ? "1" : rungs === 2 ? "2" : rungs <= 4 ? "3-4" : "5+");

/**
 * One game at a table of `size` bots: characters drawn from the cast, each at a random level, under a
 * random rule set, opening from a random seat. Counts a seat and, for the winner, a win, per character,
 * per level and per character-and-level.
 */
function table(seed: number, size: number): Counts {
  const rng = seededRng(seed * 7919 + 13);
  const characters = drawCast(size, rng);
  const levels = characters.map(() => randomBotLevel(rng));
  const rules = rng() < 0.5 ? basicRules() : advancedRules();
  const opener = Math.floor(rng() * size);
  const game = new Game(characters.map((p) => p.name), rules, seededRng(seed * 31 + 1), opener);
  const bots = characters.map((p, i) => new Bot({ rng: seededRng(seed * 1009 + i * 13 + 5), level: levels[i], personality: p }));
  for (let turn = 0; turn < 20_000 && game.winner === null; turn++) bots[game.current]!.play(game);

  const counts: Counts = { games: 1 };
  if (game.winner === null) return { ...counts, unfinished: 1 };
  characters.forEach((p, i) => {
    const won = i === game.winner ? 1 : 0;
    for (const key of [p.id, `${p.id}|${levels[i]}`, `level:${levels[i]}`]) {
      counts[`seat|${key}`] = (counts[`seat|${key}`] ?? 0) + 1;
      counts[`win|${key}`] = (counts[`win|${key}`] ?? 0) + won;
    }
  });
  return counts;
}

/** Runs one job over the seeds from `seedFrom` up to but not including `seedTo`. */
export function runJob(job: Job, seedFrom: number, seedTo: number): Counts {
  let counts: Counts = {};
  const add = (key: string, by = 1) => void (counts[key] = (counts[key] ?? 0) + by);
  for (let seed = seedFrom; seed < seedTo; seed++) {
    if (job.kind === "tables") {
      counts = merge(counts, table(seed, job.size!));
    } else if (job.kind === "duel") {
      add("games");
      if (duel(seed, job.level!, personalityOf(job.who))) add("wins");
    } else {
      add("games");
      if (
        duel(seed, job.level!, personalityOf(job.who), (turn) => {
          if (turn.claim === null) return;
          add("claims");
          if (turn.truthful) add("claimsTrue");
          if (turn.lines.some((line) => line.startsWith("keeps the dice"))) {
            add("keeps");
            if (turn.truthful) add("keepsTrue");
          }
          if (turn.standing >= 0) {
            const bucket = raiseBucket(turn.claim - turn.standing);
            add(`raise|${bucket}`);
            if (turn.truthful) add(`raiseTrue|${bucket}`);
          }
        })
      ) {
        add("wins");
      }
    }
  }
  return counts;
}
