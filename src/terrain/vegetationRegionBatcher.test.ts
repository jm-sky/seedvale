import { BoxGeometry, Mesh, MeshStandardMaterial, Scene } from 'three'
import { describe, expect, it } from 'vitest'
import type { PropPlacement } from '../render/instancedProps'
import { createVegetationRegionBatcher } from './vegetationRegionBatcher'

function template(): Mesh {
  return new Mesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial())
}

function placement(key: string, x = 0, z = 0): PropPlacement {
  return { speciesIndex: 0, x, z, groundY: 0, rotationY: 0, scale: 1, key }
}

type CountMesh = { count: number }

function bucketOf(scene: Scene, name: string): CountMesh {
  const group = scene.children.find((c) => c.name === name)
  if (!group) throw new Error(`region group ${name} not found in scene`)
  const bucket = group.children[0] as unknown as CountMesh
  return bucket
}

describe('vegetationRegionBatcher', () => {
  it('unions placements from every chunk sharing a region', () => {
    const scene = new Scene()
    const batcher = createVegetationRegionBatcher(scene, 3)
    const templates = [template()]

    batcher.setChunkPlacements({ cx: 0, cz: 0 }, 'bush', templates, [placement('a')])
    batcher.setChunkPlacements({ cx: 1, cz: 0 }, 'bush', templates, [placement('b'), placement('c')])

    const bucket = bucketOf(scene, 'chunk-vegetation-region-0,0|bush')
    expect(bucket.count).toBe(3)
  })

  it('keeps chunks from different regions in separate groups', () => {
    const scene = new Scene()
    const batcher = createVegetationRegionBatcher(scene, 3)
    const templates = [template()]

    batcher.setChunkPlacements({ cx: 0, cz: 0 }, 'bush', templates, [placement('a')])
    batcher.setChunkPlacements({ cx: 5, cz: 0 }, 'bush', templates, [placement('b')])

    expect(bucketOf(scene, 'chunk-vegetation-region-0,0|bush').count).toBe(1)
    expect(bucketOf(scene, 'chunk-vegetation-region-1,0|bush').count).toBe(1)
  })

  it('shrinks the union back to exactly the remaining chunks on clearChunkPlacements', () => {
    const scene = new Scene()
    const batcher = createVegetationRegionBatcher(scene, 3)
    const templates = [template()]

    batcher.setChunkPlacements({ cx: 0, cz: 0 }, 'bush', templates, [placement('a')])
    batcher.setChunkPlacements({ cx: 1, cz: 0 }, 'bush', templates, [placement('b'), placement('c')])
    expect(bucketOf(scene, 'chunk-vegetation-region-0,0|bush').count).toBe(3)

    batcher.clearChunkPlacements({ cx: 1, cz: 0 })
    expect(bucketOf(scene, 'chunk-vegetation-region-0,0|bush').count).toBe(1)

    batcher.clearChunkPlacements({ cx: 0, cz: 0 })
    const group = scene.children.find((c) => c.name === 'chunk-vegetation-region-0,0|bush')
    expect(group).toBeUndefined()
  })

  it('removeByKey targets only tree-living and never resurrects on a later rebuild', () => {
    const scene = new Scene()
    const batcher = createVegetationRegionBatcher(scene, 3)
    const templates = [template()]

    batcher.setChunkPlacements({ cx: 0, cz: 0 }, 'tree-living', templates, [placement('t1'), placement('t2')])
    expect(bucketOf(scene, 'chunk-vegetation-region-0,0|tree-living').count).toBe(2)

    expect(batcher.removeByKey({ cx: 0, cz: 0 }, 't1')).toBe(true)
    expect(bucketOf(scene, 'chunk-vegetation-region-0,0|tree-living').count).toBe(1)

    // A sibling chunk in the same region loads and triggers a region rebuild —
    // the chopped tree must not come back.
    batcher.setChunkPlacements({ cx: 1, cz: 0 }, 'tree-living', templates, [placement('t3')])
    expect(bucketOf(scene, 'chunk-vegetation-region-0,0|tree-living').count).toBe(2)

    expect(batcher.removeByKey({ cx: 0, cz: 0 }, 'does-not-exist')).toBe(false)
  })

  it('removeByKey does not affect other kinds sharing the region', () => {
    const scene = new Scene()
    const batcher = createVegetationRegionBatcher(scene, 3)
    const templates = [template()]

    batcher.setChunkPlacements({ cx: 0, cz: 0 }, 'tree-living', templates, [placement('t1')])
    batcher.setChunkPlacements({ cx: 0, cz: 0 }, 'bush', templates, [placement('b1')])

    expect(batcher.removeByKey({ cx: 0, cz: 0 }, 'b1')).toBe(false)
    expect(bucketOf(scene, 'chunk-vegetation-region-0,0|bush').count).toBe(1)
  })

  it('syncLod applies the nearest (max-fraction) contributing chunk to the whole region+kind', () => {
    const scene = new Scene()
    const batcher = createVegetationRegionBatcher(scene, 3)
    const templates = [template()]

    batcher.setChunkPlacements({ cx: 0, cz: 0 }, 'bush', templates, [placement('a'), placement('b')])
    batcher.setChunkPlacements({ cx: 1, cz: 0 }, 'bush', templates, [placement('c'), placement('d')])

    batcher.syncLod({ cx: 0, cz: 0 }, 0.25) // far chunk
    batcher.syncLod({ cx: 1, cz: 0 }, 1) // near chunk
    // Conservative: nearest member wins, so the region draws at full fraction.
    expect(bucketOf(scene, 'chunk-vegetation-region-0,0|bush').count).toBe(4)

    batcher.syncLod({ cx: 1, cz: 0 }, 0.25) // both now far
    expect(bucketOf(scene, 'chunk-vegetation-region-0,0|bush').count).toBe(1)
  })

  it('dispose removes every group from the scene', () => {
    const scene = new Scene()
    const batcher = createVegetationRegionBatcher(scene, 3)
    const templates = [template()]
    batcher.setChunkPlacements({ cx: 0, cz: 0 }, 'bush', templates, [placement('a')])
    batcher.setChunkPlacements({ cx: 0, cz: 0 }, 'tree-living', templates, [placement('t1')])
    expect(scene.children.length).toBe(2)

    batcher.dispose()
    expect(scene.children.length).toBe(0)
  })
})
