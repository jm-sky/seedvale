import { defineConfig } from 'vitest/config'

export default defineConfig({
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
