import { describe, expect, it } from 'vitest'
import type { ItemKind } from '../items/items'
import { Inventory } from '../items/Inventory'
import { createItemInstanceId } from '../items/itemInstances'
import { createWeaponInstance } from '../items/weaponMaintenance'
import { createHousehold, type Household } from '../settlement/household'
import { HUNT_RESUPPLY_ARROW_TARGET } from './NpcAgent'
import {
  type NpcTradeCounterparty,
  npcTradeQuantityAvailable,
  npcTradeSourceInventory,
  resolveNpcTradeOffers,
  type TradeReserveNpc,
} from './npcTradeAvailability'

function hunter(household: Household): TradeReserveNpc {
  return { household, role: 'hunter' }
}
function farmer(household: Household): TradeReserveNpc {
  return { household, role: 'farmer' }
}

function emptyItems(): Household {
  return createHousehold('h-empty', 's1', 'home1', { water: 0, items: { counts: {}, instances: [] } })
}

function householdWith(counts: Partial<Record<ItemKind, number>>): Household {
  return createHousehold('h-stock', 's1', 'home1', {
    water: 0,
    items: { counts, instances: [] },
  })
}

function counterparty(
  household: Household | null,
  role: NpcTradeCounterparty['role'] = 'farmer',
  personal: Inventory = new Inventory(),
): NpcTradeCounterparty {
  return { role, household, personalInventory: personal }
}

describe('npcTradeAvailability household goods (plan settlements-npcs-033 / 036)', () => {
  it('offers nothing for an ordinary NPC without eligible stock', () => {
    expect(resolveNpcTradeOffers(counterparty(emptyItems()), [])).toEqual([])
  })

  it('exposes only the excess above the hunter reserve', () => {
    const household = householdWith({ arrow: 31 })
    const npc = counterparty(household, 'hunter')
    const settlementNpcs = [hunter(household)]
    expect(npcTradeQuantityAvailable('arrow', 'household', npc, settlementNpcs)).toBe(31 - HUNT_RESUPPLY_ARROW_TARGET)
    expect(resolveNpcTradeOffers(npc, settlementNpcs)).toEqual([
      { kind: 'arrow', quantity: 31 - HUNT_RESUPPLY_ARROW_TARGET, owner: 'household' },
    ])
  })

  it('is unavailable exactly at the reserve threshold', () => {
    const household = householdWith({ arrow: HUNT_RESUPPLY_ARROW_TARGET })
    const npc = counterparty(household, 'hunter')
    const settlementNpcs = [hunter(household)]
    expect(npcTradeQuantityAvailable('arrow', 'household', npc, settlementNpcs)).toBe(0)
    expect(resolveNpcTradeOffers(npc, settlementNpcs)).toEqual([])
  })

  it('scales the reserve with the number of hunters sharing the household', () => {
    const household = householdWith({ arrow: HUNT_RESUPPLY_ARROW_TARGET * 2 + 5 })
    const npc = counterparty(household, 'hunter')
    const settlementNpcs = [hunter(household), hunter(household)]
    expect(npcTradeQuantityAvailable('arrow', 'household', npc, settlementNpcs)).toBe(5)
  })

  it('protects nothing when the household has no hunter — the full stock is offered', () => {
    const household = householdWith({ arrow: 4 })
    const npc = counterparty(household, 'farmer')
    expect(npcTradeQuantityAvailable('arrow', 'household', npc, [farmer(household)])).toBe(4)
  })

  it('offers household production outputs as real owned stock', () => {
    const household = householdWith({
      wool_material: 12,
      linen_material: 2,
      bandage: 3,
      dressing: 1,
      iron_rod: 4,
    })
    const npc = counterparty(household, 'textile_worker')
    expect(resolveNpcTradeOffers(npc, [])).toEqual([
      { kind: 'wool_material', quantity: 12, owner: 'household' },
      { kind: 'linen_material', quantity: 2, owner: 'household' },
      { kind: 'bandage', quantity: 3, owner: 'household' },
      { kind: 'dressing', quantity: 1, owner: 'household' },
      { kind: 'iron_rod', quantity: 4, owner: 'household' },
    ])
  })

  it('never exposes inputs, wood, seeds, food or an unrelated future item just because they are owned', () => {
    const household = householdWith({
      branch: 999,
      beam: 40,
      wool: 20,
      flax: 20,
      herb: 20,
      seed_carrot: 8,
      tree_seed: 8,
      carrot: 30,
      bread: 10,
      // not a production output and not on the allowlist
      stone: 50,
    })
    const npc = counterparty(household)
    expect(resolveNpcTradeOffers(npc, [])).toEqual([])
    expect(npcTradeQuantityAvailable('branch', 'household', npc, [])).toBe(0)
    expect(npcTradeQuantityAvailable('beam', 'household', npc, [])).toBe(0)
    expect(npcTradeQuantityAvailable('wool', 'household', npc, [])).toBe(0)
    expect(npcTradeQuantityAvailable('flax', 'household', npc, [])).toBe(0)
    expect(npcTradeQuantityAvailable('herb', 'household', npc, [])).toBe(0)
    expect(npcTradeQuantityAvailable('seed_carrot', 'household', npc, [])).toBe(0)
    expect(npcTradeQuantityAvailable('carrot', 'household', npc, [])).toBe(0)
    expect(npcTradeQuantityAvailable('stone', 'household', npc, [])).toBe(0)
  })

  it('returns no household offers when the NPC has no household', () => {
    const npc = counterparty(null, 'miner', new Inventory({ iron_rod: 2 }))
    expect(npcTradeQuantityAvailable('iron_rod', 'household', npc, [])).toBe(0)
    expect(npcTradeSourceInventory('household', npc)).toBeNull()
  })

  it('recomputes live availability when owned stock is consumed', () => {
    const household = householdWith({ wool_material: 5 })
    const npc = counterparty(household, 'textile_worker')
    expect(resolveNpcTradeOffers(npc, [])).toEqual([
      { kind: 'wool_material', quantity: 5, owner: 'household' },
    ])
    household.items.remove('wool_material', 5)
    expect(resolveNpcTradeOffers(npc, [])).toEqual([])
  })
})

describe('npcTradeAvailability personal goods (plan settlements-npcs-036)', () => {
  it('offers an allowlisted personal stack that is not loadout', () => {
    const personal = new Inventory({ wool_material: 7 })
    const npc = counterparty(emptyItems(), 'textile_worker', personal)
    expect(npcTradeQuantityAvailable('wool_material', 'personal', npc, [])).toBe(7)
    expect(resolveNpcTradeOffers(npc, [])).toEqual([
      { kind: 'wool_material', quantity: 7, owner: 'personal' },
    ])
    expect(npcTradeSourceInventory('personal', npc)).toBe(personal)
  })

  it('prefers household surplus of the same kind over personal stock', () => {
    const household = householdWith({ bandage: 2 })
    const personal = new Inventory({ bandage: 9 })
    const npc = counterparty(household, 'herbalist', personal)
    expect(resolveNpcTradeOffers(npc, [])).toEqual([
      { kind: 'bandage', quantity: 2, owner: 'household' },
    ])
  })

  it('does not sell role loadout belongings', () => {
    const bow = { id: createItemInstanceId(), kind: 'hunting_bow' as const }
    const knife = createWeaponInstance('knife')
    const personal = new Inventory({ iron_rod: 1 }, undefined, [bow, knife])
    const npc = counterparty(emptyItems(), 'hunter', personal)
    const offers = resolveNpcTradeOffers(npc, [])
    expect(offers).toEqual([{ kind: 'iron_rod', quantity: 1, owner: 'personal' }])
    expect(npcTradeQuantityAvailable('hunting_bow', 'personal', npc, [])).toBe(0)
    expect(npcTradeQuantityAvailable('knife', 'personal', npc, [])).toBe(0)
  })

  it('does not sell shepherd shears even when personally held', () => {
    const personal = new Inventory({ shears: 1, dressing: 2 })
    const npc = counterparty(emptyItems(), 'shepherd', personal)
    expect(resolveNpcTradeOffers(npc, [])).toEqual([
      { kind: 'dressing', quantity: 2, owner: 'personal' },
    ])
    expect(npcTradeQuantityAvailable('shears', 'personal', npc, [])).toBe(0)
  })

  it('does not offer coin, story items or kinds outside the personal allowlist', () => {
    const personal = new Inventory({
      coin: 40,
      signet_ring: 1,
      bandit_ledger: 1,
      marked_valuable: 1,
      arrow: 12,
      branch: 8,
    })
    const npc = counterparty(emptyItems(), 'farmer', personal)
    expect(resolveNpcTradeOffers(npc, [])).toEqual([])
    expect(npcTradeQuantityAvailable('coin', 'personal', npc, [])).toBe(0)
    expect(npcTradeQuantityAvailable('signet_ring', 'personal', npc, [])).toBe(0)
    expect(npcTradeQuantityAvailable('arrow', 'personal', npc, [])).toBe(0)
  })

  it('ignores household-ineligible personal kinds even at large quantity', () => {
    const personal = new Inventory({ flax: 99, herb: 99, seed_potato: 12 })
    const npc = counterparty(emptyItems(), 'farmer', personal)
    expect(resolveNpcTradeOffers(npc, [])).toEqual([])
  })
})
