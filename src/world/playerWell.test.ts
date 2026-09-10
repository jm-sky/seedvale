import { describe, expect, it } from 'vitest'
import {
  activeWellStage,
  advanceWellConstruction,
  applyWellRoofConditionDelta,
  applyWellRoofRepairWork,
  beginWellRoofRepair,
  getWellPitWorkHours,
  hasActiveWellRoofRepair,
  hasWellRoofCondition,
  initializeWellRoofCondition,
  isWellCompleted,
  isWellStageWorkComplete,
  isWellWaterAvailable,
  nextWellStage,
  type PlayerWellRecord,
  quoteWellRoofRepair,
  resolveWellRoofCondition,
  WELL_ROOF_PASSIVE_DECAY_PER_DAY,
  WELL_ROOF_REPAIR_COST_FACTOR,
  WELL_ROOF_SIM_WINDOW_DAYS,
  WELL_STAGE_CAPABILITY,
  WELL_STAGE_COST,
  WELL_STAGE_WORK_HOURS,
  wellPromptLabel,
  wellRemainingWork,
  wellRoofProtectionFactor,
  wellStageCapabilities,
  wellStageRequirements,
  wellStageWorkHours,
  wellWaterSource,
} from './playerWell'
import { UNCOVERED_WELL_CONSUMPTION_RISK } from './WaterSource'
import { DEEP_WELL_DEPTH_THRESHOLD, WELL_WATER_DEPTH_MAX, WELL_WATER_DEPTH_MIN } from './wellGroundwater'

const SHALLOW_DEPTH = WELL_WATER_DEPTH_MIN
const DEEP_DEPTH = WELL_WATER_DEPTH_MAX
const PIT_HOURS = getWellPitWorkHours(SHALLOW_DEPTH)

function record(overrides: Partial<PlayerWellRecord> = {}): PlayerWellRecord {
  return { id: 'well:1', x: 0, z: 0, yaw: 0, stage: 'pit', workProgress: 0, waterDepth: SHALLOW_DEPTH, waterKind: 'groundwater', ...overrides }
}

describe('playerWell active-work stage transitions', () => {
  it('is not complete at zero progress', () => {
    const well = record({ stage: 'pit', workProgress: 0 })
    expect(isWellStageWorkComplete(well)).toBe(false)
  })

  it('is not complete below the required hours', () => {
    const well = record({ stage: 'pit', workProgress: PIT_HOURS - 0.01 })
    expect(isWellStageWorkComplete(well)).toBe(false)
  })

  it('is complete once the required active-work hours are reached', () => {
    expect(isWellStageWorkComplete(record({ stage: 'pit', workProgress: PIT_HOURS }))).toBe(true)
    expect(isWellStageWorkComplete(record({ stage: 'pit', workProgress: PIT_HOURS + 5 }))).toBe(true)
  })

  it('never completes from elapsed time — only `workProgress` (added via `addWork`) can complete a stage', () => {
    // Construction completion still depends only on `workProgress`, not on
    // elapsed world time. Roof *condition* after completion is a separate
    // lazy weather/time axis (plan world-020).
    const untouched = record({ stage: 'pit', workProgress: 0 })
    expect(isWellStageWorkComplete(untouched)).toBe(false)
    expect(isWellCompleted({ ...untouched, stage: 'roof' })).toBe(false)
  })

  it('reports the next stage, null once roof is current', () => {
    expect(nextWellStage(record({ stage: 'pit' }))).toBe('well')
    expect(nextWellStage(record({ stage: 'well' }))).toBe('roof')
    expect(nextWellStage(record({ stage: 'roof' }))).toBeNull()
  })

  it('only a work-complete roof counts as a finished well', () => {
    expect(isWellCompleted(record({ stage: 'roof', workProgress: 0 }))).toBe(false)
    expect(isWellCompleted(record({ stage: 'roof', workProgress: WELL_STAGE_WORK_HOURS.roof }))).toBe(true)
    expect(isWellCompleted(record({ stage: 'well', workProgress: 999 }))).toBe(false)
    expect(isWellCompleted(record({ stage: 'pit', workProgress: 999 }))).toBe(false)
  })

  it('two partial addWork-style increments summing to the requirement complete the stage (continuation from saved progress)', () => {
    const half = PIT_HOURS / 2
    const afterFirstSession = record({ stage: 'pit', workProgress: half })
    expect(isWellStageWorkComplete(afterFirstSession)).toBe(false)
    const afterSecondSession = record({ stage: 'pit', workProgress: half + half })
    expect(isWellStageWorkComplete(afterSecondSession)).toBe(true)
  })

  it('an interruption preserves whatever progress had already accrued, no more and no less', () => {
    const interrupted = record({ stage: 'pit', workProgress: 0.5 })
    expect(interrupted.workProgress).toBe(0.5)
    expect(isWellStageWorkComplete(interrupted)).toBe(false)
  })

  it('the next stage is available the instant the current stage is complete, before any transition happens', () => {
    const pitDone = record({ stage: 'pit', workProgress: PIT_HOURS })
    expect(activeWellStage(pitDone)).toBe('well')
    const wellDone = record({ stage: 'well', workProgress: WELL_STAGE_WORK_HOURS.well })
    expect(activeWellStage(wellDone)).toBe('roof')
  })

  it('activeWellStage stays on the current stage while its work is unfinished', () => {
    expect(activeWellStage(record({ stage: 'pit', workProgress: 0.5 }))).toBe('pit')
    expect(activeWellStage(record({ stage: 'well', workProgress: 0 }))).toBe('well')
  })

  it('activeWellStage is null once the whole well is completed', () => {
    expect(activeWellStage(record({ stage: 'roof', workProgress: WELL_STAGE_WORK_HOURS.roof }))).toBeNull()
  })
})

describe('wellRemainingWork (plan npc-018 §12)', () => {
  it('covers every remaining stage, not only the current one', () => {
    const fresh = record({ stage: 'pit', workProgress: 0 })
    const expected = PIT_HOURS + WELL_STAGE_WORK_HOURS.well + WELL_STAGE_WORK_HOURS.roof
    expect(wellRemainingWork(fresh)).toBeCloseTo(expected)
  })

  it('subtracts partial progress on the current stage only', () => {
    const half = PIT_HOURS / 2
    const well = record({ stage: 'pit', workProgress: half })
    const expected = (PIT_HOURS - half) + WELL_STAGE_WORK_HOURS.well + WELL_STAGE_WORK_HOURS.roof
    expect(wellRemainingWork(well)).toBeCloseTo(expected)
  })

  it('only counts the final stage once the earlier stages are behind', () => {
    const well = record({ stage: 'roof', workProgress: 0 })
    expect(wellRemainingWork(well)).toBeCloseTo(WELL_STAGE_WORK_HOURS.roof)
  })

  it('is zero once the well is fully completed', () => {
    const done = record({ stage: 'roof', workProgress: WELL_STAGE_WORK_HOURS.roof })
    expect(wellRemainingWork(done)).toBe(0)
  })
})

describe('playerWell stage contract (tool/materials/work-hours)', () => {
  it('pit requires a digging tool; well and roof require none', () => {
    expect(WELL_STAGE_CAPABILITY.pit).toBe('soil_digging')
    expect(WELL_STAGE_CAPABILITY.well).toBeNull()
    expect(WELL_STAGE_CAPABILITY.roof).toBeNull()
  })

  it('material costs match the plan (charged once, when a stage starts)', () => {
    expect(WELL_STAGE_COST.pit).toEqual({ stone: 0, branch: 0 })
    expect(WELL_STAGE_COST.well).toEqual({ stone: 6, branch: 3 })
    expect(WELL_STAGE_COST.roof).toEqual({ stone: 0, branch: 4 })
  })

  it('each stage has a positive active-work requirement', () => {
    expect(getWellPitWorkHours(SHALLOW_DEPTH)).toBeGreaterThan(0)
    expect(WELL_STAGE_WORK_HOURS.well).toBeGreaterThan(0)
    expect(WELL_STAGE_WORK_HOURS.roof).toBeGreaterThan(0)
  })
})

describe('getWellPitWorkHours / wellStageWorkHours (plan world-004 §2)', () => {
  it('increases monotonically with depth', () => {
    const shallow = getWellPitWorkHours(WELL_WATER_DEPTH_MIN)
    const mid = getWellPitWorkHours((WELL_WATER_DEPTH_MIN + WELL_WATER_DEPTH_MAX) / 2)
    const deep = getWellPitWorkHours(WELL_WATER_DEPTH_MAX)
    expect(shallow).toBeLessThan(mid)
    expect(mid).toBeLessThan(deep)
  })

  it('clamps outside the known depth range instead of extrapolating', () => {
    expect(getWellPitWorkHours(WELL_WATER_DEPTH_MIN - 10)).toBe(getWellPitWorkHours(WELL_WATER_DEPTH_MIN))
    expect(getWellPitWorkHours(WELL_WATER_DEPTH_MAX + 10)).toBe(getWellPitWorkHours(WELL_WATER_DEPTH_MAX))
  })

  it('wellStageWorkHours reads the depth function for pit, the fixed table for well/roof', () => {
    expect(wellStageWorkHours('pit', DEEP_DEPTH)).toBe(getWellPitWorkHours(DEEP_DEPTH))
    expect(wellStageWorkHours('well', DEEP_DEPTH)).toBe(WELL_STAGE_WORK_HOURS.well)
    expect(wellStageWorkHours('roof', DEEP_DEPTH)).toBe(WELL_STAGE_WORK_HOURS.roof)
  })
})

describe('wellStageCapabilities (plan world-004 §3)', () => {
  it('a shallow pit only requires soil_digging', () => {
    expect(wellStageCapabilities('pit', SHALLOW_DEPTH)).toEqual(['soil_digging'])
  })

  it('a deep pit additionally requires rock_mining', () => {
    expect(wellStageCapabilities('pit', DEEP_DEPTH)).toEqual(['soil_digging', 'rock_mining'])
  })

  it('well/roof require nothing regardless of depth', () => {
    expect(wellStageCapabilities('well', DEEP_DEPTH)).toEqual([])
    expect(wellStageCapabilities('roof', DEEP_DEPTH)).toEqual([])
  })
})

describe('isWellWaterAvailable (plan world-004 §5)', () => {
  it('is false while the pit is unfinished', () => {
    expect(isWellWaterAvailable(record({ stage: 'pit', workProgress: 0 }))).toBe(false)
  })

  it('is false until the well-stage body work is complete', () => {
    expect(isWellWaterAvailable(record({ stage: 'well', workProgress: WELL_STAGE_WORK_HOURS.well - 0.01 }))).toBe(false)
  })

  it('is true once the body is complete, even before the roof starts', () => {
    expect(isWellWaterAvailable(record({ stage: 'well', workProgress: WELL_STAGE_WORK_HOURS.well }))).toBe(true)
  })

  it('is true throughout the roof stage, done or not', () => {
    expect(isWellWaterAvailable(record({ stage: 'roof', workProgress: 0 }))).toBe(true)
    expect(isWellWaterAvailable(record({ stage: 'roof', workProgress: WELL_STAGE_WORK_HOURS.roof }))).toBe(true)
  })
})

describe('wellWaterSource (plan world-004 §4/§6)', () => {
  it('a roofless body-complete well carries the consumption risk', () => {
    const source = wellWaterSource(record({ stage: 'well', workProgress: WELL_STAGE_WORK_HOURS.well }))
    expect(source.consumptionRisk).toBeDefined()
    expect(source.kind).toBe('well')
    expect(source.quality).toBe('safe')
  })

  it('a fully roofed well at condition 100 carries no consumption risk', () => {
    const source = wellWaterSource(record({ stage: 'roof', workProgress: WELL_STAGE_WORK_HOURS.roof }), 100)
    expect(source.consumptionRisk).toBeUndefined()
  })

  it('an unroofed deep well still requires rope, same as a roofed one', () => {
    const unroofed = wellWaterSource(record({ stage: 'well', workProgress: WELL_STAGE_WORK_HOURS.well, waterDepth: DEEP_DEPTH }))
    const roofed = wellWaterSource(record({ stage: 'roof', workProgress: WELL_STAGE_WORK_HOURS.roof, waterDepth: DEEP_DEPTH }))
    expect(unroofed.requiresRope).toBe(true)
    expect(roofed.requiresRope).toBe(true)
  })

  it('a shallow well never requires rope', () => {
    const source = wellWaterSource(record({ stage: 'roof', workProgress: WELL_STAGE_WORK_HOURS.roof, waterDepth: SHALLOW_DEPTH }))
    expect(source.requiresRope).toBeUndefined()
  })

  it('depth exactly at the threshold counts as deep', () => {
    const source = wellWaterSource(record({ stage: 'roof', workProgress: WELL_STAGE_WORK_HOURS.roof, waterDepth: DEEP_WELL_DEPTH_THRESHOLD }))
    expect(source.requiresRope).toBe(true)
  })
})

describe('playerWell prompt label', () => {
  it('prompts the fresh-start verb at zero progress', () => {
    expect(wellPromptLabel(record({ stage: 'pit', workProgress: 0 }))).toBe('[E] Wykop dół · [R] wymagania')
  })

  it('appends the progress fraction while resuming an in-progress stage', () => {
    const label = wellPromptLabel(record({ stage: 'pit', workProgress: 0.5 }))
    expect(label).toContain('[E] Wykop dół')
    expect(label).toContain(`0.5/${PIT_HOURS}`)
    expect(label).toContain('[R] wymagania')
  })

  it('prompts the next stage verb immediately once the current stage is done, without a fraction', () => {
    const doneDigging = record({ stage: 'pit', workProgress: PIT_HOURS })
    expect(wellPromptLabel(doneDigging)).toBe('[E] Buduj studnię · [R] wymagania')
    const doneBuilding = record({ stage: 'well', workProgress: WELL_STAGE_WORK_HOURS.well })
    expect(wellPromptLabel(doneBuilding)).toBe('[E] Zbuduj daszek · woda dostępna w [R] · [R] wymagania')
  })

  it('shows no water hint before the body is finished', () => {
    expect(wellPromptLabel(record({ stage: 'pit', workProgress: 0 }))).not.toContain('woda dostępna')
    expect(wellPromptLabel(record({ stage: 'well', workProgress: 0 }))).not.toContain('woda dostępna')
  })
})

/** Review 2026-09-03 §5 E9 / §8 step 9 — the shared stage/material/
 *  transition seam `workOnWell`/`describeWellWork`/
 *  `NpcAgent.runContractWorkBout` all rewire onto. */
describe('wellStageRequirements', () => {
  it('builds a MaterialRequirement per nonzero-cost kind, per stage', () => {
    expect(wellStageRequirements('pit')).toEqual([])
    expect(wellStageRequirements('well')).toEqual([
      { kind: 'stone', count: WELL_STAGE_COST.well.stone },
      { kind: 'branch', count: WELL_STAGE_COST.well.branch },
    ])
    expect(wellStageRequirements('roof')).toEqual([
      { kind: 'branch', count: WELL_STAGE_COST.roof.branch },
    ])
  })
})

describe('advanceWellConstruction', () => {
  function fakeWells() {
    const transitioned: { id: string, stage: string }[] = []
    return {
      transitioned,
      wells: {
        transitionTo: (id: string, nextStage: string) => {
          transitioned.push({ id, stage: nextStage })
          return true
        },
      },
    }
  }

  it('reports "completed" once the well has no active stage left (roof done)', () => {
    const { wells } = fakeWells()
    const well = record({ stage: 'roof', workProgress: WELL_STAGE_WORK_HOURS.roof })
    const outcome = advanceWellConstruction({
      record: well,
      wells,
      hasMaterial: () => true,
      consumeMaterial: () => {},
      capabilities: null,
    })
    expect(outcome).toEqual({ status: 'completed' })
  })

  it('blocks on missing materials and leaves stage/progress untouched (no transitionTo call)', () => {
    const { transitioned, wells } = fakeWells()
    const well = record({ stage: 'pit', workProgress: PIT_HOURS })
    const outcome = advanceWellConstruction({
      record: well,
      wells,
      hasMaterial: () => false,
      consumeMaterial: () => { throw new Error('must not consume when blocked') },
      capabilities: null,
    })
    expect(outcome.status).toBe('blocked')
    expect(outcome).toMatchObject({ missing: wellStageRequirements('well') })
    expect(transitioned).toEqual([])
    expect(well.stage).toBe('pit')
    expect(well.workProgress).toBe(PIT_HOURS)
  })

  it('consumes materials and transitions on entering a new stage with everything available', () => {
    const { transitioned, wells } = fakeWells()
    const well = record({ stage: 'pit', workProgress: PIT_HOURS })
    const consumed: unknown[] = []
    const outcome = advanceWellConstruction({
      record: well,
      wells,
      hasMaterial: () => true,
      consumeMaterial: (r) => { consumed.push(r) },
      capabilities: null,
    })
    expect(outcome).toEqual({ status: 'advanced', stage: 'well', enteredNewStage: true })
    expect(transitioned).toEqual([{ id: well.id, stage: 'well' }])
    expect(consumed).toEqual(wellStageRequirements('well'))
  })

  it('does not re-consume materials or re-transition when resuming the current (already-entered) stage', () => {
    const { transitioned, wells } = fakeWells()
    const well = record({ stage: 'well', workProgress: 0.1 })
    const outcome = advanceWellConstruction({
      record: well,
      wells,
      hasMaterial: () => { throw new Error('must not check materials when resuming') },
      consumeMaterial: () => { throw new Error('must not consume when resuming') },
      capabilities: null,
    })
    expect(outcome).toEqual({ status: 'advanced', stage: 'well', enteredNewStage: false })
    expect(transitioned).toEqual([])
  })

  it('capabilities: null skips the capability gate entirely, even for a deep pit', () => {
    const { wells } = fakeWells()
    const well = record({ stage: 'pit', workProgress: 0, waterDepth: DEEP_WELL_DEPTH_THRESHOLD + 1 })
    const outcome = advanceWellConstruction({
      record: well,
      wells,
      hasMaterial: () => true,
      consumeMaterial: () => {},
      capabilities: null,
    })
    expect(outcome.status).not.toBe('blocked')
  })

  it('a deep pit reports rock_mining as missing for a caller that does gate on capabilities', () => {
    const { wells } = fakeWells()
    const well = record({ stage: 'pit', workProgress: 0, waterDepth: DEEP_WELL_DEPTH_THRESHOLD + 1 })
    expect(wellStageCapabilities('pit', well.waterDepth)).toContain('rock_mining')
    const outcome = advanceWellConstruction({
      record: well,
      wells,
      hasMaterial: () => true,
      consumeMaterial: () => {},
      capabilities: { has: (c) => c !== 'rock_mining' },
    })
    expect(outcome).toEqual({ status: 'blocked', missingCapability: 'rock_mining', missing: [] })
  })

  it('a shallow pit never gates on rock_mining even when capabilities are checked', () => {
    const { wells } = fakeWells()
    const well = record({ stage: 'pit', workProgress: 0, waterDepth: SHALLOW_DEPTH })
    const outcome = advanceWellConstruction({
      record: well,
      wells,
      hasMaterial: () => true,
      consumeMaterial: () => {},
      capabilities: { has: (c) => c !== 'rock_mining' },
    })
    expect(outcome.status).not.toBe('blocked')
  })
})

function completedRoof(overrides: Partial<PlayerWellRecord> = {}): PlayerWellRecord {
  return record({
    stage: 'roof',
    workProgress: WELL_STAGE_WORK_HOURS.roof,
    roofCondition: 100,
    lastRoofConditionUpdateAtDays: 0,
    ...overrides,
  })
}

describe('well roof condition (plan world-020)', () => {
  it('has no roof-condition lifecycle during pit, body, or unfinished roof', () => {
    expect(hasWellRoofCondition(record({ stage: 'pit' }))).toBe(false)
    expect(hasWellRoofCondition(record({ stage: 'well', workProgress: WELL_STAGE_WORK_HOURS.well }))).toBe(false)
    expect(hasWellRoofCondition(record({ stage: 'roof', workProgress: 0 }))).toBe(false)
    expect(resolveWellRoofCondition(record({ stage: 'roof', workProgress: 0 }), 1, 10)).toBeNull()
  })

  it('initializes roof condition at 100 exactly once when the roof completes', () => {
    const well = record({ stage: 'roof', workProgress: WELL_STAGE_WORK_HOURS.roof })
    expect(hasWellRoofCondition(well)).toBe(false)
    expect(initializeWellRoofCondition(well, 4.5)).toBe(true)
    expect(well.roofCondition).toBe(100)
    expect(well.lastRoofConditionUpdateAtDays).toBe(4.5)
    expect(initializeWellRoofCondition(well, 9)).toBe(false)
    expect(well.roofCondition).toBe(100)
    expect(well.lastRoofConditionUpdateAtDays).toBe(4.5)
  })

  it('does not initialize condition on an unfinished roof stage', () => {
    const well = record({ stage: 'roof', workProgress: 0 })
    expect(initializeWellRoofCondition(well, 3)).toBe(false)
    expect(well.roofCondition).toBeUndefined()
  })

  it('resolves passive wear over the full elapsed interval, not only the weather window', () => {
    const well = completedRoof({ roofCondition: 80 })
    const nowDays = WELL_ROOF_SIM_WINDOW_DAYS + 10
    const resolved = resolveWellRoofCondition(well, 1, nowDays)
    const windowedPassive = 80 - WELL_ROOF_PASSIVE_DECAY_PER_DAY * WELL_ROOF_SIM_WINDOW_DAYS
    expect(resolved).not.toBeNull()
    expect(resolved!).toBeLessThan(windowedPassive)
    expect(resolved!).toBeGreaterThanOrEqual(0)
  })

  it('never leaves 0..100', () => {
    const well = completedRoof({ roofCondition: 100 })
    const resolved = resolveWellRoofCondition(well, 3, 1000)
    expect(resolved).toBeGreaterThanOrEqual(0)
    expect(resolved).toBeLessThanOrEqual(100)
  })

  it('is deterministic for the same inputs', () => {
    const well = completedRoof()
    expect(resolveWellRoofCondition(well, 42, 8)).toBe(resolveWellRoofCondition(well, 42, 8))
  })

  it('condition 0 is still an existing roof with zero protection, not a missing component', () => {
    const well = completedRoof({ roofCondition: 0 })
    expect(isWellCompleted(well)).toBe(true)
    expect(resolveWellRoofCondition(well, 1, 0)).toBe(0)
    expect(wellRoofProtectionFactor(0)).toBe(0)
    expect(well.workProgress).toBe(WELL_STAGE_WORK_HOURS.roof)
  })
})

describe('wellWaterSource roof-protection factor (plan world-020)', () => {
  const uncoveredChance = UNCOVERED_WELL_CONSUMPTION_RISK.chance
  const completed = completedRoof()

  it('100 / 50 / 0 condition produce 0 / 50% / 100% of uncovered risk chance', () => {
    expect(wellWaterSource(completed, 100).consumptionRisk).toBeUndefined()
    expect(wellWaterSource(completed, 50).consumptionRisk).toEqual({
      ...UNCOVERED_WELL_CONSUMPTION_RISK,
      chance: uncoveredChance * 0.5,
    })
    expect(wellWaterSource(completed, 0).consumptionRisk).toEqual(UNCOVERED_WELL_CONSUMPTION_RISK)
  })

  it('keeps WaterQuality as safe regardless of roof condition', () => {
    expect(wellWaterSource(completed, 0).quality).toBe('safe')
    expect(wellWaterSource(completed, 50).quality).toBe('safe')
  })

  it('does not mutate the well record when deriving a water source', () => {
    const well = completedRoof({ roofCondition: 80 })
    const before = { ...well }
    wellWaterSource(well, 80)
    expect(well).toEqual(before)
  })
})

describe('applyWellRoofConditionDelta checkpoint (plan world-020 / world-021)', () => {
  it('resolves elapsed wear, advances the anchor, then applies the delta', () => {
    const well = completedRoof({ roofCondition: 100, lastRoofConditionUpdateAtDays: 0 })
    const nowDays = 8
    const resolved = resolveWellRoofCondition(well, 7, nowDays)!
    const next = applyWellRoofConditionDelta(well, 7, nowDays, 10)
    expect(next.lastRoofConditionUpdateAtDays).toBe(nowDays)
    expect(next.roofCondition).toBe(Math.min(100, resolved + 10))
    expect(well.roofCondition).toBe(100)
    expect(well.lastRoofConditionUpdateAtDays).toBe(0)
  })

  it('is a no-op when the roof component does not exist', () => {
    const well = record({ stage: 'well', workProgress: WELL_STAGE_WORK_HOURS.well })
    expect(applyWellRoofConditionDelta(well, 1, 10, -5)).toBe(well)
  })
})

describe('well roof repair (plan world-021)', () => {
  it('has no repair quote on unfinished or healthy roofs', () => {
    expect(quoteWellRoofRepair(record({ stage: 'pit' }), 1, 0)).toBeNull()
    expect(quoteWellRoofRepair(record({ stage: 'roof', workProgress: 0 }), 1, 0)).toBeNull()
    expect(quoteWellRoofRepair(completedRoof(), 1, 0)).toBeNull()
  })

  it('quotes a V1 player repair to 100 from a damaged completed roof', () => {
    const quote = quoteWellRoofRepair(completedRoof({ roofCondition: 40 }), 1, 0)
    expect(quote).not.toBeNull()
    expect(quote!.currentCondition).toBe(40)
    expect(quote!.targetCondition).toBe(100)
    expect(quote!.materials).toEqual([{ kind: 'branch', count: 2 }])
    expect(quote!.requiredWork).toBeCloseTo(WELL_STAGE_WORK_HOURS.roof * 0.6 * WELL_ROOF_REPAIR_COST_FACTOR)
  })

  it('keeps a full 0→100 repair strictly cheaper than rebuilding the roof', () => {
    const quote = quoteWellRoofRepair(completedRoof({ roofCondition: 0 }), 1, 0)!
    const rebuildBranches = WELL_STAGE_COST.roof.branch
    const rebuildWork = WELL_STAGE_WORK_HOURS.roof
    const quotedBranches = quote.materials.reduce((sum, r) => sum + (r.kind === 'branch' ? r.count : 0), 0)
    expect(quotedBranches).toBeLessThan(rebuildBranches)
    expect(quote.requiredWork).toBeLessThan(rebuildWork)
    expect(quotedBranches).toBeGreaterThan(0)
    expect(quote.requiredWork).toBeGreaterThan(0)
  })

  it('does not checkpoint or consume when materials are missing', () => {
    const well = completedRoof({ roofCondition: 40, lastRoofConditionUpdateAtDays: 0 })
    const consumed: string[] = []
    const outcome = beginWellRoofRepair({
      record: well,
      seed: 1,
      nowDays: 0,
      hasMaterial: () => false,
      consumeMaterial: (r) => consumed.push(r.kind),
    })
    expect(outcome).toEqual({ status: 'blocked', missing: [{ kind: 'branch', count: 2 }] })
    expect(consumed).toEqual([])
    expect(well.roofCondition).toBe(40)
    expect(well.lastRoofConditionUpdateAtDays).toBe(0)
    expect(well.roofRepair).toBeUndefined()
  })

  it('consumes every material exactly once on a successful start and freezes degradation', () => {
    const well = completedRoof({ roofCondition: 40, lastRoofConditionUpdateAtDays: 0 })
    const consumed: { kind: string, count: number }[] = []
    const outcome = beginWellRoofRepair({
      record: well,
      seed: 1,
      nowDays: 0,
      hasMaterial: () => true,
      consumeMaterial: (r) => consumed.push({ kind: r.kind, count: r.count }),
    })
    expect(outcome.status).toBe('started')
    if (outcome.status !== 'started') return
    expect(consumed).toEqual([{ kind: 'branch', count: 2 }])
    expect(outcome.progress.startedCondition).toBe(outcome.quote.currentCondition)
    expect(outcome.progress.targetCondition).toBe(100)
    expect(outcome.progress.completedWork).toBe(0)
    expect(outcome.lastRoofConditionUpdateAtDays).toBe(0)
    const started = { ...well, roofCondition: outcome.roofCondition, lastRoofConditionUpdateAtDays: outcome.lastRoofConditionUpdateAtDays, roofRepair: outcome.progress }
    expect(resolveWellRoofCondition(started, 1, 20)).toBe(outcome.roofCondition)
    expect(isWellWaterAvailable(started)).toBe(false)
    expect(applyWellRoofConditionDelta(started, 1, 20, -10)).toBe(started)
  })

  it('cannot start a second episode while one is already active', () => {
    const well = completedRoof({
      roofCondition: 40,
      roofRepair: { startedCondition: 40, targetCondition: 100, requiredWork: 1, completedWork: 0.2 },
    })
    expect(quoteWellRoofRepair(well, 1, 0)).toBeNull()
    expect(beginWellRoofRepair({
      record: well,
      seed: 1,
      nowDays: 1,
      hasMaterial: () => true,
      consumeMaterial: () => { throw new Error('must not consume') },
    })).toEqual({ status: 'unavailable' })
  })

  it('accumulates partial work and completes atomically', () => {
    const well = completedRoof({
      roofCondition: 40,
      lastRoofConditionUpdateAtDays: 3,
      roofRepair: { startedCondition: 40, targetCondition: 100, requiredWork: 1, completedWork: 0.25 },
    })
    const afterPartial = applyWellRoofRepairWork(well, 0.5, 4)
    expect(afterPartial.acceptedWork).toBe(0.5)
    expect(afterPartial.record.roofRepair?.completedWork).toBe(0.75)
    expect(afterPartial.record.roofCondition).toBe(40)
    const done = applyWellRoofRepairWork(afterPartial.record, 1, 5)
    expect(done.acceptedWork).toBe(0.25)
    expect(done.record.roofRepair).toBeUndefined()
    expect(done.record.roofCondition).toBe(100)
    expect(done.record.lastRoofConditionUpdateAtDays).toBe(5)
    expect(hasActiveWellRoofRepair(done.record)).toBe(false)
    expect(isWellWaterAvailable(done.record)).toBe(true)
    const later = resolveWellRoofCondition(done.record, 1, 5 + WELL_ROOF_SIM_WINDOW_DAYS)
    expect(later).not.toBeNull()
    expect(later!).toBeLessThan(100)
  })

  it('blocks water use only while the roof repair is active', () => {
    expect(isWellWaterAvailable(completedRoof())).toBe(true)
    expect(isWellWaterAvailable(completedRoof({
      roofRepair: { startedCondition: 40, targetCondition: 100, requiredWork: 1, completedWork: 0 },
    }))).toBe(false)
  })

  it('prompt exposes repair on a damaged completed roof and continue while active', () => {
    expect(wellPromptLabel(completedRoof(), 100)).toBe('[E] Napij się · [R] Napełnij pojemnik')
    expect(wellPromptLabel(completedRoof({ roofCondition: 40 }), 40)).toBe('[E] Napij się · [R] Napraw')
    expect(wellPromptLabel(completedRoof({
      roofRepair: { startedCondition: 40, targetCondition: 100, requiredWork: 1, completedWork: 0 },
    }), 40)).toBe('[E] Kontynuuj naprawę · [R] Szczegóły')
  })
})
