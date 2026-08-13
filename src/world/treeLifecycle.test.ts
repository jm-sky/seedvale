import { describe, expect, it } from 'vitest'
import {
  advanceStage,
  canopyGrowthFactor,
  canReachOld,
  CHOP_YIELDS,
  createTreeLifecycle,
  envGrowthFactor,
  HEIGHT_RANGE_M,
  isCanopyStage,
  isChoppableStage,
  livingHeightM,
  makeTreeId,
  parseTreeOverrides,
  rollLivingAge,
  rollSizeClass,
  STAGE_DURATION_DAYS,
  type TreeEnvSample,
  type TreePresence,
  visualScaleForTree,
} from './treeLifecycle'

const goodEnv: TreeEnvSample = {
  biome: { desert: 0, swamp: 0, forest: 1 },
  moisture: 0.8,
  altitude01: 0.15,
  mountainRidge: 0,
}

const desertEnv: TreeEnvSample = {
  biome: { desert: 1, swamp: 0, forest: 0 },
  moisture: 0.1,
  altitude01: 0.2,
  mountainRidge: 0,
}

function presence(partial: Partial<TreePresence> & Pick<TreePresence, 'id'>): TreePresence {
  return {
    x: 0,
    z: 0,
    speciesIndex: 0,
    initialStage: 'sapling',
    sizeClass: 'medium',
    sizeJitter: 0.5,
    ...partial,
  }
}

describe('makeTreeId', () => {
  it('is stable for quantized position + species', () => {
    expect(makeTreeId(42, 1.04, 2.06, 3)).toBe(makeTreeId(42, 1.0, 2.1, 3))
    expect(makeTreeId(42, 1, 2, 3)).not.toBe(makeTreeId(42, 1, 2, 4))
    expect(makeTreeId(1, 0, 0, 0)).not.toBe(makeTreeId(2, 0, 0, 0))
  })
})

describe('envGrowthFactor', () => {
  it('grows faster in forest than desert for forest-loving species', () => {
    const prefs = { desert: 0.2, swamp: 0.5, forest: 1, mountain: 0.3 }
    expect(envGrowthFactor(goodEnv, prefs)).toBeGreaterThan(envGrowthFactor(desertEnv, prefs))
  })

  it('accepts optional season/groundwater hooks without requiring them', () => {
    const prefs = { desert: 0.2, swamp: 0.5, forest: 1, mountain: 0.3 }
    const withSeason = envGrowthFactor({ ...goodEnv, season: 1 }, prefs)
    const withWater = envGrowthFactor({ ...goodEnv, groundwater: 1 }, prefs)
    expect(withSeason).toBeGreaterThan(0)
    expect(withWater).toBeGreaterThan(0)
  })
})

describe('advanceStage', () => {
  it('advances sapling → young → mature lazily from world days', () => {
    const rate = 1
    const afterSapling = advanceStage('sapling', 0, STAGE_DURATION_DAYS.sapling, rate)
    expect(afterSapling.stage).toBe('young')

    const toMatureDays = STAGE_DURATION_DAYS.sapling + STAGE_DURATION_DAYS.young
    expect(advanceStage('sapling', 0, toMatureDays, rate).stage).toBe('mature')
  })

  it('advances mature → old when allowed', () => {
    const days =
      STAGE_DURATION_DAYS.sapling + STAGE_DURATION_DAYS.young + STAGE_DURATION_DAYS.mature
    expect(advanceStage('sapling', 0, days, 1, true).stage).toBe('old')
    expect(advanceStage('sapling', 0, days, 1, false).stage).toBe('mature')
  })

  it('regrows harvested → sapling after stump duration', () => {
    expect(advanceStage('harvested', 0, STAGE_DURATION_DAYS.harvested, 1).stage).toBe('sapling')
  })

  it('does not time-advance limbed or felled chop stages', () => {
    expect(advanceStage('limbed', 0, 100, 1).stage).toBe('limbed')
    expect(advanceStage('felled', 0, 100, 1).stage).toBe('felled')
  })
})

describe('canopyGrowthFactor', () => {
  it('slows saplings near mature trees but not matures/old themselves', () => {
    expect(canopyGrowthFactor(3, 'sapling')).toBeLessThan(1)
    expect(canopyGrowthFactor(3, 'mature')).toBe(1)
    expect(canopyGrowthFactor(3, 'old')).toBe(1)
  })
})

describe('sizeClass / height', () => {
  it('keeps living ages within configured meter ranges', () => {
    for (const age of ['sapling', 'young', 'mature', 'old'] as const) {
      for (const size of ['small', 'medium', 'large'] as const) {
        const h = livingHeightM(age, size, 0.5)
        expect(h).toBeGreaterThanOrEqual(HEIGHT_RANGE_M[age].min)
        expect(h).toBeLessThanOrEqual(HEIGHT_RANGE_M[age].max)
      }
    }
  })

  it('orders sapling < young < mature < old for the same size', () => {
    const s = visualScaleForTree(0, 'sapling', 'medium', 0.5)
    const y = visualScaleForTree(0, 'young', 'medium', 0.5)
    const m = visualScaleForTree(0, 'mature', 'medium', 0.5)
    const o = visualScaleForTree(0, 'old', 'medium', 0.5)
    expect(s).toBeLessThan(y)
    expect(y).toBeLessThan(m)
    expect(m).toBeLessThan(o)
  })

  it('rolls sizeClass by weights and gates old for small', () => {
    expect(rollSizeClass(0)).toBe('small')
    expect(rollSizeClass(0.4)).toBe('medium')
    expect(rollSizeClass(0.99)).toBe('large')
    expect(canReachOld('small')).toBe(false)
    expect(canReachOld('large')).toBe(true)
    expect(
      rollLivingAge({
        sizeClass: 'small',
        ageRoll: 0.9,
        oldRoll: 0,
        saplingChance: 0.1,
        youngChance: 0.1,
      }),
    ).toBe('mature')
    expect(
      rollLivingAge({
        sizeClass: 'large',
        ageRoll: 0.9,
        oldRoll: 0,
        saplingChance: 0.1,
        youngChance: 0.1,
      }),
    ).toBe('old')
  })
})

describe('createTreeLifecycle', () => {
  it('resolves procedural sapling growth without storing an override', () => {
    const life = createTreeLifecycle(7)
    const p = presence({
      id: life.makeId(10, 20, 0),
      x: 10,
      z: 20,
      initialStage: 'sapling',
      sizeClass: 'small',
    })
    life.registerPresence(p)

    const day0 = life.resolve(p, goodEnv, 0)
    expect(day0.stage).toBe('sapling')
    expect(life.getOverride(p.id)).toBeUndefined()

    const later = life.resolve(p, goodEnv, 5)
    expect(later.stage).toBe('mature')
    expect(isCanopyStage(later.stage)).toBe(true)
    expect(life.getOverride(p.id)).toBeUndefined()
  })

  it('grows medium sapling to old over enough days', () => {
    const life = createTreeLifecycle(7)
    const p = presence({
      id: life.makeId(10, 21, 0),
      x: 10,
      z: 21,
      initialStage: 'sapling',
      sizeClass: 'medium',
    })
    life.registerPresence(p)
    const later = life.resolve(p, goodEnv, 20)
    expect(later.stage).toBe('old')
  })

  it('advances harvest in three steps with branch yields', () => {
    const life = createTreeLifecycle(7)
    const p = presence({
      id: life.makeId(0, 0, 0),
      initialStage: 'mature',
    })
    life.registerPresence(p)

    const step1 = life.advanceHarvest(p.id, 2, goodEnv)
    expect(step1).toEqual({
      ok: true,
      yield: CHOP_YIELDS.mature,
      stage: 'limbed',
    })
    expect(life.resolve(p, goodEnv, 2).visual).toBe('limbed')

    const step2 = life.advanceHarvest(p.id, 2, goodEnv)
    expect(step2).toEqual({
      ok: true,
      yield: CHOP_YIELDS.limbed,
      stage: 'felled',
    })
    expect(life.resolve(p, goodEnv, 2).visual).toBe('felled')

    const step3 = life.advanceHarvest(p.id, 2, goodEnv)
    expect(step3).toEqual({
      ok: true,
      yield: CHOP_YIELDS.felled,
      stage: 'harvested',
    })
    const stump = life.resolve(p, goodEnv, 2)
    expect(stump.stage).toBe('harvested')
    expect(stump.showCrown).toBe(false)
    expect(stump.visual).toBe('stump')
    expect(life.getOverride(p.id)?.stage).toBe('harvested')

    expect(life.advanceHarvest(p.id, 2, goodEnv).ok).toBe(false)
  })

  it('chops old trees like mature', () => {
    const life = createTreeLifecycle(7)
    const p = presence({ id: life.makeId(0, 0, 0), initialStage: 'old', sizeClass: 'large' })
    life.registerPresence(p)
    const step = life.advanceHarvest(p.id, 1, goodEnv)
    expect(step).toEqual({ ok: true, yield: CHOP_YIELDS.old, stage: 'limbed' })
  })

  it('harvestFully collapses remaining steps into one total yield', () => {
    const life = createTreeLifecycle(7)
    const p = presence({ id: life.makeId(0, 0, 0), initialStage: 'mature' })
    life.registerPresence(p)

    const result = life.harvestFully(p.id, 1, goodEnv)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.stage).toBe('harvested')
      expect(result.yield.count).toBe(
        CHOP_YIELDS.mature.count + CHOP_YIELDS.limbed.count + CHOP_YIELDS.felled.count,
      )
    }
  })

  it('rejects advanceHarvest on sapling/young', () => {
    const life = createTreeLifecycle(7)
    const p = presence({ id: life.makeId(0, 0, 0), initialStage: 'sapling' })
    life.registerPresence(p)
    expect(life.advanceHarvest(p.id, 0, goodEnv)).toEqual({
      ok: false,
      reason: 'not-choppable',
    })
  })

  it('finds harvestable mature trees locally across cell buckets', () => {
    const life = createTreeLifecycle(3)
    const a = presence({ id: life.makeId(0, 0, 0), x: 0, z: 0, initialStage: 'mature' })
    const b = presence({ id: life.makeId(100, 0, 0), x: 100, z: 0, initialStage: 'mature' })
    life.registerPresence(a)
    life.registerPresence(b)

    const near = life.findHarvestableNear(1, 0, 10, 0, () => goodEnv)
    expect(near?.id).toBe(a.id)
  })

  it('lists nearby registered presence via spatial buckets', () => {
    const life = createTreeLifecycle(3)
    const a = presence({ id: life.makeId(0, 0, 0), x: 0, z: 0, initialStage: 'young' })
    const b = presence({ id: life.makeId(100, 0, 0), x: 100, z: 0, initialStage: 'mature' })
    life.registerPresence(a)
    life.registerPresence(b)

    const near = life.getNearbyPresence(1, 0, 10)
    expect(near.map((t) => t.id)).toEqual([a.id])
  })

  it('looks up registered presence by id, and returns null once unregistered', () => {
    const life = createTreeLifecycle(3)
    const a = presence({ id: life.makeId(0, 0, 0), x: 0, z: 0, initialStage: 'mature' })
    life.registerPresence(a)

    expect(life.getPresence(a.id)).toEqual(a)
    expect(life.getPresence('no-such-id')).toBeNull()

    life.unregisterPresence(a.id)
    expect(life.getPresence(a.id)).toBeNull()
  })

  it('does not count harvested stumps toward canopy', () => {
    const life = createTreeLifecycle(9)
    const mature = presence({
      id: life.makeId(0, 0, 0),
      x: 0,
      z: 0,
      initialStage: 'mature',
    })
    const sapling = presence({
      id: life.makeId(2, 0, 1),
      x: 2,
      z: 0,
      speciesIndex: 1,
      initialStage: 'sapling',
    })
    life.registerPresence(mature)
    life.registerPresence(sapling)
    expect(life.countMatureNear(2, 0, sapling.id, 0, () => goodEnv)).toBe(1)

    life.harvestFully(mature.id, 0, goodEnv)
    expect(life.countMatureNear(2, 0, sapling.id, 0, () => goodEnv)).toBe(0)
  })

  it('counts old trees toward canopy', () => {
    const life = createTreeLifecycle(9)
    const old = presence({
      id: life.makeId(0, 0, 0),
      x: 0,
      z: 0,
      initialStage: 'old',
      sizeClass: 'large',
    })
    const sapling = presence({
      id: life.makeId(2, 0, 1),
      x: 2,
      z: 0,
      speciesIndex: 1,
      initialStage: 'sapling',
    })
    life.registerPresence(old)
    life.registerPresence(sapling)
    expect(life.countMatureNear(2, 0, sapling.id, 0, () => goodEnv)).toBe(1)
  })

  it('serializes only sparse overrides', () => {
    const life = createTreeLifecycle(1)
    const p = presence({ id: life.makeId(1, 1, 0), x: 1, z: 1, initialStage: 'mature' })
    life.registerPresence(p)
    life.advanceHarvest(p.id, 1.5, goodEnv)
    const serialized = life.serializeOverrides()
    expect(Object.keys(serialized)).toEqual([p.id])
    expect(serialized[p.id]?.stage).toBe('limbed')
  })
})

describe('isChoppableStage', () => {
  it('allows mature/old/limbed/felled only', () => {
    expect(isChoppableStage('mature')).toBe(true)
    expect(isChoppableStage('old')).toBe(true)
    expect(isChoppableStage('limbed')).toBe(true)
    expect(isChoppableStage('felled')).toBe(true)
    expect(isChoppableStage('sapling')).toBe(false)
    expect(isChoppableStage('harvested')).toBe(false)
  })
})

describe('parseTreeOverrides', () => {
  it('skips corrupt entries defensively', () => {
    expect(parseTreeOverrides(null)).toEqual({})
    expect(
      parseTreeOverrides({
        good: { stage: 'harvested', stageStartedAt: 1 },
        limbed: { stage: 'limbed', stageStartedAt: 2 },
        old: { stage: 'old', stageStartedAt: 3 },
        bad: { stage: 'nope', stageStartedAt: 1 },
        worse: 3,
      }),
    ).toEqual({
      good: { stage: 'harvested', stageStartedAt: 1 },
      limbed: { stage: 'limbed', stageStartedAt: 2 },
      old: { stage: 'old', stageStartedAt: 3 },
    })
  })
})
