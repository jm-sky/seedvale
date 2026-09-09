import { Scene } from 'three'
import { describe, expect, it } from 'vitest'
import { createResidentialBuildings } from './createResidentialBuildings'
import { createUnfinishedResidentialBuildingRecord } from './residentialBuilding'
import { RESIDENTIAL_BUILDING_DEFINITIONS } from './residentialBuilding'

const sampleHeight = (): number => 0

describe('createResidentialBuildings (plan settlements-005)', () => {
  it('clamps contributeWork and does not spill into the next stage', () => {
    const colliders: string[] = []
    const buildings = createResidentialBuildings(
      new Scene(),
      sampleHeight,
      (key) => { colliders.push(key) },
      () => {},
      [createUnfinishedResidentialBuildingRecord({
        id: 'residential:test',
        kind: 'small_house',
        x: 1,
        z: 2,
        yaw: 0.3,
      })],
    )
    expect(buildings.contributeWork('residential:test', 4)).toEqual({ acceptedWork: 0, completed: false })
    expect(buildings.supplyMaterials('residential:test')).toBe(true)
    const required = RESIDENTIAL_BUILDING_DEFINITIONS.small_house.stages.foundation.requiredWork
    expect(buildings.contributeWork('residential:test', required + 5)).toEqual({
      acceptedWork: required,
      completed: false,
    })
    const record = buildings.find('residential:test')
    expect(record?.stage).toBe('structure')
    expect(record?.materialsSupplied).toBe(false)
    expect(buildings.contributeWork('residential:test', 3)).toEqual({ acceptedWork: 0, completed: false })
    expect(colliders).toContain('residential:residential:test')
    buildings.dispose()
  })

  it('refuses to remove a completed house', () => {
    const record = createUnfinishedResidentialBuildingRecord({
      id: 'residential:done',
      kind: 'small_house',
      x: 0,
      z: 0,
      yaw: 0,
    })
    const buildings = createResidentialBuildings(new Scene(), sampleHeight, () => {}, () => {}, [record])
    for (const stage of ['foundation', 'structure', 'roof'] as const) {
      expect(buildings.supplyMaterials('residential:done')).toBe(true)
      const required = RESIDENTIAL_BUILDING_DEFINITIONS.small_house.stages[stage].requiredWork
      buildings.contributeWork('residential:done', required)
    }
    expect(buildings.find('residential:done')?.stage).toBe('completed')
    expect(buildings.remove('residential:done')).toBeNull()
    expect(buildings.find('residential:done')).toBeTruthy()
    buildings.dispose()
  })
})
