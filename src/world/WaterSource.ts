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
/** `safe` — drink freely, no warning (well, river). `unsafe` — drinkable but
 *  shows `UNSAFE_WATER_WARNING` (lake); no illness system exists to actually
 *  act on it (plan world-011, explicitly out of scope). `undrinkable` — salt
 *  water (ocean): drink/fill are both refused outright, since the container
 *  model has no way to mark a filled instance as salty later (plan
 *  world-011). */
export type WaterQuality = 'safe' | 'unsafe' | 'undrinkable'

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
 *  (explicitly out of scope). Shown only for `unsafe` sources (lake) since
 *  plan world-011 gave river its own `safe` classification. */
export const UNSAFE_WATER_WARNING = 'Ta woda może powodować chorobę.'

/** Shown when drink/fill is refused outright for an `undrinkable` source
 *  (ocean, plan world-011) — distinct from `UNSAFE_WATER_WARNING` since
 *  nothing is consumed and no illness risk applies, just plain salt water. */
export const UNDRINKABLE_WATER_WARNING = 'Ta woda jest słona — nie da się jej pić.'

/** Plan world-011 — river reclassified `safe` alongside `well` (mountain
 *  streams read as clean), ocean reclassified `undrinkable` (salt water,
 *  blocks both drink and fill); lake keeps the original `unsafe` warning. */
export function createWaterSource(kind: WaterSource['kind']): WaterSource {
  if (kind === 'well' || kind === 'river') return { kind, quality: 'safe' }
  if (kind === 'ocean') return { kind, quality: 'undrinkable' }
  return { kind, quality: 'unsafe' }
}
