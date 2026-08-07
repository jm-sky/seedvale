import type { Vector3 } from 'three'

/**
 * v1 of the Place system (`docs/plans/2026-08-07--020--npc-2-daily-routine-and-place.md`),
 * trimmed to formalizing what already exists: each NPC's `home` assignment
 * (`createSettlement.ts`) is a `Place` instead of a bare `Vector3`. Purely
 * organizational — no behavior change. `workplace`/`food`/`social` places and
 * a `Schedule` that consumes them are deliberately out of scope until `role`
 * (`npc-character-depth.md`) has real behavior to hang a schedule off of.
 */
export type PlaceType = 'home'

export type Place = {
  /** Stable id, namespaced by settlement (e.g. `0_0:home:2`) — same spirit as
   *  `SettlementDef.id`/interactable ids elsewhere in `settlement/`. */
  id: string
  type: PlaceType
  position: Vector3
}
