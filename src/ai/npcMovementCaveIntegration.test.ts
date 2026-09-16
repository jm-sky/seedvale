import { describe, expect, it } from 'vitest'
import type { CaveHeightfieldRepresentation, SurfaceSampler } from '../world/caves/caveHeightfieldRepresentation'
import type { CaveTopology } from '../world/caves/caveTopology'
import type { LargeCaveSite } from '../world/largeCaves'
import type { NpcWorldMovementQueries } from './npcMovementTarget'
import { PLAYER_COLLISION_RADIUS } from '../player/playerDimensions'
import {
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
  heightfieldOccupancyAt,
  heightfieldStandingClearance,
  queryHeightfieldGround,
  resolveHeightfieldHorizontal,
} from '../world/caves/caveHeightfieldQuery'
import { buildCaveHeightfieldRepresentation } from '../world/caves/caveHeightfieldRepresentation'
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
  allowsEmergencySurfaceReposition,
  placeNpcAfterTimeSkip,
  sampleCaveLocalEscape,
} from './npcMovementRecovery'
import { composeNpcMovementRoute, INITIAL_NPC_ROUTE_EXECUTION } from './npcMovementRoute'

function baseSite(overrides: Partial<LargeCaveSite> = {}): LargeCaveSite {
  return { x: 200, z: -140, yaw: 0.6, length: 12, variant: 0.4, ...overrides }
}

function gentleHillFor(site: LargeCaveSite): SurfaceSampler {
  const intoDx = -Math.sin(site.yaw)
  const intoDz = -Math.cos(site.yaw)
  return (x, z) => 130 + 0.5 * ((x - site.x) * intoDx + (z - site.z) * intoDz)
}

function queriesFor(
  topology: CaveTopology,
  heightfield: CaveHeightfieldRepresentation,
  surfaceHeightAt: SurfaceSampler,
): NpcWorldMovementQueries {
  const minGap = heightfieldStandingClearance(NPC_HEIGHT)
  return {
    spatialContextAt: (x, y, z) => {
      const occ = heightfieldOccupancyAt(heightfield, surfaceHeightAt, x, y, z)
      if (!occ || occ.openSky) return WORLD_SPATIAL_CONTEXT_SURFACE
      return caveSpatialContext(topology.caveId)
    },
    resolveHabitat: (caveId, entityHeight) => {
      if (caveId !== topology.caveId) return null
      return resolveCaveTraversal(topology, heightfield, surfaceHeightAt, entityHeight)
    },
    resolveRouteBetweenPoints: (caveId, from, to) => {
      if (caveId !== topology.caveId) return null
      return resolveCaveRouteBetweenPoints(topology, heightfield, surfaceHeightAt, from, to)
    },
    queryGroundIn: (caveId, x, y, z) => {
      if (caveId !== topology.caveId) return null
      return queryHeightfieldGround(heightfield, surfaceHeightAt, x, y, z)
    },
    resolveHorizontalIn: (caveId, x, z, y, radius) => {
      if (caveId !== topology.caveId) return { x, z }
      return resolveHeightfieldHorizontal(heightfield, x, z, y, radius, minGap)
    },
  }
}

function naturalWorld(seed = 42) {
  const site = baseSite()
  const sampleBaseHeight = gentleHillFor(site)
  const topology = buildNaturalCaveTopology({ seed, site, sampleHeight: sampleBaseHeight, sampleBaseHeight })
  if (!topology) throw new Error('natural topology rejected')
  const walkSurfaceAt: SurfaceSampler = (x, z) => sampleBaseHeight(x, z) - mouthCarveDepth(x, z, topology.entrance)
  const { heightfield } = buildCaveHeightfieldRepresentation(topology, walkSurfaceAt)
  return { topology, heightfield, surfaceHeightAt: sampleBaseHeight, queries: queriesFor(topology, heightfield, sampleBaseHeight) }
}

function adventureWorld(seed = 42) {
  const site = baseSite()
  const sampleBaseHeight = gentleHillFor(site)
  const topology = buildAdventureCaveTopology({ seed, site, sampleHeight: sampleBaseHeight, sampleBaseHeight })
  if (!topology) throw new Error('adventure topology rejected')
  const walkSurfaceAt: SurfaceSampler = (x, z) => sampleBaseHeight(x, z) - mouthCarveDepth(x, z, topology.entrance)
  const { heightfield } = buildCaveHeightfieldRepresentation(topology, walkSurfaceAt)
  return { topology, heightfield, surfaceHeightAt: sampleBaseHeight, queries: queriesFor(topology, heightfield, sampleBaseHeight) }
}

function dungeonWorld(seed = 12) {
  const site = baseSite()
  const sampleBaseHeight = gentleHillFor(site)
  const topology = buildDungeonCaveTopology({ seed, site, sampleHeight: sampleBaseHeight, sampleBaseHeight })
  if (!topology) throw new Error('dungeon topology rejected')
  const walkSurfaceAt: SurfaceSampler = (x, z) => sampleBaseHeight(x, z) - mouthCarveDepth(x, z, topology.entrance)
  const built = buildDungeonHeightfieldWithPool(topology, walkSurfaceAt)
  if (!built) throw new Error('dungeon pool rejected')
  return {
    topology,
    heightfield: built.heightfield,
    surfaceHeightAt: sampleBaseHeight,
    pool: built.pool,
    queries: queriesFor(topology, built.heightfield, sampleBaseHeight),
  }
}

function snap(
  heightfield: CaveHeightfieldRepresentation,
  surfaceHeightAt: SurfaceSampler,
  point: { x: number, y: number, z: number },
) {
  const column = heightfieldGroundColumn(heightfield, surfaceHeightAt, point.x, point.z)
  if (!column) return point
  return { x: point.x, y: column.floorY, z: point.z }
}

function nodeOf(topology: CaveTopology, id: string) {
  const node = topology.nodes.find((n) => n.id === id)
  if (!node) throw new Error(`missing ${id}`)
  return { ...node.position }
}

describe('npc-027 integration: surface → cave → surface', () => {
  it('composes enter then exit through the requested cave mouth', () => {
    const { topology, heightfield, surfaceHeightAt, queries } = naturalWorld()
    const habitat = resolveCaveTraversal(topology, heightfield, surfaceHeightAt, NPC_HEIGHT)!
    const home = snap(heightfield, surfaceHeightAt, habitat.home)
    const outside = { x: habitat.entrance.x + 12, y: surfaceHeightAt(habitat.entrance.x + 12, habitat.entrance.z), z: habitat.entrance.z }

    const inbound = composeNpcMovementRoute({
      currentPosition: outside,
      currentContext: WORLD_SPATIAL_CONTEXT_SURFACE,
      target: { position: home, context: caveSpatialContext(topology.caveId) },
      queries,
      entityHeight: NPC_HEIGHT,
    })
    expect(inbound).not.toBeNull()
    expect(inbound!.legs[0]).toMatchObject({ kind: 'enterCave', caveId: topology.caveId })
    expect(inbound!.finalTarget.position).toEqual(home)

    const outbound = composeNpcMovementRoute({
      currentPosition: home,
      currentContext: caveSpatialContext(topology.caveId),
      target: { position: outside, context: WORLD_SPATIAL_CONTEXT_SURFACE },
      queries,
      entityHeight: NPC_HEIGHT,
    })
    expect(outbound).not.toBeNull()
    expect(outbound!.legs.some((leg) => leg.kind === 'exitCave' && leg.caveId === topology.caveId)).toBe(true)
    expect(outbound!.finalTarget.position).toEqual(outside)
  })
})

describe('npc-027 integration: archetypes', () => {
  it('natural chamber route is topology-backed, not a geometric shortcut', () => {
    const { topology, heightfield, surfaceHeightAt, queries } = naturalWorld()
    const from = snap(heightfield, surfaceHeightAt, nodeOf(topology, 'entrance'))
    const to = snap(heightfield, surfaceHeightAt, nodeOf(topology, 'chamber'))
    const route = composeNpcMovementRoute({
      currentPosition: from,
      currentContext: caveSpatialContext(topology.caveId),
      target: { position: to, context: caveSpatialContext(topology.caveId) },
      queries,
      entityHeight: NPC_HEIGHT,
    })
    expect(route).not.toBeNull()
    expect(route!.legs.length).toBeGreaterThan(0)
  })

  it('adventure branch follows the junction → side chamber, not a different cave', () => {
    const { topology, heightfield, surfaceHeightAt, queries } = adventureWorld()
    const from = snap(heightfield, surfaceHeightAt, nodeOf(topology, ADVENTURE_JUNCTION_NODE_ID))
    const to = snap(heightfield, surfaceHeightAt, nodeOf(topology, ADVENTURE_SIDE_CHAMBER_NODE_ID))
    const route = composeNpcMovementRoute({
      currentPosition: from,
      currentContext: caveSpatialContext(topology.caveId),
      target: { position: to, context: caveSpatialContext(topology.caveId) },
      queries,
      entityHeight: NPC_HEIGHT,
    })
    expect(route).not.toBeNull()
    const last = route!.legs[route!.legs.length - 1]
    expect(last).toMatchObject({ kind: 'move', point: to })
  })

  it('dungeon deeper/branch route ignores pool metadata as a waypoint authority', () => {
    const { topology, heightfield, surfaceHeightAt, pool, queries } = dungeonWorld()
    const from = snap(heightfield, surfaceHeightAt, nodeOf(topology, DUNGEON_SIDE_CHAMBER_1_NODE_ID))
    const to = snap(heightfield, surfaceHeightAt, nodeOf(topology, DUNGEON_FINAL_CHAMBER_NODE_ID))
    const route = composeNpcMovementRoute({
      currentPosition: from,
      currentContext: caveSpatialContext(topology.caveId),
      target: { position: to, context: caveSpatialContext(topology.caveId) },
      queries,
      entityHeight: NPC_HEIGHT,
    })
    expect(route).not.toBeNull()
    expect(route!.finalTarget.position).toEqual(to)
    expect(pool).toBeTruthy()
  })
})

describe('npc-027 integration: presentation, same-XZ, stuck, unreachable, time skip', () => {
  it('semantic route does not require presentation / streaming APIs', () => {
    const { topology, heightfield, surfaceHeightAt, queries } = naturalWorld()
    expect('peekStreamingDebug' in queries).toBe(false)
    expect('update' in queries).toBe(false)
    const habitat = resolveCaveTraversal(topology, heightfield, surfaceHeightAt, NPC_HEIGHT)!
    const home = snap(heightfield, surfaceHeightAt, habitat.home)
    expect(composeNpcMovementRoute({
      currentPosition: home,
      currentContext: caveSpatialContext(topology.caveId),
      target: { position: home, context: caveSpatialContext(topology.caveId) },
      queries,
      entityHeight: NPC_HEIGHT,
    })).not.toBeNull()
  })

  it('same X/Z at surface Y vs cave floor are distinct contexts', () => {
    const { topology, heightfield, surfaceHeightAt, queries } = naturalWorld()
    const habitat = resolveCaveTraversal(topology, heightfield, surfaceHeightAt, NPC_HEIGHT)!
    const home = snap(heightfield, surfaceHeightAt, habitat.home)
    const surfaceY = surfaceHeightAt(home.x, home.z)
    expect(queries.spatialContextAt(home.x, home.y, home.z)).toEqual(caveSpatialContext(topology.caveId))
    expect(queries.spatialContextAt(home.x, surfaceY, home.z)).toEqual(WORLD_SPATIAL_CONTEXT_SURFACE)
    expect(Math.abs(home.y - surfaceY)).toBeGreaterThan(0.4)
  })

  it('underground local escape stays in-cave and emergency surface teleport is gated off', () => {
    const { topology, heightfield, surfaceHeightAt, queries } = naturalWorld()
    const habitat = resolveCaveTraversal(topology, heightfield, surfaceHeightAt, NPC_HEIGHT)!
    const home = snap(heightfield, surfaceHeightAt, habitat.home)
    const escaped = sampleCaveLocalEscape({
      caveId: topology.caveId,
      x: home.x,
      y: home.y,
      z: home.z,
      queries,
      entityHeight: NPC_HEIGHT,
      radius: PLAYER_COLLISION_RADIUS,
    })
    expect(escaped).not.toBeNull()
    expect(queries.spatialContextAt(escaped!.x, escaped!.y, escaped!.z)).toEqual(caveSpatialContext(topology.caveId))
    expect(escaped!.y).not.toBeCloseTo(surfaceHeightAt(escaped!.x, escaped!.z), 0)
    expect(allowsEmergencySurfaceReposition(caveSpatialContext(topology.caveId), null)).toBe(false)
  })

  it('unreachable cave composition is null so the agent can fail the action', () => {
    const { topology, queries } = naturalWorld()
    const broken: NpcWorldMovementQueries = {
      ...queries,
      resolveRouteBetweenPoints: () => null,
    }
    const from = { x: 0, y: -8, z: 0 }
    const to = { x: 40, y: -9, z: 40 }
    expect(composeNpcMovementRoute({
      currentPosition: from,
      currentContext: caveSpatialContext(topology.caveId),
      target: { position: to, context: caveSpatialContext(topology.caveId) },
      queries: broken,
      entityHeight: NPC_HEIGHT,
    })).toBeNull()
  })

  it('time skip underground holds the cave endpoint instead of sampleHeight', () => {
    const { topology, heightfield, surfaceHeightAt, queries } = naturalWorld()
    const habitat = resolveCaveTraversal(topology, heightfield, surfaceHeightAt, NPC_HEIGHT)!
    const home = snap(heightfield, surfaceHeightAt, habitat.home)
    const surfaceY = surfaceHeightAt(home.x, home.z)
    const placed = placeNpcAfterTimeSkip({
      current: home,
      scheduleTarget: { x: home.x + 30, z: home.z + 30 },
      currentContext: caveSpatialContext(topology.caveId),
      mouthPhase: null,
      route: null,
      execution: INITIAL_NPC_ROUTE_EXECUTION,
      queries,
      sampleHeight: surfaceHeightAt,
    })
    expect(placed.policy).toBe('hold-cave-endpoint')
    expect(placed.x).toBe(home.x)
    expect(placed.z).toBe(home.z)
    expect(placed.y).toBeCloseTo(home.y, 3)
    expect(placed.y).not.toBeCloseTo(surfaceY, 0)
  })
})
