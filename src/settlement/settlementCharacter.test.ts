import { describe, expect, it } from 'vitest'
import type { SettlementTerrain } from '../shared/SettlementName'
import type { VillageSize } from './families'
import {
  resolveSettlementCharacter,
  SETTLEMENT_CHARACTER_CHANCES,
  type SettlementCharacterInput,
} from './settlementCharacter'

function input(overrides: Partial<SettlementCharacterInput> = {}): SettlementCharacterInput {
  return {
    seedForCell: 1,
    isHome: false,
    size: 'MD',
    terrain: 'forest',
    ...overrides,
  }
}

function closedRate(
  samples: number,
  overrides: Partial<SettlementCharacterInput>,
): number {
  let hits = 0
  for (let seed = 0; seed < samples; seed++) {
    if (resolveSettlementCharacter(input({ ...overrides, seedForCell: seed })) === 'closed') hits++
  }
  return hits / samples
}

describe('resolveSettlementCharacter', () => {
  it('is deterministic for the same seed/cell inputs', () => {
    const a = resolveSettlementCharacter(input({ seedForCell: 4242, terrain: 'forest' }))
    const b = resolveSettlementCharacter(input({ seedForCell: 4242, terrain: 'forest' }))
    expect(a).toBe(b)
  })

  it('hard-gates home to default', () => {
    for (let seed = 0; seed < 80; seed++) {
      expect(resolveSettlementCharacter(input({ seedForCell: seed, isHome: true, terrain: 'forest' }))).toBe('default')
    }
  })

  it('hard-gates OUTPOST to default', () => {
    const sizes: VillageSize[] = ['OUTPOST']
    for (const size of sizes) {
      for (let seed = 0; seed < 80; seed++) {
        expect(resolveSettlementCharacter(input({ seedForCell: seed, size, terrain: 'mountain' }))).toBe('default')
      }
    }
  })

  it('gives forest a higher closed frequency than other terrains', () => {
    const samples = 400
    const forest = closedRate(samples, { terrain: 'forest' })
    const otherTerrains: SettlementTerrain[] = ['ocean', 'mountain', 'swamp', 'desert']
    const others = otherTerrains.map((terrain) => closedRate(samples, { terrain }))
    const otherMean = others.reduce((sum, rate) => sum + rate, 0) / others.length
    expect(forest).toBeGreaterThan(otherMean * 2)
    expect(forest).toBeGreaterThan(SETTLEMENT_CHARACTER_CHANCES.forest * 0.6)
    expect(forest).toBeLessThan(SETTLEMENT_CHARACTER_CHANCES.forest + 0.15)
    for (const rate of others) {
      expect(rate).toBeGreaterThan(0)
      expect(rate).toBeLessThan(SETTLEMENT_CHARACTER_CHANCES.forest)
    }
  })

  it('does not consume a shared RNG — identical inputs stay identical across interleaved calls', () => {
    const first = resolveSettlementCharacter(input({ seedForCell: 99 }))
    resolveSettlementCharacter(input({ seedForCell: 100, terrain: 'desert' }))
    const again = resolveSettlementCharacter(input({ seedForCell: 99 }))
    expect(again).toBe(first)
  })
})
