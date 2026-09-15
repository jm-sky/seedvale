import type { NpcId } from '../settlement/npcState'
import type { ExpeditionDestinationRef } from './expedition'

/**
 * World-owned expedition party commitment (plan settlements-npcs-027).
 * One sponsor, one destination, one ordered trio of existing NPC identities.
 * Travel/off-screen execution belongs to settlements-npcs-028 — this record
 * only goes as far as `ready`.
 *
 * @domain settlements-npcs
 */
export const EXPEDITION_PARTY_SIZE = 3

export type ExpeditionAssignmentState = 'forming' | 'provisioned' | 'ready'

export type ExpeditionAssignmentFailure =
  | 'not-enough-candidates'
  | 'conflicting-assignment'
  | 'staffing-unsafe'
  | 'missing-settlement-storage'
  | 'missing-equipment'
  | 'inventory-capacity'

export type ExpeditionAssignment = {
  id: string
  sponsorSettlementId: string
  destination: ExpeditionDestinationRef
  memberNpcIds: readonly [NpcId, NpcId, NpcId]
  state: ExpeditionAssignmentState
  createdAtDays: number
  provisionedAtDays?: number
  readyAtDays?: number
}

export type ExpeditionAssignmentResult =
  | { ok: true, assignment: ExpeditionAssignment }
  | { ok: false, reason: ExpeditionAssignmentFailure }

const ACTIVE_STATES: ReadonlySet<ExpeditionAssignmentState> = new Set([
  'forming',
  'provisioned',
  'ready',
])

export function isExpeditionAssignmentActive(state: ExpeditionAssignmentState): boolean {
  return ACTIVE_STATES.has(state)
}

export function expeditionDestinationsEqual(
  a: ExpeditionDestinationRef,
  b: ExpeditionDestinationRef,
): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'settlement' && b.kind === 'settlement') return a.settlementId === b.settlementId
  if (a.kind === 'location' && b.kind === 'location') return a.locationId === b.locationId
  return false
}

export function expeditionAssignmentIncludesNpc(
  assignment: ExpeditionAssignment,
  npcId: NpcId,
): boolean {
  return assignment.memberNpcIds.includes(npcId)
}

export function createExpeditionAssignmentRecord(params: {
  id: string
  sponsorSettlementId: string
  destination: ExpeditionDestinationRef
  memberNpcIds: readonly [NpcId, NpcId, NpcId]
  createdAtDays: number
}): ExpeditionAssignment {
  return {
    id: params.id,
    sponsorSettlementId: params.sponsorSettlementId,
    destination: params.destination,
    memberNpcIds: params.memberNpcIds,
    state: 'forming',
    createdAtDays: params.createdAtDays,
  }
}

export function markExpeditionAssignmentProvisioned(
  assignment: ExpeditionAssignment,
  atDays: number,
): ExpeditionAssignment | null {
  if (assignment.state === 'provisioned' || assignment.state === 'ready') return assignment
  if (assignment.state !== 'forming') return null
  return { ...assignment, state: 'provisioned', provisionedAtDays: atDays }
}

export function markExpeditionAssignmentReady(
  assignment: ExpeditionAssignment,
  atDays: number,
): ExpeditionAssignment | null {
  if (assignment.state === 'ready') return assignment
  if (assignment.state !== 'provisioned') return null
  return { ...assignment, state: 'ready', readyAtDays: atDays }
}
