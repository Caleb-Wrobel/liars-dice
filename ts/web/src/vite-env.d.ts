/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** The game server's WebSocket address. Left unset, the page offers only play on this device. */
  readonly VITE_SERVER_URL?: string;
}
