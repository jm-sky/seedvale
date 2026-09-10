import { describe, expect, it } from 'vitest'
import {
  isSettlementRatInfestationResolved,
  settlementRatInfestationReminderLine,
  type SettlementRatInfestationSnapshot,
} from './settlementRatInfestation'

const snapshot = (
  storageDamaged: boolean,
  nestDestroyed: boolean,
  aliveRatCount: number,
): SettlementRatInfestationSnapshot => ({ storageDamaged, nestDestroyed, aliveRatCount })

describe('settlement rat infestation world condition (plan quests-progression-013 §11)', () => {
  it('stays unresolved when storage is still damaged even if the nest is gone', () => {
    expect(isSettlementRatInfestationResolved(snapshot(true, true, 0))).toBe(false)
  })

  it('stays unresolved when the nest is intact even if storage is repaired', () => {
    expect(isSettlementRatInfestationResolved(snapshot(false, false, 0))).toBe(false)
  })

  it('stays unresolved when more than one rat remains', () => {
    expect(isSettlementRatInfestationResolved(snapshot(false, true, 2))).toBe(false)
  })

  it('is resolved when storage is repaired, the nest is destroyed, and at most one rat remains', () => {
    expect(isSettlementRatInfestationResolved(snapshot(false, true, 1))).toBe(true)
    expect(isSettlementRatInfestationResolved(snapshot(false, true, 0))).toBe(true)
  })

  it('uses distinct reminder lines for remaining work combinations', () => {
    const storageAndNest = settlementRatInfestationReminderLine(snapshot(true, false, 5))
    const nestOnly = settlementRatInfestationReminderLine(snapshot(false, false, 0))
    const ratsOnly = settlementRatInfestationReminderLine(snapshot(false, true, 3))
    const resolved = settlementRatInfestationReminderLine(snapshot(false, true, 1))
    expect(new Set([nestOnly, ratsOnly, resolved, storageAndNest]).size).toBe(4)
    expect(nestOnly).toContain('gniazdo')
    expect(ratsOnly).toContain('szczur')
    expect(resolved).toContain('plaga wygasła')
  })
})
