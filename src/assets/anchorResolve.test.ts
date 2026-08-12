import { Bone, Group, Object3D, Quaternion, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import type { AssetAnchorDef } from './assetAnchors'
import { findAnchorNode, resolveAssetAnchors } from './anchorResolve'

describe('anchorResolve', () => {
  it('prefers Bone over plain Object3D for alias lists', () => {
    const root = new Group()
    const plain = new Object3D()
    plain.name = 'WristR'
    const bone = new Bone()
    bone.name = 'WristR'
    root.add(plain, bone)

    const { node, matches } = findAnchorNode(root, ['WristR'])
    expect(matches).toBe(2)
    expect(node).toBe(bone)
  })

  it('reports missing-node', () => {
    const root = new Group()
    const { anchors, issues } = resolveAssetAnchors(root, [{
      name: 'hand.right',
      node: 'MissingBone',
      space: 'node',
    }])
    expect(anchors.filter((a) => a.def.name !== 'origin')).toHaveLength(0)
    expect(issues.some((i) => i.kind === 'missing-node')).toBe(true)
  })

  it('compensates node scale for meter offsets (100x armature)', () => {
    const root = new Group()
    const socket = new Bone()
    socket.name = 'WristR'
    socket.scale.setScalar(100)
    root.add(socket)
    root.updateMatrixWorld(true)

    const def: AssetAnchorDef = {
      name: 'test',
      node: 'WristR',
      space: 'node',
      position: [0, 0.1, 0],
    }
    const { anchors } = resolveAssetAnchors(root, [def])
    const anchor = anchors.find((a) => a.def.name === 'test')
    expect(anchor).toBeDefined()
    const worldPos = new Vector3()
    anchor!.worldMatrix.decompose(worldPos, new Quaternion(), new Vector3())
    expect(worldPos.y).toBeCloseTo(0.1, 3)
  })

  it('distinguishes local vs world when instance is moved', () => {
    const root = new Group()
    root.position.set(5, 0, 2)
    root.updateMatrixWorld(true)

    const def: AssetAnchorDef = {
      name: 'mark',
      space: 'assetLocal',
      position: [1, 0, 0],
    }
    const { anchors } = resolveAssetAnchors(root, [def])
    const anchor = anchors.find((a) => a.def.name === 'mark')!
    const local = new Vector3()
    const world = new Vector3()
    anchor.localMatrix.decompose(local, new Quaternion(), new Vector3())
    anchor.worldMatrix.decompose(world, new Quaternion(), new Vector3())
    expect(local.x).toBeCloseTo(1, 3)
    expect(world.x).toBeCloseTo(6, 3)
  })

  it('always includes origin anchor', () => {
    const root = new Group()
    const { anchors } = resolveAssetAnchors(root, [])
    expect(anchors.some((a) => a.def.name === 'origin')).toBe(true)
  })
})
