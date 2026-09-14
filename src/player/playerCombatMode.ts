import type { ItemKind } from '../items/items'
import {
  isPrimaryMeleeAssignment,
  isPrimaryRangedAssignment,
  type PrimaryWeaponChoice,
} from '../items/primaryWeapons'

/** Drawn primary combat category. `null` means Combat Mode is inactive. */
export type CombatWeaponCategory = 'melee' | 'ranged'

export type PlayerCombatModeHeld = {
  kind: ItemKind | null
  instanceId: string | null
}

export type PlayerCombatModePrimaries = {
  melee: PrimaryWeaponChoice | null
  ranged: PrimaryWeaponChoice | null
}

/**
 * Runtime player Combat Mode — whether a configured primary combat weapon is
 * currently drawn. Does not own inventory, `HeldTool`, weapon stats, or
 * attack logic; those remain with their existing owners.
 *
 * `activeWeapon !== null` is the sole active flag. `lastActiveWeapon` is
 * transient and not persisted so save/load and new-game start inactive.
 *
 * @domain ui-input
 * @system player-combat-mode
 * @role Tracks whether the player currently has the configured primary melee
 *   or ranged weapon drawn, for HUD/keyboard draw-sheathe and future observers.
 */
export type PlayerCombatMode = {
  /** Drawn primary category, or `null` when Combat Mode is inactive. */
  activeWeapon: () => CombatWeaponCategory | null
  /** Last successful primary draw/switch category; defaults to `melee`. */
  lastActiveWeapon: () => CombatWeaponCategory
  isActive: () => boolean
  /**
   * Marks Combat Mode active after a successful `HeldTool.equip()` of the
   * given primary category. Callers must not invoke this when equip failed.
   */
  noteDrawn: (category: CombatWeaponCategory) => void
  /**
   * Clears the drawn category after a successful sheathe. Preserves
   * `lastActiveWeapon` so the keyboard toggle can redraw the same category.
   */
  noteSheathed: () => void
  /**
   * Reconciles Combat Mode against the actual hand and current primary
   * choices. Mutates only this state — never equips, unequips, or re-enters
   * HUD sync. Mismatch deactivates while keeping `lastActiveWeapon`.
   */
  reconcile: (held: PlayerCombatModeHeld, primaries: PlayerCombatModePrimaries) => void
}

function matchesDrawnWeapon(
  category: CombatWeaponCategory,
  held: PlayerCombatModeHeld,
  primaries: PlayerCombatModePrimaries,
): boolean {
  if (held.kind == null) return false
  if (category === 'melee') {
    return isPrimaryMeleeAssignment(held.kind, held.instanceId, primaries.melee)
  }
  return isPrimaryRangedAssignment(held.kind, held.instanceId, primaries.ranged)
}

/**
 * App-lifetime Combat Mode controller. Instantiated fresh in `createApp()`;
 * not restored from `SaveData`.
 *
 * @domain ui-input
 */
export function createPlayerCombatMode(): PlayerCombatMode {
  let activeWeapon: CombatWeaponCategory | null = null
  let lastActiveWeapon: CombatWeaponCategory = 'melee'

  return {
    activeWeapon: () => activeWeapon,
    lastActiveWeapon: () => lastActiveWeapon,
    isActive: () => activeWeapon !== null,
    noteDrawn(category) {
      activeWeapon = category
      lastActiveWeapon = category
    },
    noteSheathed() {
      activeWeapon = null
    },
    reconcile(held, primaries) {
      if (activeWeapon === null) return
      if (matchesDrawnWeapon(activeWeapon, held, primaries)) return
      activeWeapon = null
    },
  }
}
