import { describe, expect, it } from 'vitest'
import { NEED_ELEVATED_THRESHOLD } from './AnimalLife'
import {
  isNeedCritical,
  NEED_CRITICAL_THRESHOLD,
  shouldDeferNeedsForLead,
} from './animalNeedArbitration'

describe('animalNeedArbitration', () => {
  it('defers ordinary elevated needs during lead but not critical thirst', () => {
    expect(shouldDeferNeedsForLead(0, NEED_ELEVATED_THRESHOLD + 0.1)).toBe(true)
    expect(shouldDeferNeedsForLead(0, NEED_CRITICAL_THRESHOLD)).toBe(false)
  })

  it('marks critical needs at the configured threshold', () => {
    expect(isNeedCritical(NEED_CRITICAL_THRESHOLD - 0.01, 0)).toBe(false)
    expect(isNeedCritical(0, NEED_CRITICAL_THRESHOLD)).toBe(true)
  })
})
