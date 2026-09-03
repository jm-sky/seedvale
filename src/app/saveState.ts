import type { BadgeManager } from '../badges/badges'
import type { WorldConfig } from '../config/worldConfig'
import type { createMouseLook } from '../input/MouseLook'
import type { HeldTool } from '../items/HeldTool'
import type { Inventory } from '../items/Inventory'
import type { PlayerController } from '../player/PlayerController'
import type { PlayerTorch } from '../player/PlayerTorch'
import type { QuestManager } from '../quests/QuestManager'
import type { LandOwnershipRegistry } from '../settlement/landOwnership'
import type { TerrainModification } from '../terrain/chunkManager'
import type { ResourceDepletionState } from '../terrain/depositMining'
import type { VueUi } from '../ui-vue/mount'
import type { CropPlacement } from '../world/cropLifecycle'
import type { DayNightState } from '../world/dayNight'
import type { FishingBaitState } from '../world/fishing'
import type { LocationKnowledge } from '../world/locations/locationKnowledge'
import type { NavigationTargets } from '../world/locations/navigationTargets'
import type { MapDiscovery } from '../world/map/mapDiscovery'
import type { PlantedTreeRecord } from '../world/plantedTrees'
import type { TreeLifecycle } from '../world/treeLifecycle'
import type { WorldBundle } from './worldBundle'
import { snapshotSpawnPointState } from '../fauna/AnimalSpawner'
import { CURRENT_SAVE_VERSION, type SaveData, type SaveTerrainModification } from '../persistence/saveData'
import { getActiveSaveId, listSaves, writeSave } from '../persistence/saveDb'
import { pickActiveSaveId } from '../persistence/saveSlots'

/** Assembles the live runtime state into a `SaveData` and owns *when* it gets
 *  written. The split from `src/persistence/` is unchanged by this extraction:
 *  `saveData.ts` still owns the schema/migrations and `saveDb.ts` the
 *  IndexedDB operations; this is the app-side "what is the world right now"
 *  half that used to sit inline in `createApp.ts`. */
export type SaveState = {
  buildSaveData: () => SaveData
  /** Writes the current state into the active save slot. */
  saveNow: () => Promise<void>
  /** Re-reads the active slot's name into the pause menu. */
  refreshActiveSaveName: () => Promise<void>
  /** Registers the page-lifecycle + interval autosaves; returns their remover. */
  installAutoSave: () => () => void
}

export type SaveStateDeps = {
  config: WorldConfig
  bundle: WorldBundle
  player: PlayerController
  mouseLook: ReturnType<typeof createMouseLook>
  inventory: Inventory
  heldTool: HeldTool
  playerTorch: PlayerTorch
  questManager: QuestManager
  dayNight: DayNightState
  mapDiscovery: MapDiscovery
  /** World Locations discovery/navigation state (plan world-012) — persisted
   *  alongside `mapDiscovery` in `SaveData.map`, but as its own independent
   *  layer (see `world/locations/locationKnowledge.ts`'s doc). */
  locationKnowledge: LocationKnowledge
  navigationTargets: NavigationTargets
  landOwnership: LandOwnershipRegistry
  vueUi: VueUi
  worldFlags: { guardSwordGifted: boolean, hiddenTreasureFound: boolean }
  /** Hidden Finds resolved spot ids (plan world-007) — a stable `Set`
   *  reference, never reassigned (`createApp.ts` clears it in place on New
   *  Game), so it's read directly rather than through a live accessor. */
  resolvedHiddenFindSpotIds: ReadonlySet<string>
  badges: BadgeManager
  fishingBait: Map<string, FishingBaitState>
  /** Live accessors — `createApp` replaces these three on a New Game, so they
   *  must not be captured by value. */
  getCollectedItemIds: () => ReadonlySet<string>
  getRemovedCropIds: () => ReadonlySet<string>
  /** Plan 126 — player-planted trees/crops, same "live accessor, replaced on
   *  a New Game" contract as the two above. */
  getPlantedTrees: () => readonly PlantedTreeRecord[]
  getPlantedCrops: () => readonly CropPlacement[]
  /** Same live-accessor contract as the two above (plan `world-terrain-save`). */
  getModifications: () => readonly TerrainModification[]
  getTreeLifecycle: () => TreeLifecycle
  /** Same live-accessor contract as the ids/arrays above (plan 198/201) —
   *  `createApp` replaces the underlying `Map` on a genuinely new world. */
  getResourceDepletion: () => ResourceDepletionState
  /** Live accessor (plan fauna-003) — `null` while not mounted. Only
   *  livestock (deterministic `animalId`) can ever be the mounted animal
   *  today, so this round-trips safely; see `app/createApp.ts`'s
   *  `resolveMountAnimal`. */
  getMountedAnimalId: () => string | null
}

/**
 * @domain persistence
 * @system save-state
 * @role Assembles the live runtime state into `SaveData` and owns when it is written.
 * @produces SaveData
 * @integration Reads across WorldBundle, player and UI state to build one save.
 */
export function createSaveState(deps: SaveStateDeps): SaveState {
  const {
    config, bundle, player, mouseLook, inventory, heldTool, playerTorch,
    questManager, dayNight, mapDiscovery, locationKnowledge, navigationTargets, landOwnership, vueUi, worldFlags, fishingBait,
    resolvedHiddenFindSpotIds, badges,
  } = deps

  const buildSaveData = (): SaveData => {
    // One combined capture-then-serialize pass (plan persistence-001) — see
    // `SettlementsManager.snapshotLivestock`'s doc for why livestock needs an
    // explicit refresh unlike households/NPC state (no live object survives a
    // settlement unload on its own).
    const livestockSnapshot = bundle.settlementsManager.snapshotLivestock()
    return {
      version: CURRENT_SAVE_VERSION,
    config: {
      seed: config.seed,
      terrain: structuredClone(config.terrain),
      sky: { ...config.sky },
      player: { ...config.player },
      settlements: { ...config.settlements },
    },
    player: {
      x: player.mesh.position.x,
      z: player.mesh.position.z,
      yaw: mouseLook.state.yaw,
      pitch: mouseLook.state.pitch,
      mountedAnimalId: deps.getMountedAnimalId() ?? undefined,
    },
    savedAt: Date.now(),
    quests: {
      progress: questManager.exportProgress(),
      exp: questManager.getExp(),
      relations: questManager.exportRelations(),
    },
    inventory: inventory.toJSON(),
    inventoryInstances: inventory.instancesToJSON(),
    collectedItemIds: [...deps.getCollectedItemIds()],
    droppedItems: bundle.droppedItems.nodes().map((item) => ({ ...item })),
    placedFires: bundle.placedFires.nodes().map((fire) => ({ ...fire })),
    timeOfDay: dayNight.timeOfDay,
    elapsedDays: dayNight.elapsedDays,
    heldTool: heldTool.held(),
    treeOverrides: deps.getTreeLifecycle().serializeOverrides(),
    playerTorch: playerTorch.isLit() && playerTorch.source()
      ? { source: playerTorch.source()!, fuelRemaining: playerTorch.fuelRemaining() }
      : null,
    placedTents: bundle.placedTents.nodes().map((tent) => ({ ...tent })),
    placedTraps: bundle.placedTraps.nodes().map((trap) => ({ ...trap })),
    worldFlags: { ...worldFlags },
    resolvedHiddenFindSpotIds: [...resolvedHiddenFindSpotIds],
    badges: badges.exportState(),
    map: {
      discoveredCells: mapDiscovery.serialize(),
      discoveredLocations: locationKnowledge.serialize(),
      targets: navigationTargets.serialize(),
    },
    settlementEconomies: bundle.settlementsManager.snapshotEconomies(),
    playerNeeds: {
      hunger: player.needs.hunger.current,
      thirst: player.needs.thirst.current,
      vigor: player.needs.vigor.current,
      starvationDuration: player.needs.starvationDuration,
      dehydrationDuration: player.needs.dehydrationDuration,
    },
    ownedLandPlots: landOwnership.toJSON(),
    // Only XP round-trips — `value` is derived on load and `active` is
    // runtime-only (plan 128 §2).
    skills: {
      sneak: { xp: player.skills.sneak.xp },
      survival: { xp: player.skills.survival.xp },
      traps: { xp: player.skills.traps.xp },
      defense: { xp: player.skills.defense.xp },
      archery: { xp: player.skills.archery.xp },
      riding: { xp: player.skills.riding.xp },
    },
    spawnPoints: bundle.fauna.getSpawners().map((s) => ({ id: s.id, ...snapshotSpawnPointState(s) })),
    foodBatches: inventory.foodBatchesToJSON(),
    dryingRacks: bundle.dryingRacks.nodes().map((rack) => ({
      ...rack,
      process: rack.process ? { ...rack.process, input: [...rack.process.input], output: [...rack.process.output] } : null,
    })),
    hives: bundle.hives.nodes().map((hive) => ({ ...hive })),
    fishingBait: Object.fromEntries(fishingBait),
    harvestedCropIds: [...deps.getRemovedCropIds()],
    placedContainers: bundle.placedContainers.nodes().map((c) => ({ ...c })),
    carriedContainer: bundle.placedContainers.carriedNode(),
    playerWells: bundle.playerWells.nodes().map((w) => ({ ...w })),
    terrainPreparations: bundle.terrainPreparations.nodes().map((p) => ({
      id: p.id,
      x: p.center.x,
      z: p.center.z,
      size: p.size,
      targetHeight: p.targetHeight,
      originalHeights: p.originalHeights.map((s) => ({ ...s })),
      requiredWork: p.requiredWork,
      completedWork: p.completedWork,
    })),
    // Only `'player'`-caused entries — `'system'` ones (cave carving, fauna
    // spawn-point burn replay) are deterministically reproduced on every
    // world build and must never also be replayed from a save (plan
    // `world-terrain-save`).
    terrainModifications: deps.getModifications()
      .filter((m) => m.source === 'player')
      .map((m): SaveTerrainModification => (
        m.mode === 'prepare'
          ? { mode: 'prepare', id: m.id!, samples: m.samples!.map((s) => ({ ...s })) }
          : { mode: m.mode, x: m.x, z: m.z, radius: m.radius, depth: m.depth }
      )),
    plantedTrees: deps.getPlantedTrees().map((t) => ({ ...t })),
    plantedCrops: deps.getPlantedCrops().map((c) => ({ ...c })),
    playerGardens: bundle.playerGardens.nodes().map((g) => ({ ...g })),
    standingTorches: bundle.standingTorches.nodes().map((t) => ({ ...t })),
    palisades: bundle.palisades.nodes().map((p) => ({ ...p })),
    bedrolls: bundle.sleepingUtilities.bedrolls.nodes().map((b) => ({ ...b })),
    platforms: bundle.sleepingUtilities.platforms.nodes().map((p) => ({ ...p })),
    resourceDeposits: Object.fromEntries(deps.getResourceDepletion()),
    workContracts: bundle.workContracts.nodes().map((c) => ({ ...c, target: { ...c.target } })),
      npcStates: bundle.settlementsManager.snapshotNpcStates(),
      households: bundle.settlementsManager.snapshotHouseholds(),
      npcRelationships: bundle.settlementsManager.snapshotRelationships(),
      livestock: livestockSnapshot.entries,
      removedLivestockIds: livestockSnapshot.removedIds,
    }
  }

  // `writeSave()`'s result is diagnostic-only here — a rejected write (an
  // unreadable existing slot, plan persistence-002) must fail safely rather
  // than surface a UI error; the dev-console diagnostic already happened
  // inside `writeSave()`.
  const saveNow = async (): Promise<void> => {
    await writeSave(buildSaveData())
  }

  const refreshActiveSaveName = async (): Promise<void> => {
    const slots = await listSaves()
    const id = pickActiveSaveId(getActiveSaveId(), slots)
    const active = slots.find((slot) => slot.id === id)
    vueUi.setPauseActiveSaveName(active?.name ?? '')
  }

  // `beforeunload` alone isn't enough on mobile: Android (and iOS) routinely
  // suspend/kill a backgrounded PWA/tab without ever firing it — the reported
  // failure mode ("collected items, reopened, gone") is exactly that. The
  // reliable moment to persist is when the page is about to be hidden, not
  // when it's about to close: `visibilitychange`→hidden fires the instant the
  // user switches away (before the OS gets a chance to kill the process), and
  // `pagehide` covers navigation/bfcache cases visibilitychange can miss.
  // `beforeunload` stays too — free extra coverage on desktop.
  const installAutoSave = (): (() => void) => {
    const onSave = () => { void saveNow() }
    const onVisibilityChange = () => {
      if (document.hidden) void saveNow()
    }
    window.addEventListener('beforeunload', onSave)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', onSave)
    // Defense in depth in case the app is killed with no lifecycle event at
    // all (rare, but seen on some Android OEMs) — bounds how much progress a
    // worst-case loss can cost.
    const autoSaveInterval = window.setInterval(onSave, 60_000)
    return () => {
      window.removeEventListener('beforeunload', onSave)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', onSave)
      window.clearInterval(autoSaveInterval)
    }
  }

  return { buildSaveData, saveNow, refreshActiveSaveName, installAutoSave }
}
