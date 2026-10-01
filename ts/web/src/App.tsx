import { useState } from "react";
import { Setup } from "./Setup.tsx";
import { Table } from "./Table.tsx";
import type { Config } from "./session.ts";

export function App() {
  const [config, setConfig] = useState<Config | null>(null);
  return config === null ? (
    <Setup onStart={setConfig} />
  ) : (
    <Table config={config} onQuit={() => setConfig(null)} />
  );
}
