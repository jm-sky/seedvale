/** Plan world-terrain-008 B2 — derived SDF column index + Y-aware gameplay
 *  query. Pure: no Three.js, no `ChunkManager`, no `CaveVolume`. */

import { describe, expect, it } from 'vitest'
import type { CaveEntrance } from '../caveVolume'
import type { CaveSdfSpatialRepresentation } from './caveSdfField'
import type { CaveTopology } from './caveTopology'
import {
  applyCaveGroundHysteresis,
  buildCaveSdfColumnIndex,
  CAVE_COLUMN_STEP,
  CAVE_UNDERGROUND_MISS,
  pickInterval,
  queryColumnIndex,
} from './caveSdfQuery'
import { mouthCarveDepth } from './mouthCarve'

function entranceAt(x: number, y: number, z: number, yaw = 0): CaveEntrance {
  return { x, y, z, yaw, width: 3, height: 2.6 }
}

function topologyFor(caveId: string, entrance: CaveEntrance): CaveTopology {
  const p = { x: entrance.x, y: entrance.y, z: entrance.z }
  return {
    caveId,
    seed: 1,
    entrance,
    minClearance: 2,
    nodes: [{ id: 'start', kind: 'entrance', position: p, targetWidth: 3, targetHeight: 2.6 }],
    segments: [{ id: 'self', from: 'start', to: 'start', centerline: [p, p] }],
    features: [],
  }
}

function representation(
  bounds: CaveSdfSpatialRepresentation['bounds'],
  sample: CaveSdfSpatialRepresentation['sample'],
): CaveSdfSpatialRepresentation {
  return { bounds, sample }
}

const ORIGIN_ENTRANCE = entranceAt(0, 0, 0)

describe('buildCaveSdfColumnIndex', () => {
  it('is deterministic: same field + topology + surface → identical columns', () => {
    const sample = (x: number, y: number, z: number): number => {
      const inXZ = Math.hypot(x, z) < 2
      if (!inXZ) return 1
      if (y >= 0 && y <= 3) return -1
      return 1
    }
    const field = representation(
      { minX: -3, maxX: 3, minY: -1, maxY: 5, minZ: -3, maxZ: 3 },
      sample,
    )
    const topology = topologyFor('cave:det', ORIGIN_ENTRANCE)
    const surface = (): number => 20
    const a = buildCaveSdfColumnIndex(field, topology, surface, 0.5)
    const b = buildCaveSdfColumnIndex(field, topology, surface, 0.5)
    expect(a.originX).toBe(b.originX)
    expect(a.originZ).toBe(b.originZ)
    expect(a.nx).toBe(b.nx)
    expect(a.nz).toBe(b.nz)
    expect(a.columns).toEqual(b.columns)
  })

  it('snaps origin to a fixed world step, not noisy bounds.min', () => {
    const sample = (): number => 1
    const field = representation(
      { minX: 0.13, maxX: 2.1, minY: 0, maxY: 2, minZ: -1.7, maxZ: 0.4 },
      sample,
    )
    const index = buildCaveSdfColumnIndex(field, topologyFor('cave:snap', ORIGIN_ENTRANCE), () => 10, 0.4)
    expect(Math.abs(index.originX / 0.4 - Math.round(index.originX / 0.4))).toBeLessThan(1e-9)
    expect(Math.abs(index.originZ / 0.4 - Math.round(index.originZ / 0.4))).toBeLessThan(1e-9)
    expect(index.originX).toBeLessThanOrEqual(0.13)
    expect(index.originZ).toBeLessThanOrEqual(-1.7)
    expect(index.step).toBe(CAVE_COLUMN_STEP)
  })

  it('extracts stacked vertical intervals at the same X/Z and pickInterval uses Y, not Math.min', () => {
    const sample = (x: number, y: number, z: number): number => {
      if (Math.hypot(x, z) > 1.5) return 1
      if (y >= 0 && y <= 2) return -1
      if (y >= 6 && y <= 9) return -1
      return 1
    }
    const field = representation(
      { minX: -2, maxX: 2, minY: -1, maxY: 12, minZ: -2, maxZ: 2 },
      sample,
    )
    const index = buildCaveSdfColumnIndex(field, topologyFor('cave:stack', ORIGIN_ENTRANCE), () => 20, 0.4)
    const lower = queryColumnIndex(index, 0, 1, 0)
    const upper = queryColumnIndex(index, 0, 7, 0)
    expect(lower).not.toBeNull()
    expect(upper).not.toBeNull()
    const stacked = lower!.intervals.filter((interval) => interval.ceilingY < 12)
    expect(stacked.length).toBe(2)
    expect(lower!.floorY).toBeLessThan(1.2)
    expect(lower!.ceilingY).toBeGreaterThan(1.5)
    expect(lower!.ceilingY).toBeLessThan(3)
    expect(upper!.floorY).toBeGreaterThan(5)
    expect(upper!.floorY).toBeLessThan(7)
    expect(upper!.ceilingY).toBeGreaterThan(8)
    expect(upper!.floorY).not.toBe(lower!.floorY)
    const pickedLower = pickInterval(stacked, 1)
    const pickedUpper = pickInterval(stacked, 7)
    expect(pickedLower!.floorY).toBe(lower!.floorY)
    expect(pickedUpper!.floorY).toBe(upper!.floorY)
    expect(Math.min(lower!.floorY, upper!.floorY)).toBe(lower!.floorY)
    expect(pickedUpper!.floorY).not.toBe(Math.min(lower!.floorY, upper!.floorY))
  })

  it('clips SDF intervals to the analytic surface', () => {
    const sample = (x: number, y: number, z: number): number => {
      if (Math.hypot(x, z) > 1.5) return 1
      if (y >= 0 && y <= 20) return -1
      return 1
    }
    const surfaceY = 8
    const field = representation(
      { minX: -2, maxX: 2, minY: -1, maxY: 22, minZ: -2, maxZ: 2 },
      sample,
    )
    const index = buildCaveSdfColumnIndex(field, topologyFor('cave:clip', ORIGIN_ENTRANCE), () => surfaceY, 0.4)
    const hit = queryColumnIndex(index, 0, 4, 0)
    expect(hit).not.toBeNull()
    expect(hit!.ceilingY).toBeLessThan(surfaceY)
    expect(hit!.ceilingY).toBeGreaterThan(surfaceY - 0.3)
    expect(queryColumnIndex(index, 0, surfaceY, 0)).toBeNull()
  })

  it('unions the mouth/approach carve as a portal below the analytic surface', () => {
    const entrance = entranceAt(0, 0, 0, 0)
    const surface = (x: number, z: number): number => 10 + 0 * x * z
    // Field is solid rock — the portal must still open the carved recess.
    const field = representation(
      { minX: -1, maxX: 1, minY: -1, maxY: 12, minZ: -1, maxZ: 1 },
      () => 1,
    )
    const index = buildCaveSdfColumnIndex(field, topologyFor('cave:portal', entrance), surface, 0.4)
    const mouthY = surface(0, 0) - 2.2
    const atMouth = queryColumnIndex(index, 0, mouthY, 0)
    expect(atMouth).not.toBeNull()
    expect(atMouth!.floorY).toBeLessThan(mouthY + 0.2)
    expect(atMouth!.ceilingY).toBeLessThan(surface(0, 0))
    // Approach pit is centred 2.2 m outward along yaw=0 → +Z.
    const approachZ = 3.5
    expect(mouthCarveDepth(0, approachZ, entrance)).toBeGreaterThan(0.2)
    const inApproach = queryColumnIndex(index, 0, mouthY, approachZ)
    expect(inApproach).not.toBeNull()
    // Outside the recess: no portal, still rock.
    expect(queryColumnIndex(index, 0, mouthY, 12)).toBeNull()
  })
})

describe('applyCaveGroundHysteresis', () => {
  const caveHit = { floorY: 2, ceilingY: 8, intervals: [{ floorY: 2, ceilingY: 8 }] }

  it('keeps the last cave interval on an underground miss (no upward teleport)', () => {
    const resolved = applyCaveGroundHysteresis(null, 2.2, 2.2 + CAVE_UNDERGROUND_MISS + 1, caveHit)
    expect(resolved.hit).toEqual(caveHit)
    expect(resolved.remember).toEqual(caveHit)
  })

  it('releases on a real cave→surface exit where surface ≈ player Y', () => {
    const resolved = applyCaveGroundHysteresis(null, 10, 10.1, caveHit)
    expect(resolved.hit).toBeNull()
    expect(resolved.remember).toBeNull()
  })

  it('does not assign a surface entity to a cave below them', () => {
    const surfaceY = 12
    const resolved = applyCaveGroundHysteresis(null, surfaceY, surfaceY, caveHit)
    expect(resolved.hit).toBeNull()
  })

  it('prefers a fresh hit over hysteresis', () => {
    const next = { floorY: 3, ceilingY: 9, intervals: [{ floorY: 3, ceilingY: 9 }] }
    const resolved = applyCaveGroundHysteresis(next, 4, 20, caveHit)
    expect(resolved.hit).toEqual(next)
    expect(resolved.remember).toEqual(next)
  })
})
