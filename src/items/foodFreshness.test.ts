import { describe, expect, it } from 'vitest'
import { canMergeFoodBatches, getFreshnessStage, isBaitCapable, isFoodPerishable, isSpoiled } from './foodFreshness'

describe('foodFreshness (plan 159)', () => {
  it('never spoils a kind with no freshness definition', () => {
    expect(isFoodPerishable('honey')).toBe(false)
    expect(getFreshnessStage('honey', 0, 1000)).toBe('fresh')
    expect(getFreshnessStage('stone', 0, 1000)).toBe('fresh')
  })

  it('progresses fresh -> medium -> spoiled for a perishable kind', () => {
    expect(isFoodPerishable('berries')).toBe(true)
    expect(getFreshnessStage('berries', 0, 0)).toBe('fresh')
    expect(getFreshnessStage('berries', 0, 0.99)).toBe('fresh')
    expect(getFreshnessStage('berries', 0, 1.5)).toBe('medium')
    expect(getFreshnessStage('berries', 0, 5)).toBe('spoiled')
    expect(isSpoiled('berries', 0, 5)).toBe(true)
  })

  it('merges only batches within the tolerance window', () => {
    expect(canMergeFoodBatches(1, 1.1)).toBe(true)
    expect(canMergeFoodBatches(1, 5)).toBe(false)
  })

  it('flags bait-capable kinds by category', () => {
    expect(isBaitCapable('raw_meat')).toBe(true)
    expect(isBaitCapable('mushroom')).toBe(true)
    expect(isBaitCapable('honey')).toBe(false)
    expect(isBaitCapable('stone')).toBe(false)
  })
})
