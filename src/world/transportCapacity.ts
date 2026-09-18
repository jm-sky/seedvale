import type { PackConfig } from '../fauna/animalDefs'

/**
 * Merchant/carrier transport-cargo capacity (plan settlements-npcs-047).
 *
 * A carrier's effective `NpcAuthoritativeState.transportCargo` weight limit
 * is a pure function of an optional pack-animal capability — never a
 * species-name branch. `PackConfig.cargoCapacityKg` is the **total**
 * effective capacity of the NPC+animal pair, not a bonus added on top of the
 * baseline. Plan settlements-npcs-048 will resolve a real `packAnimalId` to
 * an `AnimalDef.pack` and feed it here; this module does not select or own
 * any animal.
 *
 * @domain settlements-npcs
 */

/** Baseline transport-cargo capacity for a carrier with no pack animal. */
export const BASE_TRANSPORT_CARGO_MAX_WEIGHT_KG = 10

/** Resolves effective transport-cargo capacity for a carrier, optionally
 *  paired with a pack animal's capability. */
export function resolveNpcTransportCargoCapacity(pack?: PackConfig): number {
  return pack ? pack.cargoCapacityKg : BASE_TRANSPORT_CARGO_MAX_WEIGHT_KG
}
