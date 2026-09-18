import type { NpcPlayerFollowUp, NpcPlayerFollowUpHost } from '../../ai/npcPlayerFollowUp'
import type { LocationKnowledge } from './locationKnowledge'
import type { WorldLocation } from './worldLocationTypes'
import { aboutAreaLine } from '../../ai/dialogueTemplates'
import { consumeNpcPlayerFollowUp } from '../../ai/npcPlayerFollowUp'

export type NpcPlayerFollowUpDeliveryDeps = {
  getLocation: (id: string) => WorldLocation | null
  locationKnowledge: LocationKnowledge
}

/**
 * The one delivery/consume seam for `deliver_world_knowledge` follow-ups
 * (plan npc-050 §7) — both manual "ask again" dialogue and the NPC-initiated
 * proactive approach call this same operation. Revalidates the follow-up id/
 * kind, re-resolves each stored id against the *current* world-location
 * catalog (never trusts a persisted id blindly), reveals only what actually
 * resolves through the existing `LocationKnowledge` ownership, and consumes
 * the follow-up only after that consequence commits. Idempotent: a repeated
 * call with an already-consumed id is a harmless no-op (`null`).
 *
 * @domain world-locations
 */
export function deliverNpcWorldKnowledgeFollowUp(
  deps: NpcPlayerFollowUpDeliveryDeps,
  npcState: NpcPlayerFollowUpHost,
  followUpId: string,
): string | null {
  const followUp = npcState.playerFollowUp
  if (!followUp || followUp.id !== followUpId || followUp.kind !== 'deliver_world_knowledge') return null
  const line = resolveDeliveryLine(deps, followUp)
  consumeNpcPlayerFollowUp(npcState, followUpId)
  return line
}

function resolveDeliveryLine(deps: NpcPlayerFollowUpDeliveryDeps, followUp: NpcPlayerFollowUp): string {
  const revealed = followUp.selectedLocationIds
    .map((id) => deps.getLocation(id))
    .filter((location): location is WorldLocation => location != null)
    .filter((location) => deps.locationKnowledge.reveal(location.id, 'discovered', 'npc'))
  return aboutAreaLine(revealed.map((location) => location.name))
}
