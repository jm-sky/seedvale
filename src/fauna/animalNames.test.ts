import { describe, expect, it } from 'vitest'
import { HORSE_NAMES, horseNameForAnimal } from './animalNames'

describe('horseNameForAnimal', () => {
  it('returns the same name for the same animalId', () => {
    const first = horseNameForAnimal('merchant-horse-home')
    const second = horseNameForAnimal('merchant-horse-home')
    expect(first).toBe(second)
  })

  it('returns a name from HORSE_NAMES', () => {
    const result = horseNameForAnimal('merchant-horse-home')
    expect((HORSE_NAMES as readonly string[]).includes(result)).toBe(true)
  })

  it('returns a HORSE_NAMES entry for several different animalIds', () => {
    const ids = [
      'merchant-horse-home',
      'horse-0',
      'player-horse-1',
      'home:horse:2',
    ]
    for (const animalId of ids) {
      const result = horseNameForAnimal(animalId)
      expect((HORSE_NAMES as readonly string[]).includes(result)).toBe(true)
    }
  })
})
