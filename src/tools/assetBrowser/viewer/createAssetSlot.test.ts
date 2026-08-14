import { Box3, Box3Helper, BoxGeometry, Color, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { boundsData, boxFromModel, collectMeshStats } from './createAssetSlot'

describe('boxFromModel', () => {
  it('measures the mesh, ignoring a sibling Box3Helper on the parent group', () => {
    const group = new Group()
    const mesh = new Mesh(new BoxGeometry(2, 3, 0.4), new MeshStandardMaterial())
    group.add(mesh)

    const helperBox = new Box3()
    helperBox.min.set(-50, -50, -50)
    helperBox.max.set(50, 50, 50)
    group.add(new Box3Helper(helperBox, new Color(0xff0000)))
    group.updateMatrixWorld(true)

    const honest = boxFromModel(mesh).getSize(new Vector3())
    const fromGroup = new Box3().setFromObject(group).getSize(new Vector3())
    expect(honest.x).toBeCloseTo(2, 5)
    expect(honest.y).toBeCloseTo(3, 5)
    expect(honest.z).toBeCloseTo(0.4, 5)
    expect(fromGroup.x).toBeGreaterThan(10)
  })
})

describe('collectMeshStats', () => {
  it('counts triangles and named materials', () => {
    const mesh = new Mesh(
      new BoxGeometry(1, 1, 1),
      new MeshStandardMaterial({ name: 'MI_Plaster' }),
    )
    const stats = collectMeshStats(mesh)
    expect(stats.materials).toEqual(['MI_Plaster'])
    expect(stats.triangles).toBeGreaterThan(0)
  })
})

describe('boundsData', () => {
  it('reports size from the given box', () => {
    const box = new Box3()
    box.min.set(0, 0, 0)
    box.max.set(2, 3.12, 0.41)
    expect(boundsData(box).size[0]).toBeCloseTo(2)
    expect(boundsData(box).size[1]).toBeCloseTo(3.12)
    expect(boundsData(box).minY).toBe(0)
  })
})
