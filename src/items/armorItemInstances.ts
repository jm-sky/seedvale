import type { ArmorConfig } from './itemCatalog'
import { ITEM_CATALOG } from './itemCatalog'
import {
  ARMOR_KIND_LIST,
  type ArmorItemInstance,
  type ArmorKind,
  type ArmorQuality,
  createItemInstanceId,
  isArmorItemInstance,
  type ItemInstance,
  normalizeArmorQuality,
} from './itemInstances'
import { ITEM_DEFS, type ItemKind } from './items'

export type { ArmorItemInstance, ArmorKind, ArmorQuality } from './itemInstances'
export {
  ARMOR_KIND_LIST,
  ARMOR_KINDS,
  ARMOR_QUALITIES,
  ARMOR_QUALITY_LABELS,
  ARMOR_QUALITY_RANK,
  isArmorItemInstance,
  isArmorKind,
  isArmorQuality,
  normalizeArmorQuality,
} from './itemInstances'

/**
 * Ordinary acquisition defaults to `common`. Systems that actually determine
 * quality (Merchant stock, future smiths/loot) must pass it explicitly.
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

/**
 * Quality tuning relative to catalog baseline.
 *
 * `penaltyStrength` is a symmetric scale around the catalog multiplier:
 * `1` is identity (`common`); below `1` eases restrictions toward neutral `1`
 * (`good`/`masterwork`); above `1` pushes them farther from `1` (`poor`).
 * Equivalent to the former one-way `penaltyEase` for `good`/`masterwork`
 * (`strength = 1 - ease`) without encoding `poor` as a negative ease hack.
 */
type QualityTuning = {
  protectionScale: number
  weightScale: number
  penaltyStrength: number
}

const QUALITY_TUNING: Record<ArmorQuality, QualityTuning> = {
  poor: { protectionScale: 0.85, weightScale: 1.2, penaltyStrength: 1.35 },
  common: { protectionScale: 1, weightScale: 1, penaltyStrength: 1 },
  good: { protectionScale: 1.1, weightScale: 0.9, penaltyStrength: 0.75 },
  masterwork: { protectionScale: 1.2, weightScale: 0.8, penaltyStrength: 0.5 },
}

const MAX_PIECE_DAMAGE_REDUCTION = 0.85

/**
 * Apply quality to a catalog restriction multiplier.
 * Works for both `> 1` (stamina/recovery cost) and `< 1` (movement speed).
 *
 * @domain items-player
 */
export function applyArmorPenaltyQuality(base: number, quality: ArmorQuality): number {
  const strength = QUALITY_TUNING[normalizeArmorQuality(quality)].penaltyStrength
  return 1 + (base - 1) * strength
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
    staminaCostMultiplier: applyArmorPenaltyQuality(base.staminaCostMultiplier ?? 1, quality),
    meleeRecoveryMultiplier: applyArmorPenaltyQuality(base.meleeRecoveryMultiplier ?? 1, quality),
    movementSpeedMultiplier: applyArmorPenaltyQuality(base.movementSpeedMultiplier ?? 1, quality),
    sprintStaminaMultiplier: applyArmorPenaltyQuality(base.sprintStaminaMultiplier ?? 1, quality),
    weightKg: Math.max(0, baseWeightKg * tuning.weightScale),
  }
}

/**
 * Effective physical mass of an inventory instance. Armor quality changes
 * weight (`poor` heavier, `good`/`masterwork` lighter); other kinds use
 * `ITEM_DEFS` base weight. Liquid contents are added separately by
 * `Inventory.totalWeight()`.
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
