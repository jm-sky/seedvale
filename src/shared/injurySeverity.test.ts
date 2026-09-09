import { describe, expect, it } from 'vitest'
import { PLAYER_STARTING_ATTRIBUTES } from '../player/PlayerController'
import {
  applyInjuryModifiersToAttributes,
  criticalInjuryFloor,
  decreaseInjuryFromHeal,
  increaseInjuryFromDamage,
  INJURY_SEVERITY_THRESHOLDS,
  INJURY_SPEA_PENALTY,
  injurySpeaPenalties,
  naturalInjuryRecoveryHp,
  representativeInjuryAmount,
  resolveInjurySeverity,
} from './injurySeverity'

describe('resolveInjurySeverity (plan npc-025)', () => {
  it('is none when physicalInjury is 0', () => {
    expect(resolveInjurySeverity(0, 100)).toBe('none')
    expect(resolveInjurySeverity(-1, 100)).toBe('none')
  })

  it('maps low / medium / high relative injury onto minor / serious / critical', () => {
    expect(resolveInjurySeverity(1, 100)).toBe('minor')
    expect(resolveInjurySeverity(100 * INJURY_SEVERITY_THRESHOLDS.serious - 0.01, 100)).toBe('minor')
    expect(resolveInjurySeverity(100 * INJURY_SEVERITY_THRESHOLDS.serious, 100)).toBe('serious')
    expect(resolveInjurySeverity(40, 100)).toBe('serious')
    expect(resolveInjurySeverity(100 * INJURY_SEVERITY_THRESHOLDS.critical - 0.01, 100)).toBe('serious')
    expect(resolveInjurySeverity(100 * INJURY_SEVERITY_THRESHOLDS.critical, 100)).toBe('critical')
    expect(resolveInjurySeverity(80, 100)).toBe('critical')
  })

  it('is deterministic and changes immediately when injury changes', () => {
    expect(resolveInjurySeverity(20, 100)).toBe(resolveInjurySeverity(20, 100))
    expect(resolveInjurySeverity(20, 100)).toBe('minor')
    expect(resolveInjurySeverity(30, 100)).toBe('serious')
  })

  it('does not treat generic HP deficit as injury — only the injury amount', () => {
    expect(resolveInjurySeverity(0, 100)).toBe('none')
  })
})

describe('injury accounting', () => {
  it('increaseInjuryFromDamage adds the actual HP loss', () => {
    expect(increaseInjuryFromDamage(0, 15)).toBe(15)
    expect(increaseInjuryFromDamage(10, 5)).toBe(15)
  })

  it('increaseInjuryFromDamage no-ops for a non-positive loss', () => {
    expect(increaseInjuryFromDamage(10, 0)).toBe(10)
    expect(increaseInjuryFromDamage(10, -5)).toBe(10)
  })

  it('decreaseInjuryFromHeal subtracts the actual HP restored and never goes negative', () => {
    expect(decreaseInjuryFromHeal(20, 8)).toBe(12)
    expect(decreaseInjuryFromHeal(5, 35)).toBe(0)
    expect(decreaseInjuryFromHeal(10, 0)).toBe(10)
  })
})

describe('injury SPEA modifiers', () => {
  it('applies no modifier when there is no injury', () => {
    expect(applyInjuryModifiersToAttributes(PLAYER_STARTING_ATTRIBUTES, 0, 100)).toEqual(
      PLAYER_STARTING_ATTRIBUTES,
    )
  })

  it('scales monotonically and stays bounded, leaving Perception untouched', () => {
    const minor = injurySpeaPenalties('minor').strength
    const serious = injurySpeaPenalties('serious').strength
    const critical = injurySpeaPenalties('critical').strength
    expect(serious).toBeLessThan(minor)
    expect(critical).toBeLessThan(serious)
    expect(critical).toBeGreaterThanOrEqual(-0.2)
    expect(injurySpeaPenalties('critical').endurance).toBe(critical)
    expect(injurySpeaPenalties('critical').agility).toBe(critical)

    const injured = applyInjuryModifiersToAttributes(PLAYER_STARTING_ATTRIBUTES, 80, 100)
    expect(injured.perception).toBe(PLAYER_STARTING_ATTRIBUTES.perception)
    expect(injured.strength).toBeCloseTo(
      PLAYER_STARTING_ATTRIBUTES.strength - INJURY_SPEA_PENALTY.critical,
    )
    expect(applyInjuryModifiersToAttributes(PLAYER_STARTING_ATTRIBUTES, 80, 100)).toEqual(injured)
  })

  it('clears modifiers once injury is fully recovered', () => {
    const recovered = applyInjuryModifiersToAttributes(PLAYER_STARTING_ATTRIBUTES, 0, 100)
    expect(recovered).toEqual(PLAYER_STARTING_ATTRIBUTES)
  })
})

describe('natural recovery policy', () => {
  it('lets minor injury resolve faster than serious', () => {
    const minor = naturalInjuryRecoveryHp(20, 100, 1)
    const serious = naturalInjuryRecoveryHp(40, 100, 1)
    expect(minor).toBeGreaterThan(serious)
    expect(minor).toBeGreaterThan(0)
  })

  it('lets serious injury fully resolve given enough time', () => {
    expect(naturalInjuryRecoveryHp(40, 100, 20)).toBe(40)
  })

  it('cannot naturally cross the critical → serious boundary', () => {
    const floor = criticalInjuryFloor(100)
    expect(naturalInjuryRecoveryHp(80, 100, 100)).toBeCloseTo(80 - floor)
    expect(resolveInjurySeverity(80 - naturalInjuryRecoveryHp(80, 100, 100), 100)).toBe('critical')
  })

  it('never recovers more than outstanding injury', () => {
    expect(naturalInjuryRecoveryHp(5, 100, 10)).toBe(5)
    expect(naturalInjuryRecoveryHp(0, 100, 10)).toBe(0)
  })

  it('uses representative debug amounts that land in the requested band', () => {
    expect(resolveInjurySeverity(representativeInjuryAmount('minor', 100), 100)).toBe('minor')
    expect(resolveInjurySeverity(representativeInjuryAmount('serious', 100), 100)).toBe('serious')
    expect(resolveInjurySeverity(representativeInjuryAmount('critical', 100), 100)).toBe('critical')
  })
})
