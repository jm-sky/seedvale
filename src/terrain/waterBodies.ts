import { MathUtils } from 'three'

export type WaterBody = {
  id: number
  cellCount: number
  worldArea: number
}

export type WaterBodyDetection = {
  bodyId: Int32Array
  bodies: WaterBody[]
}

export type BodyScaleParams = {
  continentalness: Float32Array
  oceanThreshold: number
  coastThreshold: number
}

const WATER_EPS = 1e-4
const LAKE_AREA_SATURATE = 300
/**
 * Chunk-water fragment discards above this (`createWater.ts`). Ocean cells are
 * written as 1; inland lakes must stay strictly below so they never punch
 * through to the Water.js singleton (plan 098 faza 1 / W8).
 */
export const OCEAN_BODY_SCALE_DISCARD = 0.9
/** Max `lakeScaleFor` after remap — leaves headroom under the discard gate. */
export const LAKE_SCALE_MAX = 0.85

/**
 * BFS flood-fill over `h <= waterLevel` cells (4-connectivity) to find discrete
 * water bodies within one chunk's (apron-inclusive) grid. Area is used only to
 * scale inland-lake waves — not to decide ocean vs lake.
 */
export function detectWaterBodies(
  heights: Float32Array,
  resolution: number,
  waterLevel: number,
  step: number,
): WaterBodyDetection {
  const bodyId = new Int32Array(resolution * resolution).fill(-1)
  const bodies: WaterBody[] = []
  const queue = new Int32Array(resolution * resolution)

  for (let start = 0; start < resolution * resolution; start++) {
    if (bodyId[start] !== -1 || heights[start]! > waterLevel + WATER_EPS) continue

    const id = bodies.length
    let head = 0
    let tail = 0
    queue[tail++] = start
    bodyId[start] = id

    let cellCount = 0

    while (head < tail) {
      const idx = queue[head++]!
      const ix = idx % resolution
      const iz = (idx / resolution) | 0
      cellCount++

      const neighbors: [number, number][] = [
        [ix + 1, iz],
        [ix - 1, iz],
        [ix, iz + 1],
        [ix, iz - 1],
      ]
      for (const [nx, nz] of neighbors) {
        if (nx < 0 || nz < 0 || nx >= resolution || nz >= resolution) continue
        const nIdx = nz * resolution + nx
        if (bodyId[nIdx] !== -1 || heights[nIdx]! > waterLevel + WATER_EPS) continue
        bodyId[nIdx] = id
        queue[tail++] = nIdx
      }
    }

    const worldArea = cellCount * step * step
    bodies.push({ id, cellCount, worldArea })
  }

  return { bodyId, bodies }
}

/** Remaps a lake's world-space area to a 0 (tiny pond) .. 1 (large lake) wave scale. */
export function lakeScaleFor(area: number): number {
  return MathUtils.smoothstep(area, 4, LAKE_AREA_SATURATE)
}

/**
 * 1 = unambiguously ocean (`continentalness <= oceanThreshold`),
 * 0 = unambiguously inland (`>= coastThreshold`).
 */
export function oceanMixAt(
  continentalness: number,
  oceanThreshold: number,
  coastThreshold: number,
): number {
  const lo = Math.min(oceanThreshold, coastThreshold)
  const hi = Math.max(oceanThreshold, coastThreshold)
  return 1 - MathUtils.smoothstep(continentalness, lo, hi)
}

/**
 * Per-texel scale: 0 land, inland lake wave scale (capped below the ocean
 * discard), 1 ocean (continentalness, not chunk area).
 */
export function computeBodyScale(
  detection: WaterBodyDetection,
  params: BodyScaleParams,
): Float32Array {
  const { bodyId, bodies } = detection
  const { continentalness, oceanThreshold, coastThreshold } = params
  const scale = new Float32Array(bodyId.length)
  for (let i = 0; i < bodyId.length; i++) {
    const id = bodyId[i]!
    if (id === -1) {
      scale[i] = 0
      continue
    }
    const oceanMix = oceanMixAt(continentalness[i]!, oceanThreshold, coastThreshold)
    if (oceanMix > OCEAN_BODY_SCALE_DISCARD) {
      scale[i] = 1
      continue
    }
    const body = bodies[id]!
    scale[i] = Math.min(LAKE_SCALE_MAX, lakeScaleFor(body.worldArea))
  }
  return scale
}
