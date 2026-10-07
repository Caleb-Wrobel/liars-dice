import type { ClientMessage } from "@liars-dice/engine";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Connection, type SocketLike } from "./connection.ts";
import { RoomClient } from "./roomClient.ts";
import { clearSeat, saveSeat } from "./roomStore.ts";

/**
 * A room on the server, for as long as the component using it is on screen: the connection, the room client that
 * follows it, and a `send` for the screens. The connection is opened in an effect and closed when the effect ends.
 * React may run an effect twice on purpose in development, so the first run's status reports are cut off before it is
 * closed: its goodbye must not reach the room client, which would take it for the end of the visit.
 *
 * The player's place is kept in the tab once the server has confirmed it, so a reload can claim it back, and let go
 * when the visit ends. With a `token` and no request the visit is a resume of a place kept that way.
 */
export function useRoom(
  url: string,
  request: ClientMessage | null,
  options: { open?: (url: string) => SocketLike; token?: string } = {},
) {
  const { open, token } = options;
  const connection = useRef<Connection | null>(null);
  const send = (message: ClientMessage) => connection.current?.send(message) ?? false;
  const [client] = useState(() => new RoomClient(send, request));

  useEffect(() => {
    let live = true;
    const opened = new Connection({
      url,
      ...(open ? { open } : {}),
      ...(token === undefined ? {} : { token }),
      onMessage: (message) => client.receive(message), // a closed connection delivers nothing more
      onStatus: (status) => live && client.setStatus(status), // but it reports that it closed, which must not end the visit
    });
    connection.current = opened;
    return () => {
      live = false;
      opened.close();
      connection.current = null;
    };
  }, [client, url, open, token]);

  const state = useSyncExternalStore(client.subscribe, client.getState);
  // Keep the place while the visit lasts, and let it go when it ends, however it ends.
  useEffect(() => {
    if ((state.phase === "lobby" || state.phase === "playing") && state.code !== null) {
      const secret = connection.current?.token;
      if (secret !== undefined) saveSeat({ token: secret, code: state.code });
    } else if (state.phase !== "connecting" && state.phase !== "joining") {
      clearSeat();
    }
  }, [state.phase, state.code]);
  return { client, state, send };
}
