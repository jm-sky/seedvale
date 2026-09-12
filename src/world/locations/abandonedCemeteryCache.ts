import type { RawSampleParams } from '../../terrain/chunkHeightmap'
import { cacheKey, type CacheRecord, enforceCacheCap, listCacheRecords, putCacheRecords } from '../../persistence/worldgenCacheDb'

/**
 * @domain world
 * @system worldgen-cache
 * @role Persistent-cache integration for abandoned-cemetery materialization
 *  (plan world-025) — stores the deterministic result of a roll-pass
 *  `ChunkManager.probeAbandonedCemeteryAtChunk()` so later Near/Guard/Far
 *  discovery, other saves on the same seed, and later sessions can skip the
 *  expensive `paramsFor` + terrain-sampler path.
 * @integration Disposable derived data only. A miss or storage failure always
 *  falls back to the canonical ChunkManager probe. Never player discovery
 *  state, never a second cemetery resolver.
 */

export const ABANDONED_CEMETERY_NAMESPACE = 'abandoned-cemeteries'
/** Bump on any change to the cached payload shape or abandoned-cemetery
 *  placement algorithm — an old-version record is a cache miss, never migrated. */
export const ABANDONED_CEMETERY_VERSION = 1

export type CachedAbandonedCemeteryResult =
  | { status: 'none' }
  | { status: 'found'; id: string; x: number; z: number }

export function chunkSubKey(cx: number, cz: number): string {
  return `chunk:${cx}:${cz}`
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const record = value as Record<string, unknown>
  const keys = Object.keys(record).sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(',')}}`
}

/** Non-cryptographic 64-bit-ish string hash (two 32-bit lanes) — collisions
 *  only degrade the cache, never correctness of gameplay itself. */
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

/**
 * Fingerprints every deterministic world/terrain input capable of changing
 * abandoned-cemetery placement: the full `RawSampleParams` a world build uses,
 * plus `chunkSize` (outside that structure, required by `paramsFor` / probe).
 * Nearby settlements and roads are seed-derived; algorithm changes bump
 * `ABANDONED_CEMETERY_VERSION` instead.
 * @domain world
 * @system worldgen-cache
 */
export function abandonedCemeteryFingerprint(params: RawSampleParams, chunkSize: number): string {
  return hashString(stableStringify({ params, chunkSize }))
}

function isCachedAbandonedCemeteryResult(value: unknown): value is CachedAbandonedCemeteryResult {
  if (value === null || typeof value !== 'object') return false
  const record = value as { status?: unknown, id?: unknown, x?: unknown, z?: unknown }
  if (record.status === 'none') return true
  return record.status === 'found'
    && typeof record.id === 'string'
    && typeof record.x === 'number'
    && typeof record.z === 'number'
}

const DEFAULT_DEBOUNCE_MS = 4000
/** Bounded per-seed cap — counts only roll-pass materialization results, not
 *  every world chunk. Far discovery around one origin is hundreds of entries;
 *  4000 covers normal explored regions without constant churn. */
const DEFAULT_MAX_RECORDS_PER_SEED = 4000

export type AbandonedCemeteryCache = {
  /** Call once at catalog creation and again after every world rebuild.
   *  Resets session identity and starts a best-effort async hydrate. Never
   *  blocks the caller. */
  activate(seed: number, fingerprint: string): void
  /** Synchronous session lookup. `undefined` is a miss (hydrate incomplete,
   *  never persisted, or different identity) — not a cached negative. */
  lookup(cx: number, cz: number): CachedAbandonedCemeteryResult | undefined
  /** Inserts into the session map immediately, then schedules persistence. */
  remember(cx: number, cz: number, result: CachedAbandonedCemeteryResult): void
  /** Resolves when the current activation's hydrate has finished (hit, empty
   *  store, or storage failure). A later `activate()` starts a new generation. */
  ready(): Promise<void>
  dispose(): void
}

/**
 * Session + persistent cache for roll-pass abandoned-cemetery results.
 * @domain world
 * @system worldgen-cache
 */
export function createAbandonedCemeteryCache(options?: {
  debounceMs?: number
  maxRecordsPerSeed?: number
}): AbandonedCemeteryCache {
  const debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const maxRecordsPerSeed = options?.maxRecordsPerSeed ?? DEFAULT_MAX_RECORDS_PER_SEED

  let generation = 0
  let currentSeed = 0
  let currentFingerprint = ''
  let session = new Map<string, CachedAbandonedCemeteryResult>()
  const dirty = new Map<string, { cx: number, cz: number, result: CachedAbandonedCemeteryResult }>()
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let disposed = false
  let readyPromise: Promise<void> = Promise.resolve()

  function activate(seed: number, fingerprint: string): void {
    generation++
    const myGeneration = generation
    currentSeed = seed
    currentFingerprint = fingerprint
    session = new Map()
    dirty.clear()
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }

    let settleReady!: () => void
    readyPromise = new Promise<void>((resolve) => {
      settleReady = resolve
    })

    const prefix = `${seed}/${ABANDONED_CEMETERY_NAMESPACE}/${ABANDONED_CEMETERY_VERSION}/`
    void listCacheRecords<CachedAbandonedCemeteryResult>(
      seed,
      ABANDONED_CEMETERY_NAMESPACE,
      ABANDONED_CEMETERY_VERSION,
    ).then((records) => {
      if (disposed || myGeneration !== generation) return
      for (const record of records) {
        if (record.fingerprint !== fingerprint) continue
        if (!record.key.startsWith(prefix)) continue
        const subKey = record.key.slice(prefix.length)
        // Keep any `remember()` that landed while hydrate was in flight.
        if (session.has(subKey)) continue
        if (!isCachedAbandonedCemeteryResult(record.payload)) continue
        session.set(subKey, record.payload)
      }
    }).catch(() => {
      // Hydrate failure is an empty session for this generation — callers
      // fall back to canonical probing.
    }).finally(() => {
      settleReady()
    })
  }

  function lookup(cx: number, cz: number): CachedAbandonedCemeteryResult | undefined {
    return session.get(chunkSubKey(cx, cz))
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
    const records: CacheRecord<CachedAbandonedCemeteryResult>[] = entries.map(({ cx, cz, result }) => ({
      key: cacheKey(seed, ABANDONED_CEMETERY_NAMESPACE, ABANDONED_CEMETERY_VERSION, chunkSubKey(cx, cz)),
      seed,
      namespace: ABANDONED_CEMETERY_NAMESPACE,
      version: ABANDONED_CEMETERY_VERSION,
      fingerprint,
      payload: result,
      lastAccessedAt: now,
    }))
    await putCacheRecords(records)
    await enforceCacheCap(seed, ABANDONED_CEMETERY_NAMESPACE, ABANDONED_CEMETERY_VERSION, maxRecordsPerSeed)
  }

  function remember(cx: number, cz: number, result: CachedAbandonedCemeteryResult): void {
    const key = chunkSubKey(cx, cz)
    session.set(key, result)
    dirty.set(key, { cx, cz, result })
    scheduleFlush()
  }

  function dispose(): void {
    disposed = true
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
  }

  return { activate, lookup, remember, ready: () => readyPromise, dispose }
}
