# Deploying the game

The game is two pieces. The **site** is static files, served by GitHub Pages as it always has been. The **server** is
a program that has to stay running, because a game between people lives in its memory. It runs as a container image
behind a proxy that gives it a name and TLS. Solo and hot-seat play need no server at all, so the site works without it.

Nothing here names a machine: the names below (`example.org`) are placeholders, and the real ones are set where the
thing runs, never in this repository.

## The server image

CI builds it on every push and proves it works. On `main`, where the repository variable `PUBLISH_IMAGES` is `true`, it
also publishes it for amd64 and arm64 as `ghcr.io/<owner>/liars-dice-server` (tags `latest` and `sha-<commit>`).

To build it yourself, from the repository root:

```
podman build -f ts/server/Containerfile -t liars-dice-server .
```

It is one JavaScript file on Node, run as an unprivileged user. It keeps nothing on disk and logs only where it is
listening, so it can run with a read-only filesystem and no capabilities:

```
podman run -d --name liars-dice --read-only --cap-drop=ALL --security-opt no-new-privileges \
  -p 127.0.0.1:8787:8787 -e ALLOWED_ORIGINS=https://game.example.org liars-dice-server
```

Publishing the port on `127.0.0.1` keeps the container behind the proxy. The settings come from the environment:

| Setting | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | The port to listen on. |
| `HOST` | `127.0.0.1` (`0.0.0.0` in the image) | The address to listen on. The image listens on every interface so that a proxy beside it can reach it. |
| `WS_PATH` | `/ws` | The URL path that speaks the game's protocol. |
| `ALLOWED_ORIGINS` | none | The websites whose pages may connect, comma-separated, written as a browser writes them (`https://example.org`: no slash, no path, no wildcard). With none, every browser is refused. |

A setting it cannot use stops the start with a message that names it.

## The proxy

Any proxy that passes WebSockets through will do. With Caddy, giving the server a name and TLS is:

```
game.example.org {
    reverse_proxy /ws* 127.0.0.1:8787
}
```

The browser's `Origin` header must reach the server unchanged, which it does by default; the server checks it against
`ALLOWED_ORIGINS`. List **every** address the site is served from, including any old ones that still work.

## The site

The site finds the server through the build's `VITE_SERVER_URL`. For the public site, set the repository variable
`GAME_SERVER_URL` to `wss://game.example.org/ws` on the repository that serves it, and the Pages build picks it up.
Unset, the site offers only play on this device. The address is public by nature, as it ends up in the page.

If the site and the server share a host, set it to a path instead, `/ws`, and the page connects to its own origin,
whatever that is.

## Releasing

Update the server first, then merge to `main` to publish the site. A page that is newer than the server it meets
shows "The game has been updated" instead of misbehaving, but there is no reason to leave a window for it.

## Trying it before you ship it

On a machine on your network with podman, run the image with the page's address allowed, and run the page against it:

```
podman run -d --name liars-dice -p 8787:8787 -e ALLOWED_ORIGINS=http://<this-machine>:5173 liars-dice-server
VITE_SERVER_URL=ws://<this-machine>:8787/ws npm run dev:lan      # in ts/, then open http://<this-machine>:5173
```

Open it from two devices and play. `ts/server/scripts/smoke-container.sh <image>` runs the same check CI does, and
`ts/server/scripts/smoke.mjs ws://<this-machine>:8787/ws` asks any running server to make a room. On one machine,
`npm run dev:server` in `ts/` builds and starts the server for the Vite dev server on `localhost`.

## What it does not do

A restart ends the games in progress: a room lives in memory only, and there is no database. A player who drops has
sixty seconds to come back before a bot takes the seat. The server limits each connection's message size and rate, and
has no limits per address, so put any per-address limiting in the proxy.
