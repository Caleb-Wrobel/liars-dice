#!/usr/bin/env bash
# Starts the server image the way a careful deployment would, proves it works, and stops it. CI runs this before it
# publishes anything, and so can you, on any machine with podman or docker:
#
#   ts/server/scripts/smoke-container.sh liars-dice-server:test                  # this machine's architecture
#   ts/server/scripts/smoke-container.sh liars-dice-server:test linux/arm64 8788   # another, if it can be emulated
#
# It checks that the server comes up under a read-only filesystem with no capabilities, makes a room, stops cleanly on
# a stop signal (exit code 0), and that a setting it cannot use stops the start with exit code 1. Set ENGINE=podman to
# use podman. Needs Node 22 or later, for the smoke script.
set -euo pipefail

image="${1:?usage: smoke-container.sh IMAGE [PLATFORM] [PORT]}"
platform="${2:-}"
port="${3:-8787}"
engine="${ENGINE:-docker}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
name="liars-dice-smoke-$$"
platform_flag=()
[ -n "$platform" ] && platform_flag=(--platform "$platform")

cleanup() { "$engine" rm -f "$name" >/dev/null 2>&1 || true; }
trap cleanup EXIT

"$engine" run -d --name "$name" "${platform_flag[@]}" --read-only --cap-drop=ALL --security-opt no-new-privileges \
  -p "127.0.0.1:${port}:8787" "$image" >/dev/null

for _ in $(seq 1 60); do
  "$engine" logs "$name" 2>&1 | grep -q "listening on" && break
  sleep 1
done
"$engine" logs "$name" 2>&1 | tail -3
"$engine" logs "$name" 2>&1 | grep -q "listening on" || { echo "fail: the server did not come up" >&2; exit 1; }

node "$here/smoke.mjs" "ws://127.0.0.1:${port}/ws"

"$engine" stop -t 10 "$name" >/dev/null
code="$("$engine" inspect "$name" --format '{{.State.ExitCode}}')"
[ "$code" = "0" ] || { echo "fail: stopping it gave exit code $code, not 0" >&2; exit 1; }
echo "ok: stopped cleanly"

if "$engine" run --rm "${platform_flag[@]}" -e PORT=eighty "$image" >/dev/null 2>&1; then
  echo "fail: a port that is not a number was accepted" >&2
  exit 1
fi
echo "ok: a bad setting stops the start"
