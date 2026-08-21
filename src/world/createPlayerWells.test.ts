import { Scene } from 'three'
import { describe, expect, it } from 'vitest'
import { createPlayerWells } from './createPlayerWells'
import { isWellCompleted, WELL_STAGE_WORK_HOURS } from './playerWell'

const sampleHeight = (): number => 0

function setup() {
  const registered: Record<string, unknown> = {}
  const registerColliders = (ownerKey: string, colliders: readonly unknown[]): void => {
    registered[ownerKey] = colliders
  }
  const clearColliders = (ownerKey: string): void => {
    delete registered[ownerKey]
  }
  const wells = createPlayerWells(new Scene(), sampleHeight, registerColliders, clearColliders)
  return { wells, registered }
}

describe('createPlayerWells', () => {
  it('places a new well in the pit stage with zero progress', () => {
    const { wells } = setup()
    const record = wells.place(1, 2, 0.5)
    expect(record.stage).toBe('pit')
    expect(record.workProgress).toBe(0)
    expect(wells.nodes()).toEqual([record])
  })

  it('addWork accumulates hours across repeated calls (30 min, then another 30 min)', () => {
    const { wells } = setup()
    const record = wells.place(0, 0, 0)
    expect(wells.addWork(record.id, 0.5)).toBe(true)
    expect(wells.nodes()[0].workProgress).toBe(0.5)
    expect(wells.addWork(record.id, 0.5)).toBe(true)
    expect(wells.nodes()[0].workProgress).toBe(1)
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
    expect(wells.nodes()[0].workProgress).toBe(0)
  })

  it('transitionTo resets progress to 0 and swaps the stage mesh', () => {
    const { wells } = setup()
    const record = wells.place(0, 0, 0)
    wells.addWork(record.id, WELL_STAGE_WORK_HOURS.pit)
    const pitMesh = wells.list()[0].mesh
    expect(wells.transitionTo(record.id, 'well')).toBe(true)
    const entry = wells.list()[0]
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

  it('nearestCompleted ignores wells whose work is unfinished', () => {
    const { wells } = setup()
    const record = wells.place(0, 0, 0)
    wells.addWork(record.id, WELL_STAGE_WORK_HOURS.pit)
    wells.transitionTo(record.id, 'well')
    wells.addWork(record.id, WELL_STAGE_WORK_HOURS.well)
    wells.transitionTo(record.id, 'roof')
    // roof stage started, but no work done yet — not completed.
    expect(wells.nearestCompleted(0, 0, 100)).toBeNull()
  })

  it('nearestCompleted finds a well once its roof stage work is done', () => {
    const { wells } = setup()
    const record = wells.place(3, 4, 0)
    wells.addWork(record.id, WELL_STAGE_WORK_HOURS.pit)
    wells.transitionTo(record.id, 'well')
    wells.addWork(record.id, WELL_STAGE_WORK_HOURS.well)
    wells.transitionTo(record.id, 'roof')
    wells.addWork(record.id, WELL_STAGE_WORK_HOURS.roof)
    expect(isWellCompleted(wells.nodes()[0])).toBe(true)
    const nearest = wells.nearestCompleted(0, 0, 100)
    expect(nearest).toEqual({ x: 3, y: 0, z: 4 })
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
