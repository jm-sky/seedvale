import type { SettlementCell, SettlementDef } from '../../settlement/settlementGenerator'
import type { LandmarkKind } from '../../terrain/chunkEnvironment'
import type {
  OpportunityNpc,
  RpgQuestMatrixId,
  RpgQuestOpportunity,
} from './worldQuestOpportunityTypes'
import { cellsWithinRadius } from '../../settlement/settlementGenerator'

export const RPG_QUEST_PREFIX = 'rpg:'

/**
 * Landmark kinds `Sekret starego miejsca` may bind to. Cemetery is omitted
 * so the matrix does not collide with burial/grave-visit identity.
 *
 * @domain quests-progression
 */
export const OLD_PLACE_LANDMARK_KINDS: readonly LandmarkKind[] = [
  'smallRuins',
  'ruins',
  'monolith',
  'stoneCircle',
]

/**
 * Bounded neighbor-settlement pool for RPG matrices — same count
 * `SettlementsManager` eagerly streams, so the player can actually reach
 * the giver without a full-world NPC scan.
 *
 * @domain quests-progression
 */
export const RPG_NEIGHBOR_SETTLEMENT_LIMIT = 2

export type RpgLandmarkRef = {
  id: string
  kind: LandmarkKind
}

export type RpgSettlementRef = {
  id: string
  name: string
  x: number
  z: number
  npcs: readonly OpportunityNpc[]
}

export type RpgCollectInput = {
  settlementId: string
  settlementX: number
  settlementZ: number
  npcs: readonly OpportunityNpc[]
  landmarks: readonly RpgLandmarkRef[]
  occupiedLandmarkIds?: ReadonlySet<string>
  otherSettlements: readonly RpgSettlementRef[]
  persistedQuestIds?: readonly string[]
}

const MATRIX_IDS: readonly RpgQuestMatrixId[] = [
  'old-place-secret',
  'suspicious-transport',
  'settlement-agreement',
]

const SETTLEMENT_ID_RE = /^-?\d+_-?\d+$/

/**
 * Stable generated RPG quest id: `rpg:<matrixId>:<settlementId>:<sourceId>`.
 *
 * @domain quests-progression
 */
export function rpgQuestId(matrixId: RpgQuestMatrixId, settlementId: string, sourceId: string): string {
  return `${RPG_QUEST_PREFIX}${matrixId}:${settlementId}:${sourceId}`
}

export function parseRpgQuestId(questId: string): {
  matrixId: RpgQuestMatrixId
  settlementId: string
  sourceId: string
} | null {
  if (!questId.startsWith(RPG_QUEST_PREFIX)) return null
  const rest = questId.slice(RPG_QUEST_PREFIX.length)
  const matrixId = MATRIX_IDS.find((id) => rest.startsWith(`${id}:`))
  if (!matrixId) return null
  const afterMatrix = rest.slice(matrixId.length + 1)
  const colon = afterMatrix.indexOf(':')
  if (colon <= 0) return null
  const settlementId = afterMatrix.slice(0, colon)
  const sourceId = afterMatrix.slice(colon + 1)
  if (!SETTLEMENT_ID_RE.test(settlementId) || sourceId.length === 0) return null
  return { matrixId, settlementId, sourceId }
}

/**
 * Adult residents in flattened family order. Children are not givers or
 * choice targets.
 *
 * @domain quests-progression
 */
export function adultOpportunityNpcs(npcs: readonly OpportunityNpc[]): OpportunityNpc[] {
  const adults = npcs.filter((npc) => !npc.child)
  return adults.length > 0 ? [...adults] : []
}

function rpgOpportunity(
  matrixId: RpgQuestMatrixId,
  settlementId: string,
  sourceId: string,
): RpgQuestOpportunity {
  return {
    id: rpgQuestId(matrixId, settlementId, sourceId),
    settlementId,
    kind: 'rpg-matrix',
    matrixId,
    sourceId,
  }
}

/**
 * `Sekret starego miejsca` — one real nearby landmark, or not eligible.
 *
 * @domain quests-progression
 * @role Collects a lightweight RPG candidate bound to a real landmark id.
 */
export function collectOldPlaceSecretCandidate(input: {
  settlementId: string
  landmarks: readonly RpgLandmarkRef[]
  occupiedLandmarkIds?: ReadonlySet<string>
}): RpgQuestOpportunity | undefined {
  const occupied = input.occupiedLandmarkIds
  const eligible = input.landmarks.filter((landmark) => {
    if (!OLD_PLACE_LANDMARK_KINDS.includes(landmark.kind)) return false
    if (occupied?.has(landmark.id)) return false
    return true
  })
  const chosen = eligible[0]
  if (!chosen) return undefined
  return rpgOpportunity('old-place-secret', input.settlementId, chosen.id)
}

/**
 * `Podejrzany transport` — same-settlement mystery + choice between two
 * real adults. No quest-owned parcel or economy transfer.
 *
 * @domain quests-progression
 * @role Collects a lightweight RPG candidate bound to a counterpart NPC id.
 */
export function collectSuspiciousTransportCandidate(input: {
  settlementId: string
  npcs: readonly OpportunityNpc[]
}): RpgQuestOpportunity | undefined {
  const adults = adultOpportunityNpcs(input.npcs)
  if (adults.length < 2) return undefined
  const giver = adults.find((npc) => npc.role === 'trader') ?? adults[0]!
  const remaining = adults.filter((npc) => npc.id !== giver.id)
  const counterpart = remaining.find((npc) => npc.role === 'guard') ?? remaining[0]
  if (!counterpart) return undefined
  return rpgOpportunity('suspicious-transport', input.settlementId, counterpart.id)
}

function distanceSq(
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = ax - bx
  const dz = az - bz
  return dx * dx + dz * dz
}

/**
 * `Umowa między osadami` — giver settlement plus a different settlement's
 * NPC, chosen from definition refs (not streamed agents).
 *
 * @domain quests-progression
 * @role Collects a lightweight RPG candidate bound to a target settlement id.
 */
export function collectSettlementAgreementCandidate(input: {
  settlementId: string
  settlementX: number
  settlementZ: number
  npcs: readonly OpportunityNpc[]
  otherSettlements: readonly RpgSettlementRef[]
}): RpgQuestOpportunity | undefined {
  if (adultOpportunityNpcs(input.npcs).length === 0) return undefined
  const eligible = input.otherSettlements
    .filter((settlement) => settlement.id !== input.settlementId)
    .filter((settlement) => adultOpportunityNpcs(settlement.npcs).length > 0)
    .slice()
    .sort((a, b) => {
      const da = distanceSq(input.settlementX, input.settlementZ, a.x, a.z)
      const db = distanceSq(input.settlementX, input.settlementZ, b.x, b.z)
      return da - db || a.id.localeCompare(b.id)
    })
  const target = eligible[0]
  if (!target) return undefined
  return rpgOpportunity('settlement-agreement', input.settlementId, target.id)
}

function reconstructRpgOpportunity(parsed: {
  matrixId: RpgQuestMatrixId
  settlementId: string
  sourceId: string
}): RpgQuestOpportunity {
  return rpgOpportunity(parsed.matrixId, parsed.settlementId, parsed.sourceId)
}

/**
 * Live RPG candidates plus persisted generated ids for the same settlement,
 * so an accepted/completed matrix rematerializes after save/load.
 *
 * @domain quests-progression
 * @system settlement-quest-opportunities
 * @role Collects RPG matrix candidates without building QuestDefs.
 */
export function collectRpgQuestOpportunities(input: RpgCollectInput): RpgQuestOpportunity[] {
  const byId = new Map<string, RpgQuestOpportunity>()
  const live = [
    collectOldPlaceSecretCandidate(input),
    collectSuspiciousTransportCandidate(input),
    collectSettlementAgreementCandidate(input),
  ]
  for (const opportunity of live) {
    if (opportunity) byId.set(opportunity.id, opportunity)
  }
  for (const questId of input.persistedQuestIds ?? []) {
    const parsed = parseRpgQuestId(questId)
    if (!parsed) continue
    if (parsed.settlementId !== input.settlementId) continue
    if (byId.has(questId)) continue
    byId.set(questId, reconstructRpgOpportunity(parsed))
  }
  return [...byId.values()]
}

/**
 * Nearest other settlements by definition, independent of stream/camera.
 *
 * @domain quests-progression
 */
export function nearbyRpgSettlementDefs(
  home: Pick<SettlementDef, 'gx' | 'gz' | 'id' | 'x' | 'z'>,
  peekDef: (cell: SettlementCell) => SettlementDef | null,
  limit: number = RPG_NEIGHBOR_SETTLEMENT_LIMIT,
): SettlementDef[] {
  const origin: SettlementCell = { gx: home.gx, gz: home.gz }
  const defs: SettlementDef[] = []
  for (const cell of cellsWithinRadius(origin, 1)) {
    if (cell.gx === origin.gx && cell.gz === origin.gz) continue
    const def = peekDef(cell)
    if (def) defs.push(def)
  }
  defs.sort((a, b) => {
    const da = distanceSq(home.x, home.z, a.x, a.z)
    const db = distanceSq(home.x, home.z, b.x, b.z)
    return da - db || a.id.localeCompare(b.id)
  })
  return defs.slice(0, limit)
}
