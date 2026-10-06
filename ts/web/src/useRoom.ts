import type { ClientMessage } from "@liars-dice/engine";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Connection, type SocketLike } from "./connection.ts";
import { RoomClient } from "./roomClient.ts";

/**
 * A room on the server, for as long as the component using it is on screen: the connection, the room client that
 * follows it, and a `send` for the screens. The connection is opened in an effect and closed when the effect ends.
 * React may run an effect twice on purpose in development, so the first run's handlers are cut off before it is
 * closed: its goodbye must not reach the room client, which would take it for the end of the visit.
 */
export function useRoom(url: string, request: ClientMessage, open?: (url: string) => SocketLike) {
  const connection = useRef<Connection | null>(null);
  const send = (message: ClientMessage) => connection.current?.send(message) ?? false;
  const [client] = useState(() => new RoomClient(send, request));

  useEffect(() => {
    let live = true;
    const opened = new Connection({
      url,
      ...(open ? { open } : {}),
      onMessage: (message) => live && client.receive(message),
      onStatus: (status) => live && client.setStatus(status),
    });
    connection.current = opened;
    return () => {
      live = false;
      opened.close();
      connection.current = null;
    };
  }, [client, url, open]);

  const state = useSyncExternalStore(client.subscribe, client.getState);
  return { client, state, send };
}
