import { describe, expect, it } from 'vitest'
import { ITEM_GLB_SPECS } from './itemModels'

describe('everyday item GLBs', () => {
  it('wires bread, buckets and seed pouches', () => {
    expect(ITEM_GLB_SPECS.bread?.url).toBe('/models/items/bread.glb')
    expect(ITEM_GLB_SPECS.wooden_bucket?.url).toBe('/models/items/wooden_bucket.glb')
    expect(ITEM_GLB_SPECS.copper_bucket?.url).toBe('/models/items/copper_bucket.glb')
    for (const kind of ['tree_seed', 'seed_carrot', 'seed_potato', 'seed_cabbage'] as const) {
      expect(ITEM_GLB_SPECS[kind]?.url).toBe('/models/items/pouch_small.glb')
    }
  })

  it('does not use the megakit workshop grindstone as a pocket whetstone', () => {
    expect(ITEM_GLB_SPECS.whetstone).toBeUndefined()
  })
})
