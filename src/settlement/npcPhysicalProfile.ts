import type { NpcGender } from '../ai/characters'
import { createSeededRandom } from '../world/parseSeed'

/** Plan npc-001 — deterministic NPC physical-profile generation from
 *  `sex` + `age`. Pure and independent of `NpcAgent`/rendering: this module
 *  only produces max HP/stamina/vigor (`docs/vision/npc-physical-state.md`'s
 *  "physical profile" boundary — `strength`/`agility`/build/appearance are
 *  future extensions, out of scope here). */

export const NPC_AGE_MIN = 0
export const NPC_AGE_MAX = 100

export type LifeStage =
  | 'infant'
  | 'child'
  | 'teen'
  | 'youngAdult'
  | 'adultPrime'
  | 'adult'
  | 'mature'
  | 'elderly'
  | 'veryElderly'

/** Life-stage table straight from the plan (§1). Ordered, inclusive upper
 *  bounds — `ageMultiplierAnchors` below is the separate continuous curve. */
const LIFE_STAGE_BOUNDARIES: readonly { maxAge: number, stage: LifeStage }[] = [
  { maxAge: 4, stage: 'infant' },
  { maxAge: 12, stage: 'child' },
  { maxAge: 17, stage: 'teen' },
  { maxAge: 24, stage: 'youngAdult' },
  { maxAge: 35, stage: 'adultPrime' },
  { maxAge: 49, stage: 'adult' },
  { maxAge: 64, stage: 'mature' },
  { maxAge: 84, stage: 'elderly' },
  { maxAge: NPC_AGE_MAX, stage: 'veryElderly' },
]

export function clampAge(age: number): number {
  return Math.min(NPC_AGE_MAX, Math.max(NPC_AGE_MIN, Math.round(age)))
}

export function lifeStageForAge(age: number): LifeStage {
  const clamped = clampAge(age)
  for (const boundary of LIFE_STAGE_BOUNDARIES) {
    if (clamped <= boundary.maxAge) return boundary.stage
  }
  return 'veryElderly'
}

/**
 * Piecewise-linear anchor points `(age, multiplier)` derived from the plan's
 * target-multiplier-range table (§1). Within each life-stage bucket the
 * anchors sit at the bucket's own low/high range value (so growth/decline is
 * continuous inside a bucket, not a single flat number), and most bucket
 * boundaries line up exactly (e.g. age 35→36 stays at 1.00, age 49→50 stays
 * at 0.98). The one deliberate jump is 17→18 (0.85 → 0.90, per the plan's
 * table) — real physical maturation between teen and young-adult ranges.
 * Ages outside `[0, 100]` clamp to the nearest anchor.
 */
const AGE_MULTIPLIER_ANCHORS: readonly [number, number][] = [
  [0, 0.20],
  [4, 0.30],
  [8, 0.45],
  [12, 0.60],
  [17, 0.85],
  [18, 0.90],
  [24, 1.00],
  [35, 1.00],
  [49, 0.98],
  [64, 0.95],
  [74, 0.88],
  [84, 0.80],
  [100, 0.70],
]

export function ageMultiplierForAge(age: number): number {
  const clamped = clampAge(age)
  const anchors = AGE_MULTIPLIER_ANCHORS
  if (clamped <= anchors[0]![0]) return anchors[0]![1]
  for (let i = 1; i < anchors.length; i++) {
    const [ageHi, multHi] = anchors[i]!
    if (clamped > ageHi) continue
    const [ageLo, multLo] = anchors[i - 1]!
    const t = ageHi === ageLo ? 0 : (clamped - ageLo) / (ageHi - ageLo)
    return multLo + (multHi - multLo) * t
  }
  return anchors[anchors.length - 1]![1]
}

/** Sex modifiers for adult baseline physical capacity (plan §2). */
const SEX_MODIFIERS: Record<NpcGender, { hp: number, stamina: number, vigor: number }> = {
  male: { hp: 1.10, stamina: 1.10, vigor: 1.00 },
  female: { hp: 0.90, stamina: 0.90, vigor: 1.05 },
}

/** Independent per-capacity individual variation (plan §3) — ±10%. */
const VARIATION_MIN = 0.90
const VARIATION_MAX = 1.10

function sampleVariation(random: () => number): number {
  return VARIATION_MIN + random() * (VARIATION_MAX - VARIATION_MIN)
}

/** Adult baseline scale (plan §4) — kept in this module rather than importing
 *  `npcState.ts`'s `MAX_HP`/`MAX_STAMINA`/`ai/npcVigor.ts`'s `MAX_VIGOR` so
 *  this module stays a standalone, dependency-free generator; those runtime
 *  constants and these baselines are intentionally the same numbers. */
const BASE_HP = 100
const BASE_STAMINA = 100
const BASE_VIGOR = 100

/** Final maxima never round/clamp down to 0 or below — an infant's HP is
 *  small, never invalid. */
const MIN_FINAL_MAX = 1

function finalMax(value: number): number {
  return Math.max(MIN_FINAL_MAX, Math.round(value))
}

export type PhysicalProfile = {
  readonly sex: NpcGender
  readonly age: number
  readonly lifeStage: LifeStage
  readonly ageMultiplier: number
  readonly hpVariation: number
  readonly staminaVariation: number
  readonly vigorVariation: number
  readonly maxHp: number
  readonly maxStamina: number
  readonly maxVigor: number
}

/**
 * Deterministic physical-profile generation (plan §5-6):
 * `finalMax = adultBase × sexModifier × ageModifier × individualVariation`.
 *
 * `seed` must come from the caller's own deterministic world/family inputs
 * (settlement seed + member index, or a family-generation seed) — never
 * `Math.random()`, runtime object identity, or a hash of a string id whose
 * implementation could later change. Same `seed`/`sex`/`age` always produces
 * the same profile; different members should normally get different seeds.
 */
export function generatePhysicalProfile(seed: number, sex: NpcGender, age: number): PhysicalProfile {
  const clampedAge = clampAge(age)
  const ageMultiplier = ageMultiplierForAge(clampedAge)
  const sexModifier = SEX_MODIFIERS[sex]

  // Three independent deterministic streams (plan §3) — one seed offset per
  // capacity so two NPCs (or two capacities of the same NPC) don't share a
  // single global +/-X% roll.
  const hpVariation = sampleVariation(createSeededRandom(seed ^ 0x48505f56))
  const staminaVariation = sampleVariation(createSeededRandom(seed ^ 0x5354414d))
  const vigorVariation = sampleVariation(createSeededRandom(seed ^ 0x56494752))

  return {
    sex,
    age: clampedAge,
    lifeStage: lifeStageForAge(clampedAge),
    ageMultiplier,
    hpVariation,
    staminaVariation,
    vigorVariation,
    maxHp: finalMax(BASE_HP * sexModifier.hp * ageMultiplier * hpVariation),
    maxStamina: finalMax(BASE_STAMINA * sexModifier.stamina * ageMultiplier * staminaVariation),
    maxVigor: finalMax(BASE_VIGOR * sexModifier.vigor * ageMultiplier * vigorVariation),
  }
}
