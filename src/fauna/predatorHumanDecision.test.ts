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

describe('bear playtest fixes (plan §3 — less skittish, close/provoked defends)', () => {
  it('ignores a distant, non-hungry human instead of fleeing', () => {
    expect(
      decidePredatorHumanIntent({
        ...base,
        kind: 'bear',
        hunger: 0.3,
        humanDistance: 9,
      }),
    ).toBe('ignore')
  })

  it('reacts (flee or the close-aggression roll) once the human is very close', () => {
    const closeIntent = decidePredatorHumanIntent({
      ...base,
      kind: 'bear',
      hunger: 0.3,
      humanDistance: 2,
      aggressionRoll: CLOSE_ATTACK_CHANCE,
    })
    expect(closeIntent).not.toBe('ignore')
    const aggressiveRoll = decidePredatorHumanIntent({
      ...base,
      kind: 'bear',
      hunger: 0.3,
      humanDistance: 2,
      aggressionRoll: CLOSE_ATTACK_CHANCE - 0.01,
    })
    expect(aggressiveRoll).toBe('attack')
  })

  it('a hit bear retaliates by roll like a provoked wolf', () => {
    const provoked = {
      ...base,
      kind: 'bear',
      hunger: 0.3,
      humanDistance: 8,
      provoked: true,
      selfHpRatio: 0.8,
    }
    expect(
      decidePredatorHumanIntent({ ...provoked, aggressionRoll: RETALIATION_ATTACK_CHANCE - 0.01 }),
    ).toBe('attack')
    expect(
      decidePredatorHumanIntent({ ...provoked, aggressionRoll: RETALIATION_ATTACK_CHANCE }),
    ).toBe('flee')
  })

  it('a badly hurt provoked bear always flees, never ignores', () => {
    expect(
      decidePredatorHumanIntent({
        ...base,
        kind: 'bear',
        hunger: 0.3,
        humanDistance: 8,
        provoked: true,
        selfHpRatio: PROVOKED_FLEE_HP_RATIO - 0.1,
        aggressionRoll: 0,
      }),
    ).toBe('flee')
  })
})

describe('humanTaste (plan quests-progression-007)', () => {
  it('raises attack score and lowers flee vs baseline while fire still matters', () => {
    const baseline = scorePredatorHumanIntents({ ...base, hunger: 0.7, humanDistance: 8 })
    const tasted = scorePredatorHumanIntents({ ...base, hunger: 0.7, humanDistance: 8, humanTaste: true })
    const baseAttack = baseline.find((c) => c.kind === 'attack')!.score
    const tasteAttack = tasted.find((c) => c.kind === 'attack')!.score
    const baseFlee = baseline.find((c) => c.kind === 'flee')!.score
    const tasteFlee = tasted.find((c) => c.kind === 'flee')!.score
    expect(tasteAttack).toBeGreaterThan(baseAttack)
    expect(tasteFlee).toBeLessThan(baseFlee)
    expect(
      decidePredatorHumanIntent({
        ...base,
        hunger: 0.95,
        humanDistance: 9,
        fireNearby: true,
        humanTaste: true,
      }),
    ).toBe('flee')
  })
})

describe('territorialDefense (plan fauna-034 §5/§8)', () => {
  it('0 (or absent) reproduces the exact pre-plan score for representative wolf/fox/bear cases', () => {
    const wolfNoField = scorePredatorHumanIntents({ ...base, hunger: 0.7, kind: 'wolf' })
    const wolfZero = scorePredatorHumanIntents({ ...base, hunger: 0.7, kind: 'wolf', territorialDefense: 0 })
    expect(wolfZero).toEqual(wolfNoField)

    const foxNoField = scorePredatorHumanIntents({ ...base, hunger: 0.3, kind: 'fox' })
    const foxZero = scorePredatorHumanIntents({ ...base, hunger: 0.3, kind: 'fox', territorialDefense: 0 })
    expect(foxZero).toEqual(foxNoField)

    const bearNoField = scorePredatorHumanIntents({ ...base, hunger: 0.5, kind: 'bear' })
    const bearZero = scorePredatorHumanIntents({ ...base, hunger: 0.5, kind: 'bear', territorialDefense: 0 })
    expect(bearZero).toEqual(bearNoField)
  })

  it('raises attack score and lowers flee score as strength rises', () => {
    const none = scorePredatorHumanIntents({ ...base, hunger: 0.3, territorialDefense: 0 })
    const partial = scorePredatorHumanIntents({ ...base, hunger: 0.3, territorialDefense: 0.5 })
    const full = scorePredatorHumanIntents({ ...base, hunger: 0.3, territorialDefense: 1 })
    const attack = (scored: typeof none) => scored.find((c) => c.kind === 'attack')!.score
    const flee = (scored: typeof none) => scored.find((c) => c.kind === 'flee')!.score
    expect(attack(partial)).toBeGreaterThan(attack(none))
    expect(attack(full)).toBeGreaterThan(attack(partial))
    expect(flee(partial)).toBeLessThan(flee(none))
    expect(flee(full)).toBeLessThan(flee(partial))
  })

  it('a defended wolf near its den can flip a low-hunger flee into attack', () => {
    // Low hunger alone flees (see `decidePredatorHumanIntent`'s own test
    // above); a strong den-defense signal can outweigh that baseline fear.
    expect(decidePredatorHumanIntent({ ...base, hunger: 0.2, humanDistance: 8 })).toBe('flee')
    expect(
      decidePredatorHumanIntent({ ...base, hunger: 0.2, humanDistance: 8, territorialDefense: 1 }),
    ).toBe('attack')
  })

  it('fire and crowd suppression still apply on top of a defended den', () => {
    const defended = decidePredatorHumanIntent({
      ...base,
      hunger: 0.2,
      humanDistance: 8,
      territorialDefense: 1,
      fireNearby: true,
    })
    expect(defended).toBe('flee')
  })

  it('provoked low-HP flee remains a hard override even with full territorial strength', () => {
    expect(
      decidePredatorHumanIntent({
        ...base,
        hunger: 0.9,
        provoked: true,
        selfHpRatio: PROVOKED_FLEE_HP_RATIO - 0.05,
        territorialDefense: 1,
      }),
    ).toBe('flee')
  })

  it('humanTaste and territorialDefense compose independently', () => {
    const neither = scorePredatorHumanIntents({ ...base, hunger: 0.7, humanDistance: 8 })
    const tasteOnly = scorePredatorHumanIntents({ ...base, hunger: 0.7, humanDistance: 8, humanTaste: true })
    const territorialOnly = scorePredatorHumanIntents({
      ...base, hunger: 0.7, humanDistance: 8, territorialDefense: 0.6,
    })
    const both = scorePredatorHumanIntents({
      ...base, hunger: 0.7, humanDistance: 8, humanTaste: true, territorialDefense: 0.6,
    })
    const attack = (scored: typeof neither) => scored.find((c) => c.kind === 'attack')!.score
    // Both individually raise attack score above baseline, and combining
    // them raises it further than either alone.
    expect(attack(tasteOnly)).toBeGreaterThan(attack(neither))
    expect(attack(territorialOnly)).toBeGreaterThan(attack(neither))
    expect(attack(both)).toBeGreaterThan(attack(tasteOnly))
    expect(attack(both)).toBeGreaterThan(attack(territorialOnly))
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
