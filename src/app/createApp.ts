import { Clock, Fog, type Scene, type Vector3 } from 'three'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import type { NpcAgent } from '../ai/NpcAgent'
import type { AnimalAgent } from '../fauna/AnimalAgent'
import type { Interactable, WorldItemRef } from '../interaction/Interactable'
import type { SaveData } from '../persistence/saveData'
import type { Settlement } from '../settlement/createSettlement'
import type { ChunkCoord } from '../terrain/chunkGrid'
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
import { createTouchControls } from '../input/createTouchControls'
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
import { QuestManager } from '../quests/QuestManager'
import { createPostProcessing } from '../render/createPostProcessing'
import { createRenderer } from '../render/createRenderer'
import { createCamera } from '../scene/createCamera'
import { createScene } from '../scene/createScene'
import { createSettlementsManager, type SettlementsManager } from '../settlement/SettlementsManager'
import {
  type ChunkManager,
  type ChunkManagerConfig,
  createChunkManager,
} from '../terrain/chunkManager'
import { disposeChunkWorkerPool } from '../terrain/chunkWorkerPool'
import { createDebugGui } from '../ui/createDebugGui'
import { createHud } from '../ui/createHud'
import { createLoadingScreen } from '../ui/createLoadingScreen'
import { createMinimap, type MinimapSettlement } from '../ui/createMinimap'
import { createNpcDialog } from '../ui/createNpcDialog'
import { createPauseMenu } from '../ui/createPauseMenu'
import { createQuestLog } from '../ui/createQuestLog'
import { createVillagersScreen } from '../ui/createVillagersScreen'
import { createLights } from '../world/createLights'
import { createOcean, type WorldOcean } from '../world/createOcean'
import { createSky } from '../world/createSky'
import {
  createDayNightState,
  skyParamsFromTime,
  tickDayNight,
} from '../world/dayNight'
import { randomSeed, syncSeedInUrl } from '../world/parseSeed'

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

type Highlightable = NpcAgent | AnimalAgent

/** 3×3 block of chunks around the origin, pinned so the settlement never streams
 *  out from under itself. */
function homeChunks(): ChunkCoord[] {
  const coords: ChunkCoord[] = []
  for (let cz = -1; cz <= 1; cz++) {
    for (let cx = -1; cx <= 1; cx++) coords.push({ cx, cz })
  }
  return coords
}

export async function createApp(
  container: HTMLElement,
  initialSave?: SaveData | null,
): Promise<() => void> {
  document.body.classList.toggle('seedvale-touch', isTouchDevice())

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

  const dayNight = createDayNightState()

  const renderer = createRenderer(container)
  const labelRenderer = new CSS2DRenderer()
  labelRenderer.setSize(container.clientWidth, container.clientHeight)
  labelRenderer.domElement.style.position = 'absolute'
  labelRenderer.domElement.style.inset = '0'
  labelRenderer.domElement.style.pointerEvents = 'none'
  container.appendChild(labelRenderer.domElement)

  const scene = createScene()
  const camera = createCamera(container.clientWidth / container.clientHeight)
  const worldAudio = createWorldAudio(camera)
  const ambientAudio = createAmbientAudio(worldAudio)

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

  let ocean = buildOcean(scene, config)
  let settlementsManager = await buildSettlementsManager(scene, chunkManager, config.seed, worldAudio.playOnce)
  let fauna = await buildFauna(scene, chunkManager, settlementsManager.home, config.seed)
  let itemSpawners = buildItemSpawners(scene, chunkManager, settlementsManager.home, config.seed)
  let droppedItems = createDroppedItems(scene, chunkManager.sampleHeight, initialSave?.droppedItems ?? [])
  const inventory = new Inventory(initialSave?.inventory)

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

  const hud = createHud(container)
  hud.setSeed(config.seed)
  hud.setTime(dayNight.timeOfDay)

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
  hud.setInventory(inventory.toJSON())

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
      settlementsManager.dispose()
      ocean.dispose()
      chunkManager.dispose()
      if (resetCollectedItems) collectedItemIds = new Set()

      chunkManager = buildChunkManager(scene, config, collectedItemIds)
      chunkManager.update(0, 0)
      await chunkManager.waitForChunks(homeChunks())

      ocean = buildOcean(scene, config)
      settlementsManager = await buildSettlementsManager(scene, chunkManager, config.seed, worldAudio.playOnce)
      fauna = await buildFauna(scene, chunkManager, settlementsManager.home, config.seed)
      itemSpawners = buildItemSpawners(scene, chunkManager, settlementsManager.home, config.seed)
      droppedItems = createDroppedItems(scene, chunkManager.sampleHeight, carriedDrops)
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
    version: 3,
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
  })

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
  const villagersScreen = createVillagersScreen(container)
  const openQuestLog = () => {
    questLog.open()
    questLog.refresh(questManager.list(), questManager.getExp(), (name) =>
      questManager.getRelation(name),
    )
  }
  const openVillagers = () => {
    villagersScreen.open()
    villagersScreen.refresh(settlementsManager.getLoaded().flatMap((s) => s.npcs))
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
    onToggleGui: () => gui.toggle(),
    onNameChange: (name) => player.setName(name),
    onNameCommit: (name) => {
      config.player.name = name
      saveWorldConfig(config)
    },
    onSave: () => {
      void writeSave(buildSaveData())
    },
    onNewGame: () => {
      if (!window.confirm('Start a new game? Your saved progress will be cleared.')) return
      void clearSave()
      config.seed = randomSeed()
      void rebuildWorld(true)
    },
  })

  const touchControls = isTouchDevice()
    ? createTouchControls(container, keyboard.state, mouseLook.state, {
        onPauseToggle: () => pauseMenu.togglePause(),
      })
    : null

  const onBeforeUnload = () => {
    void writeSave(buildSaveData())
  }
  window.addEventListener('beforeunload', onBeforeUnload)

  applyDayNight(dayNight.timeOfDay, sky, lights, scene, chunkManager, ocean)

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

  const tick = () => {
    frameId = requestAnimationFrame(tick)
    const dt = Math.min(clock.getDelta(), 0.05)
    const menuPaused = pauseMenu.isPaused()

    if (menuPaused) {
      // drop stale presses so they can't fire right after resume
      keyboard.consumeInteract()
      keyboard.consumeQuestLog()
      keyboard.consumeDrop()
      setHighlight(null)
    } else if (npcDialog.isOpen()) {
      npcDialog.setPrompt(null)
      keyboard.consumeQuestLog()
      keyboard.consumeDrop()
      setHighlight(null)
      if (keyboard.consumeInteract()) {
        if (npcDialog.isOffer()) npcDialog.accept()
        else npcDialog.close()
      }
    } else if (questLog.isOpen()) {
      keyboard.consumeInteract()
      keyboard.consumeDrop()
      setHighlight(null)
      if (keyboard.consumeQuestLog()) questLog.close()
    } else if (villagersScreen.isOpen()) {
      keyboard.consumeInteract()
      keyboard.consumeQuestLog()
      keyboard.consumeDrop()
      setHighlight(null)
    } else {
      const interactables = buildInteractables(
        settlementsManager.getLoaded(),
        fauna,
        chunkManager,
        itemSpawners,
        droppedItems,
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
          const collected = collectItem(target.item, chunkManager, itemSpawners, droppedItems)
          if (collected) {
            inventory.add(collected.kind)
            hud.setInventory(inventory.toJSON())
          }
        } else {
          const outcome = resolveInteraction(target, questManager)
          npcDialog.open(outcome.speakerName, outcome.line, outcome.offer)
        }
      }
      if (keyboard.consumeQuestLog()) openQuestLog()
      if (keyboard.consumeDrop()) {
        let dropOffset = 0
        for (const kind of Object.keys(ITEM_DEFS) as ItemKind[]) {
          if (!inventory.remove(kind, 1)) continue
          const angle = dropOffset * ((Math.PI * 2) / 3)
          droppedItems.drop(
            kind,
            player.mesh.position.x + Math.cos(angle) * 0.6,
            player.mesh.position.z + Math.sin(angle) * 0.6,
          )
          dropOffset++
        }
        if (dropOffset > 0) hud.setInventory(inventory.toJSON())
      }
    }

    if (!menuPaused && !npcDialog.isOpen() && !questLog.isOpen() && !villagersScreen.isOpen()) {
      for (const s of settlementsManager.getLoaded()) {
        for (const npc of s.npcs) {
          npc.setQuestMarker(questManager.labelMarker(npc.name))
        }
      }
      for (const spawner of fauna.getSpawners()) {
        fauna.setSpawnerMarker(spawner.type, questManager.spawnerMarker(spawner.type))
      }
      tickDayNight(dayNight, dt)
      if (dayNight.enabled) {
        applyDayNight(dayNight.timeOfDay, sky, lights, scene, chunkManager, ocean)
      }
      ambientAudio.update(skyParamsFromTime(dayNight.timeOfDay).dayFactor)
      hud.setTime(dayNight.timeOfDay)
      hud.setExp(questManager.getExp())
      player.update(dt)
      chunkManager.update(player.mesh.position.x, player.mesh.position.z)
      lights.follow(player.mesh.position.x, player.mesh.position.z)
      ocean.follow(player.mesh.position.x, player.mesh.position.z)
      settlementsManager.update(dt, player.mesh.position)
      fauna.update(dt, player.mesh.position, dayNight.timeOfDay)
      itemSpawners.update(dt, player.mesh.position)
      chunkManager.tickWater(dt)
      chunkManager.tickGrass(dt)
      ocean.update(dt)
      worldAudio.update(dt)
      minimap.update(
        player.mesh.position,
        settlementsManager.getLoaded().map((s): MinimapSettlement => ({ position: s.center, npcs: s.npcs })),
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
    window.removeEventListener('beforeunload', onBeforeUnload)
    gui.dispose()
    pauseMenu.dispose()
    npcDialog.dispose()
    questLog.dispose()
    villagersScreen.dispose()
    hud.dispose()
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
    droppedItems.dispose()
    settlementsManager.dispose()
    chunkManager.dispose()
    player.dispose()
    disposeChunkWorkerPool()
    postProcessing.dispose()
    labelRenderer.domElement.remove()
    renderer.dispose()
    renderer.domElement.remove()
  }
}

/** Assembles this frame's `Interactable` candidates from every world system —
 *  NPCs, the well/trees (settlement landmarks), live fauna, fauna spawn points,
 *  and nearby pickup items (world-generated + the renewable pool + player-dropped).
 *  Cheap: a few dozen objects total, dominated by settlement trees. */
function buildInteractables(
  settlements: readonly Settlement[],
  fauna: Fauna,
  chunkManager: ChunkManager,
  itemSpawners: ItemSpawners,
  droppedItems: DroppedItems,
  playerPos: Vector3,
): Interactable[] {
  const list: Interactable[] = []

  for (const settlement of settlements) {
    for (const npc of settlement.npcs) {
      list.push({
        kind: 'npc',
        position: npc.mesh.position,
        promptLabel: `Rozmawiaj z ${npc.name}`,
        npc,
      })
    }

    list.push({
      kind: 'well',
      position: settlement.landmarks.well,
      promptLabel: 'Zaczerpnij wody',
    })

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
    flatShading: config.terrain.flatShading,
    collectedItemIds,
    grass: config.terrain.grass,
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
    seed,
  )
}
