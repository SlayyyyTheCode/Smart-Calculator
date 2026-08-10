/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** WebSocket URL of the Evolu relay. Holds ciphertext only. */
  readonly VITE_RELAY_URL?: string;
  /** HTTP base URL of the pairing broker. Relays a public key and a ciphertext. */
  readonly VITE_PAIRING_BROKER?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
