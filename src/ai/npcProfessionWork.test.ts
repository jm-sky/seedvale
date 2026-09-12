import { describe, expect, it } from 'vitest'
import type { ShepherdFlockHooks } from '../fauna/shepherdFlock'
import type { NpcWorkContext } from './npcProfessionWork'
import { createSettlementEconomy } from '../economy'
import { WOOL_YIELD } from '../fauna/livestockProduction'
import { Inventory } from '../items/Inventory'
import { createWeaponInstance } from '../items/weaponMaintenance'
import { physicalWorkDuration } from '../player/physicalWorkStrength'
import { createHousehold } from '../settlement/household'
import { MINE_DURATION_SEC } from '../terrain/depositMining'
import { createTransportOrders } from '../world/createTransportOrders'
import { FISHING_CAST_DURATION_SEC } from '../world/fishing'
import { BLACKSMITH_SHARPEN_THRESHOLD, findWeaponNeedingMaintenance, planProfessionWork, selectTraderCollectionGoods } from './npcProfessionWork'

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
    const mining = {
      queryNearest: () => ({ id: 'd1', type: 'iron' as const, x: 1, z: 1, remaining: 5 }),
      mine: () => ({ ok: true as const, yield: { kind: 'iron' as const, count: 1 }, remaining: 4 }),
    }

    it('returns null without carry room for the ore kind', () => {
      const carried = new Inventory(undefined, 0.001)
      const ctx = baseCtx({ role: 'miner', mining, economy: createSettlementEconomy('s', {}, []), carried })
      expect(planProfessionWork(ctx)).toBeNull()
    })

    it('returns null without mining hooks or economy', () => {
      expect(planProfessionWork(baseCtx({ role: 'miner' }))).toBeNull()
    })

    it('preserves legacy mining duration at Strength 0.5 and leaves the deposit step unchanged', () => {
      const ctx = baseCtx({
        role: 'miner',
        mining,
        economy: createSettlementEconomy('s', {}, []),
        strength: 0.5,
        waitMultiplier: 2,
      })
      const work = planProfessionWork(ctx)
      expect(work?.kind).toBe('mine')
      expect(work?.durationSec).toBe(MINE_DURATION_SEC * 2)
      expect(work?.next?.durationSec).toBe(0.8 * 2)
    })

    it('applies the shared physical-work Strength rule to mining only', () => {
      const strong = planProfessionWork(baseCtx({
        role: 'miner',
        mining,
        economy: createSettlementEconomy('s', {}, []),
        strength: 1,
      }))
      const weak = planProfessionWork(baseCtx({
        role: 'miner',
        mining,
        economy: createSettlementEconomy('s', {}, []),
        strength: 0,
      }))
      expect(strong?.durationSec).toBe(physicalWorkDuration(MINE_DURATION_SEC, 1))
      expect(weak?.durationSec).toBe(physicalWorkDuration(MINE_DURATION_SEC, 0))
      expect(strong?.durationSec).toBeLessThan(MINE_DURATION_SEC)
      expect(weak?.durationSec).toBeGreaterThan(MINE_DURATION_SEC)
      expect(strong?.next?.durationSec).toBe(0.8)
      expect(weak?.next?.durationSec).toBe(0.8)
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
      const ctx = baseCtx({ role: 'farmer', household, foodSources: foodSources as unknown as NpcWorkContext['foodSources'], strength: 1 })
      const work = planProfessionWork(ctx)
      expect(work?.kind).toBe('harvest')
      expect(work?.durationSec).toBe(3)
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

    it('farms around a supplied Player-garden cultivation anchor', () => {
      const household = createHousehold('h', 's', 'home:h')
      const queried: { x: number, z: number }[] = []
      const foodSources = {
        queryHarvestableCrop: (x: number, z: number) => {
          queried.push({ x, z })
          return { kind: 'crop' as const, x: 41, z: 51, itemKind: 'carrot' }
        },
        harvest: () => ({ count: 2, kind: 'carrot' as const }),
        findPlantSpot: () => ({ x: 2, z: 2 }),
        plant: () => true,
      }
      const ctx = baseCtx({
        role: 'farmer',
        household,
        foodSources: foodSources as unknown as NpcWorkContext['foodSources'],
        cultivationAnchor: { position: { x: 40, z: 50 }, radius: 2.5 },
      })
      const work = planProfessionWork(ctx)
      expect(work?.kind).toBe('harvest')
      expect(queried).toEqual([{ x: 40, z: 50 }])
      work?.onComplete?.()
      expect(household.items.count('carrot')).toBe(2)
    })

    it('plants household seed around a Player-garden anchor without duplicating crop state', () => {
      const household = createHousehold('h', 's', 'home:h')
      household.items.add('seed_carrot', 1)
      let planted = 0
      const foodSources = {
        queryHarvestableCrop: () => null,
        harvest: () => null,
        findPlantSpot: (x: number, z: number) => ({ x: x + 1, z: z + 1 }),
        plant: () => {
          planted += 1
          return true
        },
      }
      const work = planProfessionWork(baseCtx({
        role: 'farmer',
        household,
        foodSources: foodSources as unknown as NpcWorkContext['foodSources'],
        cultivationAnchor: { position: { x: 40, z: 50 }, radius: 2.5 },
      }))
      expect(work?.kind).toBe('plant')
      work?.onComplete?.()
      expect(household.items.count('seed_carrot')).toBe(0)
      expect(planted).toBe(1)
    })

    it('farms the first settlement cultivation anchor, so a field listed first wins over gardens', () => {
      const household = createHousehold('h', 's', 'home:h')
      const queried: { x: number, z: number }[] = []
      const foodSources = {
        queryHarvestableCrop: (x: number, z: number) => {
          queried.push({ x, z })
          return { kind: 'crop' as const, x: 21, z: 31, itemKind: 'carrot' }
        },
        harvest: () => ({ count: 1, kind: 'carrot' as const }),
        findPlantSpot: () => ({ x: 2, z: 2 }),
        plant: () => true,
      }
      const landmarks = {
        ...LANDMARKS,
        cultivationAnchors: [
          { position: { x: 20, z: 30 }, radius: 3.2 },
          { position: { x: 5, z: 5 }, radius: 4 },
        ],
      } as unknown as NpcWorkContext['landmarks']
      const work = planProfessionWork(baseCtx({
        role: 'farmer',
        household,
        foodSources: foodSources as unknown as NpcWorkContext['foodSources'],
        landmarks,
      }))
      expect(work?.kind).toBe('harvest')
      expect(queried).toEqual([{ x: 20, z: 30 }])
    })
  })

  describe('fisher', () => {
    it('returns null without a dock (no landmarks.dock)', () => {
      const ctx = baseCtx({ role: 'fisher' })
      expect(planProfessionWork(ctx)).toBeNull()
    })

    it('casts at the dock when one exists and there is carry room', () => {
      const landmarks = { ...LANDMARKS, dock: { x: 3, y: 0, z: 3 } } as unknown as NpcWorkContext['landmarks']
      const ctx = baseCtx({ role: 'fisher', landmarks, strength: 1 })
      const work = planProfessionWork(ctx)
      expect(work?.kind).toBe('fish')
      expect(work?.durationSec).toBe(FISHING_CAST_DURATION_SEC)
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
        findById: (id: string) => id === sourceHousehold.id
          ? { household: sourceHousehold, position: { x: 1, y: 0, z: 1 } }
          : null,
      }
      const transportOrders = createTransportOrders()
      const ctx = baseCtx({
        role: 'trader',
        npcId: 'npc:trader',
        household,
        economy,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
        householdExchange: householdExchange as unknown as NpcWorkContext['householdExchange'],
        transportOrders,
      })
      const work = planProfessionWork(ctx)
      expect(work).not.toBeNull()
      expect(work?.kind).toBe('work')
      const order = transportOrders.findByCarrier('npc:trader')
      expect(order?.source).toEqual({ type: 'household', householdId: 'source' })
      expect(order?.destination).toEqual({ type: 'settlement-storage', settlementId: 's' })
      expect(order?.itemKind).toBe('carrot')
      expect(order?.state).toBe('assigned')
    })

    it('physically collects one concrete food kind into settlement storage via TransportOrder', () => {
      const household = createHousehold('h', 's', 'home:h')
      household.items.remove('bread', household.items.count('bread'))
      const economy = createSettlementEconomy('s', {}, [])
      const sourceHousehold = createHousehold('source', 's', 'home:source')
      sourceHousehold.items.remove('bread', sourceHousehold.items.count('bread'))
      sourceHousehold.depositFood('carrot', 10)
      const sourceCount = sourceHousehold.items.count('carrot')
      const householdExchange = {
        findSurplusSource: () => ({ household: sourceHousehold, position: { x: 1, y: 0, z: 1 } }),
        findById: (id: string) => id === sourceHousehold.id
          ? { household: sourceHousehold, position: { x: 1, y: 0, z: 1 } }
          : null,
      }
      const transportOrders = createTransportOrders()
      const transportCargo = new Inventory()
      const ctx = baseCtx({
        role: 'trader',
        npcId: 'npc:trader',
        household,
        economy,
        transportCargo,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
        householdExchange: householdExchange as unknown as NpcWorkContext['householdExchange'],
        transportOrders,
      })
      const work = planProfessionWork(ctx)!
      const before = sourceCount + transportCargo.count('carrot') + economy.items.count('carrot')
      work.onComplete?.()
      const order = transportOrders.findByCarrier('npc:trader')
      expect(order?.state).toBe('in-transit')
      expect(sourceHousehold.items.count('carrot') + transportCargo.count('carrot') + economy.items.count('carrot')).toBe(before)
      work.next?.onComplete?.()
      expect(transportOrders.find(order!.id)?.state).toBe('completed')
      expect(transportCargo.count('carrot')).toBe(0)
      expect(economy.items.count('carrot')).toBe(order!.claimedQuantity)
      expect(sourceHousehold.items.count('carrot') + transportCargo.count('carrot') + economy.items.count('carrot')).toBe(before)
    })

    it('resumes an in-transit order without creating a replacement', () => {
      const household = createHousehold('h', 's', 'home:h')
      household.items.remove('bread', household.items.count('bread'))
      const economy = createSettlementEconomy('s', {}, [])
      const sourceHousehold = createHousehold('source', 's', 'home:source')
      sourceHousehold.items.remove('bread', sourceHousehold.items.count('bread'))
      sourceHousehold.depositFood('carrot', 10)
      const householdExchange = {
        findSurplusSource: () => ({ household: sourceHousehold, position: { x: 1, y: 0, z: 1 } }),
        findById: (id: string) => id === sourceHousehold.id
          ? { household: sourceHousehold, position: { x: 1, y: 0, z: 1 } }
          : null,
      }
      const transportOrders = createTransportOrders()
      const ctx = baseCtx({
        role: 'trader',
        npcId: 'npc:trader',
        household,
        economy,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
        householdExchange: householdExchange as unknown as NpcWorkContext['householdExchange'],
        transportOrders,
      })
      const first = planProfessionWork(ctx)!
      first.onComplete?.()
      const orderId = transportOrders.findByCarrier('npc:trader')!.id
      const resumed = planProfessionWork(ctx)
      expect(resumed?.kind).toBe('deposit')
      expect(transportOrders.list()).toHaveLength(1)
      expect(transportOrders.findByCarrier('npc:trader')?.id).toBe(orderId)
    })

    it('selects one concrete food kind deterministically from mixed surplus', () => {
      const sourceHousehold = createHousehold('source', 's', 'home:source')
      sourceHousehold.items.remove('bread', sourceHousehold.items.count('bread'))
      sourceHousehold.depositFood('fish', 6)
      sourceHousehold.depositFood('carrot', 6)
      const picked = selectTraderCollectionGoods(sourceHousehold, new Inventory())
      expect(picked).not.toBeNull()
      expect(picked!.quantity).toBeGreaterThan(0)
      expect(picked!.quantity).toBeLessThanOrEqual(3)
      const again = selectTraderCollectionGoods(sourceHousehold, new Inventory())
      expect(again).toEqual(picked)
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

  describe('shepherd (plan fauna-004)', () => {
    const ownerHouseId = 'home:h'

    function flockHooks(opts: {
      woolReady?: boolean
      shear?: (nowDays: number) => boolean
      x?: number
      z?: number
    } = {}): { flock: ShepherdFlockHooks, sheared: { value: boolean } } {
      const sheared = { value: false }
      let woolReady = opts.woolReady ?? true
      const view = {
        animalId: 'sheep-house0-0',
        x: opts.x ?? 3,
        z: opts.z ?? 4,
        ownerHouseId,
        isAlive: true,
        woolReady,
      }
      const flock: ShepherdFlockHooks = {
        listOwned: () => [{ ...view, woolReady }],
        resolve: () => ({
          ...view,
          woolReady,
          shear: (nowDays) => {
            if (opts.shear) return opts.shear(nowDays)
            if (!woolReady) return false
            woolReady = false
            sheared.value = true
            return true
          },
        }),
      }
      return { flock, sheared }
    }

    it('does not shear without a shearing tool', () => {
      const household = createHousehold('h', 's', ownerHouseId)
      const { flock, sheared } = flockHooks()
      const work = planProfessionWork(baseCtx({
        role: 'shepherd',
        household,
        shepherdFlock: flock,
        hasShearingTool: () => false,
        nowDays: () => 24,
      }))
      expect(work?.kind).not.toBe('shear')
      work?.onComplete()
      expect(sheared.value).toBe(false)
      expect(work && 'followAnimalId' in work ? work.followAnimalId : undefined).not.toBe('sheep-house0-0')
    })

    it('does not shear or move the wool anchor when carry capacity cannot take the yield', () => {
      const household = createHousehold('h', 's', ownerHouseId)
      const { flock, sheared } = flockHooks()
      const carried = new Inventory(undefined, 0.1)
      const work = planProfessionWork(baseCtx({
        role: 'shepherd',
        household,
        carried,
        shepherdFlock: flock,
        hasShearingTool: () => true,
        nowDays: () => 24,
      }))
      expect(work?.kind).not.toBe('shear')
      work?.onComplete()
      expect(sheared.value).toBe(false)
      expect(carried.count('wool')).toBe(0)
    })

    it('does not create wool when the action is interrupted before complete', () => {
      const household = createHousehold('h', 's', ownerHouseId)
      const { flock, sheared } = flockHooks()
      const carried = new Inventory()
      const work = planProfessionWork(baseCtx({
        role: 'shepherd',
        household,
        carried,
        shepherdFlock: flock,
        hasShearingTool: () => true,
        nowDays: () => 24,
      }))
      expect(work?.kind).toBe('shear')
      expect(work?.followAnimalId).toBe('sheep-house0-0')
      expect(sheared.value).toBe(false)
      expect(carried.count('wool')).toBe(0)
    })

    it('on success adds exactly 4 wool, shears once, and deposits into household items', () => {
      const household = createHousehold('h', 's', ownerHouseId)
      const { flock, sheared } = flockHooks()
      const carried = new Inventory()
      const work = planProfessionWork(baseCtx({
        role: 'shepherd',
        household,
        carried,
        shepherdFlock: flock,
        hasShearingTool: () => true,
        nowDays: () => 24,
      }))
      expect(work?.kind).toBe('shear')
      work?.onComplete()
      expect(sheared.value).toBe(true)
      expect(carried.count('wool')).toBe(WOOL_YIELD)
      work?.next?.onComplete()
      expect(carried.count('wool')).toBe(0)
      expect(household.items.count('wool')).toBe(WOOL_YIELD)
    })

    it('deposits already-carried wool home without using the food path', () => {
      const household = createHousehold('h', 's', ownerHouseId)
      const { flock } = flockHooks({ woolReady: false, x: 1, z: 1 })
      const carried = new Inventory()
      carried.add('wool', 4)
      const work = planProfessionWork(baseCtx({
        role: 'shepherd',
        household,
        carried,
        shepherdFlock: flock,
        hasShearingTool: () => true,
        nowDays: () => 10,
      }))
      expect(work?.kind).toBe('deposit')
      work?.onComplete()
      expect(carried.count('wool')).toBe(0)
      expect(household.items.count('wool')).toBe(4)
    })
  })

  describe('textile_worker (plan settlements-npcs-006)', () => {
    const workplace = { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace']

    it('returns null without a runnable recipe, a household, or a workplace', () => {
      const household = createHousehold('h', 's', 'home')
      expect(planProfessionWork(baseCtx({ role: 'textile_worker', household, workplace }))).toBeNull()
      expect(planProfessionWork(baseCtx({ role: 'textile_worker', workplace }))).toBeNull()
      household.items.add('wool', 4)
      expect(planProfessionWork(baseCtx({ role: 'textile_worker', household }))).toBeNull()
    })

    it('can process flax when wool is unavailable (plan settlements-npcs-007)', () => {
      const household = createHousehold('h', 's', 'home')
      household.items.add('flax', 3)
      const work = planProfessionWork(baseCtx({ role: 'textile_worker', household, workplace }))
      work?.onComplete()
      expect(household.items.count('flax')).toBe(0)
      expect(household.items.count('linen_material')).toBe(1)
    })

    it('preview does not mutate inventory', () => {
      const household = createHousehold('h', 's', 'home')
      household.items.add('wool', 4)
      const work = planProfessionWork(baseCtx({ role: 'textile_worker', household, workplace }))
      expect(work?.kind).toBe('work')
      expect(household.items.count('wool')).toBe(4)
      expect(household.items.count('wool_material')).toBe(0)
    })

    it('0–3 wool is a blocked profession outcome, not a started recipe', () => {
      for (const amount of [0, 1, 2, 3]) {
        const household = createHousehold('h', 's', 'home')
        if (amount > 0) household.items.add('wool', amount)
        expect(planProfessionWork(baseCtx({ role: 'textile_worker', household, workplace }))).toBeNull()
        expect(household.items.count('wool')).toBe(amount)
        expect(household.items.count('wool_material')).toBe(0)
      }
    })

    it('interruption before completion consumes no wool', () => {
      const household = createHousehold('h', 's', 'home')
      household.items.add('wool', 4)
      const work = planProfessionWork(baseCtx({ role: 'textile_worker', household, workplace }))
      expect(work?.kind).toBe('work')
      expect(household.items.count('wool')).toBe(4)
      expect(household.items.count('wool_material')).toBe(0)
    })

    it('stale wool on completion fails without partial consume', () => {
      const household = createHousehold('h', 's', 'home')
      household.items.add('wool', 4)
      const work = planProfessionWork(baseCtx({ role: 'textile_worker', household, workplace }))
      expect(household.items.remove('wool', 4)).toBe(true)
      work?.onComplete()
      expect(household.items.count('wool')).toBe(0)
      expect(household.items.count('wool_material')).toBe(0)
    })

    it('successful completion consumes 4 wool and creates 12 wool_material once', () => {
      const household = createHousehold('h', 's', 'home')
      household.items.add('wool', 8)
      const work = planProfessionWork(baseCtx({ role: 'textile_worker', household, workplace }))
      work?.onComplete()
      expect(household.items.count('wool')).toBe(4)
      expect(household.items.count('wool_material')).toBe(12)
      work?.onComplete()
      expect(household.items.count('wool')).toBe(0)
      expect(household.items.count('wool_material')).toBe(24)
    })

    it('does not take wool from another household', () => {
      const worker = createHousehold('worker', 's', 'home:worker')
      const other = createHousehold('other', 's', 'home:other')
      other.items.add('wool', 8)
      const work = planProfessionWork(baseCtx({ role: 'textile_worker', household: worker, workplace }))
      expect(work).toBeNull()
      work?.onComplete()
      expect(other.items.count('wool')).toBe(8)
      expect(worker.items.count('wool_material')).toBe(0)
      expect(other.items.count('wool_material')).toBe(0)
    })

    it('can consume wool previously deposited by a shepherd', () => {
      const household = createHousehold('h', 's', 'home')
      household.items.add('wool', WOOL_YIELD)
      const work = planProfessionWork(baseCtx({ role: 'textile_worker', household, workplace }))
      work?.onComplete()
      expect(household.items.count('wool')).toBe(0)
      expect(household.items.count('wool_material')).toBe(12)
    })
  })
})
