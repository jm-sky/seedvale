import type { HeightSampler } from '../player/PlayerController'
import { createSeededRandom } from '../world/parseSeed'
import { pathIsDry, SETTLEMENT_WATER_MARGIN } from './pathDryness'

export type SettlementSite = {
  x: number
  z: number
  y: number
}

/** Optional footprint for village-scale suitability (plan 047 §6). When
 *  omitted, scoring falls back to the legacy local ±2.5 probe only. */
export type SettlementFootprintHint = {
  /** Village boundary radius (`VILLAGE_SIZE_CONFIG.footprintRadius`). */
  footprintRadius: number
  /** Outer house-ring distance (`VILLAGE_SIZE_CONFIG.houseRingMax`). */
  houseRingMax: number
}

/**
 * Central site-scoring weights (plan 047 §6) — one table, not magic numbers
 * scattered across helpers. Resource weight matches plan 032's previous
 * `RESOURCE_SCORE_WEIGHT = 3` so attraction still cannot beat hard water /
 * local-flatness gates.
 */
export const SITE_SCORE_WEIGHTS = {
  /** Baseline so typical good candidates land in a comfortable positive band. */
  base: 8,
  localFlatness: 3,
  distanceFromCenter: 0.05,
  elevationAboveWater: 0.15,
  resourceAttraction: 3,
  footprintDryRatio: 5,
  footprintHeightSpread: 1.8,
  footprintAvgSlope: 1.4,
  pathDryRatio: 4,
} as const

/** Local cross-probe step (world units) — hard flatness gate at the plaza. */
const LOCAL_FLAT_STEP = 2.5
/** Reject candidates whose local cross-probe exceeds this height delta. */
const LOCAL_FLAT_MAX_DELTA = 2.2
/** Hard-reject footprints with less dry land than this fraction of samples. */
const MIN_FOOTPRINT_DRY_RATIO = 0.4
/** Directions sampled on each footprint ring. */
const FOOTPRINT_RING_DIRS = 8
/** Candidate attempts per cell (same budget as pre-047). */
const SITE_CANDIDATE_ATTEMPTS = 80
/** Default half-width of the site search box (world units). */
export const DEFAULT_SITE_SEARCH_MARGIN = 24

type FootprintMetrics = {
  dryRatio: number
  heightSpread: number
  avgAbsDelta: number
  pathDryRatio: number
}

/**
 * Sample rings at ~half / full house ring (and boundary if larger) to score
 * village-scale dryness, elevation spread, slope, and dry paths to the plaza.
 */
function sampleFootprintMetrics(
  x: number,
  z: number,
  y: number,
  footprint: SettlementFootprintHint,
  waterLevel: number,
  sampleHeight: HeightSampler,
): FootprintMetrics {
  const radii: number[] = [footprint.houseRingMax * 0.55, footprint.houseRingMax]
  if (footprint.footprintRadius > footprint.houseRingMax * 1.05) {
    radii.push(footprint.footprintRadius)
  }

  let dry = 0
  let pathDry = 0
  let total = 0
  let minH = y
  let maxH = y
  let absDeltaSum = 0

  for (const radius of radii) {
    for (let i = 0; i < FOOTPRINT_RING_DIRS; i++) {
      const angle = (i / FOOTPRINT_RING_DIRS) * Math.PI * 2
      const sx = x + Math.cos(angle) * radius
      const sz = z + Math.sin(angle) * radius
      const h = sampleHeight(sx, sz)
      total++
      if (h > waterLevel + SETTLEMENT_WATER_MARGIN) dry++
      if (pathIsDry(x, z, sx, sz, waterLevel, sampleHeight)) pathDry++
      if (h < minH) minH = h
      if (h > maxH) maxH = h
      absDeltaSum += Math.abs(h - y)
    }
  }

  return {
    dryRatio: total > 0 ? dry / total : 0,
    heightSpread: maxH - minH,
    avgAbsDelta: total > 0 ? absDeltaSum / total : 0,
    pathDryRatio: total > 0 ? pathDry / total : 0,
  }
}

function scoreCandidate(
  x: number,
  z: number,
  y: number,
  maxDelta: number,
  center: { x: number, z: number },
  waterLevel: number,
  resourceAttraction: ((x: number, z: number) => number) | undefined,
  footprint: FootprintMetrics | null,
): number {
  const w = SITE_SCORE_WEIGHTS
  const dist = Math.hypot(x - center.x, z - center.z)
  let score =
    w.base -
    maxDelta * w.localFlatness -
    dist * w.distanceFromCenter +
    (y - waterLevel) * w.elevationAboveWater +
    (resourceAttraction?.(x, z) ?? 0) * w.resourceAttraction

  if (footprint) {
    score +=
      footprint.dryRatio * w.footprintDryRatio -
      footprint.heightSpread * w.footprintHeightSpread -
      footprint.avgAbsDelta * w.footprintAvgSlope +
      footprint.pathDryRatio * w.pathDryRatio
  }
  return score
}

/**
 * Pick a walkable, relatively flat patch above water for the village, searching
 * within `searchMargin` of `center`. Seeded search — same seed ⇒ same site.
 * `center` defaults to the origin, matching the original single-settlement
 * behavior exactly (used as-is by the home settlement in multi-settlement mode).
 *
 * Returns `null` when no candidate passes the hard water / local-flatness /
 * footprint-dry gates — callers must skip the cell (or widen the search for
 * home). Wet cell-center fallbacks are not used.
 *
 * `resourceAttraction`, if given, adds plan 032 §5's "resource → site
 * attractiveness" bonus to each already-accepted candidate's score — see
 * `terrain/naturalResources.ts::resourceAttractionAt`. Resource bonus never
 * bypasses hard water / local-flatness / footprint-dry gates.
 *
 * `footprint`, if given, adds plan 047 village-scale suitability (dry area,
 * height spread, slope, dry paths to the house ring) on top of the local
 * ±2.5 plaza probe.
 */
export function findSettlementSite(
  sampleHeight: HeightSampler,
  waterLevel: number,
  halfExtent: number,
  seed: number,
  center: { x: number, z: number } = { x: 0, z: 0 },
  resourceAttraction?: (x: number, z: number) => number,
  footprint?: SettlementFootprintHint,
  searchMargin: number = DEFAULT_SITE_SEARCH_MARGIN,
): SettlementSite | null {
  const random = createSeededRandom(seed ^ 0xc0ffee)
  const margin =
    searchMargin === DEFAULT_SITE_SEARCH_MARGIN
      ? Math.min(DEFAULT_SITE_SEARCH_MARGIN, halfExtent * 0.55)
      : searchMargin
  let best: SettlementSite | null = null
  let bestScore = -Infinity

  for (let i = 0; i < SITE_CANDIDATE_ATTEMPTS; i++) {
    const x = center.x + (random() * 2 - 1) * margin
    const z = center.z + (random() * 2 - 1) * margin
    const y = sampleHeight(x, z)
    if (y <= waterLevel + SETTLEMENT_WATER_MARGIN) continue

    const samples = [
      sampleHeight(x + LOCAL_FLAT_STEP, z),
      sampleHeight(x - LOCAL_FLAT_STEP, z),
      sampleHeight(x, z + LOCAL_FLAT_STEP),
      sampleHeight(x, z - LOCAL_FLAT_STEP),
    ]
    const maxDelta = Math.max(...samples.map((h) => Math.abs(h - y)))
    if (maxDelta > LOCAL_FLAT_MAX_DELTA) continue

    let footprintMetrics: FootprintMetrics | null = null
    if (footprint) {
      footprintMetrics = sampleFootprintMetrics(x, z, y, footprint, waterLevel, sampleHeight)
      if (footprintMetrics.dryRatio < MIN_FOOTPRINT_DRY_RATIO) continue
    }

    const score = scoreCandidate(
      x,
      z,
      y,
      maxDelta,
      center,
      waterLevel,
      resourceAttraction,
      footprintMetrics,
    )
    if (score > bestScore) {
      bestScore = score
      best = { x, z, y }
    }
  }

  return best
}
