/**
 * Starts the game server: the hub on a WebSocket, set up from the environment (see `config.ts`). Everything of
 * substance is in the pieces it joins together; this file only joins them, says where it is listening, and closes
 * cleanly when asked to stop. It says nothing about who connects: no addresses, names or codes are logged.
 */
import { ConfigError, readConfig, type ServerConfig } from "./config.ts";
import { Hub } from "./hub.ts";
import { realClock } from "./match.ts";
import { secureRng } from "./random.ts";
import { listen, type SocketServer } from "./socket.ts";

let config: ServerConfig;
try {
  config = readConfig(process.env);
} catch (error) {
  if (!(error instanceof ConfigError)) throw error;
  console.error(`liars-dice server: ${error.message}`);
  process.exit(1);
}

const hub = new Hub({ rng: secureRng, clock: realClock });

// Stopping is set up before the server starts listening, and so before the line that says it is: that line is what a
// supervisor, or a test, waits for before it sends a stop signal, and a signal that came before this was in place
// would kill the process outright instead of closing it cleanly. One that comes while it is still starting finds no
// server yet and just exits.
let server: SocketServer | undefined;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void (server?.close() ?? Promise.resolve()).then(() => process.exit(0));
  });
}

server = await listen(hub, {
  port: config.port,
  host: config.host,
  path: config.path,
  allowedOrigins: config.allowedOrigins,
});

console.log(`liars-dice server listening on ${config.host}:${server.port}${config.path}`);
if (config.allowedOrigins.length === 0) {
  console.warn("ALLOWED_ORIGINS is empty, so no browser can connect. Set it to the website's origin, such as https://example.org.");
}
