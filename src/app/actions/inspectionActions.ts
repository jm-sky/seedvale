import type { Interactable } from '../../interaction/Interactable'
import type { CampRepairTargetKind } from '../../items/campRepair'
import type { VueUi } from '../../ui-vue/mount'
import type { WaterSource } from '../../world/WaterSource'
import type { ContractTarget } from '../../world/workContract'
import type { CampRestSnapshot } from '../campRestSnapshot'
import type { InspectionActionId } from '../inspection/worldInspectionView'
import type { PlayerActionContext } from './actionContext'
import type { ActionResult } from './actionContracts'
import type {
  ConstructionActionView,
  RemovalPreview,
  ResidentialWorkView,
  WellRoofRepairView,
  WellWorkView,
} from './placementActions'
import type { CampRepairView } from './restActions'
import {
  buildWorldInspection,
  liveWellWaterSource,
  type WorldInspectionLookup,
} from '../inspection/buildWorldInspection'
import {
  contractTargetFor,
  inspectionTargetRef,
  type InspectionTargetRef,
} from '../inspection/inspectionTarget'

export type InspectionActionDeps = {
  vueUi: VueUi
  workOnWell: (id: string) => void
  workOnWellRoofRepair: (id: string) => void
  describeWellWork: (id: string) => WellWorkView | null
  describeWellRoofRepair: (id: string) => WellRoofRepairView | null
  workOnPalisade: (id: string) => void
  previewPalisadeRemoval: (id: string) => RemovalPreview | null
  removePalisadeSegment: (id: string) => void
  workOnStandingTorch: (id: string) => void
  igniteStandingTorch: (id: string) => void
  previewStandingTorchRemoval: (id: string) => RemovalPreview | null
  removeStandingTorch: (id: string) => void
  supplyResidentialBuildingMaterials: (id: string) => void
  workOnResidentialBuilding: (id: string) => void
  describeResidentialWork: (id: string) => ResidentialWorkView | null
  previewResidentialCancel: (id: string) => RemovalPreview | null
  cancelResidentialBuilding: (id: string) => void
  previewWellCancel: (id: string) => RemovalPreview | null
  cancelPlayerWell: (id: string) => void
  describePalisadeWork: (id: string) => ConstructionActionView | null
  describeStandingTorchWork: (id: string) => ConstructionActionView | null
  describePlayerTroughWork: (id: string) => ConstructionActionView | null
  describePlayerTroughFill: (id: string) => ConstructionActionView | null
  workOnPlayerTrough: (id: string) => void
  fillPlayerTrough: (id: string) => void
  previewPlayerTroughRemoval: (id: string) => RemovalPreview | null
  removePlayerTrough: (id: string) => void
  previewBedrollRemoval: (id: string) => RemovalPreview | null
  removeBedroll: (id: string) => void
  previewPlatformRemoval: (id: string) => RemovalPreview | null
  removePlatform: (id: string) => void
  sleepInOwnedHouse: (id: string) => void
  resumeTerrainPreparationWork: (id: string) => void
  beginHireHelpForTarget: (target: ContractTarget) => void
  drinkFromWaterSource: (source: WaterSource) => void
  fillWaterContainer: (source: WaterSource, instanceId: string) => ActionResult
  describeCampRepair: (kind: CampRepairTargetKind, id: string) => CampRepairView | null
  campInspectionSnapshot: (tentId: string) => CampRestSnapshot | null
  workOnCampRepair: (kind: CampRepairTargetKind, id: string) => void
  packTent: (id: string) => void
}

const BUSY_ACTION_IDS: ReadonlySet<InspectionActionId> = new Set([
  'fill',
  'repair',
  'repairBedroll',
  'repairPlatform',
  'repairTent',
  'work',
])

export type InspectionActions = {
  openFromTarget: (target: Interactable) => void
  syncOpenView: () => void
  close: () => void
  isOpen: () => boolean
}

/**
 * Application owner of world inspection (plan `ui-input-014` / ui-input-016).
 * Vue only renders the snapshot and routes action ids back here. Lookups
 * always use `ctx.bundle` at call time so a WorldBundle rebuild cannot leave
 * stale collections captured in callbacks.
 */
export function createInspectionActions(
  ctx: PlayerActionContext,
  deps: InspectionActionDeps,
): InspectionActions {
  const { vueUi } = deps
  let current: InspectionTargetRef | null = null

  const lookup = (): WorldInspectionLookup => ({
    well: (id) => ctx.bundle.playerWells.nodes().find((entry) => entry.id === id),
    terrainPreparation: (id) => ctx.bundle.terrainPreparations.find(id),
    palisade: (id) => ctx.bundle.palisades.nodes().find((entry) => entry.id === id),
    standingTorch: (id) => ctx.bundle.standingTorches.nodes().find((entry) => entry.id === id),
    residentialBuilding: (id) => ctx.bundle.residentialBuildings.find(id),
    trough: (id) => ctx.bundle.playerTroughs.nodes().find((entry) => entry.id === id),
    bedroll: (id) => ctx.bundle.sleepingUtilities.bedrolls.get(id) ?? undefined,
    platform: (id) => ctx.bundle.sleepingUtilities.platforms.get(id) ?? undefined,
    tent: (id) => ctx.bundle.placedTents.get(id) ?? undefined,
    contract: (target) => ctx.bundle.workContracts.findByTarget(target),
    describeWellWork: deps.describeWellWork,
    describeWellRoofRepair: deps.describeWellRoofRepair,
    describePalisadeWork: deps.describePalisadeWork,
    describeStandingTorchWork: deps.describeStandingTorchWork,
    describePlayerTroughWork: deps.describePlayerTroughWork,
    describePlayerTroughFill: deps.describePlayerTroughFill,
    describeResidentialWork: deps.describeResidentialWork,
    describeCampRepair: deps.describeCampRepair,
    previewPalisadeRemoval: deps.previewPalisadeRemoval,
    previewResidentialCancel: deps.previewResidentialCancel,
    previewWellCancel: deps.previewWellCancel,
    previewStandingTorchRemoval: deps.previewStandingTorchRemoval,
    previewPlayerTroughRemoval: deps.previewPlayerTroughRemoval,
    previewBedrollRemoval: deps.previewBedrollRemoval,
    previewPlatformRemoval: deps.previewPlatformRemoval,
    campSnapshot: deps.campInspectionSnapshot,
    droppedItems: ctx.bundle.droppedItems,
    worldSeed: ctx.getWorldSeed(),
    nowDays: ctx.dayNight.elapsedDays,
    inventory: ctx.inventory,
    hasRope: ctx.inventory.count('rope') > 0,
  })

  const pushView = (open: boolean): void => {
    if (!current) {
      vueUi.closeWorldInspection()
      return
    }
    const view = buildWorldInspection(current, lookup())
    if (!view) {
      current = null
      vueUi.closeWorldInspection()
      return
    }
    if (open) vueUi.openWorldInspection(view)
    else vueUi.refreshWorldInspection(view)
  }

  const liveWellSource = (id: string): WaterSource | null => {
    const well = ctx.bundle.playerWells.nodes().find((entry) => entry.id === id)
    if (!well) return null
    return liveWellWaterSource(well, ctx.getWorldSeed(), ctx.dayNight.elapsedDays)
  }

  const close = (): void => {
    current = null
    vueUi.closeWorldInspection()
  }

  const confirmDanger = (title: string, preview: RemovalPreview | null, run: () => void): void => {
    if (!preview) return
    if (!preview.canReceive) {
      pushView(false)
      return
    }
    close()
    vueUi.openActionConfirm(title, preview.body, run)
  }

  const runBusy = (run: () => void): void => {
    close()
    run()
  }

  const runAction = (id: InspectionActionId): void => {
    if (!current) return
    const ref = current
    const startBusy = BUSY_ACTION_IDS.has(id)
    switch (id) {
      case 'cancel':
        if (ref.kind === 'residentialBuilding') {
          confirmDanger('Anuluj budowę chaty', deps.previewResidentialCancel(ref.id), () => deps.cancelResidentialBuilding(ref.id))
          return
        }
        if (ref.kind === 'playerWell') {
          confirmDanger('Anuluj budowę studni', deps.previewWellCancel(ref.id), () => deps.cancelPlayerWell(ref.id))
          return
        }
        break
      case 'drink': {
        const source = ref.kind === 'playerWell' ? liveWellSource(ref.id) : null
        if (source) deps.drinkFromWaterSource(source)
        break
      }
      case 'fill':
        if (ref.kind === 'playerTrough') runBusy(() => deps.fillPlayerTrough(ref.id))
        return
      case 'hireHelp': {
        const target = contractTargetFor(ref)
        if (target) deps.beginHireHelpForTarget(target)
        break
      }
      case 'ignite':
        if (ref.kind === 'standingTorch') deps.igniteStandingTorch(ref.id)
        break
      case 'pack':
        if (ref.kind === 'camp') deps.packTent(ref.id)
        break
      case 'remove':
        if (ref.kind === 'palisade') {
          confirmDanger('Usuń palisadę', deps.previewPalisadeRemoval(ref.id), () => deps.removePalisadeSegment(ref.id))
          return
        }
        if (ref.kind === 'standingTorch') {
          confirmDanger('Usuń pochodnię', deps.previewStandingTorchRemoval(ref.id), () => deps.removeStandingTorch(ref.id))
          return
        }
        if (ref.kind === 'playerTrough') {
          confirmDanger('Usuń koryto', deps.previewPlayerTroughRemoval(ref.id), () => deps.removePlayerTrough(ref.id))
          return
        }
        if (ref.kind === 'bedroll') {
          confirmDanger('Usuń posłanie', deps.previewBedrollRemoval(ref.id), () => deps.removeBedroll(ref.id))
          return
        }
        if (ref.kind === 'platform') {
          confirmDanger('Usuń podest', deps.previewPlatformRemoval(ref.id), () => deps.removePlatform(ref.id))
          return
        }
        break
      case 'repair':
        if (ref.kind === 'playerWell') runBusy(() => deps.workOnWellRoofRepair(ref.id))
        return
      case 'repairBedroll':
        runBusy(() => deps.workOnCampRepair('bedroll', ref.kind === 'camp' ? campComponentId(ref.id, 'bedroll') : ref.id))
        return
      case 'repairPlatform':
        runBusy(() => deps.workOnCampRepair('platform', ref.kind === 'camp' ? campComponentId(ref.id, 'platform') : ref.id))
        return
      case 'repairTent':
        runBusy(() => deps.workOnCampRepair('tent', ref.id))
        return
      case 'sleep':
        if (ref.kind === 'residentialBuilding') deps.sleepInOwnedHouse(ref.id)
        break
      case 'supplyMaterials':
        if (ref.kind === 'residentialBuilding') deps.supplyResidentialBuildingMaterials(ref.id)
        break
      case 'work':
        if (ref.kind === 'playerWell') runBusy(() => deps.workOnWell(ref.id))
        else if (ref.kind === 'palisade') runBusy(() => deps.workOnPalisade(ref.id))
        else if (ref.kind === 'standingTorch') runBusy(() => deps.workOnStandingTorch(ref.id))
        else if (ref.kind === 'residentialBuilding') runBusy(() => deps.workOnResidentialBuilding(ref.id))
        else if (ref.kind === 'terrainPreparation') runBusy(() => deps.resumeTerrainPreparationWork(ref.id))
        else if (ref.kind === 'playerTrough') runBusy(() => deps.workOnPlayerTrough(ref.id))
        return
    }
    if (!startBusy) pushView(false)
  }

  const campComponentId = (tentId: string, kind: 'bedroll' | 'platform'): string => {
    const snapshot = deps.campInspectionSnapshot(tentId)
    if (kind === 'bedroll') return snapshot?.bedroll?.id ?? tentId
    return snapshot?.platform?.id ?? tentId
  }

  const fillContainer = (instanceId: string): void => {
    if (!current || current.kind !== 'playerWell') return
    const source = liveWellSource(current.id)
    if (!source) {
      pushView(false)
      return
    }
    deps.fillWaterContainer(source, instanceId)
    pushView(false)
  }

  vueUi.configureWorldInspection({
    onAction: runAction,
    onFillContainer: fillContainer,
    onClose: () => { current = null },
  })

  return {
    openFromTarget(target) {
      const ref = inspectionTargetRef(target)
      if (!ref) return
      current = ref
      pushView(true)
    },
    syncOpenView() {
      if (!vueUi.isWorldInspectionOpen() || !current) return
      pushView(false)
    },
    close,
    isOpen: () => vueUi.isWorldInspectionOpen(),
  }
}
