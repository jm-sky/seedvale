import { describe, expect, it } from 'vitest'
import {
  describeCaveLocation,
  resolveCaveQuestPresentation,
} from './caveLocationDescription'

describe('describeCaveLocation (plan quests-progression-035)', () => {
  it('uses archetype wording plus NW for an ordinary role', () => {
    expect(describeCaveLocation({
      archetype: 'natural',
      directionPhrase: 'na północny zachód',
      canonicalName: null,
      speakerRole: 'farmer',
    })).toBe('mała jaskinia na północny zachód od osady')
  })

  it('uses adventure wording plus north for an ordinary role', () => {
    expect(describeCaveLocation({
      archetype: 'adventure',
      directionPhrase: 'na północ',
      canonicalName: null,
      speakerRole: 'woodcutter',
    })).toBe('głęboka jaskinia na północ od osady')
  })

  it('uses dungeon wording plus east for an ordinary role', () => {
    expect(describeCaveLocation({
      archetype: 'dungeon',
      directionPhrase: 'na wschód',
      canonicalName: null,
      speakerRole: 'blacksmith',
    })).toBe('stary loch na wschód od osady')
  })

  it('lets a hunter speak a canonical name', () => {
    expect(describeCaveLocation({
      archetype: 'adventure',
      directionPhrase: 'na północ',
      canonicalName: 'Jaskinia Mroczna',
      speakerRole: 'hunter',
    })).toBe('Jaskinia Mroczna, na północ od osady')
  })

  it('hides the canonical name from a farmer given the same location', () => {
    expect(describeCaveLocation({
      archetype: 'adventure',
      directionPhrase: 'na północ',
      canonicalName: 'Jaskinia Mroczna',
      speakerRole: 'farmer',
    })).toBe('głęboka jaskinia na północ od osady')
  })

  it('falls back to the archetype when an allowed role has no name', () => {
    expect(describeCaveLocation({
      archetype: 'natural',
      directionPhrase: 'na zachód',
      canonicalName: null,
      speakerRole: 'guard',
    })).toBe('mała jaskinia na zachód od osady')
  })

  it('uses a stable neutral fallback when direction is missing', () => {
    expect(describeCaveLocation({
      archetype: 'natural',
      directionPhrase: null,
      canonicalName: null,
      speakerRole: 'farmer',
    })).toBe('mała jaskinia poza osadą')
    expect(describeCaveLocation({
      archetype: 'dungeon',
      directionPhrase: null,
      canonicalName: 'Jaskinia Mroczna',
      speakerRole: 'guard',
    })).toBe('Jaskinia Mroczna, poza osadą')
  })

  it('is deterministic for the same input', () => {
    const input = {
      archetype: 'adventure' as const,
      directionPhrase: 'na północ',
      canonicalName: 'Jaskinia Mroczna',
      speakerRole: 'miner' as const,
    }
    expect(describeCaveLocation(input)).toBe(describeCaveLocation(input))
    expect(describeCaveLocation(input)).toBe('Jaskinia Mroczna, na północ od osady')
  })
})

describe('resolveCaveQuestPresentation', () => {
  it('derives direction from settlement-to-location delta', () => {
    expect(resolveCaveQuestPresentation({
      archetype: 'natural',
      location: { x: 0, z: -40, name: 'Jaskinia Mroczna' },
      settlementX: 0,
      settlementZ: 0,
      speakerRole: 'farmer',
    })).toBe('mała jaskinia na północ od osady')
  })
})
