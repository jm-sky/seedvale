import { describe, expect, it } from 'vitest'
import {
  CROP_DEFS,
  type CropDefinition,
  recoveredSeedCountForHarvest,
  resolveCropHarvest,
  resolveCropStage,
  resolveCultivatedSeedRecovery,
  rollCropPhase,
} from './cropLifecycle'

const def: CropDefinition = {
  id: 'carrot',
  matureAfterDays: 2,
  spoilAfterDays: 1,
  logicalPlantsPerSowingUnit: 8,
  harvestItem: 'carrot',
  yieldCount: 1,
  healthySeedRecovery: 2,
}

describe('resolveCropStage', () => {
  it('is young before the mature threshold', () => {
    expect(resolveCropStage(def, 0, 0)).toBe('young')
    expect(resolveCropStage(def, 0, 1.99)).toBe('young')
  })

  it('is mature at and after the boundary, within the harvest window', () => {
    expect(resolveCropStage(def, 0, 2)).toBe('mature')
    expect(resolveCropStage(def, 0, 2.99)).toBe('mature')
  })

  it('is spoiled after the harvest window elapses', () => {
    expect(resolveCropStage(def, 0, 3)).toBe('spoiled')
    expect(resolveCropStage(def, 0, 3.99)).toBe('spoiled')
  })

  it('wraps back to young once the full cycle elapses (no persisted regrowth state)', () => {
    // cycle length = matureAfterDays + spoilAfterDays*2 = 4
    expect(resolveCropStage(def, 0, 4)).toBe('young')
    expect(resolveCropStage(def, 0, 4 + 2)).toBe('mature')
  })

  it('is deterministic and pure for the same inputs', () => {
    expect(resolveCropStage(def, 3.4, 11.7)).toBe(resolveCropStage(def, 3.4, 11.7))
  })

  it('never breaks on negative elapsed time (anchor in the future)', () => {
    expect(() => resolveCropStage(def, 100, 0)).not.toThrow()
  })

  it('every crop definition resolves through the same resolver', () => {
    for (const kind of Object.keys(CROP_DEFS) as (keyof typeof CROP_DEFS)[]) {
      const d = CROP_DEFS[kind]
      expect(resolveCropStage(d, 0, 0)).toBe('young')
    }
  })
})

describe('CROP_DEFS (plan world-023)', () => {
  it('gives every species a positive logical population and base yield', () => {
    for (const kind of Object.keys(CROP_DEFS) as (keyof typeof CROP_DEFS)[]) {
      const d = CROP_DEFS[kind]
      expect(d.logicalPlantsPerSowingUnit).toBeGreaterThan(0)
      expect(d.yieldCount).toBeGreaterThan(0)
      expect(Number.isInteger(d.logicalPlantsPerSowingUnit)).toBe(true)
      expect(Number.isInteger(d.yieldCount)).toBe(true)
    }
  })

  it('keeps logical population and base yield as separate species facts', () => {
    expect(CROP_DEFS.carrot.logicalPlantsPerSowingUnit).not.toBe(CROP_DEFS.carrot.yieldCount)
    expect(CROP_DEFS.potato.logicalPlantsPerSowingUnit).not.toBe(CROP_DEFS.potato.yieldCount)
    expect(CROP_DEFS.cabbage.logicalPlantsPerSowingUnit).not.toBe(CROP_DEFS.cabbage.yieldCount)
  })
})

describe('rollCropPhase', () => {
  it('stays within [0, cycleLength)', () => {
    const cycleLength = def.matureAfterDays + def.spoilAfterDays * 2
    expect(rollCropPhase(def, 0)).toBe(0)
    expect(rollCropPhase(def, 1)).toBe(cycleLength)
    expect(rollCropPhase(def, 0.5)).toBeCloseTo(cycleLength / 2)
  })
})

describe('resolveCropHarvest', () => {
  it('young never yields', () => {
    expect(resolveCropHarvest(def, 'young')).toBeNull()
  })

  it('mature yields the harvest item', () => {
    expect(resolveCropHarvest(def, 'mature')).toEqual({ kind: 'carrot', count: 1 })
  })

  it('mature yield is the species base count from CROP_DEFS', () => {
    expect(resolveCropHarvest(CROP_DEFS.carrot, 'mature')).toEqual({
      kind: 'carrot',
      count: CROP_DEFS.carrot.yieldCount,
    })
    expect(resolveCropHarvest(CROP_DEFS.potato, 'mature')).toEqual({
      kind: 'potato',
      count: CROP_DEFS.potato.yieldCount,
    })
    expect(resolveCropHarvest(CROP_DEFS.cabbage, 'mature')).toEqual({
      kind: 'cabbage',
      count: CROP_DEFS.cabbage.yieldCount,
    })
  })

  it('spoiled yields nothing when no spoiledItem is defined', () => {
    expect(resolveCropHarvest(def, 'spoiled')).toBeNull()
  })

  it('spoiled yields spoiledItem when defined, never the normal harvest item', () => {
    const withSpoiled: CropDefinition = { ...def, spoiledItem: 'branch' }
    expect(resolveCropHarvest(withSpoiled, 'spoiled')).toEqual({ kind: 'branch', count: 1 })
  })
})

describe('resolveCultivatedSeedRecovery (plan settlements-npcs-031)', () => {
  const twelve: CropDefinition = { ...def, yieldCount: 12, healthySeedRecovery: 2 }

  it('recovers 2 sowing units from a full healthy yield for current species', () => {
    for (const cropId of Object.keys(CROP_DEFS) as (keyof typeof CROP_DEFS)[]) {
      const d = CROP_DEFS[cropId]
      expect(d.healthySeedRecovery).toBe(2)
      expect(resolveCultivatedSeedRecovery(d, d.yieldCount)).toBe(2)
    }
  })

  it('applies floor(healthyRecovery * realized / base) and clamps to the species cap', () => {
    expect(resolveCultivatedSeedRecovery(twelve, 12)).toBe(2)
    expect(resolveCultivatedSeedRecovery(twelve, 11)).toBe(1)
    expect(resolveCultivatedSeedRecovery(twelve, 6)).toBe(1)
    expect(resolveCultivatedSeedRecovery(twelve, 5)).toBe(0)
    expect(resolveCultivatedSeedRecovery(twelve, 0)).toBe(0)
  })

  it('recovers zero when realized yield is zero', () => {
    expect(resolveCultivatedSeedRecovery(def, 0)).toBe(0)
    expect(resolveCultivatedSeedRecovery(twelve, -1)).toBe(0)
  })

  it('is deterministic and never uses Math.random', () => {
    expect(resolveCultivatedSeedRecovery(twelve, 7)).toBe(resolveCultivatedSeedRecovery(twelve, 7))
    expect(resolveCultivatedSeedRecovery(twelve, 7)).toBe(1)
  })
})

describe('recoveredSeedCountForHarvest', () => {
  it('does not recover seed from a natural/wild crop', () => {
    const base = resolveCropHarvest(def, 'mature')!
    expect(recoveredSeedCountForHarvest(def, base, base.count, false)).toBe(0)
    expect(recoveredSeedCountForHarvest(def, base, base.count, true)).toBe(2)
  })

  it('does not recover seed from a spoiled-item yield', () => {
    const spoiled: CropDefinition = { ...def, spoiledItem: 'branch' }
    const base = resolveCropHarvest(spoiled, 'spoiled')!
    expect(recoveredSeedCountForHarvest(spoiled, base, 1, true)).toBe(0)
  })
})
