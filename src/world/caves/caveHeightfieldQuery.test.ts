/** world-terrain-019 — the production heightfield spatial queries: ground,
 *  strict occupancy, interior and horizontal containment. The floor the
 *  player is given must be the floor the mesh renders
 *  (`sampleHeightfieldAt(...).floorY`), every query must stay Y-aware (a
 *  surface entity above a tunnel is not in the cave), and containment must
 *  keep a walking capsule inside the cave without ever touching an outdoor
 *  entity. Pure: fixture topology, analytic surfaces, no Three.js. */

import { describe, expect, it } from 'vitest'
import type { CaveHeightfieldRepresentation } from './caveHeightfieldRepresentation'
import {
  buildCaveHeightfieldFixture,
  caveHeightfieldBaseSurfaceAt,
  caveHeightfieldWalkSurfaceAt,
} from '../../debug/caves/caveHeightfieldFixtures'
import { MOVE_SPEED, SPRINT_MULTIPLIER } from '../../player/PlayerController'
import { PLAYER_COLLISION_RADIUS, PLAYER_HEIGHT } from '../../player/playerDimensions'
import { applyCaveGroundHysteresis, CAVE_FLOOR_GRACE, CAVE_OCCUPANCY_EPS, CAVE_UNDERGROUND_MISS } from './caveGroundQuery'
import {
  heightfieldGroundColumn,
  heightfieldInteriorAt,
  heightfieldOccupancyAt,
  heightfieldStandingClearance,
  queryHeightfieldGround,
  queryHeightfieldSpace,
  resolveHeightfieldHorizontal,
} from './caveHeightfieldQuery'
import {
  buildCaveHeightfieldRepresentation,
  DEFAULT_HEIGHTFIELD_CONFIG,
  heightfieldNodeGap,
  heightfieldNodeOpenSky,
  heightfieldNodePosition,
  sampleHeightfieldAt,
} from './caveHeightfieldRepresentation'
import { SURFACE_CLIP_EPS } from './caveSurface'

const TEST_CONFIG = { ...DEFAULT_HEIGHTFIELD_CONFIG, cellSize: 0.5 }
const base = caveHeightfieldBaseSurfaceAt
const walk = caveHeightfieldWalkSurfaceAt

let cachedField: CaveHeightfieldRepresentation | null = null
function field(): CaveHeightfieldRepresentation {
  cachedField ??= buildCaveHeightfieldRepresentation(buildCaveHeightfieldFixture('basic'), walk, TEST_CONFIG).heightfield
  return cachedField
}

const topology = buildCaveHeightfieldFixture('basic')
const passage = topology.nodes.find((n) => n.id === 'passage')!
const chamber = topology.nodes.find((n) => n.kind === 'chamber')!

/** First grid node (scanning from the deep end) that is cave void under a
 *  closed rock ceiling — i.e. the hillside above it is real surface. */
function closedTunnelNode(): { x: number, z: number } {
  const f = field()
  for (let iz = 0; iz < f.nz; iz++) {
    for (let ix = 0; ix < f.nx; ix++) {
      const i = iz * f.nx + ix
      if (heightfieldNodeGap(f, i) <= 1 || heightfieldNodeOpenSky(f, i)) continue
      const { x, z } = heightfieldNodePosition(f, ix, iz)
      if (base(x, z) - f.ceilY[i]! > 1) return { x, z }
    }
  }
  throw new Error('fixture has no closed tunnel node')
}

function openSkyNode(): { x: number, z: number } {
  const f = field()
  for (let iz = 0; iz < f.nz; iz++) {
    for (let ix = 0; ix < f.nx; ix++) {
      const i = iz * f.nx + ix
      if (heightfieldNodeGap(f, i) > 1 && heightfieldNodeOpenSky(f, i)) return heightfieldNodePosition(f, ix, iz)
    }
  }
  throw new Error('fixture has no open-sky node')
}

describe('heightfieldGroundColumn', () => {
  it('inside the passage: floor is exactly the rendered heightfield floor, ceiling from the same sample', () => {
    const { x, z } = passage.position
    const sample = sampleHeightfieldAt(field(), x, z)
    expect(sample.gap).toBeGreaterThan(0)
    const column = heightfieldGroundColumn(field(), base, x, z)!
    expect(column).not.toBeNull()
    expect(column.floorY).toBe(sample.floorY)
    expect(column.ceilingY).toBe(Math.min(sample.ceilY, base(x, z) - SURFACE_CLIP_EPS))
    expect(column.openSky).toBeUndefined()
  })

  it('chamber: floor is the heightfield chamber floor', () => {
    const { x, z } = chamber.position
    const sample = sampleHeightfieldAt(field(), x, z)
    const column = heightfieldGroundColumn(field(), base, x, z)!
    expect(column.floorY).toBe(sample.floorY)
    expect(column.ceilingY - column.floorY).toBeGreaterThan(2)
  })

  it('openSky mirrors the heightfield sample at the mouth and is absent in the closed tunnel', () => {
    const mouth = openSkyNode()
    expect(sampleHeightfieldAt(field(), mouth.x, mouth.z).openSky).toBe(true)
    expect(heightfieldGroundColumn(field(), base, mouth.x, mouth.z)?.openSky).toBe(true)
    const tunnel = closedTunnelNode()
    expect(sampleHeightfieldAt(field(), tunnel.x, tunnel.z).openSky).toBe(false)
    expect(heightfieldGroundColumn(field(), base, tunnel.x, tunnel.z)?.openSky).toBeUndefined()
  })

  it('returns null outside the grid and in rock (gap <= 0)', () => {
    const f = field()
    expect(heightfieldGroundColumn(f, base, f.bounds.minX - 5, f.bounds.minZ - 5)).toBeNull()
    // A grid corner is rock: the field is padded beyond the cave.
    expect(sampleHeightfieldAt(f, f.originX, f.originZ).gap).toBeLessThanOrEqual(0)
    expect(heightfieldGroundColumn(f, base, f.originX, f.originZ)).toBeNull()
  })
})

describe('queryHeightfieldGround (Y-aware)', () => {
  it('player standing on the cave floor → hit with that floor', () => {
    const { x, z } = passage.position
    const floorY = sampleHeightfieldAt(field(), x, z).floorY
    const hit = queryHeightfieldGround(field(), base, x, floorY, z)!
    expect(hit).not.toBeNull()
    expect(hit.floorY).toBe(floorY)
    expect(hit.intervals).toHaveLength(1)
    expect(hit.intervals[0]!.floorY).toBe(floorY)
  })

  it('player slightly below the floor within CAVE_FLOOR_GRACE → still a hit; beyond it → null', () => {
    const { x, z } = passage.position
    const floorY = sampleHeightfieldAt(field(), x, z).floorY
    expect(queryHeightfieldGround(field(), base, x, floorY - CAVE_FLOOR_GRACE + 0.1, z)).not.toBeNull()
    expect(queryHeightfieldGround(field(), base, x, floorY - CAVE_FLOOR_GRACE - 0.1, z)).toBeNull()
  })

  it('surface player on the hillside above an underground tunnel → null', () => {
    const { x, z } = closedTunnelNode()
    const surfaceY = base(x, z)
    expect(sampleHeightfieldAt(field(), x, z).gap).toBeGreaterThan(0)
    expect(queryHeightfieldGround(field(), base, x, surfaceY, z)).toBeNull()
    expect(queryHeightfieldGround(field(), base, x, surfaceY + 1, z)).toBeNull()
  })

  it('player above a closed ceiling but below the surface → null', () => {
    const { x, z } = closedTunnelNode()
    const sample = sampleHeightfieldAt(field(), x, z)
    expect(queryHeightfieldGround(field(), base, x, sample.ceilY + 0.2, z)).toBeNull()
    expect(queryHeightfieldGround(field(), base, x, sample.ceilY - 0.2, z)).not.toBeNull()
  })

  it('mouth: player on the walk surface at the entrance is cave ground under open sky', () => {
    const { x, z } = topology.entrance
    const y = walk(x, z)
    const sample = sampleHeightfieldAt(field(), x, z)
    expect(sample.openSky).toBe(true)
    // The walkable recess meets the cave floor at the mouth.
    expect(Math.abs(y - sample.floorY)).toBeLessThan(0.5)
    const hit = queryHeightfieldGround(field(), base, x, y, z)!
    expect(hit).not.toBeNull()
    expect(hit.openSky).toBe(true)
    expect(hit.floorY).toBe(sample.floorY)
  })

  it('mouth rim: a surface player on the pit wall above the recess floor is not assigned the deep floor', () => {
    const { x, z } = openSkyNode()
    const y = base(x, z)
    const hit = queryHeightfieldGround(field(), base, x, y, z)
    // Above the surface clip → surface owns ground.
    expect(y).toBeGreaterThan(base(x, z) - SURFACE_CLIP_EPS)
    expect(hit).toBeNull()
  })
})

describe('heightfield ground + hysteresis', () => {
  it('a single underground miss keeps the last cave floor; a surface-level miss clears it', () => {
    const { x, z } = passage.position
    const floorY = sampleHeightfieldAt(field(), x, z).floorY
    const surfaceY = base(x, z)
    expect(surfaceY - floorY).toBeGreaterThan(CAVE_UNDERGROUND_MISS)
    const first = queryHeightfieldGround(field(), base, x, floorY, z)
    let state = applyCaveGroundHysteresis(first, floorY, surfaceY, null)
    expect(state.hit).not.toBeNull()
    // Miss underground (e.g. a probe through a rounded rim): keep the floor.
    state = applyCaveGroundHysteresis(null, floorY, surfaceY, state.remember)
    expect(state.hit?.floorY).toBe(floorY)
    // Miss at surface level: release.
    state = applyCaveGroundHysteresis(null, surfaceY, surfaceY, state.remember)
    expect(state.hit).toBeNull()
    expect(state.remember).toBeNull()
  })

  it('no snap from the cave onto the hillside above the tunnel', () => {
    const { x, z } = closedTunnelNode()
    const floorY = sampleHeightfieldAt(field(), x, z).floorY
    const surfaceY = base(x, z)
    const hit = queryHeightfieldGround(field(), base, x, floorY, z)
    const state = applyCaveGroundHysteresis(null, floorY, surfaceY, hit)
    expect(state.hit).not.toBeNull()
    expect(state.hit!.floorY).toBe(floorY)
    expect(state.hit!.floorY).toBeLessThan(surfaceY - CAVE_UNDERGROUND_MISS)
  })
})

describe('heightfieldOccupancyAt (strict, stateless)', () => {
  it('passage and chamber void hold a point between floor and ceiling; the interval is the ground column', () => {
    for (const node of [passage, chamber]) {
      const { x, z } = node.position
      const column = heightfieldGroundColumn(field(), base, x, z)!
      const mid = (column.floorY + column.ceilingY) / 2
      expect(heightfieldOccupancyAt(field(), base, x, mid, z)).toEqual(column)
      expect(heightfieldOccupancyAt(field(), base, x, column.floorY, z)).toEqual(column)
      expect(heightfieldOccupancyAt(field(), base, x, column.ceilingY, z)).toEqual(column)
    }
  })

  it('has no floor grace: a few cm of slack below the floor, rock beyond it', () => {
    const { x, z } = passage.position
    const column = heightfieldGroundColumn(field(), base, x, z)!
    expect(heightfieldOccupancyAt(field(), base, x, column.floorY - CAVE_OCCUPANCY_EPS + 0.01, z)).not.toBeNull()
    expect(heightfieldOccupancyAt(field(), base, x, column.floorY - CAVE_OCCUPANCY_EPS - 0.01, z)).toBeNull()
    expect(heightfieldOccupancyAt(field(), base, x, column.floorY - CAVE_FLOOR_GRACE + 0.1, z)).toBeNull()
  })

  it('rock beside the tunnel and outside the grid are never occupied', () => {
    const { z } = passage.position
    const floorY = heightfieldGroundColumn(field(), base, 0, z)!.floorY
    for (const y of [floorY, floorY + 1, base(12, z), base(12, z) - 3]) {
      expect(heightfieldOccupancyAt(field(), base, 12, y, z)).toBeNull()
      expect(heightfieldOccupancyAt(field(), base, 400, y, 400)).toBeNull()
    }
  })

  it('a surface entity above an underground tunnel, and a point above the closed ceiling, are not in the cave', () => {
    const { x, z } = closedTunnelNode()
    const column = heightfieldGroundColumn(field(), base, x, z)!
    expect(heightfieldOccupancyAt(field(), base, x, base(x, z), z)).toBeNull()
    expect(heightfieldOccupancyAt(field(), base, x, base(x, z) + 0.5, z)).toBeNull()
    expect(heightfieldOccupancyAt(field(), base, x, column.ceilingY + 0.2, z)).toBeNull()
    expect(heightfieldOccupancyAt(field(), base, x, column.ceilingY - 0.2, z)).not.toBeNull()
  })

  it('mouth: open-sky void is occupied and flagged openSky, up to the surface clip', () => {
    const { x, z } = openSkyNode()
    const column = heightfieldGroundColumn(field(), base, x, z)!
    expect(column.openSky).toBe(true)
    const occ = heightfieldOccupancyAt(field(), base, x, column.floorY + 0.5, z)
    expect(occ?.openSky).toBe(true)
    expect(occ!.ceilingY).toBeLessThan(base(x, z))
    expect(heightfieldOccupancyAt(field(), base, x, base(x, z), z)).toBeNull()
  })

  it('interior is occupancy inside the mouth plane only', () => {
    const { x, z } = passage.position
    const floorY = heightfieldGroundColumn(field(), base, x, z)!.floorY
    expect(heightfieldInteriorAt(field(), base, topology.entrance, x, floorY + 0.5, z)).toBe(true)
    // Approach recess: cave void under open sky, outward of the mouth plane.
    const approachZ = 2
    const approach = heightfieldGroundColumn(field(), base, 0, approachZ)
    if (approach) {
      expect(heightfieldOccupancyAt(field(), base, 0, approach.floorY + 0.2, approachZ)).not.toBeNull()
      expect(heightfieldInteriorAt(field(), base, topology.entrance, 0, approach.floorY + 0.2, approachZ)).toBe(false)
    }
    // Rock and the hillside above are never interior.
    expect(heightfieldInteriorAt(field(), base, topology.entrance, 12, floorY + 0.5, z)).toBe(false)
    expect(heightfieldInteriorAt(field(), base, topology.entrance, x, base(x, z), z)).toBe(false)
  })
})

describe('resolveHeightfieldHorizontal (containment)', () => {
  const RADIUS = PLAYER_COLLISION_RADIUS
  const MIN_GAP = heightfieldStandingClearance(PLAYER_HEIGHT)
  const WALK_STEP = MOVE_SPEED / 60
  const SPRINT_STEP = (MOVE_SPEED * SPRINT_MULTIPLIER) / 60

  /** The resolver stops at `deficit <= 1e-4`; allow that slack. */
  function standable(x: number, z: number): boolean {
    return !queryHeightfieldSpace(field(), x, z, MIN_GAP - 1e-3).blocked
  }

  /** Walks a capsule like `PlayerController.update()`: ground at the
   *  entity's own Y, then the move, then containment at that Y. Returns the
   *  trace; every frame must end in standable cave space, below the
   *  surface, and never in rock. */
  function walkCapsule(
    start: { x: number, z: number },
    dir: { x: number, z: number },
    step: number,
    frames: number,
  ): { x: number, y: number, z: number }[] {
    const len = Math.hypot(dir.x, dir.z)
    const dx = (dir.x / len) * step
    const dz = (dir.z / len) * step
    let x = start.x
    let z = start.z
    let y = heightfieldGroundColumn(field(), base, x, z)!.floorY
    const trace: { x: number, y: number, z: number }[] = []
    for (let i = 0; i < frames; i++) {
      const resolved = resolveHeightfieldHorizontal(field(), x + dx, z + dz, y, RADIUS, MIN_GAP)
      x = resolved.x
      z = resolved.z
      const hit = queryHeightfieldGround(field(), base, x, y, z)
      expect(hit, `frame ${i}: capsule left cave space at ${x.toFixed(2)}, ${z.toFixed(2)}`).not.toBeNull()
      y = hit!.floorY
      expect(standable(x, z), `frame ${i}: not standable at ${x.toFixed(2)}, ${z.toFixed(2)}`).toBe(true)
      expect(y).toBeLessThan(base(x, z) - 0.5)
      trace.push({ x, y, z })
    }
    return trace
  }

  /** Holding a direction into the wall for 4 s: every frame is standable
   *  cave space under the ceiling (asserted by `walkCapsule`), the capsule
   *  never reaches the rim (`gap = 0` contour) or leaves the grid, and — the
   *  accepted harness behaviour — it slides along the wall rather than
   *  sticking or tunnelling through it. */
  function assertContained(start: { x: number, z: number }, dir: { x: number, z: number }, step: number): void {
    const trace = walkCapsule(start, dir, step, 240)
    for (const p of trace) {
      const sample = sampleHeightfieldAt(field(), p.x, p.z)
      expect(sample.outsideGrid).toBe(false)
      expect(sample.gap).toBeGreaterThan(MIN_GAP - 1e-3)
    }
    // It reached the wall: the last frame's requested step is (mostly)
    // rejected, so the frame-to-frame advance along `dir` is well below a step.
    const len = Math.hypot(dir.x, dir.z)
    const a = trace[trace.length - 2]!
    const b = trace[trace.length - 1]!
    const advance = ((b.x - a.x) * dir.x + (b.z - a.z) * dir.z) / len
    expect(advance).toBeLessThan(step * 0.75)
  }

  it('passage rim: walking into the side wall stops at the rounded rim, never passes under the hillside', () => {
    assertContained({ x: 0, z: passage.position.z }, { x: 1, z: 0 }, WALK_STEP)
    assertContained({ x: 0, z: passage.position.z }, { x: -1, z: 0 }, WALK_STEP)
  })

  it('chamber rim: the wide chamber wall holds as well as the passage wall', () => {
    for (const dir of [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: -1 }, { x: 0.6, z: -1 }]) {
      assertContained({ x: 0, z: chamber.position.z }, dir, WALK_STEP)
    }
  })

  it('diagonal crossing into the wall slides along it instead of escaping', () => {
    const trace = walkCapsule({ x: 0, z: -6 }, { x: 1, z: -1 }, WALK_STEP, 240)
    const last = trace[trace.length - 1]!
    // Progressed along the tunnel (slid) while every frame stayed standable.
    expect(last.z).toBeLessThan(-9)
    expect(standable(last.x, last.z)).toBe(true)
  })

  it('sprint / large step: a sprint step and a 2x sprint step both stay contained', () => {
    assertContained({ x: 0, z: passage.position.z }, { x: 1, z: 0.3 }, SPRINT_STEP)
    assertContained({ x: 0, z: passage.position.z }, { x: -1, z: -0.2 }, SPRINT_STEP * 2)
    assertContained({ x: 0, z: chamber.position.z }, { x: 0.7, z: -1 }, SPRINT_STEP * 2)
  })

  it('low-clearance rounded fringe: a capsule that starts in the fringe is pushed to standable space, not through the wall', () => {
    const z = passage.position.z
    // Find a fringe column: void, but too low to stand in.
    let fringeX: number | null = null
    for (let x = 0; x < 4; x += 0.05) {
      const sample = sampleHeightfieldAt(field(), x, z)
      if (sample.gap > 0.6 && sample.gap < MIN_GAP - 0.2) {
        fringeX = x
        break
      }
    }
    expect(fringeX).not.toBeNull()
    const y = sampleHeightfieldAt(field(), fringeX!, z).floorY + 0.05
    const resolved = resolveHeightfieldHorizontal(field(), fringeX!, z, y, RADIUS, MIN_GAP)
    expect(standable(resolved.x, resolved.z)).toBe(true)
    expect(Math.abs(resolved.x)).toBeLessThan(fringeX!)
    expect(Math.abs(resolved.z - z)).toBeLessThan(1)
  })

  it('start slightly inside the blocked fringe (rock) resolves back into the tunnel', () => {
    const z = passage.position.z
    const resolved = resolveHeightfieldHorizontal(field(), 2.2, z, null, RADIUS, MIN_GAP)
    expect(standable(resolved.x, resolved.z)).toBe(true)
    expect(Math.abs(resolved.x)).toBeLessThan(2.2)
    // Deterministic.
    expect(resolveHeightfieldHorizontal(field(), 2.2, z, null, RADIUS, MIN_GAP)).toEqual(resolved)
  })

  it('mouth transition: walking in along the axis is never deflected — approach and portal are open sky', () => {
    let x = 0
    let y = walk(0, 6)
    for (let z = 6; z >= -8; z -= WALK_STEP) {
      const resolved = resolveHeightfieldHorizontal(field(), x, z, y, RADIUS, MIN_GAP)
      expect(resolved.x).toBeCloseTo(0, 6)
      expect(resolved.z).toBeCloseTo(z, 6)
      x = resolved.x
      const hit = queryHeightfieldGround(field(), base, x, y, z)
      y = hit ? hit.floorY : walk(x, z)
    }
    // Ended inside the tunnel on its floor, not on the hillside.
    expect(y).toBeLessThan(base(0, -8) - 0.5)
  })

  it('outdoor hillside above the cave: a surface entity is never pulled toward the mouth', () => {
    for (const [x, z] of [[0, passage.position.z], [4, -8], [-5, -14], [0, chamber.position.z], [0, 6], [30, 30]] as const) {
      const y = walk(x, z)
      const resolved = resolveHeightfieldHorizontal(field(), x, z, y, RADIUS, MIN_GAP)
      expect(resolved.x).toBe(x)
      expect(resolved.z).toBe(z)
      // Slightly above the surface too (a jump).
      const jumped = resolveHeightfieldHorizontal(field(), x, z, y + 0.4, RADIUS, MIN_GAP)
      expect(jumped.x).toBe(x)
      expect(jumped.z).toBe(z)
    }
  })

  it('never leaves the cave: exhaustive fixture sweep from every void column', () => {
    const f = field()
    let checked = 0
    for (let iz = 0; iz < f.nz; iz += 2) {
      for (let ix = 0; ix < f.nx; ix += 2) {
        const { x, z } = heightfieldNodePosition(f, ix, iz)
        const sample = sampleHeightfieldAt(f, x, z)
        if (sample.gap < 1 || sample.openSky) continue
        const resolved = resolveHeightfieldHorizontal(f, x, z, sample.floorY + 0.05, RADIUS, MIN_GAP)
        const after = sampleHeightfieldAt(f, resolved.x, resolved.z)
        expect(after.gap).toBeGreaterThanOrEqual(sample.gap - 1e-6)
        expect(after.gap).toBeGreaterThanOrEqual(MIN_GAP - 0.25)
        expect(Math.hypot(resolved.x - x, resolved.z - z)).toBeLessThan(3)
        checked++
      }
    }
    expect(checked).toBeGreaterThan(100)
  })
})
