import type { PerspectiveCamera, Scene, WebGLRenderer } from 'three'

export type CameraDebugSnapshot = {
  camera: PerspectiveCamera
  renderer: WebGLRenderer
  scene: Scene
  sampleHeight: (x: number, z: number) => number
  contextLost: boolean
  /** Most recent black-frame-relevant events (context loss, invalid viewport/
   *  camera state), newest last. Kept by the caller so a blink that happens
   *  between two 250ms overlay refreshes is still visible afterward — a live
   *  snapshot alone would miss anything shorter than the throttle window. */
  events: readonly string[]
  /** `?debugRenderState=1` diagnostic block (see `renderStateDebug.ts`), or
   *  `null` when the flag is off. Pre-formatted by the caller — this overlay
   *  just appends it verbatim. */
  renderStateText: string | null
}

export type CameraDebugOverlay = {
  update: (snapshot: CameraDebugSnapshot) => void
  dispose: () => void
}

/** URL-gated (`?camdebug=1`) readout — not mounted in normal play. */
export function createCameraDebugOverlay(parent: HTMLElement): CameraDebugOverlay {
  const el = document.createElement('pre')
  el.style.cssText = [
    'position:absolute',
    'left:8px',
    'bottom:96px',
    'z-index:6',
    'margin:0',
    'padding:8px 10px',
    'max-width:min(360px, 92vw)',
    'background:rgba(8,12,16,0.72)',
    'color:#d7e4ef',
    'font:11px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace',
    'white-space:pre-wrap',
    'pointer-events:none',
    'border-radius:6px',
  ].join(';')
  parent.appendChild(el)

  let age = 0
  let lastText = ''
  let lastMs = performance.now()
  let lastGlError = 'NONE'

  const update = (snapshot: CameraDebugSnapshot): void => {
    const now = performance.now()
    age += now - lastMs
    lastMs = now
    if (age < 250 && lastText !== '') return
    age = 0

    const { camera, renderer, scene, sampleHeight, contextLost, events, renderStateText } = snapshot
    const gl = renderer.getContext()
    const err = gl.getError()
    if (err !== gl.NO_ERROR) lastGlError = String(err)
    else if (!contextLost) lastGlError = 'NONE'

    const groundY = sampleHeight(camera.position.x, camera.position.z)
    const buried = camera.position.y < groundY
    const info = renderer.info.render
    const text = [
      'camdebug',
      `pos  ${fmt(camera.position.x)} ${fmt(camera.position.y)} ${fmt(camera.position.z)}`,
      `rot  ${fmt(camera.rotation.x)} ${fmt(camera.rotation.y)} ${fmt(camera.rotation.z)}`,
      `clip near=${camera.near} far=${camera.far} aspect=${fmt(camera.aspect)}`,
      `terrainY ${fmt(groundY)}  cam-ground ${fmt(camera.position.y - groundY)}${buried ? '  BURIED' : ''}`,
      `scene ${countObjects(scene)}  visibleMeshes ${countVisibleMeshes(scene)}  calls ${info.calls}  tris ${info.triangles}`,
      `dpr ${fmt(renderer.getPixelRatio())}  size ${renderer.domElement.width}x${renderer.domElement.height}`,
      `gl error ${lastGlError}  contextLost ${contextLost || gl.isContextLost()}`,
      events.length > 0 ? `events:\n${events.join('\n')}` : 'events: (none)',
      ...(renderStateText ? ['', renderStateText] : []),
    ].join('\n')
    if (text !== lastText) {
      lastText = text
      el.textContent = text
    }
  }

  return {
    update,
    dispose: () => { el.remove() },
  }
}

function fmt(n: number): string {
  return n.toFixed(2)
}

function countObjects(scene: Scene): number {
  let n = 0
  scene.traverse(() => { n++ })
  return n
}

// Cheap visible-mesh count in the base overlay (not gated behind
// `?debugRenderState=1`) — useful on its own for perf/mobile checks, e.g.
// combined with `?debugDisableSystems=` to see how much a category costs.
function countVisibleMeshes(scene: Scene): number {
  let n = 0
  scene.traverseVisible((obj) => {
    if ((obj as { isMesh?: boolean }).isMesh) n++
  })
  return n
}
