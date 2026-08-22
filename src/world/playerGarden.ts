import type { ItemCapability } from '../items/itemCatalog'
import type { GroundPlacementReason } from '../items/tentPlacement'

/**
 * Player-built garden plot (plan 174) — pure domain logic, same split as
 * `playerWell.ts` vs `createPlayerWells.ts`/`playerWellProp.ts`. A single
 * static player-built world object (no multi-stage construction like a well
 * — the plan's whole point is a small, cheap plot, not a second building
 * project). Once built it is only a placement/anchor: crop planting itself
 * stays owned by plan 126, growth by plan 172 (`world/cropLifecycle.ts`).
 */
export type PlayerGardenRecord = {
  id: string
  x: number
  z: number
  yaw: number
}

/** Cost to build a plot — charged once, atomically, when the placement
 *  channel completes. Deliberately cheap (plan §1: "minimalny koszt
 *  budowy") — a fraction of a well's `well`-stage cost. */
export type GardenMaterialCost = { stone: number, branch: number }
export const GARDEN_COST: GardenMaterialCost = { stone: 3, branch: 2 }

/** Capability required to build a plot — same "digging tool, not a specific
 *  item identity" contract as a well's `pit` stage. */
export const GARDEN_CAPABILITY: ItemCapability = 'soil_digging'

/** Footprint/clearance + minimum spacing — smaller than a well (plan §5:
 *  a garden bed, not a structure). */
export const GARDEN_FOOTPRINT_RADIUS = 1
export const GARDEN_SEPARATION = 2.5
/** How far ahead of the player a plot is placed — mirrors `WELL_PLACE_REACH`. */
export const GARDEN_PLACE_REACH = 1.6
/** Busy-channel length for the placement action itself. */
export const GARDEN_PLACE_DURATION_SEC = 3

/** How close a crop must be planted to a player garden plot to count as
 *  planted "in" it (`plantedCrops.ts`'s `isNearAnyGarden`) — much tighter
 *  than a settlement garden's `GARDEN_PLANT_RADIUS` since a plot is one small
 *  bed, not a whole clearing. */
export const PLAYER_GARDEN_PLANT_RADIUS = 2.5

export type GardenPlacementReason = GroundPlacementReason | 'garden'

export const GARDEN_PLACEMENT_MESSAGE: Record<Exclude<GardenPlacementReason, 'ok'>, string> = {
  water: 'Tu jest za mokro na grządkę.',
  slope: 'Teren jest zbyt stromy.',
  object: 'Za mało miejsca — coś stoi w pobliżu.',
  occupied: 'Tu już coś stoi.',
  garden: 'Tu już jest grządka.',
}
