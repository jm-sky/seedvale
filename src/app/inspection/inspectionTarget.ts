import type { Interactable } from '../../interaction/Interactable'
import type { ContractTarget } from '../../world/workContract'
import type { InspectionTargetRef } from './worldInspectionView'

export type { InspectionTargetRef }

/** Stable inspection identity from the current gaze `Interactable`. `null`
 *  means the target has no meaningful inspection — no `V` prompt, no mobile
 *  button. Does not treat Interactable snapshots as mutation authority. */
export function inspectionTargetRef(target: Interactable | null | undefined): InspectionTargetRef | null {
  if (!target) return null
  switch (target.kind) {
    case 'palisade':
    case 'playerWell':
    case 'residentialBuilding':
    case 'standingTorch':
    case 'terrainPreparation':
      return { kind: target.kind, id: target.id }
    default:
      return null
  }
}

export function contractTargetFor(ref: InspectionTargetRef): ContractTarget {
  switch (ref.kind) {
    case 'palisade':
      return { kind: 'palisade', targetId: ref.id }
    case 'playerWell':
      return { kind: 'construction', targetId: ref.id }
    case 'residentialBuilding':
      return { kind: 'residential_building', targetId: ref.id }
    case 'standingTorch':
      return { kind: 'standing_torch', targetId: ref.id }
    case 'terrainPreparation':
      return { kind: 'terrain_preparation', targetId: ref.id }
  }
}
