/** Plan world-terrain-025 — pure footprint math for dungeon underground pools.
 *
 * @domain world-terrain
 */

import type { CaveTopology } from './caveTopology'
import { CAVE_RNG_SALT, createCaveRandom } from './caveRng'
import { type DungeonChamber, type DungeonChamberClass, dungeonChambersFromTopology } from './dungeonChambers'
import { createValueNoise2D } from './spikeNoise'

/** Maximum `waterLevel - floorY` in the basin (see `caveUndergroundPool.ts`). */
export const CAVE_UNDERGROUND_POOL_MAX_DEPTH = 0.38

const CHAMBER_CLASS_WEIGHT: Record<DungeonChamberClass, number> = {
  'entrance-adjacent': 0,
  regular: 4,
  deep: 3,
  side: 2,
  final: 1,
}

/**
 * Elliptical footprint parameters — one authority for heightfield depression,
 * water mesh bounds and semantic queries.
 *
 * @domain world-terrain
 */
export type UndergroundPoolFootprintIntent = {
  caveId: string
  chamberNodeId: string
  centerX: number
  centerZ: number
  radiusX: number
  radiusZ: number
  rotation: number
  maxDepth: number
}

function weightedChamberPick(
  chambers: readonly DungeonChamber[],
  random: () => number,
): DungeonChamber | null {
  const eligible = chambers.filter((c) => CHAMBER_CLASS_WEIGHT[c.class] > 0)
  if (eligible.length === 0) return null
  let total = 0
  for (const c of eligible) total += CHAMBER_CLASS_WEIGHT[c.class]!
  let roll = random() * total
  for (const c of eligible) {
    roll -= CHAMBER_CLASS_WEIGHT[c.class]!
    if (roll <= 0) return c
  }
  return eligible[eligible.length - 1]!
}

/**
 * Deterministic pool chamber + footprint for a dungeon topology, or `null`
 * when no chamber can host a pool candidate.
 *
 * @domain world-terrain
 */
export function resolveUndergroundPoolFootprintIntent(
  topology: CaveTopology,
): UndergroundPoolFootprintIntent | null {
  const chambers = dungeonChambersFromTopology(topology)
  const selectRandom = createCaveRandom(topology.caveId, CAVE_RNG_SALT.undergroundPoolSelect)
  const chamber = weightedChamberPick(chambers, selectRandom)
  if (!chamber) return null

  const shapeRandom = createCaveRandom(topology.caveId, CAVE_RNG_SALT.undergroundPoolShape)
  const angle = shapeRandom() * Math.PI * 2
  const offset = shapeRandom() * chamber.targetWidth * 0.14
  const centerX = chamber.position.x + Math.cos(angle) * offset
  const centerZ = chamber.position.z + Math.sin(angle) * offset
  const radiusX = (0.20 + shapeRandom() * 0.14) * chamber.targetWidth
  const radiusZ = (0.16 + shapeRandom() * 0.12) * chamber.targetWidth
  const rotation = shapeRandom() * Math.PI
  const maxDepth = 0.18 + shapeRandom() * (CAVE_UNDERGROUND_POOL_MAX_DEPTH - 0.18)

  return {
    caveId: topology.caveId,
    chamberNodeId: chamber.nodeId,
    centerX,
    centerZ,
    radiusX: Math.max(1.2, radiusX),
    radiusZ: Math.max(1.0, radiusZ),
    rotation,
    maxDepth: Math.min(CAVE_UNDERGROUND_POOL_MAX_DEPTH, maxDepth),
  }
}

const perturbNoiseByCave = new Map<string, (x: number, z: number) => number>()

function poolPerturbAt(caveId: string, x: number, z: number): number {
  let noise = perturbNoiseByCave.get(caveId)
  if (!noise) {
    noise = createValueNoise2D((caveId.length * 0x9e3779b9) >>> 0, 1.8)
    perturbNoiseByCave.set(caveId, noise)
  }
  return 0.82 + 0.18 * noise(x, z)
}

/** Normalised elliptical footprint strength in `[0, 1]`. */
export function undergroundPoolFootprintStrength(
  intent: UndergroundPoolFootprintIntent,
  x: number,
  z: number,
): number {
  const cos = Math.cos(intent.rotation)
  const sin = Math.sin(intent.rotation)
  const lx = (x - intent.centerX) * cos + (z - intent.centerZ) * sin
  const lz = -(x - intent.centerX) * sin + (z - intent.centerZ) * cos
  const radial = (lx * lx) / (intent.radiusX * intent.radiusX)
    + (lz * lz) / (intent.radiusZ * intent.radiusZ)
  if (radial >= 1) return 0
  const t = 1 - radial
  const smooth = t * t * (3 - 2 * t)
  return smooth * poolPerturbAt(intent.caveId, x, z)
}

/** Metres to subtract from the cave floor at `(x, z)`. */
export function undergroundPoolFloorDepression(
  intent: UndergroundPoolFootprintIntent,
  x: number,
  z: number,
): number {
  const strength = undergroundPoolFootprintStrength(intent, x, z)
  return intent.maxDepth * strength
}
