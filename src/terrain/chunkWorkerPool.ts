import type { ChunkTileParams } from './chunkHeightmap'
import type {
  ChunkTileResult,
  ChunkWorkerRequest,
  ChunkWorkerResponse,
  GrassRequestParams,
} from './chunkHeightmapProtocol'
import type { GrassChunkData } from './grassPlacement'

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
  requestTile(key: string, params: ChunkTileParams): Promise<ChunkTileResult>
  cancelTile(key: string): void
  /** Grass placement (plan 086) — a lower-priority job kind on the same pool.
   *  Terrain tiles are what the player stands on; grass is decorative and
   *  must never starve tile generation (see `pump()`). */
  requestGrass(key: string, params: GrassRequestParams): Promise<GrassChunkData>
  cancelGrass(key: string): void
  dispose(): void
  readonly pendingCount: number
  readonly busyCount: number
}

type TileJob = {
  kind: 'tile'
  id: number
  key: string
  params: ChunkTileParams
  resolve: (data: ChunkTileResult) => void
  reject: (err: Error) => void
}

type GrassJob = {
  kind: 'grass'
  id: number
  key: string
  params: GrassRequestParams
  resolve: (data: GrassChunkData) => void
  reject: (err: Error) => void
}

type ChunkJob = TileJob | GrassJob

function createChunkWorker(): Worker {
  return new Worker(new URL('./chunkHeightmap.worker.ts', import.meta.url), {
    type: 'module',
  })
}

export function defaultChunkWorkerCount(): number {
  const hc = navigator.hardwareConcurrency
  return Math.min(6, Math.max(2, (hc ?? 4) - 1))
}

function toRequest(job: ChunkJob): ChunkWorkerRequest {
  return job.kind === 'tile'
    ? { kind: 'tile', id: job.id, params: job.params }
    : { kind: 'grass', id: job.id, params: job.params }
}

export function createChunkWorkerPool(size = defaultChunkWorkerCount()): ChunkWorkerPool {
  const workers: Worker[] = []
  const free: Worker[] = []
  // Two priority queues instead of one FIFO — terrain tiles are ground under
  // the player's feet; grass is decorative and must never starve them
  // (perf review 005, plan 086 §3.3).
  const queueTile: TileJob[] = []
  const queueGrass: GrassJob[] = []
  const inflight = new Map<number, ChunkJob>()
  // Namespaced (`tile:${chunkKey}` / `grass:${chunkKey}`) so cancelling one
  // job kind for a chunk never clobbers the other kind's in-flight request.
  const keyToId = new Map<string, number>()
  const workerJob = new Map<Worker, number>()
  let nextId = 0

  // At most `size - 1` grass jobs in flight at once (min 1) — always leaves a
  // worker free for a tile request even while every worker is otherwise busy
  // with grass.
  const maxInflightGrass = Math.max(1, size - 1)

  function inflightGrassCount(): number {
    let count = 0
    for (const job of inflight.values()) if (job.kind === 'grass') count++
    return count
  }

  function pump(): void {
    while (free.length > 0) {
      let job: ChunkJob | undefined
      if (queueTile.length > 0) {
        job = queueTile.shift()
      } else if (queueGrass.length > 0 && inflightGrassCount() < maxInflightGrass) {
        job = queueGrass.shift()
      }
      if (!job) break
      const worker = free.pop()!
      inflight.set(job.id, job)
      workerJob.set(worker, job.id)
      worker.postMessage(toRequest(job))
    }
  }

  function settleJob(msgId: number): ChunkJob | undefined {
    const job = inflight.get(msgId)
    inflight.delete(msgId)
    if (job) {
      const namespacedKey = `${job.kind}:${job.key}`
      if (keyToId.get(namespacedKey) === msgId) {
        // Only clear keyToId if it still points at this job — a newer request
        // for the same key may already have replaced it.
        keyToId.delete(namespacedKey)
      }
    }
    return job
  }

  function attach(worker: Worker): void {
    worker.onmessage = (event: MessageEvent<ChunkWorkerResponse>) => {
      const msg = event.data
      const job = settleJob(msg.id)
      workerJob.delete(worker)
      free.push(worker)
      if (job) {
        if (msg.ok) {
          if (job.kind === 'tile' && msg.kind === 'tile') {
            job.resolve({
              heights: msg.heights,
              floorHeights: msg.floorHeights,
              biomes: msg.biomes,
              bodyScale: msg.bodyScale,
              continentalness: msg.continentalness,
              mountainRidge: msg.mountainRidge,
              moistureRegion: msg.moistureRegion,
              roadTint: msg.roadTint,
              vegetation: msg.vegetation,
              items: msg.items,
              environment: msg.environment,
              crops: msg.crops,
            })
          } else if (job.kind === 'grass' && msg.kind === 'grass') {
            job.resolve(msg.grass)
          }
        } else {
          job.reject(new Error(msg.error))
        }
      }
      // else: job was cancelled while in flight — worker kept computing, result discarded.
      pump()
    }
    worker.onerror = (event) => {
      const jobId = workerJob.get(worker)
      workerJob.delete(worker)
      free.push(worker)
      console.error('[chunkWorkerPool] worker error', event.message)
      if (jobId !== undefined) {
        const job = settleJob(jobId)
        job?.reject(new Error(event.message || 'chunk worker error'))
      }
      pump()
    }
  }

  for (let i = 0; i < size; i++) {
    const worker = createChunkWorker()
    attach(worker)
    workers.push(worker)
    free.push(worker)
  }

  function cancelByNamespacedKey(namespacedKey: string): void {
    const id = keyToId.get(namespacedKey)
    if (id === undefined) return
    keyToId.delete(namespacedKey)
    const tileIndex = queueTile.findIndex((job) => job.id === id)
    if (tileIndex !== -1) {
      const [job] = queueTile.splice(tileIndex, 1)
      job!.reject(new HeightmapGenerationCancelledError())
      return
    }
    const grassIndex = queueGrass.findIndex((job) => job.id === id)
    if (grassIndex !== -1) {
      const [job] = queueGrass.splice(grassIndex, 1)
      job!.reject(new HeightmapGenerationCancelledError())
      return
    }
    const job = inflight.get(id)
    if (job) {
      inflight.delete(id)
      job.reject(new HeightmapGenerationCancelledError())
    }
  }

  function cancelTile(key: string): void {
    cancelByNamespacedKey(`tile:${key}`)
  }

  function cancelGrass(key: string): void {
    cancelByNamespacedKey(`grass:${key}`)
  }

  function requestTile(key: string, params: ChunkTileParams): Promise<ChunkTileResult> {
    cancelTile(key)
    const id = nextId++
    keyToId.set(`tile:${key}`, id)
    return new Promise<ChunkTileResult>((resolve, reject) => {
      queueTile.push({ kind: 'tile', id, key, params, resolve, reject })
      pump()
    })
  }

  function requestGrass(key: string, params: GrassRequestParams): Promise<GrassChunkData> {
    cancelGrass(key)
    const id = nextId++
    keyToId.set(`grass:${key}`, id)
    return new Promise<GrassChunkData>((resolve, reject) => {
      queueGrass.push({ kind: 'grass', id, key, params, resolve, reject })
      pump()
    })
  }

  function dispose(): void {
    for (const job of queueTile) job.reject(new HeightmapGenerationCancelledError())
    queueTile.length = 0
    for (const job of queueGrass) job.reject(new HeightmapGenerationCancelledError())
    queueGrass.length = 0
    for (const job of inflight.values()) job.reject(new HeightmapGenerationCancelledError())
    inflight.clear()
    keyToId.clear()
    workerJob.clear()
    for (const worker of workers) worker.terminate()
    workers.length = 0
    free.length = 0
  }

  return {
    requestTile,
    cancelTile,
    requestGrass,
    cancelGrass,
    dispose,
    get pendingCount() {
      return queueTile.length + queueGrass.length
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
  return getChunkPool().requestTile(key, params)
}

export function cancelChunkTile(key: string): void {
  chunkPool?.cancelTile(key)
}

export function requestChunkGrass(
  key: string,
  params: GrassRequestParams,
): Promise<GrassChunkData> {
  return getChunkPool().requestGrass(key, params)
}

export function cancelChunkGrass(key: string): void {
  chunkPool?.cancelGrass(key)
}

export function disposeChunkWorkerPool(): void {
  chunkPool?.dispose()
  chunkPool = null
}
