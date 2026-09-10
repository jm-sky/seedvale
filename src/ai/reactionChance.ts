import type { RelationLevel } from '../quests/quests'
import type { Reputation } from '../reputation/ReputationManager'
import type { Trait } from './characters'
import type { BigFivePersonality } from './dialogue'
import { NEUTRAL_REPUTATION } from '../reputation/ReputationManager'

/** Which flavor of reaction plays once `computeReactionChance`'s roll
 *  succeeds — see `reactionTierForRelation`. */
export type ReactionTier = 'normal' | 'warm' | 'enthusiastic'

/** Identifies which NPC and which settlement's social state a
 *  `PlayerSocialLookup` call is asking about (plan quests-progression-001) —
 *  reputation/renown are per-settlement, unlike per-NPC `relationLevel`. */
export type PlayerSocialContext = { npcId: string, settlementId: string }

export type PlayerSocialState = {
  relationLevel: RelationLevel
  /** `QuestManager.getPlayerStanding()` — 0..1, deliberately kept separate
   *  from `reputation`/`renown` below (plan quests-progression-001 §"Quest
   *  outcome i reward" explicitly does not migrate it into the new system).
   *  The only consumer left is `ai/npcAssistance.ts`'s request-willingness
   *  calc, orthogonal to settlement reputation. */
  standing: number
  reputation: Readonly<Reputation>
  renown: number
}

/** Settlement-aware relation/reputation/renown lookup — threaded from
 *  `createApp.ts` (where `QuestManager`/`ReputationManager` live) down
 *  through `worldBundle.ts` → `SettlementsManager.ts` → `createSettlement.ts`,
 *  mirroring the existing `onAnimalDeath` hook (plan 110) so `NpcAgent` stays
 *  quest/reputation-agnostic (no `QuestManager`/`ReputationManager` import).
 *  `createSettlement.ts` closes over its own `settlementId` before handing a
 *  narrower `(npcId) => PlayerSocialState` lookup into `NpcAgent` — see
 *  `NpcAgentDeps.getPlayerSocial`. */
export type PlayerSocialLookup = (context: PlayerSocialContext) => PlayerSocialState

/** Neutral fallback for a `PlayerSocialLookup` with no target assigned yet
 *  (isolated/test construction) — same "stranger, unknown" default the old
 *  contract used, extended with neutral reputation/renown. */
export const NEUTRAL_PLAYER_SOCIAL_STATE: PlayerSocialState = {
  relationLevel: 'stranger',
  standing: 0,
  reputation: NEUTRAL_REPUTATION,
  renown: 0,
}

export type ReactionChanceInput = {
  personality: BigFivePersonality
  traits: readonly Trait[]
  relationLevel: RelationLevel
  /** Local settlement renown, `0..100` (plan quests-progression-001 §4) —
   *  normalized internally so callers never hold the tuning rule themselves.
   *  Defaults to 0 (no reputation system reference available). Reputation's
   *  five dimensions are deliberately not consulted here — only renown
   *  ("is the Hero recognized") drives spontaneous reaction chance. */
  renown?: number
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t)
}

/** Most NPCs ignore the Hero entirely — see plan 117 §2 ("baseChance =
 *  0.03–0.05"). Lower end, tuned down from the plan's original ceiling for
 *  gameplay balance. */
const BASE_REACTION_CHANCE = 0.03

/** Interest bonus from openness/extraversion, same 50/50 weighting as
 *  `pausePersonalityParams`'s `triggerDistance` (`dialogue.ts`) — a
 *  closed/introverted NPC still gets a small bonus, never zero. */
const PERSONALITY_BONUS_MIN = 0.00
const PERSONALITY_BONUS_MAX = 0.08

/** Curious NPCs are more likely to initiate spontaneous reactions. */
const CURIOUS_TRAIT_BONUS = 0.05

/** Plan 117 §2's relation table. `acquainted` is a single example value in
 *  the plan (not a range); `friendly`/`trusted` use their range's midpoint
 *  and upper end respectively. */
const RELATION_BONUS: Record<RelationLevel, number> = {
  stranger: 0,
  acquainted: 0.05,
  friendly: 0.15,
  trusted: 0.3,
}

/** Renown bonus ceiling — kept below `RELATION_BONUS.trusted` so being
 *  widely known matters, but personal relationship still weighs more. */
const REPUTATION_BONUS_MAX = 0.10

/** Final probability (0..1) that an NPC reacts to a nearby Hero, before
 *  group suppression is applied (plan 117 §5) — the caller still multiplies
 *  this by the existing crowd-suppression factor and rolls once. Cheap
 *  arithmetic only; safe to call every time the existing `triggerDistance`
 *  gate passes. */
export function computeReactionChance(input: ReactionChanceInput): number {
  const interest = 0.5 * input.personality.openness + 0.5 * input.personality.extraversion
  const personalityBonus = lerp(PERSONALITY_BONUS_MIN, PERSONALITY_BONUS_MAX, interest)
  const traitBonus = input.traits.includes('curious') ? CURIOUS_TRAIT_BONUS : 0
  const relationshipBonus = RELATION_BONUS[input.relationLevel]
  const renownBonus = lerp(0, REPUTATION_BONUS_MAX, (input.renown ?? 0) / 100)
  return clamp01(BASE_REACTION_CHANCE + personalityBonus + traitBonus + relationshipBonus + renownBonus)
}

/** Reaction flavor is driven by the personal relationship only — reputation
 *  affects whether a reaction happens at all (`computeReactionChance`), not
 *  which one, so a stranger-but-famous Hero still gets a plain look rather
 *  than a fabricated "I know you!" line. */
export function reactionTierForRelation(level: RelationLevel): ReactionTier {
  if (level === 'trusted') return 'enthusiastic'
  if (level === 'friendly') return 'warm'
  return 'normal'
}
