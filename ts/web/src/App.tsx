import type { ClientMessage } from "@liars-dice/engine";
import { useState } from "react";
import { OnlineGame } from "./OnlineGame.tsx";
import { joinCodeFromSearch, serverUrl, type OnlineEntry } from "./online.ts";
import { Setup } from "./Setup.tsx";
import { Table } from "./Table.tsx";
import type { Config } from "./session.ts";
import type { ThemeId } from "./theme.ts";

type Screen =
  | { kind: "setup" }
  // `id` changes on every rematch, which gives the table a fresh game with the same settings.
  | { kind: "local"; config: Config; id: number }
  | { kind: "online"; request: ClientMessage; theme: ThemeId; id: number };

/** The share link has done its work once it has been used; leaving it would fill the form again next time. */
function forgetShareLink() {
  window.history.replaceState(null, "", window.location.pathname + window.location.hash);
}

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: "setup" });
  const url = serverUrl();

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
        theme={screen.theme}
        onQuit={() => setScreen({ kind: "setup" })}
      />
    );
  }

  const go = (request: ClientMessage, theme: ThemeId) => {
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
