import type { ActionResult } from './actionContracts'
import type { ContainerActions } from './containerActions'
import type { PlacementActions, PlacementPreviewResult } from './placementActions'
import type { WorkContractActions } from './workContractActions'
import { createPlacementPreviewGhost, type PlacementPreviewGhost } from '../../world/placementPreview'
import { isActionBlocked, type PlayerActionContext } from './actionContext'
import { placementObjectYaw, snapPlacementYaw45 } from './placementYaw'
import type { Scene } from 'three'

/**
 * Shared object-placement preview mode (plan `ui-input-004` §2/§7, rotation
 * and coverage by `ui-input-012`) — one generic aim/ghost/confirm/cancel
 * lifecycle reused by every placeable object, matching
 * `terrainPreparationActions.ts`'s split: this module owns only the preview
 * presentation, rotation state and dispatch, never gameplay rules. Each
 * object's own action module remains the sole owner of its placement
 * validity, costs and mutation — this only calls their read-only `preview*()`
 * for the ghost, then their real placement action again at confirm time
 * (never trust a cached preview result for the final mutation).
 *
 * @domain ui-input
 */
export type PlacementPreviewKind =
  | 'chest'
  | 'tent'
  | 'fireSimple'
  | 'firePit'
  | 'firePile'
  | 'standingTorch'
  | 'palisade'
  | 'bedroll'
  | 'platform'
  | 'workContract'
  | 'well'

export type PlacementPreviewUiView = {
  label: string
  valid: boolean
  reasonLabel: string
  supportsRotation: boolean
}

const KIND_LABEL: Record<PlacementPreviewKind, string> = {
  chest: 'Skrzynia',
  tent: 'Namiot',
  fireSimple: 'Ognisko',
  firePit: 'Palenisko',
  firePile: 'Stos drewna',
  standingTorch: 'Pochodnia',
  palisade: 'Palisada',
  bedroll: 'Posłanie',
  platform: 'Podest do spania',
  workContract: 'Zlecenie budowy',
  well: 'Studnia',
}

/** Explicit rotation capability — not derived from footprint kind
 *  (plan `ui-input-012` §5). */
const SUPPORTS_ROTATION: Record<PlacementPreviewKind, boolean> = {
  chest: true,
  tent: true,
  fireSimple: false,
  firePit: false,
  firePile: false,
  standingTorch: false,
  palisade: true,
  bedroll: true,
  platform: true,
  workContract: false,
  well: false,
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
    | 'previewWellPlacement'
    | 'placeWellAtAim'
  >
  containers: Pick<ContainerActions, 'previewContainerPlacement' | 'placeContainerAtAim'>
  workContract: Pick<WorkContractActions, 'previewContractPlacement' | 'confirmContractPlacementAtAim'>
  previewFire: () => PlacementPreviewResult
  buildSimpleFire: () => ActionResult
  buildFirePit: () => ActionResult
  buildWoodPile: () => ActionResult
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
  /** Per-frame while active (aim tracking, `[E]` confirm, `[F]/[G]` rotate) —
   *  call unconditionally, before the gaze/interact dispatch, same convention
   *  as `TerrainPreparationActions.tickPreview`. No-op when not active, but
   *  always drains a pending `[F]` so it cannot linger into the next preview. */
  tick: () => void
  /** Explicit confirm button (mirrors keyboard `[E]`) for the preview panel. */
  confirm: () => void
  rotateLeft: () => void
  rotateRight: () => void
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
  const { scene, placement, containers, workContract, previewFire, buildSimpleFire, buildFirePit, buildWoodPile, showPreview, hidePreview, isOtherPreviewActive } = deps

  const ghost: PlacementPreviewGhost = createPlacementPreviewGhost()
  let active: PlacementPreviewKind | null = null
  let lastResult: PlacementPreviewResult | null = null
  let placementStartYaw = 0
  let rotationSteps = 0

  const supportsRotation = (kind: PlacementPreviewKind | null): boolean =>
    kind !== null && SUPPORTS_ROTATION[kind]

  const currentObjectYaw = (): number | undefined => {
    if (!supportsRotation(active)) return undefined
    return placementObjectYaw(placementStartYaw, rotationSteps)
  }

  const resolvePreview = (kind: PlacementPreviewKind, objectYaw?: number): PlacementPreviewResult => {
    switch (kind) {
      case 'bedroll': return placement.previewBedrollPlacement(objectYaw)
      case 'chest': return containers.previewContainerPlacement(objectYaw)
      case 'firePile':
      case 'firePit':
      case 'fireSimple':
        return previewFire()
      case 'palisade': return placement.previewPalisadePlacement(objectYaw)
      case 'platform': return placement.previewPlatformPlacement(objectYaw)
      case 'standingTorch': return placement.previewStandingTorchPlacement()
      case 'tent': return placement.previewTentPlacement(objectYaw)
      case 'well': return placement.previewWellPlacement()
      case 'workContract': return workContract.previewContractPlacement()
    }
  }

  const commit = (kind: PlacementPreviewKind, objectYaw?: number): void => {
    switch (kind) {
      case 'bedroll': placement.placeBedrollAtAim(objectYaw); return
      case 'chest': containers.placeContainerAtAim(objectYaw); return
      case 'firePile': buildWoodPile(); return
      case 'firePit': buildFirePit(); return
      case 'fireSimple': buildSimpleFire(); return
      case 'palisade': placement.placePalisadeAtAim(objectYaw); return
      case 'platform': placement.placePlatformAtAim(objectYaw); return
      case 'standingTorch': placement.placeStandingTorchAtAim(); return
      case 'tent': placement.placeTentAtAim(objectYaw); return
      case 'well': placement.placeWellAtAim(); return
      case 'workContract': workContract.confirmContractPlacementAtAim(); return
    }
  }

  const exit = (): void => {
    if (!active) return
    active = null
    lastResult = null
    placementStartYaw = 0
    rotationSteps = 0
    mouseLook.state.zoomLocked = false
    ghost.group.removeFromParent()
    hidePreview()
  }

  const start = (kind: PlacementPreviewKind): void => {
    if (active || isOtherPreviewActive() || isActionBlocked(ctx)) return
    active = kind
    rotationSteps = 0
    placementStartYaw = snapPlacementYaw45(mouseLook.state.yaw)
    mouseLook.state.zoomLocked = true
    scene.add(ghost.group)
  }

  const isActive = (): boolean => active !== null

  const rotateLeft = (): void => {
    if (!supportsRotation(active)) return
    rotationSteps -= 1
  }

  const rotateRight = (): void => {
    if (!supportsRotation(active)) return
    rotationSteps += 1
  }

  const confirm = (): void => {
    if (!active || !lastResult?.valid) return
    const kind = active
    const objectYaw = currentObjectYaw()
    exit()
    commit(kind, objectYaw)
  }

  const tick = (): void => {
    const rotateLeftPressed = keyboard.consumeRotateLeft()
    if (!active) return
    if (isActionBlocked(ctx)) {
      exit()
      return
    }
    if (supportsRotation(active)) {
      if (rotateLeftPressed) rotateLeft()
      if (keyboard.consumeDrop()) rotateRight()
    }
    const result = resolvePreview(active, currentObjectYaw())
    ghost.setFootprint(result.footprint)
    ghost.setTransform(result.x, result.z, bundle.chunkManager.sampleHeight(result.x, result.z), result.yaw)
    ghost.setValid(result.valid)
    showPreview({
      label: KIND_LABEL[active],
      valid: result.valid,
      reasonLabel: result.reasonLabel,
      supportsRotation: SUPPORTS_ROTATION[active],
    })
    lastResult = result
    if (keyboard.consumeInteract()) confirm()
  }

  const cancel = (): boolean => {
    if (!active) return false
    exit()
    return true
  }

  return { start, isActive, tick, confirm, rotateLeft, rotateRight, cancel }
}
