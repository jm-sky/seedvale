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
import { buildConstructionCatalog, type ConstructionCatalog } from '../assets/constructionCatalog'
import { HOME_HOUSE_DEFINITIONS } from '../assets/houseDefinitionExample'
import { createRenderer } from '../render/createRenderer'
import {
  buildAssemblyCollidersWorld,
  buildHouse,
  type HouseAssembly,
  type HouseBuildContext,
  houseDefinitionAssetIds,
  loadHousePartTemplates,
} from '../settlement/houseBuilder'
import { createColliderPreview } from './colliderPreview'
import {
  type CameraView,
  DEFAULT_HOUSE_BROWSER_CONFIG,
  type HouseBrowserAssemblyInfo,
  type HouseBrowserConfig,
  type HouseBrowserScene,
} from './houseBrowserTypes'
import { createHouseLoadGuard } from './houseLoadGuard'

export type HouseBrowserSceneCallbacks = {
  onAssemblyChange?: (info: HouseBrowserAssemblyInfo | null) => void
  onError?: (message: string) => void
}

/**
 * House Browser's Three.js lifecycle (plan tools-003): renderer, camera,
 * OrbitControls, ground/grid/lights, the current `HouseAssembly` (built
 * through the same `ConstructionCatalog` → `HouseBuilder` pipeline the
 * settlement runtime and the former `?houseTest` scene used) and a read-only
 * `ColliderPreview`. Vue owns selection/config only — this module owns
 * everything Three.js.
 */
export function createHouseBrowserScene(
  container: HTMLElement,
  callbacks: HouseBrowserSceneCallbacks = {},
): HouseBrowserScene {
  const renderer = createRenderer(container)

  const scene = new Scene()
  scene.background = new Color(0x87ceeb)

  const camera = new PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 500)
  camera.position.set(6, 5, 8)

  const controls = new OrbitControls(camera, renderer.domElement)

  const groundGeometry = new PlaneGeometry(60, 60)
  const groundMaterial = new MeshStandardMaterial({ color: 0x3a4a38 })
  const ground = new Mesh(groundGeometry, groundMaterial)
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

  const colliderPreview = createColliderPreview(scene)
  const loadGuard = createHouseLoadGuard()

  let catalog: ConstructionCatalog | null = null
  let assembly: HouseAssembly | null = null
  let config: HouseBrowserConfig = { ...DEFAULT_HOUSE_BROWSER_CONFIG }
  let lastBounds: Box3 | null = null

  function currentCatalog(): ConstructionCatalog {
    catalog ??= buildConstructionCatalog()
    return catalog
  }

  function applyConfigToScene(): void {
    ground.visible = config.showGround
    grid.visible = config.showGrid
    sun.castShadow = config.showShadows
    renderer.shadowMap.enabled = config.showShadows
    colliderPreview.setVisible(config.showColliders)
    colliderPreview.setPadding(config.colliderPadding)
  }
  applyConfigToScene()

  function fitCameraToBounds(bounds: Box3): void {
    const center = bounds.getCenter(new Vector3())
    const size = bounds.getSize(new Vector3())
    const radius = Math.max(size.x, size.y, size.z, 1)
    controls.target.copy(center)
    camera.position.set(center.x + radius, center.y + radius * 0.8, center.z + radius)
    camera.near = Math.max(0.05, radius / 100)
    camera.far = radius * 50
    camera.updateProjectionMatrix()
    controls.update()
  }

  function attachAssembly(next: HouseAssembly): void {
    if (assembly) {
      scene.remove(assembly.root)
      assembly.dispose()
    }
    assembly = next
    scene.add(next.root)

    const bounds = new Box3().setFromObject(next.root)
    lastBounds = bounds
    if (config.cameraAutoFit) fitCameraToBounds(bounds)

    const colliders = buildAssemblyCollidersWorld(next)
    colliderPreview.setColliders(colliders)
    callbacks.onAssemblyChange?.({
      definitionId: next.definitionId,
      census: next.census,
      colliderCount: colliders.length,
    })
  }

  async function setHouse(id: string): Promise<void> {
    const definition = HOME_HOUSE_DEFINITIONS.find((def) => def.id === id)
    if (!definition) {
      callbacks.onError?.(`Unknown house definition: ${id}`)
      return
    }

    const token = loadGuard.next()
    try {
      const next = await loadGuard.resolve(token, async () => {
        const cat = currentCatalog()
        const assetIds = houseDefinitionAssetIds(definition)
        const templates = await loadHousePartTemplates(cat, assetIds)
        const ctx: HouseBuildContext = { catalog: cat, templates }
        return buildHouse(definition, ctx)
      })
      if (next) attachAssembly(next)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      callbacks.onError?.(`Failed to build house "${id}": ${message}`)
    }
  }

  function setConfig(next: HouseBrowserConfig): void {
    config = next
    applyConfigToScene()
  }

  function resetCamera(): void {
    if (lastBounds) fitCameraToBounds(lastBounds)
  }

  function setCameraView(view: CameraView): void {
    if (!lastBounds) return
    const center = lastBounds.getCenter(new Vector3())
    const size = lastBounds.getSize(new Vector3())
    const radius = Math.max(size.x, size.y, size.z, 1)
    controls.target.copy(center)
    switch (view) {
      case 'back':
        camera.position.set(center.x, center.y + radius * 0.3, center.z - radius * 1.5)
        break
      case 'front':
        camera.position.set(center.x, center.y + radius * 0.3, center.z + radius * 1.5)
        break
      case 'left':
        camera.position.set(center.x - radius * 1.5, center.y + radius * 0.3, center.z)
        break
      case 'right':
        camera.position.set(center.x + radius * 1.5, center.y + radius * 0.3, center.z)
        break
      case 'top':
        camera.position.set(center.x, center.y + radius * 2, center.z + 0.001)
        break
    }
    camera.updateProjectionMatrix()
    controls.update()
  }

  const onResize = (): void => {
    camera.aspect = container.clientWidth / container.clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(container.clientWidth, container.clientHeight)
  }
  window.addEventListener('resize', onResize)

  let running = true
  const tick = (): void => {
    if (!running) return
    controls.update()
    renderer.render(scene, camera)
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)

  function dispose(): void {
    running = false
    window.removeEventListener('resize', onResize)
    controls.dispose()
    if (assembly) {
      scene.remove(assembly.root)
      assembly.dispose()
    }
    colliderPreview.dispose()
    scene.remove(ground)
    groundGeometry.dispose()
    groundMaterial.dispose()
    scene.remove(grid)
    grid.geometry.dispose()
    for (const material of Array.isArray(grid.material) ? grid.material : [grid.material]) {
      material.dispose()
    }
    renderer.dispose()
    renderer.domElement.remove()
  }

  return { setHouse, setConfig, resetCamera, setCameraView, dispose }
}
