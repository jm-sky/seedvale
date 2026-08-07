import type { Heightmap, HeightmapParams } from './generateHeightmap'
import type {
  HeightmapWorkerRequest,
  HeightmapWorkerResponse,
} from './heightmapWorkerProtocol'
import { buildHeightmapFromData } from './generateHeightmap'

export class HeightmapGenerationCancelledError extends Error {
  constructor() {
    super('Heightmap generation superseded by a newer request')
    this.name = 'HeightmapGenerationCancelledError'
  }
}

type PendingJob = {
  id: number
  params: HeightmapParams
  resolve: (heightmap: Heightmap) => void
  reject: (err: Error) => void
}

function createWorker(): Worker {
  return new Worker(new URL('./heightmap.worker.ts', import.meta.url), {
    type: 'module',
  })
}

/**
 * Owns heightmap-generation worker(s). `size` is 1 today — there's no
 * parallel-region use case until chunk streaming exists. Growing this to N
 * later means replacing the "terminate on supersede" dispatch below with a
 * real job queue across `size` persistent workers (see SimonDev's
 * WorkerThreadPool in docs/refs/ProceduralTerrain_Part10 for the shape);
 * `generate`/`dispose` stay the same either way.
 */
function createHeightmapWorkerPool(size: number) {
  if (size !== 1) {
    throw new Error('heightmapWorkerPool: only size=1 is implemented today')
  }

  let worker: Worker | null = null
  let current: PendingJob | null = null
  let nextId = 0

  function attach(w: Worker): void {
    w.onmessage = (event: MessageEvent<HeightmapWorkerResponse>) => {
      const msg = event.data
      if (!current || msg.id !== current.id) return // stale/foreign — ignore
      const job = current
      current = null
      if (msg.ok) {
        job.resolve(
          buildHeightmapFromData(job.params, {
            heights: msg.heights,
            floorHeights: msg.floorHeights,
            biomes: msg.biomes,
            bodyScale: msg.bodyScale,
          }),
        )
      } else {
        job.reject(new Error(msg.error))
      }
    }
    w.onerror = (event) => {
      const job = current
      current = null
      worker?.terminate()
      worker = null
      job?.reject(new Error(`Heightmap worker error: ${event.message}`))
    }
  }

  function generate(params: HeightmapParams): Promise<Heightmap> {
    const id = nextId++
    if (current) {
      // Only one job runs at a time today: cancel the in-flight computation
      // outright instead of letting it finish unused — saves CPU on rapid
      // successive seed/resolution changes, and structurally guarantees the
      // old worker can never deliver a stale response (there's no old worker
      // left).
      current.reject(new HeightmapGenerationCancelledError())
      worker?.terminate()
      worker = null
      current = null
    }
    if (!worker) {
      worker = createWorker()
      attach(worker)
    }
    return new Promise<Heightmap>((resolve, reject) => {
      current = { id, params, resolve, reject }
      const request: HeightmapWorkerRequest = { id, params }
      worker!.postMessage(request)
    })
  }

  function dispose(): void {
    current?.reject(new HeightmapGenerationCancelledError())
    current = null
    worker?.terminate()
    worker = null
  }

  return { generate, dispose }
}

const pool = createHeightmapWorkerPool(1)

export function generateHeightmapAsync(params: HeightmapParams): Promise<Heightmap> {
  return pool.generate(params)
}

export function disposeHeightmapWorker(): void {
  pool.dispose()
}
