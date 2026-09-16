import { describe, expect, it } from 'vitest'
import { findPath } from '../navigation/navigation'
import {
  completeActionLifecycle,
  createActionLifecycle,
  failActionLifecycle,
  startActionLifecycle,
} from '../simulation/actionLifecycle'
import { applySlopeMovementConstraint, stepWithSlopeAndCollision } from '../terrain/slopeConstraint'
import { type CircleCollider } from '../world/collision'
import {
  destinationOnColliderRim,
  isExteriorPoint,
  isPointWalkableForNpc,
  navigationApproachTarget,
  sampleNearbyExteriorPoint,
} from './npcColliderRim'

/**
 * Surface NPC movement regression (plan npc-027 stage 4). These are the
 * existing helpers `NpcAgent.steerTo` / watchdog still use on the surface.
 */

const WATER_MARGIN = 0.3
const APPROACH_BUFFER = 0.4
const CORE_FRACTION = 0.55
const house: CircleCollider = { type: 'circle', x: 0, z: 0, radius: 2 }

describe('surface movement regression (plan npc-027 stage 4)', () => {
  it('ordinary straight steering on flat walkable ground takes the full step', () => {
    const result = stepWithSlopeAndCollision({
      x: 0,
      z: 0,
      dirX: 1,
      dirZ: 0,
      speed: 2,
      dt: 0.5,
      sampleHeight: () => 4,
      isWalkable: () => true,
    })
    expect(result).toEqual({ x: 1, z: 0, moved: true })
  })

  it('water avoidance rejects a candidate at or below water + margin', () => {
    const waterLevel = 0
    const isWalkableSurface = (height: number) => height > waterLevel + WATER_MARGIN
    expect(isWalkableSurface(2)).toBe(true)
    expect(isWalkableSurface(0)).toBe(false)
    expect(isWalkableSurface(-11)).toBe(false)
  })

  it('slope limits still remove uphill travel on too-steep terrain', () => {
    const steep = (x: number) => -x * Math.tan((60 * Math.PI) / 180)
    const uphill = applySlopeMovementConstraint(-4, 0, 0, 0, steep)
    expect(uphill.x).toBeCloseTo(0)
    expect(uphill.z).toBeCloseTo(0)
    const downhill = applySlopeMovementConstraint(4, 0, 0, 0, steep)
    expect(downhill.x).toBeCloseTo(4)
  })

  it('NPC separation / exterior probes refuse a collider core', () => {
    expect(isPointWalkableForNpc(0, 0, [house], 8, 0, null, APPROACH_BUFFER, CORE_FRACTION)).toBe(false)
    expect(isPointWalkableForNpc(8, 0, [house], 8, 0, null, APPROACH_BUFFER, CORE_FRACTION)).toBe(true)
    const escaped = sampleNearbyExteriorPoint(0, 0, [2.2, 3.5], 8, (x, z) => isExteriorPoint(x, z, [house]))
    expect(escaped).not.toBeNull()
    expect(Math.hypot(escaped!.x, escaped!.z)).toBeGreaterThan(house.radius)
  })

  it('collider avoidance snaps an interior destination to the rim', () => {
    const rim = destinationOnColliderRim({ x: 6, z: 0 }, { x: 0, z: 0 }, [house])
    expect(Math.hypot(rim.x, rim.z)).toBeGreaterThan(house.radius)
  })

  it('bounded A* still routes around a blocking rectangle', () => {
    const query = {
      isWalkable: (x: number, z: number) => !(x >= 8 && x <= 12 && z >= -3 && z <= 3),
      sampleHeight: () => 0,
    }
    const result = findPath(query, {}, { x: 0, z: 0 }, { x: 20, z: 0 }, { boundsPadding: 10 })
    expect(result).not.toBeNull()
    expect(result!.waypoints.length).toBeGreaterThan(1)
    for (const point of result!.waypoints) {
      expect(query.isWalkable(point.x, point.z)).toBe(true)
    }
  })

  it('interaction final approach targets the collider rim, not the core', () => {
    const dest = { x: 0, z: 0 }
    const approach = navigationApproachTarget(dest, [house], APPROACH_BUFFER, 0.15)
    expect(Math.hypot(approach.x, approach.z)).toBeGreaterThan(house.radius)
    expect(isPointWalkableForNpc(
      house.radius - 0.05,
      0,
      [house],
      5,
      0,
      dest,
      APPROACH_BUFFER,
      CORE_FRACTION,
    )).toBe(true)
  })

  it('action completion still uses the shared lifecycle, not a cave shortcut', () => {
    const life = createActionLifecycle()
    expect(startActionLifecycle(life)).toBe(true)
    expect(completeActionLifecycle(life)).toBe(true)
    expect(life.status).toBe('complete')
    const failed = createActionLifecycle()
    startActionLifecycle(failed)
    expect(failActionLifecycle(failed)).toBe(true)
    expect(failed.status).toBe('failed')
  })
})
