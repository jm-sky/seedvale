import { MeshStandardMaterial } from 'three'
import { describe, expect, it } from 'vitest'
import {
  FOLIAGE_ALPHA_CUTOFF,
  hardenFoliageAlpha,
} from './foliageWind'

describe('hardenFoliageAlpha', () => {
  it('converts blended leaf materials to opaque alpha-tested cutouts', () => {
    const mat = new MeshStandardMaterial({
      name: 'MapleTree_Leaves',
      transparent: true,
      depthWrite: false,
      opacity: 1,
    })

    hardenFoliageAlpha(mat)

    expect(mat.transparent).toBe(false)
    expect(mat.depthWrite).toBe(true)
    expect(mat.alphaTest).toBe(FOLIAGE_ALPHA_CUTOFF)
  })

  it('leaves solid opaque crowns alone', () => {
    const mat = new MeshStandardMaterial({
      name: 'Green',
      transparent: false,
      depthWrite: true,
      opacity: 1,
    })

    hardenFoliageAlpha(mat)

    expect(mat.transparent).toBe(false)
    expect(mat.alphaTest).toBe(0)
  })

  it('ignores non-foliage materials', () => {
    const mat = new MeshStandardMaterial({
      name: 'MapleTree_Bark',
      transparent: true,
      depthWrite: false,
    })

    hardenFoliageAlpha(mat)

    expect(mat.transparent).toBe(true)
    expect(mat.depthWrite).toBe(false)
    expect(mat.userData.foliageAlphaHardened).toBeUndefined()
  })

  it('is idempotent on shared GPU materials', () => {
    const mat = new MeshStandardMaterial({
      name: 'Bush_Leaves',
      transparent: true,
      depthWrite: false,
    })

    hardenFoliageAlpha(mat)
    mat.alphaTest = 0.7
    hardenFoliageAlpha(mat)

    expect(mat.alphaTest).toBe(0.7)
  })
})
