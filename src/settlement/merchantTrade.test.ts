import { describe, expect, it } from 'vitest'
import { Inventory } from '../items/Inventory'
import { isInstanceBackedKind } from '../items/itemInstances'
import { settleMerchantStockTransaction } from '../items/trade'
import { MERCHANT_STOCK, merchantPrice } from '../items/tradeCatalog'
import {
  generateMerchantAssortment,
  HOME_STARTER_MERCHANT_KINDS,
  isPremiumMerchantGood,
  type MerchantAssortmentContext,
  merchantStockQuantity,
  PREMIUM_MERCHANT_KINDS,
  premiumAvailabilityChance,
  resolveMerchantProfiles,
  seedMerchantStockIfNeeded,
  settlementHasPremiumOffer,
  specializationAffinity,
} from './merchantTrade'

function ctx(overrides: Partial<MerchantAssortmentContext> = {}): MerchantAssortmentContext {
  return {
    size: 'MD',
    terrain: 'forest',
    seed: 1,
    dominantResource: null,
    ...overrides,
  }
}

function assortmentKinds(stock: Partial<Record<string, number>>): string[] {
  return Object.entries(stock).filter(([, n]) => (n ?? 0) > 0).map(([kind]) => kind)
}

describe('resolveMerchantProfiles', () => {
  it('is stable for the same ordered trader ids and does not change Role', () => {
    const ids = ['s:npc:4', 's:npc:1', 's:npc:9']
    expect(resolveMerchantProfiles(ids, 'forest')).toEqual(resolveMerchantProfiles(ids, 'forest'))
    expect(resolveMerchantProfiles(ids, 'forest').map((p) => p.npcId)).toEqual(['s:npc:1', 's:npc:4', 's:npc:9'])
  })

  it('prefers unique specializations for multiple merchants', () => {
    const specs = resolveMerchantProfiles(['a', 'b', 'c'], 'mountain').map((p) => p.specialization)
    expect(new Set(specs).size).toBe(3)
  })

  it('wraps to a duplicate only as fallback after four traders', () => {
    const specs = resolveMerchantProfiles(['1', '2', '3', '4', '5'], 'forest').map((p) => p.specialization)
    expect(new Set(specs).size).toBe(4)
    expect(specs[4]).toBe(specs[0])
  })

  it('assigns stable stall indices from sorted identity, not input order', () => {
    const a = resolveMerchantProfiles(['z', 'a'], 'ocean')
    const b = resolveMerchantProfiles(['a', 'z'], 'ocean')
    expect(a).toEqual(b)
    expect(a[0]!.stallIndex).toBe(0)
    expect(a[0]!.npcId).toBe('a')
  })
})

describe('settlement premium availability', () => {
  it('rises from SM to XL and XL is near the 80% settlement-level target', () => {
    expect(premiumAvailabilityChance('SM')).toBeLessThan(premiumAvailabilityChance('MD'))
    expect(premiumAvailabilityChance('MD')).toBeLessThan(premiumAvailabilityChance('LG'))
    expect(premiumAvailabilityChance('LG')).toBeLessThan(premiumAvailabilityChance('XL'))
    expect(premiumAvailabilityChance('XL')).toBeCloseTo(0.8, 5)
  })

  it('does not multiply by merchant count — one settlement roll', () => {
    const xl = ctx({ size: 'XL', terrain: 'mountain' })
    let hits1 = 0
    let hits3 = 0
    const samples = 400
    for (let seed = 0; seed < samples; seed++) {
      const context = { ...xl, seed }
      const granted = settlementHasPremiumOffer(context)
      const one = generateMerchantAssortment(context, resolveMerchantProfiles(['t0'], 'mountain'))
      const three = generateMerchantAssortment(context, resolveMerchantProfiles(['t0', 't1', 't2'], 'mountain'))
      const premiumIn = (map: Map<string, Partial<Record<string, number>>>) =>
        [...map.values()].some((stock) => assortmentKinds(stock).some((kind) => isPremiumMerchantGood(kind as never)))
      if (premiumIn(one)) hits1++
      if (premiumIn(three)) hits3++
      if (granted) {
        expect(premiumIn(one)).toBe(true)
        expect(premiumIn(three)).toBe(true)
      } else {
        expect(premiumIn(one)).toBe(false)
        expect(premiumIn(three)).toBe(false)
      }
    }
    expect(hits1).toBe(hits3)
    expect(hits1 / samples).toBeGreaterThan(0.72)
    expect(hits1 / samples).toBeLessThan(0.88)
  })

  it('still allows a small settlement an exceptional premium', () => {
    let hits = 0
    for (let seed = 0; seed < 400; seed++) {
      if (settlementHasPremiumOffer(ctx({ size: 'SM', seed }))) hits++
    }
    expect(hits).toBeGreaterThan(0)
    expect(hits / 400).toBeLessThan(0.18)
  })
})

describe('regional assortment', () => {
  function settlementRate(terrain: MerchantAssortmentContext['terrain'], kind: string, samples = 80): number {
    let hits = 0
    for (let seed = 0; seed < samples; seed++) {
      const profiles = resolveMerchantProfiles(['m0', 'm1', 'm2'], terrain)
      const byNpc = generateMerchantAssortment(ctx({ size: 'LG', terrain, seed }), profiles)
      const found = [...byNpc.values()].some((stock) => (stock[kind as keyof typeof stock] ?? 0) > 0)
      if (found) hits++
    }
    return hits / samples
  }

  it('mountain bias prefers metal / high-grade goods over hunting bows', () => {
    expect(settlementRate('mountain', 'pickaxe')).toBeGreaterThan(settlementRate('mountain', 'short_bow'))
    expect(settlementRate('mountain', 'iron_rod')).toBeGreaterThan(0.5)
  })

  it('forest bias prefers hunting / leather / bow goods', () => {
    expect(settlementRate('forest', 'short_bow')).toBeGreaterThan(settlementRate('forest', 'pickaxe'))
    expect(settlementRate('forest', 'leather_armor') + settlementRate('forest', 'arrow'))
      .toBeGreaterThan(settlementRate('mountain', 'leather_armor'))
  })

  it('coast increases import / general diversity', () => {
    expect(settlementRate('ocean', 'map_near')).toBeGreaterThan(settlementRate('mountain', 'map_near'))
  })

  it('outside-region goods remain possible but rarer', () => {
    const forestPickaxe = settlementRate('forest', 'pickaxe')
    const mountainPickaxe = settlementRate('mountain', 'pickaxe')
    expect(forestPickaxe).toBeGreaterThan(0)
    expect(forestPickaxe).toBeLessThan(mountainPickaxe)
  })
})

describe('specialization assortment', () => {
  it('weapons-tools prefers weapons/tools and skips food', () => {
    expect(specializationAffinity('short_sword', 'weapons-tools')).toBeGreaterThan(specializationAffinity('bread', 'weapons-tools'))
    expect(specializationAffinity('bread', 'weapons-tools')).toBe(0)
  })

  it('does not mint kinds outside MERCHANT_STOCK', () => {
    const profiles = resolveMerchantProfiles(['m0', 'm1'], 'forest')
    const byNpc = generateMerchantAssortment(ctx({ size: 'XL', seed: 9 }), profiles)
    for (const stock of byNpc.values()) {
      for (const kind of assortmentKinds(stock)) {
        expect(MERCHANT_STOCK).toContain(kind)
        expect(merchantPrice(kind as never)).not.toBeNull()
      }
    }
  })
})

describe('seedMerchantStockIfNeeded', () => {
  it('seeds once and does not restore sold-out stock', () => {
    const stock = new Inventory(undefined, Infinity, undefined, undefined, Infinity)
    const latch = { merchantStockInitialized: false }
    seedMerchantStockIfNeeded(stock, latch, { bread: 2, knife: 1 })
    expect(latch.merchantStockInitialized).toBe(true)
    expect(stock.count('bread')).toBe(2)
    stock.remove('bread', 2)
    seedMerchantStockIfNeeded(stock, latch, { bread: 2, knife: 1 })
    expect(stock.count('bread')).toBe(0)
    expect(merchantStockQuantity(stock, 'knife')).toBe(1)
  })

  it('empty seeded stock stays empty after reopen-equivalent reseed attempt', () => {
    const stock = new Inventory(undefined, Infinity, undefined, undefined, Infinity)
    const latch = { merchantStockInitialized: false }
    seedMerchantStockIfNeeded(stock, latch, { bread: 1 })
    stock.remove('bread', 1)
    seedMerchantStockIfNeeded(stock, latch, { bread: 5 })
    expect(stock.count('bread')).toBe(0)
  })
})

describe('settleMerchantStockTransaction', () => {
  it('removes real merchant stock and uses catalog prices, not a second formula', () => {
    const buyer = new Inventory({ coin: 100 }, Infinity, undefined, undefined, Infinity)
    const stock = new Inventory(undefined, Infinity, undefined, undefined, Infinity)
    seedMerchantStockIfNeeded(stock, { merchantStockInitialized: false }, { bread: 3 })
    const listed = merchantPrice('bread')!
    const result = settleMerchantStockTransaction(buyer, stock, { bread: 2 }, {})
    expect(result).toBe('ok')
    expect(buyer.count('bread')).toBe(2)
    expect(stock.count('bread')).toBe(1)
    expect(buyer.count('coin')).toBe(100 - listed * 2)
  })

  it('does not restore a purchased kind on a second settle from the remaining stock', () => {
    const buyer = new Inventory({ coin: 20 }, Infinity, undefined, undefined, Infinity)
    const stock = new Inventory({ bread: 1 }, Infinity, undefined, undefined, Infinity)
    expect(settleMerchantStockTransaction(buyer, stock, { bread: 1 }, {})).toBe('ok')
    expect(settleMerchantStockTransaction(buyer, stock, { bread: 1 }, {})).toBe('not_sold')
  })
})

describe('home starter overlay', () => {
  const samples = 80

  it('always stocks every baseline kind on the first home merchant across seeds', () => {
    for (let seed = 0; seed < samples; seed++) {
      const profiles = resolveMerchantProfiles(['m0'], 'forest')
      expect(profiles[0]!.specialization).toBe('food-materials')
      expect(profiles[0]!.stallIndex).toBe(0)
      const byNpc = generateMerchantAssortment(ctx({ size: 'SM', terrain: 'forest', seed, isHome: true }), profiles)
      const stock = byNpc.get('m0')!
      for (const kind of HOME_STARTER_MERCHANT_KINDS) {
        expect(stock[kind] ?? 0).toBeGreaterThanOrEqual(1)
      }
    }
  })

  it('does not treat backpack as premium', () => {
    expect(isPremiumMerchantGood('backpack')).toBe(false)
    expect(PREMIUM_MERCHANT_KINDS).not.toContain('backpack')
  })

  it('does not guarantee the baseline outside the home settlement', () => {
    let missing = 0
    for (let seed = 0; seed < samples; seed++) {
      const profiles = resolveMerchantProfiles(['m0'], 'forest')
      const byNpc = generateMerchantAssortment(ctx({ size: 'SM', terrain: 'forest', seed, isHome: false }), profiles)
      const stock = byNpc.get('m0')!
      const hasAll = HOME_STARTER_MERCHANT_KINDS.every((kind) => (stock[kind] ?? 0) > 0)
      if (!hasAll) missing++
    }
    expect(missing).toBeGreaterThan(0)
  })

  it('keeps regional assortment diversity without the home overlay', () => {
    const forest = resolveMerchantProfiles(['m0', 'm1', 'm2'], 'forest')
    const mountain = resolveMerchantProfiles(['m0', 'm1', 'm2'], 'mountain')
    const forestKinds = new Set<string>()
    const mountainKinds = new Set<string>()
    for (let seed = 0; seed < 24; seed++) {
      for (const stock of generateMerchantAssortment(ctx({ size: 'LG', terrain: 'forest', seed }), forest).values()) {
        for (const kind of assortmentKinds(stock)) forestKinds.add(kind)
      }
      for (const stock of generateMerchantAssortment(ctx({ size: 'LG', terrain: 'mountain', seed }), mountain).values()) {
        for (const kind of assortmentKinds(stock)) mountainKinds.add(kind)
      }
    }
    expect(forestKinds.has('short_bow') || forestKinds.has('leather_armor')).toBe(true)
    expect(mountainKinds.has('pickaxe') || mountainKinds.has('iron_rod')).toBe(true)
    expect([...forestKinds].sort().join(',')).not.toBe([...mountainKinds].sort().join(','))
  })

  it('still grants remaining premium goods from the settlement roll', () => {
    const xl = ctx({ size: 'XL', terrain: 'mountain' })
    let hits = 0
    const samplesXl = 200
    for (let seed = 0; seed < samplesXl; seed++) {
      const context = { ...xl, seed }
      const granted = settlementHasPremiumOffer(context)
      const byNpc = generateMerchantAssortment(context, resolveMerchantProfiles(['t0'], 'mountain'))
      const premiumIn = [...byNpc.values()].some((stock) =>
        assortmentKinds(stock).some((kind) => isPremiumMerchantGood(kind as never)))
      if (granted) {
        expect(premiumIn).toBe(true)
        expect(PREMIUM_MERCHANT_KINDS.some((kind) => (byNpc.get('t0')![kind] ?? 0) > 0)).toBe(true)
      } else {
        expect(premiumIn).toBe(false)
      }
      if (premiumIn) hits++
    }
    expect(hits / samplesXl).toBeGreaterThan(0.72)
    expect(hits / samplesXl).toBeLessThan(0.88)
  })

  it('does not overwrite quantity when a baseline kind was already assorted', () => {
    let found = false
    for (let seed = 0; seed < 200; seed++) {
      const profiles = resolveMerchantProfiles(['m0'], 'mountain')
      expect(profiles[0]!.specialization).toBe('weapons-tools')
      const regional = generateMerchantAssortment(ctx({ size: 'MD', terrain: 'mountain', seed }), profiles).get('m0')!
      const home = generateMerchantAssortment(ctx({ size: 'MD', terrain: 'mountain', seed, isHome: true }), profiles).get('m0')!
      const already = HOME_STARTER_MERCHANT_KINDS.find((kind) => (regional[kind] ?? 0) > 1)
      if (!already) continue
      found = true
      expect(home[already]).toBe(regional[already])
    }
    expect(found).toBe(true)
  })

  it('is deterministic for the same seed and context', () => {
    const profiles = resolveMerchantProfiles(['m1', 'm0'], 'forest')
    const context = ctx({ size: 'SM', terrain: 'forest', seed: 42, isHome: true })
    const a = generateMerchantAssortment(context, profiles)
    const b = generateMerchantAssortment(context, profiles)
    expect([...a.entries()]).toEqual([...b.entries()])
  })
})

describe('premium kinds stay catalog members', () => {
  it('every premium kind used by policy is in MERCHANT_STOCK', () => {
    for (const kind of PREMIUM_MERCHANT_KINDS) {
      expect(MERCHANT_STOCK).toContain(kind)
    }
  })

  it('instance-backed premium goods seed as instances', () => {
    const stock = new Inventory(undefined, Infinity, undefined, undefined, Infinity)
    seedMerchantStockIfNeeded(stock, { merchantStockInitialized: false }, { masterwork_sword: 1 })
    expect(isInstanceBackedKind('masterwork_sword')).toBe(true)
    expect(stock.countInstances('masterwork_sword')).toBe(1)
  })
})
