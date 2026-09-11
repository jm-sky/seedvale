/** Isolated `?caveHeightfieldTest` harness for the production cave
 *  heightfield representation and its spatial queries. Bypasses WorldBundle
 *  / save / streaming — see `createModelTestScene.ts` for the structural
 *  pattern. The former SDF comparison variant was retired with the SDF
 *  runtime (world-terrain-019).
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
  Group,
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
import { createLargeRock } from '../settlement/decorProps'
import { openingDirection } from '../world/caves/caveOrientation'
import {
  buildCaveHeightfieldFixture,
  CAVE_HEIGHTFIELD_FIXTURE_IDS,
  caveHeightfieldBaseSurfaceAt,
  type CaveHeightfieldFixtureId,
  type CaveHeightfieldMode,
  caveHeightfieldWalkSurfaceAt,
  parseCaveHeightfieldFixtureId,
  parseCaveHeightfieldMode,
} from './caves/caveHeightfieldFixtures'
import {
  createHeightfieldCaveMesh,
  createMouthUndersideMask,
  marchCellRing,
} from './caves/caveHeightfieldMesh'
import { createCaveHeightfieldWalker } from './caves/caveHeightfieldPlayer'
import {
  buildCaveHeightfield,
  type CaveHeightfield,
  DEFAULT_HEIGHTFIELD_CONFIG,
  mouthOpeningAt,
  sampleHeightfieldAt,
} from './caves/caveHeightfieldRepresentation'
import {
  CAVE_HEIGHTFIELD_TERRAIN_ANCHOR,
  CAVE_HEIGHTFIELD_TERRAIN_SEED,
} from './caves/caveHeightfieldTerrain'
import { type CaveWalkWorld, createHeightfieldWalkWorld } from './caves/caveHeightfieldWalkWorld'
import { urlParamValue } from './debugMode'

export type CaveHeightfieldSpikeMetrics = {
  fixture: CaveHeightfieldFixtureId
  representationMs: number
  meshBuildMs: number
  totalMs: number
  vertices: number
  triangles: number
  geometryBytes: number
  cellSize: number
  gridWidth: number
  gridDepth: number
  /** Grid nodes carrying cave void (`gap > 0`). */
  caveNodeCount: number
  /** Vertices on the `gap = 0` contour, shared by floor and ceiling. */
  rimVertexCount: number
  /** Vertices on the open-sky contour, where ceiling and terrain meet. */
  skyVertexCount: number
  /** Widest cave span across the main chamber node. */
  chamberSpan: number
  /** Persistent field memory (floor/ceiling/surface/coreT arrays). */
  fieldBytes: number
  /** Width at the mid-passage station where the floor has risen <= 0.3 m. */
  walkableWidth: number
  /** Worst clearance anywhere in the walkable core. */
  minCoreGap: number
  /** Steepest floor grade along the centerline. */
  maxFloorSlopeDeg: number
}

type BuiltFixture = {
  caveMesh: Mesh
  world: CaveWalkWorld
  metrics: CaveHeightfieldSpikeMetrics
  /** Cave-aware terrain mesh: the mouth is a real hole in it. */
  surfaceMesh: Mesh
  /** Rock framing that masks the terrain-cutout seam (presentation only). */
  rocks: Group | null
  /** Dark-rock beam under the terrain around the mouth — presentation only,
   *  independent of rock framing. Catches grazing views through residual
   *  millimetre gaps. */
  mouthMask: Mesh | null
  field: CaveHeightfield
  /** Positive where cave void breaks the walk surface. Drives the terrain
   *  cutout, the cave ceiling clip and the rock placement from one contour. */
  mouthOpening: (x: number, z: number) => number
}

/** Presentation-only mouth rocks for a built fixture. */
function makeRocks(built: BuiltFixture): Group {
  return buildMouthRocks(built.field, built.mouthOpening)
}

/** The one analytic surface the representation is built against —
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

function writeUrlState(fixture: CaveHeightfieldFixtureId, mode: CaveHeightfieldMode): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.set('caveHeightfieldTest', '')
  url.searchParams.delete('variant')
  url.searchParams.set('fixture', fixture)
  url.searchParams.set('mode', mode)
  window.history.replaceState(null, '', url)
}

const SURFACE_SIZE = 72
/** Terrain texel size. Production terrain is 1 m (`chunkSize` 64 /
 *  `resolution` 65); 0.5 m here only so the mouth contour below has finer
 *  vertices to interpolate between. The hillside itself is still the
 *  production analytic sampler. */
const SURFACE_STEP = 0.5

/**
 * Cave-aware terrain mesh.
 *
 * The terrain is kept where `mouthOpening(x, z) < 0` and **clipped on that
 * contour** with the same marching-squares walk the cave mesher uses, where
 *
 * ```text
 * mouthOpening = min(gap, ceilY - (surfaceY - SURFACE_CLIP_EPS))
 * ```
 *
 * i.e. positive only where cave void actually breaks the walk surface. The
 * previous rule dropped a whole quad if *any* corner was open, which cut up
 * to a full cell past the contour and past the cave footprint entirely —
 * that is what opened real holes beside the mouth and exposed the
 * back-facing cave ceiling. Clipping instead means the terrain stops exactly
 * where `ceilY = surfaceY`, which is exactly where the cave ceiling now
 * stops too, at the same height.
 *
 * @domain world-terrain
 */
function buildSurfaceMesh(mouthOpening: (x: number, z: number) => number): Mesh {
  const n = Math.round(SURFACE_SIZE / SURFACE_STEP) + 1
  const half = SURFACE_SIZE / 2
  const nodeX = (ix: number): number => -half + ix * SURFACE_STEP
  const nodeZ = (iz: number): number => -half + iz * SURFACE_STEP
  const height = new Float32Array(n * n)
  const keep = new Float32Array(n * n)
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const x = nodeX(ix)
      const z = nodeZ(iz)
      const i = iz * n + ix
      height[i] = walkSurfaceAt(x, z)
      keep[i] = -mouthOpening(x, z)
    }
  }

  const positions: number[] = []
  const indices: number[] = []
  const nodeVertex = new Int32Array(n * n).fill(-1)
  const edgeVertex = new Int32Array(n * n * 2).fill(-1)

  const pushVertex = (x: number, y: number, z: number): number => {
    const v = positions.length / 3
    positions.push(x, y, z)
    return v
  }
  const nodeVertexAt = (ix: number, iz: number): number => {
    const i = iz * n + ix
    let v = nodeVertex[i]!
    if (v < 0) {
      v = pushVertex(nodeX(ix), height[i]!, nodeZ(iz))
      nodeVertex[i] = v
    }
    return v
  }
  const edgeVertexAt = (ixA: number, izA: number, ixB: number, izB: number, t: number): number => {
    const along = ixB > ixA || izB > izA
    const loIx = along ? ixA : ixB
    const loIz = along ? izA : izB
    const key = ((loIz * n + loIx) * 2) + (ixA === ixB ? 1 : 0)
    let v = edgeVertex[key]!
    if (v >= 0) return v
    const ia = izA * n + ixA
    const ib = izB * n + ixB
    v = pushVertex(
      nodeX(ixA) + (nodeX(ixB) - nodeX(ixA)) * t,
      height[ia]! + (height[ib]! - height[ia]!) * t,
      nodeZ(izA) + (nodeZ(izB) - nodeZ(izA)) * t,
    )
    edgeVertex[key] = v
    return v
  }

  const ring: number[] = []
  for (let iz = 0; iz + 1 < n; iz++) {
    for (let ix = 0; ix + 1 < n; ix++) {
      marchCellRing((cx, cz) => keep[cz * n + cx]!, ix, iz, nodeVertexAt, edgeVertexAt, ring)
      // Terrain faces up: same winding the cave floor uses (verified there).
      for (let k = 1; k + 1 < ring.length; k++) indices.push(ring[0]!, ring[k]!, ring[k + 1]!)
    }
  }

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3))
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
 * Rock framing for the mouth — **presentation only**.
 *
 * Reuses the existing `createLargeRock` prop and places it from the
 * heightfield's own opening contour: for a few steps along the opening axis
 * it marches outward until `mouthOpening` turns negative (the terrain edge)
 * and drops a rock just beyond it. So the rocks sit on the terrain side of
 * the cut by construction and the corridor stays clear — the previous
 * `createLargeCaveVisual` layout is the V1 rock-lined-trench arrangement and
 * put an arc of rocks straight across the approach, and on the *un-carved*
 * base height, so it floated over the pit.
 *
 * These rocks carry no collision (the walk world only reads the heightfield),
 * so they can never be an invisible blocker; `[4]` / `&rocks=0` removes them
 * and the entrance must still read and traverse correctly without them.
 *
 * @domain world-terrain
 */
function buildMouthRocks(field: CaveHeightfield, mouthOpening: (x: number, z: number) => number): Group {
  const group = new Group()
  group.name = 'cave-heightfield-mouth-rocks'
  const out = openingDirection(field.entrance.yaw)
  // Lateral axis, perpendicular to the opening direction in XZ.
  const sideX = -out.dz
  const sideZ = out.dx
  let variant = 0.17
  for (let step = -2; step <= 3; step++) {
    const along = step * 0.9
    const ax = field.entrance.x + out.dx * along
    const az = field.entrance.z + out.dz * along
    for (const sign of [-1, 1]) {
      let rim = 0
      for (let d = 0.2; d <= 4; d += 0.1) {
        if (mouthOpening(ax + sideX * sign * d, az + sideZ * sign * d) < 0) { rim = d; break }
      }
      if (rim <= 0) continue
      variant = (variant + 0.37) % 1
      const scale = 0.7 + variant * 0.5
      const rock = createLargeRock(scale, variant)
      const rx = ax + sideX * sign * (rim + 0.35)
      const rz = az + sideZ * sign * (rim + 0.35)
      rock.position.set(rx, walkSurfaceAt(rx, rz) - 0.25, rz)
      rock.rotation.y = variant * Math.PI * 2
      group.add(rock)
    }
  }
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

/** Widest cave span across the main chamber node — the readout for "does the
 *  chamber read as a room?". */
function measureChamberSpan(
  field: CaveHeightfield,
  topology: ReturnType<typeof buildCaveHeightfieldFixture>,
): number {
  const chamber = topology.nodes.find((n) => n.kind === 'chamber')
  if (!chamber) return 0
  let min = Infinity
  let max = -Infinity
  const reach = chamber.targetWidth + 4
  for (let d = -reach; d <= reach; d += 0.1) {
    if (sampleHeightfieldAt(field, chamber.position.x + d, chamber.position.z).gap <= 0) continue
    min = Math.min(min, d)
    max = Math.max(max, d)
  }
  return max >= min ? max - min : 0
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

function buildFixture(fixture: CaveHeightfieldFixtureId): BuiltFixture {
  const topology = buildCaveHeightfieldFixture(fixture)
  const built = buildCaveHeightfield(topology, walkSurfaceAt, DEFAULT_HEIGHTFIELD_CONFIG)
  const field = built.heightfield
  const mouthOpening = (x: number, z: number): number => mouthOpeningAt(field, walkSurfaceAt, x, z)
  const { mesh, buffers } = createHeightfieldCaveMesh(field)
  const totalMs = built.representationMs + buffers.meshBuildMs
  const quality = measureFieldQuality(field, topology)
  const passageZ = topology.nodes.find((n) => n.kind === 'passage')?.position.z ?? -8
  const passageX = topology.nodes.find((n) => n.kind === 'passage')?.position.x ?? 0
  return {
    caveMesh: mesh,
    field,
    mouthOpening,
    surfaceMesh: buildSurfaceMesh(mouthOpening),
    rocks: null,
    mouthMask: createMouthUndersideMask(field, mouthOpening, walkSurfaceAt),
    world: createHeightfieldWalkWorld(field, baseSurfaceAt, walkSurfaceAt),
    metrics: {
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
      skyVertexCount: buffers.skyVertexCount,
      chamberSpan: measureChamberSpan(field, topology),
      fieldBytes: field.floorY.byteLength + field.ceilY.byteLength
        + field.surfaceY.byteLength + field.coreT.byteLength,
      walkableWidth: measureWalkableWidth(field, passageX, passageZ),
      minCoreGap: quality.minCoreGap,
      maxFloorSlopeDeg: quality.maxFloorSlopeDeg,
    },
  }
}

function reportMetrics(metrics: CaveHeightfieldSpikeMetrics): void {
  console.log(`[caveHeightfieldTest] fixture=${metrics.fixture}`)
  console.table({
    representationMs: Number(metrics.representationMs.toFixed(2)),
    meshBuildMs: Number(metrics.meshBuildMs.toFixed(2)),
    totalMs: Number(metrics.totalMs.toFixed(2)),
    vertices: metrics.vertices,
    triangles: metrics.triangles,
    geometryBytes: metrics.geometryBytes,
    cellSize: metrics.cellSize,
    gridNodes: `${metrics.gridWidth}×${metrics.gridDepth}`,
    caveNodeCount: metrics.caveNodeCount,
    rimVertexCount: metrics.rimVertexCount,
    skyVertexCount: metrics.skyVertexCount,
    chamberSpan: Number(metrics.chamberSpan.toFixed(1)),
    fieldBytes: metrics.fieldBytes,
    walkableWidth: Number(metrics.walkableWidth.toFixed(2)),
    minCoreGap: Number(metrics.minCoreGap.toFixed(2)),
    maxFloorSlopeDeg: Number(metrics.maxFloorSlopeDeg.toFixed(1)),
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
  fixture: CaveHeightfieldFixtureId,
  mode: CaveHeightfieldMode,
  metrics: CaveHeightfieldSpikeMetrics,
): void {
  const extra = `<div>grid ${metrics.gridWidth}×${metrics.gridDepth} nodes @ ${metrics.cellSize} m · field ${metrics.fieldBytes} B</div>
       <div>cave nodes ${metrics.caveNodeCount} · rim ${metrics.rimVertexCount} · sky ${metrics.skyVertexCount}</div>
       <div>chamber span ${metrics.chamberSpan.toFixed(1)} m</div>
       <div>walkable ${metrics.walkableWidth.toFixed(2)} m · min core gap ${metrics.minCoreGap.toFixed(2)} m ·
         max floor ${metrics.maxFloorSlopeDeg.toFixed(1)}°</div>`
  el.innerHTML = `
    <div style="font-weight:700;margin-bottom:6px">Cave heightfield harness</div>
    <div>fixture: <b>${fixture}</b> · mode: <b>${mode}</b></div>
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
      [2] Walk/Inspect · [3] fixture · [4] mouth rocks<br>
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
 * Ultra-minimal scene for `?caveHeightfieldTest`.
 *
 * @domain world-terrain
 */
export async function createCaveHeightfieldTestScene(container: HTMLElement): Promise<() => void> {
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
  let built = buildFixture(fixture)
  built.rocks = showRocks ? makeRocks(built) : null
  scene.add(built.caveMesh)
  scene.add(built.surfaceMesh)
  if (built.mouthMask) scene.add(built.mouthMask)
  if (built.rocks) scene.add(built.rocks)
  reportMetrics(built.metrics)
  renderOverlay(overlay, fixture, mode, built.metrics)
  writeUrlState(fixture, mode)

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
    if (built.mouthMask) {
      disposeMesh(built.mouthMask)
      built.mouthMask = null
    }
    disposeMesh(built.caveMesh)
    disposeMesh(built.surfaceMesh)
  }

  const rebuild = (): void => {
    disposeBuilt()
    built = buildFixture(fixture)
    built.rocks = showRocks ? makeRocks(built) : null
    built.world.resetGround()
    scene.add(built.caveMesh)
    scene.add(built.surfaceMesh)
    if (built.mouthMask) scene.add(built.mouthMask)
    if (built.rocks) scene.add(built.rocks)
    reportMetrics(built.metrics)
    renderOverlay(overlay, fixture, mode, built.metrics)
    writeUrlState(fixture, mode)
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
    renderOverlay(overlay, fixture, mode, built.metrics)
    writeUrlState(fixture, mode)
  }

  const onHarnessKey = (event: KeyboardEvent): void => {
    if (event.repeat) return
    if (event.code === 'Digit2') {
      mode = mode === 'walk' ? 'inspect' : 'walk'
      applyMode()
    } else if (event.code === 'Digit4') {
      showRocks = !showRocks
      if (showRocks) {
        built.rocks = makeRocks(built)
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
