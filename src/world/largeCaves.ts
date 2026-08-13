import type { RoadCorridorSegment } from '../terrain/chunkHeightmap'
import { measureSlope } from '../fauna/createFauna'
import { distanceToSegment } from '../math/segment'
import { isCoastalPlacement } from '../terrain/coastPlacement'
import { createSeededRandom } from './parseSeed'

export type LargeCaveSite = {
  x: number
  z: number
  /** Opening faces this yaw (downhill / outward). */
  yaw: number
  /** Tunnel length along the uphill axis, 10–15 m. */
  length: number
  variant: number
}

export type VillageFootprint = { x: number, z: number, radius: number }

export type LargeCavePlacementInput = {
  seed: number
  sampleHeight: (x: number, z: number) => number
  sampleContinentalness: (x: number, z: number) => number
  sampleMountainRidge: (x: number, z: number) => number
  waterLevel: number
  coastThreshold: number
  roadsNear: (x: number, z: number, querySize: number) => readonly RoadCorridorSegment[]
  villages: readonly VillageFootprint[]
  count?: number
}

export const LARGE_CAVE_MOUTH_WIDTH = 3
export const LARGE_CAVE_MIN_LENGTH = 10
export const LARGE_CAVE_MAX_LENGTH = 15
export const LARGE_CAVE_MIN_SEPARATION = 90
export const LARGE_CAVE_MIN_HOME_DIST = 110

const DEFAULT_COUNT = 10
const RING_MIN = 130
const RING_MAX = 620
const ATTEMPTS_PER_CAVE = 28
const SLOPE_SAMPLE_RADIUS = 4
const MIN_SLOPE_DROP = 0.85
const ROAD_CLEARANCE = 4
const ROAD_QUERY = 24
const MOUNTAIN_RIDGE_MAX = 0.55

function onRoad(
  x: number,
  z: number,
  roads: readonly RoadCorridorSegment[],
): boolean {
  for (const road of roads) {
    if (distanceToSegment(x, z, road.ax, road.az, road.bx, road.bz) < road.halfWidth + ROAD_CLEARANCE) {
      return true
    }
  }
  return false
}

function farFromVillages(x: number, z: number, villages: readonly VillageFootprint[]): boolean {
  for (const village of villages) {
    if (Math.hypot(x - village.x, z - village.z) < village.radius + 28) return false
  }
  return true
}

function farFromCaves(x: number, z: number, placed: readonly LargeCaveSite[]): boolean {
  for (const cave of placed) {
    if (Math.hypot(x - cave.x, z - cave.z) < LARGE_CAVE_MIN_SEPARATION) return false
  }
  return true
}

function siteOk(
  x: number,
  z: number,
  input: LargeCavePlacementInput,
  placed: readonly LargeCaveSite[],
): boolean {
  if (Math.hypot(x, z) < LARGE_CAVE_MIN_HOME_DIST) return false
  if (!farFromVillages(x, z, input.villages)) return false
  if (!farFromCaves(x, z, placed)) return false
  if (isCoastalPlacement(x, z, {
    sampleHeight: input.sampleHeight,
    waterLevel: input.waterLevel,
    sampleContinentalness: input.sampleContinentalness,
    coastThreshold: input.coastThreshold,
  })) return false
  if (input.sampleMountainRidge(x, z) > MOUNTAIN_RIDGE_MAX) return false
  if (onRoad(x, z, input.roadsNear(x, z, ROAD_QUERY))) return false
  return measureSlope(x, z, SLOPE_SAMPLE_RADIUS, input.sampleHeight).drop >= MIN_SLOPE_DROP
}

/**
 * Deterministic world-scale cave sites. Prefers sloped inland ground, keeps
 * clear of settlements/roads/coasts, and spreads caves apart (plan 090).
 */
export function pickLargeCaveSites(input: LargeCavePlacementInput): LargeCaveSite[] {
  const count = input.count ?? DEFAULT_COUNT
  const random = createSeededRandom(input.seed ^ 0xca7e51)
  const placed: LargeCaveSite[] = []

  for (let i = 0; i < count; i++) {
    let found: LargeCaveSite | null = null
    for (let attempt = 0; attempt < ATTEMPTS_PER_CAVE; attempt++) {
      const angle = random() * Math.PI * 2
      const dist = RING_MIN + random() * (RING_MAX - RING_MIN)
      const x = Math.cos(angle) * dist
      const z = Math.sin(angle) * dist
      if (!siteOk(x, z, input, placed)) continue
      const slope = measureSlope(x, z, SLOPE_SAMPLE_RADIUS, input.sampleHeight)
      found = {
        x,
        z,
        yaw: slope.yaw,
        length: LARGE_CAVE_MIN_LENGTH + random() * (LARGE_CAVE_MAX_LENGTH - LARGE_CAVE_MIN_LENGTH),
        variant: random(),
      }
      break
    }
    if (found) placed.push(found)
  }

  return placed
}

export function tunnelDirection(yaw: number): { dx: number, dz: number } {
  return { dx: -Math.sin(yaw), dz: -Math.cos(yaw) }
}

export function openingDirection(yaw: number): { dx: number, dz: number } {
  return { dx: Math.sin(yaw), dz: Math.cos(yaw) }
}
