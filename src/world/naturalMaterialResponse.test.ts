import {
  Color,
  DataTexture,
  MeshBasicMaterial,
  MeshStandardMaterial,
} from 'three'
import { describe, expect, it } from 'vitest'
import {
  FALLEN_LOG_SPECS,
  ROCK_CLUSTER_SPECS,
  ROCK_SPECS,
  TREE_SPECS,
} from '../settlement/propSpecs'
import {
  applyNaturalMaterialResponseOnObject,
  NATURAL_MATERIAL_METALNESS_MAX,
  NATURAL_MATERIAL_ROUGHNESS_MIN_ROCK,
  NATURAL_MATERIAL_ROUGHNESS_MIN_WOOD,
  naturalMaterialProfileForUrl,
  tuneNaturalMaterial,
} from './naturalMaterialResponse'

describe('tuneNaturalMaterial', () => {
  it('clamps glossy/metallic rock scalars and preserves map/color', () => {
    const map = new DataTexture(new Uint8Array([255, 0, 0]), 1, 1)
    const color = new Color(0x336699)
    const mat = new MeshStandardMaterial({
      name: 'Stone',
      metalness: 0.4,
      roughness: 0.27,
      map,
      color,
    })

    tuneNaturalMaterial(mat, 'rock')

    expect(mat.metalness).toBe(NATURAL_MATERIAL_METALNESS_MAX)
    expect(mat.roughness).toBe(NATURAL_MATERIAL_ROUGHNESS_MIN_ROCK)
    expect(mat.map).toBe(map)
    expect(mat.color.getHex()).toBe(color.getHex())
    expect(mat.userData.naturalMaterialResponseProfile).toBe('rock')
  })

  it('does not overcorrect already-valid rock values', () => {
    const mat = new MeshStandardMaterial({
      name: 'Stone',
      metalness: 0,
      roughness: 0.5,
    })

    tuneNaturalMaterial(mat, 'rock')

    expect(mat.metalness).toBe(0)
    expect(mat.roughness).toBe(0.5)
    expect(mat.userData.naturalMaterialResponseProfile).toBeUndefined()
  })

  it('is idempotent on repeated application', () => {
    const mat = new MeshStandardMaterial({
      name: 'Rock',
      metalness: 0.4,
      roughness: 0.2,
    })

    tuneNaturalMaterial(mat, 'rock')
    const metalness = mat.metalness
    const roughness = mat.roughness
    tuneNaturalMaterial(mat, 'rock')

    expect(mat.metalness).toBe(metalness)
    expect(mat.roughness).toBe(roughness)
  })

  it('leaves foliage materials untouched under wood profile', () => {
    const mat = new MeshStandardMaterial({
      name: 'MapleTree_Leaves',
      metalness: 0.4,
      roughness: 0.2,
      transparent: true,
      depthWrite: false,
    })

    tuneNaturalMaterial(mat, 'wood')

    expect(mat.metalness).toBe(0.4)
    expect(mat.roughness).toBe(0.2)
    expect(mat.transparent).toBe(true)
    expect(mat.depthWrite).toBe(false)
  })

  it('tunes bark under wood profile', () => {
    const mat = new MeshStandardMaterial({
      name: 'MapleTree_Bark',
      metalness: 0.4,
      roughness: 0.41,
    })

    tuneNaturalMaterial(mat, 'wood')

    expect(mat.metalness).toBe(NATURAL_MATERIAL_METALNESS_MAX)
    expect(mat.roughness).toBe(NATURAL_MATERIAL_ROUGHNESS_MIN_WOOD)
  })

  it('ignores non-MeshStandardMaterial', () => {
    const mat = new MeshBasicMaterial({ name: 'Stone' })

    tuneNaturalMaterial(mat, 'rock')

    expect(mat).toBeInstanceOf(MeshBasicMaterial)
  })
})

describe('naturalMaterialProfileForUrl', () => {
  it('maps explicit nature asset URLs to rock or wood', () => {
    for (const spec of ROCK_SPECS) {
      expect(naturalMaterialProfileForUrl(spec.url)).toBe('rock')
    }
    for (const spec of ROCK_CLUSTER_SPECS) {
      expect(naturalMaterialProfileForUrl(spec.url)).toBe('rock')
    }
    for (const spec of TREE_SPECS) {
      expect(naturalMaterialProfileForUrl(spec.url)).toBe('wood')
    }
    for (const spec of FALLEN_LOG_SPECS) {
      expect(naturalMaterialProfileForUrl(spec.url)).toBe('wood')
    }
  })

  it('returns null for unrelated URLs', () => {
    expect(naturalMaterialProfileForUrl('/models/settlement/hut_a.glb')).toBeNull()
    expect(naturalMaterialProfileForUrl('/models/nature/bush_a.glb')).toBeNull()
  })
})

describe('applyNaturalMaterialResponseOnObject', () => {
  it('preserves shared material identity (no cloning)', () => {
    const shared = new MeshStandardMaterial({
      name: 'Wood',
      metalness: 0.4,
      roughness: 0.41,
    })
    const root = {
      traverse(fn: (obj: { isMesh?: boolean, material?: MeshStandardMaterial }) => void) {
        fn({ isMesh: true, material: shared })
        fn({ isMesh: true, material: shared })
      },
    }

    applyNaturalMaterialResponseOnObject(root as never, 'wood')

    expect(shared.metalness).toBe(NATURAL_MATERIAL_METALNESS_MAX)
    expect(shared.roughness).toBe(NATURAL_MATERIAL_ROUGHNESS_MIN_WOOD)
  })
})
