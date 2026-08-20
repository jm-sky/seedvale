import type { Inventory } from './Inventory'
import type { ItemKind } from './items'
import { isWeaponMaintenanceKind } from './itemInstances'

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
| 'fishing_rod'
| 'short_bow'
| 'hunting_bow'
| 'long_bow'

const HELD_TOOL_KINDS: ReadonlySet<ItemKind> = new Set<ItemKind>([
  'axe',
  'battle_axe',
  'damascus_knife',
  'damascus_long_sword',
  'damascus_short_sword',
  'firestarter',
  'fishing_rod',
  'hunting_bow',
  'knife',
  'long_bow',
  'long_sword',
  'masterwork_sword',
  'obsidian_sword',
  'pickaxe',
  'pitchfork',
  'short_bow',
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
  /** The specific `Inventory` instance in hand — only set (and only
   *  meaningful) for `WEAPON_MAINTENANCE_KINDS` (plan 161). Null for every
   *  count-based tool and whenever nothing is held. */
  heldInstanceId: () => string | null
  /** Equip a tool already in inventory. For a weapon-maintenance kind,
   *  `instanceId` picks which concrete instance goes in hand — an invalid/
   *  missing id falls back to the first available instance of that kind, the
   *  same resolution `syncWithInventory`/restore-from-save use. Returns false
   *  if the kind is missing or not a tool. */
  equip: (kind: ItemKind, instanceId?: string) => boolean
  unequip: () => void
  /** Clears the slot if the held tool is no longer in inventory (e.g. after
   *  drop/sell), and re-resolves `heldInstanceId` if the held instance itself
   *  was removed but another instance of the same kind remains. */
  syncWithInventory: () => void
}

/** One-slot held-tool state — not a full equipment system. Inventory still owns
 *  counts/instances; this only tracks which tool (if any) is currently "in
 *  hand" for UX gates like shovel dig prompts and, for weapon-maintenance
 *  kinds, which concrete instance's durability/sharpness combat should read
 *  (plan 161). */
export function createHeldTool(
  inventory: Inventory,
  initial: ItemKind | null = null,
  initialInstanceId?: string | null,
): HeldTool {
  let current: ToolKind | null = null
  let currentInstanceId: string | null = null

  function hasQuantity(kind: ItemKind): boolean {
    return isWeaponMaintenanceKind(kind) ? inventory.countInstances(kind) > 0 : inventory.has(kind, 1)
  }

  function resolveInstanceId(kind: ToolKind, preferId?: string | null): string | null {
    if (!isWeaponMaintenanceKind(kind)) return null
    const instances = inventory.getInstances(kind)
    if (instances.length === 0) return null
    if (preferId && instances.some((inst) => inst.id === preferId)) return preferId
    return instances[0]!.id
  }

  if (initial !== null && isToolKind(initial) && hasQuantity(initial)) {
    current = initial
    currentInstanceId = resolveInstanceId(initial, initialInstanceId)
  }

  return {
    held: () => current,
    heldInstanceId: () => currentInstanceId,
    equip(kind, instanceId) {
      if (!isToolKind(kind) || !hasQuantity(kind)) return false
      current = kind
      currentInstanceId = resolveInstanceId(kind, instanceId)
      return true
    },
    unequip() {
      current = null
      currentInstanceId = null
    },
    syncWithInventory() {
      if (current === null) return
      if (!hasQuantity(current)) {
        current = null
        currentInstanceId = null
        return
      }
      if (isWeaponMaintenanceKind(current)) {
        if (currentInstanceId === null || !inventory.getInstance(currentInstanceId)) {
          currentInstanceId = resolveInstanceId(current)
        }
      }
    },
  }
}
