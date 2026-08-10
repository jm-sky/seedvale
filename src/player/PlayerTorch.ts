import { disposeObject3D } from '../assets/loadGltf'
import { createCampfireFlame } from '../settlement/props'
import type * as THREE from 'three'

/** Seconds a torch burns per branch spent lighting it — shorter than a
 *  campfire's fuel-per-branch (`VillageFire.ts`), it's meant as a portable
 *  stopgap, not a place to sit and rest. See `docs/plans/2026-08-09--050`. */
const TORCH_FUEL_PER_BRANCH = 90

export type PlayerTorch = {
  isLit: () => boolean
  /** Ignites the torch — caller is responsible for checking/consuming the
   *  branch and firestarter presence first (see `app/createApp.ts`). */
  light: () => void
  /** Snuffs the torch immediately, e.g. on "New Game" world reset. */
  extinguish: () => void
  update: (dt: number) => void
  dispose: () => void
}

/**
 * A portable light source carried by the player — lit from 1x branch +
 * having a firestarter (krzesiwo) in inventory, burns down over a limited
 * time like a campfire (`VillageFire.ts`), then goes dark. Reuses
 * `createCampfireFlame()` for the visual, just attached to the player's mesh
 * instead of a fixed world position, so it moves and rotates with them.
 */
export function createPlayerTorch(playerMesh: THREE.Object3D): PlayerTorch {
  const flame = createCampfireFlame(0.45)
  flame.position.set(0.32, 1.05, 0.22)
  playerMesh.add(flame)

  let lit = false
  let fuelRemaining = 0

  return {
    isLit: () => lit,
    light() {
      lit = true
      fuelRemaining = TORCH_FUEL_PER_BRANCH
      flame.visible = true
    },
    extinguish() {
      lit = false
      fuelRemaining = 0
      flame.visible = false
    },
    update(dt) {
      if (!lit) return
      fuelRemaining -= dt
      if (fuelRemaining <= 0) {
        lit = false
        fuelRemaining = 0
        flame.visible = false
      }
    },
    dispose() {
      flame.removeFromParent()
      disposeObject3D(flame)
    },
  }
}
