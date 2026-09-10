import type { CaveDefinition } from '../caveVolume'
import { ruinsDiscoveryRadius } from './darkForestTreasureSite'
import { getActiveDarkForestTreasureSite } from './darkForestTreasureSiteRuntime'
import type { LocationKnowledge } from './locationKnowledge'
import type { WorldLocationCatalog } from './worldLocationCatalog'

/** Horizontal distance from `CaveDefinition.entrance` at which physical
 *  arrival counts as confirming the cave on the world map (plan world-012 §17). */
export const CAVE_ENTRANCE_DISCOVERY_RADIUS = 32

const DEFAULT_CHECK_INTERVAL_S = 0.25

function caveLocationId(caveId: string): string {
  return `cave:${caveId}`
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

export type LocationProximityDiscovery = {
  /** Throttled proximity pass — call each frame; work runs at most a few
   *  times per second. Returns newly confirmed caves for UI feedback. */
  update(playerX: number, playerZ: number): readonly { id: string, name: string }[]
}

export function createLocationProximityDiscovery(deps: {
  getCaveDefinitions: () => readonly CaveDefinition[]
  catalog: WorldLocationCatalog
  knowledge: LocationKnowledge
  checkIntervalS?: number
  now?: () => number
}): LocationProximityDiscovery {
  const {
    getCaveDefinitions,
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
      const revealed = [...revealCaveEntrancesInRange(playerX, playerZ, getCaveDefinitions(), catalog, knowledge)]
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
