import type { MaterialRequirement } from '../../items/constructionMaterials'
import type { DroppedItems } from '../../items/createDroppedItems'
import type { Inventory } from '../../items/Inventory'
import type { PlayerTroughRecord } from '../../world/playerTrough'
import type { BedrollRecord, PlatformRecord } from '../../world/sleepingUtilities'
import type { WaterSource } from '../../world/WaterSource'
import type { ConstructionActionView, RemovalPreview, ResidentialWorkView, WellRoofRepairView, WellWorkView } from '../actions/placementActions'
import type { CampRepairView } from '../actions/restActions'
import type { CampRestSnapshot } from '../campRestSnapshot'
import type { InspectionTargetRef } from './worldInspectionView'
import type {
  InspectionAction,
  InspectionLiquidContainerOption,
  InspectionMaterialItem,
  InspectionRow,
  InspectionSection,
  WorldInspectionView,
} from './worldInspectionView'
import {
  CONSTRUCTION_MATERIAL_RADIUS,
  materialAvailabilityBreakdown,
} from '../../items/constructionMaterials'
import { createTentInstance, isLiquidContainerInstance, LIQUID_CONTAINER_KIND_LIST } from '../../items/itemInstances'
import { ITEM_DEFS } from '../../items/items'
import {
  canFillLiquidContainer,
  liquidContainerCapacity,
} from '../../items/liquidContainer'
import { type TerrainPreparationRecord, terrainPreparationRemainingWork } from '../../terrain/terrainPreparation'
import {
  isPalisadeConstructionComplete,
  PALISADE_MATERIAL_REQUIREMENTS,
  PALISADE_REQUIRED_WORK,
  palisadeRemainingWork,
  type PalisadeSegmentRecord,
} from '../../world/palisade'
import { isPlayerTroughConstructionComplete } from '../../world/playerTrough'
import {
  activeWellStage,
  formatHours,
  isWellCompleted,
  isWellWaterAvailable,
  type PlayerWellRecord,
  resolveWellRoofCondition,
  WELL_STAGE_COST,
  wellRemainingWork,
  type WellStage,
  wellStageRequirements,
  wellStageWorkHours,
  wellWaterSource,
} from '../../world/playerWell'
import {
  isPlayerOwnedResidentialBuilding,
  isResidentialBuildingComplete,
  isResidentialBuildingMaterialBlocked,
  isResidentialConstructionStage,
  RESIDENTIAL_CONSTRUCTION_STAGES,
  residentialBuildingCompletedWork,
  residentialBuildingDefinition,
  type ResidentialBuildingRecord,
  residentialBuildingRemainingWork,
  residentialBuildingTotalRemainingWork,
  residentialBuildingTotalRequiredWork,
  residentialConstructionStageLabel,
  residentialStageRequiredWork,
  residentialStageRequirements,
} from '../../world/residentialBuilding'
import {
  isStandingTorchConstructionComplete,
  STANDING_TORCH_MATERIAL_REQUIREMENTS,
  STANDING_TORCH_REQUIRED_WORK,
  type StandingTorchRecord,
  standingTorchRemainingWork,
} from '../../world/standingTorch'
import {
  type ContractTarget,
  isAssignmentWorkActive,
  type WorkContractRecord,
  type WorkContractState,
} from '../../world/workContract'
import { campInspectionRepairTargets, formatCampInspectionDetails } from '../campRestSnapshot'

const WELL_STAGE_ORDER: readonly WellStage[] = ['pit', 'well', 'roof']

const WELL_STAGE_LABEL: Record<WellStage, string> = {
  pit: 'Dół',
  well: 'Korpus studni',
  roof: 'Daszek',
}

export type WorldInspectionLookup = {
  well: (id: string) => PlayerWellRecord | undefined
  terrainPreparation: (id: string) => TerrainPreparationRecord | undefined
  palisade: (id: string) => PalisadeSegmentRecord | undefined
  standingTorch: (id: string) => StandingTorchRecord | undefined
  residentialBuilding: (id: string) => ResidentialBuildingRecord | undefined
  trough: (id: string) => PlayerTroughRecord | undefined
  bedroll: (id: string) => BedrollRecord | undefined
  platform: (id: string) => PlatformRecord | undefined
  tent: (id: string) => { id: string, x: number, z: number, condition: number, repair?: unknown } | undefined
  contract: (target: ContractTarget) => WorkContractRecord | undefined
  describeWellWork: (id: string) => WellWorkView | null
  describeWellRoofRepair: (id: string) => WellRoofRepairView | null
  describePalisadeWork?: (id: string) => ConstructionActionView | null
  describeStandingTorchWork?: (id: string) => ConstructionActionView | null
  describePlayerTroughWork?: (id: string) => ConstructionActionView | null
  describePlayerTroughFill?: (id: string) => ConstructionActionView | null
  describeResidentialWork?: (id: string) => ResidentialWorkView | null
  describeCampRepair?: (kind: 'tent' | 'bedroll' | 'platform', id: string) => CampRepairView | null
  previewPalisadeRemoval?: (id: string) => RemovalPreview | null
  previewResidentialCancel?: (id: string) => RemovalPreview | null
  previewWellCancel?: (id: string) => RemovalPreview | null
  previewStandingTorchRemoval?: (id: string) => RemovalPreview | null
  previewPlayerTroughRemoval?: (id: string) => RemovalPreview | null
  previewBedrollRemoval?: (id: string) => RemovalPreview | null
  previewPlatformRemoval?: (id: string) => RemovalPreview | null
  campSnapshot?: (tentId: string) => CampRestSnapshot | null
  droppedItems?: DroppedItems
  worldSeed: number
  nowDays: number
  inventory: Inventory
  hasRope: boolean
}

/** Builds a presentation snapshot for `ref` from live lookup, or `null` when
 *  the world record is gone. Vue must not compute these values itself. */
export function buildWorldInspection(
  ref: InspectionTargetRef,
  lookup: WorldInspectionLookup,
): WorldInspectionView | null {
  switch (ref.kind) {
    case 'bedroll':
      return buildBedrollInspection(ref.id, lookup)
    case 'camp':
      return buildCampInspection(ref.id, lookup)
    case 'palisade':
      return buildPalisadeInspection(ref.id, lookup)
    case 'platform':
      return buildPlatformInspection(ref.id, lookup)
    case 'playerTrough':
      return buildTroughInspection(ref.id, lookup)
    case 'playerWell':
      return buildWellInspection(ref.id, lookup)
    case 'residentialBuilding':
      return buildResidentialInspection(ref.id, lookup)
    case 'standingTorch':
      return buildStandingTorchInspection(ref.id, lookup)
    case 'terrainPreparation':
      return buildTerrainPreparationInspection(ref.id, lookup)
  }
}

function buildWellInspection(id: string, lookup: WorldInspectionLookup): WorldInspectionView | null {
  const well = lookup.well(id)
  if (!well) return null
  const completed = isWellCompleted(well)
  const roofCondition = resolveWellRoofCondition(well, lookup.worldSeed, lookup.nowDays)
  const waterAvailable = isWellWaterAvailable(well)
  const source = waterAvailable ? wellWaterSource(well, roofCondition) : null
  const workView = completed ? null : lookup.describeWellWork(id)
  const repairView = completed ? lookup.describeWellRoofRepair(id) : null
  const contract = lookup.contract({ kind: 'construction', targetId: id })
  const remaining = wellRemainingWork(well)
  const activeStage = activeWellStage(well)
  const stageIndex = activeStage ? WELL_STAGE_ORDER.indexOf(activeStage) + 1 : WELL_STAGE_ORDER.length
  const currentRequired = activeStage ? wellStageWorkHours(activeStage, well.waterDepth) : 0
  const currentCompleted = activeStage && activeStage === well.stage ? well.workProgress : 0
  const overallRequired = WELL_STAGE_ORDER.reduce((sum, stage) => sum + wellStageWorkHours(stage, well.waterDepth), 0)
  const overallCompleted = overallRequired - remaining

  const sections: InspectionSection[] = []
  const statusRows: InspectionRow[] = [
    { kind: 'info', label: 'Status', value: wellStatusLabel(well, repairView) },
  ]
  if (!completed && activeStage) {
    statusRows.push({
      kind: 'info',
      label: 'Etap',
      value: `${WELL_STAGE_LABEL[activeStage]} (${stageIndex}/${WELL_STAGE_ORDER.length})`,
    })
    statusRows.push({
      kind: 'progress',
      label: 'Postęp etapu',
      completed: currentCompleted,
      required: currentRequired,
      valueLabel: `${formatHours(currentCompleted)} / ${formatHours(currentRequired)} h`,
    })
    statusRows.push({
      kind: 'info',
      label: 'Pozostała praca',
      value: `${formatHours(remaining)} h`,
    })
    statusRows.push({
      kind: 'progress',
      label: 'Całość budowy',
      completed: overallCompleted,
      required: overallRequired,
      valueLabel: `${formatHours(overallCompleted)} / ${formatHours(overallRequired)} h`,
    })
    const materials = wellMaterialsRow(well, activeStage, lookup)
    if (materials) statusRows.push(materials)
  } else {
    statusRows.push({
      kind: 'info',
      label: 'Woda',
      value: waterAvailable ? 'dostępna' : (repairView ? 'niedostępna (naprawa)' : 'niedostępna'),
    })
    if (roofCondition !== null) {
      statusRows.push({
        kind: 'info',
        label: 'Stan daszku',
        value: `${Math.round(roofCondition)} / 100`,
      })
    }
    if (repairView) {
      const repair = well.roofRepair
      if (repair) {
        statusRows.push({
          kind: 'progress',
          label: 'Naprawa daszku',
          completed: repair.completedWork,
          required: repair.requiredWork,
          valueLabel: `${formatHours(repair.completedWork)} / ${formatHours(repair.requiredWork)} h`,
        })
      }
    }
  }
  sections.push({ title: 'Studnia', rows: statusRows })

  if (source) {
    const sourceReason = sourceGateReason(source, lookup.hasRope)
    sections.push({
      title: 'Pojemniki na wodę',
      rows: [{
        kind: 'liquidContainers',
        emptyLabel: 'Nie nosisz pojemnika na wodę.',
        options: listWaterContainerOptions(lookup.inventory, sourceReason === '', sourceReason),
      }],
    })
  }

  const contractSection = buildContractSection(contract)
  if (contractSection) sections.push(contractSection)

  const actions: InspectionAction[] = []
  if (!completed) {
    actions.push({
      id: 'work',
      label: 'Buduj dalej',
      enabled: workView?.canWork ?? false,
      reasonLabel: workView?.reasonLabel ?? '',
      variant: 'primary',
    })
  } else if (repairView) {
    actions.push({
      id: 'repair',
      label: repairView.mode === 'continue' ? 'Kontynuuj naprawę' : 'Napraw',
      enabled: repairView.canAct,
      reasonLabel: repairView.reasonLabel,
      variant: 'primary',
    })
  }
  if (source) {
    const drinkReason = sourceGateReason(source, lookup.hasRope)
    actions.push({
      id: 'drink',
      label: 'Napij się',
      enabled: drinkReason === '',
      reasonLabel: drinkReason,
    })
  }
  if (!completed && !contract) {
    const canHire = remaining > 0
    actions.push({
      id: 'hireHelp',
      label: 'Zleć pomoc',
      enabled: canHire,
      reasonLabel: canHire ? '' : 'Brak pracy do zlecenia.',
    })
  }
  if (!completed) {
    const cancel = lookup.previewWellCancel?.(id)
    actions.push({
      id: 'cancel',
      label: 'Anuluj budowę',
      enabled: cancel?.canReceive ?? true,
      reasonLabel: cancel?.reasonLabel ?? '',
      variant: 'danger',
    })
  }

  return {
    targetId: id,
    title: 'Studnia',
    description: completed
      ? (repairView ? repairView.description : 'Gotowa studnia.')
      : (workView?.description || 'Budowa studni.'),
    sections,
    actions,
  }
}

function wellStatusLabel(well: PlayerWellRecord, repairView: WellRoofRepairView | null): string {
  if (isWellCompleted(well)) {
    if (repairView?.mode === 'continue') return 'Naprawa daszku'
    if (repairView) return 'Daszek uszkodzony'
    return 'Ukończona'
  }
  return 'W budowie'
}

function wellMaterialsRow(well: PlayerWellRecord, activeStage: WellStage, lookup: WorldInspectionLookup): InspectionRow | null {
  const requirements = wellStageRequirements(activeStage)
  if (requirements.length === 0 && WELL_STAGE_COST[activeStage].stone === 0 && WELL_STAGE_COST[activeStage].branch === 0) {
    return null
  }
  const supplied = activeStage === well.stage
  return {
    kind: 'materials',
    statusLabel: supplied ? 'Materiały dostarczone' : 'Materiały wymagane',
    items: materialItems(requirements, lookup, well.x, well.z, !supplied),
  }
}

function buildTerrainPreparationInspection(id: string, lookup: WorldInspectionLookup): WorldInspectionView | null {
  const record = lookup.terrainPreparation(id)
  if (!record) return null
  const remaining = terrainPreparationRemainingWork(record)
  const contract = lookup.contract({ kind: 'terrain_preparation', targetId: id })
  const sections: InspectionSection[] = [{
    title: 'Przygotowanie terenu',
    rows: [
      { kind: 'info', label: 'Status', value: 'W toku' },
      { kind: 'info', label: 'Rozmiar', value: `${record.size} × ${record.size} m` },
      {
        kind: 'progress',
        label: 'Postęp pracy',
        completed: record.completedWork,
        required: record.requiredWork,
        valueLabel: `${formatHours(record.completedWork)} / ${formatHours(record.requiredWork)} h`,
      },
      { kind: 'info', label: 'Pozostała praca', value: `${formatHours(remaining)} h` },
    ],
  }]
  const contractSection = buildContractSection(contract)
  if (contractSection) sections.push(contractSection)
  const actions: InspectionAction[] = [{
    id: 'work',
    label: 'Kontynuuj pracę',
    enabled: remaining > 0,
    reasonLabel: '',
    variant: 'primary',
  }]
  if (!contract) {
    actions.push({
      id: 'hireHelp',
      label: 'Zleć pomoc',
      enabled: remaining > 0,
      reasonLabel: remaining > 0 ? '' : 'Brak pracy do zlecenia.',
    })
  }
  return {
    targetId: id,
    title: 'Przygotowanie terenu',
    description: 'Wyrównanie terenu do wybranej wysokości.',
    sections,
    actions,
  }
}

function buildPalisadeInspection(id: string, lookup: WorldInspectionLookup): WorldInspectionView | null {
  const record = lookup.palisade(id)
  if (!record) return null
  const complete = isPalisadeConstructionComplete(record)
  const remaining = palisadeRemainingWork(record)
  const contract = lookup.contract({ kind: 'palisade', targetId: id })
  const rows: InspectionRow[] = [
    { kind: 'info', label: 'Status', value: complete ? 'Ukończony' : 'W budowie' },
  ]
  if (!complete) {
    rows.push({
      kind: 'progress',
      label: 'Postęp pracy',
      completed: record.completedWork,
      required: PALISADE_REQUIRED_WORK,
      valueLabel: `${formatHours(record.completedWork)} / ${formatHours(PALISADE_REQUIRED_WORK)} h`,
    })
    rows.push({ kind: 'info', label: 'Pozostała praca', value: `${formatHours(remaining)} h` })
  }
  rows.push({
    kind: 'materials',
    statusLabel: 'Materiały dostarczone',
    items: materialItems(PALISADE_MATERIAL_REQUIREMENTS, lookup, record.x, record.z, false),
  })
  const sections: InspectionSection[] = [{ title: 'Segment palisady', rows }]
  const contractSection = buildContractSection(contract)
  if (contractSection) sections.push(contractSection)
  const actions: InspectionAction[] = []
  if (!complete) {
    const work = lookup.describePalisadeWork?.(id)
    actions.push({
      id: 'work',
      label: 'Buduj dalej',
      enabled: work?.canWork ?? true,
      reasonLabel: work?.reasonLabel ?? '',
      variant: 'primary',
    })
    if (!contract) {
      actions.push({
        id: 'hireHelp',
        label: 'Zleć pomoc',
        enabled: remaining > 0,
        reasonLabel: remaining > 0 ? '' : 'Brak pracy do zlecenia.',
      })
    }
  }
  actions.push({
    id: 'remove',
    label: 'Usuń',
    enabled: lookup.previewPalisadeRemoval?.(id)?.canReceive ?? true,
    reasonLabel: lookup.previewPalisadeRemoval?.(id)?.reasonLabel ?? '',
    variant: 'danger',
  })
  return {
    targetId: id,
    title: 'Segment palisady',
    description: complete ? 'Gotowy fragment ogrodzenia.' : 'Niedokończony segment palisady.',
    sections,
    actions,
  }
}

function buildStandingTorchInspection(id: string, lookup: WorldInspectionLookup): WorldInspectionView | null {
  const record = lookup.standingTorch(id)
  if (!record) return null
  const complete = isStandingTorchConstructionComplete(record)
  const remaining = standingTorchRemainingWork(record)
  const contract = lookup.contract({ kind: 'standing_torch', targetId: id })
  const rows: InspectionRow[] = [
    { kind: 'info', label: 'Status', value: complete ? (record.lit ? 'Zapalona' : 'Ukończona') : 'W budowie' },
  ]
  if (!complete) {
    rows.push({
      kind: 'progress',
      label: 'Postęp pracy',
      completed: record.completedWork,
      required: STANDING_TORCH_REQUIRED_WORK,
      valueLabel: `${formatHours(record.completedWork)} / ${formatHours(STANDING_TORCH_REQUIRED_WORK)} h`,
    })
    rows.push({ kind: 'info', label: 'Pozostała praca', value: `${formatHours(remaining)} h` })
  } else {
    rows.push({ kind: 'info', label: 'Ogień', value: record.lit ? 'pali się' : 'zgaszona' })
  }
  rows.push({
    kind: 'materials',
    statusLabel: 'Materiały dostarczone',
    items: materialItems(STANDING_TORCH_MATERIAL_REQUIREMENTS, lookup, record.x, record.z, false),
  })
  const sections: InspectionSection[] = [{ title: 'Pochodnia', rows }]
  const contractSection = buildContractSection(contract)
  if (contractSection) sections.push(contractSection)
  const actions: InspectionAction[] = []
  if (!complete) {
    const work = lookup.describeStandingTorchWork?.(id)
    actions.push({
      id: 'work',
      label: 'Buduj dalej',
      enabled: work?.canWork ?? true,
      reasonLabel: work?.reasonLabel ?? '',
      variant: 'primary',
    })
    if (!contract) {
      actions.push({
        id: 'hireHelp',
        label: 'Zleć pomoc',
        enabled: remaining > 0,
        reasonLabel: remaining > 0 ? '' : 'Brak pracy do zlecenia.',
      })
    }
  } else if (!record.lit) {
    actions.push({
      id: 'ignite',
      label: 'Zapal',
      enabled: true,
      reasonLabel: '',
      variant: 'primary',
    })
  }
  const removal = lookup.previewStandingTorchRemoval?.(id)
  actions.push({
    id: 'remove',
    label: 'Usuń',
    enabled: removal?.canReceive ?? true,
    reasonLabel: removal?.reasonLabel ?? '',
    variant: 'danger',
  })
  return {
    targetId: id,
    title: 'Pochodnia',
    description: complete
      ? (record.lit ? 'Stojąca pochodnia pali się.' : 'Stojąca pochodnia gotowa do zapalenia.')
      : 'Niedokończona pochodnia.',
    sections,
    actions,
  }
}

function buildResidentialInspection(id: string, lookup: WorldInspectionLookup): WorldInspectionView | null {
  const record = lookup.residentialBuilding(id)
  if (!record) return null
  const complete = isResidentialBuildingComplete(record)
  const def = residentialBuildingDefinition(record.kind)
  const contract = lookup.contract({ kind: 'residential_building', targetId: id })
  const usefulRemaining = residentialBuildingRemainingWork(record)
  const totalRemaining = residentialBuildingTotalRemainingWork(record)
  const overallRequired = residentialBuildingTotalRequiredWork(record.kind)
  const overallCompleted = residentialBuildingCompletedWork(record)
  const rows: InspectionRow[] = [
    { kind: 'info', label: 'Status', value: complete ? 'Ukończona' : 'W budowie' },
  ]
  if (!complete && isResidentialConstructionStage(record.stage)) {
    const stageIndex = RESIDENTIAL_CONSTRUCTION_STAGES.indexOf(record.stage) + 1
    rows.push({
      kind: 'info',
      label: 'Etap',
      value: `${residentialConstructionStageLabel(record.stage)} (${stageIndex}/${RESIDENTIAL_CONSTRUCTION_STAGES.length})`,
    })
    rows.push({
      kind: 'progress',
      label: 'Postęp etapu',
      completed: record.stageWorkProgress,
      required: residentialStageRequiredWork(record.kind, record.stage),
      valueLabel: `${formatHours(record.stageWorkProgress)} / ${formatHours(residentialStageRequiredWork(record.kind, record.stage))} h`,
    })
    rows.push({
      kind: 'info',
      label: 'Pozostała praca (łącznie)',
      value: `${formatHours(totalRemaining)} h`,
    })
    rows.push({
      kind: 'progress',
      label: 'Całość budowy',
      completed: overallCompleted,
      required: overallRequired,
      valueLabel: `${formatHours(overallCompleted)} / ${formatHours(overallRequired)} h`,
    })
    rows.push({
      kind: 'materials',
      statusLabel: record.materialsSupplied ? 'Materiały dostarczone' : 'Materiały wymagane',
      items: materialItems(residentialStageRequirements(record.kind, record.stage), lookup, record.x, record.z, !record.materialsSupplied),
    })
  } else if (complete) {
    rows.push({
      kind: 'info',
      label: 'Właściciel',
      value: isPlayerOwnedResidentialBuilding(record) ? 'gracz' : 'nie twoja',
    })
  }
  const sections: InspectionSection[] = [{ title: def.label, rows }]
  const contractSection = buildContractSection(contract)
  if (contractSection) sections.push(contractSection)
  const actions: InspectionAction[] = []
  if (!complete) {
    const workView = lookup.describeResidentialWork?.(id)
    if (isResidentialBuildingMaterialBlocked(record)) {
      actions.push({
        id: 'supplyMaterials',
        label: 'Dostarcz materiały',
        enabled: workView?.canSupply ?? true,
        reasonLabel: workView?.supplyReasonLabel ?? '',
        variant: 'primary',
      })
    } else {
      actions.push({
        id: 'work',
        label: 'Buduj dalej',
        enabled: workView?.canWork ?? usefulRemaining > 0,
        reasonLabel: workView?.workReasonLabel ?? '',
        variant: 'primary',
      })
    }
    if (!contract) {
      actions.push({
        id: 'hireHelp',
        label: 'Zleć pomoc',
        enabled: usefulRemaining > 0,
        reasonLabel: usefulRemaining > 0 ? '' : 'Najpierw dostarcz materiały bieżącego etapu.',
      })
    }
    actions.push({
      id: 'cancel',
      label: 'Anuluj budowę',
      enabled: lookup.previewResidentialCancel?.(id)?.canReceive ?? true,
      reasonLabel: lookup.previewResidentialCancel?.(id)?.reasonLabel ?? '',
      variant: 'danger',
    })
  } else if (isPlayerOwnedResidentialBuilding(record)) {
    actions.push({
      id: 'sleep',
      label: 'Nocuj',
      enabled: true,
      reasonLabel: '',
      variant: 'primary',
    })
  }
  return {
    targetId: id,
    title: def.label,
    description: complete ? 'Gotowa chata.' : 'Budowa chaty.',
    sections,
    actions,
  }
}

function buildContractSection(record: WorkContractRecord | undefined): InspectionSection | null {
  if (!record) return null
  const activeWorkers = record.assignments.filter(isAssignmentWorkActive).length
  return {
    title: 'Zlecenie pracy',
    rows: [{
      kind: 'contract',
      statusLabel: contractStateLabel(record.state),
      rows: [
        { label: 'Ogłoszenie', value: record.advertisement === 'posted' ? 'ogłoszone' : 'nieogłoszone' },
        { label: 'Najemnicy', value: `${activeWorkers} / ${record.requestedWorkerCount}` },
        { label: 'Udział pracy', value: `${Math.round(record.requestedWorkShare * 100)}%` },
        { label: 'Wynagrodzenie', value: `${record.rewardCoins} monet` },
        { label: 'Zadeklarowana praca', value: `${formatHours(record.committedWork)} h` },
        { label: 'Wykonane przez NPC', value: `${formatHours(record.npcWorkCompleted)} h` },
      ],
    }],
  }
}

function contractStateLabel(state: WorkContractState): string {
  switch (state) {
    case 'active': return 'W toku'
    case 'advertised': return 'Ogłoszone'
    case 'available': return 'Utworzone'
    case 'cancelled': return 'Anulowane'
    case 'completed': return 'Zakończone'
    case 'invalidated': return 'Unieważnione'
    case 'settling': return 'Rozliczanie'
  }
}

function materialItems(
  requirements: readonly MaterialRequirement[],
  lookup?: WorldInspectionLookup,
  x = 0,
  z = 0,
  withAvailability = false,
): readonly InspectionMaterialItem[] {
  return requirements.map((requirement) => {
    if (!withAvailability || !lookup?.droppedItems) {
      return {
        label: ITEM_DEFS[requirement.kind].label,
        count: requirement.count,
      }
    }
    const breakdown = materialAvailabilityBreakdown(
      lookup.inventory,
      lookup.droppedItems,
      x,
      z,
      CONSTRUCTION_MATERIAL_RADIUS,
      requirement,
    )
    return {
      label: ITEM_DEFS[requirement.kind].label,
      count: requirement.count,
      available: breakdown.available,
      inInventory: breakdown.inInventory,
      nearbyWorld: breakdown.nearbyWorld,
    }
  })
}

function dangerAction(
  id: InspectionAction['id'],
  label: string,
  preview: RemovalPreview | null | undefined,
): InspectionAction {
  return {
    id,
    label,
    enabled: preview?.canReceive ?? true,
    reasonLabel: preview?.reasonLabel ?? '',
    variant: 'danger',
  }
}

function buildCampInspection(id: string, lookup: WorldInspectionLookup): WorldInspectionView | null {
  const snapshot = lookup.campSnapshot?.(id)
  const tent = lookup.tent(id)
  if (!snapshot || !tent) return null
  const details = formatCampInspectionDetails(snapshot)
  const rows: InspectionRow[] = details.map((detail) => ({
    kind: 'info',
    label: detail.label,
    value: [detail.value, detail.secondaryValue].filter(Boolean).join(' · '),
  }))
  const actions: InspectionAction[] = []
  for (const target of campInspectionRepairTargets(snapshot)) {
    const repair = lookup.describeCampRepair?.(target.kind, target.id)
    if (!repair) continue
    const actionId = target.kind === 'tent'
      ? 'repairTent'
      : target.kind === 'bedroll'
        ? 'repairBedroll'
        : 'repairPlatform'
    actions.push({
      id: actionId,
      label: repair.mode === 'continue' ? `Kontynuuj: ${repair.title}` : repair.title,
      enabled: repair.canAct,
      reasonLabel: repair.reasonLabel,
      variant: 'primary',
    })
  }
  const instance = createTentInstance(
    lookup.tent(id)?.condition ?? tent.condition,
    tent.id,
  )
  const repairing = tent.repair != null
  const canPack = !repairing && lookup.inventory.canAddInstance(instance)
  actions.push({
    id: 'pack',
    label: 'Złóż namiot',
    enabled: canPack,
    reasonLabel: repairing
      ? 'Nie możesz złożyć namiotu w trakcie naprawy.'
      : canPack ? '' : 'Brak miejsca w ekwipunku na namiot.',
  })
  return {
    targetId: id,
    title: snapshot.bedroll || snapshot.platform ? 'Twój obóz' : 'To twój namiot',
    sections: [{ title: 'Obóz', rows }],
    actions,
  }
}

function buildBedrollInspection(id: string, lookup: WorldInspectionLookup): WorldInspectionView | null {
  const record = lookup.bedroll(id)
  if (!record) return null
  const repair = lookup.describeCampRepair?.('bedroll', id)
  const rows: InspectionRow[] = [
    { kind: 'info', label: 'Stan', value: `${Math.round(record.condition)} / 100` },
  ]
  const actions: InspectionAction[] = []
  if (repair) {
    actions.push({
      id: 'repairBedroll',
      label: repair.mode === 'continue' ? 'Kontynuuj naprawę' : 'Napraw',
      enabled: repair.canAct,
      reasonLabel: repair.reasonLabel,
      variant: 'primary',
    })
  }
  actions.push(dangerAction('remove', 'Usuń', lookup.previewBedrollRemoval?.(id)))
  return {
    targetId: id,
    title: 'Posłanie',
    sections: [{ title: 'Posłanie', rows }],
    actions,
  }
}

function buildPlatformInspection(id: string, lookup: WorldInspectionLookup): WorldInspectionView | null {
  const record = lookup.platform(id)
  if (!record) return null
  const repair = lookup.describeCampRepair?.('platform', id)
  const rows: InspectionRow[] = [
    { kind: 'info', label: 'Stan', value: `${Math.round(record.condition)} / 100` },
  ]
  const actions: InspectionAction[] = []
  if (repair) {
    actions.push({
      id: 'repairPlatform',
      label: repair.mode === 'continue' ? 'Kontynuuj naprawę' : 'Napraw',
      enabled: repair.canAct,
      reasonLabel: repair.reasonLabel,
      variant: 'primary',
    })
  }
  actions.push(dangerAction('remove', 'Usuń', lookup.previewPlatformRemoval?.(id)))
  return {
    targetId: id,
    title: 'Podest do spania',
    sections: [{ title: 'Podest', rows }],
    actions,
  }
}

function buildTroughInspection(id: string, lookup: WorldInspectionLookup): WorldInspectionView | null {
  const record = lookup.trough(id)
  if (!record) return null
  const complete = isPlayerTroughConstructionComplete(record)
  const work = lookup.describePlayerTroughWork?.(id)
  const fill = lookup.describePlayerTroughFill?.(id)
  const rows: InspectionRow[] = [
    { kind: 'info', label: 'Status', value: complete ? 'Ukończone' : 'W budowie' },
    { kind: 'info', label: 'Woda', value: `${record.waterLitres} l` },
  ]
  const actions: InspectionAction[] = []
  if (!complete) {
    actions.push({
      id: 'work',
      label: 'Buduj dalej',
      enabled: work?.canWork ?? true,
      reasonLabel: work?.reasonLabel ?? '',
      variant: 'primary',
    })
  } else {
    actions.push({
      id: 'fill',
      label: 'Napełnij',
      enabled: fill?.canWork ?? true,
      reasonLabel: fill?.reasonLabel ?? '',
      variant: 'primary',
    })
  }
  actions.push(dangerAction('remove', 'Usuń', lookup.previewPlayerTroughRemoval?.(id)))
  return {
    targetId: id,
    title: 'Koryto',
    sections: [{ title: 'Koryto', rows }],
    actions,
  }
}

export function listWaterContainerOptions(
  inventory: Inventory,
  sourceUsable: boolean,
  sourceReason: string,
): InspectionLiquidContainerOption[] {
  const options: InspectionLiquidContainerOption[] = []
  for (const kind of LIQUID_CONTAINER_KIND_LIST) {
    for (const instance of inventory.getInstances(kind)) {
      if (!isLiquidContainerInstance(instance)) continue
      const capacity = liquidContainerCapacity(instance.kind)
      const acceptsWater = canFillLiquidContainer(instance, 'water')
      let reasonLabel = ''
      if (!sourceUsable) reasonLabel = sourceReason
      else if (!acceptsWater) {
        if (instance.liquid && instance.liquid !== 'water') reasonLabel = 'Inna zawartość'
        else if (instance.amountLitres >= capacity) reasonLabel = 'Pełny'
        else reasonLabel = 'Nie można napełnić'
      }
      options.push({
        instanceId: instance.id,
        label: ITEM_DEFS[instance.kind].label,
        detail: `${formatLitres(instance.amountLitres)} / ${formatLitres(capacity)} l · ${liquidContentLabel(instance.liquid)}`,
        canFill: sourceUsable && acceptsWater,
        reasonLabel,
      })
    }
  }
  return options
}

function liquidContentLabel(content: 'water' | 'milk' | null): string {
  if (content === 'water') return 'woda'
  if (content === 'milk') return 'mleko'
  return 'pusty'
}

function formatLitres(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function sourceGateReason(source: WaterSource, hasRope: boolean): string {
  if (source.quality === 'undrinkable') return 'Ta woda nie nadaje się do picia.'
  if (source.requiresRope && !hasRope) return 'Potrzebujesz liny.'
  return ''
}

export function liveWellWaterSource(
  well: PlayerWellRecord,
  worldSeed: number,
  nowDays: number,
): WaterSource | null {
  if (!isWellWaterAvailable(well)) return null
  const roofCondition = resolveWellRoofCondition(well, worldSeed, nowDays)
  return wellWaterSource(well, roofCondition)
}
