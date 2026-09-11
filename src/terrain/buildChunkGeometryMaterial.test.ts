import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { getSharedTerrainDirtDiffuse } from '../assets/sharedSurfaceDiffuseTextures'
import { createTerrainMaterial } from './buildChunkGeometry'

function injectTerrainShader(material: THREE.MeshStandardMaterial): {
  uniforms: Record<string, { value: unknown }>
  fragmentShader: string
} {
  const shader = {
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: [
      '#include <common>',
      '#include <begin_vertex>',
      '#include <beginnormal_vertex>',
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

const DETAIL_NORMAL = {
  enabled: true,
  strength: 0.5,
  tilesGrass: 8,
  tilesBare: 24,
} as const

describe('createTerrainMaterial', () => {
  it('shares one process-wide dirt diffuse sampler across materials', () => {
    const a = createTerrainMaterial(false, DETAIL_NORMAL, 0)
    const b = createTerrainMaterial(false, DETAIL_NORMAL, 0)
    const shared = getSharedTerrainDirtDiffuse()
    expect(a.userData.terrainDirtAlbedo).toBe(shared.map)
    expect(b.userData.terrainDirtAlbedo).toBe(shared.map)
    a.dispose()
    b.dispose()
    expect(getSharedTerrainDirtDiffuse().map.value.uuid).toBe(shared.map.value.uuid)
  })

  it('injects bare-ground dirt detail before macro and weather chunks', () => {
    const mat = createTerrainMaterial(true, DETAIL_NORMAL, 12)
    const { uniforms, fragmentShader } = injectTerrainShader(mat)

    expect(uniforms.uTerrainDirtAlbedo?.value).toBe(getSharedTerrainDirtDiffuse().map.value)
    expect(fragmentShader.match(/texture2D\(\s*uTerrainDirtAlbedo/g)?.length).toBe(1)
    expect(fragmentShader).toContain('vWorldPos.xz * uTerrainDirtWorldScale')
    expect(fragmentShader).toContain('smoothstep( uTerrainDirtBareStart, uTerrainDirtBareEnd, vBareGround )')
    expect(fragmentShader).toContain('uTerrainDirtFadeStart')
    expect(fragmentShader).toContain('uTerrainDirtFadeEnd')

    const dirtIdx = fragmentShader.indexOf('TERRAIN_DIRT_ALBEDO_CHUNK') >= 0
      ? fragmentShader.indexOf('uTerrainDirtAlbedo')
      : fragmentShader.indexOf('uTerrainDirtAlbedo')
    const macroIdx = fragmentShader.indexOf('terrainValueNoise( vWorldPos.xz * 0.045 )')
    const wetSandIdx = fragmentShader.indexOf('uWaterLevel + 0.4')
    expect(dirtIdx).toBeGreaterThan(-1)
    expect(macroIdx).toBeGreaterThan(dirtIdx)
    expect(wetSandIdx).toBeGreaterThan(macroIdx)
    expect(mat.customProgramCacheKey?.()).toContain('v7')

    mat.dispose()
  })
})
