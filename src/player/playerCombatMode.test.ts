import { describe, expect, it } from 'vitest'
import { createHeldTool } from '../items/HeldTool'
import { Inventory } from '../items/Inventory'
import { createPrimaryWeaponSelection } from '../items/primaryWeapons'
import { createWeaponInstance } from '../items/weaponMaintenance'
import { createPlayerCombatMode } from './playerCombatMode'

function syncCombatMode(
  mode: ReturnType<typeof createPlayerCombatMode>,
  held: ReturnType<typeof createHeldTool>,
  primary: ReturnType<typeof createPrimaryWeaponSelection>,
  inventory: Inventory,
): void {
  held.syncWithInventory()
  primary.syncWithInventory(inventory)
  mode.reconcile(
    { kind: held.held(), instanceId: held.heldInstanceId() },
    { melee: primary.primaryMelee(), ranged: primary.primaryRanged() },
  )
}

function drawPrimary(
  mode: ReturnType<typeof createPlayerCombatMode>,
  held: ReturnType<typeof createHeldTool>,
  primary: ReturnType<typeof createPrimaryWeaponSelection>,
  inventory: Inventory,
  category: 'melee' | 'ranged',
): boolean {
  const choice = category === 'melee' ? primary.primaryMelee() : primary.primaryRanged()
  if (!choice) return false
  if (!held.equip(choice.kind, choice.instanceId ?? undefined)) return false
  mode.noteDrawn(category)
  syncCombatMode(mode, held, primary, inventory)
  return true
}

function sheathePrimary(
  mode: ReturnType<typeof createPlayerCombatMode>,
  held: ReturnType<typeof createHeldTool>,
  primary: ReturnType<typeof createPrimaryWeaponSelection>,
  inventory: Inventory,
): void {
  if (!mode.isActive()) return
  held.unequip()
  mode.noteSheathed()
  syncCombatMode(mode, held, primary, inventory)
}

function toggleCombatMode(
  mode: ReturnType<typeof createPlayerCombatMode>,
  held: ReturnType<typeof createHeldTool>,
  primary: ReturnType<typeof createPrimaryWeaponSelection>,
  inventory: Inventory,
): boolean {
  if (mode.isActive()) {
    sheathePrimary(mode, held, primary, inventory)
    return true
  }
  const last = mode.lastActiveWeapon()
  const other = last === 'melee' ? 'ranged' : 'melee'
  return drawPrimary(mode, held, primary, inventory, last)
    || drawPrimary(mode, held, primary, inventory, other)
}

describe('playerCombatMode (plan ui-input-018)', () => {
  it('starts inactive with lastActiveWeapon melee and is not persisted by construction', () => {
    const mode = createPlayerCombatMode()
    expect(mode.isActive()).toBe(false)
    expect(mode.activeWeapon()).toBeNull()
    expect(mode.lastActiveWeapon()).toBe('melee')
  })

  it('inactive + primary melee action equips melee and activates Combat Mode', () => {
    const sword = createWeaponInstance('long_sword')
    const inventory = new Inventory({ short_bow: 1 }, undefined, [sword])
    const held = createHeldTool(inventory)
    const primary = createPrimaryWeaponSelection()
    primary.setPrimaryMelee({ kind: 'long_sword', instanceId: sword.id })
    primary.setPrimaryRanged({ kind: 'short_bow', instanceId: null })
    const mode = createPlayerCombatMode()

    expect(drawPrimary(mode, held, primary, inventory, 'melee')).toBe(true)
    expect(held.held()).toBe('long_sword')
    expect(held.heldInstanceId()).toBe(sword.id)
    expect(mode.isActive()).toBe(true)
    expect(mode.activeWeapon()).toBe('melee')
    expect(mode.lastActiveWeapon()).toBe('melee')
  })

  it('inactive + primary ranged action equips ranged and activates Combat Mode', () => {
    const sword = createWeaponInstance('long_sword')
    const inventory = new Inventory({ short_bow: 1 }, undefined, [sword])
    const held = createHeldTool(inventory)
    const primary = createPrimaryWeaponSelection()
    primary.setPrimaryMelee({ kind: 'long_sword', instanceId: sword.id })
    primary.setPrimaryRanged({ kind: 'short_bow', instanceId: null })
    const mode = createPlayerCombatMode()

    expect(drawPrimary(mode, held, primary, inventory, 'ranged')).toBe(true)
    expect(held.held()).toBe('short_bow')
    expect(mode.activeWeapon()).toBe('ranged')
    expect(mode.lastActiveWeapon()).toBe('ranged')
  })

  it('active melee + ranged action switches weapon and last category', () => {
    const sword = createWeaponInstance('long_sword')
    const inventory = new Inventory({ short_bow: 1 }, undefined, [sword])
    const held = createHeldTool(inventory)
    const primary = createPrimaryWeaponSelection()
    primary.setPrimaryMelee({ kind: 'long_sword', instanceId: sword.id })
    primary.setPrimaryRanged({ kind: 'short_bow', instanceId: null })
    const mode = createPlayerCombatMode()

    drawPrimary(mode, held, primary, inventory, 'melee')
    expect(drawPrimary(mode, held, primary, inventory, 'ranged')).toBe(true)
    expect(held.held()).toBe('short_bow')
    expect(mode.isActive()).toBe(true)
    expect(mode.activeWeapon()).toBe('ranged')
    expect(mode.lastActiveWeapon()).toBe('ranged')
  })

  it('active ranged + melee action switches weapon and last category', () => {
    const sword = createWeaponInstance('long_sword')
    const inventory = new Inventory({ short_bow: 1 }, undefined, [sword])
    const held = createHeldTool(inventory)
    const primary = createPrimaryWeaponSelection()
    primary.setPrimaryMelee({ kind: 'long_sword', instanceId: sword.id })
    primary.setPrimaryRanged({ kind: 'short_bow', instanceId: null })
    const mode = createPlayerCombatMode()

    drawPrimary(mode, held, primary, inventory, 'ranged')
    expect(drawPrimary(mode, held, primary, inventory, 'melee')).toBe(true)
    expect(held.held()).toBe('long_sword')
    expect(mode.activeWeapon()).toBe('melee')
    expect(mode.lastActiveWeapon()).toBe('melee')
  })

  it('active + toggle sheathes the weapon and deactivates Combat Mode', () => {
    const sword = createWeaponInstance('long_sword')
    const inventory = new Inventory({}, undefined, [sword])
    const held = createHeldTool(inventory)
    const primary = createPrimaryWeaponSelection()
    primary.setPrimaryMelee({ kind: 'long_sword', instanceId: sword.id })
    const mode = createPlayerCombatMode()

    drawPrimary(mode, held, primary, inventory, 'melee')
    expect(toggleCombatMode(mode, held, primary, inventory)).toBe(true)
    expect(held.held()).toBeNull()
    expect(mode.isActive()).toBe(false)
    expect(mode.activeWeapon()).toBeNull()
    expect(mode.lastActiveWeapon()).toBe('melee')
  })

  it('inactive + toggle draws the last active category', () => {
    const sword = createWeaponInstance('long_sword')
    const inventory = new Inventory({ short_bow: 1 }, undefined, [sword])
    const held = createHeldTool(inventory)
    const primary = createPrimaryWeaponSelection()
    primary.setPrimaryMelee({ kind: 'long_sword', instanceId: sword.id })
    primary.setPrimaryRanged({ kind: 'short_bow', instanceId: null })
    const mode = createPlayerCombatMode()

    drawPrimary(mode, held, primary, inventory, 'ranged')
    sheathePrimary(mode, held, primary, inventory)
    expect(mode.lastActiveWeapon()).toBe('ranged')
    expect(toggleCombatMode(mode, held, primary, inventory)).toBe(true)
    expect(held.held()).toBe('short_bow')
    expect(mode.activeWeapon()).toBe('ranged')
  })

  it('invalid last category falls back to the other configured primary', () => {
    const inventory = new Inventory({ short_bow: 1 })
    const held = createHeldTool(inventory)
    const primary = createPrimaryWeaponSelection()
    primary.setPrimaryRanged({ kind: 'short_bow', instanceId: null })
    const mode = createPlayerCombatMode()

    expect(mode.lastActiveWeapon()).toBe('melee')
    expect(toggleCombatMode(mode, held, primary, inventory)).toBe(true)
    expect(held.held()).toBe('short_bow')
    expect(mode.activeWeapon()).toBe('ranged')
    expect(mode.lastActiveWeapon()).toBe('ranged')
  })

  it('toggle with no valid primaries stays inactive', () => {
    const inventory = new Inventory({})
    const held = createHeldTool(inventory)
    const primary = createPrimaryWeaponSelection()
    const mode = createPlayerCombatMode()

    expect(toggleCombatMode(mode, held, primary, inventory)).toBe(false)
    expect(mode.isActive()).toBe(false)
    expect(held.held()).toBeNull()
    expect(mode.lastActiveWeapon()).toBe('melee')
  })

  it('failed HeldTool.equip does not change Combat Mode state', () => {
    const inventory = new Inventory({})
    const held = createHeldTool(inventory)
    const primary = createPrimaryWeaponSelection()
    primary.setPrimaryMelee({ kind: 'long_sword', instanceId: 'missing' })
    const mode = createPlayerCombatMode()

    expect(held.equip('long_sword', 'missing')).toBe(false)
    expect(mode.isActive()).toBe(false)
    expect(mode.lastActiveWeapon()).toBe('melee')

    const sword = createWeaponInstance('long_sword')
    const owned = new Inventory({}, undefined, [sword])
    const ownedHeld = createHeldTool(owned)
    const ownedPrimary = createPrimaryWeaponSelection()
    ownedPrimary.setPrimaryMelee({ kind: 'long_sword', instanceId: sword.id })
    drawPrimary(mode, ownedHeld, ownedPrimary, owned, 'melee')
    expect(mode.activeWeapon()).toBe('melee')

    expect(ownedHeld.equip('short_bow')).toBe(false)
    expect(mode.activeWeapon()).toBe('melee')
    expect(mode.lastActiveWeapon()).toBe('melee')
    expect(ownedHeld.held()).toBe('long_sword')
  })

  it('removing the active weapon reconciles Combat Mode to inactive', () => {
    const sword = createWeaponInstance('long_sword')
    const inventory = new Inventory({}, undefined, [sword])
    const held = createHeldTool(inventory)
    const primary = createPrimaryWeaponSelection()
    primary.setPrimaryMelee({ kind: 'long_sword', instanceId: sword.id })
    const mode = createPlayerCombatMode()

    drawPrimary(mode, held, primary, inventory, 'melee')
    inventory.removeInstance(sword.id)
    syncCombatMode(mode, held, primary, inventory)

    expect(held.held()).toBeNull()
    expect(mode.isActive()).toBe(false)
    expect(mode.lastActiveWeapon()).toBe('melee')
  })

  it('stays active when both HeldTool and primary re-resolve to the same remaining instance', () => {
    const swordA = createWeaponInstance('long_sword')
    const swordB = createWeaponInstance('long_sword')
    const inventory = new Inventory({}, undefined, [swordA, swordB])
    const held = createHeldTool(inventory)
    const primary = createPrimaryWeaponSelection()
    primary.setPrimaryMelee({ kind: 'long_sword', instanceId: swordA.id })
    const mode = createPlayerCombatMode()

    drawPrimary(mode, held, primary, inventory, 'melee')
    inventory.removeInstance(swordA.id)
    syncCombatMode(mode, held, primary, inventory)

    expect(held.held()).toBe('long_sword')
    expect(held.heldInstanceId()).toBe(swordB.id)
    expect(primary.primaryMelee()?.instanceId).toBe(swordB.id)
    expect(mode.activeWeapon()).toBe('melee')
  })

  it('equipping a non-primary tool reconciles Combat Mode to inactive', () => {
    const sword = createWeaponInstance('long_sword')
    const inventory = new Inventory({ shovel: 1 }, undefined, [sword])
    const held = createHeldTool(inventory)
    const primary = createPrimaryWeaponSelection()
    primary.setPrimaryMelee({ kind: 'long_sword', instanceId: sword.id })
    const mode = createPlayerCombatMode()

    drawPrimary(mode, held, primary, inventory, 'melee')
    expect(held.equip('shovel')).toBe(true)
    syncCombatMode(mode, held, primary, inventory)

    expect(held.held()).toBe('shovel')
    expect(mode.isActive()).toBe(false)
    expect(mode.lastActiveWeapon()).toBe('melee')
  })

  it('ordinary equip of the primary weapon does not auto-activate Combat Mode', () => {
    const sword = createWeaponInstance('long_sword')
    const inventory = new Inventory({}, undefined, [sword])
    const held = createHeldTool(inventory)
    const primary = createPrimaryWeaponSelection()
    primary.setPrimaryMelee({ kind: 'long_sword', instanceId: sword.id })
    const mode = createPlayerCombatMode()

    expect(held.equip('long_sword', sword.id)).toBe(true)
    primary.noteEquipped('long_sword', held.heldInstanceId())
    syncCombatMode(mode, held, primary, inventory)

    expect(held.held()).toBe('long_sword')
    expect(mode.isActive()).toBe(false)
  })

  it('inactive stays inactive while a utility tool is held', () => {
    const inventory = new Inventory({ shovel: 1 })
    const held = createHeldTool(inventory)
    const primary = createPrimaryWeaponSelection()
    const mode = createPlayerCombatMode()

    held.equip('shovel')
    syncCombatMode(mode, held, primary, inventory)
    expect(mode.isActive()).toBe(false)
    expect(mode.activeWeapon()).toBeNull()
  })
})
