import type { CombatWeaponCategory } from '../player/playerCombatMode'

export type HudWeaponShortcutAction = 'melee' | 'ranged' | 'sheathe'

export type HudWeaponShortcut = {
  id: 'melee' | 'ranged' | 'sheathe-melee' | 'sheathe-ranged'
  action: HudWeaponShortcutAction
  ariaLabel: string
}

/**
 * Contextual HUD primary-weapon buttons (plan ui-input-018). Pure mapping
 * from published HUD labels + Combat Mode category — Vue must not derive
 * this from held-item strings.
 *
 * Visual order matches the existing cluster: ranged slot above melee slot.
 * The drawn category's slot becomes `Schowaj broń`.
 */
export function hudWeaponShortcuts(input: {
  combatWeapon: CombatWeaponCategory | null
  primaryMeleeLabel: string
  primaryRangedLabel: string
}): HudWeaponShortcut[] {
  const shortcuts: HudWeaponShortcut[] = []
  if (input.combatWeapon === 'ranged') {
    shortcuts.push({ id: 'sheathe-ranged', action: 'sheathe', ariaLabel: 'Schowaj broń' })
  } else if (input.primaryRangedLabel) {
    shortcuts.push({
      id: 'ranged',
      action: 'ranged',
      ariaLabel: `Broń dystansowa: ${input.primaryRangedLabel}`,
    })
  }
  if (input.combatWeapon === 'melee') {
    shortcuts.push({ id: 'sheathe-melee', action: 'sheathe', ariaLabel: 'Schowaj broń' })
  } else if (input.primaryMeleeLabel) {
    shortcuts.push({
      id: 'melee',
      action: 'melee',
      ariaLabel: `Broń biała: ${input.primaryMeleeLabel}`,
    })
  }
  return shortcuts
}
