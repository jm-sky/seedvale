import type { LandmarkKind } from '../terrain/chunkEnvironment'
import type { WorldKnowledgeResearch } from '../world/locations/worldKnowledgeResearch'
import type { QuestWorldKnowledgeResolver } from './QuestManager'
import type { QuestDef, QuestWorldKnowledgeRef } from './quests'
import { cellFromId } from '../settlement/settlementGenerator'
import { describeLandmarkLocation } from './landmarkLocationDescription'

export type QuestWorldKnowledgeResolverHost = {
  chunkManager: {
    findLandmarkNear: (
      kind: LandmarkKind,
      worldX: number,
      worldZ: number,
      maxChunkRadius: number,
    ) => { id: string, x: number, z: number } | undefined
  }
  settlementsManager: {
    getHomeDef: () => { id: string, x: number, z: number, name: string }
    peekDef: (cell: { gx: number, gz: number }) => { id: string, x: number, z: number, name: string } | null
  }
}

export type ChronicleSearchKnowledgeSite = {
  ruinsLandmarkId: string
  ruinsX: number
  ruinsZ: number
  archaeologistSettlementId: string
  archaeologistSettlementName: string
}

/**
 * Composition-root world-knowledge resolver. Lookup goes through the shared
 * worker-backed research service; this adapter only maps quest slots onto
 * data-only queries and presentation (plan quests-progression-047).
 *
 * @domain quests-progression
 */
export function createQuestWorldKnowledgeResolver(input: {
  getHost: () => QuestWorldKnowledgeResolverHost
  getDefs: () => readonly QuestDef[]
  searchRadius: number
  chunkSize: number
  getChronicleSearch: () => ChronicleSearchKnowledgeSite | null
  research: WorldKnowledgeResearch
}): QuestWorldKnowledgeResolver {
  const settlementOrigin = (settlementId: string | undefined): { x: number, z: number, name: string } => {
    const host = input.getHost()
    const home = host.settlementsManager.getHomeDef()
    if (!settlementId || settlementId === home.id) return home
    const cell = cellFromId(settlementId)
    const peeked = cell ? host.settlementsManager.peekDef(cell) : null
    return peeked ?? home
  }

  const poseFor = (ref: QuestWorldKnowledgeRef, settlementId: string | undefined): { x: number, z: number } => {
    if (typeof ref.x === 'number' && typeof ref.z === 'number') return { x: ref.x, z: ref.z }
    const chronicle = input.getChronicleSearch()
    if (chronicle && ref.landmarkId === chronicle.ruinsLandmarkId) {
      return { x: chronicle.ruinsX, z: chronicle.ruinsZ }
    }
    const origin = settlementOrigin(settlementId)
    const approx = approxLandmarkChunkCenter(ref.landmarkId, input.chunkSize)
    return approx ?? origin
  }

  return {
    resolve(questId, knowledgeId) {
      const def = input.getDefs().find((entry) => entry.id === questId)
      const slot = def?.worldKnowledge?.find((entry) => entry.id === knowledgeId)
      if (!def || !slot || slot.bind.type !== 'landmark') return Promise.resolve(null)
      if (slot.bind.landmarkId) {
        const chronicle = input.getChronicleSearch()
        const pose = chronicle && slot.bind.landmarkId === chronicle.ruinsLandmarkId
          ? { x: chronicle.ruinsX, z: chronicle.ruinsZ }
          : undefined
        return Promise.resolve({
          kind: 'landmark',
          landmarkId: slot.bind.landmarkId,
          landmarkKind: slot.bind.kind,
          ...pose,
        })
      }
      const origin = settlementOrigin(def.settlementId)
      const kind = slot.bind.kind
      return input.research.resolve({
        kind: 'nearest-landmark',
        landmarkKinds: [kind],
        originX: origin.x,
        originZ: origin.z,
        maxChunkRadius: input.searchRadius,
      }).then((found) => {
        if (!found) return null
        return {
          kind: 'landmark' as const,
          landmarkId: found.id,
          landmarkKind: found.kind,
          x: found.x,
          z: found.z,
        }
      })
    },
    describe(ref, context) {
      if (ref.kind !== 'landmark') return null
      const origin = settlementOrigin(context.settlementId)
      const pose = poseFor(ref, context.settlementId)
      return describeLandmarkLocation({
        landmarkKind: ref.landmarkKind,
        landmarkX: pose.x,
        landmarkZ: pose.z,
        originX: origin.x,
        originZ: origin.z,
        settlementName: origin.name,
      })
    },
  }
}

function approxLandmarkChunkCenter(landmarkId: string, chunkSize: number): { x: number, z: number } | null {
  const parts = landmarkId.split(':')
  if (parts.length < 5) return null
  const cx = Number(parts[1])
  const cz = Number(parts[2])
  if (!Number.isInteger(cx) || !Number.isInteger(cz)) return null
  return { x: (cx + 0.5) * chunkSize, z: (cz + 0.5) * chunkSize }
}
