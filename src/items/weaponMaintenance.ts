/**
 * Weapon maintenance (plan 161) — durability/sharpness for the central
 * `WEAPON_MAINTENANCE_KINDS` set. Extends `Inventory`'s generic instance
 * model (plan 155); deliberately not a `MaintenanceManager` — every function
 * here is a pure resolver or a small domain operation over `Inventory`'s own
 * controlled mutation API.
 */
import type { Inventory } from './Inventory'
import {
  clamp01,
  createItemInstanceId,
  isWeaponItemInstance,
  WEAPON_MAINTENANCE_KIND_LIST,
  type WeaponItemInstance,
  type WeaponMaintenanceKind,
} from './itemInstances'

/** Sharpness/durability loss per resolved hit, and how much a whetstone
 *  restores — flat across the maintenance set for v1 (plan 161 §"Maintenance
 *  profile" allows quality/material to vary this later via the same
 *  resolver, but nothing in plan 160's variants asks for it yet). */
export type WeaponMaintenanceProfile = {
  sharpnessLossPerHit: number
  sharpeningAmount: number
  durabilityWearPerHit: number
}

const DEFAULT_PROFILE: WeaponMaintenanceProfile = {
  sharpnessLossPerHit: 0.012,
  sharpeningAmount: 0.35,
  durabilityWearPerHit: 0.0015,
}

/** Single lookup — a per-kind override table if a future weapon ever needs
 *  one, without touching call sites. */
const PROFILE_OVERRIDES: Partial<Record<WeaponMaintenanceKind, Partial<WeaponMaintenanceProfile>>> = {}

export function getWeaponMaintenanceProfile(kind: WeaponMaintenanceKind): WeaponMaintenanceProfile {
  return { ...DEFAULT_PROFILE, ...PROFILE_OVERRIDES[kind] }
}

/** Deterministic, monotonic damage modifier — anchor points from plan 161,
 *  linearly interpolated so every intermediate sharpness value still reads
 *  sensibly. `1.0` sharpness → full catalog damage. */
const SHARPNESS_CURVE: readonly { sharpness: number, modifier: number }[] = [
  { sharpness: 0, modifier: 0.55 },
  { sharpness: 0.25, modifier: 0.72 },
  { sharpness: 0.5, modifier: 0.85 },
  { sharpness: 0.75, modifier: 0.94 },
  { sharpness: 1, modifier: 1 },
]

export function getSharpnessDamageModifier(sharpness: number): number {
  const s = clamp01(sharpness)
  for (let i = 1; i < SHARPNESS_CURVE.length; i++) {
    const prev = SHARPNESS_CURVE[i - 1]!
    const next = SHARPNESS_CURVE[i]!
    if (s <= next.sharpness) {
      const span = next.sharpness - prev.sharpness
      const t = span > 1e-9 ? (s - prev.sharpness) / span : 0
      return prev.modifier + (next.modifier - prev.modifier) * t
    }
  }
  return 1
}

export function createWeaponInstance(kind: WeaponMaintenanceKind): WeaponItemInstance {
  return { id: createItemInstanceId(), kind, durability: 1, sharpness: 1 }
}

/** Percent helpers for UI — mirrors `trapItemInstances.ts`'s `trapConditionPercent`. */
export function weaponDurabilityPercent(instance: WeaponItemInstance): number {
  return Math.round(clamp01(instance.durability) * 100)
}

export function weaponSharpnessPercent(instance: WeaponItemInstance): number {
  return Math.round(clamp01(instance.sharpness) * 100)
}

/** Pure next-state computation for one resolved hit — called exactly once
 *  per successful `resolveMeleeHits()` id, from `Inventory.updateInstance()`.
 *  A miss never calls this (plan 161 §"Sharpness wear"). */
export function applySharpnessWear(
  instance: WeaponItemInstance,
  profile: WeaponMaintenanceProfile,
): WeaponItemInstance {
  return {
    ...instance,
    sharpness: clamp01(instance.sharpness - profile.sharpnessLossPerHit),
    durability: clamp01(instance.durability - profile.durabilityWearPerHit),
  }
}

export type SharpenResult = 'ok' | 'invalid' | 'already_max' | 'no_whetstone'

/** Sharpening domain operation (plan 161 §"Whetstone") — validates, mutates
 *  the exact `Inventory` instance, and consumes one `whetstone` atomically.
 *  A failed attempt (invalid instance / already at max) never touches the
 *  whetstone count. */
export function sharpenWeapon(inventory: Inventory, instanceId: string, source: 'whetstone'): SharpenResult {
  const instance = inventory.getInstance(instanceId)
  if (!instance || !isWeaponItemInstance(instance)) return 'invalid'
  const profile = getWeaponMaintenanceProfile(instance.kind)
  if (instance.sharpness >= 1) return 'already_max'
  if (source === 'whetstone' && !inventory.has('whetstone', 1)) return 'no_whetstone'

  const applied = inventory.updateInstance(instanceId, (inst) => {
    const weapon = inst as WeaponItemInstance
    return { ...weapon, sharpness: clamp01(weapon.sharpness + profile.sharpeningAmount) }
  })
  if (!applied) return 'invalid'
  inventory.remove('whetstone', 1)
  return 'ok'
}

/** Runtime, in-memory migration for saves predating this plan — a weapon
 *  kind's old stackable `count` has no recoverable condition, so every unit
 *  becomes a full-condition instance (plan 161 §"Stare save'y"). Idempotent:
 *  a fresh game or an already-migrated save has zero count for these kinds,
 *  so this is a no-op. Weight-neutral (remove then re-add the same kinds), so
 *  it can never push the carry limit over its cap. */
export function migrateWeaponCountsToInstances(inventory: Inventory): void {
  for (const kind of WEAPON_MAINTENANCE_KIND_LIST) {
    const count = inventory.count(kind)
    if (count <= 0) continue
    inventory.remove(kind, count)
    for (let i = 0; i < count; i++) {
      inventory.addInstance(createWeaponInstance(kind))
    }
  }
}
