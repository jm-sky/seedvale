import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  GridHelper,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { buildConstructionCatalog } from '../assets/constructionCatalog'
import { createRenderer } from '../render/createRenderer'
import {
  buildHouse,
  type HouseAssembly,
  type HouseBuildContext,
  houseDefinitionAssetIds,
  loadHousePartTemplates,
} from '../settlement/houseBuilder'
import { houseDefinitionFromUrl } from './houseTestDefinition'

function showError(container: HTMLElement, message: string): void {
  console.error('[houseTest]', message)
  const pre = document.createElement('pre')
  pre.textContent = message
  pre.style.cssText =
    'color:#fff;background:#402020;padding:16px;margin:0;white-space:pre-wrap;font:14px monospace;'
  container.appendChild(pre)
}

/**
 * Ultra-minimal standalone `?houseTest` preview scene: renderer, camera,
 * light, ground/grid, and one `HouseAssembly` built by the same
 * `ConstructionCatalog`/`HouseBuilder` pipeline the settlement runtime uses
 * (`src/settlement/props.ts`) — no terrain/chunks/world bundle/NPCs/save
 * system/gameplay UI. See `src/debug/debugMode.ts`'s `isHouseTestMode()`.
 * Does not go through `createApp()`.
 */
export async function createHouseTestScene(container: HTMLElement): Promise<() => void> {
  const lookup = houseDefinitionFromUrl()
  if (!lookup.ok) {
    showError(container, lookup.error)
    return () => {}
  }
  const definition = lookup.definition

  const renderer = createRenderer(container)

  const scene = new Scene()
  scene.background = new Color(0x87ceeb)

  const camera = new PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 500)
  camera.position.set(6, 5, 8)

  const controls = new OrbitControls(camera, renderer.domElement)

  const ground = new Mesh(
    new PlaneGeometry(60, 60),
    new MeshStandardMaterial({ color: 0x3a4a38 }),
  )
  ground.rotation.x = -Math.PI / 2
  ground.receiveShadow = true
  scene.add(ground)

  const grid = new GridHelper(60, 30)
  scene.add(grid)

  scene.add(new AmbientLight(0xffffff, 0.6))
  const sun = new DirectionalLight(0xffffff, 1.2)
  sun.position.set(8, 12, 6)
  sun.castShadow = true
  scene.add(sun)

  let assembly: HouseAssembly
  try {
    const catalog = buildConstructionCatalog()
    const assetIds = houseDefinitionAssetIds(definition)
    const templates = await loadHousePartTemplates(catalog, assetIds)
    const ctx: HouseBuildContext = { catalog, templates }
    assembly = buildHouse(definition, ctx)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    controls.dispose()
    renderer.dispose()
    renderer.domElement.remove()
    showError(container, `Failed to build house "${definition.id}": ${message}`)
    return () => {}
  }

  scene.add(assembly.root)

  console.log('[houseTest] definition:', definition.id, 'census:', assembly.census)

  const bounds = new Box3().setFromObject(assembly.root)
  const center = bounds.getCenter(new Vector3())
  const size = bounds.getSize(new Vector3())
  const radius = Math.max(size.x, size.y, size.z, 1)
  controls.target.copy(center)
  camera.position.set(center.x + radius, center.y + radius * 0.8, center.z + radius)
  camera.near = Math.max(0.05, radius / 100)
  camera.far = radius * 50
  camera.updateProjectionMatrix()
  controls.update()

  const onResize = () => {
    camera.aspect = container.clientWidth / container.clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(container.clientWidth, container.clientHeight)
  }
  window.addEventListener('resize', onResize)

  let running = true
  const tick = () => {
    if (!running) return
    assembly.update(1 / 60)
    controls.update()
    renderer.render(scene, camera)
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)

  return () => {
    running = false
    window.removeEventListener('resize', onResize)
    controls.dispose()
    assembly.dispose()
    renderer.dispose()
    renderer.domElement.remove()
  }
}
