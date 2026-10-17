/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_ENV?: 'dev' | 'test' | 'prod';
  readonly VITE_ENABLE_VISION?: 'true' | 'false';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
