import { Scene } from 'three'
import { describe, expect, it } from 'vitest'
import { ANIMAL_DEFS } from '../fauna/animalDefs'
import { hitchDistanceForAnimal, resolveCartHitchPose } from './cart'
import { createWorldCarts } from './createCarts'

const sampleHeight = (): number => 0

describe('createWorldCarts', () => {
  it('attaches and detaches idempotently, and detach keeps the world pose', () => {
    const carts = createWorldCarts(new Scene(), sampleHeight, [
      { id: 'cart:1', x: 3, z: -4, yaw: 0.2, pulledByAnimalId: null },
    ])
    const horse = ANIMAL_DEFS.horse
    expect(carts.attach('cart:1', 'horse-1', horse)).toBe(true)
    expect(carts.attach('cart:1', 'horse-1', horse)).toBe(true)
    expect(carts.get('cart:1')?.pulledByAnimalId).toBe('horse-1')

    expect(carts.attach('cart:1', 'horse-2', horse)).toBe(false)
    expect(carts.detach('cart:1')).toBe(true)
    expect(carts.detach('cart:1')).toBe(true)
    const after = carts.get('cart:1')
    expect(after?.pulledByAnimalId).toBeNull()
    expect(after?.x).toBe(3)
    expect(after?.z).toBe(-4)
    expect(after?.yaw).toBe(0.2)
    carts.dispose()
  })

  it('rejects a non-draft animal', () => {
    const carts = createWorldCarts(new Scene(), sampleHeight, [
      { id: 'cart:1', x: 0, z: 0, yaw: 0, pulledByAnimalId: null },
    ])
    expect(carts.attach('cart:1', 'cow-1', ANIMAL_DEFS.cow)).toBe(false)
    carts.dispose()
  })

  it('propagates hitch pose after animal movement and clears hitch on death', () => {
    const carts = createWorldCarts(new Scene(), sampleHeight, [
      { id: 'cart:1', x: 0, z: 0, yaw: 0, pulledByAnimalId: null },
    ])
    carts.attach('cart:1', 'horse-1', ANIMAL_DEFS.horse)
    const hitch = hitchDistanceForAnimal(ANIMAL_DEFS.horse)
    const expected = resolveCartHitchPose({ x: 10, z: 4, yaw: 0 }, hitch)
    carts.update((id) => id === 'horse-1'
      ? { def: ANIMAL_DEFS.horse, x: 10, z: 4, yaw: 0, dead: false }
      : null)
    const pulled = carts.get('cart:1')
    expect(pulled?.x).toBeCloseTo(expected.x)
    expect(pulled?.z).toBeCloseTo(expected.z)
    expect(pulled?.yaw).toBeCloseTo(expected.yaw)

    carts.update((id) => id === 'horse-1'
      ? { def: ANIMAL_DEFS.horse, x: 10, z: 4, yaw: 0, dead: true }
      : null)
    expect(carts.get('cart:1')?.pulledByAnimalId).toBeNull()
    expect(carts.get('cart:1')?.x).toBeCloseTo(expected.x)
    expect(carts.get('cart:1')?.z).toBeCloseTo(expected.z)
    carts.dispose()
  })

  it('keeps hitch when the animal is not yet resolvable', () => {
    const carts = createWorldCarts(new Scene(), sampleHeight, [
      { id: 'cart:1', x: 1, z: 2, yaw: 0, pulledByAnimalId: 'horse-1' },
    ])
    carts.update(() => null)
    expect(carts.get('cart:1')?.pulledByAnimalId).toBe('horse-1')
    carts.dispose()
  })
})
