import { createSeededRandom } from '../world/parseSeed'

/**
 * Dedicated xor salt for household-well rolls (plan settlements-npcs-035).
 * Isolated from `families.ts` name/role/age streams so this feature does
 * not reshuffle unrelated generated properties.
 */
const HOUSEHOLD_WELL_SEED_SALT = 0x48574c31

/** @domain settlements-npcs */
function householdWellFamilySeed(settlementSeed: number, familyIndex: number): number {
  return (settlementSeed ^ Math.imul(familyIndex + 1, 0x9e3779b9) ^ HOUSEHOLD_WELL_SEED_SALT) >>> 0
}

/**
 * Minimum extra household wells for a settlement, independent of the
 * central plaza well (plan settlements-npcs-035).
 *
 * @domain settlements-npcs
 */
export function minimumHouseholdWellCount(totalPopulation: number): number {
  return Math.floor(Math.max(0, totalPopulation) / 6)
}

/**
 * Deterministic family indices that receive a local household well.
 *
 * Rules: 3+ members always; 2 members 50% via a dedicated seed stream;
 * then promote missed 2-person households, then remaining households by
 * descending size / stable `familyIndex`, until
 * {@link minimumHouseholdWellCount} is met. Never selects a family twice.
 *
 * @domain settlements-npcs
 */
export function selectHouseholdWellFamilyIndices(
  families: readonly { members: { readonly length: number } }[],
  settlementSeed: number,
): number[] {
  const selected = new Set<number>()
  const twoPersonMissed: number[] = []
  let totalPopulation = 0

  families.forEach((family, familyIndex) => {
    const size = family.members.length
    totalPopulation += size
    if (size >= 3) {
      selected.add(familyIndex)
      return
    }
    if (size === 2) {
      const random = createSeededRandom(householdWellFamilySeed(settlementSeed, familyIndex))
      if (random() < 0.5) selected.add(familyIndex)
      else twoPersonMissed.push(familyIndex)
    }
  })

  const minimum = minimumHouseholdWellCount(totalPopulation)
  for (const familyIndex of twoPersonMissed) {
    if (selected.size >= minimum) break
    selected.add(familyIndex)
  }

  if (selected.size < minimum) {
    const remaining = families
      .map((family, familyIndex) => ({ familyIndex, size: family.members.length }))
      .filter((entry) => !selected.has(entry.familyIndex))
      .sort((a, b) => {
        if (b.size !== a.size) return b.size - a.size
        return a.familyIndex - b.familyIndex
      })
    for (const entry of remaining) {
      if (selected.size >= minimum) break
      selected.add(entry.familyIndex)
    }
  }

  return [...selected].sort((a, b) => a - b)
}

export type SettlementWellSource = {
  position: { x: number, y?: number, z: number }
  queueId: string | null
}

export type WaterWellTarget = {
  position: { x: number, y: number, z: number }
  queueId: string | null
  isSettlementWell: boolean
}

/**
 * Nearest usable well from a household home: settlement wells (central +
 * household) plus an optional completed player-built well. Distance-only;
 * no congestion score. Called when a water action starts, not per frame.
 *
 * @domain settlements-npcs
 */
export function resolveNearestWaterWellTarget(args: {
  home: { x: number, z: number }
  settlementWells: readonly SettlementWellSource[]
  playerWell: { x: number, y: number, z: number } | null
}): WaterWellTarget {
  let best: WaterWellTarget | null = null
  let bestDist = Infinity

  for (const well of args.settlementWells) {
    const dist = Math.hypot(well.position.x - args.home.x, well.position.z - args.home.z)
    if (dist < bestDist) {
      bestDist = dist
      best = {
        position: {
          x: well.position.x,
          y: well.position.y ?? 0,
          z: well.position.z,
        },
        queueId: well.queueId,
        isSettlementWell: true,
      }
    }
  }

  if (args.playerWell) {
    const dist = Math.hypot(args.playerWell.x - args.home.x, args.playerWell.z - args.home.z)
    if (dist < bestDist) {
      return {
        position: args.playerWell,
        queueId: null,
        isSettlementWell: false,
      }
    }
  }

  if (best) return best
  if (args.playerWell) {
    return { position: args.playerWell, queueId: null, isSettlementWell: false }
  }
  return {
    position: { x: args.home.x, y: 0, z: args.home.z },
    queueId: null,
    isSettlementWell: false,
  }
}
