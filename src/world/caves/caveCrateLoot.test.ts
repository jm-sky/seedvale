/** Plan world-terrain-037 — deterministic low-value cave crate loot. */

import { describe, expect, it } from 'vitest'
import {
  CAVE_CRATE_LOOT_KINDS,
  generateCaveCrateLoot,
  isValidCaveCrateLoot,
} from './caveCrateLoot'

describe('generateCaveCrateLoot (plan world-terrain-037)', () => {
  it('returns identical contents for the same seed and anchor id', () => {
    const a = generateCaveCrateLoot(42, 'cave:adv1:crate:0')
    const b = generateCaveCrateLoot(42, 'cave:adv1:crate:0')
    expect(a).toEqual(b)
  })

  it('can vary across different stable crate ids without runtime randomness', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 40; i++) {
      seen.add(JSON.stringify(generateCaveCrateLoot(7, `cave:adv:crate:${i}`)))
    }
    expect(seen.size).toBeGreaterThan(1)
  })

  it('stays inside the allow-listed cheap kinds and quantity bounds 1–2', () => {
    for (let seed = 0; seed < 200; seed++) {
      const loot = generateCaveCrateLoot(seed, `cave:probe:crate:${seed % 5}`)
      expect(isValidCaveCrateLoot(loot)).toBe(true)
      for (const kind of Object.keys(loot)) {
        expect(CAVE_CRATE_LOOT_KINDS).toContain(kind)
      }
    }
  })

  it('supports an empty outcome for a known deterministic seed/id pair', () => {
    expect(generateCaveCrateLoot(6, 'cave:adv1:crate:0')).toEqual({})
  })

  it('never rolls treasure-tier kinds', () => {
    const forbidden = new Set([
      'coin', 'diamond', 'emerald', 'gold', 'key', 'quest_item',
      'ruby', 'sapphire', 'treasure_map',
    ])
    for (let seed = 0; seed < 300; seed++) {
      for (const kind of Object.keys(generateCaveCrateLoot(seed, `id:${seed}`))) {
        expect(forbidden.has(kind)).toBe(false)
      }
    }
  })
})
