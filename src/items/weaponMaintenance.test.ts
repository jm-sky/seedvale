import { describe, expect, it } from 'vitest'
import { Inventory } from './Inventory'
import { isWeaponItemInstance, isWeaponMaintenanceKind, WEAPON_MAINTENANCE_KINDS } from './itemInstances'
import {
  applySharpnessWear,
  createWeaponInstance,
  getSharpnessDamageModifier,
  getWeaponMaintenanceProfile,
  migrateWeaponCountsToInstances,
  sharpenWeapon,
  weaponDurabilityPercent,
  weaponSharpnessPercent,
} from './weaponMaintenance'

describe('WEAPON_MAINTENANCE_KINDS (plan 161)', () => {
  it('contains exactly the 13 supported kinds', () => {
    expect(WEAPON_MAINTENANCE_KINDS.size).toBe(13)
    expect(isWeaponMaintenanceKind('knife')).toBe(true)
    expect(isWeaponMaintenanceKind('short_sword')).toBe(true)
    expect(isWeaponMaintenanceKind('long_sword')).toBe(true)
    expect(isWeaponMaintenanceKind('spear')).toBe(true)
    expect(isWeaponMaintenanceKind('axe')).toBe(true)
    expect(isWeaponMaintenanceKind('pitchfork')).toBe(true)
    expect(isWeaponMaintenanceKind('sickle')).toBe(true)
    expect(isWeaponMaintenanceKind('damascus_knife')).toBe(true)
    expect(isWeaponMaintenanceKind('damascus_short_sword')).toBe(true)
    expect(isWeaponMaintenanceKind('damascus_long_sword')).toBe(true)
    expect(isWeaponMaintenanceKind('obsidian_sword')).toBe(true)
    expect(isWeaponMaintenanceKind('battle_axe')).toBe(true)
    expect(isWeaponMaintenanceKind('masterwork_sword')).toBe(true)
  })

  it('explicitly excludes shovel and pickaxe', () => {
    expect(isWeaponMaintenanceKind('shovel')).toBe(false)
    expect(isWeaponMaintenanceKind('pickaxe')).toBe(false)
  })
})

describe('createWeaponInstance', () => {
  it('starts at full durability and sharpness', () => {
    const instance = createWeaponInstance('knife')
    expect(instance.durability).toBe(1)
    expect(instance.sharpness).toBe(1)
    expect(instance.kind).toBe('knife')
  })

  it('gives every instance a unique id', () => {
    const a = createWeaponInstance('knife')
    const b = createWeaponInstance('knife')
    expect(a.id).not.toBe(b.id)
  })
})

describe('getSharpnessDamageModifier', () => {
  it('matches the plan anchor points', () => {
    expect(getSharpnessDamageModifier(1)).toBeCloseTo(1)
    expect(getSharpnessDamageModifier(0.75)).toBeCloseTo(0.94)
    expect(getSharpnessDamageModifier(0.5)).toBeCloseTo(0.85)
    expect(getSharpnessDamageModifier(0.25)).toBeCloseTo(0.72)
    expect(getSharpnessDamageModifier(0)).toBeCloseTo(0.55)
  })

  it('is monotonic over [0,1]', () => {
    let prev = getSharpnessDamageModifier(0)
    for (let s = 0.05; s <= 1; s += 0.05) {
      const modifier = getSharpnessDamageModifier(s)
      expect(modifier).toBeGreaterThanOrEqual(prev)
      prev = modifier
    }
  })

  it('clamps out-of-range input', () => {
    expect(getSharpnessDamageModifier(-1)).toBeCloseTo(0.55)
    expect(getSharpnessDamageModifier(2)).toBeCloseTo(1)
  })
})

describe('applySharpnessWear', () => {
  it('decreases sharpness and durability by the profile amounts', () => {
    const instance = createWeaponInstance('knife')
    const profile = getWeaponMaintenanceProfile('knife')
    const worn = applySharpnessWear(instance, profile)
    expect(worn.sharpness).toBeCloseTo(1 - profile.sharpnessLossPerHit)
    expect(worn.durability).toBeCloseTo(1 - profile.durabilityWearPerHit)
  })

  it('never drops sharpness below 0', () => {
    const instance = { ...createWeaponInstance('knife'), sharpness: 0.001, durability: 0.0001 }
    const profile = getWeaponMaintenanceProfile('knife')
    const worn = applySharpnessWear(instance, profile)
    expect(worn.sharpness).toBeGreaterThanOrEqual(0)
    expect(worn.durability).toBeGreaterThanOrEqual(0)
  })
})

describe('sharpenWeapon', () => {
  it('increases sharpness and consumes exactly one whetstone', () => {
    const instance = { ...createWeaponInstance('knife'), sharpness: 0.4 }
    const inventory = new Inventory({ whetstone: 2 }, undefined, [instance])
    expect(sharpenWeapon(inventory, instance.id, 'whetstone')).toBe('ok')
    expect(inventory.count('whetstone')).toBe(1)
    const updated = inventory.getInstance(instance.id)
    expect(updated && isWeaponItemInstance(updated) ? updated.sharpness : null).toBeGreaterThan(0.4)
  })

  it('does not change durability', () => {
    const instance = { ...createWeaponInstance('knife'), sharpness: 0.2, durability: 0.7 }
    const inventory = new Inventory({ whetstone: 1 }, undefined, [instance])
    sharpenWeapon(inventory, instance.id, 'whetstone')
    const updated = inventory.getInstance(instance.id)
    expect(updated && isWeaponItemInstance(updated) ? updated.durability : null).toBeCloseTo(0.7)
  })

  it('clamps sharpness at 1', () => {
    const instance = { ...createWeaponInstance('knife'), sharpness: 0.95 }
    const inventory = new Inventory({ whetstone: 1 }, undefined, [instance])
    sharpenWeapon(inventory, instance.id, 'whetstone')
    const updated = inventory.getInstance(instance.id)
    expect(updated && isWeaponItemInstance(updated) ? updated.sharpness : null).toBeLessThanOrEqual(1)
  })

  it('fails without a whetstone and does not mutate the instance', () => {
    const instance = { ...createWeaponInstance('knife'), sharpness: 0.4 }
    const inventory = new Inventory({}, undefined, [instance])
    expect(sharpenWeapon(inventory, instance.id, 'whetstone')).toBe('no_whetstone')
    const updated = inventory.getInstance(instance.id)
    expect(updated && isWeaponItemInstance(updated) ? updated.sharpness : null).toBeCloseTo(0.4)
  })

  it('refuses an already-max instance without consuming a stone', () => {
    const instance = createWeaponInstance('knife')
    const inventory = new Inventory({ whetstone: 1 }, undefined, [instance])
    expect(sharpenWeapon(inventory, instance.id, 'whetstone')).toBe('already_max')
    expect(inventory.count('whetstone')).toBe(1)
  })

  it('rejects an unknown instance id', () => {
    const inventory = new Inventory({ whetstone: 1 })
    expect(sharpenWeapon(inventory, 'missing', 'whetstone')).toBe('invalid')
  })
})

describe('weapon condition percent helpers', () => {
  it('round to whole percent', () => {
    const instance = { ...createWeaponInstance('knife'), durability: 0.503, sharpness: 0.996 }
    expect(weaponDurabilityPercent(instance)).toBe(50)
    expect(weaponSharpnessPercent(instance)).toBe(100)
  })
})

describe('migrateWeaponCountsToInstances', () => {
  it('converts an old count-based weapon into full-condition instances', () => {
    const inventory = new Inventory({ knife: 2 })
    migrateWeaponCountsToInstances(inventory)
    expect(inventory.count('knife')).toBe(0)
    expect(inventory.countInstances('knife')).toBe(2)
    for (const instance of inventory.getInstances('knife')) {
      expect(isWeaponItemInstance(instance) ? instance.durability : null).toBe(1)
      expect(isWeaponItemInstance(instance) ? instance.sharpness : null).toBe(1)
    }
  })

  it('is idempotent — a second run is a no-op', () => {
    const inventory = new Inventory({ knife: 1 })
    migrateWeaponCountsToInstances(inventory)
    migrateWeaponCountsToInstances(inventory)
    expect(inventory.countInstances('knife')).toBe(1)
  })

  it('does not touch unrelated stackable kinds', () => {
    const inventory = new Inventory({ stone: 5 })
    migrateWeaponCountsToInstances(inventory)
    expect(inventory.count('stone')).toBe(5)
  })

  it('is weight-neutral', () => {
    const inventory = new Inventory({ knife: 1 })
    const before = inventory.totalWeight()
    migrateWeaponCountsToInstances(inventory)
    expect(inventory.totalWeight()).toBeCloseTo(before)
  })
})
