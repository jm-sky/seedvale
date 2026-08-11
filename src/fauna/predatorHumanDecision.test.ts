import { describe, expect, it } from 'vitest'
import {
  countNearbyHumans,
  decidePredatorHumanIntent,
  humanProximityFear,
  hungerAttackPressure,
  NEARBY_HUMAN_RADIUS,
  scorePredatorHumanIntents,
} from './predatorHumanDecision'

const base = {
  humanDistance: 8,
  playerNoticeRange: 10,
  playerPanicRange: 3,
  fireNearby: false,
  nearbyHumanCount: 1,
  kind: 'wolf',
} as const

describe('humanProximityFear', () => {
  it('is 1 inside panic range', () => {
    expect(humanProximityFear(2, 3, 10)).toBe(1)
  })

  it('falls toward 0 at notice edge', () => {
    expect(humanProximityFear(10, 3, 10)).toBe(0)
    expect(humanProximityFear(6.5, 3, 10)).toBeGreaterThan(0)
    expect(humanProximityFear(6.5, 3, 10)).toBeLessThan(1)
  })
})

describe('hungerAttackPressure', () => {
  it('is 0 below the attack floor', () => {
    expect(hungerAttackPressure(0.4)).toBe(0)
    expect(hungerAttackPressure(0.55)).toBe(0)
  })

  it('rises toward 1 at full hunger', () => {
    expect(hungerAttackPressure(0.8)).toBeGreaterThan(0.5)
    expect(hungerAttackPressure(1)).toBe(1)
  })
})

describe('decidePredatorHumanIntent', () => {
  it('flees at low hunger with a normal human threat', () => {
    expect(decidePredatorHumanIntent({ ...base, hunger: 0.3 })).toBe('flee')
  })

  it('can switch to attack when hunger rises (other inputs equal)', () => {
    expect(decidePredatorHumanIntent({ ...base, hunger: 0.3 })).toBe('flee')
    expect(decidePredatorHumanIntent({ ...base, hunger: 0.95, humanDistance: 9 })).toBe('attack')
  })

  it('stronger proximity can switch attack back to flee', () => {
    const hungryFar = decidePredatorHumanIntent({
      ...base,
      hunger: 0.95,
      humanDistance: 9,
    })
    expect(hungryFar).toBe('attack')
    expect(
      decidePredatorHumanIntent({
        ...base,
        hunger: 0.95,
        humanDistance: 2,
      }),
    ).toBe('flee')
  })

  it('fire increases fear and can block an otherwise possible attack', () => {
    expect(
      decidePredatorHumanIntent({
        ...base,
        hunger: 0.95,
        humanDistance: 9,
        fireNearby: false,
      }),
    ).toBe('attack')
    expect(
      decidePredatorHumanIntent({
        ...base,
        hunger: 0.95,
        humanDistance: 9,
        fireNearby: true,
      }),
    ).toBe('flee')
  })

  it('more nearby humans increase flee preference', () => {
    expect(
      decidePredatorHumanIntent({
        ...base,
        hunger: 0.92,
        humanDistance: 8.5,
        nearbyHumanCount: 1,
      }),
    ).toBe('attack')
    expect(
      decidePredatorHumanIntent({
        ...base,
        hunger: 0.92,
        humanDistance: 8.5,
        nearbyHumanCount: 4,
      }),
    ).toBe('flee')
  })

  it('fox is more cautious than wolf for the same inputs', () => {
    const input = { ...base, hunger: 0.85, humanDistance: 8 }
    const wolf = scorePredatorHumanIntents({ ...input, kind: 'wolf' })
    const fox = scorePredatorHumanIntents({ ...input, kind: 'fox' })
    const wolfAttack = wolf.find((c) => c.kind === 'attack')!.score
    const foxAttack = fox.find((c) => c.kind === 'attack')!.score
    expect(wolfAttack).toBeGreaterThan(foxAttack)
  })

  it('is deterministic for identical inputs', () => {
    const input = { ...base, hunger: 0.9 }
    expect(decidePredatorHumanIntent(input)).toBe(decidePredatorHumanIntent(input))
  })
})

describe('countNearbyHumans', () => {
  it('always counts the player as 1 with no NPCs', () => {
    expect(countNearbyHumans(0, 0, [])).toBe(1)
  })

  it('adds NPCs inside the radius and ignores those outside', () => {
    expect(
      countNearbyHumans(0, 0, [
        { x: 5, z: 0 },
        { x: NEARBY_HUMAN_RADIUS + 1, z: 0 },
        { x: 0, z: NEARBY_HUMAN_RADIUS },
      ]),
    ).toBe(3)
  })
})
