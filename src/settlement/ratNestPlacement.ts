import type { VillageBuildingPlan, VillagePlan } from './villagePlan'

/**
 * @domain settlements
 * @system rat-infestation
 * @role Deterministic rat-nest placement from a settlement's `VillagePlan`
 *  (plan quests-progression-013 §7) — one point behind a residential house,
 *  reconstructed from seed/id rather than a persisted transform.
 */

export type RatNestPlacement = {
  x: number
  z: number
  y: number
  buildingId: string
}

const RAT_NEST_PLACEMENT_SALT = 0x4e455354
const NEST_CLEARANCE = 1.2
const NEST_RADIUS = 0.55
const WATER_MARGIN = 0.15

/** Bounded fallback offsets beyond the house footprint, in the "behind"
 *  (outward) direction plus small side/further variants. Never retry with
 *  `Math.random()`. */
const NEST_OFFSETS: readonly { extra: number, angle: number }[] = [
  { extra: NEST_CLEARANCE, angle: 0 },
  { extra: NEST_CLEARANCE, angle: 0.45 },
  { extra: NEST_CLEARANCE, angle: -0.45 },
  { extra: NEST_CLEARANCE + 1.0, angle: 0 },
  { extra: NEST_CLEARANCE + 1.0, angle: 0.7 },
  { extra: NEST_CLEARANCE + 1.0, angle: -0.7 },
]

function hashString(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function hash01(a: number, b: number, salt: number): number {
  let h = Math.imul(a ^ salt, 2654435761) ^ Math.imul(b + 0x9e3779b9, 1597334677)
  h ^= h >>> 15
  h = Math.imul(h, 2246822519)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}

function residentialBuildings(plan: VillagePlan): VillageBuildingPlan[] {
  return plan.buildings
    .filter((building) => building.role === 'residential')
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
}

function overlapsOtherBuilding(
  x: number,
  z: number,
  nestRadius: number,
  buildings: readonly VillageBuildingPlan[],
  skipId: string,
): boolean {
  for (const building of buildings) {
    if (building.id === skipId) continue
    const minDist = building.footprint + nestRadius
    if (Math.hypot(building.x - x, building.z - z) < minDist) return true
  }
  return false
}

export type PlaceRatNestArgs = {
  settlementId: string
  settlementSeed: number
  plan: VillagePlan
  sampleHeight: (x: number, z: number) => number
  waterLevel: number
}

/** Deterministic nest site behind a residential building. Returns `null`
 *  only when no residential candidate yields a valid dry/non-overlapping
 *  offset. */
export function placeRatNest(args: PlaceRatNestArgs): RatNestPlacement | null {
  const houses = residentialBuildings(args.plan)
  if (houses.length === 0) return null

  const start = Math.floor(
    hash01(hashString(args.settlementId), args.settlementSeed >>> 0, RAT_NEST_PLACEMENT_SALT) * houses.length,
  )
  for (let i = 0; i < houses.length; i++) {
    const building = houses[(start + i) % houses.length]!
    for (const offset of NEST_OFFSETS) {
      const dist = building.footprint + offset.extra
      const angle = building.rotation + offset.angle
      const x = building.x + Math.cos(angle) * dist
      const z = building.z + Math.sin(angle) * dist
      const y = args.sampleHeight(x, z)
      if (y < args.waterLevel + WATER_MARGIN) continue
      if (overlapsOtherBuilding(x, z, NEST_RADIUS, args.plan.buildings, building.id)) continue
      return { x, z, y, buildingId: building.id }
    }
  }
  return null
}
