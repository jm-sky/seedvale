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

/** One shared planar-reflection pass (128²) for every water material. */
export const WATER_MIRROR_SIZE = 128

/** Mirror re-renders at most this often — every-other-frame at 60 Hz (plan
 *  113 P1). Still a full scene pass, so don't raise this without a benchmark. */
const MIRROR_MAX_HZ = 30
const MIRROR_MIN_INTERVAL_S = 1 / MIRROR_MAX_HZ

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
      if (nowSec - lastRenderSec < MIRROR_MIN_INTERVAL_S) return
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
      mirrorCamera.far = camera.far
      mirrorCamera.updateMatrixWorld()
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
