import type { Inventory } from './Inventory'
import type { ItemKind } from './items'

/** Tool kinds that can occupy the single "in hand" slot. */
export type ToolKind = 'knife'
| 'firestarter'
| 'shovel'
| 'axe'
| 'wooden_torch'
| 'long_sword'
| 'spear'
| 'short_sword'
| 'pickaxe'
| 'pitchfork'
| 'sickle'
| 'damascus_knife'
| 'damascus_short_sword'
| 'damascus_long_sword'
| 'obsidian_sword'
| 'battle_axe'
| 'masterwork_sword'

const HELD_TOOL_KINDS: ReadonlySet<ItemKind> = new Set<ItemKind>([
  'axe',
  'battle_axe',
  'damascus_knife',
  'damascus_long_sword',
  'damascus_short_sword',
  'firestarter',
  'knife',
  'long_sword',
  'masterwork_sword',
  'obsidian_sword',
  'pickaxe',
  'pitchfork',
  'short_sword',
  'shovel',
  'sickle',
  'spear',
  'wooden_torch',
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
