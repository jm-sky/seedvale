import { BufferAttribute, BufferGeometry } from 'three'
import type { RiverChain, RiverPoint, WorldRect } from '../terrain/riverNetwork'
import { widthFromAccumulation } from '../terrain/riverNetwork'

/** Water surface sits slightly above the sampled river-bed elevation — same
 *  idea as `createWater.ts`'s `waterLevel + 0.07`, just relative to the
 *  per-point bed height instead of a flat water level. */
export const RIVER_SURFACE_OFFSET = 0.06

function lerpRiverPoint(a: RiverPoint, b: RiverPoint, t: number): RiverPoint {
  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    elevation: a.elevation + (b.elevation - a.elevation) * t,
    accumulation: a.accumulation + (b.accumulation - a.accumulation) * t,
  }
}

/** Liang-Barsky segment-vs-axis-aligned-rect clip. Returns the `[t0, t1]`
 *  portion of `a -> b` that lies inside `rect`, or `null` if none of it does. */
function clipSegment(a: RiverPoint, b: RiverPoint, rect: WorldRect): { t0: number; t1: number } | null {
  let t0 = 0
  let t1 = 1
  const dx = b.x - a.x
  const dz = b.z - a.z
  const edges: [number, number][] = [
    [-dx, a.x - rect.minX],
    [dx, rect.maxX - a.x],
    [-dz, a.z - rect.minZ],
    [dz, rect.maxZ - a.z],
  ]
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null
      continue
    }
    const r = q / p
    if (p < 0) {
      if (r > t1) return null
      if (r > t0) t0 = r
    } else {
      if (r < t0) return null
      if (r < t1) t1 = r
    }
  }
  return t0 < t1 ? { t0, t1 } : null
}

/**
 * Clips one chain's point list against a chunk's world-space rectangle,
 * returning zero or more contiguous runs of points inside it (a chain can
 * leave and re-enter a rect, or a rect can be small enough to only catch part
 * of one segment). Every returned point is either an original chain point or
 * a linear interpolation of the same original endpoints, so two adjacent
 * chunks clipping the same cached chain always agree exactly at the shared
 * boundary — no independent re-derivation.
 */
export function clipChainToRect(chain: RiverChain, rect: WorldRect): RiverPoint[][] {
  const runs: RiverPoint[][] = []
  let current: RiverPoint[] = []
  const pts = chain.points

  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    const clipped = clipSegment(a, b, rect)
    if (!clipped) {
      if (current.length > 1) runs.push(current)
      current = []
      continue
    }
    const pA = clipped.t0 === 0 ? a : lerpRiverPoint(a, b, clipped.t0)
    const pB = clipped.t1 === 1 ? b : lerpRiverPoint(a, b, clipped.t1)
    if (current.length === 0) {
      current.push(pA, pB)
    } else {
      const last = current[current.length - 1]!
      if (last.x === pA.x && last.z === pA.z) {
        current.push(pB)
      } else {
        if (current.length > 1) runs.push(current)
        current = [pA, pB]
      }
    }
  }
  if (current.length > 1) runs.push(current)
  return runs
}

function tangentAt(points: RiverPoint[], i: number): { tx: number; tz: number } {
  const prev = points[Math.max(0, i - 1)]!
  const next = points[Math.min(points.length - 1, i + 1)]!
  const dx = next.x - prev.x
  const dz = next.z - prev.z
  const len = Math.hypot(dx, dz) || 1
  return { tx: dx / len, tz: dz / len }
}

/**
 * Builds a simple extruded ribbon (perpendicular offset by flow-derived
 * half-width) from already-clipped, chunk-local runs. Y comes from each
 * point's already-sampled `elevation` (no duplicate terrain sampling) plus
 * `RIVER_SURFACE_OFFSET`. Positions are relative to `(chunkOriginX,
 * chunkOriginZ)` so the resulting geometry can be attached at that origin.
 */
export function buildRiverRibbonGeometry(
  runs: RiverPoint[][],
  chunkOriginX: number,
  chunkOriginZ: number,
  /** Actual rendered terrain height at a world point (see `createRiverWater.ts`) —
   *  used for Y instead of each point's cached hydrology `elevation`. */
  sampleTerrainY: (worldX: number, worldZ: number) => number,
): BufferGeometry | null {
  const usableRuns = runs.filter((run) => run.length >= 2)
  if (usableRuns.length === 0) return null

  const positions: number[] = []
  const uvs: number[] = []
  const indices: number[] = []

  for (const run of usableRuns) {
    const base = positions.length / 3
    let arcLength = 0
    for (let i = 0; i < run.length; i++) {
      const p = run[i]!
      const { tx, tz } = tangentAt(run, i)
      const px = -tz
      const pz = tx
      const halfWidth = widthFromAccumulation(p.accumulation) / 2

      const x = p.x - chunkOriginX
      const z = p.z - chunkOriginZ
      const y = sampleTerrainY(p.x, p.z) + RIVER_SURFACE_OFFSET

      positions.push(x - px * halfWidth, y, z - pz * halfWidth)
      positions.push(x + px * halfWidth, y, z + pz * halfWidth)

      if (i > 0) {
        const prev = run[i - 1]!
        arcLength += Math.hypot(p.x - prev.x, p.z - prev.z)
      }
      uvs.push(0, arcLength)
      uvs.push(1, arcLength)

      if (i < run.length - 1) {
        const a = base + i * 2
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2)
      }
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2))
  geometry.setIndex(indices)
  return geometry
}
