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

/** Generic consumption-time health risk (plan world-004 §6) — deliberately
 *  distinct from `WaterQuality`'s existing safe/unsafe/undrinkable warning
 *  text so a future full water-quality/illness system doesn't have to unwind
 *  an overloaded meaning. Currently only set for an uncovered player-built
 *  well (`world/playerWell.ts`'s `wellWaterSource`); a roofed well and every
 *  natural water body carry no risk. Rolled once per direct drink action
 *  (`app/actions/survivalActions.ts`'s `drinkFromWaterSource`) — filling a
 *  container severs the association instead of tainting the carried water,
 *  the same "can't mark a filled instance as risky later" limitation
 *  `UNDRINKABLE_WATER_WARNING` already accepts for salt water. */
export type WaterConsumptionRisk = {
  /** Probability `[0,1]` this risk triggers on one direct drink. */
  chance: number
  hpDamageMin: number
  hpDamageMax: number
  vigorLoss: number
}

export type WaterSource = {
  kind: 'well' | WaterBodyKind
  quality: WaterQuality
  /** Deep player-built well only (plan world-004 §4) — `rope` must be
   *  carried (never consumed) to draw water, whether drinking directly or
   *  filling a container. Absent/false for every other source. */
  requiresRope?: boolean
  consumptionRisk?: WaterConsumptionRisk
}

/** Plan world-004 §6 — the plan's own chosen numbers for an uncovered
 *  player-built well's direct-drink risk. */
export const UNCOVERED_WELL_CONSUMPTION_RISK: WaterConsumptionRisk = {
  chance: 0.5,
  hpDamageMin: 1,
  hpDamageMax: 2,
  vigorLoss: 5,
}

/** Shown when `UNCOVERED_WELL_CONSUMPTION_RISK` actually triggers. */
export const UNCOVERED_WELL_WARNING = 'Ta woda ze studni bez daszka Ci zaszkodziła.'

/** Shown when a deep well's `requiresRope` is unmet (plan world-004 §4). */
export const WELL_ROPE_REQUIRED_WARNING = 'Potrzebujesz liny, żeby czerpać wodę z tak głębokiej studni.'

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
