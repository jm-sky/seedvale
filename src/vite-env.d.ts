/// <reference types="vite/client" />

/** Injected at build time via `vite.config.ts`'s `define` — package.json version. */
declare const __APP_VERSION__: string
/** Injected at build time — formatted `DD/MM'YY HH:mm`. */
declare const __BUILD_DATE__: string
/** Injected at build time — short git commit hash (`git rev-parse --short HEAD`). */
declare const __GIT_COMMIT__: string

/** Lets plain `tsc` (not just `vue-tsc`) resolve a type for `.vue` imports —
 *  `vue-tsc` (the project's actual build-time checker, see `package.json`'s
 *  `build` script) deep-checks the SFC itself and ignores this shim. */
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}
