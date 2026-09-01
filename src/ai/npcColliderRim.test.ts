import { describe, expect, it } from 'vitest'
import { type CircleCollider, colliderContainsPoint } from '../world/collision'
import {
  COLLIDER_RIM_MARGIN,
  destinationOnColliderRim,
  isExteriorPoint,
  localEscapeRadii,
  navigationApproachTarget,
  pickEmergencyTeleportPoint,
  rimPointFacing,
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
