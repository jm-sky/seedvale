import type { NpcId } from '../settlement/npcState'
import type { ExpeditionDestinationRef } from './expedition'
import {
  createExpeditionAssignmentRecord,
  type ExpeditionAssignment,
  expeditionAssignmentIncludesNpc,
  expeditionDestinationsEqual,
  isExpeditionAssignmentActive,
  markExpeditionAssignmentProvisioned,
  markExpeditionAssignmentReady,
} from './expeditionAssignment'

export type CreateExpeditionAssignmentParams = {
  sponsorSettlementId: string
  destination: ExpeditionDestinationRef
  memberNpcIds: readonly [NpcId, NpcId, NpcId]
  createdAtDays: number
}

/**
 * World-owned runtime store for expedition party assignments (plan
 * settlements-npcs-027). Plain data, no tick, no travel. Seeded via
 * `createExpeditionAssignments(initial)` for save/load and WorldBundle rebuild.
 *
 * @domain settlements-npcs
 */
export type ExpeditionAssignments = {
  list: () => readonly ExpeditionAssignment[]
  find: (id: string) => ExpeditionAssignment | undefined
  findActiveByNpc: (npcId: NpcId) => ExpeditionAssignment | undefined
  findActiveBySponsorAndDestination: (
    sponsorSettlementId: string,
    destination: ExpeditionDestinationRef,
  ) => ExpeditionAssignment | undefined
  listReady: () => readonly ExpeditionAssignment[]
  createForming: (params: CreateExpeditionAssignmentParams) => ExpeditionAssignment | null
  markProvisioned: (id: string, atDays: number) => ExpeditionAssignment | null
  markReady: (id: string, atDays: number) => ExpeditionAssignment | null
  dispose: () => void
}

let nextExpeditionAssignmentId = 0

export function createExpeditionAssignments(
  initial: readonly ExpeditionAssignment[] = [],
): ExpeditionAssignments {
  const records: ExpeditionAssignment[] = [...initial]

  const indexOf = (id: string): number => records.findIndex((r) => r.id === id)

  const nextId = (): string => {
    let id: string
    do {
      id = `expeditionAssignment:${Date.now()}:${nextExpeditionAssignmentId++}`
    } while (indexOf(id) !== -1)
    return id
  }

  const findActiveByNpc = (npcId: NpcId): ExpeditionAssignment | undefined => {
    for (const record of records) {
      if (isExpeditionAssignmentActive(record.state) && expeditionAssignmentIncludesNpc(record, npcId)) {
        return record
      }
    }
    return undefined
  }

  const findActiveBySponsorAndDestination = (
    sponsorSettlementId: string,
    destination: ExpeditionDestinationRef,
  ): ExpeditionAssignment | undefined => {
    for (const record of records) {
      if (
        isExpeditionAssignmentActive(record.state) &&
        record.sponsorSettlementId === sponsorSettlementId &&
        expeditionDestinationsEqual(record.destination, destination)
      ) {
        return record
      }
    }
    return undefined
  }

  const replace = (id: string, updated: ExpeditionAssignment | null): ExpeditionAssignment | null => {
    if (!updated) return null
    const index = indexOf(id)
    if (index === -1) return null
    records[index] = updated
    return updated
  }

  return {
    list: () => records,
    find: (id) => records.find((r) => r.id === id),
    findActiveByNpc,
    findActiveBySponsorAndDestination,
    listReady: () => records.filter((r) => r.state === 'ready'),
    createForming(params) {
      const unique = new Set(params.memberNpcIds)
      if (unique.size !== 3) return null
      for (const npcId of params.memberNpcIds) {
        if (findActiveByNpc(npcId)) return null
      }
      if (findActiveBySponsorAndDestination(params.sponsorSettlementId, params.destination)) return null
      const record = createExpeditionAssignmentRecord({
        id: nextId(),
        sponsorSettlementId: params.sponsorSettlementId,
        destination: params.destination,
        memberNpcIds: params.memberNpcIds,
        createdAtDays: params.createdAtDays,
      })
      records.push(record)
      return record
    },
    markProvisioned(id, atDays) {
      const index = indexOf(id)
      if (index === -1) return null
      return replace(id, markExpeditionAssignmentProvisioned(records[index]!, atDays))
    },
    markReady(id, atDays) {
      const index = indexOf(id)
      if (index === -1) return null
      return replace(id, markExpeditionAssignmentReady(records[index]!, atDays))
    },
    dispose() {
      records.length = 0
    },
  }
}
