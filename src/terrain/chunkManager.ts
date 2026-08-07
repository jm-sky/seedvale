import * as THREE from 'three'
import type { HeightSampler } from '../player/PlayerController'
import type { FbmParams } from './fbm'
import { createChunkWater, type WorldWater } from '../world/createWater'
import { buildChunkGeometry } from './buildChunkGeometry'
import {
  chebyshevDistance,
  chunkCenter,
  type ChunkCoord,
  chunkKey,
  worldToChunk,
} from './chunkGrid'
import {
  apronOriginWorld,
  type ChunkTileData,
  type ChunkTileParams,
  extractCoreGrid,
  type RawSampleParams,
  sampleApronGrid,
  sampleBiomeAt,
  sampleFloorAt,
  sampleHeightAt,
} from './chunkHeightmap'
import {
  cancelChunkTile,
  HeightmapGenerationCancelledError,
  requestChunkTile,
} from './chunkWorkerPool'

export type ChunkManagerConfig = {
  chunkSize: number
  /** Core texels per chunk edge. */
  resolution: number
  /** Chunks (Chebyshev distance) kept loaded around the player. */
  loadRadius: number
  /** Must be > loadRadius — the hysteresis ring that avoids load/unload thrashing. */
  unloadRadius: number
  /** Pinned chunks (e.g. the settlement footprint) — loaded once, never unloaded. */
  homeChunks: ChunkCoord[]
  seed: number
  heightScale: number
  waterLevel: number
  noiseScale: number
  fbm: FbmParams
  biome: { noiseScale: number; fbm: FbmParams }
  flatShading: boolean
}

type ChunkState = 'generating' | 'ready'
type ChunkRecord = {
  coord: ChunkCoord
  key: string
  state: ChunkState
  pinned: boolean
  tile?: ChunkTileData
  mesh?: THREE.Mesh
  meshDispose?: () => void
  water?: WorldWater | null
  pendingPromise?: Promise<void>
}

export type ChunkManager = {
  /** Cheap to call every frame — internally throttled to a recheck distance. */
  update: (playerX: number, playerZ: number) => void
  tickWater: (dt: number) => void
  setWaterDayNight: (dayFactor: number) => void
  sampleHeight: HeightSampler
  sampleFloor: HeightSampler
  sampleBiome: (x: number, z: number) => number
  waterLevel: number
  loadedChunkCount: () => number
  /** Resolves once every listed chunk has finished generating (or failed/cancelled). */
  waitForChunks: (coords: ChunkCoord[]) => Promise<void>
  dispose: () => void
}

export function createChunkManager(
  scene: THREE.Scene,
  config: ChunkManagerConfig,
): ChunkManager {
  const chunks = new Map<string, ChunkRecord>()
  let lastCheckX = Number.POSITIVE_INFINITY
  let lastCheckZ = Number.POSITIVE_INFINITY
  const recheckDistance = config.chunkSize * 0.25

  const fallbackParams: RawSampleParams = {
    seed: config.seed,
    heightScale: config.heightScale,
    waterLevel: config.waterLevel,
    noiseScale: config.noiseScale,
    fbm: config.fbm,
    biome: config.biome,
  }

  function paramsFor(coord: ChunkCoord): ChunkTileParams {
    return {
      cx: coord.cx,
      cz: coord.cz,
      chunkSize: config.chunkSize,
      resolution: config.resolution,
      seed: config.seed,
      heightScale: config.heightScale,
      waterLevel: config.waterLevel,
      noiseScale: config.noiseScale,
      fbm: { ...config.fbm },
      biome: { noiseScale: config.biome.noiseScale, fbm: { ...config.biome.fbm } },
    }
  }

  function isHomeChunk(coord: ChunkCoord): boolean {
    return config.homeChunks.some((h) => h.cx === coord.cx && h.cz === coord.cz)
  }

  function ensureLoaded(coord: ChunkCoord): Promise<void> {
    const key = chunkKey(coord)
    const existing = chunks.get(key)
    if (existing) return existing.pendingPromise ?? Promise.resolve()

    const record: ChunkRecord = {
      coord,
      key,
      state: 'generating',
      pinned: isHomeChunk(coord),
    }
    chunks.set(key, record)

    const promise = requestChunkTile(key, paramsFor(coord))
      .then((tile) => {
        const rec = chunks.get(key)
        if (!rec) return // unloaded while generating
        rec.tile = tile

        const { x, z } = chunkCenter(coord, config.chunkSize)
        const { mesh, dispose } = buildChunkGeometry(
          tile,
          config.resolution,
          config.chunkSize,
          x,
          z,
          config.waterLevel,
          config.heightScale,
          config.flatShading,
        )
        scene.add(mesh)
        rec.mesh = mesh
        rec.meshDispose = dispose

        const apronRes = config.resolution + 2
        const coreHeights = extractCoreGrid(tile.heights, apronRes, config.resolution)
        const coreBodyScale = extractCoreGrid(tile.bodyScale, apronRes, config.resolution)
        rec.water = createChunkWater(
          coreHeights,
          coreBodyScale,
          config.resolution,
          x,
          z,
          config.chunkSize,
          config.waterLevel,
        )
        if (rec.water) scene.add(rec.water.mesh)

        rec.state = 'ready'
      })
      .catch((err: unknown) => {
        if (!(err instanceof HeightmapGenerationCancelledError)) {
          console.error('[chunkManager] chunk generation failed', err)
        }
        chunks.delete(key)
      })
      .finally(() => {
        const rec = chunks.get(key)
        if (rec) rec.pendingPromise = undefined
      })

    record.pendingPromise = promise
    return promise
  }

  function unload(record: ChunkRecord): void {
    if (record.state === 'generating') cancelChunkTile(record.key)
    record.mesh?.removeFromParent()
    record.meshDispose?.()
    record.water?.dispose()
    chunks.delete(record.key)
  }

  function recheck(playerX: number, playerZ: number): void {
    lastCheckX = playerX
    lastCheckZ = playerZ
    const playerChunk = worldToChunk(playerX, playerZ, config.chunkSize)

    const desired: ChunkCoord[] = []
    for (let dz = -config.loadRadius; dz <= config.loadRadius; dz++) {
      for (let dx = -config.loadRadius; dx <= config.loadRadius; dx++) {
        desired.push({ cx: playerChunk.cx + dx, cz: playerChunk.cz + dz })
      }
    }
    for (const home of config.homeChunks) {
      if (!desired.some((c) => c.cx === home.cx && c.cz === home.cz)) desired.push(home)
    }
    desired.sort(
      (a, b) => chebyshevDistance(a, playerChunk) - chebyshevDistance(b, playerChunk),
    )
    const desiredKeys = new Set(desired.map(chunkKey))

    for (const coord of desired) {
      if (!chunks.has(chunkKey(coord))) void ensureLoaded(coord)
    }
    for (const record of [...chunks.values()]) {
      if (record.pinned || desiredKeys.has(record.key)) continue
      if (chebyshevDistance(record.coord, playerChunk) > config.unloadRadius) unload(record)
    }
  }

  function update(playerX: number, playerZ: number): void {
    if (Math.hypot(playerX - lastCheckX, playerZ - lastCheckZ) < recheckDistance) return
    recheck(playerX, playerZ)
  }

  function readField(
    field: 'heights' | 'floorHeights' | 'biomes',
    worldX: number,
    worldZ: number,
  ): number {
    const coord = worldToChunk(worldX, worldZ, config.chunkSize)
    const rec = chunks.get(chunkKey(coord))
    if (rec?.state === 'ready' && rec.tile) {
      const o = apronOriginWorld(coord.cx, coord.cz, config.chunkSize, config.resolution)
      return sampleApronGrid(rec.tile[field], o.apronRes, o.x, o.z, o.step, worldX, worldZ)
    }
    if (field === 'heights') return sampleHeightAt(worldX, worldZ, fallbackParams)
    if (field === 'floorHeights') return sampleFloorAt(worldX, worldZ, fallbackParams)
    return sampleBiomeAt(worldX, worldZ, fallbackParams)
  }

  return {
    update,
    tickWater(dt) {
      for (const rec of chunks.values()) rec.water?.update(dt)
    },
    setWaterDayNight(dayFactor) {
      for (const rec of chunks.values()) rec.water?.setDayNight(dayFactor)
    },
    sampleHeight: (x, z) => readField('heights', x, z),
    sampleFloor: (x, z) => readField('floorHeights', x, z),
    sampleBiome: (x, z) => readField('biomes', x, z),
    waterLevel: config.waterLevel,
    loadedChunkCount: () => chunks.size,
    waitForChunks: (coords) => Promise.all(coords.map((c) => ensureLoaded(c))).then(() => undefined),
    dispose() {
      for (const record of [...chunks.values()]) unload(record)
    },
  }
}
