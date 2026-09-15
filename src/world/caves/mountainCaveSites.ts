/**
 * Dedicated mountain cave-site query for the abandoned-mine landmark
 * (plan world-terrain-017). Reuses shared site-safety from `largeCaves.ts`
 * but does not inherit generic `MOUNTAIN_RIDGE_MAX` rejection and does not
 * consume the generic home-ring RNG stream.
 *
 * @domain world-terrain
 */

import { measureSlope } from '../../fauna/createFauna'
import {
  caveSiteSafetyOk,
  LARGE_CAVE_MAX_LENGTH,
  LARGE_CAVE_MIN_LENGTH,
  type LargeCavePlacementInput,
  type LargeCaveSite,
} from '../largeCaves'
import { createSeededRandom } from '../parseSeed'

/** Mountain sites must actually sit on mountain-classified ridge terrain. */
export const MOUNTAIN_CAVE_RIDGE_MIN = 0.18

const SITE_RING_MIN = 28
const SITE_RING_MAX = 130
const ATTEMPTS_PER_MASSIF = 36
const SLOPE_SAMPLE_RADIUS = 4
const MOUNTAIN_SITE_RNG_SALT = 0xa81e51

function hashCoords(x: number, z: number): number {
  const fixedX = Math.round(x * 100)
  const fixedZ = Math.round(z * 100)
  let h = 0x9e3779b9
  h = Math.imul(h ^ fixedX, 0x85ebca6b) >>> 0
  h = Math.imul(h ^ fixedZ, 0xc2b2ae35) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

/**
 * First accepted mountain cave site around a massif centre, or `null` when
 * no candidate passes shared safety + ridge presence.
 *
 * @domain world-terrain
 */
export function pickMountainCaveSite(
  input: LargeCavePlacementInput,
  massifX: number,
  massifZ: number,
  placed: readonly LargeCaveSite[],
): LargeCaveSite | null {
  const random = createSeededRandom(input.seed ^ MOUNTAIN_SITE_RNG_SALT ^ hashCoords(massifX, massifZ))
  for (let attempt = 0; attempt < ATTEMPTS_PER_MASSIF; attempt++) {
    const angle = random() * Math.PI * 2
    const dist = SITE_RING_MIN + random() * (SITE_RING_MAX - SITE_RING_MIN)
    const x = massifX + Math.cos(angle) * dist
    const z = massifZ + Math.sin(angle) * dist
    if (!caveSiteSafetyOk(x, z, input, placed, { allowMountainRidge: true })) continue
    if (input.sampleMountainRidge(x, z) < MOUNTAIN_CAVE_RIDGE_MIN) continue
    const slope = measureSlope(x, z, SLOPE_SAMPLE_RADIUS, input.sampleHeight)
    return {
      x,
      z,
      yaw: slope.yaw,
      length: LARGE_CAVE_MIN_LENGTH + random() * (LARGE_CAVE_MAX_LENGTH - LARGE_CAVE_MIN_LENGTH),
      variant: random(),
    }
  }
  return null
}
