import { describe, expect, it } from 'vitest'
import { CURRENT_SAVE_VERSION, loadStoredSave, type SaveData } from '../persistence/saveData'
import { Inventory } from './Inventory'
import {
  createPrimaryWeaponSelection,
  inventoryOwnsPrimaryWeaponChoice,
  isPrimaryMeleeAssignment,
  isPrimaryRangedAssignment,
} from './primaryWeapons'
import { createWeaponInstance } from './weaponMaintenance'

describe('primaryWeapons', () => {
  it('initializes empty slots on first equip only', () => {
    const inventory = new Inventory({ knife: 1, short_bow: 1 })
    const primary = createPrimaryWeaponSelection()

    primary.noteEquipped('knife', null)
    expect(primary.primaryMelee()?.kind).toBe('knife')

    primary.noteEquipped('short_bow', null)
    expect(primary.primaryRanged()?.kind).toBe('short_bow')
    void inventory
  })

  it('does not overwrite populated slots on ordinary equip', () => {
    const primary = createPrimaryWeaponSelection()
    primary.setPrimaryMelee({ kind: 'long_sword', instanceId: null })
    primary.setPrimaryRanged({ kind: 'short_bow', instanceId: null })
    primary.noteEquipped('knife', null)
    primary.noteEquipped('short_bow', null)

    expect(primary.primaryMelee()?.kind).toBe('long_sword')
    expect(primary.primaryRanged()?.kind).toBe('short_bow')
  })

  it('clears slots when the selected kind is gone', () => {
    const sword = createWeaponInstance('long_sword')
    const inventory = new Inventory({}, undefined, [sword])
    const primary = createPrimaryWeaponSelection()
    primary.setPrimaryMelee({ kind: 'long_sword', instanceId: sword.id })
    primary.syncWithInventory(inventory)
    expect(primary.primaryMelee()?.kind).toBe('long_sword')

    inventory.removeInstance(sword.id)
    primary.syncWithInventory(inventory)
    expect(primary.primaryMelee()).toBeNull()
  })

  it('can assign instance-backed damascus_long_sword as primary', () => {
    const sword = createWeaponInstance('damascus_long_sword')
    const inventory = new Inventory({}, undefined, [sword])
    expect(inventory.has('damascus_long_sword', 1)).toBe(false)
    expect(inventoryOwnsPrimaryWeaponChoice(inventory, 'damascus_long_sword', sword.id)).toBe(true)

    const primary = createPrimaryWeaponSelection()
    primary.setPrimaryMelee({ kind: 'damascus_long_sword', instanceId: sword.id })
    primary.syncWithInventory(inventory)
    expect(primary.primaryMelee()).toEqual({ kind: 'damascus_long_sword', instanceId: sword.id })
  })

  it('can assign instance-backed axe as primary', () => {
    const axe = createWeaponInstance('axe')
    const inventory = new Inventory({}, undefined, [axe])
    expect(inventory.has('axe', 1)).toBe(false)
    expect(inventoryOwnsPrimaryWeaponChoice(inventory, 'axe', axe.id)).toBe(true)

    const primary = createPrimaryWeaponSelection()
    primary.setPrimaryMelee({ kind: 'axe', instanceId: axe.id })
    primary.syncWithInventory(inventory)
    expect(primary.primaryMelee()).toEqual({ kind: 'axe', instanceId: axe.id })
  })

  it('keeps an instance-backed primary through syncWithInventory', () => {
    const sword = createWeaponInstance('damascus_long_sword')
    const inventory = new Inventory({}, undefined, [sword])
    const primary = createPrimaryWeaponSelection()
    primary.setPrimaryMelee({ kind: 'damascus_long_sword', instanceId: sword.id })

    primary.syncWithInventory(inventory)
    expect(primary.primaryMelee()).toEqual({ kind: 'damascus_long_sword', instanceId: sword.id })
  })

  it('restore then sync keeps an instance-backed primary', () => {
    const sword = createWeaponInstance('damascus_long_sword')
    const inventory = new Inventory({}, undefined, [sword])
    const primary = createPrimaryWeaponSelection()
    primary.restoreState({
      primaryMeleeWeapon: { kind: 'damascus_long_sword', instanceId: sword.id },
      primaryRangedWeapon: null,
    })
    primary.syncWithInventory(inventory)
    expect(primary.primaryMelee()).toEqual({ kind: 'damascus_long_sword', instanceId: sword.id })
  })

  it('re-resolves instanceId onto another instance of the same kind', () => {
    const first = createWeaponInstance('axe')
    const second = createWeaponInstance('axe')
    const inventory = new Inventory({}, undefined, [first, second])
    const primary = createPrimaryWeaponSelection()
    primary.setPrimaryMelee({ kind: 'axe', instanceId: first.id })
    primary.syncWithInventory(inventory)
    expect(primary.primaryMelee()?.instanceId).toBe(first.id)

    inventory.removeInstance(first.id)
    primary.syncWithInventory(inventory)
    expect(primary.primaryMelee()).toEqual({ kind: 'axe', instanceId: second.id })
  })

  it('clears primary when the last instance of the kind is removed', () => {
    const axe = createWeaponInstance('axe')
    const inventory = new Inventory({}, undefined, [axe])
    const primary = createPrimaryWeaponSelection()
    primary.setPrimaryMelee({ kind: 'axe', instanceId: axe.id })
    primary.syncWithInventory(inventory)

    inventory.removeInstance(axe.id)
    primary.syncWithInventory(inventory)
    expect(primary.primaryMelee()).toBeNull()
  })

  it('rejects a missing or other-kind instanceId at assignment', () => {
    const axe = createWeaponInstance('axe')
    const sword = createWeaponInstance('damascus_long_sword')
    const inventory = new Inventory({}, undefined, [axe, sword])

    expect(inventoryOwnsPrimaryWeaponChoice(inventory, 'axe', 'missing-id')).toBe(false)
    expect(inventoryOwnsPrimaryWeaponChoice(inventory, 'axe', sword.id)).toBe(false)
    expect(inventoryOwnsPrimaryWeaponChoice(inventory, 'damascus_long_sword', axe.id)).toBe(false)
    expect(inventoryOwnsPrimaryWeaponChoice(inventory, 'axe', axe.id)).toBe(true)
  })

  it('keeps a stack-based ranged primary and clears it when the stack is gone', () => {
    const inventory = new Inventory({ short_bow: 1 })
    expect(inventoryOwnsPrimaryWeaponChoice(inventory, 'short_bow', null)).toBe(true)

    const primary = createPrimaryWeaponSelection()
    primary.setPrimaryRanged({ kind: 'short_bow', instanceId: null })
    primary.syncWithInventory(inventory)
    expect(primary.primaryRanged()).toEqual({ kind: 'short_bow', instanceId: null })

    inventory.remove('short_bow', 1)
    primary.syncWithInventory(inventory)
    expect(primary.primaryRanged()).toBeNull()
  })

  it('round-trips through SaveData export/restore', () => {
    const primary = createPrimaryWeaponSelection()
    primary.setPrimaryMelee({ kind: 'long_sword', instanceId: null })
    primary.setPrimaryRanged({ kind: 'short_bow', instanceId: null })

    const saved = primary.exportState()
    const restored = createPrimaryWeaponSelection()
    restored.restoreState(saved)

    expect(restored.primaryMelee()).toEqual(saved.primaryMeleeWeapon)
    expect(restored.primaryRanged()).toEqual(saved.primaryRangedWeapon)
  })

  it('matches melee instance id for weapon-maintenance kinds', () => {
    const choice = { kind: 'damascus_long_sword' as const, instanceId: 'inst-a' }
    expect(isPrimaryMeleeAssignment('damascus_long_sword', 'inst-a', choice)).toBe(true)
    expect(isPrimaryMeleeAssignment('damascus_long_sword', 'inst-b', choice)).toBe(false)
    expect(isPrimaryMeleeAssignment('damascus_long_sword', null, choice)).toBe(false)
  })

  it('ignores instance id for non-maintenance ranged weapons', () => {
    const choice = { kind: 'short_bow' as const, instanceId: null }
    expect(isPrimaryRangedAssignment('short_bow', null, choice)).toBe(true)
    expect(isPrimaryRangedAssignment('short_bow', 'ignored', choice)).toBe(true)
  })

  it('migrates older saves without primary weapon fields to empty slots', () => {
    const legacy = structuredClone(validLegacyV8Save())
    const result = loadStoredSave(legacy)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.data.version).toBe(CURRENT_SAVE_VERSION)
    expect(result.data.primaryMeleeWeapon).toBeNull()
    expect(result.data.primaryRangedWeapon).toBeNull()
  })
})

function validLegacyV8Save(): Record<string, unknown> {
  return {
    version: 8,
    config: minimalSaveConfig(),
    player: { x: 0, z: 0, yaw: 0, pitch: 0 },
    savedAt: 1,
    quests: { progress: [], relations: {} },
    inventory: {},
    inventoryInstances: [],
    collectedItemIds: [],
    droppedItems: [],
    placedFires: [],
    timeOfDay: 0,
    elapsedDays: 0,
    heldTool: null,
    treeOverrides: {},
    playerTorch: null,
    placedTents: [],
    placedTraps: [],
    graves: [],
    worldFlags: {},
    resolvedHiddenFindSpotIds: [],
    badges: { earned: [], gravesDisturbed: 0, hiddenFindsFound: 0 },
    map: { discoveredCells: [], discoveredLocations: [], targets: [] },
    settlementEconomies: {},
    playerNeeds: { hunger: 100, thirst: 100, vigor: 100, starvationDuration: 0, dehydrationDuration: 0 },
    ownedLandPlots: [],
    skills: { sneak: { xp: 0 }, survival: { xp: 0 }, traps: { xp: 0 }, defense: { xp: 0 }, archery: { xp: 0 }, riding: { xp: 0 }, medicine: { xp: 0 }, repair: { xp: 0 } },
    spawnPoints: [],
    foodBatches: {},
    dryingRacks: [],
    hives: [],
    fishingBait: {},
    harvestedCropIds: [],
    placedContainers: [],
    carriedContainer: null,
    playerWells: [],
    terrainPreparations: [],
    terrainModifications: [],
    plantedTrees: [],
    plantedCrops: [],
    playerGardens: [],
    standingTorches: [],
    playerTroughs: [],
    palisades: [],
    residentialBuildings: [],
    bedrolls: [],
    platforms: [],
    resourceDeposits: {},
    workContracts: [],
  }
}

function minimalSaveConfig(): SaveData['config'] {
  return {
    seed: 1,
    terrain: { chunkSize: 64 },
    sky: { inclination: 0.5 },
    player: { name: 'Ja' },
    settlements: {},
  } as SaveData['config']
}
