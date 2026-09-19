import { describe, expect, it } from 'vitest'
import { Inventory } from './Inventory'
import { createFoodBatch } from './foodFreshness'
import { canPoisonMeat, isPoisonMeatInputKind, poisonMeat } from './poisonedMeat'
import type { ItemKind } from './items'

describe('poisonMeat (plan items-player-049)', () => {
  it('classifies raw meat bait kinds and rejects processed/fish/poisoned output', () => {
    expect(isPoisonMeatInputKind('deer_meat')).toBe(true)
    expect(isPoisonMeatInputKind('roasted_meat')).toBe(false)
    expect(isPoisonMeatInputKind('dried_meat')).toBe(false)
    expect(isPoisonMeatInputKind('fish')).toBe(false)
    expect(isPoisonMeatInputKind('poisoned_meat')).toBe(false)
  })

  it('transforms herb + eligible meat into one poisoned_meat preserving FoodBatch', () => {
    const inv = new Inventory({})
    inv.add('poisonous_herb', 1)
    inv.addWithFreshness('deer_meat', 1, [createFoodBatch(1, 3.5, 1, 'deer')], 4)
    const before = inv.getFoodBatches('deer_meat', 4)
    expect(poisonMeat(inv, 4)).toEqual({ ok: true, meatKind: 'deer_meat' })
    expect(inv.count('poisonous_herb')).toBe(0)
    expect(inv.count('deer_meat')).toBe(0)
    expect(inv.count('poisoned_meat')).toBe(1)
    const out = inv.getFoodBatches('poisoned_meat', 4)
    expect(out[0]?.sourceSpecies).toBe('deer')
    expect(out[0]?.acquiredAtDays).toBe(before[0]?.acquiredAtDays)
  })

  it('does not partially mutate when an input or capacity is missing', () => {
    const inv = new Inventory({ deer_meat: 1 })
    expect(poisonMeat(inv, 0)).toEqual({ ok: false, reason: 'missing_herb' })
    expect(inv.count('deer_meat')).toBe(1)

    inv.add('poisonous_herb', 1)
    inv.remove('deer_meat', 1)
    expect(poisonMeat(inv, 0)).toEqual({ ok: false, reason: 'missing_meat' })
    expect(inv.count('poisonous_herb')).toBe(1)

    inv.add('deer_meat', 1)
    const full = new Inventory({}, 1)
    full.add('poisonous_herb', 1)
    full.add('deer_meat', 1)
    expect(full.canAdd('poisoned_meat', 1)).toBe(false)
    expect(canPoisonMeat(full)).toBe(false)
    expect(poisonMeat(full, 0)).toEqual({ ok: false, reason: 'no_capacity' })
    expect(full.count('poisonous_herb')).toBe(1)
    expect(full.count('deer_meat')).toBe(1)
    expect(full.count('poisoned_meat')).toBe(0)
  })

  it('accepts each raw meat bait kind', () => {
    const kinds: ItemKind[] = ['raw_meat', 'deer_meat', 'wolf_meat', 'boar_meat', 'rabbit_meat', 'beef']
    for (const kind of kinds) {
      const inv = new Inventory({})
      inv.add('poisonous_herb', 1)
      inv.add(kind, 1)
      expect(poisonMeat(inv, 0).ok).toBe(true)
      expect(inv.count('poisoned_meat')).toBe(1)
    }
  })

  it('canPoisonMeat mirrors preconditions', () => {
    const inv = new Inventory({})
    expect(canPoisonMeat(inv)).toBe(false)
    inv.add('poisonous_herb', 1)
    inv.add('raw_meat', 1)
    expect(canPoisonMeat(inv)).toBe(true)
  })
})
