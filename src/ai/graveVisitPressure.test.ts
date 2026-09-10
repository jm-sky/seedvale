import { describe, expect, it } from 'vitest'
import { createNpcStateRegistry } from '../settlement/npcState'
import { damageHealth } from '../shared/HealthState'
import { pickActionKind } from '../simulation'
import { graveIdForDeceased, type NpcGraves } from '../world/npcGraves'
import { WEATHER_SEVERE_SHELTER_THRESHOLD, type NpcDecisionTarget } from './weatherPressure'
import {
  getLastGraveVisitAtDays,
  GRAVE_VISIT_COOLDOWN_DAYS,
  GRAVE_VISIT_PRESSURE,
  graveVisitOpportunity,
  isGraveVisitCooldownExpired,
  recordGraveVisit,
  resolveGraveVisitPressure,
  revalidateGraveVisitCandidate,
  type GraveVisitCandidate,
} from './graveVisitPressure'
import { decideNpcAction, shouldInterruptAction } from './npcDecision'

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

function resolveWhenOpportunity(
  visitorId: string,
  visitor: ReturnType<ReturnType<typeof createNpcStateRegistry>['getOrCreate']>,
  hooks: Parameters<typeof resolveGraveVisitPressure>[2],
  startDays = 0,
): ReturnType<typeof resolveGraveVisitPressure> {
  let result = resolveGraveVisitPressure(visitorId, visitor, hooks, startDays)
  for (let day = startDays; day < startDays + 120 && !result.candidate; day += 0.5) {
    result = resolveGraveVisitPressure(visitorId, visitor, hooks, day)
  }
  return result
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

    const result = resolveWhenOpportunity('0_0:npc:1', visitor, hooks)

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

  it('does not return a candidate for a living same-family member', () => {
    const registry = createNpcStateRegistry()
    const visitor = registry.getOrCreate('0_0:npc:1', 0)
    registry.getOrCreate('0_0:npc:0', 0)

    const result = resolveGraveVisitPressure('0_0:npc:1', visitor, {
      familyNpcIds: () => ['0_0:npc:0'],
      getNpcState: (id) => registry.get(id),
      graves: makeGraves([{ deceasedNpcId: '0_0:npc:0', x: 1, z: 2 }]),
    }, 10)
    expect(result.score).toBe(0)
    expect(result.candidate).toBeNull()
  })

  it('does not write cooldown while resolving a candidate', () => {
    const registry = createNpcStateRegistry()
    const visitor = registry.getOrCreate('0_0:npc:1', 0)
    const deceased = registry.getOrCreate('0_0:npc:0', 0)
    damageHealth(deceased.health, deceased.health.maxHp)

    const hooks = {
      familyNpcIds: () => ['0_0:npc:0'] as const,
      getNpcState: (id: string) => registry.get(id),
      graves: makeGraves([{ deceasedNpcId: '0_0:npc:0', x: 4, z: 6 }]),
    }
    const result = resolveWhenOpportunity('0_0:npc:1', visitor, hooks)
    expect(result.candidate).not.toBeNull()
    expect(visitor.graveVisits).toEqual([])
  })

  it('uses stable grave id lookup, not cemetery selection', () => {
    const registry = createNpcStateRegistry()
    const visitor = registry.getOrCreate('0_0:npc:1', 0)
    const deceased = registry.getOrCreate('0_0:npc:0', 0)
    damageHealth(deceased.health, deceased.health.maxHp)

    const graves = makeGraves([{ deceasedNpcId: '0_0:npc:0', x: 99, z: -12 }])
    const result = resolveWhenOpportunity('0_0:npc:1', visitor, {
      familyNpcIds: () => ['0_0:npc:0'],
      getNpcState: (id) => registry.get(id),
      graves,
    })

    expect(result.candidate?.graveId).toBe('grave:0_0:npc:0')
    expect(result.candidate?.x).toBe(99)
    expect(result.candidate?.z).toBe(-12)
  })

  it('drops a candidate when the stable grave lookup fails', () => {
    const registry = createNpcStateRegistry()
    const deceased = registry.getOrCreate('0_0:npc:0', 0)
    damageHealth(deceased.health, deceased.health.maxHp)
    const candidate: GraveVisitCandidate = {
      deceasedNpcId: '0_0:npc:0',
      graveId: graveIdForDeceased('0_0:npc:0'),
      x: 4,
      z: 6,
      yaw: 0,
    }
    const hooks = {
      familyNpcIds: () => ['0_0:npc:0'] as const,
      getNpcState: (id: string) => registry.get(id),
      graves: makeGraves([{ deceasedNpcId: '0_0:npc:0', x: 4, z: 6 }]),
    }
    expect(revalidateGraveVisitCandidate(candidate, hooks)?.graveId).toBe(candidate.graveId)
    expect(revalidateGraveVisitCandidate(candidate, { ...hooks, graves: makeGraves([]) })).toBeNull()
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

  it('does not let visiting one family grave suppress another', () => {
    const registry = createNpcStateRegistry()
    const visitor = registry.getOrCreate('0_0:npc:2', 0)
    const first = registry.getOrCreate('0_0:npc:0', 0)
    const second = registry.getOrCreate('0_0:npc:1', 0)
    damageHealth(first.health, first.health.maxHp)
    damageHealth(second.health, second.health.maxHp)
    recordGraveVisit(visitor.graveVisits, '0_0:npc:0', 5)

    const hooks = {
      familyNpcIds: () => ['0_0:npc:0', '0_0:npc:1'] as const,
      getNpcState: (id: string) => registry.get(id),
      graves: makeGraves([
        { deceasedNpcId: '0_0:npc:0', x: 1, z: 1 },
        { deceasedNpcId: '0_0:npc:1', x: 8, z: 3 },
      ]),
    }
    const result = resolveWhenOpportunity('0_0:npc:2', visitor, hooks, 5)
    expect(result.candidate?.deceasedNpcId).toBe('0_0:npc:1')
  })

  it('expires cooldown lazily from larger elapsedDays after unload or time-skip', () => {
    const registry = createNpcStateRegistry()
    const visitor = registry.getOrCreate('0_0:npc:1', 0)
    const deceased = registry.getOrCreate('0_0:npc:0', 0)
    damageHealth(deceased.health, deceased.health.maxHp)
    recordGraveVisit(visitor.graveVisits, '0_0:npc:0', 2)

    const hooks = {
      familyNpcIds: () => ['0_0:npc:0'] as const,
      getNpcState: (id: string) => registry.get(id),
      graves: makeGraves([{ deceasedNpcId: '0_0:npc:0', x: 4, z: 6 }]),
    }
    expect(resolveGraveVisitPressure('0_0:npc:1', visitor, hooks, 2).candidate).toBeNull()

    const afterSkip = createNpcStateRegistry({ '0_0:npc:1': registry.serialize()['0_0:npc:1']! })
    const restored = afterSkip.getOrCreate('0_0:npc:1', 0)
    const later = 2 + GRAVE_VISIT_COOLDOWN_DAYS
    const result = resolveWhenOpportunity('0_0:npc:1', restored, {
      ...hooks,
      getNpcState: (id) => id === '0_0:npc:1' ? restored : registry.get(id),
    }, later)
    expect(result.candidate?.deceasedNpcId).toBe('0_0:npc:0')
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

    expect(pickActionKind<NpcDecisionTarget>(
      [{ kind: 'heal', score: 0.72 }, { kind: 'visitGrave', score: GRAVE_VISIT_PRESSURE }],
      'idle',
    )).toBe('heal')
    expect(pickActionKind<NpcDecisionTarget>(
      [{ kind: 'seekShelter', score: 0.5 }, { kind: 'visitGrave', score: GRAVE_VISIT_PRESSURE }],
      'idle',
    )).toBe('seekShelter')
  })

  it('visitGrave stays interruptible because it is not a Need (activeNeed remains idle)', () => {
    expect(shouldInterruptAction({
      collapsing: false,
      activeNeed: 'idle',
      criticalNeed: 'food',
      weatherPressure: 0,
    })).toBe(true)
    expect(shouldInterruptAction({
      collapsing: false,
      activeNeed: 'idle',
      criticalNeed: 'idle',
      weatherPressure: WEATHER_SEVERE_SHELTER_THRESHOLD,
    })).toBe(true)
  })

  it('opportunity gate is deterministic for the same inputs', () => {
    expect(graveVisitOpportunity('a', 'b', 12)).toBe(graveVisitOpportunity('a', 'b', 12))
    expect(graveVisitOpportunity('a', 'b', 12)).not.toBe(graveVisitOpportunity('a', 'b', 15))
  })
})
