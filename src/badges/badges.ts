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
 * Grave disturbance is not a badge: social exposure + settlement reputation
 * / renown are its only social consequence (plan quests-progression-011).
 *
 * A badge not yet earned reveals nothing (`listEarned` only ever returns
 * earned entries) — that alone satisfies "hidden achievements don't leak
 * their name/condition before discovery" (plan §8) without a separate
 * locked/hidden UI state to design.
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

export type BadgeManagerInitial = {
  earned: readonly BadgeId[]
  hiddenFindsFound: number
}

/**
 * @domain badges
 * @role Owns earned-badge state and the discrete counters that drive it.
 * @owns BadgeId
 */
export class BadgeManager {
  private readonly earned = new Set<BadgeId>()
  private hiddenFindsFound = 0

  constructor(initial?: BadgeManagerInitial) {
    if (!initial) return
    for (const id of initial.earned) if (id in BADGE_DEFS) this.earned.add(id)
    this.hiddenFindsFound = initial.hiddenFindsFound
  }

  /** Drops all progress back to fresh-start — used on "New Game", same
   *  contract as `QuestManager.reset()`. */
  reset(): void {
    this.earned.clear()
    this.hiddenFindsFound = 0
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

  exportState(): BadgeManagerInitial {
    return {
      earned: [...this.earned],
      hiddenFindsFound: this.hiddenFindsFound,
    }
  }
}
