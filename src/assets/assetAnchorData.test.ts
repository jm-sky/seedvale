import { describe, expect, it } from 'vitest'
import { anchorsForAsset, heldToolHasGripAnchor } from './assetAnchorData'

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
})
