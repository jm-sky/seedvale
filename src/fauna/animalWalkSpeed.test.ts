import { describe, expect, it } from 'vitest'
import { ANIMAL_DEFS } from './animalDefs'
import { ANIMAL_VARIANT_DEFS } from './animalVariants'
import {
  calmWanderWalkBaseline,
  NIGHT_PREY_WALK_MULT,
  resolveAutonomousWalkSpeed,
} from './animalWalkSpeed'

describe('calm settlement wander gait (fauna-038)', () => {
  it('horse has calmWalkSpeed below autonomous walkSpeed', () => {
    const horse = ANIMAL_DEFS.horse
    expect(horse.calmWalkSpeed).toBeDefined()
    expect(horse.calmWalkSpeed!).toBeLessThan(horse.walkSpeed)
    expect(horse.walkSpeed).toBe(2.6)
    expect(horse.sprintSpeed).toBe(6.0)
  })

  it('horse mount speeds stay independent of calmWalkSpeed', () => {
    const horse = ANIMAL_DEFS.horse
    expect(horse.mount!.walkSpeed).toBe(10.5)
    expect(horse.mount!.sprintSpeed).toBe(17.5)
    expect(horse.mount!.walkSpeed).toBeGreaterThan(horse.calmWalkSpeed!)
    expect(horse.mount!.walkSpeed).toBeGreaterThan(horse.walkSpeed)
  })

  it('species without calmWalkSpeed keep legacy wander baseline', () => {
    const cow = ANIMAL_DEFS.cow
    expect(cow.calmWalkSpeed).toBeUndefined()
    expect(calmWanderWalkBaseline(cow)).toBe(cow.walkSpeed)

    const donkey = ANIMAL_DEFS.donkey
    expect(donkey.calmWalkSpeed).toBeUndefined()
    expect(calmWanderWalkBaseline(donkey)).toBe(donkey.walkSpeed)
  })

  it('calm baseline selects calmWalkSpeed when present', () => {
    expect(calmWanderWalkBaseline(ANIMAL_DEFS.horse)).toBe(ANIMAL_DEFS.horse.calmWalkSpeed)
  })

  it('resolveAutonomousWalkSpeed applies variant speedMultiplier', () => {
    const base = calmWanderWalkBaseline(ANIMAL_DEFS.horse)
    const mult = ANIMAL_VARIANT_DEFS.alpha.speedMultiplier
    expect(resolveAutonomousWalkSpeed(base, {
      isNight: false,
      role: 'livestock',
      speedMultiplier: mult,
    })).toBe(base * mult)
  })

  it('resolveAutonomousWalkSpeed preserves prey night slowdown only', () => {
    const walk = ANIMAL_DEFS.sheep.walkSpeed
    expect(resolveAutonomousWalkSpeed(walk, {
      isNight: true,
      role: 'prey',
      speedMultiplier: 1,
    })).toBe(walk * NIGHT_PREY_WALK_MULT)

    expect(resolveAutonomousWalkSpeed(walk, {
      isNight: true,
      role: 'livestock',
      speedMultiplier: 1,
    })).toBe(walk)

    const horseCalm = calmWanderWalkBaseline(ANIMAL_DEFS.horse)
    expect(resolveAutonomousWalkSpeed(horseCalm, {
      isNight: true,
      role: 'livestock',
      speedMultiplier: 1,
    })).toBe(horseCalm)
  })

  it('absent calmWalkSpeed + modifiers matches purposeful walk result shape', () => {
    const def = ANIMAL_DEFS.deer
    const purposeful = resolveAutonomousWalkSpeed(def.walkSpeed, {
      isNight: true,
      role: def.role,
      speedMultiplier: 1.05,
    })
    const calm = resolveAutonomousWalkSpeed(calmWanderWalkBaseline(def), {
      isNight: true,
      role: def.role,
      speedMultiplier: 1.05,
    })
    expect(calm).toBe(purposeful)
  })
})
