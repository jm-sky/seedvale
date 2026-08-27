import {
  type AnimationClip,
  Box3,
  type Group,
  type InstancedMesh,
  type Material,
  type Mesh,
  type Object3D,
  Vector3,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { useBootMark } from '../shared/bootMark'
import { patchFoliageWindOnObject } from '../world/foliageWind'

const { bootMark, bootMarkEnd } = useBootMark('loadGltf')

const loader = new GLTFLoader()

// ---------------------------------------------------------------------------
// DIAGNOSTIC EXPERIMENT ONLY (world-003, "GLTF 25s loading stall" — deeper
// diagnostic). Everything in this block is temporary, additive instrumentation
// that does not change loader/cache/decode behavior — it only wraps existing
// extension points (`LoadingManager.itemStart`/`itemEnd`, which every
// three.js sub-loader already calls; `MeshoptDecoder.decodeGltfBufferAsync`,
// which `GLTFLoader`'s meshopt extension already calls) to emit `bootMark`
// timings around them. Revert by deleting this block and restoring the plain
// `loader.setMeshoptDecoder(MeshoptDecoder)` call below once the experiment's
// data is read.
//
// Stage coverage (see `loadCached()` below for the loadAsync/postprocess
// split already added):
//   HTTP/file request      -> `manager:<url>` (main .glb AND any per-texture
//                              blob: URL — every sub-resource fetch the
//                              shared `loader`/`ImageBitmapLoader` issues)
//   Meshopt decoding        -> `meshoptDecoder:decodeGltfBufferAsync:<n>:<mode>`
//   WASM instantiation      -> `meshoptDecoder:ready` (once, module lifetime)
// GLTFParser/buffer-loading/final-scene-resolution have no dedicated hook to
// wrap without touching vendored code — they show up as the *unaccounted-for*
// gaps between the checkpoints above and `loadAsync:start`/`loadAsync:resolved`
// (see `loadCached()`).
const manager = loader.manager
const originalItemStart = manager.itemStart.bind(manager)
const originalItemEnd = manager.itemEnd.bind(manager)
const originalItemError = manager.itemError.bind(manager)
manager.itemStart = (url: string) => {
  bootMark(`manager:${url}`)
  originalItemStart(url)
}
manager.itemEnd = (url: string) => {
  bootMarkEnd(`manager:${url}`)
  originalItemEnd(url)
}
manager.itemError = (url: string) => {
  bootMarkEnd(`manager:${url}`)
  originalItemError(url)
}

bootMark('meshoptDecoder:ready')
void MeshoptDecoder.ready.then(() => bootMarkEnd('meshoptDecoder:ready'))

let meshoptDecodeCallSeq = 0
const instrumentedMeshoptDecoder: typeof MeshoptDecoder = Object.assign(Object.create(MeshoptDecoder), {
  decodeGltfBufferAsync(
    count: number,
    size: number,
    source: Uint8Array,
    mode: string,
    filter?: string,
  ): Promise<Uint8Array> {
    const id = `meshoptDecoder:decodeGltfBufferAsync:${meshoptDecodeCallSeq++}:${mode}`
    bootMark(id)
    return MeshoptDecoder.decodeGltfBufferAsync(count, size, source, mode, filter).finally(() => bootMarkEnd(id))
  },
})
loader.setMeshoptDecoder(instrumentedMeshoptDecoder)

// `manager:<url>` above actually fires twice per file: once from
// `GLTFLoader.load()`'s own `itemStart`/`itemEnd` (which brackets fetch+parse
// together — its `itemEnd` only fires from `scope.parse()`'s `onLoad`), and
// once from the internal `FileLoader` it delegates the raw fetch to (whose
// own `itemEnd` fires right after the fetch resolves, before parse is even
// called). Since `bootMarkEnd` matches the *first* pushed mark with that name
// (see `shared/bootMark.ts`), the FIRST `manager:<url>` console line is pure
// fetch time; the SECOND is fetch+parse together (redundant with
// `loadAsync:start`/`loadAsync:resolved`). That still leaves "how long was
// parse alone" only derivable by subtraction. `loader.parse` is a plain
// instance method (not touching node_modules) — wrapping it here brackets
// `GLTFParser` directly, with zero overlap with the fetch stage, so it can be
// read straight off the console instead of subtracted by hand.
const originalParse = loader.parse.bind(loader)
let gltfParseCallSeq = 0
loader.parse = (
  data: ArrayBuffer | string,
  path: string,
  onLoad: (gltf: Awaited<ReturnType<typeof loader.parseAsync>>) => void,
  onError?: (event: ErrorEvent) => void,
) => {
  const id = `gltfParser:parse:${gltfParseCallSeq++}`
  bootMark(id)
  originalParse(
    data,
    path,
    (gltf) => { bootMarkEnd(id); onLoad(gltf) },
    (event) => { bootMarkEnd(id); onError?.(event) },
  )
}
// --------------------------------- end diagnostic block ---------------------------------

/** Meshes whose local-space bounding-box diagonal is below this (meters,
 *  measured before any later `prepareProp`/`preparePropFitMax` scale) skip
 *  the shadow pass. Drobne propsy (pebbles, reed clumps, small filler) are a
 *  fraction of a shadow-map texel at the world's 1024² map / 160-unit
 *  frustum — casting still costs a full extra draw call per shadow-casting
 *  light. Trees/houses/characters are authored well above this threshold, so
 *  they keep `castShadow`. See docs/reviews/2026-08-12--005--performance-architecture-and-assets.md (A2).
 *  Exported so other procedural-mesh call sites (e.g. `items.ts`'s pickup
 *  fallbacks) can apply the same threshold instead of duplicating the value
 *  (plan 145 R2). */
export const SMALL_MESH_SHADOW_THRESHOLD = 0.5
const _meshBoxSize = new Vector3()

type CachedGltf = {
  root: Group
  animations: AnimationClip[]
}

const cache = new Map<string, Promise<CachedGltf>>()

export type GltfAsset = {
  root: Group
  animations: AnimationClip[]
  /** Skinned-safe clone of the prepared root. */
  clone: () => Group
}

/** world-003 "GLTF loading contention discovery" — diagnostic-only timing
 *  around the `GLTFLoader.loadAsync()` boundary, split from the traverse/
 *  `patchFoliageWindOnObject` postprocessing that follows it, to tell apart
 *  loader wait time from postprocessing time. `loadAsync:start:<url>`/
 *  `loadAsync:postprocess-start:<url>` each pair with their own
 *  `bootMarkEnd` (real elapsed durations); `loadAsync:resolved:<url>`/
 *  `loadAsync:postprocess-end:<url>` are raw checkpoints (visible via
 *  `bootMarksSummary()`) marking the exact moment `loadAsync` resolves and
 *  the exact moment postprocessing finishes, respectively — no behavior
 *  change, `.then()` converted to an equivalent `async` IIFE so each stage
 *  boundary is addressable. */
function loadCached(url: string): Promise<CachedGltf> {
  let pending = cache.get(url)
  if (!pending) {
    pending = (async () => {
      bootMark(`loadAsync:start:${url}`)
      const gltf = await loader.loadAsync(url)
      bootMarkEnd(`loadAsync:start:${url}`)
      bootMark(`loadAsync:resolved:${url}`)

      bootMark(`loadAsync:postprocess-start:${url}`)
      const root = gltf.scene
      root.traverse((obj) => {
        const mesh = obj as Mesh
        if (!mesh.isMesh) return
        mesh.geometry.computeBoundingBox()
        const box = mesh.geometry.boundingBox
        const diagonal = box ? box.getSize(_meshBoxSize).length() : Infinity
        mesh.castShadow = diagonal >= SMALL_MESH_SHADOW_THRESHOLD
        mesh.receiveShadow = true
        // Every clone (SkeletonUtils.clone / Object3D.clone(true)) shares this
        // geometry/material BY REFERENCE with this cached root — flagging it
        // here, on the geometry/material object itself, survives cloning no
        // matter how faithfully each clone path copies `userData` on the mesh.
        // `disposeObject3D` checks this and skips freeing it.
        mesh.geometry.userData.sharedGpu = true
        const mat = mesh.material
        if (Array.isArray(mat)) mat.forEach((m: Material) => { m.userData.sharedGpu = true })
        else (mat as Material).userData.sharedGpu = true
      })
      // Leaf/canopy materials get a shared vertex wind (plan 066). Materials are
      // shared across every clone of this URL, so patching the cache root once
      // covers chunk + settlement trees/bushes.
      patchFoliageWindOnObject(root)
      bootMarkEnd(`loadAsync:postprocess-start:${url}`)
      bootMark(`loadAsync:postprocess-end:${url}`)

      return { root, animations: gltf.animations ?? [] }
    })()
    cache.set(url, pending)
  }
  return pending
}

/** Load a GLB/glTF from `/public` (e.g. `/models/settlement/hut_a.glb`). Cached by URL. */
export function loadGltf(url: string): Promise<Group> {
  return loadCached(url).then((asset) => cloneSkinned(asset.root) as Group)
}

/** Load GLB with animation clips (shared); clones use SkeletonUtils. */
export async function loadGltfAsset(url: string): Promise<GltfAsset> {
  const asset = await loadCached(url)
  return {
    root: asset.root,
    animations: asset.animations,
    clone: () => cloneSkinned(asset.root) as Group,
  }
}

/** Alias for NPC code: `{ scene, animations }` with a skinned-safe scene clone. */
export async function loadGltfAnimated(
  url: string,
): Promise<{ scene: Group, animations: AnimationClip[] }> {
  const asset = await loadGltfAsset(url)
  return { scene: asset.clone(), animations: asset.animations }
}

const _box = new Box3()
const _size = new Vector3()
const _center = new Vector3()

/**
 * Fit model so its feet sit on y=0 and height ≈ `targetHeight` (world meters).
 * Returns the same object for chaining.
 *
 * Prefer {@link preparePropFitMax} for long/flat tools (pitchfork, pickaxe):
 * those assets are authored with a small Y and a long X/Z, so height-fitting
 * inflates them to tens of meters.
 */
export function prepareProp(
  object: Object3D,
  targetHeight: number,
): Object3D {
  object.updateMatrixWorld(true)
  _box.setFromObject(object)
  _box.getSize(_size)
  if (_size.y < 1e-4) return object

  const scale = targetHeight / _size.y
  object.scale.multiplyScalar(scale)
  object.updateMatrixWorld(true)

  _box.setFromObject(object)
  _box.getCenter(_center)
  object.position.x -= _center.x
  object.position.z -= _center.z
  object.position.y -= _box.min.y
  return object
}

/**
 * Fit model so the largest bbox axis ≈ `targetMax` (world meters) and feet
 * sit on y=0. Use for elongated props where height is not the authored long axis.
 */
export function preparePropFitMax(
  object: Object3D,
  targetMax: number,
): Object3D {
  object.updateMatrixWorld(true)
  _box.setFromObject(object)
  _box.getSize(_size)
  const longest = Math.max(_size.x, _size.y, _size.z)
  if (longest < 1e-4) return object

  object.scale.multiplyScalar(targetMax / longest)
  object.updateMatrixWorld(true)

  _box.setFromObject(object)
  _box.getCenter(_center)
  object.position.x -= _center.x
  object.position.z -= _center.z
  object.position.y -= _box.min.y
  return object
}

/** Dev-tool only: drop a cached URL and free its GPU resources. Game code never
 *  calls this — shared cache roots stay alive for the app lifetime. */
export function invalidateGltf(url: string): void {
  const pending = cache.get(url)
  cache.delete(url)
  if (!pending) return
  void pending.then((asset) => {
    asset.root.traverse((obj) => {
      const mesh = obj as Mesh
      if (!mesh.isMesh) return
      mesh.geometry.dispose()
      const mat = mesh.material
      if (Array.isArray(mat)) mat.forEach((m: Material) => m.dispose())
      else (mat as Material).dispose()
    })
  }).catch(() => { /* load may have failed */ })
}

/** Frees geometry/material GPU resources for everything under `object` — but
 *  never for resources shared with the GLTF loader cache (see `loadCached`'s
 *  `sharedGpu` flag): those live for the app's lifetime, and freeing them here
 *  would just force a shader recompile + buffer re-upload next time any other
 *  clone of the same asset is used. */
export function disposeObject3D(object: Object3D): void {
  object.traverse((obj) => {
    const mesh = obj as Mesh
    if (!mesh.isMesh) return
    if (!mesh.geometry.userData.sharedGpu) mesh.geometry.dispose()
    const mat = mesh.material
    if (Array.isArray(mat)) {
      mat.forEach((m: Material) => { if (!m.userData.sharedGpu) m.dispose() })
    } else if (!(mat as Material).userData.sharedGpu) {
      (mat as Material).dispose()
    }
    // InstancedMesh owns an instanceMatrix GPU buffer that neither
    // geometry.dispose() nor material.dispose() frees — only
    // InstancedMesh.dispose() does (plan 087 §2.4). Safe for every other
    // mesh: `isInstancedMesh` is `undefined` on a plain Mesh.
    const inst = obj as InstancedMesh
    if (inst.isInstancedMesh) inst.dispose()
  })
}
