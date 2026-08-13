import { describe, expect, it } from 'vitest'
import { HOUSE_DOOR_EXIT_SLOP, houseContaining, type HouseDoorTarget } from './doorSounds'

const houses: HouseDoorTarget[] = [
  { id: 'a', x: 0, z: 0, radius: 2 },
  { id: 'b', x: 10, z: 0, radius: 1.5 },
]

describe('houseContaining', () => {
  it('returns the house whose radius contains the point', () => {
    expect(houseContaining(0.5, 0, houses)?.id).toBe('a')
    expect(houseContaining(10, 0, houses)?.id).toBe('b')
    expect(houseContaining(5, 0, houses)).toBeNull()
  })

  it('picks the nearer house when disks overlap', () => {
    const overlap: HouseDoorTarget[] = [
      { id: 'wide', x: 0, z: 0, radius: 5 },
      { id: 'near', x: 1, z: 0, radius: 2 },
    ]
    expect(houseContaining(1.2, 0, overlap)?.id).toBe('near')
  })

  it('inflates radius for exit hysteresis', () => {
    expect(houseContaining(2.2, 0, houses)).toBeNull()
    expect(houseContaining(2.2, 0, houses, HOUSE_DOOR_EXIT_SLOP)?.id).toBe('a')
  })
})
