/** Plan world-terrain-008 Milestone B3 — derived cave wall colliders from
 *  the SDF column index's strict occupancy silhouette.
 *
 *  Beads are Y-banded per vertical interval so stacked routes, shelves and
 *  overhangs are not one full-height cylinder. They register in the existing
 *  `ColliderRegistry` under `cave:<id>`. The render mesh is never authority.
 *
 * @domain world-terrain
 */

import type { CaveEntrance } from '../caveVolume'
import type { Collider } from '../collision'
import type { CaveSdfSpatialRepresentation } from './caveSdfField'
import type { CaveTopology } from './caveTopology'
import {
  type CaveSdfColumnIndex,
  occupancyContains,
  type SurfaceHeightSampler,
} from './caveSdfQuery'
import { MOUTH_INTERIOR_ALONG, mouthAlong, mouthLateral } from './mouthCarve'

/** Matches V1 `caveColliders.ts` bead size so `resolvePosition` overlap
 *  stays continuous along a wall (`step` 0.4 < 2 × radius). */
export const CAVE_SDF_BEAD_RADIUS = 0.5
/** Keep Y-bands from leaking a narrower/wider silhouette into the next
 *  slice — a large pad would turn stacked shelves into a tall cylinder. */
const VERTICAL_PAD = 0.05
const ISO_SNAP_ITERS = 8
/** Sit the bead slightly into the rock so a point just past the iso is
 *  still on the cave-facing side of the bead centre. */
const ISO_OUTWARD_EXTRA = 0.1
/** Fallback inner along bound when topology has no `transition` node.
 *  Production uses the transition station — a hardcoded −1.5 m left
 *  floor-band beads on the post-a9430c47 mouth ramp (along ≈ −3.3…−1.8). */
export const MOUTH_CORRIDOR_ALONG = -1.5
/** Half-width of the clear walking strip (metres from the entrance centreline). */
export const MOUTH_CORRIDOR_HALF = 1.0

export type MouthColliderFilter = {
  width?: number
  /** Inner `mouthAlong` of the walking strip (transition station). Beads
   *  whose sphere overlaps `(corridorAlong, mouth plane]` × strip are
   *  dropped. Default `MOUTH_CORRIDOR_ALONG`. */
  corridorAlong?: number
} & Pick<CaveEntrance, 'x' | 'z' | 'yaw'>

/** Inner along bound of the walkable mouth corridor: the production
 *  `transition` node, so densified/lengthened entrance ramps stay in the
 *  exclusion. Falls back to `MOUTH_CORRIDOR_ALONG` when the graph has no
 *  transition (unit-test stubs). */
export function mouthWalkCorridorAlong(
  topology: Pick<CaveTopology, 'entrance' | 'nodes'>,
): number {
  const transition = topology.nodes.find((n) => n.id === 'transition')
  if (!transition) return MOUTH_CORRIDOR_ALONG
  return mouthAlong(transition.position.x, transition.position.z, topology.entrance)
}

/** Entrance + corridor bound for occupancy-derived beads — pass this
 *  instead of a bare `entrance` so iso-snap cannot seal the portal after
 *  topology length/station changes. */
export function caveMouthColliderFilter(topology: CaveTopology): MouthColliderFilter {
  return { ...topology.entrance, corridorAlong: mouthWalkCorridorAlong(topology) }
}

const NEIGHBORS: readonly { dx: number, dz: number }[] = [
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 },
]

function columnCenter(index: CaveSdfColumnIndex, ix: number, iz: number): { x: number, z: number } {
  return { x: index.originX + ix * index.step, z: index.originZ + iz * index.step }
}

function inBounds(index: CaveSdfColumnIndex, ix: number, iz: number): boolean {
  return ix >= 0 && iz >= 0 && ix < index.nx && iz < index.nz
}

function snapBeadToIso(
  sample: CaveSdfSpatialRepresentation['sample'],
  fromX: number,
  fromZ: number,
  dirX: number,
  dirZ: number,
  y: number,
  step: number,
): { x: number, z: number } {
  const maxDist = step * 2
    if (sample(fromX, y, fromZ) >= 0) {
    return {
      x: fromX + dirX * (step * 0.5 + CAVE_SDF_BEAD_RADIUS + ISO_OUTWARD_EXTRA),
      z: fromZ + dirZ * (step * 0.5 + CAVE_SDF_BEAD_RADIUS + ISO_OUTWARD_EXTRA),
    }
  }
  if (sample(fromX + dirX * maxDist, y, fromZ + dirZ * maxDist) < 0) {
    return {
      x: fromX + dirX * (step * 0.5 + CAVE_SDF_BEAD_RADIUS + ISO_OUTWARD_EXTRA),
      z: fromZ + dirZ * (step * 0.5 + CAVE_SDF_BEAD_RADIUS + ISO_OUTWARD_EXTRA),
    }
  }
  let lo = 0
  let hi = maxDist
  for (let i = 0; i < ISO_SNAP_ITERS; i++) {
    const mid = (lo + hi) * 0.5
    if (sample(fromX + dirX * mid, y, fromZ + dirZ * mid) < 0) lo = mid
    else hi = mid
  }
  const isoDist = (lo + hi) * 0.5 + CAVE_SDF_BEAD_RADIUS + ISO_OUTWARD_EXTRA
  return { x: fromX + dirX * isoDist, z: fromZ + dirZ * isoDist }
}

function corridorHalfWidth(entrance: MouthColliderFilter): number {
  return Math.max(MOUTH_CORRIDOR_HALF, (entrance.width ?? 0) / 2)
}

function corridorInnerAlong(entrance: MouthColliderFilter): number {
  return entrance.corridorAlong ?? MOUTH_CORRIDOR_ALONG
}

function blocksMouthCorridor(x: number, z: number, entrance: MouthColliderFilter): boolean {
  const along = mouthAlong(x, z, entrance)
  if (along <= corridorInnerAlong(entrance) - CAVE_SDF_BEAD_RADIUS) return false
  return Math.abs(mouthLateral(x, z, entrance)) < corridorHalfWidth(entrance) + CAVE_SDF_BEAD_RADIUS
}

function isPortalOnlyColumn(
  representation: CaveSdfSpatialRepresentation | undefined,
  x: number,
  y: number,
  z: number,
): boolean {
  if (!representation) return false
  return representation.sample(x, y, z) >= 0
}

/**
 * Derives circle-bead wall colliders from a column index. Deterministic:
 * same index + surface sampler + optional field → bit-identical beads.
 *
 * @domain world-terrain
 */
export function buildCaveSdfColliders(
  index: CaveSdfColumnIndex,
  surfaceHeightAt: SurfaceHeightSampler,
  representation?: CaveSdfSpatialRepresentation,
  entrance?: MouthColliderFilter,
): Collider[] {
  const out: Collider[] = []
  const { step } = index
  const band = step
  for (let iz = 0; iz < index.nz; iz++) {
    for (let ix = 0; ix < index.nx; ix++) {
      const intervals = index.columns[iz * index.nx + ix] ?? []
      if (intervals.length === 0) continue
      const { x, z } = columnCenter(index, ix, iz)
      if (entrance && mouthAlong(x, z, entrance) > MOUTH_INTERIOR_ALONG) continue
      for (const interval of intervals) {
        for (let y0 = interval.floorY; y0 < interval.ceilingY - 1e-6; y0 += band) {
          const y1 = Math.min(y0 + band, interval.ceilingY)
          const midY = (y0 + y1) * 0.5
          if (!occupancyContains(index, x, midY, z)) continue
          for (const { dx, dz } of NEIGHBORS) {
            const nix = ix + dx
            const niz = iz + dz
            const nx = x + dx * step
            const nz = z + dz * step
            if (entrance && mouthAlong(nx, nz, entrance) > MOUTH_INTERIOR_ALONG) continue
            const neighborVoid = inBounds(index, nix, niz) && occupancyContains(index, nx, midY, nz)
            if (neighborVoid) continue
            if (isPortalOnlyColumn(representation, x, midY, z)) continue
            if (
              !representation
              && interval.ceilingY >= surfaceHeightAt(nx, nz) - 0.3
            ) continue
            const snapped = representation
              ? snapBeadToIso(representation.sample, x, z, dx, dz, midY, step)
              : { x: x + dx * (step * 0.5 + CAVE_SDF_BEAD_RADIUS), z: z + dz * (step * 0.5 + CAVE_SDF_BEAD_RADIUS) }
            if (entrance && mouthAlong(snapped.x, snapped.z, entrance) > MOUTH_INTERIOR_ALONG) continue
            if (entrance && blocksMouthCorridor(snapped.x, snapped.z, entrance)) continue
            const maxY = Math.min(y1 + VERTICAL_PAD, surfaceHeightAt(x, z) - 0.05)
            const minY = y0 - VERTICAL_PAD
            if (maxY <= minY) continue
            out.push({
              type: 'circle',
              x: snapped.x,
              z: snapped.z,
              radius: CAVE_SDF_BEAD_RADIUS,
              minY,
              maxY,
            })
          }
        }
      }
    }
  }
  out.sort((a, b) => {
    const minA = a.minY ?? 0
    const minB = b.minY ?? 0
    if (minA !== minB) return minA - minB
    if (a.x !== b.x) return a.x - b.x
    if (a.z !== b.z) return a.z - b.z
    return (a.maxY ?? 0) - (b.maxY ?? 0)
  })
  return out
}
