import { describe, expect, it } from 'vitest'
import { ANIMAL_DEFS } from '../fauna/animalDefs'
import { cartAcceptsAnimal, hitchDistanceForAnimal, resolveCartHitchPose } from './cart'

describe('cart hitch pose', () => {
  it('places the cart behind the animal using the shared -sin/-cos forward', () => {
    const hitch = hitchDistanceForAnimal(ANIMAL_DEFS.horse)
    const pose = resolveCartHitchPose({ x: 0, z: 0, yaw: 0 }, hitch)
    expect(pose.x).toBeCloseTo(0)
    expect(pose.z).toBeCloseTo(hitch)
    expect(pose.yaw).toBe(0)

    const turned = resolveCartHitchPose({ x: 0, z: 0, yaw: Math.PI / 2 }, hitch)
    expect(turned.x).toBeCloseTo(hitch)
    expect(turned.z).toBeCloseTo(0)
    expect(turned.yaw).toBeCloseTo(Math.PI / 2)
  })

  it('accepts draft animals and rejects a cow', () => {
    expect(cartAcceptsAnimal(ANIMAL_DEFS.horse)).toBe(true)
    expect(cartAcceptsAnimal(ANIMAL_DEFS.donkey)).toBe(true)
    expect(cartAcceptsAnimal(ANIMAL_DEFS.cow)).toBe(false)
  })
})
