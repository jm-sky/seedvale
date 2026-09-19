import { describe, expect, it } from 'vitest'
import { HERBAL_CANDIDATE_LIMIT, type NpcWorkContext, planProfessionWork } from './ai/npcProfessionWork'
import { commitDressingProduction, commitTextileWorkProduction } from './economy/npcWork'
import {
  DRESSING_PRODUCTION,
  FLAX_LINEN_PRODUCTION,
  LINEN_BANDAGE_PRODUCTION,
  TEXTILE_WORKER_PRODUCTIONS,
} from './economy/production'
import { executeProduction } from './economy/productionExecutor'
import { Inventory } from './items/Inventory'
import { CONSUMABLE_KINDS_BY_NEED, ITEM_CATALOG } from './items/itemCatalog'
import { createHousehold } from './settlement/household'
import { type HerbalGatherTarget, nearestHerbalGatherTarget } from './world/herbalGathering'

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
      queryCandidates: () => [{ id: '0:0:f0', kind: 'herb' as const, x: 3, z: 0 }],
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

/** Plan npc-057 — Herbalist destination-threat integration. */
describe('settlements-npcs-007 herbalist destination threat', () => {
  const workplace = { position: { x: 1, y: 0, z: 1 } } as NpcWorkContext['workplace']
  const NEAR = { id: 'near', kind: 'herb' as const, x: 5, z: 0 }
  const FAR = { id: 'far', kind: 'mint' as const, x: 30, z: 0 }
  // An aggressive wolf's projected human danger (matches `ANIMAL_DEFS.wolf.humanDanger.aggressiveFloor`)
  // — high enough at zero distance to exceed an unarmed, healthy herbalist's
  // conservative-gathering tolerance (~0.7) on its own.
  const AGGRESSIVE_WOLF_HUMAN_DANGER = 0.75

  function herbalGatherWith(candidates: readonly { id: string, kind: 'herb' | 'mint', x: number, z: number }[]) {
    return {
      queryNearest: () => candidates[0] ?? null,
      queryCandidates: (_x: number, _z: number, _range: number, limit: number) => candidates.slice(0, limit),
      harvest: (target: HerbalGatherTarget) => ({ count: 1, kind: target.kind }),
    }
  }

  it('keeps the nearest candidate unchanged when no threats are nearby', () => {
    const household = createHousehold('h', 's', 'home')
    const work = planProfessionWork(baseCtx({
      role: 'herbalist',
      household,
      workplace,
      herbalGather: herbalGatherWith([NEAR, FAR]),
      destinationThreat: { queryThreats: () => [] },
      x: 0,
      z: 0,
    }))
    expect(work?.destination.x).toBe(NEAR.x)
  })

  it('chooses a farther safe candidate when the nearest one is unsafe', () => {
    const household = createHousehold('h', 's', 'home')
    const work = planProfessionWork(baseCtx({
      role: 'herbalist',
      household,
      workplace,
      herbalGather: herbalGatherWith([NEAR, FAR]),
      // Wolf sits right at the near candidate — far outside FAR's threat
      // influence radius.
      destinationThreat: { queryThreats: () => [{ animalId: 'wolf-1', x: NEAR.x, z: NEAR.z, humanDanger: AGGRESSIVE_WOLF_HUMAN_DANGER }] },
      healthRatio: 1,
      hasMeleeCapability: false,
      hasRangedCapability: false,
      neuroticism: 0.5,
      x: 0,
      z: 0,
    }))
    expect(work?.destination.x).toBe(FAR.x)
  })

  it('returns no gather trip when every bounded candidate is unsafe', () => {
    const household = createHousehold('h', 's', 'home')
    const work = planProfessionWork(baseCtx({
      role: 'herbalist',
      household,
      workplace,
      herbalGather: herbalGatherWith([NEAR, FAR]),
      destinationThreat: {
        queryThreats: () => [
          { animalId: 'wolf-1', x: NEAR.x, z: NEAR.z, humanDanger: AGGRESSIVE_WOLF_HUMAN_DANGER },
          { animalId: 'wolf-2', x: FAR.x, z: FAR.z, humanDanger: AGGRESSIVE_WOLF_HUMAN_DANGER },
        ],
      },
      healthRatio: 1,
      hasMeleeCapability: false,
      hasRangedCapability: false,
      neuroticism: 0.5,
      x: 0,
      z: 0,
    }))
    expect(work).toBeNull()
  })

  it('makes a removed threat eligible again on the next work-selection cycle', () => {
    const household = createHousehold('h', 's', 'home')
    let wolfPresent = true
    const ctx = baseCtx({
      role: 'herbalist',
      household,
      workplace,
      herbalGather: herbalGatherWith([NEAR]),
      destinationThreat: {
        queryThreats: () => (wolfPresent ? [{ animalId: 'wolf-1', x: NEAR.x, z: NEAR.z, humanDanger: AGGRESSIVE_WOLF_HUMAN_DANGER }] : []),
      },
      healthRatio: 1,
      hasMeleeCapability: false,
      hasRangedCapability: false,
      neuroticism: 0.5,
      x: 0,
      z: 0,
    })
    expect(planProfessionWork(ctx)).toBeNull()
    wolfPresent = false
    expect(planProfessionWork(ctx)?.destination.x).toBe(NEAR.x)
  })

  it('caps the number of candidates requested at the named Herbalist limit', () => {
    const household = createHousehold('h', 's', 'home')
    const requestedLimits: number[] = []
    const herbalGather = {
      queryNearest: () => NEAR,
      queryCandidates: (_x: number, _z: number, _range: number, limit: number) => {
        requestedLimits.push(limit)
        return [NEAR]
      },
      harvest: () => ({ count: 1, kind: 'herb' as const }),
    }
    planProfessionWork(baseCtx({
      role: 'herbalist',
      household,
      workplace,
      herbalGather,
      destinationThreat: { queryThreats: () => [] },
      x: 0,
      z: 0,
    }))
    expect(requestedLimits).toEqual([HERBAL_CANDIDATE_LIMIT])
  })

  it('reuses one fauna threat snapshot across every candidate instead of re-querying per candidate', () => {
    const household = createHousehold('h', 's', 'home')
    let queryThreatsCalls = 0
    const work = planProfessionWork(baseCtx({
      role: 'herbalist',
      household,
      workplace,
      herbalGather: herbalGatherWith([NEAR, FAR]),
      destinationThreat: {
        queryThreats: () => {
          queryThreatsCalls++
          return []
        },
      },
      x: 0,
      z: 0,
    }))
    expect(work?.destination.x).toBe(NEAR.x)
    expect(queryThreatsCalls).toBe(1)
  })
})
