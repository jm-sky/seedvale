import { N8AOPass } from 'n8ao'
import { MathUtils, Vector2, Vector3 } from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import type { WorldConfig } from '../config/worldConfig'
import { GodRaysShader } from './godRaysShader'
import type { Camera, Scene, WebGLRenderer } from 'three'

export type PostProcessing = {
  render: () => void
  setSize: (width: number, height: number) => void
  applyConfig: (config: WorldConfig['postProcessing']) => void
  /** Sun screen-projection + camera-facing fade change every frame (camera
   *  moves even while `timeOfDay` doesn't), so this runs outside the
   *  throttled day/night apply — unlike `applyConfig` it's not GUI-driven. */
  updateGodRays: (camera: Camera, sunDirection: Vector3, elev: number) => void
  dispose: () => void
}

const GOD_RAYS_FACING_MARGIN = 0.15

/** EffectComposer + N8AO (GTAO-based ambient occlusion) + SMAA, replacing the
 *  direct `renderer.render(scene, camera)` call. SMAA is needed because the
 *  renderer's hardware antialiasing only covers the default framebuffer — once
 *  we render into the composer's offscreen targets that AA is lost.
 *  `gammaCorrection` on the AO pass is disabled because `OutputPass` (last in
 *  the chain) is what applies the renderer's tone mapping + output color space
 *  exactly once; leaving both on would double-correct. Bloom and god rays sit
 *  between SMAA and OutputPass, i.e. still on linear, not-yet-tonemapped
 *  color — the usual place for bloom, so highlights blow out realistically
 *  once ACES compresses them rather than blooming already-clipped output. */
export function createPostProcessing(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  width: number,
  height: number,
  config: WorldConfig['postProcessing'],
): PostProcessing {
  const composer = new EffectComposer(renderer)

  // N8AOPass renders the scene itself, so it doubles as the chain's render
  // pass — but `EffectComposer` skips disabled passes entirely, which meant
  // turning AO off left nothing drawing the scene at all (empty sky-coloured
  // frame). This RenderPass is the fallback for that case: enabled only while
  // AO is off, so the scene is never rendered twice.
  const renderPass = new RenderPass(scene, camera)
  renderPass.enabled = !config.aoEnabled
  composer.addPass(renderPass)

  const aoPass = new N8AOPass(scene, camera, width, height)
  aoPass.configuration.gammaCorrection = false
  composer.addPass(aoPass)

  const smaaPass = new SMAAPass()
  composer.addPass(smaaPass)

  const bloomPass = new UnrealBloomPass(new Vector2(width, height), 0.4, 0.4, 0.85)
  composer.addPass(bloomPass)

  const godRaysPass = new ShaderPass(GodRaysShader)
  composer.addPass(godRaysPass)

  const outputPass = new OutputPass()
  composer.addPass(outputPass)

  function applyConfig(next: WorldConfig['postProcessing']): void {
    aoPass.enabled = next.aoEnabled
    renderPass.enabled = !next.aoEnabled
    aoPass.setQualityMode(next.aoQuality)
    aoPass.configuration.aoRadius = next.aoRadius
    aoPass.configuration.intensity = next.aoIntensity

    bloomPass.enabled = next.bloomEnabled
    bloomPass.strength = next.bloomStrength
    bloomPass.radius = next.bloomRadius
    bloomPass.threshold = next.bloomThreshold

    godRaysPass.enabled = next.godRaysEnabled
    godRaysPass.uniforms.exposure!.value = next.godRaysExposure
  }
  applyConfig(config)

  // Reused across frames — avoids allocating a Vector3 every call.
  const sunWorld = new Vector3()
  const forward = new Vector3()
  const ndc = new Vector3()

  function updateGodRays(cam: Camera, sunDirection: Vector3, elev: number): void {
    if (!godRaysPass.enabled) return

    // Fades in just above the horizon, peaks at a low sun angle, fades out
    // well before noon — "mainly at dawn/dusk" per the plan, not all day.
    const fadeIn = MathUtils.smoothstep(elev, 0, 0.08)
    const fadeOut = 1 - MathUtils.smoothstep(elev, 0.12, 0.5)
    let intensity = MathUtils.clamp(fadeIn * fadeOut, 0, 1)

    if (intensity > 0) {
      cam.getWorldDirection(forward)
      const facing = forward.dot(sunDirection)
      // Fade out (rather than hard-cut) as the sun approaches the edge of
      // view/behind the camera — a hard cutoff would pop when turning.
      intensity *= MathUtils.smoothstep(facing, -GOD_RAYS_FACING_MARGIN, GOD_RAYS_FACING_MARGIN)
    }

    godRaysPass.uniforms.intensity!.value = intensity
    if (intensity <= 0) return

    sunWorld.copy(cam.position).addScaledVector(sunDirection, 500)
    ndc.copy(sunWorld).project(cam)
    const lightPos = godRaysPass.uniforms.lightPosition!.value as Vector2
    lightPos.set((ndc.x + 1) / 2, (ndc.y + 1) / 2)
  }

  return {
    render: () => composer.render(),
    setSize: (w, h) => composer.setSize(w, h),
    applyConfig,
    updateGodRays,
    dispose: () => {
      aoPass.dispose()
      smaaPass.dispose()
      bloomPass.dispose()
      godRaysPass.dispose()
      outputPass.dispose()
      composer.dispose()
    },
  }
}
