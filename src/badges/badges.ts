/**
 * Reputation Badges / Achievements (plan world-007 §7-8) — a small standalone
 * domain model (no existing generic achievement subsystem was found by recon)
 * that records persistent, discrete facts about what the player has done.
 * Deliberately separate from `quests/QuestManager.ts`'s per-NPC `relations`:
 * a badge is a historical record ("this happened"), not a current social
 * value, and is never itself an economic/XP reward.
 *
 * Progress is driven by discrete gameplay events (`recordGraveDisturbed`,
 * `recordHiddenFindDiscovered`) reported by `app/actions/groundActions.ts` —
 * never evaluated per frame.
 *
 * A badge not yet earned reveals nothing (`listEarned` only ever returns
 * earned entries) — that alone satisfies "hidden achievements don't leak
 * their name/condition before discovery" (plan §8) without a separate
 * locked/hidden UI state to design.
 */

export type BadgeId = 'grave_robber' | 'desecrator' | 'treasure_hunter' | 'relic_seeker'

export type BadgeDef = {
  id: BadgeId
  /** Menu glyph (plan §9's mockup uses emoji, not an icon asset). */
  icon: string
  label: string
  description: string
}

/** Disturbed-grave count at which `desecrator` is earned (plan §7 — "po
 *  przekroczeniu określonej liczby naruszonych grobów"). Exact value is
 *  tuning. */
const DESECRATOR_THRESHOLD = 5
/** Non-empty Hidden Finds count at which `treasure_hunter` is earned. */
const TREASURE_HUNTER_THRESHOLD = 5

const BADGE_DEFS: Record<BadgeId, BadgeDef> = {
  grave_robber: {
    id: 'grave_robber',
    icon: '🪦',
    label: 'Rozgrabiacz grobów',
    description: 'Naruszyłeś spokój grobu po raz pierwszy.',
  },
  desecrator: {
    id: 'desecrator',
    icon: '💀',
    label: 'Bezcześciciel',
    description: `Naruszyłeś spokój ${DESECRATOR_THRESHOLD} grobów.`,
  },
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

export type BadgeManagerInitial = {
  earned: readonly BadgeId[]
  gravesDisturbed: number
  hiddenFindsFound: number
}

/** How much each disturbed grave drags the UI-facing "community standing"
 *  reading down (see `communityOffensePenalty`), capped at 1 — deliberately
 *  kept out of `QuestManager.getPlayerStanding()` itself, which stays the
 *  per-NPC-relation-average value `ai/reactionChance.ts` already depends on
 *  for NPC reaction chance; grave-robbing has no NPC witnesses in v1 (plan
 *  §6 non-goals), so it must not silently change NPC behavior. */
const STANDING_PENALTY_PER_GRAVE = 0.12

/**
 * @domain badges
 * @role Owns earned-badge state and the discrete counters that drive it.
 * @owns BadgeId
 */
export class BadgeManager {
  private readonly earned = new Set<BadgeId>()
  private gravesDisturbed = 0
  private hiddenFindsFound = 0

  constructor(initial?: BadgeManagerInitial) {
    if (!initial) return
    for (const id of initial.earned) if (id in BADGE_DEFS) this.earned.add(id)
    this.gravesDisturbed = initial.gravesDisturbed
    this.hiddenFindsFound = initial.hiddenFindsFound
  }

  /** Drops all progress back to fresh-start — used on "New Game", same
   *  contract as `QuestManager.reset()`. */
  reset(): void {
    this.earned.clear()
    this.gravesDisturbed = 0
    this.hiddenFindsFound = 0
  }

  /** A cemetery grave spot was just resolved (loot or not — the plan's own
   *  rule: "kara nie zależy od tego, czy znaleziono loot"). Returns any
   *  badges newly earned by this event, for the caller to announce. */
  recordGraveDisturbed(): readonly BadgeDef[] {
    this.gravesDisturbed++
    const newly: BadgeDef[] = []
    if (this.gravesDisturbed === 1) this.tryEarn('grave_robber', newly)
    if (this.gravesDisturbed === DESECRATOR_THRESHOLD) this.tryEarn('desecrator', newly)
    return newly
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

  /** 0..1 penalty for the UI-facing "community standing" reading — combined
   *  by the caller with `QuestManager.getPlayerStanding()`, never inside
   *  `QuestManager` itself (see the class doc comment). */
  communityOffensePenalty(): number {
    return Math.min(1, this.gravesDisturbed * STANDING_PENALTY_PER_GRAVE)
  }

  listEarned(): readonly BadgeDef[] {
    return Object.values(BADGE_DEFS).filter((def) => this.earned.has(def.id))
  }

  exportState(): BadgeManagerInitial {
    return {
      earned: [...this.earned],
      gravesDisturbed: this.gravesDisturbed,
      hiddenFindsFound: this.hiddenFindsFound,
    }
  }
}
