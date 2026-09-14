/** Mirrors `GrassSpeciesId` in `grassPlacement.ts` — kept local so this
 *  module stays importable from the worker placement loop without a cycle. */
type GrassSpeciesKey = 'tri' | 'grain' | 'herb' | 'filler'

/**
 * Conservative, data-only bounding sphere for one grass species bucket.
 * Chunk-local — same space as `GrassBucketData.matrices` translation
 * (`localX`, height + ground lift, `localZ`). Main thread assigns this to
 * `InstancedMesh.boundingSphere` instead of scanning every instance.
 */
export type GrassBucketBounds = {
  centerX: number
  centerY: number
  centerZ: number
  radius: number
}

export type GrassBoundsAccumulator = {
  minX: number
  minY: number
  minZ: number
  maxX: number
  maxY: number
  maxZ: number
  count: number
}

/**
 * Max horizontal distance of a local blade vertex from the Y axis (unit
 * cluster space, before instance scale). `hypot(halfWidth, |restCurve|)` at
 * the worst `t`, plus slack.
 *
 * Must stay ≥ every vertex of every geometry LOD in `grass.ts`:
 * - `near` is the largest (herb arch peak is sampled; grain keeps the leaf)
 * - `mid`/`far` only drop segments, and grain `far` drops the leaf fin
 */
const LOCAL_HORIZ: Record<GrassSpeciesKey, number> = {
  // tri: hypot(0.14, 1.2) ≈ 1.208 at the tip
  tri: 1.25,
  // grain leaf: hypot(0.14, 1.68) ≈ 1.686 — larger than the stem cross
  grain: 1.75,
  // herb arch peak: hypot(~0.46, 1.5) ≈ 1.568 (far LOD misses this peak)
  herb: 1.65,
  // filler: hypot(0.10, 0.70) ≈ 0.707
  filler: 0.75,
}

/** All fins live in y ∈ [0, 1] in unit cluster space. */
const LOCAL_Y = 1

/**
 * Vertex-shader tip sway (`grass.ts` VERTEX_SHADER): world XZ after
 * `instanceMatrix`, scaled by weather `uWindAmp`. Sized for
 * `grassWindAmpFor`'s ceiling (`GRASS_WIND_AMP_MAX` = 1.8 in
 * `weatherVisuals.ts`) so frustum culling stays conservative at peak
 * storm displacement — slightly larger than Three.js's matrix-only
 * sphere, never smaller. Do not import `weatherVisuals` from here
 * (worker placement loop).
 */
const WIND_SWAY_PAD = Math.hypot(0.14, 0.1) * 1.8

const BOUNDS_EPSILON = 0.02

/**
 * Local-space extent used to pad each instance. Exported so tests can check
 * that every geometry LOD vertex stays inside it.
 * @domain world-terrain
 */
export function grassSpeciesLocalExtent(id: GrassSpeciesKey): { horiz: number, y: number } {
  return { horiz: LOCAL_HORIZ[id], y: LOCAL_Y }
}

/**
 * Conservative radius from the instance origin (blade base) after non-uniform
 * scale. Rotation/tilt preserve this length. `scaleX` is also used for Z
 * (`pushInstance` uses `bladeWidth` on both X and Z).
 * @domain world-terrain
 */
export function grassInstanceConservativeRadius(
  species: GrassSpeciesKey,
  scaleX: number,
  scaleY: number,
  windFactor: number,
): number {
  const horiz = LOCAL_HORIZ[species] * scaleX
  const vert = LOCAL_Y * scaleY
  return Math.hypot(horiz, vert) + WIND_SWAY_PAD * windFactor + BOUNDS_EPSILON
}

export function createGrassBoundsAccumulator(): GrassBoundsAccumulator {
  return {
    minX: Infinity,
    minY: Infinity,
    minZ: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    maxZ: -Infinity,
    count: 0,
  }
}

/**
 * Expand the running AABB by this instance's conservative sphere. O(1) per
 * instance — intended to run inside the existing placement loop, not as a
 * second pass over matrices.
 * @domain world-terrain
 */
export function expandGrassInstanceBounds(
  acc: GrassBoundsAccumulator,
  species: GrassSpeciesKey,
  x: number,
  y: number,
  z: number,
  scaleX: number,
  scaleY: number,
  windFactor: number,
): void {
  const r = grassInstanceConservativeRadius(species, scaleX, scaleY, windFactor)
  if (acc.count === 0) {
    acc.minX = x - r
    acc.maxX = x + r
    acc.minY = y - r
    acc.maxY = y + r
    acc.minZ = z - r
    acc.maxZ = z + r
    acc.count = 1
    return
  }
  acc.minX = Math.min(acc.minX, x - r)
  acc.maxX = Math.max(acc.maxX, x + r)
  acc.minY = Math.min(acc.minY, y - r)
  acc.maxY = Math.max(acc.maxY, y + r)
  acc.minZ = Math.min(acc.minZ, z - r)
  acc.maxZ = Math.max(acc.maxZ, z + r)
  acc.count++
}

/**
 * AABB → sphere (center = midpoint, radius = half-diagonal). Conservative
 * extra slack from the box corners is acceptable: a 64 m chunk's sphere is
 * tens of metres across, and a metre of pad does not change culling.
 * @domain world-terrain
 */
export function finalizeGrassBounds(acc: GrassBoundsAccumulator): GrassBucketBounds | null {
  if (acc.count === 0) return null
  const centerX = (acc.minX + acc.maxX) * 0.5
  const centerY = (acc.minY + acc.maxY) * 0.5
  const centerZ = (acc.minZ + acc.maxZ) * 0.5
  const radius = Math.hypot(acc.maxX - centerX, acc.maxY - centerY, acc.maxZ - centerZ)
  return { centerX, centerY, centerZ, radius }
}

export function grassBoundsContainsPoint(
  bounds: GrassBucketBounds,
  x: number,
  y: number,
  z: number,
  epsilon = 1e-6,
): boolean {
  const dx = x - bounds.centerX
  const dy = y - bounds.centerY
  const dz = z - bounds.centerZ
  return dx * dx + dy * dy + dz * dz <= (bounds.radius + epsilon) * (bounds.radius + epsilon)
}

/** Apply a column-major 4×4 instance matrix to a local-space point. */
export function transformGrassLocalPoint(
  matrices: Float32Array,
  instanceIndex: number,
  lx: number,
  ly: number,
  lz: number,
): { x: number, y: number, z: number } {
  const o = instanceIndex * 16
  return {
    x: matrices[o]! * lx + matrices[o + 4]! * ly + matrices[o + 8]! * lz + matrices[o + 12]!,
    y: matrices[o + 1]! * lx + matrices[o + 5]! * ly + matrices[o + 9]! * lz + matrices[o + 13]!,
    z: matrices[o + 2]! * lx + matrices[o + 6]! * ly + matrices[o + 10]! * lz + matrices[o + 14]!,
  }
}
