import { describe, expect, it } from 'vitest'
import { pickNearestEligibleWolf, type VillageInfo } from './AnimalAgent'

const village: VillageInfo = { x: 0, z: 0, radius: 20 }

describe('pickNearestEligibleWolf (plan 179 §3/§4 — setFrenzyWolf() selection)', () => {
  it('picks the nearest non-frenzied wolf to a village', () => {
    const picked = pickNearestEligibleWolf(
      [
        { animalId: 'far', x: 100, z: 0, frenzied: false },
        { animalId: 'near', x: 30, z: 0, frenzied: false },
      ],
      [village],
    )
    expect(picked?.animalId).toBe('near')
    expect(picked?.village).toBe(village)
  })

  it('ignores already-frenzied wolves', () => {
    const picked = pickNearestEligibleWolf(
      [
        { animalId: 'frenzied-near', x: 10, z: 0, frenzied: true },
        { animalId: 'plain-far', x: 50, z: 0, frenzied: false },
      ],
      [village],
    )
    expect(picked?.animalId).toBe('plain-far')
  })

  it('returns null when every wolf is already frenzied', () => {
    expect(
      pickNearestEligibleWolf([{ animalId: 'a', x: 10, z: 0, frenzied: true }], [village]),
    ).toBeNull()
  })

  it('returns null with no loaded village', () => {
    expect(
      pickNearestEligibleWolf([{ animalId: 'a', x: 10, z: 0, frenzied: false }], []),
    ).toBeNull()
  })

  it('picks the nearest of several villages for the chosen wolf', () => {
    const near: VillageInfo = { x: 5, z: 0, radius: 10 }
    const far: VillageInfo = { x: 500, z: 0, radius: 10 }
    const picked = pickNearestEligibleWolf(
      [{ animalId: 'a', x: 0, z: 0, frenzied: false }],
      [far, near],
    )
    expect(picked?.village).toBe(near)
  })

  it('is deterministic for identical inputs (no Math.random involved)', () => {
    const wolves = [
      { animalId: 'a', x: 10, z: 0, frenzied: false },
      { animalId: 'b', x: 10, z: 0, frenzied: false },
    ]
    const first = pickNearestEligibleWolf(wolves, [village])
    const second = pickNearestEligibleWolf(wolves, [village])
    expect(first?.animalId).toBe(second?.animalId)
    // Tied distance: stable candidate order keeps the first-seen wolf.
    expect(first?.animalId).toBe('a')
  })
})
