import { describe, expect, it } from 'vitest'
import { createPlayerSkills, setSkillValueForDebug, SKILL_MIN_VALUE } from '../player/PlayerSkills'
import { readBook } from './books'
import { ITEM_CATALOG } from './itemCatalog'
import { ITEM_DEFS, type ItemKind } from './items'
import { merchantPrice } from './tradeCatalog'

const BOOK_KINDS: readonly ItemKind[] = (Object.keys(ITEM_CATALOG) as ItemKind[])
  .filter((kind) => ITEM_CATALOG[kind].book != null)

describe('readBook (plan items-player-016)', () => {
  it('rejects a non-book kind', () => {
    const skills = createPlayerSkills()
    expect(readBook(skills, 'knife').outcome).toBe('not_a_book')
  })

  it('basic tier: 23% -> 40%', () => {
    const skills = createPlayerSkills()
    setSkillValueForDebug(skills, 'riding', 0.23)
    const result = readBook(skills, 'book_riding_basic')
    expect(result.outcome).toBe('learned')
    expect(skills.riding.value).toBeCloseTo(0.40, 5)
  })

  it('basic tier at/above target: no change', () => {
    const skills = createPlayerSkills()
    setSkillValueForDebug(skills, 'riding', 0.40)
    const result = readBook(skills, 'book_riding_basic')
    expect(result.outcome).toBe('known')
    expect(skills.riding.value).toBeCloseTo(0.40, 5)
  })

  it('intermediate tier at 39%: blocked', () => {
    const skills = createPlayerSkills()
    setSkillValueForDebug(skills, 'riding', 0.39)
    const result = readBook(skills, 'book_riding_intermediate')
    expect(result.outcome).toBe('too_low')
    expect(skills.riding.value).toBeCloseTo(0.39, 5)
  })

  it('intermediate tier at 40%: raises to 60%', () => {
    const skills = createPlayerSkills()
    setSkillValueForDebug(skills, 'riding', 0.40)
    const result = readBook(skills, 'book_riding_intermediate')
    expect(result.outcome).toBe('learned')
    expect(skills.riding.value).toBeCloseTo(0.60, 5)
  })

  it('intermediate tier at 51%: raises to 60%', () => {
    const skills = createPlayerSkills()
    setSkillValueForDebug(skills, 'riding', 0.51)
    const result = readBook(skills, 'book_riding_intermediate')
    expect(result.outcome).toBe('learned')
    expect(skills.riding.value).toBeCloseTo(0.60, 5)
  })

  it('advanced tier at 59%: blocked', () => {
    const skills = createPlayerSkills()
    setSkillValueForDebug(skills, 'riding', 0.59)
    const result = readBook(skills, 'book_riding_advanced')
    expect(result.outcome).toBe('too_low')
    expect(skills.riding.value).toBeCloseTo(0.59, 5)
  })

  it('advanced tier at 60%: raises to 80%', () => {
    const skills = createPlayerSkills()
    setSkillValueForDebug(skills, 'riding', 0.60)
    const result = readBook(skills, 'book_riding_advanced')
    expect(result.outcome).toBe('learned')
    expect(skills.riding.value).toBeCloseTo(0.80, 5)
  })

  it('advanced tier at 73%: raises to 80%', () => {
    const skills = createPlayerSkills()
    setSkillValueForDebug(skills, 'riding', 0.73)
    const result = readBook(skills, 'book_riding_advanced')
    expect(result.outcome).toBe('learned')
    expect(skills.riding.value).toBeCloseTo(0.80, 5)
  })

  it('advanced tier at 84%: no change', () => {
    const skills = createPlayerSkills()
    setSkillValueForDebug(skills, 'riding', 0.84)
    const result = readBook(skills, 'book_riding_advanced')
    expect(result.outcome).toBe('known')
    expect(skills.riding.value).toBeCloseTo(0.84, 5)
  })

  it('re-reading the same book after learning does not farm xp', () => {
    const skills = createPlayerSkills()
    setSkillValueForDebug(skills, 'riding', 0.23)
    readBook(skills, 'book_riding_basic')
    const xpAfterFirst = skills.riding.xp
    const second = readBook(skills, 'book_riding_basic')
    expect(second.outcome).toBe('known')
    expect(skills.riding.xp).toBe(xpAfterFirst)
  })

  it('never lowers xp or skill value', () => {
    const skills = createPlayerSkills()
    setSkillValueForDebug(skills, 'riding', 0.9)
    const xpBefore = skills.riding.xp
    readBook(skills, 'book_riding_basic')
    expect(skills.riding.xp).toBe(xpBefore)
  })
})

describe('book catalog invariants (plan items-player-016)', () => {
  it('has all 18 books (6 skills x 3 tiers)', () => {
    expect(BOOK_KINDS.length).toBe(18)
  })

  it('every book has consistent metadata and a complete catalog entry', () => {
    for (const kind of BOOK_KINDS) {
      const book = ITEM_CATALOG[kind].book!
      expect(book.requiredSkillValue).toBeLessThan(book.targetSkillValue)
      expect(book.requiredSkillValue).toBeGreaterThanOrEqual(SKILL_MIN_VALUE)
      expect(book.targetSkillValue).toBeLessThan(1)
      expect(ITEM_DEFS[kind]).toBeDefined()
      expect(ITEM_DEFS[kind].categories).toContain('knowledge')
      expect(merchantPrice(kind)).not.toBeNull()
    }
  })

  it('has exactly 3 tiers per skill, each a distinct requirement/target band', () => {
    const bySkill = new Map<string, { requiredSkillValue: number, targetSkillValue: number }[]>()
    for (const kind of BOOK_KINDS) {
      const book = ITEM_CATALOG[kind].book!
      const list = bySkill.get(book.skill) ?? []
      list.push(book)
      bySkill.set(book.skill, list)
    }
    expect(bySkill.size).toBe(6)
    for (const list of bySkill.values()) {
      expect(list.length).toBe(3)
      const targets = list.map((b) => b.targetSkillValue).sort((a, b) => a - b)
      expect(targets).toEqual([0.40, 0.60, 0.80])
    }
  })
})
