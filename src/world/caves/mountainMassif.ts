/**
 * Bounded analytic mountain-massif suitability (plan world-terrain-017).
 *
 * `sampleMountainRidge` is a ridge-strength signal, not a massif identity.
 * This helper samples a fixed neighbourhood and combines ridge presence,
 * elevation, relief and spatial extent so a coherent massif can be
 * distinguished from isolated hills, steep river banks and locally steep
 * lowland. No chunks are instantiated.
 *
 * @domain world-terrain
 */

import {
  type RawSampleParams,
  sampleFloorAt,
  sampleHeightAt,
  sampleMountainRidgeAt,
} from '../../terrain/chunkHeightmap'
import { isMountainRidge, MOUNTAIN_RIDGE_THRESHOLD } from '../../terrain/terrainClassification'

/** Neighbourhood radius (world units) evaluated around a candidate centre. */
export const MASSIF_SAMPLE_RADIUS = 80
/** Outer ring used only for relative-elevation contrast, not membership. */
export const MASSIF_CONTEXT_RADIUS = 160
export const MASSIF_RING_COUNT = 3
export const MASSIF_SAMPLES_PER_RING = 8

export const MASSIF_MIN_MOUNTAIN_FRACTION = 0.42
export const MASSIF_MIN_MEAN_RIDGE = 0.20
export const MASSIF_MIN_RELIEF = 7
export const MASSIF_MIN_RELATIVE_ELEVATION = 3.5
export const MASSIF_MAX_WET_FRACTION = 0.28
/** At least this many rings (including centre as ring 0) must contain a
 *  mountain-classified sample so a single crest does not pass. */
export const MASSIF_MIN_MOUNTAIN_RINGS = 2

export type MassifSampleFns = {
  sampleHeight: (x: number, z: number) => number
  sampleMountainRidge: (x: number, z: number) => number
  sampleFloor?: (x: number, z: number) => number
  waterLevel: number
}

export type MassifEvaluation = {
  suitable: boolean
  score: number
  mountainFraction: number
  meanRidge: number
  relief: number
  relativeElevation: number
  wetFraction: number
  mountainRings: number
  reason: 'suitable' | 'isolated-hill' | 'steep-lowland' | 'wet-bank' | 'incoherent' | 'weak-ridge'
}

export type MassifHit = {
  x: number
  z: number
  evaluation: MassifEvaluation
}

/**
 * Analytic-terrain adaptor so callers that already have `RawSampleParams`
 * (world locations / maps) can classify without instantiating chunks.
 *
 * @domain world-terrain
 */
export function massifSamplesFromParams(params: RawSampleParams): MassifSampleFns {
  return {
    sampleHeight: (x, z) => sampleHeightAt(x, z, params),
    sampleMountainRidge: (x, z) => sampleMountainRidgeAt(x, z, params),
    sampleFloor: (x, z) => sampleFloorAt(x, z, params),
    waterLevel: params.waterLevel,
  }
}

function ringRadius(ring: number): number {
  return (ring / MASSIF_RING_COUNT) * MASSIF_SAMPLE_RADIUS
}

/**
 * Evaluates whether `(x, z)` sits in a coherent mountain massif.
 *
 * @domain world-terrain
 */
export function evaluateMassifSuitability(
  x: number,
  z: number,
  samples: MassifSampleFns,
): MassifEvaluation {
  const heights: number[] = []
  const ridges: number[] = []
  let mountainCount = 0
  let wetCount = 0
  let sampleCount = 0
  const mountainByRing = new Array<boolean>(MASSIF_RING_COUNT + 1).fill(false)

  const consider = (sx: number, sz: number, ring: number): void => {
    const ridge = samples.sampleMountainRidge(sx, sz)
    const height = samples.sampleHeight(sx, sz)
    ridges.push(ridge)
    heights.push(height)
    sampleCount++
    if (isMountainRidge(ridge)) {
      mountainCount++
      mountainByRing[ring] = true
    }
    const floor = samples.sampleFloor?.(sx, sz)
    if (floor != null && floor < samples.waterLevel - 1e-4) wetCount++
  }

  consider(x, z, 0)
  for (let ring = 1; ring <= MASSIF_RING_COUNT; ring++) {
    const radius = ringRadius(ring)
    for (let i = 0; i < MASSIF_SAMPLES_PER_RING; i++) {
      const angle = (i / MASSIF_SAMPLES_PER_RING) * Math.PI * 2
      consider(x + Math.cos(angle) * radius, z + Math.sin(angle) * radius, ring)
    }
  }

  let contextHeight = 0
  for (let i = 0; i < MASSIF_SAMPLES_PER_RING; i++) {
    const angle = (i / MASSIF_SAMPLES_PER_RING) * Math.PI * 2
    contextHeight += samples.sampleHeight(
      x + Math.cos(angle) * MASSIF_CONTEXT_RADIUS,
      z + Math.sin(angle) * MASSIF_CONTEXT_RADIUS,
    )
  }
  contextHeight /= MASSIF_SAMPLES_PER_RING

  const mountainFraction = mountainCount / sampleCount
  const meanRidge = ridges.reduce((sum, r) => sum + r, 0) / sampleCount
  const relief = Math.max(...heights) - Math.min(...heights)
  const meanHeight = heights.reduce((sum, h) => sum + h, 0) / sampleCount
  const relativeElevation = meanHeight - contextHeight
  const wetFraction = wetCount / sampleCount
  const mountainRings = mountainByRing.reduce((n, hit) => n + (hit ? 1 : 0), 0)

  const score =
    meanRidge * 4
    + mountainFraction * 3
    + Math.min(relief, 40) / 20
    + Math.min(Math.max(relativeElevation, 0), 30) / 15
    + mountainRings * 0.25

  if (wetFraction > MASSIF_MAX_WET_FRACTION) {
    return fail('wet-bank')
  }
  if (mountainFraction < MASSIF_MIN_MOUNTAIN_FRACTION || mountainRings < MASSIF_MIN_MOUNTAIN_RINGS) {
    const steepLowland = relief >= MASSIF_MIN_RELIEF && meanRidge < MOUNTAIN_RIDGE_THRESHOLD
    return fail(steepLowland ? 'steep-lowland' : mountainRings < MASSIF_MIN_MOUNTAIN_RINGS ? 'isolated-hill' : 'incoherent')
  }
  if (meanRidge < MASSIF_MIN_MEAN_RIDGE) {
    return fail(relief >= MASSIF_MIN_RELIEF ? 'steep-lowland' : 'weak-ridge')
  }
  if (relativeElevation < MASSIF_MIN_RELATIVE_ELEVATION) {
    return fail('isolated-hill')
  }

  return {
    suitable: true,
    score,
    mountainFraction,
    meanRidge,
    relief,
    relativeElevation,
    wetFraction,
    mountainRings,
    reason: 'suitable',
  }

  function fail(reason: MassifEvaluation['reason']): MassifEvaluation {
    return {
      suitable: false,
      score,
      mountainFraction,
      meanRidge,
      relief,
      relativeElevation,
      wetFraction,
      mountainRings,
      reason,
    }
  }
}

export type MassifSearchEnvelope = {
  minDist: number
  maxDist: number
}

/** Angular × radial samples inside one distance envelope around the origin. */
export const MASSIF_SEARCH_ANGULAR_STEPS = 16
export const MASSIF_SEARCH_RADIAL_STEPS = 6

/**
 * Deterministic candidate centres inside a home-distance envelope.
 *
 * @domain world-terrain
 */
export function massifSearchCentres(envelope: MassifSearchEnvelope): { x: number, z: number }[] {
  const centres: { x: number, z: number }[] = []
  const span = envelope.maxDist - envelope.minDist
  for (let r = 0; r < MASSIF_SEARCH_RADIAL_STEPS; r++) {
    const dist = envelope.minDist + ((r + 0.5) / MASSIF_SEARCH_RADIAL_STEPS) * span
    for (let a = 0; a < MASSIF_SEARCH_ANGULAR_STEPS; a++) {
      const angle = (a / MASSIF_SEARCH_ANGULAR_STEPS) * Math.PI * 2
      centres.push({ x: Math.cos(angle) * dist, z: Math.sin(angle) * dist })
    }
  }
  return centres
}

/**
 * Collects suitable massif hits inside `envelope`, stable-sorted by score
 * then `(x, z)`.
 *
 * @domain world-terrain
 */
export function collectSuitableMassifs(
  envelope: MassifSearchEnvelope,
  samples: MassifSampleFns,
): MassifHit[] {
  const hits: MassifHit[] = []
  for (const centre of massifSearchCentres(envelope)) {
    const evaluation = evaluateMassifSuitability(centre.x, centre.z, samples)
    if (!evaluation.suitable) continue
    hits.push({ x: centre.x, z: centre.z, evaluation })
  }
  hits.sort((a, b) => {
    if (a.evaluation.score !== b.evaluation.score) return b.evaluation.score - a.evaluation.score
    if (a.x !== b.x) return a.x - b.x
    return a.z - b.z
  })
  return hits
}

/**
 * Best neighbourhood in `envelope` even when none fully qualifies — used as
 * a last-resort existing-terrain pick before any macro-worldgen fallback.
 *
 * @domain world-terrain
 */
export function bestMassifNeighbourhood(
  envelope: MassifSearchEnvelope,
  samples: MassifSampleFns,
): MassifHit | null {
  let best: MassifHit | null = null
  for (const centre of massifSearchCentres(envelope)) {
    const evaluation = evaluateMassifSuitability(centre.x, centre.z, samples)
    const hit: MassifHit = { x: centre.x, z: centre.z, evaluation }
    if (
      !best
      || evaluation.score > best.evaluation.score
      || (evaluation.score === best.evaluation.score && (hit.x < best.x || (hit.x === best.x && hit.z < best.z)))
    ) {
      best = hit
    }
  }
  return best
}
