import { Clock, type Material } from 'three'
import { createKeyboard } from '../input/Keyboard'
import { createMouseLook } from '../input/MouseLook'
import { PlayerController } from '../player/PlayerController'
import { createRenderer } from '../render/createRenderer'
import { createCamera } from '../scene/createCamera'
import { createScene } from '../scene/createScene'
import { createTerrainMesh } from '../terrain/createTerrainMesh'
import { generateHeightmap } from '../terrain/generateHeightmap'
import { createLights } from '../world/createLights'
import { parseSeedFromUrl } from '../world/parseSeed'

export function createApp(container: HTMLElement): () => void {
  const renderer = createRenderer(container)
  const scene = createScene()
  const camera = createCamera(container.clientWidth / container.clientHeight)

  createLights().addTo(scene)

  const seed = parseSeedFromUrl()
  const heightmap = generateHeightmap({
    size: 128,
    resolution: 129,
    seed,
    heightScale: 16,
    waterLevel: 0.4,
  })
  const terrain = createTerrainMesh(heightmap)
  scene.add(terrain.mesh)

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
    keyboard.dispose()
    mouseLook.dispose()
    terrain.dispose()
    player.mesh.geometry.dispose()
    ;(player.mesh.material as Material).dispose()
    renderer.dispose()
    renderer.domElement.remove()
  }
}
