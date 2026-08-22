import { describe, expect, it } from 'vitest'
import { FAUNA_URLS, SPAWNER_SPECS, spawnerId } from './createFauna'

describe('SPAWNER_SPECS cave habitat (plan 188)', () => {
  it('has a cave entry that can produce bear, alongside the existing wolf cave', () => {
    const caveSpecs = SPAWNER_SPECS.filter((spec) => spec.type === 'cave')
    expect(caveSpecs.some((spec) => spec.kind === 'wolf')).toBe(true)
    expect(caveSpecs.some((spec) => spec.kind === 'bear')).toBe(true)
    // Two distinct physical caves, not one cave reconfigured for bear only.
    expect(caveSpecs.length).toBeGreaterThanOrEqual(2)
  })

  it('registers a bear.glb model URL through the shared FAUNA_URLS map', () => {
    expect(FAUNA_URLS.bear).toBe('/models/fauna/bear.glb')
  })
})

describe('spawnerId (plan 188 — multiple habitat instances of the same type)', () => {
  it('keeps the pre-188 id for the first spawner of a given type (save compatibility)', () => {
    expect(spawnerId('home', 'cave', 'wolf', 0)).toBe('home:cave')
  })

  it('gives a second spawner of the same type a distinct, stable id instead of colliding', () => {
    const first = spawnerId('home', 'cave', 'wolf', 0)
    const second = spawnerId('home', 'cave', 'bear', 1)
    expect(second).not.toBe(first)
    expect(second).toBe('home:cave:bear')
  })
})
