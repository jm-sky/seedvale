import * as THREE from 'three'
import type { RoadCorridorSegment } from '../terrain/chunkHeightmap'
import type { Collider } from '../world/collision'
import type { SettlementSite } from './findSettlementSite'
import type { VillagePlan } from './villagePlan'
import { pointHitsCorridor } from '../math/segment'
import { buildInstancedProps, type PropPlacement } from '../render/instancedProps'
import { type CoastalSamplers, isCoastalPlacement } from '../terrain/coastPlacement'
import { type VillageSize, villageSizeConfig } from './families'
import { WALL_URL } from './propSpecs'
import { loadPropOrFallback } from './propUtils'
import { yawToward } from './roadNetwork'

export { pointHitsCorridor }

const WALL_TARGET_HEIGHT = 1.85
/** Approximate world half-width of a wall segment after `prepareProp` height fit. */
export const WALL_HALF_LENGTH = 2.2
/** Gate gap half-angle (radians) left open for the road/path. */
export const PALISADE_GATE_HALF_ANGLE = 0.38
/** Approximate collider half-thickness of a palisade wall segment (plan
 *  settlements-015) — a settlement wall segment is much thinner than a house
 *  wall (`houseBuilder.ts`'s `WALL_HALF_DEPTH`); kept small so the collider
 *  doesn't visibly protrude past the mesh and the gate/corridor/coastal gaps
 *  this module leaves open stay physically open too.
 *  @domain settlements */
export const PALISADE_WALL_HALF_DEPTH = 0.3
/** How many wall segments on each side of the gate (small villages stay modest). */
const PALISADE_SEGMENTS_PER_SIDE: Record<VillageSize, number> = {
  OUTPOST: 1,
  SM: 2,
  MD: 3,
  LG: 3,
  XL: 4,
}

/** Fallback palisade stake if `wall.glb` fails to load. */
function createPalisadeStake(): THREE.Group {
  const g = new THREE.Group()
  const mat = new THREE.MeshStandardMaterial({ color: 0x5c4030, flatShading: true })
  const stake = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, 1.8, 5), mat)
  stake.position.y = 0.9
  stake.castShadow = true
  g.add(stake)
  return g
}

/** A finished, placement-constraint-passing settlement palisade segment — the
 *  single plain-data source both presentation (`plantEntrancePalisade`) and
 *  collision (`settlementPalisadeColliders`) consume. Never reconstruct this
 *  from settlement center/radius/entrance angle in a second place; resolve it
 *  once with `resolveEntrancePalisadePlacements` and share the result.
 *  @domain settlements */
export type SettlementPalisadePlacement = PropPlacement

/**
 * Resolves the final settlement entrance palisade segment placements — short
 * palisade wings beside the main entrance (a gate gap, not a full ring).
 * Skips seaward/beach entrances so coastal villages don't wall off the ocean,
 * and skips (or never opens onto) road/path corridors so segments don't sit
 * in the dirt strip — the gate angle alone is not enough when the road
 * bearing differs from the entrance ray or a second corridor crosses the ring.
 *
 * This is the one place gate/coastal/corridor rejection happens. Presentation
 * (`plantEntrancePalisade`) and collision (`settlementPalisadeColliders`)
 * must consume this exact result rather than re-deriving it.
 * @domain settlements
 */
export function resolveEntrancePalisadePlacements(
  site: SettlementSite,
  size: VillageSize,
  sampleHeight: (x: number, z: number) => number,
  waterLevel: number,
  plan: VillagePlan | undefined,
  coast?: CoastalSamplers,
  corridors: readonly RoadCorridorSegment[] = [],
): SettlementPalisadePlacement[] {
  const segmentsPerSide = PALISADE_SEGMENTS_PER_SIDE[size]
  if (segmentsPerSide <= 0) return []

  const coastEnv: CoastalSamplers = coast ?? { sampleHeight, waterLevel }
  const radius = plan?.boundary.radius ?? villageSizeConfig(size).footprintRadius * 0.72

  const entrances = plan?.entrances ?? []
  const inlandEntrances = entrances.filter((e) => !isCoastalPlacement(e.x, e.z, coastEnv))
  const entrance = inlandEntrances.find((e) => e.kind === 'road')
    ?? inlandEntrances[0]
  if (!entrance && entrances.length > 0) {
    // Every planned entrance is coastal — skip palisade rather than wall the sea.
    return []
  }

  const outward = entrance
    ? Math.atan2(entrance.z - site.z, entrance.x - site.x)
    : 0

  // Also reject if the gate mid-point itself sits on beach (no plan entrances).
  const gateX = site.x + Math.cos(outward) * radius
  const gateZ = site.z + Math.sin(outward) * radius
  if (isCoastalPlacement(gateX, gateZ, coastEnv)) return []

  // Widen the angular gate so a typical inter-settlement road (~roadHalfWidth 5)
  // plus a wall segment fits through even when the ray is slightly off.
  let maxCorridorHalf = 5
  for (const seg of corridors) {
    if (seg.halfWidth > maxCorridorHalf) maxCorridorHalf = seg.halfWidth
  }
  const gateHalf = Math.max(
    PALISADE_GATE_HALF_ANGLE,
    Math.atan2(maxCorridorHalf + WALL_HALF_LENGTH, Math.max(radius, 1)),
  )

  const step = (WALL_HALF_LENGTH * 2) / radius
  const placements: SettlementPalisadePlacement[] = []

  for (const side of [-1, 1] as const) {
    for (let i = 0; i < segmentsPerSide; i++) {
      const ang = outward + side * (gateHalf + step * (i + 0.5))
      const x = site.x + Math.cos(ang) * radius
      const z = site.z + Math.sin(ang) * radius
      if (isCoastalPlacement(x, z, coastEnv)) continue
      if (pointHitsCorridor(x, z, corridors, WALL_HALF_LENGTH + 0.4)) continue
      const tangent = ang + Math.PI / 2
      placements.push({
        speciesIndex: 0,
        x,
        z,
        groundY: sampleHeight(x, z),
        rotationY: yawToward(Math.cos(tangent), Math.sin(tangent)),
        scale: 1,
      })
    }
  }

  return placements
}

/**
 * Materializes the final entrance palisade placements as instanced geometry.
 * Presentation only — `placements` must be `resolveEntrancePalisadePlacements`'s
 * exact result, the same array collision projects from.
 * Uses `wall.glb` (Quaternius Fantasy RTS) with procedural stake fallback.
 * @domain settlements
 */
export async function plantEntrancePalisade(
  group: THREE.Group,
  placements: readonly SettlementPalisadePlacement[],
  instanceName = 'settlement-palisade',
): Promise<void> {
  if (placements.length === 0) return
  const wall = await loadPropOrFallback(WALL_URL, WALL_TARGET_HEIGHT, createPalisadeStake)
  const instanced = buildInstancedProps([wall], placements, instanceName)
  if (instanced) group.add(instanced.group)
}

/**
 * Pure placement → collision projection for the settlement entrance
 * palisade. Every finished visible segment gets exactly one `obb` collider;
 * a segment `resolveEntrancePalisadePlacements` skipped (gate gap, corridor,
 * coastal rejection) has no counterpart here — never fabricate a continuous
 * ring collider. `rotationY` is used as-is from the placement so the
 * collider orientation always matches the rendered segment's tangent facing
 * (the wall's long/local axis, `WALL_HALF_LENGTH`, is the one
 * `instanceWorldMatrix` rotates by this same `rotationY`).
 * @domain settlements
 */
export function settlementPalisadeColliders(
  placements: readonly SettlementPalisadePlacement[],
): Collider[] {
  return placements.map((placement) => ({
    type: 'obb',
    x: placement.x,
    z: placement.z,
    halfWidth: WALL_HALF_LENGTH,
    halfDepth: PALISADE_WALL_HALF_DEPTH,
    rotationY: placement.rotationY,
  }))
}
