/** Isolated `?caveHeightfieldTest` harness for the cave heightfield
 *  representation spike. Bypasses WorldBundle / save / streaming — see
 *  `createModelTestScene.ts` for the structural pattern.
 *
 * @domain world-terrain
 */

import {
  AmbientLight,
  Clock,
  Color,
  DirectionalLight,
  DoubleSide,
  FrontSide,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import type { Collider } from '../world/collision'
import { createKeyboard } from '../input/Keyboard'
import {
  createMouseLook,
  exitGamePointerLock,
} from '../input/MouseLook'
import { createRenderer } from '../render/createRenderer'
import { openingDirection } from '../world/caves/caveOrientation'
import { buildCaveSdfColliders, caveMouthColliderFilter } from '../world/caves/caveSdfColliders'
import { buildCaveSdfRepresentation } from '../world/caves/caveSdfField'
import {
  buildCaveSdfColumnIndex,
} from '../world/caves/caveSdfQuery'
import { createCaveSpikeMaterial } from '../world/caves/caveSpikeMaterial'
import { buildSdfCaveMesh, DEFAULT_SDF_PARAMS } from '../world/caves/sdfCaveMesh'
import {
  buildCaveHeightfieldFixture,
  CAVE_HEIGHTFIELD_FIXTURE_IDS,
  type CaveHeightfieldFixtureId,
  type CaveHeightfieldMode,
  type CaveHeightfieldVariant,
  parseCaveHeightfieldFixtureId,
  parseCaveHeightfieldMode,
  parseCaveHeightfieldVariant,
  sampleCaveHeightfieldSurface,
} from './caves/caveHeightfieldFixtures'
import { createHeightfieldCaveMesh } from './caves/caveHeightfieldMesh'
import {
  createCaveHeightfieldWalker,
  type HeightfieldWalkCollision,
} from './caves/caveHeightfieldPlayer'
import {
  buildCaveHeightfieldRepresentation,
  DEFAULT_HEIGHTFIELD_CONFIG,
} from './caves/caveHeightfieldRepresentation'
import { urlParamValue } from './debugMode'

export type CaveHeightfieldSpikeMetrics = {
  variant: CaveHeightfieldVariant
  fixture: CaveHeightfieldFixtureId
  representationMs: number
  meshBuildMs: number
  totalMs: number
  vertices: number
  triangles: number
  geometryBytes: number
  cellSize?: number
  gridWidth?: number
  gridDepth?: number
  insideCellCount?: number
  boundaryEdgeCount?: number
}

type BuiltVariant = {
  caveMesh: Mesh
  collision: HeightfieldWalkCollision
  metrics: CaveHeightfieldSpikeMetrics
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function surfaceAt(x: number, z: number): number {
  return sampleCaveHeightfieldSurface(x, z)
}

function spawnPose(): { x: number, y: number, z: number, yaw: number } {
  const topology = buildCaveHeightfieldFixture('basic')
  const out = openingDirection(topology.entrance.yaw)
  const x = topology.entrance.x + out.dx * 7
  const z = topology.entrance.z + out.dz * 7
  return { x, y: surfaceAt(x, z), z, yaw: topology.entrance.yaw }
}

function writeUrlState(variant: CaveHeightfieldVariant, fixture: CaveHeightfieldFixtureId, mode: CaveHeightfieldMode): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.set('caveHeightfieldTest', '')
  url.searchParams.set('variant', variant)
  url.searchParams.set('fixture', fixture)
  url.searchParams.set('mode', mode)
  window.history.replaceState(null, '', url)
}

function buildSurfaceMesh(): Mesh {
  const size = 56
  const segments = 56
  const geometry = new PlaneGeometry(size, size, segments, segments)
  geometry.rotateX(-Math.PI / 2)
  const pos = geometry.getAttribute('position')
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    pos.setY(i, surfaceAt(x, z))
  }
  pos.needsUpdate = true
  geometry.computeVertexNormals()
  const mesh = new Mesh(
    geometry,
    new MeshStandardMaterial({ color: 0x5a6b4f, roughness: 0.95, side: DoubleSide }),
  )
  mesh.receiveShadow = true
  mesh.name = 'cave-heightfield-surface'
  return mesh
}

function buildHeightfieldVariant(fixture: CaveHeightfieldFixtureId): BuiltVariant {
  const topology = buildCaveHeightfieldFixture(fixture)
  const built = buildCaveHeightfieldRepresentation(topology, DEFAULT_HEIGHTFIELD_CONFIG)
  const { mesh, buffers } = createHeightfieldCaveMesh(built.representation)
  const totalMs = built.representationMs + buffers.meshBuildMs
  return {
    caveMesh: mesh,
    collision: {
      kind: 'heightfield',
      representation: built.representation,
      surfaceAt,
    },
    metrics: {
      variant: 'heightfield',
      fixture,
      representationMs: built.representationMs,
      meshBuildMs: buffers.meshBuildMs,
      totalMs,
      vertices: buffers.vertices,
      triangles: buffers.triangles,
      geometryBytes: buffers.geometryBytes,
      cellSize: built.representation.cellSize,
      gridWidth: built.representation.width,
      gridDepth: built.representation.depth,
      insideCellCount: built.insideCellCount,
      boundaryEdgeCount: buffers.boundaryEdgeCount,
    },
  }
}

function buildSdfVariant(fixture: CaveHeightfieldFixtureId): BuiltVariant {
  const topology = buildCaveHeightfieldFixture(fixture)
  const t0 = now()
  const field = buildCaveSdfRepresentation(topology, DEFAULT_SDF_PARAMS)
  const t1 = now()
  const meshResult = buildSdfCaveMesh(topology, DEFAULT_SDF_PARAMS, surfaceAt, field)
  const t2 = now()
  const material = createCaveSpikeMaterial('sdf')
  material.side = FrontSide
  const caveMesh = new Mesh(meshResult.geometry, material)
  caveMesh.castShadow = true
  caveMesh.receiveShadow = true
  caveMesh.name = 'cave-sdf-baseline'
  const index = buildCaveSdfColumnIndex(field, topology, surfaceAt)
  const colliders: Collider[] = buildCaveSdfColliders(
    index,
    surfaceAt,
    field,
    caveMouthColliderFilter(topology),
  )
  return {
    caveMesh,
    collision: { kind: 'sdf', index, colliders, surfaceAt },
    metrics: {
      variant: 'sdf',
      fixture,
      representationMs: t1 - t0,
      meshBuildMs: t2 - t1,
      totalMs: t2 - t0,
      vertices: meshResult.metrics.vertices,
      triangles: meshResult.metrics.triangles,
      geometryBytes: meshResult.metrics.geometryBytes,
    },
  }
}

function reportMetrics(metrics: CaveHeightfieldSpikeMetrics): void {
  console.log(`[caveHeightfieldTest] variant=${metrics.variant} fixture=${metrics.fixture}`)
  console.table({
    representationMs: Number(metrics.representationMs.toFixed(2)),
    meshBuildMs: Number(metrics.meshBuildMs.toFixed(2)),
    totalMs: Number(metrics.totalMs.toFixed(2)),
    vertices: metrics.vertices,
    triangles: metrics.triangles,
    geometryBytes: metrics.geometryBytes,
    cellSize: metrics.cellSize ?? 'n/a',
    grid: metrics.gridWidth != null ? `${metrics.gridWidth}×${metrics.gridDepth}` : 'n/a',
    insideCellCount: metrics.insideCellCount ?? 'n/a',
    boundaryEdgeCount: metrics.boundaryEdgeCount ?? 'n/a',
  })
}

function createOverlay(): HTMLDivElement {
  const el = document.createElement('div')
  el.style.cssText = [
    'position:absolute',
    'top:12px',
    'left:12px',
    'z-index:20',
    'max-width:360px',
    'padding:10px 12px',
    'background:rgba(8,10,12,0.72)',
    'color:#f2f0ea',
    'font:12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace',
    'border-radius:8px',
    'pointer-events:auto',
  ].join(';')
  return el
}

function renderOverlay(
  el: HTMLDivElement,
  variant: CaveHeightfieldVariant,
  fixture: CaveHeightfieldFixtureId,
  mode: CaveHeightfieldMode,
  metrics: CaveHeightfieldSpikeMetrics,
): void {
  const extra = variant === 'heightfield'
    ? `<div>grid ${metrics.gridWidth}×${metrics.gridDepth} @ ${metrics.cellSize} m</div>
       <div>inside cells ${metrics.insideCellCount} · boundary edges ${metrics.boundaryEdgeCount}</div>`
    : '<div>SDF baseline (production field + Surface Nets)</div>'
  el.innerHTML = `
    <div style="font-weight:700;margin-bottom:6px">Cave heightfield spike</div>
    <div>variant: <b>${variant}</b> · fixture: <b>${fixture}</b> · mode: <b>${mode}</b></div>
    <div style="margin-top:6px">
      representation ${metrics.representationMs.toFixed(1)} ms ·
      mesh ${metrics.meshBuildMs.toFixed(1)} ms ·
      total ${metrics.totalMs.toFixed(1)} ms
    </div>
    <div>${metrics.vertices} verts · ${metrics.triangles} tris · ${metrics.geometryBytes} B</div>
    ${extra}
    <div style="margin-top:8px;opacity:0.85">
      [1] heightfield/SDF · [2] Walk/Inspect · [3] fixture<br>
      WASD walk · mouse look · click canvas to lock pointer<br>
      2.5D cannot represent stacked / crossing / shaft geometry
    </div>
  `
}

/**
 * Ultra-minimal comparison scene for `?caveHeightfieldTest`.
 *
 * @domain world-terrain
 */
export async function createCaveHeightfieldTestScene(container: HTMLElement): Promise<() => void> {
  let variant = parseCaveHeightfieldVariant(urlParamValue('variant'))
  let fixture = parseCaveHeightfieldFixtureId(urlParamValue('fixture'))
  let mode = parseCaveHeightfieldMode(urlParamValue('mode'))

  const renderer = createRenderer(container)
  const scene = new Scene()
  scene.background = new Color(0x87ceeb)

  const camera = new PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.1, 250)
  camera.position.set(8, 6, 14)

  const orbit = new OrbitControls(camera, renderer.domElement)
  orbit.enableDamping = true
  orbit.target.set(0, 3, -8)
  orbit.enabled = mode === 'inspect'

  scene.add(new AmbientLight(0xffffff, 0.45))
  const sun = new DirectionalLight(0xfff4dd, 1.15)
  sun.position.set(12, 22, 10)
  sun.castShadow = true
  scene.add(sun)

  const surface = buildSurfaceMesh()
  scene.add(surface)

  const overlay = createOverlay()
  container.appendChild(overlay)

  const keyboard = createKeyboard()
  const mouseLook = createMouseLook(renderer.domElement, keyboard.state)
  mouseLook.state.distance = 6
  mouseLook.state.yaw = spawnPose().yaw
  mouseLook.state.pitch = 0.28

  const blockWalkPointerLockInInspect = (event: MouseEvent): void => {
    if (mode === 'inspect') event.stopImmediatePropagation()
  }
  renderer.domElement.addEventListener('click', blockWalkPointerLockInInspect, true)

  let built = variant === 'sdf' ? buildSdfVariant(fixture) : buildHeightfieldVariant(fixture)
  scene.add(built.caveMesh)
  reportMetrics(built.metrics)
  renderOverlay(overlay, variant, fixture, mode, built.metrics)
  writeUrlState(variant, fixture, mode)

  const walker = await createCaveHeightfieldWalker()
  scene.add(walker.root)
  const spawn = spawnPose()
  walker.spawn(spawn.x, spawn.y, spawn.z, spawn.yaw)

  const disposeBuilt = (): void => {
    scene.remove(built.caveMesh)
    built.caveMesh.geometry.dispose()
    const mat = built.caveMesh.material
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
    else mat.dispose()
  }

  const rebuild = (): void => {
    disposeBuilt()
    built = variant === 'sdf' ? buildSdfVariant(fixture) : buildHeightfieldVariant(fixture)
    scene.add(built.caveMesh)
    reportMetrics(built.metrics)
    renderOverlay(overlay, variant, fixture, mode, built.metrics)
    writeUrlState(variant, fixture, mode)
  }

  const applyMode = (): void => {
    const inspect = mode === 'inspect'
    orbit.enabled = inspect
    if (inspect) {
      exitGamePointerLock(renderer.domElement)
      const topology = buildCaveHeightfieldFixture(fixture)
      const cx = topology.nodes.reduce((s, n) => s + n.position.x, 0) / topology.nodes.length
      const cy = topology.nodes.reduce((s, n) => s + n.position.y, 0) / topology.nodes.length + 2
      const cz = topology.nodes.reduce((s, n) => s + n.position.z, 0) / topology.nodes.length
      orbit.target.set(cx, cy, cz)
      camera.position.set(cx + 14, cy + 8, cz + 16)
      orbit.update()
    }
    renderOverlay(overlay, variant, fixture, mode, built.metrics)
    writeUrlState(variant, fixture, mode)
  }

  const onHarnessKey = (event: KeyboardEvent): void => {
    if (event.repeat) return
    if (event.code === 'Digit1') {
      variant = variant === 'heightfield' ? 'sdf' : 'heightfield'
      rebuild()
    } else if (event.code === 'Digit2') {
      mode = mode === 'walk' ? 'inspect' : 'walk'
      applyMode()
    } else if (event.code === 'Digit3') {
      const i = CAVE_HEIGHTFIELD_FIXTURE_IDS.indexOf(fixture)
      fixture = CAVE_HEIGHTFIELD_FIXTURE_IDS[(i + 1) % CAVE_HEIGHTFIELD_FIXTURE_IDS.length]!
      rebuild()
      const nextSpawn = spawnPose()
      walker.spawn(nextSpawn.x, nextSpawn.y, nextSpawn.z, nextSpawn.yaw)
    }
  }
  window.addEventListener('keydown', onHarnessKey)

  const onResize = (): void => {
    camera.aspect = container.clientWidth / container.clientHeight
    camera.updateProjectionMatrix()
    renderer.setSize(container.clientWidth, container.clientHeight)
  }
  window.addEventListener('resize', onResize)

  applyMode()

  const clock = new Clock()
  let running = true
  const tick = (): void => {
    if (!running) return
    const dt = clock.getDelta()
    if (mode === 'walk') {
      walker.update(dt, keyboard.state, mouseLook.state, camera, built.collision)
      keyboard.consumeJump()
      mouseLook.commitFrame()
    } else {
      orbit.update()
    }
    renderer.render(scene, camera)
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)

  return () => {
    running = false
    window.removeEventListener('resize', onResize)
    window.removeEventListener('keydown', onHarnessKey)
    renderer.domElement.removeEventListener('click', blockWalkPointerLockInInspect, true)
    keyboard.dispose()
    mouseLook.dispose()
    orbit.dispose()
    walker.dispose()
    disposeBuilt()
    surface.geometry.dispose()
    ;(surface.material as MeshStandardMaterial).dispose()
    overlay.remove()
    renderer.dispose()
    renderer.domElement.remove()
  }
}
