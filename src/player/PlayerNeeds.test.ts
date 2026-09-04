import { describe, expect, it } from 'vitest'
import { createHealthState } from '../shared/HealthState'
import { HUNGER_STARVING_THRESHOLD } from '../shared/HungerState'
import { THIRST_DEHYDRATED_THRESHOLD } from '../shared/ThirstState'
import { drainVigor } from '../shared/VigorState'
import {
  applyRepresentedPhysicalEffortVigor,
  createPlayerNeeds,
  drinkWater,
  eatFood,
  hungerSevereDurationSec,
  isTakingDeprivationDamage,
  physicalEffortStaminaCostPerSec,
  physicalEffortVigorCostPerSec,
  restoreNeedsFromSleep,
  restorePersistedNeeds,
  thirstSevereDurationSec,
  tickHealthRegen,
  tickPlayerMovementVigor,
  tickPlayerNeeds,
  tickPlayerStamina,
  tickRidingStamina,
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

  it('still fills stamina in full and restores vigor by quality * max, clamped to max', () => {
    const needs = createPlayerNeeds()
    needs.vigor.current = 10
    needs.stamina.current = 10
    restoreNeedsFromSleep(needs, 0.5)
    expect(needs.vigor.current).toBe(60)
    expect(needs.stamina.current).toBe(100)
  })

  it('regression: still restores Vigor even when it is above the quality threshold after the sleep skip', () => {
    // Sleep Vigor Recovery bug: the old `Math.max(current, max * quality)`
    // treated `quality` as a target level, so once Vigor (after 8h of
    // passive drain during the skip) was already above `max * quality`,
    // the restore was a no-op — sleep could give back nothing at all.
    const needs = createPlayerNeeds()
    needs.vigor.current = 70 // e.g. drained from 80 over an 8h skip
    const vigorBeforeRestore = needs.vigor.current
    restoreNeedsFromSleep(needs, 0.3) // low-quality bivouac: threshold well below 70
    expect(needs.vigor.current).toBeGreaterThan(vigorBeforeRestore)
  })

  it('never restores Vigor past max', () => {
    const needs = createPlayerNeeds()
    needs.vigor.current = 95
    restoreNeedsFromSleep(needs, 1)
    expect(needs.vigor.current).toBe(100)
  })

  it('higher rest quality restores more Vigor than lower quality from the same starting point', () => {
    const low = createPlayerNeeds()
    low.vigor.current = 40
    restoreNeedsFromSleep(low, 0.3)

    const high = createPlayerNeeds()
    high.vigor.current = 40
    restoreNeedsFromSleep(high, 0.8)

    expect(high.vigor.current).toBeGreaterThan(low.vigor.current)
  })

  it('low Vigor still regenerates correctly and stays clamped to max', () => {
    const needs = createPlayerNeeds()
    needs.vigor.current = 5
    restoreNeedsFromSleep(needs, 1)
    expect(needs.vigor.current).toBe(100)
  })
})

describe('tickPlayerStamina — recovery gate (plan items-player-003 §2)', () => {
  it('regenerates normally when recoveryAllowed is left at its default', () => {
    const needs = createPlayerNeeds()
    needs.stamina.current = 50
    tickPlayerStamina(needs.stamina, 1, false)
    expect(needs.stamina.current).toBeGreaterThan(50)
  })

  it('suppresses regeneration while recoveryAllowed is false, without draining', () => {
    const needs = createPlayerNeeds()
    needs.stamina.current = 50
    tickPlayerStamina(needs.stamina, 1, false, false)
    expect(needs.stamina.current).toBe(50)
  })

  it('still drains while sprinting regardless of recoveryAllowed', () => {
    const needs = createPlayerNeeds()
    needs.stamina.current = 50
    tickPlayerStamina(needs.stamina, 1, true, false)
    expect(needs.stamina.current).toBeLessThan(50)
  })
})

describe('physical effort profile (plan items-player-003 §4)', () => {
  it('preserves light < moderate <= heavy for both Stamina and Vigor cost', () => {
    expect(physicalEffortStaminaCostPerSec('light')).toBeLessThan(physicalEffortStaminaCostPerSec('moderate'))
    expect(physicalEffortStaminaCostPerSec('moderate')).toBeLessThan(physicalEffortStaminaCostPerSec('heavy'))
    expect(physicalEffortVigorCostPerSec('light', DAY_LENGTH_SEC)).toBeLessThan(physicalEffortVigorCostPerSec('moderate', DAY_LENGTH_SEC))
    expect(physicalEffortVigorCostPerSec('moderate', DAY_LENGTH_SEC)).toBeLessThan(physicalEffortVigorCostPerSec('heavy', DAY_LENGTH_SEC))
  })

  it('moderate physical work drains Vigor faster than plain walking', () => {
    const walking = createPlayerNeeds()
    tickPlayerMovementVigor(walking.vigor, 10, false, DAY_LENGTH_SEC)

    const working = createPlayerNeeds()
    drainVigor(working.vigor, physicalEffortVigorCostPerSec('moderate', DAY_LENGTH_SEC) * 10)

    expect(working.vigor.current).toBeLessThan(walking.vigor.current)
  })

  it('represented-hours Vigor cost is invariant to how many real seconds the channel took', () => {
    // Plan §5 — a 2h represented work session must cost the same Vigor
    // whether the BusyAction/TimeSkip channel representing it ran for 8
    // real seconds or 20.
    const fast = createPlayerNeeds()
    applyRepresentedPhysicalEffortVigor(fast.vigor, 'heavy', 2)

    const slow = createPlayerNeeds()
    applyRepresentedPhysicalEffortVigor(slow.vigor, 'heavy', 2)

    expect(fast.vigor.current).toBeCloseTo(slow.vigor.current, 10)
  })

  it('represented-hours Vigor cost scales with the credited fraction (partial cancellation)', () => {
    const full = createPlayerNeeds()
    applyRepresentedPhysicalEffortVigor(full.vigor, 'heavy', 2)

    const half = createPlayerNeeds()
    applyRepresentedPhysicalEffortVigor(half.vigor, 'heavy', 1)

    expect(half.vigor.current).toBeGreaterThan(full.vigor.current)
  })

  it('a zero/negative represented-hours delta costs nothing', () => {
    const needs = createPlayerNeeds()
    applyRepresentedPhysicalEffortVigor(needs.vigor, 'heavy', 0)
    applyRepresentedPhysicalEffortVigor(needs.vigor, 'heavy', -1)
    expect(needs.vigor.current).toBe(needs.vigor.max)
  })
})

describe('tickRidingStamina (plan fauna-008 — Riding-derived drain)', () => {
  it('drains at exactly the 3/s baseline when the multiplier is left at its default (minimum Riding)', () => {
    const needs = createPlayerNeeds()
    needs.stamina.current = 50
    tickRidingStamina(needs.stamina, 1, true)
    expect(needs.stamina.current).toBeCloseTo(47)
  })

  it('a lower multiplier drains less stamina, and the reduction is monotonic', () => {
    // Higher multiplier -> more drain -> less stamina left after the tick.
    let previousRemaining = -Infinity
    for (const multiplier of [1, 0.85, 0.7, 0.5]) {
      const needs = createPlayerNeeds()
      needs.stamina.current = 50
      tickRidingStamina(needs.stamina, 1, true, multiplier)
      expect(needs.stamina.current).toBeGreaterThan(previousRemaining)
      previousRemaining = needs.stamina.current
    }
  })

  it('stationary riding still regenerates at the normal rate regardless of the multiplier', () => {
    const needs = createPlayerNeeds()
    needs.stamina.current = 50
    tickRidingStamina(needs.stamina, 1, false, 0.5)
    expect(needs.stamina.current).toBeCloseTo(62)
  })
})

describe('restorePersistedNeeds (plan 200 — save continuity)', () => {
  it('restores starvation/dehydration duration from a save, not just hunger/thirst/vigor', () => {
    const needs = createPlayerNeeds()
    restorePersistedNeeds(needs, {
      hunger: 40, thirst: 30, vigor: 60, starvationDuration: 5400, dehydrationDuration: 900,
    })
    expect(needs.hunger.current).toBe(40)
    expect(needs.thirst.current).toBe(30)
    expect(needs.vigor.current).toBe(60)
    expect(needs.starvationDuration).toBe(5400)
    expect(needs.dehydrationDuration).toBe(900)
  })

  it('clamps negative duration values defensively, like the existing pool clamps', () => {
    const needs = createPlayerNeeds()
    restorePersistedNeeds(needs, {
      hunger: 100, thirst: 100, vigor: 100, starvationDuration: -5, dehydrationDuration: -1,
    })
    expect(needs.starvationDuration).toBe(0)
    expect(needs.dehydrationDuration).toBe(0)
  })
})
