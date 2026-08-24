import type { Inventory } from '../items/Inventory'
import type { ItemKind } from '../items/items'
import type { AnimalAgent } from './AnimalAgent'
import { meatKindForAnimal } from './animalMeat'

export type AnimalHarvestResult = {
  meatKind: ItemKind
  /** Whether `hide` was also added — `false` only when there was no room
   *  left for it (meat still succeeded). */
  hide: boolean
}

/**
 * Generic knife-harvest core (plan 134/178): marks `animal`'s corpse
 * harvested and adds its species meat (+ `hide` when there's room) to
 * `inventory`. The single reusable operation behind both the player's own
 * `[E]` harvest (`app/actions/survivalActions.ts`'s `startHarvestMeat`) and
 * the Hunter NPC's post-kill harvest (`ai/NpcAgent.ts`) — neither duplicates
 * this sequence itself. Callers own gating that isn't about the corpse/yield
 * itself (busy-channel state, held-tool/knife-capability checks, toasts) —
 * this only ever mutates `animal`/`inventory`, nothing else.
 *
 * Returns `null` (no mutation) when the corpse is no longer harvestable or
 * `inventory` has no room for the meat kind — e.g. another actor already
 * harvested it, or claimed the last carry-weight headroom, between the
 * caller's own check and this call.
 */
export function harvestAnimalIntoInventory(
  animal: AnimalAgent,
  inventory: Inventory,
  acquiredAtDays: number,
): AnimalHarvestResult | null {
  if (!animal.canHarvestMeat()) return null
  const meatKind = meatKindForAnimal(animal.def.kind)
  if (!inventory.canAdd(meatKind, 1)) return null
  animal.harvestMeat()
  inventory.add(meatKind, 1, acquiredAtDays)
  const hide = inventory.canAdd('hide', 1) && inventory.add('hide', 1)
  return { meatKind, hide }
}
