/** Plan world-terrain-008 — the mouth overburden contract every Cave V2
 *  topology builder must honour, following V1's own mouth contract
 *  (`caveGenerator.ts`): the opening itself is legitimately roofless, the
 *  leading transition keeps a thin but positive roof, and everything past it
 *  keeps the full `MIN_OVERBURDEN` V1 already established.
 *
 *  Extracted out of the Milestone-A `spikeTestCave.ts` (which still uses it,
 *  via `spikeOverburdenRequirement`) so the B1 production builder
 *  (`productionTopology.ts`) does not have to depend on the test-only spike
 *  module for a genuinely shared, representation-neutral rule.
 *
 * @domain world-terrain
 */

import type { CaveEntrance } from '../caveVolume'
import { MIN_OVERBURDEN, MOUTH_FOOTPRINT_MARGIN, MOUTH_ROOF_MIN } from '../caveGenerator'

/** Metres past the mouth within which the leading section is held to
 *  `MOUTH_ROOF_MIN` instead of the full `MIN_OVERBURDEN`. */
export const MOUTH_TRANSITION_RANGE = 4

/** Radius around the entrance that *is* the opening and so is legitimately
 *  roofless — the walkable footprint the caller inflates by `proxyMargin`,
 *  plus V1's own lip past the carved recess. */
export function mouthOpeningRadius(entrance: CaveEntrance, proxyMargin: number): number {
  return Math.max(MOUTH_FOOTPRINT_MARGIN, entrance.width / 2 + proxyMargin + 0.35)
}

/**
 * Required clearance between the local surface and the cave ceiling at
 * `distanceFromMouth`. `null` = exempt (inside the opening itself).
 *
 * @domain world-terrain
 */
export function mouthOverburdenRequirement(
  entrance: CaveEntrance,
  distanceFromMouth: number,
  proxyMargin: number,
): number | null {
  if (distanceFromMouth < mouthOpeningRadius(entrance, proxyMargin)) return null
  return distanceFromMouth < MOUTH_TRANSITION_RANGE ? MOUTH_ROOF_MIN : MIN_OVERBURDEN
}
