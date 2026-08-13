import { describe, expect, it } from 'vitest'
import type { SettlementEconomySeed } from './initial'
import { createEconomyRegistry } from './registry'

const seed = (id: string): SettlementEconomySeed => ({
  id,
  size: 'SM',
  foodSourceType: 'garden',
  familyCount: 2,
  dominantResource: null,
})

describe('createEconomyRegistry', () => {
  it('reuses the same economy when a settlement streams back in', () => {
    const registry = createEconomyRegistry()
    const first = registry.getOrCreate(seed('1_0'))
    first.add('wood', 7)
    const again = registry.getOrCreate(seed('1_0'))
    expect(again).toBe(first)
    expect(again.query('wood')).toBe(first.query('wood'))
  })

  it('keeps neighboring settlements on separate stock', () => {
    const registry = createEconomyRegistry()
    const a = registry.getOrCreate(seed('0_0'))
    const b = registry.getOrCreate(seed('1_0'))
    a.add('wood', 5)
    expect(b.query('wood')).not.toBe(a.query('wood'))
  })
})
