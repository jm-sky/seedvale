import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import type { PlayerSocialLookup } from '../ai/reactionChance'
import type { SaveData } from '../persistence/saveData'
import type { TrapCaptureEvent } from '../world/createPlacedTraps'
import { playActionChop, playActionDig, playActionMine, playActionWell } from '../audio/actionSounds'
import { createAmbientAudio } from '../audio/createAmbientAudio'
import { createWorldAudio } from '../audio/createWorldAudio'
import { createHouseDoorTracker } from '../audio/doorSounds'
import { createFireAudio, playActionFireExtinguish, playActionFireIgnite } from '../audio/fireSounds'
import { playInventoryDrop, playInventoryPickUp } from '../audio/inventorySounds'
import { applyFootstepPackFromUrl } from '../audio/playerMoveSounds'
import { createWeatherAudio } from '../audio/weatherSounds'
import { saveAllDomains, saveGraphics, savePlayer, saveWorld } from '../config/persistConfig'
import {
  applyQualityPreset,
  knobsFromConfig,
  matchQualityPreset,
  type QualityPreset,
} from '../config/qualityProfiles'
import {
  applyStoredPlayer,
  applyStoredSettlements,
  applyStoredSky,
  applyStoredTerrain,
  createWorldConfig,
} from '../config/worldConfig'
import { createCameraDebugOverlay } from '../debug/createCameraDebugOverlay'
import { isCameraDebugMode, isNoShadowsDebugMode, isRenderStateDebugMode, isSystemEnabled } from '../debug/debugMode'
import { getRenderStateDebugText } from '../debug/renderStateDebug'
import { ANIMAL_LABELS, type AnimalAgent, BURY_DURATION_SEC, HARVEST_MEAT_DURATION_SEC } from '../fauna/AnimalAgent'
import { meatKindForAnimal } from '../fauna/animalMeat'
import {
  DESTROY_SPAWNER_DURATION_SEC,
  type PreySpawner,
  snapshotSpawnPointState,
  SPAWNER_DESTROY_BRANCH_COST,
} from '../fauna/AnimalSpawner'
import { createTouchControls, type TouchControls } from '../input/createTouchControls'
import { isTouchDevice } from '../input/isTouchDevice'
import { createKeyboard } from '../input/Keyboard'
import { createMouseLook, exitGamePointerLock, requestGamePointerLock } from '../input/MouseLook'
import { COOK_DURATION_SEC, findCookingRecipe } from '../items/campfireCooking'
import { askGuardForSword, shouldGrantQuestSword } from '../items/guardSword'
import { createHeldTool } from '../items/HeldTool'
import { Inventory } from '../items/Inventory'
import { ITEM_CATALOG } from '../items/itemCatalog'
import { ITEM_DEFS, type ItemKind } from '../items/items'
import { evaluateGroundPlacement, evaluateTentPlacement, TENT_PLACEMENT_MESSAGE, TENT_SETUP_DURATION_SEC } from '../items/tentPlacement'
import { TENT_LENGTH, tentRestPose } from '../items/tentProp'
import { buyWithBarter, buyWithShells, sellForShells } from '../items/trade'
import { sellPrice } from '../items/tradeCatalog'
import {
  benchmarkScenarioFromUrl,
  createBenchmarkRunner,
  createPerfMonitor,
  createProgramCensus,
  isPerfUrlEnabled,
  isProgramCensusUrlEnabled,
  pointLightBudgetFromUrl,
  setActiveMonitor,
  setActiveProgramCensus,
} from '../perf'
import { clearSave, writeSave } from '../persistence/saveDb'
import { PlayerController } from '../player/PlayerController'
import {
  drinkWater as drinkWaterNeeds,
  eatFood,
  resetPlayerNeeds,
  restoreNeedsFromSleep,
  restorePersistedNeeds,
} from '../player/PlayerNeeds'
import {
  awardSkillXp,
  restorePersistedSkills,
  SKILL_XP_AWARD,
  survivalDurationMultiplier,
  survivalFoodMultiplier,
  toggleSneak,
} from '../player/PlayerSkills'
import { createPlayerTorch } from '../player/PlayerTorch'
import { QuestManager } from '../quests/QuestManager'
import { buildLandmarkQuests, QUESTS } from '../quests/quests'
import { createPostProcessing } from '../render/createPostProcessing'
import { createRenderer } from '../render/createRenderer'
import { MIN_RENDERER_SIZE, shouldApplyRendererResize } from '../render/rendererResize'
import { createCamera } from '../scene/createCamera'
import { createScene } from '../scene/createScene'
import { createLandOwnershipRegistry } from '../settlement/landOwnership'
import { IGNITE_DURATION_SEC, type VillageFire } from '../settlement/VillageFire'
import { summarizeVillagePlan } from '../settlement/villagePlanDebug'
import { healHealth } from '../shared/HealthState'
import { disposeChunkWorkerPool } from '../terrain/chunkWorkerPool'
import { MINE_DURATION_SEC, yieldForOre } from '../terrain/depositMining'
import { canLevelAt, DIG_DURATION_SEC, getDigProfileAt, getRockDigProfileAt, isRockGround } from '../terrain/dig'
import { applyDigAt, applyLevelAt } from '../terrain/digAction'
import { sampleFootstepSurface } from '../terrain/footstepSurface'
import { mountVueUi } from '../ui-vue/mount'
import { configureAudioVolumes, configureNpcVoiceSounds, configureUiSounds } from '../ui-vue/store'
import { createBusyOverlay } from '../ui/createBusyOverlay'
import { createDebugGui } from '../ui/createDebugGui'
import { createHud } from '../ui/createHud'
import { createInventoryScreen } from '../ui/createInventoryScreen'
import { createLoadingScreen } from '../ui/createLoadingScreen'
import { createMinimap } from '../ui/createMinimap'
import { createNpcDialog } from '../ui/createNpcDialog'
import { createPauseMenu } from '../ui/createPauseMenu'
import { createQuestLog } from '../ui/createQuestLog'
import { createQuickActions } from '../ui/createQuickActions'
import { createTimeSkipOverlay } from '../ui/createTimeSkipOverlay'
import { createToast } from '../ui/createToast'
import {
  TRAP_DEFS,
  TRAP_FOOTPRINT_RADIUS,
  TRAP_PLACE_REACH,
  TRAP_PLACEMENT_MESSAGE,
  TRAP_SEPARATION,
  TRAP_SETUP_DURATION_SEC,
  type TrapKind,
} from '../world/animalTraps'
import { createLights } from '../world/createLights'
import { createSky } from '../world/createSky'
import { createDayNightState } from '../world/dayNight'
import { createMapData, setActiveMapData } from '../world/map/mapData'
import { createMapDiscovery } from '../world/map/mapDiscovery'
import { createMapProjection, rawSampleParamsFromWorld } from '../world/map/mapProjection'
import { randomSeed, syncSeedInUrl } from '../world/parseSeed'
import { createPointLightBudget } from '../world/pointLightBudget'
import { createTimeSkip } from '../world/timeSkip'
import { advanceWorldTreeHarvest, CHOP_DURATION_SEC } from '../world/treeHarvest'
import { createTreeLifecycle, isChoppableStage, parseTreeOverrides, yieldForChopStage } from '../world/treeLifecycle'
import { AGENT_RENDER_LAYER, REFLECTION_DISTANT_LAYER, REFLECTION_SKIPPED_LAYER, WATER_RENDER_LAYER } from '../world/waterMirror'
import { DRINK_THIRST_RELIEF, UNSAFE_WATER_WARNING, type WaterSource } from '../world/WaterSource'
import { createClimateState } from '../world/weather'
import { createWeatherParticles } from '../world/weatherParticles'
import { createWorldContext } from '../world/worldContext'
import { createBusyAction } from './busyAction'
import { type CampRestContext, campRestQuality, hasTentNear, hasWarmFireNear } from './campRest'
import { createGameLoop } from './gameLoop'
import { DIG_REACH } from './interactables'
import { createRestCampSequence } from './restCampSequence'
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
}
/** How close (world units) to a settlement's center counts as "in town" for
 *  the "Odpocznij w mieście" quick action — covers the default village
 *  extent (core + house ring, `ringMax + houseRadius*2 ≈ 39.6` at default
 *  `coreRadius`/`houseRadius`), not the much larger `HOME_RADIUS`. */
const REST_IN_TOWN_RADIUS = 40
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
    if (inventory.count(kind) <= 0) inventory.add(kind, count)
  }
}

export async function createApp(
  container: HTMLElement,
  initialSave?: SaveData | null,
): Promise<() => void> {
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

  const config = createWorldConfig()
  const perfMonitor = createPerfMonitor()
  setActiveMonitor(perfMonitor)
  if (isPerfUrlEnabled()) perfMonitor.setSource('url', true)
  if (initialSave) {
    config.seed = initialSave.config.seed
    // Merge field-by-field rather than replacing `config.terrain` wholesale —
    // an older save can predate `RegionParams` fields added since (e.g.
    // `moistureRegionScale`), and a wholesale replace would leave those
    // `undefined` instead of keeping the fresh defaults `createWorldConfig`
    // already applied.
    applyStoredTerrain(config.terrain, initialSave.config.terrain)
    if (typeof initialSave.config.terrain.resolution === 'number') {
      config.terrain.resolution = initialSave.config.terrain.resolution
    }
    applyStoredSky(config.sky, initialSave.config.sky)
    applyStoredPlayer(config.player, initialSave.config.player)
    applyStoredSettlements(config.settlements, initialSave.config.settlements)
  }
  saveAllDomains(config)

  const dayNight = createDayNightState(
    initialSave
      ? { timeOfDay: initialSave.timeOfDay, elapsedDays: initialSave.elapsedDays }
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

  const renderer = createRenderer(container, config.postProcessing.pixelRatioCap)
  if (isNoShadowsDebugMode()) {
    renderer.shadowMap.enabled = false
  }
  const labelRenderer = new CSS2DRenderer()
  labelRenderer.setSize(container.clientWidth, container.clientHeight)
  labelRenderer.domElement.style.position = 'absolute'
  labelRenderer.domElement.style.inset = '0'
  labelRenderer.domElement.style.pointerEvents = 'none'
  // Below every UI overlay (lowest is .seedvale-hud at z-index:5, index.html) so
  // NPC labels never draw over modals (pause menu, quest log, villagers, dialog).
  labelRenderer.domElement.style.zIndex = '1'
  container.appendChild(labelRenderer.domElement)

  // Vue/Tailwind UI overlay (plan 046) — dynamically imported so it doesn't
  // delay first paint (see `mountVueUi`'s doc comment).
  const vueUi = mountVueUi(container)

  const scene = createScene()
  // Plan 149 Phase 0 — dev/benchmark-only WebGLProgram/material census. `?benchmark=stream`
  // enables it automatically; `?programCensus=1` enables it standalone. No-op renderer/scene
  // change either way (`src/perf/programCensus.ts`).
  const programCensus = createProgramCensus(
    renderer,
    scene,
    benchmarkScenarioFromUrl() === 'stream' || isProgramCensusUrlEnabled(),
  )
  setActiveProgramCensus(programCensus)
  if (typeof window !== 'undefined') window.__seedvaleProgramCensus = programCensus
  const camera = createCamera(container.clientWidth / container.clientHeight)
  camera.layers.enable(WATER_RENDER_LAYER)
  camera.layers.enable(AGENT_RENDER_LAYER)
  camera.layers.enable(REFLECTION_SKIPPED_LAYER)
  camera.layers.enable(REFLECTION_DISTANT_LAYER)
  const worldAudio = createWorldAudio(camera)
  configureAudioVolumes(worldAudio.getVolumes(), (volumes) => {
    worldAudio.setVolumes(volumes)
  })
  applyFootstepPackFromUrl()

  const postProcessing = createPostProcessing(
    renderer,
    scene,
    camera,
    container.clientWidth,
    container.clientHeight,
    config.postProcessing,
  )

  const lights = createLights(config.postProcessing.shadowMapSize)
  lights.addTo(scene)

  // Plan 157 — production NUM_POINT_LIGHTS stabilization. The registry is
  // always active (cheap: bounded to real lights actually registered by
  // `createSettlement`/`PlacedFires`/`PlayerTorch`, never a scene traversal)
  // so it always reports real-light census data; the pad/overflow-cull only
  // runs when `?pointLightBudget=N` is set, since the production budget
  // number is not frozen yet (plan 157 §10 — needs a real-GPU benchmark).
  // Lives here (not inside `WorldBundle`) because its pad is added directly
  // to `scene`, which survives `rebuildWorldBundle()` — only the settlement/
  // placed-fire *registrations* are rebuilt, via the same instance threaded
  // through below.
  const pointLightBudget = createPointLightBudget(scene, pointLightBudgetFromUrl())
  if (typeof window !== 'undefined') {
    window.__seedvalePointLightBudget = pointLightBudget
  }

  const sky = createSky(config.sky)
  sky.addTo(scene)
  sky.applySun(lights.sun)

  let collectedItemIds = new Set<string>(initialSave?.collectedItemIds ?? [])
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
  // the catch needs `player`/`toast`, which only exist further down.
  let onTrapCaptureTarget: ((event: TrapCaptureEvent) => void) | null = null
  const onTrapCapture = (event: TrapCaptureEvent): void => { onTrapCaptureTarget?.(event) }
  const bundle = await createWorldBundle(
    scene,
    config,
    collectedItemIds,
    worldAudio.playAt,
    initialSave?.droppedItems ?? [],
    initialSave?.placedFires ?? [],
    initialSave?.placedTents ?? [],
    initialSave?.placedTraps ?? [],
    treeLifecycle,
    getWorldDays,
    dayNight,
    initialSave?.settlementEconomies,
    onAnimalDeath,
    getPlayerSocial,
    landOwnership.isOwned,
    onTrapCapture,
    new Map((initialSave?.spawnPoints ?? []).map((s) => [s.id, s])),
    pointLightBudget,
  )

  // Indirection (not a direct destructure) so this keeps sampling whichever
  // bundle.chunkManager/config.terrain are current across `rebuildWorld()`
  // mutating `bundle`'s fields in place — see `worldBundle.ts`'s `WorldBundle`
  // doc comment.
  const worldContext = createWorldContext(() => bundle.chunkManager, config, dayNight)
  const ambientAudio = createAmbientAudio(worldAudio, worldContext)
  const fireAudio = createFireAudio(worldAudio)
  const weatherAudio = createWeatherAudio(worldAudio)
  const weatherParticles = createWeatherParticles({ getLodScale: () => config.quality.lodScale })
  weatherParticles.addTo(scene)
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

  const inventory = new Inventory(initialSave?.inventory)
  grantStartingLoadout(inventory)
  const heldTool = createHeldTool(inventory, initialSave?.heldTool ?? null)
  // Renamed from `syncShovelQuickActions` — now the single post-inventory-
  // mutation refresh for every Quick Actions / Pause→Akcje availability flag
  // (review 007 C4), not just shovel/tent. `canBuild*`/`canLight*` come from
  // `getUserActions()` below; safe to reference here despite the earlier
  // declaration since this function is only ever *called* from closures that
  // run after `createApp`'s synchronous setup (including `getUserActions`)
  // has finished.
  const syncQuickActionAvailability = (): void => {
    vueUi.setQuickActionsHasShovel(inventory.has('shovel', 1))
    vueUi.setQuickActionsHasTent(inventory.has('tent', 1))
    vueUi.setQuickActionsTraps({
      simple: inventory.has(TRAP_DEFS.simple.itemKind, 1),
      good: inventory.has(TRAP_DEFS.good.itemKind, 1),
    })
    vueUi.setQuickActionsFireAvailability({
      buildSimpleFire: canBuildSimpleFire(),
      buildFirePit: canBuildFirePit(),
      lightBranch: canLightBranch(),
      lightWoodenTorch: canLightWoodenTorch(),
    })
  }

  const keyboard = createKeyboard()
  const mouseLook = createMouseLook(renderer.domElement)
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
  if (initialSave) {
    // Set look before position — setPosition() calls syncCamera(), which reads yaw/pitch.
    mouseLook.state.yaw = initialSave.player.yaw
    mouseLook.state.pitch = initialSave.player.pitch
    player.setPosition(initialSave.player.x, initialSave.player.z)
    restorePersistedNeeds(player.needs, initialSave.playerNeeds)
    restorePersistedSkills(player.skills, initialSave.skills)
  } else {
    player.setPosition(bundle.settlementsManager.home.spawn.x, bundle.settlementsManager.home.spawn.z)
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
  }

  const grantItem = (kind: ItemKind, count: number): void => {
    for (let i = 0; i < count; i++) {
      if (!inventory.add(kind)) {
        bundle.droppedItems.drop(kind, player.mesh.position.x, player.mesh.position.z)
      }
    }
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    heldTool.syncWithInventory()
    syncHeldHud()
    syncQuickActionAvailability()
  }

  const minimap = createMinimap(container)
  // Resolved once here (not injected into `QuestManager`, which stays
  // chunk/terrain-agnostic) — landmarks never change once generated, so
  // there's nothing to re-resolve at runtime, unlike `kill_target_animal`/
  // `find_animal`'s live `AnimalTargetResolver` below (plan 132).
  const landmarkQuests = buildLandmarkQuests((kind) =>
    bundle.chunkManager.findLandmarkNear(
      kind,
      bundle.settlementsManager.home.center.x,
      bundle.settlementsManager.home.center.z,
      LANDMARK_QUEST_SEARCH_CHUNK_RADIUS,
    )?.id,
  )
  const questManager = new QuestManager(
    [...QUESTS, ...landmarkQuests],
    worldAudio.playOnce,
    inventory,
    initialSave?.quests,
    (kind, count) => {
      if (kind === 'long_sword') {
        if (!shouldGrantQuestSword(kind, worldFlags.guardSwordGifted, inventory.has('long_sword', 1))) return
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

  const syncMerchantIfOpen = (): void => {
    if (vueUi.isMerchantOpen()) vueUi.refreshMerchant(inventory.toJSON())
  }

  vueUi.configureMerchant({
    onBuyShells: (kind) => {
      const result = buyWithShells(inventory, kind)
      if (result === 'ok') {
        hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
        heldTool.syncWithInventory()
        syncHeldHud()
        syncQuickActionAvailability()
        vueUi.refreshMerchant(inventory.toJSON())
        toast.show(`+1 ${ITEM_DEFS[kind].label}`, 'pickup')
      }
      return result
    },
    onBuyBarter: (kind, offer) => {
      const result = buyWithBarter(inventory, kind, offer)
      if (result === 'ok') {
        hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
        heldTool.syncWithInventory()
        syncHeldHud()
        syncQuickActionAvailability()
        vueUi.refreshMerchant(inventory.toJSON())
        toast.show(`+1 ${ITEM_DEFS[kind].label}`, 'pickup')
      }
      return result
    },
    onSellShells: (kind) => {
      const result = sellForShells(inventory, kind)
      if (result === 'ok') {
        hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
        heldTool.syncWithInventory()
        syncHeldHud()
        syncQuickActionAvailability()
        vueUi.refreshMerchant(inventory.toJSON())
        toast.show(`+${sellPrice(kind)} muszli`, 'pickup')
      }
      return result
    },
  })
  vueUi.configureNpcDialogueMenu({
    onAskSword: () => {
      const result = askGuardForSword({
        alreadyGifted: worldFlags.guardSwordGifted,
        guardQuestComplete: questManager.getState('woda-dla-marka') === 'complete',
        relation: questManager.getRelation('Marek'),
        alreadyHasSword: inventory.has('long_sword', 1),
      })
      if (result.grant) {
        worldFlags.guardSwordGifted = true
        grantItem('long_sword', 1)
        toast.show('+1 Miecz', 'pickup')
      }
      return result.line
    },
    onOpenTrade: () => {
      vueUi.openMerchantFromDialogue(inventory.toJSON())
    },
  })

  let rebuilding = false
  /** Pass `resetCollectedItems: true` only for a genuinely new world (new seed,
   *  e.g. "New Game") — an unrelated terrain-param rebuild on the same seed
   *  should keep it, since item ids are seed-derived and stay meaningful. */
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
        dayNight.elapsedDays = 0
        treeLifecycle = createTreeLifecycle(config.seed, {})
        landOwnership.clear()
      }

      await rebuildWorldBundle(
        bundle,
        scene,
        config,
        resetCollectedItems,
        collectedItemIds,
        worldAudio.playAt,
        treeLifecycle,
        getWorldDays,
        dayNight,
        onAnimalDeath,
        getPlayerSocial,
        landOwnership.isOwned,
        onTrapCapture,
        pointLightBudget,
      )
      mapProjection.setParams(rawSampleParamsFromWorld(config))

      if (resetCollectedItems) {
        inventory.clear()
        grantStartingLoadout(inventory)
        heldTool.unequip()
        questManager.reset()
        mapDiscovery.clear()
        playerTorch.extinguish()
        worldFlags.guardSwordGifted = false
        resetPlayerNeeds(player.needs)
        hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
        syncHeldHud()
        hud.setExp(questManager.getExp())
        syncQuickActionAvailability()
      }
      // New chunkManager/ocean instances start with default (untinted) water —
      // resync immediately rather than waiting for the tick loop's throttled
      // apply to notice a large-enough timeOfDay delta.
      if (dayNight.enabled) gameLoop.resyncDayNight()
      player.setGround(
        bundle.chunkManager.sampleHeight,
        bundle.chunkManager.sampleFloor,
        bundle.chunkManager.waterLevel,
        bundle.chunkManager.collidersNear,
        (x, z) => sampleFootstepSurface(bundle.chunkManager, x, z),
      )
      player.setPosition(bundle.settlementsManager.home.spawn.x, bundle.settlementsManager.home.spawn.z)
      pauseMenu.setSeed(config.seed)
    } finally {
      gui.setBusy(false)
      rebuilding = false
    }
  }

  const buildSaveData = (): SaveData => ({
    version: 17,
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
    },
    savedAt: Date.now(),
    quests: {
      progress: questManager.exportProgress(),
      exp: questManager.getExp(),
      relations: questManager.exportRelations(),
    },
    inventory: inventory.toJSON(),
    collectedItemIds: [...collectedItemIds],
    droppedItems: bundle.droppedItems.nodes().map((item) => ({ ...item })),
    placedFires: bundle.placedFires.nodes().map((fire) => ({ ...fire })),
    timeOfDay: dayNight.timeOfDay,
    elapsedDays: dayNight.elapsedDays,
    heldTool: heldTool.held(),
    treeOverrides: treeLifecycle.serializeOverrides(),
    playerTorch: playerTorch.isLit() && playerTorch.source()
      ? { source: playerTorch.source()!, fuelRemaining: playerTorch.fuelRemaining() }
      : null,
    placedTents: bundle.placedTents.nodes().map((tent) => ({ ...tent })),
    placedTraps: bundle.placedTraps.nodes().map((trap) => ({ ...trap })),
    worldFlags: { ...worldFlags },
    map: { discoveredCells: mapDiscovery.serialize() },
    settlementEconomies: bundle.settlementsManager.snapshotEconomies(),
    playerNeeds: {
      hunger: player.needs.hunger.current,
      thirst: player.needs.thirst.current,
      vigor: player.needs.vigor.current,
    },
    ownedLandPlots: landOwnership.toJSON(),
    // Only XP round-trips — `value` is derived on load and `active` is
    // runtime-only (plan 128 §2).
    skills: {
      sneak: { xp: player.skills.sneak.xp },
      survival: { xp: player.skills.survival.xp },
      traps: { xp: player.skills.traps.xp },
    },
    spawnPoints: bundle.fauna.getSpawners().map((s) => ({ id: s.id, ...snapshotSpawnPointState(s) })),
  })

  const saveNow = (): void => {
    void writeSave(buildSaveData())
  }

  const updateSkyFromGui = () => {
    dayNight.enabled = false
    sky.setParams(config.sky, lights.sun)
    saveWorld(config)
  }

  const syncQualityLabel = () => {
    config.quality.preset = matchQualityPreset(knobsFromConfig(config))
  }

  const applyLiveGraphics = () => {
    postProcessing.applyConfig(config.postProcessing)
    bundle.ocean.setReflections(config.postProcessing.waterReflections)
    bundle.chunkManager.setWaterReflections(config.postProcessing.waterReflections)
    const pixelRatio = Math.min(window.devicePixelRatio, config.postProcessing.pixelRatioCap)
    renderer.setPixelRatio(pixelRatio)
    postProcessing.setPixelRatio(pixelRatio)
    lights.setShadowMapSize(config.postProcessing.shadowMapSize)
    bundle.chunkManager.setTerrainCastsShadow(config.postProcessing.terrainCastsShadow)
    bundle.chunkManager.setLodScale(config.quality.lodScale)
  }

  const updatePostProcessingFromGui = () => {
    postProcessing.applyConfig(config.postProcessing)
    bundle.ocean.setReflections(config.postProcessing.waterReflections)
    bundle.chunkManager.setWaterReflections(config.postProcessing.waterReflections)
    syncQualityLabel()
    saveGraphics(config)
  }

  // Separate from `updatePostProcessingFromGui`: this one reallocates the
  // renderer's drawing buffer + every composer render target, so it must not
  // run on every bloom/AO slider tick — only when the render-scale control
  // itself changes (perf review A3.2).
  const updateRenderQualityFromGui = () => {
    const pixelRatio = Math.min(window.devicePixelRatio, config.postProcessing.pixelRatioCap)
    renderer.setPixelRatio(pixelRatio)
    postProcessing.setPixelRatio(pixelRatio)
    syncQualityLabel()
    saveGraphics(config)
  }

  // Separate from `updatePostProcessingFromGui`: applies to `ChunkManager`'s
  // already-loaded chunk meshes, not the post-processing composer (perf
  // review A2/#13). Reads `bundle.chunkManager` fresh each call rather than
  // capturing it, since `rebuildWorld` replaces that field on the same
  // `bundle` object (see `WorldBundle` lifecycle note in CLAUDE.md).
  const updateTerrainShadowFromGui = () => {
    bundle.chunkManager.setTerrainCastsShadow(config.postProcessing.terrainCastsShadow)
    syncQualityLabel()
    saveGraphics(config)
  }

  const updateShadowMapFromGui = () => {
    lights.setShadowMapSize(config.postProcessing.shadowMapSize)
    syncQualityLabel()
    saveGraphics(config)
  }

  const updateLodScaleFromGui = () => {
    bundle.chunkManager.setLodScale(config.quality.lodScale)
    syncQualityLabel()
    saveGraphics(config)
  }

  const applyNamedQualityPreset = (preset: Exclude<QualityPreset, 'Custom'>) => {
    applyQualityPreset(config, preset)
    applyLiveGraphics()
    saveGraphics(config)
  }

  const onQualityPresetChange = (preset: QualityPreset) => {
    if (preset === 'Custom') {
      config.quality.preset = 'Custom'
      saveGraphics(config)
      return
    }
    applyNamedQualityPreset(preset)
  }

  const onDayNightChange = () => {
    if (dayNight.enabled) gameLoop.resyncDayNight()
  }
  // Shared with the World config screen (`ui-vue/screens/WorldConfigScreen.vue`)
  // via `configureWorldConfigScreen` below — same costly-rebuild handler as
  // debug GUI's seed/flat-shading controls, not a second implementation.
  const onTerrainChange = () => {
    void rebuildWorld()
  }

  const benchmark = createBenchmarkRunner({
    config,
    chunkManager: bundle.chunkManager,
    home: () => {
      const def = bundle.settlementsManager.getHomeDef()
      return { x: def.x, z: def.z }
    },
    dayNight,
    player,
    monitor: perfMonitor,
    applyQualityPreset: applyNamedQualityPreset,
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
    onSkyChange: updateSkyFromGui,
    onDayNightChange,
    onPostProcessingChange: updatePostProcessingFromGui,
    onRenderQualityChange: updateRenderQualityFromGui,
    onTerrainShadowChange: updateTerrainShadowFromGui,
    onDumpVillagePlan: () => {
      console.log(summarizeVillagePlan(bundle.settlementsManager.getHomeDef().plan))
    },
    onQualityPresetChange,
    onShadowMapSizeChange: updateShadowMapFromGui,
    onLodScaleChange: updateLodScaleFromGui,
    onPerfTimingsToggle: (enabled) => { perfMonitor.setSource('gui', enabled) },
    onRunBenchmark: (id) => { void benchmark.run(id) },
  })
  if (config.showGui) gui.toggle()
  vueUi.configureWorldConfigScreen(config, dayNight, {
    onTerrainChange,
    onDayNightChange,
    onPostProcessingChange: updatePostProcessingFromGui,
    onRenderQualityChange: updateRenderQualityFromGui,
    onTerrainShadowChange: updateTerrainShadowFromGui,
    onQualityPresetChange,
    onShadowMapSizeChange: updateShadowMapFromGui,
    onLodScaleChange: updateLodScaleFromGui,
  })

  // Created before pauseMenu so their Escape listeners register first — see
  // createNpcDialog's onKeyDown comment for why registration order matters here.
  const npcDialog = createNpcDialog(container)
  const questLog = createQuestLog(container)

  /** Drops the whole carried stack of `kind` back into the world at the
   *  player's feet, scattered slightly — the "Wyrzuć" action in
   *  `createInventoryScreen.ts`. Re-`refresh()`es the (already-open) screen
   *  immediately since world simulation is frozen while it's open (see the
   *  tick loop's modal-gating below) — nothing else will update it. */
  const dropItemStack = (kind: ItemKind): void => {
    const count = inventory.count(kind)
    if (count <= 0) return
    inventory.remove(kind, count)
    heldTool.syncWithInventory()
    if (playerTorch.isLit() && playerTorch.source() === 'wooden_torch' && heldTool.held() !== 'wooden_torch') {
      playerTorch.extinguish()
    }
    for (let i = 0; i < count; i++) {
      const angle = i * ((Math.PI * 2) / count)
      bundle.droppedItems.drop(
        kind,
        player.mesh.position.x + Math.cos(angle) * 0.6,
        player.mesh.position.z + Math.sin(angle) * 0.6,
      )
    }
    playInventoryDrop(worldAudio.playOnce)
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    syncHeldHud()
    syncQuickActionAvailability()
    inventoryScreen.refresh(inventory.toJSON(), inventory.totalWeight(), inventory.maxWeight, heldTool.held())
  }

  const equipTool = (kind: ItemKind): void => {
    if (playerTorch.isLit()) playerTorch.extinguish()
    if (!heldTool.equip(kind)) return
    syncHeldHud()
    inventoryScreen.refresh(inventory.toJSON(), inventory.totalWeight(), inventory.maxWeight, heldTool.held())
  }
  const unequipTool = (): void => {
    if (playerTorch.isLit()) playerTorch.extinguish()
    heldTool.unequip()
    syncHeldHud()
    inventoryScreen.refresh(inventory.toJSON(), inventory.totalWeight(), inventory.maxWeight, heldTool.held())
  }

  const inventoryScreen = createInventoryScreen(container, {
    onDrop: dropItemStack,
    onEquip: equipTool,
    onUnequip: unequipTool,
    onConsume: (kind) => consumeItem(kind),
  })

  const {
    buildSimpleFire, buildFirePit, lightBranch, lightWoodenTorch,
    canBuildSimpleFire, canBuildFirePit, canLightBranch, canLightWoodenTorch,
  } = getUserActions(
    inventory,
    bundle,
    playerTorch,
    player,
    hud,
    heldTool,
    syncHeldHud,
  )

  const timeSkip = createTimeSkip(dayNight)
  const timeSkipOverlay = createTimeSkipOverlay(container)
  const busy = createBusyAction()
  const busyOverlay = createBusyOverlay(container)
  const restCamp = createRestCampSequence(scene, player, (x, z) => bundle.chunkManager.sampleHeight(x, z))

  /** Extracted out of the `createGameLoop` deps object literal so plan 106's
   *  new consume/cook/harvest/fill actions (defined below, all outside the
   *  game loop) can call the same post-inventory-mutation sync as everything
   *  else — trade, tree chop, deposit mine, etc. */
  const onInventoryChanged = (): void => {
    heldTool.syncWithInventory()
    syncHeldHud()
    syncQuickActionAvailability()
    syncMerchantIfOpen()
  }

  const tentAimPoint = (): { x: number, z: number, yaw: number } => {
    const yaw = mouseLook.state.yaw
    return {
      x: player.mesh.position.x - Math.sin(yaw) * TENT_LENGTH,
      z: player.mesh.position.z - Math.cos(yaw) * TENT_LENGTH,
      yaw,
    }
  }

  const tentBlockers = (x: number, z: number): { x: number, z: number, radius: number }[] => {
    const blockers: { x: number, z: number, radius: number }[] = []
    for (const tree of bundle.chunkManager.getNearbyTrees({ x, z }, 8)) {
      blockers.push({ x: tree.x, z: tree.z, radius: 1.2 })
    }
    for (const settlement of bundle.settlementsManager.getLoaded()) {
      blockers.push({
        x: settlement.landmarks.well.x,
        z: settlement.landmarks.well.z,
        radius: 1.6,
      })
      for (const house of settlement.landmarks.houses) {
        blockers.push({ x: house.position.x, z: house.position.z, radius: 2.2 })
      }
    }
    return blockers
  }

  const placeTentAtAim = (): void => {
    if (!inventory.has('tent', 1) || busy.isActive() || timeSkip.isActive() || restCamp.isActive()) return
    const aim = tentAimPoint()
    const reason = evaluateTentPlacement({
      x: aim.x,
      z: aim.z,
      sampleHeight: (x, z) => bundle.chunkManager.sampleHeight(x, z),
      waterLevel: bundle.chunkManager.waterLevel,
      roads: bundle.chunkManager.roadCorridorsNear(aim.x, aim.z, 10),
      blockers: tentBlockers(aim.x, aim.z),
      otherTents: bundle.placedTents.nodes(),
    })
    if (reason !== 'ok') {
      toast.show(TENT_PLACEMENT_MESSAGE[reason], 'error')
      return
    }
    // Survival shortens the setup channel; the tent itself is only spent when
    // the channel completes, so Esc costs nothing (same as ignite/cook).
    busy.start(
      TENT_SETUP_DURATION_SEC * survivalDurationMultiplier(player.skills.survival.value),
      'Rozstawianie namiotu…',
      () => {
        if (!inventory.remove('tent', 1)) return
        bundle.placedTents.place(aim.x, aim.z, aim.yaw)
        hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
        syncQuickActionAvailability()
        awardSkillXp(player.skills, 'survival', SKILL_XP_AWARD.pitchTent)
        toast.show('Rozstawiono namiot.')
      },
    )
  }

  /** Sets a trap down in front of the player (plan 141 §3) — same busy-channel
   *  shape as pitching a tent: the item is only spent when the channel
   *  completes, and it lands `placed` (not armed), so arming stays a separate
   *  `[E]` interaction. Reuses the shared ground-suitability check, just with
   *  the trap's own footprint. */
  const placeTrapAtAim = (kind: TrapKind): void => {
    const def = TRAP_DEFS[kind]
    if (!inventory.has(def.itemKind, 1) || busy.isActive() || timeSkip.isActive() || restCamp.isActive()) return
    const yaw = mouseLook.state.yaw
    const x = player.mesh.position.x - Math.sin(yaw) * TRAP_PLACE_REACH
    const z = player.mesh.position.z - Math.cos(yaw) * TRAP_PLACE_REACH
    const reason = evaluateGroundPlacement({
      x,
      z,
      sampleHeight: (sx, sz) => bundle.chunkManager.sampleHeight(sx, sz),
      waterLevel: bundle.chunkManager.waterLevel,
      roads: bundle.chunkManager.roadCorridorsNear(x, z, 10),
      blockers: tentBlockers(x, z),
      peers: [...bundle.placedTraps.nodes(), ...bundle.placedTents.nodes()],
      footprintRadius: TRAP_FOOTPRINT_RADIUS,
      separation: TRAP_SEPARATION,
    })
    if (reason !== 'ok') {
      toast.show(TRAP_PLACEMENT_MESSAGE[reason === 'occupied' ? 'trap' : reason], 'error')
      return
    }
    busy.start(TRAP_SETUP_DURATION_SEC, 'Zastawianie pułapki…', () => {
      if (!inventory.remove(def.itemKind, 1)) return
      bundle.placedTraps.place(kind, x, z, yaw)
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      onInventoryChanged()
      toast.show(`Zastawiono: ${def.label}.`)
    })
  }

  const armTrap = (id: string): void => {
    if (busy.isActive() || timeSkip.isActive() || restCamp.isActive()) return
    // The Traps value is snapshotted here, once — the trap then works on its
    // own, with no reference back to the player (implementation notes §2).
    if (!bundle.placedTraps.activate(id, player.skills.traps.value, dayNight.elapsedDays)) return
    toast.show('Pułapka uzbrojona.')
  }

  const disarmTrap = (id: string): void => {
    if (busy.isActive() || timeSkip.isActive() || restCamp.isActive()) return
    // Disarming never costs durability (plan 141 §3).
    if (!bundle.placedTraps.deactivate(id)) return
    toast.show('Pułapka rozbrojona.')
  }

  const collectTrap = (id: string): void => {
    if (busy.isActive() || timeSkip.isActive() || restCamp.isActive()) return
    const trap = bundle.placedTraps.list().find((entry) => entry.id === id)
    if (!trap || trap.state === 'active') return
    const def = TRAP_DEFS[trap.kind]
    // A broken trap is scrap — it's cleared away, not carried back.
    if (trap.state !== 'broken' && !inventory.canAdd(def.itemKind)) {
      toast.show('Ekwipunek jest za ciężki.', 'error')
      return
    }
    const removed = bundle.placedTraps.collect(id)
    if (!removed) return
    if (removed.state === 'broken') {
      toast.show('Zniszczona pułapka nadaje się już tylko na złom.')
    } else {
      inventory.add(def.itemKind, 1)
      toast.show(`Zabrano: ${def.label}.`)
    }
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    onInventoryChanged()
  }

  // The single owner of a capture's player-facing consequences (implementation
  // notes §18) — `PlacedTraps` only kills and leaves a corpse; XP and the
  // toast are decided here, exactly once per catch.
  onTrapCaptureTarget = (event) => {
    awardSkillXp(player.skills, 'traps', SKILL_XP_AWARD.captureTrap)
    const animalLabel = ANIMAL_LABELS[event.animalKind]
    toast.show(
      event.broken
        ? `Pułapka złapała zwierzę (${animalLabel}) i się rozpadła.`
        : `Pułapka złapała zwierzę (${animalLabel}).`,
    )
  }

  /** Rest quality + XP for the sleep currently in flight (plan 128 §5-§7),
   *  resolved once when rest starts and consumed when the 8h skip finishes.
   *  Null means "no camp context" — a plain town bed, restored in full. */
  let pendingRest: { quality: number, awardsSurvivalXp: boolean } | null = null

  /** One-shot proximity lookup at rest start — never a per-frame scan. Only
   *  player-built fires count as camp warmth; a village's own campfire belongs
   *  to town rest, which is already a full night. */
  const resolveCampContext = (hasBlanket: boolean, hasTent: boolean): CampRestContext => ({
    hasBlanket,
    hasTent: hasTent || hasTentNear(
      bundle.placedTents.list(),
      player.mesh.position.x,
      player.mesh.position.z,
    ),
    hasWarmFire: hasWarmFireNear(
      bundle.placedFires.list(),
      player.mesh.position.x,
      player.mesh.position.z,
    ),
  })

  const beginCampRest = (context: CampRestContext): void => {
    pendingRest = {
      quality: campRestQuality(context, player.skills.survival.value),
      awardsSurvivalXp: true,
    }
  }

  /** Called by `gameLoop` when a `fadeStrength === 1` skip (i.e. a night's
   *  sleep) finishes. Owns both halves of the rest outcome: how much the
   *  night restored, and the Survival XP the camp earned. */
  const onSleepFinished = (): void => {
    const rest = pendingRest
    pendingRest = null
    restoreNeedsFromSleep(player.needs, rest?.quality ?? 1)
    if (rest?.awardsSurvivalXp) awardSkillXp(player.skills, 'survival', SKILL_XP_AWARD.campRest)
  }

  const startTentRest = (id: string): void => {
    if (busy.isActive() || timeSkip.isActive() || restCamp.isActive()) return
    const tent = bundle.placedTents.list().find((entry) => entry.id === id)
    if (tent) {
      const pose = tentRestPose(tent)
      player.setPosition(pose.x, pose.z)
      player.mesh.rotation.y = pose.yaw
    }
    restCamp.start({
      variant: 'tent',
      onSleepStart: () => {
        // Resolved after the pose move so the fire/tent lookup uses where the
        // player actually sleeps.
        beginCampRest(resolveCampContext(inventory.has('blanket', 1), true))
        timeSkip.start(8, { fadeStrength: 1, label: 'Odpoczywasz w namiocie...' })
      },
      onComplete: () => {},
    })
  }

  const packTent = (id: string): void => {
    if (busy.isActive() || timeSkip.isActive() || restCamp.isActive()) return
    if (!inventory.canAdd('tent')) {
      toast.show('Ekwipunek jest za ciężki.', 'error')
      return
    }
    const packed = bundle.placedTents.pack(id)
    if (!packed) return
    inventory.add('tent', 1)
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    syncQuickActionAvailability()
    toast.show('+1 Namiot', 'pickup')
  }

  const abortRest = (): boolean => {
    const resting = restCamp.isActive() || timeSkip.fadeStrength() === 1
    if (!resting) return false
    // Aborted rest earns nothing and resolves no quality (plan 128 edge cases).
    pendingRest = null
    timeSkip.cancel()
    timeSkipOverlay.hide()
    busyOverlay.hide()
    restCamp.cancel()
    player.standUp()
    return true
  }
  vueUi.configureAbortRest(abortRest)

  /** Esc during a `busy` channel (fire-lighting, cooking, butchering, …) —
   *  cancels without running `onComplete`, so nothing is consumed/produced. */
  const abortBusy = (): boolean => {
    if (!busy.isActive()) return false
    busy.cancel()
    busyOverlay.hide()
    return true
  }
  vueUi.configureAbortBusy(abortBusy)

  const isNearTown = (): boolean => bundle.settlementsManager
    .getLoaded()
    .some((s) => s.center.distanceTo(player.mesh.position) <= REST_IN_TOWN_RADIUS)
  const syncNearTownQuickActions = (): void => {
    vueUi.setQuickActionsNearTown(isNearTown())
  }

  const digFeedback = () => ({
    inventory,
    droppedItems: bundle.droppedItems,
    toast,
    hud,
    playOnce: worldAudio.playOnce,
  })

  const aimGroundPoint = (): { x: number, z: number } => ({
    x: player.mesh.position.x - Math.sin(mouseLook.state.yaw) * DIG_REACH,
    z: player.mesh.position.z - Math.cos(mouseLook.state.yaw) * DIG_REACH,
  })

  const startDigAt = (x: number, z: number): void => {
    if (!inventory.has('shovel', 1) || busy.isActive() || timeSkip.isActive() || restCamp.isActive()) return
    const profile = getDigProfileAt(x, z, bundle.chunkManager)
    if (!profile) {
      toast.show('Tu nie da się kopać.', 'error')
      return
    }
    playActionDig(worldAudio.playOnce)
    busy.start(DIG_DURATION_SEC, 'Kopanie…', () => {
      applyDigAt(bundle.chunkManager, x, z, profile, digFeedback())
      syncQuickActionAvailability()
    })
  }

  const startPickaxeDigAt = (x: number, z: number): void => {
    if (heldTool.held() !== 'pickaxe' || busy.isActive() || timeSkip.isActive() || restCamp.isActive()) return
    const profile = getRockDigProfileAt(x, z, bundle.chunkManager)
    if (!profile) {
      toast.show('Tu nie da się kopać kilofem.', 'error')
      return
    }
    playActionMine(worldAudio.playAt, { x, z })
    busy.start(DIG_DURATION_SEC, 'Kucie…', () => {
      applyDigAt(bundle.chunkManager, x, z, profile, digFeedback())
      syncQuickActionAvailability()
    })
  }

  const startLevelAt = (x: number, z: number): void => {
    if (!inventory.has('shovel', 1) || busy.isActive() || timeSkip.isActive() || restCamp.isActive()) return
    if (isRockGround(x, z, bundle.chunkManager)) {
      toast.show('Łopata nie bierze skały.', 'error')
      return
    }
    if (!canLevelAt(x, z, bundle.chunkManager)) {
      toast.show('Nie ma tu czego wyrównać.', 'error')
      return
    }
    busy.start(DIG_DURATION_SEC, 'Wyrównywanie…', () => {
      applyLevelAt(bundle.chunkManager, x, z, toast)
    })
  }

  const startPickaxeLevelAt = (x: number, z: number): void => {
    if (heldTool.held() !== 'pickaxe' || busy.isActive() || timeSkip.isActive() || restCamp.isActive()) return
    if (!isRockGround(x, z, bundle.chunkManager) || !canLevelAt(x, z, bundle.chunkManager)) {
      toast.show('Nie ma tu czego wyrównać.', 'error')
      return
    }
    busy.start(DIG_DURATION_SEC, 'Wyrównywanie…', () => {
      applyLevelAt(bundle.chunkManager, x, z, toast)
    })
  }

  const startBuryCorpse = (animal: AnimalAgent): void => {
    if (heldTool.held() !== 'shovel' || busy.isActive() || timeSkip.isActive()) return
    if (!animal.isDead() || animal.readyToRemove()) return
    playActionDig(worldAudio.playOnce)
    busy.start(BURY_DURATION_SEC, 'Zakopywanie…', () => {
      if (!animal.isDead() || animal.readyToRemove()) return
      animal.bury()
      toast.show('Zwłoki zakopane.')
    })
  }

  /** Knife-harvest meat from a corpse (plan 106; species-specific kind +
   *  hide byproduct added in plan 134) — same shape as `startBuryCorpse`,
   *  just knife-gated and yielding item(s) instead of disposing the corpse. */
  const startHarvestMeat = (animal: AnimalAgent): void => {
    if (busy.isActive() || timeSkip.isActive() || restCamp.isActive()) return
    if (heldTool.held() !== 'knife') {
      // Auto-equip from inventory (plan 153) — same pattern as
      // `lightWoodenTorch` in `userActions.ts`: only when the hand is free,
      // never displacing another held tool.
      if (heldTool.held() !== null) return
      if (!heldTool.equip('knife')) return
      syncHeldHud()
    }
    if (!animal.canHarvestMeat()) return
    const meatKind = meatKindForAnimal(animal.def.kind)
    if (!inventory.canAdd(meatKind, 1)) {
      toast.show('Ekwipunek jest za ciężki.', 'error')
      return
    }
    animal.holdCorpse()
    busy.start(HARVEST_MEAT_DURATION_SEC, 'Wycinanie mięsa…', () => {
      try {
        if (!animal.canHarvestMeat() || !inventory.canAdd(meatKind, 1)) return
        animal.harvestMeat()
        inventory.add(meatKind, 1)
        let message = `+1 ${ITEM_DEFS[meatKind].label}`
        if (inventory.canAdd('hide', 1)) {
          inventory.add('hide', 1)
          message += ', +1 skóra'
        }
        playInventoryPickUp(worldAudio.playOnce)
        hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
        onInventoryChanged()
        toast.show(message, 'pickup')
      } finally {
        animal.releaseCorpseHold()
      }
    }, { blurred: true, onCancel: () => animal.releaseCorpseHold() })
  }

  /** Lights an unlit campfire (busy channel, blurred) — "dołóż gałąź" on an
   *  already-lit fire stays instant/inline in `gameLoop.ts`, not routed
   *  through here. */
  const startIgniteFire = (fire: VillageFire): void => {
    if (busy.isActive() || timeSkip.isActive() || restCamp.isActive()) return
    if (!inventory.has('firestarter', 1)) {
      toast.show('Potrzebujesz krzesiwa, żeby rozpalić ogień.', 'error')
      return
    }
    if (!inventory.has('branch', 1)) {
      toast.show('Potrzebujesz gałęzi, żeby je zapalić.', 'error')
      return
    }
    // Survival is read once, when the channel starts — a running channel is
    // never retimed (plan 128 §3.1).
    const duration = IGNITE_DURATION_SEC * survivalDurationMultiplier(player.skills.survival.value)
    busy.start(duration, 'Rozpalanie ogniska…', () => {
      if (fire.isLit() || !inventory.remove('branch', 1)) return
      fire.light()
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      onInventoryChanged()
      awardSkillXp(player.skills, 'survival', SKILL_XP_AWARD.igniteFire)
      toast.show('Ognisko zapłonęło.')
    }, { blurred: true })
  }

  /** `[E] Zniszcz` on a `depleted` spawn point (plan 137) — busy channel with
   *  progress bar; branches are spent only on complete (Esc is a no-op). */
  const startDestroySpawner = (spawner: PreySpawner): void => {
    if (busy.isActive() || timeSkip.isActive() || restCamp.isActive()) return
    if (spawner.state !== 'depleted') return
    if (!inventory.has('branch', SPAWNER_DESTROY_BRANCH_COST)) {
      toast.show('Potrzebujesz 4 gałęzi.', 'error')
      return
    }
    busy.start(DESTROY_SPAWNER_DURATION_SEC, 'Podpalanie siedliska…', () => {
      if (spawner.state !== 'depleted') {
        toast.show('Nie można już tego zniszczyć.', 'error')
        return
      }
      if (!inventory.remove('branch', SPAWNER_DESTROY_BRANCH_COST)) {
        toast.show('Potrzebujesz 4 gałęzi.', 'error')
        return
      }
      if (!bundle.fauna.destroySpawner(spawner.id, dayNight.elapsedDays)) {
        inventory.add('branch', SPAWNER_DESTROY_BRANCH_COST)
        toast.show('Nie można już tego zniszczyć.', 'error')
        return
      }
      // 4 consumed branches become the pit's fuel: `light` sets one branch of
      // fuel, then three `addFuel` calls bring it to ~300 s (`FUEL_PER_BRANCH`).
      const entry = bundle.placedFires.place(spawner.x, spawner.z, 'pit', { habitatBurn: true })
      entry.fire.light('player')
      entry.fire.addFuel()
      entry.fire.addFuel()
      entry.fire.addFuel()
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      onInventoryChanged()
      toast.show('Siedlisko zniszczone.', 'pickup')
    }, { blurred: true })
  }

  /** Cooks the first held recipe's input at a lit campfire (plan 106 §6). */
  const startCookAt = (fire: VillageFire): void => {
    if (busy.isActive() || timeSkip.isActive() || restCamp.isActive()) return
    if (!fire.isLit()) {
      toast.show('Ognisko musi się palić.', 'error')
      return
    }
    const recipe = findCookingRecipe(inventory)
    if (!recipe) {
      toast.show('Potrzebujesz surowego mięsa.', 'error')
      return
    }
    if (!inventory.canAdd(recipe.output, recipe.count)) {
      toast.show('Ekwipunek jest za ciężki.', 'error')
      return
    }
    busy.start(COOK_DURATION_SEC, 'Pieczenie mięsa…', () => {
      if (!fire.isLit()) {
        toast.show('Ogień zgasł.', 'error')
        return
      }
      if (!inventory.canAdd(recipe.output, recipe.count) || !inventory.remove(recipe.input, 1)) {
        toast.show('Ekwipunek jest za ciężki.', 'error')
        return
      }
      inventory.add(recipe.output, recipe.count)
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      onInventoryChanged()
      awardSkillXp(player.skills, 'survival', SKILL_XP_AWARD.cookMeat)
      toast.show(`+${recipe.count} ${ITEM_DEFS[recipe.output].label}`, 'pickup')
    }, { blurred: true })
  }

  /** Instant drink at a well/lake (plan 106 §4) — no busy channel, matching
   *  other instant world actions (item pickup). */
  const drinkFromWaterSource = (source: WaterSource): void => {
    if (busy.isActive() || timeSkip.isActive() || restCamp.isActive()) return
    drinkWaterNeeds(player.needs, DRINK_THIRST_RELIEF)
    playActionWell(worldAudio.playAt, player.mesh.position)
    toast.show(source.quality === 'unsafe' ? UNSAFE_WATER_WARNING : 'Napito się wody.', source.quality === 'unsafe' ? 'error' : undefined)
  }

  /** Instant fill of a carried empty waterskin (plan 106 §4). Removes the
   *  empty one first, then adds the full one — if the (heavier) full
   *  waterskin doesn't fit, the empty one is refunded rather than lost. */
  const fillWaterskin = (): void => {
    if (busy.isActive() || timeSkip.isActive() || restCamp.isActive()) return
    if (!inventory.remove('waterskin_empty', 1)) {
      toast.show('Potrzebujesz pustego bukłaka.', 'error')
      return
    }
    if (!inventory.add('waterskin_full', 1)) {
      inventory.add('waterskin_empty', 1)
      toast.show('Ekwipunek jest za ciężki.', 'error')
      return
    }
    playActionWell(worldAudio.playAt, player.mesh.position)
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    onInventoryChanged()
    toast.show('Napełniono bukłak.', 'pickup')
  }

  /** Inventory-screen "Zjedz"/"Wypij" (plan 106) — driven by
   *  `ITEM_CATALOG[kind].consumable`, the same catalog entry the well/lake/
   *  cooking paths' relief amounts come from. */
  const consumeItem = (kind: ItemKind): void => {
    const entry = ITEM_CATALOG[kind].consumable
    if (!entry || !inventory.remove(kind, 1)) return
    if (entry.resultKind) inventory.add(entry.resultKind, 1)
    // Plan 128 §4 — Survival makes the *same* `roasted_meat` more nourishing;
    // no roasted variants, no skill-dependent recipes.
    const relief = kind === 'roasted_meat'
      ? entry.relief * survivalFoodMultiplier(player.skills.survival.value)
      : entry.relief
    if (entry.need === 'hunger') eatFood(player.needs, relief)
    else if (entry.need === 'thirst') drinkWaterNeeds(player.needs, relief)
    else healHealth(player.health, relief)
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    onInventoryChanged()
    inventoryScreen.refresh(inventory.toJSON(), inventory.totalWeight(), inventory.maxWeight, heldTool.held())
    toast.show(entry.need === 'hunger' ? 'Zjedzono.' : entry.need === 'thirst' ? 'Wypito.' : 'Opatrzono rany.', 'pickup')
  }

  const startTreeChop = (treeId: string, x: number, z: number): void => {
    if (heldTool.held() !== 'axe' || busy.isActive() || timeSkip.isActive()) return
    // Pre-check choppability without mutating — advanceHarvest is the authority.
    const nearby = bundle.chunkManager.getNearbyTrees({ x, z }, 0.5)
    const target = nearby.find((t) => t.id === treeId)
    if (!target || !isChoppableStage(target.stage)) {
      toast.show('To drzewo nie nadaje się do ścięcia.', 'error')
      return
    }
    const stepYield = yieldForChopStage(target.stage)
    if (!stepYield || !inventory.canAdd(stepYield.kind, stepYield.count)) {
      toast.show('Ekwipunek jest za ciężki.', 'error')
      return
    }
    const busyLabel =
      target.stage === 'mature' || target.stage === 'old'
        ? 'Oczyszczanie…'
        : target.stage === 'limbed'
          ? 'Ścinanie…'
          : 'Rąbanie…'
    playActionChop(worldAudio.playAt, { x, z })
    busy.start(CHOP_DURATION_SEC, busyLabel, () => {
      if (!inventory.canAdd(stepYield.kind, stepYield.count)) {
        toast.show('Ekwipunek jest za ciężki.', 'error')
        return
      }
      const landmark = bundle.settlementsManager
        .getLoaded()
        .flatMap((s) => s.landmarks.trees)
        .find((t) => t.id === treeId)
      const result = advanceWorldTreeHarvest(
        treeLifecycle,
        treeId,
        dayNight.elapsedDays,
        bundle.chunkManager.sampleTreeEnv(x, z),
        landmark
          ? { landmark }
          : { refreshChunkVisual: (id) => bundle.chunkManager.refreshTreeVisual(id) },
      )
      if (!result.ok) {
        toast.show(
          result.reason === 'not-choppable' || result.reason === 'already-harvested'
            ? 'To drzewo nie nadaje się do ścięcia.'
            : 'Nie udało się ściąć drzewa.',
          'error',
        )
        return
      }
      inventory.add(result.yield.kind, result.yield.count)
      playInventoryPickUp(worldAudio.playOnce)
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      heldTool.syncWithInventory()
      syncHeldHud()
      syncQuickActionAvailability()
      toast.show(`+${result.yield.count} Gałąź`, 'pickup')
    })
  }

  const startDepositMine = (depositId: string, x: number, z: number): void => {
    if (heldTool.held() !== 'pickaxe' || busy.isActive() || timeSkip.isActive() || restCamp.isActive()) return
    const target = bundle.resourceDeposits.queryNearest(x, z, 0.75)
    if (!target || target.id !== depositId || target.remaining <= 0) {
      toast.show('Tu nie ma już czego wydobywać.', 'error')
      return
    }
    const stepYield = yieldForOre(target.type)
    if (!inventory.canAdd(stepYield.kind, stepYield.count)) {
      toast.show('Ekwipunek jest za ciężki.', 'error')
      return
    }
    playActionMine(worldAudio.playAt, { x, z })
    busy.start(MINE_DURATION_SEC, 'Wydobywanie…', () => {
      if (!inventory.canAdd(stepYield.kind, stepYield.count)) {
        toast.show('Ekwipunek jest za ciężki.', 'error')
        return
      }
      const result = bundle.resourceDeposits.mine(depositId)
      if (!result.ok) {
        toast.show('Tu nie ma już czego wydobywać.', 'error')
        return
      }
      inventory.add(result.yield.kind, result.yield.count)
      playInventoryPickUp(worldAudio.playOnce)
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      heldTool.syncWithInventory()
      syncHeldHud()
      toast.show(`+${result.yield.count} ${ITEM_DEFS[result.yield.kind].label}`, 'pickup')
    })
  }

  /** When quick actions opened under pointer lock, restore lock on close so
   *  camera look resumes without requiring an extra canvas click. */
  let restorePointerLockAfterQuickActions = false
  const quickActions = createQuickActions(container, {
    hasShovel: inventory.has('shovel', 1),
    hasTent: inventory.has('tent', 1),
    nearTown: isNearTown(),
    onOpen: () => {
      restorePointerLockAfterQuickActions = exitGamePointerLock(renderer.domElement)
      syncNearTownQuickActions()
    },
    onClose: () => {
      if (!restorePointerLockAfterQuickActions) return
      restorePointerLockAfterQuickActions = false
      requestGamePointerLock(renderer.domElement)
    },
    onBuildSimpleFire: buildSimpleFire,
    onBuildFirePit: buildFirePit,
    onLightBranch: lightBranch,
    onLightWoodenTorch: lightWoodenTorch,
    onWait: (hours) => {
      if (busy.isActive() || timeSkip.isActive() || restCamp.isActive()) return
      timeSkip.start(hours, { fadeStrength: 0.5, label: `Czekasz... (${hours}h)` })
    },
    onRest: (variant) => {
      if (busy.isActive() || timeSkip.isActive() || restCamp.isActive()) return 'ok'
      if (!inventory.has('blanket', 1)) return 'no-blanket'
      if (variant === 'town') {
        if (!isNearTown()) return 'too-far'
        player.lieDown()
        timeSkip.start(8, {
          fadeStrength: 1,
          label: 'Odpoczywasz w mieście...',
        })
        return 'ok'
      }
      restCamp.start({
        onSleepStart: () => {
          // The quick action already required a blanket; the tent/fire halves
          // of the camp come from what's actually pitched/lit around here.
          beginCampRest(resolveCampContext(true, false))
          timeSkip.start(8, {
            fadeStrength: 1,
            label: 'Rozbijasz obóz...',
          })
        },
        onComplete: () => {},
      })
      return 'ok'
    },
    onDig: () => {
      const p = aimGroundPoint()
      startDigAt(p.x, p.z)
    },
    onLevel: () => {
      const p = aimGroundPoint()
      startLevelAt(p.x, p.z)
    },
    onPlaceTent: placeTentAtAim,
    onPlaceTrap: placeTrapAtAim,
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
    )
  }
  const openInventory = () => {
    exitGamePointerLock(renderer.domElement)
    inventoryScreen.open()
    inventoryScreen.refresh(inventory.toJSON(), inventory.totalWeight(), inventory.maxWeight, heldTool.held())
  }
  const openSkills = () => {
    exitGamePointerLock(renderer.domElement)
    vueUi.openSkillsScreen()
  }

  const pauseMenu = createPauseMenu(container, config.seed, config.player.name, {
    onPause: () => {
      exitGamePointerLock(renderer.domElement)
    },
    onResume: () => {},
    onQuestLog: openQuestLog,
    onVillagers: openVillagers,
    onInventory: openInventory,
    onWorldMap: () => {
      vueUi.openWorldMap(player.mesh.position.x, player.mesh.position.z)
    },
    onToggleGui: () => gui.toggle(),
    onNameChange: (name) => player.setName(name),
    onNameCommit: (name) => {
      config.player.name = name
      savePlayer(config)
    },
    onSave: saveNow,
    onRefresh: () => window.location.reload(),
    onBuildSimpleFire: buildSimpleFire,
    onBuildFirePit: buildFirePit,
    onLightBranch: lightBranch,
    onLightWoodenTorch: lightWoodenTorch,
    onNewGame: () => {
      if (!window.confirm('Rozpocząć nową grę? Zapisany postęp zostanie usunięty.')) return
      void clearSave()
      config.seed = randomSeed()
      void rebuildWorld(true)
    },
  }, () => vueUi.isNpcDialogueMenuOpen())

  touchControls = isTouchDevice()
    ? createTouchControls(container, keyboard.state, mouseLook.state, {
        // Guard against the ☰ button opening the pause overlay on top of
        // another already-open full-screen modal (npc dialog/quest log/
        // villagers) — those don't disable the button the way they disable
        // the rest of the touch layer, since it now lives outside
        // .seedvale-touch (see the top-right cluster below).
        onPauseToggle: () => {
          if (
            !npcDialog.isOpen() &&
            !questLog.isOpen() &&
            !vueUi.isVillagersOpen() &&
            !inventoryScreen.isOpen() &&
            !vueUi.isNpcDialogueMenuOpen() &&
            !vueUi.isWorldConfigScreenOpen() &&
            !vueUi.isNotesOpen()
          ) {
            pauseMenu.togglePause()
          }
        },
        onQuickActions: () => {
          if (
            !npcDialog.isOpen() &&
            !questLog.isOpen() &&
            !vueUi.isVillagersOpen() &&
            !inventoryScreen.isOpen() &&
            !vueUi.isNpcDialogueMenuOpen() &&
            !vueUi.isWorldConfigScreenOpen() &&
            !vueUi.isNotesOpen()
          ) {
            quickActions.toggle()
          }
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

  // `beforeunload` alone isn't enough on mobile: Android (and iOS) routinely
  // suspend/kill a backgrounded PWA/tab without ever firing it — the reported
  // failure mode ("collected items, reopened, gone") is exactly that. The
  // reliable moment to persist is when the page is about to be hidden, not
  // when it's about to close: `visibilitychange`→hidden fires the instant the
  // user switches away (before the OS gets a chance to kill the process), and
  // `pagehide` covers navigation/bfcache cases visibilitychange can miss.
  // `beforeunload` stays too — free extra coverage on desktop.
  window.addEventListener('beforeunload', saveNow)
  const onVisibilityChange = () => {
    if (document.hidden) saveNow()
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pagehide', saveNow)
  // Defense in depth in case the app is killed with no lifecycle event at
  // all (rare, but seen on some Android OEMs) — bounds how much progress a
  // worst-case loss can cost.
  const autoSaveInterval = window.setInterval(saveNow, 60_000)

  const gameLoop = createGameLoop({
    bundle, player, camera, renderer, labelRenderer, scene, sky, lights, postProcessing, dayNight,
    climate, weatherParticles, weatherAudio, getSeed: () => config.seed,
    keyboard, mouseLook, touchControls, pauseMenu, npcDialog, questLog, vueUi, inventoryScreen,
    quickActions, timeSkip, timeSkipOverlay, busy, busyOverlay, restCamp, inventory, heldTool, landOwnership, toast, hud,
    questManager, ambientAudio, fireAudio, houseDoors, worldAudio, playerTorch, minimap, mapDiscovery, openQuestLog, openInventory, openSkills,
    startGroundWork: (mode, x, z) => {
      if (heldTool.held() === 'pickaxe') {
        if (mode === 'level') startPickaxeLevelAt(x, z)
        else startPickaxeDigAt(x, z)
      } else if (mode === 'level') startLevelAt(x, z)
      else startDigAt(x, z)
    },
    startTreeChop,
    startDepositMine,
    startBuryCorpse,
    startHarvestMeat,
    startCookAt,
    startIgniteFire,
    startDestroySpawner,
    drinkFromWaterSource,
    fillWaterskin,
    consumeItem,
    startTentRest,
    packTent,
    armTrap,
    disarmTrap,
    collectTrap,
    onSleepFinished,
    onInventoryChanged,
    setFrameTiming: gui.setFrameTiming,
    syncPointLightBudget: () => { pointLightBudget.sync(camera) },
  })
  gameLoop.resyncDayNight()

  let frameId = 0
  let lastViewportWidth = -1
  let lastViewportHeight = -1
  let resizeScheduled = false
  let webglContextLost = false
  const cameraDebug = isCameraDebugMode() ? createCameraDebugOverlay(container) : null
  // Sticky event log for the camdebug overlay — a live snapshot alone misses
  // anything shorter than its 250ms refresh, which is exactly the failure
  // mode we're trying to diagnose (issue 032: sporadic black-world blinks).
  // No-op (never allocated/pushed to) when cameraDebug is null.
  const MAX_DEBUG_EVENTS = 6
  const debugEvents: string[] = []
  let contextLostAt: number | null = null
  let lastCameraStateInvalid = false
  const pushDebugEvent = (label: string): void => {
    if (!cameraDebug) return
    const t = (performance.now() / 1000).toFixed(1)
    debugEvents.push(`[${t}s] ${label}`)
    if (debugEvents.length > MAX_DEBUG_EVENTS) debugEvents.shift()
  }
  // Issue 032 follow-up: EffectComposer + N8AO + UnrealBloomPass allocate ~15
  // HalfFloatType/FloatType render targets. Rendering into them needs
  // EXT_color_buffer_half_float / EXT_color_buffer_float; without it a mobile
  // driver can leave the framebuffer incomplete (or silently downgrade the
  // attachment) with no WebGL API error and no context loss — matching the
  // reported symptom (black 3D canvas, UI intact, `gl error NONE`,
  // `contextLost false`). Logged once so the next repro's `events:` section
  // can confirm or rule this out.
  if (cameraDebug) {
    const halfFloatRt = renderer.extensions.has('EXT_color_buffer_half_float')
    const floatRt = renderer.extensions.has('EXT_color_buffer_float')
    pushDebugEvent(`float RT support: half=${halfFloatRt} full=${floatRt}`)
  }

  const applyViewportSize = (force = false) => {
    let width = container.clientWidth
    let height = container.clientHeight
    if (width < MIN_RENDERER_SIZE || height < MIN_RENDERER_SIZE) {
      pushDebugEvent(`invalid viewport ${width}x${height} (force=${force})`)
      if (!force || lastViewportWidth < MIN_RENDERER_SIZE) return
      width = lastViewportWidth
      height = lastViewportHeight
    }
    if (!force && !shouldApplyRendererResize(width, height, lastViewportWidth, lastViewportHeight)) {
      return
    }
    lastViewportWidth = Math.round(width)
    lastViewportHeight = Math.round(height)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height)
    labelRenderer.setSize(width, height)
    postProcessing.setSize(width, height)
  }
  const requestResize = () => {
    if (resizeScheduled) return
    resizeScheduled = true
    requestAnimationFrame(() => {
      resizeScheduled = false
      applyViewportSize()
    })
  }
  window.addEventListener('resize', requestResize)
  // Mobile browsers resize the *visual* viewport (address bar show/hide,
  // on-screen keyboard) without always firing a plain window 'resize' — and
  // orientation changes on some Android WebViews fire neither reliably.
  // Covering both keeps the canvas from getting stuck at a stale size
  // (reported: Chrome mobile rendering only into half the screen width after
  // the initial address-bar layout settled).
  // Coalesce + skip 0-size blips: visualViewport fires continuously while the
  // address bar animates, and a 0-height composer target reads as a black
  // world while the DOM UI keeps working.
  window.addEventListener('orientationchange', requestResize)
  window.visualViewport?.addEventListener('resize', requestResize)
  const onOrientationSettled = () => { window.setTimeout(requestResize, 250) }
  window.addEventListener('orientationchange', onOrientationSettled)
  // Defensive re-measure a couple frames after first paint, in case the very
  // first `container.clientWidth/clientHeight` read (used above to size the
  // renderer/camera) happened before the mobile browser's chrome/address-bar
  // layout had fully settled.
  requestAnimationFrame(() => requestAnimationFrame(requestResize))

  const canvas = renderer.domElement
  const onWebglContextLost = () => {
    webglContextLost = true
    contextLostAt = performance.now()
    pushDebugEvent('contextLost')
    console.warn('[renderer] WebGL context lost')
  }
  const onWebglContextRestored = () => {
    webglContextLost = false
    const durationMs = contextLostAt !== null ? performance.now() - contextLostAt : -1
    contextLostAt = null
    pushDebugEvent(`contextRestored after ${durationMs.toFixed(0)}ms`)
    console.warn(`[renderer] WebGL context restored after ${durationMs.toFixed(0)}ms — reallocating composer targets`)
    applyViewportSize(true)
  }
  canvas.addEventListener('webglcontextlost', onWebglContextLost)
  canvas.addEventListener('webglcontextrestored', onWebglContextRestored)

  const tick = () => {
    frameId = requestAnimationFrame(tick)
    gameLoop.tick()
    if (cameraDebug) {
      const posFinite =
        Number.isFinite(camera.position.x) &&
        Number.isFinite(camera.position.y) &&
        Number.isFinite(camera.position.z)
      const aspectFinite = Number.isFinite(camera.aspect) && camera.aspect > 0
      const invalid = !posFinite || !aspectFinite
      if (invalid && !lastCameraStateInvalid) {
        pushDebugEvent(
          `camera invalid: pos=(${camera.position.x},${camera.position.y},${camera.position.z}) aspect=${camera.aspect}`,
        )
      }
      lastCameraStateInvalid = invalid
      cameraDebug.update({
        camera,
        renderer,
        scene,
        sampleHeight: (x, z) => bundle.chunkManager.sampleHeight(x, z),
        contextLost: webglContextLost,
        events: debugEvents,
        renderStateText: isRenderStateDebugMode() ? getRenderStateDebugText() : null,
      })
    }
  }
  tick()
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
  }))
  const autoBench = benchmarkScenarioFromUrl()
  if (typeof window !== 'undefined') {
    window.__seedvaleRunBenchmark = (id, durationSec) => benchmark.run(id, durationSec)
  }
  if (autoBench) void benchmark.run(autoBench)

  return () => {
    cancelAnimationFrame(frameId)
    window.removeEventListener('resize', requestResize)
    window.removeEventListener('orientationchange', requestResize)
    window.removeEventListener('orientationchange', onOrientationSettled)
    window.visualViewport?.removeEventListener('resize', requestResize)
    canvas.removeEventListener('webglcontextlost', onWebglContextLost)
    canvas.removeEventListener('webglcontextrestored', onWebglContextRestored)
    cameraDebug?.dispose()
    window.removeEventListener('beforeunload', saveNow)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pagehide', saveNow)
    window.clearInterval(autoSaveInterval)
    vueUi.configureAbortRest(null)
    timeSkip.cancel()
    timeSkipOverlay.dispose()
    busy.cancel()
    busyOverlay.dispose()
    restCamp.dispose()
    gui.dispose()
    pauseMenu.dispose()
    npcDialog.dispose()
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
    configureUiSounds(null)
    configureNpcVoiceSounds(null)
    configureAudioVolumes(worldAudio.getVolumes(), null)
    worldAudio.dispose()
    disposeWorldBundle(bundle)
    setActiveMonitor(null)
    setActiveProgramCensus(null)
    if (typeof window !== 'undefined') window.__seedvaleProgramCensus = undefined
    playerTorch.dispose()
    pointLightBudget.dispose()
    if (typeof window !== 'undefined') window.__seedvalePointLightBudget = undefined
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

