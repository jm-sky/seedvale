import type { PostProcessing } from '../render/createPostProcessing'
import { createCameraDebugOverlay } from '../debug/createCameraDebugOverlay'
import { isCameraDebugMode, isRenderStateDebugMode } from '../debug/debugMode'
import { getRenderStateDebugText } from '../debug/renderStateDebug'
import { MIN_RENDERER_SIZE, shouldApplyRendererResize } from '../render/rendererResize'
import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three'
import type { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js'

/** Sticky event-log depth for the `?camdebug=1` overlay — a live snapshot
 *  alone misses anything shorter than its 250 ms refresh, which is exactly the
 *  failure mode we're trying to diagnose (issue 032: sporadic black-world
 *  blinks). */
const MAX_DEBUG_EVENTS = 6

/** The browser-facing frame driver around `GameLoop.tick()`: `requestAnimationFrame`
 *  scheduling, viewport/DPR resizing (including the mobile visual-viewport and
 *  orientation cases), WebGL context loss/restore, and the optional camera
 *  debug overlay. It owns no simulation state — `gameLoop.ts` still does one
 *  frame's worth of work per `onTick`. */
export type AppRenderLoop = {
  /** Starts the `requestAnimationFrame` chain. */
  start: () => void
  dispose: () => void
}

export type AppRenderLoopDeps = {
  container: HTMLElement
  renderer: WebGLRenderer
  labelRenderer: CSS2DRenderer
  postProcessing: PostProcessing
  camera: PerspectiveCamera
  scene: Scene
  /** Terrain sampler for the camera debug overlay — read through the live
   *  bundle, never captured, so it survives a world rebuild. */
  sampleHeight: (x: number, z: number) => number
  /** One frame of simulation + render. */
  onTick: () => void
}

export function createAppRenderLoop(deps: AppRenderLoopDeps): AppRenderLoop {
  const { container, renderer, labelRenderer, postProcessing, camera, scene } = deps

  let frameId = 0
  let lastViewportWidth = -1
  let lastViewportHeight = -1
  let resizeScheduled = false
  let webglContextLost = false
  let contextLostAt: number | null = null
  let lastCameraStateInvalid = false

  const cameraDebug = isCameraDebugMode() ? createCameraDebugOverlay(container) : null
  // No-op (never allocated/pushed to) when cameraDebug is null.
  const debugEvents: string[] = []
  const pushDebugEvent = (label: string): void => {
    if (!cameraDebug) return
    const t = (performance.now() / 1000).toFixed(1)
    debugEvents.push(`[${t}s] ${label}`)
    if (debugEvents.length > MAX_DEBUG_EVENTS) debugEvents.shift()
  }

  // Issue 032 follow-up: EffectComposer + N8AO + UnrealBloomPass allocate ~15
  // HalfFloatType/FloatType render targets. Rendering into them needs
  // EXT_color_buffer_half_float / EXT_color_buffer_float; without it a mobile
  // driver can leave the framebuffer incomplete (or silently downgrade the
  // attachment) with no WebGL API error and no context loss — matching the
  // reported symptom (black 3D canvas, UI intact, `gl error NONE`,
  // `contextLost false`). Logged once so the next repro's `events:` section
  // can confirm or rule this out.
  if (cameraDebug) {
    const halfFloatRt = renderer.extensions.has('EXT_color_buffer_half_float')
    const floatRt = renderer.extensions.has('EXT_color_buffer_float')
    pushDebugEvent(`float RT support: half=${halfFloatRt} full=${floatRt}`)
  }

  const applyViewportSize = (force = false) => {
    let width = container.clientWidth
    let height = container.clientHeight
    if (width < MIN_RENDERER_SIZE || height < MIN_RENDERER_SIZE) {
      pushDebugEvent(`invalid viewport ${width}x${height} (force=${force})`)
      if (!force || lastViewportWidth < MIN_RENDERER_SIZE) return
      width = lastViewportWidth
      height = lastViewportHeight
    }
    if (!force && !shouldApplyRendererResize(width, height, lastViewportWidth, lastViewportHeight)) {
      return
    }
    lastViewportWidth = Math.round(width)
    lastViewportHeight = Math.round(height)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    renderer.setSize(width, height)
    labelRenderer.setSize(width, height)
    postProcessing.setSize(width, height)
  }

  const requestResize = () => {
    if (resizeScheduled) return
    resizeScheduled = true
    requestAnimationFrame(() => {
      resizeScheduled = false
      applyViewportSize()
    })
  }
  window.addEventListener('resize', requestResize)
  // Mobile browsers resize the *visual* viewport (address bar show/hide,
  // on-screen keyboard) without always firing a plain window 'resize' — and
  // orientation changes on some Android WebViews fire neither reliably.
  // Covering both keeps the canvas from getting stuck at a stale size
  // (reported: Chrome mobile rendering only into half the screen width after
  // the initial address-bar layout settled).
  // Coalesce + skip 0-size blips: visualViewport fires continuously while the
  // address bar animates, and a 0-height composer target reads as a black
  // world while the DOM UI keeps working.
  window.addEventListener('orientationchange', requestResize)
  window.visualViewport?.addEventListener('resize', requestResize)
  const onOrientationSettled = () => { window.setTimeout(requestResize, 250) }
  window.addEventListener('orientationchange', onOrientationSettled)
  // Defensive re-measure a couple frames after first paint, in case the very
  // first `container.clientWidth/clientHeight` read (used above to size the
  // renderer/camera) happened before the mobile browser's chrome/address-bar
  // layout had fully settled.
  requestAnimationFrame(() => requestAnimationFrame(requestResize))

  const canvas = renderer.domElement
  const onWebglContextLost = () => {
    webglContextLost = true
    contextLostAt = performance.now()
    pushDebugEvent('contextLost')
    console.warn('[renderer] WebGL context lost')
  }
  const onWebglContextRestored = () => {
    webglContextLost = false
    const durationMs = contextLostAt !== null ? performance.now() - contextLostAt : -1
    contextLostAt = null
    pushDebugEvent(`contextRestored after ${durationMs.toFixed(0)}ms`)
    console.warn(`[renderer] WebGL context restored after ${durationMs.toFixed(0)}ms — reallocating composer targets`)
    applyViewportSize(true)
  }
  canvas.addEventListener('webglcontextlost', onWebglContextLost)
  canvas.addEventListener('webglcontextrestored', onWebglContextRestored)

  const tick = () => {
    frameId = requestAnimationFrame(tick)
    deps.onTick()
    if (cameraDebug) {
      const posFinite =
        Number.isFinite(camera.position.x) &&
        Number.isFinite(camera.position.y) &&
        Number.isFinite(camera.position.z)
      const aspectFinite = Number.isFinite(camera.aspect) && camera.aspect > 0
      const invalid = !posFinite || !aspectFinite
      if (invalid && !lastCameraStateInvalid) {
        pushDebugEvent(
          `camera invalid: pos=(${camera.position.x},${camera.position.y},${camera.position.z}) aspect=${camera.aspect}`,
        )
      }
      lastCameraStateInvalid = invalid
      cameraDebug.update({
        camera,
        renderer,
        scene,
        sampleHeight: (x, z) => deps.sampleHeight(x, z),
        contextLost: webglContextLost,
        events: debugEvents,
        renderStateText: isRenderStateDebugMode() ? getRenderStateDebugText() : null,
      })
    }
  }

  return {
    start: tick,
    dispose: () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', requestResize)
      window.removeEventListener('orientationchange', requestResize)
      window.removeEventListener('orientationchange', onOrientationSettled)
      window.visualViewport?.removeEventListener('resize', requestResize)
      canvas.removeEventListener('webglcontextlost', onWebglContextLost)
      canvas.removeEventListener('webglcontextrestored', onWebglContextRestored)
      cameraDebug?.dispose()
    },
  }
}
