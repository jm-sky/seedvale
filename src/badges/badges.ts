import type { SocialConsequence } from '../reputation/ReputationManager'

/**
 * Reputation Badges / Achievements (plan world-007 §7-8) — a small standalone
 * domain model (no existing generic achievement subsystem was found by recon)
 * that records persistent, discrete facts about what the player has done.
 * Deliberately separate from `quests/QuestManager.ts`'s per-NPC `relations`:
 * a badge is a historical record ("this happened"), not a current social
 * value, and is never itself an economic/XP reward.
 *
 * Progress is driven by discrete gameplay events (`recordHiddenFindDiscovered`)
 * reported by `app/actions/groundActions.ts` — never evaluated per frame.
 * Grave disturbance is not a global badge: social exposure + settlement
 * reputation/renown are its only global-scope social consequence (plan
 * quests-progression-011). Its settlement-local counterpart is
 * `SettlementBadgeId`'s `grave_robber` (plan quests-progression-059) below.
 *
 * A badge not yet earned reveals nothing (`listEarned` only ever returns
 * earned entries) — that alone satisfies "hidden achievements don't leak
 * their name/condition before discovery" (plan §8) without a separate
 * locked/hidden UI state to design.
 *
 * Settlement Known Deeds (plan quests-progression-059) extend this same
 * manager with a second, settlement-scoped badge namespace: a persistent
 * fact a specific settlement's community has come to know about the player
 * through a repeated, socially-known deed. Deliberately kept type-distinct
 * from `BadgeId` — global badges and settlement known deeds have different
 * scope and consumers, and merging them into one union would blur that.
 * `BadgeManager` never scans the world/NPCs/settlements to decide whether a
 * deed happened or became known — callers (`groundActions.ts`,
 * `survivalActions.ts`, `medicalTreatmentActions.ts`) report an
 * already-resolved deed through `recordAnimalCorpseBuried` /
 * `recordSuccessfulTreatment` / `recordExposedGraveDisturbance`. This
 * manager must not import or own `ReputationManager` — an unlock's optional
 * `SocialConsequence` is returned to the caller, which applies it through
 * the existing `applySocialConsequence` seam.
 */

export type BadgeId = 'treasure_hunter' | 'relic_seeker'

export type BadgeDef = {
  id: BadgeId
  /** Menu glyph (plan §9's mockup uses emoji, not an icon asset). */
  icon: string
  label: string
  description: string
}

/** Non-empty Hidden Finds count at which `treasure_hunter` is earned. */
const TREASURE_HUNTER_THRESHOLD = 5

const BADGE_DEFS: Record<BadgeId, BadgeDef> = {
  treasure_hunter: {
    id: 'treasure_hunter',
    icon: '💰',
    label: 'Poszukiwacz skarbów',
    description: `Znalazłeś ${TREASURE_HUNTER_THRESHOLD} ukrytych znalezisk.`,
  },
  relic_seeker: {
    id: 'relic_seeker',
    icon: '🏺',
    label: 'Łowca reliktów',
    description: 'Znalazłeś wyjątkowo rzadki przedmiot.',
  },
}

/** Settlement Known Deeds (plan quests-progression-059) — badge ids meaningful
 *  only relative to one settlement's own knowledge of the player, never
 *  earned/read globally. Kept a distinct union from `BadgeId` on purpose. */
export type SettlementBadgeId = 'caretaker' | 'healer' | 'grave_robber'

export type SettlementBadgeDef = {
  id: SettlementBadgeId
  icon: string
  label: string
  description: string
  /** One-shot bonus applied exactly once, the moment this badge is first
   *  earned — never re-applied by later deeds of the same kind. Omitted
   *  entirely when a badge is meant to be the social fact itself and not
   *  stack a further reputation change onto an already-authored per-action
   *  consequence (see `grave_robber`'s definition below). */
  unlockConsequence?: Omit<SocialConsequence, 'settlementId'>
}

/** Player-driven, known cleanup of an animal corpse in this settlement's
 *  local area (shovel-bury only — never NPC/decay cleanup of the same
 *  fauna seam, see `survivalActions.ts::startBuryCorpse`). */
const CARETAKER_THRESHOLD = 5
/** Successful Medicine treatment of a settlement-affiliated NPC or
 *  household-owned livestock (never self-treatment, never a failed/no-op
 *  attempt, see `medicalTreatmentActions.ts::completeMedicalTreatment`). */
const HEALER_THRESHOLD = 5
/** `GRAVE_DISTURBANCE_EXPOSURE` is already a strong, explicit one-shot
 *  event — the settlement knows this fact the first time it happens, not
 *  after repeated grave robbery. */
const GRAVE_ROBBER_THRESHOLD = 1

const SETTLEMENT_BADGE_DEFS: Record<SettlementBadgeId, SettlementBadgeDef> = {
  caretaker: {
    id: 'caretaker',
    icon: '🧹',
    label: 'Opiekun osady',
    description: `Posprzątałeś po padłych zwierzętach ${CARETAKER_THRESHOLD} razy w tej osadzie.`,
    unlockConsequence: { reputation: { benevolence: 6 }, renown: 3 },
  },
  healer: {
    id: 'healer',
    icon: '🩺',
    label: 'Uzdrowiciel',
    description: `Skutecznie wyleczyłeś rannych ${HEALER_THRESHOLD} razy w tej osadzie.`,
    unlockConsequence: { reputation: { benevolence: 5, competence: 5 }, renown: 3 },
  },
  grave_robber: {
    // No `unlockConsequence` — `GRAVE_DISTURBANCE_EXPOSURE` already applies
    // the reputation/renown effect for the same exposure event; the badge is
    // the settlement's persistent memory of that fact, not a second penalty.
    id: 'grave_robber',
    icon: '🪦',
    label: 'Hiena cmentarna',
    description: 'Ta społeczność wie, że naruszałeś tutejsze groby.',
  },
}

export type BadgeManagerInitial = {
  earned: readonly BadgeId[]
  hiddenFindsFound: number
  /** Sparse — an absent settlement id means zero local progress. Optional
   *  since older saves predate Settlement Known Deeds entirely. */
  settlements?: Record<string, SettlementBadgeProgress>
}

export type SettlementBadgeProgress = {
  earned: readonly SettlementBadgeId[]
  animalCorpsesBuried: number
  entitiesHealed: number
  exposedGraveDisturbances: number
}

/** Result of reporting one settlement deed — the caller uses `badge`/
 *  `consequence` only when this is non-null (a badge was newly earned this
 *  call), and applies `consequence` through `applySocialConsequence` itself;
 *  `BadgeManager` never touches `ReputationManager`. */
export type SettlementBadgeUnlock = {
  settlementId: string
  badge: SettlementBadgeDef
  consequence?: SocialConsequence
}

type MutableSettlementBadgeProgress = {
  earned: Set<SettlementBadgeId>
  animalCorpsesBuried: number
  entitiesHealed: number
  exposedGraveDisturbances: number
}

/**
 * @domain badges
 * @role Owns earned-badge state and the discrete counters that drive it.
 * @owns BadgeId
 * @owns SettlementBadgeId
 */
export class BadgeManager {
  private readonly earned = new Set<BadgeId>()
  private hiddenFindsFound = 0
  /** Sparse by settlement id — matches `ReputationManager`'s "absent means
   *  never yet populated" convention; a read never materializes an entry. */
  private readonly settlements = new Map<string, MutableSettlementBadgeProgress>()

  constructor(initial?: BadgeManagerInitial) {
    if (!initial) return
    for (const id of initial.earned) if (id in BADGE_DEFS) this.earned.add(id)
    this.hiddenFindsFound = initial.hiddenFindsFound
    for (const [settlementId, progress] of Object.entries(initial.settlements ?? {})) {
      const settlementEarned = new Set<SettlementBadgeId>()
      for (const id of progress.earned) if (id in SETTLEMENT_BADGE_DEFS) settlementEarned.add(id)
      this.settlements.set(settlementId, {
        earned: settlementEarned,
        animalCorpsesBuried: progress.animalCorpsesBuried,
        entitiesHealed: progress.entitiesHealed,
        exposedGraveDisturbances: progress.exposedGraveDisturbances,
      })
    }
  }

  /** Drops all progress back to fresh-start — used on "New Game", same
   *  contract as `QuestManager.reset()`. */
  reset(): void {
    this.earned.clear()
    this.hiddenFindsFound = 0
    this.settlements.clear()
  }

  /** A Hidden Find resolved to real loot (any landmark kind, cemetery
   *  included) — `rare` marks a loot-table entry flagged `rare` (plan §7's
   *  "odpowiednio rzadki / specjalny przedmiot"). */
  recordHiddenFindDiscovered(rare: boolean): readonly BadgeDef[] {
    this.hiddenFindsFound++
    const newly: BadgeDef[] = []
    if (this.hiddenFindsFound === TREASURE_HUNTER_THRESHOLD) this.tryEarn('treasure_hunter', newly)
    if (rare) this.tryEarn('relic_seeker', newly)
    return newly
  }

  private tryEarn(id: BadgeId, newly: BadgeDef[]): void {
    if (this.earned.has(id)) return
    this.earned.add(id)
    newly.push(BADGE_DEFS[id])
  }

  listEarned(): readonly BadgeDef[] {
    return Object.values(BADGE_DEFS).filter((def) => this.earned.has(def.id))
  }

  private settlementEntry(settlementId: string): MutableSettlementBadgeProgress {
    let entry = this.settlements.get(settlementId)
    if (!entry) {
      entry = { earned: new Set(), animalCorpsesBuried: 0, entitiesHealed: 0, exposedGraveDisturbances: 0 }
      this.settlements.set(settlementId, entry)
    }
    return entry
  }

  private tryEarnSettlementBadge(settlementId: string, id: SettlementBadgeId): SettlementBadgeUnlock | null {
    const entry = this.settlementEntry(settlementId)
    if (entry.earned.has(id)) return null
    entry.earned.add(id)
    const badge = SETTLEMENT_BADGE_DEFS[id]
    return {
      settlementId,
      badge,
      consequence: badge.unlockConsequence ? { settlementId, ...badge.unlockConsequence } : undefined,
    }
  }

  /** Player shovel-bury of an animal corpse resolved as belonging to
   *  `settlementId`'s local area (plan quests-progression-059). Never call
   *  for NPC/automatic cleanup of the same corpse lifecycle. */
  recordAnimalCorpseBuried(settlementId: string): SettlementBadgeUnlock | null {
    const entry = this.settlementEntry(settlementId)
    entry.animalCorpsesBuried++
    if (entry.animalCorpsesBuried !== CARETAKER_THRESHOLD) return null
    return this.tryEarnSettlementBadge(settlementId, 'caretaker')
  }

  /** Successful (`actualRestored > 0`) Medicine treatment of an NPC or
   *  household-owned livestock affiliated with `settlementId`. Never call
   *  for self-treatment or a failed/no-op attempt. */
  recordSuccessfulTreatment(settlementId: string): SettlementBadgeUnlock | null {
    const entry = this.settlementEntry(settlementId)
    entry.entitiesHealed++
    if (entry.entitiesHealed !== HEALER_THRESHOLD) return null
    return this.tryEarnSettlementBadge(settlementId, 'healer')
  }

  /** A cemetery grave disturbance that passed its social-exposure roll for
   *  `settlementId` (plan quests-progression-011's `GRAVE_DISTURBANCE_EXPOSURE`).
   *  Never call for an unexposed (secret) disturbance. */
  recordExposedGraveDisturbance(settlementId: string): SettlementBadgeUnlock | null {
    const entry = this.settlementEntry(settlementId)
    entry.exposedGraveDisturbances++
    if (entry.exposedGraveDisturbances !== GRAVE_ROBBER_THRESHOLD) return null
    return this.tryEarnSettlementBadge(settlementId, 'grave_robber')
  }

  /** Earned local badges for one settlement — empty for a settlement with no
   *  progress. Never reveals a not-yet-earned badge's id/threshold. */
  listSettlementEarned(settlementId: string): readonly SettlementBadgeDef[] {
    const entry = this.settlements.get(settlementId)
    if (!entry) return []
    return Object.values(SETTLEMENT_BADGE_DEFS).filter((def) => entry.earned.has(def.id))
  }

  exportState(): BadgeManagerInitial {
    const settlements: Record<string, SettlementBadgeProgress> = {}
    for (const [settlementId, entry] of this.settlements) {
      settlements[settlementId] = {
        earned: [...entry.earned],
        animalCorpsesBuried: entry.animalCorpsesBuried,
        entitiesHealed: entry.entitiesHealed,
        exposedGraveDisturbances: entry.exposedGraveDisturbances,
      }
    }
    return {
      earned: [...this.earned],
      hiddenFindsFound: this.hiddenFindsFound,
      ...(Object.keys(settlements).length > 0 ? { settlements } : {}),
    }
  }
}
