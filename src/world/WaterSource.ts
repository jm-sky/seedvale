/** Plan 106 — shared drink/fill abstraction so the well and lake interactions
 *  (and any future river/stream/polluted/treated source) share one mechanic
 *  instead of separate per-source implementations. Deliberately data-only:
 *  the actual `Inventory`/`PlayerNeeds` mutation happens in `app/gameLoop.ts`
 *  (same reasoning as `campfire`/`item`/`corpse` — those need `Inventory`
 *  access the generic `resolveInteraction.ts` dispatcher doesn't have).
 *
 * @domain world
 * @system water-source
 * @role Shared well/lake drink/fill abstraction; future river/polluted/treated sources should reuse it.
 */
export type WaterQuality = 'safe' | 'unsafe'

export type WaterSource = {
  kind: 'well' | 'lake'
  quality: WaterQuality
}

/** Thirst restored by one drink action, direct or via a full waterskin —
 *  one flat amount keeps the well/lake/waterskin paths interchangeable. */
export const DRINK_THIRST_RELIEF = 45

/** §4 "Lake" — gameplay/UI hook only; no illness system exists to trigger
 *  (explicitly out of scope). */
export const UNSAFE_WATER_WARNING = 'Woda z jeziora może powodować chorobę.'

export function createWaterSource(kind: WaterSource['kind']): WaterSource {
  return { kind, quality: kind === 'lake' ? 'unsafe' : 'safe' }
}
