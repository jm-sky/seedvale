import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  Scene,
} from 'three'
import { describe, expect, it } from 'vitest'
import {
  censusScene,
  censusSettlementShadowCasters,
  censusShadowCasters,
  classifyObject,
  classifySettlementContent,
  hideBuckets,
  restoreVisibility,
  SETTLEMENT_SHADOW_KIND_USERDATA,
} from './sceneCensus'

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

describe('censusShadowCasters', () => {
  it('skips meshes with castShadow=false', () => {
    const scene = new Scene()
    const mesh = namedMesh('settlement')
    mesh.castShadow = false
    scene.add(mesh)
    const census = censusShadowCasters(scene)
    expect(census.settlement.meshes).toBe(0)
    expect(census.settlement.drawCalls).toBe(0)
  })

  it('counts a normal mesh with castShadow=true into its bucket', () => {
    const scene = new Scene()
    const mesh = namedMesh('house:cottage')
    mesh.castShadow = true
    scene.add(mesh)
    const census = censusShadowCasters(scene)
    expect(census.settlement.meshes).toBe(1)
    expect(census.settlement.instances).toBe(1)
    expect(census.settlement.drawCalls).toBe(1)
    expect(census.settlement.triangles).toBeGreaterThan(0)
  })

  it('counts InstancedMesh instances when castShadow=true', () => {
    const scene = new Scene()
    const group = new Group()
    group.name = 'chunk-vegetation-tree-living'
    const mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial(), 8)
    mesh.count = 8
    mesh.castShadow = true
    group.add(mesh)
    scene.add(group)
    const census = censusShadowCasters(scene)
    expect(census.vegetation.instancedMeshes).toBe(1)
    expect(census.vegetation.instances).toBe(8)
    expect(census.vegetation.drawCalls).toBe(1)
    expect(census.vegetation.triangles).toBeGreaterThan(0)
  })

  it('inherits classification from ancestors and fauna userData', () => {
    const scene = new Scene()
    const vegetation = new Group()
    vegetation.name = 'chunk-vegetation-bush'
    const leaf = namedMesh('leaf')
    leaf.castShadow = true
    vegetation.add(leaf)
    scene.add(vegetation)

    const fauna = namedMesh('wolf')
    fauna.userData.animalKind = 'wolf'
    fauna.castShadow = true
    scene.add(fauna)

    const census = censusShadowCasters(scene)
    expect(census.vegetation.meshes).toBe(1)
    expect(census.fauna.meshes).toBe(1)
    expect(census.other.meshes).toBe(0)
  })
})

describe('classifySettlementContent', () => {
  it('classifies house-static-batch and house-interactive by name', () => {
    const batch = new Group()
    batch.name = 'house-static-batch'
    const staticMesh = namedMesh('part')
    batch.add(staticMesh)
    expect(classifySettlementContent(staticMesh)).toBe('houseStatic')

    const interactive = new Group()
    interactive.name = 'house-interactive'
    const door = namedMesh('doorLeaf')
    interactive.add(door)
    expect(classifySettlementContent(door)).toBe('houseInteractive')
  })

  it('classifies palisade / fence instanced group names', () => {
    const group = new Group()
    group.name = 'settlement-palisade'
    const mesh = namedMesh('settlement-palisade-0')
    group.add(mesh)
    expect(classifySettlementContent(mesh)).toBe('fence')
  })

  it('prefers userData.settlementShadowKind over an ambiguous name', () => {
    const mesh = namedMesh('misc-prop')
    mesh.userData[SETTLEMENT_SHADOW_KIND_USERDATA] = 'workplace'
    expect(classifySettlementContent(mesh)).toBe('workplace')
  })

  it('classifies storageGoods tags used by food presentation piles', () => {
    const mesh = namedMesh('apple')
    mesh.userData[SETTLEMENT_SHADOW_KIND_USERDATA] = 'storageGoods'
    expect(classifySettlementContent(mesh)).toBe('storageGoods')
  })
})

describe('censusSettlementShadowCasters', () => {
  it('skips castShadow=false and non-settlement meshes', () => {
    const scene = new Scene()
    const settlement = new Group()
    settlement.name = 'settlement'

    const noShadow = namedMesh('house-static-batch:0')
    noShadow.castShadow = false
    settlement.add(noShadow)

    const terrain = namedMesh('chunk')
    terrain.castShadow = true
    scene.add(settlement)
    scene.add(terrain)

    const census = censusSettlementShadowCasters(scene)
    expect(census.houseStatic.meshes).toBe(0)
    expect(census.other.meshes).toBe(0)
  })

  it('breaks settlement shadow casters into content kinds', () => {
    const scene = new Scene()
    const settlement = new Group()
    settlement.name = 'settlement'

    const batch = new Group()
    batch.name = 'house-static-batch'
    const houseMesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial(), 4)
    houseMesh.count = 4
    houseMesh.castShadow = true
    batch.add(houseMesh)
    settlement.add(batch)

    const fence = new Group()
    fence.name = 'settlement-pasture-fence'
    const fenceMesh = namedMesh('panel')
    fenceMesh.castShadow = true
    fence.add(fenceMesh)
    settlement.add(fence)

    const tagged = namedMesh('well')
    tagged.castShadow = true
    tagged.userData[SETTLEMENT_SHADOW_KIND_USERDATA] = 'landmark'
    settlement.add(tagged)

    scene.add(settlement)

    const census = censusSettlementShadowCasters(scene)
    expect(census.houseStatic.instancedMeshes).toBe(1)
    expect(census.houseStatic.instances).toBe(4)
    expect(census.fence.meshes).toBe(1)
    expect(census.landmark.meshes).toBe(1)
    expect(census.other.meshes).toBe(0)
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
