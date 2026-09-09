import type { Inventory } from '../../items/Inventory'
import type { PlayerController } from '../../player/PlayerController'
import type { DayNightState } from '../../world/dayNight'
import type { BusyAction } from '../busyAction'
import type { WorldBundle } from '../worldBundle'
import type { PlacementPreviewActions, PlacementPreviewConfirmResult } from './placementPreviewActions'
import type { SurvivalActionLifecycle, SurvivalActions } from './survivalActions'
import { CONSTRUCTION_MATERIAL_RADIUS, hasMaterial, type MaterialRequirement } from '../../items/constructionMaterials'
import {
  BEDROLL_MATERIAL_REQUIREMENTS,
  BEDROLL_ON_PLATFORM_RADIUS,
  findNearestSleepingUtility,
  PLATFORM_MATERIAL_REQUIREMENTS,
} from '../../world/sleepingUtilities'
import { type CampRestSnapshot, resolveCampRestSnapshot } from '../campRestSnapshot'
import { SIMPLE_FIRE_BRANCH_COST } from '../userActions'
import { isActionBlocked, type PlayerActionContext } from './actionContext'

export type FullCampIntentPhase =
  | 'resolve'
  | 'placing-tent'
  | 'placing-platform'
  | 'placing-bedroll'
  | 'placing-fire'
  | 'igniting'
  | 'done'
  | 'cancelled'

export type FullCampIntentController = {
  startFullCamp: () => void
  cancel: () => void
  isActive: () => boolean
}

type FullCampIntentDeps = {
  ctx: PlayerActionContext
  bundle: WorldBundle
  player: PlayerController
  inventory: Inventory
  dayNight: DayNightState
  survival: Pick<SurvivalActions, 'startIgniteFire'>
  placementPreview: Pick<PlacementPreviewActions, 'start' | 'cancel' | 'isActive'>
  busy: BusyAction
  toast: { show: (text: string, kind?: 'info' | 'error' | 'pickup') => void }
}

/**
 * Single-active player intent for "Rozbij pełny obóz" (plan items-player-018).
 * Reuses the `createCookMealIntent` pattern from ui-input-010 — transient
 * sequencing only. Placement, Busy Actions, inventory and fire state stay in
 * their existing owners. Partial world changes are never rolled back.
 *
 * @domain items-player
 */
export function createFullCampIntent(deps: FullCampIntentDeps): FullCampIntentController {
  const { ctx, bundle, player, inventory, dayNight, survival, placementPreview, busy, toast } = deps
  let phase: FullCampIntentPhase | null = null
  let anchor: { x: number, z: number } | null = null
  let anchorLocked = false

  const clear = (): void => {
    phase = null
    anchor = null
    anchorLocked = false
  }

  const cancel = (): void => {
    if (!phase || phase === 'done' || phase === 'cancelled') return
    const current = phase
    phase = 'cancelled'
    if (
      (current === 'placing-tent' || current === 'placing-platform' || current === 'placing-bedroll' || current === 'placing-fire')
      && placementPreview.isActive()
    ) {
      placementPreview.cancel()
    }
    if (busy.isActive()) busy.cancel()
    clear()
  }

  const isActive = (): boolean => phase != null && phase !== 'done' && phase !== 'cancelled'

  const playerPos = (): { x: number, z: number } => ({
    x: player.mesh.position.x,
    z: player.mesh.position.z,
  })

  const resolveSnapshotAt = (x: number, z: number): CampRestSnapshot => resolveCampRestSnapshot({
    x,
    z,
    tents: bundle.placedTents,
    bedrolls: bundle.sleepingUtilities.bedrolls,
    platforms: bundle.sleepingUtilities.platforms,
    fires: bundle.placedFires.list(),
    nowDays: dayNight.elapsedDays,
    hasBlanket: inventory.has('blanket', 1),
    survivalValue: player.skills.survival.value,
  })

  const hasAllMaterials = (requirements: readonly MaterialRequirement[]): boolean => {
    const pos = playerPos()
    return requirements.every((r) => hasMaterial(
      inventory,
      bundle.droppedItems,
      pos.x,
      pos.z,
      CONSTRUCTION_MATERIAL_RADIUS,
      r,
    ))
  }

  const canPlaceTent = (): boolean => inventory.has('tent', 1)
  const canPlaceBedroll = (): boolean => hasAllMaterials(BEDROLL_MATERIAL_REQUIREMENTS)
  const canPlacePlatform = (): boolean => hasAllMaterials(PLATFORM_MATERIAL_REQUIREMENTS)
  const canPlaceFire = (): boolean =>
    inventory.hasCapability('fire_starting') && inventory.has('branch', SIMPLE_FIRE_BRANCH_COST)

  const nearbyPlatform = (snapshot: CampRestSnapshot): boolean => {
    if (snapshot.platform) return true
    const around = snapshot.bedroll ?? snapshot.tent ?? { x: snapshot.anchor.x, z: snapshot.anchor.z }
    return findNearestSleepingUtility(
      bundle.sleepingUtilities.platforms.list(),
      around.x,
      around.z,
      BEDROLL_ON_PLATFORM_RADIUS,
    ) !== null
  }

  const lockAnchor = (point: { x: number, z: number }): void => {
    anchor = { x: point.x, z: point.z }
    anchorLocked = true
  }

  const adoptIfUnlocked = (point: { x: number, z: number }): void => {
    if (!anchorLocked) lockAnchor(point)
  }

  const finish = (): void => {
    clear()
  }

  const beginIgnite = (snapshot: CampRestSnapshot): void => {
    const fireEntry = snapshot.fire
    if (!fireEntry || fireEntry.lit) {
      finish()
      return
    }
    const live = bundle.placedFires.list().find((entry) => entry.id === fireEntry.id)
    if (!live) {
      finish()
      return
    }
    phase = 'igniting'
    const lifecycle: SurvivalActionLifecycle = {
      onComplete: (outcome) => {
        if (outcome === 'success') finish()
        else cancel()
      },
      onCancel: () => cancel(),
    }
    const result = survival.startIgniteFire(live.fire, lifecycle)
    if (!result.ok) cancel()
  }

  const beginPlacement = (
    kind: 'tent' | 'platform' | 'bedroll' | 'fireSimple',
    nextPhase: FullCampIntentPhase,
    onPlaced: (result: PlacementPreviewConfirmResult) => void,
  ): void => {
    phase = nextPhase
    placementPreview.start(kind, {
      onConfirmed: onPlaced,
      onCancelled: () => cancel(),
    })
  }

  const continueAfterFire = (): void => {
    if (!anchor) {
      finish()
      return
    }
    const snapshot = resolveSnapshotAt(anchor.x, anchor.z)
    if (snapshot.fire) {
      beginIgnite(snapshot)
      return
    }
    if (!canPlaceFire()) {
      finish()
      return
    }
    beginPlacement('fireSimple', 'placing-fire', (result) => {
      if (result.kind !== 'fireSimple') {
        cancel()
        return
      }
      const placed = bundle.placedFires.list().find((entry) => entry.id === result.placedFireId)
      if (placed) adoptIfUnlocked(placed)
      const point = anchor ?? playerPos()
      beginIgnite(resolveSnapshotAt(point.x, point.z))
    })
  }

  const continueAfterBedroll = (): void => {
    if (!anchor) {
      finish()
      return
    }
    const snapshot = resolveSnapshotAt(anchor.x, anchor.z)
    if (snapshot.bedroll || !canPlaceBedroll()) {
      continueAfterFire()
      return
    }
    beginPlacement('bedroll', 'placing-bedroll', (result) => {
      if (result.kind !== 'bedroll') {
        cancel()
        return
      }
      const placed = bundle.sleepingUtilities.bedrolls.list().find((entry) => entry.id === result.placedId)
      if (placed) adoptIfUnlocked(placed)
      continueAfterFire()
    })
  }

  const continueAfterPlatform = (): void => {
    if (!anchor) {
      finish()
      return
    }
    const snapshot = resolveSnapshotAt(anchor.x, anchor.z)
    if (nearbyPlatform(snapshot) || !canPlacePlatform()) {
      continueAfterBedroll()
      return
    }
    beginPlacement('platform', 'placing-platform', (result) => {
      if (result.kind !== 'platform') {
        cancel()
        return
      }
      const placed = bundle.sleepingUtilities.platforms.list().find((entry) => entry.id === result.placedId)
      if (placed) adoptIfUnlocked(placed)
      continueAfterBedroll()
    })
  }

  const startFromResolve = (): void => {
    const pos = playerPos()
    const snapshot = resolveSnapshotAt(pos.x, pos.z)
    if (snapshot.tent) lockAnchor(snapshot.tent)
    else if (snapshot.bedroll) lockAnchor(snapshot.bedroll)
    else anchor = { x: pos.x, z: pos.z }

    const canStart = snapshot.tent != null
      || snapshot.bedroll != null
      || canPlaceTent()
      || canPlaceBedroll()
    if (!canStart) {
      toast.show('Nie da się przygotować miejsca odpoczynku.', 'error')
      clear()
      return
    }

    if (snapshot.tent) {
      continueAfterPlatform()
      return
    }
    if (canPlaceTent()) {
      beginPlacement('tent', 'placing-tent', (result) => {
        if (result.kind !== 'tent') {
          cancel()
          return
        }
        const placed = bundle.placedTents.list().find((entry) => entry.id === result.placedId)
        if (placed) lockAnchor(placed)
        continueAfterPlatform()
      })
      return
    }
    continueAfterPlatform()
  }

  const startFullCamp = (): void => {
    cancel()
    if (isActionBlocked(ctx)) return
    phase = 'resolve'
    startFromResolve()
  }

  return { startFullCamp, cancel, isActive }
}
