import type { AnimalHabitatBinding } from '../../fauna/animalCaveHabitat'
import type { PersistentOccupantDecl } from '../../fauna/persistentOccupants'
import type { CaveAdventureProfileReservationRequest } from '../caves/caveAdventureContentPolicy'
import type { CaveContentAnchor } from '../caves/caveContentAnchors'
import type { SaveCarriedContainer } from '../createPlacedContainers'
import type { WorldGeneratedContainerSpec } from '../worldGeneratedContainers'
import { cemeteryGraveLayout, type CemeterySize } from '../../settlement/props'
import { rotateOffsetY } from '../../settlement/propUtils'
import { HIDDEN_FIND_DIG_TOLERANCE } from '../hiddenFinds'
import { caveWorldLocationId } from './darkForestTreasureSite'

/** Stable reservation key for `world-terrain-028` profile arbitration. */
export const TREASURE_MAP_BEAR_CAVE_RESERVATION_KEY = 'quests-progression-008'

export const TREASURE_MAP_BEAR_CAVE_QUEST_ID = 'skarb-jaskini-niedzwiedzia'

/** Single tuning source for full treasure and the 30% hand-in share. */
export const TREASURE_MAP_BEAR_CAVE_COINS = 240

export const TREASURE_MAP_BEAR_CAVE_RETURNED_OUTCOME_ID = 'treasure_returned'
export const TREASURE_MAP_BEAR_CAVE_KEPT_OUTCOME_ID = 'treasure_kept'

function hashMix(seed: number, salt: number): number {
  let h = (seed ^ salt) | 0
  h = Math.imul(h ^ (h >>> 16), 2246822519)
  h = Math.imul(h ^ (h >>> 13), 3266489917)
  return (h ^ (h >>> 16)) >>> 0
}

export type TreasureMapBearCaveCemeteryInput = {
  id: string
  x: number
  z: number
  rotationY: number
  scale: number
  cemeterySize: CemeterySize
}

export type TreasureMapBearCaveCaveInput = {
  caveId: string
  entranceX: number
  entranceZ: number
}

export type ResolveTreasureMapBearCaveInput = {
  seed: number
  homeX: number
  homeZ: number
  adventureCaves: readonly TreasureMapBearCaveCaveInput[]
  contentAnchors: readonly CaveContentAnchor[]
  cemetery: TreasureMapBearCaveCemeteryInput | null
}

export type TreasureMapBearCaveBinding = {
  reservationKey: typeof TREASURE_MAP_BEAR_CAVE_RESERVATION_KEY
  questId: typeof TREASURE_MAP_BEAR_CAVE_QUEST_ID
  caveId: string
  locationId: string
  finalTreasureAnchorId: string
  habitatId: string
  sourceContainerId: string
  casketId: string
  mapGraveSpotId: string
  mapGraveIndex: number
  cemeteryId: string
  authoredCoinAmount: number
  directionPhrase: string | null
}

export function treasureMapBearCaveHabitatId(caveId: string): string {
  return `${caveId}:bear-resident`
}

export function treasureMapBearCaveSourceContainerId(finalTreasureAnchorId: string): string {
  return `world-container:${TREASURE_MAP_BEAR_CAVE_RESERVATION_KEY}:${finalTreasureAnchorId}`
}

export function treasureMapBearCaveCasketId(caveId: string): string {
  return `${TREASURE_MAP_BEAR_CAVE_RESERVATION_KEY}:casket:${caveId}`
}

export function treasureMapBearCaveReturnPayout(coinAmount: number): number {
  return Math.floor(coinAmount * 0.30)
}

function finalTreasureAnchorForCave(
  caveId: string,
  contentAnchors: readonly CaveContentAnchor[],
): CaveContentAnchor | undefined {
  return contentAnchors.find((a) => a.caveId === caveId && a.role === 'finalTreasure')
}

function pickAdventureCave(
  seed: number,
  adventureCaves: readonly TreasureMapBearCaveCaveInput[],
  contentAnchors: readonly CaveContentAnchor[],
): TreasureMapBearCaveCaveInput | null {
  const eligible = adventureCaves
    .filter((cave) => finalTreasureAnchorForCave(cave.caveId, contentAnchors) !== undefined)
    .sort((a, b) => a.caveId.localeCompare(b.caveId))
  if (eligible.length === 0) return null
  const idx = hashMix(seed, 0x008_be4c) % eligible.length
  return eligible[idx] ?? null
}

function pickMapGrave(
  seed: number,
  cemetery: TreasureMapBearCaveCemeteryInput,
): { spotId: string, index: number, x: number, z: number } {
  const layout = cemeteryGraveLayout(cemetery.cemeterySize, cemetery.scale)
  const index = hashMix(seed, 0x0086_4e20) % layout.length
  const offset = layout[index]!
  const rotated = rotateOffsetY(offset.x, offset.z, cemetery.rotationY)
  return {
    spotId: `${cemetery.id}:${index}`,
    index,
    x: cemetery.x + rotated.x,
    z: cemetery.z + rotated.z,
  }
}

/**
 * Deterministic bear-cave quest world binding (plan quests-progression-008).
 * Pure — never scans loaded chunks.
 *
 * @domain quests-progression
 */
export function resolveTreasureMapBearCaveBinding(
  input: ResolveTreasureMapBearCaveInput,
): TreasureMapBearCaveBinding | null {
  const cave = pickAdventureCave(input.seed, input.adventureCaves, input.contentAnchors)
  if (!cave || !input.cemetery) return null
  const anchor = finalTreasureAnchorForCave(cave.caveId, input.contentAnchors)
  if (!anchor) return null
  const grave = pickMapGrave(input.seed, input.cemetery)
  const dx = cave.entranceX - input.homeX
  const dz = cave.entranceZ - input.homeZ
  const directionPhrase = Math.hypot(dx, dz) > 1
    ? `${cardinalDirectionFromDelta(dx, dz)} od osady`
    : null
  return {
    reservationKey: TREASURE_MAP_BEAR_CAVE_RESERVATION_KEY,
    questId: TREASURE_MAP_BEAR_CAVE_QUEST_ID,
    caveId: cave.caveId,
    locationId: caveWorldLocationId(cave.caveId),
    finalTreasureAnchorId: anchor.id,
    habitatId: treasureMapBearCaveHabitatId(cave.caveId),
    sourceContainerId: treasureMapBearCaveSourceContainerId(anchor.id),
    casketId: treasureMapBearCaveCasketId(cave.caveId),
    mapGraveSpotId: grave.spotId,
    mapGraveIndex: grave.index,
    cemeteryId: input.cemetery.id,
    authoredCoinAmount: TREASURE_MAP_BEAR_CAVE_COINS,
    directionPhrase,
  }
}

function cardinalDirectionFromDelta(dx: number, dz: number): string {
  const angle = Math.atan2(dx, dz)
  const oct = Math.round(angle / (Math.PI / 4)) & 7
  const labels = ['na północ', 'na północny wschód', 'na wschód', 'na południowy wschód', 'na południe', 'na południowy zachód', 'na zachód', 'na północny zachód']
  return labels[oct] ?? 'w okolicy'
}

export function treasureMapBearCaveProfileReservation(
  binding: TreasureMapBearCaveBinding,
): CaveAdventureProfileReservationRequest {
  return {
    reservationKey: binding.reservationKey,
    caveId: binding.caveId,
    profile: 'QUEST_TREASURE',
  }
}

export function treasureMapBearCavePersistentOccupant(
  binding: TreasureMapBearCaveBinding,
): { decl: PersistentOccupantDecl, binding: AnimalHabitatBinding } {
  return {
    decl: {
      habitatId: binding.habitatId,
      occupantKey: 'resident',
      kind: 'bear',
    },
    binding: {
      habitatId: binding.habitatId,
      source: { kind: 'cave', caveId: binding.caveId },
    },
  }
}

export function treasureMapBearCaveSourceContainerSpec(
  binding: TreasureMapBearCaveBinding,
  anchor: CaveContentAnchor,
): WorldGeneratedContainerSpec {
  return {
    id: binding.sourceContainerId,
    kind: 'chest',
    x: anchor.x,
    y: anchor.y,
    z: anchor.z,
    yaw: anchor.yaw,
    initialCounts: {},
    spatialContext: { kind: 'cave', caveId: binding.caveId },
  }
}

/** Returns the authored map grave match for an ordinary shovel dig, or null. */
export function treasureMapBearCaveSealedCasketCarried(
  binding: TreasureMapBearCaveBinding,
): SaveCarriedContainer {
  return {
    id: binding.casketId,
    kind: 'casket',
    counts: { coin: binding.authoredCoinAmount, ruby: 1 },
    instances: [],
    foodBatches: {},
  }
}

export function findTreasureMapBearCaveMapDig(
  binding: TreasureMapBearCaveBinding,
  cemetery: TreasureMapBearCaveCemeteryInput,
  x: number,
  z: number,
  isSpotResolved: (spotId: string) => boolean,
): { spotId: string, graveIndex: number, cemeteryId: string } | null {
  if (isSpotResolved(binding.mapGraveSpotId)) return null
  const layout = cemeteryGraveLayout(cemetery.cemeterySize, cemetery.scale)
  const offset = layout[binding.mapGraveIndex]!
  const rotated = rotateOffsetY(offset.x, offset.z, cemetery.rotationY)
  const gx = cemetery.x + rotated.x
  const gz = cemetery.z + rotated.z
  if (Math.hypot(gx - x, gz - z) > HIDDEN_FIND_DIG_TOLERANCE) return null
  return {
    spotId: binding.mapGraveSpotId,
    graveIndex: binding.mapGraveIndex,
    cemeteryId: binding.cemeteryId,
  }
}

export function isTreasureMapBearCaveAuthoredCasket(
  binding: TreasureMapBearCaveBinding | null,
  containerId: string | null,
): binding is TreasureMapBearCaveBinding {
  return binding !== null && containerId === binding.casketId
}
