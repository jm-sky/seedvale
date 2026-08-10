import { Clock, Fog, type Scene, type Vector3 } from 'three'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import type { NpcAgent } from '../ai/NpcAgent'
import type { AmbientSamplers } from '../audio/ambientWeights'
import type { AnimalAgent } from '../fauna/AnimalAgent'
import type { Interactable, WorldItemRef } from '../interaction/Interactable'
import type { SaveData } from '../persistence/saveData'
import type { Settlement } from '../settlement/createSettlement'
import type { ChunkCoord } from '../terrain/chunkGrid'
import type { ResourceEnv } from '../terrain/naturalResources'
import { createAmbientAudio } from '../audio/createAmbientAudio'
import { createWorldAudio } from '../audio/createWorldAudio'
import { saveWorldConfig } from '../config/persistConfig'
import {
  applyStoredPlayer,
  applyStoredSky,
  applyStoredTerrain,
  createWorldConfig,
} from '../config/worldConfig'
import { ANIMAL_LABELS } from '../fauna/AnimalAgent'
import { createFauna, type Fauna, SPAWNER_LABELS } from '../fauna/createFauna'
import { createTouchControls, type TouchControls } from '../input/createTouchControls'
import { isTouchDevice } from '../input/isTouchDevice'
import { createKeyboard } from '../input/Keyboard'
import { createMouseLook } from '../input/MouseLook'
import { pickInGaze } from '../interaction/findInteractionTarget'
import { resolveInteraction } from '../interaction/resolveInteraction'
import { createDroppedItems, type DroppedItems } from '../items/createDroppedItems'
import { createItemSpawners, type ItemSpawners } from '../items/createItemSpawners'
import { Inventory } from '../items/Inventory'
import { ITEM_DEFS, type ItemKind } from '../items/items'
import { clearSave, writeSave } from '../persistence/saveDb'
import { PlayerController } from '../player/PlayerController'
import { createPlayerTorch } from '../player/PlayerTorch'
import { QuestManager } from '../quests/QuestManager'
import { createPostProcessing } from '../render/createPostProcessing'
import { createRenderer } from '../render/createRenderer'
import { createCamera } from '../scene/createCamera'
import { createScene } from '../scene/createScene'
import { createPlacedFires, type PlacedFires } from '../settlement/PlacedFires'
import { clearRoadNetworkCaches } from '../settlement/roadNetwork'
import { createSettlementsManager, type SettlementsManager } from '../settlement/SettlementsManager'
import {
  type ChunkManager,
  type ChunkManagerConfig,
  createChunkManager,
} from '../terrain/chunkManager'
import { disposeChunkWorkerPool } from '../terrain/chunkWorkerPool'
import { createResourceDeposits } from '../terrain/resourceDeposits'
import { mountVueUi } from '../ui-vue/mount'
import { createDebugGui } from '../ui/createDebugGui'
import { createHud } from '../ui/createHud'
import { createInventoryScreen } from '../ui/createInventoryScreen'
import { createLoadingScreen } from '../ui/createLoadingScreen'
import { createMinimap, type MinimapSettlement } from '../ui/createMinimap'
import { createNpcDialog } from '../ui/createNpcDialog'
import { createPauseMenu } from '../ui/createPauseMenu'
import { createQuestLog } from '../ui/createQuestLog'
import { createQuickActions } from '../ui/createQuickActions'
import { createTimeSkipOverlay } from '../ui/createTimeSkipOverlay'
import { createToast } from '../ui/createToast'
import { createLights } from '../world/createLights'
import { createOcean, type WorldOcean } from '../world/createOcean'
import { createSky } from '../world/createSky'
import {
  createDayNightState,
  skyParamsFromTime,
  tickDayNight,
} from '../world/dayNight'
import { randomSeed, syncSeedInUrl } from '../world/parseSeed'
import { createTimeSkip } from '../world/timeSkip'
import { getUserActions } from './userActions'

/** Fixed radius (world units) for settlement/fauna spatial logic — deliberately
 *  independent of the streamed terrain's loaded region, so the village and its
 *  animals behave identically whether the player is standing right there or has
 *  wandered many chunks away. */
const HOME_RADIUS = 56

/** How far (world units) from the player a settlement streams in. Analogous to
 *  chunk load/unload radii — see multi-settlements plan. */
const SETTLEMENT_LOAD_RADIUS = 300
/** Must be > SETTLEMENT_LOAD_RADIUS — hysteresis ring avoiding load/unload
 *  thrashing right at the boundary. */
const SETTLEMENT_UNLOAD_RADIUS = 420

/** How close (world units) the player must be to an interactable before it's
 *  picked up by `[E]`. */
const INTERACT_RANGE = 2.5
/** Minimum dot(playerForward, toTarget) to count as "looking at" — ~60° half-angle
 *  cone, needed so a dense cluster doesn't pick whichever is merely nearest. */
const INTERACT_MIN_DOT = 0.5
/** Gaze-highlight range — deliberately larger than `INTERACT_RANGE` so the glow
 *  reads as an "approaching" cue before the `[E]` prompt appears. */
const GAZE_RANGE = INTERACT_RANGE * 2
/** Chance an `[E]`-inspected tree also yields a branch, on top of the
 *  renewable branch spawn points (`createItemSpawners.ts`). */
const TREE_BRANCH_CHANCE = 0.25
/** Added to `TREE_BRANCH_CHANCE` while the player carries a knife (plan
 *  `2026-08-08--043` §9) — a bonus, not a hard requirement. */
const KNIFE_BRANCH_BONUS = 0.15
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

type Highlightable = NpcAgent | AnimalAgent

let touchControls: TouchControls | null = null

/** 3×3 block of chunks around the origin, pinned so the settlement never streams
 *  out from under itself. */
function homeChunks(): ChunkCoord[] {
  const coords: ChunkCoord[] = []
  for (let cz = -1; cz <= 1; cz++) {
    for (let cx = -1; cx <= 1; cx++) coords.push({ cx, cz })
  }
  return coords
}

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
  let chunkManager = buildChunkManager(scene, config, collectedItemIds)
  chunkManager.update(0, 0)
  await chunkManager.waitForChunks(homeChunks())

  // Indirection (not a direct destructure) so this keeps sampling whichever
  // chunkManager/config.terrain are current across `rebuildWorld()` reassignments.
  const ambientSamplers: AmbientSamplers = {
    sampleFloor: (x, z) => chunkManager.sampleFloor(x, z),
    sampleContinentalness: (x, z) => chunkManager.sampleContinentalness(x, z),
    sampleMountainRidge: (x, z) => chunkManager.sampleMountainRidge(x, z),
    sampleMoistureRegion: (x, z) => chunkManager.sampleMoistureRegion(x, z),
    get waterLevel() { return chunkManager.waterLevel },
    get heightScale() { return config.terrain.heightScale },
    get region() { return config.terrain.region },
  }
  const ambientAudio = createAmbientAudio(worldAudio, ambientSamplers)

  // Same indirection reasoning as `ambientSamplers` above — survives
  // `rebuildWorld()` reassigning `chunkManager`. Unlike `ambientSamplers`,
  // resource queries want `sampleHeight` (the rendered surface, for placing
  // ore piles on it), not `sampleFloor`.
  const resourceEnv: ResourceEnv = {
    sampleHeight: (x, z) => chunkManager.sampleHeight(x, z),
    sampleContinentalness: (x, z) => chunkManager.sampleContinentalness(x, z),
    sampleMountainRidge: (x, z) => chunkManager.sampleMountainRidge(x, z),
    sampleMoistureRegion: (x, z) => chunkManager.sampleMoistureRegion(x, z),
    get waterLevel() { return chunkManager.waterLevel },
    get heightScale() { return config.terrain.heightScale },
    get region() { return config.terrain.region },
  }
  let resourceDeposits = createResourceDeposits(scene, resourceEnv, config.seed)

  let ocean = buildOcean(scene, config)
  let settlementsManager = await buildSettlementsManager(scene, chunkManager, config.seed, worldAudio.playOnce, config)
  let fauna = await buildFauna(scene, chunkManager, settlementsManager.home, config.seed)
  let itemSpawners = buildItemSpawners(scene, chunkManager, settlementsManager.home, config.seed)
  let droppedItems = createDroppedItems(scene, chunkManager.sampleHeight, initialSave?.droppedItems ?? [])
  let placedFires = createPlacedFires(scene, chunkManager.sampleHeight, initialSave?.placedFires ?? [])
  const inventory = new Inventory(initialSave?.inventory)
  grantStartingLoadout(inventory)

  const keyboard = createKeyboard()
  const mouseLook = createMouseLook(renderer.domElement)
  const player = await PlayerController.create(
    camera,
    keyboard.state,
    mouseLook.state,
    chunkManager.sampleHeight,
    chunkManager.sampleFloor,
    chunkManager.waterLevel,
  )
  if (initialSave) {
    // Set look before position — setPosition() calls syncCamera(), which reads yaw/pitch.
    mouseLook.state.yaw = initialSave.player.yaw
    mouseLook.state.pitch = initialSave.player.pitch
    player.setPosition(initialSave.player.x, initialSave.player.z)
  } else {
    player.setPosition(settlementsManager.home.spawn.x, settlementsManager.home.spawn.z)
  }
  player.setName(config.player.name)
  scene.add(player.mesh)
  const playerTorch = createPlayerTorch(player.mesh)

  const hud = createHud(container)
  hud.setSeed(config.seed)
  hud.setTime(dayNight.timeOfDay)
  const toast = createToast(container)

  /** Currently gaze-highlighted NPC/animal, if any — tracked so we only toggle
   *  the CSS class on change instead of writing every frame. */
  let highlightedTarget: Highlightable | null = null
  const setHighlight = (next: Highlightable | null): void => {
    if (highlightedTarget === next) return
    highlightedTarget?.setHighlighted(false)
    next?.setHighlighted(true)
    highlightedTarget = next
  }

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
      highlightedTarget = null
      fauna.dispose()
      itemSpawners.dispose()
      // Copy before dispose() — nodes() returns a live reference to the
      // internal array, and dispose() clears it in place.
      const carriedDrops = resetCollectedItems ? [] : [...droppedItems.nodes()]
      droppedItems.dispose()
      const carriedFires = resetCollectedItems ? [] : [...placedFires.nodes()]
      placedFires.dispose()
      resourceDeposits.dispose()
      settlementsManager.dispose()
      ocean.dispose()
      chunkManager.dispose()
      if (resetCollectedItems) {
        collectedItemIds = new Set()
        inventory.clear()
        grantStartingLoadout(inventory)
        questManager.reset()
        playerTorch.extinguish()
        hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
        hud.setExp(questManager.getExp())
        touchControls?.setDropAvailable(!inventory.isEmpty())
      }
      // roadNetwork's def/route caches are module-level and keyed by cell/id,
      // not by seed — must be dropped before generating the new world's chunks,
      // otherwise roads/village clearings from the old seed leak in.
      clearRoadNetworkCaches()

      chunkManager = buildChunkManager(scene, config, collectedItemIds)
      chunkManager.update(0, 0)
      await chunkManager.waitForChunks(homeChunks())

      ocean = buildOcean(scene, config)
      // New chunkManager/ocean instances start with default (untinted) water —
      // resync immediately rather than waiting for the tick loop's throttled
      // apply to notice a large-enough timeOfDay delta.
      if (dayNight.enabled) {
        applyDayNight(dayNight.timeOfDay, sky, lights, scene, chunkManager, ocean)
        lastAppliedTimeOfDay = dayNight.timeOfDay
      }
      settlementsManager = await buildSettlementsManager(scene, chunkManager, config.seed, worldAudio.playOnce, config)
      if (dayNight.enabled) {
        settlementsManager.setDayNight(1 - skyParamsFromTime(dayNight.timeOfDay).dayFactor)
      }
      fauna = await buildFauna(scene, chunkManager, settlementsManager.home, config.seed)
      itemSpawners = buildItemSpawners(scene, chunkManager, settlementsManager.home, config.seed)
      resourceDeposits = createResourceDeposits(scene, resourceEnv, config.seed)
      droppedItems = createDroppedItems(scene, chunkManager.sampleHeight, carriedDrops)
      placedFires = createPlacedFires(scene, chunkManager.sampleHeight, carriedFires)
      player.setGround(chunkManager.sampleHeight, chunkManager.sampleFloor, chunkManager.waterLevel)
      player.setPosition(settlementsManager.home.spawn.x, settlementsManager.home.spawn.z)
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
    droppedItems: droppedItems.nodes().map((item) => ({ ...item })),
    placedFires: placedFires.nodes().map((fire) => ({ ...fire })),
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
    postProcessing.applyAoConfig(config.postProcessing)
    saveWorldConfig(config)
  }

  const onDayNightChange = () => {
    if (dayNight.enabled) {
      applyDayNight(dayNight.timeOfDay, sky, lights, scene, chunkManager, ocean)
      settlementsManager.setDayNight(1 - skyParamsFromTime(dayNight.timeOfDay).dayFactor)
      lastAppliedTimeOfDay = dayNight.timeOfDay
    }
  }

  const gui = createDebugGui(config, dayNight, {
    onTerrainChange: () => {
      void rebuildWorld()
    },
    onSkyChange: updateSkyFromGui,
    onDayNightChange,
    onPostProcessingChange: updatePostProcessingFromGui,
  })
  if (!config.showGui) gui.toggle()

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
      droppedItems.drop(
        kind,
        player.mesh.position.x + Math.cos(angle) * 0.6,
        player.mesh.position.z + Math.sin(angle) * 0.6,
      )
    }
    hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
    touchControls?.setDropAvailable(!inventory.isEmpty())
    inventoryScreen.refresh(inventory.toJSON(), inventory.totalWeight(), inventory.maxWeight)
  }

  const inventoryScreen = createInventoryScreen(container, { onDrop: dropItemStack })

  const { buildSimpleFire, buildFirePit, lightTorch} = getUserActions(inventory, placedFires, playerTorch, player, hud, touchControls)

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
        const nearSettlement = settlementsManager
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
      settlementsManager
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
            !vueUi.isNpcDialogueMenuOpen()
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
            !vueUi.isNpcDialogueMenuOpen()
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

  applyDayNight(dayNight.timeOfDay, sky, lights, scene, chunkManager, ocean)
  settlementsManager.setDayNight(1 - skyParamsFromTime(dayNight.timeOfDay).dayFactor)
  let lastAppliedTimeOfDay = dayNight.timeOfDay

  const clock = new Clock()
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
    const dt = Math.min(clock.getDelta(), 0.05)

    // Runs regardless of any modal/pause state — the clock has to keep
    // advancing (boosted) for the skip to actually pass game-time. Only
    // player input is blocked below; world simulation stays on its normal
    // per-frame path (see world/timeSkip.ts for why dt itself isn't scaled).
    const skip = timeSkip.tick(dt)
    if (skip) {
      timeSkipOverlay.show(skip.label, skip.fade)
      if (skip.justFinished) {
        timeSkipOverlay.hide()
        player.standUp()
      }
      keyboard.state.forward = false
      keyboard.state.backward = false
      keyboard.state.left = false
      keyboard.state.right = false
      keyboard.state.sprint = false
    }

    const menuPaused = pauseMenu.isPaused()
    const anyModalOpen =
      menuPaused ||
      npcDialog.isOpen() ||
      questLog.isOpen() ||
      vueUi.isVillagersOpen() ||
      inventoryScreen.isOpen() ||
      quickActions.isOpen() ||
      vueUi.isNpcDialogueMenuOpen()
    touchControls?.setInputEnabled(!anyModalOpen && !timeSkip.isActive())

    if (menuPaused) {
      // drop stale presses so they can't fire right after resume
      keyboard.consumeInteract()
      keyboard.consumeQuestLog()
      keyboard.consumeDrop()
      keyboard.consumeInventory()
      setHighlight(null)
    } else if (vueUi.isNpcDialogueMenuOpen()) {
      // The Vue menu handles its own close (Escape/backdrop/buttons) —
      // just block world interaction and other overlays while it's open.
      keyboard.consumeInteract()
      keyboard.consumeQuestLog()
      keyboard.consumeDrop()
      keyboard.consumeInventory()
      setHighlight(null)
    } else if (npcDialog.isOpen()) {
      npcDialog.setPrompt(null)
      keyboard.consumeQuestLog()
      keyboard.consumeDrop()
      keyboard.consumeInventory()
      setHighlight(null)
      if (keyboard.consumeInteract()) {
        if (npcDialog.isOffer()) npcDialog.accept()
        else npcDialog.close()
      }
    } else if (questLog.isOpen()) {
      keyboard.consumeInteract()
      keyboard.consumeDrop()
      keyboard.consumeInventory()
      setHighlight(null)
      if (keyboard.consumeQuestLog()) questLog.close()
    } else if (vueUi.isVillagersOpen()) {
      keyboard.consumeInteract()
      keyboard.consumeQuestLog()
      keyboard.consumeDrop()
      keyboard.consumeInventory()
      setHighlight(null)
    } else if (inventoryScreen.isOpen()) {
      keyboard.consumeInteract()
      keyboard.consumeQuestLog()
      keyboard.consumeDrop()
      setHighlight(null)
      if (keyboard.consumeInventory()) inventoryScreen.close()
    } else if (quickActions.isOpen()) {
      keyboard.consumeInteract()
      keyboard.consumeQuestLog()
      keyboard.consumeDrop()
      keyboard.consumeInventory()
      setHighlight(null)
    } else if (timeSkip.isActive()) {
      keyboard.consumeInteract()
      keyboard.consumeQuestLog()
      keyboard.consumeDrop()
      keyboard.consumeInventory()
      setHighlight(null)
    } else {
      const interactables = buildInteractables(
        settlementsManager.getLoaded(),
        fauna,
        chunkManager,
        itemSpawners,
        droppedItems,
        placedFires,
        player.mesh.position,
      )
      const target = pickInGaze(
        interactables,
        player.mesh.position,
        mouseLook.state.yaw,
        INTERACT_RANGE,
        INTERACT_MIN_DOT,
      )
      npcDialog.setPrompt(target ? target.promptLabel : null)

      const gazeCandidates: { position: { x: number, z: number }, agent: Highlightable }[] = []
      for (const item of interactables) {
        if (item.kind === 'npc') gazeCandidates.push({ position: item.position, agent: item.npc })
        else if (item.kind === 'animal') gazeCandidates.push({ position: item.position, agent: item.animal })
      }
      const gazed = pickInGaze(
        gazeCandidates,
        player.mesh.position,
        mouseLook.state.yaw,
        GAZE_RANGE,
        INTERACT_MIN_DOT,
      )
      setHighlight(gazed?.agent ?? null)
      const interactPressed = keyboard.consumeInteract()
      if (target && interactPressed) {
        if (target.kind === 'item') {
          if (!inventory.canAdd(target.item.kind)) {
            toast.show('Ekwipunek jest za ciężki.', 'error')
          } else {
            const collected = collectItem(target.item, chunkManager, itemSpawners, droppedItems)
            if (collected) {
              inventory.add(collected.kind)
              hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
              touchControls?.setDropAvailable(!inventory.isEmpty())
            }
          }
        } else if (target.kind === 'campfire') {
          const wasLit = target.fire.isLit()
          if (!wasLit && !inventory.has('firestarter', 1)) {
            toast.show('Potrzebujesz krzesiwa, żeby rozpalić ogień.', 'error')
          } else if (inventory.remove('branch', 1)) {
            if (wasLit) target.fire.addFuel()
            else target.fire.light()
            hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
            touchControls?.setDropAvailable(!inventory.isEmpty())
            toast.show(wasLit ? 'Dołożono gałąź do ogniska.' : 'Ognisko zapłonęło.')
          } else {
            toast.show('Potrzebujesz gałęzi, żeby je zapalić.', 'error')
          }
        } else if (target.kind === 'tree') {
          const outcome = resolveInteraction(target, questManager)
          const branchChance = TREE_BRANCH_CHANCE + (inventory.has('knife', 1) ? KNIFE_BRANCH_BONUS : 0)
          if (Math.random() < branchChance && inventory.canAdd('branch')) {
            inventory.add('branch')
            hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
            touchControls?.setDropAvailable(!inventory.isEmpty())
            toast.show('+1 Gałąź', 'pickup')
          }
          npcDialog.open(outcome.speakerName, outcome.line, outcome.offer)
        } else if (target.kind === 'npc') {
          // Buttons need a visible cursor — same pointer-lock release the
          // pause menu already does on open (createPauseMenu's onPause).
          if (document.pointerLockElement === renderer.domElement) document.exitPointerLock()
          vueUi.openNpcDialogueMenu(target.npc, target.settlement, questManager, dayNight.timeOfDay)
        } else {
          const outcome = resolveInteraction(target, questManager)
          npcDialog.open(outcome.speakerName, outcome.line, outcome.offer)
        }
      }
      if (keyboard.consumeQuestLog()) openQuestLog()
      if (keyboard.consumeInventory()) openInventory()
      if (keyboard.consumeQuickActions()) quickActions.toggle()
      if (keyboard.consumeDrop()) {
        let dropOffset = 0
        const itemKinds = Object.keys(ITEM_DEFS) as ItemKind[]
        for (const kind of itemKinds) {
          if (!inventory.remove(kind, 1)) continue
          const angle = dropOffset * ((Math.PI * 2) / itemKinds.length)
          droppedItems.drop(
            kind,
            player.mesh.position.x + Math.cos(angle) * 0.6,
            player.mesh.position.z + Math.sin(angle) * 0.6,
          )
          dropOffset++
        }
        if (dropOffset > 0) {
          hud.setInventoryWeight(inventory.totalWeight(), inventory.maxWeight)
          touchControls?.setDropAvailable(!inventory.isEmpty())
        }
      }
    }

    if (
      !menuPaused &&
      !npcDialog.isOpen() &&
      !questLog.isOpen() &&
      !vueUi.isVillagersOpen() &&
      !inventoryScreen.isOpen() &&
      !quickActions.isOpen()
    ) {
      for (const s of settlementsManager.getLoaded()) {
        for (const npc of s.npcs) {
          npc.setQuestMarker(questManager.labelMarker(npc.name))
        }
      }
      for (const spawner of fauna.getSpawners()) {
        fauna.setSpawnerMarker(spawner.type, questManager.spawnerMarker(spawner.type))
      }
      tickDayNight(dayNight, dt)
      if (
        dayNight.enabled &&
        timeOfDayDelta(dayNight.timeOfDay, lastAppliedTimeOfDay) >= DAY_NIGHT_APPLY_THRESHOLD
      ) {
        applyDayNight(dayNight.timeOfDay, sky, lights, scene, chunkManager, ocean)
        settlementsManager.setDayNight(1 - skyParamsFromTime(dayNight.timeOfDay).dayFactor)
        lastAppliedTimeOfDay = dayNight.timeOfDay
      }
      ambientAudio.update(
        dt,
        skyParamsFromTime(dayNight.timeOfDay).dayFactor,
        player.mesh.position.x,
        player.mesh.position.z,
      )
      hud.setTime(dayNight.timeOfDay)
      hud.setExp(questManager.getExp())
      player.update(dt)
      chunkManager.update(player.mesh.position.x, player.mesh.position.z)
      lights.follow(player.mesh.position.x, player.mesh.position.z)
      ocean.follow(player.mesh.position.x, player.mesh.position.z)
      // Computed before `settlementsManager.update` (not after, as before
      // livestock existed) so its per-settlement livestock `update()` calls
      // can also use them — neither depends on `update()`'s effect this same
      // frame (fire-lit state only changes via `setDayNight`, not `update`).
      const dayFactor = skyParamsFromTime(dayNight.timeOfDay).dayFactor
      const litFires = [
        ...settlementsManager.getLoaded().flatMap((s) => (s.fire?.isLit() ? [s.fire.position] : [])),
        ...placedFires.list().filter((f) => f.fire.isLit()).map((f) => f.fire.position),
      ]
      const villages = settlementsManager.getLoaded().map((s) => ({ x: s.center.x, z: s.center.z }))
      settlementsManager.update(
        dt,
        player.mesh.position,
        mouseLook.state.yaw,
        dayNight.timeOfDay,
        dayFactor,
        litFires,
        villages,
      )
      resourceDeposits.update(player.mesh.position.x, player.mesh.position.z)
      fauna.update(dt, player.mesh.position, dayNight.timeOfDay, litFires, villages)
      itemSpawners.update(dt, player.mesh.position, dayFactor)
      placedFires.update(dt)
      playerTorch.update(dt)
      chunkManager.tickWater(dt)
      chunkManager.tickGrass(dt)
      ocean.update(dt)
      worldAudio.update(dt)
      minimap.update(
        player.mesh.position,
        settlementsManager
          .getLoaded()
          .map((s): MinimapSettlement => ({ position: s.center, npcs: s.npcs, name: s.name })),
      )
    }
    postProcessing.render()
    labelRenderer.render(scene, camera)
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
    ocean.dispose()
    ambientAudio.dispose()
    worldAudio.dispose()
    fauna.dispose()
    itemSpawners.dispose()
    resourceDeposits.dispose()
    droppedItems.dispose()
    placedFires.dispose()
    settlementsManager.dispose()
    chunkManager.dispose()
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

/** Assembles this frame's `Interactable` candidates from every world system —
 *  NPCs, the well/trees (settlement landmarks), live fauna, fauna spawn points,
 *  player-built campfires, and nearby pickup items (world-generated + the
 *  renewable pool + player-dropped).
 *  Cheap: a few dozen objects total, dominated by settlement trees. */
function buildInteractables(
  settlements: readonly Settlement[],
  fauna: Fauna,
  chunkManager: ChunkManager,
  itemSpawners: ItemSpawners,
  droppedItems: DroppedItems,
  placedFires: PlacedFires,
  playerPos: Vector3,
): Interactable[] {
  const list: Interactable[] = []

  for (const pf of placedFires.list()) {
    list.push({
      kind: 'campfire',
      position: { x: pf.x, z: pf.z },
      promptLabel: pf.fire.isLit()
        ? 'Dołóż gałąź'
        : pf.kind === 'pit' ? 'Zapal ognisko w palenisku' : 'Zapal ognisko',
      fire: pf.fire,
    })
  }

  for (const settlement of settlements) {
    for (const npc of settlement.npcs) {
      list.push({
        kind: 'npc',
        position: npc.mesh.position,
        promptLabel: `Rozmawiaj z ${npc.displayName}`,
        npc,
        settlement,
      })
    }

    for (const animal of settlement.livestock) {
      if (animal.isDead()) continue
      list.push({
        kind: 'animal',
        position: animal.mesh.position,
        promptLabel: `Obserwuj: ${ANIMAL_LABELS[animal.def.kind]}`,
        animal,
      })
    }

    list.push({
      kind: 'well',
      position: settlement.landmarks.well,
      promptLabel: 'Zaczerpnij wody',
    })

    if (settlement.fire) {
      list.push({
        kind: 'campfire',
        position: settlement.fire.position,
        promptLabel: settlement.fire.isLit() ? 'Dołóż gałąź' : 'Zapal ognisko',
        fire: settlement.fire,
      })
    }

    settlement.landmarks.trees.forEach((position, i) => {
      list.push({ kind: 'tree', position, promptLabel: 'Obejrzyj drzewo', id: `tree-${settlement.id}-${i}` })
    })
  }

  for (const animal of fauna.getAgents()) {
    if (animal.isDead()) continue
    list.push({
      kind: 'animal',
      position: animal.mesh.position,
      promptLabel: `Obserwuj: ${ANIMAL_LABELS[animal.def.kind]}`,
      animal,
    })
  }

  for (const spawner of fauna.getSpawners()) {
    list.push({
      kind: 'spawner',
      position: { x: spawner.x, z: spawner.z },
      promptLabel: `Zbadaj: ${SPAWNER_LABELS[spawner.type]}`,
      spawner,
    })
  }

  for (const item of chunkManager.getNearbyItems(playerPos, INTERACT_RANGE)) {
    list.push({
      kind: 'item',
      position: { x: item.x, z: item.z },
      promptLabel: `Podnieś: ${ITEM_DEFS[item.kind].label}`,
      item: { id: item.id, kind: item.kind, source: 'world' },
    })
  }

  for (const node of itemSpawners.nodes()) {
    if (node.collected) continue
    list.push({
      kind: 'item',
      position: { x: node.x, z: node.z },
      promptLabel: `Podnieś: ${ITEM_DEFS[node.kind].label}`,
      item: { id: node.id, kind: node.kind, source: 'spawner' },
    })
  }

  for (const item of droppedItems.nodes()) {
    list.push({
      kind: 'item',
      position: { x: item.x, z: item.z },
      promptLabel: `Podnieś: ${ITEM_DEFS[item.kind].label}`,
      item: { id: item.id, kind: item.kind, source: 'dropped' },
    })
  }

  return list
}

/** Routes a picked-up `WorldItemRef` to whichever registry it came from —
 *  world-generated (finite, id-based collected set), the renewable pool near
 *  the settlement, or a player drop. */
function collectItem(
  ref: WorldItemRef,
  chunkManager: ChunkManager,
  itemSpawners: ItemSpawners,
  droppedItems: DroppedItems,
): { kind: ItemKind, x: number, z: number } | null {
  switch (ref.source) {
    case 'dropped':
      return droppedItems.collect(ref.id)
    case 'spawner':
      return itemSpawners.collect(ref.id)
    case 'world':
      return chunkManager.collectItem(ref.id)
  }
}

/** Smallest `timeOfDay` change (fraction of a day) worth reapplying sky/light/fog/water
 *  uniforms for — below this the visual change is sub-pixel at any `dayLengthSec`
 *  worth playing at, so re-running `applyDayNight` every frame is wasted work. */
const DAY_NIGHT_APPLY_THRESHOLD = 1 / 2000

/** Wraparound-aware distance between two `timeOfDay` values (both in [0,1)). */
function timeOfDayDelta(a: number, b: number): number {
  const diff = Math.abs(a - b) % 1
  return Math.min(diff, 1 - diff)
}

function applyDayNight(
  timeOfDay: number,
  sky: ReturnType<typeof createSky>,
  lights: ReturnType<typeof createLights>,
  scene: Scene,
  chunkManager: ChunkManager,
  ocean: WorldOcean,
): void {
  const p = skyParamsFromTime(timeOfDay)
  sky.setParams(
    {
      inclination: p.inclination,
      azimuth: p.azimuth,
      turbidity: p.turbidity,
      rayleigh: p.rayleigh,
    },
    lights.sun,
  )
  lights.sun.intensity = p.sunIntensity
  lights.ambient.intensity = p.ambientIntensity
  lights.hemi.intensity = p.hemiIntensity
  const fog = scene.fog
  if (fog instanceof Fog) {
    fog.color.setHex(p.fogColor)
    fog.near = p.fogNear
    fog.far = p.fogFar
  }
  chunkManager.setWaterDayNight(p.dayFactor)
  chunkManager.setGrassDayNight(p.dayFactor)
  ocean.setDayNight(p.dayFactor, sky.sunPosition)
}

function buildChunkManager(
  scene: Scene,
  config: ReturnType<typeof createWorldConfig>,
  collectedItemIds: Set<string>,
): ChunkManager {
  const cfg: ChunkManagerConfig = {
    chunkSize: config.terrain.chunkSize,
    resolution: config.terrain.resolution,
    loadRadius: config.terrain.loadRadius,
    unloadRadius: config.terrain.unloadRadius,
    homeChunks: homeChunks(),
    seed: config.seed,
    heightScale: config.terrain.heightScale,
    waterLevel: config.terrain.waterLevel,
    noiseScale: config.terrain.noiseScale,
    fbm: config.terrain.fbm,
    biome: config.terrain.biome,
    region: config.terrain.region,
    settlementSearchRadius: HOME_RADIUS,
    flatShading: config.terrain.flatShading,
    collectedItemIds,
    grass: config.terrain.grass,
    detailNormal: config.terrain.detailNormal,
  }
  return createChunkManager(scene, cfg)
}

function buildOcean(
  scene: Scene,
  config: ReturnType<typeof createWorldConfig>,
): WorldOcean {
  // Generously covers the loaded region so it never runs out under the player;
  // repositioned (not resized) as the player moves — see createOcean.follow().
  const size = (config.terrain.unloadRadius * 2 + 4) * config.terrain.chunkSize
  const ocean = createOcean(size, config.terrain.waterLevel)
  ocean.addTo(scene)
  return ocean
}

function buildSettlementsManager(
  scene: Scene,
  chunkManager: ChunkManager,
  seed: number,
  playSound: (url: string, volume?: number) => void,
  config: ReturnType<typeof createWorldConfig>,
): Promise<SettlementsManager> {
  return createSettlementsManager(
    scene,
    chunkManager.sampleHeight,
    chunkManager.waterLevel,
    HOME_RADIUS,
    seed,
    playSound,
    SETTLEMENT_LOAD_RADIUS,
    SETTLEMENT_UNLOAD_RADIUS,
    {
      sampleContinentalness: chunkManager.sampleContinentalness,
      sampleMountainRidge: chunkManager.sampleMountainRidge,
      sampleMoistureRegion: chunkManager.sampleMoistureRegion,
    },
    config.terrain.heightScale,
    config.terrain.region,
  )
}

function buildFauna(
  scene: Scene,
  chunkManager: ChunkManager,
  settlement: Settlement,
  seed: number,
): Promise<Fauna> {
  return createFauna(
    scene,
    chunkManager.sampleHeight,
    chunkManager.sampleForestFactor,
    chunkManager.waterLevel,
    HOME_RADIUS,
    settlement.center,
    seed,
  )
}

function buildItemSpawners(
  scene: Scene,
  chunkManager: ChunkManager,
  settlement: Settlement,
  seed: number,
): ItemSpawners {
  return createItemSpawners(
    scene,
    chunkManager.sampleHeight,
    chunkManager.waterLevel,
    HOME_RADIUS,
    settlement.center,
    settlement.landmarks.trees,
    seed,
  )
}
