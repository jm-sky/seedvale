/** Plan 106 — shared drink/fill abstraction so the well and lake interactions
 *  (and any future river/stream/polluted/treated source) share one mechanic
 *  instead of separate per-source implementations. Deliberately data-only:
 *  the actual `Inventory`/`PlayerNeeds` mutation happens in `app/gameLoop.ts`
 *  (same reasoning as `campfire`/`item`/`corpse` — those need `Inventory`
 *  access the generic `resolveInteraction.ts` dispatcher doesn't have).
 *
 * @domain world
 * @system water-source
 * @role Shared well/lake/river/ocean drink/fill abstraction; future polluted/treated sources should reuse it.
 */
export type WaterQuality = 'safe' | 'unsafe'

/** Natural shoreline kinds the fishing/drink interaction can be offered at
 *  (plan `ui-input-006`) — resolved by `app/interactables.ts`'s shoreline
 *  resolver from existing lake/river/ocean terrain detection. Kept distinct
 *  from `WaterSource['kind']` (which also has `'well'`) since a well is never
 *  a fishing spot. */
export type WaterBodyKind = 'lake' | 'river' | 'ocean'

export type WaterSource = {
  kind: 'well' | WaterBodyKind
  quality: WaterQuality
}

/** Thirst restored by one drink action, direct or via a full waterskin —
 *  one flat amount keeps the well/lake/river/ocean/waterskin paths
 *  interchangeable. */
export const DRINK_THIRST_RELIEF = 45

/** §4 "Lake" — gameplay/UI hook only; no illness system exists to trigger
 *  (explicitly out of scope). Generic wording since plan `ui-input-006`
 *  extends the same unsafe-quality drink to river/ocean shorelines too. */
export const UNSAFE_WATER_WARNING = 'Ta woda może powodować chorobę.'

export function createWaterSource(kind: WaterSource['kind']): WaterSource {
  return { kind, quality: kind === 'well' ? 'safe' : 'unsafe' }
}
