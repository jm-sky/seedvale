import { describe, expect, it } from 'vitest'
import { type CircleCollider, colliderContainsPoint, type ObbCollider } from '../world/collision'
import {
  bypassPointForSegment,
  COLLIDER_RIM_MARGIN,
  destinationOnColliderRim,
  isExteriorPoint,
  isPointWalkableForNpc,
  localEscapeRadii,
  navigationApproachTarget,
  pickEmergencyTeleportPoint,
  rimPointFacing,
  sampleNearbyExteriorPoint,
  sampleRandomExteriorPoint,
} from './npcColliderRim'

/**
 * Plan 108 — destinations on a foreign disk's rim, rescue probes that reject
 * interior points, emergency teleport that never picks house-center `home`.
 */
const house: CircleCollider = { type: 'circle', x: 0, z: 0, radius: 2 }
const well: CircleCollider = { type: 'circle', x: 10, z: 0, radius: 1 }

describe('destinationOnColliderRim', () => {
  it('leaves a destination that is already outside every disk unchanged', () => {
    const dest = { x: 8, z: 3 }
    expect(destinationOnColliderRim({ x: 5, z: 5 }, dest, [house, well])).toEqual(dest)
  })

  it('snaps a foreign-disk dest to the rim facing the NPC', () => {
    const pos = { x: 5, z: 0 }
    const rim = destinationOnColliderRim(pos, { x: 0, z: 0 }, [house])
    expect(Math.hypot(rim.x - house.x, rim.z - house.z)).toBeCloseTo(house.radius + COLLIDER_RIM_MARGIN)
    expect(rim.x).toBeGreaterThan(0)
    expect(rim.z).toBeCloseTo(0)
  })

  it('does not remap when the NPC is already inside the same disk (097 exit)', () => {
    const dest = { x: 0, z: 0 }
    expect(destinationOnColliderRim({ x: 0.4, z: 0.2 }, dest, [house])).toEqual(dest)
  })

  it('snaps dest in disk A when the NPC stands in a different disk B', () => {
    const pos = { x: 10, z: 0 }
    const rim = destinationOnColliderRim(pos, { x: 0, z: 0 }, [house, well])
    expect(Math.hypot(rim.x - house.x, rim.z - house.z)).toBeCloseTo(house.radius + COLLIDER_RIM_MARGIN)
    expect(rim.x).toBeGreaterThan(0)
  })

  it('falls back to +X when the NPC is on the collider center', () => {
    const rim = rimPointFacing(house, 0, 0)
    expect(rim).toEqual({ x: house.radius + COLLIDER_RIM_MARGIN, z: 0 })
  })
})

describe('rescue probe rejects interior points', () => {
  it('treats the house core as not exterior, including from an NPC already inside', () => {
    expect(isExteriorPoint(0, 0, [house])).toBe(false)
    expect(isExteriorPoint(1.5, 0, [house])).toBe(false)
  })

  it('accepts a point just outside the disk', () => {
    expect(isExteriorPoint(house.radius + COLLIDER_RIM_MARGIN, 0, [house])).toBe(true)
  })

  it('local-escape first ring from the house center is outside the footprint', () => {
    const radii = localEscapeRadii({ x: 0, z: 0 }, [house])
    expect(radii[0]).toBeGreaterThan(house.radius)
  })

  it('keeps the 1.5 / 3 rings when the NPC is already outside', () => {
    expect(localEscapeRadii({ x: 8, z: 0 }, [house])).toEqual([1.5, 3])
  })
})

describe('navigationApproachTarget (plan npc-007)', () => {
  // Mirrors the well serving stand: servingOffset (0.3) puts the real
  // destination inside NPC_COLLIDER_APPROACH_BUFFER (0.4) of the well's
  // collider — well within the coarse A* grid's own snapping error.
  const wellCollider: CircleCollider = { type: 'circle', x: 0, z: 0, radius: 0.85 }
  const servingDest = { x: 0, z: -(wellCollider.radius + 0.3) }
  const approachBuffer = 0.4
  const clearance = 1.5 * Math.SQRT2

  it('pulls a collider-adjacent destination back onto the rim by the requested clearance', () => {
    const goal = navigationApproachTarget(servingDest, [wellCollider], approachBuffer, clearance)
    expect(Math.hypot(goal.x - wellCollider.x, goal.z - wellCollider.z)).toBeCloseTo(wellCollider.radius + clearance)
    // Same side as the real destination (south), not an arbitrary direction.
    expect(goal.z).toBeLessThan(0)
    expect(goal.x).toBeCloseTo(0)
  })

  it('the pulled-back goal survives a worst-case 1.5m grid snap without landing back inside the collider', () => {
    const goal = navigationApproachTarget(servingDest, [wellCollider], approachBuffer, clearance)
    // Worst-case rounding error of a 1.5m grid vertex nearest an arbitrary
    // point, on each axis independently.
    for (const dx of [-0.75, 0.75]) {
      for (const dz of [-0.75, 0.75]) {
        expect(colliderContainsPoint(wellCollider, goal.x + dx, goal.z + dz)).toBe(false)
      }
    }
  })

  it('leaves an ordinary, not-collider-adjacent destination unchanged', () => {
    const dest = { x: 8, z: 3 }
    expect(navigationApproachTarget(dest, [wellCollider, house], approachBuffer, clearance)).toEqual(dest)
  })
})

describe('emergency teleport does not pick home center', () => {
  const home = { x: 0, z: 0 }
  const wellPos = { x: 10, z: 0 }
  const stockpile = { x: 8, z: 8 }
  const alwaysWalkable = () => true

  it('rejects house-center home and returns a well rim instead', () => {
    const pos = { x: 0.2, z: 0 }
    const picked = pickEmergencyTeleportPoint(
      pos,
      [home, wellPos, stockpile],
      [house, well],
      alwaysWalkable,
    )
    expect(picked).not.toBeNull()
    expect(Math.hypot(picked!.x, picked!.z)).toBeGreaterThan(house.radius)
    expect(Math.hypot(picked!.x - well.x, picked!.z - well.z)).toBeCloseTo(well.radius + COLLIDER_RIM_MARGIN)
  })

  it('returns null rather than home when no candidate is exterior-walkable', () => {
    const picked = pickEmergencyTeleportPoint(
      { x: 0, z: 0 },
      [home],
      [house],
      alwaysWalkable,
    )
    expect(picked).toBeNull()
  })
})

/** Review 2026-09-03 §5 E7 / §8 step 8 — `isWalkable`'s penetration rule
 *  extracted as pure geometry (water-level check stays with the caller). */
describe('isPointWalkableForNpc', () => {
  const approachBuffer = 0.4
  const coreFraction = 0.55

  it('is walkable outside every collider', () => {
    expect(isPointWalkableForNpc(8, 8, [house], 5, 5, null, approachBuffer, coreFraction)).toBe(true)
  })

  it('blocks entering a foreign collider with no nearby destination', () => {
    expect(isPointWalkableForNpc(0, 0, [house], 5, 5, null, approachBuffer, coreFraction)).toBe(false)
  })

  it('lets the agent leave a collider it already stands in', () => {
    expect(isPointWalkableForNpc(0.5, 0, [house], 0, 0, null, approachBuffer, coreFraction)).toBe(true)
  })

  it('allows a shallow graze toward a destination near the collider, blocks past the core fraction', () => {
    const destination = { x: house.radius + 0.1, z: 0 }
    // Just past the rim — within the shallow allowance.
    expect(isPointWalkableForNpc(house.radius - 0.05, 0, [house], 5, 5, destination, approachBuffer, coreFraction))
      .toBe(true)
    // Deep in the core — beyond `coreFraction` even with a nearby destination.
    expect(isPointWalkableForNpc(0, 0, [house], 5, 5, destination, approachBuffer, coreFraction)).toBe(false)
  })

  it('an OBB collider has no soft approach zone — any penetration blocks', () => {
    const wall: ObbCollider = { type: 'obb', x: 0, z: 0, halfWidth: 2, halfDepth: 0.3, rotationY: 0 }
    const destination = { x: 0, z: 0.35 }
    expect(isPointWalkableForNpc(0, 0.1, [wall], 5, 5, destination, approachBuffer, coreFraction)).toBe(false)
  })
})

describe('bypassPointForSegment', () => {
  it('returns null when the straight segment does not cross any collider', () => {
    expect(bypassPointForSegment(5, 5, { x: 8, z: 8 }, [house], 0.4)).toBeNull()
  })

  it('returns a rim point when the segment cuts through a collider disk', () => {
    const bypass = bypassPointForSegment(-5, 0, { x: 5, z: 0 }, [house], 0.4)
    expect(bypass).not.toBeNull()
    expect(colliderContainsPoint(house, bypass!.x, bypass!.z)).toBe(false)
  })

  it('skips a collider the agent already stands in', () => {
    expect(bypassPointForSegment(0.5, 0, { x: 5, z: 0 }, [house], 0.4)).toBeNull()
  })

  it('skips a collider the destination is already allowed to approach', () => {
    const destination = { x: house.radius + 0.1, z: 0 }
    expect(bypassPointForSegment(-5, 0, destination, [house], 0.4)).toBeNull()
  })
})

describe('sampleNearbyExteriorPoint (deterministic ring)', () => {
  it('rejects interior points and returns the first exterior ring point', () => {
    const isExterior = (x: number, z: number) => isExteriorPoint(x, z, [house])
    const found = sampleNearbyExteriorPoint(0, 0, [house.radius + 1], 8, isExterior)
    expect(found).not.toBeNull()
    expect(isExteriorPoint(found!.x, found!.z, [house])).toBe(true)
  })

  it('is deterministic — the same inputs always produce the same point', () => {
    const isExterior = (x: number, z: number) => isExteriorPoint(x, z, [house])
    const a = sampleNearbyExteriorPoint(0, 0, [house.radius + 1, house.radius + 2], 8, isExterior)
    const b = sampleNearbyExteriorPoint(0, 0, [house.radius + 1, house.radius + 2], 8, isExterior)
    expect(a).toEqual(b)
  })

  it('returns null when no radius yields an exterior point', () => {
    const neverExterior = () => false
    expect(sampleNearbyExteriorPoint(0, 0, [1, 2], 8, neverExterior)).toBeNull()
  })

  it('tries radii in order, returning the first ring with a hit', () => {
    // Only the second radius (a much bigger ring, clear of the house) has
    // any exterior point.
    const isExterior = (x: number, z: number) => Math.hypot(x, z) > 5
    const found = sampleNearbyExteriorPoint(0, 0, [1, 6], 4, isExterior)
    expect(found).not.toBeNull()
    expect(Math.hypot(found!.x, found!.z)).toBeCloseTo(6)
  })
})

describe('sampleRandomExteriorPoint (random annulus)', () => {
  it('rejects interior points and returns an exterior point within the annulus', () => {
    const isExterior = (x: number, z: number) => isExteriorPoint(x, z, [house])
    const found = sampleRandomExteriorPoint(0, 0, house.radius, 3, 6, isExterior, Math.random)
    expect(found).not.toBeNull()
    const dist = Math.hypot(found!.x, found!.z)
    expect(dist).toBeGreaterThanOrEqual(house.radius)
    expect(dist).toBeLessThanOrEqual(house.radius + 3 + 1e-9)
  })

  it('is deterministic given an injected deterministic "random" source', () => {
    let calls = 0
    const seq = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8]
    const fakeRandom = () => seq[calls++ % seq.length]!
    const isExterior = (x: number, z: number) => isExteriorPoint(x, z, [house])
    const a = sampleRandomExteriorPoint(0, 0, house.radius, 3, 6, isExterior, fakeRandom)
    calls = 0
    const b = sampleRandomExteriorPoint(0, 0, house.radius, 3, 6, isExterior, fakeRandom)
    expect(a).toEqual(b)
  })

  it('returns null when every attempt lands on an interior point', () => {
    const neverExterior = () => false
    expect(sampleRandomExteriorPoint(0, 0, 1, 1, 4, neverExterior, () => 0.5)).toBeNull()
  })
})
