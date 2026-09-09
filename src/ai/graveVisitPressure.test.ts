import { describe, expect, it } from 'vitest'
import type { NpcDecisionTarget } from './weatherPressure'
import { createNpcStateRegistry } from '../settlement/npcState'
import { damageHealth } from '../shared/HealthState'
import { pickActionKind } from '../simulation'
import { graveIdForDeceased, type NpcGraves } from '../world/npcGraves'
import {
  getLastGraveVisitAtDays,
  GRAVE_VISIT_COOLDOWN_DAYS,
  GRAVE_VISIT_PRESSURE,
  graveVisitOpportunity,
  isGraveVisitCooldownExpired,
  recordGraveVisit,
  resolveGraveVisitPressure,
} from './graveVisitPressure'
import { decideNpcAction } from './npcDecision'

function makeGraves(records: Array<{ deceasedNpcId: string, x: number, z: number, yaw?: number }>): NpcGraves {
  const byDeceased = new Map(records.map((r) => [r.deceasedNpcId, r]))
  return {
    hasForDeceased: (deceasedNpcId: string) => byDeceased.has(deceasedNpcId),
    get: (id: string) => {
      const deceasedNpcId = id.startsWith('grave:') ? id.slice('grave:'.length) : id
      const record = byDeceased.get(deceasedNpcId)
      if (!record) return null
      return {
        id: graveIdForDeceased(deceasedNpcId),
        deceasedNpcId,
        x: record.x,
        z: record.z,
        yaw: record.yaw ?? 0,
        buriedAtDays: 1,
      }
    },
    nodes: () => [],
    ensure: () => false,
    dispose: () => {},
  }
}

describe('resolveGraveVisitPressure (plan npc-026)', () => {
  it('returns a bounded candidate for a living same-family NPC with a persistent grave', () => {
    const registry = createNpcStateRegistry()
    const visitor = registry.getOrCreate('0_0:npc:1', 0)
    const deceased = registry.getOrCreate('0_0:npc:0', 0)
    damageHealth(deceased.health, deceased.health.maxHp)

    const hooks = {
      familyNpcIds: () => ['0_0:npc:0'],
      getNpcState: (id: string) => registry.get(id),
      graves: makeGraves([{ deceasedNpcId: '0_0:npc:0', x: 4, z: 6 }]),
    }

    let result = { score: 0, candidate: null as ReturnType<typeof resolveGraveVisitPressure>['candidate'] }
    for (let day = 0; day < 120 && !result.candidate; day += 0.5) {
      result = resolveGraveVisitPressure('0_0:npc:1', visitor, hooks, day)
    }

    expect(result.score).toBe(GRAVE_VISIT_PRESSURE)
    expect(result.candidate?.deceasedNpcId).toBe('0_0:npc:0')
    expect(result.candidate?.graveId).toBe(graveIdForDeceased('0_0:npc:0'))
    expect(result.candidate?.x).toBe(4)
    expect(result.candidate?.z).toBe(6)
  })

  it('does not return a candidate for unrelated NPCs or graves that do not exist', () => {
    const registry = createNpcStateRegistry()
    const visitor = registry.getOrCreate('0_0:npc:2', 0)
    const deceased = registry.getOrCreate('0_0:npc:0', 0)
    damageHealth(deceased.health, deceased.health.maxHp)

    const noFamily = resolveGraveVisitPressure('0_0:npc:2', visitor, {
      familyNpcIds: () => [],
      getNpcState: (id) => registry.get(id),
      graves: makeGraves([{ deceasedNpcId: '0_0:npc:0', x: 1, z: 2 }]),
    }, 10)
    expect(noFamily.score).toBe(0)

    const noGrave = resolveGraveVisitPressure('0_0:npc:1', registry.getOrCreate('0_0:npc:1', 0), {
      familyNpcIds: () => ['0_0:npc:0'],
      getNpcState: (id) => registry.get(id),
      graves: makeGraves([]),
    }, 10)
    expect(noGrave.score).toBe(0)
  })

  it('uses stable grave id lookup, not cemetery selection', () => {
    const registry = createNpcStateRegistry()
    const visitor = registry.getOrCreate('0_0:npc:1', 0)
    const deceased = registry.getOrCreate('0_0:npc:0', 0)
    damageHealth(deceased.health, deceased.health.maxHp)

    const graves = makeGraves([{ deceasedNpcId: '0_0:npc:0', x: 99, z: -12 }])
    let result = resolveGraveVisitPressure('0_0:npc:1', visitor, {
      familyNpcIds: () => ['0_0:npc:0'],
      getNpcState: (id) => registry.get(id),
      graves,
    }, 0)
    for (let day = 0; day < 120 && !result.candidate; day += 0.5) {
      result = resolveGraveVisitPressure('0_0:npc:1', visitor, {
        familyNpcIds: () => ['0_0:npc:0'],
        getNpcState: (id) => registry.get(id),
        graves,
      }, day)
    }

    expect(result.candidate?.graveId).toBe('grave:0_0:npc:0')
    expect(result.candidate?.x).toBe(99)
    expect(result.candidate?.z).toBe(-12)
  })
})

describe('grave visit cooldown persistence (plan npc-026)', () => {
  it('records per-deceased visits and blocks until cooldown expires', () => {
    const registry = createNpcStateRegistry()
    const visitor = registry.getOrCreate('0_0:npc:1', 0)
    recordGraveVisit(visitor.graveVisits, '0_0:npc:0', 5)
    expect(getLastGraveVisitAtDays(visitor.graveVisits, '0_0:npc:0')).toBe(5)
    expect(isGraveVisitCooldownExpired(visitor.graveVisits, '0_0:npc:0', 5)).toBe(false)
    expect(isGraveVisitCooldownExpired(visitor.graveVisits, '0_0:npc:0', 5 + GRAVE_VISIT_COOLDOWN_DAYS)).toBe(true)

    const roundTrip = createNpcStateRegistry({ '0_0:npc:1': registry.serialize()['0_0:npc:1']! })
    expect(getLastGraveVisitAtDays(roundTrip.getOrCreate('0_0:npc:1', 0).graveVisits, '0_0:npc:0')).toBe(5)
  })
})

describe('grave visit arbitration (plan npc-026)', () => {
  it('visitGrave can beat idle but loses to scheduled sleep and real needs', () => {
    expect(decideNpcAction({
      collapsing: false,
      wonNeed: 'visitGrave',
      scheduleActivity: 'work',
    })).toBe('visitGrave')
    expect(decideNpcAction({
      collapsing: false,
      wonNeed: 'visitGrave',
      scheduleActivity: 'sleep',
    })).toBe('scheduledSleep')

    const winner = pickActionKind<NpcDecisionTarget>(
      [{ kind: 'food', score: 0.5 }, { kind: 'visitGrave', score: GRAVE_VISIT_PRESSURE }],
      'idle',
    )
    expect(winner).toBe('food')

    const idleWinner = pickActionKind<NpcDecisionTarget>(
      [{ kind: 'idle', score: 0 }, { kind: 'visitGrave', score: GRAVE_VISIT_PRESSURE }],
      'idle',
    )
    expect(idleWinner).toBe('visitGrave')
  })

  it('opportunity gate is deterministic for the same inputs', () => {
    expect(graveVisitOpportunity('a', 'b', 12)).toBe(graveVisitOpportunity('a', 'b', 12))
    expect(graveVisitOpportunity('a', 'b', 12)).not.toBe(graveVisitOpportunity('a', 'b', 15))
  })
})
