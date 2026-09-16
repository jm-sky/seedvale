import { describe, expect, it, vi } from 'vitest'
import type { NpcPlannedAction } from './npcAction'
import {
  caveSpatialContext,
  spatialContextsEqual,
  WORLD_SPATIAL_CONTEXT_SURFACE,
} from '../world/spatialContext'
import { promoteChainKind } from './NpcAgent'
import {
  commitNpcMovementTarget,
  movementTargetsEqual,
  normalizeNpcMovementTarget,
} from './npcMovementTarget'

function surfaceAction(overrides: Partial<NpcPlannedAction> = {}): NpcPlannedAction {
  return {
    kind: 'work',
    destination: { x: 10, y: 5.2, z: -3 },
    durationSec: 1,
    onComplete: () => {},
    ...overrides,
  }
}

describe('npcMovementTarget (plan npc-027 stage 1)', () => {
  it('normalizes legacy surface destination to surface context', () => {
    const spatialContextAt = vi.fn(() => WORLD_SPATIAL_CONTEXT_SURFACE)
    const target = normalizeNpcMovementTarget(surfaceAction(), spatialContextAt)
    expect(target.context).toEqual({ kind: 'surface' })
    expect(spatialContextAt).toHaveBeenCalledWith(10, 5.2, -3)
  })

  it('preserves authoritative cave target Y', () => {
    const spatialContextAt = vi.fn(() => WORLD_SPATIAL_CONTEXT_SURFACE)
    const caveY = -12.75
    const target = commitNpcMovementTarget(
      surfaceAction({
        destination: { x: 4, y: caveY, z: 8 },
        destinationContext: caveSpatialContext('mine-a'),
      }),
      spatialContextAt,
    )
    expect(target.position.y).toBe(caveY)
    expect(spatialContextAt).not.toHaveBeenCalled()
  })

  it('preserves requested caveId on explicit destinationContext', () => {
    const target = commitNpcMovementTarget(
      surfaceAction({
        destinationContext: caveSpatialContext('adventure-cave-7'),
      }),
      () => WORLD_SPATIAL_CONTEXT_SURFACE,
    )
    expect(target.context).toEqual({ kind: 'cave', caveId: 'adventure-cave-7' })
  })

  it('compares spatial context by semantics, not object identity', () => {
    const a = {
      position: { x: 1, y: 2, z: 3 },
      context: { kind: 'cave' as const, caveId: 'A' },
    }
    const b = {
      position: { x: 1, y: 2, z: 3 },
      context: caveSpatialContext('A'),
    }
    expect(spatialContextsEqual(a.context, b.context)).toBe(true)
    expect(movementTargetsEqual(a, b)).toBe(true)
    expect(a.context).not.toBe(b.context)
  })

  it('keeps cave semantics when a chained next leg is promoted and committed', () => {
    const mineLeg = surfaceAction({ kind: 'mine' })
    const depositLeg: NpcPlannedAction = {
      kind: 'deposit',
      destination: { x: 1, y: -9.5, z: 2 },
      destinationContext: caveSpatialContext('natural-1'),
      durationSec: 0.5,
      onComplete: () => {},
      chainKind: promoteChainKind(mineLeg),
    }
    mineLeg.next = depositLeg

    const committed = commitNpcMovementTarget(depositLeg, () => WORLD_SPATIAL_CONTEXT_SURFACE)
    expect(committed.context).toEqual({ kind: 'cave', caveId: 'natural-1' })
    expect(committed.position.y).toBe(-9.5)
    expect(depositLeg.chainKind).toBe('mine')
  })

  it('does not mutate a committed snapshot when action.destination changes', () => {
    const action = surfaceAction({ destination: { x: 0, y: 1, z: 0 } })
    const committed = commitNpcMovementTarget(action, () => WORLD_SPATIAL_CONTEXT_SURFACE)
    action.destination.x = 99
    action.destination.y = -50
    expect(committed.position).toEqual({ x: 0, y: 1, z: 0 })
    expect(committed.context).toBe(WORLD_SPATIAL_CONTEXT_SURFACE)
  })
})
