import { describe, expect, it } from 'vitest'
import {
  advanceStage,
  canopyGrowthFactor,
  createTreeLifecycle,
  envGrowthFactor,
  makeTreeId,
  parseTreeOverrides,
  STAGE_DURATION_DAYS,
  type TreeEnvSample,
  type TreePresence,
  visualScale,
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
    baseScale: 1,
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

  it('regrows harvested → sapling after stump duration', () => {
    expect(advanceStage('harvested', 0, STAGE_DURATION_DAYS.harvested, 1).stage).toBe('sapling')
  })
})

describe('canopyGrowthFactor', () => {
  it('slows saplings near mature trees but not matures themselves', () => {
    expect(canopyGrowthFactor(3, 'sapling')).toBeLessThan(1)
    expect(canopyGrowthFactor(3, 'mature')).toBe(1)
  })
})

describe('createTreeLifecycle', () => {
  it('resolves procedural sapling growth without storing an override', () => {
    const life = createTreeLifecycle(7)
    const p = presence({ id: life.makeId(10, 20, 0), x: 10, z: 20, initialStage: 'sapling' })
    life.registerPresence(p)

    const day0 = life.resolve(p, goodEnv, 0)
    expect(day0.stage).toBe('sapling')
    expect(life.getOverride(p.id)).toBeUndefined()

    const later = life.resolve(p, goodEnv, 5)
    expect(later.stage).toBe('mature')
    expect(life.getOverride(p.id)).toBeUndefined()
  })

  it('harvests mature trees and leaves a stump override', () => {
    const life = createTreeLifecycle(7)
    const p = presence({
      id: life.makeId(0, 0, 0),
      initialStage: 'mature',
      baseScale: 1.1,
    })
    life.registerPresence(p)

    const result = life.harvest(p.id, 2, goodEnv)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.yield.kind).toBe('branch')

    const stump = life.resolve(p, goodEnv, 2)
    expect(stump.stage).toBe('harvested')
    expect(stump.showCrown).toBe(false)
    expect(life.getOverride(p.id)?.stage).toBe('harvested')
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

    life.harvest(mature.id, 0, goodEnv)
    expect(life.countMatureNear(2, 0, sapling.id, 0, () => goodEnv)).toBe(0)
  })

  it('serializes only sparse overrides', () => {
    const life = createTreeLifecycle(1)
    const p = presence({ id: life.makeId(1, 1, 0), x: 1, z: 1, initialStage: 'mature' })
    life.registerPresence(p)
    life.harvest(p.id, 1.5, goodEnv)
    const serialized = life.serializeOverrides()
    expect(Object.keys(serialized)).toEqual([p.id])
    expect(serialized[p.id]?.stage).toBe('harvested')
  })
})

describe('parseTreeOverrides', () => {
  it('skips corrupt entries defensively', () => {
    expect(parseTreeOverrides(null)).toEqual({})
    expect(
      parseTreeOverrides({
        good: { stage: 'harvested', stageStartedAt: 1 },
        bad: { stage: 'nope', stageStartedAt: 1 },
        worse: 3,
      }),
    ).toEqual({ good: { stage: 'harvested', stageStartedAt: 1 } })
  })
})

describe('visualScale', () => {
  it('keeps sapling/young/mature visually distinct', () => {
    expect(visualScale(1, 'sapling')).toBeLessThan(visualScale(1, 'young'))
    expect(visualScale(1, 'young')).toBeLessThan(visualScale(1, 'mature'))
  })
})
