import type { ChunkTileParams } from './chunkHeightmap'
import type {
  ChunkTileRequest,
  ChunkTileResponse,
  ChunkTileResult,
} from './chunkHeightmapProtocol'

export class HeightmapGenerationCancelledError extends Error {
  constructor() {
    super('Heightmap generation superseded by a newer request')
    this.name = 'HeightmapGenerationCancelledError'
  }
}

// Chunk tiles are small and are constantly requested-then-abandoned as the player
// moves. Terminating and respawning an OS worker thread per abandoned chunk would
// be wasteful and adds latency spikes, so this pool keeps its workers alive for
// its whole lifetime and cancels by discarding the eventual result instead.

export type ChunkWorkerPool = {
  requestChunk(key: string, params: ChunkTileParams): Promise<ChunkTileResult>
  cancel(key: string): void
  dispose(): void
  readonly pendingCount: number
  readonly busyCount: number
}

type ChunkJob = {
  id: number
  key: string
  params: ChunkTileParams
  resolve: (data: ChunkTileResult) => void
  reject: (err: Error) => void
}

function createChunkWorker(): Worker {
  return new Worker(new URL('./chunkHeightmap.worker.ts', import.meta.url), {
    type: 'module',
  })
}

export function defaultChunkWorkerCount(): number {
  const hc = navigator.hardwareConcurrency
  return Math.min(6, Math.max(2, (hc ?? 4) - 1))
}

export function createChunkWorkerPool(size = defaultChunkWorkerCount()): ChunkWorkerPool {
  const workers: Worker[] = []
  const free: Worker[] = []
  const queue: ChunkJob[] = []
  const inflight = new Map<number, ChunkJob>()
  const keyToId = new Map<string, number>()
  let nextId = 0

  function pump(): void {
    while (free.length > 0 && queue.length > 0) {
      const worker = free.pop()!
      const job = queue.shift()!
      inflight.set(job.id, job)
      const request: ChunkTileRequest = { id: job.id, params: job.params }
      worker.postMessage(request)
    }
  }

  function attach(worker: Worker): void {
    worker.onmessage = (event: MessageEvent<ChunkTileResponse>) => {
      const msg = event.data
      const job = inflight.get(msg.id)
      inflight.delete(msg.id)
      free.push(worker)
      if (job) {
        // Only clear keyToId if it still points at this job — a newer request for
        // the same key may already have replaced it.
        if (keyToId.get(job.key) === msg.id) keyToId.delete(job.key)
        if (msg.ok) {
          job.resolve({
            heights: msg.heights,
            floorHeights: msg.floorHeights,
            biomes: msg.biomes,
            bodyScale: msg.bodyScale,
            continentalness: msg.continentalness,
            mountainRidge: msg.mountainRidge,
            vegetation: msg.vegetation,
          })
        } else {
          job.reject(new Error(msg.error))
        }
      }
      // else: job was cancelled while in flight — worker kept computing, result discarded.
      pump()
    }
    worker.onerror = (event) => {
      free.push(worker)
      console.error('[chunkWorkerPool] worker error', event.message)
      pump()
    }
  }

  for (let i = 0; i < size; i++) {
    const worker = createChunkWorker()
    attach(worker)
    workers.push(worker)
    free.push(worker)
  }

  function cancel(key: string): void {
    const id = keyToId.get(key)
    if (id === undefined) return
    keyToId.delete(key)
    const queuedIndex = queue.findIndex((job) => job.id === id)
    if (queuedIndex !== -1) {
      const [job] = queue.splice(queuedIndex, 1)
      job!.reject(new HeightmapGenerationCancelledError())
      return
    }
    const job = inflight.get(id)
    if (job) {
      inflight.delete(id)
      job.reject(new HeightmapGenerationCancelledError())
    }
  }

  function requestChunk(key: string, params: ChunkTileParams): Promise<ChunkTileResult> {
    cancel(key)
    const id = nextId++
    keyToId.set(key, id)
    return new Promise<ChunkTileResult>((resolve, reject) => {
      queue.push({ id, key, params, resolve, reject })
      pump()
    })
  }

  function dispose(): void {
    for (const job of queue) job.reject(new HeightmapGenerationCancelledError())
    queue.length = 0
    for (const job of inflight.values()) job.reject(new HeightmapGenerationCancelledError())
    inflight.clear()
    keyToId.clear()
    for (const worker of workers) worker.terminate()
    workers.length = 0
    free.length = 0
  }

  return {
    requestChunk,
    cancel,
    dispose,
    get pendingCount() {
      return queue.length
    },
    get busyCount() {
      return inflight.size
    },
  }
}

let chunkPool: ChunkWorkerPool | null = null
function getChunkPool(): ChunkWorkerPool {
  if (!chunkPool) chunkPool = createChunkWorkerPool()
  return chunkPool
}

export function requestChunkTile(
  key: string,
  params: ChunkTileParams,
): Promise<ChunkTileResult> {
  return getChunkPool().requestChunk(key, params)
}

export function cancelChunkTile(key: string): void {
  chunkPool?.cancel(key)
}

export function disposeChunkWorkerPool(): void {
  chunkPool?.dispose()
  chunkPool = null
}
