import type { ClientMessage } from "@liars-dice/engine";
import { useState } from "react";
import { OnlineGame } from "./OnlineGame.tsx";
import { joinCodeFromSearch, serverUrl, type OnlineEntry } from "./online.ts";
import { clearSeat, loadSeat } from "./roomStore.ts";
import { Setup } from "./Setup.tsx";
import { Table } from "./Table.tsx";
import type { Config } from "./session.ts";
import { loadTheme, type ThemeId } from "./theme.ts";

type Screen =
  | { kind: "setup" }
  // `id` changes on every rematch, which gives the table a fresh game with the same settings.
  | { kind: "local"; config: Config; id: number }
  // With no request there is a token instead: a place kept before a reload, to claim back.
  | { kind: "online"; request: ClientMessage | null; token?: string; theme: ThemeId; id: number };

/** The share link has done its work once it has been used; leaving it would fill the form again next time. */
function forgetShareLink() {
  window.history.replaceState(null, "", window.location.pathname + window.location.hash);
}

export function App() {
  const url = serverUrl();
  const [screen, setScreen] = useState<Screen>(() => {
    // A reload in the middle of a room goes back into it, unless the page was opened from a link to a different one.
    const seat = url !== null && joinCodeFromSearch(window.location.search) === null ? loadSeat() : null;
    return seat === null
      ? { kind: "setup" }
      : { kind: "online", request: null, token: seat.token, theme: loadTheme(), id: 0 };
  });
  /** Back to the start, and the place in the room is let go: it was given up, or it is no longer wanted. */
  const leave = () => {
    clearSeat();
    setScreen({ kind: "setup" });
  };

  if (screen.kind === "local") {
    return (
      <Table
        key={screen.id}
        config={screen.config}
        onQuit={() => setScreen({ kind: "setup" })}
        onRematch={(pace) => setScreen({ ...screen, config: { ...screen.config, pace }, id: screen.id + 1 })}
      />
    );
  }
  if (screen.kind === "online" && url !== null) {
    return (
      <OnlineGame
        key={screen.id}
        url={url}
        request={screen.request}
        {...(screen.token === undefined ? {} : { token: screen.token })}
        theme={screen.theme}
        onQuit={leave}
      />
    );
  }

  const go = (request: ClientMessage, theme: ThemeId) => {
    clearSeat(); // a new request is a new visit, and an old place must not come back if it fails
    forgetShareLink();
    setScreen({ kind: "online", request, theme, id: Date.now() });
  };
  const initialCode = joinCodeFromSearch(window.location.search);
  const online: OnlineEntry | undefined =
    url === null
      ? undefined
      : {
          create: ({ name, seats, lives, advanced, theme }) => go({ type: "create", name, seats, lives, advanced }, theme),
          join: ({ name, code, theme }) => go({ type: "join", code, name }, theme),
          ...(initialCode === null ? {} : { initialCode }),
        };
  return <Setup onStart={(config) => setScreen({ kind: "local", config, id: 0 })} {...(online ? { online } : {})} />;
}
