import { describe, expect, it } from 'vitest'
import { darkForestTreasureMapPickupId } from '../world/locations/darkForestTreasureSite'
import type { TreasureMapSourcePlace } from '../world/locations/darkForestTreasureSite'
import type { TreasureSiteDefinition } from '../world/treasureSites'
import { buildAuthoredOneTimePickups } from './authoredWorldPickups'

const MAP_SOURCE: TreasureMapSourcePlace = {
  locationId: 'cave:test',
  kind: 'cave',
  x: 10,
  z: 20,
  pickupId: darkForestTreasureMapPickupId(),
  pickupX: 11,
  pickupZ: 21,
}

const KEY_PICKUP_ID = 'treasure-key-pickup:test-site'

const KEY_SITE: TreasureSiteDefinition = {
  id: 'treasure:test-site',
  archetype: 'ruins',
  placeId: 'ruins:test',
  chest: { containerId: 'world-container:test', x: 0, z: 0, yaw: 0 },
  requiredKeyId: 'key:test',
  key: {
    mode: 'abandoned',
    pickupId: KEY_PICKUP_ID,
    hostId: 'ruins:test',
    hostKind: 'ruins',
    x: 30,
    z: 40,
    keyInstanceId: 'key:test',
  },
}

describe('buildAuthoredOneTimePickups', () => {
  it('materializes the treasure map and abandoned key in a fresh world', () => {
    const extras = buildAuthoredOneTimePickups(MAP_SOURCE, [KEY_SITE], new Set())
    expect(extras.map((entry) => entry.id)).toEqual([
      darkForestTreasureMapPickupId(),
      KEY_PICKUP_ID,
    ])
  })

  it('omits a consumed map id without dropping an independent key id', () => {
    const extras = buildAuthoredOneTimePickups(
      MAP_SOURCE,
      [KEY_SITE],
      new Set([darkForestTreasureMapPickupId()]),
    )
    expect(extras.map((entry) => entry.id)).toEqual([KEY_PICKUP_ID])
  })

  it('omits a consumed key id without dropping the map', () => {
    const extras = buildAuthoredOneTimePickups(
      MAP_SOURCE,
      [KEY_SITE],
      new Set([KEY_PICKUP_ID]),
    )
    expect(extras.map((entry) => entry.id)).toEqual([darkForestTreasureMapPickupId()])
  })

  it('rematerializes both pickups when the consumed set is empty (New Game)', () => {
    const consumed = new Set([darkForestTreasureMapPickupId(), KEY_PICKUP_ID])
    consumed.clear()
    const extras = buildAuthoredOneTimePickups(MAP_SOURCE, [KEY_SITE], consumed)
    expect(extras.map((entry) => entry.id)).toEqual([
      darkForestTreasureMapPickupId(),
      KEY_PICKUP_ID,
    ])
  })
})
