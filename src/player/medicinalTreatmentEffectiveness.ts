import type { PlayerSkills } from './PlayerSkills'
import { evaluateSkillCompetence } from './skillEvaluation'

/**
 * Bounded Medicine (+ Survival support) multiplier for catalog medicinal
 * treatment potency (plan items-player-043). Does not mutate health or
 * conditions — consumers apply the scaled catalog value.
 *
 * @domain items-player
 * @system player-skills
 */
export const MEDICINE_EFFECT_MULTIPLIER_MIN = 0.85
export const MEDICINE_EFFECT_MULTIPLIER_MAX = 1.2
export const SURVIVAL_SUPPORT_MULTIPLIER_MAX = 0.1

/**
 * Resolves a deterministic effectiveness multiplier from Medicine primary
 * competence with Survival as support. Novice stays useful (~0.85); mastery
 * is noticeably better but does not double treatment (~1.20 + ≤0.10 support).
 */
export function resolveMedicinalTreatmentMultiplier(skills: PlayerSkills): number {
  const competence = evaluateSkillCompetence(skills, 'medicine', [
    { source: 'skill', id: 'survival' },
  ])
  const medicine = clamp01(competence.primary.value)
  const survival = clamp01(
    competence.support.find((entry) => entry.id === 'survival')?.value ?? 0,
  )
  const medicinePart =
    MEDICINE_EFFECT_MULTIPLIER_MIN
    + medicine * (MEDICINE_EFFECT_MULTIPLIER_MAX - MEDICINE_EFFECT_MULTIPLIER_MIN)
  const survivalPart = survival * SURVIVAL_SUPPORT_MULTIPLIER_MAX
  return clamp(
    medicinePart + survivalPart,
    MEDICINE_EFFECT_MULTIPLIER_MIN,
    MEDICINE_EFFECT_MULTIPLIER_MAX + SURVIVAL_SUPPORT_MULTIPLIER_MAX,
  )
}

/** Scales a catalog severity reduction / HP treatment amount. */
export function scaleMedicinalTreatmentAmount(base: number, skills: PlayerSkills): number {
  if (!Number.isFinite(base) || base <= 0) return 0
  return Math.max(0, Math.round(base * resolveMedicinalTreatmentMultiplier(skills)))
}

function clamp01(value: number): number {
  return clamp(value, 0, 1)
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, value))
}
