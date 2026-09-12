import type { ReputationDimension, SocialConsequence } from './ReputationManager'
import { renownFactor, reputationFactor } from './animalDeeds'

/**
 * Lazy social-news propagation & reputation catch-up (plan
 * quests-progression-022) — replaces the old "scan every settlement within
 * 3km at kill time" model (`animalDeeds.ts`'s former
 * `resolveAnimalDeedConsequences`) with a small pending-event queue:
 *
 * ```text
 * real world event -> SocialNewsSignal (animalDeeds.ts)
 *   -> ledger.enqueue(signal, origin, nowDays)
 *   -> ledger.catchUpSettlement(s)(...) for currently-loaded settlements now,
 *      and again whenever a settlement later streams in/activates
 *   -> already-resolved SocialConsequence(s) applied through
 *      ReputationManager's existing applySocialConsequence() seam
 * ```
 *
 * Deliberately narrow and actor-neutral: this is not a `WorldEventBus`, not
 * NPC-by-NPC gossip, and not a generic settlement spatial index. It never
 * touches `ReputationManager`, `SettlementsManager`, or `LocationKnowledge`
 * itself — callers own applying the returned consequences and discovering
 * which settlements are currently loaded.
 *
 * @domain quests-progression
 * @system reputation
 * @role Owns pending social-news events and settlement knowledge carriers;
 *  resolves lazy, idempotent per-settlement catch-up into already-resolved
 *  `SocialConsequence`s without ever scanning the settlement grid.
 * @owns SocialNewsEvent
 */

/** Distance-independent base social effect of one real event (plan §5) —
 *  species baseline x `dangerSignificance`, unrounded. Distance attenuation
 *  (`reputationFactor`/`renownFactor`) is applied later, per settlement, at
 *  catch-up time, not baked in here. */
export type SocialNewsSignal = {
  reputation: Partial<Record<ReputationDimension, number>>
  renown: number
}

/** Read-only settlement identity + world position — all catch-up needs,
 *  matching `SettlementDef`'s own `id/x/z` (plan §6's "authoritative
 *  `SettlementDef`, never a live `Settlement`/NPCs/managers" contract). */
export type SocialNewsSettlementRef = { id: string, x: number, z: number }

export type SocialNewsEventKind = 'dangerous_animal_deed'

/** Plain-data snapshot of one settlement knowledge carrier (plan §9.2) —
 *  `renownSignal` is the unrounded value that settlement itself received,
 *  reused (decayed by `SOCIAL_NEWS_RELAY_FACTOR`) as a relay source for
 *  settlements that catch up later. */
export type SocialNewsCarrierSnapshot = {
  settlementId: string
  x: number
  z: number
  renownSignal: number
}

/** Plain-data snapshot of one pending/resolved-so-far event — the unit
 *  `SocialNewsLedgerSnapshot.events` persists (plan §13). */
export type SocialNewsEventSnapshot = {
  id: string
  kind: SocialNewsEventKind
  occurredAtDays: number
  expiresAtDays: number
  originX: number
  originZ: number
  reputation: Partial<Record<ReputationDimension, number>>
  renown: number
  carriers: SocialNewsCarrierSnapshot[]
  /** Settlement ids that already received a (non-zero) consequence from this
   *  event — the idempotency dedupe (plan §12). A settlement that only ever
   *  resolved to zero effect is deliberately absent here, so it stays
   *  eligible to be re-evaluated once a stronger carrier appears. */
  processedSettlementIds: string[]
}

export type SocialNewsLedgerSnapshot = {
  nextEventId: number
  events: SocialNewsEventSnapshot[]
}

/** Animal-deed news lifetime (plan §11) — a pending event older than this
 *  (relative to the day it was enqueued) is pruned, never resolved. */
export const ANIMAL_DEED_NEWS_TTL_DAYS = 7

/** Hard cap on pending events (plan §11) — enforced by `prune()`, oldest
 *  (`occurredAtDays`, then `id`) dropped first once TTL expiry alone isn't
 *  enough to stay under it. */
export const MAX_PENDING_SOCIAL_NEWS_EVENTS = 256

/** Decay applied when a settlement relays an already-received renown signal
 *  to another settlement (plan §9.2) — keeps a chain of adjacent settlements
 *  from passing along a full-strength signal forever. */
export const SOCIAL_NEWS_RELAY_FACTOR = 0.75

type SocialNewsCarrier = SocialNewsCarrierSnapshot

type SocialNewsEvent = {
  id: string
  kind: SocialNewsEventKind
  occurredAtDays: number
  expiresAtDays: number
  origin: { x: number, z: number }
  signal: SocialNewsSignal
  carriers: SocialNewsCarrier[]
  processedSettlementIds: Set<string>
}

export type SocialNewsLedger = {
  /** Records one new real-world event as a pending `SocialNewsEvent` — the
   *  only way news enters the ledger. Runs `prune(nowDays)` afterward so the
   *  bounded-queue invariant holds immediately, not just on the next
   *  catch-up. */
  enqueue: (signal: SocialNewsSignal, origin: { x: number, z: number }, nowDays: number) => void
  /** Resolves every still-pending event against one settlement, returning
   *  zero or more already-resolved `SocialConsequence`s. Safe to call
   *  repeatedly for the same settlement — an event that already gave this
   *  settlement a non-zero consequence is skipped; one that resolved to zero
   *  effect stays eligible (see `SocialNewsEventSnapshot.processedSettlementIds`). */
  catchUpSettlement: (settlement: SocialNewsSettlementRef, nowDays: number) => SocialConsequence[]
  /** Same as `catchUpSettlement`, batched over every currently-loaded
   *  settlement — runs a bounded fixpoint over the batch (plan §8's
   *  implementation-notes correction) so a settlement already loaded before
   *  another one becomes a new carrier still benefits from it within the
   *  same call, without waiting for an unrelated future trigger. */
  catchUpSettlements: (settlements: readonly SocialNewsSettlementRef[], nowDays: number) => SocialConsequence[]
  /** Drops expired events and, if still over the cap, the oldest surplus.
   *  Called internally by `enqueue`/catch-up; exposed for tests. */
  prune: (nowDays: number) => void
  serialize: () => SocialNewsLedgerSnapshot
  /** Drops every pending event — used on New Game, same contract as
   *  `ReputationManager.reset()`/`QuestManager.reset()`. */
  reset: () => void
}

function distanceTo(a: { x: number, z: number }, b: { x: number, z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

function roundedReputation(
  base: Partial<Record<ReputationDimension, number>>,
  factor: number,
): Partial<Record<ReputationDimension, number>> {
  const out: Partial<Record<ReputationDimension, number>> = {}
  for (const [dimension, value] of Object.entries(base) as [ReputationDimension, number | undefined][]) {
    if (value === undefined) continue
    const rounded = Math.round(value * factor)
    if (rounded !== 0) out[dimension] = rounded
  }
  return out
}

/** Best (highest unrounded) renown signal available to `settlement` for one
 *  event — either the event's own origin, or any existing carrier relayed at
 *  `SOCIAL_NEWS_RELAY_FACTOR` (plan §9.2). Deterministic: carriers are
 *  compared in `settlementId` order, and only a strictly larger value
 *  replaces the running best, so the origin wins any exact tie. */
function bestRenownSignal(event: SocialNewsEvent, settlement: SocialNewsSettlementRef): number {
  let best = event.signal.renown * renownFactor(distanceTo(event.origin, settlement))
  const sortedCarriers = [...event.carriers].sort((a, b) => (a.settlementId < b.settlementId ? -1 : 1))
  for (const carrier of sortedCarriers) {
    const relayed = carrier.renownSignal * renownFactor(distanceTo(carrier, settlement)) * SOCIAL_NEWS_RELAY_FACTOR
    if (relayed > best) best = relayed
  }
  return best
}

/** Resolves one event against one settlement, mutating the event's carriers/
 *  dedupe set in place when it produces a non-zero effect — `null` when
 *  already processed or when the resolved effect rounds to zero on every
 *  dimension (plan §9/§12: a zero-effect settlement is never marked
 *  processed and never becomes a carrier, so it stays eligible later). */
function resolveForSettlement(event: SocialNewsEvent, settlement: SocialNewsSettlementRef): SocialConsequence | null {
  if (event.processedSettlementIds.has(settlement.id)) return null

  const repFactor = reputationFactor(distanceTo(event.origin, settlement))
  const reputation = roundedReputation(event.signal.reputation, repFactor)
  const renownSignal = bestRenownSignal(event, settlement)
  const renown = Math.round(renownSignal)
  if (Object.keys(reputation).length === 0 && renown === 0) return null

  event.processedSettlementIds.add(settlement.id)
  if (renownSignal > 0) {
    event.carriers = event.carriers.filter((c) => c.settlementId !== settlement.id)
    event.carriers.push({ settlementId: settlement.id, x: settlement.x, z: settlement.z, renownSignal })
  }

  return {
    settlementId: settlement.id,
    ...(Object.keys(reputation).length > 0 ? { reputation } : {}),
    ...(renown !== 0 ? { renown } : {}),
  }
}

export function createSocialNewsLedger(initial?: SocialNewsLedgerSnapshot): SocialNewsLedger {
  const events = new Map<string, SocialNewsEvent>()
  let nextEventId = initial?.nextEventId ?? 0
  for (const snapshot of initial?.events ?? []) {
    events.set(snapshot.id, {
      id: snapshot.id,
      kind: snapshot.kind,
      occurredAtDays: snapshot.occurredAtDays,
      expiresAtDays: snapshot.expiresAtDays,
      origin: { x: snapshot.originX, z: snapshot.originZ },
      signal: { reputation: { ...snapshot.reputation }, renown: snapshot.renown },
      carriers: snapshot.carriers.map((c) => ({ ...c })),
      processedSettlementIds: new Set(snapshot.processedSettlementIds),
    })
  }

  function pruneInternal(nowDays: number): void {
    for (const [id, event] of events) {
      if (nowDays > event.expiresAtDays) events.delete(id)
    }
    if (events.size > MAX_PENDING_SOCIAL_NEWS_EVENTS) {
      const sorted = [...events.values()].sort((a, b) => a.occurredAtDays - b.occurredAtDays || (a.id < b.id ? -1 : 1))
      for (let i = 0; i < sorted.length - MAX_PENDING_SOCIAL_NEWS_EVENTS; i++) events.delete(sorted[i]!.id)
    }
  }

  function enqueue(signal: SocialNewsSignal, origin: { x: number, z: number }, nowDays: number): void {
    const id = `social-news-${nextEventId}`
    nextEventId += 1
    events.set(id, {
      id,
      kind: 'dangerous_animal_deed',
      occurredAtDays: nowDays,
      expiresAtDays: nowDays + ANIMAL_DEED_NEWS_TTL_DAYS,
      origin: { ...origin },
      signal: { reputation: { ...signal.reputation }, renown: signal.renown },
      carriers: [],
      processedSettlementIds: new Set(),
    })
    pruneInternal(nowDays)
  }

  function catchUpSettlement(settlement: SocialNewsSettlementRef, nowDays: number): SocialConsequence[] {
    pruneInternal(nowDays)
    const results: SocialConsequence[] = []
    for (const event of events.values()) {
      const consequence = resolveForSettlement(event, settlement)
      if (consequence) results.push(consequence)
    }
    return results
  }

  function catchUpSettlements(settlementsIn: readonly SocialNewsSettlementRef[], nowDays: number): SocialConsequence[] {
    pruneInternal(nowDays)
    const settlements = [...settlementsIn].sort((a, b) => (a.id < b.id ? -1 : 1))
    const results: SocialConsequence[] = []
    // Bounded fixpoint (plan §8's implementation-notes correction): a
    // settlement earlier in the sorted batch may become a new carrier that a
    // later pass lets an already-visited settlement benefit from within this
    // same call, instead of only on some unrelated future trigger. Each
    // settlement can newly become a carrier for a given event at most once,
    // so this always terminates well within `settlements.length + 1` passes.
    let changed = true
    let guard = 0
    const maxPasses = settlements.length + 1
    while (changed && guard < maxPasses) {
      changed = false
      guard += 1
      for (const settlement of settlements) {
        for (const event of events.values()) {
          const before = event.carriers.length
          const consequence = resolveForSettlement(event, settlement)
          if (consequence) {
            results.push(consequence)
            if (event.carriers.length > before) changed = true
          }
        }
      }
    }
    return results
  }

  function serialize(): SocialNewsLedgerSnapshot {
    return {
      nextEventId,
      events: [...events.values()].map((event) => ({
        id: event.id,
        kind: event.kind,
        occurredAtDays: event.occurredAtDays,
        expiresAtDays: event.expiresAtDays,
        originX: event.origin.x,
        originZ: event.origin.z,
        reputation: { ...event.signal.reputation },
        renown: event.signal.renown,
        carriers: [...event.carriers]
          .sort((a, b) => (a.settlementId < b.settlementId ? -1 : 1))
          .map((c) => ({ ...c })),
        processedSettlementIds: [...event.processedSettlementIds].sort(),
      })),
    }
  }

  function reset(): void {
    events.clear()
    nextEventId = 0
  }

  return { enqueue, catchUpSettlement, catchUpSettlements, prune: pruneInternal, serialize, reset }
}
