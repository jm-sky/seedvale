import { N8AOPass } from 'n8ao'
import { MathUtils, Vector2, Vector3 } from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import type { WorldConfig } from '../config/worldConfig'
import { FilmGradeShader } from './filmGradeShader'
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

/** Facing-dot range for god-ray intensity. Full strength only when looking
 *  fairly toward the sun — the old (−0.15…0.15) cone went full-blast across
 *  most of the forward hemisphere and washed third-person views (issue 016). */
const GOD_RAYS_FACING_START = 0.25
const GOD_RAYS_FACING_FULL = 0.65
/** Soft UV margin: fade rays as the projected sun leaves the frame. */
const GOD_RAYS_SCREEN_IN = 0.05
const GOD_RAYS_SCREEN_OUT = 0.12

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

  const bloomPass = new UnrealBloomPass(new Vector2(width, height), 0.28, 0.35, 0.92)
  composer.addPass(bloomPass)

  const godRaysPass = new ShaderPass(GodRaysShader)
  composer.addPass(godRaysPass)

  const outputPass = new OutputPass()
  composer.addPass(outputPass)

  // After tone mapping / output encoding — grades display color and dithers
  // 8-bit banding (sky, fog). See plan 066.
  const filmGradePass = new ShaderPass(FilmGradeShader)
  composer.addPass(filmGradePass)

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
      // Require looking fairly toward the sun — soft fade, no hard pop.
      intensity *= MathUtils.smoothstep(facing, GOD_RAYS_FACING_START, GOD_RAYS_FACING_FULL)
    }

    if (intensity <= 0) {
      godRaysPass.uniforms.intensity!.value = 0
      return
    }

    sunWorld.copy(cam.position).addScaledVector(sunDirection, 500)
    ndc.copy(sunWorld).project(cam)
    const lightPos = godRaysPass.uniforms.lightPosition!.value as Vector2
    lightPos.set((ndc.x + 1) / 2, (ndc.y + 1) / 2)

    // Softly kill rays when the sun is off-screen (old code kept full
    // intensity with lightPosition outside [0,1], smearing sky across the
    // frame from an off-frame target — issue 016).
    const lx = lightPos.x
    const ly = lightPos.y
    const screenFade =
      MathUtils.smoothstep(lx, -GOD_RAYS_SCREEN_OUT, GOD_RAYS_SCREEN_IN) *
      (1 - MathUtils.smoothstep(lx, 1 - GOD_RAYS_SCREEN_IN, 1 + GOD_RAYS_SCREEN_OUT)) *
      MathUtils.smoothstep(ly, -GOD_RAYS_SCREEN_OUT, GOD_RAYS_SCREEN_IN) *
      (1 - MathUtils.smoothstep(ly, 1 - GOD_RAYS_SCREEN_IN, 1 + GOD_RAYS_SCREEN_OUT))
    intensity *= screenFade

    godRaysPass.uniforms.intensity!.value = intensity
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
      filmGradePass.dispose()
      composer.dispose()
    },
  }
}
