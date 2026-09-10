import { describe, expect, it } from 'vitest'
import { cardinalDirectionPhrase, cardinalSector } from './cardinalDirection'

describe('cardinalSector', () => {
  it('maps eight centered sectors with world north as -Z', () => {
    expect(cardinalSector(0, -1)).toBe('N')
    expect(cardinalSector(1, -1)).toBe('NE')
    expect(cardinalSector(1, 0)).toBe('E')
    expect(cardinalSector(1, 1)).toBe('SE')
    expect(cardinalSector(0, 1)).toBe('S')
    expect(cardinalSector(-1, 1)).toBe('SW')
    expect(cardinalSector(-1, 0)).toBe('W')
    expect(cardinalSector(-1, -1)).toBe('NW')
  })

  it('returns null when origin and target coincide', () => {
    expect(cardinalSector(0, 0)).toBeNull()
    expect(cardinalDirectionPhrase(0, 0)).toBeNull()
  })

  it('keeps values just inside a sector on that cardinal', () => {
    expect(cardinalSector(0.1, -1)).toBe('N')
    expect(cardinalSector(-0.1, -1)).toBe('N')
    expect(cardinalSector(1, -0.1)).toBe('E')
    expect(cardinalSector(0.1, 1)).toBe('S')
  })

  it('formats Polish phrases from the same mapping', () => {
    expect(cardinalDirectionPhrase(1, -1)).toBe('na północny wschód')
    expect(cardinalDirectionPhrase(0, -4)).toBe('na północ')
    expect(cardinalDirectionPhrase(-3, 0)).toBe('na zachód')
  })
})
