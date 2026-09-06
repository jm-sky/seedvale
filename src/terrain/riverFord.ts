/**
 * @domain terrain
 * @system water
 * @role Road × river crossing semantics — the small amount of pure maths that
 *   turns "a road corridor and a river channel overlap this texel" into a
 *   shallow, traversable ford instead of the road simply falling into a
 *   full-depth carved channel.
 * @integration Consumed by `chunkHeightmap.ts`'s river-carving stage, which
 *   already has both influences resolved at the texel it is shaping (the
 *   road/path corridor falloff from stage 2, the canonical
 *   `RiverChannelSegment` profile in stage 3). Deliberately *not* a separate
 *   ford mesh, ford segment list or second river representation: a crossing
 *   is an emergent property of the two segment sets the pipeline already
 *   carries, so it needs no new per-chunk data and stays seam-free by the
 *   same argument roads and rivers already are — every texel inside a chunk
 *   sees every segment whose influence reaches that chunk, so two chunks
 *   sharing a boundary compute an identical ford there.
 */

/** Water width (world units) up to which a crossing is fully forded — a
 *  stream/small river a cart can splash through. `widthFromAccumulation`'s
 *  range is 0.4 .. 11, so this covers everything but the genuinely large
 *  channels. */
const FORD_FULL_WATER_WIDTH = 6
/** Water width beyond which no ford forms at all: a real river needs a
 *  bridge, not a raised bar, and silently shallowing it would contradict the
 *  canonical channel the water ribbon renders. Between the two widths the
 *  ford fades out smoothly rather than switching on at a hard threshold. */
const FORD_NO_FORD_WATER_WIDTH = 9

/** Water column (world units) kept over a fully-forded bed. Strictly
 *  positive: the ribbon's water surface is canonical and unchanged by
 *  fording, so the bed must stay below it or the rendered water would sit at
 *  or under the terrain it covers. Small enough to read as "wet crossing",
 *  not "the river got dammed". */
export const FORD_WATER_DEPTH = 0.12

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function smoothstep01(v: number): number {
  const t = clamp01(v)
  return t * t * (3 - 2 * t)
}

/**
 * 0..1 "how much is this texel a ford" blend.
 *
 * `roadFalloff` is the road/path corridor's own lateral falloff at this texel
 * (1 on the centerline, 0 at the corridor edge) — reusing it directly is what
 * makes the ford exactly as wide as the road that causes it, and makes the
 * crossing fade out along the corridor edge with no lateral jump. `waterWidth`
 * is the channel's interpolated water width there, gating the effect to
 * crossings small enough to ford at all.
 */
export function fordStrength(roadFalloff: number, waterWidth: number): number {
  if (roadFalloff <= 0) return 0
  const sizeGate =
    1 -
    smoothstep01(
      (waterWidth - FORD_FULL_WATER_WIDTH) / (FORD_NO_FORD_WATER_WIDTH - FORD_FULL_WATER_WIDTH),
    )
  if (sizeGate <= 0) return 0
  // Ease the corridor falloff so the crossing is flat-ish across most of the
  // road's width and only tapers near its edge, instead of the bed rising in
  // a narrow ridge under the centerline.
  return smoothstep01(roadFalloff * 1.35) * sizeGate
}

/**
 * Streambed elevation at a forded texel — raised toward `waterH -
 * FORD_WATER_DEPTH` in proportion to `ford`, never lowered and never above
 * the water surface. `ford === 0` returns `bedH` unchanged, so an ordinary
 * (non-crossing) texel is bit-identical to the pre-ford pipeline.
 */
export function fordBedHeight(bedH: number, waterH: number, ford: number): number {
  if (ford <= 0) return bedH
  const target = Math.max(bedH, waterH - FORD_WATER_DEPTH)
  return bedH + (target - bedH) * clamp01(ford)
}
