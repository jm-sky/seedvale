import { createSeededRandom } from './parseSeed'

/**
 * Deterministic well-placement groundwater/anomaly model (plan world-004
 * §1/§4) — deliberately not a hydrology simulation: a well's water is
 * resolved once, from world seed + placement position + local terrain, and
 * the result is persisted (`world/playerWell.ts`'s `PlayerWellRecord`) so it
 * never changes across chunk unload/reload (plan §11/§12).
 *
 * @domain world
 * @system well-groundwater
 * @role Pure placement-time depth/water-kind resolution for player-built wells.
 */

/** Groundwater/underground-anomaly classification a well can resolve to
 *  (plan §1). `groundwater` is the common case; the other two are sparse
 *  deterministic anomalies, never a simulated network. */
export type WellWaterKind = 'groundwater' | 'reservoir' | 'underground_stream'

export type WellWaterResult = {
  kind: WellWaterKind
  /** Abstract "how hard to dig / how deep" unit — not a literal render
   *  depth. Drives `playerWell.ts`'s `getWellPitWorkHours` and the deep-well
   *  `rock_mining`/`rope` gates (`isDeepWellDepth`). */
  depth: number
}

/** Bounds every `WellWaterResult.depth` is clamped into (plan §12 —
 *  deterministic and bounded, no runaway values from extreme terrain). */
export const WELL_WATER_DEPTH_MIN = 2
export const WELL_WATER_DEPTH_MAX = 12

/** Elevation above the local water level (world units — `HeightSampler`'s
 *  and `ChunkManager.waterLevel`'s own raw scale) beyond which higher
 *  terrain no longer deepens the base reading further — keeps the formula
 *  monotonic and bounded without threading `ChunkManagerConfig.heightScale`
 *  in just for this one placement-time calculation. */
const ELEVATION_REFERENCE = 30

/** Sparse deterministic anomaly rates (plan §1 "mogą być rozmieszczane
 *  losowo, z określonym prawdopodobieństwem") — kept low so `groundwater`
 *  stays the common case; tuned values, not derived from anything else. */
const RESERVOIR_CHANCE = 0.08
const STREAM_CHANCE = 0.08
const RESERVOIR_DEPTH_FACTOR = 0.45
const STREAM_DEPTH_FACTOR = 0.7

/** `depth` at/above which a well counts as "deep" (plan §3/§4) — the single
 *  threshold shared by the pit's extra `rock_mining` requirement
 *  (`playerWell.ts`'s `wellStageCapabilities`) and the `rope` requirement to
 *  draw water once built (`playerWell.ts`'s `wellWaterSource`). */
export const DEEP_WELL_DEPTH_THRESHOLD = 7

export function isDeepWellDepth(depth: number): boolean {
  return depth >= DEEP_WELL_DEPTH_THRESHOLD
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n))
}

/** Higher terrain (relative to the local water level) → deeper base
 *  groundwater — monotonic and bounded into `[WELL_WATER_DEPTH_MIN,
 *  WELL_WATER_DEPTH_MAX]` (plan §1/§12). */
function baseGroundwaterDepth(terrainHeight: number, waterLevel: number): number {
  const elevation = Math.max(0, terrainHeight - waterLevel)
  const fraction = clamp01(elevation / ELEVATION_REFERENCE)
  return WELL_WATER_DEPTH_MIN + fraction * (WELL_WATER_DEPTH_MAX - WELL_WATER_DEPTH_MIN)
}

/** Stable 32-bit seed for one placement's own PRNG draw — coordinates are
 *  quantized to centimeters so float noise can't perturb the result across
 *  calls, same "hash coords into a numeric seed for `createSeededRandom`"
 *  shape as `terrain/resourceDeposits.ts`'s `hashId`. */
function hashWellPlacement(seed: number, x: number, z: number): number {
  let h = seed >>> 0
  h = Math.imul(h ^ Math.round(x * 100), 0x85ebca6b) >>> 0
  h ^= h >>> 13
  h = Math.imul(h ^ Math.round(z * 100), 0xc2b2ae35) >>> 0
  h ^= h >>> 16
  return h >>> 0
}

/**
 * Deterministic placement-time groundwater/anomaly resolution — a pure
 * function of world seed + placement position + local terrain height, no
 * `Math.random()`. The caller (`world/createPlayerWells.ts`'s `place()`)
 * resolves this exactly once, at well placement, and persists the result;
 * it must never be re-rolled on chunk unload/reload (plan §11/§12).
 */
export function resolveWellWater(
  seed: number,
  x: number,
  z: number,
  terrainHeight: number,
  waterLevel: number,
): WellWaterResult {
  const base = baseGroundwaterDepth(terrainHeight, waterLevel)
  const roll = createSeededRandom(hashWellPlacement(seed, x, z))()
  if (roll < RESERVOIR_CHANCE) {
    return { kind: 'reservoir', depth: Math.max(WELL_WATER_DEPTH_MIN, base * RESERVOIR_DEPTH_FACTOR) }
  }
  if (roll < RESERVOIR_CHANCE + STREAM_CHANCE) {
    return { kind: 'underground_stream', depth: Math.max(WELL_WATER_DEPTH_MIN, base * STREAM_DEPTH_FACTOR) }
  }
  return { kind: 'groundwater', depth: base }
}
