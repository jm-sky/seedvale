import type { SettlementCell } from '../../settlement/settlementGenerator'
import type { CaveDefinition } from '../caveVolume'
import type { LocationKnowledge } from './locationKnowledge'
import type { WorldLocationCatalog } from './worldLocationCatalog'
import { cellsWithinRadius, worldToCell } from '../../settlement/settlementGenerator'
import { ruinsDiscoveryRadius } from './darkForestTreasureSite'
import { getActiveDarkForestTreasureSite } from './darkForestTreasureSiteRuntime'
import { settlementLocationId } from './worldLocationCatalog'

/** Horizontal distance from `CaveDefinition.entrance` at which physical
 *  arrival counts as confirming the cave on the world map (plan world-012 §17). */
export const CAVE_ENTRANCE_DISCOVERY_RADIUS = 32

/**
 * Chebyshev settlement-grid radius checked for physical village arrival.
 * `SETTLEMENT_GRID_STEP` (280) is larger than worst-case site offset +
 * local search + XL `plan.boundary.radius`, so the player's cell plus its
 * 8 neighbours cover every village whose footprint the player can stand in
 * — never a catalog-wide scan.
 */
export const SETTLEMENT_PROXIMITY_CELL_RADIUS = 1

const DEFAULT_CHECK_INTERVAL_S = 0.25

/** Narrow settlement view for proximity — identity + the authoritative
 *  circular `VillagePlan.boundary`, not a loaded `Settlement` mesh. */
export type SettlementProximityDef = {
  id: string
  name: string
  plan: { boundary: { x: number, z: number, radius: number } }
}

function caveLocationId(caveId: string): string {
  return `cave:${caveId}`
}

function isInsideSettlementBoundary(
  playerX: number,
  playerZ: number,
  def: SettlementProximityDef,
): boolean {
  const { x, z, radius } = def.plan.boundary
  const dx = playerX - x
  const dz = playerZ - z
  return dx * dx + dz * dz <= radius * radius
}

/**
 * Marks the home village as physically known. Idempotent; callers at boot /
 * New Game ignore the return so starting in town never toasts.
 */
export function confirmHomeSettlement(
  home: Pick<SettlementProximityDef, 'id'>,
  knowledge: LocationKnowledge,
): boolean {
  return knowledge.reveal(settlementLocationId(home), 'confirmed', 'exploration')
}

/** Checks every cave entrance against the player — no catalog scan, only the
 *  retained `CaveDefinition[]`. Returns locations newly upgraded to
 *  `confirmed`/`exploration` this call (for toast feedback). */
export function revealCaveEntrancesInRange(
  playerX: number,
  playerZ: number,
  caves: readonly CaveDefinition[],
  catalog: WorldLocationCatalog,
  knowledge: LocationKnowledge,
  radius: number = CAVE_ENTRANCE_DISCOVERY_RADIUS,
): { id: string, name: string }[] {
  const radiusSq = radius * radius
  const revealed: { id: string, name: string }[] = []
  for (const def of caves) {
    const dx = playerX - def.entrance.x
    const dz = playerZ - def.entrance.z
    if (dx * dx + dz * dz > radiusSq) continue
    const id = caveLocationId(def.caveId)
    if (!knowledge.reveal(id, 'confirmed', 'exploration')) continue
    const location = catalog.getById(id)
    if (!location) continue
    revealed.push({ id: location.id, name: location.name })
  }
  return revealed
}

/**
 * Confirms settlements whose `VillagePlan.boundary` contains the player.
 * Uses the same settlement-grid lookup as streaming (`worldToCell` +
 * `cellsWithinRadius` + `lookupSettlement`), never a global catalog scan.
 * Returns locations newly upgraded to `confirmed`/`exploration` this call.
 */
export function revealSettlementsInRange(
  playerX: number,
  playerZ: number,
  lookupSettlement: (cell: SettlementCell) => SettlementProximityDef | null,
  catalog: WorldLocationCatalog,
  knowledge: LocationKnowledge,
): { id: string, name: string }[] {
  const revealed: { id: string, name: string }[] = []
  for (const cell of cellsWithinRadius(worldToCell(playerX, playerZ), SETTLEMENT_PROXIMITY_CELL_RADIUS)) {
    const def = lookupSettlement(cell)
    if (!def || !isInsideSettlementBoundary(playerX, playerZ, def)) continue
    const id = settlementLocationId(def)
    if (!knowledge.reveal(id, 'confirmed', 'exploration')) continue
    const location = catalog.getById(id)
    if (!location) continue
    revealed.push({ id: location.id, name: location.name })
  }
  return revealed
}

export type LocationProximityDiscovery = {
  /** Throttled proximity pass — call each frame; work runs at most a few
   *  times per second. Returns newly confirmed caves/settlements (and first-
   *  seen ruins) for UI feedback. */
  update(playerX: number, playerZ: number): readonly { id: string, name: string }[]
}

export function createLocationProximityDiscovery(deps: {
  getCaveDefinitions: () => readonly CaveDefinition[]
  lookupSettlement: (cell: SettlementCell) => SettlementProximityDef | null
  catalog: WorldLocationCatalog
  knowledge: LocationKnowledge
  checkIntervalS?: number
  now?: () => number
}): LocationProximityDiscovery {
  const {
    getCaveDefinitions,
    lookupSettlement,
    catalog,
    knowledge,
    checkIntervalS = DEFAULT_CHECK_INTERVAL_S,
    now = () => performance.now() / 1000,
  } = deps
  let nextCheckAt = 0

  return {
    update(playerX, playerZ) {
      const t = now()
      if (t < nextCheckAt) return []
      nextCheckAt = t + checkIntervalS
      const revealed = [
        ...revealCaveEntrancesInRange(playerX, playerZ, getCaveDefinitions(), catalog, knowledge),
        ...revealSettlementsInRange(playerX, playerZ, lookupSettlement, catalog, knowledge),
      ]
      const site = getActiveDarkForestTreasureSite()
      if (site) {
        const radius = ruinsDiscoveryRadius()
        const dx = playerX - site.x
        const dz = playerZ - site.z
        if (dx * dx + dz * dz <= radius * radius) {
          if (knowledge.reveal(site.locationId, 'discovered', 'exploration')) {
            const location = catalog.getById(site.locationId)
            if (location) revealed.push({ id: location.id, name: location.name })
          }
        }
      }
      return revealed
    },
  }
}
