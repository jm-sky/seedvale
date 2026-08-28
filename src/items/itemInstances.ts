import type { ItemKind } from './items'

/** Minimal per-item identity — only kinds that need individual state use this. */
export type ItemInstance = {
  id: string
  kind: ItemKind
}

export type TrapKind = 'trap_simple' | 'trap_good'

export type TrapItemInstance = ItemInstance & {
  kind: TrapKind
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

/** Ordered list form of `WEAPON_MAINTENANCE_KINDS` — the single declaration
 *  the set is built from, so callers that need to *iterate* the kinds (the
 *  save migration in `weaponMaintenance.ts`) don't hand-maintain a copy. */
export const WEAPON_MAINTENANCE_KIND_LIST: readonly WeaponMaintenanceKind[] = [
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
]

export const WEAPON_MAINTENANCE_KINDS: ReadonlySet<ItemKind> = new Set<ItemKind>(WEAPON_MAINTENANCE_KIND_LIST)

export function isWeaponMaintenanceKind(kind: ItemKind): kind is WeaponMaintenanceKind {
  return WEAPON_MAINTENANCE_KINDS.has(kind)
}

/** What a liquid-container instance (plan items-player-001) can hold. */
export type LiquidContent = 'water' | 'milk'

/** Kinds backed by `LiquidContainerItemInstance` — three waterskin sizes
 *  (water only) and two buckets (water or milk); `ITEM_CATALOG[kind].container`
 *  carries capacity/allowed-content rules (`items/liquidContainer.ts`). */
export type LiquidContainerKind =
  | 'waterskin_small'
  | 'waterskin_medium'
  | 'waterskin_large'
  | 'wooden_bucket'
  | 'copper_bucket'

export const LIQUID_CONTAINER_KIND_LIST: readonly LiquidContainerKind[] = [
  'waterskin_small',
  'waterskin_medium',
  'waterskin_large',
  'wooden_bucket',
  'copper_bucket',
]

export const LIQUID_CONTAINER_KINDS: ReadonlySet<ItemKind> = new Set<ItemKind>(LIQUID_CONTAINER_KIND_LIST)

export function isLiquidContainerKind(kind: ItemKind): kind is LiquidContainerKind {
  return LIQUID_CONTAINER_KINDS.has(kind)
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

/** `liquid` null + `amountLitres` 0 = empty; `amountLitres` is always within
 *  `[0, capacityLiters]` for the instance's kind
 *  (`ITEM_CATALOG[kind].container`, enforced by `items/liquidContainer.ts`). */
export type LiquidContainerItemInstance = ItemInstance & {
  kind: LiquidContainerKind
  liquid: LiquidContent | null
  amountLitres: number
}

export function isLiquidContainerInstance(instance: ItemInstance): instance is LiquidContainerItemInstance {
  return isLiquidContainerKind(instance.kind)
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
  ...LIQUID_CONTAINER_KINDS,
])

export function isInstanceBackedKind(kind: ItemKind): boolean {
  return INSTANCE_BACKED_KINDS.has(kind)
}

export function isTrapKind(kind: ItemKind): kind is TrapKind {
  return kind === 'trap_simple' || kind === 'trap_good'
}

export function isTrapItemInstance(instance: ItemInstance): instance is TrapItemInstance {
  return isTrapKind(instance.kind)
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
  if (isLiquidContainerInstance(instance)) {
    const container: LiquidContainerItemInstance = {
      id: instance.id,
      kind: instance.kind,
      liquid: instance.liquid,
      amountLitres: instance.amountLitres,
    }
    return container
  }
  return { id: instance.id, kind: instance.kind }
}
