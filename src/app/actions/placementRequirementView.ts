import type {
  MaterialAvailabilityView,
  MaterialRequirement,
} from '../../items/constructionMaterials'
import type { DroppedItems } from '../../items/createDroppedItems'
import type { Inventory } from '../../items/Inventory'
import {
  CONSTRUCTION_MATERIAL_RADIUS,
  formatMaterialAvailabilityLine,
  materialAvailabilityBreakdown,
} from '../../items/constructionMaterials'
import { ITEM_DEFS, type ItemKind } from '../../items/items'

/** Presentational placement state (plan ui-input-016) — ready confirms
 *  placement, preparation is a legal site that still needs materials/
 *  capability/terrain work, invalid is a physically illegal site. */
export type PlacementPreviewState = 'ready' | 'preparation' | 'invalid'

export type PlacementConfirmKind = 'place' | 'prepareTerrain' | 'none'

export type PlacementRequirementView = {
  kind: ItemKind
  label: string
  required: number
  inInventory: number
  nearbyWorld: number
  available: number
  missing: number
}

export type PlacementPresentation = {
  valid: boolean
  state: PlacementPreviewState
  canConfirm: boolean
  confirmKind: PlacementConfirmKind
  reasonLabel: string
  requirements: readonly PlacementRequirementView[]
}

/**
 * Maps a live `materialAvailabilityBreakdown` to the shared preview/inspection
 * requirement row. Vue must not recompute these numbers.
 *
 * @domain ui-input
 */
export function placementRequirementView(breakdown: MaterialAvailabilityView): PlacementRequirementView {
  return {
    kind: breakdown.kind,
    label: ITEM_DEFS[breakdown.kind].label,
    required: breakdown.required,
    inInventory: breakdown.inInventory,
    nearbyWorld: breakdown.nearbyWorld,
    available: breakdown.available,
    missing: breakdown.missing,
  }
}

export function placementRequirementViews(
  inventory: Inventory,
  droppedItems: DroppedItems,
  x: number,
  z: number,
  requirements: readonly MaterialRequirement[],
): PlacementRequirementView[] {
  return requirements.map((requirement) => placementRequirementView(
    materialAvailabilityBreakdown(inventory, droppedItems, x, z, CONSTRUCTION_MATERIAL_RADIUS, requirement),
  ))
}

export function formatPlacementRequirement(view: PlacementRequirementView): string {
  return formatMaterialAvailabilityLine(view, view.label)
}

export function missingMaterialsReason(views: readonly PlacementRequirementView[]): string {
  const missing = views.filter((view) => view.missing > 0)
  if (missing.length === 0) return ''
  return `Brakuje: ${missing.map((view) => `${view.missing}× ${view.label}`).join(', ')}.`
}

export function formatMaterialCost(requirements: readonly MaterialRequirement[]): string {
  return requirements.map((requirement) => `${requirement.count}× ${ITEM_DEFS[requirement.kind].label}`).join(', ')
}

export function formatRecoveryLines(recovered: readonly MaterialRequirement[]): string {
  if (recovered.length === 0) return 'Brak materiałów do odzyskania.'
  return `Odzyskasz: ${recovered.map((requirement) => `${requirement.count}× ${ITEM_DEFS[requirement.kind].label}`).join(', ')}.`
}

/**
 * Derives the three-state preview presentation from geometry, optional
 * terrain-prep, capability and live material rows. Never mutates.
 *
 * @domain ui-input
 */
export function derivePlacementPresentation(input: {
  geometryOk: boolean
  geometryReason: string
  requirements?: readonly PlacementRequirementView[]
  missingCapabilityReason?: string
  preparation?: { reasonLabel: string, canConfirm: boolean }
}): PlacementPresentation {
  const requirements = input.requirements ?? []
  if (input.preparation) {
    return {
      valid: false,
      state: 'preparation',
      canConfirm: input.preparation.canConfirm,
      confirmKind: input.preparation.canConfirm ? 'prepareTerrain' : 'none',
      reasonLabel: input.preparation.reasonLabel,
      requirements,
    }
  }
  if (!input.geometryOk) {
    return {
      valid: false,
      state: 'invalid',
      canConfirm: false,
      confirmKind: 'none',
      reasonLabel: input.geometryReason,
      requirements,
    }
  }
  if (input.missingCapabilityReason) {
    return {
      valid: false,
      state: 'preparation',
      canConfirm: false,
      confirmKind: 'none',
      reasonLabel: input.missingCapabilityReason,
      requirements,
    }
  }
  const missingReason = missingMaterialsReason(requirements)
  if (missingReason) {
    return {
      valid: false,
      state: 'preparation',
      canConfirm: false,
      confirmKind: 'none',
      reasonLabel: missingReason,
      requirements,
    }
  }
  return {
    valid: true,
    state: 'ready',
    canConfirm: true,
    confirmKind: 'place',
    reasonLabel: '',
    requirements,
  }
}
