import { describe, expect, it } from 'vitest'
import {
  FLOCK_THREAT_RADIUS,
  ownedFlockCentroid,
  ownedSheepOf,
  type OwnedSheepView,
  selectReadyOwnedSheep,
  selectSeparatedOwnedSheep,
  senseOwnedFlockThreat,
  SHEPHERD_FLOCK_MAX,
  SHEPHERD_FLOCK_MIN,
  shepherdFlockSize,
} from './shepherdFlock'

function sheep(partial: Partial<OwnedSheepView> & Pick<OwnedSheepView, 'animalId'>): OwnedSheepView {
  return {
    x: 0,
    z: 0,
    ownerHouseId: 'home:0',
    isAlive: true,
    woolReady: false,
    ...partial,
  }
}

describe('shepherdFlockSize (plan fauna-004)', () => {
  it('stays in the 2–6 range for every fraction in [0,1)', () => {
    const seen = new Set<number>()
    for (let i = 0; i < 20; i++) {
      const size = shepherdFlockSize(() => i / 20)
      expect(size).toBeGreaterThanOrEqual(SHEPHERD_FLOCK_MIN)
      expect(size).toBeLessThanOrEqual(SHEPHERD_FLOCK_MAX)
      seen.add(size)
    }
    expect(seen.has(SHEPHERD_FLOCK_MIN)).toBe(true)
    expect(seen.has(SHEPHERD_FLOCK_MAX)).toBe(true)
  })
})

describe('owned sheep selection (plan fauna-004)', () => {
  it('keeps only live sheep of the owning household, sorted by animalId', () => {
    const list = ownedSheepOf([
      sheep({ animalId: 'sheep-b', ownerHouseId: 'home:0' }),
      sheep({ animalId: 'sheep-a', ownerHouseId: 'home:1' }),
      sheep({ animalId: 'sheep-c', ownerHouseId: 'home:0', isAlive: false }),
      sheep({ animalId: 'sheep-d', ownerHouseId: 'home:0' }),
    ], 'home:0')
    expect(list.map((entry) => entry.animalId)).toEqual(['sheep-b', 'sheep-d'])
  })

  it('selects the first wool-ready owned sheep and ignores another household', () => {
    const ready = selectReadyOwnedSheep([
      sheep({ animalId: 'sheep-other', ownerHouseId: 'home:1', woolReady: true }),
      sheep({ animalId: 'sheep-later', ownerHouseId: 'home:0', woolReady: true }),
      sheep({ animalId: 'sheep-first', ownerHouseId: 'home:0', woolReady: true }),
    ], 'home:0')
    expect(ready?.animalId).toBe('sheep-first')
  })

  it('selects the farthest owned sheep outside the local flock area', () => {
    const far = selectSeparatedOwnedSheep([
      sheep({ animalId: 'near', x: 2, z: 0 }),
      sheep({ animalId: 'far', x: 20, z: 0 }),
    ], 'home:0', 0, 0, 12)
    expect(far?.animalId).toBe('far')
  })

  it('returns the centroid of live owned sheep', () => {
    expect(ownedFlockCentroid([
      sheep({ animalId: 'a', x: 0, z: 0 }),
      sheep({ animalId: 'b', x: 4, z: 2 }),
    ], 'home:0')).toEqual({ x: 2, z: 1 })
  })
})

describe('senseOwnedFlockThreat (plan fauna-004)', () => {
  it('returns the nearest predator committed against owned sheep', () => {
    const threat = senseOwnedFlockThreat(0, 0, 'home:0', [
      { animalId: 'wolf-far', kind: 'wolf', x: 20, z: 0, preyAnimalId: 'sheep-a', preyOwnerHouseId: 'home:0' },
      { animalId: 'wolf-near', kind: 'wolf', x: 5, z: 0, preyAnimalId: 'sheep-b', preyOwnerHouseId: 'home:0' },
    ], FLOCK_THREAT_RADIUS)
    expect(threat?.animalId).toBe('wolf-near')
  })

  it('ignores a hunt against another household or wild prey', () => {
    expect(senseOwnedFlockThreat(0, 0, 'home:0', [
      { animalId: 'wolf-other', kind: 'wolf', x: 3, z: 0, preyAnimalId: 'sheep-x', preyOwnerHouseId: 'home:1' },
      { animalId: 'wolf-deer', kind: 'wolf', x: 2, z: 0, preyAnimalId: 'deer-1' },
    ])).toBeNull()
  })
})
