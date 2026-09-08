import { describe, expect, it } from 'vitest'
import {
  isSettlementRatInfestationResolved,
  settlementRatInfestationReminderLine,
} from './settlementRatInfestation'

describe('settlement rat infestation world condition (plan quests-progression-006)', () => {
  it('is false while infestation remains active regardless of rat count', () => {
    expect(isSettlementRatInfestationResolved({ infestationActive: true, aliveRatCount: 0 })).toBe(false)
    expect(isSettlementRatInfestationResolved({ infestationActive: true, aliveRatCount: 1 })).toBe(false)
  })

  it('is false when repaired but rats remain above one', () => {
    expect(isSettlementRatInfestationResolved({ infestationActive: false, aliveRatCount: 2 })).toBe(false)
  })

  it('is true only when repaired and alive rats are at most one', () => {
    expect(isSettlementRatInfestationResolved({ infestationActive: false, aliveRatCount: 1 })).toBe(true)
    expect(isSettlementRatInfestationResolved({ infestationActive: false, aliveRatCount: 0 })).toBe(true)
  })

  it('uses distinct reminder lines for each intermediate state', () => {
    const activeMany = settlementRatInfestationReminderLine({ infestationActive: true, aliveRatCount: 5 })
    const activeFew = settlementRatInfestationReminderLine({ infestationActive: true, aliveRatCount: 1 })
    const repairedMany = settlementRatInfestationReminderLine({ infestationActive: false, aliveRatCount: 3 })
    const resolved = settlementRatInfestationReminderLine({ infestationActive: false, aliveRatCount: 1 })
    expect(activeMany).not.toBe(activeFew)
    expect(activeFew).not.toBe(repairedMany)
    expect(repairedMany).not.toBe(resolved)
    expect(activeFew).toContain('coś jeszcze jest nie w porządku')
  })
})
