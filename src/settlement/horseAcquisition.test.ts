import { describe, expect, it } from 'vitest'
import type { AnimalAgent } from '../fauna/AnimalAgent'
import type { HorsePaddockStay } from '../fauna/horseTraining'
import { ANIMAL_DEFS } from '../fauna/animalDefs'
import {
  getHorseAcquisitionState,
  horseOfferStatusHint,
  isVendorHorseSaleEligible,
  listVendorHorseAnimals,
  MERCHANT_HORSE_PRICE,
  merchantHorseAnimalId,
  vendorHorseOfferLabel,
  vendorHorseOfferPrice,
} from './horseAcquisition'
import { vendorHorseAnimalId } from './villagePaddock'

const PADDOCK: HorsePaddockStay = {
  settlementId: 'home',
  slotIndex: 0,
  x: 0,
  z: 0,
  radius: 10,
  entranceX: 10,
  entranceZ: 0,
  entranceWidth: 2.4,
  hayX: -3,
  hayZ: 3,
}

function fakeHorse(overrides: {
  animalId?: string
  dead?: boolean
  playerOwned?: boolean
  kind?: 'horse' | 'donkey'
  name?: string
  progress?: number
  paddockStay?: HorsePaddockStay | undefined
} = {}): AnimalAgent {
  const stay = 'paddockStay' in overrides ? overrides.paddockStay : PADDOCK
  return {
    animalId: overrides.animalId ?? vendorHorseAnimalId('home', 0),
    def: overrides.kind === 'donkey' ? ANIMAL_DEFS.donkey : ANIMAL_DEFS.horse,
    isDead: () => overrides.dead ?? false,
    isPlayerOwned: () => overrides.playerOwned ?? false,
    getName: () => overrides.name,
    trainingState: () => (
      overrides.progress == null ? undefined : { progress: overrides.progress }
    ),
    paddockStay: () => stay,
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

  it('treats only live origin-slot horses as vendor-sale eligible', () => {
    const eligible = {
      animal: fakeHorse(),
      settlementId: 'home',
      isReservedByQuest: false,
    }
    expect(isVendorHorseSaleEligible(eligible)).toBe(true)
    expect(isVendorHorseSaleEligible({ ...eligible, animal: fakeHorse({ dead: true }) })).toBe(false)
    expect(isVendorHorseSaleEligible({ ...eligible, animal: fakeHorse({ playerOwned: true }) })).toBe(false)
    expect(isVendorHorseSaleEligible({ ...eligible, isReservedByQuest: true })).toBe(false)
    expect(isVendorHorseSaleEligible({
      ...eligible,
      animal: fakeHorse({ animalId: merchantHorseAnimalId('home') }),
    })).toBe(false)
    expect(isVendorHorseSaleEligible({
      ...eligible,
      animal: fakeHorse({ kind: 'donkey' }),
    })).toBe(false)
    expect(isVendorHorseSaleEligible({
      ...eligible,
      animal: fakeHorse({ paddockStay: { ...PADDOCK, settlementId: 'other' } }),
    })).toBe(false)
    expect(isVendorHorseSaleEligible({ ...eligible, animal: null })).toBe(false)
  })

  it('lists live paddock horses in slot order and omits wagon / sold / reserved', () => {
    const slot1 = fakeHorse({ animalId: vendorHorseAnimalId('home', 1), progress: 0.5 })
    const slot0 = fakeHorse({ animalId: vendorHorseAnimalId('home', 0), progress: 0.1 })
    const listed = listVendorHorseAnimals(
      [
        fakeHorse({ animalId: merchantHorseAnimalId('home') }),
        slot1,
        fakeHorse({ animalId: vendorHorseAnimalId('home', 2), dead: true }),
        slot0,
        fakeHorse({ animalId: vendorHorseAnimalId('home', 3), playerOwned: true }),
      ],
      'home',
      (animalId) => animalId === vendorHorseAnimalId('home', 4),
    )
    expect(listed.map((animal) => animal.animalId)).toEqual([
      vendorHorseAnimalId('home', 0),
      vendorHorseAnimalId('home', 1),
    ])
  })

  it('labels and prices vendor offers from derived training, not a persisted tier', () => {
    const ordinary = fakeHorse({ progress: 0.1 })
    const trained = fakeHorse({ progress: 0.5, name: 'Błyskawica' })
    expect(vendorHorseOfferLabel(ordinary)).toBe('Koń zwykły')
    expect(vendorHorseOfferLabel(trained)).toBe('Koń wyszkolony · Błyskawica')
    expect(vendorHorseOfferPrice(ordinary)).toBeLessThan(vendorHorseOfferPrice(trained))
    expect(vendorHorseOfferPrice(ordinary)).toBeLessThan(MERCHANT_HORSE_PRICE)
  })
})
