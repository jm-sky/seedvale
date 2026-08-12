import { describe, expect, it } from 'vitest'
import {
  HOME_HOUSE_CATALOG,
  homeHouseEntryAt,
  houseCatalogById,
  resolveHouseHeight,
} from './houseCatalog'

describe('houseCatalog', () => {
  it('keeps First Age cottages in home rotation', () => {
    const ids = HOME_HOUSE_CATALOG.map((e) => e.id)
    expect(ids).toContain('hut_a')
    expect(ids).toContain('hut_b')
    expect(ids).toContain('hut_c')
    expect(ids).toContain('hut_d')
    expect(ids).not.toContain('towerhouse')
  })

  it('marks First Age shells as wall-less (no lamps)', () => {
    for (const id of ['hut_a', 'hut_b', 'hut_c'] as const) {
      expect(houseCatalogById(id).hasWalls).toBe(false)
      expect(houseCatalogById(id).useAsHome).toBe(true)
    }
    expect(houseCatalogById('hut_d').hasWalls).toBe(true)
  })

  it('sinks hut_a for gray foundation', () => {
    expect(houseCatalogById('hut_a').groundYOffset).toBeCloseTo(-0.2)
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
    expect(hutA.doorHeightFraction).toBeCloseTo(0.22)
    expect(resolveHouseHeight(hutA)).toBeCloseTo(
      Math.min(hutA.maxHeight, hutA.targetDoorHeight / 0.22),
    )
  })

  it('resolveHouseHeight falls back to explicit height for hut_d', () => {
    const hutD = houseCatalogById('hut_d')
    expect(hutD.doorHeightFraction).toBeNull()
    expect(resolveHouseHeight(hutD)).toBe(8.2)
  })
})
