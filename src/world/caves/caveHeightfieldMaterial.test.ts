/** Cave V2 shared surface material — wiring, shader contract, shared GPU. */

import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { getSharedCaveRockDiffuse } from '../../assets/sharedSurfaceDiffuseTextures'
import { getSharedTerrainDetailNormalMap } from '../../terrain/terrainDetailNormalMap'
import {
  alignCaveDetailNormalToGeometric,
  CAVE_SURFACE_MATERIAL_TUNING,
  type CaveVec3,
  createCaveHeightfieldMaterial,
  disposeCaveHeightfieldMaterialGpu,
  perturbCaveWorldNormalOnTangentPlane,
  reconstructCaveTriplanarWorldNormal,
} from './caveHeightfieldMaterial'

const FLAT_TANGENT: CaveVec3 = [0, 0, 1]
const BUMP_TANGENT: CaveVec3 = [0.35, -0.22, 0.91]
const AXIS_CASES: ReadonlyArray<{ name: string; normal: CaveVec3 }> = [
  { name: 'floor', normal: [0, 1, 0] },
  { name: 'wall X+', normal: [1, 0, 0] },
  { name: 'wall X-', normal: [-1, 0, 0] },
  { name: 'wall Z+', normal: [0, 0, 1] },
  { name: 'wall Z-', normal: [0, 0, -1] },
  { name: 'ceiling', normal: [0, -1, 0] },
]

function hypot3(v: CaveVec3): number {
  return Math.hypot(v[0], v[1], v[2])
}

function dot3(a: CaveVec3, b: CaveVec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function expectUnitFinite(v: readonly number[]): void {
  expect(v.every(Number.isFinite)).toBe(true)
  expect(hypot3(v as CaveVec3)).toBeCloseTo(1, 5)
}

function injectDetailShader(material: THREE.MeshStandardMaterial): {
  uniforms: Record<string, { value: unknown }>
  vertexShader: string
  fragmentShader: string
} {
  const shader = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: [
      '#include <common>',
      '#include <worldpos_vertex>',
    ].join('\n'),
    fragmentShader: [
      '#include <common>',
      '#include <color_fragment>',
      '#include <roughnessmap_fragment>',
      '#include <normal_fragment_maps>',
    ].join('\n'),
  }
  material.onBeforeCompile?.(
    shader as unknown as THREE.WebGLProgramParametersWithUniforms,
    null as unknown as THREE.WebGLRenderer,
  )
  return shader
}

describe('createCaveHeightfieldMaterial', () => {
  it('stays shared-compatible without enabling Three.js tangent-space normalMap', () => {
    const a = createCaveHeightfieldMaterial()
    const b = createCaveHeightfieldMaterial()
    const shared = getSharedTerrainDetailNormalMap()
    expect(a).not.toBe(b)
    expect(a.normalMap).toBeNull()
    expect(b.normalMap).toBeNull()
    expect(a.userData.caveDetailNormalMap).toBe(shared)
    expect(a.userData.caveRockAlbedo).toBe(getSharedCaveRockDiffuse().map)
    expect(b.userData.caveDetailNormalMap).toBe(shared)
    expect(a.userData.caveSurfaceDetail).toBe(true)
    expect(a.metalness).toBe(0)
    expect(a.side).toBe(THREE.FrontSide)
    disposeCaveHeightfieldMaterialGpu(a)
    disposeCaveHeightfieldMaterialGpu(b)
    expect(shared.uuid).toBe(getSharedTerrainDetailNormalMap().uuid)
  })

  it('installs shader hooks when surface detail is on', () => {
    const mat = createCaveHeightfieldMaterial({ tuning: CAVE_SURFACE_MATERIAL_TUNING })
    expect(mat.onBeforeCompile).toBeTypeOf('function')
    expect(mat.customProgramCacheKey?.()).toContain('cave-heightfield-surface')
    expect(mat.customProgramCacheKey?.()).toContain('detail')
    disposeCaveHeightfieldMaterialGpu(mat)
  })

  it('skips detail injection when surface detail is disabled', () => {
    const mat = createCaveHeightfieldMaterial({ surfaceDetail: false })
    expect(mat.normalMap).toBeNull()
    expect(mat.userData.caveSurfaceDetail).toBe(false)
    expect(mat.customProgramCacheKey?.()).toContain('plain')
    expect(mat.side).toBe(THREE.FrontSide)
    const shader = injectDetailShader(mat)
    expect(shader.fragmentShader).not.toContain('caveTriplanarWorldNormal')
    expect(shader.fragmentShader).not.toContain('uCaveRockAlbedo')
    expect(shader.fragmentShader).toContain('#include <normal_fragment_maps>')
    mat.dispose()
  })

  it('does not dispose the shared normal map with the material', () => {
    const shared = getSharedTerrainDetailNormalMap()
    const mat = createCaveHeightfieldMaterial()
    disposeCaveHeightfieldMaterialGpu(mat)
    expect(shared.uuid).toBe(getSharedTerrainDetailNormalMap().uuid)
  })
})

describe('cave surface shader contract', () => {
  it('perturbs the geometric view normal instead of replacing it through tbn or vWorldNormal', () => {
    const mat = createCaveHeightfieldMaterial()
    const { uniforms, vertexShader, fragmentShader } = injectDetailShader(mat)

    expect(mat.normalMap).toBeNull()
    expect(uniforms.uCaveDetailNormalMap?.value).toBe(getSharedTerrainDetailNormalMap())
    expect(uniforms.uCaveRockAlbedo?.value).toBe(getSharedCaveRockDiffuse().map.value)
    expect(fragmentShader).toContain('uniform sampler2D uCaveDetailNormalMap')
    expect(fragmentShader).toContain('uniform sampler2D uCaveRockAlbedo')
    expect(fragmentShader).toContain('texture2D( uCaveDetailNormalMap')
    expect(fragmentShader).toContain('texture2D( uCaveRockAlbedo')
    expect(fragmentShader.match(/texture2D\(\s*uCaveDetailNormalMap/g)?.length).toBe(3)
    expect(fragmentShader.match(/texture2D\(\s*uCaveRockAlbedo/g)?.length).toBe(3)
    expect(fragmentShader).toContain('caveTriplanarBlendWeights')
    expect(fragmentShader).toContain('caveViewToWorldDir( normalize( vNormal ) )')
    expect(fragmentShader).toContain('caveTriplanarWorldNormal')
    expect(fragmentShader).toContain('caveViewToWorldDir')
    expect(fragmentShader).toContain('( vec4( viewDir, 0.0 ) * viewMatrix )')
    expect(fragmentShader).toContain('geoView = caveSafeNormalize( normal')
    expect(fragmentShader).toContain('mix( geoView, detailView, keep )')
    expect(fragmentShader).toContain('worldPos.zy')
    expect(fragmentShader).toContain('worldPos.xz')
    expect(fragmentShader).toContain('worldPos.xy')
    expect(fragmentShader).toContain('tX.zyx * blend.x')
    expect(fragmentShader).toContain('tY.xzy * blend.y')
    expect(fragmentShader).toContain('tZ.xyz * blend.z')
    expect(fragmentShader).toContain('mat3( viewMatrix )')
    expect(fragmentShader).toContain('caveTriplanarValueNoise')
    expect(fragmentShader).toContain('caveTriplanarWetnessNoise')
    expect(fragmentShader).toContain('caveWetnessSample')
    expect(fragmentShader).toContain('caveGradientNoise')
    expect(fragmentShader).toContain('uCaveWetnessWallAnisotropy')
    expect(fragmentShader).toContain('p.y * uCaveWetnessWallAnisotropy')
    expect(fragmentShader).not.toContain('uCaveWetnessColumnBias')
    expect(uniforms.uCaveWetnessWallAnisotropy?.value).toBe(
      CAVE_SURFACE_MATERIAL_TUNING.wetnessWallAnisotropy,
    )
    expect(fragmentShader).toContain('caveWetnessMask( vWorldPos, geoWorld )')
    expect(fragmentShader.match(/caveWetnessMask\(\s*vWorldPos,\s*geoWorld\s*\)/g)?.length).toBe(2)
    expect(fragmentShader).toContain('xProjection * blend.x')
    expect(fragmentShader).toContain('yProjection * blend.y')
    expect(fragmentShader).toContain('zProjection * blend.z')
    expect(fragmentShader.match(/geoWorld = caveViewToWorldDir\(\s*normalize\(\s*vNormal\s*\)\s*\)/g)?.length).toBe(2)
    expect(fragmentShader).not.toContain('caveOrientationWeights')
    expect(fragmentShader).not.toContain('tbn *')
    expect(fragmentShader).not.toContain('texture2D( normalMap')
    expect(fragmentShader).not.toContain('px * b.x + py * b.y + pz * b.z')
    expect(vertexShader).toContain('vWorldPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz')
    expect(vertexShader).not.toContain('vWorldNormal')

    disposeCaveHeightfieldMaterialGpu(mat)
  })

  it('keeps FrontSide and shared normal-map ownership after shader install', () => {
    const mat = createCaveHeightfieldMaterial()
    injectDetailShader(mat)
    expect(mat.side).toBe(THREE.FrontSide)
    expect(mat.normalMap).toBeNull()
    expect(mat.userData.caveDetailNormalMap).toBe(getSharedTerrainDetailNormalMap())
    expect(mat.userData.caveSurfaceDetail).toBe(true)
    disposeCaveHeightfieldMaterialGpu(mat)
  })
})

describe('reconstructCaveTriplanarWorldNormal', () => {
  it('maps a flat tangent sample onto floor, walls and ceiling', () => {
    for (const { name, normal } of AXIS_CASES) {
      const out = reconstructCaveTriplanarWorldNormal(
        normal,
        FLAT_TANGENT,
        FLAT_TANGENT,
        FLAT_TANGENT,
        0.42,
      )
      expectUnitFinite(out)
      expect(dot3(out, normal), name).toBeGreaterThan(0.98)
    }
  })

  it('keeps perturbed samples finite, unit-length and in the geometric hemisphere', () => {
    for (const { name, normal } of AXIS_CASES) {
      const out = reconstructCaveTriplanarWorldNormal(
        normal,
        BUMP_TANGENT,
        BUMP_TANGENT,
        BUMP_TANGENT,
        0.42,
      )
      expectUnitFinite(out)
      expect(dot3(out, normal), name).toBeGreaterThan(0.55)
    }
  })

  it('does not treat a raw X-projection tangent sample as a world normal', () => {
    const wallX: CaveVec3 = [1, 0, 0]
    const naiveBlend = FLAT_TANGENT
    expect(dot3(naiveBlend, wallX)).toBeCloseTo(0)
    const reconstructed = reconstructCaveTriplanarWorldNormal(
      wallX,
      FLAT_TANGENT,
      FLAT_TANGENT,
      FLAT_TANGENT,
      1,
    )
    expect(reconstructed[0]).toBeCloseTo(1, 5)
    expect(Math.abs(reconstructed[1])).toBeLessThan(1e-5)
    expect(Math.abs(reconstructed[2])).toBeLessThan(1e-5)
  })

  it('falls back to a finite unit normal when the geometric input is degenerate', () => {
    const out = reconstructCaveTriplanarWorldNormal(
      [0, 0, 0],
      BUMP_TANGENT,
      BUMP_TANGENT,
      BUMP_TANGENT,
      0.42,
    )
    expectUnitFinite(out)
  })
})

describe('perturbCaveWorldNormalOnTangentPlane', () => {
  it('does not flip wall or ceiling normals', () => {
    const slope: [number, number] = [0.45, -0.3]
    for (const { name, normal } of AXIS_CASES) {
      const out = perturbCaveWorldNormalOnTangentPlane(normal, slope, 0.22)
      expectUnitFinite(out)
      expect(dot3(out, normal), name).toBeGreaterThan(0.9)
    }
  })
})

describe('alignCaveDetailNormalToGeometric', () => {
  it('keeps a flipped detail sample from hiding floor, walls or ceiling', () => {
    for (const { name, normal } of AXIS_CASES) {
      const flipped: CaveVec3 = [-normal[0], -normal[1], -normal[2]]
      const out = alignCaveDetailNormalToGeometric(normal, flipped)
      expectUnitFinite(out)
      expect(dot3(out, normal), name).toBeGreaterThan(0.98)
    }
  })

  it('preserves an aligned detail sample', () => {
    const wall: CaveVec3 = [1, 0, 0]
    const detail: CaveVec3 = [0.96, 0.2, -0.1]
    const out = alignCaveDetailNormalToGeometric(wall, detail)
    expectUnitFinite(out)
    expect(dot3(out, wall)).toBeGreaterThan(0.9)
    expect(out[1]).not.toBeCloseTo(0, 3)
  })
})
