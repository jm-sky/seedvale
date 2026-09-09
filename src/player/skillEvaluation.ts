import type { PlayerSkills, SkillId } from './PlayerSkills'

/**
 * Optional supporting competence for a skill evaluation (plan items-player-021).
 * Supporting skills are read from `PlayerSkills`; `context` values are
 * caller-supplied (attributes, tools, …) and never mixed into a formula here.
 *
 * @domain items-player
 * @system player-skills
 */
export type SkillSupportInput =
  | { source: 'skill', id: SkillId }
  | { source: 'context', id: string, value: number }

export type EvaluatedSkillInput = {
  id: string
  value: number
  xp?: number
  source: SkillSupportInput['source']
}

/**
 * Resolved competence for one primary skill plus optional support/context.
 * Consumers decide how support affects thresholds, duration, quality or
 * other outcomes — this seam does not average or weight anything.
 *
 * @domain items-player
 * @system player-skills
 */
export type SkillCompetence = {
  primary: { id: SkillId, value: number, xp: number }
  support: readonly EvaluatedSkillInput[]
}

/**
 * Reads primary skill competence and optional supporting inputs without
 * targeting a world object. Inventory, crafting and self-treatment can reuse
 * this without inventing an `Interactable`.
 */
export function evaluateSkillCompetence(
  skills: PlayerSkills,
  primary: SkillId,
  support: readonly SkillSupportInput[] = [],
): SkillCompetence {
  const state = skills[primary]
  return {
    primary: { id: primary, value: state.value, xp: state.xp },
    support: support.map((input) => {
      if (input.source === 'skill') {
        const supporting = skills[input.id]
        return { source: 'skill', id: input.id, value: supporting.value, xp: supporting.xp }
      }
      return { source: 'context', id: input.id, value: input.value }
    }),
  }
}
