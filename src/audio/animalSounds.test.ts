import { describe, expect, it } from 'vitest'
import {
  initialSpontaneousVocalizeCooldownSec,
  playSpontaneousAnimalSound,
  tickSpontaneousVocalizeCooldown,
} from './animalSounds'

describe('initialSpontaneousVocalizeCooldownSec', () => {
  it('is finite for a configured kind and infinite for an unconfigured one', () => {
    expect(Number.isFinite(initialSpontaneousVocalizeCooldownSec('cow'))).toBe(true)
    expect(initialSpontaneousVocalizeCooldownSec('wolf')).toBe(Infinity)
  })
})

describe('tickSpontaneousVocalizeCooldown', () => {
  it('never fires for a kind without a configured vocalization', () => {
    const result = tickSpontaneousVocalizeCooldown('wolf', 999, 0, () => 0)
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
