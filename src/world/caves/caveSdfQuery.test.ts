/** Plan world-terrain-008 B2 — derived SDF column index + Y-aware column
 *  query (transitional: strict occupancy / interior authority only since
 *  world-terrain-019 moved player ground to the heightfield; the neutral
 *  hysteresis tests live in `caveGroundQuery.test.ts`). Pure: no Three.js,
 *  no `ChunkManager`, no `CaveVolume`. */

import { describe, expect, it } from 'vitest'
import type { CaveEntrance } from '../caveVolume'
import type { CaveSdfSpatialRepresentation } from './caveSdfField'
import type { CaveTopology } from './caveTopology'
import {
  applyCaveInteriorHysteresis,
  buildCaveSdfColumnIndex,
  CAVE_COLUMN_STEP,
  CAVE_FLOOR_GRACE,
  isCaveInteriorAt,
  occupancyContains,
  occupancyIntervalAt,
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
      if (Math.hypot(x, z) > 2.5) return 1
      if (y >= 0 && y <= 20) return -1
      return 1
    }
    const surfaceY = 8
    const field = representation(
      { minX: -3, maxX: 3, minY: -1, maxY: 22, minZ: -3, maxZ: 3 },
      sample,
    )
    const index = buildCaveSdfColumnIndex(field, topologyFor('cave:clip', ORIGIN_ENTRANCE), () => surfaceY, 0.4)
    // Inward of the mouth plane and outside the carve, so this is SDF clip
    // only — not the portal interval at the entrance disc.
    const hit = queryColumnIndex(index, 0, 4, -2.2)
    expect(hit).not.toBeNull()
    expect(hit!.ceilingY).toBeLessThan(surfaceY)
    expect(hit!.ceilingY).toBeGreaterThan(surfaceY - 0.3)
    expect(queryColumnIndex(index, 0, surfaceY, -2.2)).toBeNull()
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
    expect(inApproach!.openSky).toBe(true)
    // Outside the recess: no portal, still rock.
    expect(queryColumnIndex(index, 0, mouthY, 12)).toBeNull()
  })
})

describe('strict occupancy', () => {
  it('does not use FLOOR_GRACE: below the floor is solid, queryGround still hits', () => {
    const sample = (x: number, y: number, z: number): number => {
      if (Math.hypot(x, z) > 1.5) return 1
      if (y >= 4 && y <= 8) return -1
      return 1
    }
    const field = representation(
      { minX: -2, maxX: 2, minY: 0, maxY: 12, minZ: -2, maxZ: 2 },
      sample,
    )
    const index = buildCaveSdfColumnIndex(field, topologyFor('cave:occ', ORIGIN_ENTRANCE), () => 20, 0.4)
    const belowFloor = 4 - CAVE_FLOOR_GRACE + 0.2
    expect(queryColumnIndex(index, 0, belowFloor, 0)).not.toBeNull()
    expect(occupancyContains(index, 0, belowFloor, 0)).toBe(false)
    expect(occupancyContains(index, 0, 6, 0)).toBe(true)
    expect(occupancyIntervalAt(index, 0, 6, 0)?.floorY).toBeGreaterThan(3.5)
  })

  it('stacked intervals stay vertically distinct (no full-height void)', () => {
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
    const index = buildCaveSdfColumnIndex(field, topologyFor('cave:occ-stack', ORIGIN_ENTRANCE), () => 20, 0.4)
    expect(occupancyContains(index, 0, 1, 0)).toBe(true)
    expect(occupancyContains(index, 0, 4, 0)).toBe(false)
    expect(occupancyContains(index, 0, 7, 0)).toBe(true)
    const lower = occupancyIntervalAt(index, 0, 1, 0)
    const upper = occupancyIntervalAt(index, 0, 7, 0)
    expect(lower).not.toBeNull()
    expect(upper).not.toBeNull()
    expect(lower!.ceilingY).toBeLessThan(upper!.floorY)
  })

  it('hillside above a clipped ceiling is solid at surface Y', () => {
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
    const index = buildCaveSdfColumnIndex(field, topologyFor('cave:occ-clip', ORIGIN_ENTRANCE), () => surfaceY, 0.4)
    expect(occupancyContains(index, 0, 4, 0)).toBe(true)
    expect(occupancyContains(index, 0, surfaceY, 0)).toBe(false)
  })

  it('mouth portal remains void; rock outside the recess is solid', () => {
    const entrance = entranceAt(0, 0, 0, 0)
    const surface = (): number => 10
    const field = representation(
      { minX: -1, maxX: 1, minY: -1, maxY: 12, minZ: -1, maxZ: 1 },
      () => 1,
    )
    const index = buildCaveSdfColumnIndex(field, topologyFor('cave:occ-portal', entrance), surface, 0.4)
    const mouthY = surface() - 0.8
    expect(occupancyContains(index, 0, mouthY, 0)).toBe(true)
    expect(occupancyContains(index, 0, mouthY, 2.2)).toBe(true)
    expect(occupancyContains(index, 0, mouthY, 12)).toBe(false)
  })
})

describe('mouth-plane entrance ownership', () => {
  it('does not assign a deep SDF floor to a surface player in the approach', () => {
    const entrance = entranceAt(0, 0, 0, 0)
    const surface = (): number => 10
    // Closed ellipsoid centred at the mouth, extending into the approach.
    const field = representation(
      { minX: -4, maxX: 4, minY: -2, maxY: 12, minZ: -4, maxZ: 8 },
      (x, y, z) => {
        const dx = x / 2
        const dy = (y - 1.3) / 1.3
        const dz = z / 2
        return Math.hypot(dx, dy, dz) - 1
      },
    )
    const index = buildCaveSdfColumnIndex(field, topologyFor('cave:approach', entrance), surface, 0.4)
    const approachZ = 2.2
    const carvedY = surface() - mouthCarveDepth(0, approachZ, entrance)
    const hit = queryColumnIndex(index, 0, carvedY, approachZ)
    expect(hit).not.toBeNull()
    expect(hit!.floorY).toBeGreaterThan(carvedY - 0.35)
    expect(hit!.floorY).toBeLessThan(carvedY + 0.35)
    expect(isCaveInteriorAt(index, entrance, 0, carvedY, approachZ)).toBe(false)
  })

  it('hands the player to cave ground after crossing the mouth plane', () => {
    const entrance = entranceAt(0, 0, 0, 0)
    const surface = (): number => 10
    const field = representation(
      { minX: -4, maxX: 4, minY: -2, maxY: 12, minZ: -8, maxZ: 4 },
      (x, y, z) => {
        const dx = x / 2
        const dy = (y - 1.3) / 1.3
        const dz = z / 2
        return Math.hypot(dx, dy, dz) - 1
      },
    )
    const index = buildCaveSdfColumnIndex(field, topologyFor('cave:enter', entrance), surface, 0.4)
    const interiorZ = -1.2
    const hit = queryColumnIndex(index, 0, 1.3, interiorZ)
    expect(hit).not.toBeNull()
    expect(isCaveInteriorAt(index, entrance, 0, 1.3, interiorZ)).toBe(true)
    const intervals = hit!.intervals
    expect(intervals.length).toBe(1)
    expect(intervals[0]!.ceilingY - intervals[0]!.floorY).toBeGreaterThan(1.8)
  })
})

describe('applyCaveInteriorHysteresis', () => {
  it('ignores a single opposite sample at the mouth boundary', () => {
    const entered = applyCaveInteriorHysteresis(true, false, false)
    expect(entered.interior).toBe(false)
    expect(entered.rememberRaw).toBe(true)
    const confirmed = applyCaveInteriorHysteresis(true, true, false)
    expect(confirmed.interior).toBe(true)
  })

  it('requires two consecutive exterior samples to leave', () => {
    const flicker = applyCaveInteriorHysteresis(false, true, true)
    expect(flicker.interior).toBe(true)
    const left = applyCaveInteriorHysteresis(false, false, true)
    expect(left.interior).toBe(false)
  })
})
