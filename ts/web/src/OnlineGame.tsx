import type { ClientMessage } from "@liars-dice/engine";
import { useEffect, useRef, type ReactNode } from "react";
import type { SocketLike } from "./connection.ts";
import { Lobby } from "./Lobby.tsx";
import { OnlineTable } from "./OnlineTable.tsx";
import type { Phase } from "./roomClient.ts";
import type { ThemeId } from "./theme.ts";
import { useRoom } from "./useRoom.ts";

/** What to say when a visit ends, in words, with the server's own where it gave a reason. */
const ENDINGS: Partial<Record<Phase, (error: string | null) => { title: string; text: string }>> = {
  refused: (error) => ({ title: "Could not join", text: error ?? "The server turned the request down." }),
  replaced: () => ({
    title: "Opened somewhere else",
    text: "This game was opened in another window, so this one has stopped. Go back to the start to play from here.",
  }),
  lost: () => ({
    title: "Disconnected",
    text: "The connection was gone for too long, so your seat was given up. A bot has taken it.",
  }),
  outdated: () => ({
    title: "The game has been updated",
    text: "Reload the page to carry on. The server and this page no longer speak the same version.",
  }),
  failed: () => ({ title: "Could not reach the game server", text: "Check your connection and try again." }),
  left: () => ({ title: "You left the room", text: "Go back to the start to play again." }),
};

/** A screen that says what happened and offers the way back. A screen reader starts at its heading. */
function Notice({ title, text, children }: { title: string; text?: string; children?: ReactNode }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return (
    <main className="setup notice">
      <h1 tabIndex={-1} ref={heading}>
        {title}
      </h1>
      {text && <p>{text}</p>}
      {children}
    </main>
  );
}

/**
 * A visit to a room, from the request to the end: connecting, the lobby, the table, or a notice for each way it can
 * end. It owns the connection through `useRoom`. `open` is only for tests, which stand in a socket of their own.
 */
export function OnlineGame({
  url,
  request,
  theme,
  onQuit,
  open,
  token,
}: {
  url: string;
  /** The create or join to send, or null when `token` is a place from before a reload to claim back. */
  request: ClientMessage | null;
  theme: ThemeId;
  /** Back to the start screen. */
  onQuit: () => void;
  open?: (url: string) => SocketLike;
  token?: string;
}) {
  const { client, state, send } = useRoom(url, request, { ...(open ? { open } : {}), ...(token === undefined ? {} : { token }) });
  const banner = state.reconnecting ? (
    <p role="status" className="banner">
      Connection lost. Trying to get back…
    </p>
  ) : null;

  switch (state.phase) {
    case "connecting":
    case "joining":
      return (
        <Notice title="Connecting…">
          <p role="status">{request === null ? "Getting back into your room." : "Reaching the game server."}</p>
          <button type="button" onClick={onQuit}>
            Cancel
          </button>
        </Notice>
      );
    case "lobby":
      return (
        <>
          {banner}
          <Lobby
            state={state}
            onStart={() => client.start()}
            onLeave={() => {
              client.leave();
              onQuit();
            }}
          />
        </>
      );
    case "playing":
      return (
        <>
          {banner}
          <OnlineTable table={state.table!} send={send} theme={theme} onQuit={onQuit} />
        </>
      );
    default: {
      const ending = ENDINGS[state.phase]!(state.error);
      return (
        <Notice title={ending.title} text={ending.text}>
          <button type="button" className="primary" onClick={onQuit}>
            Back to the start
          </button>
        </Notice>
      );
    }
  }
}
