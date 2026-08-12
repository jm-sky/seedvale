import { Bone, Group, Object3D, Quaternion, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { mountByAnchorPair } from './mountByAnchorPair'

describe('mountByAnchorPair', () => {
  it('aligns tool grip to character hand.right', () => {
    const character = new Group()
    const socket = new Bone()
    socket.name = 'WristR'
    socket.scale.setScalar(100)
    character.add(socket)

    const tool = new Object3D()
    tool.position.set(0.2, 0, 0)

    const mount = mountByAnchorPair({
      characterRoot: character,
      tool,
      socket,
      referenceAnchorName: 'hand.right',
      targetAnchorName: 'grip',
      characterAnchorDefs: [{
        name: 'hand.right',
        type: 'attachment',
        node: 'WristR',
        space: 'node',
        rotation: [0, 0, 0],
      }],
      toolAnchorDefs: [{
        name: 'grip',
        type: 'grip',
        space: 'assetLocal',
        position: [0.2, 0, 0],
        rotation: [0, 0, 0],
      }],
    })

    expect(mount).not.toBeNull()
    socket.updateMatrixWorld(true)
    mount!.updateMatrixWorld(true)
    tool.updateMatrixWorld(true)

    const handPos = new Vector3()
    const gripPos = new Vector3()
    socket.matrixWorld.decompose(handPos, new Quaternion(), new Vector3())
    tool.matrixWorld.decompose(gripPos, new Quaternion(), new Vector3())
    expect(gripPos.distanceTo(handPos)).toBeLessThan(0.01)
  })

  it('returns null when anchors are missing', () => {
    const character = new Group()
    const socket = new Bone()
    socket.name = 'WristR'
    character.add(socket)
    const tool = new Object3D()

    expect(mountByAnchorPair({
      characterRoot: character,
      tool,
      socket,
      referenceAnchorName: 'hand.right',
      targetAnchorName: 'grip',
      characterAnchorDefs: [],
      toolAnchorDefs: [],
    })).toBeNull()
  })
})
