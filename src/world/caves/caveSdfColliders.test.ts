/** Plan world-terrain-008 B3 — Y-banded colliders derived from strict SDF
 *  occupancy. Pure: no Three.js, no `ChunkManager`. */

import { describe, expect, it } from 'vitest'
import type { CaveEntrance } from '../caveVolume'
import type { CaveSdfSpatialRepresentation } from './caveSdfField'
import type { CaveTopology } from './caveTopology'
import { colliderActiveAtY, colliderContainsPoint, resolvePosition } from '../collision'
import { buildCaveSdfColliders, CAVE_SDF_BEAD_RADIUS } from './caveSdfColliders'
import { buildCaveSdfColumnIndex, occupancyContains } from './caveSdfQuery'
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

const SURFACE = 20
const ENTRANCE = entranceAt(0, 0, 0)

describe('buildCaveSdfColliders', () => {
  it('is deterministic: same index → bit-identical beads', () => {
    const sample = (x: number, y: number, z: number): number => {
      if (Math.hypot(x, z) > 3) return 1
      if (y >= 0 && y <= 4) return -1
      return 1
    }
    const field = representation(
      { minX: -4, maxX: 4, minY: -1, maxY: 6, minZ: -4, maxZ: 4 },
      sample,
    )
    const topology = topologyFor('cave:col-det', ENTRANCE)
    const index = buildCaveSdfColumnIndex(field, topology, () => SURFACE, 0.4)
    const a = buildCaveSdfColliders(index, () => SURFACE, field)
    const b = buildCaveSdfColliders(index, () => SURFACE, field)
    expect(a).toEqual(b)
    expect(a.length).toBeGreaterThan(8)
    for (const c of a) {
      expect(c.type).toBe('circle')
      if (c.type !== 'circle') continue
      expect(c.radius).toBe(CAVE_SDF_BEAD_RADIUS)
      expect(c.minY).toBeDefined()
      expect(c.maxY).toBeDefined()
    }
  })

  it('underground beads are inactive at surface Y', () => {
    const sample = (x: number, y: number, z: number): number => {
      if (Math.hypot(x, z) > 3) return 1
      if (y >= 0 && y <= 4) return -1
      return 1
    }
    const field = representation(
      { minX: -4, maxX: 4, minY: -1, maxY: 6, minZ: -4, maxZ: 4 },
      sample,
    )
    const index = buildCaveSdfColumnIndex(field, topologyFor('cave:col-y', ENTRANCE), () => SURFACE, 0.4)
    const colliders = buildCaveSdfColliders(index, () => SURFACE, field)
    const activeAbove = colliders.filter((c) => colliderActiveAtY(c, SURFACE))
    expect(activeAbove.length).toBe(0)
    expect(colliders.some((c) => colliderActiveAtY(c, 2))).toBe(true)
  })

  it('stacked intervals emit disjoint Y-bands, not one full-height cylinder', () => {
    const sample = (x: number, y: number, z: number): number => {
      const r = Math.hypot(x, z)
      if (y >= 0 && y <= 2 && r < 3) return -1
      if (y >= 6 && y <= 8 && r < 1.6) return -1
      return 1
    }
    const field = representation(
      { minX: -4, maxX: 4, minY: -1, maxY: 10, minZ: -4, maxZ: 4 },
      sample,
    )
    const index = buildCaveSdfColumnIndex(field, topologyFor('cave:col-stack', ENTRANCE), () => SURFACE, 0.4)
    const colliders = buildCaveSdfColliders(index, () => SURFACE, field)
    const lower = colliders.filter((c) => (c.maxY ?? 0) < 5)
    const upper = colliders.filter((c) => (c.minY ?? 0) > 4)
    expect(lower.length).toBeGreaterThan(0)
    expect(upper.length).toBeGreaterThan(0)
    expect(lower.every((c) => (c.maxY ?? 0) < (upper[0]!.minY ?? 0))).toBe(true)
    const atUpperY = 7
    const activeUpper = colliders.filter((c) => colliderActiveAtY(c, atUpperY))
    expect(activeUpper.length).toBeGreaterThan(0)
    expect(activeUpper.every((c) => (c.minY ?? 0) > 4)).toBe(true)
    const atGapY = 4
    const activeGap = colliders.filter((c) => colliderActiveAtY(c, atGapY))
    expect(activeGap.length).toBe(0)
  })

  it('shelf/overhang: lower-band beads do not block the upper interval XZ', () => {
    const sample = (x: number, y: number, z: number): number => {
      const r = Math.hypot(x, z)
      if (y >= 0 && y <= 2 && r < 3.2) return -1
      if (y >= 5 && y <= 7 && r < 1.4) return -1
      return 1
    }
    const field = representation(
      { minX: -4, maxX: 4, minY: -1, maxY: 9, minZ: -4, maxZ: 4 },
      sample,
    )
    const index = buildCaveSdfColumnIndex(field, topologyFor('cave:col-shelf', ENTRANCE), () => SURFACE, 0.4)
    const colliders = buildCaveSdfColliders(index, () => SURFACE, field)
    const upperStanding = { x: 0, z: 0, y: 6 }
    const lowerWallProbe = { x: 2.4, z: 0, y: 1 }
    expect(occupancyContains(index, upperStanding.x, upperStanding.y, upperStanding.z)).toBe(true)
    const activeAtUpper = colliders.filter((c) => colliderActiveAtY(c, upperStanding.y))
    expect(activeAtUpper.some((c) => colliderContainsPoint(c, upperStanding.x, upperStanding.z))).toBe(false)
    const activeAtLower = colliders.filter((c) => colliderActiveAtY(c, lowerWallProbe.y))
    expect(activeAtLower.length).toBeGreaterThan(0)
  })

  it('does not seal the mouth portal with a closed ring', () => {
    const entrance = entranceAt(0, 0, 0, 0)
    const surface = (): number => 10
    const field = representation(
      { minX: -1, maxX: 1, minY: -1, maxY: 12, minZ: -1, maxZ: 8 },
      () => 1,
    )
    const index = buildCaveSdfColumnIndex(field, topologyFor('cave:col-mouth', entrance), surface, 0.4)
    const colliders = buildCaveSdfColliders(index, surface, field)
    const mouthY = 10 - 2.2
    const active = colliders.filter((c) => colliderActiveAtY(c, mouthY))
    const alongOpening = { x: 0, z: 2.2 }
    const resolved = resolvePosition(alongOpening.x, alongOpening.z, 0.35, active)
    expect(Math.hypot(resolved.x - alongOpening.x, resolved.z - alongOpening.z)).toBeLessThan(0.05)
  })

  it('NPC/fauna-style query respects colliderActiveAtY: surface XZ over a cave is walkable', () => {
    const sample = (x: number, y: number, z: number): number => {
      if (Math.hypot(x, z) > 3) return 1
      if (y >= 0 && y <= 4) return -1
      return 1
    }
    const field = representation(
      { minX: -4, maxX: 4, minY: -1, maxY: 6, minZ: -4, maxZ: 4 },
      sample,
    )
    const index = buildCaveSdfColumnIndex(field, topologyFor('cave:col-npc', ENTRANCE), () => SURFACE, 0.4)
    const colliders = buildCaveSdfColliders(index, () => SURFACE, field)
    expect(colliders.length).toBeGreaterThan(0)
    const bead = colliders[0]!
    const x = bead.x
    const z = bead.z
    const unfilteredHit = colliders.some((c) => colliderContainsPoint(c, x, z))
    expect(unfilteredHit).toBe(true)
    const surfaceWalkable = !colliders.some(
      (c) => colliderActiveAtY(c, SURFACE) && colliderContainsPoint(c, x, z),
    )
    expect(surfaceWalkable).toBe(true)
    const undergroundBlocked = colliders.some(
      (c) => colliderActiveAtY(c, 2) && colliderContainsPoint(c, x, z),
    )
    expect(undergroundBlocked).toBe(true)
  })

  it('does not block the approach with the closed SDF front shell', () => {
    const entrance = entranceAt(0, 0, 0, 0)
    const surface = (): number => 10
    const field = representation(
      { minX: -4, maxX: 4, minY: -2, maxY: 12, minZ: -4, maxZ: 8 },
      (x, y, z) => {
        const dx = x / 2
        const dy = (y - 1.3) / 1.3
        const dz = z / 2
        return Math.hypot(dx, dy, dz) - 1
      },
    )
    const index = buildCaveSdfColumnIndex(field, topologyFor('cave:col-shell', entrance), surface, 0.4)
    const colliders = buildCaveSdfColliders(index, surface, field, entrance)
    const approachZ = 2.2
    const y = surface() - mouthCarveDepth(0, approachZ, entrance)
    const active = colliders.filter((c) => colliderActiveAtY(c, y))
    const resolved = resolvePosition(0, approachZ, 0.35, active)
    expect(Math.hypot(resolved.x, resolved.z - approachZ)).toBeLessThan(0.05)
  })
})
