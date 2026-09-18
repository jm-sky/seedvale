import type { AnimalDef } from './animalDefs'
import { STORED_FOOD_DECAY } from '../items/foodFreshness'
import { Inventory, type InventoryContentsSnapshot, inventoryFromContents, snapshotInventoryContents } from '../items/Inventory'

/**
 * @domain fauna
 * @role Runtime/persistence mechanics for the equipped-saddlebags pack
 *  capability (plan fauna-039) — pure domain data plus a small set of
 *  transaction helpers, no Three.js and no app/UI wiring. `AnimalAgent`
 *  stays the lifecycle owner (holds one `AnimalPackState | null` field,
 *  attaches/detaches the presentation) and delegates the actual state
 *  transitions here.
 */

/** Live per-animal pack state — the pack `Inventory` is authoritative,
 *  independent of and never added to the player's own carry capacity (plan
 *  fauna-039 §17). Only one `equipment` kind exists so far (`saddlebags`),
 *  kept as a literal (not a bare boolean) so a future second tier/kind only
 *  needs a new union member here, not a second parallel state shape. */
export type AnimalPackState = {
  equipment: 'saddlebags'
  contents: Inventory
}

/** Persisted shape of `AnimalPackState` — belongs to `AnimalSaveState.pack`
 *  (never a top-level `SaveData` field, plan fauna-039 §4/§18). Absence
 *  means "no pack equipped", the same convention every other optional
 *  `AnimalSaveState` field uses. */
export type AnimalPackSnapshot = {
  equipment: 'saddlebags'
  contents: InventoryContentsSnapshot
}

/** Constructs the pack `Inventory` for `def` — weight-unlimited (the animal
 *  carries the mass, not the player), gabarite-capped by
 *  `def.pack.cargoCapacityUnits`. `null` when `def` has no pack capability. */
function createPackInventory(def: AnimalDef, snapshot?: InventoryContentsSnapshot): Inventory | null {
  if (!def.pack) return null
  return snapshot
    ? inventoryFromContents(snapshot, Infinity, def.pack.cargoCapacityUnits, STORED_FOOD_DECAY)
    : new Inventory({}, Infinity, undefined, undefined, def.pack.cargoCapacityUnits, STORED_FOOD_DECAY)
}

/** Fresh, empty pack for a just-equipped animal (plan fauna-039 §7). `null`
 *  when `def` has no pack capability — callers should already have checked
 *  `canEquipAnimalPack()` first. */
export function createAnimalPack(def: AnimalDef): AnimalPackState | null {
  const contents = createPackInventory(def)
  return contents ? { equipment: 'saddlebags', contents } : null
}

/** Restores a pack from a save (plan fauna-039 §4) — capacity is always
 *  re-derived from the current `def.pack`, never persisted (species tuning
 *  may change between save and load). `undefined`/no current pack
 *  capability both mean "no pack". */
export function hydrateAnimalPack(def: AnimalDef, snapshot: AnimalPackSnapshot | undefined): AnimalPackState | null {
  if (!snapshot) return null
  const contents = createPackInventory(def, snapshot.contents)
  return contents ? { equipment: 'saddlebags', contents } : null
}

/** Plain-data snapshot for `AnimalSaveState.pack` — `undefined` for "no
 *  pack", never a placeholder empty object. */
export function snapshotAnimalPack(pack: AnimalPackState | null): AnimalPackSnapshot | undefined {
  return pack ? { equipment: pack.equipment, contents: snapshotInventoryContents(pack.contents) } : undefined
}

/** Lossless snapshot for the death handoff (plan fauna-039 §20) — same shape
 *  as `snapshotAnimalPack`, named for the caller's intent: the returned
 *  contents become the ground container's contents, and the live pack is
 *  gone (the caller clears `AnimalAgent`'s own field). Never drops/copies
 *  through player `Inventory`. */
export function detachAnimalPack(pack: AnimalPackState): AnimalPackSnapshot {
  return { equipment: pack.equipment, contents: snapshotInventoryContents(pack.contents) }
}

/** Equip eligibility (plan fauna-039 §6) — capability, aliveness, ownership
 *  and "not already equipped" are checked here; the caller (app-layer
 *  action) still has to independently check the player actually holds a
 *  `saddlebags` item and is in interaction range. */
export function canEquipAnimalPack(def: AnimalDef, opts: { alive: boolean, playerOwned: boolean, hasPack: boolean }): boolean {
  return def.pack !== undefined && opts.alive && opts.playerOwned && !opts.hasPack
}

/** Unequip eligibility (plan fauna-039 §14) — only an equipped, fully empty
 *  pack may be removed; a non-empty pack must be blocked ("Najpierw opróżnij
 *  juki."), never auto-emptied or dropped. */
export function canUnequipAnimalPack(pack: AnimalPackState | null): boolean {
  return pack !== null && pack.contents.isEmpty()
}

/** Stable id for the persistent ground container a dead pack-carrying
 *  animal's cargo hands off to (plan fauna-039 §21) — namespaced by the
 *  animal's *origin* settlement, not just `animalId` (which is not globally
 *  unique across settlements, see `livestock.ts`'s `removedKey`). The single
 *  place this string is built, so death handoff and restore reconciliation
 *  can never drift from each other. */
export function animalPackGroundContainerId(settlementId: string, animalId: string): string {
  return `animal-pack:${settlementId}:${animalId}`
}

/** Small lateral offset (m) from the animal's own resting spot for the
 *  dropped pack (plan fauna-039 §22) — deliberately not the corpse's exact
 *  center, and deliberately no RNG (deterministic simulation). Offset is
 *  perpendicular to the animal's own facing at time of death. Exact
 *  magnitude is a placeholder for browser tuning. */
const DROPPED_PACK_LATERAL_OFFSET = 0.6

export function resolveDroppedPackPosition(animalX: number, animalZ: number, animalYaw: number): { x: number, z: number } {
  return {
    x: animalX + Math.cos(animalYaw) * DROPPED_PACK_LATERAL_OFFSET,
    z: animalZ - Math.sin(animalYaw) * DROPPED_PACK_LATERAL_OFFSET,
  }
}
