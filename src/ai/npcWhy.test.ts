import { describe, expect, it } from 'vitest'
import { type NpcInspectionSnapshot, projectNpcWhy } from './NpcAgent'

/** Concrete states from the plan 170 causal-output requirement: idle, a
 *  water need with no queue, well-queue waiting (blocked), and well-queue
 *  serving (not blocked) — verifying `projectNpcWhy` reflects authoritative
 *  snapshot state rather than inventing an explanation. */
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

describe('projectNpcWhy', () => {
  it('reports idle with no action/queue/blocked when nothing is active', () => {
    const why = projectNpcWhy(baseSnapshot(), null)
    expect(why).toEqual({
      need: { id: 'idle', value: null },
      phase: 'choose',
      action: null,
      queue: null,
      blocked: null,
    })
  })

  it('reports a water need with its live value and no queue when drinking at home', () => {
    const snapshot = baseSnapshot({
      activeNeed: 'water',
      phase: 'goTo',
      action: { kind: 'drink', destination: { x: 1, y: 0, z: 1 }, queueId: null, status: 'active' },
    })
    const why = projectNpcWhy(snapshot, 0.91)
    expect(why.need).toEqual({ id: 'water', value: 0.91 })
    expect(why.action).toEqual({ kind: 'drink', target: null })
    expect(why.queue).toBeNull()
    expect(why.blocked).toBeNull()
  })

  it('reports blocked while waiting in the well queue (not yet serving)', () => {
    const snapshot = baseSnapshot({
      activeNeed: 'water',
      phase: 'goTo',
      action: { kind: 'drink', destination: { x: 1, y: 0, z: 1 }, queueId: 'village-1:well', status: 'active' },
      queue: { id: 'village-1:well', position: 2, serving: false },
    })
    const why = projectNpcWhy(snapshot, 0.91)
    expect(why.queue).toEqual({ id: 'village-1:well', position: 2, serving: false })
    expect(why.blocked).toBe('waiting for queue slot')
  })

  it('is not blocked once promoted to serving', () => {
    const snapshot = baseSnapshot({
      activeNeed: 'water',
      phase: 'execute',
      action: { kind: 'drink', destination: { x: 1, y: 0, z: 1 }, queueId: 'village-1:well', status: 'active' },
      queue: { id: 'village-1:well', position: -1, serving: true },
    })
    const why = projectNpcWhy(snapshot, 0.91)
    expect(why.queue).toEqual({ id: 'village-1:well', position: -1, serving: true })
    expect(why.blocked).toBeNull()
  })
})
