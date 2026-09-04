import { describe, expect, it } from 'vitest'
import type { NpcWorkContext } from './npcProfessionWork'
import { createSettlementEconomy } from '../economy'
import { Inventory } from '../items/Inventory'
import { createWeaponInstance } from '../items/weaponMaintenance'
import { createHousehold } from '../settlement/household'
import { BLACKSMITH_SHARPEN_THRESHOLD, findWeaponNeedingMaintenance, planProfessionWork } from './npcProfessionWork'

const HOME = { x: 0, y: 0, z: 0 }
const WELL = { x: 10, y: 0, z: 0 }
const MARKET = { x: 20, y: 0, z: 0 }
const GARDEN = { x: 5, y: 0, z: 5 }
const STOCKPILE = { x: 8, y: 0, z: 0 }
const SETTLEMENT_STORAGE = { x: 9, y: 0, z: 0 }
const LANDMARKS = {
  home: HOME,
  well: WELL,
  market: MARKET,
  garden: GARDEN,
  stockpile: STOCKPILE,
  settlementStorage: SETTLEMENT_STORAGE,
  dock: undefined,
  trees: [],
} as unknown as NpcWorkContext['landmarks']

function baseCtx(overrides: Partial<NpcWorkContext> = {}): NpcWorkContext {
  return {
    role: 'woodcutter',
    x: 0,
    z: 0,
    waitMultiplier: 1,
    simTime: () => 0,
    rollWorkDurationSec: () => 3,
    home: HOME as unknown as NpcWorkContext['home'],
    landmarks: LANDMARKS,
    workplace: null,
    household: null,
    economy: null,
    carried: new Inventory(),
    guardPatrolIndex: 0,
    advanceGuardPatrol: () => {},
    fishAttempt: 0,
    nextFishAttempt: () => 1,
    sampleHeight: () => 0,
    mining: null,
    foodSources: null,
    householdExchange: null,
    ...overrides,
  }
}

/** Plan settlements-npcs-002 §8/§10 — Blacksmith's target-selection helper.
 *  `sharpenWeapon()` itself is already covered by `weaponMaintenance.test.ts`;
 *  this only covers finding which instance needs it. */
describe('findWeaponNeedingMaintenance (blacksmith work)', () => {
  it('returns null for an inventory with no weapon instances', () => {
    const inventory = new Inventory()
    expect(findWeaponNeedingMaintenance(inventory)).toBeNull()
  })

  it('returns null when every weapon is at/above the maintenance threshold', () => {
    const inventory = new Inventory()
    inventory.addInstance(createWeaponInstance('knife'))
    expect(findWeaponNeedingMaintenance(inventory)).toBeNull()
  })

  it('finds a weapon instance below the sharpness threshold', () => {
    const inventory = new Inventory()
    const worn = createWeaponInstance('axe')
    inventory.addInstance(worn)
    inventory.updateInstance(worn.id, (inst) => ({ ...inst, sharpness: BLACKSMITH_SHARPEN_THRESHOLD - 0.1 }))
    const found = findWeaponNeedingMaintenance(inventory)
    expect(found?.id).toBe(worn.id)
  })

  it('picks the stable lowest-id match when multiple weapons need maintenance, never at random', () => {
    const inventory = new Inventory()
    const a = createWeaponInstance('knife')
    const b = createWeaponInstance('axe')
    inventory.addInstance(a)
    inventory.addInstance(b)
    inventory.updateInstance(a.id, (inst) => ({ ...inst, sharpness: 0.2 }))
    inventory.updateInstance(b.id, (inst) => ({ ...inst, sharpness: 0.2 }))
    const expectedId = [a.id, b.id].sort()[0]
    expect(findWeaponNeedingMaintenance(inventory)?.id).toBe(expectedId)
  })
})

describe('planProfessionWork', () => {
  it('returns null for a role with no profession planner', () => {
    expect(planProfessionWork(baseCtx({ role: 'woodcutter' }))).toBeNull()
  })

  describe('miner', () => {
    it('returns null without carry room for the ore kind', () => {
      const carried = new Inventory(undefined, 0.001)
      const mining = {
        queryNearest: () => ({ id: 'd1', type: 'iron' as const, x: 1, z: 1, remaining: 5 }),
        mine: () => ({ ok: true as const, yield: { kind: 'iron' as const, count: 1 }, remaining: 4 }),
      }
      const ctx = baseCtx({ role: 'miner', mining, economy: createSettlementEconomy('s', {}, []), carried })
      expect(planProfessionWork(ctx)).toBeNull()
    })

    it('returns null without mining hooks or economy', () => {
      expect(planProfessionWork(baseCtx({ role: 'miner' }))).toBeNull()
    })
  })

  describe('farmer', () => {
    it('prefers a harvestable crop over planting', () => {
      const household = createHousehold('h', 's', 'home:h')
      household.items.add('seed_carrot', 1)
      const foodSources = {
        queryHarvestableCrop: () => ({ kind: 'crop' as const, x: 1, z: 1, itemKind: 'carrot' }),
        harvest: () => ({ count: 1, kind: 'carrot' as const }),
        findPlantSpot: () => ({ x: 2, z: 2 }),
        plant: () => true,
      }
      const ctx = baseCtx({ role: 'farmer', household, foodSources: foodSources as unknown as NpcWorkContext['foodSources'] })
      const work = planProfessionWork(ctx)
      expect(work?.kind).toBe('harvest')
    })

    it('never plants without a real seed item in the household', () => {
      const household = createHousehold('h', 's', 'home:h')
      household.items.remove('seed_carrot', household.items.count('seed_carrot'))
      household.items.remove('seed_potato', household.items.count('seed_potato'))
      household.items.remove('seed_cabbage', household.items.count('seed_cabbage'))
      const foodSources = {
        queryHarvestableCrop: () => null,
        harvest: () => null,
        findPlantSpot: () => ({ x: 2, z: 2 }),
        plant: () => true,
      }
      const ctx = baseCtx({ role: 'farmer', household, foodSources: foodSources as unknown as NpcWorkContext['foodSources'] })
      expect(planProfessionWork(ctx)).toBeNull()
    })

    it('returns null without foodSources hooks', () => {
      expect(planProfessionWork(baseCtx({ role: 'farmer' }))).toBeNull()
    })
  })

  describe('fisher', () => {
    it('returns null without a dock (no landmarks.dock)', () => {
      const ctx = baseCtx({ role: 'fisher' })
      expect(planProfessionWork(ctx)).toBeNull()
    })

    it('casts at the dock when one exists and there is carry room', () => {
      const landmarks = { ...LANDMARKS, dock: { x: 3, y: 0, z: 3 } } as unknown as NpcWorkContext['landmarks']
      const ctx = baseCtx({ role: 'fisher', landmarks })
      const work = planProfessionWork(ctx)
      expect(work?.kind).toBe('fish')
    })
  })

  describe('guard', () => {
    it('cycles deterministically through its three patrol points', () => {
      let index = 0
      const destinations: unknown[] = []
      for (let i = 0; i < 6; i++) {
        const ctx = baseCtx({
          role: 'guard',
          guardPatrolIndex: index,
          advanceGuardPatrol: () => { index = (index + 1) % 3 },
        })
        const work = planProfessionWork(ctx)
        destinations.push(work?.destination)
      }
      // home, well, market, home, well, market — same fixed order every cycle.
      expect(destinations[0]).toEqual(destinations[3])
      expect(destinations[1]).toEqual(destinations[4])
      expect(destinations[2]).toEqual(destinations[5])
      expect(destinations[0]).not.toEqual(destinations[1])
    })

    it('always succeeds — the three patrol points always exist', () => {
      expect(planProfessionWork(baseCtx({ role: 'guard' }))).not.toBeNull()
    })
  })

  describe('trader', () => {
    it('falls through to cross-household collection when its own household has nothing to bring', () => {
      const household = createHousehold('h', 's', 'home:h')
      household.items.remove('bread', household.items.count('bread'))
      const economy = createSettlementEconomy('s', {}, [])
      const sourceHousehold = createHousehold('source', 's', 'home:source')
      sourceHousehold.items.remove('bread', sourceHousehold.items.count('bread'))
      sourceHousehold.depositFood('carrot', 10)
      const householdExchange = {
        findSurplusSource: () => ({ household: sourceHousehold, position: { x: 1, y: 0, z: 1 } }),
      }
      const ctx = baseCtx({
        role: 'trader',
        household,
        economy,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
        householdExchange: householdExchange as unknown as NpcWorkContext['householdExchange'],
      })
      const work = planProfessionWork(ctx)
      expect(work).not.toBeNull()
      expect(work?.kind).toBe('work')
    })

    it('returns null without a household, economy, or workplace', () => {
      expect(planProfessionWork(baseCtx({ role: 'trader' }))).toBeNull()
    })
  })

  describe('blacksmith', () => {
    it('returns null without a whetstone', () => {
      const household = createHousehold('h', 's', 'home:h')
      household.items.remove('whetstone', household.items.count('whetstone'))
      const ctx = baseCtx({
        role: 'blacksmith',
        household,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
      })
      expect(planProfessionWork(ctx)).toBeNull()
    })

    it('finds a weapon to sharpen when a whetstone and a worn weapon exist', () => {
      const household = createHousehold('h', 's', 'home:h')
      household.items.add('whetstone', 1)
      const worn = createWeaponInstance('axe')
      household.items.addInstance(worn)
      household.items.updateInstance(worn.id, (inst) => ({ ...inst, sharpness: 0.1 }))
      const ctx = baseCtx({
        role: 'blacksmith',
        household,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
      })
      const work = planProfessionWork(ctx)
      expect(work?.kind).toBe('sharpen')
    })
  })
})
