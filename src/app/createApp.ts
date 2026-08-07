import { Clock, Fog, type Scene } from 'three'
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'
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
import { createTerrainMesh, type Terrain } from '../terrain/createTerrainMesh'
import { heightmapParamsFromConfig } from '../terrain/generateHeightmap'
import {
  disposeHeightmapWorker,
  generateHeightmapAsync,
  HeightmapGenerationCancelledError,
} from '../terrain/heightmapWorkerPool'
import { createDebugGui } from '../ui/createDebugGui'
import { createHud } from '../ui/createHud'
import { createPauseMenu } from '../ui/createPauseMenu'
import { createLights } from '../world/createLights'
import { createOcean, type WorldOcean } from '../world/createOcean'
import { createSky } from '../world/createSky'
import { createWater, type WorldWater } from '../world/createWater'
import {
  createDayNightState,
  skyParamsFromTime,
  tickDayNight,
} from '../world/dayNight'
import { syncSeedInUrl } from '../world/parseSeed'

export async function createApp(container: HTMLElement): Promise<() => void> {
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

  let terrain = await buildTerrain(scene, config)
  let water = buildWater(scene, terrain)
  let ocean = buildOcean(scene, terrain)
  let settlement = await buildSettlement(scene, terrain, config.seed)
  let fauna = await buildFauna(scene, terrain, settlement, config.seed)

  const keyboard = createKeyboard()
  const mouseLook = createMouseLook(renderer.domElement)
  const player = await PlayerController.create(
    camera,
    keyboard.state,
    mouseLook.state,
    terrain.sampleHeight,
    terrain.sampleFloor,
    terrain.waterLevel,
    terrain.halfExtent,
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
      water.dispose()
      ocean.dispose()
      terrain.mesh.removeFromParent()
      terrain.dispose()
      terrain = await buildTerrain(scene, config)
      water = buildWater(scene, terrain)
      ocean = buildOcean(scene, terrain)
      settlement = await buildSettlement(scene, terrain, config.seed)
      fauna = await buildFauna(scene, terrain, settlement, config.seed)
      player.setGround(
        terrain.sampleHeight,
        terrain.sampleFloor,
        terrain.waterLevel,
        terrain.halfExtent,
      )
      player.setPosition(settlement.spawn.x, settlement.spawn.z)
      hud.setSeed(config.seed)
      pauseMenu.setSeed(config.seed)
    } catch (err) {
      if (!(err instanceof HeightmapGenerationCancelledError)) throw err
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
      applyDayNight(dayNight.timeOfDay, sky, lights, scene, water, ocean)
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

  applyDayNight(dayNight.timeOfDay, sky, lights, scene, water, ocean)

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
        applyDayNight(dayNight.timeOfDay, sky, lights, scene, water, ocean)
      }
      hud.setTime(dayNight.timeOfDay)
      player.update(dt)
      settlement.update(dt, player.mesh.position)
      fauna.update(dt, player.mesh.position)
      water.update(dt)
      ocean.update(dt)
    }
    renderer.render(scene, camera)
    labelRenderer.render(scene, camera)
  }
  tick()

  return () => {
    cancelAnimationFrame(frameId)
    window.removeEventListener('resize', onResize)
    gui.dispose()
    pauseMenu.dispose()
    hud.dispose()
    keyboard.dispose()
    mouseLook.dispose()
    sky.dispose()
    water.dispose()
    ocean.dispose()
    fauna.dispose()
    settlement.dispose()
    terrain.dispose()
    player.dispose()
    disposeHeightmapWorker()
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
  water: WorldWater,
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
  water.setDayNight(p.dayFactor)
  ocean.setDayNight(p.dayFactor, sky.sunPosition)
}

async function buildTerrain(
  scene: Scene,
  config: ReturnType<typeof createWorldConfig>,
): Promise<Terrain> {
  const heightmap = await generateHeightmapAsync(heightmapParamsFromConfig(config))
  const terrain = createTerrainMesh(heightmap, config.terrain.flatShading)
  scene.add(terrain.mesh)
  return terrain
}

function buildWater(scene: Scene, terrain: Terrain): WorldWater {
  const water = createWater(terrain.heightmap)
  water.addTo(scene)
  return water
}

function buildOcean(scene: Scene, terrain: Terrain): WorldOcean {
  const ocean = createOcean(terrain.heightmap)
  ocean.addTo(scene)
  return ocean
}

function buildSettlement(
  scene: Scene,
  terrain: Terrain,
  seed: number,
): Promise<Settlement> {
  return createSettlement(
    scene,
    terrain.sampleHeight,
    terrain.waterLevel,
    terrain.halfExtent,
    seed,
  )
}

function buildFauna(
  scene: Scene,
  terrain: Terrain,
  settlement: Settlement,
  seed: number,
): Promise<Fauna> {
  return createFauna(
    scene,
    terrain.sampleHeight,
    terrain.waterLevel,
    terrain.halfExtent,
    settlement.center,
    seed,
  )
}
