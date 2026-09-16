import type { ChunkTileParams } from './chunkHeightmap'
import type {
  ChunkTileResult,
  ChunkWorkerRequest,
  ChunkWorkerResponse,
  GrassRequestParams,
} from './chunkHeightmapProtocol'
import type { ChunkMeshData, ChunkMeshDataParams } from './chunkMeshData'
import type { GrassChunkData } from './grassPlacement'
import type { WorldKnowledgeScanResult, WorldKnowledgeWorkerParams } from './worldKnowledgeScan'

export class HeightmapGenerationCancelledError extends Error {
  constructor() {
    super('Heightmap generation superseded by a newer request')
    this.name = 'HeightmapGenerationCancelledError'
  }
}

export function isChunkWorkerCancelledError(error: unknown): boolean {
  return error instanceof HeightmapGenerationCancelledError
}

/** Test seam — production uses a real module Worker. */
export type ChunkWorkerLike = {
  postMessage(message: ChunkWorkerRequest): void
  terminate(): void
  onmessage: ((event: MessageEvent<ChunkWorkerResponse>) => void) | null
  onerror: ((event: { message?: string }) => void) | null
}

export type ChunkWorkerPoolOptions = {
  createWorker?: () => ChunkWorkerLike
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
  /** Chunk render mesh data (plan world-terrain-004) — same priority as
   *  `tile`: a chunk isn't visually ready until its mesh attaches, so this
   *  must not be starved by grass. */
  requestMesh(key: string, params: ChunkMeshDataParams): Promise<ChunkMeshData>
  cancelMesh(key: string): void
  /**
   * Bounded static-world knowledge scan (plan quests-progression-047).
   * Below tile/mesh, above grass; shares background headroom so research
   * never consumes every worker while terrain is waiting.
   * @domain world-terrain
   */
  requestWorldKnowledge(key: string, params: WorldKnowledgeWorkerParams): Promise<WorldKnowledgeScanResult>
  cancelWorldKnowledge(key: string): void
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

type MeshJob = {
  kind: 'mesh'
  id: number
  key: string
  params: ChunkMeshDataParams
  resolve: (data: ChunkMeshData) => void
  reject: (err: Error) => void
}

type WorldKnowledgeJob = {
  kind: 'worldKnowledge'
  id: number
  key: string
  params: WorldKnowledgeWorkerParams
  resolve: (data: WorldKnowledgeScanResult) => void
  reject: (err: Error) => void
}

type ChunkJob = TileJob | GrassJob | MeshJob | WorldKnowledgeJob

function createChunkWorker(): ChunkWorkerLike {
  return new Worker(new URL('./chunkHeightmap.worker.ts', import.meta.url), {
    type: 'module',
  }) as ChunkWorkerLike
}

export function defaultChunkWorkerCount(): number {
  const hc = navigator.hardwareConcurrency
  return Math.min(6, Math.max(2, (hc ?? 4) - 1))
}

function toRequest(job: ChunkJob): ChunkWorkerRequest {
  if (job.kind === 'tile') return { kind: 'tile', id: job.id, params: job.params }
  if (job.kind === 'mesh') return { kind: 'mesh', id: job.id, params: job.params }
  if (job.kind === 'worldKnowledge') return { kind: 'worldKnowledge', id: job.id, params: job.params }
  return { kind: 'grass', id: job.id, params: job.params }
}

function isBackgroundJob(job: ChunkJob): boolean {
  return job.kind === 'grass' || job.kind === 'worldKnowledge'
}

export function createChunkWorkerPool(
  size = defaultChunkWorkerCount(),
  options: ChunkWorkerPoolOptions = {},
): ChunkWorkerPool {
  const createWorker = options.createWorker ?? createChunkWorker
  const workers: ChunkWorkerLike[] = []
  const free: ChunkWorkerLike[] = []
  // Tile/mesh outrank world knowledge; knowledge outranks grass. Background
  // kinds share headroom so they never occupy every worker (plan quests-progression-047).
  const queueTile: TileJob[] = []
  const queueMesh: MeshJob[] = []
  const queueWorldKnowledge: WorldKnowledgeJob[] = []
  const queueGrass: GrassJob[] = []
  const inflight = new Map<number, ChunkJob>()
  const keyToId = new Map<string, number>()
  const workerJob = new Map<ChunkWorkerLike, number>()
  let nextId = 0

  const maxInflightBackground = Math.max(1, size - 1)

  function inflightBackgroundCount(): number {
    let count = 0
    for (const job of inflight.values()) if (isBackgroundJob(job)) count++
    return count
  }

  function canStartBackground(): boolean {
    return inflightBackgroundCount() < maxInflightBackground
  }

  function pump(): void {
    while (free.length > 0) {
      let job: ChunkJob | undefined
      if (queueTile.length > 0) {
        job = queueTile.shift()
      } else if (queueMesh.length > 0) {
        job = queueMesh.shift()
      } else if (queueWorldKnowledge.length > 0 && canStartBackground()) {
        job = queueWorldKnowledge.shift()
      } else if (queueGrass.length > 0 && canStartBackground()) {
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
        keyToId.delete(namespacedKey)
      }
    }
    return job
  }

  function attach(worker: ChunkWorkerLike): void {
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
          } else if (job.kind === 'mesh' && msg.kind === 'mesh') {
            job.resolve({
              positionY: msg.positionY,
              normal: msg.normal,
              color: msg.color,
              bareGround: msg.bareGround,
            })
          } else if (job.kind === 'worldKnowledge' && msg.kind === 'worldKnowledge') {
            job.resolve(msg.result)
          } else {
            job.reject(new Error(`chunk worker kind mismatch (${job.kind})`))
          }
        } else {
          job.reject(new Error(msg.error))
        }
      }
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
    const worker = createWorker()
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
    const meshIndex = queueMesh.findIndex((job) => job.id === id)
    if (meshIndex !== -1) {
      const [job] = queueMesh.splice(meshIndex, 1)
      job!.reject(new HeightmapGenerationCancelledError())
      return
    }
    const knowledgeIndex = queueWorldKnowledge.findIndex((job) => job.id === id)
    if (knowledgeIndex !== -1) {
      const [job] = queueWorldKnowledge.splice(knowledgeIndex, 1)
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

  function cancelMesh(key: string): void {
    cancelByNamespacedKey(`mesh:${key}`)
  }

  function cancelWorldKnowledge(key: string): void {
    cancelByNamespacedKey(`worldKnowledge:${key}`)
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

  function requestMesh(key: string, params: ChunkMeshDataParams): Promise<ChunkMeshData> {
    cancelMesh(key)
    const id = nextId++
    keyToId.set(`mesh:${key}`, id)
    return new Promise<ChunkMeshData>((resolve, reject) => {
      queueMesh.push({ kind: 'mesh', id, key, params, resolve, reject })
      pump()
    })
  }

  function requestWorldKnowledge(
    key: string,
    params: WorldKnowledgeWorkerParams,
  ): Promise<WorldKnowledgeScanResult> {
    cancelWorldKnowledge(key)
    const id = nextId++
    keyToId.set(`worldKnowledge:${key}`, id)
    return new Promise<WorldKnowledgeScanResult>((resolve, reject) => {
      queueWorldKnowledge.push({ kind: 'worldKnowledge', id, key, params, resolve, reject })
      pump()
    })
  }

  function dispose(): void {
    for (const job of queueTile) job.reject(new HeightmapGenerationCancelledError())
    queueTile.length = 0
    for (const job of queueMesh) job.reject(new HeightmapGenerationCancelledError())
    queueMesh.length = 0
    for (const job of queueWorldKnowledge) job.reject(new HeightmapGenerationCancelledError())
    queueWorldKnowledge.length = 0
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
    requestMesh,
    cancelMesh,
    requestWorldKnowledge,
    cancelWorldKnowledge,
    dispose,
    get pendingCount() {
      return queueTile.length + queueMesh.length + queueWorldKnowledge.length + queueGrass.length
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

export function requestChunkMesh(
  key: string,
  params: ChunkMeshDataParams,
): Promise<ChunkMeshData> {
  return getChunkPool().requestMesh(key, params)
}

export function cancelChunkMesh(key: string): void {
  chunkPool?.cancelMesh(key)
}

export function requestChunkWorldKnowledge(
  key: string,
  params: WorldKnowledgeWorkerParams,
): Promise<WorldKnowledgeScanResult> {
  return getChunkPool().requestWorldKnowledge(key, params)
}

export function cancelChunkWorldKnowledge(key: string): void {
  chunkPool?.cancelWorldKnowledge(key)
}

export function disposeChunkWorkerPool(): void {
  chunkPool?.dispose()
  chunkPool = null
}
