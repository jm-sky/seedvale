import type { RelationLevel } from '../quests/quests'
import type { ExpeditionEscortTerms } from '../world/workContract'
import type { Role } from './characters'
import type { BigFivePersonality } from './dialogue'
import type { ScheduleActivity } from './schedule'
import { idleIntentFor } from './schedule'

/**
 * Pure voluntary-expedition-joining willingness evaluator (plan npc-031).
 * Answers "given this NPC, player social state, current obligations and an
 * expedition context, is this NPC willing and able to join voluntarily?"
 * without owning eligibility flags, presentation, or the `npc-029` accompany
 * commitment itself — `NpcAgent` supplies every fact and only ever reads the
 * result, same split as `npcWorkContract.ts`'s escort evaluator.
 *
 * Reuses `ExpeditionEscortTerms` (plan npc-030) as the shared neutral
 * expedition context — it already carries no economic field, so voluntary
 * joining needs no second representation of "what expedition is this".
 *
 * @domain npc
 */

/** The neutral expedition context shared with paid escort (plan npc-030) —
 *  destination/duration semantics only, never reward/payment. */
export type VoluntaryExpeditionTerms = ExpeditionEscortTerms

export type VoluntaryJoinBlocker =
  | 'dead'
  | 'not-adult'
  | 'active-accompany'
  | 'active-work-contract'
  | 'critical-need'
  | 'combat-or-flee'

export type VoluntaryJoinModifierKey =
  | 'exploration'
  | 'social'
  | 'suitability'
  | 'household'
  | 'schedule'
  | 'awayTime'
  | 'danger'

export type VoluntaryJoinModifier = { key: VoluntaryJoinModifierKey, value: number }

export type VoluntaryJoinEvaluation = {
  /** Hard eligibility only (`blockers.length === 0`) — a caller still
   *  compares `score` against `threshold` before accepting (see
   *  `isVoluntaryJoinAccepted`). */
  eligible: boolean
  score: number
  threshold: number
  modifiers: readonly VoluntaryJoinModifier[]
  blockers: readonly VoluntaryJoinBlocker[]
}

export type VoluntaryJoinContext = {
  // Hard facts — the caller derives every one of these from existing
  // NPC/commitment/Work-Contract/need state; the evaluator never re-derives
  // them itself (implementation notes "Evaluator boundary").
  dead: boolean
  isAdult: boolean
  hasIncompatibleAccompany: boolean
  hasIncompatibleWorkContract: boolean
  hasCriticalNeed: boolean
  inCombatOrFlee: boolean

  // Personality / role (existing `CharacterDef`, plan §"Willingness inputs").
  personality: BigFivePersonality
  curious: boolean
  role: Role
  /** Real age (plan §"Age and life stage") — only ever used for a small,
   *  smooth flexibility term, never a binary young/old rule. */
  age: number

  // Household (existing family/household state as opportunity cost).
  hasSpouse: boolean
  hasChildren: boolean

  // Profession / schedule opportunity cost.
  scheduledActivity: ScheduleActivity
  hasWorkplace: boolean

  // Player↔NPC relationship + selective reputation dimensions.
  relationLevel: RelationLevel
  /** Raw `-100..100` reputation dimensions (`ReputationManager`). */
  trust: number
  competence: number
  courage: number

  // Bounded expedition inputs.
  /** Expected hours away — caller computes via
   *  `npcPersonalProvisions.ts::escortAwayHours(terms, ...)`, the same
   *  estimator paid escort already uses, so distance/duration burden is
   *  never a second formula. */
  awayHours: number
  /** Conservative bounded danger estimate, `0..1`. Unknown danger must stay
   *  a neutral default, never fabricated precision. */
  danger: number
}

/** Conservative neutral default for a caller with no better expedition
 *  danger context yet (mirrors `DEFAULT_ESCORT_EVALUATION_CONTEXT.danger`). */
export const DEFAULT_VOLUNTARY_JOIN_DANGER = 0.5

/** Score a neutral NPC with no meaningful positive reason must clear before
 *  a caller treats the decision as accepted (plan "A neutral NPC with no
 *  meaningful positive reason to join should not volunteer by default"). */
export const VOLUNTARY_JOIN_THRESHOLD = 10

/** How much stronger self-initiative must score over the ordinary acceptance
 *  threshold (plan "NPC self-initiative may require a stronger gate... but
 *  both must derive from the same willingness evaluation"). */
const INITIATIVE_SCORE_MARGIN = 8

/** Renown normalized `0..1` above which an NPC who barely knows the player
 *  may still plausibly recognize and approach them (plan "Renown... may make
 *  it believable that an NPC who barely knows the player... considers
 *  approaching"). Never applies to a `stranger` overriding real willingness —
 *  it only ever gates initiative, never adds to `score`. */
const INITIATIVE_STRANGER_RENOWN_THRESHOLD = 0.6

const OPENNESS_WEIGHT = 10
const CURIOUS_BONUS = 4
/** Small, smooth age-flexibility term — a young/mid-adult reads as slightly
 *  more free to travel, tapering off gradually with age. Never a binary
 *  young-adventurer/old-refuses rule (plan §"Age and life stage"). */
const AGE_FLEXIBILITY_PEAK = 28
const AGE_FLEXIBILITY_SPAN = 40
const AGE_FLEXIBILITY_MAX = 3

const RELATION_BONUS: Record<RelationLevel, number> = {
  stranger: 0,
  acquainted: 4,
  friendly: 9,
  trusted: 16,
}
const EXTRAVERSION_WEIGHT = 4
/** Agreeableness only meaningfully cooperates when the personal relationship
 *  is not hostile — a disagreeable-but-trusted NPC still gets some of it,
 *  a stranger gets little (plan "agreeableness — small cooperation
 *  influence, especially when the personal relationship is positive"). */
const AGREEABLENESS_WEIGHT = 4
const AGREEABLENESS_STRANGER_FACTOR = 0.4
const TRUST_WEIGHT = 10
const COMPETENCE_WEIGHT = 8
/** Courage only matters in combination with actual danger (plan "High
 *  courage must not be a universal positive modifier"). */
const COURAGE_DANGER_WEIGHT = 10

/** Small profession nudge, never an eligibility gate (plan "profession alone
 *  must never imply willingness"). Mirrors, but deliberately does not reuse,
 *  `npcWorkContract.ts`'s paid-escort suitability table — voluntary tuning
 *  must stay independent of paid-contract economics. */
const VOLUNTARY_ROLE_SUITABILITY: Partial<Record<Role, number>> = {
  guard: 4,
  hunter: 3,
  trader: -1,
}

const HOUSEHOLD_SPOUSE_COST = 4
const HOUSEHOLD_CHILDREN_COST = 8
/** Flat penalty when joining would compete with a real scheduled work block
 *  right now — scaled up by conscientiousness (plan "conscientiousness
 *  increases the cost of abandoning duties or schedules"). */
const SCHEDULE_CONFLICT_BASE_PENALTY = 12
const AWAY_HOUR_COST = 0.3
const DANGER_WEIGHT = 20
/** How much neuroticism amplifies perceived danger (plan "neuroticism
 *  increases sensitivity to perceived danger"). */
const NEUROTICISM_DANGER_MULT = 1
/** How much competence can blunt a dangerous expedition's cost (plan "Player
 *  competence/courage may partially offset perceived expedition risk"). */
const COMPETENCE_DANGER_RELIEF = 0.3

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x))
}

/** `-100..100` reputation dimension → `0..1`. */
function normalizeReputation(value: number): number {
  return clamp01((value + 100) / 200)
}

function ageFlexibility(age: number): number {
  const distance = Math.abs(age - AGE_FLEXIBILITY_PEAK)
  return AGE_FLEXIBILITY_MAX * clamp01(1 - distance / AGE_FLEXIBILITY_SPAN)
}

function collectBlockers(ctx: VoluntaryJoinContext): VoluntaryJoinBlocker[] {
  const blockers: VoluntaryJoinBlocker[] = []
  if (ctx.dead) blockers.push('dead')
  if (!ctx.isAdult) blockers.push('not-adult')
  if (ctx.hasIncompatibleAccompany) blockers.push('active-accompany')
  if (ctx.hasIncompatibleWorkContract) blockers.push('active-work-contract')
  if (ctx.hasCriticalNeed) blockers.push('critical-need')
  if (ctx.inCombatOrFlee) blockers.push('combat-or-flee')
  return blockers
}

/**
 * Deterministic, inspectable willingness evaluation (plan npc-031). Pure:
 * identical `ctx` always produces an identical result. Both player
 * invitation and NPC initiative call this same function — initiative only
 * ever adds a stronger gate on top (see `isVoluntaryInitiativeEligible`),
 * never a second scoring table.
 *
 * @domain npc
 */
export function evaluateVoluntaryJoin(ctx: VoluntaryJoinContext): VoluntaryJoinEvaluation {
  const blockers = collectBlockers(ctx)

  const exploration =
    OPENNESS_WEIGHT * ctx.personality.openness
    + (ctx.curious ? CURIOUS_BONUS : 0)
    + ageFlexibility(ctx.age)

  const relationIsPositive = ctx.relationLevel === 'friendly' || ctx.relationLevel === 'trusted'
  const social =
    RELATION_BONUS[ctx.relationLevel]
    + EXTRAVERSION_WEIGHT * ctx.personality.extraversion
    + AGREEABLENESS_WEIGHT * ctx.personality.agreeableness * (relationIsPositive ? 1 : AGREEABLENESS_STRANGER_FACTOR)
    + TRUST_WEIGHT * normalizeReputation(ctx.trust)
    + COMPETENCE_WEIGHT * normalizeReputation(ctx.competence)
    + COURAGE_DANGER_WEIGHT * normalizeReputation(ctx.courage) * ctx.danger

  const suitability = VOLUNTARY_ROLE_SUITABILITY[ctx.role] ?? 0

  const household = (ctx.hasSpouse ? HOUSEHOLD_SPOUSE_COST : 0) + (ctx.hasChildren ? HOUSEHOLD_CHILDREN_COST : 0)

  const hasScheduleConflict = ctx.hasWorkplace && idleIntentFor(ctx.scheduledActivity) === 'work'
  const schedule = hasScheduleConflict
    ? SCHEDULE_CONFLICT_BASE_PENALTY * (1 + ctx.personality.conscientiousness)
    : 0

  const awayTime = ctx.awayHours * AWAY_HOUR_COST

  const dangerRelief = clamp01(1 - COMPETENCE_DANGER_RELIEF * normalizeReputation(ctx.competence))
  const danger = ctx.danger * DANGER_WEIGHT * (1 + ctx.personality.neuroticism * NEUROTICISM_DANGER_MULT) * dangerRelief

  const modifiers: VoluntaryJoinModifier[] = [
    { key: 'exploration', value: exploration },
    { key: 'social', value: social },
    { key: 'suitability', value: suitability },
    { key: 'household', value: -household },
    { key: 'schedule', value: -schedule },
    { key: 'awayTime', value: -awayTime },
    { key: 'danger', value: -danger },
  ]
  const score = modifiers.reduce((sum, m) => sum + m.value, 0)

  return {
    eligible: blockers.length === 0,
    score,
    threshold: VOLUNTARY_JOIN_THRESHOLD,
    modifiers,
    blockers,
  }
}

/** Ordinary acceptance decision (invitation and post-approach initiative
 *  fulfilment both use this) — hard eligibility, then score vs. threshold. */
export function isVoluntaryJoinAccepted(evaluation: VoluntaryJoinEvaluation): boolean {
  return evaluation.eligible && evaluation.score >= evaluation.threshold
}

export type VoluntaryJoinAwareness = {
  relationLevel: RelationLevel
  /** `0..1` normalized settlement renown. */
  renown: number
}

/**
 * Initiative-specific gate (plan npc-031 §"NPC initiative") — a stronger
 * score margin plus an awareness rule, never a second willingness table.
 * A `stranger` needs enough renown to plausibly recognize the player at all;
 * an already-acquainted NPC never needs renown to justify approaching.
 *
 * @domain npc
 */
export function isVoluntaryInitiativeEligible(
  evaluation: VoluntaryJoinEvaluation,
  awareness: VoluntaryJoinAwareness,
): boolean {
  if (!evaluation.eligible) return false
  if (evaluation.score < evaluation.threshold + INITIATIVE_SCORE_MARGIN) return false
  if (awareness.relationLevel !== 'stranger') return true
  return awareness.renown >= INITIATIVE_STRANGER_RENOWN_THRESHOLD
}
