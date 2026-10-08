#!/usr/bin/env bash
# Plays a few whole games against the server image, started the way a careful deployment would start it. CI runs this
# after the smoke test, and so can you, on any machine with podman or docker:
#
#   npm run build:playtest -w @liars-dice/server
#   ts/server/scripts/playtest-container.sh liars-dice-server:test         # the default port, 8787
#   ts/server/scripts/playtest-container.sh liars-dice-server:test 8799
#
# Where the smoke test asks whether the server starts, this asks whether it behaves once people are using it: views stay
# private, players who drop come back, a game that is played reaches its end. The container must then still stop
# cleanly, with exit code 0, after all of that. Set ENGINE=podman to use podman, and PLAYTEST_ARGS to change the games
# (the default is eight rooms from a fixed seed, so a failure can be played again). Needs Node 22 or later.
set -euo pipefail

image="${1:?usage: playtest-container.sh IMAGE [PORT]}"
port="${2:-8787}"
engine="${ENGINE:-docker}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bundle="$here/../dist/playtest.mjs"
name="liars-dice-playtest-$$"

[ -f "$bundle" ] || { echo "fail: $bundle is missing; run: npm run build:playtest -w @liars-dice/server" >&2; exit 1; }

cleanup() { "$engine" rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

"$engine" run -d --name "$name" --read-only --cap-drop=ALL --security-opt no-new-privileges \
  -p "127.0.0.1:${port}:8787" "$image" >/dev/null

for _ in $(seq 1 60); do
  "$engine" logs "$name" 2>&1 | grep -q "listening on" && break
  sleep 1
done
"$engine" logs "$name" 2>&1 | grep -q "listening on" || { echo "fail: the server did not come up" >&2; exit 1; }

# Word splitting is wanted here: PLAYTEST_ARGS is a list of options.
# shellcheck disable=SC2086
node "$bundle" "ws://127.0.0.1:${port}/ws" ${PLAYTEST_ARGS:---rooms 8 --concurrency 4 --seed 1 --leave 0.1 --stall 60}

"$engine" stop -t 10 "$name" >/dev/null
code="$("$engine" inspect "$name" --format '{{.State.ExitCode}}')"
[ "$code" = "0" ] || { echo "fail: stopping it after the games gave exit code $code, not 0" >&2; exit 1; }
echo "ok: stopped cleanly after the games"
