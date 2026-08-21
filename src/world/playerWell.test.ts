import { describe, expect, it } from 'vitest'
import {
  isWellCompleted,
  isWellStageComplete,
  nextWellStage,
  type PlayerWellRecord,
  WELL_STAGE_COST,
  WELL_STAGE_DURATION_DAYS,
  wellAdvanceCost,
  wellPromptLabel,
} from './playerWell'

function record(overrides: Partial<PlayerWellRecord> = {}): PlayerWellRecord {
  return { id: 'well:1', x: 0, z: 0, yaw: 0, stage: 'pit', stageStartedAt: 0, ...overrides }
}

describe('playerWell stage transitions', () => {
  it('is not complete before the stage duration elapses', () => {
    const well = record({ stage: 'pit', stageStartedAt: 10 })
    expect(isWellStageComplete(well, 10.5)).toBe(false)
    expect(isWellStageComplete(well, 10 + WELL_STAGE_DURATION_DAYS.pit - 0.01)).toBe(false)
  })

  it('is complete once the stage duration has elapsed', () => {
    const well = record({ stage: 'pit', stageStartedAt: 10 })
    expect(isWellStageComplete(well, 10 + WELL_STAGE_DURATION_DAYS.pit)).toBe(true)
    expect(isWellStageComplete(well, 20)).toBe(true)
  })

  it('reports the next stage, null once roof is current', () => {
    expect(nextWellStage(record({ stage: 'pit' }))).toBe('well')
    expect(nextWellStage(record({ stage: 'well' }))).toBe('roof')
    expect(nextWellStage(record({ stage: 'roof' }))).toBeNull()
  })

  it('only a stage-complete roof counts as a finished well', () => {
    const roof = record({ stage: 'roof', stageStartedAt: 5 })
    expect(isWellCompleted(roof, 5)).toBe(false)
    expect(isWellCompleted(roof, 5 + WELL_STAGE_DURATION_DAYS.roof)).toBe(true)
    expect(isWellCompleted(record({ stage: 'well', stageStartedAt: 0 }), 100)).toBe(false)
    expect(isWellCompleted(record({ stage: 'pit', stageStartedAt: 0 }), 100)).toBe(false)
  })

  it('charges the cost of the stage being advanced into, not the current one', () => {
    expect(wellAdvanceCost(record({ stage: 'pit' }))).toEqual(WELL_STAGE_COST.well)
    expect(wellAdvanceCost(record({ stage: 'well' }))).toEqual(WELL_STAGE_COST.roof)
    expect(wellAdvanceCost(record({ stage: 'roof' }))).toBeNull()
  })

  it('prompts progress while the current stage is unfinished, advance once done', () => {
    const inProgress = record({ stage: 'pit', stageStartedAt: 0 })
    expect(wellPromptLabel(inProgress, 0.1)).toMatch(/toku/)
    const doneDigging = record({ stage: 'pit', stageStartedAt: 0 })
    expect(wellPromptLabel(doneDigging, WELL_STAGE_DURATION_DAYS.pit)).toContain('Buduj studnię')
    const doneBuilding = record({ stage: 'well', stageStartedAt: 0 })
    expect(wellPromptLabel(doneBuilding, WELL_STAGE_DURATION_DAYS.well)).toContain('Zbuduj daszek')
  })
})
