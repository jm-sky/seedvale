import { describe, expect, it } from 'vitest'
import { BURY_DURATION_SEC, HARVEST_MEAT_DURATION_SEC } from '../fauna/AnimalAgent'
import { COOK_DURATION_SEC } from '../items/campfireCooking'
import { IGNITE_DURATION_SEC } from '../settlement/VillageFire'
import { DIG_DURATION_SEC } from '../terrain/dig'
import { CHOP_DURATION_SEC } from '../world/treeHarvest'

/** Regression: harvest/ignite/cook were set to 120–300 real seconds of a
 *  blocking blur overlay, which read as a freeze. Busy channels must stay
 *  in the same order of magnitude as dig/chop/bury. */
describe('busy-channel durations', () => {
  it('complete in seconds, not minutes', () => {
    const durations = [
      DIG_DURATION_SEC,
      CHOP_DURATION_SEC,
      BURY_DURATION_SEC,
      HARVEST_MEAT_DURATION_SEC,
      IGNITE_DURATION_SEC,
      COOK_DURATION_SEC,
    ]
    for (const duration of durations) {
      expect(duration).toBeGreaterThan(0)
      expect(duration).toBeLessThanOrEqual(8)
    }
  })
})
