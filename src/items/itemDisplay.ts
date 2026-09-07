import { ITEM_CATALOG } from './itemCatalog'
import { ITEM_DEFS, type ItemKind } from './items'

/**
 * Shared user-facing display name for an item kind. Books are prefixed
 * (`Książka: <tytuł>`) so players recognize them as books rather than just
 * titles; the raw `ITEM_DEFS[kind].label` stays an unprefixed title so
 * contexts that quote the title directly (e.g. `readBookItem()` toasts)
 * are unaffected. Detection uses `ITEM_CATALOG[kind].book`, not `kind`
 * naming or `knowledge` category — `map_near`/`map_far` are `knowledge`
 * but not books (plan ui-input-009).
 *
 * @domain items-player
 */
export function itemDisplayName(kind: ItemKind): string {
  const label = ITEM_DEFS[kind].label
  return ITEM_CATALOG[kind].book != null ? `Książka: ${label}` : label
}
