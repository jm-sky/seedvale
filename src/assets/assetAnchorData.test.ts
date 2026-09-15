import { describe, expect, it } from 'vitest'
import {
  ADVENTURER_HAND_SPACE,
  anchorsForAsset,
  handAttachSpaceFromSocket,
  heldToolHasGripAnchor,
  UBC_HAND_FROM_WRIST_R,
  UBC_HAND_OFFSET,
  UBC_HAND_SPACE,
} from './assetAnchorData'

describe('assetAnchorData Phase 6', () => {
  it('hut_d has lamp_mount metadata', () => {
    const anchors = anchorsForAsset('house:hut_d')
    expect(anchors.some((a) => a.name === 'lamp_mount')).toBe(true)
  })

  it('shell huts have floor-center lamp_mount metadata', () => {
    for (const id of ['house:hut_a', 'house:hut_b', 'house:hut_c'] as const) {
      const anchors = anchorsForAsset(id)
      const lamp = anchors.find((a) => a.name === 'lamp_mount')
      expect(lamp?.position).toEqual([0, 0.55, 0])
    }
  })

  it('procedural well has interaction anchor metadata', () => {
    const anchors = anchorsForAsset('settlement:well')
    expect(anchors.some((a) => a.name === 'interaction')).toBe(true)
  })

  it('no held tools use grip anchor mount until explicitly authored', () => {
    expect(heldToolHasGripAnchor('held:axe')).toBe(false)
    expect(heldToolHasGripAnchor('held:knife')).toBe(false)
  })

  it('UBC character anchors share the hand_r space Euler and offset', () => {
    for (const id of ['character:ubc-peasant', 'character:ubc-ranger'] as const) {
      const hand = anchorsForAsset(id).find((a) => a.name === 'hand.right')
      expect(hand?.rotation).toEqual(UBC_HAND_FROM_WRIST_R)
      expect(hand?.position).toEqual(UBC_HAND_OFFSET)
    }
    const adventurer = anchorsForAsset('character:player').find((a) => a.name === 'hand.right')
    expect(adventurer?.rotation).toEqual(ADVENTURER_HAND_SPACE.rotation)
    expect(adventurer?.position).toEqual(ADVENTURER_HAND_SPACE.position)
  })
})

describe('handAttachSpaceFromSocket', () => {
  it('returns identity for WristR and unknown sockets', () => {
    const wrist = { name: 'WristR', parent: null }
    const pivot = { name: '', parent: wrist }
    expect(handAttachSpaceFromSocket(wrist)).toEqual(ADVENTURER_HAND_SPACE)
    expect(handAttachSpaceFromSocket(pivot)).toEqual(ADVENTURER_HAND_SPACE)
    expect(handAttachSpaceFromSocket({ name: 'Group', parent: null })).toEqual(ADVENTURER_HAND_SPACE)
  })

  it('returns the UBC remap for hand_r, including a nameless child pivot', () => {
    const bone = { name: 'hand_r', parent: null }
    const pivot = { name: '', parent: bone }
    expect(handAttachSpaceFromSocket(bone)).toEqual(UBC_HAND_SPACE)
    expect(handAttachSpaceFromSocket(pivot)).toEqual(UBC_HAND_SPACE)
  })
})
