/// <reference types="vite/client" />

/** Injected at build time via `vite.config.ts`'s `define` — package.json version. */
declare const __APP_VERSION__: string
/** Injected at build time — formatted `DD/MM'YY HH:mm`. */
declare const __BUILD_DATE__: string
/** Injected at build time — short git commit hash (`git rev-parse --short HEAD`). */
declare const __GIT_COMMIT__: string
