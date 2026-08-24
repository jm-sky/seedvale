import { TENT_FOOTPRINT_RADIUS } from './tentProp'

export type TentPlacementReason =
  | 'ok'
  | 'water'
  | 'slope'
  | 'object'
  | 'tent'

/** Shared reason set for "can I put this object down here" checks. `occupied`
 *  means another object of the same family (tent, trap…) already stands
 *  there; each caller renames it in its own message table. */
export type GroundPlacementReason = 'ok' | 'water' | 'slope' | 'object' | 'occupied'

export type GroundPlacementInput = {
  x: number
  z: number
  sampleHeight: (x: number, z: number) => number
  waterLevel: number
  /** Nearby blocking points (trees, houses, wells, other placed objects). */
  blockers: readonly { x: number, z: number, radius: number }[]
  /** Already-placed objects of the same family — rejected via `separation`. */
  peers: readonly { x: number, z: number }[]
  /** Clearance this object needs against `blockers`. */
  footprintRadius: number
  /** Minimum centre distance to any entry in `peers`. */
  separation: number
}

export type TentPlacementInput = Omit<
  GroundPlacementInput,
  'peers' | 'footprintRadius' | 'separation'
> & {
  otherTents: readonly { x: number, z: number }[]
}

/** Exported for `terrain/terrainPreparation.ts`'s per-sample water rejection
 *  (plan `world-terrain-002`) — the same shoreline clearance every other
 *  ground placement already uses, not a second water-margin constant. */
export const WATER_MARGIN = 0.8
const SLOPE_SAMPLE = 1.6
const SLOPE_MAX_DELTA = 0.45
const TENT_SEPARATION = TENT_FOOTPRINT_RADIUS * 2.2

function maxSlopeDelta(
  x: number,
  z: number,
  sampleHeight: (x: number, z: number) => number,
): number {
  const y = sampleHeight(x, z)
  const step = SLOPE_SAMPLE
  return Math.max(
    Math.abs(sampleHeight(x + step, z) - y),
    Math.abs(sampleHeight(x - step, z) - y),
    Math.abs(sampleHeight(x, z + step) - y),
    Math.abs(sampleHeight(x, z - step) - y),
  )
}

/** Suitability for setting a ground object down at (x, z). Pure — no Three.js.
 *  Shared by tents and animal traps (plan 141 §3 / issue 035): dry, flat enough,
 *  clear of props and of its own kind. Roads are allowed. */
export function evaluateGroundPlacement(input: GroundPlacementInput): GroundPlacementReason {
  const { x, z, sampleHeight, waterLevel } = input
  if (sampleHeight(x, z) <= waterLevel + WATER_MARGIN) return 'water'
  if (maxSlopeDelta(x, z, sampleHeight) > SLOPE_MAX_DELTA) return 'slope'
  for (const peer of input.peers) {
    if (Math.hypot(peer.x - x, peer.z - z) < input.separation) return 'occupied'
  }
  for (const blocker of input.blockers) {
    if (Math.hypot(blocker.x - x, blocker.z - z) < blocker.radius + input.footprintRadius) {
      return 'object'
    }
  }
  return 'ok'
}

/** Suitability for pitching a tent at (x, z). */
export function evaluateTentPlacement(input: TentPlacementInput): TentPlacementReason {
  const { otherTents, ...rest } = input
  const reason = evaluateGroundPlacement({
    ...rest,
    peers: otherTents,
    footprintRadius: TENT_FOOTPRINT_RADIUS,
    separation: TENT_SEPARATION,
  })
  return reason === 'occupied' ? 'tent' : reason
}

/** Busy-channel duration for pitching a tent (plan 128 §3.2) — the same
 *  order of magnitude as dig/ignite/cook, scaled down by Survival at the
 *  moment the action starts (`PlayerSkills.survivalDurationMultiplier`).
 *  Packing stays instant: striking camp is the easy half. */
export const TENT_SETUP_DURATION_SEC = 4

export const TENT_PLACEMENT_MESSAGE: Record<Exclude<TentPlacementReason, 'ok'>, string> = {
  water: 'Tu jest za mokro na namiot.',
  slope: 'Teren jest zbyt stromy.',
  object: 'Za mało miejsca — coś stoi w pobliżu.',
  tent: 'Tu już stoi namiot.',
}
