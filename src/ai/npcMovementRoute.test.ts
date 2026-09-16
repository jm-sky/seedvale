import { describe, expect, it, vi } from 'vitest'
import type { CaveTraversalDescriptor, CaveTraversalPoint } from '../world/caves/caveHabitat'
import type { NpcMovementTarget, NpcWorldMovementQueries } from './npcMovementTarget'
import {
  caveSpatialContext,
  WORLD_SPATIAL_CONTEXT_SURFACE,
} from '../world/spatialContext'
import {
  composeNpcMovementRoute,
  INITIAL_NPC_ROUTE_EXECUTION,
  isMouthTransitionConfirmed,
  nextNpcRouteSteer,
  type NpcRouteLeg,
} from './npcMovementRoute'

const CAVE_A = 'cave-a'
const CAVE_B = 'cave-b'

const ENTRANCE_A = { x: 40, y: 8, z: 0 }
const INWARD_A = { x: 40, y: 2, z: -6 }
const HOME_A = { x: 40, y: -8, z: -24 }
const ENTRANCE_B = { x: 2, y: 8, z: 2 }
const HOME_B = { x: 2, y: -8, z: -20 }

function habitat(caveId: string, entrance: CaveTraversalPoint, home: CaveTraversalPoint, mid: CaveTraversalPoint): CaveTraversalDescriptor {
  return {
    caveId,
    entrance: { ...entrance, yaw: 0 },
    home,
    routeToEntrance: [home, mid, entrance],
  }
}

const HABITAT_A = habitat(CAVE_A, ENTRANCE_A, HOME_A, INWARD_A)
const HABITAT_B = habitat(CAVE_B, ENTRANCE_B, HOME_B, { x: 2, y: 2, z: -6 })

function fakeQueries(overrides: Partial<NpcWorldMovementQueries> = {}): NpcWorldMovementQueries {
  return {
    spatialContextAt: () => WORLD_SPATIAL_CONTEXT_SURFACE,
    resolveHabitat: (caveId) => {
      if (caveId === CAVE_A) return HABITAT_A
      if (caveId === CAVE_B) return HABITAT_B
      return null
    },
    resolveRouteBetweenPoints: (caveId, from, to) => {
      if (caveId === 'disconnected') return null
      return [from, to]
    },
    ...overrides,
  }
}

function caveTarget(caveId: string, position = HOME_A): NpcMovementTarget {
  return { position: { ...position }, context: caveSpatialContext(caveId) }
}

function surfaceTarget(position: { x: number, y: number, z: number }): NpcMovementTarget {
  return { position: { ...position }, context: WORLD_SPATIAL_CONTEXT_SURFACE }
}

describe('composeNpcMovementRoute (plan npc-027 stage 2)', () => {
  it('composes surface → surface as a single move to the committed target', () => {
    const target = surfaceTarget({ x: 12, y: 4, z: -3 })
    const route = composeNpcMovementRoute({
      currentPosition: { x: 0, y: 4, z: 0 },
      currentContext: WORLD_SPATIAL_CONTEXT_SURFACE,
      target,
      queries: fakeQueries(),
      entityHeight: 1.75,
    })
    expect(route).not.toBeNull()
    expect(route!.finalTarget).toEqual(target)
    expect(route!.legs).toEqual([{ kind: 'move', point: target.position }])
  })

  it('composes surface → cave through that cave’s entrance, then interior points', () => {
    const target = caveTarget(CAVE_A, HOME_A)
    const route = composeNpcMovementRoute({
      currentPosition: { x: 0, y: 8, z: 30 },
      currentContext: WORLD_SPATIAL_CONTEXT_SURFACE,
      target,
      queries: fakeQueries(),
      entityHeight: 1.75,
    })
    expect(route).not.toBeNull()
    expect(route!.finalTarget).toEqual(target)
    expect(route!.legs[0]).toEqual({
      kind: 'enterCave',
      caveId: CAVE_A,
      approach: ENTRANCE_A,
      inward: INWARD_A,
    })
    const last = route!.legs[route!.legs.length - 1]
    expect(last).toEqual({ kind: 'move', point: HOME_A })
  })

  it('composes cave → surface through this cave’s entrance, then the surface target', () => {
    const target = surfaceTarget({ x: 100, y: 8, z: 100 })
    const route = composeNpcMovementRoute({
      currentPosition: { ...HOME_A },
      currentContext: caveSpatialContext(CAVE_A),
      target,
      queries: fakeQueries(),
      entityHeight: 1.75,
    })
    expect(route).not.toBeNull()
    expect(route!.finalTarget).toEqual(target)
    expect(route!.legs.some((leg) => leg.kind === 'exitCave' && leg.caveId === CAVE_A)).toBe(true)
    const last = route!.legs[route!.legs.length - 1]
    expect(last).toEqual({ kind: 'move', point: target.position })
  })

  it('composes cave → same cave via topology points, keeping the committed target', () => {
    const side = { x: 48, y: -9, z: -18 }
    const target = caveTarget(CAVE_A, side)
    const route = composeNpcMovementRoute({
      currentPosition: { ...HOME_A },
      currentContext: caveSpatialContext(CAVE_A),
      target,
      queries: fakeQueries(),
      entityHeight: 1.75,
    })
    expect(route).not.toBeNull()
    expect(route!.finalTarget.position).toEqual(side)
    expect(route!.legs.every((leg) => leg.kind === 'move')).toBe(true)
    expect(route!.legs.some((leg) => leg.kind === 'enterCave')).toBe(false)
  })

  it('does not replace the final target with an entrance waypoint', () => {
    const target = caveTarget(CAVE_A, HOME_A)
    const route = composeNpcMovementRoute({
      currentPosition: { x: 0, y: 8, z: 30 },
      currentContext: WORLD_SPATIAL_CONTEXT_SURFACE,
      target,
      queries: fakeQueries(),
      entityHeight: 1.75,
    })!
    expect(route.finalTarget.position).toEqual(HOME_A)
    expect(route.finalTarget.position).not.toEqual(ENTRANCE_A)
    const enter = route.legs[0] as Extract<NpcRouteLeg, { kind: 'enterCave' }>
    expect(enter.approach).toEqual(ENTRANCE_A)
  })

  it('uses the requested cave entrance, not the globally nearest entrance', () => {
    const resolveHabitat = vi.fn((caveId: string) => {
      if (caveId === CAVE_A) return HABITAT_A
      if (caveId === CAVE_B) return HABITAT_B
      return null
    })
    const route = composeNpcMovementRoute({
      currentPosition: { x: 0, y: 8, z: 0 },
      currentContext: WORLD_SPATIAL_CONTEXT_SURFACE,
      target: caveTarget(CAVE_A, HOME_A),
      queries: fakeQueries({ resolveHabitat }),
      entityHeight: 1.75,
    })!
    expect(resolveHabitat).toHaveBeenCalledWith(CAVE_A, 1.75)
    expect(resolveHabitat).not.toHaveBeenCalledWith(CAVE_B, expect.anything())
    const enter = route.legs[0] as Extract<NpcRouteLeg, { kind: 'enterCave' }>
    expect(enter.approach).toEqual(ENTRANCE_A)
    expect(enter.approach).not.toEqual(ENTRANCE_B)
  })

  it('still composes when cave queries have no presentation API', () => {
    const queries = fakeQueries()
    expect('peekStreamingDebug' in queries).toBe(false)
    expect(composeNpcMovementRoute({
      currentPosition: { x: 0, y: 8, z: 30 },
      currentContext: WORLD_SPATIAL_CONTEXT_SURFACE,
      target: caveTarget(CAVE_A, HOME_A),
      queries,
      entityHeight: 1.75,
    })).not.toBeNull()
  })

  it('does not invent a geometric interior leg when topology is disconnected', () => {
    const from = { ...HOME_A }
    const to = { x: 200, y: -8, z: 200 }
    const route = composeNpcMovementRoute({
      currentPosition: from,
      currentContext: caveSpatialContext(CAVE_A),
      target: caveTarget(CAVE_A, to),
      queries: fakeQueries({
        resolveRouteBetweenPoints: () => null,
      }),
      entityHeight: 1.75,
    })
    expect(route).toBeNull()
  })
})

describe('mouth transition policy (plan npc-027 stage 2)', () => {
  const enter: Extract<NpcRouteLeg, { kind: 'enterCave' }> = {
    kind: 'enterCave',
    caveId: CAVE_A,
    approach: ENTRANCE_A,
    inward: INWARD_A,
  }

  it('does not treat mouth proximity as cave membership', () => {
    expect(isMouthTransitionConfirmed(enter, WORLD_SPATIAL_CONTEXT_SURFACE)).toBe(false)
    const atMouth = nextNpcRouteSteer(
      {
        finalTarget: caveTarget(CAVE_A, HOME_A),
        legs: [enter, { kind: 'move', point: HOME_A }],
      },
      INITIAL_NPC_ROUTE_EXECUTION,
      { ...ENTRANCE_A },
      WORLD_SPATIAL_CONTEXT_SURFACE,
      0.55,
    )
    expect(atMouth.complete).toBe(false)
    expect(atMouth.execution.mouthPhase).toBe('crossing')
    expect(atMouth.steer).toEqual(INWARD_A)
  })

  it('confirms the enter leg only after spatialContextAt reports the cave', () => {
    const crossing = nextNpcRouteSteer(
      {
        finalTarget: caveTarget(CAVE_A, HOME_A),
        legs: [enter, { kind: 'move', point: HOME_A }],
      },
      { legIndex: 0, mouthPhase: 'crossing' },
      { ...INWARD_A },
      caveSpatialContext(CAVE_A),
      0.55,
    )
    expect(crossing.execution.legIndex).toBeGreaterThan(0)
    expect(isMouthTransitionConfirmed(enter, caveSpatialContext(CAVE_A))).toBe(true)
  })
})
