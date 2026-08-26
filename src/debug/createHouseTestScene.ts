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
import { HOME_HOUSE_DEFINITIONS } from '../assets/houseDefinitionExample'
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

function createSelectHousePanel(container: HTMLElement): void {
  const panel = document.createElement('div')
  const css = `
  .select-house-panel {
    position:absolute;
    top: 0.5rem;
    left: 0.5rem;
    width: 200px;
    height: 200px;
    color: #fff;
    font-size: 1rem;
    background: rgba(0, 0, 0, 0.5);
    border: 1px solid #000;
    border-radius: 0.5rem;
    padding: 0.25rem 0.5rem;
    z-index: 1000;
    overflow: hidden;
  }
  .select-house-panel-content {
    max-height: 100%;
    overflow: auto;
  }
  .select-house-panel-content-title {
    font-size: 1.25rem;
    margin-bottom: 0.5rem;
    padding: 0;
    line-height: 1;
  }
  .select-house-panel-content-list {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .select-house-panel-content-list-item {
    display: block;
    padding: 0.5rem;
    border-bottom: 1px solid #fffa;
  }
  .select-house-panel-content-list-item-link {
    color: #fff;
    text-decoration: none;
  }
  .select-house-panel-content-list-item-link:hover {
    color: #ccc;
    text-decoration: none;
  }
  `

  const style = document.createElement('style')
  style.textContent = css
  document.head.appendChild(style)

  const links = HOME_HOUSE_DEFINITIONS.map((def) =>
    `<li class="select-house-panel-content-list-item"><a href="?houseTest=${def.id}" class="select-house-panel-content-list-item-link">${def.id}</a></li>`
  ).join('')

  panel.className = 'select-house-panel'
  panel.innerHTML = `
    <div class="select-house-panel-content">
      <h1 class="select-house-panel-content-title">Select a house</h1>
      <ul class="select-house-panel-content-list">
        ${links}
      </ul>
    </div>
  `
  container.appendChild(panel)
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

  createSelectHousePanel(container)

  return () => {
    running = false
    window.removeEventListener('resize', onResize)
    controls.dispose()
    assembly.dispose()
    renderer.dispose()
    renderer.domElement.remove()
  }
}
