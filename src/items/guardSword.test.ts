import { describe, expect, it } from 'vitest'
import { askGuardForSword, shouldGrantQuestSword } from './guardSword'

describe('askGuardForSword (plan 090)', () => {
  it('refuses until the well quest or a relation bump', () => {
    const result = askGuardForSword({
      alreadyGifted: false,
      guardQuestComplete: false,
      relation: 0,
      alreadyHasSword: false,
    })
    expect(result.grant).toBe(false)
    expect(result.line).toContain('studni')
  })

  it('grants once after the guard quest is complete', () => {
    const result = askGuardForSword({
      alreadyGifted: false,
      guardQuestComplete: true,
      relation: 0,
      alreadyHasSword: false,
    })
    expect(result.grant).toBe(true)
  })

  it('does not grant a second sword', () => {
    const result = askGuardForSword({
      alreadyGifted: true,
      guardQuestComplete: true,
      relation: 2,
      alreadyHasSword: false,
    })
    expect(result.grant).toBe(false)
  })
})

describe('shouldGrantQuestSword', () => {
  it('skips a duplicate long_sword reward', () => {
    expect(shouldGrantQuestSword('long_sword', true, false)).toBe(false)
    expect(shouldGrantQuestSword('long_sword', false, true)).toBe(false)
    expect(shouldGrantQuestSword('long_sword', false, false)).toBe(true)
  })

  it('does not affect other reward kinds', () => {
    expect(shouldGrantQuestSword('shell', true, true)).toBe(true)
  })
})
