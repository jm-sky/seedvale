/** Shared Cave V2 heightfield surface material (plan world-terrain-019 polish).
 *  One `MeshStandardMaterial` + optional shared triplanar detail normal map for
 *  every streamed cave presentation — never per-cave GPU resources.
 *
 * @domain world-terrain
 */

import * as THREE from 'three'
import { getSharedTerrainDetailNormalMap } from '../../terrain/terrainDetailNormalMap'

/** Central tuning knobs — referenced from GLSL via matching uniforms. */
export const CAVE_SURFACE_MATERIAL_TUNING = {
  rockDetailScale: 0.38,
  rockNormalStrength: 0.42,
  /** Procedural rock normal detail layered under triplanar texture (world-space). */
  proceduralRockStrength: 0.22,
  macroScale: 0.055,
  wetnessScale: 0.048,
  wetnessAmount: 1.0,
  dryRoughness: 0.87,
  wetRoughness: 0.60,
  wetDarkening: 0.20,
} as const

export type CaveSurfaceMaterialTuning = typeof CAVE_SURFACE_MATERIAL_TUNING

export type CaveVec3 = readonly [number, number, number]

const NORMAL_MAP_INCLUDE = '#include <normal_fragment_maps>'
const COLOR_FRAGMENT_INCLUDE = '#include <color_fragment>'
const ROUGHNESSMAP_FRAGMENT_INCLUDE = '#include <roughnessmap_fragment>'

const SHADER_CACHE_KEY_DETAIL = 'cave-heightfield-surface-v5-detail'
const SHADER_CACHE_KEY_PLAIN = 'cave-heightfield-surface-v5-plain'

function caveVec3Normalize(v: CaveVec3, fallback: CaveVec3 = [0, 1, 0]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2])
  if (!(len > 1e-8) || !Number.isFinite(len)) return [fallback[0], fallback[1], fallback[2]]
  return [v[0] / len, v[1] / len, v[2] / len]
}

/**
 * World-space triplanar reconstruction: whiteout-blend each tangent-space
 * sample in its projection basis, swizzle into world, then blend.
 *
 * Must stay in lockstep with `caveTriplanarWorldNormal` in the GLSL below.
 * X uses world ZY UVs → swizzle `.zyx`; Y uses XZ → `.xzy`; Z uses XY → `.xyz`.
 * Do not blend raw tangent-space samples as `px*bx + py*by + pz*bz`.
 *
 * @domain world-terrain
 */
export function reconstructCaveTriplanarWorldNormal(
  worldNormal: CaveVec3,
  tangentX: CaveVec3,
  tangentY: CaveVec3,
  tangentZ: CaveVec3,
  strength: number,
): [number, number, number] {
  const n = caveVec3Normalize(worldNormal)
  let bx = Math.max(Math.abs(n[0]), 1e-4)
  let by = Math.max(Math.abs(n[1]), 1e-4)
  let bz = Math.max(Math.abs(n[2]), 1e-4)
  const sum = bx + by + bz
  bx /= sum
  by /= sum
  bz /= sum

  const tX: [number, number, number] = [tangentX[0] * strength, tangentX[1] * strength, tangentX[2]]
  const tY: [number, number, number] = [tangentY[0] * strength, tangentY[1] * strength, tangentY[2]]
  const tZ: [number, number, number] = [tangentZ[0] * strength, tangentZ[1] * strength, tangentZ[2]]

  // Whiteout: add the geometric normal's other axes, keep signed projection axis.
  const wX: [number, number, number] = [tX[0] + n[2], tX[1] + n[1], Math.abs(tX[2]) * n[0]]
  const wY: [number, number, number] = [tY[0] + n[0], tY[1] + n[2], Math.abs(tY[2]) * n[1]]
  const wZ: [number, number, number] = [tZ[0] + n[0], tZ[1] + n[1], Math.abs(tZ[2]) * n[2]]

  // Swizzle each projection's tangent frame back to world (X: zyx, Y: xzy, Z: xyz).
  return caveVec3Normalize([
    wX[2] * bx + wY[0] * by + wZ[0] * bz,
    wX[1] * bx + wY[2] * by + wZ[1] * bz,
    wX[0] * bx + wY[1] * by + wZ[2] * bz,
  ])
}

/**
 * Project an XZ slope onto the surface tangent plane so wall/ceiling grain
 * does not push the normal along the geometric axis. Matches
 * `caveProceduralRockPerturb` in GLSL.
 *
 * @domain world-terrain
 */
export function perturbCaveWorldNormalOnTangentPlane(
  worldNormal: CaveVec3,
  slopeXz: readonly [number, number],
  strength: number,
): [number, number, number] {
  const n = caveVec3Normalize(worldNormal)
  const slope: [number, number, number] = [slopeXz[0], 0, slopeXz[1]]
  const along = n[0] * slope[0] + n[1] * slope[1] + n[2] * slope[2]
  return caveVec3Normalize([
    n[0] + (slope[0] - n[0] * along) * strength,
    n[1] + (slope[1] - n[1] * along) * strength,
    n[2] + (slope[2] - n[2] * along) * strength,
  ])
}

/**
 * Keep the detailed lighting normal in the geometric hemisphere so a bad
 * triplanar sample cannot flip a wall to back-facing irradiance.
 * Matches the mix in `CAVE_NORMAL_CHUNK`.
 *
 * @domain world-terrain
 */
export function alignCaveDetailNormalToGeometric(
  geometric: CaveVec3,
  detail: CaveVec3,
): [number, number, number] {
  const g = caveVec3Normalize(geometric)
  const d = caveVec3Normalize(detail)
  const keep = Math.max(d[0] * g[0] + d[1] * g[1] + d[2] * g[2], 0)
  return caveVec3Normalize([
    g[0] * (1 - keep) + d[0] * keep,
    g[1] * (1 - keep) + d[1] * keep,
    g[2] * (1 - keep) + d[2] * keep,
  ])
}

const CAVE_SURFACE_GLSL = /* glsl */ `
float caveHash21( vec2 p ) {
  p = fract( p * vec2( 127.1, 311.7 ) );
  p += dot( p, p + 34.19 );
  return fract( p.x * p.y );
}
float caveValueNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  float a = caveHash21( i );
  float b = caveHash21( i + vec2( 1.0, 0.0 ) );
  float c = caveHash21( i + vec2( 0.0, 1.0 ) );
  float d = caveHash21( i + vec2( 1.0, 1.0 ) );
  return mix( mix( a, b, f.x ), mix( c, d, f.x ), f.y );
}
vec3 caveSafeNormalize( vec3 v, vec3 fallback ) {
  float len2 = dot( v, v );
  return len2 > 1e-10 ? v * inversesqrt( len2 ) : fallback;
}
vec3 caveViewToWorldDir( vec3 viewDir ) {
  return caveSafeNormalize(
    vec3(
      dot( vec3( viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0] ), viewDir ),
      dot( vec3( viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1] ), viewDir ),
      dot( vec3( viewMatrix[0][2], viewMatrix[1][2], viewMatrix[2][2] ), viewDir )
    ),
    vec3( 0.0, 1.0, 0.0 )
  );
}
float caveTriplanarValueNoise( vec3 worldPos, float scale ) {
  vec3 p = worldPos * scale;
  return (
    caveValueNoise( p.yz + vec2( 19.2, 7.4 ) ) +
    caveValueNoise( p.xz + vec2( 41.0, 13.0 ) ) +
    caveValueNoise( p.xy + vec2( 8.3, 22.1 ) )
  ) * ( 1.0 / 3.0 );
}
float caveWetnessMask( vec3 worldPos ) {
  float wetMacro = caveTriplanarValueNoise( worldPos, uCaveWetnessScale );
  float wetMacro2 = caveTriplanarValueNoise( worldPos, uCaveWetnessScale * 1.85 );
  float wetNoise = wetMacro * 0.68 + wetMacro2 * 0.32;
  return clamp( smoothstep( 0.38, 0.78, wetNoise ) * uCaveWetnessAmount, 0.0, 1.0 );
}
vec3 caveTriplanarWorldNormal( vec3 worldPos, vec3 worldN, float scale, float strength ) {
  vec3 n = caveSafeNormalize( worldN, vec3( 0.0, 1.0, 0.0 ) );
  vec3 blend = abs( n );
  blend = max( blend, vec3( 1e-4 ) );
  blend /= ( blend.x + blend.y + blend.z );

  vec3 tX = texture2D( uCaveDetailNormalMap, worldPos.zy * scale ).xyz * 2.0 - 1.0;
  vec3 tY = texture2D( uCaveDetailNormalMap, worldPos.xz * scale ).xyz * 2.0 - 1.0;
  vec3 tZ = texture2D( uCaveDetailNormalMap, worldPos.xy * scale ).xyz * 2.0 - 1.0;
  tX.xy *= strength;
  tY.xy *= strength;
  tZ.xy *= strength;

  tX = vec3( tX.xy + n.zy, abs( tX.z ) * n.x );
  tY = vec3( tY.xy + n.xz, abs( tY.z ) * n.y );
  tZ = vec3( tZ.xy + n.xy, abs( tZ.z ) * n.z );

  return caveSafeNormalize(
    tX.zyx * blend.x + tY.xzy * blend.y + tZ.xyz * blend.z,
    n
  );
}
void caveProceduralRockPerturb( vec3 worldPos, float scale, inout vec3 worldN ) {
  float s = scale * 3.6;
  vec2 p = worldPos.xz * s;
  float h = caveValueNoise( p );
  float hx = caveValueNoise( p + vec2( 0.07, 0.0 ) ) - h;
  float hz = caveValueNoise( p + vec2( 0.0, 0.07 ) ) - h;
  vec3 n = caveSafeNormalize( worldN, vec3( 0.0, 1.0, 0.0 ) );
  vec3 slope = vec3( hx, 0.0, hz );
  vec3 tangentSlope = slope - n * dot( n, slope );
  worldN = caveSafeNormalize( n + tangentSlope * uCaveProceduralRockStrength, n );
}
`

const CAVE_COLOR_CHUNK = /* glsl */ `
  {
    float macro = caveTriplanarValueNoise( vWorldPos, uCaveMacroScale );
    float macro2 = caveTriplanarValueNoise( vWorldPos, uCaveMacroScale * 2.15 );
    float macroMix = macro * 0.62 + macro2 * 0.38;
    diffuseColor.rgb *= 1.0 + ( macroMix - 0.5 ) * 0.09;

    float wetMask = caveWetnessMask( vWorldPos );
    diffuseColor.rgb *= 1.0 - wetMask * uCaveWetDarkening;
    diffuseColor.rgb = mix(
      diffuseColor.rgb,
      diffuseColor.rgb * vec3( 0.9, 0.94, 1.02 ),
      wetMask * 0.20
    );
  }
`

const CAVE_ROUGHNESS_CHUNK = /* glsl */ `
  {
    float wetMask = caveWetnessMask( vWorldPos );
    roughnessFactor = mix( uCaveDryRoughness, uCaveWetRoughness, wetMask );
  }
`

const CAVE_NORMAL_CHUNK = /* glsl */ `
  {
    vec3 geoView = caveSafeNormalize( normal, vec3( 0.0, 0.0, 1.0 ) );
    vec3 geoWorld = caveViewToWorldDir( geoView );
    vec3 worldN = caveTriplanarWorldNormal( vWorldPos, geoWorld, uCaveRockDetailScale, uCaveRockNormalStrength );
    caveProceduralRockPerturb( vWorldPos, uCaveRockDetailScale, worldN );
    vec3 detailView = caveSafeNormalize( mat3( viewMatrix ) * worldN, geoView );
    float keep = max( dot( detailView, geoView ), 0.0 );
    normal = caveSafeNormalize( mix( geoView, detailView, keep ), geoView );
  }
`

function applyCaveSurfaceShader(
  material: THREE.MeshStandardMaterial,
  tuning: CaveSurfaceMaterialTuning,
  detailMap: THREE.Texture,
): void {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uCaveDetailNormalMap = { value: detailMap }
    shader.uniforms.uCaveRockDetailScale = { value: tuning.rockDetailScale }
    shader.uniforms.uCaveRockNormalStrength = { value: tuning.rockNormalStrength }
    shader.uniforms.uCaveProceduralRockStrength = { value: tuning.proceduralRockStrength }
    shader.uniforms.uCaveMacroScale = { value: tuning.macroScale }
    shader.uniforms.uCaveWetnessScale = { value: tuning.wetnessScale }
    shader.uniforms.uCaveWetnessAmount = { value: tuning.wetnessAmount }
    shader.uniforms.uCaveDryRoughness = { value: tuning.dryRoughness }
    shader.uniforms.uCaveWetRoughness = { value: tuning.wetRoughness }
    shader.uniforms.uCaveWetDarkening = { value: tuning.wetDarkening }

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vWorldPos;',
      )
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;',
      )

    let frag = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWorldPos;
uniform sampler2D uCaveDetailNormalMap;
uniform float uCaveRockDetailScale;
uniform float uCaveRockNormalStrength;
uniform float uCaveProceduralRockStrength;
uniform float uCaveMacroScale;
uniform float uCaveWetnessScale;
uniform float uCaveWetnessAmount;
uniform float uCaveDryRoughness;
uniform float uCaveWetRoughness;
uniform float uCaveWetDarkening;
${CAVE_SURFACE_GLSL}`,
      )
      .replace(COLOR_FRAGMENT_INCLUDE, `${COLOR_FRAGMENT_INCLUDE}\n${CAVE_COLOR_CHUNK}`)
      .replace(
        ROUGHNESSMAP_FRAGMENT_INCLUDE,
        `${ROUGHNESSMAP_FRAGMENT_INCLUDE}\n${CAVE_ROUGHNESS_CHUNK}`,
      )

    if (frag.includes(NORMAL_MAP_INCLUDE)) {
      frag = frag.replace(NORMAL_MAP_INCLUDE, CAVE_NORMAL_CHUNK)
    } else {
      console.warn(
        `[caves] fragment shader has no ${NORMAL_MAP_INCLUDE} — cave rock detail disabled`,
      )
    }

    shader.fragmentShader = frag
  }

  material.customProgramCacheKey = () => SHADER_CACHE_KEY_DETAIL
}

export type CreateCaveHeightfieldMaterialOptions = {
  /** When false, returns the legacy matte vertex-colour material (debug A/B). */
  surfaceDetail?: boolean
  tuning?: CaveSurfaceMaterialTuning
}

/** `FrontSide` on purpose: it is the cheapest permanent detector for a
 *  winding regression. Do not "fix" a dark cave with `DoubleSide`. Smooth
 *  normals come from the shared-vertex geometry (`computeVertexNormals`).
 *  Surface polish is shader-only — no mesh position changes.
 *  The shared detail texture is a custom sampler, not `material.normalMap`:
 *  assigning `normalMap` would enable Three.js tangent-space / UV machinery
 *  on a heightfield mesh that has no UVs. */
export function createCaveHeightfieldMaterial(
  options: CreateCaveHeightfieldMaterialOptions = {},
): THREE.MeshStandardMaterial {
  const surfaceDetail = options.surfaceDetail ?? true
  const tuning = options.tuning ?? CAVE_SURFACE_MATERIAL_TUNING

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: tuning.dryRoughness,
    metalness: 0,
    flatShading: false,
    side: THREE.FrontSide,
  })

  if (surfaceDetail) {
    const detailMap = getSharedTerrainDetailNormalMap()
    applyCaveSurfaceShader(material, tuning, detailMap)
    material.userData.caveSurfaceDetail = true
    material.userData.caveDetailNormalMap = detailMap
  } else {
    material.roughness = 0.88
    material.customProgramCacheKey = () => SHADER_CACHE_KEY_PLAIN
    material.userData.caveSurfaceDetail = false
  }

  return material
}

/** Detach the shared detail normal map before `Material.dispose()` so terrain
 *  and future cave materials keep the process-wide texture alive. */
export function disposeCaveHeightfieldMaterialGpu(material: THREE.Material): void {
  if (!(material instanceof THREE.MeshStandardMaterial)) {
    material.dispose()
    return
  }
  material.normalMap = null
  material.userData.caveDetailNormalMap = null
  material.dispose()
}
