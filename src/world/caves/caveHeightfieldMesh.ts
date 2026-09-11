/** Production cave heightfield presentation buffers (plan world-terrain-019
 *  Milestone B) — pure CPU mesh assembly from `CaveHeightfieldRepresentation`.
 *  No Three.js here; `caveHeightfieldPresentation.ts` wraps these buffers
 *  into scene objects. Presentation only: nothing in this module is a
 *  gameplay, collision or camera source of truth.
 *
 *  There is **no boundary-wall pass**. The footprint is the `gap > 0` region
 *  of the field, its outline is found with marching squares on `gap`, and the
 *  rim vertex on each crossing edge is *shared* by the floor and the ceiling.
 *  The surface therefore folds over at the rim: the wall is the outer part of
 *  the floor meeting the outer part of the ceiling, welded, with no vertical
 *  rectangles and no seam to align. The ceiling is additionally clipped on
 *  the open-sky contour (`ceilY = surfaceY - SURFACE_CLIP_EPS`), which is the
 *  same contour the terrain cutout stops on (`mouthOpeningAt`).
 *
 * @domain world-terrain
 */

import { CELL_RING, marchCellRing } from '../../terrain/gridContour'
import {
  type CaveHeightfieldRepresentation,
  heightfieldNodeGap,
  sampleHeightfieldAt,
} from './caveHeightfieldRepresentation'
import { openingDirection } from './caveOrientation'
import { SURFACE_CLIP_EPS } from './caveSurface'

export type HeightfieldMeshBuffers = {
  positions: Float32Array
  indices: Uint32Array
  colors: Float32Array
  vertices: number
  triangles: number
  geometryBytes: number
  /** Vertices on the `gap = 0` contour, shared by floor and ceiling. */
  rimVertexCount: number
  /** Vertices on the open-sky contour, where the ceiling meets the terrain. */
  skyVertexCount: number
  /** Cells that produced at least one floor triangle. */
  caveCellCount: number
  meshBuildMs: number
}

const FLOOR_COLOR = [0.45, 0.34, 0.24] as const
const CEILING_COLOR = [0.22, 0.21, 0.20] as const
/** Colour at the rim, where floor and ceiling meet and read as wall. */
const RIM_COLOR = [0.32, 0.28, 0.24] as const

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** Cheap deterministic tonal wobble on already-authored role colours.
 *  Ceiling darkens slightly with distance from the entrance; floor stays a
 *  touch warmer. No noise field — two sines plus a distance term. */
function tintVertexColor(
  base: readonly [number, number, number],
  x: number,
  z: number,
  entranceX: number,
  entranceZ: number,
  role: 'floor' | 'ceiling' | 'rim',
): [number, number, number] {
  const wobble = Math.sin(x * 1.73 + z * 2.11) * 0.028 + Math.sin(x * 3.07 - z * 1.43) * 0.016
  const dist = Math.hypot(x - entranceX, z - entranceZ)
  const depth = role === 'ceiling' ? Math.min(0.08, dist * 0.0055) : 0
  const warmth = role === 'floor' ? 0.025 : role === 'rim' ? 0.012 : 0
  return [
    clamp01(base[0] * (1 + wobble - depth) + warmth),
    clamp01(base[1] * (1 + wobble * 0.65 - depth)),
    clamp01(base[2] * (1 + wobble * 0.4 - depth) - warmth * 0.6),
  ]
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

type Builder = {
  positions: number[]
  colors: number[]
  indices: number[]
}

function pushVertex(
  b: Builder,
  x: number,
  y: number,
  z: number,
  color: readonly [number, number, number],
): number {
  const i = b.positions.length / 3
  b.positions.push(x, y, z)
  b.colors.push(color[0], color[1], color[2])
  return i
}

/** Fan-triangulate a ring of vertex indices. `flip` reverses the winding so
 *  the ceiling faces −Y. */
function emitFan(b: Builder, ring: readonly number[], flip: boolean): void {
  for (let i = 1; i + 1 < ring.length; i++) {
    const a = ring[0]!
    const c = ring[i]!
    const d = ring[i + 1]!
    if (flip) b.indices.push(a, d, c)
    else b.indices.push(a, c, d)
  }
}

/**
 * Builds CPU mesh buffers for the floor and the ceiling from the same field
 * traversal uses. Interior vertices are shared between neighbouring cells
 * (so `computeVertexNormals()` can actually smooth, and there are no gaps
 * between cells); rim vertices are shared between the floor and the ceiling
 * (so the two surfaces are welded and the cave is closed).
 *
 * @domain world-terrain
 */
export function buildHeightfieldMeshBuffers(field: CaveHeightfieldRepresentation): HeightfieldMeshBuffers {
  const t0 = now()
  const { nx, nz, cellSize, originX, originZ, floorY, ceilY } = field
  const b: Builder = { positions: [], colors: [], indices: [] }

  const nodeCount = nx * nz
  const floorVertex = new Int32Array(nodeCount).fill(-1)
  const ceilVertex = new Int32Array(nodeCount).fill(-1)
  // Two rim slots per node: 0 = edge to +X neighbour, 1 = edge to +Z neighbour.
  const rimVertex = new Int32Array(nodeCount * 2).fill(-1)
  let rimVertexCount = 0
  let caveCellCount = 0

  const skyVertex = new Int32Array(nodeCount * 2).fill(-1)
  let skyVertexCount = 0

  const gapAt = (i: number): number => heightfieldNodeGap(field, i)
  /** Metres of rock between the cave ceiling and the walk surface. Negative
   *  where the void breaks through — the open-sky / portal region. */
  const surfGapAt = (i: number): number => field.surfaceY[i]! - SURFACE_CLIP_EPS - ceilY[i]!
  /** Where a ceiling should exist at all: inside the cave *and* under rock. */
  const ceilExtentAt = (i: number): number => Math.min(gapAt(i), surfGapAt(i))
  const ex = field.entrance.x
  const ez = field.entrance.z
  const shade = (
    base: readonly [number, number, number],
    x: number,
    z: number,
    role: 'floor' | 'ceiling' | 'rim',
  ): [number, number, number] => tintVertexColor(base, x, z, ex, ez, role)

  const floorVertexAt = (ix: number, iz: number): number => {
    const i = iz * nx + ix
    let v = floorVertex[i]!
    if (v < 0) {
      const x = originX + ix * cellSize
      const z = originZ + iz * cellSize
      v = pushVertex(b, x, floorY[i]!, z, shade(FLOOR_COLOR, x, z, 'floor'))
      floorVertex[i] = v
    }
    return v
  }

  const ceilVertexAt = (ix: number, iz: number): number => {
    const i = iz * nx + ix
    let v = ceilVertex[i]!
    if (v < 0) {
      const x = originX + ix * cellSize
      const z = originZ + iz * cellSize
      v = pushVertex(b, x, ceilY[i]!, z, shade(CEILING_COLOR, x, z, 'ceiling'))
      ceilVertex[i] = v
    }
    return v
  }

  /** Rim vertex on the edge between two orthogonally adjacent nodes, created
   *  once and reused by both cells and by both surfaces. */
  const rimVertexAt = (ixA: number, izA: number, ixB: number, izB: number): number => {
    const along = ixB > ixA || izB > izA
    const loIx = along ? ixA : ixB
    const loIz = along ? izA : izB
    const slot = ixA === ixB ? 1 : 0
    const key = (loIz * nx + loIx) * 2 + slot
    let v = rimVertex[key]!
    if (v >= 0) return v
    const ia = izA * nx + ixA
    const ib = izB * nx + ixB
    const ga = gapAt(ia)
    const gb = gapAt(ib)
    const denom = ga - gb
    const t = Math.abs(denom) < 1e-9 ? 0.5 : Math.max(0, Math.min(1, ga / denom))
    const ax = originX + ixA * cellSize
    const az = originZ + izA * cellSize
    const bx = originX + ixB * cellSize
    const bz = originZ + izB * cellSize
    const midA = (floorY[ia]! + ceilY[ia]!) * 0.5
    const midB = (floorY[ib]! + ceilY[ib]!) * 0.5
    const rx = ax + (bx - ax) * t
    const rz = az + (bz - az) * t
    v = pushVertex(
      b,
      rx,
      midA + (midB - midA) * t,
      rz,
      shade(RIM_COLOR, rx, rz, 'rim'),
    )
    rimVertex[key] = v
    rimVertexCount++
    return v
  }

  /** Sky-rim vertex on the open-sky contour `ceilY = surfaceY - eps`. A
   *  separate cache from `rimVertexAt` because this contour is not the
   *  floor/ceiling weld — only the ceiling ends here, and it ends at the
   *  terrain's own height, which is where the terrain mesh stops too. */
  const skyVertexAt = (ixA: number, izA: number, ixB: number, izB: number, t: number): number => {
    const along = ixB > ixA || izB > izA
    const loIx = along ? ixA : ixB
    const loIz = along ? izA : izB
    const slot = ixA === ixB ? 1 : 0
    const key = (loIz * nx + loIx) * 2 + slot
    let v = skyVertex[key]!
    if (v >= 0) return v
    const ia = izA * nx + ixA
    const ib = izB * nx + ixB
    const ax = originX + ixA * cellSize
    const az = originZ + izA * cellSize
    const bx = originX + ixB * cellSize
    const bz = originZ + izB * cellSize
    const sx = ax + (bx - ax) * t
    const sz = az + (bz - az) * t
    v = pushVertex(
      b,
      sx,
      ceilY[ia]! + (ceilY[ib]! - ceilY[ia]!) * t,
      sz,
      shade(CEILING_COLOR, sx, sz, 'ceiling'),
    )
    skyVertex[key] = v
    skyVertexCount++
    return v
  }

  const ring: number[] = []
  for (let iz = 0; iz + 1 < nz; iz++) {
    for (let ix = 0; ix + 1 < nx; ix++) {
      let insideCount = 0
      for (const [dx, dz] of CELL_RING) {
        if (gapAt((iz + dz) * nx + (ix + dx)) > 0) insideCount++
      }
      if (insideCount === 0) continue
      caveCellCount++

      // Floor: the whole `gap > 0` region, ending on the floor/ceiling weld.
      marchCellRing(
        (cx, cz) => gapAt(cz * nx + cx),
        ix,
        iz,
        floorVertexAt,
        (axi, azi, bxi, bzi) => rimVertexAt(axi, azi, bxi, bzi),
        ring,
      )
      if (ring.length >= 3) emitFan(b, ring, false)

      // Ceiling: the `gap > 0` region minus the part that breaks the walk
      // surface, so the portal is a real opening and the ceiling stops on
      // exactly the contour the terrain mesh stops on.
      marchCellRing(
        (cx, cz) => ceilExtentAt(cz * nx + cx),
        ix,
        iz,
        ceilVertexAt,
        (axi, azi, bxi, bzi, t) => (
          // Which term closed the ceiling here? On the `gap` term the vertex
          // is the shared floor/ceiling weld; on the surface term it is the
          // open-sky rim.
          gapAt(azi * nx + axi) <= surfGapAt(azi * nx + axi)
          && gapAt(bzi * nx + bxi) <= surfGapAt(bzi * nx + bxi)
            ? rimVertexAt(axi, azi, bxi, bzi)
            : skyVertexAt(axi, azi, bxi, bzi, t)
        ),
        ring,
      )
      if (ring.length >= 3) {
        ring.reverse()
        emitFan(b, ring, false)
      }
    }
  }

  const positions = new Float32Array(b.positions)
  const indices = new Uint32Array(b.indices)
  const colors = new Float32Array(b.colors)
  const vertices = positions.length / 3
  return {
    positions,
    indices,
    colors,
    vertices,
    triangles: indices.length / 3,
    geometryBytes: positions.byteLength + indices.byteLength + colors.byteLength,
    rimVertexCount,
    skyVertexCount,
    caveCellCount,
    meshBuildMs: now() - t0,
  }
}

// ── Mouth underside mask (presentation only) ────────────────────────────────
//
// Residual millimetre gaps between the terrain cutout and the cave mesh can
// still show the sky / the empty underside of the terrain sheet from a
// grazing angle. A cheap dark-rock box-beam sits under the terrain around
// the mouth contour, plus larger underground patches in front of and beside
// the doorway. It does not own spatial representation, collision, or the
// terrain cutout.

/** Metres outside the opening contour the inner edge of the mask sits. */
const MASK_INNER = 0.08
/** Metres outside the contour the outer edge sits — under the terrain. */
const MASK_OUTER = 1.15
/** Preferred drop below the walk surface. Shrinks when overburden is thin
 *  so the mask never hangs through the cave ceiling into the doorway. */
const MASK_SINK = 0.16
/** Vertical thickness of the beam where there is room in the rock. */
const MASK_DEPTH = 1.25
/** Stay this far above `ceilY` whenever cave void exists below. */
const MASK_CEILING_CLEAR = 0.05
const MASK_SEGMENTS = 32
const MASK_MARCH_MAX = 8
const MASK_MARCH_STEP = 0.06

export type MouthUndersideMaskBuffers = {
  positions: Float32Array
  indices: Uint32Array
  vertices: number
  triangles: number
}

type RimPoint = { x: number, z: number, ox: number, oz: number }

function emptyMouthMask(): MouthUndersideMaskBuffers {
  return { positions: new Float32Array(0), indices: new Uint32Array(0), vertices: 0, triangles: 0 }
}

/** Average of opening samples around the entrance — the star-centre the
 *  contour is marched from. Falls back to the entrance itself. */
function mouthOpeningCentroid(
  field: CaveHeightfieldRepresentation,
  mouthOpening: (x: number, z: number) => number,
): { x: number, z: number } {
  let sx = 0
  let sz = 0
  let n = 0
  for (let z = field.entrance.z - 5; z <= field.entrance.z + 6; z += 0.25) {
    for (let x = field.entrance.x - 5; x <= field.entrance.x + 5; x += 0.25) {
      if (mouthOpening(x, z) <= 0) continue
      sx += x
      sz += z
      n++
    }
  }
  return n > 0 ? { x: sx / n, z: sz / n } : { x: field.entrance.x, z: field.entrance.z }
}

function sampleMouthRim(
  field: CaveHeightfieldRepresentation,
  mouthOpening: (x: number, z: number) => number,
): RimPoint[] {
  const c = mouthOpeningCentroid(field, mouthOpening)
  const rim: RimPoint[] = []
  for (let i = 0; i < MASK_SEGMENTS; i++) {
    const theta = (i / MASK_SEGMENTS) * Math.PI * 2
    const dx = Math.cos(theta)
    const dz = Math.sin(theta)
    let hit = 0
    for (let d = MASK_MARCH_STEP; d <= MASK_MARCH_MAX; d += MASK_MARCH_STEP) {
      if (mouthOpening(c.x + dx * d, c.z + dz * d) <= 0) {
        hit = d
        break
      }
    }
    if (hit <= 0) continue
    const x = c.x + dx * hit
    const z = c.z + dz * hit
    const ox = x - c.x
    const oz = z - c.z
    const len = Math.hypot(ox, oz)
    rim.push({
      x,
      z,
      ox: len > 1e-6 ? ox / len : dx,
      oz: len > 1e-6 ? oz / len : dz,
    })
  }
  return rim
}

/**
 * Vertical extent of the mask at `(x, z)`. Always below the walk surface;
 * when cave void exists below, also stays above the ceiling so the beam
 * lives in the rock / under-terrain volume and never occupies the doorway.
 */
function maskHeightsAt(
  field: CaveHeightfieldRepresentation,
  walkSurfaceAt: (x: number, z: number) => number,
  x: number,
  z: number,
): { top: number, bot: number } {
  const surface = walkSurfaceAt(x, z)
  const top = surface - MASK_SINK
  const sample = sampleHeightfieldAt(field, x, z)
  if (sample.gap <= 0 || sample.outsideGrid) {
    return { top, bot: top - MASK_DEPTH }
  }
  const ceiling = sample.ceilY + MASK_CEILING_CLEAR
  const bot = Math.max(top - MASK_DEPTH, ceiling)
  if (bot >= top) {
    const flake = surface - 0.03
    return { top: flake, bot: Math.min(flake - 0.02, Math.max(ceiling, flake - 0.04)) }
  }
  return { top, bot }
}

function emitMaskQuad(indices: number[], a: number, b: number, c: number, d: number): void {
  indices.push(a, b, c, a, c, d)
}

function marchRimDistance(
  mouthOpening: (x: number, z: number) => number,
  ox: number,
  oz: number,
  dx: number,
  dz: number,
): number {
  for (let d = MASK_MARCH_STEP; d <= MASK_MARCH_MAX; d += MASK_MARCH_STEP) {
    if (mouthOpening(ox + dx * d, oz + dz * d) <= 0) return d
  }
  return 0
}

/**
 * Large underground box in the mouth frame (`out` = opening axis, `right`
 * = lateral). Vertices are pushed onto the same buffers as the rim beam.
 */
function emitOrientedBox(
  positions: number[],
  indices: number[],
  cx: number,
  cy: number,
  cz: number,
  halfAlong: number,
  halfAcross: number,
  halfY: number,
  out: { dx: number, dz: number },
  right: { dx: number, dz: number },
): void {
  const base = positions.length / 3
  const along = [-halfAlong, halfAlong]
  const across = [-halfAcross, halfAcross]
  const ys = [cy - halfY, cy + halfY]
  for (const y of ys) {
    for (const a of along) {
      for (const c of across) {
        positions.push(
          cx + out.dx * a + right.dx * c,
          y,
          cz + out.dz * a + right.dz * c,
        )
      }
    }
  }
  // 0: -a -c bottom · 1: -a +c bottom · 2: +a -c bottom · 3: +a +c bottom
  // 4–7: the same on top.
  emitMaskQuad(indices, base + 0, base + 2, base + 3, base + 1)
  emitMaskQuad(indices, base + 4, base + 5, base + 7, base + 6)
  emitMaskQuad(indices, base + 0, base + 1, base + 5, base + 4)
  emitMaskQuad(indices, base + 2, base + 6, base + 7, base + 3)
  emitMaskQuad(indices, base + 0, base + 4, base + 6, base + 2)
  emitMaskQuad(indices, base + 1, base + 3, base + 7, base + 5)
}

type DeepPatch = {
  along: number
  across: number
  halfAlong: number
  halfAcross: number
  height: number
  sink: number
}

/**
 * Extra catcher patches: larger, further from the doorway, and deeper in
 * solid ground. The rim beam still covers the millimetre seam; these catch
 * wider grazing views under the approach and out to the sides without
 * occupying the opening.
 */
function emitDeepMouthPatches(
  positions: number[],
  indices: number[],
  field: CaveHeightfieldRepresentation,
  mouthOpening: (x: number, z: number) => number,
  walkSurfaceAt: (x: number, z: number) => number,
): void {
  const out = openingDirection(field.entrance.yaw)
  const right = { dx: out.dz, dz: -out.dx }
  const c = mouthOpeningCentroid(field, mouthOpening)
  const front = marchRimDistance(mouthOpening, c.x, c.z, out.dx, out.dz)
  const left = marchRimDistance(mouthOpening, c.x, c.z, -right.dx, -right.dz)
  const rightRim = marchRimDistance(mouthOpening, c.x, c.z, right.dx, right.dz)

  const patches: DeepPatch[] = []
  if (front > 0) {
    patches.push(
      { along: front + 2.1, across: 0, halfAlong: 1.6, halfAcross: 2.9, height: 2.2, sink: 1.1 },
      { along: front + 4.4, across: 0, halfAlong: 1.9, halfAcross: 3.5, height: 2.8, sink: 2.0 },
    )
  }
  if (left > 0) {
    patches.push(
      { along: 0.5, across: -(left + 2.2), halfAlong: 2.2, halfAcross: 1.5, height: 2.8, sink: 1.3 },
      { along: 0.3, across: -(left + 4.0), halfAlong: 2.5, halfAcross: 1.7, height: 3.2, sink: 1.9 },
    )
  }
  if (rightRim > 0) {
    patches.push(
      { along: 0.5, across: rightRim + 2.2, halfAlong: 2.2, halfAcross: 1.5, height: 2.8, sink: 1.3 },
      { along: 0.3, across: rightRim + 4.0, halfAlong: 2.5, halfAcross: 1.7, height: 3.2, sink: 1.9 },
    )
  }

  for (const patch of patches) {
    const away = patch.across === 0
      ? { along: 1, across: 0 }
      : { along: 0, across: patch.across > 0 ? 1 : -1 }
    for (const extra of [0, 1.3, 2.6]) {
      const along = patch.along + away.along * extra
      const across = patch.across + away.across * extra
      const cx = c.x + out.dx * along + right.dx * across
      const cz = c.z + out.dz * along + right.dz * across
      let minSurf = Infinity
      let blocked = false
      for (const a of [-patch.halfAlong, 0, patch.halfAlong]) {
        for (const s of [-patch.halfAcross, 0, patch.halfAcross]) {
          const x = cx + out.dx * a + right.dx * s
          const z = cz + out.dz * a + right.dz * s
          minSurf = Math.min(minSurf, walkSurfaceAt(x, z))
          if (mouthOpening(x, z) > 0) { blocked = true; break }
          const sample = sampleHeightfieldAt(field, x, z)
          if (sample.gap > 0 && !sample.outsideGrid) { blocked = true; break }
        }
        if (blocked) break
      }
      if (blocked || !Number.isFinite(minSurf)) continue
      const top = minSurf - patch.sink
      emitOrientedBox(
        positions,
        indices,
        cx,
        top - patch.height * 0.5,
        cz,
        patch.halfAlong,
        patch.halfAcross,
        patch.height * 0.5,
        out,
        right,
      )
      break
    }
  }
}

/** Extent toward the cave interior (`out` negative). Left at the original
 *  symmetric extent — widening this side risks landing inside a real passage
 *  void column and tripping the ceiling-clearance invariant below. */
const UNDER_ENTRANCE_HALF_IN = 2
/** Extent toward the approach/outside (`out` positive). Wider than the old
 *  symmetric 2 m to close the small front-transition gap — purely outdoor
 *  terrain here, so only the walk-surface invariant applies. */
const UNDER_ENTRANCE_HALF_OUT = 3.25
/** Extent left/right of the entrance (`right`). Wider than the old symmetric
 *  5 m to close the left/right gaps — same reasoning as HALF_OUT. */
const UNDER_ENTRANCE_HALF_ACROSS = 7
const UNDER_ENTRANCE_DROP = 2
/** Minimum clearance kept below each corner's own local walk surface,
 *  independent of UNDER_ENTRANCE_DROP. Lets the wider footprint's corners
 *  clamp downward on sloped terrain so they never approach the walk surface,
 *  which keeps them clear of both mask invariants (`walk-0.01`, `walk-0.35`)
 *  regardless of terrain under the newly-widened area. */
const UNDER_ENTRANCE_MIN_SINK = 0.4

/**
 * Flat catcher exactly under the mouth floor. Winding is CCW from above so
 * the coloured face points +Y — looking down through a floor/lip gap hits
 * dark rock instead of sky. Asymmetric: wider toward the approach and sides
 * (ordinary outdoor terrain) than toward the cave interior (real passage
 * void), see constant comments above.
 */
function emitUnderEntrancePlane(
  positions: number[],
  indices: number[],
  field: CaveHeightfieldRepresentation,
  walkSurfaceAt: (x: number, z: number) => number,
): void {
  const out = openingDirection(field.entrance.yaw)
  const right = { dx: out.dz, dz: -out.dx }
  const baseY = field.entrance.y - UNDER_ENTRANCE_DROP
  const base = positions.length / 3
  // `[along, across]`. CCW from above: verified +Y against
  // `computeVertexNormals()` in the cave floor mesher (`CELL_RING` / `emitFan`).
  const ring: readonly (readonly [number, number])[] = [
    [-UNDER_ENTRANCE_HALF_IN, -UNDER_ENTRANCE_HALF_ACROSS],
    [UNDER_ENTRANCE_HALF_OUT, -UNDER_ENTRANCE_HALF_ACROSS],
    [UNDER_ENTRANCE_HALF_OUT, UNDER_ENTRANCE_HALF_ACROSS],
    [-UNDER_ENTRANCE_HALF_IN, UNDER_ENTRANCE_HALF_ACROSS],
  ]
  for (const [along, across] of ring) {
    const x = field.entrance.x + out.dx * along + right.dx * across
    const z = field.entrance.z + out.dz * along + right.dz * across
    const y = Math.min(baseY, walkSurfaceAt(x, z) - UNDER_ENTRANCE_MIN_SINK)
    positions.push(x, y, z)
  }
  emitMaskQuad(indices, base + 0, base + 1, base + 2, base + 3)
}

/**
 * CPU buffers for the presentation-only mouth underside mask. A closed
 * rectangular beam around the opening contour, plus larger underground
 * patches in front of and beside the doorway, and a flat catcher under the
 * mouth floor. Empty when the field has no surface-breaking mouth
 * (SDF comparison path).
 *
 * @domain world-terrain
 */
export function buildMouthUndersideMaskBuffers(
  field: CaveHeightfieldRepresentation,
  mouthOpening: (x: number, z: number) => number,
  walkSurfaceAt: (x: number, z: number) => number,
): MouthUndersideMaskBuffers {
  const rim = sampleMouthRim(field, mouthOpening)
  if (rim.length < 3) return emptyMouthMask()

  const positions: number[] = []
  const indices: number[] = []
  for (const p of rim) {
    const ix = p.x + p.ox * MASK_INNER
    const iz = p.z + p.oz * MASK_INNER
    const ox = p.x + p.ox * MASK_OUTER
    const oz = p.z + p.oz * MASK_OUTER
    const inner = maskHeightsAt(field, walkSurfaceAt, ix, iz)
    const outer = maskHeightsAt(field, walkSurfaceAt, ox, oz)
    positions.push(ix, inner.top, iz)
    positions.push(ox, outer.top, oz)
    positions.push(ox, outer.bot, oz)
    positions.push(ix, inner.bot, iz)
  }

  const n = rim.length
  for (let i = 0; i < n; i++) {
    const p = rim[i]!
    const q = rim[(i + 1) % n]!
    // A missed march leaves a large jump; do not bridge it — that span
    // would cut across the doorway.
    if (Math.hypot(p.x - q.x, p.z - q.z) > 1.8) continue
    const a = i * 4
    const b = ((i + 1) % n) * 4
    emitMaskQuad(indices, a + 0, a + 1, b + 1, b + 0)
    emitMaskQuad(indices, a + 1, a + 2, b + 2, b + 1)
    emitMaskQuad(indices, a + 2, a + 3, b + 3, b + 2)
    emitMaskQuad(indices, a + 3, a + 0, b + 0, b + 3)
  }

  emitDeepMouthPatches(positions, indices, field, mouthOpening, walkSurfaceAt)
  emitUnderEntrancePlane(positions, indices, field, walkSurfaceAt)

  const pos = new Float32Array(positions)
  const idx = new Uint32Array(indices)
  return {
    positions: pos,
    indices: idx,
    vertices: pos.length / 3,
    triangles: idx.length / 3,
  }
}
