import { HOUSE_CATALOG } from './houseCatalog'

/**
 * Household-yard clearance contract (plan settlements-npcs-011).
 *
 * Pure geometry only — this module owns no households, props, NPCs or
 * runtime state. It answers one question: how much clearance around a
 * house center must stay usable for its known yard props (household
 * barrel/trough/storage, `props.ts`'s `houseYardPlacements()`) and
 * immediate access?
 *
 * `villagePlanner.ts`'s `HOUSE_PLOT_RADIUS` (house/garden/infra spacing)
 * and `props.ts`'s yard-prop offsets already independently satisfy this —
 * these numbers exist so both can be checked against the same contract
 * instead of silently drifting apart, not to replace either.
 */

/** Max real house footprintRadius across the catalog — every entry sets
 *  it explicitly (see `houseCatalog.ts`); deriving the max here keeps this
 *  in sync instead of hand-copying catalog numbers. */
export const MAX_HOUSE_FOOTPRINT_RADIUS = Math.max(...HOUSE_CATALOG.map((e) => e.footprintRadius))

/** Offsets past the house footprint edge for each household yard prop
 *  (plan 122/156) — storage is the outermost common prop, so it sets the
 *  yard's required clearance radius. Wood sits on its own slot between
 *  trough and storage (settlements-npcs-025 follow-up), not on the crate. */
export const HOUSEHOLD_YARD_PROP_OFFSETS = { barrel: 0.85, trough: 1.35, wood: 1.55, storage: 1.9 } as const

/** Clearance radius one household needs around its house center, given
 *  that house's real `footprintRadius` (`houseBuilder.ts`'s
 *  `houseFootprintRadius()`). Defaults to the catalog-wide max so callers
 *  that only need a conservative upper bound (layout/spacing checks) don't
 *  have to thread a specific house through. */
export function householdYardRadius(houseFootprintRadius = MAX_HOUSE_FOOTPRINT_RADIUS): number {
  return houseFootprintRadius + HOUSEHOLD_YARD_PROP_OFFSETS.storage
}
