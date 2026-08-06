import { Clock, type Material, type Scene } from 'three'
import { createWorldConfig } from '../config/worldConfig'
import { createKeyboard } from '../input/Keyboard'
import { createMouseLook } from '../input/MouseLook'
import { PlayerController } from '../player/PlayerController'
import { createRenderer } from '../render/createRenderer'
import { createCamera } from '../scene/createCamera'
import { createScene } from '../scene/createScene'
import { createTerrainMesh, type Terrain } from '../terrain/createTerrainMesh'
import {
  generateHeightmap,
  heightmapParamsFromConfig,
} from '../terrain/generateHeightmap'
import { createDebugGui } from '../ui/createDebugGui'
import { createLights } from '../world/createLights'
import { createSky } from '../world/createSky'
import { syncSeedInUrl } from '../world/parseSeed'

export function createApp(container: HTMLElement): () => void {
  const config = createWorldConfig()

  const renderer = createRenderer(container)
  const scene = createScene()
  const camera = createCamera(container.clientWidth / container.clientHeight)

  const lights = createLights()
  lights.addTo(scene)

  const sky = createSky(config.sky)
  sky.addTo(scene)
  sky.applySun(lights.sun)

  let terrain = buildTerrain(scene, config)

  const keyboard = createKeyboard()
  const mouseLook = createMouseLook(renderer.domElement)
  const player = new PlayerController(
    camera,
    keyboard.state,
    mouseLook.state,
    terrain.sampleHeight,
    terrain.halfExtent,
  )
  scene.add(player.mesh)

  const rebuildTerrain = () => {
    syncSeedInUrl(config.seed)
    terrain.mesh.removeFromParent()
    terrain.dispose()
    terrain = buildTerrain(scene, config)
    player.setGround(terrain.sampleHeight, terrain.halfExtent)
  }

  const updateSky = () => {
    sky.setParams(config.sky, lights.sun)
  }

  const gui = config.showGui
    ? createDebugGui(config, {
        onTerrainChange: rebuildTerrain,
        onSkyChange: updateSky,
      })
    : null

  const clock = new Clock()
  let frameId = 0

  const onResize = () => {
    const width = container.clientWidth
    const height = container.clientHeight
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height)
  }
  window.addEventListener('resize', onResize)

  const tick = () => {
    frameId = requestAnimationFrame(tick)
    const dt = Math.min(clock.getDelta(), 0.05)
    player.update(dt)
    renderer.render(scene, camera)
  }
  tick()

  return () => {
    cancelAnimationFrame(frameId)
    window.removeEventListener('resize', onResize)
    gui?.dispose()
    keyboard.dispose()
    mouseLook.dispose()
    sky.dispose()
    terrain.dispose()
    player.mesh.geometry.dispose()
    ;(player.mesh.material as Material).dispose()
    renderer.dispose()
    renderer.domElement.remove()
  }
}

function buildTerrain(
  scene: Scene,
  config: ReturnType<typeof createWorldConfig>,
): Terrain {
  const heightmap = generateHeightmap(heightmapParamsFromConfig(config))
  const terrain = createTerrainMesh(heightmap)
  scene.add(terrain.mesh)
  return terrain
}
