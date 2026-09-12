/** Plan world-terrain-025 — deterministic shallow underground pool for
 *  accepted `dungeon` caves. Representation-neutral contract shared by
 *  heightfield deformation, water presentation and future fauna consumers.
 *
 * @domain world-terrain
 */

import type { WaterSource } from '../WaterSource'
import type { CaveTopology } from './caveTopology'
import { createWaterSource } from '../WaterSource'
import { heightfieldStandingClearance } from './caveHeightfieldQuery'
import {
  buildCaveHeightfieldRepresentation,
  type CaveHeightfieldRepresentation,
  DEFAULT_HEIGHTFIELD_CONFIG,
  sampleHeightfieldAt,
  type SurfaceSampler,
} from './caveHeightfieldRepresentation'
import { MAX_TRAVERSABLE_FLOOR_GRADE } from './caveRoute'
import {
  CAVE_UNDERGROUND_POOL_MAX_DEPTH,
  resolveUndergroundPoolFootprintIntent,
  undergroundPoolFloorDepression,
  type UndergroundPoolFootprintIntent,
  undergroundPoolFootprintStrength,
} from './caveUndergroundPoolFootprint'
import { mouthCarveDepth } from './mouthCarve'

export {
  CAVE_UNDERGROUND_POOL_MAX_DEPTH,
  resolveUndergroundPoolFootprintIntent,
  undergroundPoolFloorDepression,
  type UndergroundPoolFootprintIntent,
  undergroundPoolFootprintStrength,
} from './caveUndergroundPoolFootprint'

const PLAYER_STANDING_HEIGHT = 1.8

/**
 * Frozen environmental contract for one accepted dungeon pool.
 *
 * @domain world-terrain
 */
export type CaveUndergroundPool = {
  id: string
  caveId: string
  chamberNodeId: string
  waterSource: WaterSource
  waterLevel: number
  maxDepth: number
  footprint: UndergroundPoolFootprintIntent
  shorelineApproach: { x: number, y: number, z: number }
}

export function undergroundPoolId(caveId: string): string {
  return `${caveId}:underground-pool`
}

export function walkSurfaceForTopology(
  topology: CaveTopology,
  sampleBaseHeight: SurfaceSampler,
): SurfaceSampler {
  const entrance = topology.entrance
  return (x, z) => sampleBaseHeight(x, z) - mouthCarveDepth(x, z, entrance)
}

function sampleFloorWithoutPool(
  field: CaveHeightfieldRepresentation,
  intent: UndergroundPoolFootprintIntent,
  x: number,
  z: number,
): number {
  const dep = undergroundPoolFloorDepression(intent, x, z)
  return sampleHeightfieldAt(field, x, z).floorY + dep
}

function findShorelineApproach(
  field: CaveHeightfieldRepresentation,
  intent: UndergroundPoolFootprintIntent,
  waterLevel: number,
): { x: number, y: number, z: number } | null {
  const minGap = heightfieldStandingClearance(PLAYER_STANDING_HEIGHT)
  const rimScale = 0.92
  const segments = 32
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * Math.PI * 2
    const cos = Math.cos(intent.rotation)
    const sin = Math.sin(intent.rotation)
    const lx = Math.cos(t) * intent.radiusX * rimScale
    const lz = Math.sin(t) * intent.radiusZ * rimScale
    const x = intent.centerX + lx * cos - lz * sin
    const z = intent.centerZ + lx * sin + lz * cos
    const sample = sampleHeightfieldAt(field, x, z)
    if (sample.gap < minGap) continue
    if (sample.floorY < waterLevel - 0.05) continue
    return { x, y: sample.floorY, z }
  }
  return null
}

function validateBasinTraversal(
  field: CaveHeightfieldRepresentation,
  intent: UndergroundPoolFootprintIntent,
): boolean {
  const cos = Math.cos(intent.rotation)
  const sin = Math.sin(intent.rotation)
  const spans = [
    { dx: cos, dz: sin },
    { dx: -sin, dz: cos },
    { dx: cos * 0.7 - sin * 0.7, dz: sin * 0.7 + cos * 0.7 },
  ]
  const halfLen = Math.max(intent.radiusX, intent.radiusZ) * 1.15
  const steps = 14
  for (const dir of spans) {
    let prevY: number | null = null
    let prevX = 0
    let prevZ = 0
    for (let s = 0; s <= steps; s++) {
      const along = -halfLen + (2 * halfLen * s) / steps
      const x = intent.centerX + dir.dx * along
      const z = intent.centerZ + dir.dz * along
      const sample = sampleHeightfieldAt(field, x, z)
      if (sample.gap <= 0) return false
      const y = sample.floorY
      if (prevY !== null) {
        const dist = Math.hypot(x - prevX, z - prevZ)
        if (dist > 1e-4 && Math.abs(y - prevY) / dist > MAX_TRAVERSABLE_FLOOR_GRADE * 1.35) {
          return false
        }
      }
      prevY = y
      prevX = x
      prevZ = z
    }
  }
  return true
}

/**
 * Validates a retained heightfield carrying `intent` and returns the frozen
 * pool contract, or `null` when guardrails fail.
 *
 * @domain world-terrain
 */
export function finalizeUndergroundPool(
  field: CaveHeightfieldRepresentation,
  intent: UndergroundPoolFootprintIntent,
): CaveUndergroundPool | null {
  const centerFloor = sampleFloorWithoutPool(field, intent, intent.centerX, intent.centerZ)
  const waterLevel = centerFloor - intent.maxDepth * 0.48

  let maxObservedDepth = 0
  let hasWetInterior = false
  const gridStep = field.cellSize * 0.85
  const scanR = Math.max(intent.radiusX, intent.radiusZ) * 1.05
  for (let iz = -scanR; iz <= scanR; iz += gridStep) {
    for (let ix = -scanR; ix <= scanR; ix += gridStep) {
      const x = intent.centerX + ix
      const z = intent.centerZ + iz
      const strength = undergroundPoolFootprintStrength(intent, x, z)
      if (strength <= 0.02) continue
      const sample = sampleHeightfieldAt(field, x, z)
      if (sample.gap <= 0) return null
      const depth = waterLevel - sample.floorY
      if (depth > CAVE_UNDERGROUND_POOL_MAX_DEPTH + 0.02) return null
      maxObservedDepth = Math.max(maxObservedDepth, depth)
      if (strength > 0.35 && depth > 0.04) hasWetInterior = true
    }
  }
  if (!hasWetInterior || maxObservedDepth <= 0) return null

  const shorelineApproach = findShorelineApproach(field, intent, waterLevel)
  if (!shorelineApproach) return null
  if (!validateBasinTraversal(field, intent)) return null

  return {
    id: undergroundPoolId(intent.caveId),
    caveId: intent.caveId,
    chamberNodeId: intent.chamberNodeId,
    waterSource: createWaterSource('lake'),
    waterLevel,
    maxDepth: maxObservedDepth,
    footprint: intent,
    shorelineApproach,
  }
}

/**
 * Builds the retained heightfield with pool deformation and validates it.
 *
 * @domain world-terrain
 */
export function buildDungeonHeightfieldWithPool(
  topology: CaveTopology,
  walkSurfaceAt: SurfaceSampler,
): { heightfield: CaveHeightfieldRepresentation, pool: CaveUndergroundPool } | null {
  const intent = resolveUndergroundPoolFootprintIntent(topology)
  if (!intent) return null
  const { heightfield } = buildCaveHeightfieldRepresentation(
    topology,
    walkSurfaceAt,
    DEFAULT_HEIGHTFIELD_CONFIG,
    intent,
  )
  const pool = finalizeUndergroundPool(heightfield, intent)
  if (!pool) return null
  return { heightfield, pool }
}

/**
 * Dungeon topology + terrain acceptance including a valid shallow pool.
 *
 * @domain world-terrain
 */
export function dungeonTopologyAcceptsUndergroundPool(
  topology: CaveTopology,
  sampleBaseHeight: SurfaceSampler,
): boolean {
  const walk = walkSurfaceForTopology(topology, sampleBaseHeight)
  return buildDungeonHeightfieldWithPool(topology, walk) !== null
}
