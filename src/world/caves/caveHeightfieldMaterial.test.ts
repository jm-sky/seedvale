/** Cave V2 shared surface material — wiring, shared GPU ownership, disposal. */

import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { getSharedTerrainDetailNormalMap } from '../../terrain/terrainDetailNormalMap'
import {
  CAVE_SURFACE_MATERIAL_TUNING,
  createCaveHeightfieldMaterial,
  disposeCaveHeightfieldMaterialGpu,
} from './caveHeightfieldMaterial'

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
    disposeCaveHeightfieldMaterialGpu(mat)
  })

  it('skips detail injection when surface detail is disabled', () => {
    const mat = createCaveHeightfieldMaterial({ surfaceDetail: false })
    expect(mat.normalMap).toBeNull()
    expect(mat.userData.caveSurfaceDetail).toBe(false)
    expect(mat.customProgramCacheKey?.()).toContain('plain')
    mat.dispose()
  })

  it('does not dispose the shared normal map with the material', () => {
    const shared = getSharedTerrainDetailNormalMap()
    const mat = createCaveHeightfieldMaterial()
    disposeCaveHeightfieldMaterialGpu(mat)
    expect(shared.uuid).toBe(getSharedTerrainDetailNormalMap().uuid)
  })
})
