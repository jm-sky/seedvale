import { Scene } from 'three'
import { describe, expect, it } from 'vitest'
import { createPlayerWells } from './createPlayerWells'
import { getWellPitWorkHours, isWellCompleted, WELL_STAGE_WORK_HOURS } from './playerWell'
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
    expect(wells.addWork(record.id, half)).toBe(true)
    expect(wells.nodes()[0]!.workProgress).toBe(half)
    expect(wells.addWork(record.id, half)).toBe(true)
    expect(wells.nodes()[0]!.workProgress).toBe(half * 2)
  })

  it('addWork on an unknown id is a no-op returning false', () => {
    const { wells } = setup()
    expect(wells.addWork('nope', 1)).toBe(false)
  })

  it('addWork never drives progress negative', () => {
    const { wells } = setup()
    const record = wells.place(0, 0, 0)
    wells.addWork(record.id, 0.2)
    wells.addWork(record.id, -5)
    expect(wells.nodes()[0]!.workProgress).toBe(0)
  })

  it('transitionTo resets progress to 0 and swaps the stage mesh', () => {
    const { wells } = setup()
    const record = wells.place(0, 0, 0)
    wells.addWork(record.id, pitHoursFor(0, 0))
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
    wells.addWork(record.id, pitHoursFor(0, 0))
    wells.transitionTo(record.id, 'well')
    // No work done on the `well` stage yet — body not finished, no water.
    expect(wells.nearestCompleted(0, 0, 100)).toBeNull()
  })

  it('nearestCompleted finds a well once its body (well-stage) work is done, even before the roof', () => {
    const { wells } = setup()
    const record = wells.place(3, 4, 0)
    wells.addWork(record.id, pitHoursFor(3, 4))
    wells.transitionTo(record.id, 'well')
    wells.addWork(record.id, WELL_STAGE_WORK_HOURS.well)
    // Still in the `well` stage — roof not started — but already a water source.
    expect(isWellCompleted(wells.nodes()[0]!)).toBe(false)
    const nearest = wells.nearestCompleted(0, 0, 100)
    expect(nearest).toEqual({ x: 3, y: 0, z: 4 })
  })

  it('nearestCompleted still finds a fully completed (roofed) well', () => {
    const { wells } = setup()
    const record = wells.place(3, 4, 0)
    wells.addWork(record.id, pitHoursFor(3, 4))
    wells.transitionTo(record.id, 'well')
    wells.addWork(record.id, WELL_STAGE_WORK_HOURS.well)
    wells.transitionTo(record.id, 'roof')
    wells.addWork(record.id, WELL_STAGE_WORK_HOURS.roof)
    expect(isWellCompleted(wells.nodes()[0]!)).toBe(true)
    expect(wells.nearestCompleted(0, 0, 100)).toEqual({ x: 3, y: 0, z: 4 })
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
