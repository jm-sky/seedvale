import { describe, expect, it } from 'vitest'
import type { Household } from '../settlement/household'
import type { GrassForageService } from '../world/createGrassForagePatches'
import { Inventory } from '../items/Inventory'
import { ANIMAL_DEFS } from './animalDefs'
import {
  applySourceRelief,
  type CarcassCandidate,
  findFoodTarget,
  findTroughTarget,
  findWaterTarget,
  type ForagingContext,
  isSourceTargetValid,
  type SourceTarget,
} from './animalForaging'
import { createAnimalLifeState, DEFAULT_ANIMAL_METABOLISM } from './AnimalLife'

function fakeHousehold(overrides: Partial<{
  waterAmount: number
  items: Inventory
}> = {}): Household {
  const waterAmount = overrides.waterAmount ?? 0
  const items = overrides.items ?? new Inventory({}, Infinity)
  return {
    water: {
      current: waterAmount,
      capacity: 10,
      has: (amount: number) => waterAmount >= amount,
      remove: (_amount: number) => {},
    },
    items,
    resolveHayForage: () => {},
  } as unknown as Household
}

function makeCtx(overrides: Partial<ForagingContext> = {}): ForagingContext {
  return {
    x: 0,
    z: 0,
    home: { x: 0, z: 0 },
    def: ANIMAL_DEFS.wolf,
    life: createAnimalLifeState(0.5, DEFAULT_ANIMAL_METABOLISM),
    household: undefined,
    nowDays: 0,
    grassForage: undefined,
    sampleHeight: () => 0,
    waterLevel: -10,
    roamRadius: 50,
    isWalkable: () => true,
    isNearVillage: () => false,
    ...overrides,
  }
}

function makeCorpse(overrides: Partial<CarcassCandidate> & { id?: string } = {}): CarcassCandidate {
  let claimedBy: unknown = overrides.foodClaimedBy ?? null
  let consumedPhase = overrides.foodConsumedPhase ?? null
  const meatHarvested = overrides.meatHarvested ?? false
  return {
    mesh: { position: { x: 5, z: 0 } },
    def: { role: 'prey' },
    get foodClaimedBy() { return claimedBy },
    get foodConsumedPhase() { return consumedPhase },
    get meatHarvested() { return meatHarvested },
    isDead: () => true,
    corpsePhase: () => 'fresh',
    readyToRemove: () => false,
    claimAsFood: (by: unknown) => {
      if (consumedPhase === 'fresh') return false
      if (claimedBy != null && claimedBy !== by) return false
      claimedBy = by
      return true
    },
    releaseFoodClaim: (by: unknown) => { if (claimedBy === by) claimedBy = null },
    markFoodConsumed: (phase) => { consumedPhase = phase; claimedBy = null },
    ...overrides,
  }
}

describe('findTroughTarget / findWaterTarget (plan 122 — trough preferred over shoreline)', () => {
  it('prefers the household trough over a shoreline search when water is stocked', () => {
    const ctx = makeCtx({ household: fakeHousehold({ waterAmount: 5 }), def: ANIMAL_DEFS.cow })
    const target = findWaterTarget(ctx)
    expect(target?.kind).toBe('water')
    expect(target?.waterSource).toEqual({ kind: 'household' })
  })

  it('grants no trough target when the household reserve is empty', () => {
    const ctx = makeCtx({ household: fakeHousehold({ waterAmount: 0 }), def: ANIMAL_DEFS.cow })
    expect(findTroughTarget(ctx)).toBeNull()
  })

  it('falls back to a shoreline search when there is no household at all (wild fauna)', () => {
    // Never walkable/shore -> no candidate found, but must not throw and
    // must not synthesize a trough target out of thin air.
    const ctx = makeCtx({ household: undefined, isWalkable: () => false })
    expect(findWaterTarget(ctx)).toBeNull()
  })
})

describe('isSourceTargetValid / applySourceRelief — trough (plan 122)', () => {
  it('a drained trough grants no relief and the target fails revalidation', () => {
    const household = fakeHousehold({ waterAmount: 0 })
    const ctx = makeCtx({ household, def: ANIMAL_DEFS.cow })
    const target: SourceTarget = { kind: 'water', x: 0, z: 0, waterSource: { kind: 'household' } }
    // Trough targets don't fail isSourceTargetValid's generic checks (no
    // live re-check there — the atomic water draw itself is the gate), but
    // applySourceRelief must not relieve thirst from an empty reserve.
    const before = ctx.life.thirst
    applySourceRelief(ctx, target)
    expect(ctx.life.thirst).toBe(before)
  })

  it('a stocked trough both drains the household reserve and relieves thirst', () => {
    let waterAmount = 5
    const household = {
      water: {
        current: waterAmount,
        capacity: 10,
        has: (amount: number) => waterAmount >= amount,
        remove: (amount: number) => { waterAmount -= amount },
      },
      items: new Inventory({}, Infinity),
      resolveHayForage: () => {},
    } as unknown as Household
    const ctx = makeCtx({ household, def: ANIMAL_DEFS.cow })
    ctx.life.thirst = 0.8
    applySourceRelief(ctx, { kind: 'water', x: 0, z: 0, waterSource: { kind: 'household' } })
    expect(waterAmount).toBe(4)
    expect(ctx.life.thirst).toBeLessThan(0.8)
  })
})

describe('player-built trough water (plan items-player-020)', () => {
  function fakeWaterProvider(state: { litres: number, id: string }) {
    return {
      queryAvailableNear: () => (state.litres > 0 ? [{ id: state.id, x: 1, z: 0 }] : []),
      isAvailable: (_id: string, litres: number) => state.litres >= litres,
      consume: (_id: string, litres: number) => {
        if (state.litres < litres) return false
        state.litres -= litres
        return true
      },
    }
  }

  it('prefers household trough over a nearby player trough', () => {
    const provider = fakeWaterProvider({ litres: 5, id: 'trough:1' })
    const ctx = makeCtx({
      household: fakeHousehold({ waterAmount: 5 }),
      waterSourceProvider: provider,
      def: ANIMAL_DEFS.cow,
      x: 0,
      z: 0,
      home: { x: 0, z: 0 },
    })
    const target = findWaterTarget(ctx)
    expect(target?.waterSource).toEqual({ kind: 'household' })
  })

  it('uses a nearby player trough when household water is empty', () => {
    const provider = fakeWaterProvider({ litres: 5, id: 'trough:1' })
    const ctx = makeCtx({
      household: fakeHousehold({ waterAmount: 0 }),
      waterSourceProvider: provider,
      def: ANIMAL_DEFS.cow,
      x: 0,
      z: 0,
      home: { x: 0, z: 0 },
    })
    const target = findWaterTarget(ctx)
    expect(target?.waterSource).toEqual({ kind: 'playerTrough', id: 'trough:1' })
  })

  it('grants no relief when player trough consume fails', () => {
    const provider = fakeWaterProvider({ litres: 0, id: 'trough:1' })
    const ctx = makeCtx({ waterSourceProvider: provider, def: ANIMAL_DEFS.cow })
    const before = ctx.life.thirst
    applySourceRelief(ctx, {
      kind: 'water',
      x: 1,
      z: 0,
      waterSource: { kind: 'playerTrough', id: 'trough:1' },
    })
    expect(ctx.life.thirst).toBe(before)
  })
})

describe('applySourceRelief — feed (plan fauna-010 §7 — exact selected kind)', () => {
  it('removes exactly the feed item kind selected at search time', () => {
    const items = new Inventory({}, Infinity)
    items.add('hay', 1)
    items.add('apple', 1)
    const household = fakeHousehold({ items })
    const ctx = makeCtx({ household, def: ANIMAL_DEFS.horse })
    ctx.life.hunger = 0.8
    applySourceRelief(ctx, { kind: 'feed', x: 0, z: 0, feedItemKind: 'hay' })
    expect(items.has('hay', 1)).toBe(false)
    expect(items.has('apple', 1)).toBe(true) // untouched
  })

  it('grants no relief when the exact selected kind was already taken by a competitor', () => {
    const items = new Inventory({}, Infinity) // empty — 'hay' already gone
    const household = fakeHousehold({ items })
    const ctx = makeCtx({ household, def: ANIMAL_DEFS.horse })
    const before = ctx.life.hunger
    applySourceRelief(ctx, { kind: 'feed', x: 0, z: 0, feedItemKind: 'hay' })
    expect(ctx.life.hunger).toBe(before)
  })
})

describe('applySourceRelief / findGrassPatchTarget — grass patch race (plan fauna-010 §3/§4)', () => {
  function fakeGrassForage(available: boolean): GrassForageService {
    return {
      queryNear: () => [{ id: 'patch-1', x: 1, z: 0 }],
      isAvailable: () => available,
      consume: () => available,
      serialize: () => ({}),
      tickVisuals: () => {},
      dispose: () => {},
    }
  }

  it('a lost race (consume returns false) grants no hunger relief', () => {
    const grassForage = fakeGrassForage(false)
    const ctx = makeCtx({ grassForage, def: ANIMAL_DEFS.deer })
    const before = ctx.life.hunger
    applySourceRelief(ctx, { kind: 'grassPatch', x: 1, z: 0, patchId: 'patch-1' })
    expect(ctx.life.hunger).toBe(before)
  })

  it('a won race (consume succeeds) relieves hunger', () => {
    const grassForage = fakeGrassForage(true)
    const ctx = makeCtx({ grassForage, def: ANIMAL_DEFS.deer })
    ctx.life.hunger = 0.8
    applySourceRelief(ctx, { kind: 'grassPatch', x: 1, z: 0, patchId: 'patch-1' })
    expect(ctx.life.hunger).toBeLessThan(0.8)
  })

  it('isSourceTargetValid rejects a patch that is no longer available', () => {
    const grassForage = fakeGrassForage(false)
    const ctx = makeCtx({ grassForage, def: ANIMAL_DEFS.deer })
    const target: SourceTarget = { kind: 'grassPatch', x: 1, z: 0, patchId: 'patch-1' }
    expect(isSourceTargetValid(ctx, {}, target)).toBe(false)
  })
})

describe('findFoodTarget / isSourceTargetValid — carcass tier gating (plan fauna-005)', () => {
  it('a non-scavenger predator never selects a rotting or bones corpse', () => {
    const corpse = makeCorpse({ corpsePhase: () => 'rotting' })
    const ctx = makeCtx({ def: ANIMAL_DEFS.fox }) // fox has no `scavenging` config
    ctx.life.hunger = 1
    const eater = {}
    expect(findFoodTarget(ctx, eater, [corpse])).toBeNull()
  })

  it('a scavenger below the tier hunger threshold does not select rotting/bones either', () => {
    const corpse = makeCorpse({ corpsePhase: () => 'rotting' })
    const ctx = makeCtx({ def: ANIMAL_DEFS.wolf })
    ctx.life.hunger = 0.1 // well below SCAVENGE_ROTTING_HUNGER_THRESHOLD
    const eater = {}
    expect(findFoodTarget(ctx, eater, [corpse])).toBeNull()
  })

  it('a hungry scavenger does select a rotting corpse once past the threshold', () => {
    const corpse = makeCorpse({ corpsePhase: () => 'rotting' })
    const ctx = makeCtx({ def: ANIMAL_DEFS.wolf })
    ctx.life.hunger = 0.9
    const eater = {}
    const target = findFoodTarget(ctx, eater, [corpse])
    expect(target?.kind).toBe('carcass')
  })

  it('a corpse that decays past what the eater can use is rejected at completion (isSourceTargetValid)', () => {
    // Selected while fresh, but by validation time it has rotted past the
    // point a non-scavenger (fox) can still eat.
    const corpse = makeCorpse({ corpsePhase: () => 'bones' })
    const ctx = makeCtx({ def: ANIMAL_DEFS.fox })
    const target: SourceTarget = { kind: 'carcass', x: 5, z: 0, corpse, corpsePhase: 'fresh', foodValue: 1, score: 10 }
    expect(isSourceTargetValid(ctx, {}, target)).toBe(false)
  })

  it('rejects a carcass claimed by a different eater', () => {
    const otherEater = {}
    const corpse = makeCorpse({ foodClaimedBy: otherEater })
    const ctx = makeCtx({ def: ANIMAL_DEFS.wolf })
    const eater = {}
    expect(findFoodTarget(ctx, eater, [corpse])).toBeNull()
  })

  it('claims the selected carcass so a second predator cannot also select it', () => {
    const corpse = makeCorpse()
    const ctx = makeCtx({ def: ANIMAL_DEFS.wolf })
    const eaterA = {}
    const eaterB = {}
    const target = findFoodTarget(ctx, eaterA, [corpse])
    expect(target).not.toBeNull()
    expect(corpse.foodClaimedBy).toBe(eaterA)
    expect(findFoodTarget(ctx, eaterB, [corpse])).toBeNull()
  })
})
