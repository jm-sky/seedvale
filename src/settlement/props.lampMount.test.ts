import { Group } from 'three'
import { describe, expect, it } from 'vitest'
import { HOUSE_CATALOG } from './houseCatalog'
import { resolveHouseLampMount } from './props'

describe('resolveHouseLampMount', () => {
  it('falls back when no anchor metadata exists', () => {
    const entry = HOUSE_CATALOG.find((e) => e.id === 'towerhouse')!
    const hut = new Group()
    const mount = resolveHouseLampMount(entry, hut, entry.height)
    expect(mount.source).not.toBe('anchor')
  })

  it('uses floor-center lamp_mount anchor for shell huts', () => {
    const entry = HOUSE_CATALOG.find((e) => e.id === 'hut_a')!
    const hut = new Group()
    const mount = resolveHouseLampMount(entry, hut, entry.height)
    expect(mount.source).toBe('anchor')
    expect(mount.y).toBeCloseTo(0.55, 2)
    expect(mount.x).toBeCloseTo(0, 3)
    expect(mount.z).toBeCloseTo(0, 3)
  })

  it('prefers lamp_mount metadata for hut_d', () => {
    const entry = HOUSE_CATALOG.find((e) => e.id === 'hut_d')!
    const hut = new Group()
    const mount = resolveHouseLampMount(entry, hut, entry.height)
    expect(mount.source).toBe('anchor')
    expect(mount.x).toBeCloseTo(0.07, 3)
    expect(mount.y).toBeCloseTo(0.25, 3)
    expect(mount.z).toBeCloseTo(0.17, 3)
  })
})
