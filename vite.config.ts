import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import { assetBrowserPlugin } from './vite-plugin-asset-browser'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string }
const rootDir = fileURLToPath(new URL('.', import.meta.url))

function formatBuildDate(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yy = String(date.getFullYear() % 100).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const min = String(date.getMinutes()).padStart(2, '0')
  return `${dd}/${mm}'${yy} ${hh}:${min}`
}

function gitCommitHash(): string {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'unknown'
  }
}

export default defineConfig({
  plugins: [vue(), tailwindcss(), assetBrowserPlugin()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(formatBuildDate(new Date())),
    __GIT_COMMIT__: JSON.stringify(gitCommitHash()),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src/ui-vue', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(rootDir, 'index.html'),
        assetBrowser: resolve(rootDir, 'asset-browser.html'),
      },
    },
  },
  server: {
    port: 5577,
    strictPort: true,
    watch: {
      // No app code imports `.md` files (docs/, README.md, CLAUDE.md, ...) —
      // confirmed by listening on the real dev server's HMR websocket while
      // editing them: every save still pushed a `full-reload` (Tailwind's
      // own automatic source detection treats any non-gitignored project
      // file as a candidate to rescan, root-level ones apparently through a
      // different path that doesn't even set `triggeredBy`). Ignored at the
      // watcher level so no plugin downstream ever sees the change.
      ignored: ['**/*.md'],
    },
  },
  worker: {
    format: 'es',
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
