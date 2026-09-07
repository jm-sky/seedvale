import type { NpcGender } from '../ai/characters'
import type { PhysicalAttributes } from '../shared/PhysicalAttributes'
import { createSeededRandom } from '../world/parseSeed'

/** Plan npc-001/npc-019/npc-022 — deterministic NPC physical-profile
 *  generation from `sex` + `age`. Pure and independent of `NpcAgent`/
 *  rendering: this module produces max HP/stamina/vigor
 *  (`docs/vision/npc-physical-state.md`'s "physical profile" boundary) plus
 *  the NPC's base SPEA `PhysicalAttributes` and human Strength/Agility
 *  profile resolution (`docs/world/human-strength-calibration.md`).
 *  Build/appearance remain future extensions, out of scope here. */

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

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/** SPEA base-attribute distribution (plan npc-019 §3,
 *  `docs/world/species-physical-reference.md` §6.1) — deliberately not the
 *  uniform ±10% `sampleVariation` above: a bell-shaped truncated normal
 *  around `0.5` so ordinary values cluster near the species reference and
 *  `0`/`1` stay exceptional rather than routine rolls. */
const SPEA_LATENT_SD = 1
const SPEA_LATENT_TRUNCATION = 3
const SPEA_ATTRIBUTE_SD = 0.10
const SPEA_NEUTRAL = 0.5

/** Deterministic standard-normal sample via Box-Muller, rejection-sampled
 *  to stay within `±SPEA_LATENT_TRUNCATION` SD (truncated normal) — still
 *  fully deterministic for a given `random`, since rejection only ever
 *  consumes further calls from that same seeded stream. `|z| > 3` occurs
 *  for well under 1% of draws, so 100 attempts is not a realistic ceiling;
 *  the eventual fallback keeps the function total without ever being
 *  observable in practice. */
function sampleTruncatedStandardNormal(random: () => number): number {
  for (let attempt = 0; attempt < 100; attempt++) {
    const u1 = Math.max(random(), Number.EPSILON)
    const u2 = random()
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * SPEA_LATENT_SD
    if (Math.abs(z) <= SPEA_LATENT_TRUNCATION) return z
  }
  return 0
}

function sampleBaseSpeaAttribute(random: () => number): number {
  return clamp01(SPEA_NEUTRAL + sampleTruncatedStandardNormal(random) * SPEA_ATTRIBUTE_SD)
}

/** One independent deterministic seed offset per SPEA attribute (plan
 *  npc-019 §3 — no shared "athleticism" roll), same short-mnemonic-hex idiom
 *  as `hpVariation`/`staminaVariation`/`vigorVariation` above. */
const SPEA_ATTRIBUTE_SEED_OFFSETS = {
  strength: 0x5354524e, // "STRN"
  perception: 0x50455243, // "PERC"
  endurance: 0x454e4452, // "ENDR"
  agility: 0x4147494c, // "AGIL"
} as const

function generateBaseAttributes(seed: number): PhysicalAttributes {
  return {
    strength: sampleBaseSpeaAttribute(createSeededRandom(seed ^ SPEA_ATTRIBUTE_SEED_OFFSETS.strength)),
    perception: sampleBaseSpeaAttribute(createSeededRandom(seed ^ SPEA_ATTRIBUTE_SEED_OFFSETS.perception)),
    endurance: sampleBaseSpeaAttribute(createSeededRandom(seed ^ SPEA_ATTRIBUTE_SEED_OFFSETS.endurance)),
    agility: sampleBaseSpeaAttribute(createSeededRandom(seed ^ SPEA_ATTRIBUTE_SEED_OFFSETS.agility)),
  }
}

/**
 * Human Strength adult-potential curve (plan npc-019 §5,
 * `docs/world/human-strength-calibration.md`) — deliberately independent
 * from `AGE_MULTIPLIER_ANCHORS` above (that curve is HP/Stamina/Vigor
 * capacity, different semantics). Anchors are the calibration document's own
 * table.
 */
const STRENGTH_AGE_ANCHORS: readonly [number, number][] = [
  [20, 0.95],
  [25, 0.98],
  [30, 1.00],
  [39, 1.00],
  [40, 0.98],
  [50, 0.92],
  [60, 0.84],
  [70, 0.73],
  [80, 0.60],
  [90, 0.48],
]

function strengthAdultPotentialForAge(age: number): number {
  const anchors = STRENGTH_AGE_ANCHORS
  if (age <= anchors[0]![0]) return anchors[0]![1]
  for (let i = 1; i < anchors.length; i++) {
    const [ageHi, potHi] = anchors[i]!
    if (age > ageHi) continue
    const [ageLo, potLo] = anchors[i - 1]!
    const t = ageHi === ageLo ? 0 : (age - ageLo) / (ageHi - ageLo)
    return potLo + (potHi - potLo) * t
  }
  return anchors[anchors.length - 1]![1]
}

/** Ages below the youngest documented Strength anchor (20) have no
 *  dedicated biological calibration yet — `human-strength-calibration.md`'s
 *  "Juveniles" section permits conservatively reusing the existing
 *  development/life-stage mechanism instead. This is an explicit temporary
 *  mapping, not a researched juvenile Strength curve (plan npc-019 §5): it
 *  reuses `ageMultiplierForAge`'s growth *shape* for ages 0..20, rescaled so
 *  it lands exactly on the age-20 Strength anchor rather than that curve's
 *  own (different-semantics) age-20 value. */
const JUVENILE_STRENGTH_SHAPE_SCALE = STRENGTH_AGE_ANCHORS[0]![1] / ageMultiplierForAge(STRENGTH_AGE_ANCHORS[0]![0])

/** Strength-specific age/development potential factor, `0..~1` — see
 *  `STRENGTH_AGE_ANCHORS`/juvenile-shape doc comments above. Interpolated
 *  deterministically; ages above the oldest anchor hold that anchor's value. */
export function strengthAgePotentialForAge(age: number): number {
  const clamped = clampAge(age)
  if (clamped >= STRENGTH_AGE_ANCHORS[0]![0]) return strengthAdultPotentialForAge(clamped)
  return ageMultiplierForAge(clamped) * JUVENILE_STRENGTH_SHAPE_SCALE
}

/**
 * Human Agility age curve (plan npc-022) — deliberately independent from
 * both `AGE_MULTIPLIER_ANCHORS` (HP/Stamina/Vigor capacity) and
 * `STRENGTH_AGE_ANCHORS` (different shape/semantics): children develop
 * toward adult coordination, young adults get a small peak, decline stays
 * gradual through middle age and becomes clearer in old age. Deliberately
 * modest — age influences individual Agility, it does not determine it.
 */
const AGILITY_AGE_ANCHORS: readonly [number, number][] = [
  [8, 0.80],
  [14, 0.94],
  [20, 1.03],
  [25, 1.05],
  [35, 1.03],
  [50, 0.97],
  [65, 0.88],
  [80, 0.75],
  [100, 0.60],
]

function agilityAdultPotentialForAge(age: number): number {
  const anchors = AGILITY_AGE_ANCHORS
  if (age <= anchors[0]![0]) return anchors[0]![1]
  for (let i = 1; i < anchors.length; i++) {
    const [ageHi, potHi] = anchors[i]!
    if (age > ageHi) continue
    const [ageLo, potLo] = anchors[i - 1]!
    const t = ageHi === ageLo ? 0 : (age - ageLo) / (ageHi - ageLo)
    return potLo + (potHi - potLo) * t
  }
  return anchors[anchors.length - 1]![1]
}

/** Ages below the youngest documented Agility anchor (8) reuse the existing
 *  development/life-stage growth *shape* (`ageMultiplierForAge`), rescaled
 *  to land exactly on the age-8 Agility anchor — same explicit temporary
 *  juvenile mapping idiom as `JUVENILE_STRENGTH_SHAPE_SCALE` above, not a
 *  researched juvenile Agility curve. */
const JUVENILE_AGILITY_SHAPE_SCALE = AGILITY_AGE_ANCHORS[0]![1] / ageMultiplierForAge(AGILITY_AGE_ANCHORS[0]![0])

/** Agility-specific age/coordination factor, `0..~1` — see
 *  `AGILITY_AGE_ANCHORS`/juvenile-shape doc comments above. Interpolated
 *  deterministically; ages above the oldest anchor hold that anchor's value. */
export function agilityAgePotentialForAge(age: number): number {
  const clamped = clampAge(age)
  if (clamped >= AGILITY_AGE_ANCHORS[0]![0]) return agilityAdultPotentialForAge(clamped)
  return ageMultiplierForAge(clamped) * JUVENILE_AGILITY_SHAPE_SCALE
}

/**
 * Resolves an NPC's current human Agility profile (plan npc-022): individual
 * base SPEA roll + age/coordination potential — deliberately **no sex
 * shift** (plan npc-022 explicitly excludes one without a separate
 * system-level reason). Mirrors `resolveHumanStrengthProfile`'s "stable
 * current base" semantics; temporary conditions are a later layer and are
 * not applied here.
 */
export function resolveHumanAgilityProfile(profile: PhysicalProfile): number {
  return clamp01(profile.attributes.agility * agilityAgePotentialForAge(profile.age))
}

/** Practical v1 human sex calibration (plan npc-019 §4,
 *  `docs/world/human-strength-calibration.md`) — a profile shift around the
 *  shared neutral human reference, not a runtime bonus and not something
 *  that determines an individual's final Strength by itself: distributions
 *  must keep overlapping (same `SPEA_ATTRIBUTE_SD` individual variation on
 *  both sides). */
const SEX_STRENGTH_SHIFT: Record<NpcGender, number> = { male: 0.08, female: -0.08 }

/**
 * Resolves an NPC's current human Strength profile (plan npc-019 §4-5):
 * individual base SPEA roll + sex calibration shift + age/development
 * potential. This is "stable current base Strength"
 * (`human-strength-calibration.md`'s "Base vs effective Strength"), not a
 * general `effectiveStrength()` — temporary conditions are a later layer and
 * are not applied here.
 */
export function resolveHumanStrengthProfile(profile: PhysicalProfile): number {
  const sexShifted = profile.attributes.strength + SEX_STRENGTH_SHIFT[profile.sex]
  return clamp01(sexShifted * strengthAgePotentialForAge(profile.age))
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
  /** Base SPEA (plan npc-019 §1/§3) — stable individual variation only, sex/
   *  age-agnostic. `resolveHumanStrengthProfile()` and
   *  `resolveHumanAgilityProfile()` resolve the melee-facing human Strength/
   *  Agility profiles from this plus `sex`/`age`; Perception/Endurance are
   *  data-only until a later plan gives them a consumer. */
  readonly attributes: PhysicalAttributes
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
    attributes: generateBaseAttributes(seed),
  }
}
