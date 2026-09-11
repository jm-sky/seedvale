import { describe, expect, it } from 'vitest'
import { applySlopeMovementConstraint, SLOPE_SAMPLE_STEP } from '../terrain/slopeConstraint'
import { withCaveFloorFallback } from './cameraBoom'

/**
 * Regression for `LOOSE-ENDS.md` 2026-09-10: `PlayerController` fed the raw
 * surface `sampleHeight` to `applySlopeMovementConstraint`, so movement on a
 * gentle cave floor was constrained by the hillside above the cave. The fix
 * is `PlayerController.slopeHeightSampler()` — the same `withCaveFloorFallback`
 * wrapper the `?caveHeightfieldTest` walk harness uses — and this test pins
 * the composition it performs.
 */

/** Steep surface hillside: 60° (well past `SLOPE_MAX_WALKABLE_DEG`), rising
 *  with +x, 40 m above the tunnel. */
const STEEP_SURFACE = (x: number): number => 40 + x * Math.tan((60 * Math.PI) / 180)

/** Gentle cave floor: 5°, rising with +x. Only inside a 2.6 m-wide tunnel
 *  along the x axis — narrower than the 1.2 m slope probe reaches in z, so
 *  the z probes miss the cave footprint exactly like the real heightfield. */
const TUNNEL_HALF_WIDTH = 1.3
function caveFloorAt(x: number, z: number): number | null {
  if (Math.abs(z) > TUNNEL_HALF_WIDTH) return null
  return x * Math.tan((5 * Math.PI) / 180)
}

const PLAYER_CAVE_FLOOR_Y = caveFloorAt(0, 0) as number

describe('cave-aware slope sampling (world-terrain-019)', () => {
  it('surface sampler blocks uphill movement inside a cave (the bug)', () => {
    const wish = applySlopeMovementConstraint(1, 0, 0, 0, (x) => STEEP_SURFACE(x))
    // 60° surface above the tunnel removes the whole uphill component.
    expect(wish.x).toBeCloseTo(0, 6)
  })

  it('cave-aware sampler lets the same move through on a gentle cave floor', () => {
    const slopeHeight = withCaveFloorFallback(
      (x) => STEEP_SURFACE(x),
      caveFloorAt,
      PLAYER_CAVE_FLOOR_Y,
    )
    const wish = applySlopeMovementConstraint(1, 0, 0, 0, slopeHeight)
    // 5° floor is far below the falloff band — movement passes untouched.
    expect(wish.x).toBeCloseTo(1, 6)
    expect(wish.z).toBeCloseTo(0, 6)
  })

  it('probes that miss the narrow tunnel report the player floor, not the hillside', () => {
    const slopeHeight = withCaveFloorFallback(
      (x) => STEEP_SURFACE(x),
      caveFloorAt,
      PLAYER_CAVE_FLOOR_Y,
    )
    // The z probes reach outside the 2.6 m tunnel; without the fallback they
    // would read the hillside 40 m up and fake a cliff across the tunnel.
    expect(slopeHeight(0, SLOPE_SAMPLE_STEP)).toBe(PLAYER_CAVE_FLOOR_Y)
    expect(slopeHeight(0, -SLOPE_SAMPLE_STEP)).toBe(PLAYER_CAVE_FLOOR_Y)
  })

  it('still constrains a genuinely steep cave floor', () => {
    const steepFloor = (x: number, z: number): number | null =>
      Math.abs(z) > TUNNEL_HALF_WIDTH ? null : x * Math.tan((70 * Math.PI) / 180)
    const slopeHeight = withCaveFloorFallback((x) => STEEP_SURFACE(x), steepFloor, 0)
    const wish = applySlopeMovementConstraint(1, 0, 0, 0, slopeHeight)
    expect(wish.x).toBeCloseTo(0, 6)
  })

  it('is the identity outdoors (no cave occupancy under the player)', () => {
    const surface = (x: number): number => STEEP_SURFACE(x)
    const slopeHeight = withCaveFloorFallback(surface, caveFloorAt, null)
    expect(slopeHeight(3, 0)).toBe(surface(3))
    const wish = applySlopeMovementConstraint(1, 0, 0, 0, slopeHeight)
    expect(wish.x).toBeCloseTo(0, 6)
  })
})
