import { describe, expect, it } from 'vitest'
import type { CircleCollider, ObbCollider } from '../world/collision'
import { inflateCollider } from './colliderPreview'

describe('inflateCollider', () => {
  it('inflates a circle collider without mutating the source', () => {
    const collider: CircleCollider = { type: 'circle', x: 0, z: 0, radius: 1 }

    const result = inflateCollider(collider, 0.25)

    expect(result).toEqual({ type: 'circle', x: 0, z: 0, radius: 1.25 })
    expect(collider.radius).toBe(1)
  })

  it('inflates an OBB collider without mutating the source', () => {
    const collider: ObbCollider = {
      type: 'obb',
      x: 1,
      z: 2,
      halfWidth: 0.5,
      halfDepth: 0.3,
      rotationY: Math.PI / 4,
    }

    const result = inflateCollider(collider, 0.1)

    expect(result).toEqual({
      type: 'obb',
      x: 1,
      z: 2,
      halfWidth: 0.6,
      halfDepth: 0.4,
      rotationY: Math.PI / 4,
    })
    expect(collider.halfWidth).toBe(0.5)
    expect(collider.halfDepth).toBe(0.3)
  })

  it('leaves the dimensions unchanged for zero padding', () => {
    const circle: CircleCollider = { type: 'circle', x: 0, z: 0, radius: 1 }
    const obb: ObbCollider = { type: 'obb', x: 0, z: 0, halfWidth: 1, halfDepth: 2, rotationY: 0 }

    expect(inflateCollider(circle, 0).radius).toBe(1)
    expect(inflateCollider(obb, 0).halfWidth).toBe(1)
    expect(inflateCollider(obb, 0).halfDepth).toBe(2)
  })
})
