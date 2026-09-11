import type { CemeterySize } from '../settlement/props'
import type { LandmarkKind } from '../terrain/chunkEnvironment'
import type { RawSampleParams } from '../terrain/chunkHeightmap'
import { cemeteryGraveLayout } from '../settlement/props'
import { rotateOffsetY } from '../settlement/propUtils'
import { biomeWeightsAt, forestBiomeAt, forestDensityAt } from '../terrain/biomeRegions'
import {
  sampleContinentalnessAt,
  sampleFloorAt,
  sampleHeightAt,
  sampleMoistureRegionAt,
  sampleMountainRidgeAt,
} from '../terrain/chunkHeightmap'
import { createSeededRandom } from './parseSeed'

/**
 * Deterministic systemic treasure sites (plan world-024).
 * Pure resolver over seed + already-resolved world-place inputs.
 * Does not own meshes, inventory contents, item ownership or lock mutations.
 *
 * Cave treasure is intentionally disabled until a production interior Y
 * placement seam exists for world-generated containers (world-terrain-019).
 *
 * @domain world
 */

export type TreasureSiteId = string
export type TreasureArchetype = 'deepForest' | 'ruins' | 'cave'

export type TreasureLandmarkCandidate = {
  id: string
  kind: LandmarkKind
  x: number
  z: number
  rotationY: number
  scale: number
  cemeterySize?: CemeterySize
}

export type TreasureChestPlacement = {
  containerId: string
  x: number
  z: number
  yaw: number
}

export type BuriedTreasureKeyPlacement = {
  mode: 'buried'
  spotId: string
  landmarkId: string
  landmarkKind: LandmarkKind
  x: number
  z: number
  /** Present only when the burial is a real cemetery grave. */
  graveIndex?: number
  keyInstanceId: string
}

export type AbandonedTreasureKeyPlacement = {
  mode: 'abandoned'
  pickupId: string
  hostId: string
  hostKind: LandmarkKind | 'terrainFallback'
  x: number
  z: number
  keyInstanceId: string
}

export type TreasureKeyPlacement = BuriedTreasureKeyPlacement | AbandonedTreasureKeyPlacement

export type TreasureSiteDefinition = {
  id: TreasureSiteId
  archetype: TreasureArchetype
  placeId: string
  chest: TreasureChestPlacement
  requiredKeyId: string
  key: TreasureKeyPlacement
}

export type TreasureChestDraft = {
  id: TreasureSiteId
  archetype: Exclude<TreasureArchetype, 'cave'>
  placeId: string
  chest: TreasureChestPlacement
  requiredKeyId: string
}

export const TARGET_TREASURE_SITE_COUNT = 2
export const MIN_TREASURE_SITE_SEPARATION = 180
export const MIN_TREASURE_HOME_DIST = 200
export const MAX_TREASURE_HOME_DIST = 640
export const MIN_KEY_DISTANCE = 64
export const MAX_KEY_DISTANCE = 220
export const TREASURE_SITE_SEARCH_CHUNK_RADIUS = 10
export const TREASURE_KEY_SEARCH_CHUNK_RADIUS = 5
export const KEY_HOST_KINDS: readonly LandmarkKind[] = [
  'monolith',
  'stoneCircle',
  'smallRuins',
  'ruins',
  'cemetery',
]
export const RUINS_CHEST_KINDS: readonly LandmarkKind[] = ['smallRuins', 'ruins']

/** Cave interiors still lack a world-generated-container floor-Y seam. */
export const CAVE_TREASURE_ENABLED = false

const DEEP_FOREST_CANDIDATE_COUNT = 40
const SLOPE_REJECT = 0.75
const WATER_MARGIN = 0.35
const MIN_FOREST_FACTOR = 0.55
const CHEST_OFFSET = 2.8
const KEY_HOST_OFFSET_MIN = 2.4
const KEY_HOST_OFFSET_MAX = 4.2
const KEY_FALLBACK_SAMPLES = 12

const SALT_DEEP_FOREST = 0x024a_0001
const SALT_ARCHETYPE = 0x024a_0002
const SALT_CHEST_POSE = 0x024a_0003
const SALT_KEY_HOST = 0x024a_0004
const SALT_KEY_OFFSET = 0x024a_0005
const SALT_BURIAL = 0x024a_0006
const SALT_KEY_FALLBACK = 0x024a_0007
const SALT_GRAVE = 0x024a_0008

function hashMix(seed: number, salt: number): number {
  let h = (seed ^ salt) | 0
  h = Math.imul(h ^ (h >>> 16), 2246822519)
  h = Math.imul(h ^ (h >>> 13), 3266489917)
  return (h ^ (h >>> 16)) >>> 0
}

function hashString(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function treasureSiteId(archetype: TreasureArchetype, placeId: string): TreasureSiteId {
  return `treasure:${archetype}:${placeId}`
}

export function treasureChestId(siteId: TreasureSiteId): string {
  return `world-container:${siteId}`
}

export function treasureKeyInstanceId(siteId: TreasureSiteId): string {
  return `item:treasure-key:${siteId}`
}

export function treasureKeyPickupId(siteId: TreasureSiteId): string {
  return `treasure-key-pickup:${siteId}`
}

export function treasureBuriedSpotId(siteId: TreasureSiteId): string {
  return `treasure-key:${siteId}`
}

export function authoredTreasureReservedIds(input: {
  landmarkId: string
  locationId: string
  chestId: string
  mapPickupId?: string
}): ReadonlySet<string> {
  const ids = [input.landmarkId, input.locationId, input.chestId]
  if (input.mapPickupId) ids.push(input.mapPickupId)
  return new Set(ids)
}

function slopeAt(sampleParams: RawSampleParams, x: number, z: number): number {
  const d = 1.5
  const hx = sampleHeightAt(x + d, z, sampleParams) - sampleHeightAt(x - d, z, sampleParams)
  const hz = sampleHeightAt(x, z + d, sampleParams) - sampleHeightAt(x, z - d, sampleParams)
  return Math.hypot(hx, hz) / (2 * d)
}

function forestFactorAt(sampleParams: RawSampleParams, x: number, z: number): number {
  const floorH = sampleFloorAt(x, z, sampleParams)
  const altitude01 = (floorH - sampleParams.waterLevel) / Math.max(sampleParams.heightScale, 0.001)
  const moisture = sampleMoistureRegionAt(x, z, sampleParams)
  const continentalness = sampleContinentalnessAt(x, z, sampleParams)
  const ridge = sampleMountainRidgeAt(x, z, sampleParams)
  return forestDensityAt(moisture, altitude01, continentalness, ridge, sampleParams.region)
}

function isWalkableTreasureTerrain(sampleParams: RawSampleParams, x: number, z: number): boolean {
  const h = sampleHeightAt(x, z, sampleParams)
  if (h <= sampleParams.waterLevel + WATER_MARGIN) return false
  if (sampleContinentalnessAt(x, z, sampleParams) < sampleParams.region.oceanThreshold) return false
  if (slopeAt(sampleParams, x, z) > SLOPE_REJECT) return false
  const floorH = sampleFloorAt(x, z, sampleParams)
  const altitude01 = (floorH - sampleParams.waterLevel) / Math.max(sampleParams.heightScale, 0.001)
  const moisture = sampleMoistureRegionAt(x, z, sampleParams)
  const swamp = biomeWeightsAt(moisture, altitude01, sampleParams.region).swamp
  return swamp < 0.55
}

function isDeepForestCandidate(sampleParams: RawSampleParams, x: number, z: number): boolean {
  if (!isWalkableTreasureTerrain(sampleParams, x, z)) return false
  const forest = forestFactorAt(sampleParams, x, z)
  if (forest < MIN_FOREST_FACTOR) return false
  return forestBiomeAt(forest) === 'deepForest'
}

/**
 * Analytic deep-forest candidate points. Cheap height/biome samples only —
 * never instantiates chunks or meshes.
 *
 * @domain world
 */
export function sampleDeepForestTreasureCandidates(
  seed: number,
  homeX: number,
  homeZ: number,
  sampleParams: RawSampleParams,
): { x: number, z: number }[] {
  const rng = createSeededRandom(hashMix(seed, SALT_DEEP_FOREST))
  const out: { x: number, z: number }[] = []
  for (let i = 0; i < DEEP_FOREST_CANDIDATE_COUNT; i++) {
    const angle = rng() * Math.PI * 2
    const dist = MIN_TREASURE_HOME_DIST + rng() * (MAX_TREASURE_HOME_DIST - MIN_TREASURE_HOME_DIST)
    const x = homeX + Math.cos(angle) * dist
    const z = homeZ + Math.sin(angle) * dist
    if (!isDeepForestCandidate(sampleParams, x, z)) continue
    out.push({ x, z })
  }
  out.sort((a, b) => a.x - b.x || a.z - b.z)
  return out
}

function inHomeBand(homeX: number, homeZ: number, x: number, z: number): boolean {
  const dist = Math.hypot(x - homeX, z - homeZ)
  return dist >= MIN_TREASURE_HOME_DIST && dist <= MAX_TREASURE_HOME_DIST
}

function pickIndex(seed: number, salt: number, count: number): number {
  if (count <= 0) return 0
  return hashMix(seed, salt) % count
}

function sortLandmarks(landmarks: readonly TreasureLandmarkCandidate[]): TreasureLandmarkCandidate[] {
  return [...landmarks].sort((a, b) => a.id.localeCompare(b.id))
}

function deepForestPlaceId(x: number, z: number): string {
  return `deepForest:${Math.round(x)}:${Math.round(z)}`
}

function chestPose(seed: number, siteId: string, originX: number, originZ: number, baseYaw = 0): TreasureChestPlacement {
  const rng = createSeededRandom(hashMix(seed, hashMix(SALT_CHEST_POSE, hashString(siteId))))
  const yaw = baseYaw + rng() * Math.PI * 2
  return {
    containerId: treasureChestId(siteId),
    x: originX + Math.cos(yaw) * CHEST_OFFSET,
    z: originZ + Math.sin(yaw) * CHEST_OFFSET,
    yaw,
  }
}

export type ResolveTreasureChestDraftsInput = {
  seed: number
  homeX: number
  homeZ: number
  reservedPlaceIds: ReadonlySet<string>
  ruinsCandidates: readonly TreasureLandmarkCandidate[]
  deepForestCandidates: readonly { x: number, z: number }[]
}

/**
 * Chooses a bounded set of chest sites from provided candidates.
 * Does not require every archetype to exist. Never invents a missing place.
 *
 * @domain world
 */
export function resolveTreasureChestDrafts(input: ResolveTreasureChestDraftsInput): TreasureChestDraft[] {
  const { seed, homeX, homeZ, reservedPlaceIds } = input
  const ruins = sortLandmarks(input.ruinsCandidates).filter((c) => {
    if (reservedPlaceIds.has(c.id)) return false
    if (c.kind !== 'smallRuins' && c.kind !== 'ruins') return false
    return inHomeBand(homeX, homeZ, c.x, c.z)
  })
  const forests = [...input.deepForestCandidates]
    .filter((c) => inHomeBand(homeX, homeZ, c.x, c.z))
    .sort((a, b) => a.x - b.x || a.z - b.z)

  const available: Exclude<TreasureArchetype, 'cave'>[] = []
  if (forests.length > 0) available.push('deepForest')
  if (ruins.length > 0) available.push('ruins')
  available.sort((a, b) => a.localeCompare(b))
  if (available.length > 1) {
    const swap = pickIndex(seed, SALT_ARCHETYPE, 2) === 1
    if (swap) available.reverse()
  }

  const drafts: TreasureChestDraft[] = []
  const usedPlaceIds = new Set<string>(reservedPlaceIds)
  for (const archetype of available) {
    if (drafts.length >= TARGET_TREASURE_SITE_COUNT) break
    if (archetype === 'deepForest') {
      const hit = forests.find((c) => {
        const placeId = deepForestPlaceId(c.x, c.z)
        if (usedPlaceIds.has(placeId)) return false
        return drafts.every((d) => Math.hypot(d.chest.x - c.x, d.chest.z - c.z) >= MIN_TREASURE_SITE_SEPARATION)
      })
      if (!hit) continue
      const placeId = deepForestPlaceId(hit.x, hit.z)
      const id = treasureSiteId('deepForest', placeId)
      usedPlaceIds.add(placeId)
      drafts.push({
        id,
        archetype: 'deepForest',
        placeId,
        chest: chestPose(seed, id, hit.x, hit.z),
        requiredKeyId: treasureKeyInstanceId(id),
      })
      continue
    }
    const hit = ruins.find((c) => {
      if (usedPlaceIds.has(c.id)) return false
      return drafts.every((d) => Math.hypot(d.chest.x - c.x, d.chest.z - c.z) >= MIN_TREASURE_SITE_SEPARATION)
    })
    if (!hit) continue
    const id = treasureSiteId('ruins', hit.id)
    usedPlaceIds.add(hit.id)
    drafts.push({
      id,
      archetype: 'ruins',
      placeId: hit.id,
      chest: chestPose(seed, id, hit.x, hit.z, hit.rotationY),
      requiredKeyId: treasureKeyInstanceId(id),
    })
  }
  drafts.sort((a, b) => a.id.localeCompare(b.id))
  return drafts
}

function offsetNearHost(
  seed: number,
  siteId: string,
  hostX: number,
  hostZ: number,
): { x: number, z: number } {
  const rng = createSeededRandom(hashMix(seed, hashMix(SALT_KEY_OFFSET, hashString(siteId))))
  const angle = rng() * Math.PI * 2
  const dist = KEY_HOST_OFFSET_MIN + rng() * (KEY_HOST_OFFSET_MAX - KEY_HOST_OFFSET_MIN)
  return {
    x: hostX + Math.cos(angle) * dist,
    z: hostZ + Math.sin(angle) * dist,
  }
}

function hostsInKeyBand(
  chest: TreasureChestPlacement,
  hosts: readonly TreasureLandmarkCandidate[],
  reservedPlaceIds: ReadonlySet<string>,
  chestPlaceId: string,
): TreasureLandmarkCandidate[] {
  return sortLandmarks(hosts).filter((host) => {
    if (reservedPlaceIds.has(host.id) || host.id === chestPlaceId) return false
    const dist = Math.hypot(host.x - chest.x, host.z - chest.z)
    return dist >= MIN_KEY_DISTANCE && dist <= MAX_KEY_DISTANCE
  })
}

function pickGraveIndex(
  seed: number,
  siteId: string,
  host: TreasureLandmarkCandidate,
): { x: number, z: number, graveIndex: number } | null {
  if (host.kind !== 'cemetery') return null
  const layout = cemeteryGraveLayout(host.cemeterySize ?? 'SM', host.scale)
  if (layout.length === 0) return null
  const index = pickIndex(seed, hashMix(SALT_GRAVE, hashString(siteId)), layout.length)
  const local = layout[index]!
  const rotated = rotateOffsetY(local.x, local.z, host.rotationY)
  return { x: host.x + rotated.x, z: host.z + rotated.z, graveIndex: index }
}

function fallbackKeyPoint(
  seed: number,
  siteId: string,
  chest: TreasureChestPlacement,
  sampleParams?: RawSampleParams,
): { x: number, z: number } {
  const rng = createSeededRandom(hashMix(seed, hashMix(SALT_KEY_FALLBACK, hashString(siteId))))
  for (let i = 0; i < KEY_FALLBACK_SAMPLES; i++) {
    const angle = rng() * Math.PI * 2
    const dist = MIN_KEY_DISTANCE + rng() * (MAX_KEY_DISTANCE - MIN_KEY_DISTANCE)
    const x = chest.x + Math.cos(angle) * dist
    const z = chest.z + Math.sin(angle) * dist
    if (!sampleParams || isWalkableTreasureTerrain(sampleParams, x, z)) return { x, z }
  }
  const angle = (hashMix(seed, hashString(siteId)) / 0xffffffff) * Math.PI * 2
  return {
    x: chest.x + Math.cos(angle) * MIN_KEY_DISTANCE,
    z: chest.z + Math.sin(angle) * MIN_KEY_DISTANCE,
  }
}

function buryAtHost(
  siteId: string,
  host: TreasureLandmarkCandidate,
  pos: { x: number, z: number },
  graveIndex?: number,
): BuriedTreasureKeyPlacement {
  return {
    mode: 'buried',
    spotId: treasureBuriedSpotId(siteId),
    landmarkId: host.id,
    landmarkKind: host.kind,
    x: pos.x,
    z: pos.z,
    graveIndex,
    keyInstanceId: treasureKeyInstanceId(siteId),
  }
}

function resolveKeyPlacement(
  seed: number,
  draft: TreasureChestDraft,
  hosts: readonly TreasureLandmarkCandidate[],
  reservedPlaceIds: ReadonlySet<string>,
  sampleParams?: RawSampleParams,
): TreasureKeyPlacement {
  const inBand = hostsInKeyBand(draft.chest, hosts, reservedPlaceIds, draft.placeId)
  const buryRng = createSeededRandom(hashMix(seed, hashMix(SALT_BURIAL, hashString(draft.id))))
  if (inBand.length > 0) {
    const host = inBand[pickIndex(seed, hashMix(SALT_KEY_HOST, hashString(draft.id)), inBand.length)]!
    const wantBuried = host.kind === 'cemetery' || buryRng() < 0.5
    if (wantBuried) {
      const grave = pickGraveIndex(seed, draft.id, host)
      if (grave) return buryAtHost(draft.id, host, grave, grave.graveIndex)
      const offset = offsetNearHost(seed, draft.id, host.x, host.z)
      return buryAtHost(draft.id, host, offset)
    }
    const offset = offsetNearHost(seed, draft.id, host.x, host.z)
    return {
      mode: 'abandoned',
      pickupId: treasureKeyPickupId(draft.id),
      hostId: host.id,
      hostKind: host.kind,
      x: offset.x,
      z: offset.z,
      keyInstanceId: draft.requiredKeyId,
    }
  }
  const fallback = fallbackKeyPoint(seed, draft.id, draft.chest, sampleParams)
  return {
    mode: 'abandoned',
    pickupId: treasureKeyPickupId(draft.id),
    hostId: `${draft.id}:terrain-fallback`,
    hostKind: 'terrainFallback',
    x: fallback.x,
    z: fallback.z,
    keyInstanceId: draft.requiredKeyId,
  }
}

export type CompleteTreasureSitesInput = {
  seed: number
  drafts: readonly TreasureChestDraft[]
  keyHostsBySiteId: ReadonlyMap<string, readonly TreasureLandmarkCandidate[]>
  reservedPlaceIds: ReadonlySet<string>
  sampleParams?: RawSampleParams
}

/**
 * Attaches a nearby key to each chest draft. Keys never resolve inside the
 * matching chest: they use a min/max distance band, then a terrain fallback.
 *
 * @domain world
 */
export function completeTreasureSites(input: CompleteTreasureSitesInput): TreasureSiteDefinition[] {
  const sites = input.drafts.map((draft) => ({
    id: draft.id,
    archetype: draft.archetype,
    placeId: draft.placeId,
    chest: draft.chest,
    requiredKeyId: draft.requiredKeyId,
    key: resolveKeyPlacement(
      input.seed,
      draft,
      input.keyHostsBySiteId.get(draft.id) ?? [],
      input.reservedPlaceIds,
      input.sampleParams,
    ),
  }))
  return sites.sort((a, b) => a.id.localeCompare(b.id))
}

export type ResolveTreasureSitesInput = ResolveTreasureChestDraftsInput & {
  keyHosts?: readonly TreasureLandmarkCandidate[]
  keyHostsBySiteId?: ReadonlyMap<string, readonly TreasureLandmarkCandidate[]>
  sampleParams?: RawSampleParams
}

/**
 * Convenience wrapper for tests and callers that already have a shared host
 * pool. Production world construction uses the two-phase helpers so key-host
 * probes can be centered on each chosen chest.
 *
 * @domain world
 */
export function resolveTreasureSites(input: ResolveTreasureSitesInput): TreasureSiteDefinition[] {
  const drafts = resolveTreasureChestDrafts(input)
  const keyHostsBySiteId = input.keyHostsBySiteId ?? new Map(
    drafts.map((draft) => [draft.id, input.keyHosts ?? []] as const),
  )
  return completeTreasureSites({
    seed: input.seed,
    drafts,
    keyHostsBySiteId,
    reservedPlaceIds: input.reservedPlaceIds,
    sampleParams: input.sampleParams,
  })
}

export function buriedTreasureKeyPlacements(
  sites: readonly TreasureSiteDefinition[],
): BuriedTreasureKeyPlacement[] {
  return sites.flatMap((site) => site.key.mode === 'buried' ? [site.key] : [])
}

export function abandonedTreasureKeyPickups(
  sites: readonly TreasureSiteDefinition[],
): AbandonedTreasureKeyPlacement[] {
  return sites.flatMap((site) => site.key.mode === 'abandoned' ? [site.key] : [])
}

export function treasureSiteForContainer(
  sites: readonly TreasureSiteDefinition[],
  containerId: string,
): TreasureSiteDefinition | undefined {
  return sites.find((site) => site.chest.containerId === containerId)
}

export type TreasureUnlockAttempt =
  | { kind: 'not-treasure' }
  | { kind: 'open' }
  | { kind: 'unlocked', requiredKeyId: string }
  | { kind: 'locked', requiredKeyId: string }

/**
 * Sparse lock gate: persisted `unlockedIds` plus the deterministic required
 * key identity. Matching uses instance id, never `inventory.has('key')`.
 *
 * @domain world
 */
export function attemptTreasureUnlock(
  sites: readonly TreasureSiteDefinition[],
  unlockedIds: Set<string>,
  containerId: string,
  ownsKey: (requiredKeyId: string) => boolean,
): TreasureUnlockAttempt {
  const site = treasureSiteForContainer(sites, containerId)
  if (!site) return { kind: 'not-treasure' }
  if (unlockedIds.has(containerId)) return { kind: 'open' }
  if (ownsKey(site.requiredKeyId)) {
    unlockedIds.add(containerId)
    return { kind: 'unlocked', requiredKeyId: site.requiredKeyId }
  }
  return { kind: 'locked', requiredKeyId: site.requiredKeyId }
}
