import { describe, expect, it } from 'vitest'
import type { NpcInspectionSnapshot } from '../ai/NpcAgent'
import type { DomainHistoryEnvelope } from './npcInspector'
import { matchesNpcFilter, sortDomainHistory } from './npcInspector'

function baseSnapshot(overrides: Partial<NpcInspectionSnapshot> = {}): NpcInspectionSnapshot {
  return {
    id: 'village-1:npc:0',
    name: 'Anna',
    displayName: 'Anna Kowalska',
    role: 'farmer',
    position: { x: 0, z: 0 },
    phase: 'choose',
    activity: { kind: 'idle' },
    needs: { thirst: 0.1, woodDuty: 0.1, waterDuty: 0.1, hunger: 0.1 },
    activeNeed: 'idle',
    pressures: [],
    strategyCandidates: [],
    selectedStrategy: null,
    plan: null,
    action: null,
    queue: null,
    watchdog: { rescueStage: 'none', lowProgressStrikes: 0, recentRescueCount: 0 },
    stamina: { current: 100, max: 100 },
    vigor: { current: 100, max: 100 },
    health: { current: 100, max: 100 },
    household: null,
    frozen: false,
    ...overrides,
  }
}

describe('matchesNpcFilter', () => {
  it('matches everything with an empty filter', () => {
    expect(matchesNpcFilter(baseSnapshot(), 'village-1', {})).toBe(true)
  })

  it('filters by id', () => {
    const snapshot = baseSnapshot({ id: 'village-1:npc:3' })
    expect(matchesNpcFilter(snapshot, 'village-1', { id: 'village-1:npc:3' })).toBe(true)
    expect(matchesNpcFilter(snapshot, 'village-1', { id: 'village-1:npc:4' })).toBe(false)
  })

  it('filters by settlementId', () => {
    const snapshot = baseSnapshot()
    expect(matchesNpcFilter(snapshot, 'village-1', { settlementId: 'village-1' })).toBe(true)
    expect(matchesNpcFilter(snapshot, 'village-2', { settlementId: 'village-1' })).toBe(false)
  })

  it('filters by active need', () => {
    const snapshot = baseSnapshot({ activeNeed: 'water' })
    expect(matchesNpcFilter(snapshot, 'village-1', { need: 'water' })).toBe(true)
    expect(matchesNpcFilter(snapshot, 'village-1', { need: 'food' })).toBe(false)
  })

  it('filters by phase', () => {
    const snapshot = baseSnapshot({ phase: 'goTo' })
    expect(matchesNpcFilter(snapshot, 'village-1', { phase: 'goTo' })).toBe(true)
    expect(matchesNpcFilter(snapshot, 'village-1', { phase: 'wander' })).toBe(false)
  })

  it('filters by queueId, requiring an active queue membership', () => {
    const queued = baseSnapshot({ queue: { id: 'village-1:well', position: 1, serving: false } })
    const idle = baseSnapshot()
    expect(matchesNpcFilter(queued, 'village-1', { queueId: 'village-1:well' })).toBe(true)
    expect(matchesNpcFilter(queued, 'village-1', { queueId: 'village-2:well' })).toBe(false)
    expect(matchesNpcFilter(idle, 'village-1', { queueId: 'village-1:well' })).toBe(false)
  })

  it('combines filters (all must match)', () => {
    const snapshot = baseSnapshot({ activeNeed: 'water', phase: 'goTo' })
    expect(matchesNpcFilter(snapshot, 'village-1', { need: 'water', phase: 'goTo' })).toBe(true)
    expect(matchesNpcFilter(snapshot, 'village-1', { need: 'water', phase: 'wander' })).toBe(false)
  })
})

function npcEnvelope(simTime: number, npcId = 'v:npc:0'): DomainHistoryEnvelope {
  return {
    scope: 'npc',
    type: 'action.completed',
    simTime,
    seq: null,
    npcId,
    householdId: null,
    settlementId: 'v',
    event: { simTime, type: 'action.completed', action: 'work' },
  }
}

function householdEnvelope(simTime: number, seq: number, householdId = 'v:household:0'): DomainHistoryEnvelope {
  return {
    scope: 'household',
    type: 'food.taken',
    simTime,
    seq,
    householdId,
    settlementId: 'v',
    event: { simTime, seq, type: 'food.taken', itemKind: 'bread' },
  }
}

function settlementEnvelope(simTime: number, seq: number): DomainHistoryEnvelope {
  return {
    scope: 'settlement',
    type: 'stock.added',
    simTime,
    seq,
    settlementId: 'v',
    event: { simTime, seq, type: 'stock.added', kind: 'iron', amount: 1 },
  }
}

describe('sortDomainHistory (plan settlements-npcs-013)', () => {
  it('sorts primarily by simTime, oldest first', () => {
    const sorted = sortDomainHistory([householdEnvelope(3, 0), npcEnvelope(1), settlementEnvelope(2, 0)])
    expect(sorted.map((e) => e.simTime)).toEqual([1, 2, 3])
  })

  it('breaks a simTime tie by scope: npc, then household, then settlement', () => {
    const sorted = sortDomainHistory([settlementEnvelope(5, 0), npcEnvelope(5), householdEnvelope(5, 0)])
    expect(sorted.map((e) => e.scope)).toEqual(['npc', 'household', 'settlement'])
  })

  it('breaks a same-scope/same-simTime tie by seq', () => {
    const sorted = sortDomainHistory([householdEnvelope(5, 2), householdEnvelope(5, 0), householdEnvelope(5, 1)])
    expect(sorted.map((e) => e.seq)).toEqual([0, 1, 2])
  })

  it('is deterministic regardless of Map/array iteration order — never relies on it', () => {
    const events = [settlementEnvelope(1, 0), npcEnvelope(1), householdEnvelope(1, 0), npcEnvelope(0)]
    const a = sortDomainHistory([...events])
    const b = sortDomainHistory([...events].reverse())
    expect(a).toEqual(b)
  })
})
