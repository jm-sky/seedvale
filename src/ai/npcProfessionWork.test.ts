import { describe, expect, it } from 'vitest'
import { Inventory } from '../items/Inventory'
import { createWeaponInstance } from '../items/weaponMaintenance'
import { BLACKSMITH_SHARPEN_THRESHOLD, findWeaponNeedingMaintenance } from './NpcAgent'

/** Plan settlements-npcs-002 §8/§10 — Blacksmith's target-selection helper.
 *  `sharpenWeapon()` itself is already covered by `weaponMaintenance.test.ts`;
 *  this only covers finding which instance needs it. */
describe('findWeaponNeedingMaintenance (blacksmith work)', () => {
  it('returns null for an inventory with no weapon instances', () => {
    const inventory = new Inventory()
    expect(findWeaponNeedingMaintenance(inventory)).toBeNull()
  })

  it('returns null when every weapon is at/above the maintenance threshold', () => {
    const inventory = new Inventory()
    inventory.addInstance(createWeaponInstance('knife'))
    expect(findWeaponNeedingMaintenance(inventory)).toBeNull()
  })

  it('finds a weapon instance below the sharpness threshold', () => {
    const inventory = new Inventory()
    const worn = createWeaponInstance('axe')
    inventory.addInstance(worn)
    inventory.updateInstance(worn.id, (inst) => ({ ...inst, sharpness: BLACKSMITH_SHARPEN_THRESHOLD - 0.1 }))
    const found = findWeaponNeedingMaintenance(inventory)
    expect(found?.id).toBe(worn.id)
  })

  it('picks the stable lowest-id match when multiple weapons need maintenance, never at random', () => {
    const inventory = new Inventory()
    const a = createWeaponInstance('knife')
    const b = createWeaponInstance('axe')
    inventory.addInstance(a)
    inventory.addInstance(b)
    inventory.updateInstance(a.id, (inst) => ({ ...inst, sharpness: 0.2 }))
    inventory.updateInstance(b.id, (inst) => ({ ...inst, sharpness: 0.2 }))
    const expectedId = [a.id, b.id].sort()[0]
    expect(findWeaponNeedingMaintenance(inventory)?.id).toBe(expectedId)
  })
})
