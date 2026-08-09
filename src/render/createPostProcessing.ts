import { N8AOPass } from 'n8ao'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js'
import type { WorldConfig } from '../config/worldConfig'
import type { Camera, Scene, WebGLRenderer } from 'three'

export type PostProcessing = {
  render: () => void
  setSize: (width: number, height: number) => void
  applyAoConfig: (ao: WorldConfig['postProcessing']) => void
  dispose: () => void
}

/** EffectComposer + N8AO (GTAO-based ambient occlusion) + SMAA, replacing the
 *  direct `renderer.render(scene, camera)` call. SMAA is needed because the
 *  renderer's hardware antialiasing only covers the default framebuffer — once
 *  we render into the composer's offscreen targets that AA is lost.
 *  `gammaCorrection` on the AO pass is disabled because `OutputPass` (last in
 *  the chain) is what applies the renderer's tone mapping + output color space
 *  exactly once; leaving both on would double-correct. */
export function createPostProcessing(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  width: number,
  height: number,
  ao: WorldConfig['postProcessing'],
): PostProcessing {
  const composer = new EffectComposer(renderer)

  // N8AOPass renders the scene itself, so it doubles as the chain's render
  // pass — but `EffectComposer` skips disabled passes entirely, which meant
  // turning AO off left nothing drawing the scene at all (empty sky-coloured
  // frame). This RenderPass is the fallback for that case: enabled only while
  // AO is off, so the scene is never rendered twice.
  const renderPass = new RenderPass(scene, camera)
  renderPass.enabled = !ao.aoEnabled
  composer.addPass(renderPass)

  const aoPass = new N8AOPass(scene, camera, width, height)
  aoPass.configuration.gammaCorrection = false
  composer.addPass(aoPass)

  const smaaPass = new SMAAPass()
  composer.addPass(smaaPass)

  const outputPass = new OutputPass()
  composer.addPass(outputPass)

  function applyAoConfig(config: WorldConfig['postProcessing']): void {
    aoPass.enabled = config.aoEnabled
    renderPass.enabled = !config.aoEnabled
    aoPass.setQualityMode(config.aoQuality)
    aoPass.configuration.aoRadius = config.aoRadius
    aoPass.configuration.intensity = config.aoIntensity
  }
  applyAoConfig(ao)

  return {
    render: () => composer.render(),
    setSize: (w, h) => composer.setSize(w, h),
    applyAoConfig,
    dispose: () => {
      aoPass.dispose()
      smaaPass.dispose()
      outputPass.dispose()
      composer.dispose()
    },
  }
}
