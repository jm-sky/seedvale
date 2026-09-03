import type { ItemCapability } from '../../items/itemCatalog'
import type { ItemKind } from '../../items/items'

/** Shared player-action contract (plan `ui-input-007`) — replaces the old
 *  mix of boolean `canX()` predicates, ad hoc `LightActionResult` enums and
 *  hand-formatted cost strings. An action reports every independently
 *  missing requirement at once (not just the first failed guard), so UI code
 *  can present the whole picture and toast code can name the actual gap. */
export type ActionRequirement =
  | { kind: 'item'; item: ItemKind; required: number; actual: number }
  | { kind: 'capability'; capability: ItemCapability }
  /** A world/target condition that isn't an inventory count — a placement
   *  spot, a nearby buildable fire, "not already lit", a free hand, etc.
   *  `id` is a small concrete reason understood by the calling layer's own
   *  label table (kept out of this shared module on purpose — see plan
   *  §2/§3, "keep user-facing labels at the UI edge"). */
  | { kind: 'target'; id: string }

/** Availability is a UX snapshot, not authorization to execute — `execute()`
 *  must always re-validate against live state before mutating anything. */
export type ActionAvailability =
  | { available: true }
  | { available: false; missing: readonly ActionRequirement[] }

export type ActionResult =
  | { ok: true }
  | { ok: false; missing: readonly ActionRequirement[] }

/** `null` when `actual >= required` (requirement satisfied). */
export function itemRequirement(actual: number, required: number, item: ItemKind): ActionRequirement | null {
  return actual >= required ? null : { kind: 'item', item, required, actual }
}

export function capabilityRequirement(has: boolean, capability: ItemCapability): ActionRequirement | null {
  return has ? null : { kind: 'capability', capability }
}

export function targetRequirement(ok: boolean, id: string): ActionRequirement | null {
  return ok ? null : { kind: 'target', id }
}

function presentRequirements(checks: readonly (ActionRequirement | null)[]): readonly ActionRequirement[] {
  return checks.filter((check): check is ActionRequirement => check !== null)
}

export function toAvailability(checks: readonly (ActionRequirement | null)[]): ActionAvailability {
  const missing = presentRequirements(checks)
  return missing.length === 0 ? { available: true } : { available: false, missing }
}

export function toResult(checks: readonly (ActionRequirement | null)[]): ActionResult {
  const missing = presentRequirements(checks)
  return missing.length === 0 ? { ok: true } : { ok: false, missing }
}
