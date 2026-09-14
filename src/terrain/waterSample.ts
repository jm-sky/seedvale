import type { RiverChannelSegment } from './chunkHeightmap'
import { fordBedHeight, fordInfluenceAt, type FordProjection } from './riverFord'
import { riverWaterSampleAt } from './riverNetwork'

/**
 * @domain terrain
 * @system water
 * @role Single physical "what water, if any, is at this point" answer (plan
 *   fauna-015) — the one thing world/terrain owns so fauna (and, later, any
 *   other gameplay consumer) never re-derives lake/ocean vs. river depth
 *   logic itself. Pure/allocation-light so it's safe to call from a hot
 *   per-agent movement path; `ChunkManager.sampleLocalWater` is the only
 *   wiring that turns real chunk/river data into these inputs.
 */

/** `present: false` for dry land. `waterSurfaceHeight`/`floorHeight`/`depth`
 *  are the canonical river water/bed height when the point sits inside a
 *  loaded river's channel, otherwise the lake/ocean `waterLevel`/true floor
 *  height — never a mix of the two. `depth` is always `>= 0`. */
export type LocalWaterSample =
  | { present: false }
  | { present: true, waterSurfaceHeight: number, floorHeight: number, depth: number }

export const DRY_WATER_SAMPLE: LocalWaterSample = { present: false }

/**
 * Pure composition of already-sampled terrain fields into one `LocalWaterSample`.
 *
 * `clampedHeight` is the `heights` field (clamped to `waterLevel` on any
 * water-covered cell, per `water.md`'s W-series decisions) — `<= waterLevel`
 * is exactly the existing lake/ocean "is this cell water" signal. `riverSegments`
 * should already be narrowed to the point's own chunk (see
 * `ChunkManager.sampleLocalWater`) — an empty array is the common "no river
 * loaded here" case and short-circuits straight to the lake/ocean check.
 *
 * River channel data always wins over the lake/ocean check when `(x, z)`
 * sits inside it: a carved mountain stream can sit entirely above the
 * global `waterLevel`, where the lake/ocean check alone would (wrongly)
 * report dry land.
 *
 * `fords` are the declared road↔river ford crossings whose footprint reaches
 * the point (`ChunkTileParams.fordProjections`, same data terrain carving
 * gets). Inside one, the reported floor is the *shaped* ford bed rather than
 * the natural channel bed — the same `fordBedHeight` terrain used — so
 * gameplay depth agrees with the ground the player actually walks on. The
 * canonical water surface is never modified (plan world-terrain-023 §9).
 */
export function sampleLocalWater(
  clampedHeight: number,
  floorHeight: number,
  waterLevel: number,
  riverSegments: readonly RiverChannelSegment[],
  x: number,
  z: number,
  fords: readonly FordProjection[] = [],
): LocalWaterSample {
  if (riverSegments.length > 0) {
    const river = riverWaterSampleAt(riverSegments, x, z)
    if (river && river.distanceToWaterEdge < 0) {
      const bedH = fords.length > 0
        ? fordBedHeight(river.bedH, river.waterH, fordInfluenceAt(x, z, fords))
        : river.bedH
      return {
        present: true,
        waterSurfaceHeight: river.waterH,
        floorHeight: bedH,
        depth: Math.max(0, river.waterH - bedH),
      }
    }
  }
  if (clampedHeight <= waterLevel) {
    return {
      present: true,
      waterSurfaceHeight: waterLevel,
      floorHeight,
      depth: Math.max(0, waterLevel - floorHeight),
    }
  }
  return DRY_WATER_SAMPLE
}
