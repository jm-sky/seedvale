import { describe, expect, it } from 'vitest'
import { CONDITION_MAX } from '../world/condition'
import {
  applyCampRepairWork,
  beginCampRepair,
  CAMP_REPAIR_COST_FACTOR,
  campRepairXp,
  hasActiveCampRepair,
  resolveCampRepairQuote,
  TENT_REPAIR_FULL_HIDE,
  TENT_REPAIR_FULL_WORK_HOURS,
} from './campRepair'

describe('resolveCampRepairQuote (plan items-player-019)', () => {
  it('returns null at full condition and quotes condition 0', () => {
    expect(resolveCampRepairQuote('tent', 100)).toBeNull()
    const quote = resolveCampRepairQuote('tent', 0)
    expect(quote).not.toBeNull()
    expect(quote?.targetCondition).toBe(CONDITION_MAX)
    expect(quote?.capability).toBe('textile_repair')
    expect(quote?.effort).toBe('light')
    expect(quote?.materials).toEqual([{ kind: 'hide', count: Math.max(1, Math.round(TENT_REPAIR_FULL_HIDE * CAMP_REPAIR_COST_FACTOR)) }])
    expect(quote?.requiredWork).toBeCloseTo(TENT_REPAIR_FULL_WORK_HOURS * CAMP_REPAIR_COST_FACTOR)
  })

  it('scales materials and work with restored damage', () => {
    const half = resolveCampRepairQuote('tent', 50)!
    const full = resolveCampRepairQuote('tent', 0)!
    expect(half.requiredWork).toBeLessThan(full.requiredWork)
    expect(half.materials[0]!.count).toBeLessThanOrEqual(full.materials[0]!.count)
  })

  it('uses hide + textile_repair for bedroll and branch + wood_chopping for platform', () => {
    const bedroll = resolveCampRepairQuote('bedroll', 40)!
    expect(bedroll.capability).toBe('textile_repair')
    expect(bedroll.materials[0]?.kind).toBe('hide')
    expect(bedroll.effort).toBe('light')
    const platform = resolveCampRepairQuote('platform', 40)!
    expect(platform.capability).toBe('wood_chopping')
    expect(platform.materials[0]?.kind).toBe('branch')
    expect(platform.effort).toBe('moderate')
  })
})

describe('beginCampRepair / applyCampRepairWork', () => {
  it('does not start or consume when capability or materials are missing', () => {
    let consumed = 0
    expect(beginCampRepair({
      kind: 'tent',
      currentCondition: 40,
      nowDays: 3,
      hasActiveRepair: false,
      hasCapability: () => false,
      hasMaterial: () => true,
      consumeMaterial: () => { consumed += 1 },
    })).toEqual({ status: 'blocked-capability', capability: 'textile_repair' })
    expect(beginCampRepair({
      kind: 'tent',
      currentCondition: 40,
      nowDays: 3,
      hasActiveRepair: false,
      hasCapability: () => true,
      hasMaterial: () => false,
      consumeMaterial: () => { consumed += 1 },
    }).status).toBe('blocked')
    expect(consumed).toBe(0)
    expect(beginCampRepair({
      kind: 'tent',
      currentCondition: 100,
      nowDays: 3,
      hasActiveRepair: false,
      hasCapability: () => true,
      hasMaterial: () => true,
      consumeMaterial: () => { consumed += 1 },
    })).toEqual({ status: 'unavailable' })
  })

  it('consumes materials once, preserves interruption, and completes to 100', () => {
    let consumed = 0
    const started = beginCampRepair({
      kind: 'tent',
      currentCondition: 40,
      nowDays: 3,
      hasActiveRepair: false,
      hasCapability: () => true,
      hasMaterial: () => true,
      consumeMaterial: () => { consumed += 1 },
    })
    expect(started.status).toBe('started')
    if (started.status !== 'started') return
    expect(consumed).toBe(1)
    expect(hasActiveCampRepair({ repair: started.progress })).toBe(true)

    const record = {
      condition: started.condition,
      lastConditionUpdateAtDays: started.lastConditionUpdateAtDays,
      repair: started.progress,
    }
    const partial = applyCampRepairWork(record, started.progress.requiredWork / 2, 4)
    expect(partial.acceptedWork).toBeCloseTo(started.progress.requiredWork / 2)
    expect(partial.record.repair?.completedWork).toBeCloseTo(started.progress.requiredWork / 2)

    const resume = beginCampRepair({
      kind: 'tent',
      currentCondition: 40,
      nowDays: 5,
      hasActiveRepair: true,
      hasCapability: () => true,
      hasMaterial: () => true,
      consumeMaterial: () => { consumed += 1 },
    })
    expect(resume.status).toBe('unavailable')
    expect(consumed).toBe(1)

    const done = applyCampRepairWork(partial.record, started.progress.requiredWork, 6)
    expect(done.record.condition).toBe(100)
    expect(done.record.repair).toBeUndefined()
    expect(done.record.lastConditionUpdateAtDays).toBe(6)
    expect(campRepairXp(0)).toBe(0)
    expect(campRepairXp(done.acceptedWork)).toBeGreaterThan(0)
  })
})
