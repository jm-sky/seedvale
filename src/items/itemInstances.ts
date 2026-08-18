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

let nextInstanceId = 0

/** Stable ID for the physical item across inventory ↔ world boundaries. */
export function createItemInstanceId(): string {
  nextInstanceId += 1
  return `item:${Date.now()}:${nextInstanceId}`
}

export const INSTANCE_BACKED_KINDS: ReadonlySet<ItemKind> = new Set<ItemKind>([
  'trap_good',
  'trap_simple',
])

export function isInstanceBackedKind(kind: ItemKind): boolean {
  return INSTANCE_BACKED_KINDS.has(kind)
}

export function isTrapItemInstance(instance: ItemInstance): instance is TrapItemInstance {
  return instance.kind === 'trap_simple' || instance.kind === 'trap_good'
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
  return { id: instance.id, kind: instance.kind }
}
