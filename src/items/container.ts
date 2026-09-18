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

/** `chest`/`casket` are player-placed (plan 164 §4/§12/§26 explicitly defer
 *  Small/Medium/Large/Barrel/Crate/Sack variants). `saddlebags` is never
 *  placed by the player directly — it only ever appears on the ground via
 *  the animal-pack death handoff (plan fauna-039 §20/§23) — kept in the same
 *  union (not a separate type) so `CONTAINER_DEFS`/`pickupPolicy` stay the
 *  single place any container kind's behaviour differs, not scattered kind
 *  checks. */
export type ContainerKind = 'chest' | 'casket' | 'saddlebags'

/** How a placed container converts back to a carried/inventory item (plan
 *  fauna-039 §24) — `ContainerDef`-level policy instead of interaction code
 *  branching on `kind`. `carry-container` is `chest`/`casket`'s existing
 *  pick-up-whole-container behaviour (`PlacedContainers.pickUp`/carried
 *  state). `empty-to-item` (`saddlebags` only) never enters carried state at
 *  all — it converts back to exactly one `ItemKind` instance once empty,
 *  via a dedicated app-layer transaction (`PlacedContainers.remove`). */
export type ContainerPickupPolicy = 'carry-container' | 'empty-to-item'

export type ContainerDef = {
  kind: ContainerKind
  /** The `ItemKind` this container is purchased/carried as before it's ever
   *  placed (`chest`/`casket`), or recovered as once empty (`saddlebags`) —
   *  `ITEM_CATALOG[itemKind]` owns price/label/model, not this def. */
  itemKind: 'chest' | 'saddlebags'
  label: string
  pickupPolicy: ContainerPickupPolicy
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
    pickupPolicy: 'carry-container',
    capacityUnits: 32,
    baseWeightKg: 4,
    footprintRadius: 0.6,
    separation: 1.6,
  },
  casket: {
    kind: 'casket',
    itemKind: 'chest',
    label: 'trumna',
    pickupPolicy: 'carry-container',
    capacityUnits: 16,
    baseWeightKg: 12,
    footprintRadius: 0.75,
    separation: 1.8,
  },
  // Dropped animal-pack cargo (plan fauna-039 §23/§27) — gabarite capacity is
  // a fixed generic ceiling here (at least as large as the largest
  // `AnimalDef.pack`, plan fauna-039 §27 explicitly avoids persisting the
  // originating animal's own capacity once ownership has moved to the
  // world). Never placed via `PlacedContainers.place()`, only via
  // `materialize()` at a caller-supplied stable id/position.
  saddlebags: {
    kind: 'saddlebags',
    itemKind: 'saddlebags',
    label: 'juki',
    pickupPolicy: 'empty-to-item',
    capacityUnits: 32,
    baseWeightKg: 0,
    footprintRadius: 0.4,
    separation: 1,
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

/** Ground interaction prompt for a placed container (plan fauna-039 §24/
 *  §26) — `chest`/`casket` keep their exact existing text unchanged;
 *  `saddlebags` never offers `[R]` until its `empty-to-item` pickup is
 *  actually legal (an already-gated `[R]` never blocks on click — the
 *  prompt and the mutation agree). The single place this branches by kind,
 *  so interaction/gameLoop code never has to. */
export function containerGroundPrompt(kind: ContainerKind, empty: boolean): string {
  if (kind === 'saddlebags') {
    return empty ? '[E] Otwórz juki · [R] Podnieś juki' : '[E] Otwórz juki'
  }
  return '[E] Otwórz skrzynię · [R] Podnieś skrzynię'
}

/** How far ahead of the player a container is set down/picked back up —
 *  mirrors `TRAP_PLACE_REACH`. */
export const CONTAINER_PLACE_REACH = 1.6
/** Busy-channel length for setting a container down — same order as
 *  tent/trap setup. */
export const CONTAINER_SETUP_DURATION_SEC = 2
