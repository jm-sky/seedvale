import {
  LineBasicMaterial,
  LineSegments,
  Vector3,
} from 'three'
import type { AssetIndexEntry } from '../../../assets/assetIndex'
import { solveAnchorAlignment } from '../../../assets/alignAnchors'
import { createWorldConfig } from '../../../config/worldConfig'
import { createPostProcessing } from '../../../render/createPostProcessing'
import { createRenderer } from '../../../render/createRenderer'
import { browserState } from '../state'
import { gripOverrideForTarget } from '../gripEdit'
import { type AssetSlot, boundsData, createAssetSlot, setWireframe } from './createAssetSlot'
import { createConnectionLine, createMultiView } from './createMultiView'
import { applySceneBackground, createViewerScene } from './createViewerScene'
import {
  applyHeldPreview,
  clearHeldPreviewMount,
  computeHeldPreviewState,
  HELD_SIDE_OFFSET,
} from './mountHeldPreview'
import { buildReportFromScene, findAnchorByName } from './reportFromScene'

export type AssetViewer = {
  reference: AssetSlot
  target: AssetSlot
  loadReference: (entry: AssetIndexEntry | null, url?: string) => Promise<void>
  loadTarget: (entry: AssetIndexEntry | null, url?: string) => Promise<void>
  reloadReference: () => Promise<void>
  reloadTarget: () => Promise<void>
  align: (mode: 'position' | 'frame') => void
  resetTargetTransform: () => void
  setTargetTransform: (t: {
    position?: [number, number, number]
    rotationDeg?: [number, number, number]
    scale?: [number, number, number]
  }) => void
  /** Re-frame cameras from current focus mode / bounds. */
  frame: () => void
  /** Remount in-hand preview (after grip editor changes). */
  remountHeld: () => void
  refresh: () => void
  resize: () => void
  dispose: () => void
  getCanvas: () => HTMLCanvasElement
  updateReport: () => void
}

const _handCenter = new Vector3()


export function createViewer(container: HTMLElement): AssetViewer {
  const renderer = createRenderer(container, 2, { preserveDrawingBuffer: true })
  const canvas = renderer.domElement
  canvas.style.width = '100%'
  canvas.style.height = '100%'

  const { scene, world, ground, grid, axes, lighting } = createViewerScene()
  const reference = createAssetSlot('reference', world)
  const target = createAssetSlot('target', world)
  target.group.position.x = HELD_SIDE_OFFSET

  const refreshHeldPreview = () => {
    reference.setPose(browserState.pose === 'idle' ? 'idle' : 'rest')
    const override = gripOverrideForTarget(target.entry?.id ?? null)
    const state = applyHeldPreview(reference, target, override)
    if (state.mode === 'in-hand') {
      browserState.statusMessage = override
        ? 'In-hand preview (grip editor override)'
        : (state.reason ?? 'In-hand preview (game mount)')
    } else if (state.reason) {
      browserState.statusMessage = state.reason
    }
  }

  const multi = createMultiView(container, renderer, 1)
  let layout: 'quad' | 'single' = 'quad'
  let activeView = 0
  let dirty = true
  let connectionLine: LineSegments | null = null
  let composer: ReturnType<typeof createPostProcessing> | null = null
  let animating = false

  const markDirty = () => { dirty = true }
  container.addEventListener('viewer-dirty', markDirty)

  const refreshConnection = () => {
    if (connectionLine) {
      world.remove(connectionLine)
      connectionLine.geometry.dispose()
      ;(connectionLine.material as LineBasicMaterial).dispose()
      connectionLine = null
    }
    const refA = findAnchorByName(reference, browserState.referenceAnchor)
    const tgtA = findAnchorByName(target, browserState.targetAnchor)
      ?? findAnchorByName(reference, browserState.targetAnchor)
    if (refA && tgtA) {
      connectionLine = createConnectionLine(refA.worldMatrix, tgtA.worldMatrix)
      world.add(connectionLine)
    }
  }

  const applyEnvironment = () => {
    applySceneBackground(scene, browserState.background)
    ground.visible = browserState.showGround
    grid.visible = browserState.showGrid
    axes.visible = browserState.showAxes
    if (reference.bboxHelper) reference.bboxHelper.visible = browserState.showBbox
    if (target.bboxHelper) target.bboxHelper.visible = browserState.showBbox
    setWireframe(reference.model, browserState.wireframe)
    setWireframe(target.model, browserState.wireframe)

    const handAnchor = reference.anchors.find((a) => a.def.name === 'hand.right')
    lighting.apply({
      mode: browserState.renderMode,
      preset: browserState.lightingPreset,
      timeOfDay: browserState.timeOfDay,
      torchFuelRatio: browserState.torchFuelRatio,
      torchAnchorWorld: handAnchor?.worldMatrix ?? null,
    })
  }

  const updateReport = () => {
    reference.refreshAnchors()
    target.refreshAnchors()
    refreshConnection()
    browserState.reportText = buildReportFromScene({
      state: browserState,
      reference,
      target,
      composerActive: !!(composer && layout === 'single' && browserState.renderMode === 'game-like'),
      invalidSelection: browserState.invalidSelection,
    })
  }

  const render = () => {
    layout = browserState.layout
    activeView = browserState.activeView
    applyEnvironment()
    reference.setPose(browserState.pose === 'idle' ? 'idle' : 'rest')
    target.setPose(browserState.pose === 'idle' ? 'idle' : 'rest')
    reference.refreshAnchors()
    target.refreshAnchors()
    refreshConnection()
    updateReport()

    const w = container.clientWidth
    const h = container.clientHeight
    renderer.setSize(w, h, false)
    multi.resize(w, h)

    const views = layout === 'single'
      ? [multi.views[activeView]!]
      : multi.views

    const useComposer = layout === 'single' && browserState.renderMode === 'game-like'

    if (useComposer && !composer) {
      composer = createPostProcessing(
        renderer,
        scene,
        views[0]!.camera,
        w,
        h,
        createWorldConfig().postProcessing,
      )
    }
    if (!useComposer && composer) {
      composer.dispose()
      composer = null
    }

    renderer.setScissorTest(true)
    for (const view of views) {
      renderer.setViewport(view.x, view.y, view.w, view.h)
      renderer.setScissor(view.x, view.y, view.w, view.h)
      view.controls.update()
      if (composer && view === views[0]) {
        composer.render()
      } else {
        renderer.render(scene, view.camera)
      }
    }
    renderer.setScissorTest(false)
    if (dirty || animating) dirty = false
  }

  const loop = () => {
    animating = browserState.lightingPreset === 'torch'
    render()
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)

  const frameScene = () => {
    reference.refreshAnchors()
    target.refreshAnchors()
    const held = computeHeldPreviewState(reference, target)

    if (browserState.focus === 'hand') {
      const hand = findAnchorByName(reference, 'hand.right')
        ?? findAnchorByName(reference, browserState.referenceAnchor)
      if (hand) {
        // Lock framing on the hand socket — do not expand/re-center to the
        // (possibly badly offset) tool bbox, or grip screenshots zoom out.
        _handCenter.setFromMatrixPosition(hand.worldMatrix)
        const radius = browserState.focusRadius ?? 0.28
        multi.frameTargets({ center: _handCenter.clone(), radius })
        markDirty()
        return
      }
    }

    const box = held.mode === 'in-hand'
      ? reference.getBounds()
      : (target.getBounds() ?? reference.getBounds())
    if (!box) return
    const center = new Vector3()
    box.getCenter(center)
    const size = new Vector3()
    box.getSize(size)
    const radius = browserState.focusRadius ?? size.length() * 0.5
    multi.frameTargets({ center, radius })
    markDirty()
  }

  return {
    reference,
    target,
    async loadReference(entry, url) {
      clearHeldPreviewMount(target)
      await reference.load(entry, url)
      refreshHeldPreview()
      frameScene()
      markDirty()
    },
    async loadTarget(entry, url) {
      clearHeldPreviewMount(target)
      await target.load(entry, url)
      refreshHeldPreview()
      frameScene()
      markDirty()
    },
    async reloadReference() {
      const prevRef = browserState.referenceAnchor
      const prevTgt = browserState.targetAnchor
      clearHeldPreviewMount(target)
      await reference.reload()
      validateSelections(prevRef, prevTgt)
      refreshHeldPreview()
      if (browserState.resetTransformOnReload && computeHeldPreviewState(reference, target).mode !== 'in-hand') {
        target.group.position.set(HELD_SIDE_OFFSET, 0, 0)
      }
      markDirty()
    },
    async reloadTarget() {
      const prevRef = browserState.referenceAnchor
      const prevTgt = browserState.targetAnchor
      clearHeldPreviewMount(target)
      await target.reload()
      validateSelections(prevRef, prevTgt)
      refreshHeldPreview()
      if (browserState.resetTransformOnReload && computeHeldPreviewState(reference, target).mode !== 'in-hand') {
        target.group.position.set(HELD_SIDE_OFFSET, 0, 0)
      }
      markDirty()
    },
    align(mode) {
      const refA = findAnchorByName(reference, browserState.referenceAnchor)
      const tgtA = findAnchorByName(target, browserState.targetAnchor)
      if (!refA || !tgtA) return
      const solved = solveAnchorAlignment({
        referenceAnchorWorld: refA.worldMatrix,
        targetAnchorLocal: tgtA.localMatrix,
        targetRoot: {
          position: target.group.position,
          quaternion: target.group.quaternion,
          scale: target.group.scale,
        },
        mode,
      })
      target.group.position.copy(solved.position)
      target.group.quaternion.copy(solved.quaternion)
      markDirty()
    },
    resetTargetTransform() {
      clearHeldPreviewMount(target)
      target.group.position.set(HELD_SIDE_OFFSET, 0, 0)
      target.group.rotation.set(0, 0, 0)
      target.group.scale.set(1, 1, 1)
      refreshHeldPreview()
      markDirty()
    },
    setTargetTransform(t) {
      if (t.position) target.group.position.set(...t.position)
      if (t.rotationDeg) {
        target.group.rotation.set(
          t.rotationDeg[0] * Math.PI / 180,
          t.rotationDeg[1] * Math.PI / 180,
          t.rotationDeg[2] * Math.PI / 180,
        )
      }
      if (t.scale) target.group.scale.set(...t.scale)
      markDirty()
    },
    frame: frameScene,
    remountHeld() {
      refreshHeldPreview()
      frameScene()
      markDirty()
    },
    refresh: markDirty,
    resize: () => { markDirty() },
    dispose() {
      clearHeldPreviewMount(target)
      reference.dispose()
      target.dispose()
      multi.dispose()
      composer?.dispose()
      lighting.dispose()
      renderer.dispose()
    },
    getCanvas: () => canvas,
    updateReport,
  }

  function validateSelections(prevRef: string | null, prevTgt: string | null) {
    browserState.invalidSelection = null
    if (prevRef && !reference.anchors.some((a) => a.def.name === prevRef)) {
      browserState.invalidSelection = `reference anchor "${prevRef}"`
    } else if (prevTgt) {
      const inTarget = target.anchors.some((a) => a.def.name === prevTgt)
      const inRef = reference.anchors.some((a) => a.def.name === prevTgt)
      if (!inTarget && !inRef) {
        browserState.invalidSelection = `target anchor "${prevTgt}"`
      }
    }
  }
}

export function syncDiagnostics(reference: AssetSlot, target: AssetSlot): void {
  // populated by Vue layer via slotDiagnostics in state.ts
  void reference
  void target
  void boundsData
}
