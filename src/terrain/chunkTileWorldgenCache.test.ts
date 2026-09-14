import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChunkTileParams } from './chunkHeightmap'
import type { ChunkTileResult } from './chunkHeightmapProtocol'
import { deleteCacheForSeed, getCacheRecord } from '../persistence/worldgenCacheDb'
import { applyModificationToTile, type TerrainModification } from './chunkManager'
import {
  CHUNK_TILE_CACHE_NAMESPACE,
  CHUNK_TILE_CACHE_VERSION,
  CHUNK_TILE_META_SUBKEY,
  type ChunkTileCacheStorage,
  chunkTileFingerprint,
  chunkTileSubKey,
  cloneChunkTileForRuntime,
  estimateChunkTileBytes,
  getChunkTileCacheStats,
  loadCachedChunkTile,
  persistChunkTile,
  resetChunkTileCacheMetadata,
  resetChunkTileCacheStats,
  validateCachedChunkTile,
} from './chunkTileWorldgenCache'

const SEED = 4242
const RESOLUTION = 5
const APRON = RESOLUTION + 2
const GRID_LEN = APRON * APRON

beforeEach(() => {
  vi.stubGlobal('indexedDB', new IDBFactory())
  resetChunkTileCacheMetadata()
  resetChunkTileCacheStats()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function params(overrides: Partial<ChunkTileParams> = {}): ChunkTileParams {
  return {
    cx: 1,
    cz: -2,
    chunkSize: 32,
    resolution: RESOLUTION,
    seed: SEED,
    heightScale: 12,
    waterLevel: 0,
    noiseScale: 80,
    detailAmplitude: 1,
    hillsScale: 200,
    hillsAmplitude: 3,
    roadSegments: [],
    clearings: [],
    regional: null,
    riverSegments: [],
    cemeterySettlements: [],
    cemeteryRoadSegments: [],
    cemeteryClearings: [],
    authoredExpeditionRuins: null,
    isHomeChunk: false,
    ...overrides,
  } as unknown as ChunkTileParams
}

function grid(fill: number): Float32Array {
  return new Float32Array(GRID_LEN).fill(fill)
}

function tile(fill = 10): ChunkTileResult {
  return {
    heights: grid(fill),
    floorHeights: grid(fill),
    biomes: grid(0.25),
    bodyScale: grid(0.5),
    continentalness: grid(0.6),
    mountainRidge: grid(0.1),
    moistureRegion: grid(0.7),
    roadTint: grid(0),
    vegetation: [{ x: 1, z: 2, kind: 'tree', speciesIndex: 0, scale: 1, rotationY: 0 }],
    items: [{ id: '1:-2:0', x: 3, z: 4, kind: 'stick' }],
    environment: [{ x: 5, z: 6, kind: 'largeRock', scale: 1, rotationY: 0, variant: 0 }],
    crops: [{ id: '1:-2:crop0', x: 7, z: 8, cropId: 'wheat', stageStartedAt: 0 }],
  } as unknown as ChunkTileResult
}

describe('chunkTileWorldgenCache — fingerprint (plan world-terrain-031 §Per-record fingerprint)', () => {
  it('is stable for identical params and independent of key order', () => {
    const a = chunkTileFingerprint(params())
    const b = chunkTileFingerprint(params())
    expect(a).toBe(b)
    const reordered = { ...params() }
    expect(chunkTileFingerprint(reordered as ChunkTileParams)).toBe(a)
  })

  it.each([
    ['roads', { roadSegments: [{ x: 0, z: 0 }] }],
    ['rivers', { riverSegments: [{ x0: 0, z0: 0, x1: 1, z1: 1 }] }],
    ['clearings', { clearings: [{ x: 0, z: 0, radius: 4, targetH: 1 }] }],
    ['cemetery settlements', { cemeterySettlements: [{ id: 's1' }] }],
    ['cemetery roads', { cemeteryRoadSegments: [{ x: 1, z: 1 }] }],
    ['cemetery clearings', { cemeteryClearings: [{ x: 1, z: 1, radius: 3 }] }],
    ['authored ruins', { authoredExpeditionRuins: { id: 'r', x: 1, z: 1, rotationY: 0, variant: 0, scale: 1 } }],
    ['resolution', { resolution: 9 }],
    ['height scale', { heightScale: 13 }],
    ['chunk coordinate', { cx: 2 }],
  ])('changes when %s change', (_label, override) => {
    expect(chunkTileFingerprint(params(override as Partial<ChunkTileParams>))).not.toBe(chunkTileFingerprint(params()))
  })
})

describe('chunkTileWorldgenCache — round trip through IndexedDB', () => {
  it('all eight grids and every placement list survive a write/read round trip', async () => {
    const p = params()
    const fp = chunkTileFingerprint(p)
    const canonical = tile()
    await persistChunkTile(SEED, p, fp, canonical)

    resetChunkTileCacheMetadata()
    const hit = await loadCachedChunkTile(SEED, p, fp)
    expect(hit).not.toBeNull()
    expect(hit!.heights).toBeInstanceOf(Float32Array)
    expect([...hit!.heights]).toEqual([...canonical.heights])
    expect([...hit!.moistureRegion]).toEqual([...canonical.moistureRegion])
    expect(hit!.vegetation).toEqual(canonical.vegetation)
    expect(hit!.items).toEqual(canonical.items)
    expect(hit!.environment).toEqual(canonical.environment)
    expect(hit!.crops).toEqual(canonical.crops)
  })

  it('reads one chunk by primary key — a record for another chunk is never returned', async () => {
    const a = params({ cx: 1, cz: 1 })
    const b = params({ cx: 9, cz: 9 })
    await persistChunkTile(SEED, a, chunkTileFingerprint(a), tile())
    expect(await loadCachedChunkTile(SEED, b, chunkTileFingerprint(b))).toBeNull()
    expect(await getCacheRecord(SEED, CHUNK_TILE_CACHE_NAMESPACE, CHUNK_TILE_CACHE_VERSION, chunkTileSubKey(1, 1))).not.toBeNull()
  })

  it('a changed fingerprint (different roads) is a miss, never a migration', async () => {
    const p = params()
    await persistChunkTile(SEED, p, chunkTileFingerprint(p), tile())
    const rerouted = params({ roadSegments: [{ x: 0, z: 0 }] as never })
    expect(await loadCachedChunkTile(SEED, rerouted, chunkTileFingerprint(rerouted))).toBeNull()
  })

  it('a record written under another namespace version is not visible to this one', async () => {
    const p = params()
    const fp = chunkTileFingerprint(p)
    await persistChunkTile(SEED, p, fp, tile())
    // Same sub-key, different version -> different primary key.
    const other = await getCacheRecord(SEED, CHUNK_TILE_CACHE_NAMESPACE, CHUNK_TILE_CACHE_VERSION + 1, chunkTileSubKey(p.cx, p.cz))
    expect(other).toBeNull()
  })

  it('Clear cache (deleteCacheForSeed) returns the chunk to worker generation', async () => {
    const p = params()
    const fp = chunkTileFingerprint(p)
    await persistChunkTile(SEED, p, fp, tile())
    await deleteCacheForSeed(SEED)
    resetChunkTileCacheMetadata()
    expect(await loadCachedChunkTile(SEED, p, fp)).toBeNull()
  })

  it('one seed never serves another seed', async () => {
    const p = params()
    const fp = chunkTileFingerprint(p)
    await persistChunkTile(SEED, p, fp, tile())
    resetChunkTileCacheMetadata()
    expect(await loadCachedChunkTile(SEED + 1, p, fp)).toBeNull()
  })
})

describe('chunkTileWorldgenCache — validation (plan §Validation and fallback)', () => {
  it('accepts a well-formed tile for the current resolution', () => {
    expect(validateCachedChunkTile(tile(), params())).not.toBeNull()
  })

  it.each([
    ['a grid of the wrong length', () => ({ ...tile(), heights: new Float32Array(GRID_LEN - 1) })],
    ['a grid of the wrong type', () => ({ ...tile(), roadTint: Array.from({ length: GRID_LEN }, () => 0) })],
    ['a missing grid', () => { const t = { ...tile() } as Record<string, unknown>; delete t.bodyScale; return t }],
    ['a missing placement list', () => { const t = { ...tile() } as Record<string, unknown>; delete t.crops; return t }],
    ['a malformed placement entry', () => ({ ...tile(), items: [{ id: 'x' }] })],
    ['a non-object payload', () => 'nope'],
  ])('rejects %s as an ordinary miss', (_label, make) => {
    expect(validateCachedChunkTile(make(), params())).toBeNull()
  })

  it('a resolution change alone invalidates cached grid lengths', () => {
    expect(validateCachedChunkTile(tile(), params({ resolution: RESOLUTION + 2 }))).toBeNull()
  })

  it('a malformed stored payload reads back as a miss and is counted as invalid', async () => {
    const p = params()
    const fp = chunkTileFingerprint(p)
    const broken = { ...tile(), heights: new Float32Array(3) } as unknown as ChunkTileResult
    await persistChunkTile(SEED, p, fp, broken)
    resetChunkTileCacheMetadata()
    expect(await loadCachedChunkTile(SEED, p, fp)).toBeNull()
    expect(getChunkTileCacheStats().invalid).toBe(1)
  })
})

describe('chunkTileWorldgenCache — canonical/runtime ownership (plan §Critical immutability rule)', () => {
  it('a runtime clone carries identical data but shares no buffer or placement object', () => {
    const canonical = tile()
    const runtime = cloneChunkTileForRuntime(canonical)
    expect([...runtime.heights]).toEqual([...canonical.heights])
    expect(runtime.heights).not.toBe(canonical.heights)
    expect(runtime.heights.buffer).not.toBe(canonical.heights.buffer)
    expect(runtime.items[0]).toEqual(canonical.items[0])
    expect(runtime.items[0]).not.toBe(canonical.items[0])
    expect(runtime.crops).not.toBe(canonical.crops)
  })

  it('a player dig on the runtime clone cannot reach the canonical tile a pending write holds', () => {
    const canonical = tile()
    const before = [...canonical.heights]
    const runtime = cloneChunkTileForRuntime(canonical)
    // World centre of chunk (1, -2) at chunkSize 32.
    const mod: TerrainModification = { x: 48, z: -48, radius: 40, depth: 3, mode: 'dig' }
    applyModificationToTile(runtime, { cx: 1, cz: -2 }, 32, RESOLUTION, mod)
    expect([...runtime.heights]).not.toEqual(before)
    expect([...canonical.heights]).toEqual(before)
  })

  it('digging after a cache hit never contaminates the persisted record another save would reuse', async () => {
    const p = params()
    const fp = chunkTileFingerprint(p)
    await persistChunkTile(SEED, p, fp, tile())
    resetChunkTileCacheMetadata()

    const canonical = (await loadCachedChunkTile(SEED, p, fp))!
    const runtime = cloneChunkTileForRuntime(canonical)
    applyModificationToTile(runtime, { cx: p.cx, cz: p.cz }, p.chunkSize, p.resolution, {
      x: 48,
      z: -48,
      radius: 40,
      depth: 5,
      mode: 'dig',
    })
    expect([...runtime.heights]).not.toEqual([...tile().heights])

    resetChunkTileCacheMetadata()
    const reread = (await loadCachedChunkTile(SEED, p, fp))!
    expect([...reread.heights]).toEqual([...tile().heights])
  })
})

describe('chunkTileWorldgenCache — storage failure and bounds', () => {
  function fakeStorage(overrides: Partial<ChunkTileCacheStorage> = {}) {
    const rows = new Map<string, unknown>()
    const deleted: string[] = []
    const storage: ChunkTileCacheStorage = {
      get: (async (seed, namespace, version, subKey) => (rows.get(`${seed}/${namespace}/${version}/${subKey}`) ?? null)) as ChunkTileCacheStorage['get'],
      put: (async (records) => { for (const r of records) rows.set(r.key, r) }) as ChunkTileCacheStorage['put'],
      deleteKeys: (async (keys) => { for (const k of keys) { rows.delete(k); deleted.push(k) } }) as ChunkTileCacheStorage['deleteKeys'],
      ...overrides,
    }
    return { storage, rows, deleted }
  }

  it('a failing IndexedDB read is a plain miss, never a throw into chunk loading', async () => {
    const { storage } = fakeStorage({ get: (() => Promise.reject(new Error('idb down'))) as ChunkTileCacheStorage['get'] })
    const p = params()
    await expect(loadCachedChunkTile(SEED, p, chunkTileFingerprint(p), storage)).resolves.toBeNull()
  })

  it('a failing IndexedDB write is swallowed — chunk availability never depends on persistence', async () => {
    const { storage } = fakeStorage({ put: (() => Promise.reject(new Error('idb down'))) as ChunkTileCacheStorage['put'] })
    const p = params()
    await expect(persistChunkTile(SEED, p, chunkTileFingerprint(p), tile(), storage)).resolves.toBeUndefined()
  })

  it('the storage seam exposes no namespace-wide listing — tiles are only read by primary key', () => {
    const { storage } = fakeStorage()
    expect(Object.keys(storage).sort()).toEqual(['deleteKeys', 'get', 'put'])
  })

  it('a byte budget evicts least-recently-used tiles by exact key and keeps a small manifest', async () => {
    const { storage, rows, deleted } = fakeStorage()
    const tileBytes = estimateChunkTileBytes(tile())
    const budget = tileBytes * 2 + 1

    for (const cx of [1, 2, 3]) {
      const p = params({ cx })
      await persistChunkTile(SEED, p, chunkTileFingerprint(p), tile(), storage, budget)
    }

    expect(deleted).toEqual([`${SEED}/${CHUNK_TILE_CACHE_NAMESPACE}/${CHUNK_TILE_CACHE_VERSION}/${chunkTileSubKey(1, -2)}`])
    expect(rows.has(`${SEED}/${CHUNK_TILE_CACHE_NAMESPACE}/${CHUNK_TILE_CACHE_VERSION}/${chunkTileSubKey(3, -2)}`)).toBe(true)

    const meta = rows.get(`${SEED}/${CHUNK_TILE_CACHE_NAMESPACE}/${CHUNK_TILE_CACHE_VERSION}/${CHUNK_TILE_META_SUBKEY}`) as
      { payload: { entries: { subKey: string }[] } }
    expect(meta.payload.entries.map((e) => e.subKey).sort()).toEqual([chunkTileSubKey(2, -2), chunkTileSubKey(3, -2)])
    expect(getChunkTileCacheStats().evictions).toBe(1)
  })

  it('a cache hit performs no write transaction', async () => {
    const { storage } = fakeStorage()
    const p = params()
    const fp = chunkTileFingerprint(p)
    await persistChunkTile(SEED, p, fp, tile(), storage)
    const writes = vi.fn(storage.put)
    const hit = await loadCachedChunkTile(SEED, p, fp, { ...storage, put: writes as ChunkTileCacheStorage['put'] })
    expect(hit).not.toBeNull()
    expect(writes).not.toHaveBeenCalled()
  })

  it('counts hits (worker jobs avoided), misses and writes', async () => {
    const { storage } = fakeStorage()
    const p = params()
    const fp = chunkTileFingerprint(p)
    expect(await loadCachedChunkTile(SEED, p, fp, storage)).toBeNull()
    await persistChunkTile(SEED, p, fp, tile(), storage)
    expect(await loadCachedChunkTile(SEED, p, fp, storage)).not.toBeNull()
    const s = getChunkTileCacheStats()
    expect(s.misses).toBe(1)
    expect(s.hits).toBe(1)
    expect(s.writes).toBe(1)
    expect(s.bytesWritten).toBeGreaterThan(0)
  })
})
