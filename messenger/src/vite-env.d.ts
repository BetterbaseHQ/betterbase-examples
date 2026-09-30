/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Auth server domain (host[:port]) */
  readonly VITE_DOMAIN?: string;
  /** OAuth client ID registered with the accounts service */
  readonly VITE_OAUTH_CLIENT_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
