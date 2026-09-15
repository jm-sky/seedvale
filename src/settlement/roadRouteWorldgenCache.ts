import type { HomeVillageSize } from '../config/worldConfig'
import type { RawSampleParams } from '../terrain/chunkHeightmap'
import type { RoadRoute, RoadSegment, RoadSegmentKind, RoutePoint } from './roadNetwork'
import type { RoadRiverCrossing } from './roadRiverCrossing'
import {
  cacheKey,
  type CacheRecord,
  enforceCacheCap,
  listCacheRecords,
  putCacheRecords,
} from '../persistence/worldgenCacheDb'
import { worldgenFingerprint } from '../persistence/worldgenFingerprint'

/**
 * @domain world-terrain
 * @system worldgen-cache
 * @role Persistent-cache adapter for inter-settlement / settlement↔minor-location
 *  `RoadRoute` results (plan world-terrain-029). IndexedDB only hydrates and
 *  extends the module-level `routeCache` in `roadNetwork.ts` — that map stays
 *  the synchronous authority. Cached `null` is a real hit (a deterministic
 *  failed route), never a miss.
 * @integration Disposable derived data only. Route consumers stay synchronous;
 *  a miss, malformed payload or IndexedDB failure always falls back to the
 *  canonical `findRoute()` path. Never `SaveData`, never a second crossing
 *  classifier, never signposts / per-chunk corridors / bridge specs.
 */

export const ROAD_ROUTE_CACHE_NAMESPACE = 'road-routes'

/**
 * Bump on any change to the cached `RoadRoute` / `RoadRiverCrossing` shape
 * **or** to code-defined routing/crossing/placement behaviour that can change
 * output for identical runtime config: `DEFAULT_ROUTING_OPTIONS`, mountain /
 * water / envelope constants, meander/smoothing, `roadRiverCrossing.ts`
 * thresholds, settlement entrance/site generation, or minor-location identity.
 *
 * Runtime config (terrain / region / home size / local search radius) is
 * fingerprinted separately. An old-version record is a plain cache miss —
 * records are never migrated.
 */
export const ROAD_ROUTE_CACHE_VERSION = 1

const DEFAULT_DEBOUNCE_MS = 4000
/** Bounded per-seed cap of requested routes only — never a full pair scan.
 *  A large explored region is hundreds of unique pairs, not thousands. */
const DEFAULT_MAX_RECORDS_PER_SEED = 2048

export type RoadRouteCachePayload = RoadRoute | null

/**
 * Fingerprints the deterministic *configuration* inputs that can move
 * endpoints or change route/crossing geometry: the full `RawSampleParams` a
 * world build uses (terrain samplers, `waterLevel`, and the complete `region`
 * including road-network and river/hydrology config), plus `HOME_RADIUS` /
 * `localSearchRadius` and `homeSize`.
 *
 * Algorithm-only changes bump `ROAD_ROUTE_CACHE_VERSION` instead of being
 * copied into this object.
 *
 * @domain world-terrain
 * @system worldgen-cache
 */
export function roadRouteFingerprint(input: {
  params: RawSampleParams
  localSearchRadius: number
  homeSize?: HomeVillageSize
}): string {
  return worldgenFingerprint({
    params: input.params,
    localSearchRadius: input.localSearchRadius,
    homeSize: input.homeSize ?? null,
  })
}

function isFiniteNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isRoutePoint(value: unknown): value is RoutePoint {
  if (value === null || typeof value !== 'object') return false
  const point = value as { x?: unknown, z?: unknown, h?: unknown, hs?: unknown }
  return isFiniteNum(point.x) && isFiniteNum(point.z) && isFiniteNum(point.h) && isFiniteNum(point.hs)
}

function isRoadSegmentKind(value: unknown): value is RoadSegmentKind {
  return value === 'road' || value === 'path'
}

function isRoadSegment(value: unknown, kind: RoadSegmentKind): value is RoadSegment {
  if (value === null || typeof value !== 'object') return false
  const segment = value as { a?: unknown, b?: unknown, kind?: unknown }
  return isRoutePoint(segment.a) && isRoutePoint(segment.b) && segment.kind === kind
}

function isCrossing(value: unknown): value is RoadRiverCrossing {
  if (value === null || typeof value !== 'object') return false
  const crossing = value as {
    id?: unknown
    kind?: unknown
    x?: unknown
    z?: unknown
    angle?: unknown
    waterWidth?: unknown
    channelWidth?: unknown
    waterH?: unknown
    naturalBedH?: unknown
    crossSin?: unknown
    span?: unknown
  }
  return typeof crossing.id === 'string'
    && crossing.id.length > 0
    && (crossing.kind === 'ford' || crossing.kind === 'bridge')
    && isFiniteNum(crossing.x)
    && isFiniteNum(crossing.z)
    && isFiniteNum(crossing.angle)
    && isFiniteNum(crossing.waterWidth)
    && isFiniteNum(crossing.channelWidth)
    && isFiniteNum(crossing.waterH)
    && isFiniteNum(crossing.naturalBedH)
    && isFiniteNum(crossing.crossSin)
    && isFiniteNum(crossing.span)
}

function pointsMatch(a: RoutePoint, b: RoutePoint): boolean {
  return a.x === b.x && a.z === b.z && a.h === b.h && a.hs === b.hs
}

/**
 * Cheap structural validation of untrusted IndexedDB data. Literal `null` is
 * a valid cached failure. Invalid data is a miss.
 *
 * @domain world-terrain
 * @system worldgen-cache
 */
export function isValidRoadRoutePayload(value: unknown): value is RoadRouteCachePayload {
  if (value === null) return true
  if (value === undefined || typeof value !== 'object') return false
  const route = value as {
    points?: unknown
    segments?: unknown
    kind?: unknown
    crossings?: unknown
  }
  if (!isRoadSegmentKind(route.kind)) return false
  const kind = route.kind
  if (!Array.isArray(route.points) || !Array.isArray(route.segments) || !Array.isArray(route.crossings)) return false
  if (route.points.length < 2) return false
  if (route.segments.length !== route.points.length - 1) return false
  if (!route.points.every(isRoutePoint)) return false
  if (!route.segments.every((segment) => isRoadSegment(segment, kind))) return false
  if (!route.crossings.every(isCrossing)) return false
  for (let i = 0; i < route.segments.length; i++) {
    const segment = route.segments[i]!
    const a = route.points[i]!
    const b = route.points[i + 1]!
    if (!pointsMatch(segment.a, a) || !pointsMatch(segment.b, b)) return false
  }
  return true
}

export type RoadRouteWorldgenCache = {
  /** Call once per world build/rebuild. Resets session identity and starts a
   *  best-effort async hydrate. Never blocks the caller. */
  activate(seed: number, fingerprint: string): void
  /** Drop in-flight hydrate/flush without starting a new one. Used by
   *  `clearRoadNetworkCaches()` so a previous seed cannot repopulate the
   *  freshly cleared runtime map. */
  invalidate(): void
  /** Queue a freshly computed runtime result (including `null`) for debounced
   *  persistence. No-op when the cache is not currently activated. */
  remember(key: string, route: RoadRouteCachePayload): void
  /** Resolves when the current activation's hydrate has finished (hit, empty
   *  store, or storage failure). A later `activate()` / `invalidate()` starts
   *  a new generation. */
  ready(): Promise<void>
  dispose(): void
}

/**
 * Session-identity + IndexedDB adapter. The runtime `Map` lives in
 * `roadNetwork.ts`; this module only hydrates into it and writes misses back.
 *
 * @domain world-terrain
 * @system worldgen-cache
 */
export function createRoadRouteWorldgenCache(options: {
  debounceMs?: number
  maxRecordsPerSeed?: number
  /** Merge one validated hydrated record into the runtime authority.
   *  The caller must keep a runtime-computed value for the same key. */
  hydrateInto: (key: string, route: RoadRouteCachePayload) => void
}): RoadRouteWorldgenCache {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const maxRecordsPerSeed = options.maxRecordsPerSeed ?? DEFAULT_MAX_RECORDS_PER_SEED
  const hydrateInto = options.hydrateInto

  let generation = 0
  let active = false
  let currentSeed = 0
  let currentFingerprint = ''
  const dirty = new Map<string, RoadRouteCachePayload>()
  let flushTimer: ReturnType<typeof setTimeout> | null = null
  let disposed = false
  let readyPromise: Promise<void> = Promise.resolve()

  function cancelFlushTimer(): void {
    if (!flushTimer) return
    clearTimeout(flushTimer)
    flushTimer = null
  }

  function beginGeneration(): number {
    generation++
    dirty.clear()
    cancelFlushTimer()
    return generation
  }

  function activate(seed: number, fingerprint: string): void {
    const myGeneration = beginGeneration()
    active = true
    currentSeed = seed
    currentFingerprint = fingerprint

    let settleReady!: () => void
    readyPromise = new Promise<void>((resolve) => {
      settleReady = resolve
    })

    const prefix = `${seed}/${ROAD_ROUTE_CACHE_NAMESPACE}/${ROAD_ROUTE_CACHE_VERSION}/`
    void listCacheRecords<unknown>(
      seed,
      ROAD_ROUTE_CACHE_NAMESPACE,
      ROAD_ROUTE_CACHE_VERSION,
    ).then((records) => {
      if (disposed || myGeneration !== generation || !active) return
      for (const record of records) {
        if (record.fingerprint !== fingerprint) continue
        if (!record.key.startsWith(prefix)) continue
        if (!isValidRoadRoutePayload(record.payload)) continue
        hydrateInto(record.key.slice(prefix.length), record.payload)
      }
    }).catch(() => {
      // Hydrate failure is an empty session for this generation — callers
      // fall back to canonical routing.
    }).finally(() => {
      settleReady()
    })
  }

  function invalidate(): void {
    beginGeneration()
    active = false
    readyPromise = Promise.resolve()
  }

  function scheduleFlush(): void {
    if (flushTimer) return
    flushTimer = setTimeout(() => {
      flushTimer = null
      void flush()
    }, debounceMs)
  }

  async function flush(): Promise<void> {
    if (!active || dirty.size === 0) return
    const seed = currentSeed
    const fingerprint = currentFingerprint
    const myGeneration = generation
    const entries = [...dirty.entries()]
    dirty.clear()
    const now = Date.now()
    const records: CacheRecord<RoadRouteCachePayload>[] = entries.map(([subKey, payload]) => ({
      key: cacheKey(seed, ROAD_ROUTE_CACHE_NAMESPACE, ROAD_ROUTE_CACHE_VERSION, subKey),
      seed,
      namespace: ROAD_ROUTE_CACHE_NAMESPACE,
      version: ROAD_ROUTE_CACHE_VERSION,
      fingerprint,
      payload,
      lastAccessedAt: now,
    }))
    await putCacheRecords(records)
    if (disposed || myGeneration !== generation) return
    await enforceCacheCap(seed, ROAD_ROUTE_CACHE_NAMESPACE, ROAD_ROUTE_CACHE_VERSION, maxRecordsPerSeed)
  }

  function remember(key: string, route: RoadRouteCachePayload): void {
    if (!active || disposed) return
    dirty.set(key, route)
    scheduleFlush()
  }

  function dispose(): void {
    disposed = true
    active = false
    cancelFlushTimer()
  }

  return { activate, invalidate, remember, ready: () => readyPromise, dispose }
}
