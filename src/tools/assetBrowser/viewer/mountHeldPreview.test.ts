import { describe, expect, it } from 'vitest'
import type { AssetIndexEntry } from '../../../assets/assetIndex'
import { heldPreviewKind, provisionalHeldAttach } from './mountHeldPreview'

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

  it('maps newly wired combat/mining/farm tools', () => {
    expect(heldPreviewKind(heldEntry('held:long_sword'))).toBe('long_sword')
    expect(heldPreviewKind(heldEntry('held:pickaxe'))).toBe('pickaxe')
    expect(heldPreviewKind(heldEntry('held:pitchfork'))).toBe('pitchfork')
    expect(heldPreviewKind(heldEntry('held:sickle'))).toBe('sickle')
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

describe('provisionalHeldAttach', () => {
  it('has no remaining browser-only grips now that sword is a ToolKind', () => {
    expect(provisionalHeldAttach(heldEntry('held:long_sword'))).toBeNull()
    expect(provisionalHeldAttach(heldEntry('held:pitchfork'))).toBeNull()
  })
})
