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
import { urlParamValue } from './debugMode'

const MODEL_TEST_HEIGHT = 1.8
const DEFAULT_MODEL_TEST_NAME = 'Adventurer'

function safeCharacterAssetName(raw: string | null, fallback: string): string {
  if (raw === null || raw === '') return fallback
  if (raw.includes('..') || raw.includes('\\') || !/^[A-Za-z0-9_./-]+$/.test(raw)) {
    console.warn(`[modelTest] ignoring unsafe model name ${raw}`)
    return fallback
  }
  return raw
}

/**
 * Ultra-minimal NPC/player model+animation test scene for `?modelTest`:
 * renderer, camera, one light, one flat ground plane, one model with its
 * first animation clip playing on loop. No terrain/chunks/world
 * bundle/NPC-AI/UI/audio/persistence — see `src/debug/debugMode.ts`'s
 * `isModelTestMode()`.
 *
 * `?model=Adventurer` (default) or `?model=ubc/male_peasant`.
 * Optional `?anims=ubc/ual1_player` loads extra clips (UBC outfits have none).
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

  const modelName = safeCharacterAssetName(urlParamValue('model'), DEFAULT_MODEL_TEST_NAME)
  const modelUrl = `/models/characters/${modelName}.glb`
  const { scene: model, animations: modelAnimations } = await loadGltfAnimated(modelUrl)
  let animations = modelAnimations
  const animsName = safeCharacterAssetName(urlParamValue('anims'), '')
  if (animsName) {
    const animsUrl = `/models/characters/${animsName}.glb`
    try {
      const extra = await loadGltfAnimated(animsUrl)
      animations = [...modelAnimations, ...extra.animations]
    } catch (err) {
      console.warn(`[modelTest] failed to load animations ${animsUrl}`, err)
    }
  }
  prepareProp(model, MODEL_TEST_HEIGHT)
  model.traverse((obj) => { obj.castShadow = true })
  scene.add(model)

  console.log('------------------------------')
  console.log('MODEL_TEST_URL:', modelUrl)
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
