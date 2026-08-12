import { Group } from 'three'
import { describe, expect, it } from 'vitest'
import { HOUSE_CATALOG } from './houseCatalog'
import { resolveHouseLampMount } from './props'

describe('resolveHouseLampMount', () => {
  it('falls back to catalog when no anchor exists', () => {
    const entry = HOUSE_CATALOG.find((e) => e.id === 'hut_d')!
    const hut = new Group()
    const mount = resolveHouseLampMount(entry, hut, entry.height)
    expect(mount.source).not.toBe('anchor')
  })

  it('uses floorCenter for shell huts', () => {
    const entry = HOUSE_CATALOG.find((e) => e.id === 'hut_a')!
    const hut = new Group()
    const mount = resolveHouseLampMount(entry, hut, entry.height)
    expect(mount.source).toBe('floorCenter')
  })
})
