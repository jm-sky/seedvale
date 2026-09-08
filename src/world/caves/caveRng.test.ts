import { describe, expect, it } from 'vitest'
import { CAVE_RNG_SALT, createCaveRandom } from './caveRng'

describe('createCaveRandom (plan world-terrain-008 B1)', () => {
  it('is deterministic for the same (caveId, salt)', () => {
    const a = createCaveRandom('cave:aaaa', CAVE_RNG_SALT.structure)
    const b = createCaveRandom('cave:aaaa', CAVE_RNG_SALT.structure)
    const seqA = [a(), a(), a()]
    const seqB = [b(), b(), b()]
    expect(seqA).toEqual(seqB)
  })

  it('gives different caves independent streams for the same purpose', () => {
    const a = createCaveRandom('cave:aaaa', CAVE_RNG_SALT.structure)()
    const b = createCaveRandom('cave:bbbb', CAVE_RNG_SALT.structure)()
    expect(a).not.toBe(b)
  })

  it('gives different purposes independent streams for the same cave', () => {
    const structure = createCaveRandom('cave:aaaa', CAVE_RNG_SALT.structure)()
    const feature = createCaveRandom('cave:aaaa', CAVE_RNG_SALT.feature)()
    expect(structure).not.toBe(feature)
  })
})
