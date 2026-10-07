// Asks a running game server to start a room and checks that it answers with a room code. Plain Node, 22 or later, and
// no dependencies, so it runs against a container as easily as against a server on this machine:
//
//   node ts/server/scripts/smoke.mjs ws://127.0.0.1:8787/ws
//
// It exits 0 when the server made a room, 1 when it did not (and says why), and 2 when it was not told where to look.
// It sends no `Origin`, as a script is not a browser, so it gets in however the allowed websites are set. It waits ten
// seconds for an answer, or SMOKE_TIMEOUT_MS milliseconds if that is set.

const url = process.argv[2];
if (!url) {
  console.error("usage: node smoke.mjs <ws://host:port/path>");
  process.exit(2);
}

const fail = (why) => {
  console.error(`fail: ${why}`);
  process.exit(1);
};

// The protocol version this script speaks. A server that speaks another refuses it, and the message says so.
const PROTOCOL_VERSION = 1;

const waitMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 10_000);
const timer = setTimeout(() => fail(`no answer within ${waitMs / 1000} seconds`), waitMs);
const socket = new WebSocket(url);
socket.onopen = () => socket.send(JSON.stringify({ v: PROTOCOL_VERSION, type: "create", name: "Smoke", seats: 2 }));
socket.onmessage = (event) => {
  let reply;
  try {
    reply = JSON.parse(String(event.data));
  } catch {
    return fail("the server's answer was not JSON");
  }
  if (reply.type === "joined" && /^[BCDFGHJKLMNPQRSTVWXZ]{4}$/.test(reply.code)) {
    clearTimeout(timer);
    console.log(`ok: the server made room ${reply.code}`);
    process.exit(0);
  }
  fail(`unexpected answer: ${JSON.stringify(reply).slice(0, 200)}`);
};
socket.onerror = () => fail(`could not reach ${url}`);
socket.onclose = () => fail("the connection closed before the server answered");
