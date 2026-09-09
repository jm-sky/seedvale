import type { Interactable } from '../../interaction/Interactable'
import type { VueUi } from '../../ui-vue/mount'
import type { WaterSource } from '../../world/WaterSource'
import type { ContractTarget } from '../../world/workContract'
import type { InspectionActionId } from '../inspection/worldInspectionView'
import type { PlayerActionContext } from './actionContext'
import type { ActionResult } from './actionContracts'
import type { WellRoofRepairView, WellWorkView } from './placementActions'
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
  removePalisadeSegment: (id: string) => void
  workOnStandingTorch: (id: string) => void
  igniteStandingTorch: (id: string) => void
  supplyResidentialBuildingMaterials: (id: string) => void
  workOnResidentialBuilding: (id: string) => void
  cancelResidentialBuilding: (id: string) => void
  sleepInOwnedHouse: (id: string) => void
  resumeTerrainPreparationWork: (id: string) => void
  beginHireHelpForTarget: (target: ContractTarget) => void
  drinkFromWaterSource: (source: WaterSource) => void
  fillWaterContainer: (source: WaterSource, instanceId: string) => ActionResult
}

export type InspectionActions = {
  openFromTarget: (target: Interactable) => void
  syncOpenView: () => void
  close: () => void
  isOpen: () => boolean
}

/**
 * Application owner of world inspection (plan `ui-input-014`). Vue only
 * renders the snapshot and routes action ids back here. Lookups always use
 * `ctx.bundle` at call time so a WorldBundle rebuild cannot leave stale
 * collections captured in callbacks.
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
    contract: (target) => ctx.bundle.workContracts.findByTarget(target),
    describeWellWork: deps.describeWellWork,
    describeWellRoofRepair: deps.describeWellRoofRepair,
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

  const runAction = (id: InspectionActionId): void => {
    if (!current) return
    const ref = current
    switch (id) {
      case 'cancel':
        if (ref.kind === 'residentialBuilding') deps.cancelResidentialBuilding(ref.id)
        break
      case 'drink': {
        const source = ref.kind === 'playerWell' ? liveWellSource(ref.id) : null
        if (source) deps.drinkFromWaterSource(source)
        break
      }
      case 'hireHelp':
        deps.beginHireHelpForTarget(contractTargetFor(ref))
        break
      case 'ignite':
        if (ref.kind === 'standingTorch') deps.igniteStandingTorch(ref.id)
        break
      case 'remove':
        if (ref.kind === 'palisade') deps.removePalisadeSegment(ref.id)
        break
      case 'repair':
        if (ref.kind === 'playerWell') deps.workOnWellRoofRepair(ref.id)
        break
      case 'sleep':
        if (ref.kind === 'residentialBuilding') deps.sleepInOwnedHouse(ref.id)
        break
      case 'supplyMaterials':
        if (ref.kind === 'residentialBuilding') deps.supplyResidentialBuildingMaterials(ref.id)
        break
      case 'work':
        if (ref.kind === 'playerWell') deps.workOnWell(ref.id)
        else if (ref.kind === 'palisade') deps.workOnPalisade(ref.id)
        else if (ref.kind === 'standingTorch') deps.workOnStandingTorch(ref.id)
        else if (ref.kind === 'residentialBuilding') deps.workOnResidentialBuilding(ref.id)
        else if (ref.kind === 'terrainPreparation') deps.resumeTerrainPreparationWork(ref.id)
        break
    }
    pushView(false)
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
    close() {
      current = null
      vueUi.closeWorldInspection()
    },
    isOpen: () => vueUi.isWorldInspectionOpen(),
  }
}
