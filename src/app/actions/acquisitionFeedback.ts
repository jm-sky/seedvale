import type { ItemKind } from '../../items/items'
import type { Toast } from '../../ui/createToast'
import { isInstanceBackedKind } from '../../items/itemInstances'
import { ITEM_DEFS } from '../../items/items'
import { firstUpperCase } from '../../ui-vue/lib/firstUpperCase'

/**
 * Count-backed acquisition toast after a real inventory commit
 * (`Label +N · Masz: total`). Instance-backed items keep their own feedback.
 *
 * @domain ui-input
 */
export function formatCountAcquisitionToast(kind: ItemKind, delta: number, total: number): string | null {
  if (delta <= 0 || isInstanceBackedKind(kind)) return null
  return `${firstUpperCase(ITEM_DEFS[kind].label)} +${delta} · Masz: ${total}`
}

/**
 * Shows grouped pickup feedback when `delta` actually entered inventory.
 *
 * @domain ui-input
 */
export function showCountAcquisitionToast(
  toast: Toast,
  kind: ItemKind,
  delta: number,
  total: number,
): void {
  const text = formatCountAcquisitionToast(kind, delta, total)
  if (text) toast.show(text, 'pickup')
}
