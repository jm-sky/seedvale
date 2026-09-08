/**
 * Local settlement reputation & renown (plan quests-progression-001) — a
 * social-standing store independent of `QuestManager`'s per-NPC `relations`.
 *
 * `Reputation` is how a settlement judges the player's social qualities
 * (five `-100..100` dimensions, neutral `0`); `renown` is how widely known
 * the player is in that settlement (`0..100`, starts at `0`). The two are
 * deliberately orthogonal — a widely known player can still be disliked.
 *
 * Both are keyed by settlement id and only ever change through an explicit,
 * already-resolved `SocialConsequence` a caller applies (quest completion,
 * an exposed cemetery grave disturbance) — this manager never inspects
 * world/NPC/quest state itself and never infers whether an event became
 * socially known (see the plan's "Zasada wiedzy społecznej").
 */

export type ReputationDimension = 'trust' | 'competence' | 'benevolence' | 'courage' | 'integrity'

export type Reputation = {
  trust: number
  competence: number
  benevolence: number
  courage: number
  integrity: number
}

export type SettlementSocialStanding = {
  reputation: Reputation
  renown: number
}

/** Every settlement starts here — read paths return this without
 *  materializing a map entry (see `ReputationManager`'s class doc). */
export const NEUTRAL_REPUTATION: Readonly<Reputation> = Object.freeze({
  trust: 0,
  competence: 0,
  benevolence: 0,
  courage: 0,
  integrity: 0,
})

const REPUTATION_MIN = -100
const REPUTATION_MAX = 100
const RENOWN_MIN = 0
const RENOWN_MAX = 100

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

export type ReputationManagerInitial = {
  settlements: Record<string, SettlementSocialStanding>
}

/**
 * @domain quests-progression
 * @system reputation
 * @role Sole owner of per-settlement reputation dimensions and renown.
 * @owns SettlementSocialStanding
 */
export class ReputationManager {
  /** Sparse — an absent settlement is neutral reputation + `renown: 0`; a
   *  read never creates an entry just to return that default (matches
   *  `QuestManager`/`BadgeManager`'s existing sparse-registry convention). */
  private readonly settlements = new Map<string, SettlementSocialStanding>()

  constructor(initial?: ReputationManagerInitial) {
    if (!initial) return
    for (const [settlementId, standing] of Object.entries(initial.settlements)) {
      this.settlements.set(settlementId, {
        reputation: { ...standing.reputation },
        renown: standing.renown,
      })
    }
  }

  /** Drops every settlement back to neutral — used on "New Game", same
   *  contract as `QuestManager.reset()`/`BadgeManager.reset()`. */
  reset(): void {
    this.settlements.clear()
  }

  private entryFor(settlementId: string): SettlementSocialStanding {
    let entry = this.settlements.get(settlementId)
    if (!entry) {
      entry = { reputation: { ...NEUTRAL_REPUTATION }, renown: 0 }
      this.settlements.set(settlementId, entry)
    }
    return entry
  }

  /** Full reputation snapshot for `settlementId`, or the neutral default if
   *  it has never changed. A copy — never the internal object. */
  getReputation(settlementId: string): Readonly<Reputation> {
    return { ...(this.settlements.get(settlementId)?.reputation ?? NEUTRAL_REPUTATION) }
  }

  getReputationDimension(settlementId: string, dimension: ReputationDimension): number {
    return this.settlements.get(settlementId)?.reputation[dimension] ?? 0
  }

  /** Applies `delta` to one dimension, clamped to `-100..100`. */
  changeReputation(settlementId: string, dimension: ReputationDimension, delta: number): void {
    if (delta === 0) return
    const entry = this.entryFor(settlementId)
    entry.reputation[dimension] = clamp(entry.reputation[dimension] + delta, REPUTATION_MIN, REPUTATION_MAX)
  }

  /** `0` for a settlement that has never changed — renown starts neutral,
   *  unlike reputation's per-dimension neutral `0` it never goes negative. */
  getRenown(settlementId: string): number {
    return this.settlements.get(settlementId)?.renown ?? 0
  }

  /** Applies `delta` (positive or negative — Stage 1 has no negative source,
   *  but the API doesn't assume renown can only rise), clamped `0..100`. */
  changeRenown(settlementId: string, delta: number): void {
    if (delta === 0) return
    const entry = this.entryFor(settlementId)
    entry.renown = clamp(entry.renown + delta, RENOWN_MIN, RENOWN_MAX)
  }

  exportState(): ReputationManagerInitial {
    const settlements: Record<string, SettlementSocialStanding> = {}
    for (const [settlementId, standing] of this.settlements) {
      settlements[settlementId] = { reputation: { ...standing.reputation }, renown: standing.renown }
    }
    return { settlements }
  }
}

/** Already-resolved social effect of one real, socially-known event —
 *  produced by the domain/quest integration that has both the world result
 *  and the knowledge basis, never derived by `ReputationManager` itself
 *  (see the plan's "Integration contract"). */
export type SocialConsequence = {
  settlementId: string
  reputation?: Partial<Record<ReputationDimension, number>>
  renown?: number
}

/** Applies an already-resolved `SocialConsequence` to `manager` — the one
 *  place that fans a consequence's sparse deltas out into individual
 *  `changeReputation`/`changeRenown` calls, reused by every call site
 *  (`QuestManager`'s `applySocialConsequence` seam and grave-disturbance
 *  exposure in `groundActions`) instead of each one re-implementing the
 *  fan-out. */
export function applySocialConsequence(manager: ReputationManager, consequence: SocialConsequence): void {
  if (consequence.reputation) {
    for (const [dimension, delta] of Object.entries(consequence.reputation) as [ReputationDimension, number | undefined][]) {
      if (delta !== undefined) manager.changeReputation(consequence.settlementId, dimension, delta)
    }
  }
  if (consequence.renown !== undefined) manager.changeRenown(consequence.settlementId, consequence.renown)
}
