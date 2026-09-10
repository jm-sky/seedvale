/** Plan world-terrain-008 §19 — "terrain nad cave pozostaje surface": no
 *  interior cave geometry may stand above the surface heightfield past the
 *  carved mouth footprint. V1 gets this from `caveGenerator.ts`'s
 *  `tunnelOverburdenOk`/`MOUTH_ROOF_MIN` acceptance plus an *open-ended*
 *  tunnel arch (`caveMesh.ts` caps nothing at the mouth). Neither spike
 *  inherits that automatically:
 *
 *  - the SDF field is a closed iso-surface, so its first ellipsoid is capped
 *    into a rock dome over the mouth — a sealed blob emerging from the
 *    meadow rather than an open portal;
 *  - both spikes place the entrance primitive a full `entrance.height`
 *    (2.6 m) above the carved recess floor, which sits only
 *    `CAVE_MOUTH_DEPTH` (2.4 m) below the surface, so the leading section is
 *    ~0.2 m proud of the terrain by construction, for every seed.
 *
 *  Cutting the geometry at the terrain restores the overburden invariant.
 *  The doorway aperture, sides, lip and hood live in the SDF field
 *  (`applyMouthGeometryToField`); `clipTrianglesInFrontOfMouth` only drops
 *  the sleeve's outer cap inside the 3D aperture rectangle.
 *
 * @domain world-terrain
 */

import { deriveMouthGeometry, inMouthAperture, mouthAlong, mouthLateral } from './mouthCarve'

/** Height sampler used to clip cave presentation geometry. Must be the
 *  deterministic analytic surface (`ChunkManager.sampleBaseHeight`), never a
 *  chunk-tile read — the mesh is built on streaming activation and may not
 *  depend on which chunks happen to be resident. */
export type SurfaceHeightSampler = (x: number, z: number) => number

/**
 * Drops every triangle with any vertex above `surfaceHeightAt` and compacts
 * the remaining vertices. Pure; returns fresh arrays.
 *
 * @domain world-terrain
 */
export function clipTrianglesBelowSurface(
  positions: ArrayLike<number>,
  indices: ArrayLike<number>,
  surfaceHeightAt: SurfaceHeightSampler,
): { positions: number[], indices: number[] } {
  const vertexCount = positions.length / 3
  const below = new Uint8Array(vertexCount)
  for (let v = 0; v < vertexCount; v++) {
    const x = positions[v * 3]!
    const y = positions[v * 3 + 1]!
    const z = positions[v * 3 + 2]!
    below[v] = y <= surfaceHeightAt(x, z) ? 1 : 0
  }

  const remap = new Int32Array(vertexCount).fill(-1)
  const outPositions: number[] = []
  const outIndices: number[] = []
  const keep = (v: number): number => {
    let mapped = remap[v]!
    if (mapped < 0) {
      mapped = outPositions.length / 3
      remap[v] = mapped
      outPositions.push(positions[v * 3]!, positions[v * 3 + 1]!, positions[v * 3 + 2]!)
    }
    return mapped
  }

  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = indices[i]!
    const b = indices[i + 1]!
    const c = indices[i + 2]!
    if (!below[a] || !below[b] || !below[c]) continue
    outIndices.push(keep(a), keep(b), keep(c))
  }

  return { positions: outPositions, indices: outIndices }
}

/**
 * Drops leftover triangles *inside* the 3D doorway aperture outward of the
 * mouth plane — the sleeve cap Surface Nets still emits after the SDF
 * aperture/frame exist. Hood (above the lintel), sides and lip are kept.
 *
 * @domain world-terrain
 */
export function clipTrianglesInFrontOfMouth(
  positions: ArrayLike<number>,
  indices: ArrayLike<number>,
  entrance: { x: number, y?: number, z: number, yaw: number, width?: number, height?: number },
): { positions: number[], indices: number[] } {
  const vertexCount = positions.length / 3
  const remap = new Int32Array(vertexCount).fill(-1)
  const outPositions: number[] = []
  const outIndices: number[] = []
  const keep = (v: number): number => {
    let mapped = remap[v]!
    if (mapped < 0) {
      mapped = outPositions.length / 3
      remap[v] = mapped
      outPositions.push(positions[v * 3]!, positions[v * 3 + 1]!, positions[v * 3 + 2]!)
    }
    return mapped
  }

  const mouth = deriveMouthGeometry({
    x: entrance.x,
    y: entrance.y ?? 0,
    z: entrance.z,
    yaw: entrance.yaw,
    width: entrance.width ?? 3,
    height: entrance.height ?? 2.6,
  })
  for (let i = 0; i + 2 < indices.length; i += 3) {
    const a = indices[i]!
    const b = indices[i + 1]!
    const c = indices[i + 2]!
    const cx = (positions[a * 3]! + positions[b * 3]! + positions[c * 3]!) / 3
    const cy = (positions[a * 3 + 1]! + positions[b * 3 + 1]! + positions[c * 3 + 1]!) / 3
    const cz = (positions[a * 3 + 2]! + positions[b * 3 + 2]! + positions[c * 3 + 2]!) / 3
    const along = mouthAlong(cx, cz, entrance)
    const lateral = mouthLateral(cx, cz, entrance)
    if (inMouthAperture(along, lateral, cy, mouth)) continue
    outIndices.push(keep(a), keep(b), keep(c))
  }

  return { positions: outPositions, indices: outIndices }
}
