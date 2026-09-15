import { describe, expect, it } from 'vitest'
import {
  createLiquidContainerInstance,
  fillLiquidContainer,
} from '../items/liquidContainer'
import { createNpcAuthoritativeState } from '../settlement/npcState'
import { applyInjurySeverityForDebug } from '../shared/injuryRecovery'
import { resolveNpcOffscreenTravelInterval } from './npcOffscreenSurvival'
import { beginOffscreenNpcTravel } from './npcTravel'
import { resolveNpcTravelCheckpoint } from './npcTravelCheckpoint'

const DAY = 600

describe('off-screen travel survival (plan settlements-npcs-028)', () => {
  it('advances hunger/thirst and consumes personal food/water from the same inventory', () => {
    const state = createNpcAuthoritativeState('npc:s', 0)
    state.needs.hunger = 0.3
    state.needs.thirst = 0.3
    state.personalInventory.add('bread', 4)
    const filled = fillLiquidContainer(createLiquidContainerInstance('waterskin_medium'), 'water')!
    state.personalInventory.addInstance(filled)
    const drinksBefore = filled.amountLitres
    const vigorBefore = state.vigor.current
    const result = resolveNpcOffscreenTravelInterval(state, 1, 1.2, DAY)
    expect(result.kind).toBe('continue')
    expect(state.personalInventory.count('bread')).toBeLessThan(4)
    const after = state.personalInventory.getInstance(filled.id)
    expect(after && 'amountLitres' in after ? after.amountLitres : drinksBefore).toBeLessThan(drinksBefore)
    expect(state.vigor.current).toBe(vigorBefore)
    expect(state.needs.hunger).toBeLessThan(0.9)
    expect(state.needs.thirst).toBeLessThan(0.9)
  })

  it('is idempotent for the same elapsed interval', () => {
    const state = createNpcAuthoritativeState('npc:s', 0)
    state.needs.hunger = 0.2
    state.personalInventory.add('bread', 6)
    resolveNpcOffscreenTravelInterval(state, 0, 0.15, DAY)
    const hunger = state.needs.hunger
    const bread = state.personalInventory.count('bread')
    resolveNpcOffscreenTravelInterval(state, 0.15, 0.15, DAY)
    expect(state.needs.hunger).toBe(hunger)
    expect(state.personalInventory.count('bread')).toBe(bread)
  })

  it('does not double-apply injury recovery across repeated checkpoints', () => {
    const state = createNpcAuthoritativeState('npc:s', 0)
    applyInjurySeverityForDebug(state, 'minor', 2)
    const injuryAfterFirst = state.physicalInjury
    resolveNpcOffscreenTravelInterval(state, 2, 3, DAY)
    const afterSkip = state.physicalInjury
    expect(afterSkip).toBeLessThanOrEqual(injuryAfterFirst)
    const hp = state.health.currentHp
    resolveNpcOffscreenTravelInterval(state, 3, 3, DAY)
    expect(state.physicalInjury).toBe(afterSkip)
    expect(state.health.currentHp).toBe(hp)
  })

  it('returns cannot-progress when hunger saturates without food', () => {
    const state = createNpcAuthoritativeState('npc:s', 0)
    state.needs.hunger = 0.98
    const result = resolveNpcOffscreenTravelInterval(state, 0, 0.2, DAY)
    expect(result.kind).toBe('cannot-progress')
    expect(state.needs.hunger).toBe(1)
  })

  it('split skips match one equivalent skip for provisions and position', () => {
    const make = () => {
      const state = createNpcAuthoritativeState('npc:s', 0)
      state.needs.hunger = 0.05
      state.needs.thirst = 0.05
      state.personalInventory.add('bread', 8)
      state.travel = beginOffscreenNpcTravel(
        { x: 0, z: 0 },
        { x: 200, z: 0 },
        0,
        DAY,
        {
          destination: { x: 200, z: 0 },
          lastPosition: { x: 0, z: 0 },
          purpose: { kind: 'expedition', assignmentId: 'exp:1' },
        },
      )
      return state
    }
    const oneShot = make()
    resolveNpcTravelCheckpoint(oneShot, 0.2, DAY)
    const split = make()
    resolveNpcTravelCheckpoint(split, 0.1, DAY)
    resolveNpcTravelCheckpoint(split, 0.2, DAY)
    expect(split.personalInventory.count('bread')).toBe(oneShot.personalInventory.count('bread'))
    expect(split.needs.hunger).toBeCloseTo(oneShot.needs.hunger, 5)
    expect(split.travel?.lastPosition.x).toBeCloseTo(oneShot.travel?.lastPosition.x ?? 0, 5)
    expect(split.travel?.execution?.departedAtDays).toBe(oneShot.travel?.execution?.departedAtDays)
  })

  it('observes member arrival exactly once after a covering skip', () => {
    const state = createNpcAuthoritativeState('npc:s', 0)
    state.travel = beginOffscreenNpcTravel(
      { x: 0, z: 0 },
      { x: 10, z: 0 },
      0,
      DAY,
      {
        destination: { x: 10, z: 0 },
        lastPosition: { x: 0, z: 0 },
        purpose: { kind: 'expedition', assignmentId: 'exp:1' },
      },
    )
    const arrives = state.travel.execution!.arrivesAtDays
    expect(resolveNpcTravelCheckpoint(state, arrives, DAY).kind).toBe('arrived')
    expect(resolveNpcTravelCheckpoint(state, arrives + 1, DAY).kind).toBe('arrived')
    expect(state.travel?.arrival).toBe('reached')
  })
})
