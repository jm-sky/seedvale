import { describe, expect, it } from 'vitest'
import { createSettlementEconomy } from '../economy/settlementEconomy'
import { createHousehold, createHouseholdRegistry, householdIdFor } from './household'

describe('createHousehold', () => {
  it('starts with a small deterministic reserve', () => {
    const a = createHousehold(householdIdFor('0_0', 0), '0_0', '0_0:home:0')
    const again = createHousehold(householdIdFor('0_0', 0), '0_0', '0_0:home:0')
    expect(a.foodCount()).toEqual(again.foodCount())
    expect(a.foodCount()).toBeGreaterThan(0)
    expect(a.foodCount()).toBeLessThan(7)
    expect(a.stock.query('wood')).toBeGreaterThan(0)
    expect(a.stock.query('wood')).toBeLessThan(5)
  })

  it('has no authoritative scalar food quantity — stock never carries a food key', () => {
    const household = createHousehold('h', 's', 'home')
    expect(household.stock.query('food')).toBe(0)
  })

  it('starts with concrete food items, not just an abstract count', () => {
    const household = createHousehold('h', 's', 'home')
    expect(household.items.count('bread')).toBe(household.foodCount())
    expect(household.items.count('bread')).toBeGreaterThan(0)
  })

  it('a household with no food items reports zero availability', () => {
    const household = createHousehold('h', 's', 'home')
    household.items.remove('bread', household.items.count('bread'))
    expect(household.foodCount()).toBe(0)
    expect(household.has('food', 1)).toBe(false)
    expect(household.takeFood()).toBeNull()
  })

  it('a household with one food ItemKind reports availability from that kind', () => {
    const household = createHousehold('h', 's', 'home')
    household.items.remove('bread', household.items.count('bread'))
    household.items.add('carrot', 2)
    expect(household.foodCount()).toBe(2)
    expect(household.has('food', 2)).toBe(true)
    expect(household.has('food', 3)).toBe(false)
  })

  it('a household with several different food ItemKind values sums them all', () => {
    const household = createHousehold('h', 's', 'home')
    household.items.remove('bread', household.items.count('bread'))
    household.items.add('carrot', 2)
    household.items.add('fish', 1)
    household.items.add('egg', 3)
    expect(household.foodCount()).toBe(6)
  })

  it('non-food items never count toward food availability', () => {
    const household = createHousehold('h', 's', 'home')
    household.items.remove('bread', household.items.count('bread'))
    household.items.add('arrow', 5)
    household.items.add('hide', 2)
    expect(household.foodCount()).toBe(0)
    expect(household.has('food', 1)).toBe(false)
  })

  it('reports shortage/shouldAcquire relative to policy, not raw amounts', () => {
    const household = createHousehold('h', 's', 'home')
    household.items.remove('bread', household.items.count('bread'))
    expect(household.shortage('food')).toBeGreaterThan(0)
    expect(household.shouldAcquire('food')).toBe(true)
    household.depositFood('carrot', 10)
    expect(household.shortage('food')).toBe(0)
    expect(household.shouldAcquire('food')).toBe(false)
  })

  it('caps deposits at capacity and routes the remainder to the settlement economy', () => {
    const household = createHousehold('h', 's', 'home')
    household.items.remove('bread', household.items.count('bread'))
    const economy = createSettlementEconomy('s', {}, [])
    household.depositFood('carrot', 20, economy)
    expect(household.foodCount()).toBeLessThan(20)
    expect(economy.query('food')).toBeGreaterThan(0)
    expect(household.foodCount() + economy.query('food')).toBe(20)
  })

  it('drops the remainder when no economy is given to absorb overflow', () => {
    const household = createHousehold('h', 's', 'home')
    const before = household.stock.query('wood')
    household.deposit('wood', 100)
    expect(household.stock.query('wood')).toBeLessThan(100 + before)
  })

  it('never removes more than available (reuses EconomicStock invariants)', () => {
    const household = createHousehold('h', 's', 'home')
    const amount = household.stock.query('wood')
    expect(household.stock.remove('wood', amount + 1)).toBe(false)
    expect(household.stock.query('wood')).toBe(amount)
  })
})

describe('household.surplus (plan 167)', () => {
  it('is zero at or below the resource target', () => {
    const household = createHousehold('h', 's', 'home')
    household.items.remove('bread', household.items.count('bread'))
    household.depositFood('carrot', 3) // target
    expect(household.surplus('food')).toBe(0)
  })

  it('is the amount above target, capped by capacity, once stock exceeds it', () => {
    const household = createHousehold('h', 's', 'home')
    household.items.remove('bread', household.items.count('bread'))
    household.depositFood('carrot', 6) // target 3, capacity 7
    expect(household.foodCount()).toBe(6)
    expect(household.surplus('food')).toBe(3)
  })

  it('never touches the reserve below target — surplus stays 0 while shortage', () => {
    const household = createHousehold('h', 's', 'home')
    household.items.remove('bread', household.items.count('bread'))
    expect(household.surplus('food')).toBe(0)
    expect(household.shortage('food')).toBeGreaterThan(0)
  })
})

describe('household food consumption (plan settlements-npcs-008)', () => {
  it('takeFood removes exactly one concrete food item, deterministic kind order', () => {
    const household = createHousehold('h', 's', 'home')
    household.items.remove('bread', household.items.count('bread'))
    household.items.add('carrot', 2)
    const before = household.foodCount()
    const takenKind = household.takeFood()
    expect(takenKind).not.toBeNull()
    expect(household.foodCount()).toBe(before - 1)
  })

  it('the same food kind is picked every time for the same held mix (no Math.random ordering)', () => {
    const a = createHousehold('h1', 's', 'home')
    a.items.remove('bread', a.items.count('bread'))
    a.items.add('carrot', 1)
    a.items.add('fish', 1)
    const b = createHousehold('h2', 's', 'home')
    b.items.remove('bread', b.items.count('bread'))
    b.items.add('carrot', 1)
    b.items.add('fish', 1)
    expect(a.takeFood()).toBe(b.takeFood())
  })
})

describe('household water reserve (plan 122)', () => {
  it('starts with a small deterministic reserve, same idiom as food/wood', () => {
    const a = createHousehold(householdIdFor('0_0', 0), '0_0', '0_0:home:0')
    const again = createHousehold(householdIdFor('0_0', 0), '0_0', '0_0:home:0')
    expect(a.water.current).toEqual(again.water.current)
    expect(a.water.current).toBeGreaterThan(0)
    expect(a.water.current).toBeLessThan(a.water.capacity)
  })

  it('reports shortage/shouldFetch relative to policy, not raw amounts', () => {
    const household = createHousehold('h', 's', 'home')
    household.water.remove(household.water.current)
    expect(household.water.shortage()).toBeGreaterThan(0)
    expect(household.water.shouldFetch()).toBe(true)
    household.water.add(10)
    expect(household.water.shortage()).toBe(0)
    expect(household.water.shouldFetch()).toBe(false)
  })

  it('caps additions at capacity — a well trip cannot overfill the barrel/trough', () => {
    const household = createHousehold('h', 's', 'home')
    household.water.add(100)
    expect(household.water.current).toBe(household.water.capacity)
  })

  it('never drains below zero', () => {
    const household = createHousehold('h', 's', 'home')
    household.water.remove(household.water.current + 5)
    expect(household.water.current).toBe(0)
    expect(household.water.has(1)).toBe(false)
  })

  it('is independent of the wood EconomicStock/food items (not an EconomicKind)', () => {
    const household = createHousehold('h', 's', 'home')
    const waterBefore = household.water.current
    household.deposit('wood', 5)
    expect(household.water.current).toBe(waterBefore)
  })
})

describe('household.items (plan 178) — generic item storage, including concrete food since plan settlements-npcs-008', () => {
  it('holds starting concrete food for a household with no hunter', () => {
    const household = createHousehold('h', 's', 'home')
    expect(household.items.isEmpty()).toBe(false)
    expect(household.items.count('bandage')).toBe(0)
  })

  it('seeds 5 starting bandages only when hasHunter is true, on first construction', () => {
    const withHunter = createHousehold('h1', 's', 'home', undefined, true)
    expect(withHunter.items.count('bandage')).toBe(5)
    const withoutHunter = createHousehold('h2', 's', 'home', undefined, false)
    expect(withoutHunter.items.count('bandage')).toBe(0)
  })

  it('holds arbitrary item kinds (hunted meat/hide, crafted arrows) independent of scalar wood stock', () => {
    const household = createHousehold('h', 's', 'home')
    household.items.add('deer_meat', 2)
    household.items.add('hide', 1)
    household.items.add('arrow', 4)
    expect(household.items.count('deer_meat')).toBe(2)
    expect(household.items.count('hide')).toBe(1)
    expect(household.items.count('arrow')).toBe(4)
    // Unrelated to the scalar EconomicStock wood counter.
    expect(household.stock.query('wood')).not.toBe(0)
  })

  it('round-trips through snapshot()/createHousehold(initial) — WorldBundle rebuild carry', () => {
    const before = createHousehold('h', 's', 'home', undefined, true)
    before.items.add('deer_meat', 3)
    before.items.remove('bandage', 2)
    const foodBefore = before.foodCount()
    const snapshot = before.snapshot()
    const after = createHousehold('h', 's', 'home', snapshot)
    expect(after.items.count('deer_meat')).toBe(3)
    expect(after.items.count('bandage')).toBe(3)
    expect(after.foodCount()).toBe(foodBefore)
  })

  it('a carried snapshot never re-seeds starting bandages or starting food even when hasHunter is passed again', () => {
    const before = createHousehold('h', 's', 'home', undefined, true)
    before.items.remove('bandage', 5)
    before.items.remove('bread', before.items.count('bread'))
    const snapshot = before.snapshot()
    const after = createHousehold('h', 's', 'home', snapshot, true)
    expect(after.items.count('bandage')).toBe(0)
    expect(after.foodCount()).toBe(0)
  })
})

describe('household.history (plan settlements-npcs-013)', () => {
  it('starts empty', () => {
    const household = createHousehold('h', 's', 'home')
    expect(household.history()).toEqual([])
  })

  it('records wood.deposited on deposit', () => {
    const household = createHousehold('h', 's', 'home')
    household.deposit('wood', 2, null, 10)
    const events = household.history()
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ type: 'wood.deposited', amount: 2, overflowed: 0, simTime: 10 })
  })

  it('records the overflow amount separately from what actually landed in the household', () => {
    const household = createHousehold('h', 's', 'home')
    const economy = createSettlementEconomy('s', {}, [])
    const before = household.stock.query('wood')
    const room = 5 - before // wood capacity is 5
    household.deposit('wood', room + 3, economy, 1)
    const [wood] = household.history()
    expect(wood).toMatchObject({ type: 'wood.deposited', amount: room, overflowed: 3 })
    expect(economy.query('wood')).toBe(3)
  })

  it('records food.deposited and food.taken with the concrete ItemKind', () => {
    // Keeps the default starting food (> minimum) so depositing/taking one
    // unit doesn't also cross a shortage boundary — isolates this test to
    // just the deposited/taken events.
    const household = createHousehold('h', 's', 'home')
    household.depositFood('carrot', 2, null, 5)
    household.takeFood(6)
    const events = household.history()
    expect(events).toContainEqual(expect.objectContaining({ type: 'food.deposited', itemKind: 'carrot', amount: 2, simTime: 5 }))
    expect(events).toContainEqual(expect.objectContaining({ type: 'food.taken', simTime: 6 }))
  })

  it('records shortage.detected only on the 0 -> >0 crossing, not every tick below minimum', () => {
    const household = createHousehold('h', 's', 'home')
    household.items.remove('bread', household.items.count('bread'))
    household.depositFood('carrot', 1, null, 1) // -> foodCount 1, shortage 0
    household.takeFood(2) // foodCount 0 -> shortage crosses 0 -> >0
    const shortageEvents = household.history().filter((e) => e.type === 'shortage.detected')
    expect(shortageEvents).toHaveLength(1)
    expect(shortageEvents[0]).toMatchObject({ type: 'shortage.detected', kind: 'food', simTime: 2 })
  })

  it('records shortage.resolved only on the >0 -> 0 crossing', () => {
    const household = createHousehold('h', 's', 'home')
    household.items.remove('bread', household.items.count('bread'))
    expect(household.shortage('food')).toBeGreaterThan(0)
    household.depositFood('carrot', 1, null, 3) // crosses shortage 0
    household.depositFood('carrot', 5, null, 4) // already resolved, no second event
    const resolvedEvents = household.history().filter((e) => e.type === 'shortage.resolved')
    expect(resolvedEvents).toHaveLength(1)
    expect(resolvedEvents[0]).toMatchObject({ type: 'shortage.resolved', kind: 'food', simTime: 3 })
  })

  it('takeFood on an empty household records nothing (no food item was actually taken)', () => {
    const household = createHousehold('h', 's', 'home')
    household.items.remove('bread', household.items.count('bread'))
    expect(household.takeFood()).toBeNull()
    expect(household.history()).toEqual([])
  })

  it('assigns a strictly increasing local seq to every recorded event', () => {
    const household = createHousehold('h', 's', 'home')
    household.deposit('wood', 1, null, 1)
    household.deposit('wood', 1, null, 1)
    household.deposit('wood', 1, null, 1)
    const seqs = household.history().map((e) => e.seq)
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b))
    expect(new Set(seqs).size).toBe(seqs.length)
  })

  it('defaults simTime to 0 when the caller has no meaningful clock', () => {
    const household = createHousehold('h', 's', 'home')
    household.deposit('wood', 1)
    expect(household.history()[0]).toMatchObject({ simTime: 0 })
  })
})

describe('householdIdFor', () => {
  it('is stable and namespaced per settlement/family', () => {
    expect(householdIdFor('0_0', 0)).toBe(householdIdFor('0_0', 0))
    expect(householdIdFor('0_0', 0)).not.toBe(householdIdFor('0_0', 1))
    expect(householdIdFor('0_0', 0)).not.toBe(householdIdFor('1_0', 0))
  })
})

describe('createHouseholdRegistry', () => {
  it('reuses the same household when a settlement streams back in', () => {
    const registry = createHouseholdRegistry()
    const id = householdIdFor('0_0', 0)
    const first = registry.getOrCreate(id, '0_0', '0_0:home:0')
    first.deposit('wood', 5)
    const again = registry.getOrCreate(id, '0_0', '0_0:home:0')
    expect(again).toBe(first)
    expect(again.stock.query('wood')).toBe(first.stock.query('wood'))
    expect(again.water.current).toBe(first.water.current)
  })

  it('keeps different families in the same settlement on separate stock', () => {
    const registry = createHouseholdRegistry()
    const a = registry.getOrCreate(householdIdFor('0_0', 0), '0_0', '0_0:home:0')
    const b = registry.getOrCreate(householdIdFor('0_0', 1), '0_0', '0_0:home:1')
    a.deposit('wood', 5)
    expect(b.stock.query('wood')).not.toBe(a.stock.query('wood'))
  })

  it('serializes into plain data that seeds a fresh registry with matching (but distinct) stock — WorldBundle rebuild carry (plan 197 §8)', () => {
    const id = householdIdFor('0_0', 0)
    const before = createHouseholdRegistry()
    const household = before.getOrCreate(id, '0_0', '0_0:home:0')
    household.deposit('wood', 3)
    household.water.add(2)
    const woodBefore = household.stock.query('wood')
    const waterBefore = household.water.current
    const foodBefore = household.foodCount()

    const snapshot = before.serialize()
    const after = createHouseholdRegistry(snapshot)
    const hydrated = after.getOrCreate(id, '0_0', '0_0:home:0')

    expect(hydrated).not.toBe(household)
    expect(hydrated.stock.query('wood')).toBe(woodBefore)
    expect(hydrated.water.current).toBe(waterBefore)
    expect(hydrated.foodCount()).toBe(foodBefore)
  })

  it('a genuinely new household id not present in a carried snapshot gets the usual fresh jittered reserve', () => {
    const registry = createHouseholdRegistry({})
    const id = householdIdFor('0_0', 0)
    const household = registry.getOrCreate(id, '0_0', '0_0:home:0')
    expect(household.foodCount()).toBeGreaterThan(0)
  })

  it('forwards hasHunter to a genuinely new household (plan 178 §11)', () => {
    const registry = createHouseholdRegistry()
    const household = registry.getOrCreate(householdIdFor('0_0', 0), '0_0', '0_0:home:0', true)
    expect(household.items.count('bandage')).toBe(5)
  })

  it('ignores hasHunter when the household already exists (getOrCreate reuses it as-is)', () => {
    const registry = createHouseholdRegistry()
    const id = householdIdFor('0_0', 0)
    registry.getOrCreate(id, '0_0', '0_0:home:0', false)
    const again = registry.getOrCreate(id, '0_0', '0_0:home:0', true)
    expect(again.items.count('bandage')).toBe(0)
  })
})
