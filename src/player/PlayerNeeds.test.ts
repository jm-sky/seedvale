import { describe, expect, it } from 'vitest'
import { createHealthState } from '../shared/HealthState'
import { HUNGER_STARVING_THRESHOLD } from '../shared/HungerState'
import { THIRST_DEHYDRATED_THRESHOLD } from '../shared/ThirstState'
import {
  createPlayerNeeds,
  drinkWater,
  eatFood,
  hungerSevereDurationSec,
  isTakingDeprivationDamage,
  restoreNeedsFromSleep,
  thirstSevereDurationSec,
  tickHealthRegen,
  tickPlayerMovementVigor,
  tickPlayerNeeds,
} from './PlayerNeeds'

const DAY_LENGTH_SEC = 480

describe('tickPlayerNeeds — Vigor passive drain', () => {
  it('idle drain over 24 game hours costs about 1 Vigor at the default day length', () => {
    const needs = createPlayerNeeds()
    // 24 game hours at the default dayLengthSec=480 is 480 sim-seconds.
    tickPlayerNeeds(needs, 480, DAY_LENGTH_SEC)
    expect(needs.vigor.current).toBeCloseTo(99, 1)
  })

  it('is independent of how the same total dt is split across ticks', () => {
    const a = createPlayerNeeds()
    tickPlayerNeeds(a, 480, DAY_LENGTH_SEC)

    const b = createPlayerNeeds()
    for (let i = 0; i < 480; i++) tickPlayerNeeds(b, 1, DAY_LENGTH_SEC)

    expect(b.vigor.current).toBeCloseTo(a.vigor.current, 6)
  })
})

describe('tickPlayerMovementVigor', () => {
  it('drains extra Vigor beyond the idle baseline while moving', () => {
    const idle = createPlayerNeeds()
    tickPlayerNeeds(idle, 10, DAY_LENGTH_SEC)

    const moving = createPlayerNeeds()
    tickPlayerNeeds(moving, 10, DAY_LENGTH_SEC)
    tickPlayerMovementVigor(moving.vigor, 10, false, DAY_LENGTH_SEC)

    expect(moving.vigor.current).toBeLessThan(idle.vigor.current)
  })

  it('sprinting drains more than walking', () => {
    const walking = createPlayerNeeds()
    tickPlayerMovementVigor(walking.vigor, 10, false, DAY_LENGTH_SEC)

    const sprinting = createPlayerNeeds()
    tickPlayerMovementVigor(sprinting.vigor, 10, true, DAY_LENGTH_SEC)

    expect(sprinting.vigor.current).toBeLessThan(walking.vigor.current)
  })
})

describe('starvation/dehydration duration', () => {
  it('does not advance above the critical threshold', () => {
    const needs = createPlayerNeeds()
    needs.hunger.current = HUNGER_STARVING_THRESHOLD + 5
    tickPlayerNeeds(needs, 1, DAY_LENGTH_SEC)
    expect(needs.starvationDuration).toBe(0)
  })

  it('starts accumulating once crossing the critical threshold', () => {
    const needs = createPlayerNeeds()
    needs.hunger.current = HUNGER_STARVING_THRESHOLD
    tickPlayerNeeds(needs, 10, DAY_LENGTH_SEC)
    expect(needs.starvationDuration).toBeGreaterThan(0)
  })

  it('eating past the critical threshold resets starvation duration on the next tick', () => {
    const needs = createPlayerNeeds()
    needs.hunger.current = HUNGER_STARVING_THRESHOLD
    tickPlayerNeeds(needs, 10, DAY_LENGTH_SEC)
    expect(needs.starvationDuration).toBeGreaterThan(0)

    eatFood(needs, 50)
    tickPlayerNeeds(needs, 1, DAY_LENGTH_SEC)
    expect(needs.starvationDuration).toBe(0)
  })

  it('drinking past the critical threshold resets dehydration duration on the next tick', () => {
    const needs = createPlayerNeeds()
    needs.thirst.current = THIRST_DEHYDRATED_THRESHOLD
    tickPlayerNeeds(needs, 10, DAY_LENGTH_SEC)
    expect(needs.dehydrationDuration).toBeGreaterThan(0)

    drinkWater(needs, 50)
    tickPlayerNeeds(needs, 1, DAY_LENGTH_SEC)
    expect(needs.dehydrationDuration).toBe(0)
  })

  it('growing starvation duration drains Vigor/Stamina faster than moderate hunger', () => {
    const moderate = createPlayerNeeds()
    tickPlayerNeeds(moderate, 10, DAY_LENGTH_SEC)

    const critical = createPlayerNeeds()
    critical.hunger.current = HUNGER_STARVING_THRESHOLD
    critical.starvationDuration = hungerSevereDurationSec(DAY_LENGTH_SEC)
    tickPlayerNeeds(critical, 10, DAY_LENGTH_SEC)

    expect(critical.vigor.current).toBeLessThan(moderate.vigor.current)
    expect(critical.stamina.current).toBeLessThan(moderate.stamina.current)
  })

  it('thirst uses a shorter severe window than hunger, at any day length', () => {
    for (const dayLengthSec of [480, 600, 240]) {
      expect(thirstSevereDurationSec(dayLengthSec)).toBeLessThan(hungerSevereDurationSec(dayLengthSec))
    }
  })
})

describe('deprivation HP consequence', () => {
  it('does not apply while hunger is merely critical, before the severe duration gate', () => {
    const needs = createPlayerNeeds()
    needs.hunger.current = HUNGER_STARVING_THRESHOLD
    needs.starvationDuration = hungerSevereDurationSec(DAY_LENGTH_SEC) - 1
    expect(isTakingDeprivationDamage(needs, DAY_LENGTH_SEC)).toBe(false)
  })

  it('applies once starvation duration reaches its severe gate', () => {
    const needs = createPlayerNeeds()
    needs.starvationDuration = hungerSevereDurationSec(DAY_LENGTH_SEC)
    expect(isTakingDeprivationDamage(needs, DAY_LENGTH_SEC)).toBe(true)
  })

  it('suppresses passive HP regen while deprivation damage is active', () => {
    const needs = createPlayerNeeds()
    needs.starvationDuration = hungerSevereDurationSec(DAY_LENGTH_SEC)
    const health = createHealthState(100)
    health.currentHp = 50
    tickHealthRegen(needs, health, 5, DAY_LENGTH_SEC)
    expect(health.currentHp).toBe(50)
  })

  it('regenerates HP normally once no longer critical', () => {
    const needs = createPlayerNeeds()
    const health = createHealthState(100)
    health.currentHp = 50
    tickHealthRegen(needs, health, 5, DAY_LENGTH_SEC)
    expect(health.currentHp).toBeGreaterThan(50)
  })
})

describe('game-day tuning stays fixed as dayLengthSec changes (plan 192)', () => {
  it('hunger/thirst take the same number of game-days to empty at any day length', () => {
    for (const dayLengthSec of [480, 600, 240]) {
      // Hunger is tuned to empty over 3 game-days: tick for exactly that
      // many real/sim seconds (3 * dayLengthSec) and the pool should be
      // fully drained regardless of how long a game-day actually is.
      const needs = createPlayerNeeds()
      tickPlayerNeeds(needs, 3 * dayLengthSec, dayLengthSec)
      expect(needs.hunger.current).toBeCloseTo(0, 6)
    }
  })

  it('the severe-duration gate stays a fixed number of game-days regardless of dayLengthSec', () => {
    for (const dayLengthSec of [480, 600, 240]) {
      // Hunger's severe gate is 3 game-days — expressed in real/sim seconds
      // that must scale linearly with dayLengthSec, not stay a fixed 1440.
      expect(hungerSevereDurationSec(dayLengthSec)).toBeCloseTo(3 * dayLengthSec, 10)
      expect(thirstSevereDurationSec(dayLengthSec)).toBeCloseTo(1.5 * dayLengthSec, 10)
    }
  })

  it('idle vigor drain over 24 game hours costs the same amount at any day length', () => {
    for (const dayLengthSec of [480, 600, 240]) {
      const needs = createPlayerNeeds()
      tickPlayerNeeds(needs, dayLengthSec, dayLengthSec)
      expect(needs.vigor.current).toBeCloseTo(99, 6)
    }
  })
})

describe('restoreNeedsFromSleep', () => {
  it('does not touch starvation/dehydration duration', () => {
    const needs = createPlayerNeeds()
    needs.starvationDuration = 42
    needs.dehydrationDuration = 7
    restoreNeedsFromSleep(needs, 1)
    expect(needs.starvationDuration).toBe(42)
    expect(needs.dehydrationDuration).toBe(7)
  })

  it('still fills vigor/stamina per quality, unaffected by plan 165 changes', () => {
    const needs = createPlayerNeeds()
    needs.vigor.current = 10
    needs.stamina.current = 10
    restoreNeedsFromSleep(needs, 0.5)
    expect(needs.vigor.current).toBe(50)
    expect(needs.stamina.current).toBe(100)
  })
})
