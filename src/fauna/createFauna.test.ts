import { describe, expect, it } from 'vitest'
import { clearsRiverChannel, FAUNA_URLS, SPAWNER_SPECS, spawnerId } from './createFauna'

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

describe('clearsRiverChannel (wild spawn / habitat river clearance)', () => {
  it('imposes no restriction without river data', () => {
    expect(clearsRiverChannel(undefined, 6)).toBe(true)
    expect(clearsRiverChannel(null, 6)).toBe(true)
  })

  it('rejects a position in the water', () => {
    expect(clearsRiverChannel(-0.5, 1.5)).toBe(false)
    expect(clearsRiverChannel(0, 1.5)).toBe(false)
  })

  it('rejects a dry position too close to the water edge', () => {
    expect(clearsRiverChannel(1, 1.5)).toBe(false)
    // A habitat prop needs more bank than a single animal does.
    expect(clearsRiverChannel(3, 1.5)).toBe(true)
    expect(clearsRiverChannel(3, 6)).toBe(false)
  })

  it('accepts a position well clear of the channel', () => {
    expect(clearsRiverChannel(20, 6)).toBe(true)
  })
})
