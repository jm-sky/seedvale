/**
 * Shared “don’t put inland props on the beach / coast” checks.
 * Uses height-above-water (sand band) and optional continentalness vs coastThreshold.
 */

export type CoastalSamplers = {
  sampleHeight: (x: number, z: number) => number
  waterLevel: number
  sampleContinentalness?: (x: number, z: number) => number
  coastThreshold?: number
}

/** Height above water still treated as beach / wet shore (world units). */
export const COAST_BEACH_HEIGHT = 2.2
/** Continentalness must clear `coastThreshold` by this much to count as inland. */
export const COAST_INLAND_MARGIN = 0.1

/** True on shore sand or in the coastal continentalness band. */
export function isCoastalPlacement(
  x: number,
  z: number,
  env: CoastalSamplers,
  beachHeight = COAST_BEACH_HEIGHT,
  coastMargin = COAST_INLAND_MARGIN,
): boolean {
  if (env.sampleHeight(x, z) <= env.waterLevel + beachHeight) return true
  const threshold = env.coastThreshold ?? 0.45
  if (
    env.sampleContinentalness
    && env.sampleContinentalness(x, z) < threshold + coastMargin
  ) {
    return true
  }
  return false
}
