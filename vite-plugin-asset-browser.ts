import { readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { ASSET_BROWSER_MODEL_MANIFEST } from './src/tools/assetBrowser/modelManifest'
import type { Plugin, ViteDevServer } from 'vite'

const MODEL_ROOT = 'public/models'
const MODEL_URL_PREFIX = '/models/'

export function listGlbModelUrls(dir: string, base = dir): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      out.push(...listGlbModelUrls(full, base))
    } else if (name.endsWith('.glb')) {
      const rel = relative(base, full).replace(/\\/g, '/')
      out.push(`${MODEL_URL_PREFIX}${rel}`)
    }
  }
  return out.sort()
}

function manifestBody(): string {
  return JSON.stringify({ files: listGlbModelUrls(MODEL_ROOT) })
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

/**
 * Asset alignment browser support:
 * - dev: serves model manifest + HMR when GLBs change
 * - build: writes static manifest into dist for production
 */
export function assetBrowserPlugin(): Plugin {
  let outDir = 'dist'

  return {
    name: 'seedvale-asset-browser',
    configResolved(config) {
      outDir = config.build.outDir
    },
    configureServer(server) {
      server.middlewares.use(ASSET_BROWSER_MODEL_MANIFEST, (_req, res) => {
        try {
          res.setHeader('Content-Type', 'application/json')
          res.end(manifestBody())
        } catch (err) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: String(err) }))
        }
      })

      server.watcher.add(join(MODEL_ROOT, '**/*.glb'))
      server.watcher.on('change', (file) => notifyModelChange(server, file))
      server.watcher.on('add', (file) => notifyModelChange(server, file))
    },
    closeBundle() {
      writeFileSync(join(outDir, 'asset-browser-models.json'), manifestBody())
    },
  }
}
