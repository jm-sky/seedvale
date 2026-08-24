import { describe, expect, it } from 'vitest'
import {
  applyCultivationMaintenance,
  CARE_REMOVAL_THRESHOLD,
  cultivationYieldCount,
  findNearestGarden,
  gardenMaintenancePromptLabel,
  getCultivationStatus,
  MAINTENANCE_BASE_DURATION_SEC,
  MAINTENANCE_TOOL_DURATION_SEC,
  maintenanceDurationSec,
  resolveCultivationCare,
} from './playerGarden'

describe('resolveCultivationCare', () => {
  it('degrades linearly with elapsed world-days', () => {
    expect(resolveCultivationCare({ care: 100, lastMaintainedAtDays: 0 }, 0)).toBe(100)
    expect(resolveCultivationCare({ care: 100, lastMaintainedAtDays: 0 }, 1)).toBe(92)
    expect(resolveCultivationCare({ care: 100, lastMaintainedAtDays: 0 }, 5)).toBe(60)
  })

  it('clamps to 0..100 and never uses negative elapsed time', () => {
    expect(resolveCultivationCare({ care: 100, lastMaintainedAtDays: 0 }, 100)).toBe(0)
    // worldDays before the anchor (e.g. a stale snapshot) must not restore care.
    expect(resolveCultivationCare({ care: 40, lastMaintainedAtDays: 10 }, 5)).toBe(40)
  })
})

describe('getCultivationStatus', () => {
  it('maps care to the four named statuses with unambiguous thresholds', () => {
    expect(getCultivationStatus(100)).toBe('maintained')
    expect(getCultivationStatus(50)).toBe('maintained')
    expect(getCultivationStatus(49)).toBe('neglected')
    expect(getCultivationStatus(25)).toBe('neglected')
    expect(getCultivationStatus(24)).toBe('heavily-neglected')
    expect(getCultivationStatus(0.1)).toBe('heavily-neglected')
    expect(getCultivationStatus(0)).toBe('removed')
    expect(getCultivationStatus(CARE_REMOVAL_THRESHOLD)).toBe('removed')
  })
})

describe('applyCultivationMaintenance', () => {
  it('restores ~50 points from the resolved (not stale) care', () => {
    const result = applyCultivationMaintenance({ care: 100, lastMaintainedAtDays: 0 }, 4)
    // 100 - 4*8 = 68, + 50 = 118 -> capped
    expect(result.care).toBe(100)
    expect(result.lastMaintainedAtDays).toBe(4)
  })

  it('caps the restored care at 100', () => {
    const result = applyCultivationMaintenance({ care: 90, lastMaintainedAtDays: 0 }, 0)
    expect(result.care).toBe(100)
  })

  it('does not restore instantly to full from a low value', () => {
    const result = applyCultivationMaintenance({ care: 10, lastMaintainedAtDays: 0 }, 0)
    expect(result.care).toBe(60)
  })
})

describe('maintenanceDurationSec', () => {
  it('is shortened by a shovel or pitchfork, unchanged by any other tool', () => {
    expect(maintenanceDurationSec(null)).toBe(MAINTENANCE_BASE_DURATION_SEC)
    expect(maintenanceDurationSec('shovel')).toBe(MAINTENANCE_TOOL_DURATION_SEC)
    expect(maintenanceDurationSec('pitchfork')).toBe(MAINTENANCE_TOOL_DURATION_SEC)
    expect(maintenanceDurationSec('axe')).toBe(MAINTENANCE_BASE_DURATION_SEC)
  })
})

describe('cultivationYieldCount', () => {
  it('keeps full yield while maintained', () => {
    expect(cultivationYieldCount(3, 100)).toBe(3)
    expect(cultivationYieldCount(1, 50)).toBe(1)
  })

  it('reduces yield on a multi-count crop while neglected', () => {
    expect(cultivationYieldCount(3, 30)).toBe(2)
  })

  it('does not zero out a single-yield crop merely for being neglected', () => {
    expect(cultivationYieldCount(1, 30)).toBe(1)
  })

  it('can legitimately zero yield while heavily neglected', () => {
    expect(cultivationYieldCount(1, 10)).toBe(0)
    expect(cultivationYieldCount(3, 10)).toBe(1)
  })

  it('is 0 once the plot has reached the removal threshold', () => {
    expect(cultivationYieldCount(3, 0)).toBe(0)
  })
})

describe('findNearestGarden', () => {
  it('picks the nearest garden within radius', () => {
    const gardens = [{ id: 'a', x: 10, z: 0 }, { id: 'b', x: 2, z: 0 }]
    expect(findNearestGarden(gardens, 0, 0, 20)?.id).toBe('b')
  })

  it('returns null when nothing is within radius', () => {
    const gardens = [{ id: 'a', x: 100, z: 0 }]
    expect(findNearestGarden(gardens, 0, 0, 5)).toBeNull()
  })
})

describe('gardenMaintenancePromptLabel', () => {
  it('stays offered (and names the status) regardless of care', () => {
    expect(gardenMaintenancePromptLabel(100)).toContain('[E]')
    expect(gardenMaintenancePromptLabel(10)).toContain('[E]')
  })
})
