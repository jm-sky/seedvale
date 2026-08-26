import {
  AmbientLight,
  AnimationMixer,
  Clock,
  Color,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { loadGltfAnimated, prepareProp } from '../assets/loadGltf'
import { createRenderer } from '../render/createRenderer'

function urlParam(name: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    const params = new URLSearchParams(window.location.search)
    if (!params.has(name)) return null
    const raw = params.get(name)
    if (raw === null || raw.trim() === '') return null
    return raw.trim()
  } catch {
    return null
  }
}


/** `?modelTest` scene — swap this to preview a different model/animation. */
const DEFAULT_PLAYER_MODEL_URL = 'Adventurer'
const PLAYER_MODEL_URL = urlParam('model') ?? DEFAULT_PLAYER_MODEL_URL
const MODEL_TEST_URL = `/models/characters/${PLAYER_MODEL_URL}.glb`
const MODEL_TEST_HEIGHT = 1.8

/**
 * Ultra-minimal NPC/player model+animation test scene for `?modelTest`:
 * renderer, camera, one light, one flat ground plane, one model with its
 * first animation clip playing on loop. No terrain/chunks/world
 * bundle/NPC-AI/UI/audio/persistence — see `src/debug/debugMode.ts`'s
 * `isModelTestMode()`.
 */
export async function createModelTestScene(container: HTMLElement): Promise<() => void> {
  const renderer = createRenderer(container)

  const scene = new Scene()
  scene.background = new Color(0x87ceeb)

  const camera = new PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 100)
  camera.position.set(0, 1.6, 4)

  const controls = new OrbitControls(camera, renderer.domElement)
  controls.target.set(0, 1, 0)
  controls.update()

  const ground = new Mesh(
    new PlaneGeometry(20, 20),
    new MeshStandardMaterial({ color: 0x3a4a38 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  scene.add(new AmbientLight(0xffffff, 0.6))
  const sun = new DirectionalLight(0xffffff, 1.2)
  sun.position.set(4, 8, 4)
  sun.castShadow = true
  scene.add(sun)

  const { scene: model, animations } = await loadGltfAnimated(MODEL_TEST_URL)
  prepareProp(model, MODEL_TEST_HEIGHT)
  model.traverse((obj) => { obj.castShadow = true })
  scene.add(model)

  console.log('------------------------------')
  console.log('MODEL_TEST_URL:', MODEL_TEST_URL)
  console.log('model:', model)
  console.log('animations:', animations)

  const clock = new Clock()
  let mixer: AnimationMixer | null = null

  if (animations.length > 0) {
    mixer = new AnimationMixer(model)
    // `animations[0]` isn't reliably idle (character packs like Adventurer.glb
    // often lead with e.g. a death/hit-react clip) — prefer a named idle clip,
    // same lookup PlayerController/NpcAgent use, and fall back to the first
    // clip only if none of those names are present.
    const idleClip = animations.find((clip) => /idle/i.test(clip.name)) ?? animations[0]
    let currentAnimationIndex = animations.findIndex((clip) => clip.name === idleClip.name)
    mixer.clipAction(idleClip).play()

    const nextAnimation = () => {
       currentAnimationIndex = (currentAnimationIndex + 1) % animations.length
       const nextClip = animations[currentAnimationIndex]
       console.log('nextAnimation:', nextClip.name)
       mixer?.clipAction(nextClip).play()
    }

    console.log('modelInfo:', {
      idleClip: idleClip.name,
      currentAnimationIndex: currentAnimationIndex,
      animations: animations.map((clip) => clip.name),
      nextAnimation,
    })
  }

  const onResize = () => {
    camera.aspect = container.clientWidth / container.clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(container.clientWidth, container.clientHeight)
  }
  window.addEventListener('resize', onResize)

  let running = true
  const tick = () => {
    if (!running) return
    mixer?.update(clock.getDelta())
    controls.update()
    renderer.render(scene, camera)
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)

  return () => {
    running = false
    window.removeEventListener('resize', onResize)
    controls.dispose()
    renderer.dispose()
    renderer.domElement.remove()
  }
}
