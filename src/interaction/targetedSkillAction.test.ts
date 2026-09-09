import { describe, expect, it } from 'vitest'
import type { PlacedTrapRecord, TrapState } from '../world/animalTraps'
import type { Interactable } from './Interactable'
import {
  executeTargetedSkillAction,
  queryTargetedSkillAction,
  targetedSkillPrompt,
  type TargetedSkillQueryContext,
} from './targetedSkillAction'

function trapTarget(id = 'trap-1', state: TrapState = 'placed'): Extract<Interactable, { kind: 'trap' }> {
  return {
    kind: 'trap',
    position: { x: 0, z: 0 },
    promptLabel: '[E] Uzbrój',
    id,
    trapKind: 'simple',
    state,
  }
}

function trapRecord(overrides: Partial<PlacedTrapRecord> = {}): PlacedTrapRecord {
  return {
    id: 'trap-1',
    kind: 'simple',
    x: 0,
    z: 0,
    yaw: 0,
    state: 'placed',
    durability: 2,
    skillAtActivation: 0.2,
    weatherCheckedAtDay: 0,
    baitKind: null,
    ...overrides,
  }
}

function contextWith(trap: PlacedTrapRecord | null): TargetedSkillQueryContext {
  const traps = new Map<string, PlacedTrapRecord>()
  if (trap) traps.set(trap.id, trap)
  return {
    getTrap: (id) => traps.get(id) ?? null,
  }
}

describe('queryTargetedSkillAction (plan items-player-021)', () => {
  it('offers inspect for Traps on a live placed trap and does not mutate it', () => {
    const trap = trapRecord({ durability: 1.4, baitKind: 'berries' })
    const ctx = contextWith(trap)
    const action = queryTargetedSkillAction('traps', trapTarget(), ctx)
    expect(action).toEqual({
      id: 'inspect-trap',
      skill: 'traps',
      targetId: 'trap-1',
      targetKind: 'trap',
      promptLabel: '[E] Sprawdź: prosta pułapka',
    })
    expect(trap.durability).toBe(1.4)
    expect(trap.state).toBe('placed')
    expect(trap.baitKind).toBe('berries')
  })

  it('returns no action for an incompatible skill or target', () => {
    const ctx = contextWith(trapRecord())
    expect(queryTargetedSkillAction('repair', trapTarget(), ctx)).toBeNull()
    expect(queryTargetedSkillAction('medicine', trapTarget(), ctx)).toBeNull()
    expect(queryTargetedSkillAction('traps', {
      kind: 'item',
      position: { x: 0, z: 0 },
      promptLabel: 'item',
      item: { id: 'x', kind: 'stone', source: 'world' },
    }, ctx)).toBeNull()
  })

  it('returns no action when the trap record is gone', () => {
    expect(queryTargetedSkillAction('traps', trapTarget(), contextWith(null))).toBeNull()
  })
})

describe('executeTargetedSkillAction (plan items-player-021)', () => {
  it('reports live trap state without XP or mutation', () => {
    const trap = trapRecord({ state: 'active', durability: 1.4, baitKind: 'raw_meat' })
    const result = executeTargetedSkillAction('traps', trapTarget(trap.id, 'active'), contextWith(trap))
    expect(result).toEqual({
      ok: true,
      title: 'Prosta pułapka',
      line: 'Stan: uzbrojona\nWytrzymałość: 1.4/2\nPrzynęta: surowe mięso',
    })
    expect(trap.durability).toBe(1.4)
    expect(trap.state).toBe('active')
    expect(trap.baitKind).toBe('raw_meat')
  })

  it('revalidates against live domain state between query and execute', () => {
    const trap = trapRecord()
    const traps = new Map<string, PlacedTrapRecord>([[trap.id, trap]])
    const ctx: TargetedSkillQueryContext = { getTrap: (id) => traps.get(id) ?? null }
    const queried = queryTargetedSkillAction('traps', trapTarget(), ctx)
    expect(queried).not.toBeNull()
    traps.delete(trap.id)
    expect(executeTargetedSkillAction('traps', trapTarget(), ctx)).toEqual({
      ok: false,
      reason: 'unavailable',
    })
  })

  it('reads the current durability if the record changed after targeting', () => {
    const trap = trapRecord({ durability: 2 })
    const traps = new Map<string, PlacedTrapRecord>([[trap.id, { ...trap }]])
    const ctx: TargetedSkillQueryContext = { getTrap: (id) => traps.get(id) ?? null }
    queryTargetedSkillAction('traps', trapTarget(), ctx)
    traps.set(trap.id, { ...trap, durability: 0.5, state: 'broken', baitKind: null })
    const result = executeTargetedSkillAction('traps', trapTarget(trap.id, 'broken'), ctx)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.line).toContain('Stan: zniszczona')
      expect(result.line).toContain('Wytrzymałość: 0.5/2')
    }
  })
})

describe('targetedSkillPrompt', () => {
  it('uses the resolved action label when one exists', () => {
    const action = queryTargetedSkillAction('traps', trapTarget(), contextWith(trapRecord()))
    expect(targetedSkillPrompt('traps', action, true)).toBe('[E] Sprawdź: prosta pułapka')
  })

  it('explains missing actions without falling back to the world prompt', () => {
    expect(targetedSkillPrompt('repair', null, true)).toBe('Naprawa — brak akcji')
    expect(targetedSkillPrompt('medicine', null, false)).toBe('Medycyna — wybierz cel')
  })
})
