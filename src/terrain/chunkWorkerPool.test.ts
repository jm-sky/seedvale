import { describe, expect, it } from 'vitest'
import type { ChunkTileParams } from './chunkHeightmap'
import type { ChunkWorkerRequest, ChunkWorkerResponse, GrassRequestParams } from './chunkHeightmapProtocol'
import type { ChunkMeshDataParams } from './chunkMeshData'
import type { WorldKnowledgeWorkerParams } from './worldKnowledgeScan'
import {
  type ChunkWorkerLike,
  createChunkWorkerPool,
  HeightmapGenerationCancelledError,
} from './chunkWorkerPool'

type ControllableWorker = ChunkWorkerLike & {
  last: ChunkWorkerRequest | null
  terminated: boolean
  completeOk(): void
  completeError(error: string): void
}

type Posted = { worker: ControllableWorker, request: ChunkWorkerRequest }

function createControllableWorker(posted: Posted[]): ControllableWorker {
  const worker: ControllableWorker = {
    onmessage: null,
    onerror: null,
    terminated: false,
    last: null,
    postMessage(message) {
      worker.last = message
      posted.push({ worker, request: message })
    },
    terminate() {
      worker.terminated = true
    },
    completeOk() {
      const request = worker.last
      if (!request || !worker.onmessage) return
      const response = (
        request.kind === 'worldKnowledge'
          ? { kind: 'worldKnowledge', id: request.id, ok: true, result: { hits: [] } }
          : request.kind === 'grass'
            ? { kind: 'grass', id: request.id, ok: true, grass: {} as never }
            : request.kind === 'mesh'
              ? {
                  kind: 'mesh',
                  id: request.id,
                  ok: true,
                  positionY: new Float32Array(),
                  normal: new Float32Array(),
                  color: new Float32Array(),
                  bareGround: new Float32Array(),
                }
              : {
                  kind: 'tile',
                  id: request.id,
                  ok: true,
                  heights: new Float32Array(),
                  floorHeights: new Float32Array(),
                  biomes: new Uint8Array(),
                  bodyScale: new Float32Array(),
                  continentalness: new Float32Array(),
                  mountainRidge: new Float32Array(),
                  moistureRegion: new Float32Array(),
                  roadTint: new Float32Array(),
                  vegetation: [],
                  items: [],
                  environment: [],
                  crops: [],
                }
      ) as ChunkWorkerResponse
      worker.onmessage({ data: response } as MessageEvent<ChunkWorkerResponse>)
    },
    completeError(error) {
      const request = worker.last
      if (!request || !worker.onmessage) return
      worker.onmessage({
        data: { kind: request.kind, id: request.id, ok: false, error },
      } as MessageEvent<ChunkWorkerResponse>)
    },
  }
  return worker
}

const dummyTile = {} as ChunkTileParams
const dummyGrass = {} as GrassRequestParams
const dummyMesh = {} as ChunkMeshDataParams
const dummyKnowledge = {
  queryKind: 'nearest-landmark',
  landmarkKinds: ['monolith'],
  originX: 0,
  originZ: 0,
  maxChunkRadius: 1,
  terrain: {
    chunkSize: 64,
    resolution: 17,
    seed: 1,
    heightScale: 18,
    waterLevel: 0.45,
    noiseScale: 120,
    detailAmplitude: 0.55,
    hillsScale: 420,
    hillsAmplitude: 0.28,
    hillsFbm: { octaves: 1, persistence: 0.5, lacunarity: 2, exponentiation: 1 },
    fbm: { octaves: 1, persistence: 0.5, lacunarity: 2, exponentiation: 1 },
    biome: { noiseScale: 96, fbm: { octaves: 1, persistence: 0.5, lacunarity: 2, exponentiation: 1 } },
    region: {} as WorldKnowledgeWorkerParams['terrain']['region'],
    vegetationSpeciesCount: { tree: 1, bush: 1, cactus: 1, reed: 1, fern: 1, lily: 1, seaweed: 1 },
    homeChunks: [],
    cemeterySettlements: [],
    cemeteryRoadSegments: [],
    cemeteryClearings: [],
    roadSegments: [],
    clearings: [],
    regional: [],
  },
} satisfies WorldKnowledgeWorkerParams

describe('chunkWorkerPool world-knowledge scheduling (plan quests-progression-047)', () => {
  it('lets a queued tile outrank queued world-knowledge after a background job completes', async () => {
    const posted: Posted[] = []
    const pool = createChunkWorkerPool(1, { createWorker: () => createControllableWorker(posted) })
    const knowledge = pool.requestWorldKnowledge('a', dummyKnowledge)
    const tile = pool.requestTile('t', dummyTile)
    const laterKnowledge = pool.requestWorldKnowledge('b', dummyKnowledge)
    expect(posted).toHaveLength(1)
    expect(posted[0]?.request.kind).toBe('worldKnowledge')
    posted[0]!.worker.completeOk()
    await knowledge
    expect(posted[1]?.request.kind).toBe('tile')
    posted[1]!.worker.completeOk()
    await tile
    posted[2]!.worker.completeOk()
    await laterKnowledge
    pool.dispose()
  })

  it('starts world knowledge before grass when both are queued', async () => {
    const posted: Posted[] = []
    const pool = createChunkWorkerPool(1, { createWorker: () => createControllableWorker(posted) })
    const blocker = pool.requestTile('t', dummyTile)
    const grass = pool.requestGrass('g', dummyGrass)
    const knowledge = pool.requestWorldKnowledge('k', dummyKnowledge)
    posted[0]!.worker.completeOk()
    await blocker
    expect(posted[1]?.request.kind).toBe('worldKnowledge')
    posted[1]!.worker.completeOk()
    await knowledge
    posted[2]!.worker.completeOk()
    await grass
    pool.dispose()
  })

  it('keeps a worker free for terrain while background research is queued', async () => {
    const posted: Posted[] = []
    const pool = createChunkWorkerPool(2, { createWorker: () => createControllableWorker(posted) })
    const first = pool.requestWorldKnowledge('a', dummyKnowledge)
    const second = pool.requestWorldKnowledge('b', dummyKnowledge)
    expect(posted).toHaveLength(1)
    expect(pool.busyCount).toBe(1)
    expect(pool.pendingCount).toBe(1)
    const tile = pool.requestTile('t', dummyTile)
    expect(posted).toHaveLength(2)
    expect(posted[1]?.request.kind).toBe('tile')
    pool.dispose()
    await Promise.allSettled([first, second, tile])
  })

  it('rejects cancelled and disposed world-knowledge jobs', async () => {
    const posted: Posted[] = []
    const pool = createChunkWorkerPool(1, { createWorker: () => createControllableWorker(posted) })
    const pending = pool.requestWorldKnowledge('queued', dummyKnowledge)
    const queued = pool.requestWorldKnowledge('later', dummyKnowledge)
    pool.cancelWorldKnowledge('later')
    await expect(queued).rejects.toBeInstanceOf(HeightmapGenerationCancelledError)
    const disposing = pool.requestWorldKnowledge('die', dummyKnowledge)
    pool.dispose()
    await expect(pending).rejects.toBeInstanceOf(HeightmapGenerationCancelledError)
    await expect(disposing).rejects.toBeInstanceOf(HeightmapGenerationCancelledError)
  })

  it('discards a stale in-flight result after cancel', async () => {
    const posted: Posted[] = []
    const pool = createChunkWorkerPool(1, { createWorker: () => createControllableWorker(posted) })
    const first = pool.requestWorldKnowledge('same', dummyKnowledge)
    pool.cancelWorldKnowledge('same')
    await expect(first).rejects.toBeInstanceOf(HeightmapGenerationCancelledError)
    posted[0]!.worker.completeOk()
    expect(pool.busyCount).toBe(0)
    pool.dispose()
  })

  it('starts a queued mesh before queued world-knowledge after a tile completes', async () => {
    const posted: Posted[] = []
    const pool = createChunkWorkerPool(1, { createWorker: () => createControllableWorker(posted) })
    const blocker = pool.requestTile('t', dummyTile)
    const knowledge = pool.requestWorldKnowledge('k', dummyKnowledge)
    const mesh = pool.requestMesh('m', dummyMesh)
    posted[0]!.worker.completeOk()
    await blocker
    expect(posted[1]?.request.kind).toBe('mesh')
    posted[1]!.worker.completeOk()
    await mesh
    posted[2]!.worker.completeOk()
    await knowledge
    pool.dispose()
  })

  it('serializes a worldKnowledge protocol request, not a tile job', async () => {
    const posted: Posted[] = []
    const pool = createChunkWorkerPool(1, { createWorker: () => createControllableWorker(posted) })
    const pending = pool.requestWorldKnowledge('scan', dummyKnowledge)
    expect(posted[0]?.request).toMatchObject({
      kind: 'worldKnowledge',
      params: { queryKind: 'nearest-landmark', maxChunkRadius: 1 },
    })
    pool.dispose()
    await expect(pending).rejects.toBeInstanceOf(HeightmapGenerationCancelledError)
  })
})
