import { TRAP_DEFS, type TrapKind, trapKindForItem } from '../world/animalTraps'
import { createItemInstanceId, type TrapItemInstance } from './itemInstances'

export type { TrapItemInstance } from './itemInstances'

export function createTrapInstance(kind: 'trap_simple' | 'trap_good'): TrapItemInstance {
  const trapKind = trapKindForItem(kind)!
  return {
    id: createItemInstanceId(),
    kind,
    durability: TRAP_DEFS[trapKind].maxDurability,
  }
}

export function trapInstanceFromWorld(
  id: string,
  trapKind: TrapKind,
  durability: number,
): TrapItemInstance {
  const def = TRAP_DEFS[trapKind]
  return {
    id,
    kind: def.itemKind as TrapItemInstance['kind'],
    durability,
  }
}

export function trapMaxDurability(instance: TrapItemInstance): number {
  return TRAP_DEFS[trapKindForItem(instance.kind)!].maxDurability
}

/** 0–1 ratio of remaining durability. */
export function trapConditionRatio(instance: TrapItemInstance): number {
  const max = trapMaxDurability(instance)
  if (max <= 0) return 0
  return Math.max(0, Math.min(1, instance.durability / max))
}

/** Rounded percent for UI, e.g. 50 for half durability. */
export function trapConditionPercent(instance: TrapItemInstance): number {
  return Math.round(trapConditionRatio(instance) * 100)
}

export function isPlaceableTrapInstance(instance: TrapItemInstance): boolean {
  return instance.durability > 0
}
