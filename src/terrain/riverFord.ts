/**
 * @domain terrain
 * @system water
 * @role Ford *shaping* maths — the small amount of pure geometry that turns an
 *   already-declared road↔river crossing into a shallow, traversable bed
 *   instead of the road falling into a full-depth carved channel.
 * @integration Since plan world-terrain-023 this module no longer decides
 *   whether a crossing exists: `settlement/roadRiverCrossing.ts` owns that,
 *   and `settlement/roadNetwork.ts` projects each declared `ford` crossing
 *   into compact, worker-safe {@link FordProjection} data on
 *   `ChunkTileParams.fordProjections` (the same "resolve nearby routes
 *   main-thread, ship plain numbers to the worker" seam as
 *   `RoadCorridorSegment`). `chunkHeightmap.ts`'s river-carving stage and
 *   `ChunkManager.sampleLocalWater()` both read the influence through
 *   {@link fordInfluenceAt} and the shaped bed through {@link fordBedHeight},
 *   so gameplay water depth and terrain agree by construction. An incidental
 *   road × river overlap with no declared crossing leaves the canonical
 *   channel completely natural.
 *
 *   Seam-safety follows the same argument roads and rivers already use: a
 *   projection is plain world-space geometry handed to every chunk its
 *   influence reaches, so two chunks sharing a boundary compute an identical
 *   ford there.
 */

/** Water column (world units) kept over a fully-forded bed. Strictly
 *  positive: the ribbon's water surface is canonical and unchanged by
 *  fording, so the bed must stay below it or the rendered water would sit at
 *  or under the terrain it covers. Small enough to read as "wet crossing",
 *  not "the river got dammed". */
export const FORD_WATER_DEPTH = 0.12

/**
 * One declared ford crossing, projected to worker-safe plain numbers: an
 * oriented ellipse centred on the canonical crossing anchor, its long axis
 * along the road (covering the channel the road traverses) and its short axis
 * across it (the crossing road corridor's own half-width). Nothing about the
 * road graph, the river chain or any runtime object survives the projection —
 * terrain only ever sees this footprint.
 */
export type FordProjection = {
  /** Crossing anchor (world X/Z). */
  x: number
  z: number
  /** Unit road direction through the crossing. */
  dirX: number
  dirZ: number
  /** Ford extent along the road — the channel span plus a short approach. */
  halfLength: number
  /** Ford extent across the road — the crossing corridor's half-width. */
  halfWidth: number
}

/** Fraction of the footprint that stays at full ford strength before tapering
 *  to its edge — mirrors the road corridor's own `CORRIDOR_INNER_FRACTION`
 *  shape so the crossing is flat across most of the road's width and only
 *  fades near the rim, instead of raising the bed in a narrow ridge. */
const FORD_INNER_FRACTION = 0.45

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function smoothstep01(v: number): number {
  const t = clamp01(v)
  return t * t * (3 - 2 * t)
}

/**
 * 0..1 "how much is this point a declared ford" blend — the strongest
 * overlapping projection wins, so two crossings near each other never sum
 * into an over-raised bed. Returns 0 (no shaping at all) outside every
 * declared footprint, which is what keeps an incidental road × river overlap
 * a natural channel.
 */
export function fordInfluenceAt(
  x: number,
  z: number,
  fords: readonly FordProjection[],
): number {
  let best = 0
  for (const f of fords) {
    const dx = x - f.x
    const dz = z - f.z
    const along = (dx * f.dirX + dz * f.dirZ) / Math.max(1e-6, f.halfLength)
    const across = (-dx * f.dirZ + dz * f.dirX) / Math.max(1e-6, f.halfWidth)
    const r = Math.hypot(along, across)
    if (r >= 1) continue
    const influence = 1 - smoothstep01((r - FORD_INNER_FRACTION) / (1 - FORD_INNER_FRACTION))
    if (influence > best) best = influence
  }
  return best
}

/**
 * Streambed elevation at a forded point — raised toward `waterH -
 * FORD_WATER_DEPTH` in proportion to `ford`, never lowered and never above
 * the water surface. `ford === 0` returns `bedH` unchanged, so an ordinary
 * (non-crossing) point is bit-identical to the un-forded pipeline.
 *
 * This is the one effective-ford-bed helper (plan §9): canonical
 * `RiverChannelSegment.bedH`/`waterH` stay hydrological geometry, and every
 * consumer that needs the *shaped* bed — terrain carving and local water
 * sampling alike — derives it here rather than mutating hydrology.
 */
export function fordBedHeight(bedH: number, waterH: number, ford: number): number {
  if (ford <= 0) return bedH
  const target = Math.max(bedH, waterH - FORD_WATER_DEPTH)
  return bedH + (target - bedH) * clamp01(ford)
}
