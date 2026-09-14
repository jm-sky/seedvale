import type { ChunkTileParams } from './chunkHeightmap'
import type { ChunkTileResult } from './chunkHeightmapProtocol'
import {
  cacheKey,
  type CacheRecord,
  deleteCacheRecords,
  getCacheRecord,
  putCacheRecords,
} from '../persistence/worldgenCacheDb'
import { worldgenFingerprint } from '../persistence/worldgenFingerprint'

/**
 * @domain world-terrain
 * @system worldgen-cache
 * @role Persistent-cache adapter for canonical worker-generated chunk tiles
 *  (plan world-terrain-031): one `chunk:<cx>:<cz>` record per chunk holding
 *  the unchanged `ChunkTileResult` — the eight apron-inclusive terrain grids
 *  plus the deterministic vegetation/item/environment/crop placements. Stores
 *  the existing worker contract verbatim; there is deliberately no
 *  cache-specific terrain model and no `SaveData` field.
 * @integration Disposable derived data only. `ChunkManager.ensureLoaded()`
 *  generates exactly the same chunk with an empty cache — a miss, a malformed
 *  record or an IndexedDB failure always falls back to the tile worker. The
 *  payload is *base* worldgen: player/system terrain modifications, terrain
 *  cutouts, tree/crop lifecycle, collected items, resource depletion, mesh
 *  data and every Three.js object stay downstream and are never cached here,
 *  so two same-seed saves share only deterministic generation output.
 */

export const CHUNK_TILE_CACHE_NAMESPACE = 'chunk-tiles'

/**
 * Bump on any change to the cached payload shape **or** to the identity of the
 * code that produces it: `computeChunkTile()` terrain/biome/region/road/river
 * math, or vegetation / item / environment / crop placement rules.
 *
 * `chunkTileFingerprint()` covers the per-chunk *configuration* inputs (it
 * hashes the whole `ChunkTileParams`); this version covers *algorithm*
 * identity. An old-version record is a plain cache miss — records are never
 * migrated.
 */
export const CHUNK_TILE_CACHE_VERSION = 1

/** Small byte-budget manifest record living in the same namespace — see
 *  `ChunkTileMetaPayload`. Its `fingerprint` field is a constant because the
 *  manifest spans every per-chunk fingerprint rather than belonging to one. */
export const CHUNK_TILE_META_SUBKEY = 'meta'
const CHUNK_TILE_META_FINGERPRINT = 'meta'

/**
 * Per-seed byte budget for this namespace (plan implementation notes §10).
 * The eight grids alone cost `8 × (resolution + 2)² × 4` bytes — ~140 KiB per
 * chunk at resolution 65, ~1.16 MiB at resolution 193 — so a count-based cap
 * like `locations-coarse`'s would be unbounded in practice. 128 MiB is roughly
 * two 7×7 high-resolution loaded regions and is independent of every other
 * namespace.
 */
export const CHUNK_TILE_CACHE_BYTE_BUDGET = 128 * 1024 * 1024

/** Conservative flat cost per placement object — placements are small flat
 *  records (tens per chunk), so exact serialized-byte accounting would cost
 *  more than the budget it informs. */
const PLACEMENT_BYTE_ESTIMATE = 128

export function chunkTileSubKey(cx: number, cz: number): string {
  return `chunk:${cx}:${cz}`
}

/**
 * Hashes the exact `ChunkTileParams` the tile worker would receive. Every
 * deterministic input is covered by construction — seed, chunk coordinate,
 * size/resolution, the full terrain/noise/biome/region config, home-chunk and
 * species counts, nearby roads/village paths/clearings/regional smoothing,
 * canonical river-carving segments, cemetery settlements/roads/clearings and
 * authored expedition ruins — so a new `ChunkTileParams` field invalidates
 * affected chunks without anyone maintaining a field list here.
 *
 * @domain world-terrain
 * @system worldgen-cache
 */
export function chunkTileFingerprint(params: ChunkTileParams): string {
  return worldgenFingerprint(params)
}

/** Bounded diagnostic counters (plan §Instrumentation) — plain totals read by
 *  debug tooling, never per-frame logging and never a new observability
 *  framework. `hits` doubles as "tile worker jobs avoided". */
export type ChunkTileCacheStats = {
  hits: number
  misses: number
  /** Records that existed with a matching fingerprint but failed structural
   *  validation — regenerated exactly like a miss. */
  invalid: number
  writes: number
  evictions: number
  readMs: number
  cloneMs: number
  bytesRead: number
  bytesWritten: number
}

const stats: ChunkTileCacheStats = {
  hits: 0,
  misses: 0,
  invalid: 0,
  writes: 0,
  evictions: 0,
  readMs: 0,
  cloneMs: 0,
  bytesRead: 0,
  bytesWritten: 0,
}

export function getChunkTileCacheStats(): Readonly<ChunkTileCacheStats> {
  return { ...stats }
}

export function resetChunkTileCacheStats(): void {
  stats.hits = 0
  stats.misses = 0
  stats.invalid = 0
  stats.writes = 0
  stats.evictions = 0
  stats.readMs = 0
  stats.cloneMs = 0
  stats.bytesRead = 0
  stats.bytesWritten = 0
}

const GRID_FIELDS = [
  'heights',
  'floorHeights',
  'biomes',
  'bodyScale',
  'continentalness',
  'mountainRidge',
  'moistureRegion',
  'roadTint',
] as const

const PLACEMENT_FIELDS = ['vegetation', 'items', 'environment', 'crops'] as const

/** Apron-inclusive texels per grid for `params.resolution`. */
function expectedGridLength(resolution: number): number {
  return (resolution + 2) ** 2
}

/**
 * Structural validation of a persisted tile against the params that are about
 * to use it. IndexedDB payloads are untrusted derived data: a truncated grid,
 * a resolution change that slipped past the fingerprint or a half-written
 * record must degrade to normal worker generation, never reach the mesh
 * builder. A failure here is an ordinary miss — payloads are never migrated.
 *
 * @domain world-terrain
 * @system worldgen-cache
 */
export function validateCachedChunkTile(payload: unknown, params: ChunkTileParams): ChunkTileResult | null {
  if (!payload || typeof payload !== 'object') return null
  const tile = payload as Partial<ChunkTileResult>
  const expected = expectedGridLength(params.resolution)
  for (const field of GRID_FIELDS) {
    const grid = tile[field]
    if (!(grid instanceof Float32Array) || grid.length !== expected) return null
  }
  for (const field of PLACEMENT_FIELDS) {
    const list = tile[field]
    if (!Array.isArray(list)) return null
    for (const entry of list) {
      if (!entry || typeof entry !== 'object') return null
      const p = entry as { x?: unknown, z?: unknown }
      if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) return null
    }
  }
  return tile as ChunkTileResult
}

/** Approximate payload size for the byte budget — the eight grids exactly,
 *  placements by flat estimate. Not browser-quota accounting. */
export function estimateChunkTileBytes(tile: ChunkTileResult): number {
  let bytes = 0
  for (const field of GRID_FIELDS) bytes += tile[field].byteLength
  for (const field of PLACEMENT_FIELDS) bytes += tile[field].length * PLACEMENT_BYTE_ESTIMATE
  return bytes
}

/**
 * Deep copy of a canonical tile for runtime ownership (plan §Critical
 * immutability rule). `attachChunkMesh()` replays every player/system
 * `TerrainModification` into `heights`/`floorHeights`/`roadTint` **in place**,
 * so the object handed to `ChunkRecord.tile` must never be the same object a
 * pending IndexedDB write still holds — otherwise digging in save A would be
 * baked into the deterministic record later reused by save B.
 *
 * Placement objects are flat records and are copied too, so the canonical
 * payload stays immutable even if a future runtime path starts mutating them.
 *
 * @domain world-terrain
 * @system worldgen-cache
 */
export function cloneChunkTileForRuntime(tile: ChunkTileResult): ChunkTileResult {
  const t0 = performance.now()
  const clone: ChunkTileResult = {
    heights: new Float32Array(tile.heights),
    floorHeights: new Float32Array(tile.floorHeights),
    biomes: new Float32Array(tile.biomes),
    bodyScale: new Float32Array(tile.bodyScale),
    continentalness: new Float32Array(tile.continentalness),
    mountainRidge: new Float32Array(tile.mountainRidge),
    moistureRegion: new Float32Array(tile.moistureRegion),
    roadTint: new Float32Array(tile.roadTint),
    vegetation: tile.vegetation.map((p) => ({ ...p })),
    items: tile.items.map((p) => ({ ...p })),
    environment: tile.environment.map((p) => ({ ...p })),
    crops: tile.crops.map((p) => ({ ...p })),
  }
  stats.cloneMs += performance.now() - t0
  return clone
}

/** Storage seam — injected in tests so this namespace's coverage never needs a
 *  real browser IndexedDB, and so the "no namespace-wide hydrate" rule is
 *  testable: `listCacheRecords` is deliberately absent. */
export type ChunkTileCacheStorage = {
  get: typeof getCacheRecord
  put: typeof putCacheRecords
  deleteKeys: typeof deleteCacheRecords
}

const DEFAULT_STORAGE: ChunkTileCacheStorage = {
  get: getCacheRecord,
  put: putCacheRecords,
  deleteKeys: deleteCacheRecords,
}

type ChunkTileMetaEntry = {
  subKey: string
  estimatedBytes: number
  lastAccessedAt: number
}

type ChunkTileMetaPayload = {
  entries: ChunkTileMetaEntry[]
}

type MetaState = {
  seed: number
  entries: Map<string, ChunkTileMetaEntry>
  totalBytes: number
}

let metaState: MetaState | null = null
let metaLoad: Promise<MetaState> | null = null
let metaLoadSeed: number | null = null

function metaFromPayload(seed: number, payload: unknown): MetaState {
  const state: MetaState = { seed, entries: new Map(), totalBytes: 0 }
  const entries = (payload as ChunkTileMetaPayload | null | undefined)?.entries
  if (!Array.isArray(entries)) return state
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue
    const { subKey, estimatedBytes, lastAccessedAt } = entry as Partial<ChunkTileMetaEntry>
    if (typeof subKey !== 'string' || !Number.isFinite(estimatedBytes) || !Number.isFinite(lastAccessedAt)) continue
    state.entries.set(subKey, { subKey, estimatedBytes: estimatedBytes as number, lastAccessedAt: lastAccessedAt as number })
    state.totalBytes += estimatedBytes as number
  }
  return state
}

/** The manifest is tiny and read through the same direct primary-key lookup as
 *  a tile — the namespace is never hydrated wholesale. */
async function ensureMeta(seed: number, storage: ChunkTileCacheStorage): Promise<MetaState> {
  if (metaState?.seed === seed) return metaState
  if (!metaLoad || metaLoadSeed !== seed) {
    metaLoadSeed = seed
    metaLoad = (async () => {
      const record = await storage.get<ChunkTileMetaPayload>(
        seed,
        CHUNK_TILE_CACHE_NAMESPACE,
        CHUNK_TILE_CACHE_VERSION,
        CHUNK_TILE_META_SUBKEY,
      )
      const state = metaFromPayload(seed, record?.payload)
      if (metaLoadSeed === seed) {
        metaState = state
        metaLoad = null
      }
      return state
    })()
  }
  return await metaLoad
}

function metaRecord(seed: number, state: MetaState): CacheRecord<ChunkTileMetaPayload> {
  return {
    key: cacheKey(seed, CHUNK_TILE_CACHE_NAMESPACE, CHUNK_TILE_CACHE_VERSION, CHUNK_TILE_META_SUBKEY),
    seed,
    namespace: CHUNK_TILE_CACHE_NAMESPACE,
    version: CHUNK_TILE_CACHE_VERSION,
    fingerprint: CHUNK_TILE_META_FINGERPRINT,
    payload: { entries: [...state.entries.values()] },
    lastAccessedAt: Date.now(),
  }
}

/** Forgets the in-memory manifest — used by tests and safe at any time: the
 *  manifest is disposable accounting, re-read from storage on next use. */
export function resetChunkTileCacheMetadata(): void {
  metaState = null
  metaLoad = null
  metaLoadSeed = null
}

/**
 * Best-effort direct lookup of one chunk's canonical base tile. Returns the
 * **canonical** object: the caller owns turning it into runtime state through
 * `cloneChunkTileForRuntime()`, exactly as it does for a fresh worker result.
 *
 * `null` means "generate normally" — no record, a fingerprint mismatch, a
 * malformed payload or a storage failure.
 *
 * @domain world-terrain
 * @system worldgen-cache
 */
export async function loadCachedChunkTile(
  seed: number,
  params: ChunkTileParams,
  fingerprint: string,
  storage: ChunkTileCacheStorage = DEFAULT_STORAGE,
): Promise<ChunkTileResult | null> {
  const subKey = chunkTileSubKey(params.cx, params.cz)
  const t0 = performance.now()
  let record: CacheRecord<unknown> | null
  try {
    record = await storage.get<unknown>(seed, CHUNK_TILE_CACHE_NAMESPACE, CHUNK_TILE_CACHE_VERSION, subKey)
  } catch {
    record = null
  }
  stats.readMs += performance.now() - t0
  if (!record || record.fingerprint !== fingerprint) {
    stats.misses++
    return null
  }
  const tile = validateCachedChunkTile(record.payload, params)
  if (!tile) {
    stats.invalid++
    return null
  }
  stats.hits++
  stats.bytesRead += estimateChunkTileBytes(tile)
  // Recency is updated in memory only — a cache *hit* must not cost a write
  // transaction (plan §Bounds/eviction). It reaches storage with the next
  // manifest write, which rides along with the next miss's tile write.
  const state = await ensureMeta(seed, storage)
  const entry = state.entries.get(subKey)
  if (entry) entry.lastAccessedAt = Date.now()
  return tile
}

/**
 * Fire-and-forget write of a freshly generated canonical tile plus the updated
 * byte-budget manifest, evicting least-recently-used tiles by exact key first.
 * Never awaited by chunk loading: persistence must not become chunk-
 * availability latency, and a failed write only means the next visit
 * regenerates normally.
 *
 * `tile` must be the canonical worker result, not `ChunkRecord.tile` — see
 * `cloneChunkTileForRuntime()`.
 *
 * @domain world-terrain
 * @system worldgen-cache
 */
export async function persistChunkTile(
  seed: number,
  params: ChunkTileParams,
  fingerprint: string,
  tile: ChunkTileResult,
  storage: ChunkTileCacheStorage = DEFAULT_STORAGE,
  byteBudget: number = CHUNK_TILE_CACHE_BYTE_BUDGET,
): Promise<void> {
  const subKey = chunkTileSubKey(params.cx, params.cz)
  const estimatedBytes = estimateChunkTileBytes(tile)
  try {
    const state = await ensureMeta(seed, storage)
    const previous = state.entries.get(subKey)
    if (previous) state.totalBytes -= previous.estimatedBytes
    state.entries.set(subKey, { subKey, estimatedBytes, lastAccessedAt: Date.now() })
    state.totalBytes += estimatedBytes

    if (state.totalBytes > byteBudget) {
      const victims = [...state.entries.values()]
        .filter((e) => e.subKey !== subKey)
        .sort((a, b) => a.lastAccessedAt - b.lastAccessedAt)
      const keys: string[] = []
      for (const victim of victims) {
        if (state.totalBytes <= byteBudget) break
        state.entries.delete(victim.subKey)
        state.totalBytes -= victim.estimatedBytes
        keys.push(cacheKey(seed, CHUNK_TILE_CACHE_NAMESPACE, CHUNK_TILE_CACHE_VERSION, victim.subKey))
      }
      if (keys.length > 0) {
        stats.evictions += keys.length
        await storage.deleteKeys(keys)
      }
    }

    const tileRecord: CacheRecord<ChunkTileResult> = {
      key: cacheKey(seed, CHUNK_TILE_CACHE_NAMESPACE, CHUNK_TILE_CACHE_VERSION, subKey),
      seed,
      namespace: CHUNK_TILE_CACHE_NAMESPACE,
      version: CHUNK_TILE_CACHE_VERSION,
      fingerprint,
      payload: tile,
      lastAccessedAt: Date.now(),
    }
    await storage.put([tileRecord, metaRecord(seed, state)])
    stats.writes++
    stats.bytesWritten += estimatedBytes
  } catch {
    // Persistence is an optimization only — a failed write just means this
    // chunk is regenerated by the worker next time.
  }
}
