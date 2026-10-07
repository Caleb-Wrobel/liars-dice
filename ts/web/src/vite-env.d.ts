/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * The game server: a WebSocket address (`ws://localhost:8787/ws`), or a path on the page's own host (`/ws`). Left
   * unset, the page offers only play on this device.
   */
  readonly VITE_SERVER_URL?: string;
}
