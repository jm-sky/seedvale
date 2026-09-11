/** Representation-neutral cave ground contract (world-terrain-019) — the
 *  underground-miss hysteresis shared by the heightfield ground path and
 *  the transitional SDF harnesses. Pure. */

import { describe, expect, it } from 'vitest'
import { applyCaveGroundHysteresis, CAVE_UNDERGROUND_MISS } from './caveGroundQuery'

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

  it('a miss exactly at the underground threshold releases (strict >)', () => {
    const resolved = applyCaveGroundHysteresis(null, 2, 2 + CAVE_UNDERGROUND_MISS, caveHit)
    expect(resolved.hit).toBeNull()
  })
})
