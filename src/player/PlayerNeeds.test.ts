import { describe, expect, it } from 'vitest'
import { createHealthState } from '../shared/HealthState'
import { HUNGER_STARVING_THRESHOLD } from '../shared/HungerState'
import { THIRST_DEHYDRATED_THRESHOLD } from '../shared/ThirstState'
import {
  createPlayerNeeds,
  drinkWater,
  eatFood,
  HUNGER_SEVERE_DURATION_SEC,
  isTakingDeprivationDamage,
  restoreNeedsFromSleep,
  THIRST_SEVERE_DURATION_SEC,
  tickHealthRegen,
  tickPlayerMovementVigor,
  tickPlayerNeeds,
} from './PlayerNeeds'

describe('tickPlayerNeeds — Vigor passive drain', () => {
  it('idle drain over 24 game hours costs about 1 Vigor at the default day length', () => {
    const needs = createPlayerNeeds()
    // 24 game hours at the default dayLengthSec=480 is 480 sim-seconds.
    tickPlayerNeeds(needs, 480)
    expect(needs.vigor.current).toBeCloseTo(99, 1)
  })

  it('is independent of how the same total dt is split across ticks', () => {
    const a = createPlayerNeeds()
    tickPlayerNeeds(a, 480)

    const b = createPlayerNeeds()
    for (let i = 0; i < 480; i++) tickPlayerNeeds(b, 1)

    expect(b.vigor.current).toBeCloseTo(a.vigor.current, 6)
  })
})

describe('tickPlayerMovementVigor', () => {
  it('drains extra Vigor beyond the idle baseline while moving', () => {
    const idle = createPlayerNeeds()
    tickPlayerNeeds(idle, 10)

    const moving = createPlayerNeeds()
    tickPlayerNeeds(moving, 10)
    tickPlayerMovementVigor(moving.vigor, 10, false)

    expect(moving.vigor.current).toBeLessThan(idle.vigor.current)
  })

  it('sprinting drains more than walking', () => {
    const walking = createPlayerNeeds()
    tickPlayerMovementVigor(walking.vigor, 10, false)

    const sprinting = createPlayerNeeds()
    tickPlayerMovementVigor(sprinting.vigor, 10, true)

    expect(sprinting.vigor.current).toBeLessThan(walking.vigor.current)
  })
})

describe('starvation/dehydration duration', () => {
  it('does not advance above the critical threshold', () => {
    const needs = createPlayerNeeds()
    needs.hunger.current = HUNGER_STARVING_THRESHOLD + 5
    tickPlayerNeeds(needs, 1)
    expect(needs.starvationDuration).toBe(0)
  })

  it('starts accumulating once crossing the critical threshold', () => {
    const needs = createPlayerNeeds()
    needs.hunger.current = HUNGER_STARVING_THRESHOLD
    tickPlayerNeeds(needs, 10)
    expect(needs.starvationDuration).toBeGreaterThan(0)
  })

  it('eating past the critical threshold resets starvation duration on the next tick', () => {
    const needs = createPlayerNeeds()
    needs.hunger.current = HUNGER_STARVING_THRESHOLD
    tickPlayerNeeds(needs, 10)
    expect(needs.starvationDuration).toBeGreaterThan(0)

    eatFood(needs, 50)
    tickPlayerNeeds(needs, 1)
    expect(needs.starvationDuration).toBe(0)
  })

  it('drinking past the critical threshold resets dehydration duration on the next tick', () => {
    const needs = createPlayerNeeds()
    needs.thirst.current = THIRST_DEHYDRATED_THRESHOLD
    tickPlayerNeeds(needs, 10)
    expect(needs.dehydrationDuration).toBeGreaterThan(0)

    drinkWater(needs, 50)
    tickPlayerNeeds(needs, 1)
    expect(needs.dehydrationDuration).toBe(0)
  })

  it('growing starvation duration drains Vigor/Stamina faster than moderate hunger', () => {
    const moderate = createPlayerNeeds()
    tickPlayerNeeds(moderate, 10)

    const critical = createPlayerNeeds()
    critical.hunger.current = HUNGER_STARVING_THRESHOLD
    critical.starvationDuration = HUNGER_SEVERE_DURATION_SEC
    tickPlayerNeeds(critical, 10)

    expect(critical.vigor.current).toBeLessThan(moderate.vigor.current)
    expect(critical.stamina.current).toBeLessThan(moderate.stamina.current)
  })

  it('thirst uses a shorter severe window than hunger', () => {
    expect(THIRST_SEVERE_DURATION_SEC).toBeLessThan(HUNGER_SEVERE_DURATION_SEC)
  })
})

describe('deprivation HP consequence', () => {
  it('does not apply while hunger is merely critical, before the severe duration gate', () => {
    const needs = createPlayerNeeds()
    needs.hunger.current = HUNGER_STARVING_THRESHOLD
    needs.starvationDuration = HUNGER_SEVERE_DURATION_SEC - 1
    expect(isTakingDeprivationDamage(needs)).toBe(false)
  })

  it('applies once starvation duration reaches its severe gate', () => {
    const needs = createPlayerNeeds()
    needs.starvationDuration = HUNGER_SEVERE_DURATION_SEC
    expect(isTakingDeprivationDamage(needs)).toBe(true)
  })

  it('suppresses passive HP regen while deprivation damage is active', () => {
    const needs = createPlayerNeeds()
    needs.starvationDuration = HUNGER_SEVERE_DURATION_SEC
    const health = createHealthState(100)
    health.currentHp = 50
    tickHealthRegen(needs, health, 5)
    expect(health.currentHp).toBe(50)
  })

  it('regenerates HP normally once no longer critical', () => {
    const needs = createPlayerNeeds()
    const health = createHealthState(100)
    health.currentHp = 50
    tickHealthRegen(needs, health, 5)
    expect(health.currentHp).toBeGreaterThan(50)
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
