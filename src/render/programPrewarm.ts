/**
 * Plan 149 Phase 1 A — one-shot loading-window `compileAsync()` prewarm.
 *
 * Moves the stable WebGLProgram compile/link (the frame-0 first-use hitch
 * left after plan 157 pinned `NUM_POINT_LIGHTS` at 16) off the gameplay
 * streaming path and into the existing loading/initialization window.
 *
 * Not a ChunkManager / per-tick / full-live-scene prewarm. Staging clones
 * share the live scene's geometry/materials; they are never added to the
 * scene graph and are dropped without disposing those shared resources.
 *
 * Renderer-state constraint (Three.js 0.185.1 `WebGLPrograms.getParameters`):
 * scene materials are actually drawn into a non-XR render target (water
 * mirror, EffectComposer), which forces `toneMapping = NoToneMapping` and
 * `outputColorSpace = workingColorSpace`. Compiling against the default
 * framebuffer would create unused ACES/sRGB variants and leave the real
 * first-use hitch in place. A tiny throwaway RT is bound only for the
 * `compileAsync` call, then restored — mirror and postprocess modules are
 * not modified.
 */

import {
  Group,
  InstancedMesh,
  Matrix4,
  WebGLRenderTarget,
} from 'three'
import type {
  BufferGeometry,
  Camera,
  Line,
  Material,
  Mesh,
  Object3D,
  Points,
  Scene,
  Sprite,
  WebGLRenderer,
} from 'three'

/** Bound only while `compileAsync` runs so program keys match gameplay
 *  (composer / mirror), not the default framebuffer. Compile does not draw. */
const PREWARM_RT_SIZE = 1
/** Hard cap so a stuck `KHR_parallel_shader_compile` poll cannot freeze
 *  startup. Plenty for the ~50–70 programs of the pinned PointLight set. */
const PREWARM_COMPILE_TIMEOUT_MS = 15_000

const _identity = new Matrix4()

export type ProgramPrewarmResult = {
  ok: boolean
  stagingRoots: number
  stagingMaterials: number
  programCountBefore: number
  programCountAfter: number
  compileAsyncMs: number
  /** `0` means `gl.NO_ERROR` (or no context). Any other value is a GL error
   *  observed after compile/restore. */
  glError: number
  khrParallelShaderCompile: boolean
  error?: string
}

export type ProgramPrewarmStaging = {
  group: Group
  rootCount: number
  materialCount: number
}

type Drawable = Mesh | Line | Points | Sprite

function isDrawable(object: Object3D): object is Drawable {
  const mesh = object as Mesh
  const line = object as Line
  const points = object as Points
  const sprite = object as Sprite
  return !!(mesh.isMesh || line.isLine || points.isPoints || sprite.isSprite)
}

function materialList(material: Drawable['material']): Material[] {
  return Array.isArray(material) ? material : [material]
}

/** Object-side bits that Three folds into the program cache key alongside
 *  the material itself (instancing, skinning, morphs, tangents). */
function objectProgramFlags(object: Drawable): string {
  const instanced = object as InstancedMesh
  const skinned = object as Mesh & { isSkinnedMesh?: boolean }
  const geometry = object.geometry as BufferGeometry | undefined
  const morph = geometry?.morphAttributes?.position !== undefined
  const tangents = geometry?.attributes?.tangent !== undefined
  return [
    instanced.isInstancedMesh ? 'I' : '',
    skinned.isSkinnedMesh ? 'S' : '',
    (object as Points).isPoints ? 'P' : '',
    (object as Line).isLine ? 'L' : '',
    (object as Sprite).isSprite ? 'R' : '',
    morph ? 'M' : '',
    tangents ? 'T' : '',
  ].join('')
}

function cloneForStaging(source: Drawable): Drawable {
  const instanced = source as InstancedMesh
  if (instanced.isInstancedMesh) {
    const clone = new InstancedMesh(instanced.geometry, instanced.material, 1)
    clone.castShadow = instanced.castShadow
    clone.receiveShadow = instanced.receiveShadow
    clone.frustumCulled = false
    clone.count = 1
    clone.setMatrixAt(0, _identity)
    clone.instanceMatrix.needsUpdate = true
    return clone
  }
  const clone = source.clone(false) as Drawable
  clone.frustumCulled = false
  return clone
}

function uniqueMaterialCount(group: Group): number {
  const seen = new Set<string>()
  group.traverse((object) => {
    if (!isDrawable(object)) return
    for (const material of materialList(object.material)) seen.add(material.uuid)
  })
  return seen.size
}

/**
 * One representative clone per (shared material × object-flag) family found
 * under `source`. Clones share geometry/material by reference — never cloned
 * as new GPU resources.
 */
export function buildProgramPrewarmStaging(source: Object3D): ProgramPrewarmStaging {
  const seen = new Set<string>()
  const group = new Group()
  group.name = 'program-prewarm-staging'
  group.matrixAutoUpdate = false

  source.traverse((object) => {
    if (!isDrawable(object) || !object.geometry || !object.material) return
    const flags = objectProgramFlags(object)
    let needed = false
    for (const material of materialList(object.material)) {
      const key = `${material.uuid}|${flags}`
      if (seen.has(key)) continue
      seen.add(key)
      needed = true
    }
    if (!needed) return
    group.add(cloneForStaging(object))
  })

  return {
    group,
    rootCount: group.children.length,
    materialCount: uniqueMaterialCount(group),
  }
}

/** Drops staging clones without disposing shared geometry/materials. */
export function disposeProgramPrewarmStaging(staging: ProgramPrewarmStaging): void {
  const { group } = staging
  for (const child of [...group.children]) {
    group.remove(child)
    const instanced = child as InstancedMesh
    if (instanced.isInstancedMesh) instanced.dispose()
  }
}

function programCountOf(renderer: WebGLRenderer): number {
  return renderer.info.programs?.length ?? 0
}

function readGlError(renderer: WebGLRenderer): number {
  const gl = renderer.getContext() as WebGLRenderingContext | null
  if (!gl) return 0
  return gl.getError()
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err: unknown) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

/**
 * Compile the current live scene's program families into the renderer cache
 * and wait for `KHR_parallel_shader_compile` completion. Must run in the
 * loading window (after lights/fog/PointLight pad sync, before gameplay
 * `tick()`). Does not start the game loop and does not touch ChunkManager.
 */
export async function prewarmRenderPrograms(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
): Promise<ProgramPrewarmResult> {
  const khrParallelShaderCompile = renderer.extensions.has('KHR_parallel_shader_compile')
  const programCountBefore = programCountOf(renderer)
  const staging = buildProgramPrewarmStaging(scene)
  const dummyTarget = new WebGLRenderTarget(PREWARM_RT_SIZE, PREWARM_RT_SIZE)
  dummyTarget.texture.generateMipmaps = false
  const previousTarget = renderer.getRenderTarget()
  // Drain any stale error so a leftover from startup isn't attributed here.
  readGlError(renderer)

  let ok = false
  let error: string | undefined
  const t0 = performance.now()
  try {
    renderer.setRenderTarget(dummyTarget)
    await withTimeout(
      renderer.compileAsync(staging.group, camera, scene),
      PREWARM_COMPILE_TIMEOUT_MS,
      `compileAsync timed out after ${PREWARM_COMPILE_TIMEOUT_MS}ms`,
    )
    ok = true
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
    console.warn('[programPrewarm]', error)
  } finally {
    renderer.setRenderTarget(previousTarget)
    dummyTarget.dispose()
    disposeProgramPrewarmStaging(staging)
  }
  const compileAsyncMs = performance.now() - t0
  const glError = readGlError(renderer)

  return {
    ok: ok && glError === 0,
    stagingRoots: staging.rootCount,
    stagingMaterials: staging.materialCount,
    programCountBefore,
    programCountAfter: programCountOf(renderer),
    compileAsyncMs,
    glError,
    khrParallelShaderCompile,
    error,
  }
}

declare global {
  interface Window {
    __seedvaleProgramPrewarm?: ProgramPrewarmResult
  }
}
