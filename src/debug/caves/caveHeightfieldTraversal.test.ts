import { describe, expect, it } from 'vitest'
import { resolveCameraBoom } from '../../player/cameraBoom'
import {
  MOVE_SPEED,
  PLAYER_COLLISION_RADIUS,
  PLAYER_HEIGHT,
  rockCeilingMaxY,
  SPRINT_MULTIPLIER,
} from '../../player/PlayerController'
import { buildCaveSdfColliders, caveMouthColliderFilter } from '../../world/caves/caveSdfColliders'
import { buildCaveSdfRepresentation } from '../../world/caves/caveSdfField'
import { buildCaveSdfColumnIndex } from '../../world/caves/caveSdfQuery'
import { CAVE_APPROACH_OFFSET, CAVE_APPROACH_RADIUS } from '../../world/caves/mouthCarve'
import { DEFAULT_SDF_PARAMS } from '../../world/caves/sdfCaveMesh'
import {
  buildCaveHeightfieldFixture,
  caveHeightfieldBaseSurfaceAt,
  caveHeightfieldWalkSurfaceAt,
} from './caveHeightfieldFixtures'
import {
  buildCaveHeightfield,
  DEFAULT_HEIGHTFIELD_CONFIG,
  sampleHeightfieldAt,
} from './caveHeightfieldRepresentation'
import {
  HEIGHTFIELD_MIN_STANDING_GAP,
  HEIGHTFIELD_PLAYER_HEIGHT,
  HEIGHTFIELD_PLAYER_RADIUS,
  heightfieldCapsuleHitsCeiling,
  heightfieldColumnIntervals,
  heightfieldOccupancyAt,
  heightfieldRockCeilingMaxY,
  integrateDebugVertical,
  queryHeightfieldColumn,
  queryHeightfieldSpace,
  resolveHeightfieldHorizontal,
} from './caveHeightfieldTraversal'
import {
  type CaveWalkWorld,
  createHeightfieldWalkWorld,
  createSdfWalkWorld,
} from './caveHeightfieldWalkWorld'

const TEST_CONFIG = { ...DEFAULT_HEIGHTFIELD_CONFIG, cellSize: 0.5 }
const base = caveHeightfieldBaseSurfaceAt
const walk = caveHeightfieldWalkSurfaceAt

function heightfieldWorld(fixture: 'basic' | 'bend' | 'branch' = 'basic'): CaveWalkWorld {
  const topology = buildCaveHeightfieldFixture(fixture)
  const field = buildCaveHeightfield(topology, walk, TEST_CONFIG).heightfield
  return createHeightfieldWalkWorld(field, base, walk)
}

function sdfWorld(fixture: 'basic' | 'bend' | 'branch' = 'basic'): CaveWalkWorld {
  const topology = buildCaveHeightfieldFixture(fixture)
  const field = buildCaveSdfRepresentation(topology, DEFAULT_SDF_PARAMS)
  const index = buildCaveSdfColumnIndex(field, topology, base)
  const colliders = buildCaveSdfColliders(index, base, field, caveMouthColliderFilter(topology))
  return createSdfWalkWorld(index, colliders, walk)
}

/** Drives the shared ground resolver + production vertical motion along a
 *  scripted XZ path, exactly as Walk mode does. */
function walkPath(
  world: CaveWalkWorld,
  path: readonly { x: number, z: number }[],
  startY: number,
): { x: number, y: number, z: number, groundY: number, ceiling: number | null, inCave: boolean }[] {
  let state = { y: startY, verticalVelocity: 0, grounded: true }
  const trace: { x: number, y: number, z: number, groundY: number, ceiling: number | null, inCave: boolean }[] = []
  for (const point of path) {
    const ground = world.resolveGround(point.x, state.y, point.z)
    state = integrateDebugVertical(ground, state, 1 / 60, false)
    trace.push({
      x: point.x,
      y: state.y,
      z: point.z,
      groundY: ground.height,
      ceiling: ground.ceiling,
      inCave: ground.caveFloorY !== null,
    })
  }
  return trace
}

/** A Y inside the cave void at `z` on the tunnel axis, derived from the
 *  representation rather than guessed from the surface. */
function interiorProbeY(z: number): number {
  const field = buildCaveHeightfield(buildCaveHeightfieldFixture('basic'), walk, TEST_CONFIG).heightfield
  const interval = heightfieldColumnIntervals(field, base, 0, z)[0]
  if (!interval) throw new Error(`no cave void at z=${z}`)
  return interval.floorY + 0.3
}

/** Entrance (+Z) → chamber (−Z) → back out, at a walkable step. */
function throughPath(): { x: number, z: number }[] {
  const points: { x: number, z: number }[] = []
  for (let z = 7; z >= -18; z -= 0.25) points.push({ x: 0, z })
  for (let z = -18; z <= 7; z += 0.25) points.push({ x: 0, z })
  return points
}

describe('cave heightfield traversal (plan world-terrain-018)', () => {
  it('keeps debug player constants aligned with production', () => {
    expect(HEIGHTFIELD_PLAYER_RADIUS).toBe(PLAYER_COLLISION_RADIUS)
    expect(HEIGHTFIELD_PLAYER_HEIGHT).toBe(PLAYER_HEIGHT)
    expect(MOVE_SPEED).toBe(8)
    expect(SPRINT_MULTIPLIER).toBe(1.8)
    expect(heightfieldRockCeilingMaxY(24, 20)).toBe(rockCeilingMaxY(24, 20))
    expect(heightfieldRockCeilingMaxY(null, 20)).toBe(rockCeilingMaxY(null, 20))
    // Ceiling below the walkable floor is not a clamp, in both.
    expect(heightfieldRockCeilingMaxY(20.5, 20)).toBe(rockCeilingMaxY(20.5, 20))
  })

  it('returns valid floor/ceiling inside and blocked beyond the standable region', () => {
    const topology = buildCaveHeightfieldFixture('basic')
    const field = buildCaveHeightfield(topology, walk, TEST_CONFIG).heightfield
    const inside = queryHeightfieldSpace(field, 0, -8)
    expect(inside.gap).toBeGreaterThan(0)
    expect(inside.blocked).toBe(false)
    expect(inside.ceilY - inside.floorY).toBeGreaterThanOrEqual(topology.minClearance - 1e-4)

    // Solid rock beside the tunnel.
    expect(queryHeightfieldSpace(field, 12, -8).blocked).toBe(true)
    // The mouth aperture is open sky, so it is never blocked.
    expect(queryHeightfieldSpace(field, 0, -0.2).blocked).toBe(false)
    // Well outside the cave the column is closed too — outdoor ownership is
    // decided by the y-aware walk world, not by this XZ-only cave query.
    expect(queryHeightfieldSpace(field, 0, 6).blocked).toBe(true)
  })

  it('clips heightfield columns to the analytic surface, like the SDF column index', () => {
    const topology = buildCaveHeightfieldFixture('basic')
    const field = buildCaveHeightfield(topology, walk, TEST_CONFIG).heightfield
    for (let z = 1; z >= -18; z -= 0.5) {
      for (const interval of heightfieldColumnIntervals(field, base, 0, z)) {
        expect(interval.ceilingY).toBeLessThan(base(0, z))
        expect(interval.ceilingY).toBeGreaterThan(interval.floorY)
      }
    }
    // Solid rock beside the tunnel carries no walkable interval at all.
    expect(heightfieldColumnIntervals(field, base, 9, -8)).toHaveLength(0)
  })

  describe.each([
    ['heightfield', heightfieldWorld],
    ['sdf', sdfWorld],
  ] as const)('%s variant', (_name, makeWorld) => {
    it('resolves the outdoor surface before the entrance', () => {
      const world = makeWorld()
      const ground = world.resolveGround(0, walk(0, 7), 7)
      expect(ground.caveFloorY).toBeNull()
      expect(ground.ceiling).toBeNull()
      expect(ground.height).toBeCloseTo(walk(0, 7), 6)
    })

    it('resolves the cave floor — not the hillside above — when stably inside', () => {
      const world = makeWorld()
      const trace = walkPath(world, throughPath(), walk(0, 7))
      const deep = trace.filter((s) => s.z <= -12 && s.z >= -18)
      expect(deep.length).toBeGreaterThan(20)
      for (const step of deep) {
        expect(step.inCave).toBe(true)
        // The outdoor heightmap is metres overhead and must never win.
        expect(base(step.x, step.z) - step.y).toBeGreaterThan(8)
        expect(step.y).toBeCloseTo(step.groundY, 6)
        expect(step.ceiling).not.toBeNull()
        expect(step.y + HEIGHTFIELD_PLAYER_HEIGHT).toBeLessThanOrEqual(step.ceiling! + 1e-6)
      }
    })

    it('never snaps or swims up to the surface anywhere along entrance → chamber → exit', () => {
      const world = makeWorld()
      const trace = walkPath(world, throughPath(), walk(0, 7))
      for (let i = 1; i < trace.length; i++) {
        const jump = trace[i]!.y - trace[i - 1]!.y
        expect(Math.abs(jump)).toBeLessThan(0.5)
      }
      // No frame ever lands the player on the overburden above the tunnel.
      for (const step of trace) {
        if (!step.inCave) continue
        expect(step.y).toBeLessThan(base(step.x, step.z) - 0.5)
      }
    })

    it('hands ground back to the surface after walking out', () => {
      const world = makeWorld()
      const trace = walkPath(world, throughPath(), walk(0, 7))
      const last = trace[trace.length - 1]!
      expect(last.z).toBeCloseTo(7, 6)
      expect(last.inCave).toBe(false)
      expect(last.y).toBeCloseTo(walk(0, 7), 1)
    })

    it('transitions through the mouth without losing the cave', () => {
      const world = makeWorld()
      const trace = walkPath(world, throughPath(), walk(0, 7))
      const inbound = trace.slice(0, trace.length / 2)
      const firstCave = inbound.findIndex((s) => s.inCave)
      expect(firstCave).toBeGreaterThan(0)
      // Once entered, the inbound leg stays in cave space all the way down.
      for (const step of inbound.slice(firstCave)) expect(step.inCave).toBe(true)
      // Cave space starts no further out than the production approach pit
      // (`CAVE_APPROACH_OFFSET + CAVE_APPROACH_RADIUS`), and no later than
      // a couple of metres past the doorway plane.
      expect(inbound[firstCave]!.z).toBeLessThanOrEqual(CAVE_APPROACH_OFFSET + CAVE_APPROACH_RADIUS)
      expect(inbound[firstCave]!.z).toBeGreaterThan(-4)
    })

    it('keeps the cave floor for an underground query miss beside the tunnel', () => {
      const world = makeWorld()
      // Establish stable interior state first, like a walking player.
      const deep = world.resolveGround(0, interiorProbeY(-8), -8)
      expect(deep.caveFloorY).not.toBeNull()
      const asideZ = -8
      const asideX = 4.5
      // A point in solid rock beside the tunnel is an underground *miss*;
      // production hysteresis keeps the last cave interval rather than
      // teleporting the entity onto the hillside above.
      const aside = world.resolveGround(asideX, deep.height, asideZ)
      expect(aside.height).toBeLessThan(base(asideX, asideZ) - 5)
      expect(aside.caveFloorY).not.toBeNull()
    })

    it('does not assign a surface entity to the cave beneath it', () => {
      const world = makeWorld()
      world.resetGround()
      const surfaceY = walk(0, -8)
      const ground = world.resolveGround(0, surfaceY, -8)
      expect(ground.caveFloorY).toBeNull()
      expect(ground.height).toBeCloseTo(surfaceY, 6)
    })

    it('clamps a jump to the rock ceiling', () => {
      const world = makeWorld()
      const ground = world.resolveGround(0, interiorProbeY(-16), -16)
      expect(ground.ceiling).not.toBeNull()
      let state = { y: ground.height, verticalVelocity: 0, grounded: true }
      state = integrateDebugVertical(ground, state, 1 / 60, true)
      for (let i = 0; i < 90; i++) {
        state = integrateDebugVertical(ground, state, 1 / 60, false)
        expect(state.y + HEIGHTFIELD_PLAYER_HEIGHT).toBeLessThanOrEqual(ground.ceiling! + 1e-6)
        expect(state.y).toBeGreaterThanOrEqual(ground.height - 1e-6)
      }
    })

    it('keeps the third-person boom off the hillside above the cave', () => {
      const world = makeWorld()
      const z = -16
      const ground = world.resolveGround(0, interiorProbeY(z), z)
      const originY = ground.height + 1.6
      const distance = 6
      const pitch = 0.28
      // Same desired-pose maths as `PlayerController.syncCamera`.
      for (const yaw of [0, Math.PI, Math.PI / 2]) {
        const cosPitch = Math.cos(pitch)
        const boom = resolveCameraBoom({
          originX: 0,
          originY,
          originZ: z,
          camX: Math.sin(yaw) * cosPitch * distance,
          camY: originY + Math.sin(pitch) * distance,
          camZ: z + Math.cos(yaw) * cosPitch * distance,
          sampleHeight: walk,
          colliders: world.boomCollidersAt(ground.height),
          occupancyAt: world.occupancyAt,
        })
        // Never parks on the overburden metres above the cave.
        expect(boom.y).toBeLessThan(base(boom.x, boom.z) - 1)
        // Stays in cave void, above the floor, below the ceiling.
        const occ = world.occupancyAt(boom.x, boom.y, boom.z)
        expect(occ).not.toBeNull()
      }
    })

    it('reports strict occupancy for the camera boom only inside real void', () => {
      const world = makeWorld()
      const floorY = world.resolveGround(0, interiorProbeY(-16), -16).height
      expect(world.occupancyAt(0, floorY + 0.5, -16)).not.toBeNull()
      // Solid rock beside the tunnel, and the overburden above it, are not void.
      expect(world.occupancyAt(9, floorY + 0.5, -16)).toBeNull()
      expect(world.occupancyAt(0, base(0, -16) - 0.2, -16)).toBeNull()
    })
  })

  it('lateral containment pushes out of rock and the low fringe, using the same field', () => {
    const topology = buildCaveHeightfieldFixture('basic')
    const field = buildCaveHeightfield(topology, walk, TEST_CONFIG).heightfield
    expect(sampleHeightfieldAt(field, 0, -8).gap).toBeGreaterThan(0)
    // Starting inside the wall resolves back into standable cave space, not
    // into some separate invisible collider.
    const resolved = resolveHeightfieldHorizontal(field, 3, -8, null, HEIGHTFIELD_PLAYER_RADIUS)
    const after = sampleHeightfieldAt(field, resolved.x, resolved.z)
    expect(after.gap).toBeGreaterThanOrEqual(HEIGHTFIELD_MIN_STANDING_GAP - 0.25)
    expect(Math.abs(resolved.x)).toBeLessThan(3)
    // A point already in the walkable core is left alone.
    const settled = resolveHeightfieldHorizontal(field, 0, -8, null, HEIGHTFIELD_PLAYER_RADIUS)
    expect(settled.x).toBeCloseTo(0, 6)
    expect(settled.z).toBeCloseTo(-8, 6)
  })

  it('never drags an outdoor entity toward the mouth', () => {
    const topology = buildCaveHeightfieldFixture('basic')
    const field = buildCaveHeightfield(topology, walk, TEST_CONFIG).heightfield
    for (const [x, z] of [[0, 6], [4, -8], [-5, -14]] as const) {
      const y = walk(x, z)
      const resolved = resolveHeightfieldHorizontal(field, x, z, y, HEIGHTFIELD_PLAYER_RADIUS)
      expect(resolved.x).toBeCloseTo(x, 6)
      expect(resolved.z).toBeCloseTo(z, 6)
    }
  })

  it('a player capsule cannot pass through the ceiling', () => {
    const topology = buildCaveHeightfieldFixture('basic')
    const field = buildCaveHeightfield(topology, walk, TEST_CONFIG).heightfield
    const hit = queryHeightfieldColumn(field, base, 0, interiorProbeY(-17), -17)
    expect(hit).not.toBeNull()
    expect(heightfieldCapsuleHitsCeiling(field, base, 0, hit!.ceilingY - 0.2, -17, HEIGHTFIELD_PLAYER_HEIGHT)).toBe(true)
    expect(heightfieldCapsuleHitsCeiling(field, base, 0, hit!.floorY, -17, HEIGHTFIELD_PLAYER_HEIGHT)).toBe(false)
    expect(heightfieldOccupancyAt(field, base, 0, hit!.floorY + 0.2, -17)).not.toBeNull()
  })

  it('builds both variants on the same topology and the same surface sampler', () => {
    const topology = buildCaveHeightfieldFixture('basic')
    const heightfield = heightfieldWorld()
    const sdf = sdfWorld()
    for (const z of [-8, -12, -17]) {
      const probeY = interiorProbeY(z)
      const hf = heightfield.resolveGround(0, probeY, z)
      const sd = sdf.resolveGround(0, probeY, z)
      expect(hf.caveFloorY).not.toBeNull()
      expect(sd.caveFloorY).not.toBeNull()
      // Same topology + same surface ⇒ floors agree to within representation noise.
      expect(Math.abs(hf.height - sd.height)).toBeLessThan(1)
      expect(hf.ceiling).not.toBeNull()
      expect(sd.ceiling).not.toBeNull()
      expect(hf.ceiling! - hf.height).toBeGreaterThanOrEqual(topology.minClearance - 0.35)
    }
  })
})
