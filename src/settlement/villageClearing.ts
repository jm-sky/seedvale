import type { HeightSampler } from '../player/PlayerController'
import type { VillageClearingParams } from '../terrain/chunkHeightmap'
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

/**
 * Lays out a village's local terrain clearings: one shared "core" patch and
 * one small patch per family (its house), scattered on a seeded ring around
 * the core. Pure/analytic — no dependency on `settlementGenerator.ts`, safe
 * to call before anything is "loaded" (same spirit as `findSettlementSite.ts`).
 * Positions are deterministic from `seed`; `targetH` is sampled once via the
 * ambient `sampleHeight` passed in — the same one `findSettlementSite` uses,
 * so this doesn't see its own not-yet-applied terrain modification (avoids
 * the same kind of circular dependency `roadNetwork.ts` calls out for road
 * corridors).
 */
/** Retries per house candidate before giving up and accepting whatever the
 *  last roll landed on — `findSettlementSite` already picked a site that's
 *  locally flat/dry right at its center, but that guarantee doesn't reach
 *  out to the house ring (~1.6-4.8x `houseRadius` away), so a coastal or
 *  hilly village could otherwise land a house in the water. Best-effort, not
 *  exhaustive — still deterministic (same seeded `random` stream). */
const HOUSE_SITE_ATTEMPTS = 4

export function layoutClearings(
  site: { x: number, z: number, y: number },
  families: readonly FamilyDef[],
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
  const houses: ClearingArea[] = families.map((_, i) => {
    const baseAngle = (i / families.length) * Math.PI * 2

    let hx = site.x
    let hz = site.z
    let targetH = core.targetH
    for (let attempt = 0; attempt < HOUSE_SITE_ATTEMPTS; attempt++) {
      const angle = baseAngle + random() * 0.6
      const dist = ringMin + random() * (ringMax - ringMin)
      const cx = site.x + Math.cos(angle) * dist
      const cz = site.z + Math.sin(angle) * dist
      const ch = averageHeight(cx, cz, params.houseRadius, sampleHeight)
      hx = cx
      hz = cz
      targetH = ch
      if (ch > waterLevel + 0.8) break
    }

    return { x: hx, z: hz, radius: params.houseRadius, targetH }
  })

  return { core, houses }
}
