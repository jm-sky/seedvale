import { describe, expect, it } from 'vitest'
import { CROP_SEED_ITEM, GARDEN_PLANT_RADIUS, isNearAnyGarden, makePlantedCropId, parsePlantedCrops } from './plantedCrops'

describe('makePlantedCropId', () => {
  it('is deterministic for the same seed/position', () => {
    expect(makePlantedCropId(3, 5.01, -1.02)).toBe(makePlantedCropId(3, 5.01, -1.02))
  })

  it('differs across seeds/positions and uses a distinct namespace', () => {
    expect(makePlantedCropId(3, 5, -1)).not.toBe(makePlantedCropId(4, 5, -1))
    expect(makePlantedCropId(3, 5, -1)).not.toBe(makePlantedCropId(3, 6, -1))
    expect(makePlantedCropId(3, 5, -1).startsWith('planted-crop:')).toBe(true)
  })
})

describe('isNearAnyGarden', () => {
  const gardens = [{ x: 0, z: 0 }, { x: 50, z: 50 }]

  it('is true within GARDEN_PLANT_RADIUS of a garden', () => {
    expect(isNearAnyGarden(1, 1, gardens)).toBe(true)
    expect(isNearAnyGarden(GARDEN_PLANT_RADIUS - 0.1, 0, gardens)).toBe(true)
  })

  it('is false far from every garden', () => {
    expect(isNearAnyGarden(200, 200, gardens)).toBe(false)
  })

  it('is false with no gardens at all', () => {
    expect(isNearAnyGarden(0, 0, [])).toBe(false)
  })
})

describe('CROP_SEED_ITEM', () => {
  it('maps every CropId to a distinct seed ItemKind', () => {
    expect(CROP_SEED_ITEM.carrot).toBe('seed_carrot')
    expect(CROP_SEED_ITEM.potato).toBe('seed_potato')
    expect(CROP_SEED_ITEM.cabbage).toBe('seed_cabbage')
  })
})

describe('parsePlantedCrops', () => {
  const valid = { id: 'planted-crop:1:2:3', x: 2, z: 3, cropId: 'carrot', stageStartedAt: 4.5 }

  it('keeps well-formed records', () => {
    expect(parsePlantedCrops([valid])).toEqual([valid])
  })

  it('drops malformed entries without throwing', () => {
    expect(parsePlantedCrops(null)).toEqual([])
    expect(parsePlantedCrops('nope')).toEqual([])
    expect(parsePlantedCrops([{ ...valid, cropId: 'tomato' }])).toEqual([])
    expect(parsePlantedCrops([{ ...valid, stageStartedAt: 'nope' }])).toEqual([])
    expect(parsePlantedCrops([valid, { not: 'a crop' }])).toEqual([valid])
  })
})
