import { describe, expect, it } from 'vitest'
import { MOVE_SPEED, SPRINT_MULTIPLIER } from '../player/PlayerController'
import { ridingSpeedMultiplier, SKILL_MIN_VALUE } from '../player/PlayerSkills'
import { ANIMAL_DEFS } from './AnimalAgent'

// Plan fauna-008 — "Every rideable horse must always be faster than the
// human player, even at minimum Riding skill." Verifies the invariant at
// the data level (base `AnimalDef` speed * the resolved Riding multiplier)
// rather than instantiating a full `AnimalAgent`, matching the pure-mapping
// test style the rest of `PlayerSkills`'s skill-effect functions use.

const HUMAN_WALK_SPEED = MOVE_SPEED
const HUMAN_SPRINT_SPEED = MOVE_SPEED * SPRINT_MULTIPLIER

const RIDEABLE_KINDS = Object.values(ANIMAL_DEFS).filter((def) => def.mount)

describe('rideable species vs. human speed invariant', () => {
  it('has at least one rideable species defined', () => {
    expect(RIDEABLE_KINDS.length).toBeGreaterThan(0)
  })

  it('every rideable species walk/sprint baseline beats the human, even at minimum Riding', () => {
    const minMultiplier = ridingSpeedMultiplier(SKILL_MIN_VALUE)
    for (const def of RIDEABLE_KINDS) {
      expect(def.walkSpeed * minMultiplier).toBeGreaterThan(HUMAN_WALK_SPEED)
      expect(def.sprintSpeed * minMultiplier).toBeGreaterThan(HUMAN_SPRINT_SPEED)
    }
  })

  it('the slowest rideable species (donkey) still clears both thresholds', () => {
    const donkey = ANIMAL_DEFS.donkey
    const minMultiplier = ridingSpeedMultiplier(SKILL_MIN_VALUE)
    expect(donkey.walkSpeed * minMultiplier).toBeGreaterThan(HUMAN_WALK_SPEED)
    expect(donkey.sprintSpeed * minMultiplier).toBeGreaterThan(HUMAN_SPRINT_SPEED)
  })

  it('the invariant only strengthens as Riding skill increases (multiplier is >= 1)', () => {
    for (const value of [SKILL_MIN_VALUE, 0.5, 0.8, 1]) {
      expect(ridingSpeedMultiplier(value)).toBeGreaterThanOrEqual(1)
    }
  })
})
