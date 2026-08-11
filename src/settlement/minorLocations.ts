import type { HeightSampler } from '../player/PlayerController'
import type { RegionParams } from '../terrain/chunkHeightmap'
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
  origin: { x: number, z: number },
  sampleHeight: HeightSampler,
  sampleContinentalness: (x: number, z: number) => number,
  region: RegionParams,
  maxRadius: number,
): MinorLocation | null {
  let best: { x: number; z: number; angle: number; dist: number } | null = null

  for (let i = 0; i < SEARCH_DIRECTIONS; i++) {
    const angle = (i / SEARCH_DIRECTIONS) * Math.PI * 2
    const dx = Math.cos(angle)
    const dz = Math.sin(angle)

    for (let dist = SEARCH_STEP; dist <= maxRadius; dist += SEARCH_STEP) {
      const x = origin.x + dx * dist
      const z = origin.z + dz * dist
      const c = sampleContinentalness(x, z)
      if (c < region.coastThreshold) {
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
    y: sampleHeight(best.x, best.z),
    angle: best.angle,
  }
}

/** Cached per settlement id — resolved once, same seed/site ⇒ same result. */
const cache = new Map<string, MinorLocation[]>()

export function clearMinorLocationCaches(): void {
  cache.clear()
}

/**
 * Plan 047 adapter: prefer a dock landmark already on `VillagePlan`; fall back
 * to the analytic ocean ray-march for settlements without a planned dock.
 */
export function minorLocationsFor(
  def: SettlementDef,
  sampleHeight: HeightSampler,
  sampleContinentalness: (x: number, z: number) => number,
  region: RegionParams,
  maxDockSearchRadius: number,
): MinorLocation[] {
  let locations = cache.get(def.id)
  if (!locations) {
    const planned = def.plan.landmarks.find((l) => l.kind === 'dock')
    if (planned) {
      locations = [
        {
          kind: 'dock',
          x: planned.x,
          z: planned.z,
          y: planned.y,
          angle: planned.rotation,
        },
      ]
    } else {
      // Cheap pre-check: `def.terrain` already averages continentalness around
      // the site for naming — only coastal-ish settlements get the ray-march.
      const dock =
        def.terrain === 'ocean' || def.foodSourceType === 'fishing'
          ? findDockLocation(
              { x: def.x, z: def.z },
              sampleHeight,
              sampleContinentalness,
              region,
              maxDockSearchRadius,
            )
          : null
      locations = dock ? [dock] : []
    }
    cache.set(def.id, locations)
  }
  return locations
}
