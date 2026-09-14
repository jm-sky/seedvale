import type { RawSampleParams } from '../../terrain/chunkHeightmap'
import type { CaveArchetype } from './caveArchetype'
import type { CaveContentAnchor } from './caveContentAnchors'
import type { CaveHeightfieldRepresentation } from './caveHeightfieldRepresentation'
import type { CaveTopology } from './caveTopology'
import type { CaveUndergroundPool } from './caveUndergroundPool'
import {
  cacheKey,
  type CacheRecord,
  enforceCacheCap,
  listCacheRecords,
  putCacheRecords,
} from '../../persistence/worldgenCacheDb'
import { worldgenFingerprint } from '../../persistence/worldgenFingerprint'
import { CAVE_CONTENT_ANCHOR_ROLES } from './caveContentAnchors'

/**
 * @domain world-terrain
 * @system worldgen-cache
 * @role Persistent-cache adapter for Cave V2 *retained worldgen* (plan
 *  world-terrain-030): the accepted `{ archetype, topology }` manifest plus,
 *  per accepted cave, its retained `CaveHeightfieldRepresentation`, content
 *  anchors and dungeon pool. Stores the existing canonical cave domain types
 *  verbatim — there is deliberately no cache-specific cave model, no second
 *  spatial representation and no `SaveData` field.
 * @integration Disposable derived data only. `createCaves()` stays fully
 *  synchronous and fully deterministic without this module; a miss, a
 *  malformed record or an IndexedDB failure always falls back to normal
 *  generation. Never presentation/Three.js state, never quest, container,
 *  loot, fauna or discovery consequences of an anchor.
 */

export const CAVES_V2_NAMESPACE = 'caves-v2'

/**
 * Bump on any change to the cached payload shape **or** to the identity of
 * the code that produces it: cave siting (`pickLargeCaveSites`, including the
 * road-corridor and village exclusion semantics it queries — road geometry is
 * deliberately *not* enumerated in the fingerprint), archetype assignment,
 * production/dungeon topology recipes, mouth geometry, heightfield
 * construction, dungeon-pool rules or content-anchor resolution.
 *
 * The fingerprint captures runtime *configuration* inputs; this version
 * captures *algorithm* identity. An old-version record is a plain cache miss
 * — records are never migrated.
 */
export const CAVES_V2_VERSION = 1

/** Generous per-seed cap: one manifest plus every accepted cave, with room
 *  for a little stale fingerprint churn before the least-recently-written
 *  records are dropped. Tens of records, not thousands. */
const DEFAULT_MAX_RECORDS_PER_SEED = 64

export const CAVE_MANIFEST_SUBKEY = 'manifest'

export function caveSubKey(caveId: string): string {
  return `cave:${caveId}`
}

/** One accepted cave in generation order — `assignCaveArchetypes()` owns that
 *  ordering (home adventure guarantee, dungeon guarantee, per-site rolls) and
 *  it must survive the round trip exactly. */
export type CaveManifestEntry = {
  archetype: CaveArchetype
  topology: CaveTopology
}

export type CaveManifestPayload = {
  accepted: readonly CaveManifestEntry[]
}

/** Per-cave derived worldgen worth persisting. `CaveDefinition` and
 *  `DungeonChamber[]` are deliberately absent — both are cheap pure
 *  derivations from `topology`. */
export type CaveDerivedPayload = {
  caveId: string
  heightfield: CaveHeightfieldRepresentation
  contentAnchors: readonly CaveContentAnchor[]
  undergroundPool: CaveUndergroundPool | null
}

/**
 * Pre-resolved, already-validated cache view handed to `createCaves()`. Purely
 * synchronous: gameplay and world construction never await IndexedDB.
 */
export type CaveWorldgenSnapshot = {
  accepted: readonly CaveManifestEntry[]
  /** Validated derived payload for one manifest entry, or `null` when the
   *  record is missing or structurally invalid — that cave alone is rebuilt. */
  derivedFor: (entry: CaveManifestEntry) => CaveDerivedPayload | null
}

/** What `createCaves()` reports back once worldgen finished, so the composition
 *  root can persist only what was actually (re)generated. */
export type CaveWorldgenBuildResult = {
  /** `true` when the accepted list came from a manifest cache hit — the
   *  manifest record then does not need rewriting. */
  manifestHydrated: boolean
  accepted: readonly CaveManifestEntry[]
  /** Derived payloads built fresh in this run (a cold boot, or the per-cave
   *  fallback after a missing/invalid record). */
  freshlyBuilt: readonly CaveDerivedPayload[]
}

/**
 * Fingerprints the deterministic *configuration* inputs Cave V2 worldgen
 * reads: the full `RawSampleParams` of this world build (siting samples
 * height / continentalness / mountain ridge through it, and every heightfield
 * walk surface comes from `sampleBaseHeight`), the water level and coast
 * threshold siting rejects against, and the home settlement footprint radius
 * that shapes the village exclusion discs.
 *
 * Algorithm changes invalidate through `CAVES_V2_VERSION` instead — notably
 * road generation, which `pickLargeCaveSites()` queries via
 * `roadCorridorsNear()` but which is far too large to enumerate here.
 *
 * @domain world-terrain
 * @system worldgen-cache
 */
export function caveWorldgenFingerprint(input: {
  params: RawSampleParams
  waterLevel: number
  coastThreshold: number
  homeFootprintRadius: number
}): string {
  return worldgenFingerprint({
    params: input.params,
    waterLevel: input.waterLevel,
    coastThreshold: input.coastThreshold,
    homeFootprintRadius: input.homeFootprintRadius,
  })
}

const ARCHETYPES: ReadonlySet<string> = new Set<CaveArchetype>(['adventure', 'dungeon', 'natural'])
const ANCHOR_ROLES: ReadonlySet<string> = new Set<string>(CAVE_CONTENT_ANCHOR_ROLES)

function isFinitePoint(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false
  const p = value as { x?: unknown, y?: unknown, z?: unknown }
  return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z)
}

function isValidEntrance(value: unknown): boolean {
  if (!isFinitePoint(value)) return false
  const e = value as { yaw?: unknown, width?: unknown, height?: unknown }
  return Number.isFinite(e.yaw) && Number.isFinite(e.width) && Number.isFinite(e.height)
}

function sameEntrance(a: unknown, b: unknown): boolean {
  const ea = a as Record<string, number>
  const eb = b as Record<string, number>
  return (['x', 'y', 'z', 'yaw', 'width', 'height'] as const).every((k) => ea[k] === eb[k])
}

function isValidTopology(value: unknown, seed: number): value is CaveTopology {
  if (value === null || typeof value !== 'object') return false
  const t = value as Partial<CaveTopology>
  if (typeof t.caveId !== 'string' || t.caveId.length === 0) return false
  if (t.seed !== seed) return false
  if (!Number.isFinite(t.minClearance)) return false
  if (!isValidEntrance(t.entrance)) return false
  if (!Array.isArray(t.nodes) || t.nodes.length === 0) return false
  if (!Array.isArray(t.segments)) return false
  if (!Array.isArray(t.features)) return false
  for (const node of t.nodes) {
    if (typeof node?.id !== 'string' || !isFinitePoint(node?.position)) return false
    if (!Number.isFinite(node?.targetWidth) || !Number.isFinite(node?.targetHeight)) return false
  }
  for (const segment of t.segments) {
    if (typeof segment?.id !== 'string') return false
    if (typeof segment?.from !== 'string' || typeof segment?.to !== 'string') return false
    if (!Array.isArray(segment?.centerline) || segment.centerline.length < 2) return false
    if (!segment.centerline.every(isFinitePoint)) return false
  }
  for (const feature of t.features) {
    if (typeof feature?.id !== 'string' || !isFinitePoint(feature?.position)) return false
  }
  return true
}

/**
 * Structural validation of a persisted manifest. IndexedDB payloads are
 * `unknown` no matter what TypeScript says about the record's type parameter,
 * so every field a cache hit would skip regenerating is checked here.
 * A malformed manifest is a full miss — the normal fresh pipeline runs.
 */
export function validateCaveManifest(payload: unknown, seed: number): CaveManifestPayload | null {
  if (payload === null || typeof payload !== 'object') return null
  const accepted = (payload as { accepted?: unknown }).accepted
  if (!Array.isArray(accepted) || accepted.length === 0) return null
  const seenIds = new Set<string>()
  const entries: CaveManifestEntry[] = []
  for (const entry of accepted) {
    if (entry === null || typeof entry !== 'object') return null
    const { archetype, topology } = entry as { archetype?: unknown, topology?: unknown }
    if (typeof archetype !== 'string' || !ARCHETYPES.has(archetype)) return null
    if (!isValidTopology(topology, seed)) return null
    if (seenIds.has(topology.caveId)) return null
    seenIds.add(topology.caveId)
    entries.push({ archetype: archetype as CaveArchetype, topology })
  }
  return { accepted: entries }
}

function isValidHeightfield(value: unknown, entry: CaveManifestEntry): value is CaveHeightfieldRepresentation {
  if (value === null || typeof value !== 'object') return false
  const hf = value as Partial<CaveHeightfieldRepresentation>
  if (hf.caveId !== entry.topology.caveId) return false
  if (hf.seed !== entry.topology.seed) return false
  if (!Number.isInteger(hf.nx) || !Number.isInteger(hf.nz)) return false
  const nx = hf.nx as number
  const nz = hf.nz as number
  if (nx <= 0 || nz <= 0) return false
  const expected = nx * nz
  for (const field of [hf.floorY, hf.ceilY, hf.surfaceY, hf.coreT]) {
    if (!(field instanceof Float32Array) || field.length !== expected) return false
  }
  if (!Number.isFinite(hf.cellSize) || (hf.cellSize as number) <= 0) return false
  if (!Number.isFinite(hf.originX) || !Number.isFinite(hf.originZ)) return false
  if (!Number.isFinite(hf.minClearance)) return false
  const bounds = hf.bounds as Record<string, unknown> | undefined
  if (bounds === undefined || bounds === null || typeof bounds !== 'object') return false
  if (!(['minX', 'maxX', 'minZ', 'maxZ'] as const).every((k) => Number.isFinite(bounds[k]))) return false
  if (!isValidEntrance(hf.entrance)) return false
  // Cached entrance identity must still agree with the cached topology, or
  // the mouth carve / cutout replay would disagree with the field.
  return sameEntrance(hf.entrance, entry.topology.entrance)
}

function isValidAnchors(value: unknown, caveId: string): value is readonly CaveContentAnchor[] {
  if (!Array.isArray(value)) return false
  const ids = new Set<string>()
  for (const anchor of value) {
    if (anchor === null || typeof anchor !== 'object') return false
    const a = anchor as Partial<CaveContentAnchor>
    if (typeof a.id !== 'string' || a.id.length === 0 || ids.has(a.id)) return false
    ids.add(a.id)
    if (a.caveId !== caveId) return false
    if (typeof a.role !== 'string' || !ANCHOR_ROLES.has(a.role)) return false
    if (!isFinitePoint(a) || !Number.isFinite(a.yaw)) return false
    if (a.sourceNodeId !== undefined && typeof a.sourceNodeId !== 'string') return false
  }
  return true
}

function isValidPool(value: CaveUndergroundPool | null, entry: CaveManifestEntry): boolean {
  // "No pool" is valid here; a *dungeon* without one is rejected separately in
  // `validateCaveDerived`, because that means a stale record, not a pool-less cave.
  if (value === null) return true
  // A non-dungeon cave must never carry a cached pool.
  if (entry.archetype !== 'dungeon') return false
  if (typeof value !== 'object') return false
  const pool = value as Partial<CaveUndergroundPool>
  if (typeof pool.id !== 'string' || pool.caveId !== entry.topology.caveId) return false
  if (typeof pool.chamberNodeId !== 'string') return false
  if (pool.waterSource === null || typeof pool.waterSource !== 'object') return false
  if (!Number.isFinite(pool.waterLevel) || !Number.isFinite(pool.maxDepth)) return false
  if (!isFinitePoint(pool.shorelineApproach)) return false
  const fp = pool.footprint as Record<string, unknown> | undefined
  if (fp === undefined || fp === null || typeof fp !== 'object') return false
  if (fp.caveId !== entry.topology.caveId) return false
  return (['centerX', 'centerZ', 'radiusX', 'radiusZ', 'rotation', 'maxDepth'] as const)
    .every((k) => Number.isFinite(fp[k]))
}

/**
 * Structural validation of one persisted per-cave record against the manifest
 * entry that owns it. Invalid means "rebuild this one cave", never a throw
 * into world creation.
 */
export function validateCaveDerived(payload: unknown, entry: CaveManifestEntry): CaveDerivedPayload | null {
  if (payload === null || typeof payload !== 'object') return null
  const p = payload as Partial<CaveDerivedPayload>
  if (p.caveId !== entry.topology.caveId) return null
  if (!isValidHeightfield(p.heightfield, entry)) return null
  if (!isValidAnchors(p.contentAnchors, entry.topology.caveId)) return null
  const pool = p.undergroundPool ?? null
  if (!isValidPool(pool, entry)) return null
  // A dungeon's pool contract is part of its acceptance — a dungeon record
  // without one is stale, not a partially-usable cave.
  if (entry.archetype === 'dungeon' && pool === null) return null
  return {
    caveId: p.caveId,
    heightfield: p.heightfield,
    contentAnchors: p.contentAnchors,
    undergroundPool: pool,
  }
}

/** Storage seam — injected in tests so cave cache coverage never needs a real
 *  browser IndexedDB. */
export type CaveWorldgenCacheStorage = {
  list: typeof listCacheRecords
  put: typeof putCacheRecords
  cap: typeof enforceCacheCap
}

const DEFAULT_STORAGE: CaveWorldgenCacheStorage = {
  list: listCacheRecords,
  put: putCacheRecords,
  cap: enforceCacheCap,
}

/**
 * Best-effort read of the whole `caves-v2` namespace for `(seed, fingerprint)`.
 * Awaited by `createWorldBundle()` *before* `createCaves()` — starting this
 * read inside the synchronous cave build would resolve only after the
 * expensive work it is supposed to replace.
 *
 * `null` means "generate normally": no records, no valid manifest, or a
 * storage failure.
 *
 * @domain world-terrain
 * @system worldgen-cache
 */
export async function loadCaveWorldgenSnapshot(
  seed: number,
  fingerprint: string,
  storage: CaveWorldgenCacheStorage = DEFAULT_STORAGE,
): Promise<CaveWorldgenSnapshot | null> {
  let records: CacheRecord<unknown>[]
  try {
    records = await storage.list<unknown>(seed, CAVES_V2_NAMESPACE, CAVES_V2_VERSION)
  } catch {
    return null
  }
  const manifestKey = cacheKey(seed, CAVES_V2_NAMESPACE, CAVES_V2_VERSION, CAVE_MANIFEST_SUBKEY)
  const matching = records.filter((r) => r.fingerprint === fingerprint)
  const manifestRecord = matching.find((r) => r.key === manifestKey)
  if (!manifestRecord) return null
  const manifest = validateCaveManifest(manifestRecord.payload, seed)
  if (!manifest) return null

  const derivedByKey = new Map<string, unknown>()
  for (const record of matching) {
    if (record.key === manifestKey) continue
    derivedByKey.set(record.key, record.payload)
  }
  const validated = new Map<string, CaveDerivedPayload | null>()
  return {
    accepted: manifest.accepted,
    derivedFor: (entry) => {
      const caveId = entry.topology.caveId
      const cached = validated.get(caveId)
      if (cached !== undefined) return cached
      const key = cacheKey(seed, CAVES_V2_NAMESPACE, CAVES_V2_VERSION, caveSubKey(caveId))
      const resolved = validateCaveDerived(derivedByKey.get(key), entry)
      validated.set(caveId, resolved)
      return resolved
    },
  }
}

/**
 * Best-effort batched write of whatever this world build actually generated.
 * Deliberately not awaited by world construction — cave availability must
 * never depend on persistence.
 *
 * @domain world-terrain
 * @system worldgen-cache
 */
export async function persistCaveWorldgen(
  seed: number,
  fingerprint: string,
  result: CaveWorldgenBuildResult,
  storage: CaveWorldgenCacheStorage = DEFAULT_STORAGE,
  maxRecordsPerSeed: number = DEFAULT_MAX_RECORDS_PER_SEED,
): Promise<void> {
  const now = Date.now()
  const records: CacheRecord[] = []
  if (!result.manifestHydrated && result.accepted.length > 0) {
    const payload: CaveManifestPayload = { accepted: result.accepted }
    records.push({
      key: cacheKey(seed, CAVES_V2_NAMESPACE, CAVES_V2_VERSION, CAVE_MANIFEST_SUBKEY),
      seed,
      namespace: CAVES_V2_NAMESPACE,
      version: CAVES_V2_VERSION,
      fingerprint,
      payload,
      lastAccessedAt: now,
    })
  }
  for (const derived of result.freshlyBuilt) {
    records.push({
      key: cacheKey(seed, CAVES_V2_NAMESPACE, CAVES_V2_VERSION, caveSubKey(derived.caveId)),
      seed,
      namespace: CAVES_V2_NAMESPACE,
      version: CAVES_V2_VERSION,
      fingerprint,
      payload: derived,
      lastAccessedAt: now,
    })
  }
  if (records.length === 0) return
  try {
    await storage.put(records)
    await storage.cap(seed, CAVES_V2_NAMESPACE, CAVES_V2_VERSION, maxRecordsPerSeed)
  } catch {
    // Persistence is an optimization only — a failed write just means the
    // next boot regenerates normally.
  }
}
