import type { WaterQuality } from './WaterSource'
import { DEFAULT_RIVER_THRESHOLDS, type RiverHydrologyContext } from '../terrain/riverNetwork'

/**
 * Contextual river water safety (plan world-017) — replaces the old
 * `river = safe` blanket rule with a deterministic classification of the
 * actual pickup point's hydrology plus settlement proximity. Pure and
 * cache-free by design: `world/riverWaterQualityResolver.ts` owns the lazy
 * hydrology/settlement query plus caching, this module only turns already
 * -resolved context into a `WaterQuality`.
 *
 * @domain world
 * @system river-water-quality
 * @role Pure hydrology + settlement-proximity classifier feeding contextual
 *  river `WaterSource.quality` (well/lake/ocean remain static, see
 *  `WaterSource.ts::createWaterSource`).
 */

/**
 * Calibrated from the production worldgen's own river points (plan world-017
 * §3.2), not a biome name or an arbitrary constant. Method: `computeRiverTile`
 * over a 13x13 tile grid centered on the origin (~2.9 km x 2.9 km), across 5
 * fixed seeds (1, 12345, 999999, 42, 777), collecting `RiverPoint.elevation`
 * for every point classified as a small stream
 * (`stream <= accumulation < river`, i.e. `15 <= accumulation < 50`) — 62734
 * sample points total.
 *
 * The resulting elevation distribution is clearly bimodal (a lowland cluster
 * roughly -14..-2, a headwater-like cluster roughly -1..14), not a smooth
 * single-peaked distribution — so per the plan's own escape hatch for a
 * multimodal sample, the threshold is the valley between the two clusters
 * (lowest 0.5-unit-bin count, elevation -1..0) rather than the plan's
 * "preferred start" `P75` (`~1.77`), which sits inside the headwater cluster
 * itself and would misclassify a chunk of genuinely high streams as lowland.
 * `0` is the clean value at that valley floor. At this threshold, 37.3% of
 * small-stream points read as high terrain (safe candidate absent a nearby
 * settlement) — a minority, not "most small streams", matching the plan's
 * intent that `safe` stays the exception.
 *
 * Re-run the calibration (same method) if a terrain/hydrology worldgen change
 * meaningfully shifts the river elevation distribution or `DEFAULT_RIVER_THRESHOLDS`.
 */
export const CALIBRATED_HIGH_RIVER_ELEVATION = 0

/** Base hydrology-only classification (plan world-017 §3.1) — conservative:
 *  `safe` is the exception for a small, high-elevation stream; everything
 *  else, including a small stream sitting low and any stream at/above the
 *  canonical `river` accumulation threshold, is `unsafe`. Elevation can never
 *  promote a large river to `safe`. Only reads `elevation`/`accumulation`
 *  (not `RiverHydrologyContext`'s `x`/`z`/`distanceToWaterEdge`, which are
 *  resolver/cache concerns — see `riverWaterQualityResolver.ts`), so callers
 *  can pass a plain hydrology sample without a real query point. */
export function classifyBaseRiverWaterQuality(
  context: Pick<RiverHydrologyContext, 'elevation' | 'accumulation'>,
): WaterQuality {
  const smallFlow = context.accumulation < DEFAULT_RIVER_THRESHOLDS.river
  const highTerrain = context.elevation >= CALIBRATED_HIGH_RIVER_ELEVATION
  return smallFlow && highTerrain ? 'safe' : 'unsafe'
}

/** Settlement-proximity modifier (plan world-017 §4) — can only ever degrade
 *  a `safe` base classification to `unsafe`, never improve one; an already
 *  `unsafe` base is unaffected either way. */
export function applyRiverWaterQualityModifiers(
  base: WaterQuality,
  { nearSettlement }: { nearSettlement: boolean },
): WaterQuality {
  if (base === 'safe' && nearSettlement) return 'unsafe'
  return base
}
