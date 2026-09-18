/**
 * NPC-initiated dialogue-open boundary (plan npc-050 §6) — `NpcAgent` must
 * not import or control Vue/UI. On `approachPlayer` arrival for an
 * outstanding Player follow-up, the agent calls this narrow seam instead;
 * the app/runtime side resolves the live `NpcAgent`/settlement context and
 * opens the existing NPC dialogue menu. A denial (already in another
 * dialogue/menu, NPC/Player no longer eligible, etc.) leaves the follow-up
 * pending for a later attempt — this boundary never itself decides retry
 * timing or clears any authoritative state.
 *
 * Same "world-composition wiring, avoids threading through the settlements
 * positional DI chain" shape as `npcBarkRequest.ts`'s `configureRequestNpcBark`.
 *
 * @domain npc
 */

export type RequestNpcInitiatedDialogueReason = 'player_follow_up'

export type RequestNpcInitiatedDialogue = (npcId: string, reason: RequestNpcInitiatedDialogueReason) => boolean

let sharedRequestNpcInitiatedDialogue: RequestNpcInitiatedDialogue | null = null

export function configureRequestNpcInitiatedDialogue(request: RequestNpcInitiatedDialogue | null): void {
  sharedRequestNpcInitiatedDialogue = request
}

export function getSharedRequestNpcInitiatedDialogue(): RequestNpcInitiatedDialogue | null {
  return sharedRequestNpcInitiatedDialogue
}
