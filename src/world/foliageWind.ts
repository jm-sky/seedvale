import { MeshStandardMaterial as MeshStandardMaterialCtor } from 'three'
import type { Material, Mesh, MeshStandardMaterial, Object3D } from 'three'

/** Shared clock for every patched foliage material — one uniform object, many
 *  shaders. Advanced from the game loop (`updateFoliageWind`). */
const uFoliageTime = { value: 0 }

/** Leaf/canopy materials on nature GLBs (`tree_*`, `birch_*`, `maple_*`, bushes).
 *  Trunk/bark names (`Wood`, `*Bark`) intentionally do not match. */
const FOLIAGE_NAME_RE = /leaves|green|flowers/i

// TEMP: isolation test — disable foliage wind for InstancedMesh
// v3: bumped because the shader text changed again (the USE_INSTANCING body
// below became a no-op), so three.js's material program cache doesn't reuse
// a v2 program (with the live instanceMatrix sway) for instanced foliage.
const WIND_CACHE_KEY = 'foliage-wind-v3'

const BEGIN_VERTEX_WIND = /* glsl */ `
  #include <begin_vertex>
  // TEMP: isolation test — disable foliage wind for InstancedMesh: the sway
  // below only runs for non-instanced foliage now — instancing itself stays
  // on, only the wind displacement is skipped for InstancedMesh (issue 032
  // follow-up: black-flicker isolation pointed at exactly this combination).
  #ifndef USE_INSTANCING
  {
    mat4 propMatrix = modelMatrix;
    // World-meter amplitude independent of prepareProp()'s object.scale —
    // propMatrix column length is that uniform scale.
    float objScale = length( propMatrix[ 0 ].xyz );
    float amp = 0.11 / max( objScale, 1e-4 );
    // Canopy meshes are foliage-only (trunk uses a different material), so the
    // whole mesh may sway a little; higher local Y still moves more.
    float bend = 0.45 + 0.55 * smoothstep( 0.0, 1.4, max( transformed.y, 0.0 ) );
    vec3 world = ( propMatrix * vec4( transformed, 1.0 ) ).xyz;
    float phase = world.x * 0.13 + world.z * 0.10;
    float t = uFoliageTime;
    transformed.x += sin( t * 1.15 + phase ) * amp * bend;
    transformed.z += cos( t * 0.95 + phase * 1.25 ) * amp * 0.75 * bend;
  }
  #endif
`

function isFoliageMaterial(mat: Material): boolean {
  return FOLIAGE_NAME_RE.test(mat.name ?? '')
}

/** Cutout threshold for GLTF `alphaMode: BLEND` leaf textures converted to
 *  opaque alpha-tested materials (writes depth → correctly occludes water). */
export const FOLIAGE_ALPHA_CUTOFF = 0.45

/**
 * Quaternius stylized nature packs ship leaf/flower materials as
 * `alphaMode: BLEND` (`transparent` + `depthWrite: false`). That puts canopies
 * in the transparent queue and lets lakes/ocean overpaint them. Convert those
 * materials to alpha-tested cutouts once on the shared GLTF cache root — no
 * per-frame cost, and shadow maps already honor `alphaTest`.
 */
export function hardenFoliageAlpha(mat: Material): void {
  if (!(mat instanceof MeshStandardMaterialCtor)) return
  if (!isFoliageMaterial(mat)) return
  if (mat.userData.foliageAlphaHardened) return
  mat.userData.foliageAlphaHardened = true
  mat.userData.foliageHardened = true

  // Solid opaque crowns (e.g. Fantasy RTS `Green`) need no change.
  if (!mat.transparent && mat.opacity >= 1 && mat.alphaTest <= 0) return

  mat.transparent = false
  mat.depthWrite = true
  if (mat.alphaTest <= 0) mat.alphaTest = FOLIAGE_ALPHA_CUTOFF
  mat.needsUpdate = true
}

/**
 * Injects a cheap tip-weighted XZ sway into a `MeshStandardMaterial` used for
 * foliage (plan 066). Idempotent — safe to call on every GLTF traverse.
 * Shadow depth is left alone (subtle motion; matching depth material later if
 * needed).
 */
export function patchFoliageWindMaterial(mat: Material): void {
  if (!(mat instanceof MeshStandardMaterialCtor)) return
  if (!isFoliageMaterial(mat)) return
  if (mat.userData.foliageWindPatched) return
  mat.userData.foliageWindPatched = true

  const prevCompile = mat.onBeforeCompile
  mat.onBeforeCompile = (shader, renderer) => {
    prevCompile?.(shader, renderer)
    shader.uniforms.uFoliageTime = uFoliageTime
    if (!shader.vertexShader.includes('uFoliageTime')) {
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uFoliageTime;',
        )
        .replace('#include <begin_vertex>', BEGIN_VERTEX_WIND)
    }
  }
  const prevKey = mat.customProgramCacheKey
  mat.customProgramCacheKey = () =>
    `${prevKey ? prevKey.call(mat) : ''}|${WIND_CACHE_KEY}`
}

/** Traverse an object and patch every foliage material (shared GPU mats ⇒ one
 *  patch covers all clones of the same GLB). */
export function patchFoliageWindOnObject(root: Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as Mesh
    if (!mesh.isMesh) return
    const mat = mesh.material
    if (Array.isArray(mat)) {
      mat.forEach((m) => {
        hardenFoliageAlpha(m)
        patchFoliageWindMaterial(m)
      })
    } else {
      hardenFoliageAlpha(mat)
      patchFoliageWindMaterial(mat)
    }
  })
}

/** Patch a procedural crown material that has no GLB name (e.g. `createTree`). */
export function patchProceduralFoliageMaterial(mat: MeshStandardMaterial): void {
  if (!mat.name) mat.name = 'Green'
  patchFoliageWindMaterial(mat)
}

/** Advance the shared foliage wind clock — call once per frame. */
export function updateFoliageWind(dt: number): void {
  uFoliageTime.value += dt
}
