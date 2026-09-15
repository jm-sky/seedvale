import type { TreasureMapSourcePlace } from '../world/locations/darkForestTreasureSite'
import { abandonedTreasureKeyPickups, type TreasureSiteDefinition } from '../world/treasureSites'
import type { OneTimeWorldItemPickup } from './createItemSpawners'

/**
 * Authored one-shot world pickups that `WorldBundle` materializes through
 * `extraOneTimePickups`. Filters already-consumed stable ids so rebuild/load
 * cannot rematerialize the source.
 *
 * @domain quests-progression
 */
export function buildAuthoredOneTimePickups(
  mapSource: TreasureMapSourcePlace | null | undefined,
  treasureSites: readonly TreasureSiteDefinition[],
  consumedWorldPickupIds: ReadonlySet<string>,
): OneTimeWorldItemPickup[] {
  const extras: OneTimeWorldItemPickup[] = []
  if (mapSource && !consumedWorldPickupIds.has(mapSource.pickupId)) {
    extras.push({
      id: mapSource.pickupId,
      kind: 'treasure_map_dark_forest',
      x: mapSource.pickupX,
      z: mapSource.pickupZ,
      anchoredToWorldPlace: true,
    })
  }
  for (const key of abandonedTreasureKeyPickups(treasureSites)) {
    if (consumedWorldPickupIds.has(key.pickupId)) continue
    extras.push({
      id: key.pickupId,
      kind: 'key',
      x: key.x,
      z: key.z,
      anchoredToWorldPlace: true,
      instanceId: key.keyInstanceId,
    })
  }
  return extras
}
