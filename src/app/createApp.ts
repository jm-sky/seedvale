import { Clock, Fog, type Scene, type Vector3 } from 'three'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import type { NpcAgent } from '../ai/NpcAgent'
import type { SaveData } from '../persistence/saveData'
import type { ChunkCoord } from '../terrain/chunkGrid'
import { createWorldAudio } from '../audio/createWorldAudio'
import { saveWorldConfig } from '../config/persistConfig'
import { createWorldConfig } from '../config/worldConfig'
import { createFauna, type Fauna } from '../fauna/createFauna'
import { createKeyboard } from '../input/Keyboard'
import { createMouseLook } from '../input/MouseLook'
import { clearSave, writeSave } from '../persistence/saveDb'
import { PlayerController } from '../player/PlayerController'
import { QuestManager } from '../quests/QuestManager'
import { createPostProcessing } from '../render/createPostProcessing'
import { createRenderer } from '../render/createRenderer'
import { createCamera } from '../scene/createCamera'
import { createScene } from '../scene/createScene'
import { createSettlement, type Settlement } from '../settlement/createSettlement'
import {
  type ChunkManager,
  type ChunkManagerConfig,
  createChunkManager,
} from '../terrain/chunkManager'
import { disposeChunkWorkerPool } from '../terrain/chunkWorkerPool'
import { createDebugGui } from '../ui/createDebugGui'
import { createHud } from '../ui/createHud'
import { createLoadingScreen } from '../ui/createLoadingScreen'
import { createMinimap } from '../ui/createMinimap'
import { createNpcDialog } from '../ui/createNpcDialog'
import { createPauseMenu } from '../ui/createPauseMenu'
import { createQuestLog } from '../ui/createQuestLog'
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

/** How close (world units) the player must be to an NPC before it becomes interactable. */
const INTERACT_RANGE = 2.5
/** Minimum dot(playerForward, toNpc) to count as "looking at" — ~60° half-angle cone,
 *  needed so a dense cluster of NPCs doesn't pick whichever is merely nearest. */
const INTERACT_MIN_DOT = 0.5

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
  const loadingScreen = createLoadingScreen(container)

  const config = createWorldConfig()
  if (initialSave) {
    config.seed = initialSave.config.seed
    config.terrain = structuredClone(initialSave.config.terrain)
    config.sky = { ...initialSave.config.sky }
    config.player = { ...initialSave.config.player }
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

  let chunkManager = buildChunkManager(scene, config)
  chunkManager.update(0, 0)
  await chunkManager.waitForChunks(homeChunks())

  let ocean = buildOcean(scene, config)
  let settlement = await buildSettlement(scene, chunkManager, config.seed, worldAudio.playOnce)
  let fauna = await buildFauna(scene, chunkManager, settlement, config.seed)

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
    player.setPosition(settlement.spawn.x, settlement.spawn.z)
  }
  player.setName(config.player.name)
  scene.add(player.mesh)

  const hud = createHud(container)
  hud.setSeed(config.seed)
  hud.setTime(dayNight.timeOfDay)

  const minimap = createMinimap(container)
  const questManager = new QuestManager(undefined, worldAudio.playOnce)

  let rebuilding = false
  const rebuildWorld = async () => {
    if (rebuilding) return
    rebuilding = true
    gui.setBusy(true)
    try {
      syncSeedInUrl(config.seed)
      saveWorldConfig(config)
      fauna.dispose()
      settlement.dispose()
      ocean.dispose()
      chunkManager.dispose()

      chunkManager = buildChunkManager(scene, config)
      chunkManager.update(0, 0)
      await chunkManager.waitForChunks(homeChunks())

      ocean = buildOcean(scene, config)
      settlement = await buildSettlement(scene, chunkManager, config.seed, worldAudio.playOnce)
      fauna = await buildFauna(scene, chunkManager, settlement, config.seed)
      player.setGround(chunkManager.sampleHeight, chunkManager.sampleFloor, chunkManager.waterLevel)
      player.setPosition(settlement.spawn.x, settlement.spawn.z)
      hud.setSeed(config.seed)
      pauseMenu.setSeed(config.seed)
    } finally {
      gui.setBusy(false)
      rebuilding = false
    }
  }

  const buildSaveData = (): SaveData => ({
    version: 1,
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
  const openQuestLog = () => {
    questLog.open()
    questLog.refresh(questManager.list(), questManager.getExp(), (name) =>
      questManager.getRelation(name),
    )
  }

  const pauseMenu = createPauseMenu(container, config.seed, config.player.name, {
    onPause: () => {
      if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock()
      }
    },
    onResume: () => {},
    onQuestLog: openQuestLog,
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
      void rebuildWorld()
    },
  })

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
    } else if (npcDialog.isOpen()) {
      npcDialog.setPrompt(null)
      keyboard.consumeQuestLog()
      if (keyboard.consumeInteract()) {
        if (npcDialog.isOffer()) npcDialog.accept()
        else npcDialog.close()
      }
    } else if (questLog.isOpen()) {
      keyboard.consumeInteract()
      if (keyboard.consumeQuestLog()) questLog.close()
    } else {
      const target = findInteractionTarget(
        player.mesh.position,
        mouseLook.state.yaw,
        settlement.npcs,
      )
      npcDialog.setPrompt(target ? target.name : null)
      const interactPressed = keyboard.consumeInteract()
      if (target && interactPressed) {
        const questOverride = questManager.onInteract(target.name)
        if (questOverride) {
          npcDialog.open(target.name, questOverride.line, questOverride.offer)
        } else {
          npcDialog.open(target.name, target.getDialogueLine())
        }
      }
      if (keyboard.consumeQuestLog()) openQuestLog()
    }

    if (!menuPaused && !npcDialog.isOpen() && !questLog.isOpen()) {
      for (const npc of settlement.npcs) {
        npc.setQuestMarker(questManager.labelMarker(npc.name))
      }
      tickDayNight(dayNight, dt)
      if (dayNight.enabled) {
        applyDayNight(dayNight.timeOfDay, sky, lights, scene, chunkManager, ocean)
      }
      hud.setTime(dayNight.timeOfDay)
      hud.setExp(questManager.getExp())
      player.update(dt)
      chunkManager.update(player.mesh.position.x, player.mesh.position.z)
      lights.follow(player.mesh.position.x, player.mesh.position.z)
      ocean.follow(player.mesh.position.x, player.mesh.position.z)
      settlement.update(dt, player.mesh.position)
      fauna.update(dt, player.mesh.position, dayNight.timeOfDay)
      chunkManager.tickWater(dt)
      chunkManager.tickGrass(dt)
      ocean.update(dt)
      worldAudio.update(dt)
      minimap.update(player.mesh.position, settlement.center, settlement.npcs)
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
    hud.dispose()
    minimap.dispose()
    keyboard.dispose()
    mouseLook.dispose()
    sky.dispose()
    ocean.dispose()
    worldAudio.dispose()
    fauna.dispose()
    settlement.dispose()
    chunkManager.dispose()
    player.dispose()
    disposeChunkWorkerPool()
    postProcessing.dispose()
    labelRenderer.domElement.remove()
    renderer.dispose()
    renderer.domElement.remove()
  }
}

/** Nearest-in-front NPC within range, using dot(playerForward, toNpc) so a dense
 *  cluster resolves to whichever one the player is actually looking at. */
function findInteractionTarget(
  playerPos: Vector3,
  playerYaw: number,
  npcs: readonly NpcAgent[],
): NpcAgent | null {
  const forwardX = -Math.sin(playerYaw)
  const forwardZ = -Math.cos(playerYaw)
  let best: NpcAgent | null = null
  let bestDot = INTERACT_MIN_DOT
  for (const npc of npcs) {
    const dx = npc.mesh.position.x - playerPos.x
    const dz = npc.mesh.position.z - playerPos.z
    const dist = Math.hypot(dx, dz)
    if (dist < 1e-4 || dist > INTERACT_RANGE) continue
    const dot = (dx / dist) * forwardX + (dz / dist) * forwardZ
    if (dot > bestDot) {
      bestDot = dot
      best = npc
    }
  }
  return best
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

function buildSettlement(
  scene: Scene,
  chunkManager: ChunkManager,
  seed: number,
  playSound: (url: string, volume?: number) => void,
): Promise<Settlement> {
  return createSettlement(
    scene,
    chunkManager.sampleHeight,
    chunkManager.waterLevel,
    HOME_RADIUS,
    seed,
    playSound,
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
