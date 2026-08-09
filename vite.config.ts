import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8')) as { version: string }

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
  plugins: [vue(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(formatBuildDate(new Date())),
    __GIT_COMMIT__: JSON.stringify(gitCommitHash()),
  },
  server: {
    port: 5577,
    strictPort: true,
  },
  worker: {
    format: 'es',
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
