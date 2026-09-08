/** Plan world-terrain-008 — lowest analytic surface height over a walkable
 *  footprint, not just its centre point: a corridor crossing a slope breaks
 *  out on its downhill flank long before its centreline does. Shared by the
 *  Milestone-A `spikeTestCave.ts` and the B1 production topology builder.
 *
 * @domain world-terrain
 */

import type { SurfaceHeightSampler } from './clipBelowSurface'

const RING_SAMPLES = 16
const RADIAL_FRACTIONS = [0.4, 0.7, 1] as const

export function minSurfaceOverFootprint(
  surfaceHeightAt: SurfaceHeightSampler,
  x: number,
  z: number,
  radius: number,
): number {
  let lowest = surfaceHeightAt(x, z)
  for (let i = 0; i < RING_SAMPLES; i++) {
    const angle = (i / RING_SAMPLES) * Math.PI * 2
    const dx = Math.cos(angle)
    const dz = Math.sin(angle)
    for (const f of RADIAL_FRACTIONS) {
      lowest = Math.min(lowest, surfaceHeightAt(x + dx * radius * f, z + dz * radius * f))
    }
  }
  return lowest
}
