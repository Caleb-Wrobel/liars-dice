import { useState } from "react";
import { Setup } from "./Setup.tsx";
import { Table } from "./Table.tsx";
import type { Config } from "./session.ts";

export function App() {
  // `id` changes on every rematch, which gives the table a fresh game with the same settings.
  const [session, setSession] = useState<{ config: Config; id: number } | null>(null);
  return session === null ? (
    <Setup onStart={(config) => setSession({ config, id: 0 })} />
  ) : (
    <Table
      key={session.id}
      config={session.config}
      onQuit={() => setSession(null)}
      onRematch={(pace) => setSession({ config: { ...session.config, pace }, id: session.id + 1 })}
    />
  );
}
