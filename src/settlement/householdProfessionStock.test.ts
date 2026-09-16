import { describe, expect, it } from 'vitest'
import type { ItemKind } from '../items/items'
import { isArmorItemInstance } from '../items/itemInstances'
import { createHousehold, type HouseholdTradeStockContext } from './household'
import {
  resolveProfessionStarterGrants,
} from './householdProfessionStock'

function tradeStock(overrides: Partial<HouseholdTradeStockContext> = {}): HouseholdTradeStockContext {
  return {
    size: 'SM',
    terrain: 'swamp',
    dominantResource: null,
    isHome: false,
    seed: 1,
    ...overrides,
  }
}

function kindsOf(grants: readonly { kind: ItemKind }[]): ItemKind[] {
  return grants.map((grant) => grant.kind)
}

describe('resolveProfessionStarterGrants (plan settlements-npcs-042)', () => {
  it('keeps SM hunter stock narrower than LG at the same seed', () => {
    const sm = resolveProfessionStarterGrants({ hasHunter: true, tradeStock: tradeStock({ size: 'SM' }) }, 'h-hunter')
    const lg = resolveProfessionStarterGrants({ hasHunter: true, tradeStock: tradeStock({ size: 'LG' }) }, 'h-hunter')
    const smKinds = new Set(kindsOf(sm))
    const lgKinds = new Set(kindsOf(lg))
    expect(smKinds.has('short_bow')).toBe(true)
    expect(smKinds.has('leather_armor')).toBe(false)
    expect(smKinds.has('hunting_bow')).toBe(false)
    expect(lgKinds.has('hunting_bow')).toBe(true)
    expect(lgKinds.has('leather_armor')).toBe(true)
    expect(lgKinds.size).toBeGreaterThan(smKinds.size)
    expect(sm.find((grant) => grant.kind === 'arrow')!.count).toBeLessThan(lg.find((grant) => grant.kind === 'arrow')!.count)
  })

  it('forest bias adds hunting goods without requiring a larger settlement', () => {
    const plains = kindsOf(resolveProfessionStarterGrants({
      hasHunter: true,
      tradeStock: tradeStock({ size: 'SM', terrain: 'swamp' }),
    }, 'h-hunter'))
    const forest = kindsOf(resolveProfessionStarterGrants({
      hasHunter: true,
      tradeStock: tradeStock({ size: 'SM', terrain: 'forest' }),
    }, 'h-hunter'))
    expect(plains.includes('hunting_bow')).toBe(false)
    expect(forest.includes('hunting_bow')).toBe(true)
    expect(forest.includes('short_bow')).toBe(true)
  })

  it('mountain / iron bias strengthens blacksmith metal coverage', () => {
    const forest = kindsOf(resolveProfessionStarterGrants({
      hasBlacksmith: true,
      tradeStock: tradeStock({ size: 'MD', terrain: 'forest' }),
    }, 'h-smith'))
    const mountain = kindsOf(resolveProfessionStarterGrants({
      hasBlacksmith: true,
      tradeStock: tradeStock({
        size: 'MD',
        terrain: 'mountain',
        dominantResource: { id: 'iron:1', type: 'iron', x: 0, z: 0, radius: 1, richness: 1 },
      }),
    }, 'h-smith'))
    expect(mountain.includes('chainmail')).toBe(true)
    expect(forest.filter((kind) => kind === 'axe' || kind === 'pickaxe' || kind === 'chainmail').length)
      .toBeLessThanOrEqual(mountain.filter((kind) => kind === 'axe' || kind === 'pickaxe' || kind === 'chainmail').length)
  })

  it('is deterministic for the same household, seed and settlement context', () => {
    const starting = { hasHunter: true, hasBlacksmith: true, tradeStock: tradeStock({ size: 'LG', seed: 9 }) }
    expect(resolveProfessionStarterGrants(starting, 'h-1')).toEqual(resolveProfessionStarterGrants(starting, 'h-1'))
  })

  it('does not persist scaled context — snapshot restore skips bootstrap', () => {
    const before = createHousehold('h', 's', 'home', undefined, {
      hasHunter: true,
      tradeStock: tradeStock({ size: 'LG', terrain: 'forest' }),
    })
    before.items.remove('arrow', before.items.count('arrow'))
    const restored = createHousehold('h', 's', 'home', before.snapshot(), {
      hasHunter: true,
      tradeStock: tradeStock({ size: 'LG', terrain: 'forest' }),
    })
    expect(restored.items.count('arrow')).toBe(0)
  })
})

describe('specialist armor quality (plan settlements-npcs-042)', () => {
  it('uses settlement-size quality rather than a vendor-specific resolver', () => {
    const sm = resolveProfessionStarterGrants({ hasHunter: true, tradeStock: tradeStock({ size: 'SM', seed: 3 }) }, 'h-q')
    const pauldron = sm.find((grant) => grant.kind === 'leather_pauldron')
    expect(pauldron?.armorQuality === 'poor' || pauldron?.armorQuality === 'common' || pauldron?.armorQuality === 'good' || pauldron?.armorQuality === 'masterwork').toBe(true)

    const household = createHousehold('h-q', 's', 'home', undefined, {
      hasHunter: true,
      tradeStock: tradeStock({ size: 'SM', seed: 3 }),
    })
    const instance = household.items.getInstances('leather_pauldron')[0]
    expect(instance && isArmorItemInstance(instance)).toBe(true)
    if (instance && isArmorItemInstance(instance)) {
      expect(instance.quality).toBe(pauldron?.armorQuality)
    }
  })
})
