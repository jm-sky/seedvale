import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 5577,
    strictPort: true,
  },
  worker: {
    format: 'es',
  },
})
