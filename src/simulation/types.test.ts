import { describe, expect, it } from 'vitest'
import { copyVec3, type DecisionContext, type PlannedAction, vec3 } from './types'

describe('vec3', () => {
  it('builds a plain position', () => {
    expect(vec3(1, 2, 3)).toEqual({ x: 1, y: 2, z: 3 })
  })

  it('copies from any xyz source', () => {
    expect(copyVec3({ x: 4, y: 5, z: 6 })).toEqual({ x: 4, y: 5, z: 6 })
  })
})

describe('PlannedAction / DecisionContext shapes', () => {
  it('allows chained planned actions without Three.js', () => {
    const plan: PlannedAction<'chop' | 'deposit'> = {
      kind: 'chop',
      destination: vec3(10, 0, 20),
      durationSec: 1.6,
      next: {
        kind: 'deposit',
        destination: vec3(0, 0, 0),
        durationSec: 0.8,
      },
    }
    expect(plan.next?.kind).toBe('deposit')
  })

  it('accepts a composable decision snapshot', () => {
    const ctx: DecisionContext = {
      entity: { id: 'npc-1', kind: 'npc' },
      needs: { thirst: 0.9, hunger: 0.2 },
      scheduleActivity: 'work',
      nearbyHumanCount: 1,
    }
    expect(ctx.needs?.thirst).toBe(0.9)
  })
})
