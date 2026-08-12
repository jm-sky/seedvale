import { describe, expect, it } from 'vitest'
import {
  HOME_HOUSE_CATALOG,
  homeHouseEntryAt,
  houseCatalogById,
  resolveHouseHeight,
} from './houseCatalog'

describe('houseCatalog', () => {
  it('home rotation only includes useAsHome cottages', () => {
    expect(HOME_HOUSE_CATALOG.every((e) => e.useAsHome)).toBe(true)
    expect(HOME_HOUSE_CATALOG.some((e) => e.id === 'towerhouse')).toBe(false)
  })

  it('cycles home entries stably', () => {
    expect(homeHouseEntryAt(0).id).toBe(HOME_HOUSE_CATALOG[0]!.id)
    expect(homeHouseEntryAt(HOME_HOUSE_CATALOG.length).id).toBe(HOME_HOUSE_CATALOG[0]!.id)
  })

  it('resolves unknown ids to fallback', () => {
    expect(houseCatalogById('nope').id).toBe('fallback')
  })

  it('resolveHouseHeight uses door fraction when present', () => {
    const hutA = houseCatalogById('hut_a')
    expect(hutA.doorHeightFraction).toBeCloseTo(0.2)
    expect(resolveHouseHeight(hutA)).toBeCloseTo(
      Math.min(hutA.maxHeight, hutA.targetDoorHeight / 0.2),
    )
  })

  it('resolveHouseHeight falls back to explicit height', () => {
    const hutD = houseCatalogById('hut_d')
    expect(hutD.doorHeightFraction).toBeNull()
    expect(resolveHouseHeight(hutD)).toBe(hutD.height)
  })
})
