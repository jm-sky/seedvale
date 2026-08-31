import type { TimeSkipOverlay } from '../../ui/createTimeSkipOverlay'
import type { TerrainPreparationPreview } from '../../world/terrainPreparationPreview'
import type { PlacementBlocker } from './placementActions'
import { evaluateGroundPlacement } from '../../items/tentPlacement'
import { awardSkillXp } from '../../player/PlayerSkills'
import { type DigEnv, isRockGround } from '../../terrain/dig'
import {
  averageAbsHeightDelta,
  computeRequiredWork,
  type GridSample,
  type HeightSample,
  MAX_PREPARATION_DELTA,
  preparationSamplesPerSide,
  type PreparationSize,
  progressiveHeights,
  resolvePreparationSamples,
  type TerrainPreparationRecord,
  toolSpeedMultiplier,
  validatePreparationSamples,
} from '../../terrain/terrainPreparation'
import { createTerrainPreparationPreview } from '../../world/terrainPreparationPreview'
import { isActionBlocked, type PlayerActionContext } from './actionContext'
import type { Scene } from 'three'

/** Minimum how-far-ahead (world units) the preview/preparation area is
 *  centered — comfortably larger than `DIG_REACH`/`WELL_PLACE_REACH` so a
 *  small footprint doesn't overlap the player's own standing point. There is
 *  no free-moving cursor in this game (pointer-locked FPS camera) — "follows
 *  the mouse position" (plan §2) means the same thing every other aimed
 *  action already means: it follows `mouseLook.state.yaw`. */
const TERRAIN_PREP_REACH = 2.6

/** Actual reach for a given footprint size — grows with `sizeMeters` (plan
 *  `ui-input-004` §4's 9×9m size) so the area's near edge still clears the
 *  player's standing point instead of the fixed `TERRAIN_PREP_REACH` letting
 *  a large footprint straddle them. */
function terrainPrepReach(sizeMeters: PreparationSize): number {
  return Math.max(TERRAIN_PREP_REACH, sizeMeters / 2 + 0.5)
}

const SIZES: readonly PreparationSize[] = [2, 3, 4, 9]
const HEIGHT_STEP = 0.25
/** Wheel `deltaY` per resize step — most mice report ±100 per notch;
 *  trackpads fire many smaller deltas, so this accumulates instead of
 *  stepping on every event. */
const WHEEL_STEP = 100

/** Re-push progressive heights/`completedWork` at most this often (progress
 *  fraction) — the terrain write triggers a full chunk-mesh rebuild
 *  (`ChunkManager.applyExactHeights`), so ticking it every single frame
 *  would rebuild dozens of times a second for no visible benefit. Still
 *  reads as continuous progressive deformation at this granularity given
 *  how short a preparation's total work duration normally is. */
const PROGRESS_UPDATE_STEP = 0.05

/** Survival XP per work-hour a completed preparation required (plan §5) —
 *  proportional to the work actually done, awarded once on natural
 *  completion, never on start (implementation notes §7). Capped so an
 *  extreme-size/extreme-delta preparation can't out-earn every other
 *  Survival action combined — `SKILL_XP_AWARD`'s existing one-shot rewards
 *  (`campRest` 12, `pitchTent` 10, `igniteFire` 8) set the scale this stays
 *  within. */
const XP_PER_WORK_HOUR = 2
const MAX_PREPARATION_XP = 20

let nextPreparationId = 0

function nextSize(size: PreparationSize, delta: 1 | -1): PreparationSize {
  const index = SIZES.indexOf(size)
  const next = SIZES[Math.max(0, Math.min(SIZES.length - 1, index + delta))]
  return next ?? size
}

export type TerrainPreparationPreviewView = {
  sizeLabel: string
  heightLabel: string
  valid: boolean
  reasonLabel: string
}

export type TerrainPreparationActionDeps = {
  scene: Scene
  timeSkipOverlay: TimeSkipOverlay
  wheelTarget: HTMLElement
  /** Same nearby-object query `placement.tentBlockers` already exposes
   *  (trees, settlement wells/houses) — reused here rather than a second
   *  blocker query, per the plan's "reuse existing terrain/world queries." */
  blockersNear: (x: number, z: number) => readonly PlacementBlocker[]
  showPreview: (view: TerrainPreparationPreviewView) => void
  hidePreview: () => void
  /** Mutual exclusion with the shared object-placement preview mode (plan
   *  `ui-input-004` §9) — only one world preview mode may be active at a
   *  time. */
  isOtherPreviewActive: () => boolean
}

export type TerrainPreparationActions = {
  /** Quick Actions "Przygotuj teren" — enters the preview mode. */
  startPreview: () => void
  isPreviewActive: () => boolean
  /** True while an active preparation-work session (post-confirm) is
   *  running — distinct from `isPreviewActive()`, which covers only the
   *  pre-confirm placement preview. Drives the `TimeSkipOverlay` cancel
   *  button shown during the actual work `timeSkip`. */
  isWorkActive: () => boolean
  /** Per-frame while the preview is active (aim tracking, size/height keys,
   *  confirm) — call unconditionally, before the gaze/interact dispatch so a
   *  confirming `[E]` press doesn't also fall through to it. No-ops when the
   *  preview isn't active. */
  tickPreview: () => void
  /** Size/height/confirm controls also reachable from `[+/-]`/`[,/.]`/`[E]` —
   *  exposed so the UI can offer explicit buttons for players who don't know
   *  the shortcuts, without duplicating the resize/confirm logic. No-ops
   *  when the preview isn't active. */
  growSize: () => void
  shrinkSize: () => void
  raiseHeight: () => void
  lowerHeight: () => void
  confirmPreview: () => void
  /** `[E]` on an active preparation's marker — starts/resumes its work
   *  session. */
  resumeWork: (id: string) => void
  /** Per-frame progressive-deformation tick for the active work session —
   *  call unconditionally, alongside `tickLodging()`. No-ops when no session
   *  is running. */
  tickWork: () => void
  /** The active `timeSkip` finished naturally — no-ops unless it belongs to
   *  this module's own active work session. */
  onWorkSkipFinished: () => void
  /** Esc — cancels an in-progress preview, or an active work session
   *  (crediting whatever progress was actually made). Same contract as
   *  `RestActions.abortRest`/`abortBusy`. */
  cancelActive: () => boolean
  /** Damage/starvation interrupt (plan §7) — same partial-progress-credit
   *  contract as `cancelActive`'s work-session branch, without the
   *  preview-cancel behavior (a preview blocks nothing, so it isn't
   *  "interrupted" by damage). */
  interruptForDamage: () => boolean
}

export function createTerrainPreparationActions(
  ctx: PlayerActionContext,
  deps: TerrainPreparationActionDeps,
): TerrainPreparationActions {
  const { bundle, player, inventory, mouseLook, keyboard, toast, timeSkip } = ctx
  const { scene, timeSkipOverlay, wheelTarget, blockersNear, showPreview, hidePreview, isOtherPreviewActive } = deps

  const previewMesh: TerrainPreparationPreview = createTerrainPreparationPreview()
  let preview: { size: PreparationSize, heightOffset: number } | null = null
  let wheelAccum = 0
  /** Last footprint actually pushed to `previewMesh` — `setFootprint()`
   *  disposes and recreates geometry, so `tickPreview()` only calls it again
   *  when size/divisions actually changed (implementation notes §11), not
   *  every frame. */
  let lastFootprint: { size: PreparationSize, divisions: number } | null = null

  let activeWork: {
    id: string
    requiredWork: number
    completedWorkAtStart: number
    lastAppliedProgress: number
  } | null = null

  /** Cached result of `tickPreview`'s per-frame validity computation, so a
   *  button-triggered `confirmPreview()` (called outside the tick, e.g. from
   *  a Vue click handler) can reuse the same validity/target data the `[E]`
   *  keyboard path already computed this frame instead of recomputing it. */
  let lastPreviewState: {
    valid: boolean
    reasonLabel: string
    center: GridSample
    targetHeight: number
    originalHeights: readonly HeightSample[]
  } | null = null

  const onWheel = (event: WheelEvent): void => {
    if (!preview) return
    event.preventDefault()
    wheelAccum += event.deltaY
    while (Math.abs(wheelAccum) >= WHEEL_STEP) {
      preview.size = nextSize(preview.size, wheelAccum > 0 ? -1 : 1)
      wheelAccum -= Math.sign(wheelAccum) * WHEEL_STEP
    }
  }

  const digEnv = (): DigEnv => ({
    sampleHeight: bundle.chunkManager.sampleHeight,
    sampleMountainRidge: bundle.chunkManager.sampleMountainRidge,
    waterLevel: bundle.chunkManager.waterLevel,
    seed: bundle.chunkManager.seed,
  })

  const exitPreview = (): void => {
    if (!preview) return
    preview = null
    lastPreviewState = null
    wheelAccum = 0
    mouseLook.state.zoomLocked = false
    wheelTarget.removeEventListener('wheel', onWheel)
    previewMesh.group.removeFromParent()
    hidePreview()
  }

  const startPreview = (): void => {
    if (preview || isOtherPreviewActive() || !inventory.hasCapability('soil_digging') || isActionBlocked(ctx)) return
    preview = { size: 2, heightOffset: 0 }
    mouseLook.state.zoomLocked = true
    wheelTarget.addEventListener('wheel', onWheel, { passive: false })
    scene.add(previewMesh.group)
  }

  const isPreviewActive = (): boolean => preview !== null
  const isWorkActive = (): boolean => activeWork !== null

  const confirmPreparation = (center: GridSample, size: PreparationSize, targetHeight: number, originalHeights: readonly HeightSample[]): void => {
    const area = size * size
    const requiredWork = computeRequiredWork(area, averageAbsHeightDelta(originalHeights, targetHeight))
    const record: TerrainPreparationRecord = {
      id: `terrainPrep:${Date.now()}:${nextPreparationId++}`,
      center,
      size,
      targetHeight,
      originalHeights,
      requiredWork,
      completedWork: 0,
      status: 'active',
    }
    bundle.terrainPreparations.place(record)
    exitPreview()
    toast.show('Rozpoczęto przygotowanie terenu — podejdź do znacznika, by pracować.')
  }

  const growSize = (): void => {
    if (!preview) return
    preview.size = nextSize(preview.size, 1)
  }
  const shrinkSize = (): void => {
    if (!preview) return
    preview.size = nextSize(preview.size, -1)
  }
  const raiseHeight = (): void => {
    if (!preview) return
    preview.heightOffset += HEIGHT_STEP
  }
  const lowerHeight = (): void => {
    if (!preview) return
    preview.heightOffset -= HEIGHT_STEP
  }

  const confirmPreview = (): void => {
    if (!preview || !lastPreviewState) return
    const { valid, reasonLabel, center, targetHeight, originalHeights } = lastPreviewState
    if (!valid) {
      toast.show(reasonLabel || 'Nie można tu przygotować terenu.', 'error')
      return
    }
    confirmPreparation(center, preview.size, targetHeight, originalHeights)
  }

  const tickPreview = (): void => {
    if (!preview) return
    if (isActionBlocked(ctx)) {
      exitPreview()
      return
    }
    if (keyboard.consumePlus()) growSize()
    if (keyboard.consumeMinus()) shrinkSize()
    if (keyboard.consumeComma()) lowerHeight()
    if (keyboard.consumePeriod()) raiseHeight()

    const chunkManager = bundle.chunkManager
    const reach = terrainPrepReach(preview.size)
    const aimX = player.mesh.position.x - Math.sin(mouseLook.state.yaw) * reach
    const aimZ = player.mesh.position.z - Math.cos(mouseLook.state.yaw) * reach
    const { center, samples } = resolvePreparationSamples(aimX, aimZ, preview.size, chunkManager.chunkSize, chunkManager.resolution)
    const centerHeight = chunkManager.sampleHeight(center.x, center.z)
    const targetHeight = centerHeight + preview.heightOffset
    const originalHeights: HeightSample[] = samples.map((s) => ({ x: s.x, z: s.z, height: chunkManager.sampleHeight(s.x, s.z) }))

    const validation = validatePreparationSamples(originalHeights, targetHeight, digEnv())
    let valid = validation.ok
    let reasonLabel = ''
    if (!validation.ok) {
      reasonLabel = validation.reason === 'water' ? 'Zbyt blisko wody.' : `Zbyt duża zmiana wysokości (maks. ${MAX_PREPARATION_DELTA} m).`
    } else if (validation.requiresPickaxe && !inventory.hasCapability('rock_mining')) {
      valid = false
      reasonLabel = 'Skalisty teren wymaga kilofa.'
    } else {
      const placement = evaluateGroundPlacement({
        x: center.x,
        z: center.z,
        sampleHeight: chunkManager.sampleHeight,
        waterLevel: chunkManager.waterLevel,
        blockers: blockersNear(center.x, center.z),
        peers: [],
        footprintRadius: (preview.size * Math.SQRT2) / 2,
        separation: 0,
      })
      if (placement !== 'ok') {
        valid = false
        reasonLabel = placement === 'water' ? 'Zbyt blisko wody.' : placement === 'slope' ? 'Teren jest zbyt stromy.' : 'Za mało miejsca — coś stoi w pobliżu.'
      }
    }

    const divisions = preparationSamplesPerSide(preview.size, chunkManager.chunkSize, chunkManager.resolution) - 1
    if (!lastFootprint || lastFootprint.size !== preview.size || lastFootprint.divisions !== divisions) {
      previewMesh.setFootprint(preview.size, divisions)
      lastFootprint = { size: preview.size, divisions }
    }
    previewMesh.setTransform(center.x, center.z, targetHeight)
    previewMesh.setValid(valid)
    previewMesh.setHeightDeltas(originalHeights.map((s) => Math.abs(targetHeight - s.height)), MAX_PREPARATION_DELTA)
    const sign = preview.heightOffset > 0 ? '+' : ''
    showPreview({
      sizeLabel: `${preview.size}×${preview.size} m`,
      heightLabel: `${sign}${preview.heightOffset.toFixed(2)} m`,
      valid,
      reasonLabel,
    })
    lastPreviewState = { valid, reasonLabel, center, targetHeight, originalHeights }

    if (keyboard.consumeInteract()) confirmPreview()
  }

  const applyWorkProgress = (work: NonNullable<typeof activeWork>, progress: number): void => {
    const entry = bundle.terrainPreparations.find(work.id)
    if (!entry) return
    const clamped = Math.max(0, Math.min(1, progress))
    const completedWork = work.completedWorkAtStart + (work.requiredWork - work.completedWorkAtStart) * clamped
    bundle.terrainPreparations.setCompletedWork(work.id, completedWork)
    const heights = progressiveHeights(entry.originalHeights, entry.targetHeight, completedWork / entry.requiredWork)
    bundle.chunkManager.applyExactHeights(work.id, heights)
  }

  const stopActiveWork = (): void => {
    if (!activeWork) return
    applyWorkProgress(activeWork, timeSkip.progress() ?? activeWork.lastAppliedProgress)
    activeWork = null
    timeSkip.cancel()
    timeSkipOverlay.hide()
  }

  const resumeWork = (id: string): void => {
    if (isActionBlocked(ctx)) return
    const entry = bundle.terrainPreparations.find(id)
    if (!entry) return
    if (!inventory.hasCapability('soil_digging')) {
      toast.show('Potrzebujesz łopaty.', 'error')
      return
    }
    const env = digEnv()
    const requiresPickaxe = entry.originalHeights.some((s) => isRockGround(s.x, s.z, env))
    if (requiresPickaxe && !inventory.hasCapability('rock_mining')) {
      toast.show('Skalisty teren wymaga kilofa.', 'error')
      return
    }
    const remaining = Math.max(0, entry.requiredWork - entry.completedWork)
    if (remaining <= 0) return
    const multiplier = toolSpeedMultiplier(inventory.hasCapability('branch_trimming'), inventory.hasCapability('rock_mining'))
    const hours = remaining / multiplier
    activeWork = { id, requiredWork: entry.requiredWork, completedWorkAtStart: entry.completedWork, lastAppliedProgress: 0 }
    timeSkip.start(hours, { fadeStrength: 0.5, label: 'Przygotowujesz teren…' })
  }

  const tickWork = (): void => {
    if (!activeWork || !timeSkip.isActive()) return
    const progress = timeSkip.progress() ?? 0
    if (progress < 1 && progress - activeWork.lastAppliedProgress < PROGRESS_UPDATE_STEP) return
    activeWork.lastAppliedProgress = progress
    applyWorkProgress(activeWork, progress)
  }

  const onWorkSkipFinished = (): void => {
    if (!activeWork) return
    const work = activeWork
    activeWork = null
    const entry = bundle.terrainPreparations.find(work.id)
    if (!entry) return
    applyWorkProgress(work, 1)
    bundle.terrainPreparations.remove(work.id)
    awardSkillXp(player.skills, 'survival', Math.min(MAX_PREPARATION_XP, Math.round(entry.requiredWork * XP_PER_WORK_HOUR)))
    toast.show('Przygotowanie terenu zakończone.')
  }

  const cancelActive = (): boolean => {
    if (preview) {
      exitPreview()
      return true
    }
    if (activeWork) {
      stopActiveWork()
      return true
    }
    return false
  }

  const interruptForDamage = (): boolean => {
    if (!activeWork) return false
    stopActiveWork()
    return true
  }

  return {
    startPreview,
    isPreviewActive,
    isWorkActive,
    tickPreview,
    growSize,
    shrinkSize,
    raiseHeight,
    lowerHeight,
    confirmPreview,
    resumeWork,
    tickWork,
    onWorkSkipFinished,
    cancelActive,
    interruptForDamage,
  }
}
