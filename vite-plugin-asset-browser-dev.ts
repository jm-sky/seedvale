import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { Plugin, ViteDevServer } from 'vite'

const MODEL_ROOT = 'public/models'
const MODEL_URL_PREFIX = '/models/'

function listGlbFiles(dir: string, base = dir): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      out.push(...listGlbFiles(full, base))
    } else if (name.endsWith('.glb')) {
      const rel = relative(base, full).replace(/\\/g, '/')
      out.push(`${MODEL_URL_PREFIX}${rel}`)
    }
  }
  return out.sort()
}

function notifyModelChange(server: ViteDevServer, file: string): void {
  if (!file.includes('/models/') && !file.includes('\\models\\')) return
  if (!file.endsWith('.glb')) return
  const idx = file.indexOf('models')
  if (idx < 0) return
  const rel = file.slice(idx).replace(/\\/g, '/')
  const url = `/${rel}`
  server.ws.send({ type: 'custom', event: 'asset-browser:model-changed', data: { url } })
}

/** Dev-only: GLB directory listing + HMR when `public/models/**` changes. */
export function assetBrowserDevPlugin(): Plugin {
  return {
    name: 'seedvale-asset-browser-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__asset-browser/models', (_req, res) => {
        try {
          const files = listGlbFiles(MODEL_ROOT)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ files }))
        } catch (err) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: String(err) }))
        }
      })

      server.watcher.add(join(MODEL_ROOT, '**/*.glb'))
      server.watcher.on('change', (file) => notifyModelChange(server, file))
      server.watcher.on('add', (file) => notifyModelChange(server, file))
    },
  }
}
