import { describe, expect, it } from 'vitest'
import { Inventory } from '../items/Inventory'
import { resolveNpcAmmoKind, resolveNpcMeleeWeapon, resolveNpcRangedWeapon } from './npcCombat'
import { defaultWeaponForRole, ensureKnifeCarried, isNpcLoadoutBelonging, seedDefaultRoleWeapon, seedHunterStartingArrows, seedHunterSupplies, seedInitialPersonalBelongingsIfNeeded } from './npcLoadout'

describe('defaultWeaponForRole', () => {
  it('maps roles to their default melee weapon', () => {
    expect(defaultWeaponForRole('woodcutter')).toBe('axe')
    expect(defaultWeaponForRole('guard')).toBe('long_sword')
    expect(defaultWeaponForRole('farmer')).toBe('knife')
  })

  it('maps hunter to a default ranged weapon (plan 178)', () => {
    expect(defaultWeaponForRole('hunter')).toBe('hunting_bow')
  })

  it('falls back to knife for roles without their own default weapon', () => {
    expect(defaultWeaponForRole('trader')).toBe('knife')
    expect(defaultWeaponForRole('miner')).toBe('knife')
    expect(defaultWeaponForRole('fisher')).toBe('knife')
    expect(defaultWeaponForRole('blacksmith')).toBe('knife')
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

  it('falls back to a knife for a trader/miner/fisher (animal-threat diagnostics task)', () => {
    const carried = new Inventory(undefined, 5)
    seedDefaultRoleWeapon(carried, 'trader')
    expect(carried.holdsAny('knife')).toBe(true)
    expect(resolveNpcMeleeWeapon(carried)?.kind).toBe('knife')
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

describe('ensureKnifeCarried', () => {
  it('gives a woodcutter a knife alongside their axe (animal-threat diagnostics task)', () => {
    const carried = new Inventory(undefined, 5)
    seedDefaultRoleWeapon(carried, 'woodcutter')
    ensureKnifeCarried(carried)
    expect(carried.holdsAny('axe')).toBe(true)
    expect(carried.holdsAny('knife')).toBe(true)
  })

  it('is idempotent — running it twice does not add a second knife', () => {
    const carried = new Inventory(undefined, 5)
    ensureKnifeCarried(carried)
    ensureKnifeCarried(carried)
    expect(carried.countInstances('knife')).toBe(1)
  })
})

describe('isNpcLoadoutBelonging (plan npc-010)', () => {
  it('does not treat arrows as hunter loadout belongings', () => {
    expect(isNpcLoadoutBelonging('arrow', 'hunter')).toBe(false)
    expect(isNpcLoadoutBelonging('hunting_bow', 'hunter')).toBe(true)
    expect(isNpcLoadoutBelonging('knife', 'hunter')).toBe(true)
  })
})

describe('seedInitialPersonalBelongingsIfNeeded (plan settlements-npcs-026)', () => {
  it('seeds role belongings once on first creation and never reseeds', () => {
    const inventory = new Inventory()
    const state = { needsInitialPersonalLoadout: true }
    seedInitialPersonalBelongingsIfNeeded(inventory, 'woodcutter', state)
    expect(inventory.holdsAny('axe')).toBe(true)
    expect(inventory.holdsAny('knife')).toBe(true)
    expect(state.needsInitialPersonalLoadout).toBe(false)
    const axeCount = inventory.countInstances('axe')
    seedInitialPersonalBelongingsIfNeeded(inventory, 'woodcutter', state)
    expect(inventory.countInstances('axe')).toBe(axeCount)
  })

  it('does not seed a restored empty inventory (legacy save)', () => {
    const inventory = new Inventory()
    const state = { needsInitialPersonalLoadout: false }
    seedInitialPersonalBelongingsIfNeeded(inventory, 'guard', state)
    expect(inventory.isEmpty()).toBe(true)
  })
})

describe('seedHunterStartingArrows', () => {
  it('adds starting arrows to the transient carrier without a knife', () => {
    const carried = new Inventory(undefined, 5)
    seedHunterStartingArrows(carried)
    expect(carried.count('arrow')).toBe(6)
    expect(carried.holdsAny('knife')).toBe(false)
  })
})
