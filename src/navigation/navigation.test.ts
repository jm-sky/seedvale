import { describe, expect, it } from 'vitest'
import { navigationApproachTarget } from '../ai/npcColliderRim'
import { type CircleCollider, colliderContainsPoint } from '../world/collision'
import { DEFAULT_CELL_SIZE, findPath, type NavigationQuery, type PathPoint } from './navigation'

function openQuery(): NavigationQuery {
  return { isWalkable: () => true, sampleHeight: () => 0 }
}

/** Blocks every point inside an axis-aligned rectangle `[x0,x1] x [z0,z1]`. */
function queryWithRect(x0: number, x1: number, z0: number, z1: number): NavigationQuery {
  return {
    isWalkable: (x, z) => !(x >= x0 && x <= x1 && z >= z0 && z <= z1),
    sampleHeight: () => 0,
  }
}

function segmentBlockedByRect(a: PathPoint, b: PathPoint, x0: number, x1: number, z0: number, z1: number): boolean {
  const steps = 40
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const x = a.x + (b.x - a.x) * t
    const z = a.z + (b.z - a.z) * t
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return true
  }
  return false
}

describe('findPath', () => {
  it('returns a direct single-waypoint route when the line is clear', () => {
    const result = findPath(openQuery(), {}, { x: 0, z: 0 }, { x: 10, z: 0 })
    expect(result).not.toBeNull()
    expect(result!.waypoints).toEqual([{ x: 10, z: 0 }])
    expect(result!.visitedNodes).toBe(0)
  })

  it('routes around a rectangular obstacle blocking the direct line', () => {
    // A short wall straddling the direct line — any straight shot from
    // (0,0) to (20,0) crosses it, forcing a detour around either end.
    const query = queryWithRect(8, 12, -3, 3)
    const start = { x: 0, z: 0 }
    const goal = { x: 20, z: 0 }
    const result = findPath(query, {}, start, goal, { boundsPadding: 10 })
    expect(result).not.toBeNull()
    expect(result!.waypoints.length).toBeGreaterThan(1)

    const full = [start, ...result!.waypoints]
    for (let i = 0; i < full.length - 1; i++) {
      expect(segmentBlockedByRect(full[i]!, full[i + 1]!, 8, 12, -3, 3)).toBe(false)
    }
    // The route lands on the nearest walkable grid cell to `goal`, not
    // necessarily the exact point — existing steering closes the last gap.
    const last = full[full.length - 1]!
    expect(Math.hypot(last.x - goal.x, last.z - goal.z)).toBeLessThan(1.5)
  })

  it('returns null when the goal is fully enclosed', () => {
    // A closed ring around (20, 0) with no gap — width (3.5) exceeds the
    // longest single grid hop (cellSize * sqrt2 ≈ 2.12), so no sequence of
    // adjacent-cell steps can cross from outside to the interior "hole"
    // without one of them landing inside the blocked band.
    const query: NavigationQuery = {
      isWalkable: (x, z) => {
        const dist = Math.hypot(x - 20, z)
        return dist > 5.5 || dist < 2.0
      },
      sampleHeight: () => 0,
    }
    const result = findPath(query, {}, { x: 0, z: 0 }, { x: 20, z: 0 }, { boundsPadding: 8 })
    expect(result).toBeNull()
  })

  it('respects a stricter maxSlopeDeg profile than the default', () => {
    // A 45° ramp (linear, flat plateaus on either side) forms a wall across
    // every z — steep enough to block a strict profile outright but well
    // under a near-vertical `maxSlopeDeg` ceiling.
    const sampleHeight = (x: number): number => {
      if (x < 6) return 0
      if (x > 14) return 8
      return (x - 6)
    }
    const query: NavigationQuery = { isWalkable: () => true, sampleHeight }

    const strict = findPath(query, { maxSlopeDeg: 20 }, { x: 0, z: 0 }, { x: 20, z: 0 }, { boundsPadding: 10 })
    expect(strict).toBeNull()

    const lenient = findPath(query, { maxSlopeDeg: 89 }, { x: 0, z: 0 }, { x: 20, z: 0 }, { boundsPadding: 10 })
    expect(lenient).not.toBeNull()
  })

  it('treats a water region as unwalkable, same as any other obstacle', () => {
    const query = queryWithRect(8, 12, -3, 3)
    const result = findPath(query, {}, { x: 0, z: 0 }, { x: 20, z: 0 }, { boundsPadding: 10 })
    expect(result).not.toBeNull()
    const full = [{ x: 0, z: 0 }, ...result!.waypoints]
    for (const p of full) expect(query.isWalkable(p.x, p.z)).toBe(true)
  })

  it('simplifies consecutive collinear-reachable cells into a single leg', () => {
    const query = queryWithRect(8, 12, -3, 3)
    const result = findPath(query, {}, { x: 0, z: 0 }, { x: 20, z: 0 }, { boundsPadding: 10 })
    expect(result).not.toBeNull()
    // A raw cell-by-cell A* path over this bounded grid visits well over a
    // dozen cells; the simplified route should collapse to only the
    // waypoints actually required to clear the obstacle.
    expect(result!.waypoints.length).toBeLessThan(6)
  })

  it('fails explicitly once the node budget is exhausted', () => {
    const query = queryWithRect(8, 12, -3, 3)
    const result = findPath(query, {}, { x: 0, z: 0 }, { x: 20, z: 0 }, { boundsPadding: 10, maxNodes: 3 })
    expect(result).toBeNull()
  })

  // Plan npc-007 regression: an interaction destination close enough to a
  // collider for locomotion's own destination-aware approach exception
  // (well serving stand, a workplace) must not be routed to directly —
  // `NpcAgent.attemptNavRepath` instead aims here at `navigationApproachTarget`'s
  // pulled-back goal (see `npcColliderRim.test.ts` for that function's own
  // coverage), the same integration the production repath now performs.
  it('routes around a collider-adjacent interaction destination via its approach target, never crossing the collider', () => {
    // Off-grid center so this doesn't coincidentally align with the 1.5m
    // grid — the exact failure mode this plan fixed.
    const well: CircleCollider = { type: 'circle', x: 5.37, z: -2.14, radius: 0.85 }
    const servingDest = { x: well.x, z: well.z - (well.radius + 0.3) } // south rim + serving offset
    const start = { x: well.x, z: well.z + 6 } // opposite side — direct line to servingDest crosses the well
    const exteriorOnly: NavigationQuery = {
      isWalkable: (x, z) => !colliderContainsPoint(well, x, z),
      sampleHeight: () => 0,
    }
    const goal = navigationApproachTarget(servingDest, [well], 0.4, DEFAULT_CELL_SIZE * Math.SQRT2)

    const result = findPath(exteriorOnly, {}, start, goal, { boundsPadding: 10 })
    expect(result).not.toBeNull()
    for (const p of [start, ...result!.waypoints]) {
      expect(colliderContainsPoint(well, p.x, p.z)).toBe(false)
    }
    // Landed on the same (south) side as the real destination, not routed
    // to an arbitrary far/wrong-side walkable cell.
    const last = result!.waypoints[result!.waypoints.length - 1]!
    expect(last.z).toBeLessThan(well.z)
  })
})
