import { describe, expect, it } from 'vitest'
import type { CaveDefinition } from '../caveVolume'
import {
  caveWorldLocationId,
  DARK_FOREST_TREASURE_LOCATION_ID,
  darkForestTreasureChestId,
  darkForestTreasureMapPickupId,
  type DarkForestTreasureSite,
  darkForestTreasureWolfDenId,
  isDarkForestTreasureChestLooted,
  resolveTreasureMapSourcePlace,
  TREASURE_MAP_SOURCE_PREFERRED_MAX,
  TREASURE_MAP_SOURCE_PREFERRED_MIN,
  withTreasureMapSourcePlace,
} from './darkForestTreasureSite'

function caveDef(caveId: string, x: number, z: number, yaw = 0): CaveDefinition {
  return {
    caveId,
    entrance: { x, y: 0, z, yaw, width: 3, height: 2.6 },
    nodes: [],
    tunnels: [],
    bounds: { minX: x - 1, maxX: x + 1, minY: 0, maxY: 3, minZ: z - 1, maxZ: z + 1 },
    variant: 0,
  }
}

function baseSite(): DarkForestTreasureSite {
  return {
    locationId: DARK_FOREST_TREASURE_LOCATION_ID,
    landmarkId: DARK_FOREST_TREASURE_LOCATION_ID,
    chestId: darkForestTreasureChestId(),
    x: 400,
    z: -300,
    rotationY: 0,
    variant: 0.5,
    scale: 1.2,
    wolfDenCount: 2,
    wolfDens: [],
    treasureMap: null,
  }
}

describe('darkForestTreasureSite (quests-progression-009)', () => {
  it('exposes stable location and container ids', () => {
    expect(DARK_FOREST_TREASURE_LOCATION_ID).toBe('ruins:dark-forest-treasure')
    expect(darkForestTreasureChestId()).toBe('world-container:dark-forest-treasure')
    expect(darkForestTreasureWolfDenId(0)).toBe('dark-forest-treasure:wolfDen:0')
    expect(darkForestTreasureMapPickupId()).toBe('treasure-map-pickup:dark-forest-treasure')
  })

  it('detects depleted treasure chest', () => {
    expect(isDarkForestTreasureChestLooted({ coin: 1, ruby: 1 })).toBe(false)
    expect(isDarkForestTreasureChestLooted({ coin: 0, ruby: 0 })).toBe(true)
  })

  it('picks the same cave source place for the same seed', () => {
    const caves = [
      caveDef('cave:aaa', 180, 40),
      caveDef('cave:bbb', 220, -80),
      caveDef('cave:ccc', 150, 120),
    ]
    const input = {
      seed: 42,
      homeX: 0,
      homeZ: 0,
      caves,
      cemetery: { id: 'cemetery:a:home', x: 30, z: 30 },
    }
    const a = resolveTreasureMapSourcePlace(input)
    const b = resolveTreasureMapSourcePlace(input)
    expect(a).toEqual(b)
    expect(a?.kind).toBe('cave')
    expect(a?.locationId).toMatch(/^cave:cave:/)
  })

  it('does not place the map on a random near-home ring point', () => {
    const caves = [caveDef('cave:far', 250, 0)]
    const place = resolveTreasureMapSourcePlace({
      seed: 7,
      homeX: 0,
      homeZ: 0,
      caves,
      cemetery: null,
    })
    expect(place).not.toBeNull()
    const distFromHome = Math.hypot(place!.pickupX, place!.pickupZ)
    expect(distFromHome).toBeGreaterThan(TREASURE_MAP_SOURCE_PREFERRED_MIN - 20)
    expect(Math.hypot(place!.pickupX - 250, place!.pickupZ)).toBeLessThan(8)
  })

  it('prefers caves inside the preferred home band', () => {
    const near = caveDef('cave:near', 160, 0)
    const far = caveDef('cave:far', TREASURE_MAP_SOURCE_PREFERRED_MAX + 80, 0)
    const place = resolveTreasureMapSourcePlace({
      seed: 99,
      homeX: 0,
      homeZ: 0,
      caves: [far, near],
      cemetery: null,
    })
    expect(place?.locationId).toBe(caveWorldLocationId('cave:near'))
  })

  it('falls back to any cave when none sit in the preferred band', () => {
    const far = caveDef('cave:only', TREASURE_MAP_SOURCE_PREFERRED_MAX + 120, 40)
    const place = resolveTreasureMapSourcePlace({
      seed: 3,
      homeX: 0,
      homeZ: 0,
      caves: [far],
      cemetery: { id: 'cemetery:a:home', x: 20, z: 20 },
    })
    expect(place?.kind).toBe('cave')
    expect(place?.locationId).toBe(caveWorldLocationId('cave:only'))
  })

  it('falls back to the cemetery when no caves exist', () => {
    const place = resolveTreasureMapSourcePlace({
      seed: 11,
      homeX: 0,
      homeZ: 0,
      caves: [],
      cemetery: { id: 'cemetery:a:home', x: 45, z: -12 },
    })
    expect(place).toEqual(expect.objectContaining({
      kind: 'cemetery',
      locationId: 'cemetery:a:home',
      x: 45,
      z: -12,
    }))
    expect(Math.hypot(place!.pickupX - 45, place!.pickupZ + 12)).toBeLessThan(8)
  })

  it('returns null when neither caves nor cemetery exist', () => {
    expect(resolveTreasureMapSourcePlace({
      seed: 1,
      homeX: 0,
      homeZ: 0,
      caves: [],
      cemetery: null,
    })).toBeNull()
  })

  it('attaches map source without changing ruins identity', () => {
    const site = baseSite()
    const map = resolveTreasureMapSourcePlace({
      seed: 5,
      homeX: 0,
      homeZ: 0,
      caves: [caveDef('cave:attach', 200, 50, Math.PI / 2)],
      cemetery: null,
    })!
    const attached = withTreasureMapSourcePlace(site, map)
    expect(attached.locationId).toBe(site.locationId)
    expect(attached.x).toBe(site.x)
    expect(attached.treasureMap).toEqual(map)
    expect(attached.treasureMap?.pickupId).toBe(darkForestTreasureMapPickupId())
  })

  it('places the cave pickup beside the entrance, not at a home ring', () => {
    const place = resolveTreasureMapSourcePlace({
      seed: 21,
      homeX: 10,
      homeZ: -5,
      caves: [caveDef('cave:mouth', 200, 0, 0)],
      cemetery: null,
      preferredMinDist: TREASURE_MAP_SOURCE_PREFERRED_MIN,
      preferredMaxDist: TREASURE_MAP_SOURCE_PREFERRED_MAX,
    })
    expect(place).not.toBeNull()
    // Opening yaw 0 → openingDirection (0, 1); pickup sits on that approach pad.
    expect(place!.pickupZ).toBeGreaterThan(0)
    expect(Math.abs(place!.pickupX - 200)).toBeLessThan(4)
  })
})
