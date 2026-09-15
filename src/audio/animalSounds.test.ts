import { afterEach, describe, expect, it } from 'vitest'
import {
  ANIMAL_DEATH_GENERIC_SOUND_URLS,
  ANIMAL_DEATH_GROUP_SOUND_URLS,
  ANIMAL_DEATH_SOUND_URLS,
  initialSpontaneousVocalizeCooldownSec,
  playSpontaneousAnimalSound,
  resolveAnimalDeathSoundUrl,
  roosterCrowWeight,
  spontaneousVocalizeTimeWeight,
  tickSpontaneousVocalizeCooldown,
  wolfHowlWeight,
} from './animalSounds'

describe('initialSpontaneousVocalizeCooldownSec', () => {
  it('is finite for a configured kind and infinite for an unconfigured one', () => {
    expect(Number.isFinite(initialSpontaneousVocalizeCooldownSec('cow'))).toBe(true)
    // fox has no spontaneous-vocalization config (unlike wolf/rooster, added
    // by plan fauna-009).
    expect(initialSpontaneousVocalizeCooldownSec('fox')).toBe(Infinity)
  })
})

describe('tickSpontaneousVocalizeCooldown', () => {
  it('never fires for a kind without a configured vocalization', () => {
    const result = tickSpontaneousVocalizeCooldown('fox', 999, 0, () => 0)
    expect(result.fire).toBe(false)
    expect(result.cooldownSec).toBe(0)
  })

  it('counts down and does not fire while cooldown remains', () => {
    const result = tickSpontaneousVocalizeCooldown('cow', 5, 100, () => 0)
    expect(result.fire).toBe(false)
    expect(result.cooldownSec).toBe(95)
  })

  it('fires and redraws a fresh cooldown once elapsed and the roll succeeds', () => {
    // First rng() call is the chance roll (must beat `chance`), second is the
    // fresh-cooldown draw.
    const rolls = [0, 0.5]
    let i = 0
    const rng = () => rolls[i++]!
    const result = tickSpontaneousVocalizeCooldown('cow', 1, 0, rng)
    expect(result.fire).toBe(true)
    expect(result.cooldownSec).toBeGreaterThan(0)
  })

  it('does not fire and retries soon when the roll fails', () => {
    const result = tickSpontaneousVocalizeCooldown('cow', 1, 0, () => 0.999)
    expect(result.fire).toBe(false)
    expect(result.cooldownSec).toBeGreaterThan(0)
    expect(result.cooldownSec).toBeLessThan(60)
  })

  it('never fires when the chance multiplier zeroes out the effective chance', () => {
    const result = tickSpontaneousVocalizeCooldown('wolf', 1, 0, () => 0, 0)
    expect(result.fire).toBe(false)
  })

  it('scales the roll threshold by the chance multiplier', () => {
    // wolf's base chance is 0.3 — the same 0.29 roll clears it at full
    // weight but misses once the multiplier (e.g. daytime weighting) halves
    // the effective threshold.
    expect(tickSpontaneousVocalizeCooldown('wolf', 1, 0, () => 0.29, 1).fire).toBe(true)
    expect(tickSpontaneousVocalizeCooldown('wolf', 1, 0, () => 0.29, 0.5).fire).toBe(false)
  })
})

describe('wolfHowlWeight', () => {
  it('is full weight at the core of the night', () => {
    expect(wolfHowlWeight(0)).toBe(1)
  })

  it('is reduced but non-zero at dawn/dusk twilight', () => {
    expect(wolfHowlWeight(0.25)).toBeGreaterThan(0)
    expect(wolfHowlWeight(0.25)).toBeLessThan(1)
    expect(wolfHowlWeight(0.75)).toBeGreaterThan(0)
    expect(wolfHowlWeight(0.75)).toBeLessThan(1)
  })

  it('is zero at midday', () => {
    expect(wolfHowlWeight(0.5)).toBe(0)
  })
})

describe('roosterCrowWeight', () => {
  it('peaks at dawn', () => {
    expect(roosterCrowWeight(0.25)).toBe(1)
  })

  it('is a low non-zero baseline through the day', () => {
    expect(roosterCrowWeight(0.5)).toBeGreaterThan(0)
    expect(roosterCrowWeight(0.5)).toBeLessThan(1)
  })

  it('is silent at night', () => {
    expect(roosterCrowWeight(0)).toBe(0)
  })
})

describe('spontaneousVocalizeTimeWeight', () => {
  it('dispatches to the species weight function', () => {
    expect(spontaneousVocalizeTimeWeight('wolf', 0)).toBe(wolfHowlWeight(0))
    expect(spontaneousVocalizeTimeWeight('rooster', 0.25)).toBe(roosterCrowWeight(0.25))
  })

  it('is a no-op (1) for a kind without time-of-day weighting', () => {
    expect(spontaneousVocalizeTimeWeight('cow', 0)).toBe(1)
    expect(spontaneousVocalizeTimeWeight('cow', 0.5)).toBe(1)
  })
})

describe('playSpontaneousAnimalSound concurrency cap', () => {
  it('caps how many spontaneous plays land within the same short window', () => {
    let calls = 0
    const playAt = (): void => { calls++ }
    for (let i = 0; i < 10; i++) {
      playSpontaneousAnimalSound('cow', playAt, { x: 0, z: 0 }, 100)
    }
    expect(calls).toBeGreaterThan(0)
    expect(calls).toBeLessThan(10)
  })

  it('allows a new play once the window has passed', () => {
    let calls = 0
    const playAt = (): void => { calls++ }
    for (let i = 0; i < 5; i++) {
      playSpontaneousAnimalSound('cow', playAt, { x: 0, z: 0 }, 200)
    }
    const cappedCalls = calls
    playSpontaneousAnimalSound('cow', playAt, { x: 0, z: 0 }, 300)
    expect(calls).toBe(cappedCalls + 1)
  })
})

describe('resolveAnimalDeathSoundUrl', () => {
  afterEach(() => {
    delete ANIMAL_DEATH_SOUND_URLS.wolf
    delete ANIMAL_DEATH_GROUP_SOUND_URLS.cervid
  })

  it('uses the generic Kenney hurt pool when species and group maps are empty', () => {
    const url = resolveAnimalDeathSoundUrl('wolf', () => 0)
    expect(ANIMAL_DEATH_GENERIC_SOUND_URLS).toContain(url)
    expect(resolveAnimalDeathSoundUrl('deer', () => 0)).toBe(url)
    expect(resolveAnimalDeathSoundUrl('boar', () => 0)).toBe(url)
    expect(resolveAnimalDeathSoundUrl('rat', () => 0)).toBe(url)
    expect(resolveAnimalDeathSoundUrl('bear', () => 0)).toBe(url)
  })

  it('prefers a species clip over generic', () => {
    ANIMAL_DEATH_SOUND_URLS.wolf = ['/sounds/animal-death-wolf-01.ogg']
    expect(resolveAnimalDeathSoundUrl('wolf', () => 0)).toBe('/sounds/animal-death-wolf-01.ogg')
    expect(ANIMAL_DEATH_GENERIC_SOUND_URLS).toContain(resolveAnimalDeathSoundUrl('fox', () => 0))
  })

  it('uses a group clip when the species has none (deer and stag share cervid)', () => {
    ANIMAL_DEATH_GROUP_SOUND_URLS.cervid = ['/sounds/animal-death-cervid-01.ogg']
    expect(resolveAnimalDeathSoundUrl('deer', () => 0)).toBe('/sounds/animal-death-cervid-01.ogg')
    expect(resolveAnimalDeathSoundUrl('stag', () => 0)).toBe('/sounds/animal-death-cervid-01.ogg')
    expect(ANIMAL_DEATH_GENERIC_SOUND_URLS).toContain(resolveAnimalDeathSoundUrl('wolf', () => 0))
  })
})
