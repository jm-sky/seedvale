import { describe, expect, it } from 'vitest'
import type { ItemKind } from '../items/items'
import { evaluateOrientedGroundPlacement } from '../items/tentPlacement'
import {
  applyResidentialBuildingWork,
  coveringPreparationSize,
  createUnfinishedResidentialBuildingRecord,
  isPlayerOwnedResidentialBuilding,
  isResidentialBuildingComplete,
  isResidentialBuildingMaterialBlocked,
  nextResidentialConstructionStage,
  RESIDENTIAL_BUILDING_DEFINITIONS,
  residentialBuildingApproachPoint,
  type ResidentialBuildingRecord,
  residentialBuildingRemainingWork,
  residentialHomePlaceId,
  residentialStageRequirements,
  supplyResidentialStageMaterials,
} from './residentialBuilding'

const EXISTING_ITEM_KINDS: ReadonlySet<ItemKind> = new Set(['beam', 'branch', 'stone'])

function unfinished(overrides: Partial<ResidentialBuildingRecord> = {}): ResidentialBuildingRecord {
  return {
    ...createUnfinishedResidentialBuildingRecord({
      id: 'house:1',
      kind: 'small_house',
      x: 0,
      z: 0,
      yaw: 0,
    }),
    ...overrides,
  }
}

describe('residential building definitions (plan settlements-005)', () => {
  it('gives small houses capacity 3 and medium houses capacity 6', () => {
    expect(RESIDENTIAL_BUILDING_DEFINITIONS.small_house.housingCapacity).toBe(3)
    expect(RESIDENTIAL_BUILDING_DEFINITIONS.medium_house.housingCapacity).toBe(6)
  })

  it('shares the same construction stages for both sizes', () => {
    expect(Object.keys(RESIDENTIAL_BUILDING_DEFINITIONS.small_house.stages)).toEqual(
      Object.keys(RESIDENTIAL_BUILDING_DEFINITIONS.medium_house.stages),
    )
    expect(nextResidentialConstructionStage('foundation')).toBe('structure')
    expect(nextResidentialConstructionStage('structure')).toBe('roof')
    expect(nextResidentialConstructionStage('roof')).toBe('completed')
  })

  it('uses only existing ItemKind materials', () => {
    for (const def of Object.values(RESIDENTIAL_BUILDING_DEFINITIONS)) {
      for (const stage of Object.values(def.stages)) {
        for (const requirement of stage.requiredMaterials) {
          expect(EXISTING_ITEM_KINDS.has(requirement.kind)).toBe(true)
          expect(requirement.count).toBeGreaterThan(0)
        }
      }
    }
  })

  it('covers each footprint with an existing preparation size', () => {
    expect(coveringPreparationSize(4, 4)).toBe(4)
    expect(coveringPreparationSize(6, 4)).toBe(6)
  })
})

describe('residential building work (plan settlements-005)', () => {
  it('accepts no work while the current stage is material-blocked', () => {
    const record = unfinished()
    expect(isResidentialBuildingMaterialBlocked(record)).toBe(true)
    expect(residentialBuildingRemainingWork(record)).toBe(0)
    const result = applyResidentialBuildingWork(record, 4)
    expect(result.acceptedWork).toBe(0)
    expect(result.next).toBe(record)
    expect(result.stageAdvanced).toBe(false)
  })

  it('does not spill leftover work into the next unsupplied stage', () => {
    const supplied = supplyResidentialStageMaterials(unfinished())!
    const required = RESIDENTIAL_BUILDING_DEFINITIONS.small_house.stages.foundation.requiredWork
    const result = applyResidentialBuildingWork(supplied, required + 10)
    expect(result.acceptedWork).toBe(required)
    expect(result.stageAdvanced).toBe(true)
    expect(result.next.stage).toBe('structure')
    expect(result.next.materialsSupplied).toBe(false)
    expect(result.next.stageWorkProgress).toBe(0)
    expect(residentialBuildingRemainingWork(result.next)).toBe(0)
    const spilled = applyResidentialBuildingWork(result.next, 4)
    expect(spilled.acceptedWork).toBe(0)
    expect(spilled.next.stage).toBe('structure')
  })

  it('clamps sequential contributions from multiple actors', () => {
    let record = supplyResidentialStageMaterials(unfinished())!
    const first = applyResidentialBuildingWork(record, 0.75)
    expect(first.acceptedWork).toBe(0.75)
    record = first.next
    const second = applyResidentialBuildingWork(record, 10)
    expect(second.acceptedWork).toBeCloseTo(1.25)
    expect(second.next.stage).toBe('structure')
    expect(second.next.owner).toEqual({ kind: 'player' })
  })

  it('keeps Player ownership after NPC-sized contributions complete the house', () => {
    let record = unfinished({ kind: 'small_house' })
    for (const stage of ['foundation', 'structure', 'roof'] as const) {
      record = supplyResidentialStageMaterials(record)!
      const required = RESIDENTIAL_BUILDING_DEFINITIONS.small_house.stages[stage].requiredWork
      const result = applyResidentialBuildingWork(record, required)
      expect(result.acceptedWork).toBe(required)
      record = result.next
    }
    expect(isResidentialBuildingComplete(record)).toBe(true)
    expect(isPlayerOwnedResidentialBuilding(record)).toBe(true)
    expect(record.homePlaceId).toBe(residentialHomePlaceId(record.id))
    expect(record.owner).toEqual({ kind: 'player' })
    const extra = applyResidentialBuildingWork(record, 4)
    expect(extra.acceptedWork).toBe(0)
    expect(extra.completed).toBe(true)
  })

  it('does not create a household id on completion', () => {
    let record = unfinished()
    for (const stage of ['foundation', 'structure', 'roof'] as const) {
      record = supplyResidentialStageMaterials(record)!
      record = applyResidentialBuildingWork(
        record,
        RESIDENTIAL_BUILDING_DEFINITIONS.small_house.stages[stage].requiredWork,
      ).next
    }
    expect(record.owner).toEqual({ kind: 'player' })
    expect('householdId' in record).toBe(false)
  })
})

describe('oriented house placement (plan settlements-005)', () => {
  const flat = () => 4
  const base = {
    x: 0,
    z: 0,
    yaw: 0,
    width: 6,
    depth: 4,
    sampleHeight: flat,
    waterLevel: 0,
    blockers: [] as { x: number, z: number, radius: number }[],
    peers: [] as { x: number, z: number }[],
    footprintRadius: 3,
    separation: 6,
  }
  /** Wet only at the unrotated +X/−Z corner — a square rotation cannot
   *  dodge this, a 6×4 rectangle can. */
  const cornerPuddle = (x: number, z: number) => (
    x > 2.7 && x < 3.3 && z < -1.7 && z > -2.3 ? -1 : 4
  )

  it('rejects a rotated footprint whose far corner sits in water', () => {
    expect(evaluateOrientedGroundPlacement({
      ...base,
      yaw: 0,
      sampleHeight: cornerPuddle,
    })).toBe('water')
  })

  it('accepts the same pocket after a rotation that keeps the box on dry ground', () => {
    expect(evaluateOrientedGroundPlacement({
      ...base,
      yaw: Math.PI / 2,
      sampleHeight: cornerPuddle,
    })).toBe('ok')
  })
})

describe('residential lodging helpers (plan settlements-005)', () => {
  it('derives a stable home Place id from the building id', () => {
    expect(residentialHomePlaceId('house:7')).toBe('home:residential:house:7')
  })

  it('places the v1 approach point outside the front wall', () => {
    const point = residentialBuildingApproachPoint({
      kind: 'small_house',
      x: 10,
      z: 20,
      yaw: 0,
    })
    expect(point.x).toBeCloseTo(10)
    expect(point.z).toBeLessThan(20)
  })

  it('lists current-stage materials for the supply gate', () => {
    expect(residentialStageRequirements('small_house', 'foundation')).toEqual([{ kind: 'stone', count: 8 }])
  })
})
