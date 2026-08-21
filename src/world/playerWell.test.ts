import { describe, expect, it } from 'vitest'
import {
  activeWellStage,
  isWellCompleted,
  isWellStageWorkComplete,
  nextWellStage,
  type PlayerWellRecord,
  WELL_STAGE_COST,
  WELL_STAGE_TOOL,
  WELL_STAGE_WORK_HOURS,
  wellPromptLabel,
} from './playerWell'

function record(overrides: Partial<PlayerWellRecord> = {}): PlayerWellRecord {
  return { id: 'well:1', x: 0, z: 0, yaw: 0, stage: 'pit', workProgress: 0, ...overrides }
}

describe('playerWell active-work stage transitions', () => {
  it('is not complete at zero progress', () => {
    const well = record({ stage: 'pit', workProgress: 0 })
    expect(isWellStageWorkComplete(well)).toBe(false)
  })

  it('is not complete below the required hours', () => {
    const well = record({ stage: 'pit', workProgress: WELL_STAGE_WORK_HOURS.pit - 0.01 })
    expect(isWellStageWorkComplete(well)).toBe(false)
  })

  it('is complete once the required active-work hours are reached', () => {
    expect(isWellStageWorkComplete(record({ stage: 'pit', workProgress: WELL_STAGE_WORK_HOURS.pit }))).toBe(true)
    expect(isWellStageWorkComplete(record({ stage: 'pit', workProgress: WELL_STAGE_WORK_HOURS.pit + 5 }))).toBe(true)
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
    const half = WELL_STAGE_WORK_HOURS.pit / 2
    const afterFirstSession = record({ stage: 'pit', workProgress: half })
    expect(isWellStageWorkComplete(afterFirstSession)).toBe(false)
    const afterSecondSession = record({ stage: 'pit', workProgress: half + half })
    expect(isWellStageWorkComplete(afterSecondSession)).toBe(true)
  })

  it('an interruption preserves whatever progress had already accrued, no more and no less', () => {
    const interrupted = record({ stage: 'pit', workProgress: 1 })
    expect(interrupted.workProgress).toBe(1)
    expect(isWellStageWorkComplete(interrupted)).toBe(false)
  })

  it('the next stage is available the instant the current stage is complete, before any transition happens', () => {
    const pitDone = record({ stage: 'pit', workProgress: WELL_STAGE_WORK_HOURS.pit })
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
  it('pit requires a shovel; well and roof require no tool', () => {
    expect(WELL_STAGE_TOOL.pit).toBe('shovel')
    expect(WELL_STAGE_TOOL.well).toBeNull()
    expect(WELL_STAGE_TOOL.roof).toBeNull()
  })

  it('material costs match the plan (charged once, when a stage starts)', () => {
    expect(WELL_STAGE_COST.pit).toEqual({ stone: 0, branch: 0 })
    expect(WELL_STAGE_COST.well).toEqual({ stone: 6, branch: 3 })
    expect(WELL_STAGE_COST.roof).toEqual({ stone: 0, branch: 4 })
  })

  it('each stage has a positive active-work requirement', () => {
    expect(WELL_STAGE_WORK_HOURS.pit).toBeGreaterThan(0)
    expect(WELL_STAGE_WORK_HOURS.well).toBeGreaterThan(0)
    expect(WELL_STAGE_WORK_HOURS.roof).toBeGreaterThan(0)
  })
})

describe('playerWell prompt label', () => {
  it('prompts the fresh-start verb at zero progress', () => {
    expect(wellPromptLabel(record({ stage: 'pit', workProgress: 0 }))).toBe('[E] Wykop dół')
  })

  it('appends the progress fraction while resuming an in-progress stage', () => {
    const label = wellPromptLabel(record({ stage: 'pit', workProgress: 1 }))
    expect(label).toContain('[E] Wykop dół')
    expect(label).toContain(`1/${WELL_STAGE_WORK_HOURS.pit}`)
  })

  it('prompts the next stage verb immediately once the current stage is done, without a fraction', () => {
    const doneDigging = record({ stage: 'pit', workProgress: WELL_STAGE_WORK_HOURS.pit })
    expect(wellPromptLabel(doneDigging)).toBe('[E] Buduj studnię')
    const doneBuilding = record({ stage: 'well', workProgress: WELL_STAGE_WORK_HOURS.well })
    expect(wellPromptLabel(doneBuilding)).toBe('[E] Zbuduj daszek')
  })
})
