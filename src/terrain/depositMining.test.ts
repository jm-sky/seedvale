import { describe, expect, it } from 'vitest'
import {
  hitsForRichness,
  isMineableOre,
  ORE_ITEM,
  yieldForOre,
} from './depositMining'

describe('depositMining (plan 090)', () => {
  it('maps ore types to inventory kinds', () => {
    expect(ORE_ITEM.coal).toBe('coal')
    expect(ORE_ITEM.iron).toBe('iron')
    expect(ORE_ITEM.gold).toBe('gold')
    expect(yieldForOre('iron')).toEqual({ kind: 'iron', count: 1 })
  })

  it('accepts only visible ore types', () => {
    expect(isMineableOre('iron')).toBe(true)
    expect(isMineableOre('fish')).toBe(false)
  })

  it('scales hits with richness into 3–7', () => {
    expect(hitsForRichness(0)).toBe(3)
    expect(hitsForRichness(1)).toBe(7)
    expect(hitsForRichness(0.5)).toBe(5)
    expect(hitsForRichness(-1)).toBe(3)
    expect(hitsForRichness(2)).toBe(7)
  })
})
