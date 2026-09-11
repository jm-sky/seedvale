import { describe, expect, it } from 'vitest'
import { planProfessionWork, type NpcWorkContext } from './ai/npcProfessionWork'
import {
  commitDressingProduction,
  commitTextileWorkProduction,
  DRESSING_PRODUCTION,
  executeProduction,
  FLAX_LINEN_PRODUCTION,
  LINEN_BANDAGE_PRODUCTION,
  TEXTILE_WORKER_PRODUCTIONS,
} from './economy'
import { Inventory } from './items/Inventory'
import { CONSUMABLE_KINDS_BY_NEED, ITEM_CATALOG } from './items/itemCatalog'
import { createHousehold } from './settlement/household'
import { nearestHerbalGatherTarget } from './world/herbalGathering'

const HOME = { x: 0, y: 0, z: 0 }
const LANDMARKS = {
  home: HOME,
  well: HOME,
  market: HOME,
  garden: HOME,
  stockpile: HOME,
  settlementStorage: HOME,
  dock: undefined,
  trees: [],
} as unknown as NpcWorkContext['landmarks']

function baseCtx(overrides: Partial<NpcWorkContext> = {}): NpcWorkContext {
  return {
    role: 'farmer',
    x: 0,
    z: 0,
    waitMultiplier: 1,
    simTime: () => 0,
    rollWorkDurationSec: () => 1,
    home: HOME as unknown as NpcWorkContext['home'],
    landmarks: LANDMARKS,
    workplace: null,
    household: null,
    economy: null,
    carried: new Inventory(),
    transportCargo: new Inventory(),
    guardPatrolIndex: 0,
    advanceGuardPatrol: () => {},
    fishAttempt: 0,
    nextFishAttempt: () => 1,
    sampleHeight: () => 0,
    mining: null,
    foodSources: null,
    householdExchange: null,
    npcId: 'npc:test',
    transportOrders: null,
    strength: 0.5,
    ...overrides,
  }
}

describe('settlements-npcs-007 items', () => {
  it('keeps herb and bandage as health consumables and adds dressing', () => {
    expect(ITEM_CATALOG.herb.consumable?.need).toBe('health')
    expect(ITEM_CATALOG.bandage.consumable?.need).toBe('health')
    expect(ITEM_CATALOG.dressing.consumable?.need).toBe('health')
    expect(ITEM_CATALOG.poisonous_herb.consumable).toBeUndefined()
    expect(CONSUMABLE_KINDS_BY_NEED.health[0]).toBe('dressing')
  })
})

describe('settlements-npcs-007 production', () => {
  it('runs flax → linen → bandage through the shared executor', () => {
    const household = createHousehold('h', 's', 'home')
    household.items.add('flax', 3)
    expect(executeProduction(FLAX_LINEN_PRODUCTION, { inventory: household.items }).ok).toBe(true)
    expect(household.items.count('flax')).toBe(0)
    expect(household.items.count('linen_material')).toBe(1)

    expect(executeProduction(LINEN_BANDAGE_PRODUCTION, { inventory: household.items }).ok).toBe(true)
    expect(household.items.count('linen_material')).toBe(0)
    expect(household.items.count('bandage')).toBe(1)
  })

  it('dressing requires bandage and herb', () => {
    const household = createHousehold('h', 's', 'home')
    expect(executeProduction(DRESSING_PRODUCTION, { inventory: household.items }).ok).toBe(false)
    household.items.add('bandage', 1)
    expect(executeProduction(DRESSING_PRODUCTION, { inventory: household.items }).ok).toBe(false)
    household.items.add('herb', 1)
    expect(commitDressingProduction(household)).toBe(true)
    expect(household.items.count('dressing')).toBe(1)
    expect(household.items.count('bandage')).toBe(0)
    expect(household.items.count('herb')).toBe(0)
  })

  it('textile worker priority keeps wool before linen chain', () => {
    const household = createHousehold('h', 's', 'home')
    household.items.add('wool', 4)
    household.items.add('flax', 3)
    expect(commitTextileWorkProduction(household)).toBe(true)
    expect(household.items.count('wool')).toBe(0)
    expect(household.items.count('flax')).toBe(3)
    expect(TEXTILE_WORKER_PRODUCTIONS[0]?.id).toBe('textile_worker.wool_material')
  })
})

describe('settlements-npcs-007 herbal gather', () => {
  it('picks the nearest herbal target with stable id tie-break', () => {
    const target = nearestHerbalGatherTarget(0, 0, [
      { id: 'b', kind: 'herb', x: 2, z: 0 },
      { id: 'a', kind: 'flax', x: 2, z: 0 },
    ], 5)
    expect(target?.id).toBe('a')
  })
})

describe('settlements-npcs-007 herbalist work', () => {
  const workplace = { position: { x: 1, y: 0, z: 1 } } as NpcWorkContext['workplace']

  it('produces dressing at home when inputs exist', () => {
    const household = createHousehold('h', 's', 'home')
    household.items.add('bandage', 1)
    household.items.add('herb', 1)
    const work = planProfessionWork(baseCtx({ role: 'herbalist', household, workplace }))
    work?.onComplete()
    expect(household.items.count('dressing')).toBe(1)
  })

  it('gathers a world herb into carried then deposits to household', () => {
    const household = createHousehold('h', 's', 'home')
    const carried = new Inventory()
    const herbalGather = {
      queryNearest: () => ({ id: '0:0:f0', kind: 'herb' as const, x: 3, z: 0 }),
      harvest: () => ({ count: 1, kind: 'herb' as const }),
    }
    const work = planProfessionWork(baseCtx({
      role: 'herbalist',
      household,
      workplace,
      herbalGather,
      carried,
      x: 0,
      z: 0,
    }))
    expect(work?.kind).toBe('work')
    work?.onComplete()
    expect(carried.count('herb')).toBe(1)
    work?.next?.onComplete()
    expect(household.items.count('herb')).toBe(1)
    expect(carried.count('herb')).toBe(0)
  })
})
