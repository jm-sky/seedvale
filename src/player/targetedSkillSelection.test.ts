import { describe, expect, it } from 'vitest'
import { createTargetedSkillSelection } from './targetedSkillSelection'

describe('createTargetedSkillSelection (plan items-player-021)', () => {
  it('starts empty and does not treat stance/contextual skills as selectable', () => {
    const selection = createTargetedSkillSelection()
    expect(selection.get()).toBeNull()
    expect(selection.select('sneak')).toBe(false)
    expect(selection.select('survival')).toBe(false)
    expect(selection.get()).toBeNull()
  })

  it('selects a targeted skill and can cancel it without world mutation', () => {
    const selection = createTargetedSkillSelection()
    expect(selection.select('traps')).toBe(true)
    expect(selection.get()).toBe('traps')
    selection.clear()
    expect(selection.get()).toBeNull()
  })

  it('toggles the same targeted skill off', () => {
    const selection = createTargetedSkillSelection()
    expect(selection.toggle('traps')).toBe('traps')
    expect(selection.toggle('traps')).toBeNull()
  })

  it('does not select a targeted skill that has no implemented consumer', () => {
    const selection = createTargetedSkillSelection()
    expect(selection.select('medicine')).toBe(false)
    expect(selection.toggle('medicine')).toBeNull()
    expect(selection.get()).toBeNull()
  })

  it('replaces the previous targeted skill', () => {
    const selection = createTargetedSkillSelection()
    selection.select('traps')
    selection.select('repair')
    expect(selection.get()).toBe('repair')
  })
})
