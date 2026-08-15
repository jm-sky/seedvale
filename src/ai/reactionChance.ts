import type { RelationLevel } from '../quests/quests'
import type { Trait } from './characters'
import type { BigFivePersonality } from './dialogue'

/** Which flavor of reaction plays once `computeReactionChance`'s roll
 *  succeeds — see `reactionTierForRelation`. */
export type ReactionTier = 'normal' | 'warm' | 'enthusiastic'

/** Per-NPC relation level + general player standing, resolved by name —
 *  threaded from `createApp.ts` (where `QuestManager` lives) down through
 *  `worldBundle.ts` → `SettlementsManager.ts` → `createSettlement.ts` into
 *  `NpcAgent`, mirroring the existing `onAnimalDeath` hook (plan 110) so
 *  `NpcAgent` stays quest-agnostic (no `QuestManager` import). */
export type PlayerSocialLookup = (npcName: string) => { relationLevel: RelationLevel, standing: number }

export type ReactionChanceInput = {
  personality: BigFivePersonality
  traits: readonly Trait[]
  relationLevel: RelationLevel
  /** `QuestManager.getPlayerStanding()` — 0..1 "how known/liked the Hero is
   *  in general", derived from existing per-NPC relations (plan 117 §2).
   *  Defaults to 0 (no reputation system reference available). */
  reputationStanding?: number
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * clamp01(t)
}

/** Most NPCs ignore the Hero entirely — see plan 117 §2 ("baseChance =
 *  0.03–0.05"). Upper end so the extreme-case ceiling below reaches the
 *  plan's 80–100% target once every bonus is maxed. */
const BASE_REACTION_CHANCE = 0.05

/** Interest bonus from openness/extraversion, same 50/50 weighting as
 *  `pausePersonalityParams`'s `triggerDistance` (`dialogue.ts`) — a
 *  closed/introverted NPC still gets a small bonus, never zero. */
const PERSONALITY_BONUS_MIN = 0.02
const PERSONALITY_BONUS_MAX = 0.20

/** `curious` trait bonus — upper end of the plan's "+10–15%" example. */
const CURIOUS_TRAIT_BONUS = 0.15

/** Plan 117 §2's relation table. `acquainted` is a single example value in
 *  the plan (not a range); `friendly`/`trusted` use their range's midpoint
 *  and upper end respectively. */
const RELATION_BONUS: Record<RelationLevel, number> = {
  stranger: 0,
  acquainted: 0.05,
  friendly: 0.125,
  trusted: 0.25,
}

/** Reputation bonus ceiling — matches `RELATION_BONUS.trusted` so being
 *  widely known can matter as much as being personally known. */
const REPUTATION_BONUS_MAX = 0.25

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
  const reputationBonus = lerp(0, REPUTATION_BONUS_MAX, input.reputationStanding ?? 0)
  return clamp01(BASE_REACTION_CHANCE + personalityBonus + traitBonus + relationshipBonus + reputationBonus)
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
