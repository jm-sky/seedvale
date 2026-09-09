import type { CemeterySize } from '../settlement/props'
import type { CemeteryTerrainSampler, EnvironmentPlacement, VillageDisk } from './chunkEnvironment'
import type { ChunkCoord } from './chunkGrid'
import type { ChunkTileParams } from './chunkHeightmap'
import { villageSizeConfig } from '../settlement/families'
import { cellsWithinRadius, worldToCell } from '../settlement/settlementGenerator'
import { createSeededRandom } from '../world/parseSeed'
import {
  ABANDONED_SETTLEMENT_MIN_DISTANCE,
  activeTopologyNear,
  assignmentVariationSeed,
  CEMETERY_SETTLEMENT_GATHER_RADIUS,
  cemeteryAssignmentFromTopology,
  cemeteryIdForAbandoned,
  cemeteryIdForAssignment,
  type CemeterySettlementRef,
  type CemeteryTopologyIntent,
  makeSettlementRefPeek,
  type PeekSettlementRef,
} from './cemeteryAssignment'
import {
  CEMETERY_CLEARING_PAD,
  CEMETERY_INNER_FRAC,
  CEMETERY_OUTER_FRAC,
  cemeteryFitsVillageFringe,
  cemeteryFootprintClearsRoads,
} from './chunkEnvironment'
import { worldToChunk } from './chunkGrid'

const SLOPE_SAMPLE_STEP = 1.5
const ROAD_TINT_REJECT = 0.15
const SLOPE_REJECT_LANDMARK = 0.6
const CEMETERY_MARGIN_BY_SIZE: Record<CemeterySize, number> = { SM: 6, MD: 9, LG: 14 }
/** Rare deterministic wilderness roll — much lower than the old `0.28` fringe gate. */
export const ABANDONED_CEMETERY_CHANCE = 0.012

export type ResolvedCemeteryPlacement = {
  assignmentId: string
  servedSettlementIds: readonly string[]
  size: CemeterySize
  x: number
  z: number
  scale: number
  rotationY: number
  variant: number
  id: string
}

function hashString(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function slopeAt(terrain: CemeteryTerrainSampler, wx: number, wz: number): number {
  const d = SLOPE_SAMPLE_STEP
  return (
    (Math.abs(terrain.heightAt(wx + d, wz) - terrain.heightAt(wx - d, wz)) +
      Math.abs(terrain.heightAt(wx, wz + d) - terrain.heightAt(wx, wz - d))) /
    (2 * d)
  )
}

function clearingDisks(params: ChunkTileParams): VillageDisk[] {
  return params.clearings.map((c) => ({ x: c.x, z: c.z, radius: c.radius }))
}

function regionalDisks(params: ChunkTileParams): VillageDisk[] {
  return params.regional.map((r) => ({ x: r.x, z: r.z, radius: r.radius }))
}

function rejectsClearings(x: number, z: number, clearings: readonly VillageDisk[]): boolean {
  for (const clearing of clearings) {
    if (Math.hypot(x - clearing.x, z - clearing.z) <= clearing.radius + CEMETERY_CLEARING_PAD) return true
  }
  return false
}

function dedicatedFringePreference(
  settlement: CemeterySettlementRef,
  angle: number,
  fringeFraction: number,
): { x: number, z: number } {
  const radius = villageSizeConfig(settlement.size).footprintRadius
  const dist = radius * (CEMETERY_INNER_FRAC + (CEMETERY_OUTER_FRAC - CEMETERY_INNER_FRAC) * fringeFraction)
  return { x: settlement.x + Math.cos(angle) * dist, z: settlement.z + Math.sin(angle) * dist }
}

function sharedCorridorAnchor(a: CemeterySettlementRef, b: CemeterySettlementRef): { x: number, z: number } {
  return { x: (a.x + b.x) * 0.5, z: (a.z + b.z) * 0.5 }
}

function sharedCorridorAccepts(
  x: number,
  z: number,
  settlements: readonly CemeterySettlementRef[],
  clearings: readonly VillageDisk[],
): boolean {
  if (settlements.length < 2) return false
  const [a, b] = settlements
  const da = Math.hypot(x - a.x, z - a.z)
  const db = Math.hypot(x - b.x, z - b.z)
  const maxReach = Math.max(
    villageSizeConfig(a.size).footprintRadius,
    villageSizeConfig(b.size).footprintRadius,
  ) * CEMETERY_OUTER_FRAC * 1.35
  if (da > maxReach || db > maxReach) return false
  if (rejectsClearings(x, z, clearings)) return false
  return true
}

/** Shared physical cemetery validation for active/abandoned candidates. */
export function validateCemeteryPhysical(
  x: number,
  z: number,
  size: CemeterySize,
  scale: number,
  params: ChunkTileParams,
  terrain: CemeteryTerrainSampler,
  placementIntent: 'dedicated' | 'shared' | 'abandoned',
  assignmentSettlements: readonly CemeterySettlementRef[],
): boolean {
  const h = terrain.heightAt(x, z)
  if (h <= params.waterLevel + 0.3) return false
  if (terrain.roadTintAt(x, z) > ROAD_TINT_REJECT) return false
  if (slopeAt(terrain, x, z) > SLOPE_REJECT_LANDMARK) return false
  if (!cemeteryFootprintClearsRoads(x, z, size, scale, params.roadSegments)) return false

  const clearings = clearingDisks(params)
  const regional = regionalDisks(params)
  if (placementIntent === 'dedicated' && assignmentSettlements.length === 1) {
    if (!cemeteryFitsVillageFringe(x, z, regional, clearings)) return false
  } else if (placementIntent === 'shared') {
    if (!sharedCorridorAccepts(x, z, assignmentSettlements, clearings)) return false
  } else if (rejectsClearings(x, z, clearings)) {
    return false
  }

  const margin = CEMETERY_MARGIN_BY_SIZE[size]
  const half = params.chunkSize / 2
  const localX = x - params.cx * params.chunkSize
  const localZ = z - params.cz * params.chunkSize
  if (Math.abs(localX) > half - margin || Math.abs(localZ) > half - margin) return false
  return true
}

function* placementCandidates(
  topology: CemeteryTopologyIntent,
  worldSeed: number,
): Generator<{ x: number, z: number }> {
  const random = createSeededRandom(assignmentVariationSeed(worldSeed, topology.assignmentId) ^ 0x63d8a1)
  const baseAngle = random() * Math.PI * 2
  if (topology.intent === 'shared' && topology.settlements.length === 2) {
    const anchor = sharedCorridorAnchor(topology.settlements[0], topology.settlements[1])
    yield anchor
    for (let ring = 1; ring <= 6; ring++) {
      const count = 6 + ring * 2
      for (let i = 0; i < count; i++) {
        const t = (i / count) * Math.PI * 2
        const r = ring * 4 + random() * 2
        yield { x: anchor.x + Math.cos(t) * r, z: anchor.z + Math.sin(t) * r }
      }
    }
    return
  }
  const settlement = topology.settlements[0]!
  for (let ring = 0; ring <= 5; ring++) {
    const fringeFraction = ring / 5
    const angle = baseAngle + ring * 0.55
    const anchor = dedicatedFringePreference(settlement, angle, fringeFraction)
    yield anchor
    for (let i = 1; i <= 4; i++) {
      const spread = (i / 4) * 0.35
      yield dedicatedFringePreference(settlement, angle + spread, fringeFraction)
      yield dedicatedFringePreference(settlement, angle - spread, fringeFraction)
    }
  }
}

function dedicatedIntentFrom(settlement: CemeterySettlementRef): CemeteryTopologyIntent {
  return {
    assignmentId: `active:${settlement.id}`,
    servedSettlementIds: [settlement.id],
    settlements: [settlement],
    intent: 'dedicated',
  }
}

function tryPlaceTopology(
  topology: CemeteryTopologyIntent,
  params: ChunkTileParams,
  terrain: CemeteryTerrainSampler,
): ResolvedCemeteryPlacement | null {
  const assignment = cemeteryAssignmentFromTopology(topology, params.seed)
  const random = createSeededRandom(assignmentVariationSeed(params.seed, topology.assignmentId) ^ 0x41c2e7)
  const scale = 0.9 + random() * 0.3
  const rotationY = random() * Math.PI * 2
  const variant = random()
  const intent = topology.intent === 'shared' ? 'shared' : 'dedicated'
  for (const candidate of placementCandidates(topology, params.seed)) {
    if (
      !validateCemeteryPhysical(
        candidate.x,
        candidate.z,
        assignment.size,
        scale,
        params,
        terrain,
        intent,
        topology.settlements,
      )
    ) {
      continue
    }
    return {
      assignmentId: topology.assignmentId,
      servedSettlementIds: topology.servedSettlementIds,
      size: assignment.size,
      x: candidate.x,
      z: candidate.z,
      scale,
      rotationY,
      variant,
      id: cemeteryIdForAssignment(topology.assignmentId, params.seed),
    }
  }
  return null
}

const resolvedPlacementByAssignment = new Map<string, ResolvedCemeteryPlacement | null>()

export function clearCemeteryPlacementCaches(): void {
  resolvedPlacementByAssignment.clear()
}

function rememberPlacement(topology: CemeteryTopologyIntent, placed: ResolvedCemeteryPlacement | null): void {
  resolvedPlacementByAssignment.set(topology.assignmentId, placed)
}

/**
 * Resolve one assignment's winning placement — shared across chunk generation and catalog lookup.
 * @domain world-terrain
 */
export function resolvePlacementForTopology(
  topology: CemeteryTopologyIntent,
  params: ChunkTileParams,
  terrain: CemeteryTerrainSampler,
): ResolvedCemeteryPlacement | null {
  if (resolvedPlacementByAssignment.has(topology.assignmentId)) {
    return resolvedPlacementByAssignment.get(topology.assignmentId) ?? null
  }
  const placed = tryPlaceTopology(topology, params, terrain)
  if (placed) {
    rememberPlacement(topology, placed)
    return placed
  }
  if (topology.intent === 'shared' && topology.settlements.length === 2) {
    for (const settlement of topology.settlements) {
      const dedicated = dedicatedIntentFrom(settlement)
      const fallback = tryPlaceTopology(dedicated, params, terrain)
      if (fallback) {
        rememberPlacement(topology, fallback)
        return fallback
      }
    }
  }
  rememberPlacement(topology, null)
  return null
}

export function getCachedPlacementForAssignment(assignmentId: string): ResolvedCemeteryPlacement | null | undefined {
  return resolvedPlacementByAssignment.get(assignmentId)
}

export function resolvedPlacementToEnvironment(p: ResolvedCemeteryPlacement): EnvironmentPlacement {
  return {
    x: p.x,
    z: p.z,
    kind: 'cemetery',
    scale: p.scale,
    rotationY: p.rotationY,
    variant: p.variant,
    cemeterySize: p.size,
    id: p.id,
  }
}

function abandonedRoll(seed: number, cx: number, cz: number): number {
  return createSeededRandom(seed ^ hashString(`${cx},${cz}:abandoned`))()
}

function isTooNearAnySettlement(x: number, z: number, peekRef: PeekSettlementRef): boolean {
  const center = worldToCell(x, z)
  for (const cell of cellsWithinRadius(center, 2)) {
    const ref = peekRef(cell)
    if (!ref) continue
    if (Math.hypot(ref.x - x, ref.z - z) < ABANDONED_SETTLEMENT_MIN_DISTANCE) return true
  }
  return false
}

export function resolveAbandonedCemeteryForChunk(
  coord: ChunkCoord,
  params: ChunkTileParams,
  terrain: CemeteryTerrainSampler,
): EnvironmentPlacement | null {
  if (abandonedRoll(params.seed, coord.cx, coord.cz) > ABANDONED_CEMETERY_CHANCE) return null

  const peekRef = makeSettlementRefPeek(params.cemeterySettlements ?? [])
  const { chunkSize, seed } = params
  const half = chunkSize / 2
  const random = createSeededRandom(seed ^ hashString(`abandoned:${coord.cx},${coord.cz}`))
  const size: CemeterySize = random() < 0.7 ? 'SM' : 'MD'
  const margin = CEMETERY_MARGIN_BY_SIZE[size]
  const scale = 0.9 + random() * 0.3
  const rotationY = random() * Math.PI * 2
  const variant = random()

  for (let attempt = 0; attempt < 12; attempt++) {
    const wx = coord.cx * chunkSize + (random() * 2 - 1) * (half - margin)
    const wz = coord.cz * chunkSize + (random() * 2 - 1) * (half - margin)
    if (
      !validateCemeteryPhysical(wx, wz, size, scale, params, terrain, 'abandoned', []) ||
      isTooNearAnySettlement(wx, wz, peekRef)
    ) {
      continue
    }
    return {
      x: wx,
      z: wz,
      kind: 'cemetery',
      scale,
      rotationY,
      variant,
      cemeterySize: size,
      id: cemeteryIdForAbandoned(coord.cx, coord.cz, 0, seed),
    }
  }
  return null
}

/** Which chunk owns a resolved placement point. */
export function placementOwnerChunk(x: number, z: number, chunkSize: number): ChunkCoord {
  return worldToChunk(x, z, chunkSize)
}

/**
 * Assignment-driven cemetery resolution for one chunk — active assignments first, then abandoned.
 * @domain world-terrain
 */
export function resolveCemeteriesForChunk(
  coord: ChunkCoord,
  params: ChunkTileParams,
  terrain: CemeteryTerrainSampler,
): EnvironmentPlacement[] {
  const peekRef = makeSettlementRefPeek(params.cemeterySettlements ?? [])
  const { x: centerX, z: centerZ } = { x: coord.cx * params.chunkSize, z: coord.cz * params.chunkSize }
  const topologies = activeTopologyNear(centerX, centerZ, CEMETERY_SETTLEMENT_GATHER_RADIUS, peekRef)
  const placements: EnvironmentPlacement[] = []
  const seenIds = new Set<string>()

  for (const topology of topologies) {
    const resolved = resolvePlacementForTopology(topology, params, terrain)
    if (!resolved) continue
    const owner = placementOwnerChunk(resolved.x, resolved.z, params.chunkSize)
    if (owner.cx !== coord.cx || owner.cz !== coord.cz) continue
    if (seenIds.has(resolved.id)) continue
    seenIds.add(resolved.id)
    placements.push(resolvedPlacementToEnvironment(resolved))
  }

  const abandoned = resolveAbandonedCemeteryForChunk(coord, params, terrain)
  if (abandoned?.id && !seenIds.has(abandoned.id)) placements.push(abandoned)
  return placements
}

/** First cemetery placement in a chunk, if any — used by unloaded landmark lookup. */
export function resolveCemeteryPlacement(
  coord: ChunkCoord,
  params: ChunkTileParams,
  terrain: CemeteryTerrainSampler,
): EnvironmentPlacement | null {
  const all = resolveCemeteriesForChunk(coord, params, terrain)
  return all[0] ?? null
}
