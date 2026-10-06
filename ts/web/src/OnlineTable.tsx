import type { ClientMessage } from "@liars-dice/engine";
import { useState } from "react";
import type { RemoteTable } from "./remoteTable.ts";
import { useRemoteSession } from "./remoteSession.ts";
import { TableView } from "./Table.tsx";
import { DEFAULT_THEME, type ThemeId } from "./theme.ts";

/**
 * A game on the server: the table over a remote session. Whoever owns the connection feeds its messages to `table` and
 * passes `send`, so this knows nothing about sockets. Leaving gives the seat up at once: the server hands it to a bot,
 * which cannot be undone, so a game that is still on asks first, with Stay as the way in. Once the game is over there
 * is nothing to give up and it just leaves.
 */
export function OnlineTable({
  table,
  send,
  theme = DEFAULT_THEME,
  onQuit,
}: {
  table: RemoteTable;
  send: (message: ClientMessage) => boolean;
  theme?: ThemeId;
  /** Back to the start screen, after the seat has been given up. */
  onQuit: () => void;
}) {
  const session = useRemoteSession(table, send);
  const [asking, setAsking] = useState(false);
  const leave = () => {
    send({ type: "leave" });
    onQuit();
  };
  return (
    <>
      <TableView
        session={session}
        theme={theme}
        onQuit={() => (table.getState().view.winner === null ? setAsking(true) : leave())}
      />
      {asking && (
        <div className="backdrop">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-title"
            className="dialog"
            onKeyDown={(e) => e.key === "Escape" && setAsking(false)}
          >
            <h2 id="leave-title">Leave this game?</h2>
            <p>A bot takes your seat, and you cannot take it back.</p>
            <div className="dialog-buttons">
              <button type="button" className="primary" autoFocus onClick={() => setAsking(false)}>
                Stay
              </button>
              <button type="button" onClick={leave}>
                Leave game
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
