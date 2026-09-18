import { describe, expect, it } from 'vitest'
import { CONTAINER_DEFS, containerGroundPrompt, containerTotalWeight } from './container'

describe('container defs (plan 164)', () => {
  it('gives the chest a positive capacity and base weight', () => {
    const def = CONTAINER_DEFS.chest
    expect(def.capacityUnits).toBeGreaterThan(0)
    expect(def.baseWeightKg).toBeGreaterThan(0)
  })

  it('sums base weight and contents weight (plan 164 §8)', () => {
    const def = CONTAINER_DEFS.chest
    expect(containerTotalWeight(def, 0)).toBe(def.baseWeightKg)
    expect(containerTotalWeight(def, 12.5)).toBe(def.baseWeightKg + 12.5)
  })

  it('marks chest/casket carry-container and saddlebags empty-to-item (plan fauna-039 §24)', () => {
    expect(CONTAINER_DEFS.chest.pickupPolicy).toBe('carry-container')
    expect(CONTAINER_DEFS.casket.pickupPolicy).toBe('carry-container')
    expect(CONTAINER_DEFS.saddlebags.pickupPolicy).toBe('empty-to-item')
    expect(CONTAINER_DEFS.saddlebags.itemKind).toBe('saddlebags')
  })
})

describe('containerGroundPrompt (plan fauna-039 §24/§26)', () => {
  it('keeps the exact existing chest prompt unchanged', () => {
    expect(containerGroundPrompt('chest', true)).toBe('[E] Otwórz skrzynię · [R] Podnieś skrzynię')
    expect(containerGroundPrompt('chest', false)).toBe('[E] Otwórz skrzynię · [R] Podnieś skrzynię')
  })

  it('offers [R] Podnieś juki only once the pack is empty', () => {
    expect(containerGroundPrompt('saddlebags', true)).toBe('[E] Otwórz juki · [R] Podnieś juki')
    expect(containerGroundPrompt('saddlebags', false)).toBe('[E] Otwórz juki')
  })
})
