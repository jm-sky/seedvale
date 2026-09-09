import { Scene } from 'three'
import { describe, expect, it } from 'vitest'
import { createPlayerWells } from './createPlayerWells'
import { getWellPitWorkHours, isWellCompleted, isWellWaterAvailable, WELL_STAGE_WORK_HOURS } from './playerWell'
import { resolveWellWater } from './wellGroundwater'

const sampleHeight = (): number => 0
const SEED = 42
const WATER_LEVEL = 0

function setup() {
  const registered: Record<string, unknown> = {}
  const registerColliders = (ownerKey: string, colliders: readonly unknown[]): void => {
    registered[ownerKey] = colliders
  }
  const clearColliders = (ownerKey: string): void => {
    delete registered[ownerKey]
  }
  const wells = createPlayerWells(new Scene(), sampleHeight, registerColliders, clearColliders, [], SEED, WATER_LEVEL)
  return { wells, registered }
}

/** Matches whatever `place(x, z, ...)` itself resolves — `sampleHeight`
 *  always returns 0 in this test, so only `(x, z)` varies the result. */
function pitHoursFor(x: number, z: number): number {
  return getWellPitWorkHours(resolveWellWater(SEED, x, z, sampleHeight(), WATER_LEVEL).depth)
}

describe('createPlayerWells', () => {
  it('places a new well in the pit stage with zero progress', () => {
    const { wells } = setup()
    const record = wells.place(1, 2, 0.5)
    expect(record.stage).toBe('pit')
    expect(record.workProgress).toBe(0)
    expect(wells.nodes()).toEqual([record])
  })

  it('resolves and persists waterDepth/waterKind deterministically at placement, matching resolveWellWater', () => {
    const { wells } = setup()
    const record = wells.place(7, -3, 0)
    const expected = resolveWellWater(SEED, 7, -3, sampleHeight(), WATER_LEVEL)
    expect(record.waterDepth).toBe(expected.depth)
    expect(record.waterKind).toBe(expected.kind)
  })

  it('never re-resolves an already-placed well\'s water on restore (constructor initial records pass through untouched)', () => {
    const { wells: source } = setup()
    const placed = source.place(7, -3, 0)
    // Simulate a chunk reload/save-load restore: a fresh instance seeded
    // with the already-resolved record, not a re-placement.
    const registerColliders = (): void => {}
    const clearColliders = (): void => {}
    const restored = createPlayerWells(new Scene(), sampleHeight, registerColliders, clearColliders, [placed], SEED, WATER_LEVEL)
    expect(restored.nodes()[0]!.waterDepth).toBe(placed.waterDepth)
    expect(restored.nodes()[0]!.waterKind).toBe(placed.waterKind)
  })

  it('addWork accumulates hours across repeated calls (half the pit requirement, then the rest)', () => {
    const { wells } = setup()
    const record = wells.place(0, 0, 0)
    const half = pitHoursFor(0, 0) / 2
    expect(wells.addWork(record.id, half, 0)).toBe(true)
    expect(wells.nodes()[0]!.workProgress).toBe(half)
    expect(wells.addWork(record.id, half, 0)).toBe(true)
    expect(wells.nodes()[0]!.workProgress).toBe(half * 2)
  })

  it('addWork on an unknown id is a no-op returning false', () => {
    const { wells } = setup()
    expect(wells.addWork('nope', 1, 0)).toBe(false)
  })

  it('addWork never drives progress negative', () => {
    const { wells } = setup()
    const record = wells.place(0, 0, 0)
    wells.addWork(record.id, 0.2, 0)
    wells.addWork(record.id, -5, 0)
    expect(wells.nodes()[0]!.workProgress).toBe(0)
  })

  it('transitionTo resets progress to 0 and swaps the stage mesh', () => {
    const { wells } = setup()
    const record = wells.place(0, 0, 0)
    wells.addWork(record.id, pitHoursFor(0, 0), 0)
    const pitMesh = wells.list()[0]!.mesh
    expect(wells.transitionTo(record.id, 'well')).toBe(true)
    const entry = wells.list()[0]!
    expect(entry.stage).toBe('well')
    expect(entry.workProgress).toBe(0)
    expect(entry.mesh).not.toBe(pitMesh)
  })

  it('transitionTo on an unknown id is a no-op returning false', () => {
    const { wells } = setup()
    expect(wells.transitionTo('nope', 'well')).toBe(false)
  })

  it('re-registers the collider under the same key on transition (idempotent, never appends)', () => {
    const { wells, registered } = setup()
    const record = wells.place(5, 5, 0)
    const key = `playerWell:${record.id}`
    expect(registered[key]).toBeDefined()
    wells.transitionTo(record.id, 'well')
    expect(Object.keys(registered).filter((k) => k === key)).toEqual([key])
  })

  it('nearestCompleted ignores a well whose body work is unfinished', () => {
    const { wells } = setup()
    const record = wells.place(0, 0, 0)
    wells.addWork(record.id, pitHoursFor(0, 0), 0)
    wells.transitionTo(record.id, 'well')
    // No work done on the `well` stage yet — body not finished, no water.
    expect(wells.nearestCompleted(0, 0, 100)).toBeNull()
  })

  it('nearestCompleted finds a well once its body (well-stage) work is done, even before the roof', () => {
    const { wells } = setup()
    const record = wells.place(3, 4, 0)
    wells.addWork(record.id, pitHoursFor(3, 4), 0)
    wells.transitionTo(record.id, 'well')
    wells.addWork(record.id, WELL_STAGE_WORK_HOURS.well, 0)
    // Still in the `well` stage — roof not started — but already a water source.
    expect(isWellCompleted(wells.nodes()[0]!)).toBe(false)
    const nearest = wells.nearestCompleted(0, 0, 100)
    expect(nearest).toEqual({ x: 3, y: 0, z: 4 })
  })

  it('nearestCompleted still finds a fully completed (roofed) well', () => {
    const { wells } = setup()
    const record = wells.place(3, 4, 0)
    wells.addWork(record.id, pitHoursFor(3, 4), 0)
    wells.transitionTo(record.id, 'well')
    wells.addWork(record.id, WELL_STAGE_WORK_HOURS.well, 0)
    wells.transitionTo(record.id, 'roof')
    wells.addWork(record.id, WELL_STAGE_WORK_HOURS.roof, 6)
    expect(isWellCompleted(wells.nodes()[0]!)).toBe(true)
    expect(wells.nodes()[0]!.roofCondition).toBe(100)
    expect(wells.nodes()[0]!.lastRoofConditionUpdateAtDays).toBe(6)
    expect(wells.nearestCompleted(0, 0, 100)).toEqual({ x: 3, y: 0, z: 4 })
  })

  it('does not initialize roof condition until the roof stage itself completes', () => {
    const { wells } = setup()
    const record = wells.place(0, 0, 0)
    wells.addWork(record.id, pitHoursFor(0, 0), 2)
    wells.transitionTo(record.id, 'well')
    wells.addWork(record.id, WELL_STAGE_WORK_HOURS.well, 2)
    wells.transitionTo(record.id, 'roof')
    wells.addWork(record.id, WELL_STAGE_WORK_HOURS.roof / 2, 2)
    expect(wells.nodes()[0]!.roofCondition).toBeUndefined()
    expect(wells.nodes()[0]!.lastRoofConditionUpdateAtDays).toBeUndefined()
    expect(wells.nodes()[0]!.workProgress).toBe(WELL_STAGE_WORK_HOURS.roof / 2)
  })

  it('round-trips roof condition through nodes() and a fresh runtime restore', () => {
    const { wells } = setup()
    const record = wells.place(1, 1, 0)
    wells.addWork(record.id, pitHoursFor(1, 1), 0)
    wells.transitionTo(record.id, 'well')
    wells.addWork(record.id, WELL_STAGE_WORK_HOURS.well, 0)
    wells.transitionTo(record.id, 'roof')
    wells.addWork(record.id, WELL_STAGE_WORK_HOURS.roof, 9)
    wells.applyRoofConditionDelta(record.id, 1, 9, -20)
    const snapshot = wells.nodes()
    expect(snapshot[0]!.roofCondition).toBe(80)
    expect(snapshot[0]!.lastRoofConditionUpdateAtDays).toBe(9)
    const restored = createPlayerWells(new Scene(), sampleHeight, () => {}, () => {}, snapshot, SEED, WATER_LEVEL)
    expect(restored.nodes()[0]!.roofCondition).toBe(80)
    expect(restored.nodes()[0]!.lastRoofConditionUpdateAtDays).toBe(9)
    expect(restored.nodes()[0]!.workProgress).toBe(WELL_STAGE_WORK_HOURS.roof)
  })

  it('applyRoofConditionDelta is a no-op for an unknown id or unfinished roof', () => {
    const { wells } = setup()
    expect(wells.applyRoofConditionDelta('nope', 1, 0, -10)).toBe(false)
    const record = wells.place(0, 0, 0)
    expect(wells.applyRoofConditionDelta(record.id, 1, 0, -10)).toBe(false)
  })

  it('startRoofRepair consumes materials once, freezes degradation, and round-trips through nodes()', () => {
    const { wells } = setup()
    const record = wells.place(1, 1, 0)
    wells.addWork(record.id, pitHoursFor(1, 1), 0)
    wells.transitionTo(record.id, 'well')
    wells.addWork(record.id, WELL_STAGE_WORK_HOURS.well, 0)
    wells.transitionTo(record.id, 'roof')
    wells.addWork(record.id, WELL_STAGE_WORK_HOURS.roof, 2)
    wells.applyRoofConditionDelta(record.id, SEED, 2, -60)
    const consumed: number[] = []
    const started = wells.startRoofRepair(
      record.id,
      2,
      () => true,
      (r) => consumed.push(r.count),
    )
    expect(started.status).toBe('started')
    if (started.status !== 'started') return
    expect(consumed).toEqual([started.quote.materials[0]!.count])
    expect(isWellWaterAvailable(wells.nodes()[0]!)).toBe(false)
    expect(wells.nearestCompleted(1, 1, 100)).toBeNull()
    const accepted = wells.contributeRoofRepairWork(record.id, 0.1, 2)
    expect(accepted).toBe(0.1)
    const snapshot = wells.nodes()
    expect(snapshot[0]!.roofRepair?.completedWork).toBe(0.1)
    const restored = createPlayerWells(new Scene(), sampleHeight, () => {}, () => {}, snapshot, SEED, WATER_LEVEL)
    expect(restored.nodes()[0]!.roofRepair).toEqual(snapshot[0]!.roofRepair)
    expect(restored.startRoofRepair(record.id, 4, () => true, () => { throw new Error('must not consume on resume') }).status).toBe('unavailable')
    const remaining = restored.nodes()[0]!.roofRepair!.requiredWork - 0.1
    expect(restored.contributeRoofRepairWork(record.id, remaining + 1, 5)).toBe(remaining)
    expect(restored.nodes()[0]!.roofRepair).toBeUndefined()
    expect(restored.nodes()[0]!.roofCondition).toBe(100)
    expect(restored.nodes()[0]!.lastRoofConditionUpdateAtDays).toBe(5)
    expect(isWellWaterAvailable(restored.nodes()[0]!)).toBe(true)
    expect(restored.nearestCompleted(1, 1, 100)).toEqual({ x: 1, y: 0, z: 1 })
  })

  it('startRoofRepair does not mutate the well when materials are missing', () => {
    const { wells } = setup()
    const record = wells.place(0, 0, 0)
    wells.addWork(record.id, pitHoursFor(0, 0), 0)
    wells.transitionTo(record.id, 'well')
    wells.addWork(record.id, WELL_STAGE_WORK_HOURS.well, 0)
    wells.transitionTo(record.id, 'roof')
    wells.addWork(record.id, WELL_STAGE_WORK_HOURS.roof, 1)
    wells.applyRoofConditionDelta(record.id, SEED, 2, -50)
    const before = wells.nodes()[0]!
    const outcome = wells.startRoofRepair(record.id, 3, () => false, () => { throw new Error('must not consume') })
    expect(outcome.status).toBe('blocked')
    expect(wells.nodes()[0]!).toEqual(before)
  })

  it('dispose clears every registered collider', () => {
    const { wells, registered } = setup()
    const record = wells.place(0, 0, 0)
    expect(Object.keys(registered)).toContain(`playerWell:${record.id}`)
    wells.dispose()
    expect(Object.keys(registered)).not.toContain(`playerWell:${record.id}`)
    expect(wells.nodes()).toEqual([])
  })
})
