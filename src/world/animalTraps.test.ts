import { describe, expect, it } from 'vitest'
import {
  createPlayerSkills,
  SKILL_MIN_VALUE,
  xpToSkillValue,
} from '../player/PlayerSkills'
import {
  accumulateTrapWeatherWear,
  isSpeciesTrappable,
  isTrapCooldownActive,
  rollTrapDetection,
  spendTrapDurability,
  startTrapCooldown,
  TRAP_DEFS,
  TRAP_DETECTION_COOLDOWN_DAYS,
  TRAP_MAX_DETECTION,
  TRAP_MIN_DETECTION,
  type TrapCooldowns,
  trapDetectionChance,
  trapDetectionRoll,
  trapKindForItem,
  trapWeatherWear,
} from './animalTraps'
import { type WeatherState } from './weather'

const weather = (type: WeatherState['type'], intensity: number): WeatherState => ({
  type,
  intensity,
  temperature: 10,
  startedAt: 0,
  endsAt: 0.3,
})

describe('trap definitions', () => {
  it('makes `good` strictly the better trap on every axis', () => {
    const { simple, good } = TRAP_DEFS
    expect(good.maxDurability).toBeGreaterThan(simple.maxDurability)
    expect(good.baseDetectionChance).toBeLessThan(simple.baseDetectionChance)
    expect(good.weatherWearMultiplier).toBeLessThan(simple.weatherWearMultiplier)
  })

  it('maps its own item kinds back to the trap kind', () => {
    expect(trapKindForItem(TRAP_DEFS.simple.itemKind)).toBe('simple')
    expect(trapKindForItem(TRAP_DEFS.good.itemKind)).toBe('good')
    expect(trapKindForItem('stone')).toBeNull()
  })
})

describe('trap-kind species compatibility', () => {
  it('lets a simple trap catch small/medium prey', () => {
    expect(isSpeciesTrappable('simple', 'rabbit')).toBe(true)
    expect(isSpeciesTrappable('simple', 'fox')).toBe(true)
    expect(isSpeciesTrappable('simple', 'deer')).toBe(true)
    expect(isSpeciesTrappable('simple', 'boar')).toBe(true)
  })

  it('keeps stag and wolf out of a simple trap', () => {
    expect(isSpeciesTrappable('simple', 'stag')).toBe(false)
    expect(isSpeciesTrappable('simple', 'wolf')).toBe(false)
  })

  it('lets a good trap additionally catch stag and wolf', () => {
    expect(isSpeciesTrappable('good', 'stag')).toBe(true)
    expect(isSpeciesTrappable('good', 'wolf')).toBe(true)
    expect(isSpeciesTrappable('good', 'rabbit')).toBe(true)
    expect(isSpeciesTrappable('good', 'fox')).toBe(true)
    expect(isSpeciesTrappable('good', 'deer')).toBe(true)
    expect(isSpeciesTrappable('good', 'boar')).toBe(true)
  })

  it('rejects bear and livestock/domestic animals from either trap kind', () => {
    for (const kind of ['simple', 'good'] as const) {
      expect(isSpeciesTrappable(kind, 'bear')).toBe(false)
      expect(isSpeciesTrappable(kind, 'cow')).toBe(false)
      expect(isSpeciesTrappable(kind, 'sheep')).toBe(false)
      expect(isSpeciesTrappable(kind, 'horse')).toBe(false)
      expect(isSpeciesTrappable(kind, 'donkey')).toBe(false)
      expect(isSpeciesTrappable(kind, 'dog')).toBe(false)
      expect(isSpeciesTrappable(kind, 'chicken')).toBe(false)
      expect(isSpeciesTrappable(kind, 'rooster')).toBe(false)
    }
  })
})

describe('trapDetectionChance', () => {
  const base = TRAP_DEFS.simple.baseDetectionChance

  it('falls as the Traps skill rises', () => {
    const novice = trapDetectionChance({ baseChance: base, skillValue: SKILL_MIN_VALUE })
    const skilled = trapDetectionChance({ baseChance: base, skillValue: 0.6 })
    const master = trapDetectionChance({ baseChance: base, skillValue: 1 })
    expect(skilled).toBeLessThan(novice)
    expect(master).toBeLessThan(skilled)
  })

  it('never reaches a guaranteed detection or a guaranteed catch', () => {
    expect(trapDetectionChance({ baseChance: base, skillValue: 1 })).toBeGreaterThanOrEqual(TRAP_MIN_DETECTION)
    expect(trapDetectionChance({ baseChance: 5, skillValue: 0 })).toBeLessThanOrEqual(TRAP_MAX_DETECTION)
    expect(trapDetectionChance({ baseChance: base, skillValue: 10 })).toBeGreaterThanOrEqual(TRAP_MIN_DETECTION)
  })

  it('keeps a good trap harder to spot than a simple one at the same skill', () => {
    const simple = trapDetectionChance({ baseChance: TRAP_DEFS.simple.baseDetectionChance, skillValue: 0.5 })
    const good = trapDetectionChance({ baseChance: TRAP_DEFS.good.baseDetectionChance, skillValue: 0.5 })
    expect(good).toBeLessThan(simple)
  })

  it('bait (plan 159) further reduces detection without going below the floor', () => {
    const unbaited = trapDetectionChance({ baseChance: base, skillValue: 0.5 })
    const baited = trapDetectionChance({ baseChance: base, skillValue: 0.5, hasBait: true })
    expect(baited).toBeLessThan(unbaited)
    expect(trapDetectionChance({ baseChance: base, skillValue: 1, hasBait: true })).toBeGreaterThanOrEqual(TRAP_MIN_DETECTION)
  })
})

describe('rollTrapDetection', () => {
  it('detects below the chance and catches at or above it', () => {
    expect(rollTrapDetection(0.4, 0.399)).toBe(true)
    expect(rollTrapDetection(0.4, 0.4)).toBe(false)
    expect(rollTrapDetection(0.4, 0.99)).toBe(false)
  })

  it('is deterministic per (trap, animal, attempt) and varies between them', () => {
    const a = trapDetectionRoll('trap:1', 'rabbit-2', 1)
    expect(trapDetectionRoll('trap:1', 'rabbit-2', 1)).toBe(a)
    expect(trapDetectionRoll('trap:1', 'rabbit-2', 2)).not.toBe(a)
    expect(trapDetectionRoll('trap:2', 'rabbit-2', 1)).not.toBe(a)
    expect(trapDetectionRoll('trap:1', 'rabbit-3', 1)).not.toBe(a)
    expect(a).toBeGreaterThanOrEqual(0)
    expect(a).toBeLessThan(1)
  })
})

describe('durability', () => {
  it('spends exactly one use per capture and stays placed while uses remain', () => {
    const first = spendTrapDurability(TRAP_DEFS.good.maxDurability, 1)
    expect(first.durability).toBe(TRAP_DEFS.good.maxDurability - 1)
    expect(first.state).toBe('placed')
  })

  it('breaks once durability reaches zero', () => {
    expect(spendTrapDurability(1, 1)).toEqual({ durability: 0, state: 'broken' })
    expect(spendTrapDurability(0.4, 1)).toEqual({ durability: 0, state: 'broken' })
  })

  it('ignores negative spend and never goes below zero', () => {
    expect(spendTrapDurability(2, -5).durability).toBe(2)
    expect(spendTrapDurability(2, 99).durability).toBe(0)
  })
})

describe('weather wear', () => {
  it('costs nothing in fair weather', () => {
    expect(trapWeatherWear(weather('clear', 0), TRAP_DEFS.simple)).toBe(0)
    expect(trapWeatherWear(weather('cloudy', 0.8), TRAP_DEFS.simple)).toBe(0)
  })

  it('hits a simple trap much harder than a good one', () => {
    const rain = weather('rain', 0.8)
    expect(trapWeatherWear(rain, TRAP_DEFS.simple))
      .toBeGreaterThan(trapWeatherWear(rain, TRAP_DEFS.good))
  })

  it('scales with intensity', () => {
    expect(trapWeatherWear(weather('snow', 0.9), TRAP_DEFS.simple))
      .toBeGreaterThan(trapWeatherWear(weather('snow', 0.4), TRAP_DEFS.simple))
  })

  it('charges nothing until a weather cycle has actually finished', () => {
    expect(accumulateTrapWeatherWear(7, 10, 10, TRAP_DEFS.simple)).toEqual({ wear: 0, checkedAtDay: 10 })
    expect(accumulateTrapWeatherWear(7, 10, 9, TRAP_DEFS.simple)).toEqual({ wear: 0, checkedAtDay: 10 })
  })

  it('advances the accounting day and is bounded for a huge time skip', () => {
    const step = accumulateTrapWeatherWear(7, 0, 5, TRAP_DEFS.simple)
    expect(step.checkedAtDay).toBeGreaterThan(0)
    expect(step.wear).toBeGreaterThanOrEqual(0)
    const skipped = accumulateTrapWeatherWear(7, 0, 5000, TRAP_DEFS.simple)
    expect(skipped.checkedAtDay).toBe(5000)
  })

  it('is deterministic for the same (seed, window)', () => {
    expect(accumulateTrapWeatherWear(11, 0, 4, TRAP_DEFS.simple))
      .toEqual(accumulateTrapWeatherWear(11, 0, 4, TRAP_DEFS.simple))
  })
})

describe('detection cooldown', () => {
  it('blocks the same animal on the same trap until it expires', () => {
    const cooldowns: TrapCooldowns = new Map()
    startTrapCooldown(cooldowns, 'rabbit-1', 10)
    expect(isTrapCooldownActive(cooldowns, 'rabbit-1', 10)).toBe(true)
    expect(isTrapCooldownActive(cooldowns, 'rabbit-1', 10 + TRAP_DETECTION_COOLDOWN_DAYS / 2)).toBe(true)
    expect(isTrapCooldownActive(cooldowns, 'rabbit-1', 10 + TRAP_DETECTION_COOLDOWN_DAYS)).toBe(false)
  })

  it('does not block another animal', () => {
    const cooldowns: TrapCooldowns = new Map()
    startTrapCooldown(cooldowns, 'rabbit-1', 10)
    expect(isTrapCooldownActive(cooldowns, 'boar-4', 10)).toBe(false)
  })

  it('is per trap — each trap owns its own map, so another trap is unaffected', () => {
    const trapA: TrapCooldowns = new Map()
    const trapB: TrapCooldowns = new Map()
    startTrapCooldown(trapA, 'rabbit-1', 10)
    expect(isTrapCooldownActive(trapB, 'rabbit-1', 10)).toBe(false)
  })

  it('drops expired entries as they are read', () => {
    const cooldowns: TrapCooldowns = new Map()
    startTrapCooldown(cooldowns, 'rabbit-1', 10)
    isTrapCooldownActive(cooldowns, 'rabbit-1', 99)
    expect(cooldowns.size).toBe(0)
  })
})

describe('Traps skill integration', () => {
  it('starts alongside the other skills on the shared curve', () => {
    const skills = createPlayerSkills()
    expect(skills.traps.xp).toBe(0)
    expect(skills.traps.value).toBe(xpToSkillValue(0))
    expect(skills.traps.active).toBe(false)
  })
})
