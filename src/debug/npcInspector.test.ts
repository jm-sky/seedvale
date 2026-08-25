import { describe, expect, it } from 'vitest'
import type { NpcInspectionSnapshot } from '../ai/NpcAgent'
import { matchesNpcFilter } from './npcInspector'

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
