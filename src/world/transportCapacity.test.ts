import { describe, expect, it } from 'vitest'
import { ANIMAL_DEFS } from '../fauna/animalDefs'
import { BASE_TRANSPORT_CARGO_MAX_WEIGHT_KG, resolveNpcTransportCargoCapacity } from './transportCapacity'

describe('resolveNpcTransportCargoCapacity (plan settlements-npcs-047)', () => {
  it('resolves the 10 kg baseline with no pack animal', () => {
    expect(resolveNpcTransportCargoCapacity(undefined)).toBe(10)
    expect(resolveNpcTransportCargoCapacity(undefined)).toBe(BASE_TRANSPORT_CARGO_MAX_WEIGHT_KG)
  })

  it('resolves a donkey pack as 40 kg total capacity, not baseline + pack', () => {
    expect(resolveNpcTransportCargoCapacity(ANIMAL_DEFS.donkey.pack)).toBe(40)
  })

  it('resolves a horse pack as 50 kg total capacity, not baseline + pack', () => {
    expect(resolveNpcTransportCargoCapacity(ANIMAL_DEFS.horse.pack)).toBe(50)
  })
})
