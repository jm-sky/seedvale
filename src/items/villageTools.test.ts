import { describe, expect, it } from 'vitest'
import { createSeededRandom } from '../world/parseSeed'
import { ITEM_DEFS } from './items'

/** Mirrors plan 082 spawn bounds for village farm tools. */
function rollVillageToolCount(random: () => number): number {
  const min = 1
  const max = 3
  return min + Math.floor(random() * (max - min + 1))
}

describe('village farm tools (plan 082)', () => {
  it('defines pitchfork and sickle as tools', () => {
    expect(ITEM_DEFS.pitchfork.category).toBe('tool')
    expect(ITEM_DEFS.sickle.category).toBe('tool')
    expect(ITEM_DEFS.pitchfork.label).toBe('widły')
    expect(ITEM_DEFS.sickle.label).toBe('sierp')
  })

  it('rolls 1–3 spawn count inclusively', () => {
    const counts = new Set<number>()
    for (let seed = 0; seed < 200; seed++) {
      const random = createSeededRandom(seed)
      const n = rollVillageToolCount(random)
      expect(n).toBeGreaterThanOrEqual(1)
      expect(n).toBeLessThanOrEqual(3)
      counts.add(n)
    }
    expect(counts.has(1)).toBe(true)
    expect(counts.has(2)).toBe(true)
    expect(counts.has(3)).toBe(true)
  })
})
