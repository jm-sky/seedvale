import type { ActionResult } from './actionContracts'
import type { ContainerActions } from './containerActions'
import type { PlacementActions, PlacementPreviewResult } from './placementActions'
import type { WorkContractActions } from './workContractActions'
import { createPlacementPreviewGhost, type PlacementPreviewGhost } from '../../world/placementPreview'
import { isActionBlocked, type PlayerActionContext } from './actionContext'
import type { Scene } from 'three'

/**
 * Shared object-placement preview mode (plan `ui-input-004` §2/§7) — one
 * generic aim/ghost/confirm/cancel lifecycle reused by every placeable
 * object (chest, tent, fire), matching `terrainPreparationActions.ts`'s
 * split: this module owns only the preview presentation and dispatch, never
 * gameplay rules. Each object's own action module (`placementActions.ts`,
 * `containerActions.ts`, `userActions.ts`) remains the sole owner of its
 * placement validity, costs and mutation — this only calls their read-only
 * `preview*()` for the ghost, then their real placement action again at
 * confirm time (implementation notes §2: never trust a cached preview result
 * for the final mutation).
 */
export type PlacementPreviewKind = 'chest' | 'tent' | 'fireSimple' | 'firePit' | 'standingTorch' | 'palisade' | 'bedroll' | 'platform' | 'workContract'

export type PlacementPreviewUiView = {
  label: string
  valid: boolean
  reasonLabel: string
}

const KIND_LABEL: Record<PlacementPreviewKind, string> = {
  chest: 'Skrzynia',
  tent: 'Namiot',
  fireSimple: 'Ognisko',
  firePit: 'Palenisko',
  standingTorch: 'Pochodnia',
  palisade: 'Palisada',
  bedroll: 'Posłanie',
  platform: 'Podest do spania',
  workContract: 'Zlecenie budowy',
}

export type PlacementPreviewActionDeps = {
  scene: Scene
  placement: Pick<
    PlacementActions,
    | 'previewTentPlacement'
    | 'placeTentAtAim'
    | 'previewStandingTorchPlacement'
    | 'placeStandingTorchAtAim'
    | 'previewPalisadePlacement'
    | 'placePalisadeAtAim'
    | 'previewBedrollPlacement'
    | 'placeBedrollAtAim'
    | 'previewPlatformPlacement'
    | 'placePlatformAtAim'
  >
  containers: Pick<ContainerActions, 'previewContainerPlacement' | 'placeContainerAtAim'>
  workContract: Pick<WorkContractActions, 'previewContractPlacement' | 'confirmContractPlacementAtAim'>
  previewFire: () => PlacementPreviewResult
  buildSimpleFire: () => ActionResult
  buildFirePit: () => ActionResult
  showPreview: (view: PlacementPreviewUiView) => void
  hidePreview: () => void
  /** Mutual exclusion with `Przygotuj teren`'s own preview mode (plan §9) —
   *  only one world preview mode may be active at a time. */
  isOtherPreviewActive: () => boolean
}

export type PlacementPreviewActions = {
  /** Quick Actions "Budowa" entries — enters the preview mode for `kind`.
   *  No-op if another preview/busy activity is already running. */
  start: (kind: PlacementPreviewKind) => void
  isActive: () => boolean
  /** Per-frame while active (aim tracking, `[E]` confirm) — call
   *  unconditionally, before the gaze/interact dispatch, same convention as
   *  `TerrainPreparationActions.tickPreview`. No-op when not active. */
  tick: () => void
  /** Explicit confirm button (mirrors keyboard `[E]`) for the preview panel. */
  confirm: () => void
  /** Esc — cancels the active preview without side effects. Returns true if
   *  a preview was actually active (same contract as
   *  `TerrainPreparationActions.cancelActive`). */
  cancel: () => boolean
}

export function createPlacementPreviewActions(
  ctx: PlayerActionContext,
  deps: PlacementPreviewActionDeps,
): PlacementPreviewActions {
  const { bundle, mouseLook, keyboard } = ctx
  const { scene, placement, containers, workContract, previewFire, buildSimpleFire, buildFirePit, showPreview, hidePreview, isOtherPreviewActive } = deps

  const ghost: PlacementPreviewGhost = createPlacementPreviewGhost()
  let active: PlacementPreviewKind | null = null
  let lastResult: PlacementPreviewResult | null = null

  const resolvePreview = (kind: PlacementPreviewKind): PlacementPreviewResult => {
    switch (kind) {
      case 'bedroll': return placement.previewBedrollPlacement()
      case 'chest': return containers.previewContainerPlacement()
      case 'firePit':
      case 'fireSimple':
        return previewFire()
      case 'palisade': return placement.previewPalisadePlacement()
      case 'platform': return placement.previewPlatformPlacement()
      case 'standingTorch': return placement.previewStandingTorchPlacement()
      case 'tent': return placement.previewTentPlacement()
      case 'workContract': return workContract.previewContractPlacement()
    }
  }

  const commit = (kind: PlacementPreviewKind): void => {
    switch (kind) {
      case 'bedroll': placement.placeBedrollAtAim(); return
      case 'chest': containers.placeContainerAtAim(); return
      case 'firePit': buildFirePit(); return
      case 'fireSimple': buildSimpleFire(); return
      case 'palisade': placement.placePalisadeAtAim(); return
      case 'platform': placement.placePlatformAtAim(); return
      case 'standingTorch': placement.placeStandingTorchAtAim(); return
      case 'tent': placement.placeTentAtAim(); return
      case 'workContract': workContract.confirmContractPlacementAtAim(); return
    }
  }

  const exit = (): void => {
    if (!active) return
    active = null
    lastResult = null
    mouseLook.state.zoomLocked = false
    ghost.group.removeFromParent()
    hidePreview()
  }

  const start = (kind: PlacementPreviewKind): void => {
    if (active || isOtherPreviewActive() || isActionBlocked(ctx)) return
    active = kind
    mouseLook.state.zoomLocked = true
    scene.add(ghost.group)
  }

  const isActive = (): boolean => active !== null

  const confirm = (): void => {
    if (!active || !lastResult?.valid) return
    const kind = active
    exit()
    commit(kind)
  }

  const tick = (): void => {
    if (!active) return
    if (isActionBlocked(ctx)) {
      exit()
      return
    }
    const result = resolvePreview(active)
    ghost.setRadius(result.footprintRadius)
    ghost.setTransform(result.x, result.z, bundle.chunkManager.sampleHeight(result.x, result.z))
    ghost.setValid(result.valid)
    showPreview({ label: KIND_LABEL[active], valid: result.valid, reasonLabel: result.reasonLabel })
    lastResult = result
    if (keyboard.consumeInteract()) confirm()
  }

  const cancel = (): boolean => {
    if (!active) return false
    exit()
    return true
  }

  return { start, isActive, tick, confirm, cancel }
}
