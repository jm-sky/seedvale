import { describe, expect, it } from 'vitest'
import { Inventory } from './Inventory'
import { FUEL_ITEM_PRIORITY, fuelValue, isFuel, selectFuelKind } from './itemFuel'

describe('itemFuel (plan items-player-023)', () => {
  it('branch is the base fuel unit', () => {
    expect(fuelValue('branch')).toBe(1)
  })

  it('cone is weaker than branch, beam is stronger', () => {
    expect(fuelValue('cone')).not.toBeNull()
    expect(fuelValue('beam')).not.toBeNull()
    expect(fuelValue('cone')!).toBeLessThan(fuelValue('branch')!)
    expect(fuelValue('beam')!).toBeGreaterThan(fuelValue('branch')!)
  })

  it('non-fuel kinds return null / false', () => {
    expect(fuelValue('stone')).toBeNull()
    expect(isFuel('stone')).toBe(false)
  })

  it('fuel kinds return true', () => {
    for (const kind of FUEL_ITEM_PRIORITY) expect(isFuel(kind)).toBe(true)
  })

  it('selects cone before branch before beam, when carried', () => {
    const inventory = new Inventory()
    inventory.add('beam', 1)
    inventory.add('branch', 1)
    inventory.add('cone', 1)
    expect(selectFuelKind(inventory)).toBe('cone')
  })

  it('falls through to branch when cone is absent', () => {
    const inventory = new Inventory()
    inventory.add('beam', 1)
    inventory.add('branch', 1)
    expect(selectFuelKind(inventory)).toBe('branch')
  })

  it('falls through to beam when only beam is available', () => {
    const inventory = new Inventory()
    inventory.add('beam', 1)
    expect(selectFuelKind(inventory)).toBe('beam')
  })

  it('returns null when no fuel is carried', () => {
    const inventory = new Inventory()
    expect(selectFuelKind(inventory)).toBeNull()
  })
})
