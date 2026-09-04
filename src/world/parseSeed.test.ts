import { describe, expect, it } from 'vitest'
import { hasExplicitUrlSeed, parseSeedFromUrl } from './parseSeed'

describe('hasExplicitUrlSeed (plan persistence-004 §9)', () => {
  it('is true for a valid explicit ?seed=', () => {
    expect(hasExplicitUrlSeed('?seed=1234')).toBe(true)
  })

  it('is false when the param is missing', () => {
    expect(hasExplicitUrlSeed('')).toBe(false)
    expect(hasExplicitUrlSeed('?other=1')).toBe(false)
  })

  it('is false for an unparseable value — must not be confused with parseSeedFromUrl()\'s fallback', () => {
    expect(hasExplicitUrlSeed('?seed=not-a-number')).toBe(false)
    // Same input the parser silently falls back on — the two must disagree
    // here, or a fallback would be mistaken for explicit New Game intent.
    expect(parseSeedFromUrl('?seed=not-a-number', 42)).toBe(42)
  })

  it('is false for an empty ?seed=', () => {
    expect(hasExplicitUrlSeed('?seed=')).toBe(false)
  })
})
