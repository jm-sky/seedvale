import { describe, expect, it } from 'vitest'
import { Inventory } from '../items/Inventory'
import { resolveNpcMeleeWeapon } from './npcCombat'
import { defaultWeaponForRole, seedDefaultRoleWeapon } from './npcLoadout'

describe('defaultWeaponForRole', () => {
  it('maps roles to their default melee weapon', () => {
    expect(defaultWeaponForRole('woodcutter')).toBe('axe')
    expect(defaultWeaponForRole('guard')).toBe('long_sword')
    expect(defaultWeaponForRole('farmer')).toBe('knife')
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
})
