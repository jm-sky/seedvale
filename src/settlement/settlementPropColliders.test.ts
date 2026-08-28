import { describe, expect, it } from 'vitest'
import { MERCHANT_WAGON_RADIUS } from './merchantWagon'
import {
  VILLAGE_CAMPFIRE_COLLISION_RADIUS,
  WOOD_PILE_COLLISION_RADIUS,
} from './propSpecs'
import { settlementPropColliders } from './settlementPropColliders'

describe('settlementPropColliders', () => {
  it('always includes the primary wood pile', () => {
    const colliders = settlementPropColliders({ stockpile: { x: 10, z: 20 } })
    expect(colliders).toEqual([
      { type: 'circle', x: 10, z: 20, radius: WOOD_PILE_COLLISION_RADIUS },
    ])
  })

  it('adds the wagon only when that landmark is set', () => {
    const colliders = settlementPropColliders({
      stockpile: { x: 0, z: 0 },
      merchantWagon: { x: 4, z: 1 },
    })
    expect(colliders).toContainEqual({
      type: 'circle',
      x: 4,
      z: 1,
      radius: MERCHANT_WAGON_RADIUS,
    })
  })

  it('adds the secondary pile and village campfire when present', () => {
    const colliders = settlementPropColliders({
      stockpile: { x: 0, z: 0 },
      stockpileSecondary: { x: 8, z: -2 },
      campfire: { position: { x: 1, z: 3 } },
    })
    expect(colliders).toContainEqual({
      type: 'circle',
      x: 8,
      z: -2,
      radius: WOOD_PILE_COLLISION_RADIUS,
    })
    expect(colliders).toContainEqual({
      type: 'circle',
      x: 1,
      z: 3,
      radius: VILLAGE_CAMPFIRE_COLLISION_RADIUS,
    })
  })
})
