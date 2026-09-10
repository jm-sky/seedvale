import type { AnimalDef } from '../fauna/animalDefs'
import { hitchDistanceFor, isDraftDef } from '../fauna/animalLead'

/** World-space forward from `Object3D.rotation.y` — same convention as
 *  `PlayerController` / fauna steering (`-sin`, `-cos`). */
function forwardFromYaw(yaw: number): { x: number, z: number } {
  return { x: -Math.sin(yaw), z: -Math.cos(yaw) }
}

export type CartRecord = {
  id: string
  x: number
  z: number
  yaw: number
  /** Runtime hitch only — not persisted (settlement livestock can unload). */
  pulledByAnimalId: string | null
}

export type DraftAnimalPose = {
  x: number
  z: number
  yaw: number
}

export type CartHitchPose = {
  x: number
  z: number
  yaw: number
}

/**
 * @domain fauna
 * @role Deterministic one-way animal→cart hitch pose. Cart has no AI and
 *  never feeds orientation back into the animal.
 */
export function resolveCartHitchPose(
  animal: DraftAnimalPose,
  hitchDistance: number,
  modelYawOffset = 0,
): CartHitchPose {
  const forward = forwardFromYaw(animal.yaw)
  return {
    x: animal.x - forward.x * hitchDistance,
    z: animal.z - forward.z * hitchDistance,
    yaw: animal.yaw + modelYawOffset,
  }
}

/** Cart accepts a transporter only through the animal's draft capability. */
export function cartAcceptsAnimal(def: AnimalDef): boolean {
  return isDraftDef(def)
}

export function hitchDistanceForAnimal(def: AnimalDef): number {
  return hitchDistanceFor(def)
}

/** Metres the led animal must be from the cart to offer hitch. */
export const CART_HITCH_RANGE = 5
