import { MathUtils } from 'three'
import type { HeightSampler } from '../player/PlayerController'
import type { WaterBodyKind } from '../world/WaterSource'
import { oceanMixAt } from './waterBodies'

/**
 * @domain world
 * @system water
 * @role Shared natural lake/river/ocean shoreline classification plus a
 *   continuous lake-proximity signal (plan world-016) — the one place this
 *   geometry is derived, reused by interaction (drink/fill/fishing,
 *   `app/interactables.ts`) and ambient audio (lake frogs,
 *   `audio/createAmbientAudio.ts`) instead of each re-deriving it. The
 *   probe/classifier below moved out of `fauna/AnimalAgent.ts`/
 *   `app/interactables.ts` — it's pure terrain geometry, not fauna or
 *   interaction-app logic.
 */

/** Fixed small-radius offsets around a point used to test "is this exact
 *  spot the edge of a lake/ocean water body" (moved from
 *  `fauna/AnimalAgent.ts`, plan world-016 — originally built for the
 *  thirsty-animal shoreline search, but pure terrain geometry that
 *  interaction/ambient code need the exact same signal for). */
const SHORE_PROBE_OFFSETS: readonly [number, number][] = [
  [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5],
]
const WATER_MARGIN = 0.3

/** Count of `SHORE_PROBE_OFFSETS` around (x, z) that dip at/below the water
 *  threshold — a lightweight "is this the edge of a water body" signal.
 *  Pure so it's unit-testable without Three.js. */
export function shoreProbeHits(
  x: number,
  z: number,
  sampleHeight: HeightSampler,
  waterLevel: number,
): number {
  let hits = 0
  for (const [dx, dz] of SHORE_PROBE_OFFSETS) {
    if (sampleHeight(x + dx, z + dz) <= waterLevel + WATER_MARGIN) hits++
  }
  return hits
}

/** First `SHORE_PROBE_OFFSETS` point around (x, z) that is actually water —
 *  the same signal as `shoreProbeHits`, but returning a real, distinct world
 *  point instead of a count. `null` when `shoreProbeHits` would be 0.
 *  Deterministic (fixed offset order). */
export function nearestShoreProbePoint(
  x: number,
  z: number,
  sampleHeight: HeightSampler,
  waterLevel: number,
): { x: number, z: number } | null {
  for (const [dx, dz] of SHORE_PROBE_OFFSETS) {
    if (sampleHeight(x + dx, z + dz) <= waterLevel + WATER_MARGIN) return { x: x + dx, z: z + dz }
  }
  return null
}

/** How close (world units) to a river's own bank edge counts as "at the
 *  shore" — same order of magnitude as `SHORE_PROBE_OFFSETS`'s 1.5-unit
 *  probe radius, so lake/river/ocean shorelines all read as similarly
 *  generous. */
const RIVER_SHORE_MARGIN = 1.5

/** Pure lake-vs-river-vs-ocean decision from already-resolved probe/distance
 *  inputs. `hasShoreProbeHit` is `shoreProbeHits(...) > 0`; `oceanMix` is
 *  `oceanMixAt(...)` at the same point; `riverBankDistance` is
 *  `ChunkManager.riverShoreDistance(...)`. */
export function resolveWaterBodyKind(
  hasShoreProbeHit: boolean,
  oceanMix: number,
  riverBankDistance: number | null,
): WaterBodyKind | null {
  if (hasShoreProbeHit) return oceanMix > 0.5 ? 'ocean' : 'lake'
  if (riverBankDistance !== null && riverBankDistance <= RIVER_SHORE_MARGIN) return 'river'
  return null
}

/** Samplers `lakeProximityAt` needs — a subset of `ChunkManager`/
 *  `WorldContext`, passed straight through rather than duplicated. */
export type LakeProximitySamplers = {
  sampleHeight: HeightSampler
  sampleContinentalness: (x: number, z: number) => number
  waterLevel: number
  region: { oceanThreshold: number, coastThreshold: number }
}

/** Ring radii (world units) probed outward from the listener to find the
 *  nearest lake/ocean water cell — bounded/deterministic, no world-wide lake
 *  scan (plan world-016 §4/§8). Spans "standing at the shore" through "far
 *  enough inland frogs should already be silent" over a few dozen metres. */
const LAKE_PROXIMITY_RADII: readonly number[] = [5, 10, 18, 28, 40]
const LAKE_PROXIMITY_MAX_RADIUS = 40
const LAKE_PROXIMITY_DIRECTIONS = 8

function isWaterAt(x: number, z: number, sampleHeight: HeightSampler, waterLevel: number): boolean {
  return sampleHeight(x, z) <= waterLevel + WATER_MARGIN
}

/** Nearest `LAKE_PROXIMITY_RADII` ring (world units) at which (x, z) reads as
 *  water, or `null` if none of the bounded rings do. Same "is this point
 *  water" probe as `shoreProbeHits`, generalized to a radius search instead
 *  of one fixed 1.5 m ring. */
function nearestWaterRingRadius(
  x: number,
  z: number,
  sampleHeight: HeightSampler,
  waterLevel: number,
): number | null {
  if (isWaterAt(x, z, sampleHeight, waterLevel)) return 0
  for (const radius of LAKE_PROXIMITY_RADII) {
    for (let i = 0; i < LAKE_PROXIMITY_DIRECTIONS; i++) {
      const angle = (i / LAKE_PROXIMITY_DIRECTIONS) * Math.PI * 2
      const px = x + Math.cos(angle) * radius
      const pz = z + Math.sin(angle) * radius
      if (isWaterAt(px, pz, sampleHeight, waterLevel)) return radius
    }
  }
  return null
}

/** `[0, 1]` continuous "how close to a lake shore is (x, z)" signal for
 *  local ambience gain (plan world-016 §4-§6) — 1 at/inside a lake's water,
 *  smoothly fading to 0 by the outermost `LAKE_PROXIMITY_RADII` ring, and
 *  always 0 near the ocean (one `oceanMixAt` check at the listener's own
 *  position, rather than reclassifying every probed ring point — an inland
 *  lake and the open sea are never this close together in this world's
 *  generation). River proximity never contributes: `nearestWaterRingRadius`
 *  reuses the same height-threshold probe `shoreProbeHits` does, which
 *  rivers usually don't satisfy (a river's own water surface can sit above
 *  `waterLevel`, see `terrain/waterSample.ts`) — rivers are rejected by
 *  construction, not by an extra check here. Bounded to a fixed handful of
 *  samples — no world-wide lake registry scan. */
export function lakeProximityAt(x: number, z: number, s: LakeProximitySamplers): number {
  const oceanMix = oceanMixAt(s.sampleContinentalness(x, z), s.region.oceanThreshold, s.region.coastThreshold)
  if (oceanMix > 0.5) return 0

  const radius = nearestWaterRingRadius(x, z, s.sampleHeight, s.waterLevel)
  if (radius === null) return 0
  return 1 - MathUtils.smoothstep(radius, 0, LAKE_PROXIMITY_MAX_RADIUS)
}
