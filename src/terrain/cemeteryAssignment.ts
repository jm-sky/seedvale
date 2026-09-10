import type { VillageSize } from '../settlement/families'
import type { CemeterySize } from '../settlement/props'
import {
  cellFromId,
  cellSeed,
  cellsWithinRadius,
  SETTLEMENT_GRID_STEP,
  type SettlementCell,
  type SettlementDef,
  worldToCell,
} from '../settlement/settlementGenerator'
import { createSeededRandom } from '../world/parseSeed'

/** Lightweight settlement view for worker-safe cemetery assignment/placement. */
export type CemeterySettlementRef = {
  id: string
  gx: number
  gz: number
  x: number
  z: number
  size: VillageSize
}

export type CemeteryAssignmentIntent = 'dedicated' | 'shared'

/** Topology-level cemetery assignment before terrain placement is resolved. */
export type CemeteryTopologyIntent = {
  assignmentId: string
  servedSettlementIds: readonly string[]
  settlements: readonly CemeterySettlementRef[]
  intent: CemeteryAssignmentIntent
}

export type CemeteryAssignment = CemeteryTopologyIntent & {
  size: CemeterySize
}

export type PeekSettlementDef = (cell: SettlementCell) => SettlementDef | null
export type PeekSettlementRef = (cell: SettlementCell) => CemeterySettlementRef | null

export function makeSettlementRefPeek(refs: readonly CemeterySettlementRef[]): PeekSettlementRef {
  const map = new Map(refs.map((r) => [`${r.gx}_${r.gz}`, r]))
  return (cell) => map.get(`${cell.gx}_${cell.gz}`) ?? null
}

/** Chebyshev grid radius for local `SM` sharing candidacy (plan §6). */
export const SM_SHARING_CELL_RADIUS = 1
/** Max world distance two `SM` settlements may be apart to share (plan §6). */
export const SM_SHARING_MAX_DISTANCE = SETTLEMENT_GRID_STEP * 1.15
/** Grid radius around a chunk center when gathering settlement refs for placement. */
export const CEMETERY_SETTLEMENT_GATHER_RADIUS = 2
/** Wilderness abandoned cemeteries must stay at least this far from live settlements. */
export const ABANDONED_SETTLEMENT_MIN_DISTANCE = SETTLEMENT_GRID_STEP * 0.75

const topologyCache = new Map<string, CemeteryTopologyIntent>()

/** Drop runtime cemetery caches on world rebuild — same lifetime as road/settlement caches. */
export function clearCemeteryCaches(): void {
  topologyCache.clear()
}

export function settlementRefFromDef(def: SettlementDef): CemeterySettlementRef {
  return { id: def.id, gx: def.gx, gz: def.gz, x: def.x, z: def.z, size: def.size }
}

export function collectSettlementRefsNear(
  worldX: number,
  worldZ: number,
  radiusCells: number,
  peekDef: PeekSettlementDef,
): CemeterySettlementRef[] {
  const center = worldToCell(worldX, worldZ)
  const out: CemeterySettlementRef[] = []
  for (const cell of cellsWithinRadius(center, radiusCells)) {
    const def = peekDef(cell)
    if (!def) continue
    out.push(settlementRefFromDef(def))
  }
  out.sort((a, b) => a.id.localeCompare(b.id))
  return out
}

function hashString(value: string): number {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function canonicalSettlementTuple(ids: readonly string[]): string {
  return [...ids].sort((a, b) => a.localeCompare(b)).join('+')
}

/** Stable assignment identity from served settlement ids (1 or 2). */
export function cemeteryAssignmentId(servedSettlementIds: readonly string[]): string {
  return `active:${canonicalSettlementTuple(servedSettlementIds)}`
}

/** Stable cemetery landmark id for an active assignment (plan §18). */
export function cemeteryIdForAssignment(assignmentId: string, worldSeed: number): string {
  const h = hashString(`${worldSeed}:${assignmentId}:cemetery`) >>> 0
  return `cemetery:a:${assignmentId.slice('active:'.length)}:${h.toString(36)}`
}

/** Stable cemetery landmark id for a wilderness abandoned roll in one chunk. */
export function cemeteryIdForAbandoned(cx: number, cz: number, ordinal: number, worldSeed: number): string {
  const h = hashString(`${worldSeed}:abandoned:${cx}:${cz}:${ordinal}`) >>> 0
  return `cemetery:w:${cx}:${cz}:${ordinal}:${h.toString(36)}`
}

export function isLegacyCemeteryId(id: string): boolean {
  const parts = id.split(':')
  return parts.length === 5 && parts[0] === 'cemetery' && parts[1] !== 'a' && parts[1] !== 'w'
}

export function isAbandonedCemeteryId(id: string): boolean {
  return id.startsWith('cemetery:w:')
}

function eligibleSmPartner(self: CemeterySettlementRef, other: CemeterySettlementRef): boolean {
  if (other.id === self.id) return false
  if (other.size !== 'SM' || self.size !== 'SM') return false
  const cellDist = Math.max(Math.abs(other.gx - self.gx), Math.abs(other.gz - self.gz))
  if (cellDist > SM_SHARING_CELL_RADIUS) return false
  return Math.hypot(other.x - self.x, other.z - self.z) <= SM_SHARING_MAX_DISTANCE
}

function rankSmPartners(self: CemeterySettlementRef, candidates: readonly CemeterySettlementRef[]): CemeterySettlementRef[] {
  return candidates
    .filter((c) => eligibleSmPartner(self, c))
    .sort((a, b) => {
      const da = Math.hypot(a.x - self.x, a.z - self.z)
      const db = Math.hypot(b.x - self.x, b.z - self.z)
      if (da !== db) return da - db
      return a.id.localeCompare(b.id)
    })
}

function refsAround(self: CemeterySettlementRef, peekRef: PeekSettlementRef): CemeterySettlementRef[] {
  const nearby: CemeterySettlementRef[] = []
  for (const cell of cellsWithinRadius({ gx: self.gx, gz: self.gz }, SM_SHARING_CELL_RADIUS)) {
    const ref = peekRef(cell)
    if (ref) nearby.push(ref)
  }
  return nearby
}

/** Mutual-best local `SM` pairing — order-independent (plan §6, implementation notes). */
export function resolveSmSharePartner(
  self: CemeterySettlementRef,
  peekRef: PeekSettlementRef,
): CemeterySettlementRef | null {
  if (self.size !== 'SM') return null
  const ranked = rankSmPartners(self, refsAround(self, peekRef))
  const best = ranked[0]
  if (!best) return null
  const reverse = rankSmPartners(best, refsAround(best, peekRef))
  return reverse[0]?.id === self.id ? best : null
}

/** Dedicated assignment for one settlement — also the shared-placement fallback. */
export function dedicatedCemeteryTopology(def: CemeterySettlementRef): CemeteryTopologyIntent {
  const served = [def.id]
  return {
    assignmentId: cemeteryAssignmentId(served),
    servedSettlementIds: served,
    settlements: [def],
    intent: 'dedicated',
  }
}

function sharedIntent(a: CemeterySettlementRef, b: CemeterySettlementRef): CemeteryTopologyIntent {
  const served = [a.id, b.id].sort((x, y) => x.localeCompare(y))
  const settlements = served[0] === a.id ? [a, b] : [b, a]
  return {
    assignmentId: cemeteryAssignmentId(served),
    servedSettlementIds: served,
    settlements,
    intent: 'shared',
  }
}

/**
 * Deterministic topology intent for one settlement — pairing before terrain placement.
 * @domain world-terrain
 */
export function resolveCemeteryTopologyForSettlement(
  settlementId: string,
  peekRef: PeekSettlementRef,
): CemeteryTopologyIntent | null {
  if (topologyCache.has(settlementId)) return topologyCache.get(settlementId)!
  const cell = cellFromId(settlementId)
  if (!cell) return null
  const self = peekRef(cell)
  if (!self || self.id !== settlementId) return null
  let intent: CemeteryTopologyIntent
  if (self.size === 'SM') {
    const partner = resolveSmSharePartner(self, peekRef)
    intent = partner ? sharedIntent(self, partner) : dedicatedCemeteryTopology(self)
  } else {
    intent = dedicatedCemeteryTopology(self)
  }
  for (const id of intent.servedSettlementIds) topologyCache.set(id, intent)
  return intent
}

/** Deterministic cemetery layout size from served settlement scale (plan §12). */
export function rollCemeterySizeForAssignment(
  servedSizes: readonly VillageSize[],
  worldSeed: number,
  assignmentId: string,
): CemeterySize {
  const random = createSeededRandom(hashString(`${worldSeed}:${assignmentId}:size`))
  if (servedSizes.length >= 2) return random() < 0.55 ? 'SM' : 'MD'
  const size = servedSizes[0] ?? 'SM'
  switch (size) {
    case 'LG':
      return random() < 0.58 ? 'MD' : 'LG'
    case 'MD':
      return random() < 0.62 ? 'MD' : 'LG'
    case 'OUTPOST':
    case 'SM':
      return random() < 0.72 ? 'SM' : 'MD'
    case 'XL':
      return random() < 0.68 ? 'LG' : 'MD'
    default:
      return 'SM'
  }
}

export function cemeteryAssignmentFromTopology(
  topology: CemeteryTopologyIntent,
  worldSeed: number,
): CemeteryAssignment {
  return {
    ...topology,
    size: rollCemeterySizeForAssignment(
      topology.settlements.map((s) => s.size),
      worldSeed,
      topology.assignmentId,
    ),
  }
}

export function assignmentVariationSeed(worldSeed: number, assignmentId: string): number {
  return cellSeed(worldSeed, { gx: hashString(assignmentId) & 0xffff, gz: (hashString(assignmentId) >>> 16) & 0xffff })
}

/**
 * Canonical reverse lookup: cemetery id → served settlement ids (`[]` for abandoned).
 * @domain world-terrain
 */
export function servedSettlementIdsForCemeteryId(cemeteryId: string): readonly string[] {
  if (isAbandonedCemeteryId(cemeteryId) || isLegacyCemeteryId(cemeteryId)) return []
  if (!cemeteryId.startsWith('cemetery:a:')) return []
  const body = cemeteryId.slice('cemetery:a:'.length)
  const lastColon = body.lastIndexOf(':')
  if (lastColon < 0) return []
  const tuple = body.slice(0, lastColon)
  if (!tuple) return []
  return tuple.split('+')
}

/** All unique active topology intents touching settlements near `(worldX, worldZ)`. */
export function activeTopologyNear(
  worldX: number,
  worldZ: number,
  radiusCells: number,
  peekRef: PeekSettlementRef,
): CemeteryTopologyIntent[] {
  const refs: CemeterySettlementRef[] = []
  const center = worldToCell(worldX, worldZ)
  for (const cell of cellsWithinRadius(center, radiusCells)) {
    const ref = peekRef(cell)
    if (ref) refs.push(ref)
  }
  refs.sort((a, b) => a.id.localeCompare(b.id))
  const seen = new Set<string>()
  const out: CemeteryTopologyIntent[] = []
  for (const ref of refs) {
    const intent = resolveCemeteryTopologyForSettlement(ref.id, peekRef)
    if (!intent || seen.has(intent.assignmentId)) continue
    seen.add(intent.assignmentId)
    out.push(intent)
  }
  return out
}

