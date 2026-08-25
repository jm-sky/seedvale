import { describe, expect, it } from 'vitest'
import {
  closestBoundaryPoint,
  type Collider,
  colliderContainsPoint,
  colliderRimPoint,
  colliderSignedDistance,
  createColliderRegistry,
  type ObbCollider,
  resolvePosition,
} from './collision'

describe('resolvePosition — circle', () => {
  it('leaves the point untouched when nothing overlaps', () => {
    const colliders: Collider[] = [{ type: 'circle', x: 10, z: 10, radius: 1 }]
    expect(resolvePosition(0, 0, 0.4, colliders)).toEqual({ x: 0, z: 0 })
  })

  it('pushes the point outside a single overlapping collider along the center vector', () => {
    const colliders: Collider[] = [{ type: 'circle', x: 0, z: 0, radius: 1 }]
    const result = resolvePosition(0.5, 0, 0.4, colliders)
    expect(result.x).toBeCloseTo(1.4, 5)
    expect(result.z).toBeCloseTo(0, 5)
  })

  it('resolves against the deepest penetration when multiple colliders overlap', () => {
    const colliders: Collider[] = [
      { type: 'circle', x: 0, z: 0, radius: 1 }, // penetration 0.9
      { type: 'circle', x: 0.2, z: 0, radius: 2 }, // penetration 2.2 - deeper
    ]
    const result = resolvePosition(0, 0, 0.4, colliders)
    // pushed away from (0.2, 0) by radius+entityRadius = 2.4
    expect(result.x).toBeCloseTo(0.2 - 2.4, 5)
    expect(result.z).toBeCloseTo(0, 5)
  })

  it('picks an arbitrary direction when the entity sits exactly on a collider center', () => {
    const colliders: Collider[] = [{ type: 'circle', x: 5, z: 5, radius: 1 }]
    const result = resolvePosition(5, 5, 0.4, colliders)
    expect(Math.hypot(result.x - 5, result.z - 5)).toBeCloseTo(1.4, 5)
  })
})

describe('resolvePosition — OBB', () => {
  const wall: ObbCollider = { type: 'obb', x: 0, z: 0, halfWidth: 1, halfDepth: 0.2, rotationY: 0 }

  it('leaves the point untouched when nothing overlaps', () => {
    expect(resolvePosition(0, 5, 0.35, [wall])).toEqual({ x: 0, z: 5 })
  })

  it('pushes an entity outside the front face straight out along Z', () => {
    const result = resolvePosition(0, 0.3, 0.35, [wall])
    expect(result.x).toBeCloseTo(0, 5)
    expect(result.z).toBeCloseTo(0.55, 5)
  })

  it('pushes an entity outside the back face straight out along -Z', () => {
    const result = resolvePosition(0, -0.3, 0.35, [wall])
    expect(result.z).toBeCloseTo(-0.55, 5)
  })

  it('pushes an entity outside the left/right (long) faces along X', () => {
    const right = resolvePosition(1.1, 0, 0.35, [wall])
    expect(right.x).toBeCloseTo(1.35, 5)
    expect(right.z).toBeCloseTo(0, 5)

    const left = resolvePosition(-1.1, 0, 0.35, [wall])
    expect(left.x).toBeCloseTo(-1.35, 5)
  })

  it('resolves a corner-adjacent point along the diagonal to the nearest corner', () => {
    const result = resolvePosition(1.05, 0.25, 0.1, [wall])
    const dx = result.x - 1
    const dz = result.z - 0.2
    expect(Math.hypot(dx, dz)).toBeCloseTo(0.1, 5)
  })

  it('pushes an entity centered inside the OBB out through the nearest (short) edge', () => {
    const result = resolvePosition(0, 0.05, 0.1, [wall])
    expect(result.x).toBeCloseTo(0, 5)
    expect(result.z).toBeCloseTo(0.3, 5)
  })

  it('rotates with the OBB — a 90° yaw swaps which world axis is "long"', () => {
    const rotated: ObbCollider = { type: 'obb', x: 0, z: 0, halfWidth: 1, halfDepth: 0.2, rotationY: Math.PI / 2 }
    const result = resolvePosition(0.3, 0, 0.35, [rotated])
    expect(result.x).toBeCloseTo(0.55, 5)
    expect(result.z).toBeCloseTo(0, 5)
  })

  it('never produces NaN for a degenerate (center-on-center) case', () => {
    const result = resolvePosition(0, 0, 0.35, [wall])
    expect(Number.isNaN(result.x)).toBe(false)
    expect(Number.isNaN(result.z)).toBe(false)
  })
})

describe('point/collider geometry helpers', () => {
  const wall: ObbCollider = { type: 'obb', x: 0, z: 0, halfWidth: 1, halfDepth: 0.2, rotationY: 0 }
  const circle: Collider = { type: 'circle', x: 10, z: 0, radius: 2 }

  it('colliderContainsPoint agrees with the OBB half-extents', () => {
    expect(colliderContainsPoint(wall, 0, 0)).toBe(true)
    expect(colliderContainsPoint(wall, 0.9, 0.1)).toBe(true)
    expect(colliderContainsPoint(wall, 1.1, 0)).toBe(false)
    expect(colliderContainsPoint(wall, 0, 0.3)).toBe(false)
  })

  it('colliderSignedDistance is negative inside, zero on the boundary, positive outside', () => {
    expect(colliderSignedDistance(wall, 0, 0)).toBeLessThan(0)
    expect(colliderSignedDistance(wall, 1, 0)).toBeCloseTo(0, 5)
    expect(colliderSignedDistance(wall, 2, 0)).toBeCloseTo(1, 5)
  })

  it('closestBoundaryPoint snaps an exterior point onto the rectangle', () => {
    const p = closestBoundaryPoint(wall, 5, 0.1)
    expect(p.x).toBeCloseTo(1, 5)
    expect(p.z).toBeCloseTo(0.1, 5)
  })

  it('closestBoundaryPoint snaps an interior point to the nearest edge, not itself', () => {
    const p = closestBoundaryPoint(wall, 0, 0.05)
    expect(p.z).toBeCloseTo(0.2, 5)
  })

  it('colliderRimPoint reduces to the pre-OBB radius+margin formula for circles', () => {
    const rim = colliderRimPoint(circle, 15, 0, 0.2)
    expect(rim.x).toBeCloseTo(12.2, 5)
    expect(rim.z).toBeCloseTo(0, 5)
  })

  it('colliderRimPoint stays deterministic (no NaN) when the query point sits on the OBB center', () => {
    const rim = colliderRimPoint(wall, 0, 0, 0.2)
    expect(Number.isNaN(rim.x)).toBe(false)
    expect(Number.isNaN(rim.z)).toBe(false)
  })
})

describe('createColliderRegistry', () => {
  it('returns colliders from the 3x3 bucket neighborhood of a query point', () => {
    const registry = createColliderRegistry(10)
    registry.setColliders('chunk-a', [{ type: 'circle', x: 1, z: 1, radius: 0.5 }])
    registry.setColliders('chunk-b', [{ type: 'circle', x: 25, z: 25, radius: 0.5 }])

    const near = registry.query(0, 0)
    expect(near).toHaveLength(1)
    expect(near[0]).toEqual({ type: 'circle', x: 1, z: 1, radius: 0.5 })

    const far = registry.query(0, 0).some((c) => c.x === 25)
    expect(far).toBe(false)
  })

  it('replaces a previous set when called again with the same owner key', () => {
    const registry = createColliderRegistry(10)
    registry.setColliders('chunk-a', [{ type: 'circle', x: 1, z: 1, radius: 0.5 }])
    registry.setColliders('chunk-a', [{ type: 'circle', x: 2, z: 2, radius: 0.5 }])

    const near = registry.query(0, 0)
    expect(near).toHaveLength(1)
    expect(near[0]).toEqual({ type: 'circle', x: 2, z: 2, radius: 0.5 })
  })

  it('clearColliders removes everything registered under that owner key', () => {
    const registry = createColliderRegistry(10)
    registry.setColliders('chunk-a', [{ type: 'circle', x: 1, z: 1, radius: 0.5 }])
    registry.clearColliders('chunk-a')

    expect(registry.query(0, 0)).toHaveLength(0)
  })
})
