import { describe, expect, it, vi } from 'vitest'
import type { TreatableTarget } from '../../player/medicalTreatment'
import type { PlayerActionContext } from './actionContext'
import { Inventory } from '../../items/Inventory'
import { MEDICAL_TREATMENT_DURATION_SEC } from '../../player/medicalTreatment'
import { createPlayerSkills, SKILL_XP_AWARD } from '../../player/PlayerSkills'
import { createBusyAction } from '../busyAction'
import { createMedicalTreatmentActions } from './medicalTreatmentActions'

function fakeTarget(overrides: Partial<{
  alive: boolean
  injury: number
  maxHp: number
  applyActual: number
  kind: TreatableTarget['kind']
  settlementId: string
  animalKind: TreatableTarget['animalKind']
}> = {}): TreatableTarget & {
  injury: number
  applyCalls: number[]
  setAlive: (value: boolean) => void
} {
  const state = {
    alive: overrides.alive ?? true,
    injury: overrides.injury ?? 40,
    maxHp: overrides.maxHp ?? 100,
    applyCalls: [] as number[],
    applyActual: overrides.applyActual,
  }
  return {
    id: 't1',
    kind: overrides.kind ?? 'self',
    label: 'siebie',
    isAlive: () => state.alive,
    getPhysicalInjury: () => state.injury,
    getMaxHp: () => state.maxHp,
    resolveInjuryRecovery: vi.fn(),
    applyTreatment: (requested) => {
      state.applyCalls.push(requested)
      if (state.applyActual != null) return state.applyActual
      const actual = Math.min(requested, state.injury)
      state.injury = Math.max(0, state.injury - actual)
      return actual
    },
    settlementId: overrides.settlementId,
    animalKind: overrides.animalKind,
    get injury() { return state.injury },
    set injury(v: number) { state.injury = v },
    get applyCalls() { return state.applyCalls },
    setAlive: (value: boolean) => { state.alive = value },
  }
}

function setup(inventoryCounts: Record<string, number> = {}) {
  const inventory = new Inventory(inventoryCounts as never, 100)
  const skills = createPlayerSkills()
  const toast = { show: vi.fn() }
  const busy = createBusyAction()
  const onPlayerMedicalTreatmentCompleted = vi.fn()
  const onAnimalTreatmentCompleted = vi.fn()
  const ctx = {
    inventory,
    player: { skills },
    toast,
    busy,
    hud: { setInventoryWeight: vi.fn() },
    timeSkip: { isActive: () => false },
    restCamp: { isActive: () => false },
    dayNight: { elapsedDays: 0 },
    onInventoryChanged: vi.fn(),
    refreshInventoryScreen: vi.fn(),
    onPlayerMedicalTreatmentCompleted,
    onAnimalTreatmentCompleted,
  } as unknown as PlayerActionContext
  return {
    actions: createMedicalTreatmentActions(ctx),
    inventory,
    skills,
    toast,
    busy,
    ctx,
    onPlayerMedicalTreatmentCompleted,
    onAnimalTreatmentCompleted,
  }
}

describe('createMedicalTreatmentActions (plan items-player-046)', () => {
  it('material success heals, consumes one item, and awards Medicine XP', () => {
    const { actions, inventory, skills, busy, toast } = setup({ bandage: 2 })
    const target = fakeTarget({ injury: 40 })
    expect(actions.startMedicalTreatment(target).ok).toBe(true)
    expect(inventory.count('bandage')).toBe(2)
    expect(skills.medicine.xp).toBe(0)

    busy.tick(MEDICAL_TREATMENT_DURATION_SEC + 0.01)

    expect(target.applyCalls.length).toBe(1)
    expect(inventory.count('bandage')).toBe(1)
    expect(skills.medicine.xp).toBe(SKILL_XP_AWARD.woundTreatmentSerious)
    expect(toast.show).toHaveBeenCalled()
  })

  it('stabilization succeeds without consuming inventory', () => {
    const { actions, inventory, skills, busy } = setup()
    const target = fakeTarget({ injury: 40 })
    actions.startMedicalTreatment(target)
    busy.tick(MEDICAL_TREATMENT_DURATION_SEC + 0.01)
    expect(target.applyCalls.length).toBe(1)
    expect(inventory.count('bandage')).toBe(0)
    expect(skills.medicine.xp).toBeGreaterThan(0)
  })

  it('cancel grants no heal, consume, or XP', () => {
    const { actions, inventory, skills, busy } = setup({ bandage: 1 })
    const target = fakeTarget({ injury: 40 })
    actions.startMedicalTreatment(target)
    busy.cancel()
    expect(target.applyCalls).toEqual([])
    expect(inventory.count('bandage')).toBe(1)
    expect(skills.medicine.xp).toBe(0)
  })

  it('target healed before completion yields no consume/XP', () => {
    const { actions, inventory, skills, busy } = setup({ bandage: 1 })
    const target = fakeTarget({ injury: 40 })
    actions.startMedicalTreatment(target)
    target.injury = 0
    busy.tick(MEDICAL_TREATMENT_DURATION_SEC + 0.01)
    expect(target.applyCalls).toEqual([])
    expect(inventory.count('bandage')).toBe(1)
    expect(skills.medicine.xp).toBe(0)
  })

  it('target death before completion yields no consume/XP', () => {
    const { actions, inventory, skills, busy } = setup({ bandage: 1 })
    const target = fakeTarget({ injury: 40 })
    actions.startMedicalTreatment(target)
    target.setAlive(false)
    busy.tick(MEDICAL_TREATMENT_DURATION_SEC + 0.01)
    expect(target.applyCalls).toEqual([])
    expect(inventory.count('bandage')).toBe(1)
    expect(skills.medicine.xp).toBe(0)
  })

  it('zero actual restore yields no consume/XP', () => {
    const { actions, inventory, skills, busy } = setup({ bandage: 1 })
    const target = fakeTarget({ injury: 40, applyActual: 0 })
    actions.startMedicalTreatment(target)
    busy.tick(MEDICAL_TREATMENT_DURATION_SEC + 0.01)
    expect(inventory.count('bandage')).toBe(1)
    expect(skills.medicine.xp).toBe(0)
  })

  it('material disappearing mid-channel can fall back to stabilization', () => {
    const { actions, inventory, skills, busy } = setup({ bandage: 1 })
    const target = fakeTarget({ injury: 40 })
    actions.startMedicalTreatment(target)
    inventory.remove('bandage', 1)
    busy.tick(MEDICAL_TREATMENT_DURATION_SEC + 0.01)
    expect(target.applyCalls.length).toBe(1)
    expect(skills.medicine.xp).toBeGreaterThan(0)
  })
})

describe('settlement Known Deeds hook (plan quests-progression-059)', () => {
  it('fires for a successful NPC treatment with a resolved settlement id', () => {
    const { actions, busy, onPlayerMedicalTreatmentCompleted } = setup({ bandage: 1 })
    const target = fakeTarget({ injury: 40, kind: 'npc', settlementId: 'village-a' })
    actions.startMedicalTreatment(target)
    busy.tick(MEDICAL_TREATMENT_DURATION_SEC + 0.01)

    expect(onPlayerMedicalTreatmentCompleted).toHaveBeenCalledTimes(1)
    expect(onPlayerMedicalTreatmentCompleted).toHaveBeenCalledWith({
      targetId: 't1',
      targetKind: 'npc',
      settlementId: 'village-a',
      actualRestored: expect.any(Number),
    })
  })

  it('fires for a successful household-livestock treatment with a resolved settlement id', () => {
    const { actions, busy, onPlayerMedicalTreatmentCompleted } = setup({ bandage: 1 })
    const target = fakeTarget({ injury: 40, kind: 'livestock', settlementId: 'village-a' })
    actions.startMedicalTreatment(target)
    busy.tick(MEDICAL_TREATMENT_DURATION_SEC + 0.01)

    expect(onPlayerMedicalTreatmentCompleted).toHaveBeenCalledTimes(1)
  })

  it('never fires for self-treatment (no settlementId)', () => {
    const { actions, busy, onPlayerMedicalTreatmentCompleted } = setup({ bandage: 1 })
    const target = fakeTarget({ injury: 40, kind: 'self' })
    actions.startMedicalTreatment(target)
    busy.tick(MEDICAL_TREATMENT_DURATION_SEC + 0.01)

    expect(onPlayerMedicalTreatmentCompleted).not.toHaveBeenCalled()
  })

  it('never fires for player-owned livestock (no settlement affiliation)', () => {
    const { actions, busy, onPlayerMedicalTreatmentCompleted } = setup({ bandage: 1 })
    const target = fakeTarget({ injury: 40, kind: 'livestock' })
    actions.startMedicalTreatment(target)
    busy.tick(MEDICAL_TREATMENT_DURATION_SEC + 0.01)

    expect(onPlayerMedicalTreatmentCompleted).not.toHaveBeenCalled()
  })

  it('never fires on a zero-actual-restore no-op', () => {
    const { actions, busy, onPlayerMedicalTreatmentCompleted } = setup({ bandage: 1 })
    const target = fakeTarget({ injury: 40, kind: 'npc', settlementId: 'village-a', applyActual: 0 })
    actions.startMedicalTreatment(target)
    busy.tick(MEDICAL_TREATMENT_DURATION_SEC + 0.01)

    expect(onPlayerMedicalTreatmentCompleted).not.toHaveBeenCalled()
  })
})

describe('animal-treatment quest report (plan quests-progression-057)', () => {
  it('fires for a successful livestock treatment with animalKind/mode/severity context', () => {
    const { actions, busy, onAnimalTreatmentCompleted } = setup({ bandage: 1 })
    const target = fakeTarget({ injury: 40, kind: 'livestock', settlementId: 'village-a', animalKind: 'cow' })
    actions.startMedicalTreatment(target)
    busy.tick(MEDICAL_TREATMENT_DURATION_SEC + 0.01)

    expect(onAnimalTreatmentCompleted).toHaveBeenCalledTimes(1)
    expect(onAnimalTreatmentCompleted).toHaveBeenCalledWith({
      animalId: 't1',
      animalKind: 'cow',
      treatmentMode: 'material',
      actualHpRestored: expect.any(Number),
      severityBefore: expect.any(String),
    })
  })

  it('fires for player-owned livestock too (no settlementId requirement)', () => {
    const { actions, busy, onAnimalTreatmentCompleted } = setup({ bandage: 1 })
    const target = fakeTarget({ injury: 40, kind: 'livestock', animalKind: 'horse' })
    actions.startMedicalTreatment(target)
    busy.tick(MEDICAL_TREATMENT_DURATION_SEC + 0.01)

    expect(onAnimalTreatmentCompleted).toHaveBeenCalledTimes(1)
  })

  it('never fires for NPC or self treatment', () => {
    const { actions, busy, onAnimalTreatmentCompleted } = setup({ bandage: 1 })
    actions.startMedicalTreatment(fakeTarget({ injury: 40, kind: 'npc', settlementId: 'village-a' }))
    busy.tick(MEDICAL_TREATMENT_DURATION_SEC + 0.01)
    actions.startMedicalTreatment(fakeTarget({ injury: 40, kind: 'self' }))
    busy.tick(MEDICAL_TREATMENT_DURATION_SEC + 0.01)

    expect(onAnimalTreatmentCompleted).not.toHaveBeenCalled()
  })

  it('never fires on cancellation or a zero-actual-restore no-op', () => {
    const { actions, busy, onAnimalTreatmentCompleted } = setup({ bandage: 1 })
    const cancelled = fakeTarget({ injury: 40, kind: 'livestock', settlementId: 'village-a', animalKind: 'cow' })
    actions.startMedicalTreatment(cancelled)
    busy.cancel()

    const zeroEffect = fakeTarget({
      injury: 40, kind: 'livestock', settlementId: 'village-a', animalKind: 'cow', applyActual: 0,
    })
    actions.startMedicalTreatment(zeroEffect)
    busy.tick(MEDICAL_TREATMENT_DURATION_SEC + 0.01)

    expect(onAnimalTreatmentCompleted).not.toHaveBeenCalled()
  })
})
