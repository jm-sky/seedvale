/** Presentation-only inspection read model (plan `ui-input-014`). Vue renders
 *  this snapshot; it must not import world/inventory/contract modules. */

export type InspectionInfoRow = {
  kind: 'info'
  label: string
  value: string
}

export type InspectionProgressRow = {
  kind: 'progress'
  label: string
  completed: number
  required: number
  valueLabel: string
}

export type InspectionMaterialItem = {
  label: string
  count: number
}

export type InspectionMaterialsRow = {
  kind: 'materials'
  statusLabel: string
  items: readonly InspectionMaterialItem[]
}

export type InspectionLiquidContainerOption = {
  instanceId: string
  label: string
  detail: string
  canFill: boolean
  reasonLabel: string
}

export type InspectionLiquidContainersRow = {
  kind: 'liquidContainers'
  emptyLabel: string
  options: readonly InspectionLiquidContainerOption[]
}

export type InspectionContractRow = {
  kind: 'contract'
  statusLabel: string
  rows: readonly { label: string, value: string }[]
}

export type InspectionRow =
  | InspectionInfoRow
  | InspectionProgressRow
  | InspectionMaterialsRow
  | InspectionLiquidContainersRow
  | InspectionContractRow

export type InspectionSection = {
  title: string
  rows: readonly InspectionRow[]
}

export type InspectionActionId =
  | 'work'
  | 'supplyMaterials'
  | 'hireHelp'
  | 'cancel'
  | 'remove'
  | 'repair'
  | 'drink'
  | 'ignite'
  | 'sleep'

export type InspectionAction = {
  id: InspectionActionId
  label: string
  enabled: boolean
  reasonLabel: string
  variant?: 'primary' | 'ghost' | 'danger'
}

export type WorldInspectionView = {
  targetId: string
  title: string
  description?: string
  sections: readonly InspectionSection[]
  actions: readonly InspectionAction[]
}

export type InspectionTargetKind =
  | 'playerWell'
  | 'terrainPreparation'
  | 'palisade'
  | 'standingTorch'
  | 'residentialBuilding'

export type InspectionTargetRef = {
  kind: InspectionTargetKind
  id: string
}
