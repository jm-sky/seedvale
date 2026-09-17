import { describe, expect, it, vi } from 'vitest'
import { Inventory } from '../items/Inventory'
import { criticalInjuryFloor, seriousInjuryFloor } from '../shared/injurySeverity'
import {
  BARE_HANDS_STABILIZE_BASE_HP,
  medicalTreatmentPromptLabel,
  resolveMedicalTreatmentPlan,
  type TreatableTarget,
} from './medicalTreatment'
import { createPlayerSkills } from './PlayerSkills'

function fakeTarget(overrides: Partial<{
  alive: boolean
  injury: number
  maxHp: number
  label: string
}> = {}): TreatableTarget & { applied: number[], injury: number } {
  const state = {
    alive: overrides.alive ?? true,
    injury: overrides.injury ?? 40,
    maxHp: overrides.maxHp ?? 100,
    applied: [] as number[],
  }
  return {
    id: 't1',
    kind: 'self',
    label: overrides.label ?? 'siebie',
    isAlive: () => state.alive,
    getPhysicalInjury: () => state.injury,
    getMaxHp: () => state.maxHp,
    resolveInjuryRecovery: vi.fn(),
    applyTreatment: (requested) => {
      state.applied.push(requested)
      const actual = Math.min(requested, state.injury)
      state.injury -= actual
      return actual
    },
    get applied() { return state.applied },
    get injury() { return state.injury },
    set injury(value: number) { state.injury = value },
  }
}

describe('resolveMedicalTreatmentPlan (plan items-player-046)', () => {
  it('returns null for a healthy target without mutating', () => {
    const target = fakeTarget({ injury: 0 })
    const inventory = new Inventory({ bandage: 1 })
    expect(resolveMedicalTreatmentPlan(target, inventory, createPlayerSkills())).toBeNull()
    expect(inventory.count('bandage')).toBe(1)
    expect(target.applied).toEqual([])
  })

  it('prefers suitable material treatment over stabilization', () => {
    const target = fakeTarget({ injury: 40 })
    const inventory = new Inventory({ bandage: 1 })
    const plan = resolveMedicalTreatmentPlan(target, inventory, createPlayerSkills())
    expect(plan?.mode).toBe('material')
    expect(plan?.materialKind).toBe('bandage')
    expect(plan?.promptVerb).toBe('Opatrz')
    expect(medicalTreatmentPromptLabel(plan!, target.label)).toBe('[E] Opatrz: siebie')
    expect(inventory.count('bandage')).toBe(1)
    expect(target.applied).toEqual([])
  })

  it('rejects insufficient maxSeverity material and falls back to stabilize', () => {
    const maxHp = 100
    const injury = criticalInjuryFloor(maxHp) + 10
    const target = fakeTarget({ injury, maxHp })
    const inventory = new Inventory({ yarrow: 1 })
    const plan = resolveMedicalTreatmentPlan(target, inventory, createPlayerSkills())
    expect(plan?.mode).toBe('stabilize')
    expect(plan?.materialKind).toBeNull()
    expect(plan?.promptVerb).toBe('Ustabilizuj')
  })

  it('offers bare-hands stabilization when no material is carried', () => {
    const target = fakeTarget({ injury: seriousInjuryFloor(100) + 5 })
    const plan = resolveMedicalTreatmentPlan(target, new Inventory(), createPlayerSkills())
    expect(plan?.mode).toBe('stabilize')
    expect(plan?.requestedHpRestore).toBeGreaterThan(0)
    expect(plan?.requestedHpRestore).toBeLessThanOrEqual(BARE_HANDS_STABILIZE_BASE_HP + 5)
  })

  it('scales requested effect with Medicine competence (bounded)', () => {
    const targetLow = fakeTarget({ injury: 40 })
    const targetHigh = fakeTarget({ injury: 40 })
    const low = createPlayerSkills()
    low.medicine.value = 0.2
    const high = createPlayerSkills()
    high.medicine.value = 1
    const inventory = new Inventory({ bandage: 2 })
    const lowPlan = resolveMedicalTreatmentPlan(targetLow, inventory, low)
    const highPlan = resolveMedicalTreatmentPlan(targetHigh, inventory, high)
    expect(lowPlan?.requestedHpRestore).toBeLessThan(highPlan!.requestedHpRestore)
  })
})
