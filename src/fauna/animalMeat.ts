import type { ItemKind } from '../items/items'
import type { AnimalKind } from './AnimalAgent'

/**
 * Species → meat `ItemKind` (plan 134). One table, three consumers: the knife
 * harvest yield (`app/createApp.ts`), the visual meat scraps on harvested
 * remains (`fauna/harvestedRemains.ts`) and the trap catch (plan 141,
 * `world/createPlacedTraps.ts`). Species with no dedicated kind fall back to
 * the original generic `raw_meat` — this is deliberately *only* the mapping,
 * not the harvest flow (which also spends a busy channel, pins the corpse and
 * yields `hide`).
 */
export const MEAT_KIND_BY_ANIMAL: Partial<Record<AnimalKind, ItemKind>> = {
  deer: 'deer_meat',
  wolf: 'wolf_meat',
  boar: 'boar_meat',
  rabbit: 'rabbit_meat',
  cow: 'beef',
}

export function meatKindForAnimal(kind: AnimalKind): ItemKind {
  return MEAT_KIND_BY_ANIMAL[kind] ?? 'raw_meat'
}
