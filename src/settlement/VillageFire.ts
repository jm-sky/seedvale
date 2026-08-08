import type * as THREE from 'three'

/** Seconds of burn time one branch adds — light and refuel both apply this. */
const FUEL_PER_BRANCH = 75

export type VillageFire = {
  readonly position: THREE.Vector3
  isLit: () => boolean
  /** Ignites from cold — caller is responsible for checking/consuming the
   *  branch first (see `app/createApp.ts`'s campfire interact handling). */
  light: () => void
  /** Extends an already-lit fire — same fuel amount as `light()`, just
   *  additive instead of resetting. */
  addFuel: () => void
  update: (dt: number) => void
}

/**
 * A settlement's own lightable campfire (MD/LG villages, see
 * `settlement/props.ts`'s `buildSettlementProps`) — burns down over time,
 * toggles `flame`'s visibility to match. Unlike the world-scattered
 * decorative campfires (`terrain/chunkEnvironment.ts`), this one is a fixed
 * piece of settlement infrastructure: going out doesn't despawn it, it just
 * goes back to unlit and can be relit (see `docs/plans/2026-08-08--038`).
 */
export function createVillageFire(position: THREE.Vector3, flame: THREE.Object3D): VillageFire {
  let lit = false
  let fuelRemaining = 0

  return {
    position,
    isLit: () => lit,
    light() {
      lit = true
      fuelRemaining = FUEL_PER_BRANCH
      flame.visible = true
    },
    addFuel() {
      fuelRemaining += FUEL_PER_BRANCH
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
  }
}
