import { N8AOPass } from 'n8ao'
import { MathUtils, Vector2, Vector3 } from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import type { WorldConfig } from '../config/worldConfig'
import { shouldSuppressAo } from './aoBudget'
import { GodRaysShader } from './godRaysShader'
import { createGradedOutputPass } from './gradedOutputPass'
import type { Camera, Scene, WebGLRenderer } from 'three'

export type PostPassId = 'ao' | 'bloom' | 'smaa' | 'godRays' | 'filmGrade'

export type PostProcessing = {
  render: () => void
  setSize: (width: number, height: number) => void
  /** Mirrors `renderer.setPixelRatio` — must be called with the same value so
   *  the composer's offscreen targets stay the same size as the renderer's
   *  drawing buffer (perf review A3.2). */
  setPixelRatio: (pixelRatio: number) => void
  applyConfig: (config: WorldConfig['postProcessing']) => void
  /** Auto-budget N8AO from last frame's Render ms (plan 113 P0). No-op when
   *  the user already has AO off. */
  applyFrameBudget: (renderMs: number) => void
  /** Isolation-probe toggle. `applyConfig` restores the user/preset state. */
  setPassEnabled: (pass: PostPassId, enabled: boolean) => void
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
  // Half-res AO is a large GPU win with little visible loss at Seedvale's
  // scale (dense grass + soft lighting). Full-res remains available by
  // flipping this if quality tuning needs it.
  aoPass.configuration.halfRes = true
  aoPass.configuration.depthAwareUpsampling = true
  composer.addPass(aoPass)

  const smaaPass = new SMAAPass()
  composer.addPass(smaaPass)

  const bloomPass = new UnrealBloomPass(new Vector2(width / 2, height / 2), 0.28, 0.35, 0.92)
  // Bloom is a low-frequency effect by construction (5-level mip blur chain) —
  // running its whole chain at half the composer's resolution is not
  // perceptible but halves the pixel count through every blur pass (perf
  // review A3.3). `EffectComposer.setSize`/`addPass` always call a pass's own
  // `setSize` with the *full* composer resolution, so the halving has to be
  // applied here rather than by just picking a smaller constructor argument
  // (which only sets the initial size, not what survives a resize).
  const bloomPassSetSize = bloomPass.setSize.bind(bloomPass)
  bloomPass.setSize = (w, h) => bloomPassSetSize(w / 2, h / 2)
  composer.addPass(bloomPass)

  const godRaysPass = new ShaderPass(GodRaysShader)
  composer.addPass(godRaysPass)

  // Tone mapping / output encoding, then (folded into the same pass — see
  // gradedOutputPass.ts / perf review A3.1) the film grade + dither that used
  // to be its own `ShaderPass` after this one. Plan 066 originally added the
  // grade as a separate pass; A3.1 merges it in without changing the result.
  const outputPass = createGradedOutputPass()
  composer.addPass(outputPass)
  const filmGradeUniform = outputPass.uniforms.filmGradeIntensity as { value: number }

  let aoWanted = config.aoEnabled
  aoWanted = false // TEMP: isolation

  let aoSuppressed = false
  // 0 reads as "unbounded time since last change," so the first real check
  // in applyFrameBudget is never held back by the min-stable-time floor.
  let aoSuppressedChangedAt = 0

  function syncAoPass(): void {
    const aoOn = aoWanted && !aoSuppressed
    aoPass.enabled = aoOn
    renderPass.enabled = !aoOn
  }

  function applyConfig(next: WorldConfig['postProcessing']): void {
    aoWanted = false // TEMP: isolation — disable N8AO
    aoSuppressed = false
    aoSuppressedChangedAt = 0
    syncAoPass()
    aoPass.setQualityMode(next.aoQuality)
    aoPass.configuration.aoRadius = next.aoRadius
    aoPass.configuration.intensity = next.aoIntensity

    bloomPass.enabled = next.bloomEnabled
    bloomPass.strength = next.bloomStrength
    bloomPass.radius = next.bloomRadius
    bloomPass.threshold = next.bloomThreshold

    godRaysPass.enabled = next.godRaysEnabled
    godRaysPass.uniforms.exposure!.value = next.godRaysExposure

    smaaPass.enabled = true
    filmGradeUniform.value = 1
  }
  applyConfig(config)

  function applyFrameBudget(renderMs: number): void {
    if (!aoWanted) {
      aoSuppressed = false
      syncAoPass()
      return
    }
    const now = performance.now()
    const next = shouldSuppressAo(aoSuppressed, renderMs, now - aoSuppressedChangedAt)
    if (next !== aoSuppressed) aoSuppressedChangedAt = now
    aoSuppressed = next
    syncAoPass()
  }

  function setPassEnabled(pass: PostPassId, enabled: boolean): void {
    switch (pass) {
      case 'ao':
        aoWanted = enabled
        aoSuppressed = false
        aoSuppressedChangedAt = 0
        syncAoPass()
        break
      case 'bloom':
        bloomPass.enabled = enabled
        break
      case 'filmGrade':
        filmGradeUniform.value = enabled ? 1 : 0
        break
      case 'godRays':
        godRaysPass.enabled = enabled
        break
      case 'smaa':
        smaaPass.enabled = enabled
        break
    }
  }

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
    // TEMP: isolation test — bypass EffectComposer
    render: () => renderer.render(scene, camera),
    setSize: (w, h) => composer.setSize(w, h),
    setPixelRatio: (pixelRatio) => composer.setPixelRatio(pixelRatio),
    applyConfig,
    applyFrameBudget,
    setPassEnabled,
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
