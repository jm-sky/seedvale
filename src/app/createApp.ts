import { Clock, Fog, type Material, type Scene } from 'three'
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
import {
  generateHeightmap,
  heightmapParamsFromConfig,
} from '../terrain/generateHeightmap'
import { createDebugGui } from '../ui/createDebugGui'
import { createHud } from '../ui/createHud'
import { createLights } from '../world/createLights'
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

  let terrain = buildTerrain(scene, config)
  let water = buildWater(scene, terrain)
  let settlement = await buildSettlement(scene, terrain, config.seed)
  let fauna = buildFauna(scene, terrain, settlement, config.seed)

  const keyboard = createKeyboard()
  const mouseLook = createMouseLook(renderer.domElement)
  const player = new PlayerController(
    camera,
    keyboard.state,
    mouseLook.state,
    terrain.sampleHeight,
    terrain.halfExtent,
  )
  player.setPosition(settlement.spawn.x, settlement.spawn.z)
  scene.add(player.mesh)

  const hud = createHud(container)
  hud.setSeed(config.seed)
  hud.setTime(dayNight.timeOfDay)

  const rebuildWorld = async () => {
    syncSeedInUrl(config.seed)
    saveWorldConfig(config)
    fauna.dispose()
    settlement.dispose()
    water.dispose()
    terrain.mesh.removeFromParent()
    terrain.dispose()
    terrain = buildTerrain(scene, config)
    water = buildWater(scene, terrain)
    settlement = await buildSettlement(scene, terrain, config.seed)
    fauna = buildFauna(scene, terrain, settlement, config.seed)
    player.setGround(terrain.sampleHeight, terrain.halfExtent)
    player.setPosition(settlement.spawn.x, settlement.spawn.z)
    hud.setSeed(config.seed)
  }

  const updateSkyFromGui = () => {
    dayNight.enabled = false
    sky.setParams(config.sky, lights.sun)
    saveWorldConfig(config)
  }

  const onDayNightChange = () => {
    if (dayNight.enabled) {
      applyDayNight(dayNight.timeOfDay, sky, lights, scene)
    }
  }

  const gui = config.showGui
    ? createDebugGui(config, dayNight, {
        onTerrainChange: () => {
          void rebuildWorld()
        },
        onSkyChange: updateSkyFromGui,
        onDayNightChange,
      })
    : null

  applyDayNight(dayNight.timeOfDay, sky, lights, scene)

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
    tickDayNight(dayNight, dt)
    if (dayNight.enabled) {
      applyDayNight(dayNight.timeOfDay, sky, lights, scene)
    }
    hud.setTime(dayNight.timeOfDay)
    player.update(dt)
    settlement.update(dt)
    fauna.update(dt)
    water.update(dt)
    renderer.render(scene, camera)
    labelRenderer.render(scene, camera)
  }
  tick()

  return () => {
    cancelAnimationFrame(frameId)
    window.removeEventListener('resize', onResize)
    gui?.dispose()
    hud.dispose()
    keyboard.dispose()
    mouseLook.dispose()
    sky.dispose()
    water.dispose()
    fauna.dispose()
    settlement.dispose()
    terrain.dispose()
    player.mesh.geometry.dispose()
    ;(player.mesh.material as Material).dispose()
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
}

function buildTerrain(
  scene: Scene,
  config: ReturnType<typeof createWorldConfig>,
): Terrain {
  const heightmap = generateHeightmap(heightmapParamsFromConfig(config))
  const terrain = createTerrainMesh(heightmap, config.terrain.flatShading)
  scene.add(terrain.mesh)
  return terrain
}

function buildWater(scene: Scene, terrain: Terrain): WorldWater {
  const water = createWater(terrain.heightmap)
  water.addTo(scene)
  return water
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
): Fauna {
  return createFauna(
    scene,
    terrain.sampleHeight,
    terrain.waterLevel,
    terrain.halfExtent,
    settlement.center,
    seed,
  )
}
