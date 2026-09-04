import { describe, expect, it } from 'vitest'
import {
  activeWellStage,
  getWellPitWorkHours,
  isWellCompleted,
  isWellStageWorkComplete,
  isWellWaterAvailable,
  nextWellStage,
  type PlayerWellRecord,
  WELL_STAGE_CAPABILITY,
  WELL_STAGE_COST,
  WELL_STAGE_WORK_HOURS,
  wellPromptLabel,
  wellStageCapabilities,
  wellStageWorkHours,
  wellWaterSource,
} from './playerWell'
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
    // No function in this module accepts a "now"/elapsed-time argument any
    // more — `isWellStageWorkComplete`/`isWellCompleted` take only `record`.
    // A record left at workProgress: 0 stays incomplete no matter what.
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

  it('a fully roofed well carries no consumption risk', () => {
    const source = wellWaterSource(record({ stage: 'roof', workProgress: WELL_STAGE_WORK_HOURS.roof }))
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
