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
  renderer.debug.checkShaderErrors = false // Disable shader error checking (docs/research/2026-08-16--012--streaming-hitch-trace-v2-linkprogram-wait.md)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioCap))
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.shadowMap.enabled = true
  // PCFSoftShadowMap is deprecated as of r182 — PCFShadowMap is now soft too.
  renderer.shadowMap.type = THREE.PCFShadowMap
  // EffectComposer / N8AO / the water mirror each call `renderer.render()`.
  // Default `autoReset` zeroes `info.render` at the start of every one of
  // those, so a post-frame read only saw the last fullscreen blit (calls=1).
  // Reset explicitly once per game frame instead (see `gameLoop.ts`).
  renderer.info.autoReset = false
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  // Slightly under 1 — midday sky + hemi easily clip to a white dome otherwise.
  renderer.toneMappingExposure = 0.88
  container.appendChild(renderer.domElement)
  return renderer
}
