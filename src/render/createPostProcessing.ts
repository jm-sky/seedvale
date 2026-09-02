import { N8AOPass } from 'n8ao'
import { MathUtils, Vector2, Vector3 } from 'three'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js'
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import type { WorldConfig } from '../config/worldConfig'
import { isRenderStateDebugMode } from '../debug/debugMode'
import { sampleRenderState } from '../debug/renderStateDebug'
import { GodRaysShader } from './godRaysShader'
import { createGradedOutputPass } from './gradedOutputPass'
import type { Camera, PerspectiveCamera, Scene, WebGLRenderer } from 'three'

export type PostPassId = 'ao' | 'bloom' | 'smaa' | 'godRays' | 'filmGrade'

export type PostProcessing = {
  render: () => void
  setSize: (width: number, height: number) => void
  /** Mirrors `renderer.setPixelRatio` — must be called with the same value so
   *  the composer's offscreen targets stay the same size as the renderer's
   *  drawing buffer (perf review A3.2). */
  setPixelRatio: (pixelRatio: number) => void
  applyConfig: (config: WorldConfig['postProcessing']) => void
  /** Kept so `gameLoop` still has a per-frame hook. Hard on/off auto-budget
   *  was retired (grass flicker): this is a no-op. */
  applyFrameBudget: (renderMs: number) => void
  /** Isolation-probe toggle. `applyConfig` restores the user/preset state. */
  setPassEnabled: (pass: PostPassId, enabled: boolean) => void
  /** Isolation-probe toggle: full `EffectComposer` bypass — `render()` calls
   *  `renderer.render(scene, camera)` directly instead of `composer.render()`
   *  while `true`. Distinct from `setPassEnabled`, which still leaves
   *  `RenderPass`/`OutputPass` running through the composer. */
  setBypassEnabled: (enabled: boolean) => void
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

  const bloomPass = new UnrealBloomPass(new Vector2(width / 2, height / 2), 0.02, 0.05, 0.95)
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

  // God rays are only visible around dawn/dusk *and* while looking toward the
  // sun, so `intensity` resolves to 0 for most of a day. The shader already
  // early-outs on that, but an enabled `ShaderPass` still costs a full-screen
  // read + write of a half-float composer target and one more `EffectComposer`
  // buffer swap every frame. Tracking "wanted" separately from `enabled` lets
  // `updateGodRays` drop the pass out of the chain entirely when it would only
  // copy its input — byte-identical output, one less full-screen pass.
  let godRaysWanted = config.godRaysEnabled
  let aoWanted = config.aoEnabled

  function syncAoPass(): void {
    aoPass.enabled = aoWanted
    renderPass.enabled = !aoWanted
  }

  function applyConfig(next: WorldConfig['postProcessing']): void {
    aoWanted = next.aoEnabled
    syncAoPass()
    aoPass.setQualityMode(next.aoQuality)
    aoPass.configuration.aoRadius = next.aoRadius
    aoPass.configuration.intensity = next.aoIntensity
    // Perf benchmark (`stream`, seed=42, res=193): off saves ~47% RENDER /
    // gains ~54% FPS vs N8AO's own auto-detect locking this on for the
    // session the moment it sees any transparent material (water/clouds/
    // weather/fire — always present in Seedvale's scene). See
    // WorldConfig['postProcessing']['aoTransparencyAware'] doc comment.
    aoPass.autoDetectTransparency = next.aoTransparencyAware
    aoPass.configuration.transparencyAware = next.aoTransparencyAware

    bloomPass.enabled = next.bloomEnabled
    bloomPass.strength = next.bloomStrength
    bloomPass.radius = next.bloomRadius
    bloomPass.threshold = next.bloomThreshold

    godRaysWanted = next.godRaysEnabled
    // Left off until `updateGodRays` finds a non-zero intensity — it runs
    // every frame, before the composer, so the pass is re-armed in the same
    // frame the sun comes back into play.
    godRaysPass.enabled = false
    godRaysPass.uniforms.intensity!.value = 0
    godRaysPass.uniforms.exposure!.value = next.godRaysExposure

    smaaPass.enabled = true
    filmGradeUniform.value = 1
  }
  applyConfig(config)

  function applyFrameBudget(_renderMs: number): void {
    // Intentionally empty. Plan 113 P0 hard-toggled `aoPass.enabled` from last
    // frame's Render ms (suppress ≥15, restore ≤10). Turning AO off drops the
    // measured cost below the restore line, so the pass oscillated — review
    // 017's grass flicker, later ~1 Hz after AO_MIN_STABLE_MS. Intensity fade
    // would be a later budget; do not restore the on/off switch.
  }

  function setPassEnabled(pass: PostPassId, enabled: boolean): void {
    switch (pass) {
      case 'ao':
        aoWanted = enabled
        syncAoPass()
        break
      case 'bloom':
        bloomPass.enabled = enabled
        break
      case 'filmGrade':
        filmGradeUniform.value = enabled ? 1 : 0
        break
      case 'godRays':
        godRaysWanted = enabled
        if (!enabled) godRaysPass.enabled = false
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
    if (!godRaysWanted) return

    // Matches the shader's own `intensity <= 0.001` early-out, so dropping the
    // pass below cannot change a pixel.
    const arm = (intensity: number): void => {
      godRaysPass.uniforms.intensity!.value = intensity
      godRaysPass.enabled = intensity > 0.001
    }

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
      arm(0)
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

    arm(intensity)
  }

  let bypassed = false

  return {
    render: () => {
      // `?debugRenderState=1` — diagnostics only, sampled immediately before
      // the actual render call; never mutates renderer/camera/scene state.
      if (isRenderStateDebugMode()) sampleRenderState(renderer, scene, camera as PerspectiveCamera)
      if (bypassed) {
        // Composer's final pass always targets the screen — match that here
        // so a bypassed frame lands in the same place a normal one would.
        renderer.setRenderTarget(null)
        renderer.render(scene, camera)
        return
      }
      composer.render()
    },
    setSize: (w, h) => composer.setSize(w, h),
    setPixelRatio: (pixelRatio) => composer.setPixelRatio(pixelRatio),
    applyConfig,
    applyFrameBudget,
    setPassEnabled,
    setBypassEnabled: (enabled) => { bypassed = enabled },
    updateGodRays,
    dispose: () => {
      // `EffectComposer.dispose()` only frees its own two render targets and
      // `copyPass` — every pass added to the chain has to be disposed by its
      // owner. `RenderPass` currently inherits `Pass`'s no-op `dispose()`, but
      // disposing it keeps the list exhaustive if that changes upstream.
      renderPass.dispose()
      aoPass.dispose()
      smaaPass.dispose()
      bloomPass.dispose()
      godRaysPass.dispose()
      outputPass.dispose()
      composer.dispose()
    },
  }
}
