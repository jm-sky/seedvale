/** Cave V2 shared surface material — wiring, shader contract, shared GPU. */

import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { getSharedTerrainDetailNormalMap } from '../../terrain/terrainDetailNormalMap'
import {
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
  vertexShader: string
  fragmentShader: string
} {
  const shader = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: [
      '#include <common>',
      '#include <worldpos_vertex>',
      '#include <defaultnormal_vertex>',
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
  it('stays shared-compatible: one material, one normal map reference', () => {
    const a = createCaveHeightfieldMaterial()
    const b = createCaveHeightfieldMaterial()
    expect(a).not.toBe(b)
    expect(a.normalMap).toBe(b.normalMap)
    expect(a.normalMap).toBe(getSharedTerrainDetailNormalMap())
    expect(a.userData.caveSurfaceDetail).toBe(true)
    expect(a.metalness).toBe(0)
    expect(a.side).toBe(THREE.FrontSide)
    disposeCaveHeightfieldMaterialGpu(a)
    disposeCaveHeightfieldMaterialGpu(b)
    expect(getSharedTerrainDetailNormalMap().uuid).toBeTruthy()
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
  it('reconstructs world-space triplanar normals instead of blending tangent samples through tbn', () => {
    const mat = createCaveHeightfieldMaterial()
    const { vertexShader, fragmentShader } = injectDetailShader(mat)

    expect(fragmentShader).toContain('caveTriplanarWorldNormal')
    expect(fragmentShader).toContain('worldPos.zy')
    expect(fragmentShader).toContain('worldPos.xz')
    expect(fragmentShader).toContain('worldPos.xy')
    expect(fragmentShader).toContain('tX.zyx * blend.x')
    expect(fragmentShader).toContain('tY.xzy * blend.y')
    expect(fragmentShader).toContain('tZ.xyz * blend.z')
    expect(fragmentShader).toContain('mat3( viewMatrix )')
    expect(fragmentShader).not.toContain('tbn *')
    expect(fragmentShader).not.toContain('px * b.x + py * b.y + pz * b.z')
    expect(vertexShader).toContain('vWorldNormal = mat3( modelMatrix ) * objectNormal')
    expect(vertexShader).not.toContain('normalize( mat3( modelMatrix ) * objectNormal )')

    disposeCaveHeightfieldMaterialGpu(mat)
  })

  it('keeps FrontSide and shared normal-map ownership after shader install', () => {
    const mat = createCaveHeightfieldMaterial()
    injectDetailShader(mat)
    expect(mat.side).toBe(THREE.FrontSide)
    expect(mat.normalMap).toBe(getSharedTerrainDetailNormalMap())
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
