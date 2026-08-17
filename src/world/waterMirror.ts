import {
  type Camera,
  LinearFilter,
  Matrix4,
  type Object3D,
  PerspectiveCamera,
  Plane,
  type Scene,
  type ShaderMaterial,
  Vector3,
  Vector4,
  type WebGLRenderer,
  WebGLRenderTarget,
} from 'three'

/** Water meshes live on this layer so the mirror camera (layer 0 only) skips
 *  them and cannot recurse into the water surface. The main camera must
 *  `layers.enable(WATER_RENDER_LAYER)` or the water disappears. */
export const WATER_RENDER_LAYER = 1

/** NPC / fauna presentation. Mirror camera stays on layer 0, so agents do
 *  not pay a second scene submit in the reflection pass (plan 113 P1). The
 *  main camera and the sun's shadow camera must `layers.enable` this. */
export const AGENT_RENDER_LAYER = 2

/** Geometry that is too fine to resolve in the reflection. The mirror renders
 *  into a 128² target whose sample is then attenuated hard by the water
 *  shader — `reflectance` is clamped to 0.4 and the sample is further diluted
 *  by `mix(mirrorSample, body, 0.55)` (`waterMaterial.ts`), so the reflection
 *  never contributes more than ~18 % of the water colour and contributes
 *  ~1–2 % at ordinary viewing angles. Sub-pixel detail inside that budget is
 *  not representable; anything on this layer pays no second scene submit.
 *  Same mechanism as `AGENT_RENDER_LAYER` (plan 113 P1) — the main camera must
 *  `layers.enable` it. */
export const REFLECTION_SKIPPED_LAYER = 3

/** Terrain/vegetation/environment content in the outer streaming ring only
 *  (plan 144 S) — unlike `REFLECTION_SKIPPED_LAYER`, this content *does* cast
 *  shadows, so the sun's shadow camera must also `layers.enable` it (the
 *  mirror camera must not, or the exclusion is pointless). Kept as its own
 *  layer rather than reusing `REFLECTION_SKIPPED_LAYER` specifically so grass/
 *  items (which never cast shadows) don't have to start doing so. */
export const REFLECTION_DISTANT_LAYER = 4

/** One shared planar-reflection pass (128²) for every water material. */
export const WATER_MIRROR_SIZE = 128

/** Mirror re-renders at most this often — every-other-frame at 60 Hz (plan
 *  113 P1). Still a full scene pass, so don't raise this without a benchmark. */
const MIRROR_MAX_HZ = 30
const MIRROR_MIN_INTERVAL_S = 1 / MIRROR_MAX_HZ

/** The wall-clock cap above stops throttling anything once frames get longer
 *  than `MIRROR_MIN_INTERVAL_S`: at 23 FPS every call is already ≥43 ms apart,
 *  so "every other frame at 60 Hz" silently becomes "every frame" — precisely
 *  when the pass is least affordable (research 018 §3 measured it at ~10.5 ms
 *  and 37 % of all draw calls at that frame rate). Below this frame rate the
 *  documented every-other-frame intent is enforced by frame count instead.
 *  Same shape as the N8AO frame budget (`aoBudget.ts`): degrade the effect
 *  under load rather than the frame rate. */
const MIRROR_BUDGET_FRAME_S = MIRROR_MIN_INTERVAL_S

/** Timing state for one `WaterMirror.render()` call. `render` is invoked once
 *  per frame even when it early-outs, so `nowSec - lastCallSec` is the frame
 *  time — no extra plumbing is needed to know whether we're over budget. */
export type MirrorCadenceState = {
  nowSec: number
  /** `performance.now()` of the previous `render()` call (rendered or not). */
  lastCallSec: number
  /** `performance.now()` of the last call that actually drew the pass. */
  lastRenderSec: number
  renderedLastCall: boolean
}

/** Pure cadence decision — extracted so it can be unit-tested without a WebGL
 *  context (same split as `shouldSuppressAo` in `render/aoBudget.ts`). */
export function shouldRenderMirror(state: MirrorCadenceState): boolean {
  const overBudget = state.nowSec - state.lastCallSec > MIRROR_BUDGET_FRAME_S
  if (overBudget && state.renderedLastCall) return false
  return state.nowSec - state.lastRenderSec >= MIRROR_MIN_INTERVAL_S
}

export function assignRenderLayer(root: Object3D, layer: number): void {
  root.traverse((obj) => {
    obj.layers.set(layer)
  })
}

export function setSubtreeCastShadow(root: Object3D, cast: boolean): void {
  root.traverse((obj) => {
    const mesh = obj as { isMesh?: boolean, castShadow?: boolean }
    if (mesh.isMesh) mesh.castShadow = cast
  })
}

export type WaterMirrorUniforms = {
  uMirror: { value: WebGLRenderTarget['texture'] }
  uTextureMatrix: { value: Matrix4 }
  uReflections: { value: number }
}

export type WaterMirror = {
  uniforms: WaterMirrorUniforms
  setEnabled: (enabled: boolean) => void
  isEnabled: () => boolean
  /** Re-renders the scene into the RT. No-op when disabled or disposed. */
  render: (renderer: WebGLRenderer, scene: Scene, camera: Camera) => void
  dispose: () => void
}

const _mirrorPlane = new Plane()
const _normal = new Vector3(0, 1, 0)
const _planePoint = new Vector3()
const _cameraWorld = new Vector3()
const _view = new Vector3()
const _lookAt = new Vector3()
const _target = new Vector3()
const _clipPlane = new Vector4()
const _q = new Vector4()
const _rotation = new Matrix4()

/**
 * Planar scene mirror about `y = waterLevel`. One RT, shared uniforms — not
 * Water.js and not a Reflector per lake. Off means the pass never starts.
 */
export function createWaterMirror(opts: {
  waterLevel: number
  enabled: boolean
}): WaterMirror {
  const renderTarget = new WebGLRenderTarget(WATER_MIRROR_SIZE, WATER_MIRROR_SIZE)
  renderTarget.texture.generateMipmaps = false
  renderTarget.texture.minFilter = LinearFilter
  renderTarget.texture.magFilter = LinearFilter

  const textureMatrix = new Matrix4()
  const mirrorCamera = new PerspectiveCamera()
  // Layer 0 only — water is on WATER_RENDER_LAYER.
  mirrorCamera.layers.set(0)

  const uniforms: WaterMirrorUniforms = {
    uMirror: { value: renderTarget.texture },
    uTextureMatrix: { value: textureMatrix },
    uReflections: { value: opts.enabled ? 1 : 0 },
  }

  const waterLevel = opts.waterLevel
  let enabled = opts.enabled
  let disposed = false
  let lastRenderSec = -Infinity
  let lastCallSec = -Infinity
  let renderedLastCall = false

  return {
    uniforms,
    setEnabled(next) {
      enabled = next
      uniforms.uReflections.value = next ? 1 : 0
    },
    isEnabled: () => enabled && !disposed,
    render(renderer, scene, camera) {
      if (!enabled || disposed) return

      const nowSec = performance.now() * 0.001
      const wanted = shouldRenderMirror({ nowSec, lastCallSec, lastRenderSec, renderedLastCall })
      lastCallSec = nowSec
      renderedLastCall = wanted
      if (!wanted) return
      lastRenderSec = nowSec

      _cameraWorld.setFromMatrixPosition(camera.matrixWorld)
      // Camera under the plane — skip, same as Water.js facing-away early out.
      if (_cameraWorld.y < waterLevel) return

      if (!(camera instanceof PerspectiveCamera)) return

      _planePoint.set(_cameraWorld.x, waterLevel, _cameraWorld.z)
      _normal.set(0, 1, 0)

      _view.subVectors(_planePoint, _cameraWorld)
      _view.reflect(_normal).negate()
      _view.add(_planePoint)

      _rotation.extractRotation(camera.matrixWorld)
      _lookAt.set(0, 0, -1)
      _lookAt.applyMatrix4(_rotation)
      _lookAt.add(_cameraWorld)

      _target.subVectors(_planePoint, _lookAt)
      _target.reflect(_normal).negate()
      _target.add(_planePoint)

      mirrorCamera.position.copy(_view)
      mirrorCamera.up.set(0, 1, 0)
      mirrorCamera.up.applyMatrix4(_rotation)
      mirrorCamera.up.reflect(_normal)
      mirrorCamera.lookAt(_target)
      mirrorCamera.updateMatrixWorld()
      // Culling uses `Frustum.setFromProjectionMatrix(projectionMatrix *
      // matrixWorldInverse)`, never `camera.far` — so assigning
      // `mirrorCamera.far` here (as this did) could not shorten the reflection
      // pass; only rebuilding the projection can. Left as a straight copy: the
      // streamed world only reaches ~`loadRadius` chunks (~316 units at the
      // default 3×64) while `camera.far` is 500, so a shorter far plane would
      // cull almost nothing. See research 019 for the measurement.
      mirrorCamera.projectionMatrix.copy(camera.projectionMatrix)

      textureMatrix.set(
        0.5, 0.0, 0.0, 0.5,
        0.0, 0.5, 0.0, 0.5,
        0.0, 0.0, 0.5, 0.5,
        0.0, 0.0, 0.0, 1.0,
      )
      textureMatrix.multiply(mirrorCamera.projectionMatrix)
      textureMatrix.multiply(mirrorCamera.matrixWorldInverse)

      // Oblique near-plane clip so geometry below the water plane does not
      // leak into the reflection (Lengyel / Water.js).
      _mirrorPlane.setFromNormalAndCoplanarPoint(_normal, _planePoint)
      _mirrorPlane.applyMatrix4(mirrorCamera.matrixWorldInverse)
      _clipPlane.set(
        _mirrorPlane.normal.x,
        _mirrorPlane.normal.y,
        _mirrorPlane.normal.z,
        _mirrorPlane.constant,
      )
      const proj = mirrorCamera.projectionMatrix
      _q.x = (Math.sign(_clipPlane.x) + proj.elements[8]!) / proj.elements[0]!
      _q.y = (Math.sign(_clipPlane.y) + proj.elements[9]!) / proj.elements[5]!
      _q.z = -1
      _q.w = (1 + proj.elements[10]!) / proj.elements[14]!
      _clipPlane.multiplyScalar(2 / _clipPlane.dot(_q))
      proj.elements[2] = _clipPlane.x
      proj.elements[6] = _clipPlane.y
      proj.elements[10] = _clipPlane.z + 1
      proj.elements[14] = _clipPlane.w

      const currentTarget = renderer.getRenderTarget()
      const currentXr = renderer.xr.enabled
      const currentShadowAuto = renderer.shadowMap.autoUpdate
      renderer.xr.enabled = false
      renderer.shadowMap.autoUpdate = false
      renderer.setRenderTarget(renderTarget)
      renderer.state.buffers.depth.setMask(true)
      if (renderer.autoClear === false) renderer.clear()
      renderer.render(scene, mirrorCamera)
      renderer.xr.enabled = currentXr
      renderer.shadowMap.autoUpdate = currentShadowAuto
      renderer.setRenderTarget(currentTarget)
    },
    dispose() {
      if (disposed) return
      disposed = true
      uniforms.uReflections.value = 0
      renderTarget.dispose()
    },
  }
}

/** Point a water ShaderMaterial at the shared RT / texture matrix / flag. */
export function bindWaterMirror(material: ShaderMaterial, mirror: WaterMirror): void {
  material.uniforms.uMirror = mirror.uniforms.uMirror
  material.uniforms.uTextureMatrix = mirror.uniforms.uTextureMatrix
  material.uniforms.uReflections = mirror.uniforms.uReflections
}
