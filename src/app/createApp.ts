import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import type { SaveData } from '../persistence/saveData'
import type { VillageFire } from '../settlement/VillageFire'
import { playActionChop, playActionDig, playActionMine, playActionWell } from '../audio/actionSounds'
import { createAmbientAudio } from '../audio/createAmbientAudio'
import { createWorldAudio } from '../audio/createWorldAudio'
import { createHouseDoorTracker } from '../audio/doorSounds'
import { createFireAudio, playActionFireExtinguish, playActionFireIgnite } from '../audio/fireSounds'
import { playInventoryDrop, playInventoryPickUp } from '../audio/inventorySounds'
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
import { type AnimalAgent, BURY_DURATION_SEC } from '../fauna/AnimalAgent'
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
import { evaluateTentPlacement, TENT_PLACEMENT_MESSAGE } from '../items/tentPlacement'
import { TENT_LENGTH, tentRestPose } from '../items/tentProp'
import { buyWithBarter, buyWithShells } from '../items/trade'
import {
  benchmarkScenarioFromUrl,
  createBenchmarkRunner,
  createPerfMonitor,
  isPerfUrlEnabled,
  setActiveMonitor,
} from '../perf'
import { clearSave, writeSave } from '../persistence/saveDb'
import { PlayerController } from '../player/PlayerController'
import { drinkWater as drinkWaterNeeds, eatFood, resetPlayerNeeds, restorePersistedNeeds } from '../player/PlayerNeeds'
import { createPlayerTorch } from '../player/PlayerTorch'
import { QuestManager } from '../quests/QuestManager'
import { createPostProcessing } from '../render/createPostProcessing'
import { createRenderer } from '../render/createRenderer'
import { createCamera } from '../scene/createCamera'
import { createScene } from '../scene/createScene'
import { summarizeVillagePlan } from '../settlement/villagePlanDebug'
import { disposeChunkWorkerPool } from '../terrain/chunkWorkerPool'
import { MINE_DURATION_SEC, yieldForOre } from '../terrain/depositMining'
import { canLevelAt, DIG_DURATION_SEC, getDigProfileAt, getRockDigProfileAt, isRockGround } from '../terrain/dig'
import { applyDigAt, applyLevelAt } from '../terrain/digAction'
import { sampleFootstepSurface } from '../terrain/footstepSurface'
import { mountVueUi } from '../ui-vue/mount'
import { configureNpcVoiceSounds, configureUiSounds } from '../ui-vue/store'
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
import { createLights } from '../world/createLights'
import { createSky } from '../world/createSky'
import { createDayNightState } from '../world/dayNight'
import { createMapData, setActiveMapData } from '../world/map/mapData'
import { createMapDiscovery } from '../world/map/mapDiscovery'
import { createMapProjection, rawSampleParamsFromWorld } from '../world/map/mapProjection'
import { randomSeed, syncSeedInUrl } from '../world/parseSeed'
import { createTimeSkip } from '../world/timeSkip'
import { advanceWorldTreeHarvest, CHOP_DURATION_SEC } from '../world/treeHarvest'
import { createTreeLifecycle, isChoppableStage, parseTreeOverrides, yieldForChopStage } from '../world/treeLifecycle'
import { WATER_RENDER_LAYER } from '../world/waterMirror'
import { DRINK_THIRST_RELIEF, UNSAFE_WATER_WARNING, type WaterSource } from '../world/WaterSource'
import { createWorldContext } from '../world/worldContext'
import { createBusyAction } from './busyAction'
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
/** Busy-channel duration for knife-harvesting raw_meat from a corpse — real
 *  minutes, with the vision blur+desaturate overlay (tune during playtest). */
const HARVEST_MEAT_DURATION_SEC = 180
/** Busy-channel duration for lighting an unlit campfire (not "dołóż gałąź",
 *  which stays instant) — real minutes, blurred overlay. */
const IGNITE_DURATION_SEC = 120

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

  let treeLifecycle = createTreeLifecycle(
    config.seed,
    parseTreeOverrides(initialSave?.treeOverrides),
  )
  const getWorldDays = () => dayNight.elapsedDays

  const renderer = createRenderer(container, config.postProcessing.pixelRatioCap)
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
  const camera = createCamera(container.clientWidth / container.clientHeight)
  camera.layers.enable(WATER_RENDER_LAYER)
  const worldAudio = createWorldAudio(camera)

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

  const sky = createSky(config.sky)
  sky.addTo(scene)
  sky.applySun(lights.sun)

  let collectedItemIds = new Set<string>(initialSave?.collectedItemIds ?? [])
  // `questManager` doesn't exist yet at this point (fauna/settlements build
  // before it does), so `onAnimalDeath` can't close over it directly —
  // mirrors the existing `bundle`-not-destructured indirection just below:
  // a mutable binding assigned once, read through a stable closure that
  // survives `rebuildWorldBundle()` (plan 110).
  let onAnimalDeathTarget: ((animalId: string) => void) | null = null
  const onAnimalDeath = (animalId: string): void => { onAnimalDeathTarget?.(animalId) }
  const bundle = await createWorldBundle(
    scene,
    config,
    collectedItemIds,
    worldAudio.playAt,
    initialSave?.droppedItems ?? [],
    initialSave?.placedFires ?? [],
    initialSave?.placedTents ?? [],
    treeLifecycle,
    getWorldDays,
    dayNight,
    initialSave?.settlementEconomies,
    onAnimalDeath,
  )

  // Indirection (not a direct destructure) so this keeps sampling whichever
  // bundle.chunkManager/config.terrain are current across `rebuildWorld()`
  // mutating `bundle`'s fields in place — see `worldBundle.ts`'s `WorldBundle`
  // doc comment.
  const worldContext = createWorldContext(() => bundle.chunkManager, config, dayNight)
  const ambientAudio = createAmbientAudio(worldAudio, worldContext)
  const fireAudio = createFireAudio(worldAudio)
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
  } else {
    player.setPosition(bundle.settlementsManager.home.spawn.x, bundle.settlementsManager.home.spawn.z)
  }
  player.setName(config.player.name)
  player.setMoveAudio(worldAudio.playAt)
  scene.add(player.mesh)
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
  })

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
  const questManager = new QuestManager(
    undefined,
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
  // Now that `questManager` exists, the closure passed into `createWorldBundle`
  // above can actually reach it — see that call site's comment.
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
    version: 13,
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
    worldFlags: { ...worldFlags },
    map: { discoveredCells: mapDiscovery.serialize() },
    settlementEconomies: bundle.settlementsManager.snapshotEconomies(),
    playerNeeds: {
      hunger: player.needs.hunger.current,
      thirst: player.needs.thirst.current,
      vigor: player.needs.vigor.current,
    },
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
        postProcessing.applyConfig({ ...config.postProcessing, aoEnabled: on })
      },
      setReflections: (on) => {
        bundle.ocean.setReflections(on)
        bundle.chunkManager.setWaterReflections(on)
      },
    },
  })

  const gui = createDebugGui(config, dayNight, renderer, {
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
  if (!config.showGui) gui.toggle()
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
    if (!inventory.remove('tent', 1)) return
    bundle.placedTents.place(aim.x, aim.z, aim.yaw)
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    syncQuickActionAvailability()
    toast.show('Rozstawiono namiot.')
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

  /** Knife-harvest raw_meat from a corpse (plan 106) — same shape as
   *  `startBuryCorpse`, just knife-gated and yielding an item instead of
   *  disposing the corpse. */
  const startHarvestMeat = (animal: AnimalAgent): void => {
    if (heldTool.held() !== 'knife' || busy.isActive() || timeSkip.isActive() || restCamp.isActive()) return
    if (!animal.canHarvestMeat()) return
    if (!inventory.canAdd('raw_meat', 1)) {
      toast.show('Ekwipunek jest za ciężki.', 'error')
      return
    }
    busy.start(HARVEST_MEAT_DURATION_SEC, 'Wycinanie mięsa…', () => {
      if (!animal.canHarvestMeat() || !inventory.canAdd('raw_meat', 1)) return
      animal.harvestMeat()
      inventory.add('raw_meat', 1)
      playInventoryPickUp(worldAudio.playOnce)
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      onInventoryChanged()
      toast.show('+1 Surowe mięso', 'pickup')
    }, { blurred: true })
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
    busy.start(IGNITE_DURATION_SEC, 'Rozpalanie ogniska…', () => {
      if (fire.isLit() || !inventory.remove('branch', 1)) return
      fire.light()
      hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
      onInventoryChanged()
      toast.show('Ognisko zapłonęło.')
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
    if (entry.need === 'hunger') eatFood(player.needs, entry.relief)
    else drinkWaterNeeds(player.needs, entry.relief)
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    onInventoryChanged()
    inventoryScreen.refresh(inventory.toJSON(), inventory.totalWeight(), inventory.maxWeight, heldTool.held())
    toast.show(entry.need === 'hunger' ? 'Zjedzono.' : 'Wypito.', 'pickup')
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
    keyboard, mouseLook, touchControls, pauseMenu, npcDialog, questLog, vueUi, inventoryScreen,
    quickActions, timeSkip, timeSkipOverlay, busy, busyOverlay, restCamp, inventory, heldTool, toast, hud,
    questManager, ambientAudio, fireAudio, houseDoors, worldAudio, playerTorch, minimap, mapDiscovery, openQuestLog, openInventory,
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
    drinkFromWaterSource,
    fillWaterskin,
    startTentRest,
    packTent,
    onInventoryChanged,
    setFrameTiming: gui.setFrameTiming,
  })
  gameLoop.resyncDayNight()

  let frameId = 0

  const onResize = () => {
    const width = container.clientWidth
    const height = container.clientHeight
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height)
    labelRenderer.setSize(width, height)
    postProcessing.setSize(width, height)
  }
  window.addEventListener('resize', onResize)
  // Mobile browsers resize the *visual* viewport (address bar show/hide,
  // on-screen keyboard) without always firing a plain window 'resize' — and
  // orientation changes on some Android WebViews fire neither reliably.
  // Covering both keeps the canvas from getting stuck at a stale size
  // (reported: Chrome mobile rendering only into half the screen width after
  // the initial address-bar layout settled).
  window.addEventListener('orientationchange', onResize)
  window.visualViewport?.addEventListener('resize', onResize)
  // Defensive re-measure a couple frames after first paint, in case the very
  // first `container.clientWidth/clientHeight` read (used above to size the
  // renderer/camera) happened before the mobile browser's chrome/address-bar
  // layout had fully settled.
  requestAnimationFrame(() => requestAnimationFrame(onResize))

  const tick = () => {
    frameId = requestAnimationFrame(tick)
    gameLoop.tick()
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
    window.removeEventListener('resize', onResize)
    window.removeEventListener('orientationchange', onResize)
    window.visualViewport?.removeEventListener('resize', onResize)
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
    configureUiSounds(null)
    configureNpcVoiceSounds(null)
    worldAudio.dispose()
    disposeWorldBundle(bundle)
    setActiveMonitor(null)
    playerTorch.dispose()
    player.dispose()
    disposeChunkWorkerPool()
    postProcessing.dispose()
    labelRenderer.domElement.remove()
    vueUi.dispose()
    renderer.dispose()
    renderer.domElement.remove()
  }
}

