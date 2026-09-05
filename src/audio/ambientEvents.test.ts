import { describe, expect, it, vi } from 'vitest'
import { type AmbientEventContext, type AmbientEventDefinition, createAmbientEventRuntime } from './ambientEvents'

/** A fake RNG that returns queued values in order — throws if exhausted, so
 *  a test that under-specifies values fails loudly instead of silently
 *  reading `undefined`. */
function fakeRng(values: number[]): () => number {
  let i = 0
  return () => {
    if (i >= values.length) throw new Error('fakeRng exhausted')
    return values[i++]
  }
}

const eligibleCtx: AmbientEventContext = { nightPhase: 0.3, forestWeight: 1, playerX: 0, playerZ: 0 }
const ineligibleCtx: AmbientEventContext = { nightPhase: null, forestWeight: 1, playerX: 0, playerZ: 0 }

function makeDef(overrides: Partial<AmbientEventDefinition> = {}): AmbientEventDefinition {
  return {
    id: 'test',
    sounds: ['a.ogg', 'b.ogg'],
    volume: 0.7,
    bus: 'ambient',
    offset: { min: 8, max: 20 },
    cooldown: { min: 100, max: 200 },
    recheckSec: 15,
    chance: 0.5,
    isEligible: (ctx) => ctx.nightPhase !== null && ctx.forestWeight >= 0.3,
    ...overrides,
  }
}

describe('createAmbientEventRuntime (plan world-016)', () => {
  it('does not roll or play when the definition is ineligible', () => {
    const playAt = vi.fn()
    // Seed cooldown draw only — an ineligible definition never rolls chance.
    const rng = fakeRng([0])
    const runtime = createAmbientEventRuntime({ playAt }, [makeDef()], rng)
    runtime.update(0, ineligibleCtx)
    expect(playAt).not.toHaveBeenCalled()
  })

  it('uses the recheck interval (not a fresh full cooldown) after a failed chance roll', () => {
    const playAt = vi.fn()
    // seed=0 (cooldown starts at 0); chance roll = 0.9, fails against chance 0.5.
    const rng = fakeRng([0, 0.9])
    const runtime = createAmbientEventRuntime({ playAt }, [makeDef()], rng)
    runtime.update(0, eligibleCtx)
    expect(playAt).not.toHaveBeenCalled()
    // Recheck is 15s — an 8s tick must not yet be able to roll again (no more
    // queued rng values would be available if it tried).
    expect(() => runtime.update(8, eligibleCtx)).not.toThrow()
    expect(playAt).not.toHaveBeenCalled()
  })

  it('plays a chosen variant at the expected radial placement on a successful roll, then blocks re-firing until the fresh cooldown elapses', () => {
    const playAt = vi.fn()
    const rng = fakeRng([
      0, // seed cooldown draw -> 0 (fires immediately on first update)
      0.1, // chance roll: 0.1 < 0.5 -> succeeds
      0, // angle = 0 * 2π -> 0 (placement directly on +x)
      0, // radius = offset.min + 0 * (max-min) -> 8
      0.9, // variant index = floor(0.9 * 2) -> 1 -> 'b.ogg'
      0.5, // fresh cooldown = 100 + 0.5*(200-100) -> 150
    ])
    const runtime = createAmbientEventRuntime({ playAt }, [makeDef()], rng)

    runtime.update(0, eligibleCtx)
    expect(playAt).toHaveBeenCalledTimes(1)
    expect(playAt).toHaveBeenCalledWith('b.ogg', { x: 8, z: 0 }, 0.7, 'ambient')

    // Still well inside the fresh 150s cooldown — must not roll (and thus
    // must not touch the now-exhausted rng queue) even though eligible.
    expect(() => runtime.update(100, eligibleCtx)).not.toThrow()
    expect(playAt).toHaveBeenCalledTimes(1)
  })

  it('can roll again once the fresh cooldown actually elapses', () => {
    const playAt = vi.fn()
    const rng = fakeRng([
      0, // seed -> 0
      0, // chance roll succeeds (0 < chance)
      0, // angle -> 0
      0, // radius -> offset.min
      0, // variant -> sounds[0]
      0, // fresh cooldown -> cooldown.min (100)
      0, // second chance roll succeeds
      0, // angle
      0, // radius
      0, // variant
      0, // next cooldown
    ])
    const runtime = createAmbientEventRuntime({ playAt }, [makeDef()], rng)

    runtime.update(0, eligibleCtx) // first fire, cooldown -> 100
    expect(playAt).toHaveBeenCalledTimes(1)

    runtime.update(100, eligibleCtx) // cooldown elapses exactly -> rolls again
    expect(playAt).toHaveBeenCalledTimes(2)
  })

  it('never rolls chance for an ineligible definition even once its cooldown has elapsed', () => {
    const playAt = vi.fn()
    // Only the seed value is ever consumed — an ineligible definition must
    // short-circuit before calling rng() for the chance roll.
    const rng = fakeRng([0])
    const runtime = createAmbientEventRuntime({ playAt }, [makeDef()], rng)
    expect(() => runtime.update(0, ineligibleCtx)).not.toThrow()
    expect(() => runtime.update(50, ineligibleCtx)).not.toThrow()
    expect(playAt).not.toHaveBeenCalled()
  })
})
