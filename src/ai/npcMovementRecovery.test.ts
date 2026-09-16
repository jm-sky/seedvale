import { describe, expect, it } from 'vitest'
import type { NpcWorldMovementQueries } from './npcMovementTarget'
import { PLAYER_COLLISION_RADIUS } from '../player/playerDimensions'
import {
  caveSpatialContext,
  WORLD_SPATIAL_CONTEXT_SURFACE,
} from '../world/spatialContext'
import { NPC_HEIGHT } from './NpcAgent'
import {
  allowsEmergencySurfaceReposition,
  CAVE_RECOVERY_SEQUENCE,
  placeNpcAfterTimeSkip,
  sampleCaveLocalEscape,
  usesCaveRecoveryDomain,
} from './npcMovementRecovery'
import { INITIAL_NPC_ROUTE_EXECUTION } from './npcMovementRoute'

const CAVE_ID = 'cave-a'
const CAVE_FLOOR = -11.5
const SURFACE_Y = 42

function caveQueries(overrides: Partial<NpcWorldMovementQueries> = {}): NpcWorldMovementQueries {
  return {
    spatialContextAt: (_x, y) => (y < 0 ? caveSpatialContext(CAVE_ID) : WORLD_SPATIAL_CONTEXT_SURFACE),
    resolveHabitat: () => null,
    resolveRouteBetweenPoints: () => null,
    queryGroundIn: (caveId, x, y, z) => {
      if (caveId !== CAVE_ID) return null
      if (Math.hypot(x, z) > 8) return null
      if (y > 0) return null
      return { floorY: CAVE_FLOOR, ceilingY: CAVE_FLOOR + 4, intervals: [{ floorY: CAVE_FLOOR, ceilingY: CAVE_FLOOR + 4 }] }
    },
    resolveHorizontalIn: (_caveId, x, z) => {
      const dist = Math.hypot(x, z)
      if (dist <= 8) return { x, z }
      const s = 7.5 / dist
      return { x: x * s, z: z * s }
    },
    ...overrides,
  }
}

describe('npcMovementRecovery domain gates (plan npc-027 stage 4)', () => {
  it('uses cave recovery in cave membership or mouth crossing, not mere approach', () => {
    expect(usesCaveRecoveryDomain(WORLD_SPATIAL_CONTEXT_SURFACE, null)).toBe(false)
    expect(usesCaveRecoveryDomain(WORLD_SPATIAL_CONTEXT_SURFACE, 'approach')).toBe(false)
    expect(usesCaveRecoveryDomain(WORLD_SPATIAL_CONTEXT_SURFACE, 'crossing')).toBe(true)
    expect(usesCaveRecoveryDomain(caveSpatialContext(CAVE_ID), null)).toBe(true)
  })

  it('forbids emergency surface teleport underground and during mouth crossing', () => {
    expect(allowsEmergencySurfaceReposition(WORLD_SPATIAL_CONTEXT_SURFACE, null)).toBe(true)
    expect(allowsEmergencySurfaceReposition(caveSpatialContext(CAVE_ID), null)).toBe(false)
    expect(allowsEmergencySurfaceReposition(WORLD_SPATIAL_CONTEXT_SURFACE, 'crossing')).toBe(false)
  })

  it('documents cave recovery order: retry, rebuild, local escape, then abandon', () => {
    expect(CAVE_RECOVERY_SEQUENCE).toEqual([
      'retry-current-leg',
      'rebuild-route',
      'local-escape',
      'abandon',
    ])
  })
})

describe('sampleCaveLocalEscape (plan npc-027 stage 4)', () => {
  it('stays in the same cave and never returns surface Y at the same X/Z', () => {
    const queries = caveQueries()
    const found = sampleCaveLocalEscape({
      caveId: CAVE_ID,
      x: 0,
      y: CAVE_FLOOR,
      z: 0,
      queries,
      entityHeight: NPC_HEIGHT,
      radius: PLAYER_COLLISION_RADIUS,
      radii: [2],
      samplesPerRing: 4,
    })
    expect(found).not.toBeNull()
    expect(found!.y).toBe(CAVE_FLOOR)
    expect(found!.y).not.toBe(SURFACE_Y)
    expect(queries.spatialContextAt(found!.x, found!.y, found!.z)).toEqual(caveSpatialContext(CAVE_ID))
    expect(queries.spatialContextAt(found!.x, SURFACE_Y, found!.z)).toEqual(WORLD_SPATIAL_CONTEXT_SURFACE)
  })

  it('rejects a hop that would leave the cave void', () => {
    const queries = caveQueries({
      queryGroundIn: () => null,
    })
    expect(sampleCaveLocalEscape({
      caveId: CAVE_ID,
      x: 0,
      y: CAVE_FLOOR,
      z: 0,
      queries,
      entityHeight: NPC_HEIGHT,
    })).toBeNull()
  })
})

describe('placeNpcAfterTimeSkip (plan npc-027 stage 4)', () => {
  const queries = caveQueries()
  const sampleHeight = () => SURFACE_Y

  it('holds the current cave-valid endpoint instead of executing a cave route or surface-projecting', () => {
    const placed = placeNpcAfterTimeSkip({
      current: { x: 1.2, y: CAVE_FLOOR, z: -0.4 },
      scheduleTarget: { x: 80, z: 90 },
      currentContext: caveSpatialContext(CAVE_ID),
      mouthPhase: null,
      route: null,
      execution: INITIAL_NPC_ROUTE_EXECUTION,
      queries,
      sampleHeight,
    })
    expect(placed.policy).toBe('hold-cave-endpoint')
    expect(placed.x).toBe(1.2)
    expect(placed.z).toBe(-0.4)
    expect(placed.y).toBe(CAVE_FLOOR)
    expect(placed.y).not.toBe(SURFACE_Y)
  })

  it('keeps existing surface schedule placement when the NPC is on the surface', () => {
    const placed = placeNpcAfterTimeSkip({
      current: { x: 3, y: SURFACE_Y, z: 4 },
      scheduleTarget: { x: 10, z: 12 },
      currentContext: WORLD_SPATIAL_CONTEXT_SURFACE,
      mouthPhase: null,
      route: null,
      execution: INITIAL_NPC_ROUTE_EXECUTION,
      queries,
      sampleHeight,
    })
    expect(placed.policy).toBe('surface-schedule')
    expect(placed).toEqual({ x: 10, y: SURFACE_Y, z: 12, policy: 'surface-schedule' })
  })

  it('does not surface-project during mouth crossing', () => {
    const placed = placeNpcAfterTimeSkip({
      current: { x: 2, y: 1, z: 2 },
      scheduleTarget: { x: 0, z: 0 },
      currentContext: WORLD_SPATIAL_CONTEXT_SURFACE,
      mouthPhase: 'crossing',
      route: {
        legs: [{
          kind: 'enterCave',
          caveId: CAVE_ID,
          approach: { x: 0, y: 8, z: 0 },
          inward: { x: 0, y: CAVE_FLOOR, z: -4 },
        }],
      },
      execution: { legIndex: 0, mouthPhase: 'crossing' },
      queries,
      sampleHeight,
    })
    expect(placed.policy).toBe('hold-cave-endpoint')
    expect(placed.x).toBe(2)
    expect(placed.z).toBe(2)
    expect(placed.y).not.toBe(SURFACE_Y)
  })
})
