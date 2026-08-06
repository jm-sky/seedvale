import * as THREE from 'three'
import { createKeyboard } from '../input/Keyboard'
import { PlayerController } from '../player/PlayerController'

export function createApp(container: HTMLElement): () => void {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x87b5d4)
  scene.fog = new THREE.Fog(0x87b5d4, 40, 120)

  const camera = new THREE.PerspectiveCamera(
    60,
    container.clientWidth / container.clientHeight,
    0.1,
    500,
  )

  const ambient = new THREE.AmbientLight(0xffffff, 0.45)
  scene.add(ambient)

  const sun = new THREE.DirectionalLight(0xfff2d6, 1.1)
  sun.position.set(30, 50, 20)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.near = 1
  sun.shadow.camera.far = 120
  sun.shadow.camera.left = -40
  sun.shadow.camera.right = 40
  sun.shadow.camera.top = 40
  sun.shadow.camera.bottom = -40
  scene.add(sun)

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(80, 80),
    new THREE.MeshStandardMaterial({
      color: 0x6b9e4a,
      flatShading: true,
    }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  const keyboard = createKeyboard()
  const player = new PlayerController(camera, keyboard.state)
  scene.add(player.mesh)

  const clock = new THREE.Clock()
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
    ground.geometry.dispose()
    ;(ground.material as THREE.Material).dispose()
    player.mesh.geometry.dispose()
    ;(player.mesh.material as THREE.Material).dispose()
    renderer.dispose()
    renderer.domElement.remove()
  }
}
