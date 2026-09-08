import { describe, expect, it } from 'vitest'
import { CURRENT_SAVE_VERSION, loadStoredSave, type SaveData } from '../persistence/saveData'
import { Inventory } from './Inventory'
import { createPrimaryWeaponSelection } from './primaryWeapons'

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
    const inventory = new Inventory({ long_sword: 1 })
    const primary = createPrimaryWeaponSelection()
    primary.setPrimaryMelee({ kind: 'long_sword', instanceId: null })
    primary.syncWithInventory(inventory)
    expect(primary.primaryMelee()?.kind).toBe('long_sword')

    inventory.remove('long_sword', 1)
    primary.syncWithInventory(inventory)
    expect(primary.primaryMelee()).toBeNull()
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
    worldFlags: {},
    resolvedHiddenFindSpotIds: [],
    badges: { earned: [], gravesDisturbed: 0, hiddenFindsFound: 0 },
    map: { discoveredCells: [], discoveredLocations: [], targets: [] },
    settlementEconomies: {},
    playerNeeds: { hunger: 100, thirst: 100, vigor: 100, starvationDuration: 0, dehydrationDuration: 0 },
    ownedLandPlots: [],
    skills: { sneak: { xp: 0 }, survival: { xp: 0 }, traps: { xp: 0 }, defense: { xp: 0 }, archery: { xp: 0 }, riding: { xp: 0 } },
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
    palisades: [],
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
