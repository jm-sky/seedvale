import { describe, expect, it } from 'vitest'
import { pickActionKind, pickHighestScore } from './scoreActions'

describe('pickHighestScore', () => {
  it('returns null for an empty list', () => {
    expect(pickHighestScore([])).toBeNull()
  })

  it('picks the highest score', () => {
    expect(
      pickHighestScore([
        { kind: 'wander', score: 0.1 },
        { kind: 'flee', score: 0.82 },
        { kind: 'attack', score: 0.37 },
      ]),
    ).toEqual({ kind: 'flee', score: 0.82 })
  })

  it('prefers the earlier entry on ties', () => {
    expect(
      pickHighestScore([
        { kind: 'flee', score: 0.5 },
        { kind: 'attack', score: 0.5 },
      ])?.kind,
    ).toBe('flee')
  })
})

describe('pickActionKind', () => {
  it('uses fallback when empty', () => {
    expect(pickActionKind([], 'wander')).toBe('wander')
  })
})
