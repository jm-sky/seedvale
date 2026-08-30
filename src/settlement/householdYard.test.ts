import { describe, expect, it } from 'vitest'
import { HOUSE_CATALOG } from './houseCatalog'
import {
  HOUSEHOLD_YARD_PROP_OFFSETS,
  householdYardRadius,
  MAX_HOUSE_FOOTPRINT_RADIUS,
} from './householdYard'
import { HOUSE_PLOT_RADIUS } from './villagePlanner'

describe('householdYard (plan settlements-npcs-011)', () => {
  it('MAX_HOUSE_FOOTPRINT_RADIUS matches the catalog max', () => {
    const expected = Math.max(...HOUSE_CATALOG.map((e) => e.footprintRadius))
    expect(MAX_HOUSE_FOOTPRINT_RADIUS).toBe(expected)
    expect(MAX_HOUSE_FOOTPRINT_RADIUS).toBeGreaterThan(0)
  })

  it('householdYardRadius defaults to the catalog-wide worst case', () => {
    expect(householdYardRadius()).toBe(MAX_HOUSE_FOOTPRINT_RADIUS + HOUSEHOLD_YARD_PROP_OFFSETS.storage)
  })

  it('householdYardRadius grows with a larger real house footprint', () => {
    expect(householdYardRadius(3)).toBe(3 + HOUSEHOLD_YARD_PROP_OFFSETS.storage)
  })

  it('the planner house plot already reserves enough room for the household yard', () => {
    // villagePlanner.ts's HOUSE_PLOT_RADIUS is the spacing/site-selection
    // reservation around every house plot; it must stay >= the worst-case
    // household yard clearance or storage/barrel/trough placement
    // (props.ts's houseYardPlacements()) could spill into a neighbouring
    // plot's reserved space.
    expect(HOUSE_PLOT_RADIUS).toBeGreaterThanOrEqual(householdYardRadius())
  })
})
