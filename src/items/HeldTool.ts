import type { Inventory } from './Inventory'
import type { ItemKind } from './items'

/** Tool kinds that can occupy the single "in hand" slot. */
export type ToolKind = 'knife' | 'firestarter' | 'shovel' | 'axe'

const HELD_TOOL_KINDS: ReadonlySet<ItemKind> = new Set<ItemKind>([
  'axe',
  'firestarter',
  'knife',
  'shovel',
])

export function isToolKind(kind: ItemKind): kind is ToolKind {
  return HELD_TOOL_KINDS.has(kind)
}

export type HeldTool = {
  held: () => ToolKind | null
  /** Equip a tool already in inventory. Returns false if missing or not a tool. */
  equip: (kind: ItemKind) => boolean
  unequip: () => void
  /** Clears the slot if the held tool is no longer in inventory (e.g. after drop). */
  syncWithInventory: () => void
}

/** One-slot held-tool state — not a full equipment system. Inventory still owns
 *  counts; this only tracks which tool (if any) is currently "in hand" for UX
 *  gates like shovel dig prompts. */
export function createHeldTool(
  inventory: Inventory,
  initial: ItemKind | null = null,
): HeldTool {
  let current: ToolKind | null =
    initial !== null && isToolKind(initial) && inventory.has(initial, 1) ? initial : null

  return {
    held: () => current,
    equip(kind) {
      if (!isToolKind(kind) || !inventory.has(kind, 1)) return false
      current = kind
      return true
    },
    unequip() {
      current = null
    },
    syncWithInventory() {
      if (current !== null && !inventory.has(current, 1)) current = null
    },
  }
}
