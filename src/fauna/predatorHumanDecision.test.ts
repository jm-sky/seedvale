import { describe, expect, it } from 'vitest'
import {
  CLOSE_ATTACK_CHANCE,
  countNearbyHumans,
  decidePredatorHumanIntent,
  humanProximityFear,
  hungerAttackPressure,
  NEARBY_HUMAN_RADIUS,
  PROVOKED_FLEE_HP_RATIO,
  RETALIATION_ATTACK_CHANCE,
  scorePredatorHumanIntents,
} from './predatorHumanDecision'

const base = {
  humanDistance: 8,
  playerNoticeRange: 10,
  playerPanicRange: 3,
  fireNearby: false,
  nearbyHumanCount: 1,
  kind: 'wolf',
  selfHpRatio: 1,
  provoked: false,
  aggressionRoll: 0,
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
    // Roll above close-attack chance so territorial branch does not override.
    expect(
      decidePredatorHumanIntent({
        ...base,
        hunger: 0.95,
        humanDistance: 2,
        aggressionRoll: CLOSE_ATTACK_CHANCE,
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
    const input = { ...base, hunger: 0.9, aggressionRoll: 0.42 }
    expect(decidePredatorHumanIntent(input)).toBe(decidePredatorHumanIntent(input))
  })

  it('wolf close territorial roll can attack when non-hungry', () => {
    const close = {
      ...base,
      hunger: 0.3,
      humanDistance: 2,
    }
    expect(
      decidePredatorHumanIntent({
        ...close,
        aggressionRoll: CLOSE_ATTACK_CHANCE - 0.01,
      }),
    ).toBe('attack')
    expect(
      decidePredatorHumanIntent({
        ...close,
        aggressionRoll: CLOSE_ATTACK_CHANCE,
      }),
    ).toBe('flee')
  })

  it('fox does not use the close territorial roll', () => {
    expect(
      decidePredatorHumanIntent({
        ...base,
        kind: 'fox',
        hunger: 0.3,
        humanDistance: 2,
        aggressionRoll: 0,
      }),
    ).toBe('flee')
  })

  it('provoked healthy wolf retaliates by roll', () => {
    const provoked = {
      ...base,
      hunger: 0.3,
      humanDistance: 8,
      provoked: true,
      selfHpRatio: 0.8,
    }
    expect(
      decidePredatorHumanIntent({
        ...provoked,
        aggressionRoll: RETALIATION_ATTACK_CHANCE - 0.01,
      }),
    ).toBe('attack')
    expect(
      decidePredatorHumanIntent({
        ...provoked,
        aggressionRoll: RETALIATION_ATTACK_CHANCE,
      }),
    ).toBe('flee')
  })

  it('provoked low-HP wolf always flees', () => {
    expect(
      decidePredatorHumanIntent({
        ...base,
        hunger: 0.3,
        humanDistance: 8,
        provoked: true,
        selfHpRatio: PROVOKED_FLEE_HP_RATIO - 0.1,
        aggressionRoll: 0,
      }),
    ).toBe('flee')
  })

  it('fire suppresses close and retaliation attack rolls', () => {
    expect(
      decidePredatorHumanIntent({
        ...base,
        hunger: 0.3,
        humanDistance: 2,
        fireNearby: true,
        aggressionRoll: 0,
      }),
    ).toBe('flee')
    expect(
      decidePredatorHumanIntent({
        ...base,
        hunger: 0.3,
        humanDistance: 8,
        provoked: true,
        selfHpRatio: 0.9,
        fireNearby: true,
        aggressionRoll: 0,
      }),
    ).toBe('flee')
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
