import { ITEM_DEFS, type ItemKind } from './items'
import type { ArmorConfig } from './itemCatalog'
import { ITEM_CATALOG } from './itemCatalog'
import {
  createItemInstanceId,
  isArmorItemInstance,
  normalizeArmorQuality,
  type ArmorItemInstance,
  type ArmorKind,
  type ArmorQuality,
  type ItemInstance,
  ARMOR_KIND_LIST,
} from './itemInstances'

export type { ArmorItemInstance, ArmorKind, ArmorQuality } from './itemInstances'
export {
  ARMOR_KIND_LIST,
  ARMOR_KINDS,
  ARMOR_QUALITIES,
  ARMOR_QUALITY_LABELS,
  isArmorKind,
  isArmorQuality,
  isArmorItemInstance,
  normalizeArmorQuality,
} from './itemInstances'

/**
 * Ordinary acquisition defaults to `common`. Future smiths/loot may pass
 * `good` / `masterwork` explicitly.
 *
 * @domain items-player
 */
export function createArmorInstance(kind: ArmorKind, quality: ArmorQuality = 'common', id?: string): ArmorItemInstance {
  return {
    id: id ?? createItemInstanceId(),
    kind,
    quality: normalizeArmorQuality(quality),
  }
}

/** Quality tuning relative to catalog baseline (plan items-player-030). */
type QualityTuning = {
  protectionScale: number
  weightScale: number
  /** How far restriction multipliers move toward neutral `1` (0 = unchanged). */
  penaltyEase: number
}

const QUALITY_TUNING: Record<ArmorQuality, QualityTuning> = {
  common: { protectionScale: 1, weightScale: 1, penaltyEase: 0 },
  good: { protectionScale: 1.1, weightScale: 0.9, penaltyEase: 0.25 },
  masterwork: { protectionScale: 1.2, weightScale: 0.8, penaltyEase: 0.5 },
}

const MAX_PIECE_DAMAGE_REDUCTION = 0.85

function easeMultiplierTowardNeutral(value: number, ease: number): number {
  return value + (1 - value) * ease
}

/** Effective per-piece armor stats after quality adjustment — shared by gameplay and UI.
 *
 * @domain items-player
 */
export type EffectiveArmorPiece = {
  slot: ArmorConfig['slot']
  damageReduction: number
  staminaCostMultiplier: number
  meleeRecoveryMultiplier: number
  movementSpeedMultiplier: number
  sprintStaminaMultiplier: number
  weightKg: number
}

/**
 * Resolve catalog baseline + quality into effective piece properties.
 * Single source of truth — do not recompute quality in Vue or combat.
 *
 * @domain items-player
 */
export function resolveEffectiveArmorPiece(
  base: ArmorConfig,
  quality: ArmorQuality,
  baseWeightKg: number,
): EffectiveArmorPiece {
  const tuning = QUALITY_TUNING[normalizeArmorQuality(quality)]
  const damageReduction = Math.min(
    MAX_PIECE_DAMAGE_REDUCTION,
    Math.max(0, base.damageReduction * tuning.protectionScale),
  )
  return {
    slot: base.slot,
    damageReduction,
    staminaCostMultiplier: easeMultiplierTowardNeutral(base.staminaCostMultiplier ?? 1, tuning.penaltyEase),
    meleeRecoveryMultiplier: easeMultiplierTowardNeutral(base.meleeRecoveryMultiplier ?? 1, tuning.penaltyEase),
    movementSpeedMultiplier: easeMultiplierTowardNeutral(base.movementSpeedMultiplier ?? 1, tuning.penaltyEase),
    sprintStaminaMultiplier: easeMultiplierTowardNeutral(base.sprintStaminaMultiplier ?? 1, tuning.penaltyEase),
    weightKg: Math.max(0, baseWeightKg * tuning.weightScale),
  }
}

/**
 * Effective physical mass of an inventory instance. Armor quality reduces
 * weight; other kinds use `ITEM_DEFS` base weight. Liquid contents are added
 * separately by `Inventory.totalWeight()`.
 *
 * @domain items-player
 */
export function effectiveInstanceWeight(instance: ItemInstance): number {
  const base = ITEM_DEFS[instance.kind].weight
  if (isArmorItemInstance(instance)) {
    const armor = ITEM_CATALOG[instance.kind].armor
    if (armor) {
      return resolveEffectiveArmorPiece(armor, instance.quality, base).weightKg
    }
  }
  return base
}

/** Runtime migration: count-backed armor stacks → `common` instances (idempotent).
 *
 * @domain items-player
 */
export function migrateArmorCountsToInstances(inventory: {
  count: (kind: ItemKind) => number
  remove: (kind: ItemKind, n: number) => void
  addInstance: (instance: ItemInstance) => boolean
}): void {
  for (const kind of ARMOR_KIND_LIST) {
    const count = inventory.count(kind)
    if (count <= 0) continue
    inventory.remove(kind, count)
    for (let i = 0; i < count; i++) {
      inventory.addInstance(createArmorInstance(kind, 'common'))
    }
  }
}
