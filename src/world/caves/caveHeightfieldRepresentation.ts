/** Production cave heightfield representation — 2.5D spatial data owned by
 *  `src/world/caves/`. Extracted from the accepted world-terrain-018 spike.
 *
 *  Two 2D fields on one grid and nothing else:
 *
 *  ```text
 *  floorY(x, z)
 *  ceilingY(x, z)
 *      ↓
 *  gap = ceilingY - floorY      > 0  =>  cave void
 *                               = 0  =>  rim / wall contour
 *                               < 0  =>  outside / solid
 *  ```
 *
 *  There is no stored `inside` mask and no boundary-wall geometry: the cave
 *  boundary is where the floor and the ceiling converge (`gap -> 0`), so the
 *  walls are produced by the two heightfields themselves. See
 *  `docs/design/caves/06-heightfield-cave-representation-design.md`.
 *
 *  Pure data/math: no Three.js, scene, player, camera, ChunkManager object,
 *  renderer or DOM. Production presentation/gameplay still use SDF until
 *  later world-terrain-019 milestones.
 *
 * @domain world-terrain
 */

import type { CaveEntrance } from '../caveVolume'
import type {
  CaveTopology,
  CaveTopologyFeature,
  CaveTopologyPoint,
  CaveTopologySegment,
} from './caveTopology'
import { smax, smin } from './caveMath'
import { openingDirection } from './caveOrientation'
import { CAVE_RNG_SALT, createCaveRandom } from './caveRng'
import { SURFACE_CLIP_EPS } from './caveSurface'
import { undergroundPoolFloorDepression, type UndergroundPoolFootprintIntent } from './caveUndergroundPoolFootprint'
import { mouthAlong } from './mouthCarve'
import { createValueNoise2D } from './spikeNoise'

// ── Cross-section shape ─────────────────────────────────────────────────────

/** Height of the waist (where floor meets ceiling) as a fraction of the axis
 *  clearance `H`. Below mid-height: real passages have a wider floor bowl and
 *  a taller dome. */
export const BETA = 0.3
/** Floor closure exponent. Higher = flatter core, steeper rim. */
export const NF = 2.5
/** Ceiling closure exponent. Deliberately != `NF` so the ceiling is not a
 *  mirror of the floor even before noise. */
export const NC = 2
/** Metres the floor rises / ceiling falls per metre outside the rim. Keeps
 *  the soft union from bridging two influences that are laterally close but
 *  vertically far apart. */
export const KAPPA = 3
/** Polynomial smooth-union blend (metres of Y) between influences. */
export const SMOOTH_K = 0.7
/** Rim band width as a multiple of the wall rise `BETA * H`. 1 / this is the
 *  average wall gradient across the band. */
export const RIM_ASPECT = 0.9
export const RIM_BAND_MIN = 0.35
/** Capped at `PROXY_MARGIN` so the rounded fringe stays inside the footprint
 *  radius `productionTopology` already checks overburden against. */
export const RIM_BAND_MAX = 0.9
/** Rim coordinate at which the walkable-core clearance guard starts fading. */
export const U_CORE = 0.25
/** Rim coordinate at which the clearance guard is fully off, so floor and
 *  ceiling are free to converge. */
export const U_FADE = 0.75
/** Smallest half-width macro noise may leave. */
export const R_MIN = 0.6
/** Metres past its own rim an influence keeps being evaluated. Beyond this
 *  every influence has driven `gap` to `FAR_GAP`, so the far-field constant
 *  below joins the diverging extension continuously instead of stepping. */
export const OUTSIDE_REACH = 2
/** `gap` in rock no influence reaches, and the floor the diverging extension
 *  is clamped to. One plateau value means `gap` is non-increasing outward
 *  everywhere, which is what `resolveHeightfieldHorizontal` walks. */
export const FAR_GAP = -2 * KAPPA * OUTSIDE_REACH

/** Extra clearance above the walk surface the mouth aperture must reach, so
 *  the entrance actually breaks the surface instead of nearly touching it. */
export const APERTURE_LIFT = 0.35
/** Metres the entrance influence reaches outward past the mouth plane. */
export const ENTRANCE_OUTWARD = 0.8
/** Metres the entrance influence reaches inward from the mouth plane. */
export const ENTRANCE_INWARD = 0.9

/** Soft-union radius used when the walk surface is offered as a floor
 *  candidate at the mouth. */
const SURFACE_BLEND_K = 0.5
/** How hard an irrelevant surface candidate is pushed away per metre of rock
 *  between the cave ceiling and the surface. */
const SURFACE_BLEND_PUSH = 3

/** Fraction of a shelf/overhang footprint that stays at full strength before
 *  the edge ramp starts. */
const FEATURE_FLAT = 0.5

export type NoiseOctave2D = { cellSize: number, amplitude: number }

export type CaveHeightfieldConfig = {
  cellSize: number
  centerlineSpacing: number
  floorDetail: NoiseOctave2D
  ceilingDetail: NoiseOctave2D
  /** Low-frequency lateral variation of the half-width. */
  macro: NoiseOctave2D
}

export const DEFAULT_HEIGHTFIELD_CONFIG: CaveHeightfieldConfig = {
  /** 0.3 m, not the spike's original 0.4 m. The rim band that carries the
   *  whole floor -> wall -> ceiling transition is only 0.35-0.9 m wide, so at
   *  0.4 m it was resolved by ~2 cells; 0.3 m gives ~3. It also halves how far
   *  the field's cached `surfaceY` drifts from the real terrain over the steep
   *  pit wall at the mouth (measured 0.40 m -> 0.19 m), which is the residual
   *  seam there. Cost is ~1.8x the grid and still well under the SDF path. */
  cellSize: 0.3,
  centerlineSpacing: 0.5,
  floorDetail: { cellSize: 1.4, amplitude: 0.12 },
  ceilingDetail: { cellSize: 2.1, amplitude: 0.3 },
  macro: { cellSize: 3, amplitude: 0.45 },
}

export type CaveHeightfieldBounds = {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/**
 * Canonical grid for the production cave heightfield.
 *
 * Samples live on grid **nodes** (corners), indexed row-major
 * `iz * nx + ix`, so a later mesher can share vertices between neighbouring
 * cells. `floorY` and `ceilY` are the only authoritative fields;
 * `surfaceY` and `coreT` are cached derived values (a pure function of the
 * node position and of the build, respectively) kept so presentation, terrain
 * cutout and metrics all agree exactly.
 *
 * @domain world-terrain
 */
export type CaveHeightfieldRepresentation = {
  bounds: CaveHeightfieldBounds
  originX: number
  originZ: number
  cellSize: number
  /** Node counts, not cell counts. */
  nx: number
  nz: number
  floorY: Float32Array
  ceilY: Float32Array
  /** Walk surface (analytic base minus the production mouth recess). */
  surfaceY: Float32Array
  /** Smallest rim coordinate across influences: 0 in the walkable core,
   *  1 at the rim. Cached for the clearance guard, metrics and tests. */
  coreT: Float32Array
  minClearance: number
  entrance: CaveEntrance
  caveId: string
  seed: number
}

export type HeightfieldStation = {
  x: number
  y: number
  z: number
  /** Declared *usable* half-width. The rounded rim is added outside it. */
  coreRadius: number
  height: number
}

export type HeightfieldSample = {
  floorY: number
  ceilY: number
  /** `ceilY - floorY`. Positive inside cave void, negative in rock. */
  gap: number
  surfaceY: number
  coreT: number
  /** The cave void reaches the walk surface here — mouth / portal. */
  openSky: boolean
  /** Beyond the cave-local grid: no cave here and `surfaceY` is a clamped
   *  border value, not this point's ground. */
  outsideGrid: boolean
}

export type CaveHeightfieldBuildResult = {
  heightfield: CaveHeightfieldRepresentation
  representationMs: number
  /** Nodes carrying cave void (`gap > 0`). */
  caveNodeCount: number
}

export type SurfaceSampler = (x: number, z: number) => number

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function smoothstep01(edge0: number, edge1: number, x: number): number {
  if (edge1 <= edge0) return x >= edge1 ? 1 : 0
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * Complementary superellipse. `0` at the axis with a zero tangent (a
 * genuinely flat core) and `1` at the rim with a vertical tangent (a
 * genuinely vertical wall where floor and ceiling meet).
 *
 * @domain world-terrain
 */
export function closure(u: number, n: number): number {
  if (u <= 0) return 0
  if (u >= 1) return 1
  return 1 - Math.pow(1 - Math.pow(u, n), 1 / n)
}

/** Rim band width for a station of clearance `height`. */
export function rimBand(height: number): number {
  return Math.max(RIM_BAND_MIN, Math.min(RIM_BAND_MAX, RIM_ASPECT * BETA * height))
}

// ── Influences ──────────────────────────────────────────────────────────────

/** One whole centerline run. Deliberately **not** one influence per station
 *  pair: the union is a soft min/max, and `smin(a, a, k) = a - k/4`, so
 *  folding ~18 overlapping capsules per segment silently inflated the cave
 *  (measured `gap = 3.55 m` at a mouth whose topology declares 2.6 m). A
 *  segment is one continuous tube and contributes one cross-section. */
type SegmentInfluence = {
  kind: 'run'
  stations: readonly HeightfieldStation[]
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/** One deterministic chamber lobe: an ellipse in XZ with its own floor
 *  offset and clearance. */
type LobeInfluence = {
  kind: 'lobe'
  cx: number
  cz: number
  cy: number
  /** Semi-axes of the *usable* ellipse; the rim band is added outside. */
  ax: number
  az: number
  cos: number
  sin: number
  height: number
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

type Influence = SegmentInfluence | LobeInfluence

/** Local cross-section state of one influence at one point. */
type CrossSection = { f: number, c: number, t: number, q: number }

/**
 * Resamples a topology segment centerline at fixed arc length so footprint
 * density does not follow raw control-point density.
 *
 * @domain world-terrain
 */
export function resampleSegmentStations(
  topology: CaveTopology,
  seg: CaveTopologySegment,
  spacing: number,
): HeightfieldStation[] {
  const nodeById = new Map(topology.nodes.map((n) => [n.id, n]))
  const fromNode = nodeById.get(seg.from)
  const toNode = nodeById.get(seg.to)
  if (!fromNode || !toNode) throw new Error(`caveHeightfieldRepresentation: unknown node in segment ${seg.id}`)
  const pts = seg.centerline
  if (pts.length < 2) return []

  const lengths: number[] = [0]
  let total = 0
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    total += Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    lengths.push(total)
  }
  if (total <= 1e-9) {
    return [{
      x: pts[0]!.x,
      y: pts[0]!.y,
      z: pts[0]!.z,
      coreRadius: fromNode.targetWidth / 2,
      height: fromNode.targetHeight,
    }]
  }

  const atArc = (s: number): HeightfieldStation => {
    const clamped = Math.max(0, Math.min(total, s))
    let i = 0
    while (i < pts.length - 2 && lengths[i + 1]! < clamped) i++
    const a = pts[i]!
    const b = pts[i + 1]!
    const span = lengths[i + 1]! - lengths[i]!
    const localT = span > 1e-9 ? (clamped - lengths[i]!) / span : 0
    const shapeT = clamped / total
    return {
      x: a.x + (b.x - a.x) * localT,
      y: a.y + (b.y - a.y) * localT,
      z: a.z + (b.z - a.z) * localT,
      coreRadius: (fromNode.targetWidth + (toNode.targetWidth - fromNode.targetWidth) * shapeT) / 2,
      height: fromNode.targetHeight + (toNode.targetHeight - fromNode.targetHeight) * shapeT,
    }
  }

  const out: HeightfieldStation[] = [atArc(0)]
  const steps = Math.max(1, Math.round(total / spacing))
  for (let i = 1; i <= steps; i++) out.push(atArc((i / steps) * total))
  return out
}

function runInfluence(stations: readonly HeightfieldStation[]): SegmentInfluence | null {
  if (stations.length === 0) return null
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  for (const st of stations) {
    const reach = st.coreRadius + rimBand(st.height) + OUTSIDE_REACH
    minX = Math.min(minX, st.x - reach)
    maxX = Math.max(maxX, st.x + reach)
    minZ = Math.min(minZ, st.z - reach)
    maxZ = Math.max(maxZ, st.z + reach)
  }
  return { kind: 'run', stations, minX, maxX, minZ, maxZ }
}

/**
 * Entrance influence derived from `topology.entrance` — a short capsule
 * straddling the mouth plane, sized so the aperture ceiling clears the walk
 * surface by `APERTURE_LIFT`. This is what makes the mouth a real opening
 * (`openSky`) instead of a passage that stops just under the hillside; it is
 * the heightfield counterpart of `applyMouthGeometryToField`.
 *
 * @domain world-terrain
 */
export function buildEntranceInfluence(
  entrance: CaveEntrance,
  walkSurfaceAt: SurfaceSampler,
): SegmentInfluence {
  const out = openingDirection(entrance.yaw)
  const outer = {
    x: entrance.x + out.dx * ENTRANCE_OUTWARD,
    z: entrance.z + out.dz * ENTRANCE_OUTWARD,
  }
  const inner = {
    x: entrance.x - out.dx * ENTRANCE_INWARD,
    z: entrance.z - out.dz * ENTRANCE_INWARD,
  }
  const radius = entrance.width / 2
  const liftedHeight = (x: number, z: number): number =>
    Math.max(entrance.height, walkSurfaceAt(x, z) + APERTURE_LIFT - entrance.y)
  const a: HeightfieldStation = {
    x: outer.x,
    y: entrance.y,
    z: outer.z,
    coreRadius: radius,
    height: liftedHeight(outer.x, outer.z),
  }
  const b: HeightfieldStation = {
    x: inner.x,
    y: entrance.y,
    z: inner.z,
    coreRadius: radius,
    height: liftedHeight(inner.x, inner.z),
  }
  return runInfluence([a, b])!
}

/**
 * Deterministic chamber lobes. A chamber is the smooth union of 3–5
 * overlapping ellipses rather than one disc, which changes the *silhouette*
 * (bays, pinches, an asymmetric long axis) instead of merely wobbling a
 * circle's boundary.
 *
 * @domain world-terrain
 */
export function buildChamberLobes(topology: CaveTopology): LobeInfluence[] {
  const rng = createCaveRandom(topology.caveId, CAVE_RNG_SALT.lobes)
  const lobes: LobeInfluence[] = []
  for (const node of topology.nodes) {
    if (node.kind !== 'chamber' && node.kind !== 'widening') continue
    const rc = node.targetWidth / 2
    const count = 3 + Math.floor(rng() * 3)
    for (let j = 0; j < count; j++) {
      const theta = (j / count) * Math.PI * 2 + (rng() - 0.5) * 0.9
      const off = (0.15 + rng() * 0.3) * rc
      // Semi-axes stay <= rc so the union's reach matches the node's declared
      // width plus the rim band, which is what `minSurfaceOverFootprint`
      // (width / 2 + PROXY_MARGIN) was checked against.
      const ax = (0.5 + rng() * 0.3) * rc
      const az = (0.5 + rng() * 0.3) * rc
      const phi = rng() * Math.PI
      const dy = (rng() - 0.5) * 0.8
      const hf = 0.82 + rng() * 0.18
      const cx = node.position.x + Math.cos(theta) * off
      const cz = node.position.z + Math.sin(theta) * off
      // A lobe may sit lower or be shorter than the node, never taller: the
      // fixture/topology layer sized the overburden clamp
      // (`anchoredFloorY` -> `minSurfaceOverFootprint`) against exactly
      // `targetHeight`, so a lobe reaching above it would eat rock that was
      // never budgeted and could break through thin overburden.
      const height = (node.targetHeight - Math.max(0, dy)) * hf
      const reach = Math.max(ax, az) + rimBand(height) + OUTSIDE_REACH
      lobes.push({
        kind: 'lobe',
        cx,
        cz,
        cy: node.position.y + dy,
        ax,
        az,
        cos: Math.cos(phi),
        sin: Math.sin(phi),
        height,
        minX: cx - reach,
        maxX: cx + reach,
        minZ: cz - reach,
        maxZ: cz + reach,
      })
    }
  }
  return lobes
}

function distPointToSegmentXZ(
  x: number,
  z: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { dist: number, t: number } {
  const abx = bx - ax
  const abz = bz - az
  const lenSq = abx * abx + abz * abz
  if (lenSq <= 1e-12) return { dist: Math.hypot(x - ax, z - az), t: 0 }
  const t = Math.max(0, Math.min(1, ((x - ax) * abx + (z - az) * abz) / lenSq))
  return { dist: Math.hypot(x - (ax + abx * t), z - (az + abz * t)), t }
}

/**
 * Cross-section of one influence at lateral distance `d`.
 *
 * ```text
 *            ceiling apex A+H
 *                 ___----___
 *             _--´          `--_       ceiling uses q = d / rimRadius
 *           /                    \
 *   waist  |                      |    Yc = A + BETA*H   <- floor meets ceiling
 *           \_                  _/
 *             `-__          __-´       floor uses t = (d - coreRadius) / band
 *   floor axis A  `--------´           flat across the declared usable width
 * ```
 *
 * Splitting the two coordinates is what keeps the rounding from eating the
 * declared passage width: the floor is flat out to `coreRadius` and only
 * curves inside the rim band, while the ceiling domes across the whole
 * section. Both reach `1` at the same `rimRadius`, so they always converge.
 *
 * @domain world-terrain
 */
export function crossSectionAt(
  d: number,
  coreRadius: number,
  axisY: number,
  height: number,
): CrossSection {
  const band = rimBand(height)
  const rim = coreRadius + band
  const waist = axisY + BETA * height
  if (d >= rim) {
    // Clamped to the far-field plateau: a capsule's bounding box can reach
    // further than `OUTSIDE_REACH` past the *local* rim (its box is sized by
    // the widest station), and without the clamp `gap` would dip below
    // `FAR_GAP` there and then rise again at the box edge.
    const outside = Math.min(KAPPA * (d - rim), KAPPA * OUTSIDE_REACH)
    return { f: waist + outside, c: waist - outside, t: 1, q: 1 }
  }
  const t = Math.max(0, (d - coreRadius) / band)
  const q = d / rim
  return {
    f: axisY + BETA * height * closure(t, NF),
    c: axisY + height - (1 - BETA) * height * closure(q, NC),
    t,
    q,
  }
}

function influenceCrossSection(
  inf: Influence,
  x: number,
  z: number,
  macroOffset: number,
): CrossSection | null {
  if (x < inf.minX || x > inf.maxX || z < inf.minZ || z > inf.maxZ) return null
  if (inf.kind === 'run') {
    const st = inf.stations
    if (st.length === 1) {
      const only = st[0]!
      const radius = Math.max(R_MIN, Math.max(0.7 * only.coreRadius, only.coreRadius + macroOffset))
      return crossSectionAt(Math.hypot(x - only.x, z - only.z), radius, only.y, only.height)
    }
    // Nearest point over the whole polyline, then interpolate the profile
    // there — one continuous influence, no per-span union.
    let bestDist = Infinity
    let bestI = 0
    let bestT = 0
    for (let i = 0; i + 1 < st.length; i++) {
      const a = st[i]!
      const b = st[i + 1]!
      const hit = distPointToSegmentXZ(x, z, a.x, a.z, b.x, b.z)
      if (hit.dist < bestDist) {
        bestDist = hit.dist
        bestI = i
        bestT = hit.t
      }
    }
    const a = st[bestI]!
    const b = st[bestI + 1]!
    const coreRadius = a.coreRadius + (b.coreRadius - a.coreRadius) * bestT
    const axisY = a.y + (b.y - a.y) * bestT
    const height = a.height + (b.height - a.height) * bestT
    const radius = Math.max(R_MIN, Math.max(0.7 * coreRadius, coreRadius + macroOffset))
    return crossSectionAt(bestDist, radius, axisY, height)
  }
  const px = x - inf.cx
  const pz = z - inf.cz
  const lx = px * inf.cos + pz * inf.sin
  const lz = -px * inf.sin + pz * inf.cos
  const rEff = Math.min(inf.ax, inf.az)
  const uNorm = Math.hypot(lx / inf.ax, lz / inf.az)
  // Metric lateral distance for an ellipse, same normalise-then-rescale
  // convention `ellipsoidSDF` uses in the production SDF field.
  const coreRadius = Math.max(R_MIN, Math.max(0.7 * rEff, rEff + macroOffset))
  return crossSectionAt(uNorm * rEff, coreRadius, inf.cy, inf.height)
}

// ── Features ────────────────────────────────────────────────────────────────

type FeatureFootprint = {
  kind: CaveTopologyFeature['kind']
  cx: number
  cz: number
  ax: number
  az: number
  /** Shelf: the ledge's top face. Overhang: metres of ceiling dip. */
  amount: number
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

function featureFootprints(features: readonly CaveTopologyFeature[]): FeatureFootprint[] {
  return features.map((f) => {
    const ax = f.size.width / 2
    const az = f.size.depth / 2
    return {
      kind: f.kind,
      cx: f.position.x,
      cz: f.position.z,
      ax,
      az,
      amount: f.kind === 'shelf' ? f.position.y + f.size.height / 2 : f.size.height,
      minX: f.position.x - ax,
      maxX: f.position.x + ax,
      minZ: f.position.z - az,
      maxZ: f.position.z + az,
    }
  })
}

/** 1 at the centre, 0 at the footprint rim, C¹ at both ends and with a
 *  bounded edge gradient so a ledge stays climbable rather than becoming a
 *  single-cell cliff. */
function featureLift(f: FeatureFootprint, x: number, z: number): number {
  if (x < f.minX || x > f.maxX || z < f.minZ || z > f.maxZ) return 0
  const r = Math.hypot((x - f.cx) / f.ax, (z - f.cz) / f.az)
  if (r >= 1) return 0
  return 1 - smoothstep01(FEATURE_FLAT, 1, r)
}

// ── Build ───────────────────────────────────────────────────────────────────

function hashCaveId(caveId: string): number {
  let h = 0x811c9dc5 >>> 0
  for (let i = 0; i < caveId.length; i++) h = Math.imul(h ^ caveId.charCodeAt(i), 0x01000193) >>> 0
  return h >>> 0
}

function topologyBounds(topology: CaveTopology, margin: number): CaveHeightfieldBounds {
  let minX = Infinity
  let maxX = -Infinity
  let minZ = Infinity
  let maxZ = -Infinity
  const expand = (p: CaveTopologyPoint, r: number): void => {
    minX = Math.min(minX, p.x - r)
    maxX = Math.max(maxX, p.x + r)
    minZ = Math.min(minZ, p.z - r)
    maxZ = Math.max(maxZ, p.z + r)
  }
  for (const n of topology.nodes) {
    expand(n.position, Math.max(n.targetWidth, 2) / 2 + rimBand(n.targetHeight) + margin)
  }
  for (const seg of topology.segments) for (const p of seg.centerline) expand(p, 2 + margin)
  const out = openingDirection(topology.entrance.yaw)
  expand(
    {
      x: topology.entrance.x + out.dx * ENTRANCE_OUTWARD,
      y: topology.entrance.y,
      z: topology.entrance.z + out.dz * ENTRANCE_OUTWARD,
    },
    topology.entrance.width / 2 + RIM_BAND_MAX + margin,
  )
  return { minX, maxX, minZ, maxZ }
}

/**
 * Grid the heightfield build would allocate for `topology` — the same origin
 * / `nx` / `nz` arithmetic `buildCaveHeightfieldRepresentation()` runs, hoisted
 * so a topology recipe can price its own rectangular XZ footprint *before*
 * anything is allocated (plan world-terrain-020's adventure cell budget)
 * without duplicating the bounds/margin rule or touching the global config.
 *
 * @domain world-terrain
 */
export function estimateHeightfieldGrid(
  topology: CaveTopology,
  config: CaveHeightfieldConfig = DEFAULT_HEIGHTFIELD_CONFIG,
): { originX: number, originZ: number, nx: number, nz: number, cells: number } {
  const margin = Math.max(1.5, config.cellSize * 3)
  const raw = topologyBounds(topology, margin)
  const originX = Math.floor(raw.minX / config.cellSize) * config.cellSize
  const originZ = Math.floor(raw.minZ / config.cellSize) * config.cellSize
  const nx = Math.max(2, Math.ceil((raw.maxX - originX) / config.cellSize) + 1)
  const nz = Math.max(2, Math.ceil((raw.maxZ - originZ) / config.cellSize) + 1)
  return { originX, originZ, nx, nz, cells: nx * nz }
}

/**
 * Builds the production heightfield from `topology`. Deterministic for the
 * same `(topology, config)`; Three.js-free.
 *
 * `walkSurfaceAt` is the rendered/walkable ground (analytic base minus the
 * production mouth recess). It is used for two things only: sizing the mouth
 * aperture, and offering the surface as a floor candidate near the mouth so
 * the cave floor and the terrain are one continuous surface there. Deep
 * inside, the surface candidate is pushed out of range and the floor follows
 * the topology centerline alone — the hillside overhead never leaks into the
 * cave floor.
 *
 * @domain world-terrain
 */
export function buildCaveHeightfieldRepresentation(
  topology: CaveTopology,
  walkSurfaceAt: SurfaceSampler,
  config: CaveHeightfieldConfig = DEFAULT_HEIGHTFIELD_CONFIG,
  poolIntent?: UndergroundPoolFootprintIntent | null,
): CaveHeightfieldBuildResult {
  const t0 = now()
  const seed = hashCaveId(topology.caveId) ^ (topology.seed >>> 0)
  const { originX, originZ, nx, nz } = estimateHeightfieldGrid(topology, config)

  const influences: Influence[] = [buildEntranceInfluence(topology.entrance, walkSurfaceAt)]
  for (const seg of topology.segments) {
    const run = runInfluence(resampleSegmentStations(topology, seg, config.centerlineSpacing))
    if (run) influences.push(run)
  }
  for (const lobe of buildChamberLobes(topology)) influences.push(lobe)
  const features = featureFootprints(topology.features)

  const macroNoise = createValueNoise2D(seed ^ CAVE_RNG_SALT.macro, config.macro.cellSize)
  const floorNoise = createValueNoise2D(seed ^ CAVE_RNG_SALT.floorDetail, config.floorDetail.cellSize)
  const ceilNoise = createValueNoise2D(seed ^ CAVE_RNG_SALT.ceilDetail, config.ceilingDetail.cellSize)

  const count = nx * nz
  const floorY = new Float32Array(count)
  const ceilY = new Float32Array(count)
  const surfaceY = new Float32Array(count)
  const coreT = new Float32Array(count)
  let caveNodeCount = 0

  for (let iz = 0; iz < nz; iz++) {
    const z = originZ + iz * config.cellSize
    for (let ix = 0; ix < nx; ix++) {
      const x = originX + ix * config.cellSize
      const i = iz * nx + ix
      const surf = walkSurfaceAt(x, z)
      surfaceY[i] = surf

      // Macro variation tapers to zero across the mouth so the aperture
      // stays a clean, predictable opening.
      const mouthTaper = smoothstep01(-1.5, -0.2, -mouthAlong(x, z, topology.entrance))
      const macroOffset = macroNoise(x, z) * config.macro.amplitude * mouthTaper

      // Union: keep the two dominant operands and blend only those. A running
      // fold would bias by up to k/4 per step (`smin(a, a, k) = a - k/4`), so
      // N overlapping influences in a chamber would quietly deepen the floor
      // and raise the ceiling by N*k/4. This rounds the one junction that
      // matters and is bias-bounded at k/4 regardless of N.
      let f1 = Infinity
      let f2 = Infinity
      let c1 = -Infinity
      let c2 = -Infinity
      let tMin = 1
      let qMin = 1
      for (const inf of influences) {
        const cs = influenceCrossSection(inf, x, z, macroOffset)
        if (!cs) continue
        if (cs.f < f1) { f2 = f1; f1 = cs.f } else if (cs.f < f2) { f2 = cs.f }
        if (cs.c > c1) { c2 = c1; c1 = cs.c } else if (cs.c > c2) { c2 = cs.c }
        if (cs.t < tMin) tMin = cs.t
        if (cs.q < qMin) qMin = cs.q
      }
      let f = f2 === Infinity ? f1 : smin(f1, f2, SMOOTH_K)
      let c = c2 === -Infinity ? c1 : smax(c1, c2, SMOOTH_K)
      if (f1 === Infinity) {
        // No influence reaches this node: deep rock, recorded as a closed
        // column rather than as a separate mask. `FAR_GAP` continues the
        // diverging extension, so `gap` keeps decreasing outward and the
        // containment gradient never points the wrong way.
        floorY[i] = surf - FAR_GAP * 0.5
        ceilY[i] = surf + FAR_GAP * 0.5
        coreT[i] = 1
        continue
      }

      // The walk surface is a floor candidate, but only where the cave void
      // actually reaches it. Rock between the cave ceiling and the surface
      // pushes the candidate out of smin's range, so a hillside 12 m above a
      // tunnel can never become that tunnel's floor.
      const irrelevance = Math.max(0, (surf - SURFACE_CLIP_EPS) - c)
      f = smin(f, surf + SURFACE_BLEND_PUSH * irrelevance, SURFACE_BLEND_K)

      // Features: shelf raises the floor (an elevated floor region adjacent
      // in XZ to the lower floor — still one floorY per column); overhang
      // dips the ceiling. Both fade out across the rim band so they can never
      // break the floor/ceiling weld.
      for (const feat of features) {
        const lift = featureLift(feat, x, z)
        if (lift <= 0) continue
        if (feat.kind === 'shelf') {
          const rise = Math.max(0, feat.amount - f) * lift * (1 - closure(tMin, NF))
          f += rise
        } else {
          c -= feat.amount * lift * (1 - closure(qMin, NC))
        }
      }

      f += config.floorDetail.amplitude * floorNoise(x, z) * (1 - closure(tMin, NF))
      c += config.ceilingDetail.amplitude * ceilNoise(x, z) * (1 - closure(qMin, NC))

      // Walkable-core clearance only: the rim must stay free to converge.
      const required = topology.minClearance * (1 - smoothstep01(U_CORE, U_FADE, tMin))
      if (required > 0) c = smax(c, f + required, 0.25)

      if (poolIntent) {
        f -= undergroundPoolFloorDepression(poolIntent, x, z)
      }

      floorY[i] = f
      ceilY[i] = c
      coreT[i] = tMin
      if (c - f > 0) caveNodeCount++
    }
  }

  const heightfield: CaveHeightfieldRepresentation = {
    bounds: {
      minX: originX,
      maxX: originX + (nx - 1) * config.cellSize,
      minZ: originZ,
      maxZ: originZ + (nz - 1) * config.cellSize,
    },
    originX,
    originZ,
    cellSize: config.cellSize,
    nx,
    nz,
    floorY,
    ceilY,
    surfaceY,
    coreT,
    minClearance: topology.minClearance,
    entrance: topology.entrance,
    caveId: topology.caveId,
    seed: topology.seed,
  }

  return { heightfield, representationMs: now() - t0, caveNodeCount }
}

// ── Sampling ────────────────────────────────────────────────────────────────

export function heightfieldNodeIndex(field: CaveHeightfieldRepresentation, ix: number, iz: number): number {
  return iz * field.nx + ix
}

export function heightfieldNodePosition(
  field: CaveHeightfieldRepresentation,
  ix: number,
  iz: number,
): { x: number, z: number } {
  return { x: field.originX + ix * field.cellSize, z: field.originZ + iz * field.cellSize }
}

/** `gap` at a node. Positive inside cave void. */
export function heightfieldNodeGap(field: CaveHeightfieldRepresentation, i: number): number {
  return field.ceilY[i]! - field.floorY[i]!
}

/** The cave void reaches the walk surface at this node — mouth / portal. */
export function heightfieldNodeOpenSky(field: CaveHeightfieldRepresentation, i: number): boolean {
  return field.ceilY[i]! >= field.surfaceY[i]! - SURFACE_CLIP_EPS
}

function clampedGrid(field: CaveHeightfieldRepresentation, x: number, z: number): { gx: number, gz: number, out: number } {
  const rawGx = (x - field.originX) / field.cellSize
  const rawGz = (z - field.originZ) / field.cellSize
  const maxGx = field.nx - 1.001
  const maxGz = field.nz - 1.001
  const gx = Math.max(0, Math.min(maxGx, rawGx))
  const gz = Math.max(0, Math.min(maxGz, rawGz))
  const out = Math.hypot((rawGx - gx) * field.cellSize, (rawGz - gz) * field.cellSize)
  return { gx, gz, out }
}

function bilerp(grid: Float32Array, nx: number, gx: number, gz: number): number {
  const x0 = Math.floor(gx)
  const z0 = Math.floor(gz)
  const tx = gx - x0
  const tz = gz - z0
  const i00 = z0 * nx + x0
  const n00 = grid[i00]!
  const n10 = grid[i00 + 1]!
  const n01 = grid[i00 + nx]!
  const n11 = grid[i00 + nx + 1]!
  return n00 * (1 - tx) * (1 - tz) + n10 * tx * (1 - tz) + n01 * (1 - tx) * tz + n11 * tx * tz
}

/**
 * Bilinear query against the heightfield. Outside the grid the sample is
 * pushed closed proportionally to the distance, so `gap` stays negative
 * rather than clamping to the border value.
 *
 * @domain world-terrain
 */
export function sampleHeightfieldAt(field: CaveHeightfieldRepresentation, x: number, z: number): HeightfieldSample {
  const { gx, gz, out } = clampedGrid(field, x, z)
  const floor = bilerp(field.floorY, field.nx, gx, gz)
  const ceil = bilerp(field.ceilY, field.nx, gx, gz)
  const surf = bilerp(field.surfaceY, field.nx, gx, gz)
  const coreT = out > 0 ? 1 : bilerp(field.coreT, field.nx, gx, gz)
  const shrink = KAPPA * out
  const floorY = floor + shrink
  const ceilY = ceil - shrink
  return {
    floorY,
    ceilY,
    gap: ceilY - floorY,
    surfaceY: surf,
    coreT,
    openSky: out <= 0 && ceilY >= surf - SURFACE_CLIP_EPS,
    outsideGrid: out > 0,
  }
}

/**
 * Positive exactly where cave void breaks the walk surface — the mouth /
 * portal opening.
 *
 * ```text
 * mouthOpening = min(gap, ceilY - (surfaceY - SURFACE_CLIP_EPS))
 * ```
 *
 * One function so the terrain cutout, the cave-ceiling clip and the rock
 * framing all stop on the *same* contour. `walkSurfaceAt` is passed rather
 * than read from the field's cached `surfaceY` because that cache is exact
 * only at nodes; over the steep pit wall its bilinear interpolation is what
 * was left of the mouth seam.
 *
 * @domain world-terrain
 */
export function mouthOpeningAt(
  field: CaveHeightfieldRepresentation,
  walkSurfaceAt: SurfaceSampler,
  x: number,
  z: number,
): number {
  const sample = sampleHeightfieldAt(field, x, z)
  return Math.min(sample.gap, sample.ceilY - (walkSurfaceAt(x, z) - SURFACE_CLIP_EPS))
}

/** Gradient of `gap` in XZ — the push-out direction for lateral containment. */
export function heightfieldGapGradient(
  field: CaveHeightfieldRepresentation,
  x: number,
  z: number,
): { gx: number, gz: number } {
  const e = Math.max(0.08, field.cellSize * 0.5)
  const dx = sampleHeightfieldAt(field, x + e, z).gap - sampleHeightfieldAt(field, x - e, z).gap
  const dz = sampleHeightfieldAt(field, x, z + e).gap - sampleHeightfieldAt(field, x, z - e).gap
  return { gx: dx / (2 * e), gz: dz / (2 * e) }
}
