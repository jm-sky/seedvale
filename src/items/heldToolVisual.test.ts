import { Euler, Group, Object3D, Quaternion, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { UBC_HAND_FROM_WRIST_R, UBC_HAND_OFFSET, UBC_TORCH_HAND_OFFSET } from '../assets/assetAnchorData'
import { HELD_ATTACH, findUbcLeftHandSocket, mountAttachOnSocket } from './heldToolVisual'

function expectQuatClose(actual: Quaternion, expected: Quaternion): void {
  expect(actual.x).toBeCloseTo(expected.x, 5)
  expect(actual.y).toBeCloseTo(expected.y, 5)
  expect(actual.z).toBeCloseTo(expected.z, 5)
  expect(actual.w).toBeCloseTo(expected.w, 5)
}

function authoredLongSwordQuat(): Quaternion {
  const a = HELD_ATTACH.long_sword
  return new Quaternion().setFromEuler(new Euler(a.rotation[0], a.rotation[1], a.rotation[2], 'XYZ'))
}

describe('mountAttachOnSocket hand space', () => {
  it('keeps WristR (and a child pivot) on authored HELD_ATTACH TRS', () => {
    const a = HELD_ATTACH.long_sword
    const expectedQ = authoredLongSwordQuat()

    for (const socket of [named('WristR'), pivotUnder('WristR')]) {
      const mount = new Object3D()
      mountAttachOnSocket(mount, socket, a)
      expect(mount.position.x).toBeCloseTo(a.position[0], 5)
      expect(mount.position.y).toBeCloseTo(a.position[1], 5)
      expect(mount.position.z).toBeCloseTo(a.position[2], 5)
      expectQuatClose(mount.quaternion, expectedQ)
      expect(mount.parent).toBe(socket)
    }
  })

  it('treats an unknown socket name as Adventurer identity', () => {
    const a = HELD_ATTACH.long_sword
    const socket = named('Group')
    const mount = new Object3D()
    mountAttachOnSocket(mount, socket, a)
    expect(mount.position.toArray()).toEqual([...a.position])
    expectQuatClose(mount.quaternion, authoredLongSwordQuat())
  })

  it('maps position and rotation through UBC hand_r space', () => {
    const a = HELD_ATTACH.long_sword
    const space = new Quaternion().setFromEuler(
      new Euler(UBC_HAND_FROM_WRIST_R[0], UBC_HAND_FROM_WRIST_R[1], UBC_HAND_FROM_WRIST_R[2], 'XYZ'),
    )
    const expectedPos = new Vector3(a.position[0], a.position[1], a.position[2]).applyQuaternion(space)
    expectedPos.x += UBC_HAND_OFFSET[0]
    expectedPos.y += UBC_HAND_OFFSET[1]
    expectedPos.z += UBC_HAND_OFFSET[2]
    const expectedQ = space.clone().multiply(authoredLongSwordQuat())

    for (const socket of [named('hand_r'), pivotUnder('hand_r')]) {
      const mount = new Object3D()
      mountAttachOnSocket(mount, socket, a)
      expect(mount.position.x).toBeCloseTo(expectedPos.x, 5)
      expect(mount.position.y).toBeCloseTo(expectedPos.y, 5)
      expect(mount.position.z).toBeCloseTo(expectedPos.z, 5)
      expectQuatClose(mount.quaternion, expectedQ)
    }
  })

  it('adds ubcPosition for wooden_torch on hand_l, not on WristR', () => {
    const a = HELD_ATTACH.wooden_torch
    expect(a.ubcPosition).toEqual(UBC_TORCH_HAND_OFFSET)
    const space = new Quaternion().setFromEuler(
      new Euler(UBC_HAND_FROM_WRIST_R[0], UBC_HAND_FROM_WRIST_R[1], UBC_HAND_FROM_WRIST_R[2], 'XYZ'),
    )
    const expectedUbc = new Vector3(a.position[0], a.position[1], a.position[2]).applyQuaternion(space)
    expectedUbc.x += UBC_HAND_OFFSET[0] + UBC_TORCH_HAND_OFFSET[0]
    expectedUbc.y += UBC_HAND_OFFSET[1] + UBC_TORCH_HAND_OFFSET[1]
    expectedUbc.z += UBC_HAND_OFFSET[2] + UBC_TORCH_HAND_OFFSET[2]
    const expectedQ = space.clone().multiply(
      new Quaternion().setFromEuler(new Euler(a.rotation[0], a.rotation[1], a.rotation[2], 'XYZ')),
    )

    for (const socket of [named('hand_l'), pivotUnder('hand_l')]) {
      const mount = new Object3D()
      mountAttachOnSocket(mount, socket, a)
      expect(mount.position.x).toBeCloseTo(expectedUbc.x, 5)
      expect(mount.position.y).toBeCloseTo(expectedUbc.y, 5)
      expect(mount.position.z).toBeCloseTo(expectedUbc.z, 5)
      expectQuatClose(mount.quaternion, expectedQ)
    }

    const adventurer = named('WristR')
    const mountAdv = new Object3D()
    mountAttachOnSocket(mountAdv, adventurer, a)
    expect(mountAdv.position.x).toBeCloseTo(a.position[0], 5)
    expect(mountAdv.position.y).toBeCloseTo(a.position[1], 5)
    expect(mountAdv.position.z).toBeCloseTo(a.position[2], 5)
  })
})

describe('findUbcLeftHandSocket', () => {
  it('matches hand_l and ignores WristL', () => {
    const ubc = named('root')
    const left = named('hand_l')
    ubc.add(left)
    expect(findUbcLeftHandSocket(ubc)).toBe(left)

    const adventurer = named('root')
    adventurer.add(named('WristL'))
    expect(findUbcLeftHandSocket(adventurer)).toBeNull()
  })
})

function named(name: string): Object3D {
  const node = new Object3D()
  node.name = name
  return node
}

function pivotUnder(boneName: string): Group {
  const bone = named(boneName)
  const pivot = new Group()
  bone.add(pivot)
  return pivot
}
