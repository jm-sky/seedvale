import { describe, expect, it } from 'vitest'
import { anchorsForAsset, heldToolHasGripAnchor } from './assetAnchorData'

describe('assetAnchorData Phase 6', () => {
  it('hut_d has lamp_mount metadata', () => {
    const anchors = anchorsForAsset('house:hut_d')
    expect(anchors.some((a) => a.name === 'lamp_mount')).toBe(true)
  })

  it('no held tools use grip anchor mount until explicitly authored', () => {
    expect(heldToolHasGripAnchor('held:axe')).toBe(false)
    expect(heldToolHasGripAnchor('held:knife')).toBe(false)
  })
})
