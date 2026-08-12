import { describe, expect, it } from 'vitest'
import {
  HOME_HOUSE_CATALOG,
  homeHouseEntryAt,
  houseCatalogById,
  pickHomeHouse,
  resolveHouseHeight,
} from './houseCatalog'

describe('houseCatalog', () => {
  it('keeps First Age cottages in home catalog', () => {
    const ids = HOME_HOUSE_CATALOG.map((e) => e.id)
    expect(ids).toContain('hut_a')
    expect(ids).toContain('hut_b')
    expect(ids).toContain('hut_c')
    expect(ids).toContain('hut_d')
    expect(ids).not.toContain('towerhouse')
  })

  it('gives First Age shells a floor-center lamp (NPCs still live there)', () => {
    for (const id of ['hut_a', 'hut_b', 'hut_c'] as const) {
      const entry = houseCatalogById(id)
      expect(entry.hasWalls).toBe(false)
      expect(entry.useAsHome).toBe(true)
      expect(entry.lampStyle).toBe('floorCenter')
    }
    expect(houseCatalogById('hut_d').hasWalls).toBe(true)
    expect(houseCatalogById('hut_d').lampStyle).toBe('wall')
  })

  it('sinks hut_a for gray foundation', () => {
    expect(houseCatalogById('hut_a').groundYOffset).toBeCloseTo(-0.2)
  })

  it('cycles home entries stably', () => {
    expect(homeHouseEntryAt(0).id).toBe(HOME_HOUSE_CATALOG[0]!.id)
    expect(homeHouseEntryAt(HOME_HOUSE_CATALOG.length).id).toBe(HOME_HOUSE_CATALOG[0]!.id)
  })

  it('pickHomeHouse uses only walled homes for MD+', () => {
    for (const size of ['MD', 'LG', 'XL'] as const) {
      for (let i = 0; i < 8; i++) {
        expect(pickHomeHouse(size, i, 42).hasWalls).toBe(true)
      }
    }
  })

  it('pickHomeHouse can roll shells for small villages but prefers walls', () => {
    let walled = 0
    let shells = 0
    for (let seed = 0; seed < 80; seed++) {
      const entry = pickHomeHouse('SM', 0, seed)
      if (entry.hasWalls) walled++
      else shells++
    }
    expect(walled).toBeGreaterThan(shells)
    expect(shells).toBeGreaterThan(0)
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
