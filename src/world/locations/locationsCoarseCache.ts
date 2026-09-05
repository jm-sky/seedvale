import type { RawSampleParams } from '../../terrain/chunkHeightmap'
import { cacheKey, type CacheRecord, enforceCacheCap, listCacheRecords, putCacheRecords } from '../../persistence/worldgenCacheDb'

/**
 * @domain world
 * @system worldgen-cache
 * @role Persistent-cache integration for `WorldLocationCatalog`'s coarse
 *  terrain tiles (plan world-015 §7/§11/§15) — reuses the exact tile shape
 *  `worldLocationCatalog.ts` already keeps in memory (`Uint8Array` state +
 *  `Float32Array` height per 16×16 tile), never a second coarse-terrain
 *  representation.
 * @integration The catalog stays fully synchronous; this module owns the
 *  async IndexedDB side (hydrate-on-activate, debounced dirty-tile upsert)
 *  behind a synchronous `hydrateTile`/`onTileDirty` seam the catalog calls
 *  through its `WorldLocationCatalogDeps`. A hydrate miss or write failure
 *  always falls back to normal procedural sampling — this is an optimization
 *  layer, never a correctness dependency.
 */

export const LOCATIONS_COARSE_NAMESPACE = 'locations-coarse'
/** Bump on any change to the tile payload shape or `classifyCoarseCell`'s
 *  algorithm — an old-version record is a cache miss, never migrated
 *  (plan §12). */
export const LOCATIONS_COARSE_VERSION = 1

export type CoarseTilePayload = { state: Uint8Array, height: Float32Array }

export function tileSubKey(tx: number, tz: number): string {
  return `tile:${tx}:${tz}`
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(',')}}`
}

/** Non-cryptographic 64-bit-ish string hash (two 32-bit lanes) — collisions
 *  only degrade the cache (a false-positive fingerprint match is
 *  astronomically unlikely and would just mean stale-looking-valid coarse
 *  bytes get reused; a mismatch only ever causes a harmless miss), never
 *  correctness of gameplay itself. */
function hashString(s: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (h1 >>> 0).toString(36) + (h2 >>> 0).toString(36)
}

/** Fingerprints every deterministic input `classifyCoarseCell` samples
 *  through (plan §8) — the full `RawSampleParams` a given world build uses,
 *  not a hand-picked subset that could quietly miss a newly-added terrain
 *  field. `seed` is already part of the cache's top-level key, but including
 *  it here too is harmless (just redundant), not incorrect. */
export function locationsCoarseFingerprint(params: RawSampleParams): string {
  return hashString(stableStringify(params))
}

const DEFAULT_DEBOUNCE_MS = 4000
/** Plan §17 bounded-cleanup seam — no quota manager, just an LRU-ish cap per
 *  seed. ~4000 tiles is generous relative to how far a normal playthrough's
 *  Near/Guard/Far queries actually range. */
const DEFAULT_MAX_TILES_PER_SEED = 4000

export type CoarseCachePersistence = {
  /** Call once at catalog creation and again after every world rebuild (new
   *  seed or terrain-param change, i.e. alongside `invalidateScanCache()`) —
   *  resets in-memory hydrate/dirty state for the new identity and kicks off
   *  a best-effort async hydrate. Never blocks the caller. */
  activate(seed: number, fingerprint: string): void
  /** Synchronous read seam for `WorldLocationCatalog.getTile()` — already-
   *  hydrated data for `(tx, tz)`, or `null` (cold, never persisted, or
   *  hydrate still in flight; caller falls back to normal sampling). */
  hydrateTile(tx: number, tz: number): CoarseTilePayload | null
  /** Marks `(tx, tz)` dirty for batched async persistence. `tile` is the
   *  catalog's own live `Uint8Array`/`Float32Array` pair — safe to hand
   *  straight to `IDBObjectStore.put()`, which structured-clones
   *  synchronously before this function returns. */
  onTileDirty(tx: number, tz: number, tile: CoarseTilePayload): void
  dispose(): void
}

export function createCoarseCachePersistence(options?: { debounceMs?: number, maxTilesPerSeed?: number }): CoarseCachePersistence {
  const debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const maxTilesPerSeed = options?.maxTilesPerSeed ?? DEFAULT_MAX_TILES_PER_SEED

  let generation = 0
  let currentSeed = 0
  let currentFingerprint = ''
  let hydrated = new Map<string, CoarseTilePayload>()
  const dirty = new Map<string, { tx: number, tz: number, tile: CoarseTilePayload }>()
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  function activate(seed: number, fingerprint: string): void {
    generation++
    const myGeneration = generation
    currentSeed = seed
    currentFingerprint = fingerprint
    hydrated = new Map()
    dirty.clear()
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }

    const prefix = `${seed}/${LOCATIONS_COARSE_NAMESPACE}/${LOCATIONS_COARSE_VERSION}/`
    void listCacheRecords<CoarseTilePayload>(seed, LOCATIONS_COARSE_NAMESPACE, LOCATIONS_COARSE_VERSION).then((records) => {
      // A rebuild (new seed / new terrain params) may have happened while
      // this read was in flight — never apply a stale hydrate onto a catalog
      // that has since moved on to a different world identity (plan §9).
      if (disposed || myGeneration !== generation) return
      const next = new Map<string, CoarseTilePayload>()
      for (const record of records) {
        if (record.fingerprint !== fingerprint) continue
        if (!record.key.startsWith(prefix)) continue
        next.set(record.key.slice(prefix.length), record.payload)
      }
      hydrated = next
    }).catch(() => {})
  }

  function hydrateTile(tx: number, tz: number): CoarseTilePayload | null {
    return hydrated.get(tileSubKey(tx, tz)) ?? null
  }

  function scheduleFlush(): void {
    if (flushTimer) return
    flushTimer = setTimeout(() => {
      flushTimer = null
      void flush()
    }, debounceMs)
  }

  async function flush(): Promise<void> {
    if (dirty.size === 0) return
    const seed = currentSeed
    const fingerprint = currentFingerprint
    const entries = [...dirty.values()]
    dirty.clear()
    const now = Date.now()
    const records: CacheRecord<CoarseTilePayload>[] = entries.map(({ tx, tz, tile }) => ({
      key: cacheKey(seed, LOCATIONS_COARSE_NAMESPACE, LOCATIONS_COARSE_VERSION, tileSubKey(tx, tz)),
      seed,
      namespace: LOCATIONS_COARSE_NAMESPACE,
      version: LOCATIONS_COARSE_VERSION,
      fingerprint,
      payload: tile,
      lastAccessedAt: now,
    }))
    await putCacheRecords(records)
    await enforceCacheCap(seed, LOCATIONS_COARSE_NAMESPACE, LOCATIONS_COARSE_VERSION, maxTilesPerSeed)
  }

  function onTileDirty(tx: number, tz: number, tile: CoarseTilePayload): void {
    dirty.set(tileSubKey(tx, tz), { tx, tz, tile })
    scheduleFlush()
  }

  function dispose(): void {
    disposed = true
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
  }

  return { activate, hydrateTile, onTileDirty, dispose }
}
