import type { HeightSampler } from '../player/PlayerController'

/** Clearance above `waterLevel` for dry-land / path checks — shared by
 *  `findSettlementSite`, `villageClearing`, and related settlement probes. */
export const SETTLEMENT_WATER_MARGIN = 0.8

/** Inclusive endpoint samples along a core→target line when testing for water. */
export const PATH_DRY_SAMPLES = 5

/**
 * True when every sample along the segment from `(ax,az)` to `(bx,bz)` sits
 * above `waterLevel + SETTLEMENT_WATER_MARGIN`. Same pattern historically
 * used by `villageClearing.ts` house-site checks (plan 047 reuses it for
 * footprint path scoring).
 */
export function pathIsDry(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  waterLevel: number,
  sampleHeight: HeightSampler,
  samples: number = PATH_DRY_SAMPLES,
): boolean {
  const n = Math.max(2, samples)
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const x = ax + (bx - ax) * t
    const z = az + (bz - az) * t
    if (sampleHeight(x, z) <= waterLevel + SETTLEMENT_WATER_MARGIN) return false
  }
  return true
}
