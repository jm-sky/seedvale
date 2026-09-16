import type { HomeVillageSize } from '../config/worldConfig'
import type { RawSampleParams } from '../terrain/chunkHeightmap'
import type { FamilyDef, FamilyMember, RolledVillageSize, VillageSize } from './families'
import type { SettlementDef } from './settlementGenerator'
import type { ClearingArea, ClearingLayout } from './villageClearing'
import type {
  VillageBoundary,
  VillageBuildingPlan,
  VillageCenter,
  VillageEntrance,
  VillageIdentity,
  VillageLandmarkPlan,
  VillagePaddockPlan,
  VillagePastureAnchor,
  VillagePastureFenceSegment,
  VillagePasturePlan,
  VillagePathPlan,
  VillagePlan,
  VillagePlaza,
  VillagePlot,
  VillageZone,
} from './villagePlan'
import {
  cacheKey,
  type CacheRecord,
  enforceCacheCap,
  listCacheRecords,
  putCacheRecords,
} from '../persistence/worldgenCacheDb'
import { worldgenFingerprint } from '../persistence/worldgenFingerprint'

/**
 * @domain settlements
 * @system worldgen-cache
 * @role Persistent-cache adapter for `SettlementDef | null` results (plan
 *  settlements-014). IndexedDB only hydrates and extends the module-level
 *  `defCache` in `settlementPlanCache.ts` — that map stays the synchronous
 *  authority. Cached `null` is a real hit (a cell that deterministically has
 *  no settlement), never a miss.
 * @integration Disposable derived data only. `settlementDefFor()` stays
 *  synchronous; a miss, malformed payload or IndexedDB failure always falls
 *  back to `generateSettlementDef()`. Never `SaveData`, never a second
 *  reduced `VillagePlan`, never economy / household / NPC runtime state.
 */

export const SETTLEMENT_DEFINITION_CACHE_NAMESPACE = 'settlement-definitions'

/**
 * Bump on any change to the cached `SettlementDef` / nested `VillagePlan`
 * shape **or** to code-defined generation that can change output for identical
 * runtime config: site search, layout/planning, family/profession generation,
 * unique naming, authored-resident injection, river-aware placement, or
 * progression-ring selection.
 *
 * Runtime config (terrain / region / home size / local search radius /
 * resolved progression-policy identity) is fingerprinted separately. An
 * old-version record is a plain cache miss — records are never migrated.
 */
export const SETTLEMENT_DEFINITION_CACHE_VERSION = 1

const DEFAULT_DEBOUNCE_MS = 4000
/** Bounded per-seed cap of requested cells only — never a full grid scan.
 *  A large explored region is dozens of unique cells, not thousands. */
const DEFAULT_MAX_RECORDS_PER_SEED = 2048

export type SettlementDefinitionCachePayload = SettlementDef | null

/** Deterministic identity of the resolved near/far size policy, or `null`
 *  when explicit `homeSize` disables rings. */
export type SettlementProgressionIdentity = {
  homeSize: RolledVillageSize
  near: { gx: number, gz: number, minimum: RolledVillageSize } | null
  far: { gx: number, gz: number, minimum: RolledVillageSize } | null
} | null

/**
 * Persistent sub-key for one settlement grid cell. Distinct from the runtime
 * `cellKey()` (`gx_gz`) so the on-disk identity stays explicit.
 *
 * @domain settlements
 * @system worldgen-cache
 */
export function settlementCellSubKey(gx: number, gz: number): string {
  return `cell:${gx}:${gz}`
}

/** Inverse of {@link settlementCellSubKey}; `null` for a malformed sub-key. */
export function parseSettlementCellSubKey(subKey: string): { gx: number, gz: number } | null {
  const match = /^cell:(-?\d+):(-?\d+)$/.exec(subKey)
  if (!match) return null
  const gx = Number(match[1])
  const gz = Number(match[2])
  if (!Number.isInteger(gx) || !Number.isInteger(gz)) return null
  return { gx, gz }
}

/**
 * Fingerprints the deterministic *configuration* inputs that can change
 * settlement generation besides seed/cell: the full `RawSampleParams` a world
 * build uses (height/terrain samplers, `waterLevel`, `heightScale`, complete
 * `region` including hydrology used by canonical `RiverQuery`), plus
 * `localSearchRadius`, `homeSize`, and the resolved progression-policy
 * identity (selected minimum-size cells).
 *
 * Algorithm-only changes bump `SETTLEMENT_DEFINITION_CACHE_VERSION` instead.
 *
 * @domain settlements
 * @system worldgen-cache
 */
export function settlementDefinitionFingerprint(input: {
  params: RawSampleParams
  localSearchRadius: number
  homeSize?: HomeVillageSize
  progression: SettlementProgressionIdentity
}): string {
  return worldgenFingerprint({
    params: input.params,
    localSearchRadius: input.localSearchRadius,
    homeSize: input.homeSize ?? null,
    progression: input.progression,
  })
}

function isFiniteNum(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

const VILLAGE_SIZES: readonly VillageSize[] = ['SM', 'MD', 'LG', 'XL', 'OUTPOST']
const TERRAINS = ['ocean', 'mountain', 'swamp', 'desert', 'forest'] as const
const NAME_CULTURES = ['polish', 'spanish', 'english'] as const
const FOOD_SOURCES = ['field', 'fishing', 'foraging', 'garden'] as const
const CHARACTERS = ['default', 'closed'] as const
const LAYOUT_PATTERNS = ['central', 'linear', 'clustered', 'roadside', 'waterfront'] as const
const ZONE_KINDS = ['residential', 'public', 'production', 'food', 'livestock', 'utility'] as const
const PLOT_ROLES = ['house', 'work', 'food', 'livestock', 'infrastructure', 'sale'] as const
const BUILDING_ROLES = ['residential', 'production', 'food', 'livestock', 'utility', 'public'] as const
const LANDMARK_KINDS = ['well', 'stockpile', 'garden', 'market', 'campfire', 'noticeBoard', 'home', 'dock', 'field'] as const
const PATH_KINDS = ['path', 'road'] as const
const FAMILY_RELATIONS = ['husband', 'wife', 'child', 'single'] as const

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
}

function isXzY(value: unknown): value is { x: number, z: number, y: number } {
  if (value === null || typeof value !== 'object') return false
  const record = value as { x?: unknown, z?: unknown, y?: unknown }
  return isFiniteNum(record.x) && isFiniteNum(record.z) && isFiniteNum(record.y)
}

function isXzRadius(value: unknown): value is { x: number, z: number, radius: number } {
  if (value === null || typeof value !== 'object') return false
  const record = value as { x?: unknown, z?: unknown, radius?: unknown }
  return isFiniteNum(record.x) && isFiniteNum(record.z) && isFiniteNum(record.radius)
}

function isClearingArea(value: unknown): value is ClearingArea {
  if (!isXzRadius(value)) return false
  return isFiniteNum((value as { targetH?: unknown }).targetH)
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isNullableInteger(value: unknown): value is number | null {
  return value === null || isInteger(value)
}

function isFamilyMember(value: unknown): value is FamilyMember {
  if (value === null || typeof value !== 'object') return false
  const member = value as {
    name?: unknown
    lastName?: unknown
    relation?: unknown
    character?: unknown
    scale?: unknown
    age?: unknown
  }
  if (!isNonEmptyString(member.name) || typeof member.lastName !== 'string') return false
  if (!isOneOf(member.relation, FAMILY_RELATIONS)) return false
  if (!isFiniteNum(member.scale) || !isInteger(member.age)) return false
  if (member.character === null || typeof member.character !== 'object') return false
  const character = member.character as { name?: unknown, gender?: unknown, role?: unknown, personality?: unknown, traits?: unknown }
  return isNonEmptyString(character.name)
    && (character.gender === 'male' || character.gender === 'female')
    && isNonEmptyString(character.role)
    && character.personality !== null
    && typeof character.personality === 'object'
    && Array.isArray(character.traits)
}

function isFamilyDef(value: unknown): value is FamilyDef {
  if (value === null || typeof value !== 'object') return false
  const family = value as { id?: unknown, members?: unknown }
  return isNonEmptyString(family.id) && Array.isArray(family.members) && family.members.every(isFamilyMember)
}

function isClearingLayout(value: unknown): value is ClearingLayout {
  if (value === null || typeof value !== 'object') return false
  const layout = value as { core?: unknown, houses?: unknown, gardens?: unknown, regional?: unknown }
  if (!isClearingArea(layout.core)) return false
  if (!Array.isArray(layout.houses) || !layout.houses.every(isClearingArea)) return false
  if (!Array.isArray(layout.gardens) || !layout.gardens.every(isClearingArea)) return false
  if (layout.regional === null || typeof layout.regional !== 'object') return false
  const regional = layout.regional as {
    x?: unknown
    z?: unknown
    radius?: unknown
    targetH?: unknown
    heightStrength?: unknown
  }
  return isFiniteNum(regional.x)
    && isFiniteNum(regional.z)
    && isFiniteNum(regional.radius)
    && isFiniteNum(regional.targetH)
    && isFiniteNum(regional.heightStrength)
}

function isVillageIdentity(value: unknown, gx: number, gz: number, id: string): value is VillageIdentity {
  if (value === null || typeof value !== 'object') return false
  const identity = value as {
    id?: unknown
    cell?: unknown
    isHome?: unknown
    size?: unknown
    terrain?: unknown
    dominantResource?: unknown
    foodSourceType?: unknown
    name?: unknown
    nameCulture?: unknown
    character?: unknown
  }
  if (identity.id !== id) return false
  if (identity.cell === null || typeof identity.cell !== 'object') return false
  const cell = identity.cell as { gx?: unknown, gz?: unknown }
  if (cell.gx !== gx || cell.gz !== gz) return false
  if (typeof identity.isHome !== 'boolean') return false
  if (identity.isHome !== (gx === 0 && gz === 0)) return false
  if (!isOneOf(identity.size, VILLAGE_SIZES)) return false
  if (!isOneOf(identity.terrain, TERRAINS)) return false
  if (!isOneOf(identity.foodSourceType, FOOD_SOURCES)) return false
  if (!isNonEmptyString(identity.name)) return false
  if (!isOneOf(identity.nameCulture, NAME_CULTURES)) return false
  if (!isOneOf(identity.character, CHARACTERS)) return false
  return identity.dominantResource === null || isNaturalResource(identity.dominantResource)
}

function isNaturalResource(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false
  const resource = value as { id?: unknown, type?: unknown, x?: unknown, z?: unknown, radius?: unknown, richness?: unknown }
  return isNonEmptyString(resource.id)
    && isNonEmptyString(resource.type)
    && isFiniteNum(resource.x)
    && isFiniteNum(resource.z)
    && isFiniteNum(resource.radius)
    && isFiniteNum(resource.richness)
}

function isBoundary(value: unknown): value is VillageBoundary {
  if (value === null || typeof value !== 'object') return false
  const boundary = value as { kind?: unknown, x?: unknown, z?: unknown, radius?: unknown }
  return boundary.kind === 'circle' && isFiniteNum(boundary.x) && isFiniteNum(boundary.z) && isFiniteNum(boundary.radius)
}

function isPlaza(value: unknown): value is VillagePlaza {
  return isXzRadius(value)
}

function isCenter(value: unknown): value is VillageCenter {
  return isXzY(value)
}

function isZone(value: unknown): value is VillageZone {
  if (value === null || typeof value !== 'object') return false
  const zone = value as { id?: unknown, kind?: unknown, x?: unknown, z?: unknown, radius?: unknown }
  return isNonEmptyString(zone.id)
    && isOneOf(zone.kind, ZONE_KINDS)
    && isFiniteNum(zone.x)
    && isFiniteNum(zone.z)
    && isFiniteNum(zone.radius)
}

function isPlot(value: unknown): value is VillagePlot {
  if (value === null || typeof value !== 'object') return false
  const plot = value as {
    id?: unknown
    role?: unknown
    x?: unknown
    z?: unknown
    y?: unknown
    radius?: unknown
    rotation?: unknown
    zoneId?: unknown
    familyIndex?: unknown
    familyId?: unknown
    price?: unknown
  }
  if (!isNonEmptyString(plot.id) || !isOneOf(plot.role, PLOT_ROLES)) return false
  if (!isFiniteNum(plot.x) || !isFiniteNum(plot.z) || !isFiniteNum(plot.y)) return false
  if (!isFiniteNum(plot.radius) || !isFiniteNum(plot.rotation)) return false
  if (!isNullableString(plot.zoneId) || !isNullableInteger(plot.familyIndex) || !isNullableString(plot.familyId)) return false
  if (plot.price !== undefined && !isFiniteNum(plot.price)) return false
  return true
}

function isBuilding(value: unknown): value is VillageBuildingPlan {
  if (value === null || typeof value !== 'object') return false
  const building = value as {
    id?: unknown
    role?: unknown
    x?: unknown
    z?: unknown
    y?: unknown
    footprint?: unknown
    rotation?: unknown
    plotId?: unknown
    zoneId?: unknown
    familyIndex?: unknown
    familyId?: unknown
  }
  return isNonEmptyString(building.id)
    && isOneOf(building.role, BUILDING_ROLES)
    && isFiniteNum(building.x)
    && isFiniteNum(building.z)
    && isFiniteNum(building.y)
    && isFiniteNum(building.footprint)
    && isFiniteNum(building.rotation)
    && isNullableString(building.plotId)
    && isNullableString(building.zoneId)
    && isNullableInteger(building.familyIndex)
    && isNullableString(building.familyId)
}

function isLandmark(value: unknown): value is VillageLandmarkPlan {
  if (value === null || typeof value !== 'object') return false
  const landmark = value as {
    id?: unknown
    kind?: unknown
    x?: unknown
    z?: unknown
    y?: unknown
    rotation?: unknown
    plotId?: unknown
    index?: unknown
    gardenScale?: unknown
  }
  if (!isNonEmptyString(landmark.id) || !isOneOf(landmark.kind, LANDMARK_KINDS)) return false
  if (!isFiniteNum(landmark.x) || !isFiniteNum(landmark.z) || !isFiniteNum(landmark.y)) return false
  if (!isFiniteNum(landmark.rotation) || !isNullableString(landmark.plotId) || !isInteger(landmark.index)) return false
  if (landmark.gardenScale !== undefined && landmark.gardenScale !== 'S' && landmark.gardenScale !== 'M' && landmark.gardenScale !== 'L') {
    return false
  }
  return true
}

function isPath(value: unknown): value is VillagePathPlan {
  if (value === null || typeof value !== 'object') return false
  const path = value as { id?: unknown, points?: unknown, halfWidth?: unknown, kind?: unknown }
  if (!isNonEmptyString(path.id) || !isOneOf(path.kind, PATH_KINDS) || !isFiniteNum(path.halfWidth)) return false
  if (!Array.isArray(path.points) || path.points.length < 2) return false
  return path.points.every((point) => {
    if (point === null || typeof point !== 'object') return false
    const xz = point as { x?: unknown, z?: unknown }
    return isFiniteNum(xz.x) && isFiniteNum(xz.z)
  })
}

function isEntrance(value: unknown): value is VillageEntrance {
  if (!isXzY(value)) return false
  const entrance = value as { id?: unknown, angle?: unknown, kind?: unknown }
  return isNonEmptyString(entrance.id) && isFiniteNum(entrance.angle) && isOneOf(entrance.kind, PATH_KINDS)
}

function isPastureAnchor(value: unknown): value is VillagePastureAnchor {
  return isXzY(value)
}

function isFenceSegment(value: unknown): value is VillagePastureFenceSegment {
  if (value === null || typeof value !== 'object') return false
  const segment = value as { id?: unknown, ax?: unknown, az?: unknown, bx?: unknown, bz?: unknown }
  return isNonEmptyString(segment.id)
    && isFiniteNum(segment.ax)
    && isFiniteNum(segment.az)
    && isFiniteNum(segment.bx)
    && isFiniteNum(segment.bz)
}

function isPasture(value: unknown): value is VillagePasturePlan {
  if (value === null || typeof value !== 'object') return false
  const pasture = value as {
    id?: unknown
    outsideCore?: unknown
    x?: unknown
    z?: unknown
    y?: unknown
    radius?: unknown
    well?: unknown
    trough?: unknown
    fenceSegments?: unknown
    connection?: unknown
  }
  return isNonEmptyString(pasture.id)
    && pasture.outsideCore === true
    && isFiniteNum(pasture.x)
    && isFiniteNum(pasture.z)
    && isFiniteNum(pasture.y)
    && isFiniteNum(pasture.radius)
    && isPastureAnchor(pasture.well)
    && isPastureAnchor(pasture.trough)
    && isPastureAnchor(pasture.connection)
    && Array.isArray(pasture.fenceSegments)
    && pasture.fenceSegments.every(isFenceSegment)
}

function isPaddock(value: unknown): value is VillagePaddockPlan {
  if (value === null || typeof value !== 'object') return false
  const paddock = value as {
    id?: unknown
    outsideCore?: unknown
    x?: unknown
    z?: unknown
    y?: unknown
    radius?: unknown
    trough?: unknown
    haystack?: unknown
    work?: unknown
    entrance?: unknown
    entranceWidth?: unknown
    fenceSegments?: unknown
    horseSlots?: unknown
  }
  return isNonEmptyString(paddock.id)
    && paddock.outsideCore === true
    && isFiniteNum(paddock.x)
    && isFiniteNum(paddock.z)
    && isFiniteNum(paddock.y)
    && isFiniteNum(paddock.radius)
    && isPastureAnchor(paddock.trough)
    && isPastureAnchor(paddock.haystack)
    && isPastureAnchor(paddock.work)
    && isPastureAnchor(paddock.entrance)
    && isFiniteNum(paddock.entranceWidth)
    && Array.isArray(paddock.fenceSegments)
    && paddock.fenceSegments.every(isFenceSegment)
    && Array.isArray(paddock.horseSlots)
    && paddock.horseSlots.every(isPastureAnchor)
}

function isVillagePlan(value: unknown, gx: number, gz: number, id: string): value is VillagePlan {
  if (value === null || typeof value !== 'object') return false
  const plan = value as {
    identity?: unknown
    site?: unknown
    boundary?: unknown
    center?: unknown
    plaza?: unknown
    pattern?: unknown
    zones?: unknown
    plots?: unknown
    buildings?: unknown
    landmarks?: unknown
    paths?: unknown
    entrances?: unknown
    pasture?: unknown
    paddock?: unknown
  }
  if (!isVillageIdentity(plan.identity, gx, gz, id)) return false
  if (plan.site === null || typeof plan.site !== 'object') return false
  const site = plan.site as { x?: unknown, z?: unknown, y?: unknown, radius?: unknown }
  if (!isFiniteNum(site.x) || !isFiniteNum(site.z) || !isFiniteNum(site.y) || !isFiniteNum(site.radius)) return false
  if (!isBoundary(plan.boundary) || !isCenter(plan.center) || !isPlaza(plan.plaza)) return false
  if (!isOneOf(plan.pattern, LAYOUT_PATTERNS)) return false
  if (!Array.isArray(plan.zones) || !plan.zones.every(isZone)) return false
  if (!Array.isArray(plan.plots) || !plan.plots.every(isPlot)) return false
  if (!Array.isArray(plan.buildings) || !plan.buildings.every(isBuilding)) return false
  if (!Array.isArray(plan.landmarks) || !plan.landmarks.every(isLandmark)) return false
  if (!Array.isArray(plan.paths) || !plan.paths.every(isPath)) return false
  if (!Array.isArray(plan.entrances) || !plan.entrances.every(isEntrance)) return false
  if (plan.pasture !== undefined && !isPasture(plan.pasture)) return false
  if (plan.paddock !== undefined && !isPaddock(plan.paddock)) return false
  return true
}

/**
 * Cheap structural validation of untrusted IndexedDB data. Literal `null` is
 * a valid cached empty cell. Invalid data is a miss.
 *
 * @domain settlements
 * @system worldgen-cache
 */
export function isValidSettlementDefPayload(value: unknown): value is SettlementDefinitionCachePayload {
  if (value === null) return true
  if (value === undefined || typeof value !== 'object') return false
  const def = value as {
    id?: unknown
    gx?: unknown
    gz?: unknown
    x?: unknown
    z?: unknown
    y?: unknown
    size?: unknown
    families?: unknown
    clearings?: unknown
    isHome?: unknown
    terrain?: unknown
    name?: unknown
    nameCulture?: unknown
    dominantResource?: unknown
    foodSourceType?: unknown
    plan?: unknown
  }
  if (!isInteger(def.gx) || !isInteger(def.gz)) return false
  if (def.id !== `${def.gx}_${def.gz}`) return false
  if (!isFiniteNum(def.x) || !isFiniteNum(def.z) || !isFiniteNum(def.y)) return false
  if (!isOneOf(def.size, VILLAGE_SIZES)) return false
  if (!Array.isArray(def.families) || !def.families.every(isFamilyDef)) return false
  if (!isClearingLayout(def.clearings)) return false
  if (typeof def.isHome !== 'boolean') return false
  if (def.isHome !== (def.gx === 0 && def.gz === 0)) return false
  if (!isOneOf(def.terrain, TERRAINS) || !isNonEmptyString(def.name)) return false
  if (!isOneOf(def.nameCulture, NAME_CULTURES) || !isOneOf(def.foodSourceType, FOOD_SOURCES)) return false
  if (def.dominantResource !== null && !isNaturalResource(def.dominantResource)) return false
  if (!isVillagePlan(def.plan, def.gx, def.gz, def.id)) return false
  return def.plan.identity.name === def.name
}

export type SettlementWorldgenCache = {
  /** Call once per world build/rebuild. Resets session identity and starts a
   *  best-effort async hydrate. Never blocks the caller. */
  activate(seed: number, fingerprint: string): void
  /** Drop in-flight hydrate/flush without starting a new one. Used by
   *  `clearSettlementDefCache()` so a previous seed cannot repopulate the
   *  freshly cleared runtime map. */
  invalidate(): void
  /** Queue a freshly computed runtime result (including `null`) for debounced
   *  persistence. No-op when the cache is not currently activated. */
  remember(key: string, def: SettlementDefinitionCachePayload): void
  /** Resolves when the current activation's hydrate has finished (hit, empty
   *  store, or storage failure). A later `activate()` / `invalidate()` starts
   *  a new generation. */
  ready(): Promise<void>
  dispose(): void
}

/**
 * Session-identity + IndexedDB adapter. The runtime `Map` lives in
 * `settlementPlanCache.ts`; this module only hydrates into it and writes
 * misses back.
 *
 * @domain settlements
 * @system worldgen-cache
 */
export function createSettlementWorldgenCache(options: {
  debounceMs?: number
  maxRecordsPerSeed?: number
  /** Merge one validated hydrated record into the runtime authority.
   *  The caller must keep a runtime-computed value for the same key. */
  hydrateInto: (key: string, def: SettlementDefinitionCachePayload) => void
}): SettlementWorldgenCache {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS
  const maxRecordsPerSeed = options.maxRecordsPerSeed ?? DEFAULT_MAX_RECORDS_PER_SEED
  const hydrateInto = options.hydrateInto

  let generation = 0
  let active = false
  let currentSeed = 0
  let currentFingerprint = ''
  const dirty = new Map<string, SettlementDefinitionCachePayload>()
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

    const prefix = `${seed}/${SETTLEMENT_DEFINITION_CACHE_NAMESPACE}/${SETTLEMENT_DEFINITION_CACHE_VERSION}/`
    void listCacheRecords<unknown>(
      seed,
      SETTLEMENT_DEFINITION_CACHE_NAMESPACE,
      SETTLEMENT_DEFINITION_CACHE_VERSION,
    ).then((records) => {
      if (disposed || myGeneration !== generation || !active) return
      for (const record of records) {
        if (record.fingerprint !== fingerprint) continue
        if (!record.key.startsWith(prefix)) continue
        if (!isValidSettlementDefPayload(record.payload)) continue
        hydrateInto(record.key.slice(prefix.length), record.payload)
      }
    }).catch(() => {
      // Hydrate failure is an empty session for this generation — callers
      // fall back to canonical generation.
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
    const records: CacheRecord<SettlementDefinitionCachePayload>[] = entries.map(([subKey, payload]) => ({
      key: cacheKey(seed, SETTLEMENT_DEFINITION_CACHE_NAMESPACE, SETTLEMENT_DEFINITION_CACHE_VERSION, subKey),
      seed,
      namespace: SETTLEMENT_DEFINITION_CACHE_NAMESPACE,
      version: SETTLEMENT_DEFINITION_CACHE_VERSION,
      fingerprint,
      payload,
      lastAccessedAt: now,
    }))
    await putCacheRecords(records)
    if (disposed || myGeneration !== generation) return
    await enforceCacheCap(seed, SETTLEMENT_DEFINITION_CACHE_NAMESPACE, SETTLEMENT_DEFINITION_CACHE_VERSION, maxRecordsPerSeed)
  }

  function remember(key: string, def: SettlementDefinitionCachePayload): void {
    if (!active || disposed) return
    dirty.set(key, def)
    scheduleFlush()
  }

  function dispose(): void {
    disposed = true
    active = false
    cancelFlushTimer()
  }

  return { activate, invalidate, remember, ready: () => readyPromise, dispose }
}
