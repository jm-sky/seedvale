import { describe, expect, it } from 'vitest'
import { awardSkillXp, createPlayerSkills, SKILL_MIN_VALUE, xpToSkillValue } from './PlayerSkills'
import { evaluateSkillCompetence } from './skillEvaluation'

describe('evaluateSkillCompetence (plan items-player-021)', () => {
  it('reads the primary skill without inventing a weighted formula', () => {
    const skills = createPlayerSkills()
    awardSkillXp(skills, 'repair', 40)
    const result = evaluateSkillCompetence(skills, 'repair')
    expect(result.primary).toEqual({
      id: 'repair',
      xp: 40,
      value: xpToSkillValue(40),
    })
    expect(result.support).toEqual([])
  })

  it('preserves optional supporting skills as separate inputs', () => {
    const skills = createPlayerSkills()
    awardSkillXp(skills, 'repair', 40)
    awardSkillXp(skills, 'traps', 20)
    const result = evaluateSkillCompetence(skills, 'repair', [{ source: 'skill', id: 'traps' }])
    expect(result.primary.id).toBe('repair')
    expect(result.support).toEqual([
      { source: 'skill', id: 'traps', xp: 20, value: xpToSkillValue(20) },
    ])
    expect(result.support[0]?.value).not.toBe((result.primary.value + xpToSkillValue(20)) / 2)
  })

  it('accepts caller-supplied context without treating it as a skill', () => {
    const skills = createPlayerSkills()
    const result = evaluateSkillCompetence(skills, 'medicine', [
      { source: 'context', id: 'perception', value: 0.6 },
    ])
    expect(result.primary.value).toBe(SKILL_MIN_VALUE)
    expect(result.support).toEqual([
      { source: 'context', id: 'perception', value: 0.6 },
    ])
  })

  it('does not mutate skill state', () => {
    const skills = createPlayerSkills()
    awardSkillXp(skills, 'traps', 14)
    const xpBefore = skills.traps.xp
    evaluateSkillCompetence(skills, 'traps', [{ source: 'skill', id: 'repair' }])
    expect(skills.traps.xp).toBe(xpBefore)
    expect(skills.repair.xp).toBe(0)
  })
})
