import { describe, expect, it } from 'vitest'
import { buildCaveHeightfieldFixture } from './caveHeightfieldFixtures'
import {
  buildCaveHeightfieldRepresentation,
  DEFAULT_HEIGHTFIELD_CONFIG,
  sampleHeightfieldAt,
} from './caveHeightfieldRepresentation'
import {
  HEIGHTFIELD_PLAYER_HEIGHT,
  HEIGHTFIELD_PLAYER_RADIUS,
  heightfieldCapsuleHitsCeiling,
  queryHeightfieldSpace,
  resolveHeightfieldHorizontal,
} from './caveHeightfieldTraversal'

const TEST_CONFIG = { ...DEFAULT_HEIGHTFIELD_CONFIG, cellSize: 0.5 }

describe('cave heightfield traversal (plan world-terrain-018)', () => {
  it('returns valid floor/ceiling inside and blocked/outside beyond the boundary', () => {
    const topology = buildCaveHeightfieldFixture('basic')
    const { representation } = buildCaveHeightfieldRepresentation(topology, TEST_CONFIG)
    const inside = queryHeightfieldSpace(representation, 0, -8)
    expect(inside.inside).toBe(true)
    expect(inside.blocked).toBe(false)
    expect(Number.isFinite(inside.floorY)).toBe(true)
    expect(inside.ceilingY - inside.floorY).toBeGreaterThanOrEqual(topology.minClearance - 1e-4)

    const outside = queryHeightfieldSpace(representation, 12, -8)
    expect(outside.inside).toBe(false)
    expect(outside.blocked).toBe(true)

    const approach = queryHeightfieldSpace(representation, 0, 6)
    expect(approach.blocked).toBe(false)
  })

  it('a player capsule cannot pass through a boundary wall', () => {
    const topology = buildCaveHeightfieldFixture('basic')
    const { representation } = buildCaveHeightfieldRepresentation(topology, TEST_CONFIG)
    const start = sampleHeightfieldAt(representation, 0, -8)
    expect(start.inside).toBe(true)
    const resolved = resolveHeightfieldHorizontal(representation, 10, -8, HEIGHTFIELD_PLAYER_RADIUS)
    const after = sampleHeightfieldAt(representation, resolved.x, resolved.z)
    expect(after.signedDistance).toBeLessThanOrEqual(-HEIGHTFIELD_PLAYER_RADIUS + 0.08)
    expect(Math.abs(resolved.x)).toBeLessThan(3.2)
  })

  it('a player capsule cannot pass through the ceiling', () => {
    const topology = buildCaveHeightfieldFixture('basic')
    const { representation } = buildCaveHeightfieldRepresentation(topology, TEST_CONFIG)
    const sample = sampleHeightfieldAt(representation, 0, -17)
    expect(sample.inside).toBe(true)
    expect(heightfieldCapsuleHitsCeiling(
      representation,
      0,
      sample.ceilingY - 0.2,
      -17,
      HEIGHTFIELD_PLAYER_HEIGHT,
    )).toBe(true)
    expect(heightfieldCapsuleHitsCeiling(
      representation,
      0,
      sample.floorY,
      -17,
      HEIGHTFIELD_PLAYER_HEIGHT,
    )).toBe(false)
  })
})
