/**
 * What the deployment decides, read from the environment. The code holds no address of any machine: where the server
 * listens and which websites may open a socket to it come in from outside, so the same build runs anywhere and the
 * public repository says nothing about where. See docs/multiplayer.md.
 */

import { BOT_PACE_MS, type BotPace } from "@liars-dice/engine";
import { DEFAULT_PACE } from "./match.ts";

export interface ServerConfig {
  readonly port: number;
  readonly host: string;
  /** The URL path that speaks the game's protocol. */
  readonly path: string;
  /** Websites whose pages may connect, each written as a browser writes an origin. Empty refuses every browser. */
  readonly allowedOrigins: readonly string[];
  /** How fast bots move. Slow is for people; a faster one is for a test that wants whole games in less time. */
  readonly botPace: BotPace;
}

/** A setting that cannot be used, said in words for whoever is starting the server. */
export class ConfigError extends Error {}

export const DEFAULT_PORT = 8787;
/** Only this machine, so a server behind a proxy is not also reachable round it. A deployment that wants more says so. */
export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PATH = "/ws";

function readPort(text: string | undefined): number {
  if (text === undefined || text === "") return DEFAULT_PORT;
  const port = Number(text);
  if (!/^\d{1,5}$/.test(text) || port > 65535) throw new ConfigError(`PORT must be a whole number from 0 to 65535, not "${text}"`);
  return port;
}

function readPath(text: string | undefined): string {
  if (text === undefined || text === "") return DEFAULT_PATH;
  if (!text.startsWith("/")) throw new ConfigError(`WS_PATH must start with a slash, not "${text}"`);
  return text;
}

/**
 * `ALLOWED_ORIGINS` is a comma-separated list. Each entry has to be exactly what a browser sends, such as
 * "https://example.org" or "http://localhost:5173": a scheme, a host and perhaps a port, with no path and no trailing
 * slash. There is no wildcard: the point of the list is that a page on any other site is turned away.
 */
function readOrigins(text: string | undefined): readonly string[] {
  if (text === undefined) return [];
  const origins = text
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
  for (const entry of origins) {
    let origin: string | null = null;
    try {
      origin = new URL(entry).origin;
    } catch {
      // not a URL at all; reported below
    }
    if (origin !== entry) {
      throw new ConfigError(
        `ALLOWED_ORIGINS has "${entry}", which is not an origin: write a scheme, a host and perhaps a port, such as https://example.org, with no slash or path`,
      );
    }
  }
  return origins;
}

const PACES = Object.keys(BOT_PACE_MS) as BotPace[];

function readPace(text: string | undefined): BotPace {
  if (text === undefined || text === "") return DEFAULT_PACE;
  if (!(PACES as string[]).includes(text)) throw new ConfigError(`BOT_PACE must be one of ${PACES.join(", ")}, not "${text}"`);
  return text as BotPace;
}

export function readConfig(env: Readonly<Record<string, string | undefined>>): ServerConfig {
  return {
    port: readPort(env.PORT),
    host: env.HOST === undefined || env.HOST === "" ? DEFAULT_HOST : env.HOST,
    path: readPath(env.WS_PATH),
    allowedOrigins: readOrigins(env.ALLOWED_ORIGINS),
    botPace: readPace(env.BOT_PACE),
  };
}
