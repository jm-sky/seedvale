import { describe, expect, it } from 'vitest'
import type { CaveHeightfieldRepresentation, SurfaceSampler } from '../world/caves/caveHeightfieldRepresentation'
import type { CaveTopology } from '../world/caves/caveTopology'
import type { LargeCaveSite } from '../world/largeCaves'
import type { NpcCaveLocomotionQueries } from './npcCaveLocomotion'
import { PLAYER_COLLISION_RADIUS } from '../player/playerDimensions'
import { applySlopeMovementConstraint } from '../terrain/slopeConstraint'
import {
  ADVENTURE_DEEP_CHAMBER_NODE_ID,
  ADVENTURE_JUNCTION_NODE_ID,
  ADVENTURE_SIDE_CHAMBER_NODE_ID,
  buildAdventureCaveTopology,
} from '../world/caves/adventureTopology'
import {
  resolveCaveRouteBetweenPoints,
  resolveCaveTraversal,
} from '../world/caves/caveHabitat'
import {
  heightfieldGroundColumn,
  heightfieldStandingClearance,
  queryHeightfieldGround,
  resolveHeightfieldHorizontal,
} from '../world/caves/caveHeightfieldQuery'
import { buildCaveHeightfieldRepresentation, sampleHeightfieldAt } from '../world/caves/caveHeightfieldRepresentation'
import { buildDungeonHeightfieldWithPool } from '../world/caves/caveUndergroundPool'
import {
  buildDungeonCaveTopology,
  DUNGEON_FINAL_CHAMBER_NODE_ID,
  DUNGEON_SIDE_CHAMBER_1_NODE_ID,
} from '../world/caves/dungeonTopology'
import { mouthCarveDepth } from '../world/caves/mouthCarve'
import { buildNaturalCaveTopology } from '../world/caves/productionTopology'
import { caveSpatialContext, WORLD_SPATIAL_CONTEXT_SURFACE } from '../world/spatialContext'
import { NPC_HEIGHT } from './NpcAgent'
import {
  acceptNpcCaveHorizontalCandidate,
  npcActiveCaveId,
  npcCaveGroundY,
  shouldUseNpcCaveLocomotion,
  stepNpcCaveHorizontal,
} from './npcCaveLocomotion'
import { isPointWalkableForNpc } from './npcColliderRim'
import { INITIAL_NPC_ROUTE_EXECUTION } from './npcMovementRoute'

function baseSite(overrides: Partial<LargeCaveSite> = {}): LargeCaveSite {
  return { x: 200, z: -140, yaw: 0.6, length: 12, variant: 0.4, ...overrides }
}

function gentleHillFor(site: LargeCaveSite): SurfaceSampler {
  const intoDx = -Math.sin(site.yaw)
  const intoDz = -Math.cos(site.yaw)
  return (x, z) => 130 + 0.5 * ((x - site.x) * intoDx + (z - site.z) * intoDz)
}

function buildFixture(topology: CaveTopology): {
  topology: CaveTopology
  heightfield: CaveHeightfieldRepresentation
  surfaceHeightAt: SurfaceSampler
  queries: NpcCaveLocomotionQueries
} {
  const sampleBaseHeight = gentleHillFor(baseSite())
  const walkSurfaceAt: SurfaceSampler = (x, z) => sampleBaseHeight(x, z) - mouthCarveDepth(x, z, topology.entrance)
  const { heightfield } = buildCaveHeightfieldRepresentation(topology, walkSurfaceAt)
  const minGap = heightfieldStandingClearance(NPC_HEIGHT)
  const queries: NpcCaveLocomotionQueries = {
    queryGroundIn: (_caveId, x, y, z) => queryHeightfieldGround(heightfield, sampleBaseHeight, x, y, z),
    resolveHorizontalIn: (_caveId, x, z, y, radius) =>
      resolveHeightfieldHorizontal(heightfield, x, z, y, radius, minGap),
  }
  return { topology, heightfield, surfaceHeightAt: sampleBaseHeight, queries }
}

function naturalFixture(seed = 42) {
  const sampleBaseHeight = gentleHillFor(baseSite())
  const topology = buildNaturalCaveTopology({ seed, site: baseSite(), sampleHeight: sampleBaseHeight, sampleBaseHeight })
  if (!topology) throw new Error('test fixture: natural topology rejected')
  return buildFixture(topology)
}

function adventureFixture(seed = 42) {
  const sampleBaseHeight = gentleHillFor(baseSite())
  const topology = buildAdventureCaveTopology({ seed, site: baseSite(), sampleHeight: sampleBaseHeight, sampleBaseHeight })
  if (!topology) throw new Error('test fixture: adventure topology rejected')
  return buildFixture(topology)
}

function dungeonFixture(seed = 12) {
  const site = baseSite()
  const sampleBaseHeight = gentleHillFor(site)
  const topology = buildDungeonCaveTopology({ seed, site, sampleHeight: sampleBaseHeight, sampleBaseHeight })
  if (!topology) throw new Error('test fixture: dungeon topology rejected')
  const walkSurfaceAt: SurfaceSampler = (x, z) => sampleBaseHeight(x, z) - mouthCarveDepth(x, z, topology.entrance)
  const built = buildDungeonHeightfieldWithPool(topology, walkSurfaceAt)
  if (!built) throw new Error('test fixture: dungeon pool rejected')
  const minGap = heightfieldStandingClearance(NPC_HEIGHT)
  const queries: NpcCaveLocomotionQueries = {
    queryGroundIn: (_caveId, x, y, z) => queryHeightfieldGround(built.heightfield, sampleBaseHeight, x, y, z),
    resolveHorizontalIn: (_caveId, x, z, y, radius) =>
      resolveHeightfieldHorizontal(built.heightfield, x, z, y, radius, minGap),
  }
  return { topology, heightfield: built.heightfield, surfaceHeightAt: sampleBaseHeight, pool: built.pool, queries }
}

function snapPoint(
  heightfield: CaveHeightfieldRepresentation,
  surfaceHeightAt: SurfaceSampler,
  point: { x: number, y: number, z: number },
): { x: number, y: number, z: number } {
  const column = heightfieldGroundColumn(heightfield, surfaceHeightAt, point.x, point.z)
  if (!column) return point
  return { x: point.x, y: column.floorY, z: point.z }
}

function nodePoint(topology: CaveTopology, id: string): { x: number, y: number, z: number } {
  const node = topology.nodes.find((n) => n.id === id)
  if (!node) throw new Error(`missing node ${id}`)
  return { ...node.position }
}

function nodeStandable(
  topology: CaveTopology,
  heightfield: CaveHeightfieldRepresentation,
  surfaceHeightAt: SurfaceSampler,
  id: string,
): { x: number, y: number, z: number } {
  return snapPoint(heightfield, surfaceHeightAt, nodePoint(topology, id))
}

function walkRoute(
  caveId: string,
  queries: NpcCaveLocomotionQueries,
  route: readonly { x: number, y: number, z: number }[],
): { x: number, y: number, z: number }[] {
  const start = route[0]
  if (!start) return []
  let x = start.x
  let y = start.y
  let z = start.z
  const path = [{ x, y, z }]
  const step = 0.45
  for (let i = 1; i < route.length; i++) {
    const dest = route[i]!
    for (let n = 0; n < 120; n++) {
      const dx = dest.x - x
      const dz = dest.z - z
      const dist = Math.hypot(dx, dz)
      if (dist < 0.4) break
      const wish = Math.min(step, dist)
      const moved = stepNpcCaveHorizontal({
        caveId,
        x,
        z,
        y,
        wishX: (dx / dist) * wish,
        wishZ: (dz / dist) * wish,
        radius: PLAYER_COLLISION_RADIUS,
        entityHeight: NPC_HEIGHT,
        queries,
      })
      if (!moved.moved && dist > 0.45) break
      x = moved.x
      z = moved.z
      const floor = npcCaveGroundY({ caveId, x, y, z, queries })
      if (floor == null) break
      y = floor
      path.push({ x, y, z })
    }
  }
  return path
}

describe('npcCaveLocomotion domain gate (plan npc-027 stage 3)', () => {
  it('uses cave queries only in cave context or during mouth crossing', () => {
    expect(shouldUseNpcCaveLocomotion(WORLD_SPATIAL_CONTEXT_SURFACE, null)).toBe(false)
    expect(shouldUseNpcCaveLocomotion(WORLD_SPATIAL_CONTEXT_SURFACE, 'approach')).toBe(false)
    expect(shouldUseNpcCaveLocomotion(WORLD_SPATIAL_CONTEXT_SURFACE, 'crossing')).toBe(true)
    expect(shouldUseNpcCaveLocomotion(caveSpatialContext('a'), null)).toBe(true)
  })

  it('takes caveId from membership, else from the crossing mouth leg', () => {
    expect(npcActiveCaveId(caveSpatialContext('mine-a'), null, INITIAL_NPC_ROUTE_EXECUTION)).toBe('mine-a')
    expect(npcActiveCaveId(WORLD_SPATIAL_CONTEXT_SURFACE, null, INITIAL_NPC_ROUTE_EXECUTION)).toBeNull()
    expect(npcActiveCaveId(
      WORLD_SPATIAL_CONTEXT_SURFACE,
      { legs: [{ kind: 'enterCave', caveId: 'n1', approach: { x: 0, y: 0, z: 0 }, inward: { x: 0, y: -2, z: -2 } }] },
      { legIndex: 0, mouthPhase: 'crossing' },
    )).toBe('n1')
  })

  it('surface slope/water/collider helpers remain independent of cave locomotion', () => {
    const steep: (x: number, z: number) => number = (_x, z) => z * 2
    const constrained = applySlopeMovementConstraint(0, 1, 0, 0, steep)
    expect(constrained.z).toBeLessThan(1)
    expect(isPointWalkableForNpc(8, 8, [], 0, 0, null, 0.4, 0.55)).toBe(true)
  })
})

describe('npcCaveLocomotion natural / heightfield (plan npc-027 stage 3)', () => {
  it('follows the heightfield floor on descent and ascent and does not snap to overlapping surface Y', () => {
    const { topology, queries, heightfield, surfaceHeightAt } = naturalFixture()
    const caveId = topology.caveId
    const descriptor = resolveCaveTraversal(topology, heightfield, surfaceHeightAt, NPC_HEIGHT)
    expect(descriptor).not.toBeNull()
    const entrance = { x: descriptor!.entrance.x, y: descriptor!.entrance.y, z: descriptor!.entrance.z }
    const down = resolveCaveRouteBetweenPoints(topology, heightfield, surfaceHeightAt, entrance, descriptor!.home)
    const up = resolveCaveRouteBetweenPoints(topology, heightfield, surfaceHeightAt, descriptor!.home, entrance)
    expect(down).not.toBeNull()
    expect(up).not.toBeNull()

    const walkedDown = walkRoute(caveId, queries, down!.map((p) => snapPoint(heightfield, surfaceHeightAt, p)))
    const walkedUp = walkRoute(caveId, queries, up!.map((p) => snapPoint(heightfield, surfaceHeightAt, p)))
    expect(walkedDown.length).toBeGreaterThan(3)
    expect(walkedUp.length).toBeGreaterThan(3)
    for (const p of [...walkedDown, ...walkedUp]) {
      const floor = npcCaveGroundY({ caveId, ...p, queries })
      expect(floor).not.toBeNull()
      expect(p.y).toBeCloseTo(floor!, 3)
      const surfaceY = surfaceHeightAt(p.x, p.z)
      expect(Math.abs(p.y - surfaceY)).toBeGreaterThan(0.4)
    }
    const downYs = walkedDown.map((p) => p.y)
    expect(downYs[0]!).toBeGreaterThan(downYs[downYs.length - 1]! + 0.2)
    const upYs = walkedUp.map((p) => p.y)
    expect(upYs[upYs.length - 1]!).toBeGreaterThan(upYs[0]! + 0.2)
  })

  it('resolveHorizontalIn blocks a wish through rock', () => {
    const { topology, queries, heightfield, surfaceHeightAt } = naturalFixture()
    const chamber = nodeStandable(topology, heightfield, surfaceHeightAt, 'chamber')
    const y = chamber.y
    const minGap = heightfieldStandingClearance(NPC_HEIGHT)
    let rock: { x: number, z: number } | null = null
    for (const dist of [3, 6, 9, 12, 16]) {
      for (let deg = 0; deg < 360; deg += 15) {
        const rad = (deg * Math.PI) / 180
        const x = chamber.x + Math.cos(rad) * dist
        const z = chamber.z + Math.sin(rad) * dist
        const sample = sampleHeightfieldAt(heightfield, x, z)
        if (sample.outsideGrid || sample.openSky) continue
        if (sample.gap < minGap) {
          rock = { x, z }
          break
        }
      }
      if (rock) break
    }
    expect(rock).not.toBeNull()
    const stepped = stepNpcCaveHorizontal({
      caveId: topology.caveId,
      x: chamber.x,
      z: chamber.z,
      y,
      wishX: rock!.x - chamber.x,
      wishZ: rock!.z - chamber.z,
      radius: PLAYER_COLLISION_RADIUS,
      entityHeight: NPC_HEIGHT,
      queries,
    })
    const after = sampleHeightfieldAt(heightfield, stepped.x, stepped.z)
    expect(after.outsideGrid).toBe(false)
    expect(after.gap >= minGap || after.openSky).toBe(true)
    expect(queryHeightfieldGround(heightfield, surfaceHeightAt, rock!.x, y, rock!.z) == null
      || sampleHeightfieldAt(heightfield, rock!.x, rock!.z).gap < minGap).toBe(true)
  })

  it('natural entrance↔chamber traversal uses the same helper', () => {
    const { topology, queries, heightfield, surfaceHeightAt } = naturalFixture()
    const from = nodeStandable(topology, heightfield, surfaceHeightAt, 'entrance')
    const to = nodeStandable(topology, heightfield, surfaceHeightAt, 'chamber')
    const route = resolveCaveRouteBetweenPoints(topology, heightfield, surfaceHeightAt, from, to)
    expect(route).not.toBeNull()
    const walked = walkRoute(topology.caveId, queries, route!.map((p) => snapPoint(heightfield, surfaceHeightAt, p)))
    const last = walked[walked.length - 1]!
    expect(Math.hypot(last.x - to.x, last.z - to.z)).toBeLessThan(2)
  })
})

describe('npcCaveLocomotion adventure junction (plan npc-027 stage 3)', () => {
  it('walks junction → side chamber by node id, not array order', () => {
    const { topology, queries, heightfield, surfaceHeightAt } = adventureFixture()
    const from = nodeStandable(topology, heightfield, surfaceHeightAt, ADVENTURE_JUNCTION_NODE_ID)
    const to = nodeStandable(topology, heightfield, surfaceHeightAt, ADVENTURE_SIDE_CHAMBER_NODE_ID)
    const deep = nodeStandable(topology, heightfield, surfaceHeightAt, ADVENTURE_DEEP_CHAMBER_NODE_ID)
    const route = resolveCaveRouteBetweenPoints(topology, heightfield, surfaceHeightAt, from, to)
    expect(route).not.toBeNull()
    const walked = walkRoute(topology.caveId, queries, route!.map((p) => snapPoint(heightfield, surfaceHeightAt, p)))
    const last = walked[walked.length - 1]!
    expect(Math.hypot(last.x - to.x, last.z - to.z)).toBeLessThan(2.5)
    expect(Math.hypot(last.x - deep.x, last.z - deep.z)).toBeGreaterThan(3)
  })
})

describe('npcCaveLocomotion dungeon branch / pool (plan npc-027 stage 3)', () => {
  it('walks side chamber → final chamber without treating pool metadata as a waypoint', () => {
    const { topology, queries, heightfield, surfaceHeightAt, pool } = dungeonFixture()
    const from = nodeStandable(topology, heightfield, surfaceHeightAt, DUNGEON_SIDE_CHAMBER_1_NODE_ID)
    const to = nodeStandable(topology, heightfield, surfaceHeightAt, DUNGEON_FINAL_CHAMBER_NODE_ID)
    const route = resolveCaveRouteBetweenPoints(topology, heightfield, surfaceHeightAt, from, to)
    expect(route).not.toBeNull()
    const snapped = route!.map((p) => snapPoint(heightfield, surfaceHeightAt, p))
      .filter((p) => heightfieldGroundColumn(heightfield, surfaceHeightAt, p.x, p.z) != null)
    expect(snapped.length).toBeGreaterThan(2)
    const walked = walkRoute(topology.caveId, queries, snapped)
    const last = walked[walked.length - 1]!
    expect(Math.hypot(last.x - to.x, last.z - to.z)).toBeLessThan(6)
    expect(walked.length).toBeGreaterThan(3)
    expect(walked.every((p) => npcCaveGroundY({ caveId: topology.caveId, ...p, queries }) != null)).toBe(true)
    expect(walked.some((p) => {
      const floor = npcCaveGroundY({ caveId: topology.caveId, ...p, queries })
      return floor != null && Math.abs(floor - pool.waterLevel) > 0.2
    })).toBe(true)
  })

  it('separation candidate is rejected when it leaves the cave void', () => {
    const { topology, queries, heightfield, surfaceHeightAt } = naturalFixture()
    const chamber = nodeStandable(topology, heightfield, surfaceHeightAt, 'chamber')
    const y = npcCaveGroundY({ caveId: topology.caveId, ...chamber, queries })!
    const accepted = acceptNpcCaveHorizontalCandidate({
      caveId: topology.caveId,
      x: chamber.x,
      z: chamber.z,
      y,
      radius: PLAYER_COLLISION_RADIUS,
      entityHeight: NPC_HEIGHT,
      queries,
    })
    expect(accepted).not.toBeNull()
    const rejected = acceptNpcCaveHorizontalCandidate({
      caveId: topology.caveId,
      x: chamber.x + 80,
      z: chamber.z + 80,
      y,
      radius: PLAYER_COLLISION_RADIUS,
      entityHeight: NPC_HEIGHT,
      queries,
    })
    expect(rejected == null || Math.hypot(rejected.x - (chamber.x + 80), rejected.z - (chamber.z + 80)) > 10).toBe(true)
  })
})
