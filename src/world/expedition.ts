/**
 * Source-neutral bounded expedition terms — destination/duration/completion
 * semantics only, shared by paid escort Work Contracts (plan npc-030) and
 * voluntary joining (plan npc-031). No reward, payment or employer field
 * belongs here; that stays owned by whichever source actually has
 * economics (`world/workContract.ts`). Extracted from `workContract.ts`,
 * which re-exports these under its original `ExpeditionEscort*` names for
 * every existing call site — this module is the ownership boundary, not a
 * second parallel expedition shape.
 *
 * @domain npc
 */

/** Stable world reference for an expedition destination (plan npc-030 §7) —
 *  never mesh/Object3D identity, never a bare `(x, z)` as the primary
 *  identity. */
export type ExpeditionDestinationRef =
  | { kind: 'settlement', settlementId: string }
  | { kind: 'location', locationId: string }

/** A destination resolved once, at creation time, by the composition/UI
 *  layer that actually owns the settlement/location registry (plan npc-030
 *  §10 implementation notes — "resolver in app/world integration seam, not
 *  pure domain code"). `x`/`z` are a bounded snapshot, never re-resolved
 *  live during scoring/fulfilment. */
export type ExpeditionDestination = {
  ref: ExpeditionDestinationRef
  x: number
  z: number
}

/** Explicit, persisted completion rule (plan npc-030 §5) — never inferred
 *  from whichever optional term fields happen to be present. */
export type ExpeditionCompletionPolicy = 'duration' | 'destination' | 'destination_or_timeout'

export type ExpeditionTerms = {
  completionPolicy: ExpeditionCompletionPolicy
  /** Required for `duration` and `destination_or_timeout`. */
  durationDays?: number
  /** Required for `destination` and `destination_or_timeout`. */
  destination?: ExpeditionDestination
}

/** At least one finite boundary is required (plan npc-030 §5) — a policy
 *  without the term(s) it needs is invalid and must be rejected at creation,
 *  never silently defaulted. */
export function isValidExpeditionTerms(terms: ExpeditionTerms): boolean {
  if (terms.completionPolicy === 'duration') {
    return typeof terms.durationDays === 'number' && terms.durationDays > 0
  }
  if (terms.completionPolicy === 'destination') {
    return terms.destination != null
  }
  return typeof terms.durationDays === 'number' && terms.durationDays > 0 && terms.destination != null
}
