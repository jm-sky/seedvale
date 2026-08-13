import { describe, expect, it } from 'vitest'
import { type Collider, createColliderRegistry, resolvePosition } from './collision'

describe('resolvePosition', () => {
  it('leaves the point untouched when nothing overlaps', () => {
    const colliders: Collider[] = [{ x: 10, z: 10, radius: 1 }]
    expect(resolvePosition(0, 0, 0.4, colliders)).toEqual({ x: 0, z: 0 })
  })

  it('pushes the point outside a single overlapping collider along the center vector', () => {
    const colliders: Collider[] = [{ x: 0, z: 0, radius: 1 }]
    const result = resolvePosition(0.5, 0, 0.4, colliders)
    expect(result.x).toBeCloseTo(1.4, 5)
    expect(result.z).toBeCloseTo(0, 5)
  })

  it('resolves against the deepest penetration when multiple colliders overlap', () => {
    const colliders: Collider[] = [
      { x: 0, z: 0, radius: 1 }, // penetration 0.9
      { x: 0.2, z: 0, radius: 2 }, // penetration 2.2 - deeper
    ]
    const result = resolvePosition(0, 0, 0.4, colliders)
    // pushed away from (0.2, 0) by radius+entityRadius = 2.4
    expect(result.x).toBeCloseTo(0.2 - 2.4, 5)
    expect(result.z).toBeCloseTo(0, 5)
  })

  it('picks an arbitrary direction when the entity sits exactly on a collider center', () => {
    const colliders: Collider[] = [{ x: 5, z: 5, radius: 1 }]
    const result = resolvePosition(5, 5, 0.4, colliders)
    expect(Math.hypot(result.x - 5, result.z - 5)).toBeCloseTo(1.4, 5)
  })
})

describe('createColliderRegistry', () => {
  it('returns colliders from the 3x3 bucket neighborhood of a query point', () => {
    const registry = createColliderRegistry(10)
    registry.setColliders('chunk-a', [{ x: 1, z: 1, radius: 0.5 }])
    registry.setColliders('chunk-b', [{ x: 25, z: 25, radius: 0.5 }])

    const near = registry.query(0, 0)
    expect(near).toHaveLength(1)
    expect(near[0]).toEqual({ x: 1, z: 1, radius: 0.5 })

    const far = registry.query(0, 0).some((c) => c.x === 25)
    expect(far).toBe(false)
  })

  it('replaces a previous set when called again with the same owner key', () => {
    const registry = createColliderRegistry(10)
    registry.setColliders('chunk-a', [{ x: 1, z: 1, radius: 0.5 }])
    registry.setColliders('chunk-a', [{ x: 2, z: 2, radius: 0.5 }])

    const near = registry.query(0, 0)
    expect(near).toHaveLength(1)
    expect(near[0]).toEqual({ x: 2, z: 2, radius: 0.5 })
  })

  it('clearColliders removes everything registered under that owner key', () => {
    const registry = createColliderRegistry(10)
    registry.setColliders('chunk-a', [{ x: 1, z: 1, radius: 0.5 }])
    registry.clearColliders('chunk-a')

    expect(registry.query(0, 0)).toHaveLength(0)
  })
})
