import { describe, expect, it } from 'vitest'
import type { AssetIndexEntry } from '../../../assets/assetIndex'
import { heldPreviewKind } from './mountHeldPreview'

function heldEntry(id: string): AssetIndexEntry {
  return {
    id,
    url: `/models/items/${id.slice(5)}.glb`,
    label: id,
    group: 'held',
    prepare: { mode: 'fitMax', value: 0.5 },
    skinned: false,
    anchors: [],
  }
}

describe('heldPreviewKind', () => {
  it('maps game-held tools', () => {
    expect(heldPreviewKind(heldEntry('held:axe'))).toBe('axe')
    expect(heldPreviewKind(heldEntry('held:knife'))).toBe('knife')
    expect(heldPreviewKind(heldEntry('held:wooden_torch'))).toBe('wooden_torch')
  })

  it('maps lit branch', () => {
    expect(heldPreviewKind(heldEntry('held:branch'))).toBe('branch')
  })

  it('returns null for roadmap held tools without attach', () => {
    expect(heldPreviewKind(heldEntry('held:pitchfork'))).toBeNull()
    expect(heldPreviewKind(heldEntry('held:long_sword'))).toBeNull()
  })

  it('returns null for non-held entries', () => {
    expect(heldPreviewKind({
      ...heldEntry('item:axe'),
      id: 'item:axe',
      group: 'item',
    })).toBeNull()
    expect(heldPreviewKind(null)).toBeNull()
  })
})
