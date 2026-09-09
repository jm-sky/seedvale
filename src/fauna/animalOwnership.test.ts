import { describe, expect, it } from 'vitest'
import {
  deriveOwnerHouseId,
  isPlayerOwned,
  ownerFromHouseId,
  ownersEqual,
  parseAnimalOwnerFromRecord,
} from './animalOwnership'

describe('animalOwnership', () => {
  it('derives household owner from legacy ownerHouseId', () => {
    const owner = ownerFromHouseId('home:home:0')
    expect(owner).toEqual({ kind: 'household', houseId: 'home:home:0' })
    expect(deriveOwnerHouseId(owner)).toBe('home:home:0')
    expect(isPlayerOwned(owner)).toBe(false)
  })

  it('treats player owner as distinct from household', () => {
    const player = { kind: 'player' as const }
    expect(deriveOwnerHouseId(player)).toBeUndefined()
    expect(isPlayerOwned(player)).toBe(true)
    expect(ownersEqual(player, { kind: 'household', houseId: 'home:home:0' })).toBe(false)
  })

  it('parses legacy save records without owner field', () => {
    expect(parseAnimalOwnerFromRecord({ ownerHouseId: 'home:home:1' }))
      .toEqual({ kind: 'household', houseId: 'home:home:1' })
    expect(parseAnimalOwnerFromRecord({ owner: { kind: 'player' } }))
      .toEqual({ kind: 'player' })
  })
})
