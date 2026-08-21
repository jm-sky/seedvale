import { describe, expect, it } from 'vitest'
import { nearestFoodSource } from './foodSources'

describe('nearestFoodSource', () => {
  it('picks the nearest hunger-relevant item', () => {
    const items = [
      { id: 'a', kind: 'berries' as const, x: 10, z: 0 },
      { id: 'b', kind: 'berries' as const, x: 3, z: 0 },
    ]
    const found = nearestFoodSource(0, 0, items, [], 50)
    expect(found).toEqual({ kind: 'item', id: 'b', itemKind: 'berries', x: 3, z: 0 })
  })

  it('skips an item whose catalog entry is not a hunger consumable', () => {
    const items = [{ id: 'a', kind: 'stone' as const, x: 1, z: 0 }]
    expect(nearestFoodSource(0, 0, items, [], 50)).toBeNull()
  })

  it('picks a mature crop as a food source', () => {
    const crops = [{ id: 'crop:1', cropId: 'carrot' as const, x: 4, z: 0, stage: 'mature' as const }]
    const found = nearestFoodSource(0, 0, [], crops, 50)
    expect(found).toEqual({ kind: 'crop', id: 'crop:1', cropId: 'carrot', x: 4, z: 0, stage: 'mature' })
  })

  it('skips a young crop (no harvest yield yet)', () => {
    const crops = [{ id: 'crop:1', cropId: 'carrot' as const, x: 4, z: 0, stage: 'young' as const }]
    expect(nearestFoodSource(0, 0, [], crops, 50)).toBeNull()
  })

  it('skips a spoiled crop with no spoiled-item yield', () => {
    const crops = [{ id: 'crop:1', cropId: 'carrot' as const, x: 4, z: 0, stage: 'spoiled' as const }]
    expect(nearestFoodSource(0, 0, [], crops, 50)).toBeNull()
  })

  it('rejects candidates outside the search radius', () => {
    const items = [{ id: 'a', kind: 'berries' as const, x: 100, z: 0 }]
    expect(nearestFoodSource(0, 0, items, [], 10)).toBeNull()
  })

  it('compares items and crops together and returns the closer one', () => {
    const items = [{ id: 'far-item', kind: 'berries' as const, x: 20, z: 0 }]
    const crops = [{ id: 'near-crop', cropId: 'potato' as const, x: 2, z: 0, stage: 'mature' as const }]
    const found = nearestFoodSource(0, 0, items, crops, 50)
    expect(found?.kind).toBe('crop')
    expect(found?.id).toBe('near-crop')
  })

  it('breaks equal-distance ties deterministically by id, never Math.random', () => {
    const items = [
      { id: 'b', kind: 'berries' as const, x: 5, z: 0 },
      { id: 'a', kind: 'berries' as const, x: -5, z: 0 },
    ]
    const found = nearestFoodSource(0, 0, items, [], 50)
    expect(found?.id).toBe('a')
  })
})
