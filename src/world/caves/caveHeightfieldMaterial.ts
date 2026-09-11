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
  wetnessAmount: 0.62,
  dryRoughness: 0.87,
  wetRoughness: 0.44,
  wetDarkening: 0.14,
} as const

export type CaveSurfaceMaterialTuning = typeof CAVE_SURFACE_MATERIAL_TUNING

const NORMAL_MAP_INCLUDE = '#include <normal_fragment_maps>'
const COLOR_FRAGMENT_INCLUDE = '#include <color_fragment>'
const ROUGHNESSMAP_FRAGMENT_INCLUDE = '#include <roughnessmap_fragment>'

const SHADER_CACHE_KEY_DETAIL = 'cave-heightfield-surface-v2-detail'
const SHADER_CACHE_KEY_PLAIN = 'cave-heightfield-surface-v2-plain'

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
vec3 caveOrientationWeights( vec3 n ) {
  float up = n.y;
  float floorW = smoothstep( 0.18, 0.82, up );
  float ceilW = smoothstep( 0.18, 0.82, -up );
  float wallW = clamp( 1.0 - max( floorW, ceilW ), 0.0, 1.0 );
  return vec3( floorW, wallW, ceilW );
}
float caveWetnessMask( vec3 worldPos, vec3 orient ) {
  float floorW = orient.x;
  float wallW = orient.y;
  float ceilW = orient.z;
  vec2 wetP = worldPos.xz * uCaveWetnessScale;
  float wetMacro = caveValueNoise( wetP + vec2( 19.2, 7.4 ) );
  float wetMacro2 = caveValueNoise( wetP * 1.85 + vec2( 41.0, 13.0 ) );
  float wetNoise = wetMacro * 0.68 + wetMacro2 * 0.32;
  float orientWet = floorW * 0.58 + wallW * 0.72 + ceilW * 0.28;
  orientWet += wallW * ( 1.0 - smoothstep( 0.15, 0.75, abs( normalize( vWorldNormal ).y ) ) ) * 0.18;
  float wetMask = smoothstep( 0.38, 0.78, wetNoise ) * orientWet * uCaveWetnessAmount;
  wetMask *= mix( 1.0, 0.62, floorW * smoothstep( 0.55, 0.88, wetNoise ) );
  return clamp( wetMask, 0.0, 1.0 );
}
vec3 caveTriplanarNormalSample( vec3 worldPos, vec3 blend, float scale ) {
  vec3 b = abs( blend );
  b = max( b, 1e-4 );
  b /= ( b.x + b.y + b.z );
  vec3 px = texture2D( normalMap, worldPos.yz * scale ).xyz * 2.0 - 1.0;
  vec3 py = texture2D( normalMap, worldPos.xz * scale ).xyz * 2.0 - 1.0;
  vec3 pz = texture2D( normalMap, worldPos.xy * scale ).xyz * 2.0 - 1.0;
  return normalize( px * b.x + py * b.y + pz * b.z );
}
void caveProceduralRockPerturb( vec3 worldPos, float scale, inout vec3 mapN ) {
  float s = scale * 3.6;
  vec2 p = worldPos.xz * s;
  float h = caveValueNoise( p );
  float hx = caveValueNoise( p + vec2( 0.07, 0.0 ) ) - h;
  float hz = caveValueNoise( p + vec2( 0.0, 0.07 ) ) - h;
  mapN.xy += vec2( hx, hz ) * uCaveProceduralRockStrength;
}
`

const CAVE_COLOR_CHUNK = /* glsl */ `
  {
    vec3 n = normalize( vWorldNormal );
    vec3 orient = caveOrientationWeights( n );
    vec2 macroP = vWorldPos.xz * uCaveMacroScale;
    float macro = caveValueNoise( macroP );
    float macro2 = caveValueNoise( macroP * 2.15 + vec2( 8.3, 22.1 ) );
    float macroMix = macro * 0.62 + macro2 * 0.38;

    vec3 tint = vec3( 1.0 );
    tint += orient.x * vec3( 0.07, 0.03, -0.05 );
    tint += orient.y * vec3( -0.025, -0.02, 0.03 );
    tint += orient.z * vec3( -0.07, -0.06, -0.06 );
    tint += ( macroMix - 0.5 ) * 0.09;
    diffuseColor.rgb *= tint;

    float wetMask = caveWetnessMask( vWorldPos, orient );
    diffuseColor.rgb *= 1.0 - wetMask * uCaveWetDarkening;
    diffuseColor.rgb = mix(
      diffuseColor.rgb,
      diffuseColor.rgb * vec3( 0.9, 0.94, 1.02 ),
      wetMask * 0.32
    );
  }
`

const CAVE_ROUGHNESS_CHUNK = /* glsl */ `
  {
    vec3 orient = caveOrientationWeights( normalize( vWorldNormal ) );
    float wetMask = caveWetnessMask( vWorldPos, orient );
    roughnessFactor = mix( uCaveDryRoughness, uCaveWetRoughness, wetMask );
  }
`

const CAVE_NORMAL_CHUNK = /* glsl */ `
  {
    vec3 n = normalize( vWorldNormal );
    vec3 orient = caveOrientationWeights( n );
    float detailAmt = uCaveRockNormalStrength * ( orient.y * 1.0 + orient.x * 0.38 + orient.z * 0.48 );
    vec3 mapN = caveTriplanarNormalSample( vWorldPos, n, uCaveRockDetailScale );
    caveProceduralRockPerturb( vWorldPos, uCaveRockDetailScale, mapN );
    mapN.xy *= detailAmt;
    normal = normalize( tbn * mapN );
  }
`

function applyCaveSurfaceShader(
  material: THREE.MeshStandardMaterial,
  tuning: CaveSurfaceMaterialTuning,
): void {
  material.onBeforeCompile = (shader) => {
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
        '#include <common>\nvarying vec3 vWorldPos;\nvarying vec3 vWorldNormal;',
      )
      .replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;',
      )
      .replace(
        '#include <defaultnormal_vertex>',
        '#include <defaultnormal_vertex>\nvWorldNormal = normalize( mat3( modelMatrix ) * objectNormal );',
      )

    let frag = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vWorldPos;
varying vec3 vWorldNormal;
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
 *  Surface polish is shader-only — no mesh position changes. */
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
    const normalMap = getSharedTerrainDetailNormalMap()
    material.normalMap = normalMap
    material.normalScale = new THREE.Vector2(1, 1)
    applyCaveSurfaceShader(material, tuning)
    material.userData.caveSurfaceDetail = true
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
  material.dispose()
}
