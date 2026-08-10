import type { CampfireFlame } from './props'
import type * as THREE from 'three'

/** Seconds of burn time one branch adds — light and refuel both apply this.
 *  Default for settlement fires and player-built fire pits (`kind: 'pit'`,
 *  `settlement/PlacedFires.ts`) — a simple campfire without a stone ring
 *  passes a shorter value explicitly (plan `2026-08-09--050`). */
export const FUEL_PER_BRANCH = 75

/** Fuel-to-visual-size curve for `CampfireFlame.setSize` — `ratio` is fuel
 *  remaining in units of one branch. Below 1 it shrinks in lockstep as
 *  embers die down. Between 1 and 2 (just the branch that lit it, or one
 *  refuel on top of that) it holds at the normal size — a single extra
 *  branch shouldn't already visibly bulk up the fire. Growth only kicks in
 *  once a second extra branch goes on, so it reads as "stoking the fire"
 *  rather than the first refuel already maxing it out. `setSize` clamps to
 *  `FLAME_MAX_SIZE` on its own, so this only needs the slope past the dead
 *  zone. */
function fuelRatioToSizeFactor(ratio: number): number {
  if (ratio <= 2) return Math.min(ratio, 1)
  return 1 + (ratio - 2) * 0.5
}

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
 *
 * Also reused verbatim for player-built free-standing fires
 * (`PlacedFires.ts`), with an explicit `fuelPerBranch` for the shorter-burning
 * "prosta ognisko" variant (`docs/plans/2026-08-09--050`).
 */
export function createVillageFire(
  position: THREE.Vector3,
  flame: CampfireFlame,
  fuelPerBranch: number = FUEL_PER_BRANCH,
): VillageFire {
  let lit = false
  let fuelRemaining = 0

  const applySize = () => flame.setSize(fuelRatioToSizeFactor(fuelRemaining / fuelPerBranch))

  return {
    position,
    isLit: () => lit,
    light() {
      lit = true
      fuelRemaining = fuelPerBranch
      flame.object.visible = true
      applySize()
    },
    addFuel() {
      fuelRemaining += fuelPerBranch
      applySize()
    },
    update(dt) {
      if (!lit) return
      flame.update(dt)
      fuelRemaining -= dt
      if (fuelRemaining <= 0) {
        lit = false
        fuelRemaining = 0
        flame.object.visible = false
      } else {
        applySize()
      }
    },
  }
}
