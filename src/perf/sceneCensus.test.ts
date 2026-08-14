import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Scene,
} from 'three'
import { describe, expect, it } from 'vitest'
import { censusScene, classifyObject, hideBuckets, restoreVisibility } from './sceneCensus'

function namedMesh(name: string): Mesh {
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial())
  mesh.name = name
  return mesh
}

describe('classifyObject', () => {
  it('walks ancestors for chunk / settlement names', () => {
    const group = new Group()
    group.name = 'chunk-vegetation-tree-living'
    const mesh = namedMesh('leaf')
    group.add(mesh)
    expect(classifyObject(mesh)).toBe('vegetation')
  })

  it('classifies fauna by userData when the name is missing', () => {
    const mesh = namedMesh('wolf')
    mesh.userData.animalKind = 'wolf'
    expect(classifyObject(mesh)).toBe('fauna')
  })
})

describe('censusScene', () => {
  it('counts instanced grass separately from terrain', () => {
    const scene = new Scene()
    scene.add(namedMesh('chunk'))
    const grass = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial(), 10)
    grass.name = 'chunk-grass-main'
    grass.count = 10
    scene.add(grass)
    const census = censusScene(scene)
    expect(census.terrain.meshes).toBe(1)
    expect(census.grass.instancedMeshes).toBe(1)
    expect(census.grass.instances).toBe(10)
    expect(census.grass.drawCalls).toBe(1)
    expect(census.grass.triangles).toBeGreaterThan(census.terrain.triangles)
  })
})

describe('hideBuckets', () => {
  it('hides matching meshes and restores them', () => {
    const scene = new Scene()
    const grass = namedMesh('chunk-grass-main')
    const terrain = namedMesh('chunk')
    scene.add(grass)
    scene.add(terrain)
    const tokens = hideBuckets(scene, ['grass'])
    expect(grass.visible).toBe(false)
    expect(terrain.visible).toBe(true)
    restoreVisibility(tokens)
    expect(grass.visible).toBe(true)
  })
})
