import { describe, expect, it } from 'vitest'
import {
  applyCultivationMaintenance,
  applyGardenWatering,
  CARE_REMOVAL_THRESHOLD,
  cultivationYieldCount,
  DROUGHT_STRESS_CAP_DAYS,
  droughtYieldMultiplier,
  findNearestGarden,
  gardenPlotPromptLabel,
  getCultivationStatus,
  HYDRATION_SIM_WINDOW_DAYS,
  MAINTENANCE_BASE_DURATION_SEC,
  MAINTENANCE_TOOL_DURATION_SEC,
  maintenanceDurationSec,
  resolveCultivationCare,
  resolveGardenHydration,
  resolveGardenHydrationAfterHarvest,
  weedGrowthMultiplier,
} from './playerGarden'

// hydration: 50 falls in the "normal" weed-pressure tier (multiplier 1), so
// these numbers match the unscaled `CARE_DEGRADATION_PER_DAY`.
describe('resolveCultivationCare', () => {
  it('degrades linearly with elapsed world-days', () => {
    expect(resolveCultivationCare({ care: 100, lastMaintainedAtDays: 0, hydration: 50 }, 0)).toBe(100)
    expect(resolveCultivationCare({ care: 100, lastMaintainedAtDays: 0, hydration: 50 }, 1)).toBe(92)
    expect(resolveCultivationCare({ care: 100, lastMaintainedAtDays: 0, hydration: 50 }, 5)).toBe(60)
  })

  it('clamps to 0..100 and never uses negative elapsed time', () => {
    expect(resolveCultivationCare({ care: 100, lastMaintainedAtDays: 0, hydration: 50 }, 100)).toBe(0)
    // worldDays before the anchor (e.g. a stale snapshot) must not restore care.
    expect(resolveCultivationCare({ care: 40, lastMaintainedAtDays: 10, hydration: 50 }, 5)).toBe(40)
  })

  it('scales the decay rate by the weed-pressure tier of the stored hydration', () => {
    // Bone dry (< 20%): very slow weed growth, 0.25x the normal rate.
    expect(resolveCultivationCare({ care: 100, lastMaintainedAtDays: 0, hydration: 10 }, 1)).toBe(98)
    // Soaked (>= 80%): fast weed growth, 1.5x the normal rate.
    expect(resolveCultivationCare({ care: 100, lastMaintainedAtDays: 0, hydration: 90 }, 1)).toBe(88)
  })
})

describe('weedGrowthMultiplier', () => {
  it('maps the four hydration tiers from plan §8', () => {
    expect(weedGrowthMultiplier(0)).toBe(0.25)
    expect(weedGrowthMultiplier(19)).toBe(0.25)
    expect(weedGrowthMultiplier(20)).toBe(0.6)
    expect(weedGrowthMultiplier(49)).toBe(0.6)
    expect(weedGrowthMultiplier(50)).toBe(1)
    expect(weedGrowthMultiplier(79)).toBe(1)
    expect(weedGrowthMultiplier(80)).toBe(1.5)
    expect(weedGrowthMultiplier(100)).toBe(1.5)
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
    const result = applyCultivationMaintenance({ care: 100, lastMaintainedAtDays: 0, hydration: 50 }, 4)
    // 100 - 4*8 = 68, + 50 = 118 -> capped
    expect(result.care).toBe(100)
    expect(result.lastMaintainedAtDays).toBe(4)
  })

  it('caps the restored care at 100', () => {
    const result = applyCultivationMaintenance({ care: 90, lastMaintainedAtDays: 0, hydration: 50 }, 0)
    expect(result.care).toBe(100)
  })

  it('does not restore instantly to full from a low value', () => {
    const result = applyCultivationMaintenance({ care: 10, lastMaintainedAtDays: 0, hydration: 50 }, 0)
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

  it('combines care and drought-stress percentages into one rounding step', () => {
    // maintained (1x) * -30% drought (18-24h) = 0.7 -> round(3*0.7) = 2.
    expect(cultivationYieldCount(3, 100, 18 / 24)).toBe(2)
  })

  it('is 0 when hydration-dead regardless of care or drought stress', () => {
    expect(cultivationYieldCount(3, 100, 0, true)).toBe(0)
  })
})

describe('droughtYieldMultiplier', () => {
  it('steps down 10% per full 6h below threshold, capped at -50% (plan §6)', () => {
    expect(droughtYieldMultiplier(0)).toBe(1)
    expect(droughtYieldMultiplier(5 / 24)).toBe(1)
    expect(droughtYieldMultiplier(6 / 24)).toBe(0.9)
    expect(droughtYieldMultiplier(12 / 24)).toBe(0.8)
    expect(droughtYieldMultiplier(30 / 24)).toBe(0.5)
    expect(droughtYieldMultiplier(100)).toBe(0.5)
    expect(droughtYieldMultiplier(DROUGHT_STRESS_CAP_DAYS)).toBe(0.5)
  })
})

describe('resolveGardenHydration', () => {
  const seed = 12345

  it('is a no-op for zero/negative elapsed time', () => {
    const record = { hydration: 70, lastHydrationUpdateAtDays: 5, droughtStressDays: 0 }
    expect(resolveGardenHydration(record, seed, 5).hydration).toBe(70)
    expect(resolveGardenHydration(record, seed, 3).hydration).toBe(70)
  })

  it('clamps to 0..100', () => {
    const record = { hydration: 100, lastHydrationUpdateAtDays: 0, droughtStressDays: 0 }
    const resolved = resolveGardenHydration(record, seed, 0.01)
    expect(resolved.hydration).toBeGreaterThanOrEqual(0)
    expect(resolved.hydration).toBeLessThanOrEqual(100)
  })

  it('dries out over time with no rain contribution beyond clamped 0', () => {
    const record = { hydration: 100, lastHydrationUpdateAtDays: 0, droughtStressDays: 0 }
    // Even the driest plausible stretch can't go below 0.
    const resolved = resolveGardenHydration(record, seed, 3)
    expect(resolved.hydration).toBeGreaterThanOrEqual(0)
    expect(resolved.hydration).toBeLessThan(100)
  })

  it('never costs more than the bounded lookback window, however stale the anchor', () => {
    const fresh = { hydration: 80, lastHydrationUpdateAtDays: 0, droughtStressDays: 0 }
    const stale = { hydration: 80, lastHydrationUpdateAtDays: -10000, droughtStressDays: 0 }
    // Both resolve without hanging/throwing; a huge gap collapses to the same
    // bounded-window result a `HYDRATION_SIM_WINDOW_DAYS`-old anchor would.
    const freshResolved = resolveGardenHydration(fresh, seed, HYDRATION_SIM_WINDOW_DAYS + 1)
    const staleResolved = resolveGardenHydration(stale, seed, HYDRATION_SIM_WINDOW_DAYS + 1)
    expect(staleResolved.hydration).toBeGreaterThanOrEqual(0)
    expect(freshResolved.hydration).toBeGreaterThanOrEqual(0)
  })

  it('accumulates drought stress only while below the threshold, capped', () => {
    // No rain in this window (deterministic for this seed/day range) — fully
    // dry within a couple of days, so stress should accumulate toward the cap.
    const record = { hydration: 0, lastHydrationUpdateAtDays: 0, droughtStressDays: 0 }
    const resolved = resolveGardenHydration(record, seed, 2)
    expect(resolved.droughtStressDays).toBeGreaterThan(0)
    expect(resolved.droughtStressDays).toBeLessThanOrEqual(DROUGHT_STRESS_CAP_DAYS)
  })
})

describe('applyGardenWatering', () => {
  const seed = 12345

  it('adds the watering gain on top of resolved hydration, clamped at 100', () => {
    const record = { hydration: 0, lastHydrationUpdateAtDays: 0, droughtStressDays: 0 }
    const result = applyGardenWatering(record, seed, 0)
    expect(result.hydration).toBe(40)
  })

  it('clamps at 100 even from a high starting value', () => {
    const record = { hydration: 90, lastHydrationUpdateAtDays: 0, droughtStressDays: 0 }
    const result = applyGardenWatering(record, seed, 0)
    expect(result.hydration).toBe(100)
  })

  it('does not erase already-accumulated drought stress (plan §6)', () => {
    const record = { hydration: 0, lastHydrationUpdateAtDays: 0, droughtStressDays: 0.5 }
    const result = applyGardenWatering(record, seed, 0)
    expect(result.droughtStressDays).toBe(0.5)
  })
})

describe('resolveGardenHydrationAfterHarvest', () => {
  it('resolves hydration but resets drought stress to 0', () => {
    const seed = 12345
    const record = { hydration: 50, lastHydrationUpdateAtDays: 0, droughtStressDays: 1 }
    const result = resolveGardenHydrationAfterHarvest(record, seed, 0)
    expect(result.droughtStressDays).toBe(0)
    expect(result.hydration).toBe(50)
  })
})

describe('gardenPlotPromptLabel', () => {
  it('names both actions and their current values', () => {
    const label = gardenPlotPromptLabel(80, 45)
    expect(label).toContain('[E]')
    expect(label).toContain('[R]')
    expect(label).toContain('45')
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
