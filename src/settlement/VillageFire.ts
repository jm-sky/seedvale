import type { ItemKind } from '../items/items'
import type { CampfireFlame } from './props'
import type * as THREE from 'three'

/** Item kinds that can light or refuel a fire (plan 187) — tried in this
 *  order by `startIgniteFire`/the "dołóż" world action, both re-resolving at
 *  busy-channel completion. Adding a unit of either kind grants the same
 *  `fuelPerBranch` seconds — `beam` is a structural-wood bonus fuel, not a
 *  richer fuel value model. */
export const FIRE_FUEL_KINDS: readonly ItemKind[] = ['branch', 'beam']

/** Seconds of burn time one branch adds — light and refuel both apply this.
 *  Default for settlement fires and player-built fire pits (`kind: 'pit'`,
 *  `settlement/PlacedFires.ts`) — a simple campfire without a stone ring
 *  passes a shorter value explicitly (plan `2026-08-09--050`). */
export const FUEL_PER_BRANCH = 75
/** Busy-channel duration for lighting an unlit campfire — real-time (not a
 *  time-skip), same order of magnitude as dig/chop. Adding a branch to an
 *  already-lit fire stays instant. */
export const IGNITE_DURATION_SEC = 3

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

/** Who/what struck the fire — only `'player'` gets the white flint-spark
 *  burst + ignite SFX (`hooks.onLight`'s second argument); `'night'`
 *  (deterministic settlement autolight at dusk, `createSettlement.ts`) and
 *  `'npc'` still run the same visual ignition ramp but stay silent/burst-free
 *  since nobody is physically striking a flint (plan 130 §1/§8). */
export type FireLightSource = 'player' | 'night' | 'npc'

export type VillageFireHooks = {
  onLight?: (position: THREE.Vector3, source: FireLightSource) => void
  onExtinguish?: (position: THREE.Vector3) => void
}

export type VillageFire = {
  readonly position: THREE.Vector3
  isLit: () => boolean
  /** True only during the brief `IGNITE_DURATION_SEC` ramp right after
   *  `light()`. `isLit()` is already `true` throughout ignition — existing
   *  consumers (cooking, fuel top-up, fauna fire-avoidance) keep working
   *  unaudited; this flag exists purely to drive ignition-only visuals. */
  isIgniting: () => boolean
  /** `0` at the start of `light()`, `1` once the flame has fully grown in.
   *  Stays `1` whenever not currently igniting. */
  getIgniteProgress: () => number
  /** Fuel remaining in units of one branch (`fuelRemaining / fuelPerBranch`),
   *  `0` while unlit — the same ratio `applyVisual` feeds into
   *  `fuelRatioToSizeFactor`. Read-only escape hatch for a caller that needs
   *  its own size curve off the same authoritative number (plan
   *  items-player-015's wood-pile body scale) instead of duplicating a fuel
   *  counter. */
  getFuelRatio: () => number
  /** Ignites from cold — caller is responsible for checking/consuming the
   *  branch first (see `app/createApp.ts`'s campfire interact handling).
   *  Defaults to `'player'`, the common case (interactive ignite, building a
   *  fire) — pass `'night'` for the deterministic settlement autolight. */
  light: (source?: FireLightSource) => void
  /** Extends an already-lit fire — same fuel amount as `light()`, just
   *  additive instead of resetting. */
  addFuel: () => void
  /** Plan 175 — a grate is an optional, one-time capability of *this specific*
   *  fire instance (player-built `PlacedFires.ts` today; settlement fires
   *  inherit the same flag but nothing currently sets it), not a hard-coded
   *  `firepit`/`campfire` type check. Cooking capacity is resolved from this
   *  flag (`items/campfireCooking.ts`'s `resolveCookingCapacity`), never from
   *  which fire *kind* this is. */
  hasGrate: () => boolean
  /** One-time upgrade — callers own the "already has a grate"/material-cost
   *  guard (`settlement/PlacedFires.ts`'s `buildGrate`); this just flips the
   *  flag. */
  setGrate: (value: boolean) => void
  update: (dt: number) => void
}

/**
 * A settlement's own lightable campfire (MD/LG villages, see
 * `settlement/props.ts`'s `buildSettlementProps`) — burns down over time,
 * toggles `flame`'s visibility to match. Unlike the world-scattered
 * decorative campfires (`terrain/chunkEnvironment.ts`), this one is a fixed
 * piece of settlement infrastructure: going out doesn't despawn it, it just
 * goes back to unlit and can be relit (see `docs/plans/archive/2026-08-08--038`).
 *
 * Also reused verbatim for player-built free-standing fires
 * (`PlacedFires.ts`), with an explicit `fuelPerBranch` for the shorter-burning
 * "prosta ognisko" variant (`docs/plans/archive/2026-08-09--050`).
 */
export function createVillageFire(
  position: THREE.Vector3,
  flame: CampfireFlame,
  fuelPerBranch: number = FUEL_PER_BRANCH,
  hooks: VillageFireHooks = {},
): VillageFire {
  let lit = false
  let fuelRemaining = 0
  let igniteRemaining = 0
  let grate = false

  const applyVisual = () => {
    flame.setSize(fuelRatioToSizeFactor(fuelRemaining / fuelPerBranch))
    flame.setIntensity(igniteRemaining > 0 ? 1 - igniteRemaining / IGNITE_DURATION_SEC : 1)
  }

  return {
    position,
    isLit: () => lit,
    isIgniting: () => lit && igniteRemaining > 0,
    getIgniteProgress: () => (igniteRemaining > 0 ? 1 - igniteRemaining / IGNITE_DURATION_SEC : 1),
    getFuelRatio: () => (lit ? fuelRemaining / fuelPerBranch : 0),
    light(source = 'player') {
      const wasLit = lit
      lit = true
      fuelRemaining = fuelPerBranch
      igniteRemaining = IGNITE_DURATION_SEC
      flame.object.visible = true
      applyVisual()
      if (!wasLit) {
        if (source === 'player') flame.igniteBurst()
        hooks.onLight?.(position, source)
      }
    },
    addFuel() {
      fuelRemaining += fuelPerBranch
      applyVisual()
    },
    hasGrate: () => grate,
    setGrate(value) {
      grate = value
    },
    update(dt) {
      if (!lit) return
      flame.update(dt)
      if (igniteRemaining > 0) igniteRemaining = Math.max(0, igniteRemaining - dt)
      fuelRemaining -= dt
      if (fuelRemaining <= 0) {
        lit = false
        fuelRemaining = 0
        igniteRemaining = 0
        flame.object.visible = false
        hooks.onExtinguish?.(position)
      } else {
        applyVisual()
      }
    },
  }
}
