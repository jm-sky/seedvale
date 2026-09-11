/** Isolated `?caveHeightfieldTest` harness for the cave heightfield
 *  representation spike. Bypasses WorldBundle / save / streaming — see
 *  `createModelTestScene.ts` for the structural pattern.
 *
 * @domain world-terrain
 */

import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Clock,
  Color,
  DirectionalLight,
  DoubleSide,
  FrontSide,
  type Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
} from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
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
import { createLargeCaveVisual, placeLargeCaveVisual } from '../world/largeCaveVisual'
import {
  buildCaveHeightfieldFixture,
  CAVE_HEIGHTFIELD_FIXTURE_IDS,
  caveHeightfieldBaseSurfaceAt,
  type CaveHeightfieldFixtureId,
  type CaveHeightfieldMode,
  type CaveHeightfieldVariant,
  caveHeightfieldWalkSurfaceAt,
  parseCaveHeightfieldFixtureId,
  parseCaveHeightfieldMode,
  parseCaveHeightfieldVariant,
} from './caves/caveHeightfieldFixtures'
import { createHeightfieldCaveMesh } from './caves/caveHeightfieldMesh'
import { createCaveHeightfieldWalker } from './caves/caveHeightfieldPlayer'
import {
  buildCaveHeightfield,
  type CaveHeightfield,
  DEFAULT_HEIGHTFIELD_CONFIG,
  sampleHeightfieldAt,
} from './caves/caveHeightfieldRepresentation'
import {
  CAVE_HEIGHTFIELD_TERRAIN_ANCHOR,
  CAVE_HEIGHTFIELD_TERRAIN_SEED,
} from './caves/caveHeightfieldTerrain'
import {
  type CaveWalkWorld,
  createHeightfieldWalkWorld,
  createSdfWalkWorld,
} from './caves/caveHeightfieldWalkWorld'
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
  /** Grid nodes carrying cave void (`gap > 0`). */
  caveNodeCount?: number
  /** Vertices on the `gap = 0` contour, shared by floor and ceiling. */
  rimVertexCount?: number
  /** Persistent field memory (floor/ceiling/surface/coreT arrays). */
  fieldBytes?: number
  /** Width at the mid-passage station where the floor has risen <= 0.3 m. */
  walkableWidth?: number
  /** Worst clearance anywhere in the walkable core. */
  minCoreGap?: number
  /** Steepest floor grade along the centerline. */
  maxFloorSlopeDeg?: number
}

type BuiltVariant = {
  caveMesh: Mesh
  world: CaveWalkWorld
  metrics: CaveHeightfieldSpikeMetrics
  /** Cave-aware terrain mesh: the mouth is a real hole in it. */
  surfaceMesh: Mesh
  /** Rock framing that masks the terrain-cutout seam (presentation only). */
  rocks: Group | null
  field: CaveHeightfield | null
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

/** The one analytic surface both representations are built against —
 *  `createCaves()`'s `analyticSurfaceHeight` equivalent. */
const baseSurfaceAt = caveHeightfieldBaseSurfaceAt
/** Walkable / rendered surface (base minus the production mouth recess). */
const walkSurfaceAt = caveHeightfieldWalkSurfaceAt

function spawnPose(): { x: number, y: number, z: number, yaw: number } {
  const topology = buildCaveHeightfieldFixture('basic')
  const out = openingDirection(topology.entrance.yaw)
  const x = topology.entrance.x + out.dx * 7
  const z = topology.entrance.z + out.dz * 7
  return { x, y: walkSurfaceAt(x, z), z, yaw: topology.entrance.yaw }
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

const SURFACE_SIZE = 72
/** 0.5 m per texel — finer than production terrain (1 m) purely so the mouth
 *  cutout below has half-metre granularity. The hillside itself is still the
 *  production analytic sampler. */
const SURFACE_STEP = 0.5

/**
 * Cave-aware terrain mesh. A quad is dropped when any of its corners sits
 * where the cave void reaches the walk surface — the same
 * `ceilY >= surfaceY - SURFACE_CLIP_EPS` condition the cave mesher uses to
 * drop its ceiling, so the terrain hole and the cave portal stop on one
 * contour. `mouthCarveDepth` only deepens terrain, so without this the
 * surface closes over the mouth (recon finding; shared with production).
 *
 * `breaksSurface` is null for the SDF variant, which keeps the closed sheet
 * it has today so the comparison shows exactly what each representation
 * contributes.
 *
 * @domain world-terrain
 */
function buildSurfaceMesh(breaksSurface: ((x: number, z: number) => boolean) | null): Mesh {
  const n = Math.round(SURFACE_SIZE / SURFACE_STEP) + 1
  const half = SURFACE_SIZE / 2
  const positions = new Float32Array(n * n * 3)
  const open = new Uint8Array(n * n)
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const x = -half + ix * SURFACE_STEP
      const z = -half + iz * SURFACE_STEP
      const i = iz * n + ix
      positions[i * 3] = x
      positions[i * 3 + 1] = walkSurfaceAt(x, z)
      positions[i * 3 + 2] = z
      open[i] = breaksSurface && breaksSurface(x, z) ? 1 : 0
    }
  }
  const indices: number[] = []
  for (let iz = 0; iz + 1 < n; iz++) {
    for (let ix = 0; ix + 1 < n; ix++) {
      const a = iz * n + ix
      const b = iz * n + ix + 1
      const c = (iz + 1) * n + ix + 1
      const d = (iz + 1) * n + ix
      if (open[a] || open[b] || open[c] || open[d]) continue
      indices.push(a, d, b, b, d, c)
    }
  }
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(positions, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  geometry.computeBoundingBox()
  const mesh = new Mesh(
    geometry,
    new MeshStandardMaterial({ color: 0x5a6b4f, roughness: 0.95, side: DoubleSide }),
  )
  mesh.receiveShadow = true
  mesh.name = 'cave-heightfield-surface'
  return mesh
}

/**
 * Existing production rock framing (`createLargeCaveVisual`, already used by
 * `createCaves()`), reused presentation-only to mask the half-metre stair the
 * terrain cutout leaves around the aperture. It never stands in for
 * traversal or collision — `&rocks=0` hides it so the mouth can be checked
 * without it.
 *
 * @domain world-terrain
 */
function buildMouthRocks(fixture: CaveHeightfieldFixtureId): Group {
  const entrance = buildCaveHeightfieldFixture(fixture).entrance
  const site = { x: entrance.x, z: entrance.z, yaw: entrance.yaw, length: 3, variant: 0.37 }
  const group = createLargeCaveVisual(site)
  placeLargeCaveVisual(group, site, caveHeightfieldBaseSurfaceAt)
  group.name = 'cave-heightfield-mouth-rocks'
  return group
}

/** Half-width at `z` where the floor has risen no more than this above the
 *  local centerline floor — the readout for "does the rounding eat the
 *  declared passage width?". */
const WALKABLE_RISE = 0.3

function measureWalkableWidth(field: CaveHeightfield, x0: number, z: number): number {
  const axis = sampleHeightfieldAt(field, x0, z)
  if (axis.gap <= 0) return 0
  let width = 0
  for (const dir of [-1, 1]) {
    let d = 0
    for (let step = 0; step < 400; step++) {
      const probe = sampleHeightfieldAt(field, x0 + dir * (d + 0.05), z)
      if (probe.gap <= 0 || probe.floorY - axis.floorY > WALKABLE_RISE) break
      d += 0.05
    }
    width += d
  }
  return width
}

function measureFieldQuality(
  field: CaveHeightfield,
  topology: ReturnType<typeof buildCaveHeightfieldFixture>,
): { minCoreGap: number, maxFloorSlopeDeg: number } {
  let minCoreGap = Infinity
  for (let i = 0; i < field.coreT.length; i++) {
    if (field.coreT[i]! > 0) continue
    const gap = field.ceilY[i]! - field.floorY[i]!
    if (gap > 0 && gap < minCoreGap) minCoreGap = gap
  }
  let maxSlope = 0
  for (const seg of topology.segments) {
    for (const p of seg.centerline) {
      const here = sampleHeightfieldAt(field, p.x, p.z)
      if (here.gap <= 0) continue
      const e = field.cellSize
      const dx = sampleHeightfieldAt(field, p.x + e, p.z).floorY - sampleHeightfieldAt(field, p.x - e, p.z).floorY
      const dz = sampleHeightfieldAt(field, p.x, p.z + e).floorY - sampleHeightfieldAt(field, p.x, p.z - e).floorY
      maxSlope = Math.max(maxSlope, Math.hypot(dx, dz) / (2 * e))
    }
  }
  return {
    minCoreGap: Number.isFinite(minCoreGap) ? minCoreGap : 0,
    maxFloorSlopeDeg: (Math.atan(maxSlope) * 180) / Math.PI,
  }
}

function buildHeightfieldVariant(fixture: CaveHeightfieldFixtureId): BuiltVariant {
  const topology = buildCaveHeightfieldFixture(fixture)
  const built = buildCaveHeightfield(topology, walkSurfaceAt, DEFAULT_HEIGHTFIELD_CONFIG)
  const field = built.heightfield
  const { mesh, buffers } = createHeightfieldCaveMesh(field)
  const totalMs = built.representationMs + buffers.meshBuildMs
  const quality = measureFieldQuality(field, topology)
  const passageZ = topology.nodes.find((n) => n.kind === 'passage')?.position.z ?? -8
  const passageX = topology.nodes.find((n) => n.kind === 'passage')?.position.x ?? 0
  return {
    caveMesh: mesh,
    field,
    surfaceMesh: buildSurfaceMesh((x, z) => {
      const sample = sampleHeightfieldAt(field, x, z)
      return sample.gap > 0 && sample.openSky
    }),
    rocks: null,
    world: createHeightfieldWalkWorld(field, baseSurfaceAt, walkSurfaceAt),
    metrics: {
      variant: 'heightfield',
      fixture,
      representationMs: built.representationMs,
      meshBuildMs: buffers.meshBuildMs,
      totalMs,
      vertices: buffers.vertices,
      triangles: buffers.triangles,
      geometryBytes: buffers.geometryBytes,
      cellSize: field.cellSize,
      gridWidth: field.nx,
      gridDepth: field.nz,
      caveNodeCount: built.caveNodeCount,
      rimVertexCount: buffers.rimVertexCount,
      fieldBytes: field.floorY.byteLength + field.ceilY.byteLength
        + field.surfaceY.byteLength + field.coreT.byteLength,
      walkableWidth: measureWalkableWidth(field, passageX, passageZ),
      minCoreGap: quality.minCoreGap,
      maxFloorSlopeDeg: quality.maxFloorSlopeDeg,
    },
  }
}

function buildSdfVariant(fixture: CaveHeightfieldFixtureId): BuiltVariant {
  const topology = buildCaveHeightfieldFixture(fixture)
  const t0 = now()
  const field = buildCaveSdfRepresentation(topology, DEFAULT_SDF_PARAMS)
  const t1 = now()
  const meshResult = buildSdfCaveMesh(topology, DEFAULT_SDF_PARAMS, baseSurfaceAt, field)
  const t2 = now()
  const material = createCaveSpikeMaterial('sdf')
  material.side = FrontSide
  const caveMesh = new Mesh(meshResult.geometry, material)
  caveMesh.castShadow = true
  caveMesh.receiveShadow = true
  caveMesh.name = 'cave-sdf-baseline'
  const index = buildCaveSdfColumnIndex(field, topology, baseSurfaceAt)
  const colliders = buildCaveSdfColliders(
    index,
    baseSurfaceAt,
    field,
    caveMouthColliderFilter(topology),
  )
  return {
    caveMesh,
    field: null,
    surfaceMesh: buildSurfaceMesh(null),
    rocks: null,
    world: createSdfWalkWorld(index, colliders, walkSurfaceAt),
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
    gridNodes: metrics.gridWidth != null ? `${metrics.gridWidth}×${metrics.gridDepth}` : 'n/a',
    caveNodeCount: metrics.caveNodeCount ?? 'n/a',
    rimVertexCount: metrics.rimVertexCount ?? 'n/a',
    fieldBytes: metrics.fieldBytes ?? 'n/a',
    walkableWidth: metrics.walkableWidth != null ? Number(metrics.walkableWidth.toFixed(2)) : 'n/a',
    minCoreGap: metrics.minCoreGap != null ? Number(metrics.minCoreGap.toFixed(2)) : 'n/a',
    maxFloorSlopeDeg: metrics.maxFloorSlopeDeg != null ? Number(metrics.maxFloorSlopeDeg.toFixed(1)) : 'n/a',
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
    ? `<div>grid ${metrics.gridWidth}×${metrics.gridDepth} nodes @ ${metrics.cellSize} m · field ${metrics.fieldBytes} B</div>
       <div>cave nodes ${metrics.caveNodeCount} · rim verts ${metrics.rimVertexCount}</div>
       <div>walkable ${metrics.walkableWidth?.toFixed(2)} m · min core gap ${metrics.minCoreGap?.toFixed(2)} m ·
         max floor ${metrics.maxFloorSlopeDeg?.toFixed(1)}°</div>`
    : '<div>SDF baseline (production field + Surface Nets, terrain sheet closed)</div>'
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
    <div style="margin-top:6px;opacity:0.9">
      terrain: production analytic sampler, seed ${CAVE_HEIGHTFIELD_TERRAIN_SEED}
      @ (${CAVE_HEIGHTFIELD_TERRAIN_ANCHOR.x}, ${CAVE_HEIGHTFIELD_TERRAIN_ANCHOR.z})<br>
      surface over deepest station: ${deepestSurfaceAbove(fixture).toFixed(1)} m
    </div>
    <div style="margin-top:8px;opacity:0.85">
      [1] heightfield/SDF · [2] Walk/Inspect · [3] fixture · [4] mouth rocks<br>
      WASD walk · mouse look · click canvas to lock pointer<br>
      2.5D cannot represent stacked / crossing / shaft geometry or a true overhang
    </div>
  `
}

/** Metres of hillside above the deepest station — the outdoor-surface ↔
 *  cave-interior conflict the Walk-mode review is looking for. */
function deepestSurfaceAbove(fixture: CaveHeightfieldFixtureId): number {
  const topology = buildCaveHeightfieldFixture(fixture)
  let deepest = 0
  for (const node of topology.nodes) {
    deepest = Math.max(deepest, baseSurfaceAt(node.position.x, node.position.z) - node.position.y)
  }
  return deepest
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
  const entranceY = buildCaveHeightfieldFixture('basic').entrance.y
  camera.position.set(8, entranceY + 6, 14)

  const orbit = new OrbitControls(camera, renderer.domElement)
  orbit.enableDamping = true
  orbit.target.set(0, entranceY + 1, -8)
  orbit.enabled = mode === 'inspect'

  scene.add(new AmbientLight(0xffffff, 0.45))
  const sun = new DirectionalLight(0xfff4dd, 1.15)
  sun.position.set(12, 22, 10)
  sun.castShadow = true
  scene.add(sun)

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

  let showRocks = urlParamValue('rocks') !== '0'
  let built = variant === 'sdf' ? buildSdfVariant(fixture) : buildHeightfieldVariant(fixture)
  built.rocks = showRocks ? buildMouthRocks(fixture) : null
  scene.add(built.caveMesh)
  scene.add(built.surfaceMesh)
  if (built.rocks) scene.add(built.rocks)
  reportMetrics(built.metrics)
  renderOverlay(overlay, variant, fixture, mode, built.metrics)
  writeUrlState(variant, fixture, mode)

  const walker = await createCaveHeightfieldWalker()
  scene.add(walker.root)
  const spawn = spawnPose()
  built.world.resetGround()
  walker.spawn(spawn.x, spawn.y, spawn.z, spawn.yaw)

  const disposeMesh = (mesh: Mesh): void => {
    scene.remove(mesh)
    mesh.geometry.dispose()
    const mat = mesh.material
    if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
    else mat.dispose()
  }

  const disposeRocks = (): void => {
    if (!built.rocks) return
    scene.remove(built.rocks)
    built.rocks.traverse((obj) => {
      const mesh = obj as Mesh
      if (!mesh.isMesh) return
      mesh.geometry.dispose()
      const mat = mesh.material
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
      else mat.dispose()
    })
    built.rocks = null
  }

  const disposeBuilt = (): void => {
    disposeRocks()
    disposeMesh(built.caveMesh)
    disposeMesh(built.surfaceMesh)
  }

  const rebuild = (): void => {
    disposeBuilt()
    built = variant === 'sdf' ? buildSdfVariant(fixture) : buildHeightfieldVariant(fixture)
    built.rocks = showRocks ? buildMouthRocks(fixture) : null
    built.world.resetGround()
    scene.add(built.caveMesh)
    scene.add(built.surfaceMesh)
    if (built.rocks) scene.add(built.rocks)
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
    } else if (event.code === 'Digit4') {
      showRocks = !showRocks
      if (showRocks) {
        built.rocks = buildMouthRocks(fixture)
        scene.add(built.rocks)
      } else {
        disposeRocks()
      }
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
      walker.update(dt, keyboard.state, mouseLook.state, camera, built.world)
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
    overlay.remove()
    renderer.dispose()
    renderer.domElement.remove()
  }
}
