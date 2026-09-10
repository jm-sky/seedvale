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
    case 'bedroll':
    case 'palisade':
    case 'platform':
    case 'playerTrough':
    case 'playerWell':
    case 'residentialBuilding':
    case 'standingTorch':
    case 'terrainPreparation':
      return { kind: target.kind, id: target.id }
    case 'camp':
      return { kind: 'camp', id: target.tentId }
    case 'tent':
      return { kind: 'camp', id: target.id }
    default:
      return null
  }
}

/** Contract-capable structures only. Camp/trough/bedroll/platform have no
 *  work-contract mapping — do not invent one for exhaustiveness. */
export function contractTargetFor(ref: InspectionTargetRef): ContractTarget | null {
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
    default:
      return null
  }
}
