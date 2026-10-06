import type { ClientMessage } from "@liars-dice/engine";
import type { RemoteTable } from "./remoteTable.ts";
import { useRemoteSession } from "./remoteSession.ts";
import { TableView } from "./Table.tsx";
import { DEFAULT_THEME, type ThemeId } from "./theme.ts";

/**
 * A game on the server: the table over a remote session. Whoever owns the connection feeds its messages to `table` and
 * passes `send`, so this knows nothing about sockets. Leaving gives the seat up at once: the server hands it to a bot,
 * which is what "Leave game" says it will do.
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
  return (
    <TableView
      session={session}
      theme={theme}
      onQuit={() => {
        send({ type: "leave" });
        onQuit();
      }}
    />
  );
}
