import { describe, expect, it } from 'vitest'
import { CONTAINER_DEFS, containerTotalWeight } from './container'

describe('container defs (plan 164)', () => {
  it('gives the chest a positive capacity and base weight', () => {
    const def = CONTAINER_DEFS.chest
    expect(def.capacityUnits).toBeGreaterThan(0)
    expect(def.baseWeightKg).toBeGreaterThan(0)
  })

  it('sums base weight and contents weight (plan 164 §8)', () => {
    const def = CONTAINER_DEFS.chest
    expect(containerTotalWeight(def, 0)).toBe(def.baseWeightKg)
    expect(containerTotalWeight(def, 12.5)).toBe(def.baseWeightKg + 12.5)
  })
})
