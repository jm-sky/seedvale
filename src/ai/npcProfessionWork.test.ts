import { describe, expect, it, vi } from 'vitest'
import type { ShepherdFlockHooks } from '../fauna/shepherdFlock'
import type { NpcWorkContext } from './npcProfessionWork'
import { BLACKSMITH_IRON_ROD_PRODUCTION } from '../economy/production'
import { createSettlementEconomy } from '../economy/settlementEconomy'
import { WOOL_YIELD } from '../fauna/livestockProduction'
import { Inventory } from '../items/Inventory'
import { createWeaponInstance } from '../items/weaponMaintenance'
import { physicalWorkDuration } from '../player/physicalWorkStrength'
import { createHousehold } from '../settlement/household'
import { createHouseholdExchangeHooks } from '../settlement/householdExchange'
import { MINE_DURATION_SEC } from '../terrain/depositMining'
import { createTransportOrders } from '../world/createTransportOrders'
import { FISHING_CAST_DURATION_SEC } from '../world/fishing'
import { createResourceSiteInventories } from '../world/resourceSiteInventory'
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
      queryNearest: () => ({
        id: 'd1',
        type: 'iron' as const,
        x: 1,
        y: 4,
        z: 1,
        spatialContext: { kind: 'surface' as const },
        remaining: 5,
      }),
      mine: () => ({ ok: true as const, yield: { kind: 'iron' as const, count: 1 }, remaining: 4 }),
      resolveEconomicSourceId: () => null,
    }

    it('returns null without mining hooks, economy, or resource-site inventories', () => {
      expect(planProfessionWork(baseCtx({ role: 'miner' }))).toBeNull()
      expect(planProfessionWork(baseCtx({
        role: 'miner',
        mining,
        economy: createSettlementEconomy('s', {}, []),
      }))).toBeNull()
    })

    it('preserves legacy mining duration at Strength 0.5 and does not chain a stockpile deposit', () => {
      const ctx = baseCtx({
        role: 'miner',
        mining,
        economy: createSettlementEconomy('s', {}, []),
        resourceSiteInventories: createResourceSiteInventories(),
        strength: 0.5,
        waitMultiplier: 2,
      })
      const work = planProfessionWork(ctx)
      expect(work?.kind).toBe('mine')
      expect(work?.durationSec).toBe(MINE_DURATION_SEC * 2)
      expect(work?.next).toBeUndefined()
    })

    it('uses the mining target\'s authoritative Y instead of surface sampleHeight (plan world-018)', () => {
      const ctx = baseCtx({
        role: 'miner',
        mining,
        economy: createSettlementEconomy('s', {}, []),
        resourceSiteInventories: createResourceSiteInventories(),
        sampleHeight: () => 99,
      })
      const work = planProfessionWork(ctx)
      expect(work?.kind).toBe('mine')
      expect(work?.destination).toEqual({ x: 1, y: 4, z: 1 })
    })

    it('applies the shared physical-work Strength rule to mining only', () => {
      const strong = planProfessionWork(baseCtx({
        role: 'miner',
        mining,
        economy: createSettlementEconomy('s', {}, []),
        resourceSiteInventories: createResourceSiteInventories(),
        strength: 1,
      }))
      const weak = planProfessionWork(baseCtx({
        role: 'miner',
        mining,
        economy: createSettlementEconomy('s', {}, []),
        resourceSiteInventories: createResourceSiteInventories(),
        strength: 0,
      }))
      expect(strong?.durationSec).toBe(physicalWorkDuration(MINE_DURATION_SEC, 1))
      expect(weak?.durationSec).toBe(physicalWorkDuration(MINE_DURATION_SEC, 0))
      expect(strong?.durationSec).toBeLessThan(MINE_DURATION_SEC)
      expect(weak?.durationSec).toBeGreaterThan(MINE_DURATION_SEC)
      expect(strong?.next).toBeUndefined()
      expect(weak?.next).toBeUndefined()
    })

    it('deposits extracted ore into the resource-site inventory, not settlement stock or carried', () => {
      const sites = createResourceSiteInventories()
      const economy = createSettlementEconomy('s', { iron: 0 }, [])
      const carried = new Inventory()
      const work = planProfessionWork(baseCtx({
        role: 'miner',
        mining,
        economy,
        resourceSiteInventories: sites,
        carried,
      }))
      work?.onComplete?.()
      expect(sites.get('d1')?.count('iron')).toBe(1)
      expect(economy.query('iron')).toBe(0)
      expect(economy.items.count('iron')).toBe(0)
      expect(carried.count('iron')).toBe(0)
    })

    it('keeps already-extracted site goods after a reconstructed miner context', () => {
      const sites = createResourceSiteInventories()
      const economy = createSettlementEconomy('s', { iron: 0 }, [])
      planProfessionWork(baseCtx({
        role: 'miner',
        mining,
        economy,
        resourceSiteInventories: sites,
      }))?.onComplete?.()
      expect(sites.get('d1')?.count('iron')).toBe(1)
      planProfessionWork(baseCtx({
        role: 'miner',
        mining,
        economy,
        resourceSiteInventories: sites,
        npcId: 'npc:miner-rebuilt',
      }))?.onComplete?.()
      expect(sites.get('d1')?.count('iron')).toBe(2)
      expect(economy.query('iron')).toBe(0)
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

    it('deposits recovered cultivated seeds into Household.items', () => {
      const household = createHousehold('h', 's', 'home:h')
      const before = household.items.count('seed_carrot')
      const foodSources = {
        queryHarvestableCrop: () => ({ kind: 'crop' as const, x: 1, z: 1, itemKind: 'carrot' }),
        harvest: () => ({
          count: 1,
          kind: 'carrot' as const,
          recoveredSeeds: { kind: 'seed_carrot' as const, count: 2 },
        }),
        findPlantSpot: () => ({ x: 2, z: 2 }),
        plant: () => true,
      }
      const work = planProfessionWork(baseCtx({
        role: 'farmer',
        household,
        foodSources: foodSources as unknown as NpcWorkContext['foodSources'],
      }))
      expect(work?.kind).toBe('harvest')
      work?.onComplete?.()
      expect(household.items.count('carrot')).toBe(1)
      expect(household.items.count('seed_carrot')).toBe(before + 2)
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
      const economy = createSettlementEconomy('s', {}, [{ kind: 'food', target: 8 }])
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
      const economy = createSettlementEconomy('s', {}, [{ kind: 'food', target: 8 }])
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
      const economy = createSettlementEconomy('s', {}, [{ kind: 'food', target: 8 }])
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

    it('does not create a collection order when the settlement has no food shortage', () => {
      const household = createHousehold('h', 's', 'home:h')
      household.items.remove('bread', household.items.count('bread'))
      const economy = createSettlementEconomy('s', {}, [{ kind: 'food', target: 4 }])
      economy.depositFood('bread', 4, 0)
      const sourceHousehold = createHousehold('source', 's', 'home:source')
      sourceHousehold.items.remove('bread', sourceHousehold.items.count('bread'))
      sourceHousehold.depositFood('carrot', 10)
      const transportOrders = createTransportOrders()
      const work = planProfessionWork(baseCtx({
        role: 'trader',
        npcId: 'npc:trader',
        household,
        economy,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
        householdExchange: createHouseholdExchangeHooks([
          { household: sourceHousehold, position: { x: 1, z: 1 } },
        ]),
        transportOrders,
      }))
      expect(work).toBeNull()
      expect(transportOrders.list()).toEqual([])
    })

    it('does not create a collection order when no household has food surplus', () => {
      const household = createHousehold('h', 's', 'home:h')
      household.items.remove('bread', household.items.count('bread'))
      const economy = createSettlementEconomy('s', {}, [{ kind: 'food', target: 8 }])
      const emptySource = createHousehold('source', 's', 'home:source')
      emptySource.items.remove('bread', emptySource.items.count('bread'))
      const transportOrders = createTransportOrders()
      const work = planProfessionWork(baseCtx({
        role: 'trader',
        npcId: 'npc:trader',
        household,
        economy,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
        householdExchange: createHouseholdExchangeHooks([
          { household: emptySource, position: { x: 1, z: 1 } },
        ]),
        transportOrders,
      }))
      expect(work).toBeNull()
      expect(transportOrders.list()).toEqual([])
    })

    it('does not create another order when incoming commitments already cover the shortage', () => {
      const household = createHousehold('h', 's', 'home:h')
      household.items.remove('bread', household.items.count('bread'))
      const economy = createSettlementEconomy('s', {}, [{ kind: 'food', target: 5 }])
      const sourceHousehold = createHousehold('source', 's', 'home:source')
      sourceHousehold.items.remove('bread', sourceHousehold.items.count('bread'))
      sourceHousehold.depositFood('carrot', 10)
      const transportOrders = createTransportOrders()
      transportOrders.create({
        source: { type: 'household', householdId: 'other' },
        destination: { type: 'settlement-storage', settlementId: 's' },
        itemKind: 'carrot',
        requestedQuantity: 5,
        carrierNpcId: 'npc:other',
      })
      const work = planProfessionWork(baseCtx({
        role: 'trader',
        npcId: 'npc:trader',
        household,
        economy,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
        householdExchange: createHouseholdExchangeHooks([
          { household: sourceHousehold, position: { x: 1, z: 1 } },
        ]),
        transportOrders,
      }))
      expect(work).toBeNull()
      expect(transportOrders.findByCarrier('npc:trader')).toBeUndefined()
      expect(transportOrders.list()).toHaveLength(1)
    })

    it('caps a new order at the uncovered remainder of the shortage', () => {
      const household = createHousehold('h', 's', 'home:h')
      household.items.remove('bread', household.items.count('bread'))
      const economy = createSettlementEconomy('s', {}, [{ kind: 'food', target: 5 }])
      const sourceHousehold = createHousehold('source', 's', 'home:source')
      sourceHousehold.items.remove('bread', sourceHousehold.items.count('bread'))
      sourceHousehold.depositFood('carrot', 10)
      const transportOrders = createTransportOrders()
      transportOrders.create({
        source: { type: 'household', householdId: 'other' },
        destination: { type: 'settlement-storage', settlementId: 's' },
        itemKind: 'carrot',
        requestedQuantity: 3,
        carrierNpcId: 'npc:other',
      })
      planProfessionWork(baseCtx({
        role: 'trader',
        npcId: 'npc:trader',
        household,
        economy,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
        householdExchange: createHouseholdExchangeHooks([
          { household: sourceHousehold, position: { x: 1, z: 1 } },
        ]),
        transportOrders,
      }))
      expect(transportOrders.findByCarrier('npc:trader')?.requestedQuantity).toBe(2)
    })

    it('caps a new order at uncommitted source surplus', () => {
      const household = createHousehold('h', 's', 'home:h')
      household.items.remove('bread', household.items.count('bread'))
      const economy = createSettlementEconomy('s', {}, [{ kind: 'food', target: 8 }])
      const sourceHousehold = createHousehold('source', 's', 'home:source')
      sourceHousehold.items.remove('bread', sourceHousehold.items.count('bread'))
      sourceHousehold.depositFood('carrot', 7) // target 3 → surplus 4
      const transportOrders = createTransportOrders()
      transportOrders.create({
        source: { type: 'household', householdId: 'source' },
        destination: { type: 'settlement-storage', settlementId: 's' },
        itemKind: 'carrot',
        requestedQuantity: 3,
        carrierNpcId: 'npc:other',
      })
      planProfessionWork(baseCtx({
        role: 'trader',
        npcId: 'npc:trader',
        household,
        economy,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
        householdExchange: createHouseholdExchangeHooks([
          { household: sourceHousehold, position: { x: 1, z: 1 } },
        ]),
        transportOrders,
      }))
      expect(transportOrders.findByCarrier('npc:trader')?.requestedQuantity).toBe(1)
    })

    it('fails the order without duplicating or going negative when source food is gone before pickup', () => {
      const household = createHousehold('h', 's', 'home:h')
      household.items.remove('bread', household.items.count('bread'))
      const economy = createSettlementEconomy('s', {}, [{ kind: 'food', target: 8 }])
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
      const transportCargo = new Inventory()
      const work = planProfessionWork(baseCtx({
        role: 'trader',
        npcId: 'npc:trader',
        household,
        economy,
        transportCargo,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
        householdExchange: householdExchange as unknown as NpcWorkContext['householdExchange'],
        transportOrders,
      }))!
      const orderId = transportOrders.findByCarrier('npc:trader')!.id
      sourceHousehold.items.remove('carrot', sourceHousehold.items.count('carrot'))
      work.onComplete?.()
      expect(transportOrders.find(orderId)?.state).toBe('failed')
      expect(sourceHousehold.items.count('carrot')).toBe(0)
      expect(transportCargo.count('carrot')).toBe(0)
      expect(economy.items.count('carrot')).toBe(0)
    })

    it('delivery raises settlement food and lowers shortage', () => {
      const household = createHousehold('h', 's', 'home:h')
      household.items.remove('bread', household.items.count('bread'))
      const economy = createSettlementEconomy('s', {}, [{ kind: 'food', target: 8 }])
      expect(economy.shortage('food')).toBe(8)
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
      const transportCargo = new Inventory()
      const work = planProfessionWork(baseCtx({
        role: 'trader',
        npcId: 'npc:trader',
        household,
        economy,
        transportCargo,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
        householdExchange: householdExchange as unknown as NpcWorkContext['householdExchange'],
        transportOrders,
      }))!
      work.onComplete?.()
      work.next?.onComplete?.()
      expect(economy.items.count('carrot')).toBeGreaterThan(0)
      expect(economy.shortage('food')).toBe(8 - economy.items.count('carrot'))
    })

    it('resumes an active order even when the trader household has food surplus', () => {
      const household = createHousehold('h', 's', 'home:h')
      household.items.remove('bread', household.items.count('bread'))
      household.depositFood('carrot', 10)
      const economy = createSettlementEconomy('s', {}, [{ kind: 'food', target: 8 }])
      const sourceHousehold = createHousehold('source', 's', 'home:source')
      sourceHousehold.items.remove('bread', sourceHousehold.items.count('bread'))
      sourceHousehold.depositFood('carrot', 10)
      const householdExchange = {
        findSurplusSource: () => ({ household: sourceHousehold, position: { x: 1, y: 0, z: 1 } }),
        findById: (id: string) => id === sourceHousehold.id
          ? { household: sourceHousehold, position: { x: 1, y: 0, z: 1 } }
          : id === household.id
            ? { household, position: { x: 0, y: 0, z: 0 } }
            : null,
      }
      const transportOrders = createTransportOrders()
      const transportCargo = new Inventory()
      transportCargo.add('carrot', 2)
      const existing = transportOrders.create({
        source: { type: 'household', householdId: 'source' },
        destination: { type: 'settlement-storage', settlementId: 's' },
        itemKind: 'carrot',
        requestedQuantity: 2,
        carrierNpcId: 'npc:trader',
      })!
      transportOrders.completePickup(existing.id, 'npc:trader', 2)
      const work = planProfessionWork(baseCtx({
        role: 'trader',
        npcId: 'npc:trader',
        household,
        economy,
        transportCargo,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
        householdExchange: householdExchange as unknown as NpcWorkContext['householdExchange'],
        transportOrders,
      }))
      expect(work?.kind).toBe('deposit')
      expect(transportOrders.list()).toHaveLength(1)
      expect(transportOrders.findByCarrier('npc:trader')?.id).toBe(existing.id)
    })

    it('collects own-household food via TransportOrder instead of a legacy workplace dump', () => {
      const household = createHousehold('h', 's', 'home:h')
      household.items.remove('bread', household.items.count('bread'))
      household.depositFood('carrot', 10)
      const economy = createSettlementEconomy('s', {}, [{ kind: 'food', target: 8 }])
      const transportOrders = createTransportOrders()
      planProfessionWork(baseCtx({
        role: 'trader',
        npcId: 'npc:trader',
        household,
        economy,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
        householdExchange: createHouseholdExchangeHooks([
          { household, position: { x: 0, z: 0 } },
        ]),
        transportOrders,
      }))
      const order = transportOrders.findByCarrier('npc:trader')
      expect(order?.source).toEqual({ type: 'household', householdId: 'h' })
      expect(order?.state).toBe('assigned')
    })

    it('does not double-promise a concrete food kind already committed for pickup', () => {
      const household = createHousehold('h', 's', 'home:h')
      household.items.remove('bread', household.items.count('bread'))
      const economy = createSettlementEconomy('s', {}, [{ kind: 'food', target: 8 }])
      const sourceHousehold = createHousehold('source', 's', 'home:source')
      sourceHousehold.items.remove('bread', sourceHousehold.items.count('bread'))
      sourceHousehold.depositFood('carrot', 3)
      sourceHousehold.depositFood('fish', 6)
      const transportOrders = createTransportOrders()
      transportOrders.create({
        source: { type: 'household', householdId: 'source' },
        destination: { type: 'settlement-storage', settlementId: 's' },
        itemKind: 'carrot',
        requestedQuantity: 3,
        carrierNpcId: 'npc:other',
      })
      planProfessionWork(baseCtx({
        role: 'trader',
        npcId: 'npc:trader',
        household,
        economy,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
        householdExchange: createHouseholdExchangeHooks([
          { household: sourceHousehold, position: { x: 1, z: 1 } },
        ]),
        transportOrders,
      }))
      expect(transportOrders.findByCarrier('npc:trader')?.itemKind).toBe('fish')
    })

    it('picks the same source household for the same world state', () => {
      const household = createHousehold('h', 's', 'home:h')
      household.items.remove('bread', household.items.count('bread'))
      const economy = createSettlementEconomy('s', {}, [{ kind: 'food', target: 8 }])
      const near = createHousehold('near', 's', 'home:near')
      const far = createHousehold('far', 's', 'home:far')
      near.items.remove('bread', near.items.count('bread'))
      far.items.remove('bread', far.items.count('bread'))
      near.depositFood('carrot', 10)
      far.depositFood('carrot', 10)
      const hooks = createHouseholdExchangeHooks([
        { household: far, position: { x: 40, z: 0 } },
        { household: near, position: { x: 4, z: 0 } },
      ])
      const first = createTransportOrders()
      planProfessionWork(baseCtx({
        role: 'trader',
        npcId: 'npc:trader',
        household,
        economy,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
        householdExchange: hooks,
        transportOrders: first,
      }))
      const second = createTransportOrders()
      planProfessionWork(baseCtx({
        role: 'trader',
        npcId: 'npc:trader',
        household,
        economy,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
        householdExchange: hooks,
        transportOrders: second,
      }))
      expect(first.findByCarrier('npc:trader')?.source).toEqual({ type: 'household', householdId: 'near' })
      expect(second.findByCarrier('npc:trader')?.source).toEqual(first.findByCarrier('npc:trader')?.source)
    })

    function economyWithIronShortage() {
      const economy = createSettlementEconomy('s', { iron: 0, coal: 1 }, [])
      economy.observeProductionOutcome({
        ok: false,
        recipeId: BLACKSMITH_IRON_ROD_PRODUCTION.id,
        reason: 'insufficient-input',
        category: 'stock',
        kind: 'iron',
      }, 0)
      return economy
    }

    it('creates a resource-site ore order from a blacksmith stock shortage', () => {
      const household = createHousehold('h', 's', 'home:h')
      const economy = economyWithIronShortage()
      const sites = createResourceSiteInventories()
      sites.getOrCreate('resource_1_2').add('iron', 5)
      const transportOrders = createTransportOrders()
      const work = planProfessionWork(baseCtx({
        role: 'trader',
        npcId: 'npc:trader',
        household,
        economy,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
        transportOrders,
        resourceSiteInventories: sites,
        resolveResourceSitePosition: (id) => (id === 'resource_1_2' ? { x: 20, z: 0 } : null),
      }))
      expect(work?.kind).toBe('work')
      const order = transportOrders.findByCarrier('npc:trader')
      expect(order?.source).toEqual({ type: 'resource-site', resourceId: 'resource_1_2' })
      expect(order?.destination).toEqual({ type: 'settlement-storage', settlementId: 's' })
      expect(order?.itemKind).toBe('iron')
      expect(order?.requestedQuantity).toBe(3)
      expect(order?.state).toBe('assigned')
    })

    it('picks up site ore through the shared transport transaction and credits stock on unload', () => {
      const household = createHousehold('h', 's', 'home:h')
      const economy = economyWithIronShortage()
      const sites = createResourceSiteInventories()
      sites.getOrCreate('resource_1_2').add('iron', 5)
      const transportOrders = createTransportOrders()
      const transportCargo = new Inventory()
      const work = planProfessionWork(baseCtx({
        role: 'trader',
        npcId: 'npc:trader',
        household,
        economy,
        transportCargo,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
        transportOrders,
        resourceSiteInventories: sites,
        resolveResourceSitePosition: (id) => (id === 'resource_1_2' ? { x: 20, z: 0 } : null),
      }))!
      work.onComplete?.()
      const order = transportOrders.findByCarrier('npc:trader')
      expect(order?.state).toBe('in-transit')
      expect(sites.get('resource_1_2')?.count('iron')).toBe(2)
      expect(transportCargo.count('iron')).toBe(3)
      expect(economy.query('iron')).toBe(0)
      work.next?.onComplete?.()
      expect(transportOrders.find(order!.id)?.state).toBe('completed')
      expect(transportCargo.count('iron')).toBe(0)
      expect(economy.query('iron')).toBe(3)
      expect(economy.items.count('iron')).toBe(0)
    })

    it('prefers uncovered food transport over remote ore', () => {
      const household = createHousehold('h', 's', 'home:h')
      household.items.remove('bread', household.items.count('bread'))
      const economy = createSettlementEconomy('s', { iron: 0, coal: 1 }, [{ kind: 'food', target: 8 }])
      economy.observeProductionOutcome({
        ok: false,
        recipeId: BLACKSMITH_IRON_ROD_PRODUCTION.id,
        reason: 'insufficient-input',
        category: 'stock',
        kind: 'iron',
      }, 0)
      const sourceHousehold = createHousehold('source', 's', 'home:source')
      sourceHousehold.items.remove('bread', sourceHousehold.items.count('bread'))
      sourceHousehold.depositFood('carrot', 10)
      const sites = createResourceSiteInventories()
      sites.getOrCreate('resource_1_2').add('iron', 5)
      const transportOrders = createTransportOrders()
      planProfessionWork(baseCtx({
        role: 'trader',
        npcId: 'npc:trader',
        household,
        economy,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
        householdExchange: {
          findSurplusSource: () => ({ household: sourceHousehold, position: { x: 1, y: 0, z: 1 } }),
          findById: (id: string) => id === sourceHousehold.id
            ? { household: sourceHousehold, position: { x: 1, y: 0, z: 1 } }
            : null,
        } as unknown as NpcWorkContext['householdExchange'],
        transportOrders,
        resourceSiteInventories: sites,
        resolveResourceSitePosition: () => ({ x: 20, z: 0 }),
      }))
      const order = transportOrders.findByCarrier('npc:trader')
      expect(order?.itemKind).toBe('carrot')
      expect(order?.source).toEqual({ type: 'household', householdId: 'source' })
    })

    it('does not create an ore order without a production shortage or site supply', () => {
      const household = createHousehold('h', 's', 'home:h')
      const workplace = { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace']
      const sites = createResourceSiteInventories()
      sites.getOrCreate('resource_1_2').add('iron', 5)
      const noShortage = createTransportOrders()
      planProfessionWork(baseCtx({
        role: 'trader',
        npcId: 'npc:trader',
        household,
        economy: createSettlementEconomy('s', { iron: 0, coal: 1 }, []),
        workplace,
        transportOrders: noShortage,
        resourceSiteInventories: sites,
        resolveResourceSitePosition: () => ({ x: 20, z: 0 }),
      }))
      expect(noShortage.list()).toEqual([])

      const noSupply = createTransportOrders()
      planProfessionWork(baseCtx({
        role: 'trader',
        npcId: 'npc:trader',
        household,
        economy: economyWithIronShortage(),
        workplace,
        transportOrders: noSupply,
        resourceSiteInventories: createResourceSiteInventories(),
        resolveResourceSitePosition: () => ({ x: 20, z: 0 }),
      }))
      expect(noSupply.list()).toEqual([])
    })

    it('does not double-promise ore already covered by an incoming order', () => {
      const household = createHousehold('h', 's', 'home:h')
      const economy = economyWithIronShortage()
      const sites = createResourceSiteInventories()
      sites.getOrCreate('resource_1_2').add('iron', 5)
      const transportOrders = createTransportOrders()
      transportOrders.create({
        source: { type: 'resource-site', resourceId: 'resource_1_2' },
        destination: { type: 'settlement-storage', settlementId: 's' },
        itemKind: 'iron',
        requestedQuantity: 2,
        carrierNpcId: 'npc:other',
      })
      planProfessionWork(baseCtx({
        role: 'trader',
        npcId: 'npc:trader',
        household,
        economy,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
        transportOrders,
        resourceSiteInventories: sites,
        resolveResourceSitePosition: () => ({ x: 20, z: 0 }),
      }))
      expect(transportOrders.findByCarrier('npc:trader')).toBeUndefined()
      expect(transportOrders.list()).toHaveLength(1)
    })

    it('resumes an in-transit ore order without creating a replacement', () => {
      const household = createHousehold('h', 's', 'home:h')
      const economy = economyWithIronShortage()
      const sites = createResourceSiteInventories()
      const transportOrders = createTransportOrders()
      const existing = transportOrders.create({
        source: { type: 'resource-site', resourceId: 'resource_1_2' },
        destination: { type: 'settlement-storage', settlementId: 's' },
        itemKind: 'iron',
        requestedQuantity: 2,
        carrierNpcId: 'npc:trader',
      })!
      transportOrders.completePickup(existing.id, 'npc:trader', 2)
      const work = planProfessionWork(baseCtx({
        role: 'trader',
        npcId: 'npc:trader',
        household,
        economy,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
        transportOrders,
        resourceSiteInventories: sites,
        resolveResourceSitePosition: () => ({ x: 20, z: 0 }),
      }))
      expect(work?.kind).toBe('deposit')
      expect(transportOrders.list()).toHaveLength(1)
      expect(transportOrders.findByCarrier('npc:trader')?.id).toBe(existing.id)
    })

    it('picks the nearest resource site, then the stable smaller id', () => {
      const household = createHousehold('h', 's', 'home:h')
      const economy = economyWithIronShortage()
      const sites = createResourceSiteInventories()
      sites.getOrCreate('resource_b').add('iron', 5)
      sites.getOrCreate('resource_a').add('iron', 5)
      const positions: Record<string, { x: number, z: number }> = {
        resource_a: { x: 10, z: 0 },
        resource_b: { x: 10, z: 0 },
      }
      const transportOrders = createTransportOrders()
      planProfessionWork(baseCtx({
        role: 'trader',
        npcId: 'npc:trader',
        household,
        economy,
        x: 0,
        z: 0,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
        transportOrders,
        resourceSiteInventories: sites,
        resolveResourceSitePosition: (id) => positions[id] ?? null,
      }))
      expect(transportOrders.findByCarrier('npc:trader')?.source).toEqual({
        type: 'resource-site',
        resourceId: 'resource_a',
      })
    })

    describe('sourced gold collection (plan settlements-004)', () => {
      function miningWithSource(sourceId: string | null) {
        return {
          queryNearest: () => null,
          mine: () => ({ ok: false as const, reason: 'missing' as const }),
          resolveEconomicSourceId: () => sourceId,
        }
      }

      it('creates a resource-site gold order carrying the resolved economicSourceId', () => {
        const household = createHousehold('h', 's', 'home:h')
        const economy = createSettlementEconomy('s', {}, [])
        const sites = createResourceSiteInventories()
        sites.getOrCreate('mine:gold:exterior-primary').add('gold', 5)
        const transportOrders = createTransportOrders()
        const work = planProfessionWork(baseCtx({
          role: 'trader',
          npcId: 'npc:trader',
          household,
          economy,
          workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
          transportOrders,
          resourceSiteInventories: sites,
          resolveResourceSitePosition: (id) => (id === 'mine:gold:exterior-primary' ? { x: 20, z: 0 } : null),
          mining: miningWithSource('mine:abandonedMine:1'),
        }))
        expect(work?.kind).toBe('work')
        const order = transportOrders.findByCarrier('npc:trader')
        expect(order?.source).toEqual({
          type: 'resource-site',
          resourceId: 'mine:gold:exterior-primary',
          economicSourceId: 'mine:abandonedMine:1',
        })
        expect(order?.itemKind).toBe('gold')
        expect(order?.destination).toEqual({ type: 'settlement-storage', settlementId: 's' })
      })

      it('does not create a gold order when the site has no resolvable economicSourceId', () => {
        const household = createHousehold('h', 's', 'home:h')
        const economy = createSettlementEconomy('s', {}, [])
        const sites = createResourceSiteInventories()
        sites.getOrCreate('resource_gold').add('gold', 5)
        const transportOrders = createTransportOrders()
        planProfessionWork(baseCtx({
          role: 'trader',
          npcId: 'npc:trader',
          household,
          economy,
          workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
          transportOrders,
          resourceSiteInventories: sites,
          resolveResourceSitePosition: () => ({ x: 20, z: 0 }),
          mining: miningWithSource(null),
        }))
        expect(transportOrders.list()).toEqual([])
      })

      it('delivers sourced gold and realizes it immediately into accounting proceeds', () => {
        const household = createHousehold('h', 's', 'home:h')
        const economy = createSettlementEconomy('s', {}, [])
        const sites = createResourceSiteInventories()
        sites.getOrCreate('mine:gold:exterior-primary').add('gold', 5)
        const transportOrders = createTransportOrders()
        const transportCargo = new Inventory()
        const work = planProfessionWork(baseCtx({
          role: 'trader',
          npcId: 'npc:trader',
          household,
          economy,
          transportCargo,
          workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
          transportOrders,
          resourceSiteInventories: sites,
          resolveResourceSitePosition: () => ({ x: 20, z: 0 }),
          mining: miningWithSource('mine:abandonedMine:1'),
        }))!
        work.onComplete?.()
        expect(sites.get('mine:gold:exterior-primary')?.count('gold')).toBe(2)
        work.next?.onComplete?.()
        expect(economy.query('gold')).toBe(0)
        expect(economy.items.count('gold')).toBe(0)
        expect(economy.sourceUnrealized('mine:abandonedMine:1', 'gold')).toBe(0)
        const realizations = economy.snapshot().sourceAccounting?.realizations ?? []
        expect(realizations).toHaveLength(1)
        expect(realizations[0]).toMatchObject({ sourceId: 'mine:abandonedMine:1', kind: 'gold', amount: 3, grossValue: 60 })
      })
    })

    function interSettlementHooks(
      economies: Record<string, ReturnType<typeof createSettlementEconomy>>,
      positions: Record<string, { x: number, z: number }>,
    ): NonNullable<NpcWorkContext['interSettlement']> {
      return {
        listKnownSettlements: () => Object.entries(positions).map(([settlementId, pos]) => ({
          settlementId,
          x: pos.x,
          z: pos.z,
        })),
        getEconomy: (id) => economies[id],
        resolveStorageTarget: (id) => positions[id] ?? null,
      }
    }

    it('creates one A-storage → B-storage food order from surplus and uncovered shortage', () => {
      const household = createHousehold('h', 'a', 'home:h')
      const source = createSettlementEconomy('a', {}, [{ kind: 'food', target: 2 }])
      source.depositFood('carrot', 8, 0)
      const dest = createSettlementEconomy('b', {}, [{ kind: 'food', target: 6 }])
      const transportOrders = createTransportOrders()
      const work = planProfessionWork(baseCtx({
        role: 'trader',
        npcId: 'npc:trader',
        household,
        economy: source,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
        transportOrders,
        interSettlement: interSettlementHooks(
          { a: source, b: dest },
          { a: { x: 0, z: 0 }, b: { x: 40, z: 0 } },
        ),
      }))
      expect(work?.kind).toBe('work')
      const order = transportOrders.findByCarrier('npc:trader')
      expect(order?.source).toEqual({ type: 'settlement-storage', settlementId: 'a' })
      expect(order?.destination).toEqual({ type: 'settlement-storage', settlementId: 'b' })
      expect(order?.itemKind).toBe('carrot')
      expect(order?.state).toBe('assigned')
    })

    it('reconciles transport-cargo capacity to a resolved pack animal before sizing the export, then commits it via beginMerchantJourney (plan settlements-npcs-048)', () => {
      const household = createHousehold('h', 'a', 'home:a:0')
      const source = createSettlementEconomy('a', {}, [{ kind: 'food', target: 2 }])
      source.depositFood('carrot', 8, 0)
      const dest = createSettlementEconomy('b', {}, [{ kind: 'food', target: 6 }])
      const transportOrders = createTransportOrders()
      const transportCargo = new Inventory()
      const beginMerchantJourney = vi.fn()
      const resolveCandidate = vi.fn(() => ({ animalId: 'horse-house0-0', pack: { cargoCapacityKg: 50, cargoCapacityUnits: 32 } }))
      const commitReservation = vi.fn()
      planProfessionWork(baseCtx({
        role: 'trader',
        npcId: 'npc:trader',
        household,
        economy: source,
        transportCargo,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
        transportOrders,
        interSettlement: interSettlementHooks(
          { a: source, b: dest },
          { a: { x: 0, z: 0 }, b: { x: 40, z: 0 } },
        ),
        packAnimalJourney: { resolveCandidate, commitReservation },
        beginMerchantJourney,
      }))
      expect(resolveCandidate).toHaveBeenCalledWith('a', 'home:a:0')
      // The order already exists by the time `beginMerchantJourney` fires — capacity
      // must already reflect the pack animal *before* the order was sized, not after.
      expect(transportCargo.maxWeight).toBe(50)
      expect(beginMerchantJourney).toHaveBeenCalledWith('a', 'b', expect.any(String), 'horse-house0-0')
      // `planTraderInterSettlementExport` itself never detaches the animal —
      // that commit belongs to the caller's `beginMerchantJourney`, once the
      // journey is genuinely starting.
      expect(commitReservation).not.toHaveBeenCalled()
    })

    it('reverts transport-cargo capacity to baseline when no export opportunity results despite a resolved candidate', () => {
      const household = createHousehold('h', 'a', 'home:a:0')
      const source = createSettlementEconomy('a', {}, [{ kind: 'food', target: 2 }])
      source.depositFood('carrot', 8, 0)
      const transportOrders = createTransportOrders()
      const transportCargo = new Inventory()
      const resolveCandidate = vi.fn(() => ({ animalId: 'horse-house0-0', pack: { cargoCapacityKg: 50, cargoCapacityUnits: 32 } }))
      planProfessionWork(baseCtx({
        role: 'trader',
        npcId: 'npc:trader',
        household,
        economy: source,
        transportCargo,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
        transportOrders,
        // No other known settlement has an uncovered shortage — export never matches.
        interSettlement: interSettlementHooks({ a: source }, { a: { x: 0, z: 0 } }),
        packAnimalJourney: { resolveCandidate, commitReservation: vi.fn() },
      }))
      expect(transportOrders.list()).toEqual([])
      expect(transportCargo.maxWeight).toBe(10)
    })

    it('does not create an A→A export', () => {
      const household = createHousehold('h', 'a', 'home:h')
      const source = createSettlementEconomy('a', {}, [{ kind: 'food', target: 2 }])
      source.depositFood('carrot', 8, 0)
      const transportOrders = createTransportOrders()
      planProfessionWork(baseCtx({
        role: 'trader',
        npcId: 'npc:trader',
        household,
        economy: source,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
        transportOrders,
        interSettlement: interSettlementHooks({ a: source }, { a: { x: 0, z: 0 } }),
      }))
      expect(transportOrders.list()).toEqual([])
    })

    it('picks the nearer destination then the stable smaller id', () => {
      const household = createHousehold('h', 'a', 'home:h')
      const source = createSettlementEconomy('a', {}, [{ kind: 'food', target: 2 }])
      source.depositFood('carrot', 8, 0)
      const near = createSettlementEconomy('c-near', {}, [{ kind: 'food', target: 4 }])
      const far = createSettlementEconomy('b-far', {}, [{ kind: 'food', target: 4 }])
      const equalA = createSettlementEconomy('dest-a', {}, [{ kind: 'food', target: 4 }])
      const equalB = createSettlementEconomy('dest-b', {}, [{ kind: 'food', target: 4 }])
      const nearerOrders = createTransportOrders()
      planProfessionWork(baseCtx({
        role: 'trader',
        npcId: 'npc:trader',
        household,
        economy: source,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
        transportOrders: nearerOrders,
        interSettlement: interSettlementHooks(
          { a: source, 'c-near': near, 'b-far': far },
          { a: { x: 0, z: 0 }, 'c-near': { x: 10, z: 0 }, 'b-far': { x: 80, z: 0 } },
        ),
      }))
      expect(nearerOrders.findByCarrier('npc:trader')?.destination).toEqual({
        type: 'settlement-storage',
        settlementId: 'c-near',
      })

      const tiedOrders = createTransportOrders()
      planProfessionWork(baseCtx({
        role: 'trader',
        npcId: 'npc:trader',
        household,
        economy: source,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
        transportOrders: tiedOrders,
        interSettlement: interSettlementHooks(
          { a: source, 'dest-a': equalA, 'dest-b': equalB },
          { a: { x: 0, z: 0 }, 'dest-a': { x: 20, z: 0 }, 'dest-b': { x: 20, z: 0 } },
        ),
      }))
      expect(tiedOrders.findByCarrier('npc:trader')?.destination).toEqual({
        type: 'settlement-storage',
        settlementId: 'dest-a',
      })
    })

    it('keeps local food and remote ore above inter-settlement export', () => {
      const household = createHousehold('h', 'a', 'home:h')
      household.items.remove('bread', household.items.count('bread'))
      const localShortage = createSettlementEconomy('a', { iron: 0, coal: 1 }, [{ kind: 'food', target: 8 }])
      localShortage.observeProductionOutcome({
        ok: false,
        recipeId: BLACKSMITH_IRON_ROD_PRODUCTION.id,
        reason: 'insufficient-input',
        category: 'stock',
        kind: 'iron',
      }, 0)
      const dest = createSettlementEconomy('b', {}, [{ kind: 'food', target: 6 }])
      const sourceHousehold = createHousehold('source', 'a', 'home:source')
      sourceHousehold.items.remove('bread', sourceHousehold.items.count('bread'))
      sourceHousehold.depositFood('carrot', 10)
      const sites = createResourceSiteInventories()
      sites.getOrCreate('resource_1_2').add('iron', 5)
      const foodFirst = createTransportOrders()
      planProfessionWork(baseCtx({
        role: 'trader',
        npcId: 'npc:trader',
        household,
        economy: localShortage,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
        householdExchange: {
          findSurplusSource: () => ({ household: sourceHousehold, position: { x: 1, y: 0, z: 1 } }),
          findById: (id: string) => id === sourceHousehold.id
            ? { household: sourceHousehold, position: { x: 1, y: 0, z: 1 } }
            : null,
        } as unknown as NpcWorkContext['householdExchange'],
        transportOrders: foodFirst,
        resourceSiteInventories: sites,
        resolveResourceSitePosition: () => ({ x: 20, z: 0 }),
        interSettlement: interSettlementHooks(
          { a: localShortage, b: dest },
          { a: { x: 0, z: 0 }, b: { x: 40, z: 0 } },
        ),
      }))
      expect(foodFirst.findByCarrier('npc:trader')?.source).toEqual({
        type: 'household',
        householdId: 'source',
      })

      const surplusWithOre = createSettlementEconomy('a', { iron: 0, coal: 1 }, [{ kind: 'food', target: 2 }])
      surplusWithOre.depositFood('carrot', 8, 0)
      surplusWithOre.observeProductionOutcome({
        ok: false,
        recipeId: BLACKSMITH_IRON_ROD_PRODUCTION.id,
        reason: 'insufficient-input',
        category: 'stock',
        kind: 'iron',
      }, 0)
      const oreFirst = createTransportOrders()
      planProfessionWork(baseCtx({
        role: 'trader',
        npcId: 'npc:trader',
        household,
        economy: surplusWithOre,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
        transportOrders: oreFirst,
        resourceSiteInventories: sites,
        resolveResourceSitePosition: () => ({ x: 20, z: 0 }),
        interSettlement: interSettlementHooks(
          { a: surplusWithOre, b: dest },
          { a: { x: 0, z: 0 }, b: { x: 40, z: 0 } },
        ),
      }))
      expect(oreFirst.findByCarrier('npc:trader')?.source).toEqual({
        type: 'resource-site',
        resourceId: 'resource_1_2',
      })
    })

    it('picks up from source settlement storage and unloads into destination B, not A', () => {
      const household = createHousehold('h', 'a', 'home:h')
      const source = createSettlementEconomy('a', {}, [{ kind: 'food', target: 2 }])
      source.depositFood('carrot', 8, 0)
      const dest = createSettlementEconomy('b', {}, [{ kind: 'food', target: 6 }])
      const transportOrders = createTransportOrders()
      const transportCargo = new Inventory()
      const bound: { orderId: string, x: number, z: number }[] = []
      const work = planProfessionWork(baseCtx({
        role: 'trader',
        npcId: 'npc:trader',
        household,
        economy: source,
        transportCargo,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
        transportOrders,
        interSettlement: interSettlementHooks(
          { a: source, b: dest },
          { a: { x: 0, z: 0 }, b: { x: 40, z: 0 } },
        ),
        bindTransportTravel: (orderId, destination) => {
          bound.push({ orderId, ...destination })
        },
      }))!
      const before = source.items.count('carrot') + transportCargo.count('carrot') + dest.items.count('carrot')
      work.onComplete?.()
      const order = transportOrders.findByCarrier('npc:trader')!
      expect(order.state).toBe('in-transit')
      expect(source.items.count('carrot') + transportCargo.count('carrot')).toBe(before)
      expect(dest.items.count('carrot')).toBe(0)
      expect(bound).toEqual([{ orderId: order.id, x: 40, z: 0 }])
      work.next?.onComplete?.()
      expect(transportOrders.find(order.id)?.state).toBe('completed')
      expect(transportCargo.count('carrot')).toBe(0)
      expect(dest.items.count('carrot')).toBe(order.claimedQuantity)
      expect(source.items.count('carrot') + dest.items.count('carrot')).toBe(before)
    })

    it('excludes competing pre-pickup commitments when revalidating settlement-storage pickup', () => {
      const household = createHousehold('h', 'a', 'home:h')
      const source = createSettlementEconomy('a', {}, [{ kind: 'food', target: 2 }])
      source.depositFood('carrot', 5, 0) // surplus 3
      const dest = createSettlementEconomy('b', {}, [{ kind: 'food', target: 6 }])
      const transportOrders = createTransportOrders()
      transportOrders.create({
        source: { type: 'settlement-storage', settlementId: 'a' },
        destination: { type: 'settlement-storage', settlementId: 'b' },
        itemKind: 'carrot',
        requestedQuantity: 2,
        carrierNpcId: 'npc:other',
      })
      const transportCargo = new Inventory()
      const work = planProfessionWork(baseCtx({
        role: 'trader',
        npcId: 'npc:trader',
        household,
        economy: source,
        transportCargo,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
        transportOrders,
        interSettlement: interSettlementHooks(
          { a: source, b: dest },
          { a: { x: 0, z: 0 }, b: { x: 40, z: 0 } },
        ),
      }))!
      expect(transportOrders.findByCarrier('npc:trader')?.requestedQuantity).toBe(1)
      work.onComplete?.()
      expect(transportOrders.findByCarrier('npc:trader')?.claimedQuantity).toBe(1)
      expect(source.items.count('carrot')).toBe(4)
      expect(transportCargo.count('carrot')).toBe(1)
    })

    it('still delivers cargo if destination shortage disappears after pickup', () => {
      const household = createHousehold('h', 'a', 'home:h')
      const source = createSettlementEconomy('a', {}, [{ kind: 'food', target: 2 }])
      source.depositFood('carrot', 8, 0)
      const dest = createSettlementEconomy('b', {}, [{ kind: 'food', target: 6 }])
      const transportOrders = createTransportOrders()
      const transportCargo = new Inventory()
      const work = planProfessionWork(baseCtx({
        role: 'trader',
        npcId: 'npc:trader',
        household,
        economy: source,
        transportCargo,
        workplace: { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace'],
        transportOrders,
        interSettlement: interSettlementHooks(
          { a: source, b: dest },
          { a: { x: 0, z: 0 }, b: { x: 40, z: 0 } },
        ),
      }))!
      work.onComplete?.()
      dest.depositFood('bread', 6, 0)
      expect(dest.shortage('food')).toBe(0)
      work.next?.onComplete?.()
      expect(transportOrders.findByCarrier('npc:trader')).toBeUndefined()
      expect(transportCargo.count('carrot')).toBe(0)
      expect(dest.items.count('carrot')).toBeGreaterThan(0)
    })
  })

  describe('blacksmith (plan settlements-npcs-016)', () => {
    const workplace = { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace']
    const economy = () => createSettlementEconomy('s', {}, [
      { kind: 'wood', target: 0 },
      { kind: 'food', target: 0 },
      { kind: 'water', target: 0 },
    ])

    it('returns null without household, workplace, or runnable work', () => {
      const household = createHousehold('h', 's', 'home:h')
      expect(planProfessionWork(baseCtx({ role: 'blacksmith', household, workplace }))).toBeNull()
      expect(planProfessionWork(baseCtx({ role: 'blacksmith', workplace }))).toBeNull()
      expect(planProfessionWork(baseCtx({ role: 'blacksmith', household }))).toBeNull()
    })

    it('finds a weapon to sharpen when a whetstone and a worn weapon exist', () => {
      const household = createHousehold('h', 's', 'home:h')
      household.items.add('whetstone', 1)
      const worn = createWeaponInstance('axe')
      household.items.addInstance(worn)
      household.items.updateInstance(worn.id, (inst) => ({ ...inst, sharpness: 0.1 }))
      const eco = economy()
      eco.add('iron', 4, 0)
      eco.add('coal', 2, 0)
      const work = planProfessionWork(baseCtx({
        role: 'blacksmith',
        household,
        workplace,
        economy: eco,
      }))
      expect(work?.kind).toBe('sharpen')
    })

    it('starts processing when stock inputs are available and sharpening is not', () => {
      const household = createHousehold('h', 's', 'home:h')
      const eco = economy()
      eco.add('iron', 2, 0)
      eco.add('coal', 1, 0)
      const work = planProfessionWork(baseCtx({
        role: 'blacksmith',
        household,
        workplace,
        economy: eco,
      }))
      expect(work?.kind).toBe('work')
      expect(eco.query('iron')).toBe(2)
      work?.onComplete()
      expect(eco.query('iron')).toBe(0)
      expect(eco.query('coal')).toBe(0)
      expect(household.items.count('iron_rod')).toBe(1)
    })

    it('does not start processing when either stock input is missing', () => {
      const household = createHousehold('h', 's', 'home:h')
      const ecoMissingCoal = economy()
      ecoMissingCoal.add('iron', 4, 0)
      expect(planProfessionWork(baseCtx({
        role: 'blacksmith',
        household,
        workplace,
        economy: ecoMissingCoal,
        simTime: () => 4,
      }))).toBeNull()
      expect(ecoMissingCoal.productionShortages()).toMatchObject([{ kind: 'coal' }])

      const ecoMissingIron = economy()
      ecoMissingIron.add('coal', 2, 0)
      expect(planProfessionWork(baseCtx({
        role: 'blacksmith',
        household,
        workplace,
        economy: ecoMissingIron,
        simTime: () => 4,
      }))).toBeNull()
      expect(ecoMissingIron.productionShortages()).toMatchObject([{ kind: 'iron' }])
    })

    it('preview does not mutate economy or household items', () => {
      const household = createHousehold('h', 's', 'home:h')
      const eco = economy()
      eco.add('iron', 2, 0)
      eco.add('coal', 1, 0)
      const work = planProfessionWork(baseCtx({
        role: 'blacksmith',
        household,
        workplace,
        economy: eco,
      }))
      expect(work?.kind).toBe('work')
      expect(eco.query('iron')).toBe(2)
      expect(household.items.count('iron_rod')).toBe(0)
    })

    it('stale stock on completion fails without partial mutation', () => {
      const household = createHousehold('h', 's', 'home:h')
      const eco = economy()
      eco.add('iron', 2, 0)
      eco.add('coal', 1, 0)
      const work = planProfessionWork(baseCtx({
        role: 'blacksmith',
        household,
        workplace,
        economy: eco,
      }))
      eco.remove('coal', 1, 0)
      work?.onComplete()
      expect(eco.query('iron')).toBe(2)
      expect(household.items.count('iron_rod')).toBe(0)
      expect(eco.productionShortages()).toMatchObject([{ kind: 'coal' }])
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
        pasture: { x: 80, z: 0, radius: 12 },
      }))
      expect(work?.kind).toBe('deposit')
      expect(work?.destination.x).toBe(0)
      work?.onComplete()
      expect(carried.count('wool')).toBe(0)
      expect(household.items.count('wool')).toBe(4)
    })

    it('uses the settlement pasture as the daytime work fallback', () => {
      const household = createHousehold('h', 's', ownerHouseId)
      const { flock } = flockHooks({ woolReady: false, x: 2, z: 2 })
      const work = planProfessionWork(baseCtx({
        role: 'shepherd',
        household,
        shepherdFlock: flock,
        hasShearingTool: () => true,
        pasture: { x: 80, z: 12, radius: 14 },
      }))
      expect(work?.kind).toBe('work')
      expect(work?.destination.x).toBe(80)
      expect(work?.destination.z).toBe(12)
      expect(work && 'followAnimalId' in work ? work.followAnimalId : undefined).toBeUndefined()
    })

    it('still follows a separated sheep before going to pasture', () => {
      const household = createHousehold('h', 's', ownerHouseId)
      const { flock } = flockHooks({ woolReady: false, x: 40, z: 0 })
      const work = planProfessionWork(baseCtx({
        role: 'shepherd',
        household,
        shepherdFlock: flock,
        hasShearingTool: () => true,
        pasture: { x: 80, z: 12, radius: 14 },
      }))
      expect(work?.kind).toBe('work')
      expect(work && 'followAnimalId' in work ? work.followAnimalId : undefined).toBe('sheep-house0-0')
      expect(work?.destination.x).toBe(40)
    })

    it('goes to pasture even when the settlement currently has no flock', () => {
      const household = createHousehold('h', 's', ownerHouseId)
      const work = planProfessionWork(baseCtx({
        role: 'shepherd',
        household,
        pasture: { x: 64, z: -8, radius: 11 },
      }))
      expect(work?.kind).toBe('work')
      expect(work?.destination.x).toBe(64)
      expect(work?.destination.z).toBe(-8)
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

  describe('hunter work (plan settlements-npcs-040)', () => {
    const workplace = { position: { x: 4, y: 0, z: 4 } } as unknown as NpcWorkContext['workplace']

    function clearWood(household: ReturnType<typeof createHousehold>) {
      household.items.remove('branch', household.items.count('branch'))
      household.items.remove('beam', household.items.count('beam'))
    }

    it('still crafts arrows when stock is below the arrow cap', () => {
      const household = createHousehold('h', 's', 'home')
      clearWood(household)
      household.items.add('branch', 1)
      const work = planProfessionWork(baseCtx({ role: 'hunter', household, workplace }))
      expect(work?.kind).toBe('work')
      work?.onComplete()
      expect(household.items.count('arrow')).toBe(1)
      expect(household.items.count('short_bow')).toBe(0)
    })

    it('crafts a short_bow once arrows are at cap and bow stock is below cap', () => {
      const household = createHousehold('h', 's', 'home')
      clearWood(household)
      household.items.add('arrow', 24)
      household.items.add('branch', 2)
      const work = planProfessionWork(baseCtx({ role: 'hunter', household, workplace }))
      expect(work?.kind).toBe('work')
      work?.onComplete()
      expect(household.items.count('short_bow')).toBe(1)
      expect(household.items.count('arrow')).toBe(24)
    })

    it('does not craft bows while household trade bows are already at cap', () => {
      const household = createHousehold('h', 's', 'home')
      clearWood(household)
      household.items.add('arrow', 24)
      household.items.add('short_bow', 2)
      household.items.add('branch', 4)
      expect(planProfessionWork(baseCtx({ role: 'hunter', household, workplace }))).toBeNull()
      expect(household.items.count('short_bow')).toBe(2)
    })

    it('resumes bow crafting after a trade bow is sold', () => {
      const household = createHousehold('h', 's', 'home')
      clearWood(household)
      household.items.add('arrow', 24)
      household.items.add('short_bow', 2)
      household.items.add('branch', 2)
      expect(planProfessionWork(baseCtx({ role: 'hunter', household, workplace }))).toBeNull()
      household.items.remove('short_bow', 1)
      const work = planProfessionWork(baseCtx({ role: 'hunter', household, workplace }))
      work?.onComplete()
      expect(household.items.count('short_bow')).toBe(2)
    })
  })
})
