/**
 * Generic player-facing storage container (plan 164) — pure domain data, no
 * `THREE`/DOM. World lifecycle lives in `world/createPlacedContainers.ts`
 * (same split as `items/tentPlacement.ts` vs `items/createPlacedTents.ts`).
 *
 * A `Container`'s contents reuse `Inventory` directly (plan 164 implementation
 * notes §7 — "one item representation, not necessarily one class instance")
 * rather than a second `StoredItem`/`ContainerInventory` model: the same
 * counts/instances/weight/add/remove/serialization already cover stackable
 * items, `ItemInstance`-backed items (traps, weapon-maintenance kinds) and
 * gabarite capacity (`Inventory.maxSize`) with zero new code. A container's
 * `maxWeight` is `Infinity` — plan 164 §2/§9 makes gabarite (`ItemSize`) the
 * only capacity axis *inside* the container; weight only matters once the
 * whole container is picked up (`containerTotalWeight` below).
 */
import type { GroundPlacementReason } from './tentPlacement'

/** Only one concrete container exists yet (plan 164 §4/§12/§26 explicitly
 *  defer Small/Medium/Large/Barrel/Crate/Sack variants) — kept as a union
 *  (not a literal `'chest'` type) so `CONTAINER_DEFS` stays the single place
 *  a future variant gets added, not a scattered set of string checks. */
export type ContainerKind = 'chest'

export type ContainerDef = {
  kind: ContainerKind
  /** The `ItemKind` this container is purchased/carried as before it's ever
   *  placed — `ITEM_CATALOG[itemKind]` owns price/label/model, not this def. */
  itemKind: 'chest'
  label: string
  /** Gabarite capacity (plan 164 §2), in the same abstract units as
   *  `ITEM_SIZE_UNITS` — an upper bound, not a packing simulation. */
  capacityUnits: number
  /** Empty container mass (kg) — `containerTotalWeight` adds contents on top. */
  baseWeightKg: number
  /** Footprint/separation used by `evaluateGroundPlacement`, same contract as
   *  `TENT_FOOTPRINT_RADIUS`/`TRAP_FOOTPRINT_RADIUS`. */
  footprintRadius: number
  separation: number
}

export const CONTAINER_DEFS: Record<ContainerKind, ContainerDef> = {
  chest: {
    kind: 'chest',
    itemKind: 'chest',
    label: 'skrzynia',
    capacityUnits: 32,
    baseWeightKg: 4,
    footprintRadius: 0.6,
    separation: 1.6,
  },
}

export type ContainerPlacementReason = GroundPlacementReason | 'container'

export const CONTAINER_PLACEMENT_MESSAGE: Record<Exclude<ContainerPlacementReason, 'ok'>, string> = {
  water: 'Tu jest za mokro na skrzynię.',
  slope: 'Teren jest zbyt stromy.',
  object: 'Za mało miejsca — coś stoi w pobliżu.',
  occupied: 'Tu już coś stoi.',
  container: 'Tu już stoi skrzynia.',
}

/** Total carried mass of a container + its contents (plan 164 §8) — the
 *  single authoritative calc `player/playerEncumbrance.ts` and any UI both
 *  read, never duplicated. */
export function containerTotalWeight(def: ContainerDef, contentsWeightKg: number): number {
  return def.baseWeightKg + contentsWeightKg
}

/** How far ahead of the player a container is set down/picked back up —
 *  mirrors `TRAP_PLACE_REACH`. */
export const CONTAINER_PLACE_REACH = 1.6
/** Busy-channel length for setting a container down — same order as
 *  tent/trap setup. */
export const CONTAINER_SETUP_DURATION_SEC = 2
