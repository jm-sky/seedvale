import { BoxGeometry, Mesh, MeshStandardMaterial, Scene } from 'three'
import { describe, expect, it } from 'vitest'
import type { PropPlacement } from '../render/instancedProps'
import { DENSITY_LOD_FLOOR, densityLodFraction } from './distanceLod'
import {
  createVegetationRegionBatcher,
  type VegetationKind,
  vegetationLodFraction,
} from './vegetationRegionBatcher'

const ALL_KINDS: readonly VegetationKind[] = [
  'tree-living',
  'bush',
  'cactus',
  'reed',
  'fern',
  'lily',
  'seaweed',
  'largeRock',
  'rockCluster',
  'fallenLog',
]

const SILHOUETTE_KINDS: readonly VegetationKind[] = ['tree-living', 'cactus', 'largeRock']
const MEDIUM_KINDS: readonly VegetationKind[] = ['fallenLog', 'rockCluster']
const DETAIL_KINDS: readonly VegetationKind[] = ['bush', 'reed', 'lily']
const GROUND_DETAIL_KINDS: readonly VegetationKind[] = ['fern', 'seaweed']

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

    batcher.syncLod({ cx: 0, cz: 0 }, 3, 3, 1) // far chunk (floor)
    batcher.syncLod({ cx: 1, cz: 0 }, 0, 3, 1) // near chunk (full)
    // Conservative: nearest member wins, so the region draws at full fraction.
    expect(bucketOf(scene, 'chunk-vegetation-region-0,0|bush').count).toBe(4)

    batcher.syncLod({ cx: 1, cz: 0 }, 3, 3, 1) // both now far
    expect(bucketOf(scene, 'chunk-vegetation-region-0,0|bush').count).toBe(1)
  })

  it('syncLod applies a different effective fraction per kind in the same region (mid distance)', () => {
    const scene = new Scene()
    const batcher = createVegetationRegionBatcher(scene, 3)
    const templates = [template()]

    // 10 instances each so rounding differences between classes are visible.
    const placements = Array.from({ length: 10 }, (_, i) => placement(`p${i}`))
    batcher.setChunkPlacements({ cx: 0, cz: 0 }, 'tree-living', templates, placements)
    batcher.setChunkPlacements({ cx: 0, cz: 0 }, 'fern', templates, placements)

    batcher.syncLod({ cx: 0, cz: 0 }, 2, 3, 1) // mid distance (dist 2 / radius 3 / High)

    const treeCount = bucketOf(scene, 'chunk-vegetation-region-0,0|tree-living').count
    const fernCount = bucketOf(scene, 'chunk-vegetation-region-0,0|fern').count
    expect(treeCount).toBeGreaterThan(fernCount)
    expect(treeCount).toBe(Math.round(10 * densityLodFraction(2, 3, 1)))
  })

  it('rebuild reapplies the current effective per-kind LOD from stored chunkFractions', () => {
    const scene = new Scene()
    const batcher = createVegetationRegionBatcher(scene, 3)
    const templates = [template()]

    const placements = Array.from({ length: 10 }, (_, i) => placement(`p${i}`))
    batcher.setChunkPlacements({ cx: 0, cz: 0 }, 'fern', templates, placements)
    batcher.syncLod({ cx: 0, cz: 0 }, 2, 3, 1) // mid distance
    const frac = vegetationLodFraction('fern', 2, 3, 1)
    expect(frac).toBeLessThan(1)
    expect(bucketOf(scene, 'chunk-vegetation-region-0,0|fern').count).toBe(Math.round(10 * frac))

    // Re-submitting the same chunk's placements (e.g. a content refresh)
    // triggers `rebuild()` again — it must re-derive the group's LOD from
    // the already-stored per-kind `chunkFractions`, not reset to full.
    const morePlacements = Array.from({ length: 12 }, (_, i) => placement(`q${i}`))
    batcher.setChunkPlacements({ cx: 0, cz: 0 }, 'fern', templates, morePlacements)
    expect(bucketOf(scene, 'chunk-vegetation-region-0,0|fern').count).toBe(Math.round(12 * frac))
  })

  it('reflection visibility stays independent of vegetation LOD syncing', () => {
    const scene = new Scene()
    const batcher = createVegetationRegionBatcher(scene, 3)
    const templates = [template()]

    batcher.setChunkPlacements({ cx: 0, cz: 0 }, 'fern', templates, [placement('a')])
    batcher.syncReflectionVisibility({ cx: 0, cz: 0 }, false)

    const group = scene.children.find((c) => c.name === 'chunk-vegetation-region-0,0|fern')!
    const layerMaskAfterReflectionSync = group.layers.mask

    // Changing distance-based LOD must not touch reflection layer assignment,
    // whatever `syncReflectionVisibility` last resolved it to.
    batcher.syncLod({ cx: 0, cz: 0 }, 2, 3, 1)
    expect(group.layers.mask).toBe(layerMaskAfterReflectionSync)
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

describe('vegetationLodFraction', () => {
  const RADIUS = 3
  const HIGH = 1
  const MEDIUM = 0.75
  const LOW = 0.5

  it('maps every VegetationKind to its intended policy class (mid distance)', () => {
    const base = densityLodFraction(2, RADIUS, HIGH)
    const values = new Map(ALL_KINDS.map((kind) => [kind, vegetationLodFraction(kind, 2, RADIUS, HIGH)]))

    for (const kind of SILHOUETTE_KINDS) expect(values.get(kind)).toBeCloseTo(base, 10)
    for (const kind of MEDIUM_KINDS) expect(values.get(kind)).toBeCloseTo(base, 10)

    const detailValue = values.get('bush')!
    for (const kind of DETAIL_KINDS) expect(values.get(kind)).toBeCloseTo(detailValue, 10)
    expect(detailValue).toBeLessThan(base)

    const groundDetailValue = values.get('fern')!
    for (const kind of GROUND_DETAIL_KINDS) expect(values.get(kind)).toBeCloseTo(groundDetailValue, 10)
    expect(groundDetailValue).toBeLessThan(detailValue)
  })

  it('keeps near field at the shared base fraction for every kind and quality preset', () => {
    for (const lodScale of [LOW, MEDIUM, HIGH]) {
      for (const dist of [0, 1]) {
        const base = densityLodFraction(dist, RADIUS, lodScale)
        for (const kind of ALL_KINDS) expect(vegetationLodFraction(kind, dist, RADIUS, lodScale)).toBeCloseTo(base, 10)
      }
    }
    // High/loadRadius=3's near field is exactly full density.
    expect(densityLodFraction(0, RADIUS, HIGH)).toBe(1)
    expect(densityLodFraction(1, RADIUS, HIGH)).toBe(1)
  })

  it('silhouette and medium kinds match the shared curve exactly at every distance', () => {
    for (const kind of [...SILHOUETTE_KINDS, ...MEDIUM_KINDS]) {
      for (let dist = 0; dist <= RADIUS + 1; dist++) {
        expect(vegetationLodFraction(kind, dist, RADIUS, HIGH)).toBe(densityLodFraction(dist, RADIUS, HIGH))
      }
    }
  })

  it('detail kinds are reduced only in the partial/mid distance band', () => {
    for (const kind of DETAIL_KINDS) {
      expect(vegetationLodFraction(kind, 0, RADIUS, HIGH)).toBe(densityLodFraction(0, RADIUS, HIGH))
      expect(vegetationLodFraction(kind, 1, RADIUS, HIGH)).toBe(densityLodFraction(1, RADIUS, HIGH))
      expect(vegetationLodFraction(kind, 2, RADIUS, HIGH)).toBeLessThan(densityLodFraction(2, RADIUS, HIGH))
      expect(vegetationLodFraction(kind, 3, RADIUS, HIGH)).toBe(densityLodFraction(3, RADIUS, HIGH))
    }
  })

  it('groundDetail kinds are more aggressive than detail kinds in the mid band', () => {
    for (const groundKind of GROUND_DETAIL_KINDS) {
      for (const detailKind of DETAIL_KINDS) {
        expect(vegetationLodFraction(groundKind, 2, RADIUS, HIGH)).toBeLessThan(
          vegetationLodFraction(detailKind, 2, RADIUS, HIGH),
        )
      }
    }
  })

  it('never exceeds the baseline density fraction', () => {
    for (const lodScale of [LOW, MEDIUM, HIGH]) {
      for (const kind of ALL_KINDS) {
        for (let dist = 0; dist <= RADIUS + 1; dist++) {
          const base = densityLodFraction(dist, RADIUS, lodScale)
          expect(vegetationLodFraction(kind, dist, RADIUS, lodScale)).toBeLessThanOrEqual(base + 1e-9)
        }
      }
    }
  })

  it('preserves the current far floor for every kind', () => {
    for (const kind of ALL_KINDS) {
      expect(vegetationLodFraction(kind, RADIUS, RADIUS, HIGH)).toBe(DENSITY_LOD_FLOOR)
      expect(vegetationLodFraction(kind, RADIUS + 5, RADIUS, HIGH)).toBe(DENSITY_LOD_FLOOR)
    }
  })

  it('is monotonically non-increasing with distance for every kind', () => {
    for (const kind of ALL_KINDS) {
      let prev = Number.POSITIVE_INFINITY
      for (let dist = 0; dist <= RADIUS + 3; dist++) {
        const value = vegetationLodFraction(kind, dist, RADIUS, HIGH)
        expect(value).toBeLessThanOrEqual(prev + 1e-9)
        prev = value
      }
    }
  })

  it('Low/Medium/High lodScale still scale the resolved per-kind fraction', () => {
    const low = vegetationLodFraction('fern', 2, RADIUS, LOW)
    const medium = vegetationLodFraction('fern', 2, RADIUS, MEDIUM)
    const high = vegetationLodFraction('fern', 2, RADIUS, HIGH)
    expect(low).toBeLessThan(medium)
    expect(medium).toBeLessThan(high)
  })

  it('tree-living and fern in the same region can resolve to different effective fractions', () => {
    const tree = vegetationLodFraction('tree-living', 2, RADIUS, HIGH)
    const fern = vegetationLodFraction('fern', 2, RADIUS, HIGH)
    expect(tree).not.toBe(fern)
  })
})
