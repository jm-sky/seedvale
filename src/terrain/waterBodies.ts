import { MathUtils } from 'three'

export type WaterBody = {
  id: number
  cellCount: number
  worldArea: number
  /** Large enough to render as reflective open water rather than a small stylized lake. */
  isLarge: boolean
}

export type WaterBodyDetection = {
  bodyId: Int32Array
  bodies: WaterBody[]
}

const WATER_EPS = 1e-4
const LAKE_AREA_SATURATE = 300
/** World-area threshold (world units²) above which a body renders as "large" water.
 *  Area-based rather than grid-boundary-touch so per-chunk BFS (no shared grid edge
 *  to test against) still classifies bodies sensibly. */
const LARGE_BODY_AREA_THRESHOLD = 1800

/**
 * BFS flood-fill over `h <= waterLevel` cells (4-connectivity) to find discrete
 * water bodies. A body touching the grid boundary is the ocean ring guaranteed
 * by generateHeightmap's edge blend — land always separates it from interior lakes.
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
    bodies.push({ id, cellCount, worldArea, isLarge: worldArea >= LARGE_BODY_AREA_THRESHOLD })
  }

  return { bodyId, bodies }
}

/** Remaps a lake's world-space area to a 0 (tiny pond) .. 1 (large lake) wave scale. */
export function lakeScaleFor(area: number): number {
  return MathUtils.smoothstep(area, 4, LAKE_AREA_SATURATE)
}

/** Per-texel wave-amplitude scale: 0 for land, lake-size-based for lakes, 1 for ocean. */
export function computeBodyScale(detection: WaterBodyDetection): Float32Array {
  const { bodyId, bodies } = detection
  const scale = new Float32Array(bodyId.length)
  for (let i = 0; i < bodyId.length; i++) {
    const id = bodyId[i]!
    if (id === -1) {
      scale[i] = 0
      continue
    }
    const body = bodies[id]!
    scale[i] = body.isLarge ? 1.0 : lakeScaleFor(body.worldArea)
  }
  return scale
}
