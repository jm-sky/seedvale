import { describe, expect, it } from 'vitest'
import { npcGoodsBuyEmptyCopy } from './npcGoodsBuyEmptyCopy'

describe('npcGoodsBuyEmptyCopy', () => {
  it('uses the no-offer line when live npcStock is empty', () => {
    expect(npcGoodsBuyEmptyCopy(0, 0)).toBe('Nie mam teraz nic na sprzedaż.')
  })

  it('does not treat a filter miss as a missing offer', () => {
    expect(npcGoodsBuyEmptyCopy(3, 0)).toBe('Brak towarów w tej kategorii.')
  })

  it('is silent when stock exists and rows remain after filters', () => {
    expect(npcGoodsBuyEmptyCopy(3, 2)).toBeNull()
  })
})
