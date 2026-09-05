import { describe, expect, it } from 'vitest'
import type { TrapLureDescriptor } from '../world/animalTraps'
import { ANIMAL_DEFS, dietAcceptsItem, resolveLureTarget } from './AnimalAgent'

describe('dietAcceptsItem (plan fauna-014 §2)', () => {
  it('accepts a diet-listed plant item for a herbivore', () => {
    expect(dietAcceptsItem(ANIMAL_DEFS.rabbit.diet, 'carrot')).toBe(true)
    expect(dietAcceptsItem(ANIMAL_DEFS.stag.diet, 'apple')).toBe(true)
  })

  it('rejects a non-diet item for a herbivore', () => {
    expect(dietAcceptsItem(ANIMAL_DEFS.rabbit.diet, 'raw_meat')).toBe(false)
  })

  it('accepts a diet-listed meat item for wolf/fox even though it never drives hunger', () => {
    expect(dietAcceptsItem(ANIMAL_DEFS.wolf.diet, 'raw_meat')).toBe(true)
    expect(dietAcceptsItem(ANIMAL_DEFS.fox.diet, 'deer_meat')).toBe(true)
  })

  it('rejects a plant item for wolf', () => {
    expect(dietAcceptsItem(ANIMAL_DEFS.wolf.diet, 'carrot')).toBe(false)
  })

  it('rejects everything for a species with no configured diet', () => {
    expect(dietAcceptsItem(ANIMAL_DEFS.boar.diet, 'carrot')).toBe(false)
    expect(dietAcceptsItem(ANIMAL_DEFS.boar.diet, 'raw_meat')).toBe(false)
  })
})

describe('resolveLureTarget (plan fauna-014 §3/§4/§11)', () => {
  const lure = (overrides: Partial<TrapLureDescriptor>): TrapLureDescriptor => ({
    trapId: 'trap:1',
    kind: 'simple',
    x: 0,
    z: 0,
    baitKind: 'carrot',
    ...overrides,
  })

  it('finds a diet-compatible, trap-kind-compatible lure within range', () => {
    const target = resolveLureTarget([lure({})], ANIMAL_DEFS.rabbit, 1, 0)
    expect(target?.trapId).toBe('trap:1')
  })

  it('rejects a species the trap kind cannot catch (stag vs. simple)', () => {
    expect(resolveLureTarget([lure({})], ANIMAL_DEFS.stag, 1, 0)).toBeNull()
  })

  it('accepts a predator-eligible good trap with matching meat bait', () => {
    const target = resolveLureTarget(
      [lure({ kind: 'good', baitKind: 'raw_meat' })],
      ANIMAL_DEFS.wolf,
      1,
      0,
    )
    expect(target?.baitKind).toBe('raw_meat')
  })

  it('rejects a diet-incompatible bait (wolf ignores carrot)', () => {
    expect(resolveLureTarget([lure({ kind: 'good', baitKind: 'carrot' })], ANIMAL_DEFS.wolf, 1, 0)).toBeNull()
  })

  it('rejects a lure outside the trap kind\'s lure radius', () => {
    expect(resolveLureTarget([lure({ x: 1000, z: 0 })], ANIMAL_DEFS.rabbit, 0, 0)).toBeNull()
  })

  it('picks the nearest of several valid candidates', () => {
    const near = lure({ trapId: 'near', x: 1, z: 0 })
    const far = lure({ trapId: 'far', x: 4, z: 0 })
    expect(resolveLureTarget([far, near], ANIMAL_DEFS.rabbit, 0, 0)?.trapId).toBe('near')
  })

  it('breaks equal-distance ties deterministically by trap id', () => {
    const a = lure({ trapId: 'a', x: 2, z: 0 })
    const b = lure({ trapId: 'b', x: -2, z: 0 })
    expect(resolveLureTarget([b, a], ANIMAL_DEFS.rabbit, 0, 0)?.trapId).toBe('a')
    expect(resolveLureTarget([a, b], ANIMAL_DEFS.rabbit, 0, 0)?.trapId).toBe('a')
  })

  it('returns null with no lures at all', () => {
    expect(resolveLureTarget([], ANIMAL_DEFS.rabbit, 0, 0)).toBeNull()
  })
})
