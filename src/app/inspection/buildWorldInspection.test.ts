import { describe, expect, it } from 'vitest'
import type { Interactable } from '../../interaction/Interactable'
import type { LiquidContainerItemInstance } from '../../items/itemInstances'
import type { TerrainPreparationRecord } from '../../terrain/terrainPreparation'
import type { PlayerWellRecord } from '../../world/playerWell'
import type { WorkContractRecord } from '../../world/workContract'
import { Inventory } from '../../items/Inventory'
import { PALISADE_REQUIRED_WORK, type PalisadeSegmentRecord } from '../../world/palisade'
import {
  createUnfinishedResidentialBuildingRecord,
  RESIDENTIAL_BUILDING_DEFINITIONS,
  type ResidentialBuildingRecord,
  supplyResidentialStageMaterials,
} from '../../world/residentialBuilding'
import { STANDING_TORCH_REQUIRED_WORK, type StandingTorchRecord } from '../../world/standingTorch'
import { WELL_WATER_DEPTH_MIN } from '../../world/wellGroundwater'
import { buildWorldInspection, type WorldInspectionLookup } from './buildWorldInspection'
import { inspectionTargetRef } from './inspectionTarget'

function well(overrides: Partial<PlayerWellRecord> = {}): PlayerWellRecord {
  return {
    id: 'well:1',
    x: 0,
    z: 0,
    yaw: 0,
    stage: 'pit',
    workProgress: 0,
    waterDepth: WELL_WATER_DEPTH_MIN,
    waterKind: 'groundwater',
    ...overrides,
  }
}

function emptyLookup(overrides: Partial<WorldInspectionLookup> = {}): WorldInspectionLookup {
  return {
    well: () => undefined,
    terrainPreparation: () => undefined,
    palisade: () => undefined,
    standingTorch: () => undefined,
    residentialBuilding: () => undefined,
    contract: () => undefined,
    describeWellWork: () => ({ title: 'Kopanie', description: '', canWork: true, reasonLabel: '' }),
    describeWellRoofRepair: () => null,
    worldSeed: 1,
    nowDays: 0,
    inventory: new Inventory({}, 100, [], {}, Infinity),
    hasRope: true,
    ...overrides,
  }
}

function contract(targetId: string, kind: WorkContractRecord['target']['kind'] = 'construction'): WorkContractRecord {
  return {
    id: 'c:1',
    employer: 'player',
    workType: kind === 'construction' ? 'construction' : kind,
    target: { kind, targetId } as WorkContractRecord['target'],
    x: 0,
    z: 0,
    rewardCoins: 25,
    state: 'available',
    advertisement: 'not_posted',
    postedBoardId: null,
    createdAt: 0,
    postedAt: null,
    requestedWorkerCount: 2,
    assignments: [],
    requestedWorkShare: 0.5,
    remainingWorkAtCreation: 4,
    committedWork: 2,
    npcWorkCompleted: 0.5,
  }
}

describe('inspectionTargetRef (plan ui-input-014)', () => {
  it('returns null for unsupported targets', () => {
    const npc = { kind: 'npc', id: 'nope' } as unknown as Interactable
    expect(inspectionTargetRef(npc)).toBeNull()
    expect(inspectionTargetRef(null)).toBeNull()
  })

  it('returns kind+id for inspectable construction targets', () => {
    expect(inspectionTargetRef({
      kind: 'playerWell',
      position: { x: 0, z: 0 },
      promptLabel: '',
      id: 'well:1',
      stage: 'pit',
      waterSource: null,
      complete: false,
    })).toEqual({ kind: 'playerWell', id: 'well:1' })
  })
})

describe('buildWorldInspection (plan ui-input-014)', () => {
  it('returns null when the live record is gone', () => {
    expect(buildWorldInspection({ kind: 'playerWell', id: 'missing' }, emptyLookup())).toBeNull()
  })

  it('builds unfinished well inspection with stage progress and hire help', () => {
    const record = well({ workProgress: 0.5 })
    const view = buildWorldInspection({ kind: 'playerWell', id: record.id }, emptyLookup({
      well: (id) => id === record.id ? record : undefined,
    }))
    expect(view).not.toBeNull()
    expect(view!.title).toBe('Studnia')
    expect(view!.actions.some((action) => action.id === 'work' && action.enabled)).toBe(true)
    expect(view!.actions.some((action) => action.id === 'hireHelp')).toBe(true)
    const progress = view!.sections.flatMap((section) => section.rows).find((row) => row.kind === 'progress')
    expect(progress).toMatchObject({ kind: 'progress', completed: 0.5 })
  })

  it('shows water actions on a completed well and repair when damaged', () => {
    const record = well({
      stage: 'roof',
      workProgress: 1,
      roofCondition: 40,
      lastRoofConditionUpdateAtDays: 0,
    })
    const view = buildWorldInspection({ kind: 'playerWell', id: record.id }, emptyLookup({
      well: () => record,
      describeWellRoofRepair: () => ({
        title: 'Napraw',
        description: 'Daszek uszkodzony',
        canAct: true,
        reasonLabel: '',
        mode: 'start',
        waterAvailable: true,
      }),
    }))
    expect(view!.actions.some((action) => action.id === 'repair')).toBe(true)
    expect(view!.actions.some((action) => action.id === 'drink')).toBe(true)
    expect(view!.actions.some((action) => action.id === 'hireHelp')).toBe(false)
  })

  it('lists multiple liquid containers including a full one', () => {
    const empty: LiquidContainerItemInstance = { id: 'ws-a', kind: 'waterskin_small', liquid: null, amountLitres: 0 }
    const full: LiquidContainerItemInstance = { id: 'bucket-1', kind: 'wooden_bucket', liquid: 'water', amountLitres: 10 }
    const record = well({ stage: 'well', workProgress: 1 })
    const view = buildWorldInspection({ kind: 'playerWell', id: record.id }, emptyLookup({
      well: () => record,
      inventory: new Inventory({}, 100, [empty, full], {}, Infinity),
    }))
    const liquids = view!.sections.flatMap((section) => section.rows).find((row) => row.kind === 'liquidContainers')
    expect(liquids?.kind).toBe('liquidContainers')
    if (liquids?.kind !== 'liquidContainers') return
    expect(liquids.options).toHaveLength(2)
    expect(liquids.options.find((option) => option.instanceId === 'ws-a')?.canFill).toBe(true)
    expect(liquids.options.find((option) => option.instanceId === 'bucket-1')?.canFill).toBe(false)
  })

  it('shows an active contract summary instead of hire help', () => {
    const record = well({ workProgress: 0.2 })
    const view = buildWorldInspection({ kind: 'playerWell', id: record.id }, emptyLookup({
      well: () => record,
      contract: () => contract(record.id),
    }))
    expect(view!.actions.some((action) => action.id === 'hireHelp')).toBe(false)
    const contractRow = view!.sections.flatMap((section) => section.rows).find((row) => row.kind === 'contract')
    expect(contractRow?.kind).toBe('contract')
    if (contractRow?.kind !== 'contract') return
    expect(contractRow.statusLabel).toBe('Utworzone')
    expect(contractRow.rows.some((row) => row.label === 'Wynagrodzenie' && row.value.includes('25'))).toBe(true)
  })

  it('builds terrain preparation, palisade, torch and residential views', () => {
    const prep: TerrainPreparationRecord = {
      id: 'prep:1',
      center: { x: 1, z: 2 },
      size: 4,
      targetHeight: 0,
      originalHeights: [],
      requiredWork: 4,
      completedWork: 1,
      status: 'active',
    }
    expect(buildWorldInspection({ kind: 'terrainPreparation', id: prep.id }, emptyLookup({
      terrainPreparation: () => prep,
    }))?.actions.some((action) => action.id === 'work')).toBe(true)

    const palisade: PalisadeSegmentRecord = { id: 'pal:1', x: 0, z: 0, yaw: 0, completedWork: 0.5 }
    const palisadeView = buildWorldInspection({ kind: 'palisade', id: palisade.id }, emptyLookup({
      palisade: () => palisade,
    }))
    expect(palisadeView?.actions.some((action) => action.id === 'remove')).toBe(true)
    expect(palisadeView?.sections.flatMap((section) => section.rows).some((row) => (
      row.kind === 'progress' && row.required === PALISADE_REQUIRED_WORK
    ))).toBe(true)

    const torch: StandingTorchRecord = {
      id: 'torch:1', x: 0, z: 0, yaw: 0, lit: false, burnUntilDays: null, completedWork: STANDING_TORCH_REQUIRED_WORK,
    }
    const torchView = buildWorldInspection({ kind: 'standingTorch', id: torch.id }, emptyLookup({
      standingTorch: () => torch,
    }))
    expect(torchView?.actions.some((action) => action.id === 'ignite')).toBe(true)

    const house = supplyResidentialStageMaterials(createUnfinishedResidentialBuildingRecord({
      id: 'house:1',
      kind: 'small_house',
      x: 0,
      z: 0,
      yaw: 0,
    }))!
    const houseView = buildWorldInspection({ kind: 'residentialBuilding', id: house.id }, emptyLookup({
      residentialBuilding: () => house,
    }))
    expect(houseView?.actions.some((action) => action.id === 'work')).toBe(true)
    expect(houseView?.actions.some((action) => action.id === 'cancel')).toBe(true)
    const overall = houseView?.sections.flatMap((section) => section.rows).find((row) => (
      row.kind === 'progress' && row.label === 'Całość budowy'
    ))
    expect(overall?.kind).toBe('progress')
    if (overall?.kind !== 'progress') return
    expect(overall.required).toBe(
      RESIDENTIAL_BUILDING_DEFINITIONS.small_house.stages.foundation.requiredWork
      + RESIDENTIAL_BUILDING_DEFINITIONS.small_house.stages.structure.requiredWork
      + RESIDENTIAL_BUILDING_DEFINITIONS.small_house.stages.roof.requiredWork,
    )
  })

  it('keeps hire help disabled on a material-blocked residential stage', () => {
    const house: ResidentialBuildingRecord = createUnfinishedResidentialBuildingRecord({
      id: 'house:2',
      kind: 'small_house',
      x: 0,
      z: 0,
      yaw: 0,
    })
    const view = buildWorldInspection({ kind: 'residentialBuilding', id: house.id }, emptyLookup({
      residentialBuilding: () => house,
    }))
    const hire = view!.actions.find((action) => action.id === 'hireHelp')
    expect(hire?.enabled).toBe(false)
    expect(view!.actions.some((action) => action.id === 'supplyMaterials')).toBe(true)
  })
})
