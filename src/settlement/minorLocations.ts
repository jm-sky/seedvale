import { type RawSampleParams, sampleContinentalnessAt, sampleHeightAt } from '../terrain/chunkHeightmap'
import type { SettlementDef } from './settlementGenerator'

export type MinorLocation = {
  kind: 'dock'
  x: number
  z: number
  y: number
  /** Orientation (radians) — points from land out toward the water, so a
   *  pier prop can be placed facing the right way. */
  angle: number
}

const SEARCH_DIRECTIONS = 16
const SEARCH_STEP = 4

/**
 * Ray-marches outward from a settlement's site in `SEARCH_DIRECTIONS` evenly
 * spaced directions, looking for the nearest crossing into water
 * (`continentalness` dropping below `coastThreshold`). Pure/analytic — same
 * pattern as `findSettlementSite.ts`, safe to call before anything is
 * "loaded". Inland settlements (no crossing within `maxRadius`) simply get
 * no dock — not an error case.
 */
export function findDockLocation(
  def: SettlementDef,
  params: RawSampleParams,
  maxRadius: number,
): MinorLocation | null {
  let best: { x: number; z: number; angle: number; dist: number } | null = null

  for (let i = 0; i < SEARCH_DIRECTIONS; i++) {
    const angle = (i / SEARCH_DIRECTIONS) * Math.PI * 2
    const dx = Math.cos(angle)
    const dz = Math.sin(angle)

    for (let dist = SEARCH_STEP; dist <= maxRadius; dist += SEARCH_STEP) {
      const x = def.x + dx * dist
      const z = def.z + dz * dist
      const c = sampleContinentalnessAt(x, z, params)
      if (c < params.region.coastThreshold) {
        if (!best || dist < best.dist) {
          // Step back half a stride so the dock sits on the shore, not in the water.
          const shoreX = x - dx * SEARCH_STEP * 0.5
          const shoreZ = z - dz * SEARCH_STEP * 0.5
          best = { x: shoreX, z: shoreZ, angle, dist }
        }
        break
      }
    }
  }

  if (!best) return null
  return {
    kind: 'dock',
    x: best.x,
    z: best.z,
    y: sampleHeightAt(best.x, best.z, params),
    angle: best.angle,
  }
}

/** Cached per settlement id — resolved once, same seed/site ⇒ same result. */
const cache = new Map<string, MinorLocation[]>()

export function minorLocationsFor(
  def: SettlementDef,
  params: RawSampleParams,
  maxDockSearchRadius: number,
): MinorLocation[] {
  let locations = cache.get(def.id)
  if (!locations) {
    const dock = findDockLocation(def, params, maxDockSearchRadius)
    locations = dock ? [dock] : []
    cache.set(def.id, locations)
  }
  return locations
}
