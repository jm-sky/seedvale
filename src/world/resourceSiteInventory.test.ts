import { describe, expect, it } from 'vitest'
import { snapshotInventoryContents } from '../items/Inventory'
import { createResourceSiteInventories } from './resourceSiteInventory'

describe('resource-site inventories (settlements-npcs-021)', () => {
  it('starts empty and creates an unbounded inventory on demand', () => {
    const sites = createResourceSiteInventories()
    expect(sites.get('resource_1_2')).toBeUndefined()
    expect(sites.entries()).toEqual([])
    const created = sites.getOrCreate('resource_1_2')
    expect(sites.get('resource_1_2')).toBe(created)
    expect(created.canAdd('iron', 8)).toBe(true)
    expect(created.canAdd('iron', 40)).toBe(true)
    expect(sites.entries()).toEqual([])
  })

  it('serializes only non-empty sites and restores the same goods', () => {
    const sites = createResourceSiteInventories()
    sites.getOrCreate('resource_1_2').add('iron', 2)
    sites.getOrCreate('resource_3_4').add('coal', 1)
    sites.getOrCreate('resource_empty_0')
    const snapshot = sites.serialize()
    expect(Object.keys(snapshot).sort()).toEqual(['resource_1_2', 'resource_3_4'])
    const restored = createResourceSiteInventories(snapshot)
    expect(restored.get('resource_1_2')?.count('iron')).toBe(2)
    expect(restored.get('resource_3_4')?.count('coal')).toBe(1)
    expect(restored.get('resource_empty_0')).toBeUndefined()
    expect(restored.serialize()).toEqual(snapshot)
  })

  it('round-trips a contents snapshot without inventing a second item format', () => {
    const sites = createResourceSiteInventories()
    sites.getOrCreate('resource_1_2').add('iron', 3)
    const fromContents = snapshotInventoryContents(sites.getOrCreate('resource_1_2'))
    expect(sites.serialize()['resource_1_2']).toEqual(fromContents)
  })
})
