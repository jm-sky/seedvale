import { describe, expect, it } from 'vitest'
import type { AnimalAgent } from '../fauna/AnimalAgent'
import {
  getHorseAcquisitionState,
  horseOfferStatusHint,
  MERCHANT_HORSE_PRICE,
  merchantHorseAnimalId,
} from './horseAcquisition'

function fakeHorse(overrides: Partial<{ dead: boolean, playerOwned: boolean }> = {}): AnimalAgent {
  return {
    animalId: 'merchant-horse-home',
    isDead: () => overrides.dead ?? false,
    isPlayerOwned: () => overrides.playerOwned ?? false,
  } as unknown as AnimalAgent
}

describe('horseAcquisition', () => {
  it('uses deterministic merchant horse ids per settlement', () => {
    expect(merchantHorseAnimalId('home')).toBe('merchant-horse-home')
    expect(merchantHorseAnimalId('village-b')).toBe('merchant-horse-village-b')
  })

  it('derives acquisition state from animal + quest reservation', () => {
    expect(getHorseAcquisitionState({ animal: null, isReservedByQuest: false })).toBe('unavailable')
    expect(getHorseAcquisitionState({ animal: fakeHorse({ dead: true }), isReservedByQuest: false })).toBe('unavailable')
    expect(getHorseAcquisitionState({ animal: fakeHorse({ playerOwned: true }), isReservedByQuest: false })).toBe('transferred')
    expect(getHorseAcquisitionState({ animal: fakeHorse(), isReservedByQuest: true })).toBe('reserved')
    expect(getHorseAcquisitionState({ animal: fakeHorse(), isReservedByQuest: false })).toBe('available')
  })

  it('exposes merchant horse premium price above ordinary stock peak', () => {
    expect(MERCHANT_HORSE_PRICE).toBeGreaterThan(160)
  })

  it('maps non-available states to merchant hints', () => {
    expect(horseOfferStatusHint('available')).toBeNull()
    expect(horseOfferStatusHint('reserved')).toMatch(/zlecen/i)
    expect(horseOfferStatusHint('transferred')).toMatch(/należy/i)
    expect(horseOfferStatusHint('unavailable')).toMatch(/dostępn/i)
  })
})
