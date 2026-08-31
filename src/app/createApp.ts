import type { PlayerSocialLookup } from '../ai/reactionChance'
import type { AnimalAgent } from '../fauna/AnimalAgent'
import type { SaveData, SaveTerrainModification } from '../persistence/saveData'
import type { TerrainModification } from '../terrain/chunkManager'
import type { ResourceDepletionState } from '../terrain/depositMining'
import type { TrapCaptureEvent } from '../world/createPlacedTraps'
import type { NearbyPlayerWellLookup } from '../world/playerWell'
import type { PlayerActionContext } from './actions/actionContext'
import { createAmbientAudio } from '../audio/createAmbientAudio'
import { createWorldAudio } from '../audio/createWorldAudio'
import { createHouseDoorTracker } from '../audio/doorSounds'
import { createFireAudio, playActionFireExtinguish, playActionFireIgnite } from '../audio/fireSounds'
import { applyFootstepPackFromUrl } from '../audio/playerMoveSounds'
import { createWeatherAudio } from '../audio/weatherSounds'
import { saveAllDomains, savePlayer, saveWorld } from '../config/persistConfig'
import {
  applyStoredPlayer,
  applyStoredSettlements,
  applyStoredSky,
  applyStoredTerrain,
  createBenchmarkWorldConfig,
  createWorldConfig,
  defaultTerrainConfig,
} from '../config/worldConfig'
import { createModelTestScene } from '../debug/createModelTestScene'
import { isDebugMode, isSystemEnabled } from '../debug/debugMode'
import { installNpcDebugApi } from '../debug/npcDebugApi'
import { createNpcInspectTrigger } from '../debug/npcInspectTrigger'
import { createTouchControls, type TouchControls } from '../input/createTouchControls'
import { isTouchDevice } from '../input/isTouchDevice'
import { createKeyboard } from '../input/Keyboard'
import { createMouseLook, exitGamePointerLock, requestGamePointerLock } from '../input/MouseLook'
import { CONTAINER_DEFS } from '../items/container'
import { shouldGrantQuestSword } from '../items/guardSword'
import { createHeldTool } from '../items/HeldTool'
import { DEFAULT_MAX_SIZE, Inventory, toSaveItemInstance } from '../items/Inventory'
import { buildInventoryGroups, inventoryCountsForUi } from '../items/inventoryView'
import { hasItemCapability } from '../items/itemCatalog'
import { isWeaponMaintenanceKind } from '../items/itemInstances'
import { ITEM_DEFS, type ItemKind } from '../items/items'
import { migrateLegacyWaterskinsToInstances } from '../items/liquidContainer'
import { createPrimaryWeaponSelection } from '../items/primaryWeapons'
import { createAcquiredInstance } from '../items/trade'
import { createWeaponInstance, migrateWeaponCountsToInstances } from '../items/weaponMaintenance'
import {
  type BenchmarkFixture,
  benchmarkScenarioFromUrl,
  createBenchmarkRunner,
  createPerfMonitor,
  isPerfUrlEnabled,
  setActiveMonitor,
  setActiveProgramCensus,
} from '../perf'
import {
  beginNewSave,
  createSave,
  listSaves,
  setActiveSaveId,
} from '../persistence/saveDb'
import { PlayerController } from '../player/PlayerController'
import {
  resetPlayerNeeds,
  restorePersistedNeeds,
} from '../player/PlayerNeeds'
import { restorePersistedSkills, toggleSneak } from '../player/PlayerSkills'
import { createPlayerTorch } from '../player/PlayerTorch'
import { QuestManager } from '../quests/QuestManager'
import { buildLandmarkQuests, QUESTS } from '../quests/quests'
import { prewarmRenderPrograms } from '../render/programPrewarm'
import { settlementSpawnPoint } from '../settlement/createSettlement'
import { createLandOwnershipRegistry } from '../settlement/landOwnership'
import { summarizeVillagePlan } from '../settlement/villagePlanDebug'
import { useBootMark } from '../shared/bootMark'
import { drainStamina } from '../shared/StaminaState'
import { chunksNear } from '../terrain/chunkGrid'
import { disposeChunkWorkerPool } from '../terrain/chunkWorkerPool'
import { sampleFootstepSurface } from '../terrain/footstepSurface'
import { mountVueUi } from '../ui-vue/mount'
import { configureAudioVolumes, configureNpcVoiceSounds, configureUiSounds } from '../ui-vue/store'
import { createBusyOverlay } from '../ui/createBusyOverlay'
import { createDebugGui } from '../ui/createDebugGui'
import { createHud } from '../ui/createHud'
import { createInventoryScreen, type InventoryScreenHandlers } from '../ui/createInventoryScreen'
import { createLoadingScreen } from '../ui/createLoadingScreen'
import { createMinimap } from '../ui/createMinimap'
import { createNpcDialog } from '../ui/createNpcDialog'
import { createNpcInspector } from '../ui/createNpcInspector'
import { createPauseMenu } from '../ui/createPauseMenu'
import { createQuestLog } from '../ui/createQuestLog'
import { createQuickActions } from '../ui/createQuickActions'
import { createTimeSkipOverlay } from '../ui/createTimeSkipOverlay'
import { createToast } from '../ui/createToast'
import { TRAP_DEFS } from '../world/animalTraps'
import { type BeehiveRecord } from '../world/beehives'
import { createClouds } from '../world/clouds'
import { createDayNightState, parseTimeOfDayFromUrl, resetDayNightForNewGame } from '../world/dayNight'
import { type DryingRackRecord } from '../world/dryingRacks'
import { type FishingBaitState } from '../world/fishing'
import { createMapData, setActiveMapData } from '../world/map/mapData'
import { createMapDiscovery } from '../world/map/mapDiscovery'
import { createMapProjection, rawSampleParamsFromWorld } from '../world/map/mapProjection'
import { randomSeed, setUrlSearchParam, syncSeedInUrl } from '../world/parseSeed'
import { parsePlantedCrops } from '../world/plantedCrops'
import { parsePlantedTrees } from '../world/plantedTrees'
import { createTimeSkip } from '../world/timeSkip'
import { createTreeLifecycle, parseTreeOverrides } from '../world/treeLifecycle'
import { createClimateState } from '../world/weather'
import { createWeatherParticles } from '../world/weatherParticles'
import { createWorldContext } from '../world/worldContext'
import { createContainerActions } from './actions/containerActions'
import { createGatheringActions } from './actions/gatheringActions'
import { createGroundActions } from './actions/groundActions'
import { createMountActions } from './actions/mountActions'
import { createPlacementActions } from './actions/placementActions'
import { createPlacementPreviewActions } from './actions/placementPreviewActions'
import { createRestActions } from './actions/restActions'
import { createSurvivalActions } from './actions/survivalActions'
import { createTerrainPreparationActions } from './actions/terrainPreparationActions'
import { createAppRenderLoop } from './appRenderLoop'
import { createBusyAction } from './busyAction'
import { createGameLoop } from './gameLoop'
import { createGraphicsSettings } from './graphicsSettings'
import { createInventoryWiring } from './inventoryWiring'
import { createRenderStack } from './renderStack'
import { createRestCampSequence } from './restCampSequence'
import { createSaveState } from './saveState'
import { getUserActions } from './userActions'
import { createWorldBundle, disposeWorldBundle, rebuildWorldBundle } from './worldBundle'

/** Player-inventory tools/utility granted for free if missing — covers both a
 *  brand-new game and saves from before this feature existed (plan §11's
 *  "stare save'y muszą nadal działać"). Doesn't fire for a player who has
 *  simply dropped one — `count` only hits 0 there if they also never picked
 *  it back up, an acceptable v1 edge case for tools that never consume. */
const STARTING_LOADOUT: Partial<Record<ItemKind, number>> = {
  knife: 1,
  firestarter: 1,
  blanket: 1,
  wooden_torch: 1,
  coin: 10,
}
/** Bound on `buildLandmarkQuests`' one-off world-setup search — chunk rings
 *  outward from the home settlement's center (plan 132). Generous enough
 *  that even the rarest landmark tier (~0.8% per chunk) is very likely to
 *  resolve, while still a small, explicit region rather than a full-world
 *  scan; `findLandmarkNear` stops at the first hit, so most worlds settle
 *  far short of this cap. */
const LANDMARK_QUEST_SEARCH_CHUNK_RADIUS = 10

let touchControls: TouchControls | null = null

/** Adds any `STARTING_LOADOUT` kind the inventory doesn't already have —
 *  called both for a fresh `Inventory` and after `inventory.clear()` (New
 *  Game), so the player is never left without knife/firestarter/blanket/torch. */
function grantStartingLoadout(inventory: Inventory): void {
  for (const [kind, count] of Object.entries(STARTING_LOADOUT) as [ItemKind, number][]) {
    const has = inventory.count(kind) + inventory.countInstances(kind)
    if (has > 0) continue
    if (isWeaponMaintenanceKind(kind)) {
      for (let i = 0; i < count; i++) inventory.addInstance(createWeaponInstance(kind))
    } else {
      const effectiveCount = isDebugMode() && kind === 'coin' ? count * 100 : count
      inventory.add(kind, effectiveCount)
    }
  }
}

/** Restores persisted terrain modifications (plan `world-terrain-save`) —
 *  everything in `SaveData.terrainModifications` is, by construction, player-
 *  caused (`saveState.ts`'s `buildSaveData()` only ever serializes
 *  `source: 'player'` entries), so every restored entry is tagged `'player'`
 *  here without re-deriving it. `'prepare'`-mode entries carry no `x`/`z`/
 *  `radius`/`depth` in the save shape (unused for that mode); the `0`
 *  placeholders mirror `ChunkManager.applyExactHeights`'s own convention. */
function terrainModificationsFromSave(saved: readonly SaveTerrainModification[]): TerrainModification[] {
  return saved.map((m) => (
    m.mode === 'prepare'
      ? { x: 0, z: 0, radius: 0, depth: 0, mode: 'prepare' as const, id: m.id, samples: m.samples, source: 'player' as const }
      : { x: m.x, z: m.z, radius: m.radius, depth: m.depth, mode: m.mode, source: 'player' as const }
  ))
}

/**
 * Application composition root. It creates the long-lived systems (render
 * stack, world bundle, player, quests, UI, audio, persistence), threads their
 * dependencies together and configures the app lifecycle — the detailed
 * behaviour of each area lives in its own module:
 *
 * - `renderStack.ts` — renderer/scene/camera/post/lights/sky construction.
 * - `graphicsSettings.ts` — live graphics + quality-preset handlers.
 * - `inventoryWiring.ts` — inventory screen + home-trader handlers.
 * - `actions/` — the player's world interactions (dig/chop, placement,
 *   survival, gathering, containers, rest).
 * - `saveState.ts` — `SaveData` assembly and autosave lifecycle.
 * - `gameLoop.ts` — one frame of simulation + render.
 * - `appRenderLoop.ts` — rAF scheduling, resize and WebGL context loss.
 *
 * @system app-composition
 * @role Composition root: builds every long-lived system, threads their
 *  dependencies and owns app-level lifecycle (boot, rebuild, dispose).
 * @owns WorldBundle GameLoop AppRenderLoop
 * @lifecycle boot
 * @integration Wires world, player, UI, persistence and audio systems together.
 */
export async function createApp(
  container: HTMLElement,
  initialSave?: SaveData | null,
  options?: { newGame?: boolean, modelTest?: boolean, benchmarkFixture?: BenchmarkFixture },
): Promise<() => void> {
  const { bootMark, bootMarkEnd, bootMarksSummary } = useBootMark('createApp')

  // `?modelTest` — ultra-minimal NPC/player model+animation preview. Bails out
  // before any world/save/UI bootstrap below; see `createModelTestScene.ts`.
  if (options?.modelTest) {
    return createModelTestScene(container)
  }

  // NB: must NOT be `seedvale-touch` — that's the touch-overlay component's own
  // block class (`.seedvale-touch { position:absolute; inset:0; z-index:7;
  // pointer-events:none }` in index.html). Putting it on <body> made the whole
  // document `pointer-events: none`, and since that property inherits, every
  // modal (pause menu, quest log, villagers, NPC dialog) and its buttons became
  // untappable and unscrollable on touch devices — only the few elements with an
  // explicit `pointer-events: auto` (the joystick/look-zone/action buttons) still
  // responded, which is why taps appeared to "fall through" the modal onto RUN.
  document.body.classList.toggle('seedvale-touch-device', isTouchDevice())

  const loadingScreen = createLoadingScreen(container)

  const fixture = options?.benchmarkFixture
  // A canonical `?benchmark=` run must not inherit the user's save or
  // localStorage-derived world/graphics preferences — `createBenchmarkWorldConfig`
  // builds straight from the fixture, bypassing `createWorldConfig()`'s URL/
  // localStorage overlay entirely (plan tools-001; a fresh save alone is not
  // enough, since `createWorldConfig()` reads localStorage independently of
  // any save).
  const config = fixture
    ? createBenchmarkWorldConfig(fixture)
    : createWorldConfig()
  const perfMonitor = createPerfMonitor()
  setActiveMonitor(perfMonitor)
  if (isPerfUrlEnabled()) perfMonitor.setSource('url', true)
  if (!initialSave && !fixture && options?.newGame) {
    config.seed = randomSeed()
    syncSeedInUrl(config.seed)
  }
  if (initialSave) {
    config.seed = initialSave.config.seed
    // Merge field-by-field rather than replacing `config.terrain` wholesale —
    // an older save can predate `RegionParams` fields added since (e.g.
    // `moistureRegionScale`), and a wholesale replace would leave those
    // `undefined` instead of keeping the game's hardcoded default. Ground the
    // merge in a fresh `defaultTerrainConfig`, not `config.terrain` as it
    // stands here — `createWorldConfig()` already overlaid *localStorage's*
    // cached terrain (from whichever world was last played) onto it, and a
    // field this save predates must fall back to the true default, not that
    // other world's tuning (plan 195 data-consistency audit, finding C2).
    config.terrain = defaultTerrainConfig(config.terrain.resolution)
    applyStoredTerrain(config.terrain, initialSave.config.terrain)
    if (typeof initialSave.config.terrain.resolution === 'number') {
      config.terrain.resolution = initialSave.config.terrain.resolution
    }
    applyStoredSky(config.sky, initialSave.config.sky)
    applyStoredPlayer(config.player, initialSave.config.player)
    applyStoredSettlements(config.settlements, initialSave.config.settlements)
  }
  // A benchmark fixture must not mutate the user's saved world/graphics
  // preferences (plan tools-001 trap #14).
  if (!fixture) saveAllDomains(config)

  const timeOverride = parseTimeOfDayFromUrl()
  const dayNight = createDayNightState(
    fixture
      ? { timeOfDay: timeOverride ?? fixture.timeOfDay, elapsedDays: fixture.elapsedDays, enabled: false }
      : initialSave
        ? {
            timeOfDay: timeOverride ?? initialSave.timeOfDay,
            elapsedDays: initialSave.elapsedDays,
            ...(timeOverride != null ? { enabled: false } : {}),
          }
        : timeOverride != null
          ? { timeOfDay: timeOverride, enabled: false }
          : undefined,
  )
  // Climate (season + weather) is a pure function of (seed, elapsedDays) —
  // no save field, "restored" for free by re-deriving from the values above
  // (plan 040 §7/§19). See `world/weather.ts`'s header comment.
  const climate = createClimateState(config.seed, dayNight.elapsedDays)

  let treeLifecycle = createTreeLifecycle(
    config.seed,
    parseTreeOverrides(initialSave?.treeOverrides),
  )
  const getWorldDays = () => dayNight.elapsedDays


  bootMark('createRenderStack')
  const { renderer, labelRenderer, scene, camera, postProcessing, lights, sky, pointLightBudget, programCensus } = createRenderStack(container, config)
  bootMarkEnd('createRenderStack')

  setActiveProgramCensus(programCensus)

  if (typeof window !== 'undefined') {
    window.__seedvaleProgramCensus = programCensus
    window.__seedvalePointLightBudget = pointLightBudget
  }

  // Vue/Tailwind UI overlay (plan 046) — dynamically imported so it doesn't
  // delay first paint (see `mountVueUi`'s doc comment).
  const vueUi = mountVueUi(container)

  const worldAudio = createWorldAudio(camera)
  configureAudioVolumes(worldAudio.getVolumes(), (volumes) => {
    worldAudio.setVolumes(volumes)
  })
  applyFootstepPackFromUrl()

  let collectedItemIds = new Set<string>(initialSave?.collectedItemIds ?? [])
  // Plan 172 — natural crop lifecycle: harvested/removed wild crops, same
  // "shared/mutated in place, reset only on a genuinely new world" contract
  // as `collectedItemIds` above.
  let removedCropIds = new Set<string>(initialSave?.harvestedCropIds ?? [])
  // Plan 126 — player-planted trees/crops: same "carried across rebuild,
  // reset only on a genuinely new world" contract as the two `Set`s above,
  // but arrays since each record needs more than an id (position/species/
  // stage anchor for trees; position/cropId/stage anchor for crops).
  let plantedTrees = parsePlantedTrees(initialSave?.plantedTrees)
  let plantedCrops = parsePlantedCrops(initialSave?.plantedCrops)
  // Plan `world-terrain-save` — runtime terrain-deformation records (dig/
  // scorch/prepare), same "carried across rebuild, reset only on a
  // genuinely new world" contract as `plantedTrees`/`plantedCrops` above.
  let modifications: TerrainModification[] = terrainModificationsFromSave(initialSave?.terrainModifications ?? [])
  // Plan 198/201 — authoritative ore-deposit mining-hits-remaining, sparse
  // and keyed by `NaturalResource.id`: same "carried across rebuild, reset
  // only on a genuinely new world" contract as the ids/arrays above, and
  // persisted the same way (`SaveData.resourceDeposits`).
  let resourceDepletion: ResourceDepletionState = new Map(Object.entries(initialSave?.resourceDeposits ?? {}))
  // Persistent player land ownership (plan 129) — sparse, doesn't need the
  // `bundle`-rebuild indirection `onAnimalDeath`/`getPlayerSocial` use below
  // (it never depends on `questManager`), so it's threaded straight through.
  const landOwnership = createLandOwnershipRegistry(initialSave?.ownedLandPlots ?? [])
  // `questManager` doesn't exist yet at this point (fauna/settlements build
  // before it does), so `onAnimalDeath` can't close over it directly —
  // mirrors the existing `bundle`-not-destructured indirection just below:
  // a mutable binding assigned once, read through a stable closure that
  // survives `rebuildWorldBundle()` (plan 110).
  let onAnimalDeathTarget: ((animalId: string) => void) | null = null
  const onAnimalDeath = (animalId: string): void => { onAnimalDeathTarget?.(animalId) }
  // Same indirection as `onAnimalDeath` above, for the same reason — `NpcAgent`
  // reads this every reaction check (plan 117), before `questManager` exists.
  let getPlayerSocialTarget: PlayerSocialLookup | null = null
  const getPlayerSocial: PlayerSocialLookup = (npcName) =>
    getPlayerSocialTarget?.(npcName) ?? { relationLevel: 'stranger', standing: 0 }
  // Same "target assigned later" indirection as `onAnimalDeath` above — the
  // trap system is built with the bundle, but awarding Traps XP / toasting
  // the catch needs `player`/`toast`, which only exist further down
  // (`actions/gatheringActions.ts` owns both handlers).
  let onTrapCaptureTarget: ((event: TrapCaptureEvent) => void) | null = null
  const onTrapCapture = (event: TrapCaptureEvent): void => { onTrapCaptureTarget?.(event) }
  // Plan 159 §12 — same indirection: bait is returned to inventory, which
  // doesn't exist until after `bundle` is built.
  let onTrapBaitReturnedTarget: ((kind: ItemKind) => void) | null = null
  const onTrapBaitReturned = (kind: ItemKind): void => { onTrapBaitReturnedTarget?.(kind) }
  // Plan 127 §10 — `bundle.playerWells` doesn't exist until just below, same
  // "target assigned later" indirection as `onAnimalDeath`/`getPlayerSocial`
  // above. Reads `bundle.playerWells` lazily (not captured), so it keeps
  // working across `rebuildWorldBundle()` for free (see `worldBundle.ts`'s
  // header comment).
  let nearbyPlayerWellTarget: NearbyPlayerWellLookup | null = null
  const getNearbyPlayerWell: NearbyPlayerWellLookup = (x, z, maxDistance) => nearbyPlayerWellTarget?.(x, z, maxDistance) ?? null

  // World-003 "faster application startup" — bumped by the rebuild handler
  // and by this function's own teardown below, so a `createWorldBundle()`
  // background phase (fauna/item spawners/drying racks/hives, still
  // building when this changes) knows to dispose what it built instead of
  // assigning it onto a `bundle` a rebuild has already replaced, or that's
  // already torn down. See `worldBundle.ts`'s `buildWorldSystems` doc
  // comment for the full mechanism.
  let worldGeneration = 0
  const initialWorldGeneration = worldGeneration

  bootMark('createWorldBundle')
  const { bundle, backgroundReady: worldBundleBackgroundReady } = await createWorldBundle(
    scene,
    config,
    collectedItemIds,
    removedCropIds,
    plantedTrees,
    plantedCrops,
    modifications,
    worldAudio.playAt,
    initialSave?.droppedItems ?? [],
    (initialSave?.placedFires ?? []).map((f) => ({ ...f, grate: f.grate === true })),
    initialSave?.placedTents ?? [],
    (initialSave?.placedTraps ?? []).map((t) => ({ ...t, baitKind: t.baitKind ?? null })),
    initialSave?.placedContainers ?? [],
    initialSave?.carriedContainer ?? null,
    initialSave?.playerWells ?? [],
    treeLifecycle,
    getWorldDays,
    dayNight,
    (initialSave?.dryingRacks ?? []) as DryingRackRecord[],
    (initialSave?.hives ?? []) as BeehiveRecord[],
    initialSave?.settlementEconomies,
    onAnimalDeath,
    getPlayerSocial,
    landOwnership.isOwned,
    onTrapCapture,
    onTrapBaitReturned,
    new Map((initialSave?.spawnPoints ?? []).map((s) => [s.id, s])),
    pointLightBudget,
    getNearbyPlayerWell,
    initialSave?.playerGardens ?? [],
    resourceDepletion,
    (initialSave?.terrainPreparations ?? []).map((p) => ({
      id: p.id,
      center: { x: p.x, z: p.z },
      size: p.size,
      targetHeight: p.targetHeight,
      originalHeights: p.originalHeights,
      requiredWork: p.requiredWork,
      completedWork: p.completedWork,
      status: 'active' as const,
    })),
    () => worldGeneration !== initialWorldGeneration,
  )
  bootMarkEnd('createWorldBundle')
  // Already logged inside `worldBundle.ts` on failure — nothing else to do
  // here. On success, `bundle`'s stub fauna/item spawners/drying racks/
  // hives have already been replaced in place by the time this resolves.
  worldBundleBackgroundReady.catch(() => {})

  nearbyPlayerWellTarget = (x, z, maxDistance) => bundle.playerWells.nearestCompleted(x, z, maxDistance)
  // Plan 159 §10 — fishing bait per spot (flat map, survives stream-out/in
  // for free) and a runtime-only per-spot cast counter feeding the
  // deterministic catch roll (same "not persisted, wild fauna isn't either"
  // convention as `createPlacedTraps.ts`'s `attempts`).
  const fishingBait = new Map<string, FishingBaitState>(Object.entries(initialSave?.fishingBait ?? {}))
  const fishingAttempts = new Map<string, number>()

  // Indirection (not a direct destructure) so this keeps sampling whichever
  // bundle.chunkManager/config.terrain are current across `rebuildWorld()`
  // mutating `bundle`'s fields in place — see `worldBundle.ts`'s `WorldBundle`
  // doc comment.
  bootMark('createWorldContext')
  const worldContext = createWorldContext(() => bundle.chunkManager, config, dayNight)
  bootMarkEnd('createWorldContext')

  const ambientAudio = createAmbientAudio(worldAudio, worldContext)
  const fireAudio = createFireAudio(worldAudio)
  const weatherAudio = createWeatherAudio(worldAudio)
  const weatherParticles = createWeatherParticles({ getLodScale: () => config.quality.lodScale })
  weatherParticles.addTo(scene)
  const clouds = createClouds()
  clouds.addTo(scene)
  const houseDoors = createHouseDoorTracker()
  configureUiSounds(worldAudio.playOnce)
  configureNpcVoiceSounds(worldAudio.playAt)

  const mapDiscovery = createMapDiscovery(initialSave?.map.discoveredCells)
  const mapProjection = createMapProjection(rawSampleParamsFromWorld(config))
  const mapData = createMapData({
    projection: mapProjection,
    discovery: mapDiscovery,
    lookupSettlement: (gx, gz) => {
      const def = bundle.settlementsManager.peekDef({ gx, gz })
      if (!def) return null
      return { id: def.id, x: def.x, z: def.z, name: def.name }
    },
  })
  setActiveMapData(mapData)

  const inventory = new Inventory(
    initialSave?.inventory,
    undefined,
    initialSave ? Inventory.instancesFromJSON(initialSave.inventoryInstances ?? []) : undefined,
    initialSave?.foodBatches,
    DEFAULT_MAX_SIZE,
  )

  // Plan 161 — pre-existing count-based weapons (starting knife, older saves)
  // have no recoverable condition; every unit becomes a fresh full-condition
  // instance. Idempotent, so safe to run unconditionally on every load.
  migrateWeaponCountsToInstances(inventory)
  // Plan items-player-001 — pre-existing plan-106 waterskin_empty/
  // waterskin_full counts predate the sized/partial-content model; every unit
  // becomes a fresh `waterskin_medium` instance. Idempotent (a fresh game or
  // an already-migrated save has zero count for these legacy kinds).
  migrateLegacyWaterskinsToInstances(inventory)
  grantStartingLoadout(inventory)
  const heldTool = createHeldTool(inventory, initialSave?.heldTool ?? null)
  const primaryWeapons = createPrimaryWeaponSelection()
  // Renamed from `syncShovelQuickActions` — now the single post-inventory-
  // mutation refresh for every Quick Actions / Pause→Akcje availability flag
  // (review 007 C4), not just shovel/tent. `canBuild*`/`canLight*` come from
  // `getUserActions()` below; safe to reference here despite the earlier
  // declaration since this function is only ever *called* from closures that
  // run after `createApp`'s synchronous setup (including `getUserActions`)
  // has finished.
  const syncQuickActionAvailability = (): void => {
    vueUi.setQuickActionsHasDiggingTool(inventory.hasCapability('soil_digging'))
    vueUi.setQuickActionsHasTent(inventory.has('tent', 1))
    vueUi.setQuickActionsHasChest(inventory.has('chest', 1))
    vueUi.setQuickActionsTraps({
      simple: inventory.countInstances(TRAP_DEFS.simple.itemKind) > 0,
      good: inventory.countInstances(TRAP_DEFS.good.itemKind) > 0,
    })
    vueUi.setQuickActionsFireAvailability({
      buildSimpleFire: canBuildSimpleFire(),
      buildFirePit: canBuildFirePit(),
      buildGrate: canBuildGrate(),
      lightBranch: canLightBranch(),
      lightWoodenTorch: canLightWoodenTorch(),
    })
    vueUi.setQuickActionsHasCarriedContainer(bundle.placedContainers.hasCarried())
    vueUi.setQuickActionsHasTreeSeed(inventory.has('tree_seed', 1))
    vueUi.setQuickActionsCropSeeds({
      carrot: inventory.has('seed_carrot', 1),
      potato: inventory.has('seed_potato', 1),
      cabbage: inventory.has('seed_cabbage', 1),
    })
  }

  const keyboard = createKeyboard()
  const mouseLook = createMouseLook(renderer.domElement, keyboard.state)

  bootMark('PlayerController.create')
  const player = await PlayerController.create(
    camera,
    keyboard.state,
    mouseLook.state,
    bundle.chunkManager.sampleHeight,
    bundle.chunkManager.sampleFloor,
    bundle.chunkManager.waterLevel,
    bundle.chunkManager.collidersNear,
    (x, z) => sampleFootstepSurface(bundle.chunkManager, x, z),
  )
  bootMarkEnd('PlayerController.create')

  if (initialSave) {
    // Set look before position — setPosition() calls syncCamera(), which reads yaw/pitch.
    mouseLook.state.yaw = initialSave.player.yaw
    mouseLook.state.pitch = initialSave.player.pitch
    player.setPosition(initialSave.player.x, initialSave.player.z)
    restorePersistedNeeds(player.needs, initialSave.playerNeeds)
    restorePersistedSkills(player.skills, initialSave.skills)
  } else {
    // Computed straight from `homeDef` (site position, sync the moment
    // `SettlementsManager` resolves it) rather than waiting on
    // `bundle.settlementsManager.home` — the home settlement's full build
    // (houses/NPCs/livestock) is deferred to the background (world-003
    // "faster application startup" §3) and isn't needed for the player's
    // spawn point, which `settlementSpawnPoint` computes identically to
    // `createSettlement.ts`'s own `spawn` field.
    const homeSpawn = settlementSpawnPoint(bundle.settlementsManager.getHomeDef(), bundle.chunkManager.sampleHeight)
    player.setPosition(homeSpawn.x, homeSpawn.z)
  }

  player.setName(config.player.name)
  player.setMoveAudio(worldAudio.playAt)
  scene.add(player.mesh)
  player.mesh.visible = isSystemEnabled('playerModel')
  vueUi.configureSkillsScreen({ onToggleSneak: () => toggleSneak(player.skills) })
  const hud = createHud(container)
  hud.setTime(dayNight.timeOfDay)
  const toast = createToast(container)

  // Assigned below; PlayerTorch onChange closes over the live binding.
  let syncHeldHud = (): void => {}
  const playerTorch = createPlayerTorch({
    handSocket: () => player.handSocket(),
    heldToolObject: () => player.getHeldToolObject(),
    onChange: () => syncHeldHud(),
    onIgnite: () => playActionFireIgnite(worldAudio.playAt, player.mesh.position),
    onExtinguish: () => playActionFireExtinguish(worldAudio.playAt, player.mesh.position),
  }, pointLightBudget)

  syncHeldHud = (): void => {
    if (playerTorch.isLit() && playerTorch.source() === 'branch') {
      hud.setHeldTool('płonąca gałąź')
      // Lit branch owns the wrist — clear tool mesh so they don't stack.
      if (heldTool.held() !== null) {
        heldTool.unequip()
      }
      player.setHeldTool(null)
      return
    }
    const held = heldTool.held()
    if (playerTorch.isLit() && playerTorch.source() === 'wooden_torch' && held === 'wooden_torch') {
      hud.setHeldTool('pochodnia (płonie)')
      player.setHeldTool(held)
      return
    }
    hud.setHeldTool(held ? ITEM_DEFS[held].label : '')
    player.setHeldTool(held)
    primaryWeapons.syncWithInventory(inventory)
    hud.setPrimaryWeapons(
      primaryWeapons.primaryMelee() ? ITEM_DEFS[primaryWeapons.primaryMelee()!.kind].label : '',
      primaryWeapons.primaryRanged() ? ITEM_DEFS[primaryWeapons.primaryRanged()!.kind].label : '',
    )
  }
  syncHeldHud()

  // Restore mid-burn hand light after held-tool HUD sync.
  if (initialSave?.playerTorch) {
    const saved = initialSave.playerTorch
    let canRestore = true
    if (saved.source === 'wooden_torch') {
      if (heldTool.held() !== 'wooden_torch') {
        canRestore = inventory.has('wooden_torch', 1) && heldTool.equip('wooden_torch')
      }
    } else {
      // Lit branch occupies the hand — clear any restored tool slot.
      heldTool.unequip()
    }
    if (canRestore) {
      void playerTorch.light(saved.source, { fuelRemaining: saved.fuelRemaining, silent: true }).then(() => {
        syncHeldHud()
      })
    }
  }

  const worldFlags = {
    guardSwordGifted: initialSave?.worldFlags?.guardSwordGifted ?? false,
    hiddenTreasureFound: initialSave?.worldFlags?.hiddenTreasureFound ?? false,
  }

  const grantItem = (kind: ItemKind, count: number): void => {
    for (let i = 0; i < count; i++) {
      const instance = createAcquiredInstance(kind)
      const added = instance ? inventory.addInstance(instance) : inventory.add(kind)
      if (!added) {
        // Plan 199 — an overflow drop still carries the instance identity
        // that was just minted for it, so a later pickup doesn't reset it.
        bundle.droppedItems.drop(
          kind,
          player.mesh.position.x,
          player.mesh.position.z,
          instance ? toSaveItemInstance(instance) : undefined,
        )
      }
    }
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    heldTool.syncWithInventory()
    syncHeldHud()
    syncQuickActionAvailability()
  }

  bootMark('createMinimap')
  const minimap = createMinimap(container)
  bootMarkEnd('createMinimap')

  // Resolved once here (not injected into `QuestManager`, which stays
  // chunk/terrain-agnostic) — landmarks never change once generated, so
  // there's nothing to re-resolve at runtime, unlike `kill_target_animal`/
  // `find_animal`'s live `AnimalTargetResolver` below (plan 132).
  const landmarkQuests = buildLandmarkQuests((kind) => {
    // `getHomeDef()` (not `.home.center`) — always available, independent of
    // whether the home settlement's background build (world-003 §3) has
    // finished; `homeDef.x/z` is the same value `Settlement.center` resolves
    // to (see `createSettlement.ts`'s `center: new Vector3(site.x, site.y,
    // site.z)`).
    const homeDef = bundle.settlementsManager.getHomeDef()
    return bundle.chunkManager.findLandmarkNear(
      kind,
      homeDef.x,
      homeDef.z,
      LANDMARK_QUEST_SEARCH_CHUNK_RADIUS,
    )?.id
  })

  const questManager = new QuestManager(
    [...QUESTS, ...landmarkQuests],
    worldAudio.playOnce,
    inventory,
    initialSave?.quests,
    (kind, count) => {
      if (kind === 'long_sword') {
        if (!shouldGrantQuestSword(kind, worldFlags.guardSwordGifted, inventory.holdsAny('long_sword'))) return
        worldFlags.guardSwordGifted = true
      }
      grantItem(kind, count)
      toast.show(`+${count} ${ITEM_DEFS[kind].label}`, 'pickup')
    },
    // Reads `bundle` (not a destructured `bundle.fauna`) so this stays valid
    // across `rebuildWorldBundle()` — see `worldBundle.ts`'s header comment.
    // Wild fauna and settlement livestock are disjoint populations by kind
    // (wolf/deer/etc. are never livestock, sheep/chicken/etc. are never wild
    // — see `AnimalAgent.ts`'s `ANIMAL_DEFS`), so trying wild fauna first and
    // falling back to loaded settlements' livestock covers both without the
    // resolver needing to know which population a given kind belongs to
    // (plan 093 Etap G — lets `find_animal: { kind: 'sheep' }` resolve).
    (kind) => {
      const wild = bundle.fauna.getAgents().find((a) => a.def.kind === kind && !a.isDead())
      if (wild) return wild.animalId
      for (const settlement of bundle.settlementsManager.getLoaded()) {
        const owned = settlement.livestock.find((a) => a.def.kind === kind && !a.isDead())
        if (owned) return owned.animalId
      }
      return undefined
    },
    // Wolves are wild-fauna-only (see the resolver above), so no need to also
    // scan settlement livestock here (plan 110's `grozny-wilk` trait).
    (animalId) => {
      bundle.fauna.getAgents().find((a) => a.animalId === animalId)?.markDangerous()
    },
  )

  // Now that `questManager` exists, the closures passed into `createWorldBundle`
  // above can actually reach it — see those call sites' comments.
  getPlayerSocialTarget = (npcName) => ({
    relationLevel: questManager.getRelationLevel(npcName),
    standing: questManager.getPlayerStanding(),
  })
  onAnimalDeathTarget = (animalId) => {
    questManager.onInteractObjective({ type: 'animal_died', animalId })
  }
  hud.setExp(questManager.getExp())
  hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)

  // Assigned once `inventoryScreen` exists further down; every caller runs
  // later, so the initial no-op is never the one that fires.
  let refreshInventoryScreen: () => void = () => {}

  const inventoryWiring = createInventoryWiring({
    bundle,
    player,
    inventory,
    heldTool,
    primaryWeapons,
    playerTorch,
    hud,
    toast,
    vueUi,
    questManager,
    worldFlags,
    playOnce: worldAudio.playOnce,
    grantItem,
    syncHeldHud: () => syncHeldHud(),
    syncQuickActionAvailability,
    refreshInventoryScreen: () => refreshInventoryScreen(),
  })
  vueUi.configurePrimaryWeaponShortcuts({
    equipMelee: inventoryWiring.equipPrimaryMeleeWeapon,
    equipRanged: inventoryWiring.equipPrimaryRangedWeapon,
  })

  const timeSkip = createTimeSkip(dayNight)
  const timeSkipOverlay = createTimeSkipOverlay(container)
  const busy = createBusyAction((amount) => drainStamina(player.needs.stamina, amount))
  const busyOverlay = createBusyOverlay(container)
  const restCamp = createRestCampSequence(scene, player, (x, z) => bundle.chunkManager.sampleHeight(x, z))

  /** The single post-inventory-mutation sync every action/trade path calls —
   *  held tool, HUD label, Quick Actions availability and an open merchant. */
  const onInventoryChanged = (): void => {
    heldTool.syncWithInventory()
    syncHeldHud()
    syncQuickActionAvailability()
    inventoryWiring.syncMerchantIfOpen()
  }

  const actionCtx: PlayerActionContext = {
    bundle,
    player,
    inventory,
    heldTool,
    playerTorch,
    hud,
    toast,
    busy,
    timeSkip,
    restCamp,
    dayNight,
    mouseLook,
    keyboard,
    getPlayerSocial,
    worldAudio,
    getTreeLifecycle: () => treeLifecycle,
    onInventoryChanged,
    grantItem,
    syncQuickActionAvailability,
    syncHeldHud: () => syncHeldHud(),
    refreshInventoryScreen: () => refreshInventoryScreen(),
  }

  // Riding (plan fauna-003) — livestock has a deterministic per-house
  // `animalId` (`settlement/livestock.ts`), so a saved `mountedAnimalId`
  // resolves back to the same individual after reload; a wild-fauna id would
  // not (see `LIVESTOCK_KINDS`), but only `mount`-configured kinds (horse/
  // donkey, both livestock-only today) can ever be the target in the first
  // place.
  const resolveMountAnimal = (animalId: string): AnimalAgent | null => {
    for (const settlement of bundle.settlementsManager.getLoaded()) {
      const found = settlement.livestock.find((a) => a.animalId === animalId)
      if (found) return found
    }
    return bundle.fauna.getAgents().find((a) => a.animalId === animalId) ?? null
  }
  const mount = createMountActions(actionCtx, resolveMountAnimal)
  if (initialSave?.player.mountedAnimalId) {
    mount.restoreMountedAnimalId(initialSave.player.mountedAnimalId)
  }

  const placement = createPlacementActions(actionCtx)
  const containers = createContainerActions(actionCtx, {
    vueUi,
    tentBlockers: placement.tentBlockers,
    rendererElement: renderer.domElement,
  })
  const gathering = createGatheringActions(actionCtx, { fishingBait, fishingAttempts })
  const survival = createSurvivalActions(actionCtx)
  const ground = createGroundActions(actionCtx, { worldFlags })
  const rest = createRestActions(actionCtx, {
    timeSkipOverlay,
    busyOverlay,
    openLodgingPanel: (title, description, actions) => vueUi.openFlavorDialog(title, description, actions),
  })
  // Mutual exclusion between the two world preview modes (plan `ui-input-004`
  // §9) — `terrainPrep` is constructed first but needs a check against
  // `placementPreview`, which needs `terrainPrep` itself; the forward
  // reference is filled in once `placementPreview` exists below (both
  // closures are only ever called later, during the tick loop).
  let placementPreviewIsActive: () => boolean = () => false
  const terrainPrep = createTerrainPreparationActions(actionCtx, {
    scene,
    timeSkipOverlay,
    wheelTarget: renderer.domElement,
    blockersNear: placement.tentBlockers,
    showPreview: (view) => vueUi.showTerrainPreparationPreview(view),
    hidePreview: () => vueUi.hideTerrainPreparationPreview(),
    isOtherPreviewActive: () => placementPreviewIsActive(),
  })

  onTrapCaptureTarget = gathering.onTrapCapture
  onTrapBaitReturnedTarget = gathering.onTrapBaitReturned
  vueUi.configureAbortRest(rest.abortRest)
  vueUi.configureAbortBusy(rest.abortBusy)
  vueUi.configureAbortTerrainPreparation(terrainPrep.cancelActive)
  vueUi.configureTerrainPreparationControls({
    grow: terrainPrep.growSize,
    shrink: terrainPrep.shrinkSize,
    raise: terrainPrep.raiseHeight,
    lower: terrainPrep.lowerHeight,
    confirm: terrainPrep.confirmPreview,
  })

  const { buildSaveData, saveNow, refreshActiveSaveName, installAutoSave } = createSaveState({
    config,
    bundle,
    player,
    mouseLook,
    inventory,
    heldTool,
    playerTorch,
    questManager,
    dayNight,
    mapDiscovery,
    landOwnership,
    vueUi,
    worldFlags,
    fishingBait,
    getCollectedItemIds: () => collectedItemIds,
    getRemovedCropIds: () => removedCropIds,
    getPlantedTrees: () => plantedTrees,
    getPlantedCrops: () => plantedCrops,
    getModifications: () => modifications,
    getTreeLifecycle: () => treeLifecycle,
    getResourceDepletion: () => resourceDepletion,
    getMountedAnimalId: () => mount.mountedAnimalId(),
  })

  let rebuilding = false
  /** Pass `resetCollectedItems: true` only for a genuinely new world (new seed,
   *  e.g. "New Game") — an unrelated terrain-param rebuild on the same seed
   *  should keep it, since item ids are seed-derived and stay meaningful. */
  bootMark('rebuildWorld')
  const rebuildWorld = async (resetCollectedItems = false) => {
    if (rebuilding) return
    rebuilding = true
    gui.setBusy(true)
    try {
      syncSeedInUrl(config.seed)
      saveWorld(config)
      // Old agents are about to be disposed — drop the reference rather than
      // toggling a class on a DOM node that's going away anyway.
      gameLoop.forgetHighlight()
      if (resetCollectedItems) {
        collectedItemIds = new Set()
        removedCropIds = new Set()
        plantedTrees = []
        plantedCrops = []
        modifications = []
        resourceDepletion = new Map()
        resetDayNightForNewGame(dayNight)
        treeLifecycle = createTreeLifecycle(config.seed, {})
        landOwnership.clear()
      }

      // Marks the initial `createWorldBundle()` boot's own background phase
      // (fauna/item spawners/drying racks/hives) stale if it's somehow still
      // in flight — see this file's `worldGeneration` doc comment above.
      worldGeneration++
      const thisRebuildGeneration = worldGeneration
      await rebuildWorldBundle(
        bundle,
        scene,
        config,
        resetCollectedItems,
        collectedItemIds,
        removedCropIds,
        plantedTrees,
        plantedCrops,
        modifications,
        worldAudio.playAt,
        treeLifecycle,
        getWorldDays,
        dayNight,
        onAnimalDeath,
        getPlayerSocial,
        landOwnership.isOwned,
        onTrapCapture,
        onTrapBaitReturned,
        pointLightBudget,
        getNearbyPlayerWell,
        resourceDepletion,
        () => worldGeneration !== thisRebuildGeneration,
      )
      mapProjection.setParams(rawSampleParamsFromWorld(config))

      // Plan 199 — a same-seed rebuild recreates fauna with fresh per-kind
      // id counters; `reset()` below already clears `animalTargets` on a
      // genuinely new world, so this only needs to run for the in-session
      // terrain-param rebuild path.
      if (!resetCollectedItems) questManager.invalidateStaleAnimalTargets()

      if (resetCollectedItems) {
        inventory.clear()
        grantStartingLoadout(inventory)
        heldTool.unequip()
        questManager.reset()
        mapDiscovery.clear()
        playerTorch.extinguish()
        worldFlags.guardSwordGifted = false
        worldFlags.hiddenTreasureFound = false
        ground.resetTreasureProgress()
        resetPlayerNeeds(player.needs)
        fishingBait.clear()
        fishingAttempts.clear()
        hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
        syncHeldHud()
        hud.setExp(questManager.getExp())
        syncQuickActionAvailability()
      }
      // New chunkManager/ocean instances start with default (untinted) water —
      // resync immediately rather than waiting for the tick loop's throttled
      // apply to notice a large-enough timeOfDay delta.
      if (dayNight.enabled) gameLoop.resyncDayNight()
      pointLightBudget.sync(camera)
      const rebuiltPrewarm = await prewarmRenderPrograms(renderer, scene, camera)
      if (typeof window !== 'undefined') window.__seedvaleProgramPrewarm = rebuiltPrewarm
      player.setGround(
        bundle.chunkManager.sampleHeight,
        bundle.chunkManager.sampleFloor,
        bundle.chunkManager.waterLevel,
        bundle.chunkManager.collidersNear,
        (x, z) => sampleFootstepSurface(bundle.chunkManager, x, z),
      )
      // Only a genuinely new world (new seed / New Game) relocates the player
      // to home spawn — an in-session terrain-param rebuild on the same seed
      // must leave the player's actual position alone; `setGround` above
      // already re-snapped it to the rebuilt terrain's height via
      // `snapToGround()` (plan 194 §12 finding: this used to run
      // unconditionally, silently teleporting the player home on e.g. a
      // flat-shading toggle).
      if (resetCollectedItems) {
        const homeSpawn = settlementSpawnPoint(bundle.settlementsManager.getHomeDef(), bundle.chunkManager.sampleHeight)
        player.setPosition(homeSpawn.x, homeSpawn.z)
      }
      pauseMenu.setSeed(config.seed)
    } finally {
      gui.setBusy(false)
      rebuilding = false
    }
  }
  bootMarkEnd('rebuildWorld')

  const graphics = createGraphicsSettings({
    config,
    bundle,
    renderer,
    postProcessing,
    lights,
    sky,
    dayNight,
    resyncDayNight: () => gameLoop.resyncDayNight(),
  })

  // Shared with the World config screen (`ui-vue/screens/WorldConfigScreen.vue`)
  // via `configureWorldConfigScreen` below — same costly-rebuild handler as
  // debug GUI's seed/flat-shading controls, not a second implementation.
  const onTerrainChange = () => {
    void rebuildWorld()
  }

  const benchmark = createBenchmarkRunner({
    config,
    chunkManager: () => bundle.chunkManager,
    home: () => {
      const def = bundle.settlementsManager.getHomeDef()
      return { x: def.x, z: def.z }
    },
    dayNight,
    player,
    monitor: perfMonitor,
    applyQualityPreset: graphics.applyNamedQualityPreset,
    isolation: {
      scene,
      sun: lights.sun,
      applyPostConfig: () => {
        postProcessing.applyConfig(config.postProcessing)
        bundle.ocean.setReflections(config.postProcessing.waterReflections)
        bundle.chunkManager.setWaterReflections(config.postProcessing.waterReflections)
      },
      setAoEnabled: (on) => {
        postProcessing.setPassEnabled('ao', on)
      },
      setReflections: (on) => {
        bundle.ocean.setReflections(on)
        bundle.chunkManager.setWaterReflections(on)
      },
      setBloomEnabled: (on) => {
        postProcessing.setPassEnabled('bloom', on)
      },
      setSmaaEnabled: (on) => {
        postProcessing.setPassEnabled('smaa', on)
      },
      setGodRaysEnabled: (on) => {
        postProcessing.setPassEnabled('godRays', on)
      },
      setFilmGradeEnabled: (on) => {
        postProcessing.setPassEnabled('filmGrade', on)
      },
    },
  })

  const gui = createDebugGui(config, dayNight, climate, renderer, {
    onTerrainChange,
    onSkyChange: graphics.updateSkyFromGui,
    onDayNightChange: graphics.onDayNightChange,
    onPostProcessingChange: graphics.updatePostProcessingFromGui,
    onRenderQualityChange: graphics.updateRenderQualityFromGui,
    onTerrainShadowChange: graphics.updateTerrainShadowFromGui,
    onDumpVillagePlan: () => {
      console.log(summarizeVillagePlan(bundle.settlementsManager.getHomeDef().plan))
    },
    onQualityPresetChange: graphics.onQualityPresetChange,
    onShadowMapSizeChange: graphics.updateShadowMapFromGui,
    onLodScaleChange: graphics.updateLodScaleFromGui,
    onPerfTimingsToggle: (enabled) => { perfMonitor.setSource('gui', enabled) },
    onRunBenchmark: (id) => { void benchmark.run(id) },
  })

  if (config.showGui) gui.toggle()
  vueUi.configureWorldConfigScreen(config, dayNight, {
    onTerrainChange,
    onDayNightChange: graphics.onDayNightChange,
    onPostProcessingChange: graphics.updatePostProcessingFromGui,
    onRenderQualityChange: graphics.updateRenderQualityFromGui,
    onTerrainShadowChange: graphics.updateTerrainShadowFromGui,
    onQualityPresetChange: graphics.onQualityPresetChange,
    onShadowMapSizeChange: graphics.updateShadowMapFromGui,
    onLodScaleChange: graphics.updateLodScaleFromGui,
  })

  // Created before pauseMenu so their Escape listeners register first — see
  // createNpcDialog's onKeyDown comment for why registration order matters here.
  const npcDialog = createNpcDialog(container)
  const questLog = createQuestLog(container)
  // Plan 170 — NPC simulation inspector and trace. Debug-only: no modal, no
  // Ctrl+click listener, no `window.seedvale.debug` outside `?debug`.
  const npcInspector = isDebugMode() ? createNpcInspector(container, bundle, () => dayNight.timeOfDay) : undefined
  const npcInspectTrigger = createNpcInspectTrigger(renderer.domElement)
  installNpcDebugApi(
    bundle,
    worldContext,
    config,
    () => dayNight.timeOfDay,
    () => ({ x: player.mesh.position.x, z: player.mesh.position.z }),
    async (x, z) => {
      await bundle.chunkManager.waitForChunks(chunksNear(x, z, config.terrain.chunkSize))
      player.setPosition(x, z)
    },
    worldFlags,
  )

  const inventoryScreenHandlers: InventoryScreenHandlers = {
    onDrop: inventoryWiring.dropItemStack,
    onEquip: inventoryWiring.equipTool,
    onUnequip: inventoryWiring.unequipTool,
    onConsume: (kind) => survival.consumeItem(kind),
    onSellInstances: inventoryWiring.sellInventoryInstances,
    onSharpen: inventoryWiring.sharpenInventoryWeapon,
    onPlaceTrap: (kind) => {
      inventoryScreen.close()
      placement.placeTrapAtAim(kind)
    },
    onPlaceContainer: () => {
      inventoryScreen.close()
      containers.placeContainerAtAim()
    },
  }

  const inventoryScreen = createInventoryScreen(container, inventoryScreenHandlers)

  refreshInventoryScreen = () => {
    inventoryScreen.refresh(
      inventoryCountsForUi(inventory),
      inventory.totalWeight(),
      inventory.maxWeight,
      inventory.totalSize(),
      inventory.maxSize,
      heldTool.held(),
      buildInventoryGroups(inventory),
    )
  }

  const {
    previewFirePlacement, buildSimpleFire, buildFirePit, buildGrate, lightBranch, lightWoodenTorch,
    canBuildSimpleFire, canBuildFirePit, canBuildGrate, canLightBranch, canLightWoodenTorch,
  } = getUserActions(
    inventory,
    bundle,
    playerTorch,
    player,
    hud,
    heldTool,
    syncHeldHud,
    mouseLook,
    placement.tentBlockers,
  )

  const placementPreview = createPlacementPreviewActions(actionCtx, {
    scene,
    placement,
    containers,
    previewFire: previewFirePlacement,
    buildSimpleFire,
    buildFirePit,
    showPreview: (view) => vueUi.showPlacementPreview(view),
    hidePreview: () => vueUi.hidePlacementPreview(),
    isOtherPreviewActive: () => terrainPrep.isPreviewActive(),
  })
  placementPreviewIsActive = placementPreview.isActive
  vueUi.configureAbortPlacementPreview(placementPreview.cancel)
  vueUi.configurePlacementPreviewConfirm(placementPreview.confirm)

  const syncNearTownQuickActions = (): void => {
    vueUi.setQuickActionsNearTown(rest.isNearTown())
  }

  /** When quick actions opened under pointer lock, restore lock on close so
   *  camera look resumes without requiring an extra canvas click. */
  let restorePointerLockAfterQuickActions = false
  const quickActions = createQuickActions(container, {
    hasDiggingTool: inventory.hasCapability('soil_digging'),
    hasTent: inventory.has('tent', 1),
    hasChest: inventory.has('chest', 1),
    hasCarriedContainer: bundle.placedContainers.hasCarried(),
    hasTreeSeed: inventory.has('tree_seed', 1),
    cropSeeds: {
      carrot: inventory.has('seed_carrot', 1),
      potato: inventory.has('seed_potato', 1),
      cabbage: inventory.has('seed_cabbage', 1),
    },
    nearTown: rest.isNearTown(),
    onOpen: () => {
      restorePointerLockAfterQuickActions = exitGamePointerLock(renderer.domElement)
      syncNearTownQuickActions()
      // Plan 175 — `buildGrate` availability is position-dependent (nearest
      // fire in range), same "only trustworthy resolved fresh at popup-open
      // time" reasoning as `nearTown` above.
      syncQuickActionAvailability()
    },
    onClose: () => {
      if (!restorePointerLockAfterQuickActions) return
      restorePointerLockAfterQuickActions = false
      requestGamePointerLock(renderer.domElement)
    },
    onBuildGrate: buildGrate,
    onLightBranch: lightBranch,
    onLightWoodenTorch: lightWoodenTorch,
    onWait: rest.startWait,
    onRest: rest.startRest,
    onDig: () => {
      const p = ground.aimGroundPoint()
      ground.startDigAt(p.x, p.z)
    },
    onLevel: () => {
      const p = ground.aimGroundPoint()
      ground.startLevelAt(p.x, p.z)
    },
    onMound: () => {
      const p = ground.aimGroundPoint()
      ground.startMoundAt(p.x, p.z)
    },
    onPrepareTerrain: terrainPrep.startPreview,
    onStartPlacementPreview: placementPreview.start,
    onPlaceTrap: placement.placeTrapAtAim,
    onPutDownContainer: containers.putDownContainerAtAim,
    onBuildWell: placement.placeWellAtAim,
    onBuildGarden: placement.placeGardenAtAim,
    onPlantTree: placement.plantTreeAtAim,
    onPlantCrop: placement.plantCropAtAim,
  })
  syncQuickActionAvailability()
  syncNearTownQuickActions()

  // Close on Q inside the keydown gesture so onClose can re-request pointer
  // lock. gameLoop only consumes the edge on the next frame, which is too late
  // for requestPointerLock's transient user activation.
  const onQuickActionsKeyDown = (event: KeyboardEvent) => {
    if (event.code !== 'KeyQ' || event.repeat) return
    if (!quickActions.isOpen()) return
    quickActions.close()
    keyboard.consumeQuickActions()
  }
  window.addEventListener('keydown', onQuickActionsKeyDown)

  const openQuestLog = () => {
    questLog.open()
    questLog.refresh(questManager.list(), questManager.getExp(), (name) =>
      questManager.getRelation(name),
    )
  }

  const openVillagers = () => {
    vueUi.openVillagers()
    vueUi.refreshVillagers(
      bundle.settlementsManager
        .getLoaded()
        .flatMap((s) => s.npcs.map((npc) => ({ npc, settlementName: s.name, foodSourceType: s.foodSourceType }))),
      // Helper assignment targets (plan 167 §14) — every player-placed chest,
      // labelled by its def so a player with more than one can tell them
      // apart without a full container-naming feature.
      bundle.placedContainers.list().map((c) => ({ id: c.id, label: CONTAINER_DEFS[c.kind].label })),
    )
  }
  const openInventory = () => {
    exitGamePointerLock(renderer.domElement)
    inventoryScreen.open()
    refreshInventoryScreen()
  }
  const openSkills = () => {
    exitGamePointerLock(renderer.domElement)
    vueUi.openSkillsScreen()
  }
  const openCharacter = () => {
    exitGamePointerLock(renderer.domElement)
    vueUi.openCharacterScreen()
  }

  const pauseMenu = createPauseMenu(container, config.seed, config.player.name, {
    onPause: () => {
      exitGamePointerLock(renderer.domElement)
      // Plan 175 — `buildGrate`'s availability is position-dependent (nearest
      // fire in range); refresh it whenever Pauza → Akcje can be opened, same
      // reasoning as Quick Actions' own `onOpen`.
      syncQuickActionAvailability()
    },
    onResume: () => {},
    onQuestLog: openQuestLog,
    onVillagers: openVillagers,
    onInventory: openInventory,
    onWorldMap: () => {
      vueUi.openWorldMap(player.mesh.position.x, player.mesh.position.z)
    },
    onToggleGui: () => {
      const visible = gui.toggle()
      setUrlSearchParam('gui', visible ? '1' : '0')
    },
    onNameChange: (name) => player.setName(name),
    onNameCommit: (name) => {
      config.player.name = name
      savePlayer(config)
    },
    onSave: saveNow,
    onSaveAs: async (name) => {
      await saveNow()
      const result = await createSave(name, buildSaveData())
      if (result.ok) vueUi.setPauseActiveSaveName(result.name)
      return result
    },
    onLoadSave: (id) => {
      void (async () => {
        await saveNow()
        setActiveSaveId(id)
        window.location.reload()
      })()
    },
    onListSaves: () => listSaves(),
    onRefresh: () => window.location.reload(),
    onBuildSimpleFire: buildSimpleFire,
    onBuildFirePit: buildFirePit,
    onBuildGrate: buildGrate,
    onLightBranch: lightBranch,
    onLightWoodenTorch: lightWoodenTorch,
    onNewGame: (name) => {
      void (async () => {
        await saveNow()
        beginNewSave(name)
        config.seed = randomSeed()
        await rebuildWorld(true)
        await saveNow()
        await refreshActiveSaveName()
      })()
    },
  }, () => vueUi.isNpcDialogueMenuOpen())
  void refreshActiveSaveName()

  /** Guard against the ☰ / Quick Actions buttons opening their overlay on top
   *  of another already-open full-screen modal (npc dialog/quest log/
   *  villagers) — those don't disable the button the way they disable the rest
   *  of the touch layer, since it now lives outside `.seedvale-touch`. */
  const noFullScreenModalOpen = (): boolean =>
    !npcDialog.isOpen() &&
    !questLog.isOpen() &&
    !vueUi.isVillagersOpen() &&
    !inventoryScreen.isOpen() &&
    !vueUi.isNpcDialogueMenuOpen() &&
    !vueUi.isWorldConfigScreenOpen() &&
    !vueUi.isNotesOpen()

  touchControls = isTouchDevice()
    ? createTouchControls(container, keyboard.state, mouseLook.state, {
        onPauseToggle: () => {
          if (noFullScreenModalOpen()) pauseMenu.togglePause()
        },
        onQuickActions: () => {
          if (noFullScreenModalOpen()) quickActions.toggle()
        },
      })
    : null

  // Pause + minimap chrome for touch live in Vue (TouchChrome / MinimapScreen).

  // NOTE: a Fullscreen-API-on-first-touch call used to live here (address-bar
  // hiding for Chrome/Firefox Android). Removed — confirmed via automated
  // touch-hit-test diagnostics that once document.documentElement enters
  // fullscreen, document.elementFromPoint() (and therefore all subsequent tap
  // hit-testing) degrades to returning <html> for every coordinate, which is
  // exactly the "pause menu won't respond to any tap" symptom reported after
  // this was added. True chrome-less fullscreen on mobile web reliably needs
  // "Add to Home Screen" (see the apple-mobile-web-app-capable meta tag in
  // index.html + the manifest's display:standalone) — that path doesn't hit
  // this bug since it isn't the live Fullscreen API.

  // A benchmark fixture boots with no active save slot pinned to it — periodic
  // autosave would write the fresh benchmark world over whatever save was last
  // active (plan tools-001 trap #14), so it stays off for a fixture run.
  const removeAutoSave = fixture ? (() => {}) : installAutoSave()

  bootMark('createGameLoop')
  const gameLoop = createGameLoop({
    bundle, player, camera, renderer, labelRenderer, scene, sky, lights, postProcessing, dayNight,
    climate, clouds, weatherParticles, weatherAudio, getSeed: () => config.seed,
    keyboard, mouseLook, touchControls, pauseMenu, npcDialog, npcInspector, npcInspectTrigger, questLog, vueUi, inventoryScreen,
    quickActions, timeSkip, timeSkipOverlay, busy, busyOverlay, restCamp, inventory, heldTool, mount, landOwnership, toast, hud,
    questManager, ambientAudio, fireAudio, houseDoors, worldAudio, playerTorch, minimap, mapDiscovery, openQuestLog, openInventory, openSkills, openCharacter,
    startGroundWork: (mode, x, z) => {
      if (hasItemCapability(heldTool.held(), 'rock_mining')) {
        if (mode === 'level') ground.startPickaxeLevelAt(x, z)
        else ground.startPickaxeDigAt(x, z)
      } else if (mode === 'level') ground.startLevelAt(x, z)
      else ground.startDigAt(x, z)
    },
    startTreeChop: ground.startTreeChop,
    startDepositMine: ground.startDepositMine,
    startBuryCorpse: survival.startBuryCorpse,
    startHarvestMeat: survival.startHarvestMeat,
    startMilkAnimal: survival.startMilkAnimal,
    startCookAt: survival.startCookAt,
    startIgniteFire: survival.startIgniteFire,
    startDestroySpawner: survival.startDestroySpawner,
    drinkFromWaterSource: survival.drinkFromWaterSource,
    fillWaterskin: survival.fillWaterskin,
    consumeItem: survival.consumeItem,
    startTentRest: rest.startTentRest,
    packTent: rest.packTent,
    sleepInHay: rest.sleepInHay,
    armTrap: gathering.armTrap,
    disarmTrap: gathering.disarmTrap,
    collectTrap: gathering.collectTrap,
    startFishing: gathering.startFishing,
    applyFishingBait: gathering.applyFishingBait,
    interactDryingRack: gathering.interactDryingRack,
    collectHive: gathering.collectHive,
    burnHive: gathering.burnHive,
    harvestCrop: gathering.harvestCrop,
    tidyGardenPlot: placement.tidyGardenPlot,
    waterGardenPlot: placement.waterGardenPlot,
    openContainer: containers.openContainer,
    pickUpContainer: containers.pickUpContainer,
    workOnWell: placement.workOnWell,
    describeWellWork: placement.describeWellWork,
    tickTerrainPreparationPreview: terrainPrep.tickPreview,
    tickPlacementPreview: placementPreview.tick,
    resumeTerrainPreparationWork: terrainPrep.resumeWork,
    tickTerrainPreparationWork: terrainPrep.tickWork,
    isTerrainPreparationWorkActive: terrainPrep.isWorkActive,
    onTerrainPreparationWorkFinished: terrainPrep.onWorkSkipFinished,
    onSleepFinished: rest.onSleepFinished,
    tickLodging: rest.tickLodging,
    isLodgingActive: rest.isLodgingActive,
    canCancelRest: rest.canCancelRest,
    interruptLongActivityOnDamage: () => rest.interruptRestForDamage() || terrainPrep.interruptForDamage() || rest.abortBusy(),
    onInventoryChanged,
    setFrameTiming: gui.setFrameTiming,
    syncPointLightBudget: () => { pointLightBudget.sync(camera) },
  })
  bootMarkEnd('createGameLoop')

  gameLoop.resyncDayNight()
  // Plan 149 Phase 1 A — compile the already-built home-scene program
  // families before gameplay streaming starts. `tick()` has not run yet, so
  // this stays inside the loading overlay and never blocks chunk attach.
  pointLightBudget.sync(camera)
  const programPrewarm = await prewarmRenderPrograms(renderer, scene, camera)
  if (typeof window !== 'undefined') window.__seedvaleProgramPrewarm = programPrewarm

  const renderLoop = createAppRenderLoop({
    container,
    renderer,
    labelRenderer,
    postProcessing,
    camera,
    scene,
    sampleHeight: (x, z) => bundle.chunkManager.sampleHeight(x, z),
    onTick: () => gameLoop.tick(),
  })

  renderLoop.start()
  loadingScreen.hide()
  if (typeof window !== 'undefined') {
    window.__seedvaleReady = true
  }

  perfMonitor.setContextProvider(() => ({
    loadedChunks: bundle.chunkManager.loadedChunkCount(),
    npcCount: bundle.settlementsManager.getLoaded().reduce((n, s) => n + s.npcs.length, 0),
    faunaCount: bundle.fauna.getAgents().length,
    pixelRatio: renderer.getPixelRatio(),
    quality: config.quality.preset,
    seed: config.seed,
    terrainResolution: config.terrain.resolution,
    loadRadius: config.terrain.loadRadius,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
    // Reproducibility fields (plan tools-001 §4) — only meaningful/populated
    // for a `?benchmark=` fixture run; `elapsedDays`/season/weather still
    // apply to a `?perf=1` gameplay session too, since they're cheap and
    // already tracked live.
    fixtureVersion: fixture?.version,
    elapsedDays: dayNight.elapsedDays,
    season: climate.season,
    weather: climate.weather.type,
  }))

  const autoBench = benchmarkScenarioFromUrl()

  if (typeof window !== 'undefined') {
    window.__seedvaleRunBenchmark = (id, durationSec) => benchmark.run(id, durationSec)
  }

  if (autoBench) void benchmark.run(autoBench)

  bootMarksSummary()

  return () => {
    renderLoop.dispose()
    removeAutoSave()
    vueUi.configureAbortRest(null)
    timeSkip.cancel()
    timeSkipOverlay.dispose()
    busy.cancel()
    busyOverlay.dispose()
    restCamp.dispose()
    gui.dispose()
    pauseMenu.dispose()
    npcDialog.dispose()
    npcInspector?.dispose()
    npcInspectTrigger.dispose()
    questLog.dispose()
    inventoryScreen.dispose()
    restorePointerLockAfterQuickActions = false
    window.removeEventListener('keydown', onQuickActionsKeyDown)
    quickActions.dispose()
    hud.dispose()
    toast.dispose()
    minimap.dispose()
    setActiveMapData(null)
    keyboard.dispose()
    mouseLook.dispose()
    touchControls?.dispose()
    sky.dispose()
    ambientAudio.dispose()
    fireAudio.dispose()
    weatherAudio.dispose()
    weatherParticles.dispose()
    clouds.dispose()
    configureUiSounds(null)
    configureNpcVoiceSounds(null)
    configureAudioVolumes(worldAudio.getVolumes(), null)
    worldAudio.dispose()
    // Marks a still-in-flight initial-boot background phase stale before
    // tearing down — see this file's `worldGeneration` doc comment above.
    worldGeneration++
    disposeWorldBundle(bundle)
    setActiveMonitor(null)
    setActiveProgramCensus(null)
    if (typeof window !== 'undefined') window.__seedvaleProgramCensus = undefined
    playerTorch.dispose()
    pointLightBudget.dispose()
    if (typeof window !== 'undefined') window.__seedvalePointLightBudget = undefined
    if (typeof window !== 'undefined') window.__seedvaleProgramPrewarm = undefined
    player.dispose()
    disposeChunkWorkerPool()
    postProcessing.dispose()
    lights.dispose()
    labelRenderer.domElement.remove()
    vueUi.dispose()
    renderer.dispose()
    renderer.domElement.remove()
  }
}
