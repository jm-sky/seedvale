import { Clock, Fog, type Scene } from 'three'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
import type { ChunkCoord } from '../terrain/chunkGrid'
import { saveWorldConfig } from '../config/persistConfig'
import { createWorldConfig } from '../config/worldConfig'
import { createFauna, type Fauna } from '../fauna/createFauna'
import { createKeyboard } from '../input/Keyboard'
import { createMouseLook } from '../input/MouseLook'
import { PlayerController } from '../player/PlayerController'
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
import { createPauseMenu } from '../ui/createPauseMenu'
import { createLights } from '../world/createLights'
import { createOcean, type WorldOcean } from '../world/createOcean'
import { createSky } from '../world/createSky'
import {
  createDayNightState,
  skyParamsFromTime,
  tickDayNight,
} from '../world/dayNight'
import { syncSeedInUrl } from '../world/parseSeed'

/** Fixed radius (world units) for settlement/fauna spatial logic — deliberately
 *  independent of the streamed terrain's loaded region, so the village and its
 *  animals behave identically whether the player is standing right there or has
 *  wandered many chunks away. */
const HOME_RADIUS = 56

/** 3×3 block of chunks around the origin, pinned so the settlement never streams
 *  out from under itself. */
function homeChunks(): ChunkCoord[] {
  const coords: ChunkCoord[] = []
  for (let cz = -1; cz <= 1; cz++) {
    for (let cx = -1; cx <= 1; cx++) coords.push({ cx, cz })
  }
  return coords
}

export async function createApp(container: HTMLElement): Promise<() => void> {
  const loadingScreen = createLoadingScreen(container)

  const config = createWorldConfig()
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

  const lights = createLights()
  lights.addTo(scene)

  const sky = createSky(config.sky)
  sky.addTo(scene)
  sky.applySun(lights.sun)

  let chunkManager = buildChunkManager(scene, config)
  chunkManager.update(0, 0)
  await chunkManager.waitForChunks(homeChunks())

  let ocean = buildOcean(scene, config)
  let settlement = await buildSettlement(scene, chunkManager, config.seed)
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
  player.setPosition(settlement.spawn.x, settlement.spawn.z)
  player.setName(config.player.name)
  scene.add(player.mesh)

  const hud = createHud(container)
  hud.setSeed(config.seed)
  hud.setTime(dayNight.timeOfDay)

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
      settlement = await buildSettlement(scene, chunkManager, config.seed)
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

  const updateSkyFromGui = () => {
    dayNight.enabled = false
    sky.setParams(config.sky, lights.sun)
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
  })
  if (!config.showGui) gui.toggle()

  const pauseMenu = createPauseMenu(container, config.seed, config.player.name, {
    onPause: () => {
      if (document.pointerLockElement === renderer.domElement) {
        document.exitPointerLock()
      }
    },
    onResume: () => {},
    onToggleGui: () => gui.toggle(),
    onNameChange: (name) => player.setName(name),
    onNameCommit: (name) => {
      config.player.name = name
      saveWorldConfig(config)
    },
  })

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
  }
  window.addEventListener('resize', onResize)

  const tick = () => {
    frameId = requestAnimationFrame(tick)
    const dt = Math.min(clock.getDelta(), 0.05)
    if (!pauseMenu.isPaused()) {
      tickDayNight(dayNight, dt)
      if (dayNight.enabled) {
        applyDayNight(dayNight.timeOfDay, sky, lights, scene, chunkManager, ocean)
      }
      hud.setTime(dayNight.timeOfDay)
      player.update(dt)
      chunkManager.update(player.mesh.position.x, player.mesh.position.z)
      lights.follow(player.mesh.position.x, player.mesh.position.z)
      ocean.follow(player.mesh.position.x, player.mesh.position.z)
      settlement.update(dt, player.mesh.position)
      fauna.update(dt, player.mesh.position)
      chunkManager.tickWater(dt)
      ocean.update(dt)
    }
    renderer.render(scene, camera)
    labelRenderer.render(scene, camera)
  }
  tick()
  loadingScreen.hide()

  return () => {
    cancelAnimationFrame(frameId)
    window.removeEventListener('resize', onResize)
    gui.dispose()
    pauseMenu.dispose()
    hud.dispose()
    keyboard.dispose()
    mouseLook.dispose()
    sky.dispose()
    ocean.dispose()
    fauna.dispose()
    settlement.dispose()
    chunkManager.dispose()
    player.dispose()
    disposeChunkWorkerPool()
    labelRenderer.domElement.remove()
    renderer.dispose()
    renderer.domElement.remove()
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
    flatShading: config.terrain.flatShading,
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
): Promise<Settlement> {
  return createSettlement(
    scene,
    chunkManager.sampleHeight,
    chunkManager.waterLevel,
    HOME_RADIUS,
    seed,
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
