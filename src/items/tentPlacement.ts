import type { RoadCorridorSegment } from '../terrain/chunkHeightmap'
import { distanceToSegment } from '../math/segment'
import { TENT_FOOTPRINT_RADIUS } from './tentProp'

export type TentPlacementReason =
  | 'ok'
  | 'water'
  | 'slope'
  | 'road'
  | 'object'
  | 'tent'

export type TentPlacementInput = {
  x: number
  z: number
  sampleHeight: (x: number, z: number) => number
  waterLevel: number
  roads: readonly RoadCorridorSegment[]
  /** Nearby blocking points (trees, houses, wells, other tents). */
  blockers: readonly { x: number, z: number, radius: number }[]
  otherTents: readonly { x: number, z: number }[]
}

const WATER_MARGIN = 0.8
const SLOPE_SAMPLE = 1.6
const SLOPE_MAX_DELTA = 0.45
const ROAD_CLEARANCE = 1.2
const TENT_SEPARATION = TENT_FOOTPRINT_RADIUS * 2.2

function maxSlopeDelta(
  x: number,
  z: number,
  sampleHeight: (x: number, z: number) => number,
): number {
  const y = sampleHeight(x, z)
  const step = SLOPE_SAMPLE
  return Math.max(
    Math.abs(sampleHeight(x + step, z) - y),
    Math.abs(sampleHeight(x - step, z) - y),
    Math.abs(sampleHeight(x, z + step) - y),
    Math.abs(sampleHeight(x, z - step) - y),
  )
}

function onRoad(x: number, z: number, roads: readonly RoadCorridorSegment[]): boolean {
  for (const road of roads) {
    const dist = distanceToSegment(x, z, road.ax, road.az, road.bx, road.bz)
    if (dist < road.halfWidth + ROAD_CLEARANCE) return true
  }
  return false
}

/** Suitability for pitching a tent at (x, z). Pure — no Three.js. */
export function evaluateTentPlacement(input: TentPlacementInput): TentPlacementReason {
  const { x, z, sampleHeight, waterLevel } = input
  if (sampleHeight(x, z) <= waterLevel + WATER_MARGIN) return 'water'
  if (maxSlopeDelta(x, z, sampleHeight) > SLOPE_MAX_DELTA) return 'slope'
  if (onRoad(x, z, input.roads)) return 'road'
  for (const tent of input.otherTents) {
    if (Math.hypot(tent.x - x, tent.z - z) < TENT_SEPARATION) return 'tent'
  }
  for (const blocker of input.blockers) {
    if (Math.hypot(blocker.x - x, blocker.z - z) < blocker.radius + TENT_FOOTPRINT_RADIUS) {
      return 'object'
    }
  }
  return 'ok'
}

export const TENT_PLACEMENT_MESSAGE: Record<Exclude<TentPlacementReason, 'ok'>, string> = {
  water: 'Tu jest za mokro na namiot.',
  slope: 'Teren jest zbyt stromy.',
  road: 'Nie rozstawiaj namiotu na drodze.',
  object: 'Za mało miejsca — coś stoi w pobliżu.',
  tent: 'Tu już stoi namiot.',
}
