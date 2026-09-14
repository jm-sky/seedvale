import { describe, expect, it } from 'vitest'
import { hudWeaponShortcuts } from './hudWeaponShortcuts'

describe('hudWeaponShortcuts (plan ui-input-018)', () => {
  it('shows configured draw shortcuts while Combat Mode is inactive', () => {
    expect(hudWeaponShortcuts({
      combatWeapon: null,
      primaryMeleeLabel: 'Miecz',
      primaryRangedLabel: 'Łuk',
    })).toEqual([
      { id: 'ranged', action: 'ranged', ariaLabel: 'Broń dystansowa: Łuk' },
      { id: 'melee', action: 'melee', ariaLabel: 'Broń biała: Miecz' },
    ])
  })

  it('hides a missing primary category while inactive', () => {
    expect(hudWeaponShortcuts({
      combatWeapon: null,
      primaryMeleeLabel: 'Miecz',
      primaryRangedLabel: '',
    })).toEqual([
      { id: 'melee', action: 'melee', ariaLabel: 'Broń biała: Miecz' },
    ])
  })

  it('maps active melee to sheathe plus ranged switch', () => {
    expect(hudWeaponShortcuts({
      combatWeapon: 'melee',
      primaryMeleeLabel: 'Miecz',
      primaryRangedLabel: 'Łuk',
    })).toEqual([
      { id: 'ranged', action: 'ranged', ariaLabel: 'Broń dystansowa: Łuk' },
      { id: 'sheathe-melee', action: 'sheathe', ariaLabel: 'Schowaj broń' },
    ])
  })

  it('keeps only sheathe when active melee has no ranged primary', () => {
    expect(hudWeaponShortcuts({
      combatWeapon: 'melee',
      primaryMeleeLabel: 'Miecz',
      primaryRangedLabel: '',
    })).toEqual([
      { id: 'sheathe-melee', action: 'sheathe', ariaLabel: 'Schowaj broń' },
    ])
  })

  it('maps active ranged to melee switch plus sheathe', () => {
    expect(hudWeaponShortcuts({
      combatWeapon: 'ranged',
      primaryMeleeLabel: 'Miecz',
      primaryRangedLabel: 'Łuk',
    })).toEqual([
      { id: 'sheathe-ranged', action: 'sheathe', ariaLabel: 'Schowaj broń' },
      { id: 'melee', action: 'melee', ariaLabel: 'Broń biała: Miecz' },
    ])
  })
})
