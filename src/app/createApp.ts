import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import type { AmbientSamplers } from '../audio/ambientWeights'
import type { SaveData } from '../persistence/saveData'
import { createAmbientAudio } from '../audio/createAmbientAudio'
import { createWorldAudio } from '../audio/createWorldAudio'
import { playInventoryDrop } from '../audio/inventorySounds'
import { saveWorldConfig } from '../config/persistConfig'
import {
  applyStoredPlayer,
  applyStoredSky,
  applyStoredTerrain,
  createWorldConfig,
} from '../config/worldConfig'
import { createTouchControls, type TouchControls } from '../input/createTouchControls'
import { isTouchDevice } from '../input/isTouchDevice'
import { createKeyboard } from '../input/Keyboard'
import { createMouseLook } from '../input/MouseLook'
import { Inventory } from '../items/Inventory'
import { type ItemKind } from '../items/items'
import { clearSave, writeSave } from '../persistence/saveDb'
import { PlayerController } from '../player/PlayerController'
import { createPlayerTorch } from '../player/PlayerTorch'
import { QuestManager } from '../quests/QuestManager'
import { createPostProcessing } from '../render/createPostProcessing'
import { createRenderer } from '../render/createRenderer'
import { createCamera } from '../scene/createCamera'
import { createScene } from '../scene/createScene'
import { disposeChunkWorkerPool } from '../terrain/chunkWorkerPool'
import { mountVueUi } from '../ui-vue/mount'
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
import { randomSeed, syncSeedInUrl } from '../world/parseSeed'
import { createTimeSkip } from '../world/timeSkip'
import { createGameLoop } from './gameLoop'
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
}
/** How close (world units) to a settlement's center counts as "in town" for
 *  the "Odpocznij w mieście" quick action — covers the default village
 *  extent (core + house ring, `ringMax + houseRadius*2 ≈ 39.6` at default
 *  `coreRadius`/`houseRadius`), not the much larger `HOME_RADIUS`. */
const REST_IN_TOWN_RADIUS = 40

let touchControls: TouchControls | null = null

/** Adds any `STARTING_LOADOUT` kind the inventory doesn't already have —
 *  called both for a fresh `Inventory` and after `inventory.clear()` (New
 *  Game), so the player is never left without a firestarter/knife/blanket. */
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
  }
  saveWorldConfig(config)

  const dayNight = createDayNightState(
    initialSave ? { timeOfDay: initialSave.timeOfDay } : undefined,
  )

  const renderer = createRenderer(container)
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
  const worldAudio = createWorldAudio(camera)

  const postProcessing = createPostProcessing(
    renderer,
    scene,
    camera,
    container.clientWidth,
    container.clientHeight,
    config.postProcessing,
  )

  const lights = createLights()
  lights.addTo(scene)

  const sky = createSky(config.sky)
  sky.addTo(scene)
  sky.applySun(lights.sun)

  let collectedItemIds = new Set<string>(initialSave?.collectedItemIds ?? [])
  const bundle = await createWorldBundle(
    scene,
    config,
    collectedItemIds,
    worldAudio.playOnce,
    initialSave?.droppedItems ?? [],
    initialSave?.placedFires ?? [],
  )

  // Indirection (not a direct destructure) so this keeps sampling whichever
  // bundle.chunkManager/config.terrain are current across `rebuildWorld()`
  // mutating `bundle`'s fields in place — see `worldBundle.ts`'s `WorldBundle`
  // doc comment.
  const ambientSamplers: AmbientSamplers = {
    sampleFloor: (x, z) => bundle.chunkManager.sampleFloor(x, z),
    sampleContinentalness: (x, z) => bundle.chunkManager.sampleContinentalness(x, z),
    sampleMountainRidge: (x, z) => bundle.chunkManager.sampleMountainRidge(x, z),
    sampleMoistureRegion: (x, z) => bundle.chunkManager.sampleMoistureRegion(x, z),
    get waterLevel() { return bundle.chunkManager.waterLevel },
    get heightScale() { return config.terrain.heightScale },
    get region() { return config.terrain.region },
  }
  const ambientAudio = createAmbientAudio(worldAudio, ambientSamplers)

  const inventory = new Inventory(initialSave?.inventory)
  grantStartingLoadout(inventory)

  const keyboard = createKeyboard()
  const mouseLook = createMouseLook(renderer.domElement)
  const player = await PlayerController.create(
    camera,
    keyboard.state,
    mouseLook.state,
    bundle.chunkManager.sampleHeight,
    bundle.chunkManager.sampleFloor,
    bundle.chunkManager.waterLevel,
  )
  if (initialSave) {
    // Set look before position — setPosition() calls syncCamera(), which reads yaw/pitch.
    mouseLook.state.yaw = initialSave.player.yaw
    mouseLook.state.pitch = initialSave.player.pitch
    player.setPosition(initialSave.player.x, initialSave.player.z)
  } else {
    player.setPosition(bundle.settlementsManager.home.spawn.x, bundle.settlementsManager.home.spawn.z)
  }
  player.setName(config.player.name)
  scene.add(player.mesh)
  const playerTorch = createPlayerTorch(player.mesh)

  const hud = createHud(container)
  hud.setSeed(config.seed)
  hud.setTime(dayNight.timeOfDay)
  const toast = createToast(container)

  const minimap = createMinimap(container)
  const questManager = new QuestManager(
    undefined,
    worldAudio.playOnce,
    inventory,
    initialSave?.quests,
  )
  hud.setExp(questManager.getExp())
  hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)

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
      saveWorldConfig(config)
      // Old agents are about to be disposed — drop the reference rather than
      // toggling a class on a DOM node that's going away anyway.
      gameLoop.forgetHighlight()
      if (resetCollectedItems) collectedItemIds = new Set()

      await rebuildWorldBundle(bundle, scene, config, resetCollectedItems, collectedItemIds, worldAudio.playOnce)

      if (resetCollectedItems) {
        inventory.clear()
        grantStartingLoadout(inventory)
        questManager.reset()
        playerTorch.extinguish()
        hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
        hud.setExp(questManager.getExp())
        touchControls?.setDropAvailable(!inventory.isEmpty())
      }
      // New chunkManager/ocean instances start with default (untinted) water —
      // resync immediately rather than waiting for the tick loop's throttled
      // apply to notice a large-enough timeOfDay delta.
      if (dayNight.enabled) gameLoop.resyncDayNight()
      player.setGround(bundle.chunkManager.sampleHeight, bundle.chunkManager.sampleFloor, bundle.chunkManager.waterLevel)
      player.setPosition(bundle.settlementsManager.home.spawn.x, bundle.settlementsManager.home.spawn.z)
      hud.setSeed(config.seed)
      pauseMenu.setSeed(config.seed)
    } finally {
      gui.setBusy(false)
      rebuilding = false
    }
  }

  const buildSaveData = (): SaveData => ({
    version: 6,
    config: {
      seed: config.seed,
      terrain: structuredClone(config.terrain),
      sky: { ...config.sky },
      player: { ...config.player },
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
  })

  const saveNow = (): void => {
    void writeSave(buildSaveData())
  }

  const updateSkyFromGui = () => {
    dayNight.enabled = false
    sky.setParams(config.sky, lights.sun)
    saveWorldConfig(config)
  }

  const updatePostProcessingFromGui = () => {
    postProcessing.applyConfig(config.postProcessing)
    saveWorldConfig(config)
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

  const gui = createDebugGui(config, dayNight, {
    onTerrainChange,
    onSkyChange: updateSkyFromGui,
    onDayNightChange,
    onPostProcessingChange: updatePostProcessingFromGui,
  })
  if (!config.showGui) gui.toggle()
  vueUi.configureWorldConfigScreen(config, dayNight, { onTerrainChange, onDayNightChange })

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
    touchControls?.setDropAvailable(!inventory.isEmpty())
    inventoryScreen.refresh(inventory.toJSON(), inventory.totalWeight(), inventory.maxWeight)
  }

  const inventoryScreen = createInventoryScreen(container, { onDrop: dropItemStack })

  const { buildSimpleFire, buildFirePit, lightTorch } = getUserActions(inventory, bundle, playerTorch, player, hud, touchControls)

  const timeSkip = createTimeSkip(dayNight)
  const timeSkipOverlay = createTimeSkipOverlay(container)

  const quickActions = createQuickActions(container, {
    onBuildSimpleFire: buildSimpleFire,
    onBuildFirePit: buildFirePit,
    onLightTorch: lightTorch,
    onWait: (hours) => {
      timeSkip.start(hours, { fade: false, label: `Czekasz... (${hours}h)` })
    },
    onRest: (variant) => {
      if (!inventory.has('blanket', 1)) return 'no-blanket'
      if (variant === 'town') {
        const nearSettlement = bundle.settlementsManager
          .getLoaded()
          .some((s) => s.center.distanceTo(player.mesh.position) <= REST_IN_TOWN_RADIUS)
        if (!nearSettlement) return 'too-far'
      }
      player.lieDown()
      timeSkip.start(8, {
        fade: false,
        label: variant === 'town' ? 'Odpoczywasz w mieście...' : 'Rozbijasz obóz...',
      })
      return 'ok'
    },
  })

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
    inventoryScreen.open()
    inventoryScreen.refresh(inventory.toJSON(), inventory.totalWeight(), inventory.maxWeight)
  }

  const pauseMenu = createPauseMenu(container, config.seed, config.player.name, {
    onPause: () => {
      if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock()
      }
    },
    onResume: () => {},
    onQuestLog: openQuestLog,
    onVillagers: openVillagers,
    onInventory: openInventory,
    onToggleGui: () => gui.toggle(),
    onNameChange: (name) => player.setName(name),
    onNameCommit: (name) => {
      config.player.name = name
      saveWorldConfig(config)
    },
    onSave: saveNow,
    onRefresh: () => window.location.reload(),
    onBuildSimpleFire: buildSimpleFire,
    onBuildFirePit: buildFirePit,
    onLightTorch: lightTorch,
    onNewGame: () => {
      if (!window.confirm('Start a new game? Your saved progress will be cleared.')) return
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

  // Reflects any inventory carried over from a loaded save — later changes are
  // synced at each pickup/drop call site alongside hud.setInventoryWeight().
  touchControls?.setDropAvailable(!inventory.isEmpty())

  // Shared flex column, right-aligned, holding the ☰ pause button + minimap —
  // replaces two independently absolutely-positioned corner widgets (which
  // needed hand-tuned pixel offsets to avoid overlapping on a short landscape
  // viewport) with one wrapper flexbox handles the spacing for. See
  // .seedvale-top-right-cluster in index.html.
  if (touchControls) {
    const topRightCluster = document.createElement('div')
    topRightCluster.className = 'seedvale-top-right-cluster'
    container.appendChild(topRightCluster)
    topRightCluster.appendChild(touchControls.pauseButton)
    topRightCluster.appendChild(minimap.root)
  }

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
    quickActions, timeSkip, timeSkipOverlay, inventory, toast, hud, questManager, ambientAudio,
    worldAudio, playerTorch, minimap, openQuestLog, openInventory,
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

  return () => {
    cancelAnimationFrame(frameId)
    window.removeEventListener('resize', onResize)
    window.removeEventListener('orientationchange', onResize)
    window.visualViewport?.removeEventListener('resize', onResize)
    window.removeEventListener('beforeunload', saveNow)
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pagehide', saveNow)
    window.clearInterval(autoSaveInterval)
    timeSkip.cancel()
    timeSkipOverlay.dispose()
    gui.dispose()
    pauseMenu.dispose()
    npcDialog.dispose()
    questLog.dispose()
    inventoryScreen.dispose()
    quickActions.dispose()
    hud.dispose()
    toast.dispose()
    minimap.dispose()
    keyboard.dispose()
    mouseLook.dispose()
    touchControls?.dispose()
    sky.dispose()
    ambientAudio.dispose()
    worldAudio.dispose()
    disposeWorldBundle(bundle)
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

