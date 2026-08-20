import type { ItemKind } from './items'

/** Minimal per-item identity — only kinds that need individual state use this. */
export type ItemInstance = {
  id: string
  kind: ItemKind
}

export type TrapItemInstance = ItemInstance & {
  kind: 'trap_simple' | 'trap_good'
  durability: number
}

/** Plan 161 — melee tools that carry individual durability/sharpness state.
 *  Central classification: reused by inventory/acquisition/combat/UI instead
 *  of being derived from `ITEM_CATALOG[kind].melee` (which also covers
 *  `shovel`, explicitly out of scope, and would need a second exclusion list
 *  for `pickaxe`). */
export type WeaponMaintenanceKind =
  | 'knife'
  | 'short_sword'
  | 'long_sword'
  | 'spear'
  | 'axe'
  | 'pitchfork'
  | 'sickle'
  | 'damascus_knife'
  | 'damascus_short_sword'
  | 'damascus_long_sword'
  | 'obsidian_sword'
  | 'battle_axe'
  | 'masterwork_sword'

export const WEAPON_MAINTENANCE_KINDS: ReadonlySet<ItemKind> = new Set<ItemKind>([
  'axe',
  'battle_axe',
  'damascus_knife',
  'damascus_long_sword',
  'damascus_short_sword',
  'knife',
  'long_sword',
  'masterwork_sword',
  'obsidian_sword',
  'pitchfork',
  'short_sword',
  'sickle',
  'spear',
])

export function isWeaponMaintenanceKind(kind: ItemKind): kind is WeaponMaintenanceKind {
  return WEAPON_MAINTENANCE_KINDS.has(kind)
}

/** `durability`/`sharpness` are `[0,1]`, `1` on a fresh instance. `durability`
 *  is tracked but v1 has no repair/broken lifecycle (plan 161) — a weapon
 *  keeps working at any durability. */
export type WeaponItemInstance = ItemInstance & {
  kind: WeaponMaintenanceKind
  durability: number
  sharpness: number
}

export function isWeaponItemInstance(instance: ItemInstance): instance is WeaponItemInstance {
  return isWeaponMaintenanceKind(instance.kind)
}

let nextInstanceId = 0

/** Stable ID for the physical item across inventory ↔ world boundaries. */
export function createItemInstanceId(): string {
  nextInstanceId += 1
  return `item:${Date.now()}:${nextInstanceId}`
}

export const INSTANCE_BACKED_KINDS: ReadonlySet<ItemKind> = new Set<ItemKind>([
  'trap_good',
  'trap_simple',
  ...WEAPON_MAINTENANCE_KINDS,
])

export function isInstanceBackedKind(kind: ItemKind): boolean {
  return INSTANCE_BACKED_KINDS.has(kind)
}

export function isTrapItemInstance(instance: ItemInstance): instance is TrapItemInstance {
  return instance.kind === 'trap_simple' || instance.kind === 'trap_good'
}

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 1
  return Math.max(0, Math.min(1, n))
}

export function cloneItemInstance(instance: ItemInstance): ItemInstance {
  if (isTrapItemInstance(instance)) {
    const trap: TrapItemInstance = {
      id: instance.id,
      kind: instance.kind,
      durability: instance.durability,
    }
    return trap
  }
  if (isWeaponItemInstance(instance)) {
    const weapon: WeaponItemInstance = {
      id: instance.id,
      kind: instance.kind,
      durability: instance.durability,
      sharpness: instance.sharpness,
    }
    return weapon
  }
  return { id: instance.id, kind: instance.kind }
}
