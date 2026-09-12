import { gardenClearingRadius, type GardenScale } from '../settlement/gardenScale'
import { PLAYER_GARDEN_PLANT_RADIUS, type PlayerGardenRecord } from './playerGarden'

/**
 * Shared read contract for Farmer cultivation targeting (plan world-019).
 * Settlement garden landmarks and Player-built gardens both project into this
 * shape without changing their own state ownership. Radius is the actual
 * cultivation footprint, not a position-only landmark the Farmer has to guess.
 *
 * @domain world
 * @system cultivation
 */
export type CultivationAnchor = {
  position: { x: number, z: number }
  radius: number
}

export function cultivationAnchorFromPlayerGarden(
  garden: Pick<PlayerGardenRecord, 'x' | 'z'>,
): CultivationAnchor {
  return { position: { x: garden.x, z: garden.z }, radius: PLAYER_GARDEN_PLANT_RADIUS }
}

export function cultivationAnchorFromSettlementGarden(
  position: { x: number, z: number },
  scale: GardenScale,
): CultivationAnchor {
  return { position: { x: position.x, z: position.z }, radius: gardenClearingRadius(scale) }
}

/** Matches `createWheatField`'s default visual radius — the field gameplay
 *  footprint for Farmer targeting (plan settlements-npcs-030). Not a
 *  species-specific density/yield table. */
export const SETTLEMENT_FIELD_CULTIVATION_RADIUS = 3.2

export function cultivationAnchorFromSettlementField(
  position: { x: number, z: number },
): CultivationAnchor {
  return { position: { x: position.x, z: position.z }, radius: SETTLEMENT_FIELD_CULTIVATION_RADIUS }
}

/** Prefer a caller-supplied anchor (future settlement bootstrap selecting a
 *  Player garden), then settlement-produced anchors, then a position-only
 *  landmark fallback so existing tests/fixtures without scale still farm. */
export function resolveCultivationAnchor(input: {
  supplied?: CultivationAnchor | null
  settlementAnchors?: readonly CultivationAnchor[] | null
  fallbackGarden?: { x: number, z: number } | null
}): CultivationAnchor | null {
  if (input.supplied) return input.supplied
  const settlement = input.settlementAnchors?.[0]
  if (settlement) return settlement
  if (input.fallbackGarden) {
    return cultivationAnchorFromSettlementGarden(input.fallbackGarden, 'S')
  }
  return null
}
