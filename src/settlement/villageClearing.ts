import type { HeightSampler } from '../player/PlayerController'
import type { SettlementTerrain } from '../shared/SettlementName'
import type { RegionalSmoothingSegment, VillageClearingParams } from '../terrain/chunkHeightmap'
import type { FamilyDef } from './families'
import { createSeededRandom } from '../world/parseSeed'

export type ClearingArea = {
  x: number
  z: number
  radius: number
  /** Pre-computed flat target height, sampled once via the ambient
   *  (clearing-agnostic) `sampleHeight` — see `ChunkTileParams.clearings`'
   *  doc comment (`terrain/chunkHeightmap.ts`) for why that ordering matters. */
  targetH: number
}

export type ClearingLayout = {
  /** Shared area at the settlement's site center — well/stockpile/garden
   *  (+extras for bigger villages, see `settlement/props.ts`). */
  core: ClearingArea
  /** One per family — its house sits here. Same order as `SettlementDef.families`. */
  houses: readonly ClearingArea[]
  /** Broad, weak smoothing pass covering the whole village footprint (core +
   *  house ring), pulling outlier clearings toward a shared average height —
   *  see `RegionalSmoothingSegment`'s doc comment for why it's a separate,
   *  earlier-applied pass rather than another `ClearingArea`. */
  regional: RegionalSmoothingSegment
}

/** A handful of samples around a clearing's center, averaged — same idea as
 *  `findSettlementSite`'s 4-direction flatness probe, just used to pick a
 *  representative height instead of rejecting uneven spots. */
function averageHeight(cx: number, cz: number, r: number, sampleHeight: HeightSampler): number {
  const offsets: readonly [number, number][] = [
    [0, 0],
    [r * 0.6, 0],
    [-r * 0.6, 0],
    [0, r * 0.6],
    [0, -r * 0.6],
  ]
  let sum = 0
  for (const [dx, dz] of offsets) sum += sampleHeight(cx + dx, cz + dz)
  return sum / offsets.length
}

/** Retries per house candidate before giving up and falling back to hugging
 *  the core — `findSettlementSite` already picked a site that's locally
 *  flat/dry right at its center, but that guarantee doesn't reach out to the
 *  house ring (~1.6-4.8x `houseRadius` away), so a coastal or hilly village
 *  could otherwise land a house across water from the rest of the village.
 *  Best-effort, not exhaustive — still deterministic (same seeded `random`
 *  stream). */
const HOUSE_SITE_ATTEMPTS = 4

/** Clearance above `waterLevel` a candidate house site (and its path to the
 *  core) needs — same margin `findSettlementSite` uses for the site itself. */
const HOUSE_WATER_MARGIN = 0.8

/** Points sampled along the core→candidate line (inclusive of both ends) to
 *  check for water — catches not just "is the house itself dry" but "is it
 *  actually reachable from the plaza without crossing water" (a house on its
 *  own dry islet still fails this). Same line the house↔core path segment
 *  (`roadNetwork.ts`'s `villageSegmentsNear`) draws, so this doubles as
 *  validating that path too. */
const HOUSE_PATH_SAMPLES = 5

function pathIsDry(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  waterLevel: number,
  sampleHeight: HeightSampler,
): boolean {
  for (let i = 0; i < HOUSE_PATH_SAMPLES; i++) {
    const t = i / (HOUSE_PATH_SAMPLES - 1)
    const x = ax + (bx - ax) * t
    const z = az + (bz - az) * t
    if (sampleHeight(x, z) <= waterLevel + HOUSE_WATER_MARGIN) return false
  }
  return true
}

/**
 * Lays out a village's local terrain clearings: one shared "core" patch, one
 * small patch per family (its house) scattered on a seeded ring around the
 * core, and one broad regional-smoothing patch covering the whole footprint.
 * Pure/analytic — no dependency on `settlementGenerator.ts`, safe to call
 * before anything is "loaded" (same spirit as `findSettlementSite.ts`).
 * Positions are deterministic from `seed`; heights are sampled once via the
 * ambient `sampleHeight` passed in — the same one `findSettlementSite` uses,
 * so this doesn't see its own not-yet-applied terrain modification (avoids
 * the same kind of circular dependency `roadNetwork.ts` calls out for road
 * corridors).
 */
export function layoutClearings(
  site: { x: number, z: number, y: number },
  families: readonly FamilyDef[],
  terrain: SettlementTerrain,
  seed: number,
  sampleHeight: HeightSampler,
  waterLevel: number,
  params: VillageClearingParams,
): ClearingLayout {
  const core: ClearingArea = {
    x: site.x,
    z: site.z,
    radius: params.coreRadius,
    targetH: averageHeight(site.x, site.z, params.coreRadius, sampleHeight),
  }

  const random = createSeededRandom(seed ^ 0x2b9e17)
  const ringMin = params.coreRadius + params.houseRadius * 1.6
  const ringMax = ringMin + params.houseRadius * 3.2
  // Closer to the core than any ring position — hugging it means hugging
  // ground `findSettlementSite` already verified dry/flat, the best
  // available fallback when the ring keeps landing on/across water.
  const fallbackDist = params.coreRadius + params.houseRadius * 1.1

  const houses: ClearingArea[] = families.map((_, i) => {
    const baseAngle = (i / families.length) * Math.PI * 2

    for (let attempt = 0; attempt < HOUSE_SITE_ATTEMPTS; attempt++) {
      const angle = baseAngle + random() * 0.6
      const dist = ringMin + random() * (ringMax - ringMin)
      const cx = site.x + Math.cos(angle) * dist
      const cz = site.z + Math.sin(angle) * dist
      if (!pathIsDry(site.x, site.z, cx, cz, waterLevel, sampleHeight)) continue
      return { x: cx, z: cz, radius: params.houseRadius, targetH: averageHeight(cx, cz, params.houseRadius, sampleHeight) }
    }

    const fx = site.x + Math.cos(baseAngle) * fallbackDist
    const fz = site.z + Math.sin(baseAngle) * fallbackDist
    return { x: fx, z: fz, radius: params.houseRadius, targetH: averageHeight(fx, fz, params.houseRadius, sampleHeight) }
  })

  const allTargets = [core.targetH, ...houses.map((h) => h.targetH)]
  const regional: RegionalSmoothingSegment = {
    x: site.x,
    z: site.z,
    radius: ringMax + params.houseRadius * 2,
    targetH: allTargets.reduce((a, b) => a + b, 0) / allTargets.length,
    heightStrength:
      terrain === 'mountain' ? params.regionalHeightStrengthMountain : params.regionalHeightStrengthFlat,
  }

  return { core, houses, regional }
}
