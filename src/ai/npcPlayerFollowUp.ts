/**
 * Persistent NPC-initiated Player follow-up (plan npc-050). Lives on
 * `NpcAuthoritativeState`, not on `NpcAgent` runtime action state or on the
 * deferred producer (e.g. `guardLocalKnowledge`) that armed it — once armed,
 * this record is the single owner of "this NPC still owes the Player
 * something", same "shared mutable object, no snapshot copy" pattern as
 * `npcAccompanyCommitment.ts`. V1 has exactly one discriminated kind,
 * `deliver_world_knowledge`; a future kind extends the union, never a
 * generic mailbox/event queue. At most one active follow-up per NPC.
 *
 * @domain npc
 */

export type NpcWorldKnowledgeFollowUpSource = { kind: 'guard' } | { kind: 'hunter' }

export type NpcPlayerFollowUp = {
  kind: 'deliver_world_knowledge'
  id: string
  createdAtDays: number
  source: NpcWorldKnowledgeFollowUpSource
  selectedLocationIds: string[]
}

let nextFollowUpSeq = 0

/** Stable-enough unique id (mirrors `createWorkContracts.ts`'s
 *  `workContract:${Date.now()}:${counter}` idiom) — never re-derived or
 *  reused, so a delivered/cancelled follow-up can never be confused with a
 *  later one for the same NPC. */
export function createNpcPlayerFollowUpId(npcId: string): string {
  return `playerFollowUp:${npcId}:${Date.now()}:${nextFollowUpSeq++}`
}

function cloneSource(source: NpcWorldKnowledgeFollowUpSource): NpcWorldKnowledgeFollowUpSource {
  return { kind: source.kind }
}

/** Plain-data clone for snapshot/restore/rebuild — never shares array/object
 *  identity with the caller (implementation notes §1: clone explicitly, do
 *  not retain a caller-owned mutable `selectedLocationIds` array). */
export function cloneNpcPlayerFollowUp(
  followUp: NpcPlayerFollowUp | null | undefined,
): NpcPlayerFollowUp | null {
  if (!followUp) return null
  return {
    kind: followUp.kind,
    id: followUp.id,
    createdAtDays: followUp.createdAtDays,
    source: cloneSource(followUp.source),
    selectedLocationIds: [...followUp.selectedLocationIds],
  }
}

/** Narrow authoritative slice so this module does not import `npcState.ts`
 *  (same "avoid a cycle" idiom as `npcAccompanyCommitment.ts`'s `NpcAccompanyHost`). */
export type NpcPlayerFollowUpHost = {
  playerFollowUp: NpcPlayerFollowUp | null
  health: { dead: boolean }
  postDeath: unknown | null
}

/**
 * Idempotently arms this NPC's one active Player follow-up. Does nothing but
 * report the existing pending follow-up when one is already active — never
 * replaces it and never stacks a second one (implementation notes §1/§3:
 * "repeated ticks/interactions cannot enqueue duplicates").
 *
 * @domain npc
 */
export function armNpcPlayerFollowUp(
  state: NpcPlayerFollowUpHost,
  followUp: Omit<NpcPlayerFollowUp, 'id'> & { id?: string },
  npcId: string,
): NpcPlayerFollowUp | null {
  if (state.health.dead || state.postDeath) return null
  if (state.playerFollowUp) return state.playerFollowUp
  const armed: NpcPlayerFollowUp = {
    kind: followUp.kind,
    id: followUp.id ?? createNpcPlayerFollowUpId(npcId),
    createdAtDays: followUp.createdAtDays,
    source: cloneSource(followUp.source),
    selectedLocationIds: [...followUp.selectedLocationIds],
  }
  state.playerFollowUp = armed
  return armed
}

/** Clears the follow-up only if the id still matches — guards against a
 *  stale UI action racing a newer/consumed follow-up (never blind-clears). */
export function consumeNpcPlayerFollowUp(state: NpcPlayerFollowUpHost, followUpId: string): boolean {
  if (!state.playerFollowUp || state.playerFollowUp.id !== followUpId) return false
  state.playerFollowUp = null
  return true
}
