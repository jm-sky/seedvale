/** Plan world-terrain-020 Stage D — adventure props attach/dispose with cave streaming. */

import * as THREE from 'three'
import { Scene } from 'three'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ChunkManager } from '../terrain/chunkManager'
import type { TerrainCutout } from '../terrain/terrainCutout'
import type { Collider } from './collision'
import { createBenchmarkWorldConfig } from '../config/worldConfig'
import { villageSizeConfig } from '../settlement/families'
import {
  type RawSampleParams,
  sampleContinentalnessAt,
  sampleHeightAt,
  sampleMountainRidgeAt,
} from '../terrain/chunkHeightmap'
import {
  CAVE_ADVENTURE_PROPS_GROUP_NAME,
  preloadCaveAdventurePropTemplates,
  presentationAnchorsFromContent,
} from './caves/caveAdventureProps'
import { CAVE_DEACTIVATE_DISTANCE } from './caves/cavePresentationLifecycle'
import { createCaves } from './createCaves'
import { createPointLightBudget } from './pointLightBudget'

const SEED = 1136726869

function terrainParams(): RawSampleParams {
  const config = createBenchmarkWorldConfig({ seed: SEED, terrainResolution: 65, loadRadius: 4 })
  const t = config.terrain
  return {
    seed: config.seed,
    heightScale: t.heightScale,
    waterLevel: t.waterLevel,
    noiseScale: t.noiseScale,
    detailAmplitude: t.detailAmplitude,
    hillsScale: t.hillsScale,
    hillsAmplitude: t.hillsAmplitude,
    hillsFbm: t.hillsFbm,
    fbm: t.fbm,
    biome: t.biome,
    region: t.region,
  }
}

function fakeChunkManager(): ChunkManager {
  const params = terrainParams()
  const fake = {
    waterLevel: params.waterLevel,
    sampleHeight: (x: number, z: number) => sampleHeightAt(x, z, params),
    sampleBaseHeight: (x: number, z: number) => sampleHeightAt(x, z, params),
    sampleContinentalness: (x: number, z: number) => sampleContinentalnessAt(x, z, params),
    sampleMountainRidge: (x: number, z: number) => sampleMountainRidgeAt(x, z, params),
    roadCorridorsNear: () => [],
    modifyTerrain: () => true,
    registerTerrainCutouts: (_ownerKey: string, _cutouts: readonly TerrainCutout[]) => {},
    clearTerrainCutouts: () => {},
    registerColliders: (_ownerKey: string, _colliders: readonly Collider[]) => {},
    clearColliders: () => {},
  }
  return fake as unknown as ChunkManager
}

function caveGroup(scene: Scene, caveId: string): THREE.Object3D | undefined {
  return scene.children.find((o) => o.name === `cave:${caveId}`)
}

function adventurePropsGroup(caveRoot: THREE.Object3D): THREE.Object3D | undefined {
  return caveRoot.children.find((c) => c.name === CAVE_ADVENTURE_PROPS_GROUP_NAME)
}

beforeAll(async () => {
  await preloadCaveAdventurePropTemplates()
})

describe('createCaves adventure presentation props (plan world-terrain-020 Stage D)', () => {
  it('streams props in/out with presentation and does not duplicate on reactivation', () => {
    const scene = new Scene()
    const budget = createPointLightBudget(scene, 16)
    const caves = createCaves(
      scene,
      fakeChunkManager(),
      SEED,
      villageSizeConfig('MD').footprintRadius,
      0.45,
      budget,
    )

    const adventureDef = caves.definitions().find((d) => caves.archetypeOf(d.caveId) === 'adventure')
    expect(adventureDef).toBeDefined()
    const expectedPropCount = presentationAnchorsFromContent(caves.contentAnchorsOf(adventureDef!.caveId)).length
    expect(expectedPropCount).toBeGreaterThan(0)

    const { x, z } = adventureDef!.entrance
    caves.update(x, z)
    const root1 = caveGroup(scene, adventureDef!.caveId)
    expect(root1).toBeDefined()
    const props1 = adventurePropsGroup(root1!)
    expect(props1).toBeDefined()
    expect(props1!.children).toHaveLength(expectedPropCount)

    const interior1 = root1!.children.find((c) => c.name === `cave-interior:${adventureDef!.caveId}`) as THREE.Mesh
    const sharedMaterial = interior1.material

    const snapLit = budget.sync()
    expect(snapLit.realCount).toBeLessThanOrEqual(2)

    const farX = adventureDef!.bounds.maxX + CAVE_DEACTIVATE_DISTANCE + 5
    caves.update(farX, z)
    expect(caveGroup(scene, adventureDef!.caveId)).toBeUndefined()
    expect(budget.sync().realCount).toBe(0)

    caves.update(x, z)
    const root2 = caveGroup(scene, adventureDef!.caveId)
    expect(root2).toBeDefined()
    expect(root2).not.toBe(root1)
    const props2 = adventurePropsGroup(root2!)
    expect(props2!.children).toHaveLength(expectedPropCount)
    const interior2 = root2!.children.find((c) => c.name === `cave-interior:${adventureDef!.caveId}`) as THREE.Mesh
    expect(interior2.material).toBe(sharedMaterial)

    caves.dispose()
    budget.dispose()
  })

  it('does not add adventure props to a natural cave presentation', () => {
    const scene = new Scene()
    const caves = createCaves(
      scene,
      fakeChunkManager(),
      SEED,
      villageSizeConfig('MD').footprintRadius,
      0.45,
    )
    const naturalDef = caves.definitions().find((d) => caves.archetypeOf(d.caveId) === 'natural')
    expect(naturalDef).toBeDefined()
    caves.update(naturalDef!.entrance.x, naturalDef!.entrance.z)
    const root = caveGroup(scene, naturalDef!.caveId)
    expect(root).toBeDefined()
    expect(adventurePropsGroup(root!)).toBeUndefined()
    caves.dispose()
  })
})
