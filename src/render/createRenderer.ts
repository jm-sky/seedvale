import * as THREE from 'three'

export function createRenderer(container: HTMLElement): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    // Everything renders through EffectComposer into offscreen targets, where
    // this backbuffer MSAA has no effect (see createPostProcessing.ts — SMAAPass
    // does the actual AA). Multisampling the default framebuffer here is a
    // wasted allocation.
    antialias: false,
    powerPreference: 'high-performance',
  })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 0.95
  container.appendChild(renderer.domElement)
  return renderer
}
