import { isTargetedSkill, type SkillId } from './PlayerSkills'

/**
 * Runtime-only selected targeted skill (plan items-player-021). Not persisted,
 * not `SkillState.active`, and selecting it never mutates the world.
 *
 * @domain items-player
 * @system player-skills
 */
export type TargetedSkillSelection = {
  get: () => SkillId | null
  /** Selects `id` when it is targeted-capable. Returns whether selection changed. */
  select: (id: SkillId) => boolean
  /** Selects `id`, or clears it when it is already selected. Non-targeted
   *  skills are ignored. Returns the resulting selection. */
  toggle: (id: SkillId) => SkillId | null
  clear: () => void
}

export function createTargetedSkillSelection(): TargetedSkillSelection {
  let selected: SkillId | null = null
  return {
    get: () => selected,
    select(id) {
      if (!isTargetedSkill(id)) return false
      selected = id
      return true
    },
    toggle(id) {
      if (!isTargetedSkill(id)) return selected
      selected = selected === id ? null : id
      return selected
    },
    clear() {
      selected = null
    },
  }
}
