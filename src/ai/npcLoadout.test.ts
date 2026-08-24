import { describe, expect, it } from 'vitest'
import { Inventory } from '../items/Inventory'
import { resolveNpcAmmoKind, resolveNpcMeleeWeapon, resolveNpcRangedWeapon } from './npcCombat'
import { defaultWeaponForRole, seedDefaultRoleWeapon, seedHunterSupplies } from './npcLoadout'

describe('defaultWeaponForRole', () => {
  it('maps roles to their default melee weapon', () => {
    expect(defaultWeaponForRole('woodcutter')).toBe('axe')
    expect(defaultWeaponForRole('guard')).toBe('long_sword')
    expect(defaultWeaponForRole('farmer')).toBe('knife')
  })

  it('maps hunter to a default ranged weapon (plan 178)', () => {
    expect(defaultWeaponForRole('hunter')).toBe('hunting_bow')
  })

  it('leaves roles without a justified default weapon unarmed', () => {
    expect(defaultWeaponForRole('trader')).toBeNull()
    expect(defaultWeaponForRole('miner')).toBeNull()
    expect(defaultWeaponForRole('fisher')).toBeNull()
  })
})

describe('seedDefaultRoleWeapon', () => {
  it('seeds a woodcutter with an axe', () => {
    const carried = new Inventory(undefined, 5)
    seedDefaultRoleWeapon(carried, 'woodcutter')
    expect(carried.holdsAny('axe')).toBe(true)
    expect(resolveNpcMeleeWeapon(carried)?.kind).toBe('axe')
  })

  it('seeds a guard with a long sword', () => {
    const carried = new Inventory(undefined, 5)
    seedDefaultRoleWeapon(carried, 'guard')
    expect(carried.holdsAny('long_sword')).toBe(true)
    expect(resolveNpcMeleeWeapon(carried)?.kind).toBe('long_sword')
  })

  it('seeds a farmer with a knife', () => {
    const carried = new Inventory(undefined, 5)
    seedDefaultRoleWeapon(carried, 'farmer')
    expect(carried.holdsAny('knife')).toBe(true)
    expect(resolveNpcMeleeWeapon(carried)?.kind).toBe('knife')
  })

  it('leaves a trader/miner/fisher unarmed', () => {
    const carried = new Inventory(undefined, 5)
    seedDefaultRoleWeapon(carried, 'trader')
    expect(resolveNpcMeleeWeapon(carried)).toBeNull()
  })

  it('does not add a second weapon when the default is already carried', () => {
    const carried = new Inventory(undefined, 5)
    seedDefaultRoleWeapon(carried, 'guard')
    seedDefaultRoleWeapon(carried, 'guard')
    expect(carried.countInstances('long_sword')).toBe(1)
  })

  it('seeds a hunter with a ranged-capable bow', () => {
    const carried = new Inventory(undefined, 5)
    seedDefaultRoleWeapon(carried, 'hunter')
    expect(carried.holdsAny('hunting_bow')).toBe(true)
    expect(resolveNpcRangedWeapon(carried)?.kind).toBe('hunting_bow')
  })
})

describe('seedHunterSupplies (plan 178)', () => {
  it('seeds a knife and starting arrows so a fresh hunter can both fight and harvest', () => {
    const carried = new Inventory(undefined, 5)
    seedDefaultRoleWeapon(carried, 'hunter')
    seedHunterSupplies(carried)
    expect(carried.hasCapability('meat_harvesting')).toBe(true)
    const ranged = resolveNpcRangedWeapon(carried)
    expect(ranged).not.toBeNull()
    expect(resolveNpcAmmoKind(carried, ranged!.ranged)).toBe('arrow')
  })

  it('is idempotent — running it twice does not add a second knife or double the arrows', () => {
    const carried = new Inventory(undefined, 5)
    seedHunterSupplies(carried)
    const arrowsAfterFirst = carried.count('arrow')
    seedHunterSupplies(carried)
    expect(carried.countInstances('knife')).toBe(1)
    expect(carried.count('arrow')).toBe(arrowsAfterFirst)
  })
})
