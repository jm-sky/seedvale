import * as THREE from 'three'

/** `pixelRatioCap` is `WorldConfig['postProcessing']['pixelRatioCap']` — the
 *  GUI's render-scale quality knob (perf review A3.2). Defaults to 2, the
 *  previous hardcoded value, if the caller doesn't pass one. */
export function createRenderer(
  container: HTMLElement,
  pixelRatioCap = 2,
  options: { preserveDrawingBuffer?: boolean } = {},
): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    // Everything renders through EffectComposer into offscreen targets, where
    // this backbuffer MSAA has no effect (see createPostProcessing.ts — SMAAPass
    // does the actual AA). Multisampling the default framebuffer here is a
    // wasted allocation.
    antialias: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap))
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  // Slightly under 1 — midday sky + hemi easily clip to a white dome otherwise.
  renderer.toneMappingExposure = 0.88
  container.appendChild(renderer.domElement)
  return renderer
}
