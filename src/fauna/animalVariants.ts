/**
 * @domain fauna
 * @role Per-individual animal variant — a trait of one `AnimalAgent`, not a
 *  species. `AnimalKind` stays the taxonomy; variants only apply multipliers
 *  on top of species baselines (`MAX_HP`, damage tables, `AnimalDef` speeds).
 *
 *  V1 consumers: wolf-den alpha (spawn-slot assignment) and the legacy
 *  `markDangerous()` quest trait, which shares this modifier shape so it
 *  cannot stack a second combat pipeline.
 */

export type AnimalVariant = 'normal' | 'alpha'

export type AnimalVariantDef = {
  scaleMultiplier: number
  healthMultiplier: number
  damageMultiplier: number
  speedMultiplier: number
  /** 0 = no extra darkening. Semantic coefficient; converted to a tint hex
   *  once at presentation init, never re-applied per tick. */
  visualDarken: number
  dangerMultiplier: number
}

export const ANIMAL_VARIANT_DEFS: Record<AnimalVariant, AnimalVariantDef> = {
  normal: {
    scaleMultiplier: 1,
    healthMultiplier: 1,
    damageMultiplier: 1,
    speedMultiplier: 1,
    visualDarken: 0,
    dangerMultiplier: 1,
  },
  alpha: {
    scaleMultiplier: 1.15,
    healthMultiplier: 1.60,
    damageMultiplier: 1.45,
    speedMultiplier: 1.05,
    visualDarken: 0.20,
    dangerMultiplier: 1.75,
  },
}

/**
 * Quest `kill_target_animal { dangerous: true }` (plan 110) — same modifier
 *  shape as a variant so `markDangerous()` composes via max, not a second
 *  HP/damage/scale pipeline. Speed stays 1: the trait never changed movement.
 *  `visualDarken` stays 0: the quest path keeps its dedicated tint hex.
 */
export const DANGEROUS_TRAIT_MODIFIERS: AnimalVariantDef = {
  scaleMultiplier: 1.25,
  healthMultiplier: 2,
  damageMultiplier: 2,
  speedMultiplier: 1,
  visualDarken: 0,
  dangerMultiplier: 2,
}

/**
 * Resolve the effective per-individual multipliers for a variant, optionally
 *  composed with the quest `dangerous` trait.
 *
 *  Composition is **max per field**, never a product: an alpha wolf later
 *  marked dangerous must not receive 1.60×2 HP. Variant is immutable; the
 *  quest trait is applied once at bind time.
 *
 * @domain fauna
 */
export function resolveAnimalVariantStats(
  variant: AnimalVariant = 'normal',
  dangerous = false,
): AnimalVariantDef {
  const base = ANIMAL_VARIANT_DEFS[variant]
  if (!dangerous) return { ...base }
  const trait = DANGEROUS_TRAIT_MODIFIERS
  return {
    scaleMultiplier: Math.max(base.scaleMultiplier, trait.scaleMultiplier),
    healthMultiplier: Math.max(base.healthMultiplier, trait.healthMultiplier),
    damageMultiplier: Math.max(base.damageMultiplier, trait.damageMultiplier),
    speedMultiplier: Math.max(base.speedMultiplier, trait.speedMultiplier),
    visualDarken: base.visualDarken,
    dangerMultiplier: Math.max(base.dangerMultiplier, trait.dangerMultiplier),
  }
}

/**
 * Deterministic initial-fill variant for a `wolfDen` pack slot.
 *  Slot 0 is the alpha; every later slot is `normal`. Independent of
 *  `animalId` / `nextAnimalId` and of how many other species spawned first.
 *
 * @domain fauna
 */
export function wolfDenInitialFillVariant(slotIndex: number): AnimalVariant {
  return slotIndex === 0 ? 'alpha' : 'normal'
}

/**
 * Convert `visualDarken` into a target hex for `tintPropMaterials()`, by
 *  scaling `baseColor` toward black. Returns `null` when there is nothing
 *  to apply so callers can skip the material clone.
 */
export function variantTintHex(baseColor: number, visualDarken: number): number | null {
  if (visualDarken <= 0) return null
  const keep = 1 - visualDarken
  const r = Math.round(((baseColor >> 16) & 0xff) * keep)
  const g = Math.round(((baseColor >> 8) & 0xff) * keep)
  const b = Math.round((baseColor & 0xff) * keep)
  return (r << 16) | (g << 8) | b
}
